'use strict';

const http = require('../lib/http');
const extrator = require('../lib/extrator-texto');
const ufLookup = require('../lib/uf-lookup');
const subeditalExtrator = require('../lib/subedital-extrator');

/**
 * Coletor do Diário Oficial da União — Seção 3 (item 3 do briefing).
 *
 * Modo de acesso (investigado empiricamente em 2026-08-12, ver README §Fonte
 * DOU para o relato completo):
 *
 *   GET https://www.in.gov.br/leiturajornal?data=DD-MM-AAAA&secao=do3
 *
 * exige um header User-Agent de navegador (sem ele, o WAF fecha a conexão
 * por "TLS renegotiation" antes de qualquer resposta — curl sem -A dá
 * connection reset). Com UA, retorna HTML 200 contendo:
 *
 *   <script id="params" type="application/json">
 *     {"...", "jsonArray": [ {pubName, urlTitle, title, pubDate, content,
 *        artType, hierarchyStr, hierarchyList, ...}, ... ] }
 *   </script>
 *
 * `jsonArray` traz TODAS as publicações da Seção 3 do dia (~2000-2500
 * itens/dia) em uma única resposta — sem paginação. `content` é só um
 * preview truncado (~400 chars); o texto integral do artigo está em
 * `https://www.in.gov.br/web/dou/-/{urlTitle}`, dentro de
 * `<div class="texto-dou"><html>...<body>TEXTO</body></html></div>`.
 *
 * Pré-filtro (barato, roda aqui) — CONSERTO (item 1 do briefing Durin
 * 2026-09-09, falso zero medido em 09-09-2026: `pre-filtro-de-tipo 0/1941
 * itens`, escondendo uma vaga docente real — UFPEL, Edital nº 27/2026,
 * "PROCESSO SELETIVO SIMPLIFICADO PARA PROFESSOR VISITANTE" — e outra da
 * UFRN). Origem do bug: o pré-filtro original confiava no `artType` como
 * CHAVE ÚNICA, e o DOU rotula a MESMA classe de publicação (edital de
 * concurso/processo seletivo docente) de forma INCONSISTENTE — às vezes com
 * o rótulo específico ('Edital de Concurso Público' / 'Edital de Processo
 * Seletivo'), às vezes com rótulo genérico ('Edital' puro, 'Retificação',
 * 'Retificação (de Edital)' — confirmado com dado real de 09-09-2026: UFPEL
 * sob artType='Edital', UFRN sob 'Retificação (de Edital)', e um terceiro
 * caso achado na mesma sondagem, IFPE, sob 'Retificação' pura).
 *
 * `pareceEditalDeConcursoOuSeletivo` mantém o match antigo por artType (não
 * regride nada que já funcionava) e ACRESCENTA um sinal textual — o blob já
 * montado por `textoParaFiltro` (título+preview+hierarquia) contém "concurso
 * público" ou "processo seletivo"? Esse é o texto que qualquer edital de
 * concurso docente usa para SE DESCREVER, robusto a qual `artType` o DOU
 * escolheu naquele dia. `artType` amplo sozinho não bastaria — "Edital de
 * Notificação"/"Intimação"/"Citação" também usam a palavra "Edital" (25
 * itens 'Edital de Notificação' em 09-09-2026, mesmo artType genérico
 * 'Edital' das vagas docentes) — mas nenhum deles contém "concurso
 * público"/"processo seletivo" (são instrumento de citação processual, não
 * de provimento de cargo; conferido nos itens reais desse dia, ver
 * tests/dou-tipo-editais.test.js). O afunilamento de rede continua intacto:
 * este pré-filtro segue sendo só triagem de candidato — quem decide se vale
 * buscar o texto completo continua sendo o estágio 1 (`lib/vaga-docente.js`,
 * chamado por radar.js), que exige professor/docente + instituição de
 * ensino no MESMO blob. Medido em 09-09-2026: 1941 itens brutos -> 22
 * candidatos deste pré-filtro (antes: 0) -> 7 passam o estágio 1 (só esses
 * disparam requisição de enriquecimento — mesma ordem de grandeza da dúzia
 * que o pré-filtro antigo já produzia em dias com rótulo específico, ver
 * 12-08-2026 abaixo: 12 candidatos, 1 passa o estágio 1).
 *
 * PIPELINE INVERTIDO (Onda 1.6, item 3 do briefing — corrige o
 * falso-negativo em massa descoberto no backfill: 26 itens/ano vs. 457
 * avisos de IF no mesmo período, e o edital que originou o projeto — UFSCar,
 * 12/08/2026, "Design/Mídias — IA, UI, UX e Design Digital" — dava ZERO). O
 * bug: o filtro de ÁREA rodava sobre o preview de ~400 chars da listagem,
 * ANTES do texto integral (onde a área realmente aparece, em editais
 * guarda-chuva de dezenas de subeditais) ser buscado. A partir desta onda,
 * quem decide "vale a pena buscar o texto completo?" é `lib/vaga-docente.js`
 * (estágio 1 — "é vaga docente?", amplo, roda sobre este mesmo pré-filtro de
 * artType em `radar.js`), NÃO o filtro de keyword. `enriquecer()` abaixo
 * (estágio 2) roda pra TODO item que passou o estágio 1, e o filtro de
 * keyword (estágio 3, `lib/keyword-filtro.js`) roda sobre o texto
 * ENRIQUECIDO — nunca mais sobre a casca. Ver README §Pipeline invertido.
 */

const ID = 'dou';
const NOME = 'Diário Oficial da União — Seção 3';
const BASE = 'https://www.in.gov.br';

const ART_TYPES_EDITAL = ['Edital de Concurso Público', 'Edital de Processo Seletivo'];

/**
 * Sinal textual de concurso/processo seletivo — a linguagem que o PRÓPRIO
 * texto do DOU usa pra descrever a publicação, independente do `artType`
 * que o DOU escolheu naquele dia. Casa "processo seletivo simplificado"
 * (não exige a palavra terminar em "seletivo" sozinha — qualquer coisa pode
 * vir depois). Não exige "docente"/"professor" aqui — isso é estágio 1
 * (`lib/vaga-docente.js`), que roda depois e é quem decide se vale
 * enriquecer.
 */
const RE_SINAL_CONCURSO_OU_SELETIVO = /concurso\s+p[úu]blico|processo\s+seletivo/i;

/**
 * CONSERTO Nº 2 (mesmo dia, 2026-09-09 — Durin apontou o erro no meu próprio
 * relatório): eu tinha rotulado "itens que passam este pré-filtro" como
 * "vagas docentes reais". São coisas diferentes. Reclassifiquei à mão os
 * 144 itens da varredura de intervalo (12-08 a 09-09-2026, ver
 * tmp/vazamento-itens-completos.json, descartável) pelo CONTEÚDO real, não
 * pelo título:
 *
 *   - 60 são vaga aberta de verdade (abertura nova, retificação de edital
 *     de abertura, ou prorrogação de prazo/validade — esta última é a
 *     mesma leitura do caso UFFS nº 387 citado no briefing: "prorrogação"
 *     ESTENDE uma janela viva, não fecha nada).
 *   - 29 são EXTRATO DE CONTRATO/EXTRATO DE TERMO ADITIVO — um recibo
 *     administrativo de que uma pessoa NOMEADA já foi contratada. Ninguém
 *     se candidata a um extrato de contrato. É ESTE grupo que o pré-filtro
 *     abaixo passa a barrar.
 *   - 55 são homologação de resultado final / convocação de candidato já
 *     aprovado / revogação de edital / retificação de resultado — processo
 *     ENCERRADO, mas NÃO é um recibo de contrato. Este arquivo NÃO barra
 *     esta classe (ver `pareceReciboDeContratoJaAssinado` abaixo, escopo
 *     deliberadamente estreito) — é um achado a mais, fora do pedido, que
 *     reportei a Durin em vez de decidir sozinho onde consertar.
 *
 * MESMO DEFEITO ESTRUTURAL DO CONSERTO Nº 1, MESMA CURA: o `artType` da
 * DOU também é inconsistente para extrato de contrato — um item real do
 * intervalo tinha artType='Retificação', título="RETIFICAÇÃO" puro, e só o
 * CONTEÚDO revelava "RETIFICAÇÃO Extrato de contrato 154/2026...". Por
 * isso o sinal abaixo é textual (sobre o mesmo blob de `textoParaFiltro`),
 * nunca por título/artType.
 */
const RE_RECIBO_CONTRATO = /extratos?\s+de\s+(contratos?|te?rmo\s+aditivos?|temo\s+aditivos?)|contratante\s*:|contratad[oa]\s*:|locat[áa]ri[ao]\s*:|locador\s*:|esp[ée]cie\s*:\s*contrato/i;

/**
 * true se o blob de triagem (título+preview+hierarquia) tem a cara de um
 * recibo administrativo de contrato individual já assinado — "extrato de
 * contrato"/"extrato de term[o|a] aditivo" (a variante "temo" cobre um
 * typo real do DOU, item de 12-08-2026, IFPA) OU os campos estruturais que
 * todo extrato real usa pra nomear as partes do contrato já celebrado
 * ("Contratante:"/"Contratado(a):", ou as variantes de contrato de
 * locação/prestação de serviços — "Locatári[ao]:"/"Locador:"/"Espécie:
 * Contrato..."). Validado contra os 144 itens da varredura de intervalo:
 * zero falso-positivo (nenhum dos 115 itens que NÃO são recibo de contrato
 * bate neste sinal) e zero falso-negativo nos 29 que são.
 */
function pareceReciboDeContratoJaAssinado(rawItem) {
  return RE_RECIBO_CONTRATO.test(textoParaFiltro(rawItem));
}

/**
 * true se o item é candidato a edital de concurso/processo seletivo —
 * por artType específico (rótulo que o DOU às vezes usa corretamente) OU
 * por sinal textual no blob de triagem (título+preview+hierarquia), que
 * cobre os dias em que o DOU usa rótulo genérico ('Edital', 'Retificação',
 * 'Retificação (de Edital)') para a MESMA classe de publicação — E que NÃO
 * seja um recibo administrativo de contrato já assinado (ver
 * `pareceReciboDeContratoJaAssinado` acima). Ver comentário de cabeçalho
 * do arquivo para o defeito medido e a prova de discriminação
 * (tests/dou-tipo-editais.test.js, tests/dou-recibo-contrato.test.js).
 */
function pareceEditalDeConcursoOuSeletivo(rawItem) {
  const pareceEdital = ART_TYPES_EDITAL.includes(rawItem.artType) || RE_SINAL_CONCURSO_OU_SELETIVO.test(textoParaFiltro(rawItem));
  if (!pareceEdital) return false;
  return !pareceReciboDeContratoJaAssinado(rawItem);
}

/**
 * CONSERTO Nº 3 (mesmo dia, 2026-09-09 — decisão de JB): "filtra fora"
 * virou "classifica" — o balde `em_andamento` (55 itens no conserto Nº 2)
 * NÃO é descartado, vira aba própria. A pergunta que decide o rótulo deixou
 * de ser "isto tem cara de concurso?" e passou a ser **"JB pode se
 * inscrever nisto HOJE?"** — é essa pergunta, não o rótulo do documento,
 * que classifica.
 *
 * MEDIÇÃO ANTES DE MOVER (pedido de Durin): `lib/pci.js`/`lib/selecaoacademica.js`
 * NÃO precisam desta classificação — medido ao vivo em 09-09-2026, os 71
 * itens pré-filtrados da PCI e os 9 itens relevantes do RSS Seleção
 * Acadêmica são 100% "abre concurso"/"abre processo seletivo"/"prorroga
 * inscrições" (vocabulário de abertura, nunca homologação/convocação/
 * recibo de contrato) — PORQUE as duas fontes são, por desenho, agregadores
 * de OPORTUNIDADE NOVA (PCI filtra `datas.aberto=true` na própria origem;
 * Seleção Acadêmica é um blog que só publica post quando um processo abre).
 * O DOU é o firehose bruto do Diário Oficial — publica TODO tipo de ato
 * administrativo (homologação, convocação de aprovado, revogação, extrato
 * de contrato), por isso É o único lugar onde a ambiguidade aparece. Por
 * isso esta classificação mora AQUI (`fontes/dou.js`), não em
 * `lib/vaga-docente.js` (gate compartilhado com pci/selecaoacademica) —
 * regra do próprio Durin: "se o padrão não se repetir lá, o lugar não é o
 * gate compartilhado". Ver mensagem de retorno pra tabela de medição.
 *
 * TRÊS SITUAÇÕES (vocabulário de JB):
 *   - `inscricao_aberta` — abre ou mantém janela de inscrição viva:
 *     abertura nova, retificação de edital aberto (tabela/cronograma/
 *     requisitos), prorrogação de prazo de INSCRIÇÃO.
 *   - `em_andamento` — processo existe e não terminou, mas a inscrição
 *     fechou: homologação de resultado final, convocação de candidato JÁ
 *     aprovado, retificação de resultado, prorrogação de prazo de
 *     VALIDADE (não é inscrição nova — é estender quanto tempo a
 *     instituição ainda pode CHAMAR gente de uma lista já fechada).
 *   - `encerrado` — revogação do próprio processo seletivo/edital (não de
 *     uma suspensão — revogar uma SUSPENSÃO reabre o caminho pra concluir o
 *     processo, ou seja, é `em_andamento`; só a revogação do PROCESSO em si
 *     é `encerrado`, achado real: UNIRIO Edital nº 212 revoga o Edital nº
 *     138/2026 inteiro — processo morto. Sergipe/Paraíba revogam/tornam sem
 *     efeito uma SUSPENSÃO — o processo original CONTINUA, ver
 *     tests/dou-situacao.test.js).
 *
 * PRECEDÊNCIA (checada nesta ordem — mais específico primeiro):
 *   1. revogação/torna-sem-efeito de uma SUSPENSÃO -> em_andamento (o
 *      processo retoma, não morre)
 *   2. revogação/torna-sem-efeito (do processo em si) -> encerrado
 *   3. homologação/resultado final/retificação de resultado/convocação de
 *      aprovado/candidato eliminado/prorrogação de VALIDADE -> em_andamento
 *   4. nenhum dos sinais acima -> inscricao_aberta (default — abertura nova
 *      ou retificação de algo que continua aberto)
 *
 * LIMITE CONHECIDO: roda sobre `textoParaFiltro` (a casca — título+preview+
 * hierarquia, ~400 chars), o único texto disponível ANTES do estágio 2
 * (enriquecimento). Achado real na varredura de intervalo: 2 de 42 itens
 * com "prorrogação" só revelavam "...de VALIDADE..." depois do corte de
 * 400 chars do preview (IFBA e UFG, confirmados por busca do artigo
 * completo) — a mesma classe de risco do "pipeline invertido" original
 * (área real só aparece no texto enriquecido). Por isso o chamador que vier
 * a usar esta função em produção (fora de escopo aqui — é wiring em
 * radar.js, não autorizado nesta obra) deveria preferir o texto ENRIQUECIDO
 * (`extra.texto_bruto`) quando disponível, não só a casca — a função aceita
 * qualquer string, o preview é só o que está em mãos nesta obra.
 */
const SITUACAO = Object.freeze({
  INSCRICAO_ABERTA: 'inscricao_aberta',
  EM_ANDAMENTO: 'em_andamento',
  ENCERRADO: 'encerrado'
});

const RE_REVOGA_SUSPENSAO = /revoga[cç][aã]o\s+d[eo]\s+suspens[aã]o|revogar\s+o\s+edital\s+de\s+suspens[aã]o|torna\s+sem\s+efeito.{0,60}suspens[aã]o/i;
const RE_ENCERRADO = /revoga[cç][aã]o|torna\s+sem\s+efeito/i;
const RE_EM_ANDAMENTO =
  /homologa|resultado\s+final|resultado\s+d[eo]\s+(processo|concurso)|retifica[cç][aã]o\s+d[eo]\s+resultado|convoca[cç][aã]o|eliminad[oa]|prorroga.{0,80}validade|validade.{0,80}prorroga/i;

/**
 * Classifica um texto (blob de triagem OU texto enriquecido — ver "LIMITE
 * CONHECIDO" acima) numa das três situações de `SITUACAO`. Função PURA,
 * sobre string — não decide se o item passa o gate (isso continua sendo
 * só `pareceEditalDeConcursoOuSeletivo`/`pareceVagaDocente`); só rotula
 * quem já passou.
 */
function classificarSituacaoTexto(texto) {
  const t = String(texto || '');
  if (RE_REVOGA_SUSPENSAO.test(t)) return SITUACAO.EM_ANDAMENTO;
  if (RE_ENCERRADO.test(t)) return SITUACAO.ENCERRADO;
  if (RE_EM_ANDAMENTO.test(t)) return SITUACAO.EM_ANDAMENTO;
  return SITUACAO.INSCRICAO_ABERTA;
}

/** Conveniência sobre o rawItem da listagem — usa `textoParaFiltro` (a casca). Ver "LIMITE CONHECIDO" no comentário acima. */
function classificarSituacao(rawItem) {
  return classificarSituacaoTexto(textoParaFiltro(rawItem));
}

function formatarData(date) {
  const d = String(date.getDate()).padStart(2, '0');
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const y = date.getFullYear();
  return `${d}-${m}-${y}`;
}

/**
 * Extrai o texto integral (sem tags) do bloco <div class="texto-dou"> de
 * uma página de artigo do DOU. Função pura — testável sem rede.
 */
function extrairTextoArtigo(html) {
  const m = String(html || '').match(
    /<div class="texto-dou">\s*<html>\s*<head><\/head>\s*<body>([\s\S]*?)<\/body>\s*<\/html>\s*<\/div>/
  );
  if (!m) return null;
  return m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function urlCanonica(rawItem) {
  return `${BASE}/web/dou/-/${rawItem.urlTitle}`;
}

function pubDateParaISO(pubDate) {
  // pubDate vem como DD/MM/AAAA
  const m = String(pubDate || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/**
 * Busca a listagem do dia. Retorna `{ itens, volumeBruto }`:
 *   - itens: só os de artType relevante (edital de concurso/processo seletivo)
 *   - volumeBruto: TOTAL de publicações da Seção 3 naquele dia, antes de
 *     qualquer filtro — usado pelo módulo de saúde (lib/saude.js, item 3 do
 *     briefing Onda 1.5) pra distinguir "0 vagas relevantes hoje" de
 *     "coletor quebrado" (se volumeBruto vier 0, o problema é o coletor, não
 *     a ausência de vaga).
 */
async function coletar({ data } = {}) {
  const dataUrl = data || formatarData(new Date());
  const url = `${BASE}/leiturajornal?data=${dataUrl}&secao=do3`;

  let html;
  try {
    html = await http.get(url);
  } catch (err) {
    throw new Error(
      `[falha: GET leiturajornal (${dataUrl}) | ${err.message} | conectividade/WAF do in.gov.br | retry com backoff, checar UA e conectividade]`
    );
  }

  const m = html.match(/<script id="params" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) {
    throw new Error(
      '[falha: parse leiturajornal | bloco <script id="params"> não encontrado no HTML | layout do in.gov.br pode ter mudado | reinspecionar HTML atual e ajustar regex em fontes/dou.js]'
    );
  }

  let payload;
  try {
    payload = JSON.parse(m[1]);
  } catch (err) {
    throw new Error(`[falha: parse JSON leiturajornal | ${err.message} | payload malformado | logar HTML bruto e revisar]`);
  }

  const todos = Array.isArray(payload.jsonArray) ? payload.jsonArray : [];
  const itens = todos.filter(pareceEditalDeConcursoOuSeletivo);
  return { itens, volumeBruto: todos.length };
}

/**
 * Texto usado pelo filtro estágio 1 (keyword) — título + preview + hierarquia
 * do órgão, tudo que já vem na listagem, sem precisar buscar o artigo.
 */
function textoParaFiltro(rawItem) {
  return [rawItem.title, rawItem.content, rawItem.hierarchyStr].filter(Boolean).join(' \n ');
}

/**
 * Campos que dão pra preencher só com o item da listagem (sem buscar o
 * artigo completo).
 */
function normalizarParcial(rawItem) {
  const hierarchy = rawItem.hierarchyList || [];
  const orgao = hierarchy.length > 1 ? hierarchy[1] : hierarchy[0] || null;
  const campus = hierarchy.length > 2 ? hierarchy[hierarchy.length - 1] : null;
  const uf = ufLookup.buscarUf(orgao, rawItem.hierarchyStr);

  return {
    fonte: ID,
    orgao,
    campus,
    uf,
    url: urlCanonica(rawItem),
    data_publicacao: pubDateParaISO(rawItem.pubDate),
    texto_bruto: rawItem.content || null
  };
}

/**
 * Busca o artigo completo e extrai vagas/titulação/regime/classe/tipo/prazo.
 * Só é chamado para itens que já passaram no filtro estágio 1 — evita
 * requisição extra pros ~2000 itens/dia irrelevantes.
 * Nunca derruba a coleta inteira por causa de um item: em falha, cai pro
 * preview (texto_bruto do item da listagem) e demais campos ficam null.
 */
async function enriquecer(rawItem) {
  const url = urlCanonica(rawItem);
  let textoCompleto = null;
  try {
    const html = await http.get(url);
    textoCompleto = extrairTextoArtigo(html);
  } catch (err) {
    textoCompleto = null;
  }

  const texto = textoCompleto || rawItem.content || '';
  const periodo = extrator.extrairPeriodoInscricao(texto);

  return {
    texto_bruto: texto || null,
    vagas: extrator.extrairVagas(texto),
    titulacao_exigida: extrator.extrairTitulacao(texto),
    regime: extrator.extrairRegime(texto),
    classe: extrator.extrairClasse(texto),
    tipo: extrator.extrairTipo(texto),
    inscricao_inicio: periodo.inicio,
    inscricao_fim: periodo.fim
  };
}

/**
 * --- Análise auxiliar: hipótese DOU × Institutos Federais (item 2 do
 * briefing Onda 1.5) ---
 *
 * Roda sobre os MESMOS itens que `coletar()` já buscou (artType já filtrado
 * para edital) — não é requisição extra de listagem, não é fonte nova. Serve
 * só pro comando `backfill` testar, com número real, se o aviso de abertura
 * de processo seletivo de professor substituto de Instituto Federal aparece
 * no DOU (hipótese de Durin: sim, e portanto a Onda 2 não precisaria de um
 * coletor dedicado por IF).
 */

const RE_IF = /instituto federal|institui[cç][aã]o federal de educa[cç][aã]o/i;
const RE_SUBSTITUTO_DOCENTE = /substitut|processo seletivo simplificado|professor(a)?\s+tempor[áa]rio/i;
const RE_PROFESSOR = /professor/i;

/**
 * Heurística leve (regex sobre texto já em mãos, sem requisição) pra
 * reconhecer um aviso de processo seletivo de professor substituto de IF
 * dentro da listagem do dia. Falso-positivo/negativo é esperado (é
 * heurística, documentado como tal) — usado só pra medir ORDEM DE GRANDEZA
 * da cobertura, não pra alimentar o store principal de oportunidades.
 */
function pareceAvisoIFSubstituto(rawItem) {
  const blob = [rawItem.title, rawItem.hierarchyStr, rawItem.content].filter(Boolean).join(' ');
  return RE_IF.test(blob) && RE_SUBSTITUTO_DOCENTE.test(blob) && RE_PROFESSOR.test(blob);
}

function nomeInstitutoFederal(rawItem) {
  const hierarchy = rawItem.hierarchyList || [];
  return (hierarchy.length > 1 ? hierarchy[1] : hierarchy[0]) || rawItem.hierarchyStr || null;
}

/**
 * Busca o artigo completo (mesma técnica de `enriquecer()`) e extrai só a
 * titulação exigida — usado numa AMOSTRA limitada (não o universo inteiro,
 * ver lib/hipotese-if.js) pra responder: o aviso do DOU já traz
 * área/titulação, ou só remete ao edital no site do instituto?
 */
async function amostraTitulacaoIF(rawItem) {
  const url = urlCanonica(rawItem);
  try {
    const html = await http.get(url);
    const textoCompleto = extrairTextoArtigo(html);
    const texto = textoCompleto || rawItem.content || '';
    return { url, titulacao_exigida: extrator.extrairTitulacao(texto), tem_texto_completo: !!textoCompleto };
  } catch (err) {
    return { url, titulacao_exigida: null, tem_texto_completo: false, erro: String((err && err.message) || err) };
  }
}

/**
 * Divide o texto integral (já enriquecido) na tabela de subeditais, quando
 * o edital tiver uma (item 3 do briefing Onda 1.6 — "um subedital de área
 * distinta dentro de um edital-guarda-chuva deve virar item próprio").
 * Delega pro extrator genérico de tabela em lib/subedital-extrator.js
 * (formato específico do DOU, ver comentário lá); retorna null quando o
 * texto não parece ter essa tabela — o chamador (radar.js) trata como
 * edital de subedital único nesse caso.
 */
function dividirSubeditais(textoCompleto) {
  return subeditalExtrator.dividirSubeditais(textoCompleto);
}

module.exports = {
  id: ID,
  nome: NOME,
  coletar,
  textoParaFiltro,
  normalizarParcial,
  enriquecer,
  dividirSubeditais,
  pareceAvisoIFSubstituto,
  nomeInstitutoFederal,
  amostraTitulacaoIF,
  SITUACAO,
  classificarSituacao,
  classificarSituacaoTexto,
  // exports internos, úteis para teste sem rede
  _internal: {
    urlCanonica,
    pubDateParaISO,
    formatarData,
    extrairTextoArtigo,
    ART_TYPES_EDITAL,
    RE_SINAL_CONCURSO_OU_SELETIVO,
    pareceEditalDeConcursoOuSeletivo,
    RE_RECIBO_CONTRATO,
    pareceReciboDeContratoJaAssinado,
    RE_REVOGA_SUSPENSAO,
    RE_ENCERRADO,
    RE_EM_ANDAMENTO,
    RE_IF,
    RE_SUBSTITUTO_DOCENTE,
    RE_PROFESSOR
  }
};
