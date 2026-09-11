'use strict';
// ===========================================================================
// PROVA DO PORTAL — instrumento de leitura e de estado forçado
// ===========================================================================
//
// Existe por duas razões, e as duas são a mesma lei: um canal visual que
// NUNCA foi visto aceso não é um canal, é uma intenção.
//
//   node _norman/prova-portal.js baseline
//       Transcreve o estado vivo das quatro abas digitadas (o único dado
//       HUMANO da planilha) + o carimbo. É o "antes" e o "depois" de
//       qualquer conserto.
//
//   node _norman/prova-portal.js carimbo-velho
//       Força o ramo de ALARME: reescreve `dados (não edite)!Y1` com uma data
//       antiga o bastante pra estourar o limiar de dias ÚTEIS. Antes de
//       escrever, GRAVA o valor real em disco; nada é forçado sem que o
//       original esteja salvo.
//
//   node _norman/prova-portal.js restaurar
//       Devolve `Y1:Z1` ao valor salvo e PROVA byte a byte que voltou.
//       Recusa restaurar se o snapshot não existir.
//
//   node _norman/prova-portal.js ler-alarme
//       Lê o veredito RENDERIZADO das quatro superfícies de alarme e diz se o
//       gatilho da regra condicional está presente na célula. É a leitura que
//       transforma "a regra existe" em "o ramo acendeu".
//
// O carimbo é escrito pelo robô todo dia. Tocá-lo é a única exceção que este
// arquivo se permite, e ela vem com o par restaurar+provar embutido — sem o
// snapshot em disco, `carimbo-velho` se recusa a rodar duas vezes seguidas
// (ele nunca sobrescreve um snapshot existente com um valor já forçado).
const fs = require('fs');
const path = require('path');
const a = require('./api');
const A = require('./abas');
const F = require('./formulas');
const R = A.ref;

// DUAS TRILHAS, DOIS CARIMBOS, UM INSTRUMENTO.
//
// O alarme desta peca tem duas maquinas: o radar de vaga carimba
// `dados (nao edite)!Y1` e o coletor de noticia carimba
// `noticias (nao edite)!Y1`. Enquanto este arquivo so sabia forcar o
// primeiro, as 4 abas de noticia nao tinham como ser vistas ACESAS - e um
// canal visual que nunca foi visto aceso nao e um canal, e uma intencao.
//
// O snapshot em disco e POR TRILHA: forcar uma nao pode apagar o valor real
// da outra.
const TRILHAS = {
  vaga: { aba: A.DADOS, arquivo: '.carimbo-original.json' },
  noticia: { aba: A.NOTICIAS_DADOS, arquivo: '.carimbo-noticia-original.json' }
};
const trilhaDe = nome => {
  const t = TRILHAS[nome || 'vaga'];
  if (!t) throw new Error(`trilha "${nome}" nao existe (use ${Object.keys(TRILHAS).join('|')})`);
  return t;
};
const snapDe = t => path.join(__dirname, t.arquivo);
const faixaDe = t => `${R(t.aba)}!Y1:Z1`;

const SNAP = path.join(__dirname, TRILHAS.vaga.arquivo);
const FAIXA_CARIMBO = faixaDe(TRILHAS.vaga);

const lerCarimboDe = async t => ((await a.ler(faixaDe(t))).values || [[]])[0] || [];
const lerCarimbo = () => lerCarimboDe(TRILHAS.vaga);

// Onda 18-20 — o CRM cresceu de 4 pra 6 abas digitadas/derivadas desde que
// este `baseline` foi escrito (Ondas 5 e 14 acrescentaram `Candidaturas` e
// `Etapas`, e nenhuma das duas nunca entrou aqui). A largura de cada faixa
// deriva do cabeçalho REAL de cada aba (nunca um `A1:K12` chutado igual pra
// todas) — mesma lei de N-17 que o resto de `_norman/` já segue.
async function baseline() {
  const out = {};
  const largura = cab => String.fromCharCode(64 + Math.max(cab.length, 7));
  const abas = [
    [A.TAREFAS, F.TAREFAS_CABECALHO], [A.PROJETOS, F.PROJETOS_CABECALHO],
    [A.FILA, F.FILA_CABECALHO], [A.DIARIO, F.DIARIO_CABECALHO],
    [A.ETAPAS, F.ETAPAS_CABECALHO], [A.CANDIDATURAS, F.CANDIDATURAS_CABECALHO]
  ];
  for (const [aba, cab] of abas) {
    out[aba] = (await a.ler(`${R(aba)}!A1:${largura(cab)}12`)).values || [];
  }
  out['dados!Y1:Z1'] = await lerCarimbo();
  console.log(JSON.stringify(out, null, 1));
}

// Le o veredito RENDERIZADO das DOZE abas de vista. O sinal do alarme nao e
// mais o gatilho da regra (ela le o ESTADO), mas continua sendo o que JB ve -
// entao a leitura aqui responde "a FRASE apareceu?". Quem responde "a COR
// pintou?" e `chapa`, que le o PDF. As duas perguntas sao diferentes e as
// duas precisam de resposta: frase sem cor e cor sem frase sao os dois modos
// de o alarme mentir sobre si mesmo.
async function lerAlarme() {
  const abas = Object.keys(F.ALARME_ABAS);
  const faixas = abas.map(aba => `${R(aba)}!A${F.alarmeLinha(aba)}`);
  const lido = await a.lerVarios(faixas);
  let acesas = 0;
  abas.forEach((aba, i) => {
    const v = String(((lido[i] || [])[0] || [])[0] || '');
    const acende = v.includes(F.GLIFO_ALARME);
    if (acende) acesas++;
    console.log(`${aba}!A${F.alarmeLinha(aba)}  [${F.ALARME_ABAS[aba].join('+')}]  sinal "${F.GLIFO_ALARME}" ${acende ? 'PRESENTE -> a FRASE do alarme esta na celula' : 'ausente -> estado normal'}`);
    console.log(`   ${JSON.stringify(v.slice(0, 190))}`);
  });
  console.log(`\n${acesas}/${abas.length} aba(s) de vista com a frase do alarme.`);
}

async function carimboVelho() {
  const t = trilhaDe(process.argv[3]);
  const snap = snapDe(t);
  if (fs.existsSync(snap)) {
    throw new Error(`já existe ${snap} — o estado atual da planilha PODE ser o forçado. Rode "restaurar" antes de forçar de novo.`);
  }
  const original = await lerCarimboDe(t);
  fs.writeFileSync(snap, JSON.stringify(original));
  console.log(`trilha: ${process.argv[3] || 'vaga'} · célula: ${faixaDe(t)}`);
  console.log('carimbo REAL salvo em disco:', JSON.stringify(original));
  // Recuar dias CORRIDOS o bastante pra que o limiar em dias ÚTEIS estoure
  // com folga em qualquer dia da semana: 3 dias úteis exigem, no pior caso
  // (contando fim de semana), 5 corridos. 14 corridos é folga que não depende
  // de qual dia é hoje nem de feriado.
  const d = new Date();
  d.setDate(d.getDate() - 14);
  const iso = [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
  const z = original[1] === undefined ? '' : original[1];
  await a.escrever(faixaDe(t), [[iso, z]]);
  const depois = await lerCarimboDe(t);
  console.log('carimbo FORÇADO para:', JSON.stringify(depois));
}

async function restaurar() {
  const t = trilhaDe(process.argv[3]);
  const snap = snapDe(t);
  if (!fs.existsSync(snap)) throw new Error(`não há ${snap} — nada a restaurar, e eu não invento o valor do carimbo real.`);
  const original = JSON.parse(fs.readFileSync(snap, 'utf8'));
  const antes = await lerCarimboDe(t);
  await a.escrever(faixaDe(t), [original]);
  const depois = await lerCarimboDe(t);
  const igual = JSON.stringify(depois) === JSON.stringify(original);
  console.log(`trilha: ${process.argv[3] || 'vaga'} · célula: ${faixaDe(t)}`);
  console.log('antes da restauração:', JSON.stringify(antes));
  console.log('salvo em disco     :', JSON.stringify(original));
  console.log('depois             :', JSON.stringify(depois));
  if (!igual) throw new Error('RESTAURAÇÃO NÃO BATE — a planilha não voltou ao carimbo salvo. NÃO apago o snapshot.');
  fs.unlinkSync(snap);
  console.log('OK — byte-idêntico ao original. Snapshot apagado.');
}

// ---------------------------------------------------------------------------
// O ALARME NÃO SE PROVA LENDO A CÉLULA — SE PROVA NA CHAPA
// ---------------------------------------------------------------------------
//
// Ler o texto do veredito prova que o GATILHO chegou; não prova que a REGRA
// pintou. E aqui há duas dúvidas de plataforma abertas, nenhuma das duas
// resolvível por leitura de API:
//
//   1. formatação condicional sobre célula MESCLADA pinta a mescla inteira?
//   2. o fundo `S1 #F7DDD9` de fato substitui o cromo `N1 #F4F1EA`?
//
// A única superfície onde isso se responde é a RENDERIZADA. O export em PDF do
// Sheets é o que a service account alcança sem o login de JB — e ele desenha
// FUNDO (só não desenha emoji). Então: força o estado, exporta a aba, e conta
// os operadores de cor do PDF. Se `F7DDD9` aparece na chapa, o alarme acendeu.
//
// Escopo: este endpoint é do Drive, não do Sheets — precisa de
// `drive.readonly`, um JWT à parte. O token do projeto (escopo `spreadsheets`)
// devolve 403 aqui.
const path2 = require('path');
const RAIZ = path2.join(__dirname, '..');
const SHEETS = require(path2.join(RAIZ, 'lib', 'sheets'));

// ---- O LEITOR DE COR, E OS DOIS CONTROLES QUE O DERRUBAM ----
//
// A primeira versão deste leitor varria o PDF como `latin1` e procurava
// operadores `rg` no texto cru. Rodada contra a chapa do `Hoje`, ela devolveu
// `(nenhuma)` — e devolveu junto o veredito `N1 #F4F1EA .. AUSENTE`, que é
// IMPOSSÍVEL: a faixa de cromo é constante por construção, está em toda aba, e
// o export desenha FUNDO (só não desenha emoji). O leitor não estava lendo
// zero COR: estava lendo zero BYTE legível, porque o content stream do export
// do Google vem FlateDecode-comprimido.
//
// Um leitor cego responde "ausente" pra tudo — inclusive pro alarme. Era
// exatamente a resposta que eu queria ouvir, com a forma de uma medição, e a
// versão anterior ainda imprimia `OK` no fim. Por isso os controles aqui não
// são comentário, são `throw`:
//
//   POSITIVO  N1 #F4F1EA — a faixa de cromo, presente em toda chapa por
//             construção. Se ela some, quem sumiu foi o leitor, e nenhum
//             veredito sobre S1 abaixo dele vale nada.
//   NEGATIVO  #123456 — cor que não existe na paleta da peça (são 8 cores, e
//             esta não é uma delas). Se aparecer, o leitor está fabricando.
//
// Sem os dois, "S1 ausente" e "S1 presente" são a mesma frase dita por um
// instrumento que não sabe a diferença.
const zlib = require('zlib');

/** Concatena os content streams do PDF, inflando os que vierem comprimidos. */
const conteudoDoPdf = buf => {
  const partes = [];
  let i = 0;
  while ((i = buf.indexOf('stream', i)) !== -1) {
    // `endstream` contém `stream`; sem esta guarda o laço reentraria no fim
    // do bloco que acabou de ser lido.
    if (i >= 3 && buf.subarray(i - 3, i).toString('latin1') === 'end') { i += 6; continue; }
    let ini = i + 6;
    if (buf[ini] === 0x0d) ini++;
    if (buf[ini] === 0x0a) ini++;
    const fim = buf.indexOf('endstream', ini);
    if (fim === -1) break;
    const bruto = buf.subarray(ini, fim);
    try { partes.push(zlib.inflateSync(bruto).toString('latin1')); }
    catch { partes.push(bruto.toString('latin1')); }
    i = fim + 9;
  }
  return partes.join('\n');
};

const corDoPdf = buf => {
  // Operadores `rg` (preenchimento RGB não-calibrado) do content stream, 0..1.
  const txt = conteudoDoPdf(buf);
  const achados = new Set();
  const re = /(\d*\.?\d+)\s+(\d*\.?\d+)\s+(\d*\.?\d+)\s+rg\b/g;
  let m;
  while ((m = re.exec(txt))) {
    const hex = [1, 2, 3].map(k => Math.round(parseFloat(m[k]) * 255).toString(16).padStart(2, '0').toUpperCase()).join('');
    achados.add('#' + hex);
  }
  return achados;
};

/** Baixa o PDF renderizado de uma aba (endpoint do Drive, escopo drive.readonly). */
async function baixarChapa(abaPedida) {
  const aba = abaPedida || 'Hoje';
  const jwt = SHEETS.criarJWT({
    clientEmail: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
    privateKey: process.env.GOOGLE_SHEETS_PRIVATE_KEY,
    scope: 'https://www.googleapis.com/auth/drive.readonly'
  });
  const r = await fetch(SHEETS.TOKEN_URI, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }).toString()
  });
  const tk = await r.json();
  if (!tk.access_token) throw new Error('sem token drive.readonly: ' + JSON.stringify(tk).slice(0, 300));

  const meta = await a.api('?includeGridData=false&fields=sheets(properties(title,sheetId))');
  const alvo = meta.sheets.find(s => s.properties.title === aba);
  if (!alvo) throw new Error(`aba "${aba}" não existe`);
  const url = `https://docs.google.com/spreadsheets/d/${a.ID}/export?format=pdf&gid=${alvo.properties.sheetId}&portrait=false&gridlines=false`;
  const pdf = await fetch(url, { headers: { Authorization: `Bearer ${tk.access_token}` } });
  if (!pdf.ok) throw new Error(`export ${pdf.status}: ${(await pdf.text()).slice(0, 200)}`);
  return Buffer.from(await pdf.arrayBuffer());
}

async function chapa() {
  const aba = process.argv[3] || 'Hoje';
  const buf = await baixarChapa(aba);
  const cores = corDoPdf(buf);
  const N1 = '#F4F1EA', S1 = '#F7DDD9', FALSA = '#123456';

  console.log(`chapa de "${aba}": ${buf.length} bytes · ${cores.size} cor(es) de preenchimento distintas`);
  console.log('cores no PDF RENDERIZADO:', [...cores].sort().join(' · ') || '(nenhuma)');

  // OS CONTROLES DERRUBAM O INSTRUMENTO ANTES DE ELE OPINAR SOBRE O ALARME.
  if (!cores.has(N1)) {
    throw new Error(
      `CONTROLE POSITIVO FALHOU — a faixa de cromo N1 ${N1} não apareceu na chapa de "${aba}".\n` +
      `Ela é constante por construção e o export desenha fundo: quem não está lendo é o LEITOR.\n` +
      `Nenhum veredito sobre ${S1} vale enquanto isto não passar.`
    );
  }
  if (cores.has(FALSA)) {
    throw new Error(`CONTROLE NEGATIVO FALHOU — o leitor achou ${FALSA}, que não existe na paleta da peça. Ele está fabricando cor.`);
  }
  console.log(`controles do leitor: positivo (${N1} presente) e negativo (${FALSA} ausente) passaram`);
  console.log(`  S1 ${S1} (alarme) ....... ${cores.has(S1) ? 'PRESENTE — a faixa do alarme está PINTADA na chapa' : 'ausente — estado normal'}`);
}

// ---------------------------------------------------------------------------
// O CONTROLE NEGATIVO DO CHEQUE DE NAV VISÍVEL (D1)
// ---------------------------------------------------------------------------
//
// `verificar.js` diz "células de nav em coluna VISÍVEL: 31/31". Essa frase não
// vale nada enquanto ninguém tiver visto o número CAIR. Foi exatamente assim
// que o D1 passou: o invariante N-13 conferia se o `gid` era válido e dizia
// 4/4, com dois dos quatro links dentro de coluna oculta — link perfeito,
// invisível, aprovado.
//
// Então: esconde de propósito uma coluna que HOSPEDA nav, roda o verificador
// de verdade (processo à parte, o mesmo binário que o gate roda), mostra a
// acusação, e devolve a coluna. A restauração vai num `finally` — se o
// verificador estourar, se a cota devolver 429, se o processo morrer no meio,
// a coluna volta assim mesmo. Uma prova que precisa de alguém lembrar de
// desfazer não é uma prova, é um risco.
const { spawnSync } = require('child_process');

const ABA_ALVO = A.PAINEL;   // `Concursos` — a aba onde o D1 aconteceu
const COL_ALVO = 1;          // coluna B (0-based): hospeda o slot 2 da nav

const visibilidadeDe = async (aba, col) => {
  const gd = await a.api(
    `?includeGridData=true&ranges=${encodeURIComponent(`${R(aba)}!A1:K1`)}` +
    `&fields=sheets(properties(title,sheetId),data(columnMetadata(hiddenByUser)))`
  );
  const s = gd.sheets.find(x => x.properties.title === aba);
  if (!s) throw new Error(`aba "${aba}" não existe`);
  const cols = ((s.data || [])[0] || {}).columnMetadata || [];
  return { sheetId: s.properties.sheetId, oculta: !!((cols[col] || {}).hiddenByUser) };
};

const definirOculta = (sheetId, col, oculta) => a.batch([{
  updateDimensionProperties: {
    range: { sheetId, dimension: 'COLUMNS', startIndex: col, endIndex: col + 1 },
    properties: { hiddenByUser: oculta },
    fields: 'hiddenByUser'
  }
}]);

async function provaNavOculta() {
  const letra = String.fromCharCode(65 + COL_ALVO);
  const antes = await visibilidadeDe(ABA_ALVO, COL_ALVO);
  console.log(`ANTES  ${ABA_ALVO}!${letra} oculta=${antes.oculta}`);
  if (antes.oculta) throw new Error(`${ABA_ALVO}!${letra} JÁ está oculta — este controle exige partir de uma coluna visível.`);

  let saida = '', codigo = null;
  try {
    await definirOculta(antes.sheetId, COL_ALVO, true);
    const depois = await visibilidadeDe(ABA_ALVO, COL_ALVO);
    console.log(`FORÇADO ${ABA_ALVO}!${letra} oculta=${depois.oculta}`);
    if (!depois.oculta) throw new Error('a coluna não ficou oculta — o controle não chegou a exercitar nada');

    const r = spawnSync(process.execPath, [path.join(__dirname, 'verificar.js')], {
      encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 15 * 60 * 1000
    });
    saida = (r.stdout || '') + (r.stderr || '');
    codigo = r.status;
  } finally {
    // SEMPRE devolve a coluna, aconteça o que acontecer acima.
    await definirOculta(antes.sheetId, COL_ALVO, false);
    const volta = await visibilidadeDe(ABA_ALVO, COL_ALVO);
    console.log(`RESTAURADO ${ABA_ALVO}!${letra} oculta=${volta.oculta}`);
    if (volta.oculta) throw new Error(`A COLUNA ${ABA_ALVO}!${letra} CONTINUA OCULTA — restauração falhou, conserte à mão.`);
  }

  // O que o verificador disse enquanto a coluna estava escondida.
  const linhas = saida.split(/\r?\n/);
  const i = linhas.findIndex(l => l.includes('NAVEGAÇÃO (coluna visível)'));
  console.log('\n--- o que verificar.js disse com a coluna escondida ---');
  if (i >= 0) console.log(linhas.slice(i, i + 6).join('\n'));
  console.log(linhas.filter(l => l.includes('está numa coluna OCULTA') || l.includes('FALHAS DA NAVEGAÇÃO')).join('\n'));
  console.log(`\nexit code de verificar.js: ${codigo}`);

  const acusou = /está numa coluna OCULTA/.test(saida);
  if (!acusou) throw new Error('CONTROLE NEGATIVO FALHOU — a coluna estava oculta e verificar.js NÃO acusou. O cheque de nav visível não vale nada.');
  if (codigo === 0) throw new Error('CONTROLE NEGATIVO FALHOU — verificar.js acusou no texto mas saiu com código 0. Instrumento que relata e não aborta depende de alguém ler.');
  console.log('CONTROLE NEGATIVO PASSOU — coluna oculta => verificar.js acusa E aborta.');
}

/** Conta OCORRÊNCIAS de cada cor de preenchimento (não só presença). */
const contarCorDoPdf = buf => {
  const txt = conteudoDoPdf(buf);
  const contagem = new Map();
  const re = /(\d*\.?\d+)\s+(\d*\.?\d+)\s+(\d*\.?\d+)\s+rg\b/g;
  let m;
  while ((m = re.exec(txt))) {
    const hex = '#' + [1, 2, 3].map(k => Math.round(parseFloat(m[k]) * 255).toString(16).padStart(2, '0').toUpperCase()).join('');
    contagem.set(hex, (contagem.get(hex) || 0) + 1);
  }
  return contagem;
};

// ---------------------------------------------------------------------------
// D2 — A AFORDÂNCIA DE LINK, MEDIDA NA CHAPA E NÃO NO CÓDIGO
// ---------------------------------------------------------------------------
//
// A medição de Norman no laudo é o "antes" e ela é reproduzível: no PDF do
// `Hoje` inteiro o acento `#0B5D57` aparecia **16 vezes**, que são exatamente
// os 4 links da nav × 2 páginas de cabeçalho congelado — ZERO acento no corpo
// do painel. Os títulos de bloco, a linha de transbordo e as colunas `Abrir`
// eram `HYPERLINK` saindo em preto de corpo.
//
// `formatar.js` agora pinta os títulos (R-H1), o transbordo (R-H2) e as
// colunas `Abrir` com o mesmo acento. Isso é o que o CÓDIGO faz. Se o acento
// atravessou pro corpo é pergunta sobre a PEÇA, e a peça é a chapa.
//
// Presença não responde: o acento já estava presente ANTES (a nav é acento).
// Só a CONTAGEM separa "4 links de nav" de "os 10 destinos clicáveis".
async function contarCor() {
  const aba = process.argv[3] || 'Hoje';
  const alvo = (process.argv[4] || '#0B5D57').toUpperCase();
  const buf = await baixarChapa(aba);
  const contagem = contarCorDoPdf(buf);
  const N1 = '#F4F1EA', FALSA = '#123456';
  if (!contagem.has(N1)) throw new Error(`CONTROLE POSITIVO FALHOU — N1 ${N1} ausente na chapa de "${aba}"; o leitor está cego.`);
  if (contagem.has(FALSA)) throw new Error(`CONTROLE NEGATIVO FALHOU — o leitor achou ${FALSA}, que não está na paleta.`);
  console.log(`chapa de "${aba}": ${buf.length} bytes`);
  console.log(`controles do leitor: positivo (${N1}) e negativo (${FALSA}) passaram`);
  console.log('ocorrências por cor:');
  [...contagem.entries()].sort((x, y) => y[1] - x[1]).forEach(([c, n]) => console.log(`  ${c}  ${n}`));
  console.log(`\nALVO ${alvo}: ${contagem.get(alvo) || 0} ocorrência(s)`);
  console.log('   (laudo de 2026-08-27, ANTES do conserto: #0B5D57 = 16, todas na nav, zero no corpo)');
}

// ---------------------------------------------------------------------------
// ONDA 20 — SALVAR A CHAPA EM DISCO (a prova visual final)
// ---------------------------------------------------------------------------
//
// `chapa`/`contar-cor` já baixam o PDF renderizado — mas descartam o buffer
// depois de ler. A prova da Onda 18-20 pede um render POR ABA em
// `_prova-final/`, e o instrumento anterior desta mesma pasta (`_prova-ux/`)
// documentou o modo de falha exato: 12 arquivos batizados com nome de aba que
// eram 2 imagens (a mesma tela de erro), descoberto só por `md5sum`. A cura
// registrada lá — "todo lote de screenshot precisa de `md5sum | sort -u |
// wc -l`" — vale igual pra PDF: `salvar-chapa` grava o arquivo E imprime o
// tamanho em bytes na hora, pra um lote com todos os arquivos do MESMO
// tamanho já acender suspeita antes mesmo de rodar `md5sum` por fora.
async function salvarChapa() {
  const aba = process.argv[3] || 'Hoje';
  const destino = process.argv[4] || path.join(__dirname, '_prova-final', aba.replace(/[^\w-]+/g, '_') + '.pdf');
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  const buf = await baixarChapa(aba);
  // Mesmo controle positivo de `chapa()`: um PDF que não carrega a faixa de
  // cromo N1 é um PDF que não renderizou a aba — gravar ele seria gravar a
  // MESMA classe de prova falsa que `_prova-ux/LEIA-INVALIDO.md` denuncia.
  const cores = corDoPdf(buf);
  const N1 = '#F4F1EA';
  if (!cores.has(N1)) {
    throw new Error(`"${aba}": PDF de ${buf.length} bytes NÃO tem a faixa de cromo ${N1} — provável tela de erro/redirect, não a aba. Não gravado.`);
  }
  fs.writeFileSync(destino, buf);
  console.log(`gravado: ${destino} (${buf.length} bytes, ${cores.size} cor(es) distintas — N1 presente)`);
}

const COMANDOS = {
  baseline, 'carimbo-velho': carimboVelho, restaurar, 'ler-alarme': lerAlarme, chapa,
  'prova-nav-oculta': provaNavOculta, 'contar-cor': contarCor, 'salvar-chapa': salvarChapa
};

// `imprimir` é injetado: `--help` pede ajuda (stdout, console.log — mesma
// convenção de radar.js/noticias.js: pedido explícito de ajuda sai por
// stdout) e "comando ausente/desconhecido" é uso incorreto (stderr,
// console.error — comportamento preexistente, preservado).
const USO_PROVA_PORTAL = imprimir => {
  imprimir(`uso: node _norman/prova-portal.js <${Object.keys(COMANDOS).join('|')}> [args] (ou --help/-h)`);
  imprimir(`     carimbo-velho / restaurar aceitam a trilha: <${Object.keys(TRILHAS).join('|')}> (padrão: vaga)`);
  imprimir('     chapa / contar-cor / salvar-chapa aceitam o nome da aba (padrão: Hoje)');
};

if (require.main === module) {
  // E6 (Leva 4, remodelação 2026-09-01) — CERCA-SECA: `--help`/`-h` real,
  // checado em QUALQUER posição do argv (não só como comando) — o
  // incidente que esta cerca existe pra evitar era exatamente "comando
  // --help caiu no comando real"; aqui o dispatch é por SUBCOMANDO
  // posicional (`COMANDOS[process.argv[2]]`), então `--help` na posição 2
  // já cairia no ramo "comando desconhecido" (seguro), mas
  // `<comando-real> --help` (ex. `prova-nav-oculta --help`, que executaria
  // o teste inteiro contra a planilha) NÃO caía — precisa checar o argv
  // INTEIRO antes do dispatch, não só a posição do comando.
  const argvNormalizado = process.argv.slice(2).map(a => (a === '-h' ? '--help' : a));
  if (argvNormalizado.includes('--help')) {
    USO_PROVA_PORTAL(console.log);
    process.exit(0);
  }
  const cmd = argvNormalizado[0];
  const fn = COMANDOS[cmd];
  if (!fn) {
    USO_PROVA_PORTAL(console.error);
    process.exit(1);
  }
  fn().then(() => console.log('OK')).catch(e => { console.error('ERRO\n' + e.message); process.exit(1); });
}
module.exports = COMANDOS;
