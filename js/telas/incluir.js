// Tela "Nova receita": a pessoa escreve (ou dita) a receita, o app põe o pedido na fila
// e o computador de casa faz o resto.
//
// Três coisas moram aqui, de cima para baixo:
//   1. a caixa do texto e o "Criar receita" — o único jeito de pedir, por ora;
//   2. o recado do computador de casa — sem ele, pedido parado parece app travado;
//   3. a lista dos pedidos, cada um dizendo em que pé está.
//
// Texto de pedido vem de material dos outros (site, mensagem, foto transcrita): nada que
// sai de um documento entra por innerHTML. Só textContent e nós montados à mão.
//
// Com um id na rota (#/incluir/<id>) mora a revisão do rascunho: o formulário é de
// componentes/revisao.js, e daqui ele ganha a nuvem (pelo pedidos.js), o glossário do
// caderno e a espera da receita publicada chegar nos dados.
import { carregarReceita, carregarReceitas, recarregar } from '../dados.js';
import { montarGlossario } from '../glossario.js';
import { RECADOS, aoMudarNuvem, contaAtual, entrar, estadoDaNuvem } from '../nuvem.js';
import {
  TEXTO_MAXIMO,
  TEXTO_MINIMO,
  ajudanteOuvindo,
  aoMudar,
  criar as criarPedido,
  descartar,
  fraseDoEstado,
  guardarRascunho,
  lista,
  pedido,
  prontidao,
  salvar,
  tentarDeNovo,
  tituloDe,
} from '../pedidos.js';
import montarRevisao from '../componentes/revisao.js';

const SEM_CONTA = 'Entre com o Google para adicionar receitas.';
const OUVINDO = 'Computador de casa ouvindo';
const DESLIGADO = 'Computador de casa desligado. O pedido espera na fila.';
const GRANDE_DEMAIS = 'Texto grande demais: o limite é de 20.000 caracteres.';

// o carimbo do ajudante envelhece sozinho, sem documento nenhum mudar: só um relógio
// percebe que o computador de casa parou de dar sinal
const RELOGIO_DO_AJUDANTE = 30000;

const ABAS = [
  { id: 'link', nome: 'Link', pronta: false },
  { id: 'texto', nome: 'Texto', pronta: true },
  { id: 'arquivo', nome: 'Arquivo', pronta: false },
];

function criar(tag, classe, texto) {
  const el = document.createElement(tag);
  if (classe) el.className = classe;
  if (texto != null) el.textContent = texto;
  return el;
}

const NAO_EXISTE = 'Esse pedido não existe mais.';
const CONVERTENDO = 'Ainda convertendo. Volte daqui a pouco.';
const CONFIRA = 'Confira antes de salvar';

// O service worker devolve a cópia velha quando a rede demora — do índice e, à parte, do
// arquivo das receitas: a receita publicada só aparece numa recarga seguinte, e o índice
// pode chegar antes do corpo dela. Três minutos de tentativas cobrem o ajudante gerar,
// publicar e o GitHub Pages servir.
const INTERVALO_DA_ESPERA = 3000;
const TENTATIVAS_DA_ESPERA = 60;

function cabecalho({ para = '#/', volta = 'Índice', titulo = 'Nova receita' } = {}) {
  const faixa = criar('header', 'incluir-faixa');
  const voltar = criar('a', 'incluir-voltar');
  voltar.href = para;
  const seta = criar('span', 'incluir-voltar-seta');
  seta.setAttribute('aria-hidden', 'true');
  voltar.append(seta, criar('span', null, volta));
  faixa.append(voltar, criar('h1', 'incluir-titulo', titulo));
  return faixa;
}

/**
 * A revisão de um pedido. Espera a fila e o caderno, monta o formulário e acompanha o
 * pedido: o rascunho vira formulário; na fila ou convertendo, ainda não há o que revisar;
 * sumido ou descartado, não há mais. Publicado, recarrega os dados até a receita chegar.
 */
async function montarRevisaoDoPedido(tela, id) {
  const faixa = cabecalho({ para: '#/incluir', volta: 'Nova receita' });
  const titulo = faixa.querySelector('.incluir-titulo');
  const corpo = criar('div', 'incluir-revisao');
  tela.append(faixa, corpo);

  let vivo = true;
  let revisao = null;
  let glossario = [];
  let pararPedidos = null;
  let chegada = null; // null · 'esperando' · 'chegou' · 'desistiu'
  let espera = null;
  let relogio = null;

  function recado(texto, p, aviso = null) {
    // o formulário fica sabendo do estado novo antes de sair: pedido que deixou de ser
    // rascunho não recebe o guardar pendente por cima
    if (revisao && p !== undefined) revisao.atualizar({ ...(p ?? {}), estado: p?.estado ?? 'descartada', chegada });
    revisao?.limpar();
    revisao = null;
    titulo.textContent = 'Nova receita';
    corpo.replaceChildren(criar('p', 'vazio incluir-revisao-recado', texto));
    if (aviso) corpo.append(criar('p', 'vazio incluir-revisao-recado incluir-revisao-aviso', aviso));
  }

  // pedido parado sem motivo parece app travado: com o computador de casa sem dar sinal,
  // a tela diz que é ele que falta
  const avisoDoComputador = () => (ajudanteOuvindo() ? null : DESLIGADO);

  function esperarChegar(receitaId) {
    if (chegada) return;
    if (!receitaId) {
      chegada = 'chegou';
      return;
    }
    chegada = 'esperando';
    let tentativas = 0;
    const tentar = async () => {
      tentativas += 1;
      let receita = null;
      try {
        // o índice sozinho não basta: o "Abrir receita" abre o corpo, que vem de outro
        // arquivo — só chegou quando a própria receita está nos dados
        await recarregar();
        receita = await carregarReceita(receitaId);
      } catch {
        // rede caída numa volta não é desistência: a próxima tenta de novo
      }
      if (!vivo) return;
      if (receita) chegada = 'chegou';
      else if (tentativas >= TENTATIVAS_DA_ESPERA) chegada = 'desistiu';
      else espera = setTimeout(tentar, INTERVALO_DA_ESPERA);
      if (chegada !== 'esperando') desenhar();
    };
    tentar();
  }

  function desenhar() {
    if (!vivo) return;
    const p = pedido(id);
    if (!contaAtual()) return recado(SEM_CONTA);
    if (!p || p.estado === 'descartada') return recado(NAO_EXISTE, p);
    if (p.estado === 'na-fila' || p.estado === 'convertendo') return recado(CONVERTENDO, p, avisoDoComputador());
    if (p.estado === 'falhou') return recado(p.erro?.mensagem || fraseDoEstado(p), p);
    if (p.estado === 'publicada') esperarChegar(p.receitaId);
    // a revisão não fala com a nuvem: o que ela diz sobre o computador de casa vem daqui
    const comChegada = { ...p, chegada, computador: avisoDoComputador() };
    if (revisao) return revisao.atualizar(comChegada);
    titulo.textContent = CONFIRA;
    corpo.replaceChildren();
    revisao = montarRevisao(corpo, comChegada, {
      glossario,
      aoGuardar: (rascunho) => guardarRascunho(id, rascunho),
      aoSalvar: (rascunho) => salvar(id, rascunho),
      aoDescartar: async () => {
        await descartar(id);
        location.hash = '#/incluir';
      },
    });
  }

  // o caderno é esperado antes de devolver a tela, como nas outras: senha que não abre
  // os dados vira SenhaIncorreta para o roteador levar à entrada. A fila não segura a
  // tela — ela chega quando a nuvem decidir, e até lá o cabeçalho já está de pé.
  const receitas = await carregarReceitas();
  glossario = montarGlossario(Object.values(receitas));
  prontidao().then(() => {
    if (!vivo) return;
    pararPedidos = aoMudar(desenhar);
    // o carimbo do ajudante envelhece sem documento nenhum mudar
    relogio = setInterval(desenhar, RELOGIO_DO_AJUDANTE);
    desenhar();
  });

  return () => {
    vivo = false;
    clearTimeout(espera);
    clearInterval(relogio);
    pararPedidos?.();
    revisao?.limpar();
  };
}

export default {
  titulo: 'Nova receita',

  montar(raiz, params = []) {
    const tela = criar('div', 'incluir');
    raiz.append(tela);

    if (params[0]) return montarRevisaoDoPedido(tela, params[0]);

    tela.append(cabecalho());

    // ================================================================ pedir
    const pedir = criar('section', 'incluir-pedir');
    pedir.append(criar('p', 'rotulo incluir-de-onde', 'De onde vem?'));

    const abas = criar('div', 'incluir-abas');
    abas.setAttribute('role', 'tablist');
    abas.setAttribute('aria-label', 'De onde vem?');
    for (const aba of ABAS) {
      const botao = criar('button', 'incluir-aba');
      botao.type = 'button';
      botao.dataset.aba = aba.id;
      botao.setAttribute('role', 'tab');
      botao.setAttribute('aria-selected', String(aba.id === 'texto'));
      botao.append(criar('span', 'incluir-aba-nome', aba.nome));
      if (!aba.pronta) {
        botao.disabled = true;
        botao.append(criar('span', 'incluir-aba-breve', 'em breve'));
      }
      abas.append(botao);
    }

    const caixa = criar('textarea', 'incluir-texto');
    caixa.placeholder = 'Digite ou dite a receita';
    caixa.setAttribute('aria-label', 'Texto da receita');
    caixa.rows = 9;

    const dica = criar('p', 'incluir-dica', 'Para ditar, use o microfone do teclado.');
    const contagem = criar('p', 'incluir-contagem');
    contagem.setAttribute('aria-live', 'polite');
    const bloqueio = criar('div', 'incluir-bloqueio');
    const recadoEl = criar('p', 'incluir-recado');
    recadoEl.setAttribute('role', 'alert');

    const botaoCriar = criar('button', 'botao incluir-criar', 'Criar receita');
    botaoCriar.type = 'button';

    const ajudanteEl = criar('p', 'incluir-ajudante');

    pedir.append(abas, caixa, dica, contagem, bloqueio, recadoEl, botaoCriar, ajudanteEl);

    // ============================================================= a fila
    const fila = criar('section', 'incluir-fila');
    fila.append(criar('h2', 'incluir-fila-titulo', 'Pedidos'));
    const linhas = criar('ul', 'incluir-pedidos');
    fila.append(linhas);

    tela.append(pedir, fila);

    let recado = null; // o que deu errado na última ação, até a próxima
    let recadoDaConta = null; // a janelinha do Google fechada, até a próxima tentativa
    let urlColada = null; // de "Colar o texto": o pedido novo carrega o endereço do velho
    let enviando = false;
    let folhaAberta = null;

    // ------------------------------------------------------------ desenhar
    const tamanho = () => caixa.value.trim().length;
    const cabe = () => tamanho() >= TEXTO_MINIMO && tamanho() <= TEXTO_MAXIMO;

    function desenharCaixa() {
      const n = tamanho();
      const grande = n > TEXTO_MAXIMO;
      contagem.textContent = grande ? GRANDE_DEMAIS : `${n.toLocaleString('pt-BR')} caracteres`;
      contagem.classList.toggle('incluir-contagem-alerta', grande);
      botaoCriar.disabled = enviando || estadoDaNuvem() !== 'ligada' || !cabe();
    }

    // Redesenhado inteiro a cada mudança, como a caixa da conta no índice: botão que
    // sumiu tem que sumir do DOM, não ficar escondido esperando um toque torto.
    function desenharBloqueio() {
      const estado = estadoDaNuvem();
      bloqueio.replaceChildren();
      bloqueio.hidden = estado === 'ligada';
      if (estado === 'ligada') return;
      const dizer = recadoDaConta ?? (estado === 'sem-conta' ? SEM_CONTA : RECADOS[estado]);
      bloqueio.append(criar('p', 'incluir-bloqueio-texto', dizer));
      if (estado === 'sem-conta') {
        const b = criar('button', 'botao incluir-entrar', 'Entrar com o Google');
        b.type = 'button';
        b.dataset.acao = 'entrar-conta';
        bloqueio.append(b);
      }
    }

    function desenharRecado() {
      recadoEl.textContent = recado ?? '';
      recadoEl.hidden = !recado;
    }

    function desenharAjudante() {
      // só diz alguma coisa quando dá para pedir: sem conta o carimbo nem é lido
      if (estadoDaNuvem() !== 'ligada') {
        ajudanteEl.hidden = true;
        return;
      }
      const ouvindo = ajudanteOuvindo();
      ajudanteEl.hidden = false;
      ajudanteEl.dataset.ouvindo = String(ouvindo);
      ajudanteEl.textContent = ouvindo ? OUVINDO : DESLIGADO;
    }

    function linhaDoPedido(p) {
      let el;
      // publicada também vai para a revisão, não direto para a receita: este aparelho pode
      // ter em memória os dados de antes da publicação, e a revisão sabe esperar chegar
      if (p.estado === 'rascunho' || p.estado === 'salvando' || p.estado === 'publicada') {
        el = criar('a', 'incluir-pedido incluir-pedido-toque');
        el.href = `#/incluir/${encodeURIComponent(p.id)}`;
      } else if (p.estado === 'falhou') {
        el = criar('button', 'incluir-pedido incluir-pedido-toque');
        el.type = 'button';
        el.dataset.acao = 'abrir-folha';
      } else {
        el = criar('div', 'incluir-pedido');
      }
      el.dataset.id = p.id;
      el.dataset.estado = p.estado ?? '';
      el.append(
        criar('span', 'incluir-pedido-titulo', tituloDe(p)),
        criar('span', 'rotulo incluir-pedido-estado', fraseDoEstado(p))
      );
      const li = criar('li', 'incluir-pedido-item');
      li.append(el);
      return li;
    }

    function desenharFila() {
      const pedidos = contaAtual() ? lista() : [];
      fila.hidden = pedidos.length === 0;
      linhas.replaceChildren(...pedidos.map(linhaDoPedido));
      // a folha é de um pedido que falhou: se ele mudou de estado (o outro celular
      // tentou de novo, o ajudante apagou), a pergunta perdeu o assunto
      if (folhaAberta && pedido(folhaAberta)?.estado !== 'falhou') fecharFolha();
    }

    function desenharTudo() {
      desenharCaixa();
      desenharBloqueio();
      desenharRecado();
      desenharAjudante();
      desenharFila();
    }

    // ------------------------------------------------------------- a folha
    // Nasce e morre com a pergunta, como o aviso da lista no cardápio: uma folha com
    // "Descartar" não pode existir na página enquanto ninguém perguntou nada.
    function abrirFolha(id) {
      fecharFolha();
      const p = pedido(id);
      if (!p) return;
      folhaAberta = id;
      const folha = criar('div', 'incluir-folha');
      folha.dataset.id = id;
      const painel = criar('div', 'incluir-folha-painel');
      painel.setAttribute('role', 'dialog');
      painel.setAttribute('aria-modal', 'true');
      painel.setAttribute('aria-label', fraseDoEstado(p));
      painel.append(criar('p', 'incluir-folha-titulo', tituloDe(p)));
      if (p.erro?.mensagem) painel.append(criar('p', 'incluir-folha-erro', p.erro.mensagem));
      const saidas = criar('div', 'incluir-folha-saidas');
      for (const [acao, texto, vazado] of [
        ['tentar', 'Tentar de novo', false],
        ['colar', 'Colar o texto', true],
        ['descartar', 'Descartar', true],
      ]) {
        const b = criar('button', `botao ${vazado ? 'botao-vazado ' : ''}incluir-folha-botao`, texto);
        b.type = 'button';
        b.dataset.acao = acao;
        saidas.append(b);
      }
      painel.append(saidas);
      folha.append(painel);
      tela.append(folha);
      painel.querySelector('button')?.focus();
    }

    function fecharFolha() {
      folhaAberta = null;
      tela.querySelector('.incluir-folha')?.remove();
    }

    async function resolverFolha(acao, id) {
      const p = pedido(id);
      fecharFolha();
      if (!p) return;
      recado = null;
      if (acao === 'colar') {
        caixa.value = p.texto ?? '';
        urlColada = p.url ?? null;
        desenharCaixa();
        desenharRecado();
        caixa.focus();
        return;
      }
      try {
        if (acao === 'tentar') await tentarDeNovo(id);
        if (acao === 'descartar') await descartar(id);
      } catch (erro) {
        recado = erro?.message ?? 'Não consegui mudar o pedido agora.';
      }
      desenharRecado();
    }

    // ------------------------------------------------------------ ouvintes
    caixa.addEventListener('input', () => {
      // texto novo do zero não é mais o texto colado do pedido velho
      if (!caixa.value.trim()) urlColada = null;
      desenharCaixa();
    });

    botaoCriar.addEventListener('click', async () => {
      if (botaoCriar.disabled) return;
      enviando = true;
      recado = null;
      desenharCaixa();
      desenharRecado();
      try {
        await criarPedido({ texto: caixa.value, url: urlColada });
        caixa.value = '';
        urlColada = null;
      } catch (erro) {
        // a nuvem recusou: o texto fica onde está, para tentar de novo sem redigitar
        recado = erro?.message ?? 'Não consegui pôr o pedido na fila agora.';
      }
      enviando = false;
      desenharCaixa();
      desenharRecado();
    });

    bloqueio.addEventListener('click', async (evento) => {
      if (evento.target.closest('[data-acao]')?.dataset.acao !== 'entrar-conta') return;
      recadoDaConta = null;
      try {
        await entrar();
      } catch (erro) {
        // fechar a janelinha do Google é desistência, não defeito
        recadoDaConta = erro?.message ?? 'Não consegui falar com a conta agora.';
      }
      desenharTudo();
    });

    tela.addEventListener('click', (evento) => {
      const gatilho = evento.target.closest('[data-acao]');
      const acao = gatilho?.dataset.acao;
      if (acao === 'abrir-folha') return abrirFolha(gatilho.closest('.incluir-pedido')?.dataset.id);
      const folha = evento.target.closest('.incluir-folha');
      if (!folha) return;
      if (acao === 'tentar' || acao === 'colar' || acao === 'descartar') {
        resolverFolha(acao, folha.dataset.id);
        return;
      }
      // tocar no escuro em volta do painel desiste sem fazer nada
      if (!evento.target.closest('.incluir-folha-painel')) fecharFolha();
    });

    const aoTeclar = (evento) => {
      if (evento.key === 'Escape' && folhaAberta) fecharFolha();
    };
    document.addEventListener('keydown', aoTeclar);

    const pararPedidos = aoMudar(desenharTudo);
    const pararNuvem = aoMudarNuvem(desenharTudo);
    const relogio = setInterval(desenharAjudante, RELOGIO_DO_AJUDANTE);

    desenharTudo();

    return () => {
      clearInterval(relogio);
      pararPedidos();
      pararNuvem();
      document.removeEventListener('keydown', aoTeclar);
    };
  },
};
