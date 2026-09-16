'use strict';
// Nome das abas vem de `_norman/abas.js` (que por sua vez importa de
// `lib/sheets.js`): a aba de dados é a única que o sync CRIA se não achar pelo
// nome, então o nome não pode existir em dois lugares. `D` já vem com as
// aspas simples que a notação A1 exige — `'dados (não edite)'`.
const path = require('path');
const A = require('./abas');
const D = A.D;
// Fonte da CÉLULA do carimbo (letra+linha, ex. "Y1"). Importada, não escrita
// na mão: se `lib/sheets.js` mover o carimbo de lugar um dia, `CARIMBO`
// abaixo e `HOJE.A1` (que também lê o carimbo) acompanham sozinhos — o
// `.match` quebra alto e claro se o formato do nome de célula mudar de forma
// que a régua letra+número não reconheça, em vez de gerar uma referência
// A1 silenciosamente errada.
const SHEETS = require(path.join(__dirname, '..', 'lib', 'sheets'));
const [, CARIMBO_COL, CARIMBO_LINHA] = SHEETS.CELULA_CARIMBO.match(/^([A-Za-z]+)(\d+)$/);

// ===========================================================================
// GEOMETRIA DE LINHA — invariante N-17 da spec de arquitetura
// ===========================================================================
//
// "Números de linha nunca são literais." Antes desta Onda havia ~20 literais
// espalhados por `formulas.js`, `construir.js`, `formatar.js`, `notas.js` e
// `verificar.js`: a linha do cabeçalho, a linha da lista, a âncora do
// `mergeCells`, o `startRowIndex` da formatação condicional, o `range` do
// `setBasicFilter`, o `frozenRowCount`. A linha de navegação empurra TODAS
// elas de uma vez. Feito à mão, um literal esquecido desloca formatação ou
// funil sem erro nenhum na tela — a classe de defeito que esta planilha
// inteira existe pra não ter.
//
// A partir daqui, TODO consumidor lê daqui. `congelado` é o número de linhas
// congeladas e é DERIVADO: é sempre a última linha de cromo da aba, nunca um
// número escolhido à parte (foi assim que `Concursos` ficou com 3 congeladas
// e 4 linhas de cromo, na primeira tentativa deste conserto).
//
// Por que a linha 1 é a nav e não o veredito: a nav é BARRA DE FERRAMENTAS
// (posição constante, peso mínimo — ver o sistema visual), o veredito é o
// primeiro CONTEÚDO. A hierarquia entre os dois é sustentada por peso, não
// por posição. `dados (não edite)` é a única aba sem nav: `lib/sheets.js
// enviar()` faz `values.clear` + escrita ancorada em A1 todo dia, e qualquer
// link ali seria apagado de madrugada, em silêncio.
const LINHAS = {
  // ONDA UX 6 (remodelação 2026-09-01) — a nav do `Hoje` desce de DUAS linhas
  // (`nav`+`nav2`, 4 destinos em 2×2) pra UMA (`nav`, 12 destinos + marcador
  // "você está aqui" — ver `NAV[A.HOJE]` mais abaixo). `lista` sobe de 4 pra
  // 3 e `congelado` de 3 pra 2: N-17 de novo — um número muda, todo mundo que
  // lê `F.LINHAS[A.HOJE]` acompanha sozinho.
  [A.HOJE]:     { veredito: 1, nav: 2, lista: 3, congelado: 2 },
  [A.PAINEL]:   { nav: 1, veredito: 2, contagem: 3, cabecalho: 4, lista: 5, congelado: 4 },
  [A.EMPREGOS]: { nav: 1, veredito: 2, contagem: 3, cabecalho: 4, lista: 5, congelado: 4 },
  [A.TUDO]:     { nav: 1, veredito: 2, cabecalho: 3, lista: 4, congelado: 3 },
  // AS QUATRO DIGITADAS GANHAM UMA LINHA DE CROMO: `vazio`.
  //
  // O texto de estado vazio morava na LINHA DA NAV, à direita dos 4 links —
  // `Fila!E1` a 442 px da borda, `Diário!E1` a 689 px. Renderizado e olhado, o
  // preço que a spec tinha ACEITADO ("o celular é servido pelo Hoje") não se
  // sustenta: a própria barra de navegação oferece essas abas a UM toque a
  // partir de `Tarefas`, `Projetos` e `Empregos`, e quem chega por ali abre a
  // aba e vê nav + cabeçalho + BRANCO. As duas decisões se contradiziam.
  //
  // A saída é estrutural e é agora ou nunca: uma linha própria pro estado
  // vazio, mesclada de A até a última coluna, DENTRO do congelamento e na
  // dobra. Custa deslocar dado — e hoje há DUAS linhas de dado real nas quatro
  // abas somadas (`Tarefas` 2, `Projetos` 2, `Fila` 0, `Diário` 0). Cada linha
  // que JB escrever daqui pra frente encarece essa migração.
  //
  // Por que a linha 2 e não a 3 (abaixo do cabeçalho): `COUNTA` da coluna A é
  // o que o append de Thor usa pra achar a primeira linha livre (T-6). Uma
  // fórmula na coluna A ABAIXO do cabeçalho seria vista como não-vazia e o
  // append pularia uma linha PRA SEMPRE. Acima do cabeçalho, não.
  [A.FILA]:     { nav: 1, vazio: 2, cabecalho: 3, dados: 4, congelado: 3 },
  [A.PROJETOS]: { nav: 1, vazio: 2, cabecalho: 3, dados: 4, congelado: 3 },
  [A.TAREFAS]:  { nav: 1, vazio: 2, cabecalho: 3, dados: 4, congelado: 3 },
  [A.DIARIO]:   { nav: 1, vazio: 2, cabecalho: 3, dados: 4, congelado: 3 },
  // Onda 14 — `Etapas`, mesma geometria das quatro digitadas acima.
  [A.ETAPAS]:   { nav: 1, vazio: 2, cabecalho: 3, dados: 4, congelado: 3 },
  // `Candidaturas` (Onda 5) — geometria de VISTA (`veredito`, não `vazio`):
  // ao contrário das quatro acima, a linha 1 de dado NÃO é digitada por JB
  // direto — é o topo do SPILL que nasce de `_estado` (`lista`, mesmo nome
  // que as vistas de notícia usam pro início de um bloco gerado). O estado
  // vazio mora DENTRO do próprio spill (`IFERROR(corpo;vazio)`, mesmo
  // padrão de `NOTICIA_TABELA`), não na linha D9 das quatro digitadas.
  [A.CANDIDATURAS]: { nav: 1, veredito: 2, cabecalho: 3, lista: 4, congelado: 3 },
  // AS QUATRO VISTAS DE NOTÍCIA (Onda 8-9 + C10). Até a Onda 8-9 havia uma
  // linha de cromo a mais aqui (`recorte`, o único controle digitável da
  // peça — uma célula com lista suspensa que trocava a janela de tempo).
  // Ela SAIU: JB pediu tabelas VISÍVEIS ao mesmo tempo, não uma trocada por
  // toque (C9 do plano-mãe) — não há mais seletor pra hospedar. `cabecalho`
  // sobe pra linha 3, `lista` sobe pra linha 4.
  //
  // C10 Parte 2 — `lista` é a linha ÚNICA onde as QUATRO tabelas começam: a
  // Onda 8-9 empilhava as tabelas na MESMA coluna, linhas diferentes
  // (`LINHAS[aba].lista + i*NOTICIA_ALTURA_TABELA`); C10 deita as quatro
  // lado a lado — MESMA linha, colunas diferentes (`noticiaColunaBase(i)`,
  // que cada tabela ocupa em blocos de `NOTICIA_BLOCO_LARGURA`).
  // ONDA UX 5 (remodelação 2026-09-01) — `congelado` sobe de 3 pra 4.
  // `cabecalho` (linha 3) é GENÉRICO e IDÊNTICO nas quatro tabelas de uma
  // mesma aba ("Abrir·título·quando·veículo·tema", repetido 4×,
  // `NOTICIA_CABECALHO_TABELA`); `lista` (linha 4) começa com o título de
  // CADA tabela (`faixaInfo.rotulo` — "notícias de hoje", "top 20 · últimos
  // 15 dias"…), o ÚNICO texto que desambigua as quatro. Com `congelado=3`,
  // o que ficava PRESO na tela ao rolar era o genérico, e o único rótulo que
  // diz QUAL tabela é aquela rolava pra fora — medido ao vivo (AVALIACAO-
  // UX.md Parte 2 §10: "é a inversão exata de hierarquia, com o
  // congelamento premiando o lado errado"). Subir o congelamento pra 4 não
  // move NENHUM conteúdo (nav/veredito/cabecalho/lista continuam nas MESMAS
  // linhas) — só estende até onde o específico já estava.
  [A.NOTICIAS]: { nav: 1, veredito: 2, cabecalho: 3, lista: 4, congelado: 4 },
  [A.IA]:       { nav: 1, veredito: 2, cabecalho: 3, lista: 4, congelado: 4 },
  [A.TRABALHO]: { nav: 1, veredito: 2, cabecalho: 3, lista: 4, congelado: 4 },
  [A.CIENCIA]:  { nav: 1, veredito: 2, cabecalho: 3, lista: 4, congelado: 4 },
  [A.DADOS]:    { cabecalho: 1, dados: 2, congelado: 1 },
  // `_estado` (Onda 3) — mesma geometria de `_calc`: cabeçalho na 1, dado a
  // partir da 2, uma linha congelada. Oculta, sem nav, sem note declarada
  // (nenhuma vista lê `_estado` diretamente — só `construir.js`, via
  // `passoColher`/`passoRestaurar`). Entra em `F.LINHAS` pela mesma razão
  // que `_calc` entra: sem geometria aqui, `F.ultimoCromo(A.ESTADO)` não
  // teria resposta.
  [A.ESTADO]:   { cabecalho: 1, dados: 2, congelado: 1 },
  // `_calc` ENTRA AQUI, e a guarda de nota de `construir.js` foi quem
  // descobriu que faltava: a aba tem nota declarada (a nota-mae de "aba de
  // calculo") e nao tinha geometria nenhuma, entao `ultimoCromo` respondia
  // `-Infinity` e a limpeza de nota velha (N4) nunca alcancaria esta aba.
  // Ela e oculta e ninguem le, mas nota orfa aqui envelhece igual.
  // Cabecalho na 1 (os rotulos do bloco docente), formula a partir da 2.
  [A.CALC]:     { cabecalho: 1, dados: 2, congelado: 1 },
  // Espelho exato de `dados (não edite)`: cabeçalho na 1, dado a partir da 2,
  // uma linha congelada. Sem nav — `noticias.js sincronizar-sheets` faz
  // `values.clear` + escrita ancorada em A1 a cada rodada, e qualquer link
  // ali seria apagado em silêncio (a mesma nota que vale pra `dados`).
  [A.NOTICIAS_DADOS]: { cabecalho: 1, dados: 2, congelado: 1 }
};

// AS CHAVES DE CROMO, EM UM LUGAR SO. Todo consumidor que precisa saber "ate
// onde vai o cabecalho desta aba" le daqui: a guarda de congelamento de
// `construir.js` e a LIMPEZA DE NOTA de `formatar.js`. Enquanto eram duas
// listas, uma linha de cromo nova (`recorte`, `vazio`) precisava ser lembrada
// em dois lugares — e esquecer o segundo nao da erro nenhum.
const CROMO_CHAVES = ['nav', 'nav2', 'vazio', 'veredito', 'contagem', 'recorte', 'cabecalho'];
/** A ULTIMA linha de cromo de uma aba (a primeira de dado e a seguinte). */
const ultimoCromo = aba => Math.max(...CROMO_CHAVES.filter(k => LINHAS[aba][k]).map(k => LINHAS[aba][k]));

// ===========================================================================
// NAVEGAÇÃO — `HYPERLINK` com URL ABSOLUTA, gid resolvido em tempo de build
// ===========================================================================
//
// POR QUE ABSOLUTA E NÃO `#gid=` RELATIVO. A spec de arquitetura deixou o
// comportamento de `HYPERLINK("#gid=…")` no app de celular como a única
// dependência não-verificada, com plano B1 = URL completa. A evidência
// disponível diz que a variante relativa NÃO navega dentro do app (leva
// sempre à primeira aba) e que a absoluta tem relato de funcionar. No
// desktop as duas funcionam. Entre "funciona nos dois" e "funciona num só",
// não há escolha a fazer — a nav nasce na forma robusta.
//
// O `gid` NUNCA é escrito à mão (invariante N-13): `construir.js` resolve
// `sheetId` por `a.meta()` DEPOIS de criar/renomear as abas e injeta aqui.
// Aba excluída e recriada muda de gid — um link com gid literal não quebra,
// ele passa a APONTAR PRA OUTRA COISA, que é o modo de falha mudo.
// `verificar.js` fecha o laço lendo a fórmula viva de volta.
//
// Duas restrições duras do próprio `HYPERLINK`, que decidem a forma da barra:
// um link por célula (`=HYPERLINK(a;b)&"x"` NÃO é link — N-14), e uma célula
// mesclada hospeda UM link (merge alarga um slot, nunca junta dois destinos
// — N-15). Logo a barra é N células separadas, e nenhuma delas é mesclada.
const ROTULO_NAV = {
  [A.HOJE]: '🏠 Hoje',
  [A.PAINEL]: '🎓 Concursos',
  // ACHADO NA ONDA 18, lendo a peça de volta (não o código): `Concursos ·
  // tudo` tem nav própria (`NAV[A.TUDO]` existe desde sempre — ela navega
  // pra Hoje/Concursos/Empregos) mas NUNCA teve rótulo aqui. Não dava erro
  // de fórmula nenhum — os TRÊS links de saída dela (que apontam PRA OUTRAS
  // abas, então usam O RÓTULO DELAS, não o de `A.TUDO`) sempre funcionaram.
  // O buraco só ficou visível quando o marcador "você está aqui" (`navAqui`,
  // mais abaixo) passou a precisar do PRÓPRIO rótulo de CADA aba com nav —
  // e a planilha viva escreveu `"📍 undefined"` na aba oculta. Ela é oculta
  // (ninguém veria "no relance"), mas "oculta" não é "não confere" — foi o
  // `gerar-readme.js` que denunciou, gerando `` `📍 undefined` `` na tabela.
  [A.TUDO]: '🎓 Concursos · tudo',
  [A.EMPREGOS]: '💼 Empregos',
  [A.FILA]: '🎯 Fila',
  [A.TAREFAS]: '✍️ Tarefas',
  [A.PROJETOS]: '📌 Projetos',
  [A.DIARIO]: '📓 Diário',
  [A.CANDIDATURAS]: '🗂️ Candidaturas',
  [A.ETAPAS]: '🧩 Etapas',
  // Camada notícia. Os quatro glifos são EXCLUSIVOS desta função (rótulo de
  // navegação) — nenhum deles aparece como glifo de bloco dentro das abas
  // (ver `NOTICIA_BLOCO_GLIFO`), porque um mesmo caractere significando duas
  // coisas na mesma tela é o defeito que a banda do `Hoje` já pagou uma vez.
  [A.NOTICIAS]: '📰 Notícias',
  [A.IA]: '🤖 IA',
  [A.TRABALHO]: '📈 Trabalho',
  [A.CIENCIA]: '🔬 Ciência'
};

// Destinos por aba, na ordem das colunas A, B, C, D (ou mais — `Hoje` abaixo
// usa 12). `🏠 Hoje` é SEMPRE a célula A1 nas OUTRAS abas: posição constante
// é o que faz a barra virar cromo e parar de exigir leitura. Em `Hoje` não há
// link pra `Hoje` — não se navega pra onde já se está.
//
// `Concursos · tudo` é OCULTA (decisão: ocultar em vez de fundir — ganha o
// slot da barra do celular do mesmo jeito, não perde a superfície, e desfaz
// com um clique; fusão de dados não se desfaz). Ela recebe nav de SAÍDA
// (pra JB voltar quando desocultar) e ninguém linka PRA ela: link pra aba
// oculta é link que não navega.
//
// ONDA UX 6 (remodelação 2026-09-01) — `Hoje` GANHA NAV COMPLETA. Até aqui
// ela cobria só 6 dos 12 destinos possíveis: 4 por `NAV_HOJE` (uma grade
// 2×2 própria, fora deste objeto — Painel/Empregos/Tarefas/Diário) + 2 pelos
// TÍTULOS DE BLOCO do painel (⏳/🎯/📌/📓 são links, mas só Fila e Projetos
// não estavam também em `NAV_HOJE`). `Candidaturas`, `Etapas` e as quatro
// abas de notícia ficavam de fora — medido por BFS (AVALIACAO-UX.md Parte 2
// §11): `Hoje`, que é a PONTE entre as três ilhas (radar/CRM/notícia), não
// alcançava `Candidaturas` nem `Etapas` em 1 toque, e a malha inteira pagava
// esse buraco (93 de 156 pares custando 2+ toques).
//
// A cura é estrutural, não um 7º link disfarçado: `Hoje` entra NESTE objeto,
// como qualquer outra aba, com os 12 destinos possíveis (todas as abas
// visíveis, menos ela mesma) — `NAV_HOJE` (a grade 2×2) SAI. `F.navCelulas`
// (a mesma função que já escreve a nav de TODAS as outras abas) passa a
// escrever a de `Hoje` também: uma linha, 12 `HYPERLINK`, mais o marcador
// "você está aqui" (Onda 18) — que `Hoje` nunca tinha, por ser "óbvio que é
// ela". Deixa de ser óbvio no dia em que a régua vira "nav completa numa
// linha, igual a todo mundo".
//
// COLUNA NÃO É LITERAL (N-17): a nav de `Hoje` não cabe nos 4 índices do
// PRIMEIRO grupo de blocos (`HOJE_COLUNAS`) — precisa de 13 slots (12 + o
// marcador) e a aba tem 4 grupos de 4 colunas + 3 vãos estreitos (28 px,
// território do RESPIRO visual entre grupos, nunca de conteúdo). `
// colunasVisiveis` ganhou o mesmo tratamento que já dá a coluna `_oculta` nas
// abas de tabela: pula os vãos, devolve só as 16 colunas de conteúdo real —
// espaço de sobra pros 13 slots que a nav pede.
//
// ORDEM: a mesma prioridade da barra de abas (`formatar.js ORDEM` — radar
// primeiro, CRM depois, notícia por último), sem `Hoje` (que não linka pra
// si mesma).
// ONDA UX 17 (Leva 4, remodelação 2026-09-01) — FECHAR A MALHA ENTRE AS TRÊS
// ILHAS (radar: Concursos/Empregos · CRM: Tarefas/Fila/Candidaturas/
// Projetos/Diário/Etapas · notícia: Notícias/IA/Trabalho/Ciência), sem
// depender só de `Hoje`.
//
// BASELINE MEDIDO (BFS sobre `F.NAV`, script isolado — não escrito na
// planilha): pior caso já era ≤ 2 toques ANTES desta Onda — `Hoje` liga
// tudo, então nenhum par nunca custava mais que "origem -> Hoje -> destino"
// — mas 91 de 156 pares (direcionais) custavam exatamente 2, porque a nav
// de cada aba só cobria os destinos "vizinhos" da mesma ilha (mais alguns
// já emendados nas Levas 2-3). `AVALIACAO-UX.md` cita "hoje 93/156" — a
// medição desta Leva (91) reflete o estado JÁ CORRIGIDO pelas Ondas 1-15,
// não uma divergência de instrumento.
//
// O CONSERTO é "destinos por afinidade": cada aba GANHA (nunca perde) link
// direto pras abas de OUTRA ilha que ainda exigiam passar por `Hoje`,
// dentro da FOLGA que `F.colunasVisiveis(aba)` já tem sobrando (guarda de
// `construir.js`, "e cabe" — `F.celulaNav` ESTOURA se a barra pedir mais
// slots do que a aba tem coluna visível; nenhuma largura de coluna foi
// alterada por esta Onda, então a folga é a MESMA que a Onda 1 já tinha
// medido e a Onda 11-15 já tinha usado pra dobra). `Diário`/`Etapas` têm
// só 1 slot de folga cada (geometria estreita, herdada — Onda 15) e por
// isso ganham só 1 link novo cada; as abas de notícia têm folga generosa
// (18) e por isso ganham a malha CHEIA de volta pro radar+CRM.
//
// MEDIDO DEPOIS do conserto (mesmo script BFS): pares custando 2+ caem de
// 91 pra 31/156 — pior caso continua ≤ 2 (nunca piora: só se ACRESCENTA
// aresta, nunca se remove uma). O TETO da Onda 20 (teste de regressão) é
// DERIVADO desta medição (31), nunca um número redondo escolhido por
// simetria — Cláusula de Não-Deriva, "os limiares são negociáveis... e
// nenhum número redondo escolhido por simetria".
const NAV = {
  [A.HOJE]: [
    A.EMPREGOS, A.PAINEL, A.TAREFAS, A.FILA, A.CANDIDATURAS,
    A.PROJETOS, A.DIARIO, A.ETAPAS,
    A.NOTICIAS, A.IA, A.TRABALHO, A.CIENCIA
  ],
  // Radar (Concursos/Empregos/Fila) ganha o resto do CRM que faltava
  // (Projetos/Diário/Etapas) — folga permitia mais em `Concursos`/`Fila`
  // (5 e 6), então as duas também ganham `Notícias` como representante da
  // terceira ilha; `Empregos` tem folga justa (3) e fica só com o CRM.
  [A.PAINEL]:   [A.HOJE, A.EMPREGOS, A.FILA, A.TAREFAS, A.CANDIDATURAS, A.PROJETOS, A.DIARIO, A.ETAPAS, A.NOTICIAS],
  [A.EMPREGOS]: [A.HOJE, A.PAINEL, A.FILA, A.TAREFAS, A.CANDIDATURAS, A.PROJETOS, A.DIARIO, A.ETAPAS],
  [A.TUDO]:     [A.HOJE, A.PAINEL, A.EMPREGOS],
  // `Tarefas` ganha o radar (Concursos/Empregos) e o resto do CRM
  // (Candidaturas/Etapas) + `Notícias` — folga (5) cobre exatamente os 5.
  [A.TAREFAS]:  [A.HOJE, A.PROJETOS, A.DIARIO, A.FILA, A.PAINEL, A.EMPREGOS, A.CANDIDATURAS, A.ETAPAS, A.NOTICIAS],
  [A.FILA]:     [A.HOJE, A.EMPREGOS, A.PAINEL, A.TAREFAS, A.CANDIDATURAS, A.PROJETOS, A.DIARIO, A.ETAPAS, A.NOTICIAS],
  // `Projetos` tem a maior folga do CRM (8): ganha radar inteiro,
  // `Candidaturas` (único gap do CRM que faltava) e a malha de notícia
  // inteira — fecha 2-hop pra ZERO a partir dela.
  [A.PROJETOS]: [A.HOJE, A.TAREFAS, A.DIARIO, A.FILA, A.ETAPAS, A.PAINEL, A.EMPREGOS, A.CANDIDATURAS, A.NOTICIAS, A.IA, A.TRABALHO, A.CIENCIA],
  // `Diário` tem só 1 slot de folga (geometria estreita, Onda 15) — o único
  // link novo vai pro radar (`Concursos`), espelhando o link recíproco que
  // `Concursos` já ganha de volta pra `Diário` acima.
  [A.DIARIO]:   [A.HOJE, A.PROJETOS, A.TAREFAS, A.FILA, A.ETAPAS, A.PAINEL],
  // `Candidaturas` (Onda 5) já cobria o radar inteiro (Fila/Empregos/
  // Concursos); ganha o resto do CRM que faltava (Tarefas/Projetos/Etapas)
  // — folga (3) cobre exatamente os 3; `Diário` fica de fora por falta de
  // slot (mesma folga apertada do lado dela).
  [A.CANDIDATURAS]: [A.HOJE, A.FILA, A.EMPREGOS, A.PAINEL, A.TAREFAS, A.PROJETOS, A.ETAPAS],
  // `Etapas` (Onda 14) tem só 1 slot de folga — o único link novo vai pro
  // radar (`Concursos`), espelhando o recíproco de `Concursos` acima.
  [A.ETAPAS]: [A.HOJE, A.PROJETOS, A.TAREFAS, A.DIARIO, A.PAINEL],
  // AS QUATRO DE NOTÍCIA — folga generosa (18: `NOTICIA_COLUNAS` é largura
  // de ABA INTEIRA, C10 Parte 2). Continuam navegando entre si (as três
  // irmãs) e ganham a malha CHEIA de volta pro radar+CRM (8 destinos) —
  // fecha os 32 pares de 2-hop que a ilha notícia pagava sozinha.
  [A.NOTICIAS]: [A.HOJE, A.IA, A.TRABALHO, A.CIENCIA, A.PAINEL, A.EMPREGOS, A.FILA, A.TAREFAS, A.PROJETOS, A.DIARIO, A.CANDIDATURAS, A.ETAPAS],
  [A.IA]:       [A.HOJE, A.NOTICIAS, A.TRABALHO, A.CIENCIA, A.PAINEL, A.EMPREGOS, A.FILA, A.TAREFAS, A.PROJETOS, A.DIARIO, A.CANDIDATURAS, A.ETAPAS],
  [A.TRABALHO]: [A.HOJE, A.NOTICIAS, A.IA, A.CIENCIA, A.PAINEL, A.EMPREGOS, A.FILA, A.TAREFAS, A.PROJETOS, A.DIARIO, A.CANDIDATURAS, A.ETAPAS],
  [A.CIENCIA]:  [A.HOJE, A.NOTICIAS, A.IA, A.TRABALHO, A.PAINEL, A.EMPREGOS, A.FILA, A.TAREFAS, A.PROJETOS, A.DIARIO, A.CANDIDATURAS, A.ETAPAS]
};

const urlDaAba = (idPlanilha, gid) => `https://docs.google.com/spreadsheets/d/${idPlanilha}/edit#gid=${gid}`;
const linkDaAba = (idPlanilha, gid, rotulo) => `=HYPERLINK("${urlDaAba(idPlanilha, gid)}";"${rotulo}")`;
// Fonte única das fórmulas coladas na planilha. `dados` A..W (23 colunas):
// A orgao B campus C uf D area E subarea F subedital G titulacao_exigida H vagas
// I tipo J regime K classe L inscricao_inicio M inscricao_fim N data_publicacao
// O score P veredito Q area_compativel R extracao S url T id
// U trilha V modalidade W senioridade          <- Onda 3, apêndice
// Locale pt_BR -> separador de argumento `;`. Toda referência a `dados` é
// INTERVALO ABERTO (X2:X): o store cresce e nada pode ter linha fixa.
//
// DUAS TRILHAS, DOIS BLOCOS — e por quê.
// `dados` é um store só, mas guarda duas coisas que NÃO são a mesma coisa:
// edital de concurso docente (`trilha=docente`) e vaga de emprego
// (`trilha=mercado`). Renderizar as duas com o mesmo vocabulário produziu
// mentira literal na planilha: o veredito 'aderente' (mercado) caía no `else`
// do rótulo de elegibilidade e 359 vagas de front-end/UX apareciam como
// "🎓 só com doutorado", empurrando os 22 editais reais pra fora da dobra.
// Não é bug de string — é bug de MODELO: prazo, elegibilidade, titulação e
// subedital são conceitos da trilha docente; empresa, modalidade, senioridade
// e "quanto tempo no ar" são da trilha mercado.
//
// A separação é feita por DUAS constantes-guarda, e é o único ponto onde ela
// mora. Cada bloco de fórmulas abre com a sua e devolve "" pro que não é dele:
//   FORA_DOCENTE -> bloco A..R  (consumido por `Painel` e `Tudo`)
//   FORA_MERCADO -> bloco AA..AK (consumido por `Empregos`)
// Como toda coluna do bloco já começava com `IF(<guarda>;"";...)`, trocar a
// constante consertou os dois defeitos de uma vez, sem tocar em nenhuma
// fórmula individual.
//
// Soma booleana (`(x)+(y)>0`) em vez de `OR(x;y)` DE PROPÓSITO: OR() agrega o
// array inteiro num único TRUE/FALSE dentro de ARRAYFORMULA e faria a guarda
// valer pra todas as linhas ou pra nenhuma. Mesma razão pela qual `MIN(a;b)`
// não aparece em lugar nenhum deste arquivo (agrega) e vira `IF(a>b;b;a)`.

const FORA_DOCENTE = `(${D}!A2:A="")+(${D}!U2:U<>"docente")>0`;
const FORA_MERCADO = `(${D}!A2:A="")+(${D}!U2:U<>"mercado")>0`;
const EXISTE = FORA_DOCENTE; // nome herdado: todo uso de EXISTE é do bloco docente

const N_DOCENTE = `COUNTIF(${D}!U2:U;"docente")`;
const N_MERCADO = `COUNTIF(${D}!U2:U;"mercado")`;
const JANELA = 60; // dias. MEDIDO, não chutado: os 67 prazos conhecidos do store
                   // fecham no máximo 48 d depois da publicação (p95 = 39 d).

// Onde vive a tabela de lookup nome-de-instituição → sigla, dentro da própria
// `_calc`. Fora do bloco A:R das fórmulas, e ABERTA pra baixo (o mapa cresce).
// Escrita por `construir.js` a partir de `_norman/siglas.js`.
const SIGLAS_RANGE = '_calc!$V$2:$W';
const SIGLAS_COL = 'V';

// Nome curto da instituição. Duas camadas, nesta ordem:
//   1. VLOOKUP na tabela de siglas canônicas (`_norman/siglas.js`) — é como JB
//      chama a instituição e é o mais curto: "UFSCar", "IFMT", "UNILA".
//   2. Fallback tipográfico, pra QUALQUER instituição fora do mapa — mais longo,
//      nunca errado, e sem nenhuma sigla inventada.
// A abreviação "UF" foi BANIDA das duas camadas: colidia com a sigla de unidade
// federativa, que aparece na MESMA linha do card ("MT · UF de Mato Grosso" logo
// abaixo de "MT · IF de Mato Grosso"). Nenhuma expansão do fallback tem 2 letras.
const SIGLA = `IFERROR(VLOOKUP(${D}!A2:A;${SIGLAS_RANGE};2;FALSE);`
  + `SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(${D}!A2:A;`
  + `"Instituto Federal de Educação, Ciência e Tecnologia";"Inst. Federal");`
  + `"Centro Federal de Educação Tecnológica";"CEFET");`
  + `"Universidade Tecnológica Federal";"Univ. Tecn. Federal");`
  + `"Fundação Universidade Federal";"Univ. Federal");`
  + `"Universidade Federal";"Univ. Federal"))`;

// Ordem dos tiers — eixo primário é o PRAZO (fato confirmado), eixo
// secundário é a ELEGIBILIDADE. "Aberto" é verificável; "sem prazo" é
// hipótese. 1-3 = aberto; 4-6 = sem prazo dentro da janela; 7 = sem prazo
// fora da janela; 8 = encerrado. O Painel mostra 1-6, o Tudo mostra todos.
// ===========================================================================
// A CHAVE DE ORDEM É TAMBÉM O CÓDIGO DE ESTADO — e por isso é constante
// ===========================================================================
//
// `ordem` é um número composto: `balde * FATOR + desempate`. O dígito de cima
// (`INT(ordem/FATOR)`) É o balde/tier — o estado da linha, em número, já
// calculado, já presente na planilha, já numa coluna que as abas de radar
// carregam (oculta, como `_ordem`).
//
// É ele que as regras de esmaecimento passam a ler, no lugar do EMOJI.
//
// POR QUE ISSO É CONSERTO DE CLASSE, e não troca de gosto. A regra de arquivo
// de `Empregos` casava `REGEXMATCH($C;"⚪|🗄")` e o dado emitia `❓ sem data`
// pro balde 5 — três linhas (`C537`, `C538`, `C543`) saíam em PRETO CHEIO no
// meio de uma página inteira de cinza, com o peso máximo da página, e eram
// justamente as linhas de que menos se sabe. Nada errou. Nenhum `#N/A`,
// nenhum log. O canal visual simplesmente passou a dizer o contrário do que
// significa, em 3 de 544 linhas.
//
// Emoji é RÓTULO: ele é reescrito por decisão de texto, ganha seletor de
// variação, troca de variante entre plataformas. Balde é ESTADO: ele só muda
// quando a regra de negócio muda, e aí a fórmula que o produz muda junto, no
// mesmo arquivo, dentro do mesmo `IF`. O rótulo é derivado do balde — casar o
// derivado pra descobrir o que o original já diz é a inversão que custou o D4.
//
// O FATOR mora aqui uma vez e é lido por quem ESCREVE a chave (`CALC.A`,
// `CALC_MERCADO.AH`) e por quem a LÊ (as regras condicionais, via
// `REGRA_RECUO`). `construir.js` guarda que os três continuam usando o mesmo
// número.
const ORDEM_FATOR = 100000;

// Os cortes de estado, nomeados. Cada um traz o que ele significa NA FÓRMULA
// que produz o balde, não no emoji que o rende.
//
// Trilha docente (`CALC.B`, tiers 1..8):
//   1 aberto+elegível · 2 aberto+indeterminado · 3 aberto+só doutorado
//   4/5/6 sem prazo recente (mesma ordem de elegibilidade) · 7 sem prazo
//   antigo · 8 encerrado
// Trilha mercado (`CALC_MERCADO.AJ`, baldes 1..5):
//   1 hoje · 2 até 7 d · 3 8 a 30 d · 4 31 a 90 d · 5 (+ de 90 d OU SEM DATA)
const TIER_FORA_DO_ALCANCE = 3;   // Concursos: daqui pra cima é "não é pra você agora"
const TIER_ENCERRADO = 4;         // Concursos · tudo: daqui pra cima é encerrado ou sem prazo
const BALDE_ARQUIVO = 4;          // Empregos: daqui pra cima é arquivo — inclui `❓ sem data` (balde 5)

/**
 * A regra condicional de RECUO, escrita a partir do código de estado. Recebe
 * a LETRA da coluna `_ordem` na aba (derivada do cabeçalho, nunca literal) e a
 * primeira linha de lista. Nenhum glifo entra aqui.
 */
const REGRA_RECUO = (colunaOrdem, linha, corte) => `=INT($${colunaOrdem}${linha}/${ORDEM_FATOR})>=${corte}`;

const CALC = {
  A: `=ARRAYFORMULA(IF(B2:B="";"";B2:B*${ORDEM_FATOR}+IF(C2:C>999;999;C2:C)*100+(100-IF(${D}!O2:O="";0;${D}!O2:O))))`,

  B: `=ARRAYFORMULA(IF(${EXISTE};"";IF(${D}!M2:M<>"";IF(DATEVALUE(${D}!M2:M)>=TODAY();IF(${D}!P2:P="elegivel_agora";1;IF(${D}!P2:P="indeterminada";2;3));8);IF(TODAY()-DATEVALUE(${D}!N2:N)<=${JANELA};IF(${D}!P2:P="elegivel_agora";4;IF(${D}!P2:P="indeterminada";5;6));7))))`,

  C: `=ARRAYFORMULA(IF(${EXISTE};"";IF(${D}!M2:M<>"";ABS(DATEVALUE(${D}!M2:M)-TODAY());TODAY()-DATEVALUE(${D}!N2:N))))`,

  // Painel (bloco contíguo D:G — o FILTER lê a faixa inteira sem literal de array)
  D: `=ARRAYFORMULA(IF(${EXISTE};"";K2:K&" · "&M2:M&CHAR(10)&Q2:Q))`,
  E: `=ARRAYFORMULA(IF(${EXISTE};"";J2:J&CHAR(10)&I2:I))`,
  F: `=ARRAYFORMULA(IF(${EXISTE};"";${D}!S2:S))`,
  G: `=ARRAYFORMULA(IF(A2:A="";"";A2:A))`,

  // Tudo (bloco contíguo H:P)
  H: `=ARRAYFORMULA(IF(${EXISTE};"";IF(${D}!M2:M="";"⚠️ SEM PRAZO";IF(DATEVALUE(${D}!M2:M)>=TODAY();"🟢 ABERTO";"🔴 ENCERRADO"))))`,
  I: `=ARRAYFORMULA(IF(${EXISTE};"";IF(${D}!P2:P="elegivel_agora";"✅ pode prestar";IF(${D}!P2:P="indeterminada";"❓ confirmar titulação";"🎓 só com doutorado"))))`,
  J: `=ARRAYFORMULA(IF(${EXISTE};"";IF(${D}!M2:M="";"⚠️ sem prazo · publicado há "&(TODAY()-DATEVALUE(${D}!N2:N))&" d";IF(DATEVALUE(${D}!M2:M)<TODAY();"🔴 encerrou "&TEXT(DATEVALUE(${D}!M2:M);"dd/mm/aa");IF(DATEVALUE(${D}!M2:M)=TODAY();"🟢 fecha HOJE";"🟢 fecha em "&(DATEVALUE(${D}!M2:M)-TODAY())&" d · "&TEXT(DATEVALUE(${D}!M2:M);"dd/mm"))))))`,
  K: `=ARRAYFORMULA(IF(${EXISTE};"";${D}!C2:C))`,
  L: `=ARRAYFORMULA(IF(${EXISTE};"";IF(${D}!D2:D="";"❓ não identificada";IF(REGEXMATCH(LOWER(${D}!D2:D);"design");"Design";IF(REGEXMATCH(LOWER(${D}!D2:D);"ux|ihc|intera[çc]");"UX/IHC";IF(REGEXMATCH(LOWER(${D}!D2:D);"comput|intelig[êe]ncia artificial|/ia|aprendizado de m|tecnologia da informa|sistemas de informa|engenharia de software|ci[êe]ncia da computa");"Computação/IA";"Outra"))))))`,
  // Instituição + campus. Lê a sigla já resolvida da coluna R (uma avaliação só
  // do lookup) e concatena o campus, que é o que DISTINGUE quando 15 linhas
  // seguidas são subeditais do mesmo edital.
  M: `=ARRAYFORMULA(IF(${EXISTE};"";R2:R&IF(${D}!B2:B="";"";" — "&${D}!B2:B)))`,
  N: `=ARRAYFORMULA(IF(${EXISTE};"";IF(${D}!E2:E="";"—";${D}!E2:E)&IF(${D}!R2:R="formato_nao_reconhecido";" · 👁️ confira no edital";"")))`,
  O: `=ARRAYFORMULA(IF(A2:A="";"";F2:F))`,
  P: `=ARRAYFORMULA(IF(A2:A="";"";A2:A))`,

  // ONDA UX 14 + E2 — `Subedital` (10º campo de `DOCENTE_VITRINE`, coluna
  // `t_subedital` deste bloco). Reaproveita a célula Q: antes guardava
  // `p_vaga`/`p_situacao`/`p_url`/`p_ordem` (D:G) + `q_descricao` (aqui), um
  // bloco "Painel" alternativo que NUNCA foi lido por nenhum consumidor
  // (confirmado por busca — `docenteVisivel`/`PAINEL.lista`/`TUDO.lista` só
  // leem `_calc!H:P`, nunca `_calc!D:G`/`Q`/`R`) — legado de uma renderização
  // anterior à unificação Concursos/Concursos·tudo, nunca removido. `D:G`/`R`
  // ficam como estão (fora do escopo desta Onda); só `Q` é reclamada aqui,
  // por ser CONTÍGUA a `P` (fim do bloco `H:P`) — o único jeito de estender
  // `DOCENTE_BLOCO` num campo a mais sem quebrar a contiguidade que o
  // `FILTER`/`CHOOSECOLS` exige.
  // `subedital` é o código cru (`dados!F`, ex. "004/26.08"); "—" quando
  // ausente (edital de subedital único), mesma convenção de `Subárea` vazia.
  Q: `=ARRAYFORMULA(IF(${EXISTE};"";IF(${D}!F2:F="";"—";${D}!F2:F)))`,

  // Instituição SEM campus — sigla canônica ou fallback. Serve a duas coisas:
  // (a) alimenta a coluna M, e (b) é o eixo que a linha 2 do Painel usa pra
  // avisar quando a lista está concentrada numa instituição só.
  R: `=ARRAYFORMULA(IF(${EXISTE};"";${SIGLA}))`
};

const CALC_CABECALHO = [
  'ordem', 'tier', 'subkey',
  'p_vaga', 'p_situacao', 'p_url', 'p_ordem',
  't_situacao', 't_elegibilidade', 't_prazo', 't_uf', 't_area', 't_orgao', 't_subarea', 't_url', 't_ordem',
  't_subedital', 'p_inst'
];

// Aviso de CONCENTRAÇÃO, na linha 2 do Painel. Deriva da mesma condição do A4
// (`ISNUMBER(ordem)` + `tier<=6`), então nunca diverge da lista que está logo
// abaixo. Aparece só quando UMA instituição responde por ≥5 linhas E ≥40% da
// lista — do contrário some sozinho, sem deixar rastro nem ocupar a linha
// congelada. Sem decimal na fórmula de propósito (`mx*10>=n*4` em vez de
// `mx/n>=0,4`): o separador decimal muda com o locale, `*10` não.
// Diz "mesma instituição", não "mesmo edital": edital é o que EU sei olhando,
// instituição é o que a fórmula consegue AFIRMAR com o dado que existe.
const CONCENTRACAO = `IFERROR(LET(`
  + `v;FILTER(_calc!R2:R;ISNUMBER(_calc!A2:A);_calc!B2:B<=6);`
  + `n;ROWS(v);`
  + `c;MAP(v;LAMBDA(x;COUNTIF(v;x)));`
  + `mx;MAX(c);`
  + `IF(mx<5;"";IF(mx*10<n*4;"";`
  + `CHAR(10)&"⚠️ "&mx&" das "&n&" linhas abaixo são da mesma instituição ("`
  + `&INDEX(v;MATCH(mx;c;0))&") — role até o fim, tem outras "&(n-mx)&"."`
  + `)));"")`;

// GUARDA DE ÓRFÃO. Consequência direta de separar as superfícies por trilha:
// cada aba filtra pela SUA trilha, então uma linha cuja trilha não seja nem
// `docente` nem `mercado` não aparece em lugar nenhum — está no store, está em
// `dados`, e some das duas telas sem dizer nada. Hoje isso é impossível
// (lib/sheets.js grava o default `docente` pra quem não tem trilha), mas a
// terceira trilha é uma questão de quando, não de se, e o modo de falha dela é
// silencioso por construção.
// Aparece só quando a conta não fecha — do contrário, string vazia, sem ocupar
// a linha congelada. Vive no `Painel` porque é a aba de entrada (índice 0).
const ORFAOS = `COUNTA(${D}!A2:A)-COUNTIF(${D}!U2:U;"docente")-COUNTIF(${D}!U2:U;"mercado")`;
const AVISO_ORFAOS = `IF((${ORFAOS})<=0;"";`
  + `CHAR(10)&"⚠️ "&(${ORFAOS})&" registro(s) na aba ""${A.DADOS}"" com trilha desconhecida — não aparecem em NENHUMA aba de leitura. "`
  + `&"Confira a coluna U (trilha) dessa aba.")`;

// ESTADO MUDO QUE FALTAVA: o funil fica LIGADO depois que a gente fecha a aba.
// O `basicFilter` do Sheets é estado PERSISTIDO por planilha, não por sessão.
// Se JB corta "só remoto" hoje e volta em três semanas, a `Empregos` abre
// mostrando 88 linhas com um cabeçalho que promete 359 — a peça se contradiz e
// não há nada na tela dizendo por quê. É o modo de falha mais provável desta
// planilha depois de um intervalo longo, e era completamente mudo.
//
// `SUBTOTAL(103;...)` conta só as linhas VISÍVEIS (ignora o que o funil e o
// "ocultar linha" escondem); a promessa vem da mesma contagem que o cabeçalho
// já usa. Some sozinho quando não há corte — custo zero no caso normal.
// Fala de "linha escondida", não de "filtro": ocultar linha à mão produz o
// mesmo sintoma, e o aviso tem que ser verdadeiro nos dois casos.
const AVISO_FUNIL = (faixa, total) => `IF(SUBTOTAL(103;${faixa})>=${total};"";`
  + `CHAR(10)&"⚠️ Faltam linhas na tela: mostrando "&SUBTOTAL(103;${faixa})&" de "&${total}`
  + `&". Tem corte ligado no funil ▼ — toque no ▼ da coluna filtrada e marque ""Selecionar tudo"" pra ver todas de novo."`
  + `)`;

// ===========================================================================
// AVISO DE PLANILHA DESATUALIZADA — o estado mudo que faltava na camada de cima
// ===========================================================================
//
// O PROBLEMA. Todas as contas desta planilha são fórmulas contra `TODAY()`:
// elas se refazem sozinhas e ficam CERTAS mesmo que o radar pare. Se
// `rodar-diario.bat` morrer (tarefa desagendada, `.env` corrompido, credencial
// expirada, PC desligado), a planilha continua abrindo linda, com "fecha em 12
// d" recalculado corretamente, e o que é novo simplesmente não aparece. É o
// pior modo de falha possível: a peça PARECE saudável enquanto morre. É a
// mesma doutrina que produziu a saúde barulhenta do coletor ("0 itens
// relevantes nunca pode ser indistinguível de coletor quebrado"), que estava
// violada aqui em cima.
//
// A FONTE. `lib/sheets.js enviar()` grava a data do sync em `dados!Y1` (ISO
// 8601 cru) por último, depois dos dados — ver a nota longa lá. `Z1` guarda a
// mesma coisa por extenso pra humano. Nada aqui é derivado de
// `MAX(data_publicacao)`: "nenhum edital novo há 6 dias" é estado NORMAL do
// DOU, e usar isso como proxy seria uma mentira que dispara sozinha.
//
// -------- o limiar é 3 DIAS ÚTEIS, e foi MEDIDO --------
// Fonte: `logs/rodar-diario.log`, o histórico completo da automação
// (13/08 a 26/08/2026). Execuções em 13, 14, 17, 18, 19, 20, 21, 24, 25 e 26 —
// que são EXATAMENTE os 10 dias úteis do intervalo (15, 16, 22 e 23 são fim de
// semana; não há feriado nacional na janela). 10 de 10 execuções esperadas
// aconteceram, ZERO dia útil perdido.
//
// O que o mesmo log mostra e decide o limiar: a HORA não é estável. O normal é
// 08:00, mas há execuções às 14:38 (17/08), 18:59 (18/08) e 19:04 (24/08) — o
// Task Scheduler recupera um início perdido mais tarde no mesmo dia. Logo,
// "carimbo do dia útil anterior" (atraso = 1) é estado legítimo durante um dia
// inteiro de trabalho e TEM que ser silencioso, senão o aviso mora
// permanentemente na tela e JB aprende a não ler a linha 1.
//
//   atraso 0 — sincronizou hoje.                                     silêncio
//   atraso 1 — carimbo do dia útil anterior; a execução de hoje ainda
//              pode acontecer até a noite (medido: 19:04).           silêncio
//   atraso 2 — um dia útil inteiro sem execução. Nunca observado em
//              10/10, mas é o caso "PC ficou desligado ontem", que se
//              conserta sozinho amanhã de manhã. Acender aqui é o
//              anti-padrão que este projeto já pagou uma vez: "um
//              radar que grita todo sábado é um radar que JB
//              silencia".                                            silêncio
//   atraso ≥3 — DOIS dias úteis consecutivos sem execução. Isso não é
//              acidente: é tarefa desagendada, credencial expirada,
//              máquina fora do ar há dias.                           ACENDE
//
// O custo de esperar até 3 é um dia de atraso na descoberta; a partir daí o
// aviso acende TODO dia até alguém consertar. O custo de acender em 2 seria
// permanente e irreversível (um aviso que cria lobo é um aviso morto).
//
// -------- por que DIA ÚTIL e não dia corrido --------
// `rodar-diario.bat` roda Seg-Sex e pula feriado nacional (a 1ª linha dele
// chama `lib/feriados-nacionais.js diaSemPublicacaoEsperada`). Em dias
// corridos, sexta -> segunda de manhã já são 3 — o aviso gritaria TODA
// segunda. `NETWORKDAYS` ignora fim de semana sozinho; o feriado vem da tabela
// em `_calc!Y2:Y`, gerada por `_norman/feriados.js` a partir do MESMO módulo
// que o .bat consulta. Sem a tabela, uma única execução perdida ao lado de um
// feriado somaria 3 e acenderia com o radar funcionando.
//
// -------- os três estados, e nenhum deles é mudo --------
// Carimbo AUSENTE ou ilegível é tão grave quanto carimbo velho — é a planilha
// admitindo que não sabe de quando ela é — e por isso tem ramo próprio, não
// cai no silêncio. `IF` avalia só o ramo tomado, então `NETWORKDAYS` nunca
// roda sobre um carimbo inválido.
//
// -------- onde aparece: NAS TRÊS ABAS, no topo da linha 1 --------
// A falha é global (o sync é um só) e invalida a própria linha 1 — não adianta
// dizer "🟢 3 abertas que você pode prestar AGORA" se essa contagem é de seis
// dias atrás. Por isso PREFIXO, não sufixo: é a primeira coisa lida, na célula
// mesclada em negrito. Ocupar as três não custa três vezes: quando está tudo
// certo, os três ramos devolvem "" e o custo é ZERO caractere e ZERO linha —
// mesma economia dos avisos de órfão, concentração e funil. E cobrir só uma
// aba seria pior que não cobrir: quem abrisse `Empregos` (359 linhas, a que JB
// abre todo dia) leria uma tela morta sem nenhum sinal.
const LIMIAR_ATRASO_DIAS_UTEIS = 3;
const CARIMBO = `${D}!$${CARIMBO_COL}$${CARIMBO_LINHA}`;
const FERIADOS_RANGE = `${A.C}!$Y$2:$Y`;

// -------- O GATILHO DO ALARME, COMO CONSTANTE NOMEADA --------
//
// O canal visual do robô parado é uma regra condicional que casa um GLIFO
// dentro do veredito renderizado. Enquanto o glifo era literal nos DOIS lados
// — a string aqui e o padrão da regra em `formatar.js` — a peça tinha o mesmo
// defeito que já quebrou de verdade no esmaecimento de arquivo: a regra
// procurava `⚪` e o dado passou a emitir `❓`. Lá custou três linhas em preto
// cheio no meio de uma página cinza; AQUI custaria o único canal visual do
// aviso que existe pra dizer que a coleta morreu — apagado exatamente no
// estado em que o silêncio é fatal, e sem erro em lugar nenhum.
//
// Um objeto, dois consumidores, divergência impossível — a mesma doutrina que
// `HOJE_BLOCO_GLIFO`/`HOJE_REGEX_TITULO` já aplicam aos títulos de bloco.
// `construir.js` guarda o laço: conta as ocorrências do glifo dentro de
// `AVISO_SYNC` e estoura se não forem exatamente `ALARME_RAMOS`; `verificar.js`
// confere que o padrão da regra viva na planilha ainda é este glifo.
//
// Sem seletor de variação, de propósito: `U+1F6D1` puro, o mesmo caractere
// escrito e procurado. Seletor invisível a mais de um lado é divergência que
// nenhum olho pega.
const GLIFO_ALARME = '🛑';
// Quantos ramos de `AVISO_SYNC` acendem o alarme: "sem carimbo" e "sem
// atualizar". Se um terceiro ramo nascer sem o glifo, a guarda reprova.
const ALARME_RAMOS = 2;

// ===========================================================================
// O GATILHO DEIXOU DE SER O GLIFO — ele voltou a ser SÓ o sinal humano
// ===========================================================================
//
// O conserto de classe C1 foi declarado fechado e NAO fechou. Ele tirou o
// glifo literal de DOIS arquivos e o pos numa constante — o que mata a
// divergencia entre codigo e codigo, e nao mata a classe. A regra continuava
// sendo `REGEXMATCH($A$2;"🛑")`: uma reescrita da mensagem sem o glifo, um
// seletor de variacao colado por um editor, uma plataforma que troca a
// variante, e o UNICO canal visual do alarme apaga — exatamente no estado em
// que o silencio e fatal, e sem erro em lugar nenhum. E a metade pior: as 4
// abas de noticia nasceram SEM regra nenhuma em A2 (N5).
//
// A cura e a mesma do D4, aplicada ate o fim: a regra passa a casar o ESTADO,
// nao o rotulo. O estado e um NUMERO — o atraso em dias — e ele e calculado
// por UM builder de JS que serve aos DOIS consumidores:
//
//   `AVISO_SYNC` (o texto que JB le)  <- alarmeCd + alarmeAtraso* + ALARME_ACESO
//   `ALARME_CF`  (a regra que pinta)  <- os MESMOS tres
//
// Divergir exige editar o builder, e editar o builder muda os dois lados de
// uma vez. O glifo continua na mensagem porque ele e bom sinal humano; ele
// so parou de ser o mecanismo.
//
// POR QUE `INDIRECT`. Formatacao condicional do Sheets NAO aceita referencia
// direta a outra aba; `INDIRECT("...")` e a forma que atravessa, e ela
// alcanca aba OCULTA (esconder e propriedade de apresentacao). O carimbo e a
// tabela de feriados moram em outras abas, entao a regra le por INDIRECT.
// Se a plataforma recusar, isto aparece na CHAPA (o alarme forcado nao
// pinta) — nao em silencio.
const ALARME_SEM_CARIMBO = -1;
/** O carimbo lido como data serial; `0` quando nao da pra ler. */
const alarmeCd = carimbo => `IFERROR(DATEVALUE(${carimbo});IFERROR(N(${carimbo});0))`;
/** Atraso em dias UTEIS (trilha vaga). `-1` = sem carimbo. */
const alarmeAtrasoUteis = (cd, feriados) => `IF(${cd}=0;${ALARME_SEM_CARIMBO};NETWORKDAYS(${cd};TODAY();${feriados})-1)`;
/** Atraso em dias CORRIDOS (trilha noticia). `-1` = sem carimbo. */
const alarmeAtrasoCorridos = cd => `IF(${cd}=0;${ALARME_SEM_CARIMBO};TODAY()-${cd})`;
/**
 * O CRITERIO, uma vez so. Acende quando nao ha carimbo (`at<0`) ou quando o
 * atraso estourou o limiar. E a expressao que aparece LITERALMENTE dentro do
 * texto e dentro da regra — `construir.js` confere as duas ocorrencias.
 */
const alarmeAceso = limiar => `OR(at<0;at>=${limiar})`;
/** Referencia A1 que sobrevive a formatacao condicional (ver acima). */
const alarmeInd = ref => `INDIRECT("${ref}")`;

// OS NOMES DE VARIAVEL DE `LET`, DECLARADOS - e a razao e um defeito pago.
//
// `LET(k1;...;k2;...)` devolve `#NAME?` na planilha inteira, e o motivo e que
// `K1` E UMA REFERENCIA DE CELULA: o Sheets recusa nome de LET com forma de
// endereco A1. O erro nao aparece em teste nenhum de Node - a formula e uma
// string ate chegar na planilha - e derrubou as quatro abas de noticia de uma
// vez, com `#NAME?` no lugar da lista.
//
// A cura e declarar os nomes num lugar so e conferir a FORMA deles antes de
// escrever (`construir.js`). `ordemA`/`ordemB` no lugar de `k1`/`k2` nao e
// gosto: e a diferenca entre um nome e um endereco.
const NOMES_LET = ['cd', 'at', 'sel', 'd', 'ps', 'ordemA', 'ordemB', 'n'];
/** Forma de referencia A1 (`K1`, `AT3`) - o que `LET` recusa como nome. */
const PARECE_CELULA = /^[A-Za-z]{1,3}[0-9]+$/;

// `IFERROR(DATEVALUE(c); IFERROR(N(c);0))`: DATEVALUE lê o ISO cru (é como o
// sync grava, sob valueInputOption=RAW); o N() cobre o caso de a célula um dia
// virar data DE VERDADE (valor, não texto), em que DATEVALUE erraria. Qualquer
// outra coisa vira 0 e cai no ramo "não sei de quando eu sou".
// A ABERTURA É CURTA DE PROPÓSITO — o argumento tem que sobreviver à redução.
// A1 é célula MESCLADA com WRAP, e eu não tenho como provar a altura RENDERIZADA
// da linha: a planilha exige o login do JB (a service account não renderiza), e
// `rowMetadata.pixelSize` devolve o valor ARMAZENADO, não o efetivo — medido,
// devolve 21 antes e depois de 480 caracteres numa célula mesclada com WRAP.
// Logo, se o Sheets não crescer a linha sozinho, sobra a PRIMEIRA linha visual.
// Por isso `🛑 SEM ATUALIZAR DESDE 19/08` abre o aviso: 27 caracteres que já são
// sinal + veredito + data, unidade completa mesmo cortada logo depois. O resto
// (a contagem e o que fazer) é aprofundamento, não sustentação — e o prefixo
// empurra o veredito normal pra baixo, que é a hierarquia certa: "isto está
// velho" manda em "3 abertas pra você AGORA".
const ALARME_ACESO_VAGA = alarmeAceso(LIMIAR_ATRASO_DIAS_UTEIS);
const AVISO_SYNC = `IFERROR(LET(`
  + `cd;${alarmeCd(CARIMBO)};`
  + `at;${alarmeAtrasoUteis('cd', FERIADOS_RANGE)};`
  + `IF(NOT(${ALARME_ACESO_VAGA});"";`
  + `IF(at<0;`
  + `"${GLIFO_ALARME} SEM CARIMBO DE DATA — esta planilha não sabe de quando ela é: o carimbo do último sync sumiu da aba ${A.DADOS}. `
  + `Não confie na lista abaixo, pode ser de semanas atrás. Rode: node radar.js sincronizar-sheets"&CHAR(10);`
  + `"${GLIFO_ALARME} SEM ATUALIZAR DESDE "&TEXT(cd;"dd/mm")&" — "&at&" dias úteis. `
  + `O que é NOVO não está aqui (as contas de prazo abaixo continuam certas). `
  + `Confira a tarefa RadarAcademicoJB no Agendador de Tarefas do Windows e se o PC ficou ligado."&CHAR(10)`
  + `)));"")`;

// -------- O AVISO DE COLETA PARADA, com a régua da TRILHA NOTÍCIA --------
//
// É irmão de `AVISO_SYNC`, não cópia — e a diferença é de UNIDADE, declarada
// aqui pra não repetir o defeito que já custou caro (a linha 1 do `Hoje`
// contando dias corridos enquanto as abas de leitura contavam dias úteis,
// mesmo número, e o portal se contradizendo entre duas abas).
//
//   trilha vaga    -> NETWORKDAYS, 3 dias ÚTEIS, tabela de feriados.
//                     Edital não sai no sábado; contar sábado seria alarme
//                     falso todo domingo.
//   trilha notícia -> dias CORRIDOS, limiar 2. Jornal publica no domingo, e a
//                     coleta roda três vezes por dia, todo dia. Aqui um fim
//                     de semana parado NÃO é normal — é o robô, e o aviso
//                     tem que acender.
//
// Não são duas cópias da mesma regra: são duas regras, para duas máquinas,
// cada uma com a sua fonte de carimbo. O que é COMPARTILHADO é o gatilho
// visual (`GLIFO_ALARME`), porque a cor do alarme é a mesma peça.
const LIMIAR_ATRASO_NOTICIA_DIAS = 2;
const CARIMBO_NOTICIA = `${A.ND}!$${CARIMBO_COL}$${CARIMBO_LINHA}`;
const ALARME_RAMOS_NOTICIA = 2;
const ALARME_ACESO_NOTICIA = alarmeAceso(LIMIAR_ATRASO_NOTICIA_DIAS);
const AVISO_SYNC_NOTICIA = `IFERROR(LET(`
  + `cd;${alarmeCd(CARIMBO_NOTICIA)};`
  + `at;${alarmeAtrasoCorridos('cd')};`
  + `IF(NOT(${ALARME_ACESO_NOTICIA});"";`
  + `IF(at<0;`
  + `"${GLIFO_ALARME} SEM CARIMBO DE DATA — esta aba não sabe de quando ela é: o carimbo do último sync sumiu de ${A.NOTICIAS_DADOS}. `
  + `Não confie na lista abaixo. Rode: node noticias.js sincronizar-sheets"&CHAR(10);`
  + `"${GLIFO_ALARME} NOTÍCIA PARADA DESDE "&TEXT(cd;"dd/mm")&" — "&at&" dias. `
  + `A coleta de notícia roda todo dia, fim de semana inclusive: ${LIMIAR_ATRASO_NOTICIA_DIAS} dias parada é o robô, não a agenda. `
  + `Rode: node noticias.js coletar e depois node noticias.js sincronizar-sheets"&CHAR(10)`
  + `)));"")`;

// -------- O AVISO NAS QUATRO ABAS DIGITADAS, e por que ele e OUTRO texto --
//
// `Fila`, `Projetos`, `Tarefas` e `Diario` sao as unicas abas de vista sem
// linha de veredito: a linha 2 delas e o estado vazio. Ate aqui elas nao
// tinham canal de alarme nenhum — JB podia passar o dia inteiro dentro do
// portal, em quatro superficies, sem nada dizer que o robo morreu.
//
// O texto NAO pode ser o de `AVISO_SYNC`: ali esta escrito "o que e NOVO nao
// esta aqui", que e VERDADE sobre a lista do radar e MENTIRA sobre uma aba
// que JB digita a mao. Alarme que descreve errado a aba em que aparece ensina
// a ignorar alarme. Entao e um segundo TEXTO — nunca um segundo CRITERIO: o
// `cd`, o `at` e o `ALARME_ACESO_VAGA` sao os mesmos tres builders.
// Mesma guarda de `ALARME_RAMOS`: dois ramos, dois glifos.
const ALARME_RAMOS_PORTAL = 2;
const AVISO_SYNC_PORTAL = `IFERROR(LET(`
  + `cd;${alarmeCd(CARIMBO)};`
  + `at;${alarmeAtrasoUteis('cd', FERIADOS_RANGE)};`
  + `IF(NOT(${ALARME_ACESO_VAGA});"";`
  + `IF(at<0;`
  + `"${GLIFO_ALARME} O RADAR ESTÁ SEM CARIMBO — não dá pra saber de quando ele é. `
  + `Esta aba é sua e continua certa; quem pode estar velho é ${ROTULO_NAV[A.EMPREGOS]} e ${ROTULO_NAV[A.PAINEL]}."&CHAR(10);`
  + `"${GLIFO_ALARME} O RADAR ESTÁ PARADO DESDE "&TEXT(cd;"dd/mm")&" — "&at&" dias úteis. `
  + `Esta aba é sua e continua certa; o que está velho é a lista de ${ROTULO_NAV[A.EMPREGOS]} e ${ROTULO_NAV[A.PAINEL]}."&CHAR(10)`
  + `)));"")`;

// -------- A REGRA QUE PINTA, DERIVADA DOS MESMOS TRES BUILDERS --------
//
// Um termo por pipeline. Cada termo e autossuficiente (`LET` proprio) porque
// o `Hoje` carrega OS DOIS: ele e o hub, e um hub que fica calado sobre o
// coletor de noticia diz "esta tudo bem" enquanto metade da maquina esta
// morta (foi o agravante do N1).
const ALARME_TERMO = {
  vaga: `LET(cd;${alarmeCd(alarmeInd(CARIMBO))};at;${alarmeAtrasoUteis('cd', alarmeInd(FERIADOS_RANGE))};${ALARME_ACESO_VAGA})`,
  noticia: `LET(cd;${alarmeCd(alarmeInd(CARIMBO_NOTICIA))};at;${alarmeAtrasoCorridos('cd')};${ALARME_ACESO_NOTICIA})`
};
/** A formula da regra condicional de alarme de uma aba, a partir dos pipelines dela. */
const alarmeCF = pipelines => `=IFERROR(OR(${pipelines.map(p => ALARME_TERMO[p]).join(';')});FALSE)`;

// AS 12 ABAS DE VISTA, e qual maquina cada uma depende. Nao e "todas as abas
// levam o alarme": e "toda aba que MOSTRA o que uma maquina trouxe diz quando
// aquela maquina parou". `dados`, `notícias (não edite)` e `_calc` ficam de
// fora porque nao sao vista de ninguem.
//
//   Hoje       -> as DUAS. E o hub; calar sobre uma delas e o hub mentindo.
//   Concursos / Concursos . tudo / Empregos -> a trilha vaga (`dados`).
//   Noticias / IA / Trabalho / Ciencia      -> a trilha noticia.
//   Fila / Projetos / Tarefas / Diario      -> a trilha vaga, com o texto
//        proprio de `AVISO_SYNC_PORTAL` (a aba e de JB e continua certa; o
//        que envelheceu foi a lista ao lado).
const ALARME_ABAS = {
  [A.HOJE]: ['vaga', 'noticia'],
  [A.PAINEL]: ['vaga'],
  [A.TUDO]: ['vaga'],
  [A.EMPREGOS]: ['vaga'],
  [A.NOTICIAS]: ['noticia'],
  [A.IA]: ['noticia'],
  [A.TRABALHO]: ['noticia'],
  [A.CIENCIA]: ['noticia'],
  [A.FILA]: ['vaga'],
  // `Candidaturas` (Onda 5) entra com 'vaga': órgão/empresa e vaga vêm de
  // `dados (não edite)` por junção — a mesma dependência que `Fila` já tem.
  [A.CANDIDATURAS]: ['vaga'],
  [A.PROJETOS]: ['vaga'],
  [A.TAREFAS]: ['vaga'],
  [A.DIARIO]: ['vaga'],
  // Onda 14 — `Etapas` casa por nome com `Projetos!A`, mesma dependência da
  // trilha vaga que o resto do CRM digitado já declara.
  [A.ETAPAS]: ['vaga']
};
/** A LINHA que o alarme pinta em cada aba: o veredito onde ele existe, o estado vazio nas digitadas. */
const alarmeLinha = aba => LINHAS[aba].veredito || LINHAS[aba].vazio;


const T = n => `COUNTIF(_calc!B2:B;${n})`;
const ABERTAS = `(${T(1)}+${T(2)}+${T(3)})`;
const SEMPRAZO = `(${T(4)}+${T(5)}+${T(6)})`;

// ERRO QUE A PEÇA NÃO DIZIA. `IFERROR(<lista>;"")` era mudo em DOIS casos que
// não são a mesma coisa: (a) não há linha que passe no filtro — vazio de
// verdade, e o veredito da linha acima já diz isso por extenso; (b) `_calc`
// está VAZIA (fórmulas apagadas, `construir.js` rodado pela metade, cota
// estourada no meio) — quebra. No caso (b) a lista ficava em branco e o
// veredito logo acima afirmava "nada aberto hoje": a peça MENTIA, com cara de
// saudável. `COUNTA(_calc!A2:A)` distingue os dois (a coluna A é
// ARRAYFORMULA: com as fórmulas no lugar ela devolve "" pras linhas de outra
// trilha, e COUNTA conta "" — logo, zero só acontece quando a aba está
// realmente vazia). Vazio de verdade continua mudo; quebra passa a se anunciar.
const CALC_VAZIA = `IF(COUNTA(_calc!A2:A)=0;"⚠️ A aba \`_calc\` está vazia. Rode: \`node _norman/construir.js\`";"")`;

// ===========================================================================
// A FORMA DA TRILHA DOCENTE — uma só, duas renderizações
// ===========================================================================
//
// DEFEITO MEDIDO NA PEÇA RENDERIZADA. `Concursos` tinha 4 colunas visíveis
// contra as 9 de `Empregos`; 502 px contra 942; `Abrir` na TERCEIRA posição
// visível contra a PRIMEIRA; e ZERO facetas usáveis no funil contra 5, porque
// UF, área, órgão, campus, nº de vagas e subedital estavam todos FUNDIDOS
// dentro da string composta de `Vaga`. As duas trilhas foram desenhadas como
// isomorfas e não eram: o que se aprendia numa não servia na outra
// (consistência, Nielsen #4), e a lei que esta casa já escreveu — coluna de
// FILTRO e coluna de LEITURA são coisas diferentes — valia só de um lado.
//
// A causa foi a §2(i) implementada pela metade: `Concursos · tudo` foi
// OCULTADA (decisão certa, reversível com um clique) e `Concursos` ficou com a
// forma antiga. Ocultar era o barato; não herdar a forma não era.
//
// A cura não é copiar a forma de uma aba pra outra — é ter UMA forma e duas
// renderizações dela. O bloco visível (`_calc!H:P`) é o mesmo; a única
// diferença entre as duas abas é o CORTE (`tier<=6` na `Concursos`) e a
// largura. Como a ordem de coluna vive aqui e não em cada aba, elas não têm
// como derivar em silêncio uma da outra — que é exatamente o custo que a
// decisão de ocultar-em-vez-de-fundir tinha deixado em aberto.
//
// A ordem de exibição não é a ordem do bloco em `_calc`: `CHOOSECOLS` reordena
// DEPOIS do SORT (o índice do SORT continua sendo o do bloco cru, então mexer
// na vitrine não pode desordenar a lista). Papel a papel, contra `Empregos`:
//
//   Empregos                    Concursos / Concursos · tudo
//   ------------------------    ------------------------------
//   A  Abrir      (ação)        A  Abrir      (ação)
//   B  Inscrito   (checkbox)    B  Inscrito   (checkbox)
//   C  Vaga       (identidade)  C  Vaga       = órgão · campus
//   D  Publicada  (faceta)      D  Elegível?  (faceta: 3 valores)
//   E  Combina?   (faceta)      E  Situação   (faceta: 3 valores)
//   F  Área       (faceta)      F  Área       (faceta: 5 valores)
//   G  Modalidade (faceta)      G  UF         (faceta)
//   H  Nível      (faceta)      H  Prazo      (leitura: data exata)
//   -                           I  Subárea    (leitura)
//   -                           J  Subedital  (desempate — Onda 14/E2)
//   I  _url       (oculta)      K  _url       (oculta)
//   J  _ordem     (oculta)      L  _ordem     (oculta)
//   K  link       (copiar)      M  link       (copiar)
//
// ONDA UX 13 (remodelação 2026-09-01) — `Inscrito` ENCOSTA NA IDENTIDADE.
// Media 1162 px (última coluna das duas abas) — JB pediu "adicione AO LADO
// um check" e ele nasceu do outro lado da linha. A ÚNICA posição seed que
// não quebra o spill contíguo de `CHOOSECOLS`/`FILTER` (que precisa de
// `Vaga`..`_ordem` INTERROMPIDOS, senão a ARRAYFORMULA morre ao encontrar a
// célula não-fórmula do checkbox no meio do caminho — ver a Cláusula de
// Não-Deriva do plano, "custo médio: mexe no spill") é ENTRE `Abrir` e
// `Vaga`: fora do bloco contíguo, e explicitamente autorizada pela Parte 4
// do laudo ("Inscrito pode ir para a coluna B"). Resolve COM a Onda 1 (não
// em vez dela): o congelamento de `Concursos`/`Concursos · tudo` cresce de
// 2 para 4 colunas (Abrir+Inscrito+Vaga+Elegível?) e o de `Empregos` de 2
// para 3 (Abrir+Inscrito+Vaga) — ver `FROZEN_COLUNAS` em `formatar.js`. A
// identidade continua congelada; o checkbox passa a estar ao lado dela,
// sempre visível, em vez de 3-4 arrastos depois.
//
// `Prazo` e `Subárea` ficam DEPOIS das facetas de propósito: são strings quase
// únicas por linha (a mesma razão pela qual "há 13 d" não vira coluna de
// filtro em `Empregos`). Faceta precisa de valores POUCOS e ESTÁVEIS.
//
// ONDA UX 14 + E2 (EMENDADA pelo laudo da Leva 0) — `Subedital` é NOVA,
// desempate VISÍVEL: dois (ou mais) registros do MESMO edital guarda-chuva
// (mesma `url`) que colidem em `orgao+campus+área+subárea` (balde de
// keyword, pensado como FILTRO — ver `lib/keyword-filtro.js` — não como
// rótulo distintivo) renderizavam como linhas IDÊNTICAS (UEM ×3, UFSCar São
// Carlos ×4/Sorocaba ×2 — `tests/concursos-vista-duplicata-visual.test.js`).
// `subedital` é PARTE do hash do `id` (`lib/hash.js gerarId`) — dentro de um
// guarda-chuva, ele é SEMPRE distinto por registro (senão os dois teriam
// colidido no dedupe do store antes de chegar aqui); expô-lo torna a
// distinção estrutural, não uma correção pontual. `null` (edital de
// subedital único) mostra "—", mesma convenção de `Subárea` vazia.
const DOCENTE_BLOCO = '_calc!H2:Q';
// Posição de cada campo DENTRO de `_calc!H:Q` (1-based, como CHOOSECOLS pede).
const DOCENTE_EM_CALC = { situacao: 1, elegivel: 2, prazo: 3, uf: 4, area: 5, orgao: 6, subarea: 7, url: 8, ordem: 9, subedital: 10 };
const DOCENTE_VITRINE = ['orgao', 'elegivel', 'situacao', 'area', 'uf', 'prazo', 'subarea', 'subedital', 'url', 'ordem'];
const DOCENTE_COL_ORDEM = DOCENTE_EM_CALC.ordem; // índice do SORT, no bloco CRU
// `Inscrito` NÃO É PARTE DO SPILL: é a única célula não-fórmula das duas
// abas (ver `_norman/estado.js` e `construir.js passoRestaurar`) — igual a
// `link (copiar)`, que também é escrita à parte do
// `CHOOSECOLS`/`SORT`/`FILTER` que produz o resto da linha. Onda 13 moveu a
// POSIÇÃO dela no cabeçalho (agora logo depois de `Abrir`); nada disto muda
// — ela continua fora do bloco contíguo `DOCENTE_VITRINE`, só que à
// ESQUERDA dele agora, em vez de à direita.
// `_por_quem` (item 4d do briefing) — OCULTA, espelho puro de `_estado.por
// quem` (nunca lida de volta por `passoColher`: fonte é sempre `_estado`).
// Legibilidade da diferença "eu marquei" x "o robô inscreveu": a contagem da
// linha 3 (`PAINEL.contagem`/`EMPREGOS.contagem`) soma quantos têm
// `_por_quem = "robô"` e só imprime a frase quando esse número é > 0 — hoje
// é sempre 0 (a automação de inscrição ainda não existe), então a coluna
// nasce muda e sem custo de leitura, mas o CANAL já existe pronto pro dia em
// que Onda 6 ligar o robô. "Barato agora e caro depois" — pedido literal.
// C1 (Leva 5, remodelação 2026-09-01) — `❌` (checkbox "não me interessa")
// APENDADO NO FIM, mesma doutrina de `_estado.js CABECALHO` (nunca inserir
// no meio de um cabeçalho que já tem consumidor): o bloco `Vaga`..`_ordem`
// é UM `CHOOSECOLS` contíguo (ver "A FORMA DA TRILHA DOCENTE" acima) — não
// há como inserir uma coluna estática NO MEIO dele sem quebrar o spill
// (mesma classe de colisão que `_norman/estado.js`, no topo, existe pra
// evitar). Inserir DENTRO do bloco congelado (Abrir+Inscrito+Vaga+Elegível?,
// Onda UX 1/11/13) também deslocaria `Vaga`/`Elegível?` de letra — o
// briefing pede explicitamente "NÃO desloca" esse bloco. O ÚNICO ponto sem
// deslocamento nenhum é depois de `_por_quem` (a última coluna hoje): igual
// a `Inscrito`/`_por_quem`, é escrita como VALOR por `passoRestaurar`
// (nunca por fórmula) — ver `_norman/estado.js restaurarDescarte`. Visível
// (sem o prefixo `_`): é um checkbox que JB toca, não coluna de máquina.
const DOCENTE_CABECALHO = ['Abrir', 'Inscrito', 'Vaga', 'Elegível?', 'Situação', 'Área', 'UF', 'Prazo', 'Subárea', 'Subedital', '_url', '_ordem', 'link (copiar)', '_por_quem', '❌'];
// As facetas que o funil realmente corta — nomeadas uma vez, ditas no texto da
// aba a partir daqui (o rótulo e a promessa não têm como divergir). Ordem
// alinhada à ordem visual pós-Onda 11 (Elegível? primeiro).
const DOCENTE_FACETAS = ['Elegível?', 'Situação', 'Área', 'UF'];
const docenteVisivel = expr => `CHOOSECOLS(${expr};${DOCENTE_VITRINE.map(k => DOCENTE_EM_CALC[k]).join(';')})`;

/** Letra da coluna de um rótulo do cabeçalho. Nunca literal — N-17. */
const letraDe = (cabecalho, rotulo) => {
  const i = cabecalho.indexOf(rotulo);
  if (i < 0) throw new Error(`rótulo "${rotulo}" não existe no cabeçalho ${JSON.stringify(cabecalho)}`);
  return String.fromCharCode(65 + i);
};
// C1 (Leva 5) — TIER LÍQUIDO DE DESCARTE. "N ABERTA(S) que você pode
// prestar AGORA" (PAINEL.veredito, abaixo) não pode contar uma linha que
// JB já marcou `❌`: descarte SAI dos contadores de veredito, por pedido
// literal do briefing ("um número, uma fonte"). A contagem lê o
// RENDERIZADO — `Concursos!_ordem`/`Concursos!❌`, as MESMAS duas colunas
// que a lista mostra — nunca uma segunda leitura de `_calc` (que não sabe
// nada de `❌`: descarte é ação de JB na vista, não fato do edital).
// `INT(_ordem/ORDEM_FATOR)` reconstrói o TIER a partir da MESMA chave que
// `_calc!A`/`_calc!B` escrevem (ver `REGRA_RECUO`, acima) — é o mesmo
// dispositivo que já pinta o esmaecimento de tier, reaproveitado pra contar
// em vez de pintar.
const descartadosPorTier = (aba, tier) => {
  const colOrdem = letraDe(DOCENTE_CABECALHO, '_ordem');
  const colDescarte = letraDe(DOCENTE_CABECALHO, '❌');
  const l = LINHAS[aba].lista;
  return `SUMPRODUCT((INT($${colOrdem}$${l}:$${colOrdem}/${ORDEM_FATOR})=${tier})*($${colDescarte}$${l}:$${colDescarte}=TRUE))`;
};
/** T(n) "líquido": tier n menos as linhas que JB marcou `❌` naquele tier. */
const TL = (aba, n) => `(${T(n)}-${descartadosPorTier(aba, n)})`;

const docenteAbrir = aba => {
  const c = letraDe(DOCENTE_CABECALHO, '_url'), l = LINHAS[aba].lista;
  return `=ARRAYFORMULA(IF(${c}${l}:${c}="";"";HYPERLINK(${c}${l}:${c};"📄 edital")))`;
};
const docenteLinkCopiar = aba => {
  const c = letraDe(DOCENTE_CABECALHO, '_url'), l = LINHAS[aba].lista;
  return `=ARRAYFORMULA(IF(${c}${l}:${c}="";"";${c}${l}:${c}))`;
};

const PAINEL = {
  // O aviso de planilha desatualizada vem ANTES do veredito, não depois: ele
  // invalida o veredito. "3 abertas que você pode prestar AGORA" é uma frase
  // falsa se a lista é de seis dias atrás. Silencioso, devolve "" e não custa
  // nada.
  // C1 (Leva 5) — `TL(A.PAINEL, n)` no lugar de `T(n)` nos quatro ramos: o
  // que estava marcado `❌` sai do número E da condição que decide qual
  // ramo fala (uma linha descartada não pode reacender "N ABERTA(S)" nem
  // manter o ramo aceso sozinha). Ver o bloco de comentário grande em
  // `descartadosPorTier`/`TL`, acima.
  veredito: `=${AVISO_SYNC}&IF(${TL(A.PAINEL, 1)}>0;"🟢 "&${TL(A.PAINEL, 1)}&" ABERTA(S) que você pode prestar AGORA — no topo da lista.";IF(${TL(A.PAINEL, 2)}>0;"⚠️ Nenhuma aberta confirmada pra você. "&${TL(A.PAINEL, 2)}&" aberta(s) com titulação não identificada — abra o edital.";IF(${TL(A.PAINEL, 3)}>0;"🔴 Nada aberto que você possa prestar hoje: as "&${TL(A.PAINEL, 3)}&" abertas exigem doutorado.";IF(${TL(A.PAINEL, 4)}>0;"⚠️ Nada aberto. "&${TL(A.PAINEL, 4)}&" sem prazo que você poderia prestar — abra pra ver se ainda dá.";"🔴 Nada aberto e nada recente sem prazo. Lista vazia hoje — o radar segue rodando."))))`,

  // Duas linhas em vez de uma fileira de 5 segmentos: no celular a A2 é célula
  // mesclada com WRAP, e 5 segmentos separados por "·" viravam um parágrafo
  // cego. Linha 1 = os números desta aba. Linha 2 = pra onde ir. O
  // cross-link é o que impede a separação por trilha de virar informação
  // escondida — quem abre o Painel VÊ que existem N vagas de mercado e onde.
  // A linha de cross-link ("N editais de professor no radar → ▶ …") SAIU: os
  // dois destinos viraram link de verdade na linha 1. Duas linhas de texto a
  // menos pagam a linha de grade a mais que a nav custou — subtração, não
  // acréscimo. O que sobra aqui é contagem, que é o que esta linha existe
  // pra dizer.
  contagem: `="As "&(${ABERTAS}+${SEMPRAZO})&" linhas abaixo = "&${ABERTAS}&" com inscrição aberta + "&${SEMPRAZO}`
    + `&" sem data de inscrição no edital (dos últimos ${JANELA} d)."`
    + `&"  ·  "&${N_DOCENTE}&" editais de professor no radar."`
    // Onda 4 — quantos JB já marcou "Inscrito" NESTA aba, sem precisar rolar
    // nem filtrar. `COUNTIF` sobre a própria coluna Inscrito: ela é escrita
    // como VALOR por `construir.js passoRestaurar` (não é fórmula), então o
    // COUNTIF recalcula sozinho assim que aquele passo grava os valores —
    // nesta mesma execução do build, sem depender de ordem entre os dois.
    + `&"  ·  "&COUNTIF(${letraDe(DOCENTE_CABECALHO, 'Inscrito')}${LINHAS[A.PAINEL].lista}:${letraDe(DOCENTE_CABECALHO, 'Inscrito')};TRUE)&" já inscrito(s)."`
    // Item 4d — "eu marquei" x "o robô inscreveu": `_por_quem` (oculta,
    // espelho de `_estado`) diz quem marcou cada um. O texto "(N pelo
    // robô)" só aparece quando esse número é > 0 — hoje é sempre 0 (a
    // automação de inscrição ainda não existe), então a frase nasce muda.
    // `IF(N=0;"";...)` é o mesmo dispositivo de `SEM_NOTA` em
    // `EMPREGOS.contagem`, logo abaixo.
    + `&IF(COUNTIFS(${letraDe(DOCENTE_CABECALHO, 'Inscrito')}${LINHAS[A.PAINEL].lista}:${letraDe(DOCENTE_CABECALHO, 'Inscrito')};TRUE;${letraDe(DOCENTE_CABECALHO, '_por_quem')}${LINHAS[A.PAINEL].lista}:${letraDe(DOCENTE_CABECALHO, '_por_quem')};"robô")=0;"";`
    + `" ("&COUNTIFS(${letraDe(DOCENTE_CABECALHO, 'Inscrito')}${LINHAS[A.PAINEL].lista}:${letraDe(DOCENTE_CABECALHO, 'Inscrito')};TRUE;${letraDe(DOCENTE_CABECALHO, '_por_quem')}${LINHAS[A.PAINEL].lista}:${letraDe(DOCENTE_CABECALHO, '_por_quem')};"robô")&" pelo robô)")`
    + `&CHAR(10)&"Toque no funil ▼ da linha ${LINHAS[A.PAINEL].cabecalho} pra cortar por ${DOCENTE_FACETAS.join(', ')}."`
    + `&${AVISO_ORFAOS}`
    + `&${CONCENTRACAO}`
    // A faixa do AVISO_FUNIL é a PRIMEIRA COLUNA DO SPILL, não a coluna A:
    // desde que `Abrir` passou pra A, `A` é uma ARRAYFORMULA que devolve "" nas
    // linhas sem url — e `SUBTOTAL(103;…)` conta "" como preenchido. Contar ali
    // responderia "nada foi filtrado" para sempre, em silêncio. É a mesma
    // razão pela qual `Empregos` já contava por `B`.
    + `&${AVISO_FUNIL(`${letraDe(DOCENTE_CABECALHO, 'Vaga')}${LINHAS[A.PAINEL].lista}:${letraDe(DOCENTE_CABECALHO, 'Vaga')}`, `(${ABERTAS}+${SEMPRAZO})`)}`,

  // `link (copiar)` é a última coluna, FORA da dobra do celular, e é URL em
  // TEXTO — não link. É o insumo do job "vi uma vaga, quero pôr na Fila":
  // antes disso a `_url` era coluna oculta e copiar exigia desocultá-la
  // (≈3 passos no celular). Coluna DERIVADA por ARRAYFORMULA ancorada na
  // coluna do spill (N-5): realinha sozinha quando o FILTER muda de tamanho.
  // Fora da dobra é o preço certo — copiar link é ação deliberada, a dobra
  // pertence à ação principal.
  cabecalho: DOCENTE_CABECALHO,
  // IFERROR não é decoração: FILTER sem nenhuma linha devolve #N/A, e #N/A na
  // primeira linha da lista, logo abaixo de um cabeçalho congelado que acabou
  // de dizer "lista vazia hoje", é erro de sistema aparecendo como se fosse a
  // resposta. Vazio de verdade é mudo (o veredito já disse por extenso);
  // `_calc` quebrada passa a se anunciar — ver CALC_VAZIA.
  lista: `=IFERROR(${docenteVisivel(`SORT(FILTER(${DOCENTE_BLOCO};ISNUMBER(_calc!A2:A);_calc!B2:B<=6);${DOCENTE_COL_ORDEM};TRUE)`)};${CALC_VAZIA})`,
  abrir: docenteAbrir(A.PAINEL),
  linkCopiar: docenteLinkCopiar(A.PAINEL)
};

const TUDO = {
  // A promessa antiga ("tudo o que o radar já viu: N registros") virou MENTIRA
  // no dia em que a trilha mercado entrou: a aba passaria a dizer 564 e mostrar
  // 205. A promessa não foi rebaixada, foi ESCOPADA — esta aba é o "tudo" da
  // trilha docente, e diz na mesma linha quantos itens vivem na outra aba e
  // como chegar lá. Nada some; o universo de cada superfície é declarado.
  veredito: `=${AVISO_SYNC}&"Concurso de professor — tudo o que o radar já viu: "&${N_DOCENTE}&" editais, inclusive os que já encerraram e os sem data de inscrição. Já vem ordenado: o mais acionável primeiro. Toque no funil ▼ da linha ${LINHAS[A.TUDO].cabecalho} pra cortar por ${DOCENTE_FACETAS.join(', ')}."`
    + `&CHAR(10)&"Esta aba fica OCULTA na barra (é arquivo, consulta rara). Ela tem a MESMA forma da 🎓 Concursos — mesmas colunas, mesma ordem, mesmo funil; a única diferença é que aqui nada é cortado. O que dá pra prestar agora está em 🎓 Concursos, na linha 1 — e as "&${N_MERCADO}&" vagas de emprego, em 💼 Empregos."`
    + `&${AVISO_FUNIL(`${letraDe(DOCENTE_CABECALHO, 'Vaga')}${LINHAS[A.TUDO].lista}:${letraDe(DOCENTE_CABECALHO, 'Vaga')}`, N_DOCENTE)}`,
  cabecalho: DOCENTE_CABECALHO,
  lista: `=IFERROR(${docenteVisivel(`SORT(FILTER(${DOCENTE_BLOCO};ISNUMBER(_calc!A2:A));${DOCENTE_COL_ORDEM};TRUE)`)};${CALC_VAZIA})`,
  abrir: docenteAbrir(A.TUDO),
  linkCopiar: docenteLinkCopiar(A.TUDO)
};

// ===========================================================================
// TRILHA MERCADO — bloco `_calc!AA:AK`, consumido pela aba `Empregos`
// ===========================================================================
//
// Por que um bloco separado e não colunas a mais no bloco docente: as duas
// trilhas não compartilham NENHUM eixo de decisão. Ver a nota do topo.
//
// Onde ele mora: AA em diante, deixando S..Z livres. `_calc!V:W` já é a tabela
// de siglas das instituições docentes (escrita por construir.js a partir de
// _norman/siglas.js) e está PROVADA — encostar nela pra ganhar 6 colunas de
// vizinhança seria trocar risco por nada.
//
// -------- o eixo temporal é OUTRO, e isso foi MEDIDO, não suposto --------
// Na trilha docente o eixo é o PRAZO: `inscricao_fim` é fato publicado no DOU
// e discrimina (dos 205 editais há abertos e encerrados; a janela de 60 d saiu
// do p95 real). Na trilha mercado o MESMO campo é FANTASMA — medido no store
// de 26/08/2026, com 359 vagas da Gupy:
//
//   inscricao_fim futuro .... 343      inscricao_fim vencido .... 0 (ZERO)
//   sem inscricao_fim ....... 16
//
// Um campo que joga 343 de 359 no mesmo balde não separa nada. Pior: 46 vagas
// publicadas há mais de 90 dias — uma delas há 1828 dias, de 2021 — seriam
// impressas como "🟢 ABERTO · fecha em N d" se herdassem a fórmula docente.
// Isso não é imprecisão: é a peça afirmando, com ícone verde, uma coisa que
// ela não sabe.
//
// O que DE FATO separa é a idade da publicação (`data_publicacao`), e ela
// distribui bem — 6 de hoje, 68 na semana, 142 no mês, 97 no trimestre, 46
// mais velhas. É também o eixo do job que JB descreveu: "que vaga ABRIU que
// combina comigo". Por isso `inscricao_fim` NÃO aparece na aba `Empregos`
// (continua visível cru na coluna M de `dados`, nada foi apagado) e o eixo é a idade.
//
// -------- por que BALDE e não número de dias --------
// Mesma lei que já vale na `Tudo` (README): coluna que é eixo de filtro precisa
// de valores POUCOS e ESTÁVEIS. "há 13 d" é um valor que muda todo dia e tem
// ~100 variantes — filtro salvo em cima dele quebra amanhã. O balde tem 6
// valores e é estável. O número exato não some: ele É a ordenação (dentro do
// balde, a mais recente primeiro), e a data crua está na coluna N de `dados`.
//
// -------- os limiares do `Match` --------
// 51 NÃO é chute: é `config/notificacao.json → score_minimo`, o mesmo corte que
// decide se a vaga vira mensagem no Telegram. A peça e a notificação passam a
// concordar sobre o que é "combina" — se um dia o limiar mudar lá, muda aqui.
// 70 é o corte do quartil superior MEDIDO no dado real (88 de 359 = 24,5%),
// não um número redondo escolhido por simetria.

const SCORE_MINIMO = 51; // = config/notificacao.json
const SCORE_FORTE = 70;  // = quartil superior medido (88/359)
const TETO_SCORE = 85;   // = teto de lib/score-mercado.js (mesma escala da docente)

// Nome da empresa: `orgao` na trilha mercado é o `careerPageName` cru da Gupy,
// que é campo de MARKETING, não razão social — "VENHA SER #SANGUELARANJA 🧡🚀"
// (14 vagas), "Assaí Atacadista - O atacadista com 50 anos de tradição!
// #VemserAssaí" (69 chars). 25 dos 215 nomes passam de 30 caracteres.
// Tratamento: TRIM + corte em 34 com reticência. Deliberadamente BURRO — cortar
// no " - " daria "Assaí Atacadista" (certo), mas também "IBS" e "SENAI" (perda
// de sentido), e nenhuma regra de string sabe qual empresa é "#SANGUELARANJA".
// Truncar custa caracteres, nunca correção — mesma doutrina do fallback de
// siglas. A sujeira na origem está reportada como observação de pipeline.
const EMPRESA = `IF(LEN(TRIM(${D}!A2:A))>34;LEFT(TRIM(${D}!A2:A);33)&"…";TRIM(${D}!A2:A))`;

// Local: `campus` vem "Cidade - Estado" por extenso ("São Paulo - São Paulo") e
// `uf` já tem a sigla — a linha imprimiria o estado duas vezes. Fica
// "Cidade/UF". Sem cidade (125 vagas remotas, campus e uf vazios) NÃO sobra
// separador órfão: o `IF` de fora é que decide se o separador existe. Foi
// exatamente esse o defeito visível quando as vagas invadiram o Painel — linhas
// começando com " · Grupo Boticário".
const CIDADE = `IFERROR(LEFT(${D}!B2:B;FIND(" - ";${D}!B2:B)-1);${D}!B2:B)`;
const ONDE = `IF(${D}!B2:B="";"";${CIDADE}&IF(${D}!C2:C="";"";"/"&${D}!C2:C))`;

// O "assunto" da vaga: subárea quando existe, senão a área. Pode ser vazio nos
// dois campos — não é hipótese, é o que o teste de estresse forçou.
const ASSUNTO = `IF(${D}!E2:E="";${D}!D2:D;${D}!E2:E)`;

const M = f => `IF(${FORA_MERCADO};"";${f})`;

const CALC_MERCADO = {
  // ---- bloco VISÍVEL e CONTÍGUO AA:AH (é o que o FILTER da `Empregos` lê) ----
  // Duas linhas: empresa em cima, "assunto · lugar" embaixo. O separador só
  // existe quando existem os DOIS lados, e a quebra de linha só existe quando
  // existe pelo menos um — senão a célula fica com um "·" solto ou uma segunda
  // linha em branco, que lê como falha de renderização.
  //
  // Isto foi ESCRITO ERRADO na primeira versão e pego pelo teste de estresse,
  // não pelo dado real: eu tinha guardado só o lado do lugar (`campus=""`) e
  // esquecido o lado do assunto. Registro sintético com área E subárea vazias
  // imprimia "⏎  · Campus Teste/GO" — o mesmo defeito de separador órfão que
  // esta coluna existe pra evitar. Nenhum dos 359 registros reais tem área
  // vazia, então o dado de hoje jamais teria revelado isso.
  //
  // Os quatro ramos são mutuamente exclusivos, então ONDE (a expressão cara,
  // com IFERROR+FIND+LEFT) é avaliado no máximo uma vez por linha, apesar de
  // aparecer duas vezes no texto.
  AA: `=ARRAYFORMULA(${M(`${EMPRESA}&IF(${ASSUNTO}="";IF(${D}!B2:B="";"";CHAR(10)&${ONDE});CHAR(10)&${ASSUNTO}&IF(${D}!B2:B="";"";" · "&${ONDE}))`)})`,

  // Rótulo do balde derivado de AJ (o balde numérico), nunca recalculado por
  // fora: rótulo e ordenação saem do MESMO número e não têm como divergir.
  AB: `=ARRAYFORMULA(${M(`IF(AJ2:AJ=1;"🔥 hoje";IF(AJ2:AJ=2;"🟢 até 7 d";IF(AJ2:AJ=3;"🟡 8 a 30 d";IF(AJ2:AJ=4;"⚪ 31 a 90 d";IF(${D}!N2:N="";"❓ sem data";"🗄️ + de 90 d")))))`)})`,

  AC: `=ARRAYFORMULA(${M(`IF(${D}!O2:O="";"⏳ não pontuada";IF(${D}!O2:O>=${SCORE_FORTE};"🟩 forte";IF(${D}!O2:O>=${SCORE_MINIMO};"🟨 média";"⬜ fraca")))`)})`,

  // Área CANÔNICA da própria trilha (config/keywords-mercado.json: IA/Agentes,
  // UX/Produto, Front-end). O defeito anterior era rederivar isto com o regex
  // de área DOCENTE: "IA/Agentes" e "Front-end" não batiam em padrão nenhum e
  // viravam "Outra"; "UX/Produto" batia por acidente de substring ("ux") e
  // virava "UX/IHC". A cura não é um regex melhor — é parar de traduzir uma
  // taxonomia que já chega classificada.
  AD: `=ARRAYFORMULA(${M(`IF(${D}!D2:D="";"❓ não identificada";${D}!D2:D)`)})`,

  // Enum do schema -> rótulo legível. O último ramo devolve o valor CRU em vez
  // de um "outro": se a fonte passar a emitir um valor novo, ele aparece na
  // peça e no funil, em vez de sumir num balde-lixo silencioso.
  AE: `=ARRAYFORMULA(${M(`IF(${D}!V2:V="";"❓ não dita";IF(${D}!V2:V="remoto";"🏠 remoto";IF(${D}!V2:V="hibrido";"🏠🏢 híbrido";IF(${D}!V2:V="presencial";"🏢 presencial";${D}!V2:V))))`)})`,

  AF: `=ARRAYFORMULA(${M(`IF(${D}!W2:W="";"❓ não dito";IF(${D}!W2:W="senior";"sênior";IF(${D}!W2:W="junior";"júnior";IF(${D}!W2:W="estagio";"estágio";${D}!W2:W))))`)})`,

  AG: `=ARRAYFORMULA(${M(`${D}!S2:S`)})`,

  // Chave de ordenação: balde ASC, depois score DESC, depois idade ASC.
  // O balde manda porque o job pergunta "que vaga ABRIU"; dentro do mesmo balde
  // temporal, quem decide é o quanto combina.
  // `IF(a>b;b;a)` e não `MIN(a;b)`: MIN agregaria o array inteiro num escalar.
  // Faixas: balde 1-5 · (85-score)*100 ≤ 8500 · idade capada em 99 — nada
  // transborda pro dígito do balde, e `INT(ordem/100000)` devolve o balde de
  // volta (é o que a formatação condicional lê da coluna oculta).
  AH: `=ARRAYFORMULA(${M(`AJ2:AJ*${ORDEM_FATOR}+(${TETO_SCORE}-IF(${D}!O2:O="";0;${D}!O2:O))*100+IF(AI2:AI="";99;IF(AI2:AI>99;99;IF(AI2:AI<0;0;AI2:AI)))`)})`,

  // ---- auxiliares, FORA do bloco lido pelo FILTER ----
  AI: `=ARRAYFORMULA(${M(`IF(${D}!N2:N="";"";TODAY()-DATEVALUE(${D}!N2:N))`)})`,

  // Sem data de publicação cai no balde 5 (fundo da lista) e ganha rótulo
  // próprio em AB — "sem data" é um estado, não um zero.
  AJ: `=ARRAYFORMULA(${M(`IF(${D}!N2:N="";5;IF(AI2:AI<=0;1;IF(AI2:AI<=7;2;IF(AI2:AI<=30;3;IF(AI2:AI<=90;4;5)))))`)})`,

  // Nível de match NUMÉRICO (1 forte · 2 combina · 3 fraca · 4 não pontuada).
  // Existe só pras contagens do cabeçalho: COUNTIFS com critério de emoji é
  // frágil (variação de apresentação/ZWJ quebraria a contagem em silêncio, e
  // uma contagem errada no cabeçalho é pior que nenhuma).
  AK: `=ARRAYFORMULA(${M(`IF(${D}!O2:O="";4;IF(${D}!O2:O>=${SCORE_FORTE};1;IF(${D}!O2:O>=${SCORE_MINIMO};2;3)))`)})`
};

const CALC_MERCADO_CABECALHO = {
  AA: 'm_vaga', AB: 'm_quando', AC: 'm_match', AD: 'm_area', AE: 'm_modalidade',
  AF: 'm_nivel', AG: 'm_url', AH: 'm_ordem', AI: 'm_idade', AJ: 'm_balde', AK: 'm_match_num'
};

// ---------- contagens do cabeçalho da `Empregos` ----------
// Todas derivam das MESMAS colunas que a lista logo abaixo usa (AJ = balde,
// AK = nível de match), pela mesma condição — o cabeçalho não tem como
// prometer um número que a lista não entrega.
const NOVAS = `COUNTIF(_calc!AJ2:AJ;"<=2")`;
const NOVAS_FORTES = `COUNTIFS(_calc!AJ2:AJ;"<=2";_calc!AK2:AK;1)`;
const HOJE_FORTES = `COUNTIFS(_calc!AJ2:AJ;1;_calc!AK2:AK;1)`;
const FORTES = `COUNTIF(_calc!AK2:AK;1)`;
const SEM_NOTA = `COUNTIF(_calc!AK2:AK;4)`;

// Mesma doutrina da trilha docente: o cabeçalho é a fonte da ORDEM e da
// VISIBILIDADE (rótulo que abre com `_` é coluna de máquina, oculta), e toda
// letra de coluna sai daqui por `letraDe`, nunca de literal.
// Mesma doutrina da irmã docente: `Inscrito` no FIM, fora do bloco que o
// `FILTER(_calc!AA2:AH)` produz — nunca sobrescrita pelo spill, escrita à
// parte por `construir.js passoRestaurar`.
// `_por_quem` — irmã da mesma coluna em DOCENTE_CABECALHO; ver o comentário lá.
// ONDA UX 13 — `Inscrito` moveu de "última coluna" (posição 10, ~1162 px)
// pra "coluna B" (logo depois de `Abrir`, antes de `Vaga`) — mesma posição e
// mesma razão da irmã docente (`DOCENTE_CABECALHO`, ver o bloco de comentário
// grande acima "A FORMA DA TRILHA DOCENTE"): é a ÚNICA posição que não
// interrompe o bloco contíguo que `FILTER(_calc!AA2:AH)` espalha a partir de
// `Vaga`. `Concursos`/`Empregos` congelam 3 colunas agora (Abrir+Inscrito+
// Vaga) — ver `FROZEN_COLUNAS` em `formatar.js`.
// C1 (Leva 5) — mesma doutrina/mesmo ponto de apêndice da irmã docente,
// acima: depois de `_por_quem`, fora do bloco contíguo do `FILTER`.
const MERCADO_CABECALHO = ['Abrir', 'Inscrito', 'Vaga', 'Publicada', 'Combina?', 'Área', 'Modalidade', 'Nível', '_url', '_ordem', 'link (copiar)', '_por_quem', '❌'];
const MERCADO_FACETAS = ['Publicada', 'Combina?', 'Área', 'Modalidade', 'Nível'];

// ONDA UX 3 (remodelação 2026-09-01) — a instrução que ensina "cole o link de
// uma vaga na Fila" nomeava POSIÇÃO ("última coluna de 💼 Empregos"), e a
// posição já tinha mudado por baixo dela: a Onda 4 (item 4c) pôs `Inscrito`
// DEPOIS de `link (copiar)`, então "última coluna" passou a apontar pro
// checkbox, não pro link. Quem seguisse a instrução ao pé da letra marcava
// "me inscrevi" numa vaga que nunca tinha aberto — medido ao vivo em
// `Fila!A2` e no bloco 🎯 FILA de `Hoje`, os dois copiados do mesmo literal
// errado. A cura nomeia a coluna PELO RÓTULO que ela carrega no cabeçalho
// (`MERCADO_CABECALHO`/`DOCENTE_CABECALHO`, as duas têm `'link (copiar)'` no
// mesmo texto) — rótulo muda por decisão consciente; posição muda calada,
// na PRÓXIMA Onda que mexer no layout.
const FILA_ROTULO_COLUNA_LINK = 'link (copiar)';

const EMPREGOS = {
  // Cascata de 6 ramos, do melhor caso ao vazio absoluto. Nenhum ramo é mudo:
  // todos dizem o que houve E o que fazer. Os dois últimos são os estados que
  // ninguém projeta — "nada novo" e "nada, ponto" — e são justamente os que JB
  // vai encontrar num fim de semana ou se a fonte cair.
  veredito: `=${AVISO_SYNC}&IF(${N_MERCADO}=0;`
    + `"🔴 Nenhuma vaga de mercado no radar ainda. Nada a fazer aqui hoje — a coleta da Gupy roda junto com o radar diário.";`
    + `IF(${HOJE_FORTES}>0;"🔥 "&${HOJE_FORTES}&" vaga(s) publicada(s) HOJE que combinam forte com você — no topo da lista.";`
    + `IF(${NOVAS_FORTES}>0;"🟢 "&${NOVAS_FORTES}&" vaga(s) dos últimos 7 dias que combinam forte com você — no topo da lista.";`
    + `IF(${NOVAS}>0;"⚠️ Nenhuma vaga FORTE nos últimos 7 dias. "&${NOVAS}&" nova(s) com aderência média ou baixa — role e julgue você mesmo.";`
    + `IF(${FORTES}>0;"⚠️ Nada novo nos últimos 7 dias. As "&${FORTES}&" vaga(s) forte(s) da lista são mais antigas — as melhores primeiro, mas confira se ainda estão no ar.";`
    + `"🔴 Nada novo e nada forte hoje. A lista abaixo é arquivo — o radar segue rodando."`
    + `)))))`,

  // A linha de cross-link docente SAIU daqui pelo mesmo motivo da `Concursos`:
  // os dois destinos são link na linha 1 agora. Uma linha de texto a menos.
  contagem: `="Novas (≤ 7 d): "&${NOVAS}&"  ·  combinam forte: "&${FORTES}&"  ·  "&${N_MERCADO}&" vagas no radar."`
    + `&"  Combina? = o quanto a vaga bate com o que você procura (🟩 forte → ⬜ fraca)."`
    + `&IF(${SEM_NOTA}=0;"";"  ·  ⏳ "&${SEM_NOTA}&" ainda sem pontuação — rode: node radar.js julgar")`
    // Onda 4 — irmã gêmea da mesma conta em PAINEL.contagem: ver o
    // comentário lá pra por que o COUNTIF lê a própria coluna Inscrito
    // (escrita como VALOR por `passoRestaurar`, não por fórmula).
    + `&"  ·  "&COUNTIF(${letraDe(MERCADO_CABECALHO, 'Inscrito')}${LINHAS[A.EMPREGOS].lista}:${letraDe(MERCADO_CABECALHO, 'Inscrito')};TRUE)&" já inscrito(s)."`
    // Item 4d — irmã gêmea de PAINEL.contagem: ver o comentário lá.
    + `&IF(COUNTIFS(${letraDe(MERCADO_CABECALHO, 'Inscrito')}${LINHAS[A.EMPREGOS].lista}:${letraDe(MERCADO_CABECALHO, 'Inscrito')};TRUE;${letraDe(MERCADO_CABECALHO, '_por_quem')}${LINHAS[A.EMPREGOS].lista}:${letraDe(MERCADO_CABECALHO, '_por_quem')};"robô")=0;"";`
    + `" ("&COUNTIFS(${letraDe(MERCADO_CABECALHO, 'Inscrito')}${LINHAS[A.EMPREGOS].lista}:${letraDe(MERCADO_CABECALHO, 'Inscrito')};TRUE;${letraDe(MERCADO_CABECALHO, '_por_quem')}${LINHAS[A.EMPREGOS].lista}:${letraDe(MERCADO_CABECALHO, '_por_quem')};"robô")&" pelo robô)")`
    + `&CHAR(10)&"Ordem: mais recente primeiro; dentro da mesma faixa, a que mais combina. Toque no funil ▼ da linha ${LINHAS[A.EMPREGOS].cabecalho} pra cortar por ${MERCADO_FACETAS.join(', ')}."`
    + `&${AVISO_FUNIL(`${letraDe(MERCADO_CABECALHO, 'Vaga')}${LINHAS[A.EMPREGOS].lista}:${letraDe(MERCADO_CABECALHO, 'Vaga')}`, N_MERCADO)}`,

  // `Abrir` é a COLUNA A, não a última. O bloco do FILTER precisa ser contíguo
  // (AA:AH -> `Vaga`..`_ordem`), então o link só cabe antes dele ou depois —
  // e depois cairia fora da dobra: abrir a vaga, que é a ação inteira desta
  // aba, custaria um arrasto lateral. ONDA UX 13 — `Inscrito` entrou ENTRE
  // `Abrir` e `Vaga` (a única posição que não interrompe o bloco contíguo do
  // FILTER — ver `MERCADO_CABECALHO`, acima). `Concursos`/`Empregos` congelam
  // 4 colunas (Abrir+Inscrito+Vaga+Publicada — `Empregos` cresceu de 3 pra 4
  // na Leva 6/V4, resgatando o emoji de frescor pro bloco que sobrevive à
  // rolagem) — ação + checkbox + identidade + frescor sempre visíveis, sem
  // depender da dobra inicial. `link (copiar)` continua perto do fim — fora
  // da dobra é onde ela DEVE ficar (ver a nota gêmea em PAINEL.linkCopiar).
  cabecalho: MERCADO_CABECALHO,
  abrir: (() => {
    const c = letraDe(MERCADO_CABECALHO, '_url'), l = LINHAS[A.EMPREGOS].lista;
    return `=ARRAYFORMULA(IF(${c}${l}:${c}="";"";HYPERLINK(${c}${l}:${c};"📄 vaga")))`;
  })(),
  lista: `=IFERROR(SORT(FILTER(_calc!AA2:AH;ISNUMBER(_calc!AH2:AH));8;TRUE);${CALC_VAZIA})`,
  linkCopiar: (() => {
    const c = letraDe(MERCADO_CABECALHO, '_url'), l = LINHAS[A.EMPREGOS].lista;
    return `=ARRAYFORMULA(IF(${c}${l}:${c}="";"";${c}${l}:${c}))`;
  })()
};

// Sem aviso de CONCENTRAÇÃO nesta aba, e isso é decisão medida, não
// esquecimento. Na `Painel` ele existe porque 15 das 22 linhas são subeditais do
// MESMO edital — a lista lê como monólito. Aqui, 359 vagas se espalham por 215
// empresas e a maior concentração é 14 (3,9%), muito abaixo do gatilho de ≥5
// linhas E ≥40%: o aviso nunca dispararia. E custaria caro — a fórmula é
// COUNTIF por linha (MAP/LAMBDA), ou seja ~359² comparações recalculadas a cada
// abertura no celular. Feature que não dispara e ainda pesa é feature sem
// tarefa.

// Coluna de `_calc` onde vive a tabela de feriados nacionais lida pelo
// NETWORKDAYS do aviso de sync. Fica FORA do bloco docente (A:R), da tabela de
// siglas (V:W) e do bloco mercado (AA:AK) — X sobra de folga entre os dois
// vizinhos, exatamente como V:W já faz.
const FERIADOS_COL = 'Y';

// ===========================================================================
// CAMADA CRM — abas `Hoje`, `Fila`, `Projetos`, `Tarefas`, `Diário`
// ===========================================================================
//
// Portada da planilha pro gerador (briefing "refaça nos padrões do norman" —
// até aqui, as cinco abas existiam só na planilha, criadas e mantidas à mão
// por chamada direta de API, `tmp/aplicar-validacao.js` incluso).
//
// DIFERENÇA ESTRUTURAL do bloco de cima: `Fila`, `Projetos`, `Tarefas` e
// `Diário` são DIGITADAS por JB/Durin — não são espelho nem cache. O gerador
// garante cabeçalho (linha 1), validação, formatação condicional, largura e,
// em `Projetos`, duas colunas CALCULADAS (G/H) — e para por aí. `construir.js`
// NUNCA chama `limpar()` nelas: apagar essas quatro abas apagaria dado real
// que não existe em nenhum outro lugar, ao contrário de `dados (não edite)` e
// `_calc`, que são só espelho/cache do store e podem ser redigitadas do zero
// a qualquer momento. `Hoje` é a exceção — 100% fórmula, sem célula digitada
// — e pode ser tratada como `Concursos`/`Tudo`/`Empregos`: limpa e reescrita
// inteira a cada `construir.js`.
//
// -------- a armadilha de locale, documentada onde a máscara nasce --------
// `dd/mm/yy` (formato de `Projetos!G` e `Diário!A`) e `yyyy-mm-dd` (formato
// ISO que `Hoje!A28` usa pra comparar contra `data_publicacao`) são tokens em
// INGLÊS — mesmo com a planilha em locale `pt_BR`. Trocar por `aaaa` (o
// token de ano em português) NÃO dá erro: a célula silenciosamente passa a
// mostrar o NOME DO DIA DA SEMANA ("quarta-feira") em vez de uma data. É o
// mesmo cuidado que `lib/sheets.js` já documenta pra `inscricao_fim`
// (ISO 8601 é o único formato que o Sheets lê sem ambiguidade de locale) —
// aqui o risco não é ambiguidade dd/mm vs mm/dd, é uma troca de FORMATO
// inteira que passa por válida.

const QUEM_AGE = ['JB', 'Durin', 'os dois'];

// ---- estado vazio: a mobília fica, só o conteúdo falta ----
// Todo texto de estado vazio abre com `↳ ` (U+21B3 + espaço). O marcador não
// é enfeite: é o GANCHO da regra de formatação condicional que os pinta
// recuados (`=LEFT($A4;1)="↳"`). Como a regra R6 tornou toda posição do
// `Hoje` variável, não há como distinguir uma instrução de uma linha de dado
// por POSIÇÃO — só por conteúdo. `↳` é BMP (uma unidade de código), então
// sobrevive a `LEFT(...;1)`, o que emoji astral não faz.
const MARCADOR_VAZIO = '↳ ';
const CARIMBO_DDMM = `IFERROR(TEXT(DATEVALUE(${CARIMBO});"dd/mm");"—")`;

// Onda 17 (Ondas 14-17, CRM vivo) — `parada há` é a coluna NOVA que fecha o
// SLA: quantos dias corridos desde `atualizado em` (a própria JB/Durin toca
// isso quando mexe na linha). Apêndice no FIM do cabeçalho — nunca no meio:
// `Fila` é digitada, e inserir uma coluna no meio deslocaria toda coluna à
// direita da existente sem migração (ao contrário de `Projetos`, que tem o
// mecanismo de migração por nome em `construir.js` — `Fila` não tem, porque
// nunca precisou até agora). Apêndice é a mudança de header mais barata que
// não arrisca dado de JB.
// ONDA UX 12 (remodelação 2026-09-01) — IDENTIDADE ANTES DO DERIVADO. `id`
// (hash sha256, ilegível) nasceu na coluna A — a posição mais valiosa da
// tela (a que o `frozenColumnCount` da Onda 1 congela) mostrando lixo de
// máquina. `o quê` (a descrição legível da vaga, também derivada da `url`
// desde a Onda 17) É a identidade; ela entra na coluna A e `id` sai pra C —
// ainda derivada, ainda ancorada por `letraDe`, só não mais em destaque.
// Só as POSIÇÕES 0 e 2 trocam de lugar; `url`(1)/`trilha`(3) em diante ficam
// EXATAMENTE onde estavam — nenhuma coluna DIGITADA (`url`, `estágio`,
// `ordem`, `prazo`, `quem age`, `próximo passo`, `atualizado em`, `notas`)
// muda de posição, então não há dado de JB pra migrar.
// C3 (Leva 5) — `⭐` apendado no FIM. `Fila` é 100% DIGITADA (nunca entra
// em `LEITURA`/`limpar()` de `construir.js`) — ao contrário do `⭐` de
// `Candidaturas` (que nasce de um SPILL reordenado a cada build e por isso
// precisa do mecanismo de `_estado`), este sobrevive SOZINHO, como
// `quem age`/`notas` já sobrevivem. Nenhuma memória em `_estado` pra ele.
const FILA_CABECALHO = ['o quê', 'url', 'id', 'trilha', 'estágio', 'ordem', 'prazo', 'quem age', 'próximo passo', 'atualizado em', 'notas', 'parada há', '⭐'];
const FILA_TRILHAS = ['docente', 'mercado', 'outro'];
const FILA_ESTAGIOS = ['🔵 na fila', '🟡 preparando', '🟣 inscrito', '🟢 avançou', '🔴 recusado', '⚫ descartado'];
// C3 — mesmo vocabulário em `Candidaturas!⭐` e `Fila!⭐`, DECLARADO UMA VEZ
// (juízo de JB, distinto do score do robô — nunca reordenado nem
// reaproveitado como valor de outra coluna).
const PRIORIDADE_JB = ['⭐⭐⭐', '⭐⭐', '⭐', '—'];
// Estágios que tiram a linha da vista rápida do bloco 🎯 FILA de `Hoje`: já
// foi decidido, não é mais "próximo por ordem". A fórmula do bloco FILA (e o
// aviso de "não cabem" logo abaixo dela) GERAM a exclusão a partir desta
// lista (não a reescrevem solta) — um estágio novo em `FILA_ESTAGIOS` que
// devesse sumir do painel do dia entra aqui uma vez só.
const FILA_ESTAGIOS_FORA_DO_HOJE = ['🟣 inscrito', '🔴 recusado', '⚫ descartado'];

// `Fila!A` (id) DEIXA DE SER DIGITADA e vira DERIVADA da `url`.
//
// É o conserto do job mais quebrado da peça, e o dado provava o diagnóstico:
// a `Fila` tinha ZERO linhas. Não por falta de vontade — obter o `id` à mão
// custava ir a `dados (não edite)`, localizar a linha certa entre 750, copiar
// a coluna T e voltar. No celular isso é inviável, e uma aba de captura cujo
// custo de captura é proibitivo fica vazia. Foi o que aconteceu.
//
// A `url` já é a chave de junção natural (é o que JB copia da coluna
// `link (copiar)` das abas de radar) e o `id` é
// `sha256(orgao|area|data_publicacao|url|subedital)`, estável entre syncs pra
// sempre. Fora do store, a célula diz `— fora do radar —`: é VERDADE, não
// perda — a Fila é curadoria e aceita candidatura que o radar nunca viu.
//
// Ancorada na primeira linha de dado, crescendo pra baixo na coluna A. Não
// colide com nada: as colunas digitadas ficam à direita (B:K), e o spill
// nunca encontra célula ocupada porque A é território da fórmula.
// Consequência a declarar: `COUNTA(A:A)` deixa de servir pra "a aba está
// vazia?" (COUNTA conta o `""` que a fórmula devolve). Quem responde isso na
// `Fila` é a coluna `url` — ver FILA_VAZIA abaixo.
//
// C10 Parte 4 — A BOMBA DESARMADA. `INDEX(intervalo;MATCH(array;...))` NÃO
// vetoriza em Sheets, nem dentro de `ARRAYFORMULA`: `MATCH` devolve o array
// de posições certo, mas `INDEX` alimentado com esse array de `row_num`
// devolve UM valor só (o da primeira posição), não um array — o MESMO
// defeito que a Onda 5-6 já consertou em `Candidaturas` (`candidaturasOrgao`,
// abaixo). Aqui ele nunca tinha se manifestado porque a `Fila` está vazia
// desde que nasceu — o `IF(B{dados}:B="";"";...)` que embrulhava esta
// fórmula nunca chegou a avaliar o ramo do INDEX/MATCH com dado real, e por
// isso passava raso por toda auditoria de leitura. Reportado com reprodução
// em RELATORIO-ONDA-5-6.md §Pendências ("vai quebrar silenciosamente no dia
// em que JB colar a primeira url"). Cura, agora: `MAP`+`LAMBDA` — dentro do
// LAMBDA, `u` é SEMPRE escalar, então `MATCH(u;...)`/`INDEX(...;MATCH(u;...))`
// operam sem array nenhum, o caso que funciona. `MAP` já é função de array
// nativa — não precisa do `ARRAYFORMULA` que embrulhava a versão quebrada.
// Provado ao vivo (RELATORIO-ONDA-21.md §Parte 4): colar uma url real em
// `Fila!B`, `id` deriva certo; remover, a linha volta a `""` sem lixo.
const FILA_ID_DERIVADO = `=MAP(B${LINHAS[A.FILA].dados}:B;LAMBDA(u;IF(u="";"";`
  + `IFERROR(INDEX(${D}!$T$2:$T;MATCH(u;${D}!$S$2:$S;0));"— fora do radar —"))))`;

// ===========================================================================
// Onda 17 (CRM vivo) — BAIXAR O CUSTO DE ENTRADA DA `Fila`
// ===========================================================================
//
// A `Fila` está vazia desde que nasceu. C10 Parte 4 desarmou a bomba do
// `id` (`FILA_ID_DERIVADO`, acima) — mas medido em passos, colar a url
// continuava exigindo DIGITAR à mão "o quê" e "trilha" pra a linha fazer
// sentido no bloco 🎯 FILA de `Hoje` (o filtro dali lê `C<>""`). O pedido
// literal da Onda 17 é "colar um link de vaga na Fila preenche o resto
// sozinho" — então "o quê" e "trilha" DEIXAM DE SER DIGITADAS e viram
// DERIVADAS da `url`, no MESMO padrão MAP+LAMBDA de `FILA_ID_DERIVADO`
// (comprovado contra o defeito de INDEX/MATCH não vetorizar, ver o bloco de
// comentário acima) — três colunas, três `MAP(B{dados}:B;...)` independentes,
// cada uma ancorada na SUA coluna.
//
// `o quê` reaproveita EXATAMENTE a mesma régua que `candidaturasVaga`
// (Onda 5, mais abaixo neste arquivo) já usa pra "o quê" de uma candidatura:
// subárea se houver, senão área. DRY deliberado — duas implementações da
// mesma pergunta ("o que é esta vaga, numa frase") divergiriam cedo ou
// tarde.
//
// `trilha` lê `dados!U` direto (já é `docente`/`mercado`, o mesmo
// vocabulário de `FILA_TRILHAS`); fora do radar cai em `'outro'` — o
// terceiro valor de `FILA_TRILHAS` existe desde a Onda de origem
// exatamente pra este caso.
//
// O QUE FICA DE FORA, DECLARADO: `estágio`, `ordem`, `prazo`, `quem age`,
// `próximo passo` e `notas` continuam DIGITADAS. Forçar TODAS as colunas a
// formula destruiria a promessa que `FILA_ID_DERIVADO` já documenta — "a
// Fila é curadoria e aceita candidatura que o radar nunca viu": uma vaga
// fora do radar (`id`/`o quê`/`trilha` caem no fallback) ainda pode ganhar
// um `prazo` e um `próximo passo` reais, escritos por JB — se essas colunas
// também fossem fórmula, esse caminho morreria. `prazo` em particular
// TINHA candidato a virar derivado (`dados!inscricao_fim` existe e é ISO
// limpo) — decisão consciente de NÃO fazer: o prazo é o campo que JB mais
// precisa poder OVERRIDAR (edital atualiza data, ou a vaga nem tem prazo no
// radar), e uma coluna-fórmula não aceita override.
const FILA_OQUE_DERIVADO = `=MAP(B${LINHAS[A.FILA].dados}:B;LAMBDA(u;IF(u="";"";`
  + `IFERROR(LET(`
  + `sub;INDEX(${D}!$E$2:$E;MATCH(u;${D}!$S$2:$S;0));`
  + `are;INDEX(${D}!$D$2:$D;MATCH(u;${D}!$S$2:$S;0));`
  + `IF(sub<>"";sub;are));"— fora do radar —"))))`;
const FILA_TRILHA_DERIVADA = `=MAP(B${LINHAS[A.FILA].dados}:B;LAMBDA(u;IF(u="";"";`
  + `IFERROR(INDEX(${D}!$U$2:$U;MATCH(u;${D}!$S$2:$S;0));"outro"))))`;

// SLA — "oportunidade parada há mais de N dias acende". `atualizado em` já
// existia (digitada — JB/Durin tocam nela quando mexem na linha); `parada
// há` é o NÚMERO cru derivado dela (mesmo motivo de `PROJETOS_ULTIMA_
// MOVIMENTACAO`/`candidaturasAguardandoHa`: um VALOR ordena e uma máscara
// formata; texto pré-formatado não faz nem um nem outro). Dupla leitura
// (`ISNUMBER` primeiro) porque `atualizado em` pode chegar como DATA
// digitada (serial) OU como texto ISO — os dois formatos já convivem nesta
// planilha (ver a nota de locale no topo da CAMADA CRM) e um só `DATEVALUE`
// erraria sobre um serial.
const FILA_SLA_DIAS = 10;
const FILA_PARADA_HA = `=MAP(J${LINHAS[A.FILA].dados}:J;LAMBDA(at;IF(at="";"";`
  + `IFERROR(IF(ISNUMBER(at);TODAY()-at;TODAY()-DATEVALUE(at));""))))`;

// ===========================================================================
// `Candidaturas` (Onda 5) — o funil DEPOIS da inscrição, derivado de
// `_estado`, nunca digitado à mão
// ===========================================================================
//
// O que JB chamou de "quais empresas fiz inscrição, quais concursos estou
// atrás" — hoje isso não existe como entidade, só como um check solto em
// `Concursos`/`Empregos`. `Candidaturas` é a ENTIDADE: uma linha por url com
// `_estado!inscrito=true`, e SÓ isso decide se a linha existe — ninguém
// digita "inscrito" uma segunda vez aqui (mesma lei que proíbe estado
// duplicado em toda esta planilha).
//
// SEIS colunas são o SPILL (A:F, contíguas — um `HSTACK`/`FILTER` só, mesmo
// padrão da vitrine de `Concursos`/`Empregos`): órgão/empresa · vaga ·
// trilha · inscrito em · aguardando há · `_url` (oculta, chave de junção).
// TRÊS são DIGITADAS (G:H:I — estágio · próximo passo · notas), fora do
// território do spill de propósito: célula digitada DENTRO de um spill
// colide com ele (a mesma lei de N-13/C3 que protege `Inscrito` em
// `Concursos`/`Empregos`). Elas sobrevivem à reordenação do spill pelo MESMO
// mecanismo de três tempos — `EST.colherCandidatura`/`EST.
// candidaturaCamposNaOrdem`, chamados de `construir.js passoColher`/
// `passoRestaurar` ao lado do que já existe pra `Inscrito`.
// C3/C4 (Leva 5) — `⭐`/`por quê` apendados no FIM, mesma doutrina de
// `estágio`/`próximo passo`/`notas` (nunca inserir no meio): as duas são
// DIGITADAS, fora do território do spill A:F, persistidas em `_estado` pelo
// MESMO caminho (`colherCandidatura`/`candidaturaCamposNaOrdem`, agora com
// `prioridade`/`porQue`).
// LEVA 7 (remodelação 2026-09-01) — `link retomada` apendado no FIM, MESMA
// doutrina de C3/C4 acima: quando um processo trava numa etapa que só JB
// pode destravar (gravar vídeo, enviar foto, teste que produz o perfil
// dele), esta coluna guarda o link pra voltar direto pro ponto exato — JB
// digita/cola, `colherCandidatura`/`candidaturaCamposNaOrdem` persistem em
// `_estado` pelo MESMO caminho de `nota`/`prioridade`/`por_que`. TEXTO
// PURO, não `HYPERLINK()`: a mesma escrita que sobrevive à reordenação do
// spill (`passoRestaurar`, `construir.js`) REESCREVE esta célula como VALOR
// a cada build — uma fórmula aqui seria apagada no primeiro rebuild
// seguinte. Ver o veredito de clicabilidade em `_norman/formatar.js`, onde
// esta coluna É INTENCIONALMENTE deixada fora de `T_LINK` (a linguagem
// visual de link estático): pintar de link uma célula que não é link de
// verdade é o defeito que a Onda D2 (afordância de link) existe pra matar.
const CANDIDATURAS_CABECALHO = [
  'órgão/empresa', 'vaga', 'trilha', 'inscrito em', 'aguardando há', '_url',
  'estágio', 'próximo passo', 'notas', '⭐', 'por quê', 'link retomada'
];
// C2 (Leva 5) — funil CANÔNICO ampliado, pedido literal do briefing:
// "📨 inscrito → 🧾 docs → 📝 prova/entrevista → ⏳ resultado → 🟢 aprovado →
// 🔴 não passou → ⚫ retirei". Substitui o funil de 4 estágios da Onda 5-6
// (`🟣 inscrito`/`📝 prova/entrevista`/`🟢 aprovado`/`🔴 não passou`) — o
// valor legado `🟣 inscrito` que já existe em `_estado` (dado REAL de JB) é
// migrado pra `📨 inscrito` (mesmo POSTO no funil, glifo novo), nunca
// apagado — ver `MIGRACAO_ESTAGIO_LEGADO` e `_norman/estado.js
// migrarEstagiosLegado`/`construir.js`. Mesma família visual de
// `FILA_ESTAGIOS` (glifo de cor por estado), sem reaproveitar os MESMOS
// glifos.
//
// LEVA 7 (remodelação 2026-09-01) — `🙋 aguardando JB` APENDADO NO FIM, não
// inserido no meio do funil. Motivo: os sete estágios acima são POSTOS de
// um funil ordenado (cada um sucede o anterior); "travado, esperando ação
// de JB" NÃO é um posto — é um estado TRANSVERSAL que pode acontecer em
// qualquer ponto entre `docs` e `resultado` (gravar vídeo, enviar foto,
// teste que produz o perfil de JB). Inserir no meio (ex.: entre `resultado`
// e `aprovado`) sugeriria uma posição ordinal que não existe — o dropdown e
// a linha de funil (`CANDIDATURAS_FUNIL_TEXTO`, abaixo) leriam como se
// "travado" fosse o passo seguinte a `resultado`, o que é falso pra uma
// candidatura travada logo em `docs`.
//
// O EMOJI NÃO É `🚧`: essa sugestão do briefing DESTOA — `🚧` já é
// `HOJE_BLOCO_GLIFO.ATENCAO`, o título do bloco "🚧 ATENÇÃO — parado,
// bloqueado, ou o relógio correndo" no painel `Hoje`, cujas fontes são
// `Fila`/`Candidaturas` (por `aguardando há`, um critério de TEMPO)/`Tarefas`
// (por `bloqueada por`) — nenhuma delas lê este novo campo `estágio`.
// Reusar `🚧` faria uma candidatura em `estágio="🚧 ..."` parecer,
// visualmente, que ALIMENTA o bloco ATENÇÃO (ela não alimenta — o que
// alimenta é o tempo parado, não o estágio) e colidiria com o título do
// bloco na varredura de tela. `🙋` (ninguém no repertório de glifos desta
// planilha o usa hoje) não entra em conflito e lê o significado certo:
// "isto precisa de VOCÊ, especificamente" — a mesma leitura do exemplo do
// briefing (gravar vídeo, enviar foto, teste com o perfil do próprio JB).
const CANDIDATURAS_ESTAGIOS = [
  '📨 inscrito', '🧾 docs', '📝 prova/entrevista', '⏳ resultado', '🟢 aprovado', '🔴 não passou', '⚫ retirei',
  '🙋 aguardando JB'
];
// Glifo isolado por estágio, na MESMA ordem de `CANDIDATURAS_ESTAGIOS` —
// usado pelo funil compacto do PULSO (`Hoje`, C5) e por notas.js (C6).
// Declarado por FORA (não com `LEFT(estagio;2)`): a maioria destes glifos é
// astral (surrogate pair no UTF-16) — `LEFT` corta pela METADE do par em
// silêncio, mesma lição documentada em `MARCADOR_VAZIO`/`notas.js`.
// LEVA 7 — `🙋` apendado, MESMA posição relativa de `CANDIDATURAS_ESTAGIOS`
// acima (o `.map((e,i) => ... GLIFO[i] ...)` de `CANDIDATURAS_FUNIL_TEXTO`
// casa os dois arrays por ÍNDICE — os dois têm que crescer juntos).
const CANDIDATURAS_ESTAGIOS_GLIFO = ['📨', '🧾', '📝', '⏳', '🟢', '🔴', '⚫', '🙋'];
// Valor ANTIGO (Onda 5-6) -> valor NOVO (Leva 5), pro migrador em
// `estado.js`. `🟣 inscrito` é o único estágio já usado em `_estado` — dado
// real de JB, migrado por VALOR, nunca apagado (fronteira do briefing).
const MIGRACAO_ESTAGIO_LEGADO = { '🟣 inscrito': CANDIDATURAS_ESTAGIOS[0] };
const CANDIDATURAS_FORA_DO_RADAR = '— fora do radar —';
// Limiar de "aguardando há" — dias sem novidade (nem resposta, nem mudança
// de estágio) a partir dos quais a linha ACENDE. JB não deu um número; 14
// dias (duas semanas) é o heurístico comum de follow-up de processo
// seletivo — DECLARADO aqui, não escondido dentro da fórmula, e um único
// lugar pra JB ajustar se discordar (mesmo espírito de
// `LIMIAR_ATRASO_DIAS_UTEIS` acima).
const CANDIDATURAS_LIMIAR_AGUARDANDO_DIAS = 14;

const CANDIDATURAS_LARGURA_SPILL = 6; // A:F — ver bloco de comentário acima
const candLinhaVazia = expr => `HSTACK(${[expr, ...Array(CANDIDATURAS_LARGURA_SPILL - 1).fill('""')].join(';')})`;

// ACHADO AO VIVO NESTA RODADA — `INDEX(intervalo;MATCH(array;...))` NÃO
// vetoriza em Sheets, nem dentro de `ARRAYFORMULA`: `MATCH` devolve o array
// de posições certo (confirmado por sonda: `748;745;782;#N/A;...`), mas
// `INDEX` alimentado com esse array de `row_num` devolve UM valor só (o da
// primeira posição), não um array. Reproduzido isolado, fora da fórmula
// real, com `Candidaturas!Z1` como bancada de prova (removida depois). O
// MESMO padrão em `FILA_ID_DERIVADO` (`formulas.js` acima) tinha o MESMO
// defeito — só nunca tinha aparecido porque `Fila` estava vazia desde que
// nasceu. Consertado na C10 Parte 4, com a mesma cura `MAP`+`LAMBDA` — ver o
// bloco de comentário em `FILA_ID_DERIVADO`, acima.
//
// A CURA, aqui: `MAP`+`LAMBDA` — o único jeito comprovado de fazer
// INDEX/MATCH vetorizar por linha neste Sheets. Dentro do LAMBDA, `u` é
// SEMPRE escalar, então `MATCH(u;...)`/`INDEX(...;MATCH(u;...))` operam sem
// array nenhum — é exatamente o caso que funciona.
const candidaturasOrgao = `MAP(${A.EST}!$A$2:$A;LAMBDA(u;IF(u="";"";`
  + `IFERROR(INDEX(${D}!$A$2:$A;MATCH(u;${D}!$S$2:$S;0));"${CANDIDATURAS_FORA_DO_RADAR}"))))`;
const candidaturasVaga = `MAP(${A.EST}!$A$2:$A;LAMBDA(u;IF(u="";"";`
  + `IFERROR(LET(`
  + `sub;INDEX(${D}!$E$2:$E;MATCH(u;${D}!$S$2:$S;0));`
  + `are;INDEX(${D}!$D$2:$D;MATCH(u;${D}!$S$2:$S;0));`
  + `IF(sub<>"";sub;are));"${CANDIDATURAS_FORA_DO_RADAR}"))))`;
const candidaturasTrilha = `${A.EST}!$B$2:$B`;
const candidaturasInscritoEm = `IFERROR(DATEVALUE(${A.EST}!$D$2:$D);"")`;
// `aguardando há` — dias desde `inscrito em` OU desde a última mudança de
// `estágio` (`_estado!estagio_quando`), O QUE FOR MAIS RECENTE. Devolve
// NÚMERO cru (não texto): `formatar.js` aplica a máscara `0" d"` — o mesmo
// motivo já documentado em `PROJETOS_ULTIMA_MOVIMENTACAO` (a coluna que
// devolve VALOR ordena como data/número; texto pré-formatado não ordena e
// não tem o que uma máscara formate).
//
// ACHADO AO VIVO NESTA RODADA, segundo depois do de `candidaturasOrgao`
// acima: `MAX(arrayA;arrayB)` NÃO faz máximo LINHA A LINHA — devolve o
// maior valor entre TODOS os elementos das duas listas combinadas, um
// escalar, não um array. Misturado com colunas de verdade array (o resto do
// `HSTACK`), o `IFERROR` externo capturava o descompasso de tamanho e a
// coluna toda saía "" — o número simplesmente sumia, sem erro visível
// nenhum. `MAP`+`LAMBDA` de novo é a cura: dentro do LAMBDA, `q`/`eq` são
// escalares (um por linha), então `LET`/`IF`/`MAX` de dois escalares
// funcionam exatamente como se espera.
const candidaturasAguardandoHa = `MAP(${A.EST}!$D$2:$D;${A.EST}!$H$2:$H;LAMBDA(q;eq;`
  + `IF(q="";"";IFERROR(LET(`
  + `insc;DATEVALUE(q);`
  + `estq;IF(eq="";insc;IFERROR(DATEVALUE(eq);insc));`
  + `TODAY()-MAX(insc;estq));""))))`;
const candidaturasUrl = `${A.EST}!$A$2:$A`;

const CANDIDATURAS_COND = `(${A.EST}!$C$2:$C=TRUE)*(${A.EST}!$A$2:$A<>"")`;
const CANDIDATURAS_CORPO = `SORT(FILTER(HSTACK(${candidaturasOrgao};${candidaturasVaga};${candidaturasTrilha};`
  + `${candidaturasInscritoEm};${candidaturasAguardandoHa};${candidaturasUrl});${CANDIDATURAS_COND});4;FALSE)`;
// V1 (Leva 6) — a frase abria com "Nenhuma candidatura ainda.", REPETINDO o
// que o veredito (linha 2, `CANDIDATURAS_VEREDITO`, logo abaixo) já anuncia
// ("🟢 Nenhuma candidatura em aberto ainda.") uma linha acima — a única
// dupla-mensagem-de-vazio da peça inteira (nenhuma outra aba tem banner +
// placeholder dizendo a MESMA coisa duas vezes). O veredito fica dono do
// "você tem zero"; esta linha fica dona só do "e agora?" — o mesmo recorte
// que as outras abas digitadas já usam (duas frases, uma anuncia o estado,
// a outra instrui a ação — nunca as duas anunciando).
const CANDIDATURAS_VAZIO = candLinhaVazia(
  `"${MARCADOR_VAZIO}Marque «Inscrito» em ${ROTULO_NAV[A.PAINEL]} ou ${ROTULO_NAV[A.EMPREGOS]}: a linha aparece aqui sozinha."`
);
const CANDIDATURAS_FORMULA = `=IFERROR(${CANDIDATURAS_CORPO};${CANDIDATURAS_VAZIO})`;

// Veredito (linha 2). NÃO conta pela coluna `_url` renderizada — achado ao
// vivo nesta Onda: `COUNTIF(range;"<>")`/`COUNTA` tratam a string vazia que
// UM SPILL devolve (`HSTACK(...;"";"";...)` da linha de "vazio") como
// "não-branco" — o mesmo problema que `FILA_VAZIA` resolve para uma coluna
// DIGITADA (célula nunca tocada é blank de verdade) NÃO se resolve pra uma
// coluna que é FRUTO DE FÓRMULA (a célula sempre "tem conteúdo", mesmo
// quando o conteúdo é ""). Medido: com `_estado` sem nenhuma linha
// `inscrito=true`, `COUNTIF($F4:$F;"<>")` devolvia **1**, não 0 — o veredito
// dizia "1 candidatura em aberto" com a tabela mostrando o estado vazio,
// lado a lado. A cura é a mesma do rodapé de transbordo das vistas de
// notícia (C2 do plano-mãe): contar direto na FONTE (`_estado`), nunca no
// que o spill renderizou — a mesma condição `CANDIDATURAS_COND` do corpo,
// reaplicada aqui, não uma segunda implementação dela.
//
// SEGUNDO ACHADO AO VIVO, mais sutil: `LET(cond;<expressão array>;n;
// SUMPRODUCT(cond);...)` — vincular um ARRAY vindo de comparação de
// intervalo (`(range=TRUE)*(range<>"")`) a um nome de `LET` e reusar esse
// nome dentro de um `SUMPRODUCT` mais adiante devolve **0 em silêncio**,
// nunca um erro (`IFERROR` não pega nada porque não há erro — o valor
// simplesmente vem errado). Reproduzido isolado, numa bancada de prova
// (removida depois): a MESMA expressão, calculada INLINE dentro do
// `SUMPRODUCT` (sem passar por `LET`), devolve o número certo. Curioso: um
// array vindo de `MAP` (não de comparação de intervalo crua) sobrevive ao
// mesmo `LET`+reuso sem problema — por isso `acesas` abaixo usa `MAP` pra
// "dias" e `SUMPRODUCT` com a condição INLINE (nunca uma variável `cond`
// separada). Registrado com reprodução no relatório desta Onda.
const CANDIDATURAS_COL_URL_LETRA = letraDe(CANDIDATURAS_CABECALHO, '_url');
const CANDIDATURAS_COL_AGUARDANDO_LETRA = letraDe(CANDIDATURAS_CABECALHO, 'aguardando há');
// C2 (Leva 5) — A LINHA DE FUNIL. "uma LINHA DE FUNIL no topo da aba
// (contagem por estágio, derivada da lista — mesma expressão)": DECISÃO —
// vira uma SEGUNDA LINHA DE TEXTO (CHAR(10)) dentro da MESMA célula do
// veredito, já no topo da aba (linha 2, logo abaixo da nav), em vez de uma
// linha de GRADE nova. Mesmo dispositivo que `PAINEL.contagem` já usa
// ("duas linhas em vez de uma fileira" — ver o comentário lá) e MENOR
// deslocamento possível: uma linha de grade nova empurraria `cabecalho`/
// `lista`/`congelado` (todos derivados de `F.LINHAS[A.CANDIDATURAS]`) e
// exigiria reancorar `CANDIDATURAS_FORMULA`/a validação/a proteção — zero
// disso muda aqui. A contagem lê `_estado!$C`(inscrito)/`_estado!$G`
// (estágio), a MESMA fonte que `CANDIDATURAS_COND`/`CANDIDATURAS_CORPO`
// já leem pra montar a lista — nunca uma segunda implementação do filtro.
const CANDIDATURAS_FUNIL_TEXTO = CANDIDATURAS_ESTAGIOS
  .map((e, i) => `"${CANDIDATURAS_ESTAGIOS_GLIFO[i]} "&COUNTIFS(${A.EST}!$C$2:$C;TRUE;${A.EST}!$G$2:$G;"${e}")`)
  .join(`&" · "&`);
const CANDIDATURAS_VEREDITO = `=IFERROR(LET(`
  + `n;SUMPRODUCT(${CANDIDATURAS_COND});`
  + `diasArr;MAP(${A.EST}!$D$2:$D;${A.EST}!$H$2:$H;LAMBDA(q;eq;`
  + `IF(q="";-1;LET(insc;DATEVALUE(q);estq;IF(eq="";insc;IFERROR(DATEVALUE(eq);insc));TODAY()-MAX(insc;estq)))));`
  + `acesas;SUMPRODUCT(${CANDIDATURAS_COND}*(diasArr>${CANDIDATURAS_LIMIAR_AGUARDANDO_DIAS}));`
  + `IF(n=0;"🟢 Nenhuma candidatura em aberto ainda.";`
  + `"🟢 "&n&" candidatura(s) em aberto"&IF(acesas>0;" · 🔴 "&acesas&" aguardando há mais de ${CANDIDATURAS_LIMIAR_AGUARDANDO_DIAS} d sem novidade";"")&".")`
  + `&CHAR(10)&"Funil: "&${CANDIDATURAS_FUNIL_TEXTO}`
  + `);"")`;

// ORDEM DE COLUNA MEDIDA, e ela mudou porque a peça renderizada desmentiu a
// conta da spec. As duas colunas que FECHAM o job "ver tudo de um projeto"
// (`próximas tarefas`, `últimas movimentações`) tinham sido postas no FIM: a
// primeira delas começava a 1.324 px da borda (A=216, B=132, C=116, D=250,
// E=84, F=78, G=132, H=96, I=220). Na dobra de ~390 px do celular são ~4
// arrastos até enxergar a primeira. A spec contou 1 toque + 1 arrasto = 2;
// medido na peça construída, 1 + 4 = 5. A feature existia e a tarefa não
// ficou barata — proxy contável.
//
// Elas sobem pra logo depois de `próximo passo`, que é a coluna com que elas
// se leem juntas. `quem age` e `prazo` descem — são o "quem/quando", não o
// "o quê", e o painel do dia já os mostra. Offset novo de `próximas tarefas`:
// 216+132+116+250 = 714 px = 2 arrastos.
//
// HONESTIDADE DA CONTA: isso leva o job (f) de 5 pra 3 passos, NÃO pra 2. Com
// `projeto` (216) + `próximo passo` (250) na frente — e os dois precisam
// estar —, 390 px não alcançam a quinta coluna por aritmética. O 2 da spec
// não existe nesta largura; o que existe é 3, e o bloco 📌 PROJETOS do `Hoje`
// (com o D3 consertado) responde boa parte do job sem abrir a aba.
//
// D8, no mesmo movimento: `última movimentação` (132 px) e `tarefas abertas`
// (96 px) renderizavam COLIDINDO — o primeiro cortado no meio do marcador de
// nota, o segundo invadindo `notas`. Os dois rótulos ilegíveis, na linha mais
// lida da tabela. Encurtar é mais barato que alargar e melhora a dobra junto:
// `movimentou` e `abertas`. O que o rótulo curto deixa de dizer, a nota de
// célula diz — e ela já existia.
// ===========================================================================
// Onda 14 (CRM vivo) — `Etapas`: a entidade que `Projetos` não tinha
// ===========================================================================
//
// "Onde Durin registra a etapa concluída" é metade do pedido de JB — uma
// LINHA de `Projetos` não guarda uma LISTA de marcos, então a etapa vira
// aba própria, digitada (JB e Durin registram cada uma), no mesmo espírito
// de `Fila`/`Tarefas`/`Diário`.
//
// `projeto` casa por IGUALDADE DE STRING com `Projetos!A` — a MESMA lei que
// `Diário!sobre` já segue (G0 em `verificar.js`, N11) e que `verificar.js`
// já teria que aprender a checar aqui também: uma `Etapas!projeto` órfã (sem
// projeto cadastrado com esse nome exato) vira etapa que `Projetos!etapa
// atual`/`progresso` nunca contam — em silêncio, a mesma classe de defeito.
const ETAPAS_CABECALHO = ['projeto', 'etapa', 'ordem', 'estado', 'quando', 'quem'];
const ETAPAS_ESTADOS = ['⬜ pendente', '🔨 em curso', '✅ concluída'];

const PROJETOS_CABECALHO = [
  'projeto', 'frente', 'estágio', 'próximo passo',
  // Onda portal: as duas colunas que fecham o job "ver TUDO de um projeto".
  // `Projetos` já respondia QUANTO (COUNTIFS) e QUANDO (MAXIFS) — nunca O QUÊ.
  // Calculadas, mesmo padrão (uma fórmula por linha até PROJETOS_ULTIMA_LINHA).
  'próximas tarefas', 'últimas movimentações',
  'quem age', 'prazo', 'movimentou', 'abertas', 'notas',
  // Onda 14 (CRM vivo) — as três colunas que fecham "onde Durin registra a
  // etapa concluída". APÊNDICE no fim (L:N), nunca no meio: os dois projetos
  // digitados de JB (Projeto pessoal, Faculdade) têm dado real nas colunas A-K, e
  // `construir.js` já tem o mecanismo de migração por NOME pra `Projetos`
  // (§3b) — ele preserva qualquer ordem, mas apêndice puro nem precisa
  // exercitá-lo pra nada além de "cabeçalho novo, colunas velhas na mesma
  // posição". Todas as três são DERIVADAS de `Etapas` — nunca digitadas
  // (a lei do briefing: "saúde e progresso são derivados, nunca digitados").
  'etapa atual', 'progresso', 'saúde'
];
const PROJETOS_ESTAGIOS = ['🌱 começando', '🔨 tocando', '⏸️ parado', '✅ entregue'];
// Última linha coberta pelas colunas calculadas G/H desta aba E pelo dropdown
// `ONE_OF_RANGE` de `Tarefas!B` (ver formatar.js) — UMA constante, dois
// consumidores, de propósito: o defeito que o briefing descreve ("o dropdown
// mostra menos projetos do que existem, sem erro nenhum") só é impossível
// por CONSTRUÇÃO se os dois lerem daqui. A guarda em `_norman/verificar.js`
// confere o lado que construção nenhuma cobre: se JB digitar um projeto além
// desta linha na planilha viva, sem tocar no código.
//
// DERIVADA, não literal (N-17): o cabeçalho desceu da linha 1 pra linha 2 e
// os dados começam na 3. A CAPACIDADE (quantos projetos cabem) é que é a
// escolha; a última linha é consequência dela e da primeira linha de dado.
// Antes desta Onda `PROJETOS_ULTIMA_LINHA` era 21 com dados a partir da 2 —
// 20 projetos. Continua 20; só o endereço mudou.
const PROJETOS_CAPACIDADE = 20;
const PROJETOS_PRIMEIRA_LINHA = LINHAS[A.PROJETOS].dados;
const PROJETOS_ULTIMA_LINHA = PROJETOS_PRIMEIRA_LINHA + PROJETOS_CAPACIDADE - 1;
const PROJETOS_RANGE_NOME = `${A.PROJETOS}!$A$${PROJETOS_PRIMEIRA_LINHA}:$A$${PROJETOS_ULTIMA_LINHA}`;
// Fórmulas por linha (G e H de `Projetos`) — funções de `linha` porque, ao
// contrário de `_calc` (ARRAYFORMULA cobrindo a coluna inteira), cada linha
// de `Projetos` recebeu sua própria fórmula não-array quando a aba foi
// criada à mão; portar como array de fórmula por linha é o que preserva
// esse formato ao regerar (ver `construir.js`, que escreve uma por vez).
//
// DEFEITO EM PRODUÇÃO, achado lendo a peça viva: com o `Diário` vazio, esta
// coluna imprimia **30/12/99** nas duas linhas de projeto de JB. Causa:
// `MAXIFS` sem nenhuma correspondência devolve **0**, não erro — e 0 é o dia
// zero do calendário do Sheets (30/12/1899). `IFERROR` não pega, porque não
// houve erro nenhum. O ramo "—" que a spec dava como "já existe" nunca era
// alcançado. Cura: testar o ZERO explicitamente.
//
// E a coluna passa a devolver um VALOR DE DATA em vez de `TEXT(...)`: assim o
// `numberFormat DATE dd/mm/yy` aplicado por `formatar.js` tem o que formatar
// (sobre uma string ele é inerte), a coluna ordena como data, e a máscara mora
// num lugar só. Tokens em INGLÊS — `aaaa` renderiza o nome do dia da semana,
// sem erro (N-9).
// ONDA UX 10 (remodelação 2026-09-01) — `movimentou` distingue "o Diário
// está vazio" de "o Diário tem entradas, mas nenhuma vinculada a ESTE
// projeto". Antes as duas colapsavam no mesmo "—", e a NOTA da coluna
// (`_norman/notas.js`) declarava isso como "este projeto nunca apareceu no
// Diário" — falso sempre que havia conteúdo órfão (medido: AVALIACAO-UX.md
// Parte 2 §4, as duas entradas reais de 27/08 falam dos dois projetos, em
// prosa, só sem a chave). `PROJETOS_MOVIMENTOU_NUNCA`/`_ORFAO` são a MESMA
// distinção que `PROJETOS_AVISO_DIARIO_ORFAO` (mais abaixo) usa pro aviso
// agregado, e que `PROJETOS_SAUDE` (logo depois) lê via `ISTEXT` pra saber
// se há "dado real" de movimentação — três consumidores, uma fonte.
const PROJETOS_MOVIMENTOU_NUNCA = '— nunca apareceu no Diário —';
const PROJETOS_MOVIMENTOU_ORFAO = '— sem vínculo no Diário —';
const PROJETOS_ULTIMA_MOVIMENTACAO = linha => {
  const colSobre = letraDe(DIARIO_CABECALHO, DIARIO_ROTULO_SOBRE);
  const rSobre = `${A.DI}!$${colSobre}$${LINHAS[A.DIARIO].dados}:$${colSobre}`;
  return `=IF($A${linha}="";"";LET(`
    + `m;MAXIFS(${A.DI}!$A:$A;${A.DI}!$C:$C;$A${linha});`
    + `IF(m<>0;m;IF(COUNTIF(${rSobre};"<>")=0;"${PROJETOS_MOVIMENTOU_NUNCA}";"${PROJETOS_MOVIMENTOU_ORFAO}"))`
    + `))`;
};
const PROJETOS_TAREFAS_ABERTAS = linha =>
  `=IF($A${linha}="";"";COUNTIFS(${A.TAREFAS}!$B:$B;$A${linha};${A.TAREFAS}!$C:$C;"<>✅ feita"))`;

// As duas colunas novas (J/K). Mesmo padrão: uma fórmula por linha, tudo
// dentro de `IFERROR` pra que "nenhuma tarefa"/"nenhuma movimentação" chegue
// como `—` e nunca como `#N/A` — nenhum valor de erro alcança a tela.
//
// J: as 3 tarefas abertas mais urgentes do projeto. A chave de ordenação usa
// o mesmo truque do bloco ⏳ de `Hoje` — prazo vazio vira uma data que nenhum
// prazo real alcança, então "sem prazo" vai pro fim em vez de sumir.
const PROJETOS_PROXIMAS_TAREFAS = linha =>
  `=IF($A${linha}="";"";IFERROR(LET(`
  + `t;FILTER(HSTACK(${A.TAREFAS}!$A$${LINHAS[A.TAREFAS].dados}:$A;${A.TAREFAS}!$E$${LINHAS[A.TAREFAS].dados}:$E);`
  + `${A.TAREFAS}!$A$${LINHAS[A.TAREFAS].dados}:$A<>"";${A.TAREFAS}!$B$${LINHAS[A.TAREFAS].dados}:$B=$A${linha};${A.TAREFAS}!$C$${LINHAS[A.TAREFAS].dados}:$C<>"✅ feita");`
  + `k;MAP(CHOOSECOLS(t;2);LAMBDA(p;IF(p="";${'DATE(9999;12;31)'};p)));`
  + `TEXTJOIN(CHAR(10);TRUE;ARRAY_CONSTRAIN(CHOOSECOLS(SORT(HSTACK(CHOOSECOLS(t;1);k);2;TRUE);1);3;1))`
  + `);"—"))`;

// K: as 2 entradas mais recentes do `Diário` sobre o projeto. `dd/mm — o que
// aconteceu`, uma por linha. É o que torna o `Diário` legível por RECÊNCIA
// sem que ele deixe de ser append-only (limite declarado, não escondido).
const PROJETOS_ULTIMAS_MOVIMENTACOES = linha =>
  `=IF($A${linha}="";"";IFERROR(LET(`
  + `d;FILTER(HSTACK(${A.DI}!$A$${LINHAS[A.DIARIO].dados}:$A;${A.DI}!$D$${LINHAS[A.DIARIO].dados}:$D);`
  + `${A.DI}!$C$${LINHAS[A.DIARIO].dados}:$C=$A${linha};${A.DI}!$D$${LINHAS[A.DIARIO].dados}:$D<>"");`
  + `s;SORT(d;1;FALSE);`
  + `TEXTJOIN(CHAR(10);TRUE;ARRAY_CONSTRAIN(MAP(CHOOSECOLS(s;1);CHOOSECOLS(s;2);LAMBDA(q;x;IF(q="";"—";TEXT(q;"dd/mm"))&" — "&x));2;1))`
  + `);"—"))`;

// ---- Onda 14 — as três colunas derivadas de `Etapas` (L/M/N) ----
//
// L: `etapa atual` — a primeira etapa NÃO concluída, por `ordem` crescente.
// Precisa distinguir TRÊS estados, não dois: sem etapa cadastrada (projeto
// ainda não foi quebrado em marcos) é diferente de todas-concluídas (projeto
// quebrado em marcos e todos batidos) — os dois pareceriam "—" se colapsados
// no mesmo `IFERROR`, e o segundo é uma notícia boa que o primeiro não é.
const PROJETOS_ETAPA_ATUAL = linha =>
  `=IF($A${linha}="";"";LET(`
  + `total;COUNTIF(${A.ETAPAS}!$A$2:$A;$A${linha});`
  + `IF(total=0;"— sem etapa cadastrada —";`
  + `IFERROR(LET(`
  + `t;FILTER(HSTACK(${A.ETAPAS}!$B$2:$B;${A.ETAPAS}!$C$2:$C);`
  + `${A.ETAPAS}!$A$2:$A=$A${linha};${A.ETAPAS}!$D$2:$D<>"✅ concluída");`
  + `s;SORT(t;2;TRUE);`
  + `INDEX(s;1;1)`
  + `);"✅ todas as etapas concluídas"))))`;

// M: `progresso` — "N de M", contagem pura contra `Etapas`. "—" só quando
// não há NENHUMA etapa cadastrada; com 0 de M concluídas, o número aparece
// (0 de 3 é informação, não ausência dela).
const PROJETOS_PROGRESSO = linha =>
  `=IF($A${linha}="";"";LET(`
  + `total;COUNTIF(${A.ETAPAS}!$A$2:$A;$A${linha});`
  + `IF(total=0;"—";`
  + `COUNTIFS(${A.ETAPAS}!$A$2:$A;$A${linha};${A.ETAPAS}!$D$2:$D;"✅ concluída")&" de "&total)))`;

// N: `saúde` — acesa por REGRA, nunca digitada (é a lei do briefing).
// Prioridade decrescente (o pior vence quando mais de um bate):
//   🔴 atrasado  — prazo do PROJETO (coluna H, já existe e é digitada) já
//                  passou e o projeto não está `✅ entregue`;
//   ⚪ sem sinal — D-A1 (remodelação 2026-09-01, decisão de Durin registrada
//                  em `.claude/plans/remodelacao-crm-2026-09-01.md`): ZERO
//                  etapa cadastrada E ZERO entrada de Diário vinculada —
//                  ausência de dado NÃO é "parado" por default. Medido:
//                  com `movimentou` colapsando "nunca apareceu" e "apareceu
//                  sem vínculo" no mesmo "—", `diasParado` forçava o piso
//                  MÁXIMO sempre que o Diário não casava — e os 2 projetos
//                  reais desta planilha ficavam `🔴 parado` em 100% dos
//                  casos por FALTA de dado, não por dado ruim
//                  (AVALIACAO-UX.md Parte 2 §3-4). Com QUALQUER dado real
//                  (uma etapa OU uma entrada de Diário vinculada), este
//                  ramo nunca dispara — a saúde volta a calcular como antes.
//   🔴 parado    — sem movimentação no `Diário` (coluna I `movimentou`, já
//                  calculada acima, MESMA fonte — nunca uma segunda conta) há
//                  `PROJETOS_SAUDE_PARADO_DIAS_UTEIS` dias ÚTEIS ou mais;
//   🟠 sem rumo  — nenhuma tarefa aberta (coluna J `abertas`, já calculada) E
//                  nenhuma etapa `🔨 em curso` em `Etapas`.
// Projeto `✅ entregue` não recebe nenhum dos quatro — saúde não se aplica a
// frente encerrada; devolve "—".
const PROJETOS_SAUDE_PARADO_DIAS_UTEIS = 7;
const PROJETOS_SAUDE = linha => {
  const est = letraDe(PROJETOS_CABECALHO, 'estágio');
  const prazo = letraDe(PROJETOS_CABECALHO, 'prazo');
  const mov = letraDe(PROJETOS_CABECALHO, 'movimentou');
  const abertas = letraDe(PROJETOS_CABECALHO, 'abertas');
  return `=IF($A${linha}="";"";IF($${est}${linha}="✅ entregue";"—";LET(`
    + `temEmCurso;COUNTIFS(${A.ETAPAS}!$A$2:$A;$A${linha};${A.ETAPAS}!$D$2:$D;"🔨 em curso")>0;`
    + `totalEtapas;COUNTIF(${A.ETAPAS}!$A$2:$A;$A${linha});`
    + `atrasado;AND($${prazo}${linha}<>"";$${prazo}${linha}<TODAY());`
    // D-A1 — `movimentou` agora é OU uma data (número) OU um dos dois
    // textos de ausência (`PROJETOS_MOVIMENTOU_NUNCA`/`_ORFAO`); `ISTEXT`
    // é o teste único que cobre os dois sem repetir o literal aqui.
    + `movAusente;ISTEXT($${mov}${linha});`
    + `semDado;AND(totalEtapas=0;movAusente);`
    + `diasParado;IF(movAusente;${PROJETOS_SAUDE_PARADO_DIAS_UTEIS};`
    + `IFERROR(NETWORKDAYS($${mov}${linha};TODAY();${FERIADOS_RANGE})-1;${PROJETOS_SAUDE_PARADO_DIAS_UTEIS}));`
    + `parado;diasParado>=${PROJETOS_SAUDE_PARADO_DIAS_UTEIS};`
    + `semRumo;AND($${abertas}${linha}=0;NOT(temEmCurso));`
    + `IF(atrasado;"🔴 atrasado";IF(semDado;"⚪ sem sinal";IF(parado;"🔴 parado";IF(semRumo;"🟠 sem rumo";"🟢 em dia"))))`
    + `)))`;
};

/**
 * Espelho em JS PURO de `PROJETOS_SAUDE`, pra prova LOCAL (Onda 10 + D-A1) —
 * sem escrever nada na planilha viva. MESMA ordem de prioridade que a
 * fórmula acima: entregue > atrasado > sem dado (D-A1) > parado > sem rumo >
 * em dia. `movimentouAusente` corresponde a `ISTEXT($mov$linha)` (verdadeiro
 * quando `movimentou` é `PROJETOS_MOVIMENTOU_NUNCA`/`_ORFAO`, falso quando é
 * uma data real); `diasParadoUteis` só importa quando `movimentouAusente`
 * é falso (senão a fórmula força o piso máximo).
 */
function projetosSaudeMirror({ entregue, atrasado, totalEtapas, movimentouAusente, diasParadoUteis, abertas, temEmCurso }) {
  if (entregue) return '—';
  if (atrasado) return '🔴 atrasado';
  if (totalEtapas === 0 && movimentouAusente) return '⚪ sem sinal';
  const parado = movimentouAusente || diasParadoUteis >= PROJETOS_SAUDE_PARADO_DIAS_UTEIS;
  if (parado) return '🔴 parado';
  if (abertas === 0 && !temEmCurso) return '🟠 sem rumo';
  return '🟢 em dia';
}

// Colunas CALCULADAS de `Projetos`, por LETRA — uma fonte só, consumida por
// `construir.js` (o que escrever), por `notas.js` (onde vai a nota "CALCULADA
// — não digite aqui") e pelo contrato do Thor (o que ele NÃO escreve).
// As quatro CALCULADAS, endereçadas pela LETRA DERIVADA do cabeçalho. Antes as
// letras eram literais (`G`, `H`, `J`, `K`) e a ordem de coluna acabou de
// mudar: com literal, `construir.js` escreveria fórmula em cima de dado de JB
// e ninguém veria erro nenhum. Ordem de coluna mora num lugar só.
const PROJETOS_CALCULADAS = {
  [letraDe(PROJETOS_CABECALHO, 'movimentou')]: PROJETOS_ULTIMA_MOVIMENTACAO,
  [letraDe(PROJETOS_CABECALHO, 'abertas')]: PROJETOS_TAREFAS_ABERTAS,
  [letraDe(PROJETOS_CABECALHO, 'próximas tarefas')]: PROJETOS_PROXIMAS_TAREFAS,
  [letraDe(PROJETOS_CABECALHO, 'últimas movimentações')]: PROJETOS_ULTIMAS_MOVIMENTACOES,
  [letraDe(PROJETOS_CABECALHO, 'etapa atual')]: PROJETOS_ETAPA_ATUAL,
  [letraDe(PROJETOS_CABECALHO, 'progresso')]: PROJETOS_PROGRESSO,
  [letraDe(PROJETOS_CABECALHO, 'saúde')]: PROJETOS_SAUDE
};
// Pares CONTÍGUOS de calculadas, pra `construir.js` escrever em blocos sem
// passar por cima das colunas digitadas que ficam entre eles. Derivado, não
// escrito: as duas escritas de hoje (`E:F` e `I:J`) deixam de ser um detalhe
// que alguém precisa lembrar de atualizar quando a ordem mudar de novo.
const PROJETOS_BLOCOS_CALCULADOS = (() => {
  const idx = Object.keys(PROJETOS_CALCULADAS).map(c => c.charCodeAt(0) - 65).sort((x, y) => x - y);
  const blocos = [];
  for (const i of idx) {
    const ultimo = blocos[blocos.length - 1];
    if (ultimo && i === ultimo[1] + 1) ultimo[1] = i; else blocos.push([i, i]);
  }
  return blocos.map(([a0, a1]) => [String.fromCharCode(65 + a0), String.fromCharCode(65 + a1)]);
})();

// Onda 15 (CRM vivo) — três colunas NOVAS, apêndice no fim (H:J), mesma
// razão de sempre: `Tarefas` já tem as 2 tarefas intocáveis de JB em A:G, e
// apêndice puro não desloca nem uma célula delas.
const TAREFAS_CABECALHO = [
  'tarefa', 'projeto', 'estágio', 'quem age', 'prazo', 'criada em', 'notas',
  'esforço', 'bloqueada por', 'recorrente'
];
const TAREFAS_ESTAGIOS = ['⬜ aberta', '🔨 fazendo', '✅ feita', '⏸️ parada'];
// P/M/G — o vocabulário mais curto que ainda diz "quanto isso custa" sem
// pedir estimativa em horas (JB não pediu granularidade fina). Vazio é
// tratado como M pela ordenação de urgência abaixo (nem o menor nem o maior
// — não inventa um sinal que ninguém deu).
const TAREFAS_ESFORCOS = ['P', 'M', 'G'];
// `bloqueada por` é o NOME de outra tarefa (`Tarefas!tarefa`, mesma coluna
// A — dropdown ONE_OF_RANGE sobre si mesma, ver `formatar.js`). Uma tarefa
// só conta como bloqueada enquanto a apontada não estiver `✅ feita` — ver
// `HOJE_BLOCOS` TAREFAS, que é onde "não aparece como atacável hoje" vira
// fórmula (o teste de aceite da Onda).
const TAREFAS_RECORRENTES = ['não', 'semanal', 'quinzenal', 'mensal'];

// Onda 16 (CRM vivo) — "você registra etapas de projetos e eu também vou
// adicionando meu ponto de vista": o coração do pedido. A coluna `quem` JÁ
// ERA, de fato, a voz (valores `JB`/`Durin` desde a origem) — só o RÓTULO
// não dizia isso; renomeada no lugar, ZERO risco pras 2 entradas intocáveis
// de JB (mesma posição, mesmos valores continuam válidos).
//
// `responde a` é o que falta pra virar CONVERSA em vez de dois logs
// paralelos: aponta pro NÚMERO DA LINHA da entrada respondida (visível na
// própria régua do Sheets — JB não precisa copiar texto, só olhar o número
// à esquerda). `contexto da resposta` é CALCULADA a partir dele — resolve o
// número em "voz · dd/mm · início do que foi dito", pra que as duas
// entradas se leiam JUNTAS sem precisar rolar a tela pra achar a outra.
//
// `o que muda` FICA (não é o desenho literal do briefing, que listava só
// cinco colunas sem ela) — as DUAS entradas reais de 27/08 têm texto
// substantivo nela (conferido ao vivo antes desta rodada); apagar a coluna
// apagaria dado humano que não existe em nenhum outro lugar. `responde a` e
// `contexto da resposta` entram como APÊNDICE (F, G) em vez de substituição
// — decisão de segurança de dado, declarada aqui e no relatório da rodada.
// ONDA UX 10 (remodelação 2026-09-01) — o RÓTULO pede a CHAVE. `sobre`
// convidava um ASSUNTO ("o que essa entrada é sobre") quando a coluna exige
// uma CHAVE ESTRANGEIRA (igualdade exata de string com `Projetos!A`) — o
// mesmo apontamento de AVALIACAO-UX.md Parte 2 §4: "JB e Durin escreveram o
// assunto, que é o que a palavra pede". A nota de célula já explicava isso
// (`_norman/notas.js DIARIO_SOBRE`); o CABEÇALHO agora também — sem custar
// largura: 15 caracteres cabem folgados nos 168 px que a coluna já tinha.
const DIARIO_ROTULO_SOBRE = 'sobre (projeto)';
const DIARIO_CABECALHO = ['quando', 'voz', DIARIO_ROTULO_SOBRE, 'o que aconteceu', 'o que muda', 'responde a', 'contexto da resposta'];
const DIARIO_QUEM = ['JB', 'Durin'];
// OS VALORES LIVRES DE `sobre`, DECLARADOS UM A UM (N11).
//
// A coluna `sobre` tem lista suspensa apontando pra `Projetos!A`, e o elo
// inteiro entre Diario e Projetos e uma IGUALDADE EXATA DE STRING. So que
// validacao de dados do Sheets NAO SE APLICA A ESCRITA POR API: quem escreve
// o Diario hoje e script (Thor), nao JB. A guarda protege quem nao escreve e
// e invisivel pra quem escreve. Resultado medido no primeiro uso real: duas
// entradas com `sobre` fora da lista, `Projetos!movimentou` imprimindo "-"
// com o Diario cheio, e NADA em lugar nenhum denunciando o orfao.
//
// Estrutura e plano A; guarda e plano B. A estrutura aqui e esta lista: uma
// entrada de Diario que nao pertence a projeto nenhum e LEGITIMA, mas tem que
// ser DECLARADA, nao inferida do silencio. O cheque de `verificar.js` acusa
// tudo que nao esta em `Projetos!A` nem aqui, nomeando a linha e o valor.
//
// AS DUAS ENTRADAS DE 27/08 ESTAO DECLARADAS AQUI, e nao cadastradas como
// projeto, por uma razao de escopo: cadastrar frente em `Projetos` e escrever
// DADO HUMANO, e dado humano nao se inventa por conta propria. Elas sao
// legitimas (registro de duas ondas de trabalho, nao de duas frentes vivas) e
// passam a constar como declaracao, que e o que este vetor existe pra ser.
//
// O caminho melhor continua sendo cadastrar a frente: assim `Projetos!
// movimentou` para de imprimir "-" e o elo volta a funcionar de verdade. Este
// vetor e a valvula, nao o destino - e cada linha dele e uma divida visivel.
const DIARIO_SOBRE_LIVRE = [
  'Radar acadêmico — fontes e agendamento',
  'Portal da planilha — estrutura e Thor'
];

// `contexto da resposta` (G) — CALCULADA, ARRAYFORMULA única ancorada em
// G{dados} (mesmo padrão de âncora única que `_calc` e `FILA_ID_DERIVADO`
// já usam; `Diário` é append-only e sem capacidade fixa, então não há "uma
// fórmula por linha até a última" como em `Projetos` — é UM ARRAYFORMULA
// cobrindo o range aberto, IGUAL ao id da `Fila`).
//
// Resolve `responde a` (um NÚMERO DE LINHA digitado por JB/Durin) pro
// contexto da entrada apontada: voz + data + começo do que foi dito. É o
// que faz duas entradas "lerem juntas" sem JB precisar rolar a tela — a
// prova de aceite da Onda ("a de JB visivelmente ligada à de Durin").
//
// `MAP`+`LAMBDA` de novo, não `ARRAYFORMULA(INDEX(...))` cru: é a MESMA
// classe de defeito que `FILA_ID_DERIVADO`/`candidaturasOrgao` já pagaram
// nesta planilha (`INDEX(intervalo;MATCH(array;...))` — aqui,
// `INDEX(intervalo;array_de_offset)` — NÃO vetoriza; só dentro do `LAMBDA`,
// onde cada `alvo` é escalar, `INDEX(...;off)` devolve um valor só, que é o
// que se quer). `off<1` é guarda explícita contra o quirk de
// `INDEX(intervalo;0)` do Sheets, que devolve o INTERVALO INTEIRO em vez de
// erro — um `responde a` apontando pra cima do começo dos dados (cabeçalho,
// ou 0/negativo por engano de digitação) cairia nesse quirk sem a guarda.
const DIARIO_CONTEXTO_RESPOSTA = (() => {
  const ld = LINHAS[A.DIARIO].dados;
  const colVoz = letraDe(DIARIO_CABECALHO, 'voz');
  const colAconteceu = letraDe(DIARIO_CABECALHO, 'o que aconteceu');
  const colRespondeA = letraDe(DIARIO_CABECALHO, 'responde a');
  return `=ARRAYFORMULA(MAP($A$${ld}:$A;$${colRespondeA}$${ld}:$${colRespondeA};LAMBDA(nome;alvo;`
    + `IF(nome="";"";IF(alvo="";"";`
    + `IFERROR(LET(`
    + `off;VALUE(alvo)-${ld}+1;`
    + `IF(off<1;"— linha "&alvo&" inválida —";`
    + `LET(`
    + `qAlvo;INDEX($A$${ld}:$A;off);`
    + `vAlvo;INDEX($${colVoz}$${ld}:$${colVoz};off);`
    + `xAlvo;INDEX($${colAconteceu}$${ld}:$${colAconteceu};off);`
    + `IF(qAlvo="";"— linha "&alvo&" vazia —";`
    + `"↳ responde "&vAlvo&" ("&TEXT(qAlvo;"dd/mm")&"): "&LEFT(xAlvo;60)&IF(LEN(xAlvo)>60;"…";""))`
    + `))`
    + `);"— linha "&alvo&" inválida —"))))))`;
})();

// ---- estado vazio das abas digitadas (a "camada 2") ----
//
// A camada 1 é o bloco correspondente em `Hoje`: é lá que JB NOTA a falta, e
// está na dobra do celular. Esta é a camada 2, pra quem abre a aba direto —
// no desktop. PREÇO DECLARADO: ela fica fora da dobra no celular, porque os
// 4 links da nav consomem a dobra inteira. Não é descuido; é a ordem certa.
//
// Mora numa célula de FÓRMULA na linha da nav, à direita dos links (nunca
// numa linha própria: uma linha permanente pra dizer "está vazio" é ocupar
// espaço pra sempre por um estado que some no primeiro item). Mesclada — pode
// ser, porque não hospeda link (N-15 restringe mescla QUE HOSPEDA link).
// A altura da linha 1 das digitadas é AUTOMÁTICA de propósito: ela cresce pra
// caber a instrução quando a aba está vazia e volta a uma linha quando enche.
// A instrução literalmente sai do caminho, sem nenhuma regra que a esconda.
//
// A COLUNA DE CONTAGEM não é sempre `A`: na `Fila`, `A` é derivada
// (ARRAYFORMULA) e `COUNTA` conta o `""` que ela devolve — perguntar a `A` ali
// responderia "cheia" pra sempre. Quem responde na `Fila` é `B` (url), que é
// digitada. É o tipo de detalhe que não dá erro nenhum: só faz a instrução
// nunca aparecer.
// LINHA PRÓPRIA, MESCLADA DE A ATÉ O FIM, DENTRO DA DOBRA.
//
// Antes a instrução morava na linha da NAV, à direita dos 4 links: `Fila!E1`
// começava a 442 px da borda e `Diário!E1` a 689 px, e nenhuma das duas abas
// congela coluna. Na dobra de ~390 px do celular, quem abre a `Fila` DIRETO vê
// uma linha de navegação, uma linha de cabeçalho e BRANCO. O texto era bom e
// era uma instrução de verdade; ele só não estava em lugar nenhum que se
// olhasse.
//
// O preço estava declarado na spec ("o celular é servido pela camada 1") e foi
// RETIRADO depois de ver a peça: a própria barra de navegação oferece essas
// abas a um toque a partir de `Tarefas`, `Projetos` e `Empregos` — a camada 1
// só serve quem passa pelo `Hoje`, e a navegação foi construída pra não
// obrigar isso. As duas decisões se contradiziam.
//
// Agora ela é a LINHA 2 inteira, mesclada A:<última>, congelada. Custo: uma
// linha de grade a mais nas quatro abas e o cabeçalho descendo pra 3.
//
// A COLUNA DE CONTAGEM não é sempre `A`: na `Fila`, `A` é derivada
// (ARRAYFORMULA) e `COUNTA` conta o `""` que ela devolve — perguntar a `A` ali
// responderia "cheia" pra sempre. Quem responde na `Fila` é `B` (url), que é
// digitada. É o tipo de detalhe que não dá erro nenhum: só faz a instrução
// nunca aparecer.
// D9 (residual) — A FRASE COMEÇAVA DENTRO DA DOBRA E TERMINAVA FORA.
//
// A célula é mesclada de A até a última coluna (1.346 px na `Fila`), então o
// `WRAP` só quebra em 1.346 px — medido, a frase da `Fila` ocupa ~446 px de
// largura contra uma dobra de ~390. O fim dela (`vem sozinho.`) exigia um
// arrasto. Não anulava o conserto; deixava metade da instrução fora da tela.
//
// A quebra não dá pra pedir por largura (a mescla é a largura da aba), então
// ela é EXPLÍCITA: `texto` é uma LISTA de tramos e `estadoVazioFormula` os
// une com `CHAR(10)`. O primeiro tramo tem que ser uma unidade completa
// dentro de ~55 caracteres (~385 px na régua de 7 px/caractere) — é a mesma
// lei da abertura curta de `AVISO_SYNC`: se só sobrar a primeira linha, ela
// ainda diz uma coisa inteira.
// ONDA UX 10 (remodelação 2026-09-01) — O AVISO DERIVADO QUE FECHA O LOOP.
// Antes desta Onda a reconciliação `Diário`↔`Projetos` não tinha NENHUMA
// superfície visível na peça — `verificar.js` (G0, N11) já acusava órfão
// contra o dado vivo, mas só na saída do TERMINAL, nunca na TELA que JB abre.
// Este aviso mora em `Projetos!vazio` (a mesma linha 2 que já hospeda o
// aviso de robô parado) e conta contra `Diário!sobre` inteiro — TODAS as
// entradas preenchidas, batendo ou não com `PROJETOS_RANGE_NOME` — porque a
// pergunta que ele responde é "quanto do Diário chega em Projetos", não "o
// que é legítimo" (isso é o G0 de `verificar.js`, que também sabe de
// `DIARIO_SOBRE_LIVRE`; os dois convivem, respondem perguntas diferentes).
// `MATCH` não vetoriza cru dentro de `SUMPRODUCT` (a MESMA classe de defeito
// que o bloco ⏰ VENCE já documenta pra `VSTACK`/`INDEX`) — por isso `MAP`+
// `LAMBDA`, escalar por linha, nunca comparação de intervalo cru presa a
// `LET`. Silêncio quando reconciliado (0 órfãs) ou quando não há dado (0
// entradas) — mesma doutrina de "fala só quando há algo a dizer" que
// `AVISO_SYNC_PORTAL` já segue.
const PROJETOS_AVISO_DIARIO_ORFAO = (() => {
  const colSobre = letraDe(DIARIO_CABECALHO, DIARIO_ROTULO_SOBRE);
  const rSobre = `${A.DI}!$${colSobre}$${LINHAS[A.DIARIO].dados}:$${colSobre}`;
  return `LET(`
    + `total;COUNTIF(${rSobre};"<>");`
    + `semVinculo;SUM(MAP(${rSobre};LAMBDA(v;IF(v="";0;IF(ISNA(MATCH(v;${PROJETOS_RANGE_NOME};0));1;0)))));`
    + `IF(OR(total=0;semVinculo=0);"";`
    + `"⚠️ "&semVinculo&" de "&total&" entrada(s) de ${A.DIARIO} não batem com projeto nenhum — confira «${DIARIO_ROTULO_SOBRE}» contra ${A.PROJETOS}!A.")`
    + `)`;
})();

const ESTADO_VAZIO_DIGITADAS = {
  [A.TAREFAS]: {
    colunas: TAREFAS_CABECALHO.length, contagem: 'A',
    texto: [MARCADOR_VAZIO + 'Nenhuma tarefa aberta.', 'Escreva aqui embaixo: só «tarefa» é obrigatória.']
  },
  [A.FILA]: {
    colunas: FILA_CABECALHO.length, contagem: 'B',
    // ONDA UX 3 — nomeia a coluna pelo RÓTULO (`FILA_ROTULO_COLUNA_LINK`),
    // nunca pela posição. Ver o bloco de comentário grande junto da
    // constante, em `MERCADO_CABECALHO`, acima.
    texto: [MARCADOR_VAZIO + 'Fila vazia. Cole aqui o link de uma vaga:', `ele está na coluna «${FILA_ROTULO_COLUNA_LINK}» de 💼 Empregos, e o resto vem sozinho.`]
  },
  [A.PROJETOS]: {
    colunas: PROJETOS_CABECALHO.length, contagem: 'A',
    texto: [MARCADOR_VAZIO + 'Nenhuma frente cadastrada.', 'Escreva o nome aqui embaixo: as tarefas se penduram nele.']
  },
  [A.DIARIO]: {
    colunas: DIARIO_CABECALHO.length, contagem: 'A',
    texto: [MARCADOR_VAZIO + 'Diário vazio. Registre o que terminou:', 'alimenta 📌 Projetos sozinho.']
  },
  // Onda 14 — `Etapas` entra na mesma família das quatro digitadas (mesma
  // geometria de cromo: nav/vazio/cabeçalho/dados).
  [A.ETAPAS]: {
    colunas: ETAPAS_CABECALHO.length, contagem: 'A',
    texto: [MARCADOR_VAZIO + 'Nenhuma etapa cadastrada ainda.', 'Escreva o nome do projeto (igual a 📌 Projetos) e o marco: a saúde do projeto passa a se calcular sozinha.']
  }
};
// O AVISO DE ROBO PARADO VEM NA FRENTE (N5). A linha 2 das digitadas e a
// unica linha de cromo delas que nao e nav nem cabecalho — e ela ja e
// mesclada de A ate o fim, congelada e dentro da dobra. E o unico lugar
// dessas quatro abas onde um alarme cabe sem custar linha nova.
// O prefixo vem de `AVISO_SYNC_PORTAL` (texto proprio, criterio compartilhado)
// e ele nunca APAGA a instrucao: soma na frente. Uma aba vazia com o robo
// parado tem duas coisas a dizer e diz as duas.
// `AVISO_SYNC_PORTAL` e definido mais abaixo neste arquivo (junto com o resto
// da familia de alarme), por isso esta funcao le a constante em tempo de
// CHAMADA e nao em tempo de definicao.
const estadoVazioFormula = aba => {
  const e = ESTADO_VAZIO_DIGITADAS[aba];
  const texto = e.texto.map(t => `"${t}"`).join('&CHAR(10)&');
  // ONDA UX 10 — `Projetos` ganha o aviso de reconciliação NA MESMA célula
  // (linha `vazio`), somado na FRENTE (mesma doutrina de "nunca apaga a
  // instrução, soma"). Ele fala mesmo com `Projetos` CHEIO — é sobre o
  // `Diário`, não sobre `Projetos` estar vazio — por isso entra fora do
  // `IF(COUNTA(...)=0;...)` que só cobre o resto da família.
  const extra = aba === A.PROJETOS ? `&${PROJETOS_AVISO_DIARIO_ORFAO}` : '';
  return `=${AVISO_SYNC_PORTAL}&IF(COUNTA(${e.contagem}${LINHAS[aba].dados}:${e.contagem})=0;${texto};"")${extra}`;
};

// ===========================================================================
// Hoje — painel do dia. UM `VSTACK`, altura do conteúdo.
// ===========================================================================
//
// O QUE MUDOU E POR QUÊ. Antes, cada bloco era um spill próprio ancorado numa
// linha calculada por `HOJE_POSICOES`, e cada bloco reservava o seu teto
// INTEIRO — 12+10+10+10 = 42 linhas de altura fixa. Com o estado real (2
// tarefas, `Fila` vazia, 2 projetos, `Diário` vazio), o painel tinha 13 linhas
// de conteúdo em 55 de altura: **42 em branco, 76% de vão**, com os títulos
// espalhados por ~3 telas de celular e nada entre eles. Não era descuido: era
// o preço do conserto da bomba-relógio de posição fixa, que trocou colisão de
// spill por altura constante.
//
// Agora os blocos são UM array só, ancorado em `A4`. Como há um array só,
// **colisão entre blocos deixa de ser possível por construção** — e a guarda
// de vão que `construir.js` fazia (`vao <= bloco.teto`) foi aposentada junto
// com o modo de falha que ela cobria. Estrutura no lugar de guarda. Em troca,
// **nada pode ser escrito em A5:D∞** — é território do spill.
//
// Os tetos continuam existindo (`ARRAY_CONSTRAIN`), mas agora eles cortam a
// LISTA, não reservam ESPAÇO: um bloco com 2 itens ocupa 2 linhas.
//
// ANATOMIA DO BLOCO, quatro faixas, igual nos cinco:
//   título   — link pra aba de origem; é a banda do bloco (formato por CF)
//   corpo    — a lista, ou a instrução de estado vazio se não houver nada
//   rodapé   — "+ N não cabem aqui", também link; vazio quando cabe tudo
//   respiro  — uma linha em branco
//
// Janela de tempo do bloco RADAR (quantos dias atrás conta como "novo" pra
// edital/vaga entrando em `Concursos`/`Empregos`). O rótulo da seção lê da
// MESMA constante que a fórmula usa — texto e conta não têm como divergir.
// `HOJE_JANELA_TAREFAS_DIAS` morreu numa Onda anterior: o bloco de Tarefas
// filtrava por PRAZO e uma tarefa sem prazo cadastrado simplesmente sumia —
// o painel dizia "— nada pendente —" com tarefa aberta na mesa. O corte certo
// é por ESTÁGIO (toda tarefa que não é "✅ feita"); prazo vira só o eixo de
// ORDENAÇÃO, com "sem prazo" jogado pro fim.
//
// Esta janela é do domínio RADAR (edital/vaga), não do domínio NOTÍCIA — os
// dois nunca foram a mesma coisa, mas até a Onda 21 o bloco NOTICIA
// reaproveitava esta constante por atalho, e o rótulo "últimos 3 dias" ficou
// órfão quando a Onda 21 aposentou a janela de 3 dias do lado notícia
// (virou `hoje`/7d/15d/30d em `lib-noticias/ranking.js RECORTES`). Rótulo que
// descreve regra revogada é mentira que passa em auditoria de leitura —
// conserto: janela própria abaixo, `HOJE_JANELA_NOTICIA_DIAS`.
const HOJE_JANELA_RADAR_DIAS = 3;

// Janela de tempo do bloco NOTÍCIA do painel `Hoje` — quantos dias de
// notícia "esperando" cada aba soma na contagem por categoria. Não é uma das
// quatro janelas da cascata (`hoje`/7d/15d/30d`, ver `ranking.js RECORTES`):
// é um resumo de "o que tem pra ver", não uma tabela rankeada — mas precisa
// nomear uma janela REAL do sistema pós-Onda-21, não um número solto. `7`
// casa com `semana`/`7d`, a menor das quatro janelas que sobrevive como
// intervalo multi-dia (o próprio `hoje` é dia civil único, curto demais pra
// um resumo por categoria).
const HOJE_JANELA_NOTICIA_DIAS = 7;

// ===========================================================================
// GEOMETRIA DO PAINEL — a largura mora aqui, e o truncamento SAI dela
// ===========================================================================
//
// DEFEITO NA PEÇA RENDERIZADA. `Hoje!C14` imprimia **"Finalizar animaç"**: o
// valor real é "Finalizar animação de mascote" (29 caracteres), a coluna tinha
// 96 px, e o corte caiu no MEIO DA PALAVRA, sem reticência — sem transbordar
// pra D porque D tinha conteúdo. É justamente o `próximo passo` do projeto: o
// painel do dia mostrava nome e estágio da frente e ENGOLIA a única coisa
// acionável dela.
//
// E não é limitação de largura, é INCOERÊNCIA: `Empregos!B` trunca com
// reticência honesta ("GrupoSC Distribuidora de Medicame…"). Duas superfícies
// da mesma peça, dois comportamentos de estouro — uma avisa que cortou, a
// outra não.
//
// Dois consertos, e o primeiro é o que sobrevive a qualquer largura:
//   1. truncar NA FÓRMULA, com `…`, como a `Empregos` já faz;
//   2. alargar C às custas de D (`quem age`/`trilha` são tokens curtos).
//
// A largura mora AQUI e `formatar.js` a consome, porque o limite de
// truncamento é derivado dela: dois números em dois arquivos voltariam a
// cortar em silêncio no dia em que um deles mudasse.
const HOJE_COLUNAS = [170, 170, 136, 96];   // dobra: fim de B (340 < 358)
// Arial 10 pt. Aproximação deliberada e conservadora — o truncamento não
// existe pra garantir que NUNCA corte, existe pra que, quando cortar, a peça
// DIGA que cortou. Um `…` no fim é a diferença entre "o texto continua" e uma
// frase mutilada que parece inteira.
// MEDIDO NA CHAPA, e corrigido de 6 para 7. Com 6, a `veiculo` das quatro
// abas de noticia (104 px) tinha teto 17 e o export imprimiu "The New York
// Tim" e "Estrategia Concu" — 16 caracteres, cortados SEM reticencia, porque
// a truncagem nunca disparou. 104/16 = 6,5 px por caractere reais em Arial
// 10 pt com maiuscula e acento; 7 e o arredondamento conservador.
//
// O numero e um so de proposito: ele governa o teto do painel `Hoje` E o da
// coluna `veiculo`. A truncagem nao existe pra garantir que nunca corte —
// existe pra que, quando cortar, a peca DIGA que cortou. Errar pra menos
// (cortar cedo com "…") e o lado certo de errar.
const HOJE_PX_POR_CHAR = 7;
const hojeTeto = i => Math.floor(HOJE_COLUNAS[i] / HOJE_PX_POR_CHAR);
/** Trunca uma COLUNA de texto com reticência, dentro de um MAP element-wise. */
const hojeTruncar = (faixa, coluna) => {
  const n = hojeTeto(coluna);
  return `MAP(${faixa};LAMBDA(x;IF(x="";"";IF(LEN(x)>${n};LEFT(x;${n - 1})&"…";x))))`;
};
/**
 * Uma coluna de DATA renderizada no vocabulário da peça (`dd/mm`).
 *
 * D7: `Hoje!A1` imprimia `27/08` e `Hoje!C23:C32` imprimia `2026-08-27` — o
 * mesmo campo conceitual (*quando isso é*) em dois vocabulários, na mesma
 * tela, a 20 linhas de distância, sem nada explicando a diferença. ISO 8601 é
 * correta e obrigatória em `dados (não edite)`, onde o Sheets precisa dela sem
 * ambiguidade de locale; na superfície de leitura ela é uma segunda língua.
 *
 * `texto` diz se a fonte é string ISO (o store) ou valor de data (as abas
 * digitadas). Fallback pro valor cru quando não der pra ler: uma data
 * ilegível tem que aparecer, não sumir num erro que derruba o bloco inteiro.
 */
const hojeData = (faixa, texto) => texto
  ? `MAP(${faixa};LAMBDA(x;IF(x="";"";IFERROR(TEXT(DATEVALUE(x);"dd/mm");x))))`
  : `MAP(${faixa};LAMBDA(x;IF(x="";"";IFERROR(TEXT(x;"dd/mm");x))))`;

// `HOJE_LIMIAR_PARADO_DIAS` MORREU nesta Onda, e o motivo é um defeito de
// coerência medido: ele contava dias CORRIDOS (`TODAY() - carimbo > 3`)
// enquanto `AVISO_SYNC` conta dias ÚTEIS (`NETWORKDAYS(...) - 1 >= 3`). Mesmo
// número, unidade diferente. Sync na sexta, hoje terça: corridos = 4 → `Hoje`
// gritava "⚠️ PARADO há 4 dias"; úteis = 2 → `Concursos` ficava muda. Uma
// segunda-feira perdida — o caso mais provável de todos — produzia um portal
// que se contradizia entre duas abas. `Hoje!A1` passa a consumir a CONSTANTE
// `AVISO_SYNC`, não uma cópia da regra. Uma fonte, um veredito.

// ONDA UX 8 (remodelação 2026-09-01) — ESPELHO EM JS PURO do rótulo de
// edital do bloco ⏰ VENCE (`eRotulo`, mais abaixo em `HOJE_BLOCOS`). O
// FRAGMENTO de texto ("🎓 "+órgão+" — "+subárea, só quando subárea existe) é
// o MESMO nos dois lados — só a linguagem muda (`&`/`IF` no Sheets, template
// string aqui). Existe pra provar, em Node, que dois editais do MESMO órgão
// deixam de colidir quando a subárea diverge (a prova mora em
// `tests/onda-ux-8-vence-desambiguado.test.js`, controle positivo E
// negativo) — sem isso, "a fórmula parece certa" não é prova nenhuma.
const hojeVenceEditalRotulo = (orgao, subarea) => `🎓 ${orgao}${subarea ? ' — ' + subarea : ''}`;

// -------- os glifos de título, como CONSTANTE NOMEADA --------
// Eles são consumidos em DOIS lugares: a string do título (aqui) e o padrão
// da regra de formatação condicional que desenha a banda do bloco (o
// `^(...)` que `formatar.js` monta a partir daqui). Enquanto eram literais
// nos dois, trocar um emoji de título apagava a banda daquele bloco **sem
// erro nenhum na tela** — o mesmo modo de falha silencioso que a doutrina de
// N-17 existe pra matar. Um objeto, dois consumidores, divergência impossível.
const HOJE_BLOCO_GLIFO = {
  TAREFAS: '⏳',
  FILA: '🎯',
  PROJETOS: '📌',
  DIARIO: '📓',
  // NAO e 📰, e a razao e dura: as quatro LINHAS DE CORPO deste bloco
  // comecam pelo rotulo de navegacao da aba que elas linkam, e o primeiro
  // deles e "📰 Noticias". A regra R-H1 casa o glifo na PRIMEIRA posicao da
  // coluna A — com 📰 no titulo, a primeira linha de corpo seria pintada
  // como se fosse titulo de bloco. E exatamente o "glifo com dois empregos"
  // que a doutrina de NOTICIA_BLOCO_GLIFO ja nomeia. 🌐 nao e rotulo de nav
  // de ninguem, nao e glifo de bloco de ninguem, e nao e o 🌎 do bloco
  // MUNDO (que alias vive em outra aba).
  NOTICIA: '🌐',
  RADAR: '🆕',
  // Onda 19 — os dois blocos que fazem `Hoje` responder "o que eu faço
  // agora" em vez de resumir. Nenhum dos dois é rótulo de nav de ninguém.
  VENCE: '⏰',
  ATENCAO: '🚧',
  // C5 (Leva 5) — o pulso do funil. Não é rótulo de nav de ninguém, não
  // colide com nenhum glifo de estágio de `CANDIDATURAS_ESTAGIOS_GLIFO`
  // (aqueles vivem DENTRO das linhas do corpo, nunca na primeira posição de
  // um TÍTULO de bloco).
  PULSO: '📊'
};
// Regex (sintaxe RE2, a do Sheets) que casa QUALQUER título de bloco pela
// primeira posição. Derivado do objeto acima — nunca escrito à mão.
const HOJE_REGEX_TITULO = `^(${Object.values(HOJE_BLOCO_GLIFO).join('|')})`;

// Tetos — ESCOLHA DE PAINEL GLANÇÁVEL, não derivação de nenhum outro limite.
// `PROJETOS_CAPACIDADE` já garante, à parte, quantos projetos PODEM existir; o
// teto aqui é sobre CABER NUMA TELA que se lê num relance.
const HOJE_TETO_TAREFAS = 12;
const HOJE_TETO_FILA = 10;
const HOJE_TETO_PROJETOS = 10;
const HOJE_TETO_DIARIO = 5;   // últimas movimentações: é recência, não arquivo
const HOJE_TETO_RADAR = 10;
// O bloco de noticia tem UMA linha por aba de noticia, e sao quatro. O teto
// nao e escolha de painel aqui: e o tamanho do conjunto.
const HOJE_TETO_NOTICIA = 4;
// Onda 19 — os dois blocos de DECISÃO cross-fonte. Mesma doutrina de
// "painel glançável" das demais: cabe numa tela sem rolar.
const HOJE_TETO_VENCE = 8;
const HOJE_TETO_ATENCAO = 8;
// C5 (Leva 5) — o PULSO tem QUATRO linhas FIXAS (inscrições 30d · descartes
// 30d · candidaturas por estágio · meta), nunca uma lista que cresce: o
// teto não é escolha de painel aqui, é o tamanho exato do conjunto — mesma
// razão de `HOJE_TETO_NOTICIA`. Com `contagem` sempre igual a este número
// (ver o bloco PULSO em `HOJE_BLOCOS`), o rodapé "+ N não cabem aqui" nunca
// acende: não existe "resto" pra contar num painel de 4 fatos.
const HOJE_TETO_PULSO = 4;
// Janela dos dois primeiros fatos do PULSO — 30 dias corridos, o mesmo
// vocabulário que o briefing usa ("inscrições últimos 30d, descartes
// últimos 30d").
const HOJE_JANELA_PULSO_DIAS = 30;
// Janela de "esta semana" pro bloco ⏰ VENCE — 7 dias corridos a partir de
// hoje (inclusive), o mesmo vocabulário que `HOJE_JANELA_NOTICIA_DIAS` já
// usa pra "semana" no resto do painel. Não é uma das quatro janelas da
// cascata de notícia (domínio diferente); é a mesma PALAVRA porque "semana"
// só pode significar uma coisa na mesma peça.
const HOJE_JANELA_VENCE_DIAS = 7;

const HOJE_EXCLUI_FILA = FILA_ESTAGIOS_FORA_DO_HOJE
  .map(v => `${A.FILA}!$E$${LINHAS[A.FILA].dados}:$E<>"${v}"`).join(';');
// A MESMA exclusão, em forma MULTIPLICATIVA (pra dentro de `SUMPRODUCT`, que
// não aceita a lista de argumentos separados que `FILTER` aceita). Uma
// LISTA (`FILA_ESTAGIOS_FORA_DO_HOJE`), duas formas de consumir — nunca uma
// segunda lista escrita à mão que poderia divergir da primeira.
const HOJE_EXCLUI_FILA_PRODUTO = FILA_ESTAGIOS_FORA_DO_HOJE
  .map(v => `(${A.FILA}!$E$${LINHAS[A.FILA].dados}:$E<>"${v}")`).join('*');

// Chave de ordenação do bloco Tarefas: o prazo puro quando existe, uma data
// que nenhum prazo real vai alcançar quando não. Ordenar ASCENDENTE por essa
// chave entrega as três faixas NUM SÓ SORT — vencidas primeiro, futuras em
// ordem crescente depois, sem-prazo por último — sem nenhum IF de "vencida vs
// futura": a ordem cronológica já produz essa separação sozinha.
const HOJE_CHAVE_SEM_PRAZO = 'DATE(9999;12;31)';

const LT = LINHAS[A.TAREFAS].dados;
const LF = LINHAS[A.FILA].dados;
const LP = LINHAS[A.PROJETOS].dados;
const LD = LINHAS[A.DIARIO].dados;
// ONDA UX 12 — `o quê` deixou de ser a coluna C (era `id`, antes da troca em
// `FILA_CABECALHO`); as fórmulas do painel `Hoje` que leem `Fila!o quê` usam
// esta letra DERIVADA, nunca mais `$C$` literal.
const FILA_COL_OQUE = letraDe(FILA_CABECALHO, 'o quê');

// Ordem visual dos blocos = ordem deste array. Mudar a ordem na planilha é
// mudar só este array — nenhum outro lugar do código sabe "quem vem depois"
// por conta própria. As quatro superfícies humanas primeiro (o que eu faço, o
// que persigo, onde isso mora, o que se moveu) e o radar por último: ele é o
// que a MÁQUINA trouxe, e ele não depende de mim pra andar.
const HOJE_BLOCOS = [
  // ======================= ONDA 19 — OS DOIS BLOCOS DE DECISÃO ============
  //
  // Até aqui `Hoje` era SEIS resumos por aba. Nenhum deles respondia "o que
  // eu faço agora" — cada um só dizia "o que tem NESTA aba", e a pergunta
  // que JB carrega na cabeça atravessa aba: uma tarefa que vence e um
  // edital que fecha competem pelo MESMO tempo, e nenhum bloco existente
  // juntava os dois. `⏰ VENCE` e `🚧 ATENÇÃO` são os primeiros blocos do
  // painel que leem de MAIS DE UMA aba — o resto lê uma só.
  //
  // Os dois viram o novo grupo 0 (esquerda, decide primeiro) em
  // `HOJE_GRUPOS_COLUNA`: mais urgentes que TAREFAS/FILA sozinhos, porque
  // são o cruzamento das superfícies que TAREFAS/FILA/CANDIDATURAS já
  // tinham cada uma na sua ilha.
  //
  // `aba: A.TAREFAS` nos dois é uma SIMPLIFICAÇÃO DECLARADA, não descoberta
  // tardia: o título e o rodapé de transbordo ("abra X") de `hojeBloco`
  // pedem UM destino só, e estes dois blocos têm três fontes cada. Tarefas
  // é o destino mais frequente das duas listas (é lá que a maioria das
  // linhas nasce). Cada LINHA, ao contrário do título, já linka pro lugar
  // CERTO (Tarefas, o edital em si, ou a Fila) — a simplificação é só na
  // moldura, nunca no conteúdo.
  {
    chave: 'VENCE',
    aba: A.TAREFAS,
    teto: HOJE_TETO_VENCE,
    titulo: `${HOJE_BLOCO_GLIFO.VENCE} VENCE — tarefa e edital, o que fecha primeiro`,
    // Duas fontes, um `LET` só: tarefas com prazo (mesma exclusão de
    // bloqueada que o bloco ⏳ TAREFAS já usa — uma tarefa que não pode ser
    // atacada não é "o que vence", é "o que está preso", e é o bloco
    // 🚧 ATENÇÃO que fala disso) e editais docentes com `inscricao_fim`
    // dentro da janela. As duas listas viram uma só chave de data
    // (`tChave`/`eFimData`) e um SORT cronológico único — a pergunta de JB
    // não separa os dois, o SORT também não.
    // ACHADO AO VIVO NESTA ONDA — a MESMA classe de defeito que
    // `candidaturasAguardandoHa` já documenta (`MAX` não vetoriza por
    // linha), só que num operador DIFERENTE: `VSTACK` de duas listas
    // separadamente `FILTER`adas, quando UMA delas não tem nenhum
    // resultado (`FILTER` sem match devolve `#N/A` ESCALAR), NÃO propaga o
    // erro pro array inteiro — o `#N/A` vira UMA LINHA a mais dentro do
    // `VSTACK` (largura 1, preenchida com mais `#N/A` pro resto das
    // colunas), sobrevive ao `SORT` (erro ordena por último) e o `IFERROR`
    // de fora, sendo ELEMENT-WISE, troca só AQUELA linha pelo texto de
    // vazio — repetido em cada coluna dela. Reproduzido isolado numa
    // bancada de prova (`Hoje!W1`, removida depois): duas fontes com zero
    // match cada uma produziram a frase de vazio DUAS VEZES na tela, ao
    // lado de dado real de uma terceira fonte.
    //
    // A cura NÃO é tunar o `IFERROR` (a doutrina já registrada pro
    // `Diário`): é dar UMA FORMA SÓ — as duas fontes viram UMA tabela
    // (`VSTACK` de colunas cruas, nunca de resultados já `FILTER`ados) com
    // UMA condição combinada, e só UM `FILTER` no fim. A condição
    // combinada usa `MAP`, nunca comparação de intervalo crua
    // (`range=valor`) presa a um nome de `LET` — essa é a OUTRA metade do
    // mesmo achado: reproduzido também isolado, um booleano de comparação
    // crua ligado a `LET` e reusado dentro de `VSTACK` devolveu um array
    // TRUNCADO (2 linhas em vez de 5), silencioso, sem erro. `MAP`
    // sobrevive aos dois usos — é o único operador comprovado nesta
    // planilha pros dois lados do problema.
    corpo: url => {
      const colBloqueada = letraDe(TAREFAS_CABECALHO, 'bloqueada por');
      const rBloqueada = `${A.TAREFAS}!$${colBloqueada}$${LT}:$${colBloqueada}`;
      const urlTarefas = url(A.TAREFAS);
      return `LET(`
        + `tNomes;${A.TAREFAS}!$A$${LT}:$A;`
        + `tEstagios;${A.TAREFAS}!$C$${LT}:$C;`
        + `tPrazos;${A.TAREFAS}!$E$${LT}:$E;`
        + `tBloqPor;${rBloqueada};`
        + `tBloqueada;MAP(tBloqPor;LAMBDA(bp;IF(bp="";FALSE;COUNTIFS(tNomes;bp;tEstagios;"<>✅ feita")>0)));`
        + `tRotulo;MAP(tNomes;LAMBDA(n;HYPERLINK("${urlTarefas}";"✍️ "&n)));`
        + `tDetalhe;MAP(tPrazos;LAMBDA(p;IF(p="";"";IF(p<TODAY();"⚠️ venceu "&TEXT(p;"dd/mm");"vence "&TEXT(p;"dd/mm")))));`
        + `tTipo;MAP(tNomes;LAMBDA(n;"tarefa"));`
        + `tChave;MAP(tPrazos;LAMBDA(p;IF(p="";${HOJE_CHAVE_SEM_PRAZO};p)));`
        + `tCond;MAP(tNomes;tEstagios;tPrazos;tBloqueada;LAMBDA(n;es;p;bq;`
        + `AND(n<>"";es<>"✅ feita";NOT(bq);p<>"";p<=TODAY()+${HOJE_JANELA_VENCE_DIAS})));`
        + `eOrgao;${D}!$A$2:$A;`
        + `eTrilha;${D}!$U$2:$U;`
        + `eFimTxt;${D}!$M$2:$M;`
        // ONDA UX 8 (remodelação 2026-09-01) — `eSubarea` é o campo que
        // DESAMBIGUA. Medido ao vivo (AVALIACAO-UX.md job 1 + Parte 3 #8):
        // "UEL — fecha HOJE" aparecia DUAS VEZES no bloco, sem nenhum campo
        // que distinguisse os dois editais — o painel não fecha a decisão, e
        // JB tinha que abrir `${A.PAINEL}` só pra desempatar. `subarea` já
        // existe em `dados` (coluna E — Ciência de Dados vs Inteligência
        // Artificial, por exemplo) e nunca era trazida pro rótulo. O texto
        // aqui (`"🎓 "&o&IF(s="";"";" — "&s)`) é o MESMO fragmento que
        // `hojeVenceEditalRotulo` (abaixo) espelha em JS puro — a prova da
        // Onda mora nesse espelho, porque `LET`/`MAP` do Sheets não roda em
        // Node.
        // ONDA 16 (Leva 4, remodelação 2026-09-01) — o link da linha deixou
        // de ser `eUrl` (`dados!S`, a URL EXTERNA do edital) e passou a ser
        // `url(${A.PAINEL})` — a aba de ORIGEM. Medido: o link externo é
        // "onde a vaga foi publicada", não "de onde este item veio nesta
        // planilha"; a prova da Onda pede a segunda coisa (mesmo mapeamento
        // que a linha ⏳ tarefa já seguia: `url(${A.TAREFAS})`, nunca a URL
        // externa dela). `eUrl` saiu do LET — não sobra consumidor.
        + `eSubarea;${D}!$E$2:$E;`
        + `eRotulo;MAP(eOrgao;eSubarea;LAMBDA(o;s;`
        + `HYPERLINK("${url(A.PAINEL)}";"🎓 "&o&IF(s="";"";" — "&s))));`
        + `eFimData;MAP(eFimTxt;LAMBDA(f;IF(f="";${HOJE_CHAVE_SEM_PRAZO};IFERROR(DATEVALUE(f);${HOJE_CHAVE_SEM_PRAZO}))));`
        + `eDetalhe;MAP(eFimData;LAMBDA(f;IF(f=${HOJE_CHAVE_SEM_PRAZO};"";IF(f=TODAY();"fecha HOJE";"fecha "&TEXT(f;"dd/mm")))));`
        + `eTipo;MAP(eOrgao;LAMBDA(o;"edital"));`
        + `eCond;MAP(eTrilha;eFimData;LAMBDA(tr;f;`
        + `AND(tr="docente";f<>${HOJE_CHAVE_SEM_PRAZO};f>=TODAY();f<=TODAY()+${HOJE_JANELA_VENCE_DIAS})));`
        + `todosRotulo;VSTACK(tRotulo;eRotulo);`
        + `todosDetalhe;VSTACK(tDetalhe;eDetalhe);`
        + `todosTipo;VSTACK(tTipo;eTipo);`
        + `todosChave;VSTACK(tChave;eFimData);`
        + `todosCond;VSTACK(tCond;eCond);`
        + `ARRAY_CONSTRAIN(SORT(FILTER(HSTACK(todosRotulo;todosDetalhe;todosTipo;"";todosChave);todosCond);5;TRUE);${HOJE_TETO_VENCE};4)`
        + `)`;
    },
    vazio: `"${MARCADOR_VAZIO}Nada vencendo nos próximos ${HOJE_JANELA_VENCE_DIAS} d — nem tarefa, nem edital. Aproveite pra adiantar ${ROTULO_NAV[A.PROJETOS]}."`,
    // A MESMA janela e a MESMA exclusão de bloqueada do corpo, em forma de
    // soma — senão "+ N não cabem" contaria uma tarefa bloqueada que nunca
    // apareceria em bloco nenhum (o mesmo cuidado que ⏳ TAREFAS já paga).
    contagem: (() => {
      const colBloqueada = letraDe(TAREFAS_CABECALHO, 'bloqueada por');
      const rBloqueada = `${A.TAREFAS}!$${colBloqueada}$${LT}:$${colBloqueada}`;
      const tarefasN = `SUMPRODUCT((${A.TAREFAS}!$A$${LT}:$A<>"")*(${A.TAREFAS}!$C$${LT}:$C<>"✅ feita")*`
        + `(${A.TAREFAS}!$E$${LT}:$E<>"")*(${A.TAREFAS}!$E$${LT}:$E<=TODAY()+${HOJE_JANELA_VENCE_DIAS})*`
        + `(MAP(${rBloqueada};LAMBDA(bp;IF(bp="";1;IF(COUNTIFS(${A.TAREFAS}!$A$${LT}:$A;bp;${A.TAREFAS}!$C$${LT}:$C;"<>✅ feita")>0;0;1))))))`;
      const editaisN = `SUMPRODUCT((${D}!$U$2:$U="docente")*(${D}!$M$2:$M<>"")*`
        + `(${D}!$M$2:$M>=TEXT(TODAY();"yyyy-mm-dd"))*(${D}!$M$2:$M<=TEXT(TODAY()+${HOJE_JANELA_VENCE_DIAS};"yyyy-mm-dd")))`;
      return `(${tarefasN})+(${editaisN})`;
    })(),
    // ONDA 16 (Leva 4) — o RODAPÉ ("+ N não cabem aqui") deixa de apontar
    // sempre pra `${A.TAREFAS}` (a simplificação de moldura documentada
    // acima, em `aba: A.TAREFAS`). `rodapeLink` decide a origem pelo maior
    // CONTRIBUINTE bruto (tarefa vs. edital) — NÃO pelo item exato na
    // posição de corte: a primeira versão desta Onda tentou achar o TIPO
    // exato da linha `teto+1` via `SMALL`+`COUNTIFS`, e um teste próprio
    // (`tests/onda-ux-16-*.test.js`, 200 cenários aleatórios) reprovou 42
    // de 200 — o motivo é EMPATE de chave (duas datas iguais, uma de
    // tarefa e uma de edital): o desempate depende de o `SORT` do Sheets
    // ser ESTÁVEL (preservar a ordem de entrada em empate), o que não dá
    // pra verificar a partir do Node. Em vez de confiar num comportamento
    // não-verificável, a régua muda pra uma que NÃO DEPENDE de desempate
    // nenhum: qual das duas fontes contribui com MAIS itens no total —
    // sempre a mesma resposta não importa a ordem interna. `tNCorte`/
    // `eNCorte` são CÓPIAS textuais de `tarefasN`/`editaisN` (acima, em
    // `contagem`) — a CONTAGEM total (`n`) nunca é recalculada aqui (seguiu
    // vindo do parâmetro que `hojeBloco` já vincula a partir de `contagem`:
    // "um número, uma fonte", Onda 2); só a decisão de ORIGEM usa
    // `tNCorte`/`eNCorte`. Empate exato entre as duas fontes cai em
    // `${A.TAREFAS}` (o default anterior a esta Onda) — decisão
    // determinística, não silenciosa.
    rodapeLink: url => n => {
      const colBloqueada = letraDe(TAREFAS_CABECALHO, 'bloqueada por');
      const rBloqueada = `${A.TAREFAS}!$${colBloqueada}$${LT}:$${colBloqueada}`;
      const tarefasNCorte = `SUMPRODUCT((${A.TAREFAS}!$A$${LT}:$A<>"")*(${A.TAREFAS}!$C$${LT}:$C<>"✅ feita")*`
        + `(${A.TAREFAS}!$E$${LT}:$E<>"")*(${A.TAREFAS}!$E$${LT}:$E<=TODAY()+${HOJE_JANELA_VENCE_DIAS})*`
        + `(MAP(${rBloqueada};LAMBDA(bp;IF(bp="";1;IF(COUNTIFS(${A.TAREFAS}!$A$${LT}:$A;bp;${A.TAREFAS}!$C$${LT}:$C;"<>✅ feita")>0;0;1))))))`;
      const editaisNCorte = `SUMPRODUCT((${D}!$U$2:$U="docente")*(${D}!$M$2:$M<>"")*`
        + `(${D}!$M$2:$M>=TEXT(TODAY();"yyyy-mm-dd"))*(${D}!$M$2:$M<=TEXT(TODAY()+${HOJE_JANELA_VENCE_DIAS};"yyyy-mm-dd")))`;
      return `LET(`
        + `tNCorte;${tarefasNCorte};`
        + `eNCorte;${editaisNCorte};`
        + `IF(eNCorte>tNCorte;`
        + `HYPERLINK("${url(A.PAINEL)}";"+ "&(${n}-${HOJE_TETO_VENCE})&" não cabem aqui — abra ${ROTULO_NAV[A.PAINEL]}");`
        + `HYPERLINK("${url(A.TAREFAS)}";"+ "&(${n}-${HOJE_TETO_VENCE})&" não cabem aqui — abra ${ROTULO_NAV[A.TAREFAS]}")))`;
    }
  },
  {
    chave: 'ATENCAO',
    aba: A.TAREFAS,
    teto: HOJE_TETO_ATENCAO,
    titulo: `${HOJE_BLOCO_GLIFO.ATENCAO} ATENÇÃO — parado, bloqueado, ou o relógio correndo`,
    // Três fontes, cada uma respondendo a UM pedido do briefing da Onda 19:
    //   Fila     -> "oportunidade que fecha antes do SLA" (o relógio da
    //               vaga corre mais rápido que o alarme de `parada há`
    //               teria tempo de acender).
    //   Candidaturas -> "candidatura esperando resposta há N dias" — a
    //               pergunta que JB não faz em voz alta, reaproveitando
    //               EXATAMENTE `candidaturasAguardandoHa`/`CANDIDATURAS_COND`
    //               (a mesma fonte da Onda 5-6, nunca uma segunda conta).
    //   Tarefas  -> "o que está bloqueado e por quê" — o espelho do que o
    //               bloco ⏳ TAREFAS ESCONDE de propósito (bloqueada não
    //               aparece lá, e sem isto ela não apareceria em lugar
    //               nenhum: escondida ≠ invisível pro sistema inteiro).
    // Uma chave de urgência por FAIXA (fila < 10000 < candidatura < 20000 =
    // tarefa), ascendente: dentro da mesma faixa o mais urgente sobe. Não é
    // ranking entre as três naturezas — é a MESMA lógica de tier que ⏳
    // TAREFAS já usa (chave 0/1/2/3), generalizada pra 3 fontes.
    // MESMA cura do bloco ⏰ VENCE acima (ver o bloco de comentário grande
    // lá — VSTACK de FILTERs separados + condição de comparação crua presa
    // a LET são os dois lados do mesmo achado): três fontes CRUAS
    // combinadas ANTES de qualquer FILTER, uma condição por fonte via MAP,
    // um VSTACK das condições, e um FILTER só no fim.
    corpo: url => {
      const colBloqueada = letraDe(TAREFAS_CABECALHO, 'bloqueada por');
      const rBloqueada = `${A.TAREFAS}!$${colBloqueada}$${LT}:$${colBloqueada}`;
      const urlTarefas = url(A.TAREFAS);
      const forDoHoje = FILA_ESTAGIOS_FORA_DO_HOJE.map(v => `es="${v}"`).join(';');
      return `LET(`
        + `fOque;${A.FILA}!$${FILA_COL_OQUE}$${LF}:$${FILA_COL_OQUE};`
        + `fEstagio;${A.FILA}!$E$${LF}:$E;`
        + `fPrazo;${A.FILA}!$G$${LF}:$G;`
        // ONDA 16 (Leva 4) — a linha deixa de linkar a URL EXTERNA da vaga
        // (`Fila!B`, "onde a vaga foi publicada") e passa a linkar a aba de
        // ORIGEM (`${A.FILA}`, "de onde este item veio nesta planilha") —
        // mesmo conserto que `eRotulo`, acima, e `cRotulo`, abaixo.
        + `fRotulo;MAP(fOque;LAMBDA(o;HYPERLINK("${url(A.FILA)}";"🎯 "&o)));`
        + `fDetalhe;MAP(fPrazo;LAMBDA(p;IF(p="";"";"fecha em "&(p-TODAY())&" d")));`
        + `fTipo;MAP(fOque;LAMBDA(o;"fila"));`
        + `fChave;MAP(fPrazo;LAMBDA(p;IF(p="";99999;0+(p-TODAY()))));`
        + `fCond;MAP(fOque;fEstagio;fPrazo;LAMBDA(o;es;p;`
        + `AND(o<>"";NOT(OR(${forDoHoje}));p<>"";(p-TODAY())>=0;(p-TODAY())<=${FILA_SLA_DIAS})));`
        + `cAguardando;${candidaturasAguardandoHa};`
        + `cOrgao;${candidaturasOrgao};`
        + `cUrlEstado;${candidaturasUrl};`
        + `cInscritoEstado;${A.EST}!$C$2:$C;`
        // ONDA 16 (Leva 4) — mesmo conserto: `cUrlEstado` (a URL externa,
        // chave em `_estado!A`) continua alimentando `cCond` (existência da
        // candidatura), mas deixa de decidir o link da linha — a linha
        // linka `${A.CANDIDATURAS}` sempre.
        + `cRotulo;MAP(cOrgao;LAMBDA(o;HYPERLINK("${url(A.CANDIDATURAS)}";"🗂️ "&o)));`
        + `cDetalhe;MAP(cAguardando;LAMBDA(d;IF(d="";"";"aguardando há "&d&" d")));`
        + `cTipo;MAP(cOrgao;LAMBDA(o;"candidatura"));`
        + `cChave;MAP(cAguardando;LAMBDA(d;IF(d="";99999;10000-d)));`
        + `cCond;MAP(cUrlEstado;cInscritoEstado;cAguardando;LAMBDA(u;insc;d;`
        + `AND(u<>"";insc=TRUE;d<>"";d>${CANDIDATURAS_LIMIAR_AGUARDANDO_DIAS})));`
        + `tNomes;${A.TAREFAS}!$A$${LT}:$A;`
        + `tEstagios;${A.TAREFAS}!$C$${LT}:$C;`
        + `tBloqPor;${rBloqueada};`
        + `tBloqueada;MAP(tBloqPor;LAMBDA(bp;IF(bp="";FALSE;COUNTIFS(tNomes;bp;tEstagios;"<>✅ feita")>0)));`
        + `tRotulo;MAP(tNomes;LAMBDA(n;HYPERLINK("${urlTarefas}";"⏳ "&n)));`
        + `tDetalhe;MAP(tBloqPor;LAMBDA(bp;IF(bp="";"";"bloqueada por "&bp)));`
        + `tTipo;MAP(tNomes;LAMBDA(n;"tarefa"));`
        + `tChave;MAP(tNomes;LAMBDA(n;20000));`
        + `tCond;MAP(tNomes;tEstagios;tBloqueada;LAMBDA(n;es;bq;AND(n<>"";es<>"✅ feita";bq)));`
        + `todosRotulo;VSTACK(fRotulo;cRotulo;tRotulo);`
        + `todosDetalhe;VSTACK(fDetalhe;cDetalhe;tDetalhe);`
        + `todosTipo;VSTACK(fTipo;cTipo;tTipo);`
        + `todosChave;VSTACK(fChave;cChave;tChave);`
        + `todosCond;VSTACK(fCond;cCond;tCond);`
        + `ARRAY_CONSTRAIN(SORT(FILTER(HSTACK(todosRotulo;todosDetalhe;todosTipo;"";todosChave);todosCond);5;TRUE);${HOJE_TETO_ATENCAO};4)`
        + `)`;
    },
    vazio: `"${MARCADOR_VAZIO}Nada travado: nenhuma tarefa bloqueada, nenhuma candidatura esquecida, nenhuma vaga correndo contra o prazo."`,
    contagem: (() => {
      const colBloqueada = letraDe(TAREFAS_CABECALHO, 'bloqueada por');
      const rBloqueada = `${A.TAREFAS}!$${colBloqueada}$${LT}:$${colBloqueada}`;
      const filaN = `SUMPRODUCT((${A.FILA}!$${FILA_COL_OQUE}$${LF}:$${FILA_COL_OQUE}<>"")*${HOJE_EXCLUI_FILA_PRODUTO}*`
        + `(${A.FILA}!$G$${LF}:$G<>"")*((${A.FILA}!$G$${LF}:$G-TODAY())>=0)*((${A.FILA}!$G$${LF}:$G-TODAY())<=${FILA_SLA_DIAS}))`;
      const candN = `LET(diasArr;${candidaturasAguardandoHa};SUMPRODUCT(${CANDIDATURAS_COND}*(diasArr<>"")*(diasArr>${CANDIDATURAS_LIMIAR_AGUARDANDO_DIAS})))`;
      const tarefasN = `SUMPRODUCT((${A.TAREFAS}!$A$${LT}:$A<>"")*(${A.TAREFAS}!$C$${LT}:$C<>"✅ feita")*`
        + `(MAP(${rBloqueada};LAMBDA(bp;IF(bp="";0;IF(COUNTIFS(${A.TAREFAS}!$A$${LT}:$A;bp;${A.TAREFAS}!$C$${LT}:$C;"<>✅ feita")>0;1;0))))))`;
      return `(${filaN})+(${candN})+(${tarefasN})`;
    })(),
    // ONDA 16 (Leva 4) — o RODAPÉ deixa de apontar sempre pra `${A.TAREFAS}`.
    // Diferente de VENCE, as TRÊS chaves de urgência aqui NUNCA se cruzam
    // pra item qualificado (`fChave` ∈ [0, ${FILA_SLA_DIAS}], `cChave` ∈
    // (10000-∞, 10000], `tChave` = 20000 fixo — ver os comentários de
    // `fChave`/`cChave`/`tChave` no corpo, acima) — a ordem por FONTE é
    // determinística: toda fila qualificada vem antes de toda candidatura
    // qualificada, que vem antes de toda tarefa bloqueada qualificada.
    // "Quem fica de fora" na posição de corte se decide então por
    // CONTAGEM bruta, sem reordenar nada: sobrou fila além do teto? é fila
    // quem corta. Senão, fila+candidatura juntas passam do teto? é
    // candidatura. Senão, é tarefa. `fN`/`cN` abaixo são CÓPIAS textuais de
    // `filaN`/`candN` (acima, em `contagem`) — a CONTAGEM total (`n`) nunca
    // é recalculada aqui (permanece o parâmetro vindo de `contagem`, "um
    // número, uma fonte", Onda 2); só a decisão de ORIGEM usa `fN`/`cN`.
    rodapeLink: url => n => {
      const fN = `SUMPRODUCT((${A.FILA}!$${FILA_COL_OQUE}$${LF}:$${FILA_COL_OQUE}<>"")*${HOJE_EXCLUI_FILA_PRODUTO}*`
        + `(${A.FILA}!$G$${LF}:$G<>"")*((${A.FILA}!$G$${LF}:$G-TODAY())>=0)*((${A.FILA}!$G$${LF}:$G-TODAY())<=${FILA_SLA_DIAS}))`;
      const cN = `LET(diasArrCorte;${candidaturasAguardandoHa};SUMPRODUCT(${CANDIDATURAS_COND}*(diasArrCorte<>"")*(diasArrCorte>${CANDIDATURAS_LIMIAR_AGUARDANDO_DIAS})))`;
      return `LET(`
        + `fNCorte;${fN};`
        + `cNCorte;${cN};`
        + `IF(fNCorte>=${HOJE_TETO_ATENCAO}+1;`
        + `HYPERLINK("${url(A.FILA)}";"+ "&(${n}-${HOJE_TETO_ATENCAO})&" não cabem aqui — abra ${ROTULO_NAV[A.FILA]}");`
        + `IF(fNCorte+cNCorte>=${HOJE_TETO_ATENCAO}+1;`
        + `HYPERLINK("${url(A.CANDIDATURAS)}";"+ "&(${n}-${HOJE_TETO_ATENCAO})&" não cabem aqui — abra ${ROTULO_NAV[A.CANDIDATURAS]}");`
        + `HYPERLINK("${url(A.TAREFAS)}";"+ "&(${n}-${HOJE_TETO_ATENCAO})&" não cabem aqui — abra ${ROTULO_NAV[A.TAREFAS]}"))))`;
    }
  },
  {
    chave: 'TAREFAS',
    aba: A.TAREFAS,
    teto: HOJE_TETO_TAREFAS,
    titulo: `${HOJE_BLOCO_GLIFO.TAREFAS} TAREFAS — tudo que não está feito, mais urgente primeiro`,
    // O `⚠️ ` na frente do prazo vencido é o conserto de um sinal que faltava:
    // a coluna B deste bloco imprime uma STRING de data, sem emoji, e o único
    // canal de "vencida" era a POSIÇÃO no SORT. Com 12 tarefas no celular,
    // posição não é canal. Cobrir por formatação condicional é impossível: a
    // coluna B do `VSTACK` significa coisa diferente em cada bloco (prazo em
    // TAREFAS, "o quê" em FILA), então qualquer regra keyed em B dispararia
    // nos blocos errados. O conserto é de fórmula, e aí a cor não precisa
    // entrar em `Hoje` nenhuma vez.
    //
    // Onda 15 (CRM vivo) — URGÊNCIA REAL, não mais só "prazo, sem-prazo por
    // último". Quatro degraus, prioridade decrescente: vencida (chave 0) ->
    // vence em <=2 dias (chave 1) -> desbloqueada e curta (esforço "P",
    // chave 2) -> resto (chave 3). SORT por essa chave primeiro, prazo-chave
    // como desempate (mesmo truque de sempre pra "sem prazo" ir pro fim sem
    // sumir). `bloqueada` é calculada por `MAP`+`LAMBDA` (o único jeito
    // provado de COUNTIFS por linha não se confundir com array cru — mesma
    // classe de defeito que `FILA_ID_DERIVADO`/`candidaturasAguardandoHa` já
    // pagaram nesta planilha): uma tarefa só conta como bloqueada enquanto a
    // que ela aponta em `bloqueada por` não estiver `✅ feita`. TAREFA
    // BLOQUEADA SAI DO FILTER — é o teste de aceite da Onda: "não aparece
    // como atacável hoje", não "aparece marcada como bloqueada".
    corpo: (() => {
      const colEsforco = letraDe(TAREFAS_CABECALHO, 'esforço');
      const colBloqueada = letraDe(TAREFAS_CABECALHO, 'bloqueada por');
      const rEsforco = `${A.TAREFAS}!$${colEsforco}$${LT}:$${colEsforco}`;
      const rBloqueada = `${A.TAREFAS}!$${colBloqueada}$${LT}:$${colBloqueada}`;
      return `LET(`
        + `nomes;${A.TAREFAS}!$A$${LT}:$A;`
        + `estagios;${A.TAREFAS}!$C$${LT}:$C;`
        + `prazos;${A.TAREFAS}!$E$${LT}:$E;`
        + `esforcos;${rEsforco};`
        + `bloqPor;${rBloqueada};`
        + `bloqueada;MAP(bloqPor;LAMBDA(bp;IF(bp="";FALSE;COUNTIFS(nomes;bp;estagios;"<>✅ feita")>0)));`
        + `chave;MAP(prazos;esforcos;LAMBDA(p;e;`
        + `IF(AND(p<>"";p<TODAY());0;`
        + `IF(AND(p<>"";(p-TODAY())<=2);1;`
        + `IF(e="P";2;3)))));`
        + `prazoTexto;MAP(prazos;LAMBDA(p;IF(p="";"— sem prazo —";IF(p<TODAY();"⚠️ "&TEXT(p;"dd/mm");TEXT(p;"dd/mm")))));`
        + `prazoChave;MAP(prazos;LAMBDA(p;IF(p="";${HOJE_CHAVE_SEM_PRAZO};p)));`
        + `t;FILTER(HSTACK(nomes;prazoTexto;${A.TAREFAS}!$D$${LT}:$D;estagios;chave;prazoChave);`
        + `nomes<>"";estagios<>"✅ feita";NOT(bloqueada));`
        + `ARRAY_CONSTRAIN(SORT(t;5;TRUE;6;TRUE);${HOJE_TETO_TAREFAS};4)`
        + `)`;
    })(),
    vazio: `"${MARCADOR_VAZIO}Nenhuma tarefa aberta. Escreva a primeira em ${ROTULO_NAV[A.TAREFAS]}: só «tarefa» é obrigatória."`,
    // A contagem (teto/transbordo) precisa da MESMA exclusão de bloqueada que
    // o corpo aplica — senão "+ N não cabem aqui" incluiria tarefa bloqueada
    // que nunca vai aparecer em bloco nenhum, e o número mentiria sobre o
    // que existe pra ver.
    contagem: (() => {
      const colBloqueada = letraDe(TAREFAS_CABECALHO, 'bloqueada por');
      const rBloqueada = `${A.TAREFAS}!$${colBloqueada}$${LT}:$${colBloqueada}`;
      return `SUMPRODUCT((${A.TAREFAS}!$A$${LT}:$A<>"")*(${A.TAREFAS}!$C$${LT}:$C<>"✅ feita")*`
        + `(MAP(${rBloqueada};LAMBDA(bp;IF(bp="";1;IF(COUNTIFS(${A.TAREFAS}!$A$${LT}:$A;bp;${A.TAREFAS}!$C$${LT}:$C;"<>✅ feita")>0;0;1))))))`;
    })()
  },
  {
    chave: 'FILA',
    aba: A.FILA,
    teto: HOJE_TETO_FILA,
    titulo: `${HOJE_BLOCO_GLIFO.FILA} FILA — próximas por ordem`,
    // A coluna 4 é o `prazo` da `Fila` — um VALOR de data. Sem máscara ela
    // herdaria o formato da célula do painel (que não tem numberFormat) e
    // renderizaria numa terceira língua de data, ao lado do `dd/mm` das
    // Tarefas e do `dd/mm` do Radar. Mesma cura do D7, aplicada antes de a
    // `Fila` ter uma linha: a `Fila` está vazia hoje, e é justamente por isso
    // que este ramo nunca foi visto.
    corpo: `ARRAY_CONSTRAIN(SORT(FILTER(HSTACK(${A.FILA}!$F$${LF}:$F;${A.FILA}!$${FILA_COL_OQUE}$${LF}:$${FILA_COL_OQUE};${hojeTruncar(`${A.FILA}!$E$${LF}:$E`, 2)};${hojeData(`${A.FILA}!$G$${LF}:$G`, false)});${A.FILA}!$${FILA_COL_OQUE}$${LF}:$${FILA_COL_OQUE}<>"";${HOJE_EXCLUI_FILA});1;TRUE);${HOJE_TETO_FILA};4)`,
    // ONDA UX 3 — nomeia a coluna pelo RÓTULO (`FILA_ROTULO_COLUNA_LINK`),
    // não pela posição. Ver o comentário grande junto da constante.
    vazio: `"${MARCADOR_VAZIO}Nada na fila. Copie o link (coluna «${FILA_ROTULO_COLUNA_LINK}» de ${ROTULO_NAV[A.EMPREGOS]}) e cole na ${ROTULO_NAV[A.FILA]}: o resto vem sozinho."`,
    // ONDA UX 2 — "Um número, uma fonte": a conta velha (`COUNTIFS(...;"<>")`)
    // caía na MESMA armadilha que produziu o "+989" medido ao vivo em
    // `Hoje!F11` (2026-09-01): `Fila!C` é `FILA_OQUE_DERIVADO`, uma
    // ARRAYFORMULA (`MAP`) que devolve `""` pra toda linha vazia até o fim da
    // grade (999 linhas). `COUNTIFS` com critério de texto `"<>"` conta esse
    // `""` de FÓRMULA como não-vazio (é um padrão de correspondência de
    // texto, não uma comparação booleana) — `999 - 10 = 989`. A cura é
    // `SUMPRODUCT` com o operador `<>""` (comparação, não padrão de texto —
    // não cai na mesma armadilha) sobre a MESMA exclusão de estágio que o
    // `corpo` usa acima (`HOJE_EXCLUI_FILA_PRODUTO`, a forma multiplicativa
    // de `HOJE_EXCLUI_FILA`, já provada no bloco 🚧 ATENÇÃO): o número deriva
    // da MESMA expressão que decide o que a lista mostra, nunca de uma
    // segunda conta escrita à mão.
    contagem: `SUMPRODUCT((${A.FILA}!$${FILA_COL_OQUE}$${LF}:$${FILA_COL_OQUE}<>"")*${HOJE_EXCLUI_FILA_PRODUTO})`
  },
  {
    chave: 'PROJETOS',
    aba: A.PROJETOS,
    teto: HOJE_TETO_PROJETOS,
    titulo: `${HOJE_BLOCO_GLIFO.PROJETOS} PROJETOS`,
    // As colunas vêm por LETRA DERIVADA do cabeçalho — `próximas tarefas`
    // acabou de ocupar a antiga `E` (quem age), e uma letra literal aqui
    // passaria a imprimir a coluna errada sem erro nenhum na tela.
    // A coluna 3 do painel (`próximo passo`) é a que estava sendo cortada no
    // meio da palavra — é aqui que o truncamento honesto entra.
    corpo: (() => {
      const est = letraDe(PROJETOS_CABECALHO, 'estágio');
      const passo = letraDe(PROJETOS_CABECALHO, 'próximo passo');
      const quem = letraDe(PROJETOS_CABECALHO, 'quem age');
      const ate = `$${PROJETOS_ULTIMA_LINHA}`;
      const faixa = c => `${A.PROJETOS}!$${c}$${LP}:$${c}${ate}`;
      return `ARRAY_CONSTRAIN(FILTER(HSTACK(${PROJETOS_RANGE_NOME};${faixa(est)};`
        + `${hojeTruncar(faixa(passo), 2)};${hojeTruncar(faixa(quem), 3)});`
        + `${PROJETOS_RANGE_NOME}<>"");${HOJE_TETO_PROJETOS};4)`;
    })(),
    vazio: `"${MARCADOR_VAZIO}Nenhuma frente ativa. Nomeie em ${ROTULO_NAV[A.PROJETOS]} o que você toca agora: as tarefas se penduram nela."`,
    contagem: `COUNTIF(${PROJETOS_RANGE_NOME};"<>")`
  },
  {
    // BLOCO NOVO. O `Diário` é a aba onde JB e Durin conversam sobre o que
    // aconteceu — e até aqui ele não aparecia em NENHUM lugar do painel do
    // dia. Uma aba que ninguém vê é uma aba que ninguém alimenta, e o
    // `Diário` alimenta `Projetos!G`/`K` por junção de nome: parar de
    // escrever nele apaga a "última movimentação" de todo projeto, em
    // silêncio. Aqui ele é o único bloco de RECÊNCIA (o resto é pendência),
    // então o teto é curto e a ordem é a inversa de todos os outros.
    // Colunas: o que aconteceu · quando · quem · sobre. "Com autor" não é
    // enfeite — o Diário é histórico de DECISÃO, e quem decidiu faz parte do
    // registro.
    chave: 'DIARIO',
    aba: A.DIARIO,
    teto: HOJE_TETO_DIARIO,
    titulo: `${HOJE_BLOCO_GLIFO.DIARIO} DIÁRIO — o que se moveu, mais recente primeiro`,
    // N6 — O BLOCO DIARIO TOMAVA O PAINEL. A coluna `o que aconteceu` entrava
    // CRUA: `Hoje!A19` tinha 460 caracteres e `A20` tinha 655, sem truncagem
    // nenhuma, com WRAP. Na pagina 1 do export, 22 das ~31 linhas de texto do
    // hub eram esses dois paragrafos — 71% da primeira tela. E cinco linhas
    // acima, `C14` cortava o `proximo passo` em 22 caracteres com "…".
    // A peca truncava o campo CURTO que identifica e imprimia inteiro o campo
    // LONGO que narra. O bloco existe pra dizer O QUE SE MOVEU; o registro
    // inteiro mora no `Diario`, a um toque pelo titulo do bloco.
    // Agora a coluna passa pela MESMA `hojeTruncar` das outras — nenhuma
    // politica de estouro nova, a que a peca ja tem.
    corpo: `ARRAY_CONSTRAIN(SORT(FILTER(HSTACK(`
      + `${hojeTruncar(`${A.DI}!$D$${LD}:$D`, 0)};`
      + `MAP(${A.DI}!$A$${LD}:$A;LAMBDA(x;IF(x="";"— sem data —";TEXT(x;"dd/mm"))));`
      + `${A.DI}!$B$${LD}:$B;`
      + `${hojeTruncar(`${A.DI}!$C$${LD}:$C`, 3)};`
      + `${A.DI}!$A$${LD}:$A`
      + `);${A.DI}!$D$${LD}:$D<>"");5;FALSE);${HOJE_TETO_DIARIO};4)`,
    vazio: `"${MARCADOR_VAZIO}Diário vazio. Registre o que terminou: alimenta ${ROTULO_NAV[A.PROJETOS]} sozinho."`,
    contagem: `COUNTIF(${A.DI}!$D$${LD}:$D;"<>")`
  },
  {
    // ==================== N1 — AS 4 ABAS NOVAS TINHAM ZERO CAMINHO ==========
    //
    // `Noticias`, `IA`, `Trabalho` e `Ciencia` so se alcancavam pela TIRA DE
    // ABAS, nas posicoes 4 a 7 de 12. Elas linkam entre si e linkam de volta
    // pro `Hoje`; a volta nao tinha par. Valvula de mao unica: quem abrisse a
    // planilha sem ter estado na sessao em que elas nasceram nao descobria
    // 1.177 noticias em lugar nenhum da peca. O invariante da spec §3 — "de
    // qualquer aba pra qualquer aba, no maximo 2 toques, sem encostar na
    // tira" — morreu no dia em que a peca foi de 8 pra 12 destinos.
    //
    // POR QUE AQUI E NAO NUM 5o LINK NA BARRA DE CADA ABA. A medicao que
    // rejeitou o 5o link continua certa: os slots 1 a 3 de toda aba ja estao
    // ocupados e a dobra (358 px) acaba na 2a ou 3a coluna em todas elas — um
    // 5o link cairia a 600-700 px da borda, que e o D1 outra vez em outra
    // roupa. O `Hoje` e o hub e e nele que o caminho tem que existir; e o
    // painel do hub ja tem um idioma pra isso, que e o BLOCO: titulo que e
    // link (🎯 FILA e 📌 PROJETOS ja sao os UNICOS caminhos de um toque
    // pra essas duas abas) mais corpo com uma linha por destino.
    //
    // GEOMETRIA MEDIDA: os cinco links deste bloco moram todos na coluna A do
    // painel, que tem 170 px — a dobra de 358 px sobra inteira. Nenhum deles
    // cai fora da tela na horizontal, que era o defeito que a alternativa
    // rejeitada produziria.
    //
    // E o bloco nao so LINKA: ele diz quantas noticias esperam em cada aba na
    // mesma janela do bloco 🆕 RADAR. Um caminho que nao diz o que ha do
    // outro lado e um caminho que ninguem percorre duas vezes.
    chave: 'NOTICIA',
    aba: A.NOTICIAS,
    teto: HOJE_TETO_NOTICIA,
    // EMENDA E1 (remodelação 2026-09-01) — o rótulo dizia "o que ENTROU nos
    // últimos N dias", que lê como DELTA (chegada nova, algo que se soma ao
    // que já se viu). Verificado ao vivo contra `notícias (não edite)`
    // (2026-09-01): o número já É um recorte honesto de N dias — a fórmula
    // (`n`, abaixo) sempre filtrou `quando>=TODAY()-N`, nunca somou o
    // universo inteiro — mas o STORE deste radar não retém muito além da
    // própria janela (a maior parte do que existe HOJE foi publicada nos
    // últimos 7 dias, porque notícia velha sai de circulação rápido), então
    // "últimos 7 dias" e "tudo o que há" ficam quase iguais na prática — e
    // "entrou" promete uma NOVIDADE que o número não sustenta. Menor
    // intervenção que resolve a incoerência: o RÓTULO passa a dizer
    // exatamente o que o número é — um VOLUME dentro da janela ("o que tem
    // pra ver"), não uma chegada — reaproveitando a frase que já descrevia a
    // intenção deste bloco (ver o comentário de `HOJE_JANELA_NOTICIA_DIAS`,
    // acima: "um resumo de 'o que tem pra ver'"). A fórmula do número NÃO
    // muda — já era a mesma que o rótulo agora descreve.
    titulo: `${HOJE_BLOCO_GLIFO.NOTICIA} NOTÍCIA — quanto há pra ver, últimos ${HOJE_JANELA_NOTICIA_DIAS} dias`,
    // FUNCAO, nao string: este e o unico bloco cujo CORPO carrega link, e link
    // precisa do gid, que so existe em tempo de construcao. `hojeBloco` aceita
    // os dois (ver la).
    corpo: url => `VSTACK(${A.VISTAS_NOTICIA.map(aba => {
      const n = `COUNTIFS(${nfFaixa('aba')};"${NOTICIA_ABA_PIPELINE[aba]}";${nfFaixa('quando')};">="&(TODAY()-${HOJE_JANELA_NOTICIA_DIAS}))`;
      return `HSTACK(HYPERLINK("${url(aba)}";"${ROTULO_NAV[aba]}");LET(n;${n};IF(n=0;"nada novo";n&" notícia(s)"));"";"")`;
    }).join(';')})`,
    vazio: `"${MARCADOR_VAZIO}As abas de notícia ainda não existem. Rode: node _norman/construir.js"`,
    // O corpo tem exatamente `teto` linhas por construcao, entao o rodape de
    // transbordo nunca acende — de proposito: nao ha "resto" a contar aqui.
    contagem: `${HOJE_TETO_NOTICIA}`
  },
  {
    chave: 'RADAR',
    // O radar mistura as duas trilhas (a coluna `trilha` diz qual é qual), e
    // um link é UM destino. Aponta pra `Empregos` — é a superfície com mais
    // volume e a que JB abre todo dia; `Concursos` está a um toque, na linha
    // 2 desta mesma aba. `Concursos · tudo` NÃO é destino de link nenhum:
    // está oculta, e link pra aba oculta é link que não navega.
    aba: A.EMPREGOS,
    teto: HOJE_TETO_RADAR,
    titulo: `${HOJE_BLOCO_GLIFO.RADAR} RADAR — entrou nos últimos ${HOJE_JANELA_RADAR_DIAS} dias`,
    // D7. A coluna 3 imprimia `2026-08-27` — ISO 8601 cru, direto do store —
    // vinte linhas abaixo de um `27/08` na mesma tela. A data agora sai no
    // vocabulário da peça, e a ISO CRUA viaja como QUINTA coluna, que é a
    // chave do SORT: ordenar por `dd/mm` ordenaria por dia do mês, e o painel
    // do dia passaria a mentir sobre o que é mais novo. `ARRAY_CONSTRAIN`
    // descarta a quinta no fim — mesmo truque que os blocos ⏳ e 📓 já usam.
    corpo: `ARRAY_CONSTRAIN(SORT(FILTER(HSTACK(`
      + `${D}!$A$2:$A;`
      + `${D}!$D$2:$D;`
      + `${hojeData(`${D}!$N$2:$N`, true)};`
      + `${D}!$U$2:$U;`
      + `${D}!$N$2:$N`
      + `);${D}!$N$2:$N<>"";${D}!$N$2:$N>=TEXT(TODAY()-${HOJE_JANELA_RADAR_DIAS};"yyyy-mm-dd"));5;FALSE);${HOJE_TETO_RADAR};4)`,
    // O estado vazio do radar TEM que dizer a data do sync. Sem isso, "nada
    // novo" é indistinguível de "o robô parou" — exatamente a confusão que o
    // `AVISO_SYNC` da linha 1 existe pra matar. As duas mensagens se
    // completam; não competem. A data vem da MESMA fonte do aviso (a
    // constante `CARIMBO`), nunca de uma segunda leitura.
    vazio: `"${MARCADOR_VAZIO}Nada novo nos últimos ${HOJE_JANELA_RADAR_DIAS} dias. Radar rodou em "&${CARIMBO_DDMM}&": em fim de semana é normal."`,
    // SUMPRODUCT, não COUNTIFS: `data_publicacao` é TEXTO ISO puro, e
    // COUNTIFS com critério ">="&texto tenta ler esse texto como DATA antes
    // de comparar; contra uma célula que é texto, a comparação nunca bate e o
    // COUNTIFS devolve 0 em silêncio (testado ao vivo: 43 linhas reais,
    // COUNTIFS contou 0). `SUMPRODUCT` com o MESMO operador `>=` que o FILTER
    // do bloco já usa faz comparação de TEXTO — a mesma conta que decide o
    // que aparece decide o aviso.
    contagem: `SUMPRODUCT((${D}!$N$2:$N<>"")*(${D}!$N$2:$N>=TEXT(TODAY()-${HOJE_JANELA_RADAR_DIAS};"yyyy-mm-dd")))`
  },
  // ===========================================================================
  // C5 (Leva 5) — 📊 PULSO. Painel DESCRITIVO, não lista: quatro fatos fixos
  // (inscrições 30d · descartes 30d · candidaturas por estágio · meta),
  // NENHUM número inventado (D-A3: meta é literal "[a definir por JB]").
  // ===========================================================================
  //
  // POR QUE ESTE BLOCO NÃO É UM `FILTER`/`SORT` como os outros seis: ele não
  // resume LINHAS de uma aba, resume CONTAGENS de três fontes diferentes
  // (`_estado`, duas vezes, com condições distintas, mais o funil de
  // `Candidaturas`). `aba: A.CANDIDATURAS` é uma SIMPLIFICAÇÃO DECLARADA
  // pro título/rodapé (mesmo dispositivo que ⏰ VENCE/🚧 ATENÇÃO já usam,
  // acima): das três fontes, é a que tem destino navegável mais próximo do
  // "funil" que este bloco resume.
  //
  // ENCAIXE NA GEOMETRIA (decisão declarada, briefing C5): entra como
  // TERCEIRO bloco do grupo 3 (`NOTICIA`+`RADAR`), não como grupo novo.
  // Alturas por grupo (`teto+3` por bloco): grupo 1 (TAREFAS+FILA) = 15+13 =
  // 28, o MAIOR — é ele que define `hojeUltimaLinha()`. Grupo 3
  // (NOTICIA+RADAR) = 7+13 = 20, ou seja 8 linhas de FOLGA VERTICAL antes de
  // alcançar o teto do maior grupo. PULSO cabe nessa folga (4+3=7 ≤ 8): o
  // grupo 3 sobe pra 27, ainda ≤ 28, e `hojeUltimaLinha()` NÃO MUDA — zero
  // impacto na altura do painel, zero coluna nova, zero mudança em
  // `HOJE_COLUNAS_ABA`/`HOJE_WRAP_ABA`/`verificar.js` (todos DERIVADOS de
  // `HOJE_GRUPOS_COLUNA`/`HOJE_BLOCOS`, então acompanham sozinhos). A
  // alternativa (grupo 5 novo) foi REJEITADA: custaria 4 colunas + 1 vão a
  // mais na largura da aba pra um painel de 4 linhas fixas — desproporcional,
  // e o briefing pede "menor intervenção que caiba".
  //
  // Por que não pode ser estático dentro do território do grupo 3: a regra
  // dura de `construir.js` guarda 4 ("NADA pode ser escrito no território de
  // spill de NENHUM grupo") proíbe célula solta ali — então PULSO tem que
  // ser um `hojeBloco()` de verdade, participando do MESMO `VSTACK` do grupo,
  // não uma escrita a parte.
  {
    chave: 'PULSO',
    aba: A.CANDIDATURAS,
    teto: HOJE_TETO_PULSO,
    titulo: `${HOJE_BLOCO_GLIFO.PULSO} PULSO — funil dos últimos ${HOJE_JANELA_PULSO_DIAS} dias`,
    // Os quatro fatos são texto MONTADO em Node (nunca `FILTER`/`SORT`): a
    // linha é sempre a mesma pergunta, só o número muda. `SUMPRODUCT`, não
    // `COUNTIFS` — mesma lição do bloco 🆕 RADAR, acima: `_estado!quando`/
    // `_estado!descartado_quando` são TEXTO ISO puro, e `COUNTIFS(...;">="&
    // texto)` tenta ler como DATA antes de comparar e devolve 0 em silêncio
    // contra uma célula que é texto.
    corpo: (() => {
      const pulsoInscricoes30d = `SUMPRODUCT((${A.EST}!$C$2:$C=TRUE)*(${A.EST}!$D$2:$D<>"")*` +
        `(${A.EST}!$D$2:$D>=TEXT(TODAY()-${HOJE_JANELA_PULSO_DIAS};"yyyy-mm-dd")))`;
      const pulsoDescartes30d = `SUMPRODUCT((${A.EST}!$J$2:$J=TRUE)*(${A.EST}!$K$2:$K<>"")*` +
        `(${A.EST}!$K$2:$K>=TEXT(TODAY()-${HOJE_JANELA_PULSO_DIAS};"yyyy-mm-dd")))`;
      return `VSTACK(`
        + `HSTACK("📥 inscrições (últimos ${HOJE_JANELA_PULSO_DIAS} d): "&${pulsoInscricoes30d};"";"";"");`
        + `HSTACK("❌ descartes (últimos ${HOJE_JANELA_PULSO_DIAS} d): "&${pulsoDescartes30d};"";"";"");`
        // MESMA expressão do funil de `Candidaturas!veredito` (doutrina "um
        // número, uma fonte") — nunca uma segunda implementação da conta.
        + `HSTACK("🧾 candidaturas: "&${CANDIDATURAS_FUNIL_TEXTO};"";"";"");`
        // ACHADO AO VIVO (`node _norman/verificar.js`, controle G3 — "blocos
        // na tela: 10/9"): o glifo desta linha era `🎯`, o MESMO de
        // `HOJE_BLOCO_GLIFO.FILA`. `HOJE_REGEX_TITULO` casa QUALQUER linha
        // que COMECE por um dos nove glifos de bloco, não só a linha de
        // título de verdade — a linha "meta" virava um TÍTULO FALSO: a
        // regra R-H1 (formatar.js) pintava banda N1 + acento nela, e este
        // verificador contava 10 títulos em vez de 9. `🧭` não é glifo de
        // bloco de ninguém (ver `HOJE_BLOCO_GLIFO`) — nenhuma linha de
        // CORPO de bloco nenhum pode começar por um desses nove, e é por
        // isso que este comentário existe: pra quem editar esta linha de
        // novo lembrar de conferir contra `Object.values(HOJE_BLOCO_GLIFO)`.
        + `HSTACK("🧭 meta: [a definir por JB]";"";"";"")`
        + `)`;
    })(),
    // Nunca alcançado (o corpo acima não tem `FILTER`/`FILTER` que erre —
    // `SUMPRODUCT`/`COUNTIFS` sempre devolvem número, mesmo 0), mas exigido
    // pela forma que `hojeBloco()` espera.
    vazio: `"${MARCADOR_VAZIO}Sem dado suficiente ainda."`,
    // O corpo tem exatamente `teto` linhas por construção — mesmo
    // dispositivo do bloco 🌐 NOTÍCIA, acima: não há "resto" a contar num
    // painel de 4 fatos fixos, então o rodapé de transbordo nunca acende.
    contagem: `${HOJE_TETO_PULSO}`
  }
];

const HOJE_TETOS = Object.fromEntries(HOJE_BLOCOS.map(b => [b.chave, b.teto]));

// ---- montagem do painel ----
// Uma linha de 4 colunas a partir de uma expressão só. Todo sub-array do
// `VSTACK` PRECISA ter exatamente 4 colunas: `VSTACK` preenche o que falta
// com `#N/A`.
//
// DEFEITO ACHADO LENDO A PEÇA DE VOLTA, e a forma que o cura. A primeira
// versão do bloco 📓 DIÁRIO tinha `HSTACK(...)` como expressão mais externa
// dentro de um `LET`. Com o `Diário` vazio, o `FILTER` devolvia `#N/A`; o
// `HSTACK` de três argumentos-erro NÃO propaga um erro escalar — ele empilha
// os três como células e devolve um array **1x3 de erros**. E `IFERROR` é
// element-wise em array: ele mapeou o fallback de 4 colunas POSIÇÃO A
// POSIÇÃO sobre as 3, produzindo uma linha de 3 colunas. Resultado na tela:
// a instrução de estado vazio aparecia certa em A, e a coluna D do painel
// inteiro ganhava um `#N/A` — num bloco, no dia em que ele ficasse vazio.
//
// A cura não é tunar o `IFERROR`: é dar aos CINCO blocos a mesma forma, com
// `ARRAY_CONSTRAIN(SORT(FILTER(HSTACK(...))))` por fora. Nessa forma o erro
// do `FILTER` sobe ESCALAR até o `IFERROR`, que então devolve o fallback
// inteiro, com as 4 colunas. Uma forma, cinco instâncias, e a classe do
// defeito deixa de existir — em vez de cinco chances de reencontrá-la.
// (Onde havia `LET`, a coluna derivada passou a ser calculada por `MAP` sobre
// a coluna CRUA, antes do `FILTER`, e a chave de ordenação viaja como quinta
// coluna que o `ARRAY_CONSTRAIN` descarta no fim.)
//
// `verificar.js` continua olhando por `#N/A` no painel, porque foi ele que
// pegou isto: estrutura no lugar de guarda, mas com a guarda de pé.
const linha4 = expr => `HSTACK(${expr};"";"";"")`;

// ===========================================================================
// C10 Parte 3 (+ conserto 0b desta rodada) — O PAINEL USA A LARGURA.
// TRÊS grupos de colunas, lado a lado.
// ===========================================================================
//
// JB, olhando a peça (mesmo apontamento da Parte 2): os seis blocos empilhados
// numa coluna só, com dois terços da tela em branco à direita. Pedido pra
// esta rodada, não pras Ondas 18-19 originalmente previstas (C10-b): "é a
// primeira aba que ele abre; é onde o branco custa mais."
//
// A Parte 3 original (Onda 21) tinha entregue DOIS grupos de 3 blocos —
// 9 de 26 colunas usadas, ainda desperdiçando largura. Conserto 0b desta
// rodada: TRÊS grupos de 2 blocos cada, não seis âncoras soltas (cada bloco
// sozinho é estreito, 4 colunas/572 px — hospedar cada um no seu próprio
// território desperdiçaria largura de novo, só que em 6 fatias em vez de 3)
// e não dois grupos de três (era metade da largura só, e enfileirava 3
// blocos numa coluna só, alta e ainda estreita relativa à tela). Três
// territórios de 2 blocos cada usam a largura sem afinar nenhum bloco e
// ficam mais baixos que a doutrina de 2 grupos (2 tetos empilhados, não 3).
//
// A ORDEM DE LEITURA continua sendo `HOJE_BLOCOS` — critério de prioridade
// (o que JB decide primeiro fica em cima e à ESQUERDA): grupo 0 (esquerda,
// decide primeiro) = TAREFAS · FILA — os dois blocos que pedem AÇÃO IMEDIATA
// (o que fazer hoje, o que vem a seguir); grupo 1 (meio) = PROJETOS · DIÁRIO
// — o estado dos projetos e a narrativa de como eles chegaram lá, ainda
// decisório mas um passo atrás; grupo 2 (direita, decide por último) =
// NOTÍCIA · RADAR — as duas de CONSCIÊNCIA/awareness, o que chegou de fora.
// A ordem do array `HOJE_BLOCOS` (TAREFAS, FILA, PROJETOS, DIARIO, NOTICIA,
// RADAR) é lida em pares, sem reordenar nenhum bloco — só reparticionada em 3
// grupos em vez de 2. Mudar a distribuição visual é mudar só
// `HOJE_GRUPOS_COLUNA`; nenhum outro lugar deste arquivo decide "quem vem
// onde" por conta própria.
//
// TERRITÓRIO EXCLUSIVO, dito com todas as letras (regra dura de spill: um
// `VSTACK` que encontra célula ocupada morre INTEIRO e derruba a aba — não
// só o bloco): cada grupo é o SEU PRÓPRIO `VSTACK`, ancorado na MESMA linha
// (`LINHAS[A.HOJE].lista`), em blocos de coluna DISJUNTOS
// (`hojeColunaBaseGrupo(g)` .. `+HOJE_GRUPO_LARGURA`), com 1 coluna de vão
// nunca escrita entre cada par de grupos vizinhos — a MESMA arquitetura que
// a Parte 2 já usa pras quatro tabelas de notícia lado a lado
// (`noticiaColunaBase`/`NOTICIA_BLOCO_LARGURA`), aplicada aqui a N grupos
// (a implementação abaixo — `flatMap`, `Math.max` sobre todos os grupos —
// já era genérica pra qualquer número de grupos antes deste conserto; só a
// LISTA mudou, de 2 entradas de 3 blocos pra 3 entradas de 2).
// Onda 19 — QUARTO grupo, e ele fica na PONTA ESQUERDA: `VENCE`/`ATENÇÃO`
// são o cruzamento de tarefa+edital e de fila+candidatura+bloqueio — mais
// urgentes que qualquer bloco de aba única, porque juntam o que as ilhas
// individuais não juntavam. `TAREFAS`/`FILA` (que já eram "ação imediata")
// deslizam pra grupo 1; o resto não muda de lugar. A altura do painel NÃO
// cresce: o grupo mais alto continua sendo TAREFAS+FILA (12+10+6=28 linhas
// contra 8+8+6=22 do grupo novo) — `hojeUltimaLinha` é `Math.max` sobre os
// grupos, então um grupo mais baixo nunca empurra a régua.
// C5 (Leva 5) — PULSO entra como TERCEIRO bloco do grupo 3 (NOTICIA+RADAR),
// não como grupo novo. Ver o bloco de comentário grande no bloco `PULSO`
// dentro de `HOJE_BLOCOS`, acima, pra a conta de altura completa: o grupo 3
// sobe de 20 pra 27 linhas, ainda abaixo do maior grupo (28, TAREFAS+FILA)
// — `hojeUltimaLinha()` não muda. A lista aceita QUALQUER número de blocos
// por grupo (era genérica antes deste conserto, ver `hojeCelulas`/
// `hojeUltimaLinha`, mais abaixo) — só esta entrada cresce de 2 pra 3.
const HOJE_GRUPOS_COLUNA = [
  ['VENCE', 'ATENCAO'],
  ['TAREFAS', 'FILA'],
  ['PROJETOS', 'DIARIO'],
  ['NOTICIA', 'RADAR', 'PULSO']
];
const HOJE_GRUPO_LARGURA = HOJE_COLUNAS.length; // 4 — a largura de UM bloco, inalterada
const HOJE_VAO_LARGURA = 28; // px — respiro visual entre grupos vizinhos, coluna VISÍVEL (não oculta)
const HOJE_GRUPO_PASSO = HOJE_GRUPO_LARGURA + 1; // grupo + 1 vão
/** Índice 0-based da PRIMEIRA coluna do grupo `g` (0, 1 ou 2). */
const hojeColunaBaseGrupo = g => g * HOJE_GRUPO_PASSO;
// Largura/cabeçalho da ABA INTEIRA: 3 grupos × 4 colunas + 2 vãos = 14 (A..N).
// `Hoje` não tem `CABECALHO_POR_ABA` (não é lista de dado, é painel) — sem
// isso, não há guarda de `_`-prefixo pra cumprir; o vão é só uma coluna
// estreita e vazia. 14 de 26 colunas da grade padrão — ainda folga, sem
// precisar crescer `LARGURA[A.HOJE]` em `construir.js`.
const HOJE_COLUNAS_ABA = HOJE_GRUPOS_COLUNA.flatMap((_, g) =>
  g < HOJE_GRUPOS_COLUNA.length - 1 ? [...HOJE_COLUNAS, HOJE_VAO_LARGURA] : [...HOJE_COLUNAS]
);
// `wrap` original era `[0,1]` (as duas colunas mais largas de cada bloco,
// dentro de UM grupo). Com N grupos, o wrap vale nas MESMAS posições
// relativas DENTRO de cada um: `[0,1]` deslocado pra cada `hojeColunaBaseGrupo(g)`.
const HOJE_WRAP_ABA = HOJE_GRUPOS_COLUNA.flatMap((_, g) => [0, 1].map(i => hojeColunaBaseGrupo(g) + i));
/** Última linha que qualquer um dos grupos pode ocupar (o mais alto). */
const hojeUltimaLinha = () => LINHAS[A.HOJE].lista
  + Math.max(...HOJE_GRUPOS_COLUNA.map(chaves =>
    chaves.reduce((n, chave) => n + HOJE_BLOCOS.find(b => b.chave === chave).teto + 3, 0)
  )) - 1;

const hojeBloco = (b, url) => {
  const link = alvo => `HYPERLINK("${url(b.aba)}";${alvo})`;
  // O título é link e NÃO é sublinhado — é o único link não sublinhado da
  // peça. Sublinhar cinco frases longas na mesma tela transformaria a única
  // moldura repetida do painel numa sopa de linhas. É seguro porque a
  // afordância não fica órfã: a linha de rodapé de cada bloco leva à MESMA
  // aba e ela É sublinhada. Todo bloco tem um caminho sublinhado pro seu
  // destino; o título é atalho, não a única porta.
  const titulo = linha4(link(`"${b.titulo}"`));
  // `corpo` pode ser STRING (o caso comum) ou FUNCAO de `url` — o bloco
  // 📰 NOTICIA e o unico cujo corpo hospeda `HYPERLINK`, e o gid so existe
  // em tempo de construcao. Um `typeof` aqui e mais barato que passar `url`
  // pra dentro de HOJE_BLOCOS, que e uma constante estatica de proposito.
  const corpoBruto = typeof b.corpo === 'function' ? b.corpo(url) : b.corpo;
  const corpo = `IFERROR(${corpoBruto};${linha4(b.vazio)})`;
  // "+ N não cabem aqui" já nomeava a aba e não levava a lugar nenhum. Agora
  // leva. `HYPERLINK` dentro de array é comprovado nesta planilha.
  //
  // ONDA 16 (Leva 4, remodelação 2026-09-01) — blocos de FONTE ÚNICA
  // continuam usando `link` (`b.aba` já é a origem certa: só existe uma).
  // Blocos de MÚLTIPLAS fontes (⏰ VENCE, 🚧 ATENÇÃO) declaram
  // `rodapeLink`: `(url) => (nomeDeN) => fórmula`, que decide a ORIGEM do
  // rodapé pelo tipo do item que ficou de fora — nunca sempre `b.aba`
  // (medido: hoje o link leva ao lugar errado quando a fonte saturada não é
  // `${A.TAREFAS}`, AVALIACAO-UX.md Parte 3 #16). `nomeDeN` é o NOME (texto
  // puro) da variável `n` que o `LET` logo abaixo já vincula a partir de
  // `b.contagem` — nunca um valor recalculado: a CONTAGEM continua tendo
  // uma fonte só (Onda 2), só o DESTINO do link passa a depender de qual
  // fonte transbordou.
  const alvoRodape = b.rodapeLink
    ? b.rodapeLink(url)
    : nomeDeN => link(`"+ "&(${nomeDeN}-${b.teto})&" não cabem aqui — abra ${ROTULO_NAV[b.aba]}"`);
  const rodape = linha4(`LET(n;${b.contagem};IF(n>${b.teto};${alvoRodape('n')};""))`);
  return `VSTACK(${titulo};${corpo};${rodape};${linha4('""')})`;
};

// Célula A1 do `Hoje`: aviso de sync (a CONSTANTE, não uma cópia da regra) +
// carimbo do radar. `IFERROR` na segunda metade porque, sem carimbo legível,
// `DATEVALUE` erra — e nesse caso quem fala é o próprio `AVISO_SYNC`, que tem
// ramo próprio pra "sem carimbo". Um veredito, uma fonte.
// O HUB FALA PELAS DUAS MAQUINAS (N1, agravante). Ele lia so o carimbo do
// radar de vaga: se o coletor de noticia morresse, o painel do dia seguia
// dizendo que estava tudo bem, e as 4 abas que dependem dele ficavam a um
// toque de distancia sem nada avisando aqui. Os dois avisos entram na mesma
// celula, o de vaga primeiro (e a maquina mais antiga e a que sustenta as
// contas de prazo abaixo); cada um se cala sozinho quando a sua maquina esta
// em dia, entao o caso comum continua sendo uma linha so.
const HOJE_VEREDITO = `=${AVISO_SYNC}&${AVISO_SYNC_NOTICIA}&IFERROR("🛰️ radar atualizado em "&TEXT(DATEVALUE(${CARIMBO});"dd/mm")`
  + `&" · "&COUNTA(${D}!$T$2:$T)&" oportunidades mapeadas";"")`;

/**
 * Todas as células do `Hoje`, prontas pra escrita. Recebe o id da planilha e
 * um mapa nome-de-aba -> sheetId (gid), os dois resolvidos em tempo de
 * construção — o gid NUNCA é literal (N-13).
 */
function hojeCelulas(idPlanilha, gidPorAba) {
  const url = aba => urlDaAba(idPlanilha, gidPorAba[aba]);
  const G = LINHAS[A.HOJE];
  const celulas = { [`A${G.veredito}`]: HOJE_VEREDITO };
  // ONDA UX 6 — a nav de `Hoje` SAIU daqui. `Hoje` agora está em `NAV`, como
  // qualquer outra aba, e quem escreve as células dela é `navCelulas` (a
  // MESMA função que escreve a nav das outras 12) — ver o laço genérico em
  // `construir.js` (`for (const aba of Object.keys(F.NAV)) ...`). Escrever
  // aqui de novo seria uma segunda fonte pra mesma linha.
  // C10 Parte 3 — N GRUPOS lado a lado (3, desde o conserto 0b), não um
  // `VSTACK` só. Cada grupo é
  // ancorado na MESMA linha (`G.lista`), em blocos de coluna disjuntos
  // (`hojeColunaBaseGrupo`). Território exclusivo por grupo — a regra dura
  // de spill (ver o bloco de comentário grande acima, "O PAINEL USA A
  // LARGURA").
  HOJE_GRUPOS_COLUNA.forEach((chaves, g) => {
    const blocos = chaves.map(chave => HOJE_BLOCOS.find(b => b.chave === chave));
    const col = colunaLetra(hojeColunaBaseGrupo(g));
    celulas[`${col}${G.lista}`] = `=VSTACK(${blocos.map(b => hojeBloco(b, url)).join(';')})`;
  });
  return celulas;
}

// ===========================================================================
// CAMADA NOTÍCIA — 4 vistas, QUATRO tabelas por aba lado a lado (Onda 8-9 + C10)
// ===========================================================================
//
// A FONTE. `notícias (não edite)` é o espelho de `data/noticias.jsonl`,
// escrito por `noticias.js sincronizar-sheets`. Ao contrário da trilha vaga,
// aqui NÃO existe `_calc`: o pipeline (`lib-noticias/`) já calculou cluster,
// `n_veiculos`, percentil e score contra o LOTE INTEIRO, em Node. Repetir
// essas contas em fórmula seria uma segunda implementação da mesma régua —
// e duas réguas divergem em silêncio. A fórmula aqui só FILTRA, ORDENA,
// CORTA e RENDERIZA; nenhuma decisão de mérito nasce nesta camada.
//
// O `quando` da aba de fato é NÚMERO SERIAL de data-hora, não string ISO, e
// isso é decisão medida contra um defeito já pago nesta planilha: o bloco
// 🆕 RADAR do `Hoje` teve que trocar `COUNTIFS` por `SUMPRODUCT` porque
// `data_publicacao` é texto ISO e `COUNTIFS(...;">="&texto)` devolve 0 em
// silêncio. Com número, `COUNTIFS`, `FILTER` e `SORT` comparam o que deviam,
// e `TEXT(x;"dd/mm")` rende a data no vocabulário da peça sem `DATEVALUE`.
//
// A ORDEM DAS COLUNAS DA ABA DE FATO vem de `noticias.js`, que é quem ESCREVE
// a aba — o mesmo arranjo de `lib/sheets.js COLUNAS`, que é lido daqui e não
// redeclarado. Uma lista, dois leitores: enquanto for assim, uma coluna nova
// não desloca fórmula nenhuma. Duas listas divergiriam por LETRA, em
// silêncio, que é a classe de defeito que a regra de manutenção de lá
// descreve.
const NOTICIA_FATO_CABECALHO = require(path.join(__dirname, '..', 'noticias')).FATO_CABECALHO;
/** Letra da coluna de um campo da aba de fato. Nunca literal — N-17. */
const nfLetra = rotulo => {
  const i = NOTICIA_FATO_CABECALHO.indexOf(rotulo);
  if (i < 0) throw new Error(`campo "${rotulo}" não existe em NOTICIA_FATO_CABECALHO`);
  return String.fromCharCode(65 + i);
};
/** Faixa ABSOLUTA e ABERTA de um campo da aba de fato (`'notícias (não edite)'!$D$2:$D`). */
const nfFaixa = rotulo => {
  const c = nfLetra(rotulo);
  return `${A.ND}!$${c}$${LINHAS[A.NOTICIAS_DADOS].dados}:$${c}`;
};

// A FAMILIA DE ALARME (aviso da trilha noticia, aviso das abas digitadas,
// a regra que pinta e o mapa de 12 abas) foi movida PRA CIMA, pro bloco
// do alarme em §"O GATILHO DEIXOU DE SER O GLIFO": `HOJE_VEREDITO` consome
// `AVISO_SYNC_NOTICIA` e `estadoVazioFormula` consome `AVISO_SYNC_PORTAL`,
// os dois ANTES deste ponto do arquivo. Const em TDZ nao perdoa ordem.


// -------- as QUATRO FAIXAS, do jeito que o pipeline já as define (Onda 8-9 + C10) --------
//
// Até a Onda 8-9 esta camada tinha UM seletor (célula digitável em `A3`) que
// trocava a lista inteira entre três critérios/janelas. JB pediu outra
// coisa: *"quero que as abas... mostrem até 20 notícias... dividido em
// tabelas de: top 20 dos últimos 3 dias, top 20 dos últimos 7 dias, top 20
// dos últimos 30 dias"* — TABELAS VISÍVEIS AO MESMO TEMPO, não uma trocada
// por toque (C9 do plano-mãe).
//
// C10 (2026-08-28, "Correção de JB, com ele presente") — não são três, são
// QUATRO, e a primeira não é "últimos 3 dias", é `hoje` (dia civil
// corrente). Ver `lib-noticias/ranking.js RECORTES`/`FAIXAS_CASCATA` pro
// contrato completo, incluindo o CONSERTO da exclusão cumulativa (agora por
// `cluster_id` E por url canônica).
//
// A cascata (exclusão cumulativa por `cluster_id`/url, colapso de
// duplicata, piso por tema, ordem por score) já está pronta em
// `lib-noticias/ranking.js calcularFaixasNoticia` (Onda 7-10 + C10 + decisão
// C2 do plano): ela grava `faixa` (`'hoje'|'7d'|'15d'|'30d'|''`) e `posicao`
// (1..20) em CADA registro da aba de fato. Esta camada NÃO recalcula nada
// disso — só FILTRA por igualdade (`faixa="hoje"`) e ORDENA por `posicao`,
// que já vem pronta.
//
// `NOTICIA_TETO` e `NOTICIA_FAIXAS` são IMPORTADOS de `lib-noticias/
// ranking.js`, nunca copiados: é o próprio C1 da Onda 8-9 (a guarda de
// `construir.js` estourando porque este arquivo tinha uma CÓPIA desatualizada
// de `RECORTES`) que ensina "nunca copiar o que dá pra importar". Duas
// constantes que só podem ser lidas do MESMO lugar não divergem por
// construção — não precisam de guarda pra ficar alinhadas.
const NOTICIA_RANKING = require(path.join(__dirname, '..', 'lib-noticias', 'ranking'));
const NOTICIA_STORE = require(path.join(__dirname, '..', 'lib-noticias', 'store-noticias'));

// 20, não 8 (JB pediu — Onda 8). Vale pras QUATRO janelas, `hoje` inclusa.
const NOTICIA_TETO = NOTICIA_RANKING.TETO_FAIXA_NOTICIA;

/**
 * Índice 0-based -> letra de coluna A1, com suporte a colunas ALÉM de Z
 * (AA, AB, ...) — N-17 generalizado. Precisa existir porque C10 Parte 2
 * (4 tabelas lado a lado) empurra as abas de notícia pra além de 26
 * colunas: `letraDe`/`nfLetra` (que fazem só `fromCharCode(65+i)`) estouram
 * em silêncio nesse território — devolvem um caractere de PONTUAÇÃO (`[`,
 * `\`, ...), não uma letra, sem erro nenhum.
 */
const colunaLetra = i => {
  let n = i + 1;
  let s = '';
  while (n > 0) {
    const resto = (n - 1) % 26;
    s = String.fromCharCode(65 + resto) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

// As quatro janelas, na ordem da cascata. `dias`/`diaCorrente` vêm de
// `ranking.js`; o RÓTULO (o texto que vira o TÍTULO de cada tabela) é
// resolvido mais abaixo, DEPOIS da idade do store — Onda 7 explica por quê.

// C7 — A IDADE DO STORE. O store de notícia NASCEU em 27/08 (`visto_
// primeiro_em` mínimo); a janela de 30 dias só fica completa por volta de
// 26/09. O estado vazio antigo ("a coleta desta fonte parou") seria MENTIRA
// numa tabela de 30d vazia por falta de HISTÓRICO, não por falta de coleta.
// `hoje` usa `janelaDias:1` — o dia civil é uma janela de 1 dia; se o store
// nasceu HOJE, a cobertura do próprio dia pode estar incompleta (só a
// partir do horário em que a primeira coleta rodou).
//
// `idadeDoStore` (`lib-noticias/store-noticias.js`) é chamada aqui, na carga
// do módulo — ou seja, toda vez que `construir.js`/`formatar.js`/
// `verificar.js` roda. É LEITURA PURA de `data/noticias.jsonl` (nunca
// escreve), e é o único jeito de saber a idade do store: `visto_primeiro_em`
// NÃO chega na aba de fato (`FATO_CABECALHO` só carrega `quando`, a data do
// ARTIGO — que inclui backlog anterior ao início da coleta, C7 já mediu
// isso) — por isso a idade não pode ser uma fórmula viva na planilha.
const NOTICIA_REGISTROS_STORE = NOTICIA_STORE.carregarTudo();
// `NOTICIA_AGORA_MS` — UM relógio, lido uma vez, pra idade do store E rótulo
// da janela (abaixo): dois `Date.now()` no mesmo módulo poderiam discordar
// por milissegundos na virada do dia — improvável, mas é o tipo de segunda
// fonte que esta casa não aceita quando a primeira já existe.
const NOTICIA_AGORA_MS = Date.now();
const NOTICIA_IDADE_POR_FAIXA = Object.fromEntries(
  NOTICIA_RANKING.FAIXAS_CASCATA.map(f => [
    f.faixa,
    NOTICIA_STORE.idadeDoStore(NOTICIA_REGISTROS_STORE, { agora: NOTICIA_AGORA_MS, janelaDias: f.diaCorrente ? 1 : f.dias })
  ])
);
/** `2026-09-26T...` -> `26/09`. A DATA calculada, nunca escrita à mão. */
const noticiaDataBR = iso => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
  return m ? `${m[3]}/${m[2]}` : '--/--';
};

// ===========================================================================
// ONDA UX 7 (remodelação 2026-09-01) — RÓTULO HONESTO TAMBÉM NA TABELA CHEIA
// ===========================================================================
//
// C7 (acima) já cobre o caso VAZIO: quando a janela não tem NADA, o terceiro
// estado ("🆕 o radar é novo — completa em DD/MM") avisa que o vazio é
// história curta, não coleta parada. O que C7 não cobria é o caso PERIGOSO,
// medido ao vivo (AVALIACAO-UX.md Parte 2 §9): com o store de ~14 dias, as
// tabelas de "top 20 · últimos 15 dias" e "…30 dias" mostravam CONTEÚDO —
// sempre o mesmo, porque as duas janelas têm o mesmo universo — sob um
// rótulo que promete profundidade que o dado não tem. Onde há volume, o
// estado vazio nunca dispara, e o rótulo mente sozinho.
//
// A cura: o rótulo declara os DIAS REAIS de cobertura (`agora − nascimento`,
// o MESMO número que já alimenta "completa em DD/MM") enquanto o store for
// mais novo que a janela nominal; assim que `idade.completa` vira `true`, o
// rótulo volta a dizer 15/30 — o dado já sustenta a promessa. Nunca duas
// contas pra uma verdade: é a mesma `idade` de C7, só lida num lugar novo.
//
// Função PURA (não literal-only), exportada — Onda 8 e Onda 10 abaixo põem
// texto derivado em célula por padrão parecido; aqui vira função só porque
// dias reais varia por EXECUÇÃO (o relógio), não por dado da planilha.
const noticiaRotuloJanela = (f, idade, agoraMs = NOTICIA_AGORA_MS) => {
  if (f.diaCorrente) return 'notícias de hoje';
  if (!idade || idade.completa || idade.nascimentoMs === null || idade.nascimentoMs === undefined) {
    return `top 20 · últimos ${f.dias} dias`;
  }
  const diasReais = Math.max(1, Math.floor((agoraMs - idade.nascimentoMs) / 86400000));
  return `top 20 · últimos ${diasReais} dias`;
};

const NOTICIA_FAIXAS = NOTICIA_RANKING.FAIXAS_CASCATA.map(f => ({
  codigo: f.faixa,
  dias: f.dias,
  diaCorrente: !!f.diaCorrente,
  rotulo: noticiaRotuloJanela(f, NOTICIA_IDADE_POR_FAIXA[f.faixa])
}));
const NOTICIA_TABELAS_POR_ABA = NOTICIA_FAIXAS.length; // 4 (C10) — usado por verificar.js e pelo log de construir.js
// Regex que casa o TÍTULO de uma das quatro tabelas (a regra condicional que
// pinta a banda em `formatar.js` casa isto contra a coluna `título`, uma vez
// por tabela). Derivado de `NOTICIA_FAIXAS`, nunca escrito duas vezes. Como o
// rótulo agora pode variar por EXECUÇÃO (Onda 7), o regex também varia —
// mas `formatar.js`/`construir.js`/`verificar.js` leem o MESMO `formulas.js`
// na mesma rodada, então o texto escrito e o padrão que o casa nascem
// idênticos sempre (mesmo relógio, mesmo `require`).
const NOTICIA_REGEX_TITULO = `^(${NOTICIA_FAIXAS.map(f => f.rotulo).join('|')})$`;

// ===========================================================================
// GEOMETRIA HORIZONTAL — C10 Parte 2: 4 TABELAS LADO A LADO, não empilhadas
// ===========================================================================
//
// JB, olhando a peça: *"eu quero 4 TABELAS, lado a LADO e não enfileirada.
// Olha o espaço em branco que todas as páginas ficam."* As quatro abas de
// notícia usavam 7 de 26 colunas — dois terços da tela em branco (medido,
// RELATORIO-ONDA-8-9.md era vertical: 3 tabelas empilhadas na MESMA coluna,
// alturas somadas). C10-b: JB escolheu **1×4 em linha**, sabendo do custo de
// rolagem horizontal no celular (perguntado, decisão dele — não 2×2).
//
// Cada tabela é o SEU PRÓPRIO bloco de colunas, todas ancoradas na MESMA
// linha (`LINHAS[aba].lista`) — ao contrário da Onda 8-9 (mesma coluna,
// linhas diferentes). `repercussão` SAI (JB mandou caçar redundância — o
// glifo 📣 já prefixa o título quando `n_veiculos>1`): a tabela cai de 7
// pra 6 colunas (5 visíveis + `_url` oculta).
const NOTICIA_CABECALHO_TABELA = ['Abrir', 'título', 'quando', 'veículo', 'tema', '_url'];
// ONDA UX 18 (Leva 4, remodelação 2026-09-01) — MEDIDO ao vivo (script
// isolado sobre `lib-noticias/store-noticias.js` + `ranking.js
// calcularFaixasNoticia`, a MESMA função que `noticias.js sincronizar-
// sheets` usa pra decidir `faixa`/`posicao` — nunca uma segunda conta):
// distribuição de `veículo` nas 4 abas × 4 janelas (16 combinações,
// restritas a `posicao<=NOTICIA_TETO`, ou seja, só o que de fato aparece
// na tela). Resultado na data da medição — `Ciência` (85% arXiv nas
// QUATRO janelas) é a ÚNICA que ultrapassa 80%; `Trabalho` (30-60%),
// `IA` (55-70%: perto mas não cruza) e `Notícias` (20-40%) NÃO cruzam
// hoje — o número "Trabalho 91%" do plano original (`radar-ux-20-
// ondas.md`, escrito 2026-08-28) já não bate: o store se move (o radar
// sincroniza ~3×/dia) e "medir primeiro" (Cláusula de Não-Deriva) vale
// pro dado do dia, não pro plano.
//
// A MESMA medição, repetida pra `tema` (a coluna vizinha, candidata a
// virar a substituta de `veículo` na dobra): em `Ciência` ela satura
// JUNTO (85% "artigos", correlacionado — o mesmo viés de fonte que a
// decisão D-A1..D-A8 já nomeou em D-A4, "Ciência-hoje 100% arXiv", e que
// Durin já declarou fora de escopo desta rodada por ser curadoria, não
// layout). Reordenar `veículo`/`tema` na dobra NÃO resolveria `Ciência`
// (as duas saturam igual) e PIORARIA `Notícias` (lá `tema` tem só 2
// valores — Brasil/Mundo — e satura mais que `veículo`, que tem uma dúzia
// de veículos distintos). Um redesenho por aba (geometria divergente pra
// só uma das quatro) exigiria tocar o gerador de fórmula inteiro que hoje
// é DELIBERADAMENTE compartilhado pelas quatro (ver o comentário grande
// "AS QUATRO VISTAS DE NOTÍCIA TÊM A MESMA GEOMETRIA", abaixo) — fora do
// orçamento seguro desta Leva.
//
// O MEIO escolhido, dentro do que a Cláusula de Não-Deriva já autoriza
// ("`veículo` pode encolher em vez de sair"): `veículo` ENCOLHE (104 ->
// 70 px, ~14 -> 10 caracteres truncados — `NOTICIA_TRUNC_VEICULO`, abaixo,
// deriva DAQUI, então a fórmula acompanha sozinha) e `tema` CRESCE na
// MESMA medida (112 -> 146 px) — largura total da tabela intocada (216 px
// nos dois), nas QUATRO abas por igual (a geometria continua uma só). Não
// resolve a saturação de `Ciência` (ela é do DADO, não do layout — a cura
// de dado é D-A4, fora do meu escopo); reduz o aluguel que a coluna paga
// nas quatro, e dá mais espaço ao campo que discrimina onde ele discrimina
// (`Trabalho`/`IA`/`Notícias`).
const NOTICIA_COLUNAS_TABELA = [56, 196, 66, 70, 146, null]; // veículo encolhe, tema cresce — mesma soma (Onda 18)
const NOTICIA_LARGURA_TABELA = NOTICIA_CABECALHO_TABELA.length; // 6
// Vão estreito entre tabelas — respiro visual, NÃO é coluna de máquina:
// rótulo vazio (visível, sem `_`) e largura curta, nunca `null`/oculta. A
// guarda de GEO×cabeçalho de `formatar.js` (largura `null` <-> rótulo `_`)
// exige que só `_url` seja oculta; o vão tem que ser o oposto disso.
const NOTICIA_VAO_LARGURA = 24;
const NOTICIA_VAO_ROTULO = '';
const NOTICIA_BLOCO_LARGURA = NOTICIA_LARGURA_TABELA + 1; // tabela + 1 vão (o vão da ÚLTIMA tabela nunca é escrito)

// O cabeçalho/largura da ABA INTEIRA: N tabelas × 6 colunas + (N-1) vãos.
// `4×6 + 3 = 27` — a grade de 26 colunas (padrão de toda aba nova) não cabe
// mais; `construir.js LARGURA` cresce as 4 abas de notícia pra 32 (folga,
// sem chegar perto do carimbo — que não mora nestas vistas, mora só na aba
// de FATO oculta `notícias (não edite)`, largura independente).
const NOTICIA_CABECALHO = NOTICIA_FAIXAS.flatMap((_, i) =>
  i < NOTICIA_FAIXAS.length - 1 ? [...NOTICIA_CABECALHO_TABELA, NOTICIA_VAO_ROTULO] : [...NOTICIA_CABECALHO_TABELA]
);
const NOTICIA_COLUNAS = NOTICIA_FAIXAS.flatMap((_, i) =>
  i < NOTICIA_FAIXAS.length - 1 ? [...NOTICIA_COLUNAS_TABELA, NOTICIA_VAO_LARGURA] : [...NOTICIA_COLUNAS_TABELA]
);

/** Índice 0-based da PRIMEIRA coluna do bloco da tabela `i` (0..N-1). */
const noticiaColunaBase = i => i * NOTICIA_BLOCO_LARGURA;
/** Índice 0-based de um rótulo DENTRO da tabela `i`. Nunca literal — N-17. */
const noticiaColuna0 = (i, rotulo) => {
  const j = NOTICIA_CABECALHO_TABELA.indexOf(rotulo);
  if (j < 0) throw new Error(`rótulo "${rotulo}" não existe em NOTICIA_CABECALHO_TABELA`);
  return noticiaColunaBase(i) + j;
};
/** Letra de coluna (com suporte a AA/AB/...) de um rótulo dentro da tabela `i`. */
const noticiaLetra = (i, rotulo) => colunaLetra(noticiaColuna0(i, rotulo));

// O sinal de repercussão dentro da dobra. Ele entra no PRÓPRIO TEXTO do
// título, na coluna crua, ANTES do filtro e da ordenação — não no rótulo de
// um `HYPERLINK` (limite L1) nem numa coluna à direita. C10 Parte 2 — a
// coluna `repercussão` SAIU (era a MESMA informação duas vezes: o glifo já
// diz "mais de um veículo"; o número extra não sobreviveu à caça à
// redundância que JB pediu).
const GLIFO_REPERCUSSAO = '📣';
// Mesma tipografia do painel (Arial 10 pt), mesma aproximação conservadora.
// A largura vem do cabeçalho POR TABELA (por RÓTULO, nunca por índice) — as
// quatro tabelas têm a MESMA largura de `veículo`, então basta uma leitura.
const NOTICIA_TRUNC_VEICULO = Math.floor(
  NOTICIA_COLUNAS_TABELA[NOTICIA_CABECALHO_TABELA.indexOf('veículo')] / HOJE_PX_POR_CHAR
);

// -------- os temas (Onda 9 — a antiga âncora de bloco vira COLUNA) --------
//
// Até a Onda 8-9, cada tema (BRASIL/MUNDO/IA_GERAL/...) era um BLOCO com
// título próprio, empilhado dentro do `VSTACK` da aba. C9 (radar-crm-20-
// ondas.md) forçou a mudança: com 20 por aba não há espaço pra 10
// cabeçalhos de seção. O tema vira uma COLUNA filtrável (funil, ver
// `formatar.js`) — o mapa de glifo é o MESMO, só o EMPREGO dele muda.
//
// Glifos EXCLUSIVOS: nenhum repete os de `HOJE_BLOCO_GLIFO` nem os de
// `ROTULO_NAV` nem o de repercussão. `FERRAMENTAS` saiu (Onda 8-9, item 4 do
// RELATORIO-ONDA-7-10.md §5): 0 fontes desde sempre, renderizava vazia pra
// sempre, e com tema em coluna ela teria que competir com `ia-geral`/
// `reddit-hn` pelas mesmas 20 vagas — duas razões independentes pra remover,
// nenhuma pra manter (ver também `fontes-noticias/index.js:49`, fora do meu
// escopo — reportado).
const NOTICIA_BLOCO_GLIFO = {
  BRASIL: '🧭', MUNDO: '🌎',
  IA_GERAL: '🧠', CLAUDE: '🔶', REDDIT_HN: '💬',
  MERCADO: '🧾', CONCURSOS: '📜',
  ARTIGOS: '🧪', ACADEMICO: '🏫'
};

// Qual aba da planilha corresponde a qual `aba` do pipeline
// (`fontes-noticias/index.js ABAS`). `construir.js` confere os dois lados:
// uma tabela que o pipeline coleta e que nenhuma aba mostra é dado coletado
// que ninguém vê — e isso não dá erro em lugar nenhum.
const NOTICIA_ABA_PIPELINE = {
  [A.NOTICIAS]: 'geral', [A.IA]: 'ia', [A.TRABALHO]: 'trabalho', [A.CIENCIA]: 'ciencia'
};

// A frase que diz o que a aba É — e, na `Trabalho`, o que ela NÃO é. O nome
// da aba sozinho não distingue "notícia sobre concurso" de "concurso pra
// prestar", e as duas coisas existem nesta planilha, em abas vizinhas.
const NOTICIA_SUBTITULO = {
  [A.NOTICIAS]: 'Brasil e mundo.',
  [A.IA]: 'Campo, Claude, Reddit e HN.',
  [A.TRABALHO]: `Notícia sobre trabalho e concurso, não é vaga: vaga e edital ficam em ${ROTULO_NAV[A.EMPREGOS]} e ${ROTULO_NAV[A.PAINEL]}.`,
  [A.CIENCIA]: 'Artigo científico e mundo acadêmico.'
};

// `chave`/`aba`/`tabela`/`assunto` — o que sobrou de `NOTICIA_BLOCOS` depois
// que `titulo` (o cabeçalho de seção) deixou de existir. Ainda serve pra
// DUAS coisas: (a) a guarda de cobertura de `construir.js` (todo par
// aba/tabela do pipeline tem tema, e vice-versa); (b) o rótulo da coluna
// `tema` (glifo + assunto).
const NOTICIA_TEMAS = [
  { chave: 'BRASIL', aba: A.NOTICIAS, tabela: 'brasil', assunto: 'Brasil' },
  { chave: 'MUNDO', aba: A.NOTICIAS, tabela: 'mundo', assunto: 'mundo' },
  { chave: 'IA_GERAL', aba: A.IA, tabela: 'ia-geral', assunto: 'IA' },
  // A tabela mais magra da peça, por construção: o roteamento pra cá é por
  // termo específico (`config/keywords-noticias.json`), nunca por termo
  // genérico de IA. Ficar rara no top 20 é o comportamento CERTO — e com o
  // funil da coluna `tema`, ela continua a um toque mesmo quando isso ocorre.
  { chave: 'CLAUDE', aba: A.IA, tabela: 'claude', assunto: 'Claude' },
  { chave: 'REDDIT_HN', aba: A.IA, tabela: 'reddit-hn', assunto: 'Reddit/HN' },
  { chave: 'MERCADO', aba: A.TRABALHO, tabela: 'mercado-trabalho', assunto: 'mercado de trabalho' },
  { chave: 'CONCURSOS', aba: A.TRABALHO, tabela: 'concursos', assunto: 'concurso público' },
  { chave: 'ARTIGOS', aba: A.CIENCIA, tabela: 'artigos', assunto: 'artigo científico' },
  { chave: 'ACADEMICO', aba: A.CIENCIA, tabela: 'academico', assunto: 'mundo acadêmico' }
];
const capitaliza = s => s.charAt(0).toUpperCase() + s.slice(1);
/** O rótulo que a coluna `tema` mostra: glifo + assunto, capitalizado. */
const NOTICIA_TEMA_LABEL = t => `${NOTICIA_BLOCO_GLIFO[t.chave]} ${capitaliza(t.assunto)}`;
/** Temas de UMA aba, na ordem declarada — usado só pela guarda de cobertura. */
const noticiaTemasDe = aba => NOTICIA_TEMAS.filter(t => t.aba === aba);

// ---- montagem da vista ----
const NOTICIA_COL_ABRIR = 'Abrir';
const NOTICIA_COL_LISTA = 'título';
const NOTICIA_COL_URL = '_url';
const NOTICIA_LARGURA_SPILL = NOTICIA_CABECALHO_TABELA.length - 1; // exclui `Abrir` (spill à parte) = 5
const linhaNot = expr => `HSTACK(${[expr, ...Array(NOTICIA_LARGURA_SPILL - 1).fill('""')].join(';')})`;

// A ALTURA MÁXIMA DE UMA TABELA: título(1) + corpo(até `NOTICIA_TETO`) +
// rodapé(1) — sem linha de respiro: C10 Parte 2 tira as tabelas da pilha
// vertical (onde o respiro separava uma tabela da próxima NA MESMA coluna) e
// põe cada uma no seu PRÓPRIO bloco de colunas, todas ancoradas na MESMA
// linha (`LINHAS[aba].lista`) — não há "próxima tabela abaixo" pra dar
// respiro. A altura real varia por tabela (quantos itens ela tem de
// verdade, até o teto); esta constante é o TETO da variação, usado só pra
// dimensionar funil/CF (que precisam de um alcance fixo, não do conteúdo do
// dia).
const NOTICIA_ALTURA_MAX_TABELA = NOTICIA_TETO + 2;
/** Última linha que qualquer uma das quatro tabelas de uma aba pode ocupar. */
const noticiaUltimaLinha = aba => LINHAS[aba].lista + NOTICIA_ALTURA_MAX_TABELA - 1;

/**
 * UMA tabela (uma das quatro faixas) de uma aba: título · corpo (até
 * `NOTICIA_TETO` linhas, já na ordem de `posicao`) · rodapé de transbordo.
 * `i` é o índice da tabela (0..3) — decide em QUAL BLOCO DE COLUNAS ela é
 * lida pelo chamador (`noticiaCelulas`); esta função só monta o TEXTO da
 * fórmula, que é column-agnostic (lê sempre da mesma aba de fato).
 *
 * A fórmula FILTRA por igualdade (`aba="geral"; faixa="hoje"`) e ORDENA por
 * `posicao` — nenhuma decisão de mérito nasce aqui (a cascata, o colapso de
 * cluster/url e o piso por tema já rodaram em Node,
 * `ranking.calcularFaixasNoticia`). `posicao` viaja como 6ª coluna de
 * serviço (o `ARRAY_CONSTRAIN` a descarta no fim) — mesma técnica que a
 * versão anterior usava pras chaves de `SORT`.
 */
const noticiaTabela = (aba, faixaInfo) => {
  const T = nfFaixa('titulo'), V = nfFaixa('veiculo'), L = nfFaixa('link');
  const Q = nfFaixa('quando'), TB = nfFaixa('tabela'), NV = nfFaixa('n_veiculos');
  const AB = nfFaixa('aba'), FX = nfFaixa('faixa'), P = nfFaixa('posicao');

  // `ISNUMBER(n)*(n>1)>0` e não `N(n)>1`: `N()` dentro de `LAMBDA` de `MAP`
  // com duas faixas devolve `#N/A` (limite medido nesta camada, Onda 7-10).
  //
  // ONDA UX 19 (Leva 4, remodelação 2026-09-01) — o limiar `n>1` (2+
  // veículos) deixou de ser o MESMO nas quatro abas. MEDIDO ao vivo (mesmo
  // script/fonte da Onda 18 — `calcularFaixasNoticia`, `posicao<=
  // NOTICIA_TETO`, distribuição do glifo 📣 por aba×janela): `Notícias`
  // acende em 100% das linhas nas quatro janelas (SATURADO — um marcador
  // que aparece em toda linha não marca nada); `IA` 5-40% (dentro da régua
  // "nenhum canal >70% nem <5%"); `Trabalho` 0-15% e `Ciência` 0-20%, os
  // dois já rente ao piso de 5% (a régua ANTIGA, `n>1`, já não estava
  // saturada nesses três — o defeito nomeado no plano original ("79%
  // Notícias, 0% Trabalho") só sobrevive, hoje, em `Notícias`).
  //
  // RESCALA TENTADA PRIMEIRO (a ordem que a Onda pede: reescala antes de
  // reverter): um limiar ÚNICO não resolve os dois lados ao mesmo tempo —
  // medido: subir pra `n>2` tira `Notícias` de 100% pra 40% (dentro da
  // régua), mas `Trabalho` NUNCA passa de 4% em nenhum limiar (77 de 80
  // itens da janela têm exatamente 1 veículo — concurso/vaga raramente sai
  // em mais de uma fonte; é propriedade do DADO, o mesmo tipo de viés que
  // D-A4 já nomeou pra `Ciência`/arXiv, não um defeito de layout) — subir o
  // limiar GLOBAL só pioraria `Trabalho`/`Ciência`, nunca ajudaria. A régua
  // final é POR ABA: `Notícias` sobe pra `n>2` (resolve o único lado
  // realmente saturado); as outras três continuam em `n>1` (já dentro da
  // régua, e não têm winrar de dado suficiente pra qualquer limiar maior
  // fazer diferença). RISCO DECLARADO no plano (`radar-ux-20-ondas.md`,
  // Onda 19): "se a régua reescalada não resolver, a coluna volta". Ela
  // RESOLVEU pra `Notícias` (100%->40%) — a coluna `repercussão` não
  // precisou voltar. `Trabalho`/`Ciência` ficam rente ao piso (4-5%) por
  // razão de DADO, não de mecanismo — reportado como recomendação, mesma
  // categoria de D-A4, não reaberto aqui.
  const NOTICIA_REPERCUSSAO_LIMIAR = { [A.NOTICIAS]: 2 };
  const limiarRepercussao = NOTICIA_REPERCUSSAO_LIMIAR[aba] || 1;
  const ehRepercutida = v => `ISNUMBER(${v})*(${v}>${limiarRepercussao})>0`;
  const colTitulo = `MAP(${T};${NV};LAMBDA(t;n;IF(t="";"";IF(${ehRepercutida('n')};"${GLIFO_REPERCUSSAO} "&t;t))))`;
  const colVeiculo = `MAP(${V};LAMBDA(x;IF(x="";"—";IF(LEN(x)>${NOTICIA_TRUNC_VEICULO};LEFT(x;${NOTICIA_TRUNC_VEICULO - 1})&"…";x))))`;
  // `hoje HH:MM` e `ontem` são o vocabulário de RECÊNCIA; `dd/mm` é o de
  // data.
  const colQuando = `MAP(${Q};LAMBDA(x;IF(NOT(ISNUMBER(x));"";IF(INT(x)=TODAY();"hoje "&TEXT(x;"HH:MM");IF(INT(x)=TODAY()-1;"ontem";TEXT(x;"dd/mm"))))))`;
  // Onda 9 — a coluna `tema`: lê `tabela` (fato) e traduz pelo mapa de
  // glifo. `IFS` derivado de `NOTICIA_TEMAS`, nunca escrito à mão — o `TRUE`
  // final devolve o valor cru se algum dia surgir uma `tabela` sem tema
  // mapeado (a guarda de cobertura de `construir.js` impede isso em
  // produção; aqui é só rede de segurança contra planilha desalinhada).
  const colTema = `MAP(${TB};LAMBDA(x;IFS(${NOTICIA_TEMAS.map(t => `x="${t.tabela}";"${NOTICIA_TEMA_LABEL(t)}"`).join(';')};TRUE;x)))`;
  // C10 Parte 2 — `colRep`/`repercussão` SAIU: era a MESMA informação que o
  // glifo 📣 já prefixa em `colTitulo`, mostrada duas vezes.

  const corpo = `ARRAY_CONSTRAIN(SORT(FILTER(HSTACK(${colTitulo};${colQuando};${colVeiculo};${colTema};${L};${P});`
    + `${T}<>"";${AB}="${NOTICIA_ABA_PIPELINE[aba]}";${FX}="${faixaInfo.codigo}");6;TRUE);${NOTICIA_TETO};${NOTICIA_LARGURA_SPILL})`;

  // C7 — terceiro estado vazio: "radar novo" (janela ainda incompleta) tem
  // prioridade sobre "coleta parou", porque nesse caso a coleta NÃO parou —
  // é o store que ainda não completou a janela. A DATA vem calculada
  // (`NOTICIA_IDADE_POR_FAIXA`), nunca escrita à mão.
  const idade = NOTICIA_IDADE_POR_FAIXA[faixaInfo.codigo];
  const vazio = idade.completa
    ? `"${MARCADOR_VAZIO}Nada nesta janela ainda. Se persistir, confira o aviso na linha ${LINHAS[aba].veredito}."`
    : `"${MARCADOR_VAZIO}🆕 O radar é novo — esta janela se completa em ${noticiaDataBR(idade.completaEmISO)}."`;

  // Transbordo HONESTO (achado do RELATORIO-ONDA-7-10.md §5 item 3): não dá
  // pra recalcular a cascata aqui — ela roda em Node, decisão C2 —, então
  // "sobra" não é "quantos ficaram de fora do top 20 por mérito", é
  // "quantas notícias desta aba existem nesta janela e NÃO estão nesta
  // tabela" (pode incluir item que a cascata mandou pra OUTRA faixa —
  // leitura honesta mesmo assim: "existe mais fora desta lista"). `hoje`
  // (C10) não tem `.dias` — a janela é o DIA CIVIL corrente, não um corte de
  // N dias atrás; a contagem usa `INT(quando)=TODAY()` em vez de
  // `quando>=TODAY()-dias`, mesmo vocabulário que `colQuando` já usa acima.
  const contagemJanela = faixaInfo.diaCorrente
    ? `COUNTIFS(${AB};"${NOTICIA_ABA_PIPELINE[aba]}";${Q};">="&TODAY();${Q};"<"&(TODAY()+1))`
    : `COUNTIFS(${AB};"${NOTICIA_ABA_PIPELINE[aba]}";${Q};">="&(TODAY()-${faixaInfo.dias}))`;
  const contagemTabela = `COUNTIFS(${AB};"${NOTICIA_ABA_PIPELINE[aba]}";${FX};"${faixaInfo.codigo}")`;
  // ONDA UX 2 (remodelação 2026-09-01) — DOIS conserto sobre a mesma linha,
  // achados lendo `Trabalho` ao vivo (AVALIACAO-UX.md Parte 2 §1): "⏳ O
  // radar é novo — esta janela se completa em 11/09." seguido, na linha de
  // baixo, de "+ 22 não estão nesta tabela" — a MESMA tabela dizendo "não
  // tenho nada" e "tenho 22 de sobra" ao mesmo tempo.
  //
  // (a) `sobra` subtraía `contagemTabela` CRU, sem o mesmo teto que `corpo`
  //     usa (`ARRAY_CONSTRAIN(...;NOTICIA_TETO;...)`) — se uma faixa tivesse
  //     mais de `NOTICIA_TETO` itens, `sobra` SUBESTIMAVA o que ficou de
  //     fora (contava como "mostrado" o que o `ARRAY_CONSTRAIN` já tinha
  //     cortado). `mostrados` agora é o MESMO teto que o corpo aplica —
  //     número deriva da mesma expressão que a lista.
  // (b) A CONTRADIÇÃO em si: `vazio` acende quando `corpo` (FILTER por
  //     `aba`+`faixa` exatos) não devolve NADA — ou porque o store é jovem
  //     demais (`idade.completa=false`), ou porque a cascata roteou tudo
  //     desta janela pra OUTRA faixa (nenhum item com `faixa=faixaInfo.
  //     codigo`, ainda que existam na janela mais larga). Nos dois casos
  //     `mostrados=0`, e dizer "+N não estão NESTA tabela" de uma tabela que
  //     já diz "não tenho nada" é gramaticalmente falso — "não estão" promete
  //     um excedente ALÉM do que já se vê, e não há o que já se vê. `sobra`
  //     só aparece quando `mostrados>0` (mesma régua do controle triplo do
  //     laudo: "lista vazia -> contador ausente").
  const mostrados = `MIN(${contagemTabela};${NOTICIA_TETO})`;
  const rodape = linhaNot(
    `LET(mostrados;${mostrados};sobra;MAX(0;${contagemJanela}-mostrados);`
    + `IF(AND(mostrados>0;sobra>0);"${MARCADOR_VAZIO}+ "&sobra&" não estão nesta tabela.";""))`
  );

  return `=VSTACK(${linhaNot(`"${faixaInfo.rotulo}"`)};IFERROR(${corpo};${linhaNot(vazio)});${rodape})`;
};

/**
 * A coluna `Abrir` de UMA tabela — o segundo spill do bloco de colunas
 * daquela tabela, ancorado na MESMA linha que o título e aberto pra baixo
 * (`${c}${l}:${c}`, sem fim). C10 Parte 2: cada tabela tem a SUA PRÓPRIA
 * coluna `Abrir` agora (antes, com as tabelas empilhadas na mesma coluna,
 * uma só cobria as três). Linha de título, de estado vazio e de transbordo
 * têm `_url` vazia, então esta coluna fica vazia nelas — o que faz a coluna
 * ler como uma calha de AÇÃO, e só.
 */
const noticiaAbrir = (aba, i) => {
  const c = noticiaLetra(i, NOTICIA_COL_URL), l = LINHAS[aba].lista;
  return `=ARRAYFORMULA(IF(${c}${l}:${c}="";"";HYPERLINK(${c}${l}:${c};"📄 abrir")))`;
};

/** Linha 2 — o veredito da aba: quantas notícias ocupam alguma das 4 tabelas. */
const noticiaVeredito = aba => {
  const FX = nfFaixa('faixa');
  const n = `COUNTIFS(${nfFaixa('aba')};"${NOTICIA_ABA_PIPELINE[aba]}";${FX};"<>")`;
  return `=${AVISO_SYNC_NOTICIA}&LET(n;${n};`
    + `IF(n=0;`
    + `"🔴 Nada nesta aba nas quatro janelas (hoje/7/15/30 dias). ${NOTICIA_SUBTITULO[aba]}";`
    + `"🟢 "&n&" notícia(s) nas quatro tabelas ao lado (até ${NOTICIA_TETO} por janela). ${NOTICIA_SUBTITULO[aba]}"))`;
};

/**
 * As células de uma vista de notícia: veredito + as QUATRO tabelas, lado a
 * lado — cada uma com sua PRÓPRIA coluna `Abrir` e seu PRÓPRIO spill de
 * `título`, todas ancoradas na MESMA linha (`LINHAS[aba].lista`), cada uma
 * no seu bloco de colunas (`noticiaColunaBase(i)`). C10 Parte 2: era um
 * `VSTACK` empilhado numa coluna só (Onda 8-9); agora é 4 blocos
 * horizontais independentes — "1×4 em linha", a decisão de JB (C10-b).
 */
function noticiaCelulas(aba) {
  const l = LINHAS[aba];
  const celulas = { [`A${l.veredito}`]: noticiaVeredito(aba) };
  NOTICIA_FAIXAS.forEach((faixaInfo, i) => {
    celulas[`${noticiaLetra(i, NOTICIA_COL_ABRIR)}${l.lista}`] = noticiaAbrir(aba, i);
    celulas[`${noticiaLetra(i, NOTICIA_COL_LISTA)}${l.lista}`] = noticiaTabela(aba, faixaInfo);
  });
  return celulas;
}

// ===========================================================================
// A NAV VAI NAS N PRIMEIRAS COLUNAS **VISÍVEIS** — não em A1:D1 fixo
// ===========================================================================
//
// DEFEITO QUE SÓ APARECEU OLHANDO A PEÇA. `Concursos!A1:D1` recebia os quatro
// `HYPERLINK` da barra, e as colunas C e D daquela aba eram `_url` e `_ordem`,
// OCULTAS. Renderizada, a aba mostrava DOIS links. Lendo o gerador, a nav
// tinha quatro; olhando a peça, tinha dois — e a metade que sumia era
// justamente `🎯 Fila` e `✍️ Tarefas`, os dois destinos de escrita, a partir
// de uma das três abas de chegada diária.
//
// A causa é literal: a barra foi escrita uniforme em A1:D1 sem perguntar se a
// coluna existe pro olho. E `verificar.js` não pegava, porque o invariante
// N-13 conferia se o `gid` é VÁLIDO — nunca se a CÉLULA É VISÍVEL. Um link
// perfeito dentro de uma coluna oculta passa em toda auditoria de leitura.
//
// A regra de visibilidade tem uma fonte só e ela é o próprio cabeçalho:
// rótulo que abre com `_` é coluna de máquina e é oculta. `formatar.js` guarda
// que as larguras `null` dele batem com esta regra — as duas cópias que
// existiam viram uma.
const PREFIXO_COLUNA_OCULTA = '_';
const CABECALHO_POR_ABA = {
  [A.PAINEL]: DOCENTE_CABECALHO,
  [A.TUDO]: DOCENTE_CABECALHO,
  [A.EMPREGOS]: MERCADO_CABECALHO,
  [A.FILA]: FILA_CABECALHO,
  [A.CANDIDATURAS]: CANDIDATURAS_CABECALHO,
  [A.PROJETOS]: PROJETOS_CABECALHO,
  [A.TAREFAS]: TAREFAS_CABECALHO,
  [A.DIARIO]: DIARIO_CABECALHO,
  [A.ETAPAS]: ETAPAS_CABECALHO,
  // As quatro vistas de notícia compartilham UM cabeçalho — elas têm a mesma
  // FORMA e mudam só o assunto (a mesma doutrina de "uma forma, duas
  // renderizações" que `Concursos`/`Concursos · tudo` seguem). Nenhuma coluna
  // começa com `_`: as quatro são visíveis, e a barra de nav de 4 slots cabe.
  [A.NOTICIAS]: NOTICIA_CABECALHO,
  [A.IA]: NOTICIA_CABECALHO,
  [A.TRABALHO]: NOTICIA_CABECALHO,
  [A.CIENCIA]: NOTICIA_CABECALHO
};
/** Índices (0-based) das colunas que o olho alcança, na ordem. */
const colunasVisiveis = aba => {
  const cab = CABECALHO_POR_ABA[aba];
  // `Hoje` não tem cabeçalho de coluna — a geometria dela mora em
  // `HOJE_COLUNAS_ABA` (4 grupos × 4 colunas + 3 vãos de 28 px, C10 Parte 3).
  // ONDA UX 6 — a nav de `Hoje` passou a precisar de 13 slots (12 destinos +
  // marcador), e os 4 índices de `HOJE_COLUNAS` (um grupo só) não bastam mais.
  // Os VÃOS não são coluna "oculta" (largura null) — são coluna VISÍVEL e
  // ESTREITA (28 px), território de respiro entre grupos, nunca de conteúdo
  // (a regra dura de spill, ver `HOJE_BLOCOS`/`hojeColunaBaseGrupo`). Um link
  // de nav caindo ali renderizaria cortado a quase nada. `colunasVisiveis`
  // aqui pula os vãos com o mesmo critério que pula coluna `_oculta` nas
  // abas de tabela: "esta coluna não é onde nav pousa" — só que por
  // GEOMETRIA (posição relativa ao grupo), não por prefixo de rótulo.
  if (!cab) {
    return HOJE_COLUNAS_ABA
      .map((_, i) => i)
      .filter(i => i % HOJE_GRUPO_PASSO !== HOJE_GRUPO_LARGURA);
  }
  return cab.map((rotulo, i) => [rotulo, i])
    .filter(([rotulo]) => !String(rotulo).startsWith(PREFIXO_COLUNA_OCULTA))
    .map(([, i]) => i);
};
/** Referência A1 da j-ésima célula de nav de uma aba (pulando as ocultas). */
const celulaNav = (aba, j, linha) => {
  const visiveis = colunasVisiveis(aba);
  if (j >= visiveis.length) {
    throw new Error(`a nav de ${aba} pede ${j + 1} slot(s) e a aba tem só ${visiveis.length} coluna(s) VISÍVEL(EIS)`);
  }
  return `${String.fromCharCode(65 + visiveis[j])}${linha}`;
};

// ONDA 18 — A ABA ATUAL SE MARCA. Até aqui a barra de nav só dizia PRA ONDE
// ir, nunca ONDE JB está — essa resposta morava no rodapé do navegador (a
// tira de abas do próprio Sheets), que é exatamente o que o briefing pede
// pra não depender. `navAqui` é texto PLANO (nunca `HYPERLINK` — não existe
// link pra onde já se está, mesma lei que já vale pra `NAV`), sempre a
// ÚLTIMA célula da barra — depois de todos os destinos, nunca embaralhado
// entre eles, pra não deslocar nenhuma posição que `verificar.js`/testes já
// conferem contra `NAV[aba]`. `formatar.js` pinta essa célula com um estilo
// que NENHUM destino usa (bloco cheio, não sublinhado) — a diferença visual
// É o "você está aqui", o texto sozinho não bastaria.
const navAqui = aba => `📍 ${ROTULO_NAV[aba]}`;

// ===========================================================================
// V2 (Leva 6, remodelação 2026-09-01) — NAV EM COLUNA ESTREITA CORTA A PALAVRA
// ===========================================================================
//
// A barra pousa cada destino na N-ésima coluna VISÍVEL da aba HOSPEDEIRA
// (`colunasVisiveis(aba)[j]`) — uma largura pensada pro DADO daquela aba
// (uma data de prazo, o esforço P/M/G, o vão de respiro entre tabelas de
// notícia), nunca pro RÓTULO do destino que vai pousar ali. Onde o rótulo
// não cabe, `CLIP` (a regra de toda a nav — nunca `OVERFLOW_CELL`, ver o
// bloco de comentário grande em `T4_NAV`/`formatar.js`) corta no meio da
// palavra: medido ao vivo na chapa desta Leva, "✍️ Tarefas" virou "Tar" em
// `Projetos!B1` (40 px) e "🗂️ Candidaturas" virou "Candidatur" em
// `Projetos!H1` (78 px).
//
// A CURA é a mesma "abreviação DESENHADA" que o resto da peça já usa pra
// hierarquia (tamanho/peso/cor, nunca cortar string): onde o rótulo completo
// NÃO CABE, o link usa só o EMOJI — a afordância de link não muda (cor +
// sublinhado, nunca o emoji), e o emoji já é ÚNICO por aba em toda a peça
// (`ROTULO_NAV`), então o link continua navegável e reconhecível. Nunca um
// corte de palavra a meio caminho.
//
// A largura do rótulo é ESTIMADA — não há lib de métrica de fonte aqui, e a
// nav usa Arial 9 (a mesma família/peso do resto da peça). Calibrado contra
// o corte medido acima ("Tar" em 40 px = a Arial 9 regular gasta uns 6-7 px
// por caractere latino nesse corpo): ~6,2 px/caractere latino, ~13 px por
// glifo de emoji, ~3 px por espaço. A margem de segurança (8 px) faz a
// estimativa errar SEMPRE pro lado seguro — emoji-só onde o texto quase
// cabe, nunca "cabe" quando na verdade corta.
const NAV_MARGEM_SEGURANCA_PX = 8;
const larguraNavEstimada = rotulo => Array.from(rotulo).reduce((w, ch) => {
  if (ch === ' ') return w + 3;
  return w + (ch.codePointAt(0) > 0x2000 ? 13 : 6.2);
}, 0);
// O rótulo sempre é "<emoji(s)> <texto>" (ver `ROTULO_NAV`) — o primeiro
// token é o emoji sozinho, e nenhum dos emoji usados contém espaço interno.
const emojiDoRotulo = rotulo => rotulo.split(' ')[0];
/**
 * O texto que o link de nav usa NESTE slot, dada a largura REAL (px) da
 * coluna onde ele pousa. A largura vem de `GEO` (`formatar.js`) — não
 * duplicada aqui (uma fonte só de largura de coluna, mesma lei do resto do
 * arquivo); quem não informa largura (`undefined`) recebe o rótulo cheio, o
 * comportamento de sempre.
 */
const rotuloNavParaSlot = (destino, larguraColunaPx) => {
  const cheio = ROTULO_NAV[destino];
  if (larguraColunaPx === undefined || larguraNavEstimada(cheio) + NAV_MARGEM_SEGURANCA_PX <= larguraColunaPx) return cheio;
  return emojiDoRotulo(cheio);
};

/**
 * Células de navegação de uma aba que não seja o `Hoje` (uma linha, N
 * colunas). `larguraDeColuna`, se informado, é `(índiceDeColuna) => px` —
 * quem chama (hoje só `construir.js`, via `GEO` de `formatar.js`) decide se
 * sabe a largura real; sem ela, todo slot recebe o rótulo cheio.
 */
function navCelulas(aba, idPlanilha, gidPorAba, larguraDeColuna) {
  const celulas = {};
  const visiveis = colunasVisiveis(aba);
  (NAV[aba] || []).forEach((destino, j) => {
    const px = larguraDeColuna ? larguraDeColuna(visiveis[j]) : undefined;
    celulas[celulaNav(aba, j, LINHAS[aba].nav)] = linkDaAba(idPlanilha, gidPorAba[destino], rotuloNavParaSlot(destino, px));
  });
  // A marca "você está aqui" vai no slot seguinte ao último destino — nunca
  // ocupa um dos 4-5 slots de destino, sempre um a mais.
  celulas[celulaNav(aba, (NAV[aba] || []).length, LINHAS[aba].nav)] = navAqui(aba);
  return celulas;
}

module.exports = {
  CALC, CALC_CABECALHO, PAINEL, TUDO, JANELA, SIGLAS_COL,
  CALC_MERCADO, CALC_MERCADO_CABECALHO, EMPREGOS,
  SCORE_MINIMO, SCORE_FORTE,
  // Aviso de planilha desatualizada — exportados pros controles de
  // `_norman/verificar.js` e pra prova de `_norman/prova-carimbo.js`, que
  // precisam calcular em Node o mesmo veredito que a planilha calcula.
  LIMIAR_ATRASO_DIAS_UTEIS, FERIADOS_COL, AVISO_SYNC, CARIMBO,
  // O gatilho do alarme do robô parado — UMA constante, escrita pela fórmula e
  // casada pela regra condicional. Ver o bloco de comentário em GLIFO_ALARME.
  GLIFO_ALARME, ALARME_RAMOS,
  // O alarme deixou de ser casado por GLIFO: a regra le o ESTADO (o atraso em
  // dias) pelos MESMOS builders que escrevem o texto. Ver o bloco de
  // comentario em §"O GATILHO DEIXOU DE SER O GLIFO".
  ALARME_SEM_CARIMBO, alarmeCd, alarmeAtrasoUteis, alarmeAtrasoCorridos, alarmeAceso,
  NOMES_LET, PARECE_CELULA,
  ALARME_ACESO_VAGA, ALARME_ACESO_NOTICIA, ALARME_TERMO, alarmeCF, ALARME_ABAS, alarmeLinha,
  AVISO_SYNC_PORTAL, ALARME_RAMOS_PORTAL,
  // Código de estado numérico: o que as regras de esmaecimento casam no lugar
  // do emoji. Ver o bloco de comentário em ORDEM_FATOR.
  ORDEM_FATOR, TIER_FORA_DO_ALCANCE, TIER_ENCERRADO, BALDE_ARQUIVO, REGRA_RECUO,
  // Forma da trilha docente (uma só, duas renderizações) e da de mercado.
  DOCENTE_CABECALHO, DOCENTE_FACETAS, MERCADO_CABECALHO, MERCADO_FACETAS, letraDe,
  // C1 (Leva 5) — tier líquido de descarte, exportado pra `verificar.js`/testes
  // conferirem a mesma conta que o veredito usa.
  TL, descartadosPorTier,
  // Geometria de linha e navegação — ver N-17 e N-13.
  LINHAS, CROMO_CHAVES, ultimoCromo, NAV, ROTULO_NAV, urlDaAba, linkDaAba, navCelulas, navAqui,
  CABECALHO_POR_ABA, PREFIXO_COLUNA_OCULTA, colunasVisiveis, celulaNav,
  // V2 (Leva 6) — nav em coluna estreita usa só o emoji; exportado pra
  // `construir.js` (escreve) e `verificar.js` (confere a MESMA decisão).
  rotuloNavParaSlot, larguraNavEstimada, emojiDoRotulo, NAV_MARGEM_SEGURANCA_PX,
  // Camada CRM — ver bloco de comentário acima.
  QUEM_AGE, MARCADOR_VAZIO,
  FILA_CABECALHO, FILA_TRILHAS, FILA_ESTAGIOS, FILA_ESTAGIOS_FORA_DO_HOJE, FILA_ID_DERIVADO,
  FILA_OQUE_DERIVADO, FILA_TRILHA_DERIVADA, FILA_SLA_DIAS, FILA_PARADA_HA, FILA_ROTULO_COLUNA_LINK,
  // C3 — juízo de JB, mesmo vocabulário em `Fila!⭐`/`Candidaturas!⭐`.
  PRIORIDADE_JB,
  CANDIDATURAS_CABECALHO, CANDIDATURAS_ESTAGIOS, CANDIDATURAS_ESTAGIOS_GLIFO, CANDIDATURAS_FORA_DO_RADAR,
  MIGRACAO_ESTAGIO_LEGADO, CANDIDATURAS_FUNIL_TEXTO,
  CANDIDATURAS_LIMIAR_AGUARDANDO_DIAS, CANDIDATURAS_LARGURA_SPILL,
  CANDIDATURAS_FORMULA, CANDIDATURAS_VEREDITO,
  CANDIDATURAS_COL_URL_LETRA, CANDIDATURAS_COL_AGUARDANDO_LETRA,
  PROJETOS_CABECALHO, PROJETOS_ESTAGIOS, PROJETOS_CAPACIDADE,
  PROJETOS_PRIMEIRA_LINHA, PROJETOS_ULTIMA_LINHA, PROJETOS_RANGE_NOME,
  PROJETOS_ULTIMA_MOVIMENTACAO, PROJETOS_TAREFAS_ABERTAS,
  // Onda UX 10 — os dois textos de ausência de `movimentou` e o aviso
  // agregado derivado deles (mesma fonte que a nota da coluna e o painel).
  PROJETOS_MOVIMENTOU_NUNCA, PROJETOS_MOVIMENTOU_ORFAO, PROJETOS_AVISO_DIARIO_ORFAO,
  PROJETOS_PROXIMAS_TAREFAS, PROJETOS_ULTIMAS_MOVIMENTACOES, PROJETOS_CALCULADAS,
  PROJETOS_BLOCOS_CALCULADOS,
  PROJETOS_ETAPA_ATUAL, PROJETOS_PROGRESSO, PROJETOS_SAUDE, PROJETOS_SAUDE_PARADO_DIAS_UTEIS,
  // Onda UX 10 + D-A1 — espelho puro pra prova local (sem escrever na
  // planilha viva).
  projetosSaudeMirror,
  ETAPAS_CABECALHO, ETAPAS_ESTADOS,
  TAREFAS_CABECALHO, TAREFAS_ESTAGIOS, TAREFAS_ESFORCOS, TAREFAS_RECORRENTES,
  DIARIO_CABECALHO, DIARIO_ROTULO_SOBRE, DIARIO_QUEM, DIARIO_SOBRE_LIVRE, DIARIO_CONTEXTO_RESPOSTA,
  ESTADO_VAZIO_DIGITADAS, estadoVazioFormula,
  HOJE_JANELA_RADAR_DIAS, HOJE_JANELA_NOTICIA_DIAS, HOJE_COLUNAS, HOJE_PX_POR_CHAR, hojeTeto,
  HOJE_TETO_TAREFAS, HOJE_TETO_FILA, HOJE_TETO_PROJETOS, HOJE_TETO_DIARIO, HOJE_TETO_RADAR,
  HOJE_TETO_PULSO, HOJE_JANELA_PULSO_DIAS,
  HOJE_BLOCOS, HOJE_TETOS, HOJE_BLOCO_GLIFO, HOJE_REGEX_TITULO, hojeVenceEditalRotulo,
  // C10 Parte 3 — o painel usa a largura. Ver o bloco de comentário grande
  // "O PAINEL USA A LARGURA" acima.
  HOJE_GRUPOS_COLUNA, HOJE_GRUPO_LARGURA, HOJE_VAO_LARGURA, HOJE_GRUPO_PASSO,
  hojeColunaBaseGrupo, HOJE_COLUNAS_ABA, HOJE_WRAP_ABA, hojeUltimaLinha,
  HOJE_VEREDITO, hojeCelulas,
  // Camada notícia — ver o bloco de comentário acima. `NOTICIA_FATO_CABECALHO`
  // é consumido por `noticias.js sincronizar-sheets` (o produtor da aba de
  // fato): produtor e consumidor leem a MESMA lista de colunas.
  NOTICIA_FATO_CABECALHO, nfLetra, nfFaixa,
  LIMIAR_ATRASO_NOTICIA_DIAS, CARIMBO_NOTICIA, AVISO_SYNC_NOTICIA, ALARME_RAMOS_NOTICIA,
  // Onda 8-9 + C10 — quatro tabelas por aba, lado a lado (C10 Parte 2), tema
  // em coluna. Ver o bloco de comentário "-------- as QUATRO FAIXAS ... ----"
  // e "GEOMETRIA HORIZONTAL" acima.
  NOTICIA_TETO, NOTICIA_FAIXAS, NOTICIA_TABELAS_POR_ABA, NOTICIA_REGEX_TITULO,
  NOTICIA_IDADE_POR_FAIXA, noticiaDataBR, colunaLetra,
  // Onda UX 7 — rótulo honesto da janela, função pura (prova local em
  // tests/onda-ux-7-*.test.js, sem precisar do store real).
  noticiaRotuloJanela, NOTICIA_AGORA_MS,
  NOTICIA_CABECALHO_TABELA, NOTICIA_COLUNAS_TABELA, NOTICIA_LARGURA_TABELA,
  NOTICIA_VAO_LARGURA, NOTICIA_VAO_ROTULO, NOTICIA_BLOCO_LARGURA,
  noticiaColunaBase, noticiaColuna0, noticiaLetra,
  NOTICIA_COLUNAS, NOTICIA_CABECALHO, NOTICIA_TRUNC_VEICULO, GLIFO_REPERCUSSAO,
  NOTICIA_COL_ABRIR, NOTICIA_COL_LISTA, NOTICIA_COL_URL, NOTICIA_LARGURA_SPILL, noticiaAbrir,
  NOTICIA_BLOCO_GLIFO, NOTICIA_TEMAS, NOTICIA_TEMA_LABEL, noticiaTemasDe, NOTICIA_ABA_PIPELINE,
  NOTICIA_SUBTITULO, NOTICIA_ALTURA_MAX_TABELA, noticiaUltimaLinha,
  noticiaTabela, noticiaVeredito, noticiaCelulas
};
