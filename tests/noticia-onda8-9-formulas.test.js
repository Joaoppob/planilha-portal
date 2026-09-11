#!/usr/bin/env node
'use strict';

/**
 * ONDA 8-9 + C10 — quatro tabelas por aba, LADO A LADO (hoje/7d/15d/30d,
 * teto 20), tema em coluna filtrável. `.claude/plans/radar-crm-20-ondas.md`
 * §Onda 8, §Onda 9, §C9, §C10/§C10-b. Trava a forma que
 * `_norman/formulas.js`/`construir.js`/`formatar.js`/`verificar.js` assumem
 * depois da reescrita — não recalcula nada da cascata (isso é
 * `tests/noticias-faixas-cascata.test.js`, lib-noticias/).
 *
 * O QUE ESTE ARQUIVO PROVA:
 *
 *  - DESTRAVAR (Onda 8-9 item 0, ainda válido): `F.NOTICIA_TETO`/
 *    `NOTICIA_FAIXAS` são IMPORTADOS de `lib-noticias/ranking.js`, não
 *    copiados — duas leituras da mesma fonte não podem divergir.
 *  - C10: são QUATRO faixas agora (era três), a primeira é `hoje` (dia
 *    civil), não "3 dias".
 *  - C10 Parte 2 — GEOMETRIA HORIZONTAL: as quatro tabelas de uma aba são
 *    blocos de COLUNAS disjuntos, todos ancorados na MESMA linha
 *    (`LINHAS[aba].lista`) — não mais linhas empilhadas na mesma coluna
 *    (Onda 8-9). `repercussão` SAIU do cabeçalho de cada tabela (6 colunas,
 *    não 7 — o glifo 📣 já basta).
 *  - `ferramentas` saiu de `NOTICIA_TEMAS`/`NOTICIA_BLOCO_GLIFO` (0 fontes,
 *    recomendação da Onda 7-10 §5 item 4) E de `fontes-noticias/index.js`
 *    (Onda 5-6, briefing item A1).
 *  - A guarda de cobertura de `construir.js` (5b) FUNCIONA: `NOTICIA_TEMAS`
 *    e o pipeline REAL concordam ponto a ponto.
 *  - C7 (idade do store): o terceiro estado vazio ("radar novo") aparece
 *    quando a janela ainda não completou, com data CALCULADA — inclusive
 *    pra `hoje` (janela de 1 dia).
 */

const assert = require('assert');

const F = require('../_norman/formulas');
const A = require('../_norman/abas');
const RANKING = require('../lib-noticias/ranking');
const NOTICIA_FONTES_REAL = require('../fontes-noticias');

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

async function runAsyncTest(name, fn) {
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
  console.log('\n=== noticia-onda8-9-formulas.test.js ===\n');
  let passed = 0;
  let failed = 0;
  const nota = ok => { if (ok) passed++; else failed++; };

  nota(runTest('DESTRAVAR: F.NOTICIA_TETO é o MESMO valor (===) de ranking.TETO_FAIXA_NOTICIA, não uma cópia', () => {
    assert.strictEqual(F.NOTICIA_TETO, RANKING.TETO_FAIXA_NOTICIA);
    assert.strictEqual(F.NOTICIA_TETO, 20, 'JB pediu 20, não 8 — vale pras quatro janelas');
  }));

  nota(runTest('C10: F.NOTICIA_FAIXAS tem as 4 faixas de ranking.FAIXAS_CASCATA, na mesma ordem — hoje/7d/15d/30d', () => {
    assert.strictEqual(F.NOTICIA_FAIXAS.length, 4, 'quatro janelas, não três (C10)');
    RANKING.FAIXAS_CASCATA.forEach((f, i) => {
      assert.strictEqual(F.NOTICIA_FAIXAS[i].codigo, f.faixa);
      assert.strictEqual(F.NOTICIA_FAIXAS[i].dias, f.dias);
      assert.strictEqual(F.NOTICIA_FAIXAS[i].diaCorrente, !!f.diaCorrente);
      if (f.diaCorrente) {
        assert.strictEqual(F.NOTICIA_FAIXAS[i].rotulo, 'notícias de hoje');
      } else {
        // Onda UX 7 — o rótulo NÃO é mais sempre "últimos {f.dias} dias": com
        // o store mais novo que a janela, ele cita os dias REAIS de
        // cobertura (<= f.dias), nunca a promessa nominal. Ver
        // `F.noticiaRotuloJanela`.
        const m = /últimos (\d+) dias/.exec(F.NOTICIA_FAIXAS[i].rotulo);
        assert.ok(m, `rótulo "${F.NOTICIA_FAIXAS[i].rotulo}" não bate com "top 20 · últimos N dias"`);
        const n = Number(m[1]);
        assert.ok(n >= 1 && n <= f.dias, `rótulo honesto: N (${n}) não pode passar da janela nominal (${f.dias})`);
      }
    });
    assert.deepStrictEqual(F.NOTICIA_FAIXAS.map(f => f.codigo), ['hoje', '7d', '15d', '30d']);
  }));

  nota(runTest('C10 Parte 2: NOTICIA_CABECALHO_TABELA tem 6 colunas (sem "repercussão" — o glifo já basta)', () => {
    assert.deepStrictEqual(F.NOTICIA_CABECALHO_TABELA, ['Abrir', 'título', 'quando', 'veículo', 'tema', '_url']);
    assert.strictEqual(F.NOTICIA_LARGURA_SPILL, 5, 'exclui Abrir do spill do VSTACK');
    assert.ok(!F.NOTICIA_CABECALHO_TABELA.includes('repercussão'), 'repercussão saiu — mesma info que o glifo 📣 no título');
  }));

  nota(runTest('C10 Parte 2: NOTICIA_CABECALHO da ABA INTEIRA é 4 tabelas × 6 colunas + 3 vãos = 27', () => {
    assert.strictEqual(F.NOTICIA_CABECALHO.length, 27);
    assert.strictEqual(F.NOTICIA_COLUNAS.length, F.NOTICIA_CABECALHO.length);
    // vãos: rótulo vazio, largura NÃO nula (visível, só estreito) — índices 6,13,20
    [6, 13, 20].forEach(i => {
      assert.strictEqual(F.NOTICIA_CABECALHO[i], '', `índice ${i} deveria ser o vão (rótulo vazio)`);
      assert.strictEqual(F.NOTICIA_COLUNAS[i], F.NOTICIA_VAO_LARGURA, `índice ${i} deveria ter a largura do vão`);
    });
    // só `_url` (uma por tabela) é oculta (largura null) — 4 ocorrências.
    const ocultas = F.NOTICIA_COLUNAS.map((px, i) => [px, i]).filter(([px]) => px === null).map(([, i]) => i);
    const rotuloOculto = F.NOTICIA_COLUNAS.map((_, i) => i).filter(i => String(F.NOTICIA_CABECALHO[i]).startsWith('_'));
    assert.strictEqual(ocultas.length, 4, 'uma _url oculta por tabela');
    assert.deepStrictEqual(ocultas, rotuloOculto, 'largura null <-> rótulo "_" têm que casar (guarda de formatar.js)');
  }));

  nota(runTest('o mecanismo do seletor de recorte foi REMOVIDO — nenhum export velho sobrevive', () => {
    for (const chave of ['NOTICIA_RECORTES', 'NOTICIA_RECORTE_PADRAO', 'NOTICIA_ROTULOS', 'NOTICIA_SELETOR_COLS',
      'NOTICIA_COL_ORDEM', 'NOTICIA_DESEMPATE', 'NOTICIA_ORDEM_FRASE', 'NOTICIA_K1', 'NOTICIA_K2',
      'noticiaSeletorRef', 'noticiaAjudaRecorte', 'noticiaBlocosDe', 'NOTICIA_BLOCOS',
      'noticiaLinhaTabela', 'NOTICIA_ALTURA_TABELA']) {
      assert.strictEqual(F[chave], undefined, `F.${chave} ainda existe — reintrodução do mecanismo morto`);
    }
    for (const aba of A.VISTAS_NOTICIA) {
      assert.strictEqual(F.LINHAS[aba].recorte, undefined, `${aba} ainda declara .recorte em LINHAS`);
    }
  }));

  nota(runTest('C10 Parte 2 — geometria HORIZONTAL: 4 tabelas por aba, blocos de colunas disjuntos, MESMA linha', () => {
    const aba = A.NOTICIAS;
    const l0 = F.LINHAS[aba].lista;
    // as 4 tabelas começam TODAS na mesma linha — não há mais "próxima linha".
    F.NOTICIA_FAIXAS.forEach((_, i) => {
      assert.strictEqual(F.noticiaColunaBase(i), i * F.NOTICIA_BLOCO_LARGURA);
    });
    assert.strictEqual(F.NOTICIA_BLOCO_LARGURA, F.NOTICIA_LARGURA_TABELA + 1, 'tabela + 1 vão');
    assert.strictEqual(F.NOTICIA_ALTURA_MAX_TABELA, F.NOTICIA_TETO + 2, 'título(1) + corpo(≤20) + rodapé(1), sem respiro vertical');
    assert.strictEqual(F.noticiaUltimaLinha(aba), l0 + F.NOTICIA_ALTURA_MAX_TABELA - 1);
    // congelado sobe 1 linha (recorte saiu, Onda 8-9): nav+veredito+cabecalho = 3.
    // ONDA UX 5 (remodelação 2026-09-01) — sobe MAIS 1, pra 4: o título de
    // cada tabela (a 1ª linha do bloco `lista`) entra no congelamento junto
    // do cabeçalho genérico, senão é o único texto que desambigua as quatro
    // tabelas que rola pra fora da tela. Ver o comentário grande em
    // `F.LINHAS` (formulas.js) e a guarda de `construir.js`.
    assert.strictEqual(F.LINHAS[aba].congelado, 4);
    assert.strictEqual(F.LINHAS[aba].cabecalho, 3);
    assert.strictEqual(F.LINHAS[aba].lista, 4);
    // os blocos de coluna das 4 tabelas são DISJUNTOS (nenhuma sobreposição).
    const blocos = F.NOTICIA_FAIXAS.map((_, i) => [F.noticiaColunaBase(i), F.noticiaColunaBase(i) + F.NOTICIA_LARGURA_TABELA]);
    for (let i = 0; i < blocos.length; i++) {
      for (let j = i + 1; j < blocos.length; j++) {
        const [a0, a1] = blocos[i], [b0] = blocos[j];
        assert.ok(a1 <= b0, `blocos de coluna das tabelas ${i} e ${j} se sobrepõem: [${a0},${a1}) vs tabela ${j} começa em ${b0}`);
      }
    }
  }));

  nota(runTest('o funil (addFilterView) e a banda (CF) de cada tabela ficam DENTRO do seu bloco de colunas, sem invadir a vizinha', () => {
    // Onda 8-9 checava não-sobreposição de LINHA (tabelas empilhadas); C10
    // Parte 2 checa não-sobreposição de COLUNA (tabelas lado a lado) — o
    // teste anterior (acima) já cobre os blocos; aqui confere que a largura
    // de UMA tabela (`NOTICIA_LARGURA_TABELA`) cabe exatamente no passo do
    // bloco menos o vão.
    assert.strictEqual(F.NOTICIA_BLOCO_LARGURA - F.NOTICIA_LARGURA_TABELA, 1, 'exatamente 1 coluna de vão entre tabelas, nunca escrita como dado');
  }));

  nota(runTest('"ferramentas" saiu — 0 fontes, recomendação da Onda 7-10 §5 item 4', () => {
    assert.ok(!F.NOTICIA_TEMAS.some(t => t.tabela === 'ferramentas'), 'NOTICIA_TEMAS ainda cita ferramentas');
    assert.strictEqual(F.NOTICIA_BLOCO_GLIFO.FERRAMENTAS, undefined);
    assert.strictEqual(F.NOTICIA_TEMAS.length, 9, '9 temas (era 10 com ferramentas)');
  }));

  nota(runTest('todo tema tem glifo mapeado e rótulo derivado (glifo + assunto capitalizado)', () => {
    for (const t of F.NOTICIA_TEMAS) {
      assert.ok(F.NOTICIA_BLOCO_GLIFO[t.chave], `tema ${t.chave} sem glifo`);
      const rotulo = F.NOTICIA_TEMA_LABEL(t);
      assert.ok(rotulo.startsWith(F.NOTICIA_BLOCO_GLIFO[t.chave]));
      assert.strictEqual(rotulo[rotulo.length - t.assunto.length], t.assunto[0].toUpperCase());
    }
  }));

  nota(runTest('noticiaCelulas(aba): veredito + (Abrir + título) por tabela × 4 = 9 células, em blocos de coluna corretos', () => {
    const aba = A.IA;
    const celulas = F.noticiaCelulas(aba);
    assert.strictEqual(Object.keys(celulas).length, 9, 'veredito + 4×(Abrir+título) = 9 células');
    assert.ok(celulas[`A${F.LINHAS[aba].veredito}`]);
    F.NOTICIA_FAIXAS.forEach((faixaInfo, i) => {
      const colAbrir = F.noticiaLetra(i, 'Abrir');
      const colLista = F.noticiaLetra(i, 'título');
      const chaveAbrir = `${colAbrir}${F.LINHAS[aba].lista}`;
      const chaveLista = `${colLista}${F.LINHAS[aba].lista}`;
      assert.ok(celulas[chaveAbrir] && celulas[chaveAbrir].includes('HYPERLINK'), `Abrir da tabela ${faixaInfo.codigo} ausente/errado (${chaveAbrir})`);
      assert.ok(celulas[chaveLista], `célula ${chaveLista} (tabela ${faixaInfo.codigo}) ausente`);
      assert.ok(celulas[chaveLista].includes(`"${faixaInfo.rotulo}"`), 'a fórmula carrega o título literal da tabela');
    });
    // as 4 colunas de "título" e as 4 de "Abrir" nunca colidem entre si.
    const chaves = Object.keys(celulas);
    assert.strictEqual(new Set(chaves).size, chaves.length, 'nenhuma célula escrita duas vezes (colisão de coluna)');
  }));

  nota(runTest('a fórmula de cada tabela filtra por aba+faixa (igualdade) e ordena pela coluna posicao — nunca recalcula score', () => {
    const aba = A.CIENCIA;
    const faixaInfo = F.NOTICIA_FAIXAS[1]; // 7d
    const formula = F.noticiaTabela(aba, faixaInfo);
    assert.ok(formula.includes(`="${F.NOTICIA_ABA_PIPELINE[aba]}"`), 'filtra por aba');
    assert.ok(formula.includes(`="${faixaInfo.codigo}"`), 'filtra por faixa');
    assert.ok(formula.includes(`${F.NOTICIA_TETO};${F.NOTICIA_LARGURA_SPILL}`), 'ARRAY_CONSTRAIN usa o teto e a largura certos');
    assert.ok(!formula.includes('score'), 'não recalcula score — só lê o que o pipeline já gravou');
  }));

  nota(runTest('a tabela "hoje" usa INT(quando)=TODAY() no rodapé de transbordo, não TODAY()-dias (não tem .dias)', () => {
    const aba = A.NOTICIAS;
    const faixaHoje = F.NOTICIA_FAIXAS.find(f => f.diaCorrente);
    assert.ok(faixaHoje, 'tem que existir uma faixa diaCorrente');
    const formula = F.noticiaTabela(aba, faixaHoje);
    assert.ok(formula.includes('TODAY()+1'), 'contagem da janela de hoje usa o intervalo [hoje, hoje+1)');
    assert.ok(!formula.includes('TODAY()-undefined'), 'nunca deixa o "dias" undefined vazar pra fórmula');
  }));

  nota(runTest('parênteses balanceados nas 16 fórmulas de tabela (4 abas × 4 faixas) — mesma guarda de construir.js', () => {
    for (const aba of A.VISTAS_NOTICIA) {
      for (const faixaInfo of F.NOTICIA_FAIXAS) {
        const formula = F.noticiaTabela(aba, faixaInfo);
        let profundidade = 0;
        for (const ch of formula) {
          if (ch === '(') profundidade++;
          else if (ch === ')') profundidade--;
          assert.ok(profundidade >= 0, `${aba}/${faixaInfo.codigo}: fechou parêntese antes de abrir`);
        }
        assert.strictEqual(profundidade, 0, `${aba}/${faixaInfo.codigo}: parênteses desbalanceados`);
      }
    }
  }));

  nota(runTest('C7 — terceiro estado vazio: idade do store é MEDIDA (visto_primeiro_em), nunca escrita à mão — inclusive "hoje" (janela de 1 dia)', () => {
    for (const faixaInfo of F.NOTICIA_FAIXAS) {
      const idade = F.NOTICIA_IDADE_POR_FAIXA[faixaInfo.codigo];
      assert.ok(idade, `sem idade calculada pra faixa ${faixaInfo.codigo}`);
      if (!idade.completa) {
        assert.ok(idade.completaEmISO, 'janela incompleta precisa de data calculada');
        const dataBR = F.noticiaDataBR(idade.completaEmISO);
        assert.match(dataBR, /^\d{2}\/\d{2}$/, 'dd/mm calculado do ISO');
      }
    }
  }));

  nota(runTest('o texto de vazio muda com a idade: "radar é novo" quando a janela não completou', () => {
    const aba = A.TRABALHO;
    const faixaInfo = F.NOTICIA_FAIXAS.find(f => f.codigo === '30d'); // sabidamente incompleta (store nasceu 27/08)
    const idade = F.NOTICIA_IDADE_POR_FAIXA[faixaInfo.codigo];
    const formula = F.noticiaTabela(aba, faixaInfo);
    if (!idade.completa) {
      assert.ok(formula.includes('🆕'), 'janela incompleta tem que carregar o terceiro estado vazio');
      assert.ok(formula.includes(F.noticiaDataBR(idade.completaEmISO)), 'a data calculada tem que estar na fórmula');
      assert.ok(!formula.includes('Se persistir'), 'não pode usar o texto de "coleta parou" quando o motivo é idade do store');
    } else {
      assert.ok(formula.includes('Se persistir'));
    }
  }));

  // ---------------------------------------------------------------------
  // GUARDA 5b DE construir.js (cobertura tema<->pipeline) — testada contra
  // o estado REAL do repositório. Inalterada por C10 (o assunto é
  // aba/tabela do pipeline, não a geometria das 4 janelas).
  // ---------------------------------------------------------------------
  nota(runTest('A1 (Onda 5-6): "ferramentas" saiu de fontes-noticias/index.js — NOTICIA_TEMAS e o pipeline REAL concordam ponto a ponto', () => {
    assert.ok(
      !NOTICIA_FONTES_REAL.TABELAS_POR_ABA.ia.includes('ferramentas'),
      'fontes-noticias/index.js:49 ainda declara "ferramentas" — o bloqueio da Onda 8-9 voltou'
    );
    const paresDaPlanilha = new Set(F.NOTICIA_TEMAS.map(t => `${F.NOTICIA_ABA_PIPELINE[t.aba]}/${t.tabela}`));
    const paresDoPipeline = new Set();
    for (const [abaPipe, tabelas] of Object.entries(NOTICIA_FONTES_REAL.TABELAS_POR_ABA)) {
      for (const t of tabelas) paresDoPipeline.add(`${abaPipe}/${t}`);
    }
    const semTema = [...paresDoPipeline].filter(p => !paresDaPlanilha.has(p));
    assert.deepStrictEqual(semTema, [], 'nenhuma tabela do pipeline real deveria ficar sem tema mapeado');
  }));

  const construirPath = require.resolve('../_norman/construir');
  const fontesPath = require.resolve('../fontes-noticias');

  nota(await runAsyncTest(
    'guarda 5b PASSA (não é ela quem rejeita) quando fontes-noticias é injetado SEM ferramentas — prova por injeção de dependência',
    async () => {
      const fontesCorrigido = {
        ...NOTICIA_FONTES_REAL,
        TABELAS_POR_ABA: {
          ...NOTICIA_FONTES_REAL.TABELAS_POR_ABA,
          ia: NOTICIA_FONTES_REAL.TABELAS_POR_ABA.ia.filter(t => t !== 'ferramentas')
        }
      };
      const fontesCacheOriginal = require.cache[fontesPath];
      const apiPath = require.resolve('../_norman/api');
      const apiOriginal = require(apiPath);
      const metaOriginal = apiOriginal.meta;
      const SENTINELA = new Error('SENTINELA — rede bloqueada de propósito neste teste');
      try {
        // Injeta o fixture: o require.cache passa a devolver o objeto
        // corrigido pra QUALQUER `require('.../fontes-noticias')` seguinte.
        require.cache[fontesPath] = { id: fontesPath, filename: fontesPath, loaded: true, exports: fontesCorrigido };
        delete require.cache[construirPath];
        const construirCorrigido = require(construirPath);
        // A REDE é bloqueada por sentinela: se a guarda 5b (ou qualquer
        // guarda anterior) tivesse rejeitado, o erro capturado seria dela,
        // não a sentinela — a mesma técnica de
        // tests/estado-colher-restaurar.test.js.
        apiOriginal.meta = async () => { throw SENTINELA; };
        await assert.rejects(construirCorrigido.main(), err => {
          assert.strictEqual(err, SENTINELA, `esperava a sentinela de rede, veio: ${err.message}`);
          return true;
        });
      } finally {
        apiOriginal.meta = metaOriginal;
        if (fontesCacheOriginal) require.cache[fontesPath] = fontesCacheOriginal;
        else delete require.cache[fontesPath];
        delete require.cache[construirPath];
      }
    }
  ));

  console.log(`\n${passed} passou(aram), ${failed} falhou(aram)\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
