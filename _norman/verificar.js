'use strict';
const path = require('path');
const a = require('./api');
const A = require('./abas');
const N = require('./notas');
const F = require('./formulas');
// V2 (Leva 6) — só pra ler `GEO` (largura de coluna) e conferir a MESMA
// decisão de rótulo-cheio-vs-emoji que `construir.js` usa pra escrever
// (`F.rotuloNavParaSlot`). Módulo puro (`require.main === module` guarda a
// escrita real) — nenhuma chamada de rede nova aqui.
const FMT = require('./formatar');
const FERIADOS = require('./feriados');
const SHEETS = require(path.join(__dirname, '..', 'lib', 'sheets'));
// A camada notícia (N2, mais abaixo) é conferida contra `faixa`/`posicao`
// LIDOS DA PRÓPRIA PLANILHA (a fonte agora, decisão C2) — não recomputados
// aqui. `STORE_NOTICIA` entra só pra um sinal de staleness (comparar o total
// do store local com o total na aba de fato).
const STORE_NOTICIA = require(path.join(__dirname, '..', 'lib-noticias', 'store-noticias'));
const R = A.ref;
// Data local em ISO — o mesmo fuso em que `lib/sheets.js` grava o carimbo e em
// que a planilha responde `TODAY()` (America/Sao_Paulo nos dois).
const isoLocal = d => [
  d.getFullYear(),
  String(d.getMonth() + 1).padStart(2, '0'),
  String(d.getDate()).padStart(2, '0')
].join('-');
const ERROS = ['#REF!', '#NAME?', '#VALUE!', '#N/A', '#DIV/0!', '#ERROR!', '#NUM!', '#NULL!'];

async function varrer(intervalos) {
  const achados = [];
  for (const rng of intervalos) {
    const r = await a.ler(rng);
    (r.values || []).forEach((linha, i) => linha.forEach((c, j) => {
      const s = String(c);
      if (ERROS.some(e => s.includes(e))) achados.push(`${rng} linha~${i + 1} col~${j + 1}: ${s.slice(0, 90)}`);
    }));
  }
  return achados;
}
module.exports = { varrer, ERROS };

// E6 (Leva 4, remodelação 2026-09-01) — CERCA-SECA: `--help`/`-h` real e
// RECUSA de flag desconhecida ANTES de qualquer efeito (aqui, antes de
// qualquer LEITURA — `verificar.js` não escreve, mas ainda assim gasta
// cota de API a cada chamada; um `--help` sem cerca gastaria cota à toa,
// mesma classe de incidente que motivou a Leva 3). `verificar.js` não
// aceita NENHUMA flag hoje.
const USO_VERIFICAR = 'Uso: node _norman/verificar.js  (nenhuma flag além de --help/-h)';
if (require.main === module) {
  const argvNormalizado = process.argv.slice(2).map(a => (a === '-h' ? '--help' : a));
  if (argvNormalizado.includes('--help')) {
    console.log(USO_VERIFICAR);
    process.exit(0);
  }
  const flagsDesconhecidas = argvNormalizado.filter(a => a.startsWith('--'));
  if (flagsDesconhecidas.length) {
    console.error(`[verificar] flag(s) desconhecida(s): ${flagsDesconhecidas.join(', ')}`);
    console.error(USO_VERIFICAR);
    process.exit(2);
  }
  (async () => {
    // A varredura precisa cobrir TODA a largura de `_calc` (o bloco mercado vai
    // até AK) e TODA a altura do dado. Faixa curta demais é o jeito clássico de
    // um instrumento dizer "zero erro" sobre a parte que ele não olhou.
    //
    // `Hoje` em particular: a altura do painel é DERIVADA dos tetos dos blocos
    // (cada bloco ocupa, no máximo, título + teto + rodapé + respiro), não um
    // número solto. Varrer até uma linha fixa aqui seria reintroduzir, na
    // verificação, exatamente o defeito que o conserto eliminou na escrita: um
    // teto subindo sem que a varredura acompanhe voltaria a "dizer zero erro"
    // sobre linhas que existem mas que o instrumento não está olhando.
    // E a varredura do `Hoje` cobre A:I, não só A:D: C10 Parte 3 deitou os
    // seis blocos em DOIS grupos de coluna lado a lado (A:D e F:I) — um
    // sub-bloco que devolva largura errada envenena a coluna D OU a coluna I
    // com `#N/A`, e os dois têm que ser varridos.
    const HOJE_ULTIMA_LINHA = F.hojeUltimaLinha();
    const HOJE_ULTIMA_COL = F.colunaLetra(F.HOJE_COLUNAS_ABA.length - 1);
    // Onda 4 — as letras finais de Concursos/Concursos·tudo/Empregos eram
    // literais (`K`/`J`) e ficaram cegas assim que "Inscrito" entrou depois
    // de "link (copiar)": a coluna nova (agora a ÚLTIMA de cada aba) não
    // seria varrida, e um `#REF!` bem ali passaria em auditoria. Derivado do
    // cabeçalho vivo — mesmo padrão que a varredura de notícia já usa
    // (`ultimaCol` na linha 71) — pra nunca mais regredir quando o
    // cabeçalho crescer de novo.
    const ultimaColDocente = String.fromCharCode(64 + F.DOCENTE_CABECALHO.length);
    const ultimaColMercado = String.fromCharCode(64 + F.MERCADO_CABECALHO.length);
    const alvos = [
      `${R(A.CALC)}!A1:AK600`,
      `${R(A.PAINEL)}!A1:${ultimaColDocente}60`, `${R(A.TUDO)}!A1:${ultimaColDocente}600`, `${R(A.EMPREGOS)}!A1:${ultimaColMercado}600`,
      // Camada CRM. As abas digitadas cobrem cabeçalho + até onde a validação
      // de dados alcança (ver formatar.js) — não adianta varrer só as linhas
      // que a fórmula lê: um erro digitado por JB numa linha 30 de `Projetos`
      // também precisa aparecer aqui.
      // E7 (Leva 4) — `Fila!A1:K1000` era LITERAL (K, 11 colunas) e a Onda
      // 17 acrescentou `parada há` (L, 12ª coluna): a varredura ficava CEGA
      // pra ela — um `#REF!`/`#N/A` bem ali "passaria" em auditoria, igual
      // ao D1/N-17 que motivou o mesmo conserto em Concursos/Empregos
      // acima. Derivado do cabeçalho vivo, nunca mais literal.
      `${R(A.HOJE)}!A1:${HOJE_ULTIMA_COL}${HOJE_ULTIMA_LINHA}`,
      `${R(A.FILA)}!A1:${String.fromCharCode(64 + F.FILA_CABECALHO.length)}1000`,
      // Onda 18 — `Projetos!A1:K50` ficou CEGO pras 3 colunas que a Onda 14
      // acrescentou (`etapa atual`/`progresso`/`saúde`, L:N): a largura era
      // literal, o cabeçalho cresceu, e "zero erro" passou a significar
      // "zero erro nas colunas A-K", nunca dito em lugar nenhum. Derivado do
      // cabeçalho vivo, mesmo padrão de `Candidaturas`/`Concursos` logo
      // abaixo — nunca mais rege atrás de uma coluna nova.
      `${R(A.PROJETOS)}!A1:${String.fromCharCode(64 + F.PROJETOS_CABECALHO.length)}50`,
      // E8 (Leva 5, pré-requisito) — `Tarefas!A1:G1000` e `Diário!A1:E2000`
      // eram LETRA FIXA (G=7 colunas, E=5 colunas): `Tarefas` já tinha 10
      // colunas (Onda 15) e `Diário` já tinha 7 (Onda 16) ANTES desta Leva —
      // a varredura já estava cega pras 3 últimas colunas de cada uma, e a
      // Leva 5 ainda acrescenta mais. Mesmo padrão E7 (Concursos/Empregos/
      // Fila, acima): derivado do cabeçalho vivo, nunca mais literal.
      `${R(A.TAREFAS)}!A1:${String.fromCharCode(64 + F.TAREFAS_CABECALHO.length)}1000`,
      `${R(A.DIARIO)}!A1:${String.fromCharCode(64 + F.DIARIO_CABECALHO.length)}2000`,
      // Onda 5 — `Candidaturas`: A:I (9 colunas, `letraDe` deriva do
      // cabeçalho vivo, nunca literal), até a altura da grade (1000, mesma
      // folga que `Fila`/`Tarefas`).
      `${R(A.CANDIDATURAS)}!A1:${String.fromCharCode(64 + F.CANDIDATURAS_CABECALHO.length)}1000`,
      // Onda 18 — `Etapas` (Onda 14) nunca tinha entrado na varredura de
      // erro: zero linha dela era olhada, nem cabeçalho nem dado. Mesmo
      // padrão de `Candidaturas` acima — largura derivada, altura 1000.
      `${R(A.ETAPAS)}!A1:${String.fromCharCode(64 + F.ETAPAS_CABECALHO.length)}1000`,
      // Camada notícia. A altura é DERIVADA (teto + título + rodapé), como a
      // do `Hoje` — varrer até uma linha fixa aqui seria dizer "zero erro"
      // sobre linhas que existem e que o instrumento não olhou. E a largura
      // vai até a ÚLTIMA COLUNA de verdade da aba (C10 Parte 2: 4 tabelas ×
      // 6 colunas + 3 vãos = 27, além de Z — `F.colunaLetra` é o helper
      // multi-letra; `String.fromCharCode(64+i)` estourava em silêncio
      // acima de 26, devolvendo pontuação em vez de letra).
      ...A.VISTAS_NOTICIA.map(x => {
        // C10 Parte 2: altura MÁXIMA por tabela (teto+2), a MESMA pras
        // quatro (lado a lado, não mais empilhadas) — `F.noticiaUltimaLinha`
        // é a mesma conta que `formulas.js`/`formatar.js` usam pra ancorar
        // o funil/CF de cada tabela.
        const ultima = F.noticiaUltimaLinha(x);
        const ultimaCol = F.colunaLetra(F.NOTICIA_CABECALHO.length - 1);
        return `${R(x)}!A1:${ultimaCol}${ultima}`;
      })
    ];
    const achados = await varrer(alvos);
    console.log('=== VARREDURA DE ERRO ===');
    console.log(achados.length ? achados.slice(0, 25).join('\n') : 'ZERO células com erro em ' + alvos.join(', '));

    const linhaLegivel = (l, i) => String(i + 1).padStart(2) + ' | ' + l.map(c => String(c).replace(/\n/g, ' ⏎ ')).join(' ‖ ').slice(0, 210);

    const hj = await a.ler(`${R(A.HOJE)}!A1:${HOJE_ULTIMA_COL}${HOJE_ULTIMA_LINHA}`);
    console.log(`\n=== ${A.HOJE} (como JB vê) ===`);
    (hj.values || []).forEach((l, i) => { if (l.some(x => String(x).trim() !== '')) console.log(linhaLegivel(l, i)); });

    const p = await a.ler(`${R(A.PAINEL)}!A1:${ultimaColDocente}30`);
    console.log(`\n=== ${A.PAINEL} (como JB vê) ===`);
    (p.values || []).forEach((l, i) => console.log(linhaLegivel(l, i)));

    const e = await a.ler(`${R(A.EMPREGOS)}!A1:${ultimaColMercado}20`);
    console.log(`\n=== ${A.EMPREGOS} (como JB vê) ===`);
    (e.values || []).forEach((l, i) => console.log(linhaLegivel(l, i)));

    const t = await a.ler(`${R(A.TUDO)}!A1:${ultimaColDocente}8`);
    console.log(`\n=== ${A.TUDO} (8 primeiras — aba OCULTA, gerada inteira) ===`);
    (t.values || []).forEach((l, i) => console.log(linhaLegivel(l, i)));

    const colVaga = F.letraDe(F.DOCENTE_CABECALHO, 'Vaga');
    // E7 (Leva 4) — `ce` lia `Empregos!B` LITERAL. Antes da Onda 13, B era
    // `Vaga`; a Onda 13 pôs `Inscrito` (checkbox) em B e empurrou `Vaga`
    // pra C — a letra literal ficou contando checkboxes marcados/vazios em
    // vez de linhas de vaga, e o diagnóstico passou a imprimir ~4996 (a
    // altura da grade) onde há ~650 (o dado real): toda linha "vazia" de B
    // ainda tinha `FALSE` do checkbox, então NENHUMA linha lia como vazia.
    // Corrigido pra resolver a coluna pelo RÓTULO vivo do cabeçalho, nunca
    // por letra fixa — mesma lei que `colVaga` (Painel/Tudo) já seguia
    // duas linhas acima.
    const colVagaM = F.letraDe(F.MERCADO_CABECALHO, 'Vaga');
    const c = await a.ler(`${R(A.PAINEL)}!${colVaga}${F.LINHAS[A.PAINEL].lista}:${colVaga}2000`);
    const ct = await a.ler(`${R(A.TUDO)}!${colVaga}${F.LINHAS[A.TUDO].lista}:${colVaga}5000`);
    const ce = await a.ler(`${R(A.EMPREGOS)}!${colVagaM}${F.LINHAS[A.EMPREGOS].lista}:${colVagaM}5000`);
    console.log(`\nlinhas em ${A.PAINEL}:`, (c.values || []).length,
      `| linhas em ${A.TUDO}:`, (ct.values || []).length,
      `| linhas em ${A.EMPREGOS}:`, (ce.values || []).length);

    // CONTROLE DE VAZAMENTO — o defeito que motivou esta onda foi justamente
    // uma trilha aparecendo na superfície da outra. Conferir a contagem não
    // basta (o número pode bater com as linhas trocadas): a prova é procurar
    // vocabulário DOCENTE nas linhas da aba de mercado e vice-versa.
    //
    // E7 (Leva 4) — os dois fins de faixa abaixo (`G` pra Empregos, `H` pra
    // Painel) eram LETRA FIXA, escritos quando `Inscrito` (Onda 1/13) ainda
    // não tinha empurrado o resto do cabeçalho uma coluna à direita: `G`
    // parava ANTES de `Nível` (a última coluna visível de mercado) e `H`
    // parava ANTES de `Subárea`/`Subedital` (as duas últimas visíveis de
    // docente) — a varredura de vazamento ficava CEGA pras colunas mais
    // novas, exatamente as que a Onda 14 acrescentou. `ultimaColVisivel`
    // deriva o fim certo: a última coluna ANTES da primeira oculta
    // (prefixo `_`, `F.PREFIXO_COLUNA_OCULTA`) ou de `link (copiar)` (URL
    // crua — teria falso positivo se entrasse na varredura de vocabulário).
    const ultimaColVisivel = cabecalho => {
      const corte = cabecalho.findIndex(c2 => String(c2).startsWith(F.PREFIXO_COLUNA_OCULTA) || c2 === 'link (copiar)');
      return String.fromCharCode(64 + (corte === -1 ? cabecalho.length : corte));
    };
    const DOCENTES_NA_EMPREGOS = ['doutorado', 'titula', 'edital', 'subedital', 'pode prestar'];
    const MERCADO_NA_DOCENTE = ['📄 vaga', '🏠 remoto', '🏢 híbrido', '🏢 presencial', 'sênior'];
    const vazou = [];
    const lE0 = F.LINHAS[A.EMPREGOS].lista, lP0 = F.LINHAS[A.PAINEL].lista;
    // Só até a última coluna VISÍVEL (derivada — nunca mais `G`/`H`
    // literais): a coluna `link (copiar)` carrega a URL crua, e uma url de
    // vaga contendo a palavra "edital" acusaria vazamento que não existe.
    // Instrumento que confunde o endereço com o conteúdo mente.
    const ultimaColEmpregosVis = ultimaColVisivel(F.MERCADO_CABECALHO);
    const ultimaColPainelVis = ultimaColVisivel(F.DOCENTE_CABECALHO);
    ((await a.ler(`${R(A.EMPREGOS)}!A${lE0}:${ultimaColEmpregosVis}600`)).values || []).forEach((l, i) => {
      const txt = l.join(' ').toLowerCase();
      DOCENTES_NA_EMPREGOS.forEach(t => {
        if (txt.includes(t)) vazou.push(`${A.EMPREGOS} linha ${i + lE0}: termo docente "${t}" em ${l.join(' | ').slice(0, 120)}`);
      });
    });
    ((await a.ler(`${R(A.PAINEL)}!${colVaga}${lP0}:${ultimaColPainelVis}2000`)).values || []).forEach((l, i) => {
      const txt = l.join(' ').toLowerCase();
      MERCADO_NA_DOCENTE.forEach(t => {
        if (txt.includes(t)) vazou.push(`${A.PAINEL} linha ${i + lP0}: termo de mercado "${t}" em ${l.join(' | ').slice(0, 120)}`);
      });
    });
    console.log('\n=== VAZAMENTO ENTRE TRILHAS ===');
    console.log(vazou.length ? vazou.slice(0, 15).join('\n') : 'ZERO — nenhuma linha de mercado com vocabulário docente, nem o contrário');

    // ================= CONTROLES DA CAMADA DIDÁTICA =================
    // Nome de aba, nota e proteção são explicação que não aparece em nenhuma
    // varredura de VALOR: se sumirem, não abrem buraco na tela. Um construir.js
    // rodado pela metade, um formatar.js que estourou cota, uma aba renomeada à
    // mão — qualquer um apaga a camada inteira e a planilha continua parecendo
    // certa. Por isso os quatro controles ficam AQUI e derrubam o processo, em
    // vez de virar linha de relatório que ninguém lê.
    const meta = await a.api('?includeGridData=false&fields=sheets(properties(sheetId,title,hidden,gridProperties))');
    const titulos = meta.sheets.map(x => x.properties.title);
    const gidPorAba = {};
    const gradeDe = {};
    meta.sheets.forEach(x => {
      gidPorAba[x.properties.title] = x.properties.sheetId;
      gradeDe[x.properties.title] = x.properties.gridProperties || {};
    });
    const ocultas = new Set(meta.sheets.filter(x => x.properties.hidden).map(x => x.properties.title));
    const falhas = [];

    // C1 — nenhuma aba com nome LEGADO sobrou. Duas abas com o mesmo papel é o
    // modo de falha silencioso desta migração: as fórmulas leem uma, o sync
    // escreve na outra, e a planilha congela sem emitir erro.
    const legadas = Object.values(A.LEGADAS).flat().filter(t => titulos.includes(t));
    if (legadas.length) falhas.push('aba com nome LEGADO ainda na planilha: ' + legadas.join(', '));

    // C2 — as doze abas canônicas existem (5 do radar + 6 da camada CRM,
    // `Etapas` inclusa desde a Onda 14 + `_estado`, Onda 3 — a fonte da
    // verdade do check "Inscrito").
    const faltando = [A.PAINEL, A.TUDO, A.EMPREGOS, A.DADOS, A.CALC, A.ESTADO, A.HOJE, A.FILA, A.PROJETOS, A.TAREFAS, A.DIARIO, A.ETAPAS]
      .filter(t => !titulos.includes(t));
    if (faltando.length) falhas.push('aba canônica ausente: ' + faltando.join(', '));

    console.log('\n=== CAMADA DIDÁTICA ===');
    if (!falhas.length) {
      // C3 — cada nota declarada está na célula declarada COM O TEXTO CERTO.
      // Conferir só a existência deixaria passar nota truncada ou colada uma
      // coluna ao lado, que é o defeito provável quando um índice muda.
      const grade = await a.api('?includeGridData=true&fields=sheets(properties(title),data(rowData(values(note))))');
      const notaDe = {};
      grade.sheets.forEach(sh => {
        const linhas = ((sh.data || [])[0] || {}).rowData || [];
        linhas.forEach((ln, i) => (ln.values || []).forEach((cel, j) => {
          if (cel && cel.note) notaDe[sh.properties.title + '|' + i + '|' + j] = cel.note;
        }));
      });
      let ok = 0;
      const totalNotas = Object.values(N.NOTAS).reduce((n, v) => n + v.length, 0);
      for (const [aba, itens] of Object.entries(N.NOTAS)) {
        for (const [linha, coluna, texto] of itens) {
          const viva = notaDe[aba + '|' + linha + '|' + coluna];
          if (!viva) falhas.push('nota AUSENTE em ' + aba + ' linha ' + (linha + 1) + ' col ' + (coluna + 1));
          else if (viva !== texto) falhas.push('nota DIVERGENTE em ' + aba + ' linha ' + (linha + 1) + ' col ' + (coluna + 1));
          else ok++;
        }
      }
      console.log('notas conferidas contra o texto-fonte: ' + ok + '/' + totalNotas);

      // C3b - NOTA VIVA QUE NINGUEM DECLAROU. Era o buraco por onde o N4
      // passou inteiro: C3 pergunta se a nota DECLARADA esta la, e a resposta
      // continua sendo "sim" quando existe uma SEGUNDA nota, velha, colada na
      // coluna do lado. Foram 14 delas - tres dizendo "CALCULADA, nao digite
      // aqui" em colunas que JB precisa digitar - e todas passaram na
      // auditoria anterior.
      //
      // A varredura cobre a faixa de CROMO de cada aba gerenciada (a mesma
      // que `formatar.js` limpa antes de escrever). Abaixo do cromo e area de
      // JB: nota dele nao e sobra.
      const declaradas = new Set();
      for (const [aba, itens] of Object.entries(N.NOTAS)) {
        for (const [linha, coluna] of itens) declaradas.add(aba + '|' + linha + '|' + coluna);
      }
      const sobras = Object.keys(notaDe)
        .filter(k => {
          const [aba, linha] = k.split('|');
          return N.NOTAS[aba] && Number(linha) < F.ultimoCromo(aba) && !declaradas.has(k);
        })
        .map(k => {
          const [aba, linha, coluna] = k.split('|');
          const cab = (F.CABECALHO_POR_ABA[aba] || [])[Number(coluna)];
          return `${aba}!${String.fromCharCode(65 + Number(coluna))}${Number(linha) + 1}` +
            (cab ? ` (coluna "${cab}")` : '') + ` -> ${JSON.stringify(String(notaDe[k]).split('\n')[0].slice(0, 60))}`;
        });
      console.log('notas VIVAS no cromo que ninguem declarou: ' + sobras.length);
      if (sobras.length) {
        falhas.push(
          `${sobras.length} nota(s) na planilha que _norman/notas.js NAO declara. ` +
          'Nota e propriedade da CELULA e sobrevive a reordenacao de coluna: uma explicacao velha colada na coluna vizinha ' +
          'passa em todo cheque de presenca e MENTE sobre onde se pode escrever. ' +
          'Rode `node _norman/formatar.js` (ele apaga o cromo antes de escrever). ' + sobras.join(' | ')
        );
      }

      // C4 — proteção com AVISO em toda aba declarada. `warningOnly` é
      // requisito duro: proteção bloqueante barraria a service account e o
      // radar morreria de madrugada, em silêncio.
      const prot = await a.api('?includeGridData=false&fields=sheets(properties(title),protectedRanges(description,warningOnly))');
      const protPorAba = {};
      prot.sheets.forEach(sh => { protPorAba[sh.properties.title] = sh.protectedRanges || []; });
      let okP = 0;
      for (const aba of Object.keys(N.PROTECAO)) {
        const faixas = protPorAba[aba] || [];
        if (!faixas.length) falhas.push('aba SEM proteção-aviso: ' + aba);
        else if (!faixas.every(f => f.warningOnly)) falhas.push('proteção BLOQUEANTE em ' + aba + ' — barraria o sync');
        else if (faixas.length > 1) falhas.push(faixas.length + ' proteções empilhadas em ' + aba);
        else okP++;
      }
      console.log('abas com proteção-aviso: ' + okP + '/' + Object.keys(N.PROTECAO).length);
    }
    if (falhas.length) console.log('\nFALHAS DA CAMADA DIDÁTICA:\n' + falhas.join('\n'));

    // ================= NAVEGAÇÃO (invariante N-13) =================
    // Aba excluída e recriada MUDA DE GID. Um link com gid defasado não
    // quebra — ele passa a APONTAR PRA OUTRA COISA, e navega em silêncio pro
    // lugar errado. É a mesma classe de defeito de um veredito derivado que
    // ninguém confere contra a fonte: não vira `#REF!`, não vira nada.
    //
    // O leitor de gid é o instrumento, e instrumento que ninguém testa pode
    // estar quebrado e passar em auditoria de leitura. Por isso ele é provado
    // ANTES de olhar a planilha, com um caso que TEM que passar e um que TEM
    // que reprovar. Sem os dois, "zero órfãos" não significa nada.
    console.log('\n=== NAVEGAÇÃO (gid) ===');
    const navFalhas = [];
    const gidDaFormula = f => { const mm = String(f || '').match(/#gid=(\d+)/); return mm ? Number(mm[1]) : null; };
    const rotuloDaFormula = f => { const mm = String(f || '').match(/;\s*"([^"]*)"\s*\)\s*$/); return mm ? mm[1] : null; };
    const CTRL_OK = `=HYPERLINK("https://docs.google.com/spreadsheets/d/X/edit#gid=4242";"🏠 Hoje")`;
    const CTRL_RUIM = `=HYPERLINK("https://docs.google.com/spreadsheets/d/X/edit#gid=9999";"🏠 Hoje")`;
    if (gidDaFormula(CTRL_OK) !== 4242) navFalhas.push('CONTROLE POSITIVO do leitor de gid FALHOU — o instrumento não lê um link bom; "zero órfãos" abaixo não vale nada');
    if (gidDaFormula(CTRL_RUIM) === 4242) navFalhas.push('CONTROLE NEGATIVO do leitor de gid FALHOU — o instrumento aprova um gid fabricado');
    if (rotuloDaFormula(CTRL_OK) !== '🏠 Hoje') navFalhas.push('CONTROLE POSITIVO do leitor de rótulo FALHOU');
    if (!navFalhas.length) console.log('controles do instrumento: positivo e negativo passaram');

    // Agora a planilha viva. Para cada aba com nav declarada, lê as FÓRMULAS
    // (não os valores — o valor renderizado é só o rótulo, e o rótulo não diz
    // pra onde o link vai) e confere gid e texto contra a fonte.
    // ONDA UX 6 — `Hoje` está em `F.NAV` (12 destinos), então o laço acima já
    // cobre a nav dela; não há mais uma forma especial (`NAV_HOJE`) pra
    // acrescentar à parte.
    const navEsperada = {};
    for (const [aba, destinos] of Object.entries(F.NAV)) {
      navEsperada[aba] = destinos.map((d, j) => ({ ref: F.celulaNav(aba, j, F.LINHAS[aba].nav), destino: d }));
    }

    // Letra(s) de coluna -> índice 0-based. Inverso de `F.colunaLetra`
    // (formulas.js) — precisa existir aqui porque a leitura abaixo lê um
    // RETÂNGULO CONTÍGUO (`primeira:ultima`) e indexa de volta por
    // POSIÇÃO DE COLUNA, não por ORDEM NA LISTA de destinos (ver nota
    // abaixo — Onda UX 6 expôs a diferença entre as duas).
    const colunaIndice = letras => {
      let n = 0;
      for (const ch of letras) n = n * 26 + (ch.toUpperCase().charCodeAt(0) - 64);
      return n - 1;
    };

    let navOk = 0, navTotal = 0;
    for (const [aba, celulas] of Object.entries(navEsperada)) {
      const primeira = celulas[0].ref, ultima = celulas[celulas.length - 1].ref;
      const bloco = (await a.ler(`${R(aba)}!${primeira}:${ultima}`, 'valueRenderOption=FORMULA')).values || [];
      const plano = [];
      bloco.forEach(linha => (linha || []).forEach(c => plano.push(c)));
      // ONDA UX 6 — a nav de `Hoje` pula colunas de VÃO entre grupos
      // (`F.colunasVisiveis(A.HOJE)` não é contígua: A,B,C,D,F,G,H,I,K,...).
      // O RETÂNGULO lido (`primeira:ultima`) É contíguo — inclui os vãos em
      // branco. Indexar `plano` pela ORDEM do destino (`k`) presumia as
      // duas contíguas e ERRAVA em toda aba com vão no meio (só `Hoje`,
      // até agora): a 5ª posição da lista (`k=4`, Candidaturas) caía no
      // vão em branco, não na célula F onde o link de fato mora. A cura é
      // indexar por OFFSET DE COLUNA relativo à primeira célula lida, que
      // é a mesma régua que decidiu ONDE escrever cada link.
      const baseCol = colunaIndice(primeira.match(/^([A-Za-z]+)/)[1]);
      celulas.forEach((esperado) => {
        navTotal++;
        const colEsperada = colunaIndice(esperado.ref.match(/^([A-Za-z]+)/)[1]);
        const formula = plano[colEsperada - baseCol];
        const gid = gidDaFormula(formula);
        const rotulo = rotuloDaFormula(formula);
        if (gid === null) {
          navFalhas.push(`${aba}!${esperado.ref} não é um HYPERLINK com gid: ${String(formula || '(vazia)').slice(0, 80)}`);
        } else if (gid !== gidPorAba[esperado.destino]) {
          const apontaPra = Object.keys(gidPorAba).find(x => gidPorAba[x] === gid);
          navFalhas.push(
            `${aba}!${esperado.ref} devia levar a "${esperado.destino}" (gid ${gidPorAba[esperado.destino]}) e leva a gid ${gid}` +
            (apontaPra ? ` = "${apontaPra}"` : ' = ÓRFÃO, nenhuma aba tem esse gid')
          );
        } else if (rotulo !== F.rotuloNavParaSlot(esperado.destino, (FMT.GEO[aba] || {}).cols && FMT.GEO[aba].cols[colEsperada])) {
          const esperadoRotulo = F.rotuloNavParaSlot(esperado.destino, (FMT.GEO[aba] || {}).cols && FMT.GEO[aba].cols[colEsperada]);
          navFalhas.push(`${aba}!${esperado.ref} aponta certo mas o rótulo é "${rotulo}" e devia ser "${esperadoRotulo}"`);
        } else if (ocultas.has(esperado.destino)) {
          navFalhas.push(`${aba}!${esperado.ref} leva a "${esperado.destino}", que está OCULTA — o link não navega`);
        } else navOk++;
      });
    }
    console.log(`links de navegação conferidos contra o sheetId vivo: ${navOk}/${navTotal}`);

    // ---- N-13, SEGUNDA METADE: A CÉLULA DE NAV ESTÁ EM COLUNA VISÍVEL? ----
    //
    // Esta metade não existia, e foi por isso que o D1 passou. `Concursos!A1:D1`
    // recebia os quatro `HYPERLINK` e as colunas C e D daquela aba eram `_url` e
    // `_ordem`, OCULTAS: a aba renderizava DOIS links. Todos os quatro `gid`
    // eram válidos, todos os quatro rótulos eram os certos, e o controle acima
    // dizia 4/4. Lendo o gerador a nav tinha quatro; olhando a peça, dois — e a
    // metade que sumia era `🎯 Fila` e `✍️ Tarefas`, os dois destinos de
    // escrita, a partir de uma das três abas de chegada diária.
    //
    // Link perfeito dentro de coluna invisível passa em toda auditoria de
    // LEITURA. Só a pergunta "o olho alcança esta célula?" pega, e ela só se
    // responde contra o `hiddenByUser` VIVO da planilha — não contra o que o
    // gerador acha que aplicou.
    console.log('\n=== NAVEGAÇÃO (coluna visível) ===');
    const visFalhas = [];
    // O instrumento primeiro, como sempre: sem controle positivo E negativo,
    // "0 links invisíveis" não significa nada — pode ser o leitor quebrado.
    const estaOculta = (metaCols, i) => !!((metaCols || [])[i] || {}).hiddenByUser;
    const CTRL_COLS = [{}, { hiddenByUser: true }];
    if (estaOculta(CTRL_COLS, 0)) visFalhas.push('CONTROLE NEGATIVO do leitor de visibilidade FALHOU — ele chama de oculta uma coluna visível');
    if (!estaOculta(CTRL_COLS, 1)) visFalhas.push('CONTROLE POSITIVO do leitor de visibilidade FALHOU — ele não enxerga uma coluna oculta; "0 links invisíveis" abaixo não vale nada');
    if (!visFalhas.length) console.log('controles do leitor de visibilidade: positivo e negativo passaram');

    // Agora a planilha viva. Uma requisição, uma faixa de linha 1 por aba, só
    // o `columnMetadata` — é a única forma de a API devolver `hiddenByUser`.
    const abasComNav = Object.keys(navEsperada);
    const q = abasComNav.map(x => `ranges=${encodeURIComponent(`${R(x)}!A1:Z1`)}`).join('&');
    const gd = await a.api(`?includeGridData=true&${q}&fields=sheets(properties(title),data(columnMetadata(hiddenByUser)))`);
    const colsDe = {};
    (gd.sheets || []).forEach(sh => { colsDe[sh.properties.title] = ((sh.data || [])[0] || {}).columnMetadata || []; });

    let visOk = 0, visTotal = 0;
    for (const [aba, celulas] of Object.entries(navEsperada)) {
      for (const { ref, destino } of celulas) {
        visTotal++;
        const i = ref.charCodeAt(0) - 65;
        if (estaOculta(colsDe[aba], i)) {
          visFalhas.push(
            `${aba}!${ref} hospeda o link "${F.ROTULO_NAV[destino]}" e está numa coluna OCULTA — ` +
            'o link existe, o gid é válido, e ninguém consegue tocar nele. É o D1.'
          );
        } else visOk++;
      }
    }
    console.log(`células de nav em coluna VISÍVEL: ${visOk}/${visTotal}`);
    navFalhas.push(...visFalhas);

    // ---- ONDA 18: A ABA ATUAL SE MARCA ----
    //
    // Até esta Onda a barra só respondia PRA ONDE ir — "ONDE ESTOU" morava no
    // rodapé do navegador (a tira de abas do Sheets), que é o que o
    // briefing pede pra não depender. `F.navCelulas` escreve o marcador
    // (`F.navAqui`) na célula seguinte ao último destino, como TEXTO PLANO —
    // e é esse contraste ("todo o resto é HYPERLINK, esta célula não é") que
    // prova que ela não é mais um destino disfarçado.
    //
    // Instrumento primeiro: sem controle, "N/N marcado certo" pode ser um
    // comparador que sempre diz "sim". Positivo: o texto que a própria
    // `F.navAqui` gera bate com ela mesma. Negativo: o texto de uma OUTRA
    // aba não bate.
    console.log('\n=== NAVEGAÇÃO ("você está aqui") ===');
    const aquiFalhas = [];
    // Positivo: contra um literal escrito à mão (não derivado da própria
    // função) — se `navAqui` perder o glifo ou o "📍ˑ" na frente, o literal
    // não muda e o controle acusa.
    if (F.navAqui(A.HOJE) !== `📍 ${F.ROTULO_NAV[A.HOJE]}`) aquiFalhas.push('CONTROLE POSITIVO do marcador FALHOU — F.navAqui não gera "📍 " + o rótulo da aba');
    // Negativo: duas abas diferentes não podem produzir o mesmo texto —
    // senão o marcador "confirmaria" a aba errada sem acusar nada.
    if (F.navAqui(A.PAINEL) === F.navAqui(A.EMPREGOS)) aquiFalhas.push('CONTROLE NEGATIVO do marcador FALHOU — duas abas diferentes produzem o mesmo texto');
    if (!aquiFalhas.length) console.log('controles do marcador: positivo e negativo passaram');

    let aquiOk = 0, aquiTotal = 0;
    for (const aba of Object.keys(F.NAV)) {
      aquiTotal++;
      const ref = F.celulaNav(aba, F.NAV[aba].length, F.LINHAS[aba].nav);
      const lido = (await a.ler(`${R(aba)}!${ref}`)).values || [];
      const texto = ((lido[0] || [])[0] || '').toString();
      const esperado = F.navAqui(aba);
      if (texto !== esperado) {
        aquiFalhas.push(`${aba}!${ref} devia marcar "${esperado}" (você está aqui) e tem "${texto}"`);
      } else if (String(texto).startsWith('=')) {
        aquiFalhas.push(`${aba}!${ref} é uma FÓRMULA — o marcador tem que ser texto plano, senão vira mais um link disfarçado`);
      } else aquiOk++;
    }
    console.log(`marcador "você está aqui" conferido: ${aquiOk}/${aquiTotal}`);
    if (aquiFalhas.length) { console.log('\nFALHAS DO MARCADOR:\n' + aquiFalhas.join('\n')); }
    navFalhas.push(...aquiFalhas);

    // ---- ONDA 18-20: A ABA FOI *PINTADA*, OU SÓ ESCRITA? ----
    //
    // Achado lendo a CHAPA (PDF exportado), não o código: `Etapas` tinha
    // `GEO`, validação e nota desde a Onda 14, mas nunca entrou na lista
    // `HUMANAS` de `formatar.js` — a que aplica o campo N1, o congelamento
    // e o estilo da nav (sublinhado/acento, e agora o marcador "você está
    // aqui"). `construir.js` (escreve VALOR) e `formatar.js` (pinta) são
    // dois scripts separados: o texto saía certo, a cor nunca chegou —
    // cromo branco em vez de N1, sem congelamento, marcador sem fundo
    // escuro. Todo check acima (texto, gid, coluna visível) PASSAVA, porque
    // nenhum deles olha `effectiveFormat`. Só a chapa denunciou.
    //
    // Instrumento primeiro: o controle é a própria leitura de `Hoje!A1`
    // (sempre N1 por construção, é a primeira aba do `HUMANAS`) — se ELA
    // não bater, o leitor de cor está cego e "N/N pintado" abaixo não vale.
    console.log('\n=== NAVEGAÇÃO (aba PINTADA, não só escrita) ===');
    const pintFalhas = [];
    const N1 = { red: 0.95686275, green: 0.94509804, blue: 0.9176471 }; // #F4F1EA
    const bateN1 = c => !!c && Math.abs((c.red || 0) - N1.red) < 0.01
      && Math.abs((c.green || 0) - N1.green) < 0.01 && Math.abs((c.blue || 0) - N1.blue) < 0.01;
    const gdCromo = await a.api(
      `?includeGridData=true&ranges=${encodeURIComponent(`${R(A.HOJE)}!A1`)}` +
      abasComNav.map(x => `&ranges=${encodeURIComponent(`${R(x)}!A1`)}`).join('') +
      `&fields=sheets(properties(title),data(rowData(values(effectiveFormat(backgroundColor)))))`
    );
    const bgDe = {};
    (gdCromo.sheets || []).forEach(sh => {
      const v = ((((sh.data || [])[0] || {}).rowData || [])[0] || {}).values || [];
      bgDe[sh.properties.title] = ((v[0] || {}).effectiveFormat || {}).backgroundColor;
    });
    if (!bateN1(bgDe[A.HOJE])) {
      pintFalhas.push(`CONTROLE do leitor de cromo FALHOU — ${A.HOJE}!A1 (sempre N1 por construção) leu ${JSON.stringify(bgDe[A.HOJE])}. Nada abaixo vale enquanto isto não passar.`);
    } else console.log('controle do leitor de cromo: passou (Hoje!A1 = N1)');
    let pintOk = 0;
    for (const aba of abasComNav) {
      if (bateN1(bgDe[aba])) pintOk++;
      else pintFalhas.push(`${aba}!A1 devia ter fundo N1 (cromo) e leu ${JSON.stringify(bgDe[aba])} — a aba está ESCRITA mas não está PINTADA (confira se ela está em HUMANAS, _norman/formatar.js).`);
    }
    console.log(`abas com cromo N1 aplicado: ${pintOk}/${abasComNav.length}`);
    navFalhas.push(...pintFalhas);

    if (navFalhas.length) { console.log('\nFALHAS DA NAVEGAÇÃO:\n' + navFalhas.join('\n')); falhas.push(...navFalhas); }

    // ================= CARIMBO DE SYNC =================
    // O carimbo é o que responde "de quando é isto". Ele é a peça mais
    // silenciosa da planilha inteira: se `lib/sheets.js` parar de escrevê-lo,
    // NADA quebra — as contas contra TODAY() continuam certas, a lista continua
    // renderizando, e a única consequência é o aviso de desatualizada nunca
    // acender. Vira um "tudo certo" permanente, que é pior do que não ter
    // carimbo nenhum. Por isso os quatro controles derrubam o processo.
    const carimboFalhas = [];
    const hojeISO = isoLocal(new Date());
    const cel = ((await a.ler(`${R(A.DADOS)}!Y1:Z1`)).values || [[]])[0] || [];
    const carimbo = String(cel[0] || '');

    console.log('\n=== CARIMBO DE SYNC ===');

    // K1 — o carimbo EXISTE e é ISO 8601. É o controle que o briefing pede:
    // aborta sozinho se o sync parar de gravá-lo.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(carimbo)) {
      carimboFalhas.push(
        `carimbo AUSENTE ou fora do formato em ${A.DADOS}!${SHEETS.CELULA_CARIMBO}: ${JSON.stringify(cel)}. ` +
        'Quem escreve é `lib/sheets.js enviar()` — se sumiu, ou o sync não roda há tempo, ou a escrita do carimbo foi removida do caminho do sync.'
      );
    } else if (!String(cel[1] || '').trim()) {
      carimboFalhas.push(`carimbo sem a linha humana em ${A.DADOS}!Z1 — o par Y1/Z1 é escrito junto, então metade faltando é escrita parcial`);
    } else {
      console.log(`carimbo: ${carimbo} · ${cel[1]}`);
    }

    // K2 — a tabela de feriados COBRE o ano corrente e o seguinte. Ela é
    // escrita uma vez por `construir.js` e congela: quando os anos acabam,
    // NETWORKDAYS volta a contar feriado como dia útil e o aviso fica nervoso
    // sem nada na tela explicando. Mapa curado envelhece MUDO.
    const anos = FERIADOS.anosCobertos((await a.ler(`${A.C}!Y2:Y`)).values);
    const anoAtual = new Date().getFullYear();
    if (!anos.length) carimboFalhas.push(`tabela de feriados VAZIA em ${A.CALC}!Y — rode \`node _norman/construir.js\``);
    else if (Math.max(...anos) < anoAtual + 1) {
      carimboFalhas.push(
        `tabela de feriados vai só até ${Math.max(...anos)} e o ano atual é ${anoAtual} — ` +
        'quando ela expira, o aviso de desatualizada passa a contar feriado como dia útil. Rode `node _norman/construir.js`.'
      );
    } else console.log(`tabela de feriados: ${anos.length} ano(s), ${anos[0]}–${anos[anos.length - 1]} (${(await a.ler(`${A.C}!Y2:Y`)).values.length} datas)`);

    // K3 — a planilha e o Node CONCORDAM sobre acender ou não. O veredito
    // esperado é derivado por outro caminho (`lib/feriados-nacionais.js` direto,
    // via `_norman/feriados.js`), então uma fórmula apagada, apontando pra
    // célula errada, ou lendo uma tabela de feriados vazia, aparece aqui como
    // divergência em vez de ficar muda. Veredito derivado que ninguém confere
    // contra a fonte é veredito que aponta pra outra coisa sem quebrar.
    if (/^\d{4}-\d{2}-\d{2}$/.test(carimbo)) {
      const atraso = FERIADOS.diasUteisEntre(carimbo, hojeISO) - 1;
      const deveAcender = atraso >= F.LIMIAR_ATRASO_DIAS_UTEIS;
      console.log(`atraso: ${atraso} dia(s) útil(eis) · limiar ${F.LIMIAR_ATRASO_DIAS_UTEIS} · esperado: ${deveAcender ? 'ACENDE' : 'silêncio'}`);
      // `Hoje` ENTRA nesta lista agora. Antes ele tinha regra PRÓPRIA (dias
      // corridos) enquanto as três abas de leitura usavam `AVISO_SYNC` (dias
      // úteis): mesmo número 3, unidade diferente, e uma segunda-feira perdida
      // fazia o portal se contradizer entre duas abas. Agora os QUATRO leem a
      // mesma constante, e este controle é o que prova que continuam lendo.
      for (const aba of [A.HOJE, A.PAINEL, A.EMPREGOS, A.TUDO]) {
        const txt = (((await a.ler(`${R(aba)}!A${F.LINHAS[aba].veredito}`)).values || [[]])[0] || [''])[0] || '';
        const acendeu = txt.includes('🛑');
        if (acendeu !== deveAcender) {
          carimboFalhas.push(
            `aviso de sync DIVERGE em ${aba}: a planilha ${acendeu ? 'acende' : 'fica muda'} e a conta em Node diz ${deveAcender ? 'ACENDE' : 'silêncio'} ` +
            `(carimbo ${carimbo}, hoje ${hojeISO}, atraso ${atraso})`
          );
        }
      }
      // K4 — o número IMPRESSO é o número CALCULADO. Sem isto, um aviso que
      // acende pelo motivo certo ainda pode mentir na conta.
      if (deveAcender) {
        const txt = (((await a.ler(`${R(A.PAINEL)}!A${F.LINHAS[A.PAINEL].veredito}`)).values || [[]])[0] || [''])[0] || '';
        const m = txt.match(/— (\d+) dias úteis/);
        if (!m) carimboFalhas.push('aviso de sync aceso mas sem a contagem de dias no texto');
        else if (Number(m[1]) !== atraso) carimboFalhas.push(`aviso de sync diz ${m[1]} dias úteis, a conta real é ${atraso}`);
      }
      if (!carimboFalhas.length) console.log(`os 4 vereditos concordam com a conta (${deveAcender ? 'aviso aceso' : 'silêncio'})`);
    }

    if (carimboFalhas.length) {
      console.log('\nFALHAS DO CARIMBO DE SYNC:\n' + carimboFalhas.join('\n'));
      falhas.push(...carimboFalhas);
    }

    // ================= CAMADA NOTÍCIA =================
    //
    // Três coisas que a varredura de erro NÃO pega, porque nenhuma delas
    // vira `#REF!`/`#N/A` — todas são "sem erro nenhum" por construção:
    //
    //   N1. o carimbo da trilha notícia. Segunda máquina, segundo carimbo:
    //       se `noticias.js sincronizar-sheets` parar de rodar, nada quebra,
    //       as quatro abas continuam mostrando notícia de semanas atrás e o
    //       único canal que denuncia isso é o aviso 🛑 — que só existe se o
    //       carimbo existir.
    //   N2. o SELETOR. Ele é uma célula digitável; se ficar vazia, com lixo,
    //       ou perder a validação, a lista continua renderizando (a fórmula
    //       degrada pro padrão) e o controle vira decoração em silêncio.
    //   N3. a lista RESPONDE ao seletor. Uma fórmula que ignorasse `A3` e
    //       filtrasse sempre 3 dias renderizaria perfeitamente — e o
    //       controle seria um botão desligado. Só comparar o que a planilha
    //       mostra contra o que o pipeline calcula pega isso, e é por isso
    //       que a conta esperada vem de `lib-noticias/ranking.js`, por outro
    //       caminho, e não de uma segunda leitura da planilha.
    //
    // O QUE ESTE INSTRUMENTO NÃO OLHA, declarado: se o link da coluna
    // `Abrir` é CLICÁVEL. O campo `hyperlink` da API pareceria servir e NÃO
    // serve — medido nesta Onda, ele devolve FALSO NEGATIVO: `Hoje!A2`
    // contém `=HYPERLINK("…";"🎓 Concursos")` e a API não reporta hyperlink
    // nenhum ali, de forma estável entre leituras. Um instrumento que
    // reprova uma célula boa reprova qualquer coisa. O que dá pra conferir
    // sem mentir é o VALOR — e é o que a varredura de erro faz: `HYPERLINK`
    // em posição inválida vira `#N/A`, não vira link morto silencioso.
    console.log('\n=== CAMADA NOTÍCIA ===');
    const notFalhas = [];

    // UMA leitura para tudo que esta seção precisa da planilha: o carimbo e
    // os quatro vereditos. Eram dez requisições; a cota de LEITURA (60/min,
    // separada da de escrita) estourava no último controle do arquivo
    // quando `verificar.js` rodava duas vezes seguidas — a auditoria morria
    // depois de aprovar tudo, que parece reprovação.
    const faixasN = [
      `${R(A.NOTICIAS_DADOS)}!${SHEETS.CELULA_CARIMBO}:Z1`,
      ...A.VISTAS_NOTICIA.map(x => `${R(x)}!A${F.LINHAS[x].veredito}`)
    ];
    const lidoN = await a.lerVarios(faixasN);
    const veredEmN = {};
    A.VISTAS_NOTICIA.forEach((x, i) => {
      veredEmN[x] = String(((lidoN[1 + i] || [[]])[0] || [''])[0] || '');
    });

    const celN = (lidoN[0] || [[]])[0] || [];
    const carimboN = String(celN[0] || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(carimboN)) {
      notFalhas.push(
        `carimbo AUSENTE ou fora do formato em ${A.NOTICIAS_DADOS}!${SHEETS.CELULA_CARIMBO}: ${JSON.stringify(celN)}. ` +
        'Quem escreve é `node noticias.js sincronizar-sheets` — sem ele, o aviso 🛑 de coleta parada nunca acende.'
      );
    } else if (!String(celN[1] || '').trim()) {
      notFalhas.push('carimbo de notícia sem a linha humana ao lado — o par é escrito junto, metade faltando é escrita parcial');
    } else {
      // Dias CORRIDOS, não úteis: a régua da trilha notícia é outra, e o
      // motivo está em `F.AVISO_SYNC_NOTICIA`. Contar aqui do jeito da
      // trilha vaga faria este controle reprovar a peça certa.
      const atrasoN = Math.round((Date.parse(hojeISO) - Date.parse(carimboN)) / 86400000);
      const deveAcenderN = atrasoN >= F.LIMIAR_ATRASO_NOTICIA_DIAS;
      console.log(`carimbo de notícia: ${carimboN} · ${celN[1]}`);
      console.log(`atraso: ${atrasoN} dia(s) corrido(s) · limiar ${F.LIMIAR_ATRASO_NOTICIA_DIAS} · esperado: ${deveAcenderN ? 'ACENDE' : 'silêncio'}`);
      for (const aba of A.VISTAS_NOTICIA) {
        const acendeu = veredEmN[aba].includes(F.GLIFO_ALARME);
        if (acendeu !== deveAcenderN) {
          notFalhas.push(
            `aviso de coleta DIVERGE em ${aba}: a planilha ${acendeu ? 'acende' : 'fica muda'} e a conta em Node diz ` +
            `${deveAcenderN ? 'ACENDE' : 'silêncio'} (carimbo ${carimboN}, hoje ${hojeISO}, atraso ${atrasoN})`
          );
        }
      }
    }

    // N2 (Onda 8-9 + C10) — cada uma das QUATRO TABELAS bate com
    // `faixa`/`posicao` da própria aba de fato. Não há mais seletor pra
    // validar (saiu — JB pediu as tabelas sempre visíveis). E a conta
    // esperada não vem mais de `ranking.aplicarRecorte` recomputado em Node:
    // o RELATORIO-ONDA-7-10.md §5 item 3 registrou que essa chamada MUDOU DE
    // SEMÂNTICA (devolve só o que já entrou na faixa, não a janela inteira)
    // — reescrito aqui pra ler as colunas J (`faixa`)/K (`posicao`) DIRETO
    // da planilha, que é a fonte agora (decisão C2). Uma leitura só, com
    // `lerVarios`, pela mesma razão de cota do bloco acima.
    //
    // C10 Parte 2 — a LEITURA mudou de EIXO: Onda 8-9 lia uma faixa VERTICAL
    // (`título:tema` numa coluna fixa, várias linhas — as três tabelas
    // empilhadas na mesma coluna). Agora cada tabela tem seu PRÓPRIO bloco
    // de colunas (`título`..`tema` DENTRO da tabela `i`), na MESMA linha
    // inicial pras quatro (`F.LINHAS[aba].lista`) — a leitura vira um
    // RETÂNGULO (4 colunas × altura máxima) por tabela, mas a estrutura
    // INTERNA de cada linha lida (índice 0 = título, índice 3 = tema)
    // continua idêntica — o parsing abaixo não muda.
    const idxAba = F.NOTICIA_FATO_CABECALHO.indexOf('aba');
    const idxFaixaFato = F.NOTICIA_FATO_CABECALHO.indexOf('faixa');
    const fatoLido = await a.ler(`${R(A.NOTICIAS_DADOS)}!A2:K`);
    const fatoLinhas = fatoLido.values || [];
    const tabelaPar = [];
    for (const aba of A.VISTAS_NOTICIA) {
      const l0 = F.LINHAS[aba].lista;
      F.NOTICIA_FAIXAS.forEach((faixaInfo, i) => {
        const colTitulo = F.noticiaLetra(i, 'título');
        const colTema = F.noticiaLetra(i, 'tema');
        tabelaPar.push({ aba, faixaInfo, range: `${R(aba)}!${colTitulo}${l0}:${colTema}${l0 + F.NOTICIA_TETO + 1}` });
      });
    }
    const lidoTabelas = await a.lerVarios(tabelaPar.map(p => p.range));

    tabelaPar.forEach((p, i) => {
      const { aba, faixaInfo } = p;
      const linhas = lidoTabelas[i] || [];
      // A faixa lida cobre título + até NOTICIA_TETO linhas de dado + 1
      // rodapé de transbordo — mas a ALTURA do meio é a do VSTACK
      // (`formulas.js` ~:2149), que só ocupa quantas linhas o `FILTER`
      // devolveu (até NOTICIA_TETO, nunca preenchida até o teto quando há
      // menos itens). Achado ao vivo (28/08, primeira vez com dado real:
      // `Trabalho/7d` tem 12 itens, não 20) — o rodapé de transbordo NÃO
      // está numa posição fixa; ele sobe pra logo depois do último item.
      // Cortar o "corpo" por posição (`slice(1, 1+NOTICIA_TETO)`) incluiria
      // o próprio rodapé dentro do corpo sempre que a tabela tiver menos
      // que o teto — o mesmo defeito, deslocado. A distinção tem que ser
      // por CONTEÚDO: o rodapé de transbordo é a ÚNICA linha que começa com
      // `MARCADOR_VAZIO + "+ "` (o literal exato de `formulas.js` ~:2150,
      // "↳ + N não estão nesta tabela."); o texto do terceiro estado vazio
      // (`formulas.js` ~:2138-2139) começa com `MARCADOR_VAZIO` mas NUNCA
      // com essa sequência ("↳ Nada nesta janela…" / "↳ 🆕 O radar é
      // novo…"). Por isso o `startsWith(MARCADOR_VAZIO)` simples (usado
      // antes desta rodada) confundia as duas: toda tabela com transbordo
      // (o caso normal com dado de verdade) acusava "vazio" — com o store
      // sempre vazio nas rodadas anteriores (sem sync), o rodapé nunca
      // aparecia (`sobra=0`), então o bug nunca se manifestava por
      // coincidência. Esta é a primeira rodada com dado real fluindo pela
      // cascata, e é isso que expôs o defeito.
      const ehTransbordo = t => t.startsWith(F.MARCADOR_VAZIO + '+ ');
      const tituloLido = String((linhas[0] || [])[0] || '');
      const esperado = fatoLinhas.filter(l => l[idxAba] === F.NOTICIA_ABA_PIPELINE[aba] && l[idxFaixaFato] === faixaInfo.codigo).length;
      if (tituloLido !== faixaInfo.rotulo) {
        notFalhas.push(`${aba}/${faixaInfo.codigo}: não imprimiu o título "${faixaInfo.rotulo}" (leu "${tituloLido}")`);
      }
      const vazioImpresso = linhas.some(l => {
        const t = String((l || [])[0] || '');
        return t.startsWith(F.MARCADOR_VAZIO) && !ehTransbordo(t);
      });
      if (esperado === 0 && !vazioImpresso) {
        notFalhas.push(`${aba}/${faixaInfo.codigo}: a aba de fato conta ZERO nesta faixa e a tabela não imprimiu o estado vazio`);
      }
      if (esperado > 0 && vazioImpresso) {
        notFalhas.push(`${aba}/${faixaInfo.codigo}: a aba de fato conta ${esperado} nesta faixa e a tabela imprimiu o estado VAZIO`);
      }
      if (esperado > F.NOTICIA_TETO) {
        notFalhas.push(`${aba}/${faixaInfo.codigo}: a aba de fato conta ${esperado} > NOTICIA_TETO (${F.NOTICIA_TETO}) — a cascata deveria ter cortado em ${F.NOTICIA_TETO}`);
      }
      // Linha de NOTÍCIA de verdade: nem o título da tabela, nem o estado
      // vazio, nem o rodapé de transbordo — os três excluídos por conteúdo
      // (posição varia com a contagem real, ver comentário acima).
      const linhasNoticia = linhas.filter(l => {
        const t = String((l || [])[0] || '');
        return t && t !== faixaInfo.rotulo && !t.startsWith(F.MARCADOR_VAZIO);
      });
      if (linhasNoticia.length > F.NOTICIA_TETO) {
        notFalhas.push(`${aba}/${faixaInfo.codigo}: ${linhasNoticia.length} linha(s) de notícia na tela, acima do teto ${F.NOTICIA_TETO}`);
      }
      // A coluna `tema` (Onda 9) tem que vir preenchida em TODA linha de
      // notícia — é a coluna que o funil filtra; vazia ali, o funil mente.
      const semTema = linhasNoticia.filter(l => !String((l || [])[3] || '').trim());
      if (semTema.length) {
        notFalhas.push(`${aba}/${faixaInfo.codigo}: ${semTema.length} linha(s) de notícia sem "tema" preenchido`);
      }
      console.log(
        `  ${aba.padEnd(9)} ${faixaInfo.codigo.padEnd(4)} fato ${String(esperado).padStart(3)} · na tela ${String(linhasNoticia.length).padStart(3)}` +
        `${vazioImpresso ? ' · ESTADO VAZIO impresso' : ''}`
      );
    });

    // Sinal de STALENESS (informativo, não reprova sozinho): compara o total
    // de registros no store local (`data/noticias.jsonl`) com o total na aba
    // de fato — se divergirem muito, a planilha provavelmente não passou por
    // `node noticias.js sincronizar-sheets` depois da última coleta.
    const totalStoreN = STORE_NOTICIA.carregarTudo().length;
    if (totalStoreN !== fatoLinhas.length) {
      console.log(
        `\nAVISO (não reprova): data/noticias.jsonl tem ${totalStoreN} registro(s) e ` +
        `${A.NOTICIAS_DADOS} tem ${fatoLinhas.length} — rode \`node noticias.js sincronizar-sheets\` pra igualar.`
      );
    }

    if (notFalhas.length) {
      console.log('\nFALHAS DA CAMADA NOTÍCIA:\n' + notFalhas.join('\n'));
      falhas.push(...notFalhas);
    } else {
      console.log('camada notícia: sem divergência entre a planilha e o pipeline');
    }

    // ============ N-14 · A PROMESSA "NENHUMA NOTÍCIA DEVE SE REPETIR" (0d) ============
    //
    // JB pediu literalmente isso entre as quatro tabelas de cada aba. A Onda
    // 21 provou UMA VEZ, à mão, com um script ad hoc fora deste arquivo
    // (RELATORIO-ONDA-21.md §Parte 1). Prova que roda uma vez não é prova que
    // sobrevive à próxima mudança — vira instrumento permanente aqui.
    //
    // A FONTE é `fatoLinhas` (já lida acima pra N2, nenhuma requisição nova):
    // a aba de fato oculta `notícias (não edite)` é de onde as 4 tabelas de
    // cada vista nascem por `FILTER(aba=X; faixa=Y)` — N2, logo acima, já
    // confirma que nenhuma aba excede `NOTICIA_TETO` por faixa, ou seja, todo
    // registro da fato É um registro que aparece em alguma das 4 tabelas.
    // Reprovar duplicata na fato é reprovar a vista, sem reler as 16
    // tabelas.
    //
    // DUAS RÉGUAS, as MESMAS que a cascata de `calcularFaixasNoticia`
    // (`lib-noticias/ranking.js`) usa pra excluir: url CANÔNICA (`link`) e
    // `cluster_id`. Uma só não basta — medido ao vivo na Onda 21: das 3
    // repetições reais achadas, cada uma foi pega por UMA das duas réguas,
    // nunca pelas duas ao mesmo tempo (duas fontes servindo a mesma matéria
    // têm `link` diferente mas casam por `cluster_id`; a mesma matéria
    // re-coletada com título re-editado pode trocar de `cluster_id` mas
    // mantém o `link`).
    //
    // `cluster_id` só existe na FATO — a VISTA que JB abre não carrega esse
    // campo (Onda 21 Parte 2: `Abrir · título · quando · veículo · tema` +
    // `_url` oculta, sem `cluster_id`). A régua de cluster_id roda onde o
    // campo EXISTE (a fato), que é o mais perto de "na vista" que dá pra
    // chegar sem inventar uma coluna nova só pra este cheque.
    console.log('\n=== DEDUP DE NOTÍCIA ENTRE AS 4 TABELAS (promessa "nenhuma notícia se repete") ===');

    /**
     * Duplicata = o mesmo valor de `campo` (link ou cluster_id) aparecendo em
     * mais de UMA linha da MESMA aba, ENTRE AS QUE TÊM FAIXA VÁLIDA — seja em
     * faixas diferentes (repete ENTRE tabelas, o defeito que JB nomeou) ou na
     * mesma faixa (repete DENTRO da mesma tabela, pior ainda e a mesma
     * promessa quebrada).
     *
     * `faixasValidas` filtra por CONSTRUÇÃO as linhas que não aparecem em
     * NENHUMA tabela: a fato guarda candidatas que a cascata (`ranking.js
     * calcularFaixasNoticia`) computou mas não selecionou pra nenhuma das 4
     * janelas (faixa fica vazia/fora do vocabulário `hoje|7d|15d|30d`) — sem
     * este filtro, duas candidatas descartadas com o MESMO cluster_id (comum:
     * reprocessamento de um lote antigo) contam como "duplicata entre
     * tabelas" quando na verdade não estão em tabela NENHUMA. Medido ao vivo
     * nesta rodada: sem o filtro, a varredura acusava dezenas de
     * "duplicatas" com `faixa=""` na lista — falso positivo do instrumento,
     * não repetição real na peça que JB olha.
     */
    function acharDuplicatasNoticia(linhas, idxAbaP, idxLinkP, idxClusterP, idxFaixaP, faixasValidas) {
      const duplicatas = [];
      for (const campo of ['link', 'cluster_id']) {
        const idx = campo === 'link' ? idxLinkP : idxClusterP;
        if (idx < 0) continue; // campo não existe no cabeçalho — régua fica de fora, não inventa índice
        const porChave = {};
        for (const l of linhas) {
          const aba = (l || [])[idxAbaP];
          const faixa = String((l || [])[idxFaixaP] || '');
          if (!faixasValidas.has(faixa)) continue; // não está em NENHUMA das 4 tabelas — não é repetição na peça
          const valor = String((l || [])[idx] || '').trim();
          if (!aba || !valor) continue;
          const chave = aba + '|' + valor;
          (porChave[chave] = porChave[chave] || []).push(faixa);
        }
        for (const [chave, faixasVistas] of Object.entries(porChave)) {
          if (faixasVistas.length > 1) {
            const [aba, valor] = chave.split('|');
            duplicatas.push({ aba, campo, valor, faixas: faixasVistas });
          }
        }
      }
      return duplicatas;
    }

    const FAIXAS_VALIDAS_NOTICIA = new Set(F.NOTICIA_FAIXAS.map(f => f.codigo));
    const idxLinkFato = F.NOTICIA_FATO_CABECALHO.indexOf('link');
    const idxClusterFato = F.NOTICIA_FATO_CABECALHO.indexOf('cluster_id');
    const dedupFalhas = [];

    // CONTROLE NEGATIVO primeiro — sem ele, "0 duplicata" pode significar
    // "está tudo limpo" OU "a varredura está cega", e os dois passam em
    // auditoria de leitura igualzinho (mesmo padrão de `verificar.js:255` e
    // dos controles de gid/cor mais abaixo/acima). Duas linhas sintéticas
    // plantam UMA repetição por `link` (mesma aba, faixas diferentes) e UMA
    // por `cluster_id` (mesma aba, url diferente, faixas diferentes); uma
    // terceira linha sozinha prova que o instrumento não acusa duplicata à
    // toa (falso positivo) num conjunto limpo.
    const CTRL_PLANTADO = [
      // repetição de LINK, mesma aba "ia", faixas "hoje" e "7d":
      ['t1', 'v1', 'https://exemplo.test/materia-x', '2026-08-28', 'ia', 't', 1, 50, 'cA', 'hoje', 1],
      ['t1-repub', 'v2', 'https://exemplo.test/materia-x', '2026-08-27', 'ia', 't', 1, 40, 'cB', '7d', 3],
      // repetição de CLUSTER_ID, mesma aba "ciencia", urls diferentes, faixas "hoje" e "15d":
      ['t2', 'v1', 'https://exemplo.test/materia-y', '2026-08-28', 'ciencia', 't', 1, 50, 'cX', 'hoje', 2],
      ['t2-outra-url', 'v3', 'https://exemplo.test/materia-y-2', '2026-08-27', 'ciencia', 't', 1, 45, 'cX', '15d', 4],
      // linha limpa, sozinha — não pode acender nada:
      ['t3', 'v1', 'https://exemplo.test/materia-z', '2026-08-28', 'geral', 't', 1, 50, 'cZ', 'hoje', 1]
    ];
    const dupsCtrl = acharDuplicatasNoticia(CTRL_PLANTADO, idxAba, idxLinkFato, idxClusterFato, idxFaixaFato, FAIXAS_VALIDAS_NOTICIA);
    const achouLink = dupsCtrl.some(d => d.campo === 'link' && d.aba === 'ia');
    const achouCluster = dupsCtrl.some(d => d.campo === 'cluster_id' && d.aba === 'ciencia');
    if (!achouLink) {
      dedupFalhas.push('CONTROLE NEGATIVO (url repetida plantada) FALHOU — a varredura de dedup de notícia não enxerga uma repetição de `link` que ela deveria pegar; "0 duplicata" abaixo não valeria nada.');
    }
    if (!achouCluster) {
      dedupFalhas.push('CONTROLE NEGATIVO (cluster_id repetido plantado) FALHOU — a varredura não enxerga um cluster_id repetido entre faixas; "0 duplicata" abaixo não valeria nada.');
    }
    if (dupsCtrl.length !== 2) {
      dedupFalhas.push(`CONTROLE POSITIVO (nada mais que as 2 plantadas) FALHOU — a varredura achou ${dupsCtrl.length} duplicata(s) no conjunto de controle, esperado exatamente 2 (falso positivo na linha limpa "t3", ou dupla-contagem).`);
    }
    console.log(`controles do instrumento: ${dedupFalhas.length ? 'FALHARAM' : 'positivo e negativo passaram (2/2 plantadas achadas, 0 falso positivo)'}`);
    if (idxClusterFato < 0) {
      console.log(`AVISO: "cluster_id" não está mais em F.NOTICIA_FATO_CABECALHO — a régua de cluster_id ficou de fora desta rodada.`);
    }

    // Agora a planilha VIVA — mesma função, mesmo instrumento já provado acima.
    const dupsReais = acharDuplicatasNoticia(fatoLinhas, idxAba, idxLinkFato, idxClusterFato, idxFaixaFato, FAIXAS_VALIDAS_NOTICIA);
    console.log(`duplicatas reais encontradas (${A.VISTAS_NOTICIA.length} abas × 4 tabelas): ${dupsReais.length}`);
    if (dupsReais.length) {
      dedupFalhas.push(
        `${dupsReais.length} notícia(s) repetida(s) entre as 4 tabelas de uma mesma aba — a promessa "nenhuma notícia deve se repetir" está QUEBRADA:\n  ` +
        dupsReais.map(d => `${d.aba}: mesmo ${d.campo}=${JSON.stringify(d.valor)} em faixa(s) ${d.faixas.join(', ')}`).join('\n  ')
      );
    }
    if (dedupFalhas.length) {
      console.log('\nFALHAS DO DEDUP DE NOTÍCIA:\n' + dedupFalhas.join('\n'));
      falhas.push(...dedupFalhas);
    } else {
      console.log('dedup de notícia: 0 repetição real entre as 4 tabelas de cada aba; controles positivo e negativo passaram.');
    }

    // ================= CAMADA CRM =================
    // Dois controles que a varredura de erro e o carimbo não cobrem — nenhum
    // dos dois vira `#REF!`/`#N/A`, os dois são "sem erro nenhum" por
    // construção, exatamente a classe de defeito que o briefing nomeou.
    console.log('\n=== CAMADA CRM ===');
    const crmFalhas = [];

    // G1 — projeto cadastrado ALÉM de `F.PROJETOS_ULTIMA_LINHA`. Nem
    // `Tarefas!B` (dropdown `ONE_OF_RANGE`) nem o bloco 📌 PROJETOS de `Hoje`
    // (um dos cinco sub-blocos do VSTACK) enxergam uma linha além
    // dessa — JB cadastraria um projeto que some dos dois lugares sem
    // nenhum aviso na tela.
    // G0 - `Diario!sobre` CONTRA `Projetos!A`, no dado VIVO (N11).
    //
    // O elo Diario -> Projetos e igualdade exata de string, e a unica coisa
    // que o protegia era a lista suspensa. Validacao de dados NAO SE APLICA A
    // ESCRITA POR API, e quem escreve o Diario hoje e script. No primeiro uso
    // real as duas entradas ficaram orfas: `movimentou` e `ultimas
    // movimentacoes` imprimiram "-" com o Diario cheio, sem erro em lugar
    // nenhum e sem nada na peca dizendo isso.
    //
    // Este cheque e o plano B com a mira certa: le a planilha VIVA e acusa por
    // LINHA e por VALOR. Um `sobre` legitimamente sem projeto tem que estar
    // DECLARADO em `F.DIARIO_SOBRE_LIVRE` - o silencio deixa de valer como
    // autorizacao.
    {
      const lD = F.LINHAS[A.DIARIO];
      // Onda UX 10 — o rótulo da coluna virou `F.DIARIO_ROTULO_SOBRE`
      // ("sobre (projeto)"), não mais o literal "sobre".
      const iSobre = F.DIARIO_CABECALHO.indexOf(F.DIARIO_ROTULO_SOBRE);
      const colSobre = String.fromCharCode(65 + iSobre);
      const [sobreVivo, projetosVivos] = await a.lerVarios([
        `${R(A.DIARIO)}!${colSobre}${lD.dados}:${colSobre}1000`,
        `${R(A.PROJETOS)}!A${F.LINHAS[A.PROJETOS].dados}:A${F.PROJETOS_ULTIMA_LINHA}`
      ]);
      const projetos = new Set(projetosVivos.map(l => String((l || [])[0] || '').trim()).filter(Boolean));
      const livres = new Set(F.DIARIO_SOBRE_LIVRE);
      const linhasDiario = sobreVivo
        .map((l, i) => ({ linha: lD.dados + i, valor: String((l || [])[0] || '').trim() }))
        .filter(x => x.valor !== '');
      const orfas = linhasDiario.filter(x => !projetos.has(x.valor) && !livres.has(x.valor));
      console.log(
        `${A.DIARIO}!${colSobre}: ${linhasDiario.length} entrada(s) preenchida(s) - ` +
        `${linhasDiario.length - orfas.length} casada(s) com ${A.PROJETOS}!A - ${orfas.length} orfa(s) - ` +
        `${projetos.size} projeto(s) cadastrado(s)`
      );
      if (orfas.length) {
        crmFalhas.push(
          `${A.DIARIO}!${colSobre}: ${orfas.length} entrada(s) com "${F.DIARIO_ROTULO_SOBRE}" fora de ${A.PROJETOS}!A - ` +
          `${A.PROJETOS}!movimentou e ${A.PROJETOS}!"ultimas movimentacoes" imprimem "-" pra elas, em silencio. ` +
          orfas.map(x => `linha ${x.linha}: ${JSON.stringify(x.valor)}`).join(' | ') +
          `. Cadastre a frente em ${A.PROJETOS} (o certo) OU declare o valor em F.DIARIO_SOBRE_LIVRE (_norman/formulas.js) ` +
          'quando a entrada legitimamente nao pertencer a projeto nenhum. ' +
          'Lista suspensa nao alcanca escrita por API: quem escreve o Diario e script.'
        );
      }
      // CONTROLE POSITIVO do proprio cheque: com Diario preenchido e ZERO
      // projeto lido, "0 orfas" seria tambem o resultado de um instrumento
      // quebrado. Se nao ha projeto nenhum, o cheque nao esta medindo.
      if (linhasDiario.length && !projetos.size) {
        crmFalhas.push(
          `CONTROLE do cheque de ${A.DIARIO}!${colSobre} FALHOU - ha ${linhasDiario.length} entrada(s) no Diario e NENHUM projeto lido em ` +
          `${A.PROJETOS}!A${F.LINHAS[A.PROJETOS].dados}:A${F.PROJETOS_ULTIMA_LINHA}. O veredito acima nao vale nada.`
        );
      }
    }

    const extraProjetos = await a.ler(`${R(A.PROJETOS)}!A${F.PROJETOS_ULTIMA_LINHA + 1}:A200`);
    const linhasExtra = (extraProjetos.values || [])
      .map((l, i) => ({ linha: F.PROJETOS_ULTIMA_LINHA + 1 + i, valor: l[0] }))
      .filter(x => x.valor);
    if (linhasExtra.length) {
      crmFalhas.push(
        `${A.PROJETOS}: ${linhasExtra.length} projeto(s) além da linha ${F.PROJETOS_ULTIMA_LINHA} ` +
        `(PROJETOS_CAPACIDADE em _norman/formulas.js) — invisíveis pro dropdown de ${A.TAREFAS}!B, pro de ${A.DIARIO}!C e pro bloco 📌 PROJETOS de ${A.HOJE}. ` +
        `Linhas: ${linhasExtra.map(x => x.linha).join(', ')}. Suba PROJETOS_CAPACIDADE e rode construir.js + formatar.js de novo.`
      );
    } else {
      console.log(`${A.PROJETOS}: nenhum projeto cadastrado além da linha ${F.PROJETOS_ULTIMA_LINHA} (o alcance que ${A.TAREFAS}!B, ${A.DIARIO}!C e o bloco 📌 de ${A.HOJE} cobrem)`);
    }

    // G0b — `Etapas!projeto` CONTRA `Projetos!A`, no dado VIVO (Onda 14).
    // MESMO defeito de classe que G0 (acima) já cobre pro `Diário`: o elo é
    // igualdade exata de string, sem validação que alcance escrita por API.
    // Uma etapa órfã (projeto digitado com erro de grafia, ou projeto que
    // nunca foi cadastrado) faz `Projetos!etapa atual`/`progresso`/`saúde`
    // nunca contarem essa etapa — em silêncio, exatamente a classe de
    // defeito que este arquivo existe pra pegar.
    {
      const lE = F.LINHAS[A.ETAPAS];
      const iProjeto = F.ETAPAS_CABECALHO.indexOf('projeto');
      const colProjeto = String.fromCharCode(65 + iProjeto);
      const [projetoVivoEtapas, projetosVivos2] = await a.lerVarios([
        `${R(A.ETAPAS)}!${colProjeto}${lE.dados}:${colProjeto}1000`,
        `${R(A.PROJETOS)}!A${F.LINHAS[A.PROJETOS].dados}:A${F.PROJETOS_ULTIMA_LINHA}`
      ]);
      const projetos2 = new Set(projetosVivos2.map(l => String((l || [])[0] || '').trim()).filter(Boolean));
      const linhasEtapas = projetoVivoEtapas
        .map((l, i) => ({ linha: lE.dados + i, valor: String((l || [])[0] || '').trim() }))
        .filter(x => x.valor !== '');
      const orfasEtapas = linhasEtapas.filter(x => !projetos2.has(x.valor));
      console.log(
        `${A.ETAPAS}!${colProjeto}: ${linhasEtapas.length} entrada(s) preenchida(s) - ` +
        `${linhasEtapas.length - orfasEtapas.length} casada(s) com ${A.PROJETOS}!A - ${orfasEtapas.length} orfa(s)`
      );
      if (orfasEtapas.length) {
        crmFalhas.push(
          `${A.ETAPAS}!${colProjeto}: ${orfasEtapas.length} entrada(s) com "projeto" fora de ${A.PROJETOS}!A - ` +
          `${A.PROJETOS}!"etapa atual"/"progresso"/"saúde" nao contam essas etapas, em silencio. ` +
          orfasEtapas.map(x => `linha ${x.linha}: ${JSON.stringify(x.valor)}`).join(' | ') +
          `. Corrija o nome em ${A.ETAPAS} pra bater EXATAMENTE com ${A.PROJETOS}!A.`
        );
      }
      // CONTROLE POSITIVO, mesmo padrão de G0: Etapas preenchida e ZERO
      // projeto lido reprovaria "0 orfas" como resultado de instrumento cego.
      if (linhasEtapas.length && !projetos2.size) {
        crmFalhas.push(
          `CONTROLE do cheque de ${A.ETAPAS}!${colProjeto} FALHOU - ha ${linhasEtapas.length} entrada(s) em Etapas e NENHUM projeto lido em ` +
          `${A.PROJETOS}!A${F.LINHAS[A.PROJETOS].dados}:A${F.PROJETOS_ULTIMA_LINHA}. O veredito acima nao vale nada.`
        );
      }
    }

    // G2 — cabeçalho VIVO bate com o que o gerador assume. Coluna renomeada,
    // reordenada ou apagada à mão na planilha desalinha toda referência por
    // LETRA nas fórmulas/validação/CF — sem erro nenhum, só lendo a peça.
    const CABECALHOS_VIVOS = {
      [A.FILA]: F.FILA_CABECALHO, [A.PROJETOS]: F.PROJETOS_CABECALHO,
      [A.TAREFAS]: F.TAREFAS_CABECALHO, [A.DIARIO]: F.DIARIO_CABECALHO,
      [A.ETAPAS]: F.ETAPAS_CABECALHO
    };
    let cabecalhosOk = 0;
    for (const [aba, esperado] of Object.entries(CABECALHOS_VIVOS)) {
      const ult = String.fromCharCode(64 + esperado.length);
      const lc = F.LINHAS[aba].cabecalho;
      const vivo = (((await a.ler(`${R(aba)}!A${lc}:${ult}${lc}`)).values || [[]])[0] || []);
      if (JSON.stringify(vivo) !== JSON.stringify(esperado)) {
        crmFalhas.push(`${aba}: cabeçalho vivo diverge do esperado.\n  vivo:     ${JSON.stringify(vivo)}\n  esperado: ${JSON.stringify(esperado)}`);
      } else cabecalhosOk++;
    }
    console.log(`cabeçalhos vivos batendo com _norman/formulas.js: ${cabecalhosOk}/${Object.keys(CABECALHOS_VIVOS).length}`);

    // G3 — HOJE: o painel está INTEIRO na tela?
    //
    // A guarda de spill morreu com a estrutura que a exigia (cada grupo é
    // UM `VSTACK`, nenhum título ocupando a linha seguinte pra colidir). O
    // que resta pra vigiar é OUTRA coisa, e não vira erro de fórmula: um
    // sub-bloco pode desaparecer inteiro — `IFERROR` engole a quebra e
    // devolve o texto de estado vazio, que é exatamente o que "não há
    // nada" também devolve. Um bloco quebrado e um bloco vazio ficam
    // IDÊNTICOS na tela.
    //
    // O que separa os dois é o TÍTULO: ele é string literal do `VSTACK`, é
    // impresso com ou sem dado, e só some se o array inteiro tiver morrido.
    // Então o controle é: os seis títulos estão lá, na ordem declarada?
    //
    // C10 Parte 3 (3 grupos desde o conserto 0b) — N GRUPOS de coluna, lado a
    // lado, na MESMA linha. A leitura cobre a largura INTEIRA da aba
    // (`HOJE_ULTIMA_COL`, derivada de `F.HOJE_COLUNAS_ABA.length`) de uma
    // vez; o controle roda uma vez POR GRUPO, lendo a coluna de TÍTULO
    // daquele grupo especificamente
    // (`F.hojeColunaBaseGrupo(g)`) — mesma técnica da camada notícia (C10
    // Parte 2, `noticiaLetra`).
    const painel = (await a.ler(`${R(A.HOJE)}!A${F.LINHAS[A.HOJE].lista}:${HOJE_ULTIMA_COL}${HOJE_ULTIMA_LINHA}`)).values || [];
    const hojeFalhas = [];
    let titulosVistosTotal = 0;
    F.HOJE_GRUPOS_COLUNA.forEach((chaves, g) => {
      const colBase = F.hojeColunaBaseGrupo(g);
      const colunaTitulo = painel.map(l => String((l || [])[colBase] || ''));
      const titulosVistos = colunaTitulo.filter(v => new RegExp(F.HOJE_REGEX_TITULO).test(v));
      titulosVistosTotal += titulosVistos.length;
      chaves.forEach((chave, i) => {
        const b = F.HOJE_BLOCOS.find(bl => bl.chave === chave);
        const esperado = b.titulo;
        if (!colunaTitulo.includes(esperado)) {
          hojeFalhas.push(`${A.HOJE} grupo ${g} (coluna ${F.colunaLetra(colBase)}): o título do bloco ${b.chave} ("${esperado.slice(0, 40)}…") não está na tela — o sub-bloco inteiro morreu, e o IFERROR faz isso parecer "está vazio"`);
        } else if (titulosVistos[i] !== esperado) {
          hojeFalhas.push(`${A.HOJE} grupo ${g} (coluna ${F.colunaLetra(colBase)}): os blocos estão fora da ordem declarada — na posição ${i + 1} está "${String(titulosVistos[i]).slice(0, 30)}…" e devia estar "${esperado.slice(0, 30)}…"`);
        }
      });
    });
    // Cada bloco só existe se todos os sub-arrays tiverem 4 colunas dentro
    // do bloco do SEU grupo. `VSTACK` preenche o que falta com `#N/A` — a
    // varredura genérica pega o `#N/A` em qualquer coluna (A:I, gap
    // incluso: um `#N/A` no vão denunciaria um grupo invadindo o
    // território vizinho), mas aqui o diagnóstico aponta a CAUSA (largura
    // de sub-bloco), que é a única coisa acionável.
    const larguraErrada = painel.filter(l => (l || []).some(c => String(c).includes('#N/A')));
    if (larguraErrada.length) {
      hojeFalhas.push(`${A.HOJE}: ${larguraErrada.length} linha(s) com #N/A no painel — provável sub-bloco do VSTACK com largura diferente de 4 colunas, ou grupo invadindo o vão/território vizinho`);
    }

    // TETO: a contagem REAL de itens de um bloco já ENCOSTOU no limite. A
    // linha "+ N não cabem aqui" só acende quando ULTRAPASSA (n > teto), então
    // "bateu exatamente no teto" não aparece em texto nenhum na tela; é o
    // PRÓXIMO item cadastrado que vai truncar, e ninguém prevê isso olhando.
    //
    // O RADAR ficou DE FORA deste check, e a razão é a natureza do bloco.
    // Tarefas, Fila, Projetos e Diário são CURADORIA: encostar no teto quer
    // dizer que o teto ficou pequeno pro uso real. O radar é recorte TOP-N por
    // desenho — "43 itens em 3 dias" é o funcionamento normal de um coletor
    // que varre cinco fontes, não um sintoma. Manter o radar aqui produzia um
    // alarme que acende todo dia e nunca tem conserto, e alarme que cria lobo é
    // alarme morto. A linha "+ N não cabem" continua acesa lá — ali ela não é
    // aviso de saturação, é a informação de que existe mais e onde ver.
    const SEM_SATURACAO = new Set(['RADAR']);
    // ONDA UX 12 — `Fila!o quê` deixou de morar na coluna C (trocou de
    // lugar com `id`, ver `FILA_CABECALHO` em formulas.js): a leitura passa
    // a cobrir a linha inteira e indexar por RÓTULO, nunca mais por letra
    // literal — a mesma lição que `CLASSE_POR_ROTULO` (mais abaixo) já
    // aplica.
    const ultFila = String.fromCharCode(64 + F.FILA_CABECALHO.length);
    const ixFila = Object.fromEntries(F.FILA_CABECALHO.map((r, i) => [r, i]));
    const [tarefasVivas, filaViva, projetosVivos, diarioVivo] = await Promise.all([
      a.ler(`${R(A.TAREFAS)}!A${F.LINHAS[A.TAREFAS].dados}:E1000`),
      a.ler(`${R(A.FILA)}!A${F.LINHAS[A.FILA].dados}:${ultFila}1000`),
      a.ler(`${R(A.PROJETOS)}!A${F.LINHAS[A.PROJETOS].dados}:A${F.PROJETOS_ULTIMA_LINHA}`),
      a.ler(`${R(A.DIARIO)}!A${F.LINHAS[A.DIARIO].dados}:D2000`)
    ]);
    const contagensHoje = {
      TAREFAS: (tarefasVivas.values || []).filter(r => (r[0] || '') !== '' && (r[2] || '') !== '✅ feita').length,
      FILA: (filaViva.values || []).filter(r => (r[ixFila['o quê']] || '') !== '' && !F.FILA_ESTAGIOS_FORA_DO_HOJE.includes(r[ixFila.estágio] || '')).length,
      PROJETOS: (projetosVivos.values || []).filter(r => (r[0] || '') !== '').length,
      DIARIO: (diarioVivo.values || []).filter(r => (r[3] || '') !== '').length
    };
    const hojeSaturados = Object.keys(contagensHoje)
      .filter(chave => !SEM_SATURACAO.has(chave) && contagensHoje[chave] >= F.HOJE_TETOS[chave])
      .map(chave => `${chave}: ${contagensHoje[chave]} item(ns) reais >= teto ${F.HOJE_TETOS[chave]} (HOJE_TETO_${chave} em formulas.js) — o próximo item cadastrado vai truncar; considere subir o teto`);

    console.log('\n=== HOJE — blocos e teto ===');
    console.log(`blocos na tela: ${titulosVistosTotal}/${F.HOJE_BLOCOS.length} em ${F.HOJE_GRUPOS_COLUNA.length} grupo(s) ` +
      `(${F.HOJE_GRUPOS_COLUNA.map(g => g.join('+')).join(' | ')})`);
    if (hojeFalhas.length) console.log('BLOCOS:\n' + hojeFalhas.join('\n'));
    if (hojeSaturados.length) console.log('TETO:\n' + hojeSaturados.join('\n'));
    else console.log('teto: nenhum bloco de curadoria encostado no limite (' +
      Object.entries(contagensHoje).map(([k, v]) => `${k} ${v}/${F.HOJE_TETOS[k]}`).join(', ') +
      '; RADAR fora do check por desenho)');
    crmFalhas.push(...hojeFalhas, ...hojeSaturados);

    // G4 — GRADE QUASE CHEIA. `values.update` numa faixa maior que o
    // `rowCount` NÃO trunca: ERRA. E quem faz essa escrita é o sync, sozinho,
    // de madrugada — o piso é estático e o store já pulou 175% de uma vez.
    // Reprova em 80% pra que sobre folga de manobra, não pra que o aviso
    // chegue junto com a quebra.
    const OCUPACAO_MAX = 0.8;
    const OCUPACAO = [
      [A.DADOS, 'A', F.LINHAS[A.DADOS].dados],
      [A.FILA, 'B', F.LINHAS[A.FILA].dados],
      [A.TAREFAS, 'A', F.LINHAS[A.TAREFAS].dados],
      [A.DIARIO, 'A', F.LINHAS[A.DIARIO].dados]
    ];
    console.log('\n=== GRADE ===');
    for (const [aba, col, primeira] of OCUPACAO) {
      const total = (gradeDe[aba] || {}).rowCount || 0;
      const usadas = ((await a.ler(`${R(aba)}!${col}${primeira}:${col}${total}`)).values || [])
        .filter(l => String((l || [])[0] || '').trim() !== '').length + (primeira - 1);
      const pct = total ? Math.round((usadas / total) * 100) : 0;
      if (total && usadas / total > OCUPACAO_MAX) {
        crmFalhas.push(`⚠️ Grade quase cheia: ${pct}% de ${total} linhas usadas em ${aba}. Aumente rowCount antes do próximo sync.`);
      } else console.log(`${aba}: ${usadas}/${total} linhas (${pct}%)`);
    }

    // G5 — ORÇAMENTO DE COR. A spec visual declara o limite como número: se
    // mais de 15% das linhas visíveis de uma aba acenderem fundo de estado, o
    // LIMIAR da regra está errado — não a peça. É o que impede a regra de
    // prazo de virar a parede de cor que a Lei da Faixa acabou de derrubar.
    //
    // Os predicados são reimplementados em Node contra os MESMOS dados, e são
    // provados com controle positivo e negativo ANTES de medir: sem isso, "0%"
    // pode significar "nenhuma tarefa vencida" ou "o medidor está quebrado", e
    // os dois passam em auditoria de leitura igualzinho.
    const hojeMs = new Date(); hojeMs.setHours(0, 0, 0, 0);
    const comoData = v => { const d = new Date(String(v).split('/').reverse().join('-')); return isNaN(d) ? null : d; };
    const vencida = r => { const p = comoData(r[4]); return !!p && p < hojeMs && r[2] !== '✅ feita'; };
    const vencendo = r => { const p = comoData(r[4]); return !!p && p >= hojeMs && (p - hojeMs) / 86400000 <= 2 && r[2] !== '✅ feita'; };
    const ONTEM = new Date(hojeMs.getTime() - 86400000), AMANHA = new Date(hojeMs.getTime() + 86400000), LONGE = new Date(hojeMs.getTime() + 30 * 86400000);
    const dd = d => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    const cfFalhas = [];
    if (!vencida(['x', '', '⬜ aberta', '', dd(ONTEM)])) cfFalhas.push('CONTROLE POSITIVO de "tarefa vencida" FALHOU — o medidor de orçamento de cor está quebrado');
    if (vencida(['x', '', '⬜ aberta', '', dd(LONGE)])) cfFalhas.push('CONTROLE NEGATIVO de "tarefa vencida" FALHOU — uma tarefa futura acende');
    if (vencida(['x', '', '✅ feita', '', dd(ONTEM)])) cfFalhas.push('CONTROLE NEGATIVO de "tarefa vencida" FALHOU — uma tarefa FEITA acende');
    if (!vencendo(['x', '', '⬜ aberta', '', dd(AMANHA)])) cfFalhas.push('CONTROLE POSITIVO de "vence em <= 2 dias" FALHOU');
    if (vencendo(['x', '', '⬜ aberta', '', dd(LONGE)])) cfFalhas.push('CONTROLE NEGATIVO de "vence em <= 2 dias" FALHOU');
    const linhasTarefa = (tarefasVivas.values || []).filter(r => (r[0] || '') !== '');
    const acesas = linhasTarefa.filter(r => vencida(r) || vencendo(r)).length;
    const pctCor = linhasTarefa.length ? acesas / linhasTarefa.length : 0;
    console.log('\n=== ORÇAMENTO DE COR ===');
    console.log(`controles do medidor: ${cfFalhas.length ? 'FALHARAM' : 'positivo e negativo passaram'}`);
    console.log(`${A.TAREFAS}: ${acesas}/${linhasTarefa.length} linha(s) com fundo de estado (${Math.round(pctCor * 100)}%, teto 15%)`);
    if (linhasTarefa.length >= 5 && pctCor > 0.15) {
      cfFalhas.push(`${A.TAREFAS}: ${Math.round(pctCor * 100)}% das linhas acendem fundo de estado (teto 15%). O LIMIAR da regra está errado, não a peça — reveja os 2 dias de R-P2 em _norman/formatar.js.`);
    }

    // Onda 18-20 — MESMA disciplina, estendida a `Candidaturas`. Ela ganhou
    // fundo S1 (Onda 5-6, `formatar.js` ~linha 793) no mesmo dispositivo que
    // `Tarefas` já usa pra prazo — "aguardando há > limiar". Sem este check,
    // ela era a única aba com cor de ALARME (não de recuo/esmaecimento) fora
    // do orçamento: cor que acende em toda linha some como sinal, e a Onda 5-6
    // nunca tinha essa régua porque `Candidaturas` nasceu vazia.
    const candidaturaAcende = r => {
      const dias = Number(r[4]);
      return Number.isFinite(dias) && dias > F.CANDIDATURAS_LIMIAR_AGUARDANDO_DIAS;
    };
    const ctrlCandFalhas = [];
    if (!candidaturaAcende(['o', 'v', 't', 'i', String(F.CANDIDATURAS_LIMIAR_AGUARDANDO_DIAS + 1)])) {
      ctrlCandFalhas.push('CONTROLE POSITIVO de "aguardando > limiar" FALHOU — o medidor de orçamento de cor de Candidaturas está quebrado');
    }
    if (candidaturaAcende(['o', 'v', 't', 'i', String(F.CANDIDATURAS_LIMIAR_AGUARDANDO_DIAS)])) {
      ctrlCandFalhas.push('CONTROLE NEGATIVO de "aguardando > limiar" FALHOU — o limiar exato (não estritamente maior) já acende');
    }
    if (candidaturaAcende(['o', 'v', 't', 'i', ''])) {
      ctrlCandFalhas.push('CONTROLE NEGATIVO de "aguardando > limiar" FALHOU — linha sem "aguardando" (candidatura fora do radar) acende');
    }
    const lCand = F.LINHAS[A.CANDIDATURAS].lista;
    const candVivas = ((await a.ler(`${R(A.CANDIDATURAS)}!A${lCand}:I${lCand + 1000}`)).values || [])
      .filter(r => (r[0] || '') !== '' && !String(r[0]).startsWith(F.MARCADOR_VAZIO));
    const candAcesas = candVivas.filter(candidaturaAcende).length;
    const pctCand = candVivas.length ? candAcesas / candVivas.length : 0;
    console.log(`controles do medidor (${A.CANDIDATURAS}): ${ctrlCandFalhas.length ? 'FALHARAM' : 'positivo e negativo passaram'}`);
    console.log(`${A.CANDIDATURAS}: ${candAcesas}/${candVivas.length} linha(s) com fundo de estado (${Math.round(pctCand * 100)}%, teto 15%)`);
    if (candVivas.length >= 5 && pctCand > 0.15) {
      ctrlCandFalhas.push(`${A.CANDIDATURAS}: ${Math.round(pctCand * 100)}% das linhas acendem fundo de estado (teto 15%). O LIMIAR (CANDIDATURAS_LIMIAR_AGUARDANDO_DIAS em _norman/formulas.js) está errado, não a peça.`);
    }
    cfFalhas.push(...ctrlCandFalhas);

    // ---- ORÇAMENTO DE COR (ONDA UX 9) — GLIFO, não só FUNDO ----
    //
    // Os dois blocos acima (`Tarefas`, `Candidaturas`) só medem aba que
    // sinaliza por FUNDO (S1/S2). `Projetos!saúde` sinaliza por GLIFO
    // (🔴/🟠/⚪/🟢), texto sem cor de fundo nenhuma — e por isso passava
    // INTEIRA pelo orçamento mesmo em 100% "🔴 parado" (AVALIACAO-UX.md
    // Parte 2 §3: "o orçamento mede o mecanismo, não o sinal"; Parte 4 §3:
    // "sinal aceso em 100% da população é defeito, não estilo"). Mesma
    // disciplina, mesmo teto 15%, mesmo par de controles antes de medir.
    //
    // O QUE CONTA COMO "aceso": 🔴 (atrasado/parado) e 🟠 (sem rumo) — os
    // dois estados que pedem AÇÃO de JB. `⚪ sem sinal` (D-A1 — ausência de
    // dado, não "parado") e `🟢 em dia` NÃO contam, nem "—" (entregue, a
    // saúde não se aplica). A fixture "com o dado antigo" que prova que
    // este medidor REPROVARIA antes da Onda 10 (quando `⚪` não existia e
    // tudo colapsava em `🔴`) mora em
    // `tests/onda-ux-9-orcamento-glifo.test.js`, não aqui — aqui é só o
    // instrumento ao vivo, contra o dado de HOJE.
    const saudeAcende = v => /^🔴|^🟠/.test(String(v || ''));
    const ctrlSaudeFalhas = [];
    if (!saudeAcende('🔴 parado')) ctrlSaudeFalhas.push('CONTROLE POSITIVO do medidor de glifo (saúde) FALHOU — "🔴 parado" deveria acender');
    if (!saudeAcende('🔴 atrasado')) ctrlSaudeFalhas.push('CONTROLE POSITIVO do medidor de glifo (saúde) FALHOU — "🔴 atrasado" deveria acender');
    if (!saudeAcende('🟠 sem rumo')) ctrlSaudeFalhas.push('CONTROLE POSITIVO do medidor de glifo (saúde) FALHOU — "🟠 sem rumo" deveria acender');
    if (saudeAcende('⚪ sem sinal')) ctrlSaudeFalhas.push('CONTROLE NEGATIVO do medidor de glifo (saúde) FALHOU — "⚪ sem sinal" (D-A1, ausência de dado) não pode contar como aceso');
    if (saudeAcende('🟢 em dia')) ctrlSaudeFalhas.push('CONTROLE NEGATIVO do medidor de glifo (saúde) FALHOU — "🟢 em dia" não pode contar como aceso');
    if (saudeAcende('—')) ctrlSaudeFalhas.push('CONTROLE NEGATIVO do medidor de glifo (saúde) FALHOU — "—" (entregue) não pode contar como aceso');

    const colSaude = F.letraDe(F.PROJETOS_CABECALHO, 'saúde');
    const iSaude = colSaude.charCodeAt(0) - 65;
    const projetosSaudeVivos = ((await a.ler(`${R(A.PROJETOS)}!A${F.LINHAS[A.PROJETOS].dados}:${colSaude}${F.PROJETOS_ULTIMA_LINHA}`)).values || [])
      .filter(r => (r[0] || '') !== '');
    const saudeAcesas = projetosSaudeVivos.filter(r => saudeAcende(r[iSaude])).length;
    const pctSaude = projetosSaudeVivos.length ? saudeAcesas / projetosSaudeVivos.length : 0;
    console.log(`controles do medidor de glifo (${A.PROJETOS}!saúde): ${ctrlSaudeFalhas.length ? 'FALHARAM' : 'positivo e negativo passaram'}`);
    console.log(`${A.PROJETOS}!saúde: ${saudeAcesas}/${projetosSaudeVivos.length} linha(s) com sinal aceso (🔴/🟠) (${Math.round(pctSaude * 100)}%, teto 15%)`);
    // Teto de amostra em 2, não 5 (o piso das outras duas abas): `Projetos`
    // tem capacidade DECLARADA de 20 (`PROJETOS_CAPACIDADE`) e portfólio de
    // frente viva é naturalmente pequeno — esperar 5 projetos cadastrados
    // pra este medidor acordar deixaria exatamente o caso real de hoje (2
    // projetos) fora do alcance dele.
    if (projetosSaudeVivos.length >= 2 && pctSaude > 0.15) {
      ctrlSaudeFalhas.push(
        `${A.PROJETOS}!saúde: ${Math.round(pctSaude * 100)}% das linhas acendem 🔴/🟠 (teto 15%). ` +
        'Onda UX 9 — o orçamento agora cobre GLIFO, não só fundo; se isto reprovar, o defeito é REAL (ver D-A1/Onda 10 em _norman/formulas.js PROJETOS_SAUDE), não do medidor.'
      );
    }
    cfFalhas.push(...ctrlSaudeFalhas);

    crmFalhas.push(...cfFalhas);

    // ============ SINAL DE ESTADO: O CÓDIGO CONTRA O RÓTULO ============
    //
    // O defeito que motivou tudo isto: a regra de esmaecimento de `Empregos`
    // casava `REGEXMATCH($C;"⚪|🗄")` e o dado emitia `❓ sem data`. Três linhas
    // saíam em PRETO CHEIO no meio de uma página inteira de cinza — o canal
    // visual dizendo o contrário do que significa, sem erro em lugar nenhum,
    // em 3 de 544 linhas.
    //
    // A regra agora lê o CÓDIGO DE ESTADO (`INT(_ordem/FATOR)`), não o rótulo.
    // Este controle é o que fecha o laço: para CADA linha viva das três abas
    // de radar, computa o veredito NUMÉRICO em Node e compara com a classe que
    // o EMOJI declara. Uma linha em que os dois discordem reprova o processo.
    //
    // É a diferença entre "a fórmula está escrita certo" e "a peça diz a
    // verdade sobre o dado que ela tem hoje" — e foi exatamente essa segunda
    // pergunta que ninguém tinha feito.
    console.log('\n=== SINAL DE ESTADO (código × rótulo) ===');
    const sinalFalhas = [];
    // Classe declarada pelo RÓTULO, por aba. Nenhuma destas listas entra em
    // fórmula nenhuma: elas existem só aqui, pra desmentir o número.
    const CLASSE_POR_ROTULO = [
      {
        aba: A.EMPREGOS, corte: F.BALDE_ARQUIVO, cab: F.MERCADO_CABECALHO, rotulo: 'Publicada',
        recua: v => /⚪|🗄|❓ sem data/.test(v)
      },
      {
        aba: A.PAINEL, corte: F.TIER_FORA_DO_ALCANCE, cab: F.DOCENTE_CABECALHO, rotulo: 'Elegível?',
        // tier >= 3 = "só com doutorado" OU qualquer coisa sem prazo. Na
        // `Concursos` (corte tier<=6) o rótulo que separa é a elegibilidade,
        // mais a `Situação` de sem-prazo.
        recua: (v, linha, ix) => /🎓 só com doutorado/.test(v) || /⚠/.test(String(linha[ix.Situação] || ''))
      },
      {
        aba: A.TUDO, corte: F.TIER_ENCERRADO, cab: F.DOCENTE_CABECALHO, rotulo: 'Situação',
        recua: v => /🔴|⚠/.test(v)
      }
    ];
    for (const t of CLASSE_POR_ROTULO) {
      const ult = String.fromCharCode(64 + t.cab.length);
      const l0 = F.LINHAS[t.aba].lista;
      const ix = Object.fromEntries(t.cab.map((r, i) => [r, i]));
      const iOrdem = ix._ordem, iRot = ix[t.rotulo];
      const linhas = ((await a.ler(`${R(t.aba)}!A${l0}:${ult}5000`)).values || [])
        .filter(l => String((l || [])[iOrdem] || '') !== '');
      let divergentes = 0, recuadas = 0;
      const exemplos = [];
      linhas.forEach((l, i) => {
        const ordem = Number(l[iOrdem]);
        if (!Number.isFinite(ordem)) return;
        const porCodigo = Math.floor(ordem / F.ORDEM_FATOR) >= t.corte;
        const porRotulo = !!t.recua(String(l[iRot] || ''), l, ix);
        if (porCodigo) recuadas++;
        if (porCodigo !== porRotulo) {
          divergentes++;
          if (exemplos.length < 3) exemplos.push(`linha ${i + l0}: código diz ${porCodigo ? 'RECUA' : 'não recua'} e o rótulo "${String(l[iRot] || '').slice(0, 30)}" diz ${porRotulo ? 'RECUA' : 'não recua'}`);
        }
      });
      console.log(`${t.aba}: ${linhas.length} linha(s) · ${recuadas} recuada(s) pelo código · ${divergentes} divergência(s) contra o rótulo`);
      if (divergentes) {
        sinalFalhas.push(
          `${t.aba}: o código de estado e o rótulo discordam em ${divergentes} linha(s) — ` +
          'é o D4 de volta, com o sinal invertido. ' + exemplos.join(' | ')
        );
      }
      // CONTROLE POSITIVO da própria régua: se NENHUMA linha recua, o corte
      // pode estar errado e ninguém saberia — "0 divergências" sobre 0 linhas
      // acesas é o resultado que um instrumento quebrado também dá.
      if (linhas.length >= 20 && recuadas === 0) {
        sinalFalhas.push(`${t.aba}: ${linhas.length} linhas e NENHUMA recua. O corte (${t.corte}) provavelmente está errado — ou a coluna _ordem parou de ser numérica.`);
      }
    }

    // ---- O GATILHO DO ALARME, contra a REGRA VIVA da planilha ----
    // Não basta que `formatar.js` e `formulas.js` concordem no código: o que
    // pinta é a regra que está INSTALADA. Se um `formatar.js` antigo tiver
    // deixado uma regra com o glifo velho, o alarme não acende e nada quebra.
    const cfMeta = await a.api('?includeGridData=false&fields=sheets(properties(title),conditionalFormats(ranges,booleanRule(condition(values(userEnteredValue)))))');
    const regrasDe = {};
    (cfMeta.sheets || []).forEach(sh => {
      regrasDe[sh.properties.title] = (sh.conditionalFormats || [])
        .map(r => (((r.booleanRule || {}).condition || {}).values || [])[0])
        .filter(Boolean).map(v => v.userEnteredValue);
    });
    let alarmesOk = 0;
    const ABAS_ALARME = Object.keys(F.ALARME_ABAS);
    for (const aba of ABAS_ALARME) {
      const esperada = F.alarmeCF(F.ALARME_ABAS[aba]);
      const instaladas = regrasDe[aba] || [];
      if (instaladas.includes(esperada)) alarmesOk++;
      else {
        sinalFalhas.push(
          `${aba}: não há regra condicional de alarme com o gatilho vivo esperado. ` +
          `Esperada: ${JSON.stringify(esperada.slice(0, 160))}… · instaladas: ${JSON.stringify(instaladas.map(x => String(x).slice(0, 60)))}. ` +
          'Sem ela o aviso de robô parado acende SEM COR NENHUMA — o silêncio exatamente onde ele é fatal.'
        );
      }
      // E o gatilho NAO pode ser um glifo em aba nenhuma: casar emoji e a
      // classe que o D4 derrubou, e ela reapareceu aqui uma vez.
      const porGlifo = instaladas.filter(x => String(x).includes(F.GLIFO_ALARME));
      if (porGlifo.length) {
        sinalFalhas.push(
          `${aba}: ha ${porGlifo.length} regra(s) condicional(is) casando o GLIFO ${F.GLIFO_ALARME}. ` +
          'Gatilho de alarme e ESTADO (numero), nunca rotulo - uma reescrita da mensagem apagaria a cor sem erro nenhum.'
        );
      }
    }
    // COBERTURA, contada contra a lista de abas de VISTA e nao contra si
    // mesma: "instalado em 4/4" era verdade enquanto 8 abas nao estavam na
    // lista. Um denominador que se ajusta ao numerador nao mede nada.
    const vistas = [A.HOJE, ...Object.keys(F.NAV)];
    const semCanal = vistas.filter(x => !F.ALARME_ABAS[x]);
    if (semCanal.length) {
      sinalFalhas.push(`aba(s) de vista fora de F.ALARME_ABAS: ${semCanal.join(', ')} - elas nao tem canal de alarme nenhum`);
    }
    console.log(`abas de vista: ${vistas.length} - com canal de alarme declarado: ${vistas.length - semCanal.length}`);
    // E a outra ponta: quem ESCREVE o gatilho. Se `AVISO_SYNC` deixar de
    // emitir o glifo, a regra continua instalada e nunca mais casa.
    const ramos = F.AVISO_SYNC.split(F.GLIFO_ALARME).length - 1;
    if (ramos !== F.ALARME_RAMOS) {
      sinalFalhas.push(`AVISO_SYNC emite o gatilho ${ramos} vez(es) e ALARME_RAMOS declara ${F.ALARME_RAMOS} — um ramo do alarme perdeu a cor`);
    }
    const ramosPortal = F.AVISO_SYNC_PORTAL.split(F.GLIFO_ALARME).length - 1;
    if (ramosPortal !== F.ALARME_RAMOS_PORTAL) {
      sinalFalhas.push(`AVISO_SYNC_PORTAL emite o sinal ${ramosPortal} vez(es) e ALARME_RAMOS_PORTAL declara ${F.ALARME_RAMOS_PORTAL}`);
    }
    const ramosNoticia = F.AVISO_SYNC_NOTICIA.split(F.GLIFO_ALARME).length - 1;
    if (ramosNoticia !== F.ALARME_RAMOS_NOTICIA) {
      sinalFalhas.push(`AVISO_SYNC_NOTICIA emite o sinal ${ramosNoticia} vez(es) e ALARME_RAMOS_NOTICIA declara ${F.ALARME_RAMOS_NOTICIA}`);
    }
    console.log(`regra de alarme (gatilho por ESTADO, nao por glifo) instalada em ${alarmesOk}/${ABAS_ALARME.length} aba(s)`);
    console.log(`sinal ${JSON.stringify(F.GLIFO_ALARME)} nos textos: AVISO_SYNC ${ramos}/${F.ALARME_RAMOS} - AVISO_SYNC_NOTICIA ${ramosNoticia}/${F.ALARME_RAMOS_NOTICIA} - AVISO_SYNC_PORTAL ${ramosPortal}/${F.ALARME_RAMOS_PORTAL}`);
    if (sinalFalhas.length) crmFalhas.push(...sinalFalhas);

    if (crmFalhas.length) {
      console.log('\nFALHAS DA CAMADA CRM:\n' + crmFalhas.join('\n'));
      falhas.push(...crmFalhas);
    }

    // Instrumento que só RELATA depende de alguém ler o relatório. Este aborta.
    if (achados.length || vazou.length || falhas.length) process.exitCode = 1;
  })().catch(e => { console.error('ERRO', e.message); process.exit(1); });
}
