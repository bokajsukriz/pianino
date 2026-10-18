/* sw.js — Service Worker: Offline-Betrieb.
   Shell (HTML, CSS, JS, Schrift, Icons) cache-first unter einem Namen, der
   sich aus SW_VERSION ableitet. Bei JEDER Änderung an einer Datei aus SHELL
   SW_VERSION erhöhen (siehe CLAUDE.md) — sonst bekommt niemand das Update.
   Klaviersamples: eigener Cache, beim ersten Gebrauch gefüllt, nicht an
   SW_VERSION gebunden. Ändern sich Dateien in samples/, SAMPLES_CACHE erhöhen.
   IndexedDB liest er nur an einer Stelle: ./pdf/<songId> liefert das PDF der
   Liedseite (Datensatz pdf:<songId>) als eigene Antwort ohne die CSP der
   Seite — als blob: geöffnet erbte es die CSP, und der PDF-Viewer des
   Browsers bliebe leer. Geschrieben wird nie, gecacht wird das PDF nicht.
   Anfragen an andere Herkünfte (YouTube) bearbeitet er nicht: kein Cache,
   kein Abfangen. */

const SW_VERSION = 'v13';
const CACHE = `pianino-shell-${SW_VERSION}`;
const SAMPLES_CACHE = 'pianino-samples-v1';

const SHELL = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './accomp.js',
  './audio.js',
  './band.js',
  './chords.js',
  './chordsym.js',
  './clock.js',
  './dates.js',
  './db.js',
  './ear.js',
  './hear.js',
  './ear-worker.js',
  './keyboard.js',
  './leitner.js',
  './log.js',
  './marks.js',
  './melody.js',
  './mic.js',
  './mictest.js',
  './migrations.js',
  './mix.js',
  './phrases.js',
  './piano-samples.js',
  './selftest.js',
  './session.js',
  './song-perfect-ruin.js',
  './songdata.js',
  './songs.js',
  './songpage.js',
  './store.js',
  './tabtext.js',
  './tap.js',
  './tempo.js',
  './test-melody.js',
  './timeline.js',
  './ui.js',
  './voicing.js',
  './yt.js',
  './exercises/blitz.js',
  './exercises/griffe.js',
  './exercises/groove.js',
  './exercises/guided.js',
  './exercises/playalong.js',
  './exercises/transcribe.js',
  './exercises/wann.js',
  './exercises/wege.js',
  './vendor/essentia/essentia-wasm.es.js',
  './vendor/essentia/essentia.js-core.es.min.js',
  './fonts/bricolage-grotesque-latin.woff2',
  './manifest.json',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
];

// Am HTTP-Cache des Browsers vorbei laden (cache: 'reload'): sonst landen
// beim Update noch alte Dateien im neuen Shell-Cache (GitHub Pages schickt
// max-age=600) und alte und neue Module mischen sich.
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE)
    .then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('pianino-') && key !== CACHE && key !== SAMPLES_CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

// Die Seite fragt nach der Version (Anzeige unter „Über“).
self.addEventListener('message', (e) => {
  if (e.data?.type === 'version') e.source?.postMessage({ type: 'version', version: SW_VERSION });
});

/** PDF der Liedseite aus IndexedDB (nur lesen). → Datensatz oder null */
function readPdf(songId) {
  return new Promise((resolve) => {
    const req = indexedDB.open('pianino');
    req.onerror = () => resolve(null);
    req.onupgradeneeded = () => { req.transaction.abort(); resolve(null); };
    req.onsuccess = () => {
      const db = req.result;
      try {
        const g = db.transaction('meta', 'readonly').objectStore('meta').get(`pdf:${songId}`);
        g.onsuccess = () => { resolve(g.result || null); db.close(); };
        g.onerror = () => { resolve(null); db.close(); };
      } catch { resolve(null); db.close(); }
    };
  });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const pdf = /\/pdf\/([a-z0-9-]+)$/.exec(url.pathname);
  if (pdf) {
    e.respondWith(readPdf(pdf[1]).then((rec) => (rec?.blob
      ? new Response(rec.blob, { headers: { 'Content-Type': 'application/pdf', 'Cache-Control': 'no-store' } })
      : new Response('Kein PDF', { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } }))));
    return;
  }

  if (url.pathname.includes('/samples/')) {
    e.respondWith((async () => {
      const cache = await caches.open(SAMPLES_CACHE);
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    })());
    return;
  }

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req, { ignoreSearch: true })
      || (req.mode === 'navigate' ? await cache.match('./index.html') : null);
    if (hit) return hit;
    return fetch(req);
  })());
});
