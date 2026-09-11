#!/usr/bin/env node
'use strict';

/**
 * Testa lib/schema.js — cobertura mínima: `extracao` é o único campo novo
 * desta onda (item 1 do briefing Onda 1.7), montarRegistro nunca inventa
 * valor pra campo ausente (contrato geral do schema, não só o campo novo).
 */

const assert = require('assert');
const schema = require('../lib/schema');

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
  console.log('\n=== schema.test.js ===\n');
  let passed = 0;
  let failed = 0;

  const tests = [
    ['extracao está em CAMPOS_MINIMOS', () => {
      assert.ok(schema.CAMPOS_MINIMOS.includes('extracao'));
    }],

    ['montarRegistro: extracao ausente vira null (não inventa)', () => {
      const r = schema.montarRegistro({ orgao: 'X' });
      assert.strictEqual(r.extracao, null);
    }],

    ['montarRegistro: extracao explícito é preservado', () => {
      const r = schema.montarRegistro({ orgao: 'X', extracao: 'formato_nao_reconhecido' });
      assert.strictEqual(r.extracao, 'formato_nao_reconhecido');
    }],

    ['montarRegistro: campo ausente qualquer vira null, nunca undefined', () => {
      const r = schema.montarRegistro({});
      for (const campo of schema.CAMPOS_MINIMOS) {
        if (campo === 'id') continue; // id é responsabilidade de quem chama (lib/hash.js), fora do escopo deste teste
        assert.notStrictEqual(r[campo], undefined, `${campo} não deveria ficar undefined`);
      }
    }],

    // Onda 4 (ProgramaThor — ver README §Trilha mercado): stack/tipo_contrato/
    // faixa_salarial são campos novos, trilha mercado, só o ProgramaThor
    // preenche por ora. `stack` segue o padrão array-vazio (não null) de
    // keywords_matched/campos_llm; os outros dois são string|null como
    // qualquer campo simples do schema.
    ['stack/tipo_contrato/faixa_salarial estão em CAMPOS_MINIMOS', () => {
      assert.ok(schema.CAMPOS_MINIMOS.includes('stack'));
      assert.ok(schema.CAMPOS_MINIMOS.includes('tipo_contrato'));
      assert.ok(schema.CAMPOS_MINIMOS.includes('faixa_salarial'));
    }],

    ['montarRegistro: stack ausente vira [] (nunca null, mesmo padrão de keywords_matched)', () => {
      const r = schema.montarRegistro({ orgao: 'X' });
      assert.deepStrictEqual(r.stack, []);
    }],

    ['montarRegistro: stack explícito é preservado', () => {
      const r = schema.montarRegistro({ orgao: 'X', stack: ['Python', 'React'] });
      assert.deepStrictEqual(r.stack, ['Python', 'React']);
    }],

    ['montarRegistro: tipo_contrato/faixa_salarial ausentes viram null (nunca inventa)', () => {
      const r = schema.montarRegistro({ orgao: 'X' });
      assert.strictEqual(r.tipo_contrato, null);
      assert.strictEqual(r.faixa_salarial, null);
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
