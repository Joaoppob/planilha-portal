'use strict';

const fs = require('fs');
const path = require('path');
const dou = require('../fontes/dou');

/**
 * Orquestração da hipótese DOU × Institutos Federais (item 2 do briefing
 * Onda 1.5). Roda durante o backfill, sobre os itens que `fonte.coletar()`
 * já trouxe para aquele dia (zero requisições extra de listagem).
 *
 * Registra TODO aviso IF-substituto reconhecido (listagem, custo zero) em
 * `data/backfill-if-amostra.jsonl` — isso dá números reais de "quantos
 * avisos" e "quantos institutos distintos" sem estimativa.
 *
 * Enriquece (busca o artigo completo — 1 requisição extra) só até um teto
 * (`estado.cap`, default 15) para responder "o aviso já traz titulação, ou
 * só remete ao site do IF?" com uma AMOSTRA, sem multiplicar centenas de
 * fetches num backfill de 12 meses. Documentado como amostra no relatório,
 * nunca apresentado como o universo inteiro.
 */

const DATA_DIR = path.join(__dirname, '..', 'data');
const AMOSTRA_PATH = path.join(DATA_DIR, 'backfill-if-amostra.jsonl');
const CAP_PADRAO = 15;

function garantirDiretorio(amostraPath) {
  const dir = path.dirname(amostraPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function registrar(registro, amostraPath = AMOSTRA_PATH) {
  garantirDiretorio(amostraPath);
  fs.appendFileSync(amostraPath, JSON.stringify(registro) + '\n', 'utf8');
  return registro;
}

function carregarTudo(amostraPath = AMOSTRA_PATH) {
  if (!fs.existsSync(amostraPath)) return [];
  return fs
    .readFileSync(amostraPath, 'utf8')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .map(l => JSON.parse(l));
}

function novoEstado(cap = CAP_PADRAO) {
  return { amostrados: 0, cap };
}

/**
 * Processa os itens (já buscados) de UM dia. Não faz requisição de listagem
 * — só, no máximo, `estado.cap - estado.amostrados` requisições de artigo
 * completo para os avisos reconhecidos como IF-substituto.
 */
async function processarDia(itens, dataStr, estado, { amostraPath = AMOSTRA_PATH, pausaMs = 300 } = {}) {
  let encontrados = 0;
  for (const rawItem of itens) {
    if (!dou.pareceAvisoIFSubstituto(rawItem)) continue;
    encontrados++;
    const base = {
      data: dataStr,
      instituto: dou.nomeInstitutoFederal(rawItem),
      titulo: rawItem.title,
      pubDate: rawItem.pubDate,
      url: dou._internal.urlCanonica(rawItem)
    };
    if (estado.amostrados < estado.cap) {
      const amostra = await dou.amostraTitulacaoIF(rawItem);
      registrar({ ...base, ...amostra, amostrado: true }, amostraPath);
      estado.amostrados++;
      await new Promise(r => setTimeout(r, pausaMs));
    } else {
      registrar({ ...base, amostrado: false }, amostraPath);
    }
  }
  return { encontrados };
}

module.exports = { AMOSTRA_PATH, CAP_PADRAO, registrar, carregarTudo, novoEstado, processarDia };
