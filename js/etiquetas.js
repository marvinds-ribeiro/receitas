// Etiquetas: a camada sobreposta às receitas.
//
// Duas origens e uma regra de desempate POR RECEITA:
//   1. de fábrica — o que veio no arquivo da receita, mais a pré-marcação automática
//      (categoria "doce" nasce com "sobremesa");
//   2. da nuvem  — o que foi editado no app, em etiquetas/{id da receita}.
//
// Existindo registro na nuvem para aquela receita, ele manda INTEIRO — inclusive quando
// é uma lista vazia. As duas listas nunca se misturam, e é isso que faz desmarcar uma
// pré-marcação grudar: se a vazia da nuvem fosse mesclada com a de fábrica, a sobremesa
// desmarcada voltaria sozinha na próxima abertura, e ninguém entenderia por quê.
//
// As receitas continuam só de leitura no celular. A etiqueta não é a receita: é o que a
// casa acha da receita, e é a única coisa desta tela que vive na nuvem.
import { aoMudarConta, contaAtual, gravar, observarColecao } from './nuvem.js';

export const ETIQUETAS = [
  { id: 'almoco-semanal', nome: 'Almoço semanal' },
  { id: 'janta-semanal', nome: 'Janta semanal' },
  { id: 'complexo', nome: 'Complexo' },
  { id: 'sobremesa', nome: 'Sobremesa' },
];

export const IDS = ETIQUETAS.map((e) => e.id);
export const nomeDaEtiqueta = (id) => ETIQUETAS.find((e) => e.id === id)?.nome ?? id;

const COLECAO = 'etiquetas';

let daNuvem = {};
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

function assinar() {
  parar?.();
  parar = observarColecao(COLECAO, (mapa) => {
    daNuvem = mapa ?? {};
    destravar();
    for (const fn of ouvintes) fn();
  });
}

// SÓ ESCUTA COM CONTA — e escuta mesmo sem rede.
//
// Sem conta, abrir a escuta parecia inofensivo e não é: o Firestore levanta e mantém uma
// conexão viva em TODA abertura do app, gastando rede e bateria da cozinha para colher um
// permission-denied garantido. Quem denunciou foi o `app.mjs`, estourando o tempo de
// captura esperando a rede sossegar, coisa que nunca mais ia acontecer.
//
// Com conta e sem rede, a escuta continua: é para isso que a persistência offline foi
// ligada — o onSnapshot entrega a última cópia guardada, e as etiquetas aparecem na
// cozinha sem sinal.
//
// Sem conta o desenho não fica esperando nada: as de fábrica já bastam para a tela.
aoMudarConta((conta) => {
  if (conta) {
    assinar();
    return;
  }
  parar?.();
  parar = null;
  // o que já foi lido continua valendo: sair da conta não é motivo para a etiqueta
  // sumir da tela de quem está com a receita aberta
  destravar();
  for (const fn of ouvintes) fn();
});

/** Avisa quando as etiquetas mudam — por sua mão ou pela do outro celular. */
export function aoMudar(fn) {
  ouvintes.add(fn);
  return () => ouvintes.delete(fn);
}

/** Só as conhecidas, sempre na ordem da tela — lista guardada não manda no desenho. */
const arrumar = (lista) => IDS.filter((id) => lista.includes(id));

/** O que a receita traz do arquivo, mais a pré-marcação automática. */
export function deFabrica(receita) {
  const doArquivo = Array.isArray(receita?.etiquetas) ? receita.etiquetas : [];
  const juntas = new Set(doArquivo);
  // ponto de partida, não sentença: desmarcar grava a lista vazia e a marca não volta
  if (receita?.categoria === 'doce') juntas.add('sobremesa');
  return arrumar([...juntas]);
}

/** As que valem agora para esta receita. */
export function etiquetasDe(receita) {
  const registro = daNuvem[receita?.id];
  if (registro && Array.isArray(registro.etiquetas)) return arrumar(registro.etiquetas);
  return deFabrica(receita);
}

export const tem = (receita, etiqueta) => etiquetasDe(receita).includes(etiqueta);

/**
 * Marca ou desmarca, e grava o CONJUNTO COMPLETO daquela receita.
 * Gravar o conjunto inteiro, e não a diferença, é o que faz a regra de desempate
 * funcionar: o documento da nuvem é sempre a verdade final daquela receita.
 */
export async function alternar(receita, etiqueta) {
  if (!IDS.includes(etiqueta)) return etiquetasDe(receita);
  const atuais = new Set(etiquetasDe(receita));
  if (atuais.has(etiqueta)) atuais.delete(etiqueta);
  else atuais.add(etiqueta);
  const lista = arrumar([...atuais]);
  await gravar(`${COLECAO}/${receita.id}`, {
    etiquetas: lista,
    por: contaAtual()?.email ?? null,
  });
  return lista;
}

/** Todas as receitas que têm a etiqueta — para o filtro do índice. */
export const comEtiqueta = (receitas, etiqueta) =>
  receitas.filter((r) => etiquetasDe(r).includes(etiqueta));
