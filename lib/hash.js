'use strict';

const crypto = require('crypto');

/**
 * Normaliza uma chave para hashing: trim, lowercase, string.
 * Evita que diferenças triviais de formatação (espaço, caixa) quebrem
 * a estabilidade do id entre execuções.
 */
function normalizarChave(valor) {
  return String(valor == null ? '' : valor).trim().toLowerCase();
}

/**
 * Gera o id estável de um registro de oportunidade.
 *
 * Regra dura (briefing): hash de órgão + área + data de publicação + url
 * canônica — NUNCA do HTML/texto bruto inteiro, que muda entre requisições
 * (timestamps, contadores, HTML minificado diferente) e quebraria o dedupe.
 *
 * `subedital` (opcional, Onda 1.6): quando um edital-guarda-chuva vira
 * vários registros (um por subedital de área distinta — ver
 * lib/subedital-extrator.js), orgao+area+data+url sozinhos colidiriam se
 * dois subeditais do MESMO edital caíssem na MESMA área (ex.: dois
 * departamentos diferentes abrindo vaga de "Design" no mesmo edital). Campo
 * ausente (chamadas antigas) normaliza pra string vazia — não muda o id de
 * registros de edital único já existentes no store.
 */
function gerarId({ orgao, area, data_publicacao, url, subedital }) {
  const chave = [orgao, area, data_publicacao, url, subedital].map(normalizarChave).join('|');
  return crypto.createHash('sha256').update(chave, 'utf8').digest('hex').slice(0, 20);
}

module.exports = { gerarId, normalizarChave };
