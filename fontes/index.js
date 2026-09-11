'use strict';

/**
 * Registro de fontes. Onda 2 adiciona fontes aqui SEM tocar em radar.js:
 * cada módulo de fonte exporta { id, nome, coletar, textoParaFiltro,
 * normalizarParcial, enriquecer } — ver README.md §Como adicionar uma fonte
 * nova para o contrato completo e fontes/dou.js como referência de
 * implementação.
 */

const dou = require('./dou');
const gupy = require('./gupy');
const programathor = require('./programathor');
const pci = require('./pci');
const weworkremotely = require('./weworkremotely');
const selecaoacademica = require('./selecaoacademica');
const vagas = require('./vagas');

const listaFontes = [dou, gupy, programathor, pci, weworkremotely, selecaoacademica, vagas];

module.exports = { listaFontes };
