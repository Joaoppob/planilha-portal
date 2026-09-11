'use strict';

const http = require('../lib/http');
const extrator = require('../lib/extrator-texto');

/**
 * Coletor do "Seleção Acadêmica" (selecaoacademica.com.br) — RSS, trilha
 * DOCENTE (Onda 12/13 — ver `fontes-reconhecimento-3.md` §1 pra o relato
 * completo do levantamento, e RELATORIO-ONDA-12-13.md pra validação HTTP
 * real que motivou a adoção).
 *
 * MODO DE ACESSO (validado com `lib/http.js` real, 28/08/2026 — nunca com
 * `mcp__donsetch__web_fetch`, degradado nesta sessão — ver C8 do plano):
 *
 *   GET https://selecaoacademica.com.br/feed/
 *
 * RSS 2.0 puro, WordPress, 10 itens (uma página — o WordPress pagina por
 * padrão em 10, sem parâmetro de paginação exposto no feed principal;
 * `volumeBruto` reflete só essa primeira página, mesmo limite físico que
 * `fontes/pci.js`/`fontes/dou.js` já aceitam pras suas próprias fontes).
 *
 * ACHADO QUE MUDA O DESENHO EM RELAÇÃO AO RECONHECIMENTO: o reconhecimento
 * (`fontes-reconhecimento-3.md`) achou que o corpo estruturado ("VAGAS
 * OFERECIDAS"/"DATAS IMPORTANTES") exigia uma SEGUNDA requisição (abrir o
 * post). Validação real mostrou que **não exige** — `<content:encoded>`
 * (CDATA) já traz o post INTEIRO dentro do próprio item do RSS, headers
 * incluídos. `enriquecer()` abaixo não faz NENHUMA requisição de rede — o
 * texto completo já veio em `coletar()`.
 *
 * FORMATO DO CORPO (confirmado contra 9 posts reais do feed, 28/08/2026 —
 * UFRRJ/UEM/UNILA/IFPI/UFPI/UFPE/IFSC/IFSULDEMINAS/UNCISAL; variação de tag
 * de heading entre posts — `<h4>`/`<h3>` com ou sem `class`/`id` — por isso
 * a busca do marcador roda sobre o texto JÁ SEM TAGS, nunca sobre a tag em
 * si):
 *
 *   {data}. {Artigo A|O} {Nome completo} ({SIGLA}) publicou ... com {N}
 *   vagas ... [VAGAS OFERECIDAS] {intro}: {Área} ({N vaga(s)}|{Cadastro de
 *   Reserva}[ – Campus X]); {Área} (...); ... [DETALHES DOS CARGOS ...]
 *   [DATAS IMPORTANTES] Período de inscrição: {DD} de {mês} de {AAAA} a
 *   {DD} de {mês} de {AAAA} ...
 *
 * ÓRGÃO: extraído da PRIMEIRA ocorrência do padrão "A|O {Nome} ({SIGLA})"
 * no corpo (não do título — o título é uma frase de manchete, ex. "UEM
 * abre Processo Seletivo...", sem o nome por extenso). Formatado como
 * `"{SIGLA} - {Nome completo}"` — DE PROPÓSITO no MESMO formato que
 * `fontes/pci.js` já usa (`concurso.titulo`, ex. "UEM - Universidade
 * Estadual de Maringá") — confirmado real: o edital UEM nº 341/2026-PRH
 * (26/08 a 16/09/2026) aparece TANTO na PCI quanto aqui, e
 * `lib/store.js chaveCanonicaDedupe` só resolve o cross-fonte se as duas
 * strings de órgão canonicalizarem igual (`lib/orgao-canonico.js`, fora da
 * fronteira desta Onda — não pode ser tocado). Como a UEM não está na
 * tabela curada de siglas (`lib/siglas.js`), o fallback de `canonizar()`
 * usa "o candidato mais LONGO" — reproduzir o formato "SIGLA - Nome" da
 * PCI byte-a-byte é o jeito de dar a MESMA string de entrada às duas
 * fontes sem editar `lib/orgao-canonico.js`. Quando o padrão não é achado
 * (post fora do formato usual), cai no fallback: o título inteiro vira
 * `orgao` — nunca quebra, mas não deduplica tão bem (documentado no
 * RELATORIO-ONDA-12-13.md como risco residual conhecido).
 *
 * SUBEDITAL (guarda-chuva — ver `dividirSubeditais` abaixo): mesma decisão
 * de `fontes/pci.js subeditalDoCargo` — o TEXTO da área (ex. "Ciência da
 * Computação/Algoritmos") é o próprio identificador estável, não um índice
 * de posição na lista (a ordem pode mudar entre coletas, o texto não).
 */

const ID = 'selecaoacademica';
const NOME = 'Seleção Acadêmica — RSS';
const BASE = 'https://selecaoacademica.com.br';
const FEED_URL = `${BASE}/feed/`;

function decodificarEntidades(texto) {
  return String(texto || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#8230;/g, '...')
    .replace(/&#8211;/g, '-')
    .replace(/&#8212;/g, '-')
    .replace(/&#8217;/g, "'")
    .replace(/&#8220;|&#8221;/g, '"');
}

/** Mesmo padrão de `fontes/weworkremotely.js limparTags` — cópia local deliberada (formato específico desta fonte). */
function limparTags(html) {
  return decodificarEntidades(String(html || '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

/** Extrai o conteúdo de cada bloco `<item>...</item>` do RSS. */
function extrairBlocosItem(xml) {
  const blocos = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(xml))) blocos.push(m[1]);
  return blocos;
}

/** Lê uma tag simples (não aninhada, com ou sem CDATA) de dentro de um bloco `<item>`. `null` quando ausente/vazia. */
function campo(bloco, tag) {
  const reCdata = new RegExp(`<${tag}>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*<\\/${tag}>`);
  const mCdata = bloco.match(reCdata);
  if (mCdata) return mCdata[1] !== '' ? mCdata[1] : null;
  const re = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`);
  const m = bloco.match(re);
  return m && m[1] !== '' ? m[1] : null;
}

function categorias(bloco) {
  const re = /<category><!\[CDATA\[([\s\S]*?)\]\]><\/category>/g;
  const cats = [];
  let m;
  while ((m = re.exec(bloco))) cats.push(m[1]);
  return cats;
}

/** `AAAA-MM-DD` a partir de `pubDate` (RFC822). `null` para ausente/inválida — mesmo padrão de `fontes/weworkremotely.js dataISO`. */
function dataISO(rfc822) {
  if (!rfc822) return null;
  const d = new Date(rfc822);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/** "A|O {Nome completo} ({SIGLA})" — primeira ocorrência no corpo (ver cabeçalho). `null` quando o padrão não aparece. */
const RE_ORGAO = /\b[AO]\s+([A-ZÀ-Ý][^()]{3,140}?)\s*\(([A-ZÀ-Ý]{2,20})\)/;

function extrairOrgao(textoStripped, tituloFallback) {
  const m = String(textoStripped || '').match(RE_ORGAO);
  if (!m) return tituloFallback || null;
  const nome = m[1].trim().replace(/\s+/g, ' ');
  const sigla = m[2].trim();
  return `${sigla} - ${nome}`;
}

const MESES = {
  janeiro: '01', fevereiro: '02', marco: '03', 'março': '03', abril: '04',
  maio: '05', junho: '06', julho: '07', agosto: '08', setembro: '09',
  outubro: '10', novembro: '11', dezembro: '12'
};

function mesParaNumero(nome) {
  return MESES[String(nome || '').toLowerCase()] || null;
}

/**
 * "Período de inscrição: DD de mês de AAAA[, texto curto extra] a|até DD de
 * mês de AAAA" — cópia local deliberada (não `lib/extrator-texto.js
 * extrairPeriodoInscricao`, fora da fronteira desta Onda e, testado contra
 * este texto real, não bate: aquele regex exige um "de" ANTES do primeiro
 * dia — "...período DE 30 de julho..." — enquanto esta fonte escreve
 * "inscrição: 30 de julho...", com ":" no lugar do segundo "de").
 * `[^.]{0,40}?` (não-guloso, nunca atravessa um ".") absorve o texto curto
 * que às vezes separa a primeira data do conector "a" — achado real
 * (IFSULDEMINAS): "31 de julho de 2026, às 13h, a 20 de agosto de 2026".
 * Sem match -> `{inicio:null, fim:null}`, nunca inventa.
 */
const RE_PERIODO_INSCRICAO =
  /per[íi]odo de inscri[çc][ãa]o:?\s*(\d{1,2})\s+de\s+([a-zçãéóôêü]+)\s+de\s+(\d{4})[^.]{0,40}?(?:a|at[ée])\s*(\d{1,2})\s+de\s+([a-zçãéóôêü]+)\s+de\s+(\d{4})/i;

function extrairPeriodoInscricao(texto) {
  const t = String(texto || '');
  const m = t.match(RE_PERIODO_INSCRICAO);
  if (!m) return { inicio: null, fim: null };
  const mesInicio = mesParaNumero(m[2]);
  const mesFim = mesParaNumero(m[5]);
  if (!mesInicio || !mesFim) return { inicio: null, fim: null };
  return {
    inicio: `${m[3]}-${mesInicio}-${String(m[1]).padStart(2, '0')}`,
    fim: `${m[6]}-${mesFim}-${String(m[4]).padStart(2, '0')}`
  };
}

/**
 * Converte um bloco `<item>` em item bruto. `null` quando faltar `title`
 * OU `link` (não dá pra montar um registro útil sem eles — mesmo princípio
 * de `fontes/weworkremotely.js parseFeed`). `content:encoded` ausente vira
 * string vazia (alguns posts do feed — ex. anúncio "PontiLab" — não têm
 * corpo estruturado; o item ainda é devolvido, e cai sozinho no descarte do
 * estágio 1 (`lib/vaga-docente.js`) por falta de vocabulário de concurso).
 */
function parseItem(bloco) {
  const title = decodificarEntidades(campo(bloco, 'title'));
  const link = campo(bloco, 'link');
  if (!title || !link) return null;
  return {
    title,
    link,
    pubDate: campo(bloco, 'pubDate'),
    categorias: categorias(bloco),
    contentEncoded: campo(bloco, 'content:encoded') || ''
  };
}

/**
 * Busca o feed principal, dedupe por `link` (permalink — defensivo, mesmo
 * padrão de `fontes/weworkremotely.js coletar`, nenhuma duplicata real
 * observada no feed até agora). `volumeBruto` = total de `<item>` no feed
 * ANTES de qualquer filtro (10, uma página — ver cabeçalho).
 */
async function coletar() {
  let xml;
  try {
    xml = await http.get(FEED_URL);
  } catch (err) {
    throw new Error(
      `[falha: GET ${FEED_URL} | ${err.message} | conectividade ou o feed pode ter mudado de path | reinspecionar https://selecaoacademica.com.br/feed/]`
    );
  }

  const blocos = extrairBlocosItem(xml);
  const porLink = new Map();
  for (const bloco of blocos) {
    const item = parseItem(bloco);
    if (!item) continue;
    if (!porLink.has(item.link)) porLink.set(item.link, item);
  }

  return { itens: Array.from(porLink.values()), volumeBruto: blocos.length };
}

/** Blob usado pelo estágio 1 (`lib/vaga-docente.js pareceVagaDocente`) — título + categorias + corpo inteiro (sem tags), tudo já em mãos, sem requisição extra. */
function textoParaFiltro(rawItem) {
  return [rawItem.title, (rawItem.categorias || []).join(' '), limparTags(rawItem.contentEncoded)].filter(Boolean).join(' \n ');
}

/** Campos preenchíveis só com o item do feed (sem requisição extra — o RSS já traz o corpo completo). */
function normalizarParcial(rawItem) {
  const textoStripped = limparTags(rawItem.contentEncoded);
  const orgao = extrairOrgao(textoStripped, rawItem.title);
  const dataPublicacao = dataISO(rawItem.pubDate);
  const periodo = extrairPeriodoInscricao(textoStripped);

  return {
    fonte: ID,
    orgao,
    campus: null,
    uf: null,
    url: rawItem.link,
    data_publicacao: dataPublicacao,
    inscricao_inicio: periodo.inicio,
    inscricao_fim: periodo.fim,
    texto_bruto: textoStripped,
    vagas: extrator.extrairVagas(textoStripped),
    titulacao_exigida: extrator.extrairTitulacao(textoStripped),
    regime: extrator.extrairRegime(textoStripped),
    classe: extrator.extrairClasse(textoStripped),
    tipo: extrator.extrairTipo(textoStripped)
  };
}

/**
 * Sem requisição de rede — o corpo completo já veio em `coletar()` (ver
 * cabeçalho). Mantido `async` para respeitar o contrato de fonte, mesmo
 * padrão de `fontes/weworkremotely.js`/`fontes/pci.js enriquecer`.
 */
async function enriquecer(rawItem) {
  const textoStripped = limparTags(rawItem.contentEncoded);
  const periodo = extrairPeriodoInscricao(textoStripped);
  return {
    texto_bruto: textoStripped,
    inscricao_inicio: periodo.inicio,
    inscricao_fim: periodo.fim
  };
}

/**
 * "AreaText (N vaga(s)|Cadastro de Reserva)[ extra até o ';']" repetido —
 * ver cabeçalho do arquivo pro formato completo. `extra` (grupo 3) captura
 * o que sobra entre o fecha-parêntese e o `;` (ex. "– Campus Machado"),
 * usado só pra tentar achar campus; nunca obrigatório.
 */
const RE_ITEM_VAGA = /([^;()]+?)\s*\(([^)]*)\)\s*([^;]*);/g;
const RE_CAMPUS_EXTRA = /Campus\s+([A-ZÀ-Ý][\wÀ-ÿ'.-]*(?:\s+[a-zà-ÿ]{1,3}\s+[A-ZÀ-Ý][\wÀ-ÿ'.-]*)*)/;

/** Extrai o número de vagas do parenthetical OU, se ausente ali (ex. "(Português/Espanhol) (1 vaga)"), do `extra` — nunca inventa quando nenhum dos dois tem dígito ("Cadastro de Reserva"). */
function vagasDoItem(parenthetical, extra) {
  const fonte = /\d/.test(parenthetical) ? parenthetical : extra;
  const m = String(fonte || '').match(/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

function campusDoItem(extra) {
  const m = String(extra || '').match(RE_CAMPUS_EXTRA);
  return m ? m[1].trim() : null;
}

/**
 * Divide o corpo (já sem tags — `textoCompleto` é o `texto_bruto` que
 * `radar.js` passa, ver `processarItensFonte`) na lista "VAGAS OFERECIDAS"
 * quando existir. Marcador de INÍCIO = primeiro ":" depois da string
 * "VAGAS OFERECIDAS" (pula a frase de introdução "As vagas oferecidas são
 * as seguintes:"/"...estão distribuídas..."; testado contra os 9 posts
 * reais do feed, sempre presente). Marcador de FIM = a primeira ocorrência
 * de "DATAS IMPORTANTES" ou "DETALHES DOS CARGOS" depois do início
 * (qualquer um dos dois — a ordem varia por post; sem nenhum dos dois,
 * usa até o fim do texto). Retorna `null` quando "VAGAS OFERECIDAS" não
 * aparece OU quando menos de 2 itens são reconhecidos dentro da seção — o
 * chamador (`radar.js`) trata como edital de item único nesse caso, mesmo
 * contrato de `fontes/dou.js dividirSubeditais`.
 */
function dividirSubeditais(textoCompleto) {
  const t = String(textoCompleto || '');
  const idxMarcador = t.indexOf('VAGAS OFERECIDAS');
  if (idxMarcador === -1) return null;

  const idxDoisPontos = t.indexOf(':', idxMarcador);
  const idxIni = idxDoisPontos !== -1 && idxDoisPontos - idxMarcador < 300 ? idxDoisPontos + 1 : idxMarcador;

  let idxFim = t.length;
  for (const marcador of ['DATAS IMPORTANTES', 'DETALHES DOS CARGOS']) {
    const p = t.indexOf(marcador, idxIni);
    if (p !== -1 && p < idxFim) idxFim = p;
  }

  const secao = t.slice(idxIni, idxFim);
  const linhas = [];
  RE_ITEM_VAGA.lastIndex = 0;
  let m;
  while ((m = RE_ITEM_VAGA.exec(secao))) {
    const textoArea = m[1].trim();
    if (!textoArea) continue;
    const parenthetical = m[2].trim();
    const extra = m[3].trim();
    linhas.push({
      codigo: textoArea,
      campus: campusDoItem(extra),
      vagas: vagasDoItem(parenthetical, extra),
      textoArea
    });
  }

  return linhas.length >= 2 ? linhas : null;
}

module.exports = {
  id: ID,
  nome: NOME,
  coletar,
  textoParaFiltro,
  normalizarParcial,
  enriquecer,
  dividirSubeditais,
  // exports internos, úteis para teste sem rede
  _internal: {
    extrairBlocosItem,
    campo,
    categorias,
    dataISO,
    parseItem,
    limparTags,
    decodificarEntidades,
    extrairOrgao,
    RE_ORGAO,
    extrairPeriodoInscricao,
    RE_PERIODO_INSCRICAO,
    mesParaNumero,
    vagasDoItem,
    campusDoItem,
    RE_ITEM_VAGA,
    FEED_URL
  }
};
