'use strict';
// NOTAS DE CÉLULA — a camada de PROFUNDIDADE da planilha.
//
// Por que nota e não uma aba "Leia-me": explicação se ANEXA ao que explica ou
// vira manual, e manual ninguém lê. A nota fica presa ao rótulo que gera a
// dúvida, custa zero linha de lista (o recurso escasso aqui é altura de tela
// no celular) e sobrevive tanto ao `values.clear` do sync quanto ao
// `limpar()` do construir.js — `note` é propriedade da célula, não valor.
//
// REGRA DURA DE USO: nada que a régua exija pode morar SÓ aqui. O app de
// celular pode não expor nota, e apostar a compreensão numa camada que talvez
// não renderize seria trocar um estado mudo por outro. Tudo que é necessário
// está no nome da aba, no rótulo da célula ou no texto das linhas 1-2; a nota
// aprofunda, nunca sustenta.
//
// O QUE DELIBERADAMENTE NÃO TEM NOTA: `Abrir`, `UF`, `Modalidade` e `Nível`.
// O rótulo mais o valor já dizem tudo ("📄 edital", "SP", "🏠 remoto",
// "sênior"); anotá-los seria repetir a célula com outras palavras e ensinar
// que nota aqui é ruído — o que faria JB parar de abrir as quatro que importam.
const A = require('./abas');
const F = require('./formulas');

// ONDE A NOTA MORA — derivado, nunca literal (N-17). A linha de navegação
// empurrou o cabeçalho de TODA aba uma linha pra baixo. Uma nota presa a um
// índice escrito à mão continuaria existindo, colada na célula errada — e
// nota colada uma linha acima do rótulo que ela explica é pior que nota
// ausente: ela passa em auditoria de existência. Estas duas funções são a
// única aritmética de posição deste arquivo.
// E a COLUNA também deixa de ser literal, pela mesma razão e por um motivo
// novo: a ordem de coluna de `Projetos` mudou (as duas colunas que fecham o
// job de projeto subiram pro meio) e as três abas de radar passaram a
// compartilhar uma forma só. Índice escrito à mão sobrevive a isso: a nota
// continua existindo, colada no rótulo errado, explicando outra coisa. É a
// mesma classe de falha muda que o índice de LINHA já tinha.
//
// ANCORAGEM POR CABEÇALHO, E O QUE FALTAVA PRA ELA VALER (N4).
//
// `noCabecalho` já ancorava a nota no RÓTULO e já estourava quando o rótulo
// não existe — e mesmo assim a peça saiu com 14 notas na célula errada. O
// furo não estava aqui: `note` é propriedade da CÉLULA e sobrevive a tudo, e
// `formatar.js` só ESCREVIA as notas declaradas, sem nunca APAGAR as que
// ficaram para trás. Quando a ordem de coluna mudou (`Projetos` ganhou E e F,
// `Concursos` ganhou `UF`/`Área`), a nota nova foi pra coluna certa e a
// VELHA continuou na antiga. Resultado medido: `Projetos!G3`, `H3` e `K3` —
// `quem age`, `prazo` e `notas`, três colunas que JB PRECISA digitar —
// carregando "CALCULADA — não digite aqui".
//
// O conserto de classe tem três partes, e nenhuma delas é uma nota corrigida:
//   1. `formatar.js` APAGA a nota de toda a faixa de cromo antes de escrever
//      (`F.ultimoCromo`), no mesmo batch e nessa ordem;
//   2. `construir.js` estoura se uma âncora apontar pra cabeçalho inexistente
//      (`ANCORAS`, abaixo) — antes de qualquer escrita;
//   3. `verificar.js` reprova nota VIVA que ninguém declarou. Sem (3), (1)
//      passa a existir e ninguém descobre no dia em que ela parar de rodar.
//
// `ANCORAS` guarda o RÓTULO junto com a posição resolvida: sem ele, a guarda
// de `construir.js` só conseguiria conferir números, e número não diz de qual
// coluna a nota fala.
const ANCORAS = [];
const noCabecalho = (aba, rotulo, texto) => {
  const cab = F.CABECALHO_POR_ABA[aba];
  const i = cab ? cab.indexOf(rotulo) : -1;
  if (i < 0) {
    throw new Error(
      `nota de ${aba}: não há coluna "${rotulo}" no cabeçalho ${JSON.stringify(cab)}. ` +
      'Nota ancorada por RÓTULO é o que impede uma reordenação de colar a explicação na coluna vizinha — ' +
      'conserte o rótulo em _norman/notas.js OU o cabeçalho em _norman/formulas.js, nunca só um dos dois.'
    );
  }
  const pos = [F.LINHAS[aba].cabecalho - 1, i, texto];
  ANCORAS.push({ aba, rotulo, linha: pos[0], coluna: i });
  return pos;
};
const noVeredito = (aba, coluna, texto) => [F.LINHAS[aba].veredito - 1, coluna, texto];
// C6 (Leva 5) — IRMÃ de `noVeredito`, pras abas DIGITADAS que não têm linha
// de veredito nenhuma (`Tarefas`/`Fila`/`Projetos`/`Diário`/`Etapas` — ver
// `F.LINHAS`, a geometria delas é `{nav, vazio, cabecalho, dados,
// congelado}`, sem `veredito`). `.vazio` é a linha mais próxima do topo que
// sobra (logo abaixo da nav) — mesma âncora conceitual, chave diferente.
// Célula compartilhada com `F.estadoVazioFormula` (a mensagem de "nada
// aqui ainda"): nota é metadado da célula, convive sem conflito com o
// valor/fórmula que já mora lá.
const noVazio = (aba, coluna, texto) => [F.LINHAS[aba].vazio - 1, coluna, texto];

const PLANILHA = [
  'RADAR ACADÊMICO — o que é esta planilha.',
  '',
  'Um robô lê o Diário Oficial e a PCI Concursos (concurso de professor) e a Gupy, o ProgramaThor e o We Work Remotely (emprego) todo dia de manhã, grava tudo na aba "' + A.DADOS + '" e estas abas se recalculam sozinhas a partir dela. Nada aqui é preenchido à mão.',
  '',
  'A LINHA 1 DE TODA ABA É A NAVEGAÇÃO: toque num nome e você vai pra lá, sem procurar na tira de abas embaixo. 🏠 Hoje está sempre na primeira célula.',
  '',
  '▶ ' + A.HOJE + ' — o painel do dia: tarefas, fila, projetos, diário e o que entrou no radar.',
  '▶ ' + A.PAINEL + ' — o que dá pra prestar: só o que está aberto ou saiu faz pouco tempo.',
  '▶ ' + A.EMPREGOS + ' — vaga de emprego, a mais recente primeiro.',
  '▶ ' + A.DADOS + ' — a máquina. Não escreva nada lá: é apagada e reescrita todo dia.',
  '',
  'A aba "' + A.TUDO + '" (o arquivo completo dos editais, inclusive os encerrados) está OCULTA — é consulta rara e a barra do celular só mostra ~3 nomes. Pra trazer de volta: botão direito na tira de abas, "Todas as guias".',
  '',
  // Onda 4: "a última coluna" deixou de ser verdade quando "Inscrito" entrou
  // depois de "link (copiar)" — trocado por um apontador que não depende de
  // POSIÇÃO.
  'A coluna "link (copiar)" desta aba: copie de lá e cole na coluna "url" da aba ' + A.FILA + ' — o id se preenche sozinho.',
  '',
  'As contas de dias ("fecha em 16 d") são refeitas contra a data de HOJE toda vez que você abre — não envelhecem junto com a planilha. O que envelhece é a LISTA: se o robô ficar dias sem rodar, o que é novo não aparece e nada nas contas denuncia isso.',
  '',
  'Por isso o robô carimba a data de cada sincronização. Se ele ficar 3 dias úteis sem rodar, aparece um aviso 🛑 no alto desta aba dizendo desde quando — e a linha do aviso fica ROSA, que é a única coisa desta planilha que muda de cor. Some sozinho quando o robô voltar a rodar.'
].join('\n');

const DADOS = [
  'ABA DA MÁQUINA — não escreva aqui.',
  '',
  'O radar APAGA esta aba inteira e reescreve do zero a cada sincronização (uma vez por dia). Qualquer anotação sua some sem aviso na manhã seguinte.',
  '',
  'Uma linha por edital ou vaga, uma coluna por campo. A coluna U (trilha) é o que separa "docente" de "mercado" — é ela que manda cada linha pra aba certa.',
  '',
  'Y1 e Z1, à direita da tabela, são o CARIMBO: a data e a hora da última sincronização. É de lá que sai o aviso 🛑 de planilha desatualizada nas abas de leitura. Se apagar, as três abas passam a dizer que não sabem de quando são.',
  '',
  'O que é pra ler está em ▶ ' + A.PAINEL + ', ▶ ' + A.EMPREGOS + ' e ▶ ' + A.TUDO + '.'
].join('\n');

const CALC = [
  'ABA DE CÁLCULO — oculta de propósito, só fórmula.',
  '',
  'Não é pra ler nem pra editar. A:R monta a trilha docente, V:W é a tabela de siglas das instituições, Y é a lista de feriados nacionais (usada pra contar dias úteis desde a última sincronização) e AA:AK monta a trilha mercado.',
  '',
  'Se algo aqui for apagado, as três abas de leitura ficam vazias. Pra reconstruir tudo: node _norman/construir.js'
].join('\n');

// ------------------------------------ Concursos e Concursos · tudo (mesma forma)
// As notas de coluna da trilha docente valem PRAS DUAS ABAS: desde que
// `Concursos` herdou a forma da trilha (mesmo cabeçalho, mesma ordem, mesmo
// funil), explicar a coluna duas vezes seria a mesma duplicação silenciosa que
// a forma única acabou de eliminar. As notas antigas da `Concursos` composta
// (`Vaga` = UF · órgão · área numa célula só, `Situação` = prazo + titulação
// empilhados) morreram junto com as colunas que elas explicavam.
// --------------------------------------------------------- Concursos · tudo
const T_SITUACAO = [
  'O estado do edital hoje.',
  '',
  '🟢 ABERTO · 🔴 ENCERRADO · ⚠️ SEM PRAZO (o edital não trazia data de inscrição — o radar não achou, e não que ela não exista).',
  '',
  'Esta aba mostra os três. A aba ▶ ' + A.PAINEL + ' esconde os encerrados e os antigos sem prazo.'
].join('\n');

const T_ELEGIBILIDADE = [
  'Se a titulação exigida bate com a sua.',
  '',
  '✅ pode prestar — exige até o que você tem',
  '🎓 só com doutorado — exige doutorado',
  '❓ confirmar titulação — o edital não deixou claro; a decisão é sua, olhando o documento',
  '',
  'Sai do texto do edital, não de cadastro nenhum. Na dúvida o radar diz ❓ em vez de chutar.'
].join('\n');

const T_PRAZO = [
  'A data, e quanto falta pra ela — recontado contra HOJE toda vez que você abre.',
  '',
  'A coluna Situação diz o ESTADO (aberto/encerrado); esta diz o NÚMERO. É por ela que a lista vem ordenada.',
  '',
  'Atenção: aqui "N d" é quanto FALTA. Na aba ▶ ' + A.EMPREGOS + ', a coluna Publicada conta o contrário — quanto tempo JÁ FAZ.'
].join('\n');

const T_AREA = [
  'Área grande, deduzida do texto do edital: Design · UX/IHC · Computação/IA · Outra · ❓ não identificada.',
  '',
  'São cinco baldes fixos, escolhidos pra caber no funil. A descrição exata da vaga está na coluna Subárea.'
].join('\n');

const T_ORGAO = [
  'Instituição + campus.',
  '',
  'A instituição aparece pela sigla que ela mesma usa (UFSCar, UNIFEI, IFFar) quando o radar a conhece; quando não conhece, aparece encurtada ("Univ. Federal de...") em vez de uma sigla inventada.',
  '',
  'O campus é o que distingue linhas do mesmo edital — 15 vagas da mesma universidade em cidades diferentes.'
].join('\n');

const T_SUBAREA = [
  'A descrição fina da vaga, como está no edital.',
  '',
  '— quer dizer que o edital não detalhou.',
  '👁️ confira no edital quer dizer que o radar leu o documento mas não reconheceu o formato da lista de vagas: o que está escrito aqui pode não ser exatamente o desta linha. Abra e confirme.'
].join('\n');

// ----------------------------------------------------------------- Empregos
const E_VAGA = [
  'Quem e o quê, em duas linhas.',
  '',
  'Em cima: a empresa, como ela se chama na Gupy (algumas escrevem slogan no lugar do nome; nomes muito longos aparecem cortados com …).',
  'Embaixo: o assunto da vaga · cidade/UF. Sem cidade = vaga sem local declarado, normalmente remota.'
].join('\n');

const E_PUBLICADA = [
  'Há quanto tempo a vaga foi publicada. É por aqui que a lista vem ordenada.',
  '',
  '🔥 hoje · 🟢 até 7 d · 🟡 8 a 30 d · ⚪ 31 a 90 d · 🗄️ + de 90 d · ❓ sem data',
  '',
  'Cuidado com o falso parecido: aqui o número é IDADE (quanto tempo já faz), não prazo. A Gupy quase nunca publica data de encerramento, então "está no ar" é o que dá pra afirmar — vaga velha pode já ter fechado sem aviso.'
].join('\n');

const E_COMBINA = [
  'O quanto a vaga bate com o que você procura.',
  '',
  '🟩 forte · 🟨 média · ⬜ fraca · ⏳ não pontuada (o radar ainda não julgou esta)',
  '',
  'Sai de uma nota que o radar dá lendo título e descrição contra as suas áreas e palavras-chave. "Forte" é o mesmo corte que decide se você recebe aviso no Telegram — a peça e a notificação concordam de propósito.',
  '',
  'É palpite de máquina, não veredito: use como ordem de leitura, não como filtro definitivo.'
].join('\n');

const E_AREA = [
  'Em qual das suas frentes a vaga cai: IA/Agentes · UX/Produto · Front-end.',
  '',
  'Vem classificada da própria busca — são os três assuntos que o radar procura na Gupy. ❓ não identificada = a vaga entrou por palavra-chave mas não coube em nenhuma.'
].join('\n');

// -------------------------------------------------------------------- CRM
// `Fila`, `Projetos`, `Tarefas` e `Diário` são DIGITADAS por JB/Durin — a
// nota aqui não é "não edite" (ao contrário de `dados`/`_calc`), é "isto
// AQUI é calculado" ou "este número significa isto". `Hoje` é a exceção: é
// puro painel de fórmula, mesma família de `PLANILHA`/`DADOS`/`CALC` acima.
const FILA_ORDEM = [
  'Número que decide a POSIÇÃO na fila — quanto menor, mais no topo.',
  '',
  'É a coluna que a aba "' + A.HOJE + '" lê pra ordenar o bloco 🎯 FILA. Não é data nem contador automático: preencha com um número que reflita prioridade (prazo mais apertado ou item mais importante primeiro é você, ou Durin, quem decide).'
].join('\n');

// O rótulo destas duas encurtou ("última movimentação" -> "movimentou",
// "tarefas abertas" -> "abertas") porque, nas larguras que elas têm, os dois
// rótulos longos renderizavam COLIDINDO — um cortado no meio do marcador de
// nota, o outro invadindo a coluna vizinha, os dois ilegíveis, na linha mais
// lida da tabela. Encurtar é mais barato que alargar e melhora a dobra junto.
// O que o rótulo curto deixa de dizer, a nota diz — e é a primeira linha dela.
const PROJETOS_ULTIMA_MOV = [
  'ÚLTIMA MOVIMENTAÇÃO · CALCULADA — não digite aqui.',
  '',
  'Data do registro mais recente na aba "' + A.DIARIO + '" cuja coluna "' + F.DIARIO_ROTULO_SOBRE + '" bate com o nome exato desta linha (coluna A).',
  '',
  '"' + F.PROJETOS_MOVIMENTOU_NUNCA + '" quer dizer que o Diário está vazio. "' + F.PROJETOS_MOVIMENTOU_ORFAO + '" (Onda UX 10) quer dizer o contrário do que a versão antiga desta nota dizia: o Diário TEM entradas — só nenhuma vinculada a este projeto ainda.'
].join('\n');

const PROJETOS_TAREFAS_ABERTAS = [
  'TAREFAS ABERTAS · CALCULADA — não digite aqui.',
  '',
  'Conta as linhas da aba "' + A.TAREFAS + '" que têm esta linha (coluna A) como projeto e estágio diferente de "✅ feita".'
].join('\n');

const DIARIO_QUEM = [
  'A VOZ desta entrada: "Durin" (fato — etapa concluída, o que mudou) ou "JB" (leitura, discordância, decisão).',
  '',
  'O Diário é histórico de DECISÃO, não só de execução — quem fala faz parte do registro, e as duas vozes têm peso visual diferente na tela (a de JB pesa mais: a planilha é dele).',
  '',
  'É esta coluna que aparece no bloco 📓 DIÁRIO da aba "' + A.HOJE + '", junto com o que aconteceu.'
].join('\n');

const DIARIO_RESPONDE_A = [
  'Aponta pro NÚMERO DA LINHA de outra entrada deste Diário — o número que aparece na régua do próprio Sheets, à esquerda.',
  '',
  'É isso que transforma dois relatos paralelos em CONVERSA: uma entrada de JB pode responder direto a uma de Durin. Deixe vazio se a entrada não responde a nenhuma outra.',
  '',
  'A coluna "contexto da resposta" (a seguir) resolve esse número sozinha — não precisa copiar nada, só olhar.'
].join('\n');

const DIARIO_CONTEXTO_RESPOSTA = [
  'CALCULADA — não digite aqui.',
  '',
  'Resolve "responde a" pro contexto da entrada apontada: voz, data e o começo do que foi dito — pra ler as duas entradas juntas sem rolar a tela.'
].join('\n');

const DIARIO_SOBRE = [
  'De qual PROJETO é esta entrada (a CHAVE, não o assunto em prosa) — escolha na lista, não digite.',
  '',
  'A aba "' + A.PROJETOS + '" procura aqui pelo nome EXATO do projeto pra saber a última movimentação dele. Um acento a menos ou um espaço sobrando faz a entrada nunca aparecer lá — e não dá erro nenhum na tela, ela só some.',
  '',
  'A lista suspensa existe justamente pra isso. Se o projeto ainda não existe, cadastre em "' + A.PROJETOS + '" antes. Se a entrada legitimamente não é sobre projeto nenhum, o painel de "' + A.PROJETOS + '" avisa quantas entradas do Diário estão nesse estado — não é erro silencioso.'
].join('\n');

const FILA_ID = [
  'CALCULADA — não digite aqui.',
  '',
  'O id sai sozinho da coluna "url": o radar procura essa mesma url na aba "' + A.DADOS + '" e traz o identificador dela. É o número que sobrevive ao apaga-e-reescreve que o robô faz todo dia, então é por ele que dá pra reencontrar a vaga daqui a três meses.',
  '',
  '"— fora do radar —" não é erro: quer dizer que essa url não veio do radar. Uma candidatura que você achou sozinho vale igual; ela só não tem id.',
  '',
  'Digitar aqui apaga a fórmula da coluna INTEIRA, não só desta célula.'
].join('\n');

const FILA_OQUE = [
  'CALCULADA — não digite aqui.',
  '',
  'Sai sozinha da "url", igual ao "id": o radar procura a vaga na aba "' + A.DADOS + '" e traz a área/subárea dela.',
  '',
  '"— fora do radar —" não é erro — quer dizer que essa url não veio do radar. Use a coluna "notas" pra descrever uma candidatura achada por fora.',
  '',
  'Digitar aqui apaga a fórmula da coluna INTEIRA, não só desta célula.'
].join('\n');

const FILA_TRILHA = [
  'CALCULADA — não digite aqui.',
  '',
  'Sai sozinha da "url" (docente/mercado). "outro" quer dizer que a url não veio do radar — mesmo caso de "— fora do radar —" em "o quê".',
  '',
  'Digitar aqui apaga a fórmula da coluna INTEIRA, não só desta célula.'
].join('\n');

const FILA_PARADA_HA = [
  'CALCULADA — não digite aqui. Dias corridos desde "atualizado em".',
  '',
  'É o SLA: acende quando passa de ' + F.FILA_SLA_DIAS + ' dias sem você tocar na linha. Toque "atualizado em" (mude a data) sempre que mexer no estágio — é o que zera o relógio.'
].join('\n');

const PROJETOS_ETAPA_ATUAL = [
  'CALCULADA — não digite aqui.',
  '',
  'A primeira etapa NÃO concluída deste projeto na aba "' + A.ETAPAS + '", por ordem. "— sem etapa cadastrada —" quer dizer que o projeto ainda não foi quebrado em marcos; "✅ todas as etapas concluídas" é notícia boa, não erro.'
].join('\n');

const PROJETOS_PROGRESSO = [
  'CALCULADA — não digite aqui. "N de M" etapas concluídas, contra a aba "' + A.ETAPAS + '".',
  '',
  '"—" só quando não há etapa cadastrada nenhuma — com 0 de M, o número aparece (é informação, não ausência dela).'
].join('\n');

const PROJETOS_SAUDE = [
  'CALCULADA — não digite aqui. Acesa por REGRA, nunca digitada.',
  '',
  '🔴 atrasado: o prazo do projeto (coluna "prazo") já passou. ⚪ sem sinal (D-A1): nenhuma etapa cadastrada E nenhuma entrada do Diário vinculada — ausência de dado, não "parado". 🔴 parado: sem movimentação no "' + A.DIARIO + '" há ' + F.PROJETOS_SAUDE_PARADO_DIAS_UTEIS + ' dias úteis ou mais (com dado real disponível). 🟠 sem rumo: nenhuma tarefa aberta e nenhuma etapa "🔨 em curso". 🟢 em dia: nenhum dos anteriores. "—": projeto "✅ entregue" — saúde não se aplica a frente encerrada.',
  '',
  'Se isto acender errado, o problema está na REGRA (formulas.js), nunca na linha — não existe "corrigir a mão".'
].join('\n');

const PROJETOS_PROXIMAS_TAREFAS = [
  'CALCULADA — não digite aqui.',
  '',
  'As 3 tarefas ainda não feitas deste projeto, a mais urgente primeiro (as sem prazo vão pro fim, não somem). Sai da aba "' + A.TAREFAS + '", pelas linhas cuja coluna "projeto" bate com o nome desta linha.',
  '',
  '"—" quer dizer que não há tarefa aberta pendurada neste projeto.'
].join('\n');

const PROJETOS_ULTIMAS_MOVS = [
  'CALCULADA — não digite aqui.',
  '',
  'As 2 entradas mais recentes da aba "' + A.DIARIO + '" sobre este projeto, no formato "dd/mm — o que aconteceu".',
  '',
  'O Diário cresce pra baixo pra sempre (nada é reescrito), então ler "o que aconteceu por último" lá exigiria rolar até o fim. É esta coluna que responde isso sem rolar.'
].join('\n');

const LINK_COPIAR = [
  'O endereço da vaga em TEXTO, pra copiar.',
  '',
  'A coluna "Abrir" (na frente) leva você até lá; esta aqui é pra CAPTURAR: copie e cole na coluna "url" da aba "' + A.FILA + '". O id, e o resto do que o radar sabe, se resolvem sozinhos a partir dela.',
  '',
  'Fica na última coluna de propósito: copiar link é decisão deliberada, e o começo da linha pertence ao que você lê num relance.'
].join('\n');

const HOJE_PAINEL = [
  'PAINEL — nada aqui se digita.',
  '',
  'Toda esta aba é fórmula, puxando de "' + A.TAREFAS + '", "' + A.FILA + '", "' + A.PROJETOS + '", "' + A.DIARIO + '" e da aba do radar. Editar uma célula aqui não muda as abas de origem — só apaga a fórmula local até a próxima reconstrução (node _norman/construir.js).',
  '',
  'Os ' + F.HOJE_BLOCOS.length + ' títulos de seção (' + Object.values(F.HOJE_BLOCO_GLIFO).join(' ') + ') são LINKS: toque num e você cai na aba de origem daquele bloco. A linha "+ N não cabem aqui" também é link.',
  '',
  'O painel tem a altura do que existe: um bloco com duas linhas ocupa duas linhas. Se um bloco está vazio, ele mostra o que fazer pra deixar de estar.',
  '',
  'Para editar de verdade, vá direto à aba de origem.'
].join('\n');

// ---- camada notícia ----
// A célula do carimbo, DERIVADA da referência que a fórmula usa. Escrever
// "Y1" aqui seria uma terceira cópia da mesma coordenada (a primeira é
// `lib/sheets.js CELULA_CARIMBO`, a segunda é `F.CARIMBO_NOTICIA`), e a nota
// é justamente a cópia que ninguém confere — ela continuaria explicando a
// célula antiga sem quebrar nada.
const CELULA_CARIMBO_NOTICIA = F.CARIMBO_NOTICIA.split('!')[1].replace(/\$/g, '');
// Onda 8-9 — o SELETOR saiu (JB pediu tabelas SEMPRE visíveis, não uma
// trocada por toque; ver formulas.js "as QUATRO FAIXAS"). A nota que morava
// na célula do controle vira a nota do VEREDITO (linha 2): é o primeiro
// texto que JB lê ao abrir a aba, e explica a estrutura das quatro tabelas +
// a coluna `tema` + o funil, sem custar linha nem pixel.
//
// C10 Parte 2 — as quatro tabelas deitaram: eram empilhadas numa coluna só
// (Onda 8-9), agora ficam LADO A LADO ("1×4 em linha", decisão de JB). O
// texto passa a dizer isso, e ganha a quarta janela (`hoje`/15d).
const NOTICIA_VEREDITO_NOTA = [
  'QUATRO TABELAS, lado a lado, sempre visíveis: notícias de hoje, top 20 dos últimos 7, 15 e 30 dias.',
  '',
  'Cada uma ordena por RELEVÂNCIA (repercussão + o quanto o assunto casa com o seu perfil), não por data. Uma notícia de 2 veículos pode aparecer acima de uma de 5 — ela fala mais de você.',
  '',
  'Uma mesma notícia NUNCA repete entre as quatro tabelas: quem aparece em "hoje" some das outras três até sair da janela (cascata calculada no robô, não na planilha).',
  '',
  'A coluna "tema" é FILTRÁVEL: toque no funil no alto de cada tabela pra ver só um assunto. Com até 20 vagas por tabela, os temas de uma aba COMPETEM entre si — um tema de menor volume pode ficar de fora do top 20 sem o funil. Filtrar uma tabela não mexe nas outras três.',
  '',
  'No celular, as quatro tabelas exigem rolagem horizontal — é a troca que JB escolheu por ter as quatro visíveis de uma vez, sem trocar de tela.',
  '',
  'O que não cabe no top 20 é contado na linha logo abaixo da tabela — nunca some sem dizer.',
  '',
  'Se uma tabela aparece com "🆕 o radar é novo", é honesto: o store de notícia começou a existir há pouco tempo e aquela janela ainda não tem histórico suficiente — não é sinal de que a coleta parou.'
].join('\n');

const NOTICIA_TITULO = [
  'O TÍTULO QUE O VEÍCULO PUBLICOU, sem uma palavra a mais.',
  '',
  'Sem resumo: o radar não gera texto sobre a notícia, só a entrega.',
  '',
  'Pra abrir a matéria, toque em "' + F.NOTICIA_COL_ABRIR + '", na coluna à esquerda desta tabela.',
  '',
  'O prefixo ' + F.GLIFO_REPERCUSSAO + ' marca fato que mais de um veículo publicou — quanto mais veículos, mais a notícia sobe na ordem da tabela.'
].join('\n');

const NOTICIA_ABRIR = [
  'ABRE A MATÉRIA no site do veículo.',
  '',
  'Fica na primeira coluna DESTA tabela — cada uma das quatro tem a sua própria, pelo mesmo motivo que em 💼 Empregos e 🎓 Concursos: abrir é a ação inteira desta aba, e ação não pode custar um arrasto lateral.',
  '',
  'Vazia nas linhas que não são notícia (título de tabela, aviso de lista vazia, contagem do que não coube).'
].join('\n');

const NOTICIA_QUANDO = [
  'QUANDO A MATÉRIA FOI PUBLICADA (não quando o radar a viu).',
  '',
  '"hoje 14:32" e "ontem" nos dois primeiros dias; "dd/mm" no resto. A conta é refeita contra a data de HOJE toda vez que você abre.'
].join('\n');

const NOTICIA_TEMA = [
  'O ASSUNTO desta notícia dentro da aba (Brasil, mundo, IA, Claude, Reddit/HN...).',
  '',
  'Com até 20 vagas por tabela, os temas de uma aba COMPETEM entre si pelo top 20 — o de maior volume no store pode dominar. Toque no funil no alto da tabela e filtre por um tema só pra achar o que ficou de fora.'
].join('\n');

const NOTICIA_DADOS = [
  'ABA DA MÁQUINA — não escreva aqui.',
  '',
  'Espelho de data/noticias.jsonl. É APAGADA e reescrita inteira a cada `node noticias.js sincronizar-sheets`. Qualquer anotação sua some na sincronização seguinte.',
  '',
  'Uma linha por notícia, na ordem de coluna: ' + F.NOTICIA_FATO_CABECALHO.join(' · ') + '.',
  '',
  'A coluna "quando" é NÚMERO (data-hora do Sheets), não texto: é o que permite às abas de leitura filtrar e ordenar por data sem ambiguidade de formato.',
  '',
  F.nfLetra(F.NOTICIA_FATO_CABECALHO[F.NOTICIA_FATO_CABECALHO.length - 1]) + ' é a última coluna de dado; ' + CELULA_CARIMBO_NOTICIA + ' e a vizinha, bem à direita, são o CARIMBO da última sincronização. É de lá que sai o aviso 🛑 de coleta parada nas quatro abas de notícia.',
  '',
  'O que é pra ler está em ▶ ' + A.NOTICIAS + ', ▶ ' + A.IA + ', ▶ ' + A.TRABALHO + ' e ▶ ' + A.CIENCIA + '.'
].join('\n');

// ===========================================================================
// C6 (Leva 5) — LEGENDA DE SINAL, por aba
// ===========================================================================
//
// O que cada glifo/cor significa NAQUELA aba — vocabulário LOCAL, não um
// glossário geral (esse mora no README, gerado a partir DESTE MESMO objeto
// — `_norman/gerar-readme.js` importa `SINAL_LOCAL` daqui, nunca reescreve
// o texto: uma fonte, duas superfícies). Cada entrada é montada a partir
// das CONSTANTES de vocabulário que `formulas.js` já declara (nunca um
// glifo redigitado à mão) — divergir a nota do que a coluna de fato usa
// seria o mesmo defeito que "Instrumento que ninguém testa..." já cobre
// noutro lugar desta casa: a legenda mentindo sobre o sinal que ela
// descreve.
const jp = arr => arr.join(' · ');
const SINAL_LOCAL = {
  [A.HOJE]: 'Os glifos no início do título de cada bloco dizem a ORIGEM dele: '
    + jp(Object.entries(F.HOJE_BLOCO_GLIFO).map(([chave, g]) => g + ' ' + chave.toLowerCase())) + '. '
    + 'Texto verde-escuro sublinhado é link (toca e vai pra aba de origem); texto cinza é meta (estado vazio ou "+ N não cabem aqui").',
  // Elegível?/Situação/Publicada/Combina? repetem, em resumo, o MESMO
  // vocabulário já detalhado nas notas de coluna T_ELEGIBILIDADE/T_SITUACAO/
  // E_PUBLICADA/E_COMBINA (abaixo) — aqui é o resumo consolidado que fecha
  // "todo sinal desta aba", lá é a explicação funda de UMA coluna.
  [A.PAINEL]: 'Elegível? — ✅ pode prestar · ❓ confirmar titulação · 🎓 só com doutorado. '
    + 'Situação — 🟢 aberto · 🔴 encerrado · ⚠️ sem prazo. '
    + '❌ (C1) — você marcou "não me interessa"; a linha esmaece e sai da contagem "N ABERTA(S) que você pode prestar".',
  [A.EMPREGOS]: 'Publicada — 🔥 hoje · 🟢 até 7 d · 🟡 8 a 30 d · ⚪ 31 a 90 d · 🗄️ + de 90 d · ❓ sem data. '
    + 'Combina? — 🟩 forte · 🟨 média · ⬜ fraca · ⏳ não pontuada. '
    + '❌ (C1) — você marcou "não me interessa"; a linha esmaece.',
  [A.TAREFAS]: 'estágio — ' + jp(F.TAREFAS_ESTAGIOS) + ' (feita recua o texto: já resolvida, não compete por atenção). '
    + 'esforço — ' + jp(F.TAREFAS_ESFORCOS) + ' (P pequeno · M médio · G grande). Fundo rosa = prazo vencido; fundo âmbar = vence em ≤ 2 dias.',
  [A.FILA]: 'estágio — ' + jp(F.FILA_ESTAGIOS) + ' (recusado/descartado recuam o texto — já resolvidos). '
    + '⭐ (C3) — ' + jp(F.PRIORIDADE_JB) + ': seu juízo, não o score do robô.',
  [A.CANDIDATURAS]: 'estágio (funil, C2) — ' + jp(F.CANDIDATURAS_ESTAGIOS) + ' ("não passou" recua o texto). '
    + '⭐ (C3) — ' + jp(F.PRIORIDADE_JB) + ': seu juízo, não o score do robô. '
    + '"por quê" (C4) — o pós-morte: por que fechou assim, preenchido ao fim do processo. '
    + 'Fundo rosa = aguardando há mais de ' + F.CANDIDATURAS_LIMIAR_AGUARDANDO_DIAS + ' dias sem novidade.',
  [A.PROJETOS]: 'estágio — ' + jp(F.PROJETOS_ESTAGIOS) + '. saúde (calculada) — 🔴 atrasado/parado · 🟠 sem rumo · '
    + '🟢 em dia · ⚪ sem sinal (nenhum dado ainda — nunca "parado" por omissão, D-A1) · "—" (entregue, não se aplica).',
  [A.DIARIO]: 'voz — ' + jp(F.DIARIO_QUEM) + '. Fundo N1 + negrito = entrada de JB (a planilha é dele, a voz dele pesa mais); sem fundo = Durin.',
  [A.ETAPAS]: 'estado — ' + jp(F.ETAPAS_ESTADOS) + '.',
  ...Object.fromEntries(A.VISTAS_NOTICIA.map(aba => [aba,
    F.GLIFO_REPERCUSSAO + ' no início do título — mais de um veículo publicou o mesmo fato (repercussão); sem o glifo, fonte única.'
  ]))
};

// Célula (linha 0-based, coluna 0-based) -> texto, por aba. As posições vêm
// de `F.LINHAS` via os dois helpers do topo — nenhum índice literal.
const NOTAS = {
  // `Concursos` e `Concursos · tudo` compartilham a MESMA forma agora, então
  // compartilham as mesmas notas de coluna. Só a nota-mãe da planilha e a de
  // `link (copiar)` ficam na `Concursos`, que é a visível.
  [A.PAINEL]: [
    // C6 — a legenda de sinal LOCAL entra como segundo parágrafo da MESMA
    // nota-mãe (mesma célula, `noVeredito` não admite duas notas na mesma
    // posição — ver o comentário grande de `noCabecalho`, acima).
    noVeredito(A.PAINEL, 0, PLANILHA + '\n\n— — —\n' + SINAL_LOCAL[A.PAINEL]),
    noCabecalho(A.PAINEL, 'Vaga', T_ORGAO), noCabecalho(A.PAINEL, 'Situação', T_SITUACAO),
    noCabecalho(A.PAINEL, 'Elegível?', T_ELEGIBILIDADE), noCabecalho(A.PAINEL, 'Área', T_AREA),
    noCabecalho(A.PAINEL, 'Prazo', T_PRAZO), noCabecalho(A.PAINEL, 'Subárea', T_SUBAREA),
    noCabecalho(A.PAINEL, 'link (copiar)', LINK_COPIAR)
  ],
  [A.TUDO]: [
    noCabecalho(A.TUDO, 'Vaga', T_ORGAO), noCabecalho(A.TUDO, 'Situação', T_SITUACAO),
    noCabecalho(A.TUDO, 'Elegível?', T_ELEGIBILIDADE), noCabecalho(A.TUDO, 'Área', T_AREA),
    noCabecalho(A.TUDO, 'Prazo', T_PRAZO), noCabecalho(A.TUDO, 'Subárea', T_SUBAREA),
    noCabecalho(A.TUDO, 'link (copiar)', LINK_COPIAR)
  ],
  [A.EMPREGOS]: [
    // C6 — `Empregos` não tinha nota-mãe (nenhum `noVeredito`); a legenda
    // de sinal vira a primeira.
    noVeredito(A.EMPREGOS, 0, SINAL_LOCAL[A.EMPREGOS]),
    noCabecalho(A.EMPREGOS, 'Vaga', E_VAGA), noCabecalho(A.EMPREGOS, 'Publicada', E_PUBLICADA),
    noCabecalho(A.EMPREGOS, 'Combina?', E_COMBINA), noCabecalho(A.EMPREGOS, 'Área', E_AREA),
    noCabecalho(A.EMPREGOS, 'link (copiar)', LINK_COPIAR)
  ],
  [A.DADOS]: [[0, 0, DADOS]],
  [A.CALC]: [[0, 0, CALC]],
  [A.HOJE]: [[F.LINHAS[A.HOJE].veredito - 1, 0, HOJE_PAINEL + '\n\n— — —\n' + SINAL_LOCAL[A.HOJE]]],
  [A.FILA]: [
    // C6 — `Fila` não tem linha de veredito (geometria `{nav,vazio,
    // cabecalho,dados,congelado}`); a âncora é `noVazio` (irmã de
    // `noVeredito`, mesma posição conceitual — ver o comentário no helper).
    noVazio(A.FILA, 0, SINAL_LOCAL[A.FILA]),
    noCabecalho(A.FILA, 'id', FILA_ID), noCabecalho(A.FILA, 'ordem', FILA_ORDEM),
    noCabecalho(A.FILA, 'o quê', FILA_OQUE), noCabecalho(A.FILA, 'trilha', FILA_TRILHA),
    noCabecalho(A.FILA, 'parada há', FILA_PARADA_HA)
  ],
  [A.PROJETOS]: [
    noVazio(A.PROJETOS, 0, SINAL_LOCAL[A.PROJETOS]),
    noCabecalho(A.PROJETOS, 'movimentou', PROJETOS_ULTIMA_MOV), noCabecalho(A.PROJETOS, 'abertas', PROJETOS_TAREFAS_ABERTAS),
    noCabecalho(A.PROJETOS, 'próximas tarefas', PROJETOS_PROXIMAS_TAREFAS), noCabecalho(A.PROJETOS, 'últimas movimentações', PROJETOS_ULTIMAS_MOVS),
    noCabecalho(A.PROJETOS, 'etapa atual', PROJETOS_ETAPA_ATUAL), noCabecalho(A.PROJETOS, 'progresso', PROJETOS_PROGRESSO),
    noCabecalho(A.PROJETOS, 'saúde', PROJETOS_SAUDE)
  ],
  [A.DIARIO]: [
    noVazio(A.DIARIO, 0, SINAL_LOCAL[A.DIARIO]),
    noCabecalho(A.DIARIO, 'voz', DIARIO_QUEM), noCabecalho(A.DIARIO, F.DIARIO_ROTULO_SOBRE, DIARIO_SOBRE),
    noCabecalho(A.DIARIO, 'responde a', DIARIO_RESPONDE_A), noCabecalho(A.DIARIO, 'contexto da resposta', DIARIO_CONTEXTO_RESPOSTA)
  ],
  // C6 — `Tarefas`/`Candidaturas`/`Etapas` nunca tinham nota nenhuma
  // (nem de coluna, nem de veredito/vazio). A legenda de sinal é a
  // primeira. `Candidaturas` TEM linha de veredito de verdade (nasce de
  // `_estado`, geometria de VISTA) — `noVeredito`, não `noVazio`.
  [A.TAREFAS]: [noVazio(A.TAREFAS, 0, SINAL_LOCAL[A.TAREFAS])],
  [A.CANDIDATURAS]: [noVeredito(A.CANDIDATURAS, 0, SINAL_LOCAL[A.CANDIDATURAS])],
  [A.ETAPAS]: [noVazio(A.ETAPAS, 0, SINAL_LOCAL[A.ETAPAS])],
  // As quatro vistas de notícia têm a MESMA forma, então têm as mesmas
  // notas de coluna — geradas do mesmo jeito pras quatro, em vez de quatro
  // listas quase iguais que derivariam com o tempo. A nota do SELETOR é a
  // única que fica em célula que não é de cabeçalho: ela explica o controle,
  // e explicação de controle mora no controle.
  // As notas de coluna ancoram na PRIMEIRA ocorrência do rótulo (tabela 0 —
  // "hoje"): as quatro tabelas compartilham o mesmo vocabulário de coluna,
  // uma explicação por aba basta (repeti-la 4× seria ruído, a mesma lição
  // que tirou a coluna `repercussão`).
  ...Object.fromEntries(A.VISTAS_NOTICIA.map(aba => [aba, [
    // C6 — a legenda de sinal (📣 repercussão) entra como segundo
    // parágrafo da MESMA nota-mãe, igual ao padrão de `Concursos`/`Hoje`.
    noVeredito(aba, 0, NOTICIA_VEREDITO_NOTA + '\n\n— — —\n' + SINAL_LOCAL[aba]),
    noCabecalho(aba, F.NOTICIA_COL_ABRIR, NOTICIA_ABRIR),
    noCabecalho(aba, 'título', NOTICIA_TITULO),
    noCabecalho(aba, 'quando', NOTICIA_QUANDO),
    noCabecalho(aba, 'tema', NOTICIA_TEMA)
  ]])),
  [A.NOTICIAS_DADOS]: [[0, 0, NOTICIA_DADOS]]
};

// Texto da faixa protegida. Aparece na lista de "intervalos protegidos" e é o
// que a planilha tem a dizer sobre POR QUE o aviso apareceu.
const GERADA = 'Aba gerada por fórmula. O que você digitar aqui apaga a fórmula e some na próxima vez que o radar for reconstruído.';
// Onda 4 — as três abas do radar de vaga ganham a MESMA exceção que as
// vistas de notícia já tinham: a coluna "Inscrito" é pra ser tocada, e
// `formatar.js` a deixa de fora da faixa protegida (ver `naoProtegidas`).
// C1 (Leva 5) — "❌" entra na MESMA exceção: é o segundo checkbox desta
// aba (o "não me interessa"), mesmo mecanismo de leitura/devolução de
// `Inscrito`.
const GERADA_COM_INSCRITO = GERADA
  + ' EXCEÇÃO: as colunas "Inscrito" e "❌" são os dois checkboxes desta aba e são pra ser tocados — marcar/desmarcar não apaga nada; '
  + 'os valores são lidos pelo build antes de reconstruir e devolvidos à linha certa depois (aba oculta "' + A.ESTADO + '" guarda a memória).';
// Onda 5 — `Candidaturas` é HÍBRIDA: A:F nasce de `_estado` (mesma classe
// GERADA das outras), G:I (estágio/próximo passo/notas) são pra JB digitar.
// Mesmo mecanismo da exceção acima, só que com TRÊS colunas em vez de uma —
// `naoProtegidas` (formatar.js) devolve a faixa G:L inteira.
// LEVA 5 (C3/C4) — "⭐" e "por quê" entram na MESMA exceção, apendadas ao
// fim (mesmo mecanismo de estágio/próximo passo/notas). LEVA 7 — "link
// retomada" apendado por último, mesmo mecanismo, sexto campo da exceção.
const GERADA_COM_CANDIDATURA = GERADA
  + ' EXCEÇÃO: "estágio", "próximo passo", "notas", "⭐", "por quê" e "link retomada" são pra JB digitar — nada ali apaga fórmula nenhuma; '
  + 'os seis são lidos pelo build antes de reconstruir e devolvidos à linha certa depois (aba oculta "' + A.ESTADO + '" guarda a memória).';
const PROTECAO = {
  [A.PAINEL]: GERADA_COM_INSCRITO,
  [A.TUDO]: GERADA_COM_INSCRITO,
  [A.EMPREGOS]: GERADA_COM_INSCRITO,
  [A.DADOS]: 'Aba da máquina: apagada e reescrita inteira a cada sincronização do radar (uma vez por dia). Nada escrito aqui sobrevive até amanhã.',
  [A.CALC]: 'Aba de cálculo. Apagar qualquer coisa aqui deixa as três abas de leitura vazias.',
  // Só `Hoje` entra aqui na camada CRM: `Fila`/`Projetos`/`Tarefas`/`Diário`
  // são DIGITADAS de propósito — proteger com aviso ali mandaria a mensagem
  // errada ("cuidado ao editar") numa aba cujo único papel é ser editada.
  [A.HOJE]: GERADA,
  // `Candidaturas` (Onda 5) É a exceção dentro da exceção: diferente das
  // quatro digitadas acima, A:F nasce de fórmula (`_estado`) — então ela
  // entra aqui, com a variante de aviso que abre espaço pra G:I.
  [A.CANDIDATURAS]: GERADA_COM_CANDIDATURA,
  // As quatro vistas de notícia são geradas por fórmula como as de radar,
  // sem exceção nenhuma (Onda 8-9 — o seletor de recorte que era a única
  // célula digitável desta aba saiu: JB pediu as tabelas — quatro, desde
  // C10 — sempre visíveis, não um controle pra trocar entre elas).
  ...Object.fromEntries(A.VISTAS_NOTICIA.map(aba => [aba, GERADA])),
  [A.NOTICIAS_DADOS]: 'Aba da máquina: apagada e reescrita inteira a cada sincronização de notícia. Nada escrito aqui sobrevive à próxima coleta.',
  // Onda 3 — `_estado` é a fonte da verdade do check "Inscrito", NÃO cache:
  // ao contrário de `_calc`/`dados (não edite)`, apagar esta aba apaga a
  // ÚNICA cópia do que JB marcou (a vista é só espelho). Escrita pelo
  // próprio build (`passoColher`/`passoRestaurar`, ver `_norman/estado.js`).
  [A.ESTADO]: 'Fonte da verdade do check "Inscrito" (Concursos/Empregos). Escrita pelo build — não por sync. '
    + 'Ao contrário de `_calc`, esta aba NÃO é cache: apagá-la apaga a única memória do que foi marcado.'
};

// C6 — `SINAL_LOCAL` exportado pra `gerar-readme.js` montar o glossário
// geral a partir da MESMA fonte, nunca reescrevendo o texto (uma fonte,
// duas superfícies).
module.exports = { NOTAS, PROTECAO, ANCORAS, SINAL_LOCAL };
