'use strict';

const http = require('../lib/http');
const extratorMercado = require('../lib/extrator-mercado');
const keywordsMercado = require('../config/keywords-mercado.json');

/**
 * Coletor da Gupy — portal de vagas de mercado (Onda 3, primeira fonte da
 * TRILHA MERCADO do radar — ver README §Trilha mercado). Decisão JÁ TOMADA
 * por JB (não re-sondar): a cláusula anti-agregação dos Termos da Gupy foi
 * lida e o risco foi assumido para coleta estritamente pessoal — ver
 * briefing de Durin, "Decisão tomada — o bloqueio anterior está liberado".
 *
 * MODO DE ACESSO (investigado empiricamente em 26/08/2026, por engenharia
 * reversa dos chunks JS do Next.js de portal.gupy.io — NÃO documentado
 * publicamente pela Gupy):
 *
 *   GET https://employability-portal.gupy.io/api/v1/jobs?jobName=TERMO&limit=N&offset=M
 *
 * `portal.gupy.io` (a página que um humano abre no navegador) é uma SPA
 * Next.js que busca os resultados de busca client-side, DEPOIS da
 * hidratação, chamando esse endpoint num domínio de API separado
 * (`employability-portal.gupy.io` — descoberto na baseURL do axios
 * embutida no bundle `_next/static/chunks/246-*.js`, módulo webpack 992245).
 * `portal.gupy.io/robots.txt` é permissivo (Disallow vazio, já confirmado na
 * sondagem anterior) e `employability-portal.gupy.io` não tem robots.txt
 * (404) — sem regra, sem bloqueio. Não exige nenhum header além de
 * User-Agent de navegador (mesmo `lib/http.js` já usado pelo DOU) — sem
 * Referer/Origin/cookie, testado sem eles, funciona igual.
 *
 * Resposta: `{ data: [ {id, companyId, name, description, careerPageName,
 * careerPageUrl, type, publishedDate, applicationDeadline, isRemoteWork,
 * city, state, country, jobUrl, workplaceType, skills}, ... ],
 * pagination: {total, limit, offset} }`. Achado real importante:
 * `pagination.total` é INCONSISTENTE (varia com o `limit` pedido — testado
 * com jobName=IA: limit=10 -> total=163, limit=20 -> total=100, limit=50 ->
 * total=100, mas paginando de verdade com offset o total real percorrido
 * bate 163) — por isso o loop de paginação abaixo NUNCA confia em
 * `pagination.total` como condição de parada, só no tamanho da página
 * recebida (`< limit` = última página).
 *
 * DIFERENÇA ESTRUTURAL vs. DOU: o DOU tem uma listagem diária única
 * (~2000-2500 itens/dia) que se filtra depois. A Gupy não tem "feed do
 * dia" — é busca por termo. Por isso este coletor faz UMA requisição
 * (paginada) POR termo de `config/keywords-mercado.json → termos_busca`,
 * dedupe por `id` numérico da Gupy entre termos (a mesma vaga pode aparecer
 * em mais de uma busca — ex. um "UX/UI Designer" bate tanto em "UX" quanto
 * em "UI"), e roda TODA vez (não existe filtro "só o que mudou desde
 * ontem" na API) — vagas já vistas são descartadas no dedupe do STORE
 * (lib/store.js, por `id` hash), não aqui; é overhead de CPU (reavaliar
 * estágio 1/3 de vagas já conhecidas todo dia), aceitável na escala pessoal
 * deste radar (mesma doutrina de lib/store.js sobre JSONL O(n)).
 *
 * SEM SEGUNDO REQUEST DE ENRIQUECIMENTO: ao contrário do DOU (preview de
 * ~400 chars na listagem, texto completo só na página do artigo), a busca
 * da Gupy já devolve a DESCRIÇÃO COMPLETA da vaga no próprio item da
 * listagem — confirmado comparando a resposta da API com o texto renderizado
 * na página do job. `enriquecer()` abaixo não faz nenhuma requisição de
 * rede — só reempacota o que `coletar()` já trouxe.
 */

const ID = 'gupy';
const NOME = 'Gupy — portal de vagas de mercado';
const TRILHA = 'mercado';
const BASE = 'https://employability-portal.gupy.io';

const LIMIT_PAGINA = 50;
const MAX_PAGINAS_POR_TERMO = 6; // teto de segurança (300 itens/termo) — nenhum termo da lista chegou perto disso na sondagem (máximo observado: 163, termo "IA")
const THROTTLE_MS = 400; // coletor educado — pausa entre CADA requisição (páginas e termos), mesmo espírito do throttle de listagem do backfill do DOU (README §Backfill), escala menor pois aqui é ~20-25 requisições por coleta, não centenas

function esperar(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Nome completo do estado (como a Gupy devolve em `state`) -> sigla UF.
// Pequeno mapa local e deliberadamente NÃO importado de lib/uf-lookup.js:
// as heurísticas de lá (`extrairUfDoTexto`) são desenhadas pra reconhecer
// nome de estado DENTRO de texto livre de edital ("Estado de São Paulo");
// aqui o valor já vem como campo estruturado e exato da própria API
// ("São Paulo", "Paraná") — um lookup direto é mais simples e mais correto
// que reaproveitar um extrator de texto livre para um caso que não é texto
// livre.
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

/**
 * `publishedDate` vem como datetime ISO completo
 * ("2026-08-26T12:23:30.887Z") — corta pro AAAA-MM-DD que o schema usa em
 * `data_publicacao`/`inscricao_inicio` (mesmo formato de data que o resto
 * do radar, DOU incluso).
 */
function dataISO(datetimeISO) {
  const m = String(datetimeISO || '').match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

async function buscarPaginaTermo(termo, offset) {
  const url = `${BASE}/api/v1/jobs?jobName=${encodeURIComponent(termo)}&limit=${LIMIT_PAGINA}&offset=${offset}`;
  let texto;
  try {
    texto = await http.get(url);
  } catch (err) {
    throw new Error(
      `[falha: GET employability-portal jobs (termo="${termo}", offset=${offset}) | ${err.message} | conectividade ou endpoint da Gupy pode ter mudado | reinspecionar https://portal.gupy.io/job-search e ajustar fontes/gupy.js]`
    );
  }
  let payload;
  try {
    payload = JSON.parse(texto);
  } catch (err) {
    throw new Error(
      `[falha: parse JSON employability-portal jobs (termo="${termo}", offset=${offset}) | ${err.message} | resposta não é JSON — endpoint pode ter mudado de formato | logar resposta bruta e revisar]`
    );
  }
  return Array.isArray(payload.data) ? payload.data : [];
}

/**
 * Busca TODAS as páginas de um termo. Nunca confia em `pagination.total`
 * (inconsistente, ver comentário de topo) — para quando a página recebida
 * vem menor que `LIMIT_PAGINA` (fim real dos resultados) ou ao atingir
 * `MAX_PAGINAS_POR_TERMO` (cinto de segurança contra termo demais genérico).
 */
async function buscarTermo(termo) {
  const itens = [];
  let offset = 0;
  for (let pagina = 0; pagina < MAX_PAGINAS_POR_TERMO; pagina++) {
    const itensPagina = await buscarPaginaTermo(termo, offset);
    itens.push(...itensPagina);
    if (itensPagina.length < LIMIT_PAGINA) break;
    offset += LIMIT_PAGINA;
    await esperar(THROTTLE_MS);
  }
  return itens;
}

/**
 * Varre `termos_busca` (config/keywords-mercado.json), dedupe por `id`
 * numérico da Gupy entre termos. `volumeBruto` = total de itens únicos
 * retornados pela API antes de qualquer filtro do radar (estágio 1/3) —
 * análogo ao `volumeBruto` do DOU (total de publicações do dia antes do
 * pré-filtro de artType), usado por lib/saude.js pra distinguir "0 vagas
 * relevantes hoje" de "coletor quebrado" (ver README §Saúde barulhenta).
 */
async function coletar() {
  const porId = new Map();
  const termos = keywordsMercado.termos_busca || [];

  for (const termo of termos) {
    const itensTermo = await buscarTermo(termo);
    for (const item of itensTermo) {
      if (item && item.id != null && !porId.has(item.id)) porId.set(item.id, item);
    }
    await esperar(THROTTLE_MS);
  }

  const itens = Array.from(porId.values());
  return { itens, volumeBruto: itens.length };
}

/**
 * Blob usado pelo estágio 1 (lib/vaga-mercado.js não usa isto — usa o
 * rawItem estruturado direto) e pelo estágio 3 (lib/score-mercado.js
 * avaliarAderencia, que SIM roda sobre este texto). título + descrição
 * completa — já é o "enriquecido", não precisa de segunda requisição (ver
 * comentário de topo).
 */
function textoParaFiltro(rawItem) {
  return [rawItem.name, rawItem.description].filter(Boolean).join(' \n ');
}

/**
 * Campos preenchíveis só com o item da busca (sem requisição extra — a Gupy
 * já devolve tudo). `subedital`/`classe`/`regime` saem `null` sempre nesta
 * trilha, sem constrangimento (README §Trilha mercado — não fazem sentido
 * fora do vocabulário de concurso público docente). `tipo` também fica
 * `null`: o schema documenta esse campo com enum docente-específico
 * ('efetivo' | 'substituto' | 'posdoc_bolsa' | 'cfp'), e a Gupy expõe um
 * `type` de vínculo de mercado com semântica DIFERENTE (efetivo/estágio/
 * temporário/PJ/trainee) — forçar esses valores num campo cujo contrato
 * documentado é outro seria o mesmo "encaixe forçado" que o briefing pediu
 * pra evitar no score. Fica como recomendação para depois (ver README).
 * `vagas` fica `null`: a Gupy não expõe contagem de vagas por posting de
 * forma confiável — inventar "1" seria presumir dado que a fonte não
 * afirma.
 */
function normalizarParcial(rawItem) {
  const uf = ufDoEstado(rawItem.state);
  const campus = rawItem.city ? (rawItem.state ? `${rawItem.city} - ${rawItem.state}` : rawItem.city) : null;
  const dataPublicacao = dataISO(rawItem.publishedDate);

  return {
    fonte: ID,
    trilha: TRILHA,
    orgao: rawItem.careerPageName || null,
    campus,
    uf,
    url: rawItem.jobUrl || null,
    data_publicacao: dataPublicacao,
    // "inscrições abertas desde a publicação" é a leitura honesta de uma
    // vaga de mercado (não há um "início de inscrição" formal separado como
    // no concurso público) — inscricao_fim vem do applicationDeadline
    // explícito da Gupy quando presente (já em AAAA-MM-DD), null quando a
    // vaga não tem prazo definido (não inventa).
    inscricao_inicio: dataPublicacao,
    inscricao_fim: rawItem.applicationDeadline || null,
    texto_bruto: textoParaFiltro(rawItem),
    modalidade: extratorMercado.extrairModalidade(rawItem),
    senioridade: extratorMercado.extrairSenioridade(rawItem.name),
    subedital: null,
    classe: null,
    regime: null,
    tipo: null,
    vagas: null
  };
}

/**
 * Sem requisição de rede — a descrição completa já veio em `coletar()` (ver
 * comentário de topo). Mantido `async` para respeitar o contrato de fonte
 * (README §Como adicionar uma fonte nova).
 */
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
  _internal: { ufDoEstado, dataISO, UF_POR_ESTADO, LIMIT_PAGINA, MAX_PAGINAS_POR_TERMO }
};
