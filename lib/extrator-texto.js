'use strict';

/**
 * Extratores heurísticos (regex) de campos estruturados a partir do texto
 * integral de um edital. Best-effort e documentado como tal: quando não há
 * confiança razoável, retorna null — nunca inventa vagas/titulação/prazo.
 */

function extrairVagas(texto) {
  const t = String(texto || '');
  const m = t.match(/(\d+)\s*(?:\([^)]*\))?\s*vaga/i);
  return m ? parseInt(m[1], 10) : null;
}

// Achado real (Onda 2.0, auditoria dos 21 itens `titulacao_exigida: 'graduacao''):
// "graduação" aparece em textos que NÃO são requisito de titulação — nome de
// disciplina/curso interno ("Projeto de Graduação I/II", TCC) ou label de
// unidade/departamento ("Instituto de Ciências Biológicas e da
// Saúde/Graduação em Educação Física" — o nome INTEIRO do departamento, não
// uma exigência de vaga). Casos reais: UFES edital-13/2026 (homologação sem
// requisito restated, só cita "Projeto de Graduação I/II" como nome de
// disciplina) e UFMT edital-1/progep/ufmt-25-06-2026 (homologação multi-área,
// "Graduação em Educação Física"/"Graduação em Engenharia Florestal" são
// nomes de OUTROS departamentos, não da vaga de Audiovisual que bateu o
// filtro de área) — ambos geravam falso "titulação: graduação" pro item
// errado. `\b` sozinho não filtra isso porque a palavra é real, só o
// CONTEXTO é que não é requisito. Excluído explicitamente por dois padrões
// verificados contra os 204 itens do store (nenhum falso-negativo — só os 2
// casos acima mudam de valor, os outros 202 continuam extraindo o mesmo):
//   - precedido por "projeto de " (nome de disciplina, não requisito)
//   - precedido por "/" sem espaço (label de unidade/departamento no
//     formato "Faculdade de X/Graduação em Y")
const RE_GRADUACAO_REQUISITO = /(?<!projeto de )(?<!\/)gradua[cç][aã]o\b/i;

function extrairTitulacao(texto) {
  const t = String(texto || '').toLowerCase();
  if (/doutor(ado|a|e)?\b/.test(t)) return 'doutorado';
  if (/mestr(e|ado)\b/.test(t)) return 'mestrado';
  if (/especializa[cç][aã]o/.test(t)) return 'especializacao';
  if (RE_GRADUACAO_REQUISITO.test(t)) return 'graduacao';
  return null;
}

function extrairRegime(texto) {
  const t = String(texto || '');
  const m = t.match(/(dedica[cç][aã]o exclusiva|40\s*\(?\s*quarenta\s*\)?\s*horas|20\s*\(?\s*vinte\s*\)?\s*horas|regime de tempo (integral|parcial))/i);
  return m ? m[0].trim() : null;
}

function extrairClasse(texto) {
  const t = String(texto || '');
  const m = t.match(/professor(a)?\s+(adjunto|assistente|titular|auxiliar|associado)[\sa-záéíóúçã]{0,15}/i);
  return m ? m[0].trim() : null;
}

function extrairTipo(texto) {
  const t = String(texto || '').toLowerCase();
  if (/substitut[oa]|tempor[áa]ri[oa]/.test(t)) return 'substituto';
  if (/p[óo]s-doutorado|bolsista/.test(t)) return 'posdoc_bolsa';
  if (/efetiv[oa]|provimento efetivo|regime jur[íi]dico [úu]nico|carreira do magist[ée]rio/.test(t)) return 'efetivo';
  return null;
}

const MESES = {
  janeiro: '01', fevereiro: '02', marco: '03', 'março': '03', abril: '04',
  maio: '05', junho: '06', julho: '07', agosto: '08', setembro: '09',
  outubro: '10', novembro: '11', dezembro: '12'
};

// aceita "inscrição" (singular) e "inscrições" (plural), com/sem acento normal
const RE_INSCRICAO = 'inscri[cç][aã]o|inscri[cç][oõ]es';

function mesParaNumero(nome) {
  return MESES[String(nome || '').toLowerCase()] || null;
}

/**
 * Extrai período de inscrição. Cobre os dois formatos observados em editais
 * reais do DOU:
 *   - numérico: "de 12/08/2026 a 25/08/2026"
 *   - por extenso: "de 12 de agosto de 2026 a 25 de agosto de 2026"
 * e a variante só-com-prazo-final ("até DD/MM/AAAA" ou "até DD de MÊS de AAAA").
 * Retorna datas ISO (AAAA-MM-DD). Sem match confiável -> { inicio: null, fim: null }.
 */
function extrairPeriodoInscricao(texto) {
  const t = String(texto || '');
  const reBase = new RegExp(RE_INSCRICAO, 'i');
  if (!reBase.test(t)) return { inicio: null, fim: null };

  // formato numérico dd/mm/aaaa a dd/mm/aaaa
  let m = t.match(new RegExp(
    `(?:${RE_INSCRICAO})[^.]{0,150}?(\\d{2})\\/(\\d{2})\\/(\\d{4})[^\\d]{1,10}(?:a|até)[^\\d]{0,10}(\\d{2})\\/(\\d{2})\\/(\\d{4})`, 'i'
  ));
  if (m) {
    return { inicio: `${m[3]}-${m[2]}-${m[1]}`, fim: `${m[6]}-${m[5]}-${m[4]}` };
  }

  // formato por extenso: de DD de MÊS de AAAA a DD de MÊS de AAAA
  m = t.match(new RegExp(
    `(?:${RE_INSCRICAO})[^.]{0,150}?de\\s+(\\d{1,2})\\s+de\\s+([a-zçãóé]+)\\s+de\\s+(\\d{4})\\s+(?:a|até)\\s+(\\d{1,2})\\s+de\\s+([a-zçãóé]+)\\s+de\\s+(\\d{4})`, 'i'
  ));
  if (m) {
    const mesInicio = mesParaNumero(m[2]);
    const mesFim = mesParaNumero(m[5]);
    if (mesInicio && mesFim) {
      return {
        inicio: `${m[3]}-${mesInicio}-${String(m[1]).padStart(2, '0')}`,
        fim: `${m[6]}-${mesFim}-${String(m[4]).padStart(2, '0')}`
      };
    }
  }

  // só data final, numérica
  m = t.match(new RegExp(`(?:${RE_INSCRICAO})[^.]{0,150}?at[ée][^\\d]{0,10}(\\d{2})\\/(\\d{2})\\/(\\d{4})`, 'i'));
  if (m) {
    return { inicio: null, fim: `${m[3]}-${m[2]}-${m[1]}` };
  }

  // só data final, por extenso
  m = t.match(new RegExp(`(?:${RE_INSCRICAO})[^.]{0,150}?at[ée]\\s+(?:o\\s+dia\\s+)?(\\d{1,2})\\s+de\\s+([a-zçãóé]+)\\s+de\\s+(\\d{4})`, 'i'));
  if (m) {
    const mes = mesParaNumero(m[2]);
    if (mes) return { inicio: null, fim: `${m[3]}-${mes}-${String(m[1]).padStart(2, '0')}` };
  }

  return { inicio: null, fim: null };
}

module.exports = {
  extrairVagas,
  extrairTitulacao,
  extrairRegime,
  extrairClasse,
  extrairTipo,
  extrairPeriodoInscricao
};
