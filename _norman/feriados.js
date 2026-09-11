'use strict';
// TABELA DE FERIADOS NACIONAIS PRA DENTRO DA PLANILHA.
//
// Serve a UMA fórmula só: `NETWORKDAYS(carimbo; TODAY(); feriados)`, que conta
// quantos dias ÚTEIS se passaram desde o último sync. Dia útil, e não dia
// corrido, porque `rodar-diario.bat` roda Seg-Sex e PULA feriado nacional
// (a primeira linha do .bat chama `lib/feriados-nacionais.js
// diaSemPublicacaoEsperada`). Contar dia corrido faria a planilha gritar toda
// segunda-feira de manhã — o precedente exato que este projeto já pagou uma
// vez: "um radar que grita todo sábado é um radar que JB silencia".
//
// `NETWORKDAYS` já ignora sábado e domingo sozinho. O que ele NÃO sabe é
// feriado — por isso a tabela. Sem ela, uma única execução perdida ao lado de
// um feriado somaria 3 e acenderia o aviso com o radar funcionando: falso
// alarme da classe que o briefing manda evitar.
//
// FONTE ÚNICA: `lib/feriados-nacionais.js`, consultado pela função PÚBLICA
// `ehFeriadoNacional()`, dia a dia. Não reimplemento a lista nem leio
// `_internal` — se a lei mudar lá (feriado novo, regra de Corpus Christi),
// esta tabela acompanha sem ninguém lembrar. É o mesmo módulo que o .bat usa
// pra decidir se roda: a planilha e o agendador passam a concordar sobre o que
// é "dia sem execução esperada", por construção.
//
// A TABELA ENVELHECE — e envelhece MUDA, que é o modo de falha perigoso.
// Ela é escrita uma vez por `construir.js` e congela. Quando os anos acabarem,
// `NETWORKDAYS` volta a contar feriado como dia útil e o aviso fica um pouco
// mais nervoso, sem nada na tela dizendo por quê. Por isso existe o controle
// C-FERIADOS em `_norman/verificar.js`, que aborta quando a cobertura não
// alcança o ano corrente + 1.
const F = require(require('path').join(__dirname, '..', 'lib', 'feriados-nacionais'));

// Janela de anos gerada. -1 pra trás porque o carimbo pode ser de dezembro do
// ano anterior; +5 pra frente pra dar folga real ao controle de expiração.
const ANOS_ATRAS = 1;
const ANOS_ADIANTE = 5;

function iso(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Pura: ano-base -> `[['AAAA-MM-DD'], ...]` de todos os feriados nacionais da
 * janela, em ordem. Formato ISO 8601 pelo mesmo motivo do carimbo — é o único
 * que o Sheets lê sem ambiguidade de locale, e `NETWORKDAYS` aceita a faixa de
 * texto desde que cada célula seja parseável como data.
 */
function tabela(anoBase = new Date().getFullYear()) {
  const linhas = [];
  for (let ano = anoBase - ANOS_ATRAS; ano <= anoBase + ANOS_ADIANTE; ano++) {
    for (let mes = 0; mes < 12; mes++) {
      const ultimo = new Date(ano, mes + 1, 0).getDate();
      for (let dia = 1; dia <= ultimo; dia++) {
        const d = new Date(ano, mes, dia);
        if (F.ehFeriadoNacional(d)) linhas.push([iso(d)]);
      }
    }
  }
  return linhas;
}

/**
 * Anos efetivamente cobertos por uma tabela já escrita (lida DE VOLTA da
 * planilha). Aceita os três jeitos que a mesma célula pode voltar, e isso não
 * é paranoia: `_norman/api.js escrever()` usa `valueInputOption=USER_ENTERED`,
 * então o ISO que sai daqui vira DATA de verdade na célula, e a leitura padrão
 * (`FORMATTED_VALUE`, locale pt_BR) devolve `01/01/2026`. Um controle que só
 * reconhecesse o formato de ida diria "tabela vazia" com a tabela cheia —
 * falso alarme no instrumento, que é o pior lugar pra ter um.
 *   - ISO de ida:            2026-01-01
 *   - formatado pt_BR:       01/01/2026
 *   - serial (UNFORMATTED):  46023
 */
function anosCobertos(linhas) {
  const anos = new Set();
  (linhas || []).forEach(l => {
    const v = String((Array.isArray(l) ? l[0] : l) ?? '').trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) anos.add(Number(v.slice(0, 4)));
    else if (/^\d{2}\/\d{2}\/\d{4}$/.test(v)) anos.add(Number(v.slice(6)));
    else if (/^\d+$/.test(v)) {
      // serial do Sheets: dias desde 1899-12-30
      anos.add(new Date(Date.UTC(1899, 11, 30) + Number(v) * 86400000).getUTCFullYear());
    }
  });
  return [...anos].sort((a, b) => a - b);
}

/**
 * Dias ÚTEIS entre duas datas, inclusive nas pontas, excluindo fim de semana e
 * feriado nacional — a mesma conta que `NETWORKDAYS(a;b;feriados)` faz dentro
 * da planilha, feita aqui em Node.
 *
 * Existe pra que a PROVA não seja circular: o valor esperado é derivado por um
 * caminho independente (`lib/feriados-nacionais.js` direto) e comparado com o
 * que a planilha devolve. Duas implementações da mesma regra, uma conferindo a
 * outra — se divergirem, alguém está errado e o controle acusa.
 */
function diasUteisEntre(inicioISO, fimISO) {
  const [a, b] = [inicioISO, fimISO].map(s => {
    const [y, m, d] = String(s).split('-').map(Number);
    return new Date(y, m - 1, d);
  });
  if (a > b) return 0;
  let n = 0;
  for (const d = new Date(a); d <= b; d.setDate(d.getDate() + 1)) {
    if (!F.diaSemPublicacaoEsperada(d)) n++;
  }
  return n;
}

module.exports = { tabela, anosCobertos, diasUteisEntre, ANOS_ATRAS, ANOS_ADIANTE };
