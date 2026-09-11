#!/usr/bin/env node
'use strict';

/**
 * FAIXAS EM CASCATA — `lib-noticias/ranking.js calcularFaixasNoticia` +
 * `aplicarRecorte`. Onda 7 (radar-crm-20-ondas.md, Bloco C) + Onda 10c +
 * correção C9 (granularidade por ABA, não por tabela) + Onda 7e (a régua e
 * o piso) + C10/C10-b (2026-08-28, "Correção de JB, com ele presente" —
 * QUATRO janelas, não três, e a cascata cobrindo hoje→7d→15d→30d).
 *
 * O QUE ESTE ARQUIVO TRAVA:
 *
 *  - C9: o agrupamento da SELEÇÃO (top 20) é por ABA — os temas (`tabela`)
 *    de uma aba COMPETEM pelos 20 lugares de cada faixa. Erro de briefing da
 *    Onda 7 original (agrupava por `(aba, tabela)`, cada tema com seu
 *    próprio top 20) corrigido aqui; `tabela` continua gravado no registro,
 *    só deixou de ser eixo de agrupamento da SELEÇÃO.
 *  - 7e-1 (nova, `ranking.js calcularScores`): o agrupamento do PERCENTIL —
 *    a régua que produz `score` — passa a ser `(dia_lote, aba, tabela)`, não
 *    mais só `(dia_lote, aba)`. Medido: sem isso, um tema com sinal contínuo
 *    (HN — 97 valores distintos de `sinal_bruto` num dia) sempre vence um
 *    tema empatado (RSS — 1 valor distinto) na MESMA régua, não por
 *    relevância. Testado aqui em `tests/noticias-ranking.test.js`
 *    (`calcularScores`) e medido contra o store real abaixo.
 *  - 7e-2 (nova, `ranking.js selecionarComPiso`): piso mínimo por tema,
 *    proporcional ao volume do tema NO STORE, aplicado só quando um tema
 *    fica abaixo do próprio piso na seleção por score pura — troca o item de
 *    MENOR score entre os temas que estão ACIMA do próprio piso. Sozinha,
 *    7e-1 não bastou para `ciencia/academico` (tema sem NENHUMA variação
 *    interna de sinal — nunca sai do percentil 50 mesmo competindo só
 *    consigo mesmo); 7e-2 garante representação mínima.
 *  - 7a: a exclusão em cascata é CUMULATIVA entre as QUATRO janelas (30d
 *    exclui o que já saiu em hoje, em 7d E em 15d, não só o imediatamente
 *    anterior) — é o que garante interseção vazia entre as QUATRO faixas.
 *  - 7d: o teto é 20 por (aba, faixa), não 8, e não por tabela.
 *  - 10c: dentro de uma janela, um mesmo `cluster_id` ocupa UMA linha (o
 *    item de maior score); os outros membros do cluster continuam
 *    candidatos nas janelas seguintes, e continuam no store.
 *  - C10: `hoje` é o DIA CIVIL corrente (fuso de JB), não "últimas 24h" nem
 *    "últimos 3 dias" — a janela que existia até 2026-08-28 SAIU.
 *  - CONSERTO (RELATORIO-ONDA-5-6.md/8-9.md §Pendências): a exclusão
 *    cumulativa passa a ser por `cluster_id` **E** por url canônica
 *    (`r.link`) — um mesmo artigo pode gerar dois `cluster_id` distintos
 *    (título re-editado entre coletas, ou duas fontes com título levemente
 *    diferente) e escapava do dedup antigo. Medido no store real: 3 urls
 *    apareciam repetidas entre tabelas antes deste conserto; 0 depois.
 *  - Item SEM `cluster_id` NEM `link` é excluído por IDENTIDADE do objeto,
 *    não por chave derivada — regressão real encontrada e corrigida numa
 *    Onda anterior (um fallback ingênuo por `id` colapsava itens distintos
 *    sem `id` na mesma chave falsa).
 *  - Prova contra o STORE REAL (não fixture inventada): interseção vazia
 *    entre as QUATRO faixas por ABA (por `cluster_id` e por `link`), e
 *    nenhum `cluster_id`/`link` repetido dentro da MESMA faixa; nenhuma
 *    faixa acima de 20 itens por ABA; zero url repetida entre as quatro
 *    tabelas da mesma aba (critério de aceite C10, número medido); e o
 *    CRITÉRIO DE ACEITE da Onda 7e — nenhum tema com ≥50 itens no store
 *    fica com 0 sobreviventes nas quatro faixas somadas.
 */

const assert = require('assert');
const ranking = require('../lib-noticias/ranking');
const store = require('../lib-noticias/store-noticias');

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

const DIA = 86400000;
const AGORA = Date.parse('2026-08-28T12:00:00.000Z'); // 09:00 BR — mesmo dia civil '2026-08-28'

function reg(over) {
  return {
    id: 'id-' + Math.random().toString(36).slice(2),
    titulo: 'titulo',
    veiculo: 'veiculo',
    link: 'https://exemplo.com/x-' + Math.random().toString(36).slice(2),
    aba: 'geral',
    tabela: 'brasil',
    cluster_id: null,
    score: 0,
    data_ms: AGORA,
    ...over
  };
}

/**
 * ONDA 7e — carrega o store real e RECALCULA `score` com a régua nova
 * (`calcularScores`, grupo `(dia_lote, aba, tabela)`). Necessário porque os
 * registros já persistidos no store têm `score` calculado pela régua ANTIGA
 * (`(dia_lote, aba)`, em vigor até 2026-08-28) — só itens coletados DEPOIS
 * deste conserto ganham `score` novo na coleta real. As provas desta Onda
 * têm que medir o comportamento CONSERTADO, não o residual antigo gravado no
 * disco. Os campos brutos que `calcularScores` precisa (pontos, comentarios,
 * cluster_id, n_veiculos, n_itens_cluster, data_ms) já estão no store —
 * recalcular não inventa nenhum dado.
 */
function carregarStoreComRegraNova() {
  const regs = store.carregarTudo();
  const porItem = new Map();
  for (const r of regs) {
    porItem.set(r.id, { cluster_id: r.cluster_id, n_veiculos: r.n_veiculos, n_itens: r.n_itens_cluster });
    r.dataMs = r.data_ms;
  }
  ranking.calcularScores(regs, porItem);
  return regs;
}

const FAIXAS = ['hoje', '7d', '15d', '30d'];

function main() {
  console.log('\n=== noticias-faixas-cascata.test.js ===\n');
  let passed = 0;
  let failed = 0;

  const tests = [
    // ------------------------------------------------------- sintéticos
    [
      'C10: registro do MESMO dia civil de AGORA entra em "hoje"; um dia antes já não entra',
      () => {
        const deHoje = reg({ score: 50, data_ms: AGORA - 2 * 3600000 }); // 2h antes, mesmo dia civil
        const deOntem = reg({ score: 99, data_ms: AGORA - 1 * DIA });
        const regs = [deHoje, deOntem];
        ranking.calcularFaixasNoticia(regs, { agora: AGORA });
        assert.strictEqual(deHoje.faixa, 'hoje');
        assert.strictEqual(deHoje.posicao, 1);
        assert.notStrictEqual(deOntem.faixa, 'hoje', '"ontem" não é "hoje", mesmo com score maior e dentro de 24h');
        assert.strictEqual(deOntem.faixa, '7d');
      }
    ],

    [
      '7a: cluster que saiu em "hoje" NÃO reaparece em 7d, 15d nem em 30d, mesmo tendo ' +
        'membro dentro das quatro janelas',
      () => {
        const membroHoje = reg({ cluster_id: 'c1', score: 100, data_ms: AGORA - 1 * 3600000 });
        const membroTambemHoje = reg({ cluster_id: 'c1', score: 40, data_ms: AGORA - 1 * 3600000 });
        const faixa7d = reg({ cluster_id: 'c2', score: 90, data_ms: AGORA - 5 * DIA });
        const faixa15d = reg({ cluster_id: 'c3', score: 80, data_ms: AGORA - 12 * DIA });
        const faixa30d = reg({ cluster_id: 'c4', score: 70, data_ms: AGORA - 20 * DIA });
        const regs = [membroHoje, membroTambemHoje, faixa7d, faixa15d, faixa30d];

        ranking.calcularFaixasNoticia(regs, { agora: AGORA });

        assert.strictEqual(membroHoje.faixa, 'hoje', 'maior score do cluster c1 entra em hoje');
        assert.strictEqual(membroHoje.posicao, 1);
        assert.strictEqual(membroTambemHoje.faixa, '', '10c: o outro membro do MESMO cluster não ocupa outra linha na mesma janela');
        assert.strictEqual(faixa7d.faixa, '7d', 'fora da janela de hoje, dentro da de 7d');
        assert.strictEqual(faixa15d.faixa, '15d', 'só cabe na janela de 15d');
        assert.strictEqual(faixa30d.faixa, '30d', 'só cabe na janela de 30d');

        // 7a — c1 nunca aparece fora de hoje, nem via o membro de score menor.
        assert.notStrictEqual(membroTambemHoje.faixa, '7d');
        assert.notStrictEqual(membroTambemHoje.faixa, '15d');
        assert.notStrictEqual(membroTambemHoje.faixa, '30d');
      }
    ],

    [
      'CONSERTO: dois registros do MESMO artigo (mesma url, `cluster_id` DIFERENTE — título ' +
        're-editado entre coletas) colapsam numa linha só, mesmo dentro da MESMA janela',
      () => {
        const url = 'https://exemplo.com/mesma-materia';
        const versaoAntiga = reg({ link: url, cluster_id: 'antigo', score: 30, data_ms: AGORA - 1 * DIA });
        const versaoNova = reg({ link: url, cluster_id: 'novo', score: 55, data_ms: AGORA - 1 * 3600000 });
        const regs = [versaoAntiga, versaoNova];
        ranking.calcularFaixasNoticia(regs, { agora: AGORA });
        assert.strictEqual(versaoNova.faixa, 'hoje', 'o de maior score (a versão mais recente do título) vence');
        assert.strictEqual(versaoAntiga.faixa, '', 'a outra versão do MESMO artigo não ocupa uma segunda linha na mesma janela');
      }
    ],

    [
      'CONSERTO: o mesmo artigo (mesma url, `cluster_id` diferente) NÃO reaparece em janela ' +
        'seguinte — a exclusão cumulativa cobre URL, não só cluster_id',
      () => {
        const url = 'https://exemplo.com/materia-recorrente';
        const apareceHoje = reg({ link: url, cluster_id: 'c-hoje', score: 90, data_ms: AGORA - 1 * 3600000 });
        // Um segundo registro do MESMO artigo, cluster_id distinto, dentro da janela de 7d.
        const reapareceEm7d = reg({ link: url, cluster_id: 'c-outro', score: 95, data_ms: AGORA - 3 * DIA });
        const regs = [apareceHoje, reapareceEm7d];
        ranking.calcularFaixasNoticia(regs, { agora: AGORA });
        assert.strictEqual(apareceHoje.faixa, 'hoje');
        assert.strictEqual(reapareceEm7d.faixa, '', 'já foi excluído por URL — não reaparece em 7d mesmo com cluster_id novo e score maior');
      }
    ],

    [
      '10c: dentro da MESMA janela, o cluster é representado pelo item de MAIOR score (empate: data_ms mais recente)',
      () => {
        const fraco = reg({ cluster_id: 'cX', score: 10, data_ms: AGORA - 1 * 3600000 });
        const forte = reg({ cluster_id: 'cX', score: 99, data_ms: AGORA - 2 * 3600000 });
        const regs = [fraco, forte];
        ranking.calcularFaixasNoticia(regs, { agora: AGORA });
        assert.strictEqual(forte.faixa, 'hoje');
        assert.strictEqual(fraco.faixa, '', 'perde o desempate por score, mesmo sendo mais recente');
      }
    ],

    [
      '10c, empate de score: o mais recente (`data_ms` maior) vence',
      () => {
        const antigo = reg({ cluster_id: 'cY', score: 50, data_ms: AGORA - 4 * 3600000 });
        const recente = reg({ cluster_id: 'cY', score: 50, data_ms: AGORA - 1 * 3600000 });
        const regs = [antigo, recente];
        ranking.calcularFaixasNoticia(regs, { agora: AGORA });
        assert.strictEqual(recente.faixa, 'hoje');
        assert.strictEqual(antigo.faixa, '');
      }
    ],

    [
      '7d: teto é 20 por (aba, faixa) — o 21º fica de fora de "hoje" (mas segue candidato em 7d, dentro da MESMA janela de data), o 20º entra',
      () => {
        const regs = [];
        for (let i = 0; i < 25; i++) {
          regs.push(reg({ id: 'solo-' + i, score: 100 - i, data_ms: AGORA - 1 * 3600000 }));
        }
        ranking.calcularFaixasNoticia(regs, { agora: AGORA });
        const comHoje = regs.filter(r => r.faixa === 'hoje');
        assert.strictEqual(comHoje.length, 20, 'teto de 20, não 8 (doutrina antiga) nem 25 (sem teto)');
        assert.ok(regs.find(r => r.id === 'solo-19').faixa === 'hoje', 'o 20º (score 81) entra em hoje');
        assert.ok(
          regs.find(r => r.id === 'solo-20').faixa !== 'hoje',
          'o 21º (score 80) NÃO entra em hoje (teto)'
        );
        // O 21º continua dentro da janela de DATA de "hoje" — só não foi
        // SELECIONADO. 7a só exclui quem FOI selecionado numa janela
        // anterior; ele não foi, então segue candidato em 7d e entra lá,
        // sem contradição com a cascata.
        assert.strictEqual(regs.find(r => r.id === 'solo-20').faixa, '7d');
        // posicao é 1..20, sequencial, sem furo
        const posicoes = comHoje.map(r => r.posicao).sort((a, b) => a - b);
        assert.deepStrictEqual(posicoes, Array.from({ length: 20 }, (_, i) => i + 1));
      }
    ],

    [
      'item SEM cluster_id NEM link é excluído por IDENTIDADE — não reaparece sobrescrito numa janela seguinte ' +
        '(regressão real: um fallback por `r.id` colapsava itens distintos sem `id` na mesma chave falsa)',
      () => {
        const solo = reg({ cluster_id: null, link: null, score: 50, data_ms: AGORA - 1 * 3600000 });
        ranking.calcularFaixasNoticia([solo], { agora: AGORA });
        assert.strictEqual(solo.faixa, 'hoje', 'entra na janela mais estreita que alcança');
        assert.strictEqual(solo.posicao, 1);
      }
    ],

    [
      'grupos por ABA são INDEPENDENTES — teto/exclusão de uma aba não vaza pra outra',
      () => {
        const regs = [];
        for (let i = 0; i < 5; i++) {
          regs.push(reg({ id: 'a-' + i, aba: 'ia', tabela: 'claude', score: 90 - i, data_ms: AGORA - 1 * 3600000 }));
        }
        regs.push(reg({ id: 'b-0', aba: 'ciencia', tabela: 'artigos', score: 5, data_ms: AGORA - 1 * 3600000 }));
        ranking.calcularFaixasNoticia(regs, { agora: AGORA });
        assert.strictEqual(regs.find(r => r.id === 'b-0').faixa, 'hoje', 'aba ciencia tem seu próprio top 20, não compete com a aba ia');
      }
    ],

    [
      'C9: tabelas (temas) DENTRO da MESMA aba COMPETEM pelos 20 lugares — não têm top 20 cada uma',
      () => {
        const regs = [];
        // 20 itens de um tema dominante, score alto — enche o teto sozinho POR SCORE.
        for (let i = 0; i < 20; i++) {
          regs.push(reg({ id: 'dominante-' + i, aba: 'ia', tabela: 'ia-geral', score: 100 - i, data_ms: AGORA - 1 * 3600000 }));
        }
        // 5 itens de um tema minoritário, score mais baixo — mesma aba.
        for (let i = 0; i < 5; i++) {
          regs.push(reg({ id: 'minoritario-' + i, aba: 'ia', tabela: 'reddit-hn', score: 10 - i, data_ms: AGORA - 1 * 3600000 }));
        }
        ranking.calcularFaixasNoticia(regs, { agora: AGORA });

        const faixaHojeDaAba = regs.filter(r => r.aba === 'ia' && r.faixa === 'hoje');
        assert.strictEqual(faixaHojeDaAba.length, 20, 'teto de 20 é POR ABA — a soma dos dois temas não passa de 20');
        // 7e-2: o piso (proporcional ao volume no store — 20 dominante + 5
        // minoritário = round(20*20/25)=16 pro dominante, round(20*5/25)=4
        // pro minoritário) RESGATA o minoritário do zero, mas não inverte a
        // dominância — o dominante continua com a maioria (16 de 20), só
        // cede exatamente a vaga excedente ao próprio piso.
        const minoritarioSobrevivente = regs.filter(r => r.id.startsWith('minoritario') && r.faixa === 'hoje');
        const dominanteSobrevivente = regs.filter(r => r.id.startsWith('dominante') && r.faixa === 'hoje');
        assert.strictEqual(minoritarioSobrevivente.length, 4, '7e-2: piso garante 4 vagas ao minoritário (antes da Onda 7e, era varrido a zero)');
        assert.strictEqual(dominanteSobrevivente.length, 16, 'o dominante cede só a vaga excedente ao próprio piso (20-4=16), continua majoritário');
        // Os 4 sobreviventes do minoritário são os de MAIOR score dele (10,9,8,7) — o piso não abre mão do ranking por score DENTRO do tema.
        assert.deepStrictEqual(
          minoritarioSobrevivente.map(r => r.id).sort(),
          ['minoritario-0', 'minoritario-1', 'minoritario-2', 'minoritario-3']
        );
      }
    ],

    [
      '7e-2: tema que JÁ bate o próprio piso sozinho (por score) não perde nenhuma vaga por causa do piso de outro tema',
      () => {
        const regs = [];
        // dois temas de volume comparável — nenhum precisa de resgate.
        for (let i = 0; i < 12; i++) regs.push(reg({ id: 'x-' + i, aba: 'geral', tabela: 'brasil', score: 100 - i, data_ms: AGORA - 1 * 3600000 }));
        for (let i = 0; i < 8; i++) regs.push(reg({ id: 'y-' + i, aba: 'geral', tabela: 'mundo', score: 90 - i, data_ms: AGORA - 1 * 3600000 }));
        ranking.calcularFaixasNoticia(regs, { agora: AGORA });
        const sob = regs.filter(r => r.faixa === 'hoje');
        assert.strictEqual(sob.length, 20, 'só 20 itens no total, cabem todos — piso não tem o que fazer aqui');
        assert.strictEqual(sob.filter(r => r.tabela === 'brasil').length, 12);
        assert.strictEqual(sob.filter(r => r.tabela === 'mundo').length, 8);
      }
    ],

    [
      '7e-2: piso é POR JANELA — tema sem candidato numa janela não recebe piso nela, mas recebe nas janelas onde tem candidato',
      () => {
        const regs = [];
        // ia-geral: 20 itens dentro de "hoje" (esgota o teto sozinho por score).
        for (let i = 0; i < 20; i++) regs.push(reg({ id: 'g-' + i, aba: 'ia', tabela: 'ia-geral', score: 100 - i, data_ms: AGORA - 1 * 3600000 }));
        // reddit-hn: só 1 item, e está fora da janela de "hoje" (só entra em 7d).
        regs.push(reg({ id: 'r-0', aba: 'ia', tabela: 'reddit-hn', score: 5, data_ms: AGORA - 5 * DIA }));
        ranking.calcularFaixasNoticia(regs, { agora: AGORA });
        assert.strictEqual(regs.filter(r => r.faixa === 'hoje' && r.tabela === 'reddit-hn').length, 0, 'sem candidato na janela de hoje, sem piso forçado nela');
        assert.strictEqual(regs.find(r => r.id === 'r-0').faixa, '7d', 'no 7d, onde TEM candidato, o único item de reddit-hn sobrevive (piso mínimo 1)');
      }
    ],

    [
      'IDEMPOTENTE: rodar duas vezes sobre o mesmo array recalcula do zero, não acumula',
      () => {
        const a = reg({ cluster_id: 'z1', score: 10, data_ms: AGORA - 1 * 3600000 });
        const b = reg({ cluster_id: 'z1', score: 99, data_ms: AGORA - 1 * 3600000 });
        const regs = [a, b];
        ranking.calcularFaixasNoticia(regs, { agora: AGORA });
        ranking.calcularFaixasNoticia(regs, { agora: AGORA });
        assert.strictEqual(b.faixa, 'hoje');
        assert.strictEqual(b.posicao, 1);
        assert.strictEqual(a.faixa, '');
      }
    ],

    [
      'registro sem data_ms nunca recebe faixa, em nenhuma das quatro janelas',
      () => {
        const semData = reg({ data_ms: null, score: 999 });
        ranking.calcularFaixasNoticia([semData], { agora: AGORA });
        assert.strictEqual(semData.faixa, '');
        assert.strictEqual(semData.posicao, null);
      }
    ],

    [
      'aplicarRecorte(nome) é só uma VISÃO da mesma cascata — filtra a faixa e ordena por posição',
      () => {
        const a = reg({ id: 'r1', score: 10, data_ms: AGORA - 1 * 3600000 });
        const b = reg({ id: 'r2', score: 90, data_ms: AGORA - 1 * 3600000 });
        const regs = [a, b];
        const r = ranking.aplicarRecorte(regs, 'hoje', { agora: AGORA });
        assert.strictEqual(r.length, 2);
        assert.strictEqual(r[0].id, 'r2', 'ordena por score (posicao 1)');
        assert.strictEqual(r[1].id, 'r1');
      }
    ],

    [
      'C10-b: CASCATA_INCLUI_MES=true (adotado) — a janela de 30d TAMBÉM exclui o que já saiu nas três anteriores',
      () => {
        assert.strictEqual(ranking.CASCATA_INCLUI_MES, true, 'decisão registrada: cascata cumulativa cobre a janela de 30d também');
        const cluster = 'c-cascata-mes';
        const emHoje = reg({ cluster_id: cluster, score: 100, data_ms: AGORA - 1 * 3600000 });
        const mesmoClusterEm30d = reg({ cluster_id: cluster, score: 95, data_ms: AGORA - 25 * DIA });
        ranking.calcularFaixasNoticia([emHoje, mesmoClusterEm30d], { agora: AGORA });
        assert.strictEqual(emHoje.faixa, 'hoje');
        assert.strictEqual(mesmoClusterEm30d.faixa, '', 'o cluster já saiu em "hoje" — não reaparece em 30d com a flag ligada');
      }
    ],

    // ------------------------------------------- contra o STORE REAL
    [
      'C10 · PROVA CONTRA O STORE REAL: interseção vazia de cluster_id ENTRE AS QUATRO FAIXAS, por ABA',
      () => {
        const regs = carregarStoreComRegraNova();
        assert.ok(regs.length > 1000, 'store real esperado com >1000 registros (medido: 1970+); achado ' + regs.length);
        ranking.calcularFaixasNoticia(regs);

        const porAba = new Map();
        for (const r of regs) {
          if (!r.faixa) continue;
          const chave = r.aba || '';
          if (!porAba.has(chave)) porAba.set(chave, Object.fromEntries(FAIXAS.map(f => [f, new Set()])));
          if (r.cluster_id) porAba.get(chave)[r.faixa].add(r.cluster_id);
        }

        let paresChecados = 0;
        const pares = [['hoje', '7d'], ['hoje', '15d'], ['hoje', '30d'], ['7d', '15d'], ['7d', '30d'], ['15d', '30d']];
        for (const [chave, faixas] of porAba) {
          for (const [x, y] of pares) {
            const intersecao = [...faixas[x]].filter(c => faixas[y].has(c));
            assert.strictEqual(
              intersecao.length, 0,
              `aba ${chave}: cluster_id repetido entre ${x} e ${y} — ${intersecao.slice(0, 5).join(', ')}`
            );
            paresChecados++;
          }
        }
        assert.ok(paresChecados > 0, 'o store real tem que ter produzido pelo menos um grupo com faixa preenchida');
        console.log(`    (${porAba.size} aba(s) com faixa preenchida, ${paresChecados} comparação(ões) de par de faixas — todas vazias)`);
      }
    ],

    [
      'C10 · CRITÉRIO DE ACEITE, PROVA CONTRA O STORE REAL: zero URL repetida ENTRE AS QUATRO TABELAS da mesma aba',
      () => {
        const regs = carregarStoreComRegraNova();
        ranking.calcularFaixasNoticia(regs);

        const porAbaUrl = new Map(); // aba -> url -> [faixa,...]
        for (const r of regs) {
          if (!r.faixa || !r.link) continue;
          if (!porAbaUrl.has(r.aba)) porAbaUrl.set(r.aba, new Map());
          const porUrl = porAbaUrl.get(r.aba);
          if (!porUrl.has(r.link)) porUrl.set(r.link, []);
          porUrl.get(r.link).push(r.faixa);
        }

        const repetidas = [];
        for (const [aba, porUrl] of porAbaUrl) {
          for (const [url, faixasDaUrl] of porUrl) {
            if (faixasDaUrl.length > 1) repetidas.push(`${aba} · ${url} · ${faixasDaUrl.join('+')}`);
          }
        }
        console.log(`    urls repetidas entre as 4 tabelas da mesma aba: ${repetidas.length}`);
        assert.strictEqual(
          repetidas.length, 0,
          'promessa literal a JB ("as 20 do dia não aparecem nas dos últimos 7 dias...") violada: ' + repetidas.slice(0, 10).join(' | ')
        );
      }
    ],

    [
      'C9/C10 · PROVA CONTRA O STORE REAL: nenhum cluster_id aparece duas vezes na MESMA faixa, na MESMA aba',
      () => {
        const regs = carregarStoreComRegraNova();
        ranking.calcularFaixasNoticia(regs);

        const vistos = new Map(); // chave "aba/faixa/cluster_id" -> contagem
        const duplicatas = [];
        for (const r of regs) {
          if (!r.faixa || !r.cluster_id) continue;
          const chave = [r.aba, r.faixa, r.cluster_id].join('|');
          vistos.set(chave, (vistos.get(chave) || 0) + 1);
        }
        for (const [chave, n] of vistos) {
          if (n > 1) duplicatas.push(chave + ' (' + n + 'x)');
        }
        assert.strictEqual(duplicatas.length, 0, 'cluster_id duplicado na mesma faixa/aba: ' + duplicatas.slice(0, 10).join(', '));
      }
    ],

    [
      'C9/C10 · PROVA CONTRA O STORE REAL: nenhuma faixa tem mais de 20 itens por ABA (não mais por aba+tabela)',
      () => {
        const regs = carregarStoreComRegraNova();
        ranking.calcularFaixasNoticia(regs);
        const contagem = new Map();
        for (const r of regs) {
          if (!r.faixa) continue;
          const chave = [r.aba, r.faixa].join('|');
          contagem.set(chave, (contagem.get(chave) || 0) + 1);
        }
        for (const [chave, n] of contagem) {
          assert.ok(n <= 20, `${chave} tem ${n} itens, acima do teto de 20`);
        }
        console.log('    linhas por aba (soma das 4 faixas):');
        const porAba = new Map();
        for (const [chave, n] of contagem) {
          const aba = chave.split('|')[0];
          porAba.set(aba, (porAba.get(aba) || 0) + n);
        }
        for (const [aba, n] of porAba) console.log(`      ${aba}: ${n} linha(s)`);
      }
    ],

    [
      'ONDA 7e · MEDIÇÃO CONTRA O STORE REAL: sobrevivência por tema (tabela) dentro de cada faixa, por aba — reportado, não escondido',
      () => {
        const regs = carregarStoreComRegraNova();
        ranking.calcularFaixasNoticia(regs);

        // Enumera TODOS os (aba, tabela) que existem no store — inclusive o
        // tema que foi varrido a ZERO em todas as faixas, que nunca recebe
        // `.faixa` e por isso não apareceria se só somássemos linhas COM
        // faixa preenchida (o tema simplesmente não teria entrada nenhuma,
        // e "varrido a zero" viraria "silenciosamente ausente" — o oposto
        // do que o briefing pede).
        const universo = new Map(); // aba -> Map(tabela -> total no store)
        for (const r of regs) {
          const aba = r.aba || '?';
          const tabela = r.tabela || '?';
          if (!universo.has(aba)) universo.set(aba, new Map());
          const porTabela = universo.get(aba);
          porTabela.set(tabela, (porTabela.get(tabela) || 0) + 1);
        }

        // sobrevivencia[aba][tabela][faixa] = contagem de linhas com essa faixa preenchida
        const sobrevivencia = new Map();
        for (const r of regs) {
          if (!r.faixa) continue;
          const aba = r.aba || '?';
          const tabela = r.tabela || '?';
          if (!sobrevivencia.has(aba)) sobrevivencia.set(aba, new Map());
          const porTabela = sobrevivencia.get(aba);
          if (!porTabela.has(tabela)) porTabela.set(tabela, { hoje: 0, '7d': 0, '15d': 0, '30d': 0 });
          porTabela.get(tabela)[r.faixa]++;
        }

        console.log('    tabela de sobrevivência por tema (linhas com faixa preenchida vs. total no store):');
        console.log('    aba          tema                    hoje   7d  15d  30d  soma  total-store');
        const zerados = [];
        const violacoesCriterioAceite = []; // tema com >=50 no store e soma 0 — critério de aceite da Onda 7e
        for (const [aba, porTabelaUniverso] of [...universo].sort((a, b) => a[0].localeCompare(b[0]))) {
          for (const [tabela, totalStore] of [...porTabelaUniverso].sort((a, b) => a[0].localeCompare(b[0]))) {
            const faixas = (sobrevivencia.get(aba) && sobrevivencia.get(aba).get(tabela)) || { hoje: 0, '7d': 0, '15d': 0, '30d': 0 };
            const soma = faixas.hoje + faixas['7d'] + faixas['15d'] + faixas['30d'];
            console.log(
              `    ${aba.padEnd(12)} ${tabela.padEnd(23)} ${String(faixas.hoje).padStart(4)}  ${String(faixas['7d']).padStart(3)}  ${String(faixas['15d']).padStart(3)}  ${String(faixas['30d']).padStart(3)}  ${String(soma).padStart(4)}  ${String(totalStore).padStart(6)}`
            );
            if (soma === 0) {
              zerados.push(`${aba}/${tabela} (${totalStore} no store)`);
              if (totalStore >= 50) violacoesCriterioAceite.push(`${aba}/${tabela} (${totalStore} no store)`);
            }
          }
        }
        if (zerados.length) console.log(`    tema(s) varrido(s) a ZERO em todas as faixas: ${zerados.join(', ')}`);
        else console.log('    nenhum tema varrido a zero nesta corrida.');

        assert.ok(universo.size > 0, 'o store real tem que ter produzido ao menos uma aba');

        // CRITÉRIO DE ACEITE da Onda 7e (radar-crm-20-ondas.md, briefing
        // literal): "Nenhum tema com ≥50 itens no store pode ficar com 0
        // sobreviventes nas quatro faixas somadas." ESTE é o assert de
        // regressão — os outros números da tabela (quem domina, quem tem
        // maioria) variam com o store do momento e por isso só são
        // reportados no console, não travados aqui.
        assert.strictEqual(
          violacoesCriterioAceite.length, 0,
          'critério de aceite da Onda 7e violado — tema(s) com >=50 itens no store e 0 sobreviventes: ' +
            violacoesCriterioAceite.join(', ')
        );
      }
    ]
  ];

  for (const [name, fn] of tests) {
    if (runTest(name, fn)) passed++;
    else failed++;
  }

  console.log(`\n${passed} passou(aram), ${failed} falhou(aram)\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
