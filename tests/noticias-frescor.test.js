#!/usr/bin/env node
'use strict';

/**
 * GUARDA DE FRESCOR — `lib-noticias/frescor.js`.
 *
 * O caso que este arquivo existe para travar: o feed `g1.globo.com/rss/g1/
 * concursos-e-emprego/` responde HTTP 200, com 100 `<item>` bem formados, e
 * todo `pubDate` é de 2017-2018. Validação por status, por contagem de itens
 * ou por "o XML parseou" declara essa fonte saudável. A guarda tem que
 * rejeitar — e tem que rejeitar SOZINHA, sem depender de alguém ler um
 * relatório.
 *
 * Todo teste injeta `agora` com um epoch FIXO. Um teste de idade que use o
 * relógio da máquina passa hoje e falha em três meses, o que é o mesmo que
 * não testar.
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const rss = require('../lib-noticias/rss');
const frescor = require('../lib-noticias/frescor');

const FIX = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'noticias-feeds.json'), 'utf8'));
const AGORA = Date.parse('2026-08-27T18:00:00.000Z');

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
  console.log('\n=== noticias-frescor.test.js ===\n');
  let passed = 0;
  let failed = 0;

  const tests = [
    // ------------------------------------------------ o caso que motiva tudo
    ['O CASO CENTRAL: feed que responde 200, parseia 2 itens e é de 2018 — REJEITADO', () => {
      const parsed = rss.parseFeed(FIX.feed_morto_2018);
      // Controle: o feed é tecnicamente perfeito. Toda validação estrutural passa.
      assert.strictEqual(parsed.itens.length, 2, 'controle: os itens existem e são válidos');
      assert.ok(parsed.itens.every(i => i.titulo && i.linkCanonico && Number.isFinite(i.dataMs)));

      const v = frescor.avaliarFrescor(parsed.itens, { maxIdadeDias: 7, agora: AGORA });
      assert.strictEqual(v.aprovado, false);
      assert.strictEqual(v.motivo, 'feed_velho');
      assert.strictEqual(v.maisRecenteISO, '2018-07-23T10:00:00.000Z');
      assert.ok(v.idadeDias > 2900, 'idade medida em dias reais, não em adjetivo');
    }],

    ['o veredito carrega a MEDIDA (data + idade + limiar), não só um booleano', () => {
      const parsed = rss.parseFeed(FIX.feed_morto_2018);
      const v = frescor.avaliarFrescor(parsed.itens, { maxIdadeDias: 7, agora: AGORA });
      const linha = frescor.formatarVeredito('g1-concursos-canario', v);
      assert.ok(linha.includes('REJEITADA'));
      assert.ok(linha.includes('mais_recente=2018-07-23'));
      assert.ok(linha.includes('idade_dias='));
      assert.ok(linha.includes('limiar_dias=7'));
    }],

    ['feed fresco é aprovado com motivo `fresco`', () => {
      const parsed = rss.parseFeed(FIX.rss2_g1);
      const v = frescor.avaliarFrescor(parsed.itens, { maxIdadeDias: 7, agora: AGORA });
      assert.strictEqual(v.aprovado, true);
      assert.strictEqual(v.motivo, 'fresco');
      assert.ok(v.idadeDias < 1);
    }],

    // ----------------------------------------------- limiar POR FONTE
    ['o limiar é por fonte: 12 dias de silêncio reprova com 7 e aprova com 30 (caso Retraction Watch)', () => {
      const itens = [{ dataMs: Date.parse('2026-08-15T00:00:00Z') }];
      assert.strictEqual(frescor.avaliarFrescor(itens, { maxIdadeDias: 7, agora: AGORA }).aprovado, false);
      assert.strictEqual(frescor.avaliarFrescor(itens, { maxIdadeDias: 30, agora: AGORA }).aprovado, true);
    }],

    ['a guarda olha o item MAIS RECENTE, não a média nem o primeiro do feed', () => {
      // Feed com 1 item de hoje e o resto de 2018 continua VIVO.
      const itens = [{ dataMs: Date.parse('2018-01-01T00:00:00Z') }, { dataMs: AGORA - 3600000 }];
      const v = frescor.avaliarFrescor(itens, { maxIdadeDias: 7, agora: AGORA });
      assert.strictEqual(v.aprovado, true);
    }],

    // --------------------------------------------------- sem data != velho
    ['SEM DATA não é o mesmo que VELHO (caso Agência FAPESP) — motivo próprio, rejeitado por padrão', () => {
      const parsed = rss.parseFeed(FIX.sem_data);
      assert.strictEqual(parsed.itens.length, 2, 'controle: os itens existem');
      assert.ok(parsed.itens.every(i => i.dataMs == null), 'controle: nenhum tem data');

      const v = frescor.avaliarFrescor(parsed.itens, { maxIdadeDias: 7, agora: AGORA });
      assert.strictEqual(v.aprovado, false);
      assert.strictEqual(v.motivo, 'sem_data');
      assert.notStrictEqual(v.motivo, 'feed_velho', 'os dois defeitos não podem se confundir');
    }],

    ['sem data só passa se a fonte assumir o custo EXPLICITAMENTE', () => {
      const parsed = rss.parseFeed(FIX.sem_data);
      const v = frescor.avaliarFrescor(parsed.itens, { maxIdadeDias: 7, permitirSemData: true, agora: AGORA });
      assert.strictEqual(v.aprovado, true);
      assert.strictEqual(v.motivo, 'sem_data_permitido');
    }],

    ['feed vazio tem motivo próprio (`feed_vazio`) — caso InfoMoney Carreira, 200 com 0 itens', () => {
      const v = frescor.avaliarFrescor([], { maxIdadeDias: 7, agora: AGORA });
      assert.strictEqual(v.aprovado, false);
      assert.strictEqual(v.motivo, 'feed_vazio');
    }],

    ['data no futuro (fuso mal declarado) não penaliza — idade 0, não negativa', () => {
      const v = frescor.avaliarFrescor([{ dataMs: AGORA + 7200000 }], { maxIdadeDias: 7, agora: AGORA });
      assert.strictEqual(v.aprovado, true);
      assert.strictEqual(v.idadeDias, 0);
    }],

    // --------------------------------- segundo corte: item velho em feed vivo
    ['ACHADO REAL (BBC Brasil): fonte VIVA com item de 2024 — a fonte passa, o item de 2024 cai', () => {
      const parsed = rss.parseFeed(FIX.bbc_misturado);

      const v = frescor.avaliarFrescor(parsed.itens, { maxIdadeDias: 7, agora: AGORA });
      assert.strictEqual(v.aprovado, true, 'a fonte está viva — rejeitá-la seria o erro oposto');

      const { itens, descartados } = frescor.filtrarItensVelhos(parsed.itens, { maxIdadeDias: 7, agora: AGORA });
      assert.strictEqual(descartados.length, 1);
      assert.strictEqual(descartados[0].titulo, 'Materia recomendada de dois anos atras');
      assert.strictEqual(itens.length, 2);
    }],

    ['item SEM data sobrevive ao corte por item (quem barra item sem data é a guarda de fonte, antes)', () => {
      const { itens, descartados } = frescor.filtrarItensVelhos(
        [{ dataMs: null, titulo: 'x' }, { dataMs: Date.parse('2018-01-01T00:00:00Z'), titulo: 'y' }],
        { maxIdadeDias: 7, agora: AGORA }
      );
      assert.strictEqual(itens.length, 1);
      assert.strictEqual(itens[0].titulo, 'x');
      assert.strictEqual(descartados.length, 1);
    }],

    ['entrada não-array não quebra a guarda', () => {
      assert.strictEqual(frescor.avaliarFrescor(null, { agora: AGORA }).motivo, 'feed_vazio');
      assert.deepStrictEqual(frescor.filtrarItensVelhos(undefined, { agora: AGORA }).itens, []);
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
