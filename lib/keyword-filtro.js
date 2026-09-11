'use strict';

/**
 * Filtro estágio 1 (barato): keyword matching contra config/keywords.json.
 * Termos vêm de arquivo de config editável — nunca hardcoded aqui.
 */

function normalizar(texto) {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Match por fronteira de palavra (\b), não substring cru. Achado real na
 * implementação: "ux" batia dentro de "auxiliar" (edital marítimo da
 * Transpetro, "AUXILIAR DE SAÚDE") com includes() puro — falso positivo
 * grave para um termo curto e comum como sequência de letras.
 */
function contemTermo(textoNorm, termoNorm) {
  if (!termoNorm) return false;
  const re = new RegExp(`\\b${escapeRegex(termoNorm)}\\b`, 'i');
  return re.test(textoNorm);
}

/**
 * Avalia um blob de texto (título + preview/conteúdo + hierarquia do órgão)
 * contra a lista de termos configurada.
 *
 * Retorna:
 *   { passou: false }                                     — nenhum termo bateu
 *   { passou: true, matches, areaPrincipal, subareaPrincipal, pesoArea }
 *
 * areaPrincipal = área do termo de maior peso (config.pesos_area) entre os
 * que bateram — usado depois pelo score (estágio 2) como componente de
 * aderência. ESTE CÁLCULO NÃO MUDOU (Onda 12/13, item 12c): mesma regra de
 * sempre — primeiro match, atualizado só quando um match posterior tem peso
 * ESTRITAMENTE maior (empate nunca troca a área principal). Zero risco pro
 * score/veredito/notificação de qualquer registro existente.
 *
 * subareaPrincipal (Onda 12/13, item 12c — conserto da duplicata visual
 * UEM/UFSCar, ver RELATORIO-ONDA-1-2.md §2a e RELATORIO-ONDA-12-13.md):
 * ANTES, era sempre `principal.subarea` — ou seja, a subárea colava no
 * mesmo termo "vencedor" da área, que em caso de empate de peso é sempre o
 * PRIMEIRO termo da config que bateu. Como `config/keywords.json` lista o
 * termo GENÉRICO de cada área primeiro (ex. "computação", "design") e os
 * termos ESPECÍFICOS depois (ex. "ciência da computação", "algoritmos",
 * "design digital") — ver `_comentario_ordem` no próprio arquivo — isso
 * fazia a subárea colapsar sempre no balde genérico mesmo quando um termo
 * mais específico também tinha batido (achado real: UEM tinha 3
 * subeditais de área "CIÊNCIA DA COMPUTAÇÃO" / ".../ALGORITMOS" /
 * ".../ENGENHARIA DE SOFTWARE", os 3 saíam com subarea "Computação",
 * indistinguíveis na vista `Concursos`).
 *
 * AGORA: dentre os matches cuja `area` bate a `areaPrincipal` (já decidida
 * pela regra de sempre, acima — nunca mexe em qual ÁREA venceu), a subárea
 * é a do ÚLTIMO desses matches na ordem da config — o mais específico
 * disponível, por convenção de ordenação (genérico primeiro). Quando só um
 * termo daquela área bateu, o resultado é idêntico ao de antes (não há
 * "último" diferente do único).
 */
function avaliar(texto, config) {
  const textoNorm = normalizar(texto);
  const termos = (config && config.termos) || [];
  const pesos = (config && config.pesos_area) || {};

  const matches = termos.filter(t => contemTermo(textoNorm, normalizar(t.termo)));

  if (matches.length === 0) {
    return { passou: false, matches: [] };
  }

  let principal = matches[0];
  let melhorPeso = pesos[principal.area] || 0;
  for (const m of matches) {
    const peso = pesos[m.area] || 0;
    if (peso > melhorPeso) {
      principal = m;
      melhorPeso = peso;
    }
  }

  // Subárea mais específica dentro da MESMA área da principal — ver
  // comentário acima. `reduce` em vez de "último do array filtrado" pra
  // deixar explícito que é uma varredura completa, não uma suposição sobre
  // ordem de iteração.
  const subareaMaisEspecifica = matches.reduce(
    (atual, m) => (m.area === principal.area ? m : atual),
    principal
  );

  return {
    passou: true,
    matches,
    areaPrincipal: principal.area,
    subareaPrincipal: subareaMaisEspecifica.subarea,
    pesoArea: melhorPeso
  };
}

/**
 * Veto de falso-positivo: termos de config/negativos.json que indicam cargo
 * técnico/administrativo (não docente) mesmo quando a área bateu.
 */
function contemNegativo(texto, termosNegativos) {
  const textoNorm = normalizar(texto);
  return (termosNegativos || []).some(t => contemTermo(textoNorm, normalizar(t)));
}

/**
 * Resolve o peso de área (score estágio 2) a partir do campo `registro.area`
 * salvo — que nem sempre é uma das 4 categorias canônicas de
 * `config.pesos_area` (Design/UX-IHC/Computação-IA/Educação-Ensino).
 *
 * Achado real (Onda 2.4, 26/08/2026): quando `registro.area` vem de
 * `lib/extrator-llm.js` (item 2b da Onda 2.0 — extração de indeterminados),
 * o modelo grava o rótulo LITERAL do edital ("COMPUTAÇÃO", "Tecnologia da
 * Informação", "Aprendizado de Máquina"), não a categoria canônica do filtro
 * de keyword. Um `pesos_area[area]` por igualdade de string cai em `0` pra
 * esses casos — 3 registros `elegivel_agora`/`elegivel_futuro` reais do
 * store ficaram com `pesoArea=0` só por isso, apesar de serem, na prática,
 * a mesma vaga de Ciência da Computação/Sistemas de Informação que o filtro
 * de keyword já reconhece (conferido linha a linha contra `texto_bruto`: os
 * três exigem Graduação/Mestrado/Doutorado em Ciência da Computação ou
 * Sistemas de Informação/Informática).
 *
 * A correção NÃO empilha essas grafias como chaves novas em `pesos_area`
 * (isso é dívida — a próxima variante de grafia do próximo edital volta a
 * quebrar). Em vez disso, `config.sinonimos_area` é um mapa de normalização:
 * cada entrada liga uma grafia observada (chave já normalizada por
 * `normalizar()` — sem acento, minúscula) à categoria canônica que ela
 * representa de fato, com o motivo registrado ao lado no próprio JSON. Áreas
 * que batem termo mas são substantivamente OUTRA coisa (ex.: "Probabilidade
 * e Estatística", "Medidas Elétricas..." — engenharia elétrica) foram
 * conferidas contra o texto do edital e ficam de FORA do mapa de propósito —
 * ver comentário em config/keywords.json.
 *
 * Ordem de resolução: (1) `area` bate uma chave canônica de `pesos_area`
 * direto — caminho normal; (2) `area` normalizada bate uma entrada de
 * `sinonimos_area` — resolve pra categoria canônica e busca o peso dela;
 * (3) nenhum dos dois — `0` (nunca adivinha peso pra área desconhecida).
 */
function resolverPesoArea(area, config) {
  if (!area) return 0;
  const pesos = (config && config.pesos_area) || {};
  if (Object.prototype.hasOwnProperty.call(pesos, area)) {
    return pesos[area] || 0;
  }
  const sinonimos = (config && config.sinonimos_area) || {};
  const areaCanonica = sinonimos[normalizar(area)];
  if (areaCanonica && Object.prototype.hasOwnProperty.call(pesos, areaCanonica)) {
    return pesos[areaCanonica] || 0;
  }
  return 0;
}

module.exports = { avaliar, contemNegativo, normalizar, contemTermo, resolverPesoArea };
