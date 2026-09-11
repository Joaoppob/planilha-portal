#!/usr/bin/env node
'use strict';

/**
 * Testa lib/extrator-mercado.js (modalidade + senioridade da trilha
 * mercado) — inclui os títulos reais capturados em
 * tests/fixtures/gupy-itens-reais.json.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const extratorMercado = require('../lib/extrator-mercado');

const itensReais = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'gupy-itens-reais.json'), 'utf8'));

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
  console.log('\n=== extrator-mercado.test.js ===\n');
  let passed = 0;
  let failed = 0;

  const tests = [
    ['extrairModalidade: workplaceType on-site -> presencial (item real Akiyama)', () => {
      assert.strictEqual(extratorMercado.extrairModalidade(itensReais.normal), 'presencial');
    }],

    ['extrairModalidade: workplaceType remote -> remoto (item real Stefanini/Colômbia)', () => {
      assert.strictEqual(extratorMercado.extrairModalidade(itensReais.estrangeira), 'remoto');
    }],

    ['extrairModalidade: workplaceType hybrid -> hibrido', () => {
      assert.strictEqual(extratorMercado.extrairModalidade({ workplaceType: 'hybrid' }), 'hibrido');
    }],

    ['extrairModalidade: sem workplaceType mas isRemoteWork=true -> remoto (fallback)', () => {
      assert.strictEqual(extratorMercado.extrairModalidade({ isRemoteWork: true }), 'remoto');
    }],

    ['extrairModalidade: sem nenhum sinal -> null, nunca inventa', () => {
      assert.strictEqual(extratorMercado.extrairModalidade({}), null);
      assert.strictEqual(extratorMercado.extrairModalidade(null), null);
    }],

    ['extrairSenioridade: reconhece "Sênior" no título real (Analista de Canais Conversacionais e IA - Sênior)', () => {
      assert.strictEqual(extratorMercado.extrairSenioridade('Analista de Canais Conversacionais e IA - Sênior'), 'senior');
    }],

    ['extrairSenioridade: reconhece "SR" no título real (DESIGNER UX/UI SR)', () => {
      assert.strictEqual(extratorMercado.extrairSenioridade(itensReais.talentPool.name), 'senior');
    }],

    ['extrairSenioridade: reconhece pleno, júnior, estágio, trainee, coordenador, especialista', () => {
      assert.strictEqual(extratorMercado.extrairSenioridade('Analista de UX/UI Pleno'), 'pleno');
      assert.strictEqual(extratorMercado.extrairSenioridade('Desenvolvedor Júnior'), 'junior');
      assert.strictEqual(extratorMercado.extrairSenioridade('Analista de IA Jr.'), 'junior');
      assert.strictEqual(extratorMercado.extrairSenioridade('Estágio em Tecnologia - Automação, IA & Desenvolvimento'), 'estagio');
      assert.strictEqual(extratorMercado.extrairSenioridade('Programa de Trainee 2027'), 'trainee');
      assert.strictEqual(extratorMercado.extrairSenioridade('Coordenador de Inovação e IA'), 'coordenador');
      assert.strictEqual(extratorMercado.extrairSenioridade('Especialista em IA Aplicada'), 'especialista');
    }],

    ['extrairSenioridade: título sem nenhum sinal de nível -> null, nunca adivinha', () => {
      assert.strictEqual(extratorMercado.extrairSenioridade('Engenheiro IA'), null);
      assert.strictEqual(extratorMercado.extrairSenioridade(''), null);
      assert.strictEqual(extratorMercado.extrairSenioridade(null), null);
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
