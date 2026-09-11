#!/usr/bin/env node
'use strict';

/**
 * Testa lib/guarda-janela.js — guarda por JANELA (não mais por dia civil),
 * DIFERENCIADA por trilha (Rota Hermes, Fase F0):
 *   - vaga: 2h    - noticia: 8h
 *
 * O briefing exige cobrir os DOIS lados (só o lado que pula não distingue
 * "guarda funciona" de "guarda bloqueia tudo"):
 *   (a) segunda execução DENTRO da mesma janela é PULADA;
 *   (b) execução em janela NOVA (janela expirada) RODA.
 * Cobre também: as duas trilhas têm janelas independentes (marcar uma não
 * afeta a outra); migração do formato antigo { data, executado_em }; e
 * ausência/corrupção de arquivo tratada como "nunca rodou" (roda), não como
 * erro.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const guardaJanela = require('../lib/guarda-janela');

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

function novoCaminhoTemp() {
  return path.join(os.tmpdir(), `radar-guarda-janela-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
}

function limpar(p) {
  try {
    fs.unlinkSync(p);
  } catch (e) {
    // já não existe - ok
  }
}

function main() {
  console.log('\n=== guarda-janela.test.js ===\n');
  let passed = 0;
  let failed = 0;

  const tests = [
    ['trilha vaga: nunca rodou (arquivo ausente) -> NÃO deve pular (roda)', () => {
      const p = novoCaminhoTemp();
      assert.strictEqual(guardaJanela.dentroDaJanela('vaga', new Date(), p), false);
    }],

    // --- lado (a): dentro da mesma janela é PULADA ---
    ['trilha vaga: marcada agora, checada 10min depois (< 2h) -> PULA', () => {
      const p = novoCaminhoTemp();
      const t0 = new Date('2026-09-10T10:00:00.000Z');
      guardaJanela.registrarExecucao('vaga', t0, p);
      const t1 = new Date(t0.getTime() + 10 * 60 * 1000); // +10min
      assert.strictEqual(guardaJanela.dentroDaJanela('vaga', t1, p), true);
      limpar(p);
    }],

    ['trilha vaga: marcada agora, checada a 1min do fim da janela (1h59min) -> ainda PULA', () => {
      const p = novoCaminhoTemp();
      const t0 = new Date('2026-09-10T10:00:00.000Z');
      guardaJanela.registrarExecucao('vaga', t0, p);
      const t1 = new Date(t0.getTime() + (2 * 60 - 1) * 60 * 1000); // +1h59min
      assert.strictEqual(guardaJanela.dentroDaJanela('vaga', t1, p), true);
      limpar(p);
    }],

    // --- lado (b): janela nova (expirada) RODA ---
    ['trilha vaga: marcada agora, checada 2h01min depois (> janela de 2h) -> RODA', () => {
      const p = novoCaminhoTemp();
      const t0 = new Date('2026-09-10T10:00:00.000Z');
      guardaJanela.registrarExecucao('vaga', t0, p);
      const t1 = new Date(t0.getTime() + (2 * 60 + 1) * 60 * 1000); // +2h01min
      assert.strictEqual(guardaJanela.dentroDaJanela('vaga', t1, p), false);
      limpar(p);
    }],

    ['trilha vaga: checada EXATAMENTE nos 2h (limite) -> janela já expirou, RODA', () => {
      const p = novoCaminhoTemp();
      const t0 = new Date('2026-09-10T10:00:00.000Z');
      guardaJanela.registrarExecucao('vaga', t0, p);
      const t1 = new Date(t0.getTime() + 2 * 60 * 60 * 1000); // +2h exatas
      assert.strictEqual(guardaJanela.dentroDaJanela('vaga', t1, p), false);
      limpar(p);
    }],

    // --- trilha noticia: janela própria de 8h, independente da de vaga ---
    ['trilha noticia: marcada agora, checada 2h depois (< 8h) -> PULA (janela própria, maior)', () => {
      const p = novoCaminhoTemp();
      const t0 = new Date('2026-09-10T10:00:00.000Z');
      guardaJanela.registrarExecucao('noticia', t0, p);
      const t1 = new Date(t0.getTime() + 2 * 60 * 60 * 1000); // +2h — pularia se fosse janela de vaga, mas noticia é 8h
      assert.strictEqual(guardaJanela.dentroDaJanela('noticia', t1, p), true);
      limpar(p);
    }],

    ['trilha noticia: marcada agora, checada 8h01min depois -> RODA', () => {
      const p = novoCaminhoTemp();
      const t0 = new Date('2026-09-10T10:00:00.000Z');
      guardaJanela.registrarExecucao('noticia', t0, p);
      const t1 = new Date(t0.getTime() + (8 * 60 + 1) * 60 * 1000); // +8h01min
      assert.strictEqual(guardaJanela.dentroDaJanela('noticia', t1, p), false);
      limpar(p);
    }],

    // --- as duas trilhas são independentes no MESMO arquivo ---
    ['marcar vaga não afeta a marca de noticia no mesmo arquivo (e vice-versa)', () => {
      const p = novoCaminhoTemp();
      const t0 = new Date('2026-09-10T10:00:00.000Z');
      guardaJanela.registrarExecucao('noticia', t0, p); // noticia roda cedo
      const t1 = new Date(t0.getTime() + 60 * 60 * 1000); // +1h
      // vaga nunca rodou nesse arquivo -> não deve pular, mesmo com noticia marcada
      assert.strictEqual(guardaJanela.dentroDaJanela('vaga', t1, p), false);
      guardaJanela.registrarExecucao('vaga', t1, p);
      // noticia continua marcada com t0, independente da escrita de vaga em t1
      const noticiaAinda = guardaJanela.obterUltimaExecucao('noticia', p);
      assert.strictEqual(noticiaAinda.toISOString(), t0.toISOString());
      // e vaga, dentro da sua própria janela de 2h a partir de t1, pula
      const t2 = new Date(t1.getTime() + 30 * 60 * 1000); // +30min sobre t1
      assert.strictEqual(guardaJanela.dentroDaJanela('vaga', t2, p), true);
      limpar(p);
    }],

    // --- migração do formato antigo ---
    ['formato antigo { data, executado_em } aplica o MESMO instante às duas trilhas', () => {
      const p = novoCaminhoTemp();
      const antigo = { data: '2026-09-10', executado_em: '2026-09-10T08:00:00.000Z' };
      fs.writeFileSync(p, JSON.stringify(antigo));
      const t1 = new Date('2026-09-10T09:00:00.000Z'); // +1h sobre a marca antiga
      // vaga (janela 2h): +1h ainda dentro -> pula
      assert.strictEqual(guardaJanela.dentroDaJanela('vaga', t1, p), true);
      // noticia (janela 8h): +1h ainda dentro -> pula também
      assert.strictEqual(guardaJanela.dentroDaJanela('noticia', t1, p), true);
      limpar(p);
    }],

    ['formato antigo NÃO causa crash — leitura tolera o shape sem `vaga`/`noticia`', () => {
      const p = novoCaminhoTemp();
      const antigo = { data: '2026-09-10', executado_em: '2026-09-10T08:00:00.000Z' };
      fs.writeFileSync(p, JSON.stringify(antigo));
      assert.doesNotThrow(() => guardaJanela.dentroDaJanela('vaga', new Date(), p));
      limpar(p);
    }],

    ['registrarExecucao() sobre marca em formato antigo grava no formato NOVO, por trilha', () => {
      const p = novoCaminhoTemp();
      const antigo = { data: '2026-09-10', executado_em: '2026-09-10T08:00:00.000Z' };
      fs.writeFileSync(p, JSON.stringify(antigo));
      const t1 = new Date('2026-09-10T09:00:00.000Z');
      guardaJanela.registrarExecucao('vaga', t1, p);
      const relido = JSON.parse(fs.readFileSync(p, 'utf8'));
      assert.strictEqual(relido.vaga.executado_em, t1.toISOString());
      // a trilha noticia, migrada da marca antiga, sobrevive à escrita de vaga
      assert.strictEqual(relido.noticia.executado_em, antigo.executado_em);
      limpar(p);
    }],

    // --- robustez: arquivo corrompido/JSON inválido não lança, trata como "nunca rodou" ---
    ['JSON inválido no arquivo -> não lança, trata como "nunca rodou" (roda)', () => {
      const p = novoCaminhoTemp();
      fs.writeFileSync(p, '{ isto não é json válido');
      assert.doesNotThrow(() => guardaJanela.dentroDaJanela('vaga', new Date(), p));
      assert.strictEqual(guardaJanela.dentroDaJanela('vaga', new Date(), p), false);
      limpar(p);
    }],

    ['trilha inválida lança erro explícito (não silencioso)', () => {
      const p = novoCaminhoTemp();
      assert.throws(() => guardaJanela.dentroDaJanela('inexistente', new Date(), p));
    }],

    ['JANELAS_MS declara vaga=2h e noticia=8h (contrato do briefing)', () => {
      assert.strictEqual(guardaJanela.JANELAS_MS.vaga, 2 * 60 * 60 * 1000);
      assert.strictEqual(guardaJanela.JANELAS_MS.noticia, 8 * 60 * 60 * 1000);
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
