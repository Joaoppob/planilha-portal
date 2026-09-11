'use strict';

/**
 * Regras de elegibilidade (briefing — não inventar além disto).
 *
 * JB: doutorado em andamento (defesa prevista 2029). Título de mestre
 * CONFIRMADO por JB (Onda 1.9, 12/08/2026) — `perfil.titulacao_atual`
 * (config/perfil.json) nasce em 'mestrado_confirmado'.
 *
 * Onda 2.1 — quando a área do mestrado e da graduação deixam de ser
 * 'a_confirmar' e passam a refletir a formação real do usuário
 * (config/perfil.json), a checagem de área muda de patamar. Isso
 * substitui o mecanismo antigo (`pressupoe: 'area_do_mestrado_compativel'`,
 * que sinalizava incerteza total de área) por uma checagem REAL de
 * compatibilidade — `avaliarAreaCompativel(area)` — aplicada tanto no
 * caminho de mestrado quanto no de graduação/especialização (EBTT/Lei
 * 12.772/2012 pode exigir graduação em área ESPECÍFICA, não qualquer
 * bacharelado).
 *
 * Regra de compatibilidade (honesta, não otimista — briefing Onda 2.1):
 *   - Vaga de Design, Design Digital, Design de Interação, UX/UI, IHC,
 *     Multimídia, Mídias Digitais (categorias 'Design'/'UX/IHC' de
 *     config/keywords.json) -> 'compativel', alta confiança (é literalmente
 *     a área do mestrado e da graduação de JB).
 *   - Vaga de Ciência da Computação/Engenharia de Computação pura
 *     (categoria 'Computação/IA') ou Educação/Ensino genérico (categoria
 *     'Educação/Ensino', ex. "tecnologia educacional" sem menção a design)
 *     -> 'a_verificar_na_banca': editais tipicamente aceitam "área afim",
 *     mas quem decide é a banca do concurso — NUNCA presumido como 'sim'.
 *   - Área da vaga não identificada no texto -> `area_compativel: null`
 *     (não dá pra avaliar).
 *   - Nunca vira `elegivel_agora` "puro" sem o campo `area_compativel` ao
 *     lado quando o veredito depender de mestrado/graduação bater com uma
 *     área — a incerteza de área NUNCA vira certeza de elegibilidade
 *     (`area_compativel` só é 'compativel' quando a categoria bate de
 *     verdade, nunca por omissão/default).
 *
 * Tabela de veredito (inalterada desde a Onda 1.7 — o que muda nesta onda é
 * o campo `area_compativel` que acompanha `elegivel_agora`, não o veredito
 * em si: JB TEM a titulação mínima em qualquer um destes casos, a dúvida é
 * só se a ÁREA da vaga bate com a formação — isso é risco de banca, não
 * motivo pra esconder a oportunidade):
 *
 *   - Vaga exige doutorado concluído          -> elegivel_futuro
 *   - Vaga exige mestrado, perfil confirma    -> elegivel_agora + area_compativel
 *   - Vaga exige mestrado, perfil incerto     -> elegivel_futuro (com nota da dúvida)
 *   - Vaga exige graduação/especialização     -> elegivel_agora + area_compativel
 *   - Titulação exigida não identificada      -> indeterminada (item 1 do briefing
 *                                                 Onda 1.7 — NÃO vira elegivel_futuro por
 *                                                 padrão: silenciar por falta de informação
 *                                                 é o mesmo falso-negativo que motivou a
 *                                                 Onda 1.6, só que travestido de "futuro".
 *                                                 `indeterminada` SEMPRE notifica — ver
 *                                                 radar.js comandoNotificar, que só exclui
 *                                                 veredito 'fora')
 */

const ORDEM_TITULACAO = [
  'graduacao',
  'especializacao',
  'mestrado_incerto',
  'mestrado_confirmado',
  'doutorado_incerto',
  'doutorado_concluido'
];

// Categorias de área de config/keywords.json (área CANÔNICA da vaga, não
// texto livre) — mapeadas para o grau de confiança de compatibilidade com a
// formação de JB (Design/UX-IHC, tanto mestrado quanto graduação).
const AREAS_COMPATIVEL_ALTA_CONFIANCA = new Set(['Design', 'UX/IHC']);
const AREAS_A_VERIFICAR_NA_BANCA = new Set(['Computação/IA', 'Educação/Ensino']);

/**
 * Classifica a área CANÔNICA da vaga (registro.area, já resolvida pelo
 * filtro de keyword — ver config/keywords.json) contra a formação de JB.
 * Nunca retorna 'compativel' por omissão: área desconhecida vira `null`,
 * categoria fora das duas listas acima também vira 'a_verificar_na_banca'
 * (lado conservador — nunca presumir compatibilidade sem categoria
 * explicitamente mapeada).
 */
function avaliarAreaCompativel(area) {
  if (!area) return null;
  if (AREAS_COMPATIVEL_ALTA_CONFIANCA.has(area)) return 'compativel';
  return 'a_verificar_na_banca';
}

function possuiMestradoConfirmado(titulacaoAtual) {
  const idx = ORDEM_TITULACAO.indexOf(titulacaoAtual);
  const idxMestradoConfirmado = ORDEM_TITULACAO.indexOf('mestrado_confirmado');
  return idx >= idxMestradoConfirmado && idx !== -1;
}

function notaAreaCompativel(areaCompativel, tituloRequisito) {
  if (areaCompativel === 'compativel') {
    return `Exige ${tituloRequisito}; você atende (formação registrada em config/perfil.json) ` +
      '— área da vaga é diretamente compatível.';
  }
  if (areaCompativel === 'a_verificar_na_banca') {
    return `Exige ${tituloRequisito}; você atende a titulação, mas a área da vaga não é a mesma da formação ` +
      '(Design/UX-IHC) — editais costumam aceitar "área afim", decisão fica a critério da banca do concurso. ' +
      'Não presumir compatível: conferir o edital antes de contar com esta vaga.';
  }
  return `Exige ${tituloRequisito}; você atende a titulação, mas a área exigida pela vaga não foi identificada ` +
    'no texto do edital — não dá para avaliar compatibilidade. Abrir o edital para conferir.';
}

function avaliar(titulacaoExigida, perfil, area) {
  const exigida = String(titulacaoExigida || '').toLowerCase();
  const titulacaoAtual = (perfil && perfil.titulacao_atual) || 'mestrado_incerto';

  if (exigida.includes('doutorado')) {
    return {
      veredito: 'elegivel_futuro',
      nota: 'Exige doutorado concluído; seu perfil (config/perfil.json) indica doutorado em andamento — vira oportunidade futura, não descartada.'
    };
  }

  if (exigida.includes('mestrado')) {
    if (possuiMestradoConfirmado(titulacaoAtual)) {
      const areaCompativel = avaliarAreaCompativel(area);
      return {
        veredito: 'elegivel_agora',
        nota: notaAreaCompativel(areaCompativel, 'mestrado'),
        area_compativel: areaCompativel
      };
    }
    return {
      veredito: 'elegivel_futuro',
      nota: `Exige mestrado; titulacao_atual do perfil é "${titulacaoAtual}" (não confirmada) — verificar histórico/diploma antes de descartar.`
    };
  }

  if (exigida.includes('especializacao') || exigida.includes('especialização') || exigida.includes('graduacao') || exigida.includes('graduação')) {
    const tituloRequisito = exigida.includes('especial') ? 'graduação/especialização' : 'graduação';
    const areaCompativel = avaliarAreaCompativel(area);
    return {
      veredito: 'elegivel_agora',
      nota: notaAreaCompativel(areaCompativel, tituloRequisito),
      area_compativel: areaCompativel
    };
  }

  return {
    veredito: 'indeterminada',
    nota: 'Titulação exigida não identificada no texto do edital — elegibilidade indeterminada, não presumida. Abrir o edital para conferir.'
  };
}

module.exports = { avaliar, possuiMestradoConfirmado, avaliarAreaCompativel, ORDEM_TITULACAO };
