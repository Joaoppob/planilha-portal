'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { normalizarChave } = require('../lib/hash');

/**
 * Store da trilha NOTÍCIA — JSON Lines em `data/noticias.jsonl`.
 *
 * SEPARADO de `lib/store.js` (trilha vaga) porque as três decisões centrais
 * daquele arquivo são erradas aqui, uma a uma:
 *
 *  1. `STORE_PATH` fixo em `data/store.jsonl` — notícia tem store próprio,
 *     por decisão de arquitetura de Durin.
 *  2. `chaveCanonicaDedupe` = `canonizar(orgao)|area|inscricao_inicio` —
 *     notícia não tem órgão, área nem inscrição. O dedupe grosso entre
 *     fontes que aquela chave resolve é, nesta trilha, o trabalho do
 *     CLUSTER, que não é dedupe: dois veículos noticiando o mesmo fato
 *     continuam sendo duas linhas (com o mesmo `cluster_id`), porque JB quer
 *     ver quem publicou.
 *  3. "nunca sobrescreve o registro já salvo" — aqui é o oposto. `score`,
 *     `percentil`, `cluster_id` e `n_veiculos` são DERIVADOS do lote; quando
 *     um segundo veículo publica sobre o mesmo fato amanhã, a notícia de
 *     hoje muda de cluster e de score. Congelar o valor antigo guardaria uma
 *     medida obsoleta com cara de medida atual. Por isso `salvarLote`
 *     ATUALIZA os campos derivados e PRESERVA os de origem
 *     (`visto_primeiro_em`), com a distinção explícita na lista abaixo.
 *
 * `id` segue o padrão de `lib/hash.js`: sha256 de uma chave normalizada,
 * truncado. A chave é o LINK CANÔNICO + o título normalizado — nunca o HTML
 * nem o resumo, que mudam entre requisições. O título entra junto porque
 * `hn.algolia.com` pode devolver a mesma URL externa em duas stories
 * distintas do HN (dois envios do mesmo link, com discussões diferentes);
 * só a URL colidiria as duas numa linha e apagaria uma discussão real.
 */

const DATA_DIR = path.join(__dirname, '..', 'data');
const STORE_PATH = path.join(DATA_DIR, 'noticias.jsonl');

/** Campos DERIVADOS do lote — reescritos a cada rodada (ver cabeçalho, ponto 3). */
const CAMPOS_DERIVADOS = [
  'cluster_id',
  'n_veiculos',
  'n_itens_cluster',
  'sinal_bruto',
  'lote',
  'lote_tamanho',
  'percentil',
  'repercussao',
  'perfil_bump',
  'perfil_matches',
  'score',
  'ancoras',
  'ancoras_regime'
];

function gerarIdNoticia({ link, titulo }) {
  const chave = [link, titulo].map(normalizarChave).join('|');
  return crypto.createHash('sha256').update(chave, 'utf8').digest('hex').slice(0, 20);
}

function garantirDiretorio(storePath) {
  const dir = path.dirname(storePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function carregarTudo(storePath = STORE_PATH) {
  if (!fs.existsSync(storePath)) return [];
  return fs
    .readFileSync(storePath, 'utf8')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .map(l => JSON.parse(l));
}

function salvarTudo(registros, storePath = STORE_PATH) {
  garantirDiretorio(storePath);
  const conteudo = registros.map(r => JSON.stringify(r)).join('\n') + (registros.length ? '\n' : '');
  fs.writeFileSync(storePath, conteudo, 'utf8');
}

/**
 * A LINHA que a Fase B vai consumir. Os 9 campos que o briefing pede vêm
 * primeiro e com o nome que ele usou (título · veículo · link · data · aba ·
 * tabela · cluster_id · n_veiculos · score); o resto existe para permitir
 * RECALCULAR os três recortes (3 dias / semana / mês) e recalibrar o limiar
 * de Jaccard sem recoletar nada.
 *
 * `data` é ISO 8601 UTC e `data_ms` é o mesmo instante em epoch — os dois,
 * de propósito: o ISO é o que a planilha lê, o epoch é o que a janela de
 * ±36h e os recortes comparam sem reparsear string 2000 vezes.
 */
function montarRegistro(item) {
  return {
    id: item.id,
    titulo: item.titulo,
    veiculo: item.veiculo || null,
    link: item.link || null,
    data: Number.isFinite(item.dataMs) ? new Date(item.dataMs).toISOString() : null,
    aba: item.aba || null,
    tabela: item.tabela || null,
    cluster_id: item.cluster_id || null,
    n_veiculos: Number.isFinite(item.n_veiculos) ? item.n_veiculos : null,
    score: Number.isFinite(item.score) ? item.score : null,

    // --- o que permite recalcular, sem recoletar ---
    fonte: item.fonte || null,
    dominio: item.dominio || null,
    idioma: item.idioma || null,
    data_ms: Number.isFinite(item.dataMs) ? item.dataMs : null,
    data_bruta: item.dataBruta || null,
    dia_lote: item.dia_lote || null,
    lote: item.lote || null,
    lote_tamanho: Number.isFinite(item.lote_tamanho) ? item.lote_tamanho : null,
    sinal_bruto: Number.isFinite(item.sinal_bruto) ? item.sinal_bruto : null,
    percentil: Number.isFinite(item.percentil) ? item.percentil : null,
    repercussao: Number.isFinite(item.repercussao) ? item.repercussao : null,
    perfil_bump: Number.isFinite(item.perfil_bump) ? item.perfil_bump : null,
    perfil_matches: item.perfil_matches || [],
    n_itens_cluster: Number.isFinite(item.n_itens_cluster) ? item.n_itens_cluster : null,
    ancoras: item.ancoras || [],
    ancoras_regime: item.ancoras_regime || null,
    // score nativo, só onde a fonte entrega de verdade (HN via Algolia).
    // `null` no resto — nunca zero, que seria "medido e deu zero".
    pontos: Number.isFinite(item.pontos) ? item.pontos : null,
    comentarios: Number.isFinite(item.comentarios) ? item.comentarios : null,
    autor: item.autor || null,
    visto_primeiro_em: item.visto_primeiro_em || new Date().toISOString(),
    atualizado_em: new Date().toISOString()
  };
}

/**
 * Grava o lote. Registro novo entra inteiro; registro já existente tem só os
 * CAMPOS_DERIVADOS reescritos (ver cabeçalho, ponto 3) e conserva
 * `visto_primeiro_em`. Retorna a contagem das duas coisas — nunca em
 * silêncio, para que "nada de novo hoje" seja distinguível de "a coleta
 * falhou e ninguém percebeu".
 */
function salvarLote(itens, storePath = STORE_PATH) {
  const existentes = carregarTudo(storePath);
  const porId = new Map(existentes.map(r => [r.id, r]));

  let novos = 0;
  let atualizados = 0;

  for (const item of itens) {
    const anterior = porId.get(item.id);
    if (!anterior) {
      porId.set(item.id, montarRegistro(item));
      novos++;
      continue;
    }
    const fresco = montarRegistro({ ...item, visto_primeiro_em: anterior.visto_primeiro_em });
    const mesclado = { ...anterior };
    for (const campo of CAMPOS_DERIVADOS) mesclado[campo] = fresco[campo];
    mesclado.atualizado_em = fresco.atualizado_em;
    porId.set(item.id, mesclado);
    atualizados++;
  }

  const todos = Array.from(porId.values()).sort((a, b) => (b.data_ms || 0) - (a.data_ms || 0));
  salvarTudo(todos, storePath);
  return { novos, atualizados, total: todos.length };
}

function listar(filtro = () => true, storePath = STORE_PATH) {
  return carregarTudo(storePath).filter(filtro);
}

/**
 * ONDA 10d (plano `radar-crm-20-ondas.md`, correção C7) — A IDADE REAL DO
 * STORE, não a idade do DADO.
 *
 * Por que `visto_primeiro_em` e não `data`/`data_ms`: o `data` de um
 * registro é a data que o ARTIGO carrega (quando o veículo publicou), e
 * isso inclui BACKLOG — itens de 14/08 a 26/08 que os feeds ainda serviam
 * quando as fontes foram ligadas em 27/08, não histórico acumulado dia a
 * dia pelo radar. `visto_primeiro_em` é a única data que mede quando O
 * RADAR viu o item pela primeira vez — é ela que define a idade real do
 * store, e é por isso que a janela de "top 20 dos últimos 30 dias" só fica
 * honesta 30 dias depois do MENOR `visto_primeiro_em` de todo o store, não
 * 30 dias depois da data mais antiga que qualquer artigo carrega.
 *
 * Devolve `{ nascimentoMs, nascimentoISO, completaEmMs, completaEmISO,
 * completa, diasFaltantes }`. `completa` é `false` e `diasFaltantes` conta
 * quantos dias faltam enquanto o store for mais novo que `janelaDias`
 * (padrão 30). Store vazio devolve tudo `null`/`false` — nunca finge uma
 * data que não existe.
 *
 * Esta função só EXPÕE o número; o texto que a planilha mostra (o
 * "terceiro estado vazio" do briefing, distinto de "a coleta parou") é
 * decisão de apresentação de `_norman/`, fora desta Onda.
 */
function idadeDoStore(registros = carregarTudo(), { agora = Date.now(), janelaDias = 30 } = {}) {
  const vistos = (registros || [])
    .map(r => r && r.visto_primeiro_em)
    .filter(Boolean)
    .map(s => Date.parse(s))
    .filter(Number.isFinite);

  if (!vistos.length) {
    return {
      nascimentoMs: null, nascimentoISO: null,
      completaEmMs: null, completaEmISO: null,
      completa: false, diasFaltantes: null
    };
  }

  const nascimentoMs = Math.min(...vistos);
  const completaEmMs = nascimentoMs + janelaDias * 86400000;
  const completa = agora >= completaEmMs;
  const diasFaltantes = completa ? 0 : Math.ceil((completaEmMs - agora) / 86400000);

  return {
    nascimentoMs,
    nascimentoISO: new Date(nascimentoMs).toISOString(),
    completaEmMs,
    completaEmISO: new Date(completaEmMs).toISOString(),
    completa,
    diasFaltantes
  };
}

module.exports = {
  STORE_PATH,
  DATA_DIR,
  CAMPOS_DERIVADOS,
  gerarIdNoticia,
  montarRegistro,
  carregarTudo,
  salvarTudo,
  salvarLote,
  listar,
  idadeDoStore
};
