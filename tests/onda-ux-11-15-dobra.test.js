#!/usr/bin/env node
'use strict';

/**
 * REMODELAÇÃO CRM 2026-09-01 — Leva 3, Bloco C (Ondas UX 11, 12, 13, 15).
 * `.claude/plans/radar-ux-20-ondas.md` Bloco C + `_norman/AVALIACAO-UX.md`
 * Parte 3, intervenções 11-13 e 15. (A Onda 14 + E2 tem prova própria em
 * `tests/concursos-vista-duplicata-visual.test.js`, conforme o briefing.)
 *
 * O QUE ESTE ARQUIVO PROVA:
 *
 *  - Onda 11 — `Concursos`: `Elegível?` entra na dobra, `Situação` sai
 *    (`DOCENTE_CABECALHO`/`DOCENTE_GEO`, ordem e largura). Distribuição REAL
 *    de `Situação` registrada (derivada do mesmo cálculo de `_calc!H`, sobre
 *    `data/store.jsonl`), provando o "87% num único valor" que justificou a
 *    troca.
 *  - Onda 12 — `Fila`: `o quê` entra na coluna A (identidade), `id` sai
 *    (`FILA_CABECALHO`/`GEO[Fila]`).
 *  - Onda 13 — `Inscrito` deixa de ser a última coluna (~1162 px) e vira a
 *    coluna B, em `Concursos`/`Concursos · tudo`/`Empregos`. "Job 5" (marcar
 *    que se inscreveu) contado ANTES/DEPOIS pelo mesmo instrumento de
 *    arrastos (px acumulado / dobra do celular).
 *  - Onda 15 — `Projetos.frente` encolhe pra fora do orçamento de dobra;
 *    `Tarefas.criada em`/`notas`/`recorrente` já nascem fora dela (só
 *    confirmado, não migrado — ver comentário em `_norman/formatar.js`).
 *    Contagem de preenchimento REAL contra a planilha viva, com teto.
 *
 * Testes locais (determinísticos, sem rede) sempre rodam. Testes que
 * dependem da planilha viva (frozenColumnCount, preenchimento real de
 * `Projetos`/`Tarefas`) SKIPam sem as três credenciais `GOOGLE_SHEETS_*`.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const RAIZ = path.join(__dirname, '..');
require(path.join(RAIZ, 'lib', 'env')).carregarEnv(path.join(RAIZ, '.env'));

const F = require('../_norman/formulas');
const formatarMod = require('../_norman/formatar');
const A = require('../_norman/abas');
const store = require('../lib/store');

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

// Dobra de referência desta casa (390 pt de tela menos ~32 px de calha de
// número de linha) — mesma constante documentada em `_norman/formatar.js`.
const DOBRA_PX = 358;

/** Largura acumulada (px) até o ÍNDICE (inclusive) de uma coluna, por GEO. */
function acumuladoAte(geo, indice) {
  return geo.cols.slice(0, indice + 1).reduce((s, px) => s + (px || 0), 0);
}

async function main() {
  console.log('\n=== onda-ux-11-15-dobra.test.js ===\n');
  let passed = 0;
  let failed = 0;
  const nota = ok => { if (ok) passed++; else failed++; };

  // ============================================================ Onda 11
  nota(runTest('Onda 11 — DOCENTE_CABECALHO: Elegível? vem ANTES de Situação (era o contrário)', () => {
    const iEleg = F.DOCENTE_CABECALHO.indexOf('Elegível?');
    const iSit = F.DOCENTE_CABECALHO.indexOf('Situação');
    assert.ok(iEleg >= 0 && iSit >= 0, 'as duas colunas precisam existir no cabeçalho');
    assert.ok(iEleg < iSit, `Elegível? (índice ${iEleg}) devia vir antes de Situação (índice ${iSit})`);
  }));

  nota(runTest('Onda 11 — DOCENTE_GEO: a dobra (Abrir+Inscrito+Vaga+Elegível?) entrega Elegível?, nunca Situação', () => {
    const geo = formatarMod.GEO[A.PAINEL];
    const iEleg = F.DOCENTE_CABECALHO.indexOf('Elegível?');
    const iSit = F.DOCENTE_CABECALHO.indexOf('Situação');
    // Onda 13 fundiu o congelamento com a dobra: Abrir+Inscrito+Vaga+Elegível?
    // são as 4 primeiras colunas E as 4 congeladas — ver FROZEN_COLUNAS em
    // formatar.js. Aqui provamos a GEOMETRIA (índice e largura); o
    // congelamento em si é geometria de GRADE, provado ao vivo abaixo.
    assert.strictEqual(iEleg, 3, `Elegível? devia ser a 4ª coluna (índice 3), achou ${iEleg}`);
    assert.ok(iSit > iEleg, 'Situação tem que estar depois de Elegível?, fora do bloco congelado');
    const larguraCongelada = acumuladoAte(geo, iEleg);
    console.log(`    (Abrir+Inscrito+Vaga+Elegível? = ${larguraCongelada} px — congelado, sempre visível, independente da dobra inicial)`);
  }));

  nota(runTest('Onda 11 — distribuição REAL de Situação (derivada do mesmo cálculo de _calc!H sobre data/store.jsonl): um valor domina', () => {
    if (!fs.existsSync(store.STORE_PATH)) {
      console.log('    [informativo] data/store.jsonl não existe neste ambiente (gitignored) — pulando a medição real.');
      return;
    }
    // Mesma regra de `_calc!H` (formulas.js CALC.H): sem inscricao_fim ->
    // SEM PRAZO; com inscricao_fim no futuro -> ABERTO; passado -> ENCERRADO.
    const situacaoDe = r => {
      if (!r.inscricao_fim) return '⚠️ SEM PRAZO';
      const fim = new Date(r.inscricao_fim + 'T00:00:00');
      const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
      return fim >= hoje ? '🟢 ABERTO' : '🔴 ENCERRADO';
    };
    const docentes = store.listar(r => (r.trilha || 'docente') === 'docente');
    const contagem = {};
    for (const r of docentes) {
      const s = situacaoDe(r);
      contagem[s] = (contagem[s] || 0) + 1;
    }
    const total = docentes.length;
    const entradas = Object.entries(contagem).sort((a, b) => b[1] - a[1]);
    const [maiorValor, maiorN] = entradas[0] || ['—', 0];
    const pct = total ? Math.round((maiorN / total) * 100) : 0;
    console.log(`    distribuição real (${total} docentes): ${entradas.map(([k, n]) => `${k}=${n} (${Math.round(n / total * 100)}%)`).join(' · ')}`);
    assert.ok(pct >= 50, `esperava um valor de Situação dominando >=50% da amostra (achado original: 87%); achou ${maiorValor}=${pct}%`);
  }));

  // ============================================================ Onda 12
  nota(runTest('Onda 12 — FILA_CABECALHO: o quê é a coluna A (identidade), id saiu do destaque', () => {
    assert.strictEqual(F.FILA_CABECALHO[0], 'o quê', `coluna A devia ser "o quê", achou "${F.FILA_CABECALHO[0]}"`);
    assert.notStrictEqual(F.FILA_CABECALHO[0], 'id', 'id não pode mais ser a coluna A');
    const iId = F.FILA_CABECALHO.indexOf('id');
    assert.ok(iId > 0, `id tem que existir em alguma coluna depois de A, achou índice ${iId}`);
  }));

  nota(runTest('Onda 12 — GEO[Fila]: a dobra de 358 px entrega o quê (coluna A, sempre incluída por definição)', () => {
    const geo = formatarMod.GEO[A.FILA];
    assert.strictEqual(F.FILA_CABECALHO[0], 'o quê');
    const larguraA = geo.cols[0];
    assert.ok(larguraA > 0 && larguraA <= DOBRA_PX, `coluna A (o quê) = ${larguraA} px, esperado > 0 e <= ${DOBRA_PX}`);
    assert.ok(geo.wrap.includes(0), 'o quê precisa WRAP (é frase, não token curto) — índice 0 tem que estar em wrap');
  }));

  // ============================================================ Onda 13
  nota(runTest('Onda 13 — Inscrito é a coluna B em Concursos e Empregos (era a última, ~1162 px)', () => {
    assert.strictEqual(F.DOCENTE_CABECALHO.indexOf('Inscrito'), 1, `DOCENTE_CABECALHO: Inscrito devia ser índice 1, achou ${F.DOCENTE_CABECALHO.indexOf('Inscrito')}`);
    assert.strictEqual(F.MERCADO_CABECALHO.indexOf('Inscrito'), 1, `MERCADO_CABECALHO: Inscrito devia ser índice 1, achou ${F.MERCADO_CABECALHO.indexOf('Inscrito')}`);
  }));

  nota(runTest('Onda 13 — job 5 ("marcar que me inscrevi"): offset de rolagem cai de ~1162 px pra 0 (dentro do congelamento)', () => {
    const geoAntes = { cols: [62, 180, 116, 130, 116, 48, 168, 150, null, null, 120, 72, null] }; // DOCENTE_GEO pré-Onda-13 (linha-base documentada)
    const iInscritoAntes = 11; // posição de Inscrito no DOCENTE_CABECALHO pré-Onda-13
    const offsetAntes = geoAntes.cols.slice(0, iInscritoAntes).reduce((s, px) => s + (px || 0), 0);
    const arrastosAntes = Math.ceil(offsetAntes / DOBRA_PX);

    const geoDepois = formatarMod.GEO[A.PAINEL];
    const iInscritoDepois = F.DOCENTE_CABECALHO.indexOf('Inscrito');
    const offsetDepois = geoDepois.cols.slice(0, iInscritoDepois).reduce((s, px) => s + (px || 0), 0);

    console.log(`    antes: Inscrito a ${offsetAntes} px (~${arrastosAntes} arrasto(s)) · depois: Inscrito a ${offsetDepois} px, DENTRO do bloco congelado (0 arrastos, sempre visível)`);
    assert.ok(arrastosAntes >= 3, `linha-base esperava >=3 arrastos antes da Onda 13, achou ${arrastosAntes}`);
    assert.strictEqual(offsetDepois, 62, `Inscrito devia começar logo depois de Abrir (62 px), achou ${offsetDepois}`);
  }));

  // ============================================================ Onda 15
  nota(runTest('Onda 15 — GEO[Projetos]: frente encolheu (não domina mais a dobra); estágio fica alcançável bem mais cedo', () => {
    const geo = formatarMod.GEO[A.PROJETOS];
    const iFrente = F.PROJETOS_CABECALHO.indexOf('frente');
    const iEstagio = F.PROJETOS_CABECALHO.indexOf('estágio');
    assert.ok(iFrente >= 0 && iEstagio >= 0);
    const larguraFrenteAntes = 132; // linha-base documentada (N9/Onda-14, largura original)
    assert.ok(geo.cols[iFrente] < larguraFrenteAntes, `frente devia ter encolhido de ${larguraFrenteAntes} px, achou ${geo.cols[iFrente]}`);
    const offsetEstagioAntes = 216 + larguraFrenteAntes; // projeto + frente (largura antiga)
    const offsetEstagioDepois = acumuladoAte(geo, iEstagio - 1) + 0; // acumulado ATÉ estágio, exclusive
    assert.ok(offsetEstagioDepois < offsetEstagioAntes, `estágio devia ficar mais perto do início (antes ${offsetEstagioAntes} px), achou ${offsetEstagioDepois} px`);
  }));

  nota(runTest('Onda 15 — GEO[Tarefas]: criada em / notas / recorrente já nascem fora da dobra de 358 px (confirmado, não migrado)', () => {
    const geo = formatarMod.GEO[A.TAREFAS];
    const dobraFimIndice = 1; // "tarefa"+"projeto" = 358 px, dobra: fim de B
    const larguraDobra = acumuladoAte(geo, dobraFimIndice);
    assert.ok(larguraDobra <= DOBRA_PX, `dobra (tarefa+projeto) = ${larguraDobra} px, esperado <= ${DOBRA_PX}`);
    for (const rotulo of ['criada em', 'notas', 'recorrente']) {
      const i = F.TAREFAS_CABECALHO.indexOf(rotulo);
      assert.ok(i > dobraFimIndice, `"${rotulo}" (índice ${i}) devia estar depois do fim da dobra (índice ${dobraFimIndice})`);
    }
  }));

  const semCredencial = !process.env.GOOGLE_SHEETS_SPREADSHEET_ID
    || !process.env.GOOGLE_SHEETS_CLIENT_EMAIL || !process.env.GOOGLE_SHEETS_PRIVATE_KEY;
  if (semCredencial) {
    console.log('\n  SKIP (provas ao vivo) — sem as três credenciais GOOGLE_SHEETS_* em .env; congelamento de grade e preenchimento real só se provam contra a planilha viva.\n');
    console.log(`\n${passed} passou(aram), ${failed} falhou(aram)\n`);
    process.exit(failed > 0 ? 1 : 0);
  }

  const a = require('../_norman/api');

  // Onda 13 + V4(Leva 6) — frozenColumnCount ao vivo já é coberto por
  // tests/onda-ux-1-4-5-geometria-abas.test.js (Painel/Tudo/Empregos = 4/4/4
  // desde a Leva 6); não duplicado aqui.

  // ============================================================ Onda 15 (ao vivo)
  nota(await runTestAsync('Onda 15 — Projetos!frente: preenchimento real contra teto (0% esperado, medido AVALIACAO-UX Parte 2 §6)', async () => {
    const l = F.LINHAS[A.PROJETOS];
    const colFrente = F.letraDe(F.PROJETOS_CABECALHO, 'frente');
    const colProjeto = F.letraDe(F.PROJETOS_CABECALHO, 'projeto');
    const r = await a.ler(`${A.PROJETOS}!${colProjeto}${l.dados}:${colFrente}${F.PROJETOS_ULTIMA_LINHA}`);
    const linhas = (r.values || []).filter(row => String((row || [])[0] || '').trim() !== '');
    const iFrenteRel = colFrente.charCodeAt(0) - colProjeto.charCodeAt(0);
    const preenchidas = linhas.filter(row => String((row || [])[iFrenteRel] || '').trim() !== '').length;
    const teto = 0.5; // teto declarado: se mais de 50% dos projetos reais tiverem "frente", a coluna merece voltar pra dobra — não é o caso hoje.
    const pct = linhas.length ? preenchidas / linhas.length : 0;
    console.log(`    Projetos!frente: ${preenchidas}/${linhas.length} linha(s) preenchida(s) (${Math.round(pct * 100)}%, teto ${Math.round(teto * 100)}%)`);
    assert.ok(linhas.length === 0 || pct <= teto, `frente preenchida em ${Math.round(pct * 100)}% dos projetos reais — acima do teto ${Math.round(teto * 100)}%, encolher a coluna pode ter sido cedo demais`);
  }));

  nota(await runTestAsync('Onda 15 — Tarefas!criada em / notas / recorrente: preenchimento real contra teto', async () => {
    const l = F.LINHAS[A.TAREFAS];
    const ult = String.fromCharCode(64 + F.TAREFAS_CABECALHO.length);
    const r = await a.ler(`${A.TAREFAS}!A${l.dados}:${ult}1000`);
    const linhas = (r.values || []).filter(row => String((row || [])[0] || '').trim() !== '');
    const teto = 0.5;
    const falhas = [];
    for (const rotulo of ['criada em', 'notas', 'recorrente']) {
      const i = F.TAREFAS_CABECALHO.indexOf(rotulo);
      const preenchidas = linhas.filter(row => String((row || [])[i] || '').trim() !== '').length;
      const pct = linhas.length ? preenchidas / linhas.length : 0;
      console.log(`    Tarefas!${rotulo}: ${preenchidas}/${linhas.length} (${Math.round(pct * 100)}%, teto ${Math.round(teto * 100)}%)`);
      if (linhas.length > 0 && pct > teto) falhas.push(`${rotulo}=${Math.round(pct * 100)}%`);
    }
    assert.strictEqual(falhas.length, 0, `coluna(s) acima do teto: ${falhas.join(', ')}`);
  }));

  console.log(`\n${passed} passou(aram), ${failed} falhou(aram)\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('ERRO\n' + (err && err.stack || err));
  process.exit(1);
});
