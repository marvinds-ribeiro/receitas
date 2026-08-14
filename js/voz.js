// Ditado da lista de compras para a Alexa.
//
// Cada lote é UMA frase completa com palavra de ativação, falada de uma vez.
// A pausa entre lotes começa a contar no evento `onend` — não no início da fala —
// senão a contagem atropela frases longas.
//
// Os padrões foram calibrados contra o Echo em 14/08/2026 e são inegociáveis:
// voz "Google português do Brasil", velocidade 0,9, pausa de 7 s. Com 0,95 e
// 6 s a Alexa perdia o fim dos lotes longos.

import { frasesParaVoz } from './compras.js';

export const LOTE_MIN = 3;
export const LOTE_MAX = 8;
export const PAUSA_MIN = 3;
export const PAUSA_MAX = 12;
export const LOTE_PADRAO = 5;
export const PAUSA_PADRAO = 7;

export const VOZ_CALIBRADA = 'Google português do Brasil';

const CHAVE_VOZ = 'receitas.ditado.voz';
const CHAVE_PROGRESSO = 'receitas.ditado.progresso';

export const suportado = () => 'speechSynthesis' in window;

// ------------------------------------------------------------------- vozes

const ehPortugues = (voz) => String(voz.lang || '').startsWith('pt');
const ehBrasileira = (voz) => voz.lang === 'pt-BR';

/** As pt-BR primeiro, depois as outras pt, depois o resto — ordem estável. */
export function ordenarVozes(vozes) {
  const grau = (voz) => (ehBrasileira(voz) ? 0 : ehPortugues(voz) ? 1 : 2);
  return [...vozes].sort((a, b) => grau(a) - grau(b));
}

/** A voz calibrada, se instalada; senão a primeira pt-BR; senão a primeira pt. */
export function vozCalibrada(vozes) {
  return (
    vozes.find((voz) => voz.name === VOZ_CALIBRADA) ||
    vozes.find(ehBrasileira) ||
    vozes.find(ehPortugues) ||
    null
  );
}

export function lerVozGuardada() {
  try {
    return localStorage.getItem(CHAVE_VOZ);
  } catch {
    return null;
  }
}

export function guardarVoz(nome) {
  try {
    localStorage.setItem(CHAVE_VOZ, nome);
  } catch {
    // armazenamento bloqueado: a escolha vale só nesta sessão
  }
}

/**
 * Espera as vozes do aparelho e chama `aoResolver(vozes)` UMA vez.
 *
 * getVoices() pode vir vazio nas primeiras chamadas (Chrome real): a lista
 * enche depois, às vezes avisando com `voiceschanged`, às vezes sem aviso
 * nenhum. Por isso escutamos o evento E insistimos com rechecagens. Janela
 * vazia NÃO é aparelho sem voz — só depois do prazo generoso é que se desiste
 * e o `aoResolver` recebe a lista vazia de verdade. Devolve a função que
 * cancela a espera.
 */
export function observarVozes(aoResolver) {
  const INTERVALO_MS = 300;
  const TENTATIVAS = 16; // ≈ 5 s de insistência antes de declarar "sem voz"
  let resolvido = false;
  let tentativas = 0;

  function limpar() {
    clearInterval(relogio);
    speechSynthesis.removeEventListener?.('voiceschanged', tentar);
  }

  function resolver(vozes) {
    if (resolvido) return;
    resolvido = true;
    limpar();
    aoResolver(vozes);
  }

  function tentar() {
    const vozes = speechSynthesis.getVoices();
    if (vozes.length) resolver(vozes);
  }

  speechSynthesis.addEventListener?.('voiceschanged', tentar);
  const relogio = setInterval(() => {
    tentativas += 1;
    tentar();
    if (!resolvido && tentativas >= TENTATIVAS) resolver([]);
  }, INTERVALO_MS);
  tentar();
  return limpar;
}

// ------------------------------------------------------------------ ditado

export function criarDitado() {
  let frases = [];
  let assinatura = '';
  let indice = 0;
  let estado = 'parado'; // parado | falando | esperando | pausado
  let temporizador = null;
  let falaAtual = null;
  let pausaSegundos = PAUSA_PADRAO;
  const ouvintes = new Set();

  const avisar = () =>
    ouvintes.forEach((f) =>
      f({ estado, indice, total: frases.length, frase: frases[indice] ?? null, pausa: pausaSegundos })
    );

  // ------------------------------------------------------ progresso guardado
  // O app pode morrer a qualquer momento — tela desligada, aba descartada —
  // sem nenhum "parar" educado. Por isso o progresso é gravado no fim de CADA
  // lote, e a assinatura das frases invalida o guardado quando a lista ou o
  // tamanho do lote mudam: continuar só vale para o MESMO ditado.

  function lerProgresso() {
    try {
      const cru = JSON.parse(localStorage.getItem(CHAVE_PROGRESSO) || 'null');
      const feitos = Number(cru?.feitos);
      if (cru?.assinatura === assinatura && Number.isInteger(feitos) && feitos > 0 && feitos < frases.length) {
        return feitos;
      }
    } catch {
      // registro ilegível vale o mesmo que registro nenhum
    }
    return 0;
  }

  function guardarProgresso(feitos) {
    try {
      if (feitos > 0) localStorage.setItem(CHAVE_PROGRESSO, JSON.stringify({ assinatura, feitos }));
      else localStorage.removeItem(CHAVE_PROGRESSO);
    } catch {
      // sem armazenamento o ditado ainda funciona, só não sobrevive a reabrir
    }
  }

  /** A voz da vez: a que a pessoa escolheu, se instalada; senão a calibrada. */
  function vozDaFala() {
    const vozes = speechSynthesis.getVoices();
    const guardada = lerVozGuardada();
    return (guardada && vozes.find((voz) => voz.name === guardada)) || vozCalibrada(vozes);
  }

  function limparEspera() {
    clearTimeout(temporizador);
    temporizador = null;
  }

  function falar(i) {
    if (i >= frases.length) {
      estado = 'parado';
      indice = frases.length;
      avisar();
      return;
    }
    indice = i;
    estado = 'falando';
    avisar();

    const fala = new SpeechSynthesisUtterance(frases[i]);
    fala.lang = 'pt-BR';
    const voz = vozDaFala();
    if (voz) fala.voice = voz;
    fala.rate = 0.9;

    // Cada handler pertence À SUA fala: cancel() no Chrome dispara um erro
    // 'interrupted' ASSÍNCRONO na fala cancelada, que chegava depois de a fala
    // nova já estar no ar e zerava o estado dela — Repetir matava o resto do
    // ditado. Fala que não é mais a atual não opina sobre nada.
    fala.onend = () => {
      if (fala !== falaAtual) return;
      falaAtual = null;
      const proximo = i + 1;
      // lote dito por inteiro: é AGORA que o progresso vai para o disco.
      // Ditado completo zera o registro — reabrir recomeça do primeiro.
      guardarProgresso(proximo < frases.length ? proximo : 0);
      if (proximo >= frases.length) {
        estado = 'parado';
        indice = frases.length;
        avisar();
        return;
      }
      // a pausa só começa quando a frase termina de verdade
      estado = 'esperando';
      avisar();
      temporizador = setTimeout(() => {
        temporizador = null;
        if (estado === 'esperando') falar(proximo);
      }, pausaSegundos * 1000);
    };
    fala.onerror = (evento) => {
      if (fala !== falaAtual) return;
      // 'interrupted'/'canceled' são o eco de um cancel nosso, não um defeito
      if (evento?.error === 'interrupted' || evento?.error === 'canceled') return;
      falaAtual = null;
      estado = 'parado';
      avisar();
    };

    falaAtual = fala;
    speechSynthesis.speak(fala);
  }

  /** Corta a fala corrente sem que o eco atrasado do cancel derrube o estado. */
  function calar() {
    limparEspera();
    falaAtual = null;
    if (suportado()) speechSynthesis.cancel();
  }

  return {
    inscrever(fn) {
      ouvintes.add(fn);
      fn({ estado, indice, total: frases.length, frase: frases[indice] ?? null, pausa: pausaSegundos });
      return () => ouvintes.delete(fn);
    },

    preparar(linhas, tamanhoLote = LOTE_PADRAO) {
      this.parar();
      frases = frasesParaVoz(linhas, tamanhoLote);
      assinatura = frases.join('\n');
      // mesma lista, mesmo lote: continua de onde o app morreu; senão, do zero
      indice = lerProgresso();
      avisar();
      return frases;
    },

    definirPausa(segundos) {
      pausaSegundos = Math.min(PAUSA_MAX, Math.max(PAUSA_MIN, segundos));
      avisar();
    },

    // Continua do lote em que está — o restaurado do disco, quando o app
    // reabre no meio de um ditado. Depois de completo, recomeça do primeiro.
    comecar() {
      if (!suportado() || !frases.length) return;
      calar();
      falar(indice >= frases.length ? 0 : indice);
    },

    // o caminho de "não era isso": zera o progresso e dita do primeiro lote
    recomecar() {
      if (!suportado() || !frases.length) return;
      calar();
      guardarProgresso(0);
      falar(0);
    },

    pausar() {
      if (estado === 'parado' || estado === 'pausado') return;
      calar();
      estado = 'pausado';
      avisar();
    },

    retomar() {
      if (estado !== 'pausado') return;
      falar(indice);
    },

    // repetir o lote atual — a Alexa às vezes não escuta de primeira
    repetir() {
      calar();
      falar(indice);
    },

    pular() {
      calar();
      falar(Math.min(indice + 1, frases.length));
    },

    voltar() {
      calar();
      falar(Math.max(indice - 1, 0));
    },

    parar() {
      calar();
      estado = 'parado';
      // parar não joga fora o que já foi conquistado: o índice volta para o
      // último lote gravado, e o botão principal oferece continuar dali
      indice = lerProgresso();
      avisar();
    },

    frases: () => frases.slice(),
  };
}
