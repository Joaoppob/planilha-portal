'use strict';

const http = require('../lib/http');
const extratorMercado = require('../lib/extrator-mercado');
const keywordsMercado = require('../config/keywords-mercado.json');

/**
 * Coletor do Vagas.com — board de vagas nacional (Onda 13, trilha MERCADO
 * — ver `fontes-reconhecimento-3.md` §Trilha EMPREGO ficha 1 pro relato
 * completo do levantamento, e RELATORIO-ONDA-12-13.md pra validação HTTP
 * real que motivou a adoção).
 *
 * MODO DE ACESSO (validado com `lib/http.js` real, 28/08/2026 — nunca com
 * `mcp__donsetch__web_fetch`, degradado nesta sessão — ver C8 do plano):
 *
 *   GET https://www.vagas.com.br/vagas-de-{slug}[?pagina=N]
 *
 * HTML server-rendered (raro entre boards BR modernos — a maioria é SPA
 * client-side, ver `_comentario_termos_busca_vagascom` em
 * config/keywords-mercado.json pras fontes SPA descartadas nesta rodada) —
 * `lib/http.js get()` (mesmo UA de navegador de todas as outras fontes)
 * já basta, sem header adicional, sem bloqueio observado. Cada card é um
 * bloco `<li class="vaga ...">` com TODOS os 4 campos do hash de dedupe
 * (cargo, empresa, data, URL) na própria listagem — nenhuma fonte de
 * mercado já adotada (Gupy/ProgramaThor/WWR) tem os 4 sem enriquecimento;
 * esta é a primeira.
 *
 * PAGINAÇÃO: `<link rel='next' href='?pagina=2' />` confirmado real
 * (página 1 e página 2 de "design" devolvem `data-id-vaga` DIFERENTES,
 * testado). `buscarTermo` pagina até `MAX_PAGINAS_POR_TERMO` ou até uma
 * página vir com MENOS blocos que `TAMANHO_PAGINA_ESPERADO` (fim real dos
 * resultados) — mesmo desenho de `fontes/gupy.js buscarTermo` (nunca confia
 * num contador de total exposto pela própria página, só no tamanho da
 * página recebida).
 *
 * TERMOS DE BUSCA — `config/keywords-mercado.json → termos_busca_vagascom`
 * (lista PRÓPRIA e ADITIVA, mesmo padrão de `termos_busca_programathor`):
 * o slug da URL (`/vagas-de-{slug}`) é o termo de busca — termos genéricos
 * demais ("produto": 1386 vagas declaradas; "dados": 803) foram
 * DELIBERADAMENTE excluídos da lista (mesmo achado já documentado pra Gupy
 * — "termo genérico demais retorna centenas fora de escopo"; aqui o custo
 * é paginação desperdiçada, não falso-positivo de área, já que o estágio 3
 * filtra depois — mas ainda assim não vale o custo de rede).
 *
 * MODALIDADE: a listagem não tem um campo estruturado tipo `workplaceType`
 * da Gupy (`lib/extrator-mercado.js extrairModalidade` foi checado e NÃO
 * se aplica aqui — espera `rawItem.workplaceType`/`isRemoteWork`, campos
 * que esta fonte não tem). `modalidadeDoLocal` abaixo é uma heurística
 * PRÓPRIA e local sobre o texto de `vaga-local` ("100% Home Office" ->
 * remoto; "Home Office"/"Híbrido" sem o "100%" -> hibrido; "Cidade / UF"
 * -> presencial) — best-effort, documentado como tal, nunca inventa quando
 * o texto não se encaixa em nenhum padrão.
 *
 * `empresa: 'Confidencial'` é um valor REAL da fonte (empregador optou por
 * não se identificar na listagem) — preservado como está, não vira `null`
 * (a fonte afirma algo, "confidencial" é a informação, não a ausência
 * dela).
 *
 * ENRIQUECIMENTO (conserto do filtro de aderência, 09/09/2026 — briefing de
 * Durin: "o vagas.com julga a vaga pela DESCRIÇÃO, como as outras 3 fontes
 * de mercado"). Até aqui `enriquecer()` nunca fazia requisição nenhuma — o
 * estágio 2 (`lib/score-mercado.js avaliarAderencia`) avaliava só
 * título+local (30-85 chars), contra 1.175-24.202 chars nas outras fontes;
 * causa estrutural da menor aderência das quatro. A página de detalhe (`GET
 * jobUrl`) publica um `<script type="application/ld+json">` com `@type:
 * JobPosting` (`title`/`description`/`datePosted`/`validThrough`/
 * `hiringOrganization`/`jobLocation` — mesmo padrão schema.org já usado por
 * `fontes/programathor.js`, mas SEM a description em HTML: 6 páginas reais
 * capturadas em 09/09/2026 (`Analista Design Gráfico Jr`, `Analista de
 * Marketing (Design) Pleno`, `Estagiário(a) de Design/Arte Monet`,
 * `Designer Gráfico Jr`, `Designer Gráfico`, `Motion Designer`) vieram com
 * `description` em TEXTO PURO, sem tag nem entidade HTML — diferente do
 * ProgramaThor. `limparTagsGenerico`/sanitização de controle de caracteres
 * abaixo são mantidos mesmo assim, só como defesa (mesma classe de bug já
 * vista real no ProgramaThor — JSON-LD com quebra de linha literal dentro
 * de string —, nunca reproduzida aqui nas amostras capturadas, mas o custo
 * de manter a defesa é zero).
 *
 * DEGRADAÇÃO HONESTA (obrigatória pelo briefing — "vaga julgada por 40
 * chars não pode parecer vaga julgada por 4000"): falha de rede, bloco
 * JobPosting ausente/malformado, ou `description` vazia — `enriquecer`
 * NUNCA lança (mesmo contrato de `fontes/dou.js`/`fontes/programathor.js`
 * `enriquecer()`), degrada pro texto da listagem (`textoParaFiltro`) E
 * marca `extracao: 'fallback_listagem'` no registro salvo — campo já
 * existente no schema (`lib/schema.js` CAMPOS_MINIMOS, hoje só usado pela
 * trilha docente com o valor `'formato_nao_reconhecido'`; aqui é um valor
 * NOVO e não-colidente, a trilha (`'mercado'` vs `'docente'`) já desambigua
 * quem escreveu o quê — nenhum consumidor existente checa por este valor
 * específico). Visível pra JB na planilha (`lib/sheets.js` coluna
 * `extracao`), sem precisar tocar `lib/`.
 *
 * THROTTLE DO DETALHE — achado real ao ler `radar.js processarItensFonte`:
 * o `await sleep(300)` entre itens (linha ~231) só existe no ramo DOCENTE
 * do loop — o ramo `trilha === 'mercado'` (linhas ~178-214) chama
 * `fonte.enriquecer(rawItem)` e segue direto pro próximo item, SEM pausa
 * nenhuma inserida por `radar.js`. Isso valia enquanto nenhuma fonte de
 * mercado fazia requisição em `enriquecer()`; agora que este arquivo faz,
 * a pausa "coletor educado" tem que morar AQUI (mesmo `THROTTLE_MS`/
 * `esperar` já usados pra paginação/termos acima) — nunca em `radar.js`
 * (fora da lista de arquivos autorizados nesta onda).
 */

const ID = 'vagas';
const NOME = 'Vagas.com — busca por termo';
const TRILHA = 'mercado';
const BASE = 'https://www.vagas.com.br';

/**
 * CHAVE DE ENRIQUECIMENTO POR REDE — desligada por padrão (09/09/2026:
 * `/vagas/{id}` está sob bloqueio de WAF por IP, confirmado com `fetch`
 * nativo E com browser real via camofox — mesma página de desafio/CAPTCHA
 * nos dois. `RadarAcademicoJB` roda 3x/dia no Task Scheduler; deixar ligado
 * martelaria o endpoint 3x/dia e arrisca escalar o bloqueio pra listagem
 * também, que hoje ainda responde 200 — ver relatório de Mav pra Durin,
 * mesma data). Com `false`, `enriquecer()` NUNCA faz requisição — devolve o
 * texto da listagem e marca `extracao: 'fallback_listagem'`, EXATAMENTE
 * como já fazia todo caminho de falha de rede (nenhum comportamento novo,
 * só o fallback existente assumido como default). O código de
 * enriquecimento real (`extrairJobPosting`/`montarEnriquecimento`/GET real)
 * continua íntegro e testado (`tests/vagas-parsing.test.js`), só não roda.
 *
 * PRA RELIGAR (só depois do teste frio de IP descansado confirmar taxa de
 * sucesso aceitável — não religar por impaciência): trocar a linha abaixo
 * pra `true`. Uma linha, nada mais.
 */
const ENRIQUECER_VIA_REDE = false; // true = liga o GET real em /vagas/{id}; false = fallback pro texto da listagem, sem rede (default atual)

const MAX_PAGINAS_POR_TERMO = 3; // teto de segurança (~120 itens/termo no pior caso) — mesmo espírito de fontes/gupy.js MAX_PAGINAS_POR_TERMO
const TAMANHO_PAGINA_ESPERADO = 40; // observado real: página cheia = 40 <li class="vaga"> (design/ia/dados/produto, todos com 40 na página 1); termo menos popular vem com menos e já sinaliza fim
const THROTTLE_MS = 400; // coletor educado, mesmo valor de fontes/gupy.js

function esperar(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Slug de URL a partir do termo de busca — minúsculo, sem acento, espaço vira hífen. `config/keywords-mercado.json termos_busca_vagascom` já guarda os termos como slug pronto, então isto é idempotente pra eles (defensivo, não custa nada). */
function paraSlug(termo) {
  return String(termo || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-');
}

function decodificarEntidades(texto) {
  return String(texto || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

/** Remove `<mark>...</mark>` (destaque do termo buscado no HTML) sem perder o texto — a busca por "design" envolve o próprio "Design" em `<mark>`, dentro do título e da descrição. */
function limparMarcacao(texto) {
  return decodificarEntidades(String(texto || '').replace(/<\/?mark>/gi, ''))
    .replace(/\s+/g, ' ')
    .trim();
}

/** Extrai os blocos `<li class="vaga ...">...</li>` de uma página de listagem. */
function extrairBlocosVaga(html) {
  const blocos = [];
  const re = /<li class="vaga[^"]*">([\s\S]*?)<\/li>/g;
  let m;
  while ((m = re.exec(html))) blocos.push(m[1]);
  return blocos;
}

const RE_LINK = /<a class="link-detalhes-vaga" data-id-vaga="(\d+)"\s+title="([^"]*)"[^>]*href="([^"]*)"/;
const RE_EMPRESA = /emprVaga">\s*([^<]*?)\s*<\/span>/;
// Achado real (28/08/2026): parte dos cards tem um `<div class="tooltip-place">`
// ANINHADO dentro do `<span class="vaga-local">`, logo depois do texto do
// local — exigir `</span>` imediatamente depois do texto (como a versão
// anterior fazia) falhava silenciosamente pra esses casos. Captura só até
// a próxima tag `<`, seja ela `</span>` ou a abertura da tooltip.
const RE_LOCAL = /vaga-local">\s*<i[^>]*><\/i>\s*([^<]*)/;
const RE_DATA = /data-publicacao">.*?<\/i>\s*([^<]*?)\s*<\/span>/;
const RE_UF_NO_LOCAL = /\/\s*([A-Z]{2})\s*$/;

/**
 * Converte um bloco de `<li>` em item bruto. `null` quando faltar o link
 * principal (`data-id-vaga`/`title`/`href`) — sem eles não dá pra montar um
 * registro útil (mesmo princípio de `fontes/weworkremotely.js parseFeed`).
 */
function parseBlocoVaga(bloco) {
  const mLink = bloco.match(RE_LINK);
  if (!mLink) return null;
  const id = mLink[1];
  const cargo = limparMarcacao(mLink[2]);
  const href = mLink[3];
  if (!cargo || !href) return null;

  const mEmpresa = bloco.match(RE_EMPRESA);
  const mLocal = bloco.match(RE_LOCAL);
  const mData = bloco.match(RE_DATA);

  const local = mLocal ? limparMarcacao(mLocal[1]) : null;
  const mUf = local ? local.match(RE_UF_NO_LOCAL) : null;

  return {
    idVaga: id,
    name: cargo,
    jobUrl: `${BASE}${href.startsWith('/') ? href : `/${href}`}`,
    careerPageName: mEmpresa ? limparMarcacao(mEmpresa[1]) || null : null,
    local,
    uf: mUf ? mUf[1] : null,
    dataPublicacaoBruta: mData ? mData[1].trim() : null
  };
}

/** Ver "MODALIDADE" no cabeçalho do arquivo. `null` quando o texto não se encaixa em nenhum dos 3 padrões — nunca inventa presencial/híbrido/remoto sem sinal textual. */
function modalidadeDoLocal(local) {
  const t = String(local || '');
  if (/100%\s*home\s*office|totalmente\s*remoto|100%\s*remoto/i.test(t)) return 'remoto';
  if (/home\s*office|h[ií]brido/i.test(t)) return 'hibrido';
  if (RE_UF_NO_LOCAL.test(t)) return 'presencial';
  return null;
}

/**
 * "DD/MM/AAAA" | "Ontem" | "Hoje" | "Há N dia(s)" — os 4 formatos reais
 * observados na coluna `data-publicacao` (28/08/2026). Relativo resolvido
 * contra `agora` (parâmetro, não `new Date()` direto — testável sem
 * depender do relógio real). `null` para formato desconhecido — nunca
 * inventa uma data.
 */
function dataPublicacaoISO(bruta, agora = new Date()) {
  const t = String(bruta || '').trim();
  if (!t) return null;

  const mNumerica = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (mNumerica) return `${mNumerica[3]}-${mNumerica[2]}-${mNumerica[1]}`;

  const base = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate()));
  if (/^hoje$/i.test(t)) return base.toISOString().slice(0, 10);
  if (/^ontem$/i.test(t)) {
    base.setUTCDate(base.getUTCDate() - 1);
    return base.toISOString().slice(0, 10);
  }
  const mRelativa = t.match(/^h[áa]\s+(\d+)\s+dias?$/i);
  if (mRelativa) {
    base.setUTCDate(base.getUTCDate() - parseInt(mRelativa[1], 10));
    return base.toISOString().slice(0, 10);
  }
  return null;
}

async function buscarPagina(slug, pagina) {
  const url = pagina <= 1 ? `${BASE}/vagas-de-${slug}` : `${BASE}/vagas-de-${slug}?pagina=${pagina}`;
  let html;
  try {
    html = await http.get(url);
  } catch (err) {
    throw new Error(
      `[falha: GET vagas-de-${slug} (pagina=${pagina}) | ${err.message} | conectividade ou o endpoint pode ter mudado | reinspecionar https://www.vagas.com.br/vagas-de-${slug} e ajustar fontes/vagas.js]`
    );
  }
  return extrairBlocosVaga(html).map(parseBlocoVaga).filter(Boolean);
}

/**
 * Busca todas as páginas de um termo (até `MAX_PAGINAS_POR_TERMO` ou até a
 * página vir menor que `TAMANHO_PAGINA_ESPERADO`) — mesmo desenho de
 * `fontes/gupy.js buscarTermo`.
 */
async function buscarTermo(termo) {
  const slug = paraSlug(termo);
  const itens = [];
  for (let pagina = 1; pagina <= MAX_PAGINAS_POR_TERMO; pagina++) {
    const itensPagina = await buscarPagina(slug, pagina);
    itens.push(...itensPagina);
    if (itensPagina.length < TAMANHO_PAGINA_ESPERADO) break;
    await esperar(THROTTLE_MS);
  }
  return itens;
}

/**
 * Varre `termos_busca_vagascom` (config/keywords-mercado.json), dedupe por
 * `idVaga` (numérico, embutido na URL — `data-id-vaga`) entre termos.
 * `volumeBruto` = total de itens ÚNICOS antes de qualquer filtro do radar
 * (estágio 1/3) — mesma convenção de `fontes/gupy.js coletar`.
 */
async function coletar() {
  const porId = new Map();
  const termos = keywordsMercado.termos_busca_vagascom || [];

  for (const termo of termos) {
    const itensTermo = await buscarTermo(termo);
    for (const item of itensTermo) {
      if (item && item.idVaga != null && !porId.has(item.idVaga)) porId.set(item.idVaga, item);
    }
    await esperar(THROTTLE_MS);
  }

  const itens = Array.from(porId.values());
  return { itens, volumeBruto: itens.length };
}

/** Blob usado pelo estágio 3 (`lib/score-mercado.js avaliarAderencia`) — cargo + local (a listagem não traz descrição completa, só o card; ver `enriquecer` abaixo). */
function textoParaFiltro(rawItem) {
  return [rawItem.name, rawItem.local].filter(Boolean).join(' \n ');
}

/**
 * Campos preenchíveis só com o item da listagem — os 4 do hash de dedupe já
 * vêm sem enriquecimento (ver cabeçalho). `subedital`/`classe`/`regime`/
 * `tipo`/`vagas` ficam `null` sempre nesta trilha (mesma decisão de
 * `fontes/gupy.js`/`fontes/weworkremotely.js` — README §Trilha mercado).
 */
function normalizarParcial(rawItem) {
  const dataPublicacao = dataPublicacaoISO(rawItem.dataPublicacaoBruta);
  return {
    fonte: ID,
    trilha: TRILHA,
    orgao: rawItem.careerPageName,
    campus: rawItem.local,
    uf: rawItem.uf,
    url: rawItem.jobUrl,
    data_publicacao: dataPublicacao,
    inscricao_inicio: dataPublicacao,
    inscricao_fim: null,
    texto_bruto: textoParaFiltro(rawItem),
    modalidade: modalidadeDoLocal(rawItem.local),
    senioridade: extratorMercado.extrairSenioridade(rawItem.name),
    subedital: null,
    classe: null,
    regime: null,
    tipo: null,
    vagas: null
  };
}

/**
 * Sanitiza controle de caracteres (`\n`/`\r`/`\t` LITERAIS) só quando
 * ocorrem DENTRO de uma string JSON — cópia local da mesma função de
 * `fontes/programathor.js` (ver comentário de topo "ENRIQUECIMENTO" —
 * defesa contra a mesma classe de bug já vista real lá, nunca reproduzida
 * aqui nas amostras capturadas; `fontes/` não importa de `fontes/` irmã, é
 * mais barato copiar as ~30 linhas puras que criar acoplamento lateral que
 * ninguém pediu).
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

/** Remove qualquer tag HTML residual e decodifica entidades — defensivo: a `description` do JSON-LD observada em amostra real (09/09/2026, 6 páginas) já vem em texto puro, sem tag nenhuma, mas nada garante que TODA vaga do site seja assim. Mesmo padrão de `fontes/programathor.js limparTags`. */
function limparTagsGenerico(texto) {
  return decodificarEntidades(String(texto || '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Varre os blocos `<script type="application/ld+json">` da página de
 * detalhe e devolve o primeiro que for `@type: JobPosting` — a página
 * TAMBÉM publica um bloco `@type: WebSite` solto no `<head>` (achado real,
 * ver amostra capturada), então não dá pra assumir que o primeiro bloco
 * ld+json da página é sempre o certo. `null` quando não encontra nenhum
 * (formato da página mudou) — nunca lança, quem chama (`enriquecer`) trata
 * como "sem enriquecimento" e degrada pro texto da listagem.
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
 * Função PURA: dado um `JobPosting` já parseado e o `rawItem` da listagem
 * (fallback de nome), monta o texto completo pro estágio 3. Extraída à
 * parte pra ser testável sem rede — mesmo padrão de
 * `fontes/programathor.js montarEnriquecimento`.
 */
function montarEnriquecimento(jobPosting, rawItem) {
  const descricaoLimpa = limparTagsGenerico(jobPosting.description);
  const texto = [jobPosting.title || (rawItem && rawItem.name), descricaoLimpa].filter(Boolean).join(' \n ');
  return { texto_bruto: texto || null, descricaoLimpa };
}

/**
 * Busca a página de detalhe da vaga (`GET rawItem.jobUrl`) e extrai o texto
 * completo do bloco JSON-LD `JobPosting` (ver comentário "ENRIQUECIMENTO"
 * no topo do arquivo). NUNCA lança — falha de rede, HTTP não-200 (o
 * ProgramaThor já mostrou HTTP 500 intermitente pra vaga
 * removida/encerrada; mesma classe de falha esperada aqui), bloco
 * JobPosting ausente/malformado, ou `description` vazia degradam pro texto
 * da listagem (`textoParaFiltro`) COM `extracao: 'fallback_listagem'`
 * marcado — nunca em silêncio (briefing: "uma vaga julgada por 40
 * caracteres... não pode parecer uma vaga julgada por 4000"). Throttle
 * "coletor educado" (`esperar(THROTTLE_MS)`) roda mesmo no caminho de
 * sucesso — `radar.js processarItensFonte` não pausa entre itens pra
 * trilha mercado (ver comentário "THROTTLE DO DETALHE" no topo do
 * arquivo), então a pausa tem que morar aqui, senão a mudança dispara uma
 * requisição atrás da outra sem intervalo nenhum.
 */
/**
 * Núcleo de `enriquecer()`, parametrizado pela chave (`viaRede`) — extraído
 * à parte pra ser testável nos DOIS estados (ligado/desligado) sem precisar
 * mutar a constante de módulo `ENRIQUECER_VIA_REDE`. `enriquecer()`
 * (exportado, é o que `radar.js`/as sondas chamam de verdade) sempre chama
 * isto com a chave real; `tests/vagas-parsing.test.js` chama
 * `_internal.enriquecerComChave(rawItem, true)` /
 * `_internal.enriquecerComChave(rawItem, false)` diretamente, com
 * `http.get` mockado, pra provar os dois comportamentos sem depender de
 * qual é o default hoje nem gastar rede real.
 */
async function enriquecerComChave(rawItem, viaRede) {
  if (!viaRede) {
    // Chave desligada (ver "CHAVE DE ENRIQUECIMENTO POR REDE" no topo do
    // arquivo) — mesmo shape de retorno do caminho de falha de rede abaixo,
    // sem gastar nenhuma requisição.
    return { texto_bruto: textoParaFiltro(rawItem), extracao: 'fallback_listagem' };
  }

  let html;
  try {
    html = await http.get(rawItem.jobUrl);
  } catch (err) {
    console.warn(`[vagas] enriquecer: falha de rede em ${rawItem.jobUrl} — ${err.message} — usando texto da listagem (degradado)`);
    await esperar(THROTTLE_MS);
    return { texto_bruto: textoParaFiltro(rawItem), extracao: 'fallback_listagem' };
  }
  await esperar(THROTTLE_MS);

  const jobPosting = extrairJobPosting(html);
  if (!jobPosting) {
    console.warn(`[vagas] enriquecer: bloco JobPosting não encontrado/parseável em ${rawItem.jobUrl} — usando texto da listagem (degradado)`);
    return { texto_bruto: textoParaFiltro(rawItem), extracao: 'fallback_listagem' };
  }

  const { texto_bruto: textoEnriquecido, descricaoLimpa } = montarEnriquecimento(jobPosting, rawItem);
  if (!descricaoLimpa) {
    console.warn(`[vagas] enriquecer: JobPosting sem description em ${rawItem.jobUrl} — usando texto da listagem (degradado)`);
    return { texto_bruto: textoParaFiltro(rawItem), extracao: 'fallback_listagem' };
  }

  return { texto_bruto: textoEnriquecido };
}

async function enriquecer(rawItem) {
  return enriquecerComChave(rawItem, ENRIQUECER_VIA_REDE);
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
    extrairBlocosVaga,
    parseBlocoVaga,
    dataPublicacaoISO,
    modalidadeDoLocal,
    paraSlug,
    limparMarcacao,
    limparTagsGenerico,
    sanitizarControlChars,
    extrairJobPosting,
    montarEnriquecimento,
    enriquecerComChave,
    ENRIQUECER_VIA_REDE,
    RE_LINK,
    RE_EMPRESA,
    RE_LOCAL,
    RE_DATA,
    MAX_PAGINAS_POR_TERMO,
    TAMANHO_PAGINA_ESPERADO,
    THROTTLE_MS
  }
};
