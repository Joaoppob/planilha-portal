'use strict';

const http = require('../lib/http');
const rss = require('../lib-noticias/rss');
const frescor = require('../lib-noticias/frescor');
const ranking = require('../lib-noticias/ranking');
const { normalizarTitulo } = require('../lib-noticias/ancoras');

/**
 * Fábrica de fonte RSS/Atom para a trilha NOTÍCIA.
 *
 * POR QUE FÁBRICA, E NÃO UM ARQUIVO POR FONTE (como em `fontes/`):
 * as 5 fontes de vaga têm `coletar()` próprio porque cada uma fala um
 * protocolo diferente — HTML paginado do DOU, JSON de API da Gupy, JSON-RPC
 * de servidor MCP da PCI, JSON-LD embutido do ProgramaThor. Aqui, 18 dos 20
 * feeds falam o MESMO protocolo (XML de feed sobre GET simples) e diferem só
 * em cinco valores: URL, veículo, aba, tabela, idioma. Repetir 18 vezes o
 * mesmo `coletar()` para variar cinco constantes é a dívida que
 * `fontes/programathor.js` já documenta ter aceitado só por serem poucas.
 * As duas fontes que NÃO cabem aqui (Hacker News via Algolia, JSON com
 * score; Reddit, com throttle obrigatório de ~20s) têm módulo próprio, como
 * deve ser.
 *
 * A GUARDA DE FRESCOR RODA AQUI DENTRO, POR URL — não no orquestrador. Uma
 * fonte pode ter várias URLs (G1 tem Política, Mundo e Economia) e um feed
 * pode fossilizar sozinho enquanto os irmãos seguem vivos. Rejeitar a fonte
 * inteira por causa de um, ou aprovar tudo porque um passou, seriam os dois
 * errados. O veredito de cada URL entra em `diagnostico.feeds[]` com a
 * medida, e o orquestrador imprime — nunca em silêncio.
 */

/**
 * @param {Object} spec
 * @param {string} spec.id                 identificador estável da fonte (vai pro campo `fonte` do store)
 * @param {string} spec.nome               descrição legível
 * @param {string} spec.veiculo            nome do veículo para a coluna "veículo" da planilha
 * @param {string} spec.aba                geral | ia | trabalho | ciencia
 * @param {string} spec.tabela             tabela dentro da aba
 * @param {string} spec.idioma             pt | en — FRONTEIRA de cluster, nunca inferido do texto
 * @param {string[]} spec.urls             uma ou mais URLs de feed
 * @param {number} spec.maxIdadeDias       limiar da guarda de frescor, derivado do volume medido
 * @param {string} [spec.charset]          'iso-8859-1' para a Folha; ausente = utf-8 via http.get
 * @param {string} [spec.filtroTabela]     chave de config/keywords-noticias.json -> filtros_tabela
 * @param {boolean} [spec.canario]         fonte registrada de propósito para PROVAR a guarda (ver trabalho.js)
 * @param {boolean} [spec.permitirSemData] ver lib-noticias/frescor.js — nunca por omissão
 */
function criarFonteRss(spec) {
  const {
    id,
    nome,
    veiculo,
    aba,
    tabela,
    idioma,
    urls,
    maxIdadeDias = frescor.MAX_IDADE_DIAS_PADRAO,
    charset = null,
    filtroTabela = null,
    canario = false,
    permitirSemData = false
  } = spec;

  async function baixar(url) {
    return charset ? http.getComCharset(url, { charset }) : http.get(url);
  }

  /**
   * Filtro de INCLUSÃO por tabela (config, não código). Roda sobre título +
   * resumo: o G1 Economia esconde "mercado de trabalho" dentro de um feed
   * de macroeconomia e o arXiv cs.AI traz 352 itens/dia — sem este corte a
   * tabela vira outra coisa. Devolve `{ passou, motivo }` para que o
   * descarte seja contável.
   */
  function passaFiltroTabela(item) {
    if (!filtroTabela) return { passou: true, motivo: 'sem_filtro' };
    const cfg = ranking.carregarConfig();
    const termos = cfg.filtrosTabela[filtroTabela];
    if (!Array.isArray(termos) || termos.length === 0) {
      // Config ausente é DEFEITO DE CONFIG, não permissão para passar tudo.
      throw new Error(
        '[falha: filtro de tabela "' +
          filtroTabela +
          '" | ausente em config/keywords-noticias.json -> filtros_tabela | a fonte ' +
          id +
          ' declara depender dele e passaria a inundar a tabela em silêncio | acrescentar a chave no config]'
      );
    }
    const texto = normalizarTitulo([item.titulo, item.resumo].filter(Boolean).join(' . '));
    const bateu = termos.some(t => ranking.casaTermo(texto, t));
    return { passou: bateu, motivo: bateu ? 'casou_filtro' : 'fora_do_filtro' };
  }

  async function coletar({ agora = Date.now() } = {}) {
    const itens = [];
    const diagnostico = { fonte: id, feeds: [], filtradosPorTabela: 0, itensVelhos: 0 };

    for (const url of urls) {
      const registroFeed = { url, ok: false };
      let xml;
      try {
        xml = await baixar(url);
      } catch (err) {
        registroFeed.erro = err.message;
        diagnostico.feeds.push(registroFeed);
        // Uma URL fora do ar não derruba as irmãs — mas fica registrada.
        console.error('[fonte:' + id + '] GET falhou em ' + url + ' — ' + err.message);
        continue;
      }

      const parsed = rss.parseFeed(xml);
      registroFeed.formato = parsed.formato;
      registroFeed.volumeBruto = parsed.volumeBruto;
      registroFeed.removidosIntraFeed = parsed.removidosIntraFeed;
      registroFeed.descartadosSemCampo = parsed.descartadosSemCampo;

      // ---- GUARDA DE FRESCOR (por URL) ----
      const veredito = frescor.avaliarFrescor(parsed.itens, { maxIdadeDias, permitirSemData, agora });
      registroFeed.frescor = veredito;
      console.error(frescor.formatarVeredito(id + ' ' + url, veredito));
      if (!veredito.aprovado) {
        registroFeed.rejeitada = true;
        diagnostico.feeds.push(registroFeed);
        continue;
      }

      // Segundo corte: item individual velho dentro de feed vivo (BBC Brasil).
      const { itens: frescos, descartados } = frescor.filtrarItensVelhos(parsed.itens, { maxIdadeDias, agora });
      registroFeed.itensVelhosDescartados = descartados.length;
      diagnostico.itensVelhos += descartados.length;

      let aceitos = 0;
      for (const bruto of frescos) {
        const filtro = passaFiltroTabela(bruto);
        if (!filtro.passou) {
          diagnostico.filtradosPorTabela++;
          continue;
        }
        itens.push({ ...bruto, fonte: id, veiculo, aba, tabela, idioma, feedUrl: url });
        aceitos++;
      }
      registroFeed.aceitos = aceitos;
      registroFeed.ok = true;
      diagnostico.feeds.push(registroFeed);
    }

    return { itens, diagnostico };
  }

  return { id, nome, veiculo, aba, tabela, idioma, urls, maxIdadeDias, canario, coletar, _spec: spec };
}

module.exports = { criarFonteRss };
