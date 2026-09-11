'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Loader de .env minimalista, sem dependência de `dotenv` (custo zero de
 * pacote). Lê KEY=VALUE por linha, ignora comentários (#) e linhas vazias.
 */
function carregarEnv(envPath = path.join(__dirname, '..', '.env')) {
  if (!fs.existsSync(envPath)) return {};
  const conteudo = fs.readFileSync(envPath, 'utf8');
  const vars = {};
  conteudo.split('\n').forEach(linha => {
    const l = linha.trim();
    if (!l || l.startsWith('#')) return;
    const idx = l.indexOf('=');
    if (idx === -1) return;
    const chave = l.slice(0, idx).trim();
    let valor = l.slice(idx + 1).trim();
    if ((valor.startsWith('"') && valor.endsWith('"')) || (valor.startsWith("'") && valor.endsWith("'"))) {
      valor = valor.slice(1, -1);
    }
    vars[chave] = valor;
    if (process.env[chave] === undefined) process.env[chave] = valor;
  });
  return vars;
}

module.exports = { carregarEnv };
