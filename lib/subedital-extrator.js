'use strict';

const keywordFiltro = require('./keyword-filtro');
const extrator = require('./extrator-texto');

/**
 * Divide o texto integral de um edital "guarda-chuva" (item 3 do briefing
 * Onda 1.6) na tabela de subeditais, quando existir, para que cada
 * subedital de área distinta vire um ITEM PRÓPRIO no store — em vez de um
 * alerta genérico "universidade X abriu N vagas".
 *
 * Escopo deliberadamente mínimo (briefing: "implemente o mínimo para o DOU
 * funcionar, sem construir o extrator genérico da Onda 2"): cobre só o
 * formato de tabela visto no edital REAL da UFSCar (12/08/2026, edital nº 4,
 * 89 vagas em 67 subeditais) — uma sequência de linhas
 *
 *   {código}/{ano}.{item} Professor... {Depto} - {SIGLA} {Campus} {vagas}
 *   {Área} {Subárea} {Requisitos} DE R$ {taxa}
 *
 * onde "{código}/{ano}.{item}" (ex.: "004/26.41") é o identificador do
 * subedital dentro do Quadro I, e "DE R$ {taxa}" fecha cada linha (DE =
 * abreviação do regime "Dedicação Exclusiva" nesse edital específico, mas
 * usado aqui só como marcador de fronteira de linha, não como valor
 * interpretado). Editais de outros formatos (ex.: UFG, que usa
 * códigos "IIG/CCO" sem o padrão NNN/AA.NN) não são divididos por este
 * módulo — `dividirSubeditais` retorna null e o item cai no caminho
 * "edital único" (estágio 3 roda sobre o texto inteiro), que já é uma
 * melhoria de recall sobre o filtro-na-casca anterior, mesmo sem split por
 * subedital.
 */

const RE_CODIGO_SUBEDITAL = /\b\d{1,4}\/\d{2}\.\d{1,3}\b/g;

// Depois do código: "- SIGLA Campus(1-6 palavras) VAGAS resto...". O campus
// aceita conectores minúsculos (de/do/da/dos/das) no meio de nomes como
// "São José do Rio Preto".
const RE_CAMPUS_VAGAS = /-\s*(\S+)\s+((?:(?:[A-ZÀ-Ý][\wÀ-ÿ'.-]*|de|do|da|dos|das)\s+){1,6}?)(\d{1,3})\s+/;

const RE_FIM_LINHA_TAXA = /\s*DE\s+R\$\s*[\d.,]+\s*$/i;

// Achado real (edital UFSCar nº 4/2026): o mesmo código de subedital
// (ex.: "004/26.40") REAPARECE muito mais adiante no documento, num anexo
// de cursos de graduação relacionados por departamento (link pro curso de
// graduação, não a vaga docente) — sem o padrão "SIGLA Campus Vagas", então
// o parser cai no fallback (linha inteira vira "textoArea") e o filtro de
// keyword acaba batendo em palavras da URL/curso ("mídias digitais",
// ".../graduacao" → falso "titulacao: graduacao"), produzindo um SEGUNDO
// registro pro mesmo subedital com área/titulação ERRADAS (não é
// duplicata inofensiva — hash.gerarId inclui `area`, então a linha errada
// NÃo dedupe contra a linha certa; vira um item novo e falso no store).
// Cortar o texto no primeiro "Quadro II" resolve: as 67 linhas reais do
// edital real ficam todas ANTES desse marcador (verificado empiricamente —
// ver tests/subedital-extrator.test.js), o anexo fica de fora.
const RE_MARCADOR_FIM_TABELA = /\bQuadro\s+II\b/i;

/**
 * Detecta e divide a tabela de subeditais em linhas cruas (código, campus,
 * vagas, texto da área — tudo o que sobrar depois de remover sigla/campus/
 * vagas do início da linha). Retorna `null` quando o texto não parece ter
 * uma tabela de subeditais (menos de 2 códigos encontrados) — nesse caso
 * o chamador trata o edital como item único, não como guarda-chuva.
 */
function dividirSubeditais(textoCompleto) {
  const tCompleto = String(textoCompleto || '');
  const corte = tCompleto.search(RE_MARCADOR_FIM_TABELA);
  const t = corte === -1 ? tCompleto : tCompleto.slice(0, corte);
  const matches = [...t.matchAll(RE_CODIGO_SUBEDITAL)];
  if (matches.length < 2) return null;

  const linhas = [];
  for (let i = 0; i < matches.length; i++) {
    const codigo = matches[i][0];
    const inicioBloco = matches[i].index + codigo.length;
    const fimBloco = i + 1 < matches.length ? matches[i + 1].index : t.length;
    const bloco = t.slice(inicioBloco, fimBloco).trim();
    linhas.push(parseLinha(codigo, bloco));
  }
  return linhas;
}

function parseLinha(codigo, bloco) {
  const m = bloco.match(RE_CAMPUS_VAGAS);
  if (!m) {
    // Não conseguiu achar o padrão "- SIGLA Campus Vagas" — mantém a linha
    // inteira como texto de área (best-effort, nunca inventa campus/vagas).
    return { codigo, campus: null, vagas: null, textoArea: bloco };
  }
  const campus = m[2].trim() || null;
  const vagasNum = parseInt(m[3], 10);
  const restoInicio = m.index + m[0].length;
  let textoArea = bloco.slice(restoInicio).replace(RE_FIM_LINHA_TAXA, '').trim();
  if (!textoArea) textoArea = bloco;
  return { codigo, campus, vagas: Number.isNaN(vagasNum) ? null : vagasNum, textoArea };
}

/**
 * Marcador de fronteira entre a classificação declarada da linha ({Área}
 * {Subárea}, no início — ver cabeçalho do arquivo, formato "{código} -
 * {SIGLA} {Campus} {vagas} {Área} {Subárea} {Requisitos} DE R$ {taxa}") e o
 * texto de Requisitos (lista de titulações/áreas ACEITAS como requisito,
 * que tende a ser ampla de propósito — ex. "Título de Doutor... em
 * Matemática, ou..., ou Ciência da Computação, ou Sistema de Computação,
 * ou Genética..."). Os dois formatos vistos nos dados reais do edital
 * UFSCar nº 4/2026 (verificado contra `data/store.jsonl`, 28/08/2026):
 * "Título de Doutor"/"Título de doutor" e "Doutorado em programas...".
 */
const RE_INICIO_REQUISITO = /T[íi]tulo\s+de\s+[Dd]outor|[Dd]outorado\s+em/;

/**
 * Corta `textoArea` no início do trecho de Requisitos, quando o marcador
 * existir — devolve o texto INTEIRO quando não existir (nunca lança fora
 * um texto que não tem esse formato). Usado SÓ para decidir a
 * classificação de área/subárea (ver `registrosRelevantes` abaixo); nunca
 * para `texto_bruto`/`titulacao_exigida`/`campus`/`vagas`, que continuam
 * lendo a linha INTEIRA.
 */
function textoAntesDoRequisito(textoArea) {
  const t = String(textoArea || '');
  const m = t.match(RE_INICIO_REQUISITO);
  return m ? t.slice(0, m.index) : t;
}

/**
 * Aplica o filtro de keyword (estágio 3, área de JB) sobre CADA linha do
 * subedital — só as que batem viram registro. Retorna objetos parciais
 * (campos do schema já resolvidos: campus/vagas/area/subarea/
 * titulacao_exigida/keywords_matched/texto_bruto/codigo_subedital); quem
 * chama ainda aplica hash.gerarId + schema.montarRegistro, igual ao
 * caminho de edital único.
 *
 * ONDA 12/13, item 12c — BUG REAL achado no dado de hoje (ver
 * RELATORIO-ONDA-1-2.md §2a): o subedital 004/26.08 do edital UFSCar nº
 * 4/2026 (`textoArea` real = "Probabilidade e Estatística Estatística
 * Título de Doutor obtido em Programa de Pós-Graduação registrado em uma
 * das seguintes áreas de conhecimento da CAPES: Matemática, ou Matemática
 * Aplicada, ou Probabilidade e Estatística, ou Estatística, ou Ciência da
 * Computação, ou Sistema de Computação, ou Genética, ..." — vaga
 * DECLARADA de Probabilidade e Estatística/Estatística) era classificado
 * `area: 'Computação/IA', subarea: 'Computação'` porque "Ciência da
 * Computação" aparece dentro da lista de titulações ACEITAS como
 * requisito, não na Área/Subárea declarada da vaga — o mesmo padrão de bug
 * já documentado para o formato UFRGS em `areaDivergeDoRequisito` (que só
 * cobre o formato "Área/subárea de conhecimento: X Requisito(s):" com
 * labels explícitos; a tabela de subeditais do DOU não tem esses labels).
 * O registro errado colidia visualmente com o subedital 004/26.13
 * (genuinamente Computação/IA, mesmo campus) — duas linhas idênticas na
 * vista `Concursos` pra editais diferentes.
 *
 * CONSERTO: a classificação de área/subárea roda só sobre
 * `textoAntesDoRequisito(linha.textoArea)` — a fatia da linha ANTES do
 * marcador de Requisitos (ver função acima). Pra 004/26.08, essa fatia é
 * "Probabilidade e Estatística Estatística " — nenhum termo de
 * config/keywords.json bate nela, então o subedital passa a ser
 * corretamente DESCARTADO (mesma leitura honesta já aplicada ao caso
 * gêmeo da UFRGS em `sinonimos_area._comentario_excluidas_deliberadamente`
 * de config/keywords.json — "a vaga em si não é de Computação/IA", não um
 * bug de peso a corrigir depois). `texto_bruto`/`titulacao_exigida` de
 * quem PASSA continuam vindo da linha INTEIRA (a titulação de fato mora no
 * trecho de Requisitos) — só a decisão de área/subárea muda de fatia.
 */
function registrosRelevantes(linhas, keywordsConfig) {
  const relevantes = [];
  for (const linha of linhas || []) {
    const textoClassificacao = textoAntesDoRequisito(linha.textoArea);
    const filtro = keywordFiltro.avaliar(textoClassificacao, keywordsConfig);
    if (!filtro.passou) continue;
    relevantes.push({
      campus: linha.campus,
      vagas: linha.vagas,
      titulacao_exigida: extrator.extrairTitulacao(linha.textoArea),
      texto_bruto: linha.textoArea,
      area: filtro.areaPrincipal,
      subarea: filtro.subareaPrincipal,
      keywords_matched: filtro.matches.map(m => m.termo),
      subedital: linha.codigo
    });
  }
  return relevantes;
}

/**
 * Item 1 do briefing Onda 1.7 — "dado errado é pior que dado faltante":
 * quando `dividirSubeditais` não reconhece a tabela (formato diferente do
 * NNN/AA.NN da UFSCar — ex. UFG, códigos "IIG/CCO", ver golden set caso
 * `ufg-24-2025-ciencia-computacao`), o edital cai no caminho de "subedital
 * único" e `vagas`/`titulacao_exigida`/`campus` seriam extraídos pelo
 * PRIMEIRO match do extrator genérico sobre o texto INTEIRO — que pode
 * pertencer a uma linha de área totalmente diferente da que fez o item
 * passar no filtro de keyword (risco assimétrico: campo ERRADO é pior que
 * campo vazio, porque o errado não é conferido).
 *
 * `pareceMultiplosItensNaoReconhecidos` é a heurística que decide "este
 * texto tem cara de tabela com VÁRIAS linhas de área distinta, mas em
 * formato que este extrator não reconhece" — sem tentar reconhecer o
 * formato em si (isso seria o extrator genérico da Onda 2, fora de escopo).
 * Dois sinais estruturais, cada um sozinho já suficiente, ambos verificados
 * contra o texto real da UFG e contra os 6 outros casos do golden set (nenhum
 * falso positivo nos fixtures — ver tests/subedital-extrator.test.js):
 *
 *   1. Número de processo/SEI repetido (`NNNNN.NNNNNN/AAAA-NN`, formato
 *      usado pela UFG uma vez por linha da tabela — duas linhas, dois
 *      números diferentes). Um edital de subedital único cita seu próprio
 *      processo no máximo uma vez.
 *   2. Período de inscrição (`DD/MM/AAAA a|até DD/MM/AAAA`) aparecendo 2+
 *      vezes no texto — cada linha da tabela carrega seu próprio período;
 *      um edital de subedital único, quando cita prazo, cita uma vez.
 *
 * Heurística, documentada como tal: pode haver formato ambíguo que nenhum
 * dos dois sinais capture (falso negativo — mantém o comportamento antigo,
 * risco pré-existente, não piora) ou, em tese, um edital de subedital único
 * atípico que cite dois processos por outro motivo (falso positivo — pior
 * caso é sinalizar como incerto um item que na verdade era confiável, o que
 * é o lado BARATO do risco assimétrico do briefing).
 */
const RE_PROCESSO_SEI = /\b\d{4,6}\.\d{5,7}\/\d{4}-\d{1,2}\b/g;
const RE_PERIODO_GENERICO = /\b\d{2}\/\d{2}\/\d{4}\s*(?:a|até)\s*\d{2}\/\d{2}\/\d{4}\b/gi;

function contarMatches(regex, texto) {
  regex.lastIndex = 0;
  const m = texto.match(regex);
  return m ? m.length : 0;
}

function pareceMultiplosItensNaoReconhecidos(texto) {
  const t = String(texto || '');
  if (contarMatches(RE_PROCESSO_SEI, t) >= 2) return true;
  if (contarMatches(RE_PERIODO_GENERICO, t) >= 2) return true;
  return false;
}

/**
 * Terceiro sinal de ambiguidade (Onda 2.0 — auditoria dos 21 itens
 * `titulacao_exigida: 'graduacao'`, achado real e verificado contra o store
 * inteiro de 204 itens): o formato "Área/subárea de conhecimento: <X>
 * Requisito(s): <lista extensa de dezenas de graduações aceitas>" (visto na
 * UFRGS — 4 ocorrências no store, as 4 com área ERRADA) declara a área REAL
 * da vaga num campo próprio (`<X>` — ex. "Probabilidade e Estatística -
 * Estatística"), separado da lista de graduações ACEITAS como requisito
 * (que é ampla de propósito — qualquer graduação correlata a Estatística
 * serve, incluindo "Design de Produto" por coincidência de nomenclatura,
 * "Ciência da Computação", etc., sem que a vaga tenha QUALQUER relação com
 * Design ou Computação). O filtro de keyword (lib/keyword-filtro.js) roda
 * sobre o texto INTEIRO e não distingue "área declarada da vaga" de "lista
 * de graduações aceitas" — batia keyword na lista de requisitos e classificava
 * a vaga inteira como Design/Computação por engano (achado: edital UFRGS nº
 * 15/2025, vaga de Estatística, virou "elegível agora, Design/Design de
 * Produto", score 86, #1 do ranking de aderência — o pior caso possível
 * porque é o item que JB mais provavelmente abriria primeiro).
 *
 * `areaDivergeDoRequisito` cruza: se o texto tem esse par de labels, extrai
 * o campo `<X>` declarado e verifica se ALGUM termo que bateu no filtro de
 * keyword aparece dentro dele (não na lista de requisitos inteira). Se
 * nenhum bater, a área classificada é falso positivo — mesmo tratamento de
 * `pareceMultiplosItensNaoReconhecidos` (ambíguo, nunca o primeiro match).
 * Escopo deliberadamente restrito a este par de labels específico (só
 * confirmado nesse formato da UFRGS) — não tenta generalizar pra outros
 * formatos de tabela (Onda 2, extrator genérico).
 */
const RE_AREA_REQUISITO = /Área\s*\/\s*subárea de conhecimento:\s*(.*?)\s*Requisito\(s\):/is;

function areaDivergeDoRequisito(texto, matches) {
  const t = String(texto || '');
  const m = t.match(RE_AREA_REQUISITO);
  if (!m) return false; // não é esse formato — sinal não se aplica
  const areaDeclaradaNorm = keywordFiltro.normalizar(m[1]);
  const algumBateNaAreaDeclarada = (matches || []).some(match =>
    keywordFiltro.contemTermo(areaDeclaradaNorm, keywordFiltro.normalizar(match.termo))
  );
  return !algumBateNaAreaDeclarada;
}

/**
 * Avalia um edital de "subedital único" (dividirSubeditais retornou null)
 * contra o filtro de keyword — item 1 do briefing Onda 1.7. Quando o texto
 * parece ter múltiplos itens em formato não reconhecido
 * (`pareceMultiplosItensNaoReconhecidos`), `area`/`subarea` saem `null` e
 * `extracao: 'formato_nao_reconhecido'` é sinalizado — NUNCA a área do
 * primeiro match. `keywords_matched` continua populado (é honesto: esses
 * termos realmente apareceram no texto, só não sabemos em qual linha).
 * `vagas`/`titulacao_exigida`/`campus` são responsabilidade de quem chama
 * (radar.js) zerar no mesmo caso — ver `ambiguo` no retorno.
 */
function avaliarEditalUnico(textoEnriquecido, keywordsConfig) {
  const texto = String(textoEnriquecido || '');
  const filtro = keywordFiltro.avaliar(texto, keywordsConfig);
  if (!filtro.passou) {
    return { passou: false, ambiguo: false };
  }

  const ambiguo = pareceMultiplosItensNaoReconhecidos(texto) || areaDivergeDoRequisito(texto, filtro.matches);
  if (ambiguo) {
    return {
      passou: true,
      ambiguo: true,
      area: null,
      subarea: null,
      keywords_matched: filtro.matches.map(m => m.termo),
      extracao: 'formato_nao_reconhecido'
    };
  }

  return {
    passou: true,
    ambiguo: false,
    area: filtro.areaPrincipal,
    subarea: filtro.subareaPrincipal,
    keywords_matched: filtro.matches.map(m => m.termo),
    extracao: null
  };
}

module.exports = {
  dividirSubeditais,
  registrosRelevantes,
  pareceMultiplosItensNaoReconhecidos,
  areaDivergeDoRequisito,
  avaliarEditalUnico,
  _internal: {
    RE_CODIGO_SUBEDITAL,
    RE_CAMPUS_VAGAS,
    parseLinha,
    RE_PROCESSO_SEI,
    RE_PERIODO_GENERICO,
    RE_AREA_REQUISITO,
    RE_INICIO_REQUISITO,
    textoAntesDoRequisito
  }
};
