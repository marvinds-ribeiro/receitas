// Glossário de ingredientes: o que o caderno já decidiu sobre cada um (chave, voz, emoji),
// para uma receita nova falar do mesmo jeito. Função pura — quem lê os arquivos é de fora.
import { chaveDe } from './contrato.js';

/** Um registro por `norm`; vale o primeiro que aparecer. */
export function montarGlossario(receitas) {
  const porNorm = new Map();
  for (const r of receitas) {
    for (const g of r.grupos ?? []) {
      for (const it of g.itens ?? []) {
        if (!it.norm || porNorm.has(it.norm)) continue;
        porNorm.set(it.norm, { norm: it.norm, voz: it.voz, emoji: it.emoji, item: it.item });
      }
    }
  }
  return [...porNorm.values()];
}

/**
 * A fala derivada do nome. O contrato recusa voz com parênteses, barra ou alternativa
 * (a Alexa leria "queijo abre parêntese…"), e o nome escrito pela IA traz as três:
 * "queijo (parmesão ou pecorino)". Fica o que se fala na hora de comprar: o de fora dos
 * parênteses, até a primeira alternativa. O corte usa a mesma regra `\bou\b` do
 * contrato, para o que sai daqui passar lá sempre.
 */
function vozDoNome(nome) {
  return nome
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[()/]/g, ' ')
    .split(/\bou\b/)[0]
    .replace(/-+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Detalhes de um ingrediente: acha pelo nome ou pela chave, sem ligar para acento e
 * caixa. Se o caderno não conhece, deriva a chave e a voz do nome e deixa o emoji
 * em branco — emoji inventado errado é pior que emoji pedido.
 */
export function sugerirDetalhes(item, glossario) {
  const nome = String(item ?? '').trim();
  const chave = chaveDe(nome);
  const achado = glossario.find((g) => g.norm === chave || chaveDe(g.item) === chave);
  if (achado) return { norm: achado.norm, voz: achado.voz, emoji: achado.emoji };
  return { norm: chave, voz: vozDoNome(nome), emoji: null };
}
