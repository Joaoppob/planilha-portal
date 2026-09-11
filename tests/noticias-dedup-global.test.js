#!/usr/bin/env node
'use strict';

/**
 * DEDUPE GLOBAL, DE PONTA A PONTA — `noticias.js deduparGlobal`.
 *
 * Onda 10a (radar-crm-20-ondas.md, Bloco C): a Onda 11 escreveu e testou
 * `resolverDuplicataEntreAbas` (`fontes-noticias/dedup-entre-abas.js`,
 * `tests/dedup-entre-abas.test.js`) mas não a fiou em `noticias.js` — a
 * função ficava pronta e correta, só não era CHAMADA por ninguém em
 * produção. Este arquivo não reexplica a política (a precedência
 * `ciencia > ia > trabalho > geral` já está testada isoladamente no arquivo
 * da Onda 11); trava só que a FIAÇÃO em `deduparGlobal` funciona:
 *
 *  - dedupe intra-aba por `id` continua acontecendo primeiro (mantém o
 *    comportamento anterior à Onda 10a);
 *  - depois, duplicata ENTRE abas (mesmo `id`, aba diferente) é resolvida
 *    pela precedência nomeada — não pela ordem de chegada no array
 *    `itens`, que é a ordem de `listaFontes`;
 *  - `removidos` soma as duas contagens (mesma-aba + entre-abas), então uma
 *    das duas sumir do total não passa despercebido.
 */

const assert = require('assert');
const { deduparGlobal, identificar } = require('../noticias');

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

/** Mesmo link+título, aba variável — sempre passa por `identificar()` primeiro, como o pipeline real faz, pra nascer com `id` de verdade (sha256), não um id inventado à mão. */
function bruto({ aba, tabela, titulo = 'Mesmo fato, abas diferentes', link = 'https://exemplo.com/materia-x' }) {
  return { titulo, link, aba, tabela, fonte: 'fonte-' + aba };
}

function main() {
  console.log('\n=== noticias-dedup-global.test.js ===\n');
  let passed = 0;
  let failed = 0;

  const tests = [
    [
      '10a: mesmo link+título, abas diferentes (ia vs geral) — deduparGlobal resolve pela PRECEDÊNCIA, não mantém as duas',
      () => {
        const itens = identificar([bruto({ aba: 'geral', tabela: 'brasil' }), bruto({ aba: 'ia', tabela: 'ia-geral' })]);
        const { itens: out, removidos } = deduparGlobal(itens);
        assert.strictEqual(out.length, 1, 'as duas colapsam numa só — antes da Onda 10a, ficariam DUAS (deduparGlobal não via a duplicata entre abas)');
        assert.strictEqual(out[0].aba, 'ia', 'ia é mais específica que geral na ordem de precedência');
        assert.strictEqual(removidos, 1);
      }
    ],

    [
      '10a: o vencedor NÃO depende da ordem de chegada no array (antes era "quem apareceu primeiro em listaFontes")',
      () => {
        const a = bruto({ aba: 'trabalho', tabela: 'concursos', link: 'https://exemplo.com/y' });
        const b = bruto({ aba: 'geral', tabela: 'mundo', link: 'https://exemplo.com/y' });

        const r1 = deduparGlobal(identificar([a, b])); // trabalho primeiro
        const r2 = deduparGlobal(identificar([b, a])); // geral primeiro

        assert.strictEqual(r1.itens[0].aba, 'trabalho');
        assert.strictEqual(r2.itens[0].aba, 'trabalho', 'mesmo vencedor mesmo com a ordem de entrada invertida');
      }
    ],

    [
      'itens da MESMA aba com o mesmo id ainda dedupam pelo caminho antigo (mantém o primeiro, sem "decisão de política")',
      () => {
        const a = bruto({ aba: 'ciencia', tabela: 'artigos' });
        const b = bruto({ aba: 'ciencia', tabela: 'artigos' });
        const { itens: out, removidos } = deduparGlobal(identificar([a, b]));
        assert.strictEqual(out.length, 1);
        assert.strictEqual(removidos, 1);
      }
    ],

    [
      'itens com links diferentes nunca colidem — dedupe não fica agressivo demais depois da fiação',
      () => {
        const a = bruto({ aba: 'geral', link: 'https://exemplo.com/1' });
        const b = bruto({ aba: 'ia', link: 'https://exemplo.com/2' });
        const { itens: out, removidos } = deduparGlobal(identificar([a, b]));
        assert.strictEqual(out.length, 2);
        assert.strictEqual(removidos, 0);
      }
    ],

    [
      'lista vazia não quebra',
      () => {
        const { itens: out, removidos } = deduparGlobal([]);
        assert.deepStrictEqual(out, []);
        assert.strictEqual(removidos, 0);
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
