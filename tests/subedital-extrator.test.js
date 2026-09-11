#!/usr/bin/env node
'use strict';

/**
 * Testa lib/subedital-extrator.js contra um excerto REAL do texto integral
 * do edital nº 4/2026 da UFSCar (12/08/2026, capturado em 2026-08-12 — ver
 * tests/fixtures/ufscar-quadro-i.txt), o caso que motivou o item 3 do
 * briefing Onda 1.6: um edital-guarda-chuva com 67 subeditais de área
 * distinta, entre eles "Design e Mídias digitais" (Sorocaba) — que o filtro
 * antigo (rodando sobre o preview de ~400 chars, não sobre o texto
 * integral) nunca via.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const subeditalExtrator = require('../lib/subedital-extrator');

const keywordsConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'keywords.json'), 'utf8'));
const textoUfscar = fs.readFileSync(path.join(__dirname, 'fixtures', 'ufscar-quadro-i.txt'), 'utf8');
const goldenSet = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'golden-set.json'), 'utf8'));

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
  console.log('\n=== subedital-extrator.test.js ===\n');
  let passed = 0;
  let failed = 0;

  const tests = [
    ['dividirSubeditais retorna null quando o texto não tem tabela de subeditais (edital de vaga única)', () => {
      const textoSimples =
        'EDITAL Nº 3, DE 3 DE NOVEMBRO DE 2025 PROCESSO SELETIVO SIMPLIFICADO PARA CONTRATAÇÃO DE PROFESSOR SUBSTITUTO. Área de Conhecimento: Ciência da Computação. 01 vaga.';
      assert.strictEqual(subeditalExtrator.dividirSubeditais(textoSimples), null);
    }],

    ['dividirSubeditais reconhece a tabela real da UFSCar (múltiplos códigos NNN/AA.NN)', () => {
      const linhas = subeditalExtrator.dividirSubeditais(textoUfscar);
      assert.ok(Array.isArray(linhas), 'deveria retornar array, não null');
      assert.ok(linhas.length >= 4, `esperava pelo menos 4 linhas, achou ${linhas.length}`);
    }],

    ['extrai campus e vagas corretamente da linha 004/26.41 (Design, Sorocaba, 1 vaga)', () => {
      const linhas = subeditalExtrator.dividirSubeditais(textoUfscar);
      const linha41 = linhas.find(l => l.codigo === '004/26.41');
      assert.ok(linha41, 'linha 004/26.41 não encontrada');
      assert.strictEqual(linha41.campus, 'Sorocaba');
      assert.strictEqual(linha41.vagas, 1);
      assert.match(linha41.textoArea, /Design e Mídias digitais/);
      assert.match(linha41.textoArea, /Inteligência Artificial/);
    }],

    ['extrai campus multi-palavra (São Carlos) e vagas da linha 004/26.01', () => {
      const linhas = subeditalExtrator.dividirSubeditais(textoUfscar);
      const linha01 = linhas.find(l => l.codigo === '004/26.01');
      assert.ok(linha01, 'linha 004/26.01 não encontrada');
      assert.strictEqual(linha01.campus, 'São Carlos');
      assert.strictEqual(linha01.vagas, 1);
    }],

    ['extrai 2 vagas corretamente da linha 004/26.40 (Ciência da Informação/IA)', () => {
      const linhas = subeditalExtrator.dividirSubeditais(textoUfscar);
      const linha40 = linhas.find(l => l.codigo === '004/26.40');
      assert.ok(linha40, 'linha 004/26.40 não encontrada');
      assert.strictEqual(linha40.vagas, 2);
      assert.match(linha40.textoArea, /Inteligência Artificial/);
    }],

    ['registrosRelevantes filtra só as linhas cuja área bate no keyword filtro (área de JB)', () => {
      const linhas = subeditalExtrator.dividirSubeditais(textoUfscar);
      const relevantes = subeditalExtrator.registrosRelevantes(linhas, keywordsConfig);
      const codigos = relevantes.map(r => r.subedital);
      // 004/26.41 (Design/IA/UI/UX) e 004/26.40 (Ciência de Dados/IA) devem
      // passar; 004/26.01 (Organizações/Instituições) não é área de JB.
      assert.ok(codigos.includes('004/26.41'), '004/26.41 (Design) deveria ter passado no filtro de área');
      assert.ok(codigos.includes('004/26.40'), '004/26.40 (IA/Ciência de Dados) deveria ter passado no filtro de área');
      assert.ok(!codigos.includes('004/26.01'), '004/26.01 (Organizações) NÃO deveria ter passado no filtro de área');
    }],

    ['registrosRelevantes extrai titulação (doutorado) e área/subárea corretos pro subedital de Design', () => {
      const linhas = subeditalExtrator.dividirSubeditais(textoUfscar);
      const relevantes = subeditalExtrator.registrosRelevantes(linhas, keywordsConfig);
      const design = relevantes.find(r => r.subedital === '004/26.41');
      assert.ok(design);
      assert.strictEqual(design.titulacao_exigida, 'doutorado');
      assert.strictEqual(design.area, 'Design');
      assert.strictEqual(design.campus, 'Sorocaba');
      assert.strictEqual(design.vagas, 1);
    }],

    // Achado real (edital UFSCar nº 4/2026, run de smoke test 2026-08-12):
    // o mesmo código de subedital reaparece bem mais adiante no documento,
    // num anexo de cursos de graduação relacionados (link pro curso, não a
    // vaga) — sem "vagas" e com o departamento na ordem trocada. Sem cortar
    // no marcador "Quadro II", esse anexo virava um SEGUNDO registro (área
    // "Design/Mídias Digitais" errada, titulação "graduacao" só porque a
    // URL termina em ".../graduacao") pro mesmo subedital 004/26.40 — que
    // não dedupe contra o registro certo porque `area` diferente muda o
    // hash. Ver lib/hash.js e radar.js `salvarRegistro`.
    ['dividirSubeditais corta no marcador "Quadro II" — não confunde o anexo de cursos com subedital novo', () => {
      const linhas = subeditalExtrator.dividirSubeditais(textoUfscar);
      const ocorrenciasDe40 = linhas.filter(l => l.codigo === '004/26.40');
      assert.strictEqual(ocorrenciasDe40.length, 1, 'deveria haver só UMA linha 004/26.40 (a do Quadro I, não a do anexo)');
      assert.strictEqual(ocorrenciasDe40[0].campus, 'Sorocaba');
      assert.strictEqual(ocorrenciasDe40[0].vagas, 2);

      const ocorrenciasDe41 = linhas.filter(l => l.codigo === '004/26.41');
      assert.strictEqual(ocorrenciasDe41.length, 1, 'deveria haver só UMA linha 004/26.41 (a do Quadro I, não a do anexo)');
    }],

    ['linha sem padrão "- SIGLA Campus Vagas" reconhecível não inventa campus/vagas (fica null)', () => {
      const linhas = subeditalExtrator.dividirSubeditais('001/26.01 texto sem o padrão esperado 001/26.02 outro texto');
      assert.strictEqual(linhas[0].campus, null);
      assert.strictEqual(linhas[0].vagas, null);
    }],

    // Item 1 do briefing Onda 1.7 — "dado errado é pior que dado faltante":
    // pareceMultiplosItensNaoReconhecidos + avaliarEditalUnico.
    ['pareceMultiplosItensNaoReconhecidos reconhece o texto REAL da UFG (2 números de processo distintos)', () => {
      const caso = goldenSet.find(c => c.id === 'ufg-24-2025-ciencia-computacao');
      assert.ok(caso, 'fixture ufg-24-2025-ciencia-computacao não encontrado no golden set');
      assert.strictEqual(subeditalExtrator.pareceMultiplosItensNaoReconhecidos(caso.textoEnriquecido), true);
    }],

    ['pareceMultiplosItensNaoReconhecidos NÃO dispara em nenhum dos outros 6 casos do golden set (sem falso positivo)', () => {
      for (const caso of goldenSet) {
        if (caso.id === 'ufg-24-2025-ciencia-computacao') continue;
        assert.strictEqual(
          subeditalExtrator.pareceMultiplosItensNaoReconhecidos(caso.textoEnriquecido),
          false,
          `falso positivo em ${caso.id}`
        );
      }
    }],

    ['avaliarEditalUnico no texto da UFG: area/subarea/extracao sinalizam ambiguidade, NUNCA o primeiro match', () => {
      const caso = goldenSet.find(c => c.id === 'ufg-24-2025-ciencia-computacao');
      const avaliacao = subeditalExtrator.avaliarEditalUnico(caso.textoEnriquecido, keywordsConfig);
      assert.strictEqual(avaliacao.passou, true);
      assert.strictEqual(avaliacao.ambiguo, true);
      assert.strictEqual(avaliacao.area, null);
      assert.strictEqual(avaliacao.subarea, null);
      assert.strictEqual(avaliacao.extracao, 'formato_nao_reconhecido');
      assert.ok(avaliacao.keywords_matched.length > 0, 'keywords_matched continua honesto — os termos realmente apareceram no texto');
    }],

    ['avaliarEditalUnico num edital normal (IF Goiano, subedital único de verdade): area/subarea preenchidos, extracao null', () => {
      const caso = goldenSet.find(c => c.id === 'if-goiano-substituto-informatica');
      const avaliacao = subeditalExtrator.avaliarEditalUnico(caso.textoEnriquecido, keywordsConfig);
      assert.strictEqual(avaliacao.passou, true);
      assert.strictEqual(avaliacao.ambiguo, false);
      assert.strictEqual(avaliacao.area, 'Computação/IA');
      assert.strictEqual(avaliacao.extracao, null);
    }],

    ['avaliarEditalUnico: texto sem nenhum termo de área -> passou=false, sem inventar nada', () => {
      const avaliacao = subeditalExtrator.avaliarEditalUnico('Concurso público para técnico administrativo em contabilidade.', keywordsConfig);
      assert.strictEqual(avaliacao.passou, false);
    }],

    // Onda 2.0 — auditoria dos 21 itens `titulacao_exigida: 'graduacao'`:
    // achado real UFRGS (4/4 ocorrências deste formato no store de 204 itens
    // tinham área ERRADA — edital nº 15/2025, vaga de Estatística virou
    // "Design/Design de Produto" só porque "Design de Produto" é UMA entre
    // ~50 graduações aceitas como requisito, sem a vaga ter nenhuma relação
    // com Design). `areaDivergeDoRequisito` cruza a área DECLARADA (campo
    // "Área/subárea de conhecimento:") com o que bateu o filtro de keyword.
    ['areaDivergeDoRequisito detecta o formato UFRGS (área declarada diverge do termo que bateu — achado real, 4/4 no store)', () => {
      const texto = 'Área/subárea de conhecimento: Probabilidade e Estatística - Estatística ' +
        'Requisito(s): Graduação em Administração, ou Graduação em Design de Produto, ou Graduação em Estatística.';
      const filtro = require('../lib/keyword-filtro').avaliar(texto, keywordsConfig);
      assert.strictEqual(subeditalExtrator.areaDivergeDoRequisito(texto, filtro.matches), true);
    }],

    ['areaDivergeDoRequisito NÃO dispara quando a área declarada bate com o termo (formato UFRGS legítimo)', () => {
      const texto = 'Área/subárea de conhecimento: Design - Design de Produto ' +
        'Requisito(s): Graduação em Design de Produto, ou Graduação em Design Visual.';
      const filtro = require('../lib/keyword-filtro').avaliar(texto, keywordsConfig);
      assert.strictEqual(subeditalExtrator.areaDivergeDoRequisito(texto, filtro.matches), false);
    }],

    ['areaDivergeDoRequisito retorna false quando o texto não tem o par de labels (sinal não se aplica)', () => {
      assert.strictEqual(subeditalExtrator.areaDivergeDoRequisito('Texto qualquer sem esse formato.', []), false);
    }],

    ['avaliarEditalUnico marca ambíguo no formato UFRGS (área diverge do requisito) — NUNCA a área errada', () => {
      const texto = 'Área/subárea de conhecimento: Probabilidade e Estatística - Estatística ' +
        'Requisito(s): Graduação em Administração, ou Graduação em Design de Produto, ou Graduação em Estatística. ' +
        'Regime de Trabalho: 20h';
      const avaliacao = subeditalExtrator.avaliarEditalUnico(texto, keywordsConfig);
      assert.strictEqual(avaliacao.passou, true);
      assert.strictEqual(avaliacao.ambiguo, true);
      assert.strictEqual(avaliacao.area, null);
      assert.strictEqual(avaliacao.extracao, 'formato_nao_reconhecido');
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
