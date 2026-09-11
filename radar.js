#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');
const { spawnSync } = require('child_process');

const { carregarEnv } = require('./lib/env');
const coverage = require('./lib/coverage');
const modoSeco = require('./lib/modo-seco');
const store = require('./lib/store');
const schema = require('./lib/schema');
const hash = require('./lib/hash');
const keywordFiltro = require('./lib/keyword-filtro');
const vagaDocente = require('./lib/vaga-docente');
const vagaMercado = require('./lib/vaga-mercado');
const scoreMercado = require('./lib/score-mercado');
const subeditalExtrator = require('./lib/subedital-extrator');
const ufLookup = require('./lib/uf-lookup');
const score = require('./lib/score');
const ollama = require('./lib/ollama');
const telegram = require('./lib/telegram');
const saude = require('./lib/saude');
const saudeAlerta = require('./lib/saude-alerta');
const datas = require('./lib/datas');
const retry = require('./lib/retry');
const backfillProgresso = require('./lib/backfill-progresso');
const hipoteseIF = require('./lib/hipotese-if');
const relatorioBackfill = require('./lib/relatorio-backfill');
const reprocessar = require('./lib/reprocessar');
const relatorioJB = require('./lib/relatorio-jb');
const extrairIndeterminados = require('./lib/extrair-indeterminados');
const sheets = require('./lib/sheets');
const { listaFontes } = require('./fontes');

const CONFIG_DIR = path.join(__dirname, 'config');
const RELATORIO_PATH = path.join(__dirname, 'RELATORIO-BACKFILL.md');

const keywordsConfig = JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, 'keywords.json'), 'utf8'));
const negativosConfig = JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, 'negativos.json'), 'utf8'));
const perfil = JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, 'perfil.json'), 'utf8'));
// Trilha mercado (Onda 3) — config isolada, ver README §Trilha mercado / lib/score-mercado.js.
const keywordsMercadoConfig = JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, 'keywords-mercado.json'), 'utf8'));

carregarEnv();

// Throttle "seja educado com o servidor" (item 1 do briefing Onda 1.5) entre
// requisições de LISTAGEM do dia no backfill — documentado no README
// §Backfill. Separado da pausa de 300ms já existente entre requisições de
// ENRIQUECIMENTO (artigo completo), que só dispara para itens que já
// passaram o filtro de keyword (poucos por dia).
const THROTTLE_LISTAGEM_MS_PADRAO = 1500;
const TENTATIVAS_BACKOFF_PADRAO = 3;

function parseArgs(argv) {
  const [comando, ...resto] = argv;
  const opts = {};
  for (let i = 0; i < resto.length; i++) {
    if (resto[i].startsWith('--')) {
      const chave = resto[i].slice(2);
      const temValor = resto[i + 1] !== undefined && !resto[i + 1].startsWith('--');
      opts[chave] = temValor ? resto[++i] : true;
    }
  }
  return { comando, opts };
}

function carregarSaudeConfig() {
  const p = path.join(CONFIG_DIR, 'saude.json');
  if (!fs.existsSync(p)) return {};
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

/**
 * Monta o registro parcial (id incluso) de um item de fonte e salva no
 * store. Compartilhado pelo caminho de edital único e pelo caminho de
 * subedital (item 3 do briefing Onda 1.6) — só o que entra em
 * `camposEspecificos` muda entre os dois.
 */
function salvarRegistro({ fonte, parcial, camposEspecificos }) {
  // Onda 3 — carimba a trilha da FONTE no registro salvo (README §Trilha
  // mercado): 'docente' é o default pra fontes que não declaram `trilha`
  // (só o DOU, hoje — comportamento idêntico ao de antes desta onda).
  // `comandoJulgar` lê `registro.trilha` (persistido) pra escolher a rubrica
  // certa, em vez de precisar reencontrar a fonte original a cada julgamento.
  const registroParcial = { ...parcial, ...camposEspecificos, trilha: fonte.trilha || 'docente' };
  registroParcial.id = hash.gerarId({
    orgao: registroParcial.orgao,
    area: registroParcial.area,
    data_publicacao: registroParcial.data_publicacao,
    url: registroParcial.url,
    subedital: registroParcial.subedital
  });

  const registro = schema.montarRegistro(registroParcial);
  const resultado = store.salvar(registro);
  const rotulo = registro.subedital ? ` [subedital ${registro.subedital}]` : '';
  if (resultado.novo) {
    console.log(`  + novo: ${registro.orgao || '?'}${rotulo} — ${registro.area}/${registro.subarea} (${registro.id})`);
  }
  return resultado.novo;
}

/**
 * Processa a lista de itens JÁ buscada por uma fonte. Compartilhado por
 * `coletar` e `backfill`. Pipeline INVERTIDO (item 3 do briefing Onda 1.6 —
 * corrige o falso-negativo em massa: filtro de área rodando sobre o preview
 * de ~400 chars da listagem nunca via a área de editais guarda-chuva, como
 * o da UFSCar em 12/08/2026):
 *
 *   estágio 1 — `vagaDocente.pareceVagaDocente` sobre a CASCA (título +
 *     preview + hierarquia): "é vaga docente?", amplo por desenho
 *     (falso-positivo é barato, falso-negativo é fatal) — NUNCA filtra por
 *     área aqui.
 *   estágio 2 — `fonte.enriquecer()`: busca o texto INTEGRAL do edital, pra
 *     TODO item que passou o estágio 1 (não só os que já bateram keyword na
 *     casca, como antes).
 *   estágio 3 — filtro de keyword (área/elegibilidade) sobre o texto
 *     ENRIQUECIDO. Se o edital tiver tabela de subeditais
 *     (`fonte.dividirSubeditais`, opcional no contrato de fonte — ver
 *     README), cada subedital de área distinta é avaliado e salvo como item
 *     PRÓPRIO; senão, o filtro roda sobre o texto inteiro e salva um único
 *     registro (como no pipeline antigo, só que agora sobre o texto
 *     completo, não a casca).
 */
/**
 * Contadores de cobertura (positivos — briefing "quanto passou sobre quanto
 * havia", lib/coverage.js) de UMA rodada de `processarItensFonte`, um por
 * estágio que descarta registro. As chaves variam por trilha porque os
 * estágios são diferentes (mercado: gate + aderência; docente: gate +
 * subedital-linha OU edital-único, nunca os dois pro mesmo item) — quem lê
 * o `coverage` de volta (comandoColetar) sabe disso e só formata as chaves
 * que vieram preenchidas (as outras ficam `null`, nunca um 0/0 fabricado
 * pra um estágio que este item nem passou perto de tocar).
 *
 * Cada contador declara sua UNIDADE (lib/coverage.js — dado de primeira
 * classe, não convenção de nome): `gate`/`aderencia`/`editalUnico` contam
 * ITENS (um rawItem = uma unidade, em qualquer trilha); `subeditalLinha`
 * conta LINHAS de uma tabela de subedital — uma unidade DIFERENTE (um item
 * guarda-chuva vira MUITAS linhas). É por isso que `coverage.somar()` nunca
 * pode misturar `editalUnico` com `subeditalLinha` — "itens" e
 * "linhas_subedital" são grandezas distintas, mesmo que ambas venham do
 * mesmo estágio 3 docente (achado real, ver cabeçalho de lib/coverage.js).
 */
function novosContadoresCoverage(ehMercado) {
  return {
    gate: coverage.novoContador('itens'),
    aderencia: ehMercado ? coverage.novoContador('itens') : null,
    subeditalLinha: ehMercado ? null : coverage.novoContador('linhas_subedital'),
    editalUnico: ehMercado ? null : coverage.novoContador('itens')
  };
}

function resolverCoverage(contadores) {
  const out = {};
  for (const [chave, contador] of Object.entries(contadores)) {
    out[chave] = contador ? contador.resultado() : null;
  }
  return out;
}

async function processarItensFonte(fonte, itens) {
  let novos = 0;
  let duplicados = 0;
  let descartados = 0;

  const ehMercado = fonte.trilha === 'mercado';
  const contadores = novosContadoresCoverage(ehMercado);

  for (const rawItem of itens) {
    // Trilha MERCADO (Onda 3) — gate e avaliação de área PRÓPRIOS, nunca os
    // estágios docente-específicos abaixo (README §Trilha mercado, "o
    // achado estrutural": processarItensFonte era fonte-agnóstico mas
    // trilha-específico, chamava vagaDocente/subeditalExtrator pra QUALQUER
    // fonte). Cada iteração da trilha mercado termina em `continue` — o
    // resto da função (estágios 1/2/3 docente, subedital incluso) só roda
    // pra fonte cuja `trilha` não é 'mercado'.
    if (fonte.trilha === 'mercado') {
      const passouGateMercado = vagaMercado.pareceVagaMercado(rawItem);
      contadores.gate.registrar(
        passouGateMercado,
        passouGateMercado ? null : { id: (rawItem && rawItem.jobUrl) || (rawItem && rawItem.name) || null, reason: 'gate_vaga_mercado' }
      );
      if (!passouGateMercado) {
        descartados++;
        continue;
      }
      const parcialMercado = fonte.normalizarParcial(rawItem);
      // Sem pausa de rede aqui de propósito: fontes da trilha mercado (ver
      // fontes/gupy.js) não fazem requisição extra em enriquecer() — a
      // descrição completa já veio na busca. O throttle "coletor educado"
      // desta trilha mora dentro de fonte.coletar() (paginação/termos).
      const extraMercado = await fonte.enriquecer(rawItem);
      const textoMercado = extraMercado.texto_bruto || parcialMercado.texto_bruto || fonte.textoParaFiltro(rawItem);
      const avaliacaoMercado = scoreMercado.avaliarAderencia(textoMercado, keywordsMercadoConfig);
      contadores.aderencia.registrar(
        avaliacaoMercado.passou,
        avaliacaoMercado.passou ? null : { id: parcialMercado.url || null, reason: 'sem_termo_aderencia_mercado' }
      );
      if (!avaliacaoMercado.passou) {
        descartados++;
        continue;
      }
      const camposEspecificos = {
        ...extraMercado,
        area: avaliacaoMercado.area,
        subarea: avaliacaoMercado.subarea,
        keywords_matched: avaliacaoMercado.matches.map(m => m.termo)
      };
      const foiNovo = salvarRegistro({ fonte, parcial: parcialMercado, camposEspecificos });
      if (foiNovo) novos++;
      else duplicados++;
      continue;
    }

    const textoPreview = fonte.textoParaFiltro(rawItem);

    // Estágio 1 — é vaga docente? (amplo, nunca filtra por área)
    const passouGateDocente = vagaDocente.pareceVagaDocente(textoPreview);
    contadores.gate.registrar(
      passouGateDocente,
      passouGateDocente ? null : { id: coverage.idProvisorio(textoPreview), reason: 'gate_vaga_docente' }
    );
    if (!passouGateDocente) {
      descartados++;
      continue;
    }

    const parcial = fonte.normalizarParcial(rawItem);
    // pausa de cortesia entre requisições de enriquecimento (fetch do artigo completo)
    await new Promise(r => setTimeout(r, 300));
    const extra = await fonte.enriquecer(rawItem); // estágio 2 — sempre enriquece

    const textoEnriquecido = extra.texto_bruto || parcial.texto_bruto || '';
    const linhasSubedital =
      typeof fonte.dividirSubeditais === 'function' ? fonte.dividirSubeditais(textoEnriquecido) : null;

    // Item 2 do briefing Onda 1.7: lookup por instituição primeiro (mais
    // confiável), texto do edital só como fallback quando o lookup não
    // encontrar nada — nunca inventa, ver lib/uf-lookup.js `resolverUf`.
    const ufResolvido = parcial.uf || ufLookup.extrairUfDoTexto(textoEnriquecido);

    if (linhasSubedital) {
      // Edital guarda-chuva: cada subedital de área distinta vira item próprio.
      // `registrosRelevantes` (lib/subedital-extrator.js) não muda — devolve só
      // as linhas que passaram; a cobertura por-linha é derivada AQUI, de fora,
      // comparando `linhasSubedital` (total) contra os `subedital` (código) que
      // sobreviveram, sem alterar o filtro em si (zero risco de comportamento).
      const relevantes = subeditalExtrator.registrosRelevantes(linhasSubedital, keywordsConfig);
      const codigosRelevantes = new Set(relevantes.map(r => r.subedital));
      for (const linha of linhasSubedital) {
        const passouLinha = codigosRelevantes.has(linha.codigo);
        contadores.subeditalLinha.registrar(
          passouLinha,
          passouLinha ? null : { id: linha.codigo || null, reason: 'subedital_area_incompativel' }
        );
      }
      if (relevantes.length === 0) {
        descartados++;
        continue;
      }
      for (const sub of relevantes) {
        const camposEspecificos = {
          campus: sub.campus || parcial.campus,
          uf: ufResolvido,
          vagas: sub.vagas,
          titulacao_exigida: sub.titulacao_exigida,
          texto_bruto: sub.texto_bruto,
          area: sub.area,
          subarea: sub.subarea,
          keywords_matched: sub.keywords_matched,
          subedital: sub.subedital,
          regime: extra.regime,
          classe: extra.classe,
          tipo: extra.tipo,
          inscricao_inicio: extra.inscricao_inicio,
          inscricao_fim: extra.inscricao_fim
        };
        const foiNovo = salvarRegistro({ fonte, parcial, camposEspecificos });
        if (foiNovo) novos++;
        else duplicados++;
      }
      continue;
    }

    // Estágio 3 — edital de subedital único: filtro de keyword sobre o texto
    // ENRIQUECIDO inteiro. Item 1 do briefing Onda 1.7: quando o texto parece
    // ter múltiplas linhas de área distinta num formato de tabela não
    // reconhecido, `avaliarEditalUnico` já devolve area/subarea null +
    // `extracao: 'formato_nao_reconhecido'` — nunca o primeiro match do
    // extrator genérico (ver lib/subedital-extrator.js).
    const avaliacao = subeditalExtrator.avaliarEditalUnico(textoEnriquecido, keywordsConfig);
    contadores.editalUnico.registrar(
      avaliacao.passou,
      avaliacao.passou ? null : { id: parcial.url || null, reason: 'edital_unico_sem_termo_area' }
    );
    if (!avaliacao.passou) {
      descartados++;
      continue;
    }

    const camposEspecificos = {
      ...extra,
      uf: ufResolvido,
      area: avaliacao.area,
      subarea: avaliacao.subarea,
      keywords_matched: avaliacao.keywords_matched,
      extracao: avaliacao.extracao,
      // ambíguo: vagas/titulação/campus também saem null — o mesmo risco que
      // fez area/subarea saírem null (podem pertencer a outra linha da
      // tabela não reconhecida, não à linha que bateu o filtro de área).
      ...(avaliacao.ambiguo ? { vagas: null, titulacao_exigida: null, campus: null } : {})
    };
    const foiNovo = salvarRegistro({ fonte, parcial, camposEspecificos });
    if (foiNovo) novos++;
    else duplicados++;
  }

  return { novos, duplicados, descartados, coverage: resolverCoverage(contadores) };
}

/**
 * Busca a listagem de uma data com retry+backoff (item 1 do briefing). Usado
 * pelo backfill; `coletar` (dia corrente) chama fonte.coletar diretamente
 * porque uma falha isolada de "hoje" não precisa de retry agressivo — o
 * cron roda de novo amanhã e o alerta de saúde já avisa.
 */
async function coletarComBackoff(fonte, dataStr, tentativas = TENTATIVAS_BACKOFF_PADRAO) {
  return retry.comBackoff(() => fonte.coletar({ data: dataStr }), { tentativas, baseMs: 5000 });
}

/**
 * Registra saúde da coleta e, se fora do normal, dispara alerta (canal
 * separado do alerta de vaga — item 3 do briefing Onda 1.5). Wrapper fino
 * de CLI sobre lib/saude-alerta.js (lá está a lógica testável).
 */
async function registrarSaudeEAlertar({ fonte, dataAlvo, volumeBruto, erro, alertar, dryRun }) {
  const saudeConfig = carregarSaudeConfig();
  const faixaMin = saudeConfig[fonte.id] && saudeConfig[fonte.id].volume_bruto_min;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID_SAUDE || process.env.TELEGRAM_CHAT_ID;

  const { avaliacao } = await saudeAlerta.avaliarRegistrarEAlertar({
    fonte: fonte.id,
    dataAlvo,
    volumeBruto,
    erro,
    faixaMin,
    alertar,
    token,
    chatId,
    dryRun: dryRun === true || !token || !chatId
  });

  console.log(`[saude] fonte=${fonte.id} nivel=${avaliacao.nivel}${avaliacao.motivo ? ' — ' + avaliacao.motivo : ''}`);
  return avaliacao;
}

/**
 * `fontesOverride` (opcional) — só para tests/*.test.js injetarem uma fonte
 * STUB em memória (sem rede) e exercitar o `comandoColetar` REAL de ponta a
 * ponta (briefing do controle positivo: "o código que produz aquela saída
 * nunca rodou" era a lacuna — isto fecha ela sem tocar `fontes/index.js`).
 * Default `listaFontes` preserva 100% o comportamento de produção — `main()`
 * chama `comandoColetar(opts)` com um argumento só, nunca passa o segundo.
 */
async function comandoColetar(opts, fontesOverride) {
  const fontesParaColeta = fontesOverride || listaFontes;
  let totalNovos = 0;
  let totalDuplicados = 0;
  let totalDescartados = 0;
  let totalErrosFonte = 0;

  // Cobertura agregada da rodada inteira (briefing: o par "quanto passou
  // sobre quanto havia" tem que atravessar a cadeia, não morrer na primeira
  // fonte) — soma via lib/coverage.js `somar`, começando de 0/0 (nada
  // observado ainda). Os três últimos ficam `null` até a primeira fonte que
  // de fato preencher aquele estágio (mercado e docente têm estágios
  // diferentes — ver `novosContadoresCoverage`).
  let covTipoTotal = { unidade: 'itens', covered: 0, total: 0, descartes: [] };
  let covGateTotal = { unidade: 'itens', covered: 0, total: 0, descartes: [] };
  let covAderenciaTotal = null;
  let covSubeditalLinhaTotal = null;
  let covEditalUnicoTotal = null;

  for (const fonte of fontesParaColeta) {
    console.log(`\n[coletar] fonte=${fonte.id}`);
    let itens = [];
    let volumeBruto = null;
    let erro = null;
    try {
      const resultado = await fonte.coletar({ data: opts.data });
      itens = resultado.itens;
      volumeBruto = resultado.volumeBruto;
    } catch (err) {
      erro = String((err && err.message) || err);
      console.error(erro);
      totalErrosFonte++;
    }

    if (!erro) {
      // Pré-filtro de tipo (dentro de fonte.coletar — ex.: ART_TYPES_EDITAL
      // do DOU): volumeBruto/itens.length já existiam como par informal
      // desde sempre (o sintoma original desta obra — este log, antes desta
      // mudança, imprimia os dois números soltos sem forma validada). Todas
      // as 7 fontes hoje reportam `volumeBruto` (conferido em fontes/*.js);
      // a checagem abaixo é defensiva para uma fonte futura que não reporte
      // — nesse caso não HÁ denominador real aqui, e o log diz isso.
      const temDenominador = typeof volumeBruto === 'number';
      const covTipo = { unidade: 'itens', covered: itens.length, total: temDenominador ? volumeBruto : itens.length };
      console.log(
        `[coletar] ${fonte.id}: pre-filtro-de-tipo ${coverage.formatar(covTipo)} (volume_bruto=${volumeBruto} candidatos=${itens.length})` +
          (temDenominador ? '' : ' — fonte não reportou volume_bruto, sem denominador real neste ponto')
      );
      covTipoTotal = coverage.somar(covTipoTotal, { ...covTipo, descartes: [] });

      const stats = await processarItensFonte(fonte, itens);
      totalNovos += stats.novos;
      totalDuplicados += stats.duplicados;
      totalDescartados += stats.descartados;

      const c = stats.coverage;
      console.log(
        `[coletar] ${fonte.id}: estagio1(gate) ${coverage.formatar(c.gate)}` +
          (c.aderencia ? ` estagio2(aderencia_mercado) ${coverage.formatar(c.aderencia)}` : '') +
          (c.subeditalLinha ? ` estagio3(subedital_linha) ${coverage.formatar(c.subeditalLinha)}` : '') +
          (c.editalUnico ? ` estagio3(edital_unico) ${coverage.formatar(c.editalUnico)}` : '')
      );

      covGateTotal = coverage.somar(covGateTotal, c.gate);
      if (c.aderencia) {
        covAderenciaTotal = coverage.somar(covAderenciaTotal || { unidade: 'itens', covered: 0, total: 0, descartes: [] }, c.aderencia);
      }
      if (c.subeditalLinha) {
        covSubeditalLinhaTotal = coverage.somar(
          covSubeditalLinhaTotal || { unidade: 'linhas_subedital', covered: 0, total: 0, descartes: [] },
          c.subeditalLinha
        );
      }
      if (c.editalUnico) {
        covEditalUnicoTotal = coverage.somar(covEditalUnicoTotal || { unidade: 'itens', covered: 0, total: 0, descartes: [] }, c.editalUnico);
      }
    }

    await registrarSaudeEAlertar({
      fonte,
      dataAlvo: opts.data,
      volumeBruto,
      erro,
      alertar: true,
      dryRun: opts['dry-run'] === true
    });
  }

  console.log(
    `\n[coletar] cobertura da rodada: pre-filtro-de-tipo ${coverage.formatar(covTipoTotal)}` +
      ` estagio1(gate, todas as fontes) ${coverage.formatar(covGateTotal)}` +
      (covAderenciaTotal ? ` estagio2(aderencia_mercado) ${coverage.formatar(covAderenciaTotal)}` : '') +
      (covSubeditalLinhaTotal ? ` estagio3(subedital_linha) ${coverage.formatar(covSubeditalLinhaTotal)}` : '') +
      (covEditalUnicoTotal ? ` estagio3(edital_unico) ${coverage.formatar(covEditalUnicoTotal)}` : '')
  );

  console.log(
    `\n[coletar] resumo: novos=${totalNovos} duplicados=${totalDuplicados} descartados_keyword=${totalDescartados} erros_fonte=${totalErrosFonte}`
  );
}

/**
 * Backfill histórico (item 1 do briefing Onda 1.5): varre [--de, --ate] dia
 * a dia, populando o store como se o radar tivesse rodado todo dia nesse
 * período. Retomável (lib/backfill-progresso.js) — interromper e rodar de
 * novo com os MESMOS --de/--ate continua de onde parou.
 */
async function comandoBackfill(opts) {
  if (!opts.de || !opts.ate) {
    console.error('Uso: node radar.js backfill --de DD-MM-AAAA --ate DD-MM-AAAA [--throttle-ms N] [--alertar]');
    process.exit(1);
  }

  const throttleMs = opts['throttle-ms'] ? parseInt(opts['throttle-ms'], 10) : THROTTLE_LISTAGEM_MS_PADRAO;
  const alertar = opts.alertar === true; // default: NÃO dispara telegram por dia histórico (evita flood de finais de semana) — sempre registra em saude.jsonl

  const todasDatas = datas.gerarIntervaloDatas(opts.de, opts.ate);
  const progresso = backfillProgresso.carregar(opts.de, opts.ate);
  progresso.throttleMs = throttleMs;
  progresso.tentativasBackoff = TENTATIVAS_BACKOFF_PADRAO;
  backfillProgresso.salvar(progresso);

  const idxRetomada = progresso.ultimaDataProcessada
    ? todasDatas.findIndex(d => d === progresso.ultimaDataProcessada) + 1
    : 0;

  console.log(
    `[backfill] de=${opts.de} ate=${opts.ate} total_dias=${todasDatas.length} retomando_do_dia=${idxRetomada + 1} throttle_ms=${throttleMs} alertar=${alertar}`
  );
  if (opts['dry-run'] === true) {
    console.log(
      '[backfill] --dry-run: modo seco ativo (lib/modo-seco.js) — coleta roda de verdade (mede volume/novos/duplicados), ' +
        'mas nada é escrito em data/store.jsonl, data/saude.jsonl nem data/backfill-progresso.json. ' +
        'RELATORIO-BACKFILL.md, ao final, reflete o store ATUAL (sem esta rodada) porque nada foi acrescentado a ele.'
    );
  }

  const estadoIF = hipoteseIF.novoEstado();
  let totalNovos = 0;
  let totalDuplicados = 0;
  let totalDescartados = 0;
  let totalErros = 0;

  for (let i = idxRetomada; i < todasDatas.length; i++) {
    const dataStr = todasDatas[i];
    const fonte = listaFontes.find(f => f.id === 'dou');

    let itens = [];
    let volumeBruto = null;
    let erro = null;
    try {
      const resultado = await coletarComBackoff(fonte, dataStr);
      itens = resultado.itens;
      volumeBruto = resultado.volumeBruto;
    } catch (err) {
      erro = String((err && err.message) || err);
      totalErros++;
    }

    if (!erro) {
      const statsFonte = await processarItensFonte(fonte, itens);
      totalNovos += statsFonte.novos;
      totalDuplicados += statsFonte.duplicados;
      totalDescartados += statsFonte.descartados;

      if (fonte.id === 'dou') {
        await hipoteseIF.processarDia(itens, dataStr, estadoIF);
      }
    }

    await registrarSaudeEAlertar({ fonte, dataAlvo: dataStr, volumeBruto, erro, alertar, dryRun: opts['dry-run'] === true });

    backfillProgresso.marcarProcessada(progresso, dataStr, erro ? { erro } : {});

    if ((i - idxRetomada + 1) % 10 === 0 || i === todasDatas.length - 1) {
      console.log(
        `[backfill] progresso: ${i + 1}/${todasDatas.length} dias · novos=${totalNovos} duplicados=${totalDuplicados} descartados=${totalDescartados} erros=${totalErros} · amostra_if=${estadoIF.amostrados}`
      );
    }

    if (i < todasDatas.length - 1) {
      await new Promise(r => setTimeout(r, throttleMs));
    }
  }

  backfillProgresso.marcarConcluido(progresso);
  console.log(
    `\n[backfill] concluído: novos=${totalNovos} duplicados=${totalDuplicados} descartados_keyword=${totalDescartados} erros_dia=${totalErros}`
  );

  console.log('[backfill] rodando julgar --ollama off para popular score (ranking do relatório)...');
  await comandoJulgar({ ollama: 'off', 'dry-run': opts['dry-run'] === true });

  console.log('[backfill] gerando RELATORIO-BACKFILL.md...');
  comandoRelatorioBackfill(opts);
}

function comandoRelatorioBackfill(opts) {
  if (!opts.de || !opts.ate) {
    console.error('Uso: node radar.js relatorio-backfill --de DD-MM-AAAA --ate DD-MM-AAAA');
    process.exit(1);
  }
  const dataDe = datas.parseDataBR(opts.de);
  const dataAte = datas.parseDataBR(opts.ate);

  const registros = store
    .listar(r => r.fonte === 'dou' && r.data_publicacao)
    .filter(r => {
      const d = new Date(r.data_publicacao + 'T12:00:00');
      return d >= dataDe && d <= dataAte;
    });

  const saudeRegistros = saude.carregarTudo().filter(r => {
    if (r.fonte !== 'dou' || !r.dataAlvo || r.dataAlvo === 'hoje') return false;
    try {
      const d = datas.parseDataBR(r.dataAlvo);
      return d >= dataDe && d <= dataAte;
    } catch {
      return false;
    }
  });

  const amostraIF = hipoteseIF.carregarTudo().filter(r => {
    try {
      const d = datas.parseDataBR(r.data);
      return d >= dataDe && d <= dataAte;
    } catch {
      return false;
    }
  });

  const progresso = backfillProgresso.carregar(opts.de, opts.ate);
  const throttleMs = progresso.throttleMs || THROTTLE_LISTAGEM_MS_PADRAO;
  const tentativasBackoff = progresso.tentativasBackoff || TENTATIVAS_BACKOFF_PADRAO;

  const markdown = relatorioBackfill.gerar({
    de: opts.de,
    ate: opts.ate,
    registros,
    saudeRegistros,
    amostraIF,
    throttleMs,
    tentativasBackoff
  });

  fs.writeFileSync(RELATORIO_PATH, markdown, 'utf8');
  console.log(`[relatorio-backfill] escrito em ${RELATORIO_PATH}`);
}

/**
 * Reprocessa o store INTEIRO com as regras/config atuais, sem tocar rede
 * (item 1 e 2 do briefing Onda 1.7 — "não recoletar o DOU inteiro de novo se
 * puder reprocessar o que está no disco"). Ver lib/reprocessar.js para o que
 * é corrigido (formato de tabela não reconhecido, UF, score/elegibilidade).
 * Idempotente — rodar duas vezes seguidas na segunda vez não altera nada.
 */
function comandoReprocessar(opts = {}) {
  const todos = store.listar();
  const { patches, resumo } = reprocessar.reprocessarTudo(todos, { keywordsConfig, negativosConfig, perfil });

  if (opts['dry-run'] === true) {
    console.log(
      `[reprocessar] --dry-run: ${patches.length} patch(es) SERIAM aplicados (calculados abaixo), nenhum foi gravado em data/store.jsonl.`
    );
  } else {
    for (const { id, patch } of patches) {
      store.atualizar(id, patch);
    }
  }

  console.log('[reprocessar] resumo:');
  console.log(`  total no store: ${resumo.total}`);
  console.log(`  registros alterados: ${resumo.alterados}`);
  console.log(`  uf preenchido (antes null): ${resumo.uf_preenchido}`);
  console.log(`  novos 'formato_nao_reconhecido': ${resumo.formato_nao_reconhecido_novo}`);
  console.log(`  novos com area_compativel 'compativel': ${resumo.area_compativel_novo}`);
  console.log(`  novos com area_compativel 'a_verificar_na_banca': ${resumo.area_a_verificar_novo}`);
  console.log('  mudanças de veredito:', resumo.veredito_mudou);
}

/**
 * Gera Academico/radar/RELATORIO-JB.md — o recorte de leitura humana pra JB
 * (item 3 do briefing Onda 1.7), sobre os itens `fonte === 'dou'` do store
 * (já reprocessados — rodar `reprocessar` antes se ainda não rodou).
 */
function comandoRelatorioJB() {
  const registros = store.listar(r => r.fonte === 'dou');
  const amostraIF = hipoteseIF.carregarTudo();
  const markdown = relatorioJB.gerar({ registros, amostraIF, perfil });
  const relatorioJBPath = path.join(__dirname, 'RELATORIO-JB.md');
  fs.writeFileSync(relatorioJBPath, markdown, 'utf8');
  console.log(`[relatorio-jb] escrito em ${relatorioJBPath}`);
}

async function comandoJulgar(opts) {
  const pendentes = store.listar(r => r.score === null || r.score === undefined);
  console.log(`[julgar] pendentes=${pendentes.length}`);
  if (opts['dry-run'] === true) {
    console.log(
      '[julgar] --dry-run: modo seco ativo (lib/modo-seco.js) — score/veredito de cada pendente é MEDIDO e ' +
        'impresso abaixo, mas nenhuma escrita em data/store.jsonl acontece.'
    );
  }
  const usarOllama = opts.ollama !== 'off';
  let processados = 0;

  for (const registro of pendentes) {
    let resultado;
    let julgamento = null;

    if (registro.trilha === 'mercado') {
      // Trilha mercado (Onda 3) — rubrica própria (lib/score-mercado.js),
      // SEM Ollama: o prompt de lib/ollama.js é docente-específico ("Você
      // avalia oportunidades de concurso docente para um doutorando de
      // Design"), rodá-lo sobre uma vaga de mercado produziria julgamento
      // sem sentido. Fora de escopo desta onda (ver README §Trilha mercado)
      // — `julgamento` fica null, honesto, em vez de forçar um veredito de
      // um modelo que não foi instruído pra essa tarefa.
      const pesoAderencia = scoreMercado.avaliarAderencia(registro.texto_bruto || '', keywordsMercadoConfig).pesoAderencia;
      resultado = scoreMercado.calcular({ pesoAderencia, dataPublicacao: registro.data_publicacao });
    } else {
      const pesoArea = keywordFiltro.resolverPesoArea(registro.area, keywordsConfig);
      const negativo = keywordFiltro.contemNegativo(registro.texto_bruto || '', negativosConfig.termos);

      resultado = score.calcular({
        pesoArea,
        titulacaoExigida: registro.titulacao_exigida,
        perfil,
        uf: registro.uf,
        inscricaoFim: registro.inscricao_fim,
        negativo,
        area: registro.area
      });

      if (usarOllama && resultado.veredito !== 'fora') {
        const veredictoOllama = await ollama.julgar(
          { ...registro, score: resultado.score, veredito: resultado.veredito },
          perfil
        );
        julgamento = veredictoOllama.status === 'ok' ? veredictoOllama.justificativa : 'pendente';
      } else if (resultado.veredito !== 'fora') {
        julgamento = 'pendente';
      }
    }

    store.atualizar(registro.id, {
      score: resultado.score,
      veredito: resultado.veredito,
      area_compativel: resultado.elegibilidade.area_compativel || null,
      julgamento,
      julgado_em: new Date().toISOString()
    });
    processados++;
    console.log(`  ${registro.orgao || '?'} — score=${resultado.score} veredito=${resultado.veredito}`);
  }

  console.log(`[julgar] processados=${processados}`);
}

/**
 * Onda 2.1, item 2 do briefing — lê os registros `veredito: 'indeterminada'`
 * com lib/extrator-llm.js (gemma4:26b, config/perfil.json). Dois modos:
 *
 *   --amostra N   modo de REVISÃO: processa só os N primeiros, imprime
 *                 campo a campo (extração + patch que SERIA aplicado), nunca
 *                 grava no store — pra conferir a extração contra o
 *                 texto_bruto original "com os próprios olhos" antes de
 *                 confiar (briefing: valide antes de aplicar aos 117).
 *   (sem --amostra) modo de LOTE: processa todos os pendentes; só GRAVA no
 *                 store se `--aplicar` for passado — sem ele é dry-run
 *                 (mostra o resumo, não persiste nada).
 *
 * Campo aplicado só quando o LLM respondeu com certeza E o registro ainda
 * não tinha valor confiável ali (lib/extrair-indeterminados.js
 * `aplicarCamposExtraidos`) — nunca sobrescreve regex/subedital já
 * resolvido. Todo campo aplicado entra em `campos_llm` (proveniência —
 * lib/schema.js) pra `reprocessar` nunca reverter o dado do LLM pra null.
 */
async function comandoExtrairLLM(opts) {
  const pendentes = store.listar(r => r.veredito === 'indeterminada');
  console.log(`[extrair-llm] indeterminados=${pendentes.length}`);
  if (!pendentes.length) return;

  const cfg = perfil.ollama || {};
  const modelo = cfg.modelo || 'gemma4:26b';
  const host = cfg.host || 'http://localhost:11434';

  console.log(`[extrair-llm] aquecendo ${modelo} em ${host} (timeout 120s)...`);
  const aquecimento = await extrairIndeterminados.aquecerModelo({ host, modelo, timeoutMs: 120000 });
  console.log(
    `[extrair-llm] aquecimento: ok=${aquecimento.ok} elapsed_ms=${aquecimento.elapsedMs}${
      aquecimento.erro ? ' erro=' + aquecimento.erro : ''
    }`
  );
  if (!aquecimento.ok) {
    console.error(
      `[extrair-llm] BLOQUEADO: "${modelo}" não respondeu ao aquecimento (${aquecimento.erro}). ` +
        'Parando — NÃO cai pro fallback silenciosamente (briefing: "se ele falhar ao carregar de novo, pare e reporte").'
    );
    process.exit(1);
  }

  const amostraN = opts.amostra ? parseInt(opts.amostra, 10) : null;
  const modoAmostra = Number.isFinite(amostraN) && amostraN > 0;
  const alvo = modoAmostra ? pendentes.slice(0, amostraN) : pendentes;
  // `--dry-run` força `aplicar=false` mesmo que `--aplicar` também tenha
  // sido passado (defesa em profundidade — a recusa de verdade é o modo
  // seco de lib/modo-seco.js dentro de store.js, mas aqui isso também evita
  // o log de "patches APLICADOS" confuso quando nada foi de fato gravado).
  const aplicar = opts.aplicar === true && !modoAmostra && opts['dry-run'] !== true;
  if (opts['dry-run'] === true) {
    console.log('[extrair-llm] --dry-run: extração roda (mede o que o LLM diria), mas nenhum patch é aplicado ao store.');
  }

  // Timeout maior que o default de config/perfil.json (60s) SÓ pra esta
  // extração em lote — achado real da Onda 2.1: sem `format: 'json'` (ver
  // lib/extrator-llm.js), gemma4:26b levou ~50s num item real, perto do
  // teto de 60s. Não altera o timeout global (usado por `julgar`), só o
  // perfil passado a este comando.
  //
  // Onda 2.2, achado real do diagnóstico das 99/117 falhas: `modelo_fallback`
  // DESLIGADO nesta extração em lote — evidência em
  // AppData/Local/Ollama/server-1.log (33 eventos de troca de modelo na
  // janela do lote falho): a GPU (RTX 5070 Ti, 16GB) não cabe gemma4:26b
  // (~17GB, já parcialmente offloadado pra RAM) E gemma3:4b (~3.3GB) ao
  // mesmo tempo — carregar o fallback despeja o principal da VRAM, e o
  // próximo item precisa recarregar o principal do zero (~20-56s extra,
  // medido). Isso em cadeia: cada falha do principal virava uma troca de
  // modelo completa, e a saída do fallback NUNCA é aplicada mesmo assim
  // (regra dura abaixo) — era custo puro, sem ganho. Uma falha de OOM real
  // ("unable to allocate CUDA_Host buffer", 22:37:06) confirma RAM do
  // sistema também no limite (2,3GB livres de 32GB medido depois). Com o
  // fallback desligado o modelo principal fica residente o lote inteiro —
  // reproduzido ao vivo: 12/12 chamadas reais OK, 29-103s cada, sem nenhuma
  // troca de modelo.
  const perfilExtracao = {
    ...perfil,
    ollama: { ...cfg, modelo_fallback: null, timeout_ms: Math.max(cfg.timeout_ms || 60000, 150000) }
  };

  let usoModeloPrincipal = 0;
  let usoFallback = 0;
  let falhas = 0;
  let comCampoNovo = 0;
  let titulacaoResolvida = 0;
  let vagasParaElegivelAgora = 0;

  for (const registro of alvo) {
    const t0 = Date.now();
    const { resultado, patchCampos } = await extrairIndeterminados.processarRegistro(registro, perfilExtracao);
    const elapsedMs = Date.now() - t0;

    const usouModeloPrincipal = resultado.status === 'ok' && resultado.modeloUsado === modelo;
    if (resultado.status === 'ok') {
      if (usouModeloPrincipal) usoModeloPrincipal++;
      else usoFallback++;
    } else {
      falhas++;
    }

    // Onda 2.2 — classificação por causa, sempre logada (antes só saía em
    // --amostra; foi por isso que o lote de 99 falhas não deixou rastro
    // classificável no log). Não muda comportamento, só observabilidade.
    if (resultado.status !== 'ok') {
      console.log(`  [falha] ${registro.id} elapsed_ms=${elapsedMs} motivo=${resultado.motivo || 'desconhecido'}`);
    }

    // Regra dura do briefing: NUNCA aplicar dado extraído pelo fallback
    // (gemma3:4b) em massa — só o modelo principal (gemma4:26b) autoriza
    // aplicar o patch. Item que caiu pro fallback fica como se tivesse
    // falhado (continua indeterminada, honesto) — não é descartado do
    // relatório, só não vira dado aplicado.
    const temCampoNovo = usouModeloPrincipal && Object.keys(patchCampos).length > 0;
    if (temCampoNovo) comCampoNovo++;
    if (temCampoNovo && patchCampos.titulacao_exigida) titulacaoResolvida++;

    if (modoAmostra) {
      console.log(`\n=== ${registro.id} — ${registro.orgao || '?'} ===`);
      console.log(`URL: ${registro.url}`);
      console.log(`extracao=${registro.extracao || 'null'} keywords_matched=${JSON.stringify(registro.keywords_matched || [])}`);
      console.log(`modelo: ${resultado.modeloUsado || 'falhou'} status=${resultado.status}${resultado.motivo ? ' motivo=' + resultado.motivo : ''}`);
      console.log('campos extraídos:', JSON.stringify(resultado.campos));
      console.log(
        `patch que SERIA aplicado (dry-run, --amostra nunca grava)${usouModeloPrincipal ? '' : ' [IGNORADO: caiu pro fallback, nunca aplicado em massa]'}:`,
        JSON.stringify(patchCampos)
      );
    }

    if (aplicar && temCampoNovo) {
      const camposLlmNovo = Array.from(new Set([...(registro.campos_llm || []), ...Object.keys(patchCampos)]));
      const areaFinal = 'area' in patchCampos ? patchCampos.area : registro.area;
      const titulacaoFinal = 'titulacao_exigida' in patchCampos ? patchCampos.titulacao_exigida : registro.titulacao_exigida;
      const inscricaoFimFinal = 'inscricao_fim' in patchCampos ? patchCampos.inscricao_fim : registro.inscricao_fim;

      const pesoArea = keywordFiltro.resolverPesoArea(areaFinal, keywordsConfig);
      const negativo = keywordFiltro.contemNegativo(registro.texto_bruto || '', negativosConfig.termos);
      const resultadoScore = score.calcular({
        pesoArea,
        titulacaoExigida: titulacaoFinal,
        perfil,
        uf: registro.uf,
        inscricaoFim: inscricaoFimFinal,
        negativo,
        area: areaFinal
      });

      if (resultadoScore.veredito === 'elegivel_agora' && registro.veredito !== 'elegivel_agora') vagasParaElegivelAgora++;

      store.atualizar(registro.id, {
        ...patchCampos,
        campos_llm: camposLlmNovo,
        score: resultadoScore.score,
        veredito: resultadoScore.veredito,
        area_compativel: resultadoScore.elegibilidade.area_compativel || null,
        julgado_em: new Date().toISOString()
      });
      console.log(`  ${registro.orgao || '?'} (${registro.id}) — indeterminada -> ${resultadoScore.veredito} (campos: ${Object.keys(patchCampos).join(', ')})`);
    }
  }

  console.log(
    `\n[extrair-llm] processados=${alvo.length} com_campo_novo=${comCampoNovo} titulacao_resolvida=${titulacaoResolvida} ` +
      `falhas=${falhas} modelo_principal=${usoModeloPrincipal} fallback=${usoFallback}`
  );
  if (usoFallback > 0) {
    console.log(
      `[extrair-llm] AVISO: ${usoFallback} item(ns) caíram pro modelo fallback (gemma3:4b) — ` +
        'esses itens NÃO tiveram patch aplicado (regra dura do briefing), continuam indeterminada.'
    );
  }
  if (aplicar) {
    console.log(`[extrair-llm] patches APLICADOS ao store. novos elegivel_agora: ${vagasParaElegivelAgora}`);
  } else if (modoAmostra) {
    console.log('[extrair-llm] modo AMOSTRA — nada foi gravado. Revise a saída acima contra texto_bruto antes de rodar sem --amostra e com --aplicar.');
  } else {
    console.log('[extrair-llm] modo dry-run (sem --aplicar) — nada foi gravado.');
  }
}

function carregarNotificacaoConfig() {
  const p = path.join(CONFIG_DIR, 'notificacao.json');
  if (!fs.existsSync(p)) return { score_minimo: 0 };
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

/**
 * Onda 2.1, item 3 do briefing — limiar de score (config/notificacao.json)
 * pra reduzir volume de mensagens no dia a dia (backlog já foi resolvido à
 * parte por `comandoAtivarNotificacoes`). Regra dura preservada: veredito
 * 'indeterminada' NUNCA é filtrado por score (ver README §Elegibilidade e
 * config/notificacao.json — titulação não identificada sempre notifica,
 * independente do número).
 *
 * **Correção de bug real desta onda**: antes, `--dry-run` (ou a ausência de
 * token/chat_id) só evitava a chamada de rede, mas ainda marcava
 * `notificado: true` no store de verdade — um "dry-run" que muta estado
 * persistente não é dry-run. Descoberto rodando este comando pra validar o
 * limiar novo (item acima) sem token real. Agora `dryRun` também pula
 * `store.atualizar` — nada é persistido numa rodada seca, ponto.
 */
async function comandoNotificar(opts) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const dryRun = opts['dry-run'] === true || !token || !chatId;
  const notificacaoConfig = carregarNotificacaoConfig();
  const scoreMinimo = typeof notificacaoConfig.score_minimo === 'number' ? notificacaoConfig.score_minimo : 0;
  const maxMensagens =
    typeof notificacaoConfig.max_mensagens_por_execucao === 'number' ? notificacaoConfig.max_mensagens_por_execucao : Infinity;

  const pendentes = store.listar(
    r => r.score !== null && r.veredito !== 'fora' && !r.notificado && (r.veredito === 'indeterminada' || r.score >= scoreMinimo)
  );
  const abaixoDoLimiar = store.listar(
    r => r.score !== null && r.veredito !== 'fora' && !r.notificado && r.veredito !== 'indeterminada' && r.score < scoreMinimo
  );

  // Cinto de segurança (correção urgente pós-Onda 2.1, item 3 — ver
  // lib/telegram.js `formatarAvisoLimite`): nunca dispara mais que
  // `max_mensagens_por_execucao` mensagens individuais de vaga numa execução
  // só, não importa o tamanho da fila. Acima do teto: as melhores por score
  // saem agora, o resto fica NÃO-notificado (rola pra próxima execução —
  // nunca marca como visto sem enviar, mesmo bug do --dry-run da Onda 2.1
  // por outro caminho) e uma ÚNICA mensagem extra avisa quanto ficou de fora.
  const excedeuLimite = pendentes.length > maxMensagens;
  const ordenadosPorScore = excedeuLimite ? [...pendentes].sort((a, b) => (b.score || 0) - (a.score || 0)) : pendentes;
  const aEnviar = excedeuLimite ? ordenadosPorScore.slice(0, maxMensagens) : ordenadosPorScore;
  const foraDoLimite = excedeuLimite ? ordenadosPorScore.slice(maxMensagens) : [];

  console.log(
    `[notificar] pendentes=${pendentes.length} (score_minimo=${scoreMinimo}, abaixo_do_limiar_silenciados=${abaixoDoLimiar.length}, max_mensagens=${maxMensagens})` +
      `${excedeuLimite ? ` EXCEDEU: enviando ${aEnviar.length} melhores por score, ${foraDoLimite.length} ficam para a próxima execução` : ''} modo=${dryRun ? 'dry-run' : 'telegram'}`
  );

  for (const registro of aEnviar) {
    const mensagem = telegram.formatarMensagem(registro);
    await telegram.enviar(mensagem, { token, chatId, dryRun });
    if (!dryRun) store.atualizar(registro.id, { notificado: true, notificado_em: new Date().toISOString() });
  }

  if (excedeuLimite) {
    const avisoMsg = telegram.formatarAvisoLimite({ enviados: aEnviar.length, restantes: foraDoLimite.length });
    await telegram.enviar(avisoMsg, { token, chatId, dryRun });
  }

  console.log(
    `[notificar] ${dryRun ? 'impressos (dry-run, nada persistido)' : 'enviados'}=${aEnviar.length}` +
      `${excedeuLimite ? ` (+ 1 aviso de limite; ${foraDoLimite.length} restantes ficam para a próxima execução)` : ''}`
  );
}

const BACKLOG_MARKER_PATH = path.join(__dirname, 'data', 'backlog-fechado.json');

/** Trilha canônica de um registro — registro antigo sem `trilha` (salvo antes
 * dessa Onda) é sempre 'docente', a única que existia então (ver lib/schema.js). */
function trilhaDoRegistro(registro) {
  return registro.trilha || 'docente';
}

/**
 * Trilha de uma FONTE (não de um registro) — consulta `fontes/index.js`, que
 * é quem declara `trilha` no módulo de cada fonte (fontes/gupy.js,
 * fontes/programathor.js; fontes/dou.js não declara e cai no default
 * 'docente', mesma regra de `trilhaDoRegistro` acima). Usada só pra decidir
 * QUAL VOCABULÁRIO de digest usar ao fechar uma fonte (ver
 * `montarDigestFechamento`) — "fonte decide o que fechar; trilha decide como
 * falar" (Onda pós-ProgramaThor, briefing desta Onda).
 */
function trilhaDaFonte(fonteId) {
  const fonte = listaFontes.find(f => f.id === fonteId);
  return (fonte && fonte.trilha) || 'docente';
}

/**
 * Lê `data/backlog-fechado.json` já migrado pro formato granular por FONTE
 * `{ [fonte]: { fechado_em, total_marcado } }` (Onda pós-ProgramaThor —
 * granularidade passou de por TRILHA pra por FONTE: uma fonte nova
 * [ProgramaThor] entrando dentro de uma trilha JÁ FECHADA [mercado, fechada
 * com a Gupy em 26/08] reabria exatamente o problema que o fechamento existe
 * pra evitar — 178 vagas novas no store, ~113 delas indistinguíveis de
 * "genuinamente nova" a ~10 mensagens/dia). Dois formatos antigos migrados
 * EM MEMÓRIA a cada leitura, nunca reescritos aqui só de ler (só quem fecha
 * uma fonte de verdade grava, `salvarMarcadoresBacklog`, preservando o
 * registro histórico intocado até haver uma escrita real):
 *   1. pré-histórico (fechamento de 13/08/2026, só a trilha docente
 *      existia) — objeto plano `{ fechado_em, total_marcado }` no nível
 *      raiz, sem chave nenhuma -> migra pra `{ dou: { fechado_em,
 *      total_marcado } }`;
 *   2. por TRILHA (produção entre 13/08 e esta Onda) — `{ docente: {...},
 *      mercado: {...} }` -> migra pra `{ dou: {...}, gupy: {...} }`. O
 *      mapeamento trilha->fonte é EXATO (não uma aproximação) porque, no
 *      instante em que cada trilha fechou, ela tinha exatamente UMA fonte:
 *      docente sempre foi só dou; mercado, quando fechou em 26/08, só tinha
 *      a Gupy coletando (ProgramaThor ainda não existia). `fechado_em`/
 *      `total_marcado` são preservados byte a byte — só a CHAVE muda.
 */
/** Migração pura (sem I/O) do(s) formato(s) antigo(s) pro formato granular
 * por fonte — extraída à parte pra ser testável sem tocar em arquivo real
 * (tests/*.test.js). */
function migrarMarcadoresBacklog(bruto) {
  if (!bruto) return {};
  if (typeof bruto.fechado_em === 'string' && !bruto.docente && !bruto.mercado && !bruto.dou && !bruto.gupy && !bruto.programathor) {
    return { dou: { fechado_em: bruto.fechado_em, total_marcado: bruto.total_marcado } };
  }
  if (bruto.docente || bruto.mercado) {
    const migrado = {};
    if (bruto.docente) migrado.dou = bruto.docente;
    if (bruto.mercado) migrado.gupy = bruto.mercado;
    return migrado;
  }
  return bruto;
}

function carregarMarcadoresBacklog(markerPath = BACKLOG_MARKER_PATH) {
  if (!fs.existsSync(markerPath)) return {};
  const bruto = JSON.parse(fs.readFileSync(markerPath, 'utf8'));
  return migrarMarcadoresBacklog(bruto);
}

function salvarMarcadoresBacklog(marcadores, markerPath = BACKLOG_MARKER_PATH) {
  fs.writeFileSync(markerPath, JSON.stringify(marcadores, null, 2), 'utf8');
}

/**
 * Monta o digest de UMA FONTE — o CONTEÚDO (quantas oportunidades, quantas
 * aderentes/elegíveis) é sempre da fonte que está fechando; o VOCABULÁRIO é
 * o da TRILHA dela (docente fala edital/elegível; mercado fala
 * vaga/aderente/empresa — "fonte decide o que fechar; trilha decide como
 * falar"). `dou` (docente) e `gupy` (primeira fonte de mercado, já fechada
 * em 26/08) usam os formatadores ORIGINAIS, INTOCADOS — mesmo filtro, mesmos
 * campos, texto idêntico ao que já está em produção; só a query de contagem
 * trocou de "toda a trilha mercado" pra "só esta fonte" (equivalente byte a
 * byte enquanto a Gupy foi a única fonte de mercado — deixa de inflar com
 * ProgramaThor se `gupy` for fechada de novo com `--forcar`). `programathor`
 * (segunda fonte de mercado, Onda pós-Gupy) usa um formatador próprio que
 * nomeia a fonte e o diferencial dela frente à Gupy (stack, tipo de
 * contrato, faixa salarial — dado estruturado que a Gupy não expõe).
 * `storePath` é override só pra teste (tests/*.test.js) — produção sempre
 * usa o default `store.STORE_PATH` (data/store.jsonl real).
 *
 * RAMO GENÉRICO DE FALLBACK (Onda 1, item 1a do briefing — conserto do bug
 * vivo em produção): `pci` e `weworkremotely` já estavam no store SEM um
 * `if` dedicado aqui, e o `throw` no fim da função (removido nesta Onda)
 * lançava assim que `comandoAtivarNotificacoes` (que itera TODAS as fontes
 * vistas no store, sem exceção) chegava numa delas — derrubando a etapa 3
 * do `rodar-diario.bat`, que nunca gravava `data/ultima-execucao.json`, o
 * que fazia o pipeline inteiro rerodar nos 3 horários agendados (08h, 13h,
 * 19h). Fonte nova NUNCA MAIS pode derrubar o pipeline por falta de ramo:
 * o fallback monta um digest legível só com o que toda fonte já garante —
 * `nome` (`fontes/index.js`, via `listaFontes`) e a trilha dela
 * (`trilhaDaFonte`, que já tem o mesmo default 'docente' usado aqui).
 * Vocabulário decidido pela TRILHA, igual às fontes com ramo dedicado:
 *   - trilha 'mercado' reaproveita `formatarDigestFechamentoFonteMercado`
 *     (já é genérica — recebe `fonteLabel`/`diferencial` como parâmetro,
 *     nunca hardcodeou "ProgramaThor" dentro de lib/telegram.js — só o
 *     `diferencial` do ramo `programathor` acima é que é texto específico
 *     daquela fonte; aqui o `diferencial` é um texto genérico, sem inventar
 *     um diferencial que ninguém verificou);
 *   - trilha 'docente' (default, cobre `pci`) monta a mensagem aqui mesmo
 *     — não existe formatador de "fonte nova docente" em lib/telegram.js
 *     (só o de fechamento ORIGINAL do DOU, com texto hardcoded de "Diário
 *     Oficial da União" que mentiria pra qualquer outra fonte) e este
 *     conserto NÃO pode tocar lib/telegram.js (fora do escopo desta Onda,
 *     ver briefing) — usa só primitivas já exportadas de lib/telegram.js
 *     (`escapeMarkdownV2`/`negrito`), mesmo esqueleto textual do digest do
 *     DOU (`formatarDigestFechamento`), sem as frases específicas do Diário.
 */
function montarDigestFechamento(fonteId, { scoreMinimo, storePath = store.STORE_PATH }) {
  const todosDaFonte = store.listar(r => r.fonte === fonteId, storePath);

  if (fonteId === 'dou') {
    const elegivelAgora = todosDaFonte.filter(r => r.veredito === 'elegivel_agora').length;
    return telegram.formatarDigestFechamento({ totalOportunidades: todosDaFonte.length, elegivelAgora, scoreMinimo });
  }
  if (fonteId === 'gupy') {
    const aderente = todosDaFonte.filter(r => r.veredito === 'aderente').length;
    return telegram.formatarDigestFechamentoMercado({ totalOportunidades: todosDaFonte.length, aderente, scoreMinimo });
  }
  if (fonteId === 'programathor') {
    const aderente = todosDaFonte.filter(r => r.veredito === 'aderente').length;
    return telegram.formatarDigestFechamentoFonteMercado({
      fonteLabel: 'ProgramaThor',
      diferencial:
        'Diferencial frente à Gupy: o ProgramaThor expõe stack de tecnologias, tipo de contrato (CLT/PJ/estágio) ' +
        'e faixa salarial quando a vaga divulga — dado estruturado que a Gupy não tem.',
      totalOportunidades: todosDaFonte.length,
      aderente,
      scoreMinimo
    });
  }

  const fonteModulo = listaFontes.find(f => f.id === fonteId);
  const fonteLabel = (fonteModulo && fonteModulo.nome) || fonteId;
  const trilha = trilhaDaFonte(fonteId);

  if (trilha === 'mercado') {
    const aderente = todosDaFonte.filter(r => r.veredito === 'aderente').length;
    return telegram.formatarDigestFechamentoFonteMercado({
      fonteLabel,
      diferencial: `Fonte nova na trilha de mercado — mesmo canal e formatação das demais fontes de vaga (Gupy/ProgramaThor), vocabulário de vaga, não de edital.`,
      totalOportunidades: todosDaFonte.length,
      aderente,
      scoreMinimo
    });
  }

  const elegivelAgora = todosDaFonte.filter(r => r.veredito === 'elegivel_agora').length;
  const linhas = [
    `🟢 ${telegram.negrito(`Radar Acadêmico — fonte nova ligada (${fonteLabel})`)}`,
    '',
    telegram.escapeMarkdownV2(
      `Uma fonte nova entrou no ar: ${fonteLabel}, na trilha docente (mesmo canal e formatação do concurso de professor — ` +
        `vocabulário de edital, não de vaga). No histórico coletado até agora são ${todosDaFonte.length} editais, ` +
        `${elegivelAgora} elegíveis agora.`
    ),
    '',
    telegram.escapeMarkdownV2(
      `A partir de agora você recebe só o que for NOVO — publicado depois de hoje, em dia útil de manhã ` +
        `(sem fim de semana/feriado), com score >= ${scoreMinimo} — itens com titulação não identificada ` +
        '("indeterminada") sempre notificam, independente do score, porque silenciar por falta de dado é pior ' +
        'que uma mensagem a mais.'
    )
  ];
  return linhas.join('\n');
}

/**
 * Onda 2.1, item 3 do briefing (granularizado por TRILHA na Onda pós-Gupy, e
 * por FONTE nesta Onda pós-ProgramaThor — "um canal silenciado é um radar
 * morto" vale por FONTE, não só por trilha: uma fonte nova [ProgramaThor]
 * entrando numa trilha JÁ FECHADA [mercado, fechada com a Gupy em 26/08]
 * reabria exatamente o mesmo problema que o fechamento existe pra evitar) —
 * resolve o backlog de UMA FONTE ANTES de deixá-la notificar no dia a dia:
 * marca todo item pendente daquela fonte como visto (`notificado: true`) sem
 * mandar uma mensagem por item, e dispara UMA mensagem de fechamento
 * específica da fonte (vocabulário da trilha dela, ver
 * `montarDigestFechamento`). Idempotente por fonte
 * (`data/backlog-fechado.json[fonte]` guarda quando rodou) — rodar de novo
 * sem `--forcar` só reimprime o que já aconteceu pra ESSA fonte, nunca
 * reenvia o digest nem remarca nada; outra fonte (da mesma trilha ou de
 * outra) ainda não fechada segue seu próprio caminho na mesma execução.
 *
 * `--dry-run` (ou ausência de token/chat_id) é PREVIEW puro — nada é
 * persistido: nem a marcação de `notificado`, nem o arquivo-marcador de
 * fechamento. Se o envio do digest falhar de verdade (rede/API), NADA é
 * marcado nem gravado — a regra do projeto é que nada vira "visto" sem ter
 * sido efetivamente enviado (mesmo princípio de `comandoNotificar`).
 *
 * `storePath`/`markerPath` são overrides só pra teste (tests/*.test.js) —
 * produção sempre usa os defaults (`store.STORE_PATH`/`BACKLOG_MARKER_PATH`,
 * os arquivos reais em `data/`); `comandoAtivarNotificacoes` nunca os passa.
 */
async function fecharBacklogDaFonte(
  fonteId,
  { dryRun, forcar, token, chatId, scoreMinimo, storePath = store.STORE_PATH, markerPath = BACKLOG_MARKER_PATH }
) {
  const marcadorExistente = carregarMarcadoresBacklog(markerPath)[fonteId];

  if (marcadorExistente && forcar !== true) {
    console.log(
      `[ativar-notificacoes] [${fonteId}] backlog já fechado em ${marcadorExistente.fechado_em} (${marcadorExistente.total_marcado} itens marcados). ` +
        'Use --forcar se quiser reenviar o digest de fechamento mesmo assim (não remarca nada de novo).'
    );
    return;
  }

  const pendentes = store.listar(
    r => r.fonte === fonteId && r.score !== null && r.veredito !== 'fora' && !r.notificado,
    storePath
  );

  console.log(
    `[ativar-notificacoes] [${fonteId}] ${dryRun ? '(dry-run — preview, nada será gravado) ' : ''}marcaria ${pendentes.length} itens como vistos (sem enviar uma mensagem por item)...`
  );

  const mensagem = montarDigestFechamento(fonteId, { scoreMinimo, storePath });

  let resultadoEnvio;
  try {
    resultadoEnvio = await telegram.enviar(mensagem, { token, chatId, dryRun });
  } catch (erro) {
    console.error(
      `[ativar-notificacoes] [${fonteId}] FALHA no envio do digest de fechamento — nada foi marcado como notificado, nem o marcador de fechamento foi gravado. ${erro.message}`
    );
    return;
  }

  if (!dryRun) {
    for (const registro of pendentes) {
      store.atualizar(registro.id, { notificado: true, notificado_em: new Date().toISOString() }, storePath);
    }
  }

  // Só grava/atualiza o marcador desta fonte na PRIMEIRA vez (preserva o
  // `fechado_em` original quando --forcar é usado pra reenviar o digest
  // depois — não é um "novo fechamento", é reenvio da mesma mensagem) — e
  // nunca em dry-run. Relê o arquivo na hora de gravar (não reusa
  // `marcadorExistente` capturado no início da função) porque outra fonte
  // pode ter sido fechada e gravada nesta MESMA execução, antes desta.
  if (!dryRun && !marcadorExistente) {
    const marcadores = carregarMarcadoresBacklog(markerPath);
    marcadores[fonteId] = { fechado_em: new Date().toISOString(), total_marcado: pendentes.length };
    salvarMarcadoresBacklog(marcadores, markerPath);
  }

  console.log(
    dryRun
      ? `[ativar-notificacoes] [${fonteId}] dry-run — nada foi gravado (nem marcação, nem marcador de fechamento). Digest impresso acima pra revisão; rode sem --dry-run (com TELEGRAM_BOT_TOKEN/CHAT_ID configurados) pra fechar de verdade.`
      : `[ativar-notificacoes] [${fonteId}] backlog fechado: ${pendentes.length} marcados como vistos, digest ENVIADO.`
  );
  return resultadoEnvio;
}

/**
 * Ponto de entrada do comando `ativar-notificacoes` — sem `--fonte`,
 * descobre TODAS as fontes já vistas no store (hoje: 'dou', 'gupy',
 * 'programathor') e fecha cada uma que ainda não tiver marcador (idempotente
 * por fonte, ver `fecharBacklogDaFonte`). Isso é o que faz `rodar-diario.bat`
 * continuar funcionando sem editar o .bat quando uma fonte nova aparece
 * (ex.: ProgramaThor entrando no ar) — o comando existente já cobre o caso
 * novo, sem precisar tocar no .bat nem no comando. `--fonte=X` restringe a
 * execução a uma fonte só (usado pra fechar/testar uma fonte específica sem
 * mexer nas outras).
 */
async function comandoAtivarNotificacoes(opts) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const dryRun = opts['dry-run'] === true || !token || !chatId;
  const forcar = opts.forcar === true;
  const scoreMinimo = carregarNotificacaoConfig().score_minimo ?? 0;

  const fontesNoStore = [...new Set(store.carregarTudo().map(r => r.fonte))].sort();
  const fontesAlvo = typeof opts.fonte === 'string' ? [opts.fonte] : fontesNoStore;

  for (const fonteId of fontesAlvo) {
    await fecharBacklogDaFonte(fonteId, { dryRun, forcar, token, chatId, scoreMinimo });
  }
}

/**
 * Espelha o store inteiro na aba `dados` da planilha Google Sheets
 * (lib/sheets.js) — PUSH unidirecional, nunca lê de volta (ver cabeçalho de
 * lib/sheets.js). Sem credencial no `.env` (GOOGLE_SHEETS_SPREADSHEET_ID +
 * GOOGLE_SHEETS_CLIENT_EMAIL + GOOGLE_SHEETS_PRIVATE_KEY) — ou com
 * `--dry-run` explícito — cai em dry-run e imprime o que enviaria, mesmo
 * comportamento que `notificar`/`ativar-notificacoes` já têm sem token do
 * Telegram. Erro de rede/auth/API NUNCA propaga pro chamador (não usa
 * `throw`) — loga e retorna normalmente, pra `node radar.js
 * sincronizar-sheets` nunca derrubar a execução diária (rodar-diario.bat
 * roda isto por ÚLTIMO, depois de coletar/julgar/notificar já terem
 * concluído) nem mascarar se a coleta/notificação em si deu certo.
 */
async function comandoSincronizarSheets(opts) {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY;
  const dryRun = opts['dry-run'] === true;

  const registros = store.listar();
  console.log(
    `[sincronizar-sheets] ${registros.length} registro(s) no store. modo=${
      dryRun || !spreadsheetId || !clientEmail || !privateKey ? 'dry-run' : 'sheets'
    }`
  );

  try {
    const resultado = await sheets.enviar(registros, { spreadsheetId, clientEmail, privateKey, dryRun });
    console.log(
      resultado.dryRun
        ? `[sincronizar-sheets] dry-run — nada foi gravado na planilha. Preview impresso acima.`
        : `[sincronizar-sheets] aba "${sheets.ABA_DADOS}" sobrescrita com ${resultado.linhas} linha(s).`
    );
  } catch (erro) {
    console.error(`[sincronizar-sheets] FALHOU: ${erro.message}`);
    console.error('[sincronizar-sheets] a execução diária (coletar/julgar/notificar) NÃO é afetada por esta falha.');
  }
}

function comandoStatus() {
  const todos = store.listar();
  const pendJulgamento = todos.filter(r => r.score === null || r.score === undefined);
  const pendNotificacao = todos.filter(r => r.score !== null && r.veredito !== 'fora' && !r.notificado);
  const ultimaColeta = todos.reduce((max, r) => (!max || r.coletado_em > max ? r.coletado_em : max), null);
  const porVeredito = todos.reduce((acc, r) => {
    const v = r.veredito || 'sem_score';
    acc[v] = (acc[v] || 0) + 1;
    return acc;
  }, {});

  console.log('=== status radar ===');
  console.log(`store: ${store.STORE_PATH}`);
  console.log(`total no store: ${todos.length}`);
  console.log(`última coleta: ${ultimaColeta || 'nunca'}`);
  console.log(`pendentes de julgamento: ${pendJulgamento.length}`);
  console.log(`pendentes de notificação: ${pendNotificacao.length}`);
  console.log('por veredito:', porVeredito);

  console.log('\n=== saúde da última coleta ===');
  for (const fonte of listaFontes) {
    const ultimo = saude.ultimoRegistro(fonte.id);
    if (!ultimo) {
      console.log(`${fonte.id}: nunca coletado — sem registro de saúde`);
      continue;
    }
    const marcador = ultimo.nivel === 'ok' ? 'OK' : ultimo.nivel === 'atencao' ? 'ATENÇÃO' : 'CRÍTICO';
    console.log(
      `${fonte.id}: [${marcador}] volume_bruto=${ultimo.volumeBruto} data_alvo=${ultimo.dataAlvo} em=${ultimo.registrado_em}${
        ultimo.motivo ? ' — ' + ultimo.motivo : ''
      }`
    );
  }
}

function comandoTestar() {
  const testsDir = path.join(__dirname, 'tests');
  const arquivos = fs
    .readdirSync(testsDir)
    .filter(f => f.endsWith('.test.js'))
    .sort();

  let falhou = false;
  for (const arquivo of arquivos) {
    console.log(`\n━━━ ${arquivo} ━━━`);
    const resultado = spawnSync(process.execPath, [path.join(testsDir, arquivo)], { stdio: 'inherit' });
    if (resultado.status !== 0) falhou = true;
  }
  process.exit(falhou ? 1 : 0);
}

/**
 * Flags reconhecidas POR COMANDO (item 3 do briefing — "bandeira desconhecida
 * não é ignorada"). `help`/`h` são aceitas implicitamente por TODO comando
 * (ver `main()`) e por isso não entram nestas listas. Comando ausente daqui
 * nunca é despachado — cai no `else` de `main()` como comando desconhecido.
 */
const FLAGS_VALIDAS = {
  coletar: ['data', 'dry-run'],
  backfill: ['de', 'ate', 'throttle-ms', 'alertar', 'dry-run'],
  'relatorio-backfill': ['de', 'ate'],
  reprocessar: ['dry-run'],
  'relatorio-jb': [],
  julgar: ['ollama', 'dry-run'],
  'extrair-llm': ['amostra', 'aplicar', 'dry-run'],
  notificar: ['dry-run'],
  'ativar-notificacoes': ['dry-run', 'forcar', 'fonte'],
  'sincronizar-sheets': ['dry-run'],
  status: [],
  testar: []
};

/** Texto de uso POR COMANDO — mesma string serve para `--help` de um
 * comando específico e para a listagem geral (comando ausente/desconhecido
 * ou `node radar.js --help`). */
const USOS = {
  coletar: 'coletar [--data DD-MM-AAAA] [--dry-run]',
  backfill: 'backfill --de DD-MM-AAAA --ate DD-MM-AAAA [--throttle-ms N] [--alertar] [--dry-run]',
  'relatorio-backfill': 'relatorio-backfill --de DD-MM-AAAA --ate DD-MM-AAAA',
  reprocessar: 'reprocessar [--dry-run]',
  'relatorio-jb': 'relatorio-jb',
  julgar: 'julgar [--ollama off] [--dry-run]',
  'extrair-llm': 'extrair-llm [--amostra N | --aplicar] [--dry-run]',
  notificar: 'notificar [--dry-run]  (respeita score_minimo e o teto max_mensagens_por_execucao de config/notificacao.json)',
  'ativar-notificacoes':
    'ativar-notificacoes [--dry-run] [--forcar] [--fonte dou|gupy|programathor]  (fecha o backlog + digest, POR FONTE — sem --fonte fecha todas as pendentes; ver README §Ligando a automação)',
  'sincronizar-sheets': 'sincronizar-sheets [--dry-run]  (espelha o store na aba "dados" do Google Sheets — ver README §Google Sheets)',
  status: 'status',
  testar: 'testar'
};

function imprimirUsoGeral() {
  console.log(
    'Uso: node radar.js <comando> [flags]  (ou --help / -h em qualquer nível: geral, ou "node radar.js <comando> --help")'
  );
  console.log('Comandos: ' + Object.keys(USOS).join('|'));
  for (const linha of Object.values(USOS)) {
    console.log('  ' + linha);
  }
}

async function main() {
  // `-h` é alias de `--help`, normalizado ANTES do parse (item 2 do
  // briefing) — sem isso `-h` (dash simples) não bate `startsWith('--')` em
  // `parseArgs` e passaria despercebido para o comando real, o mesmo modo de
  // falha do incidente original só que com um nome de flag diferente.
  const argvNormalizado = process.argv.slice(2).map(a => (a === '-h' ? '--help' : a));
  const { comando, opts } = parseArgs(argvNormalizado);

  // Sem comando, ou `--help`/`-h` no lugar do comando: uso geral.
  // `--help` sem comando sai 0 (pedido explícito de ajuda); ausência de
  // comando é uso incorreto e sai 1 (comportamento preexistente preservado).
  if (!comando || comando === '--help') {
    imprimirUsoGeral();
    process.exit(comando ? 0 : 1);
  }

  if (!Object.prototype.hasOwnProperty.call(FLAGS_VALIDAS, comando)) {
    console.error(`[radar] comando desconhecido: "${comando}"\n`);
    imprimirUsoGeral();
    process.exit(1);
  }

  // `--help`/`-h` NUM COMANDO CONHECIDO — item 2 do briefing, a correção
  // direta do incidente ("node radar.js coletar --help" caindo no comando
  // real): imprime o uso deste comando e sai ANTES de qualquer rede/escrita.
  // Isto tem que vir ANTES da checagem de flags desconhecidas abaixo, senão
  // "coletar --help --foo" recusaria por "--foo" em vez de simplesmente
  // mostrar a ajuda pedida.
  if (opts.help === true) {
    console.log('Uso: node radar.js ' + USOS[comando]);
    process.exit(0);
  }

  // Bandeira desconhecida (item 3 do briefing) — recusa com a lista de
  // flags válidas, nunca roda em modo perigoso por causa de um typo
  // (`--dry-runn`, `--forcarr`, etc.). Checado ANTES de qualquer dispatch —
  // nenhuma rede, nenhuma escrita acontece se isto disparar.
  const flagsValidasDoComando = new Set([...FLAGS_VALIDAS[comando], 'help']);
  const flagsDesconhecidas = Object.keys(opts).filter(k => !flagsValidasDoComando.has(k));
  if (flagsDesconhecidas.length) {
    console.error(
      `[radar] flag(s) desconhecida(s) para "${comando}": ${flagsDesconhecidas.map(f => '--' + f).join(', ')}`
    );
    console.error(`[radar] flags válidas: ${[...flagsValidasDoComando].map(f => '--' + f).join(', ')}`);
    console.error('Uso: node radar.js ' + USOS[comando]);
    process.exit(2);
  }

  // Modo seco (lib/modo-seco.js) — ativado UMA vez aqui, para o processo
  // inteiro, quando `--dry-run` é reconhecido. A partir daqui qualquer
  // escrita física em store.js/saude.js/backfill-progresso.js/sheets.js/
  // telegram.js é recusada na própria camada de escrita, não importa qual
  // comando (presente ou futuro) tente escrever — ver lib/modo-seco.js.
  if (opts['dry-run'] === true) {
    modoSeco.ativar();
    console.log(
      '[radar] --dry-run: modo seco ativo para esta execução — nenhuma escrita em data/store.jsonl, data/saude.jsonl, ' +
        'data/backlog-fechado.json, data/backfill-progresso.json, na planilha ou no Telegram vai acontecer.'
    );
  }

  switch (comando) {
    case 'coletar':
      await comandoColetar(opts);
      break;
    case 'backfill':
      await comandoBackfill(opts);
      break;
    case 'relatorio-backfill':
      comandoRelatorioBackfill(opts);
      break;
    case 'reprocessar':
      comandoReprocessar(opts);
      break;
    case 'relatorio-jb':
      comandoRelatorioJB();
      break;
    case 'julgar':
      await comandoJulgar(opts);
      break;
    case 'extrair-llm':
      await comandoExtrairLLM(opts);
      break;
    case 'notificar':
      await comandoNotificar(opts);
      break;
    case 'ativar-notificacoes':
      await comandoAtivarNotificacoes(opts);
      break;
    case 'sincronizar-sheets':
      await comandoSincronizarSheets(opts);
      break;
    case 'status':
      comandoStatus();
      break;
    case 'testar':
      comandoTestar();
      break;
    /* istanbul ignore next -- inalcançável: `comando` já foi validado contra
     * FLAGS_VALIDAS acima; este ramo só existiria se as duas listas
     * divergissem (bug de manutenção, não de uso). */
    default:
      imprimirUsoGeral();
      process.exit(1);
  }
}

// `require.main === module` guarda a execução de `main()` (que lê
// `process.argv` e pode `process.exit(1)`) só quando radar.js roda como
// script de entrada (`node radar.js ...`) — nunca quando é `require()`-ado
// por um teste (tests/backlog-fechado-granular.test.js precisa importar
// `fecharBacklogDaTrilha`/`migrarMarcadoresBacklog` sem disparar a CLI).
if (require.main === module) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = {
  trilhaDoRegistro,
  trilhaDaFonte,
  migrarMarcadoresBacklog,
  carregarMarcadoresBacklog,
  salvarMarcadoresBacklog,
  montarDigestFechamento,
  fecharBacklogDaFonte,
  comandoAtivarNotificacoes,
  BACKLOG_MARKER_PATH,
  // Exportado para tests/coverage-pipeline-discrimina.test.js (briefing:
  // controle positivo da instrumentação de cobertura) rodar o pipeline REAL
  // de descarte (vaga-docente/vaga-mercado/subedital-extrator/score-mercado)
  // contra fontes fake, offline, sem passar pela CLI/rede.
  processarItensFonte,
  // Exportado para tests/coverage-comandocoletar-stub.test.js — roda
  // `comandoColetar` REAL (o caminho de produção inteiro, não uma reimplementação
  // à mão) com `fontesOverride` para capturar o stdout de verdade que ele
  // imprime, sem rede e sem depender de fontes/index.js.
  comandoColetar
};
