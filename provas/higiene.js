/* =====================================================================
   provas/higiene.js — o que não se vê olhando o arquivo.
       node provas/higiene.js

   Este repositório foi extraído de um workspace privado de origem de JB
   (projeto PRIVADO). O código é o mesmo; o que não pode atravessar é usuário
   Windows, planilha, service account e chat do Telegram REAIS. Espelha o
   padrão de EditorHtml/provas/higiene.js (mesma extração, outro projeto de
   origem) — adaptado ao formato de `provas/termos-privados.json` deste
   repositório (`positivo_pessoal`/`positivo_maquina`/`negativo_legitimo` em
   vez de `positivo_hex`/`positivo_nome`) e a um repositório que ainda não é
   `git init`.

   DUAS COISAS QUE PASSAM EM QUALQUER LEITURA E MESMO ASSIM ESTÃO ERRADAS:

   1. CARACTERE DE CONTROLE NO CÓDIGO. Um `\b` escrito por uma ferramenta
      que come a barra invertida vira um BACKSPACE de verdade dentro de uma
      expressão regular — e o arquivo continua abrindo, continua colorindo
      no editor, e a regex passa a testar outra coisa. Risco real desta
      casa: a própria lista de termos proibidos abaixo é feita de `\b`.

   2. NOME QUE NÃO PODIA ATRAVESSAR. Usuário Windows, ID de planilha,
      service account e chat do Telegram ficam para trás por decisão, e
      decisão que ninguém confere é decisão que envelhece. Aqui ela vira
      controle: a lista é varrida a cada execução, e um achado só reprova.

   O CONTROLE POSITIVO VEM JUNTO: a varredura precisa provar que ACHA
   alguma coisa (as iscas plantadas em `termos-privados.json`) e que LEU
   algum arquivo — senão um bug que a fizesse não ler nada passaria como
   "limpo", e esse é o pior desfecho possível: reprovação nenhuma por
   ausência de trabalho, não por ausência de defeito.
   ===================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..');
/* Este repositório é TEXTO PURO — sem imagem, sem fonte, sem binário (ver
   auditoria de extensões antes de escrever este arquivo: 206/206 arquivos
   caem nestas 9 extensões + `.gitignore`). Nenhuma extensão de imagem entra
   de propósito: se um dia uma entrar, cai fora da varredura e isso é
   melhor que travar a suíte tentando ler binário como utf8 — o gate desta
   casa é sobre o que É lido, não sobre "cobrir tudo que existe no disco". */
const EXT = /\.(js|json|html|css|svg|md|txt|xml|rss|ps1|bat|example)$/i;
/* PONTO CEGO FECHADO (2026-09-11): `LICENSE` não tem extensão, então nunca
   casava com `EXT` e só `.gitignore` tinha exceção nominal — o arquivo
   escapava da varredura INTEIRA, não só do padrão de nome: TODOS os 10
   padrões, incluindo token e ID de planilha, se algum dia um deles fosse
   colado ali por engano. Convenção de repositório sem extensão é um
   conjunto pequeno e conhecido; listar por nome em vez de tentar adivinhar
   por ausência de `.` evita casar binário sem extensão por acidente. */
const CONVENCAO_SEM_EXTENSAO = new Set(['LICENSE', 'NOTICE', 'AUTHORS', 'CONTRIBUTING', 'CODEOWNERS']);
const PULA = new Set(['node_modules', '.git', 'data', 'logs', 'tmp']);

let falhas = 0, checks = 0;
function ok(cond, nome, detalhe) {
  checks++;
  if (cond) { console.log('  ok   ' + nome); return true; }
  falhas++;
  console.log('  FALHA ' + nome + (detalhe ? '\n        ' + detalhe : ''));
  return false;
}

function arquivos(dir, saida) {
  saida = saida || [];
  for (const f of fs.readdirSync(dir)) {
    if (PULA.has(f)) continue;
    const alvo = path.join(dir, f);
    const st = fs.statSync(alvo);
    if (st.isDirectory()) arquivos(alvo, saida);
    else if (EXT.test(f) || f === '.gitignore' || CONVENCAO_SEM_EXTENSAO.has(f)) saida.push(alvo);
  }
  return saida;
}

const rel = a => path.relative(RAIZ, a).split(path.sep).join('/');

/* `provas/higiene.js` (este arquivo) e `provas/termos-privados.json` ficam
   de fora pelo mesmo motivo do modelo: o primeiro CONTÉM a lista de
   proibidos (varrer-se a si mesmo acusaria o detector pela existência do
   detector); o segundo É a lista — ele nunca entra no controle de versão
   (ver .gitignore linha 53) e sua checagem de isenção vive em H2e, abaixo,
   CONFERIDA contra o git, não suposta. */
const ISENTOS = new Set(['provas/higiene.js', 'provas/termos-privados.json']);
const TODOS = arquivos(RAIZ).filter(a => !ISENTOS.has(rel(a)));

/* =====================================================================
   H0 · CONTROLE DE LEITURA
   A varredura só vale alguma coisa se ela LEU. Um bug em `arquivos()` que
   devolvesse lista vazia faria as duas seções abaixo (H1, H2) reportarem
   "0 achados" — que é indistinguível de "limpo" sem esta checagem.
   ===================================================================== */
console.log('\nH0 · a varredura leu arquivo de verdade');
ok(TODOS.length > 0, 'H0a · leu ' + TODOS.length + ' arquivo(s) — falharia com 0',
  TODOS.length === 0 ? 'arquivos() devolveu lista vazia; nada foi conferido' : '');
ok(TODOS.length > 100, 'H0b · positivo: ' + TODOS.length + ' é da ordem do repositório inteiro (206 arquivos), não de um subconjunto acidental');

/* =====================================================================
   H1 · CARACTERE DE CONTROLE
   ===================================================================== */
console.log('\nH1 · nenhum caractere de controle escondido no código');
/* tudo abaixo de 0x20 menos tab (0x09) e quebra de linha (0x0a/0x0d).
   Construida por CODIGO de caractere via loop + String.fromCharCode, nunca
   por sequencia de escape digitada numa string — e exatamente esse tipo de
   sequencia que um transporte que come caractere especial destroi (ver
   cabecalho do arquivo, item 1). */
const CODIGOS_CONTROLE = [];
for (let c = 0x00; c <= 0x1f; c++) {
  if (c === 0x09 || c === 0x0a || c === 0x0d) continue;
  CODIGOS_CONTROLE.push(c);
}
const CTRL = new RegExp('[' + CODIGOS_CONTROLE.map(function(c){ return String.fromCharCode(c); }).join('') + ']', 'g');
const sujos = [];
for (const a of TODOS) {
  const s = fs.readFileSync(a, 'utf8');
  const m = s.match(CTRL);
  if (m) sujos.push(rel(a) + ': ' + m.length + ' (' +
    m.map(c => 'U+' + c.charCodeAt(0).toString(16).padStart(4, '0')).join(' ') + ')');
}
ok(sujos.length === 0, 'H1a · os ' + TODOS.length + ' arquivos estão limpos',
  sujos.join('\n        '));
/* CONTROLE POSITIVO: a varredura ACHA quando há — sem isto, o bug de H0
   (lista vazia) passaria por aqui despercebido também. */
ok(CTRL.test('x' + String.fromCharCode(8) + 'y'), 'H1b · positivo: a varredura reconhece um backspace de verdade');

/* =====================================================================
   H2 · NADA DO PROJETO PRIVADO DE ORIGEM ATRAVESSA
   ===================================================================== */
console.log('\nH2 · nenhum dado do projeto privado de origem (workspace acadêmico)');
/* A LISTA NÃO MORA AQUI, E ISSO É O PONTO. Um varredor que escreve o que
   proíbe PUBLICA a própria lista: quem ler este arquivo aprenderia o
   usuário Windows, a planilha e o chat de origem. Os termos vêm de
   `provas/termos-privados.json`, que fica fora do controle de versão.

   SEM O ARQUIVO, H2 É PULADA — nunca aprovada. Silêncio lido como
   aprovação é o modo de falha que esta suíte existe para impedir, e uma
   verificação que some quando falta o insumo é exatamente isso. */
const LISTA = path.join(__dirname, 'termos-privados.json');
if (!fs.existsSync(LISTA)) {
  console.log('  PULADO  H2 - sem `provas/termos-privados.json` a varredura de dado privado '
    + 'de origem NAO RODOU.');
  console.log('          Isto nao e aprovacao: e ausencia de verificacao. '
    + 'Quem publicar sem rodar, publica sem conferir.');
} else {
  const doc = JSON.parse(fs.readFileSync(LISTA, 'utf8'));
  /* Cada termo pode declarar `isento_em`: lista de caminhos relativos à
     raiz onde ESSE padrão específico não reprova. A isenção é do PADRÃO,
     nunca do ARQUIVO — um arquivo isento para o nome próprio continua
     reprovando se token, e-mail, service account ou ID de planilha
     aparecer nele. Só os dois padrões de nome próprio (pessoa física,
     autoria legítima em LICENSE/README.md/package.json) carregam
     `isento_em` em `termos-privados.json`; os demais não têm o campo e por
     isso continuam proibidos em qualquer arquivo, sempre — inclusive nos
     três isentos do nome. */
  const PROIBIDOS = doc.termos.map(function (t) {
    return { re: new RegExp(t.src, t.flags), isentoEm: new Set(t.isento_em || []) };
  });
  const achados = [];
  for (const a of TODOS) {
    const caminho = rel(a);
    const s = fs.readFileSync(a, 'utf8');
    for (const p of PROIBIDOS) {
      if (p.isentoEm.has(caminho)) continue;
      const m = s.match(p.re);
      if (m) achados.push(caminho + ': ' + JSON.stringify(m[0]) + '  (padrao ' + p.re + ')');
    }
  }
  /* O PRÓPRIO ARQUIVO DE TERMOS não entra na varredura — ele É a lista. */
  ok(achados.length === 0, 'H2a · nenhum dos ' + PROIBIDOS.length +
    ' padroes proibidos aparece nos ' + TODOS.length + ' arquivos (isencao de nome descontada)',
    achados.slice(0, 12).join('\n        '));

  /* CONTROLE POSITIVO: duas iscas plantadas, uma "pessoal" (e-mail de
     teste) e uma "de máquina" (caminho Windows) — as duas vêm do MESMO
     arquivo de termos, então se a lista mudar o controle muda junto e não
     envelhece amarrado a um valor escrito à mão aqui. */
  ok(PROIBIDOS.some(function (p) { return p.re.test(doc.positivo_pessoal); }),
    'H2b · positivo: a varredura reconhece a isca pessoal plantada');
  ok(PROIBIDOS.some(function (p) { return p.re.test(doc.positivo_maquina); }),
    'H2c · positivo: a varredura reconhece a isca de máquina plantada');

  /* DISCRIMINAÇÃO: "radar" aparece em 107 dos 206 arquivos (é o nome do
     projeto, `radar.js`, `rodar-diario.bat`, etc.) e "JB" é o apelido de
     sempre em comentário de código — os dois são vocabulário LEGÍTIMO
     deste repositório. Um gate que os reprovasse reprovaria o repositório
     inteiro; a lista proíbe o NOME COMPLETO e a MÁQUINA, não a palavra. */
  ok(!PROIBIDOS.some(function (p) { return p.re.test(doc.negativo_legitimo); }),
    'H2d · discriminacao: vocabulario legitimo do proprio repositorio ("radar", "JB") '
    + 'nao e acusado — a lista proibe o nome completo e a maquina, nunca o apelido');

  /* ISENÇÃO ESTREITA DO NOME PRÓPRIO — três controles de discriminação
     provada (2026-09-11). "João Pedro Barros" não é readicionado à lista
     nem removido dela: continua proibido em qualquer arquivo, exceto nos
     três onde autoria é legítima (LICENSE, README.md, package.json), e SÓ
     para os dois padrões de nome — não para token, e-mail, service
     account, ID de planilha ou caminho de máquina, que continuam
     proibidos até nesses três. Emendar sem provar os dois lados é pior
     que não emendar: uma isenção mal escrita vira permissão geral. Nada
     abaixo escreve arquivo no disco — os três rodam contra conteúdo
     SINTÉTICO em memória, usando a MESMA lista PROIBIDOS e a MESMA lógica
     de isenção do loop acima (`acusaSintetico`), nunca uma cópia paralela
     que possa divergir dela. Os valores plantados vêm dos placeholders já
     existentes em `termos-privados.json` (`positivo_pessoal`,
     `positivo_maquina`) — nunca um segredo real digitado aqui, pelo mesmo
     motivo que a lista de termos não mora neste arquivo (ver cabeçalho de
     H2). */
  console.log('\nH2f-i · isencao estreita do nome proprio (discriminacao provada)');
  function acusaSintetico(caminhoSintetico, conteudo) {
    for (const p of PROIBIDOS) {
      if (p.isentoEm.has(caminhoSintetico)) continue;
      if (p.re.test(conteudo)) return true;
    }
    return false;
  }
  const NOME_TESTE = 'assinado por João Pedro Barros';

  /* positivo A: o mesmo nome, num caminho de CÓDIGO que não está na lista
     de isenção de nenhum padrão — tem que reprovar. Se isto passar sem
     acusar, a isenção vazou de LICENSE/README.md/package.json para o
     repositório inteiro, e a emenda virou remoção disfarçada. */
  ok(acusaSintetico('lib/exemplo-sintetico.js', NOME_TESTE),
    'H2f · positivo A: nome proprio plantado num .js sintetico REPROVA — '
    + 'a isencao nao migrou para fora dos 3 arquivos de autoria');

  /* positivo B: a isca de MÁQUINA (não tem `isento_em`) dentro do
     CONTEÚDO de um arquivo que ESTÁ isento — mas só para o nome. Se isto
     passar sem acusar, a isenção virou isenção de ARQUIVO, não de
     PADRÃO, e um token colado ao lado do nome do autor vazaria escondido
     atrás dele. */
  ok(acusaSintetico('README.md', 'Copyright (c) 2026 ' + NOME_TESTE + ' — ' + doc.positivo_maquina),
    'H2g · positivo B: isca de maquina dentro de README.md (isento so para '
    + 'o nome) REPROVA — a isencao e do padrao, nao do arquivo');

  /* positivo C, em duas partes: (1) `LICENSE` de fato aparece na lista
     REAL de arquivos varridos — não numa simulação, na mesma `TODOS` que
     H0/H1/H2a usam; (2) uma isca não-isenta plantada em conteúdo
     endereçado a `LICENSE` reprova, provando que o ponto cego fechou para
     os 10 padrões, não só para o do nome. */
  const licencaVarrida = TODOS.some(function (a) { return rel(a) === 'LICENSE'; });
  ok(licencaVarrida, 'H2h · positivo C (1/2): `LICENSE` aparece nos ' +
    TODOS.length + ' arquivos varridos de verdade — antes escapava por falta de extensao');
  ok(acusaSintetico('LICENSE', 'contato interno ' + doc.positivo_pessoal),
    'H2i · positivo C (2/2): isca pessoal plantada em LICENSE REPROVA — '
    + 'o ponto cego fechou para todos os padroes, nao so o do nome');

  /* A ISENÇÃO SÓ É HONESTA SE O ARQUIVO NÃO PUDER SER PUBLICADO.
     `termos-privados.json` contém, por construção, todos os termos que
     esta suíte proíbe — então ela o isenta. Isentar por acreditar seria
     trocar um detector por uma promessa; aqui a promessa se CONFERE:
     pergunta-se ao próprio git se o arquivo está ignorado.

     Este diretório, na extração de hoje, AINDA NÃO é um repositório git
     (sem `.git/` — confirmado antes de escrever este arquivo). `git
     check-ignore` sem repo não devolve "ignorado" nem "não ignorado": ele
     FALHA com erro de execução, e tratar essa falha como H2e reprovada
     seria mentir — a pergunta não pôde nem ser feita. Por isso o estado do
     repo é checado PRIMEIRO, e o caso "sem git" vira um terceiro estado
     explícito (pendente), nunca um silêncio nem uma reprovação disfarçada. */
  console.log('\nH2e · o arquivo isentado está ignorado pelo git (conferido, não suposto)');
  const cp = require('child_process');
  let ehRepoGit = true;
  try {
    cp.execSync('git rev-parse --is-inside-work-tree', { cwd: RAIZ, stdio: 'ignore' });
  } catch (e) {
    ehRepoGit = false;
  }
  if (!ehRepoGit) {
    console.log('  pendente H2e · ainda nao ha repo git neste diretorio (sem `.git/`) — '
      + '`git check-ignore` nao pode rodar sem repositorio.');
    console.log('           Isto nao e aprovacao nem reprovacao: e ausencia de git. Rode '
      + 'este gate de novo depois de `git init` aqui, ANTES do primeiro commit — se H2e '
      + 'reprovar naquele momento, NAO comite.');
  } else {
    try {
      cp.execSync('git check-ignore -q provas/termos-privados.json',
        { cwd: RAIZ, stdio: 'ignore' });
      ok(true, 'H2e · o arquivo isentado esta ignorado pelo git — a isencao nao '
        + 'pode virar vazamento (conferido em `git check-ignore`, nao suposto)');
    } catch (e) {
      ok(false, 'H2e · o arquivo isentado NAO esta ignorado pelo git — a isencao '
        + 'virou um buraco: `provas/termos-privados.json` pode ser publicado');
    }
  }
}

console.log('\n' + (falhas ? 'REPROVOU' : 'PASSOU') + ' — ' + (checks - falhas) + '/' + checks + ' controles');
process.exit(falhas ? 1 : 0);
