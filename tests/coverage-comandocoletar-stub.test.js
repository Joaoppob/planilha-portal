#!/usr/bin/env node
'use strict';

/**
 * PROVA DE QUE O CAMINHO REAL IMPRIME CERTO — não uma simulação escrita à
 * mão. `tests/coverage-pipeline-discrimina.test.js` já prova que os NÚMEROS
 * de `processarItensFonte` discriminam; este arquivo prova que `radar.js
 * comandoColetar` — a função de produção de verdade, chamada por `main()`
 * exatamente como a CLI chama — IMPRIME esses números certo no stdout: sem
 * "null/null", sem "undefined", com as chaves certas presentes/ausentes por
 * trilha (mercado nunca imprime subedital_linha/edital_unico; docente
 * imprime as quatro).
 *
 * Nenhuma reimplementação de `comandoColetar` acontece aqui — `radar.js`
 * ganhou um segundo parâmetro opcional (`fontesOverride`, default
 * `listaFontes`) só para este harness poder injetar uma fonte STUB em
 * memória sem tocar `fontes/index.js` nem fazer requisição de rede (a fonte
 * stub não tem `coletar` de verdade — devolve itens já prontos). `main()`
 * continua chamando `comandoColetar(opts)` com um argumento só; produção não
 * muda.
 *
 * `lib/modo-seco.js` ativo do início ao fim: nenhuma escrita real acontece
 * em `data/store.jsonl` nem `data/saude.jsonl`, nenhum envio real ao
 * Telegram (mesmo se `.env` tiver token/chat_id reais — a cerca por baixo,
 * já provada em tests/dry-run-cerca-seca.test.js, segura independente do que
 * `comandoColetar` passa pra frente).
 *
 * Captura o stdout de verdade sobrescrevendo `console.log` temporariamente
 * (técnica padrão, sem dependência nova) — as linhas capturadas são
 * IMPRESSAS DE VOLTA no fim de cada cenário (com o console.log original já
 * restaurado), então rodar `node tests/coverage-comandocoletar-stub.test.js`
 * mostra o stdout real, colável literal.
 */

const assert = require('assert');
const modoSeco = require('../lib/modo-seco');
const subeditalExtrator = require('../lib/subedital-extrator');
const radar = require('../radar.js');

const { comandoColetar } = radar;

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

/** Roda `comandoColetar` de verdade capturando tudo que ele imprime via
 * console.log/console.error (as duas — `registrarSaudeEAlertar` e o
 * catch de erro de fonte usam console.error). Restaura os originais mesmo
 * se `comandoColetar` lançar. */
async function capturarStdout(fn) {
  const linhas = [];
  const logOriginal = console.log;
  const errorOriginal = console.error;
  console.log = (...args) => linhas.push(args.map(String).join(' '));
  console.error = (...args) => linhas.push('[stderr] ' + args.map(String).join(' '));
  try {
    await fn();
  } finally {
    console.log = logOriginal;
    console.error = errorOriginal;
  }
  return linhas;
}

// ---------------------------------------------------------------- fixtures
// (mesmas funções de tests/coverage-pipeline-discrimina.test.js, já
// conferidas contra as funções reais — repetidas aqui de propósito: cada
// arquivo de teste é self-contained, mesma convenção dos 82 arquivos
// existentes, ex. tests/recall-golden-set.test.js não importa fixtures de
// outro *.test.js.)
function textoGatePassa(n) {
  return `Universidade Federal de Exemplo — Edital nº ${n}/2026 — concurso público para provimento de cargo de ` +
    `Professor Adjunto, na área de Design, Design Digital.`;
}
function textoGateFalha(n) {
  return `Prefeitura Municipal de Exemplo — Processo seletivo simplificado nº ${n}/2026 para contratação de ` +
    `Agente Administrativo, cadastro reserva.`;
}
function textoComArea(n) {
  return `Concurso público para Professor Adjunto na Universidade Federal de Exemplo, edital ${n}/2026, ` +
    `na área de Design, com foco em Design Digital.`;
}
function textoSemArea(n) {
  return `Concurso público para Professor Adjunto na Universidade Federal de Exemplo, edital ${n}/2026. ` +
    `Requisitos gerais de praxe, conforme edital.`;
}
function linhaSubedital(codigo, area) {
  return `${codigo} Professor Adjunto Departamento de Exemplo - DES Sao Paulo 1 ${area} ${area} Doutorado em ${area} DE R$ 100,00`;
}
function textoGuardaChuva(nDesign, nEstatistica) {
  const linhas = [];
  let seq = 1;
  for (let i = 0; i < nDesign; i++) linhas.push(linhaSubedital(`004/26.${String(seq++).padStart(2, '0')}`, 'Design'));
  for (let i = 0; i < nEstatistica; i++) linhas.push(linhaSubedital(`004/26.${String(seq++).padStart(2, '0')}`, 'Estatistica'));
  return linhas.join(' ');
}

/** Fonte STUB docente — `coletar()` NÃO faz rede, devolve os itens já
 * prontos em memória. `dividirSubeditais` reaproveita a função REAL de
 * lib/subedital-extrator.js (mesma que fontes/dou.js re-exporta). 4 itens
 * "brutos" simulando volumeBruto=6 (2 já teriam caído no pré-filtro de tipo
 * dentro de um fonte.coletar() real, ex. artType errado — aqui simulamos
 * isso só com o número, sem reimplementar o filtro). */
function fonteDocenteStub() {
  const rawItens = [
    { id: 'gf1', texto: textoGateFalha(1) }, // gate falha
    { id: 'ca1', texto: textoComArea(1) }, // gate passa, edital único, área bate
    { id: 'sa1', texto: textoSemArea(1) }, // gate passa, edital único, área NÃO bate
    {
      id: 'guarda1',
      texto: textoGatePassa(1),
      textoEnriquecido: textoGuardaChuva(2, 1) // guarda-chuva: 2 linhas Design + 1 Estatistica
    }
  ];
  return {
    id: 'stub-docente',
    nome: 'Stub Docente (offline)',
    trilha: undefined,
    coletar: async () => ({ itens: rawItens, volumeBruto: 6 }), // simula 2 itens já podados pelo pré-filtro de tipo real
    textoParaFiltro: r => r.texto,
    normalizarParcial: r => ({
      fonte: 'stub-docente',
      orgao: 'Universidade Federal de Exemplo',
      campus: null,
      uf: 'SP',
      url: `https://fake.test/stub-docente/${r.id}`,
      data_publicacao: '2026-01-01',
      texto_bruto: r.texto
    }),
    enriquecer: async r => ({
      texto_bruto: r.textoEnriquecido || r.texto,
      regime: null,
      classe: null,
      tipo: null,
      inscricao_inicio: null,
      inscricao_fim: null
    }),
    dividirSubeditais: texto => subeditalExtrator.dividirSubeditais(texto)
  };
}

/** Fonte STUB mercado — espelha o contrato mínimo de fontes/gupy.js. */
function fonteMercadoStub() {
  const rawItens = [
    {
      name: 'Banco de Talentos',
      jobUrl: 'https://fake.test/stub-mercado/talentpool',
      careerPageName: 'Empresa Fake',
      type: 'vacancy_type_talent_pool',
      country: 'Brasil'
    },
    {
      name: 'Designer de Produto Senior',
      jobUrl: 'https://fake.test/stub-mercado/1',
      careerPageName: 'Empresa Fake',
      type: 'vacancy_type_default',
      country: 'Brasil',
      description: 'Vaga para atuar com UX, UI, design de interação e prototipagem em produtos digitais.'
    },
    {
      name: 'Vendedor externo',
      jobUrl: 'https://fake.test/stub-mercado/2',
      careerPageName: 'Empresa Fake',
      type: 'vacancy_type_default',
      country: 'Brasil',
      description: 'Vaga para loja de materiais de construção, experiência em atendimento ao cliente.'
    }
  ];
  return {
    id: 'stub-mercado',
    nome: 'Stub Mercado (offline)',
    trilha: 'mercado',
    coletar: async () => ({ itens: rawItens, volumeBruto: 4 }), // simula 1 item já podado pelo pré-filtro de tipo real
    textoParaFiltro: r => [r.name, r.description].filter(Boolean).join(' \n '),
    normalizarParcial: r => ({
      fonte: 'stub-mercado',
      trilha: 'mercado',
      orgao: r.careerPageName || null,
      campus: null,
      uf: null,
      url: r.jobUrl || null,
      data_publicacao: '2026-01-01',
      inscricao_inicio: '2026-01-01',
      inscricao_fim: null,
      texto_bruto: [r.name, r.description].filter(Boolean).join(' \n '),
      modalidade: null,
      senioridade: null,
      subedital: null,
      classe: null,
      regime: null,
      tipo: null,
      vagas: null
    }),
    enriquecer: async r => ({ texto_bruto: [r.name, r.description].filter(Boolean).join(' \n ') })
  };
}

async function main() {
  console.log('\n=== coverage-comandocoletar-stub.test.js (caminho REAL, stdout de verdade) ===\n');
  let passed = 0;
  let failed = 0;

  modoSeco.ativar();

  let linhasDocente = null;
  let linhasMercado = null;

  const tests = [
    ['comandoColetar REAL (fonte STUB docente) — captura o stdout de verdade', async () => {
      linhasDocente = await capturarStdout(() => comandoColetar({}, [fonteDocenteStub()]));
      const texto = linhasDocente.join('\n');

      // As 4 chaves docente aparecem na linha de estágios da fonte E na
      // linha de cobertura agregada da rodada — E CADA UMA COM A UNIDADE
      // CERTA (Onda cobertura-2: "38 passaram o gate, 40 chegaram ao fim" só
      // aconteceu porque a tela não dizia a unidade — agora diz).
      assert.ok(/estagio1\(gate\) \d+\/\d+ itens/.test(texto), 'esperava "estagio1(gate) N/N itens" no stdout real');
      assert.ok(
        /estagio3\(subedital_linha\) \d+\/\d+ linhas_subedital/.test(texto),
        'esperava "estagio3(subedital_linha) N/N linhas_subedital" no stdout real — a unidade tem que aparecer, não só o rótulo'
      );
      assert.ok(/estagio3\(edital_unico\) \d+\/\d+ itens/.test(texto), 'esperava "estagio3(edital_unico) N/N itens" no stdout real');
      // Trilha docente NUNCA imprime o rótulo de aderência de mercado.
      assert.ok(!texto.includes('aderencia_mercado'), 'fonte docente não deveria imprimir estágio de aderência de mercado');

      // A prova específica que o coordenador pediu: nada de "null/null" nem
      // "undefined" vazando pro stdout em NENHUM lugar do texto capturado.
      assert.ok(!texto.includes('null/null'), 'BUG: "null/null" vazou pro stdout');
      assert.ok(!texto.includes('undefined'), 'BUG: "undefined" vazou pro stdout');
      assert.ok(!texto.includes('NaN'), 'BUG: "NaN" vazou pro stdout');

      // pré-filtro de tipo: volume_bruto=6, candidatos=4 (os 4 rawItens do stub) — com unidade.
      assert.ok(texto.includes('pre-filtro-de-tipo 4/6 itens'), `esperava "pre-filtro-de-tipo 4/6 itens" no stdout, texto:\n${texto}`);
    }],

    ['comandoColetar REAL (fonte STUB mercado) — captura o stdout de verdade', async () => {
      linhasMercado = await capturarStdout(() => comandoColetar({}, [fonteMercadoStub()]));
      const texto = linhasMercado.join('\n');

      assert.ok(/estagio1\(gate\) \d+\/\d+ itens/.test(texto), 'esperava "estagio1(gate) N/N itens" no stdout real');
      assert.ok(
        /estagio2\(aderencia_mercado\) \d+\/\d+ itens/.test(texto),
        'esperava "estagio2(aderencia_mercado) N/N itens" no stdout real'
      );

      // A PERGUNTA DO COORDENADOR: subedital_linha/edital_unico são `null`
      // na trilha mercado — o texto NUNCA pode conter os rótulos desses dois
      // estágios (nem como "null/null", nem como "0/0" fabricado, nem a
      // unidade "linhas_subedital" solta em lugar nenhum — eles simplesmente
      // não pertencem a esta trilha e o `if (c.subeditalLinha)` em
      // comandoColetar os omite inteiros, rótulo E unidade inclusos).
      assert.ok(!texto.includes('subedital_linha'), 'BUG: trilha mercado não deveria imprimir subedital_linha (nem null/null, nem 0/0)');
      assert.ok(!texto.includes('edital_unico'), 'BUG: trilha mercado não deveria imprimir edital_unico (nem null/null, nem 0/0)');
      assert.ok(!texto.includes('linhas_subedital'), 'BUG: a unidade "linhas_subedital" não deveria vazar pro stdout da trilha mercado');
      assert.ok(!texto.includes('null/null'), 'BUG: "null/null" vazou pro stdout');
      assert.ok(!texto.includes('undefined'), 'BUG: "undefined" vazou pro stdout');
      assert.ok(!texto.includes('NaN'), 'BUG: "NaN" vazou pro stdout');

      // pré-filtro de tipo: volume_bruto=4, candidatos=3 (os 3 rawItens do stub) — com unidade.
      assert.ok(texto.includes('pre-filtro-de-tipo 3/4 itens'), `esperava "pre-filtro-de-tipo 3/4 itens" no stdout, texto:\n${texto}`);
    }]
  ];

  for (const [name, fn] of tests) {
    if (await runTest(name, fn)) passed++;
    else failed++;
  }

  modoSeco.desativar();

  console.log(`\n${passed} passou(aram), ${failed} falhou(aram)\n`);

  // Imprime o stdout REAL capturado de cada cenário — cru, sem edição — para
  // colar literal no relatório (é isto que o coordenador pediu para ver).
  if (linhasDocente) {
    console.log('\n' + '='.repeat(78));
    console.log('STDOUT REAL CAPTURADO — comandoColetar([fonteDocenteStub()]) — TRILHA DOCENTE');
    console.log('='.repeat(78));
    console.log(linhasDocente.join('\n'));
  }
  if (linhasMercado) {
    console.log('\n' + '='.repeat(78));
    console.log('STDOUT REAL CAPTURADO — comandoColetar([fonteMercadoStub()]) — TRILHA MERCADO');
    console.log('='.repeat(78));
    console.log(linhasMercado.join('\n'));
  }

  process.exit(failed > 0 ? 1 : 0);
}

main();
