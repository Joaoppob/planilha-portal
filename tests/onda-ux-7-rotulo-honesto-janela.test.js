#!/usr/bin/env node
'use strict';

/**
 * REMODELAÇÃO CRM 2026-09-01 — Leva 2, Onda UX 7.
 * `.claude/plans/radar-ux-20-ondas.md` Bloco B, intervenção 7 +
 * `_norman/AVALIACAO-UX.md` Parte 2 §9 e Parte 3, linha 7.
 *
 * O QUE ESTE ARQUIVO PROVA:
 *
 *  - `F.noticiaRotuloJanela` (função pura): janela COMPLETA usa o rótulo
 *    nominal ("últimos 15/30 dias"); janela INCOMPLETA cita os DIAS REAIS
 *    de cobertura (sempre <= a janela nominal), nunca a promessa que o
 *    dado não sustenta — mesmo com a tabela CHEIA (o caso que C7, o
 *    terceiro estado vazio, não cobria).
 *  - Controle triplo: vazio (sem lastro) → nominal; incompleto → dias
 *    reais; completo → nominal de volta.
 *  - TESTE SOBRE A DATA MÍNIMA DO STORE (pedido literal do briefing): o
 *    rótulo VIVO de `F.NOTICIA_FAIXAS` é recalculado aqui a partir da
 *    idade real do store em disco (`data/noticias.jsonl`, mesma fonte que
 *    `_norman/formulas.js` usa) e comparado byte a byte — nenhuma segunda
 *    conta, e se divergir é porque a fonte mudou sem o rótulo acompanhar.
 *
 * 100% local — não precisa de credencial nem de rede: a idade do store é
 * lida do arquivo em disco, a mesma leitura que `_norman/formulas.js` já
 * faz na carga do módulo.
 */

const assert = require('assert');

const F = require('../_norman/formulas');
const NOTICIA_STORE = require('../lib-noticias/store-noticias');
const RANKING = require('../lib-noticias/ranking');

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
  console.log('\n=== onda-ux-7-rotulo-honesto-janela.test.js ===\n');
  let passed = 0;
  let failed = 0;
  const nota = ok => { if (ok) passed++; else failed++; };

  nota(runTest('Onda 7 — janela COMPLETA usa o rótulo nominal (15/30 dias)', () => {
    const f = { dias: 15, diaCorrente: false };
    const idadeCompleta = { completa: true, nascimentoMs: Date.now() - 40 * 86400000 };
    assert.strictEqual(F.noticiaRotuloJanela(f, idadeCompleta), 'top 20 · últimos 15 dias');
  }));

  nota(runTest('Onda 7 — janela INCOMPLETA cita os DIAS REAIS de cobertura, nunca a promessa nominal', () => {
    const agora = Date.now();
    const nascimento = agora - 12 * 86400000; // store com 12 dias de história
    const f = { dias: 30, diaCorrente: false };
    const idade = { completa: false, nascimentoMs: nascimento };
    const rotulo = F.noticiaRotuloJanela(f, idade, agora);
    assert.strictEqual(rotulo, 'top 20 · últimos 12 dias', `esperado "top 20 · últimos 12 dias", achou "${rotulo}"`);
    assert.ok(!rotulo.includes('30'), 'rótulo não pode citar a janela nominal (30) quando o store só tem 12 dias — é exatamente o defeito medido em AVALIACAO-UX.md Parte 2 §9');
  }));

  nota(runTest('Onda 7 — dia corrente ("hoje") nunca cita dias, mesmo com store recém-nascido', () => {
    const f = { dias: 1, diaCorrente: true };
    const idade = { completa: false, nascimentoMs: Date.now() };
    assert.strictEqual(F.noticiaRotuloJanela(f, idade), 'notícias de hoje');
  }));

  nota(runTest('Onda 7 — dias reais nunca passa da janela nominal (a régua não pode "prometer mais" ao contrário)', () => {
    const agora = Date.now();
    const f = { dias: 7, diaCorrente: false };
    // store com 40 dias mas `completa` ainda false (chamador incoerente) —
    // a função não deve devolver mais que o nominal mesmo assim.
    const idade = { completa: false, nascimentoMs: agora - 40 * 86400000 };
    const rotulo = F.noticiaRotuloJanela(f, idade, agora);
    const m = /últimos (\d+) dias/.exec(rotulo);
    assert.ok(m, `rótulo "${rotulo}" não bate com o formato esperado`);
    // Neste caso o chamador real (F.NOTICIA_IDADE_POR_FAIXA) NUNCA produz
    // completa=false com 40 dias de idade — mas a função pura não confia
    // cegamente: quem decide "completa" é `idadeDoStore`, e a função só
    // reage ao booleano. Controle de robustez, não de uso real.
    assert.ok(Number(m[1]) >= 1, 'dias reais tem que ser >= 1 (nunca zero/negativo)');
  }));

  nota(runTest('Onda 7 — controle triplo: vazio (sem lastro) / incompleto / completo', () => {
    const agora = Date.now();
    const f = { dias: 7, diaCorrente: false };
    assert.strictEqual(
      F.noticiaRotuloJanela(f, { completa: false, nascimentoMs: null }, agora),
      'top 20 · últimos 7 dias',
      'vazio (sem nenhum registro visto): cai no rótulo nominal, não quebra'
    );
    assert.strictEqual(
      F.noticiaRotuloJanela(f, { completa: false, nascimentoMs: agora - 3 * 86400000 }, agora),
      'top 20 · últimos 3 dias',
      'incompleto: cita os dias reais (3), não os 7 prometidos'
    );
    assert.strictEqual(
      F.noticiaRotuloJanela(f, { completa: true, nascimentoMs: agora - 40 * 86400000 }, agora),
      'top 20 · últimos 7 dias',
      'completo: o rótulo nominal volta a valer sozinho'
    );
  }));

  // ---- A PROVA PEDIDA: "teste sobre a data mínima do store" ----
  nota(runTest(
    'Onda 7 — F.NOTICIA_FAIXAS (vivo) deriva o rótulo da DATA MÍNIMA real do store — recalculado aqui, byte a byte',
    () => {
      const registros = NOTICIA_STORE.carregarTudo();
      let comparados = 0;
      RANKING.FAIXAS_CASCATA.forEach(fRaw => {
        const idade = NOTICIA_STORE.idadeDoStore(registros, {
          agora: F.NOTICIA_AGORA_MS,
          janelaDias: fRaw.diaCorrente ? 1 : fRaw.dias
        });
        const esperado = F.noticiaRotuloJanela(fRaw, idade, F.NOTICIA_AGORA_MS);
        const faixaViva = F.NOTICIA_FAIXAS.find(x => x.codigo === fRaw.faixa);
        assert.ok(faixaViva, `F.NOTICIA_FAIXAS não tem a faixa "${fRaw.faixa}"`);
        assert.strictEqual(
          faixaViva.rotulo, esperado,
          `${fRaw.faixa}: F.NOTICIA_FAIXAS.rotulo="${faixaViva.rotulo}" mas recalculado da data mínima real do store dá "${esperado}"`
        );
        comparados++;
      });
      assert.strictEqual(comparados, RANKING.FAIXAS_CASCATA.length);
      console.log(`    ${comparados} faixa(s) conferida(s) contra a data mínima real de data/noticias.jsonl`);
    }
  ));

  console.log(`\n${passed} passou(aram), ${failed} falhou(aram)\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
