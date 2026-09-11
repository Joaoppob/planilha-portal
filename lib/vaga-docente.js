'use strict';

/**
 * Estágio 1 do pipeline invertido (item 3 do briefing Onda 1.6 — falso-
 * negativo em massa): "é vaga docente?" — detecta sobre a CASCA do DOU
 * (título + preview + hierarquia do órgão, o que já vem barato na
 * listagem, sem requisição extra), ANTES de qualquer filtro de área.
 *
 * Amplo de propósito por desenho: falso-positivo aqui é barato (só custa
 * uma requisição de enriquecimento a mais); falso-negativo é FATAL (o item
 * nunca chega no estágio 3, onde área/elegibilidade são avaliadas sobre o
 * texto completo). Por isso os três regex abaixo são permissivos dentro do
 * escopo "concurso docente" — não tentam adivinhar área nenhuma.
 *
 * Prova real do porquê disto existir: o edital unificado da UFSCar
 * (12/08/2026, 67 subeditais, 89 vagas, incluindo "Design/Mídias — IA, UI,
 * UX e Design Digital") tinha `artType` correto ("Edital de Concurso
 * Público") mas o preview de ~400 chars da listagem não menciona nenhuma
 * área — só o filtro de KEYWORD (estágio antigo, rodando sobre a casca)
 * descartava o item antes de buscar o texto completo, onde a tabela de
 * áreas realmente mora. Ver README §Fonte DOU / §Pipeline invertido.
 *
 * CONSERTO (gate municipal/estadual — medido: das 41+ concursos de
 * prefeitura que a coleta seca da PCI trouxe em 2026-08-27, 0 sobreviviam
 * a este gate): `RE_INSTITUICAO` só reconhecia a casca de ensino SUPERIOR
 * federal (universidade/instituto federal/CEFET/fundação de ensino) —
 * descartando de saída uma categoria legítima inteira, o concurso público
 * MUNICIPAL/ESTADUAL para professor de educação básica, que nunca aparece
 * no Diário Oficial da União e era justamente a razão de adotar a PCI (ver
 * cabeçalho de fontes/pci.js). `RE_INSTITUICAO_MUNICIPAL_ESTADUAL` reconhece
 * o empregador municipal/estadual de ensino (prefeitura, secretaria de
 * educação, autarquia municipal de ensino) — mas o eixo continua sendo o
 * CARGO ser docente, não o empregador ser prefeitura: `RE_DOCENTE` já exige
 * "professor"/"docente"/"magistério" em algum lugar do blob, o que sozinho
 * já derruba a esmagadora maioria do ruído medido (TÉCNICO EM INFORMÁTICA,
 * INSTRUTOR DE INFORMÁTICA, AGENTE DE INFORMÁTICA, MONITOR DE INFORMÁTICA,
 * FACILITADOR DE INFORMÁTICA, ASSISTENTE TÉCNICO — nenhum desses cargos
 * reais contém "professor"/"docente"). Ver tests/vaga-docente-municipal.test.js
 * para a tabela de cargos reais classificados (taxa de ruído medida) e os
 * pares negativos (merendeira/motorista/agente administrativo continuam
 * fora mesmo com "prefeitura" no órgão).
 */

const RE_CONCURSO = /concurso\s+p[úu]blico|processo\s+seletivo(\s+simplificado)?/i;
const RE_DOCENTE = /professor(a)?|docente|magist[ée]rio\s+superior/i;
const RE_INSTITUICAO_FEDERAL =
  /universidade|faculdade federal|instituto\s+federal|centro\s+federal\s+de\s+educa[cç][ãa]o\s+tecnol[óo]gica|\bcefet\b|funda[cç][ãa]o.{0,40}(ensino|educa[cç][ãa]o|universidade)|institui[cç][ãa]o(\s+federal)?\s+de\s+ensino/i;
const RE_INSTITUICAO_MUNICIPAL_ESTADUAL =
  /prefeitura|c[âa]mara\s+municipal|secretaria\s+(de\s+estado\s+d[ae]|municipal\s+d[ae]|estadual\s+d[ae]|d[ae])\s+educa[cç][ãa]o|autarquia\s+municipal(\s+de\s+ensino)?|governo\s+do\s+estado/i;
const RE_INSTITUICAO = new RegExp(`(?:${RE_INSTITUICAO_FEDERAL.source})|(?:${RE_INSTITUICAO_MUNICIPAL_ESTADUAL.source})`, 'i');

/**
 * true se o blob de texto (título + preview + hierarquia do órgão, o que
 * `fonte.textoParaFiltro()` já monta) descreve uma abertura de vaga docente
 * (concurso público ou processo seletivo, para professor/docente/magistério
 * superior, numa universidade/instituto federal/CEFET/fundação de ensino
 * OU numa prefeitura/secretaria de educação/autarquia municipal de ensino —
 * ver CONSERTO acima). NÃO avalia área — isso é o estágio 3, sobre o texto
 * ENRIQUECIDO.
 */
function pareceVagaDocente(texto) {
  const t = String(texto || '');
  return RE_CONCURSO.test(t) && RE_DOCENTE.test(t) && RE_INSTITUICAO.test(t);
}

module.exports = {
  pareceVagaDocente,
  _internal: { RE_CONCURSO, RE_DOCENTE, RE_INSTITUICAO, RE_INSTITUICAO_FEDERAL, RE_INSTITUICAO_MUNICIPAL_ESTADUAL }
};
