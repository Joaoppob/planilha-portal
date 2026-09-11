'use strict';

const extratorLLM = require('./extrator-llm');

/**
 * Onda 2.1, item 2 do briefing — aplica lib/extrator-llm.js (já pronto e
 * testado na Onda 2.0) aos registros `veredito: 'indeterminada'` (titulação
 * não identificada pelo extrator regex). Wiring novo desta onda: o
 * extrator em si já existia, mas nunca tinha sido ligado ao store real.
 *
 * Regra dura mantida (mesma de lib/extrator-llm.js e do resto do projeto):
 * um campo só é aplicado ao registro quando (a) o modelo respondeu
 * `certeza: true` E (b) o registro AINDA NÃO tinha valor confiável ali —
 * nunca sobrescreve um dado que o regex (ou o subedital-extrator) já havia
 * resolvido. Campo com `certeza: false` continua `null` no registro, ponto.
 */
const CAMPOS_APLICAVEIS = extratorLLM.CAMPOS;

/**
 * Monta o patch de campos a aplicar a um registro a partir do resultado de
 * `extratorLLM.extrairEstruturado`. Só entra no patch o campo que (1) o LLM
 * respondeu com certeza E (2) o registro tinha `null` nesse campo antes —
 * nunca sobrescreve um valor já confiável (regex ou subedital).
 */
function aplicarCamposExtraidos(registro, camposExtraidos) {
  const patch = {};
  for (const campo of CAMPOS_APLICAVEIS) {
    const jaTinhaValor = registro[campo] !== null && registro[campo] !== undefined;
    if (jaTinhaValor) continue;
    const extraido = camposExtraidos[campo];
    if (extraido && extraido.valor !== null && extraido.proveniencia === 'llm') {
      patch[campo] = extraido.valor;
    }
  }
  return patch;
}

/**
 * Processa um único registro: chama o LLM, monta o patch de campos
 * aplicáveis. NUNCA lança — degrada pra patch vazio se o LLM falhar (mesma
 * garantia de `extratorLLM.extrairEstruturado`, nunca quebra o lote).
 */
async function processarRegistro(registro, perfil) {
  const resultado = await extratorLLM.extrairEstruturado(registro, perfil);
  const patchCampos = resultado.status === 'ok' ? aplicarCamposExtraidos(registro, resultado.campos) : {};
  return { resultado, patchCampos };
}

/**
 * Chamada de aquecimento (fora de `extratorLLM`, timeout próprio maior que
 * `perfil.ollama.timeout_ms`) — achado real desta onda: cold-start do
 * gemma4:26b mediu ~69s em 12/08/2026, ACIMA do timeout de 60s configurado
 * em config/perfil.json. Sem isto, o PRIMEIRO item do lote cairia pro
 * fallback gemma3:4b só por causa do cold-start (não por o modelo grande ter
 * falhado de verdade) — exatamente o que o briefing pediu pra NUNCA
 * acontecer. Descarta o resultado, só garante que o modelo já está
 * carregado antes do loop real começar.
 */
async function aquecerModelo({ host, modelo, timeoutMs = 120000 }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const inicio = Date.now();
  try {
    const res = await fetch(`${host}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: modelo, prompt: 'Responda apenas: OK', stream: false }),
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    await res.json();
    return { ok: true, elapsedMs: Date.now() - inicio };
  } catch (err) {
    return { ok: false, elapsedMs: Date.now() - inicio, erro: String((err && err.message) || err) };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { aplicarCamposExtraidos, processarRegistro, aquecerModelo, CAMPOS_APLICAVEIS };
