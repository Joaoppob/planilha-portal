#!/usr/bin/env node
'use strict';

/**
 * Testa o fechamento de backlog GRANULAR POR FONTE (radar.js
 * `fecharBacklogDaFonte`/`migrarMarcadoresBacklog`/`montarDigestFechamento`)
 * — a regressão real que motivou esta Onda: o ProgramaThor entrando como
 * SEGUNDA fonte da trilha `mercado` (178 vagas novas no store) não podia ser
 * tratado pelo marcador granular ANTERIOR, que era por TRILHA
 * (`data/backlog-fechado.json.mercado`, fechado em 26/08 com a Gupy) — uma
 * fonte nova dentro de uma trilha já fechada reabria exatamente o mesmo
 * problema que o fechamento existe pra evitar (~113 mensagens de descoberta
 * retroativa, indistinguíveis de vaga genuinamente nova, a ~10/dia — teto de
 * config/notificacao.json max_mensagens_por_execucao).
 *
 * Cobre, com arquivos temporários isolados (nunca toca em data/ real):
 *   1. migração do formato pré-histórico (plano, só docente, fechamento de
 *      13/08) pro formato por fonte — vira `{ dou: {...} }`;
 *   2. migração do formato POR TRILHA (produção entre 13/08 e esta Onda —
 *      `{ docente: {...}, mercado: {...} }`) pro formato por fonte — vira
 *      `{ dou: {...}, gupy: {...} }`, preservando os valores originais;
 *   3. formato já por fonte passa direto, sem alterar;
 *   4. fechar o backlog de UMA fonte marca só os registros DAQUELA fonte —
 *      nem outra fonte da MESMA trilha (Gupy vs ProgramaThor, ambas
 *      mercado), nem a outra trilha (docente/dou), são tocadas;
 *   5. idempotência por fonte: fechar de novo sem --forcar não remarca nada
 *      e não reenvia o digest;
 *   6. envio que falha (rede/API) não marca nada como notificado nem grava
 *      o marcador de fechamento (regra dura do briefing).
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const store = require('../lib/store');
const { montarRegistro } = require('../lib/schema');
const { gerarId } = require('../lib/hash');
const radar = require('../radar.js');

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

async function runAsyncTest(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    return true;
  } catch (error) {
    console.log(`  ✗ ${name}`);
    console.error(`    ${error.message}`);
    return false;
  }
}

function novoArquivoTemp(prefixo) {
  return path.join(os.tmpdir(), `radar-${prefixo}-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
}

function registroDocente(overrides) {
  const dados = {
    fonte: 'dou',
    trilha: 'docente',
    orgao: 'Universidade Federal de Alfenas',
    area: 'Design',
    data_publicacao: '2026-08-12',
    url: 'https://www.in.gov.br/web/dou/-/exemplo-docente-' + Math.random(),
    score: 70,
    veredito: 'elegivel_agora',
    notificado: false
  };
  const parcial = { ...dados, ...overrides };
  return montarRegistro({ ...parcial, id: gerarId({ orgao: parcial.orgao, area: parcial.area, data_publicacao: parcial.data_publicacao, url: parcial.url }) });
}

function registroGupy(overrides) {
  const dados = {
    fonte: 'gupy',
    trilha: 'mercado',
    orgao: 'Empresa Exemplo Gupy',
    area: 'IA/Agentes',
    data_publicacao: '2026-08-26',
    url: 'https://exemplo.gupy.io/job/' + Math.random(),
    score: 82,
    veredito: 'aderente',
    notificado: false
  };
  const parcial = { ...dados, ...overrides };
  return montarRegistro({ ...parcial, id: gerarId({ orgao: parcial.orgao, area: parcial.area, data_publicacao: parcial.data_publicacao, url: parcial.url }) });
}

function registroProgramathor(overrides) {
  const dados = {
    fonte: 'programathor',
    trilha: 'mercado',
    orgao: 'Empresa Exemplo ProgramaThor',
    area: 'IA/Agentes',
    data_publicacao: '2026-08-26',
    url: 'https://programathor.com.br/jobs/' + Math.floor(Math.random() * 1e6) + '-exemplo',
    score: 75,
    veredito: 'aderente',
    notificado: false
  };
  const parcial = { ...dados, ...overrides };
  return montarRegistro({ ...parcial, id: gerarId({ orgao: parcial.orgao, area: parcial.area, data_publicacao: parcial.data_publicacao, url: parcial.url }) });
}

async function main() {
  console.log('\n=== backlog-fechado-granular.test.js ===\n');
  let passed = 0;
  let failed = 0;

  const syncTests = [
    ['migrarMarcadoresBacklog: formato pré-histórico (plano, só docente) migra pra { dou: {...} } sem mexer nos valores', () => {
      const antigo = { fechado_em: '2026-08-13T12:02:33.106Z', total_marcado: 204 };
      const migrado = radar.migrarMarcadoresBacklog(antigo);
      assert.deepStrictEqual(migrado, { dou: { fechado_em: '2026-08-13T12:02:33.106Z', total_marcado: 204 } });
    }],

    ['migrarMarcadoresBacklog: formato POR TRILHA (produção até esta Onda) migra pra POR FONTE — docente->dou, mercado->gupy', () => {
      const porTrilha = { docente: { fechado_em: '2026-08-13T12:02:33.106Z', total_marcado: 204 }, mercado: { fechado_em: '2026-08-26T20:57:46.418Z', total_marcado: 359 } };
      const migrado = radar.migrarMarcadoresBacklog(porTrilha);
      assert.deepStrictEqual(migrado, {
        dou: { fechado_em: '2026-08-13T12:02:33.106Z', total_marcado: 204 },
        gupy: { fechado_em: '2026-08-26T20:57:46.418Z', total_marcado: 359 }
      });
    }],

    ['migrarMarcadoresBacklog: formato já por fonte passa direto, sem alterar', () => {
      const novo = { dou: { fechado_em: 'x', total_marcado: 1 }, gupy: { fechado_em: 'y', total_marcado: 2 }, programathor: { fechado_em: 'z', total_marcado: 3 } };
      assert.deepStrictEqual(radar.migrarMarcadoresBacklog(novo), novo);
    }],

    ['migrarMarcadoresBacklog: objeto vazio/ausente vira {}', () => {
      assert.deepStrictEqual(radar.migrarMarcadoresBacklog(null), {});
      assert.deepStrictEqual(radar.migrarMarcadoresBacklog({}), {});
    }],

    ['trilhaDoRegistro: registro sem campo trilha (antigo) é tratado como docente', () => {
      assert.strictEqual(radar.trilhaDoRegistro({ fonte: 'dou' }), 'docente');
      assert.strictEqual(radar.trilhaDoRegistro({ trilha: 'mercado' }), 'mercado');
    }],

    ['trilhaDaFonte: dou é docente; gupy e programathor são mercado', () => {
      assert.strictEqual(radar.trilhaDaFonte('dou'), 'docente');
      assert.strictEqual(radar.trilhaDaFonte('gupy'), 'mercado');
      assert.strictEqual(radar.trilhaDaFonte('programathor'), 'mercado');
    }]
  ];

  for (const [name, fn] of syncTests) {
    if (runTest(name, fn)) passed++;
    else failed++;
  }

  // --- fecharBacklogDaFonte: cenário real (Onda pós-ProgramaThor) ---
  // Store com histórico dou JÁ FECHADO + gupy JÁ FECHADA (marcador por
  // fonte, pós-migração) + programathor ainda pendente — replica
  // data/store.jsonl e data/backlog-fechado.json (já migrado) do dia
  // 26/08/2026 depois da correção desta Onda.
  {
    const storePath = novoArquivoTemp('store');
    const markerPath = novoArquivoTemp('marker');

    const douAntigos = [registroDocente({ notificado: true }), registroDocente({ notificado: true })];
    const gupyAntigos = [registroGupy({ notificado: true }), registroGupy({ notificado: true })];
    const programathorPendente = [registroProgramathor({}), registroProgramathor({}), registroProgramathor({})];
    store.salvarTudo([...douAntigos, ...gupyAntigos, ...programathorPendente], storePath);
    fs.writeFileSync(
      markerPath,
      JSON.stringify(
        { dou: { fechado_em: '2026-08-13T12:02:33.106Z', total_marcado: 204 }, gupy: { fechado_em: '2026-08-26T20:57:46.418Z', total_marcado: 359 } },
        null,
        2
      ),
      'utf8'
    );

    if (
      await runAsyncTest(
        'fecharBacklogDaFonte("dou"): marcador existente é respeitado — fonte dou fica intocada (backlog já fechado)',
        async () => {
          await radar.fecharBacklogDaFonte('dou', { dryRun: false, forcar: false, storePath, markerPath, scoreMinimo: 51 });
          const douDepois = store.listar(r => r.fonte === 'dou', storePath);
          assert.strictEqual(douDepois.filter(r => r.notificado === true).length, 2);
          const marcadores = radar.carregarMarcadoresBacklog(markerPath);
          assert.strictEqual(marcadores.dou.total_marcado, 204); // marcador ORIGINAL preservado, não sobrescrito
        }
      )
    ) {
      passed++;
    } else {
      failed++;
    }

    if (
      await runAsyncTest(
        'fecharBacklogDaFonte("gupy"): marcador existente é respeitado — fonte gupy fica intocada (backlog já fechado)',
        async () => {
          await radar.fecharBacklogDaFonte('gupy', { dryRun: false, forcar: false, storePath, markerPath, scoreMinimo: 51 });
          const gupyDepois = store.listar(r => r.fonte === 'gupy', storePath);
          assert.strictEqual(gupyDepois.filter(r => r.notificado === true).length, 2);
          const marcadores = radar.carregarMarcadoresBacklog(markerPath);
          assert.strictEqual(marcadores.gupy.total_marcado, 359); // marcador ORIGINAL preservado, não sobrescrito
        }
      )
    ) {
      passed++;
    } else {
      failed++;
    }

    if (
      await runAsyncTest(
        'fecharBacklogDaFonte("programathor"): fecha só a fonte programathor, sem tocar em dou nem gupy (mesma trilha mercado que gupy, mas fonte diferente)',
        async () => {
          await radar.fecharBacklogDaFonte('programathor', { dryRun: false, forcar: false, storePath, markerPath, scoreMinimo: 51 });
          const todos = store.carregarTudo(storePath);
          const programathorDepois = todos.filter(r => r.fonte === 'programathor');
          const gupyDepois = todos.filter(r => r.fonte === 'gupy');
          const douDepois = todos.filter(r => r.fonte === 'dou');
          assert.strictEqual(programathorDepois.every(r => r.notificado === true), true, 'todos os 3 registros de programathor marcados');
          assert.strictEqual(gupyDepois.filter(r => r.notificado === true).length, 2, 'os 2 gupy continuam exatamente como estavam');
          assert.strictEqual(douDepois.filter(r => r.notificado === true).length, 2, 'os 2 dou continuam exatamente como estavam');

          const marcadores = radar.carregarMarcadoresBacklog(markerPath);
          assert.ok(marcadores.programathor, 'marcador de programathor foi criado');
          assert.strictEqual(marcadores.programathor.total_marcado, 3);
          assert.strictEqual(marcadores.gupy.total_marcado, 359, 'marcador gupy histórico preservado byte-a-byte');
          assert.strictEqual(marcadores.dou.total_marcado, 204, 'marcador dou histórico preservado byte-a-byte');
        }
      )
    ) {
      passed++;
    } else {
      failed++;
    }

    if (
      await runAsyncTest(
        'idempotência por fonte: fechar programathor de novo sem --forcar não remarca nada nem regrava o marcador',
        async () => {
          const marcadorAntes = radar.carregarMarcadoresBacklog(markerPath).programathor;
          await radar.fecharBacklogDaFonte('programathor', { dryRun: false, forcar: false, storePath, markerPath, scoreMinimo: 51 });
          const marcadorDepois = radar.carregarMarcadoresBacklog(markerPath).programathor;
          assert.deepStrictEqual(marcadorDepois, marcadorAntes, 'fechado_em/total_marcado não mudam numa 2a chamada sem --forcar');
        }
      )
    ) {
      passed++;
    } else {
      failed++;
    }

    fs.unlinkSync(storePath);
    fs.unlinkSync(markerPath);
  }

  // --- envio que falha: nada é marcado, nada é gravado ---
  {
    const storePath = novoArquivoTemp('store');
    const markerPath = novoArquivoTemp('marker');
    const programathorPendente = [registroProgramathor({}), registroProgramathor({})];
    store.salvarTudo(programathorPendente, storePath);
    // sem marcador prévio (arquivo não existe)

    const telegram = require('../lib/telegram');
    const enviarOriginal = telegram.enviar;
    telegram.enviar = async () => {
      throw new Error('[falha simulada: telegram sendMessage | HTTP 500 | rede fora do ar]');
    };
    try {
      if (
        await runAsyncTest(
          'REGRA DURA: se o envio do digest falhar (throw), nenhum registro é marcado como notificado e o marcador NÃO é gravado',
          async () => {
            await radar.fecharBacklogDaFonte('programathor', {
              dryRun: false,
              forcar: false,
              token: 'token-fake',
              chatId: 'chat-fake',
              storePath,
              markerPath,
              scoreMinimo: 51
            });
            const todos = store.carregarTudo(storePath);
            assert.strictEqual(todos.every(r => r.notificado === false), true, 'nenhum registro marcado — o envio falhou');
            const marcadores = radar.carregarMarcadoresBacklog(markerPath);
            assert.strictEqual(marcadores.programathor, undefined, 'marcador de fechamento não foi criado — o envio falhou');
          }
        )
      ) {
        passed++;
      } else {
        failed++;
      }
    } finally {
      telegram.enviar = enviarOriginal;
    }

    if (fs.existsSync(storePath)) fs.unlinkSync(storePath);
    if (fs.existsSync(markerPath)) fs.unlinkSync(markerPath);
  }

  // --- montarDigestFechamento("programathor"): vocabulário de mercado, nomeia a fonte e o diferencial ---
  {
    const storePath = novoArquivoTemp('store');
    store.salvarTudo(
      [registroProgramathor({ veredito: 'aderente' }), registroProgramathor({ veredito: 'aderente' }), registroProgramathor({ veredito: 'fora' })],
      storePath
    );

    if (
      runTest('montarDigestFechamento("programathor"): usa vocabulário de mercado (vaga/aderente), nunca "elegível" (docente), e nomeia a fonte + diferencial', () => {
        const digest = radar.montarDigestFechamento('programathor', { scoreMinimo: 51, storePath });
        assert.ok(/ProgramaThor/.test(digest), 'menciona o nome da fonte');
        assert.ok(/vaga/i.test(digest), 'vocabulário de mercado presente');
        assert.ok(/aderente/i.test(digest), 'vocabulário de mercado (aderente) presente');
        assert.ok(/stack|faixa salarial|tipo de contrato/i.test(digest), 'menciona o diferencial frente à Gupy');
        assert.ok(!/elegível/i.test(digest), 'vocabulário docente (elegível) NÃO aparece no digest de mercado');
      })
    ) {
      passed++;
    } else {
      failed++;
    }

    fs.unlinkSync(storePath);
  }

  console.log(`\n${passed} passou(aram), ${failed} falhou(aram)\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
