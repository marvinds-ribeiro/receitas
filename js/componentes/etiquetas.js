// O controle de etiquetas na tela da receita.
//
// Mora no pé da receita, depois dos passos: quem está cozinhando não etiqueta, e quem
// etiqueta já leu o prato inteiro. Quatro caixas independentes, alvo de 48px, e o
// estado da nuvem escrito quando não dá para editar — nunca uma caixa morta sem motivo.
import { ETIQUETAS, alternar, aoMudar, etiquetasDe } from '../etiquetas.js';
import { RECADOS, aoMudarNuvem, estadoDaNuvem, podeEditar } from '../nuvem.js';

export default function montarEtiquetas(raiz, receita) {
  const secao = document.createElement('section');
  secao.className = 'etiquetas';

  const titulo = document.createElement('h2');
  titulo.className = 'rotulo etiquetas-titulo';
  titulo.textContent = 'Etiquetas da casa';

  const grade = document.createElement('div');
  grade.className = 'etiquetas-grade';

  const aviso = document.createElement('p');
  aviso.className = 'etiquetas-aviso';

  secao.append(titulo, grade, aviso);
  raiz.append(secao);

  let recado = null;

  function desenhar() {
    const marcadas = etiquetasDe(receita);
    const podeMexer = podeEditar();

    grade.replaceChildren(
      ...ETIQUETAS.map(({ id, nome }) => {
        const marcada = marcadas.includes(id);
        const caixa = document.createElement('button');
        caixa.type = 'button';
        caixa.className = 'etiqueta-caixa';
        caixa.dataset.etiqueta = id;
        caixa.disabled = !podeMexer;
        caixa.setAttribute('aria-pressed', marcada ? 'true' : 'false');

        const marca = document.createElement('span');
        marca.className = 'etiqueta-marca';
        marca.setAttribute('aria-hidden', 'true');

        const texto = document.createElement('span');
        texto.className = 'etiqueta-nome';
        texto.textContent = nome;

        caixa.append(marca, texto);
        return caixa;
      })
    );

    const estado = estadoDaNuvem();
    const dizer = recado ?? (podeMexer ? null : RECADOS[estado]);
    aviso.textContent = dizer ?? '';
    aviso.hidden = !dizer;
  }

  grade.addEventListener('click', async (evento) => {
    const caixa = evento.target.closest('.etiqueta-caixa');
    if (!caixa || caixa.disabled) return;
    recado = null;
    try {
      await alternar(receita, caixa.dataset.etiqueta);
    } catch (erro) {
      // a nuvem recusou no meio do caminho: a marca não pode ficar mentindo na tela
      recado = erro?.message ?? 'Não consegui gravar a etiqueta agora.';
    }
    desenhar();
  });

  const pararEtiquetas = aoMudar(desenhar);
  const pararNuvem = aoMudarNuvem(desenhar);

  return () => {
    pararEtiquetas();
    pararNuvem();
  };
}
