#!/usr/bin/env node
'use strict';

/**
 * PROVA DE PONTA A PONTA — as duas armadilhas do incidente
 * (RELATORIO-ONDA-12-13.md §Nota de segurança), agora testadas na CLI real
 * (`node radar.js ...`), não só na camada de escrita
 * (ver tests/dry-run-cerca-seca.test.js para essa outra metade da prova).
 *
 *   1. `coletar --help`/`-h` NUNCA pode cair no comando real (era o bug:
 *      caiu, coletou da rede, escreveu 3 registros em produção).
 *   2. flag desconhecida (typo tipo `--dry-runn`) sai com código != 0 e não
 *      roda o comando de jeito nenhum — nunca "modo perigoso por engano".
 *   3. `reprocessar --dry-run` de ponta a ponta: mede/imprime o patch mas
 *      não grava — rodado dentro de uma CÓPIA efêmera de todo
 *      `Academico/radar/` em `os.tmpdir()` (nunca o store real; ver
 *      `copiarRadarSemDados` abaixo), com um único registro FABRICADO cujo
 *      `score` é propositalmente implausível (12345) para garantir que
 *      `reprocessar` gere pelo menos um patch — é o "antes" que prova que o
 *      teste pegaria a regressão, não só que ele não quebra nada.
 *
 * Os testes 1 e 2 rodam contra o repositório real (nunca escrevem —
 * `--help`/flag inválida saem ANTES de qualquer dispatch, ver radar.js
 * `main()`), mas o arquivo AINDA ASSIM hasheia `data/store.jsonl` e
 * `data/saude.jsonl` reais antes/depois de cada chamada, como cinto de
 * segurança adicional.
 */

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const RADAR_DIR = path.resolve(__dirname, '..');
const RADAR_JS = path.join(RADAR_DIR, 'radar.js');
const STORE_REAL = path.join(RADAR_DIR, 'data', 'store.jsonl');
const SAUDE_REAL = path.join(RADAR_DIR, 'data', 'saude.jsonl');

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    return true;
  } catch (error) {
    console.log(`  ✗ ${name}`);
    console.error(`    ${error.stack || error.message}`);
    return false;
  }
}

function hashArquivo(p) {
  if (!fs.existsSync(p)) return null;
  return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
}

function rodarCli(args, cwd = RADAR_DIR) {
  return spawnSync(process.execPath, [RADAR_JS, ...args], { cwd, encoding: 'utf8', timeout: 15000 });
}

/**
 * Cópia efêmera de todo `Academico/radar/` para `os.tmpdir()`, SEM
 * `data/` (fica com um `data/` novo, vazio, que o próprio teste semeia),
 * SEM `tmp/`/`logs/` (grandes, irrelevantes) e SEM `.env` (tem credencial
 * real — este teste nunca faz rede, não precisa dela, e não faz sentido
 * duplicar segredo em disco temporário à toa). `radar.js` resolve seus
 * próprios caminhos via `__dirname`, então uma cópia completa do código se
 * comporta como o programa real, apontando só para os dados fabricados
 * abaixo.
 */
function copiarRadarSemDados(destino) {
  const excluidos = new Set(['data', 'tmp', 'logs', '.env']);
  fs.cpSync(RADAR_DIR, destino, {
    recursive: true,
    filter: src => {
      const rel = path.relative(RADAR_DIR, src);
      if (rel === '') return true;
      const primeiroSegmento = rel.split(path.sep)[0];
      return !excluidos.has(primeiroSegmento);
    }
  });
  fs.mkdirSync(path.join(destino, 'data'), { recursive: true });
}

/** Registro FABRICADO com `score` implausível — garante que
 * `lib/reprocessar.js reprocessarRegistro` produza um patch de verdade
 * (`patch.score`), então "nada mudou" só pode significar "o dry-run
 * segurou", nunca "não havia nada para mudar". `subedital` preenchido e
 * `extracao: null` já presentes evitam os outros dois ramos de patch
 * (ambiguidade de formato / UF) — o teste fica focado num único sinal. */
function fixtureRegistro() {
  return {
    id: 'fixture-reprocessar-1',
    fonte: 'dou',
    trilha: 'docente',
    orgao: 'Universidade Federal de Teste',
    campus: null,
    uf: 'SP',
    area: 'Design',
    subarea: 'Design Digital',
    subedital: '001/26.01',
    vagas: 1,
    titulacao_exigida: 'doutorado',
    regime: 'Dedicação Exclusiva',
    classe: 'Professor Adjunto',
    tipo: 'efetivo',
    modalidade: null,
    senioridade: null,
    stack: [],
    tipo_contrato: null,
    faixa_salarial: null,
    inscricao_inicio: '2026-01-01',
    inscricao_fim: '2026-12-31',
    data_publicacao: '2026-01-01',
    url: 'https://example.test/fixture-reprocessar-1',
    texto_bruto: 'Edital fictício de teste, sem conteúdo real — usado só para exercitar reprocessar --dry-run.',
    coletado_em: '2026-01-01T00:00:00.000Z',
    extracao: null,
    keywords_matched: [],
    score: 12345, // implausível de propósito — garante `patch.score` em reprocessarRegistro
    veredito: 'fora',
    area_compativel: null,
    julgamento: null,
    julgado_em: null,
    notificado: false,
    notificado_em: null,
    campos_llm: []
  };
}

function main() {
  console.log('\n=== radar-cli-flags-help-dry-run.test.js ===\n');
  let passed = 0;
  let failed = 0;

  const hashStoreAntesDeTudo = hashArquivo(STORE_REAL);
  const hashSaudeAntesDeTudo = hashArquivo(SAUDE_REAL);

  const tests = [
    ['`coletar --help` sai 0, imprime o uso do comando, NUNCA despacha para o comando real', () => {
      const r = rodarCli(['coletar', '--help']);
      assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
      assert.match(r.stdout, /Uso: node radar\.js coletar/);
      assert.doesNotMatch(r.stdout, /\[coletar\] fonte=/, 'NUNCA pode ter despachado para o coletar real — é exatamente o bug do incidente');
    }],

    ['`coletar -h` (dash simples) tem o MESMO efeito de `--help` — era o modo de falha original', () => {
      const r = rodarCli(['coletar', '-h']);
      assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
      assert.match(r.stdout, /Uso: node radar\.js coletar/);
      assert.doesNotMatch(r.stdout, /\[coletar\] fonte=/);
    }],

    ['`--help` sem comando imprime o uso geral e sai 0', () => {
      const r = rodarCli(['--help']);
      assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
      assert.match(r.stdout, /Uso: node radar\.js <comando>/);
    }],

    ['comando ausente imprime o uso geral e sai 1 (comportamento preexistente preservado)', () => {
      const r = rodarCli([]);
      assert.strictEqual(r.status, 1);
      assert.match(r.stdout, /Uso: node radar\.js <comando>/);
    }],

    ['flag desconhecida (`--dry-runn`, typo de `--dry-run`) recusa com código != 0, NUNCA despacha', () => {
      const r = rodarCli(['coletar', '--dry-runn']);
      assert.notStrictEqual(r.status, 0, 'typo de flag perigosa não pode sair OK');
      assert.match(r.stderr, /flag\(s\) desconhecida\(s\)/);
      assert.match(r.stderr, /--dry-runn/);
      assert.doesNotMatch(r.stdout, /\[coletar\] fonte=/, 'NUNCA pode ter despachado — nem coletado nem escrito nada');
    }],

    ['comando desconhecido sai 1 com o uso geral (não confundido com flag inválida)', () => {
      const r = rodarCli(['foobar-inexistente']);
      assert.strictEqual(r.status, 1);
      assert.match(r.stderr, /comando desconhecido/);
    }],

    ['flag desconhecida num comando com várias flags válidas (`ativar-notificacoes`) também recusa', () => {
      const r = rodarCli(['ativar-notificacoes', '--fonte', 'dou', '--naoexiste']);
      assert.notStrictEqual(r.status, 0);
      assert.match(r.stderr, /flag\(s\) desconhecida\(s\)/);
      assert.match(r.stderr, /--naoexiste/);
    }],

    ['cinto de segurança: nada do acima tocou data/store.jsonl nem data/saude.jsonl reais', () => {
      assert.strictEqual(hashArquivo(STORE_REAL), hashStoreAntesDeTudo, 'store.jsonl real mudou — NÃO deveria, todos os casos acima saem antes do dispatch');
      assert.strictEqual(hashArquivo(SAUDE_REAL), hashSaudeAntesDeTudo, 'saude.jsonl real mudou — mesmo cinto de segurança');
    }],

    // -------------------------------------------------- reprocessar --dry-run E2E
    ['E2E `reprocessar --dry-run` (cópia efêmera): mede o patch, NÃO grava — arquivo fica byte-idêntico', () => {
      const destino = path.join(os.tmpdir(), `radar-e2e-reprocessar-dry-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      copiarRadarSemDados(destino);
      const storeTmp = path.join(destino, 'data', 'store.jsonl');
      fs.writeFileSync(storeTmp, JSON.stringify(fixtureRegistro()) + '\n', 'utf8');
      const antes = fs.readFileSync(storeTmp, 'utf8');

      const r = spawnSync(process.execPath, [path.join(destino, 'radar.js'), 'reprocessar', '--dry-run'], {
        cwd: destino,
        encoding: 'utf8',
        timeout: 15000
      });
      assert.strictEqual(r.status, 0, `stderr: ${r.stderr}\nstdout: ${r.stdout}`);
      assert.match(r.stdout, /--dry-run: modo seco ativo/, 'CLI deveria anunciar modo seco ativo (radar.js main())');
      assert.match(r.stdout, /\[reprocessar\] --dry-run:.*SERIAM aplicados/, 'reprocessar deveria anunciar que os patches SERIAM aplicados, não foram');
      assert.match(r.stdout, /registros alterados: 1/, 'o cálculo do patch (medição) precisa ter acontecido — 1 registro teria mudado');

      const depois = fs.readFileSync(storeTmp, 'utf8');
      assert.strictEqual(depois, antes, 'MODO SECO: data/store.jsonl da cópia não pode ter mudado UM BYTE');

      fs.rmSync(destino, { recursive: true, force: true });
    }],

    ['CONTRASTE: `reprocessar` SEM --dry-run (mesma cópia/fixture) GRAVA o patch — prova que o teste acima não está mudo', () => {
      const destino = path.join(os.tmpdir(), `radar-e2e-reprocessar-real-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      copiarRadarSemDados(destino);
      const storeTmp = path.join(destino, 'data', 'store.jsonl');
      fs.writeFileSync(storeTmp, JSON.stringify(fixtureRegistro()) + '\n', 'utf8');
      const antes = fs.readFileSync(storeTmp, 'utf8');

      const r = spawnSync(process.execPath, [path.join(destino, 'radar.js'), 'reprocessar'], {
        cwd: destino,
        encoding: 'utf8',
        timeout: 15000
      });
      assert.strictEqual(r.status, 0, `stderr: ${r.stderr}\nstdout: ${r.stdout}`);
      assert.match(r.stdout, /registros alterados: 1/);

      const depois = fs.readFileSync(storeTmp, 'utf8');
      assert.notStrictEqual(depois, antes, 'reprocessar SEM --dry-run deveria ter alterado o arquivo — se não alterou, a fixture não prova nada');
      const relido = JSON.parse(depois.trim());
      assert.notStrictEqual(relido.score, 12345, 'o score implausível da fixture deveria ter sido recalculado');

      fs.rmSync(destino, { recursive: true, force: true });
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
