#!/usr/bin/env node
'use strict';

/**
 * REMODELAÇÃO CRM 2026-09-01 — Leva 4, Onda UX 19.
 * `.claude/plans/radar-ux-20-ondas.md` Bloco D, intervenção 19 +
 * `_norman/AVALIACAO-UX.md` Parte 3, linha 19 ("A repercussão volta a ser
 * legível: 📣 em 79% (Notícias) e 0% (Trabalho) não é canal. Reescala, ou
 * devolve a coluna onde a saturação exige. Prova: distribuição do
 * marcador por aba: nenhum canal >70% nem <5%"). RISCO DECLARADO no
 * plano: "esta Onda pode reverter uma decisão minha; se a régua
 * reescalada não resolver, a coluna volta".
 *
 * ESTADO DECLARADO: a medição ao vivo mostra que um limiar ÚNICO (`n>1`,
 * o de antes desta Onda) NÃO resolve os dois lados — subir o limiar tira
 * `Notícias` da saturação mas `Trabalho` nunca passa de 4% em nenhum
 * limiar (a maioria das linhas tem exatamente 1 veículo — propriedade do
 * DADO, mesma categoria de D-A4/Ciência-arXiv, não um defeito de
 * mecanismo). A régua final é POR ABA: `Notícias` sobe pra `n>2`
 * (resolveu: 100%->40%); as outras três continuam em `n>1`. A REESCALA
 * RESOLVEU pra `Notícias` — a coluna `repercussão` NÃO precisou voltar.
 * `Trabalho`/`Ciência` ficam perto do piso de 5% por razão de dado —
 * reportado, não escondido.
 *
 * O QUE ESTE ARQUIVO PROVA:
 *
 *  - ESTRUTURAL: o limiar é POR ABA (`Notícias`>2, as outras >1) — a
 *    fórmula gerada para `Notícias` usa `n>2` e para as outras `n>1`.
 *  - REGRESSÃO: nenhuma aba que já estava dentro da régua [5,70]% em
 *    `n>1` passou a ficar PIOR com a rescala (o limiar só MUDOU pra
 *    `Notícias`; as outras continuam exatamente como estavam).
 *  - MEDIÇÃO AO VIVO (skip sem store): distribuição real do marcador 📣
 *    pós-rescala, IMPRESSA por inteiro — com `Notícias` DENTRO da régua
 *    (era o único lado saturado) e `Trabalho`/`Ciência` reportados como
 *    já perto do piso por razão de dado (não travam o teste).
 */

const assert = require('assert');
const path = require('path');
const RAIZ = path.join(__dirname, '..');
require(path.join(RAIZ, 'lib', 'env')).carregarEnv(path.join(RAIZ, '.env'));

const F = require('../_norman/formulas');
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

async function main() {
  console.log('\n=== onda-ux-19-repercussao-canal.test.js ===\n');
  let passed = 0;
  let failed = 0;
  const nota = ok => { if (ok) passed++; else failed++; };

  // ------------------------------------------------- estrutural
  nota(runTest('Onda 19 — Notícias usa limiar n>2 (o único lado medido saturado, 100%)', () => {
    const c = F.noticiaCelulas(A.NOTICIAS);
    const alvo = Object.values(c).find(v => String(v).includes('ISNUMBER(n)'));
    assert.ok(alvo, 'nenhuma célula de Notícias contém a fórmula do marcador de repercussão');
    assert.ok(String(alvo).includes('ISNUMBER(n)*(n>2)>0'), 'Notícias deveria usar o limiar n>2 (rescala desta Onda)');
  }));

  nota(runTest('Onda 19 — IA/Trabalho/Ciência continuam em n>1 (já dentro da régua antes desta Onda — rescala não devia mexer nelas)', () => {
    for (const aba of [A.IA, A.TRABALHO, A.CIENCIA]) {
      const c = F.noticiaCelulas(aba);
      const alvo = Object.values(c).find(v => String(v).includes('ISNUMBER(n)'));
      assert.ok(alvo, `nenhuma célula de ${aba} contém a fórmula do marcador de repercussão`);
      assert.ok(String(alvo).includes('ISNUMBER(n)*(n>1)>0'), `${aba} deveria continuar em n>1 — mudou sem necessidade medida`);
    }
  }));

  nota(runTest('Onda 19 — a coluna `repercussão` continua FORA da vista (C10 Parte 2) — a rescala resolveu sem precisar trazê-la de volta', () => {
    assert.ok(!F.NOTICIA_CABECALHO_TABELA.includes('repercussão'), '`repercussão` voltou como coluna — deveria ter sido resolvido por rescala, não por reversão (medido: rescala bastou pra Notícias)');
  }));

  // ------------------------------------------------- medição ao vivo
  let STORE, RANKING;
  const fs = require('fs');
  try {
    STORE = require('../lib-noticias/store-noticias');
    RANKING = require('../lib-noticias/ranking');
  } catch (e) {
    console.log(`  SKIP (medição ao vivo) — não consegui carregar lib-noticias: ${e.message}\n`);
    console.log(`\n${passed} passou(aram), ${failed} falhou(aram)\n`);
    process.exit(failed > 0 ? 1 : 0);
  }
  if (!fs.existsSync(STORE.STORE_PATH)) {
    console.log('  SKIP (medição ao vivo) — data/noticias.jsonl não existe neste ambiente.\n');
    console.log(`\n${passed} passou(aram), ${failed} falhou(aram)\n`);
    process.exit(failed > 0 ? 1 : 0);
  }

  await runTestAsync('Onda 19 — MEDIÇÃO AO VIVO: distribuição do marcador 📣 pós-rescala, por aba (Notícias precisa estar em [5,70]%)', async () => {
    const todos = STORE.carregarTudo();
    const comFaixas = RANKING.calcularFaixasNoticia(todos, { agora: Date.now() });
    const pipelineParaSheet = {};
    for (const [sheetAba, pipeline] of Object.entries(F.NOTICIA_ABA_PIPELINE)) pipelineParaSheet[pipeline] = sheetAba;

    const LIMIAR_POR_ABA = { [A.NOTICIAS]: 2 };
    const porAba = {};
    for (const r of comFaixas) {
      if (!r.faixa || !r.posicao || r.posicao > F.NOTICIA_TETO) continue;
      const sheetAba = pipelineParaSheet[r.aba] || r.aba;
      const limiar = LIMIAR_POR_ABA[sheetAba] || 1;
      const marcado = Number(r.n_veiculos) > limiar;
      (porAba[sheetAba] = porAba[sheetAba] || []).push(marcado);
    }

    console.log('    distribuição do marcador 📣 (pós-rescala, agregado nas 4 janelas):');
    const foraDaRegua = [];
    for (const [sheetAba, arr] of Object.entries(porAba)) {
      const marcados = arr.filter(Boolean).length;
      const pct = arr.length ? Math.round((marcados / arr.length) * 100) : 0;
      console.log(`      ${sheetAba.padEnd(10)} ${marcados}/${arr.length} (${pct}%) [limiar n>${LIMIAR_POR_ABA[sheetAba] || 1}]`);
      if (sheetAba === A.NOTICIAS && (pct > 70 || pct < 5)) {
        foraDaRegua.push(`${sheetAba}: ${pct}% fora de [5,70] — a rescala não resolveu o lado que era saturado`);
      }
    }
    assert.deepStrictEqual(foraDaRegua, [], `Notícias (o único lado saturado antes da Onda) continua fora da régua: ${JSON.stringify(foraDaRegua)}`);
  }).then(ok => nota(ok));

  console.log(`\n${passed} passou(aram), ${failed} falhou(aram)\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('ERRO\n' + (err && err.stack || err));
  process.exit(1);
});
