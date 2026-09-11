#!/usr/bin/env node
'use strict';

/**
 * Testa `pareceEditalDeConcursoOuSeletivo` (fontes/dou.js) — o pré-filtro
 * consertado (item 1 do briefing Durin 2026-09-09) contra dados REAIS
 * capturados de www.in.gov.br em 09-09-2026, sem rede (fixture congelada em
 * tests/fixtures/dou-itens-tipo-genericos.json).
 *
 * DEFEITO ORIGINAL: o pré-filtro antigo confiava em `artType` como CHAVE
 * ÚNICA (lista fechada `['Edital de Concurso Público', 'Edital de Processo
 * Seletivo']`). Medido em 09-09-2026: `pre-filtro-de-tipo 0/1941 itens` —
 * falso zero, escondendo vaga docente real (UFPEL, processo seletivo
 * simplificado para Professor Visitante, sob artType='Edital'; UFRN, sob
 * 'Retificação (de Edital)').
 *
 * DISCRIMINAÇÃO OBRIGATÓRIA (briefing item 4) — os dois lados, cada um com
 * caso NOMEADO e real, não hipotético:
 *   POSITIVO (deste pré-filtro — três artTypes genéricos DIFERENTES,
 *   'Edital', 'Retificação (de Edital)', 'Retificação' pura, todos
 *   precisam ser ENCONTRADOS pelo GATE): UFPEL (Edital nº 27/2026), UFRN
 *   (retificação do edital 106/2026-PROGESP), IFPE (retificação do
 *   concurso público de professor).
 *
 *   CORREÇÃO (mesmo dia, conserto Nº 3 — decisão de JB de classificar em
 *   vez de descartar): o IFPE PASSA o gate (é isso que este arquivo prova
 *   e continua provando — a lista de artTypes genéricos não escondeu o
 *   item), mas SUBSTANTIVAMENTE não é uma vaga aberta — é retificação de
 *   uma HOMOLOGAÇÃO de resultado final já publicada. Chamar isso de
 *   "positivo" sem qualificação era o mesmo erro que motivou o conserto
 *   Nº 2 (rotular "passou o pré-filtro" como "vaga real"). O caso continua
 *   bom (prova que `artType='Retificação'` pura esconde documento) — só o
 *   rótulo mudou: ver tests/dou-situacao.test.js, onde o MESMO fixture
 *   `tipoGenericos.ifpe` é o caso nomeado de `em_andamento`, não de "vaga
 *   aberta". Este arquivo testa só o GATE (passa/não passa); a situação
 *   (inscricao_aberta/em_andamento/encerrado) é assunto do outro arquivo.
 *
 *   NEGATIVO: 'Edital de Notificação' (Ibama/SUPES-AL, cobrança de taxa
 *   ambiental), 'Edital de Intimação' (Anatel), 'Edital de Citação'
 *   (Conselho Regional de Educação Física) — três artTypes que também usam
 *   a palavra "Edital" mas são instrumento de citação processual, não de
 *   provimento de cargo docente; nenhum contém "concurso público"/"processo
 *   seletivo". Precisam continuar REJEITADOS.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const dou = require('../fontes/dou');

const itens = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'dou-itens-tipo-genericos.json'), 'utf8'));

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
  console.log('\n=== dou-tipo-editais.test.js ===\n');
  let passed = 0;
  let failed = 0;

  const { pareceEditalDeConcursoOuSeletivo } = dou._internal;

  const tests = [
    // --- POSITIVO: rótulo genérico do DOU, mas é vaga docente real ---
    ['POSITIVO nomeado: UFPEL (artType="Edital", Processo Seletivo Professor Visitante) é ENCONTRADO', () => {
      assert.strictEqual(pareceEditalDeConcursoOuSeletivo(itens.ufpel), true);
    }],

    ['POSITIVO nomeado: UFRN (artType="Retificação (de Edital)", Processo Seletivo Professor Substituto/Temporário) é ENCONTRADO', () => {
      assert.strictEqual(pareceEditalDeConcursoOuSeletivo(itens.ufrn), true);
    }],

    ['GATE nomeado: IFPE (artType="Retificação" pura) é ENCONTRADO pelo pré-filtro — mecanismo provado aqui; a situação real (em_andamento, retificação de HOMOLOGAÇÃO, não vaga aberta) é testada em tests/dou-situacao.test.js', () => {
      assert.strictEqual(pareceEditalDeConcursoOuSeletivo(itens.ifpe), true);
    }],

    // --- NEGATIVO: mesma palavra "Edital" na casca, zero relação com concurso/processo seletivo ---
    ['NEGATIVO nomeado: Edital de Notificação (Ibama/SUPES-AL, cobrança de TCFA) continua REJEITADO', () => {
      assert.strictEqual(pareceEditalDeConcursoOuSeletivo(itens.notificacao), false);
    }],

    ['NEGATIVO nomeado: Edital de Intimação (Anatel) continua REJEITADO', () => {
      assert.strictEqual(pareceEditalDeConcursoOuSeletivo(itens.intimacao), false);
    }],

    ['NEGATIVO nomeado: Edital de Citação (Conselho Regional de Educação Física) continua REJEITADO', () => {
      assert.strictEqual(pareceEditalDeConcursoOuSeletivo(itens.citacao), false);
    }],

    // --- Não-regressão: os dois artTypes específicos antigos continuam funcionando por si só ---
    ['Não-regressão: artType específico ("Edital de Concurso Público") passa mesmo sem o sinal textual', () => {
      const semSinal = { artType: 'Edital de Concurso Público', title: 'X', content: 'Y', hierarchyStr: 'Z' };
      assert.strictEqual(pareceEditalDeConcursoOuSeletivo(semSinal), true);
    }],

    ['Não-regressão: artType genérico SEM sinal textual nenhum é REJEITADO (não virou "aceita tudo")', () => {
      const semSinalNemArtType = { artType: 'Edital', title: 'Aviso qualquer', content: 'nada a ver com concurso', hierarchyStr: 'Órgão X' };
      assert.strictEqual(pareceEditalDeConcursoOuSeletivo(semSinalNemArtType), false);
    }],

    ['RE_SINAL_CONCURSO_OU_SELETIVO casa "processo seletivo simplificado" (texto real UFPEL)', () => {
      assert.ok(dou._internal.RE_SINAL_CONCURSO_OU_SELETIVO.test(itens.ufpel.content));
    }],

    ['RE_SINAL_CONCURSO_OU_SELETIVO NÃO casa o texto do Edital de Notificação real', () => {
      assert.ok(!dou._internal.RE_SINAL_CONCURSO_OU_SELETIVO.test(itens.notificacao.content));
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
