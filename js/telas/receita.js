// Tela de receita. Só compõe as peças — quem desenha cada bloco são os componentes.
//
// Estado das porções vive aqui, porque o cabeçalho controla e os ingredientes obedecem.

import { carregarReceita } from '../dados.js';
import montarCabecalho from '../componentes/cabecalho.js';
import montarIngredientes from '../componentes/ingredientes.js';
import montarPassos from '../componentes/passos.js';
import montarEtiquetas from '../componentes/etiquetas.js';
import * as cozinha from '../cozinha.js';

export default {
  titulo: 'Receita',

  async montar(raiz, [id]) {
    const receita = await carregarReceita(id);
    if (!receita) {
      raiz.innerHTML = `
        <div class="falha">
          <p class="falha-titulo">Essa receita não está aqui.</p>
          <a class="botao" href="#/">Voltar para o índice</a>
        </div>`;
      return;
    }

    document.title = `${receita.nome} · Receitas do Marcus`;

    const artigo = document.createElement('article');
    artigo.className = 'receita';
    raiz.append(artigo);

    // porções: o cabeçalho muda, os ingredientes escutam
    let porcoes = receita.porcoes;
    const ouvintesPorcoes = new Set();
    const estado = {
      get porcoes() {
        return porcoes;
      },
      get fator() {
        return porcoes / receita.porcoes;
      },
      definirPorcoes(n) {
        const novo = Math.min(40, Math.max(1, Math.round(n)));
        if (novo === porcoes) return;
        porcoes = novo;
        ouvintesPorcoes.forEach((f) => f(this.fator, porcoes));
      },
      aoMudarPorcoes(f) {
        ouvintesPorcoes.add(f);
        return () => ouvintesPorcoes.delete(f);
      },
    };

    // As etiquetas moram na nuvem POR ID, e quem sabe o id com certeza é a rota — o
    // objeto da receita é o valor de um mapa e pode não repetir a própria chave. Sem
    // isto, a gravação ia para "etiquetas/undefined" e a leitura nunca achava nada.
    const comId = receita.id ? receita : { ...receita, id };

    const limpezas = [
      montarCabecalho(artigo, receita, estado),
      montarIngredientes(artigo, receita, estado),
      montarPassos(artigo, receita, estado),
      montarEtiquetas(artigo, comId),
    ];

    return () => {
      limpezas.forEach((f) => {
        try {
          f?.();
        } catch {}
      });
      cozinha.desligar();
    };
  },
};
