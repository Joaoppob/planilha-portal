@echo off
REM Onda 2.1, item 3 do briefing - wrapper executado pelo Windows Task
REM Scheduler (tarefa "RadarAcademicoJB"). NAO editar caminhos sem atualizar
REM a tarefa agendada (ver README.md #Ligando a automacao (Task Scheduler)).
REM
REM ROTA HERMES, FASE F0 (.claude/plans/rota-hermes-turno-autonomo.md secao 5, F0) -
REM guarda de "ja rodou HOJE" (dia civil) SUBSTITUIDA por guarda de JANELA
REM DESLIZANTE, DIFERENCIADA POR TRILHA (lib/guarda-janela.js):
REM   - trilha VAGA    (coletar/julgar/ativar-notificacoes/notificar/
REM                      sincronizar-sheets de vaga)      -> janela de 2h
REM   - trilha NOTICIA (noticias.js coletar/sincronizar-sheets) -> janela de 8h
REM As duas guardas SAO INDEPENDENTES: numa mesma chamada deste .bat, uma
REM trilha pode rodar enquanto a outra e pulada (e vice-versa) - nao existe
REM mais um unico "ja rodou hoje" cobrindo as duas. Motivo da janela de
REM noticia ser maior (nao e descuido): a trilha noticia varre hoje 66
REM fontes RSS/Atom de requisicao unica + Hacker News + Reddit, e Reddit tem
REM throttle DELIBERADO de 30s fixos entre cada um dos 5 subreddits
REM (RADAR_NOTICIAS_REDDIT_THROTTLE_MS, ver fontes-noticias/reddit.js) pra
REM nao levar 429 da Reddit - rodar essa trilha de 2h em 2h multiplicaria o
REM volume de requests por ~4x contra as mesmas fontes, trocando um throttle
REM calibrado por risco real de bloqueio, sem ganho (JB quer o briefing de
REM noticia poucas vezes por dia, nao noticia nova a cada 2h). A trilha vaga
REM e a que JB quer "o tempo inteiro" - daí a janela de 2h nela.
REM Cada guarda e chamada via `node lib\guarda-janela.js pular <trilha>`
REM (exit 1 = pular, exit 0 = pode rodar) - a logica de janela/migracao do
REM formato antigo do arquivo mora so em lib/guarda-janela.js, nao aqui.
REM
REM O QUE NAO MUDOU (herdado da guarda antiga, mesma disciplina):
REM   - a marca de uma trilha so e escrita NO FIM dessa trilha, e SOMENTE se
REM     as etapas dela terminaram com ERRORLEVEL 0 E o sync com a planilha
REM     dessa trilha foi verificado como bem-sucedido (mesmo criterio de
REM     "execucao limpa" de antes, agora aplicado por trilha em vez de pro
REM     batch inteiro). Se a trilha falhar, a marca dela NAO e escrita e a
REM     proxima janela refaz aquela trilha do zero (sem retomada por etapa,
REM     decisao de JB preservada).
REM   - "--forcar" continua ignorando a LEITURA das duas marcas (roda as duas
REM     trilhas incondicionalmente), mas ainda reescreve a marca de cada
REM     trilha no fim, se ela fechar limpa.
REM   - -MultipleInstances IgnoreNew (na tarefa agendada, ver
REM     instalar-tarefa.ps1) continua sendo o que impede duas execucoes
REM     escreverem no mesmo data\store.jsonl ao mesmo tempo - nao removido.
REM
REM O que faz, nesta ordem: GUARDA vaga -> [se nao pulou] (1) coleta; (2)
REM julga (score + Ollama); (3) ativar-notificacoes -- fecha o backlog (marca
REM pendente como visto + digest UNICO) na 1a execucao; idempotente nas
REM seguintes (data/backlog-fechado.json), so reimprime; (4) notifica
REM (Telegram, respeita o limiar de score de config/notificacao.json E o teto
REM duro max_mensagens_por_execucao); (5) sincronizar-sheets (vaga) -- espelha
REM o store inteiro na aba "dados (não edite)" da planilha Google Sheets
REM (lib/sheets.js) -> [fechou limpo] marca a trilha vaga. Depois, GUARDA
REM noticia -> [se nao pulou] (6) coletar de NOTICIAS (noticias.js coletar);
REM a guarda de frescor por fonte (lib-noticias/frescor.js) ja roda DENTRO do
REM coletar - fonte com feed velho/sem data e rejeitada e some do lote sem
REM derrubar o comando; so o comando inteiro devolvendo ERRORLEVEL != 0 conta
REM como falha aqui; (7) sincronizar-sheets de NOTICIAS (noticias.js
REM sincronizar-sheets) -- espelha o store de noticias na aba "notícias (não
REM edite)" da MESMA planilha-portal -> [fechou limpo] marca a trilha
REM noticia. Tudo logado em logs\rodar-diario.log (append).
REM
REM SINCRONIZAR-SHEETS E CASO ESPECIAL (vale para os DOIS syncs, vaga E
REM noticias): por contrato de radar.js comandoSincronizarSheets e de
REM noticias.js comandoSincronizarSheets, os dois NUNCA lancam (logam o
REM erro e saem limpos, pra que falha de rede/API nao mascare o sucesso da
REM coleta/notificacao ja concluidas) - isso NAO mudou e nao pode mudar.
REM Por isso o ERRORLEVEL de nenhum dos dois passos de sincronizar-sheets e
REM usado como sinal de falha aqui. Em vez disso, depois de CADA sync, um
REM `node -e` curto LE o carimbo que lib/sheets.js grava na planilha
REM (celula CELULA_CARIMBO, sempre Y1 - mesma coordenada nas duas abas,
REM convencao de _norman/construir.js) e compara a data com hoje: se
REM bater, o sync realmente aconteceu; se nao bater (ou der erro de
REM rede/auth), a trilha correspondente NAO fecha limpa. So a ABA muda entre
REM os dois checks ("dados (não edite)" pra vaga, "notícias (não edite)" pra
REM noticias - noticias.js exporta ABA_FATO exatamente pra isso o .bat nao
REM precisar duplicar o nome literal da aba). Sem credencial no .env
REM (mesmas variaveis GOOGLE_SHEETS_*, mesma planilha-portal pras duas
REM trilhas), os dois sincronizar-sheets caem em dry-run sozinhos - as duas
REM verificacoes de carimbo detectam a ausencia de credencial e tratam como
REM NAO-FALHA (senao a marca nunca seria gravada numa maquina sem
REM credencial, e cada trilha rodaria em toda janela pra sempre).

setlocal
set NODE_EXE="C:\Program Files\nodejs\node.exe"
set SCRIPT_DIR=%~dp0
set LOG_FILE=%SCRIPT_DIR%logs\rodar-diario.log
set MARCA_FILE=%SCRIPT_DIR%data\ultima-execucao.json

set FORCAR=0
if /I "%~1"=="--forcar" set FORCAR=1

cd /d "%SCRIPT_DIR%"

echo. >> "%LOG_FILE%"
echo ===== %date% %time% - inicio rodar-diario.bat ===== >> "%LOG_FILE%"

set PULAR_VAGA=0
set PULAR_NOTICIA=0

REM ACHADO/CORRECAO (validado nesta sessao - reproduzido e confirmado por
REM execucao real): as duas linhas de guarda NAO podem morar dentro do
REM MESMO bloco `if/else (...)` que as chama - %ERRORLEVEL% dentro de um
REM bloco parentizado e expandido UMA VEZ, no instante em que o bloco e
REM PARSEADO, nao a cada linha executada dentro dele. Colocar a chamada ao
REM node E o `if "%ERRORLEVEL%"...` no MESMO bloco faz o `if` ler o
REM ERRORLEVEL de ANTES do bloco comecar, nunca o do proprio node - a
REM guarda sempre "passava" mesmo quando guarda-janela.js dizia PULAR (log
REM mostrava "- PULAR." e o .bat coletava do mesmo jeito). Por isso as duas
REM chamadas ficam FORA de qualquer bloco, cada `if` na linha imediatamente
REM seguinte ao comando que define o ERRORLEVEL que ele le (mesmo idioma
REM das checagens de FALHOU_VAGA/FALHOU_NOTICIA abaixo, que sempre foram
REM assim e nunca tiveram este defeito).
if "%FORCAR%"=="1" (
  echo [rodar-diario] --forcar: ignorando a leitura das marcas de janela ^(vaga e noticia^), se houver. >> "%LOG_FILE%"
  goto GUARDA_FEITA
)

%NODE_EXE% lib\guarda-janela.js pular vaga >> "%LOG_FILE%" 2>&1
if "%ERRORLEVEL%"=="1" set PULAR_VAGA=1

%NODE_EXE% lib\guarda-janela.js pular noticia >> "%LOG_FILE%" 2>&1
if "%ERRORLEVEL%"=="1" set PULAR_NOTICIA=1

:GUARDA_FEITA

REM ===================== TRILHA VAGA (janela 2h) =====================
if "%PULAR_VAGA%"=="1" (
  echo [rodar-diario] trilha VAGA pulada - dentro da janela de 2h ^(ver linha guarda-janela acima^). Nada de vaga sera coletado nesta chamada. >> "%LOG_FILE%"
  goto TRILHA_NOTICIA
)

set FALHOU_VAGA=0

echo [rodar-diario] coletar... >> "%LOG_FILE%"
%NODE_EXE% radar.js coletar >> "%LOG_FILE%" 2>&1
if not "%ERRORLEVEL%"=="0" (
  echo [rodar-diario] coletar FALHOU - codigo=%ERRORLEVEL% >> "%LOG_FILE%"
  set FALHOU_VAGA=1
)

echo [rodar-diario] julgar... >> "%LOG_FILE%"
%NODE_EXE% radar.js julgar >> "%LOG_FILE%" 2>&1
if not "%ERRORLEVEL%"=="0" (
  echo [rodar-diario] julgar FALHOU - codigo=%ERRORLEVEL% >> "%LOG_FILE%"
  set FALHOU_VAGA=1
)

echo [rodar-diario] ativar-notificacoes (fecha o backlog na 1a execucao; idempotente nas seguintes)... >> "%LOG_FILE%"
%NODE_EXE% radar.js ativar-notificacoes >> "%LOG_FILE%" 2>&1
if not "%ERRORLEVEL%"=="0" (
  echo [rodar-diario] ativar-notificacoes FALHOU - codigo=%ERRORLEVEL% >> "%LOG_FILE%"
  set FALHOU_VAGA=1
)

echo [rodar-diario] notificar... >> "%LOG_FILE%"
%NODE_EXE% radar.js notificar >> "%LOG_FILE%" 2>&1
if not "%ERRORLEVEL%"=="0" (
  echo [rodar-diario] notificar FALHOU - codigo=%ERRORLEVEL% >> "%LOG_FILE%"
  set FALHOU_VAGA=1
)

echo [rodar-diario] sincronizar-sheets (espelho Google Sheets; contrato: NUNCA lanca, ver cabecalho)... >> "%LOG_FILE%"
%NODE_EXE% radar.js sincronizar-sheets >> "%LOG_FILE%" 2>&1

echo [rodar-diario] verificando carimbo de sync na planilha... >> "%LOG_FILE%"
%NODE_EXE% -e "const { carregarEnv } = require('./lib/env'); carregarEnv(); const sheets = require('./lib/sheets'); const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID; const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL; const privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY; if (!spreadsheetId || !clientEmail || !privateKey) { console.log('[verificar-carimbo] sem credencial no .env - sincronizar-sheets caiu em dry-run sozinho, tratado como nao-falha'); process.exit(0); } (async () => { try { const accessToken = await sheets.obterAccessToken({ clientEmail, privateKey }); const range = encodeURIComponent(sheets.refAba(sheets.ABA_DADOS) + '!' + sheets.CELULA_CARIMBO); const url = 'https://sheets.googleapis.com/v4/spreadsheets/' + spreadsheetId + '/values/' + range; const res = await fetch(url, { headers: { Authorization: 'Bearer ' + accessToken } }); const data = await res.json().catch(() => ({})); if (!res.ok) { console.error('[verificar-carimbo] HTTP ' + res.status + ' ' + JSON.stringify(data)); process.exit(1); } const valores = data.values || []; const carimbo = (valores[0] && valores[0][0]) || ''; const d = new Date(); const p = n => String(n).padStart(2,'0'); const hoje = d.getFullYear() + '-' + p(d.getMonth()+1) + '-' + p(d.getDate()); if (carimbo === hoje) { console.log('[verificar-carimbo] OK carimbo=' + carimbo); process.exit(0); } console.error('[verificar-carimbo] carimbo=' + carimbo + ' hoje=' + hoje + ' - nao bate, sync nao fechou limpo'); process.exit(1); } catch (err) { console.error('[verificar-carimbo] erro: ' + (err && err.message || err)); process.exit(1); } })();" >> "%LOG_FILE%" 2>&1
if not "%ERRORLEVEL%"=="0" (
  echo [rodar-diario] verificacao do carimbo de sync FALHOU - codigo=%ERRORLEVEL% >> "%LOG_FILE%"
  set FALHOU_VAGA=1
)

if "%FALHOU_VAGA%"=="0" (
  %NODE_EXE% lib\guarda-janela.js marcar vaga >> "%LOG_FILE%" 2>&1
  echo [rodar-diario] trilha VAGA fechou limpa - marca gravada em data\ultima-execucao.json ^(chave "vaga"^). >> "%LOG_FILE%"
) else (
  echo [rodar-diario] trilha VAGA com falha em pelo menos uma etapa - marca NAO gravada; a proxima janela refaz a trilha vaga do zero. >> "%LOG_FILE%"
)

:TRILHA_NOTICIA
REM =================== TRILHA NOTICIA (janela 8h) ====================
if "%PULAR_NOTICIA%"=="1" (
  echo [rodar-diario] trilha NOTICIA pulada - dentro da janela de 8h ^(ver linha guarda-janela acima^). Nada de noticia sera coletado nesta chamada. >> "%LOG_FILE%"
  goto FIM
)

set FALHOU_NOTICIA=0

echo [rodar-diario] coletar noticias... >> "%LOG_FILE%"
%NODE_EXE% noticias.js coletar >> "%LOG_FILE%" 2>&1
if not "%ERRORLEVEL%"=="0" (
  echo [rodar-diario] coletar noticias FALHOU - codigo=%ERRORLEVEL% >> "%LOG_FILE%"
  set FALHOU_NOTICIA=1
)

echo [rodar-diario] sincronizar-sheets noticias (espelho Google Sheets, aba "notícias (não edite)"; contrato: NUNCA lanca, ver cabecalho)... >> "%LOG_FILE%"
%NODE_EXE% noticias.js sincronizar-sheets >> "%LOG_FILE%" 2>&1

echo [rodar-diario] verificando carimbo de sync de noticias na planilha... >> "%LOG_FILE%"
%NODE_EXE% -e "const { carregarEnv } = require('./lib/env'); carregarEnv(); const sheets = require('./lib/sheets'); const noticias = require('./noticias'); const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID; const clientEmail = process.env.GOOGLE_SHEETS_CLIENT_EMAIL; const privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY; if (!spreadsheetId || !clientEmail || !privateKey) { console.log('[verificar-carimbo-noticias] sem credencial no .env - sincronizar-sheets caiu em dry-run sozinho, tratado como nao-falha'); process.exit(0); } (async () => { try { const accessToken = await sheets.obterAccessToken({ clientEmail, privateKey }); const range = encodeURIComponent(sheets.refAba(noticias.ABA_FATO) + '!' + sheets.CELULA_CARIMBO); const url = 'https://sheets.googleapis.com/v4/spreadsheets/' + spreadsheetId + '/values/' + range; const res = await fetch(url, { headers: { Authorization: 'Bearer ' + accessToken } }); const data = await res.json().catch(() => ({})); if (!res.ok) { console.error('[verificar-carimbo-noticias] HTTP ' + res.status + ' ' + JSON.stringify(data)); process.exit(1); } const valores = data.values || []; const carimbo = (valores[0] && valores[0][0]) || ''; const d = new Date(); const p = n => String(n).padStart(2,'0'); const hoje = d.getFullYear() + '-' + p(d.getMonth()+1) + '-' + p(d.getDate()); if (carimbo === hoje) { console.log('[verificar-carimbo-noticias] OK carimbo=' + carimbo); process.exit(0); } console.error('[verificar-carimbo-noticias] carimbo=' + carimbo + ' hoje=' + hoje + ' - nao bate, sync nao fechou limpo'); process.exit(1); } catch (err) { console.error('[verificar-carimbo-noticias] erro: ' + (err && err.message || err)); process.exit(1); } })();" >> "%LOG_FILE%" 2>&1
if not "%ERRORLEVEL%"=="0" (
  echo [rodar-diario] verificacao do carimbo de sync de noticias FALHOU - codigo=%ERRORLEVEL% >> "%LOG_FILE%"
  set FALHOU_NOTICIA=1
)

if "%FALHOU_NOTICIA%"=="0" (
  %NODE_EXE% lib\guarda-janela.js marcar noticia >> "%LOG_FILE%" 2>&1
  echo [rodar-diario] trilha NOTICIA fechou limpa - marca gravada em data\ultima-execucao.json ^(chave "noticia"^). >> "%LOG_FILE%"
) else (
  echo [rodar-diario] trilha NOTICIA com falha em pelo menos uma etapa - marca NAO gravada; a proxima janela refaz a trilha noticia do zero. >> "%LOG_FILE%"
)

:FIM
echo ===== %date% %time% - fim rodar-diario.bat ===== >> "%LOG_FILE%"

exit /b 0
