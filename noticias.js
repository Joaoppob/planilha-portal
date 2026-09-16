#!/usr/bin/env node
'use strict';

/**
 * RADAR DE NOTÍCIAS — entry point da trilha NOTÍCIA. Irmão de `radar.js`
 * (trilha vaga), nunca uma extensão dele.
 *
 * POR QUE PIPELINE SEPARADO (decisão de arquitetura de Durin, registrada
 * aqui porque é a primeira pergunta que qualquer um vai fazer ao ver dois
 * entry points): notícia não é vaga. O pipeline de vaga tem elegibilidade
 * por titulação e score de aderência de área; o de notícia tem cluster de
 * fato repetido e percentil por lote. Nenhuma das quatro peças se transfere.
 * `radar.js` fica byte-idêntico; `fontes/`, `lib/store.js` e
 * `data/store.jsonl` também.
 *
 * O PIPELINE, em ordem:
 *   1. coletar        — cada fonte busca seus feeds; a GUARDA DE FRESCOR
 *                       roda por URL e rejeita feed fossilizado
 *   2. identificar    — id estável (sha256 de link canônico + título) e
 *                       extração de âncoras
 *   3. rotear         — tabela `claude` por termo; validação aba/tabela
 *   4. clusterizar    — ±36h, âncoras, domínios diferentes, Jaccard
 *   5. ranquear       — percentil por (dia, aba) -> 0-60, + perfil 0-40
 *   6. gravar         — data/noticias.jsonl
 *
 * COMANDOS
 *   coletar [--dry-run] [--sem-reddit] [--fonte id[,id]] [--jaccard N]
 *   recalcular [--jaccard N] [--janela-horas N]   (offline, sobre o store)
 *   status
 *   clusters [--min-veiculos N] [--limite N] [--aba x]
 *   recorte <ultimos-3-dias|semana|top-mes> [--aba x] [--limite N]
 *
 * `recalcular` é a ferramenta de CALIBRAÇÃO: reclusteriza e repontua o que
 * já está no store, sem tocar na rede, para que o limiar de Jaccard possa
 * ser escolhido contra dado real em vez de opinião. É por isso que o store
 * guarda `ancoras`, `data_ms`, `dominio`, `aba` e `idioma` além dos 9 campos
 * que a planilha consome.
 */

const { listaFontes, ABAS, TABELAS_POR_ABA, resolverDuplicataEntreAbas } = require('./fontes-noticias');
const { extrairAncoras, normalizarTitulo } = require('./lib-noticias/ancoras');
const cluster = require('./lib-noticias/cluster');
const ranking = require('./lib-noticias/ranking');
const store = require('./lib-noticias/store-noticias');
const { carregarEnv } = require('./lib/env');
const modoSeco = require('./lib/modo-seco');
const sheets = require('./lib/sheets');

// ===========================================================================
// O CONTRATO DA ABA DE FATO — nome da aba e ordem das colunas
// ===========================================================================
//
// POR QUE ELE MORA AQUI, e não em `_norman/abas.js` ou `_norman/formulas.js`:
// pela mesma razão que `ABA_DADOS` e `COLUNAS` moram em `lib/sheets.js` e não
// no gerador do portal. Quem CRIA a aba e escreve nela é este arquivo; se o
// nome existisse em dois lugares, uma divergência faria o sync criar uma
// segunda aba vazia ao lado da de verdade, escrever nela, e deixar as
// fórmulas lendo a antiga — a planilha continuaria abrindo, congelada, sem
// erro nenhum. É o modo de falha silencioso que a nota de `_norman/abas.js`
// já documenta pra trilha vaga.
//
// A dependência aponta pro lado certo: `_norman/abas.js` e
// `_norman/formulas.js` IMPORTAM daqui. Este arquivo NUNCA importa de
// `_norman/` — o sync não pode morrer porque a camada de apresentação mudou.
//
// REGRA DE MANUTENÇÃO, igual à de `lib/sheets.js COLUNAS`: coluna nova entra
// SEMPRE NO FIM. As fórmulas de leitura referenciam por LETRA (derivada
// desta lista por `F.nfLetra`), e inserir no meio deslocaria todas as
// seguintes em silêncio. `_norman/construir.js` guarda a folga que separa a
// última coluna de dado da coluna do carimbo.
//
// ONDA 7 (plano `radar-crm-20-ondas.md`, correção C2) — `faixa` e `posicao`,
// acrescentadas NO FIM (bloco vai de A a K agora, era A a I). Contrato:
//
//   faixa    — '' | '3d' | '7d' | '30d'. Só um item que ENTROU no top 20
//              daquela janela, para o seu par (aba, tabela), recebe valor.
//              Item que não entrou em NENHUMA das três fica ''. Calculado
//              por `ranking.calcularFaixasNoticia` (lib-noticias/ranking.js)
//              — cascata: 7d exclui cluster_id já em 3d, 30d exclui
//              cluster_id já em 3d OU 7d; dentro de cada janela, um mesmo
//              cluster_id ocupa UMA linha (a de maior score).
//   posicao  — 1..20, a ordem DENTRO da tabela (score desc, data_ms desc
//              como desempate). '' quando `faixa` é ''.
//
// A EXCLUSÃO SAI DA FÓRMULA: a planilha passa a filtrar `faixa="3d"` (ou
// "7d"/"30d") — uma comparação de igualdade — e recebe no máximo 20 linhas
// já ranqueadas e já sem repetição, em vez de precisar de `COUNTIF`/`MATCH`
// de cada tabela contra as anteriores dentro do Sheets.
const ABA_FATO = 'notícias (não edite)';
const FATO_CABECALHO = [
  'titulo', 'veiculo', 'link', 'quando', 'aba', 'tabela', 'n_veiculos', 'score', 'cluster_id',
  'faixa', 'posicao'
];

// ---------------------------------------------------------------- utilitários

function parseArgs(argv) {
  const comando = argv[0] || 'ajuda';
  const opts = {};
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const chave = a.slice(2);
      const prox = argv[i + 1];
      if (prox && !prox.startsWith('--')) {
        opts[chave] = prox;
        i++;
      } else {
        opts[chave] = true;
      }
    } else if (!opts._) {
      opts._ = a;
    }
  }
  return { comando, opts };
}

function pct(n, total) {
  return total ? ((n / total) * 100).toFixed(1) + '%' : '—';
}

function truncar(s, n) {
  const t = String(s == null ? '' : s);
  return t.length <= n ? t : t.slice(0, n - 1) + '…';
}

// ------------------------------------------------------- etapas do pipeline

/**
 * Identidade + âncoras. Separado da coleta de propósito: é função pura sobre
 * o item bruto, testável sem rede, e é onde o `id` (a chave de tudo) nasce.
 */
function identificar(itens) {
  return itens.map(item => {
    const link = item.linkCanonico || item.link;
    const { ancoras, capsQuebrada, regime } = extrairAncoras(item.titulo);
    return {
      ...item,
      link,
      id: store.gerarIdNoticia({ link, titulo: item.titulo }),
      ancoras,
      ancoras_regime: regime,
      caps_quebrada: capsQuebrada
    };
  });
}

/**
 * Dedupe GLOBAL por id — o mesmo artigo chegando por duas fontes. Distinto
 * do dedupe intra-feed (`rss.dedupeIntraFeed`), que resolve sujeira DENTRO
 * de um feed. Os dois são necessários: o primeiro não vê entre fontes, o
 * segundo roda tarde demais para evitar o custo de parse.
 *
 * ONDA 10a (RELATORIO-ONDA-11.md §2) — depois do dedupe por (id, aba) —
 * mantém o primeiro registrado DENTRO da mesma aba, sem POLÍTICA nenhuma
 * por trás, só ordem de chegada —, roda `resolverDuplicataEntreAbas`
 * (`fontes-noticias/dedup-entre-abas.js`, escrito e testado na Onda 11):
 * resolve o caso em que o MESMO link+título chega roteado para DUAS abas
 * diferentes, por precedência NOMEADA (`ciencia > ia > trabalho > geral`),
 * nunca pela ordem de `listaFontes`. Antes desta fiação, esse caso não se
 * manifestava porque as URLs das ~25 fontes originais não se cruzavam; as
 * 43 fontes novas da Onda 11 tornam a colisão possível de verdade.
 *
 * A CHAVE DO PRIMEIRO PASSE É `(id, aba)`, NÃO SÓ `id` — achado durante a
 * fiação, não previsto no relatório da Onda 11: `id` (hash de link+título)
 * NÃO carrega a aba, então um Map por `id` puro colapsaria duas abas
 * diferentes pela ORDEM DE CHEGADA antes de `resolverDuplicataEntreAbas`
 * sequer ver a duplicata — a mesma classe de acidente de registro que esta
 * Onda existe pra fechar, só que um passo mais cedo. `(id, aba)` preserva
 * cada aba candidata até o resolvedor de precedência decidir.
 */
function deduparGlobal(itens) {
  const porIdEAba = new Map();
  let removidosMesmaAba = 0;
  for (const item of itens) {
    const chave = item.id + '\0' + (item.aba || '');
    if (porIdEAba.has(chave)) {
      removidosMesmaAba++;
      continue;
    }
    porIdEAba.set(chave, item);
  }

  const { itens: semDuplicataEntreAbas, removidos: removidosEntreAbas } =
    resolverDuplicataEntreAbas(Array.from(porIdEAba.values()));

  return { itens: semDuplicataEntreAbas, removidos: removidosMesmaAba + removidosEntreAbas };
}

/**
 * Roteamento de tabela + validação.
 *
 * (a) Um item da aba `ia` cujo título casa `termos_claude` vai para a tabela
 *     `claude`. É o substituto do feed da Anthropic, que não existe (404).
 *     A tabela é magra por construção e o briefing pediu para não inflá-la —
 *     por isso o roteamento é por termo específico, nunca por termo genérico
 *     de IA.
 * (b) Aba/tabela que a fonte declarou têm que existir em TABELAS_POR_ABA. Um
 *     typo numa fonte criaria uma tabela fantasma na planilha da Fase B, e
 *     ninguém descobriria olhando o código. Aqui isso vira erro imediato.
 */
function rotear(itens, cfg = ranking.carregarConfig()) {
  let paraClaude = 0;

  for (const item of itens) {
    if (item.aba === 'ia' && item.tabela !== 'reddit-hn') {
      const norm = normalizarTitulo(item.titulo);
      if (cfg.termosClaude.some(t => ranking.casaTermo(norm, t))) {
        item.tabela = 'claude';
        paraClaude++;
      }
    }

    const tabelasValidas = TABELAS_POR_ABA[item.aba];
    if (!tabelasValidas) {
      throw new Error(
        '[falha: roteamento | fonte "' +
          item.fonte +
          '" declarou aba desconhecida "' +
          item.aba +
          '" | abas válidas: ' +
          ABAS.join(', ') +
          ' | corrigir o campo `aba` na fonte]'
      );
    }
    if (!tabelasValidas.includes(item.tabela)) {
      throw new Error(
        '[falha: roteamento | fonte "' +
          item.fonte +
          '" declarou tabela "' +
          item.tabela +
          '" fora da aba "' +
          item.aba +
          '" | tabelas válidas: ' +
          tabelasValidas.join(', ') +
          ' | corrigir o campo `tabela` na fonte ou acrescentar a tabela em fontes-noticias/index.js]'
      );
    }
  }
  return { itens, paraClaude };
}

// ------------------------------------------------------------- relatórios

function imprimirPorAba(itens) {
  const mapa = new Map();
  for (const i of itens) {
    const chave = i.aba + ' / ' + i.tabela;
    mapa.set(chave, (mapa.get(chave) || 0) + 1);
  }
  console.log('\n-- itens por aba/tabela --');
  for (const [chave, n] of Array.from(mapa.entries()).sort()) {
    console.log('  ' + chave.padEnd(28) + String(n).padStart(5));
  }
  console.log('  ' + 'TOTAL'.padEnd(28) + String(itens.length).padStart(5));

  console.log('\n-- itens por fonte --');
  const porFonte = new Map();
  for (const i of itens) porFonte.set(i.fonte, (porFonte.get(i.fonte) || 0) + 1);
  for (const [f, n] of Array.from(porFonte.entries()).sort((a, b) => b[1] - a[1])) {
    console.log('  ' + String(f).padEnd(28) + String(n).padStart(5));
  }
}

function imprimirClusters(resultado, { minVeiculos = 2, limite = 10 } = {}) {
  const multi = resultado.clusters.filter(c => c.n_veiculos >= minVeiculos).sort((a, b) => b.n_veiculos - a.n_veiculos);

  console.log('\n-- clusters --');
  console.log('  total de clusters:      ' + resultado.clusters.length);
  console.log('  com >1 veiculo:         ' + resultado.clusters.filter(c => c.n_veiculos > 1).length);
  console.log('  com >1 item (qualquer): ' + resultado.clusters.filter(c => c.n_itens > 1).length);
  console.log('  fusoes intra-dominio:   ' + resultado.fusoesIntraDominio);

  console.log('\n-- clusters com ' + minVeiculos + '+ veiculos (ate ' + limite + ') --');
  if (!multi.length) {
    console.log('  NENHUM. Isso e um resultado, nao um erro de formatacao — ver relatorio.');
  }
  for (const c of multi.slice(0, limite)) {
    console.log(
      '\n  [' +
        c.cluster_id +
        '] aba=' +
        c.aba +
        ' idioma=' +
        c.idioma +
        ' n_veiculos=' +
        c.n_veiculos +
        ' n_itens=' +
        c.n_itens
    );
    console.log('    dominios: ' + c.dominios.join(', '));
    for (const t of c.titulos) console.log('      · ' + truncar(t, 130));
  }
}

function imprimirHistograma(distribuicao) {
  const h = cluster.histogramaJaccard(distribuicao);
  console.log('\n-- distribuicao de Jaccard (pares candidatos: mesma aba+idioma, dentro da janela, >=1 ancora comum) --');
  for (const tipo of ['inter', 'intra']) {
    const total = h.totais[tipo];
    console.log('\n  ' + tipo.toUpperCase() + '-dominio — ' + total + ' pares');
    if (!total) {
      console.log('    (nenhum par)');
      continue;
    }
    for (const faixa of h[tipo]) {
      const barra = '#'.repeat(Math.max(1, Math.round(faixa.fracao * 50)));
      console.log(
        '    [' +
          faixa.de.toFixed(2) +
          '-' +
          faixa.ate.toFixed(2) +
          ') ' +
          String(faixa.n).padStart(6) +
          '  ' +
          pct(faixa.n, total).padStart(7) +
          '  ' +
          barra
      );
    }
  }
  return h;
}

function imprimirFrescor(diagnosticos) {
  console.log('\n-- guarda de frescor --');
  let rejeitados = 0;
  for (const d of diagnosticos) {
    for (const f of d.feeds || []) {
      if (f.erro) {
        console.log('  ERRO      ' + d.fonte + ' — ' + f.url + ' — ' + f.erro);
        continue;
      }
      const fr = f.frescor;
      if (!fr) continue;
      if (!fr.aprovado) {
        rejeitados++;
        console.log(
          '  REJEITADA ' +
            d.fonte +
            ' — ' +
            f.url +
            ' — motivo=' +
            fr.motivo +
            ' itens=' +
            fr.total +
            ' mais_recente=' +
            (fr.maisRecenteISO || 'n/a') +
            ' idade_dias=' +
            (fr.idadeDias == null ? 'n/a' : fr.idadeDias) +
            ' limiar=' +
            fr.maxIdadeDias
        );
      }
    }
    if (d.rejeitada) {
      rejeitados++;
      console.log('  REJEITADA ' + d.fonte + ' (fonte inteira) — motivo=' + d.rejeitada.motivo);
    }
    if (d.erroFatal) {
      console.log('  ERRO FATAL ' + d.fonte + ' — ' + d.erroFatal);
    }
  }
  if (!rejeitados) console.log('  nenhuma fonte rejeitada nesta rodada');
  return rejeitados;
}

// -------------------------------------------------------------- comandos

async function comandoColetar(opts) {
  const agora = Date.now();
  const somenteFontes = opts.fonte ? String(opts.fonte).split(',').map(s => s.trim()) : null;

  let fontes = listaFontes;
  if (somenteFontes) fontes = fontes.filter(f => somenteFontes.includes(f.id));
  if (opts['sem-reddit']) fontes = fontes.filter(f => f.id !== 'reddit');

  console.log('=== radar de noticias — coleta ===');
  console.log('fontes: ' + fontes.map(f => f.id).join(', '));
  console.log('inicio: ' + new Date(agora).toISOString());

  const diagnosticos = [];
  let brutos = [];

  for (const fonte of fontes) {
    const t0 = Date.now();
    try {
      const { itens, diagnostico } = await fonte.coletar({ agora });
      diagnosticos.push(diagnostico);
      brutos = brutos.concat(itens);
      console.log('[' + fonte.id + '] ' + itens.length + ' itens em ' + ((Date.now() - t0) / 1000).toFixed(1) + 's');
    } catch (err) {
      // Uma fonte quebrada não derruba a coleta inteira — mas o erro
      // aparece, com o formato de falha padrão deste projeto.
      diagnosticos.push({ fonte: fonte.id, feeds: [], erroFatal: err.message });
      console.error(
        '[falha: coletar ' +
          fonte.id +
          ' | ' +
          err.message +
          ' | fonte pulada nesta rodada | reinspecionar as URLs da fonte]'
      );
    }
  }

  const identificados = identificar(brutos);
  const { itens: unicos, removidos: removidosGlobal } = deduparGlobal(identificados);
  const { itens: roteados, paraClaude } = rotear(unicos);

  const limiarJaccard = opts.jaccard != null && opts.jaccard !== true ? Number(opts.jaccard) : undefined;
  const resultado = cluster.clusterizar(roteados, { limiarJaccard });
  ranking.calcularScores(roteados, resultado.porItem);

  console.log('\n-- coleta --');
  console.log('  itens brutos (pos-frescor/filtro): ' + brutos.length);
  console.log('  removidos no dedupe global (id):   ' + removidosGlobal);
  console.log('  roteados para a tabela `claude`:   ' + paraClaude);
  console.log('  itens finais:                      ' + roteados.length);

  const rejeitados = imprimirFrescor(diagnosticos);
  imprimirPorAba(roteados);
  imprimirClusters(resultado, { minVeiculos: 2, limite: Number(opts['limite-clusters'] || 10) });
  imprimirHistograma(resultado.distribuicaoJaccard);

  console.log('\n-- parametros usados --');
  console.log('  ' + JSON.stringify(resultado.parametros));

  if (resultado.ancorasCortadas.length) {
    console.log('\n-- ancoras cortadas por frequencia documental (top por grupo) --');
    for (const g of resultado.ancorasCortadas) {
      console.log(
        '  ' +
          g.grupo +
          ' (' +
          g.total +
          ' cortadas): ' +
          g.cortadas.slice(0, 12).map(c => c.ancora + '=' + c.fracao).join(' ')
      );
    }
  }

  console.log('\n-- top 15 por score --');
  for (const item of roteados.slice().sort((a, b) => b.score - a.score).slice(0, 15)) {
    console.log(
      '  ' +
        String(item.score).padStart(3) +
        ' (rep ' +
        String(item.repercussao).padStart(2) +
        ' + perf ' +
        String(item.perfil_bump).padStart(2) +
        ') n_veic=' +
        item.n_veiculos +
        ' [' +
        item.aba +
        '/' +
        item.tabela +
        '] ' +
        truncar(item.titulo, 90)
    );
  }

  if (opts['dry-run']) {
    console.log('\n[dry-run] nada gravado em ' + store.STORE_PATH);
    return { itens: roteados, resultado, rejeitados };
  }

  const gravacao = store.salvarLote(roteados);
  console.log('\n-- store --');
  console.log('  arquivo:     ' + store.STORE_PATH);
  console.log('  novos:       ' + gravacao.novos);
  console.log('  atualizados: ' + gravacao.atualizados);
  console.log('  total:       ' + gravacao.total);

  return { itens: roteados, resultado, rejeitados, gravacao };
}

/** Recluster + repontuação OFFLINE, sobre o store. Ferramenta de calibração do limiar. */
function comandoRecalcular(opts) {
  const registros = store.carregarTudo();
  if (!registros.length) {
    console.log('store vazio em ' + store.STORE_PATH + ' — rode `node noticias.js coletar` antes.');
    return;
  }
  // Âncoras REEXTRAÍDAS do título, não reaproveitadas do campo persistido.
  // `recalcular` é a ferramenta de calibração — se a extração de âncoras
  // mudar (Conserto de clustering 2026-08-27: tokenização de `6x1`, descarte
  // de dígito isolado), reusar `r.ancoras` do store deixaria o conserto
  // inerte sobre dado já coletado, porque o título (matéria-prima) já está
  // no store e não exige rede. `ancoras` no registro persistido vira só um
  // resíduo histórico de quando o item foi coletado.
  const itens = registros.map(r => ({
    id: r.id,
    titulo: r.titulo,
    dominio: r.dominio,
    dataMs: r.data_ms,
    aba: r.aba,
    idioma: r.idioma,
    ancoras: extrairAncoras(r.titulo).ancoras,
    pontos: r.pontos,
    comentarios: r.comentarios
  }));

  const limiarJaccard = opts.jaccard != null && opts.jaccard !== true ? Number(opts.jaccard) : undefined;
  const janelaHoras =
    opts['janela-horas'] != null && opts['janela-horas'] !== true ? Number(opts['janela-horas']) : undefined;
  const pisoIntersecao =
    opts['piso-intersecao'] != null && opts['piso-intersecao'] !== true ? Number(opts['piso-intersecao']) : undefined;

  const resultado = cluster.clusterizar(itens, { limiarJaccard, janelaHoras, pisoIntersecao });
  ranking.calcularScores(itens, resultado.porItem);

  console.log('=== recalculo offline sobre ' + registros.length + ' registros do store ===');
  console.log('  parametros: ' + JSON.stringify(resultado.parametros));
  imprimirClusters(resultado, { minVeiculos: 2, limite: Number(opts['limite-clusters'] || 10) });
  imprimirHistograma(resultado.distribuicaoJaccard);

  // `--dry-run` força "não grava" mesmo que `--gravar` também tenha sido
  // passado — mesma defesa em profundidade de `extrair-llm --dry-run` em
  // `radar.js` (RELATORIO-CERCA-SECA.md): sem isso, `--gravar --dry-run`
  // juntos escreveriam de verdade, porque só `--gravar` era checado. A
  // recusa real de escrita continua sendo este `if`, não `lib/modo-seco.js`
  // — o store desta trilha (`lib-noticias/store-noticias.js`) não checa o
  // modo seco, ver nota em `main()`.
  if (opts.gravar && opts['dry-run']) {
    console.log('\n  [dry-run] --gravar ignorado: nada gravado em ' + store.STORE_PATH);
  } else if (opts.gravar) {
    const g = store.salvarLote(itens);
    console.log('\n  gravado: ' + g.atualizados + ' atualizados, ' + g.novos + ' novos');
  } else {
    console.log('\n  (nada gravado — use --gravar para persistir o recalculo)');
  }
  return resultado;
}

function comandoStatus() {
  const registros = store.carregarTudo();
  console.log('=== status do radar de noticias ===');
  console.log('store: ' + store.STORE_PATH);
  console.log('registros: ' + registros.length);
  if (!registros.length) return;

  const porAba = new Map();
  for (const r of registros) {
    const k = r.aba + ' / ' + r.tabela;
    porAba.set(k, (porAba.get(k) || 0) + 1);
  }
  console.log('\n-- por aba/tabela --');
  for (const [k, n] of Array.from(porAba.entries()).sort()) console.log('  ' + k.padEnd(28) + String(n).padStart(6));

  const datas = registros.map(r => r.data_ms).filter(Number.isFinite);
  if (datas.length) {
    console.log('\n-- janela --');
    console.log('  mais antigo:  ' + new Date(Math.min(...datas)).toISOString());
    console.log('  mais recente: ' + new Date(Math.max(...datas)).toISOString());
  }

  console.log('\n-- recortes (derivados na leitura) --');
  for (const nome of Object.keys(ranking.RECORTES)) {
    console.log('  ' + nome.padEnd(16) + String(ranking.aplicarRecorte(registros, nome).length).padStart(6) + ' itens');
  }
}

function comandoClusters(opts) {
  const registros = store.carregarTudo();
  const minVeiculos = Number(opts['min-veiculos'] || 2);
  const limite = Number(opts.limite || 20);
  const porCluster = new Map();
  for (const r of registros) {
    if (opts.aba && r.aba !== opts.aba) continue;
    if (!r.cluster_id) continue;
    if (!porCluster.has(r.cluster_id)) porCluster.set(r.cluster_id, []);
    porCluster.get(r.cluster_id).push(r);
  }
  const lista = Array.from(porCluster.entries())
    .map(([id, membros]) => ({
      cluster_id: id,
      membros,
      n_veiculos: new Set(membros.map(m => m.dominio)).size
    }))
    .filter(c => c.n_veiculos >= minVeiculos)
    .sort((a, b) => b.n_veiculos - a.n_veiculos);

  console.log('=== clusters com ' + minVeiculos + '+ veiculos: ' + lista.length + ' ===');
  for (const c of lista.slice(0, limite)) {
    console.log('\n[' + c.cluster_id + '] n_veiculos=' + c.n_veiculos + ' aba=' + c.membros[0].aba);
    for (const m of c.membros) {
      console.log('  · [' + (m.veiculo || '?') + '] ' + truncar(m.titulo, 120));
      console.log('      ' + m.link);
    }
  }
}

function comandoRecorte(opts) {
  const nome = opts._ || 'hoje';
  const registros = store.carregarTudo().filter(r => !opts.aba || r.aba === opts.aba);
  const limite = opts.limite ? Number(opts.limite) : null;
  const lista = ranking.aplicarRecorte(registros, nome, { limite });
  console.log('=== recorte ' + nome + (opts.aba ? ' (aba ' + opts.aba + ')' : '') + ' — ' + lista.length + ' itens ===');
  for (const r of lista) {
    console.log(
      String(r.score).padStart(3) +
        '  ' +
        String(r.data || '').slice(0, 10) +
        '  [' +
        String(r.veiculo || '?').padEnd(22) +
        '] ' +
        truncar(r.titulo, 95)
    );
  }
}

// ===================================================================== sync
//
// O CAMINHO DO STORE PRA PLANILHA. Molde de `lib/sheets.js enviar()` — clear
// + escrita ancorada em A1 + carimbo por último —, com as diferenças que a
// trilha notícia exige, cada uma declarada abaixo. Nada de `lib/sheets.js`
// foi alterado: o que dá pra reusar é IMPORTADO (token, clear, escrita,
// referência A1, montagem do carimbo, célula do carimbo).

const SHEETS_API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
// America/Sao_Paulo, UTC-3 fixo. Mesma constante (e mesma razão) de
// `lib-noticias/ranking.js`: o Brasil não tem horário de verão desde 2019.
// Ela reaparece aqui em vez de ser importada porque `ranking.js` não a
// exporta e o pipeline fica byte-idêntico nesta Onda — é fato físico, não
// política, e as duas cópias dizem o mesmo número pelo mesmo motivo.
const FUSO_PLANILHA_MS = 3 * 3600000;
// 1899-12-30 é o dia zero do Sheets; 25569 é 1970-01-01 nessa escala.
const EPOCH_SHEETS = 25569;
// Folga de grade acima do que o store ocupa. A grade é redimensionada a cada
// sync pelo tamanho REAL do store, e não fixada em 5000, por um motivo de
// desempenho que é visível na tela: as fórmulas de leitura fazem `MAP` sobre
// intervalos ABERTOS (`$A$2:$A`), e `MAP` avalia célula vazia também. Numa
// grade de 5000 linhas isso são ~150 mil chamadas de LAMBDA por abertura da
// planilha, para 1.2 mil linhas de dado. A grade colada no dado é o que
// mantém a conta proporcional ao que existe.
const FOLGA_LINHAS = 200;
// Precisa alcançar a coluna do carimbo (`Y` = 25ª). 26 é o padrão do Sheets.
const COLUNAS_GRADE = 26;

const RETENTAVEIS = new Set([429, 500, 502, 503, 504]);
const TENTATIVAS = 6;
const dormir = ms => new Promise(r => setTimeout(r, ms));

/**
 * Chamada crua à API, com o MESMO backoff de `_norman/api.js` e pela mesma
 * razão: a cota do Sheets é de 60 escritas por minuto e por usuário, e é
 * compartilhada entre este sync, o sync de vaga e os dois geradores do
 * portal. Estourar não devolve erro no fim — devolve 429 no MEIO, deixando a
 * aba meio-escrita, que é o pior estado possível porque parece pronta.
 * Nunca reduz o que ia escrever pra caber: espera e repete.
 */
async function chamarApi(url, { method = 'GET', accessToken, body } = {}) {
  let espera = 2000;
  for (let tentativa = 1; ; tentativa++) {
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    if (res.ok) {
      const txt = await res.text();
      return txt ? JSON.parse(txt) : {};
    }
    if (RETENTAVEIS.has(res.status) && tentativa < TENTATIVAS) {
      const cabecalho = Number(res.headers.get('retry-after'));
      const ms = Number.isFinite(cabecalho) && cabecalho > 0 ? cabecalho * 1000 : espera;
      console.log(
        `  HTTP ${res.status} — esperando ${Math.round(ms / 1000)}s e repetindo (${tentativa}/${TENTATIVAS - 1})`
      );
      await dormir(ms);
      espera = Math.min(espera * 2, 60000);
      continue;
    }
    const txt = await res.text().catch(() => '');
    throw new Error(
      `[falha: sheets ${method} ${url.replace(/\/[^/]+\/values/, '/…/values')} | HTTP ${res.status} ${txt.slice(0, 600)} | ` +
        'planilha não compartilhada com a service account (Editor), GOOGLE_SHEETS_SPREADSHEET_ID errado, ou cota estourada | ' +
        'conferir .env e README §Google Sheets]'
    );
  }
}

/**
 * `data_ms` -> serial de data-hora do Sheets, no fuso da planilha.
 *
 * POR QUE NÚMERO E NÃO A STRING ISO QUE O STORE JÁ TEM. `data_publicacao` na
 * aba `dados` é texto ISO, e isso já custou um conserto documentado no painel
 * `Hoje`: `COUNTIFS(...;">="&texto)` tenta ler o critério como DATA antes de
 * comparar e, contra uma coluna de texto, devolve 0 EM SILÊNCIO (medido: 43
 * linhas reais, contagem zero). O bloco teve que virar `SUMPRODUCT`. Aqui a
 * camada de leitura precisa de `COUNTIFS`, `FILTER` por data e `SORT` por
 * data — três operações que só são honestas sobre número. Convertendo uma
 * vez, em Node, contra o dado inteiro, o problema deixa de existir em vez de
 * ser contornado três vezes em fórmula.
 *
 * Devolve `''` (não zero) quando não há data: zero é 30/12/1899 e apareceria
 * como uma notícia de 1899 no fim de toda lista. Ausência tem que ser
 * ausência.
 */
function serialDoSheets(dataMs) {
  if (!Number.isFinite(dataMs)) return '';
  return (dataMs - FUSO_PLANILHA_MS) / 86400000 + EPOCH_SHEETS;
}

/**
 * Registros do store -> matriz de linhas na ordem de `FATO_CABECALHO`.
 * Pura: sem rede, sem `.env`. Números saem como número (o `valueInputOption`
 * RAW só governa parsing de STRING; tipo explícito no JSON é preservado).
 *
 * `faixa`/`posicao` (Onda 7/C2) são lidos do registro, não recalculados
 * aqui — quem os calcula é `ranking.calcularFaixasNoticia`, chamado pelo
 * chamador ANTES desta função (ver `comandoSincronizarSheets`). Pura
 * significa "sem rede/`.env`", não "recalcula a cascata a cada linha" — a
 * cascata é por (aba, tabela) sobre o LOTE inteiro, não por registro
 * isolado, então rodar aqui dentro do `.map` estaria errado.
 */
function montarLinhasFato(registros) {
  return (registros || []).map(r => [
    r.titulo == null ? '' : String(r.titulo),
    r.veiculo == null ? '' : String(r.veiculo),
    r.link == null ? '' : String(r.link),
    serialDoSheets(r.data_ms),
    r.aba == null ? '' : String(r.aba),
    r.tabela == null ? '' : String(r.tabela),
    Number.isFinite(r.n_veiculos) ? r.n_veiculos : '',
    Number.isFinite(r.score) ? r.score : '',
    r.cluster_id == null ? '' : String(r.cluster_id),
    r.faixa == null ? '' : String(r.faixa),
    Number.isFinite(r.posicao) ? r.posicao : ''
  ]);
}

/**
 * Garante que a aba de fato exista E que a grade caiba no que vai ser
 * escrito. As duas coisas juntas, e ANTES da escrita, porque `values.update`
 * numa faixa maior que a grade não trunca: ERRA. Quem quebraria é o sync,
 * sozinho, na primeira vez que o store passasse do tamanho da grade.
 *
 * Idempotente: com a aba já do tamanho certo, não faz chamada nenhuma de
 * escrita. É a mesma doutrina de `garantirAbas()` — cria só o que falta,
 * nunca duplica, nunca apaga aba existente.
 */
async function garantirAbaFato({ spreadsheetId, accessToken, linhasNecessarias }) {
  const meta = await chamarApi(
    `${SHEETS_API_BASE}/${spreadsheetId}?fields=${encodeURIComponent('sheets.properties(sheetId,title,gridProperties)')}`,
    { accessToken }
  );
  const aba = (meta.sheets || []).map(s => s.properties).find(p => p.title === ABA_FATO);
  const alvoLinhas = linhasNecessarias + FOLGA_LINHAS;
  const acoes = [];

  if (!aba) {
    await chamarApi(`${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      accessToken,
      body: {
        requests: [{
          addSheet: {
            properties: { title: ABA_FATO, gridProperties: { rowCount: alvoLinhas, columnCount: COLUNAS_GRADE } }
          }
        }]
      }
    });
    return { acoes: [`criou "${ABA_FATO}" com ${alvoLinhas} linha(s)`] };
  }

  const g = aba.gridProperties || {};
  const propriedades = {};
  if (g.rowCount !== alvoLinhas) {
    propriedades.rowCount = alvoLinhas;
    acoes.push(`grade: ${g.rowCount} -> ${alvoLinhas} linha(s)`);
  }
  if ((g.columnCount || 0) < COLUNAS_GRADE) {
    propriedades.columnCount = COLUNAS_GRADE;
    acoes.push(`grade: ${g.columnCount} -> ${COLUNAS_GRADE} coluna(s)`);
  }
  if (!acoes.length) return { acoes: [] };

  await chamarApi(`${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    accessToken,
    body: {
      requests: [{
        updateSheetProperties: {
          properties: { sheetId: aba.sheetId, gridProperties: propriedades },
          fields: Object.keys(propriedades).map(k => `gridProperties.${k}`).join(',')
        }
      }]
    }
  });
  return { acoes };
}

/**
 * O sync. Sem credencial no `.env` — ou com `--dry-run` — imprime o que
 * enviaria e não toca a rede, exatamente como `lib/sheets.js enviar()`.
 *
 * DIFERENÇA DE POLÍTICA DE ERRO, declarada: `radar.js comandoSincronizarSheets`
 * ENGOLE a falha (loga e sai limpo) porque ele roda dentro do dia inteiro do
 * radar e não pode derrubar a coleta. Este aqui é comando de primeira classe
 * e ainda não está pendurado em `rodar-diario.bat` — ele LEVANTA a exceção,
 * que é o comportamento honesto pra quem chama na mão e olha o código de
 * saída. Quando a integração com os três horários acontecer, quem decide se
 * absorve ou não é o orquestrador, não este comando.
 */
async function comandoSincronizarSheets(opts = {}) {
  carregarEnv();
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
  const privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY;
  const dryRun = opts['dry-run'] === true;
  const semCredencial = !spreadsheetId || !clientEmail || !privateKey;

  const registros = store.carregarTudo();
  // Onda 7/10c — a cascata roda sobre o LOTE inteiro (todas as abas/tabelas
  // juntas; `calcularFaixasNoticia` agrupa internamente por par) e MUTA
  // `registros`, preenchendo `.faixa`/`.posicao` antes de `montarLinhasFato`
  // ler esses campos linha a linha.
  ranking.calcularFaixasNoticia(registros);
  const linhas = montarLinhasFato(registros);
  const valores = [FATO_CABECALHO, ...linhas];

  console.log('=== radar de noticias — sincronizar-sheets ===');
  console.log(`store:      ${store.STORE_PATH}`);
  console.log(`registros:  ${registros.length}`);
  console.log(`aba:        ${ABA_FATO}`);
  console.log(`modo:       ${dryRun || semCredencial ? 'dry-run' : 'sheets'}`);

  if (dryRun || semCredencial) {
    console.log(
      `\n[DRY-RUN sheets] enviaria ${linhas.length} linha(s)` +
        (spreadsheetId ? ` para a planilha ${spreadsheetId}` : ' (GOOGLE_SHEETS_SPREADSHEET_ID não configurado no .env)') +
        '\n'
    );
    console.log(FATO_CABECALHO.join(' | '));
    for (const linha of linhas.slice(0, 3)) console.log(linha.map(c => truncar(String(c), 40)).join(' | '));
    if (linhas.length > 3) console.log(`... (+${linhas.length - 3} linha(s))`);
    return { ok: true, dryRun: true, linhas: linhas.length };
  }

  const accessToken = await sheets.obterAccessToken({ clientEmail, privateKey });
  const grade = await garantirAbaFato({ spreadsheetId, accessToken, linhasNecessarias: valores.length });
  if (grade.acoes.length) console.log(`[sheets] ${grade.acoes.join(', ')}`);

  await sheets.limparAba({ spreadsheetId, aba: ABA_FATO, accessToken });
  await sheets.escreverValores({ spreadsheetId, aba: ABA_FATO, valores, accessToken });

  // CARIMBO POR ÚLTIMO — semântica, não conveniência (a mesma nota de
  // `lib/sheets.js`): ele afirma "os dados acima são deste momento". Se a
  // escrita dos dados falhar, a exceção sobe antes daqui, o carimbo antigo
  // permanece, a aba envelhece e o aviso 🛑 acende sozinho nas quatro vistas.
  // Um carimbo escrito antes dos dados certificaria uma atualização que não
  // aconteceu.
  //
  // Célula: a MESMA `CELULA_CARIMBO` da trilha vaga, importada de
  // `lib/sheets.js`. Aba diferente, coordenada igual — uma convenção só na
  // planilha inteira, e `_norman/construir.js` guarda a folga entre o bloco
  // de dado (que vai até a coluna I) e ela.
  const carimbo = sheets.montarCarimbo();
  await sheets.escreverValores({
    spreadsheetId, aba: ABA_FATO, valores: carimbo, accessToken, celula: sheets.CELULA_CARIMBO
  });
  console.log(`[sheets] ${linhas.length} linha(s) escrita(s) em "${ABA_FATO}"`);
  console.log(`[sheets] carimbo de sync gravado em ${ABA_FATO}!${sheets.CELULA_CARIMBO}: ${carimbo[0][0]}`);

  return { ok: true, dryRun: false, linhas: linhas.length, carimbo: carimbo[0][0] };
}

/**
 * Flags reconhecidas POR COMANDO — mesmo desenho de `radar.js` (RELATORIO-
 * CERCA-SECA.md), estendido a `noticias.js`: "node noticias.js coletar
 * --help" caindo no comando real é a MESMA classe de risco que já causou o
 * incidente original em `radar.js`, só que contra `data/noticias.jsonl` e
 * uma coleta de ~13 minutos batendo em 25+ fontes. `help`/`h` são aceitas
 * implicitamente por TODO comando (ver `main()`) e por isso não entram
 * nestas listas. `_` (o argumento posicional de `recorte`) também não entra
 * aqui — não é uma flag `--algo`, é tratado à parte na validação. Comando
 * ausente daqui nunca é despachado — cai no `else` de `main()` como comando
 * desconhecido.
 */
const FLAGS_VALIDAS = {
  coletar: ['dry-run', 'sem-reddit', 'fonte', 'jaccard', 'limite-clusters'],
  recalcular: ['jaccard', 'janela-horas', 'piso-intersecao', 'gravar', 'dry-run', 'limite-clusters'],
  status: [],
  clusters: ['min-veiculos', 'limite', 'aba'],
  recorte: ['aba', 'limite'],
  'sincronizar-sheets': ['dry-run']
};

/** Texto de uso POR COMANDO — mesma string serve para `--help` de um
 * comando específico e para a listagem geral (comando ausente/desconhecido
 * ou `node noticias.js --help`). */
const USOS = {
  coletar: 'coletar [--dry-run] [--sem-reddit] [--fonte id[,id]] [--jaccard N] [--limite-clusters N]',
  recalcular:
    'recalcular [--jaccard N] [--janela-horas N] [--piso-intersecao N] [--gravar] [--dry-run] [--limite-clusters N]   (offline, sobre o store; --dry-run força --gravar a não escrever)',
  status: 'status',
  clusters: 'clusters [--min-veiculos N] [--limite N] [--aba geral|ia|trabalho|ciencia]',
  recorte: 'recorte <ultimos-3-dias|semana|top-mes> [--aba x] [--limite N]',
  'sincronizar-sheets': `sincronizar-sheets [--dry-run]   (espelha o store na aba "${ABA_FATO}" da planilha-portal)`
};

function imprimirUsoGeral() {
  console.log(
    'Uso: node noticias.js <comando> [flags]  (ou --help / -h em qualquer nível: geral, ou "node noticias.js <comando> --help")'
  );
  console.log('Comandos: ' + Object.keys(USOS).join('|'));
  for (const linha of Object.values(USOS)) {
    console.log('  ' + linha);
  }
}

async function main() {
  // `-h` é alias de `--help`, normalizado ANTES do parse — mesmo mecanismo
  // de `radar.js main()`: sem isso `-h` (dash simples) não bate
  // `startsWith('--')` em `parseArgs` e passaria despercebido para o
  // comando real.
  const argvNormalizado = process.argv.slice(2).map(a => (a === '-h' ? '--help' : a));
  const { comando, opts } = parseArgs(argvNormalizado);

  // Sem comando, ou `--help`/`-h` no lugar do comando: uso geral. `--help`
  // sem comando sai 0 (pedido explícito de ajuda); ausência de comando é
  // uso incorreto e sai 1 (comportamento preexistente preservado — o
  // `default` antigo também saía 1). `parseArgs` teria assumido comando
  // 'ajuda' se `argvNormalizado` estivesse vazio; checar o array bruto em
  // vez do valor já-defaultado é o que permite distinguir os dois casos.
  if (!argvNormalizado.length || comando === '--help') {
    imprimirUsoGeral();
    process.exit(argvNormalizado.length ? 0 : 1);
  }

  if (!Object.prototype.hasOwnProperty.call(FLAGS_VALIDAS, comando)) {
    console.error(`[noticias] comando desconhecido: "${comando}"\n`);
    imprimirUsoGeral();
    process.exit(1);
  }

  // `--help`/`-h` NUM COMANDO CONHECIDO — a correção direta do risco que
  // motivou esta rodada: imprime o uso deste comando e sai ANTES de
  // qualquer rede/escrita. Isto tem que vir ANTES da checagem de flags
  // desconhecidas abaixo, senão "coletar --help --foo" recusaria por
  // "--foo" em vez de simplesmente mostrar a ajuda pedida.
  if (opts.help === true) {
    console.log('Uso: node noticias.js ' + USOS[comando]);
    process.exit(0);
  }

  // Bandeira desconhecida — recusa com a lista de flags válidas, nunca roda
  // em modo perigoso por causa de um typo (`--dry-runn`, `--gravarr`,
  // etc.). Checado ANTES de qualquer dispatch — nenhuma rede, nenhuma
  // escrita acontece se isto disparar. `_` é o argumento posicional de
  // `recorte` (ex.: `recorte semana`), não uma flag `--algo` — excluído da
  // checagem em vez de entrar em `FLAGS_VALIDAS` para não confundir os dois
  // conceitos na lista de flags válidas impressa abaixo.
  const flagsValidasDoComando = new Set([...FLAGS_VALIDAS[comando], 'help']);
  const flagsDesconhecidas = Object.keys(opts).filter(k => k !== '_' && !flagsValidasDoComando.has(k));
  if (flagsDesconhecidas.length) {
    console.error(
      `[noticias] flag(s) desconhecida(s) para "${comando}": ${flagsDesconhecidas.map(f => '--' + f).join(', ')}`
    );
    console.error(`[noticias] flags válidas: ${[...flagsValidasDoComando].map(f => '--' + f).join(', ')}`);
    console.error('Uso: node noticias.js ' + USOS[comando]);
    process.exit(2);
  }

  // Modo seco (lib/modo-seco.js) — ativado UMA vez aqui, para o processo
  // inteiro, quando `--dry-run` é reconhecido. Mesmo mecanismo de
  // `radar.js`: cobre de verdade o caminho de `sincronizar-sheets` (que usa
  // `lib/sheets.js`, já guardado por baixo desde a rodada anterior) — é
  // defesa em profundidade PARA ALÉM do `if (dryRun || semCredencial)` que
  // já existe em `comandoSincronizarSheets` antes de qualquer chamada de
  // rede. NÃO cobre `store.salvarLote` de `coletar`/`recalcular --gravar`:
  // esses passam por `lib-noticias/store-noticias.js`, fora da fronteira
  // desta rodada (ver RELATORIO-CERCA-SECA.md §Apêndice — a única cerca ali
  // continua sendo o `if (opts['dry-run']) return` antes da chamada, que já
  // era seco e segue sendo a defesa real desse caminho).
  if (opts['dry-run'] === true) {
    modoSeco.ativar();
    console.log(
      '[noticias] --dry-run: modo seco ativo para esta execução — nenhuma escrita na planilha vai acontecer ' +
        '(a escrita em data/noticias.jsonl já era controlada por este mesmo --dry-run antes desta rodada; ver ' +
        'RELATORIO-CERCA-SECA.md §Apêndice — noticias.js).'
    );
  }

  switch (comando) {
    case 'coletar':
      await comandoColetar(opts);
      break;
    case 'recalcular':
      comandoRecalcular(opts);
      break;
    case 'status':
      comandoStatus();
      break;
    case 'clusters':
      comandoClusters(opts);
      break;
    case 'recorte':
      comandoRecorte(opts);
      break;
    case 'sincronizar-sheets':
      await comandoSincronizarSheets(opts);
      break;
    /* istanbul ignore next -- inalcançável: `comando` já foi validado contra
     * FLAGS_VALIDAS acima; este ramo só existiria se as duas listas
     * divergissem (bug de manutenção, não de uso). */
    default:
      imprimirUsoGeral();
      process.exit(1);
  }
}

// Mesma guarda de `radar.js`: `main()` só roda como script de entrada, nunca
// quando um teste faz `require('../noticias')` para exercitar as funções
// puras (identificar/deduparGlobal/rotear) sem disparar a CLI.
if (require.main === module) {
  main().catch(err => {
    console.error(err && err.stack ? err.stack : err);
    process.exit(1);
  });
}

module.exports = {
  identificar, deduparGlobal, rotear, comandoColetar, comandoRecalcular,
  // O CONTRATO DA ABA DE FATO. `_norman/abas.js` lê `ABA_FATO` e
  // `_norman/formulas.js` lê `FATO_CABECALHO` — é o que torna impossível a
  // divergência entre quem escreve a aba e quem a lê. Ver o bloco de
  // comentário no topo.
  ABA_FATO, FATO_CABECALHO,
  // Puras, exportadas pra poderem ser exercitadas sem rede.
  serialDoSheets, montarLinhasFato,
  comandoSincronizarSheets,
  // `main` — exportado para tests/noticias-cli-flags-help-dry-run.test.js
  // poder provar, EM PROCESSO (sem spawnar subprocesso e sem conseguir
  // inspecionar estado interno de um filho depois que ele sai), que
  // `--dry-run` ativa de verdade `lib/modo-seco.js` (não só imprime uma
  // mensagem no console). A guarda `require.main === module` acima impede
  // que isto dispare sozinho quando o teste faz `require('../noticias')`.
  main
};
