'use strict';

const fs = require('fs');
const path = require('path');
const modoSeco = require('./modo-seco');

/**
 * Estado de retomada do backfill (item 1 do briefing Onda 1.5: "se
 * interromper, continua de onde parou — não recomeçar 365 dias").
 *
 * Um único arquivo (não versionado, data/ está no .gitignore da raiz) guarda
 * o intervalo pedido e a última data já processada com sucesso. Se o
 * intervalo pedido numa nova chamada bate com o salvo, retoma depois da
 * última data processada; se for um intervalo diferente, começa do zero
 * (loga aviso, não mistura progresso de dois backfills diferentes).
 */

const DATA_DIR = path.join(__dirname, '..', 'data');
const PROGRESSO_PATH = path.join(DATA_DIR, 'backfill-progresso.json');

function garantirDiretorio(progressoPath) {
  const dir = path.dirname(progressoPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function estadoNovo(de, ate) {
  return { de, ate, ultimaDataProcessada: null, concluido: false, erros: [] };
}

function carregar(de, ate, progressoPath = PROGRESSO_PATH) {
  if (!fs.existsSync(progressoPath)) return estadoNovo(de, ate);
  let salvo;
  try {
    salvo = JSON.parse(fs.readFileSync(progressoPath, 'utf8'));
  } catch (err) {
    console.error(`[backfill] progresso salvo corrompido (${err.message}) — iniciando do zero`);
    return estadoNovo(de, ate);
  }
  if (salvo.de !== de || salvo.ate !== ate) {
    console.log(
      `[backfill] progresso salvo era de outro intervalo (${salvo.de}..${salvo.ate}); pedido atual é ${de}..${ate} — iniciando novo intervalo do zero`
    );
    return estadoNovo(de, ate);
  }
  return salvo;
}

/**
 * ÚNICO ponto de escrita física do progresso de retomada (o
 * `fs.writeFileSync`). Guardado aqui, não em `marcarProcessada`/
 * `marcarConcluido` individualmente (ver lib/modo-seco.js) — e o motivo vai
 * além do padrão geral do módulo: se um `backfill --dry-run` marcasse dias
 * como processados aqui sem ter de fato gravado nada em `data/store.jsonl`,
 * uma execução REAL subsequente pularia esses dias por achar que já tinham
 * sido feitos — perda de dado silenciosa por trás de um `--dry-run` que
 * deveria ser inofensivo.
 */
function salvar(progresso, progressoPath = PROGRESSO_PATH) {
  if (modoSeco.estaAtivo()) {
    console.log(`[backfill-progresso] MODO SECO — recusado gravar progresso em ${progressoPath}; nada escrito.`);
    return progresso;
  }
  garantirDiretorio(progressoPath);
  fs.writeFileSync(progressoPath, JSON.stringify(progresso, null, 2), 'utf8');
  return progresso;
}

function marcarProcessada(progresso, dataStr, { erro } = {}, progressoPath = PROGRESSO_PATH) {
  progresso.ultimaDataProcessada = dataStr;
  if (erro) progresso.erros.push({ data: dataStr, erro });
  return salvar(progresso, progressoPath);
}

function marcarConcluido(progresso, progressoPath = PROGRESSO_PATH) {
  progresso.concluido = true;
  return salvar(progresso, progressoPath);
}

module.exports = { PROGRESSO_PATH, DATA_DIR, estadoNovo, carregar, salvar, marcarProcessada, marcarConcluido };
