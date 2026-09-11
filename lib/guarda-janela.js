'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Guarda de janela do rodar-diario.bat — Rota Hermes, Fase F0
 * (.claude/plans/rota-hermes-turno-autonomo.md §5 F0).
 *
 * SUBSTITUI a guarda antiga de "1x por dia civil" (data/ultima-execucao.json
 * com { data, executado_em }, que fazia o radar rodar de fato 1x/dia, não
 * 3x — os 3 gatilhos diários eram só redundância pra PC desligado) por uma
 * guarda de JANELA DESLIZANTE, com janela PRÓPRIA por trilha:
 *
 *   - trilha "vaga"    (coletar/julgar/ativar-notificacoes/notificar/
 *                        sincronizar-sheets de vaga)      -> janela 2h
 *   - trilha "noticia" (noticias.js coletar/sincronizar-sheets)
 *                                                          -> janela 8h
 *
 * A janela de notícia é MAIOR de propósito, não por descuido. Hoje (medido
 * em fontes-noticias/index.js) a trilha notícia varre 66 fontes RSS/Atom de
 * requisição única (geral+ia+trabalho+ciencia) + Hacker News (5 chamadas
 * Algolia) + Reddit — e Reddit tem throttle DELIBERADO de 30s fixos entre
 * cada um dos 5 subreddits (RADAR_NOTICIAS_REDDIT_THROTTLE_MS, ver
 * fontes-noticias/reddit.js) especificamente para não levar 429 da Reddit.
 * Rodar essa trilha de 2h em 2h multiplicaria por ~4x (24h/2h vs 24h/8h) o
 * volume de requests contra as mesmas fontes, trocando um throttle calibrado
 * por risco real de bloqueio — e sem ganho real: JB quer o briefing de
 * notícia poucas vezes/dia (o pedido original fala em "por volta das 8"),
 * não notícia nova a cada 2h. A trilha vaga, ao contrário, é o que JB quer
 * "o tempo inteiro" — daí a janela de 2h nela.
 *
 * FORMATO DO ARQUIVO (data/ultima-execucao.json) — MIGRAÇÃO:
 *
 *   Formato novo:    { "vaga": { "executado_em": ISO },
 *                       "noticia": { "executado_em": ISO } }
 *   Formato antigo (pré-F0): { "data": "YYYY-MM-DD", "executado_em": ISO }
 *     — escrito quando vaga E notícia rodavam SEMPRE juntas, no mesmo
 *     batch, guardadas por dia civil único (nunca havia as duas trilhas
 *     rodando em momentos diferentes).
 *
 *   DECISÃO DE MIGRAÇÃO (declarada, não implícita): uma marca em formato
 *   antigo é lida como se APLICASSE ÀS DUAS TRILHAS — vaga E notícia
 *   recebem o mesmo `executado_em` do formato antigo (ver `normalizar()`).
 *   Por quê: no regime antigo as duas trilhas de fato rodaram e fecharam
 *   limpas juntas naquele instante — não é invenção, é o fato registrado.
 *   Essa leitura evita os dois riscos simétricos que uma migração ingênua
 *   cometeria: (a) CRASH por formato desconhecido (se o código exigisse o
 *   formato novo sem tolerar o antigo); e (b) EXECUÇÃO EM LOOP/DUPLICADA —
 *   se a marca antiga fosse simplesmente ignorada, as duas trilhas se
 *   achariam "nunca executadas" na primeira leitura pós-migração e
 *   colidiriam com o que JÁ rodou no regime antigo no mesmo dia civil. A
 *   marca antiga NUNCA é reescrita de volta no formato antigo — a primeira
 *   chamada a `registrarExecucao()` já grava no formato novo, por trilha,
 *   preservando a entrada da trilha que não rodou nessa chamada.
 */

const JANELAS_MS = Object.freeze({
  vaga: 2 * 60 * 60 * 1000,
  noticia: 8 * 60 * 60 * 1000
});

const CAMINHO_PADRAO = path.join(__dirname, '..', 'data', 'ultima-execucao.json');

function trilhaValida(trilha) {
  return Object.prototype.hasOwnProperty.call(JANELAS_MS, trilha);
}

/** Lê e faz `JSON.parse` do arquivo. Ausente/ilegível/JSON inválido -> `null` (nunca lança — "nunca rodou" é um estado válido, não um erro). */
function lerBruto(caminho) {
  try {
    const conteudo = fs.readFileSync(caminho, 'utf8');
    const json = JSON.parse(conteudo);
    if (json && typeof json === 'object') return json;
  } catch (e) {
    // arquivo ausente, ilegível ou JSON invalido - trata como "nunca rodou"
  }
  return null;
}

/**
 * Normaliza o conteúdo bruto do arquivo pro formato novo `{ vaga, noticia }`.
 * Ver "DECISÃO DE MIGRAÇÃO" no cabeçalho deste arquivo para o raciocínio.
 */
function normalizar(bruto) {
  if (!bruto || typeof bruto !== 'object') return {};

  const pareceFormatoNovo = Boolean(bruto.vaga || bruto.noticia);
  if (pareceFormatoNovo) {
    const out = {};
    for (const trilha of Object.keys(JANELAS_MS)) {
      const entrada = bruto[trilha];
      if (entrada && typeof entrada.executado_em === 'string') {
        out[trilha] = { executado_em: entrada.executado_em };
      }
    }
    return out;
  }

  // Formato antigo: { data, executado_em } - aplica o mesmo instante às
  // duas trilhas (ver cabeçalho, "DECISÃO DE MIGRAÇÃO").
  if (typeof bruto.executado_em === 'string') {
    return {
      vaga: { executado_em: bruto.executado_em },
      noticia: { executado_em: bruto.executado_em }
    };
  }

  return {};
}

function obterUltimaExecucao(trilha, caminho = CAMINHO_PADRAO) {
  if (!trilhaValida(trilha)) throw new Error('guarda-janela: trilha inválida: ' + trilha);
  const marca = normalizar(lerBruto(caminho));
  const entrada = marca[trilha];
  if (!entrada) return null;
  const data = new Date(entrada.executado_em);
  if (Number.isNaN(data.getTime())) return null;
  return data;
}

/**
 * `true` = ainda dentro da janela da trilha (deve PULAR a execução);
 * `false` = janela expirou ou a trilha nunca rodou (deve RODAR).
 * `agora` no futuro em relação à marca é o caso normal; se a marca estiver
 * no futuro em relação a `agora` (relógio ajustado pra trás, marca corrompida
 * manualmente) trata como fora da janela — não deve pular pra sempre.
 */
function dentroDaJanela(trilha, agora = new Date(), caminho = CAMINHO_PADRAO) {
  const ultima = obterUltimaExecucao(trilha, caminho);
  if (!ultima) return false;
  const decorrido = agora.getTime() - ultima.getTime();
  return decorrido >= 0 && decorrido < JANELAS_MS[trilha];
}

/**
 * Grava a marca da trilha com o instante `agora`, preservando a entrada da
 * OUTRA trilha (lê, normaliza, atualiza só a chave pedida, escreve de
 * volta). Critério de "pode marcar" é do CHAMADOR (rodar-diario.bat decide
 * se a trilha fechou limpa) — esta função só persiste, nunca decide.
 */
function registrarExecucao(trilha, agora = new Date(), caminho = CAMINHO_PADRAO) {
  if (!trilhaValida(trilha)) throw new Error('guarda-janela: trilha inválida: ' + trilha);
  const atual = normalizar(lerBruto(caminho));
  atual[trilha] = { executado_em: agora.toISOString() };
  fs.mkdirSync(path.dirname(caminho), { recursive: true });
  fs.writeFileSync(caminho, JSON.stringify(atual, null, 2) + '\n');
  return atual;
}

module.exports = {
  JANELAS_MS,
  CAMINHO_PADRAO,
  trilhaValida,
  lerBruto,
  normalizar,
  obterUltimaExecucao,
  dentroDaJanela,
  registrarExecucao
};

// CLI, usado pelo rodar-diario.bat (node não tem forma limpa de retornar
// booleano de um `-e` sem duplicar esta lógica inline no .bat de novo):
//
//   node lib/guarda-janela.js pular  <vaga|noticia> [--caminho=...]
//     -> exit 1 se DEVE PULAR (dentro da janela); exit 0 se pode rodar.
//   node lib/guarda-janela.js marcar <vaga|noticia> [--caminho=...]
//     -> grava a execução AGORA para a trilha; exit 0.
if (require.main === module) {
  const [comando, trilha, ...resto] = process.argv.slice(2);
  const argCaminho = resto.find(a => a.startsWith('--caminho='));
  const caminho = argCaminho ? argCaminho.slice('--caminho='.length) : CAMINHO_PADRAO;

  if (!comando || !trilha || !trilhaValida(trilha)) {
    console.error('[guarda-janela] uso: node lib/guarda-janela.js <pular|marcar> <vaga|noticia> [--caminho=...]');
    process.exit(2);
  }

  if (comando === 'pular') {
    const agora = new Date();
    const deve = dentroDaJanela(trilha, agora, caminho);
    if (deve) {
      const ultima = obterUltimaExecucao(trilha, caminho);
      const janelaH = JANELAS_MS[trilha] / (60 * 60 * 1000);
      console.error(
        '[guarda-janela] trilha=' + trilha + ' dentro da janela de ' + janelaH + 'h' +
        ' (ultima execucao=' + (ultima ? ultima.toISOString() : '?') + ', agora=' + agora.toISOString() + ')' +
        ' - PULAR.'
      );
    }
    process.exit(deve ? 1 : 0);
  } else if (comando === 'marcar') {
    registrarExecucao(trilha, new Date(), caminho);
    process.exit(0);
  } else {
    console.error('[guarda-janela] comando desconhecido: ' + comando);
    process.exit(2);
  }
}
