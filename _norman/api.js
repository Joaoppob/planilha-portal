'use strict';
const path = require('path');
const RAIZ = path.join(__dirname, '..');
require(path.join(RAIZ, 'lib', 'env')).carregarEnv(path.join(RAIZ, '.env'));
const sheets = require(path.join(RAIZ, 'lib', 'sheets'));

const ID = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
const CLIENT_EMAIL = process.env.GOOGLE_SHEETS_CLIENT_EMAIL;
const PRIVATE_KEY = process.env.GOOGLE_SHEETS_PRIVATE_KEY;
const BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

let _tok = null;
async function token() {
  if (!_tok) _tok = await sheets.obterAccessToken({ clientEmail: CLIENT_EMAIL, privateKey: PRIVATE_KEY });
  return _tok;
}
// COTA. O Sheets dá 60 requisições de escrita por MINUTO e por USUÁRIO, e ela
// é compartilhada entre `construir.js`, `formatar.js` e o sync de madrugada.
// Estourar não devolve um erro no fim: devolve 429 no MEIO, deixando a
// planilha meio-escrita ou meio-formatada — que é o pior estado possível,
// porque parece pronta. Duas defesas, nesta ordem:
//   1. `escreverVarios` (abaixo): N faixas numa requisição só. É a defesa
//      estrutural — não gastar a cota é melhor que aguentar o 429.
//   2. este backoff: quando mesmo assim vier 429 (ou 5xx transitório),
//      ESPERA e REPETE. Nunca reduz o que ia escrever pra caber na cota:
//      escopo encolhido pra passar num limite é a peça mentindo sobre o que
//      ela é. O `Retry-After` do servidor manda quando ele existe.
const RETENTAVEIS = new Set([429, 500, 502, 503, 504]);
const TENTATIVAS = 6;
const dormir = ms => new Promise(r => setTimeout(r, ms));

async function api(caminho, opcoes = {}) {
  const t = await token();
  const url = `${BASE}/${ID}${caminho}`;
  let espera = 2000;
  for (let tentativa = 1; ; tentativa++) {
    const r = await fetch(url, {
      ...opcoes,
      headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json', ...(opcoes.headers || {}) }
    });
    const txt = await r.text();
    if (r.ok) return txt ? JSON.parse(txt) : {};
    if (RETENTAVEIS.has(r.status) && tentativa < TENTATIVAS) {
      const cabecalho = Number(r.headers.get('retry-after'));
      const ms = Number.isFinite(cabecalho) && cabecalho > 0 ? cabecalho * 1000 : espera;
      console.log(`  HTTP ${r.status} em ${caminho.slice(0, 60)} — esperando ${Math.round(ms / 1000)}s e repetindo (${tentativa}/${TENTATIVAS - 1})`);
      await dormir(ms);
      espera = Math.min(espera * 2, 60000);
      continue;
    }
    throw new Error(`HTTP ${r.status} ${caminho}\n${txt.slice(0, 1200)}`);
  }
}
const meta = () => api('?includeGridData=false');
const ler = (rng, opt = '') => api(`/values/${encodeURIComponent(rng)}?${opt}`);
const escrever = (rng, values) => api(`/values/${encodeURIComponent(rng)}?valueInputOption=USER_ENTERED`, {
  method: 'PUT', body: JSON.stringify({ values })
});
/**
 * Escreve N faixas numa ÚNICA requisição (`values:batchUpdate`). Recebe
 * `[[range, values], ...]`. Existe pela mesma razão que `limpaCF` lê o GET em
 * vez de chutar índices: uma requisição por faixa era o caminho mais curto
 * pra planilha meio-escrita.
 */
const escreverVarios = (pares) => {
  if (!pares.length) return Promise.resolve({});
  return api('/values:batchUpdate', {
    method: 'POST',
    body: JSON.stringify({
      valueInputOption: 'USER_ENTERED',
      data: pares.map(([range, values]) => ({ range, values }))
    })
  });
};
/**
 * Lê N faixas numa ÚNICA requisição (`values:batchGet`). Espelho exato de
 * `escreverVarios`, e existe pelo mesmo motivo — só que do outro lado da
 * cota, que é SEPARADA: 60 LEITURAS por minuto e por usuário, contadas à
 * parte das 60 escritas.
 *
 * A dívida apareceu medida, não prevista: `verificar.js` cresceu para cobrir
 * a camada notícia e passou a fazer ~10 leituras de faixa única a mais.
 * Duas execuções seguidas estouraram o limite de leitura no ÚLTIMO controle
 * do arquivo — a auditoria morria depois de aprovar tudo, que é o pior lugar
 * pra morrer, porque parece reprovação. Encolher o que se confere pra caber
 * na cota seria o instrumento mentindo por conveniência; agrupar as faixas
 * confere o mesmo e custa uma requisição.
 *
 * Devolve os `valueRanges` na MESMA ordem das faixas pedidas, cada um já
 * reduzido a `values` (matriz), com `[]` no lugar de faixa vazia — para que
 * quem chama não precise repetir `(r.values || [])` dez vezes.
 */
const lerVarios = async (faixas, opt = '') => {
  if (!faixas.length) return [];
  const q = faixas.map(r => `ranges=${encodeURIComponent(r)}`).join('&');
  const dados = await api(`/values:batchGet?${q}${opt ? '&' + opt : ''}`);
  return (dados.valueRanges || []).map(v => v.values || []);
};
const limpar = (rng) => api(`/values/${encodeURIComponent(rng)}:clear`, { method: 'POST', body: '{}' });
const batch = (requests) => api(':batchUpdate', { method: 'POST', body: JSON.stringify({ requests }) });

module.exports = { api, meta, ler, lerVarios, escrever, escreverVarios, limpar, batch, ID };
