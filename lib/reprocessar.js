'use strict';

const subeditalExtrator = require('./subedital-extrator');
const ufLookup = require('./uf-lookup');
const keywordFiltro = require('./keyword-filtro');
const score = require('./score');
const extrator = require('./extrator-texto');

// Onda 2.0 — reaplicar extrairTitulacao (passo 1b abaixo) só faz sentido
// sobre texto REAL do artigo (as duas correções desta onda mudam o
// resultado só quando "graduação" aparece em contexto de nome de disciplina/
// departamento, não de requisito — ver lib/extrator-texto.js). Textos curtos
// (fixtures sintéticas de teste, ex. "concurso no Estado de São Paulo") nunca
// são o enriquecido real de um artigo do DOU (que sempre carrega preâmbulo
// legal + autoridade + tem centenas de chars mesmo pro edital mais curto já
// visto no store — 1394 chars, UFES). Piso conservador, bem abaixo do menor
// caso real observado, só para não reprocessar titulação sobre texto
// artificial demais para significar algo.
const TAMANHO_MINIMO_TEXTO_PARA_RECOMPUTAR_TITULACAO = 300;

/**
 * Reprocessamento offline do store (item 1 e 2 do briefing Onda 1.7) — aplica
 * as regras ATUAIS (config + lib corrigidos nesta onda) a registros JÁ
 * salvos, usando só o que está em disco (`texto_bruto` persistido por
 * registro — ver lib/schema.js). Nunca faz requisição de rede: é reprocessar,
 * não recoletar (briefing: "não recoletar o DOU inteiro de novo se puder
 * reprocessar o que está no disco").
 *
 * Três correções, nesta ordem (a segunda e a terceira dependem do resultado
 * da anterior):
 *   1. `avaliarEditalUnico` de novo sobre `texto_bruto` — se o texto agora é
 *      reconhecido como "múltiplos itens em formato não reconhecido"
 *      (heurística nova desta onda), area/subarea/vagas/titulacao_exigida/
 *      campus somem e `extracao: 'formato_nao_reconhecido'` entra. Só se
 *      aplica a registros de subedital único (`subedital === null`) — os que
 *      já vieram de tabela RECONHECIDA (UFSCar) não precisam disso.
 *   2. UF — só preenche se `uf` ainda for `null` (nunca sobrescreve um UF já
 *      resolvido); tenta lookup de instituição com a config expandida, depois
 *      extração do texto (lib/uf-lookup.js `extrairUfDoTexto`).
 *   3. Score/elegibilidade — recalcula com os valores JÁ corrigidos (1 e 2
 *      têm prioridade sobre o que estava salvo) — isso é o que propaga a
 *      regra nova "titulação nula -> indeterminada" (lib/elegibilidade.js)
 *      pros 204 itens que já existiam antes desta onda.
 *
 * Retorna `null` quando nada muda (idempotente — rodar duas vezes seguidas
 * não produz um segundo patch).
 */
function reprocessarRegistro(registro, { keywordsConfig, negativosConfig, perfil, agora = new Date() } = {}) {
  if (!registro || registro.fonte !== 'dou') return null; // escopo desta onda: única fonte existente

  const patch = {};
  const textoBruto = registro.texto_bruto || '';

  // Proveniência LLM (Onda 2.1 — ver lib/schema.js `campos_llm`, lib/extrair-
  // indeterminados.js): campo nesta lista foi resolvido por
  // lib/extrator-llm.js, não pelo regex/heurística abaixo — os passos 1 e 1b
  // NUNCA reprocessam (nem zeram, nem recomputam) um campo que está aqui,
  // senão toda vez que `reprocessar` rodasse de novo ele reverteria o dado
  // do LLM pra null (regex continua sem achar nada — foi POR ISSO que o item
  // foi pro LLM em primeiro lugar; e a heurística de ambiguidade dispara de
  // novo sobre o MESMO texto_bruto, toda vez).
  const camposLlm = new Set(registro.campos_llm || []);

  // 1. Ambiguidade de formato (só edital de subedital único). Compara pela
  // presença LITERAL da chave, não só pelo valor — registros salvos antes da
  // Onda 1.7 não têm a chave `extracao` no JSON (campo não existia), e
  // `undefined !== null` só na chave ausente, nunca no valor lido de volta
  // (JSON.parse nunca produz `undefined`) — sem isso o patch nunca formaliza
  // o campo pros registros já confiáveis (extracao lógico = null dos dois
  // lados, mas a chave continuava fisicamente ausente no store).
  let ficouAmbiguo = false;
  if (!registro.subedital) {
    const avaliacao = subeditalExtrator.avaliarEditalUnico(textoBruto, keywordsConfig);
    if (avaliacao.passou) {
      if (!('extracao' in registro) || registro.extracao !== avaliacao.extracao) {
        patch.extracao = avaliacao.extracao;
      }
      if (avaliacao.ambiguo) {
        ficouAmbiguo = true;
        if (registro.area !== null && !camposLlm.has('area')) patch.area = null;
        if (registro.subarea !== null && !camposLlm.has('subarea')) patch.subarea = null;
        if (registro.vagas !== null && !camposLlm.has('vagas')) patch.vagas = null;
        if (registro.titulacao_exigida !== null && !camposLlm.has('titulacao_exigida')) patch.titulacao_exigida = null;
        if (registro.campus !== null && !camposLlm.has('campus')) patch.campus = null;
      }
    }
  } else if (!('extracao' in registro)) {
    patch.extracao = null; // formaliza o campo novo pros registros de tabela reconhecida (UFSCar)
  }

  // 1b. Titulação (Onda 2.0, achado da auditoria dos 21 itens
  // `titulacao_exigida: 'graduacao'`) — reaplica `extrator.extrairTitulacao`
  // (regex corrigida nesta onda: não confunde mais "Projeto de Graduação"/
  // nome de disciplina, ou "Faculdade de X/Graduação em Y"/label de
  // departamento, com requisito de titulação — ver lib/extrator-texto.js)
  // sobre o MESMO texto_bruto já persistido. Puro e determinístico: só muda
  // se a REGRA mudou nesta onda, nunca por acaso — verificado contra o store
  // inteiro de 204 itens antes de entrar (2 registros mudam: UFES
  // edital-13/2026 e UFMT edital-1/progep-25/06/2026, ambos "graduacao"
  // fantasma virando null/indeterminada; os outros 202 continuam idênticos).
  // Só roda quando NÃO ficou ambíguo neste passo (o caminho ambíguo já zera
  // titulacao_exigida acima) e sobre texto longo o bastante pra ser um
  // artigo real (ver TAMANHO_MINIMO... acima — fixtures sintéticas de teste
  // ficam de fora, de propósito).
  if (
    !registro.subedital &&
    !ficouAmbiguo &&
    !camposLlm.has('titulacao_exigida') &&
    textoBruto.length >= TAMANHO_MINIMO_TEXTO_PARA_RECOMPUTAR_TITULACAO
  ) {
    const titulacaoRecomputada = extrator.extrairTitulacao(textoBruto);
    if (titulacaoRecomputada !== registro.titulacao_exigida) {
      patch.titulacao_exigida = titulacaoRecomputada;
    }
  }

  // 2. UF — só preenche lacuna, nunca sobrescreve
  if (!registro.uf) {
    const ufNovo = ufLookup.buscarUf(registro.orgao, null) || ufLookup.extrairUfDoTexto(textoBruto);
    if (ufNovo) patch.uf = ufNovo;
  }

  // 3. Score/elegibilidade — recalcula com valores já corrigidos (1 e 2)
  const areaFinal = 'area' in patch ? patch.area : registro.area;
  const titulacaoFinal = 'titulacao_exigida' in patch ? patch.titulacao_exigida : registro.titulacao_exigida;
  const ufFinal = 'uf' in patch ? patch.uf : registro.uf;

  // Onda 2.4 (26/08/2026) — `resolverPesoArea` (não mais indexação direta em
  // `pesos_area[areaFinal]`) porque `areaFinal` pode ser o rótulo LITERAL do
  // edital gravado por lib/extrator-llm.js (ex. "COMPUTAÇÃO"), não a
  // categoria canônica; ver comentário em lib/keyword-filtro.js
  // `resolverPesoArea` e config/keywords.json → `sinonimos_area`. NOTA: este
  // mesmo padrão de bug (indexação direta) ainda existe em radar.js
  // `comandoJulgar`/aplicação do LLM em massa — fora de escopo desta onda
  // (radar.js não está na lista de arquivos autorizados), fica registrado
  // aqui para a próxima onda que tocar nesses dois pontos.
  const pesoArea = keywordFiltro.resolverPesoArea(areaFinal, keywordsConfig);
  const negativo = keywordFiltro.contemNegativo(textoBruto, (negativosConfig && negativosConfig.termos) || []);
  const resultado = score.calcular(
    { pesoArea, titulacaoExigida: titulacaoFinal, perfil, uf: ufFinal, inscricaoFim: registro.inscricao_fim, negativo, area: areaFinal },
    agora
  );

  if (typeof registro.score === 'number' && resultado.score !== registro.score) patch.score = resultado.score;
  if (registro.veredito && resultado.veredito !== registro.veredito) patch.veredito = resultado.veredito;

  // area_compativel (Onda 2.1, substitui `pressupoe` da Onda 1.9 agora que
  // area_mestrado/area_graduacao são conhecidas — ver lib/elegibilidade.js) —
  // só existe quando elegibilidade.avaliar sinaliza dependência de área
  // (mestrado ou graduação/especialização); ausência = null. Só grava patch
  // se o registro já tinha veredito julgado (mesma guarda de `score`/
  // `veredito` acima) — registro nunca julgado não ganha campo de pipeline
  // via reprocessamento silencioso. Também limpa o campo `pressupoe` legado
  // (Onda 1.9) de registros antigos que ainda o carregam — o mecanismo foi
  // substituído, não faz sentido deixar o campo obsoleto no store.
  const areaCompativelNovo = resultado.elegibilidade.area_compativel || null;
  const areaCompativelAtual = registro.area_compativel || null;
  if (registro.veredito && areaCompativelNovo !== areaCompativelAtual) patch.area_compativel = areaCompativelNovo;
  if ('pressupoe' in registro) patch.pressupoe = undefined;

  if ('score' in patch || 'veredito' in patch || 'area_compativel' in patch) patch.julgado_em = agora.toISOString();

  return Object.keys(patch).length ? patch : null;
}

/**
 * Roda `reprocessarRegistro` sobre uma lista de registros (o store inteiro,
 * tipicamente) e devolve um resumo contável — nunca aplica o patch sozinho
 * (quem chama decide persistir via lib/store.js `atualizar`, ver
 * radar.js `comandoReprocessar`).
 */
function reprocessarTudo(registros, ctx) {
  const resultado = [];
  const resumo = {
    total: registros.length,
    alterados: 0,
    uf_preenchido: 0,
    formato_nao_reconhecido_novo: 0,
    veredito_mudou: {},
    area_compativel_novo: 0,
    area_a_verificar_novo: 0
  };

  for (const registro of registros) {
    const patch = reprocessarRegistro(registro, ctx);
    if (!patch) continue;
    resumo.alterados++;
    if (patch.uf) resumo.uf_preenchido++;
    if (patch.extracao === 'formato_nao_reconhecido') resumo.formato_nao_reconhecido_novo++;
    if (patch.veredito) {
      const chave = `${registro.veredito || '?'} -> ${patch.veredito}`;
      resumo.veredito_mudou[chave] = (resumo.veredito_mudou[chave] || 0) + 1;
    }
    if (patch.area_compativel === 'compativel') resumo.area_compativel_novo++;
    if (patch.area_compativel === 'a_verificar_na_banca') resumo.area_a_verificar_novo++;
    resultado.push({ id: registro.id, patch });
  }

  return { patches: resultado, resumo };
}

module.exports = { reprocessarRegistro, reprocessarTudo };
