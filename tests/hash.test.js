#!/usr/bin/env node
'use strict';

/**
 * Testa estabilidade do hash (id) — requisito mínimo do briefing.
 */

const assert = require('assert');
const { gerarId } = require('../lib/hash');

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
  console.log('\n=== hash.test.js ===\n');
  let passed = 0;
  let failed = 0;

  const base = {
    orgao: 'Universidade Federal de Alfenas',
    area: 'Design',
    data_publicacao: '2026-08-12',
    url: 'https://www.in.gov.br/web/dou/-/edital-n-15-de-11-de-agosto-de-2026-724844250'
  };

  const tests = [
    ['id é estável entre chamadas com os mesmos dados', () => {
      const id1 = gerarId(base);
      const id2 = gerarId(base);
      assert.strictEqual(id1, id2);
    }],

    ['id não depende de campos fora de orgao/area/data_publicacao/url (ex.: texto_bruto)', () => {
      const id1 = gerarId(base);
      const id2 = gerarId({ ...base, texto_bruto: 'HTML completamente diferente a cada request' });
      assert.strictEqual(id1, id2);
    }],

    ['id é sensível a diferença de órgão', () => {
      const id1 = gerarId(base);
      const id2 = gerarId({ ...base, orgao: 'Outra Universidade' });
      assert.notStrictEqual(id1, id2);
    }],

    ['id é sensível a diferença de área', () => {
      const id1 = gerarId(base);
      const id2 = gerarId({ ...base, area: 'Computação/IA' });
      assert.notStrictEqual(id1, id2);
    }],

    ['id é sensível a diferença de data_publicacao', () => {
      const id1 = gerarId(base);
      const id2 = gerarId({ ...base, data_publicacao: '2026-08-13' });
      assert.notStrictEqual(id1, id2);
    }],

    ['id é sensível a diferença de url', () => {
      const id1 = gerarId(base);
      const id2 = gerarId({ ...base, url: base.url + '-outro' });
      assert.notStrictEqual(id1, id2);
    }],

    ['id ignora diferença de caixa/espaço (normalização de chave)', () => {
      const id1 = gerarId(base);
      const id2 = gerarId({ ...base, orgao: '  UNIVERSIDADE FEDERAL DE ALFENAS  ' });
      assert.strictEqual(id1, id2);
    }],

    ['id é uma string hex não-vazia', () => {
      const id = gerarId(base);
      assert.match(id, /^[0-9a-f]+$/);
      assert.ok(id.length >= 16);
    }],

    // Onda 1.6 (item 3 — subedital vira item próprio no store): dois
    // subeditais do MESMO edital, MESMA área, precisam de ids distintos.
    ['id é sensível a diferença de subedital (dois subeditais, mesma área, mesmo edital)', () => {
      const id1 = gerarId({ ...base, subedital: '004/26.40' });
      const id2 = gerarId({ ...base, subedital: '004/26.41' });
      assert.notStrictEqual(id1, id2);
    }],

    ['id sem subedital é diferente do id com subedital preenchido (mesmos outros campos)', () => {
      const id1 = gerarId(base);
      const id2 = gerarId({ ...base, subedital: '004/26.41' });
      assert.notStrictEqual(id1, id2);
    }],

    ['id ignora subedital ausente vs subedital vazio/whitespace (normalização de chave)', () => {
      const id1 = gerarId(base);
      const id2 = gerarId({ ...base, subedital: '   ' });
      assert.strictEqual(id1, id2);
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
