'use strict';

const fs = require('fs');
const path = require('path');
const datas = require('./datas');
const feriados = require('./feriados-nacionais');
const modoSeco = require('./modo-seco');

/**
 * Saúde barulhenta (item 3 do briefing Onda 1.5 — requisito duro).
 *
 * "0 itens relevantes" e "coletor quebrado" precisam ser DISTINGUÍVEIS. Este
 * módulo registra, para toda coleta (comando `coletar` OU `backfill`), o
 * volume bruto observado (quantas publicações a fonte trouxe naquele dia
 * ANTES de qualquer filtro) e avalia se aquele número é saudável.
 *
 * Log append-only em JSONL (mesmo padrão de lib/store.js) — nunca versionado
 * (data/ está no .gitignore da raiz).
 */

const DATA_DIR = path.join(__dirname, '..', 'data');
const SAUDE_PATH = path.join(DATA_DIR, 'saude.jsonl');

function garantirDiretorio(saudePath) {
  const dir = path.dirname(saudePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function carregarTudo(saudePath = SAUDE_PATH) {
  if (!fs.existsSync(saudePath)) return [];
  return fs
    .readFileSync(saudePath, 'utf8')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .map(l => JSON.parse(l));
}

/**
 * `dataAlvo` do registro de saúde é 'DD-MM-AAAA', 'hoje'/undefined
 * (coleta do dia corrente) ou uma string inválida — nunca lança: quando não
 * dá pra decidir, retorna null e o chamador fica do lado seguro (mantém o
 * nível crítico, não suprime).
 */
function dataAlvoParaDate(dataAlvo) {
  if (!dataAlvo || dataAlvo === 'hoje') return new Date();
  try {
    return datas.parseDataBR(dataAlvo);
  } catch {
    return null;
  }
}

/**
 * Avalia a saúde de uma coleta a partir do volume bruto observado.
 *
 *   erro presente                -> crítico (a requisição falhou — nunca é
 *                                    "0 vagas hoje", é "não sei se teve vaga")
 *   volumeBruto === 0/null       -> crítico, EXCETO se `dataAlvo` cai num dia
 *                                    em que o DOU normalmente não publica
 *                                    (fim de semana ou feriado nacional —
 *                                    lib/feriados-nacionais.js): aí é 'ok',
 *                                    porque zero ali é o comportamento
 *                                    normal, não falha do coletor (item 5 do
 *                                    briefing Onda 1.6 — "um radar que grita
 *                                    todo sábado é um radar que JB
 *                                    silencia"). Sem `dataAlvo` decifrável,
 *                                    fica crítico (lado seguro).
 *   volumeBruto < faixaMin       -> atenção (fora da faixa normal estabelecida
 *                                    pelo backfill, mas não é silêncio total)
 *   caso contrário               -> ok
 */
function avaliar({ volumeBruto, erro, faixaMin, dataAlvo }) {
  if (erro) {
    return { nivel: 'critico', ok: false, motivo: `requisição falhou: ${erro}` };
  }
  if (volumeBruto === 0 || volumeBruto === null || volumeBruto === undefined) {
    const data = dataAlvoParaDate(dataAlvo);
    if (data && feriados.diaSemPublicacaoEsperada(data)) {
      return {
        nivel: 'ok',
        ok: true,
        motivo: 'volume bruto zero em dia sem publicação esperada (fim de semana ou feriado nacional) — comportamento normal do DOU, não indica falha do coletor'
      };
    }
    return {
      nivel: 'critico',
      ok: false,
      motivo: 'volume bruto zero — coletor pode estar quebrado (layout mudou, WAF bloqueou) ou a fonte não publicou nada'
    };
  }
  if (typeof faixaMin === 'number' && volumeBruto < faixaMin) {
    return {
      nivel: 'atencao',
      ok: false,
      motivo: `volume bruto (${volumeBruto}) abaixo da faixa normal (mínimo esperado: ${faixaMin}) — checar se o layout da fonte mudou`
    };
  }
  return { nivel: 'ok', ok: true, motivo: null };
}

/**
 * Registra um resultado de coleta no log de saúde. Retorna o registro
 * completo (com timestamp) já gravado.
 */
/**
 * ÚNICO ponto de escrita física do log de saúde (o `fs.appendFileSync`).
 * Guardado aqui, não em cada chamador (ver lib/modo-seco.js) — é o achado
 * exato do incidente da Onda 12-13: `--dry-run` suprimia só o alerta do
 * Telegram, nunca esta escrita, porque `registrarSaudeEAlertar` sempre
 * chamava `registrar` incondicionalmente antes de decidir sobre o alerta.
 */
function registrar(registro, saudePath = SAUDE_PATH) {
  const completo = { ...registro, registrado_em: new Date().toISOString() };
  if (modoSeco.estaAtivo()) {
    console.log(`[saude] MODO SECO — recusado registrar fonte=${registro && registro.fonte} em ${saudePath}; nada escrito.`);
    return completo;
  }
  garantirDiretorio(saudePath);
  fs.appendFileSync(saudePath, JSON.stringify(completo) + '\n', 'utf8');
  return completo;
}

/**
 * Último registro de saúde de uma fonte — usado por `node radar.js status`
 * pra mostrar a saúde da ÚLTIMA coleta, não só a contagem do store.
 */
function ultimoRegistro(fonteId, saudePath = SAUDE_PATH) {
  const todos = carregarTudo(saudePath).filter(r => r.fonte === fonteId);
  if (!todos.length) return null;
  return todos[todos.length - 1];
}

module.exports = { SAUDE_PATH, DATA_DIR, carregarTudo, avaliar, registrar, ultimoRegistro };
