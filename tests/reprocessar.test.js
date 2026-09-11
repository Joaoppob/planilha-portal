#!/usr/bin/env node
'use strict';

/**
 * Testa lib/reprocessar.js — item 1 e 2 do briefing Onda 1.7. Prova o
 * requisito duro do item 1: "um edital em formato desconhecido produz
 * nulls + flag + notificação, e NÃO produz valor inventado" — aplicado
 * RETROATIVAMENTE a um registro já salvo (não só na coleta ao vivo).
 * Também prova que reprocessar é idempotente (rodar duas vezes não muda
 * nada na segunda vez) e que nunca sobrescreve um UF já resolvido.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const reprocessar = require('../lib/reprocessar');

const keywordsConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'keywords.json'), 'utf8'));
const negativosConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'negativos.json'), 'utf8'));
const perfil = { titulacao_atual: 'mestrado_incerto' };
const perfilMestradoConfirmado = { titulacao_atual: 'mestrado_confirmado' };
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

function registroBase(overrides) {
  return {
    id: 'abc123',
    fonte: 'dou',
    orgao: 'Universidade Federal de Goiás',
    campus: 'Câmpus Cidade Ocidental',
    uf: null,
    area: 'Computação/IA',
    subarea: 'Computação',
    subedital: null,
    vagas: 2,
    titulacao_exigida: 'graduacao', // valor que o extrator antigo teria "adivinhado" errado
    regime: null,
    classe: null,
    tipo: null,
    inscricao_inicio: null,
    inscricao_fim: null,
    data_publicacao: '2025-09-15',
    url: 'https://www.in.gov.br/web/dou/-/exemplo',
    texto_bruto: '',
    coletado_em: new Date().toISOString(),
    extracao: undefined,
    keywords_matched: [],
    score: 50,
    veredito: 'elegivel_agora',
    julgamento: 'pendente',
    julgado_em: new Date().toISOString(),
    notificado: false,
    notificado_em: null,
    ...overrides
  };
}

function main() {
  console.log('\n=== reprocessar.test.js ===\n');
  let passed = 0;
  let failed = 0;

  const ctx = { keywordsConfig, negativosConfig, perfil };
  const ctxMestradoConfirmado = { keywordsConfig, negativosConfig, perfil: perfilMestradoConfirmado };

  const tests = [
    ['Onda 2.1: reprocessar com perfil mestrado_confirmado + área Computação/IA muda veredito p/ elegivel_agora e grava area_compativel a_verificar_na_banca', () => {
      const registro = registroBase({
        texto_bruto: 'concurso realizado no Estado de São Paulo',
        uf: 'SP',
        area: 'Computação/IA',
        titulacao_exigida: 'mestrado',
        veredito: 'elegivel_futuro',
        score: 40
      });
      const patch = reprocessar.reprocessarRegistro(registro, ctxMestradoConfirmado);
      assert.ok(patch, 'esperava patch (perfil mudou de incerto pra confirmado)');
      assert.strictEqual(patch.veredito, 'elegivel_agora');
      assert.strictEqual(patch.area_compativel, 'a_verificar_na_banca');
      assert.ok(typeof patch.julgado_em === 'string');
    }],

    ['Onda 2.1: reprocessar com perfil mestrado_confirmado + área Design grava area_compativel "compativel"', () => {
      const registro = registroBase({
        texto_bruto: 'concurso realizado no Estado de São Paulo',
        uf: 'SP',
        area: 'Design',
        titulacao_exigida: 'mestrado',
        veredito: 'elegivel_futuro',
        score: 40
      });
      const patch = reprocessar.reprocessarRegistro(registro, ctxMestradoConfirmado);
      assert.ok(patch, 'esperava patch (perfil mudou de incerto pra confirmado)');
      assert.strictEqual(patch.veredito, 'elegivel_agora');
      assert.strictEqual(patch.area_compativel, 'compativel');
    }],

    ['Onda 2.1: registro exige graduação em área Design ganha area_compativel "compativel" (graduação de JB também é checada agora)', () => {
      const registro = registroBase({
        texto_bruto: 'texto qualquer sem nada de especial',
        uf: 'SP',
        area: 'Design',
        titulacao_exigida: 'graduacao',
        veredito: 'elegivel_agora',
        score: 76
      });
      const patch = reprocessar.reprocessarRegistro(registro, ctxMestradoConfirmado);
      assert.ok(patch, 'esperava patch (registro não tinha area_compativel gravado ainda)');
      assert.strictEqual(patch.area_compativel, 'compativel');
    }],

    ['Onda 2.1: campo legado `pressupoe` (Onda 1.9) é removido do registro ao reprocessar', () => {
      const registro = registroBase({
        texto_bruto: 'texto qualquer sem nada de especial',
        uf: 'SP',
        area: 'Design',
        titulacao_exigida: 'graduacao',
        veredito: 'elegivel_agora',
        score: 76,
        pressupoe: 'area_do_mestrado_compativel'
      });
      const patch = reprocessar.reprocessarRegistro(registro, ctxMestradoConfirmado);
      assert.ok(patch, 'esperava patch de limpeza do campo legado');
      assert.ok('pressupoe' in patch, 'deveria patchear pressupoe (mesmo que undefined) pra removê-lo do store');
      assert.strictEqual(patch.pressupoe, undefined);
    }],

    ['Onda 2.1: idempotente — reprocessar o resultado com area_compativel já gravado não gera segundo patch de area_compativel', () => {
      const registro = registroBase({
        texto_bruto: 'concurso realizado no Estado de São Paulo',
        uf: 'SP',
        area: 'Computação/IA',
        titulacao_exigida: 'mestrado',
        veredito: 'elegivel_futuro',
        score: 40
      });
      const patch1 = reprocessar.reprocessarRegistro(registro, ctxMestradoConfirmado);
      const registroCorrigido = { ...registro, ...patch1 };
      const patch2 = reprocessar.reprocessarRegistro(registroCorrigido, ctxMestradoConfirmado);
      assert.strictEqual(patch2, null, `esperava null na segunda passada, veio ${JSON.stringify(patch2)}`);
    }],

    ['registro de formato não reconhecido (texto real da UFG): patch nula area/subarea/vagas/titulacao/campus e marca extracao', () => {
      const casoUfg = goldenSet.find(c => c.id === 'ufg-24-2025-ciencia-computacao');
      const registro = registroBase({ texto_bruto: casoUfg.textoEnriquecido, uf: 'GO' });
      const patch = reprocessar.reprocessarRegistro(registro, ctx);
      assert.ok(patch, 'esperava um patch (registro tinha dado potencialmente errado a corrigir)');
      assert.strictEqual(patch.area, null);
      assert.strictEqual(patch.subarea, null);
      assert.strictEqual(patch.vagas, null);
      assert.strictEqual(patch.titulacao_exigida, null);
      assert.strictEqual(patch.campus, null);
      assert.strictEqual(patch.extracao, 'formato_nao_reconhecido');
      // nunca inventa: nenhum campo do patch pode ser um valor NÃO-null "adivinhado"
      for (const campo of ['area', 'subarea', 'vagas', 'titulacao_exigida', 'campus']) {
        assert.strictEqual(patch[campo], null, `${campo} deveria ser null, nunca um valor inventado`);
      }
    }],

    ['veredito muda pra indeterminada quando titulacao_exigida vira null (score/elegibilidade recomputados)', () => {
      const casoUfg = goldenSet.find(c => c.id === 'ufg-24-2025-ciencia-computacao');
      const registro = registroBase({ texto_bruto: casoUfg.textoEnriquecido, uf: 'GO', veredito: 'elegivel_agora' });
      const patch = reprocessar.reprocessarRegistro(registro, ctx);
      assert.strictEqual(patch.veredito, 'indeterminada');
      assert.ok(typeof patch.score === 'number');
    }],

    ['registro normal (área confiável, sem ambiguidade) não altera area/vagas/titulacao', () => {
      const casoIf = goldenSet.find(c => c.id === 'if-goiano-substituto-informatica');
      const registro = registroBase({
        texto_bruto: casoIf.textoEnriquecido,
        area: 'Computação/IA',
        subarea: 'Informática',
        titulacao_exigida: 'graduacao',
        uf: 'GO',
        veredito: 'elegivel_agora',
        score: 76
      });
      const patch = reprocessar.reprocessarRegistro(registro, ctx);
      // só pode ter mudado extracao (formalização do campo novo) — nada de área/vagas/titulação
      if (patch) {
        assert.ok(!('area' in patch));
        assert.ok(!('vagas' in patch));
        assert.ok(!('titulacao_exigida' in patch));
      }
    }],

    ['UF: preenche quando null via texto (texto tem "Estado de X"), só quando o lookup por órgão não resolve nada', () => {
      // orgao propositalmente FORA do lookup — testa o fallback de texto em
      // isolamento (com "Universidade Federal de Goiás" o lookup por órgão
      // já resolveria GO e nunca chegaria a testar o texto).
      const registro = registroBase({
        orgao: 'Instituição Estadual Sem Entrada no Lookup',
        uf: null,
        texto_bruto: 'concurso realizado no Estado de Minas Gerais'
      });
      const patch = reprocessar.reprocessarRegistro(registro, ctx);
      assert.ok(patch, 'esperava patch de UF');
      assert.strictEqual(patch.uf, 'MG');
    }],

    ['UF: NUNCA sobrescreve um uf já preenchido, mesmo que o texto sugira outro', () => {
      const registro = registroBase({ uf: 'SP', texto_bruto: 'concurso realizado no Estado de Minas Gerais', titulacao_exigida: 'graduacao' });
      const patch = reprocessar.reprocessarRegistro(registro, ctx);
      if (patch) assert.ok(!('uf' in patch), 'não deveria mexer em uf já preenchido');
    }],

    ['idempotente: reprocessar o resultado de um reprocessamento não gera um segundo patch', () => {
      const casoUfg = goldenSet.find(c => c.id === 'ufg-24-2025-ciencia-computacao');
      const registro = registroBase({ texto_bruto: casoUfg.textoEnriquecido, uf: 'GO' });
      const patch1 = reprocessar.reprocessarRegistro(registro, ctx);
      const registroCorrigido = { ...registro, ...patch1 };
      const patch2 = reprocessar.reprocessarRegistro(registroCorrigido, ctx);
      assert.strictEqual(patch2, null, `esperava null na segunda passada, veio ${JSON.stringify(patch2)}`);
    }],

    ['Onda 2.1: campo marcado em campos_llm NUNCA é revertido pra null pelo passo de ambiguidade nem pelo regex 1b', () => {
      const casoUfg = goldenSet.find(c => c.id === 'ufg-24-2025-ciencia-computacao');
      const registro = registroBase({
        texto_bruto: casoUfg.textoEnriquecido,
        uf: 'GO',
        area: 'Computação/IA',
        subarea: 'Ciência da Computação',
        titulacao_exigida: 'mestrado', // resolvido pelo LLM, não pelo regex (regex não acharia nada aqui)
        campos_llm: ['area', 'subarea', 'titulacao_exigida'],
        veredito: 'elegivel_futuro',
        score: 40
      });
      const patch = reprocessar.reprocessarRegistro(registro, ctx);
      if (patch) {
        assert.ok(!('area' in patch), 'area veio do LLM, não deveria ser zerada pelo passo de ambiguidade');
        assert.ok(!('subarea' in patch), 'subarea veio do LLM, não deveria ser zerada');
        assert.ok(!('titulacao_exigida' in patch), 'titulacao_exigida veio do LLM, não deveria ser recomputada pelo regex nem zerada pela ambiguidade');
      }
    }],

    ['registro de fonte diferente de "dou" não é tocado (escopo desta reprocessagem)', () => {
      const registro = registroBase({ fonte: 'outra-fonte-hipotetica' });
      const patch = reprocessar.reprocessarRegistro(registro, ctx);
      assert.strictEqual(patch, null);
    }],

    ['reprocessarTudo soma o resumo corretamente sobre uma lista pequena', () => {
      const casoUfg = goldenSet.find(c => c.id === 'ufg-24-2025-ciencia-computacao');
      const registros = [
        registroBase({ id: 'r1', texto_bruto: casoUfg.textoEnriquecido, uf: 'GO' }),
        registroBase({ id: 'r2', uf: null, texto_bruto: 'no Estado de São Paulo', titulacao_exigida: 'graduacao' }),
        registroBase({ id: 'r3', uf: 'SP', texto_bruto: 'texto qualquer sem nada de especial', titulacao_exigida: 'graduacao' })
      ];
      const { patches, resumo } = reprocessar.reprocessarTudo(registros, ctx);
      assert.strictEqual(resumo.total, 3);
      assert.ok(resumo.alterados >= 2, `esperava pelo menos 2 alterados, veio ${resumo.alterados}`);
      assert.strictEqual(resumo.formato_nao_reconhecido_novo, 1);
      assert.strictEqual(resumo.uf_preenchido, 1);
      assert.ok(patches.find(p => p.id === 'r1'));
      assert.ok(patches.find(p => p.id === 'r2'));
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
