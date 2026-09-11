'use strict';

const crypto = require('crypto');

/**
 * Instrumentação POSITIVA dos estágios do pipeline que descartam registro
 * (briefing: "o controle que pega esse bug é o POSITIVO — mostrar quanto
 * passou sobre quanto havia — não o negativo"). Sem isto, cada estágio só
 * incrementava um contador de `descartados` agregado — quando a aba
 * `Empregos` mostra 3 vagas, JB não distinguia "existiam 3" de "existiam 300
 * e o filtro comeu 297".
 *
 * Doutrina (pinloop-cli, MIT — src/shared/coverage.ts + src/shared/filter.ts,
 * reimplementada aqui sem instalar nada):
 *
 *   - Forma canônica: `{ unidade: string, covered: number, total: number }`,
 *     inteiros CRUS. `unidade` é dado de PRIMEIRA CLASSE — não uma convenção
 *     no texto do rótulo do log (achado real, Onda cobertura-2: a rodada ao
 *     vivo produziu "38 passaram o gate... 40 chegaram ao fim", 33 ITENS
 *     (edital único) somados a 7 LINHAS de subedital — unidades diferentes
 *     que só pareciam somáveis porque nada no dado dizia o contrário). Todo
 *     `{covered,total}` que sai deste módulo carrega `unidade` ao lado —
 *     sem ela, `validarCoverage` recusa antes de chegar em qualquer conta.
 *   - NUNCA reduzidos — 249 de 250 fica 249/250, 996 de 1000 fica 996/1000.
 *   - Sem nada a cobrir, a resposta é `0/0 <unidade>` — nunca uma divisão
 *     que ninguém faz (a razão numérica, se alguém precisar dela, é conta
 *     da camada de apresentação — este módulo nunca divide).
 *   - Separador de milhar é trabalho da camada de APRESENTAÇÃO — este módulo
 *     nunca formata com separador, só `${covered}/${total} ${unidade}` cru.
 *   - Cada descarte carrega `{ id, reason }` — a regra que matou o item, não
 *     uma contagem agregada.
 *   - O instrumento ABORTA SOZINHO: `covered > total`, negativo, não-inteiro,
 *     `unidade` ausente/vazia, OU `somar()` entre unidades DIFERENTES é erro
 *     duro (throw), nunca um warning que passa batido — ver `validarCoverage`
 *     e `somar`.
 *   - Nada aqui abre conexão, lê credencial ou escreve SQL — puro cálculo
 *     sobre números e strings já em memória.
 */

/**
 * Guarda-chuva de validação — chamado sempre que um `{ unidade, covered,
 * total }` sai deste módulo (via `novoContador().resultado()`, `formatar` ou
 * `somar`). Lança (nunca retorna false/undefined) quando o objeto é
 * estruturalmente impossível: isso é bug de instrumentação, não dado de
 * produção a silenciar. `unidade` entra na mesma régua dura que
 * covered/total — omiti-la é tão inválido quanto um `covered` fracionário.
 */
function validarCoverage({ unidade, covered, total } = {}) {
  if (typeof unidade !== 'string' || unidade.trim() === '') {
    throw new Error(
      `coverage inválido: unidade é obrigatória e precisa ser string não-vazia (unidade=${JSON.stringify(unidade)}) — ` +
        'sem ela, "covered/total" não diz o que está contando (itens? linhas? publicações?).'
    );
  }
  if (!Number.isInteger(covered) || !Number.isInteger(total)) {
    throw new Error(
      `coverage inválido: covered/total precisam ser inteiros crus (covered=${JSON.stringify(covered)} total=${JSON.stringify(total)})`
    );
  }
  if (covered < 0 || total < 0) {
    throw new Error(`coverage inválido: covered/total nunca podem ser negativos (covered=${covered} total=${total})`);
  }
  if (covered > total) {
    throw new Error(`coverage inválido: covered (${covered}) não pode ser maior que total (${total})`);
  }
  return true;
}

/**
 * "covered/total unidade" cru, sem separador de milhar (isso é apresentação,
 * fora daqui — README/briefing). Valida antes de formatar: nunca imprime um
 * objeto inválido só porque "é só um log" — e a unidade SEMPRE aparece, pra
 * quem lê na tela saber se são vagas, linhas de subedital ou publicações
 * brutas sem abrir o código.
 */
function formatar(cov) {
  validarCoverage(cov);
  return `${cov.covered}/${cov.total} ${cov.unidade}`;
}

/**
 * Soma dois coverages da MESMA unidade (ex.: estágio 1 de duas fontes
 * distintas, mesmo tipo de item avaliado) — usado para agregar a cadeia
 * inteira do pipeline num número só, além do por-fonte. Concatena as listas
 * de descarte (nunca perde `{ id, reason }` ao agregar).
 *
 * ABORTA (throw) quando `a.unidade !== b.unidade` — essa é a régua que faltava
 * (achado real, ver cabeçalho do arquivo): somar 33 ITENS com 7 LINHAS de
 * subedital produz um "40" que passa despercebido porque o número sozinho
 * não denuncia a mistura. Nunca soma "por sorte" — ou as unidades batem, ou
 * estoura, sempre.
 */
function somar(a, b) {
  validarCoverage(a);
  validarCoverage(b);
  if (a.unidade !== b.unidade) {
    throw new Error(
      `coverage inválido: não posso somar unidades diferentes ("${a.unidade}" vs "${b.unidade}") — ` +
        'cada unidade soma só com ela mesma (ex.: itens com itens, linhas de subedital com linhas de subedital).'
    );
  }
  return {
    unidade: a.unidade,
    covered: a.covered + b.covered,
    total: a.total + b.total,
    descartes: [...(a.descartes || []), ...(b.descartes || [])]
  };
}

/**
 * Acumulador stateful de um estágio único: cada item observado chama
 * `registrar(passou, descarte)` exatamente uma vez — `descarte` (obrigatório
 * quando `passou` é false) é `{ id, reason }`, nunca uma contagem agregada.
 * `unidade` é OBRIGATÓRIA no construtor (string não-vazia — ex. `'itens'`,
 * `'linhas_subedital'`) — quem cria um contador sem dizer o que está contando
 * já erra na hora de criar, não só na hora de somar errado depois.
 * `resultado()` fecha o objeto e valida (erro duro se o acumulador ficou num
 * estado impossível — não deveria, por construção, mas o instrumento não
 * confia na própria construção sem checar).
 */
function novoContador(unidade) {
  if (typeof unidade !== 'string' || unidade.trim() === '') {
    throw new Error(`novoContador exige "unidade" (string não-vazia) — recebido ${JSON.stringify(unidade)}`);
  }
  let total = 0;
  let covered = 0;
  const descartes = [];

  return {
    registrar(passou, descarte) {
      total += 1;
      if (passou) {
        covered += 1;
      } else {
        descartes.push(descarte || { id: null, reason: 'motivo_nao_informado' });
      }
      return passou;
    },
    resultado() {
      const cov = { unidade, covered, total, descartes: descartes.slice() };
      validarCoverage(cov);
      return cov;
    }
  };
}

/**
 * Id PROVISÓRIO de descarte para um item que ainda não passou por
 * `fonte.normalizarParcial()` (estágio 1 do docente/mercado roda sobre o
 * rawItem cru — não existe URL/hash de registro ainda nesse ponto, e criar
 * um exigiria mudar o contrato de `fontes/*.js`, fora de escopo desta obra).
 * Hash estável (não-criptográfico em propósito, só identidade) do blob de
 * texto já usado pelo próprio filtro (`fonte.textoParaFiltro(rawItem)`) —
 * serve só para CORRELACIONAR o mesmo descarte entre logs, nunca é o `id`
 * final de registro (esse continua sendo `lib/hash.js gerarId`, inalterado).
 */
function idProvisorio(texto) {
  return crypto.createHash('sha256').update(String(texto || ''), 'utf8').digest('hex').slice(0, 12);
}

module.exports = { novoContador, validarCoverage, formatar, somar, idProvisorio };
