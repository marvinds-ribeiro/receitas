// O cardápio da semana: dez vagas que moram na nuvem.
//
// Segunda a sexta, almoço e janta. Vaga em branco é o estado normal de metade das
// semanas, e cada vaga aceita VÁRIAS receitas — o almoço de segunda pode ser arroz
// carreteiro + feijão + frango, três receitas simples somadas num prato só.
//
// O documento é sempre gravado INTEIRO, com as dez chaves presentes (vaga vazia é uma
// lista vazia). Gravação mesclada não apaga chave que sumiu: se a gente mandasse só o
// que mudou, tirar a última receita de uma vaga deixaria a vaga velha viva na nuvem.
//
// Como as etiquetas, só escuta com conta autorizada — escuta aberta sem conta mantém
// conexão viva com o Firestore em toda abertura do app para colher um permission-denied
// garantido.
import { aoMudarConta, contaAtual, gravar, observar } from './nuvem.js';

export const DIAS = [
  { id: 'segunda', nome: 'Segunda' },
  { id: 'terca', nome: 'Terça' },
  { id: 'quarta', nome: 'Quarta' },
  { id: 'quinta', nome: 'Quinta' },
  { id: 'sexta', nome: 'Sexta' },
];

export const REFEICOES = [
  { id: 'almoco', nome: 'Almoço', etiqueta: 'almoco-semanal' },
  { id: 'janta', nome: 'Janta', etiqueta: 'janta-semanal' },
];

// Três, e não o rendimento escrito na receita: o rendimento é do prato, isto é o
// tamanho da casa. Ajustável por vaga, para o domingo com gente a mais.
export const PORCOES_PADRAO = 3;
export const MIN_PORCOES = 1;
export const MAX_PORCOES = 40;

export const CAMINHO = 'casa/cardapio';

export const chaveDaVaga = (dia, refeicao) => `${dia}-${refeicao}`;
export const CHAVES = DIAS.flatMap((d) => REFEICOES.map((r) => chaveDaVaga(d.id, r.id)));

const vaziasTodas = () => Object.fromEntries(CHAVES.map((c) => [c, []]));

let vagas = vaziasTodas();
const ouvintes = new Set();

let jaPronta = false;
let marcarPronta = null;
const promessa = new Promise((r) => {
  marcarPronta = r;
});
export const prontidao = () => promessa;

let parar = null;

function destravar() {
  if (jaPronta) return;
  jaPronta = true;
  marcarPronta();
}

function avisar() {
  for (const fn of ouvintes) fn();
}

/** Só as dez chaves, só itens com id, só porções que fazem sentido. */
function arrumar(cru) {
  const limpas = vaziasTodas();
  if (!cru || typeof cru !== 'object') return limpas;
  for (const chave of CHAVES) {
    const lista = Array.isArray(cru[chave]) ? cru[chave] : [];
    const vistos = new Set();
    for (const item of lista) {
      const id = typeof item?.id === 'string' ? item.id : null;
      if (!id || vistos.has(id)) continue;
      vistos.add(id);
      const n = Math.round(Number(item.porcoes));
      limpas[chave].push({
        id,
        porcoes: Number.isFinite(n) ? Math.min(MAX_PORCOES, Math.max(MIN_PORCOES, n)) : PORCOES_PADRAO,
      });
    }
  }
  return limpas;
}

function assinar() {
  parar?.();
  parar = observar(CAMINHO, (documento) => {
    vagas = arrumar(documento?.vagas);
    destravar();
    avisar();
  });
}

// Escuta com conta, mesmo sem rede: a persistência offline entrega o último cardápio
// conhecido, que é exatamente o que a especificação promete para a cozinha sem sinal.
// Sem conta não se assina nada — ver o comentário em etiquetas.js.
aoMudarConta((conta) => {
  if (conta) {
    assinar();
    return;
  }
  parar?.();
  parar = null;
  // o que já foi lido continua na tela: perder a rede não é motivo para o cardápio
  // sumir da frente de quem está cozinhando por ele
  destravar();
  avisar();
});

export function aoMudar(fn) {
  ouvintes.add(fn);
  return () => ouvintes.delete(fn);
}

export const daVaga = (chave) => (vagas[chave] ?? []).map((i) => ({ ...i }));

export const temAlgo = () => CHAVES.some((c) => (vagas[c] ?? []).length > 0);

const copiar = () => Object.fromEntries(CHAVES.map((c) => [c, (vagas[c] ?? []).map((i) => ({ ...i }))]));

async function guardar(novas) {
  await gravar(CAMINHO, { vagas: novas, por: contaAtual()?.email ?? null });
  // a nuvem devolve o eco, mas a tela não espera por ele: com a mão suja, botão que
  // demora a responder é botão que a pessoa toca de novo
  vagas = novas;
  avisar();
}

export async function por(chave, id, porcoes = PORCOES_PADRAO) {
  const novas = copiar();
  if (!novas[chave]) return;
  if (novas[chave].some((i) => i.id === id)) return;
  novas[chave].push({ id, porcoes });
  await guardar(novas);
}

export async function tirar(chave, id) {
  const novas = copiar();
  if (!novas[chave]) return;
  novas[chave] = novas[chave].filter((i) => i.id !== id);
  await guardar(novas);
}

export async function mudarPorcoes(chave, id, passo) {
  const novas = copiar();
  const item = novas[chave]?.find((i) => i.id === id);
  if (!item) return;
  const proximo = item.porcoes + passo;
  if (proximo < MIN_PORCOES || proximo > MAX_PORCOES) return;
  item.porcoes = proximo;
  await guardar(novas);
}

export async function limpar() {
  await guardar(vaziasTodas());
}

/**
 * O cardápio virando escolhas de lista de compras: { id da receita: porções }.
 *
 * A mesma receita em dois dias SOMA — 3 na segunda e 3 na quarta são 6 porções de
 * compra, não duas linhas nem uma só de 3. É o formato que a tela da lista já guarda,
 * então o botão não inventa nada: ele preenche a gaveta que já existe.
 */
export function escolhasParaLista() {
  const soma = {};
  for (const chave of CHAVES) {
    for (const { id, porcoes } of vagas[chave] ?? []) {
      soma[id] = (soma[id] ?? 0) + porcoes;
    }
  }
  return soma;
}
