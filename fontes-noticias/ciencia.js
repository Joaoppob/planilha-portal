'use strict';

const { criarFonteRss } = require('./_fabrica');

/**
 * ABA CIÊNCIA — tabelas `artigos` (paper: design, IA, agentes) e `academico`
 * (notícia do mundo acadêmico).
 *
 * LIMITAÇÃO ESTRUTURAL DO arXiv, MEDIDA E ASSUMIDA: a data de TODO item é a
 * do DIGEST DIÁRIO, não o horário de submissão — 55/55 itens de `cs.HC`
 * saíram com o mesmíssimo timestamp (`00:00:00 -0400`). Consequências
 * concretas nesta implementação:
 *
 *  - **Não se ordena por hora dentro do dia.** Não há hora; ordenar por ela
 *    inventaria uma precedência que o dado não tem. Os recortes ordenam por
 *    `data_ms` e, no empate (que aqui é TODO o lote do dia), caem no
 *    desempate por `score` — que é informação real.
 *  - A janela de cluster de ±36h fica trivialmente satisfeita entre itens do
 *    mesmo dia (Δt = 0). Não é problema: o predicado que decide é o Jaccard,
 *    e todos os itens do arXiv são do MESMO domínio, então nenhum par de
 *    arXiv pode formar repercussão inter-veículo. Um paper só sobe de score
 *    aqui pelo `perfil_bump`, que é a leitura honesta — o arXiv não mede
 *    repercussão de nada.
 *
 * VOLUME: `cs.AI` trouxe 352 itens num único dia contra 17 de `cs.MA`. O
 * filtro de keyword sobre título+abstract (`filtros_tabela ->
 * ciencia-artigos`) não é preferência, é requisito: sem ele a aba Ciência
 * inunda o lote e distorce o percentil de todas as outras.
 *
 * O QUE NÃO ESTÁ AQUI:
 *  - **Agência FAPESP**: viva e relevante, mas o `<item>` NÃO tem `pubDate`
 *    (zero ocorrências no XML inteiro) — só `lastBuildDate` no `<channel>`.
 *    Sem data por item não há janela de cluster nem recorte de 3
 *    dias/semana/mês, e a única saída seria carimbar "data da coleta", que é
 *    data inventada. A guarda de frescor rejeitaria a fonte com
 *    `motivo: 'sem_data'` de qualquer forma. Fica de fora com o motivo
 *    escrito, não por esquecimento.
 *  - **Times Higher Education**: HTTP 403, bot-wall.
 */

const fontes = [
  criarFonteRss({
    id: 'arxiv-cs-hc',
    nome: 'arXiv — cs.HC (Human-Computer Interaction)',
    veiculo: 'arXiv',
    aba: 'ciencia',
    tabela: 'artigos',
    idioma: 'en',
    urls: ['https://export.arxiv.org/rss/cs.HC'],
    // ~55/dia. Provavelmente a categoria MAIS alinhada ao perfil de JB
    // (Design de Interação / TIDD) entre as três — vem primeiro de
    // propósito, não por ordem alfabética.
    filtroTabela: 'ciencia-artigos',
    maxIdadeDias: 7
  }),

  criarFonteRss({
    id: 'arxiv-cs-ma',
    nome: 'arXiv — cs.MA (Multiagent Systems)',
    veiculo: 'arXiv',
    aba: 'ciencia',
    tabela: 'artigos',
    idioma: 'en',
    urls: ['https://export.arxiv.org/rss/cs.MA'],
    // ~17/dia — a mais enxuta das três, e a mais direta ao objeto da tese
    // (agentes) sem o ruído de cs.AI genérico.
    filtroTabela: 'ciencia-artigos',
    maxIdadeDias: 7
  }),

  criarFonteRss({
    id: 'arxiv-cs-ai',
    nome: 'arXiv — cs.AI (Artificial Intelligence)',
    veiculo: 'arXiv',
    aba: 'ciencia',
    tabela: 'artigos',
    idioma: 'en',
    urls: ['https://export.arxiv.org/rss/cs.AI'],
    // ~352/dia — a categoria que INUNDA. Entra só porque o filtro de
    // keyword está ligado; sem ele, sozinha, ela seria a maior parte do
    // lote diário inteiro do radar de notícias.
    filtroTabela: 'ciencia-artigos',
    maxIdadeDias: 7
  }),

  criarFonteRss({
    id: 'nature-news',
    nome: 'Nature (RDF — item com atributo rdf:about, não item simples)',
    veiculo: 'Nature',
    aba: 'ciencia',
    tabela: 'academico',
    idioma: 'en',
    urls: ['https://www.nature.com/nature.rss'],
    // ACHADO DE FORMATO: é RDF. A tag de item carrega atributo
    // (`rdf:about`), e um regex de `<item>` literal conta zero. Também usa
    // `dc:date` (só data, sem hora) em vez de `pubDate`. As duas coisas
    // estão cobertas em `lib-noticias/rss.js`. Medido: 75 itens em 7 dias
    // (~10-11/dia).
    maxIdadeDias: 14
  }),

  criarFonteRss({
    id: 'retraction-watch',
    nome: 'Retraction Watch (RSS 2.0)',
    veiculo: 'Retraction Watch',
    aba: 'ciencia',
    tabela: 'academico',
    idioma: 'en',
    urls: ['https://retractionwatch.com/feed/'],
    // <1 item/dia (10 itens em 12 dias). Baixo volume é CARACTERÍSTICA da
    // fonte — retratação de paper é rara por natureza —, não defeito. Por
    // isso o limiar de frescor é 30 dias: com 7, uma fonte perfeitamente
    // saudável seria rejeitada numa semana quieta. É o caso que mostra por
    // que o limiar tem que ser por fonte.
    maxIdadeDias: 30
  }),

  // ------------------------------------------------------------------
  // ONDA 11 (radar-crm-20-ondas.md, Bloco D) — fontes novas via
  // `triar-fonte.js` (ver C8 — donsetch degradado nesta sessão).
  // `maxIdadeDias` = `maxIdadeDiasNecessario` medido em 28/08/2026 + folga.
  // Todas as 13 candidatas testadas nesta aba passaram na triagem — as 4
  // categorias arXiv seguem o padrão exato de arxiv-cs-hc/ma/ai acima
  // (tabela `artigos`, `filtroTabela: 'ciencia-artigos'`); as 9 restantes
  // são notícia de ciência em sentido amplo, tabela `academico`, SEM filtro
  // — mesmo tratamento de nature-news/retraction-watch acima (a fonte
  // já nasce dentro do tema por ser veículo de ciência, não precisa de
  // corte de keyword). REJEITADAS (motivo literal, confirmado por fetch
  // real): Science.org/AAAS — HTTP 403 (Cloudflare, confirmado; o
  // reconhecimento já tinha marcado `cloak_suspected`); EurekAlert! — HTTP
  // 404 confirmado por Nahida (feed morto há ~2 anos, snapshot do Wayback
  // confirma); ScienceAlert — HTTP 404 confirmado por Nahida; Agência
  // Brasil — Ciência e Tecnologia — HTTP 404 confirmado por Nahida (slug de
  // editoria não existe, diferente de economia/política/últimas que
  // funcionam).
  //
  // NOTA (não desta Onda): uma rodada de `coletar --dry-run` durante a
  // validação viu `nature-news` (`nature.com/nature.rss`) responder HTTP
  // 404; uma segunda rodada, minutos depois, buscou a MESMA URL com 75
  // itens normais (RDF, 200 OK). Tratado como blip de rede transitório, não
  // como fonte quebrada — não há achado real aqui, registrado só para quem
  // reler o histórico desta Onda não interpretar a primeira observação como
  // regressão confirmada.
  // ------------------------------------------------------------------

  criarFonteRss({
    id: 'arxiv-cs-cl',
    nome: 'arXiv — cs.CL (Computation and Language)',
    veiculo: 'arXiv',
    aba: 'ciencia',
    tabela: 'artigos',
    idioma: 'en',
    urls: ['https://export.arxiv.org/rss/cs.CL'],
    // triado 28/08/2026: 236 itens no digest do dia, idade 0,41 d — mesmo
    // padrão de cadência/formato das 3 categorias já em produção acima.
    // Categoria de PLN/LLM, alinhada ao perfil de IA de JB.
    filtroTabela: 'ciencia-artigos',
    maxIdadeDias: 7
  }),

  criarFonteRss({
    id: 'arxiv-cs-cv',
    nome: 'arXiv — cs.CV (Computer Vision)',
    veiculo: 'arXiv',
    aba: 'ciencia',
    tabela: 'artigos',
    idioma: 'en',
    urls: ['https://export.arxiv.org/rss/cs.CV'],
    // triado 28/08/2026: 184 itens no digest do dia, idade 0,41 d.
    filtroTabela: 'ciencia-artigos',
    maxIdadeDias: 7
  }),

  criarFonteRss({
    id: 'arxiv-cs-cy',
    nome: 'arXiv — cs.CY (Computers and Society)',
    veiculo: 'arXiv',
    aba: 'ciencia',
    tabela: 'artigos',
    idioma: 'en',
    urls: ['https://export.arxiv.org/rss/cs.CY'],
    // triado 28/08/2026: 21 itens no digest do dia (volume baixo, bom pra
    // não inundar), idade 0,41 d. Categoria mais próxima de ética/sociedade
    // de IA dentre as 4 novas.
    filtroTabela: 'ciencia-artigos',
    maxIdadeDias: 7
  }),

  criarFonteRss({
    id: 'arxiv-cs-ro',
    nome: 'arXiv — cs.RO (Robotics)',
    veiculo: 'arXiv',
    aba: 'ciencia',
    tabela: 'artigos',
    idioma: 'en',
    urls: ['https://export.arxiv.org/rss/cs.RO'],
    // triado 28/08/2026: 69 itens no digest do dia, idade 0,41 d.
    filtroTabela: 'ciencia-artigos',
    maxIdadeDias: 7
  }),

  criarFonteRss({
    id: 'sciencedaily',
    nome: 'ScienceDaily — All (RSS 2.0)',
    veiculo: 'ScienceDaily',
    aba: 'ciencia',
    tabela: 'academico',
    idioma: 'en',
    urls: ['https://www.sciencedaily.com/rss/all.xml'],
    // triado 28/08/2026: 60 itens, idade 0,2 d — maxIdadeDiasNecessario=1.
    maxIdadeDias: 7
  }),

  criarFonteRss({
    id: 'physorg',
    nome: 'Phys.org (RSS 2.0)',
    veiculo: 'Phys.org',
    aba: 'ciencia',
    tabela: 'academico',
    idioma: 'en',
    urls: ['https://phys.org/rss-feed/'],
    // triado 28/08/2026: 30 itens, idade 0 d — maxIdadeDiasNecessario=0.
    maxIdadeDias: 7
  }),

  criarFonteRss({
    id: 'theconversation-br',
    nome: 'The Conversation — Brasil (Atom)',
    veiculo: 'The Conversation Brasil',
    aba: 'ciencia',
    tabela: 'academico',
    idioma: 'pt',
    urls: ['https://theconversation.com/br/articles.atom'],
    // triado 28/08/2026: 50 itens, idade 0,11 d — maxIdadeDiasNecessario=1.
    // Cobertura acadêmica em português, autoria de pesquisadores — única
    // fonte pt desta aba além do que já existisse.
    maxIdadeDias: 7
  }),

  criarFonteRss({
    id: 'mit-news-research',
    nome: 'MIT News — Research (RSS 2.0)',
    veiculo: 'MIT News',
    aba: 'ciencia',
    tabela: 'academico',
    idioma: 'en',
    urls: ['https://news.mit.edu/rss/research'],
    // triado 28/08/2026: 50 itens, idade 0,77 d — maxIdadeDiasNecessario=1.
    maxIdadeDias: 7
  }),

  criarFonteRss({
    id: 'plos-one',
    nome: 'PLOS ONE (Atom)',
    veiculo: 'PLOS ONE',
    aba: 'ciencia',
    tabela: 'academico',
    idioma: 'en',
    urls: ['https://journals.plos.org/plosone/feed/atom'],
    // triado 28/08/2026: 30 itens, idade 1 d — maxIdadeDiasNecessario=1.
    // Periódico revisado por pares — complementa o arXiv (pré-print) com
    // publicação final.
    maxIdadeDias: 7
  }),

  criarFonteRss({
    id: 'super-abril',
    nome: 'Super — Abril (RSS 2.0)',
    veiculo: 'Super',
    aba: 'ciencia',
    tabela: 'academico',
    idioma: 'pt',
    urls: ['https://super.abril.com.br/feed/'],
    // triado 28/08/2026: 38 itens, idade 0,03 d — maxIdadeDiasNecessario=1.
    // Divulgação científica em português.
    maxIdadeDias: 7
  }),

  criarFonteRss({
    id: 'wired-science',
    nome: 'Wired — Science (RSS 2.0)',
    veiculo: 'Wired',
    aba: 'ciencia',
    tabela: 'academico',
    idioma: 'en',
    urls: ['https://www.wired.com/feed/category/science/latest/rss'],
    // triado 28/08/2026: 20 itens, idade 0,18 d — maxIdadeDiasNecessario=1.
    maxIdadeDias: 7
  }),

  criarFonteRss({
    id: 'eos',
    nome: 'Eos — American Geophysical Union (RSS 2.0)',
    veiculo: 'Eos',
    aba: 'ciencia',
    tabela: 'academico',
    idioma: 'en',
    urls: ['https://eos.org/feed'],
    // triado 28/08/2026: 15 itens, idade 0,08 d — maxIdadeDiasNecessario=1.
    // Nicho geociências — boa diversidade de área frente ao resto da aba.
    maxIdadeDias: 7
  }),

  criarFonteRss({
    id: 'revista-pesquisa-fapesp',
    nome: 'Revista Pesquisa FAPESP (RSS 2.0 — distinta da Agência FAPESP já descartada, sem `pubDate`)',
    veiculo: 'Revista Pesquisa FAPESP',
    aba: 'ciencia',
    tabela: 'academico',
    idioma: 'pt',
    urls: ['https://revistapesquisa.fapesp.br/feed/'],
    // triado 28/08/2026: 30 itens, idade 0,08 d — maxIdadeDiasNecessario=1.
    // Confirmado nesta triagem: TEM pubDate por item (diferente da Agência
    // FAPESP, que não tem — permanece de fora por esse motivo).
    maxIdadeDias: 7
  })
];

module.exports = { fontes };
