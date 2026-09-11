#!/usr/bin/env node
'use strict';

/**
 * Onda conserto-ingles-titulo-curto (Durin, 2026-09-09) — dois defeitos
 * medidos na trilha mercado (ver config/keywords-mercado.json →
 * _comentario_ingles_e_titulo_curto pro relato completo e
 * tmp/medicao-{1,2,3}-*.log pras três medições ao vivo, quatro fontes):
 *
 *   1. IDIOMA — weworkremotely é 100% inglês; termos_aderencia era quase
 *      todo português. "Head of Design" (WWR) era rejeitado com 18.816
 *      caracteres de descrição — não por falta de texto, por vocabulário
 *      que não alcançava.
 *   2. VOCABULÁRIO DE TÍTULO CURTO — vagas.com julga só título+cidade
 *      (30-85 chars); a lista tinha "product designer"/"design de
 *      produto"/"design system" mas nenhum termo que bata "Motion
 *      Designer"/"Designer Gráfico" (com "-er") nem "Analista Design
 *      Gráfico Jr" (sem "-er").
 *
 * Este teste é o CONTROLE POSITIVO+NEGATIVO do briefing — "teste que só
 * prova o lado positivo será recusado". Usa scoreMercado.avaliarAderencia
 * (a MESMA função que radar.js processarItensFonte chama no estágio 2 —
 * nenhuma lógica de filtro nova) contra:
 *
 *   (a) títulos REAIS rejeitados na coleta ao vivo de 2026-09-09 (WWR e
 *       vagas.com, colados verbatim de tmp/medicao-1-baseline.log) que
 *       DEVEM passar a aprovar;
 *   (b) títulos REAIS que já eram corretamente rejeitados (Cabeleireira
 *       MEI, Motorista de Carreta, Precast Design Engineer) e PRECISAM
 *       continuar fora;
 *   (c) o risco NOMEADO no briefing — "designer de sobrancelhas"/"designer
 *       de unhas"/"designer de cílios" — construído aqui porque não
 *       apareceu na coleta ao vivo de hoje (ver
 *       tmp/exploratorio-agressivo-vagas.log: universo de hoje não tem
 *       esse caso real). O teste prova DUAS coisas: que a config REAL
 *       (sem "design"/"designer" soltos) rejeita o caso construído, E que
 *       um candidato com "designer" solto — a correção "óbvia" que este
 *       briefing deliberadamente NÃO tomou — aprovaria esse mesmo caso.
 *       Isso documenta POR QUE a mitigação é "só termos compostos", não
 *       "confiar em config/negativos.json": negativos.json não é chamado
 *       em NENHUM ponto da trilha mercado (nem lib/vaga-mercado.js, nem
 *       lib/score-mercado.js, nem o gate de radar.js processarItensFonte
 *       pra trilha 'mercado') — só na trilha docente (radar.js
 *       comandoJulgar / extrair-llm). Ligar isso é mudança de radar.js/
 *       lib/score-mercado.js, fora da fronteira de escrita desta rodada;
 *   (d) o resíduo conhecido — "Analista de Marketing (Design) Pleno" e
 *       "Estagiário(a) de Design/Arte Monet" (reais, vagas.com, hoje) só
 *       têm "Design" solto no título — ficam de fora de propósito. O
 *       teste AFIRMA isso (não deixa como lacuna muda) pra próxima pessoa
 *       que mexer aqui decidir com o mesmo fato na mão, não redescobrir.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const scoreMercado = require('../lib/score-mercado');

const keywordsMercadoConfig = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'config', 'keywords-mercado.json'), 'utf8')
);

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
  console.log('\n=== keywords-mercado-titulo-curto-ingles.test.js ===\n');
  let passed = 0;
  let failed = 0;

  const tests = [
    // --- (a) POSITIVO — inglês (WWR, real, 2026-09-09) ---
    ['POSITIVO inglês: "Head of Design" (WWR) passa a aprovar', () => {
      const r = scoreMercado.avaliarAderencia('Head of Design', keywordsMercadoConfig);
      assert.strictEqual(r.passou, true);
      assert.ok(r.matches.some(m => m.termo === 'head of design'));
    }],

    ['POSITIVO inglês: "Junior Designer (Part-Time Contract)" (WWR) passa a aprovar', () => {
      const r = scoreMercado.avaliarAderencia('Junior Designer (Part-Time Contract)', keywordsMercadoConfig);
      assert.strictEqual(r.passou, true);
      assert.ok(r.matches.some(m => m.termo === 'junior designer'));
    }],

    ['POSITIVO inglês: "Graphic Design instructor - Project Based" (WWR) passa a aprovar', () => {
      const r = scoreMercado.avaliarAderencia('Graphic Design instructor - Project Based', keywordsMercadoConfig);
      assert.strictEqual(r.passou, true);
      assert.ok(r.matches.some(m => m.termo === 'graphic design'));
    }],

    // --- (a) POSITIVO — título curto (vagas.com/gupy, real, 2026-09-09) ---
    ['POSITIVO título curto: "Motion Designer" (vagas.com) passa a aprovar', () => {
      const r = scoreMercado.avaliarAderencia('Motion Designer', keywordsMercadoConfig);
      assert.strictEqual(r.passou, true);
      assert.ok(r.matches.some(m => m.termo === 'motion designer'));
    }],

    ['POSITIVO título curto: "Designer Gráfico" (vagas.com, SP/BH/Salvador) passa a aprovar', () => {
      const r = scoreMercado.avaliarAderencia('Designer Gráfico', keywordsMercadoConfig);
      assert.strictEqual(r.passou, true);
      assert.ok(r.matches.some(m => m.termo === 'designer gráfico'));
    }],

    ['POSITIVO título curto: "Analista Design Gráfico Jr" (vagas.com) passa a aprovar (variante SEM "-er")', () => {
      const r = scoreMercado.avaliarAderencia('Analista Design Gráfico Jr', keywordsMercadoConfig);
      assert.strictEqual(r.passou, true);
      assert.ok(r.matches.some(m => m.termo === 'design gráfico'));
    }],

    ['POSITIVO título curto: "Designer de Comunicação Interna (Temporário) - São Paulo" (vagas.com) passa a aprovar', () => {
      const r = scoreMercado.avaliarAderencia('Designer de Comunicação Interna (Temporário) - São Paulo', keywordsMercadoConfig);
      assert.strictEqual(r.passou, true);
    }],

    ['POSITIVO título curto: "Designer de Produto | Ipanema" (gupy) passa a aprovar (bug de fronteira "designer" x "design" corrigido)', () => {
      const r = scoreMercado.avaliarAderencia('Designer de Produto | Ipanema ', keywordsMercadoConfig);
      assert.strictEqual(r.passou, true);
      assert.ok(r.matches.some(m => m.termo === 'designer de produto'));
    }],

    // --- (b) NEGATIVO — ruído real já corretamente rejeitado, continua fora ---
    ['NEGATIVO real: "Cabeleireira (o) Mei -Campos" (vagas.com, real) continua fora', () => {
      const r = scoreMercado.avaliarAderencia('Cabeleireira (o) Mei -Campos', keywordsMercadoConfig);
      assert.strictEqual(r.passou, false);
    }],

    ['NEGATIVO real: "Operador Equipamento I - Motorista de Carreta Interna" (vagas.com, real) continua fora', () => {
      const r = scoreMercado.avaliarAderencia('Operador Equipamento I - Motorista de Carreta Interna', keywordsMercadoConfig);
      assert.strictEqual(r.passou, false);
    }],

    ['NEGATIVO real: "Precast Design Engineer" (WWR, real) continua fora — prova que NÃO adicionamos "design" solto em inglês', () => {
      const r = scoreMercado.avaliarAderencia('Precast Design Engineer', keywordsMercadoConfig);
      assert.strictEqual(r.passou, false);
    }],

    ['NEGATIVO real: "Digital Design Diagram Creators" (WWR, real) continua fora — mesmo motivo', () => {
      const r = scoreMercado.avaliarAderencia('Digital Design Diagram Creators', keywordsMercadoConfig);
      assert.strictEqual(r.passou, false);
    }],

    // --- (c) NEGATIVO — o risco NOMEADO no briefing, construído (não achado real hoje) ---
    ['NEGATIVO construído: config REAL (sem "designer" solto) rejeita "Designer de Sobrancelhas - Salão Bella"', () => {
      const r = scoreMercado.avaliarAderencia('Designer de Sobrancelhas - Salão Bella', keywordsMercadoConfig);
      assert.strictEqual(r.passou, false, 'a config real não deve ter nenhum termo que bata "designer de sobrancelhas"');
    }],

    ['NEGATIVO construído: config REAL (sem "designer" solto) rejeita "Designer de Unhas e Cílios"', () => {
      const r = scoreMercado.avaliarAderencia('Designer de Unhas e Cílios', keywordsMercadoConfig);
      assert.strictEqual(r.passou, false);
    }],

    [
      'DOCUMENTAÇÃO DO RISCO: um candidato com "designer" SOLTO (a correção óbvia que este briefing recusou) aprovaria ' +
        '"Designer de Sobrancelhas" — prova por que a mitigação escolhida foi só termos compostos, não confiar em negativos.json ' +
        '(que não é chamado em NENHUM ponto da trilha mercado — ver comentário de topo deste arquivo)',
      () => {
        const candidatoComDesignerSolto = {
          ...keywordsMercadoConfig,
          termos_aderencia: [
            ...keywordsMercadoConfig.termos_aderencia,
            { termo: 'designer', area: 'UX/Produto', subarea: 'Design (candidato recusado)', peso: 16 }
          ]
        };
        const r = scoreMercado.avaliarAderencia('Designer de Sobrancelhas - Salão Bella', candidatoComDesignerSolto);
        assert.strictEqual(
          r.passou,
          true,
          'este assert é O RISCO, não o desejado — prova que bare "designer" aprovaria o caso nomeado por JB, ' +
            'e é exatamente por isso que config/keywords-mercado.json real não usa esse termo'
        );
      }
    ],

    // --- (d) RESÍDUO CONHECIDO — nomeado, não escondido ---
    [
      'RESÍDUO CONHECIDO: "Analista de Marketing (Design) Pleno" (vagas.com, real, hoje) continua fora — ' +
        'só tem "Design" solto no título, decisão deliberada de não cobrir (ver comentário de topo)',
      () => {
        const r = scoreMercado.avaliarAderencia('Analista de Marketing (Design) Pleno', keywordsMercadoConfig);
        assert.strictEqual(r.passou, false);
      }
    ],

    [
      'RESÍDUO CONHECIDO: "Estagiário(a) de Design/Arte Monet" (vagas.com, real, hoje) continua fora — mesmo motivo',
      () => {
        const r = scoreMercado.avaliarAderencia('Estagiário(a) de Design/Arte Monet', keywordsMercadoConfig);
        assert.strictEqual(r.passou, false);
      }
    ]
  ];

  for (const [name, fn] of tests) {
    if (runTest(name, fn)) passed++;
    else failed++;
  }

  console.log(`\n${passed} passou(aram), ${failed} falhou(aram)\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
