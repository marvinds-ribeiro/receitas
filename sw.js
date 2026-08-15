// Service worker: cache-first para a casca, network-first para dados/.
//
// A lista da casca é GERADA por ferramentas/gerar-sw.mjs varrendo a pasta app/.
// Não edite à mão: uma peça nova entra sozinha na próxima geração. Foi assim que
// sete folhas de estilo e as duas fontes ficaram de fora e o app quebrou sem rede.

const VERSAO = 'receitas-v2';
const CASCA = 'casca-' + VERSAO;
const DADOS = 'dados-' + VERSAO;

// Os dois arquivos cifrados entram no cache já na instalação. Sem isso, o índice é
// pedido antes de o service worker assumir a página, escapa do intercept na primeira
// abertura e o app fica inutilizável offline — que é justamente o que a especificação
// promete que não acontece.
//
// Os caminhos são relativos ao PRÓPRIO sw.js, sem `../`. Com `../` funcionava na raiz
// (não dá para subir acima da origem) mas apontava para fora quando o app é servido numa
// subpasta — `https://…/receitas/sw.js` pediria `https://…/dados/` e caía em 404, deixando
// o app sem dados offline justamente na publicação.
const ARQUIVOS_DE_DADOS = ['dados/indice.enc.json', 'dados/receitas.enc.json'];

// quanto a rede tem para responder antes de a cópia local assumir
const PRAZO_DA_REDE = 2000;

// <<<CASCA>>>
const ARQUIVOS_DA_CASCA = [
  './',
  './estilo/base.css',
  './estilo/componentes.css',
  './estilo/ditado.css',
  './estilo/entrada.css',
  './estilo/indice.css',
  './estilo/ingredientes.css',
  './estilo/lista.css',
  './estilo/passos.css',
  './estilo/receita.css',
  './estilo/semana.css',
  './fontes/Fraunces.woff2',
  './fontes/Lora.woff2',
  './icone-192.png',
  './icone-512.png',
  './icone-mascara.png',
  './index.html',
  './js/cardapio.js',
  './js/componentes/cabecalho.js',
  './js/componentes/ditado.js',
  './js/componentes/etiquetas.js',
  './js/componentes/ingredientes.js',
  './js/componentes/passos.js',
  './js/compras.js',
  './js/cozinha.js',
  './js/dados.js',
  './js/etiquetas.js',
  './js/firebase/firebase-app.js',
  './js/firebase/firebase-auth.js',
  './js/firebase/firebase-firestore.js',
  './js/lista-guardada.js',
  './js/nuvem-config.js',
  './js/nuvem.js',
  './js/principal.js',
  './js/telas/entrada.js',
  './js/telas/indice.js',
  './js/telas/lista.js',
  './js/telas/receita.js',
  './js/telas/semana.js',
  './js/unidades.js',
  './js/voz.js',
  './manifest.webmanifest',
  './teste-voz.html',
];
// <<</CASCA>>>

self.addEventListener('install', (evento) => {
  evento.waitUntil(
    (async () => {
      const casca = await caches.open(CASCA);
      // um arquivo que falhe não pode derrubar a instalação inteira
      const casca_r = await Promise.allSettled(ARQUIVOS_DA_CASCA.map((a) => casca.add(a)));
      const dados = await caches.open(DADOS);
      const dados_r = await Promise.allSettled(ARQUIVOS_DE_DADOS.map((a) => dados.add(a)));
      const falhas = [...casca_r, ...dados_r].filter((r) => r.status === 'rejected').length;
      if (falhas) console.warn(`[sw] ${falhas} arquivo(s) não entraram no cache`);
      self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (evento) => {
  evento.waitUntil(
    (async () => {
      const nomes = await caches.keys();
      await Promise.all(nomes.filter((n) => n !== CASCA && n !== DADOS).map((n) => caches.delete(n)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (evento) => {
  const req = evento.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // dados/: network-first COM PRAZO.
  //
  // "Network-first" ingênuo é esperar a rede morrer sozinha. Numa rede ruim — que é a
  // regra numa cozinha — isso pendurou por 6 segundos com a tela em branco, mesmo com a
  // cópia local pronta no cache. Se já existe cópia local, a rede tem PRAZO_DA_REDE para
  // responder; passou disso, serve o cache e deixa a atualização terminar por trás.
  if (url.pathname.includes('/dados/')) {
    evento.respondWith(
      (async () => {
        const cache = await caches.open(DADOS);
        // ignoreSearch e ignoreVary: o app pede com cache:'no-cache', e a cópia guardada
        // na instalação não precisa bater byte a byte no cabeçalho
        const guardado = await cache.match(req, { ignoreSearch: true, ignoreVary: true });

        // se o aparelho já se sabe sem rede, não gasta o prazo à toa: são dois arquivos,
        // e esperar 2s em cada um faria a cozinha esperar 4s por nada
        if (guardado && self.navigator.onLine === false) return guardado;

        const daRede = fetch(req)
          .then((resposta) => {
            if (resposta.ok) cache.put(req, resposta.clone());
            return resposta;
          })
          .catch(() => null);

        if (!guardado) {
          const resposta = await daRede;
          if (resposta) return resposta;
          return new Response(JSON.stringify({ erro: 'sem rede e sem cópia local' }), {
            status: 503,
            headers: { 'content-type': 'application/json; charset=utf-8' },
          });
        }

        const DEMOROU = Symbol('demorou');
        const vencedor = await Promise.race([
          daRede,
          new Promise((r) => setTimeout(() => r(DEMOROU), PRAZO_DA_REDE)),
        ]);
        // a rede só ganha se respondeu a tempo E deu certo
        if (vencedor && vencedor !== DEMOROU) return vencedor;
        return guardado;
      })()
    );
    return;
  }

  // casca: cache-first, atualizando por trás
  evento.respondWith(
    (async () => {
      const guardado = await caches.match(req, { ignoreVary: true });
      const daRede = fetch(req)
        .then((resposta) => {
          if (resposta.ok) caches.open(CASCA).then((c) => c.put(req, resposta.clone()));
          return resposta;
        })
        .catch(() => null);
      if (guardado) return guardado;
      const resposta = await daRede;
      if (resposta) return resposta;
      // navegação sem cache e sem rede volta para a página inicial
      if (req.mode === 'navigate') {
        const inicio = await caches.match('./index.html', { ignoreVary: true });
        if (inicio) return inicio;
      }
      return new Response('sem conexão', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } });
    })()
  );
});
