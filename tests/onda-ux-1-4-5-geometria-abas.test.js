#!/usr/bin/env node
'use strict';

/**
 * REMODELAÇÃO CRM 2026-09-01 — Leva 1, Bloco A (Ondas UX 1, 4 e 5).
 * `.claude/plans/radar-ux-20-ondas.md` Bloco A + `_norman/AVALIACAO-UX.md`
 * Parte 3, intervenções 1, 4, 5.
 *
 * As três Ondas mexem em PROPRIEDADE DE GRADE (`gridProperties`/`index`/
 * `hidden`), que só existe depois que `_norman/formatar.js` roda contra a
 * planilha VIVA — não dá pra provar lendo `_norman/formulas.js` sozinho
 * (isso é geometria de GRADE, não de conteúdo de fórmula). Este arquivo lê
 * a planilha de verdade, uma vez (`meta()`), e deriva as três provas do
 * mesmo payload — mesma doutrina de "um número, uma fonte" que a Onda 2
 * exige do resto da peça.
 *
 * Se `.env` não tem as três credenciais `GOOGLE_SHEETS_*`, o arquivo AVISA
 * e sai 0 (SKIP) — não existe teste de geometria de grade sem a grade
 * viva, e a suíte inteira (`node radar.js testar`) precisa continuar
 * rodando sem rede pra quem não tem credencial.
 *
 * O QUE ESTE ARQUIVO PROVA:
 *
 *  - Onda 1 — `frozenColumnCount >= 1` em TODAS as abas hoje visíveis
 *    (dinâmico: lê `hidden` ao vivo, nunca assume "14" ou qualquer número
 *    redondo — essa foi exatamente a lição que `_norman/AVALIACAO-UX.md`
 *    documenta sobre a prova ANTERIOR, que contou 13 achando que eram
 *    todas). `Concursos`/`Concursos · tudo`/`Empregos` congelam 2
 *    (Abrir+Vaga).
 *  - Onda 4 — a barra reordenada: TODA aba de ESCRITA (Tarefas, Fila,
 *    Candidaturas, Projetos, Diário, Etapas) tem índice MENOR que TODA aba
 *    de LEITURA de notícia (Notícias, IA, Trabalho, Ciência); `Etapas` fica
 *    adjacente a `Projetos` OU `Diário`; `dados (não edite)` está oculta.
 *  - Onda 5 — `frozenRowCount === 4` nas quatro abas de notícia (o título
 *    de cada tabela, que hoje mora na linha 4, entra no congelamento) — e
 *    conferido por CONTEÚDO numa aba representativa: a linha 3 é o
 *    cabeçalho genérico, a linha 4 já é o título específico da 1ª tabela.
 */

const assert = require('assert');
const path = require('path');
const RAIZ = path.join(__dirname, '..');
require(path.join(RAIZ, 'lib', 'env')).carregarEnv(path.join(RAIZ, '.env'));

const F = require('../_norman/formulas');
const A = require('../_norman/abas');

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
  console.log('\n=== onda-ux-1-4-5-geometria-abas.test.js ===\n');

  const semCredencial = !process.env.GOOGLE_SHEETS_SPREADSHEET_ID
    || !process.env.GOOGLE_SHEETS_CLIENT_EMAIL || !process.env.GOOGLE_SHEETS_PRIVATE_KEY;
  if (semCredencial) {
    console.log('  SKIP — sem as três credenciais GOOGLE_SHEETS_* em .env; geometria de grade só se prova contra a planilha viva.\n');
    process.exit(0);
  }

  const a = require('../_norman/api');
  const meta = await a.api('?includeGridData=false&fields=sheets(properties(sheetId,title,hidden,index,gridProperties))');
  const props = {};
  meta.sheets.forEach(s => { props[s.properties.title] = s.properties; });

  let passed = 0;
  let failed = 0;
  const nota = ok => { if (ok) passed++; else failed++; };

  // ------------------------------------------------------------ Onda 1
  nota(runTest('Onda 1 — todas as abas HOJE VISÍVEIS (lido ao vivo, não um número fixo) têm frozenColumnCount >= 1', () => {
    const visiveis = Object.values(props).filter(p => !p.hidden);
    assert.ok(visiveis.length > 0, 'meta() não devolveu nenhuma aba visível — algo está errado com a leitura');
    const semColunaCongelada = visiveis.filter(p => !((p.gridProperties || {}).frozenColumnCount >= 1));
    assert.strictEqual(semColunaCongelada.length, 0,
      `${visiveis.length - semColunaCongelada.length}/${visiveis.length} abas visíveis com frozenColumnCount>=1 — faltam: ${semColunaCongelada.map(p => p.title).join(', ')}`);
    console.log(`    (${visiveis.length}/${visiveis.length} abas visíveis com frozenColumnCount >= 1 — o total real hoje, lido ao vivo)`);
  }));

  // ATUALIZADO na Leva 3 (Onda UX 13) — `Inscrito` entrou ENTRE `Abrir` e
  // `Vaga` (única posição que não quebra o spill contíguo de `CHOOSECOLS`),
  // então o congelamento cresceu pra continuar cobrindo identidade completa:
  // `Empregos` 2->3 (Abrir+Inscrito+Vaga); `Concursos`/`Concursos · tudo`
  // 2->4 (Abrir+Inscrito+Vaga+Elegível?, esta última por causa da Onda 11).
  //
  // ATUALIZADO na Leva 6 (V4) — `Empregos` cresce de novo, 3->4
  // (Abrir+Inscrito+Vaga+Publicada): a mesma Onda 13 acima empurrou
  // `Publicada` (o emoji de frescor) pra fora da dobra de 358 px SEM
  // resgatar ela pro bloco congelado, ao contrário do que aconteceu com
  // `Elegível?` em `Concursos` na mesma Onda — o sinal de frescor deixou de
  // sobreviver à rolagem. V4 fecha a mesma lacuna, pelo mesmo mecanismo.
  // Ver `FROZEN_COLUNAS` em `_norman/formatar.js` e a Lei da Faixa no topo
  // do arquivo.
  nota(runTest('Onda 1 + 13 + V4(Leva 6) — Concursos / Concursos · tudo / Empregos congelam 4 colunas cada (identidade + a faceta que decide/o sinal de frescor)', () => {
    for (const aba of [A.PAINEL, A.TUDO, A.EMPREGOS]) {
      const fcc = ((props[aba] || {}).gridProperties || {}).frozenColumnCount;
      assert.strictEqual(fcc, 4, `${aba}: frozenColumnCount=${fcc}, esperado 4`);
    }
  }));

  // ------------------------------------------------------------ Onda 4
  nota(runTest('Onda 4 — escrita antes de leitura: toda aba do CRM tem índice menor que toda aba de notícia', () => {
    const ESCRITA = [A.TAREFAS, A.FILA, A.CANDIDATURAS, A.PROJETOS, A.DIARIO, A.ETAPAS];
    const LEITURA = A.VISTAS_NOTICIA;
    for (const e of ESCRITA) {
      assert.ok(props[e], `aba de escrita ausente na planilha: ${e}`);
      for (const l of LEITURA) {
        assert.ok(props[l], `aba de leitura ausente na planilha: ${l}`);
        assert.ok(props[e].index < props[l].index,
          `${e} (índice ${props[e].index}) devia vir ANTES de ${l} (índice ${props[l].index})`);
      }
    }
  }));

  nota(runTest('Onda 4 — Etapas fica adjacente a Projetos ou Diário na barra', () => {
    const iEtapas = props[A.ETAPAS].index;
    const iProjetos = props[A.PROJETOS].index;
    const iDiario = props[A.DIARIO].index;
    const adjacente = Math.abs(iEtapas - iProjetos) === 1 || Math.abs(iEtapas - iDiario) === 1;
    assert.ok(adjacente,
      `Etapas (índice ${iEtapas}) não está ao lado de Projetos (${iProjetos}) nem de Diário (${iDiario})`);
  }));

  nota(runTest('Onda 4 — Hoje abre a barra (menor índice entre as abas visíveis)', () => {
    const visiveis = Object.values(props).filter(p => !p.hidden);
    const menor = Math.min(...visiveis.map(p => p.index));
    assert.strictEqual(props[A.HOJE].index, menor, `Hoje não tem o menor índice entre as abas visíveis (menor=${menor})`);
  }));

  nota(runTest('Onda 4 — dados (não edite) está OCULTA', () => {
    assert.strictEqual(!!props[A.DADOS].hidden, true, 'dados (não edite) continua visível');
  }));

  // ------------------------------------------------------------ Onda 5
  nota(runTest('Onda 5 — frozenRowCount === 4 nas quatro abas de notícia (título de tabela dentro do congelamento)', () => {
    for (const aba of A.VISTAS_NOTICIA) {
      const frc = ((props[aba] || {}).gridProperties || {}).frozenRowCount;
      assert.strictEqual(frc, 4, `${aba}: frozenRowCount=${frc}, esperado 4`);
      assert.strictEqual(F.LINHAS[aba].congelado, 4, `${aba}: F.LINHAS.congelado desalinhado do que formatar.js aplicou`);
    }
  }));

  nota(await runTestAsync('Onda 5 — conteúdo: linha 3 é cabeçalho genérico, linha 4 já é o título específico da 1ª tabela (aba representativa)', async () => {
    const aba = A.NOTICIAS;
    const l = F.LINHAS[aba];
    const col = F.noticiaLetra(0, F.NOTICIA_COL_LISTA);
    const r = await a.ler(`${aba}!${col}${l.cabecalho}:${col}${l.lista}`, 'valueRenderOption=UNFORMATTED_VALUE');
    const vals = (r.values || []).map(row => (row || [])[0]);
    assert.strictEqual(vals[0], F.NOTICIA_COL_LISTA, `linha ${l.cabecalho} (cabeçalho) devia dizer "${F.NOTICIA_COL_LISTA}", achou "${vals[0]}"`);
    assert.strictEqual(vals[1], F.NOTICIA_FAIXAS[0].rotulo, `linha ${l.lista} (título da 1ª tabela) devia dizer "${F.NOTICIA_FAIXAS[0].rotulo}", achou "${vals[1]}"`);
  }));

  console.log(`\n${passed} passou(aram), ${failed} falhou(aram)\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('ERRO\n' + (err && err.stack || err));
  process.exit(1);
});
