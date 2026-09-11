'use strict';
const path = require('path');
const a = require('./api');
const F = require('./formulas');
const S = require('./siglas');
const FERIADOS = require('./feriados');
const A = require('./abas');
// N4 - O REQUIRE E A PRIMEIRA GUARDA. `notas.js` resolve a coluna de cada
// nota pelo ROTULO do cabecalho (`noCabecalho`) e ESTOURA no load quando o
// rotulo nao existe. Enquanto `construir.js` nao importava este arquivo, esse
// estouro so acontecia dentro de `formatar.js` - depois de a planilha ja ter
// sido reescrita. Importar aqui poe a falha ANTES de qualquer escrita, que e
// onde toda guarda desta casa mora.
const N = require('./notas');
// Onda 3 — a memória do check "Inscrito". `EST` só expõe funções PURAS
// (nenhuma toca rede); o que fala com a API mora aqui mesmo, em
// `passoColher`/`passoRestaurar`, que recebem `api` por injeção — ver o
// bloco de comentário grande em `_norman/estado.js`.
const EST = require('./estado');
const SHEETS = require(path.join(__dirname, '..', 'lib', 'sheets'));
// O PIPELINE DE NOTÍCIA, importado só pra ser CONFERIDO. A camada de
// apresentação não decide o que é uma tabela válida por aba — quem decide é
// `fontes-noticias/index.js`. Importar em vez de recopiar é o que impede a
// planilha e a linha de comando de darem respostas diferentes pra mesma
// pergunta (guarda 5b, abaixo). `lib-noticias/ranking.js` não precisa mais
// ser importado AQUI: `_norman/formulas.js` já o importa direto e deriva
// `NOTICIA_FAIXAS`/`NOTICIA_TETO` de lá — duas leituras da mesma fonte não
// divergem por construção (ver guarda 5a, abaixo, que por isso foi extinta).
const NOTICIA_FONTES = require(path.join(__dirname, '..', 'fontes-noticias'));
const R = A.ref; // nome -> referência A1 (aspas quando o nome tem espaço/parêntese)

// `dados (não edite)`/`_calc`/`Concursos`/`Tudo`/`Empregos` continuam do jeito
// que sempre foram: espelho e cache, seguros pra recriar do zero. As cinco
// abas abaixo são a CAMADA CRM (briefing "refaça nos padrões do norman") —
// `1000` linhas basta (não crescem por sync automático, crescem por JB/Durin
// digitando), ao contrário de `dados (não edite)`/`_calc` acima.
// As quatro VISTAS de notícia entram com 1000 como as do CRM: a altura delas
// é a do conteúdo do `VSTACK` (4 tabelas × ~11 linhas no pior caso), não a do
// store. Quem espelha o store é a aba de FATO, e ela entra com 5000 pelo
// mesmo motivo que `dados (não edite)`: `values.update` numa faixa maior que
// a grade ERRA, e quem quebraria é o sync, sozinho. O sync ajusta a grade
// sozinho a cada rodada (ver `noticias.js`) — 5000 aqui é só o ponto de
// partida pra que a primeira sincronização não dependa de ninguém.
const ABAS_NOVAS = {
  [A.TUDO]: 5000, [A.CALC]: 5000, [A.EMPREGOS]: 5000,
  [A.HOJE]: 1000, [A.FILA]: 1000, [A.PROJETOS]: 1000, [A.TAREFAS]: 1000, [A.DIARIO]: 1000,
  // Onda 14 — `Etapas`, mesma folga que as outras digitadas do CRM.
  [A.ETAPAS]: 1000,
  // Onda 5 — `Candidaturas` cresce por upsert em `_estado` (uma linha por
  // url inscrita), nunca por sync automático: mesma folga das outras quatro
  // do CRM, não a de `dados`/`_calc`.
  [A.CANDIDATURAS]: 1000,
  [A.NOTICIAS]: 1000, [A.IA]: 1000, [A.TRABALHO]: 1000, [A.CIENCIA]: 1000,
  [A.NOTICIAS_DADOS]: 5000,
  // `_estado` (Onda 3) — mesma folga que `_calc`/`dados`: cresce por upsert
  // (uma linha por url já marcada alguma vez), nunca por sync automático.
  [A.ESTADO]: 5000
};

// Altura de grade por aba. `dados` entra aqui a partir da Onda 3 por um motivo
// concreto: o store pulou de 205 pra 564 registros de uma vez (+175%) e a aba
// nasceu com 1000 linhas. `values.update` numa faixa maior que a grade falha —
// não trunca em silêncio, ERRA — e quem quebraria é o sync diário, sozinho, de
// madrugada. 5000 é a mesma folga que as abas de leitura já têm.
//
// `notícias (não edite)` NÃO ENTRA AQUI, e é decisão de dono único, não
// esquecimento. A altura daquela aba é escrita pelo SYNC a cada rodada, pelo
// tamanho real do store (ver `noticias.js garantirAbaFato`), porque as
// fórmulas de leitura fazem `MAP` sobre intervalo ABERTO e o custo é
// proporcional à GRADE, não ao dado. Com a aba nesta tabela, `construir.js`
// re-inflava pra 5000 toda vez que rodava e desfazia o dimensionamento do
// sync — duas mãos na mesma propriedade, e a que sobrava era a errada. Pego
// em `_norman/estrutura.js`, que mostrou 5000 linhas logo depois de o sync
// ter deixado 1462.
//
// A grade inicial dela continua vindo de `ABAS_NOVAS` (5000), e isso não
// conflita: aquilo só vale na CRIAÇÃO, pra que a primeira sincronização não
// dependa de ninguém ter rodado nada antes.
const ALTURA = { [A.PAINEL]: 2000, [A.TUDO]: 5000, [A.CALC]: 5000, [A.EMPREGOS]: 5000, [A.DADOS]: 5000 };

// `_calc` precisa passar de Z: o bloco da trilha mercado vai até AK (coluna 37).
// C10 Parte 2 — as quatro vistas de notícia também precisam passar de Z: 4
// tabelas × 6 colunas + 3 vãos = 27 (`F.NOTICIA_CABECALHO.length`). 32 dá
// folga sem chegar perto do carimbo — que não mora nestas vistas (mora só na
// aba de fato oculta `notícias (não edite)`, dimensionada à parte pelo sync).
const LARGURA_NOTICIA = 32;
const LARGURA = Object.assign(
  { [A.CALC]: 45 },
  Object.fromEntries(A.VISTAS_NOTICIA.map(aba => [aba, LARGURA_NOTICIA]))
);

async function idsDasAbas() {
  const m = await a.meta();
  const mapa = {};
  // `merges` viaja junto com as properties de propósito: `construir.js` escreve
  // VALORES e precisa saber onde há mescla ANTES de escrever — ver a nota em
  // "desmesclar a linha de navegação", abaixo.
  m.sheets.forEach(s => { mapa[s.properties.title] = Object.assign({}, s.properties, { merges: s.merges || [] }); });
  return mapa;
}

// ===========================================================================
// ONDA 3 — OS TRÊS TEMPOS DO BUILD (`_estado`)
// ===========================================================================
// As duas funções abaixo recebem `api` POR PARÂMETRO — nunca leem o `a` do
// módulo diretamente — de propósito: é o que permite testar o modo de falha
// ("colher rejeita -> nada foi escrito") com um dublê, sem tocar rede.
// `main()`, mais abaixo, chama as duas passando o `a` de verdade.

/**
 * TEMPO 1 de 3 — COLHER. Ver o bloco de comentário grande em
 * `_norman/estado.js` pro desenho completo. Lê o check + a `_url` de
 * `Concursos`, `Concursos · tudo` (mesma forma da `Concursos` — ver "A FORMA
 * DA TRILHA DOCENTE" em `formulas.js`) e `Empregos`, nesta ordem — que é
 * também o desempate de `EST.colher` no caso raro e contraditório de a
 * mesma url aparecer com o check em estados diferentes em `Concursos` e em
 * `Concursos · tudo` (a última lida vence). Lê `_estado` atual, faz o
 * upsert (`EST.colher`) e regrava `_estado` SE alguma coisa mudou.
 *
 * Se qualquer leitura falhar, a promise REJEITA — não há try/catch aqui
 * nem em quem chama, então o erro propaga pra fora de `main()` e o
 * `limpar()` do passo seguinte nunca roda.
 */
async function passoColher(api) {
  const lP = F.LINHAS[A.PAINEL].lista, lE = F.LINHAS[A.EMPREGOS].lista;
  const cUrlD = F.letraDe(F.DOCENTE_CABECALHO, '_url'), cChkD = F.letraDe(F.DOCENTE_CABECALHO, 'Inscrito');
  const cUrlM = F.letraDe(F.MERCADO_CABECALHO, '_url'), cChkM = F.letraDe(F.MERCADO_CABECALHO, 'Inscrito');
  // C1 (Leva 5) — o check `❌`, MESMO mecanismo de `Inscrito` acima, mesma
  // faixa de leitura (uma coluna a mais, mesma altura).
  const cDescD = F.letraDe(F.DOCENTE_CABECALHO, '❌'), cDescM = F.letraDe(F.MERCADO_CABECALHO, '❌');
  // Onda 5 — os TRÊS campos digitados de `Candidaturas` (estágio · próximo
  // passo · notas), casados pela `_url` oculta (F). Mesmo mecanismo do
  // check `Inscrito` acima, um nível adiante: aqui não é "marcou/desmarcou",
  // é "o TEXTO mudou desde o último build". `1000` é a mesma folga que
  // `Fila!A` já usa pra ler antes de existir `ALTURA[A.CANDIDATURAS]`.
  const lC = F.LINHAS[A.CANDIDATURAS].lista;
  const cUrlC = F.CANDIDATURAS_COL_URL_LETRA;
  const cEstC = F.letraDe(F.CANDIDATURAS_CABECALHO, 'estágio');
  const cPpC = F.letraDe(F.CANDIDATURAS_CABECALHO, 'próximo passo');
  const cNotaC = F.letraDe(F.CANDIDATURAS_CABECALHO, 'notas');
  // C3/C4 (Leva 5) — `⭐` (prioridade) e `por quê` (pós-morte), MESMO
  // mecanismo dos três campos acima.
  const cPrioC = F.letraDe(F.CANDIDATURAS_CABECALHO, '⭐');
  const cPorqueC = F.letraDe(F.CANDIDATURAS_CABECALHO, 'por quê');
  // LEVA 7 — `link retomada`, MESMO mecanismo dos campos acima.
  const cLinkC = F.letraDe(F.CANDIDATURAS_CABECALHO, 'link retomada');

  // ACHADO AO VIVO (prova da Onda 3-4, fechada na Onda 8-9): `Concursos ·
  // tudo` NÃO entra mais como FONTE de captura. Ela entrava até aqui porque
  // "mostra o MESMO conjunto de editais" — mas ela é ESPELHO PURO
  // (`passoRestaurar` escreve nela, JB nunca abre — "consulta rara" já
  // documentado), então o valor que colher lia de lá era sempre o que O
  // PRÓPRIO BUILD tinha escrito no ciclo ANTERIOR, nunca uma decisão nova de
  // JB. Ler esse eco de volta como se fosse captura criava um looping: JB
  // desmarca em `Concursos`, mas `Concursos · tudo` só é atualizada por
  // `passoRestaurar` DEPOIS do colher deste MESMO build — então o colher via
  // o "true" velho do ciclo anterior e o tratava como uma segunda fonte
  // dizendo "ainda está marcado", cancelando o desmarque de JB. Medido ao
  // vivo: desmarcar em `Concursos` e reconstruir devolvia TRUE, porque
  // `Concursos · tudo` (nunca tocada) ainda carregava o TRUE do build
  // anterior. A fonte de captura agora é só onde JB de fato interage:
  // `Concursos` (docente) e `Empregos` (mercado). `passoRestaurar` continua
  // espelhando em `Concursos · tudo` — só o LADO DE LEITURA mudou.
  const [urlP, chkP, descP, urlE, chkE, descE, urlC, estC, ppC, notaC, prioC, porqueC, linkC, estadoBruto] = await api.lerVarios([
    `${R(A.PAINEL)}!${cUrlD}${lP}:${cUrlD}${ALTURA[A.PAINEL]}`,
    `${R(A.PAINEL)}!${cChkD}${lP}:${cChkD}${ALTURA[A.PAINEL]}`,
    `${R(A.PAINEL)}!${cDescD}${lP}:${cDescD}${ALTURA[A.PAINEL]}`,
    `${R(A.EMPREGOS)}!${cUrlM}${lE}:${cUrlM}${ALTURA[A.EMPREGOS]}`,
    `${R(A.EMPREGOS)}!${cChkM}${lE}:${cChkM}${ALTURA[A.EMPREGOS]}`,
    `${R(A.EMPREGOS)}!${cDescM}${lE}:${cDescM}${ALTURA[A.EMPREGOS]}`,
    `${R(A.CANDIDATURAS)}!${cUrlC}${lC}:${cUrlC}1000`,
    `${R(A.CANDIDATURAS)}!${cEstC}${lC}:${cEstC}1000`,
    `${R(A.CANDIDATURAS)}!${cPpC}${lC}:${cPpC}1000`,
    `${R(A.CANDIDATURAS)}!${cNotaC}${lC}:${cNotaC}1000`,
    `${R(A.CANDIDATURAS)}!${cPrioC}${lC}:${cPrioC}1000`,
    `${R(A.CANDIDATURAS)}!${cPorqueC}${lC}:${cPorqueC}1000`,
    // LEVA 7 — `link retomada`, mesma faixa/folga dos campos acima.
    `${R(A.CANDIDATURAS)}!${cLinkC}${lC}:${cLinkC}1000`,
    // LEVA 7 — `_estado` cresceu de 13 pra 14 colunas (A:N).
    `${R(A.ESTADO)}!A${F.LINHAS[A.ESTADO].dados}:N`
  ]);

  const capturasDe = (urls, chks, descs, trilha) => (urls || [])
    .map((linha, i) => ({
      url: String((linha || [])[0] || '').trim(),
      trilha,
      inscrito: String((((chks || [])[i] || [])[0]) || '').trim().toUpperCase() === 'TRUE',
      // C1 — mesma leitura tolerante de boolean que `inscrito` já usa.
      descartado: String((((descs || [])[i] || [])[0]) || '').trim().toUpperCase() === 'TRUE'
    }))
    .filter(c => c.url);

  const capturas = [
    ...capturasDe(urlP, chkP, descP, 'docente'),
    ...capturasDe(urlE, chkE, descE, 'mercado')
  ];

  // Onda 5 — capturas de `Candidaturas!G:L` (estágio · próximo passo ·
  // notas · ⭐ · por quê · link retomada — LEVA 5 acrescentou os dois do
  // meio, LEVA 7 acrescenta o último), casadas pela `_url` oculta (F). Só
  // faz sentido pra url que já existe como candidatura viva — se `colher`
  // (abaixo) não achar o registro, `colherCandidatura` ignora
  // silenciosamente (documentado no próprio `estado.js`): não há como
  // "criar" uma candidatura por aqui, só atualizar o que `_estado` já sabe.
  const capturasCand = (urlC || [])
    .map((linha, i) => ({
      url: String((linha || [])[0] || '').trim(),
      estagio: String(((estC || [])[i] || [])[0] || ''),
      proximoPasso: String(((ppC || [])[i] || [])[0] || ''),
      nota: String(((notaC || [])[i] || [])[0] || ''),
      prioridade: String(((prioC || [])[i] || [])[0] || ''),
      porQue: String(((porqueC || [])[i] || [])[0] || ''),
      linkRetomada: String(((linkC || [])[i] || [])[0] || '')
    }))
    .filter(c => c.url);

  const mapaBruto = EST.linhasParaMapa(estadoBruto);
  // C2 — migração de VALOR (nunca apaga): o `🟣 inscrito` legado de uma
  // candidatura real de JB vira `📨 inscrito` (mesmo posto no funil, glifo
  // novo) ANTES de qualquer upsert desta passada, pra que os passos
  // seguintes já enxerguem o vocabulário novo. Ver `_norman/estado.js
  // migrarEstagiosLegado`.
  const { mapa: mapaAtual, migrados: estagiosMigrados } = EST.migrarEstagiosLegado(mapaBruto, F.MIGRACAO_ESTAGIO_LEGADO);
  const agora = EST.isoLocal(new Date());
  const { mapa, alterados: alteradosInscrito } = EST.colher(mapaAtual, capturas, agora);
  const { mapa: mapaCand, alterados: alteradosCand } = EST.colherCandidatura(mapa, capturasCand, agora);

  // Onda 5 — candidatura NOVA (acabou de virar `inscrito=true` NESTA
  // passada, `estagio` ainda vazio) nasce no primeiro estágio do funil
  // (`F.CANDIDATURAS_ESTAGIOS[0]`, `📨 inscrito` desde a Leva 5 — era
  // `🟣 inscrito` até a Onda 5-6): é literalmente o que marcar "Inscrito" já
  // significa, e poupa JB de digitar o óbvio no instante em que a linha
  // aparece em `Candidaturas`. Só toca quem está `inscrito=true` e sem
  // `estagio` — uma candidatura que JB já tenha avançado (ou uma
  // reinscrição depois de "🔴 não passou") nunca é resetada por aqui.
  let defaultsEstagio = 0;
  for (const [url, r] of mapaCand) {
    if (r.inscrito && !r.estagio) {
      mapaCand.set(url, { ...r, estagio: F.CANDIDATURAS_ESTAGIOS[0], estagioQuando: r.estagioQuando || agora });
      defaultsEstagio++;
    }
  }

  const alterados = estagiosMigrados + alteradosInscrito + alteradosCand + defaultsEstagio;
  if (alterados > 0) {
    const linhas = EST.mapaParaLinhas(mapaCand);
    const lD = F.LINHAS[A.ESTADO].dados;
    // LEVA 5 — `_estado` cresceu de 9 pra 13 colunas (A:M — ❌/descartado
    // quando/⭐/por quê apendados no fim, ver `_norman/estado.js`). LEVA 7 —
    // cresceu de 13 pra 14 (A:N — `link_retomada` apendado).
    await api.escrever(`${R(A.ESTADO)}!A${lD}:N${lD + linhas.length - 1}`, linhas);
  }

  return { mapa: mapaCand, alterados, capturadas: capturas.length, capturadasCandidaturas: capturasCand.length };
}

/**
 * TEMPO 3 de 3 — RESTAURAR. Chamada DEPOIS que `main()` já reescreveu as
 * fórmulas (a ordem nova só existe depois do recálculo). Lê a `_url` já
 * renderizada e escreve DUAS colunas como VALORES, alinhadas a essa ordem,
 * nas três abas que compartilham a forma docente/mercado:
 *   - Inscrito    — o checkbox que JB vê e toca.
 *   - _por_quem   — oculta, espelho de `_estado.por quem` (item 4d:
 *     "eu marquei" x "o robô inscreveu"). Nunca é lida de volta por
 *     `passoColher` — é mirror puro, a fonte é sempre `_estado`.
 * `mapa` é o que `passoColher` devolveu NESTA MESMA execução — nunca uma
 * segunda leitura de `_estado`.
 */
async function passoRestaurar(api, mapa) {
  const lP = F.LINHAS[A.PAINEL].lista, lT = F.LINHAS[A.TUDO].lista, lE = F.LINHAS[A.EMPREGOS].lista;
  const cUrlD = F.letraDe(F.DOCENTE_CABECALHO, '_url'), cChkD = F.letraDe(F.DOCENTE_CABECALHO, 'Inscrito');
  const cUrlM = F.letraDe(F.MERCADO_CABECALHO, '_url'), cChkM = F.letraDe(F.MERCADO_CABECALHO, 'Inscrito');
  const cPqD = F.letraDe(F.DOCENTE_CABECALHO, '_por_quem'), cPqM = F.letraDe(F.MERCADO_CABECALHO, '_por_quem');
  // C1 (Leva 5) — `❌`, mesmo mecanismo de `Inscrito`/`_por_quem` acima.
  const cDescD = F.letraDe(F.DOCENTE_CABECALHO, '❌'), cDescM = F.letraDe(F.MERCADO_CABECALHO, '❌');
  // Onda 5 — `Candidaturas` já foi escrita nesta MESMA rodada de `main()`
  // (passo 12b, o spill A:F) ANTES deste `passoRestaurar` rodar — a ordem
  // nova de `_url` só existe depois do recálculo, mesma razão de sempre.
  const lC = F.LINHAS[A.CANDIDATURAS].lista;
  const cUrlC = F.CANDIDATURAS_COL_URL_LETRA;
  const cEstC = F.letraDe(F.CANDIDATURAS_CABECALHO, 'estágio');
  const cPpC = F.letraDe(F.CANDIDATURAS_CABECALHO, 'próximo passo');
  const cNotaC = F.letraDe(F.CANDIDATURAS_CABECALHO, 'notas');
  // C3/C4 (Leva 5) — `⭐`/`por quê`, mesmo mecanismo dos três campos acima.
  const cPrioC = F.letraDe(F.CANDIDATURAS_CABECALHO, '⭐');
  const cPorqueC = F.letraDe(F.CANDIDATURAS_CABECALHO, 'por quê');
  // LEVA 7 — `link retomada`, mesmo mecanismo dos campos acima.
  const cLinkC = F.letraDe(F.CANDIDATURAS_CABECALHO, 'link retomada');

  const [urlP, urlT, urlE, urlC] = await api.lerVarios([
    `${R(A.PAINEL)}!${cUrlD}${lP}:${cUrlD}${ALTURA[A.PAINEL]}`,
    `${R(A.TUDO)}!${cUrlD}${lT}:${cUrlD}${ALTURA[A.TUDO]}`,
    `${R(A.EMPREGOS)}!${cUrlM}${lE}:${cUrlM}${ALTURA[A.EMPREGOS]}`,
    `${R(A.CANDIDATURAS)}!${cUrlC}${lC}:${cUrlC}1000`
  ]);

  const urlsP = (urlP || []).map(l => (l || [])[0] || '');
  const urlsT = (urlT || []).map(l => (l || [])[0] || '');
  const urlsE = (urlE || []).map(l => (l || [])[0] || '');
  const urlsC = (urlC || []).map(l => (l || [])[0] || '');

  const valoresP = EST.restaurar(mapa, urlsP);
  const valoresT = EST.restaurar(mapa, urlsT);
  const valoresE = EST.restaurar(mapa, urlsE);
  const porQuemP = EST.porQuemNaOrdem(mapa, urlsP);
  const porQuemT = EST.porQuemNaOrdem(mapa, urlsT);
  const porQuemE = EST.porQuemNaOrdem(mapa, urlsE);
  // C1 — o `❌` irmão de `Inscrito`.
  const descarteP = EST.restaurarDescarte(mapa, urlsP);
  const descarteT = EST.restaurarDescarte(mapa, urlsT);
  const descarteE = EST.restaurarDescarte(mapa, urlsE);
  const camposCand = EST.candidaturaCamposNaOrdem(mapa, urlsC);

  // ACHADO AO VIVO (Onda 5) — quando `Candidaturas` ENCOLHE (de N linhas
  // vivas pra 0, o caso mais comum: JB desmarca a única candidatura), a
  // API `values.get` de um intervalo TOTALMENTE em branco devolve um
  // array VAZIO (linhas em branco no fim não vêm no JSON) — `urlC` fica
  // `[]`, `camposCand.*` também ficam `[]`, e `empilha` (abaixo) PULA a
  // escrita por `!valores.length`. Resultado: G:K ficam com o valor
  // ANTIGO (o estágio da candidatura que acabou de sumir), órfão numa
  // linha que a coluna A já mostra como vazia — o mesmo tipo de "lixo que
  // parece funcionamento" que o resto desta casa evita. `limpar()` a
  // faixa inteira ANTES de escrever garante que encolher também apaga.
  // LEVA 5 — a faixa cresceu de G:I pra G:K (⭐/por quê apendados). LEVA 7 —
  // cresceu de G:K pra G:L (`link retomada` apendado).
  await api.limpar(`${R(A.CANDIDATURAS)}!${cEstC}${lC}:${cLinkC}1000`);

  const pares = [];
  const empilha = (aba, col, linhaIni, valores) => {
    if (!valores.length) return;
    pares.push([`${R(aba)}!${col}${linhaIni}:${col}${linhaIni + valores.length - 1}`, valores.map(v => [v])]);
  };
  empilha(A.PAINEL, cChkD, lP, valoresP);
  empilha(A.TUDO, cChkD, lT, valoresT);
  empilha(A.EMPREGOS, cChkM, lE, valoresE);
  empilha(A.PAINEL, cPqD, lP, porQuemP);
  empilha(A.TUDO, cPqD, lT, porQuemT);
  empilha(A.EMPREGOS, cPqM, lE, porQuemE);
  empilha(A.PAINEL, cDescD, lP, descarteP);
  empilha(A.TUDO, cDescD, lT, descarteT);
  empilha(A.EMPREGOS, cDescM, lE, descarteE);
  empilha(A.CANDIDATURAS, cEstC, lC, camposCand.estagio);
  empilha(A.CANDIDATURAS, cPpC, lC, camposCand.proximoPasso);
  empilha(A.CANDIDATURAS, cNotaC, lC, camposCand.nota);
  empilha(A.CANDIDATURAS, cPrioC, lC, camposCand.prioridade);
  empilha(A.CANDIDATURAS, cPorqueC, lC, camposCand.porQue);
  empilha(A.CANDIDATURAS, cLinkC, lC, camposCand.linkRetomada);

  if (pares.length) await api.escreverVarios(pares);

  return {
    linhasPainel: valoresP.length, linhasTudo: valoresT.length, linhasEmpregos: valoresE.length,
    linhasCandidaturas: urlsC.filter(u => u).length
  };
}

async function main() {
  if (F.CALC_CABECALHO.length !== Object.keys(F.CALC).length) {
    throw new Error(`cabeçalho (${F.CALC_CABECALHO.length}) e fórmulas (${Object.keys(F.CALC).length}) da _calc divergem`);
  }

  // Guardas do bloco mercado. Existem porque a aba `Empregos` depende de três
  // números que estão escritos em lugares DIFERENTES e não têm como se
  // conferir sozinhos em runtime: o FILTER lê `_calc!AA2:AH` (8 colunas), o
  // SORT ordena pela 8ª, e o cabeçalho da aba tem 9 rótulos (Abrir + as 8).
  // Acrescentar uma coluna visível ao bloco sem mexer nos outros dois lugares
  // não daria erro nenhum: daria uma planilha com os rótulos deslocados uma
  // coluna, ordenada pela coluna errada — defeito que só aparece lendo a peça.
  // Aqui ele vira exceção antes de qualquer escrita.
  // Guarda de COLISÃO de tabelas dentro de `_calc`. Três blocos convivem numa
  // aba só: fórmulas docentes (A:R), siglas (V:W), feriados (Y) e mercado
  // (AA:AK). Duas tabelas na mesma coluna não dão erro nenhum — a segunda
  // escrita apaga a primeira e o VLOOKUP/NETWORKDAYS passa a consultar o dado
  // errado em silêncio. Aqui isso vira exceção antes de qualquer escrita.
  const ord = c => c.split('').reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0);
  const colSiglaFim = String.fromCharCode(F.SIGLAS_COL.charCodeAt(0) + 1);
  if (ord(F.FERIADOS_COL) <= ord(colSiglaFim)) {
    throw new Error(`coluna de feriados (${F.FERIADOS_COL}) colide com a tabela de siglas (${F.SIGLAS_COL}:${colSiglaFim}) na aba ${A.CALC}`);
  }
  if (ord(F.FERIADOS_COL) >= ord(Object.keys(F.CALC_MERCADO)[0])) {
    throw new Error(`coluna de feriados (${F.FERIADOS_COL}) invade o bloco mercado (começa em ${Object.keys(F.CALC_MERCADO)[0]}) na aba ${A.CALC}`);
  }

  const colsMercado = Object.keys(F.CALC_MERCADO);
  if (colsMercado.length !== Object.keys(F.CALC_MERCADO_CABECALHO).length) {
    throw new Error(`cabeçalho (${Object.keys(F.CALC_MERCADO_CABECALHO).length}) e fórmulas (${colsMercado.length}) do bloco mercado divergem`);
  }
  // Onda 3/4: o cabeçalho ganhou DUAS colunas fora do bloco do FILTER —
  // "Inscrito" (ver `_norman/estado.js`) e "_por_quem" (item 4d — espelho
  // de quem marcou), no mesmo regime de `link (copiar)`: nunca fazem parte
  // do `CHOOSECOLS`/`SORT`/`FILTER`, são escritas à parte por
  // `passoRestaurar`. C1 (Leva 5) acrescenta uma TERCEIRA, `❌`, no mesmo
  // regime — por isso o esperado é `visiveis.length + 5` ("Abrir" + o bloco
  // + "link (copiar)" + "Inscrito" + "_por_quem" + "❌"), não mais `+ 4`.
  const visiveis = colsMercado.slice(0, colsMercado.indexOf('AH') + 1);
  if (visiveis.length !== 8 || F.EMPREGOS.cabecalho.length !== visiveis.length + 5) {
    throw new Error(
      `bloco visível do mercado tem ${visiveis.length} coluna(s) (esperado 8: AA..AH) e o cabeçalho da Empregos tem ` +
      `${F.EMPREGOS.cabecalho.length} rótulo(s) (esperado ${visiveis.length + 5}: "Abrir" + o bloco + "link (copiar)" + "Inscrito" + "_por_quem" + "❌"). ` +
      'Se o bloco mudou de tamanho, atualize junto: F.EMPREGOS.lista (faixa do FILTER e índice do SORT), ' +
      'F.EMPREGOS.cabecalho (rótulos), F.EMPREGOS.abrir / F.EMPREGOS.linkCopiar (coluna de onde leem a _url) ' +
      'e as larguras em _norman/formatar.js.'
    );
  }
  if (!F.EMPREGOS.lista.includes(`_calc!${visiveis[0]}2:${visiveis[visiveis.length - 1]}`)) {
    throw new Error(`o FILTER da Empregos não lê _calc!${visiveis[0]}2:${visiveis[visiveis.length - 1]} — bloco e consumidor divergem`);
  }

  // Guardas da CAMADA CRM. Mesmo espírito das de cima: viram exceção ANTES de
  // qualquer escrita, não relatório depois.
  //
  // 1) cabeçalho vs contrato de coluna. `Fila`/`Projetos`/`Tarefas`/`Diário`
  //    não têm um bloco de fórmula-por-coluna pra comparar (são digitadas),
  //    mas TÊM um contrato de largura fixa: `formatar.js` aplica UMA largura
  //    por índice de coluna, e a validação/CF referencia coluna por LETRA
  //    (`$E2`, `$C:$C`...). Cabeçalho que encolhe ou cresce sem avisar
  //    desloca essas referências em silêncio — mesma classe de defeito que a
  //    guarda de `CALC_CABECALHO` já cobre pra `_calc`.
  // Onda 5 — `Candidaturas` entra aqui também: mistura spill (A:F) e
  // digitada (G:I), mas o CONTRATO DE LARGURA/POSIÇÃO é idêntico ao das
  // quatro puras — `formatar.js` também referencia coluna por letra ali.
  // Ondas 14-17 (CRM vivo) — `Fila` cresceu 11->12 (`parada há`), `Projetos`
  // 11->14 (`etapa atual`/`progresso`/`saúde`), `Tarefas` 7->10
  // (`esforço`/`bloqueada por`/`recorrente`), `Diário` 5->7 (`voz` no lugar
  // de `quem`, `responde a`/`contexto da resposta` apêndice), e `Etapas`
  // entra nova com 6.
  // LEVA 5 — `Fila` cresceu 12->13 (`⭐`, C3) e `Candidaturas` 9->11 (`⭐`/
  // `por quê`, C3/C4). LEVA 7 — `Candidaturas` cresceu 11->12 (`link
  // retomada`, apendado no fim, mesma doutrina).
  const COLUNAS_ESPERADAS = {
    [A.FILA]: 13, [A.PROJETOS]: 14, [A.TAREFAS]: 10, [A.DIARIO]: 7,
    [A.CANDIDATURAS]: 12, [A.ETAPAS]: 6
  };
  const CABECALHOS_CRM = {
    [A.FILA]: F.FILA_CABECALHO, [A.PROJETOS]: F.PROJETOS_CABECALHO,
    [A.TAREFAS]: F.TAREFAS_CABECALHO, [A.DIARIO]: F.DIARIO_CABECALHO,
    [A.CANDIDATURAS]: F.CANDIDATURAS_CABECALHO, [A.ETAPAS]: F.ETAPAS_CABECALHO
  };
  for (const [aba, cabecalho] of Object.entries(CABECALHOS_CRM)) {
    if (cabecalho.length !== COLUNAS_ESPERADAS[aba]) {
      throw new Error(
        `cabeçalho de ${aba} tem ${cabecalho.length} coluna(s), esperado ${COLUNAS_ESPERADAS[aba]} — ` +
        'larguras em _norman/formatar.js e validação/formatação condicional por letra de coluna ficariam desalinhadas com o cabeçalho real'
      );
    }
  }

  // 2) O bloco 📌 PROJETOS de `Hoje` (um dos cinco sub-blocos do VSTACK, em
  //    formulas.js) tem que usar a MESMA constante que o dropdown
  //    `ONE_OF_RANGE` de `Tarefas!B` (ver formatar.js) — senão o painel do
  //    dia e o dropdown podem, com o tempo, discordar sobre até onde vai a
  //    lista de projetos.
  const blocoProjetos = F.HOJE_BLOCOS.find(b => b.chave === 'PROJETOS');
  if (!blocoProjetos || !blocoProjetos.corpo.includes(F.PROJETOS_RANGE_NOME)) {
    throw new Error(`o bloco 📌 PROJETOS de ${A.HOJE} não referencia F.PROJETOS_RANGE_NOME (${F.PROJETOS_RANGE_NOME}) — divergiu do range que o dropdown de ${A.TAREFAS}!B usa`);
  }

  // 3) `Hoje!A1` tem que referenciar o carimbo pela CONSTANTE importada de
  //    `lib/sheets.js` (`CELULA_CARIMBO`), não por "Y1" escrito na mão em
  //    algum ponto da cadeia. Se a célula do carimbo mudar de lugar um dia
  //    e esta referência não acompanhar, o painel do dia passaria a ler uma
  //    célula errada — provavelmente vazia — e diria "radar sem carimbo"
  //    permanentemente, sem ninguém ligar o motivo à mudança em
  //    `lib/sheets.js`.
  const [, CARIMBO_COL_CHK, CARIMBO_LINHA_CHK] = SHEETS.CELULA_CARIMBO.match(/^([A-Za-z]+)(\d+)$/);
  if (!F.HOJE_VEREDITO.includes(`$${CARIMBO_COL_CHK}$${CARIMBO_LINHA_CHK}`)) {
    throw new Error(
      `${A.HOJE}!A1 não referencia ${A.DADOS}!${SHEETS.CELULA_CARIMBO} — CELULA_CARIMBO (lib/sheets.js) mudou e F.HOJE_VEREDITO (formulas.js) não acompanhou`
    );
  }
  // 3b) `Hoje!A1` tem que consumir a CONSTANTE `AVISO_SYNC`, não uma cópia da
  //     regra. Esta guarda existe porque a peça JÁ pagou o preço de ter duas
  //     cópias: a linha 1 do `Hoje` contava dias CORRIDOS e as abas de leitura
  //     contavam dias ÚTEIS, com o mesmo número 3. Uma segunda-feira perdida
  //     fazia o `Hoje` gritar "PARADO há 4 dias" enquanto a `Concursos` ficava
  //     muda — o portal se contradizendo entre duas abas, sem erro nenhum.
  if (!F.HOJE_VEREDITO.includes(F.AVISO_SYNC)) {
    throw new Error(
      `${A.HOJE}!A1 não consome a constante AVISO_SYNC — se alguém reescreveu a regra ali, ela vai divergir do que ` +
      `${A.PAINEL}/${A.EMPREGOS}/${A.TUDO} dizem sobre o MESMO sync. Uma fonte, um veredito.`
    );
  }

  // 4) A GUARDA DO BOMBA-RELÓGIO DE POSIÇÃO FIXA FOI APOSENTADA — e isso é
  //    ganho, não perda. Ela conferia, pra cada par de blocos consecutivos do
  //    `Hoje`, que o vão entre a fórmula de um e o título do próximo era maior
  //    que o teto do primeiro; existia porque cada bloco era um spill
  //    independente ancorado numa linha calculada, e um spill que crescesse
  //    além do vão fazia o Sheets recusar o array inteiro ("Resultado do array
  //    expandido não pôde ser expandido porque colidiria com dados") — foi
  //    assim que o bloco de Tarefas quebrou na 7ª tarefa sem prazo. Dentro de
  //    CADA GRUPO os blocos moram num `VSTACK` só (ver formulas.js),
  //    **colisão DENTRO de um grupo deixou de ser possível por construção**:
  //    não há título ocupando a linha seguinte pra colidir com coisa
  //    nenhuma. Estrutura no lugar de guarda — e o preço é a regra nova,
  //    dura: NADA pode ser escrito no território de spill de NENHUM grupo
  //    (`F.hojeColunaBaseGrupo(g)` .. `+F.HOJE_GRUPO_LARGURA`, abaixo do
  //    título de cada grupo).
  //
  //    C10 Parte 3 (redesenhada no conserto 0b desta rodada) — N territórios,
  //    não um: os grupos (`F.HOJE_GRUPOS_COLUNA`, hoje 3) são `VSTACK`s
  //    INDEPENDENTES, cada um no seu próprio bloco de colunas disjunto
  //    (`F.hojeColunaBaseGrupo`). A regra dura vale POR TERRITÓRIO: um spill
  //    que cresça demais só derruba o GRUPO em que mora — mas ainda derruba a
  //    aba INTEIRA se colidir com algo escrito no seu próprio território (a
  //    guarda 4a mais abaixo cobre o CROMO; abaixo do cromo, em todos os
  //    territórios, é área do spill e só do spill).
  //
  //    O que ENTRA no lugar são guardas do que a estrutura NOVA pode quebrar.
  //
  // 4a) `congelado` de cada aba tem que ser a ÚLTIMA linha de cromo dela, e a
  //     primeira linha de dado tem que ser a seguinte. A linha de navegação
  //     empurrou todo mundo pra baixo de uma vez; um congelamento esquecido
  //     faz a aba rolar por baixo do próprio cabeçalho, e uma linha sobrando
  //     entre cromo e dado abre um vão que ninguém nota — os dois sem erro.
  //     A lista de chaves de cromo saiu daqui e virou `F.CROMO_CHAVES`: a
  //     LIMPEZA DE NOTA de `formatar.js` (N4) precisa da mesma resposta pra
  //     "ate onde vai o cabecalho desta aba", e duas listas divergiriam no dia
  //     em que uma linha de cromo nova nascesse - sem erro nenhum.
  for (const [aba, l] of Object.entries(F.LINHAS)) {
    const ultimoCromo = F.ultimoCromo(aba);
    // ONDA UX 5 (remodelação 2026-09-01) — ÚNICA exceção declarada à regra
    // "congelado == última linha de cromo": as quatro abas de notícia
    // congelam 1 linha ALÉM do `cabecalho` genérico, pra cobrir o TÍTULO
    // específico de cada tabela — a primeira linha do bloco `lista`
    // (`noticiaTabela`: título · corpo · rodapé, uma VSTACK só; só a
    // primeira linha dela é rótulo, o resto é dado de verdade). Sem isso, o
    // que ficava preso na rolagem era só o genérico ("Abrir·título·quando·
    // veículo·tema", repetido 4×) e o único texto que desambigua as quatro
    // tabelas rolava pra fora — medido ao vivo, AVALIACAO-UX.md Parte 2 §10.
    // A exceção é NOMEADA (`A.VISTAS_NOTICIA`), não um número solto: a
    // guarda continua pegando qualquer OUTRA aba que esqueça de estender o
    // congelamento junto do próprio cromo.
    const extensaoDeclarada = A.VISTAS_NOTICIA.includes(aba) ? 1 : 0;
    if (l.congelado !== ultimoCromo + extensaoDeclarada) {
      throw new Error(
        `${aba}: congelado=${l.congelado} mas a última linha de cromo é ${ultimoCromo}` +
        (extensaoDeclarada ? ` (+${extensaoDeclarada} de extensão declarada, Onda UX 5)` : '') +
        ` (F.LINHAS em formulas.js). ` +
        'Congelamento que não cobre o cromo (mais a extensão declarada, se houver) faz a aba rolar por baixo do próprio cabeçalho.'
      );
    }
    const primeiroDado = l.lista || l.dados;
    if (primeiroDado !== ultimoCromo + 1) {
      throw new Error(`${aba}: a primeira linha de dado é ${primeiroDado} e o cromo acaba em ${ultimoCromo} — sobrou (ou faltou) linha entre os dois`);
    }
  }

  // 4b) Todo bloco do `Hoje` aponta pra uma aba que TEM rótulo de navegação (é
  //     o rótulo que entra no link do título e na linha de transbordo) e tem
  //     glifo declarado, com o título começando por ele. O glifo é o gancho da
  //     regra de formatação condicional que desenha a banda do bloco: título
  //     que não começa pelo glifo declarado = bloco sem banda, sem erro nenhum
  //     na tela. É exatamente o acoplamento que a constante nomeada resolveu,
  //     e esta guarda é o que impede a constante de virar decorativa.
  for (const b of F.HOJE_BLOCOS) {
    if (!F.ROTULO_NAV[b.aba]) throw new Error(`bloco ${b.chave} de ${A.HOJE} aponta pra "${b.aba}", que não tem rótulo em F.ROTULO_NAV`);
    if (!F.HOJE_BLOCO_GLIFO[b.chave]) throw new Error(`bloco ${b.chave} de ${A.HOJE} não tem glifo em F.HOJE_BLOCO_GLIFO — a banda dele não seria pintada`);
    if (!b.titulo.startsWith(F.HOJE_BLOCO_GLIFO[b.chave])) {
      throw new Error(
        `o título do bloco ${b.chave} não começa com o glifo declarado (${F.HOJE_BLOCO_GLIFO[b.chave]}). ` +
        'A regra de formatação condicional casa o glifo na PRIMEIRA posição — divergir apaga a banda daquele bloco.'
      );
    }
  }

  // 4b-bis) TODA NOTA ESTA ANCORADA NUM CABECALHO QUE EXISTE, e cai DENTRO da
  //     faixa de cromo da aba. `notas.js` ja estoura no `require` quando o
  //     rotulo nao existe; esta guarda repete a pergunta AQUI, por escrito,
  //     porque `construir.js` e quem roda antes de tudo.
  //
  //     E confere a segunda metade, que era a que faltava: a nota tem que
  //     morar no cromo. A limpeza que apaga nota velha (formatar.js) cobre
  //     linha 1 ate `F.ultimoCromo`; uma nota declarada abaixo disso nasceria
  //     SEM o par apaga+escreve e voltaria a envelhecer muda - que e
  //     exatamente o N4, com outra roupa.
  for (const anc of N.ANCORAS) {
    const cab = F.CABECALHO_POR_ABA[anc.aba] || [];
    if (cab[anc.coluna] !== anc.rotulo) {
      throw new Error(
        `nota de ${anc.aba} ancorada em "${anc.rotulo}" caiu na coluna ${anc.coluna + 1}, que hoje e "${cab[anc.coluna]}". ` +
        `Cabecalho vivo: ${JSON.stringify(cab)}.`
      );
    }
    if (anc.linha + 1 > F.ultimoCromo(anc.aba)) {
      throw new Error(
        `nota de ${anc.aba} ("${anc.rotulo}") declarada na linha ${anc.linha + 1}, fora do cromo (1..${F.ultimoCromo(anc.aba)})`
      );
    }
  }
  // E o inverso: nenhuma aba declarada em NOTAS pode estar fora de F.LINHAS,
  // senao `F.ultimoCromo` nao teria resposta e a limpeza nao rodaria nela.
  for (const aba of Object.keys(N.NOTAS)) {
    if (!F.LINHAS[aba]) throw new Error(`${aba} tem nota declarada e nao tem geometria em F.LINHAS - a limpeza de nota velha nao alcancaria essa aba`);
  }

  // 4c) Toda aba com navegação declarada tem rótulo pra cada destino, e nenhum
  //     destino é a própria aba (não se navega pra onde já se está) nem uma aba
  //     OCULTA (link pra aba oculta é link que não navega — e `Concursos ·
  //     tudo` está oculta por decisão).
  for (const [aba, destinos] of Object.entries(F.NAV)) {
    for (const d of destinos) {
      if (!F.ROTULO_NAV[d]) throw new Error(`a nav de ${aba} aponta pra "${d}", que não tem rótulo em F.ROTULO_NAV`);
      if (d === aba) throw new Error(`a nav de ${aba} aponta pra ela mesma`);
      if (d === A.TUDO) throw new Error(`a nav de ${aba} aponta pra ${A.TUDO}, que é OCULTA — o link não navegaria`);
    }
    // 4c-bis) E cabe: a barra pede N slots e a aba precisa ter N colunas
    //   VISÍVEIS. `Concursos` já escreveu quatro links em A1:D1 com C e D
    //   ocultas (`_url`/`_ordem`) — a aba renderizava DOIS. `F.celulaNav`
    //   escolhe pulando as ocultas e estoura quando não cabe, aqui, antes de
    //   qualquer escrita, em vez de deixar a aba com meia barra.
    //   Onda 18: o slot N (destinos.length) hospeda o marcador "você está
    //   aqui" — checar ATÉ ele, não só até destinos.length-1, senão a marca
    //   pode estourar em silêncio numa aba que só coubesse os links.
    F.NAV[aba].forEach((_, j) => F.celulaNav(aba, j, F.LINHAS[aba].nav));
    F.celulaNav(aba, F.NAV[aba].length, F.LINHAS[aba].nav);
  }
  // ONDA UX 6 — `Hoje` está em `F.NAV` agora (12 destinos), então o laço
  // acima já valida a nav dela por igual. `NAV_HOJE` (a grade 2×2) não
  // existe mais.

  // 4d) O GATILHO DO ALARME é UMA constante, e ela precisa estar de fato
  //     dentro do que a planilha vai ESCREVER. `formatar.js` monta a regra
  //     condicional a partir de `F.GLIFO_ALARME`; se `AVISO_SYNC` deixar de
  //     emitir esse mesmo caractere — mensagem reescrita, seletor de variação
  //     colado, glifo trocado de variante —, a regra continua válida, continua
  //     instalada, e NUNCA MAIS ACENDE. É o modo de falha que este aviso foi
  //     criado pra matar, acontecendo com o próprio aviso.
  //     ATUALIZADO (N5). O glifo NAO e mais o gatilho - ele voltou a ser so o
  //     sinal humano -, entao a guarda dele continua valendo pelo TEXTO e uma
  //     guarda NOVA cuida do MECANISMO: o criterio tem que ser literalmente o
  //     mesmo pedaco de expressao dos dois lados (o texto que JB le e a regra
  //     que pinta). Se alguem reescrever um sem o outro, isto estoura antes de
  //     qualquer escrita.
  const NUCLEO = [
    ['AVISO_SYNC', F.AVISO_SYNC, F.ALARME_ACESO_VAGA],
    ['AVISO_SYNC_PORTAL', F.AVISO_SYNC_PORTAL, F.ALARME_ACESO_VAGA],
    ['AVISO_SYNC_NOTICIA', F.AVISO_SYNC_NOTICIA, F.ALARME_ACESO_NOTICIA],
    ['ALARME_TERMO.vaga', F.ALARME_TERMO.vaga, F.ALARME_ACESO_VAGA],
    ['ALARME_TERMO.noticia', F.ALARME_TERMO.noticia, F.ALARME_ACESO_NOTICIA]
  ];
  for (const [nome, expressao, nucleo] of NUCLEO) {
    if (!expressao.includes(nucleo)) {
      throw new Error(
        `${nome} nao contem o criterio de alarme ${JSON.stringify(nucleo)}. ` +
        'O texto que JB le e a regra que pinta tem que sair do MESMO builder: divergir faz a faixa acender sem frase ' +
        '(ou a frase aparecer sem cor), que e o alarme mentindo sobre si mesmo.'
      );
    }
  }
  // E o gatilho NAO pode voltar a ser um glifo: uma regra que case emoji e a
  // classe que o D4 ja derrubou. Esta guarda e o que impede a regressao.
  for (const [aba, pipelines] of Object.entries(F.ALARME_ABAS)) {
    const cf = F.alarmeCF(pipelines);
    if (cf.includes(F.GLIFO_ALARME)) {
      throw new Error(`a regra de alarme de ${aba} voltou a casar o glifo ${F.GLIFO_ALARME} - o gatilho tem que ser o ESTADO, nunca o rotulo`);
    }
    if (!F.alarmeLinha(aba)) throw new Error(`${aba} esta em F.ALARME_ABAS e nao tem linha de veredito nem de estado vazio`);
    if (!pipelines.length) throw new Error(`${aba} esta em F.ALARME_ABAS sem nenhum pipeline declarado`);
    for (const pipe of pipelines) {
      if (!F.ALARME_TERMO[pipe]) throw new Error(`${aba} escuta o pipeline "${pipe}", que nao existe em F.ALARME_TERMO`);
    }
  }
  // COBERTURA: toda aba de VISTA (as que tem nav - ou seja, as que JB abre)
  // precisa de canal de alarme. Foi a metade que faltou no conserto anterior:
  // quatro abas novas nasceram sem regra nenhuma e ninguem contou as abas.
  const VISTAS = [A.HOJE, ...Object.keys(F.NAV)];
  const semAlarme = VISTAS.filter(aba => !F.ALARME_ABAS[aba]);
  if (semAlarme.length) {
    throw new Error(
      `aba(s) de vista sem canal de alarme: ${semAlarme.join(', ')}. ` +
      'Toda superficie que JB abre tem que poder dizer que o robo parou - declare o pipeline dela em F.ALARME_ABAS.'
    );
  }
  const ramosPortal = F.AVISO_SYNC_PORTAL.split(F.GLIFO_ALARME).length - 1;
  if (ramosPortal !== F.ALARME_RAMOS_PORTAL) {
    throw new Error(`AVISO_SYNC_PORTAL emite o sinal "${F.GLIFO_ALARME}" ${ramosPortal} vez(es) e F.ALARME_RAMOS_PORTAL declara ${F.ALARME_RAMOS_PORTAL}`);
  }
  if (!F.GLIFO_ALARME) throw new Error('F.GLIFO_ALARME está vazio — o alarme do robô parado ficaria sem gatilho');
  const ramosComGlifo = F.AVISO_SYNC.split(F.GLIFO_ALARME).length - 1;
  if (ramosComGlifo !== F.ALARME_RAMOS) {
    throw new Error(
      `AVISO_SYNC emite o gatilho "${F.GLIFO_ALARME}" ${ramosComGlifo} vez(es) e F.ALARME_RAMOS declara ${F.ALARME_RAMOS}. ` +
      'A regra condicional do alarme casa esse caractere: um ramo que perdeu o glifo é um ramo que acende sem cor nenhuma, ' +
      'exatamente no estado em que o silêncio é fatal. Ajuste a constante OU o ramo — nunca só um dos dois.'
    );
  }

  // 4e) O CÓDIGO DE ESTADO que as regras de esmaecimento leem é o dígito de
  //     cima da chave de ordem. Quem ESCREVE essa chave (`_calc!A` docente,
  //     `_calc!AH` mercado) e quem a LÊ (`F.REGRA_RECUO`) têm que usar o mesmo
  //     fator. Divergir não dá erro: dá um esmaecimento que casa a linha
  //     errada — que é a versão numérica do defeito que o emoji causou.
  for (const [rotulo, formula] of [['_calc!A (docente)', F.CALC.A], ['_calc!AH (mercado)', F.CALC_MERCADO.AH]]) {
    if (!formula.includes(`*${F.ORDEM_FATOR}`)) {
      throw new Error(`${rotulo} não multiplica o balde por F.ORDEM_FATOR (${F.ORDEM_FATOR}) — a regra de recuo dividiria pelo número errado`);
    }
  }
  if (!F.REGRA_RECUO('X', 9, 4).includes(`/${F.ORDEM_FATOR}`)) {
    throw new Error(`F.REGRA_RECUO não divide por F.ORDEM_FATOR (${F.ORDEM_FATOR})`);
  }

  // ================= GUARDAS DA CAMADA NOTÍCIA =================
  // Mesmo espírito das de cima: exceção ANTES de qualquer escrita.

  // 5a) [Onda 8-9] ESTA GUARDA EXISTIU ATÉ AQUI, E ESTAVA CERTA.
  //
  //     Ela comparava `F.NOTICIA_RECORTES` (dias/ordem que a planilha
  //     assumia) contra `lib-noticias/ranking.js RECORTES` (o que o pipeline
  //     de fato faz) — e estourava, todos os dias, porque `formulas.js`
  //     ainda declarava `ultimos-3-dias`/`semana` como não-score depois de a
  //     Onda 7-10 mudar as três chaves do pipeline pra ordenar por `score`.
  //     "A guarda está certa — ela existe justamente pra impedir que
  //     planilha e linha de comando respondam diferente à mesma pergunta.
  //     Quem está desatualizado é o `_norman/`." (briefing desta Onda). O
  //     alinhamento foi feito primeiro, isoladamente (`NOTICIA_RECORTES` em
  //     `formulas.js`, destravando `construir.js` — ver histórico do commit).
  //
  //     O MECANISMO INTEIRO SAIU LOGO DEPOIS, na mesma Onda: `NOTICIA_
  //     RECORTES`, o seletor de `A3`, `NOTICIA_DIAS`/`NOTICIA_K1`/`K2` — JB
  //     pediu três tabelas SEMPRE visíveis (3d/7d/30d), não um controle que
  //     troca entre elas. `noticiaTabela` (formulas.js) hoje filtra por
  //     igualdade em `faixa`/`posicao`, colunas que `lib-noticias/ranking.js
  //     calcularFaixasNoticia` já grava prontas — não há mais "dias"/"ordem"
  //     pra a planilha assumir por conta própria, então NÃO HÁ MAIS O QUE
  //     DIVERGIR: `F.NOTICIA_FAIXAS` é `NOTICIA_RANKING.FAIXAS_CASCATA`
  //     MAPEADO, não copiado — duas leituras da MESMA fonte não divergem por
  //     construção, e guarda pra isso seria checar que 1=1.

  // 5b) TODA TABELA QUE O PIPELINE COLETA TEM TEMA MAPEADO, E VICE-VERSA.
  //     Uma tabela coletada sem tema mapeado cairia na coluna `tema` com o
  //     valor CRU (`x` sem tradução em `noticiaTabela`) — sem erro, sem
  //     buraco na tela, só um rótulo feio que ninguém notaria. Um tema
  //     mapeado pra uma tabela que o pipeline não coleta é o oposto: um
  //     filtro no funil que nunca vai achar nada.
  const paresDaPlanilha = new Set(F.NOTICIA_TEMAS.map(t => `${F.NOTICIA_ABA_PIPELINE[t.aba]}/${t.tabela}`));
  const paresDoPipeline = new Set();
  for (const [abaPipe, tabelas] of Object.entries(NOTICIA_FONTES.TABELAS_POR_ABA)) {
    for (const t of tabelas) paresDoPipeline.add(`${abaPipe}/${t}`);
  }
  const semTema = [...paresDoPipeline].filter(p => !paresDaPlanilha.has(p));
  const semTabelaNoPipeline = [...paresDaPlanilha].filter(p => !paresDoPipeline.has(p));
  if (semTema.length) {
    throw new Error(
      `o pipeline coleta pra ${semTema.join(', ')} e nenhum tema mapeia essa tabela: a coluna \`tema\` mostraria o valor cru. ` +
      'Acrescente a entrada em F.NOTICIA_TEMAS (formulas.js) ou tire a tabela de fontes-noticias/index.js.'
    );
  }
  if (semTabelaNoPipeline.length) {
    throw new Error(
      `há tema mapeado pra ${semTabelaNoPipeline.join(', ')} e o pipeline não coleta essa tabela — o funil da coluna tema nunca acharia nada`
    );
  }
  // As quatro vistas do mapa aba->pipeline são as quatro declaradas em
  // `abas.js`, e cada uma tem pelo menos um tema.
  for (const aba of A.VISTAS_NOTICIA) {
    if (!F.NOTICIA_ABA_PIPELINE[aba]) throw new Error(`a vista ${aba} não tem aba de pipeline em F.NOTICIA_ABA_PIPELINE`);
    if (!F.noticiaTemasDe(aba).length) throw new Error(`a vista ${aba} não tem nenhum tema em F.NOTICIA_TEMAS`);
    if (!F.NOTICIA_SUBTITULO[aba]) throw new Error(`a vista ${aba} não tem subtítulo em F.NOTICIA_SUBTITULO`);
  }

  // 5c) O ALARME DA TRILHA NOTÍCIA tem gatilho, igual ao da trilha vaga. É a
  //     mesma guarda de 4d aplicada ao segundo aviso: um ramo que perde o
  //     glifo continua válido, continua instalado, e nunca mais acende —
  //     exatamente no estado em que o silêncio é fatal.
  const ramosNoticia = F.AVISO_SYNC_NOTICIA.split(F.GLIFO_ALARME).length - 1;
  if (ramosNoticia !== F.ALARME_RAMOS_NOTICIA) {
    throw new Error(
      `AVISO_SYNC_NOTICIA emite o gatilho "${F.GLIFO_ALARME}" ${ramosNoticia} vez(es) e F.ALARME_RAMOS_NOTICIA declara ${F.ALARME_RAMOS_NOTICIA}`
    );
  }
  // E ele lê o carimbo pela CONSTANTE de `lib/sheets.js`, não por "Y1" na
  // mão — mesma razão da guarda 3.
  if (!F.CARIMBO_NOTICIA.includes(`$${CARIMBO_COL_CHK}$${CARIMBO_LINHA_CHK}`)) {
    throw new Error(
      `F.CARIMBO_NOTICIA não aponta pra ${SHEETS.CELULA_CARIMBO} — CELULA_CARIMBO mudou e a camada notícia não acompanhou`
    );
  }

  // 5d) O BLOCO DE DADO DA ABA DE FATO NÃO PODE ALCANÇAR O CARIMBO. É a
  //     mesma folga que `tests/sheets.test.js` guarda em `dados`: a escrita
  //     do sync é ancorada em A1 com N colunas de largura, e no dia em que N
  //     crescer até a coluna do carimbo, o sync passaria a apagar o próprio
  //     carimbo — e o aviso de "coleta parada" morreria calado.
  const ordCol = c => c.split('').reduce((n, ch) => n * 26 + (ch.charCodeAt(0) - 64), 0);
  const ultimaColunaFato = F.nfLetra(F.NOTICIA_FATO_CABECALHO[F.NOTICIA_FATO_CABECALHO.length - 1]);
  if (ordCol(ultimaColunaFato) >= ordCol(CARIMBO_COL_CHK)) {
    throw new Error(
      `o bloco de dado de ${A.NOTICIAS_DADOS} vai até a coluna ${ultimaColunaFato} e o carimbo mora em ${SHEETS.CELULA_CARIMBO}: ` +
      'a próxima sincronização gravaria por cima do carimbo e o aviso de coleta parada ficaria mudo'
    );
  }

  let abas = await idsDasAbas();

  // 0. RENOMEAR as abas legadas. O nome da aba é o rótulo mais visto da
  //    planilha (a barra de abas é o que JB lê antes de decidir onde entrar) e
  //    também o mais perigoso de trocar: `lib/sheets.js garantirAbas()` CRIA a
  //    aba que não encontrar pelo nome. Renomear na planilha sem renomear aqui
  //    faria o sync das 8h criar uma segunda `dados` vazia ao lado da de
  //    verdade, escrever nela, e deixar as fórmulas apontando pra aba antiga —
  //    a planilha continuaria abrindo, congelada, sem erro nenhum.
  //    Por isso o nome não mora aqui: `_norman/abas.js` importa de
  //    `lib/sheets.js`, e este passo só migra o que ficou pra trás.
  //    Idempotente: com o nome canônico já presente, não faz nada.
  const renomeios = [];
  for (const [canonico, antigos] of Object.entries(A.LEGADAS)) {
    if (abas[canonico]) continue;
    const legado = antigos.find(t => abas[t]);
    if (!legado) continue;
    renomeios.push({ updateSheetProperties: { properties: { sheetId: abas[legado].sheetId, title: canonico }, fields: 'title' } });
    console.log(`renomeando aba "${legado}" -> "${canonico}"`);
  }
  if (renomeios.length) { await a.batch(renomeios); abas = await idsDasAbas(); }

  // Guarda: nome canônico presente e nenhum legado sobrando. Sem isto, uma
  // migração pela metade (canônico criado do zero + legado órfão ao lado, com
  // as fórmulas apontando pro órfão) passaria despercebida — as duas abas
  // existem, nenhuma chamada erra, e a planilha só para de atualizar.
  const faltando = Object.keys(A.LEGADAS).filter(t => !abas[t] && !ABAS_NOVAS[t]);
  if (faltando.length) throw new Error(`aba canônica ausente e sem legado pra renomear: ${faltando.join(', ')}`);
  const orfaos = Object.values(A.LEGADAS).flat().filter(t => abas[t]);
  if (orfaos.length) {
    throw new Error(
      `aba com nome LEGADO ainda existe na planilha: ${orfaos.join(', ')}. ` +
      'Duas abas com o mesmo papel = as fórmulas leem uma e o sync escreve na outra, em silêncio. ' +
      'Apague a legada à mão (confira antes que ela está vazia) e rode de novo.'
    );
  }

  // 1. criar abas que faltam
  const criar = Object.entries(ABAS_NOVAS)
    .filter(([t]) => !abas[t])
    .map(([title, rowCount]) => ({
      addSheet: { properties: { title, gridProperties: { rowCount, columnCount: 26 } } }
    }));
  if (criar.length) {
    await a.batch(criar);
    console.log('criadas:', criar.map(r => r.addSheet.properties.title).join(', '));
    abas = await idsDasAbas();
  } else {
    console.log('abas novas já existiam');
  }

  // 2. garantir altura/largura de grade suficientes (array espelha `dados`
  //    linha a linha; grade curta é o jeito silencioso de o sync começar a
  //    falhar sozinho quando o store crescer)
  const cresce = [];
  for (const [t, alvo] of Object.entries(ALTURA)) {
    const p = abas[t];
    if (p && p.gridProperties.rowCount < alvo) {
      cresce.push({ updateSheetProperties: { properties: { sheetId: p.sheetId, gridProperties: { rowCount: alvo } }, fields: 'gridProperties.rowCount' } });
    }
  }
  for (const [t, alvo] of Object.entries(LARGURA)) {
    const p = abas[t];
    if (p && p.gridProperties.columnCount < alvo) {
      cresce.push({ updateSheetProperties: { properties: { sheetId: p.sheetId, gridProperties: { columnCount: alvo } }, fields: 'gridProperties.columnCount' } });
    }
  }
  if (cresce.length) { await a.batch(cresce); console.log('grade ampliada em', cresce.length, 'aba(s)'); }

  // 3. MIGRAÇÃO DO CABEÇALHO: linha 1 -> linha 2 nas quatro abas DIGITADAS.
  //
  //    A linha 1 passa a ser a navegação. Nas abas de VISTA isso é grátis
  //    (`limpar()` + reescrita nas posições novas). Nas DIGITADAS não existe
  //    esse caminho: apagar apagaria dado real de JB. O que existe é INSERIR
  //    uma linha no topo — o Sheets desloca tudo pra baixo, dado e formato
  //    junto, e a operação é atômica.
  //
  //    ISTO NUNCA MAIS SERÁ TÃO BARATO. Hoje há DUAS linhas de dado real nas
  //    quatro abas somadas (`Tarefas` 2, `Fila` 0, `Projetos` 2, `Diário` 0).
  //    Cada linha que JB escrever daqui pra frente é uma linha a mais pra
  //    deslocar — e a migração vira uma coisa que ninguém quer fazer.
  //
  //    IDEMPOTÊNCIA (o requisito duro): rodar de novo NÃO pode inserir outra
  //    linha. A detecção não olha "já rodei antes"; olha a PLANILHA VIVA e
  //    pergunta onde o cabeçalho está agora. Três estados legítimos e um
  //    quarto que aborta:
  //      cabeçalho na linha de destino -> nada a fazer
  //      cabeçalho na linha 1          -> inserir uma linha no topo
  //      as duas linhas vazias         -> aba recém-criada, só escrever
  //      qualquer outra coisa          -> ABORTA, não adivinha
  //    Adivinhar aqui empurraria a primeira linha de dado de JB pra dentro do
  //    cabeçalho, ou escreveria o cabeçalho por cima de uma tarefa dele.
  // `Candidaturas` (Onda 5) entra aqui também: `F.LINHAS[A.CANDIDATURAS]
  // .cabecalho` é a MESMA linha 3 que as quatro puras usam — o mecanismo de
  // migração/escrita de cabeçalho só lê `.cabecalho`, nunca `.dados`/`.vazio`
  // diretamente, então funciona igual pra uma aba que é spill+digitada.
  const CABECALHOS_CRM_MIG = {
    [A.FILA]: F.FILA_CABECALHO, [A.PROJETOS]: F.PROJETOS_CABECALHO,
    [A.TAREFAS]: F.TAREFAS_CABECALHO, [A.DIARIO]: F.DIARIO_CABECALHO,
    [A.CANDIDATURAS]: F.CANDIDATURAS_CABECALHO, [A.ETAPAS]: F.ETAPAS_CABECALHO
  };
  // Compara pelos TRÊS primeiros rótulos, não pelo cabeçalho inteiro: nesta
  // Onda `Projetos` ganha duas colunas, então o cabeçalho vivo (9) e o
  // esperado (11) divergem de propósito — e mesmo assim a linha É o
  // cabeçalho. Um rótulo só seria frouxo demais (um projeto poderia se
  // chamar "projeto"); os três primeiros de cada aba são inconfundíveis.
  //
  // Ondas 14-17 — `Diário` RENOMEIA um rótulo no lugar ("quem" -> "voz",
  // mesma coluna B, mesmos valores JB/Durin — Onda 16). Sem alias, a
  // detecção acharia que o cabeçalho "sumiu" da linha de destino (não bate
  // mais com os 3 primeiros rótulos NOVOS) e um `Diário` já povoado (2
  // entradas intocáveis) cairia no ramo de erro ("não achei o cabeçalho"),
  // porque a linha 1 (nav) não está vazia. `ALIAS_MIG` é a mesma ideia que
  // `PROJETOS_ALIAS` (mais abaixo, §3b) já usa pra essa exata situação —
  // aqui generalizada pra qualquer aba, não só `Projetos`.
  // ONDA UX 10 (remodelação 2026-09-01) — `Diário` ganha um segundo alias:
  // `sobre` virou `sobre (projeto)` (o rótulo agora pede a CHAVE, não o
  // assunto — AVALIACAO-UX.md Parte 2 §4). MESMA classe de migração que o
  // "quem"->"voz" da Onda 16 já resolveu: sem o alias, a detecção acharia
  // que o cabeçalho "sumiu" da linha de destino (o rótulo novo não bate com
  // o antigo) e um `Diário` já povoado cairia no ramo de erro.
  // ONDA UX 12 (Leva 3) — `Fila` troca `id`/`o quê` de lugar (identidade
  // antes do derivado). O mecanismo de migração olha só POSIÇÃO DE LINHA
  // (`ehCabecalho` compara os 3 primeiros rótulos contra a linha viva); ele
  // não sabe reordenar COLUNA — sem alias, a linha 3 viva (ainda com "id" em
  // A e "o quê" em C, texto antigo) deixaria de bater com os 3 primeiros
  // rótulos NOVOS (["o quê","url","id"]) e cairia no ramo de erro, mesmo a
  // `Fila` estando vazia (0 linhas de dado real — nada a proteger, mas o
  // guard não sabe disso de antemão). Alias BIDIRECIONAL (mesmo padrão do
  // "quem"->"voz" do `Diário`, um degrau acima): a linha 3 viva continua
  // reconhecida como cabeçalho na posição certa; o passo 11 (mais abaixo)
  // sobrescreve o TEXTO dela pra ordem nova de qualquer jeito.
  const ALIAS_MIG = {
    [A.DIARIO]: { voz: 'quem', [F.DIARIO_ROTULO_SOBRE]: 'sobre' },
    [A.FILA]: { 'o quê': 'id', id: 'o quê' }
  };
  const ehCabecalho = (linha, cab, aba) => cab.slice(0, 3).every((v, i) => {
    const atual = (linha || [])[i];
    if (atual === v) return true;
    const alias = ALIAS_MIG[aba];
    return !!(alias && alias[v] !== undefined && atual === alias[v]);
  });
  const vazia = linha => !(linha || []).some(c => String(c || '').trim() !== '');

  //    GENERALIZAÇÃO desta Onda: o cabeçalho não desce mais só "da 1 pra 2".
  //    A linha de ESTADO VAZIO ganhou linha própria (D9) e o cabeçalho passou
  //    a 3 — então uma planilha já migrada uma vez está com ele na 2 e precisa
  //    descer UMA. A busca é por ONDE ELE ESTÁ, não por "quantas vezes já
  //    rodei": acha o cabeçalho em qualquer linha de 1 até o destino e insere
  //    a diferença IMEDIATAMENTE ACIMA DELE — nunca no topo, senão a
  //    navegação da linha 1 desceria junto e a aba ficaria sem barra.
  const insercoes = [];
  const migracao = {};
  for (const [aba, cab] of Object.entries(CABECALHOS_CRM_MIG)) {
    const destino = F.LINHAS[aba].cabecalho;
    const ult = String.fromCharCode(64 + cab.length);
    const topo = (await a.ler(`${R(aba)}!A1:${ult}${destino}`)).values || [];
    const l1 = topo[0], lDestino = topo[destino - 1];
    if (ehCabecalho(lDestino, cab, aba)) { migracao[aba] = 'ja migrada'; continue; }
    const onde = topo.findIndex(linha => ehCabecalho(linha, cab, aba)) + 1; // 1-based, 0 = não achou
    if (onde > 0) {
      insercoes.push({
        insertDimension: {
          range: { sheetId: abas[aba].sheetId, dimension: 'ROWS', startIndex: onde - 1, endIndex: destino - 1 },
          inheritFromBefore: false
        }
      });
      migracao[aba] = `cabecalho desceu da linha ${onde} pra ${destino} (+${destino - onde})`;
      continue;
    }
    if (vazia(l1) && vazia(lDestino)) { migracao[aba] = 'aba nova, sem migrar'; continue; }
    throw new Error(
      `${aba}: nao achei o cabecalho em nenhuma linha de 1 a ${destino}. ` +
      `Linha 1: ${JSON.stringify(l1)}. Linha ${destino}: ${JSON.stringify(lDestino)}. ` +
      `Esperado comecar com ${JSON.stringify(cab.slice(0, 3))}. ` +
      'Nao vou adivinhar: inserir linha no lugar errado empurra dado de JB pra dentro do cabecalho. Confira a aba a mao.'
    );
  }
  if (insercoes.length) await a.batch(insercoes);
  console.log('migração de cabeçalho: ' + Object.entries(migracao).map(([k, v]) => `${k} (${v})`).join(' · '));

  // 3a-bis. LIMPAR O ENDEREÇO ANTIGO DO ESTADO VAZIO.
  //
  //   A instrução morava numa célula de fórmula na LINHA DA NAV, à direita dos
  //   4 links, e passou a ter linha própria (D9). Desmesclar não apaga valor:
  //   sem isto, a fórmula velha fica em `E1` de cada aba digitada, viva,
  //   apontando pra uma linha de dado que mudou de lugar — e ela devolveria ""
  //   pra sempre (a antiga `COUNTA(A3:A)` passa a contar o cabeçalho, que
  //   desceu pra 3). Ou seja: uma célula que ninguém gera, ninguém confere e
  //   que está calada pelo motivo errado. É lixo que parece funcionamento.
  //
  //   Só a faixa à DIREITA dos links, e só na linha da nav — os links em si
  //   são reescritos adiante.
  for (const aba of Object.keys(F.ESTADO_VAZIO_DIGITADAS)) {
    const l = F.LINHAS[aba];
    const primeiraLivre = String.fromCharCode(65 + (F.NAV[aba] || []).length);
    const ult = String.fromCharCode(64 + F.ESTADO_VAZIO_DIGITADAS[aba].colunas);
    if (primeiraLivre <= ult) await a.limpar(`${R(aba)}!${primeiraLivre}${l.nav}:${ult}${l.nav}`);
  }
  console.log('endereço antigo do estado vazio (à direita da nav) limpo nas 4 abas digitadas');

  // 3b. MIGRAÇÃO DE ORDEM DE COLUNA em `Projetos`.
  //
  //     As duas colunas que fecham o job "ver tudo de um projeto" tinham sido
  //     postas no FIM: `próximas tarefas` começava a 1.324 px da borda, ou
  //     ~4 arrastos na dobra do celular. A spec contou 2 passos; medido na peça
  //     construída, 5. Elas sobem pra logo depois de `próximo passo`.
  //
  //     Mudar a ordem do cabeçalho SEM mover o dado seria o pior resultado
  //     possível: os rótulos novos por cima dos valores antigos, cada coluna
  //     dizendo o nome da vizinha, e nenhum erro em lugar nenhum. Então o dado
  //     anda junto — e anda POR NOME DE CABEÇALHO, nunca por letra (é a mesma
  //     lei T-4 que o contrato impõe ao Thor, aplicada à migração que reescreve
  //     o contrato).
  //
  //     IDEMPOTENTE: com a ordem já certa, o `every` bate e não se escreve
  //     nada. E se o cabeçalho vivo não for nem o antigo nem o novo, ABORTA —
  //     remontar linha por palpite aqui embaralha o único dado humano da
  //     planilha.
  {
    const aba = A.PROJETOS;
    const alvo = F.PROJETOS_CABECALHO;
    // Renomes desta Onda (D8): os dois rótulos que renderizavam COLIDINDO.
    const ALIAS = { 'movimentou': 'última movimentação', 'abertas': 'tarefas abertas' };
    const ult = String.fromCharCode(64 + alvo.length);
    const lCab = F.LINHAS[aba].cabecalho, lIni = F.LINHAS[aba].dados, lFim = F.PROJETOS_ULTIMA_LINHA;
    const bloco = (await a.ler(`${R(aba)}!A${lCab}:${ult}${lFim}`)).values || [];
    const vivo = (bloco[0] || []).map(x => String(x || ''));
    const jaCerto = alvo.every((r, i) => vivo[i] === r);
    if (jaCerto) {
      console.log(`ordem de coluna de ${aba}: já é a nova — nada movido`);
    } else if (vivo.every(x => x === '')) {
      console.log(`ordem de coluna de ${aba}: aba sem cabeçalho ainda — nada a mover`);
    } else {
      const ondeEsta = rotulo => {
        let i = vivo.indexOf(rotulo);
        if (i < 0 && ALIAS[rotulo]) i = vivo.indexOf(ALIAS[rotulo]);
        return i;
      };
      const perdidos = alvo.filter(r => ondeEsta(r) < 0 && !Object.keys(F.PROJETOS_CALCULADAS)
        .some(letra => F.PROJETOS_CABECALHO[letra.charCodeAt(0) - 65] === r));
      if (perdidos.length) {
        throw new Error(
          `${aba}: o cabeçalho vivo ${JSON.stringify(vivo)} não tem a(s) coluna(s) DIGITADA(S) ${JSON.stringify(perdidos)}. ` +
          'Reordenar a partir daqui apagaria dado de JB. Confira a aba à mão.'
        );
      }
      const linhas = [];
      for (let n = lIni; n <= lFim; n++) {
        const origem = bloco[n - lCab] || [];
        linhas.push(alvo.map(r => { const i = ondeEsta(r); return i < 0 ? '' : (origem[i] === undefined ? '' : origem[i]); }));
      }
      await a.escrever(`${R(aba)}!A${lIni}:${ult}${lFim}`, linhas);
      console.log(`ordem de coluna de ${aba} migrada por NOME: ${JSON.stringify(vivo)} -> ${JSON.stringify(alvo)}`);
      console.log(`  ${linhas.filter(l => String(l[0] || '').trim() !== '').length} linha(s) com projeto reposicionada(s); as calculadas são reescritas adiante`);
    }
  }

  // -------------------- ONDA 3 · PASSO 1 de 3 — COLHER --------------------
  // OBRIGATORIAMENTE antes do `limpar()` logo abaixo (passo "4."): é isso
  // que impede o check "Inscrito" de ser perdido quando a aba é apagada e
  // reescrita. Ver `_norman/estado.js` pro desenho completo. Nenhum
  // try/catch em volta: se `passoColher` rejeitar (rede, cota, planilha
  // fora do ar), este `await` propaga o erro pra fora de `main()` e o
  // `.catch()` no fim do arquivo imprime e sai com código 1 — o `limpar()`
  // da seção "4." NUNCA roda. É a blindagem do modo de falha, garantida
  // pela ordem sequencial do código-fonte, não por uma checagem extra.
  const resultadoColher = await passoColher(a);
  console.log(
    `_estado: ${resultadoColher.capturadas} check(s) lido(s) nas vistas, ` +
    `${resultadoColher.capturadasCandidaturas} campo(s) de ${A.CANDIDATURAS} lido(s), ` +
    `${resultadoColher.alterados} alteracao(oes) colhida(s), ${resultadoColher.mapa.size} url(s) memorizada(s) no total`
  );

  // 4. limpar as abas de leitura (tinham as fórmulas antigas, nas posições
  //    antigas — a linha de nav empurrou todas elas uma pra baixo).
  //    `dados` NUNCA aparece nesta lista: é a única aba do sync, e limpá-la
  //    aqui deixaria a planilha vazia até a próxima execução do radar.
  //    `Hoje` ENTRA aqui — é 100% fórmula, sem célula digitada, mesma família
  //    de `Concursos`/`Concursos · tudo`/`Empregos`. As quatro DIGITADAS
  //    NUNCA entram: `limpar()` nelas apagaria dado real que não existe em
  //    nenhum outro lugar.
  //    As quatro VISTAS de notícia entram aqui: são 100% fórmula, sem célula
  //    de dado — não há mais seletor de recorte pra apagar/reescrever (saiu
  //    na Onda 8-9; JB pediu as tabelas sempre visíveis).
  //    `notícias (não edite)` NUNCA entra: é a aba do sync, e limpá-la aqui
  //    deixaria as quatro vistas vazias até a próxima coleta — exatamente o
  //    que a nota de `dados` já diz da trilha vaga.
  const LEITURA = [A.PAINEL, A.TUDO, A.CALC, A.EMPREGOS, A.HOJE, ...A.VISTAS_NOTICIA];
  for (const t of LEITURA) await a.limpar(R(t));
  console.log('valores limpos:', LEITURA.join(', '));

  // -------------------- GID DAS ABAS, pra navegação --------------------
  // Resolvido AGORA, depois de renomear/criar/migrar — nunca escrito à mão
  // (invariante N-13). Aba excluída e recriada muda de gid: um link com gid
  // literal não quebra, ele passa a APONTAR PRA OUTRA COISA, e o veredito
  // antigo fica mudo. Como a nav é reescrita toda vez que `construir.js` roda,
  // o risco documentado ("gid muda se a aba for recriada") deixa de existir.
  const gid = {};
  Object.entries(abas).forEach(([titulo, props]) => { gid[titulo] = props.sheetId; });
  const semGid = [...new Set([...Object.keys(F.NAV), ...Object.values(F.NAV).flat(), A.HOJE])]
    .filter(t => gid[t] === undefined);
  if (semGid.length) throw new Error(`sem sheetId pra resolver a navegação: ${semGid.join(', ')}`);

  // -------- DESMESCLAR A LINHA DE NAVEGAÇÃO, antes de escrever nela --------
  //
  // DEFEITO PEGO PELO CONTROLE N-13, e ele era mudo na tela. A linha 1 das
  // abas de vista era, no layout ANTIGO, o banner do veredito — uma célula
  // MESCLADA de A até a última coluna. `construir.js` escrevia os 4 links em
  // A1:D1 e a API aceitava a escrita sem reclamar; a leitura logo depois até
  // devolvia os 4. Mas B1, C1 e D1 eram células NÃO-ÂNCORA de uma mescla, e
  // quando `formatar.js` desfez a mescla antiga pra montar o cromo novo, elas
  // voltaram VAZIAS. Resultado: uma barra de navegação com UM link em vez de
  // quatro, sem erro nenhum, em três abas. JB nunca saberia que faltavam três.
  //
  // A cura é de propriedade, não de ordem de execução: `construir.js` escreve
  // VALORES e não pode escrever dentro de uma mescla que ele não controla.
  // Então ele desfaz, antes, exatamente as mesclas que cruzam as células de
  // link — e só essas. Usa as coordenadas DA PRÓPRIA mescla (não uma faixa
  // inventada), porque `unmergeCells` sobre uma faixa que corta uma mescla ao
  // meio é erro de API.
  //
  // IDEMPOTENTE por construção: depois da primeira passada não existe mais
  // mescla nessa região, o laço acha zero e a segunda rodada é no-op. E não
  // encosta na mescla do estado vazio das abas digitadas (E1:G1 e irmãs), que
  // é de `formatar.js` e fica fora das colunas de link.
  const celulasDeLink = [];
  // ONDA UX 6 — `Hoje` está em `F.NAV`, o laço abaixo já cobre a nav dela
  // (não precisa mais de uma entrada própria pra `nav`/`nav2`).
  for (const aba of Object.keys(F.NAV)) celulasDeLink.push([aba, F.LINHAS[aba].nav, F.NAV[aba].length]);
  const desmesclar = [];
  for (const [aba, linha, colunas] of celulasDeLink) {
    for (const mg of (abas[aba].merges || [])) {
      const cruzaLinha = (mg.startRowIndex || 0) < linha && (mg.endRowIndex || 0) >= linha;
      const cruzaColuna = (mg.startColumnIndex || 0) < colunas;
      if (cruzaLinha && cruzaColuna) desmesclar.push({ unmergeCells: { range: mg } });
    }
  }
  if (desmesclar.length) {
    await a.batch(desmesclar);
    console.log(`mescla desfeita sobre ${desmesclar.length} faixa(s) na linha de navegação — célula mesclada hospeda UM link (N-15)`);
  }

  // -------------------- UMA ESCRITA SÓ --------------------
  // Tudo abaixo entra num único `values:batchUpdate`. Antes eram ~20
  // requisições PUT em sequência e esta Onda acrescentaria mais 15: a cota do
  // Sheets é 60 escritas por minuto POR USUÁRIO e é compartilhada com
  // `formatar.js` e com o sync de madrugada — rodar os dois em sequência
  // estourava, e planilha meio-escrita é o pior estado possível porque parece
  // pronta. Uma requisição também torna a ordem entre as escritas irrelevante:
  // a tabela de siglas e o bloco que faz VLOOKUP nela chegam JUNTOS, sem o
  // ciclo de recálculo em que o fallback aparecia por um instante.
  const escritas = [];
  const poe = (aba, faixa, valores) => escritas.push([`${R(aba)}!${faixa}`, valores]);
  const cel = (aba, ref, valor) => poe(aba, ref, [[valor]]);
  const celulasDe = (aba, celulas) => Object.entries(celulas).forEach(([ref, v]) => cel(aba, ref, v));

  // Navegação: uma linha, N células, uma por destino. Nunca mesclada (célula
  // mesclada hospeda UM link — N-15) e nunca concatenada com texto
  // (`=HYPERLINK(a;b)&"x"` não é link — N-14).
  //
  // V2 (Leva 6) — a largura REAL da coluna onde cada link pousa decide se o
  // rótulo cabe cheio ou só o emoji (`F.rotuloNavParaSlot`, ver o bloco de
  // comentário grande junto dela em `formulas.js`). A largura mora em `GEO`
  // (`formatar.js`) — requerido aqui só como MÓDULO (nunca roda `main()`,
  // guardado por `require.main === module` no próprio arquivo), então não
  // há chamada de rede nem ordem de pipeline nova: `construir.js` continua
  // podendo rodar antes ou depois de `formatar.js`.
  const FMT = require('./formatar');
  for (const aba of Object.keys(F.NAV)) {
    const g = FMT.GEO[aba];
    celulasDe(aba, F.navCelulas(aba, a.ID, gid, g ? (col => g.cols[col]) : undefined));
  }

  // 5. _calc — siglas (a coluna R faz VLOOKUP nela) e feriados (o NETWORKDAYS
  //    do aviso de sync lê dali). Escritas SEPARADAS de propósito: X fica de
  //    folga entre as duas tabelas, e um intervalo contíguo V:Y amarraria o
  //    tamanho de uma ao da outra.
  const V = F.SIGLAS_COL, W = String.fromCharCode(V.charCodeAt(0) + 1);
  const tab = S.tabela();
  poe(A.CALC, `${V}1:${W}1`, [['instituicao (nome exato em dados!A)', 'sigla canônica']]);
  poe(A.CALC, `${V}2:${W}${tab.length + 1}`, tab);
  const FY = F.FERIADOS_COL;
  const fer = FERIADOS.tabela();
  poe(A.CALC, `${FY}1`, [['feriado nacional (lib/feriados-nacionais.js)']]);
  poe(A.CALC, `${FY}2:${FY}${fer.length + 1}`, fer);

  // 6. _calc — bloco docente (A:R) e bloco mercado (AA:AK). Nunca num
  //    intervalo contíguo A:AK: isso gravaria vazio por cima de V:W e
  //    decapitaria a tabela de siglas, em silêncio.
  const cols = Object.keys(F.CALC);
  const ULT = cols[cols.length - 1];
  poe(A.CALC, `A1:${ULT}1`, [F.CALC_CABECALHO]);
  poe(A.CALC, `A2:${ULT}2`, [cols.map(k => F.CALC[k])]);
  const colsM = Object.keys(F.CALC_MERCADO);
  const PRIM_M = colsM[0], ULT_M = colsM[colsM.length - 1];
  poe(A.CALC, `${PRIM_M}1:${ULT_M}1`, [colsM.map(k => F.CALC_MERCADO_CABECALHO[k])]);
  poe(A.CALC, `${PRIM_M}2:${ULT_M}2`, [colsM.map(k => F.CALC_MERCADO[k])]);

  // 7. Concursos — as posições vêm de F.LINHAS e as COLUNAS do cabeçalho
  //    (`F.letraDe`), nunca de literal. A aba herdou a forma da trilha:
  //    `Abrir` na coluna A, a lista ancorada na coluna seguinte, `_url` e
  //    `_ordem` ocultas no fim e `link (copiar)` fora da dobra — igual à
  //    `Empregos` e igual à `Concursos · tudo`.
  const CAB_DOCENTE = F.DOCENTE_CABECALHO;
  const colAbrir = F.letraDe(CAB_DOCENTE, 'Abrir');
  const colListaDocente = F.letraDe(CAB_DOCENTE, 'Vaga');
  const colLinkCopiar = F.letraDe(CAB_DOCENTE, 'link (copiar)');
  {
    const l = F.LINHAS[A.PAINEL];
    const ult = String.fromCharCode(64 + CAB_DOCENTE.length);
    cel(A.PAINEL, `A${l.veredito}`, F.PAINEL.veredito);
    cel(A.PAINEL, `A${l.contagem}`, F.PAINEL.contagem);
    poe(A.PAINEL, `A${l.cabecalho}:${ult}${l.cabecalho}`, [F.PAINEL.cabecalho]);
    cel(A.PAINEL, `${colAbrir}${l.lista}`, F.PAINEL.abrir);
    cel(A.PAINEL, `${colListaDocente}${l.lista}`, F.PAINEL.lista);
    cel(A.PAINEL, `${colLinkCopiar}${l.lista}`, F.PAINEL.linkCopiar);
  }

  // 8. Concursos · tudo — OCULTA na barra (decisão: ocultar em vez de fundir),
  //    mas gerada inteira e intacta. Ocultar é reversível com um clique;
  //    fundir dados não se desfaz. Ela recebe nav de SAÍDA pra que,
  //    desocultada, seja aba de primeira classe e não um fóssil com o desenho
  //    antigo — e ninguém linka PRA ela, porque link pra aba oculta não navega.
  {
    const l = F.LINHAS[A.TUDO];
    const ult = String.fromCharCode(64 + CAB_DOCENTE.length);
    cel(A.TUDO, `A${l.veredito}`, F.TUDO.veredito);
    poe(A.TUDO, `A${l.cabecalho}:${ult}${l.cabecalho}`, [F.TUDO.cabecalho]);
    cel(A.TUDO, `${colAbrir}${l.lista}`, F.TUDO.abrir);
    cel(A.TUDO, `${colListaDocente}${l.lista}`, F.TUDO.lista);
    cel(A.TUDO, `${colLinkCopiar}${l.lista}`, F.TUDO.linkCopiar);
  }

  // 9. Empregos
  //    N-17, consertado nesta Onda: as três células abaixo eram as ÚNICAS da
  //    casa escritas com letra LITERAL (`A`/`B`/`J`), em vez de derivadas do
  //    cabeçalho por `F.letraDe`. Inofensivo enquanto o bloco não mudava de
  //    tamanho — a Onda 4 mudou (coluna "Inscrito" nova): literal deslocaria
  //    `link (copiar)` SEM ERRO NENHUM. Agora deriva igual à `Concursos`.
  {
    const l = F.LINHAS[A.EMPREGOS];
    const ult = String.fromCharCode(64 + F.EMPREGOS.cabecalho.length);
    const colAbrirM = F.letraDe(F.MERCADO_CABECALHO, 'Abrir');
    const colListaM = F.letraDe(F.MERCADO_CABECALHO, 'Vaga');
    const colLinkCopiarM = F.letraDe(F.MERCADO_CABECALHO, 'link (copiar)');
    cel(A.EMPREGOS, `A${l.veredito}`, F.EMPREGOS.veredito);
    cel(A.EMPREGOS, `A${l.contagem}`, F.EMPREGOS.contagem);
    poe(A.EMPREGOS, `A${l.cabecalho}:${ult}${l.cabecalho}`, [F.EMPREGOS.cabecalho]);
    cel(A.EMPREGOS, `${colAbrirM}${l.lista}`, F.EMPREGOS.abrir);
    cel(A.EMPREGOS, `${colListaM}${l.lista}`, F.EMPREGOS.lista);
    cel(A.EMPREGOS, `${colLinkCopiarM}${l.lista}`, F.EMPREGOS.linkCopiar);
  }

  // -------------------- CAMADA CRM --------------------
  // A partir daqui, NENHUM `limpar()`: `Fila`/`Projetos`/`Tarefas`/`Diário`
  // guardam dado real de JB/Durin. Cada escrita mira só a célula que é fórmula
  // ou cabeçalho — sobrescrever com o MESMO conteúdo que já está lá (o caso
  // comum, planilha já migrada) é no-op observável.

  // 10. Hoje — painel do dia, 100% fórmula (limpo no passo 4). Um `VSTACK` só,
  //     ancorado na primeira linha de dado. NADA pode ser escrito abaixo dele.
  celulasDe(A.HOJE, F.hojeCelulas(a.ID, gid));

  // 11. As quatro digitadas: instrução de estado vazio (agora em LINHA PRÓPRIA,
  //     ancorada em A, mesclada até o fim pela `formatar.js`) e cabeçalho. A
  //     nav delas já foi enfileirada acima.
  //     A âncora é `A{vazio}` — ACIMA do cabeçalho de propósito: uma fórmula
  //     na coluna A abaixo dele seria vista por `COUNTA` como linha ocupada e
  //     o append do Thor (T-6) pularia uma linha pra sempre.
  //     `Candidaturas` (Onda 5) NÃO tem `.vazio` — o estado vazio dela mora
  //     DENTRO do próprio spill (`IFERROR(corpo;vazio)`, escrito no passo 12b
  //     abaixo, mesmo padrão das vistas de notícia), não numa linha própria.
  //     `l.vazio` só existe pras quatro puras; `if (l.vazio)` é o que evita
  //     chamar `F.estadoVazioFormula` com uma aba que ela não conhece.
  for (const [aba, cab] of Object.entries(CABECALHOS_CRM_MIG)) {
    const l = F.LINHAS[aba];
    const ult = String.fromCharCode(64 + cab.length);
    if (l.vazio) cel(aba, `A${l.vazio}`, F.estadoVazioFormula(aba));
    poe(aba, `A${l.cabecalho}:${ult}${l.cabecalho}`, [cab]);
  }

  // 12. `Fila!id` — DERIVADA da url. Onda 12 (Leva 3) moveu o rótulo pra
  //     coluna C (era A; `o quê` tomou o lugar dela — identidade antes do
  //     derivado); a letra sai de `F.letraDe`, nunca literal, desde então.
  //     Antes de escrever a fórmula, confere que ninguém digitou id à mão na
  //     coluna: uma ARRAYFORMULA que encontra célula ocupada no caminho do
  //     spill NÃO sobrescreve — ela devolve "resultado do array não pôde ser
  //     expandido" e a coluna inteira morre. Sobrescrever também seria
  //     errado: seria apagar dado de JB sem avisar.
  {
    const l = F.LINHAS[A.FILA];
    const colId = F.letraDe(F.FILA_CABECALHO, 'id');
    const idsVivos = ((await a.ler(`${R(A.FILA)}!${colId}${l.dados}:${colId}1000`, 'valueRenderOption=FORMULA')).values || [])
      .map((linha, i) => ({ linha: l.dados + i, valor: String((linha || [])[0] || '') }))
      .filter(x => x.valor !== '' && !x.valor.startsWith('='));
    if (idsVivos.length) {
      throw new Error(
        `${A.FILA}!${colId} tem ${idsVivos.length} valor(es) DIGITADO(s) (linha(s) ${idsVivos.map(x => x.linha).join(', ')}) e essa coluna passa a ser ` +
        `derivada da url. A ARRAYFORMULA nao sobrescreve dado: ela morre inteira. Apague a coluna ${colId} a mao (o id volta sozinho pela url) e rode de novo.`
      );
    }
    cel(A.FILA, `${colId}${l.dados}`, F.FILA_ID_DERIVADO);
  }

  // 12c. Onda 17 — `Fila!o quê` e `Fila!trilha` DEIXAM DE SER
  //      DIGITADAS e viram DERIVADAS da url, mesmo mecanismo e mesma guarda
  //      do `id` acima (uma ARRAYFORMULA que encontra célula ocupada morre
  //      inteira; sobrescrever apagaria dado sem avisar). `Fila` está vazia
  //      desde que nasceu (medido antes desta rodada), então a guarda não
  //      deveria encontrar nada — mas roda de qualquer jeito, pela mesma
  //      razão que a de `id` roda: não presumir.
  {
    const l = F.LINHAS[A.FILA];
    const colOque = F.letraDe(F.FILA_CABECALHO, 'o quê');
    const colTrilha = F.letraDe(F.FILA_CABECALHO, 'trilha');
    const colParada = F.letraDe(F.FILA_CABECALHO, 'parada há');
    for (const [rotulo, col] of [['o quê', colOque], ['trilha', colTrilha]]) {
      const vivos = ((await a.ler(`${R(A.FILA)}!${col}${l.dados}:${col}1000`, 'valueRenderOption=FORMULA')).values || [])
        .map((linha, i) => ({ linha: l.dados + i, valor: String((linha || [])[0] || '') }))
        .filter(x => x.valor !== '' && !x.valor.startsWith('='));
      if (vivos.length) {
        throw new Error(
          `${A.FILA}!${col} (${rotulo}) tem ${vivos.length} valor(es) DIGITADO(s) (linha(s) ${vivos.map(x => x.linha).join(', ')}) e essa coluna passa a ser ` +
          `derivada da url (Onda 17). Apague a coluna ${col} a mao (o valor volta sozinho pela url) e rode de novo.`
        );
      }
    }
    cel(A.FILA, `${colOque}${l.dados}`, F.FILA_OQUE_DERIVADO);
    cel(A.FILA, `${colTrilha}${l.dados}`, F.FILA_TRILHA_DERIVADA);
    // `parada há` (L) é coluna NOVA — nunca existiu antes, então não há
    // dado de JB pra proteger; escreve direto.
    cel(A.FILA, `${colParada}${l.dados}`, F.FILA_PARADA_HA);
  }

  // 12d. Onda 16 — `Diário!contexto da resposta` (G), coluna NOVA e
  //      CALCULADA (`responde a`, F, continua digitada). Mesmo padrão de
  //      âncora única de `Fila!id`/`Fila!o quê` acima — sem guarda porque a
  //      coluna nunca existiu antes.
  {
    const l = F.LINHAS[A.DIARIO];
    const colContexto = F.letraDe(F.DIARIO_CABECALHO, 'contexto da resposta');
    cel(A.DIARIO, `${colContexto}${l.dados}`, F.DIARIO_CONTEXTO_RESPOSTA);
  }

  // 12b. `Candidaturas` (Onda 5) — o spill A:F (órgão/empresa · vaga ·
  //      trilha · inscrito em · aguardando há · `_url`), ancorado em
  //      `A{lista}`, e o veredito em `A{veredito}`. Nenhuma guarda de
  //      "digitado por cima" aqui: diferente de `Fila!A`, o spill de
  //      `Candidaturas` NUNCA foi digitado por JB (a aba é NOVA nesta
  //      Onda) — a guarda equivalente, pra sempre, é `G:L` (LEVA 7: cresceu
  //      de G:I pra G:K pra G:L) ficarem FORA deste range (F termina a
  //      escrita; a fórmula nunca alcança G).
  {
    const l = F.LINHAS[A.CANDIDATURAS];
    cel(A.CANDIDATURAS, `A${l.lista}`, F.CANDIDATURAS_FORMULA);
    cel(A.CANDIDATURAS, `A${l.veredito}`, F.CANDIDATURAS_VEREDITO);
  }

  // 13. `Projetos` — as quatro colunas CALCULADAS, uma fórmula por linha até
  //     PROJETOS_ULTIMA_LINHA (a aba nasceu assim, uma célula por linha e não
  //     ARRAYFORMULA; portar como fórmula por linha é o que preserva o
  //     formato ao regerar). G:H e J:K são escritas SEPARADAS de propósito:
  //     entre elas está `I` (notas), que é DIGITADA — um intervalo contíguo
  //     G:K gravaria fórmula por cima das notas de JB.
  //     Os BLOCOS contíguos são derivados de `F.PROJETOS_CALCULADAS`
  //     (`F.PROJETOS_BLOCOS_CALCULADOS`), não escritos à mão: a ordem de coluna
  //     acabou de mudar, e um `G:H`/`J:K` literal aqui gravaria fórmula em cima
  //     das colunas digitadas de JB sem erro nenhum.
  {
    const l = F.LINHAS[A.PROJETOS];
    const linhas = [];
    for (let n = l.dados; n <= F.PROJETOS_ULTIMA_LINHA; n++) linhas.push(n);
    for (const [de, ate] of F.PROJETOS_BLOCOS_CALCULADOS) {
      const cols = [];
      for (let c = de.charCodeAt(0); c <= ate.charCodeAt(0); c++) cols.push(String.fromCharCode(c));
      poe(A.PROJETOS, `${de}${l.dados}:${ate}${F.PROJETOS_ULTIMA_LINHA}`,
        linhas.map(n => cols.map(c => F.PROJETOS_CALCULADAS[c](n))));
    }
  }

  // -------------------- CAMADA NOTÍCIA --------------------
  // 14. As quatro vistas (Onda 8-9 + C10). Cada uma: veredito (linha 2),
  //     cabeçalho de coluna (linha 3, um bloco de 6 rótulos por tabela,
  //     repetido 4× com vãos entre eles) e QUATRO blocos de colunas
  //     independentes — um por faixa (hoje/7d/15d/30d), todos ancorados na
  //     MESMA linha (`LINHAS[aba].lista`), cada um no seu
  //     `noticiaColunaBase(i)` — C10 Parte 2, "4 tabelas lado a lado". Não
  //     há controle digitável: o seletor de recorte saiu (Onda 8-9 — JB
  //     pediu as tabelas visíveis ao mesmo tempo, não uma trocada por
  //     toque).
  //
  //     Nada é escrito abaixo da última tabela nem além do último bloco de
  //     colunas — território do spill, mesma regra dura que vale no `Hoje`.
  //     A aba de FATO não recebe escrita nenhuma daqui: quem a preenche é
  //     `node noticias.js sincronizar-sheets`.
  {
    const ult = F.colunaLetra(F.NOTICIA_CABECALHO.length - 1);
    for (const aba of A.VISTAS_NOTICIA) {
      const l = F.LINHAS[aba];
      celulasDe(aba, F.noticiaCelulas(aba));
      poe(aba, `A${l.cabecalho}:${ult}${l.cabecalho}`, [F.NOTICIA_CABECALHO]);
    }
    // O cabeçalho da aba de FATO é escrito pelo sync (ele é dono da aba
    // inteira, `clear` + escrita ancorada em A1), não aqui. Escrevê-lo dos
    // dois lados criaria duas fontes pra mesma linha.
  }

  // ---------- GUARDA DE SINTAXE, LOGO ANTES DE ESCREVER ----------
  //
  // Duas classes que NAO aparecem em teste de Node, porque a formula e so uma
  // string ate chegar na planilha - e as duas aconteceram de verdade nesta
  // Onda, nas mesmas horas:
  //
  //   (1) PARENTESE SOBRANDO. Reescrever `AVISO_SYNC` tirou um `LET` interno e
  //       deixou o fecha-parenteses dele. Resultado: `#ERROR!` na linha 1 do
  //       `Hoje` e na linha 2 das doze abas - o veredito da peca inteira, o
  //       alarme incluso, morto de uma vez.
  //   (2) NOME DE `LET` COM FORMA DE ENDERECO. `LET(k1;...)` e recusado porque
  //       `K1` e uma celula; devolveu `#NAME?` no lugar da lista nas quatro
  //       abas de noticia.
  //
  // As duas custam uma varredura de string e sao pegas ANTES da escrita, em
  // vez de virarem um `#ERROR!` que so a proxima leitura descobre.
  const problemas = [];
  for (const [faixaEscrita, valores] of escritas) {
    for (const linha of valores) {
      for (const valor of linha) {
        if (typeof valor !== 'string' || valor[0] !== '=') continue;
        let profundidade = 0, negativou = false;
        for (const ch of valor) {
          if (ch === '(') profundidade++;
          else if (ch === ')') { profundidade--; if (profundidade < 0) negativou = true; }
        }
        if (profundidade !== 0 || negativou) {
          problemas.push(`${faixaEscrita}: parenteses desbalanceados (saldo ${profundidade}${negativou ? ', fechou antes de abrir' : ''}) - ${valor.slice(0, 90)}...`);
        }
      }
    }
  }
  for (const nome of F.NOMES_LET) {
    if (F.PARECE_CELULA.test(nome)) {
      problemas.push(`F.NOMES_LET declara "${nome}", que tem forma de referencia A1 - LET recusa e a formula inteira vira #NAME?`);
    }
  }
  if (problemas.length) {
    throw new Error(
      `${problemas.length} formula(s) com sintaxe quebrada, NADA foi escrito:\n` + problemas.join('\n')
    );
  }

  const resp = await a.escreverVarios(escritas);
  console.log(`escrita única: ${escritas.length} faixa(s), ${resp.totalUpdatedCells || '?'} célula(s) atualizada(s)`);
  console.log(`  nav: ${Object.keys(F.NAV).length} aba(s), incl. ${A.HOJE} (linha ${F.LINHAS[A.HOJE].nav}, ${F.NAV[A.HOJE].length} destino(s) + marcador)`);
  console.log(`  ${A.HOJE}: ${F.HOJE_GRUPOS_COLUNA.length} grupo(s) de coluna, ${F.HOJE_BLOCOS.length} blocos no total ` +
    `(${F.HOJE_GRUPOS_COLUNA.map(g => g.map(c => c.toLowerCase()).join('+')).join(' | ')})`);
  console.log(`  digitadas: cabeçalho na linha ${F.LINHAS[A.TAREFAS].cabecalho}, dados a partir da ${F.LINHAS[A.TAREFAS].dados} — nada de JB tocado`);
  console.log(`  notícia: ${A.VISTAS_NOTICIA.length} vista(s) × ${F.NOTICIA_TABELAS_POR_ABA} tabela(s) ` +
    `(${F.NOTICIA_FAIXAS.map(f => f.rotulo).join(' · ')}), teto ${F.NOTICIA_TETO}/tabela, tema em coluna`);
  console.log(`  ${A.NOTICIAS_DADOS}: criada e dimensionada; quem escreve é \`node noticias.js sincronizar-sheets\``);

  // -------------------- ONDA 3 · PASSO 3 de 3 — RESTAURAR --------------------
  // Só agora — depois que `escreverVarios` acabou de gravar as fórmulas
  // novas — a `_url` de cada vista existe na ORDEM NOVA (o SORT recalculou
  // contra o `_ordem` de hoje). Ler antes disso leria a ordem de ONTEM.
  const resultadoRestaurar = await passoRestaurar(a, resultadoColher.mapa);
  console.log(
    `_estado restaurado: ${A.PAINEL} ${resultadoRestaurar.linhasPainel} linha(s), ` +
    `${A.TUDO} ${resultadoRestaurar.linhasTudo} linha(s), ${A.EMPREGOS} ${resultadoRestaurar.linhasEmpregos} linha(s) — ` +
    'coluna Inscrito escrita como VALOR, alinhada à url de cada linha'
  );
  console.log(
    `${A.CANDIDATURAS}: ${resultadoRestaurar.linhasCandidaturas} candidatura(s) viva(s) — ` +
    'estágio/próximo passo/notas restaurados como VALOR, alinhados à url de cada linha'
  );
}

// `require.main === module` — sem isto, QUALQUER `require('./construir')`
// (inclusive de um teste) dispararia `main()` contra a planilha de verdade.
// Exportar `passoColher`/`passoRestaurar` é o que permite
// `tests/estado-colher-restaurar.test.js` testar o modo de falha ("colher
// rejeita -> nada escrito") com um `api` dublê, sem rede nenhuma.
module.exports = { main, passoColher, passoRestaurar };

// E6 (Leva 4, remodelação 2026-09-01) — CERCA-SECA: `--help`/`-h` real e
// RECUSA de flag desconhecida ANTES de qualquer efeito (nenhuma leitura,
// nenhuma escrita) — mesmo padrão que `radar.js`/`noticias.js` já usam
// (`FLAGS_VALIDAS`/`--help` verificados antes do dispatch). Existe porque,
// na Leva 3, um `--help` inexistente em `_norman/` caiu direto no fluxo
// real e aplicou a build geral na planilha sem querer. `construir.js` não
// aceita NENHUMA flag hoje — qualquer `--algo` é desconhecida.
const USO_CONSTRUIR = 'Uso: node _norman/construir.js  (nenhuma flag além de --help/-h)';
if (require.main === module) {
  const argvNormalizado = process.argv.slice(2).map(a => (a === '-h' ? '--help' : a));
  if (argvNormalizado.includes('--help')) {
    console.log(USO_CONSTRUIR);
    process.exit(0);
  }
  const flagsDesconhecidas = argvNormalizado.filter(a => a.startsWith('--'));
  if (flagsDesconhecidas.length) {
    console.error(`[construir] flag(s) desconhecida(s): ${flagsDesconhecidas.join(', ')}`);
    console.error(USO_CONSTRUIR);
    process.exit(2);
  }
  main().then(() => console.log('OK')).catch(e => { console.error('ERRO\n' + e.message); process.exit(1); });
}
