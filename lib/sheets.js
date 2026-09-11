'use strict';

const crypto = require('crypto');
const modoSeco = require('./modo-seco');

/**
 * Espelho do store numa planilha Google Sheets — PUSH unidirecional
 * (Node -> Sheets), nunca o contrário. `data/store.jsonl` continua sendo a
 * verdade; a planilha é só o jeito de JB ler no celular/navegador sem SSH.
 *
 * Auth: Service Account + JWT RS256 assinado com `node:crypto` (zero
 * dependência npm — mesma doutrina do resto do projeto, ver README §Como
 * rodar). Fluxo OAuth2 de conta de serviço, sem lib `googleapis`:
 *   1. monta um JWT (header+claims próprios) e assina com a chave privada
 *      RSA da service account (`crypto.createSign('RSA-SHA256')`);
 *   2. troca o JWT por um access token em
 *      https://oauth2.googleapis.com/token (grant_type
 *      urn:ietf:params:oauth:grant-type:jwt-bearer);
 *   3. usa o access token pra chamar
 *      https://sheets.googleapis.com/v4/spreadsheets/{id}/values/...
 *      (Node >=18 tem `fetch` nativo — mesma base do lib/telegram.js).
 *
 * Espelha o padrão de lib/telegram.js: `montarLinhas()` é PURA (registros ->
 * linhas), o transporte (`enviar`, `obterAccessToken`, `limparAba`,
 * `escreverValores`) é que faz rede — é o que torna o módulo testável sem
 * rede (ver tests/sheets.test.js).
 *
 * Uma aba de máquina, N abas de leitura — e por quê (decisão do briefing,
 * não reaberta aqui):
 *   - `dados`    — crua, SOBRESCRITA a cada sync (clear + write), uma coluna
 *                  por campo do schema (COLUNAS abaixo). Nunca tem fórmula.
 *   - as demais  — o que JB abre pra ler (`Painel` e `Tudo` = concurso
 *                  docente; `Empregos` = trilha mercado), com
 *                  ARRAYFORMULA()/FILTER() puxando de `dados` via `_calc`.
 *                  NUNCA tocadas por este módulo — se o sync reescrevesse a
 *                  linha inteira delas, apagaria as fórmulas (ver README
 *                  §Fórmulas das abas de leitura).
 *
 * `garantirAbas()` cuida só de `dados` e `Painel` de propósito: são as duas
 * que o sync PRECISA que existam pra não falhar. As abas de leitura criadas
 * depois (`Tudo`, `_calc`, `Empregos`) são território de
 * `_norman/construir.js` — este módulo não as cria, não as apaga e não as
 * conhece além deste comentário.
 *
 * A coluna de "situação" (aberta/encerrada/prazo não identificado) é
 * FÓRMULA na aba Painel, contra HOJE() — NUNCA um valor calculado aqui em
 * Node. Se o Node calculasse e gravasse o texto, a planilha congelaria no
 * dia do último sync (JB quer que atualize sozinha, inclusive com o PC
 * desligado). Por isso `inscricao_fim` viaja como string ISO
 * (`AAAA-MM-DD`) crua — não como data já convertida — e a fórmula da
 * Painel usa `DATEVALUE()` explícito: ISO 8601 é o único formato que o
 * Sheets reconhece de forma NÃO ambígua em qualquer locale (dd/mm vs
 * mm/dd trocaria de sentido silenciosamente se a data já viesse
 * "USER_ENTERED"-parseada aqui).
 */

const SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const TOKEN_URI = 'https://oauth2.googleapis.com/token';
const SHEETS_API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';
// NOME DAS ABAS — fonte única de verdade do projeto inteiro.
//
// Estão aqui, e não em `_norman/`, por causa da direção da dependência: este
// módulo é o ÚNICO que o radar roda sozinho de madrugada, e `garantirAbas()`
// CRIA a aba que não encontrar pelo nome. Se o nome vivesse em dois lugares e
// eles divergissem, o sync criaria uma segunda aba vazia ao lado da de verdade
// e escreveria nela — a planilha continuaria abrindo, as fórmulas continuariam
// apontando pra aba antiga, e o radar ficaria congelado no dia da divergência
// sem emitir erro nenhum. `_norman/abas.js` IMPORTA daqui exatamente pra que
// essa divergência seja impossível por construção, não por disciplina.
//
// Os nomes são texto de INTERFACE, não identificador: são a única coisa que JB
// lê antes de decidir qual aba abrir, e a barra de abas do celular mostra ~3.
// `dados (não edite)` diz a regra no único lugar dessa aba que sobrevive ao
// sync — tudo mais lá dentro é apagado e reescrito todo dia.
const ABA_DADOS = 'dados (não edite)';
const ABA_PAINEL = 'Concursos';

// Nomes anteriores, na ordem em que existiram. Consumido por
// `_norman/construir.js`, que RENOMEIA a aba legada em vez de deixar
// `garantirAbas()` criar uma nova vazia ao lado dela.
const ABAS_LEGADAS = { [ABA_DADOS]: ['dados'], [ABA_PAINEL]: ['Painel'] };

/**
 * Nome de aba -> referência A1 válida. Nome com espaço, parêntese ou acento
 * PRECISA de aspas simples em notação A1 (`'dados (não edite)'!A1`); sem
 * aspas a API devolve 400 e o sync morre. Aspas simples internas dobram.
 */
function refAba(aba) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(aba) ? aba : `'${String(aba).replace(/'/g, "''")}'`;
}
const ABA_PLACEHOLDER_PADRAO = 'Página1'; // nome que o Sheets dá à primeira aba de uma planilha nova

/**
 * CARIMBO DE SYNC — a célula que responde "quando isto foi atualizado?".
 *
 * O modo de falha que ela existe pra matar: se `rodar-diario.bat` parar
 * (tarefa desagendada, `.env` corrompido, credencial expirada, PC desligado),
 * a planilha continua abrindo perfeita — as contas de dias são fórmulas
 * contra `TODAY()` e seguem certas — e o que é novo simplesmente não aparece.
 * A peça parece saudável enquanto morre. É a mesma doutrina que já governa a
 * saúde do coletor ("0 itens relevantes nunca pode ser indistinguível de
 * coletor quebrado"), aplicada à camada de cima.
 *
 * `MAX(data_publicacao)` seria um proxy MENTIROSO: "nenhum edital novo há 6
 * dias" é estado normal do DOU. Só o próprio sync sabe que rodou.
 *
 * ONDE, e por que não em `_calc`: a primeira recomendação era `_calc!S1`.
 * Não dá — `_calc` é território de `_norman/construir.js` e pode não existir
 * (planilha nova, aba apagada à mão). Se `enviar()` escrevesse lá, o sync
 * diário passaria a DEPENDER da camada de apresentação e morreria de
 * madrugada num setup limpo. `dados` é a única aba que `garantirAbas()`
 * garante existir, e é a aba que este módulo já possui inteira. A dependência
 * continua apontando pro lado certo: `_calc` lê de `dados`, nunca o contrário.
 *
 * ONDE dentro de `dados`: `Y1`/`Z1`. O bloco de dados vai de A a W (23
 * colunas) e a grade tem 26 (A..Z) — sobram X (folga), Y e Z. A escrita do
 * sync é ancorada em `A1` com 23 colunas de largura, então nunca encosta em
 * Y1. `tests/sheets.test.js` guarda essa folga: se `COLUNAS` crescer até
 * alcançar Y, o teste cai ANTES de um campo novo sobrescrever o carimbo.
 *
 * FORMATO — o mesmo cuidado de locale que governa `inscricao_fim`:
 *   Y1 = `AAAA-MM-DD` (ISO 8601, string crua sob `valueInputOption=RAW`).
 *        É o único formato que `DATEVALUE()` lê sem ambiguidade em qualquer
 *        locale; `dd/mm` vs `mm/dd` trocaria de sentido em silêncio.
 *   Z1 = a mesma coisa por extenso, pra humano — data, hora e FUSO. Nunca é
 *        parseada por fórmula nenhuma.
 *
 * A data é a data LOCAL, não UTC, e isso é MEDIDO: a planilha está em
 * `America/Sao_Paulo` (UTC-3) e `TODAY()` responde nesse fuso. O log da tarefa
 * registra execuções às 19:04 — em UTC isso já é o dia seguinte, e o carimbo
 * nasceria um dia à frente de `TODAY()`. O fuso vai gravado em Z1 justamente
 * pra que uma divergência futura (máquina reconfigurada) seja diagnosticável
 * em vez de virar um erro de ±1 dia sem explicação.
 */
const CELULA_CARIMBO = 'Y1';

/**
 * Pura: `Date` -> a linha `[ISO, texto humano]` que vai pra `Y1:Z1`.
 * Sem rede, sem `.env` — testável offline com uma data fixa.
 */
function montarCarimbo(agora = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  const iso = `${agora.getFullYear()}-${pad(agora.getMonth() + 1)}-${pad(agora.getDate())}`;
  const hora = `${pad(agora.getHours())}:${pad(agora.getMinutes())}`;
  let fuso = '';
  try {
    fuso = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch (e) {
    fuso = '';
  }
  const humano = `último sync: ${pad(agora.getDate())}/${pad(agora.getMonth() + 1)}/${agora.getFullYear()}`
    + ` ${hora} (${fuso || 'fuso local'}) — escrito por lib/sheets.js enviar()`;
  return [[iso, humano]];
}

/**
 * Ordem das colunas da aba `dados` — A..W (23 colunas). A ordem importa: as
 * fórmulas das abas de leitura (README §Fórmulas das abas de leitura)
 * referenciam por LETRA de coluna (ex. `dados!M2:M` para inscricao_fim,
 * `dados!R2:R` para extracao, `dados!U2:U` para trilha).
 *
 * REGRA DE MANUTENÇÃO — coluna nova entra SEMPRE NO FIM, nunca no meio.
 * Inserir no meio desloca todas as letras seguintes e quebra em silêncio
 * cada fórmula de `_norman/formulas.js` (que referencia por letra, não por
 * nome). As 3 colunas da Onda 3 (`trilha`, `modalidade`, `senioridade`)
 * entraram assim: U, V, W, depois de `id`, e nenhuma fórmula pré-existente
 * precisou mudar de letra. `tests/sheets.test.js` guarda esse invariante —
 * o teste afirma que os 20 primeiros nomes continuam na ordem original.
 */
const COLUNAS = [
  'orgao', 'campus', 'uf', 'area', 'subarea', 'subedital',
  'titulacao_exigida', 'vagas', 'tipo', 'regime', 'classe',
  'inscricao_inicio', 'inscricao_fim', 'data_publicacao',
  'score', 'veredito', 'area_compativel', 'extracao', 'url', 'id',
  // Onda 3 — apêndice (ver REGRA DE MANUTENÇÃO acima)
  'trilha', 'modalidade', 'senioridade'
];

const CAMPOS_NUMERICOS = new Set(['vagas', 'score']);

/**
 * Campos cujo valor ausente tem um DEFAULT canônico documentado no schema —
 * não é invenção da camada de apresentação, é a mesma regra que
 * `radar.js trilhaDoRegistro()` já aplica no pipeline.
 *
 * `trilha`: os 205 registros coletados ANTES da Onda 3 foram salvos sem o
 * campo (ver lib/schema.js: "null = registro antigo... é 'docente' na
 * prática, é a única trilha que existia"). Na planilha isso importa mais que
 * no store: `trilha` é EIXO DE FILTRO e é o que separa a aba `Painel`
 * (concurso) da aba `Empregos` (mercado). Deixar 205 células em branco
 * criaria um terceiro valor mudo no funil — "(Vazias)" — que o leitor teria
 * de decifrar, e faria `COUNTIF(dados!U2:U;"docente")` contar 0. Gravar o
 * default explícito é o que torna a coluna categórica de verdade.
 */
const DEFAULTS = { trilha: 'docente' };

const CABECALHO = [...COLUNAS];

/**
 * Converte um valor do registro pro tipo que a célula deve receber.
 * `null`/`undefined` -> string vazia (nunca a string "null" — célula em
 * branco é o único jeito honesto de representar "não identificado" numa
 * planilha, e é o que a fórmula da Painel testa com `=""`). Campo numérico
 * (`vagas`, `score`) mantém tipo `number` quando presente — é o que faz o
 * Sheets tratar a coluna como número de verdade (ordenação, soma), mesmo
 * com `valueInputOption=RAW` (RAW só afeta parsing de STRING; um valor
 * já-número no JSON enviado à API é gravado como número, não texto).
 */
function celula(registro, campo) {
  const v = registro[campo];
  if (v === null || v === undefined || v === '') {
    return campo in DEFAULTS ? DEFAULTS[campo] : '';
  }
  if (CAMPOS_NUMERICOS.has(campo)) {
    return typeof v === 'number' ? v : Number(v);
  }
  return String(v);
}

/**
 * Pura: registro[] -> linha[][] na ordem de COLUNAS. Não faz rede, não lê
 * `.env`, não decide dry-run — só monta os dados. Cobre os 3 casos do
 * briefing: registro completo, registro com campos `null`, e
 * `extracao: 'formato_nao_reconhecido'` (onde area/subarea/vagas/
 * titulacao_exigida/campus já chegam `null` do próprio store — este módulo
 * não decide isso, só transporta o que `radar.js`/`lib/subedital-extrator.js`
 * já decidiram; ver tests/sheets.test.js).
 */
function montarLinhas(registros) {
  return (registros || []).map(registro => COLUNAS.map(campo => celula(registro, campo)));
}

function base64url(buffer) {
  return Buffer.from(buffer)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Aceita tanto a chave privada com `\n` LITERAL (duas chars, o formato em
 * que a service-account.json guarda o valor — e portanto o formato mais
 * natural de colar numa linha de `.env`, ver README §Google Sheets) quanto
 * já com quebras de linha reais (se algum dia vier de outra fonte). Nunca
 * lança — `crypto.createSign` já vai reclamar de chave malformada de
 * qualquer jeito, com mensagem própria.
 */
function normalizarChavePrivada(chave) {
  const str = String(chave || '');
  return str.includes('\\n') ? str.replace(/\\n/g, '\n') : str;
}

/**
 * Monta e assina um JWT RS256 (Service Account, "self-signed JWT" do fluxo
 * OAuth2 de servidor-para-servidor do Google). Pura em relação a rede —
 * não chama nada, só monta a string; `obterAccessToken` é quem troca isto
 * por um token de verdade. Exportada pra teste offline (assinatura
 * verificável com a chave pública correspondente, sem precisar de rede —
 * ver tests/sheets.test.js).
 */
function criarJWT({ clientEmail, privateKey, scope = SCOPE, audiencia = TOKEN_URI, agora = Date.now() }) {
  if (!clientEmail || !privateKey) {
    throw new Error(
      '[falha: sheets criarJWT | clientEmail ou privateKey ausente | credencial não configurada | preencher GOOGLE_SHEETS_CLIENT_EMAIL/GOOGLE_SHEETS_PRIVATE_KEY no .env, ver README §Google Sheets]'
    );
  }
  const header = { alg: 'RS256', typ: 'JWT' };
  const iat = Math.floor(agora / 1000);
  const claims = { iss: clientEmail, scope, aud: audiencia, iat, exp: iat + 3600 };

  const entrada = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;
  const chave = normalizarChavePrivada(privateKey);
  const assinatura = crypto.createSign('RSA-SHA256').update(entrada).sign(chave);
  return `${entrada}.${base64url(assinatura)}`;
}

// Cache de access token em memória — escopo do processo (radar.js roda como
// CLI one-shot por dia; o cache evita pedir 2 tokens novos pras 2 chamadas
// da Sheets API — clear + write — de uma mesma execução de `sincronizar-sheets`,
// item 1 do briefing "cache do token enquanto válido"). Margem de 30s antes
// do `exp` real pra nunca usar um token expirado por causa de latência.
let tokenCache = null;

async function obterAccessToken({ clientEmail, privateKey }) {
  // Cerca de baixo nível (lib/modo-seco.js) — em modo seco nenhuma chamada de
  // rede acontece, nem para obter token OAuth (que por si só não escreve na
  // planilha, mas é o primeiro passo de todo caminho de escrita deste
  // módulo). Devolve um token sentinela, nunca `undefined` (evita `Bearer
  // undefined` se algum chamador ignorar a recusa e seguir adiante).
  if (modoSeco.estaAtivo()) {
    console.log('[sheets] MODO SECO — recusado obter access token; nenhuma chamada de rede feita.');
    return 'modo-seco-sem-token';
  }

  const agora = Date.now();
  if (tokenCache && tokenCache.expiraEm > agora + 30000) {
    return tokenCache.token;
  }

  const jwt = criarJWT({ clientEmail, privateKey, agora });
  const res = await fetch(TOKEN_URI, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    }).toString()
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    throw new Error(
      `[falha: sheets oauth token | HTTP ${res.status} ${JSON.stringify(data)} | client_email/private_key inválidos, relógio do sistema desalinhado, ou Sheets API não habilitada no projeto GCP | conferir .env e README §Google Sheets]`
    );
  }
  tokenCache = { token: data.access_token, expiraEm: agora + (Number(data.expires_in) || 3600) * 1000 };
  return tokenCache.token;
}

/**
 * ÚNICO ponto de chamada de rede que MUTA a planilha (usado por `limparAba`,
 * `garantirAbas` e `escreverValores`). Guardado aqui, não em cada uma delas
 * (ver lib/modo-seco.js) — cobre as três de uma vez e qualquer chamador
 * futuro que reuse esta função.
 */
async function chamarSheetsAPI(url, { method, accessToken, body }) {
  if (modoSeco.estaAtivo()) {
    console.log(`[sheets] MODO SECO — recusada chamada ${method} ${url}; nada foi lido/escrito na planilha.`);
    return { modoSeco: true };
  }
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      `[falha: sheets ${method} ${url} | HTTP ${res.status} ${JSON.stringify(data)} | planilha não compartilhada com a service account (Editor), GOOGLE_SHEETS_SPREADSHEET_ID errado, ou aba "${ABA_DADOS}" não existe | conferir README §Google Sheets]`
    );
  }
  return res.json().catch(() => ({}));
}

async function limparAba({ spreadsheetId, aba, accessToken }) {
  const url = `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(refAba(aba))}:clear`;
  return chamarSheetsAPI(url, { method: 'POST', accessToken, body: {} });
}

/**
 * Lê só os metadados (id + título) das abas existentes — nunca os valores
 * das células. Usado por `garantirAbas` pra decidir o que falta criar, sem
 * baixar a planilha inteira.
 */
async function listarAbas({ spreadsheetId, accessToken }) {
  const url = `${SHEETS_API_BASE}/${spreadsheetId}?fields=${encodeURIComponent('sheets.properties(sheetId,title)')}`;
  const data = await chamarSheetsAPI(url, { method: 'GET', accessToken });
  return (data.sheets || []).map(s => s.properties);
}

/**
 * Garante que as abas `dados` e `Painel` existam na planilha — idempotente
 * (item 4 do briefing Onda 2.3: criar por API em vez de pedir pra JB criar
 * à mão, que era justamente o passo que travava o setup). Cria só o que
 * falta, nunca duplica, nunca apaga aba existente.
 *
 * Decisão sobre a aba `Página1` (a que toda planilha nova do Sheets já
 * vem com uma aba em branco chamada assim): se `dados` ainda não existe E a
 * planilha só tem essa única aba placeholder vazia, RENOMEIA `Página1` para
 * `dados` em vez de criar uma aba nova e deixar `Página1` parada — evita um
 * artefato morto na barra de abas que JB nunca vai usar, sem perder nada
 * (a aba está vazia, renomear não apaga dado nenhum). Em qualquer outro
 * cenário (já existem outras abas, ou `Página1` não está mais vazia-única),
 * cria `dados` do zero e deixa `Página1` intocada — a instrução do briefing
 * é não apagar/mexer no que não é estritamente necessário.
 */
async function garantirAbas({ spreadsheetId, accessToken }) {
  const abas = await listarAbas({ spreadsheetId, accessToken });
  const titulos = abas.map(a => a.title);
  const requests = [];
  const acoes = [];

  if (!titulos.includes(ABA_DADOS)) {
    const placeholder = abas.length === 1 && titulos[0] === ABA_PLACEHOLDER_PADRAO ? abas[0] : null;
    if (placeholder) {
      requests.push({
        updateSheetProperties: {
          properties: { sheetId: placeholder.sheetId, title: ABA_DADOS },
          fields: 'title'
        }
      });
      acoes.push(`renomeou "${ABA_PLACEHOLDER_PADRAO}" -> "${ABA_DADOS}"`);
    } else {
      requests.push({ addSheet: { properties: { title: ABA_DADOS } } });
      acoes.push(`criou "${ABA_DADOS}"`);
    }
  }

  if (!titulos.includes(ABA_PAINEL)) {
    requests.push({ addSheet: { properties: { title: ABA_PAINEL } } });
    acoes.push(`criou "${ABA_PAINEL}"`);
  }

  if (requests.length === 0) {
    return { ok: true, alterado: false, acoes: [] };
  }

  const url = `${SHEETS_API_BASE}/${spreadsheetId}:batchUpdate`;
  await chamarSheetsAPI(url, { method: 'POST', accessToken, body: { requests } });
  return { ok: true, alterado: true, acoes };
}

/**
 * `valueInputOption=RAW` — o Sheets NÃO tenta interpretar string como
 * data/fórmula (evita a ambiguidade de locale citada no cabeçalho do
 * arquivo). Números que já chegam como `number` no JSON (score, vagas) são
 * gravados como número de qualquer jeito — RAW só governa parsing de
 * STRING, não o tipo já explícito no payload.
 */
async function escreverValores({ spreadsheetId, aba, valores, accessToken, celula = 'A1' }) {
  const range = `${refAba(aba)}!${celula}`;
  const url = `${SHEETS_API_BASE}/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`;
  return chamarSheetsAPI(url, { method: 'PUT', accessToken, body: { values: valores } });
}

/**
 * Transporte. Sem `spreadsheetId`/`clientEmail`/`privateKey` (credencial
 * não configurada no `.env`) — OU com `dryRun: true` explícito — cai em
 * dry-run: imprime o que enviaria (cabeçalho + amostra de linhas) e NÃO
 * chama rede nenhuma. Mesmo comportamento que `lib/telegram.js enviar()`
 * já tem sem token — permite testar o pipeline inteiro sem planilha
 * nenhuma configurada (item 2 do briefing).
 */
async function enviar(registros, { spreadsheetId, clientEmail, privateKey, dryRun, aba = ABA_DADOS } = {}) {
  const linhas = montarLinhas(registros);
  const valores = [CABECALHO, ...linhas];
  const semCredencial = !spreadsheetId || !clientEmail || !privateKey;

  if (dryRun || semCredencial) {
    console.log(
      `\n[DRY-RUN sheets] enviaria ${linhas.length} linha(s) para a aba "${aba}"` +
        (spreadsheetId ? ` da planilha ${spreadsheetId}` : ' (GOOGLE_SHEETS_SPREADSHEET_ID não configurado no .env)') +
        '\n'
    );
    console.log(CABECALHO.join(' | '));
    for (const linha of linhas.slice(0, 3)) console.log(linha.join(' | '));
    if (linhas.length > 3) console.log(`... (+${linhas.length - 3} linha(s))`);
    return { ok: true, dryRun: true, linhas: linhas.length };
  }

  const accessToken = await obterAccessToken({ clientEmail, privateKey });
  const abasGarantidas = await garantirAbas({ spreadsheetId, accessToken });
  if (abasGarantidas.alterado) {
    console.log(`[sheets] abas: ${abasGarantidas.acoes.join(', ')}`);
  }
  await limparAba({ spreadsheetId, aba, accessToken });
  await escreverValores({ spreadsheetId, aba, valores, accessToken });

  // CARIMBO — POR ÚLTIMO, e isso é semântica, não ordem de conveniência: ele
  // afirma "os dados abaixo são deste momento". Se a escrita dos dados falhar,
  // a exceção sobe antes daqui, o carimbo antigo permanece, a planilha
  // envelhece e o aviso acende sozinho. Um carimbo escrito antes dos dados
  // certificaria uma atualização que não aconteceu.
  //
  // Não é `try/catch`: falhar aqui TEM que derrubar `enviar()`. Carimbo que
  // deixa de ser gravado em silêncio é pior que carimbo nenhum — vira um "tudo
  // certo" permanente. Quem já absorve a falha do sync inteiro sem derrubar o
  // dia é `radar.js comandoSincronizarSheets`, que loga o erro e sai limpo.
  const carimbo = montarCarimbo();
  await escreverValores({ spreadsheetId, aba, valores: carimbo, accessToken, celula: CELULA_CARIMBO });
  // Vai pro `logs/rodar-diario.log` de propósito: é o rastro OFFLINE de que o
  // carimbo foi escrito, conferível sem abrir a planilha.
  console.log(`[sheets] carimbo de sync gravado em ${aba}!${CELULA_CARIMBO}: ${carimbo[0][0]}`);

  return { ok: true, dryRun: false, linhas: linhas.length, abas: abasGarantidas, carimbo: carimbo[0][0] };
}

module.exports = {
  COLUNAS,
  CABECALHO,
  ABA_DADOS,
  ABA_PAINEL,
  ABAS_LEGADAS,
  refAba,
  ABA_PLACEHOLDER_PADRAO,
  CELULA_CARIMBO,
  montarCarimbo,
  SCOPE,
  TOKEN_URI,
  montarLinhas,
  criarJWT,
  normalizarChavePrivada,
  obterAccessToken,
  garantirAbas,
  // Exportados para teste: são os dois pontos onde o nome da aba vira
  // notação A1 de verdade, e o nome atual (`dados (não edite)`) exige aspas.
  // Sem aspas a API devolve 400 — e essas são justamente as duas chamadas que
  // o radar faz sozinho de madrugada, sem ninguém olhando.
  limparAba,
  escreverValores,
  enviar
};
