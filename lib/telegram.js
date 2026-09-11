'use strict';

/**
 * Notificador desacoplado (item 7 do briefing): formatarMensagem() é puro
 * (registro -> string), enviar() é o transporte plugável. Sem token/chatId,
 * ou com dryRun explícito, imprime no console em vez de chamar a API.
 *
 * Onda 2.0 (fechamento do Telegram, item 6 do briefing): mensagens usam
 * `parse_mode: MarkdownV2` pra dar destaque (negrito no órgão/score) — é o
 * "produto" que JB recebe no celular, não texto corrido. MarkdownV2 é
 * ESTRITO: qualquer um dos 18 caracteres reservados (`_*[]()~\`>#+-=|{}.!\`)
 * aparecendo sem escape em QUALQUER parte do texto (inclusive nos meus
 * próprios literais de template, não só nos dados dinâmicos) derruba a
 * mensagem inteira com erro 400 "can't parse entities" — confirmado real:
 * nome de instituição comum no store carrega parênteses ("Design (geral)")
 * e reticências de Pró-Reitoria ("Pró-Reitoria..."). `escapeMarkdownV2`
 * escapa qualquer string antes de entrar na mensagem; `negrito()` aplica
 * `*...*` DEPOIS de escapar (nunca escapa os próprios asteriscos que eu
 * insiro de propósito).
 */

const modoSeco = require('./modo-seco');

const EMOJI_VEREDITO = {
  elegivel_agora: '🟢',
  elegivel_futuro: '🟡',
  indeterminada: '❓',
  fora: '⚪'
};

const LIMITE_TELEGRAM = 4096;

/**
 * Escapa os 18 caracteres reservados do MarkdownV2 (spec oficial do
 * Telegram Bot API). Aplicar em QUALQUER texto — dado dinâmico do registro
 * OU literal de template — antes de montar a mensagem final.
 */
function escapeMarkdownV2(texto) {
  return String(texto === null || texto === undefined ? '' : texto).replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

/** Negrito MarkdownV2 — escapa o conteúdo primeiro, depois envolve em `*`. */
function negrito(texto) {
  return `*${escapeMarkdownV2(texto)}*`;
}

/** Itálico MarkdownV2 — mesma lógica de negrito(). */
function italico(texto) {
  return `_${escapeMarkdownV2(texto)}_`;
}

/**
 * Link MarkdownV2 (`[texto](url)`) — achado real testando contra a API: a
 * regra de escape DENTRO dos parênteses de um link é diferente da regra de
 * texto normal (só `)` e `\` precisam de escape ali, não os 18 caracteres —
 * escapar a URL inteira com `escapeMarkdownV2` quebra o parse porque vira
 * uma URL com barras invertidas literais, não uma URL válida). URL de
 * edital do DOU sempre carrega hífens ("edital-n-15-de-..."), que É um dos
 * 18 caracteres reservados — sem esse tratamento à parte a mensagem inteira
 * falhava.
 */
function linkMarkdown(texto, url) {
  const urlEscapada = String(url || '').replace(/[)\\]/g, '\\$&');
  return `[${escapeMarkdownV2(texto)}](${urlEscapada})`;
}

/**
 * Item 1 do briefing Onda 1.7: item marcado 'indeterminada' (titulação não
 * identificada — lib/elegibilidade.js) ou `extracao: 'formato_nao_reconhecido'`
 * (lib/subedital-extrator.js `avaliarEditalUnico`) NUNCA pode ser silenciado
 * — a mensagem carrega o aviso explícito "área não confirmada — abrir o
 * edital", em vez de deixar `registro.area` aparecer como "?" sem explicação
 * (que JB liria como "dado ausente", não "dado propositalmente não afirmado
 * por falta de confiança"). Texto PURO (sem escape) — quem monta a mensagem
 * final escapa na hora de usar.
 */
function notaConfianca(registro) {
  if (registro.extracao === 'formato_nao_reconhecido') {
    return '⚠️ Área/vagas/titulação NÃO confirmadas — o edital parece ter várias linhas de área ' +
      'distinta num formato de tabela que o radar não reconhece (evita arriscar o dado errado). ' +
      'ABRIR O EDITAL para conferir a linha certa.';
  }
  if (registro.veredito === 'indeterminada') {
    return '⚠️ Titulação exigida não identificada no texto — elegibilidade indeterminada, não presumida. Abrir o edital para conferir.';
  }
  if (registro.veredito === 'elegivel_agora' && registro.area_compativel === 'a_verificar_na_banca') {
    return '⚠️ Área da vaga (Computação/IA ou Educação) não é a área da formação de JB (Design/UX-IHC) — ' +
      'JB tem a titulação exigida, mas a compatibilidade de área fica a critério da banca do concurso.';
  }
  if (registro.veredito === 'elegivel_agora' && registro.area_compativel === null) {
    return '⚠️ Área exigida pela vaga não identificada no texto — não dá para avaliar compatibilidade com a formação de JB. Abrir o edital para conferir.';
  }
  return null;
}

/**
 * Emoji da trilha MERCADO — deliberadamente SEPARADO de `EMOJI_VEREDITO`
 * (docente): reusar aquele mapa faria veredito `'aderente'` (não presente
 * ali) cair no fallback `'⚪'`, que na trilha docente lê como "fora"
 * (rejeitado) — o oposto do que uma vaga aderente deveria comunicar. `'fora'`
 * aqui é o mesmo emoji por coincidência de vocabulário, não por reuso do mapa.
 */
const EMOJI_VEREDITO_MERCADO = {
  aderente: '💼',
  fora: '⚪'
};

function formatarMensagem(registro) {
  if (registro.trilha === 'mercado') return formatarMensagemMercado(registro);

  const emoji = EMOJI_VEREDITO[registro.veredito] || '⚪';
  const nota = notaConfianca(registro);
  const linhas = [
    `${emoji} ${negrito('Radar Acadêmico')} — ${negrito(registro.orgao || 'órgão não identificado')}`,
    registro.campus ? `Campus/unidade: ${escapeMarkdownV2(registro.campus)}` : null,
    `Área: ${escapeMarkdownV2(registro.area || '?')} \\(${escapeMarkdownV2(registro.subarea || '?')}\\)`,
    `Titulação exigida: ${escapeMarkdownV2(registro.titulacao_exigida || 'não identificada')}`,
    `Tipo: ${escapeMarkdownV2(registro.tipo || 'não identificado')}`,
    registro.vagas ? `Vagas: ${escapeMarkdownV2(registro.vagas)}` : null,
    registro.inscricao_fim
      ? `Inscrições até: ${escapeMarkdownV2(registro.inscricao_fim)}`
      : 'Prazo de inscrição não identificado — conferir no edital',
    `Score: ${negrito(`${registro.score}/100`)} — ${escapeMarkdownV2(registro.veredito)}`,
    nota ? escapeMarkdownV2(nota) : null,
    registro.julgamento ? `Julgamento: ${escapeMarkdownV2(registro.julgamento)}` : null,
    registro.url ? `Fonte: ${linkMarkdown(registro.url, registro.url)}` : null
  ].filter(Boolean);
  return linhas.join('\n');
}

/**
 * Formatador PRÓPRIO da trilha mercado (Gupy) — nasceu de um problema real:
 * rodar `formatarMensagem` (docente) sobre um registro `trilha: 'mercado'`
 * produzia "Titulação exigida: não identificada" e "Tipo: não identificado"
 * pra TODA vaga (esses campos são sempre null nessa trilha — ver
 * lib/schema.js), texto sem sentido pra quem lê "vaga de mercado" — e o
 * emoji caía no fallback `'⚪'` de `EMOJI_VEREDITO`, que lê como "fora"
 * mesmo pra uma vaga aderente. Campos usados são os que a trilha realmente
 * preenche (lib/vaga-mercado.js / fontes/gupy.js): `modalidade`,
 * `senioridade`, `campus` (aqui é "local", não "campus universitário"),
 * `uf`. Score é `/85` (não `/100`) porque é a escala real de
 * lib/score-mercado.js `calcular` — a trilha docente usa `/100` por
 * decisão anterior já em produção, INTOCADA aqui.
 */
function formatarMensagemMercado(registro) {
  const emoji = EMOJI_VEREDITO_MERCADO[registro.veredito] || '⚪';
  const linhas = [
    `${emoji} ${negrito('Radar de Mercado')} — ${negrito(registro.orgao || 'empresa não identificada')}`,
    registro.campus ? `Local: ${escapeMarkdownV2(registro.campus)}` : null,
    registro.uf ? `UF: ${escapeMarkdownV2(registro.uf)}` : null,
    `Área: ${escapeMarkdownV2(registro.area || '?')} \\(${escapeMarkdownV2(registro.subarea || '?')}\\)`,
    registro.modalidade ? `Modalidade: ${escapeMarkdownV2(registro.modalidade)}` : null,
    registro.senioridade ? `Senioridade: ${escapeMarkdownV2(registro.senioridade)}` : null,
    registro.inscricao_fim
      ? `Inscrições até: ${escapeMarkdownV2(registro.inscricao_fim)}`
      : 'Prazo de inscrição não identificado — conferir na vaga',
    `Score: ${negrito(`${registro.score}/85`)} — ${escapeMarkdownV2(registro.veredito)}`,
    registro.url ? `Fonte: ${linkMarkdown(registro.url, registro.url)}` : null
  ].filter(Boolean);
  return linhas.join('\n');
}

/**
 * Alerta de SAÚDE DO COLETOR (item 3 do briefing Onda 1.5) — canal
 * separado do alerta de vaga (formatarMensagem acima): prefixo e conteúdo
 * diferentes, explicitamente rotulado pra nunca ser confundido com "0
 * vagas hoje". Disparado imediatamente na hora da coleta (não fica na fila
 * de `notificar`), opcionalmente para um chat_id dedicado
 * (TELEGRAM_CHAT_ID_SAUDE) se JB configurar um.
 *
 * Visualmente distinto do alerta de vaga (item 4 do briefing Onda 2.0):
 * rótulo 🚨 CRÍTICO / ⚠️ ATENÇÃO em negrito (nunca 🟢/🟡/❓/⚪ de veredito),
 * cabeçalho "Saúde do Radar Acadêmico" (nunca "Radar Acadêmico" puro), e um
 * parágrafo final fixo que nomeia explicitamente "alerta de SAÚDE DO
 * COLETOR, não de vaga encontrada" — nenhum dos dois textos-molde se repete
 * entre os dois formatadores.
 */
function formatarAlertaSaude({ fonte, dataAlvo, volumeBruto, motivo, nivel }) {
  const rotulo = nivel === 'critico' ? '🚨 CRÍTICO' : '⚠️ ATENÇÃO';
  const volumeTexto = volumeBruto === null || volumeBruto === undefined ? 'erro na coleta' : String(volumeBruto);
  const linhas = [
    `${negrito(rotulo)} — ${negrito('Saúde do Radar Acadêmico')} \\(fonte: ${escapeMarkdownV2(fonte)}\\)`,
    `Data alvo da coleta: ${escapeMarkdownV2(dataAlvo || 'hoje')}`,
    `Volume bruto observado: ${escapeMarkdownV2(volumeTexto)}`,
    `Motivo: ${escapeMarkdownV2(motivo)}`,
    '',
    escapeMarkdownV2(
      'Isto é um alerta de SAÚDE DO COLETOR, não de vaga encontrada. NÃO significa ' +
      '"sem oportunidades hoje" — significa que o radar pode estar quebrado e você ' +
      'pode estar perdendo prazo real sem saber. Verifique manualmente.'
    )
  ];
  return linhas.join('\n');
}

/**
 * Digest de vários registros numa mensagem só (item 3 e 5 do briefing Onda
 * 2.0 — "alerta real de produção" com os itens de maior score, formato
 * final). Reaproveita formatarMensagem por item, separados por uma régua —
 * quem chama `enviar()` com o resultado já passa por `dividirEmPedacos` se
 * ultrapassar o limite do Telegram (ver abaixo).
 */
function formatarDigest(registros, titulo) {
  const cabecalho = negrito(titulo || `Radar Acadêmico — ${registros.length} oportunidades`);
  const corpo = registros.map(formatarMensagem).join('\n\n➖➖➖\n\n');
  return `${cabecalho}\n\n${corpo}`;
}

/**
 * Mensagem de FECHAMENTO do backlog (Onda 2.1, item 3 do briefing) — a
 * ÚNICA mensagem que resume os itens já coletados (marcados como vistos por
 * `radar.js comandoAtivarNotificacoes` sem disparar uma notificação por
 * item — mandar ~137-204 mensagens de uma vez é o jeito mais rápido de
 * fazer JB silenciar o bot, e "um canal silenciado é um radar morto")
 * e avisa explicitamente que dali em diante só chega o que for NOVO. Puro
 * — só monta a string; quem chama decide QUANDO (uma vez só, ver
 * data/backlog-fechado.json).
 */
function formatarDigestFechamento({ totalOportunidades, elegivelAgora, scoreMinimo }) {
  const linhas = [
    `🟢 ${negrito('Radar Acadêmico — ligado')}`,
    '',
    escapeMarkdownV2(
      `Nos últimos 12 meses o radar encontrou ${totalOportunidades} oportunidades do seu perfil ` +
        `(Design/UX-IHC/Computação-IA/Educação, docente) no Diário Oficial da União — ${elegivelAgora} elegíveis agora.`
    ),
    '',
    escapeMarkdownV2('Relatório completo em RELATORIO-JB.md (Academico/radar/, na raiz do repo).'),
    '',
    escapeMarkdownV2(
      `A partir de agora você recebe só o que for NOVO — publicado depois de hoje, em dia útil de manhã ` +
        `(sem fim de semana/feriado), com score >= ${scoreMinimo} — itens com titulação não identificada ` +
        '("indeterminada") sempre notificam, independente do score, porque silenciar por falta de dado é pior ' +
        'que uma mensagem a mais.'
    )
  ];
  return linhas.join('\n');
}

/**
 * Mensagem de FECHAMENTO do backlog da trilha MERCADO (Gupy) — mesmo
 * espírito de `formatarDigestFechamento` (docente): a ÚNICA mensagem que
 * resume o histórico já coletado (marcado como visto sem disparar uma
 * notificação por item) e avisa que dali em diante só chega o que for NOVO.
 * Texto e vocabulário PRÓPRIOS da trilha — nunca "edital"/"elegível"/
 * "concurso" (vocabulário docente), sempre "vaga"/"aderente"/"empresa". Puro
 * — só monta a string; `radar.js fecharBacklogDaTrilha` decide QUANDO (uma
 * vez por trilha, ver `data/backlog-fechado.json[trilha]`).
 */
function formatarDigestFechamentoMercado({ totalOportunidades, aderente, scoreMinimo }) {
  const linhas = [
    `💼 ${negrito('Radar de Mercado — trilha nova ligada')}`,
    '',
    escapeMarkdownV2(
      `Uma trilha nova entrou no ar: vagas de mercado (fonte Gupy), separada do radar de concurso docente — ` +
        `formatação e canal próprios, pra não misturar vocabulário de edital com vocabulário de vaga. No histórico ` +
        `coletado até agora são ${totalOportunidades} vagas, ${aderente} aderentes ao seu perfil (score >= ${scoreMinimo}).`
    ),
    '',
    escapeMarkdownV2(
      `A partir de agora você recebe só o que for NOVO — publicado depois de hoje, com score >= ${scoreMinimo} ` +
        `(mesma escala 0-85 e o mesmo limiar da trilha docente, config/notificacao.json).`
    )
  ];
  return linhas.join('\n');
}

/**
 * Mensagem de FECHAMENTO do backlog de uma FONTE NOVA dentro de uma trilha
 * que JÁ ESTÁ em produção (Onda pós-ProgramaThor — a granularidade de
 * fechamento passou de por TRILHA pra por FONTE: uma fonte nova entrando
 * numa trilha já fechada [ex.: ProgramaThor dentro de mercado, fechada com a
 * Gupy em 26/08] reabria exatamente o problema que o fechamento existe pra
 * evitar, ver radar.js `fecharBacklogDaFonte`). Vocabulário ainda é o da
 * TRILHA da fonte (aqui, mercado: "vaga"/"aderente"/"empresa", nunca
 * "edital"/"elegível"/"concurso" — vocabulário docente), mas o texto fala da
 * FONTE específica que entrou no ar (nome + diferencial dela frente às
 * fontes já existentes na mesma trilha), não da trilha em si — "fonte decide
 * o que fechar; trilha decide como falar". Puro — só monta a string; quem
 * chama (`radar.js fecharBacklogDaFonte`) decide QUANDO (uma vez por fonte,
 * ver `data/backlog-fechado.json[fonte]`).
 */
function formatarDigestFechamentoFonteMercado({ fonteLabel, diferencial, totalOportunidades, aderente, scoreMinimo }) {
  const linhas = [
    `💼 ${negrito('Radar de Mercado — fonte nova ligada')}`,
    '',
    escapeMarkdownV2(
      `Uma fonte nova entrou no ar: ${fonteLabel}, dentro da trilha de mercado (mesmo canal e formatação da Gupy — ` +
        `vocabulário de vaga, não de edital). No histórico coletado até agora são ${totalOportunidades} vagas, ` +
        `${aderente} aderentes ao seu perfil (score >= ${scoreMinimo}).`
    ),
    '',
    escapeMarkdownV2(diferencial),
    '',
    escapeMarkdownV2(
      `A partir de agora você recebe só o que for NOVO — publicado depois de hoje, com score >= ${scoreMinimo} ` +
        `(mesma escala 0-85 e o mesmo limiar da trilha mercado, config/notificacao.json).`
    )
  ];
  return linhas.join('\n');
}

/**
 * Aviso de LIMITE DE MENSAGENS por execução (correção urgente pós-Onda 2.1,
 * item 3 do briefing) — cinto de segurança que existe pra sempre, não só pro
 * backlog de amanhã: `radar.js notificar` nunca dispara mais que
 * `config/notificacao.json max_mensagens_por_execucao` mensagens individuais
 * de vaga numa execução só, não importa o tamanho da fila (backlog aberto,
 * falha humana em rodar `ativar-notificacoes`, bug futuro no filtro — não
 * importa a causa). Acima do teto: as N melhores por score saem normalmente;
 * o resto NUNCA é marcado como notificado sem ter sido enviado (mesmo bug do
 * `--dry-run` da Onda 2.1, por outro caminho) — fica na fila pra próxima
 * execução, e esta ÚNICA mensagem avisa quantas ficaram de fora e onde vê-las.
 */
function formatarAvisoLimite({ enviados, restantes }) {
  const linhas = [
    `⚠️ ${negrito('Radar Acadêmico — fila maior que o limite por execução')}`,
    '',
    escapeMarkdownV2(
      `Enviei as ${enviados} oportunidades de maior score nesta execução. ${restantes} ` +
        `ficaram de fora por segurança (limite de mensagens por execução) — continuam na fila ` +
        `e chegam nas próximas execuções (respeitando o mesmo limite), ou você já pode ver todas ` +
        `agora em RELATORIO-JB.md (Academico/radar/, na raiz do repo).`
    )
  ];
  return linhas.join('\n');
}

/**
 * Quebra uma mensagem longa em pedaços <= `limite` chars (item 5 do
 * briefing Onda 2.0 — 4096 é o teto duro do Telegram `sendMessage`; 23
 * itens do digest estourava numa mensagem só). Quebra por FRONTEIRA de
 * item (a régua "➖➖➖" inserida por `formatarDigest`, ou linha em branco
 * como fallback) — nunca corta um item ao meio, o que quebraria o negrito
 * MarkdownV2 aberto sem fechar (asterisco órfão derruba o parse). Se um
 * ÚNICO item já for maior que o limite (não deveria acontecer com o
 * template atual, mas não confiar nisso), corta no limite bruto como
 * último recurso — nunca lança.
 */
function dividirEmPedacos(mensagem, limite = LIMITE_TELEGRAM) {
  const texto = String(mensagem || '');
  if (texto.length <= limite) return [texto];

  const blocos = texto.split(/\n\n(?=➖➖➖)/);
  const pedacos = [];
  let atual = '';

  for (const bloco of blocos) {
    const candidato = atual ? `${atual}\n\n${bloco}` : bloco;
    if (candidato.length <= limite) {
      atual = candidato;
      continue;
    }
    if (atual) pedacos.push(atual);
    if (bloco.length <= limite) {
      atual = bloco;
    } else {
      // último recurso: um único bloco maior que o limite — corta bruto,
      // nunca lança (mais seguro perder formatação MarkdownV2 nesse trecho
      // do que travar o pipeline de notificação inteiro).
      for (let i = 0; i < bloco.length; i += limite) {
        pedacos.push(bloco.slice(i, i + limite));
      }
      atual = '';
    }
  }
  if (atual) pedacos.push(atual);
  return pedacos;
}

async function enviarUmaMensagem(mensagem, { token, chatId, dryRun, parseMode }) {
  // Cerca de baixo nível (lib/modo-seco.js) — checada ANTES do `dryRun`
  // explícito do parâmetro: mesmo que um chamador futuro esqueça de
  // encaminhar `dryRun`, o modo seco ligado pela CLI ainda recusa o envio
  // real. É o mesmo ponto que já existia para `dryRun`/`!token`/`!chatId`,
  // só que agora não depende de nenhum deles.
  if (modoSeco.estaAtivo()) {
    console.log('\n[MODO SECO telegram] envio recusado — nada foi enviado.\n' + mensagem + '\n');
    return { ok: true, dryRun: true, modoSeco: true };
  }
  if (dryRun || !token || !chatId) {
    console.log('\n[DRY-RUN telegram]\n' + mensagem + '\n');
    return { ok: true, dryRun: true };
  }

  const body = { chat_id: chatId, text: mensagem };
  if (parseMode) body.parse_mode = parseMode;

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) {
    throw new Error(
      `[falha: telegram sendMessage | HTTP ${res.status} ${JSON.stringify(data)} | token/chat_id inválido, bot bloqueado, ou MarkdownV2 malformado (caractere reservado sem escape) | conferir .env, @BotFather, e escapeMarkdownV2 se a mensagem tiver dado dinâmico novo]`
    );
  }
  return { ok: true, dryRun: false, resposta: data };
}

/**
 * `parseMode` default 'MarkdownV2' (item 6 do briefing — negrito/itálico no
 * "produto" que JB recebe). Mensagens acima de 4096 chars são quebradas em
 * `dividirEmPedacos` e enviadas em sequência (mesmo `chatId`, na ordem) —
 * transparente pra quem chama, sempre recebe um array de resultados.
 */
async function enviar(mensagem, { token, chatId, dryRun, parseMode = 'MarkdownV2' } = {}) {
  const pedacos = dividirEmPedacos(mensagem);
  if (pedacos.length === 1) {
    return enviarUmaMensagem(pedacos[0], { token, chatId, dryRun, parseMode });
  }
  const resultados = [];
  for (const pedaco of pedacos) {
    resultados.push(await enviarUmaMensagem(pedaco, { token, chatId, dryRun, parseMode }));
  }
  return { ok: true, dryRun: resultados[0].dryRun, partes: resultados.length, resultados };
}

module.exports = {
  formatarMensagem,
  formatarMensagemMercado,
  formatarAlertaSaude,
  formatarDigest,
  formatarDigestFechamento,
  formatarDigestFechamentoMercado,
  formatarDigestFechamentoFonteMercado,
  formatarAvisoLimite,
  dividirEmPedacos,
  escapeMarkdownV2,
  negrito,
  italico,
  linkMarkdown,
  enviar,
  notaConfianca,
  LIMITE_TELEGRAM
};
