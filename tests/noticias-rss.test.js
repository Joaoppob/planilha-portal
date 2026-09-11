#!/usr/bin/env node
'use strict';

/**
 * Parser de feed da trilha NOTÍCIA — `lib-noticias/rss.js`.
 *
 * Cada asserção aqui corresponde a um achado MEDIDO no reconhecimento de
 * fontes (`fontes-noticias-reconhecimento.md`), não a um caso inventado: o
 * Atom que um parser de `<item>` conta como zero, o RDF com atributo na tag,
 * a data da Folha sem dia da semana, e a duplicata que a BBC Brasil publica
 * dentro do próprio feed.
 *
 * Sem rede. Fixtures sintéticas em `tests/fixtures/noticias-feeds.json`.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const rss = require('../lib-noticias/rss');

const FIX = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'noticias-feeds.json'), 'utf8'));

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
  console.log('\n=== noticias-rss.test.js ===\n');
  let passed = 0;
  let failed = 0;

  const tests = [
    // ---------------------------------------------------------- formato
    ['detectarFormato reconhece Atom pelo <entry>', () => {
      assert.strictEqual(rss.detectarFormato(FIX.atom_verge), 'atom');
    }],

    ['detectarFormato trata RSS e RDF como a mesma unidade (<item>)', () => {
      assert.strictEqual(rss.detectarFormato(FIX.rss2_g1), 'rss');
      assert.strictEqual(rss.detectarFormato(FIX.rdf_nature), 'rss');
    }],

    ['ACHADO REAL: feed Atom não conta zero (o erro que um parser de <item> cometeria)', () => {
      // O reconhecimento registra ter contado 0 itens no The Verge por
      // procurar `<item>`. Esta é a asserção que impede a reincidência.
      assert.strictEqual(rss.extrairBlocos(FIX.atom_verge, 'item').length, 0, 'controle: não há <item> aqui');
      const r = rss.parseFeed(FIX.atom_verge);
      assert.strictEqual(r.formato, 'atom');
      assert.strictEqual(r.itens.length, 2);
    }],

    ['ACHADO REAL: RDF com atributo na tag de item é parseado (item rdf:about=...)', () => {
      const r = rss.parseFeed(FIX.rdf_nature);
      assert.strictEqual(r.itens.length, 1);
      assert.strictEqual(r.itens[0].titulo, 'Estudo mede efeito de interface adaptativa');
    }],

    // ------------------------------------------------------------ campos
    ['Atom: link vem do ATRIBUTO href de <link rel="alternate">', () => {
      const r = rss.parseFeed(FIX.atom_verge);
      assert.strictEqual(r.itens[0].link, 'https://exemplo-b.com/2026/8/27/modelo-novo');
    }],

    ['Atom: <link href> SEM rel também é aceito (caso Reddit — recusar zeraria a fonte)', () => {
      const r = rss.parseFeed(FIX.atom_verge);
      assert.strictEqual(r.itens[1].link, 'https://exemplo-b.com/2026/8/26/outro');
    }],

    ['Atom: autor sai de author>name, e categorias saem do atributo term', () => {
      const r = rss.parseFeed(FIX.atom_verge);
      assert.strictEqual(r.itens[0].autor, 'Fulana de Tal');
      assert.deepStrictEqual(r.itens[0].categorias, ['AI', 'Business']);
    }],

    ['tag com namespace é lida (dc:date, dc:creator)', () => {
      const r = rss.parseFeed(FIX.rdf_nature);
      assert.strictEqual(r.itens[0].autor, 'Autor Um');
      assert.strictEqual(r.itens[0].dataISO, '2026-08-26T00:00:00.000Z');
    }],

    ['CDATA é desembrulhado e as tags internas somem do resumo', () => {
      const r = rss.parseFeed(FIX.rss2_g1);
      assert.strictEqual(r.itens[0].resumo, 'Resumo com & e tag .');
    }],

    ['campo() devolve null para tag ausente — nunca string vazia', () => {
      assert.strictEqual(rss.campo('<item><title>x</title></item>', 'pubDate'), null);
      assert.strictEqual(rss.campo('<item><title>  </title></item>', 'title'), null);
    }],

    // ------------------------------------------------------------- datas
    ['ACHADO REAL: data da Folha SEM dia da semana parseia (o [incerto:] em aberto do reconhecimento)', () => {
      // "27 Aug 2026 12:30:00 -0300" — o reconhecimento só inspecionou
      // visualmente que "parece compatível". Aqui vira asserção.
      const ms = rss.dataMs('27 Aug 2026 12:30:00 -0300');
      assert.ok(Number.isFinite(ms), 'não parseou');
      assert.strictEqual(new Date(ms).toISOString(), '2026-08-27T15:30:00.000Z');
    }],

    ['data ausente ou inválida vira null — NUNCA epoch nem Date.now()', () => {
      assert.strictEqual(rss.dataMs(null), null);
      assert.strictEqual(rss.dataMs('data que nao existe'), null);
      assert.strictEqual(rss.dataISO(undefined), null);
      // O contra-exemplo que motiva a regra: `new Date(null)` daria 1970.
      assert.notStrictEqual(rss.dataMs(null), 0);
    }],

    // -------------------------------------------------------- link/domínio
    ['linkCanonico remove utm_*/cmp, fragmento e barra final', () => {
      assert.strictEqual(
        rss.linkCanonico('https://www.Exemplo-A.com/a/b.ghtml?utm_source=x&cmp=y&id=7#topo'),
        'https://exemplo-a.com/a/b.ghtml?id=7'
      );
    }],

    ['dominio agrupa subdomínio no domínio registrável (mesmo grupo editorial não conta 2 veículos)', () => {
      assert.strictEqual(rss.dominio('https://g1.globo.com/x'), 'globo.com');
      assert.strictEqual(rss.dominio('https://oglobo.globo.com/x'), 'globo.com');
      assert.strictEqual(rss.dominio('https://feeds.bbci.co.uk/x'), 'bbci.co.uk');
      assert.strictEqual(rss.dominio('https://exemplo.com.br/x'), 'exemplo.com.br');
    }],

    // ------------------------------------------------------ dedupe intra-feed
    ['DEDUPE INTRA-FEED: mesma matéria com utm diferente colapsa em um item', () => {
      const r = rss.parseFeed(FIX.rss2_g1);
      assert.strictEqual(r.volumeBruto, 3, 'volumeBruto conta ANTES do dedupe');
      assert.strictEqual(r.itens.length, 2);
      assert.strictEqual(r.removidosIntraFeed, 1);
    }],

    ['ACHADO REAL (BBC Brasil): item literalmente duplicado dentro do próprio feed é removido', () => {
      const r = rss.parseFeed(FIX.bbc_misturado);
      assert.strictEqual(r.volumeBruto, 4);
      assert.strictEqual(r.itens.length, 3);
      assert.strictEqual(r.removidosIntraFeed, 1);
    }],

    ['dedupe intra-feed mantém a PRIMEIRA ocorrência, não a última', () => {
      const { itens } = rss.dedupeIntraFeed([
        { linkCanonico: 'u', titulo: 'primeiro' },
        { linkCanonico: 'u', titulo: 'segundo' }
      ]);
      assert.strictEqual(itens.length, 1);
      assert.strictEqual(itens[0].titulo, 'primeiro');
    }],

    ['item sem título ou sem link é descartado e contado em descartadosSemCampo', () => {
      const xml =
        '<rss><channel><item><title>Sem link</title></item><item><link>https://x.com/a</link></item></channel></rss>';
      const r = rss.parseFeed(xml);
      assert.strictEqual(r.volumeBruto, 2);
      assert.strictEqual(r.itens.length, 0);
      assert.strictEqual(r.descartadosSemCampo, 2);
    }],

    // -------------------------------------------------------- entidades
    ['&amp; é resolvido POR ÚLTIMO (senão &amp;lt; injetaria uma tag escrita como texto)', () => {
      assert.strictEqual(rss.decodificarEntidades('&amp;lt;b&amp;gt;'), '&lt;b&gt;');
      assert.strictEqual(rss.decodificarEntidades('a &amp; b'), 'a & b');
    }],

    ['entidade numérica decimal e hexadecimal', () => {
      assert.strictEqual(rss.decodificarEntidades('R&#38;D'), 'R&D');
      assert.strictEqual(rss.decodificarEntidades('caf&#xe9;'), 'café');
    }],

    ['limparTags remove HTML e normaliza espaço', () => {
      assert.strictEqual(rss.limparTags('<p>um   <b>dois</b></p>'), 'um dois');
    }],

    ['parser não lança em XML lixo — devolve lote vazio', () => {
      const r = rss.parseFeed('isto nao e xml nenhum <<<');
      assert.strictEqual(r.itens.length, 0);
      assert.strictEqual(r.volumeBruto, 0);
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
