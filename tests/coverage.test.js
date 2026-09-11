#!/usr/bin/env node
'use strict';

/**
 * Testa lib/coverage.js — a instrumentação POSITIVA dos estágios do pipeline
 * que descartam registro (briefing: "quanto passou sobre quanto havia", não
 * um contador de descarte agregado que não distingue "existiam 3" de
 * "existiam 300 e o filtro comeu 297"). Doutrina pinloop-cli reimplementada
 * (sem instalar nada): `{ unidade, covered, total }` inteiros crus, nunca
 * reduzidos, `0/0 <unidade>` quando não há nada a cobrir, descarte carrega
 * `{ id, reason }`, e o instrumento ABORTA SOZINHO em estado impossível
 * (covered>total, negativo, não-inteiro, unidade ausente, `somar()` entre
 * unidades diferentes) — erro duro, não warning que passa batido.
 *
 * ONDA COBERTURA-2 (achado real, rodada ao vivo): a leitura em prosa da
 * rodada escreveu "38 passaram o gate... 40 chegaram ao fim do filtro de
 * área" — 33 ITENS (edital único da PCI) somados a 7 LINHAS de subedital da
 * SeleçãoAcadêmica, duas unidades diferentes que só pareciam somáveis
 * porque nada no dado denunciava a mistura. `unidade` passa a ser campo de
 * PRIMEIRA CLASSE em todo `{covered,total}` — `validarCoverage` recusa sem
 * ela, e `somar()` recusa somar unidades diferentes (ver bloco "somar —
 * unidade" abaixo, que reproduz o caso exato 33 itens + 7 linhas).
 *
 * Este arquivo testa só o MÓDULO em isolamento (unidade — no sentido de
 * "unit test"; o jogo de palavras com a unidade DE MEDIDA é involuntário mas
 * apropriado). O controle POSITIVO que prova que a instrumentação
 * DISCRIMINA através do pipeline real (vaga-docente/vaga-mercado/
 * subedital-extrator) está em tests/coverage-pipeline-discrimina.test.js; a
 * prova de que a unidade CHEGA ao stdout real está em
 * tests/coverage-comandocoletar-stub.test.js — aqui não caberiam (este
 * arquivo não conhece nenhum estágio real, só o contrato do módulo).
 */

const assert = require('assert');
const coverage = require('../lib/coverage');

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
  console.log('\n=== coverage.test.js ===\n');
  let passed = 0;
  let failed = 0;

  const tests = [
    // ---------------------------------------------------------- validarCoverage
    ['validarCoverage aceita objeto válido (unidade string não-vazia, covered <= total, ambos inteiros >= 0)', () => {
      assert.strictEqual(coverage.validarCoverage({ unidade: 'itens', covered: 3, total: 10 }), true);
      assert.strictEqual(coverage.validarCoverage({ unidade: 'itens', covered: 0, total: 0 }), true);
      assert.strictEqual(coverage.validarCoverage({ unidade: 'linhas_subedital', covered: 10, total: 10 }), true);
    }],

    ['validarCoverage ABORTA (throw) quando unidade está AUSENTE — dado de primeira classe, não opcional', () => {
      assert.throws(() => coverage.validarCoverage({ covered: 3, total: 10 }), /unidade [ée] obrigat[oó]ria/i);
    }],

    ['validarCoverage ABORTA quando unidade é string vazia', () => {
      assert.throws(() => coverage.validarCoverage({ unidade: '', covered: 3, total: 10 }), /unidade [ée] obrigat[oó]ria/i);
    }],

    ['validarCoverage ABORTA quando unidade é só espaço em branco (não conta como "informada")', () => {
      assert.throws(() => coverage.validarCoverage({ unidade: '   ', covered: 3, total: 10 }), /unidade [ée] obrigat[oó]ria/i);
    }],

    ['validarCoverage ABORTA quando unidade não é string (ex.: número, null)', () => {
      assert.throws(() => coverage.validarCoverage({ unidade: 42, covered: 3, total: 10 }), /unidade [ée] obrigat[oó]ria/i);
      assert.throws(() => coverage.validarCoverage({ unidade: null, covered: 3, total: 10 }), /unidade [ée] obrigat[oó]ria/i);
    }],

    ['validarCoverage ABORTA (throw) quando covered > total — erro duro, não warning', () => {
      assert.throws(() => coverage.validarCoverage({ unidade: 'itens', covered: 251, total: 250 }), /covered.*n[aã]o pode ser maior/i);
    }],

    ['validarCoverage ABORTA quando covered é negativo', () => {
      assert.throws(() => coverage.validarCoverage({ unidade: 'itens', covered: -1, total: 5 }), /negativ/i);
    }],

    ['validarCoverage ABORTA quando total é negativo', () => {
      assert.throws(() => coverage.validarCoverage({ unidade: 'itens', covered: 0, total: -3 }), /negativ/i);
    }],

    ['validarCoverage ABORTA quando covered não é inteiro (float)', () => {
      assert.throws(() => coverage.validarCoverage({ unidade: 'itens', covered: 2.5, total: 10 }), /inteiros crus/i);
    }],

    ['validarCoverage ABORTA quando total é NaN', () => {
      assert.throws(() => coverage.validarCoverage({ unidade: 'itens', covered: 1, total: NaN }), /inteiros crus/i);
    }],

    ['validarCoverage ABORTA quando covered/total são string (nunca aceita "3"/"10" como número)', () => {
      assert.throws(() => coverage.validarCoverage({ unidade: 'itens', covered: '3', total: '10' }), /inteiros crus/i);
    }],

    // -------------------------------------------------------------------- formatar
    ['formatar NUNCA reduz a fração — 249/250 fica 249/250, não ~1 — e a unidade aparece', () => {
      assert.strictEqual(coverage.formatar({ unidade: 'itens', covered: 249, total: 250 }), '249/250 itens');
    }],

    ['formatar de 996/1000 fica 996/1000 por maior que fiquem os números (nada de notação científica/arredondamento)', () => {
      assert.strictEqual(coverage.formatar({ unidade: 'itens', covered: 996, total: 1000 }), '996/1000 itens');
    }],

    ['formatar nunca usa separador de milhar — isso é apresentação, fora deste módulo', () => {
      const s = coverage.formatar({ unidade: 'itens', covered: 1234, total: 5678 });
      assert.strictEqual(s, '1234/5678 itens');
      assert.ok(!s.includes(',') && !s.includes('.'), `não deveria ter separador: "${s}"`);
    }],

    ['formatar de 0/0 (nada a cobrir) não lança, não produz NaN, e ainda mostra a unidade', () => {
      assert.strictEqual(coverage.formatar({ unidade: 'linhas_subedital', covered: 0, total: 0 }), '0/0 linhas_subedital');
    }],

    ['formatar DIFERENCIA a unidade — o mesmo par de números com unidade diferente produz texto DIFERENTE (é isso que resolve a leitura ambígua)', () => {
      const comoItens = coverage.formatar({ unidade: 'itens', covered: 7, total: 134 });
      const comoLinhas = coverage.formatar({ unidade: 'linhas_subedital', covered: 7, total: 134 });
      assert.strictEqual(comoItens, '7/134 itens');
      assert.strictEqual(comoLinhas, '7/134 linhas_subedital');
      assert.notStrictEqual(comoItens, comoLinhas, 'a unidade tem que mudar o texto — senão ela não está "chegando" na saída');
    }],

    ['formatar propaga a validação — recusa formatar um objeto inválido só porque "é log" (sem unidade, ou covered>total)', () => {
      assert.throws(() => coverage.formatar({ covered: 5, total: 2 }));
      assert.throws(() => coverage.formatar({ unidade: 'itens', covered: 5, total: 2 }));
    }],

    // ----------------------------------------------------------------------- somar — mesma unidade
    ['somar soma covered e total de dois coverages da MESMA unidade, concatenando descartes', () => {
      const a = { unidade: 'itens', covered: 3, total: 5, descartes: [{ id: 'x1', reason: 'r1' }] };
      const b = { unidade: 'itens', covered: 2, total: 4, descartes: [{ id: 'x2', reason: 'r2' }] };
      const r = coverage.somar(a, b);
      assert.strictEqual(r.unidade, 'itens');
      assert.strictEqual(r.covered, 5);
      assert.strictEqual(r.total, 9);
      assert.deepStrictEqual(r.descartes, [{ id: 'x1', reason: 'r1' }, { id: 'x2', reason: 'r2' }]);
    }],

    ['somar de dois 0/0 da mesma unidade continua 0/0 nessa unidade', () => {
      const r = coverage.somar(
        { unidade: 'linhas_subedital', covered: 0, total: 0, descartes: [] },
        { unidade: 'linhas_subedital', covered: 0, total: 0, descartes: [] }
      );
      assert.strictEqual(coverage.formatar(r), '0/0 linhas_subedital');
    }],

    ['somar recusa (throw) se um dos operandos já é inválido (ex.: sem unidade)', () => {
      assert.throws(() => coverage.somar({ covered: 9, total: 2 }, { unidade: 'itens', covered: 0, total: 0 }));
    }],

    // --------------------------------------------- somar — unidade (o requisito desta Onda)
    [
      'somar ESTOURA ao tentar combinar unidades diferentes — REPRODUZ O CASO EXATO da rodada ao vivo: ' +
        '33 ITENS (edital único da PCI) + 7 LINHAS de subedital (SeleçãoAcadêmica) — a leitura errada era "40"',
      () => {
        const editalUnicoPci = { unidade: 'itens', covered: 33, total: 33, descartes: [] };
        const subeditalLinhaSelecaoAcademica = { unidade: 'linhas_subedital', covered: 7, total: 134, descartes: [] };
        assert.throws(
          () => coverage.somar(editalUnicoPci, subeditalLinhaSelecaoAcademica),
          /n[aã]o posso somar unidades diferentes/i,
          'somar(itens, linhas_subedital) tinha que estourar — 33+7=40 não é uma soma válida'
        );
      }
    ],

    ['somar ESTOURA nos dois sentidos (a,b) e (b,a) — a ordem dos argumentos não disfarça a mistura', () => {
      const itens = { unidade: 'itens', covered: 33, total: 33, descartes: [] };
      const linhas = { unidade: 'linhas_subedital', covered: 7, total: 134, descartes: [] };
      assert.throws(() => coverage.somar(itens, linhas), /n[aã]o posso somar unidades diferentes/i);
      assert.throws(() => coverage.somar(linhas, itens), /n[aã]o posso somar unidades diferentes/i);
    }],

    [
      'CONTRASTE OBRIGATÓRIO: o MESMO par (33/33 itens) somado com um coverage de unidade IGUAL soma normalmente, ' +
        'com o número EXATO conferido — prova que somar() não estoura sempre, só quando as unidades realmente divergem',
      () => {
        const editalUnicoPci = { unidade: 'itens', covered: 33, total: 33, descartes: [] };
        const editalUnicoOutraFonteDocente = { unidade: 'itens', covered: 5, total: 10, descartes: [] };
        const r = coverage.somar(editalUnicoPci, editalUnicoOutraFonteDocente);
        assert.strictEqual(r.unidade, 'itens');
        assert.strictEqual(r.covered, 38, 'esperava 33+5=38, exato');
        assert.strictEqual(r.total, 43, 'esperava 33+10=43, exato');
        assert.strictEqual(coverage.formatar(r), '38/43 itens');
      }
    ],

    [
      'CONTRASTE: as MESMAS 7/134 linhas de subedital somadas com outra fonte docente (mesma unidade) somam certo — ' +
        'só a mistura ITENS+LINHAS é que é proibida, não a soma em si',
      () => {
        const subeditalLinhaA = { unidade: 'linhas_subedital', covered: 7, total: 134, descartes: [] };
        const subeditalLinhaB = { unidade: 'linhas_subedital', covered: 2, total: 3, descartes: [] };
        const r = coverage.somar(subeditalLinhaA, subeditalLinhaB);
        assert.strictEqual(r.unidade, 'linhas_subedital');
        assert.strictEqual(r.covered, 9);
        assert.strictEqual(r.total, 137);
      }
    ],

    // ------------------------------------------------------------ novoContador
    ['novoContador EXIGE unidade no construtor — throw se ausente/vazia (erra na criação, não só na hora de somar depois)', () => {
      assert.throws(() => coverage.novoContador(), /exige "unidade"/i);
      assert.throws(() => coverage.novoContador(''), /exige "unidade"/i);
      assert.throws(() => coverage.novoContador(42), /exige "unidade"/i);
    }],

    ['novoContador("itens"): nenhum item registrado -> 0/0 itens, sem descartes', () => {
      const c = coverage.novoContador('itens');
      const r = c.resultado();
      assert.strictEqual(r.unidade, 'itens');
      assert.strictEqual(r.covered, 0);
      assert.strictEqual(r.total, 0);
      assert.deepStrictEqual(r.descartes, []);
    }],

    ['novoContador: registrar(true) incrementa covered E total; registrar(false, descarte) só total, e guarda o descarte; unidade sai igual à declarada', () => {
      const c = coverage.novoContador('linhas_subedital');
      c.registrar(true, null);
      c.registrar(true, null);
      c.registrar(false, { id: 'item-3', reason: 'motivo_x' });
      const r = c.resultado();
      assert.strictEqual(r.unidade, 'linhas_subedital');
      assert.strictEqual(r.covered, 2);
      assert.strictEqual(r.total, 3);
      assert.strictEqual(r.descartes.length, 1);
      assert.deepStrictEqual(r.descartes[0], { id: 'item-3', reason: 'motivo_x' });
    }],

    ['novoContador: cada descarte carrega { id, reason } — não uma contagem agregada', () => {
      const c = coverage.novoContador('itens');
      c.registrar(false, { id: 'a', reason: 'sem_termo' });
      c.registrar(false, { id: 'b', reason: 'area_incompativel' });
      const r = c.resultado();
      assert.strictEqual(r.descartes.length, 2);
      for (const d of r.descartes) {
        assert.ok(typeof d.id !== 'undefined', 'descarte precisa ter chave id');
        assert.ok(typeof d.reason === 'string' && d.reason.length > 0, 'descarte precisa ter reason não-vazio');
      }
    }],

    ['novoContador: registrar(false) sem descarte explícito não quebra — usa um fallback honesto, nunca undefined', () => {
      const c = coverage.novoContador('itens');
      c.registrar(false);
      const r = c.resultado();
      assert.strictEqual(r.descartes.length, 1);
      assert.strictEqual(r.descartes[0].reason, 'motivo_nao_informado');
    }],

    ['novoContador: resultado() nunca produz covered > total por construção (registrar incrementa os dois juntos quando passou)', () => {
      const c = coverage.novoContador('itens');
      for (let i = 0; i < 50; i++) c.registrar(i % 3 !== 0, i % 3 !== 0 ? null : { id: `i${i}`, reason: 'x' });
      const r = c.resultado(); // validarCoverage roda dentro — não deveria lançar
      assert.ok(r.covered <= r.total);
    }],

    ['dois contadores com unidades DIFERENTES ("itens" vs "linhas_subedital") não podem ter seus resultado()s somados — fecha o ciclo: criação já declara, soma já recusa', () => {
      const cItens = coverage.novoContador('itens');
      cItens.registrar(true, null);
      const cLinhas = coverage.novoContador('linhas_subedital');
      cLinhas.registrar(true, null);
      assert.throws(() => coverage.somar(cItens.resultado(), cLinhas.resultado()), /n[aã]o posso somar unidades diferentes/i);
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
