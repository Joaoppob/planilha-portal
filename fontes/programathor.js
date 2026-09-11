'use strict';

const http = require('../lib/http');
const extratorMercado = require('../lib/extrator-mercado');
const keywordsMercado = require('../config/keywords-mercado.json');

/**
 * Coletor do ProgramaThor — segunda fonte da TRILHA MERCADO do radar (Onda 4
 * — ver README §Trilha mercado). ProgramaThor.com.br é um portal de vagas
 * dev/front-end brasileiro; robots.txt permissivo pra `/jobs*` (só bloqueia
 * `/admin/`, `/user/`, `/users/`, `/company/`) e os Termos de Serviço
 * (`/terms`, lidos por completo em 26/08/2026) NÃO têm cláusula de
 * anti-agregação/anti-scraping — diferente da Gupy (que tem cláusula
 * explícita na seção 10, risco assumido por JB especificamente pra aquela
 * fonte). Decisão de Durin registrada no briefing desta onda: sem cláusula
 * proibindo, segue e constrói.
 *
 * MODO DE ACESSO (investigado empiricamente em 26/08/2026) — dois estágios,
 * cada um servido por uma parte DIFERENTE do site:
 *
 * ESTÁGIO 1 — descoberta de vagas por categoria de STACK. O site é Rails
 * server-rendered (não SPA) — HTML puro, sem endpoint JSON de busca. Achado
 * real importante: `/jobs?search=TERMO` (o padrão assumido pela sondagem
 * anterior) é DECORATIVO — testado com um termo real ("IA") e um termo
 * inexistente ("zzzznonexistentterm9999"): as duas buscas devolvem a MESMA
 * listagem e a MESMA última página de paginação (1467). O filtro real do
 * site é por PÁGINA DE CATEGORIA pré-construída, `/jobs-{slug}` (paginação
 * `?page=N`, a partir da página 2) — confirmado comparando títulos de
 * `/jobs-python` (100% relacionados a Python) contra a listagem genérica
 * `/jobs` (mistura tudo). `config/keywords-mercado.json →
 * termos_busca_programathor` é a lista de slugs verificados (cada um
 * checado manualmente contra a página real antes de entrar na lista — vários
 * slugs do sitemap.xml do site, ex. `jobs-ai`/`jobs-rag`/`jobs-design`, NÃO
 * têm vaga nenhuma hoje e foram excluídos, ver comentário no JSON).
 *
 * ESTÁGIO 2 — enriquecimento via JSON-LD estruturado. Cada página de vaga
 * (`/jobs/{id}-{slug}`) publica um bloco `<script type="application/ld+json">`
 * com `@type: JobPosting` (schema.org — usado pelo próprio ProgramaThor pra
 * rich results do Google), contendo `datePosted`, `validThrough`,
 * `employmentType`, `baseSalary` (quando a vaga divulga), `hiringOrganization`,
 * `jobLocation.address`, e uma `description` HTML com um bloco fixo
 * "Habilidades" listando o stack. É o "JSON por trás" que o briefing pediu
 * pra procurar antes de recorrer a regex sobre HTML solto — muito mais
 * confiável que raspar os ícones do card da listagem.
 *
 * ACHADO REAL DE BUG (crítico pro parsing) — o JSON-LD do ProgramaThor tem
 * quebras de linha LITERAIS (não escapadas) dentro do valor da string
 * `description`, o que é JSON inválido (`JSON.parse` estrito lança "Bad
 * control character in string literal"). Confirmado reproduzindo contra 3
 * páginas de vaga reais capturadas em 26/08/2026 — as 3 falham no
 * `JSON.parse` cru. `sanitizarControlChars` abaixo escapa `\n`/`\r`/`\t`
 * SÓ quando ocorrem DENTRO de uma string JSON (rastreando aspas não
 * escapadas) — nunca toca whitespace fora de string (que já é JSON válido).
 *
 * ACHADO REAL DE OPERAÇÃO — páginas de vaga individuais podem devolver
 * HTTP 500 mesmo para uma URL que estava na listagem minutos antes (2 dos
 * ~15 IDs testados nesta sondagem, ex. 33685, 33724 — provavelmente vaga
 * encerrada/removida entre a listagem e o enriquecimento; erro do próprio
 * backend do ProgramaThor, não do coletor). `enriquecer()` NUNCA lança nesse
 * caso — mesmo padrão de `fontes/dou.js enriquecer()`: loga um aviso e
 * devolve `{}`, deixando os dados da listagem (`normalizarParcial`)
 * sobreviverem sozinhos no registro salvo.
 */

const ID = 'programathor';
const NOME = 'ProgramaThor — portal de vagas dev/front-end';
const TRILHA = 'mercado';
const BASE = 'https://programathor.com.br';

const MAX_PAGINAS_POR_CATEGORIA = 2; // ~15 vagas/página observadas -> teto de ~30/categoria; recência domina o score (lib/score-mercado.js), então profundidade rasa é intencional — ver README
const THROTTLE_MS = 400; // mesmo espírito do throttle de fontes/gupy.js — entre CADA requisição (listagem e detalhe)

function esperar(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Nome completo do estado (como o JSON-LD às vezes devolve em
// `addressLocality`, ex. "Cuiabá, Mato Grosso") -> sigla UF. Cópia local
// deliberada (não importa de fontes/gupy.js nem de lib/uf-lookup.js) — mesmo
// raciocínio já documentado em fontes/gupy.js: aqui os dois formatos
// observados (`Cidade/UF` e `Cidade, Nome do Estado`) são campo ESTRUTURADO
// de uma fonte diferente, não texto livre de edital; um lookup direto e
// local é mais simples e mais correto que reaproveitar heurística de texto
// livre ou acoplar duas fontes de mercado por um utilitário compartilhado
// que nenhuma das duas pediu.
const UF_POR_ESTADO = {
  acre: 'AC', alagoas: 'AL', amapa: 'AP', amazonas: 'AM', bahia: 'BA', ceara: 'CE',
  'distrito federal': 'DF', 'espirito santo': 'ES', goias: 'GO', maranhao: 'MA',
  'mato grosso': 'MT', 'mato grosso do sul': 'MS', 'minas gerais': 'MG', para: 'PA',
  paraiba: 'PB', parana: 'PR', pernambuco: 'PE', piaui: 'PI', 'rio de janeiro': 'RJ',
  'rio grande do norte': 'RN', 'rio grande do sul': 'RS', rondonia: 'RO', roraima: 'RR',
  'santa catarina': 'SC', 'sao paulo': 'SP', sergipe: 'SE', tocantins: 'TO'
};

function semAcento(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

function ufDoEstado(nomeEstado) {
  if (!nomeEstado) return null;
  return UF_POR_ESTADO[semAcento(nomeEstado)] || null;
}

/** Decodifica só as entidades HTML realmente observadas no site (o resto do texto já vem em UTF-8 cru, acentuado). */
function decodificarEntidades(texto) {
  return String(texto || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

/** Remove QUALQUER tag HTML e normaliza espaço — usado tanto no título do card (que pode ter spans de badge aninhados) quanto na `description` do JSON-LD (que é HTML). */
function limparTags(html) {
  return decodificarEntidades(String(html || '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Sanitiza controle de caracteres (`\n`/`\r`/`\t` LITERAIS) só quando
 * ocorrem DENTRO de uma string JSON — rastreia aspas não escapadas pra
 * saber se está "dentro" ou "fora" de uma string, sem tentar entender a
 * gramática JSON inteira. Ver comentário de topo do arquivo pro achado real
 * que motivou isto (JSON.parse cru falha nos 3 casos reais capturados).
 */
function sanitizarControlChars(texto) {
  let resultado = '';
  let dentroString = false;
  let escapando = false;
  const t = String(texto || '');
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (dentroString) {
      if (escapando) {
        resultado += ch;
        escapando = false;
        continue;
      }
      if (ch === '\\') {
        resultado += ch;
        escapando = true;
        continue;
      }
      if (ch === '"') {
        dentroString = false;
        resultado += ch;
        continue;
      }
      if (ch === '\n') {
        resultado += '\\n';
        continue;
      }
      if (ch === '\r') {
        resultado += '\\r';
        continue;
      }
      if (ch === '\t') {
        resultado += '\\t';
        continue;
      }
      resultado += ch;
    } else {
      if (ch === '"') {
        dentroString = true;
      }
      resultado += ch;
    }
  }
  return resultado;
}

/**
 * Varre todos os blocos `<script type="application/ld+json">` da página de
 * detalhe e devolve o primeiro que for `@type: JobPosting` (a página também
 * publica um bloco `BreadcrumbList` separado — precisa distinguir, não
 * assumir que o primeiro `<script ld+json>` é sempre o certo). Sanitiza
 * antes de cada tentativa de parse (ver `sanitizarControlChars`). Retorna
 * `null` quando não encontra nenhum (formato da página mudou) — nunca lança,
 * quem chama (`enriquecer`) trata como "sem enriquecimento" e degrada pros
 * dados da listagem.
 */
function extrairJobPosting(html) {
  const re = /<script type="application\/ld\+json">\s*([\s\S]*?)<\/script>/g;
  let match;
  while ((match = re.exec(html))) {
    try {
      const obj = JSON.parse(sanitizarControlChars(match[1]));
      if (obj && obj['@type'] === 'JobPosting') return obj;
    } catch {
      // bloco malformado além do que o sanitizador cobre — tenta o próximo bloco ld+json da página
    }
  }
  return null;
}

/**
 * Extrai texto de um ícone Font Awesome específico dentro de um bloco de
 * card (ex.: `iconeSlug='briefcase'` casa `class='fa fa-briefcase'` OU
 * `class="fas fa-briefcase"` — aspas simples/duplas, prefixo fa/fas/far
 * tolerado, já que o site mistura os três no mesmo card).
 */
function extrairSpanIcone(bloco, iconeSlug) {
  const re = new RegExp(`fa-${iconeSlug}['"][^>]*><\\/i>([^<]*)`, 'i');
  const m = bloco.match(re);
  return m ? decodificarEntidades(m[1]).replace(/\s+/g, ' ').trim() || null : null;
}

/**
 * O texto do ícone de localização vem em 2 formatos observados: `"Remoto"`
 * puro (sem parênteses), ou `"Cidade[/UF]  (Modalidade)"`. Nunca inventa —
 * texto fora desses 2 formatos vira `{ local: texto, modalidade: null }`
 * (local bruto preservado, modalidade honesta como desconhecida).
 */
function parseLocalModalidade(textoLocal) {
  if (!textoLocal) return { local: null, modalidade: null };
  const t = textoLocal.replace(/\s+/g, ' ').trim();
  if (/^remoto$/i.test(t)) return { local: null, modalidade: 'remoto' };
  const m = t.match(/^(.*?)\s*\((H[ií]brido|Remoto|Presencial)\)\s*$/i);
  if (m) {
    const rotulo = semAcento(m[2]);
    const modalidade = rotulo === 'hibrido' ? 'hibrido' : rotulo === 'remoto' ? 'remoto' : 'presencial';
    return { local: m[1].trim() || null, modalidade };
  }
  return { local: t || null, modalidade: null };
}

/** `"Cidade/UF"` (formato da listagem E de parte dos JSON-LD) -> `{ cidade, uf }`; sem o padrão, `uf` fica null (nunca inventa). */
function cidadeUfPorBarra(local) {
  if (!local) return { cidade: null, uf: null };
  const m = local.match(/^(.*)\/([A-Z]{2})$/);
  if (m) return { cidade: m[1].trim(), uf: m[2] };
  return { cidade: local.trim() || null, uf: null };
}

/**
 * `addressLocality` do JSON-LD observado em 2 formatos adicionais ao de
 * barra acima: `"Cidade, Nome do Estado"` (ex.: "Cuiabá, Mato Grosso") —
 * resolve via `ufDoEstado`; ou cidade pura sem UF nenhuma (ex.: "São
 * Paulo") — fica `uf: null` (não presume que "São Paulo" cidade é SP
 * estado sem sinal explícito, mesma doutrina de nunca inventar).
 */
function cidadeUfDeAddressLocality(addressLocality) {
  if (!addressLocality) return { cidade: null, uf: null };
  const porBarra = cidadeUfPorBarra(addressLocality);
  if (porBarra.uf) return porBarra;
  const m = addressLocality.match(/^(.*),\s*([^,]+)$/);
  if (m) {
    const uf = ufDoEstado(m[2].trim());
    if (uf) return { cidade: m[1].trim(), uf };
  }
  return { cidade: addressLocality.trim() || null, uf: null };
}

async function buscarPaginaCategoria(categoria, pagina) {
  const url = pagina === 1 ? `${BASE}/jobs-${categoria}` : `${BASE}/jobs-${categoria}?page=${pagina}`;
  let html;
  try {
    html = await http.get(url);
  } catch (err) {
    throw new Error(
      `[falha: GET jobs-${categoria} pagina=${pagina} | ${err.message} | conectividade, ou o slug de categoria pode ter mudado/deixado de existir | reinspecionar https://programathor.com.br/jobs-${categoria} e ajustar config/keywords-mercado.json → termos_busca_programathor]`
    );
  }
  return parseListagem(html);
}

/**
 * Extrai os cards de vaga de uma página de listagem. Cada card é
 * `<a href="/jobs/{id}-{slug}">...</a>` — localiza cada link, fatia um
 * bloco de HTML logo após ele (até o próximo link de vaga, ou um teto de
 * 4000 chars — cinto de segurança contra um card com HTML anormalmente
 * grande estourar o fatiamento) e extrai título/empresa/local de dentro
 * desse bloco. Página sem nenhum link de vaga (categoria esgotada, ou
 * página além do fim real) devolve array vazio — é o sinal de parada que
 * `buscarCategoria` usa.
 */
function parseListagem(html) {
  const linkRe = /<a href="\/jobs\/(\d+)-([a-z0-9-]+)"/gi;
  const posicoes = [];
  let match;
  while ((match = linkRe.exec(html))) {
    posicoes.push({ ptId: match[1], slug: match[2], index: match.index });
  }

  const itens = [];
  for (let i = 0; i < posicoes.length; i++) {
    const inicio = posicoes[i].index;
    const fimBruto = i + 1 < posicoes.length ? posicoes[i + 1].index : html.length;
    const bloco = html.slice(inicio, Math.min(fimBruto, inicio + 4000));

    const tituloMatch = bloco.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i);
    const name = tituloMatch ? limparTags(tituloMatch[1]) : null;
    const careerPageName = extrairSpanIcone(bloco, 'briefcase');
    const localBruto = extrairSpanIcone(bloco, 'map-marker-alt');

    itens.push({
      ptId: posicoes[i].ptId,
      slug: posicoes[i].slug,
      name,
      jobUrl: `${BASE}/jobs/${posicoes[i].ptId}-${posicoes[i].slug}`,
      careerPageName,
      localBruto,
      country: 'Brasil' // ProgramaThor não tem noção de vaga internacional (site 100% dev BR) — nunca observado nenhum sinal de país fora do Brasil nesta sondagem
    });
  }
  return itens;
}

async function buscarCategoria(categoria) {
  const itens = [];
  for (let pagina = 1; pagina <= MAX_PAGINAS_POR_CATEGORIA; pagina++) {
    const itensPagina = await buscarPaginaCategoria(categoria, pagina);
    if (itensPagina.length === 0) break;
    itens.push(...itensPagina);
    if (pagina < MAX_PAGINAS_POR_CATEGORIA) await esperar(THROTTLE_MS);
  }
  return itens;
}

/**
 * Varre `termos_busca_programathor` (config/keywords-mercado.json), dedupe
 * por `ptId` numérico entre categorias (a mesma vaga aparece em várias
 * categorias — ex. uma vaga React+TypeScript bate em `jobs-react` E
 * `jobs-typescript`). `volumeBruto` = total de itens únicos encontrados
 * antes do estágio 1/3 — mesmo conceito de `fontes/gupy.js coletar()`.
 */
async function coletar() {
  const porId = new Map();
  const categorias = keywordsMercado.termos_busca_programathor || [];

  for (const categoria of categorias) {
    const itensCategoria = await buscarCategoria(categoria);
    for (const item of itensCategoria) {
      if (item && item.ptId != null && !porId.has(item.ptId)) porId.set(item.ptId, item);
    }
    await esperar(THROTTLE_MS);
  }

  const itens = Array.from(porId.values());
  return { itens, volumeBruto: itens.length };
}

/**
 * Blob usado pelo estágio 3 (lib/score-mercado.js avaliarAderencia) quando
 * nem `enriquecer()` nem `normalizarParcial()` já trouxerem um texto_bruto
 * (fallback de último recurso, ver README §Como adicionar uma fonte nova) —
 * só o título, já que é tudo que a listagem garante sem o fetch de detalhe.
 */
function textoParaFiltro(rawItem) {
  return (rawItem && rawItem.name) || '';
}

/**
 * Campos preenchíveis só com o item da LISTAGEM (sem requisição extra) —
 * baseline honesto, sobrescrito por `enriquecer()` quando o fetch de
 * detalhe funcionar (ver radar.js `processarItensFonte`, mercado: `extra`
 * sempre vence `parcial` no merge). `subedital`/`classe`/`regime`/`tipo`/
 * `vagas` ficam `null` sempre nesta trilha (mesma decisão de fontes/gupy.js
 * — README §Trilha mercado). `stack`/`tipo_contrato`/`faixa_salarial`
 * (campos novos desta onda, ver lib/schema.js) ficam no baseline honesto —
 * `stack: []`/os outros dois `null` — porque a listagem não expõe stack
 * estruturado nem contrato nem salário com confiança (o card TEM ícones pra
 * isso, mas este coletor deliberadamente não os raspa — ver README, "por
 * que a listagem não é raspada ícone a ícone": o JSON-LD da página de
 * detalhe é a fonte estruturada e confiável pra esses três campos).
 */
function normalizarParcial(rawItem) {
  const { local, modalidade } = parseLocalModalidade(rawItem.localBruto);
  const { cidade, uf } = cidadeUfPorBarra(local);

  return {
    fonte: ID,
    trilha: TRILHA,
    orgao: rawItem.careerPageName || null,
    campus: cidade,
    uf,
    url: rawItem.jobUrl,
    data_publicacao: null, // só o JSON-LD (enriquecer) afirma isso com confiança — listagem não tem data
    inscricao_inicio: null,
    inscricao_fim: null,
    texto_bruto: textoParaFiltro(rawItem),
    modalidade,
    senioridade: extratorMercado.extrairSenioridade(rawItem.name),
    stack: [],
    tipo_contrato: null,
    faixa_salarial: null,
    subedital: null,
    classe: null,
    regime: null,
    tipo: null,
    vagas: null
  };
}

/**
 * Busca a página de detalhe da vaga e extrai o bloco JSON-LD `JobPosting`
 * (ver comentário de topo do arquivo). NUNCA lança — falha de rede, HTTP
 * não-200 (inclusive os 500 reais observados nesta sondagem pra vaga
 * removida/encerrada) ou bloco JSON-LD ausente/malformado além do que o
 * sanitizador cobre degradam pra `{}` (dados da listagem sobrevivem
 * sozinhos), com um aviso no console — mesmo padrão de `fontes/dou.js
 * enriquecer()`.
 *
 * Deliberadamente NÃO retorna `modalidade` — o JSON-LD do ProgramaThor não
 * tem campo de modalidade nenhum (sem `jobLocationType`/`TELECOMMUTE`,
 * confirmado nos 3 casos reais capturados); a única fonte confiável pra
 * modalidade é o ícone de localização da LISTAGEM (`normalizarParcial`).
 * Omitir a chave (em vez de setar `undefined` explícito) é o que garante
 * que o merge de radar.js (`{...parcial, ...extra}`) preserve o valor de
 * `parcial.modalidade` — um `modalidade: undefined` explícito aqui
 * SOBRESCREVERIA o valor de parcial mesmo assim (comportamento do spread do
 * JS), por isso o cuidado de nunca incluir a chave.
 */
/**
 * Função PURA: dado um objeto `JobPosting` já parseado (ver
 * `extrairJobPosting`) e o `rawItem` da listagem (fallback de nome/empresa),
 * monta os campos que `enriquecer()` devolve. Extraída à parte de propósito
 * — é a peça de lógica/mapeamento que vale testar sem rede (a parte de
 * rede em si, `http.get`, não tem lógica pra testar, só I/O).
 */
function montarEnriquecimento(jobPosting, rawItem) {
  const descricaoLimpa = limparTags(jobPosting.description);
  const texto = [jobPosting.title || (rawItem && rawItem.name), descricaoLimpa].filter(Boolean).join(' \n ');
  const address = jobPosting.jobLocation && jobPosting.jobLocation.address;
  const { cidade, uf } = cidadeUfDeAddressLocality(address && address.addressLocality);

  return {
    texto_bruto: texto || null,
    orgao: (jobPosting.hiringOrganization && jobPosting.hiringOrganization.name) || (rawItem && rawItem.careerPageName) || null,
    campus: cidade,
    uf,
    data_publicacao: jobPosting.datePosted || null,
    inscricao_inicio: jobPosting.datePosted || null, // vaga de mercado não tem "início de inscrição" formal separado — mesma leitura honesta de fontes/gupy.js
    inscricao_fim: jobPosting.validThrough || null,
    tipo_contrato: extratorMercado.mapearTipoContrato(jobPosting.employmentType),
    faixa_salarial: extratorMercado.formatarFaixaSalarial(jobPosting.baseSalary),
    stack: extratorMercado.extrairStackDaDescricao(jobPosting.description)
  };
}

async function enriquecer(rawItem) {
  let html;
  try {
    html = await http.get(rawItem.jobUrl);
  } catch (err) {
    console.warn(`[programathor] enriquecer: falha de rede em ${rawItem.jobUrl} — ${err.message} — usando dados da listagem`);
    return {};
  }

  const jobPosting = extrairJobPosting(html);
  if (!jobPosting) {
    console.warn(`[programathor] enriquecer: bloco JobPosting não encontrado/parseável em ${rawItem.jobUrl} — usando dados da listagem`);
    return {};
  }

  return montarEnriquecimento(jobPosting, rawItem);
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
  _internal: {
    sanitizarControlChars,
    extrairJobPosting,
    parseListagem,
    parseLocalModalidade,
    cidadeUfPorBarra,
    cidadeUfDeAddressLocality,
    ufDoEstado,
    limparTags,
    montarEnriquecimento,
    MAX_PAGINAS_POR_CATEGORIA
  }
};
