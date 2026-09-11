#!/usr/bin/env node
'use strict';

/**
 * Testa a AMPLIAÇÃO do gate `lib/vaga-docente.js pareceVagaDocente` para
 * reconhecer empregador MUNICIPAL/ESTADUAL de ensino (prefeitura, secretaria
 * de educação, autarquia municipal de ensino) — conserto de 2026-08-27.
 *
 * MEDIÇÃO (coleta seca real da PCI, 2026-08-27, listar_concursos(professores=true),
 * ver `tests/vaga-docente.test.js` para a cobertura federal original que
 * este arquivo NÃO duplica):
 *
 *   - Universo de concursos com orgao batendo prefeitura/câmara municipal/
 *     secretaria de educação/autarquia municipal: 141 concursos, 3624 cargos
 *     individuais.
 *   - ANTES do conserto (RE_INSTITUICAO só federal): 0 cargos municipais
 *     passavam o gate — categoria inteira descartada, mesmo tendo
 *     "professor" e "concurso público" no texto.
 *   - DEPOIS do conserto: 606 cargos passam.
 *   - Dos 606 ganhos, 600 têm "professor"/"docente"/"magistério" no PRÓPRIO
 *     `cargoRaw` (docente real, inequívoco). Os outros 6 só passam porque o
 *     BLOB da PCI (noticiaTitulo + orgao + cargoRaw, ver fontes/pci.js
 *     `textoParaFiltro`) mistura o título da notícia — que fala do concurso
 *     inteiro, não do cargo — com o cargo individual: um concurso guarda-chuva
 *     cuja notícia diz "abre concurso... para professores" faz TODOS os
 *     cargos daquele concurso baterem RE_DOCENTE, inclusive os que não são
 *     docentes (ex.: "AGENTE COMUNITÁRIO DE SAÚDE" do mesmo edital de
 *     Cajamar que também tem "PROFESSOR DE EDUCAÇÃO BÁSICA"). Essa é uma
 *     fragilidade PRÉ-EXISTENTE do formato de blob da PCI (não introduzida
 *     por este conserto — sempre existiu, só ficava invisível porque 0
 *     municipais passavam o gate de instituição antes) — os pares negativos
 *     abaixo fixam esses casos reais como referência, e o comentário do
 *     briefing documenta a taxa: 6/606 = ~1,0%, bem abaixo do limiar de ~20%.
 *
 * Amostra sistemática de 15 cargos reais (passo fixo sobre os 606 ganhos, não
 * escolha a dedo) — 15/15 docentes reais, 0% de ruído na amostra — está
 * transcrita no relatório da onda, não duplicada aqui como teste (a amostra
 * é só evidência estatística; os testes abaixo fixam casos NOMEADOS,
 * positivos e negativos, como regressão).
 */

const assert = require('assert');
const { pareceVagaDocente } = require('../lib/vaga-docente');

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    return true;
  } catch (error) {
    console.log(`  ✗ ${name}`);
    console.error(`    ${error.message}`);
    return false;
  }
}

/** Monta o mesmo blob que fontes/pci.js `textoParaFiltro` monta: noticiaTitulo + orgao + cargoRaw. */
function blobPci(noticiaTitulo, orgao, cargoRaw) {
  return [noticiaTitulo, orgao, cargoRaw].filter(Boolean).join(' \n ');
}

function main() {
  console.log('\n=== vaga-docente-municipal.test.js ===\n');
  let passed = 0;
  let failed = 0;

  const tests = [
    // --- Positivos reais: concurso municipal/estadual de professor (categoria que era 100% descartada) ---

    ['ACEITA concurso municipal de professor — Prefeitura de Estrela/RS, PROFESSOR - INFORMÁTICA (caso real PCI 2026-08-27)', () => {
      const texto = blobPci(
        'Prefeitura de Estrela - RS abre concurso público com salários de até R$ 8.058,13',
        'Prefeitura de Estrela',
        'PROFESSOR - INFORMÁTICA'
      );
      assert.strictEqual(pareceVagaDocente(texto), true);
    }],

    ['ACEITA concurso municipal de professor de educação básica — Prefeitura de Serra Negra/SP (caso real PCI 2026-08-27)', () => {
      const texto = blobPci(
        'Prefeitura de Serra Negra - SP abre concurso público com salários de até R$ 5.571,20',
        'Prefeitura da Estância Hidromineral de Serra Negra',
        'PROFESSOR DE EDUCAÇÃO BÁSICA - INFORMÁTICA'
      );
      assert.strictEqual(pareceVagaDocente(texto), true);
    }],

    ['ACEITA concurso de secretaria MUNICIPAL de educação — SME de São José, PROFESSOR - INFORMÁTICA (caso real PCI 2026-08-27)', () => {
      const texto = blobPci(
        'SME - Secretaria Municipal de Educação de São José publica edital de concurso público para professores',
        'SME - Secretaria Municipal de Educação de São José',
        'PROFESSOR - INFORMÁTICA'
      );
      assert.strictEqual(pareceVagaDocente(texto), true);
    }],

    ['ACEITA concurso de secretaria ESTADUAL de educação — SEDUC, professor de matemática (cargo docente estadual, categoria antes descartada)', () => {
      const texto = blobPci(
        'SEDUC - Secretaria de Estado da Educação abre concurso público para professores da rede estadual',
        'SEDUC - Secretaria de Estado da Educação',
        'PROFESSOR - MATEMÁTICA'
      );
      assert.strictEqual(pareceVagaDocente(texto), true);
    }],

    ['ACEITA processo seletivo de autarquia municipal de ensino para professor', () => {
      const texto =
        'Autarquia Municipal de Ensino de Exemplo abre processo seletivo para professor de educação infantil \n Autarquia Municipal de Ensino de Exemplo \n PROFESSOR - EDUCAÇÃO INFANTIL';
      assert.strictEqual(pareceVagaDocente(texto), true);
    }],

    // --- Pares negativos: o que NÃO pode passar, mesmo com "prefeitura" no órgão ---
    // (regra do briefing: o eixo é o CARGO ser docente, não o empregador ser prefeitura)

    ['REJEITA cargo técnico de prefeitura que só bate keyword de informática (TÉCNICO EM INFORMÁTICA não é professor — caso real PCI, Prefeitura de Anhembi)', () => {
      const texto = blobPci(
        'Prefeitura de Anhembi - SP abre concurso público com salários de até R$ 6.407,17',
        'Prefeitura de Anhembi',
        'TÉCNICO EM INFORMÁTICA'
      );
      assert.strictEqual(pareceVagaDocente(texto), false);
    }],

    ['REJEITA instrutor de laboratório de prefeitura (INSTRUTOR DE INFORMÁTICA não é professor — caso real PCI, Prefeitura de Bariri)', () => {
      const texto = blobPci(
        'Prefeitura de Bariri - SP publica retificações do concurso com salários de até R$ 19.593,52',
        'Prefeitura de Bariri',
        'INSTRUTOR DE LABORATÓRIO DE INFORMÁTICA'
      );
      assert.strictEqual(pareceVagaDocente(texto), false);
    }],

    ['REJEITA agente de informática de prefeitura (AGENTE DE INFORMÁTICA não é professor — caso real PCI, Prefeitura de Tangará)', () => {
      const texto = blobPci(
        'Prefeitura de Tangará - SC publica edital de processo seletivo para diversos cargos',
        'Prefeitura de Tangará',
        'AGENTE DE INFORMÁTICA'
      );
      assert.strictEqual(pareceVagaDocente(texto), false);
    }],

    ['REJEITA merendeira de prefeitura (cargo de apoio, nunca é docente, mesmo com "concurso público" e "prefeitura" no texto)', () => {
      const texto =
        'Prefeitura de Exemplo - MG abre concurso público com diversas vagas \n Prefeitura de Exemplo \n MERENDEIRA';
      assert.strictEqual(pareceVagaDocente(texto), false);
    }],

    ['REJEITA motorista de prefeitura (cargo de apoio, nunca é docente)', () => {
      const texto =
        'Prefeitura de Exemplo - MG abre concurso público com diversas vagas \n Prefeitura de Exemplo \n MOTORISTA';
      assert.strictEqual(pareceVagaDocente(texto), false);
    }],

    ['REJEITA agente administrativo de prefeitura (cargo de apoio, nunca é docente)', () => {
      const texto =
        'Prefeitura de Exemplo - MG abre concurso público com diversas vagas \n Prefeitura de Exemplo \n AGENTE ADMINISTRATIVO';
      assert.strictEqual(pareceVagaDocente(texto), false);
    }],

    // --- Par negativo estrutural: "prefeitura" sozinha não basta sem concurso/processo seletivo no texto ---
    ['REJEITA menção a prefeitura sem "concurso público"/"processo seletivo" no texto (ex.: notícia administrativa qualquer)', () => {
      const texto = 'Prefeitura de Exemplo inaugura nova creche municipal \n Prefeitura de Exemplo \n PROFESSOR - EDUCAÇÃO INFANTIL';
      assert.strictEqual(pareceVagaDocente(texto), false);
    }],

    // --- Regressão nomeada: fragilidade PRÉ-EXISTENTE do blob da PCI (bleed de noticiaTitulo) ---
    // Documentada, não corrigida aqui — fora do escopo deste conserto (o
    // pré-filtro de área de fontes/pci.js já barra "agente comunitário de
    // saúde" na prática, ver cabeçalho deste arquivo). Fixado como teste
    // NOMEADO — quando isolado (sem o bleed do noticiaTitulo do MESMO
    // concurso), o cargo sozinho corretamente NÃO passa.
    ['cargo de apoio de saúde municipal, avaliado ISOLADAMENTE (sem o "para professores" da notícia do concurso-guarda-chuva) — não passa (prova que o gate não confunde área de saúde com docência)', () => {
      const texto = blobPci(
        'Prefeitura de Cajamar - SP retifica concurso público',
        'Prefeitura de Cajamar',
        'AGENTE COMUNITÁRIO DE SAÚDE'
      );
      assert.strictEqual(pareceVagaDocente(texto), false);
    }],

    // --- Regra "cargo ser docente" continua sendo o eixo mesmo com instituição ampliada ---
    ['REJEITA vaga docente-like fora de QUALQUER instituição de ensino reconhecida (nem federal nem municipal/estadual) mesmo com "professor" e "concurso público" no texto', () => {
      const texto = 'CONCURSO PÚBLICO PARA PROFESSOR SUBSTITUTO \n Sindicato dos Metalúrgicos de Exemplo';
      assert.strictEqual(pareceVagaDocente(texto), false);
    }]
  ];

  for (const [name, fn] of tests) {
    if (runTest(name, fn)) passed++;
    else failed++;
  }

  console.log(`\n${passed} passou(aram), ${failed} falhou(aram)\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
