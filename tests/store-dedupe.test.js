#!/usr/bin/env node
'use strict';

/**
 * Testa dedupe do store — requisito mínimo do briefing: "o mesmo edital
 * nunca notifica duas vezes". Usa arquivo temporário isolado, nunca toca em
 * data/store.jsonl real.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const store = require('../lib/store');
const { montarRegistro } = require('../lib/schema');
const { gerarId } = require('../lib/hash');

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

function novoStorePathTemp() {
  return path.join(os.tmpdir(), `radar-store-test-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`);
}

function registroBase() {
  const dados = {
    fonte: 'dou',
    orgao: 'Universidade Federal de Alfenas',
    area: 'Design',
    data_publicacao: '2026-08-12',
    url: 'https://www.in.gov.br/web/dou/-/exemplo-1'
  };
  return montarRegistro({ ...dados, id: gerarId(dados) });
}

function main() {
  console.log('\n=== store-dedupe.test.js ===\n');
  let passed = 0;
  let failed = 0;

  const tests = [
    ['salvar() grava um registro novo', () => {
      const p = novoStorePathTemp();
      const registro = registroBase();
      const resultado = store.salvar(registro, p);
      assert.strictEqual(resultado.novo, true);
      assert.deepStrictEqual(store.carregarTudo(p).length, 1);
      fs.unlinkSync(p);
    }],

    ['salvar() com mesmo id não duplica (dedupe)', () => {
      const p = novoStorePathTemp();
      const registro = registroBase();
      store.salvar(registro, p);
      const resultado2 = store.salvar(registro, p);
      assert.strictEqual(resultado2.novo, false);
      assert.strictEqual(store.carregarTudo(p).length, 1);
      fs.unlinkSync(p);
    }],

    ['salvar() com id diferente grava os dois', () => {
      const p = novoStorePathTemp();
      const r1 = registroBase();
      const r2 = montarRegistro({ ...r1, id: gerarId({ orgao: r1.orgao, area: r1.area, data_publicacao: r1.data_publicacao, url: r1.url + '-outro' }) });
      store.salvar(r1, p);
      store.salvar(r2, p);
      assert.strictEqual(store.carregarTudo(p).length, 2);
      fs.unlinkSync(p);
    }],

    ['salvar() de um registro já existente não sobrescreve campos já preenchidos (ex.: notificado)', () => {
      const p = novoStorePathTemp();
      const registro = registroBase();
      store.salvar(registro, p);
      store.atualizar(registro.id, { notificado: true }, p);
      // tenta "recoletar" o mesmo edital
      store.salvar(registro, p);
      const salvo = store.listar(r => r.id === registro.id, p)[0];
      assert.strictEqual(salvo.notificado, true);
      fs.unlinkSync(p);
    }],

    ['atualizar() aplica patch e persiste', () => {
      const p = novoStorePathTemp();
      const registro = registroBase();
      store.salvar(registro, p);
      store.atualizar(registro.id, { score: 77, veredito: 'elegivel_agora' }, p);
      const salvo = store.listar(r => r.id === registro.id, p)[0];
      assert.strictEqual(salvo.score, 77);
      assert.strictEqual(salvo.veredito, 'elegivel_agora');
      fs.unlinkSync(p);
    }],

    ['listar() com filtro de pendentes de notificação exclui já notificados', () => {
      const p = novoStorePathTemp();
      const r1 = registroBase();
      const r2 = montarRegistro({ ...r1, id: gerarId({ orgao: r1.orgao, area: r1.area, data_publicacao: r1.data_publicacao, url: r1.url + '-2' }) });
      store.salvar(r1, p);
      store.salvar(r2, p);
      store.atualizar(r1.id, { score: 50, veredito: 'elegivel_agora', notificado: true }, p);
      store.atualizar(r2.id, { score: 60, veredito: 'elegivel_agora' }, p);
      const pendentes = store.listar(r => r.score !== null && r.veredito !== 'fora' && !r.notificado, p);
      assert.strictEqual(pendentes.length, 1);
      assert.strictEqual(pendentes[0].id, r2.id);
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
