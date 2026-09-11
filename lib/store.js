'use strict';

const fs = require('fs');
const path = require('path');
const { canonizar } = require('./orgao-canonico');
const modoSeco = require('./modo-seco');

/**
 * Store com dedupe — JSON Lines.
 *
 * Por que JSONL e não SQLite (justificativa, briefing pede 2 linhas):
 * Node core só tem `node:sqlite` como experimental a partir da 22.5, e o
 * briefing exige Node >=18 sem dependência paga/externa; JSONL é zero-dep,
 * legível a olho e, na escala pessoal deste radar (centenas/poucos milhares
 * de registros por ano), reescrita O(n) por operação é irrelevante. Migrar
 * para SQLite depois é troca mecânica isolada neste arquivo, se o volume
 * um dia justificar.
 *
 * Regra dura: dedupe por `id` (hash estável de órgão+área+data+url — ver
 * lib/hash.js). O mesmo edital nunca é salvo duas vezes nem notifica duas
 * vezes. `id` NUNCA muda aqui — migrá-lo renomearia os registros já
 * materializados no store e na planilha (ver lib/orgao-canonico.js, header).
 *
 * Onda dedupe-canonico: SEGUNDO nível de dedupe, mais grosso, ligado só
 * nesta função — a mesma vaga chega de fontes diferentes com `orgao` escrito
 * diferente (DOU: "Fundação Universidade Federal de São Carlos" / PCI:
 * "UFSCar - Universidade Federal de São Carlos"), o que faz o `id` (que
 * inclui `orgao` cru + `url`, e a url NUNCA bate entre fontes) divergir e a
 * vaga entrar duas vezes, contaminando a aba `Fila` do CRM. Depois de não
 * achar por `id` exato, `salvar` procura por `canonizar(orgao) + area +
 * inscricao_inicio` (`chaveCanonicaDedupe` abaixo) — mas SÓ entre registros de
 * FONTE DIFERENTE da que está chegando (ver comentário dentro de `salvar`:
 * intra-fonte a chave grossa colide falso positivo real, ex. dois
 * subeditais distintos do mesmo concurso PCI que resolvem pra mesma área).
 * Se colidir, o registro recém-chegado é DESCARTADO (o já salvo no store é
 * mantido, pode já ter sido julgado/notificado) e a colisão é logada via
 * `console.error` (fonte descartada, contra qual `id` existente, e a chave
 * que bateu) — nunca em silêncio. Ver lib/orgao-canonico.js para o que a
 * própria função `canonizar` deliberadamente NÃO tenta resolver.
 *
 * CONSERTO (medido: chave por `data_publicacao` batia 0 de 24 contra o store
 * real): `data_publicacao` tem semântica DIFERENTE por fonte — no DOU é a
 * data de PUBLICAÇÃO DO EDITAL (UFSCar: `2026-08-12`); na PCI é
 * `datas.inicio`, o INÍCIO DA JANELA DE INSCRIÇÃO (UFSCar: `2026-08-21`,
 * ver fontes/pci.js). Os dois nunca coincidem para o mesmo edital — a chave
 * antiga nunca deduplicava nada de verdade. O alinhamento real está em
 * `inscricao_inicio`: o DOU extrai essa data do texto integral do edital
 * (`fontes/dou.js enriquecer` → `extrator.extrairPeriodoInscricao`) e a PCI
 * já expõe `datas.inicio` diretamente nesse mesmo campo
 * (`fontes/pci.js normalizarParcial`) — para o edital UFSCar de 12/08/2026,
 * as duas fontes concordam em `2026-08-21`. Por isso a chave passa a usar
 * `inscricao_inicio`, não `data_publicacao`.
 */

/**
 * Chave de dedupe entre fontes — mais grossa que `id` porque IGNORA a url
 * (o campo que sempre diverge entre DOU e PCI para o mesmo edital) e usa
 * `canonizar(orgao)` no lugar do nome cru. Usa `inscricao_inicio`, NÃO
 * `data_publicacao` (ver comentário acima do cabeçalho — a razão do troca).
 * `null` quando falta qualquer um dos três componentes — regra de segurança
 * inegociável: um registro sem `orgao`/`area`/`inscricao_inicio` NUNCA
 * deduplica, nem contra outro incompleto nem contra um completo. Preferir a
 * duplicata visível (JB vê e ignora) ao sumiço invisível (vaga apagada por
 * chave frouxa que ele nunca saberá que existiu) — não há fallback para
 * `data_publicacao` aqui de propósito: foi exatamente esse fallback silencioso
 * que causou o bug que este comentário documenta.
 */
function chaveCanonicaDedupe(registro) {
  const orgaoCanonico = canonizar(registro && registro.orgao);
  const area = registro && registro.area;
  const inscricaoInicio = registro && registro.inscricao_inicio;
  if (!orgaoCanonico || !area || !inscricaoInicio) return null;
  return `${orgaoCanonico}|${area}|${inscricaoInicio}`;
}

const DATA_DIR = path.join(__dirname, '..', 'data');
const STORE_PATH = path.join(DATA_DIR, 'store.jsonl');

function garantirDiretorio(storePath) {
  const dir = path.dirname(storePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function carregarTudo(storePath = STORE_PATH) {
  if (!fs.existsSync(storePath)) return [];
  const conteudo = fs.readFileSync(storePath, 'utf8');
  return conteudo
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .map(l => JSON.parse(l));
}

/**
 * ÚNICO ponto de escrita física do store (o `fs.writeFileSync`). `salvar()` e
 * `atualizar()` computam o resultado inteiro (dedupe, patch) e só chamam
 * esta função no fim para persistir — por isso guardar SÓ aqui (e não em
 * cada uma delas) já cobre as duas, e cobre qualquer chamador futuro que
 * venha a existir. Ver lib/modo-seco.js para o porquê deste desenho.
 */
function salvarTudo(registros, storePath = STORE_PATH) {
  if (modoSeco.estaAtivo()) {
    console.log(`[store] MODO SECO — recusado gravar ${registros.length} registro(s) em ${storePath}; nada escrito.`);
    return;
  }
  garantirDiretorio(storePath);
  const conteudo = registros.map(r => JSON.stringify(r)).join('\n') + (registros.length ? '\n' : '');
  fs.writeFileSync(storePath, conteudo, 'utf8');
}

/**
 * Salva um registro se o id ainda não existir. Retorna { novo, registro }.
 * Se já existir, NÃO sobrescreve (o registro já salvo pode já ter sido
 * julgado/notificado) — retorna o que já está no store.
 */
function salvar(registro, storePath = STORE_PATH) {
  const registros = carregarTudo(storePath);

  const existentePorId = registros.find(r => r.id === registro.id);
  if (existentePorId) {
    return { novo: false, registro: existentePorId, motivo: 'id' };
  }

  // Restrito a candidatos de FONTE DIFERENTE (achado ao implementar — ver
  // header): dentro da MESMA fonte, orgao/subedital já são consistentes e o
  // `id` (que inclui url+subedital) já basta; aplicar a chave grossa também
  // intra-fonte colidiria FALSOS positivos reais (ex.: PCI "PROFESSOR -
  // DESIGN E MÍDIAS DIGITAIS" e "PROFESSOR - DESIGN/DESENHO INDUSTRIAL" do
  // MESMO concurso UFSCar resolvem pra MESMA área canônica "Design", mesmo
  // orgao, mesma data — dois subeditais REAIS e distintos apagando um ao
  // outro em silêncio, o erro mais grave que este módulo pode cometer). A
  // chave grossa serve exatamente para o caso que motivou a onda — a MESMA
  // vaga descrita por DUAS FONTES diferentes (DOU x PCI) — nunca para
  // diferenciar dois itens da mesma fonte, que já tem seu próprio contrato
  // de estabilidade (subedital) para isso.
  const chave = chaveCanonicaDedupe(registro);
  const existentePorChaveCanonica = chave
    ? registros.find(r => r.fonte !== registro.fonte && chaveCanonicaDedupe(r) === chave)
    : null;
  if (existentePorChaveCanonica) {
    // Nunca em silêncio (briefing): qual fonte foi descartada, contra qual
    // registro já salvo, e por qual chave — quem lê o log consegue auditar
    // se a chave está certa sem precisar adivinhar.
    console.error(
      `[store] dedupe por chave canônica — descartado registro NOVO id=${registro.id} fonte=${registro.fonte || '?'} ` +
        `orgao="${registro.orgao || ''}" url=${registro.url || '?'} — MANTIDO id=${existentePorChaveCanonica.id} ` +
        `fonte=${existentePorChaveCanonica.fonte || '?'} orgao="${existentePorChaveCanonica.orgao || ''}" — chave="${chave}"`
    );
    return { novo: false, registro: existentePorChaveCanonica, motivo: 'chave_canonica', chaveCanonica: chave, descartado: registro };
  }

  registros.push(registro);
  salvarTudo(registros, storePath);
  return { novo: true, registro, motivo: 'novo' };
}

function existeId(id, storePath = STORE_PATH) {
  return carregarTudo(storePath).some(r => r.id === id);
}

function atualizar(id, patch, storePath = STORE_PATH) {
  const registros = carregarTudo(storePath);
  const idx = registros.findIndex(r => r.id === id);
  if (idx === -1) return null;
  registros[idx] = { ...registros[idx], ...patch };
  salvarTudo(registros, storePath);
  return registros[idx];
}

function listar(filtro = () => true, storePath = STORE_PATH) {
  return carregarTudo(storePath).filter(filtro);
}

module.exports = {
  STORE_PATH,
  DATA_DIR,
  carregarTudo,
  salvarTudo,
  salvar,
  existeId,
  atualizar,
  listar,
  chaveCanonicaDedupe
};
