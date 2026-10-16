// Ενημερώσεις του app (service worker).
//
// ΤΟ ΠΡΟΒΛΗΜΑ: το iPhone ξαναδείχνει ένα app της αρχικής οθόνης από τη μνήμη
// χωρίς να το φορτώσει ξανά, οπότε ο έλεγχος για νέα έκδοση (που γινόταν
// μόνο στη φόρτωση) δεν έτρεχε ποτέ.
//
// Η ΛΥΣΗ:
//   - ρωτάμε το GitHub για νέα έκδοση στην εκκίνηση, κάθε φορά που ξαναμπαίνεις
//     στο app και κάθε 15 λεπτά
//   - αν βρεθεί νέα έκδοση ΑΚΡΙΒΩΣ στην εκκίνηση (και δεν τρέχει focus), την
//     εφαρμόζουμε αμέσως (μοιάζει με λίγο πιο αργή εκκίνηση)
//   - αλλιώς δείχνουμε το μήνυμα "A new version is ready" ΚΑΙ την εφαρμόζουμε
//     μόνοι μας όταν βγεις από το app, ώστε να μη σε διακόψουμε ποτέ
//   - checkForUpdates(): για το κουμπί στις Ρυθμίσεις

const CHECK_EVERY_MS = 15 * 60 * 1000;
const LAUNCH_WINDOW_MS = 8000; // "ακριβώς στην εκκίνηση"

let registration = null;

// Τρέχει συνεδρία focus; (τότε δεν κάνουμε ποτέ αυτόματη επανεκκίνηση)
const focusRunning = () => {
  try { return localStorage.getItem('ud:timer:active') !== null; } catch { return false; }
};

// Νέα έκδοση που έχει κατέβει και περιμένει (μόνο αν υπάρχει ήδη "παλιά" που τρέχει)
const waitingWorker = () => (
  registration && registration.waiting && navigator.serviceWorker.controller ? registration.waiting : null
);

const apply = (worker) => worker.postMessage('SKIP_WAITING');

function showBanner(worker) {
  const banner = document.getElementById('update-banner');
  if (!banner) return;
  banner.hidden = false;
  document.getElementById('update-btn').onclick = () => apply(worker);
}

export function initUpdates() {
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.register('./sw.js').then((reg) => {
    registration = reg;

    const consider = () => {
      const worker = waitingWorker();
      if (!worker) return;
      if (performance.now() < LAUNCH_WINDOW_MS && !focusRunning()) apply(worker);
      else showBanner(worker);
    };
    consider();

    // Νέα έκδοση που κατεβαίνει τώρα
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => { if (worker.state === 'installed') consider(); });
    });

    const check = () => reg.update().catch(() => { /* χωρίς σύνδεση */ });
    check();
    setInterval(check, CHECK_EVERY_MS);

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        check();
      } else {
        // Βγαίνεις από το app: κατάλληλη στιγμή να εφαρμοστεί, χωρίς να σε διακόψει
        const worker = waitingWorker();
        if (worker && !focusRunning()) apply(worker);
      }
    });
  });

  // Όταν ενεργοποιηθεί η νέα έκδοση, ξαναφορτώνουμε μία φορά
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return;
    reloaded = true;
    location.reload();
  });
}

// Η έκδοση που ΤΡΕΧΕΙ τώρα (τη λέει ο service worker). null αν δεν απαντήσει.
export function runningVersion() {
  const sw = 'serviceWorker' in navigator && navigator.serviceWorker.controller;
  if (!sw) return Promise.resolve(null);
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(null), 1500);
    channel.port1.onmessage = (ev) => { clearTimeout(timer); resolve(ev.data); };
    sw.postMessage('VERSION', [channel.port2]);
  });
}

// Για το κουμπί "Check for updates". Επιστρέφει:
//   'updating'    βρέθηκε νέα έκδοση και εφαρμόζεται (η σελίδα θα ξαναφορτώσει)
//   'latest'      έχεις ήδη την τελευταία
//   'offline'     δεν έγινε έλεγχος (χωρίς σύνδεση)
//   'unsupported' ο browser δεν υποστηρίζει service worker
export async function checkForUpdates() {
  if (!('serviceWorker' in navigator)) return 'unsupported';
  const reg = registration || await navigator.serviceWorker.getRegistration();
  if (!reg) return 'unsupported';
  try {
    await reg.update();
  } catch {
    return 'offline';
  }
  // Αν κατεβαίνει μια νέα έκδοση, περιμένουμε λίγο να ολοκληρωθεί (έως ~10")
  for (let i = 0; i < 34 && reg.installing; i++) await new Promise((r) => setTimeout(r, 300));
  const worker = reg.waiting && navigator.serviceWorker.controller ? reg.waiting : null;
  if (worker) { apply(worker); return 'updating'; }
  return 'latest';
}
