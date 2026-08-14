// Tela de entrada — a capa do app e o pedido de senha.
//
// É a primeira coisa que a pessoa vê, então carrega a identidade inteira:
// selo desenhado a traço, nome em Fraunces grande, cartão de papel com fio pontilhado.
// Só um campo e um botão. Nada além disso.
//
// O terço de cima é um bloco verde chapado, de ponta a ponta — o mesmo topo que
// abre o índice e a lista de compras. Cor em bloco, e uma só vez por tela: o
// verde fica na capa, o bordô fica reservado ao recado de erro.

import { conferirSenha, SenhaIncorreta } from '../dados.js';

const RECADOS = {
  vazio: 'Escreva a senha para entrar.',
  errada: 'Essa senha não abriu a porta. Acontece — confira e tente de novo.',
  offline: 'O aparelho está sem conexão e as receitas ainda não foram baixadas. Reconecte e tente de novo.',
  rede: 'Não consegui buscar o caderno agora. Veja a conexão e tente outra vez.',
};

/** Raios do selo: alternam curto e longo, acompanhando o oval do cartucho. */
function raiosDoSelo() {
  const traços = [];
  const total = 44;
  for (let i = 0; i < total; i++) {
    const ang = (i / total) * Math.PI * 2 - Math.PI / 2;
    const dentro = 1.26;
    const fora = i % 2 ? 1.34 : 1.44;
    const x1 = (100 + Math.cos(ang) * 66 * dentro).toFixed(1);
    const y1 = (100 + Math.sin(ang) * 58 * dentro).toFixed(1);
    const x2 = (100 + Math.cos(ang) * 66 * fora).toFixed(1);
    const y2 = (100 + Math.sin(ang) * 58 * fora).toFixed(1);
    traços.push(`<line class="entrada-raio" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`);
  }
  return traços.join('');
}

/** O brasão da casa: raios, cartucho de contorno duplo, fio de pontinhos, coroa e monograma. */
function selo() {
  return `
    <svg class="entrada-selo" viewBox="0 0 200 200" role="img" aria-label="Selo da casa">
      <g>${raiosDoSelo()}</g>
      <ellipse class="entrada-cartucho" cx="100" cy="100" rx="66" ry="58"/>
      <ellipse class="entrada-cartucho-interno" cx="100" cy="100" rx="60" ry="52.5"/>
      <ellipse class="entrada-pontinhos" cx="100" cy="100" rx="52" ry="45"/>
      <path class="entrada-coroa" transform="translate(100 69)"
            d="M-13 0 L-13 -9 L-6.5 -3.5 L0 -12 L6.5 -3.5 L13 -9 L13 0 Z"/>
      <text class="entrada-monograma" x="100" y="119" text-anchor="middle">M</text>
      <g class="entrada-floreio">
        <line x1="80" y1="136" x2="93" y2="136"/>
        <line x1="107" y1="136" x2="120" y2="136"/>
      </g>
      <path class="entrada-floreio-losango" d="M100 131.5 L104.5 136 L100 140.5 L95.5 136 Z"/>
    </svg>`;
}

export default {
  titulo: 'Entrar',

  async montar(raiz) {
    const secao = document.createElement('section');
    secao.className = 'entrada';
    secao.innerHTML = `
      <div class="entrada-capa">
        <div class="entrada-conteudo">
          ${selo()}

          <h1 class="entrada-nome"><span>Receitas</span><span>do Marcus</span></h1>

          <div class="losango entrada-divisor" aria-hidden="true"><span></span></div>

          <p class="rotulo entrada-placa">Cozinha de casa · mesa sempre posta</p>
        </div>
      </div>

      <div class="entrada-conteudo entrada-corpo">
        <form class="entrada-cartao" novalidate>
          <label class="rotulo entrada-etiqueta" for="entrada-senha">Senha da casa</label>

          <div class="entrada-campo">
            <input
              class="entrada-senha"
              id="entrada-senha"
              name="senha"
              type="password"
              autocomplete="current-password"
              enterkeyhint="go"
              autocapitalize="off"
              autocorrect="off"
              spellcheck="false"
              aria-describedby="entrada-recado">
            <button class="entrada-olho" type="button" aria-pressed="false" aria-controls="entrada-senha">
              <span class="entrada-olho-texto">Ver</span>
              <span class="so-leitor">senha</span>
            </button>
          </div>

          <p class="entrada-recado" id="entrada-recado" role="status" aria-live="polite" hidden></p>

          <button class="botao entrada-entrar" type="submit">Entrar</button>
        </form>

        <p class="entrada-rodape">É a mesma senha de sempre, a do bilhete na geladeira.</p>
      </div>`;
    raiz.append(secao);

    const formulario = secao.querySelector('form');
    const campo = secao.querySelector('.entrada-senha');
    const olho = secao.querySelector('.entrada-olho');
    const olhoTexto = secao.querySelector('.entrada-olho-texto');
    const recado = secao.querySelector('.entrada-recado');
    const entrar = secao.querySelector('.entrada-entrar');

    const mostrarRecado = (texto) => {
      recado.textContent = texto;
      recado.hidden = false;
      campo.setAttribute('aria-invalid', 'true');
    };

    const limparRecado = () => {
      if (recado.hidden) return;
      recado.hidden = true;
      recado.textContent = '';
      campo.removeAttribute('aria-invalid');
    };

    const ocupado = (sim) => {
      entrar.disabled = sim;
      campo.readOnly = sim;
      entrar.textContent = sim ? 'Abrindo…' : 'Entrar';
    };

    // mostrar/esconder: alvo de 48px, e o cursor volta para o fim do que já foi digitado
    olho.addEventListener('click', () => {
      const escondida = campo.type === 'password';
      campo.type = escondida ? 'text' : 'password';
      olhoTexto.textContent = escondida ? 'Ocultar' : 'Ver';
      olho.setAttribute('aria-pressed', String(escondida));
      campo.focus();
      const fim = campo.value.length;
      try {
        campo.setSelectionRange(fim, fim);
      } catch {}
    });

    campo.addEventListener('input', limparRecado);

    formulario.addEventListener('submit', async (evento) => {
      evento.preventDefault();
      const senha = campo.value;

      if (!senha.trim()) {
        mostrarRecado(RECADOS.vazio);
        campo.focus();
        return;
      }

      limparRecado();
      ocupado(true);

      try {
        await conferirSenha(senha);
        location.hash = '';
        location.reload();
      } catch (erro) {
        ocupado(false);
        // senha errada é uma coisa; não conseguir buscar o arquivo é outra bem diferente
        const senhaErrada = erro instanceof SenhaIncorreta || erro?.name === 'SenhaIncorreta';
        if (senhaErrada) mostrarRecado(RECADOS.errada);
        else mostrarRecado(navigator.onLine === false ? RECADOS.offline : RECADOS.rede);
        campo.focus();
      }
    });
  },
};
