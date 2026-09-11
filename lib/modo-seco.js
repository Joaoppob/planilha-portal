'use strict';

/**
 * MODO SECO — a cerca de baixo nível contra o incidente da Onda 12-13
 * (RELATORIO-ONDA-12-13.md §Nota de segurança): `node radar.js coletar
 * --help` caiu no comando real e escreveu 3 registros em produção porque
 * `--dry-run`, na época, só suprimia o alerta do Telegram — a escrita em
 * `data/store.jsonl`/`data/saude.jsonl` rodava incondicionalmente.
 *
 * A cura NÃO é espalhar `if (!opts['dry-run'])` pelas dezenas de call sites
 * de `store.salvar`/`store.atualizar`/`saude.registrar`/etc — essa é
 * exatamente a cerca que acabou de falhar (regra escrita que ninguém
 * confere é pior que regra ausente). Em vez disso, um único flag global de
 * processo, ativado UMA vez pelo dispatch da CLI (`radar.js main()`) quando
 * `--dry-run` é reconhecido, e checado pelos módulos de ESCRITA no ponto
 * mais baixo possível — a função que efetivamente toca disco/rede
 * (`store.js salvarTudo`, `saude.js registrar`, `backfill-progresso.js
 * salvar`, `sheets.js chamarSheetsAPI`/`obterAccessToken`, `telegram.js
 * enviarUmaMensagem`).
 *
 * Isso significa: um comando novo, escrito daqui a seis meses por alguém que
 * nunca leu este arquivo, que esqueça de checar `opts['dry-run']` antes de
 * chamar `store.atualizar(...)`, AINDA ASSIM não escreve nada em modo seco —
 * porque `store.atualizar` chama `salvarTudo` por baixo, e `salvarTudo`
 * recusa sozinho. A única forma de vazar uma escrita real em modo seco seria
 * um módulo de escrita NOVO que não passe por nenhum dos pontos acima — e
 * isso é detectável por auditoria de código (grep por
 * `writeFileSync`/`appendFileSync`/`fetch` fora de `lib/`), não por
 * disciplina de quem escreve o comando.
 *
 * Flag de PROCESSO (não de request): cada invocação de `node radar.js ...`
 * é um processo Node novo, então não há risco de vazamento entre comandos
 * diferentes — mas `ativar()`/`desativar()` são expostos mesmo assim, para
 * testes poderem ligar/desligar o modo seco em isolamento
 * (tests/dry-run-cerca-seca.test.js) sem precisar de um processo por caso.
 */

let ativo = false;

function ativar() {
  ativo = true;
}

function desativar() {
  ativo = false;
}

function estaAtivo() {
  return ativo;
}

module.exports = { ativar, desativar, estaAtivo };
