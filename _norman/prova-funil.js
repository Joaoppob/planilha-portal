'use strict';
// PROVA DO AVISO DE FUNIL LIGADO — 3 controles, com abort próprio.
//
// O aviso é CONDICIONAL: no dia a dia ele é string vazia. Uma regra que só
// aparece em estado raro é exatamente a regra que ninguém confere, e que passa
// numa auditoria de leitura mesmo quebrada. Aqui ela é forçada a acontecer.
//
//   C1 negativo — sem corte no funil, o aviso NÃO existe (senão vira ruído
//                 permanente e JB aprende a ignorar a linha 2).
//   C2 positivo — com corte, o aviso aparece E os dois números batem com a
//                 contagem real de linhas visíveis e com o total prometido.
//   C3 volta    — desligado o corte, o aviso SOME sozinho. Aviso que não se
//                 apaga é pior que aviso nenhum: mente depois de resolvido.
//
// Mexe no basicFilter da aba `Empregos` e o restaura no `finally`.
const a = require('./api');
const A = require('./abas');
const R = A.ref;

const COL_COMBINA = 3;          // 0-based: A Abrir · B Vaga · C Publicada · D Combina?
const ESCONDER = ['⬜ fraca'];
const FAIXA = { sheetId: null, startRowIndex: 2, endRowIndex: 5000, startColumnIndex: 0, endColumnIndex: 9 };

const pausa = ms => new Promise(r => setTimeout(r, ms));
const lerA2 = async () => (((await a.ler(`${R(A.EMPREGOS)}!A2`)).values || [[]])[0] || [''])[0] || '';
const temAviso = t => t.includes('Faltam linhas na tela');

(async () => {
  const meta = await a.api('?includeGridData=false&fields=sheets(properties(sheetId,title))');
  const aba = meta.sheets.find(s => s.properties.title === A.EMPREGOS);
  if (!aba) throw new Error(`aba ${A.EMPREGOS} não encontrada`);
  FAIXA.sheetId = aba.properties.sheetId;

  const falhas = [];
  try {
    // ---------------- C1: estado limpo, aviso ausente ----------------
    await a.batch([{ setBasicFilter: { filter: { range: FAIXA } } }]);
    await pausa(1500);
    const limpo = await lerA2();
    if (temAviso(limpo)) falhas.push('C1 NEGATIVO falhou: aviso de funil aparece SEM corte ligado');
    else console.log('C1 negativo OK — sem corte, sem aviso');

    // ---------------- C2: corte ligado, aviso correto ----------------
    const col = ((await a.ler(`${R(A.EMPREGOS)}!D4:D5000`)).values || []).map(l => (l[0] || ''));
    const total = col.length;
    const escondidas = col.filter(v => ESCONDER.includes(v)).length;
    const esperado = total - escondidas;
    if (!escondidas) throw new Error(`nenhuma linha com ${ESCONDER.join('/')} hoje — controle não discrimina, escolha outro valor`);

    await a.batch([{ setBasicFilter: { filter: { range: FAIXA, criteria: { [COL_COMBINA]: { hiddenValues: ESCONDER } } } } }]);
    await pausa(2500);
    const cortado = await lerA2();
    if (!temAviso(cortado)) {
      falhas.push(`C2 POSITIVO falhou: ${escondidas} linha(s) escondidas e NENHUM aviso na linha 2`);
    } else {
      const m = cortado.match(/mostrando (\d+) de (\d+)/);
      if (!m) falhas.push('C2 falhou: aviso presente mas sem os dois números');
      else {
        const [, visiveis, prometido] = m.map(Number);
        if (visiveis !== esperado) falhas.push(`C2 falhou: aviso diz ${visiveis} visíveis, a contagem real é ${esperado}`);
        else if (prometido !== total) falhas.push(`C2 falhou: aviso promete ${prometido}, a lista tem ${total}`);
        else console.log(`C2 positivo OK — escondi ${escondidas}, o aviso diz "mostrando ${visiveis} de ${prometido}"`);
      }
    }
  } finally {
    await a.batch([{ setBasicFilter: { filter: { range: FAIXA } } }]);
    await pausa(2000);
    const voltou = await lerA2();
    if (temAviso(voltou)) falhas.push('C3 VOLTA falhou: aviso continua depois de limpar o corte');
    else console.log('C3 volta OK — corte desligado, aviso sumiu sozinho');
    if (falhas.length) { console.error('\nFALHAS:\n' + falhas.join('\n')); process.exit(1); }
    console.log('\n3/3 controles do aviso de funil OK');
  }
})().catch(e => { console.error('ERRO', e.message); process.exit(1); });
