#!/usr/bin/env node
'use strict';

/**
 * Auditoria de redundância/duplicata — item 2a do briefing original (Onda 2
 * da radar-crm-20-ondas.md), FECHADA pela Onda UX 14 + emenda E2 (Leva 3 da
 * remodelação 2026-09-01, `.claude/plans/remodelacao-crm-2026-09-01.md`).
 *
 * O QUE ESTE TESTE FAZ: define e testa a REGRA de auditoria de duplicata
 * VISUAL usada pra medir `data/store.jsonl` real — não reimplementa nada de
 * `_norman/` nem de `lib/`; é pura leitura dos CAMPOS já públicos do schema
 * (`lib/schema.js`: orgao, campus, area, subarea, subedital, url).
 *
 * A REGRA (PÓS-FIX): dois (ou mais) registros do MESMO edital (mesma `url` —
 * guarda-chuva, ver lib/store.js) que compartilham a MESMA tupla VISÍVEL na
 * vista `Concursos`/`Concursos · tudo` são INDISTINGUÍVEIS na planilha. Até
 * a Onda 14, essa tupla era `orgao+campus+area+subarea` — 4 grupos/11
 * registros de `Concursos` (23% da vista, medido em 28/08/2026) eram
 * duplicata visual, porque `subarea` é uma classificação por BALDE de
 * palavra-chave (`lib/keyword-filtro.js`/`lib/subedital-extrator.js`,
 * pensada como FILTRO, não como rótulo distintivo) e a vista não expunha
 * `subedital` (o campo que de fato distingue) como desempate.
 *
 * O CONSERTO (Onda 14 + E2, `_norman/formulas.js` `DOCENTE_VITRINE`/
 * `DOCENTE_CABECALHO`, ~linha 827): `Subedital` entrou como coluna VISÍVEL
 * na vista (entre `Subárea` e `_url`). A tupla que este arquivo audita
 * cresce de 4 para 5 campos — `orgao+campus+area+subarea+subedital` — e ela
 * SEMPRE distingue dentro de um guarda-chuva: `subedital` é parte do hash de
 * `id` (`lib/hash.js gerarId`: `[orgao, area, data_publicacao, url,
 * subedital]`), então dois registros da MESMA url com o MESMO `subedital`
 * teriam colidido no dedupe do store ANTES de chegar aqui — é
 * estruturalmente impossível dois registros distintos, na mesma url,
 * compartilharem `subedital`. Por isso a regra pós-fix é garantida em 0
 * grupos, não só medida em 0 hoje.
 *
 * NÃO USADO NESTE CONSERTO (fronteira da emenda E2, respeitada): nem
 * `resolverDuplicataEntreAbas` (pipeline de notícia, domínio errado) nem
 * `node radar.js reprocessar` (reclassificaria `subarea`/`subedital` no
 * store — a emenda determinou que a causa é a VISTA, não o store, e a
 * exibição já basta). `lib/subedital-extrator.js`/`lib/keyword-filtro.js`
 * PERMANECEM intocados.
 *
 * ACHADO ORIGINAL (pré-fix, preservado como referência histórica) — medido
 * contra `data/store.jsonl` (829 registros, 230 docentes) e confirmado na
 * vista ao vivo (`Concursos!A1:K52`, 28/08/2026): UEL e UFSJ eram
 * LEGÍTIMOS (subárea já diferia); UEM (3 subeditais colapsando em
 * "Computação") e UFSCar (São Carlos ×4, Sorocaba ×2, São José do Rio Preto
 * ×2, do edital nº 4/2026) eram DEFEITO — 4 grupos/11 registros no total.
 * Ver `RELATORIO-ONDA-1-2.md` §2a para a tabela completa.
 */

const assert = require('assert');
const fs = require('fs');
const store = require('../lib/store');

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

/**
 * Agrupa registros docentes por `url` (guarda-chuva) e, dentro de cada
 * guarda-chuva, pela tupla VISÍVEL na vista `Concursos`/`Concursos · tudo`
 * pós Onda 14/E2 — `orgao|campus|area|subarea|subedital`. Devolve os grupos
 * com 2+ registros na MESMA tupla — a assinatura de duplicata visual.
 */
function auditarDuplicataVisualGuardaChuva(registros) {
  const porUrl = new Map();
  for (const r of registros) {
    if (!r.url) continue;
    if (!porUrl.has(r.url)) porUrl.set(r.url, []);
    porUrl.get(r.url).push(r);
  }

  const guardaChuvas = [...porUrl.entries()].filter(([, lista]) => lista.length > 1);
  const gruposDuplicataVisual = [];

  for (const [url, lista] of guardaChuvas) {
    const porTupla = new Map();
    for (const r of lista) {
      // Onda 14/E2 — `subedital` entra na tupla: é o campo que a vista
      // agora expõe como desempate.
      const chave = [r.orgao, r.campus, r.area, r.subarea, r.subedital].join('|');
      if (!porTupla.has(chave)) porTupla.set(chave, []);
      porTupla.get(chave).push(r);
    }
    for (const [chave, regsIguais] of porTupla) {
      if (regsIguais.length > 1) {
        gruposDuplicataVisual.push({ url, chave, registros: regsIguais });
      }
    }
  }

  return { totalGuardaChuvas: guardaChuvas.length, gruposDuplicataVisual };
}

// --- fixtures sintéticas, replicando os padrões reais medidos ---

function registrosUEL() {
  // Legítimo mesmo antes do fix: subárea DIFERE (Ciência de Dados vs
  // Inteligência Artificial).
  const base = { orgao: 'UEL - Universidade Estadual de Londrina', campus: null, area: 'Computação/IA', url: 'https://exemplo/uel' };
  return [
    { ...base, subarea: 'Ciência de Dados', subedital: 'PROFESSOR - CIÊNCIA DE DADOS' },
    { ...base, subarea: 'Inteligência Artificial', subedital: 'PROFESSOR - INTELIGÊNCIA ARTIFICIAL' }
  ];
}

function registrosUEM() {
  // Era DEFEITO (3 subeditais distintos, mesma subárea "Computação" —
  // padrão medido no store real, linhas 17-19 da vista ao vivo pré-fix).
  // Pós Onda 14/E2, `subedital` entra na tupla e os 3 se distinguem.
  const base = { orgao: 'UEM - Universidade Estadual de Maringá', campus: null, area: 'Computação/IA', subarea: 'Computação', url: 'https://exemplo/uem' };
  return [
    { ...base, subedital: 'PROFESSOR COLABORADOR - CIÊNCIA DA COMPUTAÇÃO' },
    { ...base, subedital: 'PROFESSOR COLABORADOR - CIÊNCIA DA COMPUTAÇÃO/ALGORITMOS' },
    { ...base, subedital: 'PROFESSOR COLABORADOR - CIÊNCIA DA COMPUTAÇÃO/ENGENHARIA DE SOFTWARE' }
  ];
}

function registrosUFSCarSaoCarlos() {
  // Era DEFEITO (4 subeditais distintos, mesmo campus + mesma subárea —
  // maior grupo medido). Pós-fix, os 4 códigos de subedital distinguem.
  const base = { orgao: 'Fundação Universidade Federal de São Carlos', campus: 'São Carlos', area: 'Computação/IA', subarea: 'Computação', url: 'https://exemplo/ufscar' };
  return ['004/26.08', '004/26.13', '004/26.14', '004/26.15'].map(subedital => ({ ...base, subedital }));
}

function registroUnico() {
  // Controle negativo: edital sem guarda-chuva (url única) nunca conta
  // como duplicata visual, mesmo que a tupla visível se repita entre urls
  // DIFERENTES (isso é esperado — dois editais diferentes na mesma área).
  return [{ orgao: 'UNILA', campus: null, area: 'Computação/IA', subarea: 'Computação', subedital: 'EDITAL A', url: 'https://exemplo/unila-a' }];
}

function registrosSubeditalNuloDuplicado() {
  // CONTROLE POSITIVO do que o fix NÃO resolve sozinho: dois registros do
  // MESMO guarda-chuva, MESMA tupla visível, e `subedital` AUSENTE nos dois
  // (null) — a situação estruturalmente impossível (subedital é parte do
  // hash de `id`; dois registros distintos com a MESMA url e o MESMO
  // subedital, mesmo null, colidiriam no dedupe do store), mas o auditor
  // tem que continuar acusando SE ela acontecer — não pode ficar cego
  // silenciosamente só porque a coluna nova existe.
  const base = { orgao: 'UNB', campus: null, area: 'Computação/IA', subarea: 'Computação', subedital: null, url: 'https://exemplo/unb-anomalia' };
  return [{ ...base }, { ...base }];
}

function main() {
  console.log('\n=== concursos-vista-duplicata-visual.test.js ===\n');
  let passed = 0;
  let failed = 0;

  const tests = [
    ['UEL: subárea diferente dentro do mesmo guarda-chuva -> ZERO duplicata visual (caso já legítimo antes do fix)', () => {
      const { totalGuardaChuvas, gruposDuplicataVisual } = auditarDuplicataVisualGuardaChuva(registrosUEL());
      assert.strictEqual(totalGuardaChuvas, 1);
      assert.strictEqual(gruposDuplicataVisual.length, 0);
    }],

    ['UEM: 3 subeditais distintos, mesma subárea -> ZERO duplicata visual PÓS-FIX (subedital agora desempata)', () => {
      const { gruposDuplicataVisual } = auditarDuplicataVisualGuardaChuva(registrosUEM());
      assert.strictEqual(gruposDuplicataVisual.length, 0, 'os 3 subeditais distintos agora aparecem na tupla visível — nenhum grupo deveria sobrar');
    }],

    ['UFSCar — São Carlos: 4 subeditais distintos, mesmo campus/subárea -> ZERO duplicata visual PÓS-FIX (maior grupo medido)', () => {
      const { gruposDuplicataVisual } = auditarDuplicataVisualGuardaChuva(registrosUFSCarSaoCarlos());
      assert.strictEqual(gruposDuplicataVisual.length, 0);
    }],

    ['edital sem guarda-chuva (url única) nunca conta como duplicata visual, mesmo com tupla repetida entre urls diferentes', () => {
      const doisEditaisDiferentesMesmaTupla = [...registroUnico(), { ...registroUnico()[0], url: 'https://exemplo/unila-b', subedital: 'EDITAL B' }];
      const { totalGuardaChuvas, gruposDuplicataVisual } = auditarDuplicataVisualGuardaChuva(doisEditaisDiferentesMesmaTupla);
      assert.strictEqual(totalGuardaChuvas, 0, 'urls diferentes não formam guarda-chuva, mesmo com a mesma tupla visível');
      assert.strictEqual(gruposDuplicataVisual.length, 0);
    }],

    ['auditoria combinada: UEL + UEM + UFSCar no mesmo lote -> ZERO grupos de duplicata visual (todos resolvidos pelo desempate)', () => {
      const { totalGuardaChuvas, gruposDuplicataVisual } = auditarDuplicataVisualGuardaChuva([
        ...registrosUEL(), ...registrosUEM(), ...registrosUFSCarSaoCarlos()
      ]);
      assert.strictEqual(totalGuardaChuvas, 3, 'as 3 urls formam guarda-chuva (2+ registros cada)');
      assert.strictEqual(gruposDuplicataVisual.length, 0);
    }],

    ['CONTROLE POSITIVO: dois registros do mesmo guarda-chuva com subedital IGUAL (caso estruturalmente anômalo) continuam acusados — o auditor não fica cego', () => {
      const { gruposDuplicataVisual } = auditarDuplicataVisualGuardaChuva(registrosSubeditalNuloDuplicado());
      assert.strictEqual(gruposDuplicataVisual.length, 1, 'o auditor tem que continuar acusando duplicata visual quando ela genuinamente existe, mesmo com o campo novo');
      assert.strictEqual(gruposDuplicataVisual[0].registros.length, 2);
    }]
  ];

  for (const [name, fn] of tests) {
    if (runTest(name, fn)) passed++;
    else failed++;
  }

  // Onda 14/E2 — a prova viva contra `data/store.jsonl` real, quando
  // existir no disco (dev, não CI — `data/` está no .gitignore da raiz).
  // Diferente do arquivo pré-fix, isto AGORA FALHA se algum grupo sobrar:
  // o conserto é estrutural (subedital é parte do hash de `id`), então "0
  // grupos" é uma garantia, não uma medição de sorte — um teste que não
  // reprovasse aqui não estaria provando nada.
  if (fs.existsSync(store.STORE_PATH)) {
    const docentes = store.listar(r => (r.trilha || 'docente') === 'docente');
    const { totalGuardaChuvas, gruposDuplicataVisual } = auditarDuplicataVisualGuardaChuva(docentes);
    const totalRegistrosEnvolvidos = gruposDuplicataVisual.reduce((acc, g) => acc + g.registros.length, 0);
    const ok = runTest(
      `data/store.jsonl real (${docentes.length} docentes, ${totalGuardaChuvas} guarda-chuva(s)) -> 0 grupos de duplicata visual PÓS-FIX`,
      () => assert.strictEqual(
        gruposDuplicataVisual.length, 0,
        `${gruposDuplicataVisual.length} grupo(s)/${totalRegistrosEnvolvidos} registro(s) ainda indistinguíveis: ` +
          JSON.stringify(gruposDuplicataVisual.map(g => ({ url: g.url, chave: g.chave, n: g.registros.length })))
      )
    );
    if (ok) passed++; else failed++;
  } else {
    console.log('\n  [informativo] data/store.jsonl não existe neste ambiente (gitignored) — pulando a checagem contra o dado real.');
  }

  console.log(`\n${passed} passou(aram), ${failed} falhou(aram)\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
