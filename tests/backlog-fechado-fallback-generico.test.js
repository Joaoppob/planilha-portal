#!/usr/bin/env node
'use strict';

/**
 * Testa o RAMO GENÉRICO DE FALLBACK de `radar.js montarDigestFechamento`
 * (Onda pós-mapeamento, item 1a do briefing — o "conserto de maior valor
 * por linha do plano inteiro", C5 do plano `.claude/plans/radar-crm-20-ondas.md`).
 *
 * O BUG VIVO QUE ESTE TESTE COBRE: `montarDigestFechamento` só tinha ramo
 * (`if`) pra `dou`/`gupy`/`programathor`; `pci` e `weworkremotely` já
 * estavam no store SEM marcador em `data/backlog-fechado.json`, e o
 * `throw new Error(...)` no fim da função (linha antiga) lançava assim que
 * `comandoAtivarNotificacoes` — que itera TODAS as fontes vistas no store,
 * `[...new Set(store.carregarTudo().map(r => r.fonte))]`, sem exceção —
 * chegava numa fonte sem ramo. No `rodar-diario.bat` isso derrubava a
 * etapa 3 (ativar-notificacoes), a marca de "já rodou hoje"
 * (data/ultima-execucao.json) nunca era gravada, e o pipeline inteiro
 * reroda nos 3 horários agendados (08h, 13h, 19h) — TODO dia, pra sempre,
 * enquanto pci/weworkremotely estiverem no store (o que já é o caso hoje:
 * 24 registros de pci e 40 de weworkremotely em data/store.jsonl real).
 *
 * ANTES DO CONSERTO (código de hoje, sem o ramo genérico): os testes 1 e 2
 * abaixo falhavam com `[montarDigestFechamento] fonte desconhecida: "pci"`
 * / `"weworkremotely"` em vez de devolver uma string. DEPOIS: nenhuma fonte
 * — vista aqui ou nova, ainda nem imaginada — pode derrubar
 * `montarDigestFechamento` por falta de `if` dedicado; o teste 3 prova isso
 * com uma fonte hipotética que nem existe em `fontes/index.js`.
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

function registroPci(overrides) {
  const dados = {
    fonte: 'pci',
    trilha: 'docente',
    orgao: 'UFSCar - Universidade Federal de São Carlos',
    area: 'Computação/IA',
    data_publicacao: '2026-08-21',
    url: 'https://www.pciconcursos.com.br/noticias/exemplo-' + Math.random(),
    score: 68,
    veredito: 'elegivel_agora',
    notificado: false
  };
  const parcial = { ...dados, ...overrides };
  return montarRegistro({ ...parcial, id: gerarId({ orgao: parcial.orgao, area: parcial.area, data_publicacao: parcial.data_publicacao, url: parcial.url }) });
}

function registroWeWorkRemotely(overrides) {
  const dados = {
    fonte: 'weworkremotely',
    trilha: 'mercado',
    orgao: 'Empresa Exemplo WWR',
    area: 'IA/Agentes',
    data_publicacao: '2026-08-27',
    url: 'https://weworkremotely.com/remote-jobs/exemplo-' + Math.floor(Math.random() * 1e6),
    score: 74,
    veredito: 'aderente',
    notificado: false
  };
  const parcial = { ...dados, ...overrides };
  return montarRegistro({ ...parcial, id: gerarId({ orgao: parcial.orgao, area: parcial.area, data_publicacao: parcial.data_publicacao, url: parcial.url }) });
}

async function main() {
  console.log('\n=== backlog-fechado-fallback-generico.test.js ===\n');
  let passed = 0;
  let failed = 0;

  // --- 1. montarDigestFechamento("pci") não lança, usa vocabulário docente ---
  {
    const storePath = novoArquivoTemp('store');
    store.salvarTudo([registroPci({ veredito: 'elegivel_agora' }), registroPci({ veredito: 'fora' })], storePath);

    if (
      runTest(
        'montarDigestFechamento("pci"): ramo genérico não lança — vocabulário DOCENTE (edital/elegível), nunca "vaga"/"aderente"',
        () => {
          let digest;
          assert.doesNotThrow(() => {
            digest = radar.montarDigestFechamento('pci', { scoreMinimo: 51, storePath });
          }, 'pci não tinha ramo dedicado antes desta Onda — o fallback tem que cobrir sem lançar');
          assert.ok(/PCI/.test(digest), 'menciona o nome da fonte (fontes/pci.js nome)');
          assert.ok(/edital/i.test(digest), 'vocabulário docente (edital) presente — trilha de pci é docente (sem TRILHA declarada em fontes/pci.js, default docente)');
          assert.ok(/elegív/i.test(digest), 'vocabulário docente (elegível) presente');
          // "aderente" é o VEREDITO da trilha mercado (nunca aparece num
          // digest docente) — não checa ausência da palavra "vaga" sozinha
          // porque o próprio texto docente a usa numa frase contrastiva
          // ("vocabulário de edital, não de vaga"), mesmo padrão já usado
          // pelo formatador de mercado ORIGINAL (lib/telegram.js
          // formatarDigestFechamentoFonteMercado, que cita "edital" na
          // mesma frase contrastiva sem deixar de ser um digest de mercado).
          assert.ok(!/aderente/i.test(digest), 'vocabulário de mercado (aderente, veredito exclusivo da trilha mercado) NÃO aparece — pci é trilha docente');
        }
      )
    ) {
      passed++;
    } else {
      failed++;
    }

    fs.unlinkSync(storePath);
  }

  // --- 2. montarDigestFechamento("weworkremotely") não lança, usa vocabulário mercado ---
  {
    const storePath = novoArquivoTemp('store');
    store.salvarTudo(
      [registroWeWorkRemotely({ veredito: 'aderente' }), registroWeWorkRemotely({ veredito: 'aderente' }), registroWeWorkRemotely({ veredito: 'fora' })],
      storePath
    );

    if (
      runTest(
        'montarDigestFechamento("weworkremotely"): ramo genérico não lança — vocabulário MERCADO (vaga/aderente), nunca "edital"/"elegível"',
        () => {
          let digest;
          assert.doesNotThrow(() => {
            digest = radar.montarDigestFechamento('weworkremotely', { scoreMinimo: 51, storePath });
          }, 'weworkremotely não tinha ramo dedicado antes desta Onda — o fallback tem que cobrir sem lançar');
          assert.ok(/We Work Remotely/i.test(digest), 'menciona o nome da fonte (fontes/weworkremotely.js nome)');
          assert.ok(/vaga/i.test(digest), 'vocabulário de mercado (vaga) presente — weworkremotely declara TRILHA=mercado');
          assert.ok(/aderente/i.test(digest), 'vocabulário de mercado (aderente) presente');
          // "elegível" é o VEREDITO da trilha docente (nunca aparece num
          // digest de mercado) — não checa ausência da palavra "edital"
          // sozinha pelo mesmo motivo do teste anterior (frase contrastiva
          // legítima, mesmo padrão do formatador ORIGINAL de mercado).
          assert.ok(!/elegív/i.test(digest), 'vocabulário docente (elegível, veredito exclusivo da trilha docente) NÃO aparece — weworkremotely é trilha mercado');
        }
      )
    ) {
      passed++;
    } else {
      failed++;
    }

    fs.unlinkSync(storePath);
  }

  // --- 3. Fonte hipotética, nem cadastrada em fontes/index.js: ainda não lança ---
  {
    const storePath = novoArquivoTemp('store');
    const registroFontaFutura = montarRegistro({
      id: gerarId({ orgao: 'Órgão Futuro', area: 'Design', data_publicacao: '2026-09-01', url: 'https://exemplo.com/futuro' }),
      fonte: 'fonte-futura-inexistente',
      trilha: 'docente',
      orgao: 'Órgão Futuro',
      area: 'Design',
      data_publicacao: '2026-09-01',
      url: 'https://exemplo.com/futuro',
      score: 60,
      veredito: 'elegivel_agora',
      notificado: false
    });
    store.salvarTudo([registroFontaFutura], storePath);

    if (
      runTest(
        'montarDigestFechamento("fonte-futura-inexistente"): fonte nem cadastrada em fontes/index.js ainda não lança — usa o próprio id como rótulo, trilha default docente',
        () => {
          let digest;
          assert.doesNotThrow(() => {
            digest = radar.montarDigestFechamento('fonte-futura-inexistente', { scoreMinimo: 51, storePath });
          }, 'REGRA DO BRIEFING: fonte nova nunca mais pode derrubar o pipeline por falta de ramo, mesmo sem módulo em fontes/');
          // MarkdownV2 escapa hífen (`\-`) — telegram.escapeMarkdownV2 faz
          // isso de propósito (lib/telegram.js), então o id aparece como
          // "fonte\-futura\-inexistente" no texto final. Remove as barras
          // de escape antes de comparar (mesma técnica que qualquer leitor
          // humano do Telegram já aplicaria ao ler a mensagem renderizada).
          const semEscapeMarkdown = digest.replace(/\\([_*[\]()~`>#+\-=|{}.!])/g, '$1');
          assert.ok(/fonte-futura-inexistente/.test(semEscapeMarkdown), 'usa o id cru como rótulo quando não há módulo em listaFontes');
        }
      )
    ) {
      passed++;
    } else {
      failed++;
    }

    fs.unlinkSync(storePath);
  }

  // --- 4. Cenário de produção real: comandoAtivarNotificacoes sobre um
  //         store com dou+pci+weworkremotely (réplica do store real de
  //         28/08/2026) não lança em NENHUMA fonte — é o caminho exato que
  //         quebrava em produção (rodar-diario.bat etapa 3). ---
  {
    const storePath = novoArquivoTemp('store');
    const markerPath = novoArquivoTemp('marker');
    store.salvarTudo(
      [
        montarRegistro({
          id: gerarId({ orgao: 'UFSCar', area: 'Design', data_publicacao: '2026-08-12', url: 'https://in.gov.br/exemplo-dou' }),
          fonte: 'dou',
          trilha: 'docente',
          orgao: 'UFSCar',
          area: 'Design',
          data_publicacao: '2026-08-12',
          url: 'https://in.gov.br/exemplo-dou',
          score: 70,
          veredito: 'elegivel_agora',
          notificado: false
        }),
        registroPci({}),
        registroWeWorkRemotely({})
      ],
      storePath
    );

    if (
      await runAsyncTest(
        'fecharBacklogDaFonte cobre dou+pci+weworkremotely na MESMA execução (réplica de comandoAtivarNotificacoes) sem lançar em nenhuma — bug de produção de rodar-diario.bat etapa 3 fechado',
        async () => {
          const fontesNoStore = [...new Set(store.carregarTudo(storePath).map(r => r.fonte))].sort();
          assert.deepStrictEqual(fontesNoStore, ['dou', 'pci', 'weworkremotely']);

          for (const fonteId of fontesNoStore) {
            await radar.fecharBacklogDaFonte(fonteId, { dryRun: true, forcar: false, storePath, markerPath, scoreMinimo: 51 });
          }
          // dry-run: nada gravado no marcador (mesma regra dura de
          // fecharBacklogDaFonte), mas chegar até aqui sem lançar já prova
          // o conserto — o bug de produção era um throw no meio do loop.
          const marcadores = radar.carregarMarcadoresBacklog(markerPath);
          assert.deepStrictEqual(marcadores, {}, 'dry-run não grava marcador de nenhuma fonte');
        }
      )
    ) {
      passed++;
    } else {
      failed++;
    }

    fs.unlinkSync(storePath);
    if (fs.existsSync(markerPath)) fs.unlinkSync(markerPath);
  }

  console.log(`\n${passed} passou(aram), ${failed} falhou(aram)\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
