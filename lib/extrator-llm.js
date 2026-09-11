'use strict';

const keywordFiltro = require('./keyword-filtro');

/**
 * Extração estruturada via LLM local (Onda 2.0, item 2b do briefing) —
 * complementa lib/extrator-texto.js (regex) para os itens que ficaram
 * `titulacao_exigida: null` (indeterminados): "LLM lendo edital, não regex
 * procurando palavra". Nunca chama API paga — só Ollama local, mesmo host/
 * modelo/fallback de lib/ollama.js (config/perfil.json → ollama).
 *
 * Regra dura (não afrouxa aqui, é a mesma que já vale no projeto desde a
 * Onda 1.7 — "dado errado é pior que dado faltante"): cada campo carrega um
 * booleano `certeza` próprio. Campo com `certeza: false` (ou ausente,
 * malformado, ou o modelo não respondeu) vira `null` — NUNCA um valor
 * "adivinhado". Isso é resolvido campo a campo, não a extração inteira
 * tudo-ou-nada: um edital pode ter titulação clara mas campus ambíguo, ou
 * vice-versa.
 */

const CAMPOS = ['titulacao_exigida', 'area', 'subarea', 'campus', 'vagas', 'regime', 'inscricao_inicio', 'inscricao_fim'];
const TITULACOES_VALIDAS = ['graduacao', 'especializacao', 'mestrado', 'doutorado'];

const TAMANHO_JANELA_ANTES = 1200;
const TAMANHO_JANELA_DEPOIS = 7000;
const TAMANHO_MAX_SEM_JANELA = 8000;

/**
 * Recorta o texto ao redor do primeiro termo que bateu o filtro de área
 * (`registro.keywords_matched`) — evita mandar um documento de centenas de
 * milhares de caracteres (visto no store real: até 491207 chars, uma
 * homologação multi-área) pro contexto do modelo, e aumenta a chance de a
 * janela cair na linha CERTA quando o documento é grande. Sem termo
 * localizável (ou texto já curto o bastante), usa os primeiros
 * `TAMANHO_MAX_SEM_JANELA` chars — nunca lança, nunca falha silenciosamente
 * pra string vazia.
 */
function recortarJanela(textoBruto, keywordsMatched) {
  const texto = String(textoBruto || '');
  if (texto.length <= TAMANHO_MAX_SEM_JANELA) return texto;

  const textoNorm = keywordFiltro.normalizar(texto);
  for (const termo of keywordsMatched || []) {
    const termoNorm = keywordFiltro.normalizar(termo);
    const idx = textoNorm.indexOf(termoNorm);
    if (idx >= 0) {
      const inicio = Math.max(0, idx - TAMANHO_JANELA_ANTES);
      const fim = Math.min(texto.length, idx + TAMANHO_JANELA_DEPOIS);
      const prefixo = inicio > 0 ? '[...trecho anterior omitido...] ' : '';
      const sufixo = fim < texto.length ? ' [...trecho seguinte omitido...]' : '';
      return prefixo + texto.slice(inicio, fim) + sufixo;
    }
  }
  return texto.slice(0, TAMANHO_MAX_SEM_JANELA) + ' [...trecho seguinte omitido...]';
}

function montarPrompt(registro) {
  const janela = recortarJanela(registro.texto_bruto, registro.keywords_matched);
  return [
    'Você lê editais de concurso/processo seletivo docente do Diário Oficial da União (Brasil)',
    'e extrai dados estruturados. Responda SOMENTE com um objeto JSON válido, sem nenhum texto',
    'antes ou depois, no formato exato abaixo (todos os 8 campos sempre presentes):',
    '',
    '{',
    '  "titulacao_exigida": {"valor": "graduacao" | "especializacao" | "mestrado" | "doutorado" | null, "certeza": true | false},',
    '  "area": {"valor": string | null, "certeza": true | false},',
    '  "subarea": {"valor": string | null, "certeza": true | false},',
    '  "campus": {"valor": string | null, "certeza": true | false},',
    '  "vagas": {"valor": number | null, "certeza": true | false},',
    '  "regime": {"valor": string | null, "certeza": true | false},',
    '  "inscricao_inicio": {"valor": "AAAA-MM-DD" | null, "certeza": true | false},',
    '  "inscricao_fim": {"valor": "AAAA-MM-DD" | null, "certeza": true | false}',
    '}',
    '',
    '"titulacao_exigida" é a titulação MÍNIMA exigida para a vaga especificamente relacionada a',
    `"${(registro.keywords_matched || []).join(', ') || registro.area || 'a área de interesse'}" — se o edital tiver várias linhas para áreas diferentes, responda sobre a linha dessa área, não de outra.`,
    '',
    'REGRA CRÍTICA, campo a campo: se você não tem certeza de um campo específico, responda',
    '"certeza": false e "valor": null PARA AQUELE CAMPO — mesmo que tenha certeza de outros campos',
    'no mesmo objeto. É melhor null do que um valor adivinhado. Não invente números de vaga, datas,',
    'nem titulação que não esteja explícita no texto. "certeza": true só quando o texto afirma o',
    'valor de forma inequívoca.',
    '',
    'Texto do edital (pode estar truncado):',
    '"""',
    janela,
    '"""',
    '',
    'Responda SOMENTE o JSON.'
  ].join('\n');
}

/**
 * Achado real da Onda 2.1: `format: 'json'` (decodificação com gramática
 * JSON forçada do Ollama) faz o `gemma4:26b` instalado na máquina de JB
 * travar em loop degenerado (saída repetitiva sem nunca fechar o JSON —
 * confirmado isolado, `{"point": [14, "Olá", "Olá", ...]}` correndo até o
 * timeout) mesmo em prompt trivial. SEM `format: 'json'` o mesmo modelo
 * responde coerente (`"Oi."` pra "diga oi", e o objeto JSON correto —
 * dentro de um bloco ```json``` — pro prompt real de extração). O prompt
 * já instrui "responda SOMENTE com um objeto JSON válido"; `parsearResposta`
 * tolera o bloco de código markdown que o modelo às vezes adiciona mesmo
 * assim. Continua sendo o MESMO modelo (gemma4:26b) — isto é correção da
 * CHAMADA, não troca de modelo.
 */
async function chamarModelo({ host, modelo, prompt, timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${host}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: modelo, prompt, stream: false }),
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} (modelo="${modelo}")`);
    const data = await res.json();
    const texto = String(data.response || '').trim();
    if (!texto) throw new Error(`resposta vazia do Ollama (modelo="${modelo}")`);
    return texto;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Remove o cercado de bloco de código markdown (```json ... ``` ou ``` ... ```)
 * que o modelo às vezes envolve a resposta com, mesmo sem `format: 'json'` —
 * `JSON.parse` não entende o cercado. Sem cercado, devolve a string igual.
 */
function removerCercadoMarkdown(texto) {
  const t = String(texto || '').trim();
  const m = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(t);
  return m ? m[1].trim() : t;
}

/**
 * Valida e normaliza um campo `{valor, certeza}` bruto vindo do modelo.
 * Qualquer coisa fora do formato esperado (chave ausente, `certeza` não
 * booleana, `valor` de tipo errado) vira `{ valor: null, proveniencia: 'ausente' }`
 * — nunca propaga lixo do modelo pro store.
 */
function normalizarCampo(bruto, nomeCampo) {
  if (!bruto || typeof bruto !== 'object' || bruto.certeza !== true || bruto.valor === null || bruto.valor === undefined) {
    return { valor: null, proveniencia: 'ausente' };
  }
  if (nomeCampo === 'titulacao_exigida') {
    const v = String(bruto.valor).toLowerCase().trim();
    if (!TITULACOES_VALIDAS.includes(v)) return { valor: null, proveniencia: 'ausente' };
    return { valor: v, proveniencia: 'llm' };
  }
  if (nomeCampo === 'vagas') {
    const n = Number(bruto.valor);
    if (!Number.isFinite(n) || n <= 0) return { valor: null, proveniencia: 'ausente' };
    return { valor: Math.round(n), proveniencia: 'llm' };
  }
  if (nomeCampo === 'inscricao_inicio' || nomeCampo === 'inscricao_fim') {
    const v = String(bruto.valor).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return { valor: null, proveniencia: 'ausente' };
    return { valor: v, proveniencia: 'llm' };
  }
  const v = String(bruto.valor).trim();
  if (!v) return { valor: null, proveniencia: 'ausente' };
  return { valor: v, proveniencia: 'llm' };
}

function parsearResposta(textoResposta) {
  let json;
  try {
    json = JSON.parse(removerCercadoMarkdown(textoResposta));
  } catch {
    return null; // resposta não é JSON válido — chamador trata como falha total
  }
  const resultado = {};
  for (const campo of CAMPOS) {
    resultado[campo] = normalizarCampo(json[campo], campo);
  }
  return resultado;
}

/**
 * Extrai os 8 campos de um registro via Ollama (modelo padrão + fallback,
 * mesma config de lib/ollama.js). Retorna:
 *   { status: 'ok', campos: { <nome>: {valor, proveniencia} }, modeloUsado }
 *   { status: 'falhou', campos: <todos 'ausente'>, motivo }
 * NUNCA lança — falha de rede/modelo degrada pra "todos os campos ausentes"
 * (o registro continua com o que já tinha, `titulacao_exigida` continua
 * null), consistente com o resto do pipeline (ollama.js `julgar`).
 */
async function extrairEstruturado(registro, perfil) {
  const cfg = (perfil && perfil.ollama) || {};
  const camposVazios = Object.fromEntries(CAMPOS.map(c => [c, { valor: null, proveniencia: 'ausente' }]));

  if (cfg.habilitado === false) {
    return { status: 'desabilitado', campos: camposVazios, motivo: 'ollama desabilitado em config/perfil.json' };
  }

  const host = cfg.host || 'http://localhost:11434';
  const modelo = cfg.modelo || 'llama3.1';
  const modeloFallback = cfg.modelo_fallback || null;
  const timeoutMs = cfg.timeout_ms || 60000;
  const prompt = montarPrompt(registro);

  const tentativas = [modelo, ...(modeloFallback && modeloFallback !== modelo ? [modeloFallback] : [])];
  let ultimoErro = null;

  for (const modeloTentativa of tentativas) {
    try {
      const respostaBruta = await chamarModelo({ host, modelo: modeloTentativa, prompt, timeoutMs });
      const campos = parsearResposta(respostaBruta);
      if (!campos) {
        ultimoErro = new Error(`resposta do modelo "${modeloTentativa}" não é JSON válido`);
        continue;
      }
      return { status: 'ok', campos, modeloUsado: modeloTentativa };
    } catch (err) {
      ultimoErro = err;
    }
  }

  return {
    status: 'falhou',
    campos: camposVazios,
    motivo: ultimoErro ? ultimoErro.message : 'motivo desconhecido'
  };
}

module.exports = {
  extrairEstruturado,
  montarPrompt,
  recortarJanela,
  parsearResposta,
  normalizarCampo,
  removerCercadoMarkdown,
  CAMPOS,
  TITULACOES_VALIDAS
};
