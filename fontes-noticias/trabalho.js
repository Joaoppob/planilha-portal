'use strict';

const { criarFonteRss } = require('./_fabrica');

/**
 * ABA TRABALHO — tabelas `concursos` (notícia de concurso público: edital,
 * banca, resultado) e `mercado-trabalho` (emprego em sentido amplo).
 *
 * O QUE NÃO ESTÁ AQUI, com o motivo medido:
 *  - **PCI Concursos**: 4 caminhos de RSS testados, 4x HTTP 404. (A PCI JÁ
 *    é fonte do radar por outro caminho — `fontes/pci.js`, servidor MCP
 *    JSON-RPC — mas aquilo entrega VAGA, não notícia, e alimenta outro
 *    store. Não é esta trilha.)
 *  - **Folha Mercado**: vivo, mas "Mercado" na Folha é a editoria de
 *    finanças/negócios, não de emprego. Nome enganoso, conteúdo não bate.
 *  - **InfoMoney Carreira**: responde 200 com ZERO itens (canal vazio).
 *  - **gov.br @@rss.xml**: vivo, mas é catálogo de SERVIÇOS, não notícia.
 *  - **Exame Carreira, Correio Braziliense Concursos, Estadão Economia,
 *    QConcursos, TecConcursos**: 404 ou SPA sem RSS.
 */

const fontes = [
  criarFonteRss({
    id: 'estrategia-concursos',
    nome: 'Estratégia Concursos — Blog (RSS 2.0)',
    veiculo: 'Estratégia Concursos',
    aba: 'trabalho',
    tabela: 'concursos',
    idioma: 'pt',
    urls: ['https://www.estrategiaconcursos.com.br/blog/feed/'],
    // Melhor achado novo do reconhecimento para esta aba: é literalmente
    // NOTÍCIA de concurso (edital, banca, resultado), não listagem de vaga.
    // Medido: 10 itens (teto do WordPress) numa janela de ~2h.
    //
    // É também a fonte onde o reconhecimento previu FALSO-POSITIVO de
    // cluster: dois posts do mesmo processo ("IDIB é a banca para 15 vagas"
    // / "banca definida para 15 vagas") são o mesmo fato — e um terceiro
    // sobre outra FASE do mesmo concurso seria fato diferente com âncoras
    // quase iguais. O limiar intra-domínio mais alto (0,60) existe por
    // causa deste caso, e o relatório da execução de prova é onde ele tem
    // que ser conferido, não aqui.
    maxIdadeDias: 7
  }),

  criarFonteRss({
    id: 'g1-economia-trabalho',
    nome: 'G1 — Economia, recortado para mercado de trabalho',
    veiculo: 'G1',
    aba: 'trabalho',
    tabela: 'mercado-trabalho',
    idioma: 'pt',
    urls: ['https://g1.globo.com/rss/g1/economia/'],
    // O feed traz 100 itens e a MAIORIA é câmbio/bolsa/juros/PIB. O
    // reconhecimento mediu isso e avisou: sem filtro, "a tabela de mercado
    // de trabalho vira uma tabela de economia geral". O filtro está em
    // config (`filtros_tabela -> trabalho-mercado`), não aqui — a lista de
    // termos vai envelhecer e tem que ser editável sem tocar em código.
    filtroTabela: 'trabalho-mercado',
    maxIdadeDias: 7
  }),

  criarFonteRss({
    id: 'g1-concursos-canario',
    nome: 'G1 — Concursos e Emprego (CANÁRIO: feed morto que responde 200)',
    veiculo: 'G1',
    aba: 'trabalho',
    tabela: 'concursos',
    idioma: 'pt',
    urls: ['https://g1.globo.com/rss/g1/concursos-e-emprego/'],
    // ---------------------------------------------------------------
    // ESTA FONTE ESTÁ REGISTRADA DE PROPÓSITO, SABENDO QUE ELA ESTÁ MORTA.
    //
    // O briefing manda não usá-la, e ela de fato NÃO alimenta tabela
    // nenhuma: a guarda de frescor a rejeita antes de qualquer item entrar
    // no lote. Ela está aqui como CANÁRIO — a prova viva, a cada rodada, de
    // que a guarda funciona.
    //
    // O raciocínio: uma guarda que nunca rejeita nada é indistinguível de
    // uma guarda quebrada. Se amanhã alguém trocar `avaliarFrescor` por
    // `return {aprovado:true}`, nenhum teste de fixture necessariamente
    // pega isso em produção — mas o log da coleta real passa a mostrar 100
    // itens de 2017 entrando na aba Trabalho, e isso é impossível de não
    // ver.
    //
    // Custo: uma requisição HTTP por rodada. Preço barato por um
    // instrumento que se autotesta contra dado real todo dia.
    //
    // Se um dia o G1 ressuscitar este feed, a fonte passa a ser aprovada e
    // vira fonte legítima de `concursos` sem nenhuma mudança de código —
    // e a decisão sobre mantê-la volta a ser de produto, com dado.
    // ---------------------------------------------------------------
    canario: true,
    maxIdadeDias: 7
  }),

  // ------------------------------------------------------------------
  // ONDA 11 (radar-crm-20-ondas.md, Bloco D, prioridade 1 do briefing: esta
  // era a aba MAIS MAGRA — 2 fontes vivas + 1 canário — e a que mais
  // comprometia a tabela de 30 dias). Todas via `triar-fonte.js` (ver C8 —
  // donsetch degradado nesta sessão), `maxIdadeDias` = `maxIdadeDiasNecessario`
  // medido em 28/08/2026 + folga. Também triado e ADOTADO nesta rodada:
  // TST — RSS abaixo (Nahida reportou erro de protocolo do donsetch,
  // `decompress: unexpected end of file`; o parser da casa buscou a MESMA
  // URL sem erro nenhum — a falha era do instrumento degradado, não da
  // fonte). REJEITADAS/fora (motivo literal): Correio Braziliense — vazio
  // (`blocks_total 0`, confirmado por Nahida, não retriado); IBGE Agência
  // de Notícias — página índice de links, não é feed; os ~14 caminhos 404
  // listados no reconhecimento (direcaoconcursos, Terra, Gupy blog,
  // gov.br/trabalho-e-emprego, QConcursos, PCI notícias etc.) — aceitos
  // como confirmados pelo próprio relatório da Nahida (status HTTP real,
  // não depende do corpo do feed para um 404 ser verdade).
  // ------------------------------------------------------------------

  criarFonteRss({
    id: 'gran-cursos-blog',
    nome: 'Gran Cursos Online — Blog "Notícias de Concursos Públicos" (RSS 2.0)',
    veiculo: 'Gran Cursos Online',
    aba: 'trabalho',
    tabela: 'concursos',
    idioma: 'pt',
    urls: ['https://blog.grancursosonline.com.br/feed/'],
    // triado 28/08/2026: 30 itens, mais recente com idade 0,01 d — maxIdadeDiasNecessario=1.
    maxIdadeDias: 7
  }),

  criarFonteRss({
    id: 'concursos-no-brasil',
    nome: 'Concursos no Brasil (RSS — URL final, sem `www`)',
    veiculo: 'Concursos no Brasil',
    aba: 'trabalho',
    tabela: 'concursos',
    idioma: 'pt',
    urls: ['https://www.concursosnobrasil.com.br/feed/'],
    // triado 28/08/2026: 15 itens, mais recente com idade 0,02 d — maxIdadeDiasNecessario=1.
    maxIdadeDias: 7
  }),

  criarFonteRss({
    id: 'aprova-concursos-blog',
    nome: 'Aprova Concursos — Blog (RSS 2.0)',
    veiculo: 'Aprova Concursos',
    aba: 'trabalho',
    tabela: 'concursos',
    idioma: 'pt',
    urls: ['https://www.aprovaconcursos.com.br/blog/feed/'],
    // triado 28/08/2026: 10 itens, mais recente com idade 0,86 d — maxIdadeDiasNecessario=1.
    // RISCO REGISTRADO (reconhecimento): junto com gran-cursos-blog e
    // concursos-no-brasil acima, e o estrategia-concursos já em produção,
    // são 4 cursinhos concorrentes cobrindo o MESMO edital com título
    // reescrito por SEO — o limiar de Jaccard intra-domínio (0,60, já
    // calibrado para o caso do Estratégia Concursos) é o que decide se isso
    // vira 4 linhas ou 1 cluster de 4 veículos; não é ajustado aqui.
    maxIdadeDias: 7
  }),

  criarFonteRss({
    id: 'tst-rss',
    nome: 'Tribunal Superior do Trabalho — RSS institucional',
    veiculo: 'TST',
    aba: 'trabalho',
    tabela: 'mercado-trabalho',
    idioma: 'pt',
    urls: ['https://www.tst.jus.br/rss'],
    // triado 28/08/2026: 10 itens, mais recente com idade 0,01 d —
    // maxIdadeDiasNecessario=1. Sem filtroTabela: o feed institucional do
    // TST é, por construção, 100% notícia de Justiça do Trabalho — mesmo
    // ajuste direto de estrategia-concursos (fonte já nasce dentro do tema
    // da tabela, sem precisar de corte).
    maxIdadeDias: 7
  }),

  criarFonteRss({
    id: 'agencia-brasil-economia',
    nome: 'Agência Brasil — Economia (RSS 2.0)',
    veiculo: 'Agência Brasil',
    aba: 'trabalho',
    tabela: 'mercado-trabalho',
    idioma: 'pt',
    urls: ['https://agenciabrasil.ebc.com.br/rss/economia/feed.xml'],
    // triado 28/08/2026: 10 itens, mais recente com idade 0,14 d — maxIdadeDiasNecessario=1.
    // Feed geral de Economia, mesmo padrão de risco do g1-economia-trabalho
    // acima — o filtro é o mesmo (`trabalho-mercado`), config compartilhado.
    filtroTabela: 'trabalho-mercado',
    maxIdadeDias: 7
  }),

  criarFonteRss({
    id: 'jornal-contabil',
    nome: 'Jornal Contábil (RSS — URL final, sem `www`)',
    veiculo: 'Jornal Contábil',
    aba: 'trabalho',
    tabela: 'mercado-trabalho',
    idioma: 'pt',
    urls: ['https://www.jornalcontabil.com.br/feed/'],
    // triado 28/08/2026: 10 itens, mais recente com idade 0,05 d — maxIdadeDiasNecessario=1.
    // Foco contábil/tributário cruza com trabalhista (CLT, eSocial, FGTS)
    // mas não é 100% do tema — filtro obrigatório pra não virar tabela de
    // contabilidade geral.
    filtroTabela: 'trabalho-mercado',
    maxIdadeDias: 7
  }),

  criarFonteRss({
    id: 'infomoney-geral',
    nome: 'InfoMoney (feed geral — o feed "Carreira" dedicado está vazio, achado da rodada 1)',
    veiculo: 'InfoMoney',
    aba: 'trabalho',
    tabela: 'mercado-trabalho',
    idioma: 'pt',
    urls: ['https://www.infomoney.com.br/feed/'],
    // triado 28/08/2026: 10 itens, mais recente com idade 0 d — maxIdadeDiasNecessario=0.
    // Feed geral de finanças — precisa do filtro forte pra não inundar com
    // câmbio/bolsa/juros, mesmo caso do g1-economia-trabalho.
    filtroTabela: 'trabalho-mercado',
    maxIdadeDias: 7
  }),

  criarFonteRss({
    id: 'conjur',
    nome: 'Consultor Jurídico — Conjur (RSS — URL final, sem redirect)',
    veiculo: 'Conjur',
    aba: 'trabalho',
    tabela: 'mercado-trabalho',
    idioma: 'pt',
    urls: ['https://www.conjur.com.br/feed/'],
    // triado 28/08/2026: 10 itens, mais recente com idade 0,01 d — maxIdadeDiasNecessario=1.
    // Cobertura jurídica GERAL (cível, penal, tributário, trabalhista) —
    // precisa do filtro pra reter só o ângulo trabalhista (o filtro
    // `trabalho-mercado` já inclui "justica do trabalho", "mpt", "reforma
    // trabalhista").
    filtroTabela: 'trabalho-mercado',
    maxIdadeDias: 7
  }),

  criarFonteRss({
    id: 'catho-carreira',
    nome: 'Catho — Carreira & Sucesso (RSS 2.0)',
    veiculo: 'Catho',
    aba: 'trabalho',
    tabela: 'mercado-trabalho',
    idioma: 'pt',
    urls: ['https://www.catho.com.br/carreira-sucesso/feed/'],
    // triado 28/08/2026: 9 itens, mais recente com idade 10,76 d —
    // maxIdadeDiasNecessario=11. Vivo mas devagar — 30 dias (não 7), mesmo
    // raciocínio do arstechnica-ia: um limiar apertado reprovaria uma fonte
    // saudável só por ter uma quinzena mais quieta. Sem filtroTabela: o
    // conteúdo já nasce dentro do tema (carreira/RH), sem precisar de corte.
    maxIdadeDias: 30
  }),

  criarFonteRss({
    id: 'voce-rh',
    nome: 'Você RH — Abril (RSS 2.0)',
    veiculo: 'Você RH',
    aba: 'trabalho',
    tabela: 'mercado-trabalho',
    idioma: 'pt',
    urls: ['https://vocerh.abril.com.br/feed/'],
    // triado 28/08/2026: 10 itens, mais recente com idade 0,62 d — maxIdadeDiasNecessario=1.
    // Editoria de RH/gestão — dentro do tema por construção, sem filtro.
    maxIdadeDias: 7
  }),

  criarFonteRss({
    id: 'dci',
    nome: 'DCI — Jornal DCI (RSS 2.0)',
    veiculo: 'DCI',
    aba: 'trabalho',
    tabela: 'mercado-trabalho',
    idioma: 'pt',
    urls: ['https://www.dci.com.br/feed/'],
    // triado 28/08/2026: 10 itens, mais recente com idade 0,48 d — maxIdadeDiasNecessario=1.
    // Geral de economia/negócios — filtro obrigatório, mesmo caso acima.
    filtroTabela: 'trabalho-mercado',
    maxIdadeDias: 7
  }),

  criarFonteRss({
    id: 'money-times',
    nome: 'Money Times (RSS 2.0)',
    veiculo: 'Money Times',
    aba: 'trabalho',
    tabela: 'mercado-trabalho',
    idioma: 'pt',
    urls: ['https://www.moneytimes.com.br/feed/'],
    // triado 28/08/2026: 10 itens, mais recente com idade 0 d — maxIdadeDiasNecessario=0.
    // Geral de mercado financeiro — filtro obrigatório, mesmo caso acima.
    filtroTabela: 'trabalho-mercado',
    maxIdadeDias: 7
  })
];

module.exports = { fontes };
