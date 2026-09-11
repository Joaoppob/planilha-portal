'use strict';

/**
 * Schema normalizado do registro de oportunidade acadêmica.
 * Todo coletor de fonte (fontes/*.js) converge para este formato único.
 *
 * Campos mínimos (contrato do briefing, onda 1; `subedital` adicionado na
 * Onda 1.6, ver lib/subedital-extrator.js; `extracao` adicionado na Onda 1.7,
 * item 1 do briefing — "dado errado é pior que dado faltante"; `trilha`,
 * `modalidade`, `senioridade` adicionados na Onda 3 — ver §Trilha mercado
 * abaixo):
 *   id                 — hash estável (ver lib/hash.js)
 *   fonte              — id da fonte (ex.: 'dou', 'gupy')
 *   trilha             — 'docente' | 'mercado' | null (registro antigo, salvo
 *                        antes da Onda 3, ainda sem o campo — trate como
 *                        'docente' na prática, é a única trilha que existia).
 *                        Decide QUAL rubrica de score/elegibilidade
 *                        (lib/score.js+lib/elegibilidade.js para 'docente',
 *                        lib/score-mercado.js para 'mercado') radar.js
 *                        comandoJulgar aplica ao registro — ver README §Trilha
 *                        mercado, "o achado estrutural" sobre processarItensFonte.
 *   orgao              — instituição (docente) ou empresa (mercado)
 *   campus             — unidade/departamento/campus (docente) ou
 *                        cidade/localidade (mercado), quando identificável
 *   uf                 — sigla do estado, quando identificável (lib/uf-lookup.js
 *                        na trilha docente; lookup direto por nome de estado
 *                        estruturado em fontes/gupy.js na trilha mercado)
 *   area               — área canônica: config/keywords.json na trilha docente,
 *                        config/keywords-mercado.json na trilha mercado (duas
 *                        taxonomias DIFERENTES e não intercambiáveis — ver
 *                        README §Trilha mercado)
 *   subarea            — subárea canônica, mesma fonte de config que `area`
 *   subedital          — código do subedital dentro de um edital-guarda-chuva
 *                        (ex.: "004/26.41"), quando o edital tiver tabela de
 *                        subeditais; null para edital de subedital único;
 *                        SEMPRE null na trilha mercado (conceito não existe
 *                        fora de concurso público docente, sem constrangimento)
 *   vagas              — número de vagas, quando extraível do texto; SEMPRE
 *                        null na trilha mercado (a Gupy não expõe contagem de
 *                        vagas por posting de forma confiável — não inventa)
 *   titulacao_exigida  — 'graduacao' | 'especializacao' | 'mestrado' | 'doutorado' | null;
 *                        SEMPRE null na trilha mercado (fonte não expõe
 *                        requisito de titulação estruturado; extração por
 *                        regex de descrição livre heterogênea, PT+ES, é fora
 *                        de escopo desta onda — ver README)
 *   regime             — regime de trabalho (ex.: "Dedicação Exclusiva"), quando extraível;
 *                        SEMPRE null na trilha mercado (sem constrangimento)
 *   classe             — classe/cargo docente (ex.: "Professor Adjunto"), quando extraível;
 *                        SEMPRE null na trilha mercado (sem constrangimento)
 *   tipo               — 'efetivo' | 'substituto' | 'posdoc_bolsa' | 'cfp' | null
 *                        (enum docente-específico); SEMPRE null na trilha
 *                        mercado — a Gupy expõe um `type` de vínculo próprio
 *                        (efetivo/estágio/temporário/PJ/trainee) com semântica
 *                        diferente deste enum; forçar o encaixe é o mesmo erro
 *                        que o briefing pediu pra evitar no score. Campo novo
 *                        pra isso fica de recomendação para depois (ver README)
 *   modalidade         — (Onda 3, trilha mercado) 'presencial' | 'hibrido' |
 *                        'remoto' | null — ver lib/extrator-mercado.js.
 *                        SEMPRE null na trilha docente (concurso público não
 *                        tem essa dimensão — sem constrangimento)
 *   senioridade        — (Onda 3, trilha mercado) 'estagio' | 'trainee' |
 *                        'junior' | 'pleno' | 'senior' | 'especialista' |
 *                        'coordenador' | 'gerente' | 'lead' | 'head' | null —
 *                        extraído do TÍTULO da vaga (lib/extrator-mercado.js).
 *                        SEMPRE null na trilha docente (sem constrangimento)
 *   stack              — (Onda 4, trilha mercado) string[] — lista de
 *                        tecnologias declaradas pela vaga (ex.: ["Python",
 *                        "React", "TypeScript"]), quando a fonte expõe isso
 *                        estruturado (ver fontes/programathor.js — bloco
 *                        JSON-LD JobPosting). Array vazio (nunca null) quando
 *                        a fonte não afirma nenhuma tecnologia; SEMPRE []
 *                        na trilha docente E na trilha mercado quando a fonte
 *                        não expõe isso (ex.: Gupy — `skills` do payload da
 *                        API observado sempre vazio nos casos reais
 *                        capturados; ver README §Trilha mercado)
 *   tipo_contrato      — (Onda 4, trilha mercado) 'CLT' | 'PJ' | 'Estágio' |
 *                        null — vínculo comercial da vaga, campo NOVO e
 *                        DISTINTO de `tipo` (que é o enum docente-específico
 *                        'efetivo'|'substituto'|'posdoc_bolsa'|'cfp' — forçar
 *                        o vínculo de mercado nesse campo seria o mesmo
 *                        "encaixe forçado" que a Onda 3 já evitou pro `type`
 *                        da Gupy). SEMPRE null na trilha docente. Só o
 *                        ProgramaThor preenche por ora (`employmentType` do
 *                        JSON-LD JobPosting, ver lib/extrator-mercado.js
 *                        `mapearTipoContrato`) — Gupy tem um `type` de
 *                        vocabulário PRÓPRIO (efetivo/estágio/temporário/PJ/
 *                        trainee) que DARIA pra mapear pra este campo num
 *                        onda futura, mas isso não foi feito aqui (fora do
 *                        escopo desta onda — fontes/gupy.js não foi tocado)
 *   faixa_salarial     — (Onda 4, trilha mercado) string | null — faixa/teto
 *                        salarial formatado (ex.: "Até R$18.000/mês"), só
 *                        quando a fonte expõe isso estruturado. SEMPRE null
 *                        na trilha docente E na trilha mercado quando a fonte
 *                        não afirma salário (a maioria das vagas reais
 *                        capturadas do ProgramaThor não divulga; Gupy nunca
 *                        expôs isso em nenhum caso observado)
 *   inscricao_inicio   — data ISO (AAAA-MM-DD) ou null; na trilha mercado,
 *                        mesma data de `data_publicacao` (vaga de mercado não
 *                        tem "início de inscrição" formal separado — ver
 *                        fontes/gupy.js)
 *   inscricao_fim      — data ISO (AAAA-MM-DD) ou null; na trilha mercado, o
 *                        prazo de candidatura exposto pela fonte, quando houver
 *   data_publicacao    — data ISO (AAAA-MM-DD) da publicação no DOU/fonte
 *   url                — url canônica do artigo/edital (docente) ou da vaga (mercado)
 *   texto_bruto        — texto integral extraído da fonte (não o HTML)
 *   coletado_em        — timestamp ISO de quando o radar coletou o item
 *   extracao           — null (extração confiável) | 'formato_nao_reconhecido'
 *                        (o edital parece ter múltiplas linhas de área distinta
 *                        em formato de tabela que o extrator não reconhece —
 *                        `vagas`/`titulacao_exigida`/`area`/`subarea`/`campus`
 *                        saem null em vez de arriscar o primeiro match errado;
 *                        ver lib/subedital-extrator.js `avaliarEditalUnico`).
 *                        SEMPRE null na trilha mercado (o mecanismo de tabela
 *                        de subedital não existe nessa trilha)
 *
 * Campos de pipeline (operacionais, não fazem parte do "registro de oportunidade"
 * em si, mas persistem no mesmo store para status/dedupe/notificação):
 *   keywords_matched   — termos do filtro estágio 1 que bateram
 *   score              — 0-100, preenchido no estágio 2 (comando `julgar`)
 *   veredito           — 'elegivel_agora' | 'elegivel_futuro' | 'fora' | null (pré-julgamento)
 *   area_compativel    — null | 'compativel' | 'a_verificar_na_banca' (Onda 2.1, substitui o
 *                        `pressupoe` da Onda 1.9 agora que area_mestrado/area_graduacao são
 *                        conhecidas — ver config/perfil.json). Presente quando o veredito
 *                        'elegivel_agora' depende de mestrado OU graduação/especialização:
 *                        'compativel' = vaga de Design/UX-IHC (mesma área da formação de JB,
 *                        alta confiança); 'a_verificar_na_banca' = vaga de Computação/IA ou
 *                        Educação/Ensino (JB atende a titulação, mas a área não é a da
 *                        formação — decisão de banca, nunca presumida como sim); null = área
 *                        da vaga não identificada no texto, ou veredito não depende de área
 *                        (indeterminada/elegivel_futuro/fora). Ver lib/elegibilidade.js
 *                        `avaliarAreaCompativel`; nunca inflar `elegivel_agora` sem marcar a
 *                        compatibilidade real de área ao lado.
 *   julgamento         — justificativa do Ollama (2 frases) ou 'pendente'
 *   julgado_em         — timestamp ISO do julgamento
 *   notificado         — bool, true depois que `notificar` envia com sucesso
 *   notificado_em      — timestamp ISO do envio
 *   campos_llm         — string[] (Onda 2.1) — nomes dos campos do schema que foram
 *                        preenchidos por lib/extrator-llm.js (não pelo regex de
 *                        lib/extrator-texto.js) — ver lib/extrair-indeterminados.js e
 *                        radar.js `comandoExtrairLLM`. Proveniência por campo: existe
 *                        porque lib/reprocessar.js reaplica regex/heurística de
 *                        ambiguidade sobre `texto_bruto` toda vez que roda, e sem essa
 *                        lista ele reverteria um campo já resolvido pelo LLM de volta
 *                        pra null (regex não acha nada de novo, ambiguidade dispara de
 *                        novo) — `campos_llm` é o sinal que faz reprocessar PULAR esses
 *                        campos específicos em vez de reprocessá-los como se fossem
 *                        saída do regex.
 */

const CAMPOS_MINIMOS = [
  'id', 'fonte', 'trilha', 'orgao', 'campus', 'uf', 'area', 'subarea', 'subedital', 'vagas',
  'titulacao_exigida', 'regime', 'classe', 'tipo', 'modalidade', 'senioridade',
  'stack', 'tipo_contrato', 'faixa_salarial',
  'inscricao_inicio', 'inscricao_fim', 'data_publicacao', 'url',
  'texto_bruto', 'coletado_em', 'extracao'
];

const CAMPOS_PIPELINE = [
  'keywords_matched', 'score', 'veredito', 'area_compativel', 'julgamento', 'julgado_em',
  'notificado', 'notificado_em', 'campos_llm'
];

const TODOS_CAMPOS = [...CAMPOS_MINIMOS, ...CAMPOS_PIPELINE];

/**
 * Monta um registro completo a partir de um objeto parcial, preenchendo
 * campos ausentes com null (ou false/[] para os que têm default próprio).
 * Nunca inventa valor — campo não identificado fica null, ponto.
 */
function montarRegistro(parcial) {
  const registro = {};
  for (const campo of CAMPOS_MINIMOS) {
    if (campo in parcial && parcial[campo] !== undefined) {
      registro[campo] = parcial[campo];
    } else if (campo === 'stack') {
      // Onda 4 — array vazio, não null (mesmo padrão de keywords_matched/
      // campos_llm abaixo): "nenhuma tecnologia afirmada" é um array vazio
      // honesto, não a ausência do campo inteiro.
      registro[campo] = [];
    } else {
      registro[campo] = null;
    }
  }
  registro.coletado_em = parcial.coletado_em || new Date().toISOString();

  for (const campo of CAMPOS_PIPELINE) {
    if (campo in parcial && parcial[campo] !== undefined) {
      registro[campo] = parcial[campo];
    } else if (campo === 'notificado') {
      registro[campo] = false;
    } else if (campo === 'keywords_matched' || campo === 'campos_llm') {
      registro[campo] = [];
    } else {
      registro[campo] = null;
    }
  }
  return registro;
}

module.exports = { CAMPOS_MINIMOS, CAMPOS_PIPELINE, TODOS_CAMPOS, montarRegistro };
