#!/usr/bin/env node
'use strict';

/**
 * Testa extratores heurísticos de texto (vagas, titulação, regime, classe,
 * tipo, período de inscrição), incluindo o formato de data por extenso
 * ("de 12 de agosto de 2026 a 25 de agosto de 2026") confirmado em edital
 * real do DOU durante a implementação da Onda 1.
 */

const assert = require('assert');
const extrator = require('../lib/extrator-texto');

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
  console.log('\n=== extrator-texto.test.js ===\n');
  let passed = 0;
  let failed = 0;

  const tests = [
    ['extrairVagas reconhece "17 (dezessete) vagas"', () => {
      assert.strictEqual(extrator.extrairVagas('Serão oferecidas 17 (dezessete) vagas'), 17);
    }],

    ['extrairVagas retorna null sem número de vagas no texto', () => {
      assert.strictEqual(extrator.extrairVagas('Edital sem menção a vagas'), null);
    }],

    ['extrairTitulacao prioriza doutorado quando presente', () => {
      assert.strictEqual(extrator.extrairTitulacao('Exige-se doutorado na área correlata'), 'doutorado');
    }],

    ['extrairTitulacao reconhece mestrado', () => {
      assert.strictEqual(extrator.extrairTitulacao('Título de mestre é obrigatório'), 'mestrado');
    }],

    ['extrairTitulacao retorna null quando não identificável', () => {
      assert.strictEqual(extrator.extrairTitulacao('Texto sem menção a titulação'), null);
    }],

    // Onda 2.0 — auditoria dos 21 itens `titulacao_exigida: 'graduacao'`:
    // "Projeto de Graduação I/II" é nome de disciplina/TCC (achado real UFES
    // edital nº 13/2026), não requisito de titulação — não pode virar
    // "graduacao" só porque a palavra aparece.
    ['extrairTitulacao ignora "Projeto de Graduação" (nome de disciplina, não requisito — achado real UFES)', () => {
      const texto = 'Área/Subárea ou Disciplinas: Teoria do Design, Sistemas de Identidade Visual, ' +
        'Projeto de Graduação I, Projeto de Graduação II.';
      assert.strictEqual(extrator.extrairTitulacao(texto), null);
    }],

    // "Instituto de X/Graduação em Y" é label de departamento (nome da
    // unidade acadêmica), não requisito de vaga — achado real UFMT edital
    // nº 1/progep/ufmt de 25/06/2026 (homologação multi-área: o nome de um
    // departamento QUALQUER, não da vaga de Audiovisual que bateu o filtro).
    ['extrairTitulacao ignora "X/Graduação em Y" (label de departamento, não requisito — achado real UFMT)', () => {
      const texto = 'Campos Araguaia - Instituto de Ciências Biológicas e da Saúde/Graduação em Educação ' +
        'Física - Licenciatura / Educação Física/Dança.';
      assert.strictEqual(extrator.extrairTitulacao(texto), null);
    }],

    ['extrairTitulacao ainda reconhece "Curso de Graduação com formação pedagógica" (requisito legítimo, sem os padrões excluídos)', () => {
      assert.strictEqual(
        extrator.extrairTitulacao('Licenciatura em Física OU Curso de Graduação com formação pedagógica para as disciplinas de Física.'),
        'graduacao'
      );
    }],

    ['extrairTipo reconhece substituto/temporário', () => {
      assert.strictEqual(extrator.extrairTipo('Processo seletivo para professor substituto'), 'substituto');
    }],

    ['extrairTipo reconhece efetivo', () => {
      assert.strictEqual(extrator.extrairTipo('Concurso público para provimento efetivo de cargo'), 'efetivo');
    }],

    ['extrairPeriodoInscricao — formato numérico dd/mm/aaaa a dd/mm/aaaa', () => {
      const r = extrator.extrairPeriodoInscricao('As inscrições ocorrerão de 01/09/2026 a 15/09/2026.');
      assert.deepStrictEqual(r, { inicio: '2026-09-01', fim: '2026-09-15' });
    }],

    ['extrairPeriodoInscricao — formato por extenso singular "Inscrição: de DD de MÊS de AAAA a DD de MÊS de AAAA" (achado real DOU/UNIFAL)', () => {
      const r = extrator.extrairPeriodoInscricao('3. Inscrição: de 12 de agosto de 2026 a 25 de agosto de 2026.');
      assert.deepStrictEqual(r, { inicio: '2026-08-12', fim: '2026-08-25' });
    }],

    ['extrairPeriodoInscricao — plural "Inscrições" também funciona', () => {
      const r = extrator.extrairPeriodoInscricao('As inscrições: de 3 de março de 2026 a 20 de março de 2026.');
      assert.deepStrictEqual(r, { inicio: '2026-03-03', fim: '2026-03-20' });
    }],

    ['extrairPeriodoInscricao — só data final numérica ("até dd/mm/aaaa")', () => {
      const r = extrator.extrairPeriodoInscricao('Inscrições até 30/10/2026.');
      assert.deepStrictEqual(r, { inicio: null, fim: '2026-10-30' });
    }],

    ['extrairPeriodoInscricao — sem menção a inscrição retorna nulos', () => {
      const r = extrator.extrairPeriodoInscricao('Texto qualquer sem prazo.');
      assert.deepStrictEqual(r, { inicio: null, fim: null });
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
