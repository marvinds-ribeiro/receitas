// Onde a lista de compras mora — e quem manda nela.
//
// TRÊS MODOS, e o modo decide tudo:
//
//   local      ninguém entrou com o Google neste aparelho. A lista é do aparelho, como
//              na 1.0, e funciona inteira offline. A 1.0 não pode piorar para quem nunca
//              quis nuvem nenhuma.
//   nuvem      conta autorizada e rede. A lista mora em casa/compras e os dois celulares
//              veem a mesma coisa: o que um risca some da conta do outro na hora.
//   bloqueado  tem conta, mas está sem rede ou sem acesso. Mostra a última conhecida e
//              recusa mexer, pela mesma razão do cardápio: edição que dorme no bolso e
//              acorda depois passa por cima do que o outro decidiu.
//
// No modo local a leitura vai direto ao localStorage a cada consulta, sem cópia em
// memória. É o que faz a lista semeada por fora (ou por outra aba) aparecer ao remontar
// a tela, e é o comportamento que os 14 cenários da 1.0 cobram.
import {
  RECADOS,
  aoMudarConta,
  aoMudarNuvem,
  contaAtual,
  estadoDaNuvem,
  gravar,
  observar,
} from './nuvem.js';

const CAMINHO = 'casa/compras';
const CHAVE_ESCOLHAS = 'receitas.lista';
const CHAVE_MARCADOS = 'receitas.lista.marcados';
const CHAVE_MIGRADA = 'receitas.lista.migrada';

const MIN_PORCOES = 1;
const MAX_PORCOES = 60;

const ouvintes = new Set();
let daNuvem = null; // último instantâneo conhecido; null enquanto nada chegou
let parar = null;
let migrada = false;
// marcas riscadas sem rede, esperando a rede voltar para subir
let marcasPendentes = false;

try {
  migrada = localStorage.getItem(CHAVE_MIGRADA) === '1';
} catch {
  migrada = true; // sem localStorage não há o que migrar
}

// ------------------------------------------------------------------ arrumação

function arrumarEscolhas(cru) {
  const limpo = {};
  if (!cru || typeof cru !== 'object' || Array.isArray(cru)) return limpo;
  for (const [id, porcoes] of Object.entries(cru)) {
    const n = Math.round(Number(porcoes));
    if (Number.isFinite(n) && n >= MIN_PORCOES) limpo[id] = Math.min(n, MAX_PORCOES);
  }
  return limpo;
}

const arrumarMarcados = (cru) => (Array.isArray(cru) ? [...new Set(cru.map(String))] : []);

// ------------------------------------------------------------------ o aparelho

function lerDoAparelho() {
  try {
    return {
      escolhas: arrumarEscolhas(JSON.parse(localStorage.getItem(CHAVE_ESCOLHAS) || '{}')),
      marcados: arrumarMarcados(JSON.parse(localStorage.getItem(CHAVE_MARCADOS) || '[]')),
    };
  } catch {
    return { escolhas: {}, marcados: [] };
  }
}

function gravarNoAparelho({ escolhas, marcados }) {
  try {
    localStorage.setItem(CHAVE_ESCOLHAS, JSON.stringify(escolhas));
    localStorage.setItem(CHAVE_MARCADOS, JSON.stringify(marcados));
  } catch {
    // cota cheia ou armazenamento bloqueado: a sessão continua de pé
  }
}

function anotarMigrada() {
  migrada = true;
  try {
    localStorage.setItem(CHAVE_MIGRADA, '1');
  } catch {}
}

// ---------------------------------------------------------------------- modos

export function modo() {
  // sem conta nenhuma o aparelho manda, com ou sem rede — é a lista da 1.0
  if (!contaAtual()) return 'local';
  return estadoDaNuvem() === 'ligada' ? 'nuvem' : 'bloqueado';
}

/** Montar a lista — escolher receitas, mudar porções, apagar — precisa de rede. */
export const podeMexer = () => modo() !== 'bloqueado';

/**
 * Riscar item, não. A marca é LOCAL PRIMEIRO, sempre.
 *
 * É o gesto mais repetido do app e acontece no mercado, que é justamente onde o sinal
 * morre — e na 1.0 funcionava offline. Então ela pega na hora, fica no aparelho e sobe
 * sozinha quando a rede voltar. O preço, aceito de olhos abertos: dois celulares
 * riscando ao mesmo tempo sem sinal, quem sincronizar por último manda.
 */
export const podeMarcar = () => true;

/** O que escrever na tela quando a rede não deixa montar a lista. */
export function recado() {
  if (podeMexer()) return null;
  if (estadoDaNuvem() === 'sem-rede') {
    return 'Sem conexão. Dá para riscar o que já foi para o carrinho — isso sobe sozinho ' +
      'quando a rede voltar. Mudar as receitas da lista, só com rede.';
  }
  return RECADOS[estadoDaNuvem()] ?? null;
}

/** O estado que vale agora. */
export function estado() {
  if (modo() === 'local') return lerDoAparelho();
  const base = daNuvem ?? lerDoAparelho();
  // com marca pendente, quem manda nas marcas é o aparelho: foi ele que riscou
  if (!marcasPendentes) return base;
  return { escolhas: base.escolhas, marcados: lerDoAparelho().marcados };
}

export const escolhas = () => estado().escolhas;
export const marcados = () => estado().marcados;

// ------------------------------------------------------------------- ouvintes

export function aoMudar(fn) {
  ouvintes.add(fn);
  return () => ouvintes.delete(fn);
}

const avisar = () => {
  for (const fn of ouvintes) fn();
};

// -------------------------------------------------------------------- a nuvem

function assinar() {
  parar?.();
  parar = observar(CAMINHO, (documento) => {
    daNuvem = {
      escolhas: arrumarEscolhas(documento?.escolhas),
      marcados: arrumarMarcados(documento?.marcados),
    };
    // uma cópia de socorro no aparelho: se a conta sair, a lista não some junto.
    // Com marca pendente, as marcas do aparelho são preservadas — elas ainda não
    // subiram, e sobrescrevê-las aqui apagaria o que foi riscado no mercado.
    gravarNoAparelho(
      marcasPendentes
        ? { escolhas: daNuvem.escolhas, marcados: lerDoAparelho().marcados }
        : daNuvem
    );
    if (!migrada && (Object.keys(daNuvem.escolhas).length || daNuvem.marcados.length)) {
      // a nuvem já tem lista: ela manda, e a migração deste aparelho está encerrada
      anotarMigrada();
    }
    avisar();
  });
}

// Escuta enquanto EXISTE CONTA — não só quando a rede está de pé.
//
// É para isto que a persistência offline do Firestore foi ligada: sem sinal, o onSnapshot
// entrega a última cópia guardada, e a lista aparece inteira no mercado sem rede. Já sem
// conta nenhuma não se assina nada: escuta que a regra vai recusar mantém conexão viva em
// toda abertura do app para colher um permission-denied garantido.
aoMudarConta((conta) => {
  if (conta) {
    assinar();
    return;
  }
  parar?.();
  parar = null;
  daNuvem = null;
  avisar();
});

// Mudou o estado sem mudar a conta: caiu a rede, ou voltou. Voltando, o que foi
// riscado no mercado sobe sozinho, sem ninguém pedir.
aoMudarNuvem((estadoAtual) => {
  if (estadoAtual === 'ligada' && marcasPendentes) {
    subirMarcasPendentes().catch(() => {});
    return;
  }
  avisar();
});

async function subirMarcasPendentes() {
  const doAparelho = lerDoAparelho();
  marcasPendentes = false;
  try {
    // as marcas DESTE aparelho, não uma fusão com as que chegaram no meio-tempo:
    // fundir ressuscitaria tudo para quem tocou em "Tirar tudo do carrinho" sem sinal
    await enviar({ escolhas: estado().escolhas, marcados: doAparelho.marcados });
  } catch {
    // a rede piscou de novo: continuam pendentes e sobem na próxima
    marcasPendentes = true;
  }
  avisar();
}

/**
 * A migração: uma vez por aparelho, sem perguntar nada.
 *
 * Roda ao montar a tela da lista, não só quando o instantâneo chega — quem acabou de
 * entrar com o Google já tinha a lista no aparelho antes de o app subir, e a checagem
 * precisa acontecer depois de a nuvem ter respondido.
 *
 * Se a nuvem já tem lista, ela manda: o aparelho NÃO sobrepõe o que o outro montou.
 */
export async function migrarSePreciso() {
  if (migrada || modo() !== 'nuvem' || daNuvem === null) return false;
  const nuvemVazia = !Object.keys(daNuvem.escolhas).length && !daNuvem.marcados.length;
  const doAparelho = lerDoAparelho();
  if (!nuvemVazia) {
    anotarMigrada();
    return false;
  }
  if (!Object.keys(doAparelho.escolhas).length && !doAparelho.marcados.length) return false;
  anotarMigrada();
  await enviar(doAparelho);
  return true;
}

// ------------------------------------------------------------------ gravações

class ListaTrancada extends Error {
  constructor(motivo) {
    super(motivo ?? 'não dá para mexer na lista agora');
    this.name = 'ListaTrancada';
  }
}

async function enviar(novo) {
  await gravar(CAMINHO, {
    escolhas: novo.escolhas,
    marcados: novo.marcados,
    por: contaAtual()?.email ?? null,
  });
  daNuvem = novo;
}

async function guardar(novo) {
  const onde = modo();
  if (onde === 'bloqueado') throw new ListaTrancada(recado());
  if (onde === 'nuvem') await enviar(novo);
  gravarNoAparelho(novo);
  avisar();
}

export async function definirEscolhas(novas) {
  const atual = estado();
  await guardar({ escolhas: arrumarEscolhas(novas), marcados: atual.marcados });
}

/**
 * Riscar nunca é recusado. Sem rede, a marca fica no aparelho e vira pendência —
 * quem sobe é a volta da rede.
 */
export async function definirMarcados(novos) {
  const atual = estado();
  const novo = { escolhas: atual.escolhas, marcados: arrumarMarcados(novos) };
  gravarNoAparelho(novo);
  if (modo() === 'nuvem') {
    try {
      await enviar(novo);
    } catch {
      marcasPendentes = true;
    }
  } else if (modo() === 'bloqueado') {
    marcasPendentes = true;
  }
  avisar();
}

export async function definirTudo(novas, novos) {
  await guardar({ escolhas: arrumarEscolhas(novas), marcados: arrumarMarcados(novos) });
}

export async function limparTudo() {
  await guardar({ escolhas: {}, marcados: [] });
}
