// Tela do cardápio da semana.
//
// Duas coisas diferentes moram aqui, e não se misturam:
//   1. VER a semana — dez vagas, de relance, para saber o que já está resolvido.
//   2. ESCOLHER para uma vaga — uma visão inteira que toma a tela e some quando termina,
//      igual à de escolher receitas da lista de compras. Escolher dentro do cartãozinho
//      da vaga empurraria os outros nove dias para fora da tela.
//
// A vaga oferece primeiro quem tem a etiqueta certa (almoço mostra `almoco-semanal`),
// com "Ver todas" sempre à mão para o dia de fugir da regra.
import { buscar, carregarIndice } from '../dados.js';
import { etiquetasDe, prontidao as etiquetasProntas } from '../etiquetas.js';
import { RECADOS, aoMudarNuvem, estadoDaNuvem, podeEditar } from '../nuvem.js';
import * as guardada from '../lista-guardada.js';
import {
  CHAVES,
  DIAS,
  REFEICOES,
  aoMudar,
  chaveDaVaga,
  daVaga,
  escolhasParaLista,
  limpar,
  mudarPorcoes,
  por,
  prontidao,
  tirar,
} from '../cardapio.js';

const AVISO_LISTA = 'Já há uma lista de compras. Ao confirmar, a lista atual será apagada.';

const emPorcoes = (n) => `${n} ${n === 1 ? 'porção' : 'porções'}`;

function criar(tag, classe, texto) {
  const el = document.createElement(tag);
  if (classe) el.className = classe;
  if (texto != null) el.textContent = texto;
  return el;
}

const lerLista = () => guardada.escolhas();

export default {
  titulo: 'Cardápio da semana',

  async montar(raiz) {
    const indice = await carregarIndice();
    // as etiquetas mandam no que cada vaga oferece: sem elas prontas, a primeira
    // abertura da escolha mostraria a lista errada por uma fração de segundo
    await Promise.race([Promise.all([prontidao(), etiquetasProntas()]), new Promise((r) => setTimeout(r, 2500))]);

    const porId = new Map(indice.map((r) => [r.id, r]));
    const nomeDe = (id) => porId.get(id)?.nome ?? id;

    const tela = criar('div', 'semana');
    raiz.append(tela);

    // ============================================================== VER a semana
    const ver = criar('section', 'semana-ver');
    ver.innerHTML = `
      <header class="semana-faixa">
        <a class="semana-voltar" href="#/">
          <span class="semana-voltar-seta" aria-hidden="true"></span>
          <span>Índice</span>
        </a>
        <h1 class="semana-titulo">Cardápio da semana</h1>
        <button class="semana-limpar" type="button" data-acao="limpar">Limpar cardápio</button>
      </header>
      <p class="semana-aviso-conta" hidden></p>
      <div class="semana-dias"></div>
      <div class="semana-barra">
        <p class="semana-recado" hidden></p>
        <button class="botao botao-bordo semana-gerar" type="button" data-acao="gerar">
          Gerar lista de compras
        </button>
      </div>`;

    const caixaDias = ver.querySelector('.semana-dias');
    const avisoConta = ver.querySelector('.semana-aviso-conta');
    const barra = ver.querySelector('.semana-barra');
    const recadoEl = ver.querySelector('.semana-recado');
    const botaoLimpar = ver.querySelector('.semana-limpar');

    /**
     * O aviso das três saídas nasce e morre com a pergunta.
     *
     * Deixá-lo no DOM escondido parecia inofensivo e não é: um painel que decide
     * apagar a lista de compras não pode existir na página enquanto ninguém
     * perguntou nada — e um teste que procura por ele acharia o escondido e passaria
     * verde sem que a pergunta tivesse sido feita.
     */
    function mostrarAvisoDaLista() {
      if (barra.querySelector('.semana-aviso-lista')) return;
      const caixa = criar('div', 'semana-aviso-lista');
      caixa.append(criar('p', 'semana-aviso-texto', AVISO_LISTA));
      const saidas = criar('div', 'semana-aviso-saidas');
      for (const [acao, texto, vazado] of [
        ['gerar-apagar', 'Confirmar e apagar', false],
        ['gerar-somar', 'Adicionar à lista atual', true],
        ['gerar-voltar', 'Voltar', true],
      ]) {
        const botao = criar('button', `botao ${vazado ? 'botao-vazado ' : ''}semana-aviso-botao`, texto);
        botao.type = 'button';
        botao.dataset.acao = acao;
        saidas.append(botao);
      }
      caixa.append(saidas);
      barra.prepend(caixa);
    }

    const esconderAvisoDaLista = () => barra.querySelector('.semana-aviso-lista')?.remove();

    // ================================================================ ESCOLHER
    const escolha = criar('section', 'semana-escolher');
    escolha.hidden = true;
    escolha.innerHTML = `
      <header class="semana-faixa">
        <button class="semana-voltar" type="button" data-acao="fechar-escolha">
          <span class="semana-voltar-seta" aria-hidden="true"></span>
          <span>Cardápio</span>
        </button>
        <h1 class="semana-titulo semana-escolher-titulo"></h1>
        <p class="rotulo semana-escolher-conta"></p>
      </header>
      <div class="semana-escolher-busca" role="search">
        <input class="semana-campo" type="search" inputmode="search" autocomplete="off"
               autocapitalize="off" spellcheck="false"
               aria-label="Buscar receita por nome ou ingrediente"
               placeholder="Buscar nome ou ingrediente">
      </div>
      <div class="semana-ops"></div>
      <div class="semana-escolher-barra">
        <button class="botao botao-vazado" type="button" data-acao="ver-todas"></button>
      </div>`;

    const tituloEscolha = escolha.querySelector('.semana-escolher-titulo');
    const contaEscolha = escolha.querySelector('.semana-escolher-conta');
    const campo = escolha.querySelector('.semana-campo');
    const caixaOps = escolha.querySelector('.semana-ops');
    const botaoTodas = escolha.querySelector('[data-acao="ver-todas"]');

    tela.append(ver, escolha);

    let vagaAberta = null;
    let verTodas = false;
    let recado = null;
    let confirmandoLimpeza = null;

    // ------------------------------------------------------------- desenhar
    function desenharVagas() {
      const podeMexer = podeEditar();
      caixaDias.replaceChildren(
        ...DIAS.map((dia) => {
          const secao = criar('section', 'semana-dia');
          secao.append(criar('h2', 'semana-dia-nome', dia.nome));

          for (const refeicao of REFEICOES) {
            const chave = chaveDaVaga(dia.id, refeicao.id);
            const bloco = criar('div', 'semana-vaga');
            bloco.dataset.vaga = chave;
            bloco.append(criar('p', 'rotulo semana-vaga-nome', refeicao.nome));

            const postas = daVaga(chave);
            const lista = criar('ul', 'semana-itens');
            for (const { id, porcoes } of postas) {
              const li = criar('li', 'semana-item');
              li.dataset.id = id;
              li.append(criar('span', 'semana-item-nome', nomeDe(id)));

              const passos = criar('div', 'semana-item-passos');
              const menos = criar('button', 'semana-passo', '−');
              menos.type = 'button';
              menos.dataset.acao = 'porcoes-menos';
              menos.disabled = !podeMexer;
              menos.setAttribute('aria-label', `Menos porções de ${nomeDe(id)} na ${refeicao.nome.toLowerCase()} de ${dia.nome}`);

              const valor = criar('output', 'semana-item-porcoes', emPorcoes(porcoes));

              const mais = criar('button', 'semana-passo', '+');
              mais.type = 'button';
              mais.dataset.acao = 'porcoes-mais';
              mais.disabled = !podeMexer;
              mais.setAttribute('aria-label', `Mais porções de ${nomeDe(id)} na ${refeicao.nome.toLowerCase()} de ${dia.nome}`);

              const fora = criar('button', 'semana-tirar', 'Tirar');
              fora.type = 'button';
              fora.dataset.acao = 'tirar';
              fora.disabled = !podeMexer;
              fora.setAttribute('aria-label', `Tirar ${nomeDe(id)} da ${refeicao.nome.toLowerCase()} de ${dia.nome}`);

              passos.append(menos, valor, mais, fora);
              li.append(passos);
              lista.append(li);
            }
            bloco.append(lista);

            const abrir = criar(
              'button',
              'semana-por',
              postas.length ? 'Adicionar outra receita' : 'Escolher receita'
            );
            abrir.type = 'button';
            abrir.dataset.acao = 'escolher';
            abrir.disabled = !podeMexer;
            abrir.setAttribute('aria-label', `Escolher receita para a ${refeicao.nome.toLowerCase()} de ${dia.nome}`);
            bloco.append(abrir);

            secao.append(bloco);
          }
          return secao;
        })
      );

      const estado = estadoDaNuvem();
      const dizer = podeMexer ? null : RECADOS[estado];
      avisoConta.textContent = dizer ?? '';
      avisoConta.hidden = !dizer;
      botaoLimpar.disabled = !podeMexer;

      recadoEl.textContent = recado ?? '';
      recadoEl.hidden = !recado;
    }

    // ------------------------------------------------------ escolher receitas
    function desenharOps() {
      const refeicao = REFEICOES.find((r) => vagaAberta?.endsWith(r.id));
      const termo = campo.value.trim();
      const jaPostas = new Set(daVaga(vagaAberta).map((i) => i.id));

      let candidatas = termo ? buscar(indice, termo) : indice;
      if (!verTodas && refeicao) {
        candidatas = candidatas.filter((r) => etiquetasDe(r).includes(refeicao.etiqueta));
      }

      contaEscolha.textContent = verTodas
        ? `${candidatas.length} receitas da casa`
        : `com a etiqueta ${refeicao?.nome ?? ''}`;
      botaoTodas.textContent = verTodas ? 'Ver só as da etiqueta' : 'Ver todas';

      if (!candidatas.length) {
        const vazio = criar('div', 'vazio semana-vazio');
        vazio.append(
          criar(
            'p',
            'vazio-titulo',
            verTodas ? 'Nada com esse nome aqui em casa.' : 'Nenhuma receita com essa etiqueta ainda.'
          )
        );
        vazio.append(
          criar(
            'p',
            'semana-vazio-texto',
            verTodas
              ? 'Tente pelo ingrediente — a busca acha a receita por dentro.'
              : 'As etiquetas se marcam no pé de cada receita. Ou toque em “Ver todas”.'
          )
        );
        caixaOps.replaceChildren(vazio);
        return;
      }

      caixaOps.replaceChildren(
        ...candidatas.map((receita) => {
          const botao = criar('button', 'semana-op');
          botao.type = 'button';
          botao.dataset.id = receita.id;
          botao.disabled = jaPostas.has(receita.id);
          botao.append(criar('span', 'semana-op-emoji', receita.emoji ?? ''));
          const texto = criar('span', 'semana-op-texto');
          texto.append(criar('span', 'semana-op-nome', receita.nome));
          if (jaPostas.has(receita.id)) {
            texto.append(criar('span', 'rotulo semana-op-meta', 'já está nesta refeição'));
          }
          botao.append(texto);
          return botao;
        })
      );
    }

    function abrirEscolha(chave) {
      vagaAberta = chave;
      verTodas = false;
      campo.value = '';
      const dia = DIAS.find((d) => chave.startsWith(d.id));
      const refeicao = REFEICOES.find((r) => chave.endsWith(r.id));
      tituloEscolha.textContent = `${dia?.nome ?? ''} · ${refeicao?.nome ?? ''}`;
      desenharOps();
      ver.hidden = true;
      escolha.hidden = false;
      window.scrollTo(0, 0);
    }

    function fecharEscolha() {
      vagaAberta = null;
      escolha.hidden = true;
      ver.hidden = false;
    }

    // ------------------------------------------------------------ gerar lista
    function guardarLista(escolhas, limparMarcas) {
      // as marcas são do mercado da lista anterior; substituir a lista sem apagá-las
      // faria itens novos nascerem riscados
      const marcas = limparMarcas ? [] : guardada.marcados();
      guardada.definirTudo(escolhas, marcas).catch((erro) => {
        recado = erro?.message ?? 'Não consegui guardar a lista agora.';
        desenharVagas();
      });
      return true;
    }

    function irParaLista() {
      location.hash = '#/lista';
    }

    function gerar() {
      const escolhas = escolhasParaLista();
      if (!Object.keys(escolhas).length) {
        recado = 'O cardápio está vazio. Ponha alguma receita numa vaga primeiro.';
        desenharVagas();
        return;
      }
      recado = null;
      if (Object.keys(lerLista()).length) {
        mostrarAvisoDaLista();
        return;
      }
      if (guardarLista(escolhas, true)) irParaLista();
    }

    function resolverAviso(acao) {
      esconderAvisoDaLista();
      if (acao === 'gerar-voltar') return;
      const escolhas = escolhasParaLista();
      if (acao === 'gerar-apagar') {
        if (guardarLista(escolhas, true)) irParaLista();
        return;
      }
      const somadas = { ...lerLista() };
      for (const [id, porcoes] of Object.entries(escolhas)) {
        somadas[id] = (somadas[id] ?? 0) + porcoes;
      }
      // somar não apaga as marcas: quem já pegou o tomate continua tendo pegado
      if (guardarLista(somadas, false)) irParaLista();
    }

    // -------------------------------------------------------------- ouvintes
    ver.addEventListener('click', async (evento) => {
      const gatilho = evento.target.closest('[data-acao]');
      const acao = gatilho?.dataset.acao;
      if (!acao) return;

      if (acao.startsWith('gerar-')) return resolverAviso(acao);
      if (acao === 'gerar') return gerar();

      if (acao === 'limpar') {
        if (!confirmandoLimpeza) {
          botaoLimpar.textContent = 'Tocar de novo para limpar';
          botaoLimpar.classList.add('semana-limpar-armado');
          confirmandoLimpeza = setTimeout(desarmarLimpeza, 4000);
          return;
        }
        desarmarLimpeza();
        try {
          await limpar();
        } catch (erro) {
          recado = erro?.message ?? 'Não consegui limpar o cardápio agora.';
        }
        desenharVagas();
        return;
      }

      const chave = gatilho.closest('.semana-vaga')?.dataset.vaga;
      const id = gatilho.closest('.semana-item')?.dataset.id;
      if (!chave) return;

      try {
        if (acao === 'escolher') return abrirEscolha(chave);
        if (acao === 'tirar') await tirar(chave, id);
        if (acao === 'porcoes-mais') await mudarPorcoes(chave, id, +1);
        if (acao === 'porcoes-menos') await mudarPorcoes(chave, id, -1);
      } catch (erro) {
        recado = erro?.message ?? 'Não consegui mudar o cardápio agora.';
      }
      desenharVagas();
    });

    function desarmarLimpeza() {
      clearTimeout(confirmandoLimpeza);
      confirmandoLimpeza = null;
      botaoLimpar.textContent = 'Limpar cardápio';
      botaoLimpar.classList.remove('semana-limpar-armado');
    }

    escolha.addEventListener('click', async (evento) => {
      const acao = evento.target.closest('[data-acao]')?.dataset.acao;
      if (acao === 'fechar-escolha') return fecharEscolha();
      if (acao === 'ver-todas') {
        verTodas = !verTodas;
        return desenharOps();
      }

      const op = evento.target.closest('.semana-op');
      if (!op || op.disabled || !vagaAberta) return;
      const chave = vagaAberta;
      try {
        await por(chave, op.dataset.id);
      } catch (erro) {
        recado = erro?.message ?? 'Não consegui pôr a receita na vaga agora.';
      }
      // escolher fecha: a vaga é o assunto, e ela está do outro lado
      fecharEscolha();
      desenharVagas();
    });

    campo.addEventListener('input', desenharOps);

    const pararCardapio = aoMudar(() => {
      desenharVagas();
      if (!escolha.hidden) desenharOps();
    });
    const pararNuvem = aoMudarNuvem(() => desenharVagas());

    desenharVagas();

    return () => {
      desarmarLimpeza();
      pararCardapio();
      pararNuvem();
    };
  },
};
