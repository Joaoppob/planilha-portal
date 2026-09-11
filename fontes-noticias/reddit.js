'use strict';

const http = require('../lib/http');
const rssLib = require('../lib-noticias/rss');
const frescor = require('../lib-noticias/frescor');

/**
 * REDDIT — `.rss` por subreddit. A fonte mais cara e mais pobre da trilha, e
 * as duas coisas estão medidas, não supostas.
 *
 * O QUE NÃO DÁ PRA TER, E POR QUÊ:
 * `www.reddit.com/r/{sub}/hot.json`, `api.reddit.com` e `old.reddit.com`
 * — os três caminhos que teriam `score`/`num_comments` — devolvem HTTP 403
 * com página de bot-wall ("Welcome to Reddit"), testado 2x no
 * reconhecimento. O `.rss` que responde 200 é Atom SEM nenhum campo
 * numérico: um grep por points|score|ups|num_comments no XML inteiro só acha
 * a palavra "comments" como parte de URL (`/comments/{id}/...`), nunca como
 * número.
 *
 * Consequência assumida, não disfarçada: todo item de Reddit entra com
 * `pontos: null` e portanto seu sinal bruto é `n_veiculos` (= 1, já que os
 * 5 subreddits compartilham o domínio reddit.com). Ele fica sistematicamente
 * abaixo do Hacker News na aba IA. Inventar um proxy — posição no feed
 * "hot", por exemplo — produziria um número que PARECE score e não é;
 * preferi a linha honestamente fraca.
 *
 * O THROTTLE NÃO É PRECAUÇÃO, É REQUISITO MEDIDO — E A MEDIDA MUDOU:
 * o reconhecimento observou 429 abaixo de ~15s e 5/5 subreddits passando com
 * ~20s. **Na execução de prova desta entrega, com 21s, DOIS dos cinco
 * subreddits (r/OpenAI e r/AI_Agents) ainda devolveram 429** — medição
 * própria, contradizendo a anterior. Não é contradição de método: o limite do
 * Reddit é por janela deslizante e sensível a quem mais saiu do mesmo IP
 * naquele minuto, então "20s funcionou 5/5 uma vez" nunca foi garantia. Subo
 * o padrão para 30s, que é a folga que a minha medição pede, e deixo o valor
 * em env — não escondido no código.
 *
 * Custo declarado: 5 subreddits x 30s = ~2min só de Reddit por coleta, mais
 * lento que todas as outras fontes desta trilha somadas. Quem quiser rodar
 * mais rápido ajusta `RADAR_NOTICIAS_REDDIT_THROTTLE_MS` e assume o 429 —
 * que, quando acontece, aparece no log com a dica do que ajustar, nunca como
 * "a fonte não trouxe nada hoje".
 */

const ID = 'reddit';
const SUBS = ['ClaudeAI', 'codex', 'OpenAI', 'AI_Agents', 'LocalLLaMA'];
const THROTTLE_MS = Number(process.env.RADAR_NOTICIAS_REDDIT_THROTTLE_MS || 30000);
const MAX_IDADE_DIAS = 7;
const DOMINIO = 'reddit.com';

function esperar(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function coletar({ agora = Date.now(), subs = SUBS, throttleMs = THROTTLE_MS } = {}) {
  const diagnostico = { fonte: ID, feeds: [], filtradosPorTabela: 0, itensVelhos: 0, throttleMs };
  const bruto = [];

  for (let i = 0; i < subs.length; i++) {
    const sub = subs[i];
    // Espera ANTES de cada requisição menos a primeira — o intervalo é entre
    // chamadas, e esperar depois da última seria 21s jogados fora.
    if (i > 0) await esperar(throttleMs);

    const url = 'https://www.reddit.com/r/' + sub + '/.rss';
    const registro = { url, sub, ok: false };
    let xml;
    try {
      xml = await http.get(url);
    } catch (err) {
      registro.erro = err.message;
      diagnostico.feeds.push(registro);
      // 429 aqui significa que o throttle está curto demais para a janela
      // atual — a mensagem diz isso em vez de só "falhou".
      const dica = /429/.test(err.message)
        ? ' (rate limit — aumentar RADAR_NOTICIAS_REDDIT_THROTTLE_MS, hoje em ' + throttleMs + 'ms)'
        : '';
      console.error('[fonte:' + ID + '] GET falhou em r/' + sub + ' — ' + err.message + dica);
      continue;
    }

    const parsed = rssLib.parseFeed(xml, { formato: 'atom' });
    registro.volumeBruto = parsed.volumeBruto;
    registro.removidosIntraFeed = parsed.removidosIntraFeed;

    for (const item of parsed.itens) {
      bruto.push({
        ...item,
        // Domínio fixado: o link de um post do Reddit já aponta pra
        // reddit.com, mas fixar aqui deixa a intenção explícita e imune a
        // mudança de encurtador (redd.it).
        dominio: DOMINIO,
        pontos: null,
        comentarios: null,
        fonte: ID,
        veiculo: 'Reddit r/' + sub,
        subreddit: sub,
        aba: 'ia',
        tabela: 'reddit-hn',
        idioma: 'en',
        feedUrl: url
      });
    }
    registro.aceitos = parsed.itens.length;
    registro.ok = true;
    diagnostico.feeds.push(registro);
  }

  const veredito = frescor.avaliarFrescor(bruto, { maxIdadeDias: MAX_IDADE_DIAS, agora });
  console.error(frescor.formatarVeredito(ID, veredito));
  diagnostico.frescor = veredito;
  if (!veredito.aprovado) {
    diagnostico.rejeitada = veredito;
    return { itens: [], diagnostico };
  }

  const { itens, descartados } = frescor.filtrarItensVelhos(bruto, { maxIdadeDias: MAX_IDADE_DIAS, agora });
  diagnostico.itensVelhos = descartados.length;
  return { itens, diagnostico };
}

module.exports = {
  id: ID,
  nome: 'Reddit — .rss por subreddit (Atom, SEM score, throttle ~21s obrigatório)',
  veiculo: 'Reddit',
  aba: 'ia',
  tabela: 'reddit-hn',
  idioma: 'en',
  maxIdadeDias: MAX_IDADE_DIAS,
  canario: false,
  lento: true,
  coletar,
  _internal: { SUBS, THROTTLE_MS, DOMINIO }
};
