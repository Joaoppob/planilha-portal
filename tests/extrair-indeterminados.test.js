#!/usr/bin/env node
'use strict';

/**
 * Testa lib/extrair-indeterminados.js — só a parte pura (aplicarCamposExtraidos).
 * Onda 2.1, item 2 do briefing: wiring do extrator LLM (já testado em
 * lib/extrator-llm.js) contra os registros `indeterminada` do store.
 */

const assert = require('assert');
const extrairIndeterminados = require('../lib/extrair-indeterminados');

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
  console.log('\n=== extrair-indeterminados.test.js ===\n');
  let passed = 0;
  let failed = 0;

  const registroBase = {
    titulacao_exigida: null,
    area: null,
    subarea: null,
    campus: null,
    vagas: null,
    regime: null,
    inscricao_inicio: null,
    inscricao_fim: null
  };

  const tests = [
    ['aplicarCamposExtraidos: campo com certeza e registro null -> entra no patch', () => {
      const campos = { ...registroBase, titulacao_exigida: { valor: 'mestrado', proveniencia: 'llm' } };
      const patch = extrairIndeterminados.aplicarCamposExtraidos(registroBase, campos);
      assert.strictEqual(patch.titulacao_exigida, 'mestrado');
    }],

    ['aplicarCamposExtraidos: campo com proveniencia "ausente" (LLM não teve certeza) -> nunca entra no patch', () => {
      const campos = { ...registroBase, titulacao_exigida: { valor: null, proveniencia: 'ausente' } };
      const patch = extrairIndeterminados.aplicarCamposExtraidos(registroBase, campos);
      assert.ok(!('titulacao_exigida' in patch));
    }],

    ['aplicarCamposExtraidos: registro que JÁ tinha valor confiável NUNCA é sobrescrito, mesmo com certeza do LLM', () => {
      const registroComCampus = { ...registroBase, campus: 'Sorocaba (já resolvido pelo regex)' };
      const campos = { ...registroBase, campus: { valor: 'Outro campus qualquer', proveniencia: 'llm' } };
      const patch = extrairIndeterminados.aplicarCamposExtraidos(registroComCampus, campos);
      assert.ok(!('campus' in patch), 'nunca deveria sobrescrever campus já confiável');
    }],

    ['aplicarCamposExtraidos: mistura — só os campos certos e ausentes entram, campo a campo', () => {
      const campos = {
        titulacao_exigida: { valor: 'graduacao', proveniencia: 'llm' },
        area: { valor: null, proveniencia: 'ausente' },
        subarea: { valor: null, proveniencia: 'ausente' },
        campus: { valor: 'Cristalina', proveniencia: 'llm' },
        vagas: { valor: 2, proveniencia: 'llm' },
        regime: { valor: null, proveniencia: 'ausente' },
        inscricao_inicio: { valor: null, proveniencia: 'ausente' },
        inscricao_fim: { valor: '2026-09-01', proveniencia: 'llm' }
      };
      const patch = extrairIndeterminados.aplicarCamposExtraidos(registroBase, campos);
      assert.deepStrictEqual(Object.keys(patch).sort(), ['campus', 'inscricao_fim', 'titulacao_exigida', 'vagas']);
    }],

    ['aplicarCamposExtraidos: registro sem nenhum campo aplicável -> patch vazio, nunca quebra', () => {
      const patch = extrairIndeterminados.aplicarCamposExtraidos(registroBase, {});
      assert.deepStrictEqual(patch, {});
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
