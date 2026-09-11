'use strict';

/**
 * Wrapper HTTP mínimo (fetch nativo do Node >=18). O in.gov.br fecha a
 * conexão (TLS renegotiation abrupt close) sem um User-Agent de navegador —
 * confirmado empiricamente durante a Onda 1 (ver README §Fonte DOU).
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

/**
 * `headers` (opção nova, investigação do bloqueio HTTP 429 de
 * `fontes/vagas.js` em `/vagas/{id}`, 09/09/2026 — briefing de Durin
 * §4 "FRONTEIRA DURA": qualquer mudança é ADITIVA e opt-in) — mesmo padrão
 * já usado por `post()` abaixo (`{ 'User-Agent': UA, ..., ...headers }`,
 * spread DEPOIS dos defaults, mesma convenção já documentada em
 * `getComCharset` — "Acréscimo, não alteração"). Toda chamada existente
 * (`dou`, `pci`, `gupy`, `programathor`, `selecaoacademica`,
 * `weworkremotely`, as de notícia) chama `http.get(url)` sem segundo
 * argumento — `{ 'User-Agent': UA, Accept: '...', ...{} }` é o MESMO
 * objeto, mesma chave, mesmo valor, byte a byte, do que existia antes desta
 * mudança (prova em `tests/http-headers-opt-in.test.js`, mock de
 * `global.fetch`, sem rede). Só quem passar `headers` explicitamente muda
 * de comportamento.
 */
async function get(url, { timeoutMs = 20000, headers = {} } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html,application/json', ...headers },
      redirect: 'follow',
      signal: controller.signal
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ao buscar ${url}`);
    }
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * POST com corpo JSON (Onda 5 — fontes/pci.js, servidor MCP da PCI
 * Concursos: `POST https://mcp.pciconcursos.com.br/mcp`, JSON-RPC 2.0 sobre
 * HTTP simples, sem WebSocket/SSE, sem autenticação — ver cabeçalho de
 * fontes/pci.js para o relato completo do modo de acesso). Acrescentado
 * aqui em vez de um módulo HTTP concorrente porque o único diferencial real
 * é método+corpo+content-type; timeout/abort/UA seguem exatamente o mesmo
 * padrão de `get` acima. `body` é serializado para JSON pelo próprio
 * wrapper — quem chama passa um objeto, nunca uma string pré-serializada.
 */
async function post(url, body, { timeoutMs = 20000, headers = {} } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'User-Agent': UA, 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
      body: JSON.stringify(body),
      redirect: 'follow',
      signal: controller.signal
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ao POST ${url}`);
    }
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * GET decodificando o corpo com um charset EXPLÍCITO (Onda notícias —
 * `fontes-noticias/folha.js`). Acréscimo, não alteração: `get`/`post` acima
 * seguem byte-idênticos e nenhuma chamada existente muda de comportamento.
 *
 * Por que precisa existir: os feeds da Folha
 * (`feeds.folha.uol.com.br/SECAO/rss091.xml`) são ISO-8859-1, não UTF-8.
 * `res.text()` do fetch assume UTF-8 e devolve `Presid?ncia`,
 * `exporta??es` — achado real do reconhecimento de fontes de notícia. O modo
 * de falha é o pior possível: não lança erro, não some com o item, só
 * corrompe o acento silenciosamente e a planilha nasce com lixo.
 *
 * `TextDecoder` é global no Node >=18 (mesma exigência de engine do
 * `package.json`), sem dependência nova.
 */
async function getComCharset(url, { charset = 'utf-8', timeoutMs = 20000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xml,application/json' },
      redirect: 'follow',
      signal: controller.signal
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ao buscar ${url}`);
    }
    const buffer = await res.arrayBuffer();
    return new TextDecoder(charset).decode(buffer);
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { get, post, getComCharset, UA };
