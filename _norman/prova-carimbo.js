'use strict';
// PROVA DO AVISO DE PLANILHA DESATUALIZADA — com abort próprio.
//
// O aviso é CONDICIONAL e o ramo que importa é o que o dado real NUNCA
// aciona: no dia a dia o radar roda, o carimbo é de hoje e a fórmula devolve
// "". Uma regra que só aparece em estado raro é exatamente a regra que ninguém
// confere e que passa quebrada em qualquer auditoria de leitura. Aqui ela é
// forçada a acontecer, e o texto é lido DE VOLTA pela API.
//
// PARTE A — os RAMOS, em célula de rascunho de `_calc`.
//   Não dá pra mover o `TODAY()` da planilha, então a mesma fórmula de
//   produção é reescrita com o carimbo e o "hoje" LITERAIS. Reescrita por
//   SUBSTITUIÇÃO de `F.AVISO_SYNC`, nunca reimplementada: se eu digitasse a
//   expressão de novo, estaria provando a minha cópia e não a peça. Cada caso
//   confere DUAS coisas — o texto renderizado e o número de dias úteis que a
//   planilha calculou — contra `_norman/feriados.js diasUteisEntre()`, que
//   deriva o mesmo valor por um caminho independente
//   (`lib/feriados-nacionais.js` direto). Sem a conferência do número, um caso
//   silencioso passaria mesmo se o silêncio viesse de um IFERROR engolindo
//   defeito, em vez de vir da conta certa.
//
// PARTE B — a peça de verdade, com o carimbo adulterado.
//   C1 negativo  — carimbo de hoje: nenhum aviso nas 3 abas.
//   C2 positivo  — carimbo de 5 dias úteis atrás: aviso nas 3 abas, com a data
//                  e a contagem certas.
//   C2b ausente  — carimbo APAGADO: o ramo "não sei de quando eu sou" acende.
//                  Carimbo que some é tão grave quanto carimbo velho.
//   C3 volta     — carimbo real restaurado: o aviso some sozinho nas 3. Aviso
//                  que não se apaga mente depois de resolvido.
//
// O carimbo original é salvo antes e restaurado no `finally`, inclusive se
// algum controle explodir no meio.
const path = require('path');
const a = require('./api');
const A = require('./abas');
const F = require('./formulas');
const FERIADOS = require('./feriados');
const SHEETS = require(path.join(__dirname, '..', 'lib', 'sheets'));
const R = A.ref;

const CARIMBO_REF = `${R(A.DADOS)}!${SHEETS.CELULA_CARIMBO}`;
const RASCUNHO = '_calc!AM1:AN20'; // fora de A:R, V:W, Y e AA:AK — e fora da varredura de erro do verificar.js
const LIMIAR = F.LIMIAR_ATRASO_DIAS_UTEIS;
const pausa = ms => new Promise(r => setTimeout(r, ms));

/**
 * A fórmula de produção com carimbo e "hoje" trocados por literais.
 *
 * O `=` na frente NÃO é detalhe: `F.AVISO_SYNC` é um FRAGMENTO feito pra ser
 * concatenado na A1 das abas, e sem o `=` a célula guarda o texto da fórmula
 * em vez de avaliá-la. Como esse texto contém o próprio 🛑 do aviso, a primeira
 * versão desta prova reprovou os 10 casos com "ACENDEU sem motivo" — o
 * instrumento estava lendo a própria fonte e chamando de resultado. Defeito
 * meu, pego pelo controle negativo; um instrumento que só olhasse os casos
 * positivos teria dito "passou".
 */
function comLiterais(carimboISO, hojeISO) {
  const alvo = carimboISO === null ? '""' : `"${carimboISO}"`;
  return '=' + F.AVISO_SYNC.split(F.CARIMBO).join(alvo).split('TODAY()').join(`DATEVALUE("${hojeISO}")`);
}
/** Só o número de dias úteis de atraso, montado da MESMA faixa de feriados. */
function soAtraso(carimboISO, hojeISO) {
  return `=IFERROR(NETWORKDAYS(DATEVALUE("${carimboISO}");DATEVALUE("${hojeISO}");${A.C}!$Y$2:$Y)-1;"erro")`;
}

// dd/mm — o mesmo TEXT(cd;"dd/mm") que a fórmula imprime.
const ddmm = iso => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

// Escrita CRUA (RAW), igual à do sync. `_norman/api.js escrever()` usa
// USER_ENTERED e converteria o ISO em data de VERDADE — a fórmula aguenta as
// duas (DATEVALUE, senão N), mas a prova tem que devolver a célula exatamente
// como `lib/sheets.js` a deixa, senão restaura um estado que o sync nunca cria.
const escreverRAW = (rng, values) =>
  a.api(`/values/${encodeURIComponent(rng)}?valueInputOption=RAW`, { method: 'PUT', body: JSON.stringify({ values }) });

const lerA1 = async aba => (((await a.ler(`${R(aba)}!A1`)).values || [[]])[0] || [''])[0] || '';
const ABAS = [A.PAINEL, A.EMPREGOS, A.TUDO];
const ACENDEU = t => t.includes('🛑');
const SEM_CARIMBO = t => t.includes('SEM CARIMBO DE DATA');

(async () => {
  const falhas = [];
  const original = ((await a.ler(`${R(A.DADOS)}!Y1:Z1`)).values || [[]])[0] || [];
  if (!original[0]) {
    throw new Error(`não há carimbo em ${CARIMBO_REF} pra salvar e restaurar — rode \`node radar.js sincronizar-sheets\` antes desta prova`);
  }
  console.log(`carimbo real guardado: ${JSON.stringify(original)}\n`);

  try {
    // ================== PARTE A — os ramos, em rascunho ==================
    // Datas escolhidas contra o calendário REAL de `lib/feriados-nacionais.js`:
    // 07/09/2026 (Independência) cai numa SEGUNDA; 03/04/2026 (Sexta-feira
    // Santa) e 25/12/2026 numa SEXTA; 17/02/2026 é o Carnaval (terça). São
    // exatamente as formas de feriado que fabricam falso alarme.
    const CASOS = [
      ['mesmo dia — sincronizou hoje', '2026-08-26', '2026-08-26', false],
      ['sexta -> segunda de manhã (fim de semana no meio)', '2026-08-21', '2026-08-24', false],
      ['SEXTA -> TERÇA com FERIADO na segunda (07/09 Independência)', '2026-09-04', '2026-09-08', false],
      ['quinta -> segunda com FERIADO na sexta (03/04 Sexta-feira Santa)', '2026-04-02', '2026-04-06', false],
      ['sexta -> quarta do Carnaval (17/02 feriado na terça)', '2026-02-13', '2026-02-18', false],
      ['quinta -> segunda do Natal (25/12 feriado na sexta)', '2026-12-24', '2026-12-28', false],
      ['sexta -> terça: UMA execução perdida', '2026-08-21', '2026-08-25', false],
      ['sexta -> quarta: DUAS execuções perdidas', '2026-08-21', '2026-08-26', true],
      ['uma semana inteira parado', '2026-08-17', '2026-08-26', true],
      ['carimbo no futuro (relógio adiantado) — não acende', '2026-09-30', '2026-08-26', false]
    ];

    const linhas = CASOS.map(([, c, h]) => [comLiterais(c, h), soAtraso(c, h)]);
    linhas.push([comLiterais(null, '2026-08-26'), '=""']); // carimbo VAZIO
    await a.escrever(RASCUNHO.split(':')[0], linhas);
    await pausa(2500);
    const lido = (await a.ler(RASCUNHO, 'valueRenderOption=UNFORMATTED_VALUE')).values || [];

    console.log('=== PARTE A · ramos (carimbo e "hoje" literais, fórmula de PRODUÇÃO) ===');
    CASOS.forEach(([nome, c, h, deveAcender], i) => {
      const texto = String((lido[i] || [])[0] || '');
      const atrasoPlanilha = (lido[i] || [])[1];
      const atrasoNode = FERIADOS.diasUteisEntre(c, h) - 1;
      const acendeu = ACENDEU(texto);
      const invertido = c > h; // carimbo no futuro: relógio da máquina adiantado
      const marca = [];
      // Com as pontas invertidas, `NETWORKDAYS` devolve a contagem NEGATIVA e
      // não aplica a faixa de feriados (medido: -26 onde a conta com feriado
      // daria -25). Comparar o valor exato aqui seria exigir das duas
      // implementações um acordo que o caso não precisa: o que a peça promete
      // é só que carimbo no futuro NUNCA acende. É isso que se confere.
      if (invertido) {
        if (!(atrasoPlanilha < LIMIAR && atrasoNode < LIMIAR)) marca.push(`carimbo no futuro deveria ficar abaixo do limiar: planilha=${atrasoPlanilha} node=${atrasoNode}`);
      } else if (atrasoPlanilha !== atrasoNode) {
        marca.push(`ATRASO DIVERGE: planilha=${atrasoPlanilha} node=${atrasoNode}`);
      }
      if (acendeu !== deveAcender) marca.push(deveAcender ? 'DEVERIA ACENDER e ficou mudo' : 'ACENDEU sem motivo');
      if (deveAcender && !texto.includes(`${atrasoNode} dias úteis`)) marca.push(`o texto não traz "${atrasoNode} dias úteis"`);
      if (deveAcender && !texto.includes(ddmm(c))) marca.push(`o texto não traz a data do carimbo (${ddmm(c)})`);
      if (!deveAcender && atrasoNode >= LIMIAR) marca.push(`caso marcado como silencioso mas o atraso (${atrasoNode}) já bate o limiar ${LIMIAR} — o CASO está errado`);
      if (marca.length) falhas.push(`PARTE A · ${nome}: ${marca.join(' | ')}`);
      console.log(
        `  ${marca.length ? '✗' : '✓'} ${nome}\n` +
        `      ${c} -> ${h} · atraso ${atrasoPlanilha} dia(s) útil(eis) (node: ${atrasoNode}) · ` +
        `${acendeu ? 'ACENDE' : 'silêncio'}${texto ? '\n      » ' + texto.replace(/\n/g, ' ⏎ ').slice(0, 210) : ''}`
      );
    });

    const textoVazio = String((lido[CASOS.length] || [])[0] || '');
    const okVazio = SEM_CARIMBO(textoVazio);
    if (!okVazio) falhas.push('PARTE A · carimbo VAZIO: não caiu no ramo "não sabe de quando ela é"');
    console.log(`  ${okVazio ? '✓' : '✗'} carimbo VAZIO -> ramo próprio, nunca silêncio\n      » ${textoVazio.replace(/\n/g, ' ⏎ ').slice(0, 210)}`);

    // ================== PARTE B — a peça de verdade ==================
    console.log('\n=== PARTE B · a peça, com o carimbo adulterado ===');

    // C1 — carimbo real (de hoje): silêncio nas três.
    for (const aba of ABAS) {
      const t = await lerA1(aba);
      if (ACENDEU(t)) falhas.push(`C1 NEGATIVO falhou: ${aba} acende o aviso com o carimbo de hoje (${original[0]})`);
    }
    console.log(`C1 negativo OK — carimbo ${original[0]}, nenhuma das ${ABAS.length} abas acende`);

    // C2 — carimbo velho.
    const velho = '2026-08-19';
    const atrasoEsperado = FERIADOS.diasUteisEntre(velho, original[0]) - 1;
    if (atrasoEsperado < LIMIAR) throw new Error(`o carimbo de teste (${velho}) dá atraso ${atrasoEsperado}, abaixo do limiar ${LIMIAR} — escolha outra data`);
    await escreverRAW(`${R(A.DADOS)}!Y1`, [[velho]]);
    await pausa(3000);
    for (const aba of ABAS) {
      const t = await lerA1(aba);
      if (!ACENDEU(t)) {
        falhas.push(`C2 POSITIVO falhou: ${aba} ficou MUDA com carimbo de ${atrasoEsperado} dias úteis atrás`);
        continue;
      }
      const m = t.match(/SEM ATUALIZAR DESDE (\d{2}\/\d{2}) — (\d+) dias úteis/);
      if (!m) falhas.push(`C2 falhou em ${aba}: aviso presente mas sem data e contagem — "${t.split('\n')[0]}"`);
      else if (m[1] !== ddmm(velho)) falhas.push(`C2 falhou em ${aba}: aviso diz ${m[1]}, o carimbo é ${ddmm(velho)}`);
      else if (Number(m[2]) !== atrasoEsperado) falhas.push(`C2 falhou em ${aba}: aviso diz ${m[2]} dias úteis, a conta real é ${atrasoEsperado}`);
      else console.log(`C2 positivo OK — ${aba}:\n      » ${t.split('\n')[0]}`);
    }

    // C2b — carimbo APAGADO.
    await a.limpar(`${R(A.DADOS)}!Y1:Z1`);
    await pausa(3000);
    for (const aba of ABAS) {
      const t = await lerA1(aba);
      if (!SEM_CARIMBO(t)) falhas.push(`C2b falhou: ${aba} não avisa que o carimbo SUMIU — "${t.split('\n')[0]}"`);
    }
    console.log(`C2b ausente OK — carimbo apagado, as ${ABAS.length} abas dizem que não sabem de quando são:\n      » ${(await lerA1(A.PAINEL)).split('\n')[0]}`);
  } finally {
    // ================== C3 — volta ==================
    await escreverRAW(`${R(A.DADOS)}!Y1:Z1`, [original]);
    await a.limpar(RASCUNHO);
    await pausa(3000);
    for (const aba of ABAS) {
      const t = await lerA1(aba);
      if (ACENDEU(t)) falhas.push(`C3 VOLTA falhou: ${aba} continua acendendo depois de restaurar o carimbo ${original[0]}`);
    }
    console.log(`C3 volta OK — carimbo ${original[0]} restaurado, o aviso sumiu sozinho das ${ABAS.length} abas`);
    if (falhas.length) { console.error('\nFALHAS:\n' + falhas.join('\n')); process.exit(1); }
    console.log('\nTODOS os controles do aviso de sync OK');
  }
})().catch(e => { console.error('ERRO', e.message); process.exit(1); });
