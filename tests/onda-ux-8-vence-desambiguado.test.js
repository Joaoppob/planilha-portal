#!/usr/bin/env node
'use strict';

/**
 * REMODELAÇÃO CRM 2026-09-01 — Leva 2, Onda UX 8.
 * `.claude/plans/radar-ux-20-ondas.md` Bloco B, intervenção 8 +
 * `_norman/AVALIACAO-UX.md` job 1 ("UEL — fecha HOJE" duas vezes, sem
 * nenhum campo que distinga) e Parte 3, linha 8.
 *
 * O QUE ESTE ARQUIVO PROVA:
 *
 *  - `F.hojeVenceEditalRotulo` (espelho puro do fragmento Sheets
 *    `"🎓 "&o&IF(s="";"";" — "&s)`): dois editais do MESMO órgão com
 *    SUBÁREA diferente deixam de colidir; controle negativo mostra que o
 *    comportamento ANTIGO (só órgão) de fato colidia — prova que o
 *    problema era real, não hipotético.
 *  - CASO SINTÉTICO (pedido literal do briefing): lista com dois editais
 *    do mesmo órgão, zero colisão de assinatura depois do conserto.
 *  - CONTRA O DADO DO DIA (ao vivo, skip sem credencial): lê o bloco
 *    ⏰ VENCE de `Hoje` e confere que nenhuma linha real (rótulo+detalhe)
 *    repete assinatura.
 */

const assert = require('assert');
const path = require('path');
const RAIZ = path.join(__dirname, '..');
require(path.join(RAIZ, 'lib', 'env')).carregarEnv(path.join(RAIZ, '.env'));

const F = require('../_norman/formulas');
const A = require('../_norman/abas');
const R = A.ref;

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
  console.log('\n=== onda-ux-8-vence-desambiguado.test.js ===\n');
  let passed = 0;
  let failed = 0;
  const nota = ok => { if (ok) passed++; else failed++; };

  // ------------------------------------------------- controles offline
  nota(runTest('Onda 8 — CONTROLE NEGATIVO: o comportamento ANTIGO (só "🎓 "+órgão) de fato colidia — o defeito era real', () => {
    const antigo = orgao => `🎓 ${orgao}`;
    assert.strictEqual(antigo('UEL'), antigo('UEL'), 'sem subárea, dois editais UEL são texto IDÊNTICO — exatamente o que AVALIACAO-UX.md job 1 mediu');
  }));

  nota(runTest('Onda 8 — CONTROLE POSITIVO: com subárea, dois editais do MESMO órgão deixam de colidir', () => {
    const a1 = F.hojeVenceEditalRotulo('UEL', 'Ciência de Dados');
    const a2 = F.hojeVenceEditalRotulo('UEL', 'Inteligência Artificial');
    assert.notStrictEqual(a1, a2, `ainda colidem: "${a1}" === "${a2}"`);
    assert.strictEqual(a1, '🎓 UEL — Ciência de Dados');
    assert.strictEqual(a2, '🎓 UEL — Inteligência Artificial');
  }));

  nota(runTest('Onda 8 — sem subárea (campo vazio/undefined) o rótulo NÃO ganha " — " solto', () => {
    assert.strictEqual(F.hojeVenceEditalRotulo('UNILA', ''), '🎓 UNILA');
    assert.strictEqual(F.hojeVenceEditalRotulo('UNILA', undefined), '🎓 UNILA');
  }));

  nota(runTest('Onda 8 — CONTROLE NEGATIVO do desambiguador: mesmo órgão E mesma subárea ainda colidem (esperado — são o mesmo edital)', () => {
    assert.strictEqual(
      F.hojeVenceEditalRotulo('UEL', 'Ciência de Dados'),
      F.hojeVenceEditalRotulo('UEL', 'Ciência de Dados')
    );
  }));

  // ---- CASO SINTÉTICO, pedido literal do briefing ----
  nota(runTest('Onda 8 — caso sintético: dois editais do mesmo órgão numa lista, zero colisão de assinatura', () => {
    const editais = [
      { orgao: 'UEL', subarea: 'Ciência de Dados' },
      { orgao: 'UEL', subarea: 'Inteligência Artificial' },
      { orgao: 'UNILA', subarea: '' },
      { orgao: 'FIMES', subarea: 'Direito' }
    ];
    const rotulos = editais.map(e => F.hojeVenceEditalRotulo(e.orgao, e.subarea));
    const unicos = new Set(rotulos);
    assert.strictEqual(unicos.size, rotulos.length, `colisão de assinatura: ${JSON.stringify(rotulos)}`);
  }));

  // ------------------------------------------------- contra o dado do dia
  const semCredencial = !process.env.GOOGLE_SHEETS_SPREADSHEET_ID
    || !process.env.GOOGLE_SHEETS_CLIENT_EMAIL || !process.env.GOOGLE_SHEETS_PRIVATE_KEY;
  if (semCredencial) {
    console.log('  SKIP (dado do dia) — sem as três credenciais GOOGLE_SHEETS_* em .env; o bloco ⏰ VENCE só se lê da planilha viva.\n');
    console.log(`\n${passed} passou(aram), ${failed} falhou(aram)\n`);
    process.exit(failed > 0 ? 1 : 0);
  }

  const a = require('../_norman/api');
  const l = F.LINHAS[A.HOJE];
  // O bloco VENCE ocupa o TOPO do VSTACK do grupo 0 (título + até
  // HOJE_TETOS.VENCE linhas de corpo + rodapé + respiro) — ler um pouco
  // além do teto é seguro: o que sobrar é o bloco ATENÇÃO, que a filtragem
  // por conteúdo abaixo já exclui (não começa com o glifo de VENCE nem com
  // "+ ", e o texto real dele não teria por que colidir com a assinatura
  // procurada aqui de qualquer forma — mas o corte só entra até o fim do
  // território de VENCE, pra não misturar os dois blocos).
  const ateLinha = l.lista + F.HOJE_TETOS.VENCE + 2; // título + teto + rodapé
  const bloco = (await a.ler(`${R(A.HOJE)}!A${l.lista}:B${ateLinha}`, 'valueRenderOption=FORMATTED_VALUE')).values || [];

  nota(await runTestAsync('Onda 8 — contra o dado do DIA: nenhuma linha real do bloco ⏰ VENCE repete assinatura (rótulo+detalhe)', () => {
    const glifoTitulo = F.HOJE_BLOCO_GLIFO.VENCE;
    const linhasReais = bloco
      .map(r => ({ rotulo: String((r || [])[0] || ''), detalhe: String((r || [])[1] || '') }))
      .filter(r => r.rotulo !== '')
      .filter(r => !r.rotulo.startsWith(glifoTitulo)) // título do bloco
      .filter(r => !r.rotulo.startsWith('+ ')) // rodapé de transbordo
      .filter(r => !r.rotulo.startsWith(F.MARCADOR_VAZIO)); // estado vazio

    const assinaturas = linhasReais.map(r => `${r.rotulo}|${r.detalhe}`);
    const vistas = new Map();
    const repetidas = [];
    assinaturas.forEach((s, i) => {
      if (vistas.has(s)) repetidas.push({ assinatura: s, linhas: [vistas.get(s), i] });
      else vistas.set(s, i);
    });
    console.log(`    ${linhasReais.length} linha(s) real(is) no bloco ⏰ VENCE hoje, ${repetidas.length} assinatura(s) repetida(s)`);
    assert.deepStrictEqual(repetidas, [], `assinatura(s) repetida(s) no bloco ⏰ VENCE: ${JSON.stringify(repetidas)}`);
  }));

  console.log(`\n${passed} passou(aram), ${failed} falhou(aram)\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('ERRO\n' + (err && err.stack || err));
  process.exit(1);
});
