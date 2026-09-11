#!/usr/bin/env node
'use strict';

/**
 * PROVA DA CERCA POR BAIXO — RELATORIO-CERCA-SECA.md.
 *
 * O incidente real (RELATORIO-ONDA-12-13.md §Nota de segurança): `node
 * radar.js coletar --help` caiu no comando real e escreveu 3 registros em
 * `data/store.jsonl` porque `--dry-run`, na época, só suprimia o alerta do
 * Telegram — nenhuma camada de escrita sabia que estava em modo seco.
 *
 * Este arquivo testa a CAMADA DE ESCRITA diretamente (lib/store.js,
 * lib/saude.js, lib/backfill-progresso.js, lib/sheets.js, lib/telegram.js)
 * com lib/modo-seco.js ativado — NUNCA via CLI, NUNCA via opts de comando.
 * É o teste que continua valendo quando um comando novo, escrito daqui a
 * seis meses por alguém que não leu este arquivo, esquecer de checar
 * `opts['dry-run']` antes de chamar `store.atualizar(...)`: se o comando
 * novo estiver com o processo em modo seco (porque a CLI já ativa
 * `modoSeco.ativar()` no dispatch — ver radar.js `main()`), a escrita ainda
 * assim é recusada, porque a recusa mora na função que toca disco/rede, não
 * no comando que a chama.
 *
 * TODO caminho de disco usa `os.tmpdir()` — nunca `data/store.jsonl` real
 * (o incidente já custou 3 registros; não repetir).
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const modoSeco = require('../lib/modo-seco');
const store = require('../lib/store');
const saude = require('../lib/saude');
const backfillProgresso = require('../lib/backfill-progresso');
const sheets = require('../lib/sheets');
const telegram = require('../lib/telegram');

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
    })
    .finally(() => modoSeco.desativar()); // nunca deixa o flag vazar para o próximo teste
}

function novoCaminhoTemp(sufixo) {
  return path.join(os.tmpdir(), `radar-cerca-seca-${Date.now()}-${Math.random().toString(36).slice(2)}${sufixo}`);
}

function registroFake(id, extra = {}) {
  return {
    id,
    fonte: 'dou',
    orgao: 'Universidade Federal de Teste',
    area: 'Design',
    data_publicacao: '2026-01-01',
    url: `https://example.test/${id}`,
    ...extra
  };
}

async function main() {
  console.log('\n=== dry-run-cerca-seca.test.js ===\n');
  let passed = 0;
  let failed = 0;

  const tests = [
    // -------------------------------------------------------------- store.js
    ['CONTROLE (sem modo seco): store.salvar GRAVA de verdade — prova que o teste não está mudo', () => {
      const p = novoCaminhoTemp('.jsonl');
      modoSeco.desativar();
      const r = store.salvar(registroFake('controle-1'), p);
      assert.strictEqual(r.novo, true);
      assert.ok(fs.existsSync(p), 'arquivo deveria existir depois de um salvar real');
      assert.strictEqual(store.carregarTudo(p).length, 1);
      fs.unlinkSync(p);
    }],

    ['store.salvar EM MODO SECO não cria o arquivo, mas ainda reporta "seria novo" (mede sem gravar)', () => {
      const p = novoCaminhoTemp('.jsonl');
      modoSeco.ativar();
      const r = store.salvar(registroFake('seco-1'), p);
      assert.strictEqual(r.novo, true, 'ainda deveria REPORTAR que seria novo — é o "mede e imprime o que faria"');
      assert.strictEqual(fs.existsSync(p), false, 'MODO SECO: o arquivo não pode ter sido criado');
    }],

    ['store.atualizar EM MODO SECO não altera o arquivo já existente', () => {
      const p = novoCaminhoTemp('.jsonl');
      modoSeco.desativar();
      store.salvar(registroFake('atualiza-1', { score: null }), p);
      const antes = fs.readFileSync(p, 'utf8');
      const mtimeAntes = fs.statSync(p).mtimeMs;

      modoSeco.ativar();
      const patched = store.atualizar('atualiza-1', { score: 77 }, p);
      assert.strictEqual(patched.score, 77, 'o retorno ainda reflete o patch (útil para log), mesmo sem persistir');

      const depois = fs.readFileSync(p, 'utf8');
      assert.strictEqual(depois, antes, 'MODO SECO: o conteúdo do arquivo não pode ter mudado');
      assert.strictEqual(fs.statSync(p).mtimeMs, mtimeAntes, 'MODO SECO: nem o mtime pode ter mudado (prova que não houve write)');

      modoSeco.desativar();
      fs.unlinkSync(p);
    }],

    ['store.salvarTudo EM MODO SECO (chamada direta, o ponto de bloqueio) não cria o arquivo', () => {
      const p = novoCaminhoTemp('.jsonl');
      modoSeco.ativar();
      store.salvarTudo([registroFake('direto-1')], p);
      assert.strictEqual(fs.existsSync(p), false);
    }],

    // -------------------------------------------------------------- saude.js
    ['CONTROLE (sem modo seco): saude.registrar GRAVA de verdade', () => {
      const p = novoCaminhoTemp('.jsonl');
      modoSeco.desativar();
      saude.registrar({ fonte: 'dou', dataAlvo: 'hoje', volumeBruto: 10, nivel: 'ok' }, p);
      assert.ok(fs.existsSync(p));
      assert.strictEqual(saude.carregarTudo(p).length, 1);
      fs.unlinkSync(p);
    }],

    ['saude.registrar EM MODO SECO não escreve — nem a linha do "0 registros" que o incidente removeu à mão', () => {
      const p = novoCaminhoTemp('.jsonl');
      modoSeco.ativar();
      const completo = saude.registrar({ fonte: 'dou', dataAlvo: 'hoje', volumeBruto: 0, nivel: 'critico' }, p);
      assert.strictEqual(completo.nivel, 'critico', 'ainda devolve o registro completo (para log/print)');
      assert.strictEqual(fs.existsSync(p), false, 'MODO SECO: nada deveria ter sido escrito em data/saude.jsonl');
    }],

    // ------------------------------------------------------ backfill-progresso.js
    ['backfill-progresso.salvar EM MODO SECO não persiste — evita que um --dry-run "roube" dias de um backfill real futuro', () => {
      const p = novoCaminhoTemp('.json');
      modoSeco.desativar();
      const estado = backfillProgresso.carregar('01-01-2026', '02-01-2026', p);
      backfillProgresso.marcarProcessada(estado, '01-01-2026', {}, p);
      assert.ok(fs.existsSync(p), 'controle: progresso real grava');
      const antes = fs.readFileSync(p, 'utf8');

      modoSeco.ativar();
      backfillProgresso.marcarProcessada(estado, '02-01-2026', {}, p);
      const depois = fs.readFileSync(p, 'utf8');
      assert.strictEqual(depois, antes, 'MODO SECO: marcar um segundo dia como processado não pode ter sido persistido');

      modoSeco.desativar();
      fs.unlinkSync(p);
    }],

    // -------------------------------------------------------------- sheets.js
    ['sheets: EM MODO SECO nenhuma chamada de rede acontece (obterAccessToken/limparAba/escreverValores), mesmo com credencial "real" fornecida', async () => {
      const chamadasFetch = [];
      const fetchOriginal = global.fetch;
      global.fetch = (...args) => {
        chamadasFetch.push(args);
        throw new Error('fetch NUNCA deveria ser chamado em modo seco');
      };
      try {
        modoSeco.ativar();
        const token = await sheets.obterAccessToken({ clientEmail: 'fake@example.test', privateKey: 'fake' });
        assert.strictEqual(typeof token, 'string', 'devolve um sentinela, nunca undefined');
        await sheets.limparAba({ spreadsheetId: 'fake-id', aba: 'dados (não edite)', accessToken: token });
        await sheets.escreverValores({ spreadsheetId: 'fake-id', aba: 'dados (não edite)', valores: [['x']], accessToken: token });
        assert.strictEqual(chamadasFetch.length, 0, 'MODO SECO: zero chamadas de fetch, mesmo com credencial fornecida');
      } finally {
        global.fetch = fetchOriginal;
      }
    }],

    // ------------------------------------------------------------ telegram.js
    ['telegram: EM MODO SECO nenhum envio real acontece, MESMO com dryRun:false e token/chatId "reais" explícitos', async () => {
      const chamadasFetch = [];
      const fetchOriginal = global.fetch;
      global.fetch = (...args) => {
        chamadasFetch.push(args);
        throw new Error('fetch NUNCA deveria ser chamado em modo seco');
      };
      try {
        modoSeco.ativar();
        const resultado = await telegram.enviar('mensagem de teste', {
          token: 'token-real-fake',
          chatId: 'chat-real-fake',
          dryRun: false // deliberadamente false — a cerca tem que segurar mesmo se o chamador errar
        });
        assert.strictEqual(resultado.dryRun, true, 'modo seco se comporta como dry-run para quem chama');
        assert.strictEqual(chamadasFetch.length, 0, 'MODO SECO: zero chamadas de fetch, mesmo com dryRun:false explícito');
      } finally {
        global.fetch = fetchOriginal;
      }
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
