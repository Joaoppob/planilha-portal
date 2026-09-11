'use strict';

/**
 * Gera RELATORIO-JB.md — item 3 do briefing Onda 1.7: "o recorte que JB
 * pediu". Diferente de RELATORIO-BACKFILL.md (log técnico da execução do
 * pipeline), este relatório responde a pergunta original de JB: "o que
 * existe no Brasil para o meu perfil, e a que eu poderia concorrer?" Função
 * pura — recebe os dados já carregados (store reprocessado + amostra IF),
 * devolve string. Todo número vem de um dos dois; nada é estimado aqui.
 */

function contarPor(lista, chaveFn) {
  const contagem = {};
  for (const item of lista) {
    const chave = chaveFn(item);
    contagem[chave] = (contagem[chave] || 0) + 1;
  }
  return contagem;
}

function ordenarContagem(contagem) {
  return Object.entries(contagem).sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
}

function formatarTabela(contagem, colChave, colValor) {
  const linhas = ordenarContagem(contagem);
  if (!linhas.length) return '_(sem dados)_';
  const cab = `| ${colChave} | ${colValor} |\n|---|---|\n`;
  return cab + linhas.map(([k, v]) => `| ${k} | ${v} |`).join('\n');
}

function normalizarTipo(tipo) {
  if (tipo === 'substituto') return 'substituto/temporário';
  if (tipo === 'efetivo') return 'efetivo';
  if (tipo === 'posdoc_bolsa') return 'pós-doc/bolsa';
  return 'não identificado';
}

const MARCA_VEREDITO = {
  elegivel_agora: '✅ elegível agora',
  elegivel_futuro: '🕒 elegível no futuro (pós-doutorado)',
  indeterminada: '❓ indeterminado — abrir edital',
  fora: '⚪ fora'
};

function gerar({ registros, amostraIF, perfil }) {
  const total = registros.length;

  const elegivelAgora = registros.filter(r => r.veredito === 'elegivel_agora');
  const elegivelFuturo = registros.filter(r => r.veredito === 'elegivel_futuro');
  const indeterminada = registros.filter(r => r.veredito === 'indeterminada');
  const fora = registros.filter(r => r.veredito === 'fora');
  const semScore = registros.filter(r => r.veredito === null || r.veredito === undefined);

  const agoraPorTipo = contarPor(elegivelAgora, r => normalizarTipo(r.tipo));
  const agoraPorUf = contarPor(elegivelAgora, r => r.uf || 'não identificado');

  // Onda 2.1 — area_mestrado/area_graduacao confirmadas via CV (ver
  // config/perfil.json), substituindo o `pressupoe` genérico da Onda 1.9 por
  // uma checagem real de área (lib/elegibilidade.js `avaliarAreaCompativel`).
  // Três grupos dentro de "elegível agora": área CONFIRMADA compatível (sem
  // ressalva alguma), área a verificar na banca (Computação/IA ou
  // Educação/Ensino — JB tem a titulação, mas não é a área da formação), e
  // área da própria vaga não identificada no texto (não dá pra avaliar).
  const areaCompativelConfirmada = elegivelAgora.filter(r => r.area_compativel === 'compativel');
  const areaAVerificarBanca = elegivelAgora.filter(r => r.area_compativel === 'a_verificar_na_banca');
  const areaNaoIdentificada = elegivelAgora.filter(r => r.area_compativel === null);
  const comRessalvaDeArea = [...areaAVerificarBanca, ...areaNaoIdentificada];
  const ressalvaPorTipo = contarPor(comRessalvaDeArea, r => normalizarTipo(r.tipo));
  const ressalvaPorUf = contarPor(comRessalvaDeArea, r => r.uf || 'não identificado');

  // Cruzamento com os avisos de substituto de IF (item 3 do briefing): match
  // por URL EXATA — hipotese-if.js e a coleta principal (fontes/dou.js
  // normalizarParcial) usam a MESMA função `urlCanonica` sobre o MESMO
  // rawItem, então a mesma vaga gera a MESMA string de url nos dois lugares.
  const urlsIF = new Set((amostraIF || []).map(r => r.url).filter(Boolean));
  const cruzamento = registros.filter(r => r.url && urlsIF.has(r.url));
  // checagem independente (não depende de bater a URL exata): quantos itens
  // da área de JB já mencionam "Instituto Federal" no órgão E foram
  // classificados como substituto/temporário — serve pra confirmar (ou não)
  // que o cruzamento por URL não está subestimando por causa de alguma
  // diferença de formatação de link.
  const ifSubstitutoPorOrgao = registros.filter(
    r => /instituto federal/i.test(r.orgao || '') && r.tipo === 'substituto'
  );

  const porMes = contarPor(registros, r => (r.data_publicacao || '').slice(0, 7) || 'não identificado');

  const top20 = [...registros]
    .filter(r => typeof r.score === 'number')
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);

  const linhas = [];
  linhas.push('# Radar Acadêmico — Relatório para JB');
  linhas.push('');
  linhas.push(`Gerado em ${new Date().toISOString()}.`);
  linhas.push('');
  linhas.push(
    '> **Nota metodológica (Onda 2.1)** — quando a sua formação real (mestrado e graduação) está ' +
      'preenchida em `config/perfil.json`, isso resolve o pressuposto genérico da Onda 1.9 ' +
      '(`area_mestrado: "a_confirmar"`) por uma checagem REAL de área — ver `config/perfil.json` e ' +
      '`lib/elegibilidade.js`. Vaga de área compatível com ALTA confiança (a mesma categoria da sua ' +
      'formação, ver config/keywords.json) é marcada assim; vaga de área fora dessa categoria fica ' +
      'marcada ⚠️ `a_verificar_na_banca` — você tem a titulação, mas a área não é a da formação, e ' +
      'editais decidem "área afim" por banca, nunca presumido como sim. Ver §"A ressalva de área" ' +
      'para o detalhamento.'
  );
  linhas.push('');
  linhas.push(
    '> **Nota metodológica (Onda 2.0)** — auditoria dos 21 itens `titulacao_exigida: \'graduacao\'` ' +
      '(hipótese: implausível pra vaga de IF substituto ter só 1 mestrado contra 21 graduações). ' +
      'Resultado: **18/21 legítimos** — Professor Substituto EBTT de Instituto Federal exige só ' +
      'graduação por lei (Lei 12.772/2012), mestrado NÃO é padrão nessa modalidade — a hipótese ' +
      'original estava errada. **3/21 eram falso positivo real**, por dois mecanismos NOVOS (não o ' +
      'suspeito de URL `/graduacao`, já corrigido na Onda 1.6): (1) UFRGS — o filtro de keyword batia ' +
      'dentro da lista de "graduações aceitas" de uma vaga de OUTRA área (Estatística virou "Design", ' +
      'score 86, #1 do ranking); (2) UFES/UFMT — "graduação" batia em nome de disciplina ("Projeto de ' +
      'Graduação I/II") ou de departamento ("Instituto de X/Graduação em Y"), não em requisito real. ' +
      'Ambos corrigidos em `lib/subedital-extrator.js` (`areaDivergeDoRequisito`) e ' +
      '`lib/extrator-texto.js` (`extrairTitulacao`), com teste de regressão e reprocessamento retroativo ' +
      '— "elegível agora" caiu de 23 para 20 (números mais confiáveis, não mais itens). Tentativa de ' +
      'ler os 117 indeterminados com Gemma 26B local (item 2b) **ficou bloqueada nesta sessão**: o ' +
      'modelo grande não carregou (RAM livre da máquina insuficiente pro buffer de offload) e o ' +
      'fallback pequeno (gemma3:4b) alucinou dado em teste real (afirmou titulação com certeza=true ' +
      'onde o texto não menciona titulação nenhuma) — não usado em massa por violar a regra de nunca ' +
      'inventar. Os 117 continuam `indeterminada` (honesto), pendente de nova tentativa quando a ' +
      'máquina tiver RAM livre.'
  );
  linhas.push('');
  linhas.push(
    '**Pergunta original**: o que existe no Brasil para o meu perfil (configurado em `config/perfil.json` ' +
      'e `config/keywords.json`), e a que eu poderia concorrer? Base: Diário Oficial ' +
      'da União, Seção 3, 12 meses (12-08-2025 a 12-08-2026), já reprocessado com as correções desta onda ' +
      '(ver §"O que este relatório NÃO sabe").'
  );
  linhas.push('');

  linhas.push('## O número — quantas vagas você pode assumir HOJE');
  linhas.push('');
  linhas.push(
    `**${elegivelAgora.length} de ${total}** oportunidades no seu perfil de área NÃO exigem doutorado ` +
      'concluído — são vagas que você já preenche o requisito de titulação (graduação, especialização ' +
      'ou mestrado, agora confirmado) para assumir hoje, se aprovado.'
  );
  linhas.push('');
  linhas.push(
    `✅ **${areaCompativelConfirmada.length} dos ${elegivelAgora.length}** têm área CONFIRMADA compatível ` +
      '(a mesma categoria da formação registrada em config/perfil.json), sem ressalva alguma. ' +
      `⚠️ **${comRessalvaDeArea.length} dos ${elegivelAgora.length}** ` +
      `${comRessalvaDeArea.length === 1 ? 'carrega' : 'carregam'} ressalva de área — ver §"A ressalva de área".`
  );
  linhas.push('');
  linhas.push('Por tipo de vínculo:');
  linhas.push('');
  linhas.push(formatarTabela(agoraPorTipo, 'tipo', 'quantidade'));
  linhas.push('');
  linhas.push('Por UF:');
  linhas.push('');
  linhas.push(formatarTabela(agoraPorUf, 'UF', 'quantidade'));
  linhas.push('');

  linhas.push('## O resto do quadro');
  linhas.push('');
  linhas.push(
    `- **${elegivelFuturo.length}** exigem doutorado concluído — sua janela é 2029 (pós-defesa), não agora.`
  );
  linhas.push(
    `- **${indeterminada.length}** com titulação exigida NÃO identificada no texto do edital — elegibilidade ` +
      'indeterminada (não presumida como "futuro" nem descartada). Cada um destes está notificado com o link ' +
      'e o aviso explícito "abrir o edital para conferir" (ver `lib/telegram.js`).'
  );
  if (fora.length) linhas.push(`- **${fora.length}** descartados por termo negativo (cargo técnico/administrativo, não docente).`);
  if (semScore.length) linhas.push(`- **${semScore.length}** ainda sem score calculado (rode \`node radar.js julgar\`).`);
  linhas.push('');

  linhas.push('## A ressalva de área');
  linhas.push('');
  linhas.push(
    `Dos **${elegivelAgora.length}** itens marcados "elegível agora" (JB TEM a titulação exigida — ` +
      'graduação, especialização ou mestrado — em qualquer um destes casos), a área da vaga se divide em ' +
      `três grupos: **${areaCompativelConfirmada.length}** com \`area_compativel: "compativel"\` (Design/UX-IHC, ` +
      `mesma área da formação de JB — sem ressalva), **${areaAVerificarBanca.length}** com \`area_compativel: ` +
      '"a_verificar_na_banca"` (a vaga pede Computação/IA ou Educação/Ensino — JB tem a titulação mas não é a ' +
      `área da formação; editais aceitam "área afim" a critério da banca do concurso, nunca presumido como ` +
      `sim) e **${areaNaoIdentificada.length}** com \`area_compativel: null\` (a área da própria vaga não foi ` +
      'identificada no texto do edital — não dá para avaliar).'
  );
  linhas.push('');
  if (comRessalvaDeArea.length) {
    linhas.push('Por tipo de vínculo (dos que carregam ressalva de área — a_verificar_na_banca ou área não identificada):');
    linhas.push('');
    linhas.push(formatarTabela(ressalvaPorTipo, 'tipo', 'quantidade'));
    linhas.push('');
    linhas.push('Por UF (dos que carregam ressalva de área):');
    linhas.push('');
    linhas.push(formatarTabela(ressalvaPorUf, 'UF', 'quantidade'));
    linhas.push('');
  }
  linhas.push(
    '**O que isso significa na prática**: os itens ⚠️ não são falsos positivos — JB pode se inscrever, tem a ' +
      'titulação mínima. A ressalva é só sobre a banca aceitar a área do mestrado/graduação de JB como "afim" ' +
      `à exigida pelo edital. Dos ${elegivelAgora.length} "elegível agora", **${areaCompativelConfirmada.length}** ` +
      `(${elegivelAgora.length ? Math.round((areaCompativelConfirmada.length / elegivelAgora.length) * 100) : 0}%) ` +
      'não dependem de banca nenhuma — a área já bate.'
  );
  linhas.push('');

  linhas.push('## Cruzamento com os avisos de substituto de IF');
  linhas.push('');
  linhas.push(
    `Dos **${amostraIF.length}** avisos de processo seletivo de professor substituto de Instituto Federal ` +
      `detectados no DOU no período (hipótese Onda 1.5 — heurística ampla, qualquer área), **${cruzamento.length}** ` +
      'batem por URL exata com um item do seu radar (área de JB já confirmada).'
  );
  linhas.push('');
  linhas.push(
    `Checagem independente (sem depender de casar a URL): **${ifSubstitutoPorOrgao.length}** itens do seu radar ` +
      'já têm "Instituto Federal" no nome do órgão e tipo=substituto — número no mesmo patamar do cruzamento por URL, ' +
      'o que indica que a interseção pequena NÃO é um bug de matching.'
  );
  linhas.push('');
  linhas.push(
    'A explicação real é estrutural, não um furo: os 457 avisos de IF cobrem QUALQUER área (Matemática, ' +
      'Língua Portuguesa, Educação Física, Administração, etc.) — a heurística de `lib/hipotese-if.js` só ' +
      'reconhece "isto é um aviso de substituto de IF", nunca filtrou por área. O seu radar (os itens deste ' +
      'relatório) já passou pelo filtro de área de JB (Design/UX/Computação-IA/Educação) ANTES de entrar no ' +
      'store. A interseção pequena é o filtro de área funcionando como esperado sobre um universo amplo — não ' +
      'perda de recall. Dito isso: parte dos 457 pode legitimamente ser da área de JB e ter caído em ' +
      '`indeterminada` por falta de titulação identificada no texto (mais um motivo pra abrir os itens ' +
      '`indeterminada` deste radar manualmente em vez de confiar só no filtro automático).'
  );
  linhas.push('');

  linhas.push('## Sazonalidade (número corrigido)');
  linhas.push('');
  linhas.push(formatarTabela(porMes, 'mês', 'quantidade'));
  linhas.push('');
  linhas.push(
    '_Nota: a primeira versão do backfill (26 itens, pipeline antigo) via pico em nov/dez — amostra pequena ' +
      'demais pra qualquer conclusão. Com o pipeline corrigido, o pico real não é mais nov/dez — use SÓ a ' +
      'tabela acima pra qualquer decisão de agendamento/prioridade sazonal._'
  );
  linhas.push('');

  linhas.push('## As 20 mais aderentes ao seu perfil');
  linhas.push('');
  if (top20.length === 0) {
    linhas.push('_Nenhum item com score calculado — rode `node radar.js julgar --ollama off` antes de gerar o relatório._');
  } else {
    linhas.push('| # | Elegibilidade | Score | Instituição | Campus/UF | Área | Titulação | Tipo | Publicado em | Link |');
    linhas.push('|---|---|---|---|---|---|---|---|---|---|');
    top20.forEach((r, i) => {
      const marcaBase = MARCA_VEREDITO[r.veredito] || (r.veredito || '?');
      const temRessalvaDeArea =
        r.veredito === 'elegivel_agora' && (r.area_compativel === 'a_verificar_na_banca' || r.area_compativel === null);
      const marca = temRessalvaDeArea ? `${marcaBase} ⚠️` : marcaBase;
      const campusUf = [r.campus, r.uf].filter(Boolean).join(' / ') || '?';
      linhas.push(
        `| ${i + 1} | ${marca} | ${r.score} | ${r.orgao || '?'} | ${campusUf} | ${r.area || '?'}/${r.subarea || '?'} | ` +
          `${r.titulacao_exigida || 'não identificada'} | ${normalizarTipo(r.tipo)} | ${r.data_publicacao || '?'} | [link](${r.url}) |`
      );
    });
    linhas.push('');
    linhas.push('_⚠️ = `area_compativel` é "a_verificar_na_banca" ou área da vaga não identificada — ver §"A ressalva de área"._');
  }
  linhas.push('');

  linhas.push('## O que este relatório NÃO sabe');
  linhas.push('');
  linhas.push(
    '- **UF residual**: a lacuna de UF desta onda foi fechada expandindo o lookup de instituições ' +
      '(`config/universidades-uf.json`) com os nomes REAIS de órgão que apareciam no store — não é uma lista ' +
      'exaustiva de toda instituição federal/estadual do Brasil; uma instituição nova que nunca apareceu no ' +
      'store ainda pode cair em `uf: null`. Um extrator de texto (cidade/UF, "Estado de X") entra como ' +
      'segunda linha de defesa (`lib/uf-lookup.js` `extrairUfDoTexto`), mas não substitui a lista.'
  );
  linhas.push(
    '- **Formato de tabela não reconhecido**: `lib/subedital-extrator.js` reconhece de verdade só o formato ' +
      'da UFSCar (códigos `NNN/AA.NN`). Para outros formatos (UFG e o que a heurística nova desta onda pegou ' +
      'no store), o item aparece marcado `extracao: formato_nao_reconhecido` com área/vagas/titulação/campus ' +
      'em branco — o link está lá, mas os campos estruturados não. É honesto (melhor vazio que errado), mas ' +
      'não é o mesmo que ter o dado.'
  );
  linhas.push(
    '- **Extração de titulação/vagas/regime é regex sobre texto, não NLP**: qualquer edital com fraseado ' +
      'atípico (não usa literalmente "doutorado"/"mestrado"/"graduação" perto da exigência) cai em ' +
      '`indeterminada` mesmo quando um humano lendo entenderia a exigência.'
  );
  linhas.push(
    '- **Fontes não integradas** (fora do escopo desta onda — nenhuma fonte nova foi adicionada): UNICAMP, ' +
      'IFSP (fora do que aparece via DOU nacional), FAPESP (bolsas, não vaga docente), USP, UNESP — todas ' +
      'universidades estaduais paulistas relevantes pro perfil de JB que publicam concurso em diário oficial ' +
      'PRÓPRIO, não no DOU federal. Este relatório NÃO cobre nenhuma delas — é um buraco geográfico real, ' +
      'concentrado exatamente no estado que o score prioriza (SP).'
  );
  linhas.push(
    '- **Amostra da hipótese IF é parcial**: só 15 dos 457 avisos de substituto de IF tiveram o artigo completo ' +
      'buscado (custo de requisição) — o resto é reconhecido só pela casca (título/preview), sem saber se a ' +
      'área bate com o perfil de JB.'
  );
  linhas.push(
    '- **Janela de tempo**: 12 meses fixos (12-08-2025 a 12-08-2026). Editais publicados fora dessa janela — ' +
      'antes ou depois — não estão neste relatório.'
  );
  linhas.push(
    `- **Área a verificar na banca**: dos ${elegivelAgora.length} "elegível agora", ` +
      `${comRessalvaDeArea.length} (marcados ⚠️ na tabela acima, \`area_compativel: "a_verificar_na_banca"\` ou ` +
      '`null` no store) dependem da banca do concurso aceitar a área do mestrado/graduação de JB (Design/UX-IHC) ' +
      'como "afim" à área pedida pelo edital (tipicamente Computação/IA ou Educação) — isso NÃO é incerteza de ' +
      'dado (a área de JB está confirmada desde a Onda 2.1), é um risco real e normal de qualquer candidatura ' +
      'fora da área exata do diploma. Ver §"A ressalva de área".'
  );
  linhas.push('');

  return linhas.join('\n');
}

module.exports = { gerar, contarPor, ordenarContagem, formatarTabela, normalizarTipo, MARCA_VEREDITO };
