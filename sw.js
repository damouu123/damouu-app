// Service worker: ένα μικρό script που τρέχει "δίπλα" στο app και
// απαντά στα αιτήματα αρχείων. Κρατάμε όλα τα αρχεία σε cache ώστε
// το app να ανοίγει χωρίς internet.
//
// ΣΗΜΑΝΤΙΚΟ: Κάθε φορά που αλλάζεις οποιοδήποτε αρχείο, ανέβασε το VERSION.
// Έτσι το iPhone καταλαβαίνει ότι υπάρχει νέα έκδοση.
const VERSION = 'v3';
const CACHE = `discipline-${VERSION}`;

// Όλα τα αρχεία του app (σχετικά paths, για να δουλεύει σε GitHub Pages υποφάκελο)
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/core/storage.js',
  './js/core/registry.js',
  './js/core/router.js',
  './js/modules/calendar.js',
  './js/modules/xp.js',
  './js/modules/resume.js',
  './js/modules/timer.js',
  './js/modules/wallet.js',
  './js/modules/notifications.js',
  './data/schedule.js',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// 1) Εγκατάσταση: κατεβάζουμε όλα τα αρχεία στην cache
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
});

// 2) Ενεργοποίηση: σβήνουμε τις παλιές εκδόσεις της cache
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Το app στέλνει αυτό το μήνυμα όταν πατάς "Ανανέωση"
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

// 3) Κάθε αίτημα: πρώτα από την cache, αλλιώς από το δίκτυο
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Άνοιγμα σελίδας (π.χ. από την αρχική οθόνη): πάντα το index.html από την cache
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html').then((cached) => cached || fetch(req))
    );
    return;
  }

  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((cached) => cached || fetch(req))
  );
});
