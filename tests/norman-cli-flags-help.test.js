#!/usr/bin/env node
'use strict';

/**
 * REMODELAÇÃO CRM 2026-09-01 — Leva 4, emenda E6.
 * `.claude/plans/remodelacao-crm-2026-09-01.md` Leva 4: "cerca de CLI nos
 * scripts de `_norman/` que escrevem (`construir.js`, `formatar.js`,
 * `estresse.js`) + nos de leitura (`verificar.js`, `prova-portal.js`):
 * `--help`/`-h` real e RECUSA de flag desconhecida antes de qualquer
 * efeito, padrão CERCA-SECA (na Leva 3, `--help` inexistente executou a
 * aplicação geral real)."
 *
 * O QUE ESTE ARQUIVO PROVA, POR SUBPROCESSO REAL (`spawnSync`, o mesmo
 * binário que roda em produção — nunca um dublê):
 *
 *  - `--help` e `-h` (dash simples) saem 0, imprimem uso, e NUNCA
 *    despacham pro fluxo real — em CADA um dos 5 scripts.
 *  - flag desconhecida (`--foo`) recusa com código != 0 e NUNCA despacha.
 *  - `_norman/prova-portal.js <comando-real> --help` (o caso que o
 *    incidente original não cobria: `--help` DEPOIS de um comando válido)
 *    também sai limpo, sem executar o comando.
 *  - `_norman/estresse.js` — nunca É RODADO de verdade neste arquivo
 *    (fronteira dura do briefing); só os caminhos `--help`/`-h`/flag
 *    inválida são exercitados, que saem ANTES de qualquer rede.
 *  - CINTO DE SEGURANÇA: hash de `_norman/.carimbo-original.json` (se
 *    existir) antes/depois — nenhum dos casos acima deveria tocar disco.
 */

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const RADAR_DIR = path.resolve(__dirname, '..');
const NORMAN_DIR = path.join(RADAR_DIR, '_norman');

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

function rodar(script, args) {
  return spawnSync(process.execPath, [path.join(NORMAN_DIR, script), ...args], {
    cwd: RADAR_DIR,
    encoding: 'utf8',
    timeout: 15000
  });
}

// Marcador de dispatch real por script — texto que SÓ aparece se o
// fluxo de verdade rodou (rede/escrita), nunca no texto de uso.
const MARCADOR_DISPATCH = {
  'construir.js': /aba\(s\) ausente|abas novas já existiam|criadas:|escrita única/,
  'formatar.js': /formatação aplicada|sheetIds:/,
  'verificar.js': /VARREDURA DE ERRO/,
  'prova-portal.js': /gravado:|carimbo REAL salvo|controles do leitor/
};

function main() {
  console.log('\n=== norman-cli-flags-help.test.js ===\n');
  let passed = 0;
  let failed = 0;

  const snapPortal = path.join(NORMAN_DIR, '.carimbo-original.json');
  const snapNoticia = path.join(NORMAN_DIR, '.carimbo-noticia-original.json');
  const hashAntes = { portal: hashArquivo(snapPortal), noticia: hashArquivo(snapNoticia) };

  const scripts = ['construir.js', 'formatar.js', 'verificar.js', 'prova-portal.js', 'estresse.js'];

  const tests = [];

  for (const script of scripts) {
    tests.push([`${script} --help sai 0, imprime uso, nunca despacha`, () => {
      const r = rodar(script, ['--help']);
      assert.strictEqual(r.status, 0, `stderr: ${r.stderr}\nstdout: ${r.stdout}`);
      assert.match(r.stdout, /[Uu]so:/, 'não imprimiu texto de uso reconhecível');
      const marcador = MARCADOR_DISPATCH[script];
      if (marcador) assert.doesNotMatch(r.stdout, marcador, `${script} --help despachou pro fluxo real (achou marcador de dispatch)`);
    }]);

    tests.push([`${script} -h (dash simples) tem o MESMO efeito de --help`, () => {
      const r = rodar(script, ['-h']);
      assert.strictEqual(r.status, 0, `stderr: ${r.stderr}\nstdout: ${r.stdout}`);
      assert.match(r.stdout, /[Uu]so:/, 'não imprimiu texto de uso reconhecível');
      const marcador = MARCADOR_DISPATCH[script];
      if (marcador) assert.doesNotMatch(r.stdout, marcador, `${script} -h despachou pro fluxo real`);
    }]);

    tests.push([`${script} --flag-inexistente recusa com código != 0, nunca despacha`, () => {
      const r = rodar(script, ['--flag-inexistente-xyz']);
      assert.notStrictEqual(r.status, 0, 'flag desconhecida não pode sair OK');
      const marcador = MARCADOR_DISPATCH[script];
      if (marcador) assert.doesNotMatch(r.stdout, marcador, `${script} com flag inválida despachou pro fluxo real`);
    }]);
  }

  // Caso específico do prova-portal.js: `--help` DEPOIS de um comando
  // válido (`baseline --help`) — o padrão exato do incidente original
  // ("comando --help caiu no comando real"), aqui num script de dispatch
  // posicional em vez de FLAGS_VALIDAS por comando.
  tests.push(['prova-portal.js baseline --help sai 0 e NÃO roda baseline (que leria a planilha)', () => {
    const r = rodar('prova-portal.js', ['baseline', '--help']);
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}\nstdout: ${r.stdout}`);
    assert.match(r.stdout, /uso:/i);
    assert.doesNotMatch(r.stdout, /^\{/m, 'baseline real imprime JSON começando com "{" — não pode ter rodado');
  }]);

  tests.push(['prova-portal.js prova-nav-oculta --help sai 0 e NÃO executa o teste de coluna oculta (que mexe na planilha)', () => {
    const r = rodar('prova-portal.js', ['prova-nav-oculta', '--help']);
    assert.strictEqual(r.status, 0, `stderr: ${r.stderr}\nstdout: ${r.stdout}`);
    assert.doesNotMatch(r.stdout, /ANTES|FORÇADO|RESTAURADO/, 'prova-nav-oculta real teria rodado — achou os marcadores dela');
  }]);

  // formatar.js: flag válida (--piloto) reconhecida, só a EXTRA que não é
  // reconhecida.
  tests.push(['formatar.js --piloto Hoje --flag-extra-xyz recusa (a extra é desconhecida, mesmo com --piloto válido presente)', () => {
    const r = rodar('formatar.js', ['--piloto', 'Hoje', '--flag-extra-xyz']);
    assert.notStrictEqual(r.status, 0);
    assert.match(r.stderr, /flag\(s\) desconhecida\(s\)/);
    assert.match(r.stderr, /--flag-extra-xyz/);
  }]);

  tests.push(['formatar.js --piloto sozinho (sem --help nem flag extra) NÃO é recusado pela cerca (a cerca só barra flag DESCONHECIDA)', () => {
    // Não roda de verdade (levaria rede) — só confere que a cerca NÃO
    // dispara erro de "flag desconhecida" antes de chegar no dispatch real
    // (que aí sim falharia por falta de credencial/rede, com outra
    // mensagem, nunca com "[formatar] flag(s) desconhecida(s)").
    const r = rodar('formatar.js', ['--piloto', 'Hoje']);
    assert.doesNotMatch(r.stderr || '', /flag\(s\) desconhecida\(s\)/, '--piloto é flag válida — a cerca não deveria barrar por "desconhecida"');
  }]);

  for (const [name, fn] of tests) {
    if (runTest(name, fn)) passed++;
    else failed++;
  }

  const hashDepois = { portal: hashArquivo(snapPortal), noticia: hashArquivo(snapNoticia) };
  if (runTest('CINTO DE SEGURANÇA: nenhum snapshot de carimbo foi criado/alterado por nenhum dos casos acima', () => {
    assert.strictEqual(hashDepois.portal, hashAntes.portal, '.carimbo-original.json mudou — algum caso acima tocou disco');
    assert.strictEqual(hashDepois.noticia, hashAntes.noticia, '.carimbo-noticia-original.json mudou — algum caso acima tocou disco');
  })) passed++; else failed++;

  console.log(`\n${passed} passou(aram), ${failed} falhou(aram)\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
