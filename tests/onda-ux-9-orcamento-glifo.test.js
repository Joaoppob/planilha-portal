#!/usr/bin/env node
'use strict';

/**
 * REMODELAÇÃO CRM 2026-09-01 — Leva 2, Onda UX 9.
 * `.claude/plans/radar-ux-20-ondas.md` Bloco B, intervenção 9 (+ adendo
 * Nahida F2/F5 mecanismo 4) + `_norman/AVALIACAO-UX.md` Parte 2 §3 e
 * Parte 3, linha 9.
 *
 * O QUE ESTE ARQUIVO PROVA:
 *
 *  - O MEDIDOR DE GLIFO (mesma disciplina de `_norman/verificar.js` —
 *    predicado reimplementado em Node, controle positivo e negativo antes
 *    de medir, teto 15%) REPROVARIA o estado PRÉ-Onda-10, numa FIXTURE
 *    com o dado ANTIGO (os 2 projetos reais em `🔴 parado`, 100% —
 *    exatamente o que AVALIACAO-UX.md Parte 2 §3 mediu) — e PASSA na
 *    fixture do estado PÓS-Onda-10 (`⚪ sem sinal`, D-A1).
 *  - Controles positivos (🔴/🟠 acendem) e negativos (⚪/🟢/"—" não
 *    acendem) do próprio medidor, independentes da fixture.
 *  - ADENDO (mecanismo 4) — ao vivo (skip sem credencial), PROVA EMPÍRICA:
 *    cresce o `rowCount` de `Tarefas` e confere que a regra condicional
 *    JÁ INSTALADA acompanha o crescimento SEM `formatar.js` rodar de
 *    novo (reverte a grade no `finally`, mesmo se a prova falhar). A
 *    API sempre devolve um `endRowIndex` concreto ao consultar — "0
 *    chaves endRowIndex" não prova nada; só crescer a grade e ver a
 *    regra acompanhar prova que a cobertura é dinâmica.
 */

const assert = require('assert');
const path = require('path');
const RAIZ = path.join(__dirname, '..');
require(path.join(RAIZ, 'lib', 'env')).carregarEnv(path.join(RAIZ, '.env'));

const A = require('../_norman/abas');

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

async function runTestAsync(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    return true;
  } catch (error) {
    console.log(`  ✗ ${name}`);
    console.error(`    ${error.message}`);
    return false;
  }
}

// MESMO predicado de `_norman/verificar.js` (bloco "ORÇAMENTO DE COR —
// ONDA UX 9"): 🔴/🟠 contam como sinal aceso; ⚪ (D-A1)/🟢/"—" não.
// Duplicado aqui de propósito — é o MESMO tipo de espelho-pra-prova que
// `_norman/verificar.js` já faz com `vencida`/`vencendo` em Node contra o
// que a planilha calcula; a fonte de VERDADE é a fórmula em
// `_norman/formulas.js PROJETOS_SAUDE`, isto é só o instrumento de medida.
const saudeAcende = v => /^🔴|^🟠/.test(String(v || ''));
const TETO = 0.15;

function medir(linhas) {
  const acesas = linhas.filter(saudeAcende).length;
  const pct = linhas.length ? acesas / linhas.length : 0;
  return { acesas, total: linhas.length, pct, reprova: linhas.length >= 2 && pct > TETO };
}

async function main() {
  console.log('\n=== onda-ux-9-orcamento-glifo.test.js ===\n');
  let passed = 0;
  let failed = 0;
  const nota = ok => { if (ok) passed++; else failed++; };

  // ------------------------------------------------- controles do medidor
  nota(runTest('CONTROLE POSITIVO — "🔴 parado" acende', () => assert.ok(saudeAcende('🔴 parado'))));
  nota(runTest('CONTROLE POSITIVO — "🔴 atrasado" acende', () => assert.ok(saudeAcende('🔴 atrasado'))));
  nota(runTest('CONTROLE POSITIVO — "🟠 sem rumo" acende', () => assert.ok(saudeAcende('🟠 sem rumo'))));
  nota(runTest('CONTROLE NEGATIVO — "⚪ sem sinal" (D-A1) NÃO acende — ausência de dado não é alarme', () => assert.ok(!saudeAcende('⚪ sem sinal'))));
  nota(runTest('CONTROLE NEGATIVO — "🟢 em dia" NÃO acende', () => assert.ok(!saudeAcende('🟢 em dia'))));
  nota(runTest('CONTROLE NEGATIVO — "—" (entregue) NÃO acende', () => assert.ok(!saudeAcende('—'))));

  // ------------------------------------------------- fixture PRÉ-Onda-10
  nota(runTest(
    'FIXTURE pré-Onda-10 (dado ANTIGO — os 2 projetos reais em "🔴 parado", medido em AVALIACAO-UX.md Parte 2 §3): o medidor REPROVA',
    () => {
      const fixturePre = ['🔴 parado', '🔴 parado']; // JB.STUDIO, Faculdade — estado real antes desta Onda
      const r = medir(fixturePre);
      console.log(`    fixture pré-Onda-10: ${r.acesas}/${r.total} (${Math.round(r.pct * 100)}%, teto ${Math.round(TETO * 100)}%)`);
      assert.strictEqual(r.pct, 1, 'a fixture antiga tem que ser 100% acesa — é o que o defeito media');
      assert.ok(r.reprova, 'o medidor deveria REPROVAR o estado pré-Onda-10 — se não reprova, o instrumento nasce cego (mesma lição do D4/D20)');
    }
  ));

  // ------------------------------------------------- fixture PÓS-Onda-10
  nota(runTest(
    'FIXTURE pós-Onda-10 (dado NOVO — os mesmos 2 projetos, agora "⚪ sem sinal", D-A1): o medidor PASSA',
    () => {
      const fixturePos = ['⚪ sem sinal', '⚪ sem sinal'];
      const r = medir(fixturePos);
      console.log(`    fixture pós-Onda-10: ${r.acesas}/${r.total} (${Math.round(r.pct * 100)}%, teto ${Math.round(TETO * 100)}%)`);
      assert.strictEqual(r.pct, 0);
      assert.ok(!r.reprova, 'o medidor não deveria reprovar o estado pós-Onda-10 — ausência de dado não é alarme');
    }
  ));

  // ------------------------------------------------- mistura realista
  nota(runTest('FIXTURE mista (sinais de verdade + sem sinal): reprova quando o sinal REAL passa do teto', () => {
    const mista = ['🔴 parado', '⚪ sem sinal', '⚪ sem sinal', '🟢 em dia', '—', '🟠 sem rumo'];
    const r = medir(mista);
    console.log(`    fixture mista: ${r.acesas}/${r.total} (${Math.round(r.pct * 100)}%)`);
    // 2 de 6 = 33% > 15% -> REPROVA de verdade (🔴 parado + 🟠 sem rumo).
    assert.ok(r.reprova, `2 sinais reais em 6 (33%) deveria reprovar o teto de 15% — mediu ${Math.round(r.pct * 100)}%`);
  }));

  // ------------------------------------------------- ao vivo (adendo mecanismo 4)
  const semCredencial = !process.env.GOOGLE_SHEETS_SPREADSHEET_ID
    || !process.env.GOOGLE_SHEETS_CLIENT_EMAIL || !process.env.GOOGLE_SHEETS_PRIVATE_KEY;
  if (semCredencial) {
    console.log('  SKIP (adendo mecanismo 4, ao vivo) — sem as três credenciais GOOGLE_SHEETS_* em .env; a regra condicional instalada só se lê da planilha viva.\n');
    console.log(`\n${passed} passou(aram), ${failed} falhou(aram)\n`);
    process.exit(failed > 0 ? 1 : 0);
  }

  const a = require('../_norman/api');
  // ACHADO AO VIVO fazendo esta prova a primeira vez: a API do Sheets
  // sempre devolve um `endRowIndex` CONCRETO em `conditionalFormats(
  // ranges)` — mesmo pra uma regra escrita SEM esse campo (Onda 9,
  // `_norman/formatar.js cf()`). "0 chaves `endRowIndex`" não é o sinal
  // certo: o valor concreto reportado é só a leitura ATUAL do tamanho da
  // grade, e isso é IGUAL nos dois casos (range fixo vs. coluna inteira,
  // já que `linhas[aba]` — o valor antigo — também vinha do `rowCount`
  // vivo no momento em que `formatar.js` rodou). A prova de verdade tem
  // que ser EMPÍRICA: crescer a grade e ver se a regra ACOMPANHA sem
  // `formatar.js` rodar de novo.
  //
  // `Tarefas` é a aba: 5 linhas de dado reais (bem abaixo do teto),
  // crescer e encolher o `rowCount` de volta não toca em nenhuma linha
  // com conteúdo. `try/finally` garante o reverte mesmo se a asserção
  // falhar — este teste não pode deixar a grade maior do que achou.
  nota(await runTestAsync(
    'Onda 9 (mecanismo 4) — EMPÍRICO: a regra condicional de Tarefas ACOMPANHA o crescimento da grade sem formatar.js rodar de novo',
    async () => {
      const metaAntes = await a.api('?includeGridData=false&fields=sheets(properties(sheetId,title,gridProperties))');
      const props = {};
      metaAntes.sheets.forEach(s => { props[s.properties.title] = s.properties; });
      const sheetId = props[A.TAREFAS].sheetId;
      const rowCountOriginal = props[A.TAREFAS].gridProperties.rowCount;
      const rowCountMaior = rowCountOriginal + 8;
      try {
        await a.batch([{ updateSheetProperties: { properties: { sheetId, gridProperties: { rowCount: rowCountMaior } }, fields: 'gridProperties.rowCount' } }]);
        const metaDepois = await a.api('?includeGridData=false&fields=sheets(properties(title,gridProperties),conditionalFormats(ranges))');
        const tarefasDepois = metaDepois.sheets.find(s => s.properties.title === A.TAREFAS);
        assert.strictEqual(tarefasDepois.properties.gridProperties.rowCount, rowCountMaior, 'a grade não cresceu como esperado — a prova não vale nada');
        const regrasMultilinha = (tarefasDepois.conditionalFormats || [])
          .flatMap(r => r.ranges || [])
          .filter(rg => (rg.endRowIndex || 0) - (rg.startRowIndex || 0) > 1); // exclui a de 1 linha (R-A1, alarme)
        console.log(`    Tarefas: rowCount ${rowCountOriginal} -> ${rowCountMaior}; ${regrasMultilinha.length} regra(s) de lista lida(s)`);
        assert.ok(regrasMultilinha.length > 0, 'nenhuma regra de lista encontrada em Tarefas — a prova não tem o que medir');
        for (const rg of regrasMultilinha) {
          assert.strictEqual(rg.endRowIndex, rowCountMaior,
            `regra com endRowIndex=${rg.endRowIndex}, esperado ${rowCountMaior} (a grade cresceu e a regra NÃO acompanhou — é exatamente o "range fixo" que a Onda 9 fecha)`);
        }
      } finally {
        await a.batch([{ updateSheetProperties: { properties: { sheetId, gridProperties: { rowCount: rowCountOriginal } }, fields: 'gridProperties.rowCount' } }]);
      }
    }
  ));

  console.log(`\n${passed} passou(aram), ${failed} falhou(aram)\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('ERRO\n' + (err && err.stack || err));
  process.exit(1);
});
