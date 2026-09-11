#!/usr/bin/env node
'use strict';

/**
 * Testa filtro de keyword (estágio 1) — requisito mínimo do briefing.
 * Usa itens REAIS capturados do DOU (tests/fixtures/dou-itens-reais.json,
 * 12/08/2026) para os casos de descarte e falso-positivo; os matches
 * positivos usam config/keywords.json real.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const keywordFiltro = require('../lib/keyword-filtro');
const dou = require('../fontes/dou');

const keywordsConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'keywords.json'), 'utf8'));
const negativosConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'negativos.json'), 'utf8'));
const itensReais = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'dou-itens-reais.json'), 'utf8'));

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
  console.log('\n=== keyword-filtro.test.js ===\n');
  let passed = 0;
  let failed = 0;

  const tests = [
    ['termo "design digital" passa e herda área Design', () => {
      const r = keywordFiltro.avaliar('Concurso para Professor de Design Digital na UFX', keywordsConfig);
      assert.strictEqual(r.passou, true);
      assert.strictEqual(r.areaPrincipal, 'Design');
    }],

    ['termo "UX" passa e herda área UX/IHC', () => {
      const r = keywordFiltro.avaliar('Vaga para pesquisador em UX', keywordsConfig);
      assert.strictEqual(r.passou, true);
      assert.strictEqual(r.areaPrincipal, 'UX/IHC');
    }],

    ['matching é insensível a acento e caixa', () => {
      const r = keywordFiltro.avaliar('INTERAÇÃO HUMANO-COMPUTADOR', keywordsConfig);
      assert.strictEqual(r.passou, true);
    }],

    ['texto sem nenhum termo relevante é descartado (item real CRA-RJ)', () => {
      const texto = dou.textoParaFiltro(itensReais.crarj);
      const r = keywordFiltro.avaliar(texto, keywordsConfig);
      assert.strictEqual(r.passou, false);
    }],

    ['múltiplos termos: área principal é a de maior peso configurado', () => {
      // "design" (peso 40) e "tecnologia educacional" (peso 20) no mesmo texto
      const r = keywordFiltro.avaliar('Professor de design e também de tecnologia educacional', keywordsConfig);
      assert.strictEqual(r.passou, true);
      assert.strictEqual(r.areaPrincipal, 'Design');
    }],

    ['regressão real (12/08/2026 ao vivo): "ux" NÃO deve casar como substring dentro de "auxiliar"', () => {
      // achado em produção: o edital marítimo da Transpetro ("AUXILIAR DE
      // SAÚDE", "AUXILIAR DE ENFERMAGEM DE ...") batia no termo "ux" com
      // includes() puro. contemTermo() usa fronteira de palavra (\b) e
      // corrige isso.
      const texto = dou.textoParaFiltro(itensReais.transpetro);
      const filtro = keywordFiltro.avaliar(texto, keywordsConfig);
      assert.strictEqual(filtro.passou, false, `não deveria casar termo nenhum, casou: ${JSON.stringify(filtro.matches)}`);
      assert.strictEqual(keywordFiltro.contemTermo('auxiliar de saude', 'ux'), false);
      assert.strictEqual(keywordFiltro.contemTermo('vaga de ux pleno', 'ux'), true);
    }],

    ['veto negativo: item com "informática" de compra de material (falso positivo de área) é vetado por termo técnico-administrativo', () => {
      const textoComFalsoPositivo = 'contratação de serviços de informática para o setor';
      const filtro = keywordFiltro.avaliar(textoComFalsoPositivo, keywordsConfig);
      assert.strictEqual(filtro.passou, true);
      const negativo = keywordFiltro.contemNegativo(textoComFalsoPositivo + ' cargo de técnico administrativo', negativosConfig.termos);
      assert.strictEqual(negativo, true);
    }],

    ['contemNegativo é false quando não há termo negativo', () => {
      const negativo = keywordFiltro.contemNegativo('Professor Adjunto de Design Digital', negativosConfig.termos);
      assert.strictEqual(negativo, false);
    }],

    ['termos vêm do arquivo de config, não hardcoded (novo termo customizado funciona)', () => {
      const configCustom = { termos: [{ termo: 'xilogravura', area: 'Design', subarea: 'Arte' }], pesos_area: { Design: 40 } };
      const r = keywordFiltro.avaliar('Oficina de xilogravura', configCustom);
      assert.strictEqual(r.passou, true);
    }],

    ['resolverPesoArea: área canônica bate direto em pesos_area, sem precisar de sinônimo', () => {
      assert.strictEqual(keywordFiltro.resolverPesoArea('Computação/IA', keywordsConfig), 30);
      assert.strictEqual(keywordFiltro.resolverPesoArea('Design', keywordsConfig), 40);
    }],

    ['resolverPesoArea: grafia real do LLM ("COMPUTAÇÃO") resolve pelo mapa de sinônimos pro mesmo peso de Computação/IA (Onda 2.4)', () => {
      assert.strictEqual(keywordFiltro.resolverPesoArea('COMPUTAÇÃO', keywordsConfig), 30);
      assert.strictEqual(keywordFiltro.resolverPesoArea('Tecnologia da Informação', keywordsConfig), 30);
      assert.strictEqual(keywordFiltro.resolverPesoArea('Aprendizado de Máquina', keywordsConfig), 30);
    }],

    ['resolverPesoArea: área real mas distinta (fora do mapa por decisão, não por lacuna) fica em 0, não inventa peso', () => {
      assert.strictEqual(keywordFiltro.resolverPesoArea('Probabilidade e Estatística', keywordsConfig), 0);
    }],

    ['resolverPesoArea: área desconhecida (nem canônica nem sinônimo) e área null ficam em 0', () => {
      assert.strictEqual(keywordFiltro.resolverPesoArea('Engenharia Nuclear', keywordsConfig), 0);
      assert.strictEqual(keywordFiltro.resolverPesoArea(null, keywordsConfig), 0);
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
