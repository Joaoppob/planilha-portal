'use strict';
// Tabela de siglas movida para `lib/siglas.js` (Onda dedupe-canonico) — este
// arquivo é reexport puro, sem lógica própria, pra `_norman/construir.js`,
// `_norman/gerar-readme.js` e `_norman/cobertura-siglas.js` continuarem
// funcionando sem mudança. Fonte única de dados agora é `lib/siglas.js`
// (consumida também por `lib/orgao-canonico.js` no dedupe entre fontes) —
// não editar duas listas, editar só lá.
module.exports = require('../lib/siglas');
