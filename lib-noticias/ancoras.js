'use strict';

/**
 * Normalização de título, extração de ÂNCORAS e Jaccard — a camada léxica
 * do dedupe por cluster, exatamente como o reconhecimento recomendou
 * (`fontes-noticias-reconhecimento.md` §Detecção de fato repetido).
 *
 * ÂNCORA = palavra com inicial MAIÚSCULA no título ORIGINAL (nome próprio,
 * sigla, instituição) + todo NÚMERO do título. É lexical e barata: nenhum
 * LLM, nenhuma requisição extra, roda sobre o que o feed já entregou de
 * graça (decisão de JB: "sem resumo gerado").
 *
 * ---
 *
 * O DOMÍNIO NÃO ENTRA NO CONJUNTO DE ÂNCORAS — divergência declarada.
 *
 * O reconhecimento lista o domínio do link como parte do "conjunto de
 * âncoras" (passo 2) e, no passo 3, o usa como restrição ("domínios
 * diferentes"). As duas coisas não podem ser a mesma. Se o domínio entrasse
 * no conjunto que alimenta o Jaccard, dois itens do MESMO veículo ganhariam
 * similaridade extra só por serem do mesmo veículo — o oposto exato do que
 * o método quer medir, que é o mesmo fato aparecendo em veículos
 * DIFERENTES. Implementei o domínio só como restrição (`lib-noticias/
 * cluster.js`), fora do Jaccard. Evidência de que é a leitura certa: o
 * próprio passo 4 do reconhecimento define repercussão como "número de
 * domínios distintos no cluster" — o domínio é o que se CONTA, não o que se
 * compara.
 *
 * ---
 *
 * A HEURÍSTICA "MAIÚSCULA = NOME PRÓPRIO" QUEBRA EM DOIS PONTOS, E OS DOIS
 * ESTÃO TRATADOS AQUI:
 *
 * (a) MANCHETE EM CAIXA ALTA. O reconhecimento avisou: se o título inteiro
 *     é maiúsculo, TODA palavra vira âncora e o conjunto vira ruído.
 *     `detectarCaixaAlta` mede a fração de tokens LONGOS (>=6 letras) que
 *     estão inteiramente em maiúscula. O corte por comprimento é o que
 *     impede o falso alarme do caso real "Concurso IBGE 2026: editais..." —
 *     sigla de 4 letras não conta pro denominador, porque sigla em
 *     maiúscula é justamente o sinal que queremos, não o defeito. Quando a
 *     caixa alta É detectada, o extrator troca de regime: passa a usar
 *     palavras de CONTEÚDO (não-stopword, >=4 letras) como âncora, e marca
 *     `capsQuebrada: true` para que o item fique auditável — nunca finge
 *     que extraiu nome próprio de onde não dava.
 *
 * (b) PRIMEIRA PALAVRA DA FRASE. Ela é maiúscula por convenção
 *     ortográfica, não por ser nome próprio ("Após", "Veja", "Como",
 *     "The"). Eu NÃO resolvo isso só com lista negra escrita à mão — lista
 *     escrita à mão envelhece e ninguém confere. Resolvo com frequência
 *     documental medida no próprio lote: `filtrarFrequentes` remove a
 *     âncora que aparece em mais de `limiarDF` dos itens do lote. Uma
 *     âncora que aparece em 30% dos títulos do dia não distingue fato
 *     nenhum, seja ela "Veja" ou "Trump". O limiar é derivado do dado da
 *     rodada, não escolhido a dedo, e o corte é reportado. A lista de
 *     stopwords abaixo é o piso barato (artigo, preposição, verbo dicendi);
 *     a DF é o instrumento que pega o que a lista não previu.
 */

const STOPWORDS = new Set([
  // português
  'a','ao','aos','as','à','às','com','como','da','das','de','del','desde','do','dos','e','ele','ela','eles','elas',
  'em','entre','era','essa','esse','esta','este','eu','foi','foram','há','isso','isto','já','lhe','mais','mas','me',
  'mesmo','meu','minha','muito','na','nas','nem','no','nos','nós','não','num','numa','o','os','ou','para','pela',
  'pelas','pelo','pelos','por','porque','qual','quando','que','quem','se','sem','ser','seu','sua','são','só','sobre',
  'também','te','tem','têm','ter','teu','tua','um','uma','uns','umas','vai','ver','você','após','ante','até','contra',
  'diz','disse','pode','vão','deve','ainda','apos','sao','nao','ja','ha','so','apenas','antes','depois','durante',
  'veja','saiba','entenda','confira','leia','agora','hoje','ontem','anos','ano','dia','dias','novo','nova',
  // inglês
  'the','an','and','or','but','if','of','on','in','to','for','with','without','from','by','at','as','is','are',
  'was','were','be','been','being','it','its','this','that','these','those','he','she','they','them','his','her',
  'their','we','you','your','our','not','no','yes','has','have','had','will','would','can','could','should','may',
  'might','must','do','does','did','more','most','new','how','why','what','when','where','who','which','about',
  'after','before','over','under','into','out','up','down','than','then','there','here','all','some','one','two',
  'says','said','say','just','now','get','gets','via','amid','set','sets'
]);

function removerAcento(s) {
  return String(s == null ? '' : s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/** minúsculas, sem acento, pontuação virando espaço. Base de tudo abaixo. */
function normalizarTitulo(titulo) {
  return removerAcento(titulo)
    .toLowerCase()
    .replace(/[^\p{L}\p{N},.]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Tokens do título ORIGINAL, preservando a caixa (é dela que a âncora nasce). */
function tokenizarOriginal(titulo) {
  return String(titulo == null ? '' : titulo)
    .split(/[^\p{L}\p{N}'’-]+/u)
    .map(t => t.replace(/^['’-]+|['’-]+$/g, ''))
    .filter(Boolean);
}

/**
 * Manchete em caixa alta? Fração de tokens LONGOS (>=6 letras) inteiramente
 * maiúsculos. Ver cabeçalho (a) para o motivo do corte por comprimento.
 * Sem nenhum token longo, devolve `false` — nunca acusa caixa alta por falta
 * de evidência.
 */
function detectarCaixaAlta(titulo, limiar = 0.6) {
  const tokens = tokenizarOriginal(titulo).filter(t => /\p{L}/u.test(t) && t.length >= 6);
  if (tokens.length === 0) return false;
  const maiusculos = tokens.filter(t => t === t.toUpperCase() && t !== t.toLowerCase()).length;
  return maiusculos / tokens.length > limiar;
}

/**
 * Números do título, como aparecem: `9,6` · `2027` · `321` · `6x1`. Vírgula
 * decimal vira ponto para que `9,6` (G1) e `9.6` (feed em inglês) sejam a
 * MESMA âncora.
 *
 * CONSERTO 3 (prova de clustering, tmp/prova-noticias-2.log) — dois defeitos
 * no mesmo lugar:
 *
 * (a) `6x1` tokenizava como DUAS âncoras separadas, `6` e `1` — o `x` não
 *     está na classe de caracteres do regex antigo (`\d[\d.,]*`), então ele
 *     quebra o match no meio do número. Duas notícias que só compartilham o
 *     dígito solto `1` (ou `6`) ganhavam interseção sem NENHUM poder
 *     discriminante — "escala 6x1" virava indistinguível de qualquer título
 *     com outro "1" ou "6" soltos. O primeiro ramo do regex casa o padrão
 *     `NxN` (com decimais opcionais dos dois lados) ANTES do padrão de
 *     número solto, preservando `6x1` como um único token.
 * (b) número de UM dígito isolado (`8` de "8 de janeiro", `1` de "G1") é
 *     âncora fraca demais para carregar sozinho um Jaccard alto — é
 *     exatamente o material do Erro 2 (ver `cluster.js` CONSERTO 1: o piso
 *     de interseção absoluta cobre o caso geral, mas descartar o dígito
 *     isolado na origem evita que ele conte no denominador do Jaccard e
 *     iniba o índice invertido de criar pares candidatos por esse motivo).
 *     Números com 2+ dígitos (`83`, `200`, `2026`) OU com separador
 *     decimal/`x` (`9.6`, `6x1`) continuam valendo.
 */
function extrairNumeros(titulo) {
  const brutos =
    String(titulo == null ? '' : titulo).match(/\d+(?:[.,]\d+)*x\d+(?:[.,]\d+)*|\d[\d.,]*/gi) || [];
  return brutos
    .map(n => n.replace(/[.,]+$/, '').replace(/,/g, '.').toLowerCase())
    .filter(n => n.length > 0 && !/^\d$/.test(n));
}

/** Tamanho de |A∩B| — a contraparte absoluta do Jaccard (que é relativo). Ver `cluster.js` CONSERTO 1: a razão sozinha deixa passar par com 1 âncora em comum e conjuntos pequenos ("eua" com "eua,governo" dá J=0,50). */
function contarIntersecao(a, b) {
  const A = a instanceof Set ? a : new Set(a || []);
  const B = b instanceof Set ? b : new Set(b || []);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return inter;
}

/**
 * @returns {{ancoras:string[], capsQuebrada:boolean, regime:'maiuscula'|'conteudo'}}
 *
 * `regime` fica explícito no retorno de propósito: comparar um conjunto
 * extraído por maiúscula com um extraído por conteúdo mistura duas escalas
 * diferentes de Jaccard, e quem consome (`cluster.js`) precisa poder ver
 * isso em vez de descobrir por um número estranho depois.
 */
function extrairAncoras(titulo) {
  const capsQuebrada = detectarCaixaAlta(titulo);
  const tokens = tokenizarOriginal(titulo);
  const numeros = extrairNumeros(titulo);

  let palavras;
  if (capsQuebrada) {
    // Regime de conteúdo — ver cabeçalho (a).
    palavras = tokens
      .filter(t => /\p{L}/u.test(t))
      .map(t => removerAcento(t).toLowerCase())
      .filter(t => t.length >= 4 && !STOPWORDS.has(t));
  } else {
    palavras = tokens
      .filter(t => /^\p{Lu}/u.test(t))
      .map(t => removerAcento(t).toLowerCase())
      .filter(t => t.length >= 2 && !STOPWORDS.has(t));
  }

  const ancoras = Array.from(new Set(palavras.concat(numeros)));
  return { ancoras, capsQuebrada, regime: capsQuebrada ? 'conteudo' : 'maiuscula' };
}

/** Jaccard clássico: |A∩B| / |A∪B|. Conjunto vazio de qualquer lado devolve 0, não NaN nem 1 — dois títulos sem âncora nenhuma não são "idênticos", são indeterminados, e indeterminado nunca vira cluster. */
function jaccard(a, b) {
  const A = a instanceof Set ? a : new Set(a || []);
  const B = b instanceof Set ? b : new Set(b || []);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  const uniao = A.size + B.size - inter;
  return uniao === 0 ? 0 : inter / uniao;
}

/**
 * Remove âncoras genéricas demais para distinguir fato, medindo frequência
 * documental NO LOTE (ver cabeçalho (b)). Devolve os conjuntos filtrados +
 * a lista do que foi cortado, com a DF observada de cada um — o corte é
 * auditável, não um efeito colateral silencioso.
 *
 * `minLote`: com pouquíssimos itens a DF é instável (com 3 itens, qualquer
 * âncora repetida já dá 0,33) — abaixo desse piso a filtragem não roda e
 * `aplicado` volta `false`, para que ninguém leia "nada foi cortado" como
 * "nada precisava ser cortado".
 */
function filtrarFrequentes(conjuntos, { limiarDF = 0.15, minLote = 20 } = {}) {
  const lista = (conjuntos || []).map(c => (c instanceof Set ? c : new Set(c || [])));
  if (lista.length < minLote) return { conjuntos: lista, cortadas: [], aplicado: false };

  const df = new Map();
  for (const c of lista) for (const a of c) df.set(a, (df.get(a) || 0) + 1);

  const cortadas = [];
  for (const [ancora, n] of df) {
    const frac = n / lista.length;
    if (frac > limiarDF) cortadas.push({ ancora, df: n, fracao: Number(frac.toFixed(4)) });
  }
  cortadas.sort((x, y) => y.df - x.df);
  const setCortadas = new Set(cortadas.map(c => c.ancora));

  const filtrados = lista.map(c => {
    const novo = new Set();
    for (const a of c) if (!setCortadas.has(a)) novo.add(a);
    return novo;
  });

  return { conjuntos: filtrados, cortadas, aplicado: true };
}

module.exports = {
  STOPWORDS,
  removerAcento,
  normalizarTitulo,
  tokenizarOriginal,
  detectarCaixaAlta,
  extrairNumeros,
  extrairAncoras,
  jaccard,
  contarIntersecao,
  filtrarFrequentes
};
