#!/usr/bin/env node
'use strict';

/**
 * REMODELAÇÃO CRM 2026-09-01 — Leva 1, Bloco A, Onda UX 3.
 * `.claude/plans/radar-ux-20-ondas.md` Bloco A intervenção 3 +
 * `_norman/AVALIACAO-UX.md` Parte 2 §2 / Parte 3 intervenção 3.
 *
 * O DEFEITO MEDIDO: `Fila!A2` e o bloco 🎯 FILA de `Hoje` mandavam "copie o
 * link (última coluna de 💼 Empregos)". `Inscrito` (Onda 4, item 4c) foi
 * posta DEPOIS de `link (copiar)` — "última coluna" passou a apontar pro
 * checkbox, não pro link. Quem seguisse a instrução ao pé da letra marcava
 * "me inscrevi" numa vaga que nunca tinha aberto.
 *
 * A PROVA (pedida literalmente pelo briefing): lê o CABEÇALHO VIVO de
 * `Empregos` e exige que (a) o nome citado pela instrução exista nele e
 * (b) nenhuma das duas instruções contenha "última coluna". Lê o texto
 * VIVO de `Fila!A2` e do bloco FILA de `Hoje` — nunca a string estática de
 * `_norman/formulas.js` sozinha, porque é exatamente aí que a mentira
 * original vivia (o código dizia uma coisa, a planilha aplicada dizia
 * outra até alguém rodar `formatar.js`/`construir.js` de novo).
 *
 * Se `.env` não tem as três credenciais `GOOGLE_SHEETS_*`, avisa e sai 0
 * (SKIP) — mesma cerca dos outros testes desta leva que dependem da
 * planilha viva.
 */

const assert = require('assert');
const path = require('path');
const RAIZ = path.join(__dirname, '..');
require(path.join(RAIZ, 'lib', 'env')).carregarEnv(path.join(RAIZ, '.env'));

const F = require('../_norman/formulas');
const A = require('../_norman/abas');

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

/** Acha, numa matriz de valores lida da API, a 1ª célula cujo texto contém `pedaco`. */
function acharCelula(valores, pedaco) {
  for (const linha of valores || []) {
    for (const v of linha || []) {
      if (typeof v === 'string' && v.includes(pedaco)) return v;
    }
  }
  return null;
}

async function main() {
  console.log('\n=== onda-ux-3-instrucao-coluna.test.js ===\n');

  const semCredencial = !process.env.GOOGLE_SHEETS_SPREADSHEET_ID
    || !process.env.GOOGLE_SHEETS_CLIENT_EMAIL || !process.env.GOOGLE_SHEETS_PRIVATE_KEY;
  if (semCredencial) {
    console.log('  SKIP — sem as três credenciais GOOGLE_SHEETS_* em .env; a prova exige o cabeçalho VIVO.\n');
    process.exit(0);
  }

  const a = require('../_norman/api');

  let passed = 0;
  let failed = 0;
  const nota = ok => { if (ok) passed++; else failed++; };

  nota(await runTestAsync('cabeçalho VIVO de Empregos contém a coluna nomeada pela instrução ("link (copiar)")', async () => {
    const l = F.LINHAS[A.EMPREGOS];
    const nCols = F.MERCADO_CABECALHO.length;
    const fim = String.fromCharCode(65 + nCols - 1);
    const r = await a.ler(`${A.EMPREGOS}!A${l.cabecalho}:${fim}${l.cabecalho}`);
    const cabecalhoVivo = (r.values || [[]])[0] || [];
    assert.ok(cabecalhoVivo.includes(F.FILA_ROTULO_COLUNA_LINK),
      `cabeçalho vivo de Empregos!${l.cabecalho} não contém "${F.FILA_ROTULO_COLUNA_LINK}": ${JSON.stringify(cabecalhoVivo)}`);
  }));

  nota(await runTestAsync('Fila!A2 (estado vazio) não contém "última coluna" e cita "link (copiar)"', async () => {
    const l = F.LINHAS[A.FILA];
    const r = await a.ler(`${A.FILA}!A${l.vazio}`);
    const texto = ((r.values || [[]])[0] || [])[0] || '';
    assert.ok(!/última coluna/i.test(texto), `Fila!A${l.vazio} ainda diz "última coluna": ${texto}`);
    assert.ok(texto.includes(F.FILA_ROTULO_COLUNA_LINK), `Fila!A${l.vazio} não cita "${F.FILA_ROTULO_COLUNA_LINK}": ${texto}`);
  }));

  nota(await runTestAsync('bloco 🎯 FILA de Hoje (estado vazio, lido ao vivo) não contém "última coluna" e cita "link (copiar)"', async () => {
    const l = F.LINHAS[A.HOJE];
    const ate = F.hojeUltimaLinha();
    // Lê a largura inteira do painel (todas as colunas dos 4 grupos) — a
    // busca é por CONTEÚDO ("Nada na fila"), não por endereço fixo, porque
    // a altura de cada bloco é dinâmica (depende de quanta tarefa/edital
    // existe hoje) e endereçar por número literal reintroduziria a mesma
    // classe de fragilidade que N-17 já proíbe.
    const fim = F.colunaLetra(F.HOJE_COLUNAS_ABA.length - 1);
    const r = await a.ler(`${A.HOJE}!A${l.lista}:${fim}${ate}`);
    const vazioFila = acharCelula(r.values, 'Nada na fila');
    assert.ok(vazioFila, 'não achei a célula de estado vazio da Fila ("Nada na fila...") no bloco 🎯 FILA de Hoje — a Fila está com dado hoje, ou o texto mudou');
    assert.ok(!/última coluna/i.test(vazioFila), `bloco FILA de Hoje ainda diz "última coluna": ${vazioFila}`);
    assert.ok(vazioFila.includes(F.FILA_ROTULO_COLUNA_LINK), `bloco FILA de Hoje não cita "${F.FILA_ROTULO_COLUNA_LINK}": ${vazioFila}`);
  }));

  console.log(`\n${passed} passou(aram), ${failed} falhou(aram)\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('ERRO\n' + (err && err.stack || err));
  process.exit(1);
});
