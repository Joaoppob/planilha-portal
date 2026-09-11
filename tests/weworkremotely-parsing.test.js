#!/usr/bin/env node
'use strict';

/**
 * Testa o parsing do coletor We Work Remotely (fontes/weworkremotely.js)
 * contra RSS REAL capturado em 27/08/2026 (ver
 * tests/fixtures/wwr-design-reais.rss e wwr-programming-reais.rss,
 * descrições truncadas pra reduzir tamanho de fixture — todas as outras
 * tags preservadas verbatim, incluindo os dois achados reais que motivaram
 * os casos de teste: duplicata de `<link>` dentro do próprio feed e
 * `<type/>` self-closing), sem rede.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const wwr = require('../fontes/weworkremotely');
const vagaMercado = require('../lib/vaga-mercado');

const rssDesign = fs.readFileSync(path.join(__dirname, 'fixtures', 'wwr-design-reais.rss'), 'utf8');
const rssProgramming = fs.readFileSync(path.join(__dirname, 'fixtures', 'wwr-programming-reais.rss'), 'utf8');

function mainTests() {
  return [
    ['fonte declara trilha mercado', () => {
      assert.strictEqual(wwr.trilha, 'mercado');
      assert.strictEqual(wwr.id, 'weworkremotely');
    }],

    ['_internal.dataISO converte RFC822 real para AAAA-MM-DD', () => {
      assert.strictEqual(wwr._internal.dataISO('Wed, 26 Aug 2026 11:52:22 +0000'), '2026-08-26');
    }],

    ['_internal.dataISO retorna null para ausente/inválida (nunca cai no epoch de new Date(null))', () => {
      assert.strictEqual(wwr._internal.dataISO(null), null);
      assert.strictEqual(wwr._internal.dataISO(''), null);
      assert.strictEqual(wwr._internal.dataISO('lixo'), null);
    }],

    ['_internal.splitTituloEmpresaCargo corta só no PRIMEIRO ":" (título real com dois-pontos no cargo)', () => {
      const { empresa, cargo } = wwr._internal.splitTituloEmpresaCargo(
        'IxDF - Interaction Design Foundation: Course Director: UX, UI, and AI '
      );
      assert.strictEqual(empresa, 'IxDF - Interaction Design Foundation');
      assert.strictEqual(cargo, 'Course Director: UX, UI, and AI');
    }],

    ['_internal.splitTituloEmpresaCargo decodifica entidade HTML no título (&amp;)', () => {
      const { cargo } = wwr._internal.splitTituloEmpresaCargo('Empresa: Compliance &amp; Authorization');
      assert.strictEqual(cargo, 'Compliance & Authorization');
    }],

    ['_internal.parseFeed extrai o item real da IxDF com todos os campos (skills, state, expires_at)', () => {
      const { itens } = wwr._internal.parseFeed(rssDesign, 'remote-design-jobs');
      const ixdf = itens.find(i => i.jobUrl.includes('ixdf-interaction-design-foundation-course-director'));
      assert.ok(ixdf, 'item real da IxDF deveria estar no fixture');
      assert.strictEqual(ixdf.name, 'Course Director: UX, UI, and AI');
      assert.strictEqual(ixdf.careerPageName, 'IxDF - Interaction Design Foundation');
      assert.strictEqual(ixdf.estado, 'Texas');
      assert.ok(ixdf.skills.includes('UX'));
      assert.ok(ixdf.expiresAt);
    }],

    ['_internal.parseFeed: item com <type/> self-closing (achado real) trata type como ausente sem quebrar o parse', () => {
      const { itens } = wwr._internal.parseFeed(rssDesign, 'remote-design-jobs');
      const iisd = itens.filter(i => i.jobUrl.includes('iisd-consultancy'));
      assert.ok(iisd.length >= 1, 'item real da IISD (sem <type>) deveria estar no fixture');
      // parseFeed não descarta por falta de <type> — só exige name/jobUrl/careerPageName
      for (const item of iisd) {
        assert.ok(item.name);
        assert.ok(item.jobUrl);
        assert.ok(item.careerPageName);
      }
    }],

    ['_internal.parseFeed: item da categoria Programming sem <state>/<skills>/<expires_at> não quebra (campos ficam null)', () => {
      const { itens } = wwr._internal.parseFeed(rssProgramming, 'remote-programming-jobs');
      assert.strictEqual(itens.length, 1);
      const item = itens[0];
      assert.strictEqual(item.estado, null);
      assert.strictEqual(item.skills, null);
      assert.strictEqual(item.expiresAt, null);
      assert.strictEqual(item.careerPageName, 'Toptal');
      assert.strictEqual(item.name, 'Data Scientist for Top Cosmetic firm');
    }],

    ['itens brutos já nascem com name/jobUrl/careerPageName — passam no gate genérico lib/vaga-mercado.js', () => {
      const { itens } = wwr._internal.parseFeed(rssDesign, 'remote-design-jobs');
      const ixdf = itens.find(i => i.jobUrl.includes('ixdf-interaction-design-foundation-course-director'));
      assert.strictEqual(vagaMercado.pareceVagaMercado(ixdf), true);
    }],

    ['item bruto NUNCA expõe campo "country" — evita falso-rejeite do gate genérico (WWR não é "vaga no Brasil" como a Gupy)', () => {
      const { itens } = wwr._internal.parseFeed(rssDesign, 'remote-design-jobs');
      for (const item of itens) {
        assert.strictEqual(Object.prototype.hasOwnProperty.call(item, 'country'), false);
      }
    }],

    ['normalizarParcial: modalidade sempre "remoto" (premissa do site, não inferência)', () => {
      const { itens } = wwr._internal.parseFeed(rssDesign, 'remote-design-jobs');
      const parcial = wwr.normalizarParcial(itens[0]);
      assert.strictEqual(parcial.modalidade, 'remoto');
    }],

    ['normalizarParcial: data_publicacao/inscricao_inicio em AAAA-MM-DD a partir do pubDate real', () => {
      const { itens } = wwr._internal.parseFeed(rssDesign, 'remote-design-jobs');
      const ixdf = itens.find(i => i.jobUrl.includes('ixdf-interaction-design-foundation-course-director'));
      const parcial = wwr.normalizarParcial(ixdf);
      assert.strictEqual(parcial.data_publicacao, '2026-08-26');
      assert.strictEqual(parcial.inscricao_inicio, '2026-08-26');
      assert.strictEqual(parcial.inscricao_fim, '2026-09-25'); // expires_at real do item
    }],

    ['normalizarParcial: inscricao_fim fica null quando <expires_at> está ausente (categoria Programming)', () => {
      const { itens } = wwr._internal.parseFeed(rssProgramming, 'remote-programming-jobs');
      const parcial = wwr.normalizarParcial(itens[0]);
      assert.strictEqual(parcial.inscricao_fim, null);
    }],

    ['normalizarParcial: subedital/classe/regime/tipo/vagas/uf sempre null na trilha mercado', () => {
      const { itens } = wwr._internal.parseFeed(rssDesign, 'remote-design-jobs');
      const parcial = wwr.normalizarParcial(itens[0]);
      assert.strictEqual(parcial.subedital, null);
      assert.strictEqual(parcial.classe, null);
      assert.strictEqual(parcial.regime, null);
      assert.strictEqual(parcial.tipo, null);
      assert.strictEqual(parcial.vagas, null);
      assert.strictEqual(parcial.uf, null);
    }],

    ['enriquecer não faz requisição de rede — devolve texto_bruto igual a textoParaFiltro', async () => {
      const { itens } = wwr._internal.parseFeed(rssDesign, 'remote-design-jobs');
      const extra = await wwr.enriquecer(itens[0]);
      assert.strictEqual(extra.texto_bruto, wwr.textoParaFiltro(itens[0]));
    }],

    ['DEDUPE: coletar() combinaria os 3 itens do fixture design em 2 (link duplicado da IISD)', () => {
      // Reproduz o dedupe de coletar() sem rede: mesma lógica (Map por jobUrl)
      // aplicada diretamente sobre os itens já parseados do fixture.
      const { itens: itensDesign } = wwr._internal.parseFeed(rssDesign, 'remote-design-jobs');
      assert.strictEqual(itensDesign.length, 3, 'fixture real tem 3 <item> (2 IISD duplicados + 1 IxDF)');
      const porLink = new Map();
      for (const item of itensDesign) {
        if (!porLink.has(item.jobUrl)) porLink.set(item.jobUrl, item);
      }
      assert.strictEqual(porLink.size, 2, 'dedupe por jobUrl deveria colapsar os 2 itens IISD (mesmo link) em 1');
    }]
  ];
}

async function runAll() {
  console.log('\n=== weworkremotely-parsing.test.js ===\n');
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
