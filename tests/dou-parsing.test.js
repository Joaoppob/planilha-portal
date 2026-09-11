#!/usr/bin/env node
'use strict';

/**
 * Testa o parsing do coletor DOU (fontes/dou.js) contra dados REAIS
 * capturados de www.in.gov.br em 12/08/2026 (ver tests/fixtures/), sem
 * rede. Cobre a parte mais frágil do coletor: os regex de extração de
 * texto/URL/data.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const dou = require('../fontes/dou');

const itensReais = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'dou-itens-reais.json'), 'utf8'));
const htmlArtigoUnifal = fs.readFileSync(path.join(__dirname, 'fixtures', 'dou-artigo-unifal.html'), 'utf8');

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
  console.log('\n=== dou-parsing.test.js ===\n');
  let passed = 0;
  let failed = 0;

  const tests = [
    ['urlCanonica monta a url real do artigo a partir de urlTitle', () => {
      const url = dou._internal.urlCanonica(itensReais.unifal);
      assert.strictEqual(url, 'https://www.in.gov.br/web/dou/-/edital-n-15-de-11-de-agosto-de-2026-724844250');
    }],

    ['pubDateParaISO converte DD/MM/AAAA -> AAAA-MM-DD', () => {
      assert.strictEqual(dou._internal.pubDateParaISO('12/08/2026'), '2026-08-12');
    }],

    ['pubDateParaISO retorna null para formato inesperado', () => {
      assert.strictEqual(dou._internal.pubDateParaISO('data-invalida'), null);
    }],

    ['formatarData produz DD-MM-AAAA (formato do query param da fonte)', () => {
      const d = new Date(2026, 7, 12); // 12/ago/2026 (mês 0-indexed)
      assert.strictEqual(dou._internal.formatarData(d), '12-08-2026');
    }],

    ['normalizarParcial extrai orgao a partir de hierarchyList[1] (item real UNIFAL)', () => {
      const parcial = dou.normalizarParcial(itensReais.unifal);
      assert.strictEqual(parcial.orgao, 'Universidade Federal de Alfenas');
      assert.strictEqual(parcial.data_publicacao, '2026-08-12');
      assert.strictEqual(parcial.fonte, 'dou');
    }],

    ['normalizarParcial identifica UF via lookup estático (UNIFAL -> MG)', () => {
      const parcial = dou.normalizarParcial(itensReais.unifal);
      assert.strictEqual(parcial.uf, 'MG');
    }],

    ['normalizarParcial extrai campus quando a hierarquia tem 3+ níveis (item real Transpetro)', () => {
      const parcial = dou.normalizarParcial(itensReais.transpetro);
      assert.strictEqual(parcial.campus, 'Petrobras Transporte S.A.');
    }],

    ['extrairTextoArtigo lê o texto integral do bloco texto-dou (fixture real UNIFAL)', () => {
      const texto = dou._internal.extrairTextoArtigo(htmlArtigoUnifal);
      assert.ok(texto, 'texto não deveria ser null');
      assert.ok(texto.includes('Doutorado e Doutorado Direto'));
      assert.ok(texto.includes('17 (dezessete) vagas'));
      assert.ok(!texto.includes('<p'), 'não deveria sobrar tag HTML no texto extraído');
    }],

    ['extrairTextoArtigo retorna null se o marcador texto-dou não existir no HTML', () => {
      const texto = dou._internal.extrairTextoArtigo('<html><body>página qualquer sem o bloco</body></html>');
      assert.strictEqual(texto, null);
    }],

    ['ART_TYPES_EDITAL restringe aos dois artType relevantes pra concurso docente', () => {
      assert.deepStrictEqual(dou._internal.ART_TYPES_EDITAL, ['Edital de Concurso Público', 'Edital de Processo Seletivo']);
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
