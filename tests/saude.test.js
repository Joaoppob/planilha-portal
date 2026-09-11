#!/usr/bin/env node
'use strict';

/**
 * Testa lib/saude.js — requisito duro do briefing Onda 1.5, item 3:
 * "0 itens relevantes" precisa ser DISTINGUÍVEL de "coletor quebrado".
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const saude = require('../lib/saude');

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    return true;
  } catch (error) {
    console.log(`  ✗ ${name}`);
    console.error(`    ${error.message}`);
    return false;
  }
}

function novoCaminhoTemp() {
  return path.join(os.tmpdir(), `radar-saude-test-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`);
}

function main() {
  console.log('\n=== saude.test.js ===\n');
  let passed = 0;
  let failed = 0;

  const tests = [
    ['avaliar(): erro na requisição é sempre crítico, mesmo com volumeBruto preenchido', () => {
      const r = saude.avaliar({ volumeBruto: 500, erro: 'HTTP 500' });
      assert.strictEqual(r.nivel, 'critico');
      assert.strictEqual(r.ok, false);
      assert.match(r.motivo, /requisição falhou/);
    }],

    ['avaliar(): volumeBruto zero é crítico — nunca confundido com "0 vagas hoje"', () => {
      const r = saude.avaliar({ volumeBruto: 0, erro: null });
      assert.strictEqual(r.nivel, 'critico');
      assert.strictEqual(r.ok, false);
      assert.match(r.motivo, /volume bruto zero/);
    }],

    ['avaliar(): volumeBruto null/undefined também é crítico', () => {
      assert.strictEqual(saude.avaliar({ volumeBruto: null, erro: null }).nivel, 'critico');
      assert.strictEqual(saude.avaliar({ volumeBruto: undefined, erro: null }).nivel, 'critico');
    }],

    // Item 5 do briefing Onda 1.6: "0 publicações num sábado/feriado" é o
    // comportamento NORMAL do DOU, não pode virar alerta crítico — senão o
    // radar grita toda semana e JB silencia o canal.
    ['avaliar(): volumeBruto zero num sábado NÃO é crítico (dia sem publicação esperada)', () => {
      const r = saude.avaliar({ volumeBruto: 0, erro: null, dataAlvo: '08-08-2026' }); // sábado
      assert.strictEqual(r.nivel, 'ok');
      assert.strictEqual(r.ok, true);
      assert.match(r.motivo, /sem publicação esperada/);
    }],

    ['avaliar(): volumeBruto zero num feriado nacional NÃO é crítico', () => {
      const r = saude.avaliar({ volumeBruto: 0, erro: null, dataAlvo: '25-12-2026' }); // Natal
      assert.strictEqual(r.nivel, 'ok');
    }],

    ['avaliar(): volumeBruto zero num dia útil comum continua crítico (com dataAlvo presente)', () => {
      const r = saude.avaliar({ volumeBruto: 0, erro: null, dataAlvo: '12-08-2026' }); // quarta-feira comum
      assert.strictEqual(r.nivel, 'critico');
    }],

    ['avaliar(): erro na requisição continua crítico mesmo num fim de semana (falha real não se confunde com silêncio esperado)', () => {
      const r = saude.avaliar({ volumeBruto: null, erro: 'HTTP 500', dataAlvo: '08-08-2026' });
      assert.strictEqual(r.nivel, 'critico');
      assert.match(r.motivo, /requisição falhou/);
    }],

    ['avaliar(): volumeBruto zero sem dataAlvo decifrável fica crítico (lado seguro)', () => {
      const r = saude.avaliar({ volumeBruto: 0, erro: null, dataAlvo: 'lixo-invalido' });
      assert.strictEqual(r.nivel, 'critico');
    }],

    ['avaliar(): volumeBruto abaixo da faixa mínima é "atencao", não "critico"', () => {
      const r = saude.avaliar({ volumeBruto: 300, erro: null, faixaMin: 1000 });
      assert.strictEqual(r.nivel, 'atencao');
      assert.strictEqual(r.ok, false);
      assert.match(r.motivo, /abaixo da faixa normal/);
    }],

    ['avaliar(): volumeBruto normal, sem faixaMin configurado, é ok', () => {
      const r = saude.avaliar({ volumeBruto: 2100, erro: null });
      assert.strictEqual(r.nivel, 'ok');
      assert.strictEqual(r.ok, true);
      assert.strictEqual(r.motivo, null);
    }],

    ['avaliar(): volumeBruto acima da faixaMin é ok', () => {
      const r = saude.avaliar({ volumeBruto: 1500, erro: null, faixaMin: 1000 });
      assert.strictEqual(r.nivel, 'ok');
    }],

    ['registrar()/carregarTudo() fazem round-trip e carimbam registrado_em', () => {
      const p = novoCaminhoTemp();
      const gravado = saude.registrar({ fonte: 'dou', dataAlvo: '12-08-2026', volumeBruto: 2000, nivel: 'ok', motivo: null }, p);
      assert.ok(gravado.registrado_em);
      const todos = saude.carregarTudo(p);
      assert.strictEqual(todos.length, 1);
      assert.strictEqual(todos[0].fonte, 'dou');
      assert.strictEqual(todos[0].volumeBruto, 2000);
      fs.unlinkSync(p);
    }],

    ['ultimoRegistro() retorna o registro mais recente por fonte', () => {
      const p = novoCaminhoTemp();
      saude.registrar({ fonte: 'dou', dataAlvo: '10-08-2026', volumeBruto: 1900, nivel: 'ok', motivo: null }, p);
      saude.registrar({ fonte: 'dou', dataAlvo: '11-08-2026', volumeBruto: 0, nivel: 'critico', motivo: 'volume bruto zero' }, p);
      const ultimo = saude.ultimoRegistro('dou', p);
      assert.strictEqual(ultimo.dataAlvo, '11-08-2026');
      assert.strictEqual(ultimo.nivel, 'critico');
      fs.unlinkSync(p);
    }],

    ['ultimoRegistro() retorna null quando a fonte nunca foi coletada', () => {
      const p = novoCaminhoTemp();
      saude.registrar({ fonte: 'dou', dataAlvo: '10-08-2026', volumeBruto: 1900, nivel: 'ok', motivo: null }, p);
      assert.strictEqual(saude.ultimoRegistro('fonte-inexistente', p), null);
      fs.unlinkSync(p);
    }]
  ];

  for (const [name, fn] of tests) {
    if (runTest(name, fn)) passed++;
    else failed++;
  }

  console.log(`\n${passed} passou(aram), ${failed} falhou(aram)\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
