// Push ειδοποιήσεις για τα μαθήματα, μέσω του δικού σου server (server/worker.js).
//
// ΓΙΑΤΙ SERVER: ένα web app στο iPhone δεν μπορεί να "προγραμματίσει" ειδοποίηση
// για αργότερα. Ο server κρατάει τα επόμενα μαθήματά σου και, την κατάλληλη ώρα,
// στέλνει ειδοποίηση μέσω της Apple:
//   - 10/20/40/60' πριν από κάθε μάθημα (το διαλέγεις)
//   - μετά το τέλος, κάθε 10', μέχρι να δηλώσεις Went / Missed / Cancelled
// Πατώντας την ειδοποίηση ανοίγει το app στο συγκεκριμένο μάθημα.
//
// ΤΙ ΣΤΕΛΝΟΥΜΕ ΣΤΟΝ SERVER: τα μαθήματα από 2 μέρες πίσω έως 14 μπροστά
// (τίτλος, αίθουσα, ώρες, αν τα δήλωσες). Ξαναστέλνονται όταν αλλάζει κάτι.
//
// ΣΗΜΑ ΣΤΟ ΕΙΚΟΝΙΔΙΟ: ο κόκκινος αριθμός πάνω στο εικονίδιο του app δείχνει πόσα
// μαθήματα περιμένουν να τα δηλώσεις (και φεύγει μόνο όταν τα δηλώσεις).
//
// Δεδομένα (moduleStore('push')):
//   key       μυστικό που "δένει" αυτό το κινητό με τον server (μπαίνει και στα backups,
//             ώστε μετά από επανεγκατάσταση + restore να ξανασυνδεθείς)
//   enabled   αν είναι ανοιχτές οι ειδοποιήσεις
//   lastSync  πότε ενημερώθηκε τελευταία φορά ο server (ms)
//   error     τελευταίο σφάλμα (ή null)
//   lead      πόσα λεπτά πριν από το μάθημα έρχεται η ειδοποίηση (10/20/40/60)

import { on } from '../core/registry.js';
import { moduleStore } from '../core/storage.js';
import { entriesForDate, addDays, startOfDay } from './calendar.js';

// Η διεύθυνση του server (φαίνεται μετά το "npx wrangler deploy")
export const PUSH_SERVER = 'https://discipline-push.stylianosppdm.workers.dev';

const store = moduleStore('push');
const DAYS_BACK = 2;
const DAYS_AHEAD = 14;
const NAG_WINDOW_MS = 48 * 3600000; // ίδιο με τον server
export const LEADS = [10, 20, 40, 60];
export const NAG_EVERY_MIN = 10; // ίδιο με τον server
export const getLead = () => store.get('lead', 20);

store.remove('test'); // το δοκιμαστικό μάθημα της v38 δεν υπάρχει πια

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const pushConfigured = () => !!PUSH_SERVER;
export const pushEnabled = () => !!store.get('enabled', false);
export const pushStatus = () => ({ lastSync: store.get('lastSync', null), error: store.get('error', null) });

function appKey() {
  let key = store.get('key', null);
  if (!key) {
    key = Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, '0')).join('');
    store.set('key', key);
  }
  return key;
}

const unb64url = (str) => {
  const s = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};

// Τα μαθήματα που χρειάζεται ο server
function classesForServer() {
  const today = startOfDay(new Date());
  const list = [];
  for (let i = -DAYS_BACK; i <= DAYS_AHEAD; i++) {
    for (const e of entriesForDate(addDays(today, i))) {
      list.push({
        key: e.key,
        title: e.title,
        room: e.room || '',
        startsAt: e.startsAt.getTime(),
        endsAt: e.endsAt.getTime(),
        status: e.status,
      });
    }
  }
  return list;
}

async function post(path, body) {
  const res = await fetch(`${PUSH_SERVER}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

const errorText = (err) => (err.status === 403
  ? 'The reminder server is linked to another phone.'
  : 'Could not reach the reminder server.');

async function subscription(create) {
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (sub || !create) return sub;
  const { publicKey } = await (await fetch(`${PUSH_SERVER}/vapid`)).json();
  try {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: unb64url(publicKey) });
  } catch {
    // Παλιά εγγραφή με άλλο κλειδί: τη σβήνουμε και ξαναδοκιμάζουμε
    const old = await reg.pushManager.getSubscription();
    if (old) await old.unsubscribe();
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: unb64url(publicKey) });
  }
  return sub;
}

// Πρέπει να καλείται ΜΕΣΑ σε πάτημα (το iPhone ζητά άδεια μόνο τότε).
// Επιστρέφει 'ok' | 'denied' | 'unsupported' | μήνυμα σφάλματος
export async function enablePush() {
  if (!pushSupported() || !pushConfigured()) return 'unsupported';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return 'denied';
  try {
    const sub = await subscription(true);
    await post('/sync', { key: appKey(), subscription: sub.toJSON(), ...syncBody() });
    store.set('enabled', true);
    store.set('lastSync', Date.now());
    store.set('error', null);
    await post('/test', { key: appKey() });
    return 'ok';
  } catch (err) {
    store.set('error', errorText(err));
    return errorText(err);
  }
}

// Αλλαγή του "πόσα λεπτά πριν". Ο server στέλνει αμέσως ειδοποίηση επιβεβαίωσης
// με τον χρόνο που ΑΠΟΘΗΚΕΥΣΕ (έτσι ξέρεις ότι η αλλαγή έφτασε). true αν πέτυχε.
export async function setLead(minutes) {
  store.set('lead', minutes);
  try {
    await post('/sync', { key: appKey(), ...syncBody() });
    await post('/test', { key: appKey(), reason: 'lead' });
    store.set('lastSync', Date.now());
    store.set('error', null);
    return true;
  } catch (err) {
    store.set('error', errorText(err));
    return false;
  }
}

export async function testPush() {
  try {
    await post('/test', { key: appKey() });
    return true;
  } catch (err) {
    store.set('error', errorText(err));
    return false;
  }
}

export async function disablePush() {
  store.set('enabled', false);
  try { await post('/sync', { key: appKey(), classes: [] }); } catch { /* χωρίς σύνδεση: ο server απλώς δεν θα ξέρει μαθήματα */ }
  try { const sub = await subscription(false); if (sub) await sub.unsubscribe(); } catch { /* τίποτα */ }
}

// Ό,τι χρειάζεται ο server σε κάθε ενημέρωση
const syncBody = () => ({ classes: classesForServer(), lead: getLead(), tzOffset: new Date().getTimezoneOffset() });

// Ενημέρωση του server (με μικρή καθυστέρηση, για να μαζεύονται οι αλλαγές)
let syncTimer = null;
function syncSoon() {
  updateBadge();
  if (!pushEnabled() || !pushConfigured()) return;
  clearTimeout(syncTimer);
  syncTimer = setTimeout(async () => {
    try {
      const sub = await subscription(false);
      await post('/sync', { key: appKey(), subscription: sub ? sub.toJSON() : undefined, ...syncBody() });
      store.set('lastSync', Date.now());
      store.set('error', null);
    } catch (err) {
      store.set('error', errorText(err));
    }
  }, 1500);
}

// Κόκκινος αριθμός στο εικονίδιο: μαθήματα που τελείωσαν και δεν τα δήλωσες
export function unmarkedCount(now = Date.now()) {
  return classesForServer().filter((c) => !c.status && c.endsAt <= now && now - c.endsAt < NAG_WINDOW_MS).length;
}
function updateBadge() {
  try {
    const n = unmarkedCount();
    if (n && navigator.setAppBadge) navigator.setAppBadge(n);
    else if (navigator.clearAppBadge) navigator.clearAppBadge();
  } catch { /* δεν υποστηρίζεται */ }
}

on('attendance:changed', syncSoon);
on('schedule:changed', syncSoon);
document.addEventListener('visibilitychange', () => { if (!document.hidden) syncSoon(); });
syncSoon();

// Πάτημα σε ειδοποίηση ενώ το app είναι ήδη ανοιχτό: ο service worker μάς λέει πού να πάμε
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (ev) => {
    if (ev.data && ev.data.type === 'open' && ev.data.url) {
      const { hash } = new URL(ev.data.url);
      if (hash) location.hash = hash;
    }
  });
}
