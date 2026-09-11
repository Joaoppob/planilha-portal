'use strict';

const { SIGLAS } = require('./siglas');

/**
 * Chave canônica de instituição — usada SÓ no dedupe entre fontes
 * (`lib/store.js`/`radar.js`, ver "Onda dedupe-canonico"), NUNCA no `id`
 * (`lib/hash.js gerarId`). Migrar o `id` renomearia os 750 registros já
 * materializados no store e na planilha — não é patch, é migração, e não foi
 * autorizada aqui.
 *
 * O DEFEITO QUE ISTO CONSERTA: a mesma vaga chega com `orgao` escrito
 * diferente por fonte —
 *   DOU: "Fundação Universidade Federal de São Carlos"
 *   PCI: "UFSCar - Universidade Federal de São Carlos"
 * — e como o `id` inclui `orgao` cru, os dois hashes divergem e a vaga entra
 * duas vezes.
 *
 * ESTRATÉGIA (nesta ordem, primeiro hit vence):
 *
 *   1. Split em candidatos: a PCI concatena "SIGLA - Nome completo" na mesma
 *      string (ex. "UFSCar - Universidade Federal de São Carlos"); o DOU
 *      nunca faz isso. Divide-se por " - " (e variantes de traço) e cada
 *      pedaço vira candidato próprio, além da string inteira.
 *   2. Cada candidato é normalizado (accent-fold, lowercase, pontuação fora,
 *      espaço colapsado) e tem o prefixo "fundacao " removido — "Fundação
 *      Universidade Federal de X" e "Universidade Federal de X" são a MESMA
 *      instituição (o próprio `lib/siglas.js` já documenta isso: entradas
 *      duplicadas mapeando pra mesma sigla).
 *   3. O candidato normalizado é procurado em `SIGLAS` (a mesma tabela
 *      curada da planilha, reusada — não copiada, ver `lib/siglas.js`) por
 *      nome-extenso OU por sigla (o mapa é indexado nos dois sentidos, ver
 *      `construirIndice` abaixo — resolve "Instituto Federal de Educação,
 *      Ciência e Tecnologia de São Paulo" e "IFSP" pra MESMA chave). Primeiro
 *      candidato que bate uma entrada da tabela define a chave canônica: a
 *      sigla, normalizada.
 *   4. Se NENHUM candidato bate a tabela curada, cai no fallback: usa o
 *      candidato mais longo (heurística: nome por extenso é mais longo que
 *      sigla) normalizado como está — sem tentar abreviar. Isso cobre
 *      instituições fora da tabela curada (prefeituras, universidades
 *      estaduais, IFs ainda não catalogados) sem arriscar colisão por regra
 *      de string (a mesma lição documentada em `lib/siglas.js`: sigla
 *      derivada por regra erra — Itajubá→UNIFEI não UFI, Catalão→UFCAT não
 *      UFC).
 *
 * O QUE ISTO DELIBERADAMENTE NÃO TENTA RESOLVER:
 *   - Instituição fora da tabela curada com grafias DIFERENTES entre fontes
 *     que não sejam "Fundação "/"SIGLA - " (ex. abreviação parcial livre,
 *     erro de digitação, ordem de palavras trocada) — o fallback normaliza
 *     só acentuação/caixa/pontuação, não reescreve o nome. Duas fontes que
 *     descrevem a MESMA instituição nova de jeitos estruturalmente
 *     diferentes continuam como duplicata até alguém curar a entrada em
 *     `lib/siglas.js` (mesma governança da tabela hoje: só entra sigla
 *     verificável, nunca chute).
 *   - Sigla ambígua que colide com outra instituição (o mesmo cuidado que
 *     `_norman/cobertura-siglas.js` já audita para a UF) — este módulo não
 *     duplica essa auditoria; se a tabela curada tiver uma colisão, ela
 *     colide aqui também. A prova fica nos testes de guarda (pares
 *     negativos).
 *   - Variação de campus/unidade dentro da MESMA instituição (ex. "UFSCar -
 *     campus Sorocaba" vs "UFSCar - campus São Carlos") — `canonizar` opera
 *     só sobre o nome da instituição-mãe; campus é campo separado no schema
 *     (`campus`) e não faz parte da chave de dedupe pedida pelo briefing
 *     (`canonizar(orgao) + area + data_publicacao`).
 */

const PREFIXO_FUNDACAO = /^fundacao\s+/;

function stripAcentos(valor) {
  return String(valor == null ? '' : valor).normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** accent-fold + lowercase + pontuação fora + espaço colapsado. Idempotente. */
function normalizarBase(valor) {
  return stripAcentos(valor)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizarInstituicao(valor) {
  return normalizarBase(valor).replace(PREFIXO_FUNDACAO, '');
}

/**
 * Índice bidirecional da tabela curada: nome-extenso normalizado → sigla,
 * E sigla normalizada → ela mesma (pra candidato que já É a sigla, tipo o
 * primeiro pedaço de "UFSCar - Universidade Federal de São Carlos", resolver
 * direto sem precisar do nome por extenso). Construído uma vez, no load do
 * módulo — `SIGLAS` não muda em runtime.
 */
function construirIndice(siglas) {
  const indice = new Map();
  for (const [nomeExtenso, sigla] of Object.entries(siglas)) {
    indice.set(normalizarInstituicao(nomeExtenso), sigla);
    indice.set(normalizarInstituicao(sigla), sigla);
  }
  return indice;
}

const INDICE = construirIndice(SIGLAS);

/** Divide "SIGLA - Nome completo" (formato da PCI) em candidatos; string inteira sempre incluída. */
function candidatosDe(orgao) {
  const bruto = String(orgao == null ? '' : orgao);
  const partes = bruto.split(/\s*[-–—]\s+/).map(p => p.trim()).filter(Boolean);
  const candidatos = [bruto, ...partes];
  // dedup preservando ordem
  return [...new Set(candidatos)];
}

/**
 * Reduz uma string de órgão a uma chave canônica estável, pra uso EXCLUSIVO
 * no dedupe (nunca no `id`). Nunca lança — entrada vazia/null vira ''.
 * Pura, sem I/O. Idempotente: canonizar(canonizar(x)) === canonizar(x).
 */
function canonizar(orgao) {
  const candidatos = candidatosDe(orgao);

  for (const candidato of candidatos) {
    const chave = normalizarInstituicao(candidato);
    if (chave && INDICE.has(chave)) {
      return normalizarInstituicao(INDICE.get(chave));
    }
  }

  // Fallback: nenhum candidato bateu a tabela curada — usa o mais longo
  // (nome por extenso, não a sigla solta) normalizado como está.
  const semVazios = candidatos.filter(Boolean);
  if (semVazios.length === 0) return '';
  const maisLongo = semVazios.reduce((a, b) => (b.length > a.length ? b : a));
  return normalizarInstituicao(maisLongo);
}

module.exports = { canonizar, normalizarBase, normalizarInstituicao, _internal: { candidatosDe, INDICE } };
