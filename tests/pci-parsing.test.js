#!/usr/bin/env node
'use strict';

/**
 * Testa o parsing do coletor PCI Concursos (fontes/pci.js) contra dados
 * REAIS capturados de mcp.pciconcursos.com.br em 27/08/2026 (ver
 * tests/fixtures/pci-concursos-reais.json), sem rede. Cobre o ponto mais
 * frágil do coletor: o achatamento do guarda-chuva `cargos[]` em itens
 * individuais e a ESTABILIDADE do `subedital`/`id` — requisito central do
 * briefing (mesmo concurso não pode oscilar de id entre execuções, e dois
 * cargos distintos do mesmo concurso não podem colidir).
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const pci = require('../fontes/pci');
const vagaDocente = require('../lib/vaga-docente');
const subeditalExtrator = require('../lib/subedital-extrator');
const hash = require('../lib/hash');
const keywordsConfig = require('../config/keywords.json');

const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'pci-concursos-reais.json'), 'utf8'));

function mainTests() {
  return [
    ['fonte declara id/nome corretos', () => {
      assert.strictEqual(pci.id, 'pci');
      assert.ok(pci.nome.includes('PCI'));
    }],

    ['_internal.subeditalDoCargo normaliza espaço em branco de forma determinística', () => {
      assert.strictEqual(pci._internal.subeditalDoCargo('  PROFESSOR -   DESIGN   '), 'PROFESSOR - DESIGN');
      assert.strictEqual(pci._internal.subeditalDoCargo('PROFESSOR - DESIGN'), pci._internal.subeditalDoCargo('  PROFESSOR - DESIGN  '));
    }],

    ['flattenConcursos: guarda-chuva real da UFSCar produz 1 item por cargo, todos com o mesmo concursoId/orgao/url', () => {
      const { itens } = pci._internal.flattenConcursos([fixture.ufscarGuardaChuva]);
      assert.ok(itens.length > 0, 'esperava pelo menos 1 cargo pré-filtrado no fixture real');
      for (const item of itens) {
        assert.strictEqual(item.concursoId, fixture.ufscarGuardaChuva.id);
        assert.strictEqual(item.orgao, fixture.ufscarGuardaChuva.titulo);
        assert.strictEqual(item.noticiaLink, fixture.ufscarGuardaChuva.noticia.link);
      }
    }],

    ['flattenConcursos: pré-filtro de keyword reduz o guarda-chuva (65 cargos reais) para só os de área de JB', () => {
      const { itens, volumeBruto } = pci._internal.flattenConcursos([fixture.ufscarGuardaChuva]);
      assert.strictEqual(volumeBruto, fixture.ufscarGuardaChuva.cargos.length);
      assert.ok(itens.length < fixture.ufscarGuardaChuva.cargos.length, 'pré-filtro deveria descartar a maioria dos 65 cargos (só ~9 batem Design/Computação/IA)');
      const cargosPreFiltrados = itens.map(i => i.cargoRaw);
      assert.ok(cargosPreFiltrados.includes('PROFESSOR - DESIGN E MÍDIAS DIGITAIS'));
      assert.ok(cargosPreFiltrados.includes('PROFESSOR - DESIGN/DESENHO INDUSTRIAL'));
      assert.ok(!cargosPreFiltrados.includes('PROFESSOR - ODONTOPEDIATRIA'));
    }],

    ['flattenConcursos: concurso com datas.aberto=false é descartado inteiro (defensivo)', () => {
      const fechado = { ...fixture.uerjCargoUnico, datas: { ...fixture.uerjCargoUnico.datas, aberto: false } };
      const { itens } = pci._internal.flattenConcursos([fechado]);
      assert.strictEqual(itens.length, 0);
    }],

    ['textoParaFiltro (guarda-chuva UFSCar, cargo Design) passa no estágio 1 genérico (lib/vaga-docente.js)', () => {
      const { itens } = pci._internal.flattenConcursos([fixture.ufscarGuardaChuva]);
      const itemDesign = itens.find(i => i.cargoRaw === 'PROFESSOR - DESIGN E MÍDIAS DIGITAIS');
      assert.ok(itemDesign, 'fixture deveria conter o cargo de Design da UFSCar');
      const texto = pci.textoParaFiltro(itemDesign);
      assert.ok(vagaDocente.pareceVagaDocente(texto), 'texto deveria conter concurso público + professor + universidade');
    }],

    ['cargo técnico sem "professor" (CRECI, fixture real) bate keyword "design" mas FALHA no estágio 1 genérico (não é vaga docente)', () => {
      const { itens } = pci._internal.flattenConcursos([fixture.creciSemProfessor]);
      const itemAudiovisual = itens.find(i => i.cargoRaw.includes('AUDIOVISUAL DESIGN'));
      assert.ok(itemAudiovisual, 'pré-filtro deveria ter deixado passar o cargo técnico de design (keyword bate)');
      const texto = pci.textoParaFiltro(itemAudiovisual);
      assert.strictEqual(vagaDocente.pareceVagaDocente(texto), false, 'CRECI não é universidade/instituto federal e o cargo não é professor — estágio 1 deve rejeitar');
    }],

    ['normalizarParcial usa datas.inicio/fim da API diretamente (nunca reimplementa inferência de prazo)', () => {
      const { itens } = pci._internal.flattenConcursos([fixture.uerjCargoUnico]);
      assert.strictEqual(itens.length, 1);
      const parcial = pci.normalizarParcial(itens[0]);
      assert.strictEqual(parcial.data_publicacao, fixture.uerjCargoUnico.datas.inicio);
      assert.strictEqual(parcial.inscricao_inicio, fixture.uerjCargoUnico.datas.inicio);
      assert.strictEqual(parcial.inscricao_fim, fixture.uerjCargoUnico.datas.fim);
      assert.strictEqual(parcial.uf, fixture.uerjCargoUnico.uf);
      assert.strictEqual(parcial.url, fixture.uerjCargoUnico.noticia.link);
    }],

    ['normalizarParcial: campos que a fonte não afirma por cargo individual ficam null (vagas, campus, regime, classe, tipo)', () => {
      const { itens } = pci._internal.flattenConcursos([fixture.uerjCargoUnico]);
      const parcial = pci.normalizarParcial(itens[0]);
      assert.strictEqual(parcial.vagas, null);
      assert.strictEqual(parcial.campus, null);
      assert.strictEqual(parcial.regime, null);
      assert.strictEqual(parcial.classe, null);
      assert.strictEqual(parcial.tipo, null);
    }],

    ['enriquecer não faz requisição de rede — devolve texto_bruto igual a textoParaFiltro', async () => {
      const { itens } = pci._internal.flattenConcursos([fixture.uerjCargoUnico]);
      const extra = await pci.enriquecer(itens[0]);
      assert.strictEqual(extra.texto_bruto, pci.textoParaFiltro(itens[0]));
    }],

    ['ESTABILIDADE: o mesmo cargo, achatado duas vezes a partir do MESMO fixture, gera o MESMO id', () => {
      const rodada1 = pci._internal.flattenConcursos([fixture.ufscarGuardaChuva]).itens;
      const rodada2 = pci._internal.flattenConcursos([fixture.ufscarGuardaChuva]).itens;
      const itemDesign1 = rodada1.find(i => i.cargoRaw === 'PROFESSOR - DESIGN E MÍDIAS DIGITAIS');
      const itemDesign2 = rodada2.find(i => i.cargoRaw === 'PROFESSOR - DESIGN E MÍDIAS DIGITAIS');
      const parcial1 = pci.normalizarParcial(itemDesign1);
      const parcial2 = pci.normalizarParcial(itemDesign2);
      const avaliacao1 = subeditalExtrator.avaliarEditalUnico(pci.textoParaFiltro(itemDesign1), keywordsConfig);
      const avaliacao2 = subeditalExtrator.avaliarEditalUnico(pci.textoParaFiltro(itemDesign2), keywordsConfig);
      const id1 = hash.gerarId({ orgao: parcial1.orgao, area: avaliacao1.area, data_publicacao: parcial1.data_publicacao, url: parcial1.url, subedital: parcial1.subedital });
      const id2 = hash.gerarId({ orgao: parcial2.orgao, area: avaliacao2.area, data_publicacao: parcial2.data_publicacao, url: parcial2.url, subedital: parcial2.subedital });
      assert.strictEqual(id1, id2);
    }],

    ['ESTABILIDADE: ordem diferente do array cargos[] (simula resposta da API embaralhada) não muda o subedital de um cargo específico', () => {
      const cargosEmbaralhados = [...fixture.ufscarGuardaChuva.cargos].reverse();
      const concursoEmbaralhado = { ...fixture.ufscarGuardaChuva, cargos: cargosEmbaralhados };

      const itensOrdemOriginal = pci._internal.flattenConcursos([fixture.ufscarGuardaChuva]).itens;
      const itensOrdemInvertida = pci._internal.flattenConcursos([concursoEmbaralhado]).itens;

      const original = itensOrdemOriginal.find(i => i.cargoRaw === 'PROFESSOR - DESIGN/DESENHO INDUSTRIAL');
      const invertido = itensOrdemInvertida.find(i => i.cargoRaw === 'PROFESSOR - DESIGN/DESENHO INDUSTRIAL');

      const pOriginal = pci.normalizarParcial(original);
      const pInvertido = pci.normalizarParcial(invertido);
      assert.strictEqual(pOriginal.subedital, pInvertido.subedital, 'subedital não pode depender da posição no array');
    }],

    ['GRANULARIDADE: dois cargos distintos da MESMA área (Design) no MESMO concurso geram ids DIFERENTES', () => {
      const { itens } = pci._internal.flattenConcursos([fixture.ufscarGuardaChuva]);
      const cargoA = itens.find(i => i.cargoRaw === 'PROFESSOR - DESIGN E MÍDIAS DIGITAIS');
      const cargoB = itens.find(i => i.cargoRaw === 'PROFESSOR - DESIGN/DESENHO INDUSTRIAL');
      assert.ok(cargoA && cargoB, 'fixture real da UFSCar deveria conter os dois cargos de Design');

      const parcialA = pci.normalizarParcial(cargoA);
      const parcialB = pci.normalizarParcial(cargoB);
      const avA = subeditalExtrator.avaliarEditalUnico(pci.textoParaFiltro(cargoA), keywordsConfig);
      const avB = subeditalExtrator.avaliarEditalUnico(pci.textoParaFiltro(cargoB), keywordsConfig);

      assert.strictEqual(avA.area, 'Design');
      assert.strictEqual(avB.area, 'Design');
      assert.strictEqual(parcialA.orgao, parcialB.orgao);
      assert.strictEqual(parcialA.data_publicacao, parcialB.data_publicacao);
      assert.strictEqual(parcialA.url, parcialB.url);
      assert.notStrictEqual(parcialA.subedital, parcialB.subedital);

      const idA = hash.gerarId({ orgao: parcialA.orgao, area: avA.area, data_publicacao: parcialA.data_publicacao, url: parcialA.url, subedital: parcialA.subedital });
      const idB = hash.gerarId({ orgao: parcialB.orgao, area: avB.area, data_publicacao: parcialB.data_publicacao, url: parcialB.url, subedital: parcialB.subedital });
      assert.notStrictEqual(idA, idB, 'sem subedital, esses dois cargos colidiriam no mesmo id (orgao|area|data|url idênticos)');
    }]
  ];
}

async function runAll() {
  console.log('\n=== pci-parsing.test.js ===\n');
  let passed = 0;
  let failed = 0;

  for (const [name, fn] of mainTests()) {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (error) {
      console.log(`  ✗ ${name}`);
      console.error(`    ${error.message}`);
      failed++;
    }
  }

  console.log(`\n${passed} passou(aram), ${failed} falhou(aram)\n`);
  process.exit(failed > 0 ? 1 : 0);
}

runAll();
