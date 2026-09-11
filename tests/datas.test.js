#!/usr/bin/env node
'use strict';

/**
 * Testa lib/datas.js — helpers de data do backfill (item 1 do briefing
 * Onda 1.5).
 */

const assert = require('assert');
const datas = require('../lib/datas');

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

function main() {
  console.log('\n=== datas.test.js ===\n');
  let passed = 0;
  let failed = 0;

  const tests = [
    ['parseDataBR converte DD-MM-AAAA em Date correto', () => {
      const d = datas.parseDataBR('12-08-2026');
      assert.strictEqual(d.getDate(), 12);
      assert.strictEqual(d.getMonth(), 7);
      assert.strictEqual(d.getFullYear(), 2026);
    }],

    ['parseDataBR rejeita formato inválido', () => {
      assert.throws(() => datas.parseDataBR('2026-08-12'));
      assert.throws(() => datas.parseDataBR('não é data'));
    }],

    ['parseDataBR rejeita dia/mês fora do calendário (ex.: 31-04)', () => {
      assert.throws(() => datas.parseDataBR('31-04-2026'));
      assert.throws(() => datas.parseDataBR('29-02-2027')); // 2027 não é bissexto
    }],

    ['formatarDataBR é o inverso de parseDataBR', () => {
      const original = '05-01-2026';
      assert.strictEqual(datas.formatarDataBR(datas.parseDataBR(original)), original);
    }],

    ['gerarIntervaloDatas de um único dia retorna array com 1 item', () => {
      const r = datas.gerarIntervaloDatas('10-08-2026', '10-08-2026');
      assert.deepStrictEqual(r, ['10-08-2026']);
    }],

    ['gerarIntervaloDatas cobre virada de mês corretamente', () => {
      const r = datas.gerarIntervaloDatas('30-08-2026', '02-09-2026');
      assert.deepStrictEqual(r, ['30-08-2026', '31-08-2026', '01-09-2026', '02-09-2026']);
    }],

    ['gerarIntervaloDatas lança erro quando --de é depois de --ate', () => {
      assert.throws(() => datas.gerarIntervaloDatas('15-08-2026', '10-08-2026'));
    }],

    ['gerarIntervaloDatas de 12 meses produz ~365/366 dias sem gaps nem duplicatas', () => {
      const r = datas.gerarIntervaloDatas('12-08-2025', '12-08-2026');
      assert.ok(r.length >= 365 && r.length <= 366, `esperado 365-366, veio ${r.length}`);
      assert.strictEqual(new Set(r).size, r.length, 'não deveria ter datas duplicadas');
    }],

    ['ehFimDeSemana concorda com Date.getDay() nativo em 14 dias seguidos', () => {
      const inicio = datas.parseDataBR('01-03-2026');
      for (let i = 0; i < 14; i++) {
        const d = new Date(inicio);
        d.setDate(d.getDate() + i);
        const dataBR = datas.formatarDataBR(d);
        const esperado = d.getDay() === 0 || d.getDay() === 6;
        assert.strictEqual(datas.ehFimDeSemana(dataBR), esperado, `falhou em ${dataBR}`);
      }
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
