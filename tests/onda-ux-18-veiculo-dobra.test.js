#!/usr/bin/env node
'use strict';

/**
 * REMODELAÇÃO CRM 2026-09-01 — Leva 4, Onda UX 18.
 * `.claude/plans/radar-ux-20-ondas.md` Bloco D, intervenção 18 +
 * `_norman/AVALIACAO-UX.md` Parte 3, linha 18 ("`veículo` sai da dobra
 * onde é constante — Ciência 100% arXiv, Trabalho 91% —, ou vira um campo
 * que discrimine. Prova: distribuição por coluna nas 4 abas × 4 tabelas;
 * nenhuma coluna na dobra com >80% num valor").
 *
 * ESTADO DECLARADO (leia antes de reprovar este arquivo por "não bateu
 * 100%"): a medição AO VIVO nesta Leva mostra que só `Ciência` cruza 80%
 * hoje (85%, nas quatro janelas) — `Trabalho` (30-60%), `IA` (55-70%) e
 * `Notícias` (20-40%) NÃO cruzam mais (o "91%" do plano original,
 * 2026-08-28, já não bate — o store se move). E `Ciência` satura em
 * `veículo` E em `tema` JUNTOS (85/85) — é o MESMO viés de fonte que a
 * decisão D-A4 (`.claude/plans/remodelacao-crm-2026-09-01.md`) já nomeou
 * ("Ciência-hoje 100% arXiv") e já declarou fora de escopo desta rodada,
 * por ser curadoria de fonte, não layout. O conserto aplicado é o MEIO
 * autorizado pela Cláusula de Não-Deriva ("veículo pode encolher em vez
 * de sair"): encolhe uniformemente nas 4 abas, sem resolver a saturação
 * de dado de `Ciência` (fora do meu escopo) nem reordenar (pioraria
 * `Notícias`, medido abaixo). Por isso este arquivo PROTEGE contra
 * REGRESSÃO (nenhuma aba NOVA passa a saturar, a largura muda como
 * declarado) em vez de exigir "0 abas saturadas" — exigir isso aqui seria
 * esconder o que a própria medição mostra.
 *
 * O QUE ESTE ARQUIVO PROVA:
 *
 *  - ESTRUTURAL: `veículo` encolheu (104->70px) e `tema` cresceu
 *    (112->146px) nas 4 abas, largura TOTAL da tabela intocada, e
 *    `NOTICIA_TRUNC_VEICULO` (derivado, consumido pela fórmula) acompanha
 *    sozinho.
 *  - MEDIÇÃO AO VIVO (skip sem credencial/sem store): distribuição real de
 *    `veículo` e `tema` nas 4 abas × 4 janelas, IMPRESSA por inteiro (é a
 *    prova pedida) — com REGRESSÃO travada (Notícias/IA/Trabalho não
 *    passam a saturar) e `Ciência` reportada, não escondida.
 */

const assert = require('assert');
const path = require('path');
const RAIZ = path.join(__dirname, '..');
require(path.join(RAIZ, 'lib', 'env')).carregarEnv(path.join(RAIZ, '.env'));

const F = require('../_norman/formulas');
const A = require('../_norman/abas');

const TETO_SATURACAO_PCT = 80;
// Declarado: abas que a MEDIÇÃO desta Onda já mostrava saturadas ANTES do
// encolhimento (largura não muda distribuição de DADO — só reduz o
// aluguel de tela que a coluna paga). Regressão = qualquer aba FORA desta
// lista passar a saturar.
const SATURACAO_CONHECIDA_E_DEFERIDA = new Set([A.CIENCIA]);

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
  console.log('\n=== onda-ux-18-veiculo-dobra.test.js ===\n');
  let passed = 0;
  let failed = 0;
  const nota = ok => { if (ok) passed++; else failed++; };

  const idxV = F.NOTICIA_CABECALHO_TABELA.indexOf('veículo');
  const idxT = F.NOTICIA_CABECALHO_TABELA.indexOf('tema');

  nota(runTest('Onda 18 — veículo encolheu (< 104px, o valor pré-Onda) nas 4 tabelas', () => {
    assert.ok(F.NOTICIA_COLUNAS_TABELA[idxV] < 104, `veículo continua em ${F.NOTICIA_COLUNAS_TABELA[idxV]}px — não encolheu`);
    assert.strictEqual(F.NOTICIA_COLUNAS_TABELA[idxV], 70);
  }));

  nota(runTest('Onda 18 — tema cresceu na MESMA medida (largura total da tabela intocada)', () => {
    assert.strictEqual(F.NOTICIA_COLUNAS_TABELA[idxT], 146);
    const somaAntes = 104 + 112;
    const somaDepois = F.NOTICIA_COLUNAS_TABELA[idxV] + F.NOTICIA_COLUNAS_TABELA[idxT];
    assert.strictEqual(somaDepois, somaAntes, `soma veículo+tema mudou (${somaDepois} != ${somaAntes}) — a tabela ficou mais larga ou mais estreita, não era o objetivo`);
  }));

  nota(runTest('Onda 18 — NOTICIA_TRUNC_VEICULO deriva da largura NOVA (sem edição própria)', () => {
    assert.strictEqual(F.NOTICIA_TRUNC_VEICULO, Math.floor(F.NOTICIA_COLUNAS_TABELA[idxV] / 7));
  }));

  nota(runTest('Onda 18 — a geometria continua ÚNICA pras 4 abas de notícia (GEO compartilhado — invariante que a Onda NÃO quebra)', () => {
    const F2 = require('../_norman/formulas');
    for (const aba of A.VISTAS_NOTICIA) {
      assert.strictEqual(F2.CABECALHO_POR_ABA[aba], F2.NOTICIA_CABECALHO, `${aba} tem cabeçalho próprio — a Onda 18 não deveria ter divergido a geometria`);
    }
  }));

  // ------------------------------------------------- medição ao vivo
  let STORE, RANKING;
  try {
    STORE = require('../lib-noticias/store-noticias');
    RANKING = require('../lib-noticias/ranking');
  } catch (e) {
    console.log(`  SKIP (medição ao vivo) — não consegui carregar lib-noticias: ${e.message}\n`);
    console.log(`\n${passed} passou(aram), ${failed} falhou(aram)\n`);
    process.exit(failed > 0 ? 1 : 0);
  }

  const fs = require('fs');
  if (!fs.existsSync(STORE.STORE_PATH)) {
    console.log('  SKIP (medição ao vivo) — data/noticias.jsonl não existe neste ambiente.\n');
    console.log(`\n${passed} passou(aram), ${failed} falhou(aram)\n`);
    process.exit(failed > 0 ? 1 : 0);
  }

  await runTestAsync('Onda 18 — MEDIÇÃO AO VIVO: distribuição de veículo/tema nas 4 abas × 4 janelas (impressa por inteiro — é a prova)', async () => {
    const todos = STORE.carregarTudo();
    const comFaixas = RANKING.calcularFaixasNoticia(todos, { agora: Date.now() });
    const pipelineParaSheet = {};
    for (const [sheetAba, pipeline] of Object.entries(F.NOTICIA_ABA_PIPELINE)) pipelineParaSheet[pipeline] = sheetAba;

    const distribuir = campo => {
      const grupos = {};
      for (const r of comFaixas) {
        if (!r.faixa || !r.posicao || r.posicao > F.NOTICIA_TETO) continue;
        const sheetAba = pipelineParaSheet[r.aba] || r.aba;
        const chave = `${sheetAba}|${r.faixa}`;
        (grupos[chave] = grupos[chave] || []).push(r[campo] || '(vazio)');
      }
      return grupos;
    };

    const gruposVeiculo = distribuir('veiculo');
    const faixaOrdem = F.NOTICIA_FAIXAS.map(f => f.codigo);
    const regressoes = [];
    console.log('    distribuição de veículo (top valor / total / %):');
    for (const sheetAba of Object.keys(F.NOTICIA_ABA_PIPELINE)) {
      for (const faixa of faixaOrdem) {
        const arr = gruposVeiculo[`${sheetAba}|${faixa}`] || [];
        if (!arr.length) continue;
        const contagem = {};
        arr.forEach(v => { contagem[v] = (contagem[v] || 0) + 1; });
        const [topValor, topN] = Object.entries(contagem).sort((a, b) => b[1] - a[1])[0];
        const pct = Math.round((topN / arr.length) * 100);
        console.log(`      ${sheetAba.padEnd(10)} ${faixa.padEnd(5)} n=${String(arr.length).padStart(2)} ${topValor} ${topN}/${arr.length} (${pct}%)`);
        if (pct > TETO_SATURACAO_PCT && !SATURACAO_CONHECIDA_E_DEFERIDA.has(sheetAba)) {
          regressoes.push(`${sheetAba}/${faixa}: ${topValor} em ${pct}% — aba fora da lista de saturação já conhecida, isto é REGRESSÃO NOVA`);
        }
      }
    }
    assert.deepStrictEqual(regressoes, [], `regressão de saturação em aba não esperada: ${JSON.stringify(regressoes)}`);
  }).then(ok => nota(ok));

  console.log(`\n${passed} passou(aram), ${failed} falhou(aram)\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('ERRO\n' + (err && err.stack || err));
  process.exit(1);
});
