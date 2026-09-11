#!/usr/bin/env node
'use strict';

/**
 * PROVA — `noticias.js --dry-run` ativa `lib/modo-seco.js` DE VERDADE
 * (RELATORIO-CERCA-SECA.md §Apêndice — noticias.js), não só imprime uma
 * mensagem no console.
 *
 * Chama `main()` — exportado de `noticias.js` só para este teste, a guarda
 * `require.main === module` continua impedindo que ele dispare sozinho
 * quando um teste faz `require('../noticias')` — EM PROCESSO, simulando
 * `node noticias.js sincronizar-sheets --dry-run` via `process.argv`, e
 * confirma:
 *
 *   1. `lib/modo-seco.js estaAtivo()` é `false` ANTES e `true` DEPOIS de
 *      `main()` rodar — o ESTADO real do flag de processo, não um texto no
 *      stdout (isso já está coberto por
 *      tests/noticias-cli-flags-help-dry-run.test.js).
 *   2. Com o flag deixado ativo por `main()`, uma chamada DIRETA a
 *      `lib/sheets.js obterAccessToken` — bypassando por completo
 *      `comandoSincronizarSheets` e seu próprio `if (dryRun ||
 *      semCredencial)` — ainda assim recusa fazer rede. Mesma cerca por
 *      baixo já provada para `radar.js` em
 *      tests/dry-run-cerca-seca.test.js, respondendo agora à ativação feita
 *      pelo `--dry-run` de NOTICIAS.js — prova que os dois CLIs
 *      compartilham o mesmo flag de processo, não duas cópias.
 *
 * `sincronizar-sheets` é o comando escolhido porque é o ÚNICO caminho de
 * escrita de `noticias.js` cuja camada de baixo (`lib/sheets.js`) já checa
 * `lib/modo-seco.js` — nenhuma chamada de rede acontece de qualquer forma
 * (nem antes, nem depois desta rodada; `dryRun` por si só já bloqueava).
 *
 * LIMITE HONESTO, documentado aqui e em RELATORIO-CERCA-SECA.md §Apêndice:
 * este teste NÃO prova — e não pode provar, porque o módulo está fora da
 * fronteira desta rodada — que `lib-noticias/store-noticias.js` respeita o
 * modo seco. Ele não respeita. A escrita de `store.salvarLote` em
 * `comandoColetar`/`comandoRecalcular` continua protegida só pelo `if
 * (opts['dry-run'])`/`if (opts.gravar && opts['dry-run'])` que já existiam
 * em `noticias.js` (testados em tests/noticias-cli-flags-help-dry-run.test.js),
 * nunca por `lib/modo-seco.js`.
 *
 * Sem I/O de disco: 100% em memória, contra `global.fetch` substituído e o
 * singleton `lib/modo-seco.js`. `data/noticias.jsonl` real nunca é tocado.
 */

const assert = require('assert');

const modoSeco = require('../lib/modo-seco');
const sheets = require('../lib/sheets');
const noticias = require('../noticias');

function runTest(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`  ✓ ${name}`);
      return true;
    })
    .catch(error => {
      console.log(`  ✗ ${name}`);
      console.error(`    ${error.stack || error.message}`);
      return false;
    });
}

async function main() {
  console.log('\n=== noticias-dry-run-modo-seco.test.js ===\n');
  let passed = 0;
  let failed = 0;

  const argvOriginal = process.argv;

  const tests = [
    ['`main()` com `sincronizar-sheets --dry-run` ativa lib/modo-seco.js — estado real, não só o print', async () => {
      modoSeco.desativar();
      assert.strictEqual(modoSeco.estaAtivo(), false, 'pré-condição: modo seco desligado antes deste teste');

      process.argv = [process.execPath, require.resolve('../noticias.js'), 'sincronizar-sheets', '--dry-run'];
      try {
        await noticias.main();
      } finally {
        process.argv = argvOriginal;
      }

      assert.strictEqual(
        modoSeco.estaAtivo(),
        true,
        '--dry-run deveria ter deixado lib/modo-seco.js ativo — a mesma cerca de radar.js, agora ativada pelo dispatch de noticias.js'
      );
      // Deliberadamente NÃO desativa aqui — o próximo teste depende deste
      // estado para provar a cerca por baixo respondendo a ele.
    }],

    ['com o modo seco deixado ativo pelo teste anterior, lib/sheets.js recusa rede mesmo chamado DIRETAMENTE (bypassando comandoSincronizarSheets)', async () => {
      assert.strictEqual(
        modoSeco.estaAtivo(),
        true,
        'depende do teste anterior ter deixado o flag ativo — mesma ordem de execução deste arquivo, sem desativar entre os dois'
      );
      const chamadasFetch = [];
      const fetchOriginal = global.fetch;
      global.fetch = (...args) => {
        chamadasFetch.push(args);
        throw new Error('fetch NUNCA deveria ser chamado em modo seco');
      };
      try {
        const token = await sheets.obterAccessToken({ clientEmail: 'fake@example.test', privateKey: 'fake' });
        assert.strictEqual(token, 'modo-seco-sem-token', 'sentinela esperado de lib/sheets.js em modo seco');
        assert.strictEqual(chamadasFetch.length, 0, 'MODO SECO: zero chamadas de fetch, mesmo bypassando comandoSincronizarSheets');
      } finally {
        global.fetch = fetchOriginal;
        modoSeco.desativar(); // limpa para não vazar para outros arquivos de teste
      }
    }]
  ];

  for (const [name, fn] of tests) {
    if (await runTest(name, fn)) passed++;
    else failed++;
  }

  modoSeco.desativar();
  process.argv = argvOriginal;

  console.log(`\n${passed} passou(aram), ${failed} falhou(aram)\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
