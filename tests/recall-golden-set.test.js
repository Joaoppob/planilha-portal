#!/usr/bin/env node
'use strict';

/**
 * RÉGUA PERMANENTE DE RECALL (item 2 do briefing Onda 1.6).
 *
 * O golden set (`tests/fixtures/golden-set.json`) é uma lista de casos REAIS
 * — editais docentes de verdade, capturados do DOU — que o radar TEM
 * OBRIGAÇÃO de encontrar. Cada caso roda através do pipeline de verdade
 * (`lib/vaga-docente.js` -> `fontes/dou.js` `dividirSubeditais` ->
 * `lib/keyword-filtro.js` / `lib/subedital-extrator.js`), offline, sem rede
 * — os textos já foram capturados no fixture.
 *
 * Este teste é a MÉTRICA DE SAÚDE DO FILTRO: o recall (quantos do golden
 * set o pipeline encontra) nunca pode CAIR numa mudança futura. Se você
 * está lendo isto porque este teste falhou depois de mexer em
 * keyword-filtro/vaga-docente/subedital-extrator/dou.js, o filtro regrediu
 * — não ajuste o teste pra passar, ajuste o pipeline (ou, se o caso do
 * golden set estiver genuinamente errado, documente por quê antes de
 * removê-lo).
 *
 * Âncora do golden set: o edital nº 4/2026 da UFSCar (12/08/2026, 67
 * subeditais, 89 vagas) — o caso que originou o projeto inteiro e que o
 * pipeline ANTIGO não encontrava (zero itens coletados nesse dia). Ver
 * RELATORIO-BACKFILL.md §Recall e README §Pipeline invertido para o
 * relato completo do diagnóstico.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const vagaDocente = require('../lib/vaga-docente');
const dou = require('../fontes/dou');
const subeditalExtrator = require('../lib/subedital-extrator');

const keywordsConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'keywords.json'), 'utf8'));
const goldenSet = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'golden-set.json'), 'utf8'));

/**
 * Roda o caso pelo pipeline real (mesmos estágios de radar.js
 * processarItensFonte, offline): estágio 1 (é vaga docente, sobre o
 * preview) -> estágio 3 (área, sobre o texto enriquecido — split por
 * subedital quando o texto tiver a tabela). Retorna o registro encontrado
 * (ou null se descartado em algum estágio).
 */
function encontrarNoPipeline(caso) {
  const textoPreview = dou.textoParaFiltro(caso.rawItem);
  if (!vagaDocente.pareceVagaDocente(textoPreview)) {
    return { estagioMorto: 'estagio1_vaga_docente', encontrado: null };
  }

  const linhasSubedital = dou.dividirSubeditais(caso.textoEnriquecido);
  if (linhasSubedital) {
    const relevantes = subeditalExtrator.registrosRelevantes(linhasSubedital, keywordsConfig);
    if (caso.esperado.subedital) {
      const achado = relevantes.find(r => r.subedital === caso.esperado.subedital);
      if (!achado) return { estagioMorto: 'estagio3_subedital_nao_bateu_area', encontrado: null };
      return { estagioMorto: null, encontrado: achado };
    }
    // esperado.subedital null mas o texto TEM tabela — não deveria acontecer
    // nos casos deste golden set (só o UFSCar tem tabela reconhecida).
    return { estagioMorto: 'estagio3_tabela_inesperada', encontrado: relevantes[0] || null };
  }

  // Onda 1.7: mesma função que radar.js usa de verdade no caminho de edital
  // único (`subeditalExtrator.avaliarEditalUnico`) — quando o texto parece
  // ter múltiplos itens em formato não reconhecido (caso UFG), area/subarea
  // saem null e `extracao: 'formato_nao_reconhecido'` entra, em vez do
  // primeiro match do filtro de keyword sobre o texto inteiro.
  const avaliacao = subeditalExtrator.avaliarEditalUnico(caso.textoEnriquecido, keywordsConfig);
  if (!avaliacao.passou) {
    return { estagioMorto: 'estagio3_keyword_area', encontrado: null };
  }
  return {
    estagioMorto: null,
    encontrado: {
      area: avaliacao.area,
      subarea: avaliacao.subarea,
      extracao: avaliacao.extracao,
      titulacao_exigida: null // extração de titulação sobre texto inteiro é responsabilidade de fonte.enriquecer(), não testada aqui
    }
  };
}

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
  console.log('\n=== recall-golden-set.test.js (régua de recall) ===\n');
  let passed = 0;
  let failed = 0;
  let encontrados = 0;

  for (const caso of goldenSet) {
    const ok = runTest(`[${caso.id}] ${caso.descricao.slice(0, 90)}`, () => {
      const resultado = encontrarNoPipeline(caso);
      assert.ok(
        resultado.encontrado,
        `NÃO encontrado — morreu em: ${resultado.estagioMorto || '?'}. Esperado: ${JSON.stringify(caso.esperado)}`
      );
      if (caso.esperado.area) {
        assert.strictEqual(resultado.encontrado.area, caso.esperado.area, 'área encontrada não bate com o esperado');
      }
      if (caso.esperado.extracao !== undefined) {
        assert.strictEqual(
          resultado.encontrado.extracao,
          caso.esperado.extracao,
          'flag de confiança da extração (extracao) não bate com o esperado — Onda 1.7'
        );
      }
      if (caso.esperado.subedital !== undefined && caso.esperado.subedital !== null) {
        assert.strictEqual(resultado.encontrado.subedital, caso.esperado.subedital);
      }
      if (caso.esperado.campus) {
        assert.strictEqual(resultado.encontrado.campus, caso.esperado.campus);
      }
      if (typeof caso.esperado.vagas === 'number') {
        assert.strictEqual(resultado.encontrado.vagas, caso.esperado.vagas);
      }
    });
    if (ok) {
      passed++;
      encontrados++;
    } else {
      failed++;
    }
  }

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`RECALL: ${encontrados}/${goldenSet.length} casos do golden set encontrados pelo pipeline atual.`);
  console.log('Este número é a régua permanente — não pode cair numa mudança futura.');
  console.log('─'.repeat(60));

  console.log(`\n${passed} passou(aram), ${failed} falhou(aram)\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
