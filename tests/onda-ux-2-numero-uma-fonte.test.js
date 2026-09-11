#!/usr/bin/env node
'use strict';

/**
 * REMODELAÇÃO CRM 2026-09-01 — Leva 1, Bloco A, Onda UX 2 (+ Emenda E1).
 * `.claude/plans/radar-ux-20-ondas.md` Bloco A intervenção 2 +
 * `_norman/AVALIACAO-UX.md` Parte 2 §1 / Parte 3 intervenção 2 +
 * `.claude/plans/remodelacao-crm-2026-09-01.md` Leva 1, Emenda E1.
 *
 * O DEFEITO MEDIDO (Hoje!F11, 2026-09-01, ao vivo): "↳ Nada na fila." e,
 * uma linha abaixo, "+ 989 não cabem aqui — abra 🎯 Fila". `Fila!C` é
 * ARRAYFORMULA (`FILA_OQUE_DERIVADO`) e devolve `""` pra toda linha vazia;
 * `COUNTIFS(...;"<>")` conta esse `""` de FÓRMULA como não-vazio (padrão de
 * texto, não comparação booleana) — `999 - 10 = 989`. Mesma classe de
 * defeito em `Trabalho` (⏳ "radar é novo" + "+22 não estão nesta tabela" na
 * MESMA tabela) e nos quatro contadores de `Notícias` (somavam mais que o
 * universo real da aba).
 *
 * PROVA — controle triplo (o mesmo, aplicado às DUAS famílias de contador
 * que a Onda toca): lista vazia -> contador ausente; N>teto -> contador é
 * EXATAMENTE N-teto; N<=teto -> contador ausente. A parte estática confere
 * que o MECANISMO mudou (SUMPRODUCT com comparação booleana no lugar de
 * COUNTIFS com padrão de texto; sobra clampada no MESMO teto que o corpo
 * usa). A parte ao vivo recalcula o oráculo em Node, a partir do MESMO dado
 * cru que a fórmula lê (`Fila`/`notícias (não edite)`), e compara contra o
 * texto que a planilha realmente renderizou — nunca contra um número fixo
 * herdado de uma leitura antiga (essa foi a lição do próprio `+989`: um
 * número redondo vira mentira no instante em que o dado muda).
 *
 * Se `.env` não tem as três credenciais `GOOGLE_SHEETS_*`, a parte AO VIVO
 * avisa e pula — a parte ESTÁTICA roda sempre (não depende de rede).
 */

const assert = require('assert');
const path = require('path');
const RAIZ = path.join(__dirname, '..');
require(path.join(RAIZ, 'lib', 'env')).carregarEnv(path.join(RAIZ, '.env'));

const F = require('../_norman/formulas');
const A = require('../_norman/abas');
const N = require('../noticias');

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
  console.log('\n=== onda-ux-2-numero-uma-fonte.test.js ===\n');

  let passed = 0;
  let failed = 0;
  const nota = ok => { if (ok) passed++; else failed++; };

  // =========================================================== ESTÁTICO
  nota(runTest('FILA (Hoje): a contagem não usa mais COUNTIFS(...;"<>") — armadilha do "+989"', () => {
    const bloco = F.HOJE_BLOCOS.find(b => b.chave === 'FILA');
    assert.ok(bloco, 'bloco FILA não existe em HOJE_BLOCOS');
    assert.ok(!/COUNTIFS\([^)]*;"<>"/.test(bloco.contagem),
      `bloco.contagem ainda casa o padrão COUNTIFS(...;"<>"): ${bloco.contagem}`);
    assert.ok(bloco.contagem.includes('SUMPRODUCT'), `bloco.contagem não usa SUMPRODUCT: ${bloco.contagem}`);
  }));

  nota(runTest('EMENDA E1: o título do bloco 🌐 NOTÍCIA de Hoje não promete "o que ENTROU" (delta) — diz o que o número É', () => {
    const bloco = F.HOJE_BLOCOS.find(b => b.chave === 'NOTICIA');
    assert.ok(bloco, 'bloco NOTICIA não existe em HOJE_BLOCOS');
    assert.ok(!/entrou/i.test(bloco.titulo), `título ainda promete "entrou" (delta): ${bloco.titulo}`);
    assert.ok(bloco.titulo.includes(String(F.HOJE_JANELA_NOTICIA_DIAS)), 'título perdeu a janela declarada em dias');
  }));

  nota(runTest('Notícias/Trabalho: a "sobra" do rodapé usa o MESMO teto que o corpo (MIN(...;NOTICIA_TETO)) e só aparece com algo mostrado (sem contradição vazio+transbordo)', () => {
    const formula = F.noticiaTabela(A.TRABALHO, F.NOTICIA_FAIXAS[1]); // 7d, faixa não-diaCorrente
    assert.ok(formula.includes('MIN(') && formula.includes(String(F.NOTICIA_TETO)),
      'rodapé não clampa contagemTabela no mesmo NOTICIA_TETO que ARRAY_CONSTRAIN usa no corpo');
    assert.ok(formula.includes('mostrados>0'),
      'rodapé não está condicionado a "mostrados>0" — pode voltar a contradizer o estado vazio (achado no Trabalho, AVALIACAO-UX §1)');
  }));

  // =============================================================== AO VIVO
  const semCredencial = !process.env.GOOGLE_SHEETS_SPREADSHEET_ID
    || !process.env.GOOGLE_SHEETS_CLIENT_EMAIL || !process.env.GOOGLE_SHEETS_PRIVATE_KEY;
  if (semCredencial) {
    console.log('  (parte ao vivo) SKIP — sem as três credenciais GOOGLE_SHEETS_* em .env.\n');
    console.log(`\n${passed} passou(aram), ${failed} falhou(aram)\n`);
    process.exit(failed > 0 ? 1 : 0);
  }

  const a = require('../_norman/api');

  nota(await runTestAsync('CONTROLE TRIPLO — Fila/Hoje: o rodapé "+N não cabem aqui" bate com N-teto recalculado do dado cru (ou fica ausente)', async () => {
    const lf = F.LINHAS[A.FILA].dados;
    const r = await a.ler(`${A.FILA}!C${lf}:E`, 'valueRenderOption=UNFORMATTED_VALUE');
    const linhas = r.values || [];
    // A MESMA exclusão que `HOJE_EXCLUI_FILA`/`HOJE_EXCLUI_FILA_PRODUTO` usam
    // (F.FILA_ESTAGIOS_FORA_DO_HOJE) — recalculada em Node contra o dado cru
    // de `Fila!C:E`, não contra um número fixo.
    const excluidos = new Set(F.FILA_ESTAGIOS_FORA_DO_HOJE);
    const n = linhas.filter(row => {
      const oQue = (row || [])[0];
      const estagio = (row || [])[2];
      return oQue && oQue !== '' && !excluidos.has(estagio);
    }).length;
    const teto = F.HOJE_TETO_FILA;
    const esperado = n > teto ? `+ ${n - teto} não cabem aqui — abra ${F.ROTULO_NAV[A.FILA]}` : null;

    const l = F.LINHAS[A.HOJE];
    const ate = F.hojeUltimaLinha();
    const fim = F.colunaLetra(F.HOJE_COLUNAS_ABA.length - 1);
    const painel = await a.ler(`${A.HOJE}!A${l.lista}:${fim}${ate}`);
    const achado = (painel.values || []).flat().find(v => typeof v === 'string' && v.includes('não cabem aqui — abra ' + F.ROTULO_NAV[A.FILA]));

    if (esperado) {
      assert.ok(achado, `Fila tem ${n} item(ns) (teto ${teto}) — devia haver rodapé de transbordo e não achei nenhum`);
      assert.ok(achado.includes(`+ ${n - teto} `), `rodapé achado ("${achado}") não bate com N-teto = ${n - teto}`);
    } else {
      assert.strictEqual(achado, undefined, `Fila tem ${n} item(ns) (<= teto ${teto}) — rodapé de transbordo devia estar AUSENTE, achei: "${achado}"`);
    }
  }));

  nota(await runTestAsync('CONTROLE TRIPLO — as 16 tabelas de notícia (4 abas × 4 janelas): nunca vazio+transbordo juntos, e sobra bate com o oráculo recalculado', async () => {
    const fato = await a.ler(`${A.ND}!A2:K`, 'valueRenderOption=UNFORMATTED_VALUE');
    const linhas = fato.values || [];
    const IDX = { quando: 3, aba: 4, faixa: 9 };
    const hojeSerial = Math.floor(N.serialDoSheets(Date.now()));

    const faixasAbrangidas = [];
    for (const aba of A.VISTAS_NOTICIA) {
      const pipeline = F.NOTICIA_ABA_PIPELINE[aba];
      F.NOTICIA_FAIXAS.forEach((faixaInfo, i) => {
        const contagemJanela = linhas.filter(row => {
          const quando = row[IDX.quando];
          if (row[IDX.aba] !== pipeline || typeof quando !== 'number') return false;
          return faixaInfo.diaCorrente ? Math.floor(quando) === hojeSerial : quando >= hojeSerial - faixaInfo.dias;
        }).length;
        const contagemTabela = linhas.filter(row => row[IDX.aba] === pipeline && row[IDX.faixa] === faixaInfo.codigo).length;
        const mostrados = Math.min(contagemTabela, F.NOTICIA_TETO);
        const sobra = Math.max(0, contagemJanela - mostrados);
        const esperado = (mostrados > 0 && sobra > 0) ? `${F.MARCADOR_VAZIO}+ ${sobra} não estão nesta tabela.` : null;
        faixasAbrangidas.push({ aba, i, faixaInfo, esperado });
      });
    }

    // Lê as 16 colunas "título" de uma vez (batchGet), da linha `lista` até o
    // fim de cada bloco — uma requisição só, mesma economia de cota que
    // `escreverVarios`/`lerVarios` já defendem em `_norman/api.js`.
    const ranges = A.VISTAS_NOTICIA.flatMap(aba => {
      const l = F.LINHAS[aba];
      const ate = F.noticiaUltimaLinha(aba);
      return F.NOTICIA_FAIXAS.map((_, i) => `${aba}!${F.noticiaLetra(i, F.NOTICIA_COL_LISTA)}${l.lista}:${F.noticiaLetra(i, F.NOTICIA_COL_LISTA)}${ate}`);
    });
    const blocos = await a.lerVarios(ranges);

    let checadas = 0;
    faixasAbrangidas.forEach((f, idx) => {
      const coluna = (blocos[idx] || []).flat().filter(v => typeof v === 'string');
      const temVazio = coluna.some(v => v.includes('radar é novo') || v.includes('Nada nesta janela'));
      const rodapeAchado = coluna.find(v => v.includes('não estão nesta tabela'));
      assert.ok(!(temVazio && rodapeAchado),
        `${f.aba} · faixa ${f.faixaInfo.codigo}: vazio E transbordo juntos na mesma tabela — "${rodapeAchado}"`);
      if (f.esperado) {
        assert.ok(rodapeAchado && rodapeAchado.startsWith(f.esperado),
          `${f.aba} · faixa ${f.faixaInfo.codigo}: esperava rodapé "${f.esperado}", achei "${rodapeAchado}"`);
      } else {
        assert.strictEqual(rodapeAchado, undefined,
          `${f.aba} · faixa ${f.faixaInfo.codigo}: esperava rodapé AUSENTE, achei "${rodapeAchado}"`);
      }
      checadas++;
    });
    console.log(`    (${checadas}/16 combinações aba×janela conferidas contra o oráculo recalculado)`);
  }));

  console.log(`\n${passed} passou(aram), ${failed} falhou(aram)\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('ERRO\n' + (err && err.stack || err));
  process.exit(1);
});
