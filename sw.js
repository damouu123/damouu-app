// Service worker: ένα μικρό script που τρέχει "δίπλα" στο app και
// απαντά στα αιτήματα αρχείων. Κρατάμε όλα τα αρχεία σε cache ώστε
// το app να ανοίγει χωρίς internet.
//
// ΣΗΜΑΝΤΙΚΟ: Κάθε φορά που αλλάζεις οποιοδήποτε αρχείο, ανέβασε το VERSION.
// Έτσι το iPhone καταλαβαίνει ότι υπάρχει νέα έκδοση.
const VERSION = 'v63';
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
  './js/core/settings.js',
  './js/core/feedback.js',
  './js/core/updates.js',
  './js/core/sidebar.js',
  './js/core/wheel.js',
  './js/core/scanner.js',
  './vendor/zxing.min.js',
  './js/core/sections.js',
  './js/core/rules.js',
  './js/modules/calendar.js',
  './js/modules/dayview.js',
  './js/modules/brain.js',
  './js/modules/resume.js',
  './js/modules/timer.js',
  './js/modules/notifications.js',
  './js/modules/push.js',
  './js/modules/backup.js',
  './js/modules/workout.js',
  './js/modules/fitness.js',
  './js/modules/mealplan.js',
  './js/modules/sections.js',
  './data/schedule.js',
  './data/exercises.js',
  './data/mealplan.js',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// 1) Εγκατάσταση: κατεβάζουμε όλα τα αρχεία στην cache.
// cache: 'reload' = πάντα από το GitHub, ΟΧΙ από την προσωρινή μνήμη του browser
// (αλλιώς, σε ενημέρωση λίγα λεπτά μετά την προηγούμενη, έμπαιναν παλιά αρχεία).
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS.map((url) => new Request(url, { cache: 'reload' })))));
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
// και ρωτάει "ποια έκδοση τρέχει;" για τις Ρυθμίσεις
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
  if (event.data === 'VERSION' && event.ports[0]) event.ports[0].postMessage(VERSION);
});

// 3) Push ειδοποίηση από τον server (server/worker.js)
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { /* κενό μήνυμα */ }
  event.waitUntil((async () => {
    // Κόκκινος αριθμός στο εικονίδιο: πόσα μαθήματα περιμένουν δήλωση
    try { if (data.badge && self.navigator.setAppBadge) await self.navigator.setAppBadge(data.badge); } catch { /* τίποτα */ }
    await self.registration.showNotification(data.title || 'Discipline', {
      body: data.body || '',
      tag: data.tag,
      renotify: true,
      requireInteraction: true, // όπου υποστηρίζεται, μένει μέχρι να την πατήσεις
      icon: './icons/icon-192.png',
      data: { url: data.url || './' },
    });
  })());
});

// Πάτημα στην ειδοποίηση: ανοίγουμε το app στο σωστό μάθημα
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data && event.notification.data.url || './', self.registration.scope).href;
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (windows.length) {
      const win = windows[0];
      try { await win.focus(); } catch { /* τίποτα */ }
      win.postMessage({ type: 'open', url });
      return;
    }
    await self.clients.openWindow(url);
  })());
});

// 4) Κάθε αίτημα: πρώτα από την cache, αλλιώς από το δίκτυο
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
