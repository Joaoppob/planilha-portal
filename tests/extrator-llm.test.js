#!/usr/bin/env node
'use strict';

/**
 * Testa lib/extrator-llm.js — só as funções PURAS (normalizarCampo,
 * parsearResposta, recortarJanela, montarPrompt). Chamadas reais ao Ollama
 * não são testadas aqui (mesma convenção de tests/ollama-fallback.test.js —
 * rede real fica fora do gate). Onda 2.0, item 2b do briefing: "se o modelo
 * não tiver certeza, o campo continua null" — é essa regra que estes testes
 * provam, campo a campo.
 */

const assert = require('assert');
const extLLM = require('../lib/extrator-llm');

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
  console.log('\n=== extrator-llm.test.js ===\n');
  let passed = 0;
  let failed = 0;

  const tests = [
    ['normalizarCampo: certeza=true e valor válido -> proveniencia "llm"', () => {
      const r = extLLM.normalizarCampo({ valor: 'mestrado', certeza: true }, 'titulacao_exigida');
      assert.deepStrictEqual(r, { valor: 'mestrado', proveniencia: 'llm' });
    }],

    ['normalizarCampo: certeza=false -> valor null, proveniencia "ausente" (regra dura, nunca chuta)', () => {
      const r = extLLM.normalizarCampo({ valor: 'mestrado', certeza: false }, 'titulacao_exigida');
      assert.deepStrictEqual(r, { valor: null, proveniencia: 'ausente' });
    }],

    ['normalizarCampo: campo ausente/malformado no JSON do modelo -> "ausente", nunca lança', () => {
      assert.deepStrictEqual(extLLM.normalizarCampo(undefined, 'campus'), { valor: null, proveniencia: 'ausente' });
      assert.deepStrictEqual(extLLM.normalizarCampo(null, 'campus'), { valor: null, proveniencia: 'ausente' });
      assert.deepStrictEqual(extLLM.normalizarCampo('string solta', 'campus'), { valor: null, proveniencia: 'ausente' });
    }],

    ['normalizarCampo: titulacao_exigida fora do enum válido -> null (modelo alucinou uma titulação inexistente)', () => {
      const r = extLLM.normalizarCampo({ valor: 'pos-doutorado', certeza: true }, 'titulacao_exigida');
      assert.deepStrictEqual(r, { valor: null, proveniencia: 'ausente' });
    }],

    ['normalizarCampo: vagas não numérico ou <= 0 -> null, nunca inventa contagem', () => {
      assert.deepStrictEqual(extLLM.normalizarCampo({ valor: 'algumas', certeza: true }, 'vagas'), { valor: null, proveniencia: 'ausente' });
      assert.deepStrictEqual(extLLM.normalizarCampo({ valor: 0, certeza: true }, 'vagas'), { valor: null, proveniencia: 'ausente' });
      assert.deepStrictEqual(extLLM.normalizarCampo({ valor: 3, certeza: true }, 'vagas'), { valor: 3, proveniencia: 'llm' });
    }],

    ['normalizarCampo: datas fora do formato AAAA-MM-DD -> null, nunca meio-inventa formato', () => {
      assert.deepStrictEqual(extLLM.normalizarCampo({ valor: '12/08/2026', certeza: true }, 'inscricao_fim'), { valor: null, proveniencia: 'ausente' });
      assert.deepStrictEqual(extLLM.normalizarCampo({ valor: '2026-08-12', certeza: true }, 'inscricao_fim'), { valor: '2026-08-12', proveniencia: 'llm' });
    }],

    ['parsearResposta: JSON malformado -> null (chamador trata como falha total)', () => {
      assert.strictEqual(extLLM.parsearResposta('isso não é JSON'), null);
    }],

    ['Onda 2.1: removerCercadoMarkdown tira o bloco ```json ... ``` que o modelo às vezes adiciona (achado real: gemma4:26b sem format:json faz isso)', () => {
      const cercado = '```json\n{"a": 1}\n```';
      assert.strictEqual(extLLM.removerCercadoMarkdown(cercado), '{"a": 1}');
      assert.strictEqual(extLLM.removerCercadoMarkdown('```\n{"a": 1}\n```'), '{"a": 1}');
      assert.strictEqual(extLLM.removerCercadoMarkdown('{"a": 1}'), '{"a": 1}', 'sem cercado, devolve igual');
    }],

    ['Onda 2.1: parsearResposta tolera resposta cercada em ```json ... ``` (não é mais falha total)', () => {
      const respostaCercada =
        '```json\n' +
        JSON.stringify({
          titulacao_exigida: { valor: 'graduacao', certeza: true },
          area: { valor: 'Design', certeza: true },
          subarea: { valor: null, certeza: false },
          campus: { valor: 'Juiz de Fora', certeza: true },
          vagas: { valor: null, certeza: false },
          regime: { valor: null, certeza: false },
          inscricao_inicio: { valor: null, certeza: false },
          inscricao_fim: { valor: null, certeza: false }
        }) +
        '\n```';
      const r = extLLM.parsearResposta(respostaCercada);
      assert.ok(r, 'não deveria falhar por causa do cercado markdown');
      assert.strictEqual(r.titulacao_exigida.valor, 'graduacao');
      assert.strictEqual(r.campus.valor, 'Juiz de Fora');
    }],

    ['parsearResposta: resposta válida com os 8 campos, mistura de certeza true/false', () => {
      const respostaModelo = JSON.stringify({
        titulacao_exigida: { valor: 'doutorado', certeza: true },
        area: { valor: 'Design', certeza: true },
        subarea: { valor: null, certeza: false },
        campus: { valor: 'Sorocaba', certeza: true },
        vagas: { valor: 2, certeza: true },
        regime: { valor: null, certeza: false },
        inscricao_inicio: { valor: null, certeza: false },
        inscricao_fim: { valor: '2026-09-01', certeza: true }
      });
      const r = extLLM.parsearResposta(respostaModelo);
      assert.strictEqual(r.titulacao_exigida.valor, 'doutorado');
      assert.strictEqual(r.subarea.valor, null);
      assert.strictEqual(r.subarea.proveniencia, 'ausente');
      assert.strictEqual(r.campus.valor, 'Sorocaba');
      assert.strictEqual(r.vagas.proveniencia, 'llm');
    }],

    ['recortarJanela: texto curto retorna igual, sem recortar', () => {
      const texto = 'Edital curto de vaga docente.';
      assert.strictEqual(extLLM.recortarJanela(texto, ['docente']), texto);
    }],

    ['recortarJanela: texto longo sem termo localizável usa os primeiros N chars', () => {
      const texto = 'x'.repeat(20000);
      const janela = extLLM.recortarJanela(texto, ['termo-inexistente']);
      assert.ok(janela.length < texto.length, 'deveria ter recortado');
      assert.match(janela, /trecho seguinte omitido/);
    }],

    ['recortarJanela: texto longo COM termo localizável centraliza a janela nele (não pega só o início)', () => {
      const antes = 'a'.repeat(5000);
      const meio = 'AQUI ESTA DESIGN NO MEIO DO TEXTO';
      const depois = 'b'.repeat(20000);
      const texto = antes + meio + depois;
      const janela = extLLM.recortarJanela(texto, ['design']);
      assert.match(janela, /DESIGN NO MEIO DO TEXTO/, 'a janela deveria conter o trecho ao redor do termo, não só o início');
    }],

    ['montarPrompt: nunca lança pra registro sem texto_bruto/keywords_matched', () => {
      const prompt = extLLM.montarPrompt({ texto_bruto: null, keywords_matched: null, area: null });
      assert.ok(typeof prompt === 'string' && prompt.length > 0);
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
