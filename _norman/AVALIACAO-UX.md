# Avaliação de UX — a planilha-portal de JB

**Data:** 2026-08-28 · **Quem julga:** Norman (executor de UX/UI) · **Postura:** adversarial
**Peça:** `<GOOGLE_SHEETS_SPREADSHEET_ID>` (planilha real do autor original — ID removido nesta extração)
**Regra que me governa aqui:** a régua é a tarefa cumprida em N passos, não a feature presente.

Companheiro deste arquivo: `REFERENCIAS-UX.md` (mesma pasta) traz os **mecanismos** de fora.
Este traz o **diagnóstico** de dentro. Onde os dois se encontram, eu digo.

---

## Instrumento — o que eu usei e o que ele prova

CamoFox **não foi usado** (sem sessão Google; foi o que produziu a prova falsa registrada em
`_prova-ux/LEIA-INVALIDO.md`). Dois instrumentos, os dois com controle:

1. **13 PDFs renderizados** em `_prova-final/`, abertos um a um. Ficha "a imagem mostra:"
   escrita **depois** de abrir — abaixo, §Fichas.
2. **Leitura de célula** via `_norman/api.js` (`ler`/`lerVarios`/`meta`), só leitura, para
   conferir fórmula, cabeçalho, validação, largura de coluna, congelamento e geometria de
   grade. Nada foi escrito na planilha. `verificar.js` não foi rodado.

**Falha do instrumento anterior que eu confirmei:** a prova de Onda 20 diz "1 render por aba
visível — 13 arquivos, 13 hashes". A planilha tem **14 abas visíveis** (`meta()`,
`hidden !== true`). A que faltou é `dados (não edite)`, índice 13, que **ocupa um slot na
barra de abas do celular**. O `md5sum | sort -u` provou que o instrumento navegou; não provou
que ele navegou tudo. Contagem de hashes ≠ cobertura.

---

## Parte 1 — Percurso medido

### Como contei

**1 passo = 1 toque · 1 arrasto (≈1 tela de deslocamento, horizontal ou vertical) · 1
digitação de campo · 1 seleção de dropdown.** Ler não é passo; procurar é.

**Desktop** = 1440 px de viewport. **Celular** = dobra de **360 px** (o telefone de JB entrega
~390 px; 360 é o piso honesto, e é a mesma régua que usei na rodada de agosto). Larguras
medidas por `columnMetadata.pixelSize`, ignorando colunas ocultas e colunas de grade vazias —
só até a última coluna com cabeçalho.

**Largura real usada e custo de arrasto (medido, não estimado):**

| aba | col. usadas | largura usada | o que cabe em 360 px | arrastos p/ ver tudo |
|---|---|---|---|---|
| Hoje | 19 | 2372 px | 1º bloco | **7** |
| Notícias/IA/Trabalho/Ciência | 23 | 2208 px | Abrir · título · quando | **7** |
| Projetos | 14 | 2210 px | projeto · frente | **7** |
| Fila | 12 | 1418 px | id · url · o quê | 4 |
| Tarefas | 10 | 1300 px | tarefa · projeto | 4 |
| Diário | 7 | 1272 px | quando · voz · sobre | 4 |
| Concursos | 10 | 1162 px | Abrir · Vaga · Situação | 4 |
| Candidaturas | 7 | 1044 px | órgão/empresa | 3 |
| Empregos | 9 | 914 px | Abrir · Vaga · Publicada | 3 |
| Etapas | 6 | 748 px | projeto | 3 |

**O número que domina tudo abaixo: `frozenColumnCount = 0` nas 14 abas visíveis.** JB aceitou
rolagem horizontal (C10-b) — mas aceitou uma rolagem em que **a identidade da linha some**. Em
`Concursos`, o checkbox `Inscrito` está a 1162 px: quando JB chega nele, o nome da vaga saiu da
tela há três arrastos. Ele marca uma caixa sem saber de qual edital. Isso não é custo de
rolagem; é rolagem que quebra a tarefa.

### Os 10 jobs

**1 · "O que eu ataco agora?" — entrar e sair com uma decisão**
Desktop **1 passo** para a decisão (abrir `Hoje`; os 8 blocos cabem numa tela) e **4 passos**
para agir (`Hoje` → `Concursos` → achar → `edital`).
Onde trava: `⏰ VENCE` mostra `UEL — fecha HOJE` **duas vezes**, sem nenhum campo que as
distinga (`Subárea` existe em `Concursos` — Ciência de Dados vs Inteligência Artificial — e não
é trazida). A decisão é impossível no painel; a ida a `Concursos` é obrigatória, não opcional.
Invisível no momento da decisão: a subárea, e o fato de que nenhum dos dois é elegível
confirmado.
Aba vazia: `🎯 FILA` mostra o estado vazio **e**, na linha seguinte, `+ 989 não cabem aqui —
abra 🎯 Fila`. Ver Parte 2 §1 — o 989 é aritmética de grade, não de conteúdo.
Celular: **1 toque + 6 arrastos = 7 passos só para LER** o painel.

**2 · Registrar tarefa nova amarrada a um projeto**
Desktop **4** (abrir `Tarefas` · clicar a célula · digitar · dropdown `projeto`). O relatório
de Mav conta 3 — ele não conta o posicionamento do cursor, que no celular é um toque real.
Celular **7** (≈3 swipes na barra até a aba 8 + 1 toque + célula + digitar + dropdown).
Com prazo — e sem prazo a tarefa é invisível para `⏰ VENCE` e cai em "resto" na ordenação de
urgência — **+2 arrastos +1 digitação = 10**. As duas tarefas reais de JB estão exatamente
nesse estado: `prazo` vazio em 2 de 2.

**3 · Marcar uma tarefa como feita**
Desktop **3**. Celular **7** (`estágio` é a 3ª coluna, fora da dobra de 2).
O que está quebrado aqui não é o passo, é a consequência: marcar `✅ feita` **não move nada**.
`Projetos!saúde` lê o `Diário`, não `Tarefas`. Terminar uma tarefa deixa o projeto `🔴 parado`.
O loop do CRM está aberto no ponto exato onde ele deveria fechar.

**4 · Achar uma vaga que combina forte e abrir o link**
Desktop **2**. Celular **2** (`Abrir` é a coluna A e cabe na dobra).
**É o melhor job da peça** e o único em que celular e desktop custam o mesmo. A ordenação faz
o trabalho: a linha 5 já é `hoje · 🟩 forte`.
Custo escondido: `Publicada` é `🟢 até 7 d` nas 65 primeiras linhas e `Combina?` é `🟩 forte`
nas 109 primeiras. **Duas das três colunas da dobra do celular são constantes na região que se
lê.** Elas são chave de ordenação, não coluna de leitura — e ocupam 1/3 da dobra.

**5 · Achar um concurso que fecha esta semana e marcar que me inscrevi**
Desktop **2-3**. Celular **1 toque + 4 arrastos + 1 toque = 6**, e o 6º é dado às cegas
(sem coluna congelada).
Onde trava, e é grave: o veredito diz **"1 ABERTA(S) que você pode prestar AGORA"** — 1 de 47.
Esse 1 é a UNILA, que fecha em 37 dias. Os que fecham **esta semana** (UEL ×2 "fecha HOJE",
FIMES 31/08) são todos `❓ confirmar titulação`. **O único edital que a peça garante que JB
pode prestar não é nenhum dos que fecham esta semana.** A peça não fecha o job: ela devolve
JB para o PDF do edital.
Invisível na dobra do celular: `Elegível?` é a **4ª** coluna. A única que decide se vale
gastar a semana está fora da dobra; `Situação` — que diz `🟢 ABERTO` em 41 de 47 linhas — está
dentro.

**6 · Levar uma oportunidade do radar para a `Fila`**
Desktop **6** (`Empregos` · toque em `link (copiar)` · copiar · `Fila` · toque em B · colar).
Celular **9** (3 arrastos até a coluna J + toque longo + copiar + …).
**E a instrução está errada.** `Fila!A2` e o bloco `🎯 FILA` do `Hoje` dizem, os dois: *"Copie
o link (última coluna de 💼 Empregos)"*. O cabeçalho real de `Empregos` é
`… _ordem · link (copiar) · Inscrito · _por_quem`. **A última coluna visível é `Inscrito`.**
Quem seguir a instrução ao pé da letra marca a caixa de "me inscrevi" numa vaga que ele ainda
nem abriu. É rótulo que descreve regra revogada — revogada pela Onda 4, que pôs `Inscrito`
depois — e não é um texto morto: é a instrução que existe para destravar a aba que está vazia.

**7 · Ver em que pé está uma candidatura e há quanto tempo espero**
`Candidaturas` está **vazia**. Desktop **1**; a resposta é "nenhuma". Celular: a dobra entrega
**uma coluna só** (`órgão/empresa`); `aguardando há` — o campo que é a razão da aba existir —
é o 5º, a **3 arrastos**.
A causa do vazio é medida e é a montante: `Inscrito` = 0 marcados em `Concursos` e em
`Empregos`. A aba não está vazia porque JB não se candidatou; está vazia porque o gesto que a
alimenta custa 4 arrastos às cegas (job 5).

**8 · Registrar "terminei a etapa X do projeto Y" e acrescentar meu ponto de vista**
Desktop **22 passos** (Mav contou 15). Detalhe: `Hoje`→`Projetos`→`Etapas` = 2 toques (não há
link direto), + 7 campos em `Etapas`, + `Diário` (1) + 6 campos da voz Durin, + 6 da voz JB —
e `responde a` exige ler o número da linha na régua do Sheets e digitá-lo.
Celular **≈30** (`Etapas` = 3 telas de largura, `Diário` = 4).
E o passo 23 que ninguém conta: **se `sobre` não for o nome exato do projeto, nada disso chega
em `Projetos`.** É o estado atual, em 2 de 2 (Parte 2 §4).

**9 · Ler as notícias do dia e depois as da semana sem reler**
Desktop **2** — as duas primeiras tabelas cabem lado a lado em 1440 px, e a cascata por
`cluster_id` garante que a segunda não repete a primeira. Bom.
Celular **≈6**, e com um defeito que anula a compra: `frozenRowCount = 3`, mas **o título da
tabela está na linha 4**. A linha 3 (congelada) é `Abrir · título · quando · veículo · tema`,
**idêntica nas quatro tabelas**. Quando JB rola 20 linhas ou arrasta para a 3ª tabela, o que
fica preso na tela não diz nada, e o único rótulo que desambigua as quatro rolou para fora.
JB aceitou a rolagem horizontal sabendo do custo. Ele não foi avisado de que, ao chegar lá,
não saberia onde está.
"Sem reler o que já vi": a cascata resolve entre as quatro tabelas. Não resolve entre **dias** —
amanhã a tabela de 7 d mostra as mesmas de hoje. Não há marca de "já visto". A nota promete
"nunca repete entre as quatro tabelas", que não é a promessa do job.

**10 · Saber se o robô parou de coletar**
Desktop **1**, celular **1**. `Hoje!A1`, coluna A, linha congelada:
`🛰️ radar atualizado em 28/08 · 829 oportunidades mapeadas`.
**É o componente mais bem resolvido da peça.** Carimbo escrito pelo processo, degradando bem
(a primeira unidade já é sinal + veredito + data). Não mexer.
Ressalva honesta: o ramo **aceso** do alarme não é verificável sem escrever na planilha, e eu
não escrevo. Declaro não-verificado nesta rodada, não "aprovado".

### Placar

| job | desktop | celular | veredito |
|---|---|---|---|
| 1 · o que ataco agora | 1 (decidir) / 4 (agir) | 7 só p/ ler | decide errado: 2 itens idênticos no topo |
| 2 · registrar tarefa | 4 | 7 (10 com prazo) | ok, mas sem prazo a tarefa vira invisível |
| 3 · marcar feita | 3 | 7 | passo barato, consequência nula |
| 4 · achar vaga forte | **2** | **2** | **bom — não mexer** |
| 5 · concurso da semana + inscrito | 2-3 | 6 (o último às cegas) | não fecha: elegibilidade indecidível |
| 6 · radar → Fila | 6 | 9 | a instrução leva ao gesto errado |
| 7 · estado da candidatura | 1 | 1 + 3 arrastos | vazia por custo a montante |
| 8 · etapa + ponto de vista | **22** | ≈30 | e não chega em `Projetos` |
| 9 · notícia dia → semana | 2 | 6, sem saber onde está | boa no desktop, cega no celular |
| 10 · robô parado | **1** | **1** | **bom — não mexer** |

---

## Parte 2 — O que está quebrado, feio ou mentindo

### 1 · O contador de transbordo não fala com a lista que ele conta — e o número é grade, não conteúdo

`Hoje`, bloco `🎯 FILA`, duas linhas seguidas:

```
F10: ↳ Nada na fila. Copie o link (última coluna de 💼 Empregos) e cole na 🎯 Fila…
F11: + 989 não cabem aqui — abra 🎯 Fila
```

A lista usa `FILTER(...; Fila!$C$4:$C<>"")` — devolve nada, certo. O contador usa
`COUNTIFS(Fila!$C$4:$C;"<>")` — e `Fila!C` **virou coluna derivada na Onda 17**. `COUNTIF` com
critério `"<>"` conta o `""` devolvido por fórmula. `Fila` tem `rowCount = 1002`, logo
`C4:C` são **999 linhas**, e `999 − 10 = 989`. **Fecha na unidade.**

Não é um bug isolado, é um padrão. `Trabalho`, tabelas de 15 e 30 dias, na chapa:

```
⏳ O radar é novo — esta janela se completa em 11/09.
↳ + 22 não estão nesta tabela.
```

"Não tenho o que mostrar" e "22 itens não couberam" na mesma tabela, uma linha abaixo da outra.

E em `Notícias` os quatro contadores são `112 / 801 / 808 / 808` sobre um universo de **828**.
Somam 2529 — três vezes o que existe. Cada um é defensável isolado ("da minha janela, N não
coube"); juntos, com o mesmo texto e sem declarar o universo, são incoerentes. Os dois últimos
são **idênticos** porque o store tem 14 dias: as janelas de 15 e 30 dias têm o mesmo universo.

**A regra que a peça viola:** o número que resume uma lista tem de nascer da MESMA expressão
que produz a lista. Duas contas para uma verdade divergem em silêncio — e divergiram no painel
que JB abre primeiro.

*A Onda 17 melhorou a UX de `Fila` (derivar `o quê`) e, ao fazê-lo, quebrou o painel `Hoje`.
Nenhum instrumento pegou, porque `verificar.js` procura erro de célula, e 989 não é erro: é um
número errado bem-formado.*

### 2 · A instrução que destrava a aba vazia aponta para a coluna errada

Já medido no job 6. Cabeçalho real de `Empregos`:
`Abrir · Vaga · Publicada · Combina? · Área · Modalidade · Nível · _url · _ordem · link (copiar) · Inscrito · _por_quem`.
"Última coluna" = `Inscrito`. O texto está em **dois** lugares (`Fila!A2` e `Hoje!F10`), os
dois copiados do mesmo literal, os dois errados desde a Onda 4.

### 3 · Sinal que acende em tudo — e o orçamento olhou para o lado errado

`Projetos`, 2 de 2 linhas: `saúde = 🔴 parado`. **100%.**

O orçamento de cor de `verificar.js` mede `Tarefas` (0/2) e `Candidaturas` (0/0) — as duas
únicas superfícies que sinalizam por **fundo S1/S2**. As duas estão em 0% porque não têm dado
que possa acender. A superfície que está em 100% sinaliza por **glifo**, e por isso passou
inteira pelo medidor. O orçamento mede o mecanismo, não o sinal.

Sinal aceso em 100% da população não é sinal. E `JB.STUDIO` está com `estágio = 🔨 tocando`,
`próximo passo = Finalizar animação de mascote`, e a árvore do repositório mostra trabalho de
mascote de hoje. O alarme está **errado**, não só saturado.

Efeito colateral de rotulagem, na mesma linha: `estágio = ⏸️ parado` (digitado) e
`saúde = 🔴 parado` (derivado) — duas colunas, a mesma palavra, dois conceitos. E `JB.STUDIO`
lê `🔨 tocando` + `🔴 parado` lado a lado.

### 4 · A causa do 100%: a chave nunca casou, e nada na peça diz isso

```
Projetos!A  = ["JB.STUDIO", "Faculdade"]
Diário!C    = ["Radar acadêmico — fontes e agendamento", "Portal da planilha — estrutura e Thor"]
interseção  = ∅
```

`Diário!C` tem validação `ONE_OF_RANGE = Projetos!$A$4:$A$23` — **sem `strict`**, portanto
avisa e aceita. As duas entradas reais são órfãs. `Projetos!movimentou` mostra `—`, e a nota
da coluna define `—` como *"este projeto nunca apareceu no Diário"* — o que é **falso**: as
entradas falam desses projetos, em prosa; só não usaram a chave.

O rótulo é cúmplice: **`sobre` convida um assunto e a coluna exige uma chave estrangeira.**
JB e Durin escreveram o assunto, que é o que a palavra pede.

A nota da própria aba antecipa o modo de falha — *"um acento a menos faz a entrada nunca
aparecer lá — e não dá erro nenhum na tela, ela só some"* — e a aba está nesse estado, em
100% do dado, hoje. **Toda partição por chave precisa provar que as partes somam o todo, na
peça.** Aqui não há reconciliação nenhuma.

### 5 · Duplicata indistinguível, medida na vista

Assinatura = todas as colunas visíveis concatenadas.

- **`Concursos`: 4 grupos, 11 de 47 linhas (23,4%)** — UEM ×3, UFSCar–São Carlos ×4,
  UFSCar–Sorocaba ×2, UFSCar–S.J. Rio Preto ×2.
- **`Empregos`: 5 grupos, 11 das 76 primeiras (14,5%)** — Starian ×2, IxDF ×3, lemon.io ×2…

Os 23% de `Concursos` são **exatamente** os "4 grupos / 11 registros (23% da vista)" que a
Onda 2 mediu e reportou no mesmo dia. Foram medidos, escritos no placar, e continuam de pé.
Os de `Empregos` são novos — a Onda 2 não olhou essa vista.

E aparecem no painel: `🆕 RADAR` mostra UFSJ ×2 e Visagio ×2 em 10 linhas.

### 6 · Coluna que existe e ninguém usa — contado

| aba | colunas | vazias em 100% das linhas reais |
|---|---|---|
| `Tarefas` | 10 | **6** — prazo, criada em, notas, esforço, bloqueada por, recorrente |
| `Projetos` | 14 | **3 vazias** (frente, prazo, notas) + **4 em `—`** (movimentações, movimentou, progresso, etapa atual) |

As três colunas que a Onda 15 acrescentou (`esforço`, `bloqueada por`, `recorrente`) estão
vazias em 2 de 2 — e a ordenação por urgência que elas alimentam é, por isso, inerte: sem
prazo e sem esforço, tudo cai em "resto". A feature existe; a tarefa não melhorou.

### 7 · Coluna que não discrimina, ocupando a dobra

`Concursos!Situação`: `🟢 ABERTO` em **41 de 47** (87%). É 100% derivável de `Prazo`
("fecha em 37 d" vs "sem prazo · publicado há 43 d") e o subtítulo já diz "41 abertas + 6 sem
data". Ela está na **dobra do celular**; `Elegível?`, que separa 1 de 47, não está.

`veículo` nas abas de notícia, medido nas 4 tabelas × 20 itens:

| aba | veículos distintos (tabela "hoje") | maior fatia |
|---|---|---|
| `Ciência` | **1** | arXiv **20/20 (100%)** |
| `IA` | 4 | Hacker News 14/20 (70%) |
| `Trabalho` | 2 | Estratégia Concursos **10/11 (91%)** |
| `Notícias` | 8 | The Guardian 5/20 (25%) |

Em 3 das 4 abas, `veículo` é praticamente uma constante ocupando 1 de 5 colunas — ×4 tabelas =
**4 das 23 colunas usadas**, num layout que JB pagou com 7 arrastos.

### 8 · O canal de repercussão saturou de um lado e emudeceu do outro

C10 removeu a coluna `repercussão` argumentando que "o glifo 📣 já prefixa o título". Medido:

| aba | títulos | com 📣 |
|---|---|---|
| `Notícias` | 80 | **63 (79%)** |
| `IA` | 80 | 10 (12,5%) |
| `Ciência` | 80 | **2 (2,5%)** |
| `Trabalho` | 31 | **0** |

Marca em 4 de 5 itens não distingue; marca em 0 de 31 não existe. A informação não migrou de
canal — ela sumiu nos dois extremos. E é a metade declarada do critério de ordenação
("repercussão + perfil"): em `Trabalho` e `Ciência`, a ordem é justificada por um sinal que a
tela nunca mostra.

### 9 · Rótulo que promete profundidade que o dado não tem

`top 20 · últimos 15 dias` e `top 20 · últimos 30 dias`, em `Notícias`, mostram itens de
22/08–25/08 — dentro da mesma janela de 14 dias das outras duas — e os dois contadores dizem
**808**, o mesmo número, porque têm o mesmo universo.

C7 previu o problema e projetou o terceiro estado vazio (*"o radar é novo — esta janela se
completa em DD/MM"*). Ele funciona: em `Trabalho`, acende. **Mas ele cobre o caso VAZIO, e o
caso perigoso é a tabela CHEIA sob rótulo falso.** Onde há volume (Notícias, IA, Ciência) o
estado honesto nunca dispara e o rótulo mente sozinho.

### 10 · Hierarquia: o que o olho pega primeiro

**Abas de notícia.** Linha 3 = nomes de coluna (repetidos 4×). Linha 4 = título da tabela
(único). O genérico está **acima** do específico, e `frozenRowCount = 3` congela o genérico e
deixa o único rolar para fora. É a inversão exata de hierarquia, com o congelamento
premiando o lado errado.

**`Hoje`.** O primeiro bloco da esquerda, `⏰ VENCE`, entrega 5 editais e **zero tarefas** — o
que o olho pega primeiro é o radar, não o trabalho de JB. `📌 PROJETOS`, que é a vida dele,
é o 3º grupo. E a nav de `Hoje` é a pior da peça: **4 destinos em 2 linhas** (`Concursos`,
`Empregos` / `Tarefas`, `Diário`), enquanto toda outra aba tem 4-5 numa linha só.

**`Fila`.** A dobra do celular entrega `id · url` — um número derivado e uma URL crua, os dois
campos menos legíveis da aba. `o quê` é o 3º.

### 11 · Navegação: a promessa e a malha

Onda 18 fechou com a prova *"de qualquer aba, alcançar qualquer outra em 1 toque"*. Medido por
BFS sobre os `gid` reais de todas as barras de nav (13 abas navegáveis, 156 pares ordenados):

```
pares com 2+ toques : 93 de 156  (60%)
pares com 3 toques  : 15
inalcançáveis       : 0
```

A malha são **três ilhas ligadas só pelo `Hoje`**:

- radar/funil — `Empregos` `Concursos` `Fila` `Candidaturas`
- CRM — `Tarefas` `Projetos` `Diário` `Etapas`
- notícia — `Notícias` `IA` `Trabalho` `Ciência`

E o `Hoje`, que é a ponte, **não alcança `Candidaturas` nem `Etapas` em 1 toque**. Resultado:
`Etapas` está a **3 toques** de 6 das 13 abas.

O relatório da Onda 18 é honesto sobre isso (declara os 3 toques no README). O **placar** não é:
a Onda consta fechada com a prova de 1 toque. Feature presente ≠ tarefa cumprida.

### 12 · A barra de abas põe consumo antes de produção

Ordem real das 14 abas visíveis:

```
1 Hoje · 2 Empregos · 3 Concursos · 4 Notícias · 5 IA · 6 Trabalho · 7 Ciência
· 8 Tarefas · 9 Fila · 10 Candidaturas · 11 Projetos · 12 Diário
· 13 dados (não edite) · 14 Etapas
```

As quatro abas de **leitura** ocupam os slots 4-7. As superfícies onde JB **escreve** começam
no slot 8. `dados (não edite)` — fato do robô, que ninguém abre — está visível no slot 13,
partindo o cluster do CRM. E **`Etapas` é a última**, atrás dele e de três abas ocultas.

No celular a barra mostra ~3 nomes. `Etapas` custa ~5 swipes ou 2 toques via `Hoje`+`Projetos`.
`REFERENCIAS-UX.md` §Frente 1 chega ao mesmo lugar por fora ("hiding raw data tabs once your
dashboards are finalized"; "a barra de abas mostra só ~3 nomes") — a medida e a referência
concordam, e é por isso que a intervenção #4 é barata e segura.

### 13 · `Etapas`, `Fila` e `Candidaturas` vazias — onde está o custo, exatamente

Não é uma causa só; são três, e cada uma tem endereço.

- **`Etapas`** — custo de **posição** e de **largura**. Última aba da barra; 3 toques de metade
  da peça; 6 colunas em 748 px = 3 telas para preencher **uma** etapa, com `ordem` (um inteiro
  que JB tem de inventar e manter coerente) entre eles. Um marco custa 7 passos e 2 arrastos.
- **`Fila`** — custo de **instrução errada** (§2) e de **dobra invertida** (§10). A Onda 17
  baixou o custo real (colar a url basta), e a frase que ensina isso manda copiar da coluna
  errada. O ganho de −3 passos está lá; a porta está indicada errado.
- **`Candidaturas`** — custo **a montante**, não nela. Ela nasce do check `Inscrito`, e há
  **0 marcados** em 646 linhas de `Concursos` + `Empregos`. Marcar custa 4 arrastos sem coluna
  congelada. A aba está vazia porque o gesto que a alimenta é cego no celular.

### 14 · Estado feio: inventário

| onde | estado | veredito |
|---|---|---|
| `Fila!A2` | ensina o próximo passo | **ensina errado** (§2) |
| `Etapas!A2` | ensina o próximo passo | bom |
| `Candidaturas` | veredito (linha 2) **+** estado vazio (linha 4) | redundante: duas frases, uma informação, duas linhas |
| `Tarefas` / `Projetos` / `Diário` | linha 2 **em branco** | linha gasta com nada, e nenhum veredito |
| `Hoje` / `🎯 FILA` | vazio **+** transbordo de 989 | contradição na mesma tela |
| `Trabalho` 15 d/30 d | "o radar é novo" **+** "+22 não estão nesta tabela" | contradição na mesma tabela |
| `Notícias`/`IA`/`Ciência` 15 d/30 d | tabela cheia sob rótulo de 30 dias | o estado honesto existe e nunca dispara aqui |

Três abas irmãs, três estratégias de renderização do mesmo componente: `Fila` usa `WRAP` com
altura ajustada à mão (24 px), `Etapas` usa `WRAP` (21 px), `Candidaturas` usa `CLIP`
transbordando para as células vizinhas. Nos três a chapa mostra o texto inteiro no desktop —
não reprovo por recorte; reprovo por **não haver um componente**, e sim três implementações
que envelhecerão em direções diferentes.

### Fichas — "a imagem mostra:" (escritas depois de abrir)

- **`Hoje.pdf`** — a imagem mostra o painel em 4 grupos lado a lado ocupando ~1/3 da altura da
  página. `⏰ VENCE` com 5 editais (UEL duas vezes, idênticas na tela) e nenhuma tarefa;
  `⏳ TAREFAS` com 2 linhas "— sem prazo —"; `📌 PROJETOS` com JB.STUDIO/tocando e
  Faculdade/parado; `🎯 FILA` com o texto de vazio **e**, abaixo, "+ 989 não cabem aqui";
  `🚧 ATENÇÃO` com "Nada travado"; `🆕 RADAR` com 10 linhas, entre elas UFSJ duas vezes e
  Visagio duas vezes. Nav de 4 links em duas linhas, sem marcador.
- **`Concursos.pdf`** — a imagem mostra 47 linhas em 9 colunas visíveis, coluna `Situação`
  dizendo `ABERTO` em quase todas, `Elegível?` dizendo "confirmar titulação" ou "só com
  doutorado" em todas menos a primeira, blocos consecutivos de UEM (3) e UFSCar (4+2)
  visualmente idênticos, `link (copiar)` cortado no meio da URL, checkboxes `Inscrito` na
  borda direita — **e duas caixas órfãs abaixo da última linha de dado**. O chip preto do
  marcador aparece truncado como "Concu".
- **`Empregos.pdf`** — a imagem mostra 26 linhas nas duas primeiras páginas com `Publicada`
  = "até 7 d" e `Combina?` = "forte" em **todas**, `Nível` = "não dito" em mais da metade,
  `link (copiar)` cortado, e `Inscrito` como última coluna à direita.
- **`Notícias.pdf`** — a imagem mostra 4 tabelas lado a lado ocupando a largura inteira, com
  a fileira de nomes de coluna ("Abrir título quando veículo tema") repetida 4× **acima** da
  fileira com os títulos das tabelas ("notícias de hoje", "top 20 · últimos 7/15/30 dias"),
  20 linhas cada, e as quatro linhas de transbordo `+112 / +801 / +808 / +808`.
- **`Trabalho.pdf`** — a imagem mostra a 1ª tabela com 11 itens, dos quais 10 do mesmo veículo
  ("Estratégia Co…", truncado), e as tabelas 3 e 4 exibindo "⏳ O radar é novo — esta janela se
  completa em 11/09 / 26/09" **seguido** de "+ 22 / + 32 não estão nesta tabela".
- **`Fila.pdf`** — a imagem mostra a barra com 5 links + chip "Fila", a frase de vazio em duas
  linhas em itálico e a fileira de 12 cabeçalhos começando por `id` e `url`; nenhuma linha de
  dado.
- **`Candidaturas.pdf`** — a imagem mostra o veredito "Nenhuma candidatura em aberto ainda." em
  negrito na linha 2 **e** a frase "↳ Nenhuma candidatura ainda. Marque «Inscrito»…" abaixo do
  cabeçalho; chip do marcador truncado em "Candidatura".
- **`Tarefas.pdf`** — a imagem mostra 2 linhas de dado e 10 cabeçalhos, com as colunas `prazo`,
  `criada em`, `notas`, `esforço`, `bloqueada por` e `recorrente` completamente em branco, e
  uma linha 2 vazia entre a nav e o cabeçalho.
- **`Projetos.pdf`** — a imagem mostra 2 linhas em 14 colunas em corpo minúsculo, com
  `frente`/`prazo`/`notas` em branco, `movimentou` e `progresso` em "—", `etapa atual` em
  "— sem etapa cadastrada —" e `saúde` em `parado` **nas duas linhas**.
- **`Diário.pdf`** — a imagem mostra 2 entradas, ambas voz "Durin", com paredes de ~900
  caracteres em `o que aconteceu`, `responde a` e `contexto da resposta` vazios, e `sobre`
  preenchido com títulos de assunto que não são nomes de projeto.
- **`Etapas.pdf`** — a imagem mostra a faixa bege corrigida, nav de 4 links + chip "Etapas", o
  texto de vazio em duas linhas e 6 cabeçalhos; nenhuma linha de dado.
- **`IA.pdf` / `Ciência.pdf`** — abertos junto com a medição de veículo; mostram o mesmo
  arranjo de 4 tabelas, com `veículo` repetindo Hacker News e arXiv linha após linha.

---

## Parte 3 — As 20 intervenções

Ordenadas por **impacto ÷ custo**. Cada uma é executável isolada e tem prova própria.
"Passos" é economia estimada no **celular**, que é onde a peça dói.

| # | o que muda | job que melhora | passos | custo | como se PROVA |
|---|---|---|---|---|---|
| 1 | **`frozenColumnCount ≥ 1` nas 14 abas** (2 em `Empregos`/`Concursos`: `Abrir`+`Vaga`). Toda rolagem horizontal preserva a identidade da linha. | 1,5,6,7,8,9 | −0 toques, mas destrava 6 jobs hoje cegos | **baixo** | `meta()` devolve `frozenColumnCount≥1` em 14/14 **e** chapa com a grade rolada até `Inscrito` mostrando o nome da vaga preso |
| 2 | **Um número, uma fonte.** Todo contador de transbordo/veredito deriva da MESMA expressão da lista que resume. Mata o `+989`, os `808/808` e as contradições de `Trabalho`. | 1,9 | remove 1 leitura falsa por bloco | **baixo** | controle triplo: lista vazia → contador ausente; lista com N>teto → contador = N−teto exato; lista no teto → ausente. Roda contra `Fila` (0), `Notícias` (828) e `Trabalho` (33) |
| 3 | **A instrução nomeia a coluna, não a posição** — `link (copiar)`, em `Fila!A2` e no bloco FILA do `Hoje`. | 6 | −2 (e evita o gesto errado) | **baixo** | teste que lê o cabeçalho vivo de `Empregos` e exige que o nome citado exista nele e que o texto não contenha "última coluna" |
| 4 | **Barra de abas reordenada:** escrita antes de leitura; `Etapas` junto de `Projetos`/`Diário`; **`dados (não edite)` oculta**. | 2,3,8 | −3 a −5 swipes | **baixo** | índice de cada aba em `meta()` + swipes contados até cada superfície de escrita, antes/depois |
| 5 | **Título da tabela acima dos nomes de coluna e dentro do congelamento** nas 4 abas de notícia (`frozenRows` 3→4, ou inverter as duas linhas). | 9 | −2 (e acaba a cegueira) | **baixo** | chapa rolada 20 linhas e arrastada até a 4ª tabela, com o rótulo da janela visível |
| 6 | **`Hoje` ganha nav completa numa linha + marcador**, incluindo `Candidaturas` e `Etapas`. | 1,7,8 | −1 por travessia | **baixo** | BFS: `Hoje` alcança 12/12 em 1 toque; pares com 2+ cai de 93 |
| 7 | **Rótulo honesto da janela**: enquanto o store não tiver lastro, a tabela diz a janela **real** disponível, mesmo cheia. Estende o 3º estado de C7 do caso vazio para o caso cheio. | 9 | 0 | **baixo** | com store de 14 d, as tabelas de 15/30 d não podem imprimir "últimos 15/30 dias"; teste sobre a data mínima do store |
| 8 | **`⏰ VENCE` mostra o campo que distingue** (subárea/vaga); nenhuma linha repete assinatura visível. | 1 | −2 (evita ir a `Concursos` só p/ desempatar) | **baixo** | nenhuma linha do bloco com assinatura repetida, contra o dado do dia + linha sintética de dois editais do mesmo órgão |
| 9 | **Orçamento de sinal cobre GLIFO, não só fundo**, em toda aba com coluna derivada de estado. | — (é o instrumento) | 0 | **baixo** | o medidor **reprova hoje** (`saúde` 100% > teto) e passa depois da #10; controle positivo e negativo próprios |
| 10 | **Reconciliação do órfão `Diário`↔`Projetos`**: aviso derivado ("N de M entradas não batem com projeto nenhum"), `movimentou` distingue "nunca apareceu" de "apareceu sem vínculo", e `sobre` vira rótulo que pede a chave. | 1,3,8 | 0 passos, corrige 100% dos vereditos | **médio** | com o dado de hoje o aviso acende e diz 2 de 2; corrigido o `sobre`, some e `saúde` flipa |
| 11 | **`Concursos`: `Situação` sai** (87% num valor, 100% derivável de `Prazo`), **`Elegível?` entra na dobra**. | 5 | −1 arrasto, e a decisão vira possível na dobra | **médio** | distribuição de valores por coluna registrada; dobra de 360 px entrega `Abrir·Vaga·Elegível?` |
| 12 | **`Fila`: identidade antes do derivado** — `o quê` na dobra, `id` para o fim (ou oculta). | 6,7 | −1 arrasto | **baixo** | dobra de 360 px entrega `o quê` |
| 13 | **`Inscrito` deixa de ser a última coluna** e encosta na identidade. Resolve com a #1, não em vez dela. | 5,7 | −3 arrastos | **médio** (spill + letras literais de `construir.js:868`) | job 5 contado antes/depois no celular; e as duas caixas órfãs abaixo do último dado somem |
| 14 | **Duplicata indistinguível zerada nas vistas** — dedup, ou o campo que distingue entra na tela. | 1,4,5 | −1 a −3 de varredura | **médio** | assinatura visível concatenada: 0 grupos em `Concursos` (hoje 4 grupos/11 linhas) e em `Empregos` (hoje 5/11) |
| 15 | **Coluna vazia sai da dobra** (não precisa sumir): `Projetos.frente`, `Tarefas.criada em/notas/recorrente`. Teto declarado de preenchimento por coluna na dobra. | 2,3,8 | −1 arrasto em `Projetos` | **baixo-médio** | contagem de preenchimento por coluna, com teto, contra o dado real |
| 16 | **`VENCE`/`ATENÇÃO` linkam para a aba de ORIGEM de cada linha**, não para `Tarefas` sempre. | 1 | −2 (hoje o link leva ao lugar errado) | **médio** | as três fontes populadas **acima do teto** simultaneamente; cada linha e o rodapé apontam a origem certa |
| 17 | **Fechar a malha entre as três ilhas** — nav de 2 linhas ou destinos por afinidade, sem depender só do `Hoje`. | todos | −1 por travessia entre ilhas | **médio** | BFS: pior caso ≤ 2 e pares com 2+ abaixo de um teto declarado (hoje 93/156) |
| 18 | **`veículo` sai da dobra onde é constante** (Ciência 100% arXiv, Trabalho 91%), ou vira um campo que discrimine. | 9 | −1 arrasto | **médio** | distribuição por coluna nas 4 abas × 4 tabelas; nenhuma coluna na dobra com >80% num valor |
| 19 | **A repercussão volta a ser legível**: 📣 em 79% (`Notícias`) e 0% (`Trabalho`) não é canal. Reescala, ou devolve a coluna onde a saturação exige. | 9 | 0 | **médio-alto** | distribuição do marcador por aba: nenhum canal >70% nem <5% |
| 20 | **NÃO FAÇA NADA AQUI.** (a) A ordenação de `Empregos` — job 4 custa **2 passos no desktop e no celular**, o único empate da peça; mexer na dobra dela é regressão. (b) O carimbo `Hoje!A1` — job 10 custa **1 passo**, degrada bem e é escrito pelo processo. Nenhuma Onda toca nos dois. | 4,10 | 0 (proteger) | **zero** | teste de regressão: job 4 continua em 2 passos e `Hoje!A1` continua sendo a 1ª célula congelada, com carimbo escrito pelo sync |

**Fecho do loop, deliberadamente fora das 20:** "marcar tarefa feita não move a saúde do
projeto" (job 3) é o buraco mais fundo do CRM e **não cabe numa Onda de UX** — é decisão de
modelo (a saúde passa a ler `Tarefas`? marcar feito propõe uma entrada de Diário?). Registro
como pergunta para JB, não como intervenção minha. Enfiá-la na lista seria fingir que uma
decisão de produto é um ajuste de tela.

---

## Parte 4 — Cláusula de Não-Deriva

### O que NÃO pode ser trocado por conveniência de implementação

1. **A coluna congelada (#1) é a fundação, não um item da lista.** Sem ela, 6 dos 10 jobs
   permanecem cegos no celular e as intervenções 11, 12, 13 e 18 rendem menos do que prometem.
   Se só uma Onda for executada, é essa. "Ficou difícil por causa do spill" não é motivo:
   `frozenColumnCount` é propriedade de grade, não de conteúdo.
2. **Um número, uma fonte (#2).** Contador que não nasce da expressão da lista volta a
   divergir — voltou uma vez, silenciosamente, quando a Onda 17 melhorou outra coisa. Não
   aceito "conferimos que bate hoje": o mecanismo tem de tornar a divergência impossível, não
   improvável.
3. **Sinal aceso em 100% da população é defeito, não estilo.** O orçamento (#9) tem de medir
   o **sinal** — glifo, fundo, negrito, recuo — e não o mecanismo que hoje ele conhece. E tem
   de **reprovar hoje**: medidor que nasce verde nasce inútil.
4. **Nenhum rótulo descreve a posição de uma coluna.** Nomeia a coluna. Posição muda com a
   próxima Onda; nome muda com uma decisão consciente.
5. **Toda partição por chave prova, na peça, que as partes somam o todo.** O órfão
   `Diário`↔`Projetos` é o segundo caso desta planilha. Sem reconciliação visível, o terceiro
   é questão de tempo.
6. **Estado vazio ensina o próximo passo, e ensina o passo certo.** A frase de `Fila` cumpria
   a forma e mandava para a coluna errada — passaria em qualquer auditoria de presença.
7. **Job 4 e job 10 não são tocados** (#20). São o piso do que a casa já sabe fazer; regressão
   ali custa mais que qualquer ganho das outras 19.

### O que é negociável

- **A ordem das 20.** É (impacto ÷ custo) com o meu peso; JB pode reordenar por dor sentida.
- **O meio de cada conserto.** `Situação` pode sair da aba ou só sair da dobra. `Inscrito`
  pode ir para a coluna B ou para a segunda posição. `veículo` pode encolher em vez de sair.
  Eu respondo pela decisão que a tela permite, não pela implementação.
- **Os limiares** (teto de saturação de glifo, teto de preenchimento por coluna, pior caso de
  navegação). Devem ser **derivados do que já foi aprovado**, não fixados por mim agora — e
  nenhum número redondo escolhido por simetria.
- **O arranjo 1×4 das notícias.** É decisão declarada de JB (C10-b) e eu não a reabro. O que
  eu reabro é o que ele **não** foi informado ao aceitá-la: sem coluna congelada e com o
  título fora do congelamento, a rolagem que ele comprou entrega telas sem identidade. Isso é
  conserto do custo, não revisão da escolha.
- **Se `Etapas` deve existir como aba.** Levantei a pergunta em §13 e não a respondo: eliminar
  uma entidade é decisão de modelo. Reduzir o custo de entrada dela é o que me cabe.

### O que é do Marx, e eu não toco

`[preciso: visual | chip do marcador "você está aqui" trunca em nomes longos ("Concu",
"Candidatura") | a largura do chip é decisão de sistema visual, não de arquitetura — eu não
mexo em tipografia nem em geometria de cromo]`

`[preciso: visual | três implementações do mesmo componente de estado vazio (WRAP 24 px /
WRAP 21 px / CLIP transbordando) | unificar é decisão de sistema visual; eu respondo pelo
texto e pela existência do estado, não pela renderização]`

---

**Status:** CONCLUÍDO.
**Base:** 13 chapas abertas uma a uma (ficha "a imagem mostra:" em §Fichas) + medições de
leitura na planilha viva. Nada escrito na planilha. Nenhum arquivo além deste.
