#!/usr/bin/env node
'use strict';

/**
 * Testa lib/feriados-nacionais.js — item 5 do briefing Onda 1.6 (fim de
 * semana e feriado não podem disparar alerta crítico de saúde).
 */

const assert = require('assert');
const feriados = require('../lib/feriados-nacionais');

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
  console.log('\n=== feriados-nacionais.test.js ===\n');
  let passed = 0;
  let failed = 0;

  const tests = [
    ['calcularPascoa acerta datas públicas conhecidas (2024, 2025, 2026)', () => {
      assert.strictEqual(feriados.calcularPascoa(2024).toDateString(), new Date(2024, 2, 31).toDateString());
      assert.strictEqual(feriados.calcularPascoa(2025).toDateString(), new Date(2025, 3, 20).toDateString());
      assert.strictEqual(feriados.calcularPascoa(2026).toDateString(), new Date(2026, 3, 5).toDateString());
    }],

    ['calcularPascoa sempre cai num domingo', () => {
      for (const ano of [2023, 2024, 2025, 2026, 2027, 2028, 2030]) {
        assert.strictEqual(feriados.calcularPascoa(ano).getDay(), 0, `Páscoa de ${ano} não caiu num domingo`);
      }
    }],

    ['ehFeriadoNacional reconhece feriados fixos (Natal, Independência, Tiradentes)', () => {
      assert.strictEqual(feriados.ehFeriadoNacional(new Date(2026, 11, 25)), true); // Natal
      assert.strictEqual(feriados.ehFeriadoNacional(new Date(2026, 8, 7)), true); // Independência
      assert.strictEqual(feriados.ehFeriadoNacional(new Date(2026, 3, 21)), true); // Tiradentes
    }],

    ['ehFeriadoNacional reconhece feriados móveis derivados da Páscoa de 2026 (05/04)', () => {
      // Páscoa 2026 = 05/04 -> Sexta Santa = 03/04, Carnaval = 17/02, Corpus Christi = 04/06
      assert.strictEqual(feriados.ehFeriadoNacional(new Date(2026, 3, 3)), true); // Sexta-feira Santa
      assert.strictEqual(feriados.ehFeriadoNacional(new Date(2026, 1, 17)), true); // Carnaval
      assert.strictEqual(feriados.ehFeriadoNacional(new Date(2026, 5, 4)), true); // Corpus Christi
    }],

    ['ehFeriadoNacional retorna false para dia útil comum (12/08/2026)', () => {
      assert.strictEqual(feriados.ehFeriadoNacional(new Date(2026, 7, 12)), false);
    }],

    ['ehFimDeSemana reconhece sábado e domingo, não dia útil', () => {
      assert.strictEqual(feriados.ehFimDeSemana(new Date(2026, 7, 8)), true); // sábado 08/08/2026
      assert.strictEqual(feriados.ehFimDeSemana(new Date(2026, 7, 9)), true); // domingo 09/08/2026
      assert.strictEqual(feriados.ehFimDeSemana(new Date(2026, 7, 12)), false); // quarta 12/08/2026
    }],

    ['diaSemPublicacaoEsperada é true pra fim de semana OU feriado, false pra dia útil comum', () => {
      assert.strictEqual(feriados.diaSemPublicacaoEsperada(new Date(2026, 7, 8)), true); // sábado
      assert.strictEqual(feriados.diaSemPublicacaoEsperada(new Date(2026, 11, 25)), true); // Natal (sexta em 2026)
      assert.strictEqual(feriados.diaSemPublicacaoEsperada(new Date(2026, 7, 12)), false); // quarta comum
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
