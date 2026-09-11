'use strict';

/**
 * Helpers de data no formato DD-MM-AAAA usado pela fonte DOU (item 1 do
 * briefing Onda 1.5 — backfill). Funções puras, sem I/O.
 */

function parseDataBR(str) {
  const m = String(str || '').match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!m) throw new Error(`data inválida (esperado DD-MM-AAAA): "${str}"`);
  const dia = Number(m[1]);
  const mes = Number(m[2]);
  const ano = Number(m[3]);
  // meio-dia local evita virada de dia por fuso horário em setDate/comparações
  const data = new Date(ano, mes - 1, dia, 12, 0, 0);
  if (data.getDate() !== dia || data.getMonth() !== mes - 1 || data.getFullYear() !== ano) {
    throw new Error(`data inválida (dia/mês fora do calendário): "${str}"`);
  }
  return data;
}

function formatarDataBR(date) {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}-${m}-${y}`;
}

/**
 * Gera a lista de datas (DD-MM-AAAA), em ordem cronológica, do intervalo
 * [de, ate] inclusive.
 */
function gerarIntervaloDatas(de, ate) {
  const inicio = parseDataBR(de);
  const fim = parseDataBR(ate);
  if (inicio > fim) {
    throw new Error(`intervalo inválido: --de (${de}) é depois de --ate (${ate})`);
  }
  const datas = [];
  const cursor = new Date(inicio);
  while (cursor <= fim) {
    datas.push(formatarDataBR(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return datas;
}

/**
 * true para sábado/domingo — usado só para contextualizar alertas de saúde
 * (dia não útil pode legitimamente ter volume baixo/zero), nunca para
 * suprimir o alerta.
 */
function ehFimDeSemana(dataBR) {
  const dia = parseDataBR(dataBR).getDay(); // 0 = domingo, 6 = sábado
  return dia === 0 || dia === 6;
}

module.exports = { parseDataBR, formatarDataBR, gerarIntervaloDatas, ehFimDeSemana };
