'use strict';

const http = require('../lib/http');
const extrator = require('../lib/extrator-texto');
const keywordFiltro = require('../lib/keyword-filtro');
const keywordsConfig = require('../config/keywords.json');

/**
 * Coletor da PCI Concursos — servidor MCP oficial (trilha DOCENTE, Onda 5 —
 * ver `fontes-reconhecimento-2.md` §1 para o relato empírico completo do
 * levantamento que motivou esta fonte).
 *
 * MODO DE ACESSO (testado empiricamente em 2026-08-27):
 *
 *   POST https://mcp.pciconcursos.com.br/mcp
 *   Content-Type: application/json
 *   { "jsonrpc": "2.0", "id": N, "method": "tools/call",
 *     "params": { "name": "listar_concursos", "arguments": { "professores": true } } }
 *
 * JSON-RPC 2.0 sobre HTTP simples — sem WebSocket, sem SSE, sem
 * autenticação. A resposta tem DUAS camadas de serialização: o envelope
 * JSON-RPC (`result.content[0].text`) é uma STRING que por sua vez contém
 * um segundo JSON (`{ meta, data, errors }`) — precisa de `JSON.parse` duas
 * vezes, não é aninhamento nativo. `chamarFerramenta` abaixo resolve as
 * duas camadas e nunca deixa esse detalhe vazar pro resto do módulo.
 *
 * `listar_concursos({ professores: true })` devolve, numa única chamada sem
 * paginação, TODOS os concursos com vaga de professor abertos no Brasil
 * (221 concursos / 4352 cargos individuais no momento deste levantamento,
 * `meta.total` bate com `data.length` — sem sinal de paginação truncando
 * silenciosamente). Cada concurso já vem com `datas.aberto`/
 * `datas.dias_restantes` PRÉ-CALCULADOS pelo próprio servidor — nunca
 * reimplementados aqui (instrução do briefing, e o próprio servidor MCP
 * documenta isso como regra pros clientes: "nunca calcule você mesma").
 *
 * A ARMADILHA CENTRAL (guarda-chuva de cargos) — cada concurso tem um
 * array `cargos: string[]` com de 1 a 130 cargos (áreas) sob o MESMO
 * `id`/`titulo`/`url`/`datas` (formato análogo ao guarda-chuva do DOU, ver
 * `fontes/dou.js` + `lib/subedital-extrator.js`, só que aqui é um array
 * estruturado, não uma tabela de texto solto). A diferença estrutural que
 * levou à decisão de design abaixo: o DOU só sabe dividir um edital em
 * subeditais DEPOIS de buscar o texto integral (estágio 2, enriquecimento
 * com requisição de rede) — por isso usa o hook opcional
 * `fonte.dividirSubeditais(textoEnriquecido)` do contrato de fonte. Aqui os
 * cargos já vêm estruturados na PRÓPRIA listagem, sem nenhuma requisição
 * extra — então este módulo divide o guarda-chuva já em `coletar()`,
 * emitindo UM ITEM POR (concurso, cargo), em vez de usar
 * `dividirSubeditais` (que só recebe uma STRING já enriquecida e teria que
 * reserializar o array pra depois desserializar de volta — indireção sem
 * ganho nenhum). `dividirSubeditais` não é implementado neste módulo — o
 * contrato de fonte já trata a ausência do método como "item único", que é
 * exatamente o que cada (concurso, cargo) já é depois do flatten.
 *
 * PRÉ-FILTRO DE VOLUME (mesmo espírito do artType do DOU): dos 4352 cargos
 * nacionais, a imensa maioria não tem NADA a ver com o perfil de JB
 * (Odontologia, Zootecnia, Direito...). Rodar os ~4352 pelo estágio 1/2
 * genérico do pipeline (`radar.js processarItensFonte`, que insere uma
 * pausa de cortesia de 300ms ANTES de `enriquecer()` para CADA item que
 * passa o estágio 1 — pausa pensada pra fontes que fazem requisição de rede
 * no enriquecimento, o que não é o caso aqui) levaria ~20+ minutos por
 * coleta pra nada, já que `enriquecer()` desta fonte não faz nenhuma
 * requisição extra (ver abaixo). Por isso `coletar()` já aplica o MESMO
 * filtro de keyword de `config/keywords.json` (o que o estágio 3 aplicaria
 * de qualquer forma sobre o texto enriquecido) para descartar, ainda dentro
 * da fonte, os cargos que não têm nenhum termo de área de JB — reduz para
 * ~70 candidatos reais (medido em 2026-08-27). Isto NÃO substitui o
 * estágio 3 do pipeline geral (`lib/subedital-extrator.js
 * avaliarEditalUnico`, chamado por `radar.js` sobre o texto enriquecido de
 * cada item) — que continua rodando normalmente e é quem de fato decide
 * `area`/`subarea`/`extracao` do registro salvo; este pré-filtro só evita
 * gastar o throttle genérico do pipeline em milhares de cargos que o
 * estágio 3 rejeitaria de qualquer jeito.
 *
 * ESTABILIDADE DO `subedital` (item central do briefing — NUNCA pode
 * oscilar entre execuções, sob risco de reinserir o mesmo concurso todo dia
 * e envenenar o dedupe/Fila do CRM): usa o próprio TEXTO do cargo
 * (`cargoRaw`, normalizado por espaço em branco) como valor de
 * `subedital` — não um índice de array, não uma contagem, não a ordem de
 * retorno da API. Justificativa: dentro do array `cargos[]` de UM concurso,
 * cada string já É o identificador estável da vaga de área (o servidor da
 * PCI devolve o MESMO texto de cargo pra mesma vaga entre chamadas — testado
 * chamando `listar_concursos` duas vezes em sequência e comparando o
 * conjunto de cargos do mesmo concurso: idêntico, inclusive a ordem). Sem
 * isso, dois cargos da MESMA área dentro do MESMO concurso (ex.: UFSCar
 * 2026 tem "PROFESSOR - DESIGN E MÍDIAS DIGITAIS" e
 * "PROFESSOR - DESIGN/DESENHO INDUSTRIAL", ambos resolvidos para a área
 * canônica "Design" no estágio 3) colidiriam no hash de `lib/hash.js`
 * (`orgao|area|data_publicacao|url` idênticos pros dois) e um dos dois
 * jamais seria salvo. Ver `tests/pci-parsing.test.js` para a prova
 * (mesmo input -> mesmo id; dois cargos distintos -> ids diferentes).
 *
 * CAMPOS QUE FICAM `null` DE PROPÓSITO (fonte não afirma isso por CARGO
 * individual, só por concurso inteiro — "dado errado é pior que dado
 * faltante", mesma doutrina do resto do projeto):
 *   - `vagas`: `vagas_salario` (ex. "88 vagas até R$ 13.753,96") é o TOTAL
 *     do concurso guarda-chuva inteiro, somando todos os cargos — atribuir
 *     esse número a um único cargo/subedital seria inventar um dado que a
 *     fonte não afirma por área (mesmo risco que o DOU pré-Onda 1.7 tinha
 *     com `titulacao_exigida`/`vagas` do primeiro match).
 *   - `titulacao_exigida`: tentado via `lib/extrator-texto.js
 *     extrairTitulacao` sobre o texto disponível (título da notícia +
 *     órgão + cargo) por consistência com o resto do projeto, mas a
 *     listagem da PCI não expõe requisito de titulação por cargo (o campo
 *     `formacao` é do concurso inteiro, ex. "Superior" — não distingue
 *     graduação/especialização/mestrado/doutorado) — fica `null` na prática
 *     esmagadora dos casos, honestamente.
 *   - `regime`, `classe`, `tipo`: não expostos em NENHUM nível pela
 *     listagem (moram no edital oficial em PDF, fora do escopo desta
 *     fonte, que só cobre a camada MCP/notícia) — sempre `null`.
 *   - `campus`: a listagem não separa campus/departamento do cargo (ao
 *     contrário do DOU, cujas linhas de subedital trazem "SIGLA Campus" —
 *     ver `lib/subedital-extrator.js`) — sempre `null`.
 *
 * `data_publicacao`/`inscricao_inicio`: usa `datas.inicio` (início da
 * janela de inscrição) — não existe campo de "data de publicação do edital"
 * dedicado na API (confirmado no levantamento). É a leitura mais honesta
 * disponível: estável, único por concurso, já em formato ISO
 * (`AAAA-MM-DD`) nativo da própria API, sem parsing. `inscricao_fim` vem de
 * `datas.fim`, mesma fonte.
 */

const ID = 'pci';
const NOME = 'PCI Concursos — MCP oficial (professores)';
const BASE = 'https://mcp.pciconcursos.com.br/mcp';

/**
 * Resolve as duas camadas de serialização do envelope JSON-RPC (ver
 * cabeçalho do arquivo) e devolve o payload interno já parseado
 * (`{ meta, data, errors }`). Nunca lança silenciosamente — cada etapa de
 * falha carrega diagnóstico próprio (rede, envelope, JSON interno).
 */
async function chamarFerramenta(nomeFerramenta, args) {
  const corpo = {
    jsonrpc: '2.0',
    id: Date.now(),
    method: 'tools/call',
    params: { name: nomeFerramenta, arguments: args || {} }
  };

  let textoResposta;
  try {
    textoResposta = await http.post(BASE, corpo);
  } catch (err) {
    throw new Error(
      `[falha: POST tools/call ${nomeFerramenta} | ${err.message} | conectividade ou endpoint MCP da PCI pode ter mudado | reinspecionar https://mcp.pciconcursos.com.br/mcp e ajustar fontes/pci.js]`
    );
  }

  let envelope;
  try {
    envelope = JSON.parse(textoResposta);
  } catch (err) {
    throw new Error(`[falha: parse envelope JSON-RPC ${nomeFerramenta} | ${err.message} | resposta não é JSON | logar resposta bruta e revisar]`);
  }

  if (envelope.error) {
    throw new Error(`[falha: tools/call ${nomeFerramenta} | erro JSON-RPC: ${JSON.stringify(envelope.error)} | servidor MCP retornou erro | conferir nome da ferramenta/argumentos]`);
  }

  const textoInterno = envelope.result && envelope.result.content && envelope.result.content[0] && envelope.result.content[0].text;
  if (!textoInterno) {
    throw new Error(`[falha: parse envelope ${nomeFerramenta} | result.content[0].text ausente | formato da resposta MCP pode ter mudado | reinspecionar payload bruto]`);
  }

  try {
    return JSON.parse(textoInterno);
  } catch (err) {
    throw new Error(`[falha: parse JSON interno ${nomeFerramenta} | ${err.message} | content[0].text não é JSON válido | logar texto bruto e revisar]`);
  }
}

/** Normaliza espaço em branco de um cargo — valor usado como `subedital` (ver cabeçalho, "ESTABILIDADE DO subedital"). Determinístico: mesma string de entrada -> mesma saída, sempre. */
function subeditalDoCargo(cargoRaw) {
  return String(cargoRaw || '').replace(/\s+/g, ' ').trim();
}

/**
 * Busca `listar_concursos(professores=true)` e achata o guarda-chuva
 * `cargos[]` de cada concurso em itens individuais — só os que já batem o
 * filtro de keyword docente (`config/keywords.json`, pré-filtro de volume,
 * ver cabeçalho do arquivo). `volumeBruto` = total de CARGOS individuais
 * antes de qualquer filtro (análogo ao `volumeBruto` do DOU/Gupy/
 * ProgramaThor — usado por `lib/saude.js` pra distinguir "0 vagas hoje" de
 * "coletor quebrado").
 */
/**
 * Achata um array `data` de concursos (já desserializado — vindo da rede em
 * `coletar()` ou de fixture real em teste, sem nenhuma diferença de
 * comportamento) em itens individuais por (concurso, cargo). Função PURA,
 * extraída de propósito pra ser testável sem rede (mesmo espírito de
 * `fontes/programathor.js parseListagem`/`montarEnriquecimento`).
 */
function flattenConcursos(concursos) {
  let totalCargos = 0;
  const itens = [];

  for (const concurso of concursos || []) {
    const datas = concurso.datas || {};
    // Defensivo, não reimplementação de inferência: a própria API já filtra
    // por inscrição aberta (ver cabeçalho), mas não custa nada honrar o
    // campo explícito caso ele volte `false` por algum motivo não previsto.
    if (datas.aberto === false) continue;

    const cargos = Array.isArray(concurso.cargos) ? concurso.cargos : [];
    for (const cargoRaw of cargos) {
      totalCargos++;
      if (!keywordFiltro.avaliar(cargoRaw, keywordsConfig).passou) continue;

      itens.push({
        concursoId: concurso.id,
        orgao: concurso.titulo || null,
        cargoRaw,
        uf: concurso.uf || null,
        regiao: concurso.regiao || null,
        formacao: concurso.formacao || null,
        vagasSalarioTotal: concurso.vagas_salario || null,
        datas,
        noticiaTitulo: (concurso.noticia && concurso.noticia.titulo) || null,
        noticiaLink: (concurso.noticia && concurso.noticia.link) || null
      });
    }
  }

  return { itens, volumeBruto: totalCargos };
}

async function coletar() {
  const payload = await chamarFerramenta('listar_concursos', { professores: true });
  const concursos = Array.isArray(payload.data) ? payload.data : [];
  return flattenConcursos(concursos);
}

/**
 * Blob usado pelo estágio 1 (`lib/vaga-docente.js pareceVagaDocente` —
 * genérico, roda igual pra qualquer fonte docente): título da notícia da
 * PCI (que carrega literalmente "concurso público"/"processo seletivo" —
 * confirmado nos 3 casos reais capturados) + órgão (contém
 * "Universidade"/"Instituto Federal" no nome expandido que a PCI já
 * devolve) + o próprio cargo (contém "PROFESSOR").
 */
function textoParaFiltro(rawItem) {
  return [rawItem.noticiaTitulo, rawItem.orgao, rawItem.cargoRaw].filter(Boolean).join(' \n ');
}

/**
 * Campos preenchíveis só com o item da listagem — a PCI não exige segunda
 * requisição (`enriquecer()` abaixo não faz I/O, mesmo padrão de
 * `fontes/gupy.js`). Ver cabeçalho do arquivo pra justificativa de cada
 * campo que fica `null` de propósito.
 */
function normalizarParcial(rawItem) {
  const datas = rawItem.datas || {};
  return {
    fonte: ID,
    orgao: rawItem.orgao,
    campus: null,
    uf: rawItem.uf || null,
    url: rawItem.noticiaLink || null,
    data_publicacao: datas.inicio || null,
    inscricao_inicio: datas.inicio || null,
    inscricao_fim: datas.fim || null,
    texto_bruto: textoParaFiltro(rawItem),
    subedital: subeditalDoCargo(rawItem.cargoRaw),
    vagas: null,
    titulacao_exigida: null,
    regime: null,
    classe: null,
    tipo: null
  };
}

/**
 * Sem requisição de rede — os dados já vieram completos em `coletar()` (ver
 * cabeçalho do arquivo). Tenta `extrairTitulacao` sobre o texto disponível
 * por consistência com o resto do projeto (reaproveita
 * `lib/extrator-texto.js`), mas na prática fica `null` quase sempre (a
 * listagem não expõe requisito de titulação por cargo).
 */
async function enriquecer(rawItem) {
  const texto = textoParaFiltro(rawItem);
  return {
    texto_bruto: texto,
    titulacao_exigida: extrator.extrairTitulacao(texto)
  };
}

module.exports = {
  id: ID,
  nome: NOME,
  coletar,
  textoParaFiltro,
  normalizarParcial,
  enriquecer,
  // exports internos, úteis para teste sem rede
  _internal: { chamarFerramenta, subeditalDoCargo, flattenConcursos, BASE }
};
