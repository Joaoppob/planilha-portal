#!/usr/bin/env node
'use strict';

/**
 * Onda 12/13, item 12c — conserto da duplicata visual medida na Onda 2
 * (ver RELATORIO-ONDA-1-2.md §2a e RELATORIO-ONDA-12-13.md).
 *
 * ESTE ARQUIVO É O TESTE "falha contra o dado de hoje e passa depois" do
 * briefing. Os textos abaixo são REAIS, capturados de `data/store.jsonl`
 * em 28/08/2026 (não são fixture sintética inventada) — os dois grupos
 * que o RELATORIO-ONDA-1-2.md classificou como DEFEITO (UEM e UFSCar; UEL
 * e UFSJ, também medidos ali, são LEGÍTIMOS e entram aqui como controle
 * negativo — já eram distinguíveis antes do conserto e continuam sendo).
 *
 * A REGRA DE DUPLICATA VISUAL testada é a MESMA de
 * `tests/concursos-vista-duplicata-visual.test.js` (tupla orgao+campus+
 * area+subarea dentro do mesmo guarda-chuva de url) — reimplementada aqui
 * localmente (função pura, ~10 linhas) porque aquele arquivo não exporta a
 * função e não é objetivo desta Onda acoplar os dois testes.
 *
 * ANTES do conserto (`lib/keyword-filtro.js avaliar()` sem a subárea mais
 * específica por área + `lib/subedital-extrator.js registrosRelevantes()`
 * sem o corte antes do trecho de Requisitos + config/keywords.json sem os
 * termos "algoritmos"/"engenharia de software"): rodando os MESMOS textos
 * abaixo pelo pipeline real (`subeditalExtrator.avaliarEditalUnico`/
 * `registrosRelevantes`, sem nenhum stub) produzia:
 *   - UEM: os 3 registros saíam `subarea: 'Computação'` — 1 grupo de
 *     duplicata visual com 3 registros.
 *   - UFSCar São Carlos (.08/.13/.14/.15): os 4 saíam `subarea:
 *     'Computação'` — 1 grupo com 4 registros (e .08 tinha área ERRADA,
 *     ver comentário em lib/subedital-extrator.js registrosRelevantes).
 *   - UFSCar Sorocaba (.37/.38) e São José do Rio Preto (.55/.56): entram
 *     aqui para fechar a régua dos 3 subgrupos que o relatório mediu.
 * Reproduzível: reverter as 3 mudanças desta Onda (git diff em
 * lib/keyword-filtro.js, lib/subedital-extrator.js, config/keywords.json)
 * e rodar este arquivo mostra os grupos falhando de novo.
 *
 * DEPOIS: cada subedital do mesmo guarda-chuva sai com uma tupla
 * orgao+campus+area+subarea DISTINTA — zero grupos de duplicata visual nos
 * 2 casos DEFEITO, e os 2 casos LEGÍTIMOS (controle negativo) continuam
 * passando (nunca dependeram do conserto, mas garantimos que ele não
 * quebrou o que já funcionava).
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const subeditalExtrator = require('../lib/subedital-extrator');

const keywordsConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'keywords.json'), 'utf8'));

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

/** Mesma regra de `tests/concursos-vista-duplicata-visual.test.js` — grupos de 2+ registros com a mesma tupla orgao+campus+area+subarea. */
function gruposDuplicataVisual(registros) {
  const porTupla = new Map();
  for (const r of registros) {
    const chave = [r.orgao, r.campus, r.area, r.subarea].join('|');
    if (!porTupla.has(chave)) porTupla.set(chave, []);
    porTupla.get(chave).push(r);
  }
  return [...porTupla.values()].filter(lista => lista.length > 1);
}

// --- UEM — via avaliarEditalUnico (caminho real de fontes/pci.js, que não
// implementa dividirSubeditais; textos reais de data/store.jsonl, campo
// texto_bruto, registros dos ids 49eaa9081e582f85dcf0/92ce1e03ba0c20317898/
// bb0a3ed81d5d1d5a31af, 28/08/2026) ---

const ORGAO_UEM = 'UEM - Universidade Estadual de Maringá';
const uemTextos = [
  {
    subedital: 'PROFESSOR COLABORADOR - CIÊNCIA DA COMPUTAÇÃO',
    texto:
      'UEM - PR abre processo seletivo com vagas para professores colaboradores \n UEM - Universidade Estadual de Maringá \n PROFESSOR COLABORADOR - CIÊNCIA DA COMPUTAÇÃO'
  },
  {
    subedital: 'PROFESSOR COLABORADOR - CIÊNCIA DA COMPUTAÇÃO/ALGORITMOS',
    texto:
      'UEM - PR abre processo seletivo com vagas para professores colaboradores \n UEM - Universidade Estadual de Maringá \n PROFESSOR COLABORADOR - CIÊNCIA DA COMPUTAÇÃO/ALGORITMOS'
  },
  {
    subedital: 'PROFESSOR COLABORADOR - CIÊNCIA DA COMPUTAÇÃO/ENGENHARIA DE SOFTWARE',
    texto:
      'UEM - PR abre processo seletivo com vagas para professores colaboradores \n UEM - Universidade Estadual de Maringá \n PROFESSOR COLABORADOR - CIÊNCIA DA COMPUTAÇÃO/ENGENHARIA DE SOFTWARE'
  }
];

function classificarUem() {
  return uemTextos.map(({ subedital, texto }) => {
    const av = subeditalExtrator.avaliarEditalUnico(texto, keywordsConfig);
    return { orgao: ORGAO_UEM, campus: null, area: av.area, subarea: av.subarea, subedital };
  });
}

// --- UFSCar — via dividirSubeditais + registrosRelevantes (caminho real de
// fontes/dou.js; textos reais de data/store.jsonl, edital nº 4/2026,
// subeditais .08/.13/.14/.15 [São Carlos], .37/.38 [Sorocaba], .55/.56
// [São José do Rio Preto], 28/08/2026) ---

const ORGAO_UFSCAR = 'Fundação Universidade Federal de São Carlos';

function linhaUfscar(codigo, campus, textoArea) {
  return { codigo, campus, vagas: 1, textoArea };
}

const linhasSaoCarlos = [
  linhaUfscar(
    '004/26.08',
    'São Carlos',
    'Probabilidade e Estatística Estatística Título de Doutor obtido em Programa de Pós-Graduação registrado em uma das seguintes áreas de conhecimento da CAPES: Matemática (10100008), ou Matemática Aplicada (10104003), ou Probabilidade e Estatística (10200002), ou Estatística (10202005), ou Ciência da Computação (10300007), ou Sistema de Computação (10304002), ou Genética (20200005), ou Agronomia (50100009), ou Demografia (60600004), ou Saúde e Biológicas (90194000).'
  ),
  linhaUfscar(
    '004/26.13',
    'São Carlos',
    'Engenharia e Ciência da Computação Computação de Alto Desempenho Título de Doutor em Programa de Pós Graduação cadastrado em uma das seguintes áreas de avaliação da CAPES: Computação, ou Probabilidade e Estatística, ou Matemática, ou Física, ou Astronomia, ou Engenharias III, ou Engenharias IV.'
  ),
  linhaUfscar(
    '004/26.14',
    'São Carlos',
    'Engenharia e Ciência da Computação Ciência de Dados Título de Doutor em Programa de Pós Graduação cadastrado em uma das seguintes áreas de avaliação da CAPES: Computação, ou Probabilidade e Estatística, ou Matemática, ou Física, ou Astronomia, ou Engenharias III, ou Engenharias IV.'
  ),
  linhaUfscar(
    '004/26.15',
    'São Carlos',
    'Ciência e Engenharia da Computação Metodologia e Técnicas de Computação: Inteligência Artificial Título de Doutor em Programa de Pós Graduação cadastrado em uma das seguintes áreas de avaliação da CAPES: Computação, ou Física, ou Matemática, ou Probabilidade e Estatística, ou Engenharias III, ou Engenharias IV'
  )
];

const linhasSorocaba = [
  linhaUfscar(
    '004/26.37',
    'Sorocaba',
    'Inteligência Artificial Aprendizado de Máquina Título de Doutor em Ciência da Computação, ou Engenharia de Computação, ou Engenharia Elétrica, ou Matemática Computacional, ou em programas de Doutorado com uma das seguintes áreas ou respectivas subáreas na plataforma Sucupira (CAPES): CIÊNCIA DA COMPUTAÇÃO ou ENGENHARIA IV.'
  ),
  linhaUfscar(
    '004/26.38',
    'Sorocaba',
    'Ciência de Dados Mineração de Dados Título de Doutor em Ciência da Computação, ou Engenharia de Computação, ou Engenharia Elétrica, ou Matemática Computacional, ou em programas de Doutorado com uma das seguintes áreas ou respectivas subáreas na plataforma Sucupira (CAPES): Ciência da Computação ou Engenharia IV.'
  )
];

const linhasSaoJoseDoRioPreto = [
  linhaUfscar(
    '004/26.55',
    'São José do Rio Preto',
    'Artes Plásticas Fundamentos das Artes Visuais, Tecnologias e mídias digitais, Performance e Linguagens Híbridas. Título de doutor em: Artes Visuais (80302009 - Artes Plásticas ou 80300006 - Artes); ou Arte e Cultura Visual (80300006 - Artes); ou Artes, Culturas e Tecnologias (80300006 - Artes); ou Cinema e Audiovisual (60900008 - Comunicação ou 80308007 - Cinema); ou Estudos Contemporâneos das Artes (80300006 - Artes); ou Humanidades, Culturas e Artes (90100000 - Interdisciplinar); ou Multimeios (60900008 - Comunicação).'
  ),
  linhaUfscar(
    '004/26.56',
    'São José do Rio Preto',
    'Audiovisual Realização e produção audiovisual para cinema e meios digitais Doutorado em Comunicação (60900008), ou Artes (80300006), ou Multimeios, ou Cinema, ou Audiovisual, ou Imagem e Som, ou Artes Visuais.'
  )
];

function classificarUfscar(linhas) {
  return subeditalExtrator.registrosRelevantes(linhas, keywordsConfig).map(r => ({
    orgao: ORGAO_UFSCAR,
    campus: r.campus,
    area: r.area,
    subarea: r.subarea,
    subedital: r.subedital
  }));
}

// --- UEL/UFSJ — controle negativo (LEGÍTIMOS, medidos no RELATORIO-ONDA-1-2.md
// §2a; textos reais — só confirmar que continuam distinguíveis depois do
// conserto) ---

const linhasUel = [
  {
    subedital: 'PROFESSOR - CIÊNCIA DE DADOS',
    texto: 'UEL - PR abre processo seletivo para professores temporários com diversas áreas de atuação \n UEL - Universidade Estadual de Londrina \n PROFESSOR - CIÊNCIA DE DADOS'
  },
  {
    subedital: 'PROFESSOR - INTELIGÊNCIA ARTIFICIAL',
    texto: 'UEL - PR abre processo seletivo para professores temporários com diversas áreas de atuação \n UEL - Universidade Estadual de Londrina \n PROFESSOR - INTELIGÊNCIA ARTIFICIAL'
  }
];

const linhasUfsj = [
  {
    subedital: 'PROFESSOR DO MAGISTÉRIO SUPERIOR - ENGENHARIA DA COMPUTAÇÃO',
    texto: 'UFSJ - MG abre concurso público com 12 vagas para professores do magistério superior \n UFSJ - Universidade Federal de São João del-Rei \n PROFESSOR DO MAGISTÉRIO SUPERIOR - ENGENHARIA DA COMPUTAÇÃO'
  },
  {
    subedital: 'PROFESSOR DO MAGISTÉRIO SUPERIOR - INTELIGÊNCIA ARTIFICIAL',
    texto: 'UFSJ - MG abre concurso público com 12 vagas para professores do magistério superior \n UFSJ - Universidade Federal de São João del-Rei \n PROFESSOR DO MAGISTÉRIO SUPERIOR - INTELIGÊNCIA ARTIFICIAL'
  }
];

function classificarControleNegativo(orgao, linhas) {
  return linhas.map(({ subedital, texto }) => {
    const av = subeditalExtrator.avaliarEditalUnico(texto, keywordsConfig);
    return { orgao, campus: null, area: av.area, subarea: av.subarea, subedital };
  });
}

function main() {
  console.log('\n=== 12c-subarea-desambiguada.test.js ===\n');
  let passed = 0;
  let failed = 0;

  const tests = [
    ['UEM: os 3 subeditais (Ciência da Computação / .../Algoritmos / .../Engenharia de Software) saem com subárea DISTINTA — zero duplicata visual', () => {
      const registros = classificarUem();
      assert.strictEqual(registros.length, 3, 'os 3 devem passar no filtro (todos são Computação/IA de verdade)');
      const subareas = registros.map(r => r.subarea);
      assert.strictEqual(new Set(subareas).size, 3, `esperava 3 subáreas distintas, achou: ${JSON.stringify(subareas)}`);
      assert.strictEqual(gruposDuplicataVisual(registros).length, 0);
    }],

    ['UFSCar São Carlos: 004/26.08 (Probabilidade e Estatística, área ERRADA antes) é DESCARTADO — não colide mais com 004/26.13', () => {
      const registros = classificarUfscar(linhasSaoCarlos);
      const codigos = registros.map(r => r.subedital);
      assert.ok(!codigos.includes('004/26.08'), '004/26.08 deveria ter sido descartado — a vaga é de Estatística, não Computação/IA');
      assert.strictEqual(codigos.length, 3, `esperava 3 subeditais relevantes (.13/.14/.15), achou: ${JSON.stringify(codigos)}`);
    }],

    ['UFSCar São Carlos: .13/.14/.15 saem com subárea DISTINTA — zero duplicata visual', () => {
      const registros = classificarUfscar(linhasSaoCarlos);
      const subareas = registros.map(r => r.subarea);
      assert.strictEqual(new Set(subareas).size, registros.length, `esperava subáreas distintas, achou: ${JSON.stringify(subareas)}`);
      assert.strictEqual(gruposDuplicataVisual(registros).length, 0);
    }],

    ['UFSCar Sorocaba: 004/26.37 (Inteligência Artificial) x 004/26.38 (Ciência de Dados) saem com subárea DISTINTA', () => {
      const registros = classificarUfscar(linhasSorocaba);
      assert.strictEqual(registros.length, 2);
      assert.notStrictEqual(registros[0].subarea, registros[1].subarea);
      assert.strictEqual(gruposDuplicataVisual(registros).length, 0);
    }],

    ['UFSCar São José do Rio Preto: 004/26.55 (Mídias Digitais) x 004/26.56 (Audiovisual) saem com subárea DISTINTA', () => {
      const registros = classificarUfscar(linhasSaoJoseDoRioPreto);
      assert.strictEqual(registros.length, 2);
      assert.notStrictEqual(registros[0].subarea, registros[1].subarea);
      assert.strictEqual(gruposDuplicataVisual(registros).length, 0);
    }],

    ['controle negativo: UEL continua distinguível depois do conserto (já era legítima antes — não regrediu)', () => {
      const registros = classificarControleNegativo('UEL - Universidade Estadual de Londrina', linhasUel);
      assert.strictEqual(gruposDuplicataVisual(registros).length, 0);
      assert.strictEqual(registros[0].subarea, 'Ciência de Dados');
      assert.strictEqual(registros[1].subarea, 'Inteligência Artificial');
    }],

    ['controle negativo: UFSJ continua distinguível depois do conserto (já era legítima antes — não regrediu)', () => {
      const registros = classificarControleNegativo('UFSJ - Universidade Federal de São João del-Rei', linhasUfsj);
      assert.strictEqual(gruposDuplicataVisual(registros).length, 0);
      assert.strictEqual(registros[0].subarea, 'Computação');
      assert.strictEqual(registros[1].subarea, 'Inteligência Artificial');
    }],

    ['auditoria combinada: cada um dos 6 guarda-chuva reais do relatório, isolado -> zero grupos de duplicata visual (era 4 grupos/11 registros defeituosos antes)', () => {
      for (const lista of [
        classificarUem(),
        classificarUfscar(linhasSaoCarlos),
        classificarUfscar(linhasSorocaba),
        classificarUfscar(linhasSaoJoseDoRioPreto),
        classificarControleNegativo('UEL - Universidade Estadual de Londrina', linhasUel),
        classificarControleNegativo('UFSJ - Universidade Federal de São João del-Rei', linhasUfsj)
      ]) {
        assert.strictEqual(gruposDuplicataVisual(lista).length, 0);
      }
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
