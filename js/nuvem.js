// A ÚNICA porta entre o app e o Firebase.
//
// Nenhuma tela importa o SDK direto. Tudo passa por aqui, e é por isso que os testes
// conseguem trocar o Firestore inteiro por um dublê em memória sem tocar numa linha
// das telas: o import map troca app/js/firebase/*, e este módulo entra nos testes
// exatamente como vai para o ar.
//
// AS DUAS PORTAS DO APP, que nunca se confundem:
//   · a senha "cantina" abre o caderno para LER — é a porta da 1.0 e não mudou;
//   · a conta Google libera EDITAR o que é vivo (etiquetas, cardápio, lista).
// Sem conta, sem rede ou com o Firebase fora do ar, o app inteiro continua legível.
// Só as edições ficam bloqueadas, com aviso escrito. Ler nunca depende da nuvem.
//
// POR QUE BLOQUEAR EM VEZ DE ENFILEIRAR: o Firestore aceitaria a edição offline e a
// mandaria depois, sozinho. Num cardápio de duas pessoas isso é armadilha — a escrita
// que dormiu três dias no bolso acorda e passa por cima do que o outro decidiu ontem.
// Aqui a edição offline é recusada na cara, na hora, com o motivo escrito.
import { configuracao } from './nuvem-config.js';
import { initializeApp } from './firebase/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from './firebase/firebase-auth.js';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  doc,
  collection,
  onSnapshot,
  setDoc,
} from './firebase/firebase-firestore.js';

/** Erro com motivo legível: quem chama decide o que escrever na tela. */
export class ErroDeNuvem extends Error {
  constructor(motivo, mensagem) {
    super(mensagem);
    this.name = 'ErroDeNuvem';
    this.motivo = motivo;
  }
}

export const RECADOS = {
  desligada: 'As edições compartilhadas ainda não foram ligadas neste app.',
  'sem-rede': 'Sem conexão agora. Dá para ler tudo; editar volta quando a rede voltar.',
  'sem-conta': 'Entre com o Google para editar as etiquetas e o cardápio.',
  'sem-acesso': 'Esta conta não tem acesso ao caderno da casa.',
};

// Documento que existe só para perguntar "esta conta pode?". Nunca guarda nada: quem
// responde é a regra do Firestore, com permissão ou com permission-denied.
const SONDA = 'casa/acesso';
const PRAZO_DA_SONDA = 2500;

const ligavel = Boolean(configuracao?.apiKey);

let bd = null;
let auth = null;
let conta = null;
let acesso = 'indefinido'; // indefinido · liberado · negado
let pararSonda = null;
let ultimoEstado = null;

const ouvintesDeConta = new Set();
const ouvintesDeNuvem = new Set();

if (ligavel) {
  const app = initializeApp(configuracao);
  auth = getAuth(app);
  // Persistência offline nativa: é ela que faz a leitura do cardápio funcionar na
  // cozinha sem sinal. Multi-aba porque o app aberto no PC e no celular da mesma
  // pessoa não pode brigar pelo cache.
  bd = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
}

// ------------------------------------------------------------------------- estado

export function estadoDaNuvem() {
  if (!ligavel) return 'desligada';
  if (!navigator.onLine) return 'sem-rede';
  if (!conta) return 'sem-conta';
  if (acesso === 'negado') return 'sem-acesso';
  return 'ligada';
}

export const podeEditar = () => estadoDaNuvem() === 'ligada';

export const contaAtual = () => (conta ? { ...conta } : null);

function avisarNuvem() {
  const estado = estadoDaNuvem();
  if (estado === ultimoEstado) return;
  ultimoEstado = estado;
  for (const fn of ouvintesDeNuvem) fn(estado);
}

function avisarConta() {
  const atual = contaAtual();
  for (const fn of ouvintesDeConta) fn(atual);
  avisarNuvem();
}

export function aoMudarConta(fn) {
  ouvintesDeConta.add(fn);
  fn(contaAtual());
  return () => ouvintesDeConta.delete(fn);
}

export function aoMudarNuvem(fn) {
  ouvintesDeNuvem.add(fn);
  fn(estadoDaNuvem());
  return () => ouvintesDeNuvem.delete(fn);
}

// ------------------------------------------------------------------------ prontidão
// A conta guardada chega assíncrona, e o veredito das regras chega depois dela. Quem
// desenha a tela (e o teste que a julga) precisa saber quando parar de adivinhar.

let marcarPronta = null;
const promessaPronta = new Promise((resolver) => {
  marcarPronta = resolver;
});
let jaPronta = false;

function ficouPronta() {
  if (jaPronta) return;
  jaPronta = true;
  marcarPronta();
}

export const prontidao = () => promessaPronta;

// ---------------------------------------------------------------------- sonda de acesso

function vigiarAcesso() {
  pararSonda?.();
  pararSonda = null;
  acesso = 'indefinido';
  if (!ligavel || !conta) {
    ficouPronta();
    return;
  }
  if (!navigator.onLine) {
    // sem rede não há veredito possível; a edição já está bloqueada de qualquer jeito
    ficouPronta();
    return;
  }
  const relogio = setTimeout(ficouPronta, PRAZO_DA_SONDA);
  pararSonda = onSnapshot(
    doc(bd, SONDA),
    () => {
      clearTimeout(relogio);
      acesso = 'liberado';
      avisarNuvem();
      ficouPronta();
    },
    (erro) => {
      clearTimeout(relogio);
      acesso = erro?.code === 'permission-denied' ? 'negado' : 'indefinido';
      avisarNuvem();
      ficouPronta();
    }
  );
}

if (ligavel) {
  onAuthStateChanged(auth, (usuario) => {
    conta = usuario
      ? { email: usuario.email ?? '', nome: usuario.displayName || (usuario.email ?? '').split('@')[0] }
      : null;
    vigiarAcesso();
    avisarConta();
  });
  addEventListener('online', avisarNuvem);
  addEventListener('offline', avisarNuvem);
} else {
  ficouPronta();
}

// --------------------------------------------------------------------------- conta

export async function entrar() {
  if (!ligavel) throw new ErroDeNuvem('desligada', RECADOS.desligada);
  const provedor = new GoogleAuthProvider();
  // sempre perguntar de qual conta — a casa tem duas, no mesmo aparelho às vezes
  provedor.setCustomParameters({ prompt: 'select_account' });
  try {
    await signInWithPopup(auth, provedor);
  } catch (erro) {
    // fechar a janelinha do Google não é falha do app: devolve o motivo e segue
    const motivo = navigator.onLine ? 'sem-conta' : 'sem-rede';
    throw new ErroDeNuvem(motivo, RECADOS[motivo]);
  }
  return contaAtual();
}

export async function sairDaConta() {
  if (!ligavel) return;
  await signOut(auth);
}

/** Sair e entrar de novo — a saída para quem entrou com a conta errada. */
export async function trocarDeConta() {
  await sairDaConta();
  return entrar();
}

// ---------------------------------------------------------------------------- dados

/**
 * Observa um documento. Entrega o que já existe (do cache, se estiver sem rede) e
 * depois cada mudança. Devolve a função de desinscrever.
 */
export function observar(caminho, aoReceber) {
  if (!ligavel) {
    Promise.resolve().then(() => aoReceber(null));
    return () => {};
  }
  return onSnapshot(
    doc(bd, caminho),
    (instantaneo) => aoReceber(instantaneo.exists() ? instantaneo.data() : null),
    (erro) => {
      if (erro?.code === 'permission-denied') {
        acesso = 'negado';
        avisarNuvem();
      }
      // documento ilegível não pode virar tela quebrada: entrega vazio e a tela avisa
      aoReceber(null);
    }
  );
}

/**
 * Observa uma coleção inteira e entrega um mapa { id do documento: conteúdo }.
 *
 * Uma escuta só para as 64 etiquetas, em vez de 64 escutas de um documento cada: o
 * plano grátis conta operação de leitura, e o app abre no celular todo santo dia.
 */
export function observarColecao(caminho, aoReceber) {
  if (!ligavel) {
    Promise.resolve().then(() => aoReceber({}));
    return () => {};
  }
  return onSnapshot(
    collection(bd, caminho),
    (instantaneo) => {
      const mapa = {};
      instantaneo.forEach((documento) => {
        mapa[documento.id] = documento.data();
      });
      aoReceber(mapa);
    },
    (erro) => {
      if (erro?.code === 'permission-denied') {
        acesso = 'negado';
        avisarNuvem();
      }
      aoReceber({});
    }
  );
}

/** Grava mesclando. Recusa antes de tocar na rede quando não dá para editar. */
export async function gravar(caminho, dados) {
  const estado = estadoDaNuvem();
  if (estado !== 'ligada') throw new ErroDeNuvem(estado, RECADOS[estado] ?? 'não dá para editar agora');
  try {
    await setDoc(doc(bd, caminho), dados, { merge: true });
  } catch (erro) {
    if (erro?.code === 'permission-denied') {
      acesso = 'negado';
      avisarNuvem();
      throw new ErroDeNuvem('sem-acesso', RECADOS['sem-acesso']);
    }
    throw new ErroDeNuvem('sem-rede', RECADOS['sem-rede']);
  }
}
