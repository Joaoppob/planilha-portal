#!/usr/bin/env node
'use strict';

/**
 * DEDUP DE NOTÍCIA ENTRE ABAS — `fontes-noticias/dedup-entre-abas.js`.
 *
 * O CASO QUE ESTE ARQUIVO TRAVA (achado C6 do plano `radar-crm-20-ondas.md`):
 * hoje `deduparGlobal` (`noticias.js`) dedupa por `id`, que não carrega a
 * aba. Se o MESMO link+título chegar de duas fontes com abas diferentes, o
 * vencedor seria só quem apareceu primeiro na ordem de `listaFontes` — um
 * acidente de registro, não uma decisão. Este teste exige o oposto: o
 * vencedor tem que ser SEMPRE o mesmo, na ordem de precedência declarada
 * (`ciencia > ia > trabalho > geral`), **mesmo quando a ordem de entrada do
 * array muda**. Se algum dia a implementação regredir para depender da
 * ordem, embaralhar o array de entrada faz este teste falhar.
 */

const assert = require('assert');
const {
  ORDEM_PRECEDENCIA_ABA,
  precedenciaAba,
  resolverDuplicataEntreAbas
} = require('../fontes-noticias/dedup-entre-abas');
const { gerarIdNoticia } = require('../lib-noticias/store-noticias');

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

function item({ aba, tabela, titulo = 'Mesmo fato, duas abas', link = 'https://exemplo.com/materia' }) {
  return {
    id: gerarIdNoticia({ link, titulo }),
    titulo,
    link,
    linkCanonico: link,
    aba,
    tabela,
    fonte: 'fonte-' + aba
  };
}

function main() {
  console.log('\n=== dedup-entre-abas.test.js ===\n');
  let passed = 0;
  let failed = 0;

  const tests = [
    // ------------------------------------------------- a política em si
    ['ORDEM_PRECEDENCIA_ABA é a ordem nomeada esperada: ciencia > ia > trabalho > geral', () => {
      assert.deepStrictEqual(ORDEM_PRECEDENCIA_ABA, ['ciencia', 'ia', 'trabalho', 'geral']);
    }],

    ['precedenciaAba: aba fora da lista perde de TODAS as abas conhecidas', () => {
      const piorQueTodas = precedenciaAba('aba-desconhecida');
      for (const aba of ORDEM_PRECEDENCIA_ABA) {
        assert.ok(piorQueTodas > precedenciaAba(aba), `"${aba}" deveria vencer de aba desconhecida`);
      }
    }],

    // ---------------------------------- o caso central: mesmo fato, 2 abas
    ['mesmo link+titulo em `ia` e `geral`: `ia` vence (mais específica)', () => {
      const a = item({ aba: 'geral', tabela: 'brasil' });
      const b = item({ aba: 'ia', tabela: 'ia-geral' });
      const r = resolverDuplicataEntreAbas([a, b]);
      assert.strictEqual(r.itens.length, 1);
      assert.strictEqual(r.itens[0].aba, 'ia');
      assert.strictEqual(r.removidos, 1);
      assert.strictEqual(r.decisoes.length, 1);
      assert.strictEqual(r.decisoes[0].abaVencedora, 'ia');
      assert.strictEqual(r.decisoes[0].abaPerdedora, 'geral');
    }],

    ['O VENCEDOR NÃO MUDA quando a ORDEM DE ENTRADA muda — não é a ordem do array que decide', () => {
      const geral = item({ aba: 'geral', tabela: 'brasil' });
      const trabalho = item({ aba: 'trabalho', tabela: 'concursos' });
      const ia = item({ aba: 'ia', tabela: 'ia-geral' });
      const ciencia = item({ aba: 'ciencia', tabela: 'academico' });

      // 4! = 24 permutações seria overkill; testamos um conjunto de ordens
      // que cobre "vencedor primeiro", "vencedor no meio" e "vencedor por
      // último" na entrada — os três jeitos de a ordem do array poder
      // influenciar um Map ingênuo.
      const permutacoes = [
        [geral, trabalho, ia, ciencia],
        [ciencia, ia, trabalho, geral],
        [trabalho, geral, ciencia, ia],
        [ia, ciencia, geral, trabalho]
      ];

      const vencedores = permutacoes.map(entrada => resolverDuplicataEntreAbas(entrada).itens[0].aba);
      assert.ok(
        vencedores.every(v => v === 'ciencia'),
        'toda permutação tem que resolver para "ciencia" (mais específica) — obtido: ' + vencedores.join(', ')
      );
    }],

    ['trabalho vence de geral; a ordem de entrada não muda o resultado', () => {
      const trabalho = item({ aba: 'trabalho', tabela: 'mercado-trabalho', link: 'https://exemplo.com/b' });
      const geral = item({ aba: 'geral', tabela: 'mundo', link: 'https://exemplo.com/b' });
      const r1 = resolverDuplicataEntreAbas([geral, trabalho]);
      assert.strictEqual(r1.itens[0].aba, 'trabalho');

      const r2 = resolverDuplicataEntreAbas([trabalho, geral]);
      assert.strictEqual(r2.itens[0].aba, 'trabalho');
    }],

    // ------------------------------------------------- não interfere no resto
    ['itens com links diferentes NUNCA colidem (chave é por id, não por aba)', () => {
      const a = item({ aba: 'geral', link: 'https://exemplo.com/x' });
      const b = item({ aba: 'ia', link: 'https://exemplo.com/y' });
      const r = resolverDuplicataEntreAbas([a, b]);
      assert.strictEqual(r.itens.length, 2);
      assert.strictEqual(r.removidos, 0);
    }],

    ['mesmo link+titulo na MESMA aba: mantém o primeiro, mas não conta como decisão de política entre abas', () => {
      const a = item({ aba: 'geral', tabela: 'brasil' });
      const b = item({ aba: 'geral', tabela: 'brasil' });
      const r = resolverDuplicataEntreAbas([a, b]);
      assert.strictEqual(r.itens.length, 1);
      assert.strictEqual(r.decisoes.length, 0, 'dedupe intra-aba não é decisão desta política');
    }],

    ['lista vazia e lista de 1 item não quebram', () => {
      assert.deepStrictEqual(resolverDuplicataEntreAbas([]).itens, []);
      const a = item({ aba: 'geral' });
      assert.strictEqual(resolverDuplicataEntreAbas([a]).itens.length, 1);
    }]
  ];

  for (const [name, fn] of tests) {
    if (runTest(name, fn)) passed++;
    else failed++;
  }

  console.log(`\n${passed} passou, ${failed} falhou\n`);
  process.exit(failed ? 1 : 0);
}

main();
