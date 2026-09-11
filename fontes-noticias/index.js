'use strict';

/**
 * Registro de fontes da trilha NOTÍCIA. Paralelo a `fontes/index.js` (trilha
 * vaga), nunca uma extensão dele: os dois pipelines não compartilham store,
 * schema, rubrica de score nem entry point. Notícia tem cluster e percentil;
 * vaga tem elegibilidade e aderência. Misturá-los degradaria os dois.
 *
 * CONTRATO DE FONTE nesta trilha — mais fino que o de `fontes/`, porque não
 * há estágio de enriquecimento (título e data já vêm no feed; JB decidiu
 * "sem resumo gerado"):
 *
 *   {
 *     id, nome, veiculo, aba, tabela, idioma, maxIdadeDias, canario,
 *     async coletar({agora}) -> { itens, diagnostico }
 *   }
 *
 * `itens` são itens brutos já anotados com fonte/veículo/aba/tabela/idioma;
 * `noticias.js` cuida de id, âncoras, cluster, score e store.
 * `diagnostico.feeds[]` carrega o veredito da guarda de frescor por URL — é
 * o que o orquestrador imprime e o que prova que a guarda rodou.
 */

const geral = require('./geral');
const ia = require('./ia');
const trabalho = require('./trabalho');
const ciencia = require('./ciencia');
const hackernews = require('./hackernews');
const reddit = require('./reddit');
const { ORDEM_PRECEDENCIA_ABA, precedenciaAba, resolverDuplicataEntreAbas } = require('./dedup-entre-abas');

const listaFontes = [
  ...geral.fontes,
  ...ia.fontes,
  ...trabalho.fontes,
  ...ciencia.fontes,
  hackernews,
  // Reddit por ÚLTIMO de propósito: é a única fonte com throttle obrigatório
  // (~21s entre subreddits, ~1min45 no total). Deixá-la no fim faz todo o
  // resto do lote já estar coletado quando a espera começa — se a coleta for
  // interrompida, perde-se a fonte mais pobre em sinal, não as ricas.
  reddit
];

const ABAS = ['geral', 'ia', 'trabalho', 'ciencia'];

/** As tabelas válidas por aba. Existe para que `noticias.js` possa VALIDAR o que as fontes declaram em vez de confiar — uma fonte que declarasse `tabela: 'brasi'` (typo) criaria uma tabela fantasma silenciosa na planilha da Fase B. */
const TABELAS_POR_ABA = {
  geral: ['brasil', 'mundo'],
  ia: ['ia-geral', 'claude', 'reddit-hn'],
  trabalho: ['mercado-trabalho', 'concursos'],
  ciencia: ['artigos', 'academico']
};

module.exports = {
  listaFontes,
  ABAS,
  TABELAS_POR_ABA,
  // Onda 11c — política de dedup entre abas (ver dedup-entre-abas.js). Não
  // consumida por `noticias.js` ainda: a fiação em `deduparGlobal` fica fora
  // do escopo de arquivos desta Onda e está registrada como pendência no
  // relatório.
  ORDEM_PRECEDENCIA_ABA,
  precedenciaAba,
  resolverDuplicataEntreAbas
};
