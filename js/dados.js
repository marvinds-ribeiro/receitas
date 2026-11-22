// Carga e decifra dos dados. AES-GCM com chave derivada por PBKDF2-SHA256.
// A senha certa fica no localStorage; "Sair" limpa.

const CHAVE_SENHA = 'receitas.senha';
const base64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

let cacheIndice = null;
let cacheReceitas = null;

export const senhaGuardada = () => localStorage.getItem(CHAVE_SENHA);
export const guardarSenha = (s) => localStorage.setItem(CHAVE_SENHA, s);

export function sair() {
  localStorage.removeItem(CHAVE_SENHA);
  cacheIndice = null;
  cacheReceitas = null;
}

async function derivarChave(senha, sal, iteracoes) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(senha), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: sal, iterations: iteracoes, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
}

/** Erro de senha errada, para a tela de entrada distinguir de erro de rede. */
export class SenhaIncorreta extends Error {
  constructor() {
    super('senha incorreta');
    this.name = 'SenhaIncorreta';
  }
}

async function baixarEDecifrar(caminho, senha) {
  const resposta = await fetch(caminho, { cache: 'no-cache' });
  if (!resposta.ok) throw new Error(`não consegui carregar ${caminho} (${resposta.status})`);
  const pacote = await resposta.json();

  const chave = await derivarChave(senha, base64(pacote.kdf.sal), pacote.kdf.iteracoes);
  let claro;
  try {
    claro = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64(pacote.cifra.iv) }, chave, base64(pacote.dados));
  } catch {
    // AES-GCM falha a autenticação quando a chave está errada
    throw new SenhaIncorreta();
  }
  return JSON.parse(new TextDecoder().decode(claro));
}

/** Testa a senha contra o índice — é o arquivo menor. */
export async function conferirSenha(senha) {
  cacheIndice = await baixarEDecifrar('dados/indice.enc.json', senha);
  guardarSenha(senha);
  return cacheIndice;
}

export async function carregarIndice() {
  if (cacheIndice) return cacheIndice;
  const senha = senhaGuardada();
  if (!senha) throw new SenhaIncorreta();
  cacheIndice = await baixarEDecifrar('dados/indice.enc.json', senha);
  return cacheIndice;
}

export async function carregarReceitas() {
  if (cacheReceitas) return cacheReceitas;
  const senha = senhaGuardada();
  if (!senha) throw new SenhaIncorreta();
  cacheReceitas = await baixarEDecifrar('dados/receitas.enc.json', senha);
  return cacheReceitas;
}

/**
 * Esquece o que está em memória e busca o índice de novo. Para a receita que acabou de
 * entrar pelo app aparecer sem fechar e abrir: quem chama confere se ela veio, porque o
 * service worker devolve a cópia velha quando a rede demora.
 */
export async function recarregar() {
  cacheIndice = null;
  cacheReceitas = null;
  return carregarIndice();
}

export async function carregarReceita(id) {
  const todas = await carregarReceitas();
  return todas[id] ?? null;
}

// ---------------------------------------------------------------- busca

/** Tira acento e caixa — a busca precisa achar "acucar" digitando "açúcar" e vice-versa. */
export const semAcento = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/**
 * Busca no índice por nome e por ingrediente.
 * Nome que começa com o termo vem primeiro; depois nome que contém; depois ingrediente.
 */
export function buscar(indice, termo) {
  const t = semAcento(termo).trim();
  if (!t) return indice;
  const palavras = t.split(/\s+/);

  const pontuar = (r) => {
    const nome = r.busca;
    const termos = r.termos || '';
    let melhor = 0;
    for (const p of palavras) {
      let ponto = 0;
      if (nome.startsWith(p)) ponto = 4;
      else if (nome.includes(p)) ponto = 3;
      else if (new RegExp(`\\b${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(termos)) ponto = 2;
      else if (termos.includes(p)) ponto = 1;
      if (ponto === 0) return 0; // toda palavra digitada precisa bater
      melhor = Math.max(melhor, ponto);
    }
    return melhor;
  };

  return indice
    .map((r) => ({ r, ponto: pontuar(r) }))
    .filter((x) => x.ponto > 0)
    .sort((a, b) => b.ponto - a.ponto || a.r.nome.localeCompare(b.r.nome, 'pt-BR'))
    .map((x) => x.r);
}

/** Agrupa o índice por letra, em ordem de português. */
export function porLetra(indice) {
  const grupos = new Map();
  for (const r of indice) {
    if (!grupos.has(r.letra)) grupos.set(r.letra, []);
    grupos.get(r.letra).push(r);
  }
  const colador = new Intl.Collator('pt-BR', { sensitivity: 'base' });
  return [...grupos.entries()]
    .sort((a, b) => colador.compare(a[0], b[0]))
    .map(([letra, receitas]) => ({ letra, receitas: receitas.sort((x, y) => colador.compare(x.nome, y.nome)) }));
}
