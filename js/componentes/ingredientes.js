// Lista de ingredientes.
//
// A barra é o bloco de ingredientes do NYT: uma linha por ingrediente, respiro
// grande entre elas, quantidade primeiro, fonte de interface, nada de marcador
// nem de zebrado. O espaço é que separa.
//
// Onde ganhamos dela:
//
// 1. A coluna é real. No NYT a quantidade só "vem primeiro" dentro de uma frase
//    corrida — quando o nome do item anterior é longo, a quantidade seguinte
//    escorrega para longe do olho. Aqui ela ocupa uma coluna de largura fixa,
//    medida na hora para caber a maior quantidade DESTA receita e nada mais:
//    "2 dentes" não paga pelo "1,6 a 1,8 kg" que a receita nem tem. O olho
//    desce por uma borda reta, sem reler.
// 2. O nome nunca divide espaço com o qualificador. "dessalgada e desfiada" cai
//    para a linha de baixo, menor e mais fraca: a coluna de nomes continua sendo
//    uma coluna de nomes. Item de duas linhas não desalinha nada, porque a
//    segunda linha começa onde o nome começa, nunca embaixo do emoji.
// 3. Dá para marcar o que já foi pego. Com a mão suja, o alvo é a linha inteira
//    e sobra da margem: 48px de altura no mínimo, e não existe caixinha para
//    acertar. É a única coisa que o NYT não tenta fazer.
//
// O número exigido pela especificação mora numa sarjeta estreita à esquerda, em
// sans miúdo e apagado: serve de endereço ("o sétimo"), não de marcador. Marcado
// o item, o número cede o lugar a um tique — a sarjeta continua dizendo alguma
// coisa em vez de virar enfeite.

import { textoQuantidade, textoSemMedida, nomeDoItem } from '../unidades.js';

// A folha desta peça é carregada por `index.html`, junto com as outras oito.
// Ela também se injetava sozinha, com guarda contra duplicar — duas rotas para a
// mesma folha, e a casca já resolvia. Uma rota só.

const criar = (tag, classe, texto) => {
  const el = document.createElement(tag);
  if (classe) el.className = classe;
  if (texto != null) el.textContent = texto;
  return el;
};

/** Quantidade já escalada; sem número, devolve "a gosto" marcado como sem medida. */
function medidaDoItem(item, fator) {
  const medida = textoQuantidade(item, fator);
  if (medida) return { texto: medida, semMedida: false };
  return { texto: textoSemMedida(item), semMedida: true };
}

export default function montarIngredientes(pai, receita, estado) {
  const grupos = (receita?.grupos ?? []).filter((g) => g?.itens?.length);
  const secao = criar('section', 'ingredientes envelope');
  secao.setAttribute('aria-labelledby', 'ingredientes-titulo');
  pai.append(secao);

  if (!grupos.length) {
    secao.append(criar('p', 'ingredientes-nenhum', 'Esta receita não traz lista de ingredientes.'));
    return () => secao.remove();
  }

  // ---------------------------------------------------------------- cabeça
  const total = grupos.reduce((n, g) => n + g.itens.length, 0);
  const cabeca = criar('div', 'ingredientes-cabeca');
  const titulo = criar('h2', 'ingredientes-titulo', 'Ingredientes');
  titulo.id = 'ingredientes-titulo';
  cabeca.append(titulo, criar('p', 'ingredientes-resumo rotulo', `${total} ${total === 1 ? 'item' : 'itens'}`));
  secao.append(cabeca, criar('hr', 'fio-pontilhado ingredientes-fio'));

  // ---------------------------------------------------------------- linhas
  const celulas = []; // { item, medida } — para reescalar sem remontar a lista
  let marcados = 0;

  grupos.forEach((grupo, iGrupo) => {
    if (iGrupo > 0) secao.append(criar('hr', 'fio-pontilhado ingredientes-fio-grupo'));
    // título de grupo só existe quando a receita traz um; nunca inventar
    if (grupo.titulo) secao.append(criar('h3', 'ingredientes-grupo', grupo.titulo));

    const lista = criar('ol', 'ingredientes-lista');
    secao.append(lista);

    grupo.itens.forEach((item, i) => {
      const { texto, semMedida } = medidaDoItem(item, estado.fator);

      const linha = document.createElement('button');
      linha.type = 'button';
      linha.className = 'ingredientes-linha';
      linha.setAttribute('aria-pressed', 'false');

      const numero = criar('span', 'ingredientes-numero', String(i + 1));
      numero.setAttribute('aria-hidden', 'true');

      const medida = criar('span', 'ingredientes-medida', texto);
      medida.classList.toggle('ingredientes-sem-medida', semMedida);

      const nomeECia = criar('span', 'ingredientes-texto');
      if (item.emoji) {
        const emoji = criar('span', 'emoji ingredientes-emoji', item.emoji);
        emoji.setAttribute('aria-hidden', 'true');
        nomeECia.append(emoji);
      }
      // o nome concorda com a quantidade: 2 ovos, não 2 ovo
      const nome = criar('span', 'ingredientes-nome', nomeDoItem(item, estado.fator));
      nomeECia.append(nome);
      if (item.obs) nomeECia.append(criar('span', 'ingredientes-obs', item.obs));

      linha.append(numero, medida, nomeECia);
      linha.addEventListener('click', () => {
        const agora = linha.getAttribute('aria-pressed') !== 'true';
        linha.setAttribute('aria-pressed', String(agora));
        marcados += agora ? 1 : -1;
        atualizarLimpar();
      });

      const itemLista = criar('li', 'ingredientes-item');
      itemLista.append(linha);
      lista.append(itemLista);
      celulas.push({ item, medida, nome, linha });
    });
  });

  // --------------------------------------------------------------- limpeza
  const limpar = document.createElement('button');
  limpar.type = 'button';
  limpar.className = 'ingredientes-limpar';
  limpar.textContent = 'Desmarcar tudo';
  limpar.hidden = true;
  limpar.addEventListener('click', () => {
    celulas.forEach(({ linha }) => linha.setAttribute('aria-pressed', 'false'));
    marcados = 0;
    atualizarLimpar();
  });
  secao.append(limpar);

  function atualizarLimpar() {
    limpar.hidden = marcados <= 0;
    limpar.textContent = marcados ? `Desmarcar ${marcados} de ${total}` : 'Desmarcar tudo';
  }

  // ----------------------------------------------------------- a coluna fixa
  // Uma régua invisível mede a maior quantidade da receita e a coluna nasce
  // desse número: apertada nas receitas de "2 dentes", larga só quando existe
  // um "1,6 a 1,8 kg". Nada de largura arbitrária.
  const regua = criar('span', 'ingredientes-medida ingredientes-regua');
  regua.setAttribute('aria-hidden', 'true');
  secao.append(regua);

  // teto da coluna: acima disso a quantidade dobra dentro da própria coluna em
  // vez de comer o nome do ingrediente. "o quanto baste" tem teto menor ainda —
  // não é medida, não manda na largura da lista inteira.
  const TETO = 130;
  const TETO_SEM_MEDIDA = 96;

  function ajustarColuna() {
    let maior = 0;
    for (const { medida } of celulas) {
      const semMedida = medida.classList.contains('ingredientes-sem-medida');
      regua.textContent = medida.textContent;
      regua.classList.toggle('ingredientes-sem-medida', semMedida);
      const largura = regua.getBoundingClientRect().width;
      maior = Math.max(maior, Math.min(largura, semMedida ? TETO_SEM_MEDIDA : TETO));
    }
    secao.style.setProperty('--coluna-medida', `${Math.max(62, Math.ceil(maior) + 2)}px`);
  }

  function reescalar() {
    const fator = estado.fator;
    for (const { item, medida, nome } of celulas) {
      const { texto, semMedida } = medidaDoItem(item, fator);
      medida.textContent = texto;
      medida.classList.toggle('ingredientes-sem-medida', semMedida);
      nome.textContent = nomeDoItem(item, fator); // dobrou a receita, virou "2 limões"
    }
    ajustarColuna();
  }

  ajustarColuna();
  // a fonte de interface é do sistema e já está pronta, mas se o navegador
  // trocar de fonte no meio do caminho a coluna se corrige sozinha
  document.fonts?.ready?.then(ajustarColuna).catch(() => {});

  const desinscrever = estado.aoMudarPorcoes(reescalar);

  return () => {
    desinscrever?.();
    secao.remove();
  };
}
