'use strict';

const fs = require('fs');
const path = require('path');
const { normalizarTitulo, removerAcento } = require('./ancoras');

/**
 * RANKING — `score = repercussao_normalizada(0-60) + perfil_bump(0-40)`,
 * exatamente a fórmula do reconhecimento (§Ranking) e do briefing.
 *
 * ---
 * POR QUE PERCENTIL, E NÃO PONTO FIXO
 *
 * As escalas de entrada são incomparáveis por natureza: nº de veículos num
 * cluster vai de 1 a ~4; `points` do Hacker News vai de 1 a milhares (o
 * reconhecimento capturou 1618, 852, 488 no front_page real). Qualquer
 * constante que responda "quantos veículos valem quantos upvotes" é
 * inventada. O percentil recusa a pergunta: cada item compete só contra os
 * outros itens do MESMO dia, da MESMA aba e da MESMA tabela (tema — ver
 * ONDA 7e abaixo), e a posição relativa vira os 0-60 pontos. Um dia fraco de
 * notícia não infla nem desinfla nada — só reordena o que existe naquele dia.
 *
 * Percentil de MEIO-RANK (`(menores + 0,5*empates) / n`): com o sinal bruto
 * sendo `n_veiculos`, os empates são a regra, não a exceção (a esmagadora
 * maioria dos itens tem exatamente 1 veículo). Um percentil "fração de
 * valores estritamente menores" daria 0 para TODOS eles e o percentil
 * "menores ou iguais" daria 100 — os dois extremos são mentira. O meio-rank
 * é a leitura honesta de um empate massivo.
 *
 * Lote com UM item só devolve percentil 50 (neutro). Não há posição relativa
 * quando não há contra quem comparar; fingir 100 premiaria a aba vazia.
 *
 * ---
 * ONDA 7e (radar-crm-20-ondas.md) — GRUPO DO PERCENTIL GANHA A TABELA (tema)
 *
 * Medido contra o store real (1970 registros, `node tests/noticias-faixas-
 * cascata.test.js`): com o grupo em `(dia_lote, aba)`, o sinal bruto de duas
 * naturezas — contínuo em log (HN/`reddit-hn`, 97 valores distintos num só
 * dia) contra quase-sempre-empatado em 1 (RSS, `academico` tinha exatamente
 * 1 valor distinto em TODO o store) — competiam na MESMA régua. Quem tem
 * régua com mais graduação ganha os percentis altos (repercussão até 60)
 * sempre, não por ser mais relevante: medido, `ia/reddit-hn` tirava
 * `percentil>90` em 39 de 333 itens contra 1 de 94 em `ia/ia-geral`; em
 * `ciencia`, `academico` (92 itens, 100% `n_veiculos=1`) nunca superava o
 * `repercussao=30` (percentil ≈50, o teto do empate) enquanto `artigos` (581
 * itens, com uma fração rara de cluster multi-veículo) chegava a
 * `repercussao=60`. Resultado: `ciencia/academico` e `ia/ia-geral` varridos
 * a zero sobreviventes nas três faixas — não por JB achar Nature/OpenAI News
 * menos relevante, mas porque a régua deles nunca sai do empate.
 *
 * O grupo do percentil passa a ser `(dia_lote, aba, tabela)`: cada tema
 * compete só contra si mesmo, na sua própria régua. `calcularFaixasNoticia`
 * (a seleção do top 20) CONTINUA agrupando só por `aba` (C9, inalterado) —
 * os temas seguem competindo pelas 20 vagas da faixa; a mudança é só em QUAL
 * régua decide quem tem score mais alto dentro dessa disputa.
 *
 * Efeito colateral medido (lote de 1 item → percentil 50 fixo, ver acima):
 * o grupo mais fino cria mais lotes pequenos — de 8 lotes de tamanho 1 em
 * `(dia_lote, aba)` para 14 em `(dia_lote, aba, tabela)`, sobre 1970
 * registros — 16 registros (0,8% do store) caem em lote de tamanho ≤2. Não
 * vira doença: nenhum tema perde sobrevivente por isso (ver RELATORIO-ONDA-
 * 7-10.md §Onda 7e para a tabela antes/depois).
 *
 * ---
 * DE ONDE VEM O `perfil_bump` (briefing: "sai de config/keywords.json e
 * config/perfil.json") — e o suplemento, declarado:
 *
 *   1. `config/keywords.json` -> `termos` + `pesos_area`. É a base pedida
 *      pelo briefing. O peso por área (0-40, escala da trilha docente) é
 *      dividido por 5 para virar peso por TERMO nesta trilha, porque aqui
 *      vários termos somam até um teto de 40 — usar 40 por termo faria o
 *      primeiro match saturar o teto sozinho e apagar toda diferença entre
 *      um título que fala de design e outro que fala de design DE AGENTES.
 *   2. `config/perfil.json` -> `area_mestrado` e `area_graduacao`. São prosa,
 *      não lista. Uso-as do único jeito não-inventado possível: casando essa
 *      prosa contra os mesmos termos de (1) para descobrir QUAIS áreas são
 *      de fato as de JB, e dando a essas um multiplicador (1,25). Não
 *      extraio "significado" da frase — só verifico quais termos conhecidos
 *      ela contém.
 *   3. `config/keywords-noticias.json` -> `termos_perfil`. SUPLEMENTO, com o
 *      motivo do próprio reconhecimento: o vocabulário de VAGA não serve de
 *      vocabulário de NOTÍCIA ("'React' é bom termo de VAGA mas ruim termo
 *      de relevância de NOTÍCIA, que quer coisa como 'lançamento',
 *      'modelo', 'pesquisa'"). Sem ele, "Anthropic lança Claude Opus 5" não
 *      pontuaria nada, porque nenhuma das duas palavras que importam existe
 *      na lista de concurso docente. Divergência declarada, não improviso.
 *
 * O bump roda sobre o TÍTULO apenas — decisão de JB ("sem resumo gerado, sem
 * custo de LLM"): o corpo do artigo custaria uma requisição por item.
 */

const RAIZ = path.join(__dirname, '..');
const TETO_PERFIL_PADRAO = 40;
const REPERCUSSAO_MAX = 60;
const MULTIPLICADOR_AREA_DO_PERFIL = 1.25;
const FUSO_BR_MS = 3 * 3600000; // America/Sao_Paulo, UTC-3 fixo (Brasil sem horário de verão desde 2019)

function lerJson(arquivo) {
  return JSON.parse(fs.readFileSync(path.join(RAIZ, arquivo), 'utf8'));
}

/**
 * Match de termo. `termo*` = prefixo (`\btermo\p{L}*`); sem `*` = fronteira
 * de palavra exata — é o que impede "ux" de bater dentro de "auxiliar",
 * falso positivo real já documentado em `lib/keyword-filtro.js`.
 */
function casaTermo(textoNorm, termo) {
  const t = removerAcento(String(termo || '')).toLowerCase().trim();
  if (!t) return false;
  const prefixo = t.endsWith('*');
  const nucleo = (prefixo ? t.slice(0, -1) : t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (!nucleo) return false;
  const re = prefixo ? new RegExp('\\b' + nucleo + '[\\p{L}]*', 'u') : new RegExp('\\b' + nucleo + '\\b', 'u');
  return re.test(textoNorm);
}

/**
 * Monta a tabela de pesos por termo a partir das TRÊS fontes descritas no
 * cabeçalho. Cacheia porque `noticias.js` chama isso uma vez por item e ler
 * três JSONs por item seria desperdício puro.
 */
let _cache = null;
function carregarConfig({ recarregar = false } = {}) {
  if (_cache && !recarregar) return _cache;

  const keywords = lerJson('config/keywords.json');
  const perfil = lerJson('config/perfil.json');
  const noticias = lerJson('config/keywords-noticias.json');

  const pesosArea = keywords.pesos_area || {};

  // (2) quais áreas são de fato as de JB — derivado da prosa de perfil.json
  const prosaPerfil = normalizarTitulo([perfil.area_mestrado, perfil.area_graduacao].filter(Boolean).join(' . '));
  const areasDoPerfil = new Set();
  for (const t of keywords.termos || []) {
    if (t && t.termo && casaTermo(prosaPerfil, t.termo)) areasDoPerfil.add(t.area);
  }

  // (1) base: termos de vaga docente, peso reescalado
  const tabela = new Map();
  for (const t of keywords.termos || []) {
    if (!t || !t.termo) continue;
    const base = (pesosArea[t.area] || 0) / 5;
    const peso = areasDoPerfil.has(t.area) ? base * MULTIPLICADOR_AREA_DO_PERFIL : base;
    if (peso > 0) tabela.set(t.termo, { termo: t.termo, peso: Number(peso.toFixed(2)), origem: 'keywords.json' });
  }

  // (3) suplemento de notícia — sobrescreve quando o mesmo termo existe nos dois
  for (const t of noticias.termos_perfil || []) {
    if (!t || !t.termo) continue;
    tabela.set(t.termo, { termo: t.termo, peso: Number(t.peso) || 0, origem: 'keywords-noticias.json' });
  }

  _cache = {
    termosPerfil: Array.from(tabela.values()),
    tetoPerfil: Number(noticias.teto_perfil_bump) || TETO_PERFIL_PADRAO,
    termosClaude: noticias.termos_claude || [],
    filtrosTabela: noticias.filtros_tabela || {},
    areasDoPerfil: Array.from(areasDoPerfil)
  };
  return _cache;
}

/** `{ pontos, matches }`. Soma os pesos dos termos que batem no título, capada no teto. Nunca extrapola nem inventa peso para termo desconhecido. */
function perfilBump(titulo, cfg = carregarConfig()) {
  const norm = normalizarTitulo(titulo);
  const matches = cfg.termosPerfil.filter(t => casaTermo(norm, t.termo));
  const soma = matches.reduce((acc, t) => acc + (t.peso || 0), 0);
  return { pontos: Math.round(Math.min(cfg.tetoPerfil, soma)), matches: matches.map(m => m.termo) };
}

/** `AAAA-MM-DD` no fuso de JB (UTC-3 fixo). O dia do LOTE é o eixo do percentil — usar UTC cru jogaria toda notícia publicada depois das 21h para o dia seguinte. */
function diaLote(dataMs) {
  if (!Number.isFinite(dataMs)) return null;
  return new Date(dataMs - FUSO_BR_MS).toISOString().slice(0, 10);
}

/**
 * Sinal bruto, nas duas formas do reconhecimento:
 *
 *  - fonte COM score nativo (HN via Algolia): `log10(pontos+1)*2 +
 *    log10(comentarios+1)*1.5`. O log comprime o post de milhares de upvotes
 *    para que ele não domine tudo; comentário pesa menos que ponto porque
 *    ponto é aprovação e comentário é debate — importam os dois, não
 *    igualmente.
 *  - todo o resto: `n_veiculos` do cluster.
 *
 * REDDIT CAI NO SEGUNDO CASO, E ISSO É UMA PERDA REAL, NÃO UMA ESCOLHA: o
 * endpoint `.json` (único com score/comentários) devolve 403 atrás de
 * bot-wall em www/api/old.reddit.com — confirmado 2x no reconhecimento. O
 * `.rss` que responde é Atom SEM nenhum campo numérico (grep por
 * points|score|ups|num_comments no XML inteiro: zero). Então todo item de
 * Reddit entra com `n_veiculos = 1`, e fica embaixo do HN na aba IA. É a
 * leitura honesta do que a fonte entrega — inventar um score proxy
 * (posição no feed "hot", por exemplo) seria fabricar sinal.
 */
function sinalBruto(item, cluster) {
  if (Number.isFinite(item.pontos)) {
    const pts = Math.max(0, item.pontos);
    const cmt = Math.max(0, Number.isFinite(item.comentarios) ? item.comentarios : 0);
    return Math.log10(pts + 1) * 2 + Math.log10(cmt + 1) * 1.5;
  }
  return cluster && Number.isFinite(cluster.n_veiculos) ? cluster.n_veiculos : 1;
}

/** Percentil de meio-rank (ver cabeçalho) de `valor` dentro de `valores`, em 0-100. */
function percentilMeioRank(valor, valores) {
  const n = valores.length;
  if (n <= 1) return 50;
  let menores = 0;
  let iguais = 0;
  for (const v of valores) {
    if (v < valor) menores++;
    else if (v === valor) iguais++;
  }
  return ((menores + 0.5 * iguais) / n) * 100;
}

/**
 * Calcula sinal bruto, percentil, repercussão e score para todos os itens.
 * MUTA os itens (acrescenta campos) e devolve a lista. O agrupamento do
 * percentil é `(dia_lote, aba, tabela)` — ONDA 7e, ver o motivo medido no
 * cabeçalho do arquivo (§ONDA 7e). Era `(dia_lote, aba)` até 2026-08-28;
 * misturava réguas de naturezas diferentes (log contínuo do HN vs.
 * n_veiculos quase sempre empatado do RSS) dentro da mesma aba.
 */
function calcularScores(itens, porItemCluster, cfg = carregarConfig()) {
  const lista = Array.isArray(itens) ? itens : [];

  for (const item of lista) {
    const cluster = porItemCluster && porItemCluster.get ? porItemCluster.get(item.id) : null;
    item.cluster_id = cluster ? cluster.cluster_id : null;
    item.n_veiculos = cluster ? cluster.n_veiculos : 1;
    item.n_itens_cluster = cluster ? cluster.n_itens : 1;
    item.sinal_bruto = Number(sinalBruto(item, cluster).toFixed(4));
    item.dia_lote = diaLote(item.dataMs);
  }

  const lotes = new Map();
  for (const item of lista) {
    const chave = (item.dia_lote || 'sem-data') + '::' + (item.aba || '?') + '::' + (item.tabela || '?');
    if (!lotes.has(chave)) lotes.set(chave, []);
    lotes.get(chave).push(item);
  }

  for (const [chave, lote] of lotes) {
    const valores = lote.map(i => i.sinal_bruto);
    for (const item of lote) {
      const pct = percentilMeioRank(item.sinal_bruto, valores);
      const bump = perfilBump(item.titulo, cfg);
      item.lote = chave;
      item.lote_tamanho = lote.length;
      item.percentil = Number(pct.toFixed(2));
      item.repercussao = Math.round((pct / 100) * REPERCUSSAO_MAX);
      item.perfil_bump = bump.pontos;
      item.perfil_matches = bump.matches;
      item.score = item.repercussao + item.perfil_bump;
    }
  }

  return lista;
}

/**
 * ONDA 7b (radar-crm-20-ondas.md, Bloco C) — INVERSÃO DELIBERADA DE
 * DOUTRINA, registrada aqui porque um comentário que descreve a regra
 * antiga vira mentira no arquivo.
 *
 * ANTES (doutrina original, até 2026-08-28): `top-mes` ordenava por score;
 * `ultimos-3-dias` e `semana` ordenavam por DATA decrescente, porque
 * "últimos 3 dias" era lido como pergunta de RECÊNCIA.
 *
 * AGORA: as QUATRO janelas ordenam por SCORE, com `data_ms` decrescente como
 * desempate. Motivo, e é pedido literal, não escolha interna: JB pediu
 * "TOP 20 dos últimos 3/7/30 dias" — "top" é ranking, não recência. A
 * palavra dele sobre a própria escolha derruba a leitura antiga.
 *
 * Os recortes continuam DERIVADOS na leitura — o store guarda
 * `data_ms`/`score`/`aba`/`tabela`/`cluster_id`, suficiente para recalcular
 * qualquer um deles sem recoletar nada.
 *
 * ---
 * C10 (radar-crm-20-ondas.md, "Correção de JB, 2026-08-28, com ele
 * presente") — JB olhou o resultado das TRÊS janelas e corrigiu: não são
 * três, são QUATRO, e a primeira NÃO é "últimos 3 dias", é **hoje**, o dia
 * civil corrente. `ultimos-3-dias` SAI. `RECORTES`/`FAIXAS_CASCATA` passam
 * de 3 para 4 entradas: `hoje` (dia corrente) · `semana` (7d) · `quinzena`
 * (15d, nova) · `mes` (30d, era `top-mes`).
 *
 * `hoje` não é "últimas 24h" — é o dia CIVIL no fuso de JB (`diaLote`,
 * já usado no resto do arquivo para o eixo do percentil): tudo cujo
 * `diaLote(data_ms)` é igual a `diaLote(agora)`. Um item publicado às 23h50
 * de ontem não entra em `hoje`, mesmo estando dentro das últimas 24h — é
 * exatamente a leitura que "notícias de hoje" pede e "últimas 24h" não dá.
 */
const RECORTES = {
  hoje: { diaCorrente: true, ordem: 'score' },
  semana: { dias: 7, ordem: 'score' },
  quinzena: { dias: 15, ordem: 'score' },
  mes: { dias: 30, ordem: 'score' }
};

/**
 * ONDA 7 — a cascata em passos, e o código de FAIXA que a planilha passa a
 * filtrar (decisão C2 do plano: a exclusão sai da fórmula e vem pra cá,
 * porque `COUNTIF`/`MATCH` de cada tabela contra as anteriores seria caro e
 * frágil em Sheets). Cada entrada nomeia: o código gravado na coluna `faixa`
 * da aba de fato, o nome do recorte (mesmo vocabulário do CLI `node
 * noticias.js recorte <nome>`), e a janela (em dias, ou `diaCorrente` pra
 * `hoje` — ver o comentário C10 acima de `RECORTES`).
 *
 * C10: de 3 para 4 entradas — `hoje` entra na frente (dia corrente, não
 * "últimos 3 dias"), `15d`/`quinzena` é NOVA entre `7d` e `30d`.
 */
const FAIXAS_CASCATA = [
  { faixa: 'hoje', recorte: 'hoje', diaCorrente: true },
  { faixa: '7d', recorte: 'semana', dias: 7 },
  { faixa: '15d', recorte: 'quinzena', dias: 15 },
  { faixa: '30d', recorte: 'mes', dias: 30 }
];
const FAIXA_POR_RECORTE = Object.fromEntries(FAIXAS_CASCATA.map(f => [f.recorte, f.faixa]));

/** Teto por (aba, faixa) — Onda 7d + C9. Era 8 na doutrina antiga (constante hoje só em `_norman/formulas.js NOTICIA_TETO`, fora desta trilha); JB pediu 20 — vale para as quatro janelas, `hoje` inclusa. */
const TETO_FAIXA_NOTICIA = 20;

/**
 * C10-b — decisão EXPLÍCITA de JB, registrada como flag de uma linha porque
 * ele pode querer reverter: a cascata (exclusão cumulativa por cluster_id/
 * url, ver `calcularFaixasNoticia`) também vale para a janela de 30 dias, e
 * não só entre hoje/7d/15d.
 *
 * JB fechou com "as dos últimos 30 dias **pode ser** a lista das top
 * notícias do mês" — permissão, não ordem. Com `true` (ADOTADO): a janela de
 * 30d exclui tudo que já apareceu em hoje/7d/15d, então as quatro tabelas
 * somam até 80 itens DISTINTOS (20+20+20+20), nunca repetindo entre si — é
 * a leitura que sustenta a promessa literal "as 20 do dia não aparecem nas
 * dos últimos 7 dias... [15d] não deve conter nenhuma notícia do dia, nem
 * dos 7 dias" estendida ao 30d.
 *
 * Com `false` (ALTERNATIVA, não adotada): a janela de 30d volta a ser o top
 * 20 PURO do mês inteiro por score, sem excluir o que já apareceu nas três
 * janelas anteriores — pode repetir notícia que já está em `hoje`/7d/15d
 * (a leitura "a lista das top notícias do mês", sem condicionar às outras
 * três). Reverter é trocar esta linha.
 */
const CASCATA_INCLUI_MES = true;

const scoreDe = r => (Number.isFinite(r && r.score) ? r.score : -Infinity);
const dataMsDe = r => (Number.isFinite(r && r.data_ms) ? r.data_ms : 0);

/**
 * ONDA 7e-2 — PISO DE DIVERSIDADE POR TEMA, aplicado só quando o score puro
 * (7e-1) não basta.
 *
 * MEDIDO (RELATORIO-ONDA-7-10.md §Onda 7e): mesmo depois de 7e-1 (percentil
 * por tabela, não só por aba), `ciencia/academico` (92 itens no store)
 * seguia com 0 sobreviventes nas três faixas — o teto de score que um tema
 * SEM nenhuma variação interna (100% `n_veiculos=1`) alcança é 35
 * (repercussao 30 + perfil_bump até 5), abaixo do score MEDIANO de
 * `ciencia/artigos` (37). Réguas separadas não resolvem quando um tema
 * inteiro nunca sai do empate — é diferença real de repercussão e de
 * perfil_bump, não artefato de escala. Viola o critério de aceite: nenhum
 * tema com ≥50 itens no store pode ficar a zero.
 *
 * O piso é DERIVADO do volume do tema no STORE (todo o histórico da aba, não
 * só a janela): `piso = round(teto * volumeTemaNoStore / volumeAbaNoStore)`,
 * com mínimo de 1 para qualquer tema que tenha ao menos 1 candidato DENTRO
 * da janela desta faixa (tema sem candidato na janela não recebe piso — não
 * força apresentar o que não existe). Se a soma dos pisos ultrapassar o
 * teto — pode acontecer com muitos temas pequenos e teto curto, não é o caso
 * medido hoje (máx. 3 temas por aba) — os pisos maiores que 1 são reduzidos
 * um a um até a soma caber.
 *
 * MECANISMO CIRÚRGICO, não realocação por cota: a seleção base continua
 * sendo o top-`teto` por SCORE puro (7b, C9 inalterados). Só quando um tema
 * fica ABAIXO do próprio piso na seleção base, o item de MENOR score entre
 * os temas que estão ACIMA do próprio piso é trocado pelo melhor candidato
 * ainda de fora daquele tema. Um tema que já bate o piso sozinho (a maioria
 * dos casos, ex.: `ia/reddit-hn`) não perde nenhuma vaga por causa do piso
 * de outro tema — só EMPRESTA a vaga que já era excedente ao próprio piso.
 */
function pisosPorTema(candidatosPorTema, volumePorTema, volumeAba, teto) {
  const pisos = new Map();
  for (const [tema, lista] of candidatosPorTema) {
    const vol = volumePorTema.get(tema) || 0;
    const bruto = volumeAba > 0 ? Math.round((teto * vol) / volumeAba) : 0;
    pisos.set(tema, Math.min(Math.max(1, bruto), lista.length));
  }
  let soma = [...pisos.values()].reduce((a, b) => a + b, 0);
  while (soma > teto) {
    let maiorTema = null;
    let maiorValor = 1;
    for (const [tema, v] of pisos) {
      if (v > maiorValor) {
        maiorValor = v;
        maiorTema = tema;
      }
    }
    if (!maiorTema) break; // todos já em 1 — mais temas com candidato do que vagas, caso não observado no store real
    pisos.set(maiorTema, maiorValor - 1);
    soma--;
  }
  return pisos;
}

function selecionarComPiso(representantes, teto, volumePorTema, volumeAba) {
  if (representantes.length <= teto) return representantes.slice(0, teto);

  const candidatosPorTema = new Map();
  for (const r of representantes) {
    const tema = r.tabela || '';
    if (!candidatosPorTema.has(tema)) candidatosPorTema.set(tema, []);
    candidatosPorTema.get(tema).push(r); // já vem ordenado por score (representantes está ordenado)
  }
  const pisos = pisosPorTema(candidatosPorTema, volumePorTema, volumeAba, teto);

  const selecionados = representantes.slice(0, teto);
  const selSet = new Set(selecionados);

  const contagemPorTema = () => {
    const c = new Map();
    for (const r of selecionados) {
      const t = r.tabela || '';
      c.set(t, (c.get(t) || 0) + 1);
    }
    return c;
  };

  for (const [tema, piso] of pisos) {
    let faltam = piso - (contagemPorTema().get(tema) || 0);
    if (faltam <= 0) continue;
    const foraDaSelecao = candidatosPorTema.get(tema).filter(r => !selSet.has(r));

    for (let i = 0; i < faltam && i < foraDaSelecao.length; i++) {
      const contagem = contagemPorTema();
      let piorIdx = -1;
      let piorScore = Infinity;
      for (let j = 0; j < selecionados.length; j++) {
        const t2 = selecionados[j].tabela || '';
        const piso2 = pisos.get(t2) || 0;
        if ((contagem.get(t2) || 0) > piso2 && scoreDe(selecionados[j]) < piorScore) {
          piorScore = scoreDe(selecionados[j]);
          piorIdx = j;
        }
      }
      if (piorIdx === -1) break; // não há vaga excedente de outro tema pra ceder — não força furar piso alheio

      const entra = foraDaSelecao[i];
      selSet.delete(selecionados[piorIdx]);
      selecionados.splice(piorIdx, 1, entra);
      selSet.add(entra);
    }
  }

  return selecionados.sort((a, b) => scoreDe(b) - scoreDe(a) || dataMsDe(b) - dataMsDe(a));
}

/**
 * ONDA 7a + 7d + 10c + C9 + 7e-2 + C10 — a cascata inteira, calculada por ABA.
 *
 * CORREÇÃO C9 (radar-crm-20-ondas.md §Bloco C), registrada aqui porque um
 * comentário que descreve a granularidade revogada vira mentira no arquivo:
 * a Onda 7 original agrupava por `(aba, tabela)` — cada bloco temático
 * (`ia-geral`, `reddit-hn`, `claude`...) tinha seu PRÓPRIO top 20, o que na
 * aba `ia` (4 tabelas) geraria 4 × 3 faixas × até 20 = até 240 linhas. Erro
 * de briefing, não de código: o pedido literal de JB — "quero que **as
 * abas** de notícias, ia, trabalho e ciência mostrem até 20 notícias... top
 * 20 dos últimos 3/7/30 dias" — tem a ABA como sujeito. A chave de
 * agrupamento passou a ser só `aba`; os temas (antigo `tabela`) de uma aba
 * agora COMPETEM pelos 20 lugares de cada faixa. `tabela` continua gravado
 * em cada registro (vira coluna filtrável na planilha, Onda 9) — só deixou
 * de ser eixo de agrupamento da cascata.
 *
 * O QUE ELA FAZ, em ordem, para cada ABA independentemente:
 *
 *   1. Para cada janela da cascata (C10: hoje, depois 7d, depois 15d, depois
 *      30d, NESSA ordem): filtra os candidatos daquela aba dentro da janela
 *      (dia civil corrente pra `hoje`; corte de dias pras outras três — ver
 *      abaixo), EXCLUINDO qualquer item já selecionado numa janela ANTERIOR
 *      desta mesma cascata (7a — "a de 30d exclui o que já saiu em hoje, em
 *      7d E em 15d": o conjunto de exclusão é CUMULATIVO, não só da janela
 *      imediatamente anterior — é o que garante interseção vazia entre as
 *      QUATRO faixas, não só entre pares consecutivos). C10-b/
 *      `CASCATA_INCLUI_MES` decide se a janela de 30d PARTICIPA dessa
 *      exclusão cumulativa (adotado: sim) — ver o comentário na constante.
 *   2. DENTRO de cada janela, colapsa duplicata em DOIS NÍVEIS (10c + o
 *      CONSERTO desta Onda — RELATORIO-ONDA-5-6.md/8-9.md §Pendências, "20
 *      urls no store têm mais de um cluster_id distinto", 3 delas visíveis
 *      como repetição real entre tabelas):
 *        a. por `cluster_id` — um cluster ocupa UMA linha, representada
 *           pelo item de maior `score` (empate: `data_ms` mais recente).
 *        b. por URL CANÔNICA (`r.link` — já é a forma canônica: o
 *           coletor grava `item.linkCanonico || item.link`, `noticias.js`
 *           linha ~135) — porque um MESMO artigo pode gerar DOIS
 *           `cluster_id` distintos (título re-editado entre coletas, ou
 *           duas fontes servindo a mesma matéria com título ligeiramente
 *           diferente), e dedupe só por `cluster_id` deixava as duas
 *           linhas passarem como se fossem notícias diferentes. O passo
 *           (b) roda DEPOIS de (a), sobre os representantes de cluster +
 *           os itens solo: dois representantes com a MESMA url viram um
 *           só (o de maior score).
 *      Nenhum dos dois passos remove nada do STORE — os outros membros
 *      continuam existindo e continuam candidatos em janelas seguintes
 *      (doutrina de `lib/store.js:61-65`, "preferir a duplicata visível ao
 *      sumiço invisível" — aqui aplicada à APRESENTAÇÃO via `faixa`, nunca
 *      ao dado persistido).
 *   3. Ordena os representantes por score desc, `data_ms` desc como
 *      desempate (7b), e toma os `teto` primeiros (7d — 20, não 8).
 *
 * A janela `hoje` (C10) NÃO é "últimas 24h": é o dia CIVIL, no fuso de JB
 * (`diaLote`, o mesmo eixo que já governa o percentil). Um item cai em
 * `hoje` quando `diaLote(item.data_ms) === diaLote(agora)` — sem corte por
 * milissegundos, então a exclusão cumulativa das janelas seguintes já
 * elimina qualquer sobreposição sem precisar de aritmética de "resto do
 * dia".
 *
 * MUTA os registros — mesmo padrão de `calcularScores`: cada um recebe
 * `.faixa` ('hoje'|'7d'|'15d'|'30d'|'') e `.posicao` (1..teto ou `null`).
 * IDEMPOTENTE: a primeira coisa que a função faz é resetar `faixa`/
 * `posicao` em TODOS os itens recebidos, então rodar duas vezes sobre o
 * mesmo array recalcula do zero, nunca acumula.
 */
function calcularFaixasNoticia(registros, { agora = Date.now(), teto = TETO_FAIXA_NOTICIA } = {}) {
  const lista = Array.isArray(registros) ? registros : [];

  for (const r of lista) {
    r.faixa = '';
    r.posicao = null;
  }

  const diaHoje = diaLote(agora);

  const grupos = new Map();
  for (const r of lista) {
    const chave = r.aba || '';
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push(r);
  }

  for (const grupo of grupos.values()) {
    // 7e-2 — volume por tema NO STORE (toda a aba, não só a janela): a base
    // do piso derivado. Calculado uma vez por aba, fora do loop de faixas.
    const volumePorTema = new Map();
    for (const r of grupo) {
      const tema = r.tabela || '';
      volumePorTema.set(tema, (volumePorTema.get(tema) || 0) + 1);
    }
    const volumeAba = grupo.length;

    // Cumulativo entre as janelas desta cascata — não é reiniciado a cada
    // passo (ver ponto 1 do cabeçalho). TRÊS conjuntos porque a exclusão
    // precisa valer pra item COM `cluster_id` (por valor — outro registro do
    // mesmo cluster também tem que ser barrado), pra item COM url (o
    // CONSERTO desta Onda — um artigo pode reaparecer com `cluster_id`
    // diferente, e é a URL que identifica que é o MESMO artigo) e pra item
    // SEM nenhum dos dois (por IDENTIDADE do objeto — não há chave de
    // agrupamento nenhuma pra ele). Sem o terceiro conjunto, um item sem
    // cluster nem link que ficasse dentro de várias janelas seria
    // selecionado mais de uma vez e a última janela apagaria a `faixa` das
    // anteriores.
    const excluidosCluster = new Set();
    const excluidosUrl = new Set();
    const excluidosSolo = new Set();

    FAIXAS_CASCATA.forEach((entrada, indiceFaixa) => {
      const { faixa, dias, diaCorrente } = entrada;
      // C10-b — a janela de 30d só entra na exclusão cumulativa se
      // `CASCATA_INCLUI_MES` estiver ligada (adotado). Com ela desligada, a
      // ÚLTIMA janela da cascata vira top-20 puro do mês, sem descartar
      // candidato por já ter aparecido nas anteriores — mas ainda assim não
      // aparece REPETIDA dentro de si mesma (o colapso do passo 2 continua
      // valendo sempre, dentro da própria janela).
      const ehUltimaFaixa = indiceFaixa === FAIXAS_CASCATA.length - 1;
      const aplicaExclusaoCumulativa = !ehUltimaFaixa || CASCATA_INCLUI_MES;

      const candidatos = grupo.filter(r => {
        if (!Number.isFinite(r.data_ms)) return false;
        if (diaCorrente) {
          if (diaLote(r.data_ms) !== diaHoje) return false;
        } else if (r.data_ms < agora - dias * 86400000) {
          return false;
        }
        if (!aplicaExclusaoCumulativa) return true;
        if (r.cluster_id && excluidosCluster.has(r.cluster_id)) return false;
        if (r.link && excluidosUrl.has(r.link)) return false;
        if (!r.cluster_id && !r.link && excluidosSolo.has(r)) return false;
        return true;
      });

      // 10c — um representante por cluster, dentro desta janela. Item SEM
      // `cluster_id` não passa por este colapso — é candidato à parte, cada
      // um por si (nunca colide com outro solo: usar um fallback como
      // `r.id` pra chave seria frágil no exato caso comum de fixture de
      // teste sem `id`, onde todos colidiriam na MESMA chave falsa).
      const porCluster = new Map();
      const solos = [];
      for (const r of candidatos) {
        if (!r.cluster_id) {
          solos.push(r);
          continue;
        }
        const atual = porCluster.get(r.cluster_id);
        if (!atual || scoreDe(r) > scoreDe(atual) || (scoreDe(r) === scoreDe(atual) && dataMsDe(r) > dataMsDe(atual))) {
          porCluster.set(r.cluster_id, r);
        }
      }

      // CONSERTO desta Onda — segundo nível de colapso, por URL CANÔNICA
      // (`r.link`). Roda DEPOIS do colapso por cluster: dois representantes
      // de CLUSTERS DIFERENTES podem ser o MESMO artigo (mesma url, título
      // re-editado entre coletas gerou `cluster_id` novo) — sem este passo,
      // as duas linhas sobreviviam como se fossem notícias distintas. Item
      // sem `link` não passa por este colapso (mesmo raciocínio do solo por
      // cluster acima: uma chave vazia colidiria itens sem url nenhuma).
      const porUrl = new Map();
      const semUrl = [];
      for (const r of [...porCluster.values(), ...solos]) {
        if (!r.link) {
          semUrl.push(r);
          continue;
        }
        const atual = porUrl.get(r.link);
        if (!atual || scoreDe(r) > scoreDe(atual) || (scoreDe(r) === scoreDe(atual) && dataMsDe(r) > dataMsDe(atual))) {
          porUrl.set(r.link, r);
        }
      }

      const representantes = [...porUrl.values(), ...semUrl]
        .sort((a, b) => scoreDe(b) - scoreDe(a) || dataMsDe(b) - dataMsDe(a));

      const selecionados = selecionarComPiso(representantes, teto, volumePorTema, volumeAba);

      selecionados.forEach((r, i) => {
        r.faixa = faixa;
        r.posicao = i + 1;
        if (!aplicaExclusaoCumulativa) return; // C10-b: não alimenta exclusão pra além desta (é a última faixa)
        if (r.cluster_id) excluidosCluster.add(r.cluster_id);
        if (r.link) excluidosUrl.add(r.link);
        if (!r.cluster_id && !r.link) excluidosSolo.add(r);
      });
    });
  }

  return lista;
}

/**
 * ONDA 7a — `aplicarRecorte` GANHA A EXCLUSÃO. Antes, cada nome de recorte
 * era um filtro+sort independente sobre a janela de dias. Agora, os três
 * nomes são só uma VISÃO da mesma cascata (`calcularFaixasNoticia`): filtra
 * o `faixa` correspondente e ordena por `posicao` (que já embute score
 * desc + data_ms desc, ver acima). Continua aceitando `limite` para quem
 * quiser truncar abaixo do teto de 20 (o CLI `recorte --limite N`).
 */
function aplicarRecorte(registros, nome, { agora = Date.now(), limite = null } = {}) {
  if (!RECORTES[nome]) {
    throw new Error('recorte desconhecido: ' + nome + ' (use ' + Object.keys(RECORTES).join('|') + ')');
  }
  const faixaAlvo = FAIXA_POR_RECORTE[nome];
  const comFaixas = calcularFaixasNoticia(registros || [], { agora });
  const out = comFaixas.filter(r => r.faixa === faixaAlvo).sort((a, b) => (a.posicao || 0) - (b.posicao || 0));
  return limite ? out.slice(0, limite) : out;
}

module.exports = {
  carregarConfig,
  casaTermo,
  perfilBump,
  sinalBruto,
  percentilMeioRank,
  calcularScores,
  diaLote,
  aplicarRecorte,
  calcularFaixasNoticia,
  pisosPorTema,
  selecionarComPiso,
  RECORTES,
  FAIXAS_CASCATA,
  FAIXA_POR_RECORTE,
  TETO_FAIXA_NOTICIA,
  CASCATA_INCLUI_MES,
  REPERCUSSAO_MAX
};
