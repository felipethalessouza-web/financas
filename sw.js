// Service worker: guarda os arquivos do app para funcionar offline.
// Ao alterar qualquer arquivo do app, aumente a versão abaixo para os celulares baixarem a atualização.
const VERSAO = 'financas-v2';
const ARQUIVOS = ['./', 'index.html', 'styles.css', 'app.js', 'manifest.json',
  'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSAO).then(c => c.addAll(ARQUIVOS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(chaves =>
    Promise.all(chaves.filter(k => k !== VERSAO).map(k => caches.delete(k)))));
  self.clients.claim();
});

// Rede primeiro (pega atualizações quando online); cache quando offline.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then(r => { const copia = r.clone(); caches.open(VERSAO).then(c => c.put(e.request, copia)); return r; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
