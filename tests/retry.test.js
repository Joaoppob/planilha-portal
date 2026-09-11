#!/usr/bin/env node
'use strict';

/**
 * Testa lib/retry.js — backoff exponencial (item 1 do briefing Onda 1.5:
 * "seja educado com o servidor... backoff em erro").
 */

const assert = require('assert');
const { comBackoff } = require('../lib/retry');

function runTest(name, fn) {
  return fn()
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
  console.log('\n=== retry.test.js ===\n');
  let passed = 0;
  let failed = 0;

  const tests = [
    ['sucesso de primeira não espera nem repete', async () => {
      let chamadas = 0;
      const resultado = await comBackoff(
        async () => {
          chamadas++;
          return 'ok';
        },
        { tentativas: 3, baseMs: 10 }
      );
      assert.strictEqual(resultado, 'ok');
      assert.strictEqual(chamadas, 1);
    }],

    ['tenta de novo após falha e retorna sucesso na 2ª tentativa', async () => {
      let chamadas = 0;
      const resultado = await comBackoff(
        async () => {
          chamadas++;
          if (chamadas < 2) throw new Error('falha simulada');
          return 'ok-na-segunda';
        },
        { tentativas: 3, baseMs: 10 }
      );
      assert.strictEqual(resultado, 'ok-na-segunda');
      assert.strictEqual(chamadas, 2);
    }],

    ['esgota tentativas e propaga o último erro', async () => {
      let chamadas = 0;
      await assert.rejects(
        () =>
          comBackoff(
            async () => {
              chamadas++;
              throw new Error(`falha ${chamadas}`);
            },
            { tentativas: 3, baseMs: 10 }
          ),
        /falha 3/
      );
      assert.strictEqual(chamadas, 3);
    }],

    ['espera cresce exponencialmente entre tentativas (base 10ms, fator 3 -> ~10ms, ~30ms)', async () => {
      let chamadas = 0;
      const inicio = Date.now();
      await assert.rejects(() =>
        comBackoff(
          async () => {
            chamadas++;
            throw new Error('sempre falha');
          },
          { tentativas: 3, baseMs: 10, fatorMultiplicador: 3 }
        )
      );
      const duracao = Date.now() - inicio;
      // 2 esperas (entre 1-2 e 2-3): 10ms + 30ms = 40ms mínimo; margem generosa pra CI lento
      assert.ok(duracao >= 35, `duração muito curta pro backoff esperado: ${duracao}ms`);
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
