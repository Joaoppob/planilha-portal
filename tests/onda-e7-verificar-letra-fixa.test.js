#!/usr/bin/env node
'use strict';

/**
 * REMODELAÇÃO CRM 2026-09-01 — Leva 4, emenda E7.
 * `.claude/plans/remodelacao-crm-2026-09-01.md` Leva 4: "`verificar.js`
 * (~linha 130) conta linhas de `Empregos` lendo coluna `B` por LETRA FIXA
 * — após a Onda 13, B é `Inscrito` (checkbox), não `Vaga`: o diagnóstico
 * imprime ~4996 onde há 650. Consertar resolvendo a coluna pelo RÓTULO
 * vivo do cabeçalho; varrer `verificar.js` inteiro por outras leituras por
 * letra fixa nas abas cujas colunas mudaram (`Concursos`, `Concursos ·
 * tudo`, `Empregos`, `Fila`) e consertar as que mentem."
 *
 * MEDIDO AO VIVO nesta Leva (antes do conserto): `Empregos!B` (checkbox
 * "Inscrito") nunca fica vazio de verdade — toda linha tem `FALSE` ou
 * `TRUE` escrito — então a contagem por "célula não-vazia" contava a
 * ALTURA DA GRADE (~4996-5000), não o dado real (~650). DEPOIS do
 * conserto (rodado nesta Leva, `node _norman/verificar.js`, só leitura):
 * "linhas em Empregos: 650" — bate com a contagem independente da Onda 20
 * (`tests/onda-ux-20-protecao-empregos-carimbo.test.js`, "650 linha(s) de
 * dado").
 *
 * O QUE ESTE ARQUIVO PROVA:
 *
 *  - ESTRUTURAL (fonte de `verificar.js`, grep determinístico — sem rede):
 *    os quatro padrões de letra fixa que mentiam (`!B$`/`Empregos`,
 *    `Fila!A1:K1000`, `Empregos!A...:G600`, `Painel!...H2000`) SUMIRAM do
 *    arquivo, e os substitutos DERIVADOS (`F.letraDe`/`ultimaColVisivel`)
 *    estão presentes.
 *  - AO VIVO (skip sem credencial): leitura CIRÚRGICA (1 chamada, não o
 *    `verificar.js` inteiro) da coluna Vaga de `Empregos` (derivada por
 *    rótulo), confirmando N PLAUSÍVEL (bem abaixo da altura da grade,
 *    5000) — nunca mais ~4996-5000. `node _norman/verificar.js` inteiro
 *    já foi rodado manualmente nesta Leva (fora da suíte de testes) e
 *    confirmou "linhas em Empregos: 650" — ver o relatório da Leva.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const RADAR_DIR = path.resolve(__dirname, '..');
const VERIFICAR_SRC = fs.readFileSync(path.join(RADAR_DIR, '_norman', 'verificar.js'), 'utf8');

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

async function runTestAsync(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    return true;
  } catch (error) {
    console.log(`  ✗ ${name}`);
    console.error(`    ${error.stack || error.message}`);
    return false;
  }
}

async function main() {
  console.log('\n=== onda-e7-verificar-letra-fixa.test.js ===\n');
  let passed = 0;
  let failed = 0;
  const nota = ok => { if (ok) passed++; else failed++; };

  nota(runTest('E7 — Empregos!B literal (contagem de linhas) SUMIU da fonte de verificar.js', () => {
    assert.ok(!VERIFICAR_SRC.includes('R(A.EMPREGOS)}!B${F.LINHAS[A.EMPREGOS]'), '`Empregos!B` literal ainda presente — a contagem continuaria mentindo (~4996 em vez de ~650)');
  }));

  nota(runTest('E7 — a contagem de Empregos agora deriva a coluna Vaga pelo cabeçalho vivo (F.letraDe)', () => {
    assert.ok(VERIFICAR_SRC.includes("colVagaM = F.letraDe(F.MERCADO_CABECALHO, 'Vaga')"), 'não achei a derivação por rótulo da coluna Vaga de Empregos');
    assert.ok(VERIFICAR_SRC.includes('${colVagaM}${F.LINHAS[A.EMPREGOS].lista}:${colVagaM}5000'), 'a leitura de contagem de Empregos não usa mais a coluna derivada');
  }));

  nota(runTest('E7 — Fila!A1:K1000 literal (varredura de erro) SUMIU — K era 11 colunas, Fila tem 12 desde a Onda 17 (parada há)', () => {
    assert.ok(!VERIFICAR_SRC.includes('${R(A.FILA)}!A1:K1000'), '`Fila!A1:K1000` literal ainda presente — a varredura de erro ficaria cega pra coluna L (parada há)');
    assert.ok(VERIFICAR_SRC.includes('${R(A.FILA)}!A1:${String.fromCharCode(64 + F.FILA_CABECALHO.length)}1000'), 'a varredura de Fila não deriva mais a largura do cabeçalho vivo');
  }));

  nota(runTest('E7 — os fins de faixa G (Empregos) e H (Concursos) do controle de vazamento SUMIRAM — literais desatualizados desde a Onda 13/14', () => {
    assert.ok(!VERIFICAR_SRC.includes('${R(A.EMPREGOS)}!A${lE0}:G600'), '`Empregos!A...:G600` literal ainda presente — vazamento cego pra Nível (H)');
    assert.ok(!VERIFICAR_SRC.includes('${R(A.PAINEL)}!${colVaga}${lP0}:H2000'), '`Concursos!...:H2000` literal ainda presente — vazamento cego pra Subárea/Subedital (I/J)');
    assert.ok(VERIFICAR_SRC.includes('ultimaColVisivel'), 'helper de derivação da última coluna visível não está mais presente');
  }));

  nota(runTest('E7 — ultimaColVisivel deriva corretamente H (Empregos) e J (Concursos) a partir do cabeçalho vivo — offline, sem rede', () => {
    const F = require('../_norman/formulas');
    const ultimaColVisivel = cabecalho => {
      const corte = cabecalho.findIndex(c => String(c).startsWith(F.PREFIXO_COLUNA_OCULTA) || c === 'link (copiar)');
      return String.fromCharCode(64 + (corte === -1 ? cabecalho.length : corte));
    };
    assert.strictEqual(ultimaColVisivel(F.MERCADO_CABECALHO), 'H', `Empregos: esperado H (até "Nível"), obtido ${ultimaColVisivel(F.MERCADO_CABECALHO)}`);
    assert.strictEqual(ultimaColVisivel(F.DOCENTE_CABECALHO), 'J', `Concursos: esperado J (até "Subedital"), obtido ${ultimaColVisivel(F.DOCENTE_CABECALHO)}`);
  }));

  // ------------------------------------------------- ao vivo
  const semCredencial = !process.env.GOOGLE_SHEETS_SPREADSHEET_ID
    || !process.env.GOOGLE_SHEETS_CLIENT_EMAIL || !process.env.GOOGLE_SHEETS_PRIVATE_KEY;
  const envPath = path.join(RADAR_DIR, '.env');
  if (semCredencial && !fs.existsSync(envPath)) {
    console.log('  SKIP (ao vivo) — sem .env / credenciais GOOGLE_SHEETS_*; a contagem real só se confere contra a planilha viva.\n');
    console.log(`\n${passed} passou(aram), ${failed} falhou(aram)\n`);
    process.exit(failed > 0 ? 1 : 0);
  }

  // AO VIVO — leitura DIRETA e MÍNIMA (1 chamada), não o `verificar.js`
  // inteiro (~40 leituras): rodar o script inteiro como parte da suíte
  // (`node radar.js testar`) soma às leituras de todos os outros arquivos
  // e estoura a cota de 60/min — medido nesta Leva, um `node
  // _norman/verificar.js` inteiro aqui derrubava o teste SEGUINTE na
  // suíte com HTTP 429, mesmo com o próprio backoff (6 tentativas, ~62s)
  // já esgotado. A prova de E7 é sobre qual COLUNA se lê, então uma
  // leitura cirúrgica da coluna Vaga de `Empregos` já prova o mesmo fato
  // — sem pagar o custo do instrumento inteiro.
  const F = require('../_norman/formulas');
  const A = require('../_norman/abas');
  nota(await runTestAsync('E7 — AO VIVO: a coluna "Vaga" de Empregos (derivada por rótulo) tem ~650 linhas de dado, não ~5000 (leitura cirúrgica, 1 chamada)', async () => {
    const R = A.ref;
    const a = require('../_norman/api');
    const colVagaM = F.letraDe(F.MERCADO_CABECALHO, 'Vaga');
    const l = F.LINHAS[A.EMPREGOS];
    const r = await a.ler(`${R(A.EMPREGOS)}!${colVagaM}${l.lista}:${colVagaM}5000`);
    const n = (r.values || []).length;
    console.log(`    Empregos!${colVagaM} (Vaga): ${n} linha(s) de dado (grade tem 5000)`);
    assert.ok(n < 4000, `Empregos reportou ${n} linha(s) — a coluna lida ainda parece ser a errada (checkbox nunca vazio) em vez de Vaga`);
    assert.ok(n > 0, 'Empregos reportou 0 linha — instrumento pode estar quebrado no sentido oposto');
  }));

  console.log(`\n${passed} passou(aram), ${failed} falhou(aram)\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('ERRO\n' + (err && err.stack || err));
  process.exit(1);
});
