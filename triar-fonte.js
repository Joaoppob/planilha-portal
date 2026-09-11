#!/usr/bin/env node
'use strict';

/**
 * TRIAGEM DE FONTE — o instrumento que substitui `mcp__donsetch__web_fetch`
 * enquanto ele estiver degradado (ver `.claude/plans/radar-crm-20-ondas.md`
 * §C8: nesta sessão o donsetch devolve só o envelope de metadados — status,
 * `total_chars`, `blocks_total`, `title` — e o corpo do feed nunca chega,
 * reproduzido em duas URLs de controle).
 *
 * A CURA É O PARSER DA PRÓPRIA CASA: este script roda `lib-noticias/rss.js`
 * (o parser que `fontes-noticias/_fabrica.js` usa em produção) e a guarda
 * `lib-noticias/frescor.js` (a mesma que decide se uma fonte entra no lote)
 * contra uma URL candidata. Responde exatamente o que a coleta real veria —
 * é o oposto de um instrumento paralelo que pode mentir numa direção que
 * ninguém confere.
 *
 * NÃO é a fábrica. Deliberadamente mais burro que uma fonte real: não
 * atribui aba/tabela/veículo, não aplica filtro de tabela, não escreve no
 * store nem na planilha — só lê a rede e imprime. `--json` para uso por
 * outro script; texto legível é o padrão.
 *
 * USO
 *   node triar-fonte.js <url> [url2 ...] [--max-idade N] [--charset CS] [--json]
 *
 *   --max-idade N   limiar testado pela guarda de frescor, em dias
 *                    (default: lib-noticias/frescor.js MAX_IDADE_DIAS_PADRAO)
 *   --charset CS    decodifica o corpo com TextDecoder(CS) em vez de UTF-8
 *                    (feed ISO-8859-1, como o padrão já usado pela Folha em
 *                    fontes-noticias/geral.js) — aplica-se a TODAS as URLs
 *                    desta chamada; para candidatas com charset misto, rodar
 *                    o script em duas chamadas separadas
 *   --json          imprime um array JSON em vez do relatório de texto
 *
 * SAÍDA, por URL: HTTP (ok/erro), formato detectado (rss/atom), nº de itens
 * parseados, quais campos vieram (fração de itens com cada campo — não
 * binário, porque metade dos itens pode ter um campo e a outra metade não),
 * data do item mais recente + idade em dias, veredito de frescor com o
 * motivo literal (fresco/feed_velho/sem_data/feed_vazio), e o `maxIdadeDias`
 * que a fonte precisaria declarar para ser aprovada — arredondado para cima,
 * porque a guarda usa `idadeDias <= maxIdadeDias` e um teto fracionado igual
 * à idade medida reprovaria por causa de milissegundos até o próximo
 * `Date.now()`.
 *
 * Código de saída: 1 se QUALQUER URL falhou no HTTP ou foi rejeitada pela
 * guarda de frescor no limiar testado; 0 se todas passaram. Útil para
 * encadear em outro script, mas o script em si nunca escreve nada em disco.
 */

const http = require('./lib/http');
const rss = require('./lib-noticias/rss');
const frescor = require('./lib-noticias/frescor');

function parseArgs(argv) {
  const urls = [];
  const opts = { maxIdade: frescor.MAX_IDADE_DIAS_PADRAO, charset: null, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') {
      opts.json = true;
    } else if (a === '--max-idade') {
      opts.maxIdade = Number(argv[++i]);
    } else if (a === '--charset') {
      opts.charset = argv[++i];
    } else if (a.startsWith('--')) {
      // flag desconhecida: ignora, não trava a triagem por causa de um typo
      // de invocação — o pior caso é rodar com o default.
    } else {
      urls.push(a);
    }
  }
  return { urls, opts };
}

/**
 * Fração de itens (0-1) que trazem cada campo — não presente/ausente
 * binário: um feed pode ter metade dos itens sem `<author>` e a outra
 * metade com (achado real medido em feeds mistos por `lib-noticias/rss.js`).
 */
function camposPresentes(itens) {
  const campos = ['titulo', 'link', 'dataBruta', 'resumo', 'autor', 'categorias'];
  const total = itens.length;
  const out = {};
  for (const c of campos) {
    const presentes = itens.filter(i => {
      const v = i[c];
      return Array.isArray(v) ? v.length > 0 : v != null && v !== '';
    }).length;
    out[c] = { presentes, total, fracao: total ? Number((presentes / total).toFixed(2)) : 0 };
  }
  return out;
}

async function triarUrl(url, opts) {
  const registro = { url, maxIdadeDiasTestado: opts.maxIdade };

  let xml;
  try {
    xml = opts.charset ? await http.getComCharset(url, { charset: opts.charset }) : await http.get(url);
  } catch (err) {
    registro.http = { ok: false, erro: err.message };
    return registro;
  }
  registro.http = { ok: true };

  const parsed = rss.parseFeed(xml);
  registro.formato = parsed.formato;
  registro.volumeBruto = parsed.volumeBruto;
  registro.itensParseados = parsed.itens.length;
  registro.removidosIntraFeed = parsed.removidosIntraFeed;
  registro.descartadosSemCampo = parsed.descartadosSemCampo;
  registro.campos = camposPresentes(parsed.itens);

  const veredito = frescor.avaliarFrescor(parsed.itens, { maxIdadeDias: opts.maxIdade, agora: Date.now() });
  registro.frescor = veredito;
  registro.maxIdadeDiasNecessario = veredito.idadeDias != null ? Math.ceil(veredito.idadeDias) : null;

  return registro;
}

function formatarTexto(r) {
  const linhas = [];
  linhas.push('URL:                 ' + r.url);
  if (!r.http.ok) {
    linhas.push('HTTP:                FALHOU — ' + r.http.erro);
    return linhas.join('\n');
  }
  linhas.push('HTTP:                200 OK');
  linhas.push('Formato:             ' + r.formato);
  linhas.push(
    'Itens:               ' +
      r.itensParseados +
      ' parseados de ' +
      r.volumeBruto +
      ' brutos (removidos intra-feed: ' +
      r.removidosIntraFeed +
      ', sem titulo/link: ' +
      r.descartadosSemCampo +
      ')'
  );
  linhas.push('Campos presentes:');
  for (const [campo, info] of Object.entries(r.campos)) {
    linhas.push('  ' + campo.padEnd(12) + info.presentes + '/' + info.total + ' (' + Math.round(info.fracao * 100) + '%)');
  }
  const v = r.frescor;
  linhas.push(
    'Item mais recente:   ' + (v.maisRecenteISO || '—') + (v.idadeDias != null ? '  (idade ' + v.idadeDias + ' d)' : '')
  );
  linhas.push(
    'Veredito de frescor (limiar testado ' +
      r.maxIdadeDiasTestado +
      'd): ' +
      (v.aprovado ? 'APROVADO' : 'REJEITADO') +
      ' — motivo=' +
      v.motivo
  );
  linhas.push(
    'maxIdadeDias necessario p/ aprovar: ' + (r.maxIdadeDiasNecessario == null ? '— (' + v.motivo + ')' : r.maxIdadeDiasNecessario + ' d')
  );
  return linhas.join('\n');
}

async function main() {
  const { urls, opts } = parseArgs(process.argv.slice(2));
  if (!urls.length) {
    console.error('Uso: node triar-fonte.js <url> [url2 ...] [--max-idade N] [--charset CS] [--json]');
    process.exit(1);
  }

  const resultados = [];
  for (const url of urls) {
    const r = await triarUrl(url, opts);
    resultados.push(r);
    if (!opts.json) {
      console.log('\n' + '='.repeat(72));
      console.log(formatarTexto(r));
    }
  }

  if (opts.json) {
    console.log(JSON.stringify(resultados, null, 2));
  } else {
    console.log('\n' + '='.repeat(72));
  }

  const falhas = resultados.filter(r => !r.http.ok || (r.frescor && !r.frescor.aprovado));
  process.exitCode = falhas.length ? 1 : 0;
}

if (require.main === module) {
  main();
}

module.exports = { triarUrl, camposPresentes, parseArgs, formatarTexto };
