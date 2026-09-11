#!/usr/bin/env node
'use strict';

/**
 * IDADE DO STORE — `lib-noticias/store-noticias.js idadeDoStore`.
 *
 * Onda 10d (radar-crm-20-ondas.md, correção C7): o store de notícia nasceu
 * em 27/08/2026 (`visto_primeiro_em` mínimo). A janela de "top 20 dos
 * últimos 30 dias" só é honesta 30 dias DEPOIS dessa data — não 30 dias
 * antes da data mais antiga que algum ARTIGO carrega (que inclui backlog
 * de dias anteriores ao início da coleta). Este arquivo trava:
 *
 *  - a leitura usa `visto_primeiro_em`, nunca `data`/`data_ms`;
 *  - `completa` e `diasFaltantes` respondem certo dos dois lados da data de
 *    corte;
 *  - store vazio nunca finge uma data.
 */

const assert = require('assert');
const store = require('../lib-noticias/store-noticias');

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

const DIA = 86400000;

function main() {
  console.log('\n=== noticias-idade-store.test.js ===\n');
  let passed = 0;
  let failed = 0;

  const tests = [
    [
      'usa `visto_primeiro_em` (quando O RADAR viu), não `data`/`data_ms` (quando o ARTIGO foi publicado)',
      () => {
        const regs = [
          // artigo "publicado" há 40 dias, mas só visto pela primeira vez ontem — é BACKLOG, não histórico do radar.
          { data_ms: Date.parse('2026-01-01T00:00:00Z'), visto_primeiro_em: '2026-08-27T00:00:00.000Z' }
        ];
        const r = store.idadeDoStore(regs, { agora: Date.parse('2026-08-28T00:00:00Z') });
        assert.strictEqual(r.nascimentoISO, '2026-08-27T00:00:00.000Z', 'nascimento é visto_primeiro_em, não data_ms de janeiro');
      }
    ],

    [
      'store com menos de 30 dias: completa=false, diasFaltantes conta certo',
      () => {
        const nascimento = '2026-08-27T00:00:00.000Z';
        const regs = [{ visto_primeiro_em: nascimento }];
        const agora = Date.parse('2026-08-28T00:00:00Z'); // 1 dia depois do nascimento
        const r = store.idadeDoStore(regs, { agora });
        assert.strictEqual(r.completa, false);
        assert.strictEqual(r.diasFaltantes, 29, '30 - 1 = 29 dias faltando');
        assert.strictEqual(r.completaEmISO, '2026-09-26T00:00:00.000Z');
      }
    ],

    [
      'store com 30 dias ou mais: completa=true, diasFaltantes=0',
      () => {
        const nascimento = '2026-08-01T00:00:00.000Z';
        const regs = [{ visto_primeiro_em: nascimento }];
        const agora = Date.parse('2026-09-01T00:00:00Z'); // exatamente 31 dias depois
        const r = store.idadeDoStore(regs, { agora });
        assert.strictEqual(r.completa, true);
        assert.strictEqual(r.diasFaltantes, 0);
      }
    ],

    [
      'nascimento é o MENOR visto_primeiro_em entre TODOS os registros',
      () => {
        const regs = [
          { visto_primeiro_em: '2026-08-27T10:00:00.000Z' },
          { visto_primeiro_em: '2026-08-25T03:00:00.000Z' }, // o mais antigo
          { visto_primeiro_em: '2026-08-28T00:00:00.000Z' }
        ];
        const r = store.idadeDoStore(regs, { agora: Date.parse('2026-08-28T12:00:00Z') });
        assert.strictEqual(r.nascimentoISO, '2026-08-25T03:00:00.000Z');
      }
    ],

    [
      'store vazio (ou sem nenhum visto_primeiro_em válido) nunca finge uma data — tudo null/false',
      () => {
        const r1 = store.idadeDoStore([], { agora: Date.now() });
        assert.strictEqual(r1.nascimentoMs, null);
        assert.strictEqual(r1.completa, false);
        assert.strictEqual(r1.diasFaltantes, null);

        const r2 = store.idadeDoStore([{ visto_primeiro_em: null }, {}], { agora: Date.now() });
        assert.strictEqual(r2.nascimentoMs, null);
      }
    ],

    [
      'contra o STORE REAL: nascimento existe, é uma data válida, e não é no futuro',
      () => {
        const regs = store.carregarTudo();
        const r = store.idadeDoStore(regs);
        assert.ok(r.nascimentoMs !== null, 'store real tem que ter visto_primeiro_em');
        assert.ok(r.nascimentoMs <= Date.now(), 'nascimento não pode ser no futuro');
        assert.ok(r.completaEmMs === r.nascimentoMs + 30 * DIA);
        console.log(`    (nascimento real: ${r.nascimentoISO} · completa em: ${r.completaEmISO} · completa=${r.completa} · faltam ${r.diasFaltantes} dia(s))`);
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
