#!/usr/bin/env node
'use strict';

/**
 * Testa `pareceReciboDeContratoJaAssinado`/`pareceEditalDeConcursoOuSeletivo`
 * (fontes/dou.js) — segundo conserto do mesmo dia (2026-09-09): o número
 * "144 vagas perdidas" reportado por Mav estava errado (rotulou "itens que
 * passam o pré-filtro" como "vagas docentes reais"). Reclassificação real
 * (ver tmp/vazamento-itens-completos.json, descartável) achou que ~29 dos
 * 144 eram EXTRATO DE CONTRATO/EXTRATO DE TERMO ADITIVO — um recibo
 * administrativo de contratação já consumada, não uma vaga aberta.
 *
 * DISCRIMINAÇÃO OBRIGATÓRIA (mesmo padrão do conserto Nº 1) — casos reais
 * nomeados dos dois lados, capturados em 09-09-2026 (fixture congelada em
 * tests/fixtures/dou-itens-recibo-contrato.json):
 *   POSITIVO: UFFS Edital nº 387 (prorrogação de prazo — ESTENDE uma janela
 *   viva, continua sendo vaga de verdade) precisa continuar ENCONTRADO.
 *   NEGATIVO: IFMG Bambuí, IFCE Jaguaribe, IFSC (todos "EXTRATO DE
 *   CONTRATO" reais de 09-09-2026) e IFMG Ouro Branco ("EXTRATO DE TERMO
 *   ADITIVO" real de 13-08-2026) precisam ficar FORA.
 *
 * Não-regressão: os 10 testes de tests/dou-tipo-editais.test.js (o
 * conserto Nº 1) continuam passando sem alteração — nenhum dos fixtures
 * daquele arquivo contém marcador de recibo de contrato.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const dou = require('../fontes/dou');

const itens = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'dou-itens-recibo-contrato.json'), 'utf8'));
const itensTipoGenericos = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'dou-itens-tipo-genericos.json'), 'utf8'));

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
  console.log('\n=== dou-recibo-contrato.test.js ===\n');
  let passed = 0;
  let failed = 0;

  const { pareceEditalDeConcursoOuSeletivo, pareceReciboDeContratoJaAssinado, RE_RECIBO_CONTRATO } = dou._internal;

  const tests = [
    // --- POSITIVO nomeado: prorrogação de prazo continua sendo vaga de verdade ---
    ['POSITIVO nomeado: UFFS Edital nº 387 (prorrogação de prazo de validade) é ENCONTRADO', () => {
      assert.strictEqual(pareceEditalDeConcursoOuSeletivo(itens.uffs387), true);
    }],
    ['UFFS 387 NÃO é classificado como recibo de contrato', () => {
      assert.strictEqual(pareceReciboDeContratoJaAssinado(itens.uffs387), false);
    }],

    // --- NEGATIVO nomeado: recibo de contrato real, três institutos diferentes ---
    ['NEGATIVO nomeado: IFMG Campus Bambuí (EXTRATO DE CONTRATO real, 09-09-2026) fica FORA', () => {
      assert.strictEqual(pareceEditalDeConcursoOuSeletivo(itens.ifmgBambui), false);
      assert.strictEqual(pareceReciboDeContratoJaAssinado(itens.ifmgBambui), true);
    }],
    ['NEGATIVO nomeado: IFCE Campus Jaguaribe (EXTRATO DE CONTRATO real, 09-09-2026) fica FORA', () => {
      assert.strictEqual(pareceEditalDeConcursoOuSeletivo(itens.ifceJaguaribe), false);
      assert.strictEqual(pareceReciboDeContratoJaAssinado(itens.ifceJaguaribe), true);
    }],
    ['NEGATIVO nomeado: IFSC (EXTRATO DE CONTRATO real, 09-09-2026) fica FORA', () => {
      assert.strictEqual(pareceEditalDeConcursoOuSeletivo(itens.ifsc), false);
      assert.strictEqual(pareceReciboDeContratoJaAssinado(itens.ifsc), true);
    }],
    ['NEGATIVO nomeado: IFMG Campus Ouro Branco (EXTRATO DE TERMO ADITIVO real, 13-08-2026) fica FORA', () => {
      assert.strictEqual(pareceEditalDeConcursoOuSeletivo(itens.termoAditivoIfmgOuroBranco), false);
      assert.strictEqual(pareceReciboDeContratoJaAssinado(itens.termoAditivoIfmgOuroBranco), true);
    }],

    // --- O sinal é sobre o CONTEÚDO, não sobre o rótulo (mesma lição do conserto Nº 1) ---
    ['IFCE Jaguaribe tinha artType="Extrato" (genérico) — o sinal pega pelo conteúdo, não pelo artType', () => {
      assert.strictEqual(itens.ifceJaguaribe.artType, 'Extrato');
      assert.strictEqual(RE_RECIBO_CONTRATO.test(itens.ifceJaguaribe.content), true);
    }],
    ['Item sintético com artType="Retificação" mas conteúdo de extrato de contrato (achado real do intervalo) fica FORA', () => {
      const retificacaoEscondendoExtrato = {
        artType: 'Retificação',
        title: 'RETIFICAÇÃO',
        content: 'RETIFICAÇÃO Extrato de contrato 154/2026 - Professor Substituto Joziano Rony de Miranda Monteiro CPF: XXX.519.262-34 - Campus Gaspar - publicado no D.',
        hierarchyStr: 'Ministério da Educação/Instituto Federal de Educação, Ciência e Tecnologia de Santa Catarina'
      };
      assert.strictEqual(pareceEditalDeConcursoOuSeletivo(retificacaoEscondendoExtrato), false);
    }],

    // --- Não-regressão: os fixtures do conserto Nº 1 continuam intactos ---
    ['Não-regressão: UFPEL (conserto Nº 1) continua ENCONTRADO — não vira recibo de contrato por engano', () => {
      assert.strictEqual(pareceEditalDeConcursoOuSeletivo(itensTipoGenericos.ufpel), true);
      assert.strictEqual(pareceReciboDeContratoJaAssinado(itensTipoGenericos.ufpel), false);
    }],
    ['Não-regressão: UFRN (conserto Nº 1) continua ENCONTRADO', () => {
      assert.strictEqual(pareceEditalDeConcursoOuSeletivo(itensTipoGenericos.ufrn), true);
    }],
    ['Não-regressão: IFPE (conserto Nº 1) continua ENCONTRADO pelo pré-filtro (nota: substantivamente é retificação de HOMOLOGAÇÃO, não recibo de contrato — ver relatório)', () => {
      assert.strictEqual(pareceEditalDeConcursoOuSeletivo(itensTipoGenericos.ifpe), true);
    }],
    ['Não-regressão: Edital de Notificação/Intimação/Citação (conserto Nº 1) continuam FORA', () => {
      assert.strictEqual(pareceEditalDeConcursoOuSeletivo(itensTipoGenericos.notificacao), false);
      assert.strictEqual(pareceEditalDeConcursoOuSeletivo(itensTipoGenericos.intimacao), false);
      assert.strictEqual(pareceEditalDeConcursoOuSeletivo(itensTipoGenericos.citacao), false);
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
