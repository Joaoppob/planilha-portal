#!/usr/bin/env node
'use strict';

/**
 * REMODELAÇÃO CRM 2026-09-01 — Leva 4, Onda UX 17.
 * `.claude/plans/radar-ux-20-ondas.md` Bloco D, intervenção 17 +
 * `_norman/AVALIACAO-UX.md` Parte 3, linha 17 ("Fechar a malha entre as
 * três ilhas — nav de 2 linhas ou destinos por afinidade, sem depender só
 * do `Hoje`. Prova: BFS: pior caso ≤ 2 e pares com 2+ abaixo de um teto
 * declarado (hoje 93/156)").
 *
 * O QUE ESTE ARQUIVO PROVA:
 *
 *  - ESTRUTURAL: nenhuma aba perdeu nenhum destino que já tinha antes desta
 *    Onda (só se ACRESCENTA aresta — "nunca piora").
 *  - BFS SOBRE `F.NAV` (offline, sem rede): pior caso continua ≤ 2, e pares
 *    custando 2+ caem pra 31/156 — o TETO desta Onda, DERIVADO da própria
 *    medição (não um número redondo).
 *  - BFS SOBRE OS GID REAIS (ao vivo, skip sem credencial): repete a mesma
 *    conta contra o que está de fato instalado na planilha — instrumento
 *    que só olha o código declarado não prova cobertura.
 *  - GUARDA DE FOLGA: nenhuma aba pede mais slots de nav do que tem coluna
 *    VISÍVEL (o mesmo cheque que `_norman/construir.js` faz antes de
 *    escrever, `F.celulaNav` — aqui replicado pra travar ANTES da escrita).
 */

const assert = require('assert');
const path = require('path');
const RAIZ = path.join(__dirname, '..');
require(path.join(RAIZ, 'lib', 'env')).carregarEnv(path.join(RAIZ, '.env'));

const F = require('../_norman/formulas');
const A = require('../_norman/abas');
const R = A.ref;

// TETO desta Onda — DERIVADO da medição feita ao escrever o código (ver o
// comentário grande junto de `NAV` em formulas.js): baseline pré-Onda 91,
// pós-Onda 31, pior caso ≤ 2 nos dois casos. Vive AQUI (não em
// formulas.js) porque é limiar de PROVA, não de produto.
const TETO_PARES_2_MAIS = 31;
const BASELINE_PRE_ONDA = 91;

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

function bfsCusto(nav, origem) {
  const dist = {}; dist[origem] = 0;
  const fila = [origem];
  while (fila.length) {
    const cur = fila.shift();
    for (const v of (nav[cur] || [])) {
      if (!(v in dist)) { dist[v] = dist[cur] + 1; fila.push(v); }
    }
  }
  return dist;
}

function contaPares(nav, abasVisiveis) {
  let total = 0, doisMais = 0, pior = 0;
  const detalhes = [];
  for (const o of abasVisiveis) {
    const dist = bfsCusto(nav, o);
    for (const d of abasVisiveis) {
      if (d === o) continue;
      total++;
      const c = dist[d];
      if (c === undefined) { pior = Math.max(pior, 99); doisMais++; detalhes.push(`${o} -> ${d}: INALCANÇÁVEL`); continue; }
      if (c > pior) pior = c;
      if (c >= 2) { doisMais++; detalhes.push(`${o} -> ${d}: ${c}`); }
    }
  }
  return { total, doisMais, pior, detalhes };
}

async function main() {
  console.log('\n=== onda-ux-17-malha-tres-ilhas.test.js ===\n');
  let passed = 0;
  let failed = 0;
  const nota = ok => { if (ok) passed++; else failed++; };

  const abasVisiveis = Object.keys(F.ROTULO_NAV).filter(a => a !== A.TUDO);

  // ------------------------------------------------- controle do BFS
  nota(runTest('CONTROLE do BFS (positivo e negativo): grafo trivial de 3 nós', () => {
    const nav = { x: ['y'], y: ['z'], z: [] };
    const r = contaPares(nav, ['x', 'y', 'z']);
    // x->y=1, x->z=2, y->z=1, y->x=INALCANÇÁVEL, z->x=INALC, z->y=INALC
    assert.strictEqual(r.total, 6);
    assert.strictEqual(r.doisMais, 4, `esperado 4 pares 2+/inalcançáveis, obtido ${r.doisMais}: ${JSON.stringify(r.detalhes)}`);
  }));

  // ------------------------------------------------- offline: F.NAV declarado
  nota(runTest(`Onda 17 — BFS sobre F.NAV: pior caso continua ≤ 2 (nunca pode passar disso, Hoje é hub universal)`, () => {
    const r = contaPares(F.NAV, abasVisiveis);
    assert.ok(r.pior <= 2, `pior caso ${r.pior} > 2 — regressão grave, Hoje deveria bastar como teto`);
  }));

  nota(runTest(`Onda 17 — BFS sobre F.NAV: pares custando 2+ caem pra ${TETO_PARES_2_MAIS}/156 (baseline pré-Onda: ${BASELINE_PRE_ONDA}/156)`, () => {
    const r = contaPares(F.NAV, abasVisiveis);
    console.log(`    pares totais: ${r.total} · pares 2+: ${r.doisMais} · pior caso: ${r.pior}`);
    assert.strictEqual(r.total, 156, `esperado 156 pares direcionais (13 abas visíveis × 12) — obtido ${r.total}; ${abasVisiveis.length} aba(s) visível(is) hoje`);
    assert.ok(r.doisMais <= TETO_PARES_2_MAIS, `pares 2+ (${r.doisMais}) acima do teto declarado (${TETO_PARES_2_MAIS})`);
    assert.ok(r.doisMais < BASELINE_PRE_ONDA, `pares 2+ (${r.doisMais}) não melhorou o baseline pré-Onda (${BASELINE_PRE_ONDA}) — a Onda não fez nada`);
  }));

  nota(runTest('Onda 17 — NUNCA PIORA: toda aresta que F.NAV já tinha ANTES desta Onda continua presente (só se acrescenta, nunca se remove destino)', () => {
    // O grafo ANTES desta Onda (congelado aqui como fixture — é o estado
    // que passou nas Ondas 1-15, não uma hipótese) — comparado por
    // SUBCONJUNTO: toda aresta velha ⊆ aresta nova.
    const NAV_ANTES = {
      [A.HOJE]: [A.EMPREGOS, A.PAINEL, A.TAREFAS, A.FILA, A.CANDIDATURAS, A.PROJETOS, A.DIARIO, A.ETAPAS, A.NOTICIAS, A.IA, A.TRABALHO, A.CIENCIA],
      [A.PAINEL]: [A.HOJE, A.EMPREGOS, A.FILA, A.TAREFAS, A.CANDIDATURAS],
      [A.EMPREGOS]: [A.HOJE, A.PAINEL, A.FILA, A.TAREFAS, A.CANDIDATURAS],
      [A.TUDO]: [A.HOJE, A.PAINEL, A.EMPREGOS],
      [A.TAREFAS]: [A.HOJE, A.PROJETOS, A.DIARIO, A.FILA],
      [A.FILA]: [A.HOJE, A.EMPREGOS, A.PAINEL, A.TAREFAS, A.CANDIDATURAS],
      [A.PROJETOS]: [A.HOJE, A.TAREFAS, A.DIARIO, A.FILA, A.ETAPAS],
      [A.DIARIO]: [A.HOJE, A.PROJETOS, A.TAREFAS, A.FILA, A.ETAPAS],
      [A.CANDIDATURAS]: [A.HOJE, A.FILA, A.EMPREGOS, A.PAINEL],
      [A.ETAPAS]: [A.HOJE, A.PROJETOS, A.TAREFAS, A.DIARIO],
      [A.NOTICIAS]: [A.HOJE, A.IA, A.TRABALHO, A.CIENCIA],
      [A.IA]: [A.HOJE, A.NOTICIAS, A.TRABALHO, A.CIENCIA],
      [A.TRABALHO]: [A.HOJE, A.NOTICIAS, A.IA, A.CIENCIA],
      [A.CIENCIA]: [A.HOJE, A.NOTICIAS, A.IA, A.TRABALHO]
    };
    const perdidos = [];
    for (const [aba, destinos] of Object.entries(NAV_ANTES)) {
      for (const d of destinos) {
        if (!(F.NAV[aba] || []).includes(d)) perdidos.push(`${aba} -> ${d}`);
      }
    }
    assert.deepStrictEqual(perdidos, [], `link(s) que existiam ANTES da Onda 17 e sumiram: ${JSON.stringify(perdidos)}`);
  }));

  // -------------------------------------------- guarda de folga (offline)
  nota(runTest('Onda 17 — guarda de folga: nenhuma aba pede mais slots de nav do que colunas VISÍVEIS (o mesmo cheque de construir.js/F.celulaNav)', () => {
    const estourou = [];
    for (const aba of Object.keys(F.NAV)) {
      const visiveis = F.colunasVisiveis(aba).length;
      const precisa = F.NAV[aba].length + 1; // + marcador "você está aqui"
      if (precisa > visiveis) estourou.push(`${aba}: pede ${precisa} slot(s), cabe ${visiveis}`);
    }
    assert.deepStrictEqual(estourou, [], `aba(s) estourando a folga de coluna: ${JSON.stringify(estourou)}`);
  }));

  // ------------------------------------------------- contra o dado do dia
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
  const abasVisiveisVivas = Object.values(props).filter(p => !p.hidden).map(p => p.title);

  const navInstalado = {};
  for (const [aba, destinos] of Object.entries(F.NAV)) {
    const primeira = F.celulaNav(aba, 0, F.LINHAS[aba].nav);
    const ultima = F.celulaNav(aba, destinos.length - 1, F.LINHAS[aba].nav);
    const bloco = (await a.ler(`${R(aba)}!${primeira}:${ultima}`, 'valueRenderOption=FORMULA')).values || [];
    const plano = [];
    bloco.forEach(linha => (linha || []).forEach(c => plano.push(c)));
    const gids = plano.map(gidDaFormula).filter(g => g !== null);
    navInstalado[aba] = gids.map(g => abaPorGid[g]).filter(Boolean);
  }

  nota(await runTestAsync('Onda 17 — BFS SOBRE O GID REAL (instalado): pior caso ≤ 2 e pares 2+ dentro do teto declarado', () => {
    const r = contaPares(navInstalado, abasVisiveisVivas);
    console.log(`    ao vivo: ${abasVisiveisVivas.length} aba(s) visível(is), ${r.total} par(es), ${r.doisMais} custando 2+, pior caso ${r.pior}`);
    assert.ok(r.pior <= 2, `pior caso ao vivo (${r.pior}) > 2`);
    assert.ok(r.doisMais <= TETO_PARES_2_MAIS, `pares 2+ ao vivo (${r.doisMais}) acima do teto declarado (${TETO_PARES_2_MAIS})`);
  }));

  console.log(`\n${passed} passou(aram), ${failed} falhou(aram)\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('ERRO\n' + (err && err.stack || err));
  process.exit(1);
});
