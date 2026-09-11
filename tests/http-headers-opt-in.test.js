#!/usr/bin/env node
'use strict';

/**
 * Prova de não-regressão da opção `headers` acrescentada a `lib/http.js
 * get()` (investigação do bloqueio HTTP 429 em `fontes/vagas.js
 * /vagas/{id}`, 09/09/2026 — briefing de Durin §4 "FRONTEIRA DURA": "Nenhuma
 * fonte existente pode mudar de comportamento sem pedir explicitamente...
 * A prova disso é sua"). Duas partes, nenhuma toca rede:
 *
 *   1. `global.fetch` mockado — chama `http.get(url)` (sem segundo
 *      argumento, exatamente como TODA fonte hoje chama) e verifica que o
 *      objeto `headers` passado ao `fetch()` real é BYTE A BYTE o mesmo de
 *      antes desta mudança (`{ 'User-Agent': UA, Accept:
 *      'text/html,application/json' }`, nem uma chave a mais). Depois
 *      chama `http.get(url, { headers: {...} })` e verifica que o header
 *      novo se soma sem tocar UA/Accept — a opção é aditiva, não
 *      substitutiva.
 *
 *   2. Varredura ESTÁTICA (grep, sem executar nada) de todo `fontes/*.js` e
 *      `fontes-noticias/*.js` — EXCETO `fontes/vagas.js`, a única fonte
 *      autorizada a pedir a opção nesta onda — confirmando que nenhuma
 *      chamada a `http.get(` passa um segundo argumento contendo `headers`.
 *      Isto é o que torna a alegação "as outras seis fontes continuam
 *      emitindo requisição idêntica" verificável automaticamente, não só
 *      por leitura visual: se qualquer fonte docente/notícia ganhar uma
 *      chamada com `headers` no futuro (por engano ou por outra onda), este
 *      teste quebra e avisa.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

function main() {
  console.log('\n=== http-headers-opt-in.test.js ===\n');
  let passed = 0;
  let failed = 0;

  const tests = [];

  // --- Parte 1: mock de fetch, sem rede ---
  tests.push(['get(url) SEM segundo argumento — headers enviados ao fetch() são byte-idênticos aos de antes da mudança', async () => {
    const originalFetch = global.fetch;
    let headersCapturados = null;
    let optionsCapturadas = null;
    global.fetch = async (url, options) => {
      headersCapturados = options.headers;
      optionsCapturadas = options;
      return { ok: true, status: 200, text: async () => 'corpo-fake' };
    };
    try {
      delete require.cache[require.resolve('../lib/http')];
      const http = require('../lib/http');
      const corpo = await http.get('https://exemplo.test/pagina');
      assert.strictEqual(corpo, 'corpo-fake');
      assert.deepStrictEqual(
        headersCapturados,
        { 'User-Agent': http.UA, Accept: 'text/html,application/json' },
        'headers devem ser EXATAMENTE os 2 campos de antes, nem uma chave a mais'
      );
      assert.strictEqual(Object.keys(headersCapturados).length, 2, 'nenhuma chave extra deve aparecer quando headers não é passado');
      assert.strictEqual(optionsCapturadas.redirect, 'follow');
    } finally {
      global.fetch = originalFetch;
    }
  }]);

  tests.push(['get(url, { headers }) — opção nova SOMA ao header default, nunca substitui UA/Accept', async () => {
    const originalFetch = global.fetch;
    let headersCapturados = null;
    global.fetch = async (url, options) => {
      headersCapturados = options.headers;
      return { ok: true, status: 200, text: async () => 'corpo-fake' };
    };
    try {
      delete require.cache[require.resolve('../lib/http')];
      const http = require('../lib/http');
      await http.get('https://exemplo.test/pagina', { headers: { Referer: 'https://exemplo.test/origem', 'Accept-Language': 'pt-BR' } });
      assert.strictEqual(headersCapturados['User-Agent'], http.UA, 'UA não pode mudar quando o caller só quer acrescentar Referer/Accept-Language');
      assert.strictEqual(headersCapturados.Accept, 'text/html,application/json', 'Accept default não pode mudar');
      assert.strictEqual(headersCapturados.Referer, 'https://exemplo.test/origem');
      assert.strictEqual(headersCapturados['Accept-Language'], 'pt-BR');
    } finally {
      global.fetch = originalFetch;
    }
  }]);

  tests.push(['post()/getComCharset() continuam com a MESMA assinatura de antes (regressão não pedida por este briefing)', () => {
    delete require.cache[require.resolve('../lib/http')];
    const http = require('../lib/http');
    assert.strictEqual(typeof http.post, 'function');
    assert.strictEqual(typeof http.getComCharset, 'function');
    assert.strictEqual(typeof http.UA, 'string');
  }]);

  // --- Parte 2: varredura estática — nenhuma fonte além de vagas.js pede headers ---
  const raizRadar = path.join(__dirname, '..');
  const arquivosParaVarrer = [
    ...fs.readdirSync(path.join(raizRadar, 'fontes')).filter(f => f.endsWith('.js') && f !== 'vagas.js').map(f => path.join('fontes', f)),
    ...fs.readdirSync(path.join(raizRadar, 'fontes-noticias')).filter(f => f.endsWith('.js')).map(f => path.join('fontes-noticias', f))
  ];

  tests.push([`varredura estática: nenhuma chamada http.get( em ${arquivosParaVarrer.length} arquivo(s) fora de vagas.js passa um segundo argumento com "headers" — a opção nova é OPT-IN, ninguém opta sem pedir`, () => {
    const RE_GET_COM_SEGUNDO_ARG = /http\.get\(\s*[^,]+,\s*\{[^}]*\}/g;
    const suspeitos = [];
    for (const rel of arquivosParaVarrer) {
      const conteudo = fs.readFileSync(path.join(raizRadar, rel), 'utf8');
      let m;
      RE_GET_COM_SEGUNDO_ARG.lastIndex = 0;
      while ((m = RE_GET_COM_SEGUNDO_ARG.exec(conteudo))) {
        if (/headers/.test(m[0])) suspeitos.push(`${rel}: ${m[0]}`);
      }
    }
    assert.strictEqual(suspeitos.length, 0, `chamada(s) inesperada(s) com headers fora de vagas.js: ${JSON.stringify(suspeitos)}`);
  }]);

  tests.push(['varredura estática: TODA chamada http.get( fora de vagas.js é de 1 argumento só (url), confirmando a forma exata já usada hoje', () => {
    const RE_GET_QUALQUER = /http\.get\([^)]*\)/g;
    const chamadasComDoisArgs = [];
    for (const rel of arquivosParaVarrer) {
      const conteudo = fs.readFileSync(path.join(raizRadar, rel), 'utf8');
      let m;
      RE_GET_QUALQUER.lastIndex = 0;
      while ((m = RE_GET_QUALQUER.exec(conteudo))) {
        const temVirgula = m[0].includes(',');
        if (temVirgula) chamadasComDoisArgs.push(`${rel}: ${m[0]}`);
      }
    }
    assert.strictEqual(chamadasComDoisArgs.length, 0, `chamada(s) http.get com múltiplos argumentos fora de vagas.js: ${JSON.stringify(chamadasComDoisArgs)}`);
  }]);

  return (async () => {
    for (const [name, fn] of tests) {
      try {
        const resultado = fn();
        if (resultado && typeof resultado.then === 'function') await resultado;
        console.log(`  ✓ ${name}`);
        passed++;
      } catch (error) {
        console.log(`  ✗ ${name}`);
        console.error(`    ${error.message}`);
        failed++;
      }
    }
    console.log(`\n${passed} passou(aram), ${failed} falhou(aram)\n`);
    process.exit(failed > 0 ? 1 : 0);
  })();
}

main();
