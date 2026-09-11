'use strict';
// NOME DAS ABAS — o rótulo mais barato e mais visto da planilha inteira.
//
// A barra de abas é a única coisa que JB lê ANTES de decidir onde entrar, e no
// celular ela mostra ~3 nomes. Os nomes antigos (`Painel`, `Tudo`) diziam o
// FORMATO e escondiam o ASSUNTO: "Painel" e "Tudo" de quê? Só o texto DENTRO
// da aba revelava que era concurso de professor — e com `Empregos` ao lado, a
// barra virou ambígua justamente no ponto em que a decisão é tomada. Nome de
// aba custa zero linha e zero pixel de conteúdo: é o único lugar onde explicar
// não compete com a lista.
//
//   Concursos          — o que dá pra prestar (abertos + sem data recente)
//   Empregos           — trilha mercado
//   Concursos · tudo   — o arquivo completo da trilha docente
//   dados (não edite)  — a máquina escreve, apagada e reescrita todo dia
//   _calc              — oculta; o `_` já é a convenção de "interno"
//
// `Concursos` e `dados (não edite)` NÃO são declarados aqui: vêm de
// `lib/sheets.js`, que é quem `garantirAbas()` consulta de madrugada. Ver a
// nota lá — a divergência entre os dois arquivos é o modo de falha silencioso
// que essa importação torna impossível.
//
// CAMADA CRM (portada da planilha pro gerador — briefing "refaça nos padrões
// do norman"). Mesmo critério de nome acima, e mesmo cuidado: eram abas
// criadas à mão, direto por API, e o nome de cada uma já respondia à mesma
// pergunta ("o que eu abro pra quê?") antes de qualquer texto por dentro.
//
//   Hoje       — painel do dia: o que vence, a fila, os projetos, o que é
//                novo no radar. É a PRIMEIRA coisa que JB deveria olhar; fica
//                sozinha na barra porque não compete por nome com nada.
//   Fila       — vagas/editais que JB decidiu perseguir (curadoria manual,
//                não é o radar bruto): uma linha por candidatura em curso.
//   Projetos   — as frentes vivas de JB, sem ligação com concurso/emprego.
//   Tarefas    — ações concretas, cada uma amarrada (ou não) a um projeto.
//   Diário     — registro de decisão: quem decidiu o quê e por quê, ao
//                longo do tempo. É o que a coluna calculada de `Projetos`
//                consulta pra saber a "última movimentação" de cada frente.
//
// Nenhuma delas tem nome legado: nasceram direto com o nome atual (criadas à
// mão por API antes desta Onda), então `LEGADAS` entra vazio pras cinco — mas
// entra, porque o loop de renomeio e a guarda de órfão em `construir.js`
// iteram `Object.keys(LEGADAS)` pra saber quais abas são canônicas.
const path = require('path');
const sheets = require(path.join(__dirname, '..', 'lib', 'sheets'));

const PAINEL = sheets.ABA_PAINEL;
const DADOS = sheets.ABA_DADOS;
const TUDO = 'Concursos · tudo';
const EMPREGOS = 'Empregos';
const CALC = '_calc';
// ONDA 3 — a memória do check "Inscrito" que sobrevive à reescrita diária de
// `Concursos`/`Empregos`. OCULTA, no mesmo espírito de `_calc`: o `_` já é a
// convenção de "interno" desta planilha. Ver o bloco de comentário grande em
// `_norman/estado.js` para o desenho completo (por que ela existe, como o
// build a lê e escreve, e por que ela NUNCA entra no `limpar()` de
// `construir.js` — é o oposto de `_calc`: `_calc` é cache que pode ser
// apagado e recalculado a qualquer momento; `_estado` é a única cópia do que
// JB marcou.
const ESTADO = '_estado';

// CAMADA NOTÍCIA (Fase B). Mesma arquitetura de duas camadas que a trilha
// vaga já tem, com a fonte trocada:
//
//   `dados (não edite)` : `_calc` : Concursos/Empregos
//   `notícias (não edite)`        : Notícias/IA/Trabalho/Ciência
//
// Não há `_calc` de notícia porque não há o que derivar em fórmula: o
// pipeline (`lib-noticias/`) já entrega cluster, n_veiculos e score
// calculados, e o sync grava a linha pronta. `_calc` existe na trilha vaga
// porque lá as colunas de leitura são COMPOSTAS a partir do store cru; aqui
// a composição já aconteceu em Node, contra o dado inteiro, e repeti-la em
// fórmula seria uma segunda implementação da mesma conta.
//
//   Notícias  — Brasil e mundo (política, economia, geopolítica)
//   IA        — IA geral, ferramentas, Claude, Reddit/HN
//   Trabalho  — mercado de trabalho e concursos, COMO NOTÍCIA (não é vaga:
//               vaga vive em `Empregos`/`Concursos`; a própria linha 2 da
//               aba diz isso, porque o nome sozinho não distingue)
//   Ciência   — artigos científicos e o mundo acadêmico
//
// Os quatro nomes são o pedido literal de JB. `Trabalho` colide de perto com
// `Empregos`/`Concursos` na barra — está registrado no relatório desta Onda
// como observação, não corrigido por conta própria.
const NOTICIAS = 'Notícias';
const IA = 'IA';
const TRABALHO = 'Trabalho';
const CIENCIA = 'Ciência';
// A aba de FATO da trilha notícia. OCULTA, no espelho exato de
// `dados (não edite)`: a máquina escreve, ninguém lê, o nome já avisa.
//
// O NOME NÃO É DECLARADO AQUI — vem de `noticias.js`, que é quem cria a aba e
// escreve nela, exatamente como `dados (não edite)` vem de `lib/sheets.js`.
// Ver a nota lá: a divergência entre os dois arquivos é o modo de falha
// silencioso que essa importação torna impossível (o sync criaria uma segunda
// aba ao lado da de verdade e as fórmulas continuariam lendo a antiga).
const NOTICIAS_DADOS = require(path.join(__dirname, '..', 'noticias')).ABA_FATO;

// Ordem canônica das quatro vistas — uma fonte para a barra de abas, para a
// navegação entre elas e para os laços de construção/formatação.
const VISTAS_NOTICIA = [NOTICIAS, IA, TRABALHO, CIENCIA];

const HOJE = 'Hoje';
const FILA = 'Fila';
const PROJETOS = 'Projetos';
const TAREFAS = 'Tarefas';
// ONDA 5 — o funil DEPOIS da inscrição. `Fila` é curadoria manual (JB digita
// tudo); `Candidaturas` é o oposto: NASCE sozinha de `_estado` (uma linha
// por url com `inscrito=true` — ver `_norman/estado.js`), e só o que
// nenhuma máquina pode saber (`estágio`, `próximo passo`, `notas`) é
// digitado. Ver `_norman/formulas.js CANDIDATURAS_*` pro desenho completo.
const CANDIDATURAS = 'Candidaturas';
// Acento: mesma armadilha que `dados (não edite)` já resolve — `Diário` tem
// caractere fora de [A-Za-z0-9_] e exige aspas simples em notação A1 e em
// `range` de values. `ref()`/`DI` abaixo cobrem isso; nunca escreva
// `Diário!` cru numa fórmula ou numa chamada de API.
const DIARIO = 'Diário';
// Ondas 14-17 (CRM vivo) — `Etapas` é a entidade que `Projetos` não tinha:
// uma LINHA de planilha não guarda lista, então "os marcos de um projeto"
// precisam da própria aba. DIGITADA (JB/Durin registram cada etapa), no
// mesmo espírito de `Fila`/`Tarefas`/`Diário`. `Projetos` DERIVA `etapa
// atual`/`progresso`/`saúde` daqui — nunca o contrário, e nunca digitado
// direto em `Projetos` (a lei "saúde e progresso são derivados, nunca
// digitados", declarada no briefing desta rodada).
const ETAPAS = 'Etapas';

// Nome antigo -> nome atual. `construir.js` renomeia a aba legada em vez de
// deixar uma aba órfã com as fórmulas apontando pra ela.
const LEGADAS = {
  [PAINEL]: ['Painel'],
  [TUDO]: ['Tudo'],
  [DADOS]: ['dados'],
  [EMPREGOS]: [],
  [CALC]: [],
  [ESTADO]: [],
  [HOJE]: [],
  [FILA]: [],
  [PROJETOS]: [],
  [TAREFAS]: [],
  [DIARIO]: [],
  [CANDIDATURAS]: [],
  [ETAPAS]: [],
  // Camada notícia: nasceram com o nome atual, como as cinco do CRM. Entram
  // vazias pelo mesmo motivo que elas — o laço de renomeio e a guarda de
  // órfão de `construir.js` iteram `Object.keys(LEGADAS)`.
  [NOTICIAS]: [],
  [IA]: [],
  [TRABALHO]: [],
  [CIENCIA]: [],
  [NOTICIAS_DADOS]: []
};

// Referência A1. `Concursos · tudo` e `dados (não edite)` têm caractere fora
// de [A-Za-z0-9_] e por isso exigem aspas simples — tanto dentro de fórmula
// quanto no parâmetro `range` da API de values.
const ref = sheets.refAba;

// Atalhos de referência pras fórmulas (`${D}!A2:A` lê melhor que a chamada).
const D = ref(DADOS);
const C = ref(CALC);
const DI = ref(DIARIO);
// Onda 5 — atalho pra `_estado` dentro de fórmula (`CANDIDATURAS_FORMULA`,
// `_norman/formulas.js`). `_estado` não tem espaço/parênteses, então `ref()`
// aqui é no-op — mas um caminho só pra referenciar QUALQUER aba evita o dia
// em que o nome mudar e alguém esquecer de aspas num dos consumidores.
const EST = ref(ESTADO);
// Atalho da aba de fato da trilha notícia — `'notícias (não edite)'`, já com
// as aspas simples que o acento e os parênteses exigem em notação A1.
const ND = ref(NOTICIAS_DADOS);

module.exports = {
  PAINEL, TUDO, EMPREGOS, DADOS, CALC, ESTADO,
  HOJE, FILA, PROJETOS, TAREFAS, DIARIO, CANDIDATURAS, ETAPAS,
  NOTICIAS, IA, TRABALHO, CIENCIA, NOTICIAS_DADOS, VISTAS_NOTICIA,
  LEGADAS, ref, D, C, DI, ND, EST
};
