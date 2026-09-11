'use strict';

const crypto = require('crypto');
const { jaccard, contarIntersecao, filtrarFrequentes } = require('./ancoras');

/**
 * DEDUPE POR CLUSTER — "o mesmo fato em muitos veículos".
 *
 * Um cluster é um conjunto de itens que o método julga serem o MESMO fato.
 * O sinal de repercussão não é o tamanho do cluster: é o número de DOMÍNIOS
 * DISTINTOS nele (`n_veiculos`). Dez posts do mesmo portal continuam sendo
 * um veículo.
 *
 * ---
 * OS PREDICADOS DE LIGAÇÃO (conforme o reconhecimento, §Detecção de fato
 * repetido, passo 3):
 *
 *   1. |Δt| <= JANELA_HORAS (±36h)
 *   2. interseção de âncoras não-vazia   (garantida de graça pelo índice
 *      invertido: só viram par candidato itens que já compartilham âncora)
 *   3. Jaccard(âncoras) >= LIMIAR_JACCARD
 *   + domínios diferentes (ver abaixo)
 *
 * ---
 * O LIMIAR NÃO ESTÁ TRAVADO — E ISSO É DE PROPÓSITO.
 *
 * O reconhecimento recomenda 0,3-0,4 e diz explicitamente para calibrar com
 * dado real. `LIMIAR_JACCARD` é constante nomeada, sobrescrevível por
 * parâmetro (`opcoes.limiarJaccard`) e por env (`RADAR_NOTICIAS_JACCARD`).
 * Além disso, `clusterizar` devolve `distribuicaoJaccard` — TODOS os valores
 * de Jaccard dos pares candidatos, não só os que passaram. É esse vetor que
 * permite calibrar o limiar depois com evidência em vez de opinião. Um
 * limiar escolhido a dedo e nunca conferido é exatamente a regra escrita que
 * ninguém confere.
 *
 * ---
 * CLUSTER NÃO CRUZA IDIOMA (decisão de Durin, com o motivo do próprio
 * reconhecimento): "um fato coberto em português (G1) e em inglês
 * (Guardian/NYT) sobre o mesmo evento internacional não compartilha token
 * nenhum sem tradução". Rodar o método entre línguas não produz
 * falso-positivo — produz ZERO ligação, gastando O(n²) para nada, e cria a
 * ilusão de que a cobertura internacional "não repercutiu". Clusterizo
 * DENTRO de cada (aba, idioma) e devolvo os dois sinais separados. Nenhuma
 * tradução, nenhuma equivalência inventada.
 *
 * ---
 * DUAS CLASSES DE LIGAÇÃO, DOIS LIMIARES — divergência declarada, com a
 * evidência do próprio reconhecimento.
 *
 * O passo 3 pede "domínios diferentes" como condição de ligação. Aplicado
 * ao pé da letra, ele deixa passar um caso que o MESMO reconhecimento
 * descreve como correto de agrupar: o Estratégia Concursos publicou
 * "Concurso Câmara de Rio Branco: IDIB é a banca para 15 vagas" e "Concurso
 * Câmara de Rio Branco: banca definida para 15 vagas" — mesma fonte, mesmo
 * fato, duas linhas na planilha. Por isso há DOIS predicados:
 *
 *   - INTER-domínio (`LIMIAR_JACCARD`, o do reconhecimento): é o que forma
 *     repercussão e o que faz `n_veiculos` subir.
 *   - INTRA-domínio (`LIMIAR_JACCARD_INTRA`, mais ALTO — 0,60): colapsa a
 *     republicação do mesmo veículo numa linha só. **Não mexe em
 *     `n_veiculos`**, que continua contando domínios distintos. É higiene de
 *     planilha, não sinal de repercussão.
 *
 * Os dois valores de Jaccard entram na distribuição, rotulados
 * (`tipo: 'inter' | 'intra'`), justamente para que a calibração futura possa
 * tratá-los como as duas populações diferentes que são.
 *
 * ---
 * SOBRE `fusoesIntraDominio` — leia o que ele mede antes de usar. Ele conta
 * as fusões intra-domínio que EFETIVAMENTE uniram dois clusters até então
 * separados (`uf.unir` devolvendo `true`), não o número de pares
 * intra-domínio acima do limiar. Quando um par já foi unido indiretamente
 * por uma ligação inter-domínio, a fusão intra vira no-op e não é contada.
 * Consequência medida: o mesmo lote, clusterizado em ORDEM diferente
 * (coleta vs. `recalcular`, que lê o store ordenado por data), deu 50 e 40
 * para este contador — enquanto o número de clusters ficou idêntico (1071)
 * nas duas. O RESULTADO é estável; este contador é um diagnóstico
 * sensível à ordem de travessia. Para uma contagem independente de ordem,
 * use `distribuicaoJaccard.filter(d => d.tipo === 'intra' && d.ligou)`.
 *
 * ---
 * CONSERTO 1 (prova de clustering, tmp/prova-noticias-2.log, Erro 2) — PISO
 * DE INTERSEÇÃO ABSOLUTA, além da razão.
 *
 * Jaccard é RELATIVO: com conjuntos pequenos, um único elemento em comum já
 * produz razão alta. O caso medido: "Governo não espera solução rápida para
 * tarifaço... com os EUA" tem âncoras {governo, eua}; "EUA iniciam ondas de
 * revogação dos vistos..." tem âncora {eua} sozinha. |A∩B| = 1, mas
 * J = 1/2 = 0,50 — muito acima do LIMIAR_JACCARD (0,34) — e o tarifaço
 * agrupou com a revogação de vistos, dois fatos completamente diferentes que
 * só coincidem em citar "EUA". O mesmo mecanismo religou o título da
 * revogação em massa ({eua, 200}) ao mesmo terceiro título por J = 0,50 com
 * |A∩B| = 1 de novo — CONFIRMADO por medição direta (`node -e` sobre os três
 * títulos): as duas ligações que formam o cluster têm interseção 1.
 *
 * `PISO_INTERSECAO_ABSOLUTA` exige |A∩B| >= piso ALÉM do Jaccard >= limiar.
 * MEDIDO sobre o store da prova (1261 itens) antes de fixar o valor — ver
 * `RELATORIO-CONSERTO-CLUSTERING.md` (ou o log da sessão que fechou este
 * conserto) para a tabela piso=1/2/3: piso=1 é o comportamento atual (não
 * muda nada); piso=2 fecha o Erro 2 sem quebrar o cluster do Mladić (4
 * domínios, interseção >=3 em todo par) nem os clusters G1/Folha de 2
 * veículos medidos (interseção >=2 nesses casos, quando os dois títulos
 * cobrem o MESMO fato específico); piso=3 já reduz clusters legítimos de
 * cobertura enxuta (títulos curtos, 2-3 âncoras) e por isso não foi adotado.
 * Piso é constante nomeada e configurável (opção + env), no padrão do
 * `LIMIAR_JACCARD`.
 *
 * ---
 * CONSERTO 2 (prova de clustering, Erro de transitividade "eleições") —
 * REPRESENTANTE DO CLUSTER, não só o vizinho.
 *
 * Union-Find, no seu uso mais simples, liga A-B e depois B-C mesmo que A e C
 * não se pareçam nada — a "corrente de amigos" clássica. Foi assim que um
 * cluster de 17 itens sobre corrida eleitoral (Lula, Flávio Bolsonaro,
 * Caiado, pesquisas Quaest de estados sem relação nenhuma entre si) se
 * formou: cada item liga ao PRÓXIMO por um par de âncoras em comum, mas o
 * primeiro e o último item do cluster não compartilham nada.
 *
 * Correção adotada — das três listadas no briefing (representante do
 * cluster; teto de tamanho; densidade mínima de arestas) escolhi a
 * primeira: exigir que a NOVA ligação entre dois componentes também valha
 * entre um REPRESENTANTE de cada componente, não só entre o par (i, j) que
 * disparou a candidatura. Motivo de preferir esta às outras duas: teto de
 * tamanho é arbitrário e cego ao conteúdo (quebraria igualmente o cluster do
 * Mladić se ele por acaso tivesse mais itens, e deixaria passar uma corrente
 * de 14 itens tão ruim quanto a de 17); densidade de arestas exige O(n²)
 * para cada tentativa de fusão. Representante é O(1) por tentativa, reusa a
 * MESMA função `jaccard`/`contarIntersecao` já calculada para o piso, e
 * ataca o mecanismo exato do defeito (a ligação B-C não implica A-C).
 *
 * Implementação: cada item começa como representante de si mesmo. Quando
 * `unir(i, j)` funde as raízes `ra` e `rb`, `ra` (a raiz do primeiro
 * argumento) sobrevive — API do `UnionFind` abaixo, nunca alterada por este
 * conserto. Logo o representante de um componente é sempre o item de MENOR
 * índice já absorvido por ele, e nunca muda depois de fixado. Antes de unir
 * dois componentes JÁ EXISTENTES (raízes diferentes), a condição extra exige
 * Jaccard(representante A, representante B) >= limiar do par E interseção
 * absoluta >= piso — os MESMOS dois portões do CONSERTO 1, aplicados contra
 * a origem do componente, não contra o vizinho que apareceu por último.
 * Efeito colateral honesto: qual item vira representante depende da ordem
 * de travessia do índice invertido (mesma sensibilidade à ordem já descrita
 * acima para `fusoesIntraDominio`) — o RESULTADO (quais componentes ficam
 * de pé) é o que a prova mede, não a identidade do representante.
 */

const LIMIAR_JACCARD = Number(process.env.RADAR_NOTICIAS_JACCARD || 0.34);
const LIMIAR_JACCARD_INTRA = Number(process.env.RADAR_NOTICIAS_JACCARD_INTRA || 0.6);
const JANELA_HORAS = Number(process.env.RADAR_NOTICIAS_JANELA_HORAS || 36);
const PISO_INTERSECAO_ABSOLUTA = Number(process.env.RADAR_NOTICIAS_PISO_INTERSECAO || 2);
const MS_POR_HORA = 3600000;

class UnionFind {
  constructor(n) {
    this.pai = Array.from({ length: n }, (_, i) => i);
  }
  achar(x) {
    while (this.pai[x] !== x) {
      this.pai[x] = this.pai[this.pai[x]];
      x = this.pai[x];
    }
    return x;
  }
  unir(a, b) {
    const ra = this.achar(a);
    const rb = this.achar(b);
    if (ra === rb) return false;
    this.pai[rb] = ra;
    return true;
  }
}

/**
 * `cluster_id` = sha256 dos ids dos membros ORDENADOS, truncado em 16 hex
 * (mesmo padrão de `lib/hash.js gerarId`, que trunca em 20).
 *
 * Consequência honesta e assumida: se a composição do cluster mudar numa
 * rodada seguinte (um sexto veículo publica sobre o mesmo fato), o
 * `cluster_id` MUDA. Não é bug — é um cluster diferente, com uma contagem de
 * veículos diferente. A alternativa (ancorar o id no membro mais antigo)
 * daria estabilidade aparente escondendo a mudança de composição, que é
 * exatamente o dado que importa aqui. Item solitário também recebe
 * cluster_id (cluster de 1) — nunca `null`, para que a planilha não precise
 * de um caso especial.
 */
function gerarClusterId(idsMembros) {
  const chave = Array.from(idsMembros).sort().join('|');
  return crypto.createHash('sha256').update(chave, 'utf8').digest('hex').slice(0, 16);
}

/**
 * @param {Array} itens  cada um: { id, titulo, dominio, dataMs, aba, idioma, ancoras:string[] }
 * @param {Object} opcoes { limiarJaccard, limiarJaccardIntra, janelaHoras, limiarDF, pisoIntersecao }
 * @returns {{clusters:Array, porItem:Map, distribuicaoJaccard:Array,
 *            ancorasCortadas:Array, fusoesIntraDominio:number, parametros:Object}}
 */
function clusterizar(itens, opcoes = {}) {
  const limiar = Number.isFinite(opcoes.limiarJaccard) ? opcoes.limiarJaccard : LIMIAR_JACCARD;
  const limiarIntra = Number.isFinite(opcoes.limiarJaccardIntra) ? opcoes.limiarJaccardIntra : LIMIAR_JACCARD_INTRA;
  const janelaMs = (Number.isFinite(opcoes.janelaHoras) ? opcoes.janelaHoras : JANELA_HORAS) * MS_POR_HORA;
  const limiarDF = Number.isFinite(opcoes.limiarDF) ? opcoes.limiarDF : 0.15;
  const piso = Number.isFinite(opcoes.pisoIntersecao) ? opcoes.pisoIntersecao : PISO_INTERSECAO_ABSOLUTA;

  const lista = Array.isArray(itens) ? itens : [];
  const distribuicaoJaccard = [];
  const ancorasCortadas = [];
  let fusoesIntraDominio = 0;

  // (aba, idioma) — as duas fronteiras que o cluster NUNCA cruza.
  const grupos = new Map();
  for (const item of lista) {
    const chave = (item.aba || '?') + '::' + (item.idioma || '?');
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push(item);
  }

  const clusters = [];
  const porItem = new Map();

  for (const [chaveGrupo, grupo] of grupos) {
    // DF medida DENTRO do grupo — "Trump" é genérico na aba Geral/en e
    // específico na aba Ciência; medir globalmente misturaria os dois.
    const { conjuntos, cortadas, aplicado } = filtrarFrequentes(
      grupo.map(i => new Set(i.ancoras || [])),
      { limiarDF }
    );
    if (aplicado && cortadas.length) {
      ancorasCortadas.push({ grupo: chaveGrupo, cortadas: cortadas.slice(0, 25), total: cortadas.length });
    }

    // Índice invertido: âncora -> índices. Garante o predicado 2 (interseção
    // não-vazia) sem varrer O(n²) de pares que nunca poderiam ligar.
    const indice = new Map();
    conjuntos.forEach((c, i) => {
      for (const a of c) {
        if (!indice.has(a)) indice.set(a, []);
        indice.get(a).push(i);
      }
    });

    const uf = new UnionFind(grupo.length);
    const paresVistos = new Set();
    // CONSERTO 2 — representante do componente: cada item começa como
    // representante de si mesmo; nunca é reatribuído (ver docstring acima).
    const representante = conjuntos;

    for (const [, posts] of indice) {
      for (let x = 0; x < posts.length; x++) {
        for (let y = x + 1; y < posts.length; y++) {
          const i = posts[x];
          const j = posts[y];
          const chavePar = i < j ? i + ':' + j : j + ':' + i;
          if (paresVistos.has(chavePar)) continue;
          paresVistos.add(chavePar);

          const A = grupo[i];
          const B = grupo[j];

          // predicado 1 — janela temporal. Item sem data não liga com
          // ninguém: sem data não há como afirmar "mesma janela".
          if (!Number.isFinite(A.dataMs) || !Number.isFinite(B.dataMs)) continue;
          if (Math.abs(A.dataMs - B.dataMs) > janelaMs) continue;

          const mesmoDominio = Boolean(A.dominio && B.dominio && A.dominio === B.dominio);
          const j2 = jaccard(conjuntos[i], conjuntos[j]);
          const interAbs = contarIntersecao(conjuntos[i], conjuntos[j]);
          const limiarPar = mesmoDominio ? limiarIntra : limiar;

          // CONSERTO 1 — piso de interseção absoluta, além da razão.
          let uniu = false;
          if (j2 >= limiarPar && interAbs >= piso) {
            const ri = uf.achar(i);
            const rj = uf.achar(j);
            let podeUnir = ri === rj; // já é o mesmo cluster — nada a fazer
            if (!podeUnir) {
              // CONSERTO 2 — a ligação também precisa valer contra o
              // REPRESENTANTE de cada componente, não só entre (i, j).
              const jRep = jaccard(representante[ri], representante[rj]);
              const interRep = contarIntersecao(representante[ri], representante[rj]);
              podeUnir = jRep >= limiarPar && interRep >= piso;
            }
            if (podeUnir) {
              uniu = uf.unir(i, j);
              if (mesmoDominio && uniu) fusoesIntraDominio++;
            }
          }

          distribuicaoJaccard.push({
            grupo: chaveGrupo,
            tipo: mesmoDominio ? 'intra' : 'inter',
            valor: Number(j2.toFixed(4)),
            interAbsoluta: interAbs,
            ligou: uniu,
            a: A.titulo,
            b: B.titulo
          });
        }
      }
    }

    const porRaiz = new Map();
    grupo.forEach((item, i) => {
      const r = uf.achar(i);
      if (!porRaiz.has(r)) porRaiz.set(r, []);
      porRaiz.get(r).push(item);
    });

    for (const membros of porRaiz.values()) {
      const ids = membros.map(m => m.id);
      const clusterId = gerarClusterId(ids);
      const dominios = Array.from(new Set(membros.map(m => m.dominio).filter(Boolean)));
      const datas = membros.map(m => m.dataMs).filter(d => Number.isFinite(d));
      const cluster = {
        cluster_id: clusterId,
        aba: membros[0].aba || null,
        idioma: membros[0].idioma || null,
        membros: ids,
        titulos: membros.map(m => m.titulo),
        dominios,
        n_veiculos: dominios.length,
        n_itens: membros.length,
        data_min_ms: datas.length ? Math.min(...datas) : null,
        data_max_ms: datas.length ? Math.max(...datas) : null
      };
      clusters.push(cluster);
      for (const id of ids) porItem.set(id, cluster);
    }
  }

  return {
    clusters,
    porItem,
    distribuicaoJaccard,
    ancorasCortadas,
    fusoesIntraDominio,
    parametros: {
      limiarJaccard: limiar,
      limiarJaccardIntra: limiarIntra,
      janelaHoras: janelaMs / MS_POR_HORA,
      limiarDF,
      pisoIntersecao: piso
    }
  };
}

/**
 * Histograma da distribuição observada, em faixas de 0,05, separado por
 * `tipo` (inter/intra). É o artefato de calibração: o limiar futuro deve ser
 * lido DAQUI, contra os pares reais, não escolhido de novo a dedo.
 */
function histogramaJaccard(distribuicao, { passo = 0.05 } = {}) {
  const porTipo = { inter: new Map(), intra: new Map() };
  const totais = { inter: 0, intra: 0 };
  for (const d of distribuicao || []) {
    const tipo = d.tipo === 'intra' ? 'intra' : 'inter';
    const faixa = Math.min(Math.floor(d.valor / passo), Math.round(1 / passo) - 1);
    porTipo[tipo].set(faixa, (porTipo[tipo].get(faixa) || 0) + 1);
    totais[tipo]++;
  }
  const montar = tipo =>
    Array.from(porTipo[tipo].entries())
      .sort((a, b) => a[0] - b[0])
      .map(([faixa, n]) => ({
        de: Number((faixa * passo).toFixed(2)),
        ate: Number(((faixa + 1) * passo).toFixed(2)),
        n,
        fracao: totais[tipo] ? Number((n / totais[tipo]).toFixed(4)) : 0
      }));
  return { inter: montar('inter'), intra: montar('intra'), totais };
}

module.exports = {
  clusterizar,
  gerarClusterId,
  histogramaJaccard,
  LIMIAR_JACCARD,
  LIMIAR_JACCARD_INTRA,
  JANELA_HORAS,
  PISO_INTERSECAO_ABSOLUTA
};
