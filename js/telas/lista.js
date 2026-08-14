// Tela da lista de compras.
//
// Duas coisas muito diferentes moram nesta rota:
//   1. ESCOLHER — em casa, planejando a semana, com as duas mãos e paciência.
//   2. COMPRAR  — no mercado, com uma mão só, o carrinho na outra e pressa.
//
// A saída foi não misturar. A tela abre sempre em COMPRAR (é o uso que se repete) e
// escolher receitas é uma visão inteira, que toma a tela e some quando termina.
//
// A cena do mercado manda no arranjo de COMPRAR:
//   · os itens vêm na ordem da caminhada pelos corredores (tabela CORREDORES);
//   · a LINHA É UMA LINHA: nome e quantidade, e mais nada. De qual receita o item
//     veio é informação de casa, não de mercado — mora atrás de um toque na
//     quantidade, que é a única parte da linha com fio pontilhado embaixo;
//   · o mesmo item nunca vira duas linhas irmãs: um nome só, e as medidas que não
//     se somam descem num bloco recuado com filete, as duas do mesmo tamanho;
//   · marcar NÃO move nada. O item fica riscado onde está e só é recolhido para
//     "Já no carrinho" quando a rolagem para — nada anda sob o polegar. O risco
//     cai no nome; o número só desbota, porque riscado "1,4 kg" vira "1;4";
//   · a faixa de progresso gruda no topo e vai junto com a rolagem, e é a ÚNICA
//     coisa entre o cabeçalho e o primeiro item: tudo o que só se resolve em casa
//     — mudar porções, ditar, apagar — desceu para o rodapé.
//
// UM ITEM MORA NUM LUGAR SÓ. A gaveta "Já no carrinho" não é um resumo do que
// está marcado: é o depósito do que já saiu das seções. Enquanto o item estiver
// riscado dentro do corredor, ele não está na gaveta e não é contado por ela —
// a gaveta só fala do que tem dentro. Quem conta o que está marcado é a fita do
// topo ("7 de 28 no carrinho"), que é uma frase, não uma segunda lista.
// A contagem ao lado do nome do corredor quer dizer sempre a mesma coisa, nos
// dois estados: quantos ainda FALTAM pegar naquele corredor.
//
// Nenhum número desta tela termina em glifo mudo: o que a conta fez com a
// quantidade ("aproximado", "arredondado") vem escrito embaixo dela, e unidade
// contável sem rótulo próprio é dita por extenso ("4 unidades", nunca "4").
// Emoji não entra aqui — a especificação o exige na RECEITA, e é lá que ele fica;
// no mercado quem faz o agrupamento visual é o corredor.
//
// A agregação não é feita aqui: `agregar()` de ../compras.js soma unidades iguais,
// converte g↔kg e ml↔l e mantém peso e volume em linhas separadas.

import { carregarIndice, carregarReceitas, buscar, porLetra, semAcento } from '../dados.js';
import { agregar } from '../compras.js';

const CHAVE_ESCOLHAS = 'receitas.lista';
const CHAVE_MARCADOS = 'receitas.lista.marcados';

const MIN_PORCOES = 1;
const MAX_PORCOES = 60;

const NOME_CATEGORIA = {
  principal: 'Prato principal',
  acompanhamento: 'Acompanhamento',
  entrada: 'Entrada',
  massa: 'Massa',
  molho: 'Molho',
  sopa: 'Sopa',
  salada: 'Salada',
  lanche: 'Lanche',
  pao: 'Pão',
  doce: 'Doce',
};

// ------------------------------------------------------------- corredores
// A ordem é a caminhada real do mercado, não a ordem alfabética nem a ordem
// em que os dados chegaram: entra-se pelo hortifrúti, atravessa-se o miolo seco
// da loja e o que estraga fica para o fim, encostado no caixa. Levar carne e
// manteiga no começo é arrastar perecível pela loja inteira.

const CORREDORES = [
  ['hortifruti', 'Hortifrúti'],
  ['mercearia', 'Mercearia e secos'],
  ['temperos', 'Temperos'],
  ['bebidas', 'Bebidas'],
  ['outros', 'Outros'],
  ['laticinios', 'Laticínios e frios'],
  ['acougue', 'Açougue e peixaria'],
];

// mapa item→corredor, montado a partir do campo `norm` das linhas agregadas
const CORREDOR_POR_NORM = {};
function porCorredor(corredor, norms) {
  for (const norm of norms.split(' · ')) CORREDOR_POR_NORM[norm] = corredor;
}

porCorredor(
  'hortifruti',
  'abobora · abobrinha · acelga · alecrim · alface · alho · alho-poro · banana · batata · ' +
    'batata doce · berinjela · beterraba · brocolis · cara · cebola · cebola perola · ' +
    'cebola roxa · cebolinha · cenoura · cheiro verde · chuchu · coentro · cogumelo · couve · ' +
    'espinafre · gengibre fresco · hortela · inhame · laranja · legume · limao · maca · ' +
    'mandioca · mandioquina · manga · manjericao · milho · morango · pepino · pera · ' +
    'pimenta dedo de moca · pimenta dedo-de-moca · pimentao · pimentao amarelo · ' +
    'pimentao verde · pimentao vermelho · pinhao · rabanete · repolho · rucula · salsao · ' +
    'salsinha · salvia · tomate · tomilho · vagem'
);

porCorredor(
  'acougue',
  'alcatra · bacalhau · cacao · camarao · carne · carne bovina · carne moida · carne seca · ' +
    'carre de cordeiro · costela · costela suina · coxao mole · file mignon · ' +
    'file mignon suino · frango · linguica · linguica blumenau · linguica calabresa · lombo · ' +
    'lula · matambre · mexilhao · musculo · namorado · ossobuco · patinho · pato · peixe · ' +
    'peru · picanha · polvo · salmao · tilapia'
);

// Fermento fresco é tijolinho refrigerado, fica na geladeira ao lado da manteiga —
// estava em mercearia e mandava voltar a loja inteira. O seco continua na mercearia.
porCorredor(
  'laticinios',
  'bacon · burrata · creme de leite · creme de leite fresco · fermento biologico fresco · ' +
    'fermento fresco · gema de ovo · iogurte · leite · manteiga · manteiga de garrafa · ' +
    'margarina · massa folhada · mussarela de bufala · ovo · pancetta · presunto · ' +
    'presunto de parma · queijo · queijo gorgonzola · queijo gruyere · queijo minas · ' +
    'queijo mussarela · queijo parmesao · queijo ralado · requeijao · ricota · salame · sorvete'
);

porCorredor(
  'mercearia',
  'acucar · acucar mascavo · alcaparra · amido de milho · arroz · arroz arboreo · aveia · ' +
    'azeite · azeite de dende · azeitona preta · azeitona verde · biscoito · cacau em po · ' +
    'caldo de carne · caldo de galinha · caldo de legumes · caldo de peixe · capeletti · ' +
    'chocolate em po · chocolate meio amargo · coco ralado · ervilha · extrato de baunilha · ' +
    'extrato de tomate · farinha de mandioca · farinha de milho · farinha de rosca · ' +
    'farinha de trigo · farinha sem gluten · feijao · fermento · fermento biologico · fuba · ' +
    'gelatina · grao de bico · ketchup · leite condensado · leite de coco · lentilha · ' +
    'macarrao · maisena · massa de lasanha · melaco de cana · mel · molho de alho · ' +
    'molho ingles · molho de tomate · mostarda dijon · nhoque · noz · oleo · oleo de gergelim · ' +
    'pao · pao de forma · pesto · pinoli · pistache · polvilho azedo · quinoa · shoyu · ' +
    'suco de tomate · tahine · tomate pelado · trigo para quibe · uva passa · vinagre · ' +
    'vinagre balsamico · vinagre de maca · vinagre de vinho branco'
);

porCorredor(
  'bebidas',
  'agua com gas · bebida licorosa · cachaca · cafe · cerveja · conhaque · refrigerante · ' +
    'suco · vinho · vinho branco · vinho tinto · whisky'
);

porCorredor(
  'temperos',
  'acafrao · alho em po · anis · canela · cardamomo · colorau · cominho · cravo · curry · ' +
    'erva · erva doce · ervas finas · gengibre · louro · manjerona · noz-moscada · oregano · ' +
    'paprica · paprica doce · paprica picante · pimenta branca · pimenta calabresa · ' +
    'pimenta da jamaica · pimenta de aroeira · pimenta rosa · pimenta siria · pimenta verde · ' +
    'pimenta-do-reino · sal · tempero · tempero pronto · zaatar · zimbro'
);

porCorredor('outros', 'barbante · fosforo · guardanapo · palito · pano perfex · papel aluminio · recheio');

// Rede de segurança para item que ainda não está na tabela: casa pelo pedaço do nome.
// A ordem importa — a primeira regra que casar decide.
const REGRAS_CORREDOR = [
  [/queij|iogurt|requeij|manteig|nata|creme de leite|mussarel|ricota|presunt|bacon|leite$|^leite /, 'laticinios'],
  [/carne|peixe|frango|camar|file |linguic|costel|lombo|bacalha|cordeiro|suin|peru|pato|polvo|lula|marisc|siri|^bife/, 'acougue'],
  [/pimenta|tempero|^erva|curry|paprica|cominho|oregano|canela|cravo|noz-moscada|acafrao|louro|^sal$|colorau/, 'temperos'],
  [/vinho|cerveja|^agua|refrigerante|whisk|licor|cachac|^suco$|^cafe/, 'bebidas'],
  [/farinh|acucar|arroz|feijao|macarr|massa|azeite|oleo|vinagre|molho|caldo|extrato|conserva|azeiton|chocolate|fermento|^pao/, 'mercearia'],
  [/tomate|cebola|alho|batata|cenoura|limao|laranja|^maca|banana|salsa|coentro|abobr|abobora|pimentao|couve|alface|folha/, 'hortifruti'],
];

// Duas coisas muito diferentes dividem o mesmo `item_normalizado`: o tijolinho de
// fermento fresco, que é refrigerado e mora ao lado da manteiga, e o sachê de
// fermento biológico seco, que é de prateleira. Quando isso acontece, quem decide
// o corredor é o nome que a lista mostra, não a chave de agregação.
const REGRAS_NOME = [[/ferment\w*\s+fresc/, 'laticinios']];

function corredorDe(norm, item) {
  const nome = semAcento(String(item || '')).toLowerCase();
  for (const [regra, corredor] of REGRAS_NOME) if (regra.test(nome)) return corredor;
  const chave = String(norm || '').toLowerCase();
  if (CORREDOR_POR_NORM[chave]) return CORREDOR_POR_NORM[chave];
  for (const [regra, corredor] of REGRAS_CORREDOR) if (regra.test(chave)) return corredor;
  return 'outros';
}

// ------------------------------------------------------------------ utilidades

function criar(tag, classe, texto) {
  const el = document.createElement(tag);
  if (classe) el.className = classe;
  if (texto != null) el.textContent = texto;
  return el;
}

const comMaiuscula = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');
const emPorcoes = (n) => `${n} ${n === 1 ? 'porção' : 'porções'}`;
const emReceitas = (n) => `${n} ${n === 1 ? 'receita' : 'receitas'}`;
const emItens = (n) => `${n} ${n === 1 ? 'item' : 'itens'}`;

// Hífen comum é ponto de quebra: "Pimenta-do-reino" virava "Pimenta-do-" numa linha
// e "reino" na outra, que se lê como palavra partida ao meio. O hífen não separável
// (U+2011) mantém o desenho do traço e proíbe a quebra.
const semQuebra = (s) => String(s).replace(/-/g, '‑');

const colador = new Intl.Collator('pt-BR', { sensitivity: 'base' });

/**
 * A quantidade é lida a um braço de distância, encostada no nome do item. Unidade
 * de cozinha por extenso ("2 colheres (sopa)" tem 135px) espremia o nome até ele
 * quebrar em três linhas. Encurtada, sem virar sigla: "2 col. sopa" tem 85px e
 * ainda se lê de longe.
 */
const UNIDADE_CURTA = [
  [/^colher(?:es)? \(sopa\)$/i, 'col. sopa'],
  [/^colher(?:es)? \(chá\)$/i, 'col. chá'],
  [/^colher(?:es)? \(sobremesa\)$/i, 'col. sobremesa'],
  [/^xícaras? \(chá\)$/i, 'xíc. chá'],
  [/^xícaras?$/i, 'xíc.'],
];

/**
 * Separa "2 colheres (sopa)" em número e unidade, já encurtada.
 *
 * Duas coisas que vinham como sinal mudo saem daqui como palavra:
 *  · o til de "~500 g" vira a marca `aproximado`, escrita embaixo do número;
 *  · unidade contável sem rótulo próprio (`unidade` na tabela de unidades vale
 *    string vazia) ganha "unidade"/"unidades" — sem isso a Cebola mostrava só
 *    "1" em cima de "150 g" e o olho parava para conferir se faltava algo.
 */
function partirMedida(texto) {
  const cru = String(texto || '').trim();
  if (!cru) return null;
  const m = cru.match(/^(~?(?:\d+(?:[.,]\d+)?)?(?:\s?(?:[¼½¾]|\d+\/\d+))?)\s*(.*)$/);
  let numero = (m?.[1] || '').trim();
  let unidade = (m?.[2] || '').trim();
  if (!numero) return { numero: '', unidade: cru, semNumero: true, aproximado: false };
  const aproximado = numero.startsWith('~');
  if (aproximado) numero = numero.slice(1).trim();
  for (const [regra, curta] of UNIDADE_CURTA) {
    if (regra.test(unidade)) {
      unidade = curta;
      break;
    }
  }
  if (!unidade) unidade = Number(numero.replace(',', '.')) === 1 ? 'unidade' : 'unidades';
  return { numero, unidade, semNumero: false, aproximado };
}

/** Escolhas guardadas: mapa id → porções. Sobrevive a fechar e reabrir o app. */
function lerEscolhas() {
  try {
    const cru = JSON.parse(localStorage.getItem(CHAVE_ESCOLHAS) || '{}');
    if (!cru || typeof cru !== 'object' || Array.isArray(cru)) return {};
    const limpo = {};
    for (const [id, porcoes] of Object.entries(cru)) {
      const n = Math.round(Number(porcoes));
      if (Number.isFinite(n) && n >= MIN_PORCOES) limpo[id] = Math.min(n, MAX_PORCOES);
    }
    return limpo;
  } catch {
    return {};
  }
}

function lerMarcados() {
  try {
    const cru = JSON.parse(localStorage.getItem(CHAVE_MARCADOS) || '[]');
    return new Set(Array.isArray(cru) ? cru.map(String) : []);
  } catch {
    return new Set();
  }
}

function guardar(chave, valor) {
  try {
    localStorage.setItem(chave, JSON.stringify(valor));
  } catch {
    // cota cheia ou armazenamento bloqueado: a tela continua funcionando na sessão
  }
}

/**
 * Chave estável de uma linha agregada. `norm` não basta: o mesmo item pode ter
 * uma linha de peso e outra de volume. O ordinal separa as duas sem depender do
 * texto da quantidade, que muda quando as porções mudam (500 g vira 1,2 kg).
 */
function chavearLinhas(linhas) {
  const vistos = new Map();
  return linhas.map((linha) => {
    const n = (vistos.get(linha.norm) || 0) + 1;
    vistos.set(linha.norm, n);
    return { ...linha, chave: n === 1 ? linha.norm : `${linha.norm}#${n}` };
  });
}

/**
 * Um item de compra por `norm`. Peso e volume do mesmo item continuam sendo
 * medidas separadas — nada é somado nem convertido —, mas viram duas medidas
 * embaixo de um nome só, e não duas linhas irmãs na lista.
 */
function agruparPorItem(linhas) {
  const mapa = new Map();
  for (const linha of linhas) {
    let grupo = mapa.get(linha.norm);
    if (!grupo) {
      grupo = {
        norm: linha.norm,
        item: linha.item,
        emoji: linha.emoji,
        voz: linha.voz,
        corredor: 'outros',
        medidas: [],
        chaves: [],
        receitas: [],
        aGosto: false,
        arredondado: false,
      };
      mapa.set(linha.norm, grupo);
    }
    // o nome mais curto é o mais genérico — é o que se procura na prateleira
    if (linha.item && linha.item.length < grupo.item.length) grupo.item = linha.item;
    if (!grupo.emoji) grupo.emoji = linha.emoji;
    if (!grupo.voz) grupo.voz = linha.voz;
    grupo.chaves.push(linha.chave);
    if (linha.tambemAGosto) grupo.aGosto = true;
    if (linha.arredondado) grupo.arredondado = true;
    grupo.medidas.push({
      texto: linha.quantidade || '',
      temNumero: Boolean(linha.temNumero),
      arredondado: Boolean(linha.arredondado),
      receitas: linha.receitas || [],
    });
    for (const nome of linha.receitas || []) if (!grupo.receitas.includes(nome)) grupo.receitas.push(nome);
  }
  // o corredor só é decidido depois: o nome do grupo é o mais curto de todos e
  // pode mudar até a última linha lida
  const todos = [...mapa.values()];
  for (const grupo of todos) grupo.corredor = corredorDe(grupo.norm, grupo.item);
  return todos;
}

// ------------------------------------------------------------------ a tela

export default {
  titulo: 'Lista de compras',

  async montar(raiz) {
    const [indice, receitasCompletas] = await Promise.all([carregarIndice(), carregarReceitas()]);

    // o ditado é peça de outro agente e pode ainda não existir no disco
    let montarDitado = null;
    try {
      const modulo = await import('../componentes/ditado.js');
      if (typeof modulo.default === 'function') montarDitado = modulo.default;
    } catch {
      montarDitado = null;
    }
    let limparDitado = null;

    const porId = new Map(indice.map((r) => [r.id, r]));
    let escolhas = lerEscolhas();
    // receita que sumiu do índice não pode segurar a lista
    for (const id of Object.keys(escolhas)) if (!porId.has(id)) delete escolhas[id];
    let marcados = lerMarcados();
    let grupos = [];
    // no mercado o que interessa é o que falta: o que já foi pego começa recolhido
    let feitosAbertos = false;
    let fontesAbertas = false;
    let ditadoAberto = false;
    let normAberto = null;
    let arrumarPendente = false;

    const tela = criar('div', 'lista');
    raiz.append(tela);

    // ================================================================ COMPRAR
    const comprar = criar('section', 'lista-comprar');
    comprar.innerHTML = `
      <header class="lista-faixa">
        <a class="lista-voltar" href="#/">
          <span class="lista-voltar-seta" aria-hidden="true"></span>
          <span>Índice</span>
        </a>
        <h1 class="lista-titulo">Lista de compras</h1>
        <p class="lista-faixa-conta rotulo"></p>
      </header>

      <div class="lista-fita" hidden>
        <div class="lista-fita-linha">
          <p class="rotulo lista-fita-conta" aria-live="polite"></p>
          <button class="lista-fita-atalho" type="button" data-acao="escolher"
                  aria-label="Escolher receitas da lista">
            <span>Receitas</span>
            <span class="lista-fita-seta" aria-hidden="true"></span>
          </button>
        </div>
        <div class="lista-trilho" aria-hidden="true"><span class="lista-trilho-cheio"></span></div>
      </div>

      <div class="lista-corpo"></div>

      <div class="lista-feitos" hidden>
        <button class="lista-dobra lista-feitos-divisor" type="button" data-acao="dobrar"
                aria-expanded="false">
          <span class="rotulo lista-dobra-titulo lista-feitos-titulo"></span>
          <span class="lista-dobra-seta" aria-hidden="true"></span>
        </button>
        <ul class="lista-feitos-itens" hidden></ul>
        <div class="lista-feitos-rodape" hidden>
          <button class="botao botao-vazado lista-feitos-tirar" type="button" data-acao="desmarcar">
            Tirar tudo do carrinho
          </button>
          <p class="lista-nota">Só apaga as marcas: os itens voltam para a lista.</p>
        </div>
      </div>

      <div class="lista-rodape" hidden>
        <div class="losango" aria-hidden="true"><span></span></div>

        <div class="lista-fontes" hidden>
          <button class="lista-dobra lista-fontes-cabeca" type="button" data-acao="dobrar-fontes"
                  aria-expanded="false">
            <span class="rotulo lista-dobra-titulo">Receitas e porções</span>
            <span class="lista-dobra-conta"></span>
            <span class="lista-dobra-seta" aria-hidden="true"></span>
          </button>
          <div class="lista-fontes-corpo" hidden>
            <p class="rotulo lista-fontes-cabecalho">Vou fazer, em porções</p>
            <ul class="lista-fontes-itens"></ul>
            <button class="botao botao-vazado lista-fontes-botao" type="button" data-acao="escolher">
              Escolher receitas
            </button>
          </div>
        </div>

        <button class="botao lista-dobra-larga" type="button" data-acao="dobrar-ditado"
                aria-expanded="false">Ditar a lista para a Alexa</button>
        <div class="lista-ditado" hidden></div>
        <div class="lista-descarte">
          <button class="botao lista-limpar" type="button" data-acao="limpar">
            Apagar a lista inteira
          </button>
          <p class="lista-nota lista-limpar-nota"></p>
        </div>
      </div>`;

    const faixaConta = comprar.querySelector('.lista-faixa-conta');
    const fita = comprar.querySelector('.lista-fita');
    const fitaConta = comprar.querySelector('.lista-fita-conta');
    const trilhoCheio = comprar.querySelector('.lista-trilho-cheio');
    const blocoFontes = comprar.querySelector('.lista-fontes');
    const fontesCabeca = comprar.querySelector('.lista-fontes-cabeca');
    const fontesConta = comprar.querySelector('.lista-fontes-cabeca .lista-dobra-conta');
    const fontesCorpo = comprar.querySelector('.lista-fontes-corpo');
    const fontesItens = comprar.querySelector('.lista-fontes-itens');
    const corpo = comprar.querySelector('.lista-corpo');
    const blocoFeitos = comprar.querySelector('.lista-feitos');
    const divisorFeitos = comprar.querySelector('.lista-feitos-divisor');
    const tituloFeitos = comprar.querySelector('.lista-feitos-titulo');
    const itensFeitos = comprar.querySelector('.lista-feitos-itens');
    const rodapeFeitos = comprar.querySelector('.lista-feitos-rodape');
    const rodape = comprar.querySelector('.lista-rodape');
    const botaoDitado = comprar.querySelector('.lista-dobra-larga');
    const caixaDitado = comprar.querySelector('.lista-ditado');
    const botaoLimpar = comprar.querySelector('.lista-limpar');
    const notaLimpar = comprar.querySelector('.lista-limpar-nota');

    // ================================================================ ESCOLHER
    const escolher = criar('section', 'lista-escolher');
    escolher.hidden = true;
    escolher.innerHTML = `
      <header class="lista-faixa">
        <button class="lista-voltar" type="button" data-acao="pronto">
          <span class="lista-voltar-seta" aria-hidden="true"></span>
          <span>Lista</span>
        </button>
        <h1 class="lista-titulo">Escolher receitas</h1>
        <p class="lista-faixa-conta rotulo">${indice.length} receitas da casa</p>
      </header>

      <div class="lista-cabeca">
        <div class="lista-busca" role="search">
          <input class="lista-campo" type="search" inputmode="search" autocomplete="off"
                 autocapitalize="off" spellcheck="false"
                 aria-label="Buscar receita por nome ou ingrediente"
                 placeholder="Buscar nome ou ingrediente">
        </div>
      </div>

      <div class="lista-escolhas"></div>
      <p class="vazio lista-sem-achado" hidden>Nada com esse nome aqui em casa.</p>

      <div class="lista-barra">
        <div class="lista-gaveta" hidden>
          <div class="lista-gaveta-topo">
            <p class="lista-gaveta-nome">
              <span class="lista-gaveta-receita"></span>
              <span class="rotulo lista-gaveta-rende"></span>
            </p>
            <button class="lista-acao-miuda lista-gaveta-fechar" type="button" data-acao="fechar-gaveta">
              Pronto
            </button>
          </div>
          <div class="lista-porcoes">
            <span class="rotulo lista-porcoes-rotulo">Vou fazer</span>
            <button class="lista-porcoes-passo" type="button" data-acao="menos"
                    aria-label="Menos porções">−</button>
            <output class="lista-porcoes-valor"></output>
            <button class="lista-porcoes-passo" type="button" data-acao="mais"
                    aria-label="Mais porções">+</button>
          </div>
        </div>
        <div class="lista-barra-interna">
          <p class="rotulo lista-barra-conta" aria-live="polite"></p>
          <button class="botao lista-barra-pronto" type="button" data-acao="pronto">Ver a lista</button>
        </div>
      </div>`;

    const campo = escolher.querySelector('.lista-campo');
    const caixaEscolhas = escolher.querySelector('.lista-escolhas');
    const semAchado = escolher.querySelector('.lista-sem-achado');
    const barraConta = escolher.querySelector('.lista-barra-conta');
    const gaveta = escolher.querySelector('.lista-gaveta');
    const gavetaNome = escolher.querySelector('.lista-gaveta-receita');
    const gavetaRende = escolher.querySelector('.lista-gaveta-rende');
    const gavetaValor = escolher.querySelector('.lista-porcoes-valor');

    tela.append(comprar, escolher);

    // ---------------------------------------------- linhas da visão de escolher
    const linhasEscolha = new Map(); // id → { li, botao, chip, chipValor, receita }

    for (const grupo of porLetra(indice)) {
      const secao = criar('section', 'lista-grupo');
      secao.dataset.letra = grupo.letra;

      const cabecalho = criar('h2', 'lista-grupo-letra');
      cabecalho.append(criar('span', 'lista-grupo-glifo', grupo.letra));
      cabecalho.append(criar('span', 'lista-grupo-fio'));
      secao.append(cabecalho);

      const ul = criar('ul', 'lista-grupo-itens');
      for (const receita of grupo.receitas) {
        const li = criar('li', 'lista-escolha');
        li.dataset.id = receita.id;

        const botao = criar('button', 'lista-escolha-alvo');
        botao.type = 'button';
        botao.setAttribute('aria-pressed', 'false');

        const marca = criar('span', 'lista-marca lista-marca-media');
        marca.setAttribute('aria-hidden', 'true');

        const texto = criar('span', 'lista-escolha-texto');
        texto.append(criar('span', 'lista-escolha-nome', receita.nome));
        // o rendimento da receita — o outro número, o que a pessoa pediu, mora no chip
        const meta = criar('span', 'rotulo lista-escolha-meta');
        meta.textContent = [
          NOME_CATEGORIA[receita.categoria] || receita.categoria,
          receita.porcoes ? `rende ${emPorcoes(receita.porcoes)}` : null,
        ]
          .filter(Boolean)
          .join(' · ');
        texto.append(meta);

        botao.append(marca, texto);

        // coluna sempre reservada: aparecer não empurra nada da lista
        const chip = criar('button', 'lista-escolha-chip');
        chip.type = 'button';
        chip.dataset.acao = 'porcoes';
        chip.append(criar('span', 'rotulo lista-escolha-chip-rotulo', 'Vou fazer'));
        const chipValor = criar('span', 'lista-escolha-chip-valor');
        chip.append(chipValor);

        li.append(botao, chip);
        ul.append(li);
        linhasEscolha.set(receita.id, { li, botao, chip, chipValor, receita });
      }
      secao.append(ul);
      caixaEscolhas.append(secao);
    }

    // ------------------------------------------------------------- estado vazio
    function desenharVazio() {
      const vazio = criar('div', 'vazio lista-vazio');
      vazio.append(criar('p', 'vazio-titulo', 'A lista ainda está em branco.'));
      vazio.append(
        criar(
          'p',
          'lista-vazio-texto',
          'Escolha as receitas da semana e a lista se monta sozinha, na ordem do mercado.'
        )
      );
      const botao = criar('button', 'botao lista-vazio-botao', 'Escolher receitas');
      botao.type = 'button';
      botao.dataset.acao = 'escolher';
      vazio.append(botao);

      // o que ficaria de tela morta vira a promessa escrita por extenso
      vazio.append(criar('hr', 'fio-pontilhado'));
      vazio.append(criar('p', 'rotulo lista-vazio-rotulo', 'Como ela se monta'));
      const como = criar('ul', 'lista-vazio-notas');
      for (const nota of [
        'A batata de três receitas vira um item só, somada em quilos.',
        'Peso e volume do mesmo item ficam em medidas separadas — nada é convertido.',
        'Os itens saem na ordem da caminhada: hortifrúti primeiro, açougue por último.',
        'A linha traz nome e quantidade. Toque na quantidade para ver de quais receitas ela veio.',
      ]) {
        como.append(criar('li', 'lista-vazio-nota', nota));
      }
      vazio.append(como);

      corpo.replaceChildren(vazio);
    }

    // ------------------------------------------------------------ montar linhas
    function juntarEntradas() {
      const entradas = [];
      for (const [id, porcoes] of Object.entries(escolhas)) {
        const completa = receitasCompletas[id];
        if (!completa) continue;
        const base = completa.porcoes || porcoes;
        const fator = base ? porcoes / base : 1;
        const receita = { id, nome: completa.nome };
        for (const grupo of completa.grupos || []) {
          for (const item of grupo.itens || []) entradas.push({ receita, item, fator });
        }
      }
      return entradas;
    }

    /**
     * A quantidade: o NÚMERO no começo da coluna, sempre no mesmo x, e a unidade
     * fluindo à direita dele. O número é o único token que interessa no corredor,
     * então é ele que fica no trilho — não a palavra da unidade.
     */
    function criarQuantidade(partes) {
      const caixa = criar('span', 'lista-item-valor');
      if (partes.semNumero) {
        caixa.append(criar('span', 'lista-item-livre', partes.unidade));
        return caixa;
      }
      caixa.append(criar('span', 'lista-item-num', partes.numero));
      if (partes.unidade) caixa.append(criar('span', 'lista-item-un', partes.unidade));
      return caixa;
    }

    /**
     * Uma medida inteira: a quantidade e, dentro da mesma caixa, o que a conta fez
     * com o número — escrito, nunca em símbolo. Era um triângulo mudo no fim da
     * linha, e ninguém no mercado sabia o que ele queria dizer.
     *
     * O aviso entra DENTRO de `.lista-item-valor`, em linha própria acima do fio
     * pontilhado: pendurado embaixo do fio ele transbordava o eixo direito da
     * unidade e ficava solto da coisa que explica.
     *
     * `extras` traz o que é do item e não da medida — hoje só o "também a gosto".
     */
    function criarMedida(medida, extras = []) {
      const bloco = criar('span', 'lista-item-bloco');
      const partes = partirMedida(medida.texto);
      if (!partes) return bloco;
      const caixa = criarQuantidade(partes);
      const avisos = [];
      if (partes.aproximado) avisos.push('aproximado');
      if (medida.arredondado) avisos.push('arredondado');
      if (avisos.length) caixa.append(criar('span', 'lista-item-aviso', avisos.join(' · ')));
      // sem número não há quantidade que possa enganar: o extra não faz sentido.
      // Cada extra em linha própria — juntos por " · " eles estouravam a coluna.
      if (!partes.semNumero) {
        for (const extra of extras) caixa.append(criar('span', 'lista-item-aviso', extra));
      }
      bloco.append(caixa);
      return bloco;
    }

    /** A mesma medida em voz corrida — para o leitor de tela e para o detalhe. */
    function textoDaMedida(medida, comAviso = true) {
      const partes = partirMedida(medida.texto);
      if (!partes) return '';
      if (partes.semNumero) return partes.unidade;
      const corpo = [partes.aproximado ? 'cerca de' : null, partes.numero, partes.unidade]
        .filter(Boolean)
        .join(' ');
      return comAviso && medida.arredondado ? `${corpo}, arredondado` : corpo;
    }

    function textoDaLinha(grupo) {
      // textoDaMedida solto no map receberia o ÍNDICE como `comAviso` — e no
      // item 0 isso vale 0 e engole o ", arredondado" do rótulo acessível
      const medidas = grupo.medidas.map((medida) => textoDaMedida(medida)).filter(Boolean).join(', ');
      const gosto = grupo.aGosto ? ', e a gosto em outras receitas' : '';
      return `${comMaiuscula(grupo.item)}${medidas ? ', ' + medidas : ''}${gosto}`;
    }

    /** O detalhe: tudo o que serve em casa e atrapalha no mercado. */
    function criarDetalhe(grupo) {
      const caixa = criar('div', 'lista-item-detalhe');

      // abrir sem porta de saída obriga a caçar de novo a quantidade lá em cima:
      // o fechar mora aqui, escrito, do tamanho do dedo
      const topo = criar('div', 'lista-item-detalhe-topo');
      topo.append(criar('p', 'rotulo lista-item-detalhe-rotulo', 'Vem de'));
      const fechar = criar('button', 'lista-acao-miuda lista-item-fechar', 'Fechar');
      fechar.type = 'button';
      fechar.dataset.detalhe = grupo.norm;
      fechar.setAttribute('aria-label', `Fechar de onde vem ${grupo.item}`);
      topo.append(fechar);
      caixa.append(topo);

      const fontes = criar('ul', 'lista-item-fontes');
      if (grupo.medidas.length > 1) {
        // cada medida com a sua origem — é aqui que a atribuição por medida cabe
        for (const medida of grupo.medidas) {
          const li = criar('li', 'lista-item-fonte');
          li.append(criar('span', 'lista-item-fonte-nome', medida.receitas.join(' · ')));
          li.append(criar('span', 'lista-item-fonte-medida', textoDaMedida(medida, false)));
          fontes.append(li);
        }
      } else {
        for (const nome of grupo.receitas) {
          fontes.append(criar('li', 'lista-item-fonte lista-item-fonte-simples', nome));
        }
      }
      caixa.append(fontes);

      const notas = [];
      if (grupo.aGosto) notas.push('Outras receitas pedem este item a gosto, sem medida.');
      if (grupo.arredondado) notas.push('A conta deu fração e subiu para a peça inteira — não se compra meia.');
      for (const nota of notas) caixa.append(criar('p', 'lista-item-nota', nota));
      return caixa;
    }

    function criarLinhaItem(grupo, marcado) {
      const li = criar('li', 'lista-item');
      li.dataset.norm = grupo.norm;
      if (marcado) li.classList.add('lista-item-marcado');
      const aberto = normAberto === grupo.norm;
      if (aberto) li.classList.add('lista-item-aberto');

      // ------- o alvo grande: marca e nome. Toque aqui põe no carrinho.
      // Sem coluna de emoji: o espaço volta para o nome, que é o que se lê na
      // prateleira, e o agrupamento por corredor já dá a leitura visual.
      const botao = criar('button', 'lista-item-alvo');
      botao.type = 'button';
      botao.dataset.norm = grupo.norm;
      botao.setAttribute('aria-pressed', marcado ? 'true' : 'false');
      botao.setAttribute('aria-label', textoDaLinha(grupo));

      const marca = criar('span', 'lista-marca');
      marca.setAttribute('aria-hidden', 'true');

      const nome = criar('span', 'lista-item-nome', semQuebra(comMaiuscula(grupo.item)));
      botao.append(marca, nome);
      li.append(botao);

      // ------- a quantidade: também é a porta do detalhe (fio pontilhado embaixo)
      const rotuloDetalhe = `${aberto ? 'Esconder' : 'Ver'} de quais receitas vem ${grupo.item}`;

      // A agregação funde a linha "a gosto" na linha com número quando o mesmo item
      // aparece das duas formas — o sal deixou de ocupar três linhas. Sem dizer
      // nada, a quantidade passaria por completa. Fica escrito embaixo do número,
      // no mesmo lugar de "arredondado", e discreto como ele.
      const extras = grupo.aGosto ? ['e a gosto'] : [];
      const ultima = grupo.medidas.length - 1;

      if (grupo.medidas.length === 1) {
        const medida = criar('button', 'lista-item-medida');
        medida.type = 'button';
        medida.dataset.detalhe = grupo.norm;
        medida.setAttribute('aria-expanded', aberto ? 'true' : 'false');
        medida.setAttribute('aria-label', rotuloDetalhe);
        medida.append(criarMedida(grupo.medidas[0], extras));
        li.append(medida);
      } else {
        // Mesmo item, medidas que não se somam: um nome só e as medidas empilhadas
        // num bloco com filete, NA COLUNA DOS NÚMEROS — as duas do mesmo tamanho e
        // do mesmo peso. Recuadas sob o nome, elas eram os dois únicos números da
        // tela fora do eixo em que todos os outros começam.
        const pilha = criar('button', 'lista-item-pilha');
        pilha.type = 'button';
        pilha.dataset.detalhe = grupo.norm;
        pilha.setAttribute('aria-expanded', aberto ? 'true' : 'false');
        pilha.setAttribute('aria-label', rotuloDetalhe);
        grupo.medidas.forEach((medida, i) =>
          pilha.append(criarMedida(medida, i === ultima ? extras : []))
        );
        li.append(pilha);
      }

      if (aberto) li.append(criarDetalhe(grupo));
      return li;
    }

    const estaMarcado = (grupo) => grupo.chaves.every((c) => marcados.has(c));
    const porNome = (a, b) => colador.compare(a.item, b.item);

    // quantos itens estão DENTRO da gaveta agora. A gaveta só fala do que guarda:
    // item riscado que ainda não desceu continua sendo assunto do corredor.
    let naGaveta = 0;

    function pintarProgresso() {
      const total = grupos.length;
      const feitos = grupos.filter(estaMarcado).length;
      fita.hidden = total === 0;
      fitaConta.textContent = total ? `${feitos} de ${total} no carrinho` : '';
      trilhoCheio.style.width = total ? `${Math.round((feitos / total) * 100)}%` : '0%';
      blocoFeitos.hidden = naGaveta === 0;
      tituloFeitos.textContent = `Já no carrinho (${naGaveta})`;
    }

    /**
     * A contagem do corredor quer dizer sempre a mesma coisa: quantos ainda faltam
     * pegar ali. Marcar sem sair do lugar muda o número na hora — o que não pode é
     * a mesma marca dizer "8" numa tela e "3" na outra.
     */
    function pintarContagens() {
      for (const secao of corpo.querySelectorAll('.lista-corredor')) {
        const id = secao.dataset.corredor;
        const faltam = grupos.filter((g) => g.corredor === id && !estaMarcado(g)).length;
        const alvo = secao.querySelector('.lista-corredor-conta');
        if (alvo) alvo.textContent = !faltam ? 'tudo pego' : faltam === 1 ? 'falta 1' : `faltam ${faltam}`;
      }
    }

    /** Redesenha as duas listas: o que falta, por corredor, e o que já está no carrinho. */
    function desenharItens() {
      arrumarPendente = false;
      const pendentes = grupos.filter((g) => !estaMarcado(g));
      const feitos = grupos.filter(estaMarcado).sort(porNome);

      const secoes = [];
      for (const [id, nome] of CORREDORES) {
        const doCorredor = pendentes.filter((g) => g.corredor === id).sort(porNome);
        if (!doCorredor.length) continue;
        const secao = criar('section', 'lista-corredor');
        secao.dataset.corredor = id;
        const cabeca = criar('h2', 'lista-corredor-cabeca');
        cabeca.append(criar('span', 'rotulo lista-corredor-nome', nome));
        cabeca.append(criar('span', 'rotulo lista-corredor-conta'));
        const ul = criar('ul', 'lista-corredor-itens');
        ul.append(...doCorredor.map((g) => criarLinhaItem(g, false)));
        secao.append(cabeca, ul);
        secoes.push(secao);
      }

      if (!secoes.length && grupos.length) {
        const tudo = criar('p', 'lista-tudo-pronto');
        tudo.textContent = 'Tudo no carrinho. Pode ir para o caixa.';
        secoes.push(tudo);
      }
      corpo.replaceChildren(...secoes);

      divisorFeitos.setAttribute('aria-expanded', feitosAbertos ? 'true' : 'false');
      itensFeitos.hidden = !feitosAbertos;
      rodapeFeitos.hidden = !feitosAbertos;
      itensFeitos.replaceChildren(...feitos.map((g) => criarLinhaItem(g, true)));
      naGaveta = feitos.length;
      pintarContagens();
      pintarProgresso();
    }

    // --------------------------------------------------------------- arrumar
    // Marcar não pode mover nada: o item continua no corredor, riscado, e só é
    // recolhido para "Já no carrinho" quando a rolagem para — e mesmo aí a rolagem
    // é compensada, para que o que estava sob o polegar continue sob o polegar.
    function acharAncora() {
      const limite = 64;
      for (const li of corpo.querySelectorAll('.lista-item:not(.lista-item-marcado)')) {
        const caixa = li.getBoundingClientRect();
        if (caixa.bottom > limite) return { norm: li.dataset.norm, topo: caixa.top };
      }
      return null;
    }

    function arrumar() {
      // arrumar com a visão escondida mediria caixas de altura zero e mexeria na
      // rolagem da outra visão
      if (!arrumarPendente || comprar.hidden) return;
      const ancora = acharAncora();
      desenharItens();
      if (!ancora) return;
      const novo = corpo.querySelector(`.lista-item[data-norm="${CSS.escape(ancora.norm)}"]`);
      if (novo) window.scrollBy(0, Math.round(novo.getBoundingClientRect().top - ancora.topo));
    }

    let relogioRolagem = null;
    function aoRolar() {
      if (!arrumarPendente) return;
      clearTimeout(relogioRolagem);
      relogioRolagem = setTimeout(arrumar, 350);
    }
    window.addEventListener('scroll', aoRolar, { passive: true });

    /** Põe/tira do carrinho sem mover a linha de lugar. */
    function alternarItem(norm) {
      const grupo = grupos.find((g) => g.norm === norm);
      if (!grupo) return;
      const marcado = !estaMarcado(grupo);
      for (const c of grupo.chaves) {
        if (marcado) marcados.add(c);
        else marcados.delete(c);
      }
      guardar(CHAVE_MARCADOS, [...marcados]);
      for (const li of comprar.querySelectorAll(`.lista-item[data-norm="${CSS.escape(norm)}"]`)) {
        li.classList.toggle('lista-item-marcado', marcado);
        li.querySelector('.lista-item-alvo')?.setAttribute('aria-pressed', marcado ? 'true' : 'false');
      }
      pintarContagens();
      pintarProgresso();
      arrumarPendente = true;
    }

    function alternarDetalhe(norm) {
      normAberto = normAberto === norm ? null : norm;
      // redesenhar aqui é seguro: quem toca na quantidade está parado, lendo
      desenharItens();
    }

    // ------------------------------------------------------ receitas e porções
    function desenharFontes() {
      const nomes = Object.keys(escolhas)
        .map((id) => porId.get(id))
        .filter(Boolean)
        .sort((a, b) => colador.compare(a.nome, b.nome));

      // número sozinho ao lado de um título não diz de quê: a palavra vem junto
      fontesConta.textContent = emReceitas(nomes.length);
      fontesCabeca.setAttribute('aria-expanded', fontesAbertas ? 'true' : 'false');
      fontesCorpo.hidden = !fontesAbertas;

      fontesItens.replaceChildren(
        ...nomes.map((receita) => {
          const li = criar('li', 'lista-fonte');
          li.append(criar('span', 'lista-fonte-nome', receita.nome));
          const passos = criar('span', 'lista-fonte-passos');
          const menos = criar('button', 'lista-fonte-passo', '−');
          menos.type = 'button';
          menos.dataset.acao = 'porcoes-menos';
          menos.dataset.id = receita.id;
          menos.setAttribute('aria-label', `Menos porções de ${receita.nome}`);
          const valor = criar('output', 'lista-fonte-valor', String(escolhas[receita.id]));
          const mais = criar('button', 'lista-fonte-passo', '+');
          mais.type = 'button';
          mais.dataset.acao = 'porcoes-mais';
          mais.dataset.id = receita.id;
          mais.setAttribute('aria-label', `Mais porções de ${receita.nome}`);
          passos.append(menos, valor, mais);
          li.append(passos);
          return li;
        })
      );
    }

    function mudarPorcoes(id, passo) {
      const atual = escolhas[id];
      if (atual == null) return;
      const proximo = atual + passo;
      if (proximo < MIN_PORCOES || proximo > MAX_PORCOES) return;
      escolhas[id] = proximo;
      pintarEscolha(id);
      salvarEscolhas();
      pintarGaveta();
    }

    // ---------------------------------------------------------------- ditado
    function desenharDitado() {
      botaoDitado.setAttribute('aria-expanded', ditadoAberto ? 'true' : 'false');
      botaoDitado.textContent = ditadoAberto ? 'Fechar o ditado' : 'Ditar a lista para a Alexa';
      caixaDitado.hidden = !ditadoAberto;
      limparDitado?.();
      limparDitado = null;
      caixaDitado.replaceChildren();
      if (!ditadoAberto || !montarDitado || !grupos.length) return;
      try {
        // uma voz por item, não por medida: o ditado fala o mesmo que a tela mostra
        limparDitado = montarDitado(caixaDitado, grupos.map(linhaDoGrupo)) || null;
      } catch (erro) {
        console.error('ditado não montou:', erro);
        caixaDitado.replaceChildren();
      }
    }

    function desenharComprar() {
      const ids = Object.keys(escolhas);

      if (!ids.length) {
        grupos = [];
        normAberto = null;
        faixaConta.textContent = 'Nenhuma receita escolhida';
        // sem receita não há o que resumir: o estado vazio carrega o único caminho
        blocoFontes.hidden = true;
        fita.hidden = true;
        naGaveta = 0;
        blocoFeitos.hidden = true;
        rodape.hidden = true;
        ditadoAberto = false;
        limparDitado?.();
        limparDitado = null;
        caixaDitado.replaceChildren();
        desenharVazio();
        return;
      }

      const linhas = chavearLinhas(agregar(juntarEntradas()));
      grupos = agruparPorItem(linhas);
      if (normAberto && !grupos.some((g) => g.norm === normAberto)) normAberto = null;

      // marcas de itens que não existem mais não devem viver para sempre
      const validas = new Set(linhas.map((l) => l.chave));
      const podadas = new Set([...marcados].filter((c) => validas.has(c)));
      if (podadas.size !== marcados.size) {
        marcados = podadas;
        guardar(CHAVE_MARCADOS, [...marcados]);
      }

      faixaConta.textContent = `${emReceitas(ids.length)} · ${emItens(grupos.length)}`;
      blocoFontes.hidden = false;
      desenharFontes();
      notaLimpar.textContent =
        `Joga fora ${emReceitas(ids.length)} e ${emItens(grupos.length)}. A lista fica em branco.`;

      desenharItens();

      rodape.hidden = false;
      desenharDitado();
    }

    /** Uma linha por item para o ditado, com o mesmo formato que `agregar()` devolve. */
    function linhaDoGrupo(grupo) {
      const primeira = grupo.medidas[0] || {};
      return {
        norm: grupo.norm,
        item: grupo.item,
        emoji: grupo.emoji,
        voz: grupo.voz || grupo.item,
        quantidade: primeira.texto || '',
        temNumero: Boolean(primeira.temNumero),
        tambemAGosto: grupo.aGosto,
        receitas: grupo.receitas,
      };
    }

    // ------------------------------------------------------- pintar as escolhas
    function pintarEscolha(id) {
      const alvo = linhasEscolha.get(id);
      if (!alvo) return;
      const porcoes = escolhas[id];
      const escolhida = porcoes != null;
      alvo.li.classList.toggle('lista-escolha-ativa', escolhida);
      alvo.botao.setAttribute('aria-pressed', escolhida ? 'true' : 'false');
      alvo.chip.hidden = !escolhida;
      if (escolhida) {
        alvo.chipValor.textContent = String(porcoes);
        alvo.chip.setAttribute(
          'aria-label',
          `Mudar quanto vou fazer de ${alvo.receita.nome}: ${emPorcoes(porcoes)}`
        );
      }
    }

    function pintarBarra() {
      const n = Object.keys(escolhas).length;
      barraConta.textContent = n ? `${emReceitas(n)} na lista` : 'Nenhuma receita ainda';
    }

    function salvarEscolhas() {
      guardar(CHAVE_ESCOLHAS, escolhas);
      pintarBarra();
      desenharComprar();
    }

    // ------------------------------------------------------------- gaveta
    // O controle de porções mora numa gaveta fixa, à altura do polegar: abrir não
    // empurra a lista nem faz perder o lugar de quem estava rolando.
    let idNaGaveta = null;

    function pintarGaveta() {
      const alvo = idNaGaveta != null ? linhasEscolha.get(idNaGaveta) : null;
      const aberta = Boolean(alvo) && escolhas[idNaGaveta] != null;
      if (!aberta) idNaGaveta = null;
      gaveta.hidden = !aberta;
      escolher.classList.toggle('lista-escolher-com-gaveta', aberta);
      for (const [id, linha] of linhasEscolha) linha.li.classList.toggle('lista-escolha-foco', aberta && id === idNaGaveta);
      if (!aberta) return;
      gavetaNome.textContent = alvo.receita.nome;
      gavetaRende.textContent = alvo.receita.porcoes
        ? `· rende ${emPorcoes(alvo.receita.porcoes)}`
        : '· rendimento não anotado';
      gavetaValor.textContent = emPorcoes(escolhas[idNaGaveta]);
    }

    // ---------------------------------------------------------------- ouvintes
    comprar.addEventListener('click', (evento) => {
      const detalhe = evento.target.closest('[data-detalhe]');
      if (detalhe) {
        alternarDetalhe(detalhe.dataset.detalhe);
        return;
      }

      const item = evento.target.closest('.lista-item-alvo');
      if (item) {
        alternarItem(item.dataset.norm);
        return;
      }

      const gatilho = evento.target.closest('[data-acao]');
      const acao = gatilho?.dataset.acao;
      if (acao === 'escolher') abrirEscolher();
      if (acao === 'dobrar-fontes') {
        fontesAbertas = !fontesAbertas;
        desenharFontes();
      }
      if (acao === 'porcoes-mais') mudarPorcoes(gatilho.dataset.id, +1);
      if (acao === 'porcoes-menos') mudarPorcoes(gatilho.dataset.id, -1);
      if (acao === 'dobrar') {
        // abrir a gaveta é o momento de arrumar: quem abre já parou de rolar
        arrumarPendente = true;
        feitosAbertos = !feitosAbertos;
        desenharItens();
      }
      if (acao === 'desmarcar') {
        marcados = new Set();
        guardar(CHAVE_MARCADOS, []);
        feitosAbertos = false;
        desenharItens();
      }
      if (acao === 'dobrar-ditado') {
        ditadoAberto = !ditadoAberto;
        desenharDitado();
      }
      if (acao === 'limpar') pedirLimpeza();
    });

    caixaEscolhas.addEventListener('click', (evento) => {
      const li = evento.target.closest('.lista-escolha');
      if (!li) return;
      const id = li.dataset.id;

      if (evento.target.closest('[data-acao=porcoes]')) {
        idNaGaveta = id;
        pintarGaveta();
        return;
      }

      if (evento.target.closest('.lista-escolha-alvo')) {
        if (escolhas[id] != null) {
          delete escolhas[id];
          if (idNaGaveta === id) idNaGaveta = null;
        } else {
          escolhas[id] = linhasEscolha.get(id)?.receita.porcoes || 4;
          idNaGaveta = id;
        }
        pintarEscolha(id);
        salvarEscolhas();
        pintarGaveta();
      }
    });

    escolher.addEventListener('click', (evento) => {
      const acao = evento.target.closest('[data-acao]')?.dataset.acao;
      if (acao === 'pronto') fecharEscolher();
      if (acao === 'fechar-gaveta') {
        idNaGaveta = null;
        pintarGaveta();
      }
      if (acao === 'mais' || acao === 'menos') {
        if (idNaGaveta == null) return;
        mudarPorcoes(idNaGaveta, acao === 'mais' ? +1 : -1);
      }
    });

    campo.addEventListener('input', () => {
      const termo = campo.value.trim();
      const achados = termo ? new Set(buscar(indice, termo).map((r) => r.id)) : null;
      let algum = false;
      for (const [id, alvo] of linhasEscolha) {
        const visivel = !achados || achados.has(id);
        alvo.li.hidden = !visivel;
        if (visivel) algum = true;
      }
      for (const secao of caixaEscolhas.querySelectorAll('.lista-grupo')) {
        secao.hidden = ![...secao.querySelectorAll('.lista-escolha')].some((li) => !li.hidden);
      }
      semAchado.hidden = algum;
    });

    // ------------------------------------------------------- trocar de visão
    let rolagemComprar = 0;

    function abrirEscolher() {
      arrumar();
      rolagemComprar = window.scrollY;
      comprar.hidden = true;
      escolher.hidden = false;
      window.scrollTo(0, 0);
    }

    function fecharEscolher() {
      escolher.hidden = true;
      comprar.hidden = false;
      window.scrollTo(0, rolagemComprar);
    }

    // ------------------------------------------------------- limpar com rede
    // Mão suja erra o alvo. Apagar pede dois toques, e o segundo expira sozinho.
    // Este botão é o único bordô da tela: a cor mais rara da casa marca a única
    // ação que joga fora trabalho e não tem volta.
    let confirmando = null;
    function pedirLimpeza() {
      if (!confirmando) {
        botaoLimpar.textContent = 'Tocar de novo para apagar tudo';
        botaoLimpar.classList.add('lista-limpar-armado');
        confirmando = setTimeout(desarmarLimpeza, 4000);
        return;
      }
      desarmarLimpeza();
      escolhas = {};
      marcados = new Set();
      idNaGaveta = null;
      normAberto = null;
      guardar(CHAVE_ESCOLHAS, {});
      guardar(CHAVE_MARCADOS, []);
      for (const id of linhasEscolha.keys()) pintarEscolha(id);
      pintarBarra();
      pintarGaveta();
      desenharComprar();
      window.scrollTo(0, 0);
    }

    function desarmarLimpeza() {
      clearTimeout(confirmando);
      confirmando = null;
      botaoLimpar.textContent = 'Apagar a lista inteira';
      botaoLimpar.classList.remove('lista-limpar-armado');
    }

    // -------------------------------------------------------------- arranque
    for (const id of linhasEscolha.keys()) pintarEscolha(id);
    pintarBarra();
    pintarGaveta();
    desenharComprar();

    return () => {
      clearTimeout(confirmando);
      clearTimeout(relogioRolagem);
      window.removeEventListener('scroll', aoRolar);
      try {
        limparDitado?.();
      } catch {}
      limparDitado = null;
    };
  },
};
