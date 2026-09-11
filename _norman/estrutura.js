'use strict';
const a = require('./api');
(async () => {
  const m = await a.api('?includeGridData=false&fields=sheets(properties,basicFilter,conditionalFormats),properties');
  console.log('planilha:', m.properties.title, '| locale', m.properties.locale);
  m.sheets.sort((x, y) => x.properties.index - y.properties.index).forEach(s => {
    const p = s.properties, g = p.gridProperties;
    console.log(`\n[${p.index}] ${p.title}${p.hidden ? '  (OCULTA)' : ''}  id=${p.sheetId}`);
    console.log(`    grade ${g.rowCount}x${g.columnCount} | congelado: ${g.frozenRowCount || 0} linha(s), ${g.frozenColumnCount || 0} coluna(s)`);
    console.log(`    formatação condicional: ${(s.conditionalFormats || []).length} regra(s) | filtro básico: ${s.basicFilter ? 'SIM' : 'não'}`);
  });
})().catch(e => { console.error('ERRO', e.message); process.exit(1); });
