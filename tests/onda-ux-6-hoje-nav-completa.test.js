#!/usr/bin/env node
'use strict';

/**
 * REMODELAÇÃO CRM 2026-09-01 — Leva 2, Onda UX 6.
 * `.claude/plans/radar-ux-20-ondas.md` Bloco B, intervenção 6 +
 * `_norman/AVALIACAO-UX.md` Parte 2 §11 (o BFS original que mediu o buraco)
 * e Parte 3, linha 6.
 *
 * O QUE ESTE ARQUIVO PROVA:
 *
 *  - `Hoje` está em `F.NAV` (não mais numa forma especial `NAV_HOJE`) e a
 *    nav dela cabe numa linha só (`F.LINHAS[A.HOJE].nav`), com marcador.
 *  - BFS SOBRE OS GID REAIS (lidos ao vivo, FORMULA — não sobre `F.NAV`
 *    cru, que só prova o que o CÓDIGO declara, não o que está INSTALADO):
 *    `Hoje` alcança TODAS as outras abas VISÍVEIS em 1 toque — dinâmico,
 *    nunca "12" hardcoded (a lição registrada em AVALIACAO-UX.md: contar
 *    hash não é o mesmo que provar cobertura).
 *  - Controle: os destinos de 1 toque de `Hoje` são EXATAMENTE
 *    `F.NAV[A.HOJE]`, nem mais nem menos — nenhum link órfão, nenhuma
 *    aba esquecida.
 *
 * Se `.env` não tem as três credenciais `GOOGLE_SHEETS_*`, avisa e sai 0
 * (SKIP) — BFS sobre gid real só se prova contra a planilha viva.
 */

const assert = require('assert');
const path = require('path');
const RAIZ = path.join(__dirname, '..');
require(path.join(RAIZ, 'lib', 'env')).carregarEnv(path.join(RAIZ, '.env'));

const F = require('../_norman/formulas');
const A = require('../_norman/abas');
const R = A.ref;

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

async function main() {
  console.log('\n=== onda-ux-6-hoje-nav-completa.test.js ===\n');

  let passed = 0;
  let failed = 0;
  const nota = ok => { if (ok) passed++; else failed++; };

  // ------------------------------------------------- controles offline
  nota(runTest('Onda 6 — `Hoje` está em F.NAV (não mais NAV_HOJE) e F.NAV_HOJE não existe', () => {
    assert.ok(Array.isArray(F.NAV[A.HOJE]), 'F.NAV[A.HOJE] devia ser um array');
    assert.strictEqual(F.NAV_HOJE, undefined, 'F.NAV_HOJE deveria ter sido removido (Onda 6)');
  }));

  nota(runTest('Onda 6 — a nav de Hoje é UMA linha só (não há mais F.LINHAS[A.HOJE].nav2)', () => {
    assert.ok(F.LINHAS[A.HOJE].nav, 'F.LINHAS[A.HOJE].nav tem que existir');
    assert.strictEqual(F.LINHAS[A.HOJE].nav2, undefined, 'F.LINHAS[A.HOJE].nav2 deveria ter sido removido (Onda 6)');
  }));

  nota(runTest('Onda 6 — a nav de Hoje cobre Candidaturas e Etapas (o buraco medido em AVALIACAO-UX.md §11)', () => {
    assert.ok(F.NAV[A.HOJE].includes(A.CANDIDATURAS), 'Hoje não lista Candidaturas como destino de nav');
    assert.ok(F.NAV[A.HOJE].includes(A.ETAPAS), 'Hoje não lista Etapas como destino de nav');
  }));

  nota(runTest('Onda 6 — colunasVisiveis(Hoje) pula os vãos entre grupos (13 slots precisam caber)', () => {
    const visiveis = F.colunasVisiveis(A.HOJE);
    assert.ok(visiveis.length >= F.NAV[A.HOJE].length + 1,
      `colunasVisiveis(Hoje) devolveu ${visiveis.length} índice(s); precisa de pelo menos ${F.NAV[A.HOJE].length + 1} (12 destinos + marcador)`);
  }));

  const semCredencial = !process.env.GOOGLE_SHEETS_SPREADSHEET_ID
    || !process.env.GOOGLE_SHEETS_CLIENT_EMAIL || !process.env.GOOGLE_SHEETS_PRIVATE_KEY;
  if (semCredencial) {
    console.log('  SKIP (BFS ao vivo) — sem as três credenciais GOOGLE_SHEETS_* em .env; BFS sobre gid real só se prova contra a planilha viva.\n');
    console.log(`\n${passed} passou(aram), ${failed} falhou(aram)\n`);
    process.exit(failed > 0 ? 1 : 0);
  }

  const a = require('../_norman/api');
  const gidDaFormula = f => { const m = String(f || '').match(/#gid=(\d+)/); return m ? Number(m[1]) : null; };

  const meta = await a.api('?includeGridData=false&fields=sheets(properties(sheetId,title,hidden))');
  const props = {};
  meta.sheets.forEach(s => { props[s.properties.title] = s.properties; });
  const abaPorGid = {};
  Object.values(props).forEach(p => { abaPorGid[p.sheetId] = p.title; });
  const abasVisiveis = Object.values(props).filter(p => !p.hidden).map(p => p.title);

  nota(await runTestAsync('CONTROLE do leitor de gid (positivo e negativo)', () => {
    assert.strictEqual(gidDaFormula(`=HYPERLINK("https://x/edit#gid=4242";"y")`), 4242);
    assert.strictEqual(gidDaFormula(`texto sem link`), null);
  }));

  // Lê a linha de nav de CADA aba declarada em F.NAV (ao vivo, FORMULA) e
  // monta a adjacência de 1 toque a partir do que está DE FATO instalado —
  // não do que F.NAV declara. Divergência entre os dois é exatamente o
  // defeito que N-13 existe pra pegar; aqui usamos o mesmo mecanismo pra
  // construir o grafo do BFS.
  const alcancaEm1 = {};
  for (const [aba, destinos] of Object.entries(F.NAV)) {
    const primeira = F.celulaNav(aba, 0, F.LINHAS[aba].nav);
    const ultima = F.celulaNav(aba, destinos.length - 1, F.LINHAS[aba].nav);
    const bloco = (await a.ler(`${R(aba)}!${primeira}:${ultima}`, 'valueRenderOption=FORMULA')).values || [];
    const plano = [];
    bloco.forEach(linha => (linha || []).forEach(c => plano.push(c)));
    const gids = plano.map(gidDaFormula).filter(g => g !== null);
    alcancaEm1[aba] = new Set(gids.map(g => abaPorGid[g]).filter(Boolean));
  }

  nota(await runTestAsync(
    'Onda 6 — BFS (gid real): Hoje alcança TODAS as outras abas visíveis em 1 toque',
    () => {
      const esperado = new Set(abasVisiveis.filter(t => t !== A.HOJE));
      const alcançado = alcancaEm1[A.HOJE] || new Set();
      const faltam = [...esperado].filter(t => !alcançado.has(t));
      const sobrando = [...alcançado].filter(t => !esperado.has(t));
      console.log(`    Hoje alcança ${alcançado.size}/${esperado.size} abas visíveis em 1 toque (lido ao vivo, ${abasVisiveis.length} abas visíveis no total)`);
      assert.deepStrictEqual(faltam, [], `abas visíveis que Hoje NÃO alcança em 1 toque: ${faltam.join(', ')}`);
      assert.deepStrictEqual(sobrando, [], `links de Hoje pra aba(s) que não deveriam estar na nav (oculta ou órfã): ${sobrando.join(', ')}`);
    }
  ));

  nota(await runTestAsync('Onda 6 — os destinos de 1 toque de Hoje são EXATAMENTE F.NAV[A.HOJE], instalado sem drift', () => {
    const instalado = alcancaEm1[A.HOJE] || new Set();
    const declarado = new Set(F.NAV[A.HOJE]);
    assert.strictEqual(instalado.size, declarado.size, `instalado (${instalado.size}) e declarado (${declarado.size}) divergem em tamanho`);
    for (const d of declarado) assert.ok(instalado.has(d), `F.NAV[A.HOJE] declara "${d}" mas a planilha viva não linka pra lá`);
  }));

  console.log(`\n${passed} passou(aram), ${failed} falhou(aram)\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('ERRO\n' + (err && err.stack || err));
  process.exit(1);
});
