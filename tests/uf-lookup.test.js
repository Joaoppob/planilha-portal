#!/usr/bin/env node
'use strict';

/**
 * Testa lib/uf-lookup.js — item 2 do briefing Onda 1.7 ("fechar a lacuna de
 * UF"). buscarUf (lookup por instituição) já era coberto indiretamente pelos
 * outros testes; este arquivo cobre especificamente extrairUfDoTexto (novo)
 * e a checagem de não-regressão do golden set (nenhum falso positivo).
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ufLookup = require('../lib/uf-lookup');

const goldenSet = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'golden-set.json'), 'utf8'));

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
  console.log('\n=== uf-lookup.test.js ===\n');
  let passed = 0;
  let failed = 0;

  const tests = [
    ['buscarUf encontra por nome de instituição expandido nesta onda (Instituto Federal de MT)', () => {
      const uf = ufLookup.buscarUf('Instituto Federal de Educação, Ciência e Tecnologia de Mato Grosso', null);
      assert.strictEqual(uf, 'MT');
    }],

    ['buscarUf sem match retorna null (nunca inventa)', () => {
      assert.strictEqual(ufLookup.buscarUf('Instituição Inexistente Qualquer', null), null);
    }],

    ['extrairUfDoTexto reconhece "Estado de <nome>" (alta confiança, 27 nomes fechados)', () => {
      assert.strictEqual(ufLookup.extrairUfDoTexto('a universidade, sediada no Estado de São Paulo, torna público'), 'SP');
      assert.strictEqual(ufLookup.extrairUfDoTexto('no Estado do Rio de Janeiro'), 'RJ');
      assert.strictEqual(ufLookup.extrairUfDoTexto('no Estado da Bahia'), 'BA');
    }],

    ['extrairUfDoTexto reconhece "Cidade/UF" e "Cidade - UF"', () => {
      assert.strictEqual(ufLookup.extrairUfDoTexto('Departamento de Ciências Humanas - Sorocaba/SP para atuação'), 'SP');
      assert.strictEqual(ufLookup.extrairUfDoTexto('Campus Cristalina - GO, no uso de suas atribuições'), 'GO');
    }],

    ['extrairUfDoTexto NÃO confunde "DE R$ <valor>" com sigla de UF (falso positivo do padrão cidade/UF)', () => {
      assert.strictEqual(
        ufLookup.extrairUfDoTexto('004/26.41 Professor Assistente A - DEP São Carlos 1 Vaga DE R$ 275,00'),
        null
      );
    }],

    ['extrairUfDoTexto sem nenhum sinal reconhecível retorna null', () => {
      assert.strictEqual(ufLookup.extrairUfDoTexto('Processo seletivo simplificado para contratação de professor substituto.'), null);
    }],

    ['extrairUfDoTexto: string vazia/nula não quebra', () => {
      assert.strictEqual(ufLookup.extrairUfDoTexto(''), null);
      assert.strictEqual(ufLookup.extrairUfDoTexto(null), null);
    }],

    ['resolverUf prioriza o lookup por instituição sobre o texto', () => {
      const uf = ufLookup.resolverUf({
        orgao: 'Universidade Federal de São Carlos',
        hierarchyStr: null,
        texto: 'no Estado do Rio de Janeiro' // texto aponta RJ, mas orgao é SP — orgao deve vencer
      });
      assert.strictEqual(uf, 'SP');
    }],

    ['resolverUf cai pro texto quando o lookup por instituição não encontra nada', () => {
      const uf = ufLookup.resolverUf({
        orgao: 'Instituição Sem Entrada no Lookup',
        hierarchyStr: null,
        texto: 'sediada no Estado de Minas Gerais'
      });
      assert.strictEqual(uf, 'MG');
    }],

    ['golden set: extrairUfDoTexto não produz falso positivo em nenhum dos 7 casos reais (lookup por instituição já cobre todos)', () => {
      for (const caso of goldenSet) {
        const porTexto = ufLookup.extrairUfDoTexto(caso.textoEnriquecido);
        // não afirmamos que é sempre null — só que, quando não-null, tem que
        // bater com o que o lookup por orgao (fonte confiável) já resolve.
        if (porTexto) {
          const porOrgao = ufLookup.buscarUf(caso.esperado.orgao, caso.rawItem.hierarchyStr);
          assert.strictEqual(porTexto, porOrgao, `${caso.id}: extração de texto (${porTexto}) diverge do lookup por órgão (${porOrgao})`);
        }
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
