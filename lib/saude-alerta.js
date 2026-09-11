'use strict';

const saude = require('./saude');
const telegram = require('./telegram');

/**
 * Avalia a saúde de uma coleta, registra no log (lib/saude.js) e dispara o
 * alerta de saúde (canal separado do alerta de vaga — item 3 do briefing
 * Onda 1.5) quando fora do normal. Isolado do CLI (radar.js) pra ser
 * testável sem depender de process.argv/main() — ver tests/saude-alerta.test.js
 * para o teste que PROVA que resposta vazia/erro gera alerta.
 */
async function avaliarRegistrarEAlertar({
  fonte,
  dataAlvo,
  volumeBruto,
  erro,
  faixaMin,
  alertar,
  token,
  chatId,
  dryRun,
  saudePath
}) {
  const avaliacao = saude.avaliar({ volumeBruto, erro, faixaMin, dataAlvo });
  saude.registrar(
    { fonte, dataAlvo: dataAlvo || 'hoje', volumeBruto, erro, nivel: avaliacao.nivel, motivo: avaliacao.motivo },
    saudePath
  );

  let alertaEnviado = null;
  if (!avaliacao.ok && alertar) {
    const mensagem = telegram.formatarAlertaSaude({
      fonte,
      dataAlvo: dataAlvo || 'hoje',
      volumeBruto,
      motivo: avaliacao.motivo,
      nivel: avaliacao.nivel
    });
    alertaEnviado = await telegram.enviar(mensagem, { token, chatId, dryRun });
  }

  return { avaliacao, alertaEnviado };
}

module.exports = { avaliarRegistrarEAlertar };
