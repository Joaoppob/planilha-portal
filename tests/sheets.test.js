#!/usr/bin/env node
'use strict';

/**
 * Testa lib/sheets.js OFFLINE — nenhum teste aqui chama rede DE VERDADE
 * (os testes de `garantirAbas` monkey-patcham `global.fetch`, mesmo padrão
 * de `tests/ollama-fallback.test.js`). Cobre o mínimo exigido pelo
 * briefing: montagem de linha a partir de registro completo, registro com
 * campos `null`, e o caso `extracao: 'formato_nao_reconhecido'`. Também
 * prova a mecânica de assinatura RS256 do JWT (item 1 do briefing — auth)
 * com um par de chaves gerado em memória via `node:crypto`, verificando a
 * assinatura contra a chave pública correspondente — cobre a parte
 * criptográfica sem precisar de credencial real nem de rede. E cobre
 * `garantirAbas` (Onda 2.3, item 4 do briefing — criar as abas por API em
 * vez de pedir pra JB criar à mão): idempotência (nada a fazer -> zero
 * chamada de rede), a decisão de renomear `Página1` só quando ela é a
 * ÚNICA aba da planilha, e nunca mexer em `dados`/outras abas já
 * existentes.
 *
 * O que este arquivo NÃO prova (e não pode provar sem credencial real):
 * que a Sheets API de verdade aceita o token/JWT montado aqui, que a
 * planilha está compartilhada corretamente, ou que `enviar()` com
 * `dryRun: false` funciona contra o Google de verdade — isso só se prova
 * no primeiro `node radar.js sincronizar-sheets` real do JB (ver README
 * §Google Sheets).
 */

const assert = require('assert');
const crypto = require('crypto');
const sheets = require('../lib/sheets');

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    return true;
  } catch (error) {
    console.log(`  ✗ ${name}`);
    console.error(`    ${error.message}`);
    return false;
  }
}

async function runAsyncTest(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    return true;
  } catch (error) {
    console.log(`  ✗ ${name}`);
    console.error(`    ${error.message}`);
    return false;
  }
}

function registroCompleto(overrides) {
  return {
    id: 'abc123',
    fonte: 'dou',
    orgao: 'Universidade Federal de São Carlos',
    campus: 'Sorocaba',
    uf: 'SP',
    area: 'Design',
    subarea: 'Design (geral)',
    subedital: '004/26.41',
    titulacao_exigida: 'doutorado',
    vagas: 1,
    regime: 'Dedicação Exclusiva',
    classe: 'Professor Adjunto',
    tipo: 'efetivo',
    inscricao_inicio: '2026-08-12',
    inscricao_fim: '2026-09-01',
    data_publicacao: '2026-08-12',
    score: 87,
    veredito: 'elegivel_agora',
    area_compativel: 'compativel',
    extracao: null,
    url: 'https://www.in.gov.br/web/dou/-/exemplo',
    texto_bruto: 'texto integral do edital...',
    ...overrides
  };
}

async function main() {
  console.log('\n=== sheets.test.js ===\n');
  let passed = 0;
  let failed = 0;

  const testesSincronos = [
    ['COLUNAS e CABECALHO têm o mesmo conteúdo e 23 colunas', () => {
      assert.strictEqual(sheets.COLUNAS.length, 23);
      assert.deepStrictEqual(sheets.CABECALHO, sheets.COLUNAS);
      // ordem crítica pra README §Fórmulas das abas de leitura (as fórmulas
      // referenciam LETRA de coluna): inscricao_fim é M, extracao é R,
      // trilha é U.
      assert.strictEqual(sheets.COLUNAS[12], 'inscricao_fim');
      assert.strictEqual(sheets.COLUNAS[17], 'extracao');
      assert.strictEqual(sheets.COLUNAS[20], 'trilha');
      assert.strictEqual(sheets.COLUNAS[sheets.COLUNAS.length - 1], 'senioridade');
    }],

    // O invariante que protege as fórmulas não é "id é a última" (era, e
    // deixou de ser quando a Onda 3 apendou 3 colunas) — é que NENHUMA das
    // 20 originais muda de POSIÇÃO. Coluna nova entra no fim; se um dia
    // alguém inserir no meio, este teste é quem grita, e não uma célula
    // #REF! na planilha do JB três dias depois.
    ['COLUNAS: as 20 originais mantêm posição exata — coluna nova só entra no FIM', () => {
      const originais = [
        'orgao', 'campus', 'uf', 'area', 'subarea', 'subedital',
        'titulacao_exigida', 'vagas', 'tipo', 'regime', 'classe',
        'inscricao_inicio', 'inscricao_fim', 'data_publicacao',
        'score', 'veredito', 'area_compativel', 'extracao', 'url', 'id'
      ];
      assert.deepStrictEqual(sheets.COLUNAS.slice(0, 20), originais);
    }],

    // Registro coletado ANTES da Onda 3 não tem `trilha` no store (os 205
    // editais do DOU). Na planilha `trilha` é EIXO DE FILTRO e é o que separa
    // `Painel` de `Empregos` — célula em branco viraria um terceiro valor mudo
    // no funil e faria COUNTIF(dados!U2:U;"docente") contar 0. Mesmo default
    // canônico de radar.js `trilhaDoRegistro()` e de lib/schema.js.
    ['montarLinhas: registro antigo sem `trilha` -> "docente" (nunca célula em branco)', () => {
      const idx = sheets.COLUNAS.indexOf('trilha');
      const semTrilha = registroCompleto();
      delete semTrilha.trilha;
      assert.strictEqual(sheets.montarLinhas([semTrilha])[0][idx], 'docente');
      assert.strictEqual(sheets.montarLinhas([registroCompleto({ trilha: null })])[0][idx], 'docente');
      assert.strictEqual(sheets.montarLinhas([registroCompleto({ trilha: '' })])[0][idx], 'docente');
      // e `mercado` passa intacto — o default só preenche ausência
      assert.strictEqual(sheets.montarLinhas([registroCompleto({ trilha: 'mercado' })])[0][idx], 'mercado');
    }],

    // modalidade/senioridade são SEMPRE null na trilha docente (lib/schema.js)
    // — precisam chegar como célula em branco, não como a string "null".
    ['montarLinhas: modalidade/senioridade viajam quando existem e ficam vazias quando não', () => {
      const iM = sheets.COLUNAS.indexOf('modalidade');
      const iS = sheets.COLUNAS.indexOf('senioridade');
      const docente = sheets.montarLinhas([registroCompleto({ modalidade: null, senioridade: null })])[0];
      assert.strictEqual(docente[iM], '');
      assert.strictEqual(docente[iS], '');
      const mercado = sheets.montarLinhas([registroCompleto({ modalidade: 'remoto', senioridade: 'senior' })])[0];
      assert.strictEqual(mercado[iM], 'remoto');
      assert.strictEqual(mercado[iS], 'senior');
    }],

    ['montarLinhas: registro completo -> linha na ordem de COLUNAS, com os valores certos', () => {
      const [linha] = sheets.montarLinhas([registroCompleto()]);
      assert.strictEqual(linha.length, sheets.COLUNAS.length);
      const porCampo = Object.fromEntries(sheets.COLUNAS.map((c, i) => [c, linha[i]]));
      assert.strictEqual(porCampo.orgao, 'Universidade Federal de São Carlos');
      assert.strictEqual(porCampo.subedital, '004/26.41');
      assert.strictEqual(porCampo.inscricao_fim, '2026-09-01');
      assert.strictEqual(porCampo.id, 'abc123');
      assert.strictEqual(porCampo.url, 'https://www.in.gov.br/web/dou/-/exemplo');
    }],

    ['montarLinhas: score e vagas viram number, não string (pra Sheets tratar como número de verdade)', () => {
      const [linha] = sheets.montarLinhas([registroCompleto({ score: 87, vagas: 3 })]);
      const idxScore = sheets.COLUNAS.indexOf('score');
      const idxVagas = sheets.COLUNAS.indexOf('vagas');
      assert.strictEqual(typeof linha[idxScore], 'number');
      assert.strictEqual(linha[idxScore], 87);
      assert.strictEqual(typeof linha[idxVagas], 'number');
      assert.strictEqual(linha[idxVagas], 3);
    }],

    ['montarLinhas: registro com campos null -> string vazia, nunca "null" literal', () => {
      const registro = registroCompleto({
        campus: null,
        subedital: null,
        vagas: null,
        regime: null,
        classe: null,
        inscricao_inicio: null,
        inscricao_fim: null,
        area_compativel: null
      });
      const [linha] = sheets.montarLinhas([registro]);
      const porCampo = Object.fromEntries(sheets.COLUNAS.map((c, i) => [c, linha[i]]));
      for (const campo of ['campus', 'subedital', 'vagas', 'regime', 'classe', 'inscricao_inicio', 'inscricao_fim', 'area_compativel']) {
        assert.strictEqual(porCampo[campo], '', `campo ${campo} deveria ser string vazia, veio ${JSON.stringify(porCampo[campo])}`);
      }
      // e nunca a string literal "null"
      assert.ok(!linha.includes('null'), 'nenhuma célula deve conter a string "null"');
    }],

    ["montarLinhas: extracao='formato_nao_reconhecido' -> extracao preservado, campos honestamente vazios chegam vazios", () => {
      const registro = registroCompleto({
        extracao: 'formato_nao_reconhecido',
        area: null,
        subarea: null,
        vagas: null,
        titulacao_exigida: null,
        campus: null
      });
      const [linha] = sheets.montarLinhas([registro]);
      const porCampo = Object.fromEntries(sheets.COLUNAS.map((c, i) => [c, linha[i]]));
      assert.strictEqual(porCampo.extracao, 'formato_nao_reconhecido');
      assert.strictEqual(porCampo.area, '');
      assert.strictEqual(porCampo.subarea, '');
      assert.strictEqual(porCampo.vagas, '');
      assert.strictEqual(porCampo.titulacao_exigida, '');
      assert.strictEqual(porCampo.campus, '');
    }],

    ['montarLinhas: lista vazia -> array vazio (não lança)', () => {
      assert.deepStrictEqual(sheets.montarLinhas([]), []);
      assert.deepStrictEqual(sheets.montarLinhas(undefined), []);
    }],

    ['normalizarChavePrivada: converte \\n literal em quebra de linha real', () => {
      const entrada = '-----BEGIN PRIVATE KEY-----\\nAAA\\nBBB\\n-----END PRIVATE KEY-----\\n';
      const saida = sheets.normalizarChavePrivada(entrada);
      assert.ok(saida.includes('\n'));
      assert.ok(!saida.includes('\\n'));
    }],

    ['normalizarChavePrivada: chave já com quebra real passa intacta', () => {
      const entrada = '-----BEGIN PRIVATE KEY-----\nAAA\n-----END PRIVATE KEY-----\n';
      assert.strictEqual(sheets.normalizarChavePrivada(entrada), entrada);
    }],

    ['criarJWT: monta 3 partes (header.claims.assinatura) e a assinatura RS256 verifica contra a chave pública', () => {
      // Gera um par de chaves de TESTE em memória — nunca toca em credencial
      // real, nunca faz rede. Prova a mecânica de assinatura do JWT (item 1
      // do briefing), não a integração com o Google.
      const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
      });

      const agora = Date.parse('2026-08-26T12:00:00.000Z');
      const jwt = sheets.criarJWT({ clientEmail: 'radar-jb@teste.iam.gserviceaccount.com', privateKey, agora });

      const partes = jwt.split('.');
      assert.strictEqual(partes.length, 3);

      const decodeBase64Url = str => Buffer.from(str.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
      const header = JSON.parse(decodeBase64Url(partes[0]));
      const claims = JSON.parse(decodeBase64Url(partes[1]));

      assert.strictEqual(header.alg, 'RS256');
      assert.strictEqual(header.typ, 'JWT');
      assert.strictEqual(claims.iss, 'radar-jb@teste.iam.gserviceaccount.com');
      assert.strictEqual(claims.scope, sheets.SCOPE);
      assert.strictEqual(claims.aud, sheets.TOKEN_URI);
      assert.strictEqual(claims.exp - claims.iat, 3600);

      const entradaAssinada = `${partes[0]}.${partes[1]}`;
      const assinatura = Buffer.from(partes[2].replace(/-/g, '+').replace(/_/g, '/'), 'base64');
      const valido = crypto.verify('RSA-SHA256', Buffer.from(entradaAssinada), publicKey, assinatura);
      assert.strictEqual(valido, true, 'a assinatura RS256 do JWT deveria verificar contra a chave pública correspondente');
    }],

    ['criarJWT: sem clientEmail/privateKey lança erro claro em vez de assinar com lixo', () => {
      assert.throws(() => sheets.criarJWT({ clientEmail: '', privateKey: '' }), /clientEmail ou privateKey ausente/);
    }]
  ];

  for (const [name, fn] of testesSincronos) {
    if (runTest(name, fn)) passed++;
    else failed++;
  }

  const testesAssincronos = [
    ['enviar(): sem credencial no ambiente -> cai em dry-run sozinho, não lança, não chama rede', async () => {
      const resultado = await sheets.enviar([registroCompleto()], {
        spreadsheetId: undefined,
        clientEmail: undefined,
        privateKey: undefined,
        dryRun: false
      });
      assert.strictEqual(resultado.ok, true);
      assert.strictEqual(resultado.dryRun, true);
      assert.strictEqual(resultado.linhas, 1);
    }],

    ['enviar(): dryRun explícito -> mesmo com credencial presente, não chama rede', async () => {
      const resultado = await sheets.enviar([registroCompleto(), registroCompleto({ id: 'def456' })], {
        spreadsheetId: 'planilha-fake',
        clientEmail: 'fake@teste.iam.gserviceaccount.com',
        privateKey: 'chave-fake',
        dryRun: true
      });
      assert.strictEqual(resultado.ok, true);
      assert.strictEqual(resultado.dryRun, true);
      assert.strictEqual(resultado.linhas, 2);
    }],

    ['garantirAbas(): só existe "Página1" vazia -> renomeia para "dados" e cria "Painel" (idempotente por construção)', async () => {
      const fetchOriginal = global.fetch;
      const chamadas = [];
      try {
        global.fetch = async (url, opts) => {
          chamadas.push({ url, method: opts && opts.method });
          if (opts && opts.method === 'GET') {
            return { ok: true, json: async () => ({ sheets: [{ properties: { sheetId: 0, title: 'Página1' } }] }) };
          }
          return { ok: true, json: async () => ({}) };
        };
        const resultado = await sheets.garantirAbas({ spreadsheetId: 'planilha-fake', accessToken: 'token-fake' });
        assert.strictEqual(resultado.alterado, true);
        assert.strictEqual(resultado.acoes.length, 2);
        assert.ok(resultado.acoes.some(a => a.includes('renomeou') && a.includes(sheets.ABA_PLACEHOLDER_PADRAO) && a.includes(sheets.ABA_DADOS)));
        assert.ok(resultado.acoes.some(a => a.includes('criou') && a.includes(sheets.ABA_PAINEL)));

        const batchUpdate = chamadas.find(c => c.method === 'POST');
        assert.ok(batchUpdate, 'esperava uma chamada POST de batchUpdate');
        assert.ok(batchUpdate.url.endsWith(':batchUpdate'));
      } finally {
        global.fetch = fetchOriginal;
      }
    }],

    ['garantirAbas(): "dados" já existe, falta "Painel" -> cria só "Painel", nunca mexe em "dados"', async () => {
      const fetchOriginal = global.fetch;
      let corpoEnviado = null;
      try {
        global.fetch = async (url, opts) => {
          if (opts && opts.method === 'GET') {
            return {
              ok: true,
              json: async () => ({
                sheets: [
                  { properties: { sheetId: 1, title: sheets.ABA_DADOS } },
                  { properties: { sheetId: 2, title: 'Outra aba de JB' } }
                ]
              })
            };
          }
          corpoEnviado = JSON.parse(opts.body);
          return { ok: true, json: async () => ({}) };
        };
        const resultado = await sheets.garantirAbas({ spreadsheetId: 'planilha-fake', accessToken: 'token-fake' });
        assert.strictEqual(resultado.alterado, true);
        assert.strictEqual(resultado.acoes.length, 1);
        assert.ok(resultado.acoes[0].includes(sheets.ABA_PAINEL));
        assert.strictEqual(corpoEnviado.requests.length, 1);
        assert.strictEqual(corpoEnviado.requests[0].addSheet.properties.title, sheets.ABA_PAINEL);
      } finally {
        global.fetch = fetchOriginal;
      }
    }],

    ['garantirAbas(): "dados" e "Painel" já existem -> não chama rede nenhuma (idempotente de verdade)', async () => {
      const fetchOriginal = global.fetch;
      let chamouRede = false;
      try {
        global.fetch = async (url, opts) => {
          if (opts && opts.method === 'GET') {
            return {
              ok: true,
              json: async () => ({
                sheets: [
                  { properties: { sheetId: 1, title: sheets.ABA_DADOS } },
                  { properties: { sheetId: 2, title: sheets.ABA_PAINEL } }
                ]
              })
            };
          }
          chamouRede = true;
          return { ok: true, json: async () => ({}) };
        };
        const resultado = await sheets.garantirAbas({ spreadsheetId: 'planilha-fake', accessToken: 'token-fake' });
        assert.strictEqual(resultado.alterado, false);
        assert.deepStrictEqual(resultado.acoes, []);
        assert.strictEqual(chamouRede, false, 'não deveria chamar batchUpdate quando as duas abas já existem');
      } finally {
        global.fetch = fetchOriginal;
      }
    }],

    ['garantirAbas(): mais de uma aba já existente e "dados" falta -> cria "dados" nova, NUNCA renomeia "Página1" (não é a única aba)', async () => {
      const fetchOriginal = global.fetch;
      let corpoEnviado = null;
      try {
        global.fetch = async (url, opts) => {
          if (opts && opts.method === 'GET') {
            return {
              ok: true,
              json: async () => ({
                sheets: [
                  { properties: { sheetId: 0, title: 'Página1' } },
                  { properties: { sheetId: 2, title: sheets.ABA_PAINEL } }
                ]
              })
            };
          }
          corpoEnviado = JSON.parse(opts.body);
          return { ok: true, json: async () => ({}) };
        };
        const resultado = await sheets.garantirAbas({ spreadsheetId: 'planilha-fake', accessToken: 'token-fake' });
        assert.strictEqual(resultado.alterado, true);
        assert.strictEqual(corpoEnviado.requests.length, 1);
        assert.ok(corpoEnviado.requests[0].addSheet, '"Página1" não é a única aba — deveria criar "dados" nova, não renomear');
        assert.strictEqual(corpoEnviado.requests[0].addSheet.properties.title, sheets.ABA_DADOS);
      } finally {
        global.fetch = fetchOriginal;
      }
    }],

    // ------------------------------------------------------------------
    // refAba() e o nome de aba com espaço. A aba de dados passou a se chamar
    // `dados (não edite)` porque o nome da aba é o único rótulo dela que
    // sobrevive ao sync (tudo mais lá dentro é apagado e reescrito todo dia) —
    // e a barra de abas é o que JB lê antes de decidir onde entrar.
    //
    // O preço técnico disso é uma regra de notação A1 que não perdoa: nome com
    // espaço/parêntese PRECISA de aspas simples, e sem elas a API devolve 400.
    // Os dois pontos onde isso pode quebrar são o `:clear` e o `PUT` do sync —
    // as duas únicas chamadas que o radar faz sozinho de madrugada. Um teste
    // que só checasse `refAba()` isolada passaria mesmo se alguém tirasse a
    // chamada de dentro do transporte; por isso os dois casos abaixo inspecionam
    // a URL REAL que sairia pra rede.
    ['refAba(): nome simples fica cru, nome com espaço/parêntese/apóstrofo ganha aspas', async () => {
      assert.strictEqual(sheets.refAba('dados'), 'dados');
      assert.strictEqual(sheets.refAba('_calc'), '_calc');
      assert.strictEqual(sheets.refAba('dados (não edite)'), "'dados (não edite)'");
      assert.strictEqual(sheets.refAba('Concursos · tudo'), "'Concursos · tudo'");
      assert.strictEqual(sheets.refAba("Aba do O'Brien"), "'Aba do O''Brien'");
      // A constante em uso tem que sobreviver à própria regra.
      assert.ok(sheets.refAba(sheets.ABA_DADOS).length > 0);
    }],

    // ================= CARIMBO DE SYNC =================
    // O carimbo é a única coisa na planilha que responde "de quando é isto".
    // Se ele parar de ser escrito, nada quebra: a planilha continua abrindo
    // linda, as contas contra TODAY() continuam certas, e o aviso de
    // desatualizada nunca acende — vira um "tudo certo" permanente. Por isso
    // ele é guardado por teste UNITÁRIO (aqui, na URL que sairia pra rede) e
    // não só pelo controle contra a planilha viva: este roda em
    // `node radar.js testar`, sem rede e sem credencial.
    ['montarCarimbo(): ISO 8601 pra máquina, texto com hora e FUSO pra humano — e data LOCAL, não UTC', async () => {
      // 23:30 local. Em UTC (a planilha está em America/Sao_Paulo, UTC-3) isso
      // já é o dia SEGUINTE, e o carimbo nasceria um dia à frente de TODAY().
      // O log da tarefa registra execução às 19:04 — a janela é real.
      const carimbo = sheets.montarCarimbo(new Date(2026, 7, 26, 23, 30, 0));
      assert.strictEqual(carimbo.length, 1);
      assert.strictEqual(carimbo[0].length, 2);
      assert.strictEqual(carimbo[0][0], '2026-08-26');
      assert.ok(carimbo[0][1].includes('26/08/2026'), `texto humano deveria trazer a data por extenso, veio: ${carimbo[0][1]}`);
      assert.ok(carimbo[0][1].includes('23:30'), `texto humano deveria trazer a hora, veio: ${carimbo[0][1]}`);
      assert.ok(/\(.+\)/.test(carimbo[0][1]), `texto humano deveria trazer o fuso entre parênteses, veio: ${carimbo[0][1]}`);
      // Um dígito em cada casa: 1º de janeiro tem que sair 2027-01-01, não 2027-1-1.
      assert.strictEqual(sheets.montarCarimbo(new Date(2027, 0, 1, 8, 5, 0))[0][0], '2027-01-01');
    }],

    ['CELULA_CARIMBO fica FORA do bloco de dados — com folga, e é este teste que grita se COLUNAS crescer', async () => {
      const letra = sheets.CELULA_CARIMBO.replace(/[0-9]/g, '');
      const indiceCarimbo = letra.charCodeAt(0) - 64; // A=1
      assert.strictEqual(letra.length, 1, 'carimbo numa coluna de duas letras estaria fora da grade de 26 colunas');
      assert.ok(
        indiceCarimbo > sheets.COLUNAS.length + 1,
        `o carimbo está em ${sheets.CELULA_CARIMBO} (coluna ${indiceCarimbo}) e o bloco de dados já usa ${sheets.COLUNAS.length} colunas — ` +
        'a próxima coluna de dado sobrescreveria o carimbo no sync, e a planilha voltaria a não saber de quando ela é. ' +
        'Mova CELULA_CARIMBO antes de acrescentar a coluna.'
      );
      assert.ok(indiceCarimbo <= 26, 'a grade da aba de dados tem 26 colunas (A..Z)');
    }],

    ['enviar(): grava o carimbo em Y1 DEPOIS dos dados, na mesma aba, com o nome entre aspas', async () => {
      const fetchOriginal = global.fetch;
      const chamadas = [];
      // Chave RSA de verdade (descartável): `criarJWT` assina com
      // `crypto.createSign`, e uma string qualquer estoura no DECODER antes de
      // a requisição sair. Mesmo recurso do teste de assinatura acima.
      const { privateKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
      });
      try {
        global.fetch = async (url, opts) => {
          chamadas.push({ url: decodeURIComponent(String(url)), method: (opts && opts.method) || 'GET', body: opts && opts.body });
          if (String(url).includes('oauth2')) return { ok: true, json: async () => ({ access_token: 'tok', expires_in: 3600 }) };
          if (!opts || opts.method === 'GET') {
            return {
              ok: true,
              json: async () => ({
                sheets: [
                  { properties: { sheetId: 0, title: sheets.ABA_DADOS } },
                  { properties: { sheetId: 1, title: sheets.ABA_PAINEL } }
                ]
              })
            };
          }
          return { ok: true, json: async () => ({}) };
        };

        const resultado = await sheets.enviar([registroCompleto()], {
          spreadsheetId: 'planilha-fake',
          clientEmail: 'fake@teste.iam.gserviceaccount.com',
          privateKey,
          dryRun: false
        });

        const aspas = sheets.refAba(sheets.ABA_DADOS);
        const puts = chamadas.filter(c => c.method === 'PUT');
        assert.strictEqual(puts.length, 2, `esperava 2 escritas (dados + carimbo), houve ${puts.length} — se virou 1, o carimbo parou de ser gravado`);
        assert.ok(puts[0].url.includes(`${aspas}!A1`), `a 1ª escrita deveria ser o bloco de dados em A1, veio: ${puts[0].url}`);
        assert.ok(
          puts[1].url.includes(`${aspas}!${sheets.CELULA_CARIMBO}`),
          `a 2ª escrita deveria ser o carimbo em ${aspas}!${sheets.CELULA_CARIMBO}, veio: ${puts[1].url}`
        );

        // ORDEM é semântica: o carimbo afirma "os dados abaixo são deste
        // momento". Escrito antes, certificaria uma atualização que ainda podia
        // falhar. E o clear vem antes dos dois — senão apagaria o carimbo.
        assert.ok(chamadas.indexOf(puts[0]) < chamadas.indexOf(puts[1]), 'o carimbo tem que ser escrito DEPOIS dos dados');
        const idxClear = chamadas.findIndex(c => c.url.includes(':clear'));
        assert.ok(idxClear >= 0 && idxClear < chamadas.indexOf(puts[0]), 'o clear da aba tem que vir antes das escritas');

        const enviado = JSON.parse(puts[1].body).values;
        assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(enviado[0][0]), `o carimbo enviado não é ISO 8601: ${JSON.stringify(enviado)}`);
        assert.strictEqual(resultado.carimbo, enviado[0][0], 'enviar() deveria devolver o carimbo gravado, pra quem chama poder logar');
      } finally {
        global.fetch = fetchOriginal;
      }
    }],

    ['limparAba()/escreverValores(): a URL que vai pra rede leva o nome da aba JÁ ENTRE ASPAS', async () => {
      const fetchOriginal = global.fetch;
      const urls = [];
      try {
        global.fetch = async (url) => { urls.push(decodeURIComponent(url)); return { ok: true, json: async () => ({}) }; };
        await sheets.limparAba({ spreadsheetId: 'p', aba: sheets.ABA_DADOS, accessToken: 't' });
        await sheets.escreverValores({ spreadsheetId: 'p', aba: sheets.ABA_DADOS, valores: [['a']], accessToken: 't' });

        const esperado = sheets.refAba(sheets.ABA_DADOS);
        assert.ok(urls[0].includes(esperado + ':clear'), `clear deveria usar ${esperado}, veio: ${urls[0]}`);
        assert.ok(urls[1].includes(esperado + '!A1'), `update deveria usar ${esperado}!A1, veio: ${urls[1]}`);
        // Guarda contra a regressão exata: nome com espaço solto, sem aspas.
        if (/[^A-Za-z0-9_]/.test(sheets.ABA_DADOS)) {
          urls.forEach(u => assert.ok(
            !new RegExp('/values/' + sheets.ABA_DADOS.replace(/[.*+?^${}()|[\\]]/g, '\\$&')).test(u),
            'nome de aba com espaço apareceu SEM aspas na URL — a API devolveria 400 e o sync morreria de madrugada'
          ));
        }
      } finally {
        global.fetch = fetchOriginal;
      }
    }]
  ];

  for (const [name, fn] of testesAssincronos) {
    if (await runAsyncTest(name, fn)) passed++;
    else failed++;
  }

  console.log(`\n${passed} passou(aram), ${failed} falhou(aram)\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
