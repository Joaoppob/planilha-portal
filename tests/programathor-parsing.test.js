#!/usr/bin/env node
'use strict';

/**
 * Testa o parsing do coletor ProgramaThor (fontes/programathor.js) contra
 * HTML REAL capturado de programathor.com.br em 26/08/2026 (ver
 * tests/fixtures/programathor-*), sem rede. Mesmo espírito de
 * tests/dou-parsing.test.js e tests/gupy-parsing.test.js — cobre a parte
 * mais frágil do coletor: o sanitizador do bug real de JSON-LD malformado,
 * a extração do bloco JobPosting, o parsing da listagem e o mapeamento
 * JSON-LD -> campos do schema (stack/tipo_contrato/faixa_salarial, campos
 * novos desta onda). O gate do estágio 1 (lib/vaga-mercado.js) tem teste
 * próprio em tests/vaga-mercado.test.js — aqui só confirmamos que o rawItem
 * que este coletor produz de fato SATISFAZ esse gate (ver último teste).
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const programathor = require('../fontes/programathor');
const vagaMercado = require('../lib/vaga-mercado');

const htmlListagem = fs.readFileSync(path.join(__dirname, 'fixtures', 'programathor-listagem.html'), 'utf8');
const htmlConvolut = fs.readFileSync(path.join(__dirname, 'fixtures', 'programathor-detalhe-convolut.html'), 'utf8');
const htmlCuiaba = fs.readFileSync(path.join(__dirname, 'fixtures', 'programathor-detalhe-cuiaba.html'), 'utf8');

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
  console.log('\n=== programathor-parsing.test.js ===\n');
  let passed = 0;
  let failed = 0;

  const tests = [
    ['fonte declara trilha mercado', () => {
      assert.strictEqual(programathor.trilha, 'mercado');
      assert.strictEqual(programathor.id, 'programathor');
    }],

    // Achado real crítico (ver cabeçalho de fontes/programathor.js): o
    // JSON-LD do ProgramaThor tem quebra de linha LITERAL dentro da string
    // "description" — JSON.parse cru FALHA nos 2 fixtures reais capturados.
    ['achado real: JSON.parse cru FALHA no JSON-LD sem sanitizar (prova do bug, não regressão do sanitizador)', () => {
      const m = /<script type="application\/ld\+json">\s*([\s\S]*?)<\/script>/.exec(htmlConvolut);
      assert.throws(() => JSON.parse(m[1]), /Bad control character/);
    }],

    ['sanitizarControlChars corrige o JSON-LD real (Convolut) — JSON.parse funciona depois', () => {
      const m = /<script type="application\/ld\+json">\s*([\s\S]*?)<\/script>/.exec(htmlConvolut);
      const obj = JSON.parse(programathor._internal.sanitizarControlChars(m[1]));
      assert.strictEqual(obj['@type'], 'JobPosting');
    }],

    ['sanitizarControlChars nunca mexe em conteúdo fora de string (JSON estrutural intacto)', () => {
      const jsonValido = '{"a": 1, "b": [1,2,3], "c": {"d": 2}}';
      assert.strictEqual(programathor._internal.sanitizarControlChars(jsonValido), jsonValido);
    }],

    ['extrairJobPosting acha o bloco JobPosting (não o BreadcrumbList que vem depois) — Convolut', () => {
      const jp = programathor._internal.extrairJobPosting(htmlConvolut);
      assert.ok(jp);
      assert.strictEqual(jp['@type'], 'JobPosting');
      assert.strictEqual(jp.hiringOrganization.name, 'Convolut');
      assert.strictEqual(jp.datePosted, '2026-08-25');
      assert.strictEqual(jp.validThrough, '2026-11-24');
      assert.strictEqual(jp.employmentType, 'CONTRACTOR');
    }],

    ['extrairJobPosting: caso Cuiabá (FULL_TIME, sem baseSalary, endereço com vírgula)', () => {
      const jp = programathor._internal.extrairJobPosting(htmlCuiaba);
      assert.ok(jp);
      assert.strictEqual(jp.employmentType, 'FULL_TIME');
      assert.strictEqual(jp.baseSalary, undefined);
      assert.strictEqual(jp.jobLocation.address.addressLocality, 'Cuiabá, Mato Grosso');
    }],

    ['extrairJobPosting: html sem bloco JobPosting retorna null, nunca lança', () => {
      assert.strictEqual(programathor._internal.extrairJobPosting('<html><body>nada aqui</body></html>'), null);
    }],

    ['cidadeUfDeAddressLocality: formato "Cidade/UF"', () => {
      assert.deepStrictEqual(programathor._internal.cidadeUfDeAddressLocality('São Caetano do Sul/SP'), {
        cidade: 'São Caetano do Sul',
        uf: 'SP'
      });
    }],

    ['cidadeUfDeAddressLocality: formato "Cidade, Nome do Estado" (item real: Cuiabá, Mato Grosso)', () => {
      assert.deepStrictEqual(programathor._internal.cidadeUfDeAddressLocality('Cuiabá, Mato Grosso'), {
        cidade: 'Cuiabá',
        uf: 'MT'
      });
    }],

    ['cidadeUfDeAddressLocality: cidade pura sem UF/estado (item real: São Paulo) -> uf null, nunca inventa', () => {
      assert.deepStrictEqual(programathor._internal.cidadeUfDeAddressLocality('São Paulo'), {
        cidade: 'São Paulo',
        uf: null
      });
    }],

    ['montarEnriquecimento: baseSalary presente (Convolut, R$18.000/mês) vira faixa_salarial formatada', () => {
      const jp = programathor._internal.extrairJobPosting(htmlConvolut);
      const e = programathor._internal.montarEnriquecimento(jp, { name: 'x', careerPageName: 'x' });
      assert.strictEqual(e.faixa_salarial, 'Até R$18.000/mês');
      assert.strictEqual(e.tipo_contrato, 'PJ');
      assert.strictEqual(e.orgao, 'Convolut');
      assert.strictEqual(e.campus, 'São Paulo');
      assert.strictEqual(e.data_publicacao, '2026-08-25');
      assert.strictEqual(e.inscricao_fim, '2026-11-24');
      assert.ok(e.texto_bruto.includes('LLM'));
    }],

    ['montarEnriquecimento: baseSalary ausente (Cuiabá) vira faixa_salarial null, nunca inventa', () => {
      const jp = programathor._internal.extrairJobPosting(htmlCuiaba);
      const e = programathor._internal.montarEnriquecimento(jp, { name: 'x', careerPageName: 'x' });
      assert.strictEqual(e.faixa_salarial, null);
      assert.strictEqual(e.tipo_contrato, 'CLT');
      assert.strictEqual(e.uf, 'MT');
    }],

    ['montarEnriquecimento: nunca inclui a chave modalidade (preserva o valor da listagem no merge de radar.js)', () => {
      const jp = programathor._internal.extrairJobPosting(htmlConvolut);
      const e = programathor._internal.montarEnriquecimento(jp, { name: 'x', careerPageName: 'x' });
      assert.strictEqual('modalidade' in e, false);
    }],

    ['montarEnriquecimento: stack extraído do bloco "Habilidades" da description (item real Convolut)', () => {
      const jp = programathor._internal.extrairJobPosting(htmlConvolut);
      const e = programathor._internal.montarEnriquecimento(jp, {});
      assert.deepStrictEqual(e.stack, ['AI Agents', 'Docker', 'Python', 'ReactJS', 'TypeScript']);
    }],

    ['parseLocalModalidade: "Cidade/UF  (Híbrido)" (item real RDC VIAGENS)', () => {
      const r = programathor._internal.parseLocalModalidade('São Caetano do Sul/SP  (Híbrido)');
      assert.strictEqual(r.local, 'São Caetano do Sul/SP');
      assert.strictEqual(r.modalidade, 'hibrido');
    }],

    ['parseLocalModalidade: "Remoto" puro (item real LOLDESIGN) -> local null, modalidade remoto', () => {
      const r = programathor._internal.parseLocalModalidade('Remoto');
      assert.strictEqual(r.local, null);
      assert.strictEqual(r.modalidade, 'remoto');
    }],

    ['parseLocalModalidade: "(Presencial)" (item real Grupo Nunchi)', () => {
      const r = programathor._internal.parseLocalModalidade('Florianópolis  (Presencial)');
      assert.strictEqual(r.local, 'Florianópolis');
      assert.strictEqual(r.modalidade, 'presencial');
    }],

    ['parseListagem: extrai os 4 cards reais do fixture (id, slug, título, empresa, local)', () => {
      const itens = programathor._internal.parseListagem(htmlListagem);
      assert.strictEqual(itens.length, 4);

      const convolut = itens.find(i => i.ptId === '33752');
      assert.ok(convolut, 'card do job 33752 (Convolut) deveria estar presente');
      assert.strictEqual(convolut.slug, 'desenvolvedor-a-full-stack-python-ai-llm');
      assert.strictEqual(convolut.careerPageName, 'Convolut');
      assert.strictEqual(convolut.localBruto, 'São Paulo (Híbrido)');
      assert.strictEqual(convolut.jobUrl, 'https://programathor.com.br/jobs/33752-desenvolvedor-a-full-stack-python-ai-llm');
      assert.ok(convolut.name.includes('Full Stack Python AI/LLM'));
    }],

    ['parseListagem: título com badge prefixado (📍 PRESENCIAL...) não quebra a extração (item real Grupo Nunchi)', () => {
      const itens = programathor._internal.parseListagem(htmlListagem);
      const nunchi = itens.find(i => i.ptId === '33747');
      assert.ok(nunchi);
      assert.ok(nunchi.name.includes('Full Stack Pleno'), `título extraído: "${nunchi.name}"`);
    }],

    ['parseListagem: página sem nenhum card retorna array vazio (sinal de parada da paginação)', () => {
      assert.deepStrictEqual(programathor._internal.parseListagem('<html><body>sem vagas aqui</body></html>'), []);
    }],

    ['normalizarParcial: baseline da listagem (sem rede) — subedital/classe/regime/tipo/vagas sempre null, stack sempre []', () => {
      const itens = programathor._internal.parseListagem(htmlListagem);
      const convolut = itens.find(i => i.ptId === '33752');
      const parcial = programathor.normalizarParcial(convolut);
      assert.strictEqual(parcial.fonte, 'programathor');
      assert.strictEqual(parcial.trilha, 'mercado');
      assert.strictEqual(parcial.orgao, 'Convolut');
      assert.strictEqual(parcial.modalidade, 'hibrido');
      assert.strictEqual(parcial.campus, 'São Paulo');
      assert.strictEqual(parcial.subedital, null);
      assert.strictEqual(parcial.classe, null);
      assert.strictEqual(parcial.regime, null);
      assert.strictEqual(parcial.tipo, null);
      assert.strictEqual(parcial.vagas, null);
      assert.deepStrictEqual(parcial.stack, []);
      assert.strictEqual(parcial.tipo_contrato, null);
      assert.strictEqual(parcial.faixa_salarial, null);
    }],

    ['o rawItem que este coletor produz SATISFAZ o gate genérico da trilha (lib/vaga-mercado.js)', () => {
      const itens = programathor._internal.parseListagem(htmlListagem);
      for (const item of itens) {
        assert.strictEqual(
          vagaMercado.pareceVagaMercado(item),
          true,
          `item ${item.ptId} (${item.name}) deveria passar no gate — name/jobUrl/careerPageName presentes, sem type de talent-pool, country=Brasil`
        );
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
