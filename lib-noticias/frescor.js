'use strict';

/**
 * GUARDA DE FRESCOR — o instrumento central desta entrega.
 *
 * POR QUE ELA EXISTE, com o caso medido:
 *
 * `https://g1.globo.com/rss/g1/concursos-e-emprego/` responde **HTTP 200,
 * com 100 `<item>` bem formados** — e todos os `pubDate` são de 2017-2018.
 * É um feed abandonado que continua servindo cache antigo. Qualquer
 * validação por status (`res.ok`), por contagem de itens (`volumeBruto > 0`)
 * ou por "o XML parseou" declara essa fonte SAUDÁVEL. Nahida só pegou porque
 * abriu a data de verdade.
 *
 * Esse é o modo de falha que este pipeline inteiro precisa não repetir:
 * silêncio disfarçado de sucesso. `lib/saude.js` (trilha DOU) já cobre o
 * caso "volume caiu a zero"; ele NÃO cobre "volume normal, conteúdo
 * fossilizado" — são defeitos diferentes e o segundo é invisível ao
 * primeiro.
 *
 * DECISÃO DE PROJETO: a guarda é uma **função pura sobre os itens já
 * parseados**, não um teste de rede. Isso a torna testável com fixture
 * (`tests/noticias-frescor.test.js` monta um feed sintético com datas de
 * 2018 e exige rejeição) — e, principalmente, ela **aborta sozinha**: não
 * depende de ninguém lembrar de olhar um relatório. Fonte reprovada não
 * entra no lote, ponto; o motivo vai pro log com a data medida.
 *
 * DUAS SITUAÇÕES QUE A GUARDA TRATA SEPARADAMENTE, DE PROPÓSITO:
 *
 * - `sem_data`: NENHUM item do feed tem data parseável (caso real: Agência
 *   FAPESP, cujo `<item>` não tem `pubDate` — só `lastBuildDate` no
 *   `<channel>`). Isso NÃO é o mesmo que "feed velho". A guarda devolve
 *   `aprovado: false, motivo: 'sem_data'` por padrão, porque um item sem
 *   data não pode entrar na janela de ±36h do cluster nem nos recortes de
 *   3 dias/semana/mês sem que alguém invente uma data pra ele. Fonte que
 *   queira entrar assim tem que declarar `permitirSemData: true`
 *   explicitamente e assumir o custo — nunca por omissão.
 * - `futuro`: item com data adiante do relógio (fuso mal declarado). Não
 *   penaliza; a idade vira 0. Relógio errado do publicador não é feed morto.
 *
 * O limiar é POR FONTE (`maxIdadeDias`), não global: Retraction Watch
 * publica <1 item/dia e uma janela de 3 dias o reprovaria injustamente,
 * enquanto o G1 Política publica ~45/dia e 30 dias ali seria frouxo demais
 * pra detectar qualquer coisa. Cada fonte declara o seu, derivado do volume
 * medido no reconhecimento — nunca um número global escolhido a dedo.
 */

const MAX_IDADE_DIAS_PADRAO = 7;
const MS_POR_DIA = 86400000;

/**
 * @param {Array} itens        itens já parseados (`lib-noticias/rss.js`), cada um com `dataMs`
 * @param {Object} opcoes
 * @param {number} opcoes.maxIdadeDias    idade máxima aceita para o item MAIS RECENTE
 * @param {boolean} opcoes.permitirSemData  ver cabeçalho — nunca ligado por omissão
 * @param {number} opcoes.agora           epoch ms; injetável para o teste não depender do relógio
 * @returns {{aprovado:boolean, motivo:string, maisRecenteMs:number|null,
 *            maisRecenteISO:string|null, idadeDias:number|null,
 *            comData:number, total:number, maxIdadeDias:number}}
 */
function avaliarFrescor(itens, opcoes = {}) {
  const maxIdadeDias = Number.isFinite(opcoes.maxIdadeDias) ? opcoes.maxIdadeDias : MAX_IDADE_DIAS_PADRAO;
  const permitirSemData = opcoes.permitirSemData === true;
  const agora = Number.isFinite(opcoes.agora) ? opcoes.agora : Date.now();

  const lista = Array.isArray(itens) ? itens : [];
  const datas = lista.map(i => (i && Number.isFinite(i.dataMs) ? i.dataMs : null)).filter(d => d != null);

  const base = { comData: datas.length, total: lista.length, maxIdadeDias };

  if (lista.length === 0) {
    return {
      aprovado: false,
      motivo: 'feed_vazio',
      maisRecenteMs: null,
      maisRecenteISO: null,
      idadeDias: null,
      ...base
    };
  }

  if (datas.length === 0) {
    // Caso FAPESP. Aprovar aqui só se a fonte assumiu o custo explicitamente.
    return {
      aprovado: permitirSemData,
      motivo: permitirSemData ? 'sem_data_permitido' : 'sem_data',
      maisRecenteMs: null,
      maisRecenteISO: null,
      idadeDias: null,
      ...base
    };
  }

  const maisRecenteMs = Math.max(...datas);
  const idadeDias = Math.max(0, (agora - maisRecenteMs) / MS_POR_DIA);
  const aprovado = idadeDias <= maxIdadeDias;

  return {
    aprovado,
    motivo: aprovado ? 'fresco' : 'feed_velho',
    maisRecenteMs,
    maisRecenteISO: new Date(maisRecenteMs).toISOString(),
    idadeDias: Number(idadeDias.toFixed(2)),
    ...base
  };
}

/**
 * Uma linha de log com a MEDIDA, não com um adjetivo. Quem lê consegue
 * auditar a decisão sem reabrir o feed: qual a data mais recente encontrada,
 * qual a idade em dias, contra qual limiar.
 */
function formatarVeredito(idFonte, resultado) {
  const marca = resultado.aprovado ? 'OK' : 'REJEITADA';
  const partes = [
    '[frescor] ' + marca + ' ' + idFonte,
    'motivo=' + resultado.motivo,
    'itens=' + resultado.total,
    'com_data=' + resultado.comData
  ];
  if (resultado.maisRecenteISO) {
    partes.push('mais_recente=' + resultado.maisRecenteISO);
    partes.push('idade_dias=' + resultado.idadeDias);
  }
  partes.push('limiar_dias=' + resultado.maxIdadeDias);
  return partes.join(' ');
}

/**
 * Descarta, DENTRO de um feed aprovado, os itens individuais velhos demais.
 * Separado de `avaliarFrescor` porque resolve outro problema: a BBC Brasil
 * é uma fonte VIVA (tem notícia de hoje — passa na guarda de fonte) mas
 * mistura, fora de ordem, itens de abril/2024 marcados como "recomendado".
 * Sem este segundo corte, esses itens de 2024 entrariam no lote e
 * apareceriam nos recortes de "últimos 3 dias" com a data de 2024 — visíveis
 * como lixo, mas ainda assim consumindo linha.
 *
 * Item SEM data sobrevive a este corte de propósito (não dá pra afirmar que
 * é velho); quem barra item sem data é a guarda de fonte acima, uma camada
 * antes.
 */
function filtrarItensVelhos(itens, { maxIdadeDias = MAX_IDADE_DIAS_PADRAO, agora = Date.now() } = {}) {
  const limite = agora - maxIdadeDias * MS_POR_DIA;
  const mantidos = [];
  const descartados = [];
  for (const item of Array.isArray(itens) ? itens : []) {
    if (item && Number.isFinite(item.dataMs) && item.dataMs < limite) descartados.push(item);
    else mantidos.push(item);
  }
  return { itens: mantidos, descartados };
}

module.exports = { avaliarFrescor, formatarVeredito, filtrarItensVelhos, MAX_IDADE_DIAS_PADRAO };
