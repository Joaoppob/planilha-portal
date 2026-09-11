'use strict';

const dados = require('../config/universidades-uf.json');

const entradas = Object.entries(dados)
  .filter(([chave]) => !chave.startsWith('_'))
  .sort((a, b) => b[0].length - a[0].length); // nome mais longo primeiro (evita match parcial errado)

/**
 * Busca UF por substring do nome da instituição (orgao) ou da hierarquia
 * completa da fonte. Lookup estático best-effort (config/universidades-uf.json)
 * — sem match, retorna null. Nunca inventa UF.
 */
function buscarUf(orgao, hierarchyStr) {
  const alvo = `${orgao || ''} ${hierarchyStr || ''}`.toLowerCase();
  for (const [nome, uf] of entradas) {
    if (alvo.includes(nome.toLowerCase())) return uf;
  }
  return null;
}

const SIGLAS_UF = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG',
  'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'
];
const SET_SIGLAS_UF = new Set(SIGLAS_UF);

const NOME_ESTADO_PARA_UF = {
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
    .toLowerCase();
}

// "Estado de/do/da <Nome>" — os 27 nomes de estado são um conjunto finito e
// conhecido, então este padrão é ALTA confiança (não é adivinhação de cidade,
// é o texto do próprio edital nomeando o estado por extenso). Ex.: "no Estado
// de São Paulo", "no Estado do Rio de Janeiro".
const RE_ESTADO_POR_EXTENSO = /\bestado\s+d[eoa]\s+([A-ZÀ-Ý][a-zà-ÿ]+(?:\s+[a-zà-ÿ]{1,4}\s+[A-ZÀ-Ý][a-zà-ÿ]+|\s+[A-ZÀ-Ý][a-zà-ÿ]+){0,3})/i;

// "Cidade/UF" ou "Cidade - UF" — comum em endereço/campus de edital
// ("Sorocaba/SP", "Campus Cristalina - GO"). Exige um nome capitalizado
// imediatamente antes da sigla (reduz falso-positivo de siglas soltas tipo
// "DE R$") e valida a sigla contra a lista fechada de 27 UFs.
const RE_CIDADE_UF = /\b[A-ZÀ-Ý][a-zà-ÿ]+(?:\s+(?:d[eoa]s?|[A-ZÀ-Ý][a-zà-ÿ]+)){0,3}\s*[-/]\s*([A-Z]{2})\b/g;

/**
 * Extrai UF do texto integral do edital, quando o lookup por nome de
 * instituição (buscarUf) não encontrar nada — item 2 do briefing Onda 1.7
 * ("fechar a lacuna de UF"). Duas heurísticas, nessa ordem de confiança:
 *
 *   1. "Estado de/do/da <nome por extenso>" — o texto nomeia o estado
 *      diretamente; conjunto fechado de 27 nomes, sem ambiguidade de cidade.
 *   2. "Cidade/UF" ou "Cidade - UF" — padrão comum de endereço/campus;
 *      valida a sigla contra a lista de 27 UFs (não aceita qualquer par de
 *      maiúsculas — evita bater em abreviações como "DE R$" ou siglas de
 *      departamento).
 *
 * Nunca inventa: sem nenhum dos dois padrões, retorna null (o chamador
 * mantém uf: null, como já documentado em config/universidades-uf.json).
 */
function extrairUfDoTexto(texto) {
  const t = String(texto || '');
  if (!t) return null;

  const mEstado = RE_ESTADO_POR_EXTENSO.exec(t);
  if (mEstado) {
    const nomeNorm = semAcento(mEstado[1]).replace(/\s+/g, ' ').trim();
    const uf = NOME_ESTADO_PARA_UF[nomeNorm];
    if (uf) return uf;
  }

  RE_CIDADE_UF.lastIndex = 0;
  let mCidade;
  while ((mCidade = RE_CIDADE_UF.exec(t)) !== null) {
    const sigla = mCidade[1].toUpperCase();
    if (SET_SIGLAS_UF.has(sigla)) return sigla;
  }

  return null;
}

/**
 * Orquestra a resolução de UF (item 2 do briefing Onda 1.7): tenta o lookup
 * por instituição primeiro (mais confiável — nome de órgão é estável),
 * cai pro texto do edital só se o lookup não encontrar nada. Usado tanto no
 * pipeline ao vivo (radar.js, depois do enriquecimento) quanto no
 * reprocessamento offline (lib/reprocessar.js) — mesma função, mesma regra,
 * sem duplicar lógica.
 */
function resolverUf({ orgao, hierarchyStr, texto } = {}) {
  return buscarUf(orgao, hierarchyStr) || extrairUfDoTexto(texto);
}

module.exports = { buscarUf, extrairUfDoTexto, resolverUf, SIGLAS_UF };
