'use strict';

/**
 * Gera o markdown de RELATORIO-BACKFILL.md (item 1 + bloco da hipótese do
 * item 2, briefing Onda 1.5). Função pura — recebe os dados já carregados
 * (store + saúde + amostra IF), devolve string. Todo número vem de um dos
 * três; nada é estimado aqui.
 */

const TOTAL_IFS_CONHECIDOS = 38; // 38 Institutos Federais, ver fontes-reconhecimento.md

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

function vereditoHipotese(institutosDistintos) {
  if (institutosDistintos >= 30) return 'CONFIRMADA';
  if (institutosDistintos >= 10) return 'PARCIAL';
  return 'REFUTADA';
}

function criterioVeredito(veredito) {
  if (veredito === 'CONFIRMADA') {
    return '_Critério: 30+ dos 38 IFs apareceram no DOU no período — a Onda 2 não precisa de coletor dedicado por instituto para saber QUE um processo seletivo abriu; o DOU serve como gatilho nacional único (mesmo que a titulação completa às vezes só esteja no site do IF).';
  }
  if (veredito === 'PARCIAL') {
    return '_Critério: entre 10 e 29 dos 38 IFs apareceram — o DOU cobre parte relevante mas não a totalidade; avaliar se os IFs ausentes concentram algum padrão (região, porte, período) antes de decidir se a Onda 2 precisa de coletores complementares só para os que faltam._';
  }
  return '_Critério: menos de 10 dos 38 IFs apareceram — o DOU não é gatilho suficiente sozinho; a Onda 2 provavelmente precisa dos coletores dedicados por IF listados em `fontes-reconhecimento.md`._';
}

function linhaTitulacaoIF(amostrados, comTitulacao) {
  if (!amostrados.length) {
    return '_Amostra vazia — nenhum aviso IF-substituto foi enriquecido neste backfill (ou nenhum foi encontrado no período). Sem base para responder se o DOU traz titulação._';
  }
  const razao = comTitulacao.length / amostrados.length;
  if (razao >= 0.6) {
    return `_Na amostra, o próprio artigo do DOU trouxe a titulação exigida em ${comTitulacao.length}/${amostrados.length} casos (${Math.round(razao * 100)}%) — o aviso GERALMENTE já é autossuficiente, não precisa abrir o site do instituto para saber a titulação._`;
  }
  if (razao > 0) {
    return `_Na amostra, o artigo do DOU trouxe a titulação exigida em só ${comTitulacao.length}/${amostrados.length} casos (${Math.round(razao * 100)}%) — cobertura PARCIAL: parte dos avisos precisa do site do instituto (ou do PDF anexo) para saber a titulação._`;
  }
  return `_Na amostra, NENHUM dos ${amostrados.length} avisos teve titulação extraída do texto do DOU — o aviso do DOU tende a só remeter ao edital/site do instituto para esse dado._`;
}

/**
 * @param {object} p
 * @param {string} p.de DD-MM-AAAA
 * @param {string} p.ate DD-MM-AAAA
 * @param {Array} p.registros itens do store (fonte dou, dentro do período)
 * @param {Array} p.saudeRegistros itens do log de saúde (fonte dou, dentro do período)
 * @param {Array} p.amostraIF itens de data/backfill-if-amostra.jsonl
 * @param {number} p.throttleMs throttle usado entre requisições de listagem
 * @param {number} p.tentativasBackoff tentativas de retry por dia
 */
function gerar({ de, ate, registros, saudeRegistros, amostraIF, throttleMs, tentativasBackoff }) {
  const totalVarridas = saudeRegistros.reduce((acc, r) => acc + (typeof r.volumeBruto === 'number' ? r.volumeBruto : 0), 0);
  const diasComErro = saudeRegistros.filter(r => r.erro);
  const diasVolumeZero = saudeRegistros.filter(r => r.volumeBruto === 0);
  const totalPassouFiltro = registros.length;

  const porTipo = contarPor(registros, r => r.tipo || 'não identificado');
  const porUf = contarPor(registros, r => r.uf || 'não identificado');
  const porOrgao = contarPor(registros, r => r.orgao || 'não identificado');
  const porTitulacao = contarPor(registros, r => r.titulacao_exigida || 'não identificada');
  const porMes = contarPor(registros, r => (r.data_publicacao || '').slice(0, 7) || 'não identificado');

  const top20 = registros
    .filter(r => typeof r.score === 'number')
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);

  const institutosDistintos = new Set(amostraIF.map(r => r.instituto).filter(Boolean));
  const amostrados = amostraIF.filter(r => r.amostrado);
  const comTitulacao = amostrados.filter(r => r.titulacao_exigida);
  const veredito = vereditoHipotese(institutosDistintos.size);

  const linhas = [];
  linhas.push(`# Relatório de Backfill — DOU Seção 3 (${de} a ${ate})`);
  linhas.push('');
  linhas.push(
    `Gerado em ${new Date().toISOString()}. Todo número abaixo vem do store (\`data/store.jsonl\`), do log de saúde (\`data/saude.jsonl\`) e da amostra da hipótese IF (\`data/backfill-if-amostra.jsonl\`) desta execução — nenhum é estimado.`
  );
  linhas.push('');

  linhas.push('## 1. Volume geral');
  linhas.push('');
  linhas.push(`- Dias no período: **${saudeRegistros.length}**`);
  linhas.push(`- Publicações varridas (soma do volume bruto diário, todos os artTypes, Seção 3): **${totalVarridas}**`);
  linhas.push(
    `- Itens salvos no store — passaram o pré-filtro de artType, o estágio 1 (é vaga docente, \`lib/vaga-docente.js\`) e o estágio 3 (área de JB, sobre o texto ENRIQUECIDO — \`lib/keyword-filtro.js\` / \`lib/subedital-extrator.js\` quando o edital tiver tabela de subeditais): **${totalPassouFiltro}**`
  );
  linhas.push(`- Dias com volume bruto zero: ${diasVolumeZero.length}`);
  linhas.push(
    `- Dias com erro de coleta: ${diasComErro.length}${diasComErro.length ? ' (' + diasComErro.map(r => r.dataAlvo).join(', ') + ')' : ''}`
  );
  linhas.push(`- Throttle usado entre requisições de listagem: ${throttleMs}ms; backoff em erro: até ${tentativasBackoff} tentativas (exponencial, base 5s)`);
  linhas.push('');

  linhas.push('## 2. Quebra por tipo');
  linhas.push('');
  linhas.push(formatarTabela(porTipo, 'tipo', 'quantidade'));
  linhas.push('');

  linhas.push('## 3. Quebra por UF');
  linhas.push('');
  linhas.push(formatarTabela(porUf, 'UF', 'quantidade'));
  linhas.push('');

  linhas.push('## 4. Quebra por órgão');
  linhas.push('');
  linhas.push(formatarTabela(porOrgao, 'órgão', 'quantidade'));
  linhas.push('');

  linhas.push('## 5. Quebra por titulação exigida');
  linhas.push('');
  linhas.push(formatarTabela(porTitulacao, 'titulação', 'quantidade'));
  linhas.push('');

  linhas.push('## 6. Quebra por mês (sazonalidade)');
  linhas.push('');
  linhas.push(formatarTabela(porMes, 'mês', 'quantidade'));
  linhas.push('');

  linhas.push('## 7. Top 20 por score');
  linhas.push('');
  if (top20.length === 0) {
    linhas.push('_Nenhum item com score calculado — rode `node radar.js julgar --ollama off` (ou `julgar`) antes de gerar o relatório._');
  } else {
    linhas.push('| # | Score | Veredito | Órgão | Área | Titulação | UF | Link |');
    linhas.push('|---|---|---|---|---|---|---|---|');
    top20.forEach((r, i) => {
      linhas.push(
        `| ${i + 1} | ${r.score} | ${r.veredito || '?'} | ${r.orgao || '?'} | ${r.area || '?'}/${r.subarea || '?'} | ${r.titulacao_exigida || '?'} | ${r.uf || '?'} | [link](${r.url}) |`
      );
    });
  }
  linhas.push('');

  linhas.push('## 8. Hipótese DOU × Institutos Federais');
  linhas.push('');
  linhas.push(`**Veredito: ${veredito}**`);
  linhas.push('');
  linhas.push(`- Avisos de processo seletivo de professor substituto de IF detectados no DOU no período: **${amostraIF.length}**`);
  linhas.push(`- Institutos Federais distintos identificados: **${institutosDistintos.size}** de ${TOTAL_IFS_CONHECIDOS} conhecidos (ver \`fontes-reconhecimento.md\`)`);
  linhas.push(`- Lista de institutos que apareceram: ${[...institutosDistintos].sort().join('; ') || '(nenhum)'}`);
  linhas.push(`- Amostra enriquecida (texto completo buscado) para checar se o aviso já traz titulação: **${amostrados.length}** de ${amostraIF.length} avisos`);
  linhas.push(`- ${linhaTitulacaoIF(amostrados, comTitulacao)}`);
  linhas.push('');
  linhas.push(criterioVeredito(veredito));
  linhas.push('');

  return linhas.join('\n');
}

module.exports = { gerar, contarPor, ordenarContagem, formatarTabela, vereditoHipotese, TOTAL_IFS_CONHECIDOS };
