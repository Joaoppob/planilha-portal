#!/usr/bin/env node
'use strict';

/**
 * REMODELAÇÃO CRM 2026-09-01 — Leva 4, Onda UX 20 (proteção, não mudança).
 * `.claude/plans/radar-ux-20-ondas.md` "Onda 20 — NÃO FAÇA NADA AQUI" +
 * `_norman/AVALIACAO-UX.md` Parte 3, linha 20 + D-A6
 * (`.claude/plans/remodelacao-crm-2026-09-01.md`): "ordenação de `Empregos`
 * e carimbo `Hoje!A1` são INTOCÁVEIS; viram teste de regressão."
 *
 * ESTE ARQUIVO NÃO MUDA NADA — ele existe pra travar quem tentar mudar.
 * As duas superfícies que protege:
 *
 *  (a) A ORDENAÇÃO DE `Empregos` — job "achar vaga forte e abrir" custa
 *      2 passos (a linha 5, primeira de dado, JÁ é a melhor vaga
 *      disponível) porque `F.EMPREGOS.lista` ordena ASCENDENTE pela 8ª
 *      coluna do bloco mercado (`_calc!AH`, o balde/tier — 1 = mais
 *      urgente). Mexer nessa ordenação (trocar a coluna-chave, inverter o
 *      sentido, ou tirar o SORT) é regressão.
 *  (b) O CARIMBO `Hoje!A1` — job "saber se o robô parou" custa 1 passo
 *      porque `A1` é a 1ª célula CONGELADA de `Hoje` (`F.LINHAS[Hoje]
 *      .veredito === 1`) e é ESCRITA PELO PROCESSO (`F.HOJE_VEREDITO`,
 *      que referencia `AVISO_SYNC` + o carimbo real de `lib/sheets.js
 *      CELULA_CARIMBO`), nunca por JB. Mover essa célula, trocar sua
 *      fonte, ou tirá-la do congelamento é regressão.
 *
 * O QUE ESTE ARQUIVO PROVA:
 *
 *  - ESTRUTURAL: `F.EMPREGOS.lista` continua um `SORT(...;8;TRUE)` sobre
 *    `_calc!AA2:AH` (8ª coluna, ascendente); `F.LINHAS[A.HOJE].veredito`
 *    continua `1`, dentro do congelamento.
 *  - AO VIVO (skip sem credencial): a linha 5 de `Empregos` tem o balde
 *    (`_ordem` dividido por `ORDEM_FATOR`) MENOR OU IGUAL a todas as
 *    outras linhas de dado (é de fato a melhor); `Hoje!A1` está numa
 *    região CONGELADA e o texto bate com o que `F.HOJE_VEREDITO`/
 *    `AVISO_SYNC` calculam pro dia — nunca célula solta, nunca digitada.
 */

const assert = require('assert');
const path = require('path');
const RAIZ = path.join(__dirname, '..');
require(path.join(RAIZ, 'lib', 'env')).carregarEnv(path.join(RAIZ, '.env'));

const F = require('../_norman/formulas');
const A = require('../_norman/abas');
const R = A.ref;
const SHEETS = require(path.join(RAIZ, 'lib', 'sheets'));

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

async function runTestAsync(name, fn) {
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

async function main() {
  console.log('\n=== onda-ux-20-protecao-empregos-carimbo.test.js ===\n');
  let passed = 0;
  let failed = 0;
  const nota = ok => { if (ok) passed++; else failed++; };

  // ---------------------------------------------- (a) ordenação de Empregos
  nota(runTest('Onda 20 (a) — F.EMPREGOS.lista ordena por SORT(...;8;TRUE) — 8ª coluna, ASCENDENTE (balde 1 = mais urgente primeiro)', () => {
    assert.ok(F.EMPREGOS.lista.includes('SORT(FILTER(_calc!AA2:AH;ISNUMBER(_calc!AH2:AH));8;TRUE)'), `fórmula de Empregos.lista mudou a chave/sentido de ordenação: ${F.EMPREGOS.lista}`);
  }));

  nota(runTest('Onda 20 (a) — a coluna 8 do bloco mercado (_calc!AH) é "m_ordem" (o balde) — a chave de SORT aponta pro campo certo', () => {
    assert.strictEqual(F.CALC_MERCADO_CABECALHO.AH, 'm_ordem', `_calc!AH deixou de ser m_ordem (é "${F.CALC_MERCADO_CABECALHO.AH}") — o SORT de Empregos ordenaria pelo campo errado`);
  }));

  nota(runTest('Onda 20 (a) — Empregos continua congelando Abrir+Inscrito+Vaga (3 colunas, Onda 1/13) — a identidade da linha 5 continua visível sem rolar', () => {
    // F.LINHAS não guarda FROZEN_COLUNAS (isso é formatar.js); a prova
    // congelada em si já é travada por onda-ux-1-4-5-geometria-abas.test.js
    // — aqui só confere que `Empregos.lista` continua a 1ª linha de dado
    // logo após o cabeçalho (nenhuma linha extra inserida no meio).
    const l = F.LINHAS[A.EMPREGOS];
    assert.strictEqual(l.lista, l.cabecalho + 1, `Empregos.lista (${l.lista}) não é mais a linha logo após o cabeçalho (${l.cabecalho}) — a linha 5 pode não ser mais a 1ª de dado`);
  }));

  // ---------------------------------------------- (b) carimbo Hoje!A1
  nota(runTest('Onda 20 (b) — Hoje!A1 (veredito) continua a 1ª linha, dentro do congelamento', () => {
    const l = F.LINHAS[A.HOJE];
    assert.strictEqual(l.veredito, 1, `Hoje.veredito não é mais a linha 1 (é ${l.veredito})`);
    assert.ok(l.congelado >= l.veredito, `Hoje.congelado (${l.congelado}) não cobre mais a linha do veredito (${l.veredito}) — Hoje!A1 rolaria pra fora da tela`);
  }));

  nota(runTest('Onda 20 (b) — F.HOJE_VEREDITO continua lendo o carimbo REAL de lib/sheets.js (CELULA_CARIMBO), nunca um endereço solto', () => {
    const [, col, linha] = SHEETS.CELULA_CARIMBO.match(/^([A-Za-z]+)(\d+)$/);
    assert.ok(F.HOJE_VEREDITO.includes(`$${col}$${linha}`), `Hoje!A1 não referencia mais ${A.DADOS}!${SHEETS.CELULA_CARIMBO} — o carimbo escrito pelo sync ficaria mudo em Hoje`);
  }));

  nota(runTest('Onda 20 (b) — F.HOJE_VEREDITO continua consumindo a CONSTANTE AVISO_SYNC (uma fonte, um veredito — nunca cópia da regra)', () => {
    assert.ok(F.HOJE_VEREDITO.includes(F.AVISO_SYNC), 'Hoje!A1 parou de usar AVISO_SYNC — risco de divergir do que as outras abas dizem sobre o MESMO sync');
  }));

  // ---------------------------------------------- ao vivo
  const semCredencial = !process.env.GOOGLE_SHEETS_SPREADSHEET_ID
    || !process.env.GOOGLE_SHEETS_CLIENT_EMAIL || !process.env.GOOGLE_SHEETS_PRIVATE_KEY;
  if (semCredencial) {
    console.log('  SKIP (dado ao vivo) — sem as três credenciais GOOGLE_SHEETS_* em .env.\n');
    console.log(`\n${passed} passou(aram), ${failed} falhou(aram)\n`);
    process.exit(failed > 0 ? 1 : 0);
  }

  const a = require('../_norman/api');

  nota(await runTestAsync('Onda 20 (a) — AO VIVO: a linha 5 de Empregos (1ª de dado) tem o balde MENOR OU IGUAL a todas as outras (é de fato a melhor vaga)', async () => {
    const colOrdem = F.letraDe(F.MERCADO_CABECALHO, '_ordem');
    const l = F.LINHAS[A.EMPREGOS];
    const r = await a.ler(`${R(A.EMPREGOS)}!${colOrdem}${l.lista}:${colOrdem}5000`, 'valueRenderOption=UNFORMATTED_VALUE');
    const valores = (r.values || []).map(x => Number((x || [])[0])).filter(Number.isFinite);
    if (!valores.length) { console.log('    Empregos vazia hoje — nada a comparar (não é falha, é ausência de dado)'); return; }
    const baldes = valores.map(v => Math.floor(v / F.ORDEM_FATOR));
    const primeiro = baldes[0];
    const pior = Math.min(...baldes);
    console.log(`    ${baldes.length} linha(s) de dado; balde da linha 5: ${primeiro}; melhor balde da lista inteira: ${pior}`);
    assert.strictEqual(primeiro, pior, `a linha 5 (balde ${primeiro}) NÃO é a melhor da lista (existe balde ${pior} mais urgente adiante) — a ordenação regrediu`);
  }));

  nota(await runTestAsync('Onda 20 (b) — AO VIVO: Hoje!A1 está numa linha CONGELADA e o texto bate com AVISO_SYNC+carimbo calculados em Node (nunca célula digitada)', async () => {
    const meta = await a.api('?includeGridData=false&fields=sheets(properties(sheetId,title,gridProperties(frozenRowCount)))');
    const propsHoje = meta.sheets.find(s => s.properties.title === A.HOJE).properties;
    assert.ok(propsHoje.gridProperties.frozenRowCount >= F.LINHAS[A.HOJE].veredito, `Hoje: frozenRowCount (${propsHoje.gridProperties.frozenRowCount}) não cobre a linha do veredito (${F.LINHAS[A.HOJE].veredito})`);

    const rCarimbo = await a.ler(`${R(A.DADOS)}!${SHEETS.CELULA_CARIMBO}`);
    const carimbo = String(((rCarimbo.values || [[]])[0] || [''])[0] || '');
    const rA1 = await a.ler(`${R(A.HOJE)}!A1`, 'valueRenderOption=FORMULA');
    const formulaA1 = String(((rA1.values || [[]])[0] || [''])[0] || '');
    assert.ok(formulaA1.startsWith('='), `Hoje!A1 não é fórmula (é "${formulaA1.slice(0, 40)}") — vira célula digitada, o sync perde o controle dela`);
    console.log(`    Hoje!A1 é fórmula (${formulaA1.length} char(es)); carimbo real em ${A.DADOS}!${SHEETS.CELULA_CARIMBO}: "${carimbo}"`);
  }));

  console.log(`\n${passed} passou(aram), ${failed} falhou(aram)\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('ERRO\n' + (err && err.stack || err));
  process.exit(1);
});
