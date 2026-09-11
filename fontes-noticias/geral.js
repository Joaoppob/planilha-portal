'use strict';

const { criarFonteRss } = require('./_fabrica');

/**
 * ABA GERAL — tabelas `brasil` (Brasil + política nacional) e `mundo`
 * (mundo + geopolítica).
 *
 * Toda URL aqui foi testada por `curl` real no reconhecimento
 * (`fontes-noticias-reconhecimento.md` §1). O que NÃO está aqui, e por quê:
 *
 *  - **Reuters** (`reutersagency.com/feed`): 404 confirmado, RSS público
 *    fechado há anos.
 *  - **G1 home** (`/rss/g1/`): vivo, mas redundante — quase todo item de
 *    Política/Mundo já está nele. Usar os três criaria triplicata DENTRO da
 *    mesma fonte, que o cluster contaria como um veículo só (o domínio é o
 *    mesmo): custo de rede e de linha, sinal zero. Decisão de produto que o
 *    reconhecimento deixou explicitamente em aberto, fechada aqui em favor
 *    das seções.
 *
 * `maxIdadeDias` NÃO é um número global: cada feed declara o seu, com o
 * volume medido ao lado. Um limiar único reprovaria injustamente o feed
 * lento e seria frouxo demais para detectar fossilização no feed rápido.
 */

const fontes = [
  criarFonteRss({
    id: 'g1-politica',
    nome: 'G1 — Política (RSS 2.0)',
    veiculo: 'G1',
    aba: 'geral',
    tabela: 'brasil',
    idioma: 'pt',
    urls: ['https://g1.globo.com/rss/g1/politica/'],
    // medido: 93 itens em ~42h (~45-50/dia). 7 dias é folgado para a guarda
    // e ainda dá lastro para a janela de cluster de ±36h.
    maxIdadeDias: 7
  }),

  criarFonteRss({
    id: 'g1-mundo',
    nome: 'G1 — Mundo (RSS 2.0)',
    veiculo: 'G1',
    aba: 'geral',
    tabela: 'mundo',
    idioma: 'pt',
    urls: ['https://g1.globo.com/rss/g1/mundo/'],
    // medido: 100 itens em 4 dias (~25/dia)
    maxIdadeDias: 7
  }),

  criarFonteRss({
    id: 'folha-poder',
    nome: 'Folha de S.Paulo — Poder (RSS 0.91, ISO-8859-1)',
    veiculo: 'Folha de S.Paulo',
    aba: 'geral',
    tabela: 'brasil',
    idioma: 'pt',
    urls: ['https://feeds.folha.uol.com.br/poder/rss091.xml'],
    // ACHADO REAL: o feed é ISO-8859-1, não UTF-8. Sem este charset os
    // acentos chegam como `Presid?ncia`/`exporta??es` — e o modo de falha é
    // silencioso (não lança, não some com o item, só corrompe). É por isso
    // que `lib/http.js getComCharset` existe.
    charset: 'iso-8859-1',
    // medido: 100 itens em ~3 dias (~33/dia)
    maxIdadeDias: 7
  }),

  criarFonteRss({
    id: 'folha-mundo',
    nome: 'Folha de S.Paulo — Mundo (RSS 0.91, ISO-8859-1)',
    veiculo: 'Folha de S.Paulo',
    aba: 'geral',
    tabela: 'mundo',
    idioma: 'pt',
    urls: ['https://feeds.folha.uol.com.br/mundo/rss091.xml'],
    charset: 'iso-8859-1',
    maxIdadeDias: 7
  }),

  criarFonteRss({
    id: 'poder360',
    nome: 'Poder360 (WordPress RSS)',
    veiculo: 'Poder360',
    aba: 'geral',
    tabela: 'brasil',
    idioma: 'pt',
    urls: ['https://www.poder360.com.br/feed/'],
    // medido: feed capado em 10 itens, janela de ~2h. Risco conhecido e
    // registrado: se o radar não rodar com frequência, item se perde entre
    // coletas. Não é problema desta camada resolver — é decisão de cadência.
    maxIdadeDias: 7
  }),

  criarFonteRss({
    id: 'bbc-brasil',
    nome: 'BBC Brasil (RSS — URL final, sem o hop 302)',
    veiculo: 'BBC Brasil',
    aba: 'geral',
    tabela: 'brasil',
    idioma: 'pt',
    // `bbc.com/portuguese/index.xml` responde 302 para cá — uso a URL final
    // direto, economizando um redirect por rodada.
    urls: ['https://feeds.bbci.co.uk/portuguese/rss.xml'],
    // ACHADO REAL, o mais sujo de todo o levantamento: o feed mistura
    // notícia de hoje com "recomendado" de abril/2024, FORA de ordem
    // cronológica, e repete dois pares de itens dentro de si mesmo. Os dois
    // defeitos estão cobertos por instrumento, não por esperança:
    // `rss.dedupeIntraFeed` mata a duplicata por link canônico, e
    // `frescor.filtrarItensVelhos` corta o conteúdo de 2024 com este limiar.
    // A fonte em si PASSA na guarda (tem item de hoje) — que é o
    // comportamento certo: ela está viva, só é suja.
    maxIdadeDias: 7
  }),

  criarFonteRss({
    id: 'bbc-world',
    nome: 'BBC News — World (RSS)',
    veiculo: 'BBC News',
    aba: 'geral',
    tabela: 'mundo',
    idioma: 'en',
    urls: ['https://feeds.bbci.co.uk/news/world/rss.xml'],
    // medido: 19 itens em ~2 dias (~9-10/dia). Formato limpo, sem os
    // problemas do irmão em português.
    maxIdadeDias: 7
  }),

  criarFonteRss({
    id: 'guardian-world',
    nome: 'The Guardian — World (RSS 2.0)',
    veiculo: 'The Guardian',
    aba: 'geral',
    tabela: 'mundo',
    idioma: 'en',
    urls: ['https://www.theguardian.com/world/rss'],
    // medido: 45 itens numa janela de MENOS DE 1 HORA. Volume altíssimo
    // (inclui nota curta e atualização de live blog). É exatamente o caso
    // que o ranking existe para domar — não filtro por relevância aqui, o
    // percentil por lote resolve sem descartar nada às cegas.
    maxIdadeDias: 7
  }),

  criarFonteRss({
    id: 'nyt-world',
    nome: 'The New York Times — World (RSS 2.0)',
    veiculo: 'The New York Times',
    aba: 'geral',
    tabela: 'mundo',
    idioma: 'en',
    urls: ['https://rss.nytimes.com/services/xml/rss/nyt/World.xml'],
    // medido: 55 itens em ~2 dias (~27/dia)
    maxIdadeDias: 7
  }),

  criarFonteRss({
    id: 'aljazeera',
    nome: 'Al Jazeera — All (RSS 2.0)',
    veiculo: 'Al Jazeera',
    aba: 'geral',
    tabela: 'mundo',
    idioma: 'en',
    urls: ['https://www.aljazeera.com/xml/rss/all.xml'],
    // medido: 25 itens em ~5h30. Feed "all", não recortado por região —
    // entra justamente porque cobre Oriente Médio/África/Ásia, que os feeds
    // americanos e britânicos cobrem menos. Diversidade de veículo é o
    // insumo do sinal de repercussão.
    maxIdadeDias: 7
  }),

  // ------------------------------------------------------------------
  // ONDA 11 (radar-crm-20-ondas.md, Bloco D) — fontes novas, adotadas via
  // `triar-fonte.js` (o parser da própria casa, não o donsetch — ver C8: o
  // `mcp__donsetch__web_fetch` está degradado nesta sessão e só devolve o
  // envelope de metadados). Todo `maxIdadeDias` abaixo vem do
  // `maxIdadeDiasNecessario` medido por `triar-fonte.js` contra a URL real
  // em 28/08/2026, com folga — nunca escolhido a dedo (doutrina de
  // lib-noticias/frescor.js:41-46). Candidatas testadas e REJEITADAS
  // (motivo literal): UOL Notícias — `sem_data` (o `pubDate` usa dia da
  // semana e mês em português — "Sex, 28 Ago 2026" — que `Date.parse` do V8
  // não reconhece; achado só possível com o parser de produção, o donsetch
  // não via o corpo); Politico Politics Picks — HTTP 403 confirmado 2x;
  // O Globo — Rio (`pox.globo.com/rss/oglobo/rio`) — redundante com a linha
  // `oglobo` abaixo (mesmo domínio, subconjunto regional; mesmo padrão que
  // `geral.js` já resolveu para o G1); DW Brasil — All
  // (`rss.dw.com/rdf/rss-br-all`) — `feed_velho`, item mais recente medido
  // de 2023-01-10 (achado real, diferente da suposição de redundância pura
  // do reconhecimento — o feed "All" está fossilizado, não só duplicado);
  // O Globo URL nominal (`oglobo.globo.com/rss.xml`) — `feed_vazio`
  // confirmado (0 itens), morto; Estadão — HTTP 404 confirmado (2 caminhos).
  // ------------------------------------------------------------------

  criarFonteRss({
    id: 'agencia-brasil-ultimas',
    nome: 'Agência Brasil — Últimas notícias (RSS 2.0)',
    veiculo: 'Agência Brasil',
    aba: 'geral',
    tabela: 'brasil',
    idioma: 'pt',
    urls: ['https://agenciabrasil.ebc.com.br/rss/ultimasnoticias/feed.xml'],
    // triado 28/08/2026: 10 itens, mais recente com idade 0,04 d — maxIdadeDiasNecessario=1.
    // 7 dias dá a mesma folga usada em todo o resto da aba.
    maxIdadeDias: 7
  }),

  criarFonteRss({
    id: 'agencia-brasil-politica',
    nome: 'Agência Brasil — Política (RSS 2.0)',
    veiculo: 'Agência Brasil',
    aba: 'geral',
    tabela: 'brasil',
    idioma: 'pt',
    urls: ['https://agenciabrasil.ebc.com.br/rss/politica/feed.xml'],
    // triado 28/08/2026: 10 itens, mais recente com idade 0,04 d — maxIdadeDiasNecessario=1.
    // Mesmo domínio de agencia-brasil-ultimas — o cluster conta os dois como
    // 1 veículo só (lib-noticias/rss.js dominio()), então as duas linhas não
    // inflam repercussão artificial; entram porque a agência é fonte
    // pública oficial de referência que ainda não estava na aba.
    maxIdadeDias: 7
  }),

  criarFonteRss({
    id: 'cnn-brasil',
    nome: 'CNN Brasil (RSS — URL final pós-redirect, sem o hop)',
    veiculo: 'CNN Brasil',
    aba: 'geral',
    tabela: 'brasil',
    idioma: 'pt',
    // `cnnbrasil.com.br/feed/` redireciona para cá — uso a URL final direto,
    // mesmo padrão de bbc-brasil acima.
    urls: ['https://admin.cnnbrasil.com.br/feed/'],
    // triado 28/08/2026: 60 itens (volume alto), mais recente com idade 0 d
    // — maxIdadeDiasNecessario=0. 7 dias é a folga padrão da aba.
    maxIdadeDias: 7
  }),

  criarFonteRss({
    id: 'metropoles',
    nome: 'Metrópoles (RSS 2.0)',
    veiculo: 'Metrópoles',
    aba: 'geral',
    tabela: 'brasil',
    idioma: 'pt',
    urls: ['https://www.metropoles.com/feed'],
    // triado 28/08/2026: 20 itens, mais recente com idade 0 d — maxIdadeDiasNecessario=0.
    maxIdadeDias: 7
  }),

  criarFonteRss({
    id: 'veja',
    nome: 'VEJA (RSS 2.0)',
    veiculo: 'VEJA',
    aba: 'geral',
    tabela: 'brasil',
    idioma: 'pt',
    urls: ['https://veja.abril.com.br/feed/'],
    // triado 28/08/2026: 20 itens, mais recente com idade 0 d — maxIdadeDiasNecessario=0.
    maxIdadeDias: 7
  }),

  criarFonteRss({
    id: 'congresso-em-foco',
    nome: 'Congresso em Foco (RSS — URL final, sem `uol` no host)',
    veiculo: 'Congresso em Foco',
    aba: 'geral',
    tabela: 'brasil',
    idioma: 'pt',
    // `congressoemfoco.uol.com.br/feed/` redireciona para cá.
    urls: ['https://congressoemfoco.com.br/feed/'],
    // triado 28/08/2026: 20 itens, mais recente com idade 0,03 d — maxIdadeDiasNecessario=1.
    maxIdadeDias: 7
  }),

  criarFonteRss({
    id: 'valor-economico',
    nome: 'Valor Econômico (RSS 2.0)',
    veiculo: 'Valor Econômico',
    aba: 'geral',
    tabela: 'brasil',
    idioma: 'pt',
    urls: ['https://valor.globo.com/rss/valor'],
    // triado 28/08/2026: 100 itens (volume alto, feed misto de macro e
    // negócios), mais recente com idade 0,01 d — maxIdadeDiasNecessario=1.
    // Tabela `brasil` porque o reconhecimento marcou a decisão em aberto
    // entre Brasil-macro e política; volume alto é domado pelo percentil
    // por lote (ranking.js), não por filtro — mesmo raciocínio de
    // guardian-world acima.
    maxIdadeDias: 7
  }),

  criarFonteRss({
    id: 'oglobo',
    nome: 'O Globo (RSS — backend `pox.globo.com`, mesmo padrão de infra do G1)',
    veiculo: 'O Globo',
    aba: 'geral',
    tabela: 'brasil',
    idioma: 'pt',
    // A URL nominal `oglobo.globo.com/rss.xml` está morta (feed_vazio,
    // triado e confirmado — ver nota de topo). O backend que responde de
    // verdade é este, mesma infraestrutura do G1 (`g1.globo.com`).
    urls: ['https://pox.globo.com/rss/oglobo'],
    // triado 28/08/2026: 100 itens, mais recente com idade 0 d —
    // maxIdadeDiasNecessario=0. NÃO inclui o recorte `/rio` (redundante,
    // mesmo domínio — ver nota de topo).
    maxIdadeDias: 7
  }),

  criarFonteRss({
    id: 'dw-brasil-top',
    nome: 'Deutsche Welle Brasil — Top (RSS/RDF)',
    veiculo: 'Deutsche Welle Brasil',
    aba: 'geral',
    tabela: 'mundo',
    idioma: 'pt',
    urls: ['https://rss.dw.com/rdf/rss-br-top'],
    // triado 28/08/2026: 16 itens, mais recente com idade 0,03 d —
    // maxIdadeDiasNecessario=1. 14 dias (não 7) porque o volume é baixo
    // (16 itens vs 60-100 dos outros feeds desta aba) e o irmão "All" desta
    // mesma DW está FOSSILIZADO (feed_velho, item mais recente de 2023) —
    // limiar mais folgado reduz o risco de um dia fraco de cobertura ser
    // confundido com fonte morta, mesmo raciocínio do arstechnica-ia.
    maxIdadeDias: 14
  })
];

module.exports = { fontes };
