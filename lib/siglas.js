'use strict';
// Nome de instituição → SIGLA CANÔNICA.
//
// FONTE ÚNICA (Onda dedupe-canonico) — dois consumidores, um dado:
//   1. `_norman/siglas.js` reexporta este módulo sem alteração — vira tabela
//      de lookup na `_calc` (colunas V:W), consumida por VLOOKUP na fórmula
//      que monta o nome curto na planilha (ver `_norman/formulas.js`).
//   2. `lib/orgao-canonico.js` usa o MESMO mapa para resolver a chave
//      canônica de dedupe entre fontes (ex.: DOU "Fundação Universidade
//      Federal de São Carlos" × PCI "UFSCar - Universidade Federal de São
//      Carlos" → mesma sigla). Vivia só em `_norman/` antes desta onda;
//      migrado pra `lib/` porque `_norman/` é código de planilha e não deve
//      ser importado pelo pipeline de coleta (`radar.js`/`fontes/`) — duas
//      cópias da mesma tabela é o modo de falha que este arquivo já
//      documentava (ver "COBERTURA SE CONFERE" abaixo): elas divergem em
//      silêncio.
//
// REGRA DE ENTRADA (dura): só entra sigla que é NOME PRÓPRIO INSTITUCIONAL
// verificável — o jeito como a instituição se chama. NUNCA derivada por regra
// de string. A prova de que regra de string não serve está aqui dentro:
//   Itajubá → UNIFEI (não "UFI")   ·   Catalão → UFCAT (não "UFC", que é o Ceará)
//   Jataí   → UFJ                  ·   Alfenas → UNIFAL-MG
//   Farroupilha → IFFar            ·   Delta do Parnaíba → UFDPar
// Sigla é fato institucional. Chute vira erro factual numa peça de decisão.
//
// Instituição FORA deste mapa cai no fallback tipográfico ("Univ. Federal de X",
// "Inst. Federal de X") — ver SIGLA em formulas.js. O fallback é honesto: mais
// longo, nunca errado, e nunca colide com a sigla de UF. O mapa é economia de
// espaço, não requisito de correção — a peça funciona inteira sem ele.
//
// COBERTURA SE CONFERE: `node _norman/cobertura-siglas.js` lista as instituições
// que existem em `dados` e caíram no fallback. Mapa sem instrumento fica mudo.
const SIGLAS = {
  // --- presentes no store hoje (46 instituições distintas em 205 registros) ---
  'Universidade Federal do Rio Grande do Sul': 'UFRGS',
  'Fundação Universidade Federal de São Carlos': 'UFSCar',
  'Universidade Federal de São Carlos': 'UFSCar',
  'Universidade Tecnológica Federal do Paraná': 'UTFPR',
  'Instituto Federal de Educação, Ciência e Tecnologia de Mato Grosso': 'IFMT',
  'Universidade Federal do Espírito Santo': 'UFES',
  'Fundação Universidade Federal de Mato Grosso': 'UFMT',
  'Universidade Federal de Mato Grosso': 'UFMT',
  'Universidade Federal do Ceará': 'UFC',
  'Instituto Federal de Educação, Ciência e Tecnologia do Piauí': 'IFPI',
  'Instituto Federal de Educação, Ciência e Tecnologia do Sudeste de Minas Gerais': 'IF Sudeste MG',
  'Instituto Federal de Educação, Ciência e Tecnologia do Rio Grande do Sul': 'IFRS',
  'Universidade Federal de Itajubá': 'UNIFEI',
  'Instituto Federal de Educação, Ciência e Tecnologia de Alagoas': 'IFAL',
  'Instituto Federal de Educação, Ciência e Tecnologia de Rondônia': 'IFRO',
  'Instituto Federal de Educação, Ciência e Tecnologia da Paraíba': 'IFPB',
  'Instituto Federal de Educação, Ciência e Tecnologia de Mato Grosso do Sul': 'IFMS',
  'Universidade Federal da Paraíba': 'UFPB',
  'Instituto Federal de Educação, Ciência e Tecnologia do Norte de Minas Gerais': 'IFNMG',
  'Fundação Universidade Federal de São João Del Rei': 'UFSJ',
  'Universidade Federal de São João Del Rei': 'UFSJ',
  'Universidade Federal de Jataí': 'UFJ',
  'Instituto Federal de Educação, Ciência e Tecnologia do Espírito Santo': 'IFES',
  'Universidade Federal do Rio Grande do Norte': 'UFRN',
  'Instituto Federal de Educação, Ciência e Tecnologia do Amapá': 'IFAP',
  'Instituto Federal de Educação, Ciência e Tecnologia da Bahia': 'IFBA',
  'Universidade Federal de Goiás': 'UFG',
  'Universidade Federal de Catalão': 'UFCAT',
  'Fundação Universidade Federal do Maranhão': 'UFMA',
  'Universidade Federal do Maranhão': 'UFMA',
  'Instituto Federal de Educação, Ciência e Tecnologia Goiano': 'IF Goiano',
  'Instituto Federal de Educação, Ciência e Tecnologia Farroupilha': 'IFFar',
  'Instituto Federal de Educação, Ciência e Tecnologia do Triângulo Mineiro': 'IFTM',
  'Instituto Federal de Educação, Ciência e Tecnologia do Pará': 'IFPA',
  'Instituto Federal de Educação, Ciência e Tecnologia de Minas Gerais': 'IFMG',
  'Fundação Universidade Federal de Pelotas': 'UFPel',
  'Universidade Federal de Pelotas': 'UFPel',
  'Universidade Federal de Alfenas': 'UNIFAL-MG',
  'Universidade Federal do Agreste de Pernambuco': 'UFAPE',
  'Universidade Federal Rural de Pernambuco': 'UFRPE',
  'Instituto Federal de Educação, Ciência e Tecnologia de Pernambuco': 'IFPE',
  'Instituto Federal de Educação, Ciência e Tecnologia do Amazonas': 'IFAM',
  'Universidade Federal do Delta do Parnaíba': 'UFDPar',
  'Centro Federal de Educação Tecnológica de Minas Gerais': 'CEFET-MG',
  'Universidade Federal Rural da Amazônia': 'UFRA',
  'Instituto Federal de Educação, Ciência e Tecnologia de São Paulo': 'IFSP',
  'Universidade Federal Fluminense': 'UFF',
  'Fundação Universidade Federal do Piauí': 'UFPI',
  'Universidade Federal do Piauí': 'UFPI',
  'Fundação Universidade do Amazonas': 'UFAM',
  'Universidade Federal do Amazonas': 'UFAM',
  'Universidade Federal do Norte do Tocantins': 'UFNT',
  'Universidade Federal da Integração Latino-Americana': 'UNILA',

  // --- ainda não vistas no store, mas já nomeadas em config/universidades-uf.json.
  //     O nome vem do config (existe e está escrito assim); a sigla é o nome
  //     próprio da instituição. Entram porque o store vai encostar nelas. ---
  'Universidade Federal do Pará': 'UFPA',
  'Universidade Federal do Oeste do Pará': 'UFOPA',
  'Universidade Federal do Sul e Sudeste do Pará': 'UNIFESSPA',
  'Universidade Federal do Cariri': 'UFCA',
  'Universidade Federal de Pernambuco': 'UFPE',
  'Universidade Federal da Bahia': 'UFBA',
  'Universidade Federal do Recôncavo da Bahia': 'UFRB',
  'Universidade Federal do Sul da Bahia': 'UFSB',
  'Universidade Federal de Minas Gerais': 'UFMG',
  'Universidade Federal de Viçosa': 'UFV',
  'Universidade Federal de Uberlândia': 'UFU',
  'Universidade Federal de Juiz de Fora': 'UFJF',
  'Universidade Federal dos Vales do Jequitinhonha e Mucuri': 'UFVJM',
  'Universidade Federal do Rio de Janeiro': 'UFRJ',
  'Universidade Federal Rural do Rio de Janeiro': 'UFRRJ',
  'Universidade Federal do Estado do Rio de Janeiro': 'UNIRIO',
  'Instituto Federal do Rio de Janeiro': 'IFRJ',
  'Universidade Federal de São Paulo': 'UNIFESP',
  'Universidade Federal do ABC': 'UFABC',
  'Universidade de São Paulo': 'USP',
  'Universidade Estadual de Campinas': 'UNICAMP',
  'Universidade Estadual Paulista': 'UNESP',
  'Universidade Federal de Santa Maria': 'UFSM',
  'Universidade Federal do Rio Grande': 'FURG',
  'Universidade Federal da Fronteira Sul': 'UFFS',
  'Universidade Federal de Santa Catarina': 'UFSC',
  'Universidade Federal do Paraná': 'UFPR',
  'Universidade Federal de Mato Grosso do Sul': 'UFMS',
  'Universidade Federal da Grande Dourados': 'UFGD',
  'Universidade de Brasília': 'UnB',
  'Universidade Federal de Campina Grande': 'UFCG',
  'Universidade Federal de Alagoas': 'UFAL',
  'Universidade Federal de Sergipe': 'UFS',
  'Universidade Federal do Acre': 'UFAC',
  'Universidade Federal de Rondônia': 'UNIR',
  'Universidade Federal de Roraima': 'UFRR'
};

// Fallback tipográfico — a MESMA cadeia, na MESMA ordem, que a fórmula aplica
// quando o VLOOKUP falha. Vive aqui pra que a conferência de cobertura mostre
// exatamente o texto que JB vai ver na planilha, não uma aproximação.
// Nenhuma das expansões colide com sigla de unidade federativa.
const FALLBACK = [
  ['Instituto Federal de Educação, Ciência e Tecnologia', 'Inst. Federal'],
  ['Centro Federal de Educação Tecnológica', 'CEFET'],
  ['Universidade Tecnológica Federal', 'Univ. Tecn. Federal'],
  ['Fundação Universidade Federal', 'Univ. Federal'],
  ['Universidade Federal', 'Univ. Federal']
];

const curto = (nome) =>
  SIGLAS[nome] || FALLBACK.reduce((s, [de, para]) => s.split(de).join(para), String(nome || ''));

const tabela = () => Object.entries(SIGLAS);

module.exports = { SIGLAS, FALLBACK, curto, tabela };
