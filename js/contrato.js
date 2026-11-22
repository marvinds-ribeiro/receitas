// O contrato da receita (build/ESQUEMA.md) em código puro — sem DOM, sem rede, sem Firebase.
// O app e o ajudante em Node importam este mesmo arquivo: a regra mora num lugar só,
// então um rascunho que passa aqui passa em qualquer ponta.
import { UNIDADES } from './unidades.js';

export const CATEGORIAS = [
  'entrada', 'principal', 'acompanhamento', 'molho', 'massa', 'sopa', 'salada', 'pao', 'doce', 'lanche',
];
export const CODIGOS_DE_UNIDADE = Object.keys(UNIDADES);

// 'a gosto' e 'o quanto baste' nunca levam número; pitada e punhado podem ir sem ele.
export const SEM_NUMERO = ['a_gosto', 'quanto_baste'];
export const NUMERO_OPCIONAL = ['a_gosto', 'quanto_baste', 'pitada', 'punhado'];

const EMOJI_RE = /\p{Extended_Pictographic}/u;
// conta grafemas de verdade: emoji com ZWJ/variação contam como 1
const SEGMENTADOR = new Intl.Segmenter('pt', { granularity: 'grapheme' });
const contaGrafemas = (s) => [...SEGMENTADOR.segment(s)].length;
const emojiValido = (e) => typeof e === 'string' && EMOJI_RE.test(e) && contaGrafemas(e) === 1;

const semAcento = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Texto sem acento e em minúsculo: a chave com que se compara nomes. */
export const chaveDe = (texto) => semAcento(String(texto ?? '')).toLowerCase();

/**
 * Lê o número como se escreve na cozinha: "0,5", "1/2", "1 1/2", " 250 ".
 * Vazio vira null; o que não é número (ou divide por zero) vira NaN, para quem
 * chama poder apontar o campo em vez de gravar lixo.
 */
export function lerNumero(texto) {
  if (texto == null) return null;
  if (typeof texto === 'number') return texto;
  if (typeof texto !== 'string') return NaN;
  const t = texto.trim().replace(',', '.');
  if (!t) return null;
  if (/^\d+(\.\d+)?$/.test(t)) return Number(t);
  const fracao = t.match(/^(?:(\d+)\s+)?(\d+)\/(\d+)$/);
  if (fracao) {
    const [, inteiro, num, den] = fracao;
    if (Number(den) === 0) return NaN;
    return Number(inteiro ?? 0) + Number(num) / Number(den);
  }
  return NaN;
}

/** id, busca e letra saem sempre do nome, por código — nunca de quem escreveu a receita. */
export function derivar(nome) {
  const limpo = String(nome ?? '').trim();
  return {
    id: chaveDe(limpo).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''),
    busca: chaveDe(limpo),
    letra: semAcento(limpo).toUpperCase().slice(0, 1),
  };
}

// ------------------------------------------------------------------ arrumar

// chave ausente vira null, nunca undefined: o Firestore de verdade recusa undefined
const apara = (v) => (typeof v === 'string' ? v.trim() : v ?? null);
const vazioViraNull = (v) => { const a = apara(v); return a === '' ? null : a; };
// número que veio de campo de texto vira número; o que não for número fica NaN
const numeroOuNull = (v) => (typeof v === 'string' ? lerNumero(v) : v);

/**
 * Cópia normalizada do rascunho: apara espaços, troca texto vazio por null, lê
 * números escritos, tira passo em branco e põe o ponto final que faltou.
 * Nunca lança e nunca mexe no original; o que não entende, deixa como está
 * para o conferirRascunho apontar.
 */
export function arrumar(rascunho) {
  const r = { ...(rascunho ?? {}) };
  for (const c of ['nome', 'emoji', 'categoria', 'porcoes_origem']) r[c] = apara(r[c]);
  r.nota = vazioViraNull(r.nota);
  for (const c of ['porcoes', 'tempo']) r[c] = numeroOuNull(vazioViraNull(r[c]));

  if (Array.isArray(r.grupos)) {
    r.grupos = r.grupos.map((g) => {
      if (!g || typeof g !== 'object') return g;
      const grupo = { ...g, titulo: vazioViraNull(g.titulo) };
      if (Array.isArray(g.itens)) {
        grupo.itens = g.itens.map((it) => {
          if (!it || typeof it !== 'object') return it;
          const item = { ...it };
          for (const c of ['item', 'norm', 'voz', 'emoji', 'un']) item[c] = apara(it[c]);
          item.obs = vazioViraNull(it.obs);
          for (const c of ['qtd', 'qtd_ate']) item[c] = numeroOuNull(vazioViraNull(it[c]));
          return item;
        });
      }
      return grupo;
    });
  }

  if (Array.isArray(r.passos)) {
    r.passos = r.passos
      .map(apara)
      .filter((p) => p !== '')
      .map((p) => (typeof p === 'string' && !/[.!?]$/.test(p) ? `${p}.` : p));
  }
  return r;
}

// --------------------------------------------------------------- conferir

const textoCheio = (v) => typeof v === 'string' && v.trim() !== '';

export const NOME_MAXIMO = 80;

// As mensagens vão para a tela de revisão: falam o vocabulário dela, nunca o nome técnico
// do campo — quem lê é a pessoa, e o `onde` já diz ao código qual é o campo.
const FALTA_NO_ITEM = [
  ['item', 'Falta o nome do ingrediente.'],
  ['norm', 'Falta a chave da lista de compras.'],
  ['voz', 'Falta como a Alexa fala este ingrediente.'],
];

/**
 * Confere o rascunho contra o contrato e devolve os problemas, cada um com o
 * campo (`onde`, em caminho: "grupos.0.itens.1.qtd") e a `mensagem`. Vem no máximo
 * um problema por campo — o primeiro — para a tela não gritar duas vezes no mesmo lugar.
 * São as regras de erro de ferramentas/validar.mjs; as que dependem do arquivo
 * (nome do arquivo, id repetido) ficam lá.
 */
export function conferirRascunho(rascunho) {
  const problemas = [];
  const vistos = new Set();
  const P = (onde, mensagem) => {
    if (vistos.has(onde)) return;
    vistos.add(onde);
    problemas.push({ onde, mensagem });
  };
  const r = rascunho ?? {};

  if (!textoCheio(r.nome)) P('nome', 'Falta o nome da receita.');
  else {
    if (r.nome === r.nome.toUpperCase() && r.nome.length > 3) P('nome', 'O nome está em CAIXA ALTA.');
    if (/_|cockpad|\.docx/i.test(r.nome)) P('nome', 'O nome tem sujeira de arquivo.');
    if (!derivar(r.nome).id) P('nome', 'O nome precisa ter ao menos uma letra ou número.');
    if (r.nome.trim().length > NOME_MAXIMO) P('nome', `O nome é comprido demais: o limite é de ${NOME_MAXIMO} caracteres.`);
  }

  if (!emojiValido(r.emoji)) P('emoji', 'O emoji da receita precisa ser exatamente um emoji.');
  if (!CATEGORIAS.includes(r.categoria)) P('categoria', 'Escolha uma categoria da lista.');
  if (!Number.isInteger(r.porcoes) || r.porcoes < 1 || r.porcoes > 30) P('porcoes', 'Porções: um número inteiro de 1 a 30.');
  if (!['receita', 'estimado'].includes(r.porcoes_origem)) P('porcoes_origem', 'Falta dizer se as porções vêm da receita ou são estimadas.');
  if (r.tempo !== null && (!Number.isInteger(r.tempo) || r.tempo < 1)) P('tempo', 'Tempo: minutos inteiros, a partir de 1, ou vazio.');
  if (r.nota !== null && typeof r.nota !== 'string') P('nota', 'A nota deve ser texto ou ficar vazia.');

  if (!Array.isArray(r.grupos) || !r.grupos.length) P('grupos', 'A receita precisa de ao menos um grupo de ingredientes.');
  else {
    r.grupos.forEach((g, gi) => {
      const noGrupo = `grupos.${gi}`;
      if (g?.titulo !== null && typeof g?.titulo !== 'string') P(`${noGrupo}.titulo`, 'O título do grupo deve ser texto ou ficar vazio.');
      if (!Array.isArray(g?.itens) || !g.itens.length) { P(`${noGrupo}.itens`, 'O grupo precisa de ao menos um ingrediente.'); return; }
      g.itens.forEach((it, ii) => conferirItem(it ?? {}, `${noGrupo}.itens.${ii}`, P));
    });
  }

  if (!Array.isArray(r.passos) || !r.passos.length) P('passos', 'A receita precisa de ao menos um passo.');
  else {
    r.passos.forEach((p, pi) => {
      const onde = `passos.${pi}`;
      if (!textoCheio(p)) { P(onde, 'O passo está vazio.'); return; }
      if (/^\s*(\d+[.)]|passo\s+\d+)/i.test(p)) P(onde, 'O passo não leva número: a ordem já é a da lista.');
      if (!/[.!?]$/.test(p.trim())) P(onde, 'O passo precisa terminar com ponto.');
    });
  }
  return problemas;
}

function conferirItem(it, onde, P) {
  const q = `${onde}.qtd`;
  if (it.qtd !== null && (typeof it.qtd !== 'number' || !Number.isFinite(it.qtd) || it.qtd <= 0)) P(q, 'A quantidade precisa ser um número maior que zero.');
  if (it.qtd_ate !== null && it.qtd_ate !== undefined
    && (typeof it.qtd_ate !== 'number' || !(it.qtd_ate > (it.qtd ?? 0)))) P(`${onde}.qtd_ate`, 'O "até" precisa ser maior que a quantidade.');

  if (!CODIGOS_DE_UNIDADE.includes(it.un)) P(`${onde}.un`, 'Escolha uma unidade da lista.');
  else {
    if (SEM_NUMERO.includes(it.un) && it.qtd !== null) P(q, 'Esta unidade não leva quantidade.');
    if (!NUMERO_OPCIONAL.includes(it.un) && it.qtd === null) P(q, 'Esta unidade precisa de quantidade.');
  }

  for (const [c, mensagem] of FALTA_NO_ITEM) {
    if (!textoCheio(it[c])) P(`${onde}.${c}`, mensagem);
  }
  if (textoCheio(it.item) && /^\d/.test(it.item)) P(`${onde}.item`, 'O nome do ingrediente não começa com número: a quantidade vai no campo próprio.');
  if (textoCheio(it.norm) && chaveDe(it.norm) !== it.norm) P(`${onde}.norm`, 'A chave da lista de compras precisa ser minúscula e sem acento.');
  if (textoCheio(it.voz) && /[()/]|\bou\b/.test(it.voz)) P(`${onde}.voz`, 'Como a Alexa fala não pode ter parênteses, barra nem alternativa com "ou".');
  if (!emojiValido(it.emoji)) P(`${onde}.emoji`, 'O emoji do ingrediente precisa ser exatamente um emoji.');
  if (it.obs !== null && typeof it.obs !== 'string') P(`${onde}.obs`, 'A observação deve ser texto ou ficar vazia.');
}

// --------------------------------------------------------------- completar

/**
 * Receita pronta para gravar: o rascunho arrumado mais id, busca e letra derivados
 * do nome, na ordem do contrato. `fonte` só entra quando existe.
 */
export function completar(rascunho, fonte = null) {
  const a = arrumar(rascunho);
  const { id, busca, letra } = derivar(a.nome);
  const receita = {
    id, nome: a.nome, busca, letra, emoji: a.emoji, categoria: a.categoria, porcoes: a.porcoes,
    porcoes_origem: a.porcoes_origem, tempo: a.tempo, nota: a.nota,
  };
  if (fonte) receita.fonte = fonte;
  receita.grupos = a.grupos;
  receita.passos = a.passos;
  return receita;
}
