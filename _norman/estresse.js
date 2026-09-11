'use strict';
// Escreve linhas SINTÉTICAS direto na aba `dados` (nunca no store) pra provar:
//  (a) intervalo aberto acompanha o crescimento do store;
//  (b) os ramos que o dado REAL de hoje não exercita e que, por isso, nunca
//      foram vistos por ninguém — "você pode prestar AGORA" na trilha docente
//      e, na trilha mercado, "sem data de publicação", "ainda sem pontuação",
//      enum desconhecido, publicação com data no futuro, remoto sem local
//      nenhum e nome de empresa quilométrico.
//
// Este arquivo é a única coisa do projeto que escreve na aba `dados` fora do
// sync. Não contamina o store (`data/store.jsonl` não é tocado) e não deixa
// resíduo: o próximo `node radar.js sincronizar-sheets` dá clear na aba e
// reescreve só os registros reais. Todo `orgao` sintético começa com "ZZ "
// justamente pra ser reconhecível de relance enquanto estiver lá.
const a = require('./api');
const A = require('./abas');
const R = A.ref;
const iso = d => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);

// 23 colunas — A..W. As 3 últimas (trilha, modalidade, senioridade) são da
// Onda 3. `trilha` é parâmetro EXPLÍCITO de propósito: quem escreve linha
// sintética tem que declarar em qual superfície ela deve aparecer, senão o
// teste provaria a aba errada sem avisar.
const linha = (o, uf, area, sub, fim, pub, score, ver, extra, trilha, modalidade, senioridade, campus) => [
  o, campus === undefined ? 'Campus Teste' : campus, uf, area, sub, '', 'graduacao', 1, 'efetivo', '', '', '',
  fim, pub, score, ver, '', extra || '',
  'https://exemplo.test/' + o.replace(/\W/g, ''), 'TESTE' + o.replace(/\W/g, ''),
  trilha === undefined ? 'docente' : trilha, modalidade || '', senioridade || ''
];
const mercado = (o, uf, area, sub, pub, score, modalidade, senioridade, campus) =>
  linha(o, uf, area, sub, iso(30), pub, score, score === '' ? '' : 'aderente', '', 'mercado', modalidade, senioridade, campus);

// ---- trilha docente: os tiers, como antes ----
const casosDocente = [
  linha('ZZ TESTE tier1 aberto elegivel', 'SP', 'Design', 'Design Digital', iso(5), iso(-10), 90, 'elegivel_agora'),
  linha('ZZ TESTE tier1 segundo', 'RJ', 'UX/IHC', 'IHC', iso(20), iso(-5), 85, 'elegivel_agora'),
  linha('ZZ TESTE tier4 semprazo elegivel', 'MG', 'Design', 'Design', '', iso(-10), 80, 'elegivel_agora'),
  linha('ZZ TESTE tier7 semprazo antigo', 'BA', 'Design', 'Design', '', iso(-300), 70, 'elegivel_agora'),
  linha('ZZ TESTE tier8 encerrado', 'PR', 'Design', 'Design', iso(-30), iso(-60), 60, 'elegivel_agora'),
  linha('ZZ TESTE fecha HOJE', 'GO', 'Computação/IA', 'IA', iso(0), iso(-20), 75, 'indeterminada'),
  linha('ZZ TESTE extracao suja', 'AM', '', '', '', iso(-3), 40, 'indeterminada', 'formato_nao_reconhecido')
];

// ---- trilha mercado: um caso por RAMO da fórmula, inclusive os feios ----
const casosMercado = [
  mercado('ZZ MERC hoje forte', 'SP', 'IA/Agentes', 'RAG', iso(0), 85, 'remoto', 'senior'),
  mercado('ZZ MERC hoje fraca', 'RJ', 'Front-end', 'React', iso(0), 20, 'presencial', 'junior'),
  mercado('ZZ MERC semana combina', 'MG', 'UX/Produto', 'Design System', iso(-4), 60, 'hibrido', 'pleno'),
  mercado('ZZ MERC mes', 'PR', 'IA/Agentes', 'LLM', iso(-20), 55, 'remoto', 'especialista'),
  mercado('ZZ MERC trimestre', 'SC', 'UX/Produto', 'UX', iso(-60), 52, 'hibrido', 'estagio'),
  mercado('ZZ MERC arquivo antigo', 'BA', 'Front-end', 'TypeScript', iso(-400), 51, 'presencial', 'lead'),
  // ---- os estados que o dado real de hoje NÃO tem ----
  mercado('ZZ MERC SEM DATA de publicacao', 'CE', 'IA/Agentes', 'IA (geral)', '', 70, 'remoto', 'senior'),
  mercado('ZZ MERC SEM SCORE ainda', 'DF', 'UX/Produto', 'UI', iso(-2), '', 'hibrido', 'pleno'),
  mercado('ZZ MERC PUBLICADA NO FUTURO', 'AM', 'IA/Agentes', 'RAG', iso(7), 80, 'remoto', 'senior'),
  mercado('ZZ MERC enum desconhecido', 'PE', 'IA/Agentes', 'MLOps', iso(-3), 75, 'anywhere', 'staff'),
  mercado('ZZ MERC area vazia', 'GO', '', '', iso(-3), 65, 'remoto', 'senior'),
  // remoto de verdade: sem campus E sem uf — prova que não sobra separador órfão
  mercado('ZZ MERC remoto sem local', '', 'Front-end', 'JavaScript', iso(-1), 72, 'remoto', 'senior', ''),
  // nome quilométrico de careerPageName — prova o truncamento em 34
  mercado('ZZ MERC VENHA SER PARTE DO NOSSO TIME DE INOVACAO E TECNOLOGIA', 'SP', 'IA/Agentes', 'IA (geral)', iso(-1), 78, 'hibrido', 'senior')
];

// ---- órfão: trilha que não é nem docente nem mercado ----
// Prova o AVISO_ORFAOS do Painel. Este é o modo de falha SILENCIOSO da
// separação por trilha: a linha existe em `dados` e não aparece em aba nenhuma.
const casosOrfaos = [
  linha('ZZ ORFAO trilha futura', 'SP', 'Design', 'Design', iso(5), iso(-2), 70, 'aderente', '', 'freelance')
];

const enchimento = [];
for (let i = 0; i < 300; i++) {
  enchimento.push(linha('ZZ ENCHIMENTO ' + i, 'SP', 'Computação/IA', 'Computação', '', iso(-500 - i), 30, 'elegivel_futuro'));
}
for (let i = 0; i < 300; i++) {
  enchimento.push(mercado('ZZ ENCHIMENTO MERC ' + i, 'SP', 'IA/Agentes', 'IA (geral)', iso(-200 - i), 30, 'remoto', 'pleno'));
}

async function main() {
  const antes = ((await a.ler(`${R(A.DADOS)}!A1:A5000`)).values || []).length;
  const todas = [...casosDocente, ...casosMercado, ...casosOrfaos, ...enchimento];
  const inicio = antes + 1;
  await a.escrever(`${R(A.DADOS)}!A${inicio}`, todas);
  const depois = ((await a.ler(`${R(A.DADOS)}!A1:A5000`)).values || []).length;
  console.log(`${A.DADOS}: ${antes} -> ${depois} linhas (+${todas.length} sintéticas)`);
  console.log(`  docente: ${casosDocente.length} caso(s) | mercado: ${casosMercado.length} | órfão: ${casosOrfaos.length} | enchimento: ${enchimento.length}`);
  console.log('  desfazer: node radar.js sincronizar-sheets (clear + reescrita só com o store real)');
}

module.exports = { main };

// E6 (Leva 4, remodelação 2026-09-01) — CERCA-SECA: `--help`/`-h` real e
// RECUSA de flag desconhecida ANTES de qualquer efeito. Este arquivo é
// PROIBIDO DE RODAR em operação normal (fronteiras do briefing da Leva 4:
// escreve ~621 linhas SINTÉTICAS em `dados (não edite)`, produção) — a
// cerca é a mesma dos outros scripts de `_norman/`, mas o texto de uso
// avisa o risco explicitamente. Antes desta Onda o arquivo nem tinha
// `require.main === module`: um simples `require('./estresse')` (de
// QUALQUER script ou teste) já disparava a escrita como efeito colateral
// do import — a guarda abaixo é também o que impede isso.
const USO_ESTRESSE = 'Uso: node _norman/estresse.js  (nenhuma flag além de --help/-h)\n'
  + '  AVISO: escreve ~621 linhas SINTÉTICAS em `dados (não edite)` (produção). PROIBIDO DE RODAR sem autorização explícita — ver fronteiras do briefing.';
if (require.main === module) {
  const argvNormalizado = process.argv.slice(2).map(a => (a === '-h' ? '--help' : a));
  if (argvNormalizado.includes('--help')) {
    console.log(USO_ESTRESSE);
    process.exit(0);
  }
  const flagsDesconhecidas = argvNormalizado.filter(a => a.startsWith('--'));
  if (flagsDesconhecidas.length) {
    console.error(`[estresse] flag(s) desconhecida(s): ${flagsDesconhecidas.join(', ')}`);
    console.error(USO_ESTRESSE);
    process.exit(2);
  }
  main().catch(e => { console.error('ERRO', e.message); process.exit(1); });
}
