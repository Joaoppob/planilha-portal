#!/usr/bin/env node
'use strict';

/**
 * Testa lib/relatorio-backfill.js — o markdown de RELATORIO-BACKFILL.md
 * (item 1 + bloco da hipótese do item 2, briefing Onda 1.5). Todo dado que
 * entra aqui é sintético (não vem de rede); o teste garante que a função é
 * pura e que os números do markdown batem com os dados de entrada.
 */

const assert = require('assert');
const relatorio = require('../lib/relatorio-backfill');

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
  console.log('\n=== relatorio-backfill.test.js ===\n');
  let passed = 0;
  let failed = 0;

  const tests = [
    ['contarPor() agrupa e conta corretamente', () => {
      const r = relatorio.contarPor([{ x: 'a' }, { x: 'b' }, { x: 'a' }], i => i.x);
      assert.deepStrictEqual(r, { a: 2, b: 1 });
    }],

    ['formatarTabela() produz markdown de tabela com cabeçalho', () => {
      const md = relatorio.formatarTabela({ SP: 5, MG: 2 }, 'UF', 'quantidade');
      assert.match(md, /\| UF \| quantidade \|/);
      assert.match(md, /\| SP \| 5 \|/);
    }],

    ['formatarTabela() de contagem vazia não quebra', () => {
      const md = relatorio.formatarTabela({}, 'x', 'y');
      assert.strictEqual(md, '_(sem dados)_');
    }],

    ['vereditoHipotese: 32 institutos -> CONFIRMADA', () => {
      assert.strictEqual(relatorio.vereditoHipotese(32), 'CONFIRMADA');
    }],

    ['vereditoHipotese: 15 institutos -> PARCIAL', () => {
      assert.strictEqual(relatorio.vereditoHipotese(15), 'PARCIAL');
    }],

    ['vereditoHipotese: 3 institutos -> REFUTADA', () => {
      assert.strictEqual(relatorio.vereditoHipotese(3), 'REFUTADA');
    }],

    ['gerar() produz markdown com todas as 8 seções e números corretos', () => {
      const registros = [
        { tipo: 'substituto', uf: 'SP', orgao: 'IFSP', titulacao_exigida: 'mestrado', data_publicacao: '2026-03-10', score: 90, veredito: 'elegivel_agora', area: 'Design', subarea: 'Design Digital', url: 'http://x/1' },
        { tipo: 'efetivo', uf: 'MG', orgao: 'UNIFAL', titulacao_exigida: 'doutorado', data_publicacao: '2026-04-11', score: 70, veredito: 'elegivel_futuro', area: 'UX/IHC', subarea: 'UX', url: 'http://x/2' },
        { tipo: null, uf: null, orgao: 'Órgão X', titulacao_exigida: null, data_publicacao: '2026-04-20', score: null, veredito: null, area: 'Design', subarea: 'Design', url: 'http://x/3' }
      ];
      const saudeRegistros = [
        { dataAlvo: '10-03-2026', volumeBruto: 2000, erro: null },
        { dataAlvo: '11-04-2026', volumeBruto: 2100, erro: null },
        { dataAlvo: '20-04-2026', volumeBruto: 0, erro: null }
      ];
      const amostraIF = [
        { instituto: 'Instituto Federal de São Paulo', amostrado: true, titulacao_exigida: 'mestrado' },
        { instituto: 'Instituto Federal de Minas Gerais', amostrado: true, titulacao_exigida: null },
        { instituto: 'Instituto Federal de São Paulo', amostrado: false }
      ];

      const md = relatorio.gerar({
        de: '01-01-2026',
        ate: '31-12-2026',
        registros,
        saudeRegistros,
        amostraIF,
        throttleMs: 1500,
        tentativasBackoff: 3
      });

      assert.match(md, /# Relatório de Backfill/);
      assert.match(md, /## 1\. Volume geral/);
      assert.match(md, /Publicações varridas.*\*\*4100\*\*/); // 2000+2100+0
      assert.match(md, /## 8\. Hipótese DOU × Institutos Federais/);
      assert.match(md, /\*\*Veredito: REFUTADA\*\*/); // só 2 institutos distintos
      assert.match(md, /Institutos Federais distintos identificados: \*\*2\*\* de 38/);
      assert.match(md, /IFSP/); // aparece no top20/tabela de órgão
      assert.match(md, /90/); // score do top
    }],

    ['gerar() sem itens com score avisa que julgar precisa rodar', () => {
      const md = relatorio.gerar({
        de: '01-01-2026',
        ate: '31-01-2026',
        registros: [{ tipo: 'efetivo', uf: 'SP', orgao: 'X', titulacao_exigida: null, data_publicacao: '2026-01-05', score: null, url: 'http://x' }],
        saudeRegistros: [],
        amostraIF: [],
        throttleMs: 1500,
        tentativasBackoff: 3
      });
      assert.match(md, /Nenhum item com score calculado/);
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
