#!/usr/bin/env node
'use strict';

/**
 * REMODELAÇÃO CRM 2026-09-01 — Leva 4, Onda UX 16.
 * `.claude/plans/radar-ux-20-ondas.md` Bloco D, intervenção 16 +
 * `_norman/AVALIACAO-UX.md` Parte 3, linha 16 ("`VENCE`/`ATENÇÃO` linkam
 * pra aba de ORIGEM de cada linha, não pra `Tarefas` sempre — hoje o link
 * leva ao lugar errado quando a fonte saturada é outra").
 *
 * O QUE ESTE ARQUIVO PROVA:
 *
 *  - ESTRUTURAL (string da fórmula, com um `url()` fake determinístico):
 *    cada TIPO de linha do bloco ⏰ VENCE (tarefa/edital) e do bloco
 *    🚧 ATENÇÃO (fila/candidatura/tarefa) faz `HYPERLINK` pra aba de
 *    ORIGEM certa — nunca pra URL externa, nunca sempre `Tarefas`.
 *  - ALGORÍTMICO: com as TRÊS fontes de `ATENÇÃO` (e as duas de `VENCE`)
 *    populadas ACIMA do teto SIMULTANEAMENTE (o cenário que o briefing pede
 *    literalmente), o rodapé aponta pra origem que MAIS contribuiu —
 *    régua tie-independent (não depende de o `SORT` do Sheets ser estável
 *    em empate, o que não dá pra verificar a partir do Node — ver a nota de
 *    design mais abaixo, achada por este próprio teste numa versão anterior).
 *  - REGRESSÃO DE SINTAXE: `F.hojeCelulas(...)` continua com parênteses
 *    balanceados (o MESMO cheque que `_norman/construir.js` roda antes de
 *    escrever) — é a classe de defeito que já derrubou `Hoje` uma vez
 *    (`#ERROR!` na linha 1, parêntese sobrando).
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

// url() FAKE — determinístico, uma "URL" só pra cada aba, pra grep na
// string da fórmula sem precisar de gid real nem rede.
const urlFake = aba => `https://fake.test/${aba}`;

async function main() {
  console.log('\n=== onda-ux-16-vence-atencao-origem.test.js ===\n');
  let passed = 0;
  let failed = 0;
  const nota = ok => { if (ok) passed++; else failed++; };

  const VENCE = F.HOJE_BLOCOS.find(b => b.chave === 'VENCE');
  const ATENCAO = F.HOJE_BLOCOS.find(b => b.chave === 'ATENCAO');

  // --------------------------------------------- estrutural: linhas
  nota(runTest('Onda 16 — VENCE existe e tem rodapeLink (não usa mais só b.aba fixo)', () => {
    assert.ok(VENCE, 'bloco VENCE não encontrado em F.HOJE_BLOCOS');
    assert.strictEqual(typeof VENCE.rodapeLink, 'function', 'VENCE.rodapeLink deveria ser função');
  }));

  nota(runTest('Onda 16 — VENCE: linha de TAREFA linka pra Tarefas, linha de EDITAL linka pra Concursos (nunca a URL externa)', () => {
    const formula = VENCE.corpo(urlFake);
    assert.ok(formula.includes(`HYPERLINK("${urlFake(A.TAREFAS)}"`), 'linha de tarefa não linka pra Tarefas');
    assert.ok(formula.includes(`HYPERLINK("${urlFake(A.PAINEL)}"`), 'linha de edital não linka pra Concursos');
    assert.ok(!formula.includes('eUrl'), '`eUrl` (a URL externa do edital, dados!S) não pode mais ser consumida pra decidir o link da linha');
  }));

  nota(runTest('Onda 16 — ATENÇÃO existe e tem rodapeLink', () => {
    assert.ok(ATENCAO, 'bloco ATENCAO não encontrado em F.HOJE_BLOCOS');
    assert.strictEqual(typeof ATENCAO.rodapeLink, 'function', 'ATENCAO.rodapeLink deveria ser função');
  }));

  nota(runTest('Onda 16 — ATENÇÃO: fila linka pra Fila, candidatura linka pra Candidaturas, tarefa linka pra Tarefas', () => {
    const formula = ATENCAO.corpo(urlFake);
    assert.ok(formula.includes(`HYPERLINK("${urlFake(A.FILA)}"`), 'linha de fila não linka pra Fila');
    assert.ok(formula.includes(`HYPERLINK("${urlFake(A.CANDIDATURAS)}"`), 'linha de candidatura não linka pra Candidaturas');
    assert.ok(formula.includes(`HYPERLINK("${urlFake(A.TAREFAS)}"`), 'linha de tarefa bloqueada não linka pra Tarefas');
    // cUrlEstado ainda é consumida (existência da candidatura, cCond) — só
    // não decide mais o DESTINO do link. fUrl (Fila!B, url externa) sai de
    // vez, mesmo espírito de `eUrl` acima.
    assert.ok(!formula.includes('fUrl'), '`fUrl` (Fila!B, a URL externa) não pode mais decidir o link da linha');
  }));

  // ------------------------------------- estrutural: rodapé (b.rodapeLink)
  nota(runTest('Onda 16 — VENCE.rodapeLink: gera HYPERLINK pra Tarefas OU Concursos, nunca fixo num só', () => {
    const f = VENCE.rodapeLink(urlFake)('n');
    assert.ok(f.includes(`HYPERLINK("${urlFake(A.TAREFAS)}"`), 'rodapé de VENCE não contempla Tarefas');
    assert.ok(f.includes(`HYPERLINK("${urlFake(A.PAINEL)}"`), 'rodapé de VENCE não contempla Concursos');
  }));

  nota(runTest('Onda 16 — ATENÇÃO.rodapeLink: gera HYPERLINK pra Fila, Candidaturas OU Tarefas', () => {
    const f = ATENCAO.rodapeLink(urlFake)('n');
    assert.ok(f.includes(`HYPERLINK("${urlFake(A.FILA)}"`), 'rodapé de ATENÇÃO não contempla Fila');
    assert.ok(f.includes(`HYPERLINK("${urlFake(A.CANDIDATURAS)}"`), 'rodapé de ATENÇÃO não contempla Candidaturas');
    assert.ok(f.includes(`HYPERLINK("${urlFake(A.TAREFAS)}"`), 'rodapé de ATENÇÃO não contempla Tarefas');
  }));

  nota(runTest('Onda 16 — CONTROLE: bloco de fonte única (ex. TAREFAS) NÃO ganhou rodapeLink — só os cruzados precisam', () => {
    const TAREFAS_BLOCO = F.HOJE_BLOCOS.find(b => b.chave === 'TAREFAS');
    assert.strictEqual(TAREFAS_BLOCO.rodapeLink, undefined, 'bloco de fonte única não deveria declarar rodapeLink');
  }));

  // ------------------------------------- algorítmico: espelho da origem
  // NOTA DE DESIGN (achado NESTA Onda, pelo próprio teste): a primeira
  // versão tentava achar o TIPO exato da linha na posição de corte
  // (`teto+1`) via `SMALL`+`COUNTIFS` — e um teste de 200 cenários
  // aleatórios reprovou 42/200, porque o desempate em EMPATE de chave
  // depende de o `SORT` do Sheets ser ESTÁVEL, o que não dá pra verificar
  // a partir do Node. A régua final NÃO depende de desempate: qual fonte
  // contribui com MAIS itens no total. Os espelhos abaixo JÁ SÃO o "chão de
  // verdade" (a régua É a contagem — não há uma segunda forma "mais lenta e
  // correta" pra comparar contra, ao contrário da tentativa anterior).
  function espelhoOrigemVence(tarefasN, editaisN) {
    return editaisN > tarefasN ? 'edital' : 'tarefa';
  }
  function espelhoOrigemAtencao(filaN, candN, tarefaN) {
    if (filaN >= candN && filaN >= tarefaN) return 'fila';
    if (candN >= tarefaN) return 'candidatura';
    return 'tarefa';
  }

  nota(runTest('Onda 16 — CASO SINTÉTICO do briefing: VENCE com tarefa E edital acima do teto simultaneamente, rodapé aponta pra quem contribui mais', () => {
    assert.strictEqual(espelhoOrigemVence(10, 3), 'tarefa', '10 tarefas > 3 editais -> origem deveria ser tarefa');
    assert.strictEqual(espelhoOrigemVence(3, 10), 'edital', '10 editais > 3 tarefas -> origem deveria ser edital');
    assert.strictEqual(espelhoOrigemVence(5, 5), 'tarefa', 'empate exato -> default declarado é tarefa (mesmo default de antes da Onda)');
  }));

  nota(runTest('Onda 16 — CASO SINTÉTICO do briefing: ATENÇÃO com fila, candidatura E tarefa acima do teto simultaneamente, cada fonte testada como a dominante', () => {
    assert.strictEqual(espelhoOrigemAtencao(12, 5, 5), 'fila', 'fila dominante -> origem fila');
    assert.strictEqual(espelhoOrigemAtencao(1, 12, 5), 'candidatura', 'candidatura dominante -> origem candidatura');
    assert.strictEqual(espelhoOrigemAtencao(1, 1, 12), 'tarefa', 'tarefa dominante -> origem tarefa');
    // as TRÊS fontes populadas SIMULTANEAMENTE acima do teto — o cenário
    // literal do briefing — com fila levemente à frente:
    assert.strictEqual(espelhoOrigemAtencao(9, 8, 7), 'fila', 'três fontes acima do teto (8) ao mesmo tempo, fila é a maior');
  }));

  nota(runTest('Onda 16 — VENCE.rodapeLink e ATENÇÃO.rodapeLink usam a MESMA técnica de contagem (SUMPRODUCT) que `contagem` — nenhum operador novo de risco (SORT/SMALL) sobrou na fórmula', () => {
    const fVence = VENCE.rodapeLink(urlFake)('n');
    const fAtencao = ATENCAO.rodapeLink(urlFake)('n');
    assert.ok(!fVence.includes('SMALL'), 'VENCE.rodapeLink não deveria mais usar SMALL (desempate não-verificável)');
    assert.ok(!fAtencao.includes('SMALL'), 'ATENCAO.rodapeLink não deveria usar SMALL');
    assert.ok(fVence.includes('SUMPRODUCT'), 'VENCE.rodapeLink deveria decidir por contagem (SUMPRODUCT)');
    assert.ok(fAtencao.includes('SUMPRODUCT'), 'ATENCAO.rodapeLink deveria decidir por contagem (SUMPRODUCT)');
  }));

  // --------------------------------------------- regressão de sintaxe
  nota(runTest('Onda 16 — REGRESSÃO: F.hojeCelulas(...) continua com parênteses balanceados (o mesmo cheque de construir.js)', () => {
    const gid = {};
    let i = 1;
    for (const aba of Object.keys(F.ROTULO_NAV)) gid[aba] = i++;
    const celulas = F.hojeCelulas('ID-FAKE', gid);
    const problemas = [];
    for (const [ref, valor] of Object.entries(celulas)) {
      if (typeof valor !== 'string' || valor[0] !== '=') continue;
      let profundidade = 0, negativou = false;
      for (const ch of valor) {
        if (ch === '(') profundidade++;
        else if (ch === ')') { profundidade--; if (profundidade < 0) negativou = true; }
      }
      if (profundidade !== 0 || negativou) problemas.push(`${ref}: saldo ${profundidade}${negativou ? ' (fechou antes de abrir)' : ''}`);
    }
    assert.deepStrictEqual(problemas, [], `parênteses desbalanceados em Hoje: ${JSON.stringify(problemas)}`);
  }));

  // --------------------------------------------- contra o dado do dia
  const semCredencial = !process.env.GOOGLE_SHEETS_SPREADSHEET_ID
    || !process.env.GOOGLE_SHEETS_CLIENT_EMAIL || !process.env.GOOGLE_SHEETS_PRIVATE_KEY;
  if (semCredencial) {
    console.log('  SKIP (dado do dia) — sem as três credenciais GOOGLE_SHEETS_* em .env; a prova ao vivo só roda contra a planilha real.\n');
    console.log(`\n${passed} passou(aram), ${failed} falhou(aram)\n`);
    process.exit(failed > 0 ? 1 : 0);
  }

  const a = require('../_norman/api');
  const meta = await a.api('?includeGridData=false&fields=sheets(properties(sheetId,title,hidden))');
  const props = {};
  meta.sheets.forEach(s => { props[s.properties.title] = s.properties; });
  const abaPorGid = {};
  Object.values(props).forEach(p => { abaPorGid[p.sheetId] = p.title; });
  const gidDaFormula = f => { const m = String(f || '').match(/#gid=(\d+)/); return m ? Number(m[1]) : null; };

  nota(await runTestAsync('Onda 16 — contra o dado do DIA: nenhuma linha real de VENCE/ATENÇÃO linka pra fora do conjunto {Tarefas, Concursos, Fila, Candidaturas}', async () => {
    const l = F.LINHAS[A.HOJE];
    const ateLinha = l.lista + F.HOJE_TETOS.VENCE + F.HOJE_TETOS.ATENCAO + 6; // titulo+corpo+rodape+vazio dos dois blocos
    const r = await a.ler(`${R(A.HOJE)}!A${l.lista}:A${ateLinha}`, 'valueRenderOption=FORMULA');
    const permitidos = new Set([A.TAREFAS, A.PAINEL, A.FILA, A.CANDIDATURAS].map(x => props[x] && props[x].sheetId));
    const foraDoConjunto = [];
    (r.values || []).forEach((linha, i) => {
      const formula = (linha || [])[0];
      if (typeof formula !== 'string' || !formula.startsWith('=HYPERLINK')) return;
      const gidLido = gidDaFormula(formula);
      if (gidLido === null) return;
      if (!permitidos.has(gidLido)) {
        foraDoConjunto.push(`linha ${i + l.lista}: gid ${gidLido} = "${abaPorGid[gidLido] || 'ÓRFÃO'}"`);
      }
    });
    console.log(`    ${(r.values || []).length} linha(s) lida(s) em VENCE/ATENÇÃO, ${foraDoConjunto.length} fora do conjunto permitido`);
    assert.deepStrictEqual(foraDoConjunto, [], `link(s) de VENCE/ATENÇÃO fora de {Tarefas,Concursos,Fila,Candidaturas}: ${JSON.stringify(foraDoConjunto)}`);
  }));

  console.log(`\n${passed} passou(aram), ${failed} falhou(aram)\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('ERRO\n' + (err && err.stack || err));
  process.exit(1);
});
