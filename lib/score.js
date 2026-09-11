'use strict';

const elegibilidade = require('./elegibilidade');

/**
 * Score estágio 2 — rubrica determinística 0-85.
 *
 *   aderência de área    0-40  (config/keywords.json → pesos_area, já calculado
 *                                no filtro estágio 1 como `pesoArea`)
 *   elegibilidade         0-30  (elegivel_agora=30, elegivel_futuro=15,
 *                                indeterminada=10, fora=0)
 *   urgência do prazo     0-15  (mais perto do fim, mais pontos; desconhecido = neutro)
 *
 * O resultado carrega sempre um veredito legível:
 *   'elegivel_agora' | 'elegivel_futuro' | 'indeterminada' | 'fora'
 * 'fora' só ocorre por veto de termo negativo (cargo técnico/administrativo,
 * não docente) — ver lib/keyword-filtro.js contemNegativo. 'indeterminada'
 * (item 1 do briefing Onda 1.7) é titulação não identificada — pontua menos
 * que 'elegivel_futuro' (menos confiança no dado), mas NUNCA vira 'fora':
 * score baixo não é motivo pra sumir da notificação, só pra rankear mais
 * abaixo — ver radar.js comandoNotificar, que só exclui veredito 'fora'.
 *
 * **Geografia removida (2026-08-26)**: JB confirmou que aceita vaga docente em
 * QUALQUER UF do Brasil — a rubrica tinha um eixo 0-15 que pesava SP mais que
 * o resto (`scoreGeografia`: SP=15, outra UF=9, desconhecido=6). Com o critério
 * de aceitação sendo "Brasil inteiro, sem preferência", esse eixo vira uma
 * CONSTANTE por definição — todo `uf` (inclusive `null`) merece o mesmo peso.
 * Duas formas de neutralizar isso mantendo escala 0-100 foram descartadas:
 * dar a todos os 15 pontos (finge que toda vaga está no lugar "ideal", quando
 * na verdade não existe mais lugar ideal) e redistribuir os 15 pontos entre
 * área/elegibilidade/urgência (exigiria inventar uma proporção sem nenhum
 * sinal real por trás — puro cosmético, o tipo de mudança que o briefing pede
 * pra não entregar como se fosse ganho). Escolhido: remover o eixo — a
 * rubrica passa a somar só o que ainda discrimina (área + elegibilidade +
 * urgência), teto cai de 100 pra 85, e `config/notificacao.json →
 * score_minimo` foi recalibrado contra a coorte medida SEM o eixo (ver
 * `_comentario_score_minimo` lá). `config/perfil.json → geografia_preferencial_uf`
 * também foi atualizado pra refletir "Brasil inteiro" — nenhum código lê esse
 * campo (só documentação), então a mudança é inofensiva.
 */

function scoreUrgencia(inscricaoFim, agora = new Date()) {
  if (!inscricaoFim) return 7; // desconhecido — neutro
  const fim = new Date(inscricaoFim);
  if (isNaN(fim.getTime())) return 7;
  const dias = Math.ceil((fim - agora) / 86400000);
  if (dias < 0) return 2; // prazo aparentemente encerrado — ainda reporta, baixa urgência
  if (dias <= 7) return 15;
  if (dias <= 15) return 12;
  if (dias <= 30) return 9;
  return 5;
}

function calcular({ pesoArea, titulacaoExigida, perfil, uf, inscricaoFim, negativo, area }, agora = new Date()) {
  // eslint-disable-next-line no-unused-vars -- uf permanece no contrato de chamada (radar.js/reprocessar.js
  // continuam passando) mas não entra mais na rubrica — ver nota "Geografia removida" acima.
  void uf;

  if (negativo) {
    return {
      score: 0,
      veredito: 'fora',
      elegibilidade: { veredito: 'fora', nota: 'Termo negativo (cargo técnico/administrativo) encontrado no texto.' },
      detalhes: { scoreArea: 0, scoreElegibilidade: 0, urg: 0 }
    };
  }

  const eleg = elegibilidade.avaliar(titulacaoExigida, perfil, area);
  const SCORE_ELEGIBILIDADE = { elegivel_agora: 30, elegivel_futuro: 15, indeterminada: 10 };
  const scoreElegibilidade = SCORE_ELEGIBILIDADE[eleg.veredito] ?? 15;
  const scoreArea = Math.min(40, pesoArea || 0);
  const urg = scoreUrgencia(inscricaoFim, agora);

  const score = scoreArea + scoreElegibilidade + urg;

  return {
    score,
    veredito: eleg.veredito,
    elegibilidade: eleg,
    detalhes: { scoreArea, scoreElegibilidade, urg }
  };
}

module.exports = { calcular, scoreUrgencia };
