// Arranque e roteador. Rotas em hash — PWA estática, sem servidor que resolva caminho.
//
// Contrato de uma tela (js/telas/*.js): exporta default { titulo, montar(raiz, params) }.
// `montar` pode devolver uma função de limpeza, chamada quando a tela sai.

import { senhaGuardada, carregarIndice, SenhaIncorreta } from './dados.js';

const raiz = document.getElementById('app');
let limparTelaAtual = null;
let rotaAtual = '';

const TELAS = {
  entrada: () => import('./telas/entrada.js'),
  indice: () => import('./telas/indice.js'),
  receita: () => import('./telas/receita.js'),
  lista: () => import('./telas/lista.js'),
  semana: () => import('./telas/semana.js'),
  incluir: () => import('./telas/incluir.js'),
};

/** '#/receita/carbonara' → { tela: 'receita', params: ['carbonara'] } */
function lerRota() {
  const bruto = location.hash.replace(/^#\/?/, '');
  if (!bruto) return { tela: 'indice', params: [] };
  const partes = bruto.split('/').filter(Boolean).map(decodeURIComponent);
  const nome = partes[0];
  if (!TELAS[nome]) return { tela: 'indice', params: [] };
  return { tela: nome, params: partes.slice(1) };
}

export function irPara(rota) {
  if (location.hash === rota) trocarTela();
  else location.hash = rota;
}

async function trocarTela() {
  const { tela, params } = senhaGuardada() ? lerRota() : { tela: 'entrada', params: [] };
  const chave = tela + '/' + params.join('/');

  try {
    limparTelaAtual?.();
  } catch {}
  limparTelaAtual = null;

  const modulo = (await TELAS[tela]()).default;
  raiz.innerHTML = '';
  raiz.dataset.tela = tela;
  document.title = modulo.titulo ? `${modulo.titulo} · Receitas do Marcus` : 'Receitas do Marcus';

  // Montar depende de decifrar 250.000 iterações de PBKDF2, e em rede ruim ainda espera
  // o prazo do service worker. Sem isto a tela fica em branco e parece que travou.
  const aviso = setTimeout(() => {
    if (raiz.children.length) return;
    raiz.innerHTML = '<p class="carregando">Abrindo o caderno…</p>';
  }, 350);

  try {
    limparTelaAtual = (await modulo.montar(raiz, params)) || null;
    clearTimeout(aviso);
    // o aviso pode ter entrado antes de a tela montar; a tela é sempre o último filho
    raiz.querySelector('.carregando')?.remove();
  } catch (erro) {
    clearTimeout(aviso);
    raiz.querySelector('.carregando')?.remove();
    if (erro instanceof SenhaIncorreta) {
      // dados ilegíveis com a senha guardada: volta para a entrada
      localStorage.removeItem('receitas.senha');
      location.hash = '';
      return trocarTela();
    }
    mostrarFalha(erro);
  }

  // trocar de tela sempre começa do topo, menos ao voltar para o índice
  if (rotaAtual !== chave && tela !== 'indice') window.scrollTo(0, 0);
  rotaAtual = chave;
}

function mostrarFalha(erro) {
  console.error(erro);
  raiz.innerHTML = `
    <div class="falha">
      <p class="falha-titulo">Alguma coisa deu errado.</p>
      <p class="falha-detalhe">${String(erro?.message ?? erro).replace(/</g, '&lt;')}</p>
      <button class="botao" onclick="location.reload()">Tentar de novo</button>
    </div>`;
}

window.addEventListener('hashchange', trocarTela);
window.addEventListener('erro-de-senha', () => {
  location.hash = '';
  trocarTela();
});

trocarTela();

// pré-carrega o índice em segundo plano assim que a senha já existe
if (senhaGuardada()) carregarIndice().catch(() => {});

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
