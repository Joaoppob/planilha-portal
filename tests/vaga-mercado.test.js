#!/usr/bin/env node
'use strict';

/**
 * Testa o estágio 1 da trilha mercado (lib/vaga-mercado.js) contra os 3
 * casos reais capturados em tests/fixtures/gupy-itens-reais.json — um item
 * válido, um "banco de talentos" (deve rejeitar) e um item de vaga
 * internacional (deve rejeitar). Mesmo espírito de tests/vaga-docente.test.js.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vagaMercado = require('../lib/vaga-mercado');

const itensReais = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'gupy-itens-reais.json'), 'utf8'));

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
  console.log('\n=== vaga-mercado.test.js ===\n');
  let passed = 0;
  let failed = 0;

  const tests = [
    ['aceita vaga real válida (Akiyama, Brasil, type efetivo)', () => {
      assert.strictEqual(vagaMercado.pareceVagaMercado(itensReais.normal), true);
    }],

    ['rejeita "banco de talentos" (item real: type=vacancy_type_talent_pool)', () => {
      assert.strictEqual(itensReais.talentPool.type, 'vacancy_type_talent_pool', 'pré-condição: fixture mudou');
      assert.strictEqual(vagaMercado.pareceVagaMercado(itensReais.talentPool), false);
    }],

    ['rejeita vaga internacional (item real: country=Colômbia)', () => {
      assert.notStrictEqual(itensReais.estrangeira.country, 'Brasil', 'pré-condição: fixture mudou');
      assert.strictEqual(vagaMercado.pareceVagaMercado(itensReais.estrangeira), false);
    }],

    ['aceita quando country está ausente (benefício da dúvida — nunca rejeita por omissão)', () => {
      const item = { ...itensReais.normal, country: undefined };
      assert.strictEqual(vagaMercado.pareceVagaMercado(item), true);
    }],

    ['rejeita item sem name/jobUrl/careerPageName (campo mínimo ausente)', () => {
      assert.strictEqual(vagaMercado.pareceVagaMercado({ ...itensReais.normal, name: '' }), false);
      assert.strictEqual(vagaMercado.pareceVagaMercado({ ...itensReais.normal, jobUrl: null }), false);
      assert.strictEqual(vagaMercado.pareceVagaMercado({ ...itensReais.normal, careerPageName: null }), false);
    }],

    ['rawItem nulo/indefinido não quebra e retorna false', () => {
      assert.strictEqual(vagaMercado.pareceVagaMercado(null), false);
      assert.strictEqual(vagaMercado.pareceVagaMercado(undefined), false);
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
