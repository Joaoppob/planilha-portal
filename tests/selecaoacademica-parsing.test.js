#!/usr/bin/env node
'use strict';

/**
 * Testa o parsing do coletor Seleção Acadêmica (fontes/selecaoacademica.js)
 * contra o RSS REAL capturado de selecaoacademica.com.br/feed/ em
 * 28/08/2026 (tests/fixtures/selecaoacademica-feed-real.xml, `lib/http.js`
 * real — nunca `mcp__donsetch__web_fetch`, degradado nesta sessão, ver C8
 * do plano), sem rede. Padrão de tests/pci-parsing.test.js.
 *
 * O feed real do dia da captura tem 10 itens (WordPress, 1 página): 5
 * técnico-administrativos (descartados no estágio 1, sem "professor"), 5
 * docentes (UEM, UNILA, IFSC, IFSULDEMINAS, UNCISAL), e 1 post
 * institucional sem vaga ("PontiLab"). Dos 5 docentes, UEM/IFSC/
 * IFSULDEMINAS têm subedital de área de JB dentro do guarda-chuva; UNILA/
 * UNCISAL não (áreas de saúde/humanidades fora do perfil).
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const selecaoacademica = require('../fontes/selecaoacademica');
const vagaDocente = require('../lib/vaga-docente');
const subeditalExtrator = require('../lib/subedital-extrator');
const keywordsConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'keywords.json'), 'utf8'));

const xmlReal = fs.readFileSync(path.join(__dirname, 'fixtures', 'selecaoacademica-feed-real.xml'), 'utf8');

function blocosReais() {
  return selecaoacademica._internal.extrairBlocosItem(xmlReal);
}

function itemReal(chaveNoTitulo) {
  const bloco = blocosReais().find(b => b.includes(chaveNoTitulo));
  if (!bloco) throw new Error(`fixture não tem item com "${chaveNoTitulo}" no bloco`);
  return selecaoacademica._internal.parseItem(bloco);
}

function main() {
  console.log('\n=== selecaoacademica-parsing.test.js ===\n');
  let passed = 0;
  let failed = 0;

  const tests = [
    ['fonte declara id/nome corretos', () => {
      assert.strictEqual(selecaoacademica.id, 'selecaoacademica');
      assert.ok(selecaoacademica.nome.includes('Seleção Acadêmica'));
    }],

    ['extrairBlocosItem acha os 10 itens reais do feed capturado', () => {
      assert.strictEqual(blocosReais().length, 10);
    }],

    ['parseItem: item real da UEM extrai title/link/pubDate/categorias/content:encoded sem 2ª requisição', () => {
      const item = itemReal('UEM abre Processo Seletivo');
      assert.strictEqual(item.title, 'UEM abre Processo Seletivo com 76 vagas para Professor Colaborador');
      assert.strictEqual(item.link, 'https://selecaoacademica.com.br/uem-abre-processo-seletivo-com-76-vagas-para-professor-colaborador/');
      assert.ok(item.pubDate.includes('2026'));
      assert.ok(item.categorias.includes('Concursos em Universidades'));
      assert.ok(item.contentEncoded.includes('VAGAS OFERECIDAS'), 'content:encoded já deveria trazer o corpo inteiro (achado real — não exige 2ª requisição)');
      assert.ok(item.contentEncoded.includes('Ciência da Computação/Algoritmos'));
    }],

    ['parseItem: item institucional sem vaga (PontiLab) não quebra o parser', () => {
      const item = itemReal('PontiLab');
      assert.ok(item);
      assert.ok(item.title.includes('PontiLab'));
    }],

    ['textoParaFiltro + lib/vaga-docente: os 5 posts docentes reais PASSAM no estágio 1; os 5 técnico-administrativos e o institucional são DESCARTADOS', () => {
      const items = blocosReais().map(selecaoacademica._internal.parseItem).filter(Boolean);
      const titulosQuePassaram = items.filter(i => vagaDocente.pareceVagaDocente(selecaoacademica.textoParaFiltro(i))).map(i => i.title);
      assert.strictEqual(titulosQuePassaram.length, 5, `esperava 5, achou: ${JSON.stringify(titulosQuePassaram)}`);
      for (const chave of ['UEM', 'UNILA', 'IFSC', 'IFSULDEMINAS', 'UNCISAL']) {
        assert.ok(titulosQuePassaram.some(t => t.startsWith(chave)), `"${chave}" deveria ter passado no estágio 1`);
      }
      assert.ok(!titulosQuePassaram.some(t => t.includes('Técnico-Administrativos')), 'técnico-administrativo não deveria passar (sem "professor")');
      assert.ok(!titulosQuePassaram.some(t => t.includes('PontiLab')), 'post institucional não deveria passar');
    }],

    ['normalizarParcial: extrairOrgao monta "{SIGLA} - {Nome completo}" no MESMO formato que fontes/pci.js — condição pro dedupe cross-fonte (lib/store.js chaveCanonicaDedupe)', () => {
      const item = itemReal('UEM abre Processo Seletivo');
      const parcial = selecaoacademica.normalizarParcial(item);
      assert.strictEqual(parcial.orgao, 'UEM - Universidade Estadual de Maringá');
    }],

    ['normalizarParcial: extrai período de inscrição real da UEM (bate com o mesmo edital coletado pela PCI — 26/08 a 16/09/2026)', () => {
      const item = itemReal('UEM abre Processo Seletivo');
      const parcial = selecaoacademica.normalizarParcial(item);
      assert.strictEqual(parcial.inscricao_inicio, '2026-08-26');
      assert.strictEqual(parcial.inscricao_fim, '2026-09-16');
    }],

    ['normalizarParcial: IFSULDEMINAS (achado real — texto curto entre a 1ª data e o conector "a") também extrai período corretamente', () => {
      const item = itemReal('IFSULDEMINAS abre Concurso');
      const parcial = selecaoacademica.normalizarParcial(item);
      assert.strictEqual(parcial.inscricao_inicio, '2026-07-31');
      assert.strictEqual(parcial.inscricao_fim, '2026-08-20');
    }],

    ['dividirSubeditais: UEM (guarda-chuva real, 76 vagas) reconhece >=70 linhas', () => {
      const item = itemReal('UEM abre Processo Seletivo');
      const parcial = selecaoacademica.normalizarParcial(item);
      const linhas = selecaoacademica.dividirSubeditais(parcial.texto_bruto);
      assert.ok(linhas, 'deveria reconhecer a lista VAGAS OFERECIDAS');
      assert.ok(linhas.length >= 70, `esperava pelo menos 70 linhas, achou ${linhas.length}`);
    }],

    ['dividirSubeditais + registrosRelevantes: UEM produz os MESMOS 3 subeditais de Computação/IA distintos já provados em tests/12c-subarea-desambiguada.test.js, mais 1 subedital de Design', () => {
      const item = itemReal('UEM abre Processo Seletivo');
      const parcial = selecaoacademica.normalizarParcial(item);
      const linhas = selecaoacademica.dividirSubeditais(parcial.texto_bruto);
      const relevantes = subeditalExtrator.registrosRelevantes(linhas, keywordsConfig);
      const porSubedital = Object.fromEntries(relevantes.map(r => [r.subedital, r]));
      assert.strictEqual(porSubedital['Ciência da Computação/Algoritmos'].subarea, 'Algoritmos');
      assert.strictEqual(porSubedital['Ciência da Computação/Engenharia de Software'].subarea, 'Engenharia de Software');
      assert.strictEqual(porSubedital['Ciência da Computação'].subarea, 'Ciência da Computação');
      assert.strictEqual(porSubedital['Design da Comunicação, Produção Gráfica e Design Inclusivo'].area, 'Design');
      // zero duplicata visual dentro deste guarda-chuva (mesma régua de 12c)
      const tuplas = relevantes.map(r => [r.area, r.subarea].join('|'));
      assert.strictEqual(new Set(tuplas).size, tuplas.length, `esperava tuplas área/subárea todas distintas, achou: ${JSON.stringify(tuplas)}`);
    }],

    ['dividirSubeditais: vagas extraídas corretamente ("1 vaga" vs "Cadastro de Reserva" -> null, nunca inventa)', () => {
      const item = itemReal('UEM abre Processo Seletivo');
      const parcial = selecaoacademica.normalizarParcial(item);
      const linhas = selecaoacademica.dividirSubeditais(parcial.texto_bruto);
      const relevantes = subeditalExtrator.registrosRelevantes(linhas, keywordsConfig);
      const porSubedital = Object.fromEntries(relevantes.map(r => [r.subedital, r]));
      assert.strictEqual(porSubedital['Ciência da Computação'].vagas, 1);
      assert.strictEqual(porSubedital['Ciência da Computação/Algoritmos'].vagas, null, 'Cadastro de Reserva não tem número de vaga — nunca inventa 0 ou 1');
    }],

    ['dividirSubeditais: UNILA (só 2 subeditais de área de saúde/humanidades, nenhum de JB) retorna as 2 linhas, mas registrosRelevantes descarta as 2', () => {
      const item = itemReal('UNILA divulga Concurso');
      const parcial = selecaoacademica.normalizarParcial(item);
      const linhas = selecaoacademica.dividirSubeditais(parcial.texto_bruto);
      assert.ok(linhas);
      const relevantes = subeditalExtrator.registrosRelevantes(linhas, keywordsConfig);
      assert.strictEqual(relevantes.length, 0);
    }],

    ['_internal.extrairOrgao: fallback pro título quando o padrão "A|O Nome (SIGLA)" não aparece no texto', () => {
      const orgao = selecaoacademica._internal.extrairOrgao('texto qualquer sem esse formato', 'Título Fallback');
      assert.strictEqual(orgao, 'Título Fallback');
    }],

    ['_internal.extrairPeriodoInscricao: sem "Período de inscrição" no texto -> {inicio:null, fim:null}, nunca inventa', () => {
      const periodo = selecaoacademica._internal.extrairPeriodoInscricao('texto qualquer sem período nenhum.');
      assert.strictEqual(periodo.inicio, null);
      assert.strictEqual(periodo.fim, null);
    }],

    ['_internal.mesParaNumero: nomes de mês reais (com e sem acento) resolvem, mês inválido retorna null', () => {
      assert.strictEqual(selecaoacademica._internal.mesParaNumero('março'), '03');
      assert.strictEqual(selecaoacademica._internal.mesParaNumero('marco'), '03');
      assert.strictEqual(selecaoacademica._internal.mesParaNumero('inventado'), null);
    }],

    ['dedupe por link (mesmo padrão de fontes/weworkremotely.js): dois blocos com o mesmo <link> viram 1 item só', () => {
      const blocoUem = blocosReais().find(b => b.includes('UEM abre Processo Seletivo'));
      const xmlComDuplicata = xmlReal.replace('</channel>', `<item>${blocoUem}</item></channel>`);
      const blocos = selecaoacademica._internal.extrairBlocosItem(xmlComDuplicata);
      const porLink = new Map();
      for (const b of blocos) {
        const it = selecaoacademica._internal.parseItem(b);
        if (it && !porLink.has(it.link)) porLink.set(it.link, it);
      }
      assert.strictEqual(blocos.length, 11, 'a duplicata bruta deveria existir no XML sintético (11 blocos)');
      assert.strictEqual(porLink.size, 10, 'mas o dedupe por link deveria colapsar de volta pra 10');
    }]
  ];

  let passedCount = 0;
  let failedCount = 0;
  for (const [name, fn] of tests) {
    try {
      fn();
      console.log(`  ✓ ${name}`);
      passedCount++;
    } catch (error) {
      console.log(`  ✗ ${name}`);
      console.error(`    ${error.message}`);
      failedCount++;
    }
  }
  passed = passedCount;
  failed = failedCount;

  console.log(`\n${passed} passou(aram), ${failed} falhou(aram)\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
