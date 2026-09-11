#!/usr/bin/env node
'use strict';

/**
 * Testa lib/backfill-progresso.js — requisito do briefing Onda 1.5, item 1:
 * "se interromper, continua de onde parou — não recomeçar 365 dias".
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const backfillProgresso = require('../lib/backfill-progresso');

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
  return path.join(os.tmpdir(), `radar-backfill-progresso-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
}

function main() {
  console.log('\n=== backfill-progresso.test.js ===\n');
  let passed = 0;
  let failed = 0;

  const tests = [
    ['carregar() sem arquivo salvo retorna estado novo (ultimaDataProcessada null)', () => {
      const p = novoCaminhoTemp();
      const estado = backfillProgresso.carregar('12-08-2025', '12-08-2026', p);
      assert.strictEqual(estado.ultimaDataProcessada, null);
      assert.strictEqual(estado.concluido, false);
      assert.strictEqual(estado.de, '12-08-2025');
      assert.strictEqual(estado.ate, '12-08-2026');
    }],

    ['marcarProcessada() grava a última data processada e persiste no disco', () => {
      const p = novoCaminhoTemp();
      const estado = backfillProgresso.carregar('01-01-2026', '31-01-2026', p);
      backfillProgresso.marcarProcessada(estado, '01-01-2026', {}, p);
      backfillProgresso.marcarProcessada(estado, '02-01-2026', {}, p);

      const relido = JSON.parse(fs.readFileSync(p, 'utf8'));
      assert.strictEqual(relido.ultimaDataProcessada, '02-01-2026');
      fs.unlinkSync(p);
    }],

    ['carregar() com o MESMO intervalo retoma do estado salvo (simula interrupção e retomada)', () => {
      const p = novoCaminhoTemp();
      const estado1 = backfillProgresso.carregar('01-01-2026', '31-01-2026', p);
      backfillProgresso.marcarProcessada(estado1, '01-01-2026', {}, p);
      backfillProgresso.marcarProcessada(estado1, '02-01-2026', {}, p);
      backfillProgresso.marcarProcessada(estado1, '03-01-2026', {}, p);
      // "reinicia o processo" — carrega de novo com o mesmo intervalo
      const estado2 = backfillProgresso.carregar('01-01-2026', '31-01-2026', p);
      assert.strictEqual(estado2.ultimaDataProcessada, '03-01-2026', 'deveria retomar de onde parou, não do zero');
      fs.unlinkSync(p);
    }],

    ['carregar() com intervalo DIFERENTE do salvo começa do zero (não mistura backfills)', () => {
      const p = novoCaminhoTemp();
      const estado1 = backfillProgresso.carregar('01-01-2026', '31-01-2026', p);
      backfillProgresso.marcarProcessada(estado1, '15-01-2026', {}, p);

      const estado2 = backfillProgresso.carregar('01-06-2026', '30-06-2026', p);
      assert.strictEqual(estado2.ultimaDataProcessada, null, 'intervalo novo não deveria herdar progresso do intervalo antigo');
      fs.unlinkSync(p);
    }],

    ['marcarProcessada() com erro acumula na lista de erros sem perder ultimaDataProcessada', () => {
      const p = novoCaminhoTemp();
      const estado = backfillProgresso.carregar('01-01-2026', '31-01-2026', p);
      backfillProgresso.marcarProcessada(estado, '05-01-2026', { erro: 'HTTP 500 simulado' }, p);
      const relido = JSON.parse(fs.readFileSync(p, 'utf8'));
      assert.strictEqual(relido.ultimaDataProcessada, '05-01-2026');
      assert.strictEqual(relido.erros.length, 1);
      assert.strictEqual(relido.erros[0].data, '05-01-2026');
      fs.unlinkSync(p);
    }],

    ['marcarConcluido() marca concluido=true e persiste', () => {
      const p = novoCaminhoTemp();
      const estado = backfillProgresso.carregar('01-01-2026', '02-01-2026', p);
      backfillProgresso.marcarConcluido(estado, p);
      const relido = JSON.parse(fs.readFileSync(p, 'utf8'));
      assert.strictEqual(relido.concluido, true);
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
