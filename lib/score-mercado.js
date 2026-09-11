'use strict';

const { normalizar, contemTermo } = require('./keyword-filtro');

/**
 * Rubrica de score da trilha MERCADO (Onda 3) — deliberadamente SEPARADA de
 * lib/score.js (que é a rubrica docente: aderência de área + elegibilidade
 * por TITULAÇÃO + urgência de prazo). Justificativa (briefing): "a rubrica
 * docente não se transfere — em vaga de mercado, mestrado raramente é
 * requisito e o que importa é aderência de stack/senioridade. Não force
 * encaixe." lib/elegibilidade.js inteiro (doutorado em andamento -> futuro,
 * mestrado confirmado -> agora, etc.) não tem NADA a dizer sobre uma vaga de
 * "Analista de UX/UI" que pede graduação em qualquer área correlata — reusar
 * essa rubrica produziria `veredito: 'indeterminada'` pra TODA vaga de
 * mercado (titulacao_exigida sempre null nesta trilha — Gupy não expõe
 * requisito de titulação estruturado, e extrair isso por regex de descrição
 * livre em português E espanhol, com formatos de "requisitos" muito mais
 * heterogêneos que edital de concurso público, é fora de escopo desta onda),
 * o que por sua vez SEMPRE dispara notificação (regra dura de
 * radar.js comandoNotificar) — inundaria o Telegram de JB com toda vaga de
 * mercado encontrada, o oposto do que score_minimo existe pra evitar.
 *
 * Rubrica escolhida — simples e honesta, como o briefing sugeriu
 * explicitamente ("aderência de keyword + recência"):
 *
 *   aderência de keyword   0-55  (config/keywords-mercado.json →
 *                                  termos_aderencia; soma do peso de cada
 *                                  termo que bate no título+descrição da
 *                                  vaga, por fronteira de palavra — mesma
 *                                  técnica de lib/keyword-filtro.js
 *                                  contemTermo, capado em TETO_ADERENCIA)
 *   recência da publicação  0-30  (mais recente, mais pontos — vaga de
 *                                  mercado fecha rápido, ao contrário de
 *                                  edital de concurso público que tem prazo
 *                                  de inscrição formal; "publicada há 2
 *                                  dias" é sinal de urgência mais forte que
 *                                  "publicada há 25 dias" mesmo sem prazo
 *                                  explícito de encerramento)
 *
 * Teto = 85, NÃO 100 — de propósito: config/notificacao.json → score_minimo
 * (51) foi calibrado pra escala 0-85 da trilha docente (ver lib/score.js,
 * "Geografia removida"). Como `radar.js comandoNotificar` filtra por
 * `r.score >= scoreMinimo` genericamente pras DUAS trilhas (sem branch —
 * nenhuma mudança necessária ali, ver README §Trilha mercado), manter a
 * MESMA escala 0-85 faz o limiar compartilhado permanecer comparável em vez
 * de silenciosamente ficar mais frouxo (se o teto mercado fosse 100) ou mais
 * rígido (se fosse menor) que o pretendido. Se essa rubrica se mostrar
 * frouxa/rígida demais na prática, o ajuste é em `TETO_ADERENCIA` aqui ou
 * `score_minimo` em config/notificacao.json — não em lib/score.js.
 *
 * Veredito não usa o vocabulário docente (elegivel_agora/elegivel_futuro/
 * indeterminada) — usa `'aderente' | 'fora'`. Dois motivos: (1) honestidade
 * — "elegível" pressupõe uma checagem de requisito formal que esta trilha
 * não faz; (2) compatibilidade de plumbing — `'aderente'` não é
 * 'indeterminada' nem 'fora', então cai naturalmente no ramo
 * `r.score >= scoreMinimo` de `comandoNotificar` sem precisar de nenhum
 * branch novo ali. `'fora'` (score 0) só ocorre quando NENHUM termo de
 * `termos_aderencia` bate no texto — não deveria acontecer na prática (o
 * item já foi encontrado por um `termo_busca`, que é um subconjunto dos
 * termos de aderência), mas existe como cinto de segurança honesto em vez
 * de assumir que sempre vai bater.
 */

const TETO_ADERENCIA = 55;

const PONTOS_RECENCIA = [
  { maxDias: 3, pontos: 30 },
  { maxDias: 7, pontos: 22 },
  { maxDias: 14, pontos: 15 },
  { maxDias: 30, pontos: 8 }
];
const PONTOS_RECENCIA_PADRAO = 3; // publicação antiga ou desconhecida — ainda reporta, baixa urgência
const PONTOS_RECENCIA_DESCONHECIDA = 5; // data de publicação ausente/inválida — neutro-baixo, não penaliza tanto quanto "velha confirmada"

/**
 * Avalia aderência de keyword sobre um blob de texto (título+descrição, já
 * em mãos — Gupy não exige segunda requisição de "enriquecimento" como o
 * DOU). Retorna `{ passou, matches, area, subarea, pesoAderencia }` — mesmo
 * formato conceitual de lib/keyword-filtro.js avaliar(), mas com peso por
 * TERMO (config/keywords-mercado.json) em vez de peso por ÁREA
 * (config/keywords.json), porque na trilha mercado um termo específico como
 * "rag" carrega mais sinal que a categoria genérica "IA/Agentes" inteira.
 */
function avaliarAderencia(texto, config) {
  const textoNorm = normalizar(texto);
  const termos = (config && config.termos_aderencia) || [];
  const matches = termos.filter(t => contemTermo(textoNorm, normalizar(t.termo)));

  if (matches.length === 0) {
    return { passou: false, matches: [], area: null, subarea: null, pesoAderencia: 0 };
  }

  let principal = matches[0];
  for (const m of matches) {
    if ((m.peso || 0) > (principal.peso || 0)) principal = m;
  }
  const somaPesos = matches.reduce((acc, m) => acc + (m.peso || 0), 0);

  return {
    passou: true,
    matches,
    area: principal.area,
    subarea: principal.subarea,
    pesoAderencia: Math.min(TETO_ADERENCIA, somaPesos)
  };
}

function scoreRecencia(dataPublicacaoISO, agora = new Date()) {
  if (!dataPublicacaoISO) return PONTOS_RECENCIA_DESCONHECIDA;
  const d = new Date(dataPublicacaoISO);
  if (isNaN(d.getTime())) return PONTOS_RECENCIA_DESCONHECIDA;
  const dias = Math.floor((agora - d) / 86400000);
  if (dias < 0) return PONTOS_RECENCIA[0].pontos; // publicada "no futuro" (fuso/relógio) — trata como recente, não penaliza
  for (const faixa of PONTOS_RECENCIA) {
    if (dias <= faixa.maxDias) return faixa.pontos;
  }
  return PONTOS_RECENCIA_PADRAO;
}

/**
 * Combina aderência + recência num score 0-85 e um veredito
 * 'aderente' | 'fora'. Espelha a forma de retorno de lib/score.js `calcular`
 * (`{ score, veredito, elegibilidade: { veredito, nota, area_compativel },
 * detalhes }`) de propósito — `radar.js comandoJulgar` lê os dois formatos
 * pelo mesmo código, sem branch de shape, só de QUAL função chamar.
 * `area_compativel` sempre `null` aqui: é um conceito de compatibilidade de
 * FORMAÇAO ACADÊMICA com requisito de titulação (lib/elegibilidade.js), que
 * não existe nesta trilha.
 */
function calcular({ pesoAderencia, dataPublicacao }, agora = new Date()) {
  if (!pesoAderencia) {
    return {
      score: 0,
      veredito: 'fora',
      elegibilidade: {
        veredito: 'fora',
        nota: 'Nenhum termo de aderência de stack/perfil (config/keywords-mercado.json) encontrado no título+descrição.',
        area_compativel: null
      },
      detalhes: { scoreAderencia: 0, scoreRecencia: 0 }
    };
  }

  const scoreAderencia = Math.min(TETO_ADERENCIA, pesoAderencia);
  const rec = scoreRecencia(dataPublicacao, agora);
  const score = scoreAderencia + rec;

  return {
    score,
    veredito: 'aderente',
    elegibilidade: {
      veredito: 'aderente',
      nota: 'Aderência calculada por palavra-chave de stack/perfil (trilha mercado) — sem checagem de requisito de titulação (Gupy não expõe isso estruturado).',
      area_compativel: null
    },
    detalhes: { scoreAderencia, scoreRecencia: rec }
  };
}

module.exports = { avaliarAderencia, calcular, scoreRecencia, TETO_ADERENCIA };
