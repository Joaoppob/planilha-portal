#!/usr/bin/env node
'use strict';

/**
 * Testa lib/ollama.js — fallback de modelo (Onda 1.5, "a escolha do modelo
 * tem que estar em config, não hardcoded"). Monkey-patcha global.fetch pra
 * rodar 100% offline (nunca bate no Ollama real).
 */

const assert = require('assert');
const ollama = require('../lib/ollama');

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

function respostaOk(texto) {
  return { ok: true, json: async () => ({ response: texto }) };
}

function respostaErro(status) {
  return { ok: false, status };
}

const registroBase = {
  orgao: 'Universidade Federal de Alfenas',
  area: 'Design',
  subarea: 'Design Digital',
  titulacao_exigida: 'doutorado',
  tipo: 'efetivo',
  score: 80,
  veredito: 'elegivel_futuro',
  texto_bruto: 'edital de exemplo'
};

async function main() {
  console.log('\n=== ollama-fallback.test.js ===\n');
  let passed = 0;
  let failed = 0;
  const fetchOriginal = global.fetch;

  const tests = [
    ['ollama desabilitado em config nunca chama fetch', async () => {
      let chamou = false;
      global.fetch = async () => {
        chamou = true;
        return respostaOk('não deveria chegar aqui');
      };
      const perfil = { ollama: { habilitado: false } };
      const resultado = await ollama.julgar(registroBase, perfil);
      assert.strictEqual(resultado.status, 'pendente');
      assert.strictEqual(chamou, false);
    }],

    ['modelo padrão responde ok -> usa o modelo padrão, sem tocar no fallback', async () => {
      const modelosChamados = [];
      global.fetch = async (url, opts) => {
        const body = JSON.parse(opts.body);
        modelosChamados.push(body.model);
        return respostaOk('vale a pena, área forte.');
      };
      const perfil = { ollama: { habilitado: true, modelo: 'gemma4:26b', modelo_fallback: 'gemma3:4b', timeout_ms: 5000 } };
      const resultado = await ollama.julgar(registroBase, perfil);
      assert.strictEqual(resultado.status, 'ok');
      assert.strictEqual(resultado.modeloUsado, 'gemma4:26b');
      assert.deepStrictEqual(modelosChamados, ['gemma4:26b']);
    }],

    ['modelo padrão falha (HTTP erro) -> cai para modelo_fallback automaticamente', async () => {
      const modelosChamados = [];
      global.fetch = async (url, opts) => {
        const body = JSON.parse(opts.body);
        modelosChamados.push(body.model);
        if (body.model === 'gemma4:26b') return respostaErro(404); // modelo não encontrado no host, por ex.
        return respostaOk('julgamento via fallback.');
      };
      const perfil = { ollama: { habilitado: true, modelo: 'gemma4:26b', modelo_fallback: 'gemma3:4b', timeout_ms: 5000 } };
      const resultado = await ollama.julgar(registroBase, perfil);
      assert.strictEqual(resultado.status, 'ok');
      assert.strictEqual(resultado.modeloUsado, 'gemma3:4b');
      assert.deepStrictEqual(modelosChamados, ['gemma4:26b', 'gemma3:4b']);
      assert.match(resultado.motivo, /fallback/);
    }],

    ['modelo padrão E fallback falham -> status pendente com motivo explicando os dois', async () => {
      global.fetch = async () => respostaErro(500);
      const perfil = { ollama: { habilitado: true, modelo: 'gemma4:26b', modelo_fallback: 'gemma3:4b', timeout_ms: 5000 } };
      const resultado = await ollama.julgar(registroBase, perfil);
      assert.strictEqual(resultado.status, 'pendente');
      assert.strictEqual(resultado.justificativa, null);
      assert.match(resultado.motivo, /gemma4:26b/);
      assert.match(resultado.motivo, /gemma3:4b/);
    }],

    ['sem modelo_fallback configurado, falha do modelo padrão vai direto pra pendente', async () => {
      const modelosChamados = [];
      global.fetch = async (url, opts) => {
        modelosChamados.push(JSON.parse(opts.body).model);
        return respostaErro(500);
      };
      const perfil = { ollama: { habilitado: true, modelo: 'gemma3:4b', timeout_ms: 5000 } };
      const resultado = await ollama.julgar(registroBase, perfil);
      assert.strictEqual(resultado.status, 'pendente');
      assert.deepStrictEqual(modelosChamados, ['gemma3:4b']);
    }]
  ];

  for (const [name, fn] of tests) {
    if (await runTest(name, fn)) passed++;
    else failed++;
  }

  global.fetch = fetchOriginal;

  console.log(`\n${passed} passou(aram), ${failed} falhou(aram)\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
