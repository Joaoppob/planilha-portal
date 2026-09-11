#!/usr/bin/env node
'use strict';

/**
 * Testa o parsing do coletor Gupy (fontes/gupy.js) contra dados REAIS
 * capturados de employability-portal.gupy.io em 26/08/2026 (ver
 * tests/fixtures/gupy-itens-reais.json), sem rede. Mesmo espírito de
 * tests/dou-parsing.test.js — cobre a parte mais frágil do coletor: os
 * mapeamentos de campo estruturado (state -> UF, publishedDate -> ISO,
 * modalidade). Os três motivos de rejeição do estágio 1 (lib/vaga-mercado.js)
 * têm teste próprio em tests/vaga-mercado.test.js.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const gupy = require('../fontes/gupy');

const itensReais = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'gupy-itens-reais.json'), 'utf8'));

function runTest(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`  ✓ ${name}`);
      return true;
    })
    .catch(error => {
      console.log(`  ✗ ${name}`);
      console.error(`    ${error.message}`);
      return false;
    });
}

async function main() {
  console.log('\n=== gupy-parsing.test.js ===\n');
  let passed = 0;
  let failed = 0;

  const tests = [
    ['fonte declara trilha mercado', () => {
      assert.strictEqual(gupy.trilha, 'mercado');
      assert.strictEqual(gupy.id, 'gupy');
    }],

    ['_internal.dataISO corta datetime ISO completo pro AAAA-MM-DD', () => {
      assert.strictEqual(gupy._internal.dataISO('2026-08-26T12:23:30.887Z'), '2026-08-26');
    }],

    ['_internal.dataISO retorna null para formato inesperado', () => {
      assert.strictEqual(gupy._internal.dataISO('data-invalida'), null);
      assert.strictEqual(gupy._internal.dataISO(null), null);
    }],

    ['_internal.ufDoEstado resolve nome completo do estado (item real: Paraná -> PR)', () => {
      assert.strictEqual(gupy._internal.ufDoEstado('Paraná'), 'PR');
      assert.strictEqual(gupy._internal.ufDoEstado('São Paulo'), 'SP');
      assert.strictEqual(gupy._internal.ufDoEstado('Rio Grande do Sul'), 'RS');
    }],

    ['_internal.ufDoEstado sem match (ou vazio) retorna null, nunca inventa', () => {
      assert.strictEqual(gupy._internal.ufDoEstado(''), null);
      assert.strictEqual(gupy._internal.ufDoEstado(null), null);
      assert.strictEqual(gupy._internal.ufDoEstado('Estado Inexistente'), null);
    }],

    ['textoParaFiltro junta título + descrição do item real (Akiyama)', () => {
      const texto = gupy.textoParaFiltro(itensReais.normal);
      assert.ok(texto.includes('Analista de UX/UI'));
      assert.ok(texto.includes('design system'));
    }],

    ['normalizarParcial extrai orgao/campus/uf/url/data do item real (Akiyama, Curitiba-PR)', () => {
      const parcial = gupy.normalizarParcial(itensReais.normal);
      assert.strictEqual(parcial.fonte, 'gupy');
      assert.strictEqual(parcial.trilha, 'mercado');
      assert.strictEqual(parcial.orgao, 'Akiyama Group');
      assert.strictEqual(parcial.campus, 'Curitiba - Paraná');
      assert.strictEqual(parcial.uf, 'PR');
      assert.strictEqual(parcial.data_publicacao, '2026-08-26');
      assert.strictEqual(parcial.inscricao_inicio, '2026-08-26');
      assert.strictEqual(parcial.inscricao_fim, '2026-10-01');
      assert.strictEqual(
        parcial.url,
        'https://akiyama.gupy.io/job/eyJqb2JJZCI6MTIxNjIyOTYsInNvdXJjZSI6Imd1cHlfcG9ydGFsIn0=?jobBoardSource=gupy_portal'
      );
    }],

    ['normalizarParcial extrai modalidade correta do workplaceType (item real: on-site -> presencial)', () => {
      const parcial = gupy.normalizarParcial(itensReais.normal);
      assert.strictEqual(parcial.modalidade, 'presencial');
    }],

    ['normalizarParcial extrai modalidade remoto do item real (Colômbia, workplaceType=remote)', () => {
      const parcial = gupy.normalizarParcial(itensReais.estrangeira);
      assert.strictEqual(parcial.modalidade, 'remoto');
    }],

    ['normalizarParcial: campos docente-específicos sempre null na trilha mercado (sem constrangimento)', () => {
      const parcial = gupy.normalizarParcial(itensReais.normal);
      assert.strictEqual(parcial.subedital, null);
      assert.strictEqual(parcial.classe, null);
      assert.strictEqual(parcial.regime, null);
      assert.strictEqual(parcial.tipo, null);
      assert.strictEqual(parcial.vagas, null);
    }],

    ['enriquecer não faz requisição de rede — devolve o mesmo texto de textoParaFiltro', async () => {
      const extra = await gupy.enriquecer(itensReais.normal);
      assert.strictEqual(extra.texto_bruto, gupy.textoParaFiltro(itensReais.normal));
    }],

    ['item sem city/state (remoto internacional) não quebra normalizarParcial (campus/uf ficam null)', () => {
      const itemSemLocal = { ...itensReais.estrangeira, city: '', state: '' };
      const parcial = gupy.normalizarParcial(itemSemLocal);
      assert.strictEqual(parcial.campus, null);
      assert.strictEqual(parcial.uf, null);
    }]
  ];

  for (const [name, fn] of tests) {
    if (await runTest(name, fn)) passed++;
    else failed++;
  }

  console.log(`\n${passed} passou(aram), ${failed} falhou(aram)\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
