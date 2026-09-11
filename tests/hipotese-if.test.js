#!/usr/bin/env node
'use strict';

/**
 * Testa a heurística e a orquestração da hipótese DOU × Institutos
 * Federais (briefing Onda 1.5, item 2). Fixtures sintéticas no formato REAL
 * do payload jsonArray do DOU (mesmo shape de tests/fixtures/dou-itens-reais.json).
 * cap=0 no teste de processarDia mantém tudo offline (nunca dispara
 * dou.amostraTitulacaoIF, que faria requisição HTTP).
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const dou = require('../fontes/dou');
const hipoteseIF = require('../lib/hipotese-if');

function runTest(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`  ✓ ${name}`);
      return true;
    })
    .catch(error => {
      console.log(`  ✗ ${name}`);
      console.error(`    ${error.message}`);
      return false;
    });
}

function novoCaminhoTemp() {
  return path.join(os.tmpdir(), `radar-hipotese-if-test-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`);
}

const itemIfSubstituto = {
  title: 'EDITAL Nº 12/2026 - PROCESSO SELETIVO SIMPLIFICADO PARA PROFESSOR SUBSTITUTO',
  content:
    'O INSTITUTO FEDERAL DE EDUCAÇÃO, CIÊNCIA E TECNOLOGIA DE MINAS GERAIS torna público processo seletivo simplificado para contratação de professor substituto...',
  hierarchyStr: 'Ministério da Educação/Instituto Federal de Educação, Ciência e Tecnologia de Minas Gerais',
  hierarchyList: ['Ministério da Educação', 'Instituto Federal de Educação, Ciência e Tecnologia de Minas Gerais'],
  urlTitle: 'edital-12-2026-if-mg',
  pubDate: '10/03/2026',
  artType: 'Edital de Processo Seletivo'
};

const itemIfEfetivo = {
  title: 'EDITAL Nº 5/2026 - CONCURSO PÚBLICO PARA PROFESSOR DO MAGISTÉRIO',
  content: 'O INSTITUTO FEDERAL DE SÃO PAULO torna pública a abertura de concurso público para provimento de cargos efetivos de professor do ensino básico, técnico e tecnológico.',
  hierarchyStr: 'Ministério da Educação/Instituto Federal de São Paulo',
  hierarchyList: ['Ministério da Educação', 'Instituto Federal de São Paulo'],
  urlTitle: 'edital-5-2026-if-sp',
  pubDate: '11/03/2026',
  artType: 'Edital de Concurso Público'
};

const itemUniversidadeSubstituto = {
  title: 'EDITAL Nº 8/2026 - PROCESSO SELETIVO SIMPLIFICADO PROFESSOR SUBSTITUTO',
  content: 'A UNIVERSIDADE FEDERAL DE ALFENAS torna público processo seletivo simplificado para professor substituto do departamento de Farmácia.',
  hierarchyStr: 'Ministério da Educação/Universidade Federal de Alfenas',
  hierarchyList: ['Ministério da Educação', 'Universidade Federal de Alfenas'],
  urlTitle: 'edital-8-2026-unifal',
  pubDate: '12/03/2026',
  artType: 'Edital de Processo Seletivo'
};

const itemIfTAE = {
  title: 'EDITAL Nº 20/2026 - PROCESSO SELETIVO SIMPLIFICADO PARA TÉCNICO ADMINISTRATIVO',
  content: 'O INSTITUTO FEDERAL DO PARANÁ torna público processo seletivo simplificado para contratação de técnico administrativo substituto.',
  hierarchyStr: 'Ministério da Educação/Instituto Federal do Paraná',
  hierarchyList: ['Ministério da Educação', 'Instituto Federal do Paraná'],
  urlTitle: 'edital-20-2026-if-pr',
  pubDate: '13/03/2026',
  artType: 'Edital de Processo Seletivo'
};

async function main() {
  console.log('\n=== hipotese-if.test.js ===\n');
  let passed = 0;
  let failed = 0;

  const tests = [
    ['pareceAvisoIFSubstituto: true para IF + processo seletivo simplificado + professor substituto', () => {
      assert.strictEqual(dou.pareceAvisoIFSubstituto(itemIfSubstituto), true);
    }],

    ['pareceAvisoIFSubstituto: false para IF em concurso EFETIVO (sem termo de substituto)', () => {
      assert.strictEqual(dou.pareceAvisoIFSubstituto(itemIfEfetivo), false);
    }],

    ['pareceAvisoIFSubstituto: false para universidade (não instituto federal) mesmo com professor substituto', () => {
      assert.strictEqual(dou.pareceAvisoIFSubstituto(itemUniversidadeSubstituto), false);
    }],

    ['pareceAvisoIFSubstituto: false para IF com vaga técnico-administrativa (não é "professor")', () => {
      assert.strictEqual(dou.pareceAvisoIFSubstituto(itemIfTAE), false);
    }],

    ['nomeInstitutoFederal extrai o nome do instituto via hierarchyList[1]', () => {
      assert.strictEqual(
        dou.nomeInstitutoFederal(itemIfSubstituto),
        'Instituto Federal de Educação, Ciência e Tecnologia de Minas Gerais'
      );
    }],

    ['processarDia (cap=0): registra só os avisos IF-substituto reconhecidos, sem chamar rede (amostrado=false)', async () => {
      const p = novoCaminhoTemp();
      const estado = hipoteseIF.novoEstado(0); // cap 0 -> nunca enriquece, nunca faz fetch
      const resultado = await hipoteseIF.processarDia(
        [itemIfSubstituto, itemIfEfetivo, itemUniversidadeSubstituto, itemIfTAE],
        '10-03-2026',
        estado,
        { amostraPath: p, pausaMs: 0 }
      );
      assert.strictEqual(resultado.encontrados, 1, 'só itemIfSubstituto deveria bater na heurística');

      const registros = hipoteseIF.carregarTudo(p);
      assert.strictEqual(registros.length, 1);
      assert.strictEqual(registros[0].instituto, 'Instituto Federal de Educação, Ciência e Tecnologia de Minas Gerais');
      assert.strictEqual(registros[0].amostrado, false);
      assert.strictEqual(estado.amostrados, 0);
      fs.unlinkSync(p);
    }],

    ['novoEstado() usa o cap padrão quando não especificado', () => {
      const estado = hipoteseIF.novoEstado();
      assert.strictEqual(estado.cap, hipoteseIF.CAP_PADRAO);
      assert.strictEqual(estado.amostrados, 0);
    }]
  ];

  for (const [name, fn] of tests) {
    if (await runTest(name, fn)) passed++;
    else failed++;
  }

  console.log(`\n${passed} passou(aram), ${failed} falhou(aram)\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
