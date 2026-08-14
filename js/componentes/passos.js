// Passos do preparo.
//
// Regra da especificação: nada de numeração. O que separa um passo do outro é o
// respiro e o ritmo — nunca um número.
//
// O problema real é reencontrar a linha depois de olhar para a panela. Um
// losango igual ao lado de cada passo não resolve: oito marcas idênticas não
// dizem onde a pessoa estava. Quem resolve é um NOME por passo, e o passo já
// tem um: a ação que ele manda fazer. "Dourar o bacon", "Juntar a cebola",
// "Deixar cozinhar". A pessoa guarda de cabeça "eu parei no refogar" com mais
// facilidade do que "eu parei no cinco", e o rótulo em caixa alta espacejada da
// fonte de interface lê-se de um braço de distância.
//
// O rótulo sai do texto em tempo de execução (ver rotularPassos): verbo no
// infinitivo + complemento curto, tudo tirado da própria frase. Quando a frase
// não rende rótulo decente, o passo fica sem rótulo e o desenho segue de pé.
//
// O passo de AGORA — o primeiro ainda não marcado — troca o losango por um
// filete verde de corpo inteiro e ganha um campo de papel atrás do texto. O
// bordô da tela de receita é da faixa de recado do cabeçalho: um por tela.
//
// Um toque em qualquer lugar do passo marca ou desmarca. O alvo é o passo
// inteiro — nada de caixinha de formulário ao lado da prosa.

const CHAVE = 'receitas.passos';

// ------------------------------------------------------------- o rótulo
// Verbos de cozinha, no infinitivo. As formas de imperativo saem daqui por
// regra ("cortar" → "corte", "mexer" → "mexa", "picar" → "pique"), então a
// receita pode estar escrita em imperativo ("Corte") ou em infinitivo
// ("Cortar") que o rótulo sai igual.
const VERBOS = `abrir acertar acrescentar adicionar ajustar amarrar amassar apurar aquecer arrumar assar
  bater bolear branquear cobrir coar colocar cozinhar cozer cortar completar congelar conservar cuidar
  decorar deixar derreter desligar descansar descascar desfiar desmoldar despejar dessalgar destampar
  dissolver dividir dobrar dourar embrulhar empanar encher enfarinhar engrossar enrolar envolver
  escorrer escaldar esfriar espalhar esperar espremer esquentar fatiar fazer fechar fermentar ferver
  finalizar flambar forrar fritar furar gratinar grelhar guardar hidratar incluir intercalar juntar
  jogar lavar levar ligar limpar marinar mexer misturar moer molhar montar passar peneirar picar pincelar
  polvilhar preparar provar ralar rechear reduzir refogar regar remover repetir reservar retirar
  salgar salpicar saltear secar selar separar servir sovar tampar temperar tirar tostar transferir
  triturar untar virar voltar descongelar acomodar`
  .split(/\s+/)
  .filter(Boolean);

// as que não saem por regra
const IRREGULARES = {
  faça: 'fazer', ponha: 'pôr', pôr: 'pôr', dê: 'dar', dar: 'dar', sirva: 'servir',
  meça: 'medir', medir: 'medir', transfira: 'transferir', substitua: 'substituir',
  substituir: 'substituir', cubra: 'cobrir', disponha: 'dispor', dispor: 'dispor',
  'pré-aqueça': 'pré-aquecer', 'pré-aquecer': 'pré-aquecer',
  preaqueça: 'pré-aquecer', preaquecer: 'pré-aquecer',
};

/** Formas de superfície aceitas para um infinitivo: ele mesmo e o imperativo. */
function formasDoVerbo(infinitivo) {
  const raiz = infinitivo.slice(0, -2);
  const saida = new Set([infinitivo]);
  if (infinitivo.endsWith('ar')) {
    // -ear pede "-eie" (rechear → recheie)
    if (infinitivo.endsWith('ear')) saida.add(infinitivo.slice(0, -3) + 'eie');
    let r = raiz;
    if (r.endsWith('c')) r = r.slice(0, -1) + 'qu';
    else if (r.endsWith('g')) r = r + 'u';
    else if (r.endsWith('ç')) r = r.slice(0, -1) + 'c';
    saida.add(r + 'e');
  } else {
    let r = raiz;
    if (r.endsWith('c')) r = r.slice(0, -1) + 'ç';
    else if (r.endsWith('g')) r = r.slice(0, -1) + 'j';
    saida.add(r + 'a');
  }
  return [...saida];
}

const FORMAS = new Map();
for (const v of VERBOS) for (const f of formasDoVerbo(v)) if (!FORMAS.has(f)) FORMAS.set(f, v);
for (const [forma, inf] of Object.entries(IRREGULARES)) FORMAS.set(forma, inf);

// artigos e preposições: entram no rótulo, mas não valem como nome
const LIGACOES = new Set(
  `o a os as um uma uns umas ao aos à às no na nos nas do da dos das em de com para por sem sobre
   dois duas três quatro cinco seis sete oito nove dez`.split(/\s+/)
);
// palavras que não nomeiam nada: advérbio, medida, tempo, determinante
const VAZIAS = new Set(
  `pouco poucos pouca poucas bem muito muita mais menos tudo todo toda todos todas outro outra
   outros outras mesmo mesma mesmos mesmas demais algum alguma alguns algumas cada metade restante
   unidade unidades quase sempre novamente também ainda já só apenas então logo depois antes agora
   devagar delicadamente levemente cuidadosamente aproximadamente cerca imediatamente primeiro
   junto juntos meio bastante previamente rapidamente lentamente seguir minuto minutos hora horas
   segundo segundos dia dias noite grau graus temperatura ponto vez vezes cm ml kg litro litros
   colher colheres xícara xícaras`.split(/\s+/)
);
// daqui em diante o rótulo não colhe mais nada
const CORTES = new Set('e ou até que quando se mas porém enquanto como assim'.split(/\s+/));
// palavra que, antes do verbo, tira dele o comando do passo
const ANTES_QUE_ANULAM = new Set('não nunca de for'.split(' '));
// prefixo antes de dois-pontos que não nomeia o passo
const PREFIXOS_VAZIOS = new Set('opcional atenção obs observação nota dica importante ps'.split(' '));
// quando o complemento recomeça numa preposição solta: "um pouco de farinha" → "farinha",
// "metade do tomate" → "o tomate"
const REMENDO = { de: '', da: 'a', do: 'o', das: 'as', dos: 'os' };

const LIMITE_ROTULO = 26;

const semPontuacao = (p) => p.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}%°º-]+$/gu, '');
const paraTela = (p) => p.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}%°º-]+$/gu, '');
const fimDeTrecho = (p) => /[.,;:!?)]$/.test(p);

// até onde o rótulo procura o verbo. A janela curta é a regra: quem manda no
// passo costuma aparecer nas primeiras palavras. A larga só entra quando a
// janela curta não rendeu rótulo nenhum com complemento — é o caso de "Antes de
// começar a grudar no fundo da panela, meça 4 xícaras de água e regue o arroz",
// que na janela curta virava só "MEDIR".
const JANELA = 12;
const JANELA_LARGA = 26;

/** Acha o verbo que nomeia o passo. `pulo` diz quantos verbos ignorar antes. */
function acharVerbo(palavras, pulo, gerundio, janela = JANELA) {
  let achados = 0;
  for (let i = 0; i < palavras.length && i < janela; i++) {
    const p = semPontuacao(palavras[i]);
    if (!p) continue;
    let inf = FORMAS.get(p) || FORMAS.get(p.split('-')[0]);
    if (!inf && gerundio) {
      // "vá mexendo", "vá adicionando": o gerúndio é que nomeia
      const g = p.match(/^(.+?)(ando|endo|indo)$/);
      if (g) inf = FORMAS.get(g[1] + (g[2] === 'ando' ? 'ar' : g[2] === 'endo' ? 'er' : 'ir'));
    }
    if (!inf) continue;
    // "Não tampe a panela" não é um passo de tampar, e em "antes de servir,
    // amasse bem" quem manda é o segundo verbo, não o da oração de tempo
    const anterior = i > 0 ? semPontuacao(palavras[i - 1]) : '';
    if (ANTES_QUE_ANULAM.has(anterior)) continue;
    if (achados++ < pulo) continue;
    return { infinitivo: inf, i };
  }
  return null;
}

/** Complemento curto do verbo: o primeiro nome que aparece, com suas ligações. */
function acharComplemento(palavras, desde) {
  const trecho = [];
  for (let i = desde; i < palavras.length && i < desde + 5; i++) {
    const bruto = palavras[i];
    const p = semPontuacao(bruto);
    if (!p || CORTES.has(p)) break;
    const parar = fimDeTrecho(bruto);
    if (LIGACOES.has(p)) trecho.push(paraTela(bruto));
    // descartes: advérbio, número, gerúndio e verbo já conjugado ("ferva, acrescente
    // os queijos" não vira "Ferver acrescente"). Infinitivo fica: "Deixar cozinhar".
    else if (
      VAZIAS.has(p) ||
      /\d/.test(p) ||
      /(ando|endo|indo|mente)$/.test(p) ||
      (FORMAS.has(p) && FORMAS.get(p) !== p)
    ) trecho.push(null);
    else if (p.length < 3) break;
    else {
      trecho.push(paraTela(bruto));
      // do último descarte em diante: "um pouco de farinha" → "de farinha"
      let inicio = 0;
      for (let k = trecho.length - 2; k >= 0; k--) if (trecho[k] === null) { inicio = k + 1; break; }
      let saida = trecho.slice(inicio).filter(Boolean);
      if (inicio > 0) {
        const primeira = semPontuacao(saida[0]);
        // sobrou um nome solto, sem artigo nem preposição: melhor só o verbo
        if (saida.length === 1 || !LIGACOES.has(primeira)) return null;
        if (primeira in REMENDO) saida = [REMENDO[primeira], ...saida.slice(1)].filter(Boolean);
      }
      return saida.join(' ');
    }
    if (parar) break;
  }
  return null;
}

/** Prefixo de seção: "Molho:", "Montagem:", "Caldo de legumes:". */
function prefixoDeSecao(texto) {
  const m = texto.match(/^([^.:;!?]{2,26}):\s/);
  if (!m) return null;
  const prefixo = m[1].trim();
  const palavras = prefixo.split(/\s+/);
  if (palavras.length > 3 || /\d/.test(prefixo)) return null;
  const primeira = semPontuacao(palavras[0]);
  if (PREFIXOS_VAZIOS.has(primeira)) return null;
  // "Monte duas camadas:" não é nome de seção, é o passo já mandando fazer
  if (FORMAS.has(primeira)) return null;
  return prefixo;
}

const comMaiuscula = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Uma âncora nomeada por passo, tirada do próprio texto. Devolve um array do
 * tamanho de `passos`, com o rótulo ou `null` quando a frase não rende nenhum.
 *
 * O desempate tem três degraus, nesta ordem:
 *   1. rótulo ainda não usado nesta receita — repetido não ancora nada;
 *   2. rótulo COM complemento na frente de verbo pelado — "Regar o arroz" diz
 *      onde a pessoa parou, "Medir" não diz;
 *   3. verbo ainda não usado nesta receita — quando duas frases começam com o
 *      mesmo verbo, a segunda procura outro, para a lista não ficar com dois
 *      rótulos quase gêmeos que o olho não separa de longe.
 */
export function rotularPassos(passos) {
  const candidatos = passos.map((bruto) => {
    const texto = String(bruto).replace(/\s+/g, ' ').trim();
    const palavras = texto.split(' ');
    const lista = [];
    for (const gerundio of [false, true]) {
      for (let pulo = 0; pulo < 3; pulo++) {
        const v = acharVerbo(palavras, pulo, gerundio);
        if (!v) break;
        const verbo = comMaiuscula(v.infinitivo);
        const complemento = acharComplemento(palavras, v.i + 1);
        const cheio = complemento ? `${verbo} ${complemento}` : null;
        if (cheio && cheio.length <= LIMITE_ROTULO) {
          lista.push({ texto: cheio, verbo: v.infinitivo, completo: true });
        }
        lista.push({ texto: verbo, verbo: v.infinitivo, completo: false });
      }
      if (lista.length) break;
    }
    // nenhum rótulo com complemento na janela curta: vale procurar mais adiante
    // na frase um verbo que diga o que se faz, em vez de ficar com o verbo pelado
    if (!lista.some((c) => c.completo)) {
      for (let pulo = 0; pulo < 4; pulo++) {
        const v = acharVerbo(palavras, pulo, false, JANELA_LARGA);
        if (!v) break;
        const complemento = acharComplemento(palavras, v.i + 1);
        if (!complemento) continue;
        const cheio = `${comMaiuscula(v.infinitivo)} ${complemento}`;
        if (cheio.length <= LIMITE_ROTULO) {
          lista.push({ texto: cheio, verbo: v.infinitivo, completo: true });
        }
      }
    }
    // "Molho:", "Montagem:", "Caldo de legumes:" nomeiam melhor que o verbo
    const prefixo = prefixoDeSecao(texto);
    if (prefixo) lista.unshift({ texto: prefixo, verbo: null, completo: true });
    return lista;
  });

  const usados = new Set();
  const verbosUsados = new Set();
  return candidatos.map((lista) => {
    const livres = lista.filter((c) => !usados.has(c.texto.toLowerCase()));
    const verboNovo = (c) => !c.verbo || !verbosUsados.has(c.verbo);
    const escolhido =
      livres.find((c) => c.completo && verboNovo(c)) ??
      livres.find((c) => c.completo) ??
      livres.find(verboNovo) ??
      livres[0] ??
      lista[0] ??
      null;
    if (!escolhido) return null;
    usados.add(escolhido.texto.toLowerCase());
    if (escolhido.verbo) verbosUsados.add(escolhido.verbo);
    return escolhido.texto;
  });
}

/**
 * Quando o rótulo é o próprio nome de seção que abre a frase ("Montagem:
 * recheie a moranga..."), o texto não precisa repeti-lo: o rótulo virou o
 * cabeçalho do passo e o corpo começa direto na ação.
 */
export function textoSemPrefixo(texto, rotulo) {
  if (!rotulo) return texto;
  const prefixo = prefixoDeSecao(texto);
  if (!prefixo || prefixo.toLowerCase() !== rotulo.toLowerCase()) return texto;
  const resto = texto.slice(texto.indexOf(':') + 1).trim();
  return resto ? comMaiuscula(resto) : texto;
}

// -------------------------------------------------------------- o registro

/** Passos já marcados nesta receita. Descarta o registro se a receita mudou de tamanho. */
function lerFeitos(id, total) {
  try {
    const bruto = JSON.parse(localStorage.getItem(`${CHAVE}.${id}`) || 'null');
    if (!bruto || bruto.total !== total || !Array.isArray(bruto.feitos)) return new Set();
    return new Set(bruto.feitos.filter((n) => Number.isInteger(n) && n >= 0 && n < total));
  } catch {
    return new Set();
  }
}

function gravarFeitos(id, total, feitos) {
  try {
    if (!feitos.size) localStorage.removeItem(`${CHAVE}.${id}`);
    else localStorage.setItem(`${CHAVE}.${id}`, JSON.stringify({ total, feitos: [...feitos].sort((a, b) => a - b) }));
  } catch {
    // sem localStorage a marcação vale só enquanto a tela estiver aberta
  }
}

/** Quanto falta, sem obrigar ninguém a contar losango. */
function textoDoQueFalta(restam, total) {
  if (!restam) return 'Tudo pronto';
  if (restam === 1) return 'Falta 1 passo';
  if (restam === total) return `${total} passos pela frente`;
  return `Faltam ${restam} passos`;
}

export default function montarPassos(pai, receita, estado) {
  const passos = (receita?.passos ?? []).map((t) => String(t).trim()).filter(Boolean);

  const secao = document.createElement('section');
  secao.className = 'passos';
  secao.setAttribute('aria-labelledby', 'passos-titulo');

  const envelope = document.createElement('div');
  envelope.className = 'envelope';
  secao.append(envelope);

  // divisor ornamentado — separa o preparo dos ingredientes sem sombra e sem caixa
  const divisor = document.createElement('div');
  divisor.className = 'losango passos-divisor';
  divisor.setAttribute('aria-hidden', 'true');
  divisor.append(document.createElement('span'));
  envelope.append(divisor);

  const titulo = document.createElement('h2');
  titulo.id = 'passos-titulo';
  titulo.className = 'passos-titulo';
  titulo.textContent = 'Modo de preparo';
  envelope.append(titulo);

  if (!passos.length) {
    const vazio = document.createElement('p');
    vazio.className = 'passos-sem';
    vazio.textContent = 'Esta receita veio sem o modo de preparo.';
    envelope.append(vazio);
    pai.append(secao);
    return () => secao.remove();
  }

  // leitura de progresso: quanto falta, em palavra, sem numerar passo nenhum
  const falta = document.createElement('p');
  falta.className = 'passos-falta';
  falta.setAttribute('aria-live', 'polite');
  envelope.append(falta);

  const dica = document.createElement('p');
  dica.className = 'passos-dica';
  dica.textContent = 'Toque no passo para marcar o que já ficou pronto.';
  envelope.append(dica);

  const lista = document.createElement('ol');
  lista.className = 'passos-lista';
  envelope.append(lista);

  const rotulos = rotularPassos(passos);

  const itens = passos.map((bruto, i) => {
    const texto = textoSemPrefixo(bruto, rotulos[i]);
    const li = document.createElement('li');
    li.className = 'passo';

    const botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'passo-toque';
    botao.dataset.passo = String(i);
    // a contagem existe só para o leitor de tela, que precisa dela para se
    // situar; na tela, nenhum número aparece
    const nome = rotulos[i] ? `${rotulos[i]}. ` : '';
    botao.setAttribute('aria-label', `${nome}Passo ${i + 1} de ${passos.length}. ${texto}`);

    const marca = document.createElement('span');
    marca.className = 'passo-marca';
    marca.setAttribute('aria-hidden', 'true');
    botao.append(marca);

    if (rotulos[i]) {
      const rotulo = document.createElement('span');
      rotulo.className = 'passo-rotulo';
      // já está no aria-label do botão inteiro; aqui é desenho
      rotulo.setAttribute('aria-hidden', 'true');
      rotulo.textContent = rotulos[i];
      botao.append(rotulo);
    } else {
      li.classList.add('passo-sem-rotulo');
    }

    const corpo = document.createElement('span');
    corpo.className = 'passo-texto';
    corpo.textContent = texto;

    botao.append(corpo);
    li.append(botao);
    lista.append(li);
    return { li, botao };
  });

  const rodape = document.createElement('div');
  rodape.className = 'passos-rodape';
  const recomecar = document.createElement('button');
  recomecar.type = 'button';
  recomecar.className = 'botao botao-vazado passos-recomecar';
  // "tudo" sozinho seria ambíguo: a lista de ingredientes tem o botão dela
  recomecar.textContent = 'Desmarcar os passos';
  rodape.append(recomecar);
  envelope.append(rodape);

  const feitos = lerFeitos(receita.id, passos.length);

  function pintar() {
    // o passo de agora é o primeiro que ainda não foi marcado
    const agora = passos.findIndex((_, i) => !feitos.has(i));
    itens.forEach(({ li, botao }, i) => {
      const feito = feitos.has(i);
      li.classList.toggle('passo-feito', feito);
      li.classList.toggle('passo-agora', i === agora);
      botao.setAttribute('aria-pressed', feito ? 'true' : 'false');
      if (i === agora) botao.setAttribute('aria-current', 'step');
      else botao.removeAttribute('aria-current');
    });
    falta.textContent = textoDoQueFalta(passos.length - feitos.size, passos.length);
    rodape.hidden = feitos.size === 0;
  }

  function aoTocar(evento) {
    const botao = evento.target.closest('.passo-toque');
    if (!botao || !lista.contains(botao)) return;
    const i = Number(botao.dataset.passo);
    if (feitos.has(i)) feitos.delete(i);
    else feitos.add(i);
    gravarFeitos(receita.id, passos.length, feitos);
    pintar();
  }

  function aoRecomecar() {
    feitos.clear();
    gravarFeitos(receita.id, passos.length, feitos);
    pintar();
  }

  lista.addEventListener('click', aoTocar);
  recomecar.addEventListener('click', aoRecomecar);
  pintar();

  pai.append(secao);

  return () => {
    lista.removeEventListener('click', aoTocar);
    recomecar.removeEventListener('click', aoRecomecar);
    secao.remove();
  };
}
