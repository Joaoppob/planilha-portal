#!/usr/bin/env node
'use strict';

/**
 * Testa especificamente o CONSERTO da chave de dedupe (Onda dedupe-canonico,
 * conserto de 2026-08-27): a chave passou de `canonizar(orgao)+area+
 * data_publicacao` para `canonizar(orgao)+area+inscricao_inicio`, porque
 * `data_publicacao` tem semântica DIFERENTE por fonte (DOU: data do edital;
 * PCI: início da inscrição — `datas.inicio`) e nunca batia entre fontes pro
 * mesmo edital (medido: 0 de 24 pares reais). Ver lib/store.js
 * `chaveCanonicaDedupe` para a explicação completa e `tests/orgao-canonico.test.js`
 * para a cobertura ponta a ponta original (atualizada neste mesmo conserto).
 *
 * Este arquivo cobre especificamente a REGRA DE SEGURANÇA INEGOCIÁVEL do
 * briefing: se qualquer um dos dois lados não tiver `inscricao_inicio`, NÃO
 * deduplica — preferir a duplicata visível ao sumiço invisível. Sem fallback
 * pra `data_publicacao`.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const store = require('../lib/store');
const { montarRegistro } = require('../lib/schema');
const { gerarId } = require('../lib/hash');

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

function novoStorePathTemp() {
  return path.join(os.tmpdir(), `radar-dedupe-inscricao-test-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`);
}

function main() {
  console.log('\n=== dedupe-chave-inscricao.test.js ===\n');
  let passed = 0;
  let failed = 0;

  const tests = [];

  tests.push([
    'chaveCanonicaDedupe: dois registros com data_publicacao IDÊNTICA mas orgao/area iguais e SEM inscricao_inicio em nenhum dos dois NUNCA colidem (chave null dos dois lados)',
    () => {
      const a = { orgao: 'Universidade Federal de Alfenas', area: 'Design', data_publicacao: '2026-08-12' };
      const b = { orgao: 'UNIFAL - Universidade Federal de Alfenas', area: 'Design', data_publicacao: '2026-08-12' };
      assert.strictEqual(store.chaveCanonicaDedupe(a), null, 'sem inscricao_inicio, a chave TEM que ser null, mesmo com data_publicacao batendo');
      assert.strictEqual(store.chaveCanonicaDedupe(b), null);
    }
  ]);

  tests.push([
    'store.salvar(): registro NOVO sem inscricao_inicio nunca deduplica contra registro existente com inscricao_inicio (falta de UM lado já basta pra não deduplicar)',
    () => {
      const p = novoStorePathTemp();
      const dadosExistente = {
        fonte: 'dou',
        orgao: 'Fundação Universidade Federal de São Carlos',
        area: 'Design',
        inscricao_inicio: '2026-08-21',
        url: 'https://exemplo.org/existente'
      };
      const dadosNovo = {
        fonte: 'pci',
        orgao: 'UFSCar - Universidade Federal de São Carlos',
        area: 'Design',
        inscricao_inicio: null, // PCI não conseguiu extrair a data desta vez — regra de segurança: não deduplica
        url: 'https://exemplo.org/novo'
      };
      const registroExistente = montarRegistro({ ...dadosExistente, id: gerarId(dadosExistente) });
      const registroNovo = montarRegistro({ ...dadosNovo, id: gerarId(dadosNovo) });

      store.salvar(registroExistente, p);
      const resultado = store.salvar(registroNovo, p);

      assert.strictEqual(resultado.novo, true, 'sem inscricao_inicio no registro recém-chegado, a chave canônica é null — preferir duplicata visível a sumiço invisível');
      assert.strictEqual(store.carregarTudo(p).length, 2);
      fs.unlinkSync(p);
    }
  ]);

  tests.push([
    'store.salvar(): registro JÁ SALVO sem inscricao_inicio nunca é achado pela chave canônica, mesmo que o recém-chegado tenha a data (falta do lado OPOSTO também bloqueia)',
    () => {
      const p = novoStorePathTemp();
      const dadosExistenteSemData = {
        fonte: 'dou',
        orgao: 'Fundação Universidade Federal de São Carlos',
        area: 'Design',
        inscricao_inicio: null, // DOU não conseguiu extrair (enriquecer falhou, ex.)
        url: 'https://exemplo.org/existente-sem-data'
      };
      const dadosNovoComData = {
        fonte: 'pci',
        orgao: 'UFSCar - Universidade Federal de São Carlos',
        area: 'Design',
        inscricao_inicio: '2026-08-21',
        url: 'https://exemplo.org/novo-com-data'
      };
      const registroExistente = montarRegistro({ ...dadosExistenteSemData, id: gerarId(dadosExistenteSemData) });
      const registroNovo = montarRegistro({ ...dadosNovoComData, id: gerarId(dadosNovoComData) });

      store.salvar(registroExistente, p);
      const resultado = store.salvar(registroNovo, p);

      assert.strictEqual(resultado.novo, true, 'o registro já salvo não tem inscricao_inicio — chaveCanonicaDedupe(existente) é null, então NADA bate contra ele por chave canônica');
      assert.strictEqual(store.carregarTudo(p).length, 2);
      fs.unlinkSync(p);
    }
  ]);

  tests.push([
    'store.salvar(): o BUG ORIGINAL não ressuscita — data_publicacao IDÊNTICA entre fontes (coincidência) não deve, sozinha, deduplicar sem inscricao_inicio',
    () => {
      const p = novoStorePathTemp();
      const dadosA = {
        fonte: 'dou',
        orgao: 'Fundação Universidade Federal de São Carlos',
        area: 'Design',
        data_publicacao: '2026-08-12',
        inscricao_inicio: null,
        url: 'https://exemplo.org/a'
      };
      const dadosB = {
        fonte: 'pci',
        orgao: 'UFSCar - Universidade Federal de São Carlos',
        area: 'Design',
        data_publicacao: '2026-08-12', // mesma data_publicacao, de propósito — não pode ser o que decide
        inscricao_inicio: null,
        url: 'https://exemplo.org/b'
      };
      const registroA = montarRegistro({ ...dadosA, id: gerarId(dadosA) });
      const registroB = montarRegistro({ ...dadosB, id: gerarId(dadosB) });

      store.salvar(registroA, p);
      const resultado = store.salvar(registroB, p);

      assert.strictEqual(resultado.novo, true, 'sem inscricao_inicio nos dois lados, data_publicacao batendo por coincidência NÃO pode deduplicar — nunca há fallback pra data_publicacao');
      assert.strictEqual(store.carregarTudo(p).length, 2);
      fs.unlinkSync(p);
    }
  ]);

  tests.push([
    'store.salvar(): prova do UFSCar/Design com data_publicacao DIVERGENTE (semântica real DOU x PCI) — casa pela inscricao_inicio',
    () => {
      const p = novoStorePathTemp();
      const dadosDou = {
        fonte: 'dou',
        orgao: 'Fundação Universidade Federal de São Carlos',
        area: 'Design',
        data_publicacao: '2026-08-12', // publicação do edital (semântica real do DOU)
        inscricao_inicio: '2026-08-21',
        url: 'https://www.in.gov.br/web/dou/-/edital-n-4-de-11-de-agosto-de-2026-724927473'
      };
      const dadosPci = {
        fonte: 'pci',
        orgao: 'UFSCar - Universidade Federal de São Carlos',
        area: 'Design',
        data_publicacao: '2026-08-21', // datas.inicio (semântica real da PCI) — DIVERGE do DOU
        inscricao_inicio: '2026-08-21',
        url: 'https://www.pciconcursos.com.br/noticias/ufscar-sp-abre-concurso-publico-com-diversas-vagas-para-professor-de-magisterio-superior'
      };
      const registroDou = montarRegistro({ ...dadosDou, id: gerarId(dadosDou) });
      const registroPci = montarRegistro({ ...dadosPci, id: gerarId(dadosPci) });

      store.salvar(registroDou, p);
      const resultado = store.salvar(registroPci, p);

      assert.strictEqual(resultado.novo, false, 'ANTES do conserto isso dava 0/24 — a chave por data_publicacao nunca batia. DEPOIS, casa pela inscricao_inicio');
      assert.strictEqual(resultado.motivo, 'chave_canonica');
      assert.strictEqual(store.carregarTudo(p).length, 1);
      fs.unlinkSync(p);
    }
  ]);

  for (const [name, fn] of tests) {
    if (runTest(name, fn)) passed++;
    else failed++;
  }

  console.log(`\n${passed} passou(aram), ${failed} falhou(aram)\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
