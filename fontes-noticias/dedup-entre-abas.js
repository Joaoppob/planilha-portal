'use strict';

const { gerarIdNoticia } = require('../lib-noticias/store-noticias');

/**
 * DEDUP DE NOTÍCIA ENTRE ABAS — a política que faltava (achado C6 do plano
 * `radar-crm-20-ondas.md`: `deduparGlobal`, em `noticias.js`, dedupa por
 * `id` — sha256 de link canônico + título — mas `id` NÃO carrega a aba. Se o
 * MESMO link+título chegasse hoje de duas fontes com abas diferentes, o
 * `Map` de `deduparGlobal` guardaria só o PRIMEIRO que aparecesse na ordem
 * de `brutos`, que é a ordem de `listaFontes` em `fontes-noticias/index.js`
 * — desempate por ACIDENTE de registro, não por decisão. Isso hoje não se
 * manifesta porque as URLs das fontes não se cruzam; a Onda 11 (fontes
 * novas) cria exatamente essa possibilidade — ex.: um item da Agência
 * Brasil pode aparecer tanto em `rss/ultimasnoticias` (roteado para
 * geral/brasil) quanto em `rss/economia` (roteado para trabalho/
 * mercado-trabalho) com o MESMO link+título.
 *
 * DECISÃO DE POLÍTICA: cada notícia pertence a UMA aba só. Precedência
 * declarada por ESPECIFICIDADE de aba — nunca a ordem de um array de
 * registro:
 *
 *   ciencia > ia > trabalho > geral
 *
 * `ciencia` e `ia` são os domínios mais ESPECÍFICOS/nicho desta trilha — um
 * item que é genuinamente sobre um paper ou sobre um lançamento de modelo
 * não pode perder para ter sido também capturado por um feed genérico de
 * "geral". `trabalho` é o próximo mais específico (concurso/mercado de
 * trabalho é mais acionável pra JB do que enterrado em notícia genérica de
 * Brasil). `geral` é o catch-all — por construção, o que sobra quando
 * nenhuma aba mais específica reclamou o item, então perde todo desempate.
 * Ela é uma ordem NOMEADA e testada (`ORDEM_PRECEDENCIA_ABA` abaixo), não um
 * efeito colateral de `Array.prototype` — é exatamente o que o briefing
 * pede para não fazer ("não deixe o desempate ser a ordem de um array").
 *
 * ONDE ISSO SE ENCAIXA NO PIPELINE (nota de integração, não implementada
 * aqui): o lugar certo para chamar `resolverDuplicataEntreAbas` é dentro de
 * `noticias.js:deduparGlobal`, depois do dedupe por id igual-aba e antes do
 * roteamento. Esta Onda (11) tem escopo travado em `fontes-noticias/` e não
 * inclui `noticias.js` — a fiação de 1 linha fica registrada no relatório
 * da Onda como pendência explícita para quem tiver `noticias.js` liberado.
 */
const ORDEM_PRECEDENCIA_ABA = ['ciencia', 'ia', 'trabalho', 'geral'];

/** Aba fora da ordem declarada perde de tudo — nunca trava, só nunca vence um desempate. */
function precedenciaAba(aba) {
  const i = ORDEM_PRECEDENCIA_ABA.indexOf(aba);
  return i === -1 ? ORDEM_PRECEDENCIA_ABA.length : i;
}

/**
 * Resolve duplicata do MESMO fato (mesmo link canônico + título, portanto
 * mesmo `id` de `store.gerarIdNoticia`) chegando de fontes com abas
 * diferentes. Função PURA — não depende da ordem de entrada de `itens`
 * (é isso que o teste em `tests/dedup-entre-abas.test.js` trava, embaralhando
 * a ordem de entrada e exigindo o MESMO vencedor).
 *
 * Item com a MESMA aba não é problema desta função — esse é o dedupe
 * intra-aba que `noticias.js:deduparGlobal` já cobre (mantém o primeiro).
 *
 * @param {Array} itens itens já identificados (têm `id`, `aba`) OU brutos
 *        (têm `linkCanonico`/`link` + `titulo`, e `id` é recalculado aqui).
 * @returns {{itens: Array, removidos: number, decisoes: Array}}
 *   `decisoes` carrega cada conflito resolvido — qual aba venceu, qual
 *   perdeu, e o título — para o relatório poder auditar sem reexecutar nada.
 */
function resolverDuplicataEntreAbas(itens) {
  const porChave = new Map();
  let removidos = 0;
  const decisoes = [];

  for (const item of Array.isArray(itens) ? itens : []) {
    const link = item.linkCanonico || item.link;
    const chave = item.id || gerarIdNoticia({ link, titulo: item.titulo });
    const atual = porChave.get(chave);

    if (!atual) {
      porChave.set(chave, item);
      continue;
    }

    if (atual.aba === item.aba) {
      // mesma aba: fora do escopo desta função (dedupe intra-aba é
      // `deduparGlobal`). Mantém o que já estava, não conta como decisão de
      // POLÍTICA entre abas.
      continue;
    }

    const pAtual = precedenciaAba(atual.aba);
    const pNovo = precedenciaAba(item.aba);
    let vencedor;
    let perdedor;
    if (pNovo < pAtual) {
      vencedor = item;
      perdedor = atual;
      porChave.set(chave, item);
    } else {
      vencedor = atual;
      perdedor = item;
    }
    removidos++;
    decisoes.push({
      chave,
      titulo: vencedor.titulo,
      abaVencedora: vencedor.aba,
      abaPerdedora: perdedor.aba
    });
  }

  return { itens: Array.from(porChave.values()), removidos, decisoes };
}

module.exports = { ORDEM_PRECEDENCIA_ABA, precedenciaAba, resolverDuplicataEntreAbas };
