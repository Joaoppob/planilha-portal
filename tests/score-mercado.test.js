#!/usr/bin/env node
'use strict';

/**
 * Testa a rubrica de score da trilha mercado (lib/score-mercado.js) — mesmo
 * espírito de tests/score.test.js (trilha docente), mas cobrindo a rubrica
 * PRÓPRIA (aderência de keyword + recência, ver comentário de topo de
 * lib/score-mercado.js). Config real do projeto (config/keywords-mercado.json),
 * não uma cópia sintética — se o peso de um termo mudar lá, este teste sente.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const scoreMercado = require('../lib/score-mercado');

const keywordsMercadoConfig = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'config', 'keywords-mercado.json'), 'utf8')
);

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
  console.log('\n=== score-mercado.test.js ===\n');
  let passed = 0;
  let failed = 0;

  const tests = [
    ['avaliarAderencia: texto sem nenhum termo -> passou=false, pesoAderencia=0', () => {
      const r = scoreMercado.avaliarAderencia('vaga de auxiliar de limpeza', keywordsMercadoConfig);
      assert.strictEqual(r.passou, false);
      assert.strictEqual(r.pesoAderencia, 0);
    }],

    ['avaliarAderencia: bate por fronteira de palavra, não substring cru (mesma classe de bug corrigida na trilha docente)', () => {
      // "ux" não deveria bater dentro de "luxo" — mesma regressão que motivou
      // contemTermo em lib/keyword-filtro.js (achado real do DOU: "ux" batia
      // em "auxiliar").
      const r = scoreMercado.avaliarAderencia('vaga para gerente de loja de luxo', keywordsMercadoConfig);
      assert.strictEqual(r.passou, false);
    }],

    ['avaliarAderencia: reconhece termo real de IA/Agentes e escolhe área pelo termo de maior peso', () => {
      const r = scoreMercado.avaliarAderencia('Especialista em RAG e agentes de IA', keywordsMercadoConfig);
      assert.strictEqual(r.passou, true);
      assert.strictEqual(r.area, 'IA/Agentes');
      assert.ok(r.matches.some(m => m.termo === 'rag'));
    }],

    ['avaliarAderencia: soma pesos de múltiplos termos e capa em TETO_ADERENCIA', () => {
      const textoForte = 'Engenheiro de IA — Machine Learning, RAG, LLM, agentes, orquestração, context engineering, ciência de dados';
      const r = scoreMercado.avaliarAderencia(textoForte, keywordsMercadoConfig);
      assert.strictEqual(r.passou, true);
      assert.ok(r.pesoAderencia <= scoreMercado.TETO_ADERENCIA, 'pesoAderencia nunca deveria passar do teto');
      assert.strictEqual(r.pesoAderencia, scoreMercado.TETO_ADERENCIA, 'texto forte o bastante deveria bater o teto');
    }],

    ['calcular: sem aderência (pesoAderencia=0) -> score=0, veredito=fora', () => {
      const r = scoreMercado.calcular({ pesoAderencia: 0, dataPublicacao: '2026-08-26' });
      assert.strictEqual(r.score, 0);
      assert.strictEqual(r.veredito, 'fora');
      assert.strictEqual(r.elegibilidade.area_compativel, null);
    }],

    ['calcular: com aderência -> veredito=aderente (nunca vocabulário docente)', () => {
      const r = scoreMercado.calcular({ pesoAderencia: 30, dataPublicacao: '2026-08-26' }, new Date('2026-08-26'));
      assert.strictEqual(r.veredito, 'aderente');
      assert.notStrictEqual(r.veredito, 'elegivel_agora');
      assert.notStrictEqual(r.veredito, 'indeterminada');
    }],

    ['scoreRecencia: publicação de hoje pontua o máximo, publicação antiga pontua menos', () => {
      const agora = new Date('2026-08-26T12:00:00Z');
      const recente = scoreMercado.scoreRecencia('2026-08-26', agora);
      const antiga = scoreMercado.scoreRecencia('2026-06-01', agora);
      assert.ok(recente > antiga, `recente (${recente}) deveria pontuar mais que antiga (${antiga})`);
    }],

    ['scoreRecencia: data ausente/inválida não quebra, fica neutro-baixo', () => {
      assert.strictEqual(typeof scoreMercado.scoreRecencia(null), 'number');
      assert.strictEqual(typeof scoreMercado.scoreRecencia('data-invalida'), 'number');
    }],

    ['calcular: score total nunca ultrapassa 85 (mesmo teto da trilha docente, ver comentário de topo)', () => {
      const r = scoreMercado.calcular({ pesoAderencia: 999, dataPublicacao: '2026-08-26' }, new Date('2026-08-26'));
      assert.ok(r.score <= 85, `score (${r.score}) nunca deveria passar de 85 — mesma escala do score_minimo compartilhado`);
    }],

    ['config real: toda vaga achada por um termo_busca também pontua em avaliarAderencia (usa o próprio termo de busca como texto — nunca um "achado zero")', () => {
      const semCobertura = keywordsMercadoConfig.termos_busca.filter(
        termo => !scoreMercado.avaliarAderencia(termo, keywordsMercadoConfig).passou
      );
      assert.deepStrictEqual(
        semCobertura,
        [],
        `termos de busca cujo próprio texto não pontua em termos_aderencia (vaga encontrada mas nunca pontuada): ${JSON.stringify(semCobertura)}`
      );
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
