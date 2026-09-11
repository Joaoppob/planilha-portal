#!/usr/bin/env node
'use strict';

/**
 * REMODELAÇÃO CRM 2026-09-01 — Leva 2, Onda UX 10 + decisão D-A1.
 * `.claude/plans/radar-ux-20-ondas.md` Bloco B, intervenção 10 +
 * `.claude/plans/remodelacao-crm-2026-09-01.md` (decisão D-A1) +
 * `_norman/AVALIACAO-UX.md` Parte 2 §3-4 e Parte 3, linha 10.
 *
 * O QUE ESTE ARQUIVO PROVA:
 *
 *  - `F.projetosSaudeMirror` (espelho puro de `F.PROJETOS_SAUDE`) — LOCAL,
 *    SEM escrever nada na planilha viva (pedido literal do briefing:
 *    "simulando, em teste local"): D-A1 (zero etapa + zero Diário
 *    vinculado → `⚪ sem sinal`, nunca `🔴` por default) E o caso "com
 *    dado real, a saúde calcula normal" (etapa OU Diário vinculado
 *    presente → volta a valer atrasado/parado/sem rumo/em dia).
 *  - Contra o dado VIVO de hoje (skip sem credencial): o aviso derivado
 *    de `Projetos!vazio` acende dizendo "2 de 2" (contagem independente,
 *    recomputada aqui contra `Diário!sobre`/`Projetos!A`) e `saúde` dos
 *    dois projetos reais é `⚪ sem sinal` — não `🔴`.
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
  console.log('\n=== onda-ux-10-reconciliacao-diario-projetos.test.js ===\n');
  let passed = 0;
  let failed = 0;
  const nota = ok => { if (ok) passed++; else failed++; };

  // ================================================= LOCAL — F.projetosSaudeMirror
  nota(runTest('D-A1 — entregue vence tudo: "—"', () => {
    assert.strictEqual(F.projetosSaudeMirror({ entregue: true, atrasado: true, totalEtapas: 0, movimentouAusente: true, diasParadoUteis: 99, abertas: 0, temEmCurso: false }), '—');
  }));

  nota(runTest('D-A1 — atrasado vence mesmo SEM nenhum dado de movimentação (prazo é dado real, não ausência)', () => {
    assert.strictEqual(F.projetosSaudeMirror({ entregue: false, atrasado: true, totalEtapas: 0, movimentouAusente: true, diasParadoUteis: 0, abertas: 5, temEmCurso: true }), '🔴 atrasado');
  }));

  nota(runTest('D-A1 — ZERO etapa cadastrada E ZERO entrada de Diário vinculada => "⚪ sem sinal", NUNCA "🔴 parado" por default', () => {
    const r = F.projetosSaudeMirror({ entregue: false, atrasado: false, totalEtapas: 0, movimentouAusente: true, diasParadoUteis: 999, abertas: 0, temEmCurso: false });
    assert.strictEqual(r, '⚪ sem sinal');
    assert.notStrictEqual(r, '🔴 parado', 'ausência de dado não pode virar "parado" — é exatamente o bug que D-A1 fecha');
  }));

  nota(runTest('Onda 10 — COM dado real (uma ETAPA cadastrada, mesmo sem Diário vinculado): a saúde volta a calcular NORMAL, não "⚪"', () => {
    // totalEtapas > 0 e movimentouAusente=true (Diário órfão/vazio): não é
    // mais "sem dado nenhum" — o mov ausente ainda força o piso de "parado".
    const r = F.projetosSaudeMirror({ entregue: false, atrasado: false, totalEtapas: 1, movimentouAusente: true, diasParadoUteis: F.PROJETOS_SAUDE_PARADO_DIAS_UTEIS, abertas: 3, temEmCurso: true });
    assert.strictEqual(r, '🔴 parado', 'com etapa cadastrada, "sem vínculo no Diário" ainda é sinal de parado — não vira "sem sinal"');
  }));

  nota(runTest('Onda 10 — "simulando um Diário com sobre casando com projeto" (movimentouAusente=false): a saúde calcula NORMAL — em dia', () => {
    const r = F.projetosSaudeMirror({
      entregue: false, atrasado: false, totalEtapas: 0,
      movimentouAusente: false, diasParadoUteis: 1, // moveu ontem
      abertas: 2, temEmCurso: true
    });
    assert.strictEqual(r, '🟢 em dia', `esperado "🟢 em dia" com movimentação recente e sinal de atividade, achou "${r}"`);
  }));

  nota(runTest('Onda 10 — "simulando um Diário com sobre casando com projeto" que ESTÁ parado há muito: 🔴 parado (dado real, não D-A1)', () => {
    const r = F.projetosSaudeMirror({
      entregue: false, atrasado: false, totalEtapas: 0,
      movimentouAusente: false, diasParadoUteis: F.PROJETOS_SAUDE_PARADO_DIAS_UTEIS + 3,
      abertas: 0, temEmCurso: false
    });
    assert.strictEqual(r, '🔴 parado');
  }));

  nota(runTest('Onda 10 — dado real, não parado, sem tarefa aberta e sem etapa em curso: 🟠 sem rumo', () => {
    const r = F.projetosSaudeMirror({
      entregue: false, atrasado: false, totalEtapas: 2,
      movimentouAusente: false, diasParadoUteis: 0,
      abertas: 0, temEmCurso: false
    });
    assert.strictEqual(r, '🟠 sem rumo');
  }));

  // ================================================= LOCAL — assinaturas de movimentou
  nota(runTest('Onda 10 — PROJETOS_MOVIMENTOU_NUNCA e _ORFAO são textos distintos (movimentou distingue os dois estados)', () => {
    assert.notStrictEqual(F.PROJETOS_MOVIMENTOU_NUNCA, F.PROJETOS_MOVIMENTOU_ORFAO);
    assert.ok(F.PROJETOS_MOVIMENTOU_NUNCA.includes('nunca'), 'PROJETOS_MOVIMENTOU_NUNCA devia falar de "nunca apareceu"');
    assert.ok(F.PROJETOS_MOVIMENTOU_ORFAO.includes('vínculo'), 'PROJETOS_MOVIMENTOU_ORFAO devia falar de "sem vínculo"');
  }));

  nota(runTest('Onda 10 — "sobre" virou rótulo que pede a chave: F.DIARIO_ROTULO_SOBRE != "sobre" cru', () => {
    assert.notStrictEqual(F.DIARIO_ROTULO_SOBRE, 'sobre');
    assert.ok(F.DIARIO_CABECALHO.includes(F.DIARIO_ROTULO_SOBRE), 'o cabeçalho vivo tem que carregar o novo rótulo');
  }));

  // ================================================= CONTRA O DADO VIVO
  const semCredencial = !process.env.GOOGLE_SHEETS_SPREADSHEET_ID
    || !process.env.GOOGLE_SHEETS_CLIENT_EMAIL || !process.env.GOOGLE_SHEETS_PRIVATE_KEY;
  if (semCredencial) {
    console.log('  SKIP (dado vivo) — sem as três credenciais GOOGLE_SHEETS_* em .env; o aviso derivado e a saúde só se leem da planilha viva.\n');
    console.log(`\n${passed} passou(aram), ${failed} falhou(aram)\n`);
    process.exit(failed > 0 ? 1 : 0);
  }

  const a = require('../_norman/api');
  const lD = F.LINHAS[A.DIARIO];
  const colSobre = F.letraDe(F.DIARIO_CABECALHO, F.DIARIO_ROTULO_SOBRE);
  const [sobreVivo, projetosVivos] = await a.lerVarios([
    `${R(A.DIARIO)}!${colSobre}${lD.dados}:${colSobre}1000`,
    `${R(A.PROJETOS)}!A${F.LINHAS[A.PROJETOS].dados}:A${F.PROJETOS_ULTIMA_LINHA}`
  ]);
  const projetosSet = new Set(projetosVivos.map(l => String((l || [])[0] || '').trim()).filter(Boolean));
  const sobreEntradas = sobreVivo.map(l => String((l || [])[0] || '').trim()).filter(Boolean);
  const semVinculo = sobreEntradas.filter(v => !projetosSet.has(v));

  nota(await runTestAsync('Onda 10 — aviso derivado em Projetos!vazio acende com a contagem CORRETA de entradas sem vínculo', async () => {
    const avisoLido = String(((await a.ler(`${R(A.PROJETOS)}!A${F.LINHAS[A.PROJETOS].vazio}`)).values || [[]])[0][0] || '');
    console.log(`    Diário: ${sobreEntradas.length} entrada(s) preenchida(s), ${semVinculo.length} sem vínculo com Projetos!A`);
    if (semVinculo.length === 0) {
      assert.ok(!avisoLido.includes('não batem com projeto nenhum'), `Diário 100% reconciliado, mas o aviso ainda fala de órfãs: "${avisoLido}"`);
    } else {
      assert.ok(avisoLido.includes(`${semVinculo.length} de ${sobreEntradas.length}`),
        `aviso devia dizer "${semVinculo.length} de ${sobreEntradas.length}" — leu: "${avisoLido}"`);
      assert.ok(avisoLido.includes('não batem com projeto nenhum'), `aviso não fala de "não batem com projeto nenhum": "${avisoLido}"`);
    }
  }));

  nota(await runTestAsync('Onda 10 + D-A1 — contra o dado vivo de hoje: projeto sem etapa E sem Diário vinculado tem saúde "⚪ sem sinal"', async () => {
    const colSaude = F.letraDe(F.PROJETOS_CABECALHO, 'saúde');
    const linhas = ((await a.ler(`${R(A.PROJETOS)}!A${F.LINHAS[A.PROJETOS].dados}:${colSaude}${F.PROJETOS_ULTIMA_LINHA}`)).values || [])
      .filter(r => (r[0] || '') !== '');
    const iSaude = colSaude.charCodeAt(0) - 65;
    const etapasVivas = ((await a.ler(`${R(A.ETAPAS)}!A2:A1000`)).values || []).map(l => String((l || [])[0] || '').trim());
    let conferidos = 0;
    for (const linha of linhas) {
      const nome = String(linha[0] || '').trim();
      const temEtapa = etapasVivas.includes(nome);
      const vinculadoNoDiario = sobreEntradas.filter(v => v === nome).length > 0;
      if (!temEtapa && !vinculadoNoDiario) {
        assert.strictEqual(linha[iSaude], '⚪ sem sinal', `"${nome}" não tem etapa nem entrada de Diário vinculada, mas saúde="${linha[iSaude]}" (esperado "⚪ sem sinal")`);
        conferidos++;
      }
    }
    console.log(`    ${conferidos} projeto(s) sem etapa e sem Diário vinculado, todos "⚪ sem sinal"`);
  }));

  console.log(`\n${passed} passou(aram), ${failed} falhou(aram)\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('ERRO\n' + (err && err.stack || err));
  process.exit(1);
});
