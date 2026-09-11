#!/usr/bin/env node
'use strict';

/**
 * Testa `lib/orgao-canonico.js canonizar()` e a integração do dedupe por
 * chave canônica em `lib/store.js` (Onda dedupe-canonico).
 *
 * PARES REAIS (briefing: "colha mais pares reais cruzando data/store.jsonl
 * com uma coleta seca da PCI; não invente casos de laboratório") — os 5+
 * pares positivos abaixo são os 6 casos genuínos encontrados cruzando os
 * ~750 registros de `data/store.jsonl` (fonte `dou`) com uma coleta seca de
 * `fontes/pci.js coletar()` rodada em 2026-08-27 (todos os concursos com
 * vaga de professor, sem filtro de área): de 168 títulos distintos de
 * concurso na PCI, 6 batem canonicamente com algum órgão já no store do DOU
 * — UFSCar (o caso motivador do briefing), UFSJ, UNIFEI, UNILA, UTFPR,
 * UFRGS. Os pares negativos usam nomes oficiais reais de instituições (do
 * próprio `lib/siglas.js`/`config/universidades-uf.json` e de prefeituras
 * reais vistas na mesma coleta seca da PCI) — nunca strings fabricadas.
 *
 * O par negativo é o que mais importa (ver briefing): falso positivo aqui
 * apagaria uma vaga real em silêncio.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { canonizar } = require('../lib/orgao-canonico');
const store = require('../lib/store');
const { montarRegistro } = require('../lib/schema');
const { gerarId } = require('../lib/hash');

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

function novoStorePathTemp() {
  return path.join(os.tmpdir(), `radar-orgao-canonico-test-${Date.now()}-${Math.random().toString(36).slice(2)}.jsonl`);
}

/** Captura chamadas de console.error durante `fn()`, sem deixar nada vazar pro terminal do runner. */
function capturarConsoleError(fn) {
  const linhas = [];
  const original = console.error;
  console.error = (...args) => linhas.push(args.join(' '));
  try {
    fn();
  } finally {
    console.error = original;
  }
  return linhas;
}

// --- Pares positivos: mesma instituição, grafia diferente por fonte ---
// (DOU real de data/store.jsonl) x (PCI real de coleta seca 2026-08-27)
const PARES_POSITIVOS = [
  // O par obrigatório do briefing — motivador da onda inteira.
  ['Fundação Universidade Federal de São Carlos', 'UFSCar - Universidade Federal de São Carlos', 'ufscar'],
  ['Fundação Universidade Federal de São João Del Rei', 'UFSJ - Universidade Federal de São João del-Rei', 'ufsj'],
  ['Universidade Federal de Itajubá', 'UNIFEI - Universidade Federal de Itajubá', 'unifei'],
  ['Universidade Federal da Integração Latino-Americana', 'UNILA - Universidade Federal da Integração Latino-Americana', 'unila'],
  ['Universidade Tecnológica Federal do Paraná', 'UTFPR - Universidade Tecnológica Federal do Paraná', 'utfpr'],
  ['Universidade Federal do Rio Grande do Sul', 'UFRGS - Universidade Federal do Rio Grande do Sul', 'ufrgs']
];

// --- Pares negativos: instituições REAIS e DISTINTAS que não podem colidir.
// O par que mais importa (briefing): falso positivo aqui apaga vaga real em
// silêncio — é falha pior que a duplicata que a onda conserta.
const PARES_NEGATIVOS = [
  // UFSCar x UFSP — obrigatório do briefing (nomes quase-vizinhos, "São
  // Carlos" vs "São Paulo").
  ['Universidade Federal de São Carlos', 'Universidade Federal de São Paulo'],
  // IFSP x IFSC — obrigatório do briefing (dois institutos federais,
  // siglas de 2 letras de diferença).
  [
    'Instituto Federal de Educação, Ciência e Tecnologia de São Paulo',
    'Instituto Federal de Educação, Ciência e Tecnologia de Santa Catarina'
  ],
  // Duas prefeituras de nome parecido — obrigatório do briefing. Nomes
  // reais vistos na mesma coleta seca da PCI (2026-08-27).
  ['Prefeitura de Estrela', 'Prefeitura de Piratuba'],
  ['Prefeitura de Anhembi', 'Prefeitura de Aracati'],
  // Prefixo quase idêntico ("Universidade Federal de Al...") resolvendo
  // pra siglas totalmente diferentes (UNIFAL-MG x UFAL) — prova que o
  // fallback tipográfico não abrevia por regra de string.
  ['Universidade Federal de Alfenas', 'Universidade Federal de Alagoas']
];

function main() {
  console.log('\n=== orgao-canonico.test.js ===\n');
  let passed = 0;
  let failed = 0;

  const tests = [];

  // --- Pares positivos ---
  for (const [a, b, esperado] of PARES_POSITIVOS) {
    tests.push([
      `canonizar() casa par positivo real: "${a}" == "${b}" (-> "${esperado}")`,
      () => {
        const ca = canonizar(a);
        const cb = canonizar(b);
        assert.strictEqual(ca, esperado, `canonizar("${a}") deveria ser "${esperado}", veio "${ca}"`);
        assert.strictEqual(cb, esperado, `canonizar("${b}") deveria ser "${esperado}", veio "${cb}"`);
        assert.strictEqual(ca, cb);
      }
    ]);
  }

  // --- Pares negativos (o que mais importa) ---
  for (const [a, b] of PARES_NEGATIVOS) {
    tests.push([
      `canonizar() NUNCA casa par negativo real: "${a}" != "${b}"`,
      () => {
        const ca = canonizar(a);
        const cb = canonizar(b);
        assert.notStrictEqual(
          ca,
          cb,
          `FALSO POSITIVO: "${a}" e "${b}" canonizaram pra "${ca}" — isso apagaria uma vaga real em silêncio`
        );
      }
    ]);
  }

  // --- Idempotência ---
  tests.push([
    'canonizar() é idempotente: canonizar(canonizar(x)) === canonizar(x)',
    () => {
      const amostras = [
        ...PARES_POSITIVOS.flatMap(([a, b]) => [a, b]),
        ...PARES_NEGATIVOS.flatMap(([a, b]) => [a, b]),
        '', '   ', null, undefined, 'Instituição Fora Da Tabela Curada Qualquer'
      ];
      for (const x of amostras) {
        const c1 = canonizar(x);
        const c2 = canonizar(c1);
        assert.strictEqual(c2, c1, `não-idempotente para "${x}": canonizar(x)="${c1}", canonizar(canonizar(x))="${c2}"`);
      }
    }
  ]);

  tests.push([
    'canonizar() nunca lança em entrada vazia/nula — vira string vazia',
    () => {
      assert.strictEqual(canonizar(null), '');
      assert.strictEqual(canonizar(undefined), '');
      assert.strictEqual(canonizar(''), '');
      assert.strictEqual(canonizar('   '), '');
    }
  ]);

  // --- Dedupe ponta a ponta (store.salvar), com fixture, SEM REDE ---

  tests.push([
    'dedupe ponta a ponta: DOU e PCI descrevendo o MESMO edital (grafias diferentes de orgao, url diferente, E data_publicacao DIFERENTE — o achado real: DOU=data do edital, PCI=início da inscrição) — só o primeiro sobrevive, casando por inscricao_inicio',
    () => {
      const p = novoStorePathTemp();
      const dadosDou = {
        fonte: 'dou',
        orgao: 'Fundação Universidade Federal de São Carlos',
        area: 'Design',
        data_publicacao: '2026-08-12', // DOU: data de PUBLICAÇÃO DO EDITAL — semântica real, caso UFSCar.
        inscricao_inicio: '2026-08-21', // mesmo edital, mesmo início de inscrição da PCI abaixo — é ISSO que casa agora.
        url: 'https://www.in.gov.br/web/dou/-/edital-ufscar-4-2026'
      };
      const dadosPci = {
        fonte: 'pci',
        orgao: 'UFSCar - Universidade Federal de São Carlos',
        area: 'Design',
        data_publicacao: '2026-08-21', // PCI: data de INÍCIO DA INSCRIÇÃO (datas.inicio) — NUNCA bate com a data_publicacao do DOU pro mesmo edital; por isso a chave não usa mais este campo.
        inscricao_inicio: '2026-08-21',
        url: 'https://www.pciconcursos.com.br/noticia/ufscar-professor-design'
      };
      const registroDou = montarRegistro({ ...dadosDou, id: gerarId(dadosDou) });
      const registroPci = montarRegistro({ ...dadosPci, id: gerarId(dadosPci) });

      assert.notStrictEqual(
        dadosDou.data_publicacao,
        dadosPci.data_publicacao,
        'pré-condição do teste: data_publicacao TEM que divergir entre as fontes — é exatamente o bug que motivou o conserto'
      );

      assert.notStrictEqual(registroDou.id, registroPci.id, 'pré-condição do teste: ids têm que ser diferentes (urls diferentes)');

      const resultado1 = store.salvar(registroDou, p);
      assert.strictEqual(resultado1.novo, true);

      let resultado2;
      const logs = capturarConsoleError(() => {
        resultado2 = store.salvar(registroPci, p);
      });

      assert.strictEqual(resultado2.novo, false, 'o registro da PCI (recém-chegado) deveria ser descartado como duplicata');
      assert.strictEqual(resultado2.motivo, 'chave_canonica');
      assert.strictEqual(resultado2.registro.id, registroDou.id, 'o registro MANTIDO tem que ser o que já estava no store (DOU, chegou primeiro)');
      assert.strictEqual(store.carregarTudo(p).length, 1, 'só um registro sobrevive no store');

      // "registre no log qual fonte foi descartada, contra qual registro, e
      // por qual chave" — nunca em silêncio.
      assert.strictEqual(logs.length, 1, 'a colisão tem que gerar exatamente uma linha de log');
      const linha = logs[0];
      assert.match(linha, /fonte=pci/, 'o log tem que dizer qual FONTE foi descartada');
      assert.match(linha, new RegExp(registroPci.id), 'o log tem que citar o id do registro descartado');
      assert.match(linha, new RegExp(registroDou.id), 'o log tem que citar o id do registro mantido');
      assert.match(linha, /ufscar\|Design\|2026-08-21/, 'o log tem que citar a chave canônica que bateu — pela inscricao_inicio, não pela data_publicacao (que diverge)');

      fs.unlinkSync(p);
    }
  ]);

  tests.push([
    'dedupe ponta a ponta: instituições DIFERENTES (par negativo) nunca colidem, mesmo com area/data iguais',
    () => {
      const p = novoStorePathTemp();
      const dadosA = { fonte: 'dou', orgao: 'Universidade Federal de São Carlos', area: 'Design', inscricao_inicio: '2026-08-21', url: 'https://exemplo.org/a' };
      const dadosB = { fonte: 'pci', orgao: 'Universidade Federal de São Paulo', area: 'Design', inscricao_inicio: '2026-08-21', url: 'https://exemplo.org/b' };
      const registroA = montarRegistro({ ...dadosA, id: gerarId(dadosA) });
      const registroB = montarRegistro({ ...dadosB, id: gerarId(dadosB) });

      store.salvar(registroA, p);
      const resultado = store.salvar(registroB, p);

      assert.strictEqual(resultado.novo, true, 'UFSCar e UFSP são instituições diferentes — o segundo registro TEM que ser salvo');
      assert.strictEqual(store.carregarTudo(p).length, 2);
      fs.unlinkSync(p);
    }
  ]);

  tests.push([
    'dedupe canônico NÃO se aplica dentro da MESMA fonte (dois subeditais reais e distintos não se apagam)',
    () => {
      // Regressão do achado real ao implementar: PCI "PROFESSOR - DESIGN E
      // MÍDIAS DIGITAIS" e "PROFESSOR - DESIGN/DESENHO INDUSTRIAL" do MESMO
      // concurso UFSCar resolvem pra MESMA área canônica "Design", mesmo
      // órgão, mesma data — mas são DUAS vagas reais e distintas
      // (diferenciadas só pelo campo `subedital`, que a chave canônica não
      // usa de propósito). Se o dedupe canônico rodasse intra-fonte, uma
      // apagaria a outra em silêncio.
      const p = novoStorePathTemp();
      const dadosCargo1 = {
        fonte: 'pci',
        orgao: 'UFSCar - Universidade Federal de São Carlos',
        area: 'Design',
        inscricao_inicio: '2026-08-21',
        url: 'https://www.pciconcursos.com.br/noticia/ufscar-professor-design',
        subedital: 'PROFESSOR - DESIGN E MÍDIAS DIGITAIS'
      };
      const dadosCargo2 = {
        fonte: 'pci',
        orgao: 'UFSCar - Universidade Federal de São Carlos',
        area: 'Design',
        inscricao_inicio: '2026-08-21',
        url: 'https://www.pciconcursos.com.br/noticia/ufscar-professor-design',
        subedital: 'PROFESSOR - DESIGN/DESENHO INDUSTRIAL'
      };
      const registro1 = montarRegistro({ ...dadosCargo1, id: gerarId(dadosCargo1) });
      const registro2 = montarRegistro({ ...dadosCargo2, id: gerarId(dadosCargo2) });

      store.salvar(registro1, p);
      const resultado = store.salvar(registro2, p);

      assert.strictEqual(resultado.novo, true, 'dois subeditais reais e distintos da MESMA fonte não podem colidir por chave canônica');
      assert.strictEqual(store.carregarTudo(p).length, 2);
      fs.unlinkSync(p);
    }
  ]);

  tests.push([
    'store.salvar() por `id` exato continua funcionando igual (regra antiga preservada)',
    () => {
      const p = novoStorePathTemp();
      const dados = { fonte: 'dou', orgao: 'Universidade Federal de Alfenas', area: 'Design', data_publicacao: '2026-08-12', url: 'https://exemplo.org/x' };
      const registro = montarRegistro({ ...dados, id: gerarId(dados) });
      store.salvar(registro, p);
      const resultado = store.salvar(registro, p);
      assert.strictEqual(resultado.novo, false);
      assert.strictEqual(resultado.motivo, 'id');
      assert.strictEqual(store.carregarTudo(p).length, 1);
      fs.unlinkSync(p);
    }
  ]);

  tests.push([
    'store.chaveCanonicaDedupe() é null quando falta orgao, area ou inscricao_inicio (nunca colide incompletos por coincidência) — e IGNORA data_publicacao',
    () => {
      assert.strictEqual(store.chaveCanonicaDedupe({ orgao: 'X', area: 'Design', inscricao_inicio: null }), null);
      assert.strictEqual(store.chaveCanonicaDedupe({ orgao: 'X', area: null, inscricao_inicio: '2026-08-12' }), null);
      assert.strictEqual(store.chaveCanonicaDedupe({ orgao: '', area: 'Design', inscricao_inicio: '2026-08-12' }), null);
      assert.strictEqual(
        store.chaveCanonicaDedupe({ orgao: 'Universidade Federal de Alfenas', area: 'Design', inscricao_inicio: '2026-08-12' }),
        'unifal mg|Design|2026-08-12'
      );
      // regra de segurança inegociável: data_publicacao presente e batendo NÃO
      // basta — sem inscricao_inicio, a chave é null (nunca dedupe por fallback).
      assert.strictEqual(
        store.chaveCanonicaDedupe({ orgao: 'Universidade Federal de Alfenas', area: 'Design', data_publicacao: '2026-08-12' }),
        null,
        'data_publicacao sozinho NUNCA deve alimentar a chave — é o próprio bug que este conserto corrige'
      );
    }
  ]);

  for (const [name, fn] of tests) {
    if (runTest(name, fn)) passed++;
    else failed++;
  }

  console.log(`\n${passed} passou(aram), ${failed} falhou(aram)\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
