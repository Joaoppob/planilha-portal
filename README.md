# planilha-portal

Um CRM pessoal em Google Sheets: hub de notícia, vaga e tarefa, o ponto de encontro entre você e seu agente.

## Se você é humano, leia aqui

Esta planilha é um CRM pessoal dentro do Google Sheets: um hub de notícia, vaga e concurso (oportunidade), tarefa e projeto, tudo numa peça só, em vez de espalhado em abas soltas de navegador.

Três camadas dividem o trabalho por dono. Um robô roda como tarefa agendada no seu próprio computador e escreve o que é fato: a vaga que saiu, a notícia do dia, se você já é elegível pra aquele edital. A própria planilha deriva desses fatos as vistas que você lê: ranking, funil, painel do dia. E você, com seu agente, escreve a terceira camada: tarefa, fila de candidatura, projeto, diário de decisão. Essa parte é território exclusivo de vocês dois.

É esse desenho que faz da planilha um ponto de encontro entre você e seu agente: você decide o que fazer, o agente ajuda a registrar e organizar a decisão, e o robô alimenta os dois com fato atualizado todo dia. Se a planilha for apagada por engano, a estrutura inteira (aba, fórmula, formatação) volta a partir do código; o conteúdo digitado na camada de decisão é o único que precisaria ser refeito à mão.

Aviso prático: isto não é um produto pronto pra instalar e rodar em cinco minutos. Alguém precisa criar a própria planilha, a própria credencial do Google, e calibrar os próprios critérios (área de interesse, palavra-chave de vaga boa, instituição relevante). Sem isso o robô roda, mas não sabe o que está procurando.

## Se você é um Agente, leia aqui

Contrato operacional. Precisão, não persuasão.

### Mapa de pastas e arquivos

- **`radar.js`**: entry point da trilha VAGA. Comandos: `coletar`, `backfill`, `relatorio-backfill`, `reprocessar`, `relatorio-jb`, `julgar`, `extrair-llm`, `notificar`, `ativar-notificacoes`, `sincronizar-sheets`, `status`, `testar`.
- **`noticias.js`**: entry point da trilha NOTÍCIA, pipeline irmão de `radar.js`, nunca extensão dele (schema, store e rubrica próprios). Comandos: `coletar`, `recalcular`, `status`, `clusters`, `recorte`, `sincronizar-sheets`.
- **`fontes/`**: os 7 coletores da trilha vaga: `dou.js`, `gupy.js`, `programathor.js`, `pci.js`, `weworkremotely.js`, `selecaoacademica.js`, `vagas.js`. Contrato de fonte documentado em `fontes/index.js`.
- **`fontes-noticias/`**: as fontes da trilha notícia, por aba de destino: `geral.js`, `ia.js`, `trabalho.js`, `ciencia.js`, mais `hackernews.js` e `reddit.js`. Contrato de fonte documentado em `fontes-noticias/index.js`.
- **`lib/`**: módulos da trilha vaga: `env.js` (carrega `.env`), `store.js` (persistência em `data/store.jsonl`), `schema.js`, `hash.js`, `keyword-filtro.js`, `vaga-docente.js`, `vaga-mercado.js`, `score.js`/`score-mercado.js` (rubrica 0-85), `elegibilidade.js`, `ollama.js` (extrator LLM local, opcional), `telegram.js`, `saude.js`/`saude-alerta.js`, `datas.js`, `retry.js`, `sheets.js` (autenticação Google por JWT RS256 assinado à mão com `node:crypto`, push unidirecional Node → Sheets), entre outros.
- **`lib-noticias/`**: módulos da trilha notícia: `ancoras.js`, `cluster.js`, `frescor.js`, `ranking.js`, `rss.js`, `store-noticias.js` (persistência em `data/noticias.jsonl`).
- **`_norman/`**: constrói a planilha inteira por código. `construir.js` cria/atualiza as 18 abas, aplica fórmulas e formatação (idempotente); `formulas.js` é a fonte canônica de toda fórmula `ARRAYFORMULA()`/`FILTER()` que vai pra planilha; `formatar.js` decide ordem e ocultação de aba; `estado.js` colhe/restaura a aba `_estado`; `verificar.js` audita a planilha viva (links, `gid`, fórmulas) contra o que o código espera; `gerar-readme.js` regenera **`docs/PLANILHA.md`** a partir de `formulas.js`, e só isso: o próprio cabeçalho do arquivo registra que o alvo nunca é `README.md`.
- **`config/`**: `perfil.example.json`, `keywords.example.json`, `keywords-mercado.example.json`, `negativos.example.json`, `keywords-noticias.example.json` são templates neutros; os arquivos reais (`perfil.json`, `keywords.json`, etc., sem `.example`) não existem neste repositório, são gerados por cópia e ficam fora do controle de versão. `notificacao.json`, `saude.json` e `universidades-uf.json` são reais e versionados porque não carregam dado pessoal.
- **`provas/`**: `higiene.js` é o gate de sanitização deste repositório; `termos-privados.json` é a lista que ele varre.
- **`tests/`**: suíte `*.test.js`, executada por `node radar.js testar` (também exposto como `npm test`).
- **`SETUP.md`**: roteiro completo de instalação do zero: criar a planilha, criar a service account, preencher `.env`, construir as abas, agendar a tarefa no Windows. Tem três pontos `[a definir]` (nomenclatura do Console do Google, setup do bot do Telegram, conteúdo de `config/perfil.json`/`keywords*.json`); não prometa o que eles não cobrem.
- **`docs/PLANILHA.md`**: anatomia das 18 abas (camada, fórmula, quem escreve). **Gerado** por `_norman/gerar-readme.js`; editar à mão é inútil, a próxima geração apaga a edição.
- **`.env.example`**: template das variáveis de ambiente (Telegram + Google Sheets).

### Vocabulário: as três camadas

- **FATO**: dado cru. Abas `dados (não edite)` e `notícias (não edite)`, mais `_calc`/`_estado` (auxiliares, também FATO). Só o robô escreve, via `radar.js sincronizar-sheets` / `noticias.js sincronizar-sheets` e `lib/sheets.js`. Cada sync sobrescreve a aba inteira.
- **VISTA**: fórmula pura derivada de FATO: `Concursos`, `Empregos`, `Concursos · tudo`, `Hoje`, `Notícias`, `IA`, `Trabalho`, `Ciência`. Nenhum valor é digitado nelas; a fórmula em si só é escrita por `_norman/construir.js`, na construção ou reconstrução da planilha.
- **ESTADO**: escrita pela pessoa, ou pelo agente dela a pedido, e nunca pelo robô de coleta: `Tarefas`, `Fila`, `Candidaturas`, `Projetos`, `Diário`, `Etapas`. A aba oculta `_estado` é a única cópia persistente do que foi marcado (ex.: "Inscrito"), e sobrevive à reescrita diária de FATO/VISTA.

### Comandos exatos

```
node radar.js coletar [--data DD-MM-AAAA] [--dry-run]
node radar.js backfill --de DD-MM-AAAA --ate DD-MM-AAAA [--throttle-ms N] [--alertar] [--dry-run]
node radar.js julgar [--ollama off] [--dry-run]
node radar.js notificar [--dry-run]
node radar.js sincronizar-sheets [--dry-run]
node radar.js status
node radar.js testar

node noticias.js coletar [--dry-run] [--sem-reddit] [--fonte id[,id]] [--jaccard N]
node noticias.js recalcular [--jaccard N] [--janela-horas N]
node noticias.js status
node noticias.js sincronizar-sheets [--dry-run]

node _norman/construir.js
node _norman/gerar-readme.js
node _norman/verificar.js
node provas/higiene.js
```

Todo comando aceita `--help`/`-h` e recusa flag desconhecida antes de qualquer efeito (leitura ou escrita). Lista completa de flags por comando: `FLAGS_VALIDAS`/`USOS` no topo de `radar.js` e `noticias.js`.

### Gatilhos

- Usuário pede pra "ver o que tem de vaga nova" ou "rodar a coleta": `node radar.js coletar`. Peça confirmação antes de rodar sem `--dry-run` se não houver certeza de que é seguro tocar a rede.
- Usuário pede pra "sincronizar com a planilha": confirme que `.env` está preenchido; rode primeiro `--dry-run`; só rode sem `--dry-run` com autorização explícita, porque isso escreve na planilha de produção de alguém.
- Usuário pede pra "adicionar uma fonte de notícia nova": edite o arquivo de categoria certo em `fontes-noticias/` seguindo o contrato descrito no cabeçalho de `fontes-noticias/index.js`; não toque em `noticias.js`.
- Usuário pede pra "reconstruir a planilha" ou "aplicar mudança de fórmula": `node _norman/construir.js`. Nunca rode isso sem confirmação explícita do usuário: é idempotente, mas sobrescreve fórmula e formatação de uma planilha real.
- Usuário pede pra "atualizar a documentação das abas": `node _norman/gerar-readme.js`. Isso regenera `docs/PLANILHA.md`, nunca `README.md`.
- Usuário pede pra "rodar os testes": `node radar.js testar` (equivalente a `npm test`).
- Antes de qualquer publicação ou envio deste repositório pra fora: `node provas/higiene.js` precisa passar.

### Pré-condições

- Node.js >= 18. Nenhum `npm install`: o projeto tem zero dependências por doutrina (`package.json` → `dependencies: {}`).
- `config/perfil.json`, `config/keywords.json`, `config/keywords-mercado.json`, `config/negativos.json`, `config/keywords-noticias.json` precisam existir (copiados dos `.example.json` correspondentes) e estar preenchidos com dado real do usuário antes de `coletar`/`julgar` produzirem resultado que signifique algo.
- `.env` preenchido (ver `SETUP.md`) para `sincronizar-sheets` e `notificar` funcionarem contra rede real. Sem as três variáveis do Google Sheets, o sync cai em dry-run sozinho.
- Planilha e service account do Google já criadas e a planilha compartilhada com o `client_email` da service account como Editor (`SETUP.md` §1-2).

### O que NÃO fazer

- **Nunca escreva em aba FATO ou em aba VISTA (fórmula) por fora do caminho descrito acima.** FATO é propriedade exclusiva do robô (`sincronizar-sheets`); VISTA é derivada e só ganha fórmula nova por `_norman/construir.js`. Qualquer escrita direta por API do Sheets fora desses dois caminhos quebra a garantia central do projeto: que a planilha inteira é reconstruível a partir do código.
- Nunca edite `docs/PLANILHA.md` à mão. É gerado; a próxima rodada de `gerar-readme.js` apaga a edição.
- Nunca rode `radar.js sincronizar-sheets`, `noticias.js sincronizar-sheets`, `_norman/construir.js` ou qualquer comando que grave na planilha sem confirmação explícita do usuário. Toca produção real de uma pessoa.
- Nunca invente valor de `config/perfil.json` ou de qualquer `keywords*.json` por inferência. Dado de perfil que falta é pergunta ao usuário, não suposição.
- Nunca rode `npm install`. Zero dependências é doutrina; necessidade nova se resolve com API nativa do Node (`fetch`, `node:crypto`) ou é levada ao usuário antes de virar dependência.
- Nunca comite `.env`, os `config/*.json` reais (sem `.example`), nem nada dentro de `data/`, `logs/`, `tmp/`. Ver `.gitignore` para a lista completa e o porquê de cada entrada.
- Nunca trate `score_minimo` de `config/notificacao.json` como valor a copiar de outro projeto ou de outra pessoa. Ele se deriva da coorte de quem instala; o próprio arquivo documenta o método de cálculo. Se for preciso mencioná-lo, a instrução certa é "calibre com os seus dados", nunca um número pronto.

Instalação completa: `SETUP.md`. Anatomia das 18 abas (camada, fórmula, dono): `docs/PLANILHA.md`, que é gerado, não editar.

## Licença e autoria

João Pedro Barros. Este repositório é distribuído sob **MIT**. Texto completo em [`LICENSE`](LICENSE); `package.json` declara `"license": "MIT"`.

Disclaimer: Foi utilizada IA para: escrita deste README; Modelo: Claude Sonnet 5.
