#!/usr/bin/env node
'use strict';

/**
 * ONDA 3 — `_estado`, a memória do check "Inscrito" que sobrevive à
 * reescrita diária de `Concursos`/`Empregos`.
 *
 * O QUE ESTE ARQUIVO PROVA, e como:
 *
 *   A. `_norman/estado.js` (`colher`/`restaurar`/serialização) — funções
 *      PURAS, testadas em memória, sem rede nenhuma.
 *
 *   B. A PROVA CENTRAL DA ONDA: "JB marca, o dia vira, a ordem muda, o check
 *      continua no MESMO edital, não na mesma linha". Simulada com
 *      `colher()` + `restaurar()` encadeados, três urls nomeadas, e um
 *      embaralhamento real do array entre os dois passos.
 *
 *   C. `_norman/construir.js passoColher`/`passoRestaurar` — as funções que
 *      falam com a API de verdade, testadas por INJEÇÃO DE DEPENDÊNCIA: um
 *      `api` dublê no lugar do `_norman/api.js` real. `require('../_norman/
 *      construir')` NUNCA dispara `main()` contra a planilha (o arquivo
 *      guarda a chamada atrás de `require.main === module` — ver o próprio
 *      arquivo) — é o que torna isto seguro de rodar em `node radar.js
 *      testar` sem credencial nenhuma.
 *
 *   D. O MODO DE FALHA ("colher falha -> build aborta antes de limpar"), em
 *      duas camadas complementares:
 *      D1. `passoColher` com um `api` cuja leitura REJEITA: a função tem que
 *          rejeitar também, e NADA pode ter sido escrito no dublê (nem
 *          `_estado`, muito menos as vistas).
 *      D2. Checagem de ORDEM NO CÓDIGO-FONTE: a chamada a `passoColher`
 *          precisa aparecer, textualmente, ANTES do laço `a.limpar(...)` em
 *          `construir.js`, e a chamada a `passoRestaurar` precisa aparecer
 *          DEPOIS da escrita única (`escreverVarios`). D1 prova que a
 *          função em si falha limpo; D2 prova que `main()` a chama na ordem
 *          que faz essa falha limpa se traduzir em "build abortado antes de
 *          apagar a planilha" — a garantia real é a ordem SEQUENCIAL do
 *          `await` (sem try/catch em volta), que D2 vigia por regressão.
 *      NÃO É PROVADO AQUI (e não pode ser, sem credencial real): que o
 *      `main()` inteiro, rodando contra a planilha de verdade, de fato para
 *      no ponto certo. Essa prova é `node _norman/construir.js` ao vivo —
 *      ver RELATORIO-ONDA-3-4.md §Bloqueio para o que impede isso HOJE (uma
 *      pendência de OUTRA Onda, não desta).
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const EST = require('../_norman/estado');
const construir = require('../_norman/construir');

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

async function runAsyncTest(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    return true;
  } catch (error) {
    console.log(`  ✗ ${name}`);
    console.error(`    ${error.message}`);
    return false;
  }
}

// ---------------------------------------------------------------- fixtures
const EDITAL_A = 'https://exemplo.gov.br/edital/a-professor-design';
const EDITAL_B = 'https://exemplo.gov.br/edital/b-professor-ux';
const EDITAL_C = 'https://exemplo.com/vaga/c-produto-senior';

async function main() {
  console.log('\n=== estado-colher-restaurar.test.js ===\n');
  let passed = 0, failed = 0;

  // ======================================================================
  // A. `_norman/estado.js` — funções puras
  // ======================================================================
  const testesPuros = [
    ['linhasParaMapa: linha com url vazia é ignorada', () => {
      const mapa = EST.linhasParaMapa([['', 'docente', 'TRUE', '2026-08-28', 'JB', '']]);
      assert.strictEqual(mapa.size, 0);
    }],

    ['linhasParaMapa/mapaParaLinhas: ida e volta preserva os campos de um registro real (9 colunas, Onda 5-6)', () => {
      const linhas = [[EDITAL_A, 'docente', 'TRUE', '2026-08-28', 'JB', 'nota livre', '🟣 inscrito', '2026-08-28', 'mandar e-mail de follow-up']];
      const mapa = EST.linhasParaMapa(linhas);
      assert.strictEqual(mapa.size, 1);
      const r = mapa.get(EDITAL_A);
      assert.strictEqual(r.inscrito, true);
      assert.strictEqual(r.porQuem, 'JB');
      assert.strictEqual(r.nota, 'nota livre');
      assert.strictEqual(r.estagio, '🟣 inscrito');
      assert.strictEqual(r.estagioQuando, '2026-08-28');
      assert.strictEqual(r.proximoPasso, 'mandar e-mail de follow-up');
      // LEVA 5 — linha ANTIGA (9 colunas, sem os 4 campos de C1/C3/C4) lê
      // `descartado`/`prioridade`/`por_que` como falso/vazio por ausência —
      // é o que permite uma linha de `_estado` gravada antes desta Leva
      // continuar legível sem migração.
      assert.strictEqual(r.descartado, false);
      assert.strictEqual(r.descartadoQuando, '');
      assert.strictEqual(r.prioridade, '');
      assert.strictEqual(r.porQue, '');
      // LEVA 7 — linha ANTIGA (13 colunas, sem `link_retomada`) lê o campo
      // como vazio por ausência, mesma tolerância documentada acima pra
      // `descartado`/`prioridade`/`por_que`.
      assert.strictEqual(r.linkRetomada, '');
      const linhasDeVolta = EST.mapaParaLinhas(mapa);
      assert.deepStrictEqual(linhasDeVolta, [[
        EDITAL_A, 'docente', 'TRUE', '2026-08-28', 'JB', 'nota livre', '🟣 inscrito', '2026-08-28', 'mandar e-mail de follow-up',
        'FALSE', '', '', '', ''
      ]]);
    }],

    ['colher: url NOVA + inscrito=false NÃO cria registro', () => {
      const { mapa, alterados } = EST.colher(new Map(), [{ url: EDITAL_A, trilha: 'docente', inscrito: false }], '2026-08-28');
      assert.strictEqual(mapa.size, 0, 'não marcado nunca visto antes não precisa virar linha em _estado');
      assert.strictEqual(alterados, 0);
    }],

    ['colher: url NOVA + inscrito=true cria registro com porQuem=JB e quando=agora', () => {
      const { mapa, alterados } = EST.colher(new Map(), [{ url: EDITAL_A, trilha: 'docente', inscrito: true }], '2026-08-28');
      assert.strictEqual(alterados, 1);
      const r = mapa.get(EDITAL_A);
      assert.ok(r, 'registro deveria existir');
      assert.strictEqual(r.inscrito, true);
      assert.strictEqual(r.porQuem, EST.POR_QUEM.JB);
      assert.strictEqual(r.quando, '2026-08-28');
    }],

    ['colher: url EXISTENTE com o MESMO valor fica INTOCADA (protege porQuem=robô)', () => {
      const atual = new Map([[EDITAL_A, { url: EDITAL_A, trilha: 'docente', inscrito: true, quando: '2026-08-01', porQuem: EST.POR_QUEM.ROBO, nota: 'inscrito pelo robô ontem' }]]);
      const { mapa, alterados } = EST.colher(atual, [{ url: EDITAL_A, trilha: 'docente', inscrito: true }], '2026-08-28');
      assert.strictEqual(alterados, 0, 'o check na vista não MUDOU (continua true) — colher não pode reatribuir a JB');
      const r = mapa.get(EDITAL_A);
      assert.strictEqual(r.porQuem, EST.POR_QUEM.ROBO, 'porQuem do robô sobrevive quando o valor não mudou — é o contrato da Onda 6 antecipada');
      assert.strictEqual(r.quando, '2026-08-01', 'quando também fica intocado');
    }],

    ['colher: url EXISTENTE com valor MUDADO (robô tinha marcado, JB desmarcou) vira JB', () => {
      const atual = new Map([[EDITAL_A, { url: EDITAL_A, trilha: 'docente', inscrito: true, quando: '2026-08-01', porQuem: EST.POR_QUEM.ROBO, nota: '' }]]);
      const { mapa, alterados } = EST.colher(atual, [{ url: EDITAL_A, trilha: 'docente', inscrito: false }], '2026-08-28');
      assert.strictEqual(alterados, 1, 'o valor mudou de true pra false — isso É uma ação humana na planilha');
      const r = mapa.get(EDITAL_A);
      assert.strictEqual(r.inscrito, false);
      assert.strictEqual(r.porQuem, EST.POR_QUEM.JB);
      assert.strictEqual(r.quando, '2026-08-28');
    }],

    ['colher: preserva `nota` e não sobrescreve `trilha` com string vazia', () => {
      const atual = new Map([[EDITAL_A, { url: EDITAL_A, trilha: 'docente', inscrito: false, quando: '2026-08-01', porQuem: EST.POR_QUEM.JB, nota: 'preparar carta de motivação' }]]);
      const { mapa } = EST.colher(atual, [{ url: EDITAL_A, trilha: '', inscrito: true }], '2026-08-28');
      const r = mapa.get(EDITAL_A);
      assert.strictEqual(r.nota, 'preparar carta de motivação', '`nota` é campo do JB, colher nunca escreve nela');
      assert.strictEqual(r.trilha, 'docente', 'trilha vazia na captura não apaga a trilha conhecida');
    }],

    ['colher: capturas de MÚLTIPLAS urls num único upsert', () => {
      const capturas = [
        { url: EDITAL_A, trilha: 'docente', inscrito: true },
        { url: EDITAL_B, trilha: 'docente', inscrito: false },
        { url: EDITAL_C, trilha: 'mercado', inscrito: true }
      ];
      const { mapa, alterados } = EST.colher(new Map(), capturas, '2026-08-28');
      assert.strictEqual(alterados, 2, 'só A e C viram registro (B é inscrito=false, nunca visto — não cria linha)');
      assert.strictEqual(mapa.size, 2);
      assert.strictEqual(mapa.get(EDITAL_A).trilha, 'docente');
      assert.strictEqual(mapa.get(EDITAL_C).trilha, 'mercado');
      assert.strictEqual(mapa.has(EDITAL_B), false);
    }],

    ['REGRESSÃO (achado ao vivo, prova da Onda 3-4 fechada na Onda 8-9): duas capturas da MESMA url no MESMO lote fazem OR, não last-write-wins', () => {
      // `Concursos` e `Concursos · tudo` mostram o MESMO edital (mesma url).
      // Medido ao vivo: marcar "Inscrito" em Concursos e rodar o build fazia
      // o check DESAPARECER, porque `passoColher` também lia o check de
      // `Concursos · tudo` (sempre FALSE — ninguém abre essa aba oculta) e a
      // versão antiga de `colher` aplicava as capturas na ORDEM DO ARRAY:
      // a segunda (FALSE) pisava na primeira (TRUE) dentro da MESMA chamada.
      // `Concursos · tudo` foi RETIRADA das fontes de captura logo depois
      // (achado ao vivo #2, ver `construir.js passoColher`) — este teste
      // continua valendo porque a MESMA url pode se repetir dentro de UMA
      // única fonte (ex.: um edital com duas linhas de subárea em
      // `Concursos`), e o merge por OR precisa continuar correto pra esse
      // caso.
      const capturas = [
        { url: EDITAL_A, trilha: 'docente', inscrito: true },  // Concursos: JB marcou
        { url: EDITAL_A, trilha: 'docente', inscrito: false }  // Concursos · tudo: nunca tocada
      ];
      const { mapa, alterados } = EST.colher(new Map(), capturas, '2026-08-28');
      assert.strictEqual(alterados, 1, 'uma url, um registro criado');
      assert.strictEqual(mapa.get(EDITAL_A).inscrito, true, 'TRUE de uma fonte sobrevive a FALSE de outra no MESMO lote');
    }],

    ['REGRESSÃO: a ordem inversa (FALSE antes de TRUE no array) chega ao MESMO resultado — o merge não depende de ordem', () => {
      const capturas = [
        { url: EDITAL_A, trilha: 'docente', inscrito: false },
        { url: EDITAL_A, trilha: 'docente', inscrito: true }
      ];
      const { mapa } = EST.colher(new Map(), capturas, '2026-08-28');
      assert.strictEqual(mapa.get(EDITAL_A).inscrito, true);
    }],

    ['REGRESSÃO: duas capturas da mesma url, as DUAS false, não cria registro (OR de false com false é false)', () => {
      const capturas = [
        { url: EDITAL_A, trilha: 'docente', inscrito: false },
        { url: EDITAL_A, trilha: 'docente', inscrito: false }
      ];
      const { mapa, alterados } = EST.colher(new Map(), capturas, '2026-08-28');
      assert.strictEqual(alterados, 0);
      assert.strictEqual(mapa.has(EDITAL_A), false);
    }],

    ['REGRESSÃO: o merge por lote não atropela o estado de um DIA ANTERIOR — TRUE de ontem, FALSE+FALSE hoje desmarca (JB desmarcou de verdade)', () => {
      const dia1 = EST.colher(new Map(), [{ url: EDITAL_A, trilha: 'docente', inscrito: true }], '2026-08-27').mapa;
      assert.strictEqual(dia1.get(EDITAL_A).inscrito, true);
      // No dia 2, JB desmarcou em Concursos; Concursos · tudo continua FALSE
      // como sempre — as DUAS fontes concordam hoje: false.
      const dia2 = EST.colher(dia1, [
        { url: EDITAL_A, trilha: 'docente', inscrito: false },
        { url: EDITAL_A, trilha: 'docente', inscrito: false }
      ], '2026-08-28');
      assert.strictEqual(dia2.alterados, 1);
      assert.strictEqual(dia2.mapa.get(EDITAL_A).inscrito, false, 'JB desmarcando de verdade tem que valer — o merge só protege contra a MISTURA dentro do lote');
    }],

    ['colher: não muta o Map recebido (devolve um Map NOVO)', () => {
      const original = new Map();
      const { mapa } = EST.colher(original, [{ url: EDITAL_A, trilha: 'docente', inscrito: true }], '2026-08-28');
      assert.strictEqual(original.size, 0, 'o mapaAtual passado não pode ser mutado — quem chama pode reusar o original');
      assert.notStrictEqual(mapa, original);
    }],

    ['restaurar: url desconhecida (nunca marcada) devolve false', () => {
      const mapa = new Map([[EDITAL_A, { url: EDITAL_A, inscrito: true }]]);
      assert.deepStrictEqual(EST.restaurar(mapa, [EDITAL_B]), [false]);
    }],

    ['restaurar: url vazia (linha além do dado real) devolve string vazia, não false', () => {
      const mapa = new Map();
      assert.deepStrictEqual(EST.restaurar(mapa, ['', EDITAL_A, '']), ['', false, '']);
    }],

    ['porQuemNaOrdem (item 4d): devolve porQuem só onde inscrito=true; vazio pra false/desconhecida/url vazia', () => {
      const mapa = new Map([
        [EDITAL_A, { url: EDITAL_A, inscrito: true, porQuem: EST.POR_QUEM.JB }],
        [EDITAL_B, { url: EDITAL_B, inscrito: true, porQuem: EST.POR_QUEM.ROBO }],
        [EDITAL_C, { url: EDITAL_C, inscrito: false, porQuem: EST.POR_QUEM.JB }]  // desmarcado — não deveria "vazar" o porQuem antigo
      ]);
      assert.deepStrictEqual(
        EST.porQuemNaOrdem(mapa, [EDITAL_A, EDITAL_B, EDITAL_C, 'https://desconhecida.com', '']),
        ['JB', 'robô', '', '', '']
      );
    }],

    ['isoLocal: formata AAAA-MM-DD com zero à esquerda', () => {
      assert.strictEqual(EST.isoLocal(new Date(2026, 0, 5)), '2026-01-05');
      assert.strictEqual(EST.isoLocal(new Date(2026, 11, 31)), '2026-12-31');
    }]
  ];
  for (const [name, fn] of testesPuros) { if (runTest(name, fn)) passed++; else failed++; }

  // ======================================================================
  // B. A PROVA CENTRAL — "JB marca, o dia vira, a ordem muda, o check
  //    continua no MESMO edital, não na mesma linha"
  // ======================================================================
  const testesProvaCiclo = [
    ['CICLO: 3 editais marcados sobrevivem a uma reordenação completa das linhas', () => {
      // DIA 1 — JB abre `Concursos`/`Empregos` e marca 3 caixas. As linhas
      // vêm na ordem de HOJE (por prazo/score).
      const ordemDia1 = [
        { url: EDITAL_A, trilha: 'docente' },
        { url: 'https://exemplo.gov.br/edital/nao-marcado-1', trilha: 'docente' },
        { url: EDITAL_B, trilha: 'docente' },
        { url: 'https://exemplo.gov.br/edital/nao-marcado-2', trilha: 'docente' }
      ];
      const ordemDia1Empregos = [{ url: EDITAL_C, trilha: 'mercado' }];
      const marcados = new Set([EDITAL_A, EDITAL_B, EDITAL_C]);
      const capturasDia1 = [...ordemDia1, ...ordemDia1Empregos]
        .map(x => ({ url: x.url, trilha: x.trilha, inscrito: marcados.has(x.url) }));

      // PASSO 1 (colher) do dia 1.
      const { mapa: estadoAposDia1, alterados } = EST.colher(new Map(), capturasDia1, '2026-08-28');
      assert.strictEqual(alterados, 3, 'os 3 editais marcados viram 3 registros novos');

      // DIA 2 — o robô rodou de novo, TODAY() mudou, um edital novo entrou, a
      // ordem por prazo/score EMBARALHOU tudo. Nenhum dos 3 marcados está na
      // MESMA linha de ontem.
      const urlsPainelDia2 = [
        'https://exemplo.gov.br/edital/novo-hoje',
        EDITAL_B,   // era a 3ª linha de ontem, agora é a 2ª
        'https://exemplo.gov.br/edital/nao-marcado-2',
        'https://exemplo.gov.br/edital/nao-marcado-1',
        EDITAL_A    // era a 1ª linha de ontem, agora é a última
      ];
      const urlsEmpregosDia2 = [
        'https://exemplo.com/vaga/nova-hoje',
        EDITAL_C    // desceu uma posição em Empregos
      ];

      // PASSO 3 (restaurar) do dia 2 — usa o `_estado` colhido no dia 1
      // (nunca uma leitura nova; é o mesmo Map em memória).
      const restauradoPainel = EST.restaurar(estadoAposDia1, urlsPainelDia2);
      const restauradoEmpregos = EST.restaurar(estadoAposDia1, urlsEmpregosDia2);

      // A PROVA: o índice do TRUE segue a URL, não a posição antiga.
      assert.strictEqual(restauradoPainel[urlsPainelDia2.indexOf(EDITAL_A)], true, `${EDITAL_A} continua marcado, mesmo agora na última linha`);
      assert.strictEqual(restauradoPainel[urlsPainelDia2.indexOf(EDITAL_B)], true, `${EDITAL_B} continua marcado, mesmo agora na 2ª linha`);
      assert.strictEqual(restauradoEmpregos[urlsEmpregosDia2.indexOf(EDITAL_C)], true, `${EDITAL_C} continua marcado em Empregos, mesmo tendo descido uma posição`);
      // E os NÃO marcados continuam false, inclusive o item NOVO do dia 2
      // (nunca visto por `_estado` — tem que default pra false, não crashar).
      assert.strictEqual(restauradoPainel[urlsPainelDia2.indexOf('https://exemplo.gov.br/edital/novo-hoje')], false);
      assert.strictEqual(restauradoPainel[urlsPainelDia2.indexOf('https://exemplo.gov.br/edital/nao-marcado-1')], false);
      assert.strictEqual(restauradoPainel[urlsPainelDia2.indexOf('https://exemplo.gov.br/edital/nao-marcado-2')], false);
      assert.strictEqual(restauradoEmpregos[urlsEmpregosDia2.indexOf('https://exemplo.com/vaga/nova-hoje')], false);

      // Contraprova (controle negativo): SE a implementação alinhasse por
      // POSIÇÃO em vez de por url, `restauradoPainel[0]` seria `true` (era a
      // posição de A no dia 1) — e não é.
      assert.notStrictEqual(restauradoPainel[0], true, 'controle negativo: alinhar por posição marcaria a linha 0 errada');
    }],

    ['CICLO: build seguinte (dia 3) não perde o que sobreviveu no dia 2 — o Map se acumula', () => {
      const { mapa: dia1 } = EST.colher(new Map(), [{ url: EDITAL_A, trilha: 'docente', inscrito: true }], '2026-08-27');
      // Dia 2: JB marca mais um; A continua igual (não deveria mexer em quando/porQuem de A).
      const { mapa: dia2, alterados: alteradosDia2 } = EST.colher(dia1, [
        { url: EDITAL_A, trilha: 'docente', inscrito: true },   // igual — intocado
        { url: EDITAL_B, trilha: 'docente', inscrito: true }    // novo
      ], '2026-08-28');
      assert.strictEqual(alteradosDia2, 1, 'só B é novidade no dia 2');
      assert.strictEqual(dia2.get(EDITAL_A).quando, '2026-08-27', 'A não teve o `quando` reescrito por continuar marcado');
      assert.strictEqual(dia2.get(EDITAL_B).quando, '2026-08-28');
      assert.strictEqual(dia2.size, 2);
    }]
  ];
  for (const [name, fn] of testesProvaCiclo) { if (runTest(name, fn)) passed++; else failed++; }

  // ======================================================================
  // C/D. `_norman/construir.js` — passoColher/passoRestaurar por injeção
  // ======================================================================
  const testesAssincronos = [
    ['requerer construir.js NÃO dispara main() contra rede nenhuma (guarda require.main)', async () => {
      assert.strictEqual(typeof construir.main, 'function');
      assert.strictEqual(typeof construir.passoColher, 'function');
      assert.strictEqual(typeof construir.passoRestaurar, 'function');
      // Se main() tivesse disparado no require, este processo já teria
      // tentado autenticar contra o Google e travado/estourado muito antes
      // de chegar aqui — chegar até este ponto já é parte da prova.
    }],

    ['D1 — passoColher REJEITA quando a leitura falha, e NADA é escrito (aborta antes do limpar)', async () => {
      const chamadas = { escrever: 0, escreverVarios: 0 };
      const apiQuebrado = {
        lerVarios: async () => { throw new Error('HTTP 503 simulado — planilha fora do ar'); },
        escrever: async () => { chamadas.escrever++; },
        escreverVarios: async () => { chamadas.escreverVarios++; }
      };
      await assert.rejects(
        () => construir.passoColher(apiQuebrado),
        /503 simulado/,
        'passoColher precisa propagar o erro de leitura, não engolir'
      );
      assert.strictEqual(chamadas.escrever, 0, 'nenhuma escrita em _estado quando a leitura falhou');
      assert.strictEqual(chamadas.escreverVarios, 0);
    }],

    ['passoColher: upsert real via api dublê + só regrava _estado quando há alteração', async () => {
      const escritas = [];
      const api = {
        lerVarios: async (faixas) => {
          // ACHADO AO VIVO (Onda 3-4 fechada na Onda 8-9): `Concursos · tudo`
          // SAIU das fontes de captura. LEVA 5 (C1/C3/C4) acrescenta o `❌`
          // de Concursos/Empregos (+1 cada) e `⭐`/`por quê` de Candidaturas
          // (+2). LEVA 7 acrescenta `link retomada` de Candidaturas (+1): 2
          // trincas url/check/descarte (Concursos, Empregos) = 6 + 7 campos
          // de Candidaturas (_url/estágio/próximo passo/notas/⭐/por quê/
          // link retomada) + 1 faixa de `_estado` = 14.
          assert.strictEqual(faixas.length, 14, 'passoColher lê 2 trincas de Concursos/Empregos (url/check/❌) + 7 campos de Candidaturas + 1 faixa de _estado');
          return [
            [[EDITAL_A]], [['TRUE']], [['FALSE']],    // Concursos: url + check + ❌
            [[EDITAL_C]], [['FALSE']], [['FALSE']],   // Empregos: url + check + ❌
            [], [], [], [], [], [], [],               // Candidaturas: _url/estágio/próximo passo/notas/⭐/por quê/link retomada — vazia (aba nova)
            []                                         // _estado vazio (primeira vez)
          ];
        },
        escrever: async (range, valores) => { escritas.push({ range, valores }); },
        escreverVarios: async () => { throw new Error('não deveria ser chamado por passoColher'); }
      };
      const resultado = await construir.passoColher(api);
      // 2 alterações: A vira registro novo (inscrito) + A ganha o estágio
      // default (📨 inscrito, Leva 5) na MESMA passada — duas contagens, uma
      // regravação (a soma só decide SE regrava, não QUANTAS vezes).
      assert.strictEqual(resultado.alterados, 2, 'A novo (inscrito) + A com estágio default — C é false e nunca visto, não conta');
      assert.strictEqual(resultado.mapa.get(EDITAL_A).inscrito, true);
      assert.strictEqual(resultado.mapa.get(EDITAL_A).estagio, '📨 inscrito', 'candidatura nova nasce no primeiro estágio do funil (Leva 5)');
      assert.strictEqual(escritas.length, 1, 'regravou _estado exatamente uma vez, porque alterados > 0');
    }],

    ['passoColher: NÃO regrava _estado quando nada mudou (alterados=0)', async () => {
      let escreveuAlgumaVez = false;
      const api = {
        lerVarios: async () => [
          [[EDITAL_A]], [['FALSE']], [['FALSE']],
          [], [], [],
          [], [], [], [], [], [], [],
          []
        ],
        escrever: async () => { escreveuAlgumaVez = true; },
        escreverVarios: async () => { escreveuAlgumaVez = true; }
      };
      const resultado = await construir.passoColher(api);
      assert.strictEqual(resultado.alterados, 0);
      assert.strictEqual(escreveuAlgumaVez, false, 'zero alterações não deveria gastar nenhuma escrita');
    }],

    ['REGRESSÃO AO VIVO: Concursos·tudo NÃO é mais fonte de captura — um "eco" de TRUE lá não bloqueia o desmarque feito em Concursos', async () => {
      // Reproduz o bug medido ao vivo: `_estado` já tem A inscrito=true (o
      // build anterior espelhou isso em Concursos·tudo via passoRestaurar).
      // JB desmarca em Concursos (a ÚNICA aba que ele abre). O mock de
      // Concursos·tudo nem aparece mais aqui — se `passoColher` ainda a
      // lesse, este teste pegaria via `faixas.length`. `_estado` traz o
      // valor LEGADO `🟣 inscrito` — prova, de brinde, que a migração de
      // C2 não interfere no desmarque (só toca `estagio`).
      const api = {
        lerVarios: async (faixas) => {
          assert.strictEqual(faixas.length, 14);
          return [
            [[EDITAL_A]], [['FALSE']], [['FALSE']],  // Concursos: JB desmarcou, ❌ vazio
            [], [], [],                              // Empregos: vazia
            [], [], [], [], [], [], [],               // Candidaturas: vazia (inclui link retomada, Leva 7)
            [[EDITAL_A, 'docente', 'TRUE', '2026-08-27', 'JB', '', '🟣 inscrito', '2026-08-27', '']]  // _estado já tinha A inscrito=true, estágio legado
          ];
        },
        escrever: async () => {}
      };
      const resultado = await construir.passoColher(api);
      assert.strictEqual(resultado.mapa.get(EDITAL_A).inscrito, false, 'o desmarque em Concursos tem que valer — nada mais deveria "lembrar" TRUE');
      assert.strictEqual(resultado.mapa.get(EDITAL_A).estagio, '📨 inscrito', 'o valor legado migra pro vocabulário novo, mesmo numa passada que só mexe em inscrito');
    }],

    ['passoRestaurar: escreve valores alinhados à url LIDA (ordem nova), não à ordem antiga do mapa — inclui _por_quem (item 4d)', async () => {
      const mapa = new Map([
        [EDITAL_A, { url: EDITAL_A, inscrito: true, porQuem: 'JB' }],
        [EDITAL_C, { url: EDITAL_C, inscrito: true, porQuem: 'robô' }]
      ]);
      const escritas = [];
      const api = {
        lerVarios: async (faixas) => {
          assert.strictEqual(faixas.length, 4, 'passoRestaurar lê a _url de Concursos, Concursos · tudo, Empregos e Candidaturas');
          return [
            [['https://exemplo.gov.br/edital/outro'], [EDITAL_A]],  // Concursos: A na 2ª linha agora
            [[EDITAL_A]],                                            // Concursos · tudo
            [[EDITAL_C], ['https://exemplo.com/vaga/outra']],         // Empregos: C na 1ª linha
            []                                                        // Candidaturas: vazia nesta prova
          ];
        },
        escreverVarios: async (pares) => { escritas.push(...pares); },
        // Onda 5 — `passoRestaurar` limpa `Candidaturas!estágio:notas` antes
        // de reescrever (proteção contra a aba ENCOLHER e deixar valor
        // órfão — ver comentário no próprio `construir.js`).
        limpar: async () => {}
      };
      const resultado = await construir.passoRestaurar(api, mapa);
      assert.strictEqual(resultado.linhasPainel, 2);
      assert.strictEqual(resultado.linhasEmpregos, 2);
      // ONDA UX 13 (Leva 3) — `Inscrito` mudou de coluna L (última, ~1162 px)
      // pra B (logo depois de `Abrir`, ver `DOCENTE_CABECALHO` em
      // formulas.js). A faixa escrita de Concursos!B tem 2 valores:
      // [false, true] — A não está na 1ª linha desta rodada, está na 2ª.
      const faixaInscritoPainel = escritas.find(([range]) => range.startsWith('Concursos!B'));
      assert.ok(faixaInscritoPainel, 'deveria existir uma escrita em Concursos!B (Inscrito)');
      assert.deepStrictEqual(faixaInscritoPainel[1], [[false], [true]], 'A é a 2ª url lida, então o TRUE tem que estar na 2ª posição, não na 1ª');

      // ONDA UX 14/E2 — `Subedital` entrou entre `Subárea` e `_url`, então
      // `_por_quem` (item 4d) empurrou de M pra N. A faixa tem que carregar
      // 'JB' na MESMA posição em que Inscrito é true — nunca 'robô', que é de C.
      const faixaPorQuemPainel = escritas.find(([range]) => range.startsWith('Concursos!N'));
      assert.ok(faixaPorQuemPainel, 'deveria existir uma escrita em Concursos!N (_por_quem)');
      assert.deepStrictEqual(faixaPorQuemPainel[1], [[''], ['JB']]);

      // MERCADO_CABECALHO: `Inscrito` entrou em B (Onda 13); `link
      // (copiar)`=K, `_por_quem`=L — a contagem de colunas não mudou (12),
      // então `_por_quem` continua na MESMA letra final (L).
      const faixaPorQuemEmpregos = escritas.find(([range]) => range.startsWith('Empregos!L'));
      assert.ok(faixaPorQuemEmpregos, 'deveria existir uma escrita em Empregos!L (_por_quem, cabeçalho mercado)');
      assert.deepStrictEqual(faixaPorQuemEmpregos[1], [['robô'], ['']], 'C (robô) está na 1ª linha de Empregos nesta rodada');
    }]
  ];
  for (const [name, fn] of testesAssincronos) { if (await runAsyncTest(name, fn)) passed++; else failed++; }

  // ======================================================================
  // D2 — ordem no CÓDIGO-FONTE: colher antes do limpar, restaurar depois da
  // escrita única. Regressão barata contra alguém reordenar `main()` sem
  // perceber que isso reabre o modo de falha que este arquivo existe pra
  // fechar.
  // ======================================================================
  const testeOrdemFonte = () => {
    const src = fs.readFileSync(path.join(__dirname, '..', '_norman', 'construir.js'), 'utf8');
    const marcadores = {
      colher: 'const resultadoColher = await passoColher(a);',
      limpar: 'for (const t of LEITURA) await a.limpar(R(t));',
      escritaUnica: 'const resp = await a.escreverVarios(escritas);',
      restaurar: 'const resultadoRestaurar = await passoRestaurar(a, resultadoColher.mapa);'
    };
    const ix = Object.fromEntries(Object.entries(marcadores).map(([k, s]) => [k, src.indexOf(s)]));
    for (const [k, i] of Object.entries(ix)) {
      assert.ok(i >= 0, `marcador "${k}" não encontrado em construir.js — o teste de ordem ficou cego (o código mudou de forma; atualize os marcadores)`);
    }
    assert.ok(ix.colher < ix.limpar, 'passoColher() precisa aparecer ANTES do limpar() no código-fonte de main()');
    assert.ok(ix.escritaUnica < ix.restaurar, 'passoRestaurar() precisa aparecer DEPOIS da escrita única (a ordem nova só existe depois dela)');
  };
  if (runTest('D2 — ordem no código-fonte: colher < limpar < escritaUnica < restaurar', testeOrdemFonte)) passed++; else failed++;

  console.log(`\n${passed} passou, ${failed} falhou\n`);
  process.exit(failed ? 1 : 0);
}

main();
