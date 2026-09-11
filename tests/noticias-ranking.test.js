#!/usr/bin/env node
'use strict';

/**
 * Ranking — `lib-noticias/ranking.js`.
 *
 * `score = repercussao_normalizada(0-60) + perfil_bump(0-40)`, com a
 * repercussão convertida em percentil DENTRO do lote do mesmo dia, da mesma
 * aba E DA MESMA TABELA (tema) — ONDA 7e (radar-crm-20-ondas.md): grupo
 * ampliado em 2026-08-28, era só `(dia, aba)` antes. O que este arquivo
 * trava:
 *
 *  - o percentil de meio-rank, que é a única leitura honesta de um lote onde
 *    quase todo item empata em `n_veiculos = 1`;
 *  - a fórmula log do Hacker News, e o fato de que Reddit (sem score) cai no
 *    outro ramo;
 *  - ONDA 7e-1: `tabela` isola o lote do percentil — um tema com sinal
 *    contínuo (HN) não amassa mais o percentil de um tema empatado (RSS) só
 *    por dividir a mesma aba; medido contra o store real (RELATORIO-ONDA-
 *    7-10.md §Onda 7e) e travado em `tests/noticias-faixas-cascata.test.js`;
 *  - o match por fronteira de palavra vs. prefixo (`termo*`);
 *  - os recortes — ONDA 7b (radar-crm-20-ondas.md): doutrina INVERTIDA em
 *    2026-08-28, as janelas ordenam por SCORE (data_ms como desempate), não
 *    mais por data. C10 (mesmo dia): de 3 para 4 recortes — `hoje` (dia
 *    civil corrente, não "últimos 3 dias") · `semana` (7d) · `quinzena`
 *    (15d, nova) · `mes` (era `top-mes`). Testes de cascata completa
 *    (exclusão cumulativa por cluster_id E por url canônica, teto 20, dedup
 *    de cluster/url dentro da janela, piso de diversidade por tema — ONDA
 *    7e-2) moraram para `tests/noticias-faixas-cascata.test.js`, contra o
 *    store real.
 */

const assert = require('assert');
const ranking = require('../lib-noticias/ranking');
const { normalizarTitulo } = require('../lib-noticias/ancoras');

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
const AGORA = Date.parse('2026-08-27T18:00:00.000Z');

function main() {
  console.log('\n=== noticias-ranking.test.js ===\n');
  let passed = 0;
  let failed = 0;

  const tests = [
    // ------------------------------------------------------ match de termo
    ['casaTermo usa fronteira de palavra — "ux" NÃO bate dentro de "auxiliar"', () => {
      // Falso positivo real, já documentado em lib/keyword-filtro.js.
      assert.strictEqual(ranking.casaTermo('auxiliar de saude', 'ux'), false);
      assert.strictEqual(ranking.casaTermo('vaga de ux writer', 'ux'), true);
    }],

    ['casaTermo com `*` é prefixo — "trabalh*" pega trabalho, trabalhador e trabalhista', () => {
      assert.strictEqual(ranking.casaTermo('mercado de trabalho aquecido', 'trabalh*'), true);
      assert.strictEqual(ranking.casaTermo('direito do trabalhador', 'trabalh*'), true);
      assert.strictEqual(ranking.casaTermo('reforma trabalhista', 'trabalh*'), true);
      assert.strictEqual(ranking.casaTermo('retrabalho constante', 'trabalh*'), false, 'prefixo, não substring');
    }],

    ['casaTermo é indiferente a acento (o texto chega normalizado)', () => {
      assert.strictEqual(ranking.casaTermo(normalizarTitulo('Educação a distância'), 'educacao'), true);
    }],

    // ------------------------------------------------------- perfil_bump
    ['perfil_bump soma os termos do perfil e é CAPADO no teto de 40', () => {
      const r = ranking.perfilBump('Anthropic lanca Claude para agentes de design e pesquisa em interface');
      assert.strictEqual(r.pontos, 40, 'saturou no teto');
      assert.ok(r.matches.includes('claude'));
      assert.ok(r.matches.includes('anthropic'));
    }],

    ['perfil_bump de título sem nenhum termo do perfil é 0 — não há piso inventado', () => {
      const r = ranking.perfilBump('Bolsa fecha em alta com dolar estavel');
      assert.strictEqual(r.pontos, 0);
      assert.deepStrictEqual(r.matches, []);
    }],

    ['perfil_bump usa config/keywords.json como BASE (briefing) — termo de lá pontua sozinho', () => {
      const cfg = ranking.carregarConfig();
      const daBase = cfg.termosPerfil.filter(t => t.origem === 'keywords.json');
      assert.ok(daBase.length > 0, 'a base do briefing tem que estar carregada');
      const r = ranking.perfilBump('Congresso debate tecnologia educacional nas escolas');
      assert.ok(r.pontos > 0, 'termo vindo de keywords.json pontua');
    }],

    ['config/perfil.json diz QUAIS áreas são de JB — Design entra, e é derivado, não escrito à mão', () => {
      const cfg = ranking.carregarConfig({ recarregar: true });
      assert.ok(cfg.areasDoPerfil.includes('Design'), 'area_mestrado/area_graduacao de JB são de Design');
    }],

    // -------------------------------------------------------- sinal bruto
    ['sinal bruto de fonte SEM score nativo é n_veiculos do cluster', () => {
      assert.strictEqual(ranking.sinalBruto({ pontos: null }, { n_veiculos: 3 }), 3);
      assert.strictEqual(ranking.sinalBruto({}, null), 1, 'sem cluster, 1 — nunca 0 nem NaN');
    }],

    ['sinal bruto do HN é log10(pontos+1)*2 + log10(comentarios+1)*1.5', () => {
      const s = ranking.sinalBruto({ pontos: 999, comentarios: 99 }, null);
      const esperado = Math.log10(1000) * 2 + Math.log10(100) * 1.5;
      assert.ok(Math.abs(s - esperado) < 1e-9);
      assert.ok(Math.abs(s - 9) < 1e-9, '3*2 + 2*1.5 = 9');
    }],

    ['o log comprime: 1618 pontos não vale 100x mais que 16', () => {
      const alto = ranking.sinalBruto({ pontos: 1618, comentarios: 0 }, null);
      const baixo = ranking.sinalBruto({ pontos: 16, comentarios: 0 }, null);
      assert.ok(alto / baixo < 3, 'razão comprimida: ' + (alto / baixo).toFixed(2));
      assert.ok(alto > baixo, 'mas continua ordenando certo');
    }],

    ['comentário pesa MENOS que ponto (1,5 contra 2) — debate e aprovação não são a mesma coisa', () => {
      const soPontos = ranking.sinalBruto({ pontos: 99, comentarios: 0 }, null);
      const soComentarios = ranking.sinalBruto({ pontos: 0, comentarios: 99 }, null);
      assert.ok(soPontos > soComentarios);
    }],

    ['Reddit (pontos null) cai no ramo de n_veiculos — perda declarada, não disfarçada', () => {
      assert.strictEqual(ranking.sinalBruto({ pontos: null, comentarios: null }, { n_veiculos: 1 }), 1);
    }],

    // ---------------------------------------------------------- percentil
    ['percentil de MEIO-RANK: num lote todo empatado, todo mundo fica em 50 — não em 0 nem em 100', () => {
      assert.strictEqual(ranking.percentilMeioRank(1, [1, 1, 1, 1]), 50);
    }],

    ['percentil de meio-rank ordena certo quando há diferença', () => {
      const valores = [1, 1, 1, 4];
      assert.strictEqual(ranking.percentilMeioRank(4, valores), 87.5);
      assert.strictEqual(ranking.percentilMeioRank(1, valores), 37.5);
    }],

    ['lote de UM item devolve 50 (neutro) — não há posição relativa sem contra quem comparar', () => {
      assert.strictEqual(ranking.percentilMeioRank(7, [7]), 50);
    }],

    // -------------------------------------------------- score fim a fim
    ['ONDA 7e: o percentil é calculado DENTRO de (dia, aba, tabela) — abas diferentes não competem entre si (era só (dia,aba) até 2026-08-28)', () => {
      const porItem = new Map();
      const itens = [
        { id: 'g1', titulo: 'Fato generico A', aba: 'geral', dataMs: AGORA },
        { id: 'g2', titulo: 'Fato generico B', aba: 'geral', dataMs: AGORA },
        // sozinho na aba ia -> lote de 1 -> percentil 50, mesmo com n_veiculos 1
        { id: 'i1', titulo: 'Fato generico C', aba: 'ia', dataMs: AGORA }
      ];
      porItem.set('g1', { cluster_id: 'c1', n_veiculos: 5, n_itens: 5 });
      porItem.set('g2', { cluster_id: 'c2', n_veiculos: 1, n_itens: 1 });
      porItem.set('i1', { cluster_id: 'c3', n_veiculos: 1, n_itens: 1 });

      ranking.calcularScores(itens, porItem);
      assert.strictEqual(itens[0].percentil, 75, 'o mais repercutido da aba geral');
      assert.strictEqual(itens[1].percentil, 25);
      assert.strictEqual(itens[2].percentil, 50, 'lote de 1 na aba ia — neutro');
      assert.strictEqual(itens[2].lote_tamanho, 1);
    }],

    [
      'ONDA 7e-1: `tabela` (tema) TAMBÉM isola o lote do percentil, dentro da MESMA aba — ' +
        'a causa medida do sintoma "ia-geral varrido a zero por reddit-hn" (RELATORIO-ONDA-7-10.md §Onda 7e)',
      () => {
        const porItem = new Map();
        // MESMA aba ('ia'), tabelas diferentes: um tema com sinal CONTÍNUO
        // (HN, log de pontos — imita reddit-hn) e um tema todo empatado em
        // n_veiculos=1 (imita ia-geral). Antes da Onda 7e (grupo só por
        // (dia,aba)), o item de HN varria o percentil do outro tema porque
        // a régua era a MESMA para os dois. Agora cada tabela tem seu
        // próprio lote — o item empatado da tabela `ia-geral` vira 50
        // (neutro DENTRO do próprio tema), não é mais amassado pelo HN.
        const itens = [
          { id: 'hn1', titulo: 'post do HN', aba: 'ia', tabela: 'reddit-hn', dataMs: AGORA, pontos: 900, comentarios: 300 },
          { id: 'rss1', titulo: 'materia rss A', aba: 'ia', tabela: 'ia-geral', dataMs: AGORA },
          { id: 'rss2', titulo: 'materia rss B', aba: 'ia', tabela: 'ia-geral', dataMs: AGORA }
        ];
        porItem.set('hn1', null);
        porItem.set('rss1', { cluster_id: 'r1', n_veiculos: 1, n_itens: 1 });
        porItem.set('rss2', { cluster_id: 'r2', n_veiculos: 1, n_itens: 1 });

        ranking.calcularScores(itens, porItem);
        const rss1 = itens.find(i => i.id === 'rss1');
        const rss2 = itens.find(i => i.id === 'rss2');
        assert.strictEqual(rss1.percentil, 50, 'empatado com rss2 DENTRO do próprio tema — nunca vê o sinal do HN');
        assert.strictEqual(rss2.percentil, 50);
        assert.strictEqual(rss1.lote_tamanho, 2, 'o lote de ia-geral tem 2 itens, não 3 — o HN está em outro lote');
      }
    ],

    ['score = repercussao + perfil_bump, e repercussao vai de 0 a 60', () => {
      const porItem = new Map([['a', { cluster_id: 'c', n_veiculos: 1, n_itens: 1 }]]);
      const itens = [{ id: 'a', titulo: 'Anthropic lanca Claude para agentes', aba: 'ia', dataMs: AGORA }];
      ranking.calcularScores(itens, porItem);
      assert.strictEqual(itens[0].score, itens[0].repercussao + itens[0].perfil_bump);
      assert.ok(itens[0].repercussao >= 0 && itens[0].repercussao <= 60);
      assert.ok(itens[0].perfil_bump >= 0 && itens[0].perfil_bump <= 40);
    }],

    ['dia_lote usa o fuso de JB (UTC-3): 23h UTC ainda é o MESMO dia no Brasil', () => {
      assert.strictEqual(ranking.diaLote(Date.parse('2026-08-27T23:00:00Z')), '2026-08-27');
      assert.strictEqual(ranking.diaLote(Date.parse('2026-08-28T02:00:00Z')), '2026-08-27');
      assert.strictEqual(ranking.diaLote(Date.parse('2026-08-28T04:00:00Z')), '2026-08-28');
      assert.strictEqual(ranking.diaLote(null), null);
    }],

    // ----------------------------------------------------------- recortes
    // C10 (radar-crm-20-ondas.md) — de 3 para 4 recortes: `hoje` (dia civil,
    // não "últimos 3 dias") entra na frente, `quinzena` (15d) é nova entre
    // `semana` e `mes`. `top-mes` virou `mes`; `ultimos-3-dias` SAIU.
    ['C10: recorte "hoje" pega só o DIA CIVIL corrente (fuso de JB), não uma janela de horas', () => {
      const regs = [
        { titulo: 'hoje cedo', data_ms: AGORA - 2 * 3600000, score: 10 }, // mesmo dia civil de AGORA
        { titulo: 'ontem', data_ms: AGORA - 1 * DIA, score: 90 },
        { titulo: 'velho', data_ms: AGORA - 10 * DIA, score: 99 }
      ];
      const r = ranking.aplicarRecorte(regs, 'hoje', { agora: AGORA });
      assert.strictEqual(r.length, 1, 'só o item do MESMO dia civil de AGORA entra — "ontem" fica fora mesmo dentro de 24h');
      assert.strictEqual(r[0].titulo, 'hoje cedo');
    }],

    ['mes ordena por SCORE (pergunta de relevância), não por data', () => {
      const regs = [
        { titulo: 'hoje fraco', data_ms: AGORA - 1 * DIA, score: 10 },
        { titulo: 'ha 20 dias forte', data_ms: AGORA - 20 * DIA, score: 90 }
      ];
      const r = ranking.aplicarRecorte(regs, 'mes', { agora: AGORA });
      assert.strictEqual(r[0].titulo, 'ha 20 dias forte');
    }],

    ['semana cobre 7 dias; o de 8 dias cai fora', () => {
      const regs = [
        { titulo: 'dentro', data_ms: AGORA - 6 * DIA, score: 1 },
        { titulo: 'fora', data_ms: AGORA - 8 * DIA, score: 1 }
      ];
      const r = ranking.aplicarRecorte(regs, 'semana', { agora: AGORA });
      assert.strictEqual(r.length, 1);
      assert.strictEqual(r[0].titulo, 'dentro');
    }],

    ['quinzena cobre 15 dias; o de 16 dias cai fora', () => {
      const regs = [
        { titulo: 'dentro', data_ms: AGORA - 14 * DIA, score: 1 },
        { titulo: 'fora', data_ms: AGORA - 16 * DIA, score: 1 }
      ];
      const r = ranking.aplicarRecorte(regs, 'quinzena', { agora: AGORA });
      assert.strictEqual(r.length, 1);
      assert.strictEqual(r[0].titulo, 'dentro');
    }],

    ['registro sem data não entra em recorte nenhum — nunca é promovido a "recente"', () => {
      const regs = [{ titulo: 'sem data', data_ms: null, score: 100 }];
      assert.strictEqual(ranking.aplicarRecorte(regs, 'hoje', { agora: AGORA }).length, 0);
      assert.strictEqual(ranking.aplicarRecorte(regs, 'mes', { agora: AGORA }).length, 0);
    }],

    ['recorte desconhecido é ERRO, não lista vazia silenciosa', () => {
      assert.throws(() => ranking.aplicarRecorte([], 'ultimos-3-meses'), /recorte desconhecido/);
    }]
  ];

  for (const [name, fn] of tests) {
    if (runTest(name, fn)) passed++;
    else failed++;
  }

  console.log(`\n${passed} passou(aram), ${failed} falhou(aram)\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
