// Tela inicial: o índice A–Z.
//
// Todas as 63 receitas ficam na tela, agrupadas por letra. Sem accordion, sem paginação,
// sem "ver mais" — quem procura desce a coluna e lê os nomes.
//
// A rolagem é longa de propósito, então a navegação por letra vive no rodapé, onde o
// polegar chega: o botão "A–Z" abre uma gaveta com as 16 letras em alvos de 56px.

import { carregarIndice, buscar, porLetra, sair, semAcento } from '../dados.js';
import {
  ETIQUETAS,
  aoMudar as aoMudarEtiquetas,
  etiquetasDe,
  nomeDaEtiqueta,
} from '../etiquetas.js';
import {
  RECADOS,
  aoMudarConta,
  aoMudarNuvem,
  contaAtual,
  entrar,
  estadoDaNuvem,
  sairDaConta,
  trocarDeConta,
} from '../nuvem.js';
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
      <p class="indice-capa-sub">${indice.length} receitas da casa, todas nesta página.</p>
      <a class="indice-destaque" href="#/semana">
        <span class="indice-destaque-texto">
          <span class="indice-destaque-nome">Cardápio da semana</span>
          <span class="indice-destaque-sub">Monte segunda a sexta e gere a lista de compras</span>
        </span>
        <span class="indice-destaque-seta" aria-hidden="true"></span>
      </a>`;

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

    // -------------------------------------------------------------- filtros
    // Uma etiqueta por vez: duas ligadas ao mesmo tempo respondem a uma pergunta
    // que ninguém faz ("o que é almoço semanal E sobremesa?") e escondem a
    // resposta da que interessa. Tocar de novo desliga.
    let filtroAtivo = null;

    const filtros = document.createElement('div');
    filtros.className = 'indice-filtros';
    filtros.setAttribute('role', 'group');
    filtros.setAttribute('aria-label', 'Filtrar por etiqueta');
    for (const { id, nome } of ETIQUETAS) {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'indice-filtro';
      chip.dataset.etiqueta = id;
      chip.setAttribute('aria-pressed', 'false');
      chip.textContent = nome;
      filtros.append(chip);
    }

    function pintarFiltros() {
      for (const chip of filtros.children) {
        chip.setAttribute('aria-pressed', chip.dataset.etiqueta === filtroAtivo ? 'true' : 'false');
      }
    }

    filtros.addEventListener('click', (evento) => {
      const chip = evento.target.closest('.indice-filtro');
      if (!chip) return;
      filtroAtivo = filtroAtivo === chip.dataset.etiqueta ? null : chip.dataset.etiqueta;
      pintarFiltros();
      aplicarBusca();
    });

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

    // ------------------------------------------------ conta da casa (só editar)
    // Mora ao lado do "Sair", no fim da rolagem, pelo mesmo motivo que ele: é
    // ajuste de casa, não navegação de cozinha. E é redesenhado inteiro a cada
    // mudança — botão que sumiu tem que sumir do DOM, não ficar escondido
    // esperando um toque torto com a mão suja.
    const contaCaixa = document.createElement('section');
    contaCaixa.className = 'indice-conta';
    let recado = null;

    function desenharConta() {
      const estado = estadoDaNuvem();
      const atual = contaAtual();
      contaCaixa.replaceChildren();
      if (estado === 'desligada' && !recado) return;

      const titulo = document.createElement('p');
      titulo.className = 'rotulo indice-conta-titulo';
      titulo.textContent = 'Edições compartilhadas';
      contaCaixa.append(titulo);

      if (atual) {
        const email = document.createElement('p');
        email.className = 'indice-conta-email';
        email.textContent = atual.email;
        contaCaixa.append(email);
      }

      const dizer = recado ?? (estado === 'ligada' ? null : RECADOS[estado]);
      if (dizer) {
        const aviso = document.createElement('p');
        aviso.className = 'indice-conta-aviso';
        aviso.textContent = dizer;
        contaCaixa.append(aviso);
      }

      const botao = (acao, texto, vazado = true) => {
        const b = document.createElement('button');
        b.className = `botao ${vazado ? 'botao-vazado ' : ''}indice-conta-botao`;
        b.type = 'button';
        b.dataset.acao = acao;
        b.textContent = texto;
        contaCaixa.append(b);
      };

      if (estado === 'sem-conta') botao('entrar-conta', 'Entrar com o Google', false);
      if (estado === 'sem-acesso') botao('trocar-conta', 'Trocar de conta', false);
      if (estado === 'ligada') botao('sair-conta', 'Sair da conta');
    }

    contaCaixa.addEventListener('click', async (evento) => {
      const acao = evento.target.closest('[data-acao]')?.dataset.acao;
      if (!acao) return;
      recado = null;
      try {
        if (acao === 'entrar-conta') await entrar();
        if (acao === 'sair-conta') await sairDaConta();
        if (acao === 'trocar-conta') await trocarDeConta();
      } catch (erro) {
        // fechar a janelinha do Google é desistência, não defeito: a tela explica
        // e continua inteira, nunca vira tela de falha
        recado = erro?.message ?? 'Não consegui falar com a conta agora.';
      }
      desenharConta();
    });

    const pararConta = aoMudarConta(desenharConta);
    const pararNuvem = aoMudarNuvem(desenharConta);

    tela.append(capa, busca, filtros, lista, contaCaixa, fecho);

    // etiqueta editada aqui ou no outro celular redesenha o que está filtrado; com o
    // índice inteiro na tela não há o que refazer, e redesenhar 64 linhas à toa
    // faria a lista piscar embaixo do dedo de quem está rolando
    const pararEtiquetas = aoMudarEtiquetas(() => {
      if (filtroAtivo || campo.value.trim()) aplicarBusca();
    });

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

    /**
     * Quem sobra depois da busca e do filtro.
     *
     * A ordem de `buscar` é ranking (nome que começa com o termo vem antes), então
     * ela vem inteira na frente e o que a etiqueta acrescentou entra atrás — filtrar
     * a lista original perderia esse ranking e embaralharia o resultado.
     */
    function receitasVisiveis(termo) {
      const t = termo.trim();
      let achados = indice;
      if (t) {
        achados = buscar(indice, t);
        const vistos = new Set(achados.map((r) => r.id));
        const alvo = semAcento(t);
        // a etiqueta também é palavra de busca: "sobremesa" acha os doces mesmo
        // sem a palavra estar no nome nem em nenhum ingrediente
        for (const { id, nome } of ETIQUETAS) {
          if (!semAcento(nome).includes(alvo)) continue;
          for (const receita of indice) {
            if (vistos.has(receita.id) || !etiquetasDe(receita).includes(id)) continue;
            vistos.add(receita.id);
            achados = achados.concat(receita);
          }
        }
      }
      if (!filtroAtivo) return achados;
      return achados.filter((r) => etiquetasDe(r).includes(filtroAtivo));
    }

    function desenharAchados(achados, descricao, procurando) {
      lista.replaceChildren();

      if (!achados.length) {
        const vazio = document.createElement('div');
        vazio.className = 'vazio indice-vazio';
        const titulo = document.createElement('p');
        titulo.className = 'vazio-titulo';
        titulo.textContent = procurando
          ? 'Nada com esse nome aqui em casa.'
          : 'Nenhuma receita com essa etiqueta ainda.';
        const texto = document.createElement('p');
        texto.className = 'indice-vazio-texto';
        texto.textContent = procurando
          ? 'Talvez a gente chame o prato de outro jeito. Tente pelo ingrediente — ' +
            'bacalhau, pinhão, gorgonzola — que a busca acha a receita por dentro.'
          : 'As etiquetas se marcam dentro de cada receita, lá no pé da página. ' +
            'Marque algumas e elas aparecem aqui.';
        const botao = document.createElement('button');
        botao.className = 'botao-vazado botao indice-vazio-botao';
        botao.type = 'button';
        botao.textContent = `Ver as ${indice.length} receitas`;
        botao.addEventListener('click', () => {
          campo.value = '';
          filtroAtivo = null;
          pintarFiltros();
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
        `${achados.length} ${achados.length === 1 ? 'receita' : 'receitas'} ${descricao}`;
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
      if (procurando) fecharGaveta();

      // sem busca e sem filtro, o índice inteiro — é o estado normal da tela
      if (!procurando && !filtroAtivo) {
        desenharTudo();
        return;
      }

      const descricao = procurando
        ? `para “${termo.trim()}”`
        : `com a etiqueta ${nomeDaEtiqueta(filtroAtivo)}`;
      desenharAchados(receitasVisiveis(termo), descricao, procurando);
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
      pararConta();
      pararNuvem();
      pararEtiquetas();
      rodape.remove();
      veu.remove();
    };
  },
};
