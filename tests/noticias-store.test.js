#!/usr/bin/env node
'use strict';

/**
 * Store da trilha NOTÍCIA — `lib-noticias/store-noticias.js`.
 *
 * A decisão que este arquivo trava e que DIVERGE de `lib/store.js`: aqui o
 * registro já salvo TEM que ser atualizado nos campos derivados do lote
 * (score, cluster, percentil), porque quando um segundo veículo publica
 * sobre o mesmo fato amanhã, a notícia de hoje muda de cluster e de score.
 * Congelar o valor antigo guardaria uma medida obsoleta com cara de medida
 * atual.
 *
 * TODA gravação vai para um arquivo temporário em `os.tmpdir()`, passado
 * explicitamente como `storePath`. Nem `data/noticias.jsonl` nem
 * `data/store.jsonl` são tocados por este teste.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const store = require('../lib-noticias/store-noticias');

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

let contador = 0;
function tmpStore() {
  contador++;
  const p = path.join(os.tmpdir(), 'radar-noticias-teste-' + process.pid + '-' + contador + '.jsonl');
  if (fs.existsSync(p)) fs.unlinkSync(p);
  return p;
}

const AGORA = Date.parse('2026-08-27T15:00:00.000Z');

function itemBase(extra = {}) {
  return {
    id: store.gerarIdNoticia({ link: 'https://exemplo.com/a', titulo: 'Titulo de teste' }),
    titulo: 'Titulo de teste',
    link: 'https://exemplo.com/a',
    veiculo: 'Exemplo',
    dominio: 'exemplo.com',
    idioma: 'pt',
    aba: 'geral',
    tabela: 'brasil',
    dataMs: AGORA,
    dataBruta: 'Thu, 27 Aug 2026 15:00:00 -0000',
    fonte: 'exemplo-fonte',
    cluster_id: 'cluster-1',
    n_veiculos: 1,
    n_itens_cluster: 1,
    sinal_bruto: 1,
    dia_lote: '2026-08-27',
    lote: '2026-08-27::geral',
    lote_tamanho: 10,
    percentil: 50,
    repercussao: 30,
    perfil_bump: 0,
    perfil_matches: [],
    score: 30,
    ancoras: ['titulo'],
    ancoras_regime: 'maiuscula',
    ...extra
  };
}

function main() {
  console.log('\n=== noticias-store.test.js ===\n');
  let passed = 0;
  let failed = 0;

  const tests = [
    // ------------------------------------------------------------- id
    ['id é estável entre chamadas com os mesmos dados', () => {
      const a = store.gerarIdNoticia({ link: 'https://x.com/a', titulo: 'T' });
      const b = store.gerarIdNoticia({ link: 'https://x.com/a', titulo: 'T' });
      assert.strictEqual(a, b);
    }],

    ['id ignora caixa e espaço em volta (mesma normalização de lib/hash.js)', () => {
      const a = store.gerarIdNoticia({ link: 'https://x.com/a', titulo: 'Titulo' });
      const b = store.gerarIdNoticia({ link: '  HTTPS://X.COM/A  ', titulo: ' TITULO ' });
      assert.strictEqual(a, b);
    }],

    ['id é sensível ao link E ao título', () => {
      const base = { link: 'https://x.com/a', titulo: 'T' };
      assert.notStrictEqual(store.gerarIdNoticia(base), store.gerarIdNoticia({ ...base, link: 'https://x.com/b' }));
      assert.notStrictEqual(store.gerarIdNoticia(base), store.gerarIdNoticia({ ...base, titulo: 'Outro' }));
    }],

    ['o título entra no id de propósito: o HN pode ter DUAS stories para a MESMA URL externa', () => {
      const url = 'https://artigo.com/x';
      const d1 = store.gerarIdNoticia({ link: url, titulo: 'Show HN: fiz um site' });
      const d2 = store.gerarIdNoticia({ link: url, titulo: 'Um site para achar passes' });
      assert.notStrictEqual(d1, d2, 'colidir apagaria uma discussão real');
    }],

    ['id é hex e tem 20 caracteres (mesmo truncamento de lib/hash.js)', () => {
      const id = store.gerarIdNoticia({ link: 'https://x.com/a', titulo: 'T' });
      assert.match(id, /^[0-9a-f]{20}$/);
    }],

    // --------------------------------------------------------- registro
    ['montarRegistro entrega os 9 campos que o briefing pede, com os nomes que ele usou', () => {
      const r = store.montarRegistro(itemBase());
      for (const campo of ['titulo', 'veiculo', 'link', 'data', 'aba', 'tabela', 'cluster_id', 'n_veiculos', 'score']) {
        assert.ok(Object.prototype.hasOwnProperty.call(r, campo), 'faltou o campo ' + campo);
      }
      assert.strictEqual(r.data, '2026-08-27T15:00:00.000Z');
      assert.strictEqual(r.data_ms, AGORA);
    }],

    ['montarRegistro guarda o que permite RECALCULAR (âncoras, domínio, idioma, data_ms)', () => {
      const r = store.montarRegistro(itemBase());
      assert.deepStrictEqual(r.ancoras, ['titulo']);
      assert.strictEqual(r.dominio, 'exemplo.com');
      assert.strictEqual(r.idioma, 'pt');
      assert.ok(Number.isFinite(r.data_ms));
    }],

    ['score nativo ausente vira null, NUNCA zero ("medido e deu zero" é outra coisa)', () => {
      const r = store.montarRegistro(itemBase());
      assert.strictEqual(r.pontos, null);
      assert.strictEqual(r.comentarios, null);
      const comScore = store.montarRegistro(itemBase({ pontos: 0, comentarios: 0 }));
      assert.strictEqual(comScore.pontos, 0, 'zero MEDIDO é preservado como zero');
    }],

    ['item sem data vira data null — não epoch, não data da coleta', () => {
      const r = store.montarRegistro(itemBase({ dataMs: null }));
      assert.strictEqual(r.data, null);
      assert.strictEqual(r.data_ms, null);
    }],

    // ------------------------------------------------------- salvarLote
    ['salvarLote grava e conta os novos', () => {
      const p = tmpStore();
      const r = store.salvarLote([itemBase()], p);
      assert.strictEqual(r.novos, 1);
      assert.strictEqual(r.atualizados, 0);
      assert.strictEqual(store.carregarTudo(p).length, 1);
      fs.unlinkSync(p);
    }],

    ['DIVERGÊNCIA DE lib/store.js: o mesmo id na segunda rodada ATUALIZA os campos derivados', () => {
      const p = tmpStore();
      store.salvarLote([itemBase()], p);
      // amanhã um segundo veículo publica: o cluster e o score mudam.
      const r = store.salvarLote([itemBase({ cluster_id: 'cluster-2', n_veiculos: 3, score: 88, percentil: 95 })], p);
      assert.strictEqual(r.novos, 0);
      assert.strictEqual(r.atualizados, 1);

      const salvo = store.carregarTudo(p)[0];
      assert.strictEqual(salvo.cluster_id, 'cluster-2');
      assert.strictEqual(salvo.n_veiculos, 3);
      assert.strictEqual(salvo.score, 88);
      fs.unlinkSync(p);
    }],

    ['`visto_primeiro_em` é PRESERVADO na atualização — a origem não é derivada do lote', () => {
      const p = tmpStore();
      store.salvarLote([itemBase({ visto_primeiro_em: '2026-08-01T00:00:00.000Z' })], p);
      store.salvarLote([itemBase({ score: 99 })], p);
      const salvo = store.carregarTudo(p)[0];
      assert.strictEqual(salvo.visto_primeiro_em, '2026-08-01T00:00:00.000Z');
      assert.strictEqual(salvo.score, 99);
      fs.unlinkSync(p);
    }],

    ['dois itens diferentes coexistem; o mesmo item duas vezes no MESMO lote não duplica', () => {
      const p = tmpStore();
      const a = itemBase();
      const b = itemBase({
        id: store.gerarIdNoticia({ link: 'https://exemplo.com/b', titulo: 'Outro' }),
        link: 'https://exemplo.com/b',
        titulo: 'Outro'
      });
      store.salvarLote([a, b, a], p);
      assert.strictEqual(store.carregarTudo(p).length, 2);
      fs.unlinkSync(p);
    }],

    ['o store fica ordenado por data decrescente', () => {
      const p = tmpStore();
      const velho = itemBase({
        id: store.gerarIdNoticia({ link: 'https://exemplo.com/velho', titulo: 'Velho' }),
        link: 'https://exemplo.com/velho',
        titulo: 'Velho',
        dataMs: AGORA - 86400000
      });
      store.salvarLote([velho, itemBase()], p);
      const todos = store.carregarTudo(p);
      assert.ok(todos[0].data_ms > todos[1].data_ms);
      fs.unlinkSync(p);
    }],

    ['store inexistente carrega como lista vazia, não como erro', () => {
      const p = path.join(os.tmpdir(), 'radar-noticias-nao-existe-' + process.pid + '.jsonl');
      assert.deepStrictEqual(store.carregarTudo(p), []);
    }],

    ['STORE_PATH aponta para data/noticias.jsonl — nunca para data/store.jsonl', () => {
      assert.ok(store.STORE_PATH.endsWith('noticias.jsonl'));
      assert.ok(!/[\\/]store\.jsonl$/.test(store.STORE_PATH));
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
