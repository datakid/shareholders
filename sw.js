var VERSION = 'qisma-4.1.0';
var CORE = [
  './',
  'index.html',
  'qisma.html',
  'manifest.webmanifest',
  'icons/icon.svg',
  'css/qisma.css',
  'js/engine.js',
  'js/core.js',
  'js/xlsxstream.js',
  'js/importworker.js',
  'js/data.js',
  'js/app.js',
  'js/review.js',
  'js/views.js',
  'js/selftest.js',
  'vendor/xlsx.full.min.js'
];

self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(VERSION).then(function (cache) {
    return cache.addAll(CORE.map(function (u) { return new Request(u, { cache: 'reload' }); }));
  }));
});

self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('qisma-') === 0 && k !== VERSION && k !== VERSION + '-fonts'; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener('message', function (event) {
  if (event.data && event.data.type === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin === location.origin) {
    if (req.mode === 'navigate') {
      event.respondWith(fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(VERSION).then(function (c) { c.put(req, copy); });
        return res;
      }).catch(function () {
        return caches.match(req, { ignoreSearch: true }).then(function (hit) { return hit || caches.match('qisma.html'); });
      }));
      return;
    }
    event.respondWith(caches.match(req, { ignoreSearch: true }).then(function (hit) {
      return hit || fetch(req).then(function (res) {
        if (res.ok) { var copy = res.clone(); caches.open(VERSION).then(function (c) { c.put(req, copy); }); }
        return res;
      });
    }));
    return;
  }
  if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    event.respondWith(caches.match(req).then(function (hit) {
      return hit || fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(VERSION + '-fonts').then(function (c) { c.put(req, copy); });
        return res;
      }).catch(function () { return new Response('', { status: 504 }); });
    }));
  }
});
