#!/usr/bin/env node
'use strict';

/**
 * Clusterização de fato repetido — `lib-noticias/cluster.js`.
 *
 * Os quatro predicados, um a um: janela temporal (±36h), interseção de
 * âncoras, domínios diferentes, Jaccard acima do limiar. Mais as duas
 * fronteiras que o cluster NUNCA cruza (aba e idioma) e o segundo limiar,
 * mais alto, para republicação dentro do mesmo veículo.
 *
 * Sem rede. Todo `dataMs` é epoch fixo — nenhum teste depende do relógio.
 */

const assert = require('assert');
const cluster = require('../lib-noticias/cluster');
const { extrairAncoras, jaccard } = require('../lib-noticias/ancoras');

const T0 = Date.parse('2026-08-27T12:00:00.000Z');
const HORA = 3600000;

/** Monta um item do formato que `clusterizar` consome, com as âncoras já extraídas do título real. */
function item(id, titulo, dominio, horasOffset, extra = {}) {
  return {
    id,
    titulo,
    dominio,
    dataMs: T0 + horasOffset * HORA,
    aba: 'geral',
    idioma: 'pt',
    ancoras: extrairAncoras(titulo).ancoras,
    ...extra
  };
}

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

/** `true` se os dois ids caíram no mesmo cluster. */
function juntos(resultado, idA, idB) {
  const a = resultado.porItem.get(idA);
  const b = resultado.porItem.get(idB);
  return Boolean(a && b && a.cluster_id === b.cluster_id);
}

function main() {
  console.log('\n=== noticias-cluster.test.js ===\n');
  let passed = 0;
  let failed = 0;

  // Dois veículos cobrindo o mesmo fato — o caso que o método existe para pegar.
  const A = item('a', 'Lula entra no TSE contra Renan Santos por ofensa a honra', 'globo.com', 0);
  const B = item('b', 'Lula vai ao TSE contra Renan Santos e pede retirada de posts', 'folha.com.br', 2);

  const tests = [
    ['dois veículos, mesmo fato, dentro da janela: FORMA cluster com n_veiculos = 2', () => {
      const r = cluster.clusterizar([A, B], { limiarJaccard: 0.34 });
      assert.ok(juntos(r, 'a', 'b'));
      assert.strictEqual(r.porItem.get('a').n_veiculos, 2);
      assert.deepStrictEqual(r.porItem.get('a').dominios.slice().sort(), ['folha.com.br', 'globo.com']);
    }],

    // ----------------------------------------------------- janela temporal
    ['JANELA TEMPORAL: o mesmo par a 40h de distância NÃO liga (limite de 36h)', () => {
      const B40 = { ...B, dataMs: T0 + 40 * HORA };
      const r = cluster.clusterizar([A, B40], { limiarJaccard: 0.34, janelaHoras: 36 });
      assert.strictEqual(juntos(r, 'a', 'b'), false);
    }],

    ['JANELA TEMPORAL: a 35h liga; a 37h não. O corte é onde diz que é', () => {
      const dentro = cluster.clusterizar([A, { ...B, dataMs: T0 + 35 * HORA }], {
        limiarJaccard: 0.34,
        janelaHoras: 36
      });
      const fora = cluster.clusterizar([A, { ...B, dataMs: T0 + 37 * HORA }], {
        limiarJaccard: 0.34,
        janelaHoras: 36
      });
      assert.strictEqual(juntos(dentro, 'a', 'b'), true);
      assert.strictEqual(juntos(fora, 'a', 'b'), false);
    }],

    ['JANELA TEMPORAL é simétrica: 20h antes liga igual a 20h depois', () => {
      const antes = cluster.clusterizar([A, { ...B, dataMs: T0 - 20 * HORA }], { limiarJaccard: 0.34 });
      assert.strictEqual(juntos(antes, 'a', 'b'), true);
    }],

    ['item SEM data não liga com ninguém (sem data não há como afirmar "mesma janela")', () => {
      const semData = { ...B, dataMs: null };
      const r = cluster.clusterizar([A, semData], { limiarJaccard: 0.34 });
      assert.strictEqual(juntos(r, 'a', 'b'), false);
    }],

    // ---------------------------------------------------------- limiar
    ['CONTROLE: o par A/B tem conjuntos de âncoras IDÊNTICOS, logo Jaccard = 1', () => {
      // Este controle existe porque a primeira versão deste arquivo testou o
      // limiar contra A/B e falhou: os dois títulos, apesar de redigidos
      // diferente, extraem exatamente {lula, tse, renan, santos}. J=1 não é
      // rejeitado por limiar nenhum <= 1. O teste de limiar abaixo usa um par
      // de sobreposição PARCIAL — sem este controle, alguém repetiria o erro.
      assert.strictEqual(jaccard(A.ancoras, B.ancoras), 1);
    }],

    ['LIMIAR configurável: par de sobreposição parcial liga com 0,15 e não liga com 0,50', () => {
      // D3 compartilha 2 âncoras com A ({lula, renan}) — não 1, para não cair
      // no piso de interseção absoluta do CONSERTO 1 (ver
      // noticias-cluster.test.js "CONSERTO 1" abaixo, e cluster.js
      // PISO_INTERSECAO_ABSOLUTA). Interseção=1 é precisamente o padrão que
      // aquele conserto elimina; usá-lo aqui testaria um caso que o piso
      // sempre bloqueia, mascarando os dois mecanismos.
      const D3 = item('d3', 'Lula e Renan participam de agenda no Congresso Nacional', 'folha.com.br', 1);
      const j = jaccard(A.ancoras, D3.ancoras);
      assert.ok(j > 0.15 && j < 0.5, 'controle: Jaccard=' + j.toFixed(3) + ' precisa cair entre os dois limiares');
      const inter = require('../lib-noticias/ancoras').contarIntersecao(A.ancoras, D3.ancoras);
      assert.ok(inter >= 2, 'controle: interseção=' + inter + ' precisa passar no piso do CONSERTO 1');

      const frouxo = cluster.clusterizar([A, D3], { limiarJaccard: 0.15 });
      const rigido = cluster.clusterizar([A, D3], { limiarJaccard: 0.5 });
      assert.strictEqual(juntos(frouxo, 'a', 'd3'), true);
      assert.strictEqual(juntos(rigido, 'a', 'd3'), false);
    }],

    ['o limiar usado volta em `parametros` — o relatório não precisa adivinhar qual rodou', () => {
      const r = cluster.clusterizar([A, B], { limiarJaccard: 0.42, janelaHoras: 24 });
      assert.strictEqual(r.parametros.limiarJaccard, 0.42);
      assert.strictEqual(r.parametros.janelaHoras, 24);
    }],

    // ----------------------------------------------------- domínio
    ['DOMÍNIOS DIFERENTES: mesmo veículo com Jaccard médio NÃO liga pelo limiar inter', () => {
      // Jaccard alto o bastante pro limiar inter (0,34) e baixo pro intra (0,60).
      const X = item('x', 'Governo anuncia pacote para Educacao no Congresso', 'globo.com', 0);
      const Y = item('y', 'Congresso reage ao pacote do Governo sobre Saude', 'globo.com', 1);
      const j = jaccard(X.ancoras, Y.ancoras);
      assert.ok(
        j >= 0.34 && j < 0.6,
        'controle do teste: Jaccard=' + j.toFixed(3) + ' tem que cair entre os dois limiares'
      );
      const r = cluster.clusterizar([X, Y], { limiarJaccard: 0.34, limiarJaccardIntra: 0.6 });
      assert.strictEqual(juntos(r, 'x', 'y'), false, 'mesmo domínio exige o limiar mais alto');
    }],

    ['n_veiculos conta DOMÍNIO distinto, não item: 3 itens de 2 domínios = 2 veículos', () => {
      const C = item('c', 'Lula vai ao TSE contra Renan Santos nesta quinta', 'folha.com.br', 3);
      const r = cluster.clusterizar([A, B, C], { limiarJaccard: 0.3, limiarJaccardIntra: 0.3 });
      const cl = r.porItem.get('a');
      assert.strictEqual(cl.n_itens, 3);
      assert.strictEqual(cl.n_veiculos, 2);
    }],

    ['ACHADO PREVISTO: republicação do MESMO veículo funde pelo limiar intra, sem inflar n_veiculos', () => {
      const P1 = item('p1', 'Concurso Camara de Rio Branco: IDIB e a banca para 15 vagas', 'exemplo.com.br', 0);
      const P2 = item('p2', 'Concurso Camara de Rio Branco: banca definida para 15 vagas', 'exemplo.com.br', 20);
      const r = cluster.clusterizar([P1, P2], { limiarJaccard: 0.34, limiarJaccardIntra: 0.6 });
      assert.strictEqual(juntos(r, 'p1', 'p2'), true, 'é o mesmo fato — o reconhecimento diz que agrupar está certo');
      assert.strictEqual(r.porItem.get('p1').n_veiculos, 1, 'mas continua sendo UM veículo');
      assert.strictEqual(r.fusoesIntraDominio, 1, 'a fusão é contada, não silenciosa');
    }],

    // --------------------------------------------- fronteiras que não cruza
    ['CLUSTER NÃO CRUZA IDIOMA (decisão de Durin) — mesmo com âncoras idênticas', () => {
      const pt = { ...item('pt1', 'Trump anuncia tarifa sobre Brasil', 'globo.com', 0), idioma: 'pt' };
      const en = { ...item('en1', 'Trump anuncia tarifa sobre Brasil', 'nytimes.com', 1), idioma: 'en' };
      const r = cluster.clusterizar([pt, en], { limiarJaccard: 0.1 });
      assert.strictEqual(juntos(r, 'pt1', 'en1'), false);
      assert.strictEqual(r.porItem.get('pt1').n_veiculos, 1);
      assert.strictEqual(r.porItem.get('en1').n_veiculos, 1);
    }],

    ['CLUSTER NÃO CRUZA ABA — o mesmo título em `geral` e em `ia` são dois clusters', () => {
      const g = { ...item('g1', 'Empresa lanca modelo Claude para agentes', 'globo.com', 0), aba: 'geral' };
      const i = { ...item('i1', 'Empresa lanca modelo Claude para agentes', 'techcrunch.com', 1), aba: 'ia' };
      const r = cluster.clusterizar([g, i], { limiarJaccard: 0.1 });
      assert.strictEqual(juntos(r, 'g1', 'i1'), false);
    }],

    // --------------------------------------------------------- estrutura
    ['item solitário também recebe cluster_id (cluster de 1) — nunca null', () => {
      const solo = item('s', 'Fato unico sem cobertura de mais ninguem', 'exemplo.com', 0);
      const r = cluster.clusterizar([solo], {});
      const cl = r.porItem.get('s');
      assert.ok(cl && cl.cluster_id);
      assert.strictEqual(cl.n_itens, 1);
      assert.strictEqual(cl.n_veiculos, 1);
    }],

    ['cluster_id é determinístico e independente da ordem de entrada', () => {
      const r1 = cluster.clusterizar([A, B], { limiarJaccard: 0.34 });
      const r2 = cluster.clusterizar([B, A], { limiarJaccard: 0.34 });
      assert.strictEqual(r1.porItem.get('a').cluster_id, r2.porItem.get('a').cluster_id);
    }],

    ['gerarClusterId muda quando a composição muda — e isso é honesto, não bug', () => {
      const dois = cluster.gerarClusterId(['a', 'b']);
      const tres = cluster.gerarClusterId(['a', 'b', 'c']);
      assert.notStrictEqual(dois, tres);
      assert.strictEqual(cluster.gerarClusterId(['b', 'a']), dois, 'ordem não importa');
    }],

    // ------------------------------------------------------- distribuição
    ['distribuicaoJaccard registra TODOS os pares candidatos, inclusive os que NÃO ligaram', () => {
      // É esta propriedade que torna a calibração possível: se só os pares
      // que ligaram fossem registrados, a distribuição seria censurada
      // exatamente na região onde o limiar precisa ser decidido.
      const D = item('d', 'Lula participa de entrevista da Globo nesta quinta-feira', 'folha.com.br', 1);
      const r = cluster.clusterizar([A, D], { limiarJaccard: 0.5 });
      assert.ok(r.distribuicaoJaccard.length >= 1, 'o par candidato existe mesmo sem ligar');
      assert.strictEqual(r.distribuicaoJaccard[0].ligou, false);
      assert.ok(r.distribuicaoJaccard[0].valor > 0);
      assert.strictEqual(r.distribuicaoJaccard[0].tipo, 'inter');
      assert.strictEqual(juntos(r, 'a', 'd'), false, 'confirma que o par de fato não ligou');
    }],

    ['par sem âncora em comum nem entra na distribuição (o índice invertido garante o predicado 2)', () => {
      const X = item('x2', 'Petrobras anuncia investimento em Macae', 'globo.com', 0);
      const Y = item('y2', 'Selecao convoca jogadores para amistoso na Colombia', 'folha.com.br', 1);
      const r = cluster.clusterizar([X, Y], { limiarJaccard: 0.34 });
      assert.strictEqual(r.distribuicaoJaccard.length, 0);
      assert.strictEqual(juntos(r, 'x2', 'y2'), false);
    }],

    ['histogramaJaccard separa inter e intra e conserva a contagem dentro de cada tipo', () => {
      const h = cluster.histogramaJaccard([
        { tipo: 'inter', valor: 0.1 },
        { tipo: 'inter', valor: 0.12 },
        { tipo: 'inter', valor: 0.9 },
        { tipo: 'intra', valor: 0.5 }
      ]);
      assert.strictEqual(h.totais.inter, 3);
      assert.strictEqual(h.totais.intra, 1);
      assert.strictEqual(h.inter.reduce((acc, f) => acc + f.n, 0), 3);
    }],

    ['lista vazia não quebra', () => {
      const r = cluster.clusterizar([], {});
      assert.deepStrictEqual(r.clusters, []);
      assert.strictEqual(r.distribuicaoJaccard.length, 0);
    }],

    // ------------------------------------- CONSERTO 1: piso de interseção
    ['CONSERTO 1 — ERRO 2 REPRODUZIDO E FECHADO: |A∩B|=1 com J=0,50 NÃO liga mais no piso padrão', () => {
      // Caso real da prova de clustering (tmp/prova-noticias-2.log): o
      // tarifaço agrupava com a revogação de vistos só porque os dois
      // títulos compartilham a âncora solta "eua".
      const tarifaco = item('tarifaco', 'Governo não espera solução rápida para tarifaço, mesmo com a volta das negociações com os EUA', 'globo.com', 0);
      const vistos = item('vistos', 'EUA iniciam ondas de revogação dos vistos de pessoas que pediram asilo', 'folha.com.br', 2);
      assert.strictEqual(jaccard(tarifaco.ancoras, vistos.ancoras), 0.5, 'controle: J alto por construção');

      const padrao = cluster.clusterizar([tarifaco, vistos], { limiarJaccard: 0.34 });
      assert.strictEqual(juntos(padrao, 'tarifaco', 'vistos'), false, 'piso padrão (2) bloqueia a interseção de 1');

      const semPiso = cluster.clusterizar([tarifaco, vistos], { limiarJaccard: 0.34, pisoIntersecao: 1 });
      assert.strictEqual(juntos(semPiso, 'tarifaco', 'vistos'), true, 'com piso=1 (comportamento antigo) o par volta a ligar — prova que o piso é a causa');
    }],

    ['CONSERTO 1: piso é configurável e volta em `parametros`, no padrão do `limiarJaccard`', () => {
      const r = cluster.clusterizar([A, B], { limiarJaccard: 0.34, pisoIntersecao: 3 });
      assert.strictEqual(r.parametros.pisoIntersecao, 3);
    }],

    ['CONSERTO 1: piso NÃO bloqueia par legítimo com interseção >= 2 (controle negativo)', () => {
      // Mesmo par usado no teste de limiar configurável — interseção = 2
      // ({lula, renan}) — não pode ser afetado pelo piso padrão.
      const D3 = item('d3b', 'Lula e Renan participam de agenda no Congresso Nacional', 'folha.com.br', 1);
      const r = cluster.clusterizar([A, D3], { limiarJaccard: 0.15 });
      assert.strictEqual(juntos(r, 'a', 'd3b'), true);
    }],

    // ------------------------------- CONSERTO 2: representante do cluster
    ['CONSERTO 2 — TRANSITIVIDADE REPRODUZIDA E FECHADA: A~B e B~C ligam, mas A e C não têm NADA em comum — C fica de fora', () => {
      // A e B compartilham {motta, alcolumbre}; B e C compartilham
      // {planalto, ministerio}; A e C não compartilham NENHUMA âncora
      // (jaccard = 0, interseção = 0) — a corrente de amigos clássica do
      // union-find que produziu o cluster de 17 itens de "eleições" na
      // prova de clustering.
      const congA = item('conga', 'Congresso aprova texto com Motta e Alcolumbre', 'globo.com', 0);
      const planB = item('planb', 'Motta e Alcolumbre discutem pauta com Planalto e Ministerio', 'folha.com.br', 1);
      const educC = item('naoeducc', 'Planalto e Ministerio anunciam parceria para Educacao', 'bbc.com', 2);

      assert.ok(jaccard(congA.ancoras, planB.ancoras) >= 0.34, 'controle: A~B liga direto');
      assert.ok(jaccard(planB.ancoras, educC.ancoras) >= 0.34, 'controle: B~C liga direto');
      assert.strictEqual(jaccard(congA.ancoras, educC.ancoras), 0, 'controle: A e C não têm nada em comum');

      const r = cluster.clusterizar([congA, planB, educC], { limiarJaccard: 0.34 });
      assert.strictEqual(juntos(r, 'conga', 'planb'), true, 'A e B formam cluster — o vínculo direto é legítimo');
      assert.strictEqual(juntos(r, 'planb', 'naoeducc'), false, 'B e C NÃO ligam — falhariam contra o representante do cluster {A,B}');
      assert.strictEqual(juntos(r, 'conga', 'naoeducc'), false, 'C nunca entra no cluster de A — sem isso, union-find os juntaria via B');
      assert.strictEqual(r.porItem.get('conga').n_itens, 2);
      assert.strictEqual(r.porItem.get('naoeducc').n_itens, 1, 'C fica sozinho, não vira cluster de 3');
    }]
  ];

  for (const [name, fn] of tests) {
    if (runTest(name, fn)) passed++;
    else failed++;
  }

  console.log(`\n${passed} passou(aram), ${failed} falhou(aram)\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
