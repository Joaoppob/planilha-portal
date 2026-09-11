'use strict';
// ===========================================================================
// SISTEMA VISUAL DO PORTAL
// ===========================================================================
//
// A decisão central é SUBTRATIVA e ela é aritmética, não gosto.
//
// A planilha tinha 12 cores de fundo distintas (4 pastéis de faixa na trilha
// docente, 4 na de mercado, 3 de estágio na `Fila`, mais 3 tons de cromo
// cinza-escuro). Auditadas regra a regra: das 18 regras de formatação
// condicional em produção, 17 DUPLICAVAM um emoji que já estava na mesma
// linha. A faixa era a terceira camada do mesmo sinal.
//
// LEI DA FAIXA. Uma linha só ganha fundo colorido quando o sinal que ela
// carrega NÃO alcança o leitor por nenhum outro canal — nem a dobra do
// celular (358 px) na primeira tela, nem o bloco `frozenColumnCount`, que
// PERSISTE através da rolagem (a garantia mais forte das duas, ver Onda 1 +
// V4/Leva 6). Onde o emoji cabe num dos dois — `Empregos!Publicada` congela
// junto com Abrir+Inscrito+Vaga desde a V4 (Leva 6): sobrevive à rolagem
// mesmo tendo saído da dobra de 358 px quando `Inscrito` entrou (Onda 13) —
// a faixa sai. Onde não cabe em NENHUM dos dois — `Tarefas!E` (prazo, a
// 636 px da borda, fora de qualquer bloco congelado, uma data crua sem
// emoji nenhum) — o canal fica, e no formato mais barato possível.
//
// Resultado: 18 regras -> 14 (7 de estado + 4 de alarme + 3 de anatomia do
// `Hoje`), 12 fundos -> 3 (cromo + alarme + aviso). O que carregava a cor
// continua carregando: o emoji, que já está em toda linha.
//
// O DEFEITO QUE A AUDITORIA ACHOU DE GRAÇA. O alarme do robô parado NÃO TINHA
// CANAL VISUAL: `Hoje!A1` e `Empregos!A1` eram células com fundo `#202124`
// fixo e texto branco — SEMPRE, tanto no estado normal quanto quando
// `AVISO_SYNC` prefixava `🛑 SEM ATUALIZAR DESDE 19/08`. O elemento mais
// pesado da tela era constante, então o aviso que INVALIDA TUDO ABAIXO DELE
// chegava como mais texto dentro de uma barra preta que já estava lá. Um
// campo que já é o mais escuro da tela não tem pra onde escalar. É por isso
// que o banner sai do preto: o cromo inteiro vira um campo N1 constante, e a
// troca N1 -> S1 no veredito passa a ser a ÚNICA mudança de cor que a peça
// consegue produzir. Não há como perder.
const a = require('./api');
const A = require('./abas');
const N = require('./notas');
const F = require('./formulas');

// ---------------------------------------------------------------- paleta
// Seis valores no arquivo inteiro. Todo contraste abaixo é CALCULADO (WCAG
// 2.x, luminância relativa), não estimado.
const cor = (r, g, b) => ({ red: r / 255, green: g / 255, blue: b / 255 });
const hex = h => cor(parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16));

const PALETA = {
  N0: '#FFFFFF',      // papel — a superfície de tudo que é dado
  N1: '#F4F1EA',      // campo — fundo de TODO o cromo (região congelada)
  N2: '#DED8CB',      // régua — a única borda da peça, sob a última congelada
  N3: '#1F1D1A',      // tinta — todo texto primário          (16,81:1 sobre N0)
  N4: '#6B655C',      // tinta recuada — meta, cabeçalho, linha recessiva (5,77:1)
  ACENTO: '#0B5D57',  // só o que se toca: HYPERLINK           (7,73:1 sobre N0)
  S1: '#F7DDD9',      // alarme — tarefa vencida · robô parado
  S2: '#FBEFD3'       // aviso — tarefa vence em <= 2 dias
};
const C = Object.fromEntries(Object.entries(PALETA).map(([k, v]) => [k, hex(v)]));

// `#999999` sobre branco media 2,85:1 e REPROVAVA AA (mínimo 4,5:1 a 10pt).
// Era o único par reprovado da peça, e estava exatamente nos dois lugares
// mais fáceis de não olhar: tarefa feita e candidatura descartada. N4 mede
// 5,77:1 sobre papel e 5,11:1 sobre o campo do cromo.
//
// REGRA DURA DE COMPOSIÇÃO, pra não reintroduzir o defeito: N4 NUNCA pinta
// texto sobre S1 ou S2 (mediria 4,48:1 sobre S1 — reprova). Fundo de estado
// sempre carrega N3. As regras abaixo são mutuamente excludentes por
// construção (a de recessão exige `✅ feita`, a de alarme exige `<>"✅ feita"`),
// mas a regra fica escrita porque a PRÓXIMA regra que alguém acrescentar não
// vai saber disso.

// ------------------------------------------------------------ tipografia
// Uma família só: Arial. É a base do Sheets e a única com renderização
// garantida em desktop + app Android + app iOS + exportação em PDF. Sem CSS,
// a hierarquia inteira é tamanho + peso + cor: uma fonte adicionada por "Mais
// fontes" cai pro default EM SILÊNCIO onde não existe, e um fallback
// silencioso não degrada a peça — ele TROCA a peça. Os algarismos da Arial já
// são de avanço uniforme, então as colunas de data e contagem alinham sem
// precisar de família monoespaçada.
const FONTE = 'Arial';
const t = (tamanho, extras) => Object.assign(
  { fontFamily: FONTE, fontSize: tamanho, bold: false, italic: false, underline: false, strikethrough: false },
  extras
);
const T1 = t(12, { bold: true, foregroundColor: C.N3 });                              // veredito
const T3 = t(10, { foregroundColor: C.N3 });                                          // corpo
const T4_CABECALHO = t(9, { bold: true, foregroundColor: C.N4 });                     // rótulo de coluna
const T4_META = t(9, { foregroundColor: C.N4 });                                      // contagem, estado vazio
const T4_NAV = t(9, { foregroundColor: C.ACENTO, underline: true });                  // navegação
// ONDA 18 — "você está aqui". NUNCA `ACENTO` (essa cor É "isto se toca" — um
// marcador que não é link não pode pedir emprestada a cor do que é), e nunca
// sublinhado (sublinhado É "isto se toca" no canal 2). Chapa cheia em N3 com
// texto N0: o oposto visual de um link (bloco sólido vs. texto solto), e o
// oposto de alarme (S1/S2 são fundos claros — este é o único fundo ESCURO
// fora da grade de dados).
const T4_NAV_AQUI = t(9, { bold: true, foregroundColor: C.N0 });                      // "você está aqui"

// A NAVEGAÇÃO LÊ COMO CROMO — em três canais ao mesmo tempo, todos na mesma
// direção: tamanho 9 contra 12 (0,75x), peso regular contra bold, contraste
// 6,85:1 contra 14,91:1 (0,46x). Ela só ganha do veredito em POSIÇÃO, que é o
// que a torna barra de ferramentas em vez de conteúdo. E a afordância de link
// é o SUBLINHADO, não a cor: é isso que faz a nav sobreviver a daltonismo e a
// qualquer fallback de renderização.

// ------------------------------------------------------------- helpers
const faixa = (sheetId, l0, l1, c0, c1) => ({ sheetId, startRowIndex: l0, endRowIndex: l1, startColumnIndex: c0, endColumnIndex: c1 });
const formato = (range, fmt, campos) => ({ repeatCell: { range, cell: { userEnteredFormat: fmt }, fields: campos } });
const CAMPOS_CELULA = 'userEnteredFormat(backgroundColor,textFormat,wrapStrategy,verticalAlignment,horizontalAlignment)';

const larg = (sheetId, i, px, oculta) => ({
  updateDimensionProperties: {
    range: { sheetId, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 },
    properties: oculta ? { hiddenByUser: true } : { pixelSize: px, hiddenByUser: false },
    fields: oculta ? 'hiddenByUser' : 'pixelSize,hiddenByUser'
  }
});
const altura = (sheetId, linha, px) => ({
  updateDimensionProperties: {
    range: { sheetId, dimension: 'ROWS', startIndex: linha - 1, endIndex: linha },
    properties: { pixelSize: px },
    fields: 'pixelSize'
  }
});
// ONDA UX 1 (remodelação 2026-09-01) — ALTURA "AUTOMÁTICA" NÃO É AUTOMÁTICA
// POR API. Achado ao vivo, lendo a chapa (não o código): `Fila`, linha do
// estado vazio, ficou com `rowMetadata.pixelSize = 24` — um valor FIXO,
// herdado de quando a mescla cobria a largura inteira da aba (poucas linhas
// de texto quebrado). Depois de encolher a mescla pra caber na coluna
// congelada (66 px em `Fila`), o MESMO texto precisa de bem mais linhas —
// e a altura não cresceu sozinha, porque a API do Sheets só recalcula
// altura de linha sob demanda da UI (edição interativa), nunca como efeito
// colateral de `values.update`/`batchUpdate` de formatação. Resultado
// medido no PDF: a instrução cortada no meio, ilegível. `autoResizeDimensions`
// é o pedido explícito que faltava — sem ele, "a linha cresce sozinha"
// (comentário antigo, junto do bloco do estado vazio) nunca foi verdade por
// API, só na edição manual.
const autoAltura = (sheetId, linha) => ({
  autoResizeDimensions: { dimensions: { sheetId, dimension: 'ROWS', startIndex: linha - 1, endIndex: linha } }
});

// Nota de célula = a única explicação que não custa linha nem pixel de lista.
// Fica ANEXADA ao rótulo que ela explica (é tooltip, não manual) e sobrevive
// tanto ao `values.clear` do sync quanto ao `limpar()` do construir.js —
// `note` é propriedade da célula, não valor. NUNCA é o único portador de uma
// informação necessária: o app de celular pode não expor nota.
const nota = (sheetId, linha, coluna, texto) => ({
  repeatCell: {
    range: faixa(sheetId, linha, linha + 1, coluna, coluna + 1),
    cell: { note: texto },
    fields: 'note'
  }
});

// Proteção com AVISO (nunca bloqueio). `warningOnly` é requisito DURO: uma
// proteção bloqueante barraria a service account e o radar morreria de
// madrugada, em silêncio. Barrar de verdade também seria errado como produto:
// a planilha é de JB.
// `naoProtegidas` existe por uma aba só, e o motivo é de produto: as vistas
// de notícia são geradas por fórmula (logo, protegidas com aviso) e têm UMA
// célula que É pra ser tocada — o seletor de recorte. Um controle que abre
// caixa de confirmação a cada toque é um controle que ninguém usa, e o aviso
// perderia o sentido junto: quem aprende a clicar "ok, editar mesmo assim"
// três vezes por dia clica também na vez em que o aviso estava certo.
const protege = (sheetId, descricao, naoProtegidas) => ({
  addProtectedRange: {
    protectedRange: Object.assign(
      { range: { sheetId }, description: descricao, warningOnly: true },
      naoProtegidas && naoProtegidas.length ? { unprotectedRanges: naoProtegidas } : {}
    )
  }
});

const regraFormato = (range, formula, format, indice) => ({
  addConditionalFormatRule: {
    index: indice,
    rule: {
      ranges: [range],
      booleanRule: { condition: { type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: formula }] }, format }
    }
  }
});

// Validação de dados (dropdown). `showCustomUi: true` faz o Sheets desenhar o
// seletor; `strict: false` é AVISO, não bloqueio — mesma doutrina de
// `protege()`. `setDataValidation` SUBSTITUI a regra da faixa a cada chamada
// (não empilha como `addConditionalFormatRule`), então rodar de novo com a
// mesma regra é no-op.
const validacao = (range, condicao) => ({
  setDataValidation: { range, rule: { condition: condicao, showCustomUi: true, strict: false } }
});
const listaUm = (...valores) => ({ type: 'ONE_OF_LIST', values: valores.map(v => ({ userEnteredValue: v })) });
const rangeUm = formula => ({ type: 'ONE_OF_RANGE', values: [{ userEnteredValue: formula }] });

const borda = (sheetId, linha, colunas, cor2) => ({
  updateBorders: {
    range: faixa(sheetId, linha - 1, linha, 0, colunas),
    bottom: cor2 ? { style: 'SOLID', width: 1, color: cor2 } : { style: 'NONE' }
  }
});

// ===========================================================================
// GEOMETRIA POR ABA
// ===========================================================================
//
// `cols`: largura em px por índice de coluna; `null` = coluna OCULTA.
// `wrap`: índices que carregam FRASE e por isso quebram linha. Todo o resto é
// `CLIP` — e `CLIP` e não `OVERFLOW` de propósito: `OVERFLOW` deixa o texto
// invadir a célula vizinha vazia e desalinha a leitura POR COLUNA, que é a
// única estrutura que a peça tem. É a coisa que mais faz uma planilha parecer
// rascunho.
//
// A DOBRA DO CELULAR SÃO 358 px (390 pt de tela menos ~32 px de calha de
// número de linha). A coluna em que ela cai está marcada em cada bloco.
//
// `Concursos` e `Concursos · tudo` passam a ter A MESMA GEOMETRIA, porque
// passaram a ter a mesma FORMA (ver o bloco "A FORMA DA TRILHA DOCENTE" em
// formulas.js). A `Concursos` antiga tinha 4 colunas visíveis contra as 9 da
// `Empregos`, `Abrir` na terceira posição visível contra a primeira, e ZERO
// facetas no funil contra 5 — UF, área e órgão estavam fundidos dentro da
// string composta de `Vaga`. Duas superfícies que a arquitetura desenhou como
// isomorfas e que o olho encontrou diferentes.
//
// ONDA UX 11 + 13 (remodelação 2026-09-01) — a tríade da dobra de 358 px
// TROCOU. `Situação` (87% num único valor, 100% derivável de `Prazo` — ver
// AVALIACAO-UX.md Parte 3 #11) SAI; `Elegível?` (a coluna que decide) ENTRA.
// E `Inscrito` (Onda 13) deixou de ser a última coluna (~1162 px) — a única
// posição que não quebra o spill contíguo de `CHOOSECOLS` é ENTRE `Abrir` e
// `Vaga` (autorizado pela Parte 4 do laudo: "Inscrito pode ir para a coluna
// B"). As duas Ondas resolvem JUNTAS via `frozenColumnCount` (Onda 1, agora
// 4 em vez de 2 — ver `FROZEN_COLUNAS` abaixo): Abrir+Inscrito+Vaga+Elegível?
// ficam SEMPRE visíveis, sem depender só da largura da tela.
//   Concursos: Abrir 62 + Inscrito 72 + Vaga 180 + Elegível? 130 = 444 (congela 4)
// 444 px passa um pouco do "358 px de tela" de referência — aceito
// (Cláusula de Não-Deriva, "os limiares são negociáveis"): FROZEN persiste
// através da rolagem, ao contrário da dobra "primeira tela" que Onda 1
// usava sozinha, então mesmo o pouco que ultrapassa fica alcançável com um
// toque mínimo e nunca mais precisa ser refeito.
//
// V4 (Leva 6, remodelação 2026-09-01) — `Empregos` GANHA A MESMA regra, pelo
// MESMO motivo. A Lei da Faixa (ver o bloco de comentário no topo do
// arquivo) dispensava fundo colorido em `Empregos` porque `Publicada` (o
// emoji de frescor — 🔥/🟢/🟡/⚪/🗄️) cabia na dobra de 358 px sem precisar
// de canal nenhum a mais: `Abrir+Vaga+Publicada` terminava a 346 px. Onda 13
// (acima) empurrou `Publicada` pra 418 px ao inserir `Inscrito` entre
// `Abrir` e `Vaga` — e o bloco congelado ficou em 3 colunas (334 px, só
// Abrir+Inscrito+Vaga), então o sinal de frescor deixou de sobreviver à
// rolagem: quem rola pra ver `Área`/`Modalidade`/`Nível` (as outras facetas
// do funil) perde `Publicada` de vista, e no celular sem rolar nenhuma ele
// nem aparece (418 > 358). O aviso ficou registrado no README desde a Leva
// 3, pendente de decisão desta Leva.
//   Empregos: Abrir 62 + Inscrito 72 + Vaga 200 + Publicada 84 = 418 (congela 4)
// A DECISÃO: `Publicada` entra no bloco congelado (3→4, mesmo padrão que
// `Concursos`/`Concursos · tudo` já usam pra `Elegível?` — a faceta que
// DECIDE se vale a pena olhar a linha). NÃO uma faixa de cor nova: a Lei da
// Faixa continua de pé — o canal (o emoji) não deixou de existir, só
// precisava da MESMA garantia de persistência que `Elegível?` já tem.
// Reintroduzir fundo por linha custaria um 4º tom de cor à paleta fechada
// (N0-N4/ACENTO/S1/S2) e reabriria a "parede" que 12 fundos -> 3 já
// derrubou — a régua de robustez pede o mecanismo mais barato que resolve,
// e `frozenColumnCount` já é esse mecanismo, testado, na outra trilha.
const DOCENTE_GEO = {
  // N9 — `Situação` foi de 96 pra 116 px (a largura persiste mesmo fora da
  // dobra: `CLIP` continua sendo a renderização, e 116 px é o que evita
  // **"SEM PRAZC"** — `⚠️ SEM PRAZO` cortado no meio da letra, medido ao vivo
  // seis vezes na página 1 do export).
  //      A   B    C    D    E    F   G    H    I     J     K    L    M    N    O
  // `B` (Inscrito, Onda 13) — checkbox puro, sem texto: 72 px basta.
  // `J` (Subedital, Onda 14/E2) — código curto (`dados!F`, ex. "004/26.08"),
  // ocasionalmente descrição mais longa quando a extração cai no fallback
  // LLM; WRAP em vez de CLIP pra nunca perder o desempate por corte de texto.
  // `K`/`L` (_url/_ordem) e `N` (_por_quem) — OCULTAS (null).
  // `O` (`❌`, C1/Leva 5) — checkbox puro, mesma largura de `Inscrito` (72 px).
  cols: [62, 72, 180, 130, 116, 116, 48, 168, 150, 140, null, null, 120, null, 72],
  wrap: [2, 7, 8, 9]   // Vaga · Prazo · Subárea · Subedital — as quatro que carregam frase
};
// C10 Parte 2 — o índice de `título` DENTRO de cada uma das quatro tabelas
// de notícia, derivado (nunca literal): `F.noticiaColuna0(i, 'título')`.
const NOTICIA_WRAP_TITULO = F.NOTICIA_FAIXAS.map((_, i) => F.noticiaColuna0(i, 'título'));
const GEO = {
  //                    A    B    C    D    E    F    G    H    I    J     K
  // A largura do `Hoje` mora em formulas.js: é dela que sai o limite de
  // truncamento das colunas de token (ver HOJE_COLUNAS). Dois números em dois
  // arquivos voltariam a cortar no meio da palavra em silêncio.
  //
  // C10 Parte 3 — `HOJE_COLUNAS_ABA`/`HOJE_WRAP_ABA` cobrem os DOIS grupos
  // lado a lado (`HOJE_COLUNAS` sozinho continua sendo a largura de UM
  // bloco — é ele que a matemática de truncamento interna consome, índice
  // 0-3, e por isso não muda). Dobra do celular: só o GRUPO 0 (A:B, 340 px)
  // cabe nela — o grupo 1 já exige rolagem horizontal, mesmo custo que JB
  // aceitou pras quatro tabelas de notícia (C10-b).
  [A.HOJE]: { cols: F.HOJE_COLUNAS_ABA, wrap: F.HOJE_WRAP_ABA },
  [A.PAINEL]: DOCENTE_GEO,
  // ONDA UX 13 — `Inscrito` move de última coluna (K, ~1162 px) pra `B`
  // (mesma razão da irmã docente, ver o comentário grande em `DOCENTE_GEO`).
  // `K` (_por_quem, item 4d) — OCULTA, mesmo regime de `_url`/`_ordem`.
  // `L` (`❌`, C1/Leva 5) — checkbox, mesma largura de `Inscrito` (72 px).
  // V4 (Leva 6) — congela 4 (Abrir+Inscrito+Vaga+Publicada = 418), não mais
  // 3: ver `FROZEN_COLUNAS` e a Lei da Faixa, ambos em formatar.js.
  [A.EMPREGOS]: { cols: [62, 72, 200, 84, 88, 100, 104, 84, null, null, 120, null, 72], wrap: [2] },
  [A.TUDO]: DOCENTE_GEO,
  // Onda 15 — `esforço`/`bloqueada por`/`recorrente` apêndice (H:J). Curtas
  // de propósito: são as três únicas colunas cujo vocabulário inteiro é uma
  // palavra (P/M/G, nome de outra tarefa, não/semanal/quinzenal/mensal).
  // `criada em`/`notas`/`recorrente` (índices 5, 6, 9) já ficam FORA da
  // dobra (fim de B, 358 px) desde que a aba nasceu — Onda 15 não precisou
  // mexer na posição, só medir e provar (ver tests/onda-ux-11-15-*.test.js).
  [A.TAREFAS]: { cols: [228, 130, 116, 84, 78, 78, 260, 60, 170, 96], wrap: [0, 6] },        // dobra: fim de B (358, exato)
  // ONDA UX 12 — identidade antes do derivado: `o quê` (a descrição legível
  // da vaga) entra na coluna A; `id` (hash, ilegível) sai da posição mais
  // valiosa da tela pra C. Só as duas trocam de lugar (ver `FILA_CABECALHO`
  // em formulas.js) — a largura de cada uma viaja junto com o rótulo, dobra
  // continua somando 358 (196+96+66).
  // Onda 17 — `parada há` apêndice (L), numérica e curta, mesma largura que
  // `ordem` (F) e `atualizado em` (J) já usam pra número/data.
  // C3 (Leva 5) — `⭐` apêndice (M): curta, é um dropdown de 4 valores curtos.
  [A.FILA]: { cols: [196, 96, 66, 84, 128, 58, 78, 84, 236, 84, 236, 72, 72], wrap: [0, 8, 10] }, // dobra: fim de C (358)
  // Onda 5 — `Candidaturas`: A:E é o spill (órgão/empresa · vaga · trilha ·
  // inscrito em · aguardando há), F (`_url`) OCULTA no mesmo regime de
  // `_url`/`_ordem` das outras abas, G:L são digitadas (estágio · próximo
  // passo · notas · ⭐ · por quê · link retomada — LEVA 5 acrescentou os
  // dois do meio, LEVA 7 acrescenta o último).
  // Dobra: fim de B (180+220=400, um pouco além de 358 — aceito, `vaga` é a
  // segunda coisa mais importante da linha depois de quem, e cortar ela em C
  // seria pior que estourar a dobra em ~40px).
  // LEVA 7 — `link retomada` recebe a MESMA largura de `notas`/`por quê`
  // (220 px) e entra em `wrap` pelo MESMO motivo delas: é texto livre (um
  // link colado por JB), não um token curto. Fica de FORA de `T_LINK` (a
  // linguagem visual de link estático, adiante neste arquivo) de propósito
  // — ver o veredito de clicabilidade no comentário de `CANDIDATURAS_
  // CABECALHO`, `_norman/formulas.js`: esta célula é TEXTO reescrito a cada
  // build, nunca uma fórmula `HYPERLINK()`, e pintar ela de link prometeria
  // um clique que não existe.
  //                     org/emp vaga  trilha insc  aguar. _url  estág. próx.  notas ⭐   porquê link
  [A.CANDIDATURAS]: { cols: [180, 220, 84, 90, 100, null, 150, 220, 220, 72, 220, 220], wrap: [1, 7, 8, 10, 11] },
  // Ordem nova (ver PROJETOS_CABECALHO): as duas colunas que fecham o job (f)
  // sobem pra logo depois de `próximo passo`. `próximas tarefas` sai de 1.324
  // px de offset pra 714.
  //             projeto frente estág. passo  próx.  últ.  quem prazo mov. abert. notas etapa progr. saúde
  // Onda 14 — `etapa atual`/`progresso`/`saúde` apêndice (L:N). `etapa atual`
  // larga (frase de marco); `progresso`/`saúde` curtas (número curto / emoji
  // + palavra).
  // ONDA UX 15 — `frente` está VAZIA em 2 de 2 projetos reais (AVALIACAO-UX
  // Parte 2 §6) e ocupava 132 px na dobra, empurrando `estágio` (a coluna
  // que de fato se lê) pra fora dela. `PROJETOS_CABECALHO` NÃO reordena: o
  // mecanismo de migração de `construir.js` (§3, `ehCabecalho`) só detecta
  // deslocamento de LINHA por nome, nunca reordenação de COLUNA — trocar a
  // posição de `frente`/`estágio` moveria só o RÓTULO, deixando o valor real
  // de JB (2 projetos digitados) sob o cabeçalho errado, sem nenhum aviso.
  // A cura segura é ENCOLHER a coluna vazia (132 -> 40 px, só o suficiente
  // pra não truncar um valor futuro em silêncio) — zero risco de reordenação
  // de dado, e `estágio` passa a caber a 256 px em vez de 348.
  [A.PROJETOS]: { cols: [216, 40, 116, 250, 260, 260, 84, 78, 96, 78, 220, 220, 90, 110], wrap: [0, 3, 4, 5, 10, 11] },
  // Onda 16 — `voz` no lugar de `quem` (mesma posição/largura); `responde a`
  // (F) numérica e curta; `contexto da resposta` (G) apêndice, larga como
  // `o que aconteceu`/`o que muda` — é texto narrativo igual às duas.
  [A.DIARIO]: { cols: [78, 96, 168, 280, 280, 90, 280], wrap: [2, 3, 4, 6] },   // dobra: fim de C (342)
  // Onda 14 — `Etapas`, entidade nova. `etapa` é a única coluna de texto
  // livre mais longo (nome do marco); as outras são curtas.
  [A.ETAPAS]: { cols: [180, 220, 60, 120, 84, 84], wrap: [1] },
  // AS QUATRO VISTAS DE NOTÍCIA TÊM A MESMA GEOMETRIA porque têm a mesma
  // FORMA — é a lição que `Concursos`/`Concursos · tudo` já pagaram: duas
  // superfícies desenhadas como isomorfas derivam em silêncio quando cada
  // uma guarda a própria largura. A largura mora em `formulas.js`
  // (`NOTICIA_COLUNAS`), do mesmo jeito que a do `Hoje`, porque é dela que
  // sai o limite de truncamento da coluna `veículo`.
  //
  // C10 Parte 2 — GEOMETRIA HORIZONTAL: `NOTICIA_COLUNAS` deixou de ser a
  // largura de UMA tabela repetida por altura (Onda 8-9, empilhada) e passou
  // a ser a largura da ABA INTEIRA — 4 blocos de 6 colunas + 3 vãos entre
  // eles (`F.NOTICIA_BLOCO_LARGURA`). `wrap` cobre o `título` de CADA uma das
  // quatro tabelas (`F.noticiaColuna0(i, 'título')`), não mais um índice
  // fixo — a coluna `título` muda de posição a cada bloco.
  [A.NOTICIAS]: { cols: F.NOTICIA_COLUNAS, wrap: NOTICIA_WRAP_TITULO },
  [A.IA]: { cols: F.NOTICIA_COLUNAS, wrap: NOTICIA_WRAP_TITULO },
  [A.TRABALHO]: { cols: F.NOTICIA_COLUNAS, wrap: NOTICIA_WRAP_TITULO },
  [A.CIENCIA]: { cols: F.NOTICIA_COLUNAS, wrap: NOTICIA_WRAP_TITULO }
};

// GUARDA DAS DUAS CÓPIAS: a largura `null` (coluna oculta) e o prefixo `_` do
// cabeçalho dizem A MESMA COISA em dois arquivos. Enquanto disserem, a nav
// sabe onde pode pousar; no dia em que divergirem, um link volta a cair dentro
// de coluna invisível — que é exatamente o D1. Isto estoura antes de escrever.
for (const [aba, g] of Object.entries(GEO)) {
  const cab = F.CABECALHO_POR_ABA[aba];
  if (!cab) continue;
  const porLargura = g.cols.map((px, i) => [px, i]).filter(([px]) => px === null).map(([, i]) => i).join(',');
  const porRotulo = cab.map((r, i) => [r, i]).filter(([r]) => String(r).startsWith(F.PREFIXO_COLUNA_OCULTA)).map(([, i]) => i).join(',');
  if (porLargura !== porRotulo) {
    throw new Error(
      `${aba}: as colunas OCULTAS por largura (${porLargura || 'nenhuma'}) e as marcadas com "${F.PREFIXO_COLUNA_OCULTA}" no cabeçalho ` +
      `(${porRotulo || 'nenhuma'}) divergem. A navegação escolhe a célula pela SEGUNDA lista — divergir põe link em coluna invisível (D1).`
    );
  }
  if (g.cols.length !== cab.length) {
    throw new Error(`${aba}: ${g.cols.length} largura(s) em GEO e ${cab.length} rótulo(s) no cabeçalho`);
  }
}

// Formato de número. É TIPOGRAFIA, e faltava: `formatar.js` só definia
// `numberFormat` em `Diário!A`, o que deixava `Projetos!G` (um MAXIFS sobre
// datas) sem máscara nenhuma. Tokens em INGLÊS mesmo com locale pt_BR — `aaaa`
// no lugar de `yyyy`/`yy` NÃO dá erro: a célula silenciosamente passa a
// mostrar o NOME DO DIA DA SEMANA (N-9).
const DATA = { type: 'DATE', pattern: 'dd/mm/yy' };
const INTEIRO = { type: 'NUMBER', pattern: '0' };
// Onda 5 — `Candidaturas!aguardando há` devolve um NÚMERO cru de dias (a
// mesma razão de `INTEIRO` acima: valor ordena, texto pré-formatado não).
// O sufixo " d" mora só na máscara, nunca baked na fórmula.
const DIAS = { type: 'NUMBER', pattern: '0" d"' };

// ===========================================================================
// MODO PILOTO — `node _norman/formatar.js --piloto Tarefas`
// ===========================================================================
//
// Nada deste sistema visual foi RENDERIZADO enquanto era escrito: toda cor é
// calculada por fórmula WCAG e toda geometria é soma de larguras. O que NÃO
// se calcula é a impressão — se sete abas sem grade parecem uma casa ou
// parecem uma página em branco. A regra que sai daí é de método: aplicar em
// UMA aba, ler de volta pela API, olhar, e só então propagar. Se a primeira
// revelar que a spec não sobrevive ao contato com a peça, para-se ali em vez
// de replicar o erro sete vezes.
//
// O piloto NÃO pode deixar a planilha meio-formatada: ele filtra também a
// LIMPEZA, então as outras abas ficam exatamente como estavam. O filtro é
// genérico — varre o request atrás de qualquer `sheetId`, em vez de depender
// de alguém lembrar de etiquetar cada um.
const sheetIdsDe = o => {
  const out = [];
  (function anda(x) {
    if (!x || typeof x !== 'object') return;
    if (typeof x.sheetId === 'number') out.push(x.sheetId);
    Object.values(x).forEach(anda);
  })(o);
  return out;
};

async function main(opcoes = {}) {
  const piloto = opcoes.piloto || null;
  const m = await a.meta();
  const props = {};
  m.sheets.forEach(s => { props[s.properties.title] = s.properties; });
  const id = Object.fromEntries(Object.entries(props).map(([k, v]) => [k, v.sheetId]));
  // `rowCount` VIVO, lido do GET — nunca literal (N-17). Faixa de formatação
  // condicional além da grade é rejeitada pela API; aquém dela é uma regra que
  // silenciosamente não cobre as últimas linhas.
  const linhas = Object.fromEntries(Object.entries(props).map(([k, v]) => [k, v.gridProperties.rowCount]));
  console.log('sheetIds:', JSON.stringify(id));

  const ausentes = [A.PAINEL, A.TUDO, A.DADOS, A.CALC, A.ESTADO, A.EMPREGOS, A.HOJE, A.FILA, A.CANDIDATURAS, A.PROJETOS, A.TAREFAS, A.DIARIO,
    ...A.VISTAS_NOTICIA, A.NOTICIAS_DADOS]
    .filter(x => id[x] === undefined);
  if (ausentes.length) throw new Error(`aba(s) ausente(s): ${ausentes.join(', ')} — rode \`node _norman/construir.js\` antes de formatar`);

  // ------------------------------------------------ limpeza idempotente
  // Três camadas que EMPILHAM se não forem apagadas antes: formatação
  // condicional, proteção e mescla. A de CF já era tratada; a de mescla não
  // era, e nesta Onda ela importa: a linha de navegação empurrou todo o cromo
  // uma linha pra baixo, então as mesclas antigas ficariam órfãs exatamente
  // em cima da nav. Lê o que EXISTE no GET e apaga isso — não chuta índices.
  if (piloto && id[piloto] === undefined) throw new Error(`--piloto ${piloto}: essa aba não existe na planilha`);
  const soDoPiloto = r => !piloto || sheetIdsDe(r).every(x => x === id[piloto]);

  const limpeza = [];
  m.sheets.filter(s => !piloto || s.properties.title === piloto).forEach(s => {
    const n = (s.conditionalFormats || []).length;
    // De trás pra frente: apagar uma regra desloca o índice da seguinte.
    for (let i = n - 1; i >= 0; i--) limpeza.push({ deleteConditionalFormatRule: { sheetId: s.properties.sheetId, index: i } });
    (s.protectedRanges || []).forEach(pr => limpeza.push({ deleteProtectedRange: { protectedRangeId: pr.protectedRangeId } }));
    (s.merges || []).forEach(mg => limpeza.push({ unmergeCells: { range: mg } }));
    // O FUNIL TAMBÉM PRECISA SAIR ANTES, e a razão só aparece rodando: a API
    // recusa `mergeCells` que cruze a borda de um filtro existente
    // ("You can't merge cells that cross the borders of an existing filter").
    // O funil antigo começava na linha do cabeçalho ANTIGO; a linha de nav
    // empurrou o cabeçalho pra baixo, e a mescla nova do veredito passou a
    // cair dentro da faixa do filtro velho. O `batchUpdate` é atômico, então
    // isso não deixava a planilha meio-formatada — derrubava tudo. Ele é
    // recriado adiante, na linha certa.
    if (s.basicFilter) limpeza.push({ clearBasicFilter: { sheetId: s.properties.sheetId } });
    // Onda 8-9 — AS TRÊS VISTAS DE FUNIL POR ABA DE NOTÍCIA são `FilterView`,
    // não `basicFilter`: uma planilha só admite UM `basicFilter` por aba, e
    // as quatro vistas de notícia agora têm TRÊS tabelas cada, cada uma com
    // seu próprio funil. Precisam sair antes de recriar pelo mesmo motivo do
    // `basicFilter` acima (mesclagem cruzando borda de filtro existente).
    (s.filterViews || []).forEach(fv => limpeza.push({ deleteFilterView: { filterId: fv.filterViewId } }));
  });
  if (limpeza.length) {
    await a.batch(limpeza);
    console.log('formatação condicional / proteção / mescla antigas removidas:', limpeza.length, 'item(ns)');
  }

  const reqs = [];

  // ---------------------------------------------------- ordem das abas
  // ONDA UX 4 (remodelação 2026-09-01) — A ORDEM VELHA PUNHA CONSUMO ANTES DE
  // PRODUÇÃO, e o comentário que a defendia ("o que se LÊ vem antes do que
  // se ESCREVE") era exatamente o problema, medido ao vivo (AVALIACAO-UX.md
  // Parte 2 §12): as quatro abas de LEITURA (Notícias/IA/Trabalho/Ciência)
  // ocupavam os slots 4-7, e as superfícies onde JB ESCREVE (Tarefas em
  // diante) só começavam no slot 8 — no celular, que mostra ~3 nomes por
  // vez, o cluster do CRM ficava atrás de 4 abas que ninguém edita. `Etapas`
  // não entrava NESTA lista nenhuma (bug — `ORDEM` nunca a citava, então ela
  // flutuava no índice que a API lhe desse, que era o ÚLTIMO); combinado com
  // `dados (não edite)` visível no meio do bloco, o cluster do CRM saía
  // partido em três pedaços (Tarefas/Fila/Candidaturas/Projetos/Diário ·
  // dados · Etapas).
  //
  // Regra nova: `Hoje` abre a barra (única aba lida ANTES de decidir onde
  // entrar); `Empregos` e `Concursos` vêm em seguida — são abas de radar com
  // ESCRITA leve (o check `Inscrito`), abertas todo dia, por medição, não
  // hipótese; depois delas vem o CRM inteiro (Tarefas·Fila·Candidaturas·
  // Projetos·Diário·Etapas — ESCRITA de verdade, curadoria de JB), com
  // `Etapas` explicitamente ao lado de `Projetos`/`Diário` (a Onda pede
  // literalmente isso: são a mesma superfície, "os marcos de um projeto");
  // só DEPOIS vêm as quatro de NOTÍCIA (LEITURA, o que a máquina trouxe pra
  // ver, nunca pra editar). `Concursos · tudo`, `dados (não edite)`,
  // `notícias (não edite)`, `_calc` e `_estado` fecham a fila, todas OCULTAS
  // — `dados (não edite)` estava fora de `OCULTAS` até esta Onda (a exceção
  // "JB confere célula lá" não paga o preço de partir o cluster do CRM ao
  // meio; conferir célula ainda é possível desocultando com um clique, o
  // mesmo custo que `Concursos · tudo` já paga).
  const ORDEM = [A.HOJE, A.EMPREGOS, A.PAINEL,
    A.TAREFAS, A.FILA, A.CANDIDATURAS, A.PROJETOS, A.DIARIO, A.ETAPAS,
    ...A.VISTAS_NOTICIA,
    A.TUDO, A.DADOS, A.NOTICIAS_DADOS, A.CALC, A.ESTADO];
  // `dados (não edite)` entra OCULTA nesta Onda (ver bloco acima). `_estado`
  // (Onda 3) e `_calc` continuam ocultas pelo mesmo critério de sempre: são a
  // máquina do build, ninguém confere célula lá à mão.
  const OCULTAS = new Set([A.TUDO, A.DADOS, A.CALC, A.NOTICIAS_DADOS, A.ESTADO]);
  // No piloto a ordem não se mexe: reordenar UMA aba não é reordenar a barra,
  // é embaralhá-la.
  if (!piloto) {
    ORDEM.forEach((aba, i) => reqs.push({
      updateSheetProperties: {
        properties: { sheetId: id[aba], index: i, hidden: OCULTAS.has(aba) },
        fields: 'index,hidden'
      }
    }));
  }

  // ------------------------------------ grade, congelamento, cromo, papel
  // A GRADE TEM DOIS EIXOS; A LISTA TEM UM. O que faz a peça parecer
  // formulário fiscal é a malha VERTICAL. Desligar a grade só ficou possível
  // porque a Lei da Faixa eliminou os fundos coloridos primeiro: a referência
  // avisa que ocultar grade e pintar faixa colidem, e a colisão desaparece
  // quando não há mais faixa. Uma decisão destrava a outra.
  //
  // COMPOSIÇÃO: um campo, uma régua, uma borda. Toda a região congelada é
  // campo N1; tudo abaixo é papel N0; uma única régua N2 separa os dois. Isso
  // faz o topo ler como UM cabeçalho, e não como as três a quatro faixas de
  // cor diferentes que ele era (`#202124` + `#3C4043` + `#D9D9D9`).
  // ACHADO NA ONDA 18-20, lendo a CHAPA (não o código): `Etapas` (Onda 14)
  // tinha `GEO`, validação de dropdown e nota — mas nunca entrou nesta
  // lista. Resultado, medido no PDF exportado e confirmado por
  // `effectiveFormat` via API: cromo BRANCO (não N1), congelamento não
  // aplicado, nav sem o acento/sublinhado, e o marcador "você está aqui"
  // (Onda 18) escrito com o texto certo mas SEM o fundo escuro — porque
  // `construir.js` (que escreve VALOR) e `formatar.js` (que pinta) são
  // scripts separados, e só o segundo lê `HUMANAS`. `verificar.js` não
  // pegava porque só confere o TEXTO da célula, nunca a formatação —
  // exatamente a lacuna que a prova visual desta Onda existe pra fechar.
  const HUMANAS = [A.HOJE, A.PAINEL, A.EMPREGOS, A.TUDO, A.TAREFAS, A.FILA, A.CANDIDATURAS, A.PROJETOS, A.DIARIO,
    A.ETAPAS, ...A.VISTAS_NOTICIA];
  // ONDA UX 1 (remodelação 2026-09-01) — `frozenColumnCount` era 0 nas 14
  // abas visíveis, medido ao vivo (AVALIACAO-UX.md Parte 1: "o número que
  // domina tudo abaixo"). Toda rolagem horizontal apagava a identidade da
  // linha. `Concursos`/`Concursos · tudo`/`Empregos` congelavam DUAS colunas
  // (`Abrir`+`Vaga`); as demais congelam UMA.
  //
  // ONDA UX 12/13 (Leva 3) — dois ajustes sobre a base da Onda 1, nunca em
  // vez dela:
  //   - `Fila!A` era `id` (hash ilegível); virou `o quê` (Onda 12) — a
  //     âncora de 1 coluna que já existia passa a mostrar identidade, não
  //     lixo de máquina. Continua 1 (`FROZEN_COLUNAS` não lista `A.FILA`,
  //     cai no default).
  //   - `Inscrito` deixou de ser a última coluna (~1162 px) — Onda 13 moveu
  //     ela pra ENTRE `Abrir` e `Vaga` (única posição que não quebra o
  //     spill contíguo de `CHOOSECOLS`/`FILTER`, ver o comentário grande em
  //     `formulas.js` "A FORMA DA TRILHA DOCENTE"). Isso desloca a
  //     identidade uma casa pra direita, então o congelamento CRESCE pra
  //     continuar cobrindo ação+checkbox+identidade (+ a faceta que decide,
  //     em `Concursos`): `Empregos` 2->3 (Abrir+Inscrito+Vaga);
  //     `Concursos`/`Concursos · tudo` 2->4 (Abrir+Inscrito+Vaga+Elegível?).
  //
  // V4 (Leva 6) — `Empregos` 3->4 (Abrir+Inscrito+Vaga+Publicada). Ver o
  // bloco de comentário grande em "A FORMA DA TRILHA DOCENTE", acima: a
  // Lei da Faixa media a dobra por PIXEL sozinha até aqui; `Publicada` (o
  // emoji de frescor) saiu dela quando `Inscrito` entrou (Onda 13) e nunca
  // foi resgatada — agora entra no MESMO mecanismo que já resgatou
  // `Elegível?` em `Concursos`.
  const FROZEN_COLUNAS = { [A.PAINEL]: 4, [A.TUDO]: 4, [A.EMPREGOS]: 4 };
  for (const aba of HUMANAS) {
    const sheetId = id[aba];
    const g = GEO[aba];
    const l = F.LINHAS[aba];
    const nCols = g.cols.length;
    const nLinhas = linhas[aba];
    const frozenColunas = FROZEN_COLUNAS[aba] || 1;

    reqs.push({
      updateSheetProperties: {
        properties: { sheetId, gridProperties: { frozenRowCount: l.congelado, frozenColumnCount: frozenColunas, hideGridlines: true } },
        fields: 'gridProperties.frozenRowCount,gridProperties.frozenColumnCount,gridProperties.hideGridlines'
      }
    });

    // larguras (e as duas colunas de máquina, ocultas)
    g.cols.forEach((px, i) => reqs.push(px === null ? larg(sheetId, i, 0, true) : larg(sheetId, i, px)));

    // PAPEL: tudo abaixo do cromo. Vai primeiro pra que o cromo escreva por
    // cima; `CLIP` como base, `WRAP` só nas colunas que carregam frase.
    const primeiroDado = (l.lista || l.dados) - 1;
    reqs.push(formato(
      faixa(sheetId, primeiroDado, nLinhas, 0, nCols),
      { backgroundColor: C.N0, textFormat: T3, wrapStrategy: 'CLIP', verticalAlignment: 'TOP', horizontalAlignment: 'LEFT' },
      CAMPOS_CELULA
    ));
    // Vertical TOP no dado (uma célula de duas linhas ao lado de uma de uma
    // linha tem que COMEÇAR na mesma altura) e MIDDLE no cromo.
    (g.wrap || []).forEach(i => reqs.push({
      repeatCell: {
        range: faixa(sheetId, primeiroDado, nLinhas, i, i + 1),
        cell: { userEnteredFormat: { wrapStrategy: 'WRAP' } },
        fields: 'userEnteredFormat.wrapStrategy'
      }
    }));

    // CROMO: a região congelada inteira, campo N1.
    reqs.push(formato(
      faixa(sheetId, 0, l.congelado, 0, nCols),
      { backgroundColor: C.N1, textFormat: T4_META, wrapStrategy: 'WRAP', verticalAlignment: 'MIDDLE', horizontalAlignment: 'LEFT' },
      CAMPOS_CELULA
    ));
    // veredito — a frase que manda em tudo abaixo dela
    //
    // ONDA UX 1 — O SHEETS RECUSA MESCLA QUE CRUZA A FRONTEIRA CONGELADO/
    // LIVRE ("You can't merge frozen and non-frozen columns"), erro medido
    // ao vivo nesta Onda (`--piloto Tarefas`, request de mesclagem da linha
    // de estado vazio): TODA mescla de largura total passou a cruzar a
    // fronteira a partir do momento em que qualquer coluna congelou.
    //
    // A CURA NÃO É ENCOLHER A MESCLA — foi a primeira tentativa, e a chapa
    // (`Fila`/`Trabalho`, medidas nesta Onda) mostrou o preço: confinada à
    // largura da coluna congelada (66 px em `Fila`), a MESMA frase que cabia
    // em 2-4 linhas virava uma coluna de 13+ linhas de uma palavra cada —
    // legível tecnicamente, ilegível de fato.
    //
    // A CURA É NÃO MESCLAR NENHUMA VEZ. `veredito`/`contagem`/`vazio` são
    // sempre UMA frase corrida (sem quebra de linha própria, exceto o
    // estado vazio das digitadas, que usa DUAS — ver o bloco abaixo) escrita
    // numa ÚNICA célula (coluna A, `construir.js`), com todas as células à
    // direita dela VAZIAS na mesma linha. `OVERFLOW_CELL` é feito exatamente
    // pra isso: o texto invade as células vizinhas vazias sem precisar
    // mesclar — não é merge, então não cruza fronteira nenhuma, e a chapa
    // (medida nesta Onda) mostra a linha de volta a 1 linha só, largura
    // inteira, indistinguível do desenho anterior à Onda. `Hoje!A1`
    // (protegido, Onda 20) nem entra em risco: nenhum endereço de escrita
    // muda, só o `wrapStrategy` da célula.
    //
    // Isto substitui o `WRAP` que o bloco CROMO acima aplicou por default —
    // por isso o campo é redeclarado aqui, célula a célula, só nestas linhas.
    const overflow = (linha, nColsFaixa) => reqs.push({
      repeatCell: {
        range: faixa(sheetId, linha - 1, linha, 0, nColsFaixa),
        cell: { userEnteredFormat: { wrapStrategy: 'OVERFLOW_CELL' } },
        fields: 'userEnteredFormat.wrapStrategy'
      }
    });
    if (l.veredito) {
      reqs.push(formato(faixa(sheetId, l.veredito - 1, l.veredito, 0, nCols), { textFormat: T1 }, 'userEnteredFormat.textFormat'));
      overflow(l.veredito, nCols);
      reqs.push(autoAltura(sheetId, l.veredito));
    }
    if (l.contagem) {
      overflow(l.contagem, nCols);
      reqs.push(autoAltura(sheetId, l.contagem));
    }
    // A LINHA DO CONTROLE saiu (Onda 8-9): o seletor de recorte que era a
    // única célula digitável das vistas de notícia não existe mais — JB
    // pediu as tabelas (quatro, desde C10) sempre visíveis, não um controle
    // pra trocar entre elas. Nenhuma aba declara mais `l.recorte` em `F.LINHAS`.
    // cabeçalho de coluna — o cromo mais fraco
    if (l.cabecalho) {
      reqs.push(formato(faixa(sheetId, l.cabecalho - 1, l.cabecalho, 0, nCols), { textFormat: T4_CABECALHO, wrapStrategy: 'CLIP' }, 'userEnteredFormat(textFormat,wrapStrategy)'));
      reqs.push(altura(sheetId, l.cabecalho, 24));
    }
    // NAVEGAÇÃO — acento + sublinhado, célula a célula, e SÓ nas células que
    // realmente hospedam link. A posição vem de `F.celulaNav`, a mesma função
    // que `construir.js` usa pra ESCREVER: enquanto o formato ia em `0..N`
    // fixo e a escrita ia em `0..N` fixo, os dois concordavam em cima de uma
    // coluna oculta e ninguém notava (D1). Agora os dois perguntam à mesma
    // função onde a coluna visível está.
    // ONDA UX 6 — `Hoje` deixou de ser caso especial: ela está em `F.NAV`
    // (12 destinos) como qualquer outra aba, então `quantosPorLinha` lê
    // `F.NAV[aba].length` pra TODAS, sem `aba === A.HOJE ? 2 : ...`.
    const navLinhas = [l.nav].filter(Boolean);
    const quantosPorLinha = (F.NAV[aba] || []).length;
    for (const linhaNav of navLinhas) {
      for (let j = 0; j < quantosPorLinha; j++) {
        const col = F.colunasVisiveis(aba)[j];
        reqs.push(formato(faixa(sheetId, linhaNav - 1, linhaNav, col, col + 1), { textFormat: T4_NAV, wrapStrategy: 'CLIP' }, 'userEnteredFormat(textFormat,wrapStrategy)'));
      }
    }
    // ONDA 18 — a célula seguinte ao último destino é o marcador "você está
    // aqui" (`F.navAqui`, escrito por `F.navCelulas`). ONDA UX 6 — `Hoje`
    // ganha o marcador também: ela já era "óbvia" por ser a única aba com
    // layout de painel, mas com nav de 12 destinos igual às outras, "onde
    // estou" merece a mesma resposta visual que todo mundo tem.
    // `backgroundColor` entra no campo atualizado porque a região inteira já
    // ganhou N1 acima — sem declarar o campo aqui, a chapa N3 nunca
    // sobrescreveria o fundo claro.
    if (l.nav) {
      const colAqui = F.colunasVisiveis(aba)[quantosPorLinha];
      reqs.push(formato(
        faixa(sheetId, l.nav - 1, l.nav, colAqui, colAqui + 1),
        { backgroundColor: C.N3, textFormat: T4_NAV_AQUI, wrapStrategy: 'CLIP', horizontalAlignment: 'CENTER' },
        'userEnteredFormat(backgroundColor,textFormat,wrapStrategy,horizontalAlignment)'
      ));
    }
    // A RÉGUA: uma borda por aba, e só uma. Formatação condicional NÃO
    // desenha borda no Sheets, então toda borda é de posição fixa — e só a
    // região congelada tem posição fixa. Nenhuma borda vertical em lugar
    // nenhum, nenhuma borda entre linhas de dado: é o que separa lista de
    // formulário. `updateBorders` não apaga as anteriores, então vai um
    // `NONE` antes, no mesmo batch.
    reqs.push(borda(sheetId, l.congelado, nCols, null));
    reqs.push(borda(sheetId, l.congelado, nCols, C.N2));
  }

  // Altura fixa da linha de NAV em TODAS as abas que têm nav: o conteúdo é uma
  // linha de 9pt e é sempre uma linha. Nas digitadas isso só passou a ser
  // seguro agora — antes a mesma linha hospedava a instrução de estado vazio e
  // fixá-la a cortaria. A instrução ganhou linha própria (D9), então a nav
  // volta a ser só nav.
  reqs.push(altura(id[A.HOJE], F.LINHAS[A.HOJE].nav, 26));
  for (const aba of [A.PAINEL, A.EMPREGOS, A.TUDO, ...Object.keys(F.ESTADO_VAZIO_DIGITADAS), ...A.VISTAS_NOTICIA]) {
    reqs.push(altura(id[aba], F.LINHAS[aba].nav, 26));
  }

  // -------------------------------------- estado vazio: LINHA PRÓPRIA, na dobra
  // Mesclada de A até a última coluna, dentro do congelamento. Pode ser
  // mesclada porque NÃO hospeda link (N-15 restringe mescla que hospeda link),
  // e AGORA ela cabe na dobra do celular — que era o D9: `Fila!E1` a 442 px e
  // `Diário!E1` a 689 px faziam a aba aberta direto no telefone ser nav +
  // cabeçalho + branco.
  //
  // Altura pretende ser AUTOMÁTICA — a linha cresce pra caber a instrução
  // quando a aba está vazia e volta a uma linha quando ela enche. ONDA UX 1
  // — isso NUNCA foi automático por API (ver `autoAltura`, acima): o pedido
  // explícito `autoResizeDimensions` é o que faz a promessa valer.
  //
  // ONDA UX 1 — SEM MESCLA, COM `OVERFLOW_CELL` (ver o bloco de comentário
  // grande em `l.veredito`, acima: a mescla de largura total cruzava a
  // fronteira congelado/livre em TODA aba digitada — nenhuma delas tem 2
  // colunas congeladas — e encolher a mescla pra 1 coluna renderizava a
  // instrução em 13+ linhas de uma palavra cada, medido em `Fila`.
  // `OVERFLOW_CELL` NÃO é mescla — não tem fronteira pra cruzar — e a
  // instrução de DUAS frases (`CHAR(10)` entre elas) volta a ocupar 2
  // linhas de largura inteira, como antes da Onda.
  // =========================================================================
  // V1 (Leva 6, remodelação 2026-09-01) — UM ESTADO VAZIO CANÔNICO
  // =========================================================================
  //
  // AUDITADO com `effectiveFormat` lido de volta da planilha viva (não
  // chutado): a peça tinha TRÊS tuplas (wrap, tamanho, cor) diferentes pro
  // MESMO componente —
  //
  //   (a) as 5 abas digitadas abaixo (linha `vazio` dedicada, dentro do
  //       cromo): OVERFLOW_CELL · 9pt · itálico · N4 · fundo N1 — px=21
  //   (b) os blocos do `Hoje` (R-H3) e as 4 vistas de notícia (R-N2), cujo
  //       marcador vive DENTRO de uma linha de PAPEL variável (spill/VSTACK):
  //       WRAP · 10pt · itálico · N4 · fundo N0 — px=21
  //   (c) `Candidaturas!A4` (o topo do próprio spill de dado, sem CF
  //       nenhuma reconhecendo o marcador): CLIP · 10pt · SEM itálico ·
  //       N3 (preto de dado, não recuado) · fundo N0 — E CORTADO no meio da
  //       frase ("↳ Nenhuma candidatura ainda." — o resto, "Marque
  //       «Inscrito»...", nunca aparecia: 180 px não cabe a frase inteira
  //       em CLIP, que não invade a célula vizinha como OVERFLOW faz)
  //
  // A CANÔNICA: **10pt · itálico · N4**, sempre. `wrapStrategy` e o FUNDO
  // continuam split em duas famílias — e isso é GEOMETRIA, não gosto, com
  // prova escrita (não só afirmada):
  //   - (a) precisa de OVERFLOW_CELL porque é uma linha de largura INTEIRA
  //     sem mescla (a mescla foi banida — ver o bloco grande logo abaixo,
  //     "ONDA UX 1 — O SHEETS RECUSA MESCLA..."); WRAP nessa MESMA coluna
  //     estreita (66 px em `Fila`) reproduziria o EXATO defeito que
  //     `OVERFLOW_CELL` já corrigiu ali ("virava uma coluna de 13+ linhas
  //     de uma palavra cada").
  //   - (b) NÃO PODE usar OVERFLOW_CELL: o `Hoje` tem DOIS grupos de bloco
  //     lado a lado e as 4 vistas de notícia têm QUATRO tabelas lado a
  //     lado NA MESMA linha — `OVERFLOW_CELL` spilla até a primeira célula
  //     NÃO-vazia, e se o bloco/tabela VIZINHO também estiver vazio na
  //     mesma linha (cenário real, não hipotético), as DUAS mensagens se
  //     misturariam numa linha só. `WRAP`, confinado à largura do
  //     bloco/tabela, é a única opção segura ali.
  //   - fundo: (a) mora DENTRO do cromo (N1 por construção); (b) mora no
  //     PAPEL, ao lado de dado real na mesma coluna (N0 por construção).
  //     Nenhuma das duas é escolha — é onde a linha JÁ está.
  //
  // fontSize NÃO pode ser 9pt em (b): `ConditionalFormatRule.format` só
  // aceita `bold/italic/strikethrough/foregroundColor/backgroundColor`
  // (medido nesta mesma peça, ver o bloco de comentário grande em R-H1) —
  // CF não muda tamanho de fonte, e a coluna de (b) TAMBÉM hospeda dado
  // real (título de notícia, conteúdo do bloco) que tem que continuar no
  // corpo (10pt, T3) o resto do tempo. (a), ao contrário, é uma linha
  // RESERVADA — nunca hospeda dado real — e por isso é a única das três
  // com controle estático total. Erguer (a) de 9 pra 10pt (nunca baixar as
  // outras: CF não alcança) é o único movimento que os TRÊS locais podem
  // fazer juntos.
  const T_VAZIO = t(10, { italic: true, foregroundColor: C.N4 });
  for (const [aba, e] of Object.entries(F.ESTADO_VAZIO_DIGITADAS)) {
    const l = F.LINHAS[aba];
    // Recuado, nunca apagado: 5,11:1 sobre o campo do cromo, passa AA. Um
    // estado vazio ilegível é a mesma falha que um estado vazio ausente.
    // Zero fundo de cor, zero borda, zero ícone de alerta — um dia sem
    // tarefas NÃO é um erro, e pintá-lo de âmbar ensinaria que é.
    reqs.push(formato(
      faixa(id[aba], l.vazio - 1, l.vazio, 0, e.colunas),
      { textFormat: T_VAZIO, wrapStrategy: 'OVERFLOW_CELL' },
      'userEnteredFormat(textFormat,wrapStrategy)'
    ));
    reqs.push(autoAltura(id[aba], l.vazio));
  }

  // ------------------------------------------------------ formato de número
  const nf = (aba, col, linha0, linha1, pattern) => reqs.push({
    repeatCell: {
      range: faixa(id[aba], linha0 - 1, linha1, col, col + 1),
      cell: { userEnteredFormat: { numberFormat: pattern } },
      fields: 'userEnteredFormat.numberFormat'
    }
  });
  // Índice de coluna por RÓTULO, nunca por número escrito à mão. A ordem de
  // `Projetos` acabou de mudar (D6/D8) e um índice literal aqui aplicaria
  // máscara de data em cima de `próximas tarefas` — sem erro nenhum, só uma
  // coluna de texto que de repente vira `#VALUE!` ou, pior, nada.
  const iCol = (aba, rotulo) => F.CABECALHO_POR_ABA[aba].indexOf(rotulo);
  const direita = (aba, col, linha0, linha1) => reqs.push(formato(
    faixa(id[aba], linha0 - 1, linha1, col, col + 1),
    { horizontalAlignment: 'RIGHT' }, 'userEnteredFormat.horizontalAlignment'
  ));
  // V3 (Leva 6) — AUDITORIA ACHOU: toda coluna DATA/DIAS/INTEIRO recebia
  // `numberFormat` (a MÁSCARA), mas só 2 das 14 (`Fila!ordem`,
  // `Projetos!abertas`) recebiam `direita()` (o ALINHAMENTO). As outras 12
  // — TODAS as datas (`Diário!quando`, `Tarefas!prazo`/`criada em`,
  // `Fila!prazo`/`atualizado em`, `Candidaturas!inscrito em`,
  // `Projetos!prazo`/`movimentou`, `Etapas!ordem`/`quando`) e a outra coluna
  // de dias corridos (`Fila!parada há`) — ficavam alinhadas à ESQUERDA,
  // lendo como rótulo em vez de número, ao lado de colunas-irmãs que liam
  // certo. `direita()` já existia; ninguém tinha chamado ela pras outras 12.
  //
  // A CURA é estrutural, não 12 chamadas soltas: uma TABELA (aba, rótulo,
  // faixa de linha, máscara) alimenta `nf()` E `direita()` juntas — as duas
  // sempre andam para o mesmo endereço, então a próxima coluna DATA/número
  // que alguém acrescentar não pode ganhar a máscara e esquecer o
  // alinhamento (a classe exata de defeito que esta tabela mata).
  const FT = F.LINHAS[A.TAREFAS].dados, FF = F.LINHAS[A.FILA].dados, FD = F.LINHAS[A.DIARIO].dados,
    FC = F.LINHAS[A.CANDIDATURAS].lista, FP = F.LINHAS[A.PROJETOS].dados, FE = F.LINHAS[A.ETAPAS].dados;
  const COLUNAS_NUMERICAS = [
    [A.DIARIO, 'quando', FD, linhas[A.DIARIO], DATA],
    [A.TAREFAS, 'prazo', FT, linhas[A.TAREFAS], DATA],
    [A.TAREFAS, 'criada em', FT, linhas[A.TAREFAS], DATA],
    [A.FILA, 'ordem', FF, linhas[A.FILA], INTEIRO],
    [A.FILA, 'prazo', FF, linhas[A.FILA], DATA],
    [A.FILA, 'atualizado em', FF, linhas[A.FILA], DATA],
    // Onda 17 — `parada há` é a MESMA natureza que `Candidaturas!aguardando
    // há` (dias corridos derivados, não digitados): mesma máscara.
    [A.FILA, 'parada há', FF, linhas[A.FILA], DIAS],
    // Onda 5 — `Candidaturas`: âncora em `.lista` (o topo do spill), não
    // `.dados` (que esta aba não tem).
    [A.CANDIDATURAS, 'inscrito em', FC, linhas[A.CANDIDATURAS], DATA],
    [A.CANDIDATURAS, 'aguardando há', FC, linhas[A.CANDIDATURAS], DIAS],
    [A.PROJETOS, 'prazo', FP, F.PROJETOS_ULTIMA_LINHA, DATA],
    [A.PROJETOS, 'movimentou', FP, F.PROJETOS_ULTIMA_LINHA, DATA],
    [A.PROJETOS, 'abertas', FP, F.PROJETOS_ULTIMA_LINHA, INTEIRO],
    // Onda 14 — `Etapas`, `ordem`/`quando` são a mesma natureza de
    // `Fila!ordem`/`Diário!quando`.
    [A.ETAPAS, 'ordem', FE, linhas[A.ETAPAS], INTEIRO],
    [A.ETAPAS, 'quando', FE, linhas[A.ETAPAS], DATA]
  ];
  for (const [aba, rotulo, linha0, linha1, pattern] of COLUNAS_NUMERICAS) {
    const col = iCol(aba, rotulo);
    nf(aba, col, linha0, linha1, pattern);
    direita(aba, col, linha0, linha1);
  }

  // V1 (Leva 6) — `Candidaturas` não tem linha `vazio` dedicada (é vista de
  // spill, como as de notícia — ver `F.LINHAS[A.CANDIDATURAS]`), mas ao
  // contrário delas o spill inteiro é uma ÚNICA coluna de largura (nenhuma
  // tabela vizinha na mesma linha): o mesmo caso das 5 abas digitadas
  // acima, não o das vistas de notícia. `OVERFLOW_CELL` estático na coluna
  // `órgão/empresa` (a primeira do spill) resolve o corte de frase medido
  // ("↳ Nenhuma candidatura ainda." aparecia sozinho, sem o resto) — SEM
  // risco pro dado real: uma linha de candidatura de verdade sempre tem
  // `vaga` preenchida na coluna seguinte, que barra o spill (CLIP e
  // OVERFLOW_CELL rendem IDÊNTICOS quando o vizinho não está vazio).
  reqs.push({
    repeatCell: {
      range: faixa(id[A.CANDIDATURAS], F.LINHAS[A.CANDIDATURAS].lista - 1, linhas[A.CANDIDATURAS],
        iCol(A.CANDIDATURAS, 'órgão/empresa'), iCol(A.CANDIDATURAS, 'órgão/empresa') + 1),
      cell: { userEnteredFormat: { wrapStrategy: 'OVERFLOW_CELL' } },
      fields: 'userEnteredFormat.wrapStrategy'
    }
  });

  // ================== AFORDÂNCIA DE LINK (D2) ==================
  // A peça tinha UMA linguagem visual de link — acento `#0B5D57` + sublinhado
  // — e ela cobria 4 dos 10 destinos clicáveis: só a barra de navegação.
  // Medido no PDF renderizado do `Hoje` inteiro: o acento aparece 16 vezes,
  // que são exatamente os 4 links da nav × 2 páginas de cabeçalho congelado.
  // ZERO acento no corpo do painel. `📄 vaga`, `📄 edital`, os títulos de
  // bloco e a linha de transbordo saíam em preto de corpo, sem sublinhado,
  // indistinguíveis de um título. E a prova de que isso já incomodava alguém
  // estava escrita na nota `[5]` do cabeçalho de `Empregos`: "A coluna 'Abrir'
  // (na frente) leva você até lá". Quando a peça precisa EXPLICAR por escrito
  // que uma coluna é link, o link não está sendo visto.
  //
  // Regra, sem exceção: toda célula que É link usa a mesma linguagem visual da
  // nav. A coluna `Abrir` das três abas de radar é posição fixa, então é
  // formato estático; os links de dentro do `VSTACK` do `Hoje` são posição
  // variável e vão por formatação condicional (R-H1/R-H2, adiante).
  //
  // NOTA DE COMPOSIÇÃO, declarada: nas linhas que recuam (R-S3/R-S4), o
  // `foregroundColor` da regra condicional vence o acento e a coluna `Abrir`
  // recua junto com a linha. O SUBLINHADO permanece (a regra não o declara),
  // então a afordância não se perde — e recuar o link de uma linha de arquivo
  // é o comportamento certo: a linha inteira está fora do alcance.
  const T_LINK = { textFormat: t(10, { foregroundColor: C.ACENTO, underline: true }) };
  const linkEstatico = (aba, rotulo) => reqs.push(formato(
    faixa(id[aba], F.LINHAS[aba].lista - 1, linhas[aba], iCol(aba, rotulo), iCol(aba, rotulo) + 1),
    T_LINK, 'userEnteredFormat.textFormat'
  ));
  for (const aba of [A.PAINEL, A.TUDO, A.EMPREGOS]) linkEstatico(aba, 'Abrir');

  // ============================ FORMATAÇÃO CONDICIONAL ====================
  // ORÇAMENTO, declarado como número: numa tela cheia, no máximo 2 a 3
  // elementos podem puxar o olho. Como isso se cumpre por construção — o
  // fundo de cromo é CONSTANTE e depois do segundo dia vira moldura; fundo de
  // estado existe em 3 regras, todas exceção por definição; recessão não puxa
  // o olho, ela EMPURRA; e o emoji é uma FITA vertical de 84-128 px, não um
  // campo. Era a soma da fita com a faixa de linha inteira da mesma cor que
  // fazia a parede.
  // ÍNDICE DE REGRA É POR ABA, não global: `addConditionalFormatRule.index` é
  // a posição dentro da lista DAQUELA aba. Um contador único faria a segunda
  // aba pedir índice 3 numa lista de zero regras e a API recusaria o batch
  // inteiro — a planilha ficaria com a formatação antiga apagada e a nova não
  // aplicada. A ordem DENTRO da aba é o que importa e é o que este mapa
  // preserva: em `Tarefas`, as duas de fundo (prazo) antes da de recuo
  // (feita). Elas são excludentes por construção — as de prazo exigem
  // `<>"✅ feita"` — mas a ordem fica declarada porque a próxima regra que
  // alguém acrescentar não vai saber disso.
  const ix = {};
  const proximoIndice = aba => { ix[aba] = (ix[aba] || 0); return ix[aba]++; };
  // ONDA UX 9 (remodelação 2026-09-01), adendo Nahida F2/F5 mecanismo 4 —
  // TODA regra que passa por `cf()` cobria até `linhas[aba]` (o `rowCount`
  // VIVO no MOMENTO em que `formatar.js` rodou), não a coluna inteira. É
  // "range fixo" no sentido que importa: a REGRA, uma vez instalada, tem um
  // `endRowIndex` gravado — se a aba crescer depois (append de linha,
  // `values.update` além do `rowCount` de então) sem que `formatar.js` rode
  // de novo, a regra simplesmente NÃO COBRE a linha nova. Morre em silêncio,
  // exatamente a doutrina de mecanismo 4 (`REFERENCIAS-UX.md`): dívida que
  // não aparece até a próxima linha nascer fora do alcance.
  //
  // A cura é omitir `endRowIndex` (não passar `linhas[aba]`): o `GridRange`
  // da API do Sheets, sem fim declarado, cobre "até a última linha da
  // grade" DINAMICAMENTE — a regra passa a acompanhar o crescimento da aba
  // sozinha, sem depender de ninguém rodar `formatar.js` de novo. `faixa()`
  // com o 2º argumento de linha `undefined` já produz isso: `JSON.stringify`
  // remove a chave (ver `_norman/api.js batch`), e a API interpreta ausência
  // como "sem limite".
  const cf = (aba, colFim, formula, format, linha0) => {
    reqs.push(regraFormato(faixa(id[aba], (linha0 || (F.LINHAS[aba].lista || F.LINHAS[aba].dados)) - 1, undefined, 0, colFim), formula, format, proximoIndice(aba)));
  };
  // Variante de `cf()` com faixa de COLUNA explícita (`col0..col1`) e faixa
  // de LINHA explícita (`linha0..linha1`) — usada onde a regra precisa ficar
  // CONFINADA a um bloco de colunas (território de um grupo/tabela), não a
  // largura inteira da aba. `cf()` continua servindo pra regra que É larga
  // por natureza (ex.: R-P1/R-P2 de `Tarefas`).
  const cfCol = (aba, col0, col1, linha0, linha1, formula, format) => {
    reqs.push(regraFormato(faixa(id[aba], linha0 - 1, linha1, col0, col1), formula, format, proximoIndice(aba)));
  };
  const RECUO = { textFormat: { foregroundColor: C.N4 } };
  const nT = GEO[A.TAREFAS].cols.length, nF = GEO[A.FILA].cols.length;
  const dT = F.LINHAS[A.TAREFAS].dados, dF = F.LINHAS[A.FILA].dados;
  const dD = F.LINHAS[A.DIARIO].dados;
  const lP = F.LINHAS[A.PAINEL].lista, lE = F.LINHAS[A.EMPREGOS].lista, lU = F.LINHAS[A.TUDO].lista;

  // --- classe VOZ (Onda 16, 1 regra). "Duas vozes... a de JB pesa mais,
  // porque a planilha é dele" — o pedido literal. Durin é a voz BASE (sem
  // regra, nenhuma cor nova entra pra ele); JB ganha peso: fundo N1 (o
  // mesmo tom neutro-quente que já é o piso da paleta, nunca S1/S2 — essas
  // duas já significam "prazo em risco" em `Tarefas`, e reusá-las aqui faria
  // uma entrada de JB parecer um alarme de prazo) + negrito. Uma regra só
  // decide "quem pesa mais na tela", exatamente como o pedido descreveu.
  cf(A.DIARIO, GEO[A.DIARIO].cols.length, `=$B${dD}="JB"`,
    { backgroundColor: C.N1, textFormat: { bold: true } }, dD);

  // --- classe PRAZO (2 regras). Único lugar da peça onde uma data CRUA
  // precisa virar sinal: `Tarefas!E` está a 636 px da borda, não tem emoji e
  // não tem coluna. "Atrasada" é a única informação da planilha inteira que
  // não existe em nenhum outro canal — é o portador ABSOLUTO, e por isso é a
  // única regra de fundo que sobreviveu à auditoria.
  cf(A.TAREFAS, nT, `=AND($E${dT}<>"";$E${dT}<TODAY();$C${dT}<>"✅ feita")`,
    { backgroundColor: C.S1, textFormat: { foregroundColor: C.N3, bold: true } });          // R-P1  13,05:1
  // 2 dias e não 7: 7 faria a regra acender em quase toda tarefa com prazo e
  // devolveria a parede que a Lei da Faixa acabou de derrubar.
  cf(A.TAREFAS, nT, `=AND($E${dT}<>"";$E${dT}>=TODAY();$E${dT}-TODAY()<=2;$C${dT}<>"✅ feita")`,
    { backgroundColor: C.S2, textFormat: { foregroundColor: C.N3 } });                       // R-P2  14,72:1

  // --- classe STATUS (4 regras, ZERO cor de fundo). Um dispositivo, quatro
  // instâncias, um significado em toda a peça: texto N4 = "isto está fora do
  // seu alcance ou já acabou". É o que substitui as 12 regras de faixa mortas
  // e o conserto do `#999999` que reprovava (2,85:1 -> 5,77:1).
  cf(A.TAREFAS, nT, `=$C${dT}="✅ feita"`,
    { textFormat: { foregroundColor: C.N4, strikethrough: true } });                         // R-S1
  // `Fila!E` começa em 358 px — fora da dobra. O canal é necessário. Mas o
  // que importa é VIVO x MORTO, não qual estágio: `🟣 inscrito` e `🟢 avançou`
  // perdem o fundo porque não são o que se procura numa varredura.
  cf(A.FILA, nF, `=OR($E${dF}="🔴 recusado";$E${dF}="⚫ descartado")`, RECUO);              // R-S2

  // ------------- R-S3 / R-S4: O CONSERTO DE CLASSE (D4 + alarme) -------------
  //
  // Estas três regras casavam EMOJI. `Empregos` procurava `⚪|🗄` e o dado
  // emitia `❓ sem data` no balde 5: três linhas (`C537`, `C538`, `C543`) saíam
  // em PRETO CHEIO no meio de uma página inteira de cinza, com o peso máximo
  // da página — e eram justamente as linhas de que menos se sabe. O canal
  // visual de "isto é arquivo, não olhe com pressa" dizia o CONTRÁRIO, em 3 de
  // 544 linhas, sem erro em lugar nenhum.
  //
  // Emoji é RÓTULO: reescrito por decisão de texto, ganha seletor de variação,
  // troca de variante entre plataformas. O que as regras precisam é o ESTADO,
  // e ele já existe em número, já calculado, já numa coluna que a aba carrega:
  // o dígito de cima da chave de ordem (`INT($_ordem/ORDEM_FATOR)`) É o
  // balde/tier. O rótulo é DERIVADO dele — casar o derivado pra descobrir o que
  // o original já diz era a inversão que custou o D4.
  //
  // Nenhum glifo entra na fórmula. A letra da coluna sai do cabeçalho
  // (`letraDe`), o fator e os cortes saem de constantes exportadas, e
  // `verificar.js` fecha o laço contra o dado VIVO: para cada linha das abas de
  // radar ele compara o veredito numérico com o rótulo emoji e reprova se os
  // dois discordarem em uma linha que seja.
  const recuo = (aba, corte) => cf(
    aba, GEO[aba].cols.length,
    F.REGRA_RECUO(F.letraDe(F.CABECALHO_POR_ABA[aba], '_ordem'), F.LINHAS[aba].lista, corte),
    RECUO, F.LINHAS[aba].lista
  );
  recuo(A.PAINEL, F.TIER_FORA_DO_ALCANCE);   // R-S3  tier >= 3: só com doutorado, ou sem prazo
  recuo(A.EMPREGOS, F.BALDE_ARQUIVO);        // R-S4  balde >= 4: 31-90 d, + de 90 d E `❓ sem data`
  // Irmã de R-S3 na aba de arquivo. A spec visual não a previa porque ela
  // contava com a morte desta aba; ocultar em vez de fundir mantém a aba viva,
  // e agora ela tem a MESMA forma da `Concursos` — mesmo cabeçalho, mesma
  // coluna `_ordem`, mesma regra, corte diferente.
  recuo(A.TUDO, F.TIER_ENCERRADO);           // tier >= 4: encerrado ou sem prazo

  // --- R-S5/R-S6/R-S7: INSCRITO RECUA A LINHA (Onda 4, item 4c do briefing).
  // Mesmo dispositivo de R-S1 (`Tarefas` feita) e não um fundo novo: "isto já
  // foi resolvido, não precisa da sua atenção de novo" é EXATAMENTE o que
  // `✅ feita` já significa em `Tarefas`, e é também o que `FILA_ESTAGIOS_
  // FORA_DO_HOJE` já faz com `🟣 inscrito` (tira a linha da vista rápida do
  // painel). A régua vem do próprio dado — `INT(_ordem/FATOR)` já entra em
  // `recuo()` acima; aqui não há balde nenhum pra ler, só o boolean que JB
  // marcou, então a fórmula lê a própria coluna Inscrito.
  const inscritoRecua = (aba, cabecalho) => cf(
    aba, GEO[aba].cols.length,
    `=$${F.letraDe(cabecalho, 'Inscrito')}${F.LINHAS[aba].lista}=TRUE`,
    RECUO, F.LINHAS[aba].lista
  );
  inscritoRecua(A.PAINEL, F.DOCENTE_CABECALHO);
  inscritoRecua(A.TUDO, F.DOCENTE_CABECALHO);
  inscritoRecua(A.EMPREGOS, F.MERCADO_CABECALHO);

  // --- C1 (Leva 5) — DESCARTADO ESMAECE A LINHA. MESMO dispositivo de
  // `inscritoRecua` acima, gêmeo por construção: "❌" é o outro boolean que
  // JB marca na mesma linha, e "não me interessa" merece o MESMO recuo
  // visual que "já resolvido" — coluna INTEIRA (`GEO[aba].cols.length`),
  // nunca range fixo, texto N4 (o mesmo dispositivo RECUO, não um fundo
  // novo — a Lei da Faixa continua valendo).
  const descartadoRecua = (aba, cabecalho) => cf(
    aba, GEO[aba].cols.length,
    `=$${F.letraDe(cabecalho, '❌')}${F.LINHAS[aba].lista}=TRUE`,
    RECUO, F.LINHAS[aba].lista
  );
  descartadoRecua(A.PAINEL, F.DOCENTE_CABECALHO);
  descartadoRecua(A.TUDO, F.DOCENTE_CABECALHO);
  descartadoRecua(A.EMPREGOS, F.MERCADO_CABECALHO);

  // --- Onda 5-6 — `Candidaturas`.
  //
  // "aguardando há" ACENDE passado o limiar (mesma classe PRAZO de `Tarefas`
  // acima — cor de fundo é reservada pro sinal que o olho não pode perder).
  // Guarda `<>""` porque a coluna devolve string vazia quando `IFERROR`
  // captura (candidatura "— fora do radar —" sem data de inscrição válida).
  {
    const lC = F.LINHAS[A.CANDIDATURAS].lista;
    const colAg = F.CANDIDATURAS_COL_AGUARDANDO_LETRA;
    cf(A.CANDIDATURAS, GEO[A.CANDIDATURAS].cols.length,
      `=AND($${colAg}${lC}<>"";$${colAg}${lC}>${F.CANDIDATURAS_LIMIAR_AGUARDANDO_DIAS})`,
      { backgroundColor: C.S1, textFormat: { foregroundColor: C.N3, bold: true } });
    // classe STATUS (mesmo dispositivo R-S2 da `Fila`): "🔴 não passou" recua
    // — já resolvido (negativamente), não compete por atenção com o que
    // ainda está em jogo.
    const colEst = F.letraDe(F.CANDIDATURAS_CABECALHO, 'estágio');
    cf(A.CANDIDATURAS, GEO[A.CANDIDATURAS].cols.length, `=$${colEst}${lC}="🔴 não passou"`, RECUO);
    // V1 (Leva 6) — o marcador de estado vazio (`F.CANDIDATURAS_VAZIO`, topo
    // do spill) NUNCA tinha CF reconhecendo ele: saía com o estilo de DADO
    // normal (10pt reto, N3 — preto de corpo), a única das quatro/cinco
    // superfícies de "estado vazio" da peça sem o tom recuado. Mesmo padrão
    // de R-H3/`Hoje` e R-N2/notícia: reconhece o prefixo `↳` e aplica
    // itálico+N4 — a mesma tupla (cor/itálico) que o resto da peça usa pro
    // mesmo papel (tamanho e wrap continuam por `formato()` estático acima,
    // que é quem realmente controla os dois — CF não alcança fontSize).
    cf(A.CANDIDATURAS, GEO[A.CANDIDATURAS].cols.length,
      `=LEFT($A${lC};1)="${F.MARCADOR_VAZIO.trim()}"`,
      { textFormat: { foregroundColor: C.N4, italic: true } });
  }

  // --- classe ATENÇÃO (1 regra, 4 abas). É o conserto do alarme sem canal.
  // A regra LÊ O VEREDITO RENDERIZADO (`🛑` só entra na célula por
  // `AVISO_SYNC`) em vez de recalcular o critério, então ela não pode divergir
  // dele — a mesma doutrina de fonte única que matou `HOJE_LIMIAR_PARADO_DIAS`.
  // Uma fonte, um veredito, e agora um canal visual também.
  //
  // O GATILHO NÃO É MAIS UM GLIFO LITERAL AQUI. Ele era `"🛑"` escrito à mão
  // neste arquivo e `"🛑"` escrito à mão dentro de `AVISO_SYNC` — duas cópias
  // do mesmo caractere em dois arquivos, que é o defeito exato que acabou de
  // quebrar de verdade no D4. Aqui a consequência seria pior: uma reescrita da
  // mensagem sem o glifo, ou um seletor de variação a mais, apagaria o ÚNICO
  // canal visual do alarme exatamente no estado em que o silêncio é fatal — e
  // a peça continuaria parecendo certa, que é o modo de falha que este aviso
  // foi criado pra matar.
  //
  // Agora o glifo é `F.GLIFO_ALARME`, escrito e casado da mesma constante.
  // `construir.js` conta as ocorrências dele dentro de `AVISO_SYNC` e estoura
  // se não forem `F.ALARME_RAMOS`; `verificar.js` lê a regra VIVA da planilha
  // e reprova se o padrão dela não for exatamente esta constante.
  //
  // ATUALIZADO (N5). Duas coisas mudaram, e as duas eram defeito:
  //
  //   (a) A COBERTURA. A regra existia em 4 abas. As 4 abas de NOTICIA - que
  //       EMITEM o aviso em `A2` - nao tinham regra nenhuma, e as 4 DIGITADAS
  //       nao tinham nem o aviso. Oito das doze abas de vista podiam mostrar
  //       um portal parado sem um pixel dizendo isso. Agora sao as doze, e
  //       quem decide qual maquina cada uma escuta e `F.ALARME_ABAS`.
  //
  //   (b) O GATILHO. Era `REGEXMATCH($A$2;"<glifo>")` - casar o GLIFO, que e a
  //       mesma classe que o D4 acabou de abandonar por ter falhado de
  //       verdade. Por o glifo numa constante matou a divergencia entre dois
  //       ARQUIVOS e nao matou a classe: mensagem reescrita, seletor de
  //       variacao colado, variante trocada pela plataforma, e o unico canal
  //       visual do alarme apaga em silencio, no estado em que o silencio e
  //       fatal. Agora a regra le o ESTADO (o atraso em dias, um numero) pelos
  //       MESMOS builders que escrevem o texto - ver `F.alarmeCF` e o bloco
  //       "O GATILHO DEIXOU DE SER O GLIFO" em formulas.js. O glifo continua na
  //       mensagem porque e bom sinal humano; ele so parou de ser o mecanismo.
  //
  // A LINHA que a regra pinta vem de `F.alarmeLinha`: o veredito onde ele
  // existe, o estado vazio nas quatro digitadas (a unica linha de cromo delas
  // que nao e nav nem cabecalho, e ela ja e mesclada e congelada).
  const ALARME = { backgroundColor: C.S1, textFormat: { foregroundColor: C.N3, bold: true } };
  for (const [aba, pipelines] of Object.entries(F.ALARME_ABAS)) {
    const lv = F.alarmeLinha(aba);
    if (!lv) throw new Error(`${aba} esta em F.ALARME_ABAS e nao tem linha de veredito nem de estado vazio pra pintar`);
    reqs.push(regraFormato(faixa(id[aba], lv - 1, lv, 0, GEO[aba].cols.length), F.alarmeCF(pipelines), ALARME, proximoIndice(aba))); // R-A1
  }

  // --- anatomia do bloco de `Hoje` (3 regras POR GRUPO — C10 Parte 3 deitou
  // os seis blocos em DOIS grupos de coluna, então cada regra vira 2×). NÃO
  // são "estado": são a ANATOMIA, e existem como formatação condicional
  // porque cada `VSTACK` (um por grupo) tornou toda posição variável DENTRO
  // dele. O negrito por posição (`HOJE_POSICOES`) que existia aqui
  // QUEBRARIA no dia em que o VSTACK entrasse — que é hoje. Formato por
  // CONTEÚDO sobrevive; formato por posição não.
  //
  // C10 Parte 3 — O ESCOPO MUDOU, a mesma lição da camada notícia (C10
  // Parte 2): antes (um grupo só) a banda podia varrer a LARGURA TODA da
  // aba lendo só a coluna A, porque só havia UM título por linha possível.
  // Com DOIS grupos na MESMA linha, cada um tem seu PRÓPRIO título (em A ou
  // em F) — uma regra de largura cheia lendo só `$A` pintaria a banda do
  // grupo 0 em cima do CONTEÚDO do grupo 1 (ou vice-versa). Cada regra fica
  // CONFINADA ao bloco de colunas do seu grupo (`cfCol`), e lê a `$coluna`
  // DAQUELE grupo (`hojeColunaBaseGrupo`).
  const lH = F.LINHAS[A.HOJE].lista;
  const hojeAteLinha = F.hojeUltimaLinha();
  F.HOJE_GRUPOS_COLUNA.forEach((_, g) => {
    const col0 = F.hojeColunaBaseGrupo(g);
    const col1 = col0 + F.HOJE_GRUPO_LARGURA;
    const alvo = `$${F.colunaLetra(col0)}${lH}`;
    // R-H1 — a BANDA do título. Ela substitui a régua e é um separador MAIS
  // forte que uma régua, o que dispensa somar os dois. O padrão vem da
  // constante de glifos (F.HOJE_REGEX_TITULO), nunca de literal.
  // O TÍTULO É LINK, E PASSA A PARECER UM (D2). Ele era N3 bold — preto de
  // corpo, sem sublinhado, indistinguível de um cabeçalho — e no entanto é o
  // ÚNICO caminho de um toque do `Hoje` pra `Fila` e pra `Projetos`: a barra
  // de nav do `Hoje` cobre `Concursos`, `Empregos`, `Tarefas` e `Diário`, e
  // essas duas não estão nela. Os dois jobs cujo ganho a spec vendeu como
  // 22→7 e 10→2 dependiam de um link que ninguém tinha como descobrir.
  //
  // A decisão de Durin é que toda célula que É link usa a mesma linguagem
  // visual da nav: acento + sublinhado. Dentro do `Hoje` o SUBLINHADO É
  // IMPOSSÍVEL, e não por gosto — a API recusa o request:
  //
  //   "ConditionalFormatRule.format only supports bold, italic, strikethrough,
  //    foreground color and background color."
  //
  // (HTTP 400, medido nesta Onda, não deduzido de documentação.) E dentro do
  // `Hoje` tudo é formatação CONDICIONAL, porque o `VSTACK` único tornou toda
  // posição variável: título, corpo e rodapé dividem a mesma coluna A e só se
  // distinguem por CONTEÚDO. Formato estático ali sublinharia a lista inteira.
  //
  // Então o canal que atravessa é a COR, e ela atravessa: 7,73:1 sobre papel,
  // 6,85:1 sobre a banda do título — e é o MESMO acento da nav, que é o que
  // faz o vocabulário ser um só. O bold e a banda N1 ficam: eles separam o
  // título do corpo, não o link do texto.
  //
  // Registrado como limite de plataforma, não como preferência: a §5.3 da spec
  // visual escolheu "título não sublinhado" por argumento de composição, e
  // acontece que aqui não havia escolha nenhuma pra fazer.
    cfCol(A.HOJE, col0, col1, lH, hojeAteLinha, `=REGEXMATCH(${alvo};"${F.HOJE_REGEX_TITULO}")`,
      { backgroundColor: C.N1, textFormat: { foregroundColor: C.ACENTO, bold: true } });
    // R-H2 — rodapé de transbordo ("+ N não cabem aqui"). TAMBÉM é HYPERLINK, e
    // saía em N4 ITÁLICO, que é a linguagem do texto RECUADO desta peça — o
    // oposto exato de "toque aqui". Vira acento, e o itálico sai: recuo e
    // convite não podem ser a mesma tinta.
    cfCol(A.HOJE, col0, col1, lH, hojeAteLinha, `=REGEXMATCH(${alvo};"^\\+ ")`, { textFormat: { foregroundColor: C.ACENTO } });
    // R-H3 — instrução de estado vazio. `↳` é BMP (uma unidade de código), então
    // sobrevive a `LEFT(...;1)` — emoji astral não sobreviveria.
    cfCol(A.HOJE, col0, col1, lH, hojeAteLinha, `=LEFT(${alvo};1)="${F.MARCADOR_VAZIO.trim()}"`,
      { textFormat: { foregroundColor: C.N4, italic: true } });
  });

  // --- anatomia do bloco das VISTAS DE NOTÍCIA (2 regras POR TABELA, 4
  // tabelas por aba — C10 Parte 2 deitou as tabelas lado a lado).
  //
  // Mesma família das três do `Hoje`, e pelo mesmo motivo: dentro de UMA
  // tabela, título · notícia · linha de meta dividem a MESMA coluna
  // (`título` daquela tabela) e só se distinguem por CONTEÚDO. Formato
  // estático ali pintaria os três iguais. C10 Parte 2 muda o ESCOPO da
  // regra, não a lógica: antes (Onda 8-9) as três tabelas dividiam a MESMA
  // coluna em linhas diferentes, então UMA regra de largura cheia bastava;
  // agora cada tabela tem SUA PRÓPRIA coluna `título`, na MESMA linha, então
  // a regra precisa ser por TABELA — `col0`/`col1` restringem o range ao
  // bloco de colunas daquela tabela, e a fórmula lê a `título` DAQUELA
  // tabela (`$col$linha`, coluna fixa, linha fixa — banda column-scoped).
  //
  // A DIFERENÇA PARA O `Hoje`, e ela é deliberada: lá o título do bloco É
  // link (leva à aba de origem) e por isso é ACENTO. Aqui a origem é
  // `notícias (não edite)`, que é OCULTA — link pra aba oculta não navega, e
  // pintar de acento um título que não leva a lugar nenhum ensinaria uma
  // afordância falsa. O título de tabela sai em N3 negrito sobre a banda; o
  // acento fica reservado ao que É clicável, que aqui é a notícia.
  // As duas regras casam a coluna do SPILL (`título`), não a de `Abrir`: cada
  // tabela tem sua PRÓPRIA calha de ação, que fica VAZIA nas linhas de
  // estrutura — lê-la pra decidir a banda pintaria só as linhas com link, o
  // contrário exato do que a regra quer. `cfCol` é a mesma função que o
  // bloco do `Hoje` já usa, acima (N territórios, mesma ferramenta).
  for (const aba of A.VISTAS_NOTICIA) {
    const lN = F.LINHAS[aba].lista;
    const ateN = F.noticiaUltimaLinha(aba);
    F.NOTICIA_FAIXAS.forEach((_, i) => {
      const col0 = F.noticiaColunaBase(i);
      const col1 = col0 + F.NOTICIA_LARGURA_TABELA;
      const alvo = `$${F.noticiaLetra(i, F.NOTICIA_COL_LISTA)}${lN}`;
      // R-N1 — a banda do título de tabela. Padrão vindo da constante de
      // glifos, nunca literal (F.NOTICIA_REGEX_TITULO).
      cfCol(aba, col0, col1, lN, ateN, `=REGEXMATCH(${alvo};"${F.NOTICIA_REGEX_TITULO}")`,
        { backgroundColor: C.N1, textFormat: { foregroundColor: C.N3, bold: true } });
      // R-N2 — linha recuada: estado vazio E transbordo. As duas são META,
      // não dado e não convite, e por isso dividem o mesmo marcador e a
      // mesma tinta. `↳` é BMP (uma unidade de código) e sobrevive a
      // `LEFT(...;1)`.
      cfCol(aba, col0, col1, lN, ateN, `=LEFT(${alvo};1)="${F.MARCADOR_VAZIO.trim()}"`,
        { textFormat: { foregroundColor: C.N4, italic: true } });
    });
  }
  // A coluna `Abrir` de cada tabela é POSIÇÃO FIXA (spill próprio, sempre na
  // mesma coluna), então ela recebe a linguagem de link ESTÁTICA — acento E
  // sublinhado, o vocabulário inteiro, ao contrário dos links do `Hoje`, que
  // vivem dentro de um spill e por isso só conseguem a cor. C10 Parte 2:
  // QUATRO chamadas por aba agora (uma por tabela), não uma só.
  for (const aba of A.VISTAS_NOTICIA) {
    const ateN = F.noticiaUltimaLinha(aba);
    F.NOTICIA_FAIXAS.forEach((_, i) => {
      const col = F.noticiaColuna0(i, F.NOTICIA_COL_ABRIR);
      reqs.push(formato(
        faixa(id[aba], F.LINHAS[aba].lista - 1, ateN, col, col + 1),
        T_LINK, 'userEnteredFormat.textFormat'
      ));
    });
  }

  // ------------------------------------------------------------ validação
  const val = (aba, col, ate, condicao) => reqs.push(validacao(
    faixa(id[aba], F.LINHAS[aba].dados - 1, ate, col, col + 1), condicao
  ));
  val(A.FILA, iCol(A.FILA, 'trilha'), linhas[A.FILA], listaUm(...F.FILA_TRILHAS));
  val(A.FILA, iCol(A.FILA, 'estágio'), linhas[A.FILA], listaUm(...F.FILA_ESTAGIOS));
  val(A.FILA, iCol(A.FILA, 'quem age'), linhas[A.FILA], listaUm(...F.QUEM_AGE));
  // C3 (Leva 5) — `⭐` (prioridade de JB), mesmo vocabulário em `Fila` e em
  // `Candidaturas` (abaixo): `F.PRIORIDADE_JB`, declarado uma vez.
  val(A.FILA, iCol(A.FILA, '⭐'), linhas[A.FILA], listaUm(...F.PRIORIDADE_JB));
  // `Candidaturas` (Onda 5) não tem `.dados` — a primeira linha DIGITÁVEL é
  // `.lista` (o topo do spill, mesma linha que `A.CANDIDATURAS`, `estágio`
  // já nasce ali por padrão). Chamada direta, fora de `val()`, por isso.
  reqs.push(validacao(
    faixa(id[A.CANDIDATURAS], F.LINHAS[A.CANDIDATURAS].lista - 1, linhas[A.CANDIDATURAS],
      iCol(A.CANDIDATURAS, 'estágio'), iCol(A.CANDIDATURAS, 'estágio') + 1),
    listaUm(...F.CANDIDATURAS_ESTAGIOS)
  ));
  // C3 — `⭐` de `Candidaturas`, mesma forma (spill, sem `.dados`).
  reqs.push(validacao(
    faixa(id[A.CANDIDATURAS], F.LINHAS[A.CANDIDATURAS].lista - 1, linhas[A.CANDIDATURAS],
      iCol(A.CANDIDATURAS, '⭐'), iCol(A.CANDIDATURAS, '⭐') + 1),
    listaUm(...F.PRIORIDADE_JB)
  ));
  // 50 é folga acima de PROJETOS_ULTIMA_LINHA pra JB cadastrar frentes novas
  // sem esbarrar no fim do dropdown — número independente, medido como
  // "espaço confortável pra crescer".
  const PROJETOS_VALIDACAO_ATE = 50;
  val(A.PROJETOS, iCol(A.PROJETOS, 'estágio'), PROJETOS_VALIDACAO_ATE, listaUm(...F.PROJETOS_ESTAGIOS));
  val(A.PROJETOS, iCol(A.PROJETOS, 'quem age'), PROJETOS_VALIDACAO_ATE, listaUm(...F.QUEM_AGE));
  // GUARDA — o alcance do dropdown `ONE_OF_RANGE` de `Tarefas!B` tem que
  // bater com o alcance REAL das colunas calculadas de `Projetos`. As duas
  // fórmulas usam a MESMA constante, então divergir exigiria editar uma sem
  // editar a outra; este `startsWith` é a rede pra esse "quase impossível".
  if (!F.PROJETOS_RANGE_NOME.startsWith(`${A.PROJETOS}!$A$${F.PROJETOS_PRIMEIRA_LINHA}:$A$`)) {
    throw new Error(`F.PROJETOS_RANGE_NOME fora do formato esperado: ${F.PROJETOS_RANGE_NOME}`);
  }
  val(A.TAREFAS, iCol(A.TAREFAS, 'projeto'), linhas[A.TAREFAS], rangeUm(`=${F.PROJETOS_RANGE_NOME}`));
  val(A.TAREFAS, iCol(A.TAREFAS, 'estágio'), linhas[A.TAREFAS], listaUm(...F.TAREFAS_ESTAGIOS));
  val(A.TAREFAS, iCol(A.TAREFAS, 'quem age'), linhas[A.TAREFAS], listaUm(...F.QUEM_AGE));
  // Onda 15 — as três colunas novas. `bloqueada por` é dropdown sobre a
  // MESMA coluna A de `Tarefas` (uma tarefa aponta pro NOME de outra) —
  // `ONE_OF_RANGE` sobre um range aberto da própria aba, mesmo padrão que
  // `Tarefas!projeto`/`Diário!sobre` já usam pra apontar pra outra aba.
  val(A.TAREFAS, iCol(A.TAREFAS, 'esforço'), linhas[A.TAREFAS], listaUm(...F.TAREFAS_ESFORCOS));
  val(A.TAREFAS, iCol(A.TAREFAS, 'bloqueada por'), linhas[A.TAREFAS],
    rangeUm(`=${A.TAREFAS}!$A$${F.LINHAS[A.TAREFAS].dados}:$A$1000`));
  val(A.TAREFAS, iCol(A.TAREFAS, 'recorrente'), linhas[A.TAREFAS], listaUm(...F.TAREFAS_RECORRENTES));
  val(A.DIARIO, iCol(A.DIARIO, 'voz'), linhas[A.DIARIO], listaUm(...F.DIARIO_QUEM));
  // `Diário!C` (sobre) ganha o MESMO dropdown de projeto que `Tarefas!B`. Sem
  // ele, esta coluna era texto livre — e `Projetos!G`/`K` casam ela com o nome
  // do projeto por IGUALDADE EXATA DE STRING. Um acento a menos, um espaço
  // sobrando, e a movimentação nunca aparece, sem erro nenhum na tela. É a
  // mesma classe de falha silenciosa que `Tarefas!B` já tinha coberto.
  val(A.DIARIO, iCol(A.DIARIO, F.DIARIO_ROTULO_SOBRE), linhas[A.DIARIO], rangeUm(`=${F.PROJETOS_RANGE_NOME}`));

  // Onda 14 — `Etapas`. `projeto` casa com `Projetos!A` (mesma lei que
  // `Tarefas!projeto`/`Diário!sobre`); `estado`/`quem` são listas fechadas.
  val(A.ETAPAS, iCol(A.ETAPAS, 'projeto'), linhas[A.ETAPAS], rangeUm(`=${F.PROJETOS_RANGE_NOME}`));
  val(A.ETAPAS, iCol(A.ETAPAS, 'estado'), linhas[A.ETAPAS], listaUm(...F.ETAPAS_ESTADOS));
  val(A.ETAPAS, iCol(A.ETAPAS, 'quem'), linhas[A.ETAPAS], listaUm(...F.QUEM_AGE));

  // O SELETOR DE RECORTE SAIU (Onda 8-9) — era a única célula digitável das
  // quatro vistas de notícia; não existe mais controle nenhum ali pra
  // validar (quatro tabelas sempre visíveis, desde C10, sem seletor).

  // O CHECKBOX "Inscrito" (Onda 4) — o PRIMEIRO `BOOLEAN` do projeto. Mesmo
  // motivo do seletor de recorte acima pra não usar `val()`: `val()` ancora
  // em `F.LINHAS[aba].dados`, que só as abas DIGITADAS têm — `Concursos`,
  // `Concursos · tudo` e `Empregos` são abas de FÓRMULA e usam `.lista`. A
  // faixa vai até `linhas[aba]` (o `rowCount` VIVO da grade, o mesmo limite
  // que o "papel" de baixo já usa lá em cima) — não até `F.LINHAS[aba].lista`
  // sozinho, porque o check tem que alcançar qualquer linha que o `SORT`
  // algum dia preencha, não só a de hoje.
  for (const [aba, cabecalho] of [[A.PAINEL, F.DOCENTE_CABECALHO], [A.TUDO, F.DOCENTE_CABECALHO], [A.EMPREGOS, F.MERCADO_CABECALHO]]) {
    const col = F.letraDe(cabecalho, 'Inscrito').charCodeAt(0) - 65;
    reqs.push(validacao(faixa(id[aba], F.LINHAS[aba].lista - 1, linhas[aba], col, col + 1), { type: 'BOOLEAN' }));
  }
  // C1 (Leva 5) — o checkbox `❌` (descarte), IRMÃO do de `Inscrito` acima:
  // mesmo tipo, mesma faixa (`.lista`..`linhas[aba]`), mesma razão.
  for (const [aba, cabecalho] of [[A.PAINEL, F.DOCENTE_CABECALHO], [A.TUDO, F.DOCENTE_CABECALHO], [A.EMPREGOS, F.MERCADO_CABECALHO]]) {
    const col = F.letraDe(cabecalho, '❌').charCodeAt(0) - 65;
    reqs.push(validacao(faixa(id[aba], F.LINHAS[aba].lista - 1, linhas[aba], col, col + 1), { type: 'BOOLEAN' }));
  }

  // ------------------------------------------------------- filtro (funil)
  // `Concursos` ENTRA aqui — ela não tinha funil nenhum. Não tinha porque não
  // tinha o que filtrar: UF, área e órgão estavam fundidos dentro da string
  // composta de `Vaga`, e as duas colunas que sobravam (`Vaga`, praticamente
  // única por linha e reescrita todo dia, e `Situação`, composta com o prazo)
  // não cortam nada. Agora que a aba herdou a forma da trilha, as quatro
  // facetas existem e o funil tem trabalho.
  //
  for (const aba of [A.PAINEL, A.TUDO, A.EMPREGOS]) {
    const l = F.LINHAS[aba];
    reqs.push({ setBasicFilter: { filter: { range: faixa(id[aba], l.cabecalho - 1, linhas[aba], 0, GEO[aba].cols.length) } } });
  }

  // AS QUATRO VISTAS DE NOTÍCIA (Onda 8-9 + C10) — QUATRO FUNIS por aba, um
  // por tabela (hoje/7d/15d/30d), não um só. `setBasicFilter` é ÚNICO por
  // aba — a API só aceita UM `basicFilter` por sheet —, então funis
  // independentes (Onda 9: "filtrar numa não pode quebrar as outras")
  // exigem `addFilterView`: um objeto por tabela, cada um com seu PRÓPRIO
  // range.
  //
  // C10 Parte 2 — o range MUDOU DE EIXO. Onda 8-9 (tabelas empilhadas na
  // MESMA coluna): cada funil cobria a LARGURA TODA da aba, numa FATIA DE
  // LINHAS própria por tabela. C10 (tabelas lado a lado, MESMA linha): cada
  // funil cobre a ALTURA TODA que qualquer tabela pode ocupar
  // (`F.noticiaUltimaLinha`), numa FATIA DE COLUNAS própria por tabela
  // (`F.noticiaColunaBase(i)` .. `+F.NOTICIA_LARGURA_TABELA`) — os quatro
  // ranges são disjuntos por COLUNA agora, não por LINHA, mas a garantia é a
  // mesma: nenhum funil pode tocar a área de outra tabela.
  //
  // A linha de título vira o "cabeçalho" do funil: é onde a seta de filtro
  // aparece.
  //
  // O QUE O FUNIL NÃO FAZ, dito aqui pra ninguém contar de novo como se
  // fizesse: ele NÃO alcança o que ficou fora do top 20 daquela tabela — o
  // `ARRAY_CONSTRAIN` já cortou em `NOTICIA_TETO` antes de a célula existir,
  // e funil só esconde linha que existe. O que sobrou fora do top 20
  // continua acessível pelo transbordo contado (rodapé) — não pelo funil.
  for (const aba of A.VISTAS_NOTICIA) {
    const linha0 = F.LINHAS[aba].lista - 1;
    const linha1 = F.noticiaUltimaLinha(aba);
    F.NOTICIA_FAIXAS.forEach((faixaInfo, i) => {
      const col0 = F.noticiaColunaBase(i);
      const col1 = col0 + F.NOTICIA_LARGURA_TABELA;
      reqs.push({
        addFilterView: {
          filter: {
            // ONDA UX 7 — o NOME do filtro usa `faixaInfo.codigo` ('hoje' /
            // '7d' / '15d' / '30d'), não `faixaInfo.rotulo`: o rótulo agora
            // pode ser DINÂMICO (dias reais de cobertura, não a janela
            // nominal) e, com o store mais novo que várias janelas ao mesmo
            // tempo, duas tabelas da MESMA aba podem legitimamente exibir o
            // MESMO texto ("top 20 · últimos 5 dias" nas três, se o store
            // só tem 5 dias) — a API do Sheets rejeita `addFilterView` com
            // nome duplicado (medido ao vivo: HTTP 400 "This view name
            // already exists"). `codigo` é interno (JB nunca vê), estável e
            // sempre único por aba — o nome do filtro nunca precisou ser o
            // rótulo visível.
            title: `${aba} · ${faixaInfo.codigo}`,
            range: faixa(id[aba], linha0, linha1, col0, col1)
          }
        }
      });
    });
  }

  // -------------------------------------------- `dados (não edite)`: a exceção
  // A aba da máquina CONTINUA parecendo tabela porque ela É tabela. É o único
  // lugar da peça onde "parece planilha" é a leitura certa: 750 linhas x 23
  // colunas de dado cru, apagadas e reescritas todo dia, que ninguém lê como
  // lista — só como matriz, pra conferir uma célula. Sem nav: `lib/sheets.js
  // enviar()` faz clear + escrita ancorada em A1 todo dia, e qualquer link ali
  // seria apagado de madrugada, em silêncio.
  reqs.push({
    updateSheetProperties: {
      properties: { sheetId: id[A.DADOS], gridProperties: { frozenRowCount: F.LINHAS[A.DADOS].congelado, hideGridlines: false } },
      fields: 'gridProperties.frozenRowCount,gridProperties.hideGridlines'
    }
  });
  reqs.push(formato(
    faixa(id[A.DADOS], 0, 1, 0, 26),
    { backgroundColor: C.N1, textFormat: T4_CABECALHO, wrapStrategy: 'CLIP', verticalAlignment: 'MIDDLE' },
    'userEnteredFormat(backgroundColor,textFormat,wrapStrategy,verticalAlignment)'
  ));

  // `notícias (não edite)`: MESMO tratamento, pelo mesmo motivo. Ela é a
  // segunda aba de máquina da planilha — 1200+ linhas de espelho de um
  // JSONL, apagadas e reescritas a cada sincronização. Grade LIGADA (é
  // matriz, não lista), cabeçalho congelado, sem nav. A diferença pra
  // `dados` é só que esta fica OCULTA: ninguém confere notícia célula a
  // célula, e um slot da barra do celular é caro demais pra isso.
  reqs.push({
    updateSheetProperties: {
      properties: { sheetId: id[A.NOTICIAS_DADOS], gridProperties: { frozenRowCount: F.LINHAS[A.NOTICIAS_DADOS].congelado, hideGridlines: false } },
      fields: 'gridProperties.frozenRowCount,gridProperties.hideGridlines'
    }
  });
  reqs.push(formato(
    faixa(id[A.NOTICIAS_DADOS], 0, 1, 0, 26),
    { backgroundColor: C.N1, textFormat: T4_CABECALHO, wrapStrategy: 'CLIP', verticalAlignment: 'MIDDLE' },
    'userEnteredFormat(backgroundColor,textFormat,wrapStrategy,verticalAlignment)'
  ));

  // --------------------------------------------------------- cor da aba
  // Um sinal, um significado: vermelho = aba da máquina. Colorir também as de
  // leitura gastaria o único código de cor da barra pra não dizer nada.
  // Rejeitado explicitamente: colorir por camada (VISTA x ESTADO). Depois da
  // linha de nav, a tira vira FALLBACK — obrigar JB a aprender uma legenda
  // pra um mecanismo secundário é cobrar caro por pouco.
  for (const aba of [A.DADOS, A.CALC, A.NOTICIAS_DADOS]) {
    reqs.push({ updateSheetProperties: { properties: { sheetId: id[aba], tabColorStyle: { rgbColor: hex('#D93025') } }, fields: 'tabColorStyle' } });
  }

  // -------------------------------------------------- notas e proteção
  //
  // N4 — APAGAR ANTES DE ESCREVER, e este é o conserto de classe.
  //
  // `note` é propriedade da CÉLULA: sobrevive ao `values.clear` do sync, ao
  // `limpar()` do construir.js e a qualquer reordenação de coluna. Este bloco
  // só ESCREVIA as notas declaradas — nunca apagava as que ficaram para trás.
  // No dia em que `Projetos` ganhou duas colunas no meio e `Concursos` ganhou
  // `UF`/`Área`, a nota nova foi pra coluna certa e a VELHA continuou onde
  // estava: 14 notas coladas na célula errada, três delas dizendo
  // "CALCULADA — não digite aqui" em colunas que JB PRECISA digitar.
  //
  // E o pior: isso passava em toda auditoria, porque o cheque C3 do
  // `verificar.js` perguntava se a nota DECLARADA existe — nunca se existe
  // nota que ninguém declarou.
  //
  // A limpeza cobre a FAIXA DE CROMO inteira de cada aba (linha 1 até
  // `F.ultimoCromo`, todas as colunas da grade) porque é exatamente onde toda
  // nota desta peça mora: nav, veredito, contagem, recorte e cabeçalho. Não
  // desce pro dado — nota que JB escrever numa linha sua é dele, e apagar
  // dado humano pra consertar cromo seria trocar um defeito por outro pior.
  // Vem ANTES das escritas no mesmo array: `batchUpdate` executa em ordem.
  let nApagadas = 0;
  for (const aba of Object.keys(N.NOTAS)) {
    const ate = F.ultimoCromo(aba);
    const nCols = (props[aba].gridProperties || {}).columnCount || 26;
    reqs.push({
      repeatCell: {
        range: faixa(id[aba], 0, ate, 0, nCols),
        cell: { note: '' },
        fields: 'note'
      }
    });
    nApagadas++;
  }
  let nNotas = 0;
  for (const [aba, itens] of Object.entries(N.NOTAS)) {
    for (const [linha, coluna, texto] of itens) {
      if (linha >= F.ultimoCromo(aba)) {
        throw new Error(
          `nota de ${aba} declarada na linha ${linha + 1}, fora da faixa de cromo (1..${F.ultimoCromo(aba)}). ` +
          'A limpeza de nota só cobre o cromo — uma nota abaixo dele nasceria sem o par apaga+escreve e voltaria a envelhecer muda.'
        );
      }
      reqs.push(nota(id[aba], linha, coluna, texto));
      nNotas++;
    }
  }
  // A faixa NÃO protegida de cada aba, quando ela tem uma — desde a Onda 4,
  // a coluna Inscrito em `Concursos`/`Concursos · tudo`/`Empregos`: sem esta
  // exceção, o aviso "isto é gerado, cuidado ao editar" apareceria toda vez
  // que JB tocasse o checkbox. As vistas de notícia NÃO têm mais exceção
  // nenhuma aqui (Onda 8-9 — o seletor de recorte, que era a exceção, saiu
  // junto com o controle): `naoProtegidas` devolve `null` pra elas, e a
  // proteção cobre a aba inteira, como `PROTECAO` já diz (`GERADA`, sem a
  // ressalva).
  const naoProtegidas = aba => {
    const cabInscrito = aba === A.EMPREGOS ? F.MERCADO_CABECALHO : (aba === A.PAINEL || aba === A.TUDO ? F.DOCENTE_CABECALHO : null);
    if (cabInscrito) {
      const col = F.letraDe(cabInscrito, 'Inscrito').charCodeAt(0) - 65;
      // C1 (Leva 5) — `❌` é a MESMA exceção que `Inscrito`: checkbox pra
      // JB tocar, nunca fórmula. Duas faixas de 1 coluna (não-contíguas).
      const colDesc = F.letraDe(cabInscrito, '❌').charCodeAt(0) - 65;
      return [
        faixa(id[aba], F.LINHAS[aba].lista - 1, linhas[aba], col, col + 1),
        faixa(id[aba], F.LINHAS[aba].lista - 1, linhas[aba], colDesc, colDesc + 1)
      ];
    }
    // Onda 5 — `Candidaturas`: G:L (estágio/próximo passo/notas/⭐/por quê/
    // link retomada — LEVA 5 acrescentou os do meio, LEVA 7 o último)
    // inteiras, contíguas — mesmo espírito da exceção acima, só que 6
    // colunas agora.
    if (aba === A.CANDIDATURAS) {
      const c0 = iCol(A.CANDIDATURAS, 'estágio');
      const c1 = iCol(A.CANDIDATURAS, 'link retomada') + 1;
      return [faixa(id[aba], F.LINHAS[aba].lista - 1, linhas[aba], c0, c1)];
    }
    return null;
  };
  for (const [aba, descricao] of Object.entries(N.PROTECAO)) reqs.push(protege(id[aba], descricao, naoProtegidas(aba)));

  const enviar = reqs.filter(soDoPiloto);
  const nValidacoes = enviar.filter(r => r.setDataValidation).length;
  const nCF = enviar.filter(r => r.addConditionalFormatRule).length;
  const nProt = enviar.filter(r => r.addProtectedRange).length;

  await a.batch(enviar);
  console.log(`formatação aplicada${piloto ? ` [PILOTO: só ${piloto}]` : ''}:`, enviar.length, 'requests |', nCF, 'regra(s) condicional(is) |',
    enviar.filter(r => r.repeatCell && r.repeatCell.fields === 'note').length, 'nota(s) |', nValidacoes, 'validação(ões) |', nProt, 'aba(s) protegida(s) com aviso');
  if (!piloto) {
    console.log('  paleta:', Object.entries(PALETA).map(([k, v]) => `${k} ${v}`).join(' · '));
    console.log('  grade desligada em', HUMANAS.length, 'aba(s) humana(s); ligada em', A.DADOS);
    console.log(`  ${nNotas} nota(s) declarada(s) em _norman/notas.js; faixa de cromo de ${nApagadas} aba(s) limpa ANTES de escrever (N4)`);
  } else {
    console.log('  as outras abas ficaram INTACTAS — nem a limpeza tocou nelas. Leia esta de volta antes de propagar.');
  }
}

module.exports = { PALETA, cor, hex, larg, nota, protege, regraFormato, validacao, listaUm, rangeUm, GEO, sheetIdsDe, main };

// Script-folha: roda `main()` só quando chamado direto (`node
// _norman/formatar.js`), pra que outro consumidor possa importar os helpers
// acima sem disparar uma chamada de rede como efeito colateral do `require`.
//
// E6 (Leva 4, remodelação 2026-09-01) — CERCA-SECA: `--help`/`-h` real e
// RECUSA de flag desconhecida ANTES de qualquer efeito, mesmo padrão de
// `radar.js`/`noticias.js`. `--piloto <aba>` é a ÚNICA flag válida — o
// incidente da Leva 3 foi exatamente um `--help` sem cerca caindo no
// fluxo geral real.
const USO_FORMATAR = 'Uso: node _norman/formatar.js [--piloto <aba>]  (ou --help/-h)';
if (require.main === module) {
  const argvNormalizado = process.argv.slice(2).map(a => (a === '-h' ? '--help' : a));
  if (argvNormalizado.includes('--help')) {
    console.log(USO_FORMATAR);
    process.exit(0);
  }
  const i = argvNormalizado.indexOf('--piloto');
  const piloto = i > -1 ? argvNormalizado[i + 1] : null;
  // Flags reconhecidas: só `--piloto` (e o valor que a segue, que não
  // começa com `--` — mesma convenção de `parseArgs` em radar.js). Tudo
  // que sobra e começa com `--` é desconhecido.
  const consumidos = new Set(i > -1 ? [i, i + 1] : []);
  const flagsDesconhecidas = argvNormalizado
    .map((a, idx) => [a, idx])
    .filter(([a, idx]) => a.startsWith('--') && a !== '--piloto' && !consumidos.has(idx));
  if (flagsDesconhecidas.length) {
    console.error(`[formatar] flag(s) desconhecida(s): ${flagsDesconhecidas.map(([a]) => a).join(', ')}`);
    console.error(USO_FORMATAR);
    process.exit(2);
  }
  main({ piloto }).then(() => console.log('OK')).catch(e => { console.error('ERRO\n' + e.message); process.exit(1); });
}
