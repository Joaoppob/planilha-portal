#!/usr/bin/env node
'use strict';

/**
 * Testa o parsing do coletor Vagas.com (fontes/vagas.js) contra a listagem
 * REAL capturada de vagas.com.br/vagas-de-ia em 28/08/2026 (tests/fixtures/
 * vagas-com-listagem-real.html, `lib/http.js` real — nunca
 * `mcp__donsetch__web_fetch`, degradado nesta sessão, ver C8 do plano),
 * sem rede. Padrão de tests/pci-parsing.test.js.
 *
 * Onda do conserto de aderência (09/09/2026) — 4 páginas de DETALHE reais
 * capturadas (mesma disciplina de `tests/programathor-parsing.test.js`:
 * `extrairJobPosting`/`montarEnriquecimento` testados contra fixture, NUNCA
 * chamando `vagas.enriquecer()` de verdade aqui — aquele wrapper faz
 * `http.get` real, então fica de fora do gate offline, coberto por
 * verificação manual/sonda em `tmp/`, não por este arquivo):
 *   - `vagas-com-detalhe-marketing-design.html` — "Analista de Marketing
 *     (Design) Pleno" (RESÍDUO CONHECIDO #1 — título curto não carrega
 *     sinal, descrição completa SIM: "Design Gráfico" nos requisitos)
 *   - `vagas-com-detalhe-monet.html` — "Estagiário(a) de Design/Arte Monet"
 *     (RESÍDUO CONHECIDO #2 — descrição completa cita "Cursando graduação
 *     em Design Gráfico")
 *   - `vagas-com-detalhe-cabeleireira.html` — "Cabeleireira (o) Mei
 *     -Campos" (CONTROLE NEGATIVO real — descrição completa MENCIONA
 *     "design de sobrancelha"/"designer de sobrancelha", risco de falso
 *     positivo citado no briefing; tem que continuar fora mesmo assim)
 *   - `vagas-com-detalhe-carreta.html` — "Operador Equipamento I -
 *     Motorista de Carreta Interna" (CONTROLE NEGATIVO real, sem nenhum
 *     termo de design na descrição completa)
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vagas = require('../fontes/vagas');
const vagaMercado = require('../lib/vaga-mercado');
const scoreMercado = require('../lib/score-mercado');
const keywordsMercadoConfig = require('../config/keywords-mercado.json');

const htmlReal = fs.readFileSync(path.join(__dirname, 'fixtures', 'vagas-com-listagem-real.html'), 'utf8');
const htmlDetalheMarketingDesign = fs.readFileSync(path.join(__dirname, 'fixtures', 'vagas-com-detalhe-marketing-design.html'), 'utf8');
const htmlDetalheMonet = fs.readFileSync(path.join(__dirname, 'fixtures', 'vagas-com-detalhe-monet.html'), 'utf8');
const htmlDetalheCabeleireira = fs.readFileSync(path.join(__dirname, 'fixtures', 'vagas-com-detalhe-cabeleireira.html'), 'utf8');
const htmlDetalheCarreta = fs.readFileSync(path.join(__dirname, 'fixtures', 'vagas-com-detalhe-carreta.html'), 'utf8');

function main() {
  console.log('\n=== vagas-parsing.test.js ===\n');
  let passed = 0;
  let failed = 0;

  const blocosReais = vagas._internal.extrairBlocosVaga(htmlReal);
  const itensReais = blocosReais.map(vagas._internal.parseBlocoVaga).filter(Boolean);

  const tests = [
    ['fonte declara id/nome/trilha corretos', () => {
      assert.strictEqual(vagas.id, 'vagas');
      assert.strictEqual(vagas.trilha, 'mercado');
      assert.ok(vagas.nome.includes('Vagas.com'));
    }],

    ['extrairBlocosVaga acha os 40 cards reais da página capturada', () => {
      assert.strictEqual(blocosReais.length, 40);
    }],

    ['parseBlocoVaga: TODOS os 40 cards reais produzem item válido (nenhum null) — os 4 campos do hash de dedupe (cargo, empresa, data, URL) vêm sem enriquecimento', () => {
      assert.strictEqual(itensReais.length, 40, `esperava 40 itens válidos, achou ${itensReais.length}`);
      for (const item of itensReais) {
        assert.ok(item.name, 'cargo ausente');
        assert.ok(item.careerPageName !== undefined, 'campo empresa ausente (pode ser null, mas o campo deve existir)');
        assert.ok(item.jobUrl.startsWith('https://www.vagas.com.br/vagas/'), `URL fora do padrão: ${item.jobUrl}`);
        assert.ok(item.dataPublicacaoBruta, 'data bruta ausente');
      }
    }],

    ['parseBlocoVaga: item real com local "Cidade / UF" extrai UF corretamente', () => {
      const item = itensReais.find(i => i.idVaga === '2824900');
      assert.ok(item, 'item real (HStern, Rio de Janeiro) não encontrado no fixture');
      assert.strictEqual(item.local, 'Rio de Janeiro / RJ');
      assert.strictEqual(item.uf, 'RJ');
      assert.strictEqual(item.careerPageName, 'HStern');
      assert.strictEqual(item.dataPublicacaoBruta, '10/07/2026');
    }],

    ['parseBlocoVaga: achado real — <div class="tooltip-place"> aninhado dentro de <span class="vaga-local"> não quebra a extração do local (regressão do bug do fetch inicial)', () => {
      const semLocal = itensReais.filter(i => !i.local).length;
      assert.strictEqual(semLocal, 0, `${semLocal} item(ns) real(is) sem local extraído — regressão do bug de <div> aninhado`);
    }],

    ['parseBlocoVaga: "100% Home Office" (sem UF) fica com uf=null, nunca inventa', () => {
      const item = itensReais.find(i => i.local === '100% Home Office');
      assert.ok(item, 'item real "100% Home Office" não encontrado no fixture');
      assert.strictEqual(item.uf, null);
    }],

    ['dataPublicacaoISO: formato numérico DD/MM/AAAA', () => {
      assert.strictEqual(vagas._internal.dataPublicacaoISO('10/07/2026'), '2026-07-10');
      assert.strictEqual(vagas._internal.dataPublicacaoISO('05/08/2026'), '2026-08-05');
    }],

    ['dataPublicacaoISO: "Há N dias" resolve contra uma data fixa de referência (não contra o relógio real — testável)', () => {
      const referencia = new Date('2026-08-28T12:00:00Z');
      assert.strictEqual(vagas._internal.dataPublicacaoISO('Há 3 dias', referencia), '2026-08-25');
      assert.strictEqual(vagas._internal.dataPublicacaoISO('há 2 dias', referencia), '2026-08-26');
    }],

    ['dataPublicacaoISO: "Ontem"/"Hoje" resolvem contra a data de referência', () => {
      const referencia = new Date('2026-08-28T12:00:00Z');
      assert.strictEqual(vagas._internal.dataPublicacaoISO('Ontem', referencia), '2026-08-27');
      assert.strictEqual(vagas._internal.dataPublicacaoISO('Hoje', referencia), '2026-08-28');
    }],

    ['dataPublicacaoISO: item real do fixture com data relativa ("Há 2 dias") não quebra — resolve pra alguma data ISO (usa Date.now() por padrão, não determinística sem fixar a referência)', () => {
      const item = itensReais.find(i => i.idVaga === '2832334');
      assert.ok(item);
      assert.strictEqual(item.dataPublicacaoBruta, 'Há 2 dias');
      assert.ok(vagas._internal.dataPublicacaoISO(item.dataPublicacaoBruta), 'deveria resolver pra alguma data ISO, não null');
    }],

    ['dataPublicacaoISO: formato desconhecido -> null, nunca inventa', () => {
      assert.strictEqual(vagas._internal.dataPublicacaoISO('texto qualquer'), null);
      assert.strictEqual(vagas._internal.dataPublicacaoISO(''), null);
      assert.strictEqual(vagas._internal.dataPublicacaoISO(null), null);
    }],

    ['modalidadeDoLocal: "100% Home Office" -> remoto; "Cidade / UF" -> presencial; texto sem sinal -> null', () => {
      assert.strictEqual(vagas._internal.modalidadeDoLocal('100% Home Office'), 'remoto');
      assert.strictEqual(vagas._internal.modalidadeDoLocal('São Paulo / SP'), 'presencial');
      assert.strictEqual(vagas._internal.modalidadeDoLocal('Home Office'), 'hibrido');
      assert.strictEqual(vagas._internal.modalidadeDoLocal('texto sem padrão nenhum'), null);
      assert.strictEqual(vagas._internal.modalidadeDoLocal(null), null);
    }],

    ['limparMarcacao: remove <mark> do destaque de busca sem perder o texto', () => {
      assert.strictEqual(vagas._internal.limparMarcacao('Designer <mark>Gráfico</mark> Jr'), 'Designer Gráfico Jr');
    }],

    ['paraSlug: minúsculo, sem acento, espaço vira hífen (idempotente pra slug já pronto)', () => {
      assert.strictEqual(vagas._internal.paraSlug('Inteligência Artificial'), 'inteligencia-artificial');
      assert.strictEqual(vagas._internal.paraSlug('inteligencia-artificial'), 'inteligencia-artificial');
      assert.strictEqual(vagas._internal.paraSlug('UX'), 'ux');
    }],

    ['vagaMercado.pareceVagaMercado aceita item real (tem name/jobUrl/careerPageName, sem country que rejeitaria)', () => {
      const item = itensReais[0];
      assert.strictEqual(vagaMercado.pareceVagaMercado(item), true);
    }],

    ['normalizarParcial: item real da HStern monta registro completo — orgao/campus/uf/url/data/modalidade', () => {
      const item = itensReais.find(i => i.idVaga === '2824900');
      const parcial = vagas.normalizarParcial(item);
      assert.strictEqual(parcial.fonte, 'vagas');
      assert.strictEqual(parcial.trilha, 'mercado');
      assert.strictEqual(parcial.orgao, 'HStern');
      assert.strictEqual(parcial.campus, 'Rio de Janeiro / RJ');
      assert.strictEqual(parcial.uf, 'RJ');
      assert.strictEqual(parcial.data_publicacao, '2026-07-10');
      assert.strictEqual(parcial.modalidade, 'presencial');
      assert.strictEqual(parcial.subedital, null, 'subedital sempre null na trilha mercado');
      assert.strictEqual(parcial.vagas, null, 'vagas sempre null na trilha mercado (fonte não expõe contagem confiável)');
    }],

    ['extrairJobPosting: acha o bloco JobPosting (não o WebSite que vem antes, no <head>) — Marketing Design', () => {
      const jp = vagas._internal.extrairJobPosting(htmlDetalheMarketingDesign);
      assert.ok(jp, 'JobPosting não encontrado no fixture');
      assert.strictEqual(jp['@type'], 'JobPosting');
      assert.strictEqual(jp.title, 'Analista de Marketing (Design) Pleno');
      assert.ok(jp.description.length > 1000, `descrição muito curta: ${jp.description.length} chars`);
    }],

    ['extrairJobPosting: html sem bloco JobPosting retorna null, nunca lança', () => {
      assert.strictEqual(vagas._internal.extrairJobPosting('<html><body>nada aqui</body></html>'), null);
    }],

    ['extrairJobPosting: bloco ld+json malformado (JSON quebrado de propósito) não derruba a varredura, retorna null', () => {
      const htmlQuebrado = '<script type="application/ld+json">{ isto nao é json }</script>';
      assert.strictEqual(vagas._internal.extrairJobPosting(htmlQuebrado), null);
    }],

    ['montarEnriquecimento: texto_bruto = título + descrição completa (Marketing Design, RESÍDUO CONHECIDO #1)', () => {
      const jp = vagas._internal.extrairJobPosting(htmlDetalheMarketingDesign);
      const e = vagas._internal.montarEnriquecimento(jp, { name: 'Analista de Marketing (Design) Pleno' });
      assert.ok(e.texto_bruto.startsWith('Analista de Marketing (Design) Pleno'));
      assert.ok(e.texto_bruto.length > 1000, `texto_bruto curto demais: ${e.texto_bruto.length} chars`);
      assert.ok(/Design Gráfico/.test(e.texto_bruto), 'descrição completa deveria conter "Design Gráfico" (real, requisitos da vaga)');
    }],

    // --- Testes de DISCRIMINAÇÃO (item 4 do briefing — positivos e negativos, texto avaliado é o texto_bruto ENRIQUECIDO de verdade) ---

    ['DISCRIMINAÇÃO positiva — RESÍDUO CONHECIDO #1 "Analista de Marketing (Design) Pleno": título curto (53 chars) ficava FORA; descrição completa PASSA', () => {
      const jp = vagas._internal.extrairJobPosting(htmlDetalheMarketingDesign);
      const e = vagas._internal.montarEnriquecimento(jp, { name: 'Analista de Marketing (Design) Pleno' });
      const soTitulo = scoreMercado.avaliarAderencia('Analista de Marketing (Design) Pleno \n São Paulo / SP', keywordsMercadoConfig);
      const comDescricao = scoreMercado.avaliarAderencia(e.texto_bruto, keywordsMercadoConfig);
      assert.strictEqual(soTitulo.passou, false, 'pré-condição: só título continua fora (mesmo achado do briefing)');
      assert.strictEqual(comDescricao.passou, true, `descrição completa deveria passar — matches=${JSON.stringify(comDescricao.matches)}`);
      assert.deepStrictEqual(comDescricao.matches.map(m => m.termo), ['design gráfico']);
    }],

    ['DISCRIMINAÇÃO positiva — RESÍDUO CONHECIDO #2 "Estagiário(a) de Design/Arte Monet": título curto (51 chars) ficava FORA; descrição completa PASSA ("Cursando graduação em Design Gráfico")', () => {
      const jp = vagas._internal.extrairJobPosting(htmlDetalheMonet);
      assert.ok(jp, 'JobPosting não encontrado no fixture Monet');
      const e = vagas._internal.montarEnriquecimento(jp, { name: 'Estagiário(a) de Design/Arte Monet' });
      const soTitulo = scoreMercado.avaliarAderencia('Estagiário(a) de Design/Arte Monet \n São Paulo / SP', keywordsMercadoConfig);
      const comDescricao = scoreMercado.avaliarAderencia(e.texto_bruto, keywordsMercadoConfig);
      assert.strictEqual(soTitulo.passou, false, 'pré-condição: só título continua fora (mesmo achado do briefing)');
      assert.strictEqual(comDescricao.passou, true, `descrição completa deveria passar — matches=${JSON.stringify(comDescricao.matches)}`);
      assert.deepStrictEqual(comDescricao.matches.map(m => m.termo), ['design gráfico']);
    }],

    ['DISCRIMINAÇÃO negativa — CONTROLE OBRIGATÓRIO "Cabeleireira (o) Mei -Campos": descrição completa MENCIONA "design de sobrancelha"/"designer de sobrancelha" (risco de falso positivo real) e AINDA ASSIM fica fora', () => {
      const jp = vagas._internal.extrairJobPosting(htmlDetalheCabeleireira);
      assert.ok(jp, 'JobPosting não encontrado no fixture Cabeleireira');
      const e = vagas._internal.montarEnriquecimento(jp, { name: 'Cabeleireira (o) Mei -Campos' });
      assert.ok(/design de sobrancelha|designer de sobrancelha/i.test(e.texto_bruto), 'pré-condição: a descrição real precisa mencionar "design(er) de sobrancelha" (é o risco de falso positivo que o briefing pediu pra testar)');
      const resultado = scoreMercado.avaliarAderencia(e.texto_bruto, keywordsMercadoConfig);
      assert.strictEqual(resultado.passou, false, `deveria continuar fora mesmo com descrição completa — matches=${JSON.stringify(resultado.matches)}`);
    }],

    ['DISCRIMINAÇÃO negativa — CONTROLE OBRIGATÓRIO "Operador Equipamento I - Motorista de Carreta Interna": descrição completa continua fora (nenhum termo de design)', () => {
      const jp = vagas._internal.extrairJobPosting(htmlDetalheCarreta);
      assert.ok(jp, 'JobPosting não encontrado no fixture Carreta');
      const e = vagas._internal.montarEnriquecimento(jp, { name: 'Operador Equipamento I - Motorista de Carreta Interna' });
      const resultado = scoreMercado.avaliarAderencia(e.texto_bruto, keywordsMercadoConfig);
      assert.strictEqual(resultado.passou, false, `deveria continuar fora — matches=${JSON.stringify(resultado.matches)}`);
    }],

    ['DISCRIMINAÇÃO negativa — CONSTRUÍDO "Designer de Sobrancelhas - Salão Bella" (não achado como posting distinto no vagas.com em 09/09/2026 — a menção real de "sobrancelha" hoje é dentro do card da Cabeleireira; título+descrição de salão de beleza construída como o pior caso), continua fora mesmo com descrição completa', () => {
      const textoConstruido = [
        'Designer de Sobrancelhas - Salão Bella',
        'Descrição: Buscamos profissional para design de sobrancelhas, micropigmentação e henna. Experiência comprovada como designer de sobrancelhas. Atendimento ao cliente, agendamento e organização do salão.'
      ].join(' \n ');
      const resultado = scoreMercado.avaliarAderencia(textoConstruido, keywordsMercadoConfig);
      assert.strictEqual(resultado.passou, false, `deveria continuar fora — matches=${JSON.stringify(resultado.matches)}`);
    }],

    ['DISCRIMINAÇÃO negativa — CONSTRUÍDO "Designer de Unhas e Cílios" (mesmo motivo do caso acima), continua fora mesmo com descrição completa', () => {
      const textoConstruido = [
        'Designer de Unhas e Cílios',
        'Descrição: Vaga para designer de unhas com experiência em alongamento, blindagem e nail art. Cílios volume russo. Salão em bairro nobre, alta demanda.'
      ].join(' \n ');
      const resultado = scoreMercado.avaliarAderencia(textoConstruido, keywordsMercadoConfig);
      assert.strictEqual(resultado.passou, false, `deveria continuar fora — matches=${JSON.stringify(resultado.matches)}`);
    }],

    // --- CHAVE DE ENRIQUECIMENTO POR REDE (09/09/2026 — WAF por IP bloqueou /vagas/{id}, confirmado com fetch nativo E com camofox; RadarAcademicoJB roda 3x/dia no Task Scheduler, então a chave tem que nascer DESLIGADA. Ver "CHAVE DE ENRIQUECIMENTO POR REDE" no topo de fontes/vagas.js) ---

    ['CHAVE default: ENRIQUECER_VIA_REDE nasce false (varredura estática do código-fonte, não só do valor em memória — pega o caso de alguém religar sem entender o custo)', () => {
      const fonteVagas = fs.readFileSync(path.join(__dirname, '..', 'fontes', 'vagas.js'), 'utf8');
      const m = fonteVagas.match(/const ENRIQUECER_VIA_REDE = (true|false);/);
      assert.ok(m, 'linha "const ENRIQUECER_VIA_REDE = true|false;" não encontrada — a chave documentada no topo do arquivo mudou de forma');
      assert.strictEqual(m[1], 'false', 'ENRIQUECER_VIA_REDE tem que nascer DESLIGADA — se isto falhar, alguém religou sem passar pelo teste frio de IP descansado');
      assert.strictEqual(vagas._internal.ENRIQUECER_VIA_REDE, false, 'valor em memória bate com o texto-fonte');
    }],

    ['CHAVE desligada (comportamento REAL, default de produção) — enriquecer() NUNCA chama http.get, zero requisição', async () => {
      const http = require('../lib/http');
      const getOriginal = http.get;
      let chamadas = 0;
      http.get = () => { chamadas++; throw new Error('FALHA DE TESTE: http.get foi chamado com a chave desligada — não deveria haver requisição nenhuma'); };
      try {
        const item = itensReais[0];
        const extra = await vagas.enriquecer(item); // chama a chave REAL do módulo, hoje false
        assert.strictEqual(chamadas, 0, 'http.get não pode ser chamado com a chave desligada');
        assert.strictEqual(extra.texto_bruto, vagas.textoParaFiltro(item), 'com a chave desligada, texto_bruto é o da listagem (mesmo fallback de sempre)');
        assert.strictEqual(extra.extracao, 'fallback_listagem', 'marca a extração como fallback — nunca finge ter descrição que não buscou');
      } finally {
        http.get = getOriginal;
      }
    }],

    ['CHAVE ligada (via _internal.enriquecerComChave, SEM mudar o default do módulo) — a requisição volta a ser emitida, com http.get mockado (fixture, sem rede)', async () => {
      const http = require('../lib/http');
      const getOriginal = http.get;
      let chamadas = 0;
      let urlChamada = null;
      http.get = async (url) => {
        chamadas++;
        urlChamada = url;
        return htmlDetalheMarketingDesign; // fixture real, sem rede
      };
      try {
        const item = { name: 'Analista de Marketing (Design) Pleno', jobUrl: 'https://www.vagas.com.br/vagas/v2828315/analista-de-marketing-design-pleno', local: 'São Paulo / SP' };
        const extra = await vagas._internal.enriquecerComChave(item, true);
        assert.strictEqual(chamadas, 1, 'com a chave ligada, http.get tem que ser chamado exatamente uma vez');
        assert.strictEqual(urlChamada, item.jobUrl);
        assert.ok(!extra.extracao, 'sucesso não marca extracao (só o caminho degradado marca)');
        assert.ok(/Design Gráfico/.test(extra.texto_bruto), 'com a chave ligada, texto_bruto vem enriquecido de verdade (descrição completa da fixture)');
      } finally {
        http.get = getOriginal;
      }
    }],

    ['CHAVE ligada, mas GET falha (rede fora) — degrada pro texto da listagem com extracao=fallback_listagem, nunca lança', async () => {
      const http = require('../lib/http');
      const getOriginal = http.get;
      http.get = async () => { throw new Error('HTTP 429 ao buscar (simulado)'); };
      try {
        const item = itensReais[0];
        const extra = await vagas._internal.enriquecerComChave(item, true);
        assert.strictEqual(extra.texto_bruto, vagas.textoParaFiltro(item));
        assert.strictEqual(extra.extracao, 'fallback_listagem');
      } finally {
        http.get = getOriginal;
      }
    }]
  ];

  return (async () => {
    for (const [name, fn] of tests) {
      try {
        const resultado = fn();
        if (resultado && typeof resultado.then === 'function') await resultado;
        console.log(`  ✓ ${name}`);
        passed++;
      } catch (error) {
        console.log(`  ✗ ${name}`);
        console.error(`    ${error.message}`);
        failed++;
      }
    }

    console.log(`\n${passed} passou(aram), ${failed} falhou(aram)\n`);
    process.exit(failed > 0 ? 1 : 0);
  })();
}

main();
