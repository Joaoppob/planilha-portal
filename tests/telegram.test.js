#!/usr/bin/env node
'use strict';

/**
 * Testa lib/telegram.js — item 1 do briefing Onda 1.7: item marcado
 * 'indeterminada' ou 'formato_nao_reconhecido' NUNCA pode ser silenciado —
 * a mensagem carrega o aviso explícito "abrir o edital para conferir".
 */

const assert = require('assert');
const telegram = require('../lib/telegram');

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
    orgao: 'Universidade Federal de Goiás',
    campus: 'Câmpus Cidade Ocidental',
    area: null,
    subarea: null,
    titulacao_exigida: null,
    tipo: null,
    vagas: null,
    inscricao_fim: null,
    score: 40,
    veredito: 'indeterminada',
    julgamento: null,
    url: 'https://www.in.gov.br/web/dou/-/exemplo',
    extracao: null,
    ...overrides
  };
}

function main() {
  console.log('\n=== telegram.test.js ===\n');
  let passed = 0;
  let failed = 0;

  const tests = [
    ['formatarMensagem inclui aviso explícito quando extracao=formato_nao_reconhecido', () => {
      const msg = telegram.formatarMensagem(registroBase({ extracao: 'formato_nao_reconhecido' }));
      assert.match(msg, /não confirmad|ABRIR O EDITAL/i);
    }],

    ['formatarMensagem inclui aviso explícito quando veredito=indeterminada (mesmo sem extracao)', () => {
      const msg = telegram.formatarMensagem(registroBase());
      assert.match(msg, /indeterminada|não presumida|abrir o edital/i);
    }],

    ['formatarMensagem NÃO inclui aviso de incerteza pra elegivel_agora normal', () => {
      const msg = telegram.formatarMensagem(
        registroBase({ veredito: 'elegivel_agora', area: 'Design', subarea: 'Design (geral)', titulacao_exigida: 'graduacao', extracao: null })
      );
      assert.doesNotMatch(msg, /ABRIR O EDITAL para conferir a linha certa/i);
    }],

    ['notaConfianca retorna null quando não há incerteza (item confiável)', () => {
      assert.strictEqual(telegram.notaConfianca(registroBase({ veredito: 'elegivel_agora', extracao: null })), null);
    }],

    ['EMOJI_VEREDITO indireto: formatarMensagem não quebra pra veredito indeterminada', () => {
      const msg = telegram.formatarMensagem(registroBase());
      assert.match(msg, /❓/);
    }],

    ['notaConfianca: veredito elegivel_agora + area_compativel a_verificar_na_banca -> avisa banca (Onda 2.1)', () => {
      const nota = telegram.notaConfianca(registroBase({ veredito: 'elegivel_agora', area_compativel: 'a_verificar_na_banca' }));
      assert.match(nota, /banca/i);
    }],

    ['notaConfianca: veredito elegivel_agora + area_compativel null -> avisa área não identificada (Onda 2.1)', () => {
      const nota = telegram.notaConfianca(registroBase({ veredito: 'elegivel_agora', area_compativel: null }));
      assert.match(nota, /área/i);
    }],

    ['notaConfianca: veredito elegivel_agora + area_compativel compativel -> null (sem ressalva)', () => {
      const nota = telegram.notaConfianca(registroBase({ veredito: 'elegivel_agora', area_compativel: 'compativel' }));
      assert.strictEqual(nota, null);
    }],

    ['Onda 2.1: formatarDigestFechamento monta mensagem com os números e o aviso de "só o que for novo"', () => {
      const msg = telegram.formatarDigestFechamento({ totalOportunidades: 204, elegivelAgora: 20, scoreMinimo: 60 });
      assert.match(msg, /204/);
      assert.match(msg, /20/);
      assert.match(msg, /RELATORIO/);
      assert.match(msg, /NOVO/);
      assert.match(msg, /indeterminada/i);
    }],

    ['correção urgente: formatarAvisoLimite monta mensagem com quantos foram enviados, quantos ficaram de fora, e onde ver', () => {
      const msg = telegram.formatarAvisoLimite({ enviados: 10, restantes: 177 });
      assert.match(msg, /10/);
      assert.match(msg, /177/);
      assert.match(msg, /RELATORIO/);
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
