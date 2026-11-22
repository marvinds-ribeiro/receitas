// A fila de pedidos de receita nova, vista pelo app.
//
// O app não converte nada: ele escreve um pedido em pedidos/{id} e quem trabalha é o
// ajudante do computador de casa, que lê a fila, conversa com a IA e devolve um rascunho
// no mesmo documento. Daqui o app só acompanha o estado, guarda o rascunho revisado e
// manda salvar. Apagar pedido velho é trabalho do ajudante, nunca do celular.
//
// O ajudante dá sinal de vida em casa/ajudante.vistoEm. É por esse carimbo que a tela
// diz se o computador está ouvindo — sem ele, quem pede acha que o app travou.
//
// Este módulo conhece a nuvem e nada do DOM; a tela conhece o DOM e chega aqui.
import {
  aoMudarConta,
  contaAtual,
  gravar,
  observar,
  observarColecao,
  prontidao as nuvemPronta,
} from './nuvem.js';

export const TEXTO_MINIMO = 20;
export const TEXTO_MAXIMO = 20000;
// cinco minutos: o ajudante carimba bem mais amiúde que isso, e um cochilo de rede do
// computador de casa não pode virar "desligado" na cara de quem acabou de pedir
export const PRAZO_DO_AJUDANTE = 300000;

const COLECAO = 'pedidos';
const AJUDANTE = 'casa/ajudante';

let daNuvem = {};
let ajudante = null;
const ouvintes = new Set();

let jaPronta = false;
let marcarPronta = null;
const promessa = new Promise((r) => {
  marcarPronta = r;
});
export const prontidao = () => promessa;

let pararPedidos = null;
let pararAjudante = null;
let chegouPedidos = false;
let chegouAjudante = false;

function destravar() {
  if (jaPronta) return;
  jaPronta = true;
  marcarPronta();
}

function avisar() {
  for (const fn of ouvintes) fn();
}

// pronta só quando as DUAS leituras chegaram: a tela desenhada com a fila e sem o
// carimbo diria "desligado" por uma fração de segundo a quem tem o computador ligado
function talvezPronta() {
  if (chegouPedidos && chegouAjudante) destravar();
}

function assinar() {
  pararPedidos?.();
  pararAjudante?.();
  chegouPedidos = false;
  chegouAjudante = false;
  pararPedidos = observarColecao(COLECAO, (mapa) => {
    daNuvem = mapa ?? {};
    chegouPedidos = true;
    talvezPronta();
    avisar();
  });
  pararAjudante = observar(AJUDANTE, (documento) => {
    ajudante = documento ?? null;
    chegouAjudante = true;
    talvezPronta();
    avisar();
  });
}

// Só escuta com conta, pelo mesmo motivo escrito em etiquetas.js: escuta sem conta
// mantém conexão viva com o Firestore para colher um permission-denied garantido.
aoMudarConta((conta) => {
  if (conta) {
    assinar();
    return;
  }
  pararPedidos?.();
  pararAjudante?.();
  pararPedidos = null;
  pararAjudante = null;
  // sem conta, os pedidos da conta que saiu não ficam na memória: nem na lista, nem numa
  // folha aberta, nem no sinal do computador de casa
  daNuvem = {};
  ajudante = null;
  // a primeira notícia é sempre "sem conta", antes de a conta guardada chegar: só dá
  // para declarar pronta depois que a nuvem decidiu — se aí houver conta, quem destrava
  // é a primeira leitura da fila
  nuvemPronta().then(() => {
    if (!contaAtual()) destravar();
  });
  avisar();
});

/** Avisa quando a fila ou o carimbo do ajudante mudam. */
export function aoMudar(fn) {
  ouvintes.add(fn);
  return () => ouvintes.delete(fn);
}

const comId = (id) => ({ ...daNuvem[id], id });

/** Os pedidos vivos, o mais novo primeiro. Descartado é lixo à espera do ajudante. */
export function lista() {
  return Object.keys(daNuvem)
    .filter((id) => daNuvem[id]?.estado !== 'descartada')
    .map(comId)
    .sort((a, b) => (Number(b.criadoEm) || 0) - (Number(a.criadoEm) || 0));
}

export const pedido = (id) => (daNuvem[id] ? comId(id) : null);

/** Põe um pedido na fila e devolve o id dele. */
export async function criar({ texto, url = null }) {
  const tamanho = String(texto ?? '').trim().length;
  if (tamanho < TEXTO_MINIMO || tamanho > TEXTO_MAXIMO) {
    throw new Error(`O texto precisa ter entre ${TEXTO_MINIMO} e ${TEXTO_MAXIMO.toLocaleString('pt-BR')} caracteres.`);
  }
  const id = crypto.randomUUID();
  const agora = Date.now();
  await gravar(`${COLECAO}/${id}`, {
    tipo: 'texto',
    texto,
    url: url ?? null,
    arquivo: null,
    estado: 'na-fila',
    etapa: null,
    rascunho: null,
    avisos: [],
    fonte: null,
    erro: null,
    receitaId: null,
    por: contaAtual()?.email ?? null,
    criadoEm: agora,
    mudouEm: agora,
  });
  return id;
}

// Daqui para baixo, gravações parciais: `gravar` mescla, e o resto do pedido — o texto,
// quem pediu, quando — continua como o ajudante e o app deixaram.

/** Guarda a revisão em andamento, sem mudar o estado. */
export const guardarRascunho = (id, rascunho) =>
  gravar(`${COLECAO}/${id}`, { rascunho, mudouEm: Date.now() });

/** Manda o ajudante pôr a receita no caderno. */
export const salvar = (id, rascunho) =>
  gravar(`${COLECAO}/${id}`, { rascunho, estado: 'salvando', etapa: null, erro: null, mudouEm: Date.now() });

export const tentarDeNovo = (id) =>
  gravar(`${COLECAO}/${id}`, { estado: 'na-fila', etapa: null, erro: null, mudouEm: Date.now() });

export const descartar = (id) => gravar(`${COLECAO}/${id}`, { estado: 'descartada', mudouEm: Date.now() });

/** O computador de casa deu sinal de vida há pouco? */
export function ajudanteOuvindo(agora = Date.now()) {
  const visto = Number(ajudante?.vistoEm);
  return Number.isFinite(visto) && agora - visto < PRAZO_DO_AJUDANTE;
}

/** Como o pedido se chama na lista, antes e depois de virar receita. */
export function tituloDe(p) {
  const nome = p?.rascunho?.nome;
  if (typeof nome === 'string' && nome.trim()) return nome.trim();
  const texto = typeof p?.texto === 'string' ? p.texto.trim().replace(/\s+/g, ' ') : '';
  if (texto) return texto.slice(0, 40);
  try {
    return new URL(p?.url).host;
  } catch {
    return '';
  }
}

const FRASES = {
  'na-fila': () => 'Na fila',
  convertendo: (p) => p.etapa || 'Convertendo',
  rascunho: () => 'Pronta para revisar',
  salvando: (p) => p.etapa || 'Salvando',
  publicada: () => 'No caderno',
  falhou: () => 'Não deu certo',
};

export const fraseDoEstado = (p) => FRASES[p?.estado]?.(p) ?? '';
