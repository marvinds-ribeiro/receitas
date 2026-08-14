// Agregação da lista de compras.
//
// Regra dura da especificação: soma unidades iguais, converte g↔kg e ml↔l, e
// NUNCA converte volume em peso. Unidades incompatíveis do mesmo item viram
// linhas separadas.

import { UNIDADES, paraBase, melhorUnidade, comoMedida, rotulo, escala } from './unidades.js';

/**
 * @param {Array<{receita, item, fator}>} entradas
 *   receita: {id, nome}  ·  item: ingrediente do JSON  ·  fator: multiplicador de porções
 * @returns lista de linhas agregadas, em ordem alfabética de item
 */
/**
 * Coisas que aparecem na receita mas ninguém compra. Água de torneira é a única
 * até agora — ela aparece em 12 receitas e criava uma seção de "bebidas" inteira
 * na lista de compras, com "310 g de água" para levar ao mercado.
 */
const NAO_SE_COMPRA = new Set(['agua']);

export function agregar(entradas) {
  // chave de agregação: item normalizado + como a unidade se soma
  const baldes = new Map();

  for (const { receita, item, fator = 1 } of entradas) {
    const u = UNIDADES[item.un];
    if (!u) continue;
    if (NAO_SE_COMPRA.has(item.norm)) continue;

    // 'livre' (a gosto / o quanto baste) não tem número para somar:
    // agrupa por item, guarda só a menção
    const chaveMedida = u.tipo === 'massa' ? 'massa' : u.tipo === 'volume' ? 'volume' : `un:${item.un}`;
    const chave = `${item.norm}||${chaveMedida}`;

    if (!baldes.has(chave)) {
      baldes.set(chave, {
        norm: item.norm,
        emoji: item.emoji,
        voz: item.voz,
        rotuloItem: item.item,
        tipo: u.tipo,
        un: item.un,
        total: 0,
        temNumero: false,
        aproximado: false,
        receitas: new Map(),
      });
    }
    const b = baldes.get(chave);

    // o nome mais curto costuma ser o mais genérico — melhor para uma lista de compras
    if (item.item.length < b.rotuloItem.length) b.rotuloItem = item.item;

    if (u.tipo !== 'livre' && item.qtd != null) {
      const mult = escala(item.un) ? fator : 1;
      // faixa (250 a 300 g): compra-se o maior, para não faltar
      const qtd = (item.qtd_ate ?? item.qtd) * mult;
      const emBase = paraBase(qtd, item.un);
      if (emBase) {
        b.total += emBase.valor;
        b.temNumero = true;
        b.base = emBase.base;
      }
      if (item.qtd_ate != null) b.aproximado = true;
    }
    if (item.obs && /aproximad/i.test(item.obs)) b.aproximado = true;

    if (!b.receitas.has(receita.id)) b.receitas.set(receita.id, receita.nome);
  }

  // "A gosto" não informa nada na hora de comprar: se o mesmo item já aparece com
  // quantidade em alguma receita, a linha sem número vira só uma observação naquela
  // linha. Sal com "110 g", "1 colher (sopa)" e "a gosto" é uma compra só, não três.
  // Quando o item SÓ aparece a gosto, a linha continua — você ainda precisa comprar sal.
  const temNumeroPorItem = new Map();
  for (const b of baldes.values()) {
    if (b.temNumero) temNumeroPorItem.set(b.norm, true);
  }
  for (const [chave, b] of baldes) {
    if (b.tipo !== 'livre' || !temNumeroPorItem.get(b.norm)) continue;
    for (const outro of baldes.values()) {
      if (outro.norm !== b.norm || !outro.temNumero) continue;
      outro.tambemAGosto = true;
      for (const [id, nome] of b.receitas) if (!outro.receitas.has(id)) outro.receitas.set(id, nome);
    }
    baldes.delete(chave);
  }

  const linhas = [...baldes.values()].map((b) => {
    let qtdTexto = '';
    let arredondado = false;
    if (b.temNumero) {
      let melhor = b.tipo === 'massa' || b.tipo === 'volume'
        ? melhorUnidade(b.total, b.base)
        : { qtd: b.total, un: b.un };

      // Não se compra ¼ de noz-moscada nem meia cebola: coisa que se conta vai
      // para cima, até a unidade inteira. Sem isto a lista pedia "Noz-moscada ¼",
      // uma fração nua que parece defeito de dado.
      if (b.tipo === 'contagem' && !Number.isInteger(melhor.qtd)) {
        melhor = { ...melhor, qtd: Math.ceil(melhor.qtd) };
        arredondado = true;
      }

      const rot = rotulo(melhor.un, melhor.qtd);
      const num = comoMedida(melhor.qtd, melhor.un);
      qtdTexto = rot ? `${num} ${rot}` : num;
      if (b.aproximado) qtdTexto = '~' + qtdTexto;
    } else if (b.tipo === 'livre') {
      qtdTexto = UNIDADES[b.un].s;
    }
    return {
      norm: b.norm,
      item: b.rotuloItem,
      emoji: b.emoji,
      voz: b.voz,
      quantidade: qtdTexto,
      temNumero: b.temNumero,
      // a conta deu fração e foi para cima até a peça inteira
      arredondado,
      // outras receitas usam o mesmo item sem medir — a interface pode dizer "e a gosto"
      tambemAGosto: Boolean(b.tambemAGosto),
      receitas: [...b.receitas.values()],
    };
  });

  const colador = new Intl.Collator('pt-BR', { sensitivity: 'base' });
  linhas.sort((a, b) => colador.compare(a.item, b.item));
  return linhas;
}

// ------------------------------------------------- vizinhos que se engolem
// Objeção do crítico de linguagem (14/08/2026): no registro real saiu
// "…extrato de baunilha, ketchup, leite, leite condensado e manjericão…" — e,
// de ouvido, a pausa da vírgula é curta demais: quando o nome de um item é
// PREFIXO do nome do vizinho, o reconhecedor da Alexa colapsa a repetição num
// item só. A saída não é mexer nos lotes — quem cai em qual lote é conta da
// tela — e sim rearranjar a ordem DENTRO da frase até afastar os parentes.

const semAcento = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// prefixo com fronteira de palavra: "leite" engole "leite condensado",
// mas "sal" não tem nada a ver com "salsinha"
function seEngolem(a, b) {
  const na = semAcento(a);
  const nb = semAcento(b);
  return na !== nb && (nb.startsWith(na + ' ') || na.startsWith(nb + ' '));
}

/**
 * Rearranja os itens para que nenhum par prefixo/prefixado fique adjacente.
 * Busca com retrocesso, tentando os itens na ordem em que vieram — o lote tem
 * no máximo LOTE_MAX itens, então o pior caso é pequeno e a ordem alfabética
 * original sobrevive onde não há perigo. Devolve a permutação segura, ou null
 * quando ela não existe.
 */
function arranjar(itens) {
  const arranjo = [];
  const usado = new Array(itens.length).fill(false);

  function tentar(posicao) {
    if (posicao === itens.length) return true;
    for (let i = 0; i < itens.length; i += 1) {
      if (usado[i]) continue;
      if (posicao > 0 && seEngolem(arranjo[posicao - 1], itens[i])) continue;
      usado[i] = true;
      arranjo[posicao] = itens[i];
      if (tentar(posicao + 1)) return true;
      usado[i] = false;
    }
    return false;
  }

  return tentar(0) ? arranjo : null;
}

/**
 * O caso de borda, da segunda rodada do crítico (14/08/2026): quando o lote É
 * o par ("leite e leite condensado"), ou três parentes sem espaçador ("leite,
 * leite condensado, leite de coco" — caso real das receitas da casa),
 * reordenar não salva: de ouvido o par colapsa em qualquer ordem. Aí o lote se
 * PARTE em falas separadas — nenhuma frase emitida contém par que se engole,
 * mesmo que isso custe uma frase a mais. A partição é a MENOR possível:
 * cada submáscara arranjável é tentada, com memória, e vence a que emite
 * menos falas. Ninguém some, ninguém duplica: toda partição fala cada item
 * exatamente uma vez. Quais itens caem em qual lote continua sendo conta da
 * tela — aqui só se decide em quantas frases o lote sai.
 */
function partirEmFalas(lote) {
  const memoria = new Map(); // máscara de itens → menor lista de falas

  function melhorParticao(mascara) {
    if (mascara === 0) return [];
    if (memoria.has(mascara)) return memoria.get(mascara);
    let melhor = null;
    // percorre as submáscaras da maior para as menores: o lote inteiro vem
    // primeiro, então o caso comum (arranjável de uma vez) sai na primeira volta
    for (let sub = mascara; sub; sub = (sub - 1) & mascara) {
      const arranjo = arranjar(lote.filter((_, i) => sub & (1 << i)));
      if (!arranjo) continue;
      const resto = melhorParticao(mascara & ~sub);
      const candidata = [arranjo, ...resto];
      if (!melhor || candidata.length < melhor.length) melhor = candidata;
      if (melhor.length === 1) break; // não existe partição menor que uma fala
    }
    memoria.set(mascara, melhor);
    return melhor;
  }

  // itens sozinhos são sempre arranjáveis, então sempre há partição
  return melhorParticao((1 << lote.length) - 1);
}

/**
 * Frases para a Alexa: lotes de N itens, cada lote uma frase completa
 * com palavra de ativação, usando `voz`, sem quantidade e sem unidade.
 */
export function frasesParaVoz(linhas, tamanhoLote = 5, ativacao = 'Alexa, adicionar') {
  const nomes = linhas.map((l) => l.voz).filter(Boolean);
  const lotes = [];
  for (let i = 0; i < nomes.length; i += tamanhoLote) lotes.push(nomes.slice(i, i + tamanhoLote));

  return lotes.flatMap((itens) =>
    partirEmFalas(itens).map((fala) => {
      const corpo = fala.length === 1
        ? fala[0]
        : fala.slice(0, -1).join(', ') + ' e ' + fala[fala.length - 1];
      return `${ativacao} ${corpo} à lista de compras.`;
    })
  );
}
