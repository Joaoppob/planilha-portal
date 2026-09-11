'use strict';

/**
 * Extratores por regex específicos da trilha MERCADO (Onda 3) — análogo a
 * lib/extrator-texto.js (extratores da trilha docente: titulação, regime,
 * classe, tipo, período de inscrição), mas para os dois campos NOVOS do
 * schema que só fazem sentido em vaga de mercado (ver README §Schema /
 * §Trilha mercado): `modalidade` (presencial/híbrido/remoto) e
 * `senioridade` (júnior/pleno/sênior/...). Módulo isolado — não estende
 * lib/extrator-texto.js pra não misturar vocabulário/regime docente com
 * vocabulário de mercado.
 *
 * `modalidade` vem de campo ESTRUTURADO da própria API da Gupy
 * (`workplaceType`), não precisa de regex — só normaliza pro rótulo em
 * português que o resto do radar usa (mensagem Telegram, planilha).
 *
 * `senioridade` NÃO vem estruturado — a Gupy não expõe isso como campo
 * (testado empiricamente 26/08/2026: schema do item de listagem não tem
 * campo de senioridade). Extração por regex sobre o TÍTULO da vaga
 * (`rawItem.name`), nunca a descrição inteira: título de vaga brasileiro
 * quase sempre carrega o nível no próprio nome ("Analista de UX/UI - Pleno",
 * "Engenheiro de IA Sênior", "Estágio em Tecnologia..."), e usar só o título
 * evita falso-positivo de a palavra "sênior"/"pleno" aparecer solta em
 * requisito de OUTRA vaga citada dentro da descrição (ex.: "reporta-se ao
 * Gerente Sênior de Produto" não é a senioridade da vaga em si). Campo não
 * identificado no título fica `null` — mesma doutrina "dado errado é pior
 * que dado faltante" do resto do projeto, nunca adivinha.
 */

const MODALIDADE_POR_WORKPLACE_TYPE = {
  'on-site': 'presencial',
  hybrid: 'hibrido',
  remote: 'remoto'
};

/**
 * `workplaceType` é o campo confiável (enum fechado observado: 'on-site' |
 * 'hybrid' | 'remote'); `isRemoteWork` (bool) é usado só como fallback
 * quando `workplaceType` vier ausente — nunca o contrário (workplaceType é
 * mais granular, distingue híbrido de remoto, o que o bool sozinho não faz).
 */
function extrairModalidade(rawItem) {
  const wt = rawItem && rawItem.workplaceType;
  if (wt && MODALIDADE_POR_WORKPLACE_TYPE[wt]) return MODALIDADE_POR_WORKPLACE_TYPE[wt];
  if (rawItem && rawItem.isRemoteWork === true) return 'remoto';
  return null;
}

// Ordem importa: checados nesta sequência, primeiro match vence. Entry-level
// e cargos de gestão primeiro (mais específicos/menos ambíguos), depois os
// três níveis de carreira genéricos (júnior/pleno/sênior), que são os mais
// comuns e por isso os que mais se beneficiam de rodar por último (evita
// "sênior" bater dentro de "Gerente Sênior de Produto" antes do padrão de
// gestão mais específico ter a chance de capturar o cargo real).
const PADROES_SENIORIDADE = [
  [/\best[aá]gi[ao]?ri?[ao]?\b|\best[aá]gio\b/i, 'estagio'],
  [/\btrainee\b/i, 'trainee'],
  [/\bcoordenador(a)?\b/i, 'coordenador'],
  [/\bger[eê]nte\b/i, 'gerente'],
  [/\bhead\b/i, 'head'],
  [/\b(lead|l[ií]der)\b/i, 'lead'],
  [/\bespecialista\b/i, 'especialista'],
  [/\bs[eê]nior\b|\bsr\.?\b/i, 'senior'],
  [/\bpleno\b/i, 'pleno'],
  [/\bj[uú]nior\b|\bjr\.?\b/i, 'junior']
];

function extrairSenioridade(titulo) {
  const t = String(titulo || '');
  for (const [re, rotulo] of PADROES_SENIORIDADE) {
    if (re.test(t)) return rotulo;
  }
  return null;
}

/**
 * Três funções adicionadas na Onda 4 (ProgramaThor — segunda fonte da trilha
 * mercado, ver README §Trilha mercado / fontes/programathor.js) para os TRÊS
 * campos novos do schema que o ProgramaThor expõe e a Gupy não expõe
 * (`stack`, `tipo_contrato`, `faixa_salarial` — ver lib/schema.js): o
 * ProgramaThor publica um bloco JSON-LD `schema.org/JobPosting` por vaga
 * (`employmentType`, `baseSalary`, `description` com uma linha
 * "Habilidades"), então mapear/formatar esses três campos é lógica
 * TRILHA-level (não fonte-específica) — mesma posição de
 * extrairModalidade/extrairSenioridade acima. A busca/parsing do bloco
 * JSON-LD em si (rede + JSON.parse) é fonte-específica e fica em
 * fontes/programathor.js; aqui só entra "dado estruturado -> campo do
 * schema", reaproveitável se uma fonte futura também publicar JobPosting.
 */

/**
 * `employmentType` é o enum do schema.org (FULL_TIME/CONTRACTOR/INTERN/...),
 * mapeado pro vocabulário PT-BR que o próprio ProgramaThor usa nos filtros da
 * listagem (CLT/PJ/Estágio — ver `/jobs?contract_type=...`). Deliberadamente
 * NÃO reaproveita o campo `tipo` do schema (docente-específico:
 * 'efetivo'|'substituto'|'posdoc_bolsa'|'cfp' — mesma decisão já tomada para
 * o `type` da Gupy, ver README §Trilha mercado, "Campos novos do schema").
 * Valor de `employmentType` fora do mapa (TEMPORARY/PART_TIME/OTHER, não
 * observados nos 3 casos reais capturados em 26/08/2026) fica `null` — nunca
 * adivinha um rótulo PT-BR pra um enum não confirmado empiricamente.
 */
const EMPLOYMENT_TYPE_PARA_CONTRATO = {
  FULL_TIME: 'CLT',
  CONTRACTOR: 'PJ',
  INTERN: 'Estágio'
};

function mapearTipoContrato(employmentType) {
  if (!employmentType) return null;
  return EMPLOYMENT_TYPE_PARA_CONTRATO[employmentType] || null;
}

const UNIDADE_SALARIAL_POR_TEXTO = { MONTH: 'mês', YEAR: 'ano', WEEK: 'semana', DAY: 'dia', HOUR: 'hora' };

/**
 * `baseSalary` (schema.org `MonetaryAmount` -> `QuantitativeValue`) só traz
 * um único `value` (nunca `minValue`/`maxValue` nos 3 casos reais capturados
 * em 26/08/2026 — nenhum tinha faixa). Prefixo "Até" é FIEL ao próprio
 * ProgramaThor, não uma inferência minha: cross-check no job real
 * 33752-desenvolvedor-a-full-stack-python-ai-llm confirma que o texto do
 * card da listagem ("Até R$18.000") e `baseSalary.value.value` (18000) são o
 * MESMO número — o "até" é a semântica que o próprio site usa pra esse
 * campo (teto, não piso nem valor fixo). Ausência de `baseSalary` (comum —
 * a maioria das vagas reais capturadas não divulga salário) retorna `null`,
 * nunca inventa.
 */
function formatarFaixaSalarial(baseSalary) {
  const valor = baseSalary && baseSalary.value && baseSalary.value.value;
  if (typeof valor !== 'number' || !isFinite(valor)) return null;
  const moeda = !baseSalary.currency || baseSalary.currency === 'BRL' ? 'R$' : `${baseSalary.currency} `;
  const unidade = UNIDADE_SALARIAL_POR_TEXTO[baseSalary.value.unitText] || null;
  const valorFormatado = valor.toLocaleString('pt-BR');
  return `Até ${moeda}${valorFormatado}${unidade ? '/' + unidade : ''}`;
}

/**
 * O ProgramaThor sempre abre a `description` do JSON-LD com um bloco fixo
 * `<strong>Habilidades</strong> <br> termo1, termo2, ... </p>` — confirmado
 * nos 3 casos reais capturados em 26/08/2026 (times/empresas diferentes,
 * mesmo template). Sem esse bloco (formato mudou, ou descrição não tem
 * habilidades listadas), retorna array vazio — nunca inventa stack a partir
 * do resto do texto livre.
 */
function extrairStackDaDescricao(descricaoHtml) {
  const m = String(descricaoHtml || '').match(/<strong>Habilidades<\/strong>\s*<br>\s*([^<]+)/i);
  if (!m) return [];
  return m[1]
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

module.exports = {
  extrairModalidade,
  extrairSenioridade,
  mapearTipoContrato,
  formatarFaixaSalarial,
  extrairStackDaDescricao,
  MODALIDADE_POR_WORKPLACE_TYPE,
  PADROES_SENIORIDADE,
  EMPLOYMENT_TYPE_PARA_CONTRATO
};
