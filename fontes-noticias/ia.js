'use strict';

const { criarFonteRss } = require('./_fabrica');

/**
 * ABA IA — veículos de imprensa e blog oficial. A metade "comunidade" da aba
 * (Hacker News e Reddit) mora em `hackernews.js` e `reddit.js`, que não são
 * feeds RSS simples e por isso não cabem na fábrica.
 *
 * TODAS estas fontes entram na tabela `ia-geral`. O roteamento para a tabela
 * `claude` acontece DEPOIS, em `noticias.js`, por filtro de termo sobre o
 * título (`config/keywords-noticias.json -> termos_claude`).
 *
 * POR QUE ASSIM, E NÃO COM UMA FONTE "ANTHROPIC": `anthropic.com/news/
 * rss.xml` devolve **404** — a página é Next.js renderizada no cliente, sem
 * endpoint de feed server-side. Não existe fonte direta para inventariar.
 * A tabela `claude` é, por construção, o que estes cinco feeds dizem sobre
 * Claude/Anthropic — e vai ser magra. O briefing pediu explicitamente para
 * não inflá-la, então não há aqui nenhuma fonte acrescentada só para
 * engordar a contagem, nem termo genérico no roteamento.
 *
 * `[incerto: pode existir endpoint JSON client-side por trás do site da
 * Anthropic, análogo ao caso Gupy documentado em fontes/gupy.js — o
 * reconhecimento não fez engenharia reversa dos bundles JS e eu também não,
 * está fora do escopo desta entrega]`
 */

const fontes = [
  criarFonteRss({
    id: 'techcrunch-ia',
    nome: 'TechCrunch — categoria Artificial Intelligence (RSS 2.0)',
    veiculo: 'TechCrunch',
    aba: 'ia',
    tabela: 'ia-geral',
    idioma: 'en',
    urls: ['https://techcrunch.com/category/artificial-intelligence/feed/'],
    // medido: 20 itens em ~1 dia (~20/dia)
    maxIdadeDias: 7
  }),

  criarFonteRss({
    id: 'arstechnica-ia',
    nome: 'Ars Technica — AI (RSS 2.0)',
    veiculo: 'Ars Technica',
    aba: 'ia',
    tabela: 'ia-geral',
    idioma: 'en',
    urls: ['https://arstechnica.com/ai/feed/'],
    // medido: 20 itens em 13 dias (~1,5/dia). Limiar de frescor MAIOR de
    // propósito: 7 dias reprovaria uma fonte viva só por ela ser lenta —
    // exatamente o falso positivo que um limiar global cometeria. 30 dias
    // continua detectando fossilização (o caso real tem 8 ANOS de idade).
    maxIdadeDias: 30
  }),

  criarFonteRss({
    id: 'theverge-ia',
    nome: 'The Verge — AI (ATOM, não RSS)',
    veiculo: 'The Verge',
    aba: 'ia',
    tabela: 'ia-geral',
    idioma: 'en',
    urls: ['https://www.theverge.com/rss/ai-artificial-intelligence/index.xml'],
    // ACHADO REAL DE INSTRUMENTO: este feed é Atom (`<entry>`), não RSS
    // (`<item>`). A primeira contagem do reconhecimento deu ZERO aqui e
    // quase declarou a fonte morta — o defeito era do parser, não da fonte.
    // `lib-noticias/rss.js detectarFormato` decide por conteúdo justamente
    // por causa disto. Medido: 10 entries em ~2 dias (~5/dia).
    maxIdadeDias: 14
  }),

  criarFonteRss({
    id: 'wired-ia',
    nome: 'Wired — tag AI (RSS 2.0)',
    veiculo: 'Wired',
    aba: 'ia',
    tabela: 'ia-geral',
    idioma: 'en',
    urls: ['https://www.wired.com/feed/tag/ai/latest/rss'],
    // 10 itens confirmados; a janela de datas NÃO foi medida no
    // reconhecimento (registrado lá como `[incerto:]`). Uso 14 dias — mais
    // folgado que os feeds cuja cadência eu conheço, porque limiar apertado
    // sobre volume desconhecido é chute com cara de medida.
    maxIdadeDias: 14
  }),

  criarFonteRss({
    id: 'openai-news',
    nome: 'OpenAI News (RSS 2.0 — arquivo histórico completo)',
    veiculo: 'OpenAI',
    aba: 'ia',
    tabela: 'ia-geral',
    idioma: 'en',
    // `openai.com/blog/rss.xml` redireciona para cá; uso a URL final.
    urls: ['https://openai.com/news/rss.xml'],
    // ACHADO REAL: são 1154 itens, de dez/2015 até hoje — o arquivo
    // histórico INTEIRO, não um recorte recente (payload de ~120KB). O
    // corte por data não é otimização, é requisito: sem ele, todo post de
    // 2016 entraria no lote e apareceria nos recortes. `filtrarItensVelhos`
    // resolve com este limiar, e a fonte passa na guarda porque o item mais
    // recente É de hoje. Cadência recente medida: 1-3 posts/dia.
    maxIdadeDias: 14
  }),

  // ------------------------------------------------------------------
  // ONDA 11 (radar-crm-20-ondas.md, Bloco D) — fontes novas via
  // `triar-fonte.js` (ver C8 do plano — donsetch degradado nesta sessão).
  // Todo `maxIdadeDias` vem do `maxIdadeDiasNecessario` medido em
  // 28/08/2026, com folga. REJEITADA (motivo literal, confirmado por
  // fetch real, não pelo envelope do donsetch): AI News
  // (artificialintelligence-news.com/feed/) — HTTP 403, bloqueio
  // confirmado 2x. NÃO ADOTADAS por decisão de custo/risco (não triadas por
  // instrumento próprio, mantendo o veredito ⚠️ do reconhecimento sem
  // promover): ZDNet AI (a URL específica de IA redireciona pro feed geral,
  // exigiria filtro de keyword em cima de conteúdo não-IA); Analytics India
  // Magazine (atrás de Cloudflare, extração de baixa confiança); r/
  // MachineLearning (bloqueado, e os 5 subreddits de reddit.js já cobrem a
  // comunidade); Meta AI Blog — HTTP 404 confirmado, mesmo padrão do caso
  // Anthropic já documentado acima (big lab sem RSS público).
  // ------------------------------------------------------------------

  criarFonteRss({
    id: 'venturebeat-ai',
    nome: 'VentureBeat — categoria AI (RSS 2.0)',
    veiculo: 'VentureBeat',
    aba: 'ia',
    tabela: 'ia-geral',
    idioma: 'en',
    urls: ['https://venturebeat.com/category/ai/feed/'],
    // triado 28/08/2026: 7 itens, mais recente com idade 0,99 d — maxIdadeDiasNecessario=1.
    maxIdadeDias: 7
  }),

  // TENTATIVA REVERTIDA (registrada aqui para não repetir o erro): tentei
  // alimentar a tabela `ferramentas` registrando esta MESMA URL uma segunda
  // vez, com `tabela: 'ferramentas'` + `filtroTabela: 'ia-ferramentas'`.
  // MEDIDO com `node noticias.js coletar --dry-run` em 28/08/2026: a
  // segunda cópia coletou 3 itens (log confirma `[venturebeat-ai-ferramentas]
  // 3 itens`), mas eles NÃO aparecem no relatório final `-- itens por
  // aba/tabela --` — `deduparGlobal` (`noticias.js`) dedupa por `id`
  // (sha256 de link canônico + título) ANTES do roteamento de tabela, sem
  // olhar para `tabela`. As duas cópias produzem o MESMO `id` (mesmo
  // link+título, porque é o MESMO artigo do MESMO feed) e só a PRIMEIRA
  // registrada em `listaFontes` sobrevive — sempre `venturebeat-ai`, nunca
  // a cópia `ferramentas`. É o MESMO defeito estrutural do achado C6/11c
  // (`fontes-noticias/dedup-entre-abas.js`): dedupe que ignora a dimensão
  // que devia diferenciar (lá era aba, aqui é tabela). A correção real fica
  // em `deduparGlobal`, fora do escopo em arquivos desta Onda — ver
  // RELATORIO-ONDA-11.md. Manter a duplicata registrada seria um bloco que
  // MENTE (parece alimentar a tabela, mas os itens são descartados em
  // silêncio) — por isso ela foi removida, não deixada inerte.

  criarFonteRss({
    id: 'huggingface-blog',
    nome: 'Hugging Face — Blog (RSS 2.0 — arquivo histórico completo)',
    veiculo: 'Hugging Face',
    aba: 'ia',
    tabela: 'ia-geral',
    idioma: 'en',
    urls: ['https://huggingface.co/blog/feed.xml'],
    // triado 28/08/2026: 851 itens (arquivo histórico inteiro, mesmo padrão
    // do openai-news acima), mais recente com idade 2,58 d —
    // maxIdadeDiasNecessario=3. 14 dias segue o mesmo raciocínio do
    // openai-news: `filtrarItensVelhos` faz o corte real, a guarda só
    // precisa de folga pra não reprovar um fim de semana quieto.
    maxIdadeDias: 14
  }),

  criarFonteRss({
    id: 'technologyreview',
    nome: 'MIT Technology Review (RSS 2.0)',
    veiculo: 'MIT Technology Review',
    aba: 'ia',
    tabela: 'ia-geral',
    idioma: 'en',
    urls: ['https://www.technologyreview.com/feed/'],
    // triado 28/08/2026: 10 itens, mais recente com idade 0,05 d — maxIdadeDiasNecessario=1.
    maxIdadeDias: 7
  }),

  criarFonteRss({
    id: 'theregister-ai',
    nome: 'The Register — Software/AI+ML (Atom)',
    veiculo: 'The Register',
    aba: 'ia',
    tabela: 'ia-geral',
    idioma: 'en',
    // A URL nominal redireciona para uma API interna do The Register — o
    // `fetch` nativo (redirect:'follow' em lib/http.js) segue o hop sozinho
    // e traz conteúdo real; não é preciso guardar a URL da API à parte.
    urls: ['https://www.theregister.com/software/ai_ml/headlines.atom'],
    // triado 28/08/2026: 50 itens, mais recente com idade 0,14 d — maxIdadeDiasNecessario=1.
    maxIdadeDias: 7
  }),

  criarFonteRss({
    id: 'simon-willison',
    nome: "Simon Willison's Weblog — feed \"everything\" (Atom)",
    veiculo: 'Simon Willison',
    aba: 'ia',
    tabela: 'ia-geral',
    idioma: 'en',
    urls: ['https://simonwillison.net/atom/everything/'],
    // triado 28/08/2026: 30 itens, mais recente com idade 0,63 d —
    // maxIdadeDiasNecessario=1. RISCO ASSUMIDO (o reconhecimento já
    // apontou): é o feed "everything" do blog pessoal, não recortado só
    // para IA — o autor publica majoritariamente sobre LLM/IA, mas um post
    // fora do tema pode entrar sem filtro. 14 dias (não 7): cadência mais
    // baixa que veículo de imprensa, sem volume medido diário confiável.
    maxIdadeDias: 14
  }),

  criarFonteRss({
    id: 'marktechpost',
    nome: 'MarkTechPost (RSS 2.0)',
    veiculo: 'MarkTechPost',
    aba: 'ia',
    tabela: 'ia-geral',
    idioma: 'en',
    urls: ['https://www.marktechpost.com/feed/'],
    // triado 28/08/2026: 10 itens, mais recente com idade 0,37 d — maxIdadeDiasNecessario=1.
    maxIdadeDias: 7
  }),

  criarFonteRss({
    id: 'the-decoder',
    nome: 'The Decoder (RSS 2.0)',
    veiculo: 'The Decoder',
    aba: 'ia',
    tabela: 'ia-geral',
    idioma: 'en',
    urls: ['https://the-decoder.com/feed/'],
    // triado 28/08/2026: 10 itens, mais recente com idade 0,03 d — maxIdadeDiasNecessario=1.
    maxIdadeDias: 7
  }),

  criarFonteRss({
    id: 'deepmind-news',
    nome: 'Google DeepMind — Blog (RSS 2.0)',
    veiculo: 'Google DeepMind',
    aba: 'ia',
    tabela: 'ia-geral',
    idioma: 'en',
    urls: ['https://deepmind.google/blog/rss.xml'],
    // triado 28/08/2026: 100 itens (volume alto), mais recente com idade
    // 0,9 d — maxIdadeDiasNecessario=1.
    maxIdadeDias: 7
  }),

  criarFonteRss({
    id: 'importai',
    nome: 'Import AI (Substack, Jack Clark — newsletter semanal)',
    veiculo: 'Import AI',
    aba: 'ia',
    tabela: 'ia-geral',
    idioma: 'en',
    urls: ['https://importai.substack.com/feed'],
    // triado 28/08/2026: 20 itens, mais recente com idade 4,03 d —
    // maxIdadeDiasNecessario=5. Newsletter SEMANAL por natureza (baixo
    // volume é característica, não defeito — mesmo raciocínio do
    // retraction-watch em ciencia.js); 14 dias dá duas semanas de folga
    // sobre uma cadência de ~7 dias.
    maxIdadeDias: 14
  })
];

module.exports = { fontes };
