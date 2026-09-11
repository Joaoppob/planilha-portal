#!/usr/bin/env node
'use strict';

/**
 * PROVA DE PONTA A PONTA — `noticias.js` ganha o MESMO desenho de `radar.js`
 * (RELATORIO-CERCA-SECA.md, briefing "Fechar o buraco de segurança"): até
 * esta rodada, `node noticias.js coletar --help` caía no comando real —
 * exatamente a classe de falha do incidente original de `radar.js`, só que
 * contra `data/noticias.jsonl` e uma coleta de ~13 minutos batendo em 25+
 * fontes. Irmão de tests/radar-cli-flags-help-dry-run.test.js, mesma
 * estrutura, adaptado aos comandos/flags de `noticias.js`.
 *
 * Ver tests/noticias-dry-run-modo-seco.test.js para a prova de que
 * `--dry-run` ativa `lib/modo-seco.js` de verdade (não só o texto no
 * console) — esse é o teste "camada de escrita", este aqui é o teste "CLI
 * de ponta a ponta".
 *
 * Todos os casos abaixo rodam contra o repositório real, mas `--help`/flag
 * inválida saem ANTES de qualquer dispatch (ver noticias.js `main()`), e o
 * arquivo AINDA ASSIM hasheia `data/noticias.jsonl` real antes/depois, como
 * cinto de segurança adicional — o incidente original já custou 3 registros
 * em `data/store.jsonl`, a mesma classe de erro não pode se repetir aqui.
 *
 * O caso `recalcular --gravar --dry-run` roda numa CÓPIA efêmera de todo
 * `Academico/radar/` em `os.tmpdir()` (nunca o store real), com um único
 * registro FABRICADO cujo `score` é implausível (99999) — garante que
 * `recalcular` de fato recalcularia um score diferente, então "nada mudou"
 * só pode significar "o dry-run segurou", nunca "não havia o que mudar".
 */

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const RADAR_DIR = path.resolve(__dirname, '..');
const NOTICIAS_JS = path.join(RADAR_DIR, 'noticias.js');
const NOTICIAS_REAL = path.join(RADAR_DIR, 'data', 'noticias.jsonl');

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
  return spawnSync(process.execPath, [NOTICIAS_JS, ...args], { cwd, encoding: 'utf8', timeout: 15000 });
}

/** Mesma técnica de tests/radar-cli-flags-help-dry-run.test.js
 * `copiarRadarSemDados` — cópia efêmera de `Academico/radar/` inteiro, SEM
 * `data/`/`tmp/`/`logs/`/`.env`, com um `data/` novo e vazio que o teste
 * semeia. `noticias.js` resolve seus caminhos via `__dirname` (inclusive
 * `lib-noticias/store-noticias.js STORE_PATH`), então a cópia se comporta
 * como o programa real apontando só para os dados fabricados abaixo. */
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

/** Registro FABRICADO com `score` implausível (99999) — garante que
 * `comandoRecalcular` produza um score DIFERENTE ao recalcular de verdade,
 * então "nada mudou" só pode significar "o --dry-run segurou". Campos
 * mínimos exigidos pelo caminho `carregarTudo -> map -> clusterizar ->
 * calcularScores -> salvarLote` de `noticias.js comandoRecalcular`. */
function fixtureRegistro() {
  const agora = new Date().toISOString();
  return {
    id: 'fixture-recalcular-1',
    titulo: 'Teste de fixture para recalcular --dry-run, nunca notícia real',
    veiculo: 'Fixture',
    link: 'https://example.test/fixture-recalcular-1',
    data: agora,
    aba: 'geral',
    tabela: 'brasil',
    cluster_id: null,
    n_veiculos: 1,
    score: 99999, // implausível de propósito — garante que o recálculo mude o valor
    fonte: 'fixture',
    dominio: 'example.test',
    idioma: 'pt',
    data_ms: Date.now(),
    data_bruta: null,
    dia_lote: null,
    lote: null,
    lote_tamanho: null,
    sinal_bruto: null,
    percentil: null,
    repercussao: null,
    perfil_bump: null,
    perfil_matches: [],
    n_itens_cluster: null,
    ancoras: [],
    ancoras_regime: null,
    pontos: null,
    comentarios: null,
    autor: null,
    visto_primeiro_em: agora,
    atualizado_em: agora
  };
}

function main() {
  console.log('\n=== noticias-cli-flags-help-dry-run.test.js ===\n');
  let passed = 0;
  let failed = 0;

  const hashNoticiasAntesDeTudo = hashArquivo(NOTICIAS_REAL);

  const tests = [
    ['`coletar --help` sai 0, imprime o uso do comando, NUNCA despacha para o comando real', () => {
      const r = rodarCli(['coletar', '--help']);
      assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
      assert.match(r.stdout, /Uso: node noticias\.js coletar/);
      assert.doesNotMatch(
        r.stdout,
        /=== radar de noticias — coleta ===/,
        'NUNCA pode ter despachado para o coletar real — é exatamente a classe do incidente de radar.js'
      );
      assert.doesNotMatch(r.stdout, /^fontes: /m, 'nem sequer deveria ter chegado a listar as fontes');
    }],

    ['`coletar -h` (dash simples) tem o MESMO efeito de `--help`', () => {
      const r = rodarCli(['coletar', '-h']);
      assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
      assert.match(r.stdout, /Uso: node noticias\.js coletar/);
      assert.doesNotMatch(r.stdout, /=== radar de noticias — coleta ===/);
    }],

    ['`--help` sem comando imprime o uso geral e sai 0', () => {
      const r = rodarCli(['--help']);
      assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
      assert.match(r.stdout, /Uso: node noticias\.js <comando>/);
    }],

    ['`-h` sem comando tem o mesmo efeito de `--help`', () => {
      const r = rodarCli(['-h']);
      assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
      assert.match(r.stdout, /Uso: node noticias\.js <comando>/);
    }],

    ['comando ausente imprime o uso geral e sai 1 (comportamento preexistente preservado)', () => {
      const r = rodarCli([]);
      assert.strictEqual(r.status, 1);
      assert.match(r.stdout, /Uso: node noticias\.js <comando>/);
    }],

    ['flag desconhecida (`--dry-runn`, typo de `--dry-run`) recusa com código != 0, NUNCA despacha', () => {
      const r = rodarCli(['coletar', '--dry-runn']);
      assert.notStrictEqual(r.status, 0, 'typo de flag perigosa não pode sair OK');
      assert.match(r.stderr, /flag\(s\) desconhecida\(s\)/);
      assert.match(r.stderr, /--dry-runn/);
      assert.doesNotMatch(
        r.stdout,
        /=== radar de noticias — coleta ===/,
        'NUNCA pode ter despachado — nem coletado nem escrito nada'
      );
    }],

    ['comando desconhecido sai 1 com o uso geral (não confundido com flag inválida)', () => {
      const r = rodarCli(['foobar-inexistente']);
      assert.strictEqual(r.status, 1);
      assert.match(r.stderr, /comando desconhecido/);
    }],

    ['flag desconhecida em `sincronizar-sheets` (única flag válida é --dry-run) também recusa', () => {
      const r = rodarCli(['sincronizar-sheets', '--naoexiste']);
      assert.notStrictEqual(r.status, 0);
      assert.match(r.stderr, /flag\(s\) desconhecida\(s\)/);
      assert.match(r.stderr, /--naoexiste/);
    }],

    ['`recorte` aceita o argumento posicional (`_`) sem ser recusado como flag desconhecida', () => {
      const r = rodarCli(['recorte', 'semana', '--limite', '1']);
      assert.strictEqual(r.status, 0, `stderr: ${r.stderr}`);
      assert.match(r.stdout, /=== recorte semana/);
    }],

    ['`recorte` com flag REALMENTE desconhecida ainda recusa (o `_` não vira uma porta aberta pra qualquer coisa)', () => {
      const r = rodarCli(['recorte', 'semana', '--naoexiste']);
      assert.notStrictEqual(r.status, 0);
      assert.match(r.stderr, /flag\(s\) desconhecida\(s\)/);
      assert.match(r.stderr, /--naoexiste/);
    }],

    ['cinto de segurança: nada do acima tocou data/noticias.jsonl real', () => {
      assert.strictEqual(
        hashArquivo(NOTICIAS_REAL),
        hashNoticiasAntesDeTudo,
        'noticias.jsonl real mudou — NÃO deveria, todos os casos acima saem antes do dispatch ou são leitura pura'
      );
    }],

    // -------------------------------------------------- recalcular --dry-run E2E
    ['E2E `recalcular --gravar --dry-run` (cópia efêmera): mede/recalcula mas NÃO grava — arquivo fica byte-idêntico', () => {
      const destino = path.join(os.tmpdir(), `noticias-e2e-recalcular-dry-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      copiarRadarSemDados(destino);
      const storeTmp = path.join(destino, 'data', 'noticias.jsonl');
      fs.writeFileSync(storeTmp, JSON.stringify(fixtureRegistro()) + '\n', 'utf8');
      const antes = fs.readFileSync(storeTmp, 'utf8');

      const r = spawnSync(
        process.execPath,
        [path.join(destino, 'noticias.js'), 'recalcular', '--gravar', '--dry-run'],
        { cwd: destino, encoding: 'utf8', timeout: 15000 }
      );
      assert.strictEqual(r.status, 0, `stderr: ${r.stderr}\nstdout: ${r.stdout}`);
      assert.match(r.stdout, /--dry-run: modo seco ativo/, 'CLI deveria anunciar modo seco ativo (noticias.js main())');
      assert.match(
        r.stdout,
        /\[dry-run\] --gravar ignorado: nada gravado/,
        'comandoRecalcular deveria anunciar que --gravar foi ignorado por causa do --dry-run'
      );

      const depois = fs.readFileSync(storeTmp, 'utf8');
      assert.strictEqual(depois, antes, 'MODO SECO: data/noticias.jsonl da cópia não pode ter mudado UM BYTE');

      fs.rmSync(destino, { recursive: true, force: true });
    }],

    ['CONTRASTE: `recalcular --gravar` SEM --dry-run (mesma cópia/fixture) GRAVA o recálculo — prova que o teste acima não está mudo', () => {
      const destino = path.join(os.tmpdir(), `noticias-e2e-recalcular-real-${Date.now()}-${Math.random().toString(36).slice(2)}`);
      copiarRadarSemDados(destino);
      const storeTmp = path.join(destino, 'data', 'noticias.jsonl');
      fs.writeFileSync(storeTmp, JSON.stringify(fixtureRegistro()) + '\n', 'utf8');
      const antes = fs.readFileSync(storeTmp, 'utf8');

      const r = spawnSync(
        process.execPath,
        [path.join(destino, 'noticias.js'), 'recalcular', '--gravar'],
        { cwd: destino, encoding: 'utf8', timeout: 15000 }
      );
      assert.strictEqual(r.status, 0, `stderr: ${r.stderr}\nstdout: ${r.stdout}`);
      assert.match(r.stdout, /gravado: 1 atualizados, 0 novos/);

      const depois = fs.readFileSync(storeTmp, 'utf8');
      assert.notStrictEqual(depois, antes, 'recalcular --gravar SEM --dry-run deveria ter alterado o arquivo — se não alterou, a fixture não prova nada');
      const relido = JSON.parse(depois.trim());
      assert.notStrictEqual(relido.score, 99999, 'o score implausível da fixture deveria ter sido recalculado');

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
