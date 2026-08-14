// Tabela de unidades, escala de porções e exibição de quantidade como fração.
// Tudo aqui é função pura — sem DOM, sem estado.

/**
 * tipo: como a unidade se comporta na lista de compras.
 *   'massa'    → converte entre si (g ↔ kg)
 *   'volume'   → converte entre si (ml ↔ l)
 *   'cozinha'  → soma só com a unidade idêntica (xícara com xícara)
 *   'contagem' → soma só com a unidade idêntica (dente com dente)
 *   'livre'    → não tem número; nunca escala e nunca soma
 * base/fator: para converter dentro do mesmo tipo.
 */
export const UNIDADES = {
  g: { s: 'g', p: 'g', tipo: 'massa', base: 'g', fator: 1, colado: true },
  kg: { s: 'kg', p: 'kg', tipo: 'massa', base: 'g', fator: 1000, colado: true },
  ml: { s: 'ml', p: 'ml', tipo: 'volume', base: 'ml', fator: 1, colado: true },
  l: { s: 'l', p: 'l', tipo: 'volume', base: 'ml', fator: 1000, colado: true },

  xicara_cha: { s: 'xícara (chá)', p: 'xícaras (chá)', tipo: 'cozinha' },
  xicara: { s: 'xícara', p: 'xícaras', tipo: 'cozinha' },
  colher_sopa: { s: 'colher (sopa)', p: 'colheres (sopa)', tipo: 'cozinha' },
  colher_cha: { s: 'colher (chá)', p: 'colheres (chá)', tipo: 'cozinha' },
  colher_sobremesa: { s: 'colher (sobremesa)', p: 'colheres (sobremesa)', tipo: 'cozinha' },
  concha: { s: 'concha', p: 'conchas', tipo: 'cozinha' },
  pitada: { s: 'pitada', p: 'pitadas', tipo: 'cozinha' },
  punhado: { s: 'punhado', p: 'punhados', tipo: 'cozinha' },

  unidade: { s: '', p: '', tipo: 'contagem' },
  dente: { s: 'dente', p: 'dentes', tipo: 'contagem' },
  folha: { s: 'folha', p: 'folhas', tipo: 'contagem' },
  ramo: { s: 'ramo', p: 'ramos', tipo: 'contagem' },
  talo: { s: 'talo', p: 'talos', tipo: 'contagem' },
  fatia: { s: 'fatia', p: 'fatias', tipo: 'contagem' },
  posta: { s: 'posta', p: 'postas', tipo: 'contagem' },
  pedaco: { s: 'pedaço', p: 'pedaços', tipo: 'contagem' },
  cabeca: { s: 'cabeça', p: 'cabeças', tipo: 'contagem' },
  maco: { s: 'maço', p: 'maços', tipo: 'contagem' },
  lata: { s: 'lata', p: 'latas', tipo: 'contagem' },
  pacote: { s: 'pacote', p: 'pacotes', tipo: 'contagem' },
  caixa: { s: 'caixa', p: 'caixas', tipo: 'contagem' },
  envelope: { s: 'envelope', p: 'envelopes', tipo: 'contagem' },
  vidro: { s: 'vidro', p: 'vidros', tipo: 'contagem' },
  gema: { s: 'gema', p: 'gemas', tipo: 'contagem' },
  clara: { s: 'clara', p: 'claras', tipo: 'contagem' },

  a_gosto: { s: 'a gosto', p: 'a gosto', tipo: 'livre' },
  quanto_baste: { s: 'o quanto baste', p: 'o quanto baste', tipo: 'livre' },
};

/** Unidade sem número nunca escala com as porções. */
export const escala = (un) => UNIDADES[un]?.tipo !== 'livre';

// ---------------------------------------------------------------- frações

// Fraunces e Lora só trazem ¼ ½ ¾ desenhados. ⅓ e ⅔ virariam quadradinho vazio,
// então as demais frações saem escritas com barra — legível e sem trocar de fonte.
const FRACOES = [
  [1 / 8, '1/8'], [1 / 6, '1/6'], [1 / 5, '1/5'], [1 / 4, '¼'], [1 / 3, '1/3'],
  [3 / 8, '3/8'], [2 / 5, '2/5'], [1 / 2, '½'], [3 / 5, '3/5'], [5 / 8, '5/8'],
  [2 / 3, '2/3'], [3 / 4, '¾'], [4 / 5, '4/5'], [5 / 6, '5/6'], [7 / 8, '7/8'],
];
// as três desenhadas colam no inteiro (1½); as escritas precisam de espaço (1 1/3)
const COLA_NO_INTEIRO = new Set(['¼', '½', '¾']);
const TOLERANCIA = 0.021;

/**
 * Converte número em texto de cozinha: 0.5 → "½", 1.5 → "1½", 2 → "2".
 * Quantidades grandes viram inteiro arredondado — ninguém pesa 237,4 g.
 */
export function comoFracao(n) {
  if (n == null || !Number.isFinite(n)) return '';
  if (n === 0) return '0';
  const sinal = n < 0 ? '-' : '';
  n = Math.abs(n);

  // acima de 10 a fração atrapalha mais do que ajuda
  if (n >= 10) return sinal + String(Math.round(n));

  const inteiro = Math.floor(n);
  const resto = n - inteiro;

  if (resto < TOLERANCIA) return sinal + String(inteiro);
  if (1 - resto < TOLERANCIA) return sinal + String(inteiro + 1);

  let melhor = null;
  let menorErro = Infinity;
  for (const [valor, simbolo] of FRACOES) {
    const erro = Math.abs(resto - valor);
    if (erro < menorErro) { menorErro = erro; melhor = simbolo; }
  }
  if (menorErro <= TOLERANCIA) {
    if (!inteiro) return sinal + melhor;
    return sinal + inteiro + (COLA_NO_INTEIRO.has(melhor) ? '' : ' ') + melhor;
  }

  // nada de bonito por perto: uma casa decimal, com vírgula
  const arredondado = Math.round(n * 10) / 10;
  return sinal + String(arredondado).replace('.', ',');
}

/** Arredonda peso/volume para números que se pesam de verdade. */
export function comoMedida(n, un) {
  const u = UNIDADES[un];
  if (!u || n == null) return comoFracao(n);
  if (u.tipo === 'massa' || u.tipo === 'volume') {
    if (n >= 100) return String(Math.round(n / 5) * 5);
    if (n >= 10) return String(Math.round(n));
    return String(Math.round(n * 10) / 10).replace('.', ',');
  }
  return comoFracao(n);
}

// ------------------------------------------------------- plural do ingrediente
// "2 ovo" está errado em português. A unidade `unidade` não tem rótulo próprio,
// então quem precisa concordar com o número é o nome do ingrediente.

// depois de uma preposição o resto da locução não flexiona:
// "filé de peito de frango" vira "filés de peito de frango", não "filés de peitos de frangos"
const PREPOSICOES = new Set(['de', 'do', 'da', 'dos', 'das', 'com', 'sem', 'em', 'no', 'na', 'ao', 'à', 'para', 'e', 'ou']);
// palavras que não flexionam
const INVARIAVEIS = new Set(['mignon', 'parma', 'dijon', 'blumenau', 'pérola', 'siciliano', 'inglês']);
const IRREGULARES = { pao: 'pães', mao: 'mãos', capitao: 'capitães', alemao: 'alemães' };

const semAcentoLocal = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

function pluralPalavra(p) {
  if (!p || INVARIAVEIS.has(p.toLowerCase())) return p;
  const chave = semAcentoLocal(p.toLowerCase());
  if (IRREGULARES[chave]) return IRREGULARES[chave];
  if (/s$/i.test(p)) {
    // oxítona terminada em s flexiona (país → países); paroxítona é invariável (lápis)
    return /[áéíóúâêô]s$/i.test(p) ? p.replace(/s$/i, 'ses') : p;
  }
  if (/ão$/i.test(p)) return p.replace(/ão$/i, 'ões');
  if (/[aeiouáéíóúâêôãõ]$/i.test(p)) return p + 's';
  if (/[rz]$/i.test(p)) return p + 'es';
  if (/m$/i.test(p)) return p.replace(/m$/i, 'ns');
  if (/il$/i.test(p)) return p.replace(/il$/i, 'is');
  if (/l$/i.test(p)) return p.replace(/l$/i, 'is');
  return p + 's';
}

/** Concorda o nome do ingrediente com a quantidade. */
export function pluralizarItem(nome, qtd) {
  if (qtd == null || qtd <= 1 || !nome) return nome;
  const palavras = nome.split(' ');
  const saida = [];
  let flexionando = true;
  for (const p of palavras) {
    if (PREPOSICOES.has(p.toLowerCase())) flexionando = false;
    saida.push(flexionando ? pluralPalavra(p) : p);
  }
  return saida.join(' ');
}

/** Rótulo da unidade já concordando com o número. */
export function rotulo(un, qtd) {
  const u = UNIDADES[un];
  if (!u) return un ?? '';
  if (u.tipo === 'livre') return u.s;
  return qtd != null && qtd > 1 ? u.p : u.s;
}

/**
 * Texto completo da quantidade de um item, já escalado.
 * Devolve '' quando não há número (a gosto entra no rótulo).
 */
export function textoQuantidade(item, fator = 1) {
  const u = UNIDADES[item.un];
  if (!u || u.tipo === 'livre') return '';

  const escalar = (v) => (v == null ? null : v * fator);
  const q = escalar(item.qtd);
  const qAte = escalar(item.qtd_ate);
  if (q == null) return '';

  const num = comoMedida(q, item.un);
  const numAte = qAte != null ? comoMedida(qAte, item.un) : null;
  const numeroFinal = numAte ? `${num} a ${numAte}` : num;

  const rot = rotulo(item.un, qAte ?? q);
  if (!rot) return numeroFinal;
  return u.colado ? `${numeroFinal} ${rot}` : `${numeroFinal} ${rot}`;
}

/**
 * Nome do ingrediente para exibição, já concordando com a quantidade escalada.
 * Só flexiona quando a unidade não tem rótulo próprio — em "2 dentes de alho"
 * quem está no plural é "dentes", não "alho".
 */
export function nomeDoItem(item, fator = 1) {
  if (item.un !== 'unidade') return item.item;
  const q = (item.qtd_ate ?? item.qtd);
  return pluralizarItem(item.item, q == null ? null : q * fator);
}

/** Sufixo "a gosto" / "o quanto baste" para itens sem número. */
export function textoSemMedida(item) {
  const u = UNIDADES[item.un];
  return u?.tipo === 'livre' ? u.s : '';
}

// ---------------------------------------------------------------- conversão

/** Normaliza para a unidade base do tipo. Devolve null se a unidade não converte. */
export function paraBase(qtd, un) {
  const u = UNIDADES[un];
  if (!u || qtd == null) return null;
  if (u.tipo === 'massa' || u.tipo === 'volume') return { valor: qtd * u.fator, base: u.base, tipo: u.tipo };
  return { valor: qtd, base: un, tipo: u.tipo };
}

/**
 * Escolhe a melhor unidade para exibir um total em gramas ou mililitros.
 * 1500 g → { qtd: 1.5, un: 'kg' } · 800 g → { qtd: 800, un: 'g' }
 */
export function melhorUnidade(valorBase, base) {
  if (base === 'g') return valorBase >= 1000 ? { qtd: valorBase / 1000, un: 'kg' } : { qtd: valorBase, un: 'g' };
  if (base === 'ml') return valorBase >= 1000 ? { qtd: valorBase / 1000, un: 'l' } : { qtd: valorBase, un: 'ml' };
  return { qtd: valorBase, un: base };
}
