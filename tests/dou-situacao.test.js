#!/usr/bin/env node
'use strict';

/**
 * Testa `classificarSituacao`/`classificarSituacaoTexto` (fontes/dou.js) —
 * terceiro conserto do mesmo dia (2026-09-09), decisão de JB: o balde
 * `em_andamento` (55 itens no conserto Nº 2) não é descartado, vira aba
 * própria ("Vagas Abertas" / "Em andamento"). A pergunta que classifica
 * deixou de ser "isto tem cara de concurso?" e virou "JB pode se inscrever
 * nisto HOJE?".
 *
 * REGRA DURA (autorização de Durin): a classificação NUNCA muda quem passa
 * o gate (`pareceEditalDeConcursoOuSeletivo`/`lib/vaga-docente.js
 * pareceVagaDocente`) — só rotula quem já passou. Cada teste de situação
 * abaixo também confirma que o item continua passando o gate sem alteração.
 *
 * DISCRIMINAÇÃO OBRIGATÓRIA NOS TRÊS LADOS — casos reais nomeados:
 *   inscricao_aberta: UFPEL 27/2026, UFRN (retificação de tabela de vagas
 *     de edital aberto).
 *   em_andamento: IFPE (retificação de HOMOLOGAÇÃO — corrige o rótulo do
 *     teste do conserto Nº 1, que chamava isso de "positivo do pré-filtro"
 *     sem notar que substantivamente não é vaga; o CASO continua bom, só o
 *     rótulo mudou), FURG Edital nº 13 (prorrogação de prazo de VALIDADE de
 *     concursos já realizados), IFB Edital de Convocação 19/DGPL (convoca
 *     candidata JÁ aprovada e classificada, resultado final homologado em
 *     2025 — confirmado pelo texto integral do artigo), e UFFS Edital nº
 *     387 — VEREDITO: é prorrogação de prazo de VALIDADE (não de
 *     inscrição) de um processo cujo resultado final já foi homologado em
 *     2024 (Edital nº 568/GR/UFFS/2024) — Durin e eu erramos ao tratá-lo
 *     como vaga aberta antes; confirmado pelo texto integral do artigo.
 *   encerrado: UNIRIO Edital nº 212 revoga o PRÓPRIO Edital nº 138/2026
 *     (Processo Seletivo Simplificado inteiro) — processo morto. Distinto
 *     de revogar/tornar sem efeito uma SUSPENSÃO (Sergipe/Paraíba, ver
 *     RE_REVOGA_SUSPENSAO em fontes/dou.js) — isso REABRE o caminho pro
 *     processo original continuar, e por isso classifica como
 *     `em_andamento`, não `encerrado`.
 *   descartado (não classificado, nem chega aqui): IFMG Bambuí/IFCE
 *     Jaguaribe/IFSC (extrato de contrato) e IFMG Ouro Branco (extrato de
 *     termo aditivo) — `pareceEditalDeConcursoOuSeletivo` já rejeita antes
 *     de qualquer classificação (ver tests/dou-recibo-contrato.test.js,
 *     mantido sem alteração).
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const dou = require('../fontes/dou');

const tresSituacoes = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'dou-itens-tres-situacoes.json'), 'utf8'));
const tipoGenericos = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'dou-itens-tipo-genericos.json'), 'utf8'));
const reciboContrato = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'dou-itens-recibo-contrato.json'), 'utf8'));

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
  console.log('\n=== dou-situacao.test.js ===\n');
  let passed = 0;
  let failed = 0;

  const { pareceEditalDeConcursoOuSeletivo } = dou._internal;
  const { classificarSituacao, SITUACAO } = dou;

  const tests = [
    // --- inscricao_aberta: nomeado ---
    ['inscricao_aberta nomeado: UFPEL 27/2026 (abertura nova) — passa o gate E classifica inscricao_aberta', () => {
      assert.strictEqual(pareceEditalDeConcursoOuSeletivo(tipoGenericos.ufpel), true);
      assert.strictEqual(classificarSituacao(tipoGenericos.ufpel), SITUACAO.INSCRICAO_ABERTA);
    }],
    ['inscricao_aberta nomeado: UFRN (retifica tabela de vagas de edital aberto) — passa o gate E classifica inscricao_aberta', () => {
      assert.strictEqual(pareceEditalDeConcursoOuSeletivo(tipoGenericos.ufrn), true);
      assert.strictEqual(classificarSituacao(tipoGenericos.ufrn), SITUACAO.INSCRICAO_ABERTA);
    }],

    // --- em_andamento: nomeado, quatro casos de naturezas diferentes ---
    ['em_andamento nomeado: IFPE (retificação de HOMOLOGAÇÃO de concurso público) — passa o gate E classifica em_andamento (corrige o rótulo do conserto Nº 1, caso mantido)', () => {
      assert.strictEqual(pareceEditalDeConcursoOuSeletivo(tipoGenericos.ifpe), true);
      assert.strictEqual(classificarSituacao(tipoGenericos.ifpe), SITUACAO.EM_ANDAMENTO);
    }],
    ['em_andamento nomeado: FURG Edital nº 13 (prorrogação de prazo de VALIDADE de concursos públicos) classifica em_andamento', () => {
      assert.strictEqual(pareceEditalDeConcursoOuSeletivo(tresSituacoes.furg13), true);
      assert.strictEqual(classificarSituacao(tresSituacoes.furg13), SITUACAO.EM_ANDAMENTO);
    }],
    ['em_andamento nomeado: IFB Edital de Convocação 19/DGPL (convoca candidata já aprovada) classifica em_andamento', () => {
      assert.strictEqual(pareceEditalDeConcursoOuSeletivo(tresSituacoes.ifbConvocacaoAgronomia), true);
      assert.strictEqual(classificarSituacao(tresSituacoes.ifbConvocacaoAgronomia), SITUACAO.EM_ANDAMENTO);
    }],
    ['em_andamento nomeado: UFFS Edital nº 387 (prorrogação de VALIDADE, não de inscrição — veredito confirmado pelo artigo integral) classifica em_andamento', () => {
      assert.strictEqual(pareceEditalDeConcursoOuSeletivo(tresSituacoes.uffs387), true);
      assert.strictEqual(classificarSituacao(tresSituacoes.uffs387), SITUACAO.EM_ANDAMENTO);
    }],

    // --- encerrado: nomeado ---
    ['encerrado nomeado: UNIRIO Edital nº 212 revoga o PRÓPRIO Edital nº 138/2026 (processo morto) classifica encerrado', () => {
      assert.strictEqual(pareceEditalDeConcursoOuSeletivo(tresSituacoes.unirioRevogacao212), true);
      assert.strictEqual(classificarSituacao(tresSituacoes.unirioRevogacao212), SITUACAO.ENCERRADO);
    }],

    // --- Distinção fina: revogar uma SUSPENSÃO não é "encerrado" ---
    ['revogar/tornar sem efeito uma SUSPENSÃO (o processo original CONTINUA) classifica em_andamento, não encerrado', () => {
      const sergipeRevogaSuspensao = {
        title: 'EDITAL Nº 1/2026',
        content:
          'EDITAL Nº 1/2026 REVOGAÇÃO DO EDITAL Nº 6/2024 A Universidade Federal de Sergipe torna pública a decisão da Pró-Reitoria de Gestão de Pessoas [...] de REVOGAR o Edital de Suspensão nº 001, de 06 de fevereiro de 2025, publicado no D.O.U. em 07/02/2025, que suspendeu o Concurso Público para Professor Efetivo do Departamento de...',
        hierarchyStr: 'Ministério da Educação/Universidade Federal de Sergipe'
      };
      assert.strictEqual(classificarSituacao(sergipeRevogaSuspensao), SITUACAO.EM_ANDAMENTO);
    }],

    // --- descartado: nomeado — NÃO chega a ser classificado, o gate já rejeita ---
    ['descartado nomeado: IFMG Campus Bambuí (extrato de contrato) NÃO passa o gate — não é classificado', () => {
      assert.strictEqual(pareceEditalDeConcursoOuSeletivo(reciboContrato.ifmgBambui), false);
    }],
    ['descartado nomeado: IFCE Campus Jaguaribe (extrato de contrato) NÃO passa o gate', () => {
      assert.strictEqual(pareceEditalDeConcursoOuSeletivo(reciboContrato.ifceJaguaribe), false);
    }],
    ['descartado nomeado: IFSC (extrato de contrato) NÃO passa o gate', () => {
      assert.strictEqual(pareceEditalDeConcursoOuSeletivo(reciboContrato.ifsc), false);
    }],
    ['descartado nomeado: IFMG Campus Ouro Branco (extrato de termo aditivo) NÃO passa o gate', () => {
      assert.strictEqual(pareceEditalDeConcursoOuSeletivo(reciboContrato.termoAditivoIfmgOuroBranco), false);
    }],

    // --- default seguro: nem revoga/torna-sem-efeito, nem homologa/resultado/convocação/validade -> inscricao_aberta ---
    ['item sem nenhum sinal de encerrado/em_andamento cai no default inscricao_aberta (nunca fica sem classificação)', () => {
      const aberturaGenerica = {
        title: 'EDITAL Nº 999',
        content:
          'EDITAL Nº 999 CONCURSO PÚBLICO PARA PROVIMENTO DE CARGO DE PROFESSOR DA CARREIRA DE MAGISTÉRIO SUPERIOR O Reitor da Universidade X torna pública a abertura de inscrições.',
        hierarchyStr: 'Ministério da Educação/Universidade X'
      };
      assert.strictEqual(classificarSituacao(aberturaGenerica), SITUACAO.INSCRICAO_ABERTA);
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
