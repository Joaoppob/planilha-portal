'use strict';
// O instrumento que impede o mapa de siglas de ficar MUDO.
//
// Um mapa nome→sigla envelhece em silêncio: o store cresce, aparece instituição
// nova, ela cai no fallback e ninguém fica sabendo. Este script lê `dados!A2:A`
// de verdade e mostra, com contagem, o que resolveu pelo mapa e o que caiu no
// fallback — o texto exato que JB vê na planilha, não uma aproximação.
//
// Aborta sozinho (exit 1) em três casos, sem depender de alguém lembrar de olhar:
//   C1  controle positivo: um nome que TEM que resolver pelo mapa e não resolveu
//       → o lookup quebrou (chave alterada, acento perdido, mapa vazio).
//   C2  controle negativo: um nome inventado que TEM que cair no fallback e não
//       caiu → o mapa está casando o que não devia.
//   C3  colisão de volta: qualquer nome curto (mapa OU fallback) que seja igual
//       a uma sigla de unidade federativa, ou que comece com "UF " / "IF " solto
//       — que é exatamente o defeito que esta correção veio matar.
const S = require('./siglas');
const a = require('./api');
const A = require('./abas');

const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');

// C3 — o nome curto não pode reintroduzir a colisão com a sigla de UF.
//
// A regra é ESTREITA de propósito, e foi estreitada DEPOIS de medir: a primeira
// versão proibia qualquer prefixo de 2 letras e reprovou "IF Goiano" e
// "IF Sudeste MG" — que são o nome próprio dessas instituições. Regra que
// reprova o que está certo é a regra errada. O defeito real é específico:
// "UF" é sigla de unidade federativa E abreviação de Universidade Federal, e as
// duas aparecem na MESMA linha do card. "IF" não é sigla de UF nenhuma, não é
// ambíguo, e fica.
function colide(curto) {
  const s = String(curto).trim();
  if (UFS.includes(s)) return 'é exatamente uma sigla de UF';
  if (/^UF\s/.test(s)) return 'começa com "UF " — colide com a sigla de unidade federativa da mesma linha';
  if (UFS.includes(s.split(/\s+/)[0])) return `começa com "${s.split(/\s+/)[0]}", que é sigla de UF`;
  return null;
}

function conferirControles() {
  const falhas = [];
  const C1 = 'Fundação Universidade Federal de São Carlos';
  if (S.curto(C1) !== 'UFSCar') falhas.push(`C1 controle positivo: "${C1}" → "${S.curto(C1)}" (esperado UFSCar)`);
  const C2 = 'Universidade Federal do Lugar Que Não Existe';
  if (S.curto(C2) !== 'Univ. Federal do Lugar Que Não Existe') falhas.push(`C2 controle negativo: "${C2}" → "${S.curto(C2)}"`);
  Object.entries(S.SIGLAS).forEach(([n, sg]) => {
    const c = colide(sg);
    if (c) falhas.push(`C3 mapa: "${n}" → "${sg}" ${c}`);
  });
  S.FALLBACK.forEach(([de, para]) => {
    const c = colide(para);
    if (c) falhas.push(`C3 fallback: "${de}" → "${para}" ${c}`);
  });
  return falhas;
}

async function main() {
  const falhas = conferirControles();
  if (falhas.length) {
    console.error('=== CONTROLES REPROVARAM — o mapa não é confiável ===');
    falhas.forEach(f => console.error('  ' + f));
    process.exit(1);
  }
  console.log('controles: C1 positivo OK · C2 negativo OK · C3 sem colisão com sigla de UF');

  const r = await a.ler(`${A.ref(A.DADOS)}!A2:A5000`);
  const contagem = new Map();
  (r.values || []).forEach(l => {
    const o = String(l[0] || '').trim();
    if (o) contagem.set(o, (contagem.get(o) || 0) + 1);
  });

  const mapeadas = [], fallback = [];
  [...contagem.entries()]
    .sort((x, y) => y[1] - x[1])
    .forEach(([nome, n]) => (S.SIGLAS[nome] ? mapeadas : fallback).push([nome, n, S.curto(nome)]));

  const regs = n => n.reduce((s, x) => s + x[1], 0);
  const total = regs(mapeadas) + regs(fallback);
  console.log(`\ninstituições em ${A.DADOS}: ${contagem.size} distintas, ${total} registros`);
  console.log(`  pelo mapa:     ${mapeadas.length} distintas (${regs(mapeadas)} registros)`);
  console.log(`  pelo fallback: ${fallback.length} distintas (${regs(fallback)} registros)`);

  if (fallback.length) {
    console.log('\n--- caíram no FALLBACK (nada quebrado; só é mais longo do que precisaria) ---');
    fallback.forEach(([nome, n, curto]) => console.log(`  ${String(n).padStart(3)}  ${curto}\n       ← ${nome}`));
    console.log('\n  Pra encurtar: acrescente a sigla em _norman/siglas.js e rode `node _norman/construir.js`.');
    console.log('  Só entra sigla que a instituição de fato usa. Na dúvida, DEIXE no fallback.');
  } else {
    console.log('\nnenhuma instituição caiu no fallback.');
  }

  const maior = [...contagem.entries()].sort((x, y) => y[1] - x[1])[0];
  if (maior) console.log(`\nmais frequente: ${S.curto(maior[0])} — ${maior[1]} de ${total} registros`);
}

if (require.main === module) main().catch(e => { console.error('ERRO', e.message); process.exit(1); });
module.exports = { colide, conferirControles };
