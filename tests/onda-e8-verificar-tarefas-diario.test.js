#!/usr/bin/env node
'use strict';

/**
 * REMODELAÇÃO CRM 2026-09-01 — Leva 5, emenda E8 (pré-requisito).
 * `.claude/plans/remodelacao-crm-2026-09-01.md` Leva 5: "`verificar.js`
 * ainda lê `Tarefas!A1:G1000` e `Diário!A1:E2000` por LETRA FIXA (colunas
 * cresceram em ondas anteriores; a Leva 5 adiciona colunas novas a essas
 * abas — sem este conserto, elas nascem fora do alcance do verificador).
 * Resolver pelo rótulo vivo, padrão E7. Fazer ANTES das colunas novas."
 *
 * MEDIDO: `Tarefas` já tinha 10 colunas (Onda 15: esforço/bloqueada por/
 * recorrente) e `Diário` já tinha 7 (Onda 16: responde a/contexto da
 * resposta) ANTES desta Leva — a faixa `G1000`/`E2000` cobria só 7/5
 * colunas, cega pras 3 últimas de cada aba. Mesmo padrão de
 * `tests/onda-e7-verificar-letra-fixa.test.js`, aplicado às duas faixas que
 * ficaram pra trás.
 *
 * O QUE ESTE ARQUIVO PROVA:
 *  - ESTRUTURAL (fonte de `verificar.js`, grep determinístico): os dois
 *    literais (`Tarefas!A1:G1000`, `Diário!A1:E2000`) SUMIRAM, e os
 *    substitutos DERIVADOS (`F.TAREFAS_CABECALHO.length`/
 *    `F.DIARIO_CABECALHO.length`) estão presentes.
 *  - OFFLINE (sem rede): a largura derivada bate com o cabeçalho vivo de
 *    `formulas.js` (10 colunas pra Tarefas, coluna J; 7 pra Diário,
 *    coluna G) — nunca mais 7/5.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const RADAR_DIR = path.resolve(__dirname, '..');
const VERIFICAR_SRC = fs.readFileSync(path.join(RADAR_DIR, '_norman', 'verificar.js'), 'utf8');
const F = require('../_norman/formulas');

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    return true;
  } catch (error) {
    console.log(`  ✗ ${name}`);
    console.error(`    ${error.stack || error.message}`);
    return false;
  }
}

function main() {
  console.log('\n=== onda-e8-verificar-tarefas-diario.test.js ===\n');
  let passed = 0, failed = 0;
  const nota = ok => { if (ok) passed++; else failed++; };

  nota(runTest('E8 — `Tarefas!A1:G1000` literal SUMIU da fonte de verificar.js', () => {
    assert.ok(!VERIFICAR_SRC.includes('${R(A.TAREFAS)}!A1:G1000'), '`Tarefas!A1:G1000` literal ainda presente — G cobre só 7 colunas, Tarefas tem 10 desde a Onda 15');
  }));

  nota(runTest('E8 — `Diário!A1:E2000` literal SUMIU da fonte de verificar.js', () => {
    assert.ok(!VERIFICAR_SRC.includes('${R(A.DIARIO)}!A1:E2000'), '`Diário!A1:E2000` literal ainda presente — E cobre só 5 colunas, Diário tem 7 desde a Onda 16');
  }));

  nota(runTest('E8 — a varredura de erro agora deriva a largura de Tarefas/Diário do cabeçalho vivo', () => {
    assert.ok(
      VERIFICAR_SRC.includes('${R(A.TAREFAS)}!A1:${String.fromCharCode(64 + F.TAREFAS_CABECALHO.length)}1000'),
      'não achei a faixa de Tarefas derivada de F.TAREFAS_CABECALHO.length'
    );
    assert.ok(
      VERIFICAR_SRC.includes('${R(A.DIARIO)}!A1:${String.fromCharCode(64 + F.DIARIO_CABECALHO.length)}2000'),
      'não achei a faixa de Diário derivada de F.DIARIO_CABECALHO.length'
    );
  }));

  nota(runTest('E8 — offline: a largura derivada de Tarefas/Diário bate com o cabeçalho vivo (nunca mais 7/5)', () => {
    const ultTarefas = String.fromCharCode(64 + F.TAREFAS_CABECALHO.length);
    const ultDiario = String.fromCharCode(64 + F.DIARIO_CABECALHO.length);
    assert.ok(F.TAREFAS_CABECALHO.length >= 10, `Tarefas deveria ter pelo menos 10 colunas, tem ${F.TAREFAS_CABECALHO.length}`);
    assert.ok(F.DIARIO_CABECALHO.length >= 7, `Diário deveria ter pelo menos 7 colunas, tem ${F.DIARIO_CABECALHO.length}`);
    assert.notStrictEqual(ultTarefas, 'G', 'a varredura de Tarefas não pode mais parar em G (7 colunas)');
    assert.notStrictEqual(ultDiario, 'E', 'a varredura de Diário não pode mais parar em E (5 colunas)');
    console.log(`    Tarefas: A1:${ultTarefas}1000 (${F.TAREFAS_CABECALHO.length} colunas) · Diário: A1:${ultDiario}2000 (${F.DIARIO_CABECALHO.length} colunas)`);
  }));

  console.log(`\n${passed} passou(aram), ${failed} falhou(aram)\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
