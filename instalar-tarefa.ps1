# Onda 2.1, item 3 do briefing - registra a tarefa "RadarAcademicoJB" no
# Windows Task Scheduler. Rode UMA VEZ, em PowerShell, na mesma conta de
# usuario que deve rodar a tarefa (nao precisa ser administrador - tarefa
# de usuario comum). Reexecutar este script atualiza a tarefa existente
# (-Force sobrescreve, nao duplica).
#
# ROTA HERMES, FASE F0 (.claude/plans/rota-hermes-turno-autonomo.md §5 F0) -
# 4 mudancas nesta rodada:
#
# (1) LOGON TYPE: Interactive -> S4U. A tarefa registrada antes desta rodada
#   tinha LogonType=Interactive (confirmado com `Get-ScheduledTask` em
#   2026-09-10 - Principal.LogonType), o que a IMPEDE de rodar sem sessao
#   interativa ativa (JB deslogado ou tela de logon). S4U ("service for
#   user") roda sem senha armazenada e sem sessao interativa, exigindo so
#   que a conta tenha o privilegio "Fazer logon como tarefa em lote" (o
#   proprio Register-ScheduledTask concede isso). Nao ha dependencia de
#   sessao interativa no restante do pipeline: `lib/env.js carregarEnv()`
#   le `.env` por PATH ABSOLUTO derivado de `__dirname` (nao de variavel de
#   ambiente de sessao de usuario, nem de %USERPROFILE%), e nenhuma das
#   credenciais usadas (GOOGLE_SHEETS_*, TELEGRAM_*) depende de token de
#   sessao interativa - sao JWT de service account e bot token, carregados
#   do arquivo. Confirmado por leitura de lib/env.js e .env antes desta
#   mudanca (nao suposto).
#
# (2) GUARDA: "1x por dia civil" -> JANELA DESLIZANTE por trilha. Ver o
#   cabecalho de rodar-diario.bat e de lib/guarda-janela.js para a guarda em
#   si (vaga=2h, noticia=8h) - este script so precisa que os GATILHOS sejam
#   frequentes o bastante pra guarda ter o que fazer (item 3 abaixo).
#
# (3) GATILHOS: 3 gatilhos diarios fixos (08:00/13:00/19:00) -> 1 gatilho
#   repetitivo a cada 2h, cobrindo as 24h (00:00, 02:00, 04:00, ..., 22:00 -
#   12 disparos/dia). ACHADO DE FERRAMENTA: `New-ScheduledTaskTrigger -Daily`
#   nao aceita `-RepetitionInterval`/`-RepetitionDuration` neste modulo (so
#   `-Once` aceita) - o gatilho e por isso um `-Once` ancorado a meia-noite
#   com repeticao de 2h por 10 anos (3650 dias), idioma padrao pra "repita
#   indefinidamente" (ver comentario inline na criacao do gatilho, abaixo).
#   -StartWhenAvailable, -DontStopOnIdleEnd e -MultipleInstances IgnoreNew
#   MANTIDOS (este ultimo e o que impede duas execucoes escreverem no mesmo
#   data\store.jsonl ao mesmo tempo - condicao de corrida real, documentada
#   no cabecalho do proprio rodar-diario.bat; NAO removido).
#
# (4) EXECUTIONTIMELIMIT: RECALCULADO, nao herdado. O valor de 60min vigente
#   antes desta rodada (na VERSAO DESTE SCRIPT - a tarefa de fato registrada
#   em 2026-09-10, antes desta rodada, estava em 30min: `Get-ScheduledTask`
#   mostrou `Settings.ExecutionTimeLimit = PT30M`, divergente do que este
#   script dizia registrar. Ou seja, a tarefa viva já estava desalinhada do
#   proprio script antes desta rodada - achado registrado, nao herdado)
#   tinha sido derivado assumindo 5h entre gatilhos (08:00->13:00, o menor
#   intervalo). Com gatilho de 2h essa premissa morre por completo: um
#   limite pensado pra uma folga de 5h nao pode ser copiado pra uma folga de
#   2h sem reconferir se ainda cabe.
#
#   DERIVACAO NOVA (2026-09-10, medida no disco desta vez, nao herdada da
#   rodada anterior - as duas trilhas mudaram de fontes desde a ultima
#   derivacao):
#
#   TRILHA VAGA - piso HERDADO em 45min, RECONFIRMADO (nao recalculado do
#   zero): a base empirica que sustenta esse piso e a mesma da rodada
#   anterior (logs\rodar-diario.log, execucao real 27/08/2026 10:53-10:56,
#   ~2min46s com falhas de rede HTTP 500 no enriquecimento, folga de ~15x
#   pra degradacao de rede via timeout em vez de falha rapida - ver
#   lib/http.js, timeout de 20s por requisicao, sem retry). fontes/index.js
#   hoje lista 7 fontes (nao mais 5): dou, gupy, programathor, pci,
#   weworkremotely, selecaoacademica, vagas - as 2 novas (selecaoacademica.js,
#   vagas.js) foram inspecionadas nesta rodada e sao, EM NATUREZA DE REDE,
#   do MESMO tipo que pci/weworkremotely (1 fetch de listagem, sem
#   enriquecimento por item via rede) - selecaoacademica.js faz 1 unico
#   http.get(FEED_URL); vagas.js pagina busca por 14 termos (config/
#   keywords-mercado.json termos_busca_vagascom) mas SEM enriquecer por item
#   via rede: `ENRIQUECER_VIA_REDE = false` e uma CONSTANTE FIXA no modulo
#   (fontes/vagas.js), nao uma flag de ambiente - confirmado no log real de
#   hoje (10/09/2026 08:24:45, logs\rodar-diario.log: "vagas: pre-filtro-de-
#   tipo 122/122 itens ... estagio1(gate) 122/122" SEM nenhuma linha
#   "[vagas] enriquecer:", ao contrario de programathor, que enriquece de
#   verdade e loga cada falha). Por isso o piso de 45min continua
#   estruturalmente valido: nenhuma fonte NOVA da trilha vaga introduz uma
#   classe de custo de rede que a rodada anterior nao ja tivesse (DOU+Gupy+
#   Programathor sao as 3 que fazem enriquecimento por item via rede, e sao
#   as mesmas 3 de antes).
#   RISCO ACEITO, NAO SILENCIADO (achado desta rodada, nao bloqueante): se
#   `ENRIQUECER_VIA_REDE` de fontes/vagas.js for ligado no futuro, o piso de
#   45min PRECISA ser re-derivado antes - o log real de hoje mostra 122
#   itens passando o gate que enriquecer() processaria um a um, o que a
#   45min atual nao cobre. Fora do escopo desta rodada (F0 e so guarda +
#   agendamento, nao muda fontes/vagas.js) - reportado, nao corrigido aqui.
#
#   TRILHA NOTICIA - RECALCULADA (a base de 23 fontes da derivacao anterior,
#   de 28/08/2026, ficou obsoleta - fontes-noticias/index.js soma hoje
#   listaFontes = geral.fontes(19) + ia.fontes(14) + trabalho.fontes(15) +
#   ciencia.fontes(18) = 66 fontes RSS/Atom de requisicao UNICA (contadas
#   por grep de `urls:` nos 4 arquivos, cada uma com 1 URL, confirmado - nao
#   ha fonte com paginacao nem enriquecimento nesta trilha, "sem estagio de
#   enriquecimento" e o proprio contrato de fontes-noticias/index.js) + 5
#   chamadas Hacker News (front_page + 4 termos, fontes-noticias/
#   hackernews.js) + Reddit (5 subreddits, throttle 30s FIXO entre cada,
#   INDEPENDENTE do timeout - roda mesmo se a chamada anterior falhou, ver
#   fontes-noticias/reddit.js). Nenhuma fonte tem retry (lib/http.js so tem
#   timeout de 20s, sem loop de retentativa) - pior caso analitico = TODAS
#   estourando os 20s:
#     66 fontes RSS/Atom x 20s                          = 1.320,0s
#     Hacker News: 5 chamadas x 20s + 4 pausas x 0,4s    =   101,6s
#     Reddit: 5 subreddits x 20s + 4 throttles x 30s     =   220,0s
#     TOTAL analitico                                    = 1.641,6s = ~27min22s
#   Arredondado pra 30min (folga de ~2min38s sobre o pior caso analitico,
#   mesmo espirito de folga da derivacao anterior - cobre variacao do
#   proprio Node/V8 e do disco na escrita do store, nao um novo fator de
#   seguranca).
#
#   TOTAL: 45min (vaga, reconfirmado) + 30min (noticia, recalculado) = 75min.
#   CABE na janela de 2h entre gatilhos (75min de 120min = 62,5% da janela) -
#   mata uma tarefa travada bem antes do proximo gatilho, mas com MENOS
#   folga relativa que a derivacao anterior tinha sobre a janela de 5h dela
#   (60min de 300min = 20%). Isso e ACHADO, nao chute escolhido pra caber:
#   a folga caiu porque o gatilho ficou 2,5x mais frequente (2h vs 5h) e o
#   pior caso analitico da trilha noticia quase dobrou (fontes cresceram de
#   23 pra 66) - as duas coisas apertam a mesma janela ao mesmo tempo. Ainda
#   cabe (75min < 120min), entao NAO e o caso de "trilha noticia precisa
#   sair do .bat" previsto no briefing - mas se as fontes de noticia
#   continuarem crescendo no mesmo ritmo, essa margem de 37,5% (45min livres
#   de 120min) e o numero a observar antes de acrescentar a proxima fonte.
#
# Para DESLIGAR a automacao (JB nao precisa chamar Durin pra isso):
#   Unregister-ScheduledTask -TaskName "RadarAcademicoJB" -Confirm:$false
# Ou pela GUI: abra "Agendador de Tarefas" (taskschd.msc), ache
# "RadarAcademicoJB" na raiz da Biblioteca do Agendador de Tarefas, botao
# direito -> Excluir (ou Desabilitar, se quiser manter sem apagar).
#
# Para TESTAR manualmente sem esperar o proximo horario:
#   schtasks /Run /TN "RadarAcademicoJB"
#   schtasks /Query /TN "RadarAcademicoJB" /V /FO LIST   (ver LastRunTime/LastTaskResult)
#   Get-Content .\logs\rodar-diario.log -Tail 40           (ver o que rodou)
#
# Para forcar uma coleta ignorando as marcas de janela (ex.: saiu um edital
# e JB nao quer esperar a janela abrir), rode diretamente no terminal (fora
# do Task Scheduler):
#   .\rodar-diario.bat --forcar

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$bat = Join-Path $scriptDir "rodar-diario.bat"

if (-not (Test-Path $bat)) {
    Write-Error "rodar-diario.bat nao encontrado em $scriptDir - rode este script de dentro de Academico/radar/."
    exit 1
}

$acao = New-ScheduledTaskAction -Execute $bat -WorkingDirectory $scriptDir

# Gatilho repetitivo de 2h cobrindo as 24h (item 3 do cabecalho acima).
# ACHADO DE FERRAMENTA (nao suposto - `Get-Command New-ScheduledTaskTrigger
# -Syntax` confirmado nesta sessao): o parameter set `-Daily` deste modulo
# NAO aceita `-RepetitionInterval`/`-RepetitionDuration` (so o parameter set
# `-Once` aceita). Por isso o gatilho e um `-Once` ancorado a meia-noite de
# HOJE com repeticao de 2h por uma duracao de 10 anos (3650 dias) - idioma
# padrao pra "repita a cada N indefinidamente" nesta API, ja que nao existe
# um valor literal de "para sempre" pro RepetitionDuration. O Task Scheduler
# calcula as ocorrencias futuras a partir da ancora mesmo se a ancora ja
# estiver no passado do dia de hoje - nao perde disparos do dia corrente.
$inicioJanela = Get-Date -Hour 0 -Minute 0 -Second 0
$gatilho = New-ScheduledTaskTrigger -Once -At $inicioJanela `
    -RepetitionInterval (New-TimeSpan -Hours 2) `
    -RepetitionDuration (New-TimeSpan -Days 3650)

# S4U (item 1 do cabecalho acima) - roda sem sessao interativa e sem senha
# armazenada. $env:USERNAME resolve pra conta de quem RODA este script
# (rode como a mesma conta que deve rodar a tarefa, igual antes).
#
# ACHADO DESTA SESSAO (nao previsto no briefing original, confirmado por
# teste isolado - task de diagnostico descartavel, nunca a tarefa real):
# `Register-ScheduledTask` com `-Principal ... -LogonType S4U` devolve
# "Acesso negado" quando a sessao PowerShell NAO esta elevada (Executar como
# Administrador) - Windows exige elevacao pra conceder o privilegio "Fazer
# logon como tarefa em lote" (SeBatchLogonRight) a conta, que o S4U precisa.
# Confirmado que NAO e a tarefa real que causa o erro (o mesmo `-Principal`
# com `-LogonType Interactive` explicito, e tambem SEM `-Principal` nenhum,
# registraram uma task de teste sem erro na mesma sessao nao-elevada) - e
# especificamente o S4U que exige elevacao.
# Por isso este script TENTA S4U primeiro e, se vier "Acesso negado", cai
# para Interactive (preservando as outras 3 mudancas - guarda por trilha via
# rodar-diario.bat, gatilho de 2h, ExecutionTimeLimit recalculado) em vez de
# abortar a instalacao inteira. Rode este script A PARTIR DE UM POWERSHELL
# COMO ADMINISTRADOR pra aplicar o S4U de fato (repita
# `.\instalar-tarefa.ps1` elevado quando puder - e idempotente, `-Force`
# atualiza sem duplicar).
$principalS4U = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType S4U -RunLevel Limited
$principalInteractive = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

# ExecutionTimeLimit recalculado (item 4 do cabecalho acima): 45min (vaga) +
# 30min (noticia) = 75min.
$configuracoes = New-ScheduledTaskSettingsSet -StartWhenAvailable -DontStopOnIdleEnd -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 75)

$descricaoS4U = "Radar de oportunidades academicas + noticias (D.TAI) - guarda por janela deslizante DIFERENCIADA por trilha (vaga=2h, noticia=8h, ver lib/guarda-janela.js); gatilho repetitivo a cada 2h, 24h/dia, S4U (roda sem sessao interativa). Desligar: Unregister-ScheduledTask -TaskName RadarAcademicoJB"
$descricaoInteractive = "Radar de oportunidades academicas + noticias (D.TAI) - guarda por janela deslizante DIFERENCIADA por trilha (vaga=2h, noticia=8h, ver lib/guarda-janela.js); gatilho repetitivo a cada 2h, 24h/dia. LogonType=Interactive (S4U pendente - rode este script elevado/Administrador para trocar; ver comentario acima da criacao do Principal). Desligar: Unregister-ScheduledTask -TaskName RadarAcademicoJB"

$logonTypeAplicado = "S4U"
try {
    Register-ScheduledTask -TaskName "RadarAcademicoJB" -Action $acao -Trigger $gatilho -Principal $principalS4U -Settings $configuracoes -Description $descricaoS4U -Force -ErrorAction Stop | Out-Null
} catch {
    Write-Warning ("S4U falhou (" + $_.Exception.Message + ") - provavelmente sessao PowerShell nao elevada. Aplicando as outras 3 mudancas (guarda por trilha, gatilho de 2h, ExecutionTimeLimit) com LogonType=Interactive (igual antes) e reportando o S4U como pendente.")
    Register-ScheduledTask -TaskName "RadarAcademicoJB" -Action $acao -Trigger $gatilho -Principal $principalInteractive -Settings $configuracoes -Description $descricaoInteractive -Force | Out-Null
    $logonTypeAplicado = "Interactive (S4U PENDENTE - rode elevado)"
}

Write-Host "Tarefa 'RadarAcademicoJB' registrada (a cada 2h, 24h/dia, LogonType $logonTypeAplicado)."
Write-Host "Teste manual agora: schtasks /Run /TN RadarAcademicoJB"
Write-Host "Ver resultado: schtasks /Query /TN RadarAcademicoJB /V /FO LIST"
Write-Host ("Log: " + $scriptDir + "\logs\rodar-diario.log")
Write-Host "Forcar execucao ignorando as marcas de janela: .\rodar-diario.bat --forcar"
Write-Host "Desligar quando quiser: Unregister-ScheduledTask -TaskName RadarAcademicoJB -Confirm:`$false"
