#!/usr/bin/env node
'use strict';

/**
 * Testa regras de elegibilidade — requisito mínimo do briefing.
 * Cobre exatamente as 4 regras declaradas no briefing + o caso de titulação
 * não identificada (regra revista na Onda 1.7, item 1 do briefing — "dado
 * errado é pior que dado faltante": titulação nula NÃO vira `elegivel_futuro`
 * por padrão, vira `indeterminada`, que sempre notifica — nunca é silenciada
 * como se fosse "sabemos que só dá pra concorrer depois de 2029").
 */

const assert = require('assert');
const elegibilidade = require('../lib/elegibilidade');

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
  console.log('\n=== elegibilidade.test.js ===\n');
  let passed = 0;
  let failed = 0;

  const perfilInicial = { titulacao_atual: 'mestrado_incerto' };
  const perfilConfirmado = { titulacao_atual: 'mestrado_confirmado' };
  const perfilDoutor = { titulacao_atual: 'doutorado_concluido' };

  const tests = [
    ['vaga exige doutorado concluído -> elegivel_futuro (sempre, JB ainda não é doutor)', () => {
      const r = elegibilidade.avaliar('doutorado', perfilInicial);
      assert.strictEqual(r.veredito, 'elegivel_futuro');
    }],

    ['vaga exige doutorado -> elegivel_futuro mesmo com perfil "doutorado_concluido" hipotético (regra é sobre a vaga, não presume)', () => {
      // regra do briefing não faz exceção — vaga de doutorado concluído é
      // sempre elegivel_futuro no contexto real de JB (defesa 2029); o teste
      // documenta que a função não quebra com outros perfis
      const r = elegibilidade.avaliar('doutorado', perfilDoutor);
      assert.strictEqual(r.veredito, 'elegivel_futuro');
    }],

    ['vaga exige mestrado + titulacao_atual = mestrado_incerto -> elegivel_futuro com nota de dúvida', () => {
      const r = elegibilidade.avaliar('mestrado', perfilInicial);
      assert.strictEqual(r.veredito, 'elegivel_futuro');
      assert.match(r.nota, /não confirmada|mestrado_incerto/i);
    }],

    ['vaga exige mestrado + titulacao_atual = mestrado_confirmado -> elegivel_agora', () => {
      const r = elegibilidade.avaliar('mestrado', perfilConfirmado);
      assert.strictEqual(r.veredito, 'elegivel_agora');
    }],

    ['Onda 2.1: vaga exige mestrado + área Design -> area_compativel "compativel" (mestrado TIDD/Design Digital de JB)', () => {
      const r = elegibilidade.avaliar('mestrado', perfilConfirmado, 'Design');
      assert.strictEqual(r.veredito, 'elegivel_agora');
      assert.strictEqual(r.area_compativel, 'compativel');
      assert.match(r.nota, /compat[íi]vel/i);
    }],

    ['Onda 2.1: vaga exige mestrado + área UX/IHC -> area_compativel "compativel"', () => {
      const r = elegibilidade.avaliar('mestrado', perfilConfirmado, 'UX/IHC');
      assert.strictEqual(r.area_compativel, 'compativel');
    }],

    ['Onda 2.1: vaga exige mestrado + área Computação/IA -> area_compativel "a_verificar_na_banca" (nunca presume compatível)', () => {
      const r = elegibilidade.avaliar('mestrado', perfilConfirmado, 'Computação/IA');
      assert.strictEqual(r.veredito, 'elegivel_agora');
      assert.strictEqual(r.area_compativel, 'a_verificar_na_banca');
      assert.match(r.nota, /banca/i);
    }],

    ['Onda 2.1: vaga exige mestrado + área não identificada (null/undefined) -> area_compativel null, não presume nada', () => {
      const r = elegibilidade.avaliar('mestrado', perfilConfirmado, null);
      assert.strictEqual(r.veredito, 'elegivel_agora');
      assert.strictEqual(r.area_compativel, null);
    }],

    ['Onda 2.1: vaga exige graduação/especialização + área Design -> elegivel_agora + area_compativel "compativel" (graduação Design de Interação de JB)', () => {
      const rGrad = elegibilidade.avaliar('graduacao', perfilConfirmado, 'Design');
      const rEsp = elegibilidade.avaliar('especializacao', perfilConfirmado, 'UX/IHC');
      assert.strictEqual(rGrad.area_compativel, 'compativel');
      assert.strictEqual(rEsp.area_compativel, 'compativel');
    }],

    ['Onda 2.1: vaga exige graduação + área Computação/IA -> area_compativel "a_verificar_na_banca" (EBTT pode exigir área específica, Lei 12.772/2012)', () => {
      const r = elegibilidade.avaliar('graduacao', perfilConfirmado, 'Computação/IA');
      assert.strictEqual(r.veredito, 'elegivel_agora');
      assert.strictEqual(r.area_compativel, 'a_verificar_na_banca');
    }],

    ['Onda 2.1: vaga exige mestrado + titulacao_atual = mestrado_incerto -> elegivel_futuro, sem area_compativel (não chegou a avaliar área)', () => {
      const r = elegibilidade.avaliar('mestrado', perfilInicial, 'Design');
      assert.strictEqual(r.area_compativel, undefined);
    }],

    ['vaga exige graduação -> elegivel_agora independente do perfil', () => {
      const r = elegibilidade.avaliar('graduacao', perfilInicial);
      assert.strictEqual(r.veredito, 'elegivel_agora');
    }],

    ['vaga exige especialização -> elegivel_agora independente do perfil', () => {
      const r = elegibilidade.avaliar('especializacao', perfilInicial);
      assert.strictEqual(r.veredito, 'elegivel_agora');
    }],

    ['avaliarAreaCompativel: nunca retorna "compativel" fora de Design/UX-IHC (honestidade, não otimismo)', () => {
      assert.strictEqual(elegibilidade.avaliarAreaCompativel('Design'), 'compativel');
      assert.strictEqual(elegibilidade.avaliarAreaCompativel('UX/IHC'), 'compativel');
      assert.strictEqual(elegibilidade.avaliarAreaCompativel('Computação/IA'), 'a_verificar_na_banca');
      assert.strictEqual(elegibilidade.avaliarAreaCompativel('Educação/Ensino'), 'a_verificar_na_banca');
      assert.strictEqual(elegibilidade.avaliarAreaCompativel('Categoria Desconhecida'), 'a_verificar_na_banca');
      assert.strictEqual(elegibilidade.avaliarAreaCompativel(null), null);
      assert.strictEqual(elegibilidade.avaliarAreaCompativel(undefined), null);
    }],

    ['titulação exigida não identificada -> indeterminada (Onda 1.7 — não presume "futuro", não descarta)', () => {
      const r = elegibilidade.avaliar(null, perfilInicial);
      assert.strictEqual(r.veredito, 'indeterminada');
      assert.match(r.nota, /indeterminada|verificar/i);
    }],

    ['titulação vazia ("") -> mesma regra de não identificada -> indeterminada', () => {
      const r = elegibilidade.avaliar('', perfilInicial);
      assert.strictEqual(r.veredito, 'indeterminada');
    }],

    ['possuiMestradoConfirmado é false para mestrado_incerto e true a partir de mestrado_confirmado', () => {
      assert.strictEqual(elegibilidade.possuiMestradoConfirmado('mestrado_incerto'), false);
      assert.strictEqual(elegibilidade.possuiMestradoConfirmado('graduacao'), false);
      assert.strictEqual(elegibilidade.possuiMestradoConfirmado('mestrado_confirmado'), true);
      assert.strictEqual(elegibilidade.possuiMestradoConfirmado('doutorado_incerto'), true);
      assert.strictEqual(elegibilidade.possuiMestradoConfirmado('doutorado_concluido'), true);
    }],

    ['regressão: perfil com titulacao_atual = mestrado_incerto continua conservador (elegivel_futuro)', () => {
      // config/perfil.json nasceu com 'mestrado_incerto' até a Onda 1.9 (JB
      // confirmou o título de mestre em 12/08/2026 — agora o valor real é
      // 'mestrado_confirmado', ver config/perfil.json). Este teste NÃO
      // documenta o valor do config; garante que a função continua
      // conservadora ('elegivel_futuro', sem pressupoe) se algum dia o
      // perfil voltar a um estado de incerteza (ex.: novo grau em aberto).
      const r = elegibilidade.avaliar('mestrado', { titulacao_atual: 'mestrado_incerto' });
      assert.strictEqual(r.veredito, 'elegivel_futuro');
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
