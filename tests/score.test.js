#!/usr/bin/env node
'use strict';

/**
 * Testa a rubrica de score (estágio 2) — não exigido explicitamente pelo
 * briefing como mínimo, mas cobre a lógica mais arriscada de acerto (a
 * combinação de área+elegibilidade+geografia+urgência e o veto negativo).
 */

const assert = require('assert');
const score = require('../lib/score');

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
  console.log('\n=== score.test.js ===\n');
  let passed = 0;
  let failed = 0;

  const perfil = { titulacao_atual: 'mestrado_incerto' };

  const tests = [
    ['negativo=true força score=0 e veredito=fora, sem depender dos outros fatores', () => {
      const r = score.calcular({ pesoArea: 40, titulacaoExigida: 'graduacao', perfil, uf: 'SP', inscricaoFim: '2026-08-15', negativo: true });
      assert.strictEqual(r.score, 0);
      assert.strictEqual(r.veredito, 'fora');
    }],

    ['vaga elegivel_agora + área Design (40) + prazo urgente = score no teto (sem geografia no cálculo)', () => {
      const daqui7dias = new Date();
      daqui7dias.setDate(daqui7dias.getDate() + 5);
      const r = score.calcular({
        pesoArea: 40,
        titulacaoExigida: 'graduacao',
        perfil,
        uf: 'SP',
        inscricaoFim: daqui7dias.toISOString().slice(0, 10),
        negativo: false
      });
      assert.strictEqual(r.veredito, 'elegivel_agora');
      // teto da rubrica sem geografia: área(40) + elegibilidade(30) + urgência(15) = 85
      assert.strictEqual(r.score, 85, `esperava score no teto (85), veio ${r.score}`);
    }],

    ['vaga elegivel_futuro pontua menos que elegivel_agora em igualdade de outros fatores', () => {
      const params = { pesoArea: 40, perfil, uf: 'SP', inscricaoFim: null, negativo: false };
      const agora = score.calcular({ ...params, titulacaoExigida: 'graduacao' });
      const futuro = score.calcular({ ...params, titulacaoExigida: 'doutorado' });
      assert.ok(agora.score > futuro.score);
    }],

    ['titulação null -> veredito indeterminada (Onda 1.7), pontua menos que elegivel_futuro mas NUNCA vira fora', () => {
      const params = { pesoArea: 40, perfil, uf: 'SP', inscricaoFim: null, negativo: false };
      const futuro = score.calcular({ ...params, titulacaoExigida: 'doutorado' });
      const indeterminado = score.calcular({ ...params, titulacaoExigida: null });
      assert.strictEqual(indeterminado.veredito, 'indeterminada');
      assert.notStrictEqual(indeterminado.veredito, 'fora');
      assert.ok(indeterminado.score > 0, 'score de indeterminada nunca deveria ser 0 (isso é território do veto negativo)');
      assert.ok(indeterminado.score < futuro.score, 'indeterminada deveria pontuar menos que elegivel_futuro (menos confiança no dado)');
    }],

    ['geografia não influencia mais o score — UF não discrimina (JB aceita vaga em qualquer UF do Brasil)', () => {
      const paramsBase = { pesoArea: 40, titulacaoExigida: 'graduacao', perfil, inscricaoFim: null, negativo: false };
      const comSP = score.calcular({ ...paramsBase, uf: 'SP' });
      const comOutraUf = score.calcular({ ...paramsBase, uf: 'PB' });
      const semUf = score.calcular({ ...paramsBase, uf: null });
      assert.strictEqual(comSP.score, comOutraUf.score);
      assert.strictEqual(comSP.score, semUf.score);
    }],

    ['score nunca ultrapassa 85 (teto sem o eixo de geografia)', () => {
      const daqui2dias = new Date();
      daqui2dias.setDate(daqui2dias.getDate() + 2);
      const r = score.calcular({
        pesoArea: 999, // valor absurdo, testa o cap
        titulacaoExigida: 'graduacao',
        perfil,
        uf: 'SP',
        inscricaoFim: daqui2dias.toISOString().slice(0, 10),
        negativo: false
      });
      assert.ok(r.score <= 85, `score deveria ter cap em 85, veio ${r.score}`);
    }],

    ['scoreUrgencia: prazo já vencido pontua pouco mas não derruba o item (>0)', () => {
      const u = score.scoreUrgencia('2020-01-01');
      assert.ok(u >= 0 && u < 5);
    }],

    ['scoreUrgencia: prazo desconhecido é neutro (nem máximo nem mínimo)', () => {
      const u = score.scoreUrgencia(null);
      assert.ok(u > 2 && u < 15);
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
