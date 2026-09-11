'use strict';

/**
 * Parser de feed — RSS 2.0, RSS 0.91, RDF (Nature) e Atom (The Verge,
 * Reddit) atrás de UMA função. Existe separado de `fontes/weworkremotely.js`
 * (que tem o seu próprio parser local de `<item>`, privado sob `_internal`)
 * porque a trilha de NOTÍCIA consome 20+ feeds em 4 formatos diferentes —
 * copiar o parser em cada fonte, como a trilha de vaga faz com 5, sairia
 * caro e desalinhado.
 *
 * ACHADOS REAIS DO RECONHECIMENTO (fontes-noticias-reconhecimento.md) QUE
 * ESTE MÓDULO EXISTE PARA COBRIR:
 *
 * 1. The Verge e Reddit são **Atom** (`<entry>`), não RSS — um parser que
 *    procura literalmente `<item>` conta ZERO e conclui "fonte morta"
 *    errado. Nahida documentou ter cometido esse erro na própria sondagem.
 *    `detectarFormato` decide por conteúdo, nunca por configuração da fonte.
 * 2. Nature é **RDF**: `<item rdf:about="...">`, com ATRIBUTO dentro da tag
 *    de abertura. `<item>` literal (regex sem tolerância a atributo) também
 *    conta zero aqui. Por isso todo regex de bloco/campo abaixo aceita
 *    atributo antes do `>`.
 * 3. arXiv/Nature/Dublin Core usam tag com NAMESPACE (`dc:date`,
 *    `dc:creator`, `atom:subtitle`) — `campo()` recebe o nome completo com
 *    dois-pontos e escapa antes de montar o regex.
 * 4. BBC Brasil **duplica item dentro do próprio feed** (dois pares com o
 *    mesmo `pubDate` exato, confirmado nos 41 itens da captura). Por isso
 *    `dedupeIntraFeed` roda ANTES de qualquer outra coisa, por link
 *    canônico — não é otimização, é correção de dado sujo na origem.
 *
 * O parser é DELIBERADAMENTE tolerante: tag ausente vira `null`, nunca
 * string vazia nem exceção. Feed é dado de terceiro; quebrar a coleta
 * inteira porque um item de 300 não tem `<description>` é o modo de falha
 * errado.
 */

const ENTIDADES = [
  [/&nbsp;/gi, ' '],
  [/&lt;/gi, '<'],
  [/&gt;/gi, '>'],
  [/&quot;/gi, '"'],
  [/&apos;/gi, "'"],
  [/&#0?39;/g, "'"],
  [/&#0?34;/g, '"'],
  [/&#8217;/g, '\u2019'],
  [/&#8216;/g, '\u2018'],
  [/&#8220;/g, '\u201c'],
  [/&#8221;/g, '\u201d'],
  [/&#8211;/g, '\u2013'],
  [/&#8212;/g, '\u2014'],
  [/&#160;/g, ' ']
];

/**
 * `&amp;` é resolvido POR ÚLTIMO, sempre. Resolvê-lo primeiro transformaria
 * `&amp;lt;` (um `&lt;` literal escapado duas vezes, comum em feed que
 * embute HTML) em `<`, injetando uma tag que o autor escreveu como texto.
 */
function decodificarEntidades(texto) {
  let t = String(texto == null ? '' : texto);
  for (const [re, sub] of ENTIDADES) t = t.replace(re, sub);
  t = t.replace(/&#(\d+);/g, (_, n) => {
    const cod = Number(n);
    return cod > 0 && cod < 0x110000 ? String.fromCodePoint(cod) : '';
  });
  t = t.replace(/&#x([0-9a-f]+);/gi, (_, n) => {
    const cod = parseInt(n, 16);
    return cod > 0 && cod < 0x110000 ? String.fromCodePoint(cod) : '';
  });
  return t.replace(/&amp;/gi, '&');
}

function limparTags(html) {
  return decodificarEntidades(String(html == null ? '' : html).replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** `rss` | `atom` — decidido pelo CONTEÚDO (ver cabeçalho, achado 1). RDF cai em `rss` de propósito: a unidade é `<item>` igual, só com atributo. */
function detectarFormato(xml) {
  const s = String(xml || '');
  if (/<entry[\s>]/i.test(s)) return 'atom';
  return 'rss';
}

/** Blocos da unidade de item. Tolera atributo na tag de abertura (`<item rdf:about="...">` do Nature) — ver cabeçalho, achado 2. */
function extrairBlocos(xml, tag) {
  const blocos = [];
  const re = new RegExp('<' + escapeRegex(tag) + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + escapeRegex(tag) + '>', 'gi');
  let m;
  while ((m = re.exec(String(xml || '')))) blocos.push(m[1]);
  return blocos;
}

/**
 * Lê uma tag de dentro de um bloco. Tolera atributo e CDATA. `null` quando
 * ausente ou vazia depois do trim — nunca string vazia como "valor
 * presente" (é a mesma regra de `fontes/weworkremotely.js campo`).
 */
function campo(bloco, tag) {
  const re = new RegExp('<' + escapeRegex(tag) + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + escapeRegex(tag) + '>', 'i');
  const m = String(bloco || '').match(re);
  if (!m) return null;
  let v = m[1];
  const cdata = v.match(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/);
  if (cdata) v = cdata[1];
  v = v.trim();
  return v === '' ? null : v;
}

/** Todos os valores de uma tag repetida (`<category>` do Verge, `<dc:creator>` do arXiv). Array vazio quando não há nenhuma. */
function campos(bloco, tag) {
  const re = new RegExp('<' + escapeRegex(tag) + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + escapeRegex(tag) + '>', 'gi');
  const out = [];
  let m;
  while ((m = re.exec(String(bloco || '')))) {
    const v = decodificarEntidades(m[1]).trim();
    if (v) out.push(v);
  }
  return out;
}

/**
 * Valor de um atributo de uma tag auto-fechada ou de abertura. Necessário
 * para Atom, onde o link mora em `<link rel="alternate" href="URL"/>` e NÃO
 * no corpo da tag. `preferir` filtra por um par atributo=valor (ex.:
 * `rel="alternate"`) e cai na PRIMEIRA ocorrência se o preferido não
 * existir — o Reddit emite `<link href="..."/>` sem `rel`, e recusar isso
 * zeraria a fonte inteira.
 */
function atributo(bloco, tag, attr, preferir) {
  const re = new RegExp('<' + escapeRegex(tag) + '\\s([^>]*?)/?>', 'gi');
  const candidatos = [];
  let m;
  while ((m = re.exec(String(bloco || '')))) candidatos.push(m[1]);
  if (!candidatos.length) return null;

  let escolhido = null;
  if (preferir) {
    const rePref = new RegExp(escapeRegex(preferir.attr) + '\\s*=\\s*["\']' + escapeRegex(preferir.valor) + '["\']', 'i');
    escolhido = candidatos.find(c => rePref.test(c)) || null;
  }
  if (!escolhido) escolhido = candidatos[0];

  const mAttr = escolhido.match(new RegExp(escapeRegex(attr) + '\\s*=\\s*["\']([^"\']*)["\']', 'i'));
  return mAttr && mAttr[1].trim() ? decodificarEntidades(mAttr[1].trim()) : null;
}

/**
 * Data -> epoch ms. Cobre RFC822 completo (G1/NYT/BBC), RFC822 SEM dia da
 * semana (Folha: `27 Aug 2026 12:30:00 -0300` — o `[incerto:]` que Nahida
 * deixou aberto; `Date.parse` do V8 aceita, e `tests/noticias-rss.test.js`
 * fixa isso como asserção em vez de deixar como suposição visual) e ISO
 * 8601 (`dc:date` do Nature, `updated`/`published` do Atom).
 *
 * `null` para ausente/inválida. NUNCA cai em `Date.now()` nem no epoch:
 * data inventada contamina a janela de cluster e o recorte de "últimos 3
 * dias" sem deixar rastro.
 */
function dataMs(bruta) {
  if (!bruta) return null;
  const t = Date.parse(String(bruta).trim());
  return Number.isNaN(t) ? null : t;
}

function dataISO(bruta) {
  const ms = dataMs(bruta);
  return ms == null ? null : new Date(ms).toISOString();
}

/**
 * URL canônica para dedupe e para extrair domínio. Remove querystring de
 * campanha (`utm_*`, `cmp`, `ref`, `fbclid`), fragmento e barra final;
 * normaliza host pra minúsculo e tira `www.`.
 *
 * NÃO resolve redirecionador (`redir.folha.com.br/redir/online/...`): o
 * reconhecimento observou que o link da Folha é um redirecionador, e seguir
 * cada um custaria uma requisição por item (100 itens/feed). Como o
 * redirecionador é ESTÁVEL por artigo, dedupe por ele funciona dentro da
 * Folha; o que se perde é dedupe da Folha contra outro veículo pela URL —
 * mas dedupe entre veículos é justamente o trabalho do CLUSTER, que não usa
 * URL. Perda real: zero.
 */
function linkCanonico(url) {
  const bruto = String(url == null ? '' : url).trim();
  if (!bruto) return null;
  try {
    const u = new URL(bruto);
    for (const k of Array.from(u.searchParams.keys())) {
      if (/^utm_/i.test(k) || /^(cmp|ref|fbclid|gclid|src|source)$/i.test(k)) u.searchParams.delete(k);
    }
    u.hash = '';
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, '');
    let s = u.toString();
    s = s.replace(/\?$/, '');
    if (u.pathname !== '/') s = s.replace(/\/$/, '');
    return s;
  } catch {
    return bruto;
  }
}

/**
 * Domínio registrável aproximado — `g1.globo.com` -> `globo.com`,
 * `feeds.bbci.co.uk` -> `bbci.co.uk`. Serve pro teste "veículos DIFERENTES"
 * do cluster: `g1.globo.com` e `oglobo.globo.com` são o MESMO grupo
 * editorial e não podem contar como dois veículos independentes — se
 * contassem, republicação interna do mesmo grupo viraria "repercussão".
 */
function dominio(url) {
  const bruto = String(url == null ? '' : url).trim();
  if (!bruto) return null;
  let host;
  try {
    host = new URL(bruto).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
  const partes = host.split('.');
  if (partes.length <= 2) return host;
  const doisUltimos = partes.slice(-2).join('.');
  if (/^(co\.uk|com\.br|org\.br|gov\.br|net\.br|ac\.uk|co\.jp|com\.au)$/.test(doisUltimos)) {
    return partes.slice(-3).join('.');
  }
  return doisUltimos;
}

function parseItemRss(bloco) {
  // As entidades são resolvidas ANTES da canonicalização, sempre. Achado
  // real do teste: um link com `?utm_source=x&amp;cmp=y` canonizado sem
  // decodificar produz o parâmetro `amp;cmp`, que escapa da lista de
  // remoção e faz duas cópias da MESMA matéria virarem dois itens. O
  // dedupe intra-feed falha em silêncio — não lança, só duplica.
  const linkBruto = campo(bloco, 'link');
  const link = linkBruto ? decodificarEntidades(linkBruto) : null;
  const dataBruta = campo(bloco, 'pubDate') || campo(bloco, 'dc:date') || campo(bloco, 'published');
  const lc = linkCanonico(link);
  return {
    titulo: decodificarEntidades(campo(bloco, 'title') || '').trim() || null,
    link,
    linkCanonico: lc,
    dominio: dominio(lc),
    dataBruta,
    dataMs: dataMs(dataBruta),
    dataISO: dataISO(dataBruta),
    resumo:
      limparTags(campo(bloco, 'atom:subtitle') || campo(bloco, 'description') || campo(bloco, 'content:encoded')) ||
      null,
    guid: campo(bloco, 'guid') || campo(bloco, 'dc:identifier') || null,
    autor: campo(bloco, 'dc:creator') || campo(bloco, 'author') || null,
    categorias: campos(bloco, 'category')
  };
}

function parseItemAtom(bloco) {
  const link = atributo(bloco, 'link', 'href', { attr: 'rel', valor: 'alternate' });
  const dataBruta = campo(bloco, 'published') || campo(bloco, 'updated');
  const lc = linkCanonico(link);
  const autorBloco = String(bloco).match(/<author>([\s\S]*?)<\/author>/i);
  const categoriasAttr = (String(bloco).match(/<category[^>]*>/gi) || [])
    .map(t => {
      const m = t.match(/term\s*=\s*["']([^"']*)["']/i);
      return m ? decodificarEntidades(m[1]) : null;
    })
    .filter(Boolean);
  return {
    titulo: decodificarEntidades(campo(bloco, 'title') || '').trim() || null,
    link: link || null,
    linkCanonico: lc,
    dominio: dominio(lc),
    dataBruta,
    dataMs: dataMs(dataBruta),
    dataISO: dataISO(dataBruta),
    resumo: limparTags(campo(bloco, 'summary') || campo(bloco, 'content')) || null,
    guid: campo(bloco, 'id') || null,
    autor: autorBloco ? campo(autorBloco[1], 'name') : null,
    categorias: categoriasAttr.concat(campos(bloco, 'category'))
  };
}

/**
 * Dedupe DENTRO de um feed, por link canônico (ver cabeçalho, achado 4 —
 * BBC Brasil). Mantém a PRIMEIRA ocorrência. Retorna `{ itens, removidos }`
 * — `removidos` é contado e reportado, nunca descartado em silêncio: um
 * feed que de repente duplica 40% dos itens é sinal de que a fonte mudou, e
 * isso precisa aparecer no log.
 */
function dedupeIntraFeed(itens) {
  const vistos = new Set();
  const out = [];
  let removidos = 0;
  for (const item of itens) {
    const chave = item.linkCanonico || item.guid || item.titulo;
    if (!chave || vistos.has(chave)) {
      removidos++;
      continue;
    }
    vistos.add(chave);
    out.push(item);
  }
  return { itens: out, removidos };
}

/**
 * Ponto de entrada. `{ itens, volumeBruto, removidosIntraFeed,
 * descartadosSemCampo, formato }`. `volumeBruto` = nº de blocos ANTES de
 * qualquer filtro (mesmo conceito de `volumeBruto` das fontes de vaga).
 * Item sem título OU sem link é descartado — não dá pra montar a linha
 * (título·veículo·link) que a planilha pede sem os dois.
 */
function parseFeed(xml, { formato } = {}) {
  const fmt = formato || detectarFormato(xml);
  const blocos = fmt === 'atom' ? extrairBlocos(xml, 'entry') : extrairBlocos(xml, 'item');
  const parseados = blocos.map(fmt === 'atom' ? parseItemAtom : parseItemRss).filter(i => i.titulo && i.linkCanonico);
  const { itens, removidos } = dedupeIntraFeed(parseados);
  return {
    itens,
    volumeBruto: blocos.length,
    removidosIntraFeed: removidos,
    descartadosSemCampo: blocos.length - parseados.length,
    formato: fmt
  };
}

module.exports = {
  decodificarEntidades,
  limparTags,
  detectarFormato,
  extrairBlocos,
  campo,
  campos,
  atributo,
  dataMs,
  dataISO,
  linkCanonico,
  dominio,
  dedupeIntraFeed,
  parseFeed
};
