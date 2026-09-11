'use strict';

/**
 * Julgamento fino opcional via Ollama local (item 6 do briefing Onda 1,
 * modelo revisado no item "Observação sobre o modelo" da Onda 1.5).
 * NUNCA chama API paga — só http://localhost (ou host configurado em
 * config/perfil.json, sempre local por convenção deste projeto).
 * Se o Ollama não responder, degrada para o score determinístico e marca
 * o item como julgamento: 'pendente'.
 *
 * Modelo é sempre lido de config/perfil.json (nunca hardcoded aqui) —
 * `ollama.modelo` é o padrão, `ollama.modelo_fallback` entra automaticamente
 * se o padrão falhar (timeout, HTTP erro, modelo não encontrado no host).
 */

function montarPrompt(registro) {
  return [
    'Você avalia oportunidades de concurso docente para um doutorando de Design',
    '(defesa prevista para 2029, mestrado não confirmado).',
    `Edital: ${registro.orgao || 'órgão desconhecido'}`,
    `Área/subárea: ${registro.area || '?'} / ${registro.subarea || '?'}`,
    `Titulação exigida: ${registro.titulacao_exigida || 'não identificada'}`,
    `Tipo: ${registro.tipo || 'não identificado'}`,
    `Score determinístico: ${registro.score}/100 — veredito: ${registro.veredito}`,
    `Trecho do edital: ${(registro.texto_bruto || '').slice(0, 800)}`,
    '',
    'Responda em no máximo 2 frases, em português, dizendo se vale a pena JB',
    'investir tempo nesse edital agora e por quê.'
  ].join('\n');
}

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

async function julgar(registro, perfil) {
  const cfg = (perfil && perfil.ollama) || {};
  if (cfg.habilitado === false) {
    return { status: 'pendente', justificativa: null, motivo: 'ollama desabilitado em config/perfil.json' };
  }

  const host = cfg.host || 'http://localhost:11434';
  const modelo = cfg.modelo || 'llama3.1';
  const modeloFallback = cfg.modelo_fallback || null;
  const timeoutMs = cfg.timeout_ms || 20000;
  const prompt = montarPrompt(registro);

  try {
    const texto = await chamarModelo({ host, modelo, prompt, timeoutMs });
    return { status: 'ok', justificativa: texto, modeloUsado: modelo };
  } catch (erroPrimario) {
    if (!modeloFallback || modeloFallback === modelo) {
      return { status: 'pendente', justificativa: null, motivo: erroPrimario.message };
    }
    try {
      const texto = await chamarModelo({ host, modelo: modeloFallback, prompt, timeoutMs });
      return {
        status: 'ok',
        justificativa: texto,
        modeloUsado: modeloFallback,
        motivo: `modelo padrão "${modelo}" falhou (${erroPrimario.message}), usado fallback "${modeloFallback}"`
      };
    } catch (erroFallback) {
      return {
        status: 'pendente',
        justificativa: null,
        motivo: `modelo padrão "${modelo}" falhou (${erroPrimario.message}); fallback "${modeloFallback}" também falhou (${erroFallback.message})`
      };
    }
  }
}

module.exports = { julgar, montarPrompt };
