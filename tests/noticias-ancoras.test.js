#!/usr/bin/env node
'use strict';

/**
 * Normalização de título, âncoras e Jaccard — `lib-noticias/ancoras.js`.
 *
 * Os casos de borda testados aqui são os que o reconhecimento previu por
 * escrito (§Detecção de fato repetido, "O que essa recomendação erra"):
 * manchete em caixa alta, primeira palavra da frase, e o Jaccard sobre
 * conjunto vazio.
 *
 * Sem rede, sem fixture de arquivo — os títulos são escritos inline porque
 * cada um É o caso de teste.
 */

const assert = require('assert');
const anc = require('../lib-noticias/ancoras');

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
  console.log('\n=== noticias-ancoras.test.js ===\n');
  let passed = 0;
  let failed = 0;

  const tests = [
    // ------------------------------------------------------ normalização
    ['normalizarTitulo tira acento, baixa a caixa e some com a pontuação', () => {
      assert.strictEqual(
        anc.normalizarTitulo('Eleição: Lula diz que "está pronto"!'),
        'eleicao lula diz que esta pronto'
      );
    }],

    ['normalizarTitulo preserva o número e o separador decimal', () => {
      assert.strictEqual(anc.normalizarTitulo('R$ 9,6 mil em 2027'), 'r 9,6 mil em 2027');
    }],

    ['normalizarTitulo é estável para entrada nula', () => {
      assert.strictEqual(anc.normalizarTitulo(null), '');
      assert.strictEqual(anc.normalizarTitulo(undefined), '');
    }],

    // ---------------------------------------------------------- âncoras
    ['âncora = maiúscula do título ORIGINAL + números', () => {
      const r = anc.extrairAncoras('Concurso IBGE 2026: editais ofertam 9,6 mil vagas');
      assert.strictEqual(r.regime, 'maiuscula');
      assert.ok(r.ancoras.includes('ibge'));
      assert.ok(r.ancoras.includes('2026'));
      assert.ok(r.ancoras.includes('9.6'), 'vírgula decimal normalizada para ponto');
      assert.ok(!r.ancoras.includes('editais'), 'minúscula não é âncora no regime normal');
      assert.ok(!r.ancoras.includes('vagas'));
    }],

    ['vírgula decimal e ponto decimal viram a MESMA âncora (pt e en concordando)', () => {
      const pt = anc.extrairAncoras('Governo anuncia 9,6 mil vagas');
      const en = anc.extrairAncoras('Government announces 9.6 thousand posts');
      assert.ok(pt.ancoras.includes('9.6'));
      assert.ok(en.ancoras.includes('9.6'));
    }],

    ['stopword capitalizada não vira âncora (Após, The, Como)', () => {
      const r = anc.extrairAncoras('Após reunião, The Guardian diz que Como é cidade');
      assert.ok(!r.ancoras.includes('apos'));
      assert.ok(!r.ancoras.includes('the'));
      assert.ok(!r.ancoras.includes('como'));
      assert.ok(r.ancoras.includes('guardian'));
    }],

    ['âncoras não repetem (é conjunto, não lista)', () => {
      const r = anc.extrairAncoras('Lula e Lula: Lula fala de Lula');
      assert.strictEqual(r.ancoras.filter(a => a === 'lula').length, 1);
    }],

    // ------------------------------------------------- caixa alta (achado)
    ['ACHADO PREVISTO: manchete em CAIXA ALTA é detectada e troca de regime', () => {
      const r = anc.extrairAncoras('CONCURSO IBGE 2026: EDITAIS OFERTAM VAGAS PARA CANDIDATOS');
      assert.strictEqual(r.capsQuebrada, true);
      assert.strictEqual(r.regime, 'conteudo');
      // No regime de conteúdo a âncora sai de palavra significativa, não de caixa.
      assert.ok(r.ancoras.includes('editais'));
      assert.ok(r.ancoras.includes('ibge'));
    }],

    ['sigla em maiúscula NÃO dispara falso alarme de caixa alta (o corte por comprimento)', () => {
      // Sem o corte de >=6 letras, "IBGE e IPEA divulgam PNAD" daria 3/4 de
      // tokens maiúsculos e seria lido como manchete em caixa alta — o
      // falso positivo que apagaria justamente a âncora que interessa.
      const r = anc.extrairAncoras('IBGE e IPEA divulgam PNAD');
      assert.strictEqual(r.capsQuebrada, false);
      assert.strictEqual(r.regime, 'maiuscula');
      assert.ok(r.ancoras.includes('ibge'));
      assert.ok(r.ancoras.includes('ipea'));
      assert.ok(r.ancoras.includes('pnad'));
    }],

    ['título sem nenhuma palavra longa não é acusado de caixa alta (sem evidência, não acusa)', () => {
      assert.strictEqual(anc.detectarCaixaAlta('EUA e ONU'), false);
    }],

    // ---------------------------------- CONSERTO 3: tokenização de número
    ['CONSERTO 3: "6x1" vira UM token, não dois dígitos soltos', () => {
      assert.deepStrictEqual(anc.extrairNumeros('escala 6x1'), ['6x1']);
      const r = anc.extrairAncoras("Lula brinca com Motta após conversa sobre 6x1: 'Juntos'");
      assert.ok(r.ancoras.includes('6x1'), 'o par vira uma âncora só');
      assert.ok(!r.ancoras.includes('6'), 'não sobra o "6" solto');
      assert.ok(!r.ancoras.includes('1'), 'não sobra o "1" solto');
    }],

    ['CONSERTO 3: "6X1" (X maiúsculo) normaliza para a MESMA âncora que "6x1"', () => {
      assert.deepStrictEqual(anc.extrairNumeros('fim da escala 6X1'), ['6x1']);
    }],

    ['CONSERTO 3: número de UM dígito isolado é descartado como âncora', () => {
      assert.deepStrictEqual(anc.extrairNumeros('condenados do 8 de janeiro'), []);
      assert.deepStrictEqual(anc.extrairNumeros('G7 reune lideres'), []);
      const r = anc.extrairAncoras('Caiado diz que 8 de Janeiro foi golpe');
      assert.ok(!r.ancoras.includes('8'), 'dígito isolado não vira âncora');
    }],

    ['CONSERTO 3: número com 2+ dígitos e decimal continuam valendo (o corte é só para o isolado)', () => {
      assert.deepStrictEqual(anc.extrairNumeros('Mladic dies aged 84'), ['84']);
      assert.deepStrictEqual(anc.extrairNumeros('R$ 9,6 mil em 2027'), ['9.6', '2027']);
    }],

    ['CONSERTO 3 — ERRO 2 REPRODUZIDO E FECHADO: "6x1" como token único evita que "escala 6x1" (Lula/Motta/Alcolumbre) e um título qualquer com outro "1" ou "6" soltos colidam por dígito sem poder discriminante', () => {
      const a = anc.extrairAncoras("Lula diz que Brasil 'está pronto' para fim da escala 6x1");
      const b = anc.extrairAncoras('Governo confirma pacote em 1 semana com 6 medidas');
      assert.strictEqual(anc.contarIntersecao(a.ancoras, b.ancoras), 0, 'sem "6" e "1" soltos, os dois títulos não têm nada em comum');
    }],

    // -------------------------------------------------- contarIntersecao
    ['contarIntersecao: |A∩B|, a contraparte absoluta do Jaccard', () => {
      assert.strictEqual(anc.contarIntersecao(['a', 'b', 'c'], ['b', 'c', 'd']), 2);
      assert.strictEqual(anc.contarIntersecao(['a'], ['a']), 1);
      assert.strictEqual(anc.contarIntersecao(['a'], ['b']), 0);
      assert.strictEqual(anc.contarIntersecao([], ['a']), 0);
      assert.strictEqual(anc.contarIntersecao([], []), 0);
    }],

    ['contarIntersecao aceita Set e array indistintamente, como o jaccard', () => {
      assert.strictEqual(anc.contarIntersecao(new Set(['a', 'b']), ['b', 'c']), 1);
    }],

    ['ERRO 2 REPRODUZIDO (piso de interseção): |A∩B|=1 já basta para Jaccard=0,50 — exatamente o defeito que cluster.js CONSERTO 1 fecha com o piso absoluto', () => {
      // "Governo não espera... EUA" tem {governo, eua}; "EUA iniciam ondas
      // de revogação dos vistos..." tem {eua} sozinha — a prova de
      // clustering (tmp/prova-noticias-2.log) mediu exatamente este par.
      const a = anc.extrairAncoras('Governo não espera solução rápida para tarifaço, mesmo com a volta das negociações com os EUA');
      const b = anc.extrairAncoras('EUA iniciam ondas de revogação dos vistos de pessoas que pediram asilo');
      assert.strictEqual(anc.contarIntersecao(a.ancoras, b.ancoras), 1);
      assert.strictEqual(anc.jaccard(a.ancoras, b.ancoras), 0.5);
    }],

    // ---------------------------------------------------------- Jaccard
    ['Jaccard é interseção sobre união', () => {
      assert.strictEqual(anc.jaccard(['a', 'b', 'c'], ['b', 'c', 'd']), 2 / 4);
      assert.strictEqual(anc.jaccard(['a'], ['a']), 1);
      assert.strictEqual(anc.jaccard(['a'], ['b']), 0);
    }],

    ['Jaccard de conjunto vazio é 0, nunca NaN nem 1', () => {
      assert.strictEqual(anc.jaccard([], []), 0);
      assert.strictEqual(anc.jaccard(['a'], []), 0);
      assert.ok(!Number.isNaN(anc.jaccard([], ['a'])));
    }],

    ['Jaccard aceita Set e array indistintamente', () => {
      assert.strictEqual(anc.jaccard(new Set(['a', 'b']), ['b', 'c']), 1 / 3);
    }],

    ['Jaccard é simétrico', () => {
      const A = ['lula', 'motta', '6x1'];
      const B = ['lula', 'alcolumbre'];
      assert.strictEqual(anc.jaccard(A, B), anc.jaccard(B, A));
    }],

    // ------------------------------------------- frequência documental
    ['filtrarFrequentes corta a âncora que aparece em quase todo item do lote', () => {
      // 25 itens, "brasil" em 24 deles (96%) e "ibge" em 2 (8%).
      const conjuntos = [];
      for (let i = 0; i < 24; i++) conjuntos.push(new Set(['brasil', 'x' + i]));
      conjuntos.push(new Set(['ibge', 'pnad']));
      conjuntos[0].add('ibge');

      const r = anc.filtrarFrequentes(conjuntos, { limiarDF: 0.15, minLote: 20 });
      assert.strictEqual(r.aplicado, true);
      assert.ok(r.cortadas.some(c => c.ancora === 'brasil'), '"brasil" tinha que cair');
      assert.ok(!r.cortadas.some(c => c.ancora === 'ibge'), '"ibge" tinha que ficar');
      assert.ok(!r.conjuntos[0].has('brasil'));
      assert.ok(r.conjuntos[0].has('ibge'));
    }],

    ['filtrarFrequentes NÃO roda em lote pequeno, e diz isso (aplicado: false)', () => {
      const r = anc.filtrarFrequentes([new Set(['a']), new Set(['a'])], { limiarDF: 0.15, minLote: 20 });
      assert.strictEqual(r.aplicado, false);
      assert.deepStrictEqual(r.cortadas, []);
      assert.ok(r.conjuntos[0].has('a'), 'nada foi cortado');
    }],

    ['o corte é auditável: cada âncora cortada vem com a DF medida', () => {
      const conjuntos = Array.from({ length: 30 }, (_, i) => new Set(['comum', 'u' + i]));
      const r = anc.filtrarFrequentes(conjuntos, { limiarDF: 0.15, minLote: 20 });
      const comum = r.cortadas.find(c => c.ancora === 'comum');
      assert.ok(comum);
      assert.strictEqual(comum.df, 30);
      assert.strictEqual(comum.fracao, 1);
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
