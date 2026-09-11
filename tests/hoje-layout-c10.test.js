#!/usr/bin/env node
'use strict';

/**
 * C10 Parte 3 — `Hoje` usa a largura. `.claude/plans/radar-crm-20-ondas.md`
 * §C10 "O `Hoje` também" + §C10-b ("o painel `Hoje` entra nesta rodada") +
 * conserto 0b da rodada Ondas 14-17 (2 grupos ainda desperdiçavam largura,
 * JB pediu pelo menos 3) + Onda 19 (dois blocos de decisão cross-fonte,
 * `⏰ VENCE`/`🚧 ATENÇÃO`, viram o QUARTO grupo, na ponta esquerda).
 *
 * Histórico: Onda 21 entregou DOIS grupos de 3 blocos (9/26 colunas usadas).
 * Conserto 0b (rodada Ondas 14-17) foi pra TRÊS grupos de 2 blocos
 * (⏳ TAREFAS·🎯 FILA | 📌 PROJETOS·📓 DIÁRIO | 🌐 NOTÍCIA·🆕 RADAR). Onda 19
 * acrescenta um QUARTO grupo à ESQUERDA de todos — `⏰ VENCE`/`🚧 ATENÇÃO`
 * são o cruzamento de tarefa+edital e de fila+candidatura+bloqueio, mais
 * urgentes que qualquer bloco de aba única — empurrando TAREFAS·FILA pro
 * grupo 1. A mesma arquitetura de território exclusivo por bloco de colunas
 * que C10 Parte 2 já usa pras quatro tabelas de notícia
 * (`noticiaColunaBase`/`NOTICIA_BLOCO_LARGURA`), agora exercitada com N=4.
 *
 * O QUE ESTE ARQUIVO PROVA (sem rede — geometria e montagem de fórmula em
 * Node; a prova AO VIVO — planilha real sem #REF!/#N/A e os blocos
 * ocupando a largura — é `_norman/verificar.js` G3, reportada no relatório
 * da Onda com leitura real):
 *
 *  - os QUATRO grupos cobrem os OITO blocos, cada um uma vez só, na ordem de
 *    `HOJE_BLOCOS` (prioridade: decide primeiro fica em cima e à esquerda);
 *  - os blocos de coluna dos quatro grupos são DISJUNTOS (território
 *    exclusivo — a regra dura de spill: um `VSTACK` que encontra célula
 *    ocupada morre inteiro e derruba a aba);
 *  - `hojeCelulas` escreve UMA célula por grupo (4, não 1), cada uma na sua
 *    própria coluna-âncora, mais o resto do cromo (veredito+nav);
 *  - a largura da ABA INTEIRA (`HOJE_COLUNAS_ABA`) é 4 grupos × 4 colunas +
 *    3 vãos = 19;
 *  - `hojeUltimaLinha()` é o MAIOR dos quatro grupos (paralelo, não soma) —
 *    critério de regressão: o grupo novo (VENCE+ATENÇÃO) NÃO pode ser o mais
 *    alto, senão a largura nova custou altura ao painel inteiro.
 */

const assert = require('assert');

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

function main() {
  console.log('\n=== hoje-layout-c10.test.js ===\n');
  let passed = 0;
  let failed = 0;
  const nota = ok => { if (ok) passed++; else failed++; };

  nota(runTest('pelo menos 4 grupos de coluna (Onda 19: VENCE/ATENÇÃO viram o quarto grupo)', () => {
    assert.ok(F.HOJE_GRUPOS_COLUNA.length >= 4, `esperado >= 4 grupos, achou ${F.HOJE_GRUPOS_COLUNA.length}`);
  }));

  nota(runTest('os quatro grupos cobrem os 8 blocos de HOJE_BLOCOS, cada um exatamente uma vez', () => {
    const todasAsChaves = F.HOJE_GRUPOS_COLUNA.flat();
    assert.strictEqual(todasAsChaves.length, F.HOJE_BLOCOS.length, 'grupos têm que cobrir TODOS os blocos');
    assert.strictEqual(new Set(todasAsChaves).size, todasAsChaves.length, 'nenhum bloco duplicado entre grupos');
    for (const b of F.HOJE_BLOCOS) {
      assert.ok(todasAsChaves.includes(b.chave), `bloco ${b.chave} não está em nenhum grupo`);
    }
    // ordem de prioridade preservada: HOJE_BLOCOS na ordem original é a
    // concatenação dos grupos, na ordem dos grupos.
    assert.deepStrictEqual(todasAsChaves, F.HOJE_BLOCOS.map(b => b.chave));
  }));

  nota(runTest('grupo 0 (esquerda, decide primeiro) = VENCE·ATENCAO; grupo 1 = TAREFAS·FILA; grupo 2 = PROJETOS·DIARIO; grupo 3 = NOTICIA·RADAR·PULSO (C5, Leva 5)', () => {
    assert.deepStrictEqual(F.HOJE_GRUPOS_COLUNA[0], ['VENCE', 'ATENCAO']);
    assert.deepStrictEqual(F.HOJE_GRUPOS_COLUNA[1], ['TAREFAS', 'FILA']);
    assert.deepStrictEqual(F.HOJE_GRUPOS_COLUNA[2], ['PROJETOS', 'DIARIO']);
    // C5 (Leva 5) — PULSO entra como TERCEIRO bloco do grupo 3 (folga
    // vertical: 20 linhas contra o teto de 28 do grupo 1) — ver o bloco de
    // comentário grande no bloco PULSO, em `_norman/formulas.js`.
    assert.deepStrictEqual(F.HOJE_GRUPOS_COLUNA[3], ['NOTICIA', 'RADAR', 'PULSO']);
  }));

  nota(runTest('território exclusivo: os blocos de coluna de todos os grupos são DISJUNTOS, com 1 vão entre vizinhos', () => {
    const blocos = F.HOJE_GRUPOS_COLUNA.map((_, g) => [
      F.hojeColunaBaseGrupo(g),
      F.hojeColunaBaseGrupo(g) + F.HOJE_GRUPO_LARGURA
    ]);
    for (let i = 0; i < blocos.length - 1; i++) {
      const [gA, gB] = [blocos[i], blocos[i + 1]];
      assert.ok(gA[1] <= gB[0], `grupo ${i} [${gA}) e grupo ${i + 1} [${gB}) se sobrepõem`);
      assert.strictEqual(gB[0] - gA[1], 1, `exatamente 1 coluna de vão entre o grupo ${i} e o ${i + 1}, nunca escrita como dado`);
    }
  }));

  nota(runTest('HOJE_COLUNAS_ABA: 4 grupos × 4 colunas + 3 vãos = 19 (A..S)', () => {
    assert.strictEqual(F.HOJE_COLUNAS_ABA.length, 19);
    assert.deepStrictEqual(F.HOJE_COLUNAS_ABA.slice(0, 4), F.HOJE_COLUNAS, 'grupo 0 usa a mesma largura de bloco');
    assert.deepStrictEqual(F.HOJE_COLUNAS_ABA.slice(5, 9), F.HOJE_COLUNAS, 'grupo 1 usa a MESMA largura de bloco que o grupo 0');
    assert.deepStrictEqual(F.HOJE_COLUNAS_ABA.slice(10, 14), F.HOJE_COLUNAS, 'grupo 2 usa a MESMA largura de bloco que os anteriores');
    assert.deepStrictEqual(F.HOJE_COLUNAS_ABA.slice(15, 19), F.HOJE_COLUNAS, 'grupo 3 usa a MESMA largura de bloco que os anteriores');
    assert.strictEqual(F.HOJE_COLUNAS_ABA[4], F.HOJE_VAO_LARGURA, 'coluna 4 (E) é o vão entre grupo 0 e 1');
    assert.strictEqual(F.HOJE_COLUNAS_ABA[9], F.HOJE_VAO_LARGURA, 'coluna 9 (J) é o vão entre grupo 1 e 2');
    assert.strictEqual(F.HOJE_COLUNAS_ABA[14], F.HOJE_VAO_LARGURA, 'coluna 14 (O) é o vão entre grupo 2 e 3');
    // ainda dentro da grade padrão de 26 colunas — nenhuma largura extra
    // precisou ser declarada em `construir.js`/`formatar.js` pro `Hoje`.
    assert.ok(F.HOJE_COLUNAS_ABA.length <= 26, 'a aba Hoje ainda cabe na grade padrão de 26 colunas');
  }));

  nota(runTest('hojeUltimaLinha() é o MAIOR dos quatro grupos, e o grupo novo (VENCE+ATENÇÃO) não é o mais alto', () => {
    const somaTodosOsBlocos = F.HOJE_BLOCOS.reduce((n, b) => n + b.teto + 3, 0);
    const alturaNova = F.hojeUltimaLinha() - F.LINHAS[A.HOJE].lista + 1;
    assert.ok(alturaNova < somaTodosOsBlocos,
      `altura nova (${alturaNova}) tem que ser MENOR que a soma empilhada dos 8 blocos (${somaTodosOsBlocos})`);
    const alturasPorGrupo = F.HOJE_GRUPOS_COLUNA.map(chaves =>
      chaves.reduce((n, chave) => n + F.HOJE_BLOCOS.find(b => b.chave === chave).teto + 3, 0));
    assert.strictEqual(alturaNova, Math.max(...alturasPorGrupo), 'a altura é o MAIOR grupo (paralelo), não a soma (empilhado)');
    // regressão da Onda 19: o grupo novo (VENCE+ATENÇÃO, teto 8+8) não pode
    // ser mais alto que o grupo TAREFAS+FILA (teto 12+10) que já existia —
    // senão a largura nova custou altura ao painel inteiro, o mesmo
    // critério que o conserto 0b já defendia pra 3 grupos.
    assert.ok(alturasPorGrupo[0] <= alturasPorGrupo[1],
      `grupo 0 (VENCE+ATENÇÃO, altura ${alturasPorGrupo[0]}) devia ser <= grupo 1 (TAREFAS+FILA, altura ${alturasPorGrupo[1]})`);
  }));

  nota(runTest('hojeCelulas: 4 células de lista (uma por grupo, colunas A, F, K e P) + veredito + nav', () => {
    const gidFake = Object.fromEntries(Object.values(A).filter(v => typeof v === 'string').map((v, i) => [v, i]));
    const celulas = F.hojeCelulas('SPREADSHEET_ID', gidFake);
    const G = F.LINHAS[A.HOJE];
    assert.ok(celulas[`A${G.veredito}`], 'veredito ausente');
    const colGrupo0 = F.colunaLetra(F.hojeColunaBaseGrupo(0));
    const colGrupo1 = F.colunaLetra(F.hojeColunaBaseGrupo(1));
    const colGrupo2 = F.colunaLetra(F.hojeColunaBaseGrupo(2));
    const colGrupo3 = F.colunaLetra(F.hojeColunaBaseGrupo(3));
    assert.strictEqual(colGrupo0, 'A', 'grupo 0 ancora em A');
    assert.strictEqual(colGrupo1, 'F', 'grupo 1 ancora em F (4 colunas + 1 vão depois de A)');
    assert.strictEqual(colGrupo2, 'K', 'grupo 2 ancora em K (4 colunas + 1 vão depois de F)');
    assert.strictEqual(colGrupo3, 'P', 'grupo 3 ancora em P (4 colunas + 1 vão depois de K)');
    const cols = [colGrupo0, colGrupo1, colGrupo2, colGrupo3];
    for (const col of cols) {
      assert.ok(celulas[`${col}${G.lista}`], `célula do grupo em ${col}${G.lista} ausente`);
      assert.ok(celulas[`${col}${G.lista}`].startsWith('=VSTACK('));
    }
    // território exclusivo: o título de um bloco só aparece no VSTACK do seu
    // próprio grupo, nunca nos outros três.
    F.HOJE_GRUPOS_COLUNA.forEach((chaves, g) => {
      const vstackDoGrupo = celulas[`${cols[g]}${G.lista}`];
      for (const chave of chaves) {
        const b = F.HOJE_BLOCOS.find(bl => bl.chave === chave);
        assert.ok(vstackDoGrupo.includes(`"${b.titulo}"`), `grupo ${g} devia conter o título de ${chave}`);
        F.HOJE_GRUPOS_COLUNA.forEach((outrasChaves, g2) => {
          if (g2 === g) return;
          const vstackOutro = celulas[`${cols[g2]}${G.lista}`];
          assert.ok(!vstackOutro.includes(`"${b.titulo}"`), `grupo ${g2} NÃO devia conter o título de ${chave} (território exclusivo)`);
        });
      }
    });
  }));

  nota(runTest('HOJE_WRAP_ABA cobre as colunas 0,1 de CADA grupo (wrap relativo, não absoluto)', () => {
    assert.deepStrictEqual(F.HOJE_WRAP_ABA, [0, 1, 5, 6, 10, 11, 15, 16]);
  }));

  nota(runTest('veredito/nav de Hoje continuam intocados pela largura nova (só a LISTA cresceu de largura) — geometria ATUALIZADA pela Onda UX 6 (remodelação 2026-09-01)', () => {
    const G = F.LINHAS[A.HOJE];
    assert.strictEqual(G.veredito, 1);
    // ONDA UX 6 — a nav de `Hoje` desceu de DUAS linhas (`nav`+`nav2`, 4
    // destinos em 2×2) pra UMA (`nav`, 12 destinos + marcador). `nav2` não
    // existe mais; `lista`/`congelado` andam uma linha pra cima (4->3,
    // 3->2) — a "largura nova" desta Onda (C10) segue intocada, só a base
    // de linha mudou por uma Onda DIFERENTE e posterior.
    assert.strictEqual(G.nav, 2);
    assert.strictEqual(G.nav2, undefined, 'F.LINHAS[A.HOJE].nav2 deveria ter sido removido (Onda UX 6)');
    assert.strictEqual(G.lista, 3);
    assert.strictEqual(G.congelado, 2);
  }));

  nota(runTest('VENCE e ATENÇÃO: cada um tem corpo (função de url — lê mais de uma aba), vazio e contagem declarados', () => {
    for (const chave of ['VENCE', 'ATENCAO']) {
      const b = F.HOJE_BLOCOS.find(bl => bl.chave === chave);
      assert.ok(b, `bloco ${chave} não existe em HOJE_BLOCOS`);
      assert.strictEqual(typeof b.corpo, 'function', `${chave}.corpo devia ser função de url (lê mais de uma aba)`);
      assert.ok(typeof b.vazio === 'string' && b.vazio.length > 20, `${chave}.vazio ausente ou curto demais pra ensinar o próximo passo`);
      assert.ok(typeof b.contagem === 'string' && b.contagem.length > 0, `${chave}.contagem ausente`);
      assert.ok(typeof b.teto === 'number' && b.teto > 0, `${chave}.teto ausente`);
    }
  }));

  console.log(`\n${passed} passou(aram), ${failed} falhou(aram)\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
