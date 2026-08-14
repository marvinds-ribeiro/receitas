// Cabeçalho da receita: volta para o índice, nome, metadados, recado da casa,
// controle de porções e modo cozinha.
//
// Regra de altura: cada pixel gasto aqui é pixel roubado do primeiro ingrediente.
// Por isso os metadados vão em UMA linha corrida (e não no bloco tabular do NYT),
// e o controle de porções fica colado no fim do cabeçalho — encostado no que ele
// multiplica.

import * as cozinha from '../cozinha.js';
import { comoFracao } from '../unidades.js';

// ------------------------------------------------------- vocabulário da casa
// O índice e o cabeçalho da receita mostram o MESMO metadado — categoria e
// tempo — e por muito tempo mostraram cada um do seu jeito ("Principal" contra
// "Prato principal", "3 h 45" contra "3 h 45 min"). Quem escreve esse par mora
// aqui, e a tela do índice importa daqui. Um metadado, uma escrita.

/** Nome de exibição da categoria. O JSON guarda a forma curta e sem acento. */
export const NOME_CATEGORIA = {
  principal: 'Prato principal',
  acompanhamento: 'Acompanhamento',
  entrada: 'Entrada',
  massa: 'Massa',
  molho: 'Molho',
  sopa: 'Sopa',
  salada: 'Salada',
  lanche: 'Lanche',
  pao: 'Pão',
  doce: 'Doce',
};

export const nomeDaCategoria = (c) => (c ? NOME_CATEGORIA[c] || comMaiuscula(c) : '');

/** 240 → "4 h" · 90 → "1 h 30 min" · 45 → "45 min" · null → "" */
export function textoTempo(minutos) {
  if (minutos == null || !Number.isFinite(minutos) || minutos <= 0) return '';
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  const resto = minutos % 60;
  return resto ? `${horas} h ${resto} min` : `${horas} h`;
}

function comMaiuscula(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

const porcoesEm = (n) => `${n} ${n === 1 ? 'porção' : 'porções'}`;

function criar(tag, classe, texto) {
  const el = document.createElement(tag);
  if (classe) el.className = classe;
  if (texto != null) el.textContent = texto;
  return el;
}

export default function montarCabecalho(pai, receita, estado) {
  const base = receita.porcoes;
  const estimado = receita.porcoes_origem === 'estimado';

  const cabecalho = criar('header', 'cabecalho-receita');

  // ---------------------------------------------------------------- topo
  // Voltar e modo cozinha dividem a mesma faixa de 48px: uma linha, dois alvos
  // grandes, nas duas pontas onde o polegar já está.
  const topo = criar('div', 'cabecalho-receita-topo');

  const voltar = criar('a', 'cabecalho-receita-voltar');
  voltar.href = '#/';
  voltar.append(criar('span', 'cabecalho-receita-seta'), criar('span', null, 'Índice'));
  voltar.setAttribute('aria-label', 'Voltar para o índice das receitas');
  topo.append(voltar);

  let soltarCozinha = null;
  if (cozinha.suportado()) {
    const botaoCozinha = criar('button', 'cabecalho-receita-cozinha');
    botaoCozinha.type = 'button';
    botaoCozinha.dataset.acao = 'cozinha';
    botaoCozinha.append(criar('span', 'cabecalho-receita-luz'), criar('span', null, 'Modo cozinha'));

    const pintarCozinha = (ligado) => {
      botaoCozinha.setAttribute('aria-pressed', ligado ? 'true' : 'false');
      // o rótulo de apoio muda para quem lê de perto; o bloco de cor resolve de longe
      botaoCozinha.title = ligado ? 'Tela acesa — toque para desligar' : 'Manter a tela acesa';
    };
    pintarCozinha(cozinha.estaLigado());
    soltarCozinha = cozinha.aoMudar(pintarCozinha);
    botaoCozinha.addEventListener('click', () => cozinha.alternar());
    topo.append(botaoCozinha);
  }
  cabecalho.append(topo);

  // ---------------------------------------------------------------- nome
  const titulo = criar('h1', 'cabecalho-receita-titulo', receita.nome);
  cabecalho.append(titulo);

  // ---------------------------------------------------------------- metadados
  // Linha única, sans em caixa alta, separada por losangos. Só o que existe
  // entra: o mesmo par que o índice mostra embaixo do nome da receita, escrito
  // com as mesmas palavras.
  //
  // O rendimento saiu daqui de propósito. Ele mostrava "RENDIMENTO ESTIMADO" —
  // rótulo sem valor ao lado — nas 51 receitas que não declaram quanto rendem, e
  // repetia o número nas 10 que declaram, porque o controle de porções logo
  // abaixo já é o rendimento. Agora quem diz de onde vem o número é a linha de
  // honestidade embaixo do controle, com o número junto.
  const meta = criar('p', 'cabecalho-receita-meta rotulo');
  const pedacos = [];
  const categoria = nomeDaCategoria(receita.categoria);
  if (categoria) pedacos.push(categoria);
  const tempo = textoTempo(receita.tempo);
  if (tempo) pedacos.push(tempo);
  pedacos.forEach((texto) => meta.append(criar('span', null, texto)));
  if (pedacos.length) cabecalho.append(meta);

  // ---------------------------------------------------------------- recado
  // O único bordô da tela.
  if (receita.nota) {
    cabecalho.append(criar('p', 'faixa faixa-bordo cabecalho-receita-nota', receita.nota));
  }

  // ---------------------------------------------------------------- porções
  // Mão suja, sem precisão: os dois botões ocupam as pontas da faixa, com 76px
  // de largura e 60px de altura cada, separados pelo número. Não dá para errar.
  const controle = criar('div', 'cabecalho-receita-porcoes');

  const criarBotao = (acao, sinal, rotulo) => {
    const b = criar('button', 'cabecalho-receita-botao');
    b.type = 'button';
    b.dataset.acao = acao;
    b.setAttribute('aria-label', rotulo);
    b.append(criar('span', 'cabecalho-receita-sinal', sinal));
    return b;
  };
  const botaoMenos = criarBotao('menos', '−', 'Uma porção a menos');
  const botaoMais = criarBotao('mais', '+', 'Uma porção a mais');

  const medida = criar('div', 'cabecalho-receita-medida');
  const legenda = criar('span', 'cabecalho-receita-legenda rotulo', 'Ingredientes para');
  const valor = criar('span', 'cabecalho-receita-valor');
  valor.setAttribute('aria-live', 'polite');
  const numero = criar('strong', null, String(base));
  const unidade = criar('span', null, base === 1 ? 'porção' : 'porções');
  valor.append(numero, ' ', unidade);
  medida.append(legenda, valor);

  controle.append(botaoMenos, medida, botaoMais);
  cabecalho.append(controle);

  const dica = criar('p', 'cabecalho-receita-dica');
  cabecalho.append(dica);

  function pintarPorcoes() {
    const n = estado.porcoes;
    numero.textContent = String(n);
    unidade.textContent = n === 1 ? 'porção' : 'porções';
    botaoMenos.disabled = n <= 1;
    botaoMais.disabled = n >= 40;

    if (n !== base) {
      dica.textContent = `Quantidades ×${comoFracao(estado.fator)} · base de ${porcoesEm(base)}`;
    } else if (estimado) {
      dica.textContent = `A receita não diz quanto rende; ${base} é estimativa nossa.`;
    } else {
      dica.textContent = `Rende ${porcoesEm(base)}, como está na receita.`;
    }
  }
  pintarPorcoes();

  botaoMenos.addEventListener('click', () => estado.definirPorcoes(estado.porcoes - 1));
  botaoMais.addEventListener('click', () => estado.definirPorcoes(estado.porcoes + 1));
  const soltarPorcoes = estado.aoMudarPorcoes(pintarPorcoes);

  pai.append(cabecalho);

  return () => {
    soltarPorcoes?.();
    soltarCozinha?.();
    cabecalho.remove();
  };
}
