'use strict';
// Gera a documentação técnica da planilha (fórmulas, abas, glossário de sinal)
// A PARTIR de _norman/formulas.js — a mesma fonte que foi colada na planilha.
// A doc e a planilha não podem divergir.
//
// ALVO: `docs/PLANILHA.md`, escrito diretamente por este script (fs.writeFileSync),
// NUNCA `README.md`. README.md deste repositório é escrito à mão (humano + agente) e
// não pode ser destruído por uma regeneração — por isso o gerador não depende mais de
// quem chama redirecionar stdout (`> README.md` era o risco: um hábito de digitar
// destruiria o autoral). Rode `node _norman/gerar-readme.js` e o arquivo é
// (re)escrito sozinho, sempre no mesmo lugar.
const fs = require('fs');
const path = require('path');
const F = require('./formulas');
const A = require('./abas');
const S = require('./siglas');
// C6 (Leva 5) — a legenda de sinal por aba vive em `_norman/notas.js`
// (`SINAL_LOCAL`), a MESMA fonte que vira nota de célula na planilha. O
// glossário do README abaixo é montado DELA, nunca uma segunda cópia do
// texto — é o que faz a "seção manual" sobreviver a uma regeneração: ela
// não é digitada no README, é CÓDIGO deste gerador, reproduzido
// identicamente toda vez que `node _norman/gerar-readme.js` roda.
const N = require('./notas');
const { listaFontes } = require('../fontes');
const NOTICIA_FONTES = require('../fontes-noticias');
const L = [];
const p = s => L.push(s);
// Letras das colunas calculadas de `Projetos`, DERIVADAS do cabeçalho vivo
// (invariante N-17: número/letra nunca é literal). A ordem de coluna já
// mudou uma vez nesta Onda e as chaves de `F.PROJETOS_CALCULADAS` vêm de
// `F.letraDe`, nunca de literal — usar o mesmo caminho aqui impede que este
// gerador reincida no defeito que o quebrou (`F.PROJETOS_CALCULADAS.G is
// not a function`, porque `G` parou de ser a letra de "movimentou").
const LP_MOV = F.letraDe(F.PROJETOS_CABECALHO, 'movimentou');
const LP_ABERTAS = F.letraDe(F.PROJETOS_CABECALHO, 'abertas');
const LP_PROX = F.letraDe(F.PROJETOS_CABECALHO, 'próximas tarefas');
const LP_ULT = F.letraDe(F.PROJETOS_CABECALHO, 'últimas movimentações');
const LP_QUEMAGE = F.letraDe(F.PROJETOS_CABECALHO, 'quem age');
const LP_PRAZO = F.letraDe(F.PROJETOS_CABECALHO, 'prazo');
const LP_NOTAS = F.letraDe(F.PROJETOS_CABECALHO, 'notas');
const PROJETOS_CALC_LETRAS = Object.keys(F.PROJETOS_CALCULADAS).sort();
const faixaCalc = ([a, b]) => (a === b ? a : a + ':' + b);
// Endereço de célula DERIVADO de `F.LINHAS` (invariante N-17). O README fala
// da planilha por endereço, e endereço é a coisa mais fácil de mudar e
// esquecer aqui: a linha de navegação empurrou o cromo de TODA aba uma linha
// pra baixo de uma vez. README que descreve uma planilha que não existe é pior
// que README ausente — passa em auditoria de leitura e manda quem consultar
// procurar célula que não tem.
const cel = (aba, papel, col) => '`' + (col || 'A') + F.LINHAS[aba][papel] + '`';
// Tabela-mestra de abas — DECLARADA antes de qualquer `p()` (as duas são
// consumidas tanto pela frase de contagem quanto pela tabela, e as duas
// precisam existir ANTES de qualquer chamada que as leia).
const DESCRICAO_ABA = {
  [A.HOJE]: ['VISTA', '**O painel do dia e o hub de navegação.** Oito blocos (vence, atenção, tarefas, fila, projetos, diário, notícia, radar) em quatro `VSTACK`, com a altura do que existe.', 'nunca'],
  [A.EMPREGOS]: ['VISTA', '**A resposta do emprego.** As vagas ordenadas por frescor × aderência, com funil pros 5 cortes. Congela 4 colunas (Abrir+Inscrito+Vaga+Publicada, 418 px — Onda UX 13 + V4/Leva 6): ação, checkbox, identidade e o sinal de frescor sempre visíveis, mesmo rolando o resto da linha.', 'nunca'],
  [A.PAINEL]: ['VISTA', '**A resposta do concurso.** Só o que é acionável hoje. Congela 4 colunas (Abrir+Inscrito+Vaga+Elegível?, 444 px — Ondas UX 11+13): ação, checkbox, identidade e a decisão sempre visíveis, mesmo rolando o resto da linha.', 'nunca'],
  [A.TUDO]: ['VISTA', '**OCULTA.** A análise do concurso: todos os editais, com funil pros 4 cortes. Consulta rara; volta com um clique (botão direito na tira → "Todas as guias").', 'nunca'],
  [A.NOTICIAS]: ['VISTA', 'Notícia de Brasil e mundo — política, economia, geopolítica.', 'nunca'],
  [A.IA]: ['VISTA', 'Notícia de IA — campo, ferramentas, Claude, Reddit/HN.', 'nunca'],
  [A.TRABALHO]: ['VISTA', 'Notícia de mercado de trabalho e concurso — **não é vaga** (vaga fica em `' + A.EMPREGOS + '`/`' + A.PAINEL + '`).', 'nunca'],
  [A.CIENCIA]: ['VISTA', 'Notícia de artigo científico e mundo acadêmico.', 'nunca'],
  [A.TAREFAS]: ['ESTADO', 'Ações concretas, cada uma amarrada (ou não) a um projeto. **Digitada.**', 'nunca'],
  [A.FILA]: ['ESTADO', 'Candidaturas em perseguição. **Digitada**, exceto `o quê`/`trilha`/`id`/`parada há` (derivadas da `url` — Onda UX 12 pôs `o quê` na coluna A, identidade antes do hash).', 'nunca'],
  [A.PROJETOS]: ['ESTADO', 'Frentes vivas. **Digitada**, exceto ' + PROJETOS_CALC_LETRAS.map(c => '`' + c + '`').join('/') + ' (calculadas).', 'nunca'],
  [A.DIARIO]: ['ESTADO', 'Registro append-only de decisão. **Digitada.**', 'nunca'],
  // ONDA UX 4 (remodelação 2026-09-01) — `dados (não edite)` passou a OCULTA
  // (`formatar.js OCULTAS`): visível, ela ocupava um slot da barra do
  // celular e partia o cluster do CRM ao meio. Ver o bloco de prose logo
  // abaixo de `ORDEM_DOC`.
  [A.DADOS]: ['FATO', '**OCULTA.** Espelho cru do store, 23 colunas. Território da máquina.', '**sobrescrita inteira**'],
  [A.NOTICIAS_DADOS]: ['FATO', '**OCULTA.** Espelho cru do store de notícias, ' + F.NOTICIA_FATO_CABECALHO.length + ' colunas — já chega com cluster e score calculados por `lib-noticias/`; não há `_calc` de notícia.', '**sobrescrita inteira**'],
  [A.CALC]: ['FATO', '**OCULTA.** Deriva tudo de `' + A.DADOS + '` uma vez; as abas de leitura só leem daqui.', 'nunca'],
  // Ondas 5/14/18-20 — as três que faltavam nesta tabela (nunca tinham entrado,
  // desde que nasceram — é a lacuna que o guarda de CANONICOS existe pra fechar).
  [A.CANDIDATURAS]: ['ESTADO', 'O funil DEPOIS da inscrição. **Nasce de** `' + A.ESTADO + '`, nunca digitada direto — só `estágio`/`próximo passo`/`notas` são.', 'nunca'],
  [A.ETAPAS]: ['ESTADO', 'Os marcos de cada projeto — a entidade que `' + A.PROJETOS + '` não tinha. **Digitada.**', 'nunca'],
  [A.ESTADO]: ['FATO', '**OCULTA.** A ÚNICA cópia do que JB marcou ("Inscrito", estágio de candidatura) — sobrevive à reescrita diária das vistas. `_calc`/`' + A.DADOS + '` podem ser apagados e redigitados; `' + A.ESTADO + '` não.', 'nunca']
};
// ONDA UX 4 (remodelação 2026-09-01) — espelha `formatar.js ORDEM`: escrita
// (CRM) antes de leitura (notícia); `Etapas` ao lado de `Projetos`/`Diário`;
// `dados (não edite)` some do meio do bloco e vai pro fim, oculta, junto das
// outras abas de máquina.
const ORDEM_DOC = [
  A.HOJE, A.EMPREGOS, A.PAINEL,
  A.TAREFAS, A.FILA, A.CANDIDATURAS, A.PROJETOS, A.DIARIO, A.ETAPAS,
  A.NOTICIAS, A.IA, A.TRABALHO, A.CIENCIA,
  A.TUDO, A.DADOS, A.NOTICIAS_DADOS, A.CALC, A.ESTADO
];

p('### Fórmulas das abas de leitura (`Concursos`, `Empregos`, `Concursos · tudo`, `_calc`)');
p('');
p('> Estas fórmulas são a **fonte canônica** — foram geradas de `_norman/formulas.js` e');
p('> coladas na planilha por API. Se editar uma, edite as duas. Rode');
p('> `node _norman/gerar-readme.js` pra regerar este arquivo (`docs/PLANILHA.md`).');
p('');
p('**' + ORDEM_DOC.length + ' abas, nesta ordem na barra** (' +
  ORDEM_DOC.filter(a => (DESCRICAO_ABA[a][1] || '').includes('OCULTA')).length + ' ocultas):');
p('');
p('> A ordem física abaixo é a de `_norman/formatar.js` (constantes `ORDEM`/`OCULTAS`, que o');
p('> `main()` de lá aplica via `updateSheetProperties`) — não são exportadas, então este');
p('> gerador não lê `formatar.js` de volta e não aborta sozinho se a ordem mudar lá sem');
p('> mudar aqui. Se a barra do celular divergir desta tabela, confira `formatar.js` primeiro.');
p('');
p('| # | Aba | Camada | O que é | Tocada pelo sync? |');
p('|---|-----|--------|---------|--------------------|');
ORDEM_DOC.forEach((aba, i) => {
  const [camada, oque, sync] = DESCRICAO_ABA[aba];
  p('| ' + i + ' | `' + aba + '` | ' + camada + ' | ' + oque + ' | ' + sync + ' |');
});
p('');
p('A ordem é por **job**, não por trilha nem por camada. `' + A.HOJE + '` abre a barra porque é a');
p('única aba que JB lê ANTES de decidir onde entrar. `' + A.EMPREGOS + '` vem antes de');
p('`' + A.PAINEL + '` por medição, não por hipótese: é a que ele abre todo dia e tem 3x mais');
p('linhas.');
p('');
p('**ONDA UX 4 (remodelação 2026-09-01) — escrita antes de leitura.** A ordem antiga foi');
p('medida ao vivo (AVALIACAO-UX.md Parte 2 §12) pondo as quatro vistas de notícia');
p('(LEITURA — o que a máquina trouxe, pra ver) nos slots 4-7 e as abas de ESCRITA');
p('(`' + A.TAREFAS + '` em diante — curadoria de JB) só a partir do slot 8: no celular, que mostra');
p('~3 nomes por vez, o cluster do CRM ficava atrás de abas que ninguém edita. Agora o CRM');
p('inteiro (`' + A.TAREFAS + '`·`' + A.FILA + '`·`' + A.CANDIDATURAS + '`·`' + A.PROJETOS + '`·`' + A.DIARIO + '`·`' + A.ETAPAS + '`) vem logo depois do');
p('radar de vaga, com `' + A.ETAPAS + '` explicitamente ao lado de `' + A.PROJETOS + '`/`' + A.DIARIO + '` (é a mesma');
p('superfície: os marcos de um projeto) — antes, `' + A.ETAPAS + '` nem entrava na lista que');
p('decide a ordem, e flutuava no índice que a API lhe desse (o último). As quatro vistas');
p('de notícia vêm DEPOIS do CRM. `' + A.DADOS + '` deixou de ser exceção visível: até esta Onda');
p('ela ficava fora da tela de abas ocultas porque "JB confere célula lá" — mas visível ela');
p('partia o cluster do CRM ao meio; agora fecha a fila oculta junto de `' + A.NOTICIAS_DADOS + '`/`_calc`/`' + A.ESTADO + '`,');
p('e conferir célula continua a um clique (desocultar), o mesmo custo que `' + A.TUDO + '` já paga.');
p('');
p('**`' + A.TUDO + '` foi OCULTADA, não fundida.** Ocultar ganha o slot da barra do celular do');
p('mesmo jeito que fundir ganharia (a barra mostra ~3 nomes antes de pedir arrasto),');
p('não perde a superfície, e desfaz com um clique. Fusão de dados não se desfaz. Ela');
p('continua sendo gerada inteira, com o sistema visual novo por dentro — uma aba viva');
p('com o desenho antigo por dentro seria pior que fundir.');
p('');
p('### A linha 1 de toda aba é a NAVEGAÇÃO');
p('');
p('O portal já **falava** navegação e não a **tinha**: três setas "▶ Empregos" escritas');
p('em texto puro, que JB lia e em seguida ia procurar o nome na tira de abas. Agora são');
p('células `HYPERLINK` de verdade.');
p('');
p('**ONDA UX 6 (remodelação 2026-09-01) — `' + A.HOJE + '` ganha nav COMPLETA.** Até esta Onda');
p('ela cobria só 6 dos 12 destinos possíveis (4 numa grade 2×2 própria + 2 pelos títulos de');
p('bloco). Medido por BFS (`_norman/AVALIACAO-UX.md` Parte 2 §11): `' + A.HOJE + '`, que é a PONTE');
p('entre as três ilhas da planilha (radar/CRM/notícia), não alcançava `' + A.CANDIDATURAS + '` nem');
p('`' + A.ETAPAS + '` em 1 toque — e isso sozinho custava 2+ toques em 93 dos 156 pares de abas.');
p('Agora `' + A.HOJE + '` está em `F.NAV` como qualquer outra aba, com os 12 destinos possíveis');
p('numa linha só (linha ' + F.LINHAS[A.HOJE].nav + ') + o marcador "você está aqui" — a MESMA função');
p('(`F.navCelulas`) que já escrevia a nav das outras 12 escreve a dela também.');
p('');
p('Toda outra aba carrega `' + F.ROTULO_NAV[A.HOJE] + '` na célula **A1** — posição constante é o que faz');
p('a barra virar cromo e parar de exigir leitura — mais até 4-5 destinos contextuais, e');
p('**termina** com uma célula que não é link: o texto plano "📍 " + o nome da própria aba,');
p('em fundo escuro — a marca "você está aqui" (Onda 18, agora também em `' + A.HOJE + '`).');
p('Sem ela, "onde estou" só se respondia lendo o rodapé do navegador (a tira de abas');
p('do próprio Sheets); agora a resposta está na PRIMEIRA linha da própria tela, em toda');
p('aba visível — inclusive na que já é o hub.');
p('');
p('| aba | A1 | B1 | C1 | D1 | E1 | você está aqui |');
p('|---|---|---|---|---|---|---|');
Object.entries(F.NAV).filter(([aba]) => aba !== A.HOJE).forEach(([aba, destinos]) => {
  const slots = destinos.map(d => F.ROTULO_NAV[d]);
  while (slots.length < 5) slots.push('');
  p('| `' + aba + '` | ' + slots.join(' | ') + ' | `' + F.navAqui(aba) + '` |');
});
p('');
p('`' + A.HOJE + '` (linha ' + F.LINHAS[A.HOJE].nav + ') foge da tabela de 5 colunas acima porque carrega');
p('os 12 destinos possíveis, não até 5 — a lista, na ordem em que aparece (mesma');
p('prioridade da barra de abas: radar · CRM · notícia), mais o marcador:');
p('');
p('`' + F.NAV[A.HOJE].map(d => F.ROTULO_NAV[d]).join('` · `') + '`');
p('');
p('...seguido de `' + F.navAqui(A.HOJE) + '` (marcador).');
p('');
p('**A URL é ABSOLUTA** (`https://docs.google.com/spreadsheets/d/<ID>/edit#gid=<gid>`),');
p('não `#gid=` relativo. O relativo não navega dentro do app de celular — leva sempre à');
p('primeira aba; a absoluta tem relato de funcionar. No desktop as duas funcionam.');
p('Entre "funciona nos dois" e "funciona num só" não há escolha a fazer.');
p('');
p('**O `gid` nunca é escrito à mão.** `_norman/construir.js` resolve por `a.meta()`');
p('depois de criar/renomear as abas e injeta na fórmula. Aba excluída e recriada muda de');
p('gid: um link com gid defasado **não quebra — ele aponta pra outra coisa**, e navega em');
p('silêncio pro lugar errado. `_norman/verificar.js` fecha o laço lendo a FÓRMULA viva de');
p('volta e comparando o gid de cada célula com o mapa de `sheetId` — com controle');
p('positivo (um link bom passa) e negativo (um gid fabricado reprova), porque instrumento');
p('que ninguém testa pode estar quebrado e passar em auditoria de leitura.');
p('');
p('`dados (não edite)` é a única aba **sem** navegação, e o motivo é técnico:');
p('`lib/sheets.js enviar()` faz `values.clear` + escrita ancorada em A1 todo dia.');
p('Qualquer link ali seria apagado de madrugada, em silêncio.');
p('');
p('### As fontes que alimentam o store');
p('');
p('| id | fonte | trilha |');
p('|---|---|---|');
listaFontes.forEach(f => p('| `' + f.id + '` | ' + f.nome + ' | ' + (f.trilha || 'docente') + ' |'));
p('');
p('São **' + listaFontes.length + ' coletores** atrás do mesmo contrato (`{ id, nome, coletar, textoParaFiltro,');
p('normalizarParcial, enriquecer }` — ver §Como adicionar uma fonte nova). Duas entraram');
p('depois da primeira versão desta seção e não estavam documentadas aqui:');
p('');
p('- **`pci` — PCI Concursos**, trilha docente, pelo servidor MCP oficial');
p('  (`POST https://mcp.pciconcursos.com.br/mcp`, JSON-RPC 2.0). É a segunda fonte da');
p('  trilha docente ao lado do DOU, e a dedupe entre as duas mora em');
p('  `lib/orgao-canonico.js`: a PCI concatena `"SIGLA - Nome completo"` no mesmo campo');
p('  (`"UFSCar - Universidade Federal de São Carlos"`) enquanto o DOU traz só o nome');
p('  por extenso, e sem canonizar o órgão o MESMO edital entraria duas vezes com dois');
p('  `id` diferentes — o hash inclui `orgao`.');
p('- **`weworkremotely` — We Work Remotely**, trilha mercado, por RSS de categoria');
p('  (`/categories/remote-design-jobs.rss` e `/categories/remote-programming-jobs.rss`).');
p('  O próprio feed publica a mesma vaga em duas categorias, então `coletar()` deduplica');
p('  antes de devolver. Atenção a um falso amigo já documentado no coletor: o campo');
p('  `<country>` do WWR **não** significa "a vaga é no Brasil" — o site é global.');
p('');
p('Nada disso muda uma linha das fórmulas: as fontes escrevem no store, e a planilha lê');
p('do store. É a mesma razão pela qual `trilha` é uma coluna e não uma aba.');
p('');
p('#### Duas trilhas, duas superfícies — e por que não uma só');
p('');
p('`dados (não edite)` é um store só, mas guarda duas coisas que **não são a mesma coisa**: edital de');
p('concurso docente (`trilha=docente`) e vaga de emprego (`trilha=mercado`). Renderizar as');
p('duas com o mesmo vocabulário produziu mentira literal na planilha: o veredito');
p('`aderente` caía no `else` do rótulo de elegibilidade e 359 vagas de front-end/UX');
p('apareciam como **"🎓 só com doutorado"** — e, como a ordenação é por prazo, elas');
p('empurraram os editais pra fora da dobra: o `Concursos` ficou com **1 edital visível e 359');
p('vagas** logo abaixo.');
p('');
p('Não é bug de string, é bug de **modelo**. Os eixos de decisão não se cruzam:');
p('');
p('| | trilha docente | trilha mercado |');
p('|---|---|---|');
p('| eixo temporal | prazo de inscrição (fato do DOU) | tempo no ar (idade da publicação) |');
p('| eixo de mérito | elegibilidade por titulação | aderência de perfil (score) |');
p('| o que é uma linha | um subedital de um edital | uma vaga de uma empresa |');
p('| vocabulário | edital, inscrição, titulação, campus, subedital | empresa, candidatura, senioridade, modalidade |');
p('');
p('A separação mora em **duas constantes-guarda**, e só nelas. Cada bloco de fórmulas');
p('abre com a sua e devolve `""` pro que não é dele:');
p('');
p('```');
p('FORA_DOCENTE -> bloco _calc!A:R   (consumido por Concursos e Concursos · tudo)');
p('FORA_MERCADO -> bloco _calc!AA:AK (consumido por Empregos)');
p('```');
p('');
p('Como toda coluna já abria com `IF(<guarda>;"";...)`, trocar a constante consertou o');
p('vazamento inteiro sem tocar em nenhuma fórmula individual.');
p('');
p('> **Soma booleana (`(x)+(y)>0`) em vez de `OR(x;y)`, de propósito.** `OR()` agrega o');
p('> array inteiro num único TRUE/FALSE dentro de `ARRAYFORMULA` e faria a guarda valer');
p('> pra todas as linhas ou pra nenhuma. Mesma razão pela qual `MIN(a;b)` não aparece em');
p('> lugar nenhum de `formulas.js` (agrega) e vira `IF(a>b;b;a)`.');
p('');
p('**A conta tem que fechar, e a planilha confere sozinha.** Se `trilha` não for nem');
p('`docente` nem `mercado`, a linha existe em `dados (não edite)` e não aparece em aba nenhuma — modo');
p('de falha silencioso criado pela própria separação. Por isso a `A2` do `Concursos` carrega');
p('um aviso condicional que compara `COUNTA(dados!A2:A)` com a soma das duas trilhas e só');
p('aparece quando sobra alguém. Provado com uma linha sintética de `trilha=freelance`.');
p('');
p('**Coluna nova em `dados (não edite)` entra sempre NO FIM.** As fórmulas referenciam por LETRA de');
p('coluna, não por nome; inserir no meio desloca tudo e quebra em silêncio. As 3 colunas');
p('da Onda 3 (`trilha` U, `modalidade` V, `senioridade` W) entraram depois de `id`, e');
p('nenhuma fórmula pré-existente mudou de letra. `tests/sheets.test.js` guarda esse');
p('invariante — afirma que os 20 primeiros nomes continuam na ordem original.');
p('');
p('Registro salvo antes da Onda 3 não tem `trilha` no store; `lib/sheets.js` grava o');
p('default `docente` (mesma regra de `radar.js trilhaDoRegistro()`). Isso importa mais na');
p('planilha que no store: `trilha` é **eixo de filtro**, e 205 células em branco criariam');
p('um terceiro valor mudo no funil e fariam `COUNTIF(dados!U2:U;"docente")` contar 0.');
p('');
p('`garantirAbas()` só CRIA aba que falte, por título — nunca reordena, nunca oculta,');
p('nunca formata. Por isso reordenar/ocultar/formatar é seguro, e por isso a aba de');
p('leitura precisa continuar se chamando `Concursos` (renomear faria o sync recriar uma');
p('`Concursos` vazia ao lado, ver `ABA_PAINEL` em `lib/sheets.js`).');
p('');
p('**Nenhuma fórmula tem intervalo de linha fixo.** Todas usam intervalo ABERTO');
p('(`dados!A2:A`, não `dados!A2:A206`) — o store cresce e fórmula com limite fixo');
p('quebra em silêncio. Provado: com 512 linhas em `dados (não edite)`, zero erro e as 512');
p('aparecem em `Concursos · tudo`.');
p('');
p('**A janela de ' + F.JANELA + ' dias é MEDIDA, não chutada.** Dos 67 registros com');
p('`inscricao_fim` conhecida, 100% fecham no máximo 48 dias depois da publicação');
p('(p95 = 39 d). Por isso um registro SEM prazo publicado há ≤ ' + F.JANELA + ' d ainda');
p('conta como possivelmente aberto, e um publicado há mais que isso sai do `Concursos` —');
p('mas **nunca some**: continua em `Concursos · tudo`, e o `Concursos` diz na linha 2 quantos ficaram');
p('de fora. Dado ausente nunca vira "não" por omissão (mesma doutrina de §Elegibilidade).');
p('');
p('**Os tiers** (coluna `tier` da `_calc`) ordenam por PRAZO primeiro, elegibilidade');
p('depois — "aberto" é fato verificável, "sem prazo" é hipótese:');
p('');
p('| tier | significado | no `Concursos`? |');
p('|------|-------------|--------------|');
p('| 1 | aberto · você pode prestar | sim |');
p('| 2 | aberto · titulação a confirmar | sim |');
p('| 3 | aberto · só com doutorado | sim |');
p('| 4 | sem prazo (≤ ' + F.JANELA + ' d) · você pode prestar | sim |');
p('| 5 | sem prazo (≤ ' + F.JANELA + ' d) · titulação a confirmar | sim |');
p('| 6 | sem prazo (≤ ' + F.JANELA + ' d) · só com doutorado | sim |');
p('| 7 | sem prazo, fora da janela | não — só em `Concursos · tudo` |');
p('| 8 | encerrado | não — só em `Concursos · tudo` |');
p('');
p('**Locale-alvo: Português (Brasil)** — separador de argumento `;`. Em locale en-US,');
p('troque todo `;` por `,`. Os nomes de função ficam em inglês de propósito: o Sheets');
p('aceita nome inglês em qualquer locale, só o separador muda.');
p('');
const COLS = Object.keys(F.CALC);
const ULT = COLS[COLS.length - 1];
const W = String.fromCharCode(F.SIGLAS_COL.charCodeAt(0) + 1);

p('#### Nome da instituição — por que não existe mais "UF de São Carlos"');
p('');
p('`UF` é a sigla de **unidade federativa** e aparece na MESMA linha do card');
p('(`SP · …`). Abreviar "Universidade Federal" como `UF` fazia o leitor traduzir a');
p('mesma sigla duas vezes por linha com sentidos diferentes, e colava visualmente');
p('cards de instituições distintas — `MT · UF de Mato Grosso` logo abaixo de');
p('`MT · IF de Mato Grosso`. Isso valia para **22 de 22** cards do `Concursos`.');
p('');
p('O nome curto sai de duas camadas, nesta ordem:');
p('');
p('1. **Sigla canônica**, por `VLOOKUP` na tabela `_calc!' + F.SIGLAS_COL + ':' + W + '` —');
p('   `UFSCar`, `IFMT`, `UNILA`, `UFRGS`. É como JB chama a instituição e é o mais');
p('   curto. Fonte: `_norman/siglas.js`, hoje com **' + Object.keys(S.SIGLAS).length + ' instituições**.');
p('2. **Fallback tipográfico**, para qualquer instituição fora do mapa — mais longo,');
p('   **nunca errado**, e sem sigla inventada:');
p('');
p('| encontra | vira |');
p('|----------|------|');
S.FALLBACK.forEach(([de, para]) => p('| `' + de + '` | `' + para + '` |'));
p('');
p('**Só entra no mapa sigla que é nome próprio institucional verificável, nunca');
p('derivada por regra de string.** A prova de que regra de string não serve está');
p('no próprio store: Itajubá é `UNIFEI` (não "UFI"), Catalão é `UFCAT` (não "UFC",');
p('que é o Ceará), Alfenas é `UNIFAL-MG`, Farroupilha é `IFFar`. Sigla é fato');
p('institucional — chute vira erro factual numa peça de decisão. Na dúvida, deixe');
p('cair no fallback: ele custa caracteres, não correção.');
p('');
p('**A cobertura se confere, não se supõe** — um mapa envelhece em silêncio:');
p('');
p('```bash');
p('node _norman/cobertura-siglas.js');
p('```');
p('');
p('Lê `dados!A2:A` de verdade e lista o que caiu no fallback, com contagem e com o');
p('texto exato que JB vê. Aborta sozinho (`exit 1`) se um dos três controles');
p('reprovar: **C1** um nome que tem que resolver pelo mapa e não resolveu (lookup');
p('quebrado); **C2** um nome inventado que tem que cair no fallback e não caiu (mapa');
p('casando demais); **C3** qualquer nome curto que reintroduza a colisão — igual a');
p('sigla de UF, ou começando com `UF ` ou com sigla de UF. Hoje: **' + Object.keys(S.SIGLAS).length + ' entradas,');
p('46/46 instituições do store resolvidas pelo mapa, 0 no fallback.**');
p('');
p('> A regra do C3 é estreita **de propósito, e foi estreitada depois de medir**: a');
p('> primeira versão proibia qualquer prefixo de 2 letras e reprovou `IF Goiano` e');
p('> `IF Sudeste MG`, que são o nome próprio dessas instituições. Regra que reprova o');
p('> que está certo é a regra errada. `IF` não é sigla de unidade federativa nenhuma,');
p('> não é ambíguo, e fica.');
p('');
p('#### Aba `_calc` (oculta) — a derivação');
p('');
p('Cabeçalho em `A1:' + ULT + '1`:');
p('');
p('```');
p(F.CALC_CABECALHO.join(' | '));
p('```');
p('');
p('A tabela de siglas vive em `' + F.SIGLAS_COL + ':' + W + '` da mesma aba — fora do bloco de fórmulas,');
p('aberta pra baixo (o mapa cresce), escrita por `_norman/construir.js` a partir de');
p('`_norman/siglas.js`. Como `_calc` nunca é tocada pelo sync, a tabela sobrevive.');
p('');
p('A coluna `' + F.FERIADOS_COL + '` guarda a **lista de feriados nacionais** (' + require('./feriados').tabela().length + ' datas, ano corrente ±) que o');
p('`NETWORKDAYS` do aviso de planilha desatualizada consulta — gerada por');
p('`_norman/feriados.js` a partir de `lib/feriados-nacionais.js`, o mesmo módulo que');
p('`rodar-diario.bat` usa pra decidir se roda. Fica em `' + F.FERIADOS_COL + '` com `X` de folga entre ela e a');
p('tabela de siglas; `_norman/construir.js` aborta se as duas colidirem.');
p('');
p('Uma fórmula por coluna, todas na **linha 2** (espalham sozinhas pra baixo):');
p('');
Object.keys(F.CALC).forEach(col => {
  p('`_calc!' + col + '2`:');
  p('');
  p('```');
  p(F.CALC[col]);
  p('```');
  p('');
});
p('#### Aba `Concursos` — a resposta');
p('');
p(cel(A.PAINEL, 'veredito') + ' (o veredito: responde o job primário em uma frase, contra `TODAY()`):');
p('');
p('```');
p(F.PAINEL.veredito);
p('```');
p('');
p(cel(A.PAINEL, 'contagem') + ' (as contagens, inclusive quantos ficaram fora e por quê — e, no fim, o aviso');
p('de concentração):');
p('');
p('```');
p(F.PAINEL.contagem);
p('```');
p('');
p('O **aviso de concentração** é o trecho final da ' + cel(A.PAINEL, 'contagem') + '. Existe porque 15 das 23');
p('linhas de hoje são subeditais do mesmo edital da UFSCar: sem aviso, o `Concursos` lê');
p('como monólito e as 8 que **não** são UFSCar somem no meio. Ele filtra pela mesma');
p('condição da lista (`ISNUMBER(ordem)` + `tier<=6`), então nunca diverge da lista');
p('logo abaixo, e só aparece quando uma instituição responde por **≥5 linhas E ≥40%**');
p('— do contrário some sozinho, sem ocupar a linha congelada. Provado nos 5 ramos:');
p('5/7 mostra · 5/13 some (38%) · 4/5 some (`mx<5`) · 1 linha some · lista vazia');
p('some sem `#N/A`.');
p('');
p('Sem decimal na fórmula **de propósito** (`mx*10<n*4` em vez de `mx/n<0,4`): o');
p('separador decimal muda com o locale, `*10` não. E o texto diz "mesma');
p('**instituição**", não "mesmo edital" — edital é o que se vê olhando; instituição');
p('é o que a fórmula consegue **afirmar** com o campo que existe.');
p('');
p(cel(A.PAINEL, 'cabecalho') + ' em diante (cabeçalho — `_url` e `_ordem` ficam em colunas OCULTAS):');
p('');
p('```');
p(F.PAINEL.cabecalho.join(' | '));
p('```');
p('');
p(cel(A.PAINEL, 'lista') + ' (a lista: tiers 1-6, já ordenada — sem filtro, sem ordenação manual):');
p('');
p('```');
p(F.PAINEL.lista);
p('```');
p('');
p(cel(A.PAINEL, 'lista', 'E') + ' (o link, montado da coluna C oculta — URL de 90 chars não cabe no celular):');
p('');
p('```');
p(F.PAINEL.abrir);
p('```');
p('');
p(cel(A.PAINEL, 'lista', 'F') + ' (`link (copiar)`: a mesma URL em TEXTO, na última coluna, fora da dobra):');
p('');
p('```');
p(F.PAINEL.linkCopiar);
p('```');
p('');
p('Esta coluna é o insumo do job **"vi uma vaga, quero pôr na Fila"**, que era o mais');
p('quebrado da peça — e o dado provava: a `' + A.FILA + '` tinha ZERO linhas. Não por falta de');
p('vontade: obter a URL exigia desocultar a coluna `_url` (≈3 passos no celular) e o `id`');
p('exigia um lookup manual em 750 linhas de `' + A.DADOS + '`. Uma aba de captura cujo custo de');
p('captura é proibitivo fica vazia. Agora a URL está em texto, e o `id` sai dela sozinho');
p('do lado de lá. Coluna DERIVADA por `ARRAYFORMULA` ancorada na coluna do spill, nunca');
p('digitada ao lado dele — coluna digitada ao lado de um `FILTER` desalinha em silêncio');
p('quando o filtro muda de tamanho. Fora da dobra é o preço certo: copiar link é ação');
p('deliberada, e o começo da linha pertence ao que se lê num relance.');
p('');
p('#### Aba `Concursos · tudo` — a análise (OCULTA na barra)');
p('');
p(cel(A.TUDO, 'veredito') + ' (o que é esta aba):');
p('');
p('```');
p(F.TUDO.veredito);
p('```');
p('');
p(cel(A.TUDO, 'cabecalho') + ' em diante (cabeçalho — é a linha do funil; `_url` e `_ordem` ocultas):');
p('');
p('```');
p(F.TUDO.cabecalho.join(' | '));
p('```');
p('');
p(cel(A.TUDO, 'lista') + ' (o arquivo completo da trilha docente, mesma ordem do `Concursos`):');
p('');
p('```');
p(F.TUDO.lista);
p('```');
p('');
p(cel(A.TUDO, 'lista', 'J') + ' (o link):');
p('');
p('```');
p(F.TUDO.abrir);
p('```');
p('');
p('**Os 4 cortes secundários saem do funil da linha ' + F.LINHAS[A.TUDO].cabecalho + ' da `Concursos · tudo`**, e só funcionam');
p('porque as colunas de eixo têm valores POUCOS e ESTÁVEIS: Situação = 3 valores,');
p('Elegibilidade = 3, UF = 22, Área = 5 (normalizada de 9 valores crus sujos, um deles');
p('com 130 caracteres). A contagem de dias vive na coluna `Prazo` — que tem 138 valores');
p('distintos e MUDA TODO DIA, e por isso **não é eixo de filtro**. Era o defeito da');
p('versão anterior: `"🟢 aberta (16 dias)"` era um valor, não uma categoria, e qualquer');
p('filtro salvo em cima dele quebrava no dia seguinte.');
p('');
p('#### Aba `Empregos` — a resposta do mercado');
p('');
p('Responde um job só, o que JB formulou como **"que vaga abriu que combina comigo?"**.');
p('Não é a `Concursos · tudo` da trilha mercado nem o `Concursos` dela: é uma superfície de ação no');
p('topo que vira garimpo conforme se rola, sem trocar de aba.');
p('');
p('**O eixo temporal é OUTRO, e isso foi medido, não suposto.** Na trilha docente o eixo');
p('é o prazo: `inscricao_fim` é fato publicado no DOU e discrimina. Na trilha mercado o');
p('MESMO campo é fantasma — no store de 26/08/2026, com 359 vagas da Gupy:');
p('');
p('| `inscricao_fim` | quantas |');
p('|---|---|');
p('| futuro | 343 |');
p('| vencido | **0** |');
p('| ausente | 16 |');
p('');
p('Um campo que joga 343 de 359 no mesmo balde não separa nada. Pior: **46 vagas');
p('publicadas há mais de 90 dias — uma delas há 1828 dias, de 2021** — seriam impressas');
p('como `🟢 ABERTO · fecha em N d` se herdassem a fórmula docente. Isso não é');
p('imprecisão: é a peça afirmando, com ícone verde, uma coisa que ela não sabe. Por isso');
p('`inscricao_fim` **não aparece** nesta aba (continua cru em `dados!M`, nada foi');
p('apagado) e o eixo é a **idade da publicação**, que distribui de verdade:');
p('');
p('| balde | quantas | é o quê |');
p('|---|---|---|');
p('| `🔥 hoje` | 6 | o delta desde ontem |');
p('| `🟢 até 7 d` | 68 | ainda quente |');
p('| `🟡 8 a 30 d` | 142 | vale tentar |');
p('| `⚪ 31 a 90 d` | 97 | provavelmente fechada |');
p('| `🗄️ + de 90 d` | 46 | arquivo |');
p('| `❓ sem data` | 0 hoje | estado real, provado por linha sintética |');
p('');
p('**Balde, não número de dias** — mesma lei que já vale na `Concursos · tudo`: coluna que é eixo de');
p('filtro precisa de valores POUCOS e ESTÁVEIS. `"há 13 d"` muda todo dia e tem ~100');
p('variantes; filtro salvo em cima dele quebra amanhã. O número exato não some: ele **é**');
p('a ordenação (dentro do balde, a mais recente primeiro) e a data crua está em `dados!N`.');
p('');
p('**Os limiares do `Match`.** ' + F.SCORE_MINIMO + ' não é chute: é');
p('`config/notificacao.json → score_minimo`, o mesmo corte que decide se a vaga vira');
p('mensagem no Telegram — a peça e a notificação passam a concordar sobre o que é');
p('"combina". ' + F.SCORE_FORTE + ' é o quartil superior MEDIDO no dado real (88 de 359 =');
p('24,5%), não um número redondo escolhido por simetria.');
p('');
p('| `Match` | faixa de score | quantas |');
p('|---|---|---|');
p('| `🟩 forte` | ≥ ' + F.SCORE_FORTE + ' | 88 |');
p('| `🟨 combina` | ' + F.SCORE_MINIMO + ' a ' + (F.SCORE_FORTE - 1) + ' | 182 |');
p('| `⬜ fraca` | < ' + F.SCORE_MINIMO + ' | 89 |');
p('| `⏳ não pontuada` | sem score (antes do `julgar`) | 0 hoje |');
p('');
p('**A ordem é balde ASC, depois score DESC, depois idade ASC.** O balde manda porque o');
p('job pergunta "que vaga ABRIU"; dentro da mesma faixa temporal, quem decide é o quanto');
p('combina. Mesma doutrina do `Concursos`, onde o eixo primário é o prazo (fato) e o');
p('secundário é a elegibilidade (juízo): **fato antes de heurística**.');
p('');
p('`Abrir` é a **coluna A**, não a última. O bloco do `FILTER` precisa ser contíguo');
p('(`AA:AH` → `C:J`, a partir de `Vaga`), então o link só cabe antes dele ou depois — e');
p('depois cairia fora da dobra: abrir a vaga, que é a ação inteira desta aba, custaria um');
p('arrasto lateral. **Onda UX 13** — `Inscrito` entrou em **B**, entre `Abrir` e `Vaga`');
p('(única posição que não interrompe o bloco contíguo do `FILTER`). **V4 (Leva 6)** —');
p('`Empregos` congela 4 colunas (Abrir+Inscrito+Vaga+Publicada, 418 px), não mais 3: ação,');
p('checkbox, identidade da vaga E o sinal de frescor (🔥/🟢/🟡/⚪/🗄️) sempre visíveis, mesmo');
p('rolando o resto da linha — o mesmo mecanismo que já garante `Elegível?` em `Concursos`.');
p('Os 4 eixos de filtro restantes ficam à direita, a um arrasto — que é o custo certo pra');
p('uma operação deliberada e o custo errado pra ação principal.');
p('');
p('**Os 5 cortes do funil da linha ' + F.LINHAS[A.EMPREGOS].cabecalho + '**, todos com poucos valores estáveis:');
p('`Quando` 6 · `Match` 4 · `Área` 3 · `Modalidade` 4 · `Nível` 10. Nenhuma delas contém');
p('número de dias nem score cru.');
p('');
p('> **Sem aviso de concentração aqui, e é decisão medida.** No `Concursos` ele existe');
p('> porque 15 das 22 linhas são subeditais do mesmo edital. Aqui, 359 vagas se espalham');
p('> por 215 empresas e a maior concentração é 14 (3,9%), muito abaixo do gatilho de ≥5');
p('> linhas E ≥40% — o aviso nunca dispararia. E custaria caro: a fórmula é `COUNTIF` por');
p('> linha via `MAP/LAMBDA`, ~359² comparações a cada abertura no celular. Feature que');
p('> não dispara e ainda pesa é feature sem tarefa.');
p('');
p('**O nome da empresa é truncado em 34 caracteres, não limpo.** `orgao` na trilha');
p('mercado é o `careerPageName` cru da Gupy, que é campo de marketing e não razão social');
p('— `"VENHA SER #SANGUELARANJA 🧡🚀"` (14 vagas), `"Assaí Atacadista - O atacadista com');
p('50 anos de tradição! #VemserAssaí"` (69 chars); 25 dos 215 nomes passam de 30. Cortar');
p('no `" - "` daria `"Assaí Atacadista"` (certo) mas também `"IBS"` e `"SENAI"` (perda de');
p('sentido), e nenhuma regra de string sabe qual empresa é `#SANGUELARANJA`. Truncar');
p('custa caracteres, nunca correção — mesma doutrina do fallback de siglas.');
p('');
p(cel(A.EMPREGOS, 'veredito') + ' (o veredito — cascata de 6 ramos, do melhor caso ao vazio absoluto):');
p('');
p('```');
p(F.EMPREGOS.veredito);
p('```');
p('');
p(cel(A.EMPREGOS, 'contagem') + ' (contagens + aviso condicional de "ainda sem pontuação"):');
p('');
p('```');
p(F.EMPREGOS.contagem);
p('```');
p('');
p(cel(A.EMPREGOS, 'cabecalho') + ' em diante (cabeçalho — é a linha do funil; `_url` e `_ordem` ocultas):');
p('');
p('```');
p(F.EMPREGOS.cabecalho.join(' | '));
p('```');
p('');
p(cel(A.EMPREGOS, 'lista') + ' (o link, montado da coluna H oculta):');
p('');
p('```');
p(F.EMPREGOS.abrir);
p('```');
p('');
p(cel(A.EMPREGOS, 'lista', 'B') + ' (a lista inteira, já ordenada):');
p('');
p('```');
p(F.EMPREGOS.lista);
p('```');
p('');
p(cel(A.EMPREGOS, 'lista', 'J') + ' (`link (copiar)` — a URL em texto, gêmea da coluna F da `' + A.PAINEL + '`):');
p('');
p('```');
p(F.EMPREGOS.linkCopiar);
p('```');
p('');
p('#### Aba `_calc` — o bloco da trilha mercado (`AA:AK`)');
p('');
p('Mora em `AA` em diante, deixando `S..Z` livres: `_calc!' + F.SIGLAS_COL + ':' + W + '` já é a tabela de');
p('siglas das instituições docentes e está provada — encostar nela pra ganhar 6 colunas');
p('de vizinhança seria trocar risco por nada. Por isso `construir.js` escreve os dois');
p('blocos em chamadas SEPARADAS: um `A2:AK2` contíguo gravaria vazio por cima de `V2:W2`');
p('e decapitaria a tabela, fazendo o `VLOOKUP` da coluna R errar a primeira instituição');
p('em silêncio.');
p('');
p('`AA:AH` é o bloco **visível e contíguo** (é o que o `FILTER` da `Empregos` lê);');
p('`AI:AK` são auxiliares que ficam fora dele. `construir.js` tem guardas que levantam');
p('exceção antes de qualquer escrita se o bloco mudar de tamanho sem que o `FILTER`, o');
p('índice do `SORT` e o cabeçalho mudem junto.');
p('');
p('Cabeçalho em `AA1:AK1`:');
p('');
p('```');
p(Object.values(F.CALC_MERCADO_CABECALHO).join(' | '));
p('```');
p('');
p('Uma fórmula por coluna, todas na **linha 2** (espalham sozinhas pra baixo):');
p('');
Object.keys(F.CALC_MERCADO).forEach(col => {
  p('`_calc!' + col + '2`:');
  p('');
  p('```');
  p(F.CALC_MERCADO[col]);
  p('```');
  p('');
});
p('**Formatação** (aplicada por `_norman/formatar.js`, sobrevive ao sync porque a API');
p('de `values` não mexe em formato): congelamento (`Concursos` 3 linhas, `Empregos` 3,');
p('`Concursos · tudo` 2), larguras de coluna, quebra de linha, 4 regras de formatação condicional por');
p('tier/balde em cada aba de leitura, funil na `Concursos · tudo` e na `Empregos`, `_calc` oculta e');
p('ordem das abas.');
p('');
p('> A limpeza de formatação condicional lê quantas regras EXISTEM (o GET da planilha já');
p('> traz `conditionalFormats`) e apaga em UMA chamada, com os índices em ordem');
p('> decrescente. Antes ela chutava "até 12 por aba" e mandava uma requisição por índice,');
p('> engolindo o erro quando a regra não existia — 36 requisições pra apagar 8 regras');
p('> reais. A cota de escrita do Sheets é **60/min por usuário** e é compartilhada com');
p('> `construir.js`: rodar os dois em sequência estourava a cota e a formatação morria no');
p('> meio, deixando a planilha meio-formatada. Foi observado, não previsto.');
p('');
p('#### O carimbo de sync — como a planilha sabe de quando ela é');
p('');
p('Todas as contas desta planilha são fórmulas contra `TODAY()`: elas se refazem sozinhas e');
p('ficam **certas** mesmo que o radar pare. Se `rodar-diario.bat` morrer — tarefa');
p('desagendada, `.env` corrompido, credencial expirada, PC desligado — a planilha continua');
p('abrindo linda, com "fecha em 12 d" recalculado direitinho, e o que é novo simplesmente');
p('não aparece. É o pior modo de falha possível: **a peça parece saudável enquanto morre.**');
p('É a mesma doutrina que produziu a saúde barulhenta do coletor ("0 itens relevantes nunca');
p('pode ser indistinguível de coletor quebrado"), que estava violada aqui em cima.');
p('');
p('`MAX(data_publicacao)` seria um proxy **mentiroso**: "nenhum edital novo há 6 dias" é');
p('estado normal do DOU. Só o próprio sync sabe que rodou.');
p('');
p('| Onde | O quê | Escrito por |');
p('|------|-------|-------------|');
p('| `' + A.DADOS + '!Y1` | data do último sync, ISO 8601 cru (`2026-08-26`) | `lib/sheets.js enviar()`, **por último**, depois dos dados |');
p('| `' + A.DADOS + '!Z1` | a mesma coisa por extenso, com hora e fuso | idem, na mesma escrita |');
p('| `' + A.CALC + '!Y2:Y` | feriados nacionais, pro `NETWORKDAYS` | `_norman/construir.js`, de `_norman/feriados.js` |');
p('');
p('Fica em `' + A.DADOS + '` e **não** em `' + A.CALC + '` por direção de dependência: `' + A.CALC + '` é território de');
p('`_norman/construir.js` e pode não existir (planilha nova, aba apagada à mão). Se `enviar()`');
p('escrevesse lá, o sync diário passaria a depender da camada de apresentação e morreria de');
p('madrugada num setup limpo. O bloco de dados vai de A a W e a grade tem 26 colunas —');
p('Y e Z sobram, e `tests/sheets.test.js` guarda a folga: se `COLUNAS` crescer até alcançar');
p('Y, o teste cai **antes** de um campo novo sobrescrever o carimbo.');
p('');
p('ISO 8601 pelo mesmo motivo de `inscricao_fim`: é o único formato que `DATEVALUE()` lê sem');
p('ambiguidade em qualquer locale. E a data é a **local**, não UTC — a planilha está em');
p('`America/Sao_Paulo` e `TODAY()` responde nesse fuso; o log da tarefa registra execuções às');
p('19:04, que em UTC já é o dia seguinte.');
p('');
p('**O aviso.** As linhas 1 das três abas de leitura ganham um prefixo condicional:');
p('');
p('```');
p('🛑 SEM ATUALIZAR DESDE 19/08 — 5 dias úteis. O que é NOVO não está aqui (as contas de');
p('prazo abaixo continuam certas). Confira a tarefa RadarAcademicoJB no Agendador de');
p('Tarefas do Windows e se o PC ficou ligado.');
p('```');
p('');
p('A abertura é curta de propósito. `A1` é célula **mesclada com WRAP**, e a altura');
p('RENDERIZADA da linha é a única coisa desta entrega que não deu pra provar: a planilha');
p('exige o login do JB (a service account não renderiza) e `rowMetadata.pixelSize` devolve o');
p('valor ARMAZENADO — medido, devolve 21 antes e depois de 480 caracteres numa célula');
p('mesclada com WRAP, ou seja, o instrumento é cego pra isso. Se o Sheets não crescer a linha');
p('sozinho, sobra a primeira linha visual — e `🛑 SEM ATUALIZAR DESDE 19/08` são 27');
p('caracteres que já carregam sinal + veredito + data. O resto é aprofundamento, não');
p('sustentação. **O argumento sobrevive à redução.**');
p('');
p('Carimbo **ausente ou ilegível** tem ramo próprio (`🛑 SEM CARIMBO DE DATA — esta planilha');
p('não sabe de quando ela é`) — é tão grave quanto carimbo velho, e cair no silêncio seria');
p('voltar ao problema. Nas');
p('**três** abas porque a falha é global e invalida a própria linha 1: não adianta dizer');
p('"🟢 3 abertas que você pode prestar AGORA" se a contagem é de seis dias atrás. Cobrir as');
p('três não custa três vezes — no estado normal os três ramos devolvem `""`, zero caractere');
p('e zero linha.');
p('');
p('**O limiar é ' + F.LIMIAR_ATRASO_DIAS_UTEIS + ' dias ÚTEIS, e foi medido.** Fonte: `logs/rodar-diario.log`, o histórico');
p('completo da automação (13/08 a 26/08/2026) — execuções em 13, 14, 17, 18, 19, 20, 21, 24,');
p('25 e 26, que são exatamente os **10 dias úteis** do intervalo. 10 de 10 esperadas, zero');
p('perdida. O mesmo log mostra que a HORA não é estável: o normal é 08:00, mas há execuções');
p('às 14:38, 18:59 e 19:04 — o Task Scheduler recupera um início perdido mais tarde no mesmo');
p('dia. Logo:');
p('');
p('| Atraso | Significa | Peça |');
p('|--------|-----------|------|');
p('| 0 | sincronizou hoje | silêncio |');
p('| 1 | carimbo do dia útil anterior; a execução de hoje ainda pode acontecer até a noite | silêncio |');
p('| 2 | um dia útil inteiro sem execução — "o PC ficou desligado ontem", se conserta sozinho amanhã | silêncio |');
p('| ≥ ' + F.LIMIAR_ATRASO_DIAS_UTEIS + ' | **dois** dias úteis consecutivos sem execução. Não é acidente. | **acende** |');
p('');
p('Acender em 2 seria o anti-padrão que este projeto já pagou uma vez — "um radar que grita');
p('todo sábado é um radar que JB silencia" — e o custo seria permanente. Esperar até ' + F.LIMIAR_ATRASO_DIAS_UTEIS + ' custa');
p('um dia de atraso na descoberta, e a partir daí o aviso acende todo dia até alguém');
p('consertar.');
p('');
p('**Dia útil e não dia corrido** porque `rodar-diario.bat` roda Seg-Sex e pula feriado');
p('nacional (a 1ª linha dele chama `lib/feriados-nacionais.js diaSemPublicacaoEsperada`). Em');
p('dias corridos, sexta → segunda de manhã já são 3: o aviso gritaria **toda segunda**.');
p('`NETWORKDAYS` ignora fim de semana sozinho; o feriado vem da tabela em `' + A.CALC + '!Y`, gerada do');
p('MESMO módulo que o `.bat` consulta — planilha e agendador concordam por construção sobre o');
p('que é "dia sem execução esperada". Sem a tabela, uma única execução perdida ao lado de um');
p('feriado somaria 3 e acenderia com o radar funcionando.');
p('');
p('#### Como provar que ainda funciona');
p('');
p('```bash');
p('node _norman/construir.js   # cria/atualiza abas e fórmulas (idempotente)');
p('node _norman/formatar.js    # larguras, congelamento, cores, funis (idempotente)');
p('node _norman/verificar.js   # lê a planilha de volta e ABORTA (exit 1) se achar defeito');
p('node _norman/prova-carimbo.js  # força o carimbo velho/ausente e prova o aviso 🛑 (aborta)');
p('node _norman/prova-funil.js    # força um corte no funil e prova o aviso de linha escondida');
p('node _norman/estresse.js    # 621 linhas sintéticas: ramos que o dado real não exercita');
p('node radar.js sincronizar-sheets   # desfaz o estresse (clear + só o store real)');
p('```');
p('');
p('`prova-carimbo.js` existe porque o aviso de desatualizada é **condicional**, e o ramo que');
p('importa é o que o dado real nunca aciona: no dia a dia o radar roda, o carimbo é de hoje e');
p('a fórmula devolve `""`. Regra que só aparece em estado raro é regra que passa quebrada em');
p('qualquer auditoria de leitura. A prova tem duas partes: **(A)** roda a fórmula de');
p('PRODUÇÃO — obtida por substituição de `F.AVISO_SYNC`, nunca reescrita — em célula de');
p('rascunho, com carimbo e "hoje" literais, cobrindo 11 ramos (mesmo dia · sexta→segunda ·');
p('**sexta→terça com feriado na segunda** · quinta→segunda com Sexta-feira Santa · Carnaval ·');
p('Natal · 1 execução perdida · 2 perdidas · uma semana parado · carimbo no futuro · carimbo');
p('vazio), conferindo o texto renderizado E o número de dias úteis contra `_norman/feriados.js');
p('diasUteisEntre()`, que deriva o mesmo valor por caminho independente; **(B)** adultera o');
p('carimbo na peça de verdade e lê os três `A1` de volta pela API — C1 carimbo de hoje sem');
p('aviso, C2 carimbo velho com data e contagem certas, C2b carimbo apagado no ramo próprio,');
p('C3 carimbo restaurado e o aviso sumindo sozinho.');
p('');
p('`verificar.js` faz três coisas e reprova em qualquer uma: varre');
p('`_calc!A1:AK600`, `Concursos`, `Concursos · tudo` e `Empregos` atrás de `#REF!`/`#NAME?`/`#VALUE!`/');
p('`#N/A`/`#DIV/0!`/`#ERROR!`/`#NUM!`/`#NULL!`; imprime as abas como JB as vê; e roda o');
p('**controle de vazamento** — procura vocabulário docente (`doutorado`, `titula`,');
p('`edital`, `pode prestar`) nas linhas da `Empregos` e vocabulário de mercado');
p('(`📄 vaga`, `🏠 remoto`, `🏢 híbrido`, `sênior`) nas linhas do `Concursos`. Conferir só a');
p('contagem não bastaria: o número pode bater com as linhas trocadas.');
p('');
p('Ele também reprova nos quatro controles do **carimbo de sync**, e esses derrubam o');
p('processo porque a falha deles é muda por construção — se `lib/sheets.js` parar de gravar');
p('o carimbo, nada quebra na tela: as contas contra `TODAY()` continuam certas e a única');
p('consequência é o aviso 🛑 nunca acender, virando um "tudo certo" permanente.');
p('');
p('- **K1** — o carimbo existe em `' + A.DADOS + '!Y1` e é ISO 8601, com a linha humana em `Z1`.');
p('- **K2** — a tabela de feriados de `' + A.CALC + '!Y` cobre o ano corrente **+ 1**. Ela é escrita uma');
p('  vez e congela; quando os anos acabam, `NETWORKDAYS` volta a contar feriado como dia útil');
p('  e o aviso fica nervoso sem nada na tela explicando. Mapa curado envelhece **mudo**.');
p('- **K3** — os três `A1` **concordam** com o veredito calculado em Node por caminho');
p('  independente (`lib/feriados-nacionais.js` via `_norman/feriados.js`). Fórmula apagada,');
p('  apontando pra célula errada, ou lendo tabela de feriados vazia, aparece como divergência');
p('  em vez de ficar muda.');
p('- **K4** — o número **impresso** é o número **calculado**. Um aviso que acende pelo motivo');
p('  certo ainda pode mentir na conta.');
p('');
p('`estresse.js` escreve na aba `dados (não edite)` (nunca no store) um caso por RAMO das duas');
p('trilhas, inclusive os que o dado real de hoje não tem: vaga **sem data de');
p('publicação**, **sem score**, com **enum desconhecido** de modalidade/senioridade,');
p('publicada **com data no futuro**, **remota sem local nenhum**, com **nome de empresa');
p('quilométrico**, e uma linha de **trilha órfã**. Foi ele — e não o dado real — que');
p('pegou um separador órfão na célula `Vaga` quando área E subárea vinham vazias.');
p('');
p('### Camada CRM (`Hoje`, `Fila`, `Projetos`, `Tarefas`, `Diário`, `' + A.CANDIDATURAS + '`, `' + A.ETAPAS + '`)');
p('');
p('> Portada da planilha pro gerador (briefing "refaça nos padrões do norman") — até');
p('> aqui, as cinco abas existiam só na planilha, criadas e mantidas à mão por chamada');
p('> direta de API (`tmp/aplicar-validacao.js`, hoje removido). Cabeçalho, validação,');
p('> formatação condicional, largura e as colunas calculadas de `Projetos` são geradas');
p('> a partir de `_norman/formulas.js`/`_norman/formatar.js`; rode `node');
p('> _norman/construir.js` e `node _norman/formatar.js` pra reconstruir do zero.');
p('');
p('**Diferença estrutural do bloco de cima**: `Fila`, `Projetos`, `Tarefas` e `Diário`');
p('são DIGITADAS por JB/Durin — não são espelho nem cache do store. `construir.js`');
p('garante a navegação (linha ' + F.LINHAS[A.TAREFAS].nav + '), o cabeçalho (linha ' + F.LINHAS[A.TAREFAS].cabecalho + '), a instrução de estado vazio e');
p('as colunas derivadas — e para por aí. **Nunca chama `limpar()` nelas**: apagar essas');
p('quatro abas apagaria dado real que não existe em nenhum outro lugar, ao contrário de');
p('`dados (não edite)` e `_calc`, que são só espelho/cache e podem ser redigitados do');
p('zero a qualquer momento. `Hoje` é a exceção — 100% fórmula, sem célula digitada — e é');
p('tratada como as outras abas de vista: limpa e reescrita inteira a cada `construir.js`.');
p('');
p('**O cabeçalho desceu da linha 1 pra linha ' + F.LINHAS[A.TAREFAS].cabecalho + '**, abrindo a linha 1 pra navegação. A');
p('migração é feita por `insertDimension` (o Sheets desloca dado e formato juntos,');
p('atomicamente) e é **idempotente**: `construir.js` não pergunta "já rodei antes", ele');
p('lê a planilha viva e pergunta ONDE o cabeçalho está agora — se está no destino, não');
p('faz nada; se está na linha 1, insere; se as duas estão vazias, é aba nova; qualquer');
p('outra coisa **aborta**, porque adivinhar aqui empurraria a primeira linha de dado de');
p('JB pra dentro do cabeçalho. Isto **nunca mais seria tão barato**: no dia da migração');
p('havia DUAS linhas de dado real nas quatro abas somadas.');
p('');
p('| Aba | Papel | Quem escreve a partir da linha ' + F.LINHAS[A.TAREFAS].dados + ' |');
p('|-----|-------|------------------------|');
p('| `' + A.HOJE + '` | Painel do dia + hub de navegação | ninguém — 100% fórmula |');
p('| `' + A.FILA + '` | Vagas/editais que JB decidiu perseguir (curadoria manual) | JB/Durin/Thor (`A` derivada da `url`) |');
p('| `' + A.PROJETOS + '` | Frentes vivas de JB, sem ligação com concurso/emprego | JB/Durin/Thor (' + PROJETOS_CALC_LETRAS.map(c => '`' + c + '`').join(',') + ' calculadas) |');
p('| `' + A.TAREFAS + '` | Ações concretas, cada uma amarrada (ou não) a um projeto | JB/Durin/Thor |');
p('| `' + A.DIARIO + '` | Registro de decisão: quem decidiu o quê e por quê | JB/Durin/Thor |');
p('');
p('#### `Hoje` — quatro grupos de coluna, oito blocos, a altura do conteúdo');
p('');
p('Antes, cada bloco era um spill próprio ancorado numa linha calculada, e cada um');
p('reservava o seu TETO INTEIRO. Com o estado real (2 tarefas, `Fila` vazia, 2 projetos,');
p('`Diário` vazio), o painel tinha **13 linhas de conteúdo em 55 de altura: 42 em');
p('branco, 76% de vão**, com os títulos espalhados por ~3 telas de celular e nada entre');
p('eles. Não era descuido: era o preço do conserto da bomba-relógio de posição fixa, que');
p('trocou colisão de spill por altura constante.');
p('');
p('Agora os oito blocos são QUATRO arrays (um `VSTACK` por GRUPO de coluna, C10 Parte 3 + Onda 19), todos ancorados na MESMA linha (' + cel(A.HOJE, 'lista') + '), em blocos de coluna disjuntos. Dentro de um grupo,');
p('**colisão entre blocos deixou de ser possível por construção** — e a guarda de vão que');
p('`construir.js` fazia foi aposentada junto com o modo de falha que ela cobria.');
p('Estrutura no lugar de guarda. O preço, declarado: **nada pode ser escrito em');
p('`' + A.HOJE + '!A' + (F.LINHAS[A.HOJE].lista + 1) + ':D∞`**. Os tetos continuam existindo, mas agora cortam a LISTA em vez de');
p('reservar ESPAÇO: um bloco com duas linhas ocupa duas linhas.');
p('');
p('**Anatomia do bloco, igual nos cinco:** título (link pra aba de origem) · corpo (a');
p('lista, ou a instrução de estado vazio) · rodapé ("+ N não cabem aqui", também link;');
p('vazio quando cabe tudo) · uma linha de respiro.');
p('');
p('| bloco | teto | o que lista | título leva a |');
p('|---|---|---|---|');
F.HOJE_BLOCOS.forEach(b => p('| ' + F.HOJE_BLOCO_GLIFO[b.chave] + ' ' + b.chave + ' | ' + b.teto + ' | ' + ({
  // Onda 19 — os dois primeiros: cruzam MAIS DE UMA aba (o resto lê uma só).
  VENCE: 'tarefa (com prazo, desbloqueada) **e** edital docente fechando, juntos, por data',
  ATENCAO: '`' + A.FILA + '` fechando antes do SLA + `' + A.CANDIDATURAS + '` aguardando + tarefa bloqueada',
  TAREFAS: 'toda tarefa não feita, vencidas primeiro, sem-prazo por último',
  FILA: '`' + A.FILA + '` por ordem, fora os estágios já decididos',
  PROJETOS: '`' + A.PROJETOS + '` até a linha ' + F.PROJETOS_ULTIMA_LINHA,
  DIARIO: 'as últimas movimentações, com autor',
  NOTICIA: 'as 4 abas de notícia + quantas entraram nos últimos ' + F.HOJE_JANELA_NOTICIA_DIAS + ' dias, cada uma',
  RADAR: 'o que entrou em `' + A.DADOS + '` nos últimos ' + F.HOJE_JANELA_RADAR_DIAS + ' dias',
  // C5 (Leva 5) — não é lista: 4 fatos fixos (inscrições/descartes 30d,
  // funil de candidaturas, meta). "teto" aqui é o tamanho do conjunto, não
  // escolha de painel — mesma natureza do bloco 🌐 NOTÍCIA, acima.
  PULSO: 'inscrições/descartes dos últimos ' + F.HOJE_JANELA_PULSO_DIAS + ' d + funil de `' + A.CANDIDATURAS + '` + meta (D-A3, literal "[a definir por JB]")'
})[b.chave] + ' | `' + b.aba + '` |'));
p('');
p('**Onda UX 8 (remodelação 2026-09-01) — o rótulo do edital em ⏰ VENCE ganha a');
p('SUBÁREA.** Medido ao vivo (job 1 de AVALIACAO-UX.md): dois editais do mesmo órgão');
p('("UEL — fecha HOJE" duas vezes) renderizavam IDÊNTICOS, e a decisão ficava impossível');
p('sem abrir `' + A.PAINEL + '` só pra desempatar. `subarea` (coluna `' + A.D + '$E`) já existia no store');
p('e nunca chegava ao rótulo; agora entra (`"🎓 "&órgão&" — "&subárea`, só quando a');
p('subárea não é vazia) — nenhuma linha do bloco repete assinatura visível (rótulo +');
p('detalhe) contra o dado do dia nem contra dois editais sintéticos do mesmo órgão.');
p('');
p('Três coisas mudaram junto:');
p('');
p('- **O bloco 📓 DIÁRIO é novo.** O `Diário` é a aba onde JB e Durin conversam sobre o');
p('  que aconteceu — e até aqui não aparecia em NENHUM lugar do painel do dia. Uma aba');
p('  que ninguém vê é uma aba que ninguém alimenta, e ela alimenta `' + A.PROJETOS + '!' + LP_MOV + '`/`' + LP_ULT + '` por');
p('  junção de nome: parar de escrever nela apaga a "última movimentação" de todo');
p('  projeto, em silêncio. É o único bloco de RECÊNCIA (o resto é pendência), então o');
p('  teto é curto e a ordem é a inversa de todos os outros.');
p('- **Tarefas filtra por ESTÁGIO, não por prazo** (conserto de uma Onda anterior,');
p('  mantido). O bloco listava só tarefa vencida ou vencendo numa janela de dias — uma');
p('  tarefa SEM prazo cadastrado simplesmente não aparecia, e o painel dizia "— nada');
p('  vencendo —" com tarefa aberta na mesa. Agora lista TODA tarefa que não é');
p('  `"✅ feita"`, com um único `SORT` ascendente sobre `IF(prazo="";DATE(9999;12;31);');
p('  prazo)` entregando vencidas → futuras → sem-prazo, sem nenhum `IF` separando os');
p('  três casos. **Novo:** o prazo vencido ganha um `⚠️ ` na frente. Sem isso, a coluna');
p('  do prazo é uma STRING sem emoji e o único canal de "vencida" era a POSIÇÃO no');
p('  `SORT` — com 12 tarefas no celular, posição não é canal. Formatação condicional');
p('  não cobre: a coluna B do `VSTACK` significa coisa diferente em cada bloco.');
p('- **`HOJE_LIMIAR_PARADO_DIAS` morreu.** Ele contava dias CORRIDOS enquanto');
p('  `AVISO_SYNC` conta dias ÚTEIS — mesmo número 3, unidade diferente. Sync na sexta,');
p('  hoje terça: corridos = 4, o `Hoje` gritava "PARADO há 4 dias"; úteis = 2, a');
p('  `Concursos` ficava muda. Uma segunda-feira perdida, o caso mais provável de todos,');
p('  produzia um portal que se contradizia entre duas abas. A linha 1 do `Hoje` passa a');
p('  consumir a CONSTANTE `AVISO_SYNC`. Uma fonte, um veredito.');
p('');
p('**Os ' + Object.keys(F.HOJE_BLOCO_GLIFO).length + ' glifos de título (' + Object.values(F.HOJE_BLOCO_GLIFO).join(' ') + ') são uma constante nomeada**');
p('(`HOJE_BLOCO_GLIFO`), consumida pela string do título **e** pelo padrão da regra de');
p('formatação condicional que desenha a banda do bloco. Enquanto eram literais nos dois,');
p('trocar um emoji de título apagava a banda daquele bloco sem erro nenhum na tela.');
p('');
p('> **Um defeito que só apareceu lendo a peça de volta.** A primeira versão do bloco');
p('> 📓 DIÁRIO tinha `HSTACK` como expressão mais externa. Com o `Diário` vazio, o');
p('> `FILTER` devolvia `#N/A`; um `HSTACK` de três argumentos-erro **não propaga um erro');
p('> escalar** — ele empilha os três como células e devolve um array 1×3 de erros. E');
p('> `IFERROR` é element-wise em array: ele mapeou o fallback de 4 colunas posição a');
p('> posição sobre as 3, produzindo uma linha de 3 colunas, e o `VSTACK` preencheu a');
p('> coluna D com `#N/A`. A cura não foi tunar o `IFERROR`: foi dar aos CINCO blocos a');
p('> mesma forma (`ARRAY_CONSTRAIN(SORT(FILTER(HSTACK(...))))`), em que o erro sobe');
p('> escalar. Uma forma, cinco instâncias, e a classe do defeito deixa de existir.');
p('');
p('#### `Fila!id` — derivada da `url`');
p('');
p('```');
p(F.FILA_ID_DERIVADO);
p('```');
p('');
p('A `Fila` tinha ZERO linhas, e a causa não era falta de vontade: obter o `id` à mão');
p('custava ir a `' + A.DADOS + '`, localizar a linha certa entre 750, copiar a coluna `T` e voltar —');
p('inviável no celular. Uma aba de captura cujo custo de captura é proibitivo fica');
p('vazia. Agora JB cola a `url` (da coluna `link (copiar)`) e o `id` aparece. Fora do');
p('store, a célula diz `— fora do radar —`: é VERDADE, não perda — a `Fila` é curadoria');
p('e aceita candidatura que o radar nunca viu.');
p('');
p('> Consequência a declarar: `COUNTA(A:A)` deixou de servir pra "a aba está vazia?" na');
p('> `Fila`, porque `COUNTA` conta o `""` que a ARRAYFORMULA devolve. Quem responde isso');
p('> ali é a coluna `url`. É o tipo de detalhe que não dá erro nenhum — só faz a');
p('> instrução de estado vazio nunca aparecer.');
p('');
p('#### `Projetos` — quatro colunas calculadas');
p('');
p('| coluna | o que responde |');
p('|---|---|');
p('| `' + LP_MOV + '` última movimentação | a data mais recente do `' + A.DIARIO + '` sobre este projeto |');
p('| `' + LP_ABERTAS + '` tarefas abertas | **quantas** tarefas não feitas |');
p('| `' + LP_PROX + '` próximas tarefas | **quais** — as 3 mais urgentes |');
p('| `' + LP_ULT + '` últimas movimentações | **o quê** — as 2 entradas mais recentes do `' + A.DIARIO + '` |');
p('');
p('`' + LP_MOV + '` e `' + LP_ABERTAS + '` já existiam e respondiam *quanto* e *quando*, nunca *o quê*: saber quais');
p('tarefas estavam abertas e o que tinha acontecido custava ir a duas outras abas e rolar');
p('procurando, e o resultado era uma reconstrução mental. `' + LP_PROX + '` e `' + LP_ULT + '` fecham isso.');
p('');
p('**`' + LP_MOV + '` tinha um defeito em produção, achado lendo a peça viva:** com o `Diário` vazio,');
p('ela imprimia **30/12/99** nas duas linhas de projeto de JB. `MAXIFS` sem nenhuma');
p('correspondência devolve **0**, não erro — e 0 é o dia zero do calendário do Sheets');
p('(30/12/1899). O `IFERROR` não pegava, porque não houve erro nenhum, e o ramo `—` que');
p('a spec dava como "já existe" nunca era alcançado. Cura: testar o ZERO explicitamente.');
p('A coluna passou a devolver um VALOR de data em vez de `TEXT(...)`, pra que o');
p('`numberFormat` aplicado por `formatar.js` tenha o que formatar (sobre uma string ele é');
p('inerte) e a máscara more num lugar só.');
p('');
p('```');
p(F.PROJETOS_CALCULADAS[LP_MOV](F.LINHAS[A.PROJETOS].dados));
p(F.PROJETOS_CALCULADAS[LP_PROX](F.LINHAS[A.PROJETOS].dados));
p('```');
p('');
p('`' + LP_QUEMAGE + '` (quem age) e `' + LP_PRAZO + '` (prazo) são DIGITADAS e ficam ENTRE os dois blocos');
p('calculados, então `construir.js` escreve `' + faixaCalc(F.PROJETOS_BLOCOS_CALCULADOS[0]) + '` e `' + faixaCalc(F.PROJETOS_BLOCOS_CALCULADOS[1]) + '` em faixas SEPARADAS —');
p('um intervalo contíguo gravaria fórmula por cima delas. `' + LP_NOTAS + '` (notas) também é');
p('DIGITADA e vem logo depois de `' + F.PROJETOS_BLOCOS_CALCULADOS[1][1] + '`, fora de qualquer bloco calculado.');
p('');
p('#### `' + A.CANDIDATURAS + '` — nasce de `_estado`, nunca digitada (Onda 5)');
p('');
p('É o funil DEPOIS da inscrição. Nenhuma linha nasce por digitação: o check "Inscrito"');
p('em `' + A.PAINEL + '`/`' + A.EMPREGOS + '` (ou o estágio virar 🟣 inscrito em `' + A.FILA + '`) grava em `' + A.ESTADO + '`');
p('(oculta — a única cópia do que JB marcou), e `' + A.CANDIDATURAS + '` LÊ dali por `_norman/formulas.js');
p('candidaturasOrgao/candidaturasVaga/candidaturasAguardandoHa`. Só o que NENHUMA');
p('máquina pode saber é digitado: `estágio` (inscrito → prova/entrevista → aprovado →');
p('não passou), `próximo passo`, `notas`.');
p('');
p('`' + F.ROTULO_NAV[A.CANDIDATURAS] + '` responde a pergunta que JB não faz em voz alta: `' + F.letraDe(F.CANDIDATURAS_CABECALHO, 'aguardando há') + '` (aguardando');
p('há) é dias desde `inscrito em` OU desde a última mudança de estágio, o que for MAIS');
p('recente — passado ' + F.CANDIDATURAS_LIMIAR_AGUARDANDO_DIAS + ' d ela acende fundo de estado (mesma classe PRAZO de `' + A.TAREFAS + '`, com o');
p('mesmo teto de orçamento de cor — ver §O sistema visual).');
p('');
p('#### `' + A.ESTADO + '` no Google Sheets — por que a linha 1 fica vazia de propósito (E5b, Leva 3)');
p('');
p('`' + A.ESTADO + '` é OCULTA e não tem cabeçalho: `_norman/estado.js` define o formato da linha');
p('por POSIÇÃO (`url`, `trilha`, `inscrito`, `quando`, `porQuem`, `nota`, e os dois campos de');
p('candidatura — `estagio`/`estagioQuando` — quando existirem), nunca por rótulo lido de volta.');
p('É a aba de ESTADO PURO do build (a única cópia do que JB marcou — "Inscrito", estágio de');
p('candidatura), digitada exclusivamente por `construir.js passoColher`/`passoRestaurar`,');
p('nunca por JB — um cabeçalho na linha 1 seria decoração pra uma aba que ninguém abre e que');
p('nenhum código lê de volta pelo nome da coluna.');
p('');
p('A heterogeneidade de campos por linha (5 valores numa linha, 8 noutra) também é esperada:');
p('a API do Sheets OMITE células vazias no FINAL de uma linha (nunca no meio) — uma url que');
p('nunca virou candidatura não tem `estagio`/`estagioQuando` pra escrever, e a leitura devolve');
p('a linha mais curta em vez de preencher com string vazia. `EST.linhasParaMapa` (que lê `_estado`');
p('de volta) já espera isso — é contrato, não dado corrompido.');
p('');
p('#### `' + A.ETAPAS + '` — a entidade que `' + A.PROJETOS + '` não tinha (Onda 14)');
p('');
p('Uma LINHA de `' + A.PROJETOS + '` não guarda lista — "os marcos de um projeto" precisa da própria');
p('aba. DIGITADA de ponta a ponta (`' + F.ETAPAS_CABECALHO.join('`, `') + '`), no mesmo espírito de');
p('`' + A.FILA + '`/`' + A.TAREFAS + '`/`' + A.DIARIO + '`. `' + A.PROJETOS + '` passa a DERIVAR três colunas daqui — `etapa atual`');
p('(a 1ª não-concluída, por `ordem`), `progresso` (`N de M`) e `saúde` (🔴 atrasado/parado ·');
p('⚪ sem sinal · 🟠 sem rumo · 🟢 em dia, nunca digitada) — nunca o contrário. É "onde Durin');
p('registra a etapa concluída", metade do pedido original de JB sobre o CRM vivo.');
p('');
p('**D-A1 (remodelação 2026-09-01) — `⚪ sem sinal` não é regressão, é honestidade.** Antes');
p('desta Onda, `saúde` sem NENHUM dado (zero etapa cadastrada, zero entrada de `' + A.DIARIO + '`');
p('vinculada) caía em `🔴 parado` por default — os 2 projetos reais da planilha ficavam');
p('vermelhos em 100% dos casos só por FALTA de registro, não por dado ruim (AVALIACAO-UX.md');
p('Parte 2 §3). Ausência de dado agora é `⚪`, nunca `🔴`; com QUALQUER dado real (uma etapa');
p('OU uma entrada de `' + A.DIARIO + '` vinculada), a saúde volta a calcular como antes.');
p('');
p('#### Estado vazio — a mobília fica, só o conteúdo falta');
p('');
p('Uma aba zerada parece **quebrada** quando some tudo, e parece **pronta pra uso**');
p('quando a estrutura está lá e vazia. Em `Hoje` isso já é verdade de graça: os oito');
p('títulos de bloco são strings literais dos quatro `VSTACK`, impressas com ou sem dado —');
p('no primeiro dia JB abre e vê oito prateleiras rotuladas, cada uma com uma instrução por');
p('baixo. Não é erro; é uma casa mobiliada esperando ser usada.');
p('');
p('**Toda instrução de estado vazio começa com `' + F.MARCADOR_VAZIO.trim() + ' ` (U+21B3).** O marcador não é');
p('enfeite: é o GANCHO da regra de formatação condicional que as pinta recuadas');
p('(`=LEFT($A' + F.LINHAS[A.HOJE].lista + ';1)="' + F.MARCADOR_VAZIO.trim() + '"`). Como o `VSTACK` tornou toda posição variável, não há');
p('como distinguir uma instrução de uma linha de dado por POSIÇÃO — só por conteúdo. E');
p('`' + F.MARCADOR_VAZIO.trim() + '` é BMP (uma unidade de código), então sobrevive a `LEFT(...;1)`; emoji astral não');
p('sobreviveria (`LEN` vale 2 no Sheets).');
p('');
p('Duas camadas. A **camada 1** é o bloco correspondente em `' + A.HOJE + '`: é onde JB nota a');
p('falta, e está na dobra do celular. A **camada 2** é uma célula de fórmula na linha da');
p('nav de cada aba digitada, à direita dos links, pra quem abre a aba direto no desktop.');
p('Preço declarado: a camada 2 fica FORA da dobra no celular, porque os 4 links consomem');
p('a dobra inteira. A altura dessa linha é AUTOMÁTICA de propósito — ela cresce pra caber');
p('a instrução quando a aba está vazia e volta a uma linha quando ela enche. A instrução');
p('literalmente sai do caminho, sem nenhuma regra que a esconda.');
p('');
p('| onde | texto |');
p('|---|---|');
F.HOJE_BLOCOS.forEach(b => p('| `' + A.HOJE + '`, bloco ' + F.HOJE_BLOCO_GLIFO[b.chave] + ' | ' + b.vazio.replace(/"/g, '').replace(/&IFERROR\(TEXT\(.*?\)\)&/, '`<dd/mm>`') + ' |'));
Object.entries(F.ESTADO_VAZIO_DIGITADAS).forEach(([aba, e]) => p('| aba `' + aba + '` (camada 2) | ' + e.texto + ' |'));
p('');
p('> **Zero fundo de cor, zero borda, zero ícone de alerta.** Um dia sem tarefas NÃO é');
p('> um erro, e pintá-lo de âmbar ensinaria que é. O texto é RECUADO (5,77:1 sobre');
p('> papel), nunca apagado: um estado vazio ilegível é a mesma falha que um ausente.');
p('');
p('### Camada Notícia (`' + A.NOTICIAS + '`, `' + A.IA + '`, `' + A.TRABALHO + '`, `' + A.CIENCIA + '`)');
p('');
p('> Fase B. Pipeline PRÓPRIO (`noticias.js`), irmão de `radar.js` — nunca uma extensão');
p('> dele: notícia não tem elegibilidade por titulação nem aderência de área; tem cluster');
p('> de fato repetido e percentil por lote. `radar.js`, `fontes/` e `data/store.jsonl` (a');
p('> trilha vaga) ficam byte-idênticos. Esta seção não existia até esta Onda — o pipeline');
p('> tinha entrado no repositório sem entrada nenhuma no README.');
p('');
p('**Duas camadas, mesma arquitetura da trilha vaga, com a fonte trocada:**');
p('');
p('```');
p('`' + A.DADOS + '` : `_calc` : ' + A.PAINEL + '/' + A.EMPREGOS + '          (trilha vaga)');
p('`' + A.NOTICIAS_DADOS + '`          : ' + A.NOTICIAS + '/' + A.IA + '/' + A.TRABALHO + '/' + A.CIENCIA + '   (trilha notícia)');
p('```');
p('');
p('**Sem `_calc` de notícia, e é decisão, não lacuna.** O pipeline (`lib-noticias/`) já');
p('entrega cluster, `n_veiculos` e `score` calculados antes de gravar; repetir essa conta');
p('em fórmula seria uma segunda implementação da mesma coisa. `' + A.NOTICIAS_DADOS + '` chega');
p('pronta — as quatro vistas só filtram, ordenam e recortam por janela.');
p('');
p('#### O pipeline, em ordem (`noticias.js coletar`)');
p('');
p('```');
p('1. coletar        — cada fonte busca seus feeds; a guarda de frescor roda por URL');
p('                    e rejeita feed fossilizado');
p('2. identificar    — id estável (sha256 de link canônico + título) e extração de âncoras');
p('3. rotear         — tabela `claude` por termo; valida aba/tabela contra TABELAS_POR_ABA');
p('4. clusterizar    — janela de ±36h, âncoras em comum, domínios diferentes, Jaccard');
p('5. ranquear       — percentil por (dia, aba) -> 0-60, + perfil 0-40');
p('6. gravar         — `data/noticias.jsonl`');
p('```');
p('');
p('`node noticias.js recalcular` reclusteriza e repontua o que já está no store, sem tocar');
p('a rede — é a ferramenta de CALIBRAÇÃO: o limiar de Jaccard se escolhe contra dado real,');
p('nunca por opinião.');
p('');
p('#### As fontes — ' + NOTICIA_FONTES.listaFontes.length + ' coletores em ' + NOTICIA_FONTES.ABAS.length + ' abas');
p('');
p('| aba (planilha) | aba (pipeline) | tabelas |');
p('|---|---|---|');
Object.entries(F.NOTICIA_ABA_PIPELINE).forEach(([abaPlanilha, abaPipeline]) => {
  p('| `' + abaPlanilha + '` | `' + abaPipeline + '` | ' + NOTICIA_FONTES.TABELAS_POR_ABA[abaPipeline].map(t => '`' + t + '`').join(', ') + ' |');
});
p('');
p('`fontes-noticias/index.js TABELAS_POR_ABA` é quem VALIDA o que cada fonte declara — uma');
p('fonte com `tabela: "brasi"` (typo) criaria uma tabela fantasma silenciosa na planilha;');
p('`rotear()` estoura ANTES disso, com a lista de tabelas válidas no próprio erro.');
p('');
p('#### Os ' + F.NOTICIA_TEMAS.length + ' temas (coluna `tema`, filtrável — Onda 9)');
p('');
p('| tema | aba | tabela | assunto |');
p('|---|---|---|---|');
F.NOTICIA_TEMAS.forEach(t => p('| ' + F.NOTICIA_BLOCO_GLIFO[t.chave] + ' ' + t.chave + ' | `' + t.aba + '` | `' + t.tabela + '` | ' + t.assunto + ' |'));
p('');
p('`' + F.NOTICIA_BLOCO_GLIFO.CLAUDE + ' CLAUDE` é a tabela mais magra de propósito: roteamento por termo');
p('específico (substituto do feed da Anthropic, que não existe), nunca por termo genérico');
p('de IA. Com até ' + F.NOTICIA_TETO + ' vagas por tabela os temas de uma aba COMPETEM entre si — um piso');
p('derivado do volume no store (`lib-noticias/ranking.js pisosPorTema`) evita que um tema');
p('minoritário zere nas quatro janelas.');
p('');
p('#### As ' + F.NOTICIA_FAIXAS.length + ' tabelas (`top 20`, não mais um seletor — Onda 8-9, quarta janela na C10)');
p('');
p('| tabela (rótulo VIVO, calculado nesta rodada) | janela nominal |');
p('|---|---|');
F.NOTICIA_FAIXAS.forEach(f => p('| `' + f.rotulo + '` | ' + (f.diaCorrente ? 'dia corrente (hoje)' : f.dias + ' dias') + ' |'));
p('');
p('**Onda UX 7 (remodelação 2026-09-01) — o rótulo pode divergir da janela nominal, DE');
p('PROPÓSITO.** Enquanto o store for mais novo que a janela (`15d`/`30d`), o rótulo cita os');
p('DIAS REAIS de cobertura, não a promessa de 15/30 — a tabela pode estar CHEIA (20 itens)');
p('sob uma janela ainda incompleta, e "top 20 · últimos 30 dias" mentiria sobre um store de');
p('~14 dias. C7 (abaixo) já cobria o caso vazio; esta Onda estende a mesma honestidade ao');
p('caso cheio (`F.noticiaRotuloJanela`, mesma `idade` de C7, nunca uma segunda conta). Assim');
p('que o store completa a janela, o rótulo volta a dizer 15/30 sozinho — sem código novo.');
p('');
p('`dias` não é escolhido no gerador: vem de `lib-noticias/ranking.js FAIXAS_CASCATA`, e');
p('`F.NOTICIA_FAIXAS` (`_norman/formulas.js`) é esse mesmo array MAPEADO, não copiado — as');
p('duas leituras da mesma fonte não divergem por construção. A planilha filtra pelas');
p('colunas `faixa`/`posicao` da aba de fato (já calculadas pela cascata em Node, decisão');
p('C2), não recalcula nada: `faixa="' + F.NOTICIA_FAIXAS[0].codigo + '"` é uma comparação de igualdade, e');
p('`posicao` (1..' + F.NOTICIA_TETO + ') já vem na ordem certa.');
p('');
p('#### O carimbo de sync — mesma doutrina, unidade DIFERENTE de propósito');
p('');
p('A trilha notícia usa o mesmo desenho do aviso de robô parado da trilha vaga (célula');
p('`' + F.CARIMBO_NOTICIA + '`, a mesma `CELULA_CARIMBO` de `lib/sheets.js`), com a UNIDADE trocada —');
p('e a troca é deliberada, não descuido: a trilha vaga conta ' + F.LIMIAR_ATRASO_DIAS_UTEIS + ' dias ÚTEIS');
p('(edital não sai no fim de semana); a notícia conta ' + F.LIMIAR_ATRASO_NOTICIA_DIAS + ' dias CORRIDOS — jornal');
p('publica domingo, e a coleta roda todo dia, fim de semana incluso. Um fim de semana');
p('parado é normal pra uma e é o robô quebrado pra outra. As duas regras compartilham só o');
p('gatilho visual (o mesmo glifo de alarme), porque a cor do alarme é a mesma peça —');
p('nunca a conta.');
p('');
p('#### Como provar que ainda funciona');
p('');
p('```bash');
p('node noticias.js coletar [--dry-run] [--sem-reddit] [--fonte id[,id]]   # roda o pipeline inteiro');
p('node noticias.js status                                                # o que está no store, por aba/tabela/recorte');
p('node noticias.js clusters [--min-veiculos N] [--aba geral|ia|trabalho|ciencia]');
p('node noticias.js recorte <hoje|semana|quinzena|mes> [--aba x]');
p('node noticias.js sincronizar-sheets [--dry-run]                        # espelha o store em `' + A.NOTICIAS_DADOS + '`');
p('```');
p('');
p('`sincronizar-sheets` segue o MOLDE de `lib/sheets.js enviar()` (clear + escrita ancorada');
p('em A1 + carimbo por último) e REUSA dele o que dá — token, clear, escrita, referência');
p('A1, montagem do carimbo, célula do carimbo. Nada de `lib/sheets.js` foi alterado: o');
p('import é o que impede as duas trilhas de divergirem sobre "o que é um sync correto".');
p('');
p('### O sistema visual (`_norman/formatar.js`)');
p('');
p('A decisão central é **subtrativa e aritmética**, não de gosto. A planilha tinha 12');
p('cores de fundo distintas; auditadas regra a regra, **17 das 18 regras de formatação');
p('condicional duplicavam um emoji que já estava na mesma linha**. A faixa era a terceira');
p('camada do mesmo sinal.');
p('');
p('> **Lei da faixa.** Uma linha só ganha fundo colorido quando o sinal que ela carrega');
p('> **não alcança o leitor por nenhum outro canal** — nem a dobra do celular (358 px) na');
p('> primeira tela, nem o bloco `frozenColumnCount` (persiste através da rolagem, a');
p('> garantia mais forte das duas). Onde o emoji cabe num dos dois — `Tarefas!E`, o prazo,');
p('> FICA sem canal a mais (636 px da borda, fora de qualquer bloco congelado, uma data');
p('> crua sem emoji) — o canal permanece, e no formato mais barato possível. **V4 (Leva 6,');
p('> remodelação 2026-09-01) — decisão sobre o aviso da Onda UX 13:** `Inscrito` entrar em');
p('> `Empregos!B` tinha empurrado `Publicada` (o emoji de frescor) de 346 px pra 418 px,');
p('> fora do bloco congelado de então (334 px) — o sinal deixou de sobreviver à rolagem.');
p('> A régua original ("cabe na dobra") não valia mais; a CURA não foi trazer fundo de');
p('> volta (um 4º tom na paleta fechada, reabrindo a parede que 12 fundos → 3 derrubou),');
p('> foi estender `frozenColumnCount` de `Empregos` de 3 pra 4 (Abrir+Inscrito+Vaga+');
p('> Publicada = 418 px), o MESMO mecanismo que já garante `Elegível?` em `Concursos`.');
p('> `Publicada` volta a sobreviver à rolagem — pelo canal que persiste, não pelo pixel.');
p('');
p('Resultado: **18 regras → 14** (7 de estado, 4 de alarme, 3 de anatomia do `' + A.HOJE + '`) e');
p('**12 fundos → 3**. O que carregava a cor continua carregando: o emoji.');
p('');
// Os hex saem de `_norman/formatar.js`, não de uma cópia colada aqui: paleta
// documentada que diverge da paleta aplicada é README que descreve uma peça
// que não existe.
const PAPEL_DA_COR = {
  N0: ['papel', 'a superfície de tudo que é dado', '—'],
  N1: ['campo', 'fundo de TODO o cromo (região congelada)', '—'],
  N2: ['régua', 'a única borda da peça: sob a última linha congelada', '—'],
  N3: ['tinta', 'todo texto primário', '16,81:1 sobre N0'],
  N4: ['tinta recuada', 'meta, cabeçalho de coluna, linha recessiva', '5,77:1 sobre N0'],
  ACENTO: ['acento', '**só o que se toca**: `HYPERLINK`', '7,73:1 sobre N0'],
  S1: ['alarme', 'tarefa vencida · robô parado', '13,05:1 com N3'],
  S2: ['aviso', 'tarefa vence em ≤ 2 dias', '14,72:1 com N3']
};
p('| token | hex | papel | contraste |');
p('|---|---|---|---|');
Object.entries(require('./formatar').PALETA).forEach(([token, hexa]) => {
  const [nome, papel, contraste] = PAPEL_DA_COR[token];
  p('| **' + token + ' · ' + nome + '** | `' + hexa + '` | ' + papel + ' | ' + contraste + ' |');
});
p('');
p('**O `#999999` que estava em produção media 2,85:1 e REPROVAVA AA** (mínimo 4,5:1 a');
p('10pt) — era o único par reprovado da peça, e estava nos dois lugares mais fáceis de');
p('não olhar: tarefa feita e candidatura descartada. N4 resolve com 5,77:1.');
p('');
p('**O acento não é o do Linear.** `#5e6ad2` mede 4,70:1 sobre papel branco: ele é acento');
p('de CHAPA ESCURA (o `linear.app` é preto) e a 9pt sobre papel fica no fio do limite.');
p('Não se copia acento de chapa escura para papel. E o calor não vem do acento, vem do');
p('substrato: N1/N2/N4 são cinzas QUENTES (R>G>B), no lugar dos cinzas frios do Google');
p('que a peça usava. É o que separa "casa" de "formulário fiscal" e custa zero — mesma');
p('quantidade de cor, temperatura diferente.');
p('');
p('**O alarme do robô parado não tinha canal visual, e agora tem.** As células de');
p('veredito eram fundo `#202124` fixo com texto branco — SEMPRE, tanto no estado normal');
p('quanto quando `AVISO_SYNC` prefixava `🛑 SEM ATUALIZAR DESDE 19/08`. O elemento mais');
p('pesado da tela era constante, então o aviso que INVALIDA TUDO ABAIXO DELE chegava como');
p('mais texto dentro de uma barra preta que já estava lá. Um campo que já é o mais escuro');
p('da tela não tem pra onde escalar. Agora o cromo inteiro é campo N1 constante e a troca');
p('N1 → S1 no veredito é a **única mudança de cor que a peça inteira consegue produzir**.');
p('Não há como perder. A regra LÊ O VEREDITO RENDERIZADO (`REGEXMATCH($A$n;"🛑")`) em vez');
p('de recalcular o critério, então ela não pode divergir dele.');
p('');
p('**Grade desligada em 8 abas, ligada em `' + A.DADOS + '`.** A grade tem dois eixos; a lista tem');
p('um — o que faz a peça parecer formulário fiscal é a malha VERTICAL. Desligar só ficou');
p('possível porque a Lei da Faixa eliminou os fundos primeiro (ocultar grade e pintar');
p('faixa colidem). A aba da máquina continua parecendo tabela **porque ela É tabela**: é');
p('o único lugar da peça onde "parece planilha" é a leitura certa.');
p('');
p('**Composição: um campo, uma régua, uma borda.** Toda a região congelada é campo N1;');
p('tudo abaixo é papel N0; uma única régua N2 separa os dois. Nenhuma borda vertical em');
p('lugar nenhum, nenhuma borda entre linhas de dado — é o que separa lista de formulário.');
p('Formatação condicional **não desenha borda** no Sheets, então toda borda é de posição');
p('fixa, e só a região congelada tem posição fixa; no `' + A.HOJE + '`, onde a posição é variável');
p('por construção, o separador é a BANDA N1 do título — mais forte que uma régua, o que');
p('dispensa somar os dois.');
p('');
p('**Uma família só: Arial**, em 3 tamanhos (12 veredito / 10 corpo / 9 meta) e 4 papéis.');
p('É a base do Sheets e a única com renderização garantida em desktop + Android + iOS +');
p('PDF. Sem CSS, a hierarquia inteira é tamanho + peso + cor: uma fonte adicionada por');
p('"Mais fontes" cai pro default EM SILÊNCIO onde não existe, e um fallback silencioso');
p('não degrada a peça — ele TROCA a peça. A nav lê como cromo em três canais ao mesmo');
p('tempo (9pt contra 12pt, regular contra bold, 6,85:1 contra 14,91:1) e só ganha do');
p('veredito em POSIÇÃO. **A afordância de link é o sublinhado, não a cor** — é isso que');
p('faz a nav sobreviver a daltonismo e a qualquer fallback de renderização.');
p('');
p('> **Aplicado em UMA aba primeiro.** Nada deste sistema foi renderizado enquanto era');
p('> escrito: toda cor é calculada por fórmula WCAG e toda geometria é soma de larguras.');
p('> O que não se calcula é a impressão. Por isso `formatar.js` aceita');
p('> `--piloto <aba>`: aplica em uma só, **limpeza inclusa**, e as outras ficam');
p('> intactas — ler de volta antes de propagar é barato; replicar um erro sete vezes não.');
p('');
p('#### A armadilha de locale, documentada onde a máscara nasce');
p('');
p('`dd/mm/yy` (formato de `' + A.PROJETOS + '!G` e `' + A.DIARIO + '!A`) e `yyyy-mm-dd` (o ISO que');
p('o bloco RADAR de `' + A.HOJE + '` usa pra comparar contra `data_publicacao`) são tokens em **inglês** —');
p('mesmo com a planilha em locale `pt_BR`. Trocar por `aaaa` (o token de ano em');
p('português) não dá erro: a célula silenciosamente passa a mostrar o **nome do dia');
p('da semana** ("quarta-feira") em vez de uma data. Mesmo cuidado que `lib/sheets.js`');
p('já documenta pra `inscricao_fim` (ISO 8601 é o único formato que o Sheets lê sem');
p('ambiguidade de locale) — aqui o risco não é dd/mm vs mm/dd, é o FORMATO inteiro');
p('trocando de sentido sem avisar.');
p('');
p('#### As guardas que os briefings pediram por nome');
p('');
p('- **Alcance de `Projetos`.** `' + A.TAREFAS + '!B` e `' + A.DIARIO + '!C` validam contra');
p('  `ONE_OF_RANGE = ' + F.PROJETOS_RANGE_NOME + '`, e o bloco 📌 PROJETOS de `' + A.HOJE + '` lê o');
p('  mesmo alcance. As três fórmulas nascem da MESMA constante, então divergir exigiria');
p('  editar uma sem editar as outras — e `construir.js`/`formatar.js` ainda checam isso');
p('  em runtime antes de escrever. `_norman/verificar.js` cobre o lado que nenhum código');
p('  prevê sozinho: JB cadastrando um projeto ALÉM dessa linha na planilha viva — nesse');
p('  caso o projeto some do dropdown e do painel, sem erro nenhum na tela.');
p('- **Carimbo do `' + A.HOJE + '`.** ' + cel(A.HOJE, 'veredito') + ' lê `' + A.DADOS + '!Y1` pela constante');
p('  `CELULA_CARIMBO` de `lib/sheets.js`, nunca por "Y1" escrito na mão — se a célula');
p('  do carimbo mudar de lugar um dia, `_norman/construir.js` estoura ANTES de');
p('  escrever em vez de gravar uma referência A1 silenciosamente errada. E há uma');
p('  guarda irmã: essa célula tem que **consumir a constante `AVISO_SYNC`**, não uma');
p('  cópia da regra — é o que impede a divergência de unidade (dias corridos × dias');
p('  úteis) que fazia o portal se contradizer entre duas abas.');
p('- **Números de linha nunca são literais.** `F.LINHAS` é a fonte única da geometria');
p('  (nav, veredito, contagem, cabeçalho, primeira linha de dado, congelamento) e é');
p('  consumida por fórmulas, `mergeCells`, faixas de formatação condicional,');
p('  `setBasicFilter`, congelamento, âncoras de nota e pelos controles de');
p('  `verificar.js`. A linha de navegação empurrou ~20 literais de uma vez; feito à');
p('  mão, um esquecido desloca formatação ou funil sem erro visível. `construir.js`');
p('  confere que o congelamento de cada aba é a ÚLTIMA linha de cromo dela e que a');
p('  primeira linha de dado é a seguinte — congelamento que não cobre o cromo faz a');
p('  aba rolar por baixo do próprio cabeçalho.');
p('- **Nav sem órfão (o controle do gid).** Ver §A linha 1 de toda aba. O controle tem');
p('  positivo e negativo porque, sem os dois, ele pode estar quebrado e passar em');
p('  auditoria de leitura. **Foi ele que pegou um defeito real nesta Onda:**');
p('  `construir.js` escrevia os 4 links dentro da mescla do banner do layout ANTIGO; a');
p('  API aceitava a escrita e a leitura logo depois devolvia os 4, mas B1/C1/D1 eram');
p('  células NÃO-ÂNCORA de uma mescla e voltaram VAZIAS quando `formatar.js` desfez');
p('  essa mescla. Resultado: barra de navegação com UM link em vez de quatro, em três');
p('  abas, sem erro nenhum. A cura é de propriedade: `construir.js` desfaz, antes de');
p('  escrever, exatamente as mesclas que cruzam as células de link — e só essas, usando');
p('  as coordenadas da própria mescla (faixa que corta uma mescla ao meio é erro de');
p('  API). A mescla do estado vazio das digitadas, que é de `formatar.js` e fica fora');
p('  das colunas de link, não é tocada.');
p('- **Grade quase cheia.** `verificar.js` reprova quando qualquer aba passa de **80%**');
p('  das linhas da grade. `values.update` numa faixa maior que o `rowCount` não trunca:');
p('  **ERRA** — e quem faz essa escrita é o sync, sozinho, de madrugada. O piso é');
p('  estático e o store já pulou 175% de uma vez.');
p('- **Teto dos blocos do `' + A.HOJE + '`.** A linha "+ N não cabem aqui" só acende quando o total');
p('  ULTRAPASSA o teto, então "bateu exatamente no teto" não aparece em texto nenhum na');
p('  tela; é o PRÓXIMO item cadastrado que vai truncar. `verificar.js` acusa antes.');
p('  **O bloco 🆕 RADAR fica FORA desse check, por desenho:** os outros quatro são');
p('  CURADORIA (encostar no teto quer dizer que o teto ficou pequeno pro uso real), e o');
p('  radar é recorte TOP-N — "43 itens em 3 dias" é o funcionamento normal de um coletor');
p('  que varre ' + listaFontes.length + ' fontes, não um sintoma. Um alarme que acende todo dia e nunca tem');
p('  conserto é um alarme que cria lobo. A linha "+ N não cabem" continua acesa lá: ali');
p('  ela não é aviso de saturação, é a informação de que existe mais e onde ver.');
p('- **Orçamento de cor.** Se mais de **15%** das linhas visíveis de uma aba acenderem');
p('  fundo de estado, o LIMIAR da regra está errado — não a peça. É o que impede a regra');
p('  de prazo de virar de novo a parede de cor que a Lei da Faixa derrubou. O medidor é');
p('  reimplementado em Node e provado com controle positivo e negativo antes de medir:');
p('  sem isso, "0%" pode significar "nenhuma tarefa vencida" ou "o medidor está');
p('  quebrado", e os dois passam em auditoria de leitura igualzinho.');
p('  **Onda UX 9 (remodelação 2026-09-01) — o orçamento passou a cobrir GLIFO, não só');
p('  fundo.** `' + A.PROJETOS + '!saúde` sinaliza por EMOJI (🔴/🟠/⚪/🟢), sem cor de fundo nenhuma,');
p('  e por isso passava inteira pelos dois medidores acima mesmo em `🔴 parado` 100% dos');
p('  casos (AVALIACAO-UX.md Parte 2 §3: "o orçamento mede o mecanismo, não o sinal").');
p('  Mesmo teto (15%), mesma disciplina de controle positivo/negativo — e `⚪ sem sinal`');
p('  (D-A1) nunca conta como "aceso": ausência de dado não é alarme.');
p('  **Adendo (mecanismo 4 de `REFERENCIAS-UX.md`) — toda regra de `cf()` deixou de ter');
p('  `endRowIndex` fixo.** Uma regra instalada com o `rowCount` de QUANDO `formatar.js`');
p('  rodou parava de cobrir linha nova sem ninguém perceber, se a aba crescesse depois');
p('  sem `formatar.js` rodar de novo — dívida invisível até a linha nascer fora do');
p('  alcance. Agora o `GridRange` não declara fim de linha, e a API do Sheets aplica a');
p('  regra "até a última linha da grade", dinamicamente.');
p('');

// ===========================================================================
// C6 (Leva 5) — GLOSSÁRIO DE SINAL, por aba
// ===========================================================================
//
// "sobreviver ao `gerar-readme.js`": o README INTEIRO é gerado por este
// script (nada é escrito à mão nele — confira o `console.log(TEXTO)` no
// fim do arquivo, que é o texto inteiro, da primeira `p()` até a última).
// Uma seção "manual" só sobrevive a uma regeneração se ela morar no
// CÓDIGO-FONTE deste gerador, não no arquivo de saída — é exatamente isso
// que este bloco faz: o texto vem de `_norman/notas.js SINAL_LOCAL`, a
// MESMA fonte que virou nota de célula na planilha (C6, primeira metade).
// Rodar `node _norman/gerar-readme.js` duas vezes seguidas produz a MESMA
// seção, byte a byte — é código determinístico, não digitação.
p('### Glossário de sinal — o que cada glifo/cor significa, aba por aba');
p('');
p('> Cada aba tem, além disto, uma NOTA DE CÉLULA com o mesmo texto (C6) — a nota é');
p('> o resumo rápido dentro da planilha; esta tabela é a mesma fonte (`_norman/notas.js');
p('> SINAL_LOCAL`), pra quem prefere ler fora do Sheets.');
p('');
p('| aba | sinal local |');
p('|---|---|');
Object.entries(N.SINAL_LOCAL).forEach(([aba, texto]) => p('| `' + aba + '` | ' + texto + ' |'));
p('');

// GUARDA DO README. Ele fala das abas pelo NOME, em prosa — e nome de aba é a
// coisa mais fácil de mudar na planilha e esquecer aqui. README que descreve
// uma planilha que não existe é pior que README ausente: passa em auditoria de
// leitura e manda quem consultar procurar aba que não tem. Por isso a geração
// ABORTA em vez de emitir texto defasado.
const TEXTO = L.join('\n');
const CANONICOS = [
  A.PAINEL, A.TUDO, A.EMPREGOS, A.DADOS, A.CALC,
  A.HOJE, A.FILA, A.PROJETOS, A.TAREFAS, A.DIARIO,
  A.NOTICIAS, A.IA, A.TRABALHO, A.CIENCIA, A.NOTICIAS_DADOS,
  // Ondas 5/14/18-20 — as três que faltavam. `Candidaturas`/`Etapas` são
  // abas VISÍVEIS do CRM; `_estado` é oculta, mesmo status de `_calc` acima
  // (infra interna, mas ainda canônica — omiti-la seria o mesmo defeito de
  // silêncio que este guarda existe pra matar).
  A.CANDIDATURAS, A.ETAPAS, A.ESTADO
];
const legadosCitados = Object.values(A.LEGADAS).flat().filter(n => TEXTO.includes('`' + n + '`'));
if (legadosCitados.length) {
  console.error('README cita aba com nome LEGADO: ' + legadosCitados.map(n => '`' + n + '`').join(', ') +
    '. Os nomes atuais são: ' + CANONICOS.join(', ') + '. Atualize a prosa deste gerador.');
  process.exit(1);
}
const naoCitados = CANONICOS.filter(n => !TEXTO.includes(n));
if (naoCitados.length) {
  console.error('docs/PLANILHA.md não menciona a(s) aba(s): ' + naoCitados.join(', '));
  process.exit(1);
}

// ESCRITA DIRETA em docs/PLANILHA.md — nunca em README.md (ver cabeçalho do
// arquivo). `path.join(__dirname, '..', 'docs', 'PLANILHA.md')` porque este
// script roda como `node _norman/gerar-readme.js` (cwd pode ser a raiz do
// repo OU `_norman/`, dependendo de quem chama) — âncora em `__dirname`, não
// em `process.cwd()`, é o que torna o destino determinístico nos dois casos.
const DESTINO = path.join(__dirname, '..', 'docs', 'PLANILHA.md');
fs.mkdirSync(path.dirname(DESTINO), { recursive: true });
fs.writeFileSync(DESTINO, TEXTO, 'utf8');
console.log('escrito: ' + path.relative(path.join(__dirname, '..'), DESTINO) +
  ' (' + TEXTO.length + ' bytes)');
