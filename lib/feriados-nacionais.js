'use strict';

/**
 * Feriados nacionais (item 5 do briefing Onda 1.6 — verificação pontual):
 * o DOU (Diário Oficial da UNIÃO) não publica em feriado nacional, do mesmo
 * jeito que não publica sábado/domingo. `lib/saude.js` usa isto pra não
 * confundir "dia sem publicação esperada" com "coletor quebrado" — sem
 * isto, um radar agendado diariamente dispara alerta CRÍTICO todo fim de
 * semana e feriado (12 dias/ano medidos no backfill, ver RELATORIO-BACKFILL.md
 * §1), e "um radar que grita todo sábado é um radar que JB silencia".
 *
 * Escopo: só feriados NACIONAIS fixos + móveis baseados na Páscoa — feriados
 * estaduais/municipais/pontos facultativos não afetam a publicação federal
 * e ficam de fora de propósito (não são "dia sem publicação" garantido).
 */

const FIXOS_DD_MM = [
  '01-01', // Confraternização Universal
  '21-04', // Tiradentes
  '01-05', // Dia do Trabalho
  '07-09', // Independência do Brasil
  '12-10', // Nossa Senhora Aparecida
  '02-11', // Finados
  '15-11', // Proclamação da República
  '20-11', // Dia Nacional de Zumbi e da Consciência Negra (Lei 14.759/2023)
  '25-12' // Natal
];

/**
 * Data da Páscoa (domingo) pelo algoritmo de Meeus/Jones/Butcher (calendário
 * gregoriano) — verificado contra datas públicas conhecidas: 2024-03-31,
 * 2025-04-20, 2026-04-05 (ver tests/feriados-nacionais.test.js).
 */
function calcularPascoa(ano) {
  const a = ano % 19;
  const b = Math.floor(ano / 100);
  const c = ano % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31);
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(ano, mes - 1, dia);
}

function somarDias(data, dias) {
  const d = new Date(data);
  d.setDate(d.getDate() + dias);
  return d;
}

/**
 * Feriados nacionais móveis (calculados a partir da Páscoa) que suspendem
 * expediente/publicação federal: Carnaval (terça, ponto facultativo de fato
 * observado pelo Judiciário/Executivo federal) e Sexta-feira Santa. Corpus
 * Christi é ponto facultativo (não feriado nacional formal por lei), mas
 * historicamente sem publicação no DOU — incluído por segurança (falso
 * positivo aqui — supressão indevida de alerta em dia que teve publicação —
 * é o lado errado pra errar, ver nota abaixo).
 */
function feriadosMoveis(ano) {
  const pascoa = calcularPascoa(ano);
  return [somarDias(pascoa, -47), somarDias(pascoa, -2), somarDias(pascoa, 60)];
}

function formatarDDMM(data) {
  const d = String(data.getDate()).padStart(2, '0');
  const m = String(data.getMonth() + 1).padStart(2, '0');
  return `${d}-${m}`;
}

function mesmaData(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function ehFeriadoNacional(data) {
  if (FIXOS_DD_MM.includes(formatarDDMM(data))) return true;
  return feriadosMoveis(data.getFullYear()).some(f => mesmaData(f, data));
}

function ehFimDeSemana(data) {
  const dia = data.getDay(); // 0 = domingo, 6 = sábado
  return dia === 0 || dia === 6;
}

/**
 * true se o DOU normalmente NÃO publica nesta data (fim de semana OU
 * feriado nacional). Nota de risco assumido conscientemente: incluir
 * Corpus Christi (ponto facultativo, não feriado de lei) pode suprimir um
 * alerta em algum ano raro em que o DOU publique nesse dia — aceitável
 * porque o dano de um falso "atenção suprimido" é baixo (paridade com os
 * outros 115 dias/ano já sem alerta) contra o dano de manter o flood
 * semanal que faz JB silenciar o canal inteiro.
 */
function diaSemPublicacaoEsperada(data) {
  return ehFimDeSemana(data) || ehFeriadoNacional(data);
}

module.exports = {
  ehFeriadoNacional,
  ehFimDeSemana,
  diaSemPublicacaoEsperada,
  calcularPascoa,
  _internal: { FIXOS_DD_MM, feriadosMoveis }
};
