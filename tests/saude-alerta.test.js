#!/usr/bin/env node
'use strict';

/**
 * PROVA do requisito duro do briefing Onda 1.5, item 3: "Teste que prove o
 * comportamento: coleta com resposta vazia/erro simulado DEVE gerar
 * alerta." Testa lib/saude-alerta.js de ponta a ponta (avaliação + registro
 * + disparo do alerta via telegram.enviar em dry-run — sem rede real).
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { avaliarRegistrarEAlertar } = require('../lib/saude-alerta');
const saude = require('../lib/saude');

function runTest(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`  ✓ ${name}`);
      return true;
    })
    .catch(error => {
      console.log(`  ✗ ${name}`);
      console.error(`    ${error.message}`);
      return false;
    });
}

function novoCaminhoTemp() {
  return path.join(os.tmpdir(), `radar-saude-alerta-test-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`);
}

async function main() {
  console.log('\n=== saude-alerta.test.js ===\n');
  let passed = 0;
  let failed = 0;

  const tests = [
    ['coleta com volume bruto ZERO (resposta vazia simulada) DEVE gerar alerta', async () => {
      const p = novoCaminhoTemp();
      const { avaliacao, alertaEnviado } = await avaliarRegistrarEAlertar({
        fonte: 'dou',
        dataAlvo: '12-08-2026',
        volumeBruto: 0,
        erro: null,
        alertar: true,
        dryRun: true, // nunca bate rede real no teste
        saudePath: p
      });
      assert.strictEqual(avaliacao.nivel, 'critico');
      assert.ok(alertaEnviado, 'alerta deveria ter sido disparado (não null)');
      assert.strictEqual(alertaEnviado.dryRun, true);

      const log = saude.carregarTudo(p);
      assert.strictEqual(log.length, 1);
      assert.strictEqual(log[0].nivel, 'critico');
      fs.unlinkSync(p);
    }],

    ['coleta com ERRO de requisição simulado DEVE gerar alerta', async () => {
      const p = novoCaminhoTemp();
      const { avaliacao, alertaEnviado } = await avaliarRegistrarEAlertar({
        fonte: 'dou',
        dataAlvo: '13-08-2026',
        volumeBruto: null,
        erro: 'HTTP 503 simulado (WAF/timeout)',
        alertar: true,
        dryRun: true,
        saudePath: p
      });
      assert.strictEqual(avaliacao.nivel, 'critico');
      assert.ok(alertaEnviado, 'alerta deveria ter sido disparado (não null)');
      fs.unlinkSync(p);
    }],

    ['coleta SAUDÁVEL (volume normal, sem erro) NÃO gera alerta', async () => {
      const p = novoCaminhoTemp();
      const { avaliacao, alertaEnviado } = await avaliarRegistrarEAlertar({
        fonte: 'dou',
        dataAlvo: '14-08-2026',
        volumeBruto: 2200,
        erro: null,
        alertar: true,
        dryRun: true,
        saudePath: p
      });
      assert.strictEqual(avaliacao.nivel, 'ok');
      assert.strictEqual(alertaEnviado, null, 'não deveria disparar alerta em coleta saudável');
      fs.unlinkSync(p);
    }],

    ['registra saúde mesmo quando alertar=false (uso no backfill) — mas não dispara alerta', async () => {
      const p = novoCaminhoTemp();
      const { avaliacao, alertaEnviado } = await avaliarRegistrarEAlertar({
        fonte: 'dou',
        dataAlvo: '15-08-2025',
        volumeBruto: 0,
        erro: null,
        alertar: false,
        dryRun: true,
        saudePath: p
      });
      assert.strictEqual(avaliacao.nivel, 'critico', 'ainda registra crítico no log');
      assert.strictEqual(alertaEnviado, null, 'mas não dispara telegram quando alertar=false');
      const log = saude.carregarTudo(p);
      assert.strictEqual(log.length, 1);
      fs.unlinkSync(p);
    }],

    ['volume abaixo da faixa mínima (não zero) gera alerta de ATENÇÃO, distinto do crítico', async () => {
      const p = novoCaminhoTemp();
      const { avaliacao, alertaEnviado } = await avaliarRegistrarEAlertar({
        fonte: 'dou',
        dataAlvo: '16-08-2026',
        volumeBruto: 400,
        erro: null,
        faixaMin: 1000,
        alertar: true,
        dryRun: true,
        saudePath: p
      });
      assert.strictEqual(avaliacao.nivel, 'atencao');
      assert.ok(alertaEnviado);
      fs.unlinkSync(p);
    }]
  ];

  for (const [name, fn] of tests) {
    if (await runTest(name, fn)) passed++;
    else failed++;
  }

  console.log(`\n${passed} passou(aram), ${failed} falhou(aram)\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
