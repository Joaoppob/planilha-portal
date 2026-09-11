# SETUP — instalar do zero

Roteiro para quem está instalando este radar pela primeira vez, numa máquina
onde ele nunca rodou. Cobre: criar a planilha, criar a credencial do Google,
preencher `.env`, construir as abas, e agendar a execução diária no Windows.

Não cobre configuração de critério pessoal (`config/perfil.json`,
`config/keywords*.json`) nem o bot do Telegram além do necessário para
preencher `.env` — para isso, ver `docs/PLANILHA.md` depois que o setup
abaixo estiver de pé.

---

## 0. Pré-requisitos

- Node.js **>= 18** (o projeto usa `fetch` nativo — ver `lib/sheets.js` — e
  não tem nenhuma dependência de `package.json`; `dependencies` está vazio
  por doutrina do projeto).
- Windows com PowerShell, se for usar o agendamento automático (passo 5).
  `instalar-tarefa.ps1` chama `Register-ScheduledTask`, uma cmdlet do módulo
  `ScheduledTasks` do Windows — **este passo é específico de Windows**.
- Uma conta Google (pessoal ou de organização) para criar a planilha e o
  projeto no Google Cloud.

Não rode `npm install` — não há nada para instalar.

---

## 1. Criar a planilha vazia no Google

1. Acesse [sheets.google.com](https://sheets.google.com) e crie uma
   planilha em branco.
2. Copie o ID da planilha a partir da URL — o trecho entre `/d/` e `/edit`:
   ```
   https://docs.google.com/spreadsheets/d/ESTE_TRECHO_AQUI/edit
   ```
   Isso vai para `GOOGLE_SHEETS_SPREADSHEET_ID` no `.env` (passo 3).
3. **Não crie nenhuma aba manualmente.** `lib/sheets.js garantirAbas()` cria
   a aba `dados (não edite)` sozinha na primeira sincronização — inclusive
   RENOMEIA a aba `Página1` que toda planilha nova já vem com (em vez de
   deixá-la parada do lado, ver comentário de `garantirAbas()` em
   `lib/sheets.js` linhas 364–379). As demais abas de leitura (`Concursos`,
   `_calc`, etc.) são criadas pelo passo 4 (`_norman/construir.js`), não
   por este passo.

---

## 2. Criar a service account e obter a credencial

O radar autentica como **Service Account** — não como usuário — usando um
JWT RS256 assinado à mão com `node:crypto` (zero dependência de biblioteca
`googleapis`; ver o cabeçalho de `lib/sheets.js`, linhas 1–55, e a função
`criarJWT()`). Isso significa: sem OAuth interativo, sem navegador, sem
`refresh_token` — só um par `client_email` + `private_key` de uma conta de
serviço.

1. Abra o [Google Cloud Console](https://console.cloud.google.com/) e crie
   um projeto novo (ou reuse um existente).
2. Ative a **Google Sheets API** para esse projeto (Console → APIs e
   serviços → Biblioteca → "Google Sheets API" → Ativar). Sem isto, toda
   chamada de `lib/sheets.js` falha com o erro que a própria função
   `chamarSheetsAPI()` já antecipa no texto da exceção (linha ~342):
   "Sheets API não habilitada no projeto GCP".
3. Crie uma **Service Account** (Console → IAM e administrador → Contas de
   serviço → Criar conta de serviço). Não precisa conceder nenhum papel de
   projeto (role) a ela — a permissão que importa é o compartilhamento da
   planilha, no passo 6 abaixo, não uma role do IAM do GCP.
4. Na conta de serviço criada, gere uma **chave JSON** (aba "Chaves" →
   "Adicionar chave" → "Criar nova chave" → tipo JSON). O download começa
   sozinho — guarde esse arquivo fora do repositório, ele não deve ser
   commitado em lugar nenhum.
5. Do JSON baixado, você precisa de dois campos:
   - `client_email` → vai para `GOOGLE_SHEETS_CLIENT_EMAIL`
   - `private_key` → vai para `GOOGLE_SHEETS_PRIVATE_KEY`

   `[a definir: nomenclatura exata dos menus do Console muda com frequência
   — os nomes acima ("Contas de serviço", "Chaves") são os vigentes na
   documentação pública do Google Cloud no momento em que este roteiro foi
   escrito, não confirmados contra o console real nesta sessão. Se algum
   nome não bater, procure por "Service Accounts" → "Keys" em inglês.]`

6. **Compartilhe a planilha do passo 1 com o `client_email`** da service
   account, como **Editor** (não "Leitor" — o radar escreve na planilha).
   Sem este compartilhamento, toda escrita falha com HTTP 403/404 — é
   exatamente o segundo caso de erro que `chamarSheetsAPI()` antecipa:
   "planilha não compartilhada com a service account (Editor)".

---

## 3. Preencher o `.env`

1. Copie o template:
   ```
   cp .env.example .env
   ```
2. Preencha (ver comentários de cada campo em `.env.example`, que já
   documentam o formato esperado):
   - `GOOGLE_SHEETS_SPREADSHEET_ID` — o ID do passo 1.
   - `GOOGLE_SHEETS_CLIENT_EMAIL` — o `client_email` do passo 2.5.
   - `GOOGLE_SHEETS_PRIVATE_KEY` — o `private_key` do passo 2.5, **colado
     exatamente como está no JSON**, incluindo as sequências `\n` LITERAIS
     (dois caracteres, barra + "n" — não é quebra de linha de verdade). É
     assim que o JSON da service account já guarda o valor, e
     `lib/sheets.js normalizarChavePrivada()` (linha ~249) converte esse
     `\n` literal para quebra de linha real antes de assinar — aceita os
     dois formatos (`\n` literal ou quebra real), então colar direto do
     JSON funciona sem edição manual.
   - `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` — só necessários se você for
     rodar o robô de notificação (`radar.js notificar` / `rodar-diario.bat`
     completo). Fora do escopo deste SETUP (que cobre só planilha +
     agendamento); ver comentários em `.env.example` para o passo a passo
     do BotFather.

   Sem `GOOGLE_SHEETS_SPREADSHEET_ID`/`GOOGLE_SHEETS_CLIENT_EMAIL`/
   `GOOGLE_SHEETS_PRIVATE_KEY` preenchidos, `lib/sheets.js enviar()` cai
   sozinho em modo dry-run (imprime o que enviaria, não toca rede) — ver
   `enviar()`, linha ~437. Isso é deliberado: o resto do radar funciona sem
   Sheets configurado, só o espelho na planilha fica pendente.

---

## 4. Construir as abas

Com o `.env` preenchido, rode o construtor de abas e fórmulas:

```
node _norman/construir.js
```

Isso cria as abas de leitura (`Concursos`, `_calc`, `Tudo`, `Empregos`,
`Hoje`, `Fila`, `Projetos`, `Tarefas`, `Diário`, `Etapas`, `Candidaturas`,
`Notícias`, `IA`, `Trabalho`, `Ciência` — ver `ABAS_NOVAS` em
`_norman/construir.js`, linhas 36–52) com as fórmulas
`ARRAYFORMULA()`/`FILTER()` que leem de `dados (não edite)`. É idempotente
— rodar de novo atualiza sem duplicar aba.

`node _norman/construir.js --help` (ou `-h`) lista as opções — ver o bloco
`require.main === module` no fim do próprio arquivo
(`_norman/construir.js`, linhas ~1471–1487) para o conjunto completo de
flags; não reproduzido aqui para não divergir do código se um flag for
adicionado depois.

Depois de construir as abas, a primeira sincronização de dados de verdade
roda com:
```
node radar.js sincronizar-sheets
```
(fora do escopo de execução autorizado desta instalação — quem estiver
seguindo este roteiro deve rodar esse comando por conta própria quando
estiver pronto para escrever na planilha viva).

---

## 5. Agendar a tarefa no Windows

`instalar-tarefa.ps1` registra a tarefa `RadarAcademicoJB` no Agendador de
Tarefas do Windows. Leia os comentários do próprio script
(`instalar-tarefa.ps1`, linhas 1–137) antes de rodar — eles documentam a
derivação de cada parâmetro (gatilho a cada 2h, `ExecutionTimeLimit` de 75
minutos, tipo de logon). Resumo do que ele faz:

1. Roda **uma vez**, em PowerShell, **na mesma conta de usuário** que deve
   executar a tarefa (não precisa ser Administrador — mas rodar como
   Administrador permite o tipo de logon `S4U`, que executa sem sessão
   interativa; sem elevação, o script cai automaticamente para
   `LogonType=Interactive`, que exige sessão logada — ver comentário do
   item "(1) LOGON TYPE" no cabeçalho do script).
2. Cria um gatilho repetitivo a cada 2 horas, cobrindo as 24h do dia.
3. Aponta a ação para `rodar-diario.bat` no mesmo diretório do script.
4. É idempotente — `-Force` atualiza a tarefa existente em vez de duplicar.

Comando:
```powershell
.\instalar-tarefa.ps1
```
(de dentro do diretório do projeto, em PowerShell — como Administrador se
quiser o `S4U`; sem elevação, funciona igual com `LogonType=Interactive`).

Para testar sem esperar o próximo horário:
```powershell
schtasks /Run /TN "RadarAcademicoJB"
schtasks /Query /TN "RadarAcademicoJB" /V /FO LIST
```

Para desligar:
```powershell
Unregister-ScheduledTask -TaskName "RadarAcademicoJB" -Confirm:$false
```

---

## 6. Verificar a instalação

- `node provas/higiene.js` — gate de higiene deste repositório (nenhum dado
  do projeto privado de origem, nenhum caractere de controle escondido).
  Deve passar; se reprovar, **não prossiga** e leia o que ele acusou.
- `node radar.js status` — resume o que o store local já tem (vazio numa
  instalação nova).
- Abra a planilha do passo 1 e confira que `dados (não edite)` e as abas de
  leitura do passo 4 existem.

---

## Pontos em aberto (`[a definir]`)

- **Passo 2.5** — nomenclatura exata dos menus do Google Cloud Console
  ("Contas de serviço" / "Chaves") pode ter mudado desde a escrita deste
  roteiro; não confirmado contra o console real nesta sessão (navegação no
  Console está fora do escopo autorizado desta instalação).
- **Setup do bot do Telegram** (`TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`) —
  citado no passo 3 mas não detalhado aqui, por estar fora do escopo deste
  SETUP (que cobre só Sheets + agendamento); os comentários de
  `.env.example` já trazem o essencial (BotFather + `getUpdates`), mas um
  roteiro completo de "criar o bot do zero" não foi escrito.
- **`config/perfil.json` e `config/keywords*.json`** — necessários para o
  radar julgar vagas/editais com critério real, mas fora do escopo deste
  roteiro (que é só "planilha + agendamento"); ver os comentários dentro
  de cada `config/*.example.json` e `docs/PLANILHA.md`.
