### Fórmulas das abas de leitura (`Concursos`, `Empregos`, `Concursos · tudo`, `_calc`)

> Estas fórmulas são a **fonte canônica** — foram geradas de `_norman/formulas.js` e
> coladas na planilha por API. Se editar uma, edite as duas. Rode
> `node _norman/gerar-readme.js` pra regerar este arquivo (`docs/PLANILHA.md`).

**18 abas, nesta ordem na barra** (5 ocultas):

> A ordem física abaixo é a de `_norman/formatar.js` (constantes `ORDEM`/`OCULTAS`, que o
> `main()` de lá aplica via `updateSheetProperties`) — não são exportadas, então este
> gerador não lê `formatar.js` de volta e não aborta sozinho se a ordem mudar lá sem
> mudar aqui. Se a barra do celular divergir desta tabela, confira `formatar.js` primeiro.

| # | Aba | Camada | O que é | Tocada pelo sync? |
|---|-----|--------|---------|--------------------|
| 0 | `Hoje` | VISTA | **O painel do dia e o hub de navegação.** Oito blocos (vence, atenção, tarefas, fila, projetos, diário, notícia, radar) em quatro `VSTACK`, com a altura do que existe. | nunca |
| 1 | `Empregos` | VISTA | **A resposta do emprego.** As vagas ordenadas por frescor × aderência, com funil pros 5 cortes. Congela 4 colunas (Abrir+Inscrito+Vaga+Publicada, 418 px — Onda UX 13 + V4/Leva 6): ação, checkbox, identidade e o sinal de frescor sempre visíveis, mesmo rolando o resto da linha. | nunca |
| 2 | `Concursos` | VISTA | **A resposta do concurso.** Só o que é acionável hoje. Congela 4 colunas (Abrir+Inscrito+Vaga+Elegível?, 444 px — Ondas UX 11+13): ação, checkbox, identidade e a decisão sempre visíveis, mesmo rolando o resto da linha. | nunca |
| 3 | `Tarefas` | ESTADO | Ações concretas, cada uma amarrada (ou não) a um projeto. **Digitada.** | nunca |
| 4 | `Fila` | ESTADO | Candidaturas em perseguição. **Digitada**, exceto `o quê`/`trilha`/`id`/`parada há` (derivadas da `url` — Onda UX 12 pôs `o quê` na coluna A, identidade antes do hash). | nunca |
| 5 | `Candidaturas` | ESTADO | O funil DEPOIS da inscrição. **Nasce de** `_estado`, nunca digitada direto — só `estágio`/`próximo passo`/`notas` são. | nunca |
| 6 | `Projetos` | ESTADO | Frentes vivas. **Digitada**, exceto `E`/`F`/`I`/`J`/`L`/`M`/`N` (calculadas). | nunca |
| 7 | `Diário` | ESTADO | Registro append-only de decisão. **Digitada.** | nunca |
| 8 | `Etapas` | ESTADO | Os marcos de cada projeto — a entidade que `Projetos` não tinha. **Digitada.** | nunca |
| 9 | `Notícias` | VISTA | Notícia de Brasil e mundo — política, economia, geopolítica. | nunca |
| 10 | `IA` | VISTA | Notícia de IA — campo, ferramentas, Claude, Reddit/HN. | nunca |
| 11 | `Trabalho` | VISTA | Notícia de mercado de trabalho e concurso — **não é vaga** (vaga fica em `Empregos`/`Concursos`). | nunca |
| 12 | `Ciência` | VISTA | Notícia de artigo científico e mundo acadêmico. | nunca |
| 13 | `Concursos · tudo` | VISTA | **OCULTA.** A análise do concurso: todos os editais, com funil pros 4 cortes. Consulta rara; volta com um clique (botão direito na tira → "Todas as guias"). | nunca |
| 14 | `dados (não edite)` | FATO | **OCULTA.** Espelho cru do store, 23 colunas. Território da máquina. | **sobrescrita inteira** |
| 15 | `notícias (não edite)` | FATO | **OCULTA.** Espelho cru do store de notícias, 11 colunas — já chega com cluster e score calculados por `lib-noticias/`; não há `_calc` de notícia. | **sobrescrita inteira** |
| 16 | `_calc` | FATO | **OCULTA.** Deriva tudo de `dados (não edite)` uma vez; as abas de leitura só leem daqui. | nunca |
| 17 | `_estado` | FATO | **OCULTA.** A ÚNICA cópia do que JB marcou ("Inscrito", estágio de candidatura) — sobrevive à reescrita diária das vistas. `_calc`/`dados (não edite)` podem ser apagados e redigitados; `_estado` não. | nunca |

A ordem é por **job**, não por trilha nem por camada. `Hoje` abre a barra porque é a
única aba que JB lê ANTES de decidir onde entrar. `Empregos` vem antes de
`Concursos` por medição, não por hipótese: é a que ele abre todo dia e tem 3x mais
linhas.

**ONDA UX 4 (remodelação 2026-09-01) — escrita antes de leitura.** A ordem antiga foi
medida ao vivo (AVALIACAO-UX.md Parte 2 §12) pondo as quatro vistas de notícia
(LEITURA — o que a máquina trouxe, pra ver) nos slots 4-7 e as abas de ESCRITA
(`Tarefas` em diante — curadoria de JB) só a partir do slot 8: no celular, que mostra
~3 nomes por vez, o cluster do CRM ficava atrás de abas que ninguém edita. Agora o CRM
inteiro (`Tarefas`·`Fila`·`Candidaturas`·`Projetos`·`Diário`·`Etapas`) vem logo depois do
radar de vaga, com `Etapas` explicitamente ao lado de `Projetos`/`Diário` (é a mesma
superfície: os marcos de um projeto) — antes, `Etapas` nem entrava na lista que
decide a ordem, e flutuava no índice que a API lhe desse (o último). As quatro vistas
de notícia vêm DEPOIS do CRM. `dados (não edite)` deixou de ser exceção visível: até esta Onda
ela ficava fora da tela de abas ocultas porque "JB confere célula lá" — mas visível ela
partia o cluster do CRM ao meio; agora fecha a fila oculta junto de `notícias (não edite)`/`_calc`/`_estado`,
e conferir célula continua a um clique (desocultar), o mesmo custo que `Concursos · tudo` já paga.

**`Concursos · tudo` foi OCULTADA, não fundida.** Ocultar ganha o slot da barra do celular do
mesmo jeito que fundir ganharia (a barra mostra ~3 nomes antes de pedir arrasto),
não perde a superfície, e desfaz com um clique. Fusão de dados não se desfaz. Ela
continua sendo gerada inteira, com o sistema visual novo por dentro — uma aba viva
com o desenho antigo por dentro seria pior que fundir.

### A linha 1 de toda aba é a NAVEGAÇÃO

O portal já **falava** navegação e não a **tinha**: três setas "▶ Empregos" escritas
em texto puro, que JB lia e em seguida ia procurar o nome na tira de abas. Agora são
células `HYPERLINK` de verdade.

**ONDA UX 6 (remodelação 2026-09-01) — `Hoje` ganha nav COMPLETA.** Até esta Onda
ela cobria só 6 dos 12 destinos possíveis (4 numa grade 2×2 própria + 2 pelos títulos de
bloco). Medido por BFS (`_norman/AVALIACAO-UX.md` Parte 2 §11): `Hoje`, que é a PONTE
entre as três ilhas da planilha (radar/CRM/notícia), não alcançava `Candidaturas` nem
`Etapas` em 1 toque — e isso sozinho custava 2+ toques em 93 dos 156 pares de abas.
Agora `Hoje` está em `F.NAV` como qualquer outra aba, com os 12 destinos possíveis
numa linha só (linha 2) + o marcador "você está aqui" — a MESMA função
(`F.navCelulas`) que já escrevia a nav das outras 12 escreve a dela também.

Toda outra aba carrega `🏠 Hoje` na célula **A1** — posição constante é o que faz
a barra virar cromo e parar de exigir leitura — mais até 4-5 destinos contextuais, e
**termina** com uma célula que não é link: o texto plano "📍 " + o nome da própria aba,
em fundo escuro — a marca "você está aqui" (Onda 18, agora também em `Hoje`).
Sem ela, "onde estou" só se respondia lendo o rodapé do navegador (a tira de abas
do próprio Sheets); agora a resposta está na PRIMEIRA linha da própria tela, em toda
aba visível — inclusive na que já é o hub.

| aba | A1 | B1 | C1 | D1 | E1 | você está aqui |
|---|---|---|---|---|---|---|
| `Concursos` | 🏠 Hoje | 💼 Empregos | 🎯 Fila | ✍️ Tarefas | 🗂️ Candidaturas | 📌 Projetos | 📓 Diário | 🧩 Etapas | 📰 Notícias | `📍 🎓 Concursos` |
| `Empregos` | 🏠 Hoje | 🎓 Concursos | 🎯 Fila | ✍️ Tarefas | 🗂️ Candidaturas | 📌 Projetos | 📓 Diário | 🧩 Etapas | `📍 💼 Empregos` |
| `Concursos · tudo` | 🏠 Hoje | 🎓 Concursos | 💼 Empregos |  |  | `📍 🎓 Concursos · tudo` |
| `Tarefas` | 🏠 Hoje | 📌 Projetos | 📓 Diário | 🎯 Fila | 🎓 Concursos | 💼 Empregos | 🗂️ Candidaturas | 🧩 Etapas | 📰 Notícias | `📍 ✍️ Tarefas` |
| `Fila` | 🏠 Hoje | 💼 Empregos | 🎓 Concursos | ✍️ Tarefas | 🗂️ Candidaturas | 📌 Projetos | 📓 Diário | 🧩 Etapas | 📰 Notícias | `📍 🎯 Fila` |
| `Projetos` | 🏠 Hoje | ✍️ Tarefas | 📓 Diário | 🎯 Fila | 🧩 Etapas | 🎓 Concursos | 💼 Empregos | 🗂️ Candidaturas | 📰 Notícias | 🤖 IA | 📈 Trabalho | 🔬 Ciência | `📍 📌 Projetos` |
| `Diário` | 🏠 Hoje | 📌 Projetos | ✍️ Tarefas | 🎯 Fila | 🧩 Etapas | 🎓 Concursos | `📍 📓 Diário` |
| `Candidaturas` | 🏠 Hoje | 🎯 Fila | 💼 Empregos | 🎓 Concursos | ✍️ Tarefas | 📌 Projetos | 🧩 Etapas | `📍 🗂️ Candidaturas` |
| `Etapas` | 🏠 Hoje | 📌 Projetos | ✍️ Tarefas | 📓 Diário | 🎓 Concursos | `📍 🧩 Etapas` |
| `Notícias` | 🏠 Hoje | 🤖 IA | 📈 Trabalho | 🔬 Ciência | 🎓 Concursos | 💼 Empregos | 🎯 Fila | ✍️ Tarefas | 📌 Projetos | 📓 Diário | 🗂️ Candidaturas | 🧩 Etapas | `📍 📰 Notícias` |
| `IA` | 🏠 Hoje | 📰 Notícias | 📈 Trabalho | 🔬 Ciência | 🎓 Concursos | 💼 Empregos | 🎯 Fila | ✍️ Tarefas | 📌 Projetos | 📓 Diário | 🗂️ Candidaturas | 🧩 Etapas | `📍 🤖 IA` |
| `Trabalho` | 🏠 Hoje | 📰 Notícias | 🤖 IA | 🔬 Ciência | 🎓 Concursos | 💼 Empregos | 🎯 Fila | ✍️ Tarefas | 📌 Projetos | 📓 Diário | 🗂️ Candidaturas | 🧩 Etapas | `📍 📈 Trabalho` |
| `Ciência` | 🏠 Hoje | 📰 Notícias | 🤖 IA | 📈 Trabalho | 🎓 Concursos | 💼 Empregos | 🎯 Fila | ✍️ Tarefas | 📌 Projetos | 📓 Diário | 🗂️ Candidaturas | 🧩 Etapas | `📍 🔬 Ciência` |

`Hoje` (linha 2) foge da tabela de 5 colunas acima porque carrega
os 12 destinos possíveis, não até 5 — a lista, na ordem em que aparece (mesma
prioridade da barra de abas: radar · CRM · notícia), mais o marcador:

`💼 Empregos` · `🎓 Concursos` · `✍️ Tarefas` · `🎯 Fila` · `🗂️ Candidaturas` · `📌 Projetos` · `📓 Diário` · `🧩 Etapas` · `📰 Notícias` · `🤖 IA` · `📈 Trabalho` · `🔬 Ciência`

...seguido de `📍 🏠 Hoje` (marcador).

**A URL é ABSOLUTA** (`https://docs.google.com/spreadsheets/d/<ID>/edit#gid=<gid>`),
não `#gid=` relativo. O relativo não navega dentro do app de celular — leva sempre à
primeira aba; a absoluta tem relato de funcionar. No desktop as duas funcionam.
Entre "funciona nos dois" e "funciona num só" não há escolha a fazer.

**O `gid` nunca é escrito à mão.** `_norman/construir.js` resolve por `a.meta()`
depois de criar/renomear as abas e injeta na fórmula. Aba excluída e recriada muda de
gid: um link com gid defasado **não quebra — ele aponta pra outra coisa**, e navega em
silêncio pro lugar errado. `_norman/verificar.js` fecha o laço lendo a FÓRMULA viva de
volta e comparando o gid de cada célula com o mapa de `sheetId` — com controle
positivo (um link bom passa) e negativo (um gid fabricado reprova), porque instrumento
que ninguém testa pode estar quebrado e passar em auditoria de leitura.

`dados (não edite)` é a única aba **sem** navegação, e o motivo é técnico:
`lib/sheets.js enviar()` faz `values.clear` + escrita ancorada em A1 todo dia.
Qualquer link ali seria apagado de madrugada, em silêncio.

### As fontes que alimentam o store

| id | fonte | trilha |
|---|---|---|
| `dou` | Diário Oficial da União — Seção 3 | docente |
| `gupy` | Gupy — portal de vagas de mercado | mercado |
| `programathor` | ProgramaThor — portal de vagas dev/front-end | mercado |
| `pci` | PCI Concursos — MCP oficial (professores) | docente |
| `weworkremotely` | We Work Remotely — RSS por categoria | mercado |
| `selecaoacademica` | Seleção Acadêmica — RSS | docente |
| `vagas` | Vagas.com — busca por termo | mercado |

São **7 coletores** atrás do mesmo contrato (`{ id, nome, coletar, textoParaFiltro,
normalizarParcial, enriquecer }` — ver §Como adicionar uma fonte nova). Duas entraram
depois da primeira versão desta seção e não estavam documentadas aqui:

- **`pci` — PCI Concursos**, trilha docente, pelo servidor MCP oficial
  (`POST https://mcp.pciconcursos.com.br/mcp`, JSON-RPC 2.0). É a segunda fonte da
  trilha docente ao lado do DOU, e a dedupe entre as duas mora em
  `lib/orgao-canonico.js`: a PCI concatena `"SIGLA - Nome completo"` no mesmo campo
  (`"UFSCar - Universidade Federal de São Carlos"`) enquanto o DOU traz só o nome
  por extenso, e sem canonizar o órgão o MESMO edital entraria duas vezes com dois
  `id` diferentes — o hash inclui `orgao`.
- **`weworkremotely` — We Work Remotely**, trilha mercado, por RSS de categoria
  (`/categories/remote-design-jobs.rss` e `/categories/remote-programming-jobs.rss`).
  O próprio feed publica a mesma vaga em duas categorias, então `coletar()` deduplica
  antes de devolver. Atenção a um falso amigo já documentado no coletor: o campo
  `<country>` do WWR **não** significa "a vaga é no Brasil" — o site é global.

Nada disso muda uma linha das fórmulas: as fontes escrevem no store, e a planilha lê
do store. É a mesma razão pela qual `trilha` é uma coluna e não uma aba.

#### Duas trilhas, duas superfícies — e por que não uma só

`dados (não edite)` é um store só, mas guarda duas coisas que **não são a mesma coisa**: edital de
concurso docente (`trilha=docente`) e vaga de emprego (`trilha=mercado`). Renderizar as
duas com o mesmo vocabulário produziu mentira literal na planilha: o veredito
`aderente` caía no `else` do rótulo de elegibilidade e 359 vagas de front-end/UX
apareciam como **"🎓 só com doutorado"** — e, como a ordenação é por prazo, elas
empurraram os editais pra fora da dobra: o `Concursos` ficou com **1 edital visível e 359
vagas** logo abaixo.

Não é bug de string, é bug de **modelo**. Os eixos de decisão não se cruzam:

| | trilha docente | trilha mercado |
|---|---|---|
| eixo temporal | prazo de inscrição (fato do DOU) | tempo no ar (idade da publicação) |
| eixo de mérito | elegibilidade por titulação | aderência de perfil (score) |
| o que é uma linha | um subedital de um edital | uma vaga de uma empresa |
| vocabulário | edital, inscrição, titulação, campus, subedital | empresa, candidatura, senioridade, modalidade |

A separação mora em **duas constantes-guarda**, e só nelas. Cada bloco de fórmulas
abre com a sua e devolve `""` pro que não é dele:

```
FORA_DOCENTE -> bloco _calc!A:R   (consumido por Concursos e Concursos · tudo)
FORA_MERCADO -> bloco _calc!AA:AK (consumido por Empregos)
```

Como toda coluna já abria com `IF(<guarda>;"";...)`, trocar a constante consertou o
vazamento inteiro sem tocar em nenhuma fórmula individual.

> **Soma booleana (`(x)+(y)>0`) em vez de `OR(x;y)`, de propósito.** `OR()` agrega o
> array inteiro num único TRUE/FALSE dentro de `ARRAYFORMULA` e faria a guarda valer
> pra todas as linhas ou pra nenhuma. Mesma razão pela qual `MIN(a;b)` não aparece em
> lugar nenhum de `formulas.js` (agrega) e vira `IF(a>b;b;a)`.

**A conta tem que fechar, e a planilha confere sozinha.** Se `trilha` não for nem
`docente` nem `mercado`, a linha existe em `dados (não edite)` e não aparece em aba nenhuma — modo
de falha silencioso criado pela própria separação. Por isso a `A2` do `Concursos` carrega
um aviso condicional que compara `COUNTA(dados!A2:A)` com a soma das duas trilhas e só
aparece quando sobra alguém. Provado com uma linha sintética de `trilha=freelance`.

**Coluna nova em `dados (não edite)` entra sempre NO FIM.** As fórmulas referenciam por LETRA de
coluna, não por nome; inserir no meio desloca tudo e quebra em silêncio. As 3 colunas
da Onda 3 (`trilha` U, `modalidade` V, `senioridade` W) entraram depois de `id`, e
nenhuma fórmula pré-existente mudou de letra. `tests/sheets.test.js` guarda esse
invariante — afirma que os 20 primeiros nomes continuam na ordem original.

Registro salvo antes da Onda 3 não tem `trilha` no store; `lib/sheets.js` grava o
default `docente` (mesma regra de `radar.js trilhaDoRegistro()`). Isso importa mais na
planilha que no store: `trilha` é **eixo de filtro**, e 205 células em branco criariam
um terceiro valor mudo no funil e fariam `COUNTIF(dados!U2:U;"docente")` contar 0.

`garantirAbas()` só CRIA aba que falte, por título — nunca reordena, nunca oculta,
nunca formata. Por isso reordenar/ocultar/formatar é seguro, e por isso a aba de
leitura precisa continuar se chamando `Concursos` (renomear faria o sync recriar uma
`Concursos` vazia ao lado, ver `ABA_PAINEL` em `lib/sheets.js`).

**Nenhuma fórmula tem intervalo de linha fixo.** Todas usam intervalo ABERTO
(`dados!A2:A`, não `dados!A2:A206`) — o store cresce e fórmula com limite fixo
quebra em silêncio. Provado: com 512 linhas em `dados (não edite)`, zero erro e as 512
aparecem em `Concursos · tudo`.

**A janela de 60 dias é MEDIDA, não chutada.** Dos 67 registros com
`inscricao_fim` conhecida, 100% fecham no máximo 48 dias depois da publicação
(p95 = 39 d). Por isso um registro SEM prazo publicado há ≤ 60 d ainda
conta como possivelmente aberto, e um publicado há mais que isso sai do `Concursos` —
mas **nunca some**: continua em `Concursos · tudo`, e o `Concursos` diz na linha 2 quantos ficaram
de fora. Dado ausente nunca vira "não" por omissão (mesma doutrina de §Elegibilidade).

**Os tiers** (coluna `tier` da `_calc`) ordenam por PRAZO primeiro, elegibilidade
depois — "aberto" é fato verificável, "sem prazo" é hipótese:

| tier | significado | no `Concursos`? |
|------|-------------|--------------|
| 1 | aberto · você pode prestar | sim |
| 2 | aberto · titulação a confirmar | sim |
| 3 | aberto · só com doutorado | sim |
| 4 | sem prazo (≤ 60 d) · você pode prestar | sim |
| 5 | sem prazo (≤ 60 d) · titulação a confirmar | sim |
| 6 | sem prazo (≤ 60 d) · só com doutorado | sim |
| 7 | sem prazo, fora da janela | não — só em `Concursos · tudo` |
| 8 | encerrado | não — só em `Concursos · tudo` |

**Locale-alvo: Português (Brasil)** — separador de argumento `;`. Em locale en-US,
troque todo `;` por `,`. Os nomes de função ficam em inglês de propósito: o Sheets
aceita nome inglês em qualquer locale, só o separador muda.

#### Nome da instituição — por que não existe mais "UF de São Carlos"

`UF` é a sigla de **unidade federativa** e aparece na MESMA linha do card
(`SP · …`). Abreviar "Universidade Federal" como `UF` fazia o leitor traduzir a
mesma sigla duas vezes por linha com sentidos diferentes, e colava visualmente
cards de instituições distintas — `MT · UF de Mato Grosso` logo abaixo de
`MT · IF de Mato Grosso`. Isso valia para **22 de 22** cards do `Concursos`.

O nome curto sai de duas camadas, nesta ordem:

1. **Sigla canônica**, por `VLOOKUP` na tabela `_calc!V:W` —
   `UFSCar`, `IFMT`, `UNILA`, `UFRGS`. É como JB chama a instituição e é o mais
   curto. Fonte: `_norman/siglas.js`, hoje com **89 instituições**.
2. **Fallback tipográfico**, para qualquer instituição fora do mapa — mais longo,
   **nunca errado**, e sem sigla inventada:

| encontra | vira |
|----------|------|
| `Instituto Federal de Educação, Ciência e Tecnologia` | `Inst. Federal` |
| `Centro Federal de Educação Tecnológica` | `CEFET` |
| `Universidade Tecnológica Federal` | `Univ. Tecn. Federal` |
| `Fundação Universidade Federal` | `Univ. Federal` |
| `Universidade Federal` | `Univ. Federal` |

**Só entra no mapa sigla que é nome próprio institucional verificável, nunca
derivada por regra de string.** A prova de que regra de string não serve está
no próprio store: Itajubá é `UNIFEI` (não "UFI"), Catalão é `UFCAT` (não "UFC",
que é o Ceará), Alfenas é `UNIFAL-MG`, Farroupilha é `IFFar`. Sigla é fato
institucional — chute vira erro factual numa peça de decisão. Na dúvida, deixe
cair no fallback: ele custa caracteres, não correção.

**A cobertura se confere, não se supõe** — um mapa envelhece em silêncio:

```bash
node _norman/cobertura-siglas.js
```

Lê `dados!A2:A` de verdade e lista o que caiu no fallback, com contagem e com o
texto exato que JB vê. Aborta sozinho (`exit 1`) se um dos três controles
reprovar: **C1** um nome que tem que resolver pelo mapa e não resolveu (lookup
quebrado); **C2** um nome inventado que tem que cair no fallback e não caiu (mapa
casando demais); **C3** qualquer nome curto que reintroduza a colisão — igual a
sigla de UF, ou começando com `UF ` ou com sigla de UF. Hoje: **89 entradas,
46/46 instituições do store resolvidas pelo mapa, 0 no fallback.**

> A regra do C3 é estreita **de propósito, e foi estreitada depois de medir**: a
> primeira versão proibia qualquer prefixo de 2 letras e reprovou `IF Goiano` e
> `IF Sudeste MG`, que são o nome próprio dessas instituições. Regra que reprova o
> que está certo é a regra errada. `IF` não é sigla de unidade federativa nenhuma,
> não é ambíguo, e fica.

#### Aba `_calc` (oculta) — a derivação

Cabeçalho em `A1:R1`:

```
ordem | tier | subkey | p_vaga | p_situacao | p_url | p_ordem | t_situacao | t_elegibilidade | t_prazo | t_uf | t_area | t_orgao | t_subarea | t_url | t_ordem | t_subedital | p_inst
```

A tabela de siglas vive em `V:W` da mesma aba — fora do bloco de fórmulas,
aberta pra baixo (o mapa cresce), escrita por `_norman/construir.js` a partir de
`_norman/siglas.js`. Como `_calc` nunca é tocada pelo sync, a tabela sobrevive.

A coluna `Y` guarda a **lista de feriados nacionais** (84 datas, ano corrente ±) que o
`NETWORKDAYS` do aviso de planilha desatualizada consulta — gerada por
`_norman/feriados.js` a partir de `lib/feriados-nacionais.js`, o mesmo módulo que
`rodar-diario.bat` usa pra decidir se roda. Fica em `Y` com `X` de folga entre ela e a
tabela de siglas; `_norman/construir.js` aborta se as duas colidirem.

Uma fórmula por coluna, todas na **linha 2** (espalham sozinhas pra baixo):

`_calc!A2`:

```
=ARRAYFORMULA(IF(B2:B="";"";B2:B*100000+IF(C2:C>999;999;C2:C)*100+(100-IF('dados (não edite)'!O2:O="";0;'dados (não edite)'!O2:O))))
```

`_calc!B2`:

```
=ARRAYFORMULA(IF(('dados (não edite)'!A2:A="")+('dados (não edite)'!U2:U<>"docente")>0;"";IF('dados (não edite)'!M2:M<>"";IF(DATEVALUE('dados (não edite)'!M2:M)>=TODAY();IF('dados (não edite)'!P2:P="elegivel_agora";1;IF('dados (não edite)'!P2:P="indeterminada";2;3));8);IF(TODAY()-DATEVALUE('dados (não edite)'!N2:N)<=60;IF('dados (não edite)'!P2:P="elegivel_agora";4;IF('dados (não edite)'!P2:P="indeterminada";5;6));7))))
```

`_calc!C2`:

```
=ARRAYFORMULA(IF(('dados (não edite)'!A2:A="")+('dados (não edite)'!U2:U<>"docente")>0;"";IF('dados (não edite)'!M2:M<>"";ABS(DATEVALUE('dados (não edite)'!M2:M)-TODAY());TODAY()-DATEVALUE('dados (não edite)'!N2:N))))
```

`_calc!D2`:

```
=ARRAYFORMULA(IF(('dados (não edite)'!A2:A="")+('dados (não edite)'!U2:U<>"docente")>0;"";K2:K&" · "&M2:M&CHAR(10)&Q2:Q))
```

`_calc!E2`:

```
=ARRAYFORMULA(IF(('dados (não edite)'!A2:A="")+('dados (não edite)'!U2:U<>"docente")>0;"";J2:J&CHAR(10)&I2:I))
```

`_calc!F2`:

```
=ARRAYFORMULA(IF(('dados (não edite)'!A2:A="")+('dados (não edite)'!U2:U<>"docente")>0;"";'dados (não edite)'!S2:S))
```

`_calc!G2`:

```
=ARRAYFORMULA(IF(A2:A="";"";A2:A))
```

`_calc!H2`:

```
=ARRAYFORMULA(IF(('dados (não edite)'!A2:A="")+('dados (não edite)'!U2:U<>"docente")>0;"";IF('dados (não edite)'!M2:M="";"⚠️ SEM PRAZO";IF(DATEVALUE('dados (não edite)'!M2:M)>=TODAY();"🟢 ABERTO";"🔴 ENCERRADO"))))
```

`_calc!I2`:

```
=ARRAYFORMULA(IF(('dados (não edite)'!A2:A="")+('dados (não edite)'!U2:U<>"docente")>0;"";IF('dados (não edite)'!P2:P="elegivel_agora";"✅ pode prestar";IF('dados (não edite)'!P2:P="indeterminada";"❓ confirmar titulação";"🎓 só com doutorado"))))
```

`_calc!J2`:

```
=ARRAYFORMULA(IF(('dados (não edite)'!A2:A="")+('dados (não edite)'!U2:U<>"docente")>0;"";IF('dados (não edite)'!M2:M="";"⚠️ sem prazo · publicado há "&(TODAY()-DATEVALUE('dados (não edite)'!N2:N))&" d";IF(DATEVALUE('dados (não edite)'!M2:M)<TODAY();"🔴 encerrou "&TEXT(DATEVALUE('dados (não edite)'!M2:M);"dd/mm/aa");IF(DATEVALUE('dados (não edite)'!M2:M)=TODAY();"🟢 fecha HOJE";"🟢 fecha em "&(DATEVALUE('dados (não edite)'!M2:M)-TODAY())&" d · "&TEXT(DATEVALUE('dados (não edite)'!M2:M);"dd/mm"))))))
```

`_calc!K2`:

```
=ARRAYFORMULA(IF(('dados (não edite)'!A2:A="")+('dados (não edite)'!U2:U<>"docente")>0;"";'dados (não edite)'!C2:C))
```

`_calc!L2`:

```
=ARRAYFORMULA(IF(('dados (não edite)'!A2:A="")+('dados (não edite)'!U2:U<>"docente")>0;"";IF('dados (não edite)'!D2:D="";"❓ não identificada";IF(REGEXMATCH(LOWER('dados (não edite)'!D2:D);"design");"Design";IF(REGEXMATCH(LOWER('dados (não edite)'!D2:D);"ux|ihc|intera[çc]");"UX/IHC";IF(REGEXMATCH(LOWER('dados (não edite)'!D2:D);"comput|intelig[êe]ncia artificial|/ia|aprendizado de m|tecnologia da informa|sistemas de informa|engenharia de software|ci[êe]ncia da computa");"Computação/IA";"Outra"))))))
```

`_calc!M2`:

```
=ARRAYFORMULA(IF(('dados (não edite)'!A2:A="")+('dados (não edite)'!U2:U<>"docente")>0;"";R2:R&IF('dados (não edite)'!B2:B="";"";" — "&'dados (não edite)'!B2:B)))
```

`_calc!N2`:

```
=ARRAYFORMULA(IF(('dados (não edite)'!A2:A="")+('dados (não edite)'!U2:U<>"docente")>0;"";IF('dados (não edite)'!E2:E="";"—";'dados (não edite)'!E2:E)&IF('dados (não edite)'!R2:R="formato_nao_reconhecido";" · 👁️ confira no edital";"")))
```

`_calc!O2`:

```
=ARRAYFORMULA(IF(A2:A="";"";F2:F))
```

`_calc!P2`:

```
=ARRAYFORMULA(IF(A2:A="";"";A2:A))
```

`_calc!Q2`:

```
=ARRAYFORMULA(IF(('dados (não edite)'!A2:A="")+('dados (não edite)'!U2:U<>"docente")>0;"";IF('dados (não edite)'!F2:F="";"—";'dados (não edite)'!F2:F)))
```

`_calc!R2`:

```
=ARRAYFORMULA(IF(('dados (não edite)'!A2:A="")+('dados (não edite)'!U2:U<>"docente")>0;"";IFERROR(VLOOKUP('dados (não edite)'!A2:A;_calc!$V$2:$W;2;FALSE);SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE('dados (não edite)'!A2:A;"Instituto Federal de Educação, Ciência e Tecnologia";"Inst. Federal");"Centro Federal de Educação Tecnológica";"CEFET");"Universidade Tecnológica Federal";"Univ. Tecn. Federal");"Fundação Universidade Federal";"Univ. Federal");"Universidade Federal";"Univ. Federal"))))
```

#### Aba `Concursos` — a resposta

`A2` (o veredito: responde o job primário em uma frase, contra `TODAY()`):

```
=IFERROR(LET(cd;IFERROR(DATEVALUE('dados (não edite)'!$Y$1);IFERROR(N('dados (não edite)'!$Y$1);0));at;IF(cd=0;-1;NETWORKDAYS(cd;TODAY();_calc!$Y$2:$Y)-1);IF(NOT(OR(at<0;at>=3));"";IF(at<0;"🛑 SEM CARIMBO DE DATA — esta planilha não sabe de quando ela é: o carimbo do último sync sumiu da aba dados (não edite). Não confie na lista abaixo, pode ser de semanas atrás. Rode: node radar.js sincronizar-sheets"&CHAR(10);"🛑 SEM ATUALIZAR DESDE "&TEXT(cd;"dd/mm")&" — "&at&" dias úteis. O que é NOVO não está aqui (as contas de prazo abaixo continuam certas). Confira a tarefa RadarAcademicoJB no Agendador de Tarefas do Windows e se o PC ficou ligado."&CHAR(10))));"")&IF((COUNTIF(_calc!B2:B;1)-SUMPRODUCT((INT($L$5:$L/100000)=1)*($O$5:$O=TRUE)))>0;"🟢 "&(COUNTIF(_calc!B2:B;1)-SUMPRODUCT((INT($L$5:$L/100000)=1)*($O$5:$O=TRUE)))&" ABERTA(S) que você pode prestar AGORA — no topo da lista.";IF((COUNTIF(_calc!B2:B;2)-SUMPRODUCT((INT($L$5:$L/100000)=2)*($O$5:$O=TRUE)))>0;"⚠️ Nenhuma aberta confirmada pra você. "&(COUNTIF(_calc!B2:B;2)-SUMPRODUCT((INT($L$5:$L/100000)=2)*($O$5:$O=TRUE)))&" aberta(s) com titulação não identificada — abra o edital.";IF((COUNTIF(_calc!B2:B;3)-SUMPRODUCT((INT($L$5:$L/100000)=3)*($O$5:$O=TRUE)))>0;"🔴 Nada aberto que você possa prestar hoje: as "&(COUNTIF(_calc!B2:B;3)-SUMPRODUCT((INT($L$5:$L/100000)=3)*($O$5:$O=TRUE)))&" abertas exigem doutorado.";IF((COUNTIF(_calc!B2:B;4)-SUMPRODUCT((INT($L$5:$L/100000)=4)*($O$5:$O=TRUE)))>0;"⚠️ Nada aberto. "&(COUNTIF(_calc!B2:B;4)-SUMPRODUCT((INT($L$5:$L/100000)=4)*($O$5:$O=TRUE)))&" sem prazo que você poderia prestar — abra pra ver se ainda dá.";"🔴 Nada aberto e nada recente sem prazo. Lista vazia hoje — o radar segue rodando."))))
```

`A3` (as contagens, inclusive quantos ficaram fora e por quê — e, no fim, o aviso
de concentração):

```
="As "&((COUNTIF(_calc!B2:B;1)+COUNTIF(_calc!B2:B;2)+COUNTIF(_calc!B2:B;3))+(COUNTIF(_calc!B2:B;4)+COUNTIF(_calc!B2:B;5)+COUNTIF(_calc!B2:B;6)))&" linhas abaixo = "&(COUNTIF(_calc!B2:B;1)+COUNTIF(_calc!B2:B;2)+COUNTIF(_calc!B2:B;3))&" com inscrição aberta + "&(COUNTIF(_calc!B2:B;4)+COUNTIF(_calc!B2:B;5)+COUNTIF(_calc!B2:B;6))&" sem data de inscrição no edital (dos últimos 60 d)."&"  ·  "&COUNTIF('dados (não edite)'!U2:U;"docente")&" editais de professor no radar."&"  ·  "&COUNTIF(B5:B;TRUE)&" já inscrito(s)."&IF(COUNTIFS(B5:B;TRUE;N5:N;"robô")=0;"";" ("&COUNTIFS(B5:B;TRUE;N5:N;"robô")&" pelo robô)")&CHAR(10)&"Toque no funil ▼ da linha 4 pra cortar por Elegível?, Situação, Área, UF."&IF((COUNTA('dados (não edite)'!A2:A)-COUNTIF('dados (não edite)'!U2:U;"docente")-COUNTIF('dados (não edite)'!U2:U;"mercado"))<=0;"";CHAR(10)&"⚠️ "&(COUNTA('dados (não edite)'!A2:A)-COUNTIF('dados (não edite)'!U2:U;"docente")-COUNTIF('dados (não edite)'!U2:U;"mercado"))&" registro(s) na aba ""dados (não edite)"" com trilha desconhecida — não aparecem em NENHUMA aba de leitura. "&"Confira a coluna U (trilha) dessa aba.")&IFERROR(LET(v;FILTER(_calc!R2:R;ISNUMBER(_calc!A2:A);_calc!B2:B<=6);n;ROWS(v);c;MAP(v;LAMBDA(x;COUNTIF(v;x)));mx;MAX(c);IF(mx<5;"";IF(mx*10<n*4;"";CHAR(10)&"⚠️ "&mx&" das "&n&" linhas abaixo são da mesma instituição ("&INDEX(v;MATCH(mx;c;0))&") — role até o fim, tem outras "&(n-mx)&".")));"")&IF(SUBTOTAL(103;C5:C)>=((COUNTIF(_calc!B2:B;1)+COUNTIF(_calc!B2:B;2)+COUNTIF(_calc!B2:B;3))+(COUNTIF(_calc!B2:B;4)+COUNTIF(_calc!B2:B;5)+COUNTIF(_calc!B2:B;6)));"";CHAR(10)&"⚠️ Faltam linhas na tela: mostrando "&SUBTOTAL(103;C5:C)&" de "&((COUNTIF(_calc!B2:B;1)+COUNTIF(_calc!B2:B;2)+COUNTIF(_calc!B2:B;3))+(COUNTIF(_calc!B2:B;4)+COUNTIF(_calc!B2:B;5)+COUNTIF(_calc!B2:B;6)))&". Tem corte ligado no funil ▼ — toque no ▼ da coluna filtrada e marque ""Selecionar tudo"" pra ver todas de novo.")
```

O **aviso de concentração** é o trecho final da `A3`. Existe porque 15 das 23
linhas de hoje são subeditais do mesmo edital da UFSCar: sem aviso, o `Concursos` lê
como monólito e as 8 que **não** são UFSCar somem no meio. Ele filtra pela mesma
condição da lista (`ISNUMBER(ordem)` + `tier<=6`), então nunca diverge da lista
logo abaixo, e só aparece quando uma instituição responde por **≥5 linhas E ≥40%**
— do contrário some sozinho, sem ocupar a linha congelada. Provado nos 5 ramos:
5/7 mostra · 5/13 some (38%) · 4/5 some (`mx<5`) · 1 linha some · lista vazia
some sem `#N/A`.

Sem decimal na fórmula **de propósito** (`mx*10<n*4` em vez de `mx/n<0,4`): o
separador decimal muda com o locale, `*10` não. E o texto diz "mesma
**instituição**", não "mesmo edital" — edital é o que se vê olhando; instituição
é o que a fórmula consegue **afirmar** com o campo que existe.

`A4` em diante (cabeçalho — `_url` e `_ordem` ficam em colunas OCULTAS):

```
Abrir | Inscrito | Vaga | Elegível? | Situação | Área | UF | Prazo | Subárea | Subedital | _url | _ordem | link (copiar) | _por_quem | ❌
```

`A5` (a lista: tiers 1-6, já ordenada — sem filtro, sem ordenação manual):

```
=IFERROR(CHOOSECOLS(SORT(FILTER(_calc!H2:Q;ISNUMBER(_calc!A2:A);_calc!B2:B<=6);9;TRUE);6;2;1;5;4;3;7;10;8;9);IF(COUNTA(_calc!A2:A)=0;"⚠️ A aba `_calc` está vazia. Rode: `node _norman/construir.js`";""))
```

`E5` (o link, montado da coluna C oculta — URL de 90 chars não cabe no celular):

```
=ARRAYFORMULA(IF(K5:K="";"";HYPERLINK(K5:K;"📄 edital")))
```

`F5` (`link (copiar)`: a mesma URL em TEXTO, na última coluna, fora da dobra):

```
=ARRAYFORMULA(IF(K5:K="";"";K5:K))
```

Esta coluna é o insumo do job **"vi uma vaga, quero pôr na Fila"**, que era o mais
quebrado da peça — e o dado provava: a `Fila` tinha ZERO linhas. Não por falta de
vontade: obter a URL exigia desocultar a coluna `_url` (≈3 passos no celular) e o `id`
exigia um lookup manual em 750 linhas de `dados (não edite)`. Uma aba de captura cujo custo de
captura é proibitivo fica vazia. Agora a URL está em texto, e o `id` sai dela sozinho
do lado de lá. Coluna DERIVADA por `ARRAYFORMULA` ancorada na coluna do spill, nunca
digitada ao lado dele — coluna digitada ao lado de um `FILTER` desalinha em silêncio
quando o filtro muda de tamanho. Fora da dobra é o preço certo: copiar link é ação
deliberada, e o começo da linha pertence ao que se lê num relance.

#### Aba `Concursos · tudo` — a análise (OCULTA na barra)

`A2` (o que é esta aba):

```
=IFERROR(LET(cd;IFERROR(DATEVALUE('dados (não edite)'!$Y$1);IFERROR(N('dados (não edite)'!$Y$1);0));at;IF(cd=0;-1;NETWORKDAYS(cd;TODAY();_calc!$Y$2:$Y)-1);IF(NOT(OR(at<0;at>=3));"";IF(at<0;"🛑 SEM CARIMBO DE DATA — esta planilha não sabe de quando ela é: o carimbo do último sync sumiu da aba dados (não edite). Não confie na lista abaixo, pode ser de semanas atrás. Rode: node radar.js sincronizar-sheets"&CHAR(10);"🛑 SEM ATUALIZAR DESDE "&TEXT(cd;"dd/mm")&" — "&at&" dias úteis. O que é NOVO não está aqui (as contas de prazo abaixo continuam certas). Confira a tarefa RadarAcademicoJB no Agendador de Tarefas do Windows e se o PC ficou ligado."&CHAR(10))));"")&"Concurso de professor — tudo o que o radar já viu: "&COUNTIF('dados (não edite)'!U2:U;"docente")&" editais, inclusive os que já encerraram e os sem data de inscrição. Já vem ordenado: o mais acionável primeiro. Toque no funil ▼ da linha 3 pra cortar por Elegível?, Situação, Área, UF."&CHAR(10)&"Esta aba fica OCULTA na barra (é arquivo, consulta rara). Ela tem a MESMA forma da 🎓 Concursos — mesmas colunas, mesma ordem, mesmo funil; a única diferença é que aqui nada é cortado. O que dá pra prestar agora está em 🎓 Concursos, na linha 1 — e as "&COUNTIF('dados (não edite)'!U2:U;"mercado")&" vagas de emprego, em 💼 Empregos."&IF(SUBTOTAL(103;C4:C)>=COUNTIF('dados (não edite)'!U2:U;"docente");"";CHAR(10)&"⚠️ Faltam linhas na tela: mostrando "&SUBTOTAL(103;C4:C)&" de "&COUNTIF('dados (não edite)'!U2:U;"docente")&". Tem corte ligado no funil ▼ — toque no ▼ da coluna filtrada e marque ""Selecionar tudo"" pra ver todas de novo.")
```

`A3` em diante (cabeçalho — é a linha do funil; `_url` e `_ordem` ocultas):

```
Abrir | Inscrito | Vaga | Elegível? | Situação | Área | UF | Prazo | Subárea | Subedital | _url | _ordem | link (copiar) | _por_quem | ❌
```

`A4` (o arquivo completo da trilha docente, mesma ordem do `Concursos`):

```
=IFERROR(CHOOSECOLS(SORT(FILTER(_calc!H2:Q;ISNUMBER(_calc!A2:A));9;TRUE);6;2;1;5;4;3;7;10;8;9);IF(COUNTA(_calc!A2:A)=0;"⚠️ A aba `_calc` está vazia. Rode: `node _norman/construir.js`";""))
```

`J4` (o link):

```
=ARRAYFORMULA(IF(K4:K="";"";HYPERLINK(K4:K;"📄 edital")))
```

**Os 4 cortes secundários saem do funil da linha 3 da `Concursos · tudo`**, e só funcionam
porque as colunas de eixo têm valores POUCOS e ESTÁVEIS: Situação = 3 valores,
Elegibilidade = 3, UF = 22, Área = 5 (normalizada de 9 valores crus sujos, um deles
com 130 caracteres). A contagem de dias vive na coluna `Prazo` — que tem 138 valores
distintos e MUDA TODO DIA, e por isso **não é eixo de filtro**. Era o defeito da
versão anterior: `"🟢 aberta (16 dias)"` era um valor, não uma categoria, e qualquer
filtro salvo em cima dele quebrava no dia seguinte.

#### Aba `Empregos` — a resposta do mercado

Responde um job só, o que JB formulou como **"que vaga abriu que combina comigo?"**.
Não é a `Concursos · tudo` da trilha mercado nem o `Concursos` dela: é uma superfície de ação no
topo que vira garimpo conforme se rola, sem trocar de aba.

**O eixo temporal é OUTRO, e isso foi medido, não suposto.** Na trilha docente o eixo
é o prazo: `inscricao_fim` é fato publicado no DOU e discrimina. Na trilha mercado o
MESMO campo é fantasma — no store de 26/08/2026, com 359 vagas da Gupy:

| `inscricao_fim` | quantas |
|---|---|
| futuro | 343 |
| vencido | **0** |
| ausente | 16 |

Um campo que joga 343 de 359 no mesmo balde não separa nada. Pior: **46 vagas
publicadas há mais de 90 dias — uma delas há 1828 dias, de 2021** — seriam impressas
como `🟢 ABERTO · fecha em N d` se herdassem a fórmula docente. Isso não é
imprecisão: é a peça afirmando, com ícone verde, uma coisa que ela não sabe. Por isso
`inscricao_fim` **não aparece** nesta aba (continua cru em `dados!M`, nada foi
apagado) e o eixo é a **idade da publicação**, que distribui de verdade:

| balde | quantas | é o quê |
|---|---|---|
| `🔥 hoje` | 6 | o delta desde ontem |
| `🟢 até 7 d` | 68 | ainda quente |
| `🟡 8 a 30 d` | 142 | vale tentar |
| `⚪ 31 a 90 d` | 97 | provavelmente fechada |
| `🗄️ + de 90 d` | 46 | arquivo |
| `❓ sem data` | 0 hoje | estado real, provado por linha sintética |

**Balde, não número de dias** — mesma lei que já vale na `Concursos · tudo`: coluna que é eixo de
filtro precisa de valores POUCOS e ESTÁVEIS. `"há 13 d"` muda todo dia e tem ~100
variantes; filtro salvo em cima dele quebra amanhã. O número exato não some: ele **é**
a ordenação (dentro do balde, a mais recente primeiro) e a data crua está em `dados!N`.

**Os limiares do `Match`.** 51 não é chute: é
`config/notificacao.json → score_minimo`, o mesmo corte que decide se a vaga vira
mensagem no Telegram — a peça e a notificação passam a concordar sobre o que é
"combina". 70 é o quartil superior MEDIDO no dado real (88 de 359 =
24,5%), não um número redondo escolhido por simetria.

| `Match` | faixa de score | quantas |
|---|---|---|
| `🟩 forte` | ≥ 70 | 88 |
| `🟨 combina` | 51 a 69 | 182 |
| `⬜ fraca` | < 51 | 89 |
| `⏳ não pontuada` | sem score (antes do `julgar`) | 0 hoje |

**A ordem é balde ASC, depois score DESC, depois idade ASC.** O balde manda porque o
job pergunta "que vaga ABRIU"; dentro da mesma faixa temporal, quem decide é o quanto
combina. Mesma doutrina do `Concursos`, onde o eixo primário é o prazo (fato) e o
secundário é a elegibilidade (juízo): **fato antes de heurística**.

`Abrir` é a **coluna A**, não a última. O bloco do `FILTER` precisa ser contíguo
(`AA:AH` → `C:J`, a partir de `Vaga`), então o link só cabe antes dele ou depois — e
depois cairia fora da dobra: abrir a vaga, que é a ação inteira desta aba, custaria um
arrasto lateral. **Onda UX 13** — `Inscrito` entrou em **B**, entre `Abrir` e `Vaga`
(única posição que não interrompe o bloco contíguo do `FILTER`). **V4 (Leva 6)** —
`Empregos` congela 4 colunas (Abrir+Inscrito+Vaga+Publicada, 418 px), não mais 3: ação,
checkbox, identidade da vaga E o sinal de frescor (🔥/🟢/🟡/⚪/🗄️) sempre visíveis, mesmo
rolando o resto da linha — o mesmo mecanismo que já garante `Elegível?` em `Concursos`.
Os 4 eixos de filtro restantes ficam à direita, a um arrasto — que é o custo certo pra
uma operação deliberada e o custo errado pra ação principal.

**Os 5 cortes do funil da linha 4**, todos com poucos valores estáveis:
`Quando` 6 · `Match` 4 · `Área` 3 · `Modalidade` 4 · `Nível` 10. Nenhuma delas contém
número de dias nem score cru.

> **Sem aviso de concentração aqui, e é decisão medida.** No `Concursos` ele existe
> porque 15 das 22 linhas são subeditais do mesmo edital. Aqui, 359 vagas se espalham
> por 215 empresas e a maior concentração é 14 (3,9%), muito abaixo do gatilho de ≥5
> linhas E ≥40% — o aviso nunca dispararia. E custaria caro: a fórmula é `COUNTIF` por
> linha via `MAP/LAMBDA`, ~359² comparações a cada abertura no celular. Feature que
> não dispara e ainda pesa é feature sem tarefa.

**O nome da empresa é truncado em 34 caracteres, não limpo.** `orgao` na trilha
mercado é o `careerPageName` cru da Gupy, que é campo de marketing e não razão social
— `"VENHA SER #SANGUELARANJA 🧡🚀"` (14 vagas), `"Assaí Atacadista - O atacadista com
50 anos de tradição! #VemserAssaí"` (69 chars); 25 dos 215 nomes passam de 30. Cortar
no `" - "` daria `"Assaí Atacadista"` (certo) mas também `"IBS"` e `"SENAI"` (perda de
sentido), e nenhuma regra de string sabe qual empresa é `#SANGUELARANJA`. Truncar
custa caracteres, nunca correção — mesma doutrina do fallback de siglas.

`A2` (o veredito — cascata de 6 ramos, do melhor caso ao vazio absoluto):

```
=IFERROR(LET(cd;IFERROR(DATEVALUE('dados (não edite)'!$Y$1);IFERROR(N('dados (não edite)'!$Y$1);0));at;IF(cd=0;-1;NETWORKDAYS(cd;TODAY();_calc!$Y$2:$Y)-1);IF(NOT(OR(at<0;at>=3));"";IF(at<0;"🛑 SEM CARIMBO DE DATA — esta planilha não sabe de quando ela é: o carimbo do último sync sumiu da aba dados (não edite). Não confie na lista abaixo, pode ser de semanas atrás. Rode: node radar.js sincronizar-sheets"&CHAR(10);"🛑 SEM ATUALIZAR DESDE "&TEXT(cd;"dd/mm")&" — "&at&" dias úteis. O que é NOVO não está aqui (as contas de prazo abaixo continuam certas). Confira a tarefa RadarAcademicoJB no Agendador de Tarefas do Windows e se o PC ficou ligado."&CHAR(10))));"")&IF(COUNTIF('dados (não edite)'!U2:U;"mercado")=0;"🔴 Nenhuma vaga de mercado no radar ainda. Nada a fazer aqui hoje — a coleta da Gupy roda junto com o radar diário.";IF(COUNTIFS(_calc!AJ2:AJ;1;_calc!AK2:AK;1)>0;"🔥 "&COUNTIFS(_calc!AJ2:AJ;1;_calc!AK2:AK;1)&" vaga(s) publicada(s) HOJE que combinam forte com você — no topo da lista.";IF(COUNTIFS(_calc!AJ2:AJ;"<=2";_calc!AK2:AK;1)>0;"🟢 "&COUNTIFS(_calc!AJ2:AJ;"<=2";_calc!AK2:AK;1)&" vaga(s) dos últimos 7 dias que combinam forte com você — no topo da lista.";IF(COUNTIF(_calc!AJ2:AJ;"<=2")>0;"⚠️ Nenhuma vaga FORTE nos últimos 7 dias. "&COUNTIF(_calc!AJ2:AJ;"<=2")&" nova(s) com aderência média ou baixa — role e julgue você mesmo.";IF(COUNTIF(_calc!AK2:AK;1)>0;"⚠️ Nada novo nos últimos 7 dias. As "&COUNTIF(_calc!AK2:AK;1)&" vaga(s) forte(s) da lista são mais antigas — as melhores primeiro, mas confira se ainda estão no ar.";"🔴 Nada novo e nada forte hoje. A lista abaixo é arquivo — o radar segue rodando.")))))
```

`A3` (contagens + aviso condicional de "ainda sem pontuação"):

```
="Novas (≤ 7 d): "&COUNTIF(_calc!AJ2:AJ;"<=2")&"  ·  combinam forte: "&COUNTIF(_calc!AK2:AK;1)&"  ·  "&COUNTIF('dados (não edite)'!U2:U;"mercado")&" vagas no radar."&"  Combina? = o quanto a vaga bate com o que você procura (🟩 forte → ⬜ fraca)."&IF(COUNTIF(_calc!AK2:AK;4)=0;"";"  ·  ⏳ "&COUNTIF(_calc!AK2:AK;4)&" ainda sem pontuação — rode: node radar.js julgar")&"  ·  "&COUNTIF(B5:B;TRUE)&" já inscrito(s)."&IF(COUNTIFS(B5:B;TRUE;L5:L;"robô")=0;"";" ("&COUNTIFS(B5:B;TRUE;L5:L;"robô")&" pelo robô)")&CHAR(10)&"Ordem: mais recente primeiro; dentro da mesma faixa, a que mais combina. Toque no funil ▼ da linha 4 pra cortar por Publicada, Combina?, Área, Modalidade, Nível."&IF(SUBTOTAL(103;C5:C)>=COUNTIF('dados (não edite)'!U2:U;"mercado");"";CHAR(10)&"⚠️ Faltam linhas na tela: mostrando "&SUBTOTAL(103;C5:C)&" de "&COUNTIF('dados (não edite)'!U2:U;"mercado")&". Tem corte ligado no funil ▼ — toque no ▼ da coluna filtrada e marque ""Selecionar tudo"" pra ver todas de novo.")
```

`A4` em diante (cabeçalho — é a linha do funil; `_url` e `_ordem` ocultas):

```
Abrir | Inscrito | Vaga | Publicada | Combina? | Área | Modalidade | Nível | _url | _ordem | link (copiar) | _por_quem | ❌
```

`A5` (o link, montado da coluna H oculta):

```
=ARRAYFORMULA(IF(I5:I="";"";HYPERLINK(I5:I;"📄 vaga")))
```

`B5` (a lista inteira, já ordenada):

```
=IFERROR(SORT(FILTER(_calc!AA2:AH;ISNUMBER(_calc!AH2:AH));8;TRUE);IF(COUNTA(_calc!A2:A)=0;"⚠️ A aba `_calc` está vazia. Rode: `node _norman/construir.js`";""))
```

`J5` (`link (copiar)` — a URL em texto, gêmea da coluna F da `Concursos`):

```
=ARRAYFORMULA(IF(I5:I="";"";I5:I))
```

#### Aba `_calc` — o bloco da trilha mercado (`AA:AK`)

Mora em `AA` em diante, deixando `S..Z` livres: `_calc!V:W` já é a tabela de
siglas das instituições docentes e está provada — encostar nela pra ganhar 6 colunas
de vizinhança seria trocar risco por nada. Por isso `construir.js` escreve os dois
blocos em chamadas SEPARADAS: um `A2:AK2` contíguo gravaria vazio por cima de `V2:W2`
e decapitaria a tabela, fazendo o `VLOOKUP` da coluna R errar a primeira instituição
em silêncio.

`AA:AH` é o bloco **visível e contíguo** (é o que o `FILTER` da `Empregos` lê);
`AI:AK` são auxiliares que ficam fora dele. `construir.js` tem guardas que levantam
exceção antes de qualquer escrita se o bloco mudar de tamanho sem que o `FILTER`, o
índice do `SORT` e o cabeçalho mudem junto.

Cabeçalho em `AA1:AK1`:

```
m_vaga | m_quando | m_match | m_area | m_modalidade | m_nivel | m_url | m_ordem | m_idade | m_balde | m_match_num
```

Uma fórmula por coluna, todas na **linha 2** (espalham sozinhas pra baixo):

`_calc!AA2`:

```
=ARRAYFORMULA(IF(('dados (não edite)'!A2:A="")+('dados (não edite)'!U2:U<>"mercado")>0;"";IF(LEN(TRIM('dados (não edite)'!A2:A))>34;LEFT(TRIM('dados (não edite)'!A2:A);33)&"…";TRIM('dados (não edite)'!A2:A))&IF(IF('dados (não edite)'!E2:E="";'dados (não edite)'!D2:D;'dados (não edite)'!E2:E)="";IF('dados (não edite)'!B2:B="";"";CHAR(10)&IF('dados (não edite)'!B2:B="";"";IFERROR(LEFT('dados (não edite)'!B2:B;FIND(" - ";'dados (não edite)'!B2:B)-1);'dados (não edite)'!B2:B)&IF('dados (não edite)'!C2:C="";"";"/"&'dados (não edite)'!C2:C)));CHAR(10)&IF('dados (não edite)'!E2:E="";'dados (não edite)'!D2:D;'dados (não edite)'!E2:E)&IF('dados (não edite)'!B2:B="";"";" · "&IF('dados (não edite)'!B2:B="";"";IFERROR(LEFT('dados (não edite)'!B2:B;FIND(" - ";'dados (não edite)'!B2:B)-1);'dados (não edite)'!B2:B)&IF('dados (não edite)'!C2:C="";"";"/"&'dados (não edite)'!C2:C))))))
```

`_calc!AB2`:

```
=ARRAYFORMULA(IF(('dados (não edite)'!A2:A="")+('dados (não edite)'!U2:U<>"mercado")>0;"";IF(AJ2:AJ=1;"🔥 hoje";IF(AJ2:AJ=2;"🟢 até 7 d";IF(AJ2:AJ=3;"🟡 8 a 30 d";IF(AJ2:AJ=4;"⚪ 31 a 90 d";IF('dados (não edite)'!N2:N="";"❓ sem data";"🗄️ + de 90 d")))))))
```

`_calc!AC2`:

```
=ARRAYFORMULA(IF(('dados (não edite)'!A2:A="")+('dados (não edite)'!U2:U<>"mercado")>0;"";IF('dados (não edite)'!O2:O="";"⏳ não pontuada";IF('dados (não edite)'!O2:O>=70;"🟩 forte";IF('dados (não edite)'!O2:O>=51;"🟨 média";"⬜ fraca")))))
```

`_calc!AD2`:

```
=ARRAYFORMULA(IF(('dados (não edite)'!A2:A="")+('dados (não edite)'!U2:U<>"mercado")>0;"";IF('dados (não edite)'!D2:D="";"❓ não identificada";'dados (não edite)'!D2:D)))
```

`_calc!AE2`:

```
=ARRAYFORMULA(IF(('dados (não edite)'!A2:A="")+('dados (não edite)'!U2:U<>"mercado")>0;"";IF('dados (não edite)'!V2:V="";"❓ não dita";IF('dados (não edite)'!V2:V="remoto";"🏠 remoto";IF('dados (não edite)'!V2:V="hibrido";"🏠🏢 híbrido";IF('dados (não edite)'!V2:V="presencial";"🏢 presencial";'dados (não edite)'!V2:V))))))
```

`_calc!AF2`:

```
=ARRAYFORMULA(IF(('dados (não edite)'!A2:A="")+('dados (não edite)'!U2:U<>"mercado")>0;"";IF('dados (não edite)'!W2:W="";"❓ não dito";IF('dados (não edite)'!W2:W="senior";"sênior";IF('dados (não edite)'!W2:W="junior";"júnior";IF('dados (não edite)'!W2:W="estagio";"estágio";'dados (não edite)'!W2:W))))))
```

`_calc!AG2`:

```
=ARRAYFORMULA(IF(('dados (não edite)'!A2:A="")+('dados (não edite)'!U2:U<>"mercado")>0;"";'dados (não edite)'!S2:S))
```

`_calc!AH2`:

```
=ARRAYFORMULA(IF(('dados (não edite)'!A2:A="")+('dados (não edite)'!U2:U<>"mercado")>0;"";AJ2:AJ*100000+(85-IF('dados (não edite)'!O2:O="";0;'dados (não edite)'!O2:O))*100+IF(AI2:AI="";99;IF(AI2:AI>99;99;IF(AI2:AI<0;0;AI2:AI)))))
```

`_calc!AI2`:

```
=ARRAYFORMULA(IF(('dados (não edite)'!A2:A="")+('dados (não edite)'!U2:U<>"mercado")>0;"";IF('dados (não edite)'!N2:N="";"";TODAY()-DATEVALUE('dados (não edite)'!N2:N))))
```

`_calc!AJ2`:

```
=ARRAYFORMULA(IF(('dados (não edite)'!A2:A="")+('dados (não edite)'!U2:U<>"mercado")>0;"";IF('dados (não edite)'!N2:N="";5;IF(AI2:AI<=0;1;IF(AI2:AI<=7;2;IF(AI2:AI<=30;3;IF(AI2:AI<=90;4;5)))))))
```

`_calc!AK2`:

```
=ARRAYFORMULA(IF(('dados (não edite)'!A2:A="")+('dados (não edite)'!U2:U<>"mercado")>0;"";IF('dados (não edite)'!O2:O="";4;IF('dados (não edite)'!O2:O>=70;1;IF('dados (não edite)'!O2:O>=51;2;3)))))
```

**Formatação** (aplicada por `_norman/formatar.js`, sobrevive ao sync porque a API
de `values` não mexe em formato): congelamento (`Concursos` 3 linhas, `Empregos` 3,
`Concursos · tudo` 2), larguras de coluna, quebra de linha, 4 regras de formatação condicional por
tier/balde em cada aba de leitura, funil na `Concursos · tudo` e na `Empregos`, `_calc` oculta e
ordem das abas.

> A limpeza de formatação condicional lê quantas regras EXISTEM (o GET da planilha já
> traz `conditionalFormats`) e apaga em UMA chamada, com os índices em ordem
> decrescente. Antes ela chutava "até 12 por aba" e mandava uma requisição por índice,
> engolindo o erro quando a regra não existia — 36 requisições pra apagar 8 regras
> reais. A cota de escrita do Sheets é **60/min por usuário** e é compartilhada com
> `construir.js`: rodar os dois em sequência estourava a cota e a formatação morria no
> meio, deixando a planilha meio-formatada. Foi observado, não previsto.

#### O carimbo de sync — como a planilha sabe de quando ela é

Todas as contas desta planilha são fórmulas contra `TODAY()`: elas se refazem sozinhas e
ficam **certas** mesmo que o radar pare. Se `rodar-diario.bat` morrer — tarefa
desagendada, `.env` corrompido, credencial expirada, PC desligado — a planilha continua
abrindo linda, com "fecha em 12 d" recalculado direitinho, e o que é novo simplesmente
não aparece. É o pior modo de falha possível: **a peça parece saudável enquanto morre.**
É a mesma doutrina que produziu a saúde barulhenta do coletor ("0 itens relevantes nunca
pode ser indistinguível de coletor quebrado"), que estava violada aqui em cima.

`MAX(data_publicacao)` seria um proxy **mentiroso**: "nenhum edital novo há 6 dias" é
estado normal do DOU. Só o próprio sync sabe que rodou.

| Onde | O quê | Escrito por |
|------|-------|-------------|
| `dados (não edite)!Y1` | data do último sync, ISO 8601 cru (`2026-08-26`) | `lib/sheets.js enviar()`, **por último**, depois dos dados |
| `dados (não edite)!Z1` | a mesma coisa por extenso, com hora e fuso | idem, na mesma escrita |
| `_calc!Y2:Y` | feriados nacionais, pro `NETWORKDAYS` | `_norman/construir.js`, de `_norman/feriados.js` |

Fica em `dados (não edite)` e **não** em `_calc` por direção de dependência: `_calc` é território de
`_norman/construir.js` e pode não existir (planilha nova, aba apagada à mão). Se `enviar()`
escrevesse lá, o sync diário passaria a depender da camada de apresentação e morreria de
madrugada num setup limpo. O bloco de dados vai de A a W e a grade tem 26 colunas —
Y e Z sobram, e `tests/sheets.test.js` guarda a folga: se `COLUNAS` crescer até alcançar
Y, o teste cai **antes** de um campo novo sobrescrever o carimbo.

ISO 8601 pelo mesmo motivo de `inscricao_fim`: é o único formato que `DATEVALUE()` lê sem
ambiguidade em qualquer locale. E a data é a **local**, não UTC — a planilha está em
`America/Sao_Paulo` e `TODAY()` responde nesse fuso; o log da tarefa registra execuções às
19:04, que em UTC já é o dia seguinte.

**O aviso.** As linhas 1 das três abas de leitura ganham um prefixo condicional:

```
🛑 SEM ATUALIZAR DESDE 19/08 — 5 dias úteis. O que é NOVO não está aqui (as contas de
prazo abaixo continuam certas). Confira a tarefa RadarAcademicoJB no Agendador de
Tarefas do Windows e se o PC ficou ligado.
```

A abertura é curta de propósito. `A1` é célula **mesclada com WRAP**, e a altura
RENDERIZADA da linha é a única coisa desta entrega que não deu pra provar: a planilha
exige o login do JB (a service account não renderiza) e `rowMetadata.pixelSize` devolve o
valor ARMAZENADO — medido, devolve 21 antes e depois de 480 caracteres numa célula
mesclada com WRAP, ou seja, o instrumento é cego pra isso. Se o Sheets não crescer a linha
sozinho, sobra a primeira linha visual — e `🛑 SEM ATUALIZAR DESDE 19/08` são 27
caracteres que já carregam sinal + veredito + data. O resto é aprofundamento, não
sustentação. **O argumento sobrevive à redução.**

Carimbo **ausente ou ilegível** tem ramo próprio (`🛑 SEM CARIMBO DE DATA — esta planilha
não sabe de quando ela é`) — é tão grave quanto carimbo velho, e cair no silêncio seria
voltar ao problema. Nas
**três** abas porque a falha é global e invalida a própria linha 1: não adianta dizer
"🟢 3 abertas que você pode prestar AGORA" se a contagem é de seis dias atrás. Cobrir as
três não custa três vezes — no estado normal os três ramos devolvem `""`, zero caractere
e zero linha.

**O limiar é 3 dias ÚTEIS, e foi medido.** Fonte: `logs/rodar-diario.log`, o histórico
completo da automação (13/08 a 26/08/2026) — execuções em 13, 14, 17, 18, 19, 20, 21, 24,
25 e 26, que são exatamente os **10 dias úteis** do intervalo. 10 de 10 esperadas, zero
perdida. O mesmo log mostra que a HORA não é estável: o normal é 08:00, mas há execuções
às 14:38, 18:59 e 19:04 — o Task Scheduler recupera um início perdido mais tarde no mesmo
dia. Logo:

| Atraso | Significa | Peça |
|--------|-----------|------|
| 0 | sincronizou hoje | silêncio |
| 1 | carimbo do dia útil anterior; a execução de hoje ainda pode acontecer até a noite | silêncio |
| 2 | um dia útil inteiro sem execução — "o PC ficou desligado ontem", se conserta sozinho amanhã | silêncio |
| ≥ 3 | **dois** dias úteis consecutivos sem execução. Não é acidente. | **acende** |

Acender em 2 seria o anti-padrão que este projeto já pagou uma vez — "um radar que grita
todo sábado é um radar que JB silencia" — e o custo seria permanente. Esperar até 3 custa
um dia de atraso na descoberta, e a partir daí o aviso acende todo dia até alguém
consertar.

**Dia útil e não dia corrido** porque `rodar-diario.bat` roda Seg-Sex e pula feriado
nacional (a 1ª linha dele chama `lib/feriados-nacionais.js diaSemPublicacaoEsperada`). Em
dias corridos, sexta → segunda de manhã já são 3: o aviso gritaria **toda segunda**.
`NETWORKDAYS` ignora fim de semana sozinho; o feriado vem da tabela em `_calc!Y`, gerada do
MESMO módulo que o `.bat` consulta — planilha e agendador concordam por construção sobre o
que é "dia sem execução esperada". Sem a tabela, uma única execução perdida ao lado de um
feriado somaria 3 e acenderia com o radar funcionando.

#### Como provar que ainda funciona

```bash
node _norman/construir.js   # cria/atualiza abas e fórmulas (idempotente)
node _norman/formatar.js    # larguras, congelamento, cores, funis (idempotente)
node _norman/verificar.js   # lê a planilha de volta e ABORTA (exit 1) se achar defeito
node _norman/prova-carimbo.js  # força o carimbo velho/ausente e prova o aviso 🛑 (aborta)
node _norman/prova-funil.js    # força um corte no funil e prova o aviso de linha escondida
node _norman/estresse.js    # 621 linhas sintéticas: ramos que o dado real não exercita
node radar.js sincronizar-sheets   # desfaz o estresse (clear + só o store real)
```

`prova-carimbo.js` existe porque o aviso de desatualizada é **condicional**, e o ramo que
importa é o que o dado real nunca aciona: no dia a dia o radar roda, o carimbo é de hoje e
a fórmula devolve `""`. Regra que só aparece em estado raro é regra que passa quebrada em
qualquer auditoria de leitura. A prova tem duas partes: **(A)** roda a fórmula de
PRODUÇÃO — obtida por substituição de `F.AVISO_SYNC`, nunca reescrita — em célula de
rascunho, com carimbo e "hoje" literais, cobrindo 11 ramos (mesmo dia · sexta→segunda ·
**sexta→terça com feriado na segunda** · quinta→segunda com Sexta-feira Santa · Carnaval ·
Natal · 1 execução perdida · 2 perdidas · uma semana parado · carimbo no futuro · carimbo
vazio), conferindo o texto renderizado E o número de dias úteis contra `_norman/feriados.js
diasUteisEntre()`, que deriva o mesmo valor por caminho independente; **(B)** adultera o
carimbo na peça de verdade e lê os três `A1` de volta pela API — C1 carimbo de hoje sem
aviso, C2 carimbo velho com data e contagem certas, C2b carimbo apagado no ramo próprio,
C3 carimbo restaurado e o aviso sumindo sozinho.

`verificar.js` faz três coisas e reprova em qualquer uma: varre
`_calc!A1:AK600`, `Concursos`, `Concursos · tudo` e `Empregos` atrás de `#REF!`/`#NAME?`/`#VALUE!`/
`#N/A`/`#DIV/0!`/`#ERROR!`/`#NUM!`/`#NULL!`; imprime as abas como JB as vê; e roda o
**controle de vazamento** — procura vocabulário docente (`doutorado`, `titula`,
`edital`, `pode prestar`) nas linhas da `Empregos` e vocabulário de mercado
(`📄 vaga`, `🏠 remoto`, `🏢 híbrido`, `sênior`) nas linhas do `Concursos`. Conferir só a
contagem não bastaria: o número pode bater com as linhas trocadas.

Ele também reprova nos quatro controles do **carimbo de sync**, e esses derrubam o
processo porque a falha deles é muda por construção — se `lib/sheets.js` parar de gravar
o carimbo, nada quebra na tela: as contas contra `TODAY()` continuam certas e a única
consequência é o aviso 🛑 nunca acender, virando um "tudo certo" permanente.

- **K1** — o carimbo existe em `dados (não edite)!Y1` e é ISO 8601, com a linha humana em `Z1`.
- **K2** — a tabela de feriados de `_calc!Y` cobre o ano corrente **+ 1**. Ela é escrita uma
  vez e congela; quando os anos acabam, `NETWORKDAYS` volta a contar feriado como dia útil
  e o aviso fica nervoso sem nada na tela explicando. Mapa curado envelhece **mudo**.
- **K3** — os três `A1` **concordam** com o veredito calculado em Node por caminho
  independente (`lib/feriados-nacionais.js` via `_norman/feriados.js`). Fórmula apagada,
  apontando pra célula errada, ou lendo tabela de feriados vazia, aparece como divergência
  em vez de ficar muda.
- **K4** — o número **impresso** é o número **calculado**. Um aviso que acende pelo motivo
  certo ainda pode mentir na conta.

`estresse.js` escreve na aba `dados (não edite)` (nunca no store) um caso por RAMO das duas
trilhas, inclusive os que o dado real de hoje não tem: vaga **sem data de
publicação**, **sem score**, com **enum desconhecido** de modalidade/senioridade,
publicada **com data no futuro**, **remota sem local nenhum**, com **nome de empresa
quilométrico**, e uma linha de **trilha órfã**. Foi ele — e não o dado real — que
pegou um separador órfão na célula `Vaga` quando área E subárea vinham vazias.

### Camada CRM (`Hoje`, `Fila`, `Projetos`, `Tarefas`, `Diário`, `Candidaturas`, `Etapas`)

> Portada da planilha pro gerador (briefing "refaça nos padrões do norman") — até
> aqui, as cinco abas existiam só na planilha, criadas e mantidas à mão por chamada
> direta de API (`tmp/aplicar-validacao.js`, hoje removido). Cabeçalho, validação,
> formatação condicional, largura e as colunas calculadas de `Projetos` são geradas
> a partir de `_norman/formulas.js`/`_norman/formatar.js`; rode `node
> _norman/construir.js` e `node _norman/formatar.js` pra reconstruir do zero.

**Diferença estrutural do bloco de cima**: `Fila`, `Projetos`, `Tarefas` e `Diário`
são DIGITADAS por JB/Durin — não são espelho nem cache do store. `construir.js`
garante a navegação (linha 1), o cabeçalho (linha 3), a instrução de estado vazio e
as colunas derivadas — e para por aí. **Nunca chama `limpar()` nelas**: apagar essas
quatro abas apagaria dado real que não existe em nenhum outro lugar, ao contrário de
`dados (não edite)` e `_calc`, que são só espelho/cache e podem ser redigitados do
zero a qualquer momento. `Hoje` é a exceção — 100% fórmula, sem célula digitada — e é
tratada como as outras abas de vista: limpa e reescrita inteira a cada `construir.js`.

**O cabeçalho desceu da linha 1 pra linha 3**, abrindo a linha 1 pra navegação. A
migração é feita por `insertDimension` (o Sheets desloca dado e formato juntos,
atomicamente) e é **idempotente**: `construir.js` não pergunta "já rodei antes", ele
lê a planilha viva e pergunta ONDE o cabeçalho está agora — se está no destino, não
faz nada; se está na linha 1, insere; se as duas estão vazias, é aba nova; qualquer
outra coisa **aborta**, porque adivinhar aqui empurraria a primeira linha de dado de
JB pra dentro do cabeçalho. Isto **nunca mais seria tão barato**: no dia da migração
havia DUAS linhas de dado real nas quatro abas somadas.

| Aba | Papel | Quem escreve a partir da linha 4 |
|-----|-------|------------------------|
| `Hoje` | Painel do dia + hub de navegação | ninguém — 100% fórmula |
| `Fila` | Vagas/editais que JB decidiu perseguir (curadoria manual) | JB/Durin/Thor (`A` derivada da `url`) |
| `Projetos` | Frentes vivas de JB, sem ligação com concurso/emprego | JB/Durin/Thor (`E`,`F`,`I`,`J`,`L`,`M`,`N` calculadas) |
| `Tarefas` | Ações concretas, cada uma amarrada (ou não) a um projeto | JB/Durin/Thor |
| `Diário` | Registro de decisão: quem decidiu o quê e por quê | JB/Durin/Thor |

#### `Hoje` — quatro grupos de coluna, oito blocos, a altura do conteúdo

Antes, cada bloco era um spill próprio ancorado numa linha calculada, e cada um
reservava o seu TETO INTEIRO. Com o estado real (2 tarefas, `Fila` vazia, 2 projetos,
`Diário` vazio), o painel tinha **13 linhas de conteúdo em 55 de altura: 42 em
branco, 76% de vão**, com os títulos espalhados por ~3 telas de celular e nada entre
eles. Não era descuido: era o preço do conserto da bomba-relógio de posição fixa, que
trocou colisão de spill por altura constante.

Agora os oito blocos são QUATRO arrays (um `VSTACK` por GRUPO de coluna, C10 Parte 3 + Onda 19), todos ancorados na MESMA linha (`A3`), em blocos de coluna disjuntos. Dentro de um grupo,
**colisão entre blocos deixou de ser possível por construção** — e a guarda de vão que
`construir.js` fazia foi aposentada junto com o modo de falha que ela cobria.
Estrutura no lugar de guarda. O preço, declarado: **nada pode ser escrito em
`Hoje!A4:D∞`**. Os tetos continuam existindo, mas agora cortam a LISTA em vez de
reservar ESPAÇO: um bloco com duas linhas ocupa duas linhas.

**Anatomia do bloco, igual nos cinco:** título (link pra aba de origem) · corpo (a
lista, ou a instrução de estado vazio) · rodapé ("+ N não cabem aqui", também link;
vazio quando cabe tudo) · uma linha de respiro.

| bloco | teto | o que lista | título leva a |
|---|---|---|---|
| ⏰ VENCE | 8 | tarefa (com prazo, desbloqueada) **e** edital docente fechando, juntos, por data | `Tarefas` |
| 🚧 ATENCAO | 8 | `Fila` fechando antes do SLA + `Candidaturas` aguardando + tarefa bloqueada | `Tarefas` |
| ⏳ TAREFAS | 12 | toda tarefa não feita, vencidas primeiro, sem-prazo por último | `Tarefas` |
| 🎯 FILA | 10 | `Fila` por ordem, fora os estágios já decididos | `Fila` |
| 📌 PROJETOS | 10 | `Projetos` até a linha 23 | `Projetos` |
| 📓 DIARIO | 5 | as últimas movimentações, com autor | `Diário` |
| 🌐 NOTICIA | 4 | as 4 abas de notícia + quantas entraram nos últimos 7 dias, cada uma | `Notícias` |
| 🆕 RADAR | 10 | o que entrou em `dados (não edite)` nos últimos 3 dias | `Empregos` |
| 📊 PULSO | 4 | inscrições/descartes dos últimos 30 d + funil de `Candidaturas` + meta (D-A3, literal "[a definir por JB]") | `Candidaturas` |

**Onda UX 8 (remodelação 2026-09-01) — o rótulo do edital em ⏰ VENCE ganha a
SUBÁREA.** Medido ao vivo (job 1 de AVALIACAO-UX.md): dois editais do mesmo órgão
("UEL — fecha HOJE" duas vezes) renderizavam IDÊNTICOS, e a decisão ficava impossível
sem abrir `Concursos` só pra desempatar. `subarea` (coluna `'dados (não edite)'$E`) já existia no store
e nunca chegava ao rótulo; agora entra (`"🎓 "&órgão&" — "&subárea`, só quando a
subárea não é vazia) — nenhuma linha do bloco repete assinatura visível (rótulo +
detalhe) contra o dado do dia nem contra dois editais sintéticos do mesmo órgão.

Três coisas mudaram junto:

- **O bloco 📓 DIÁRIO é novo.** O `Diário` é a aba onde JB e Durin conversam sobre o
  que aconteceu — e até aqui não aparecia em NENHUM lugar do painel do dia. Uma aba
  que ninguém vê é uma aba que ninguém alimenta, e ela alimenta `Projetos!I`/`F` por
  junção de nome: parar de escrever nela apaga a "última movimentação" de todo
  projeto, em silêncio. É o único bloco de RECÊNCIA (o resto é pendência), então o
  teto é curto e a ordem é a inversa de todos os outros.
- **Tarefas filtra por ESTÁGIO, não por prazo** (conserto de uma Onda anterior,
  mantido). O bloco listava só tarefa vencida ou vencendo numa janela de dias — uma
  tarefa SEM prazo cadastrado simplesmente não aparecia, e o painel dizia "— nada
  vencendo —" com tarefa aberta na mesa. Agora lista TODA tarefa que não é
  `"✅ feita"`, com um único `SORT` ascendente sobre `IF(prazo="";DATE(9999;12;31);
  prazo)` entregando vencidas → futuras → sem-prazo, sem nenhum `IF` separando os
  três casos. **Novo:** o prazo vencido ganha um `⚠️ ` na frente. Sem isso, a coluna
  do prazo é uma STRING sem emoji e o único canal de "vencida" era a POSIÇÃO no
  `SORT` — com 12 tarefas no celular, posição não é canal. Formatação condicional
  não cobre: a coluna B do `VSTACK` significa coisa diferente em cada bloco.
- **`HOJE_LIMIAR_PARADO_DIAS` morreu.** Ele contava dias CORRIDOS enquanto
  `AVISO_SYNC` conta dias ÚTEIS — mesmo número 3, unidade diferente. Sync na sexta,
  hoje terça: corridos = 4, o `Hoje` gritava "PARADO há 4 dias"; úteis = 2, a
  `Concursos` ficava muda. Uma segunda-feira perdida, o caso mais provável de todos,
  produzia um portal que se contradizia entre duas abas. A linha 1 do `Hoje` passa a
  consumir a CONSTANTE `AVISO_SYNC`. Uma fonte, um veredito.

**Os 9 glifos de título (⏳ 🎯 📌 📓 🌐 🆕 ⏰ 🚧 📊) são uma constante nomeada**
(`HOJE_BLOCO_GLIFO`), consumida pela string do título **e** pelo padrão da regra de
formatação condicional que desenha a banda do bloco. Enquanto eram literais nos dois,
trocar um emoji de título apagava a banda daquele bloco sem erro nenhum na tela.

> **Um defeito que só apareceu lendo a peça de volta.** A primeira versão do bloco
> 📓 DIÁRIO tinha `HSTACK` como expressão mais externa. Com o `Diário` vazio, o
> `FILTER` devolvia `#N/A`; um `HSTACK` de três argumentos-erro **não propaga um erro
> escalar** — ele empilha os três como células e devolve um array 1×3 de erros. E
> `IFERROR` é element-wise em array: ele mapeou o fallback de 4 colunas posição a
> posição sobre as 3, produzindo uma linha de 3 colunas, e o `VSTACK` preencheu a
> coluna D com `#N/A`. A cura não foi tunar o `IFERROR`: foi dar aos CINCO blocos a
> mesma forma (`ARRAY_CONSTRAIN(SORT(FILTER(HSTACK(...))))`), em que o erro sobe
> escalar. Uma forma, cinco instâncias, e a classe do defeito deixa de existir.

#### `Fila!id` — derivada da `url`

```
=MAP(B4:B;LAMBDA(u;IF(u="";"";IFERROR(INDEX('dados (não edite)'!$T$2:$T;MATCH(u;'dados (não edite)'!$S$2:$S;0));"— fora do radar —"))))
```

A `Fila` tinha ZERO linhas, e a causa não era falta de vontade: obter o `id` à mão
custava ir a `dados (não edite)`, localizar a linha certa entre 750, copiar a coluna `T` e voltar —
inviável no celular. Uma aba de captura cujo custo de captura é proibitivo fica
vazia. Agora JB cola a `url` (da coluna `link (copiar)`) e o `id` aparece. Fora do
store, a célula diz `— fora do radar —`: é VERDADE, não perda — a `Fila` é curadoria
e aceita candidatura que o radar nunca viu.

> Consequência a declarar: `COUNTA(A:A)` deixou de servir pra "a aba está vazia?" na
> `Fila`, porque `COUNTA` conta o `""` que a ARRAYFORMULA devolve. Quem responde isso
> ali é a coluna `url`. É o tipo de detalhe que não dá erro nenhum — só faz a
> instrução de estado vazio nunca aparecer.

#### `Projetos` — quatro colunas calculadas

| coluna | o que responde |
|---|---|
| `I` última movimentação | a data mais recente do `Diário` sobre este projeto |
| `J` tarefas abertas | **quantas** tarefas não feitas |
| `E` próximas tarefas | **quais** — as 3 mais urgentes |
| `F` últimas movimentações | **o quê** — as 2 entradas mais recentes do `Diário` |

`I` e `J` já existiam e respondiam *quanto* e *quando*, nunca *o quê*: saber quais
tarefas estavam abertas e o que tinha acontecido custava ir a duas outras abas e rolar
procurando, e o resultado era uma reconstrução mental. `E` e `F` fecham isso.

**`I` tinha um defeito em produção, achado lendo a peça viva:** com o `Diário` vazio,
ela imprimia **30/12/99** nas duas linhas de projeto de JB. `MAXIFS` sem nenhuma
correspondência devolve **0**, não erro — e 0 é o dia zero do calendário do Sheets
(30/12/1899). O `IFERROR` não pegava, porque não houve erro nenhum, e o ramo `—` que
a spec dava como "já existe" nunca era alcançado. Cura: testar o ZERO explicitamente.
A coluna passou a devolver um VALOR de data em vez de `TEXT(...)`, pra que o
`numberFormat` aplicado por `formatar.js` tenha o que formatar (sobre uma string ele é
inerte) e a máscara more num lugar só.

```
=IF($A4="";"";LET(m;MAXIFS('Diário'!$A:$A;'Diário'!$C:$C;$A4);IF(m<>0;m;IF(COUNTIF('Diário'!$C$4:$C;"<>")=0;"— nunca apareceu no Diário —";"— sem vínculo no Diário —"))))
=IF($A4="";"";IFERROR(LET(t;FILTER(HSTACK(Tarefas!$A$4:$A;Tarefas!$E$4:$E);Tarefas!$A$4:$A<>"";Tarefas!$B$4:$B=$A4;Tarefas!$C$4:$C<>"✅ feita");k;MAP(CHOOSECOLS(t;2);LAMBDA(p;IF(p="";DATE(9999;12;31);p)));TEXTJOIN(CHAR(10);TRUE;ARRAY_CONSTRAIN(CHOOSECOLS(SORT(HSTACK(CHOOSECOLS(t;1);k);2;TRUE);1);3;1)));"—"))
```

`G` (quem age) e `H` (prazo) são DIGITADAS e ficam ENTRE os dois blocos
calculados, então `construir.js` escreve `E:F` e `I:J` em faixas SEPARADAS —
um intervalo contíguo gravaria fórmula por cima delas. `K` (notas) também é
DIGITADA e vem logo depois de `J`, fora de qualquer bloco calculado.

#### `Candidaturas` — nasce de `_estado`, nunca digitada (Onda 5)

É o funil DEPOIS da inscrição. Nenhuma linha nasce por digitação: o check "Inscrito"
em `Concursos`/`Empregos` (ou o estágio virar 🟣 inscrito em `Fila`) grava em `_estado`
(oculta — a única cópia do que JB marcou), e `Candidaturas` LÊ dali por `_norman/formulas.js
candidaturasOrgao/candidaturasVaga/candidaturasAguardandoHa`. Só o que NENHUMA
máquina pode saber é digitado: `estágio` (inscrito → prova/entrevista → aprovado →
não passou), `próximo passo`, `notas`.

`🗂️ Candidaturas` responde a pergunta que JB não faz em voz alta: `E` (aguardando
há) é dias desde `inscrito em` OU desde a última mudança de estágio, o que for MAIS
recente — passado 14 d ela acende fundo de estado (mesma classe PRAZO de `Tarefas`, com o
mesmo teto de orçamento de cor — ver §O sistema visual).

#### `_estado` no Google Sheets — por que a linha 1 fica vazia de propósito (E5b, Leva 3)

`_estado` é OCULTA e não tem cabeçalho: `_norman/estado.js` define o formato da linha
por POSIÇÃO (`url`, `trilha`, `inscrito`, `quando`, `porQuem`, `nota`, e os dois campos de
candidatura — `estagio`/`estagioQuando` — quando existirem), nunca por rótulo lido de volta.
É a aba de ESTADO PURO do build (a única cópia do que JB marcou — "Inscrito", estágio de
candidatura), digitada exclusivamente por `construir.js passoColher`/`passoRestaurar`,
nunca por JB — um cabeçalho na linha 1 seria decoração pra uma aba que ninguém abre e que
nenhum código lê de volta pelo nome da coluna.

A heterogeneidade de campos por linha (5 valores numa linha, 8 noutra) também é esperada:
a API do Sheets OMITE células vazias no FINAL de uma linha (nunca no meio) — uma url que
nunca virou candidatura não tem `estagio`/`estagioQuando` pra escrever, e a leitura devolve
a linha mais curta em vez de preencher com string vazia. `EST.linhasParaMapa` (que lê `_estado`
de volta) já espera isso — é contrato, não dado corrompido.

#### `Etapas` — a entidade que `Projetos` não tinha (Onda 14)

Uma LINHA de `Projetos` não guarda lista — "os marcos de um projeto" precisa da própria
aba. DIGITADA de ponta a ponta (`projeto`, `etapa`, `ordem`, `estado`, `quando`, `quem`), no mesmo espírito de
`Fila`/`Tarefas`/`Diário`. `Projetos` passa a DERIVAR três colunas daqui — `etapa atual`
(a 1ª não-concluída, por `ordem`), `progresso` (`N de M`) e `saúde` (🔴 atrasado/parado ·
⚪ sem sinal · 🟠 sem rumo · 🟢 em dia, nunca digitada) — nunca o contrário. É "onde Durin
registra a etapa concluída", metade do pedido original de JB sobre o CRM vivo.

**D-A1 (remodelação 2026-09-01) — `⚪ sem sinal` não é regressão, é honestidade.** Antes
desta Onda, `saúde` sem NENHUM dado (zero etapa cadastrada, zero entrada de `Diário`
vinculada) caía em `🔴 parado` por default — os 2 projetos reais da planilha ficavam
vermelhos em 100% dos casos só por FALTA de registro, não por dado ruim (AVALIACAO-UX.md
Parte 2 §3). Ausência de dado agora é `⚪`, nunca `🔴`; com QUALQUER dado real (uma etapa
OU uma entrada de `Diário` vinculada), a saúde volta a calcular como antes.

#### Estado vazio — a mobília fica, só o conteúdo falta

Uma aba zerada parece **quebrada** quando some tudo, e parece **pronta pra uso**
quando a estrutura está lá e vazia. Em `Hoje` isso já é verdade de graça: os oito
títulos de bloco são strings literais dos quatro `VSTACK`, impressas com ou sem dado —
no primeiro dia JB abre e vê oito prateleiras rotuladas, cada uma com uma instrução por
baixo. Não é erro; é uma casa mobiliada esperando ser usada.

**Toda instrução de estado vazio começa com `↳ ` (U+21B3).** O marcador não é
enfeite: é o GANCHO da regra de formatação condicional que as pinta recuadas
(`=LEFT($A3;1)="↳"`). Como o `VSTACK` tornou toda posição variável, não há
como distinguir uma instrução de uma linha de dado por POSIÇÃO — só por conteúdo. E
`↳` é BMP (uma unidade de código), então sobrevive a `LEFT(...;1)`; emoji astral não
sobreviveria (`LEN` vale 2 no Sheets).

Duas camadas. A **camada 1** é o bloco correspondente em `Hoje`: é onde JB nota a
falta, e está na dobra do celular. A **camada 2** é uma célula de fórmula na linha da
nav de cada aba digitada, à direita dos links, pra quem abre a aba direto no desktop.
Preço declarado: a camada 2 fica FORA da dobra no celular, porque os 4 links consomem
a dobra inteira. A altura dessa linha é AUTOMÁTICA de propósito — ela cresce pra caber
a instrução quando a aba está vazia e volta a uma linha quando ela enche. A instrução
literalmente sai do caminho, sem nenhuma regra que a esconda.

| onde | texto |
|---|---|
| `Hoje`, bloco ⏰ | ↳ Nada vencendo nos próximos 7 d — nem tarefa, nem edital. Aproveite pra adiantar 📌 Projetos. |
| `Hoje`, bloco 🚧 | ↳ Nada travado: nenhuma tarefa bloqueada, nenhuma candidatura esquecida, nenhuma vaga correndo contra o prazo. |
| `Hoje`, bloco ⏳ | ↳ Nenhuma tarefa aberta. Escreva a primeira em ✍️ Tarefas: só «tarefa» é obrigatória. |
| `Hoje`, bloco 🎯 | ↳ Nada na fila. Copie o link (coluna «link (copiar)» de 💼 Empregos) e cole na 🎯 Fila: o resto vem sozinho. |
| `Hoje`, bloco 📌 | ↳ Nenhuma frente ativa. Nomeie em 📌 Projetos o que você toca agora: as tarefas se penduram nela. |
| `Hoje`, bloco 📓 | ↳ Diário vazio. Registre o que terminou: alimenta 📌 Projetos sozinho. |
| `Hoje`, bloco 🌐 | ↳ As abas de notícia ainda não existem. Rode: node _norman/construir.js |
| `Hoje`, bloco 🆕 | ↳ Nada novo nos últimos 3 dias. Radar rodou em &IFERROR(TEXT(DATEVALUE('dados (não edite)'!$Y$1);dd/mm);—)&: em fim de semana é normal. |
| `Hoje`, bloco 📊 | ↳ Sem dado suficiente ainda. |
| aba `Tarefas` (camada 2) | ↳ Nenhuma tarefa aberta.,Escreva aqui embaixo: só «tarefa» é obrigatória. |
| aba `Fila` (camada 2) | ↳ Fila vazia. Cole aqui o link de uma vaga:,ele está na coluna «link (copiar)» de 💼 Empregos, e o resto vem sozinho. |
| aba `Projetos` (camada 2) | ↳ Nenhuma frente cadastrada.,Escreva o nome aqui embaixo: as tarefas se penduram nele. |
| aba `Diário` (camada 2) | ↳ Diário vazio. Registre o que terminou:,alimenta 📌 Projetos sozinho. |
| aba `Etapas` (camada 2) | ↳ Nenhuma etapa cadastrada ainda.,Escreva o nome do projeto (igual a 📌 Projetos) e o marco: a saúde do projeto passa a se calcular sozinha. |

> **Zero fundo de cor, zero borda, zero ícone de alerta.** Um dia sem tarefas NÃO é
> um erro, e pintá-lo de âmbar ensinaria que é. O texto é RECUADO (5,77:1 sobre
> papel), nunca apagado: um estado vazio ilegível é a mesma falha que um ausente.

### Camada Notícia (`Notícias`, `IA`, `Trabalho`, `Ciência`)

> Fase B. Pipeline PRÓPRIO (`noticias.js`), irmão de `radar.js` — nunca uma extensão
> dele: notícia não tem elegibilidade por titulação nem aderência de área; tem cluster
> de fato repetido e percentil por lote. `radar.js`, `fontes/` e `data/store.jsonl` (a
> trilha vaga) ficam byte-idênticos. Esta seção não existia até esta Onda — o pipeline
> tinha entrado no repositório sem entrada nenhuma no README.

**Duas camadas, mesma arquitetura da trilha vaga, com a fonte trocada:**

```
`dados (não edite)` : `_calc` : Concursos/Empregos          (trilha vaga)
`notícias (não edite)`          : Notícias/IA/Trabalho/Ciência   (trilha notícia)
```

**Sem `_calc` de notícia, e é decisão, não lacuna.** O pipeline (`lib-noticias/`) já
entrega cluster, `n_veiculos` e `score` calculados antes de gravar; repetir essa conta
em fórmula seria uma segunda implementação da mesma coisa. `notícias (não edite)` chega
pronta — as quatro vistas só filtram, ordenam e recortam por janela.

#### O pipeline, em ordem (`noticias.js coletar`)

```
1. coletar        — cada fonte busca seus feeds; a guarda de frescor roda por URL
                    e rejeita feed fossilizado
2. identificar    — id estável (sha256 de link canônico + título) e extração de âncoras
3. rotear         — tabela `claude` por termo; valida aba/tabela contra TABELAS_POR_ABA
4. clusterizar    — janela de ±36h, âncoras em comum, domínios diferentes, Jaccard
5. ranquear       — percentil por (dia, aba) -> 0-60, + perfil 0-40
6. gravar         — `data/noticias.jsonl`
```

`node noticias.js recalcular` reclusteriza e repontua o que já está no store, sem tocar
a rede — é a ferramenta de CALIBRAÇÃO: o limiar de Jaccard se escolhe contra dado real,
nunca por opinião.

#### As fontes — 68 coletores em 4 abas

| aba (planilha) | aba (pipeline) | tabelas |
|---|---|---|
| `Notícias` | `geral` | `brasil`, `mundo` |
| `IA` | `ia` | `ia-geral`, `claude`, `reddit-hn` |
| `Trabalho` | `trabalho` | `mercado-trabalho`, `concursos` |
| `Ciência` | `ciencia` | `artigos`, `academico` |

`fontes-noticias/index.js TABELAS_POR_ABA` é quem VALIDA o que cada fonte declara — uma
fonte com `tabela: "brasi"` (typo) criaria uma tabela fantasma silenciosa na planilha;
`rotear()` estoura ANTES disso, com a lista de tabelas válidas no próprio erro.

#### Os 9 temas (coluna `tema`, filtrável — Onda 9)

| tema | aba | tabela | assunto |
|---|---|---|---|
| 🧭 BRASIL | `Notícias` | `brasil` | Brasil |
| 🌎 MUNDO | `Notícias` | `mundo` | mundo |
| 🧠 IA_GERAL | `IA` | `ia-geral` | IA |
| 🔶 CLAUDE | `IA` | `claude` | Claude |
| 💬 REDDIT_HN | `IA` | `reddit-hn` | Reddit/HN |
| 🧾 MERCADO | `Trabalho` | `mercado-trabalho` | mercado de trabalho |
| 📜 CONCURSOS | `Trabalho` | `concursos` | concurso público |
| 🧪 ARTIGOS | `Ciência` | `artigos` | artigo científico |
| 🏫 ACADEMICO | `Ciência` | `academico` | mundo acadêmico |

`🔶 CLAUDE` é a tabela mais magra de propósito: roteamento por termo
específico (substituto do feed da Anthropic, que não existe), nunca por termo genérico
de IA. Com até 20 vagas por tabela os temas de uma aba COMPETEM entre si — um piso
derivado do volume no store (`lib-noticias/ranking.js pisosPorTema`) evita que um tema
minoritário zere nas quatro janelas.

#### As 4 tabelas (`top 20`, não mais um seletor — Onda 8-9, quarta janela na C10)

| tabela (rótulo VIVO, calculado nesta rodada) | janela nominal |
|---|---|
| `notícias de hoje` | dia corrente (hoje) |
| `top 20 · últimos 7 dias` | 7 dias |
| `top 20 · últimos 15 dias` | 15 dias |
| `top 20 · últimos 30 dias` | 30 dias |

**Onda UX 7 (remodelação 2026-09-01) — o rótulo pode divergir da janela nominal, DE
PROPÓSITO.** Enquanto o store for mais novo que a janela (`15d`/`30d`), o rótulo cita os
DIAS REAIS de cobertura, não a promessa de 15/30 — a tabela pode estar CHEIA (20 itens)
sob uma janela ainda incompleta, e "top 20 · últimos 30 dias" mentiria sobre um store de
~14 dias. C7 (abaixo) já cobria o caso vazio; esta Onda estende a mesma honestidade ao
caso cheio (`F.noticiaRotuloJanela`, mesma `idade` de C7, nunca uma segunda conta). Assim
que o store completa a janela, o rótulo volta a dizer 15/30 sozinho — sem código novo.

`dias` não é escolhido no gerador: vem de `lib-noticias/ranking.js FAIXAS_CASCATA`, e
`F.NOTICIA_FAIXAS` (`_norman/formulas.js`) é esse mesmo array MAPEADO, não copiado — as
duas leituras da mesma fonte não divergem por construção. A planilha filtra pelas
colunas `faixa`/`posicao` da aba de fato (já calculadas pela cascata em Node, decisão
C2), não recalcula nada: `faixa="hoje"` é uma comparação de igualdade, e
`posicao` (1..20) já vem na ordem certa.

#### O carimbo de sync — mesma doutrina, unidade DIFERENTE de propósito

A trilha notícia usa o mesmo desenho do aviso de robô parado da trilha vaga (célula
`'notícias (não edite)'!$Y$1`, a mesma `CELULA_CARIMBO` de `lib/sheets.js`), com a UNIDADE trocada —
e a troca é deliberada, não descuido: a trilha vaga conta 3 dias ÚTEIS
(edital não sai no fim de semana); a notícia conta 2 dias CORRIDOS — jornal
publica domingo, e a coleta roda todo dia, fim de semana incluso. Um fim de semana
parado é normal pra uma e é o robô quebrado pra outra. As duas regras compartilham só o
gatilho visual (o mesmo glifo de alarme), porque a cor do alarme é a mesma peça —
nunca a conta.

#### Como provar que ainda funciona

```bash
node noticias.js coletar [--dry-run] [--sem-reddit] [--fonte id[,id]]   # roda o pipeline inteiro
node noticias.js status                                                # o que está no store, por aba/tabela/recorte
node noticias.js clusters [--min-veiculos N] [--aba geral|ia|trabalho|ciencia]
node noticias.js recorte <hoje|semana|quinzena|mes> [--aba x]
node noticias.js sincronizar-sheets [--dry-run]                        # espelha o store em `notícias (não edite)`
```

`sincronizar-sheets` segue o MOLDE de `lib/sheets.js enviar()` (clear + escrita ancorada
em A1 + carimbo por último) e REUSA dele o que dá — token, clear, escrita, referência
A1, montagem do carimbo, célula do carimbo. Nada de `lib/sheets.js` foi alterado: o
import é o que impede as duas trilhas de divergirem sobre "o que é um sync correto".

### O sistema visual (`_norman/formatar.js`)

A decisão central é **subtrativa e aritmética**, não de gosto. A planilha tinha 12
cores de fundo distintas; auditadas regra a regra, **17 das 18 regras de formatação
condicional duplicavam um emoji que já estava na mesma linha**. A faixa era a terceira
camada do mesmo sinal.

> **Lei da faixa.** Uma linha só ganha fundo colorido quando o sinal que ela carrega
> **não alcança o leitor por nenhum outro canal** — nem a dobra do celular (358 px) na
> primeira tela, nem o bloco `frozenColumnCount` (persiste através da rolagem, a
> garantia mais forte das duas). Onde o emoji cabe num dos dois — `Tarefas!E`, o prazo,
> FICA sem canal a mais (636 px da borda, fora de qualquer bloco congelado, uma data
> crua sem emoji) — o canal permanece, e no formato mais barato possível. **V4 (Leva 6,
> remodelação 2026-09-01) — decisão sobre o aviso da Onda UX 13:** `Inscrito` entrar em
> `Empregos!B` tinha empurrado `Publicada` (o emoji de frescor) de 346 px pra 418 px,
> fora do bloco congelado de então (334 px) — o sinal deixou de sobreviver à rolagem.
> A régua original ("cabe na dobra") não valia mais; a CURA não foi trazer fundo de
> volta (um 4º tom na paleta fechada, reabrindo a parede que 12 fundos → 3 derrubou),
> foi estender `frozenColumnCount` de `Empregos` de 3 pra 4 (Abrir+Inscrito+Vaga+
> Publicada = 418 px), o MESMO mecanismo que já garante `Elegível?` em `Concursos`.
> `Publicada` volta a sobreviver à rolagem — pelo canal que persiste, não pelo pixel.

Resultado: **18 regras → 14** (7 de estado, 4 de alarme, 3 de anatomia do `Hoje`) e
**12 fundos → 3**. O que carregava a cor continua carregando: o emoji.

| token | hex | papel | contraste |
|---|---|---|---|
| **N0 · papel** | `#FFFFFF` | a superfície de tudo que é dado | — |
| **N1 · campo** | `#F4F1EA` | fundo de TODO o cromo (região congelada) | — |
| **N2 · régua** | `#DED8CB` | a única borda da peça: sob a última linha congelada | — |
| **N3 · tinta** | `#1F1D1A` | todo texto primário | 16,81:1 sobre N0 |
| **N4 · tinta recuada** | `#6B655C` | meta, cabeçalho de coluna, linha recessiva | 5,77:1 sobre N0 |
| **ACENTO · acento** | `#0B5D57` | **só o que se toca**: `HYPERLINK` | 7,73:1 sobre N0 |
| **S1 · alarme** | `#F7DDD9` | tarefa vencida · robô parado | 13,05:1 com N3 |
| **S2 · aviso** | `#FBEFD3` | tarefa vence em ≤ 2 dias | 14,72:1 com N3 |

**O `#999999` que estava em produção media 2,85:1 e REPROVAVA AA** (mínimo 4,5:1 a
10pt) — era o único par reprovado da peça, e estava nos dois lugares mais fáceis de
não olhar: tarefa feita e candidatura descartada. N4 resolve com 5,77:1.

**O acento não é o do Linear.** `#5e6ad2` mede 4,70:1 sobre papel branco: ele é acento
de CHAPA ESCURA (o `linear.app` é preto) e a 9pt sobre papel fica no fio do limite.
Não se copia acento de chapa escura para papel. E o calor não vem do acento, vem do
substrato: N1/N2/N4 são cinzas QUENTES (R>G>B), no lugar dos cinzas frios do Google
que a peça usava. É o que separa "casa" de "formulário fiscal" e custa zero — mesma
quantidade de cor, temperatura diferente.

**O alarme do robô parado não tinha canal visual, e agora tem.** As células de
veredito eram fundo `#202124` fixo com texto branco — SEMPRE, tanto no estado normal
quanto quando `AVISO_SYNC` prefixava `🛑 SEM ATUALIZAR DESDE 19/08`. O elemento mais
pesado da tela era constante, então o aviso que INVALIDA TUDO ABAIXO DELE chegava como
mais texto dentro de uma barra preta que já estava lá. Um campo que já é o mais escuro
da tela não tem pra onde escalar. Agora o cromo inteiro é campo N1 constante e a troca
N1 → S1 no veredito é a **única mudança de cor que a peça inteira consegue produzir**.
Não há como perder. A regra LÊ O VEREDITO RENDERIZADO (`REGEXMATCH($A$n;"🛑")`) em vez
de recalcular o critério, então ela não pode divergir dele.

**Grade desligada em 8 abas, ligada em `dados (não edite)`.** A grade tem dois eixos; a lista tem
um — o que faz a peça parecer formulário fiscal é a malha VERTICAL. Desligar só ficou
possível porque a Lei da Faixa eliminou os fundos primeiro (ocultar grade e pintar
faixa colidem). A aba da máquina continua parecendo tabela **porque ela É tabela**: é
o único lugar da peça onde "parece planilha" é a leitura certa.

**Composição: um campo, uma régua, uma borda.** Toda a região congelada é campo N1;
tudo abaixo é papel N0; uma única régua N2 separa os dois. Nenhuma borda vertical em
lugar nenhum, nenhuma borda entre linhas de dado — é o que separa lista de formulário.
Formatação condicional **não desenha borda** no Sheets, então toda borda é de posição
fixa, e só a região congelada tem posição fixa; no `Hoje`, onde a posição é variável
por construção, o separador é a BANDA N1 do título — mais forte que uma régua, o que
dispensa somar os dois.

**Uma família só: Arial**, em 3 tamanhos (12 veredito / 10 corpo / 9 meta) e 4 papéis.
É a base do Sheets e a única com renderização garantida em desktop + Android + iOS +
PDF. Sem CSS, a hierarquia inteira é tamanho + peso + cor: uma fonte adicionada por
"Mais fontes" cai pro default EM SILÊNCIO onde não existe, e um fallback silencioso
não degrada a peça — ele TROCA a peça. A nav lê como cromo em três canais ao mesmo
tempo (9pt contra 12pt, regular contra bold, 6,85:1 contra 14,91:1) e só ganha do
veredito em POSIÇÃO. **A afordância de link é o sublinhado, não a cor** — é isso que
faz a nav sobreviver a daltonismo e a qualquer fallback de renderização.

> **Aplicado em UMA aba primeiro.** Nada deste sistema foi renderizado enquanto era
> escrito: toda cor é calculada por fórmula WCAG e toda geometria é soma de larguras.
> O que não se calcula é a impressão. Por isso `formatar.js` aceita
> `--piloto <aba>`: aplica em uma só, **limpeza inclusa**, e as outras ficam
> intactas — ler de volta antes de propagar é barato; replicar um erro sete vezes não.

#### A armadilha de locale, documentada onde a máscara nasce

`dd/mm/yy` (formato de `Projetos!G` e `Diário!A`) e `yyyy-mm-dd` (o ISO que
o bloco RADAR de `Hoje` usa pra comparar contra `data_publicacao`) são tokens em **inglês** —
mesmo com a planilha em locale `pt_BR`. Trocar por `aaaa` (o token de ano em
português) não dá erro: a célula silenciosamente passa a mostrar o **nome do dia
da semana** ("quarta-feira") em vez de uma data. Mesmo cuidado que `lib/sheets.js`
já documenta pra `inscricao_fim` (ISO 8601 é o único formato que o Sheets lê sem
ambiguidade de locale) — aqui o risco não é dd/mm vs mm/dd, é o FORMATO inteiro
trocando de sentido sem avisar.

#### As guardas que os briefings pediram por nome

- **Alcance de `Projetos`.** `Tarefas!B` e `Diário!C` validam contra
  `ONE_OF_RANGE = Projetos!$A$4:$A$23`, e o bloco 📌 PROJETOS de `Hoje` lê o
  mesmo alcance. As três fórmulas nascem da MESMA constante, então divergir exigiria
  editar uma sem editar as outras — e `construir.js`/`formatar.js` ainda checam isso
  em runtime antes de escrever. `_norman/verificar.js` cobre o lado que nenhum código
  prevê sozinho: JB cadastrando um projeto ALÉM dessa linha na planilha viva — nesse
  caso o projeto some do dropdown e do painel, sem erro nenhum na tela.
- **Carimbo do `Hoje`.** `A1` lê `dados (não edite)!Y1` pela constante
  `CELULA_CARIMBO` de `lib/sheets.js`, nunca por "Y1" escrito na mão — se a célula
  do carimbo mudar de lugar um dia, `_norman/construir.js` estoura ANTES de
  escrever em vez de gravar uma referência A1 silenciosamente errada. E há uma
  guarda irmã: essa célula tem que **consumir a constante `AVISO_SYNC`**, não uma
  cópia da regra — é o que impede a divergência de unidade (dias corridos × dias
  úteis) que fazia o portal se contradizer entre duas abas.
- **Números de linha nunca são literais.** `F.LINHAS` é a fonte única da geometria
  (nav, veredito, contagem, cabeçalho, primeira linha de dado, congelamento) e é
  consumida por fórmulas, `mergeCells`, faixas de formatação condicional,
  `setBasicFilter`, congelamento, âncoras de nota e pelos controles de
  `verificar.js`. A linha de navegação empurrou ~20 literais de uma vez; feito à
  mão, um esquecido desloca formatação ou funil sem erro visível. `construir.js`
  confere que o congelamento de cada aba é a ÚLTIMA linha de cromo dela e que a
  primeira linha de dado é a seguinte — congelamento que não cobre o cromo faz a
  aba rolar por baixo do próprio cabeçalho.
- **Nav sem órfão (o controle do gid).** Ver §A linha 1 de toda aba. O controle tem
  positivo e negativo porque, sem os dois, ele pode estar quebrado e passar em
  auditoria de leitura. **Foi ele que pegou um defeito real nesta Onda:**
  `construir.js` escrevia os 4 links dentro da mescla do banner do layout ANTIGO; a
  API aceitava a escrita e a leitura logo depois devolvia os 4, mas B1/C1/D1 eram
  células NÃO-ÂNCORA de uma mescla e voltaram VAZIAS quando `formatar.js` desfez
  essa mescla. Resultado: barra de navegação com UM link em vez de quatro, em três
  abas, sem erro nenhum. A cura é de propriedade: `construir.js` desfaz, antes de
  escrever, exatamente as mesclas que cruzam as células de link — e só essas, usando
  as coordenadas da própria mescla (faixa que corta uma mescla ao meio é erro de
  API). A mescla do estado vazio das digitadas, que é de `formatar.js` e fica fora
  das colunas de link, não é tocada.
- **Grade quase cheia.** `verificar.js` reprova quando qualquer aba passa de **80%**
  das linhas da grade. `values.update` numa faixa maior que o `rowCount` não trunca:
  **ERRA** — e quem faz essa escrita é o sync, sozinho, de madrugada. O piso é
  estático e o store já pulou 175% de uma vez.
- **Teto dos blocos do `Hoje`.** A linha "+ N não cabem aqui" só acende quando o total
  ULTRAPASSA o teto, então "bateu exatamente no teto" não aparece em texto nenhum na
  tela; é o PRÓXIMO item cadastrado que vai truncar. `verificar.js` acusa antes.
  **O bloco 🆕 RADAR fica FORA desse check, por desenho:** os outros quatro são
  CURADORIA (encostar no teto quer dizer que o teto ficou pequeno pro uso real), e o
  radar é recorte TOP-N — "43 itens em 3 dias" é o funcionamento normal de um coletor
  que varre 7 fontes, não um sintoma. Um alarme que acende todo dia e nunca tem
  conserto é um alarme que cria lobo. A linha "+ N não cabem" continua acesa lá: ali
  ela não é aviso de saturação, é a informação de que existe mais e onde ver.
- **Orçamento de cor.** Se mais de **15%** das linhas visíveis de uma aba acenderem
  fundo de estado, o LIMIAR da regra está errado — não a peça. É o que impede a regra
  de prazo de virar de novo a parede de cor que a Lei da Faixa derrubou. O medidor é
  reimplementado em Node e provado com controle positivo e negativo antes de medir:
  sem isso, "0%" pode significar "nenhuma tarefa vencida" ou "o medidor está
  quebrado", e os dois passam em auditoria de leitura igualzinho.
  **Onda UX 9 (remodelação 2026-09-01) — o orçamento passou a cobrir GLIFO, não só
  fundo.** `Projetos!saúde` sinaliza por EMOJI (🔴/🟠/⚪/🟢), sem cor de fundo nenhuma,
  e por isso passava inteira pelos dois medidores acima mesmo em `🔴 parado` 100% dos
  casos (AVALIACAO-UX.md Parte 2 §3: "o orçamento mede o mecanismo, não o sinal").
  Mesmo teto (15%), mesma disciplina de controle positivo/negativo — e `⚪ sem sinal`
  (D-A1) nunca conta como "aceso": ausência de dado não é alarme.
  **Adendo (mecanismo 4 de `REFERENCIAS-UX.md`) — toda regra de `cf()` deixou de ter
  `endRowIndex` fixo.** Uma regra instalada com o `rowCount` de QUANDO `formatar.js`
  rodou parava de cobrir linha nova sem ninguém perceber, se a aba crescesse depois
  sem `formatar.js` rodar de novo — dívida invisível até a linha nascer fora do
  alcance. Agora o `GridRange` não declara fim de linha, e a API do Sheets aplica a
  regra "até a última linha da grade", dinamicamente.

### Glossário de sinal — o que cada glifo/cor significa, aba por aba

> Cada aba tem, além disto, uma NOTA DE CÉLULA com o mesmo texto (C6) — a nota é
> o resumo rápido dentro da planilha; esta tabela é a mesma fonte (`_norman/notas.js
> SINAL_LOCAL`), pra quem prefere ler fora do Sheets.

| aba | sinal local |
|---|---|
| `Hoje` | Os glifos no início do título de cada bloco dizem a ORIGEM dele: ⏳ tarefas · 🎯 fila · 📌 projetos · 📓 diario · 🌐 noticia · 🆕 radar · ⏰ vence · 🚧 atencao · 📊 pulso. Texto verde-escuro sublinhado é link (toca e vai pra aba de origem); texto cinza é meta (estado vazio ou "+ N não cabem aqui"). |
| `Concursos` | Elegível? — ✅ pode prestar · ❓ confirmar titulação · 🎓 só com doutorado. Situação — 🟢 aberto · 🔴 encerrado · ⚠️ sem prazo. ❌ (C1) — você marcou "não me interessa"; a linha esmaece e sai da contagem "N ABERTA(S) que você pode prestar". |
| `Empregos` | Publicada — 🔥 hoje · 🟢 até 7 d · 🟡 8 a 30 d · ⚪ 31 a 90 d · 🗄️ + de 90 d · ❓ sem data. Combina? — 🟩 forte · 🟨 média · ⬜ fraca · ⏳ não pontuada. ❌ (C1) — você marcou "não me interessa"; a linha esmaece. |
| `Tarefas` | estágio — ⬜ aberta · 🔨 fazendo · ✅ feita · ⏸️ parada (feita recua o texto: já resolvida, não compete por atenção). esforço — P · M · G (P pequeno · M médio · G grande). Fundo rosa = prazo vencido; fundo âmbar = vence em ≤ 2 dias. |
| `Fila` | estágio — 🔵 na fila · 🟡 preparando · 🟣 inscrito · 🟢 avançou · 🔴 recusado · ⚫ descartado (recusado/descartado recuam o texto — já resolvidos). ⭐ (C3) — ⭐⭐⭐ · ⭐⭐ · ⭐ · —: seu juízo, não o score do robô. |
| `Candidaturas` | estágio (funil, C2) — 📨 inscrito · 🧾 docs · 📝 prova/entrevista · ⏳ resultado · 🟢 aprovado · 🔴 não passou · ⚫ retirei · 🙋 aguardando JB ("não passou" recua o texto). ⭐ (C3) — ⭐⭐⭐ · ⭐⭐ · ⭐ · —: seu juízo, não o score do robô. "por quê" (C4) — o pós-morte: por que fechou assim, preenchido ao fim do processo. Fundo rosa = aguardando há mais de 14 dias sem novidade. |
| `Projetos` | estágio — 🌱 começando · 🔨 tocando · ⏸️ parado · ✅ entregue. saúde (calculada) — 🔴 atrasado/parado · 🟠 sem rumo · 🟢 em dia · ⚪ sem sinal (nenhum dado ainda — nunca "parado" por omissão, D-A1) · "—" (entregue, não se aplica). |
| `Diário` | voz — JB · Durin. Fundo N1 + negrito = entrada de JB (a planilha é dele, a voz dele pesa mais); sem fundo = Durin. |
| `Etapas` | estado — ⬜ pendente · 🔨 em curso · ✅ concluída. |
| `Notícias` | 📣 no início do título — mais de um veículo publicou o mesmo fato (repercussão); sem o glifo, fonte única. |
| `IA` | 📣 no início do título — mais de um veículo publicou o mesmo fato (repercussão); sem o glifo, fonte única. |
| `Trabalho` | 📣 no início do título — mais de um veículo publicou o mesmo fato (repercussão); sem o glifo, fonte única. |
| `Ciência` | 📣 no início do título — mais de um veículo publicou o mesmo fato (repercussão); sem o glifo, fonte única. |
