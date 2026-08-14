// Tela inicial: o índice A–Z.
//
// Todas as 63 receitas ficam na tela, agrupadas por letra. Sem accordion, sem paginação,
// sem "ver mais" — quem procura desce a coluna e lê os nomes.
//
// A rolagem é longa de propósito, então a navegação por letra vive no rodapé, onde o
// polegar chega: o botão "A–Z" abre uma gaveta com as 16 letras em alvos de 56px.

import { carregarIndice, buscar, porLetra, sair } from '../dados.js';
// categoria e tempo se escrevem num lugar só: o índice e o cabeçalho da receita
// mostram o mesmo metadado e agora com as mesmas palavras
import { nomeDaCategoria, textoTempo } from '../componentes/cabecalho.js';

/** Uma linha do índice: emoji sempre na mesma coluna, nome, e um metadado discreto. */
function criarItem(receita) {
  const link = document.createElement('a');
  link.className = 'indice-item';
  link.href = `#/receita/${encodeURIComponent(receita.id)}`;

  const emoji = document.createElement('span');
  emoji.className = 'emoji indice-item-emoji';
  emoji.setAttribute('aria-hidden', 'true');
  emoji.textContent = receita.emoji || '';

  const texto = document.createElement('span');
  texto.className = 'indice-item-texto';

  const nome = document.createElement('span');
  nome.className = 'indice-item-nome';
  nome.textContent = receita.nome;

  const meta = document.createElement('span');
  meta.className = 'rotulo indice-item-meta';
  const partes = [nomeDaCategoria(receita.categoria)].filter(Boolean);
  const tempo = textoTempo(receita.tempo);
  if (tempo) partes.push(tempo);
  meta.textContent = partes.join(' · ');

  texto.append(nome, meta);
  link.append(emoji, texto);
  return link;
}

/** Cabeçalho de letra: glifo grande, fio pontilhado e a contagem à direita. */
function criarGrupo(grupo) {
  const secao = document.createElement('section');
  secao.className = 'indice-grupo';
  secao.id = `letra-${grupo.letra}`;
  secao.dataset.letra = grupo.letra;

  const cabecalho = document.createElement('h2');
  cabecalho.className = 'indice-letra';

  const glifo = document.createElement('span');
  glifo.className = 'indice-letra-glifo';
  glifo.textContent = grupo.letra;

  const fio = document.createElement('span');
  fio.className = 'indice-letra-fio';
  fio.setAttribute('aria-hidden', 'true');

  const conta = document.createElement('span');
  conta.className = 'rotulo indice-letra-conta';
  conta.textContent = grupo.receitas.length;

  cabecalho.append(glifo, fio, conta);
  secao.append(cabecalho);
  for (const receita of grupo.receitas) secao.append(criarItem(receita));
  return secao;
}

export default {
  titulo: 'Índice',

  async montar(raiz) {
    const indice = await carregarIndice();
    const grupos = porLetra(indice);

    const tela = document.createElement('div');
    tela.className = 'indice';
    raiz.append(tela);

    // ------------------------------------------------------------------ capa
    const capa = document.createElement('header');
    capa.className = 'indice-capa';
    capa.innerHTML = `
      <p class="rotulo">Índice A–Z</p>
      <h1 class="indice-titulo">Receitas do Marcus</h1>
      <p class="indice-capa-sub">${indice.length} receitas da casa, todas nesta página.</p>`;

    // ----------------------------------------------------------------- busca
    const busca = document.createElement('div');
    busca.className = 'indice-busca';
    busca.setAttribute('role', 'search');
    busca.innerHTML = `
      <div class="indice-busca-campo">
        <input class="indice-campo" type="search" inputmode="search" autocomplete="off"
               autocapitalize="off" spellcheck="false"
               aria-label="Buscar por nome ou ingrediente"
               placeholder="Buscar nome ou ingrediente">
        <button class="indice-busca-limpar" type="button" aria-label="Limpar a busca" hidden>×</button>
      </div>`;
    const campo = busca.querySelector('.indice-campo');
    const limpar = busca.querySelector('.indice-busca-limpar');

    // ----------------------------------------------------------------- lista
    const lista = document.createElement('div');
    lista.className = 'indice-lista';

    // ------------------------------------------------- fechar o caderno (sair)
    // A especificação pede o botão "Sair", que limpa a senha guardada. Ele mora no fim
    // da rolagem, não na barra fixa: sair não é navegação, e com a mão suja um alvo
    // permanente que apaga a senha é convite a desastre. Confirma em dois toques.
    const fecho = document.createElement('div');
    fecho.className = 'indice-fecho';
    fecho.innerHTML = `
      <hr class="fio-pontilhado">
      <p class="indice-fecho-nota">A senha fica guardada neste aparelho. Sair apaga a senha
        e fecha o caderno; as receitas continuam aqui.</p>
      <button class="botao botao-vazado indice-fecho-botao" type="button" data-acao="sair">Sair</button>`;
    const botaoSair = fecho.querySelector('[data-acao="sair"]');
    let confirmando = null;
    botaoSair.addEventListener('click', () => {
      if (confirmando) {
        clearTimeout(confirmando);
        sair();
        location.hash = '';
        location.reload();
        return;
      }
      botaoSair.textContent = 'Toque de novo para sair';
      botaoSair.classList.add('indice-fecho-confirmando');
      confirmando = setTimeout(() => {
        confirmando = null;
        botaoSair.textContent = 'Sair';
        botaoSair.classList.remove('indice-fecho-confirmando');
      }, 4000);
    });

    tela.append(capa, busca, lista, fecho);

    // ---------------------------------------------------------------- rodapé
    const rodape = document.createElement('div');
    rodape.className = 'indice-rodape';
    rodape.innerHTML = `
      <div class="indice-gaveta" hidden>
        <div class="indice-gaveta-topo">
          <span class="rotulo">Ir para a letra</span>
          <button class="indice-gaveta-acao" type="button" data-acao="topo">Topo</button>
          <button class="indice-gaveta-acao" type="button" data-acao="fechar">Fechar</button>
        </div>
        <div class="indice-gaveta-grade"></div>
      </div>
      <nav class="indice-barra" aria-label="Navegação do índice">
        <div class="indice-barra-interna">
          <button class="botao indice-barra-letras" type="button"
                  aria-expanded="false" aria-label="Ir para uma letra">A–Z</button>
          <a class="botao botao-bordo indice-barra-lista" href="#/lista">Lista de compras</a>
        </div>
      </nav>`;
    raiz.append(rodape);

    const veu = document.createElement('div');
    veu.className = 'indice-veu';
    veu.hidden = true;
    raiz.append(veu);

    const gaveta = rodape.querySelector('.indice-gaveta');
    const grade = rodape.querySelector('.indice-gaveta-grade');
    const botaoLetras = rodape.querySelector('.indice-barra-letras');

    for (const grupo of grupos) {
      const botao = document.createElement('button');
      botao.className = 'indice-gaveta-letra';
      botao.type = 'button';
      botao.dataset.letra = grupo.letra;
      botao.innerHTML = `<span class="indice-gaveta-glifo">${grupo.letra}</span>` +
        `<span class="indice-gaveta-conta">${grupo.receitas.length}</span>`;
      botao.setAttribute('aria-label', `Letra ${grupo.letra}, ${grupo.receitas.length} receitas`);
      grade.append(botao);
    }

    // ------------------------------------------------------------- desenhar
    function desenharTudo() {
      lista.replaceChildren(...grupos.map(criarGrupo));
    }

    function desenharBusca(termo) {
      const achados = buscar(indice, termo);
      lista.replaceChildren();

      if (!achados.length) {
        const vazio = document.createElement('div');
        vazio.className = 'vazio indice-vazio';
        const titulo = document.createElement('p');
        titulo.className = 'vazio-titulo';
        titulo.textContent = 'Nada com esse nome aqui em casa.';
        const texto = document.createElement('p');
        texto.className = 'indice-vazio-texto';
        texto.textContent =
          'Talvez a gente chame o prato de outro jeito. Tente pelo ingrediente — ' +
          'bacalhau, pinhão, gorgonzola — que a busca acha a receita por dentro.';
        const botao = document.createElement('button');
        botao.className = 'botao-vazado botao indice-vazio-botao';
        botao.type = 'button';
        botao.textContent = `Ver as ${indice.length} receitas`;
        botao.addEventListener('click', () => {
          campo.value = '';
          aplicarBusca();
          campo.focus();
        });
        vazio.append(titulo, texto, botao);
        lista.append(vazio);
        return;
      }

      const resumo = document.createElement('p');
      resumo.className = 'rotulo indice-resumo';
      resumo.textContent =
        `${achados.length} ${achados.length === 1 ? 'receita' : 'receitas'} para “${termo.trim()}”`;
      lista.append(resumo);

      const resultados = document.createElement('div');
      resultados.className = 'indice-grupo indice-grupo-busca';
      for (const receita of achados) resultados.append(criarItem(receita));
      lista.append(resultados);
    }

    function aplicarBusca() {
      const termo = campo.value;
      const procurando = termo.trim().length > 0;
      limpar.hidden = !procurando;
      if (procurando) {
        fecharGaveta();
        desenharBusca(termo);
      } else {
        desenharTudo();
      }
    }

    // ------------------------------------------------------------ gaveta A–Z
    /** Marca no teclado de letras qual delas está no alto da tela agora. */
    function marcarLetraAtual() {
      let atual = grupos[0]?.letra;
      for (const secao of lista.querySelectorAll('.indice-grupo')) {
        if (secao.getBoundingClientRect().top <= 96) atual = secao.dataset.letra;
        else break;
      }
      for (const botao of grade.children) {
        botao.setAttribute('aria-current', botao.dataset.letra === atual ? 'true' : 'false');
      }
    }

    function abrirGaveta() {
      marcarLetraAtual();
      gaveta.hidden = false;
      veu.hidden = false;
      botaoLetras.setAttribute('aria-expanded', 'true');
    }

    function fecharGaveta() {
      gaveta.hidden = true;
      veu.hidden = true;
      botaoLetras.setAttribute('aria-expanded', 'false');
    }

    function alternarGaveta() {
      if (!gaveta.hidden) return fecharGaveta();
      // durante uma busca não há letras na tela: o A–Z devolve o índice inteiro e abre
      if (campo.value.trim()) {
        campo.value = '';
        aplicarBusca();
      }
      abrirGaveta();
    }

    // -------------------------------------------------------------- ouvintes
    const aoTeclar = (evento) => {
      if (evento.key === 'Escape' && !gaveta.hidden) fecharGaveta();
    };

    campo.addEventListener('input', aplicarBusca);
    campo.addEventListener('search', aplicarBusca);
    limpar.addEventListener('click', () => {
      campo.value = '';
      aplicarBusca();
      campo.focus();
    });
    botaoLetras.addEventListener('click', alternarGaveta);
    veu.addEventListener('click', fecharGaveta);
    document.addEventListener('keydown', aoTeclar);

    grade.addEventListener('click', (evento) => {
      const botao = evento.target.closest('.indice-gaveta-letra');
      if (!botao) return;
      const alvo = document.getElementById(`letra-${botao.dataset.letra}`);
      fecharGaveta();
      alvo?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    gaveta.addEventListener('click', (evento) => {
      const acao = evento.target.closest('[data-acao]')?.dataset.acao;
      if (acao === 'fechar') fecharGaveta();
      if (acao === 'topo') {
        fecharGaveta();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });

    desenharTudo();

    return () => {
      document.removeEventListener('keydown', aoTeclar);
      rodape.remove();
      veu.remove();
    };
  },
};
