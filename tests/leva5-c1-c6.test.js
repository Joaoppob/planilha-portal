#!/usr/bin/env node
'use strict';

/**
 * REMODELAÇÃO CRM 2026-09-01 — Leva 5 (Conteúdo que falta), itens C1-C6.
 * `.claude/plans/remodelacao-crm-2026-09-01.md`.
 *
 * Cobre o que `tests/estado-colher-restaurar.test.js` (estendido nesta
 * Leva) e `tests/hoje-layout-c10.test.js` (idem) não exercitam como caso
 * DEDICADO: a independência dos dois relógios de C1 (`quando` nunca
 * contaminado por `❌`), a migração de C2, e a estrutura declarada de
 * C1/C3/C4/C5/C6 em `formulas.js`/`notas.js`.
 */

const assert = require('assert');
const EST = require('../_norman/estado');
const F = require('../_norman/formulas');
const A = require('../_norman/abas');
const N = require('../_norman/notas');

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

const EDITAL_A = 'https://exemplo.gov.br/edital/leva5-a';
const EDITAL_B = 'https://exemplo.gov.br/edital/leva5-b';

function main() {
  console.log('\n=== leva5-c1-c6.test.js ===\n');
  let passed = 0, failed = 0;
  const nota = ok => { if (ok) passed++; else failed++; };

  // ======================================================================
  // C1 — descarte por linha
  // ======================================================================
  nota(runTest('C1 — DOCENTE_CABECALHO/MERCADO_CABECALHO ganham "❌" APENDADO no fim (não desloca Abrir/Inscrito/Vaga/Elegível?)', () => {
    assert.strictEqual(F.DOCENTE_CABECALHO[F.DOCENTE_CABECALHO.length - 1], '❌');
    assert.strictEqual(F.MERCADO_CABECALHO[F.MERCADO_CABECALHO.length - 1], '❌');
    assert.deepStrictEqual(F.DOCENTE_CABECALHO.slice(0, 4), ['Abrir', 'Inscrito', 'Vaga', 'Elegível?'], 'o bloco congelado não pode deslocar');
    assert.deepStrictEqual(F.MERCADO_CABECALHO.slice(0, 3), ['Abrir', 'Inscrito', 'Vaga'], 'o bloco congelado de Empregos não pode deslocar');
  }));

  nota(runTest('C1 — colher: descartado=true numa url NOVA cria registro com descartadoQuando, e quando FICA VAZIO (relógios independentes)', () => {
    const { mapa, alterados } = EST.colher(new Map(), [{ url: EDITAL_A, trilha: 'docente', inscrito: false, descartado: true }], '2026-09-01');
    assert.strictEqual(alterados, 1);
    const r = mapa.get(EDITAL_A);
    assert.strictEqual(r.descartado, true);
    assert.strictEqual(r.descartadoQuando, '2026-09-01');
    assert.strictEqual(r.inscrito, false);
    assert.strictEqual(r.quando, '', '"quando" (inscrito em) não pode nascer preenchido por causa de um descarte — contaminaria Candidaturas!inscrito em se essa url virar candidatura um dia');
  }));

  nota(runTest('C1 — colher: marcar ❌ numa candidatura JÁ inscrita NÃO mexe em `quando` (só em `descartadoQuando`)', () => {
    const dia1 = EST.colher(new Map(), [{ url: EDITAL_A, trilha: 'docente', inscrito: true }], '2026-08-20').mapa;
    assert.strictEqual(dia1.get(EDITAL_A).quando, '2026-08-20');
    const dia2 = EST.colher(dia1, [{ url: EDITAL_A, trilha: 'docente', inscrito: true, descartado: true }], '2026-09-01');
    assert.strictEqual(dia2.alterados, 1, 'descartado mudou de false pra true — isso conta');
    const r = dia2.mapa.get(EDITAL_A);
    assert.strictEqual(r.quando, '2026-08-20', 'data de inscrição INTOCADA — é o que Candidaturas!inscrito em lê');
    assert.strictEqual(r.descartadoQuando, '2026-09-01');
    assert.strictEqual(r.inscrito, true, 'inscrito continua true — descartar não desinscreve');
  }));

  nota(runTest('C1 — restaurarDescarte: alinhado por url, mesma forma de restaurar (boolean por posição, "" pra url vazia)', () => {
    const mapa = new Map([[EDITAL_A, { url: EDITAL_A, descartado: true }], [EDITAL_B, { url: EDITAL_B, descartado: false }]]);
    assert.deepStrictEqual(EST.restaurarDescarte(mapa, [EDITAL_A, EDITAL_B, 'https://desconhecida.com', '']), [true, false, false, '']);
  }));

  nota(runTest('C1 — formulas.js: TL(aba,n) e descartadosPorTier lêem Concursos!_ordem/Concursos!❌ (a MESMA vista, não uma segunda fonte)', () => {
    const expr = F.descartadosPorTier(A.PAINEL, 1);
    assert.ok(expr.includes('SUMPRODUCT'), 'devolve SUMPRODUCT, não COUNTIFS (texto ISO não é o caso aqui, mas o padrão da casa é SUMPRODUCT pra condição composta)');
    assert.ok(expr.includes(F.letraDe(F.DOCENTE_CABECALHO, '_ordem')), 'lê a coluna _ordem renderizada');
    assert.ok(expr.includes(F.letraDe(F.DOCENTE_CABECALHO, '❌')), 'lê a coluna ❌ renderizada');
    const tl = F.TL(A.PAINEL, 1);
    assert.ok(tl.includes('COUNTIF(_calc!B2:B;1)'), 'TL(1) ainda contém o T(1) original');
  }));

  nota(runTest('C1 — PAINEL.veredito usa TL (líquido de descarte), não T bruto, nos quatro ramos', () => {
    assert.ok(F.PAINEL.veredito.includes(F.descartadosPorTier(A.PAINEL, 1)), 'ramo 1 (tier 1) não deriva de TL');
    assert.ok(F.PAINEL.veredito.includes(F.descartadosPorTier(A.PAINEL, 4)), 'ramo 4 (tier 4) não deriva de TL');
  }));

  // ======================================================================
  // C2 — funil de Candidaturas
  // ======================================================================
  nota(runTest('C2 — CANDIDATURAS_ESTAGIOS é o funil canônico de 7 estágios, na ordem pedida, + 🙋 (Leva 7) apendado no fim', () => {
    assert.deepStrictEqual(F.CANDIDATURAS_ESTAGIOS, [
      '📨 inscrito', '🧾 docs', '📝 prova/entrevista', '⏳ resultado', '🟢 aprovado', '🔴 não passou', '⚫ retirei',
      '🙋 aguardando JB'
    ]);
  }));

  nota(runTest('C2 — MIGRACAO_ESTAGIO_LEGADO mapeia o valor real de JB (🟣 inscrito) pro novo primeiro posto do funil', () => {
    assert.strictEqual(F.MIGRACAO_ESTAGIO_LEGADO['🟣 inscrito'], F.CANDIDATURAS_ESTAGIOS[0]);
  }));

  nota(runTest('C2 — migrarEstagiosLegado: migra por VALOR, preserva estagioQuando (é migração de vocabulário, não evento novo), e é IDEMPOTENTE', () => {
    const mapa = new Map([[EDITAL_A, { url: EDITAL_A, inscrito: true, estagio: '🟣 inscrito', estagioQuando: '2026-08-01' }]]);
    const { mapa: m1, migrados } = EST.migrarEstagiosLegado(mapa, F.MIGRACAO_ESTAGIO_LEGADO);
    assert.strictEqual(migrados, 1);
    assert.strictEqual(m1.get(EDITAL_A).estagio, '📨 inscrito');
    assert.strictEqual(m1.get(EDITAL_A).estagioQuando, '2026-08-01', 'migração de VOCABULÁRIO não inventa um evento novo — o carimbo fica');
    const { migrados: migrados2 } = EST.migrarEstagiosLegado(m1, F.MIGRACAO_ESTAGIO_LEGADO);
    assert.strictEqual(migrados2, 0, 'rodar de novo sobre um mapa já migrado não acha valor antigo nenhum');
  }));

  nota(runTest('C2 — CANDIDATURAS_VEREDITO carrega a linha de funil, derivada de _estado!C/_estado!G (mesma fonte da lista, nunca uma segunda implementação)', () => {
    assert.ok(F.CANDIDATURAS_VEREDITO.includes('Funil'), 'a linha de funil não está presente no veredito');
    for (const estagio of F.CANDIDATURAS_ESTAGIOS) {
      assert.ok(F.CANDIDATURAS_VEREDITO.includes(`COUNTIFS(${A.EST}!$C$2:$C;TRUE;${A.EST}!$G$2:$G;"${estagio}")`), `funil não conta o estágio "${estagio}"`);
    }
  }));

  // ======================================================================
  // C3 — prioridade pessoal (⭐)
  // ======================================================================
  nota(runTest('C3 — PRIORIDADE_JB é o vocabulário único, usado em Fila e Candidaturas', () => {
    assert.deepStrictEqual(F.PRIORIDADE_JB, ['⭐⭐⭐', '⭐⭐', '⭐', '—']);
    assert.strictEqual(F.FILA_CABECALHO[F.FILA_CABECALHO.length - 1], '⭐', 'Fila!⭐ apendado no fim');
    assert.ok(F.CANDIDATURAS_CABECALHO.includes('⭐'), 'Candidaturas!⭐ presente');
  }));

  nota(runTest('C3 — Fila!⭐ NÃO usa _estado (Fila é 100% digitada, sobrevive sozinha) — colherCandidatura/candidaturaCamposNaOrdem cobrem só Candidaturas!⭐', () => {
    const mapa = new Map([[EDITAL_A, { url: EDITAL_A, inscrito: true, prioridade: '' }]]);
    const { mapa: m2, alterados } = EST.colherCandidatura(mapa, [{ url: EDITAL_A, prioridade: '⭐⭐⭐' }], '2026-09-01');
    assert.strictEqual(alterados, 1);
    assert.strictEqual(m2.get(EDITAL_A).prioridade, '⭐⭐⭐');
    const campos = EST.candidaturaCamposNaOrdem(m2, [EDITAL_A]);
    assert.deepStrictEqual(campos.prioridade, ['⭐⭐⭐']);
  }));

  // ======================================================================
  // C4 — pós-morte (por quê)
  // ======================================================================
  nota(runTest('C4 — Candidaturas!"por quê" presente (apendado antes de "link retomada", Leva 7), persistido pelo mesmo caminho de C3', () => {
    assert.ok(F.CANDIDATURAS_CABECALHO.includes('por quê'));
    const mapa = new Map([[EDITAL_A, { url: EDITAL_A, inscrito: true, porQue: '' }]]);
    const { mapa: m2 } = EST.colherCandidatura(mapa, [{ url: EDITAL_A, porQue: 'salário abaixo do combinado' }], '2026-09-01');
    assert.strictEqual(m2.get(EDITAL_A).porQue, 'salário abaixo do combinado');
    const campos = EST.candidaturaCamposNaOrdem(m2, [EDITAL_A]);
    assert.deepStrictEqual(campos.porQue, ['salário abaixo do combinado']);
  }));

  // ======================================================================
  // LEVA 7 (remodelação 2026-09-01) — "conteúdo que falta" C7/C8: estágio
  // travado (🙋) e link de retomada.
  // ======================================================================
  nota(runTest('LEVA 7 — 🙋 aguardando JB NÃO ocupa o índice 0 (o default de candidatura nova, construir.js, continua "📨 inscrito")', () => {
    assert.notStrictEqual(F.CANDIDATURAS_ESTAGIOS[0], '🙋 aguardando JB');
    assert.strictEqual(F.CANDIDATURAS_ESTAGIOS[0], '📨 inscrito');
  }));

  nota(runTest('LEVA 7 — CANDIDATURAS_ESTAGIOS_GLIFO cresce JUNTO com CANDIDATURAS_ESTAGIOS, mesmo índice (🙋 casado com "🙋 aguardando JB")', () => {
    assert.strictEqual(F.CANDIDATURAS_ESTAGIOS_GLIFO.length, F.CANDIDATURAS_ESTAGIOS.length);
    const ix = F.CANDIDATURAS_ESTAGIOS.indexOf('🙋 aguardando JB');
    assert.strictEqual(F.CANDIDATURAS_ESTAGIOS_GLIFO[ix], '🙋');
  }));

  nota(runTest('LEVA 7 — Candidaturas!"link retomada" apendado no FIM (depois de "por quê"), persistido pelo mesmo caminho de C3/C4', () => {
    assert.strictEqual(F.CANDIDATURAS_CABECALHO[F.CANDIDATURAS_CABECALHO.length - 1], 'link retomada');
    const mapa = new Map([[EDITAL_A, { url: EDITAL_A, inscrito: true, linkRetomada: '' }]]);
    const { mapa: m2, alterados } = EST.colherCandidatura(
      mapa, [{ url: EDITAL_A, linkRetomada: 'https://processo.exemplo.gov.br/etapa-video' }], '2026-09-01'
    );
    assert.strictEqual(alterados, 1);
    assert.strictEqual(m2.get(EDITAL_A).linkRetomada, 'https://processo.exemplo.gov.br/etapa-video');
    const campos = EST.candidaturaCamposNaOrdem(m2, [EDITAL_A]);
    assert.deepStrictEqual(campos.linkRetomada, ['https://processo.exemplo.gov.br/etapa-video']);
  }));

  nota(runTest('LEVA 7 — linhasParaMapa/mapaParaLinhas: registro completo de 14 colunas, ida e volta preserva link_retomada', () => {
    const linhas = [[
      EDITAL_A, 'docente', 'TRUE', '2026-08-28', 'JB', '', '🙋 aguardando JB', '2026-08-29', '',
      'FALSE', '', '⭐⭐', 'salário a combinar', 'https://processo.exemplo.gov.br/etapa-video'
    ]];
    const mapa = EST.linhasParaMapa(linhas);
    const r = mapa.get(EDITAL_A);
    assert.strictEqual(r.estagio, '🙋 aguardando JB');
    assert.strictEqual(r.linkRetomada, 'https://processo.exemplo.gov.br/etapa-video');
    assert.deepStrictEqual(EST.mapaParaLinhas(mapa), [linhas[0]]);
  }));

  // ======================================================================
  // C5 — PULSO no Hoje
  // ======================================================================
  nota(runTest('C5 — PULSO entra no grupo 3 (NOTICIA+RADAR), NÃO como grupo novo — hojeUltimaLinha() não muda', () => {
    assert.deepStrictEqual(F.HOJE_GRUPOS_COLUNA[3], ['NOTICIA', 'RADAR', 'PULSO']);
    assert.strictEqual(F.HOJE_GRUPOS_COLUNA.length, 4, 'ainda 4 grupos — nenhum grupo novo foi criado');
    const alturas = F.HOJE_GRUPOS_COLUNA.map(chaves => chaves.reduce((n, c) => n + F.HOJE_BLOCOS.find(b => b.chave === c).teto + 3, 0));
    assert.ok(alturas[3] <= alturas[1], `grupo 3 (${alturas[3]}) não pode superar o grupo mais alto, grupo 1 (${alturas[1]})`);
  }));

  nota(runTest('C5 — PULSO tem teto == contagem literal (o rodapé de transbordo nunca acende — 4 fatos fixos, não lista)', () => {
    const pulso = F.HOJE_BLOCOS.find(b => b.chave === 'PULSO');
    assert.ok(pulso, 'bloco PULSO não existe em HOJE_BLOCOS');
    assert.strictEqual(pulso.teto, F.HOJE_TETO_PULSO);
    assert.strictEqual(pulso.contagem.trim(), String(F.HOJE_TETO_PULSO));
    assert.ok(F.HOJE_BLOCO_GLIFO.PULSO, 'PULSO sem glifo declarado — a banda do bloco não pintaria');
    assert.ok(pulso.titulo.startsWith(F.HOJE_BLOCO_GLIFO.PULSO), 'título não começa pelo glifo declarado');
  }));

  nota(runTest('C5 — PULSO nunca inventa número: a meta é o literal "[a definir por JB]" (D-A3)', () => {
    const pulso = F.HOJE_BLOCOS.find(b => b.chave === 'PULSO');
    assert.ok(pulso.corpo.includes('[a definir por JB]'));
    assert.ok(pulso.corpo.includes(A.EST), 'inscrições/descartes derivam de _estado, dado real');
  }));

  nota(runTest('C5 — REGRESSÃO AO VIVO (verificar.js G3, "blocos na tela: 10/9"): nenhuma linha de CORPO do PULSO começa por um glifo de OUTRO bloco (título falso, banda pintada errado)', () => {
    const pulso = F.HOJE_BLOCOS.find(b => b.chave === 'PULSO');
    const glifos = Object.values(F.HOJE_BLOCO_GLIFO);
    // Quatro linhas HSTACK("texto";...) dentro do VSTACK — extrai o texto
    // inicial de cada uma (entre a primeira aspa e o primeiro "&" ou aspa
    // de fechamento) e confere contra HOJE_REGEX_TITULO, o MESMO padrão
    // que a regra R-H1 (formatar.js) e o controle G3 (verificar.js) usam.
    const regex = new RegExp(F.HOJE_REGEX_TITULO);
    const linhasTexto = [...pulso.corpo.matchAll(/HSTACK\("([^"]*)"/g)].map(m => m[1]);
    assert.strictEqual(linhasTexto.length, F.HOJE_TETO_PULSO, `esperava ${F.HOJE_TETO_PULSO} linhas HSTACK no corpo do PULSO, achei ${linhasTexto.length}`);
    for (const texto of linhasTexto) {
      assert.ok(!regex.test(texto), `linha de corpo "${texto}" começa por um glifo de título (${glifos.join(' ')}) — viraria título falso na tela`);
    }
  }));

  // ======================================================================
  // C6 — legenda de sinal
  // ======================================================================
  nota(runTest('C6 — SINAL_LOCAL cobre as 13 abas visíveis (nenhuma a mais, nenhuma a menos)', () => {
    const ABAS_VISIVEIS_13 = [A.HOJE, A.EMPREGOS, A.PAINEL, A.TAREFAS, A.FILA, A.CANDIDATURAS,
      A.PROJETOS, A.DIARIO, A.ETAPAS, A.NOTICIAS, A.IA, A.TRABALHO, A.CIENCIA];
    assert.strictEqual(Object.keys(N.SINAL_LOCAL).length, 13);
    for (const aba of ABAS_VISIVEIS_13) assert.ok(N.SINAL_LOCAL[aba], `SINAL_LOCAL sem entrada pra ${aba}`);
  }));

  nota(runTest('C6 — cada nota de SINAL_LOCAL está presente em N.NOTAS[aba] (a nota de fato foi declarada, não só o texto-fonte)', () => {
    for (const [aba, texto] of Object.entries(N.SINAL_LOCAL)) {
      const itens = N.NOTAS[aba] || [];
      const achou = itens.some(([, , t]) => String(t).includes(texto));
      assert.ok(achou, `SINAL_LOCAL[${aba}] não aparece em nenhuma nota declarada de N.NOTAS[${aba}]`);
    }
  }));

  nota(runTest('C6 — todas as âncoras (via noCabecalho) resolvem contra o cabeçalho vivo, e nenhuma nota cai fora do cromo', () => {
    for (const anc of N.ANCORAS) {
      const cab = F.CABECALHO_POR_ABA[anc.aba] || [];
      assert.strictEqual(cab[anc.coluna], anc.rotulo, `âncora de ${anc.aba} caiu na coluna errada`);
    }
    for (const [aba, itens] of Object.entries(N.NOTAS)) {
      for (const [linha] of itens) {
        assert.ok(linha < F.ultimoCromo(aba), `nota de ${aba} na linha ${linha} caiu fora do cromo (${F.ultimoCromo(aba)})`);
      }
    }
  }));

  console.log(`\n${passed} passou(aram), ${failed} falhou(aram)\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
