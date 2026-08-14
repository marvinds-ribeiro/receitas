// Controles do ditado da lista de compras para a Alexa.
//
// A cena manda no desenho. A pessoa está na cozinha, de mãos ocupadas, o celular
// apoiado na bancada e a Alexa do outro lado. O app vai falar sozinho por vários
// lotes seguidos. De um braço de distância ela precisa de três respostas, sem
// tocar em nada: o que está sendo falado agora, quanto falta, e como calar isso
// na hora se a Alexa entender errado.
//
// Daí as decisões:
//
// 1. O palco vem primeiro e é um bloco verde inteiro, sangrando de ponta a ponta
//    como a capa do índice, o topo da receita e a faixa da lista de compras — e
//    não como um cartão de cantos redondos boiando no papel, que era o que fazia
//    dele o único verde do app com desenho de componente de aplicativo. Dentro,
//    a frase exata que está saindo pelo alto-falante — não um resumo, não
//    "lote 2": a frase. O que o aparelho fala é o que a tela mostra.
// 2. A altura da frase é fixa em três linhas e a fileira de botões nunca se move
//    entre um estado e outro. Botão que anda de lugar é botão errado quando a
//    mão está suja e o olho está na panela.
// 3. PARAR é o maior alvo da tela, sozinho na sua linha, em bordô — o único
//    bordô da peça, e o único da tela enquanto o painel estiver aberto: a lista
//    de compras cede o acento do "apagar a lista" enquanto o ditado está no ar.
//    Emergência não divide linha com mais nada.
// 4. REPETIR ESTE LOTE vem logo abaixo, de largura inteira: a Alexa erra de
//    primeira o tempo todo, e repetir o lote não pode custar recomeçar.
// 5. A contagem regressiva da pausa é nossa, só de tela: a máquina avisa quando
//    entrou em espera e por quantos segundos, e o número desce sozinho. De longe,
//    ver "4… 3… 2…" é o que diz que o app não travou.
// 6. Os dois ajustes são pares de blocos de 64px com o valor grande no meio.
//    Nada de trilho fino: o polegar não tem pontaria.

import {
  criarDitado,
  suportado,
  observarVozes,
  ordenarVozes,
  vozCalibrada,
  lerVozGuardada,
  guardarVoz,
  LOTE_MIN,
  LOTE_MAX,
  PAUSA_MIN,
  PAUSA_MAX,
  LOTE_PADRAO,
  PAUSA_PADRAO,
} from '../voz.js';

// A folha desta peça é carregada pelo `index.html`, como a de todas as outras.
// Ela era injetada aqui por conta própria, com guarda contra duplicar — o mesmo
// arquivo entrava por dois caminhos, e era costura aparente no código.

const criar = (tag, classe, texto) => {
  const el = document.createElement(tag);
  if (classe) el.className = classe;
  if (texto != null) el.textContent = texto;
  return el;
};

function botao(classe, texto, acao, rotuloAcessivel) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = classe;
  b.textContent = texto;
  if (acao) b.dataset.acao = acao;
  if (rotuloAcessivel) b.setAttribute('aria-label', rotuloAcessivel);
  return b;
}

/** Par de blocos [−] valor [+] — alvo grande, sem pontaria. */
function montarAjuste(pai, { titulo, unidade, acao, rodape }) {
  const bloco = criar('div', 'ditado-ajuste');

  const cabeca = criar('div', 'ditado-ajuste-cabeca');
  cabeca.append(criar('p', 'rotulo', titulo));
  const limites = criar('p', 'rotulo ditado-limites', rodape);
  cabeca.append(limites);
  bloco.append(cabeca);

  const passo = criar('div', 'ditado-passo');
  const menos = botao('botao botao-vazado ditado-passo-botao', '−', `${acao}-menos`, `Menos ${titulo.toLowerCase()}`);
  const mais = botao('botao botao-vazado ditado-passo-botao', '+', `${acao}-mais`, `Mais ${titulo.toLowerCase()}`);

  const valor = criar('div', 'ditado-valor');
  const numero = criar('span', 'ditado-numero');
  const un = criar('span', 'ditado-unidade rotulo', unidade);
  valor.append(numero, un);

  passo.append(menos, valor, mais);
  bloco.append(passo);
  pai.append(bloco);
  return { bloco, menos, mais, numero, unidade: un, limites };
}

const plural = (n, um, muitos) => `${n} ${n === 1 ? um : muitos}`;

/**
 * O caminho sem fala automática: uma faixa bordô diz o porquê, e as frases de
 * cada lote ficam escritas — quem lê em voz alta para a Alexa é a pessoa.
 * O mesmo desenho serve ao navegador que não sabe falar e ao aparelho sem voz
 * em português: muda só o recado, nunca a saída.
 */
function montarLeituraManual(secao, frases, rotulo, texto) {
  const faixa = criar('div', 'faixa faixa-bordo ditado-faixa');
  faixa.append(criar('p', 'rotulo ditado-faixa-rotulo', rotulo));
  faixa.append(criar('p', 'ditado-faixa-texto', texto));
  secao.append(faixa);

  secao.append(
    criar(
      'p',
      'ditado-nota-solta',
      `Ficam aqui as ${plural(frases.length, 'frase pronta', 'frases prontas')} — leia cada uma para a Alexa, uma de cada vez.`
    )
  );

  const lista = criar('ol', 'ditado-frases');
  frases.forEach((f, i) => {
    const item = criar('li', 'ditado-frase-muda');
    item.append(criar('span', 'rotulo ditado-frase-numero', `Lote ${i + 1}`));
    item.append(criar('p', 'ditado-frase-texto', f));
    lista.append(item);
  });
  secao.append(lista);
}

// A língua da voz por extenso: "pt-BR" no meio de uma opção é jargão de
// máquina, e a mesma voz aparece em aparelho diferente com nome parecido.
const LINGUA_LEGIVEL = {
  'pt-BR': 'português (Brasil)',
  'pt-PT': 'português (Portugal)',
  'en-US': 'inglês (Estados Unidos)',
  'en-GB': 'inglês (Reino Unido)',
  'es-ES': 'espanhol (Espanha)',
  'es-US': 'espanhol (Estados Unidos)',
};
const rotuloDaVoz = (voz) => {
  const lingua = LINGUA_LEGIVEL[voz.lang] || voz.lang || '';
  return lingua ? `${voz.name} — ${lingua}` : voz.name;
};

export default function montarDitado(pai, linhas) {
  // sem `envelope`: quem hospeda o ditado já dá margem e largura máxima, e as duas
  // somadas empurravam o painel para 40px da borda contra os 20px do resto do app
  const secao = criar('section', 'ditado');
  secao.setAttribute('aria-labelledby', 'ditado-titulo');
  pai.append(secao);

  const cabeca = criar('div', 'ditado-cabeca');
  const titulo = criar('h2', 'ditado-titulo', 'Ditado para a Alexa');
  titulo.id = 'ditado-titulo';
  cabeca.append(titulo);
  cabeca.append(
    criar('p', 'ditado-linha-fina', 'O celular fala a lista em voz alta. A Alexa ouve e anota.')
  );
  secao.append(cabeca);

  const itens = (linhas ?? []).filter((l) => l && l.voz);

  // ------------------------------------------------------------ lista vazia
  if (!itens.length) {
    const recado = criar('div', 'ditado-recado');
    recado.append(criar('p', 'ditado-recado-titulo', 'Nada para ditar ainda.'));
    recado.append(
      criar(
        'p',
        'ditado-recado-texto',
        'Escolha as receitas da semana e a lista aparece aqui pronta para falar.'
      )
    );
    secao.append(recado);
    return () => secao.remove();
  }

  const ditado = criarDitado();

  // -------------------------------------------------- aparelho que não fala
  // Recado honesto, e as frases escritas: quem lê em voz alta é você.
  if (!suportado()) {
    const frasesMudas = ditado.preparar(itens, LOTE_PADRAO);
    montarLeituraManual(
      secao,
      frasesMudas,
      'Sem voz neste aparelho',
      'Este navegador não sabe falar, então o app não tem como ditar a lista sozinho.'
    );
    return () => secao.remove();
  }

  // Tudo o que fala mora num envelope só: se o aparelho se revelar sem voz em
  // português, o envelope inteiro sai de cena e entra a leitura manual.
  const painel = criar('div', 'ditado-painel');
  secao.append(painel);

  // ------------------------------------------------------------------ palco
  const palco = criar('div', 'ditado-palco');

  const palcoTopo = criar('div', 'ditado-palco-topo');
  const marcaEstado = criar('p', 'rotulo ditado-estado');
  marcaEstado.setAttribute('aria-live', 'polite');
  const marcaLote = criar('p', 'rotulo ditado-conta');
  palcoTopo.append(marcaEstado, marcaLote);
  palco.append(palcoTopo);

  const barra = criar('div', 'ditado-barra');
  barra.setAttribute('aria-hidden', 'true');
  palco.append(barra);

  const frase = criar('p', 'ditado-frase');
  palco.append(frase);

  const nota = criar('p', 'ditado-nota');
  palco.append(nota);

  // régua invisível: mede a maior frase do ditado e trava a caixa nessa altura
  const regua = criar('p', 'ditado-frase ditado-regua');
  regua.setAttribute('aria-hidden', 'true');
  palco.append(regua);

  painel.append(palco);

  // --------------------------------------------------------------- comandos
  const comandos = criar('div', 'ditado-comandos');

  const bComecar = botao('botao ditado-grande ditado-comecar', 'Começar a ditar', 'comecar');
  // o desvio do continuar: quem quer o ditado desde o primeiro lote tem alvo próprio
  const bRecomecar = botao('botao botao-vazado ditado-medio', 'Recomeçar do primeiro lote', 'recomecar');
  const bParar = botao('botao botao-bordo ditado-grande ditado-parar', 'Parar', 'parar');
  const bRepetir = botao('botao ditado-medio', 'Repetir este lote', 'repetir');

  const trio = criar('div', 'ditado-trio');
  const bVoltar = botao('botao botao-vazado ditado-pequeno', 'Voltar', 'voltar', 'Lote anterior');
  const bPausar = botao('botao botao-vazado ditado-pequeno', 'Pausar', 'pausar');
  const bPular = botao('botao botao-vazado ditado-pequeno', 'Pular', 'pular', 'Próximo lote');
  trio.append(bVoltar, bPausar, bPular);

  comandos.append(bComecar, bRecomecar, bParar, bRepetir, trio);
  painel.append(comandos);

  const dica = criar(
    'p',
    'ditado-dica',
    'Deixe o celular virado para a Alexa e o volume alto.'
  );
  painel.append(dica);

  // --------------------------------------------------------------- ajustes
  painel.append(criar('hr', 'fio-pontilhado ditado-fio'));

  const ajustes = criar('div', 'ditado-ajustes');
  const aLote = montarAjuste(ajustes, {
    titulo: 'Itens por lote',
    unidade: 'itens',
    acao: 'lote',
    rodape: `${LOTE_MIN} a ${LOTE_MAX}`,
  });
  const aPausa = montarAjuste(ajustes, {
    titulo: 'Pausa entre lotes',
    unidade: 'segundos',
    acao: 'pausa',
    rodape: `${PAUSA_MIN} a ${PAUSA_MAX}`,
  });

  // ------------------------------------------------------------ seletor de voz
  // O mesmo desenho dos ajustes: rótulo pequeno em cima, alvo alto embaixo.
  // O `value` de cada opção é o NOME da voz — é o que se guarda e o que a fala
  // procura na hora de sair. Enquanto as vozes do aparelho não chegam, a única
  // opção é a de espera: janela vazia não é aparelho sem voz.
  const blocoVoz = criar('div', 'ditado-ajuste ditado-voz');
  const cabecaVoz = criar('div', 'ditado-ajuste-cabeca');
  const rotuloVoz = criar('label', 'rotulo', 'Voz que fala a lista');
  rotuloVoz.htmlFor = 'ditado-seletor-voz';
  cabecaVoz.append(rotuloVoz);
  const seletorVoz = document.createElement('select');
  seletorVoz.className = 'ditado-seletor-voz';
  seletorVoz.id = 'ditado-seletor-voz';
  seletorVoz.disabled = true;
  seletorVoz.append(new Option('Procurando as vozes do aparelho…', ''));
  blocoVoz.append(cabecaVoz, seletorVoz);
  ajustes.append(blocoVoz);

  painel.append(ajustes);

  const avisoAjuste = criar(
    'p',
    'ditado-aviso-ajuste',
    'O tamanho do lote só muda com o ditado parado.'
  );
  painel.append(avisoAjuste);

  // ----------------------------------------------------------------- estado
  let tamanhoLote = LOTE_PADRAO;
  let segundosPausa = PAUSA_PADRAO;
  let ultimoEstado = 'parado';
  let fimDaEspera = 0;
  let relogio = null;

  const TEXTO_FIM = 'Tudo o que estava na lista já foi falado.';

  // Mede a maior frase do ditado e trava a caixa nessa altura, para que o botão
  // PARAR fique sempre no mesmo pedaço da tela do primeiro ao último lote.
  function medirCaixaDaFrase() {
    let maior = 0;
    for (const f of [...ditado.frases(), TEXTO_FIM]) {
      regua.textContent = f;
      maior = Math.max(maior, regua.getBoundingClientRect().height);
    }
    regua.textContent = '';
    palco.style.setProperty('--altura-frase', `${Math.ceil(maior)}px`);
  }

  ditado.definirPausa(segundosPausa);
  ditado.preparar(itens, tamanhoLote);
  medirCaixaDaFrase();
  document.fonts?.ready?.then(medirCaixaDaFrase).catch(() => {});

  function pararRelogio() {
    if (relogio) clearInterval(relogio);
    relogio = null;
  }

  function restam() {
    return Math.max(0, Math.ceil((fimDaEspera - Date.now()) / 1000));
  }

  function pintarBarra(total, indice, estado) {
    if (barra.childElementCount !== total) {
      barra.replaceChildren();
      for (let i = 0; i < total; i += 1) barra.append(criar('span', 'ditado-tira'));
    }
    const atual = estado === 'parado' && indice >= total ? -1 : indice;
    [...barra.children].forEach((tira, i) => {
      tira.classList.toggle('ditado-tira-feita', i < indice);
      tira.classList.toggle('ditado-tira-atual', i === atual);
    });
  }

  function faixaDeItens(indice, total) {
    if (indice >= total) return '';
    const inicio = indice * tamanhoLote + 1;
    const fim = Math.min((indice + 1) * tamanhoLote, itens.length);
    return inicio === fim
      ? `item ${inicio} de ${itens.length}`
      : `itens ${inicio} a ${fim} de ${itens.length}`;
  }

  function pintar({ estado, indice, total, frase: texto }) {
    const ativo = estado === 'falando' || estado === 'esperando' || estado === 'pausado';
    const terminou = estado === 'parado' && total > 0 && indice >= total;
    // parado no meio: lotes já ditados numa sessão anterior (ou antes de um
    // Parar) — o botão principal oferece continuar dali, não recomeçar mudo
    const retomavel = estado === 'parado' && indice > 0 && !terminou;

    // ------- palco
    const rotuloEstado = {
      falando: 'Falando agora',
      esperando: 'Pausa',
      pausado: 'Pausado',
    };
    marcaEstado.textContent = terminou
      ? 'Ditado completo'
      : rotuloEstado[estado] ?? 'Pronto para ditar';
    marcaEstado.classList.toggle('ditado-estado-vivo', estado === 'falando');

    marcaLote.textContent = terminou
      ? `${plural(total, 'lote', 'lotes')}`
      : `Lote ${Math.min(indice + 1, total)} de ${total}`;

    pintarBarra(total, indice, estado);
    palco.classList.toggle('ditado-palco-falando', estado === 'falando');

    const preview = texto ?? ditado.frases()[0] ?? '';
    frase.textContent = terminou ? TEXTO_FIM : preview;
    frase.classList.toggle('ditado-frase-fraca', !ativo);

    if (estado === 'esperando') {
      nota.textContent = `Próximo lote em ${restam()} s`;
    } else if (estado === 'falando') {
      nota.textContent = faixaDeItens(indice, total);
    } else if (estado === 'pausado') {
      nota.textContent = 'Fala cortada. Retome ou repita.';
    } else if (terminou) {
      nota.textContent = 'Confira na Alexa se ela pegou tudo.';
    } else if (retomavel) {
      nota.textContent =
        indice === 1 ? 'O primeiro lote já foi ditado.' : `Os primeiros ${indice} lotes já foram ditados.`;
    } else {
      nota.textContent = `${plural(itens.length, 'item', 'itens')} em ${plural(total, 'lote', 'lotes')}`;
    }

    // ------- comandos: duas formas fixas, sem botão que anda de lugar
    bComecar.hidden = ativo;
    bComecar.textContent = terminou
      ? 'Ditar tudo de novo'
      : retomavel
        ? `Continuar do lote ${indice + 1}`
        : 'Começar a ditar';
    bRecomecar.hidden = ativo || !retomavel;
    bParar.hidden = !ativo;
    bRepetir.hidden = !ativo;
    trio.hidden = !ativo;
    dica.hidden = ativo;

    bPausar.textContent = estado === 'pausado' ? 'Retomar' : 'Pausar';
    bPausar.dataset.acao = estado === 'pausado' ? 'retomar' : 'pausar';
    bVoltar.disabled = indice <= 0;
    bPular.disabled = indice + 1 >= total;

    // ------- ajustes
    aLote.numero.textContent = String(tamanhoLote);
    aPausa.numero.textContent = String(segundosPausa);
    aLote.menos.disabled = ativo || tamanhoLote <= LOTE_MIN;
    aLote.mais.disabled = ativo || tamanhoLote >= LOTE_MAX;
    aPausa.menos.disabled = segundosPausa <= PAUSA_MIN;
    aPausa.mais.disabled = segundosPausa >= PAUSA_MAX;
    aLote.bloco.classList.toggle('ditado-ajuste-travado', ativo);
    avisoAjuste.hidden = !ativo;
  }

  // A máquina avisa quando entrou em espera e por quanto tempo; o número desce
  // sozinho daqui. De longe, é o que prova que o app não travou.
  function aoMudar(dados) {
    if (dados.estado === 'esperando' && ultimoEstado !== 'esperando') {
      fimDaEspera = Date.now() + dados.pausa * 1000;
      pararRelogio();
      relogio = setInterval(() => {
        nota.textContent = `Próximo lote em ${restam()} s`;
      }, 250);
    }
    if (dados.estado !== 'esperando') pararRelogio();
    ultimoEstado = dados.estado;
    pintar(dados);
  }

  const desinscrever = ditado.inscrever(aoMudar);

  // ---------------------------------------------------------------- toques
  bComecar.addEventListener('click', () => ditado.comecar());
  bRecomecar.addEventListener('click', () => ditado.recomecar());
  bParar.addEventListener('click', () => ditado.parar());
  bRepetir.addEventListener('click', () => ditado.repetir());
  bVoltar.addEventListener('click', () => ditado.voltar());
  bPular.addEventListener('click', () => ditado.pular());
  bPausar.addEventListener('click', () => {
    if (bPausar.dataset.acao === 'retomar') ditado.retomar();
    else ditado.pausar();
  });

  aLote.menos.addEventListener('click', () => mudarLote(-1));
  aLote.mais.addEventListener('click', () => mudarLote(+1));
  aPausa.menos.addEventListener('click', () => mudarPausa(-1));
  aPausa.mais.addEventListener('click', () => mudarPausa(+1));

  function mudarLote(passo) {
    const novo = Math.min(LOTE_MAX, Math.max(LOTE_MIN, tamanhoLote + passo));
    if (novo === tamanhoLote) return;
    tamanhoLote = novo;
    ditado.preparar(itens, tamanhoLote); // remonta as frases e volta ao começo
    medirCaixaDaFrase(); // lote maior, frase maior: a caixa cresce junto
  }

  function mudarPausa(passo) {
    const novo = Math.min(PAUSA_MAX, Math.max(PAUSA_MIN, segundosPausa + passo));
    if (novo === segundosPausa) return;
    segundosPausa = novo;
    ditado.definirPausa(segundosPausa);
  }

  seletorVoz.addEventListener('change', () => {
    if (seletorVoz.value) guardarVoz(seletorVoz.value);
  });

  // ------------------------------------------------------ tela em segundo plano
  // Aba escondida ou tela desligada no meio da fala: corta NA HORA e deixa o
  // ditado pausado — o celular não fica falando sozinho no bolso. E não retoma
  // sozinho ao voltar: quem retoma é a pessoa, quando estiver pronta.
  function aoEsconderPagina() {
    if (document.hidden) ditado.pausar();
  }
  document.addEventListener('visibilitychange', aoEsconderPagina);

  // ------------------------------------------------------------------- vozes
  // getVoices() chega vazio nas primeiras chamadas do Chrome real. Enquanto as
  // vozes não vêm, o começar espera travado — e o recado de "instalar a voz"
  // NÃO aparece: janela vazia não é aparelho sem voz. Só quando a lista chega
  // (ou o prazo generoso estoura) é que se decide entre o painel e o recado.
  bComecar.disabled = true;

  function encherSeletorDeVozes(vozes) {
    const ordenadas = ordenarVozes(vozes);
    seletorVoz.replaceChildren(...ordenadas.map((voz) => new Option(rotuloDaVoz(voz), voz.name)));
    const guardada = lerVozGuardada();
    const escolhida = ordenadas.find((voz) => voz.name === guardada) || vozCalibrada(ordenadas);
    if (escolhida) seletorVoz.value = escolhida.name;
    seletorVoz.disabled = false;
  }

  // Sem NENHUMA voz pt o ditado automático falaria inglês com a Alexa: melhor
  // o caminho honesto — como instalar a voz, e as frases escritas até lá.
  function mostrarComoInstalarVoz() {
    pararRelogio();
    desinscrever?.();
    painel.remove();
    montarLeituraManual(
      secao,
      ditado.frases(),
      'Sem voz em português neste aparelho',
      'Para o app ditar sozinho é preciso instalar a voz em português (Brasil): abra os ' +
        'Ajustes do Android, procure "Texto para voz" e baixe o idioma português (Brasil). ' +
        'Enquanto isso, leia as frases abaixo.'
    );
  }

  const pararDeObservarVozes = observarVozes((vozes) => {
    if (!vozes.some((voz) => String(voz.lang || '').startsWith('pt'))) {
      mostrarComoInstalarVoz();
      return;
    }
    encherSeletorDeVozes(vozes);
    bComecar.disabled = false;
  });

  // sair da tela cala o aparelho: ninguém quer o app falando de outra página
  return () => {
    document.removeEventListener('visibilitychange', aoEsconderPagina);
    pararDeObservarVozes();
    pararRelogio();
    desinscrever?.();
    ditado.parar();
    secao.remove();
  };
}
