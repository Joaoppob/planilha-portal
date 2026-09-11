#!/usr/bin/env node
'use strict';

/**
 * Testa lib/vaga-docente.js — estágio 1 do pipeline invertido (item 3 do
 * briefing Onda 1.6). Casos reais capturados do DOU (12/08/2026 e amostras
 * de outras datas, ver README §Pipeline invertido / RELATORIO-BACKFILL.md).
 */

const assert = require('assert');
const { pareceVagaDocente } = require('../lib/vaga-docente');

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
  console.log('\n=== vaga-docente.test.js ===\n');
  let passed = 0;
  let failed = 0;

  const tests = [
    ['reconhece o preview real da UFSCar (12/08/2026) — o caso que motivou a inversão', () => {
      const texto = [
        'Edital nº 4, de 11 de agosto de 2026',
        'Edital nº 4, de 11 de agosto de 2026 CONCURSO PÚBLICO DOCENTE A Pró-Reitora de Gestão de Pessoas da Universidade Federal de São Carlos, no uso das atribuições que lhe confere a Portaria GR nº 4809... torna público que estarão abertas as inscrições para provimento de cargos de Professor da Carreira de Magistério Superior...',
        'Ministério da Educação/Fundação Universidade Federal de São Carlos/Pró-Reitoria de Gestão de Pessoas'
      ].join(' \n ');
      assert.strictEqual(pareceVagaDocente(texto), true);
    }],

    ['reconhece o preview real da UFG (edital 24/2025, Ciência da Computação)', () => {
      const texto =
        'EDITAL nº 24, DE 12 DE SETEMBRO DE 2025 Concurso Público de provas e títulos para preenchimento de vaga(s) de Professor do Magistério Superior \n Ministério da Educação/Universidade Federal de Goiás/Pró-Reitoria de Gestão de Pessoas';
      assert.strictEqual(pareceVagaDocente(texto), true);
    }],

    ['reconhece processo seletivo simplificado de IF (professor substituto)', () => {
      const texto =
        'PROCESSO SELETIVO SIMPLIFICADO PARA CONTRATACAO DE PROFESSOR(A) SUBSTITUTO NA AREA DE INFORMATICA DO IF GOIANO - CAMPUS CRISTALINA \n Ministério da Educação/Instituto Federal de Educação, Ciência e Tecnologia Goiano';
      assert.strictEqual(pareceVagaDocente(texto), true);
    }],

    ['rejeita edital sem menção a professor/docente/magistério superior (vaga técnico-administrativa)', () => {
      const texto =
        'CONCURSO PÚBLICO PARA PROVIMENTO DE CARGOS TÉCNICO-ADMINISTRATIVOS \n Universidade Federal de Exemplo';
      assert.strictEqual(pareceVagaDocente(texto), false);
    }],

    ['rejeita edital sem concurso/processo seletivo (extrato de contrato, cooperação técnica)', () => {
      const texto =
        'EXTRATO DE ACORDO ESPECÍFICO DE COOPERAÇÃO Nº 93/2026 - UASG 154049 \n Fundação Universidade Federal de São Carlos';
      assert.strictEqual(pareceVagaDocente(texto), false);
    }],

    ['rejeita edital docente-adjacente fora de universidade/IF/CEFET/fundação de ensino (empresa privada)', () => {
      const texto = 'CONCURSO PÚBLICO PARA PROFESSOR SUBSTITUTO \n Transpetro Petrobras Transporte S.A.';
      assert.strictEqual(pareceVagaDocente(texto), false);
    }],

    ['rejeita edital de seleção de ALUNOS de pós-graduação (não é vaga docente, é vaga de estudante)', () => {
      // Caso real: UFAM Edital 105/2025 — "SELEÇÃO DE CANDIDATOS PARA O
      // CURSO DE MESTRADO PROFISSIONAL" batia no filtro de keyword antigo
      // (continha "Design") mas não é concurso docente — é admissão
      // discente. Estágio 1 corretamente não reconhece isso como vaga
      // docente (nem "concurso"/"processo seletivo" nem "professor" no
      // texto real do preview).
      const texto =
        'EDITAL Nº 105/2025 SELEÇÃO DE CANDIDATOS PARA O CURSO DE MESTRADO PROFISSIONAL DO PROGRAMA DE PÓS-GRADUAÇÃO EM DESIGN \n Universidade Federal do Amazonas';
      assert.strictEqual(pareceVagaDocente(texto), false);
    }],

    ['aceita variação de caixa (tudo maiúsculo, comum em preview do DOU)', () => {
      const texto = 'CONCURSO PÚBLICO PARA PROFESSOR DO MAGISTÉRIO SUPERIOR \n UNIVERSIDADE FEDERAL DE EXEMPLO';
      assert.strictEqual(pareceVagaDocente(texto), true);
    }],

    ['string vazia/nula não quebra e retorna false', () => {
      assert.strictEqual(pareceVagaDocente(''), false);
      assert.strictEqual(pareceVagaDocente(null), false);
      assert.strictEqual(pareceVagaDocente(undefined), false);
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
