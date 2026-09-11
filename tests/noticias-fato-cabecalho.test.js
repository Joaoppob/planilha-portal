#!/usr/bin/env node
'use strict';

/**
 * O CONTRATO DA ABA DE FATO — `noticias.js FATO_CABECALHO` + `montarLinhasFato`.
 *
 * Onda 7 (radar-crm-20-ondas.md, correção C2): duas colunas novas, `faixa`
 * e `posicao`, entram SEMPRE NO FIM (regra dura de `noticias.js:65-69`) —
 * o bloco vai de A a K agora (era A a I). `_norman/formulas.js nfLetra`
 * deriva a LETRA pelo ÍNDICE nesta lista; inserir no meio deslocaria toda
 * fórmula de leitura em silêncio. Este arquivo trava a forma do contrato,
 * não o cálculo de `faixa`/`posicao` em si (isso é
 * `tests/noticias-faixas-cascata.test.js`).
 */

const assert = require('assert');
const { FATO_CABECALHO, montarLinhasFato } = require('../noticias');

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
  console.log('\n=== noticias-fato-cabecalho.test.js ===\n');
  let passed = 0;
  let failed = 0;

  const tests = [
    [
      '`faixa` e `posicao` entram NO FIM de FATO_CABECALHO — 11 colunas (era 9)',
      () => {
        assert.strictEqual(FATO_CABECALHO.length, 11, 'A..I (9) + faixa + posicao (2) = 11 (A..K)');
        assert.deepStrictEqual(FATO_CABECALHO.slice(-2), ['faixa', 'posicao']);
        assert.deepStrictEqual(
          FATO_CABECALHO.slice(0, 9),
          ['titulo', 'veiculo', 'link', 'quando', 'aba', 'tabela', 'n_veiculos', 'score', 'cluster_id'],
          'as 9 colunas originais continuam na MESMA ordem — coluna nova nunca desloca as antigas'
        );
      }
    ],

    [
      '`posicao` (última coluna) cai no índice 10 — letra K, dentro da folga até Y1 (guarda de construir.js:474-490)',
      () => {
        const indice = FATO_CABECALHO.indexOf('posicao');
        assert.strictEqual(indice, 10);
        const letra = String.fromCharCode(65 + indice);
        assert.strictEqual(letra, 'K');
      }
    ],

    [
      'montarLinhasFato: cada linha tem 11 células, faixa/posicao vêm dos campos do registro',
      () => {
        const regs = [
          { titulo: 't', veiculo: 'v', link: 'l', data_ms: Date.parse('2026-08-28T00:00:00Z'), aba: 'geral', tabela: 'brasil', n_veiculos: 2, score: 55, cluster_id: 'c1', faixa: '3d', posicao: 1 },
          { titulo: 't2', veiculo: null, link: null, data_ms: null, aba: null, tabela: null, n_veiculos: null, score: null, cluster_id: null, faixa: '', posicao: null }
        ];
        const linhas = montarLinhasFato(regs);
        assert.strictEqual(linhas.length, 2);
        assert.strictEqual(linhas[0].length, 11);
        assert.strictEqual(linhas[0][9], '3d');
        assert.strictEqual(linhas[0][10], 1);
        // registro sem faixa: '' na coluna 9, '' (não null/undefined) na 10 — RAW do Sheets não aceita null.
        assert.strictEqual(linhas[1][9], '');
        assert.strictEqual(linhas[1][10], '');
      }
    ]
  ];

  for (const [name, fn] of tests) {
    if (runTest(name, fn)) passed++;
    else failed++;
  }

  console.log(`\n${passed} passou(aram), ${failed} falhou(aram)\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
