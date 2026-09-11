'use strict';

const http = require('../lib/http');
const extratorMercado = require('../lib/extrator-mercado');

/**
 * Coletor do We Work Remotely — RSS por categoria (trilha MERCADO, Onda 5 —
 * ver `fontes-reconhecimento-2.md` §2 para o relato empírico completo do
 * levantamento que motivou esta fonte).
 *
 * MODO DE ACESSO (testado empiricamente em 2026-08-27):
 *
 *   GET https://weworkremotely.com/categories/remote-design-jobs.rss
 *   GET https://weworkremotely.com/categories/remote-programming-jobs.rss
 *
 * XML puro (RSS 2.0), sem bloqueio, sem JS, sem autenticação — `lib/http.js
 * get()` (mesmo UA de navegador do DOU/Gupy/ProgramaThor) já é suficiente,
 * não precisou de header adicional. `<description>` vem com o corpo HTML da
 * vaga inteiro, mas com as entidades ESCAPADAS como texto (`&lt;p&gt;...`),
 * não dentro de um bloco `<![CDATA[...]]>` — precisa decodificar entidade
 * ANTES de tirar as tags (mesma ordem de `fontes/programathor.js
 * limparTags`, cópia local aqui pelo mesmo motivo já documentado lá: é
 * lógica pequena e específica do formato de CADA fonte, não vale acoplar
 * duas fontes de mercado por um utilitário compartilhado que nenhuma das
 * duas pediu).
 *
 * FORMATO DO `<title>`: sempre `"Empresa: Cargo"` — mas o CARGO em si pode
 * conter dois-pontos (achado real: `"IxDF - Interaction Design Foundation:
 * Course Director: UX, UI, and AI"` tem DOIS `:`) — `splitTituloEmpresaCargo`
 * corta só no PRIMEIRO `:`, nunca em todos.
 *
 * ACHADO REAL DE DUPLICATA NO PRÓPRIO FEED: dois pares de itens idênticos
 * (mesmo `<link>`, mesmo `<title>`) apareceram na captura de 27/08/2026
 * (`IISD: Consultancy for...` e `Uptalent.io: Remote Interior Designer...`)
 * — o próprio RSS do WWR publica a vaga duas vezes. `coletar()` deduplica
 * por `link` (URL canônica) tanto DENTRO de uma categoria quanto ENTRE as
 * duas categorias, mesmo padrão de dedupe por `id` de `fontes/gupy.js`/
 * `fontes/programathor.js`.
 *
 * `<expires_at>` (achado real, não documentado na sondagem original):
 * presente em TODOS os 62 itens capturados da categoria Design, mas AUSENTE
 * nos 25 itens da categoria Programming (inconsistência real entre feeds,
 * não bug do parser — confirmado por `grep` na captura bruta). Quando
 * presente, é ~30 dias após `pubDate` — não é um prazo de candidatura
 * declarado pelo empregador, é quando o PRÓPRIO ANÚNCIO sai do ar no site
 * (achado honesto, documentado como tal). Mapeado para `inscricao_fim`
 * quando presente (é o sinal mais próximo de "prazo" que a fonte afirma);
 * `null` quando ausente — nunca inventa 30 dias fixos pra quem não declarou.
 *
 * `<country>` do WWR NÃO significa "vaga é no Brasil" (site é global, a
 * imensa maioria não declara nada aí, e os poucos que declaram são
 * sede/HQ da empresa ou restrição de elegibilidade do candidato, não
 * geografia brasileira) — por isso o item bruto desta fonte
 * DELIBERADAMENTE não expõe um campo `country`: `lib/vaga-mercado.js
 * pareceVagaMercado` (gate genérico de qualquer fonte mercado) rejeita
 * itens cujo `rawItem.country` esteja preenchido e seja diferente de
 * `'Brasil'` — usar esse nome de campo aqui rejeitaria silenciosamente a
 * maioria das vagas remotas legítimas do perfil de JB, que não são
 * "brasileiras" no sentido que a Gupy usa esse campo (vaga postada por
 * empresa brasileira). `region`/`state` brutos do WWR são preservados sob
 * outros nomes (`regiao`/`estado`), só para compor `campus` — nunca para o
 * campo `uf` (não é sigla de estado brasileiro, seria dado inventado).
 *
 * CAMPOS EXIGIDOS PELO GATE GENÉRICO (`lib/vaga-mercado.js
 * pareceVagaMercado`, roda sobre o item BRUTO antes de `normalizarParcial`):
 * `name`/`jobUrl`/`careerPageName` — por isso o item bruto já nasce com
 * esses três nomes de campo (mesma convenção de `fontes/gupy.js`), em vez
 * de nomes locais (`cargo`/`link`/`empresa`) que exigiriam um segundo mapa
 * antes do gate rodar.
 *
 * `modalidade: 'remoto'` sempre — não é inferência, é a premissa do
 * próprio site ("We Work Remotely": todo item das categorias RSS
 * consultadas é uma vaga 100% remota, por definição do agregador).
 */

const ID = 'weworkremotely';
const NOME = 'We Work Remotely — RSS por categoria';
const TRILHA = 'mercado';
const BASE = 'https://weworkremotely.com';

const CATEGORIAS = ['remote-design-jobs', 'remote-programming-jobs'];

function decodificarEntidades(texto) {
  return String(texto || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function limparTags(html) {
  return decodificarEntidades(String(html || '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

/** Extrai o conteúdo de cada bloco `<item>...</item>` do XML — não valida schema RSS além disso, o parser de campo (`campo()`) é tolerante a tag ausente. */
function extrairBlocosItem(xml) {
  const blocos = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(xml))) blocos.push(m[1]);
  return blocos;
}

/** Lê uma tag simples (não aninhada) de dentro de um bloco `<item>`. `null` quando a tag não existe ou está vazia — nunca inventa string vazia como valor presente. */
function campo(bloco, tag) {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`);
  const m = bloco.match(re);
  return m && m[1] !== '' ? m[1] : null;
}

/**
 * `"Empresa: Cargo"` -> `{ empresa, cargo }`, cortando só no PRIMEIRO `:`
 * (ver cabeçalho — cargo pode ter dois-pontos dentro dele). Sem `:` no
 * título (não observado em nenhum dos 87 itens reais capturados, mas sem
 * garantia contratual do formato), o título inteiro vira `cargo` e
 * `empresa` fica `null` — nunca inventa nome de empresa.
 */
function splitTituloEmpresaCargo(tituloBruto) {
  const t = decodificarEntidades(String(tituloBruto || '')).trim();
  const idx = t.indexOf(':');
  if (idx === -1) return { empresa: null, cargo: t || null };
  const empresa = t.slice(0, idx).trim() || null;
  const cargo = t.slice(idx + 1).trim() || null;
  return { empresa, cargo };
}

/** `AAAA-MM-DD` a partir de uma data RFC822 (`pubDate`/`expires_at`). `null` para ausente/inválida — `new Date(null)` cairia no epoch (1970-01-01) se não guardarmos o `!rfc822` explicitamente antes. */
function dataISO(rfc822) {
  if (!rfc822) return null;
  const d = new Date(rfc822);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/**
 * Converte os blocos `<item>` de UMA categoria em itens brutos no formato
 * que o resto do módulo (e o gate genérico `lib/vaga-mercado.js`) espera.
 * Item sem `link`/`cargo`/`empresa` (título fora do formato "Empresa: Cargo"
 * ou tag `<link>` ausente) é descartado aqui — não dá pra montar um
 * registro útil sem eles (mesmo princípio de `lib/vaga-mercado.js
 * pareceVagaMercado`, aplicado uma camada antes).
 */
function parseFeed(xml, categoriaSlug) {
  const blocos = extrairBlocosItem(xml);
  const itens = [];
  for (const bloco of blocos) {
    const { empresa, cargo } = splitTituloEmpresaCargo(campo(bloco, 'title'));
    const link = campo(bloco, 'link');
    if (!link || !cargo || !empresa) continue;

    itens.push({
      name: cargo,
      jobUrl: link,
      careerPageName: empresa,
      categoriaSlug,
      categoriaWwr: campo(bloco, 'category'),
      guid: campo(bloco, 'guid'),
      pubDate: campo(bloco, 'pubDate'),
      expiresAt: campo(bloco, 'expires_at'),
      regiao: campo(bloco, 'region'),
      estado: campo(bloco, 'state'),
      skills: campo(bloco, 'skills'),
      descricaoHtml: campo(bloco, 'description')
    });
  }
  return { itens, totalBlocos: blocos.length };
}

/**
 * Busca as duas categorias configuradas, dedupe por `jobUrl` (ver cabeçalho
 * — duplicata real observada dentro do próprio feed, e uma vaga poderia em
 * tese aparecer nas duas categorias). `volumeBruto` = total de `<item>` das
 * DUAS categorias antes de qualquer filtro/dedupe — mesmo conceito de
 * `volumeBruto` das outras fontes.
 */
async function coletar() {
  const porLink = new Map();
  let volumeBruto = 0;

  for (const categoria of CATEGORIAS) {
    const url = `${BASE}/categories/${categoria}.rss`;
    let xml;
    try {
      xml = await http.get(url);
    } catch (err) {
      throw new Error(
        `[falha: GET ${categoria}.rss | ${err.message} | conectividade ou o feed pode ter mudado de path | reinspecionar https://weworkremotely.com/categories/${categoria}.rss]`
      );
    }
    const { itens, totalBlocos } = parseFeed(xml, categoria);
    volumeBruto += totalBlocos;
    for (const item of itens) {
      if (!porLink.has(item.jobUrl)) porLink.set(item.jobUrl, item);
    }
  }

  return { itens: Array.from(porLink.values()), volumeBruto };
}

/** Blob usado pelo estágio 3 (`lib/score-mercado.js avaliarAderencia`) — cargo + categoria WWR + skills + descrição (tags removidas). Tudo já em mãos, sem requisição extra. */
function textoParaFiltro(rawItem) {
  return [rawItem.name, rawItem.categoriaWwr, rawItem.skills, limparTags(rawItem.descricaoHtml)].filter(Boolean).join(' \n ');
}

/**
 * Campos preenchíveis só com o item do feed (sem requisição extra — RSS já
 * traz a descrição completa). `subedital`/`classe`/`regime`/`tipo`/`vagas`
 * ficam `null` sempre nesta trilha (mesma decisão de `fontes/gupy.js`/
 * `fontes/programathor.js` — README §Trilha mercado). `stack`/
 * `tipo_contrato`/`faixa_salarial` ficam no baseline honesto do schema
 * (`[]`/`null`/`null`, preenchidos por `schema.js montarRegistro` quando
 * ausentes daqui) — o WWR não expõe nenhum dos três de forma estruturada
 * (skills é texto livre de stack/soft skills misturados, não uma lista de
 * tecnologia confiável tipo o bloco "Habilidades" do JSON-LD do
 * ProgramaThor; salário e tipo de contrato aparecem só dentro da
 * descrição em prosa livre, heterogênea e majoritariamente em inglês —
 * extrair isso por regex é fora de escopo desta onda, mesma decisão já
 * tomada para `titulacao_exigida` da Gupy).
 */
function normalizarParcial(rawItem) {
  const dataPublicacao = dataISO(rawItem.pubDate);
  const campus = rawItem.estado || rawItem.regiao || null;

  return {
    fonte: ID,
    trilha: TRILHA,
    orgao: rawItem.careerPageName || null,
    campus,
    uf: null,
    url: rawItem.jobUrl || null,
    data_publicacao: dataPublicacao,
    inscricao_inicio: dataPublicacao,
    inscricao_fim: dataISO(rawItem.expiresAt),
    texto_bruto: textoParaFiltro(rawItem),
    modalidade: 'remoto',
    senioridade: extratorMercado.extrairSenioridade(rawItem.name),
    subedital: null,
    classe: null,
    regime: null,
    tipo: null,
    vagas: null
  };
}

/** Sem requisição de rede — a descrição completa já veio em `coletar()` (ver cabeçalho). Mantido `async` para respeitar o contrato de fonte. */
async function enriquecer(rawItem) {
  return { texto_bruto: textoParaFiltro(rawItem) };
}

module.exports = {
  id: ID,
  nome: NOME,
  trilha: TRILHA,
  coletar,
  textoParaFiltro,
  normalizarParcial,
  enriquecer,
  // exports internos, úteis para teste sem rede
  _internal: { extrairBlocosItem, campo, splitTituloEmpresaCargo, dataISO, parseFeed, limparTags, decodificarEntidades, CATEGORIAS }
};
