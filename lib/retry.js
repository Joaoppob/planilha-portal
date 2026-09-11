'use strict';

/**
 * Retry com backoff exponencial — "seja educado com o servidor" (item 1 do
 * briefing Onda 1.5). Usado no backfill em torno da requisição de listagem
 * do dia (fonte.coletar), que é o ponto de falha mais provável (WAF,
 * instabilidade de rede em uma varredura longa).
 *
 * Padrão: 3 tentativas, espera exponencial de base 5s (5s, 15s, 45s) entre
 * elas. Documentado no README §Backfill.
 */
async function comBackoff(fn, { tentativas = 3, baseMs = 5000, fatorMultiplicador = 3 } = {}) {
  let ultimoErro;
  for (let i = 0; i < tentativas; i++) {
    try {
      return await fn();
    } catch (err) {
      ultimoErro = err;
      if (i < tentativas - 1) {
        const espera = baseMs * Math.pow(fatorMultiplicador, i);
        await new Promise(r => setTimeout(r, espera));
      }
    }
  }
  throw ultimoErro;
}

module.exports = { comBackoff };
