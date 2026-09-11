'use strict';
const a = require('./api');
const A = require('./abas');
const R = A.ref;
const fs = require('fs');
(async () => {
  const rotulo = process.argv[2] || 'snap';
  const s = {};
  s.painel = (await a.ler(`${R(A.PAINEL)}!A1:E200`)).values || [];
  s.tudo = (await a.ler(`${R(A.TUDO)}!A1:J300`)).values || [];
  s.calc = (await a.ler(`${R(A.CALC)}!A1:W60`)).values || [];
  s.painelFormulas = (await a.ler(`${R(A.PAINEL)}!A1:E4`, 'valueRenderOption=FORMULA')).values || [];
  s.tudoFormulas = (await a.ler(`${R(A.TUDO)}!A1:J3`, 'valueRenderOption=FORMULA')).values || [];
  s.calcFormulas = (await a.ler(`${R(A.CALC)}!A2:R2`, 'valueRenderOption=FORMULA')).values || [];
  const m = await a.api('?includeGridData=false&fields=sheets(properties,basicFilter,conditionalFormats)');
  s.estrutura = m.sheets.map(x => ({
    t: x.properties.title, i: x.properties.index, oculta: !!x.properties.hidden,
    cong: [x.properties.gridProperties.frozenRowCount || 0, x.properties.gridProperties.frozenColumnCount || 0],
    cf: (x.conditionalFormats || []).length, filtro: !!x.basicFilter
  }));
  fs.writeFileSync(`_norman/${rotulo}.json`, JSON.stringify(s, null, 1));
  console.log(rotulo, '-> painel', s.painel.length, 'linhas | tudo', s.tudo.length, '| _calc', s.calc.length);
})().catch(e => { console.error('ERRO', e.message); process.exit(1); });
