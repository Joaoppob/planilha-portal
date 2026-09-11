#!/usr/bin/env node
'use strict';

/**
 * CONTROLE POSITIVO da instrumentação de cobertura (lib/coverage.js) sobre o
 * pipeline REAL de descarte de `radar.js processarItensFonte` — briefing:
 * "teste que prova que o coverage DISCRIMINA, não que ele existe". Um teste
 * que só checa "o campo coverage está presente"/"não é nulo" NÃO prova nada
 * (o campo pode estar sempre certo por acidente, ou sempre 1/1). Aqui, para
 * CADA um dos 5 pontos de descarte mapeados nesta obra, rodamos um par de
 * cenários — quase tudo passa / quase tudo cai — com fontes FAKE (offline,
 * sem rede, `lib/modo-seco.js` ativo o tempo todo: nada é gravado em
 * data/store.jsonl) e exigimos que:
 *
 *   1. os dois cenários do par produzam NÚMEROS DIFERENTES;
 *   2. os números batem EXATAMENTE com o que foi construído no fixture
 *      (não "menor que" ou "maior que zero" — o valor exato);
 *   3. os `descartes` carreguem `{ id, reason }` de verdade.
 *
 * Os 5 pontos (mapeados em processarItensFonte, radar.js):
 *   - gate docente        (lib/vaga-docente.js pareceVagaDocente)
 *   - estágio3 edital único (lib/subedital-extrator.js avaliarEditalUnico)
 *   - estágio3 subedital-linha (lib/subedital-extrator.js registrosRelevantes,
 *     cobertura por LINHA, derivada em radar.js sem alterar a função)
 *   - gate mercado         (lib/vaga-mercado.js pareceVagaMercado)
 *   - aderência mercado    (lib/score-mercado.js avaliarAderencia)
 *
 * As fontes fake aqui reimplementam só o contrato mínimo de fonte (README
 * §Como adicionar uma fonte nova) — nunca tocam `fontes/*.js` reais, nunca
 * fazem requisição de rede (não têm `coletar`; os itens são passados direto
 * para `processarItensFonte`, que é o que `comandoColetar` chama depois de
 * `fonte.coletar()` já ter devolvido a lista).
 *
 * Todo texto sintético foi CONFERIDO contra as funções reais antes de entrar
 * aqui (node -e ad-hoc, ver relatório) — os números abaixo não são chute.
 */

const assert = require('assert');
const modoSeco = require('../lib/modo-seco');
const subeditalExtrator = require('../lib/subedital-extrator');
const radar = require('../radar.js');

const { processarItensFonte } = radar;

function runTest(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`  ✓ ${name}`);
      return true;
    })
    .catch(error => {
      console.log(`  ✗ ${name}`);
      console.error(`    ${error.stack || error.message}`);
      return false;
    });
}

// ---------------------------------------------------------------- fixtures

/** Texto que satisfaz lib/vaga-docente.js pareceVagaDocente (concurso público
 * + professor + instituição federal) — usado como "gate passa". */
function textoGatePassa(n) {
  return `Universidade Federal de Exemplo — Edital nº ${n}/2026 — concurso público para provimento de cargo de ` +
    `Professor Adjunto, na área de Design, Design Digital.`;
}

/** Texto que NUNCA bate professor/docente/magistério — gate falha por
 * desenho (falta RE_DOCENTE), não por acidente de formatação. */
function textoGateFalha(n) {
  return `Prefeitura Municipal de Exemplo — Processo seletivo simplificado nº ${n}/2026 para contratação de ` +
    `Agente Administrativo, cadastro reserva.`;
}

/** Gate docente sempre passa; varia se a área bate keyword (estágio3 edital
 * único) — mesma frase-base, só a presença de "Design"/"Design Digital". */
function textoComArea(n) {
  return `Concurso público para Professor Adjunto na Universidade Federal de Exemplo, edital ${n}/2026, ` +
    `na área de Design, com foco em Design Digital.`;
}
function textoSemArea(n) {
  return `Concurso público para Professor Adjunto na Universidade Federal de Exemplo, edital ${n}/2026. ` +
    `Requisitos gerais de praxe, conforme edital.`;
}

/** Uma "linha" de subedital no formato que lib/subedital-extrator.js espera
 * (ver cabeçalho do módulo — validado contra dividirSubeditais/registrosRelevantes
 * antes de entrar aqui). */
function linhaSubedital(codigo, area) {
  return `${codigo} Professor Adjunto Departamento de Exemplo - DES Sao Paulo 1 ${area} ${area} Doutorado em ${area} DE R$ 100,00`;
}

/** Monta o texto de um edital guarda-chuva com `nDesign` linhas de área
 * "Design" (relevante) e `nEstatistica` linhas de área "Estatistica"
 * (irrelevante — "estatística" não é termo de config/keywords.json). */
function textoGuardaChuva(nDesign, nEstatistica) {
  const linhas = [];
  let seq = 1;
  for (let i = 0; i < nDesign; i++) linhas.push(linhaSubedital(`004/26.${String(seq++).padStart(2, '0')}`, 'Design'));
  for (let i = 0; i < nEstatistica; i++) linhas.push(linhaSubedital(`004/26.${String(seq++).padStart(2, '0')}`, 'Estatistica'));
  return linhas.join(' ');
}

/** Fonte fake docente — contrato mínimo (README §Como adicionar uma fonte
 * nova), sem rede, sem `coletar` (os itens já vêm prontos). `dividirSubeditais`
 * reaproveita a função REAL de lib/subedital-extrator.js (mesma que
 * fontes/dou.js re-exporta) — nunca uma versão fake do split. */
function fonteDocenteFake(id, { comSubedital = false } = {}) {
  return {
    id,
    nome: `Fake Docente (${id})`,
    trilha: undefined,
    textoParaFiltro: rawItem => rawItem.texto,
    normalizarParcial: rawItem => ({
      fonte: id,
      orgao: 'Universidade Federal de Exemplo',
      campus: null,
      uf: 'SP',
      url: `https://fake.test/${id}/${rawItem.id}`,
      data_publicacao: '2026-01-01',
      texto_bruto: rawItem.texto
    }),
    enriquecer: async rawItem => ({
      texto_bruto: rawItem.textoEnriquecido || rawItem.texto,
      regime: null,
      classe: null,
      tipo: null,
      inscricao_inicio: null,
      inscricao_fim: null
    }),
    ...(comSubedital ? { dividirSubeditais: texto => subeditalExtrator.dividirSubeditais(texto) } : {})
  };
}

/** Fonte fake mercado — espelha o contrato mínimo de fontes/gupy.js
 * (README §Trilha mercado): `pareceVagaMercado`/`avaliarAderencia` (chamadas
 * de dentro de processarItensFonte) leem os MESMOS campos que a Gupy real
 * expõe (`jobUrl`/`name`/`careerPageName`/`type`/`country`). */
function fonteMercadoFake(id) {
  return {
    id,
    nome: `Fake Mercado (${id})`,
    trilha: 'mercado',
    textoParaFiltro: rawItem => [rawItem.name, rawItem.description].filter(Boolean).join(' \n '),
    normalizarParcial: rawItem => ({
      fonte: id,
      trilha: 'mercado',
      orgao: rawItem.careerPageName || null,
      campus: null,
      uf: null,
      url: rawItem.jobUrl || null,
      data_publicacao: '2026-01-01',
      inscricao_inicio: '2026-01-01',
      inscricao_fim: null,
      texto_bruto: [rawItem.name, rawItem.description].filter(Boolean).join(' \n '),
      modalidade: null,
      senioridade: null,
      subedital: null,
      classe: null,
      regime: null,
      tipo: null,
      vagas: null
    }),
    enriquecer: async rawItem => ({ texto_bruto: [rawItem.name, rawItem.description].filter(Boolean).join(' \n ') })
  };
}

async function main() {
  console.log('\n=== coverage-pipeline-discrimina.test.js (controle positivo) ===\n');
  let passed = 0;
  let failed = 0;

  modoSeco.ativar(); // nenhuma escrita real em data/store.jsonl durante este arquivo inteiro

  const tests = [
    // --------------------------------------------------- gate docente (estágio 1)
    ['gate docente — cenário QUASE TUDO PASSA: 9/10 itens são vaga docente, 1 não é', async () => {
      const fonte = fonteDocenteFake('fake-docente-gate-passa');
      const itens = [];
      for (let i = 1; i <= 9; i++) itens.push({ id: `p${i}`, texto: textoGatePassa(i) });
      itens.push({ id: 'f1', texto: textoGateFalha(99) });

      const stats = await processarItensFonte(fonte, itens);
      assert.strictEqual(stats.coverage.gate.covered, 9);
      assert.strictEqual(stats.coverage.gate.total, 10);
      assert.strictEqual(stats.coverage.gate.descartes.length, 1);
      assert.strictEqual(stats.coverage.gate.descartes[0].reason, 'gate_vaga_docente');
      assert.ok(typeof stats.coverage.gate.descartes[0].id === 'string' && stats.coverage.gate.descartes[0].id.length > 0);
    }],

    ['gate docente — cenário QUASE TUDO CAI: 1/10 é vaga docente, 9 não são (números DIFERENTES do cenário anterior)', async () => {
      const fonte = fonteDocenteFake('fake-docente-gate-cai');
      const itens = [{ id: 'p1', texto: textoGatePassa(1) }];
      for (let i = 1; i <= 9; i++) itens.push({ id: `f${i}`, texto: textoGateFalha(i) });

      const stats = await processarItensFonte(fonte, itens);
      assert.strictEqual(stats.coverage.gate.covered, 1);
      assert.strictEqual(stats.coverage.gate.total, 10);
      assert.strictEqual(stats.coverage.gate.descartes.length, 9);
      // a prova de discriminação: os dois cenários têm o MESMO total (10) e
      // `covered` EXATAMENTE invertido (9 vs 1) — não é "sempre alto" nem
      // "sempre baixo", o instrumento reflete o item de verdade.
    }],

    // ------------------------------------------------- estágio3 edital único
    ['edital único — QUASE TUDO PASSA a keyword de área: 9/10 mencionam Design, 1 não menciona nenhuma área', async () => {
      const fonte = fonteDocenteFake('fake-docente-unico-passa');
      const itens = [];
      for (let i = 1; i <= 9; i++) itens.push({ id: `a${i}`, texto: textoComArea(i) });
      itens.push({ id: 'sa1', texto: textoSemArea(99) });

      const stats = await processarItensFonte(fonte, itens);
      // gate: todos os 10 são docente-shaped (mesma frase-base) — passa igual
      assert.strictEqual(stats.coverage.gate.covered, 10);
      assert.strictEqual(stats.coverage.gate.total, 10);
      // estágio3 (edital único): só quem menciona a área bate o filtro de keyword
      assert.strictEqual(stats.coverage.editalUnico.covered, 9);
      assert.strictEqual(stats.coverage.editalUnico.total, 10);
      assert.strictEqual(stats.coverage.editalUnico.descartes.length, 1);
      assert.strictEqual(stats.coverage.editalUnico.descartes[0].reason, 'edital_unico_sem_termo_area');
    }],

    ['edital único — QUASE TUDO CAI na keyword de área: 1/10 menciona Design, 9 não mencionam (números DIFERENTES)', async () => {
      const fonte = fonteDocenteFake('fake-docente-unico-cai');
      const itens = [{ id: 'a1', texto: textoComArea(1) }];
      for (let i = 1; i <= 9; i++) itens.push({ id: `sa${i}`, texto: textoSemArea(i) });

      const stats = await processarItensFonte(fonte, itens);
      assert.strictEqual(stats.coverage.gate.covered, 10); // gate continua 10/10 — a variável isolada aqui é a área
      assert.strictEqual(stats.coverage.editalUnico.covered, 1);
      assert.strictEqual(stats.coverage.editalUnico.total, 10);
      assert.strictEqual(stats.coverage.editalUnico.descartes.length, 9);
    }],

    // ------------------------------------------------ estágio3 subedital-linha
    ['subedital-linha — QUASE TUDO PASSA: edital guarda-chuva com 9 linhas Design + 1 linha Estatística', async () => {
      const fonte = fonteDocenteFake('fake-docente-subedital-passa', { comSubedital: true });
      const texto = textoGuardaChuva(9, 1);
      const itens = [{ id: 'guarda1', texto: textoGatePassa(1), textoEnriquecido: texto }];

      const stats = await processarItensFonte(fonte, itens);
      assert.strictEqual(stats.coverage.subeditalLinha.covered, 9);
      assert.strictEqual(stats.coverage.subeditalLinha.total, 10);
      assert.strictEqual(stats.coverage.subeditalLinha.descartes.length, 1);
      assert.strictEqual(stats.coverage.subeditalLinha.descartes[0].reason, 'subedital_area_incompativel');
      // o id do descarte é o CÓDIGO do subedital, não um contador — a linha
      // que caiu é a 10ª (a única de Estatística, ver textoGuardaChuva).
      assert.strictEqual(stats.coverage.subeditalLinha.descartes[0].id, '004/26.10');
    }],

    ['subedital-linha — QUASE TUDO CAI: edital guarda-chuva com 1 linha Design + 9 linhas Estatística (números DIFERENTES)', async () => {
      const fonte = fonteDocenteFake('fake-docente-subedital-cai', { comSubedital: true });
      const texto = textoGuardaChuva(1, 9);
      const itens = [{ id: 'guarda2', texto: textoGatePassa(1), textoEnriquecido: texto }];

      const stats = await processarItensFonte(fonte, itens);
      assert.strictEqual(stats.coverage.subeditalLinha.covered, 1);
      assert.strictEqual(stats.coverage.subeditalLinha.total, 10);
      assert.strictEqual(stats.coverage.subeditalLinha.descartes.length, 9);
    }],

    // ------------------------------------------------------------ gate mercado
    ['gate mercado — QUASE TUDO PASSA: 9/10 são vaga válida, 1 é Banco de Talentos', async () => {
      const fonte = fonteMercadoFake('fake-mercado-gate-passa');
      const itens = [];
      for (let i = 1; i <= 9; i++) {
        itens.push({
          name: `Designer de Produto Senior ${i}`,
          jobUrl: `https://fake.test/vaga/${i}`,
          careerPageName: 'Empresa Fake',
          type: 'vacancy_type_default',
          country: 'Brasil',
          description: 'Vaga para atuar com UX, UI, design de interação e prototipagem em produtos digitais.'
        });
      }
      itens.push({
        name: 'Banco de Talentos',
        jobUrl: 'https://fake.test/vaga/talentpool',
        careerPageName: 'Empresa Fake',
        type: 'vacancy_type_talent_pool',
        country: 'Brasil'
      });

      const stats = await processarItensFonte(fonte, itens);
      assert.strictEqual(stats.coverage.gate.covered, 9);
      assert.strictEqual(stats.coverage.gate.total, 10);
      assert.strictEqual(stats.coverage.gate.descartes.length, 1);
      assert.strictEqual(stats.coverage.gate.descartes[0].reason, 'gate_vaga_mercado');
      assert.strictEqual(stats.coverage.gate.descartes[0].id, 'https://fake.test/vaga/talentpool');
    }],

    ['gate mercado — QUASE TUDO CAI: 1/10 é vaga válida, 9 são Banco de Talentos (números DIFERENTES)', async () => {
      const fonte = fonteMercadoFake('fake-mercado-gate-cai');
      const itens = [
        {
          name: 'Designer de Produto Senior',
          jobUrl: 'https://fake.test/vaga/unica',
          careerPageName: 'Empresa Fake',
          type: 'vacancy_type_default',
          country: 'Brasil',
          description: 'Vaga para atuar com UX, UI, design de interação e prototipagem em produtos digitais.'
        }
      ];
      for (let i = 1; i <= 9; i++) {
        itens.push({
          name: 'Banco de Talentos',
          jobUrl: `https://fake.test/vaga/talentpool${i}`,
          careerPageName: 'Empresa Fake',
          type: 'vacancy_type_talent_pool',
          country: 'Brasil'
        });
      }

      const stats = await processarItensFonte(fonte, itens);
      assert.strictEqual(stats.coverage.gate.covered, 1);
      assert.strictEqual(stats.coverage.gate.total, 10);
      assert.strictEqual(stats.coverage.gate.descartes.length, 9);
    }],

    // -------------------------------------------------------- aderência mercado
    ['aderência mercado — QUASE TUDO PASSA: 9/10 descrições têm termo de stack/perfil, 1 não tem nenhum', async () => {
      const fonte = fonteMercadoFake('fake-mercado-aderencia-passa');
      const itens = [];
      for (let i = 1; i <= 9; i++) {
        itens.push({
          name: `Designer de Produto Senior ${i}`,
          jobUrl: `https://fake.test/aderencia/${i}`,
          careerPageName: 'Empresa Fake',
          type: 'vacancy_type_default',
          country: 'Brasil',
          description: 'Vaga para atuar com UX, UI, design de interação e prototipagem em produtos digitais.'
        });
      }
      itens.push({
        name: 'Vendedor externo',
        jobUrl: 'https://fake.test/aderencia/sem-termo',
        careerPageName: 'Empresa Fake',
        type: 'vacancy_type_default',
        country: 'Brasil',
        description: 'Vaga para loja de materiais de construção, experiência em atendimento ao cliente.'
      });

      const stats = await processarItensFonte(fonte, itens);
      // todos os 10 passam o gate (nenhum é talent pool, todos têm os 3 campos mínimos)
      assert.strictEqual(stats.coverage.gate.covered, 10);
      assert.strictEqual(stats.coverage.gate.total, 10);
      assert.strictEqual(stats.coverage.aderencia.covered, 9);
      assert.strictEqual(stats.coverage.aderencia.total, 10);
      assert.strictEqual(stats.coverage.aderencia.descartes.length, 1);
      assert.strictEqual(stats.coverage.aderencia.descartes[0].reason, 'sem_termo_aderencia_mercado');
      assert.strictEqual(stats.coverage.aderencia.descartes[0].id, 'https://fake.test/aderencia/sem-termo');
    }],

    ['aderência mercado — QUASE TUDO CAI: 1/10 descrição tem termo de stack/perfil, 9 não têm (números DIFERENTES)', async () => {
      const fonte = fonteMercadoFake('fake-mercado-aderencia-cai');
      const itens = [
        {
          name: 'Designer de Produto Senior',
          jobUrl: 'https://fake.test/aderencia2/unica',
          careerPageName: 'Empresa Fake',
          type: 'vacancy_type_default',
          country: 'Brasil',
          description: 'Vaga para atuar com UX, UI, design de interação e prototipagem em produtos digitais.'
        }
      ];
      for (let i = 1; i <= 9; i++) {
        itens.push({
          name: `Vendedor externo ${i}`,
          jobUrl: `https://fake.test/aderencia2/sem-termo${i}`,
          careerPageName: 'Empresa Fake',
          type: 'vacancy_type_default',
          country: 'Brasil',
          description: 'Vaga para loja de materiais de construção, experiência em atendimento ao cliente.'
        });
      }

      const stats = await processarItensFonte(fonte, itens);
      assert.strictEqual(stats.coverage.aderencia.covered, 1);
      assert.strictEqual(stats.coverage.aderencia.total, 10);
      assert.strictEqual(stats.coverage.aderencia.descartes.length, 9);
    }],

    // -------------------------------------------- estágio nunca tocado nesta rodada
    ['coverage honesto quando um estágio docente nunca é alcançado nesta rodada: fonte sem edital guarda-chuva -> subeditalLinha é 0/0 real (doutrina: "sem nada a cobrir, a resposta é 0/0"), nunca um número inventado', async () => {
      const fonte = fonteDocenteFake('fake-docente-sem-guardachuva'); // comSubedital: false (default) — nenhum item passa pelo ramo guarda-chuva
      const itens = [{ id: 'x1', texto: textoComArea(1) }];
      const stats = await processarItensFonte(fonte, itens);
      assert.deepStrictEqual(stats.coverage.subeditalLinha, { unidade: 'linhas_subedital', covered: 0, total: 0, descartes: [] });
      assert.strictEqual(stats.coverage.editalUnico.covered, 1, 'este item passou pelo caminho de edital único de verdade');
      assert.strictEqual(stats.coverage.editalUnico.total, 1);
    }],

    ['coverage nunca fabrica um estágio de trilha errada: fonte mercado nunca tem subeditalLinha/editalUnico (docente-específicos)', async () => {
      const fonte = fonteMercadoFake('fake-mercado-shape');
      const itens = [
        {
          name: 'Designer Pleno',
          jobUrl: 'https://fake.test/shape/1',
          careerPageName: 'Empresa Fake',
          type: 'vacancy_type_default',
          country: 'Brasil',
          description: 'Vaga de UX/UI para produto digital.'
        }
      ];
      const stats = await processarItensFonte(fonte, itens);
      assert.strictEqual(stats.coverage.subeditalLinha, null);
      assert.strictEqual(stats.coverage.editalUnico, null);
      assert.ok(stats.coverage.aderencia, 'trilha mercado sempre tem estágio de aderência');
    }],

    // ---------------------------------------------------- unidade por estágio (Onda cobertura-2)
    [
      'unidade correta em cada chave de coverage — gate/editalUnico/aderencia são "itens", subeditalLinha é "linhas_subedital" — ' +
        'nunca a mesma unidade em campos que contam grandezas diferentes',
      async () => {
        const fonteDoc = fonteDocenteFake('fake-docente-unidades', { comSubedital: true });
        const itensDoc = [
          { id: 'a1', texto: textoComArea(1) },
          { id: 'guarda1', texto: textoGatePassa(1), textoEnriquecido: textoGuardaChuva(2, 1) }
        ];
        const statsDoc = await processarItensFonte(fonteDoc, itensDoc);
        assert.strictEqual(statsDoc.coverage.gate.unidade, 'itens');
        assert.strictEqual(statsDoc.coverage.editalUnico.unidade, 'itens');
        assert.strictEqual(statsDoc.coverage.subeditalLinha.unidade, 'linhas_subedital');
        // a prova que fecha o ciclo: gate (itens) e subeditalLinha (linhas) não podem ser somados.
        assert.throws(
          () => require('../lib/coverage').somar(statsDoc.coverage.editalUnico, statsDoc.coverage.subeditalLinha),
          /n[aã]o posso somar unidades diferentes/i,
          'editalUnico (itens) + subeditalLinha (linhas_subedital) tinha que estourar — é o mesmo erro da rodada ao vivo'
        );

        const fonteMerc = fonteMercadoFake('fake-mercado-unidades');
        const statsMerc = await processarItensFonte(fonteMerc, [
          {
            name: 'Designer Pleno',
            jobUrl: 'https://fake.test/unidades/1',
            careerPageName: 'Empresa Fake',
            type: 'vacancy_type_default',
            country: 'Brasil',
            description: 'Vaga de UX/UI para produto digital.'
          }
        ]);
        assert.strictEqual(statsMerc.coverage.gate.unidade, 'itens');
        assert.strictEqual(statsMerc.coverage.aderencia.unidade, 'itens');
      }
    ]
  ];

  for (const [name, fn] of tests) {
    if (await runTest(name, fn)) passed++;
    else failed++;
  }

  modoSeco.desativar(); // nunca deixa o flag vazar para o próximo arquivo de teste (mesmo processo `node radar.js testar`)

  console.log(`\n${passed} passou(aram), ${failed} falhou(aram)\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
