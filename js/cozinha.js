// Modo cozinha: mantém a tela acesa enquanto a receita está aberta.
// O Wake Lock cai sozinho quando o app perde o foco — precisa ser retomado.

let trava = null;
let ligado = false;
const ouvintes = new Set();

export const suportado = () => 'wakeLock' in navigator;
export const estaLigado = () => ligado;

/** Avisa a interface quando o estado muda (inclusive quando o sistema derruba a trava). */
export function aoMudar(fn) {
  ouvintes.add(fn);
  return () => ouvintes.delete(fn);
}
const avisar = () => ouvintes.forEach((f) => f(ligado));

async function pedirTrava() {
  if (!suportado()) return false;
  try {
    trava = await navigator.wakeLock.request('screen');
    trava.addEventListener('release', () => {
      trava = null;
      // se ainda queremos ficar ligados, foi o sistema que soltou
      if (ligado) avisar();
    });
    return true;
  } catch {
    trava = null;
    return false;
  }
}

export async function ligar() {
  ligado = true;
  const deu = await pedirTrava();
  if (!deu) ligado = false;
  avisar();
  return ligado;
}

export async function desligar() {
  ligado = false;
  try {
    await trava?.release();
  } catch {}
  trava = null;
  avisar();
}

export const alternar = () => (ligado ? desligar() : ligar());

// voltar para o app depois de trocar de janela precisa reconquistar a trava
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible' && ligado && !trava) {
    const deu = await pedirTrava();
    if (!deu) ligado = false;
    avisar();
  }
});
