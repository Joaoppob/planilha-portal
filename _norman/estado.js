'use strict';
// ===========================================================================
// `_estado` — A MEMÓRIA QUE SOBREVIVE À REESCRITA DIÁRIA (Onda 3)
// ===========================================================================
//
// O PROBLEMA, em uma frase. `Concursos` e `Empregos` são spill de UMA
// fórmula-raiz (ver `formulas.js` — `PAINEL.lista`/`EMPREGOS.lista`), e
// `construir.js` faz `limpar()` da aba INTEIRA a cada build (`values.clear`
// sobre a aba sem faixa — apaga TUDO, inclusive uma coluna digitada que não
// faça parte de nenhuma fórmula). Célula digitada DENTRO do território do
// spill não é sobrescrita — ela MATA a ARRAYFORMULA inteira (o Sheets recusa
// o array expandido: "colidiria com dados"). Célula digitada FORA do spill
// sobrevive à escrita de fórmula, mas é apagada no próximo `limpar()`. E
// mesmo que sobrevivesse às duas coisas, estaria na LINHA ERRADA no dia
// seguinte — a ordem é recalculada por `TODAY()` todo dia (idade do edital,
// balde de prazo, score) e o mesmo edital pode subir ou descer de linha.
//
// A SAÍDA: o check "Inscrito" que JB vê na vista é um ESPELHO. A fonte da
// verdade mora aqui, `_estado`, casada por `url` (a `id` hash não chega às
// vistas — só `_url`/`link (copiar)` chegam; é a mesma escolha que `Fila` já
// faz, `formulas.js FILA_ID_DERIVADO`). `_estado` NUNCA é limpa pelo build
// (`construir.js` não a inclui em `LEITURA`) — ela pertence à classe das
// abas DIGITADAS (`Fila`/`Projetos`/`Tarefas`/`Diário`), só que quem digita
// nela é o PRÓPRIO BUILD, via `colher`/`restaurar` abaixo, e não JB
// diretamente (a aba fica oculta).
//
// TRÊS TEMPOS, NESTA ORDEM OBRIGATÓRIA (ver `construir.js passoColher` /
// `passoRestaurar`, chamados de `main()`):
//   1. COLHER  — antes de qualquer `limpar()`. Lê o check + a `_url` das
//      vistas (na ordem de HOJE, antes de reescrever) e faz o upsert em
//      `_estado` por `colher()` (função pura abaixo).
//   2. CONSTRUIR — o build normal, sem exceção (limpa e reescreve as
//      fórmulas — a ordem das linhas pode mudar).
//   3. RESTAURAR — lê a `_url` JÁ RENDERIZADA na ordem NOVA (só existe
//      depois do recálculo) e escreve o check como VALORES alinhados a essa
//      ordem, via `restaurar()` (função pura abaixo).
//
// Inverter a ordem perde o que JB marcou: se `colher` rodasse DEPOIS do
// `limpar()`, o check já teria sido apagado da tela antes de ser lido. É o
// modo de falha que este arquivo existe pra blindar — ver
// `tests/estado-colher-restaurar.test.js`.
//
// SE O PASSO 1 FALHAR (rede, cota, planilha fora do ar), o build ABORTA
// ANTES do `limpar()` — nunca prossegue perdendo estado. Isso é garantido
// pela ORDEM SEQUENCIAL do `await` em `construir.js main()`, não por um
// try/catch que engole o erro: se `passoColher` rejeita, `main()` rejeita
// junto, e a chamada `main().then(...).catch(...)` nunca alcança o laço de
// `limpar()`, que vem depois no código-fonte.
//
// AS FUNÇÕES ABAIXO SÃO PURAS DE PROPÓSITO — nenhuma toca rede. O que fala
// com a API do Sheets mora em `construir.js` (`passoColher`/`passoRestaurar`,
// que recebem `api` por injeção e por isso são testáveis com um dublê). O
// que decide QUEM GANHA quando o dado muda mora aqui, e é testável sem rede
// nenhuma — é o que `tests/estado-colher-restaurar.test.js` cobre.
//
// DISTINGUIR "EU MARQUEI" DE "O ROBÔ INSCREVEU" (Onda 6 antecipada, item 4d
// do briefing). Cada registro carrega `porQuem` ('JB' | 'robô'). `colher()`
// SÓ atribui 'JB' quando o valor do check MUDOU em relação ao que já estava
// em `_estado` — ou seja, quando alguém de fato tocou a caixinha na planilha
// entre um build e outro. Se o valor não mudou, o registro (incluindo um
// `porQuem: 'robô'` que uma automação futura tenha escrito direto em
// `_estado`, por fora do `colher`) fica INTOCADO. É o que impede o build
// diário de "reatribuir a JB" uma inscrição que o robô fez: o robô escreve
// direto em `_estado` (nunca na vista — ver a doc da Onda 6 no briefing), e
// o próximo `colher()` só reage a uma MUDANÇA na vista, que o robô não
// produz (ele não toca a vista, só o espelho que `restaurar()` recria).

const POR_QUEM = { JB: 'JB', ROBO: 'robô' };
// ONDA 5-6 — três colunas apendadas no FIM (mesma doutrina de `Inscrito`/
// `_por_quem` em Concursos/Empregos: nunca inserir NO MEIO de um cabeçalho
// que já tem consumidor, sempre apendar). Servem a `Candidaturas`:
//   `estagio`        — o único campo que só JB sabe (🟣 inscrito → 📝 prova/
//                       entrevista → 🟢 aprovado → 🔴 não passou). Digitado
//                       em `Candidaturas`, colhido e restaurado pelo MESMO
//                       mecanismo do check `Inscrito` — ver `colherCandidatura`/
//                       `candidaturaCamposNaOrdem` abaixo.
//   `estagio_quando`  — carimbo ISO de quando `estagio` MUDOU pela última
//                       vez (não de quando foi digitado — só muda o carimbo
//                       se o VALOR mudar, mesma regra de `quando`/`inscrito`
//                       acima). É a segunda metade de "aguardando há": dias
//                       desde `quando` (inscrito em) OU desde `estagio_quando`,
//                       o que for MAIS RECENTE — a coluna `Candidaturas!E`
//                       (fórmula viva) faz essa conta.
//   `proximo_passo`   — texto livre, digitado em `Candidaturas`, mesmo
//                       mecanismo. `nota` (já existia, reservada desde a
//                       Onda 3) passa a ser a coluna "notas" de `Candidaturas`
//                       — é também onde `escreverRobo` deixa a divergência
//                       VISÍVEL quando o robô e JB discordam (ver abaixo).
// LEVA 5 (remodelação 2026-09-01) — QUATRO colunas apendadas no FIM, mesma
// doutrina acima ("nunca inserir NO MEIO de um cabeçalho que já tem
// consumidor"):
//   `descartado`         — C1, o "não" que o radar aprende: o check `❌` de
//                          `Concursos`/`Empregos`, persistido pelo MESMO
//                          mecanismo de três tempos que `inscrito` já usa
//                          (ver `restaurarDescarte` abaixo). Vive na MESMA
//                          linha/url que `inscrito` — uma url pode estar
//                          marcada com um, o outro, os dois ou nenhum.
//   `descartado_quando`  — carimbo ISO PRÓPRIO (nunca compartilhado com
//                          `quando`): `quando` já é lido como "inscrito em"
//                          por `Candidaturas` (`candidaturasInscritoEm`,
//                          formulas.js) — se um toque em `❌` atualizasse
//                          `quando` também, a data de inscrição de uma
//                          candidatura viva ficaria contaminada por uma
//                          marcação de descarte na MESMA url. Dois relógios,
//                          dois eventos.
//   `prioridade`         — C3, o `⭐` de `Candidaturas` — juízo de JB,
//                          distinto do score do robô. Mesmo mecanismo de
//                          `estagio`/`proximo_passo` (`colherCandidatura`/
//                          `candidaturaCamposNaOrdem`, abaixo). `Fila!⭐`
//                          NÃO usa este campo: `Fila` é 100% digitada (nunca
//                          limpa pelo build), então sobrevive sozinha —
//                          só o `⭐` de `Candidaturas` precisa de memória
//                          própria porque a linha nasce de um SPILL que se
//                          reordena a cada build.
//   `por_que`            — C4, o pós-morte de `Candidaturas` (texto livre,
//                          preenchido ao fechar). Mesmo mecanismo de `nota`.
// LEVA 7 (remodelação 2026-09-01) — uma quinta coluna apendada no FIM, MESMO
// mecanismo de C3/C4 acima:
//   `link_retomada`      — o link pra voltar direto ao ponto onde um
//                          processo travou numa etapa que só JB destrava
//                          (gravar vídeo, enviar foto, teste que produz o
//                          perfil dele). Texto livre, digitado em
//                          `Candidaturas`, mesmo caminho de `prioridade`/
//                          `por_que` (`colherCandidatura`/
//                          `candidaturaCamposNaOrdem`, abaixo) — nunca
//                          carimbo próprio (não alimenta "aguardando há").
const CABECALHO = [
  'url', 'trilha', 'inscrito', 'quando', 'por quem', 'nota', 'estagio', 'estagio_quando', 'proximo_passo',
  'descartado', 'descartado_quando', 'prioridade', 'por_que', 'link_retomada'
];
const COL = {
  url: 0, trilha: 1, inscrito: 2, quando: 3, porQuem: 4, nota: 5,
  estagio: 6, estagioQuando: 7, proximoPasso: 8,
  descartado: 9, descartadoQuando: 10, prioridade: 11, porQue: 12, linkRetomada: 13
};

/** Data local (America/Sao_Paulo, o fuso em que a planilha inteira já opera) em ISO. */
function isoLocal(d) {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0')
  ].join('-');
}

/** Linhas cruas (como vêm de `values.get`) -> Map(url -> registro). */
function linhasParaMapa(linhas) {
  const mapa = new Map();
  for (const linha of linhas || []) {
    const url = String((linha || [])[COL.url] || '').trim();
    if (!url) continue;
    const inscritoBruto = (linha || [])[COL.inscrito];
    const descartadoBruto = (linha || [])[COL.descartado];
    mapa.set(url, {
      url,
      trilha: String((linha || [])[COL.trilha] || ''),
      inscrito: inscritoBruto === true || String(inscritoBruto || '').trim().toUpperCase() === 'TRUE',
      quando: String((linha || [])[COL.quando] || ''),
      porQuem: String((linha || [])[COL.porQuem] || ''),
      nota: String((linha || [])[COL.nota] || ''),
      estagio: String((linha || [])[COL.estagio] || ''),
      estagioQuando: String((linha || [])[COL.estagioQuando] || ''),
      proximoPasso: String((linha || [])[COL.proximoPasso] || ''),
      // C1 — mesma leitura booleana tolerante de `inscrito` (linha antiga,
      // de antes desta Leva, não tem a coluna: `undefined` -> false).
      descartado: descartadoBruto === true || String(descartadoBruto || '').trim().toUpperCase() === 'TRUE',
      descartadoQuando: String((linha || [])[COL.descartadoQuando] || ''),
      // C3/C4 — `Fila!⭐` NÃO mora aqui (ver comentário do CABECALHO acima).
      prioridade: String((linha || [])[COL.prioridade] || ''),
      porQue: String((linha || [])[COL.porQue] || ''),
      // LEVA 7 — mesma leitura tolerante: linha antiga (de antes desta
      // Leva) não tem a coluna, `undefined` -> ''.
      linkRetomada: String((linha || [])[COL.linkRetomada] || '')
    });
  }
  return mapa;
}

/** Map(url -> registro) -> linhas prontas pra `values.update` (ordem estável por url). */
function mapaParaLinhas(mapa) {
  return [...mapa.values()]
    .sort((a, b) => a.url.localeCompare(b.url))
    .map(r => [
      r.url, r.trilha || '', r.inscrito ? 'TRUE' : 'FALSE', r.quando || '', r.porQuem || '', r.nota || '',
      r.estagio || '', r.estagioQuando || '', r.proximoPasso || '',
      r.descartado ? 'TRUE' : 'FALSE', r.descartadoQuando || '', r.prioridade || '', r.porQue || '',
      r.linkRetomada || ''
    ]);
}

/**
 * TEMPO 1 — o upsert. `capturas`: array de `{url, trilha, inscrito}` lido das
 * vistas (uma entrada por linha viva, de todas as abas que alimentam
 * `_estado` — ver `construir.js`). `agora`: string ISO (injetada, não
 * `new Date()` aqui dentro — é o que mantém esta função pura e testável com
 * data fixa).
 *
 * Regra de upsert:
 *   - url nova + inscrito=false + descartado=false -> NADA a lembrar, não
 *     cria registro (não faz sentido guardar "não inscrito, não descartado"
 *     pra cada edital que já passou pelo radar; a AUSÊNCIA de registro já
 *     significa "sem sinal nenhum").
 *   - url nova + inscrito=true OU descartado=true  -> cria registro,
 *     porQuem='JB', quando=agora (só se inscrito=true — ver LEVA 5 abaixo).
 *   - url existente, inscrito OU descartado MUDOU -> atualiza os dois
 *     campos, preserva `nota` e `trilha` (a trilha só é sobrescrita se a
 *     captura trouxer uma trilha não-vazia — protege contra um chamador que
 *     não souber a trilha de uma url já conhecida).
 *   - url existente, os dois valores IGUAIS -> INTOCADO (é o que protege um
 *     `porQuem: 'robô'` escrito por fora do `colher`).
 *
 * LEVA 5 (C1, remodelação 2026-09-01) — `descartado` (o `❌` de
 * `Concursos`/`Empregos`) entra no MESMO upsert de `inscrito`, porque vive
 * na MESMA linha/url e é lido da MESMA vista, na MESMA passada. `quando`
 * (a data que `Candidaturas!inscrito em` lê) só se move quando `inscrito`
 * muda — nunca por causa de `descartado` sozinho; `descartadoQuando` é o
 * relógio PRÓPRIO do descarte, e só se move quando `descartado` muda. Os
 * dois relógios são independentes de propósito (ver o comentário do
 * `CABECALHO`, acima): sem isso, marcar `❌` numa url que também é uma
 * candidatura viva contaminaria a data de inscrição dela.
 *
 * MERGE DENTRO DO LOTE (achado ao vivo, prova da Onda 3-4 fechada na Onda
 * 8-9): `capturas` pode trazer a MESMA url mais de uma vez no MESMO lote —
 * `Concursos` e `Concursos · tudo` mostram o MESMO conjunto de editais
 * (mesma forma, duas renderizações, doutrina de `formulas.js`), e
 * `passoColher` lê o check das DUAS. Medido ao vivo: marcar "Inscrito" em
 * `Concursos` e rodar o build fazia o check DESAPARECER — a captura de
 * `Concursos · tudo` (sempre FALSE, porque ninguém abre essa aba oculta)
 * processava DEPOIS na mesma passada e apagava a marcação que acabara de
 * entrar, na MESMA chamada de `colher`. Regra: dentro de UM lote, `inscrito`
 * é OR entre as capturas da mesma url — se qualquer fonte captou TRUE, o
 * lote inteiro entra como TRUE. `descartado` segue a MESMA regra de OR
 * dentro do lote, pelo mesmo motivo. Fora do lote (chamada seguinte, dia
 * seguinte), a regra de cima (MUDOU/IGUAL) continua valendo normalmente.
 *
 * Devolve `{ mapa, alterados }` — `mapa` é um Map NOVO (não muta o
 * `mapaAtual` recebido), `alterados` é a contagem de registros criados ou
 * mudados (0 = nada a regravar em `_estado`).
 */
function colher(mapaAtual, capturas, agora) {
  const mapa = new Map(mapaAtual);
  let alterados = 0;

  const porUrl = new Map();
  for (const cap of capturas || []) {
    const url = String((cap || {}).url || '').trim();
    if (!url) continue;
    const inscrito = !!(cap && cap.inscrito);
    const descartado = !!(cap && cap.descartado);
    const existente = porUrl.get(url);
    if (!existente) {
      porUrl.set(url, { url, trilha: (cap && cap.trilha) || '', inscrito, descartado });
    } else {
      if (inscrito) existente.inscrito = true;
      if (descartado) existente.descartado = true;
      if (!existente.trilha && cap && cap.trilha) existente.trilha = cap.trilha;
    }
  }

  for (const cap of porUrl.values()) {
    const { url, inscrito, descartado } = cap;
    const existente = mapa.get(url);
    if (!existente) {
      if (!inscrito && !descartado) continue;
      mapa.set(url, {
        url, trilha: cap.trilha || '', inscrito, descartado,
        quando: inscrito ? agora : '', descartadoQuando: descartado ? agora : '',
        porQuem: POR_QUEM.JB, nota: ''
      });
      alterados++;
      continue;
    }
    const mudouInscrito = existente.inscrito !== inscrito;
    const mudouDescartado = !!existente.descartado !== descartado;
    if (mudouInscrito || mudouDescartado) {
      mapa.set(url, {
        ...existente,
        trilha: cap.trilha || existente.trilha,
        inscrito,
        descartado,
        quando: mudouInscrito ? agora : existente.quando,
        descartadoQuando: mudouDescartado ? agora : existente.descartadoQuando,
        porQuem: POR_QUEM.JB
      });
      alterados++;
    }
  }
  return { mapa, alterados };
}

/**
 * TEMPO 3 — a leitura de volta. `urlsNaOrdem`: array de url na ORDEM NOVA
 * (uma vista por vez — chamar uma vez por aba). Devolve um array de boolean
 * do MESMO tamanho, alinhado posição a posição: `restaurar(mapa, urls)[i]`
 * é o que vai na linha `i` da coluna Inscrito daquela vista.
 *
 * Url vazia (linha além do dado real, dentro da faixa de escrita) devolve
 * `''` — string vazia, não `false` — pra não sujar uma linha que nem existe
 * com um valor booleano que a validação BOOLEAN aceitaria mas que não
 * corresponde a edital nenhum.
 */
function restaurar(mapa, urlsNaOrdem) {
  return (urlsNaOrdem || []).map(url => {
    const u = String(url || '').trim();
    if (!u) return '';
    const r = mapa.get(u);
    return r ? !!r.inscrito : false;
  });
}

/**
 * TEMPO 3, IRMÃ DE `restaurar` — item 4d do briefing (distinguir "eu
 * marquei" de "o robô inscreveu"). Devolve o `porQuem` alinhado à MESMA
 * ordem de `urlsNaOrdem`, pra ser escrito numa coluna oculta espelho
 * (`_por_quem`) ao lado do checkbox — nunca lida de volta por `colher`
 * (é mirror puro: a fonte do dado é sempre `_estado`, nunca a vista).
 * String vazia pra url vazia OU nunca marcada — só carrega texto quando há
 * algo a dizer, mesmo padrão de `restaurar`.
 */
function porQuemNaOrdem(mapa, urlsNaOrdem) {
  return (urlsNaOrdem || []).map(url => {
    const u = String(url || '').trim();
    if (!u) return '';
    const r = mapa.get(u);
    return r && r.inscrito ? (r.porQuem || '') : '';
  });
}

/**
 * TEMPO 3, IRMÃ DE `restaurar` — C1 (Leva 5). Devolve o `descartado`
 * alinhado à MESMA ordem de `urlsNaOrdem`, pra ser escrito como VALOR na
 * coluna `❌` de `Concursos`/`Concursos · tudo`/`Empregos`. Mesma forma de
 * `restaurar` (boolean por posição, `''` pra url vazia) — é a IRMÃ dela,
 * lendo o campo `descartado` do registro em vez de `inscrito`.
 */
function restaurarDescarte(mapa, urlsNaOrdem) {
  return (urlsNaOrdem || []).map(url => {
    const u = String(url || '').trim();
    if (!u) return '';
    const r = mapa.get(u);
    return r ? !!r.descartado : false;
  });
}

/**
 * C2 (Leva 5) — MIGRAÇÃO DE VALOR LEGADO. O funil de `Candidaturas` ganhou
 * três estágios novos e um vocabulário novo (`📨 inscrito → 🧾 docs → 📝
 * prova/entrevista → ⏳ resultado → 🟢 aprovado → 🔴 não passou → ⚫
 * retirei`); o valor ANTIGO `🟣 inscrito` já existe em `_estado` — dado REAL
 * de JB, não sintético — e a fronteira do briefing é clara: MIGRA, nunca
 * apaga. `mapaLegado`: `{ valorAntigo: valorNovo }` (`F.MIGRACAO_ESTAGIO_
 * LEGADO`, injetado por quem chama — este arquivo não importa `formulas.js`
 * de propósito, mesma doutrina de "funções puras" do topo do arquivo).
 *
 * Só toca `estagio`; `estagioQuando` FICA — a migração é de VOCABULÁRIO
 * ("como esse posto se chama agora"), não de EVENTO ("quando o estágio
 * mudou"): mudar o carimbo aqui inventaria uma mudança de estado que não
 * aconteceu. Idempotente: rodar de novo com um mapa já migrado encontra
 * zero valor antigo e devolve `migrados: 0`.
 */
function migrarEstagiosLegado(mapaAtual, mapaLegado) {
  const mapa = new Map(mapaAtual);
  let migrados = 0;
  for (const [url, r] of mapa) {
    const novo = mapaLegado && mapaLegado[r.estagio];
    if (novo && novo !== r.estagio) {
      mapa.set(url, { ...r, estagio: novo });
      migrados++;
    }
  }
  return { mapa, migrados };
}

// ===========================================================================
// `Candidaturas` (Onda 5) — MESMO mecanismo de três tempos, aplicado aos
// campos que só JB sabe (`estagio`/`proximo_passo`/`nota`).
// ===========================================================================
//
// `Candidaturas` NASCE de `_estado` (uma linha por url com `inscrito=true`) —
// órgão/empresa, vaga, trilha e "inscrito em" são ARRAYFORMULA (derivados,
// ver `_norman/formulas.js CANDIDATURAS_FORMULA`). `estagio`/`próximo
// passo`/`notas` são as três colunas DIGITADAS, fora do território do
// spill — e por isso precisam do MESMO colher/restaurar que `Inscrito` já
// usa: a ordem das linhas de `Candidaturas` pode mudar entre builds (uma
// candidatura nova entra, uma some porque JB desmarcou o check), e uma
// célula digitada alinhada por POSIÇÃO em vez de por url acabaria colada na
// linha ERRADA — exatamente o modo de falha que `_norman/estado.js` (topo do
// arquivo) existe pra impedir.

/**
 * TEMPO 1, irmã de `colher` — lê `Candidaturas!F` (estágio), `!G` (próximo
 * passo) e `!H` (notas) da ORDEM ATUAL (antes do rebuild), casadas pela
 * `_url` oculta (`!I`, mesma coluna que `candidaturaCamposNaOrdem` escreve).
 * `capturas`: array de `{url, estagio, proximoPasso, nota}`.
 *
 * Diferença de `colher()`: aqui NUNCA se cria um registro novo — uma
 * `Candidaturas` só existe pra uma url que JÁ está em `_estado` com
 * `inscrito=true` (ela nasceu de lá; não o contrário). Uma captura com url
 * que não existe no mapa, ou que existe mas com `inscrito=false`, é
 * IGNORADA — a linha correspondente na vista já deveria ter sumido no
 * próximo rebuild (o join morreu), então não há onde gravar o valor de
 * volta com segurança.
 *
 * `estagio_quando` só muda quando `estagio` MUDA de valor — é o que alimenta
 * "aguardando há" (a coluna reresponde a MUDANÇA de estágio, não a toda
 * gravação). `proximo_passo`/`nota` não carregam carimbo de data própria
 * (o briefing só pede o carimbo pra estágio). O MESMO vale pra `prioridade`
 * (C3, `⭐`) e `por_que` (C4, pós-morte) — LEVA 5: dois campos digitados a
 * mais, mesmo mecanismo, sem carimbo próprio (nenhum dos dois alimenta
 * "aguardando há"). LEVA 7 acrescenta `link_retomada` pelo MESMO caminho,
 * mesma ausência de carimbo próprio.
 */
function colherCandidatura(mapaAtual, capturas, agora) {
  const mapa = new Map(mapaAtual);
  let alterados = 0;
  for (const cap of capturas || []) {
    const url = String((cap || {}).url || '').trim();
    if (!url) continue;
    const existente = mapa.get(url);
    if (!existente || !existente.inscrito) continue; // não cria Candidaturas por fora de _estado

    const estagio = String((cap && cap.estagio) || '').trim();
    const proximoPasso = String((cap && cap.proximoPasso) || '').trim();
    const nota = String((cap && cap.nota) || '').trim();
    const prioridade = String((cap && cap.prioridade) || '').trim();
    const porQue = String((cap && cap.porQue) || '').trim();
    const linkRetomada = String((cap && cap.linkRetomada) || '').trim();

    const mudouEstagio = estagio !== (existente.estagio || '');
    const mudouProximo = proximoPasso !== (existente.proximoPasso || '');
    const mudouNota = nota !== (existente.nota || '');
    const mudouPrioridade = prioridade !== (existente.prioridade || '');
    const mudouPorQue = porQue !== (existente.porQue || '');
    const mudouLinkRetomada = linkRetomada !== (existente.linkRetomada || '');
    if (!mudouEstagio && !mudouProximo && !mudouNota && !mudouPrioridade && !mudouPorQue && !mudouLinkRetomada) continue;

    mapa.set(url, {
      ...existente,
      estagio: mudouEstagio ? estagio : existente.estagio,
      estagioQuando: mudouEstagio ? agora : existente.estagioQuando,
      proximoPasso: mudouProximo ? proximoPasso : existente.proximoPasso,
      nota: mudouNota ? nota : existente.nota,
      prioridade: mudouPrioridade ? prioridade : existente.prioridade,
      porQue: mudouPorQue ? porQue : existente.porQue,
      linkRetomada: mudouLinkRetomada ? linkRetomada : existente.linkRetomada
    });
    alterados++;
  }
  return { mapa, alterados };
}

/**
 * TEMPO 3, irmã de `restaurar`/`porQuemNaOrdem` — devolve os SEIS campos
 * digitados alinhados à ORDEM NOVA de urls (pós-rebuild), prontos pra
 * `passoRestaurar` escrever como VALORES em `Candidaturas!G:L` (estágio ·
 * próximo passo · notas · ⭐ · por quê · link retomada — LEVA 7 acrescentou
 * o último). Url sem registro (não deveria acontecer — toda url na vista de
 * `Candidaturas` vem de um `_estado` com `inscrito=true` — mas é defendido
 * mesmo assim) devolve string vazia nos seis campos.
 */
function candidaturaCamposNaOrdem(mapa, urlsNaOrdem) {
  const estagio = [], proximoPasso = [], nota = [], prioridade = [], porQue = [], linkRetomada = [];
  for (const url of urlsNaOrdem || []) {
    const u = String(url || '').trim();
    const r = u ? mapa.get(u) : null;
    estagio.push(r ? (r.estagio || '') : '');
    proximoPasso.push(r ? (r.proximoPasso || '') : '');
    nota.push(r ? (r.nota || '') : '');
    prioridade.push(r ? (r.prioridade || '') : '');
    porQue.push(r ? (r.porQue || '') : '');
    linkRetomada.push(r ? (r.linkRetomada || '') : '');
  }
  return { estagio, proximoPasso, nota, prioridade, porQue, linkRetomada };
}

// ===========================================================================
// ONDA 6 — O CONTRATO DE ESCRITA DO ROBÔ DE INSCRIÇÃO
// ===========================================================================
//
// JB: "quando estivermos automatizando a inscrição para essas vagas, essa
// coluna que irá nos dizer se estamos inscritos ou não." Não existe robô
// ainda — é trabalho futuro, fora desta Onda. O CONTRATO tem que estar
// fechado ANTES de o robô nascer, porque depois que uma automação já
// escreveu por cima de uma marcação de JB uma vez, a confiança no check
// "Inscrito" morre pra sempre (é a mesma lei da Onda 3: o dado tem que
// sobreviver à máquina, não confiar nela).
//
// REGRA ÚNICA: o robô NUNCA apaga uma marcação de JB no mesmo id/url. Se o
// registro já existe com `porQuem='JB'` e o valor que o robô quer escrever
// DIVERGE do que já está lá, a marcação de JB VENCE — nem `inscrito` nem
// `porQuem` mudam — e a DIVERGÊNCIA fica visível de duas formas, nenhuma
// silenciosa:
//   1. no valor de retorno (`divergencias`), pra quem chamar decidir como
//      alertar (hoje ninguém chama isto ainda, mas o canal já existe);
//   2. NA PRÓPRIA PLANILHA — um carimbo é acrescentado a `nota`, que
//      `Candidaturas!notas` (Onda 5) exibe pra JB sem que ele precise abrir
//      log nenhum. É o mesmo princípio de "número que hoje é 0 diz a
//      verdade" (C7 do plano-mãe): a divergência não é escondida atrás de
//      um canal que ninguém olha.
//
// Se não há registro de JB no caminho (url nova, ou registro já é do
// próprio robô — `porQuem!=='JB'`), o robô escreve normalmente, com
// `porQuem='robô'` — é o caminho feliz, e é o que `colher()` (acima) já
// respeita na direção contrária (JB nunca reescreve um `porQuem='robô'`
// que não mudou de valor).
//
// `escritas`: array de `{url, trilha, inscrito}` — o mesmo formato de
// `capturas` em `colher()`, propositalmente: um robô real chamaria isto com
// a mesma forma de dado que uma leitura de vista produz hoje.
function escreverRobo(mapaAtual, escritas, agora) {
  const mapa = new Map(mapaAtual);
  const divergencias = [];
  let alterados = 0;

  for (const esc of escritas || []) {
    const url = String((esc || {}).url || '').trim();
    if (!url) continue;
    const inscrito = !!(esc && esc.inscrito);
    const existente = mapa.get(url);

    if (existente && existente.porQuem === POR_QUEM.JB && !!existente.inscrito !== inscrito) {
      divergencias.push({ url, jb: existente.inscrito, robo: inscrito });
      const carimbo = `⚠️ robô tentou marcar "${inscrito ? 'inscrito' : 'não inscrito'}" em ${agora}; ` +
        `JB decidiu "${existente.inscrito ? 'inscrito' : 'não inscrito'}" — mantido.`;
      if (!(existente.nota || '').includes(carimbo)) {
        mapa.set(url, { ...existente, nota: existente.nota ? `${existente.nota} | ${carimbo}` : carimbo });
        alterados++;
      }
      continue; // JB vence: inscrito/porQuem NÃO mudam.
    }

    if (!existente) {
      if (!inscrito) continue; // mesma regra de colher(): não guarda "não inscrito" pra url nova
      mapa.set(url, {
        url, trilha: (esc && esc.trilha) || '', inscrito: true, quando: agora,
        porQuem: POR_QUEM.ROBO, nota: '', estagio: '', estagioQuando: '', proximoPasso: ''
      });
      alterados++;
      continue;
    }

    if (!!existente.inscrito !== inscrito) {
      mapa.set(url, {
        ...existente,
        trilha: (esc && esc.trilha) || existente.trilha,
        inscrito,
        quando: agora,
        porQuem: POR_QUEM.ROBO
      });
      alterados++;
    }
  }

  return { mapa, alterados, divergencias };
}

module.exports = {
  ABA_CABECALHO: CABECALHO, COL, POR_QUEM,
  isoLocal, linhasParaMapa, mapaParaLinhas, colher, restaurar, porQuemNaOrdem, restaurarDescarte,
  colherCandidatura, candidaturaCamposNaOrdem, migrarEstagiosLegado, escreverRobo
};
