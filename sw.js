/* sw.js — Service Worker: Offline-Betrieb.
   Shell (HTML, CSS, JS, Schrift, Icons) cache-first unter einem Namen, der
   sich aus SW_VERSION ableitet. Bei JEDER Änderung an einer Datei aus SHELL
   SW_VERSION erhöhen (siehe CLAUDE.md) — sonst bekommt niemand das Update.
   Klaviersamples: eigener Cache, beim ersten Gebrauch gefüllt, nicht an
   SW_VERSION gebunden. Ändern sich Dateien in samples/, SAMPLES_CACHE erhöhen.
   Der Service Worker fasst IndexedDB nie an. */

const SW_VERSION = 'v5';
const CACHE = `pianino-shell-${SW_VERSION}`;
const SAMPLES_CACHE = 'pianino-samples-v1';

const SHELL = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './audio.js',
  './chords.js',
  './clock.js',
  './dates.js',
  './db.js',
  './ear.js',
  './hear.js',
  './ear-worker.js',
  './keyboard.js',
  './leitner.js',
  './log.js',
  './melody.js',
  './mic.js',
  './mictest.js',
  './mix.js',
  './phrases.js',
  './piano-samples.js',
  './selftest.js',
  './session.js',
  './song-perfect-ruin.js',
  './store.js',
  './tempo.js',
  './test-melody.js',
  './ui.js',
  './exercises/blitz.js',
  './exercises/groove.js',
  './exercises/guided.js',
  './exercises/playalong.js',
  './exercises/wege.js',
  './vendor/essentia/essentia-wasm.es.js',
  './vendor/essentia/essentia.js-core.es.min.js',
  './fonts/bricolage-grotesque-latin.woff2',
  './manifest.json',
  './icon.svg',
  './icon-192.png',
  './icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
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

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

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
