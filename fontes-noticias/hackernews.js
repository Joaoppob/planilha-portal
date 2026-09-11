'use strict';

const http = require('../lib/http');
const rssLib = require('../lib-noticias/rss');
const frescor = require('../lib-noticias/frescor');

/**
 * HACKER NEWS via Algolia (`hn.algolia.com/api/v1`) — a única fonte de toda
 * esta trilha que entrega SINAL NUMÉRICO pronto: `points` e `num_comments`,
 * keyless, sem rate limit observado nas ~6 chamadas do reconhecimento. É por
 * causa dela que `lib-noticias/ranking.js sinalBruto` tem dois ramos.
 *
 * NÃO usa a fábrica RSS: aqui é JSON, e os campos que importam (`points`)
 * não existem em feed nenhum.
 *
 * DOIS ENDPOINTS, PROPÓSITOS DIFERENTES:
 *  - `search?tags=front_page` — o que está na home do HN AGORA. É a leitura
 *    de repercussão da comunidade, independente de termo.
 *  - `search_by_date?tags=story&query=TERMO` — busca por termo, ordenada por
 *    data. É o que recupera Claude/Anthropic, já que a Anthropic não tem RSS
 *    (404) e nenhum feed a cobre diretamente.
 *
 * `dominio` é fixado em `ycombinator.com`, NÃO no domínio do link externo.
 * A decisão importa: um post do HN que aponta pra techcrunch.com é uma
 * SEGUNDA publicação sobre o fato (a discussão), não a mesma. Fixando o
 * domínio no HN, um fato coberto pelo TechCrunch e discutido no HN forma um
 * cluster de 2 veículos — que é a leitura certa. Se eu usasse o domínio do
 * link externo, os dois colapsariam em "1 veículo" e a repercussão sumiria.
 *
 * `link` continua sendo a URL EXTERNA (é o que JB quer abrir); a discussão
 * fica em `link_discussao`, ao lado, nunca no lugar. Post de texto (Ask
 * HN/Show HN sem URL) usa a própria discussão como link — aí ela É o artigo.
 */

const ID = 'hackernews';
const BASE = 'https://hn.algolia.com/api/v1';
const DOMINIO = 'ycombinator.com';

/**
 * Termos de busca. Curtos e específicos de propósito: o reconhecimento
 * confirmou que `query=claude` devolve resultado relevante no topo ("Show
 * HN: I built a site to share and find Claude Code passes"), não ruído.
 * Termo genérico ("ai") traria centenas de itens irrelevantes e afogaria a
 * tabela — o mesmo erro que o filtro do arXiv existe para evitar.
 */
const TERMOS = ['claude', 'anthropic', 'codex', 'ai agents'];
const HITS_FRONT_PAGE = 50;
const HITS_POR_TERMO = 25;
const PAUSA_ENTRE_CHAMADAS_MS = Number(process.env.RADAR_NOTICIAS_HN_PAUSA_MS || 400);
const MAX_IDADE_DIAS = 7;

function esperar(ms) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Converte um `hit` da Algolia no item comum da trilha.
 *
 * `num_comments` é lido do campo direto quando existe. O reconhecimento
 * anotou tê-lo obtido "via array `children`" — isso vale para o endpoint
 * `/items/{id}` (a árvore de um post), não para `/search`, que expõe
 * `num_comments` como escalar. Trato os dois: escalar primeiro, contagem de
 * `children` como fallback. `null` quando nenhum dos dois existe — nunca
 * zero, que significaria "medido e deu zero".
 */
function mapearHit(hit, { origem }) {
  if (!hit || !hit.objectID) return null;
  const discussao = 'https://news.ycombinator.com/item?id=' + hit.objectID;
  const externo = hit.url || null;
  const link = externo || discussao;
  const dataMs = rssLib.dataMs(hit.created_at);

  const comentarios = Number.isFinite(hit.num_comments)
    ? hit.num_comments
    : Array.isArray(hit.children)
      ? hit.children.length
      : null;

  const titulo = String(hit.title || hit.story_title || '').trim();
  if (!titulo) return null;

  return {
    titulo,
    link,
    linkCanonico: rssLib.linkCanonico(link),
    link_discussao: discussao,
    // ver cabeçalho: domínio do HN, não do link externo.
    dominio: DOMINIO,
    dataBruta: hit.created_at || null,
    dataMs,
    dataISO: dataMs == null ? null : new Date(dataMs).toISOString(),
    resumo: hit.story_text ? rssLib.limparTags(hit.story_text) : null,
    guid: 'hn:' + hit.objectID,
    autor: hit.author || null,
    categorias: hit._tags || [],
    pontos: Number.isFinite(hit.points) ? hit.points : null,
    comentarios: Number.isFinite(comentarios) ? comentarios : null,
    fonte: ID,
    veiculo: 'Hacker News',
    aba: 'ia',
    tabela: 'reddit-hn',
    idioma: 'en',
    origemConsulta: origem
  };
}

async function consultar(url, origem, diagnostico) {
  let corpo;
  try {
    corpo = await http.get(url);
  } catch (err) {
    diagnostico.feeds.push({ url, ok: false, erro: err.message });
    console.error('[fonte:' + ID + '] GET falhou em ' + url + ' — ' + err.message);
    return [];
  }
  let json;
  try {
    json = JSON.parse(corpo);
  } catch (err) {
    diagnostico.feeds.push({ url, ok: false, erro: 'JSON inválido: ' + err.message });
    console.error('[fonte:' + ID + '] resposta não é JSON em ' + url);
    return [];
  }
  const hits = Array.isArray(json.hits) ? json.hits : [];
  const itens = hits.map(h => mapearHit(h, { origem })).filter(Boolean);
  diagnostico.feeds.push({ url, ok: true, volumeBruto: hits.length, mapeados: itens.length, origem });
  return itens;
}

async function coletar({ agora = Date.now() } = {}) {
  const diagnostico = { fonte: ID, feeds: [], filtradosPorTabela: 0, itensVelhos: 0 };
  let bruto = [];

  bruto = bruto.concat(
    await consultar(BASE + '/search?tags=front_page&hitsPerPage=' + HITS_FRONT_PAGE, 'front_page', diagnostico)
  );

  for (const termo of TERMOS) {
    await esperar(PAUSA_ENTRE_CHAMADAS_MS);
    const url =
      BASE + '/search_by_date?tags=story&query=' + encodeURIComponent(termo) + '&hitsPerPage=' + HITS_POR_TERMO;
    bruto = bruto.concat(await consultar(url, 'termo:' + termo, diagnostico));
  }

  // O mesmo post aparece no front_page E numa busca por termo — dedupe pelo
  // objectID (via guid), mesma regra de `rss.dedupeIntraFeed`.
  const { itens: unicos, removidos } = rssLib.dedupeIntraFeed(bruto.map(i => ({ ...i, linkCanonico: i.guid })));
  diagnostico.removidosIntraFonte = removidos;

  // Restaura o link canônico de verdade (o `guid` foi usado só como chave de
  // dedupe acima — trocar de volta evita que o store guarde `hn:12345` como
  // se fosse URL).
  const restaurados = unicos.map(i => ({ ...i, linkCanonico: rssLib.linkCanonico(i.link) }));

  // Guarda de frescor: a mesma que roda para todo feed. `search_by_date` por
  // termo devolve resultado ordenado por data mas SEM piso de recência — sem
  // este corte, uma busca por "codex" traria discussão de 2021.
  const veredito = frescor.avaliarFrescor(restaurados, { maxIdadeDias: MAX_IDADE_DIAS, agora });
  console.error(frescor.formatarVeredito(ID, veredito));
  if (!veredito.aprovado) {
    diagnostico.rejeitada = veredito;
    return { itens: [], diagnostico };
  }

  const { itens, descartados } = frescor.filtrarItensVelhos(restaurados, { maxIdadeDias: MAX_IDADE_DIAS, agora });
  diagnostico.itensVelhos = descartados.length;
  diagnostico.frescor = veredito;

  return { itens, diagnostico };
}

module.exports = {
  id: ID,
  nome: 'Hacker News via Algolia (JSON, keyless, com points/num_comments)',
  veiculo: 'Hacker News',
  aba: 'ia',
  tabela: 'reddit-hn',
  idioma: 'en',
  maxIdadeDias: MAX_IDADE_DIAS,
  canario: false,
  coletar,
  _internal: { mapearHit, TERMOS, BASE, DOMINIO }
};
