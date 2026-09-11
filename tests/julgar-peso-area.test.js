#!/usr/bin/env node
'use strict';

/**
 * Onda 2.4 (26/08/2026) — prova que o caminho QUENTE de radar.js (`julgar` e
 * a aplicação em massa do `extrair-llm`, rodados todo dia às 8h por
 * rodar-diario.bat → coletar → julgar) resolve peso de área pelo mesmo mapa
 * de sinônimos que o caminho FRIO (`lib/reprocessar.js`), em vez de indexar
 * `config/keywords.json → pesos_area` direto por igualdade de string.
 *
 * Bug original: radar.js:474 (comandoJulgar) e radar.js:640 (aplicação em
 * massa) faziam
 *
 *   (keywordsConfig.pesos_area && keywordsConfig.pesos_area[area]) || 0
 *
 * — que cai em 0 sempre que `registro.area` vem gravada com a grafia LITERAL
 * do edital (via lib/extrator-llm.js — ex. "COMPUTAÇÃO") em vez da categoria
 * canônica ("Computação/IA"). `lib/keyword-filtro.js` ganhou
 * `resolverPesoArea()` pra resolver isso via `sinonimos_area`, e
 * `lib/reprocessar.js` já usava — mas radar.js continuou com a indexação
 * direta, silenciando de novo a próxima variante de grafia que o Ollama
 * gravasse: o mesmo bug que acabou de silenciar 3 registros
 * elegivel_agora/elegivel_futuro reais (ver comentário de `resolverPesoArea`
 * em lib/keyword-filtro.js), agora só no lugar onde ninguém ia olhar.
 *
 * Este teste (1) reproduz a expressão antiga isolada e prova que ela zera
 * pra uma grafia real do store, (2) prova que `resolverPesoArea` — a função
 * que radar.js chama agora nos dois pontos — resolve certo, com efeito
 * mensurável no MESMO cálculo de score que `comandoJulgar` roda, e (3)
 * confere estaticamente que radar.js não volta a indexar `pesos_area`
 * direto (guarda de regressão amarrada ao arquivo real).
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const keywordFiltro = require('../lib/keyword-filtro');
const score = require('../lib/score');

const keywordsConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'keywords.json'), 'utf8'));
const perfil = { titulacao_atual: 'mestrado_incerto' };

// Reprodução literal da expressão que ESTAVA em radar.js:474 e radar.js:640
// antes desta correção — existe só como prova de regressão, não é código de
// produção.
function pesoAreaIndexacaoDireta(area, config) {
  return (config.pesos_area && config.pesos_area[area]) || 0;
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
  console.log('\n=== julgar-peso-area.test.js ===\n');
  let passed = 0;
  let failed = 0;

  // Grafia real registrada em config/keywords.json → sinonimos_area — a
  // mesma classe de caso (rótulo literal do edital gravado por
  // lib/extrator-llm.js) que silenciou registros reais do store.
  const areaGrafiaLlm = 'COMPUTAÇÃO';
  const areaCanonicaEsperada = 'Computação/IA';

  const tests = [
    ['pré-condição: a grafia de teste está só em sinonimos_area, não em pesos_area (senão o teste não prova nada)', () => {
      assert.ok(
        !Object.prototype.hasOwnProperty.call(keywordsConfig.pesos_area, areaGrafiaLlm),
        `"${areaGrafiaLlm}" não deveria ser chave direta de pesos_area`
      );
      assert.strictEqual(
        keywordsConfig.sinonimos_area[keywordFiltro.normalizar(areaGrafiaLlm)],
        areaCanonicaEsperada,
        'config/keywords.json mudou — ajustar a grafia de teste'
      );
    }],

    ['código ANTIGO (indexação direta — o que radar.js:474/640 faziam) zera o peso pra essa grafia: prova que o teste pega o bug antigo', () => {
      const pesoAntigo = pesoAreaIndexacaoDireta(areaGrafiaLlm, keywordsConfig);
      assert.strictEqual(pesoAntigo, 0, 'a indexação direta deveria cair em 0 pra essa grafia — esse é o bug que estava em produção');
    }],

    ['resolverPesoArea (o que radar.js chama agora nos dois pontos) resolve pra o peso canônico, não zero', () => {
      const pesoNovo = keywordFiltro.resolverPesoArea(areaGrafiaLlm, keywordsConfig);
      assert.strictEqual(pesoNovo, keywordsConfig.pesos_area[areaCanonicaEsperada]);
      assert.notStrictEqual(pesoNovo, 0);
    }],

    ['score.calcular (o mesmo cálculo que comandoJulgar roda) reflete a diferença: pesoArea antigo zera a componente de área, o novo não', () => {
      const params = {
        titulacaoExigida: 'mestrado',
        perfil,
        uf: null,
        inscricaoFim: null,
        negativo: false,
        area: areaGrafiaLlm
      };
      const resultadoAntigo = score.calcular({ ...params, pesoArea: pesoAreaIndexacaoDireta(areaGrafiaLlm, keywordsConfig) });
      const resultadoNovo = score.calcular({ ...params, pesoArea: keywordFiltro.resolverPesoArea(areaGrafiaLlm, keywordsConfig) });

      assert.strictEqual(resultadoAntigo.detalhes.scoreArea, 0, 'com o cálculo antigo, a componente de área do score fica zerada');
      assert.strictEqual(resultadoNovo.detalhes.scoreArea, keywordsConfig.pesos_area[areaCanonicaEsperada]);
      assert.ok(
        resultadoNovo.score > resultadoAntigo.score,
        `score novo (${resultadoNovo.score}) deveria ser maior que o antigo (${resultadoAntigo.score}) — mesma vaga, só a componente de área deixou de ser silenciada`
      );
    }],

    ['guarda de regressão: radar.js não volta a indexar pesos_area direto — os dois pontos usam resolverPesoArea', () => {
      const radarSrc = fs.readFileSync(path.join(__dirname, '..', 'radar.js'), 'utf8');
      const padraoAntigo = /pesos_area\s*\[\s*(registro\.area|areaFinal)\s*\]/;
      assert.ok(!padraoAntigo.test(radarSrc), 'radar.js voltou a indexar pesos_area direto — regrediu o bug do caminho quente');
      const ocorrenciasResolver = (radarSrc.match(/keywordFiltro\.resolverPesoArea\(/g) || []).length;
      assert.strictEqual(
        ocorrenciasResolver,
        2,
        `esperava 2 chamadas a keywordFiltro.resolverPesoArea em radar.js (comandoJulgar + aplicação em massa), achou ${ocorrenciasResolver}`
      );
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
