#!/usr/bin/env node
'use strict';

/**
 * ONDA 6 — o contrato de escrita do robô de inscrição, fechado ANTES de o
 * robô existir. `.claude/plans/radar-crm-20-ondas.md` §Bloco B, Onda 6, e o
 * briefing "Parte C — Onda 6: o contrato do robô de inscrição".
 *
 * Pedido literal de JB: "quando estivermos automatizando a inscrição para
 * essas vagas, essa coluna que irá nos dizer se estamos inscritos ou não."
 *
 * O QUE ESTE ARQUIVO PROVA:
 *
 *   A. `_norman/estado.js escreverRobo` (função PURA, sem rede) — o robô
 *      escreve em `_estado`, nunca na vista (a função só manipula o Map em
 *      memória; quem fala com a API é `construir.js`, exatamente como
 *      `colher`/`restaurar` já fazem — este arquivo não testa uma automação
 *      que ainda não existe, testa o CONTRATO que ela vai ter que respeitar).
 *   B. A PROVA CENTRAL DA ONDA: escrita do robô sobre um id/url MARCADO POR
 *      JB não destrói a marcação dele — nem o valor de `inscrito`, nem
 *      `porQuem`. A divergência fica VISÍVEL (não silenciosa): entra no
 *      valor de retorno (`divergencias`) e num carimbo dentro de `nota`
 *      (o mesmo campo que `Candidaturas!notas`, Onda 5, exibe a JB sem que
 *      ele precise abrir log nenhum).
 *   C. O caminho feliz: robô escreve numa url nova, ou numa url que já era
 *      dele — nesses casos, normalmente, com `porQuem='robô'`.
 *   D. `_norman/estado.js colherCandidatura`/`candidaturaCamposNaOrdem`
 *      (Onda 5) — os campos digitados de `Candidaturas` (estágio/próximo
 *      passo/notas) sobrevivem à reordenação do spill pelo MESMO mecanismo
 *      de três tempos que `Inscrito` já usa, e `estagio_quando` só muda
 *      quando `estagio` de fato muda de valor.
 */

const assert = require('assert');
const EST = require('../_norman/estado');

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

const EDITAL_A = 'https://exemplo.gov.br/edital/a-professor-design';
const EDITAL_B = 'https://exemplo.gov.br/edital/b-professor-ux';
const EDITAL_C = 'https://exemplo.com/vaga/c-produto-senior';

function main() {
  console.log('\n=== estado-robo-contrato.test.js ===\n');
  let passed = 0, failed = 0;

  const testes = [
    // =====================================================================
    // A/C — o caminho feliz do robô
    // =====================================================================
    ['escreverRobo: url NOVA + inscrito=true cria registro com porQuem=robô', () => {
      const { mapa, alterados, divergencias } = EST.escreverRobo(new Map(), [
        { url: EDITAL_A, trilha: 'docente', inscrito: true }
      ], '2026-08-28');
      assert.strictEqual(alterados, 1);
      assert.strictEqual(divergencias.length, 0, 'caminho feliz não gera divergência');
      const r = mapa.get(EDITAL_A);
      assert.strictEqual(r.inscrito, true);
      assert.strictEqual(r.porQuem, EST.POR_QUEM.ROBO);
      assert.strictEqual(r.quando, '2026-08-28');
    }],

    ['escreverRobo: url NOVA + inscrito=false NÃO cria registro (mesma regra de colher)', () => {
      const { mapa, alterados } = EST.escreverRobo(new Map(), [
        { url: EDITAL_A, trilha: 'docente', inscrito: false }
      ], '2026-08-28');
      assert.strictEqual(mapa.size, 0);
      assert.strictEqual(alterados, 0);
    }],

    ['escreverRobo: url já é DO ROBÔ e o valor mudou — atualiza normalmente, sem divergência', () => {
      const atual = new Map([[EDITAL_A, {
        url: EDITAL_A, trilha: 'docente', inscrito: false, quando: '2026-08-01',
        porQuem: EST.POR_QUEM.ROBO, nota: ''
      }]]);
      const { mapa, alterados, divergencias } = EST.escreverRobo(atual, [
        { url: EDITAL_A, trilha: 'docente', inscrito: true }
      ], '2026-08-28');
      assert.strictEqual(alterados, 1);
      assert.strictEqual(divergencias.length, 0);
      const r = mapa.get(EDITAL_A);
      assert.strictEqual(r.inscrito, true);
      assert.strictEqual(r.porQuem, EST.POR_QUEM.ROBO);
      assert.strictEqual(r.quando, '2026-08-28');
    }],

    ['escreverRobo: url já é do robô e o valor NÃO mudou — fica intocada (nenhuma escrita desnecessária)', () => {
      const atual = new Map([[EDITAL_A, {
        url: EDITAL_A, trilha: 'docente', inscrito: true, quando: '2026-08-01',
        porQuem: EST.POR_QUEM.ROBO, nota: ''
      }]]);
      const { mapa, alterados } = EST.escreverRobo(atual, [
        { url: EDITAL_A, trilha: 'docente', inscrito: true }
      ], '2026-08-28');
      assert.strictEqual(alterados, 0);
      assert.strictEqual(mapa.get(EDITAL_A).quando, '2026-08-01', 'não regravou uma coisa que não mudou');
    }],

    // =====================================================================
    // B — A PROVA CENTRAL: JB vence, a divergência fica VISÍVEL
    // =====================================================================
    ['CONTRATO — escreverRobo NUNCA apaga marcação de JB no mesmo id: JB=true, robô tenta false', () => {
      const atual = new Map([[EDITAL_A, {
        url: EDITAL_A, trilha: 'docente', inscrito: true, quando: '2026-08-20',
        porQuem: EST.POR_QUEM.JB, nota: ''
      }]]);
      const { mapa, alterados, divergencias } = EST.escreverRobo(atual, [
        { url: EDITAL_A, trilha: 'docente', inscrito: false }
      ], '2026-08-28');
      const r = mapa.get(EDITAL_A);
      assert.strictEqual(r.inscrito, true, 'JB venceu — inscrito continua true');
      assert.strictEqual(r.porQuem, EST.POR_QUEM.JB, 'a autoria não muda pra robô');
      assert.strictEqual(r.quando, '2026-08-20', '"quando" não é reescrito pela tentativa perdedora do robô');
      assert.strictEqual(divergencias.length, 1);
      assert.deepStrictEqual(divergencias[0], { url: EDITAL_A, jb: true, robo: false });
      assert.ok(r.nota.includes('robô'), 'a divergência fica VISÍVEL na nota — Candidaturas!notas mostra isto a JB');
      assert.ok(r.nota.includes('mantido'), 'a nota diz explicitamente que a marcação de JB foi mantida');
      assert.strictEqual(alterados, 1, 'a NOTA mudou (ganhou o carimbo) — isso conta como alteração pra fins de regravar _estado');
    }],

    ['CONTRATO — mesma prova, na direção oposta: JB=false, robô tenta true', () => {
      const atual = new Map([[EDITAL_A, {
        url: EDITAL_A, trilha: 'docente', inscrito: false, quando: '2026-08-20',
        porQuem: EST.POR_QUEM.JB, nota: 'JB decidiu não se inscrever'
      }]]);
      const { mapa, divergencias } = EST.escreverRobo(atual, [
        { url: EDITAL_A, trilha: 'docente', inscrito: true }
      ], '2026-08-28');
      const r = mapa.get(EDITAL_A);
      assert.strictEqual(r.inscrito, false, 'JB decidiu não se inscrever — o robô não pode inscrever por cima');
      assert.strictEqual(r.porQuem, EST.POR_QUEM.JB);
      assert.strictEqual(divergencias.length, 1);
      assert.ok(r.nota.startsWith('JB decidiu não se inscrever'), 'a nota ORIGINAL de JB é preservada, não substituída');
      assert.ok(r.nota.includes('⚠️'), 'o carimbo de divergência é ACRESCENTADO, não troca a nota de JB');
    }],

    ['CONTRATO — JB e robô CONCORDAM (mesmo valor): sem divergência, sem carimbo, nota intocada', () => {
      const atual = new Map([[EDITAL_A, {
        url: EDITAL_A, trilha: 'docente', inscrito: true, quando: '2026-08-20',
        porQuem: EST.POR_QUEM.JB, nota: 'nota original de JB'
      }]]);
      const { mapa, alterados, divergencias } = EST.escreverRobo(atual, [
        { url: EDITAL_A, trilha: 'docente', inscrito: true }
      ], '2026-08-28');
      assert.strictEqual(alterados, 0, 'concordar não é escrever — nada muda');
      assert.strictEqual(divergencias.length, 0);
      const r = mapa.get(EDITAL_A);
      assert.strictEqual(r.nota, 'nota original de JB', 'sem divergência, a nota de JB nem é tocada');
      assert.strictEqual(r.porQuem, EST.POR_QUEM.JB, 'concordar não transfere a autoria pro robô');
    }],

    ['CONTRATO — chamar escreverRobo DUAS VEZES com a MESMA divergência não duplica o carimbo', () => {
      let atual = new Map([[EDITAL_A, {
        url: EDITAL_A, trilha: 'docente', inscrito: true, quando: '2026-08-20',
        porQuem: EST.POR_QUEM.JB, nota: ''
      }]]);
      const rodada1 = EST.escreverRobo(atual, [{ url: EDITAL_A, trilha: 'docente', inscrito: false }], '2026-08-28');
      atual = rodada1.mapa;
      const notaApos1 = atual.get(EDITAL_A).nota;
      const rodada2 = EST.escreverRobo(atual, [{ url: EDITAL_A, trilha: 'docente', inscrito: false }], '2026-08-28');
      assert.strictEqual(rodada2.alterados, 0, 'o MESMO carimbo, no MESMO dia, não regrava _estado de novo');
      assert.strictEqual(rodada2.mapa.get(EDITAL_A).nota, notaApos1, 'a nota não cresce a cada build que o robô rodar');
    }],

    ['CONTRATO — divergência em MÚLTIPLAS urls no mesmo lote: cada uma reportada, nenhuma apagada', () => {
      const atual = new Map([
        [EDITAL_A, { url: EDITAL_A, trilha: 'docente', inscrito: true, quando: '2026-08-01', porQuem: EST.POR_QUEM.JB, nota: '' }],
        [EDITAL_B, { url: EDITAL_B, trilha: 'docente', inscrito: false, quando: '2026-08-01', porQuem: EST.POR_QUEM.JB, nota: '' }],
        [EDITAL_C, { url: EDITAL_C, trilha: 'mercado', inscrito: true, quando: '2026-08-01', porQuem: EST.POR_QUEM.ROBO, nota: '' }]
      ]);
      const { mapa, divergencias } = EST.escreverRobo(atual, [
        { url: EDITAL_A, trilha: 'docente', inscrito: false },  // diverge de JB
        { url: EDITAL_B, trilha: 'docente', inscrito: true },   // diverge de JB
        { url: EDITAL_C, trilha: 'mercado', inscrito: false }   // é do robô — aplica normal
      ], '2026-08-28');
      assert.strictEqual(divergencias.length, 2);
      assert.deepStrictEqual(new Set(divergencias.map(d => d.url)), new Set([EDITAL_A, EDITAL_B]));
      assert.strictEqual(mapa.get(EDITAL_A).inscrito, true, 'A continua marcado por JB');
      assert.strictEqual(mapa.get(EDITAL_B).inscrito, false, 'B continua desmarcado por JB');
      assert.strictEqual(mapa.get(EDITAL_C).inscrito, false, 'C não é de JB — o robô escreve livre');
    }],

    ['escreverRobo: não muta o Map recebido (devolve um Map NOVO — mesmo contrato de colher)', () => {
      const original = new Map();
      const { mapa } = EST.escreverRobo(original, [{ url: EDITAL_A, trilha: 'docente', inscrito: true }], '2026-08-28');
      assert.strictEqual(original.size, 0);
      assert.notStrictEqual(mapa, original);
    }],

    // =====================================================================
    // D — Onda 5: `colherCandidatura`/`candidaturaCamposNaOrdem`
    // =====================================================================
    ['colherCandidatura: url SEM registro em _estado é ignorada — não cria candidatura do nada', () => {
      const { mapa, alterados } = EST.colherCandidatura(new Map(), [
        { url: EDITAL_A, estagio: '📝 prova/entrevista', proximoPasso: '', nota: '' }
      ], '2026-08-28');
      assert.strictEqual(mapa.size, 0);
      assert.strictEqual(alterados, 0);
    }],

    ['colherCandidatura: url com inscrito=false é ignorada (a linha já devia ter sumido da vista)', () => {
      const atual = new Map([[EDITAL_A, {
        url: EDITAL_A, trilha: 'docente', inscrito: false, quando: '2026-08-01',
        porQuem: EST.POR_QUEM.JB, nota: '', estagio: '', estagioQuando: '', proximoPasso: ''
      }]]);
      const { mapa, alterados } = EST.colherCandidatura(atual, [
        { url: EDITAL_A, estagio: '🟢 aprovado', proximoPasso: '', nota: '' }
      ], '2026-08-28');
      assert.strictEqual(alterados, 0);
      assert.strictEqual(mapa.get(EDITAL_A).estagio, '', 'não escreve estágio numa candidatura que não está mais viva');
    }],

    ['colherCandidatura: estágio MUDOU — atualiza estagio E estagio_quando', () => {
      const atual = new Map([[EDITAL_A, {
        url: EDITAL_A, trilha: 'docente', inscrito: true, quando: '2026-08-01',
        porQuem: EST.POR_QUEM.JB, nota: '', estagio: '🟣 inscrito', estagioQuando: '2026-08-01', proximoPasso: ''
      }]]);
      const { mapa, alterados } = EST.colherCandidatura(atual, [
        { url: EDITAL_A, estagio: '📝 prova/entrevista', proximoPasso: '', nota: '' }
      ], '2026-08-28');
      assert.strictEqual(alterados, 1);
      const r = mapa.get(EDITAL_A);
      assert.strictEqual(r.estagio, '📝 prova/entrevista');
      assert.strictEqual(r.estagioQuando, '2026-08-28', 'o carimbo de data acompanha a MUDANÇA de estágio');
    }],

    ['colherCandidatura: próximo passo/nota mudam SEM tocar estagio_quando (o carimbo é só do estágio)', () => {
      const atual = new Map([[EDITAL_A, {
        url: EDITAL_A, trilha: 'docente', inscrito: true, quando: '2026-08-01',
        porQuem: EST.POR_QUEM.JB, nota: '', estagio: '🟣 inscrito', estagioQuando: '2026-08-01', proximoPasso: ''
      }]]);
      const { mapa, alterados } = EST.colherCandidatura(atual, [
        { url: EDITAL_A, estagio: '🟣 inscrito', proximoPasso: 'mandar e-mail de follow-up', nota: 'aguardar retorno' }
      ], '2026-08-28');
      assert.strictEqual(alterados, 1);
      const r = mapa.get(EDITAL_A);
      assert.strictEqual(r.proximoPasso, 'mandar e-mail de follow-up');
      assert.strictEqual(r.nota, 'aguardar retorno');
      assert.strictEqual(r.estagioQuando, '2026-08-01', 'estágio não mudou — o carimbo de data fica como estava');
    }],

    ['colherCandidatura: nada mudou — fica intocada (alterados=0)', () => {
      const atual = new Map([[EDITAL_A, {
        url: EDITAL_A, trilha: 'docente', inscrito: true, quando: '2026-08-01',
        porQuem: EST.POR_QUEM.JB, nota: 'x', estagio: '🟣 inscrito', estagioQuando: '2026-08-01', proximoPasso: 'y'
      }]]);
      const { alterados } = EST.colherCandidatura(atual, [
        { url: EDITAL_A, estagio: '🟣 inscrito', proximoPasso: 'y', nota: 'x' }
      ], '2026-08-28');
      assert.strictEqual(alterados, 0);
    }],

    ['candidaturaCamposNaOrdem: alinhado por url, com default vazio pra desconhecida/url vazia', () => {
      const mapa = new Map([
        [EDITAL_A, { estagio: '🟢 aprovado', proximoPasso: 'assinar contrato', nota: 'nota A' }],
        [EDITAL_B, { estagio: '🔴 não passou', proximoPasso: '', nota: '' }]
      ]);
      const campos = EST.candidaturaCamposNaOrdem(mapa, [EDITAL_B, '', EDITAL_A, 'https://desconhecida.com']);
      assert.deepStrictEqual(campos.estagio, ['🔴 não passou', '', '🟢 aprovado', '']);
      assert.deepStrictEqual(campos.proximoPasso, ['', '', 'assinar contrato', '']);
      assert.deepStrictEqual(campos.nota, ['', '', 'nota A', '']);
    }]
  ];

  for (const [name, fn] of testes) { if (runTest(name, fn)) passed++; else failed++; }

  console.log(`\n${passed} passou(aram), ${failed} falhou(aram)\n`);
  process.exit(failed ? 1 : 0);
}

main();
