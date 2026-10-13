// Αποθήκευση δεδομένων στο κινητό (localStorage).
//
// Το localStorage κρατάει μόνο κείμενο, οπότε μετατρέπουμε τα δεδομένα
// σε JSON. Κάθε module παίρνει τον δικό του "χώρο" με πρόθεμα στο κλειδί,
// π.χ. "ud:calendar:attendance", ώστε να μην μπλέκονται μεταξύ τους.

const PREFIX = 'ud:';

function read(fullKey, fallback) {
  try {
    const raw = localStorage.getItem(fullKey);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    // Χαλασμένα δεδομένα ή μπλοκαρισμένη αποθήκευση: επιστρέφουμε την προεπιλογή
    return fallback;
  }
}

function write(fullKey, value) {
  try {
    localStorage.setItem(fullKey, JSON.stringify(value));
    return true;
  } catch (err) {
    console.error('Αποτυχία αποθήκευσης', fullKey, err);
    return false;
  }
}

// Δίνει σε ένα module τις δικές του μεθόδους αποθήκευσης.
// Παράδειγμα: const store = moduleStore('wallet'); store.set('balance', 30);
export function moduleStore(moduleId) {
  const key = (k) => `${PREFIX}${moduleId}:${k}`;
  return {
    get: (k, fallback = null) => read(key(k), fallback),
    set: (k, value) => write(key(k), value),
    // Διαβάζει, αλλάζει με τη συνάρτηση fn, και αποθηκεύει
    update: (k, fn, fallback = null) => {
      const next = fn(read(key(k), fallback));
      write(key(k), next);
      return next;
    },
    remove: (k) => {
      try { localStorage.removeItem(key(k)); } catch { /* αγνοούμε */ }
    },
  };
}

// Όλα τα δεδομένα του app μαζί (για μελλοντικό backup/επαναφορά)
export function exportAll() {
  const out = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k.startsWith(PREFIX)) out[k] = localStorage.getItem(k);
    }
  } catch { /* αγνοούμε */ }
  return out;
}

// Ζητάμε από τον browser να μη σβήσει τα δεδομένα όταν χρειάζεται χώρο
export async function requestPersistentStorage() {
  try {
    if (navigator.storage && navigator.storage.persist) {
      await navigator.storage.persist();
    }
  } catch { /* δεν υποστηρίζεται παντού */ }
}
