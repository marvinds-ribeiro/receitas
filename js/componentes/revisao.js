// O formulário de revisão: o rascunho que a IA devolveu, inteiro e editável, antes de
// virar receita do caderno.
//
// Este módulo não conhece a nuvem. Guarda o rascunho em memória e fala com quem o montou
// por três avisos: aoGuardar (a pessoa mexeu e parou de mexer), aoSalvar (o rascunho
// passou no contrato) e aoDescartar. Quem monta é telas/incluir.js, que liga isto a
// pedidos.js e diz, em `pedido.chegada`, se a receita publicada já está nos dados, e em
// `pedido.computador`, o aviso de computador de casa desligado (null quando ele ouve).
//
// O rascunho vem de material dos outros, processado por uma IA: nada dele entra por
// innerHTML. Só value, textContent e nós montados à mão.
//
// A marca de "sujo" protege o que a pessoa digita: enquanto houver edição que ainda não
// foi gravada, um rascunho chegando da nuvem (o eco de outro celular, o próprio eco
// atrasado) não redesenha os campos. O estado — editável, salvando, recusado, publicada —
// sempre segue a nuvem, sujo ou não.
import { CATEGORIAS, CODIGOS_DE_UNIDADE, arrumar, conferirRascunho, lerNumero } from '../contrato.js';
import { sugerirDetalhes } from '../glossario.js';
import { UNIDADES } from '../unidades.js';
import { nomeDaCategoria } from './cabecalho.js';

// curto o bastante para fechar o app logo depois de digitar não perder nada; longo o
// bastante para não gravar a cada letra
const ATRASO_DO_GUARDAR = 1200;

const SALVANDO = 'Salvando…';
const CHEGANDO = 'Chegando no caderno…';
const NO_CADERNO = 'No caderno';
const NAO_CHEGOU = 'Ainda não chegou. Abra o índice daqui a pouco.';
const NAO_MANDOU = 'Não consegui mandar salvar agora.';
const NAO_DESCARTOU = 'Não consegui descartar agora.';

const NUMEROS = ['porcoes', 'tempo', 'qtd', 'qtd_ate'];
// os três campos técnicos moram recolhidos em "Detalhes"
const DETALHES = { norm: 'norm', voz: 'voz', emoji: 'emoji-item' };

function criar(tag, classe, texto) {
  const el = document.createElement(tag);
  if (classe) el.className = classe;
  if (texto != null) el.textContent = texto;
  return el;
}

const clonar = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));

/** JSON com as chaves em ordem: a nuvem não promete devolver o mapa na ordem gravada. */
function chaveEstavel(v) {
  if (Array.isArray(v)) return `[${v.map(chaveEstavel).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${chaveEstavel(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v ?? null);
}

/** Só garante as listas: o resto do rascunho fica como veio, para o contrato julgar. */
function normalizar(r) {
  const rascunho = clonar(r && typeof r === 'object' ? r : {});
  if (!Array.isArray(rascunho.grupos)) rascunho.grupos = [];
  rascunho.grupos = rascunho.grupos.map((g) => {
    const grupo = g && typeof g === 'object' ? g : {};
    if (!Array.isArray(grupo.itens)) grupo.itens = [];
    return grupo;
  });
  if (!Array.isArray(rascunho.passos)) rascunho.passos = [];
  return rascunho;
}

const novoItem = () => ({
  qtd: null, qtd_ate: null, un: 'unidade', item: '', obs: null, norm: '', voz: '', emoji: '',
});

/**
 * Número como a cozinha escreve ("0,5", "1 1/2"). O que não for número fica como texto:
 * guardar "um pouco" não perde o que a pessoa escreveu, e o Salvar aponta o campo.
 */
function numeroDoCampo(texto) {
  const n = lerNumero(texto);
  if (n === null) return null;
  return Number.isNaN(n) ? texto.trim() : n;
}
const textoDoNumero = (v) => (typeof v === 'number' ? String(v).replace('.', ',') : (v ?? ''));
const textoOuNull = (t) => (t.trim() === '' ? null : t);

const rotuloDaUnidade = (codigo) => (codigo === 'unidade' ? 'unidade' : UNIDADES[codigo].s);

/** "o nome está vazio" → "O nome está vazio." — o contrato escreve para o log, a tela para gente. */
function frase(mensagem) {
  const m = String(mensagem ?? '').trim();
  if (!m) return '';
  const comPonto = /[.!?]$/.test(m) ? m : `${m}.`;
  return comPonto.charAt(0).toUpperCase() + comPonto.slice(1);
}

function caixaDeTexto(nome, rotulo, { modo, dica } = {}) {
  const c = criar('input');
  c.type = 'text';
  c.name = nome;
  c.autocomplete = 'off';
  if (modo) c.inputMode = modo;
  if (dica) c.placeholder = dica;
  c.setAttribute('aria-label', rotulo);
  return c;
}

/** Lista de escolha que nunca escolhe sozinha: valor fora da lista ganha uma opção vazia. */
function escolha(nome, rotulo, codigos, rotuloDe, atual, vazia) {
  const s = criar('select');
  s.name = nome;
  s.setAttribute('aria-label', rotulo);
  if (!codigos.includes(atual)) {
    const o = criar('option', null, vazia);
    o.value = '';
    s.append(o);
  }
  for (const codigo of codigos) {
    const o = criar('option', null, rotuloDe(codigo));
    o.value = codigo;
    s.append(o);
  }
  s.value = codigos.includes(atual) ? atual : '';
  return s;
}

function campo(rotulo, ...controles) {
  const l = criar('label', 'revisao-campo');
  l.append(criar('span', 'rotulo revisao-campo-rotulo', rotulo), ...controles);
  return l;
}

let ids = 0;
/**
 * Campo com mais coisa em volta do controle (− e +, o "min"). Um <label> que embrulha
 * botões rotula o primeiro deles: tocar na legenda "Porções" tiraria uma porção. Aqui a
 * caixa é neutra e só a legenda é <label>, apontada para o campo de verdade.
 */
function campoComApoio(rotulo, alvo, caixa) {
  alvo.id ||= `revisao-campo-${++ids}`;
  const c = criar('div', 'revisao-campo');
  const legenda = criar('label', 'rotulo revisao-campo-rotulo', rotulo);
  legenda.htmlFor = alvo.id;
  c.append(legenda, caixa);
  return c;
}

function botao(acao, texto, classe, rotulo) {
  const b = criar('button', classe, texto);
  b.type = 'button';
  b.dataset.acao = acao;
  if (rotulo) b.setAttribute('aria-label', rotulo);
  return b;
}

/** ↑ ↓ ✕ de uma linha; a ponta que não tem para onde ir nasce travada. */
function mover(indice, total, oQue, podeTirar = true) {
  const caixa = criar('div', 'revisao-mover');
  const subir = botao('subir', '↑', 'revisao-mover-botao', `Subir ${oQue}`);
  const descer = botao('descer', '↓', 'revisao-mover-botao', `Descer ${oQue}`);
  const tirar = botao('tirar', '✕', 'revisao-mover-botao', `Tirar ${oQue}`);
  if (indice === 0) subir.dataset.borda = 'true';
  if (indice === total - 1) descer.dataset.borda = 'true';
  if (!podeTirar) tirar.dataset.borda = 'true';
  caixa.append(subir, descer, tirar);
  return caixa;
}

export default function montarRevisao(raiz, pedidoInicial, { glossario = [], aoGuardar, aoSalvar, aoDescartar }) {
  let pedido = pedidoInicial;
  let rascunho = normalizar(pedido.rascunho);
  let ultimaDaNuvem = chaveEstavel(pedido.rascunho);

  let sujo = false;
  let edicao = 0; // conta as edições, para o guardar que voltou saber se ficou velho
  let relogio = null;
  let mandando = false;
  let falhaDoSalvar = null;
  let falhaDoDescartar = null;
  let desmontado = false;

  // ================================================================ esqueleto
  const secao = criar('section', 'revisao');
  const fonteEl = criar('div', 'revisao-topo');
  const avisosEl = criar('ul', 'revisao-avisos');

  const form = criar('div', 'revisao-form');

  const receita = criar('div', 'revisao-receita');
  const nome = caixaDeTexto('nome', 'Nome');
  const emoji = caixaDeTexto('emoji', 'Emoji da receita');
  emoji.classList.add('emoji', 'revisao-emoji');
  const categoriaCasa = criar('span', 'revisao-categoria');
  const porcoes = caixaDeTexto('porcoes', 'Porções', { modo: 'numeric' });
  const menos = botao('menos-porcao', '−', 'revisao-porcao-botao', 'Uma porção a menos');
  const mais = botao('mais-porcao', '+', 'revisao-porcao-botao', 'Uma porção a mais');
  const porcoesCaixa = criar('span', 'revisao-porcoes');
  porcoesCaixa.append(menos, porcoes, mais);
  const tempo = caixaDeTexto('tempo', 'Tempo em minutos', { modo: 'numeric' });
  const tempoCaixa = criar('span', 'revisao-tempo');
  tempoCaixa.append(tempo, criar('span', 'revisao-tempo-min', 'min'));
  const nota = criar('textarea', 'revisao-nota');
  nota.name = 'nota';
  nota.rows = 2;
  nota.setAttribute('aria-label', 'Nota');

  const linhaNome = criar('div', 'revisao-linha revisao-linha-nome');
  linhaNome.append(campo('Nome', nome), campo('Emoji', emoji));
  const linhaNumeros = criar('div', 'revisao-linha');
  linhaNumeros.append(campoComApoio('Porções', porcoes, porcoesCaixa), campoComApoio('Tempo', tempo, tempoCaixa));
  const categoriaCampo = campo('Categoria', categoriaCasa);
  receita.append(linhaNome, categoriaCampo, linhaNumeros, campo('Nota', nota));

  const gruposEl = criar('div', 'revisao-grupos');
  const maisGrupo = botao('mais-grupo', '+ grupo', 'botao botao-vazado revisao-mais');
  const passosEl = criar('ol', 'revisao-passos');
  const maisPasso = botao('mais-passo', '+ passo', 'botao botao-vazado revisao-mais');

  form.append(
    receita,
    criar('h2', 'revisao-secao', 'Ingredientes'),
    gruposEl,
    maisGrupo,
    criar('h2', 'revisao-secao', 'Modo de fazer'),
    passosEl,
    maisPasso
  );

  const geralEl = criar('div', 'revisao-geral');
  geralEl.setAttribute('role', 'alert');
  const estadoEl = criar('p', 'revisao-estado');
  estadoEl.setAttribute('aria-live', 'polite');
  // embaixo do "Salvando…": o que o computador de casa está esperando, e se ele está ligado
  const esperaEl = criar('div', 'revisao-espera');
  esperaEl.setAttribute('aria-live', 'polite');
  const abrirCasa = criar('div', 'revisao-chegou');
  const acoes = criar('div', 'revisao-acoes');
  acoes.append(
    botao('descartar', 'Descartar', 'botao botao-vazado revisao-descartar'),
    botao('salvar', 'Salvar receita', 'botao revisao-salvar')
  );

  secao.append(fonteEl, avisosEl, form, geralEl, estadoEl, esperaEl, abrirCasa, acoes);
  raiz.append(secao);

  // ================================================================ desenhar
  function desenharTopo() {
    fonteEl.replaceChildren();
    const f = pedido.fonte?.url ? pedido.fonte : pedido.url ? { url: pedido.url } : null;
    let url = null;
    try {
      url = f && new URL(f.url);
    } catch {}
    // mesmo cuidado da receita: só http(s) vira link
    if (url && (url.protocol === 'http:' || url.protocol === 'https:')) {
      const linha = criar('p', 'rotulo revisao-fonte', 'Fonte: ');
      const a = criar('a', null, f.titulo || url.host);
      a.href = url.href;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      linha.append(a);
      fonteEl.append(linha);
    }
    const avisos = Array.isArray(pedido.avisos) ? pedido.avisos.filter((a) => typeof a === 'string' && a.trim()) : [];
    avisosEl.replaceChildren(...avisos.map((a) => criar('li', 'revisao-aviso', a)));
    avisosEl.hidden = avisos.length === 0;
  }

  function desenharReceita() {
    nome.value = rascunho.nome ?? '';
    emoji.value = rascunho.emoji ?? '';
    categoriaCasa.replaceChildren(
      escolha('categoria', 'Categoria', CATEGORIAS, nomeDaCategoria, rascunho.categoria, 'Escolha a categoria')
    );
    porcoes.value = textoDoNumero(rascunho.porcoes);
    tempo.value = textoDoNumero(rascunho.tempo);
    nota.value = rascunho.nota ?? '';
  }

  function linhaDoItem(it, i, total) {
    const li = criar('li', 'revisao-item');
    li.dataset.item = String(i);

    const qtd = caixaDeTexto('qtd', 'Quantidade', { dica: 'Qtd' });
    qtd.value = textoDoNumero(it.qtd);
    const ate = caixaDeTexto('qtd_ate', 'Até', { dica: 'até' });
    ate.value = textoDoNumero(it.qtd_ate);
    const un = escolha('un', 'Unidade', CODIGOS_DE_UNIDADE, rotuloDaUnidade, it.un, 'Escolha');
    const medida = criar('div', 'revisao-item-medida');
    medida.append(qtd, ate, un);

    const item = caixaDeTexto('item', 'Ingrediente', { dica: 'Ingrediente' });
    item.value = it.item ?? '';
    const obs = caixaDeTexto('obs', 'Observação', { dica: 'Observação' });
    obs.value = it.obs ?? '';

    const detalhes = criar('details', 'revisao-detalhes');
    detalhes.append(criar('summary', 'revisao-detalhes-titulo', 'Detalhes'));
    for (const [chave, rotulo] of [['norm', 'Chave da lista de compras'], ['voz', 'Como a Alexa fala'], ['emoji', 'Emoji']]) {
      const c = caixaDeTexto(DETALHES[chave], rotulo === 'Emoji' ? 'Emoji do ingrediente' : rotulo);
      c.value = it[chave] ?? '';
      if (chave === 'emoji') c.classList.add('emoji', 'revisao-emoji');
      detalhes.append(campo(rotulo, c));
    }

    li.append(medida, item, obs, detalhes, mover(i, total, 'o ingrediente'));
    return li;
  }

  function blocoDoGrupo(g, gi, total) {
    const bloco = criar('section', 'revisao-grupo');
    bloco.dataset.grupo = String(gi);
    const topo = criar('div', 'revisao-grupo-topo');
    const titulo = caixaDeTexto('titulo', 'Título do grupo', { dica: 'Grupo (opcional)' });
    titulo.value = g.titulo ?? '';
    topo.append(titulo, mover(gi, total, 'o grupo', total > 1));
    const itens = criar('ul', 'revisao-itens');
    itens.append(...g.itens.map((it, i) => linhaDoItem(it ?? {}, i, g.itens.length)));
    bloco.append(topo, itens, botao('mais-item', '+ ingrediente', 'botao botao-vazado revisao-mais'));
    return bloco;
  }

  function linhaDoPasso(p, pi, total) {
    const li = criar('li', 'revisao-passo');
    li.dataset.passo = String(pi);
    const caixa = criar('textarea', 'revisao-passo-texto');
    caixa.name = 'passo';
    caixa.rows = 2;
    caixa.value = typeof p === 'string' ? p : '';
    caixa.setAttribute('aria-label', `Passo ${pi + 1}`);
    li.append(criar('span', 'revisao-passo-numero', String(pi + 1)), caixa, mover(pi, total, 'o passo'));
    return li;
  }

  function desenharListas() {
    gruposEl.replaceChildren(...rascunho.grupos.map((g, gi) => blocoDoGrupo(g, gi, rascunho.grupos.length)));
    passosEl.replaceChildren(...rascunho.passos.map((p, pi) => linhaDoPasso(p, pi, rascunho.passos.length)));
  }

  function desenharFormulario() {
    limparProblemas();
    desenharReceita();
    desenharListas();
    aplicarTrava();
  }

  const travado = () => mandando || pedido.estado === 'salvando' || pedido.estado === 'publicada';

  function aplicarTrava() {
    const t = travado();
    for (const c of secao.querySelectorAll('input, select, textarea, button')) {
      c.disabled = t || c.dataset.borda === 'true';
    }
  }

  function desenharEstado() {
    const publicada = pedido.estado === 'publicada';
    const salvando = mandando || pedido.estado === 'salvando';
    let dizer = '';
    if (salvando) dizer = SALVANDO;
    else if (publicada) dizer = { chegou: NO_CADERNO, desistiu: NAO_CHEGOU }[pedido.chegada] ?? CHEGANDO;
    estadoEl.textContent = dizer;
    estadoEl.hidden = !dizer;

    // "Salvando…" sozinho para sempre parece app travado: diz o que falta
    const espera = [];
    if (salvando) {
      if (typeof pedido.etapa === 'string' && pedido.etapa.trim()) espera.push(pedido.etapa.trim());
      if (typeof pedido.computador === 'string' && pedido.computador) espera.push(pedido.computador);
    }
    esperaEl.replaceChildren(...espera.map((t) => criar('p', 'revisao-espera-linha', t)));
    esperaEl.hidden = !espera.length;

    abrirCasa.replaceChildren();
    if (publicada && pedido.chegada === 'chegou' && pedido.receitaId) {
      const a = criar('a', 'botao revisao-abrir', 'Abrir receita');
      a.href = `#/receita/${encodeURIComponent(pedido.receitaId)}`;
      abrirCasa.append(a);
    }
    abrirCasa.hidden = !abrirCasa.children.length;
    // publicada não tem mais o que salvar nem descartar
    acoes.hidden = publicada;

    // a recusa do ajudante (ou a nuvem que não aceitou o pedido de salvar) fica até o
    // próximo Salvar, que manda erro: null
    geralEl.querySelector('.revisao-recusa')?.remove();
    const recusa = travado()
      ? null
      : falhaDoDescartar ?? falhaDoSalvar ?? (pedido.estado === 'rascunho' ? pedido.erro?.mensagem : null);
    if (recusa) geralEl.prepend(criar('p', 'revisao-erro revisao-recusa', recusa));

    aplicarTrava();
  }

  // ================================================================ problemas
  function limparProblemas() {
    for (const e of secao.querySelectorAll('.revisao-erro:not(.revisao-recusa)')) e.remove();
    for (const c of secao.querySelectorAll('[aria-invalid]')) {
      c.removeAttribute('aria-invalid');
      c.removeAttribute('aria-describedby');
    }
  }

  /** O campo de um caminho do contrato ("grupos.0.itens.2.qtd"), ou null se não houver um. */
  function campoDe(onde, passosVivos) {
    const p = onde.split('.');
    if (p.length === 1) return receita.querySelector(`[name="${p[0]}"]`);
    if (p[0] === 'passos') {
      const i = passosVivos[Number(p[1])];
      return passosEl.querySelector(`.revisao-passo[data-passo="${i}"] textarea`);
    }
    if (p[0] !== 'grupos') return null;
    const grupo = gruposEl.querySelector(`.revisao-grupo[data-grupo="${p[1]}"]`);
    if (p[2] === 'titulo') return grupo?.querySelector('.revisao-grupo-topo [name="titulo"]') ?? null;
    if (p[2] !== 'itens' || p.length < 5) return null;
    const nomeDoCampo = p[4] === 'emoji' ? DETALHES.emoji : p[4];
    return grupo?.querySelector(`.revisao-item[data-item="${p[3]}"] [name="${nomeDoCampo}"]`) ?? null;
  }

  let contador = 0;
  function mostrarProblemas(problemas, passosVivos) {
    limparProblemas();
    let primeiro = null;
    for (const { onde, mensagem } of problemas) {
      const erro = criar('p', 'revisao-erro', frase(mensagem));
      const c = campoDe(onde, passosVivos);
      if (!c) {
        geralEl.append(erro);
        continue;
      }
      erro.id = `revisao-erro-${++contador}`;
      c.setAttribute('aria-invalid', 'true');
      c.setAttribute('aria-describedby', erro.id);
      // problema em campo recolhido não pode ficar escondido
      const detalhes = c.closest('details');
      if (detalhes) detalhes.open = true;
      // o recado mora embaixo do campo: dentro da linha do ingrediente ou do passo, e
      // depois da fileira inteira nos campos lado a lado (nome e emoji, porções e tempo)
      const linha = detalhes ? null : c.closest('.revisao-item, .revisao-passo');
      if (linha) linha.append(erro);
      else if (detalhes) c.closest('label').after(erro);
      else (c.closest('.revisao-linha') ?? c.closest('label') ?? c.closest('.revisao-grupo-topo') ?? c).after(erro);
      primeiro ??= c;
    }
    (primeiro ?? geralEl).scrollIntoView?.({ block: 'center' });
    primeiro?.focus({ preventScroll: true });
  }

  // ================================================================ guardar
  // Só pedido em rascunho recebe o que está sendo digitado. Depois que o outro celular
  // mandou salvar (ou o pedido foi descartado, voltou para a fila, falhou), gravar o
  // rascunho daqui por cima trocaria o que o ajudante vai ler por um rascunho que nunca
  // passou no contrato. A edição não se perde: fica no formulário, ainda suja, e vai
  // junto se o pedido voltar para rascunho (a recusa do ajudante).
  const podeGuardar = () => !desmontado && !mandando && pedido.estado === 'rascunho';

  function agendarGuardar() {
    clearTimeout(relogio);
    relogio = podeGuardar() ? setTimeout(guardar, ATRASO_DO_GUARDAR) : null;
  }

  /** `ultima` é a gravação da saída da tela: vai uma vez, sem tentar de novo depois. */
  function guardar(ultima = false) {
    relogio = null;
    if (!ultima && !podeGuardar()) return;
    const minha = edicao;
    const copia = clonar(rascunho);
    Promise.resolve()
      .then(() => aoGuardar(copia))
      .then(
        () => {
          if (minha === edicao && !relogio) sujo = false;
        },
        // continua sujo, e tenta de novo no mesmo passo do atraso — nunca mais depressa
        // que isso, para a rede caída não virar um laço — até a tela sair
        () => {
          if (!ultima && sujo && !relogio) agendarGuardar();
        }
      );
  }

  function marcarSujo() {
    sujo = true;
    edicao += 1;
    agendarGuardar();
  }

  function pararDeGuardar() {
    clearTimeout(relogio);
    relogio = null;
    sujo = false;
  }

  // ================================================================ salvar
  function salvar() {
    if (travado()) return;
    const arrumado = arrumar(rascunho);
    // o arrumar tira passo em branco: o "passos.1" dele pode ser o terceiro da tela
    const passosVivos = rascunho.passos
      .map((p, i) => [typeof p === 'string' ? p.trim() : p, i])
      .filter(([p]) => p !== '')
      .map(([, i]) => i);
    const problemas = conferirRascunho(arrumado);
    falhaDoSalvar = null;
    falhaDoDescartar = null;
    if (problemas.length) {
      desenharEstado();
      mostrarProblemas(problemas, passosVivos);
      return;
    }
    limparProblemas();
    pararDeGuardar();
    mandando = true;
    desenharEstado();
    Promise.resolve()
      .then(() => aoSalvar(arrumado))
      .then(
        () => {
          mandando = false;
          desenharEstado();
        },
        (erro) => {
          // o pedido de salvar não saiu: a tela volta a ser editável, diz por quê, e o
          // que foi digitado continua marcado para guardar — o eco da nuvem não o apaga
          mandando = false;
          falhaDoSalvar = erro?.message || NAO_MANDOU;
          desenharEstado();
          marcarSujo();
        }
      );
  }

  // ================================================================ descartar
  // O lixo só é certo depois que a nuvem aceitou: até lá a edição pendente continua
  // marcada e o guardar continua agendado. Se a nuvem recusar, a tela diz por quê.
  function descartarPedido() {
    falhaDoDescartar = null;
    desenharEstado();
    Promise.resolve()
      .then(() => aoDescartar())
      .then(
        // o pedido foi para o lixo: o guardar pendente não tem mais para quem ir
        () => pararDeGuardar(),
        (erro) => {
          if (desmontado) return;
          falhaDoDescartar = erro?.message || NAO_DESCARTOU;
          desenharEstado();
        }
      );
  }

  // ================================================================ ouvintes
  /** Mexer no campo marcado tira a marca dele; o Salvar seguinte confere tudo de novo. */
  function tirarMarca(c) {
    if (!c.hasAttribute('aria-invalid')) return;
    document.getElementById(c.getAttribute('aria-describedby'))?.remove();
    c.removeAttribute('aria-invalid');
    c.removeAttribute('aria-describedby');
  }

  form.addEventListener('input', (evento) => {
    const c = evento.target;
    if (!c.name || travado()) return;
    const v = c.value;
    tirarMarca(c);

    const passo = c.closest('.revisao-passo');
    const itemEl = c.closest('.revisao-item');
    const grupoEl = c.closest('.revisao-grupo');
    if (passo) {
      rascunho.passos[Number(passo.dataset.passo)] = v;
    } else if (itemEl) {
      const it = rascunho.grupos[Number(grupoEl.dataset.grupo)].itens[Number(itemEl.dataset.item)];
      if (NUMEROS.includes(c.name)) it[c.name] = numeroDoCampo(v);
      else if (c.name === 'obs') it.obs = textoOuNull(v);
      else if (c.name === DETALHES.emoji) it.emoji = v;
      else it[c.name] = v;
      if (c.name === 'item') {
        // nome novo puxa o que o caderno já decidiu sobre ele; sem emoji conhecido,
        // fica o que estava — emoji inventado errado é pior que emoji mantido
        const s = sugerirDetalhes(v, glossario);
        it.norm = s.norm;
        it.voz = s.voz;
        if (s.emoji) it.emoji = s.emoji;
        for (const chave of ['norm', 'voz', 'emoji']) {
          itemEl.querySelector(`[name="${DETALHES[chave]}"]`).value = it[chave] ?? '';
        }
      }
    } else if (grupoEl) {
      rascunho.grupos[Number(grupoEl.dataset.grupo)].titulo = textoOuNull(v);
    } else if (NUMEROS.includes(c.name)) {
      rascunho[c.name] = numeroDoCampo(v);
    } else if (c.name === 'categoria') {
      rascunho.categoria = v || null;
    } else if (c.name === 'nota') {
      rascunho.nota = textoOuNull(v);
    } else {
      rascunho[c.name] = v;
    }
    marcarSujo();
  });

  /** Mudança de estrutura: refaz as listas e guarda como qualquer edição. */
  function mexer(fn, focar) {
    fn();
    desenharFormulario();
    marcarSujo();
    if (focar) secao.querySelector(focar)?.focus();
  }

  function trocar(lista, i, j) {
    if (j < 0 || j >= lista.length) return;
    [lista[i], lista[j]] = [lista[j], lista[i]];
  }

  secao.addEventListener('click', (evento) => {
    const b = evento.target.closest('button[data-acao]');
    if (!b || b.disabled) return;
    const acao = b.dataset.acao;
    if (acao === 'salvar') return salvar();
    if (acao === 'descartar') return descartarPedido();
    if (acao === 'menos-porcao' || acao === 'mais-porcao') {
      const atual = Number.isInteger(rascunho.porcoes) ? rascunho.porcoes : 1;
      const n = Math.min(30, Math.max(1, atual + (acao === 'mais-porcao' ? 1 : -1)));
      rascunho.porcoes = n;
      porcoes.value = String(n);
      tirarMarca(porcoes);
      return marcarSujo();
    }

    const grupoEl = b.closest('.revisao-grupo');
    const gi = Number(grupoEl?.dataset.grupo);
    if (acao === 'mais-grupo') {
      const n = rascunho.grupos.length;
      return mexer(() => rascunho.grupos.push({ titulo: null, itens: [novoItem()] }), `.revisao-grupo[data-grupo="${n}"] [name="titulo"]`);
    }
    if (acao === 'mais-passo') {
      const n = rascunho.passos.length;
      return mexer(() => rascunho.passos.push(''), `.revisao-passo[data-passo="${n}"] textarea`);
    }
    if (acao === 'mais-item') {
      const itens = rascunho.grupos[gi].itens;
      const n = itens.length;
      return mexer(() => itens.push(novoItem()), `.revisao-grupo[data-grupo="${gi}"] .revisao-item[data-item="${n}"] [name="qtd"]`);
    }

    // subir, descer e tirar valem para o que estiver mais perto: item, passo ou grupo
    const alvo = b.closest('.revisao-item, .revisao-passo, .revisao-grupo');
    if (!alvo) return;
    let lista;
    let i;
    if (alvo.classList.contains('revisao-item')) [lista, i] = [rascunho.grupos[gi].itens, Number(alvo.dataset.item)];
    else if (alvo.classList.contains('revisao-passo')) [lista, i] = [rascunho.passos, Number(alvo.dataset.passo)];
    else [lista, i] = [rascunho.grupos, gi];
    if (acao === 'subir') mexer(() => trocar(lista, i, i - 1));
    if (acao === 'descer') mexer(() => trocar(lista, i, i + 1));
    if (acao === 'tirar') mexer(() => lista.splice(i, 1));
  });

  desenharTopo();
  desenharFormulario();
  desenharEstado();

  return {
    /** Notícia nova do pedido. O rascunho só redesenha se ninguém estiver digitando. */
    atualizar(novo) {
      const voltou = pedido.estado !== 'rascunho' && novo.estado === 'rascunho';
      pedido = novo;
      // saiu de rascunho: o guardar pendente não sai (fica sujo, no formulário);
      // voltou (a recusa), o que ficou pendente segue para a nuvem. Só na volta — o eco
      // de um guardar em voo chega ainda sujo, e reagendar nele viraria um laço.
      if (!podeGuardar()) {
        clearTimeout(relogio);
        relogio = null;
      } else if (voltou && sujo) {
        agendarGuardar();
      }
      const chave = chaveEstavel(novo.rascunho);
      if (!sujo && !mandando && chave !== ultimaDaNuvem && chave !== chaveEstavel(rascunho)) {
        rascunho = normalizar(novo.rascunho);
        desenharFormulario();
      }
      ultimaDaNuvem = chave;
      desenharTopo();
      desenharEstado();
    },
    /**
     * Sai da tela: o que não foi gravado vai na hora, uma vez — se o pedido ainda for
     * rascunho. Inclui o guardar que falhou e esperava a nova tentativa.
     */
    limpar() {
      const pendente = sujo && podeGuardar();
      desmontado = true;
      clearTimeout(relogio);
      relogio = null;
      if (pendente) guardar(true);
      secao.remove();
    },
  };
}
