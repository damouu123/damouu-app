// Backup: αποθήκευση όλων των δεδομένων σε αρχείο και επαναφορά από αρχείο.
//
// Τα δεδομένα του app ζουν ΜΟΝΟ στο κινητό (localStorage). Αν σβηστούν
// (π.χ. σβήσεις το app από την αρχική οθόνη), χάνονται. Το backup είναι
// ένα αρχείο .json που σώζεις στα Files / iCloud Drive.
//
// Μορφή αρχείου:
//   { app: "discipline", version: 1, exportedAt: <ms>, data: { "ud:...": "<json>" } }
//
// Δεδομένα (moduleStore('backup')):
//   lastExport  πότε έκανες τελευταία φορά backup (ms)
//
// CLOUD BACKUP: δες την ενότητα "Cloud backup (GitHub Gist)" πιο κάτω.
//
// ΑΥΤΟΜΑΤΟ BACKUP: ένα web app δεν μπορεί να γράψει αρχείο στα Files μόνο του
// (θέλει πάντα το δικό σου πάτημα). Γι' αυτό, μία φορά τη μέρα, κρατάμε ένα
// αντίγραφο ΜΕΣΑ στο app (τελευταίες 7 μέρες). Σε προστατεύει από λάθη, αλλά
// όχι αν σβηστεί το app: για αυτό χρειάζεται και το "Save backup" στα Files.
// Το κλειδί είναι εκτός "ud:", ώστε τα αντίγραφα να μη μπαίνουν μέσα στα backups.

import { register } from '../core/registry.js';
import { getSetting } from '../core/settings.js';
import { moduleStore, exportAll, replaceAll, saveSafetyCopy, getSafetyCopy, clearSafetyCopy } from '../core/storage.js';
import { escapeHtml, toast, ask } from '../core/router.js';

const store = moduleStore('backup');
const REMIND_AFTER_DAYS = 7;
const DAY = 86400000;

// ===================== Σύνοψη δεδομένων =====================

// Πόσα πράγματα έχει ένα σύνολο δεδομένων (για να ξέρεις τι αποθηκεύεις/επαναφέρεις)
function summarize(data) {
  const parse = (k, fallback) => {
    try { return data[k] ? JSON.parse(data[k]) : fallback; } catch { return fallback; }
  };
  return {
    classesMarked: Object.keys(parse('ud:calendar:attendance', {})).length,
    sessions: parse('ud:timer:sessions', []).length,
    scrollEntries: parse('ud:wallet:spends', []).length,
    customSchedule: !!data['ud:calendar:schedule'],
  };
}

const hasData = (s) => s.classesMarked + s.sessions + s.scrollEntries > 0 || s.customSchedule;

function summaryText(s) {
  return [
    `${s.classesMarked} marked ${s.classesMarked === 1 ? 'class' : 'classes'}`,
    `${s.sessions} focus ${s.sessions === 1 ? 'session' : 'sessions'}`,
    s.customSchedule ? 'your edited schedule' : 'the original schedule',
  ].join(', ');
}

function ago(ts) {
  const days = Math.floor((Date.now() - ts) / DAY);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

// ===================== Export =====================

function backupFile() {
  const now = new Date();
  const name = `discipline-backup-${now.toLocaleDateString('sv')}.json`; // ...-2026-10-14.json
  const body = JSON.stringify({ app: 'discipline', version: 1, exportedAt: now.getTime(), data: exportAll() }, null, 2);
  return new File([body], name, { type: 'application/json' });
}

function download(file) {
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// Στο iPhone: share sheet ("Save to Files"). Αλλού: κατέβασμα.
async function exportBackup({ forceDownload = false } = {}) {
  const file = backupFile();
  let done = false;
  if (!forceDownload && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Discipline backup' });
      done = true;
    } catch (err) {
      // Αν πάτησες "Cancel" στο share sheet, δεν μετράει ως backup
      if (err && err.name === 'AbortError') return false;
    }
  }
  if (!done) download(file);
  store.set('lastExport', Date.now());
  return true;
}

// ===================== Import =====================

// Διαβάζει και ελέγχει το αρχείο. Επιστρέφει { data, exportedAt } ή πετάει σφάλμα με εξήγηση.
async function readBackup(file) {
  let json;
  try {
    json = JSON.parse(await file.text());
  } catch {
    throw new Error('This file is not a backup from this app.');
  }
  if (!json || json.app !== 'discipline' || typeof json.data !== 'object' || json.data === null) {
    throw new Error('This file is not a backup from this app.');
  }
  // Κρατάμε μόνο κλειδιά του app, και όχι συνεδρία timer "σε εξέλιξη"
  const data = {};
  for (const [k, v] of Object.entries(json.data)) {
    if (k.startsWith('ud:') && typeof v === 'string' && k !== 'ud:timer:active') data[k] = v;
  }
  return { data, exportedAt: json.exportedAt };
}

async function importBackup(file) {
  let backup;
  try {
    backup = await readBackup(file);
  } catch (err) {
    toast(err.message);
    return;
  }
  const when = backup.exportedAt
    ? new Date(backup.exportedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
    : 'an unknown date';
  const yes = await ask({
    title: 'Replace your data with this backup?',
    text: `Backup from ${when}: ${summaryText(summarize(backup.data))}. Everything currently in the app is replaced. You can undo this afterwards.`,
    confirmLabel: 'Restore backup',
  });
  if (!yes) return;

  saveSafetyCopy();           // για "Undo"
  const lastExport = store.get('lastExport', null);
  replaceAll(backup.data);
  // Η ημερομηνία του τελευταίου backup αφορά το κινητό, όχι το αρχείο: την κρατάμε
  if (lastExport) store.set('lastExport', lastExport);
  // Ξαναφορτώνουμε το app, ώστε όλα τα modules να διαβάσουν τα νέα δεδομένα
  location.hash = '#/backup';
  location.reload();
}

async function undoImport() {
  const copy = getSafetyCopy();
  if (!copy) return;
  const yes = await ask({
    title: 'Undo the last restore?',
    text: `Your data goes back to how it was before you restored the backup: ${summaryText(summarize(copy.data))}.`,
    confirmLabel: 'Undo restore',
  });
  if (!yes) return;
  replaceAll(copy.data);
  clearSafetyCopy();
  location.reload();
}

// ===================== Αυτόματο ημερήσιο αντίγραφο =====================

const AUTO_KEY = 'udauto:snapshots';
const AUTO_KEEP = 7;
const today = () => new Date().toLocaleDateString('sv'); // "2026-10-14"

function getSnapshots() {
  try { return JSON.parse(localStorage.getItem(AUTO_KEY)) || []; } catch { return []; }
}

// Κρατάει αντίγραφο αν δεν υπάρχει ήδη σημερινό (και αν υπάρχουν δεδομένα)
function autoSnapshot() {
  if (!getSetting('autoBackup')) return;
  const list = getSnapshots();
  if (list[0] && list[0].date === today()) return;
  const data = exportAll();
  if (!hasData(summarize(data))) return;
  list.unshift({ date: today(), at: Date.now(), data });
  try { localStorage.setItem(AUTO_KEY, JSON.stringify(list.slice(0, AUTO_KEEP))); } catch { /* γεμάτη μνήμη */ }
}

// Όταν ανοίγει το app, και όταν ξαναγυρνάς σε αυτό (π.χ. την επόμενη μέρα)
autoSnapshot();
document.addEventListener('visibilitychange', () => { if (!document.hidden) autoSnapshot(); });

async function restoreSnapshot(date) {
  const snap = getSnapshots().find((s) => s.date === date);
  if (!snap) return;
  const day = new Date(snap.at).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const yes = await ask({
    title: 'Go back to this copy?',
    text: `Copy from ${day}: ${summaryText(summarize(snap.data))}. Everything currently in the app is replaced. You can undo this afterwards.`,
    confirmLabel: 'Restore copy',
  });
  if (!yes) return;
  saveSafetyCopy();
  const lastExport = store.get('lastExport', null);
  replaceAll(snap.data);
  if (lastExport) store.set('lastExport', lastExport);
  location.hash = '#/backup';
  location.reload();
}

// ===================== Cloud backup (GitHub Gist) =====================
//
// Αντίγραφο ΕΞΩ από το κινητό: ένα ιδιωτικό (secret) Gist στο GitHub σου.
// Το app ελέγχει κάθε δευτερόλεπτο αν άλλαξε κάτι και, μόνο τότε, ανεβάζει.
// Το token (δικαίωμα "gist" μόνο) μένει στο κινητό, εκτός "ud:" (δεν μπαίνει σε backups).
// Ποτέ δεν αντικαθιστούμε τοπικά δεδομένα αυτόματα: η επαναφορά ζητά πάντα επιβεβαίωση.

const CLOUD_KEY = 'udcloud:config'; // { token, gistId, sig, at, error }
const GIST_DESC = 'discipline-app-backup';
const GIST_FILE = 'discipline-backup.json';
const CLOUD_MIN_GAP = 3000; // όχι πιο συχνά από 1 ανέβασμα / 3"

const getCloud = () => {
  try { return JSON.parse(localStorage.getItem(CLOUD_KEY)) || null; } catch { return null; }
};
const setCloud = (c) => {
  try {
    if (c) localStorage.setItem(CLOUD_KEY, JSON.stringify(c)); else localStorage.removeItem(CLOUD_KEY);
  } catch { /* τίποτα */ }
};

async function gh(path, token, options = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
  });
  if (!res.ok) { const err = new Error(`GitHub ${res.status}`); err.status = res.status; throw err; }
  return res.json();
}

// Τα δεδομένα που ανεβαίνουν (χωρίς συνεδρία timer "σε εξέλιξη")
function cloudData() {
  const data = exportAll();
  delete data['ud:timer:active'];
  return data;
}

async function findGist(token) {
  const list = await gh('/gists?per_page=100', token);
  return list.find((g) => g.description === GIST_DESC && g.files && g.files[GIST_FILE]) || null;
}

async function gistFile(token, id) {
  const g = await gh(`/gists/${id}`, token);
  const f = g.files && g.files[GIST_FILE];
  if (!f) throw new Error('empty');
  if (f.truncated) return (await fetch(f.raw_url)).text();
  return f.content;
}

const errorText = (err) => (
  err.status === 401 ? 'GitHub rejected the token. Reconnect.'
    : err.status === 403 ? 'GitHub is limiting requests. Retrying later.'
      : 'Could not reach GitHub. Retrying.'
);

let cloudBusy = false;
let cloudLastTry = 0;

async function cloudSync({ force = false } = {}) {
  const cfg = getCloud();
  if (!cfg || cloudBusy || !navigator.onLine) return;
  const data = cloudData();
  const sig = JSON.stringify(data);
  if (!force && sig === cfg.sig) return;
  if (!force && Date.now() - cloudLastTry < CLOUD_MIN_GAP) return;
  if (!hasData(summarize(data))) return; // ποτέ δεν ανεβάζουμε "άδειο" πάνω από αντίγραφο
  cloudBusy = true;
  cloudLastTry = Date.now();
  const files = { [GIST_FILE]: { content: JSON.stringify({ app: 'discipline', version: 1, exportedAt: Date.now(), data }) } };
  try {
    let gistId = cfg.gistId;
    if (gistId) {
      try {
        await gh(`/gists/${gistId}`, cfg.token, { method: 'PATCH', body: JSON.stringify({ files }) });
      } catch (err) {
        if (err.status !== 404) throw err;
        gistId = null; // το Gist σβήστηκε: φτιάχνουμε νέο
      }
    }
    if (!gistId) {
      const g = await gh('/gists', cfg.token, { method: 'POST', body: JSON.stringify({ description: GIST_DESC, public: false, files }) });
      gistId = g.id;
    }
    setCloud({ ...getCloud(), gistId, sig, at: Date.now(), error: null });
  } catch (err) {
    setCloud({ ...getCloud(), error: errorText(err) });
  } finally {
    cloudBusy = false;
  }
}

setInterval(cloudSync, 1000);
document.addEventListener('visibilitychange', () => { if (document.hidden) cloudSync(); });

async function connectCloud(token, el) {
  let found;
  try {
    await gh('/user', token);
    found = await findGist(token);
  } catch (err) {
    toast(err.status === 401 ? 'GitHub did not accept this token' : 'Could not reach GitHub');
    return;
  }
  setCloud({ token, gistId: found ? found.id : null, sig: null, at: null, error: null });
  if (found) {
    try {
      const backup = await readBackup(new File([await gistFile(token, found.id)], 'cloud.json'));
      const yes = await ask({
        title: 'Found a cloud backup',
        text: `It has: ${summaryText(summarize(backup.data))}. Restore it, or keep this phone's data (the cloud copy is then replaced).`,
        confirmLabel: 'Restore from cloud',
        cancelLabel: 'Keep this phone',
      });
      if (yes) {
        saveSafetyCopy();
        replaceAll(backup.data);
        setCloud({ token, gistId: found.id, sig: JSON.stringify(cloudData()), at: Date.now(), error: null });
        location.hash = '#/backup';
        location.reload();
        return;
      }
    } catch { /* αν δεν διαβάζεται, συνεχίζουμε και θα το αντικαταστήσουμε */ }
  }
  await cloudSync({ force: true });
  toast(getCloud().error || 'Cloud backup is on');
  render(el);
}

async function restoreFromCloud() {
  const cfg = getCloud();
  if (!cfg || !cfg.gistId) { toast('No cloud copy yet'); return; }
  try {
    const text = await gistFile(cfg.token, cfg.gistId);
    await importBackup(new File([text], 'cloud.json'));
  } catch {
    toast('Could not read the cloud copy');
  }
}

function cloudSection() {
  const cfg = getCloud();
  if (!cfg) {
    return `
    <h2 class="section-title">Cloud backup</h2>
    <p class="muted small-print first-intro">Saves your data to a private place in your GitHub account, automatically, within seconds of every change. It survives deleting the app.</p>
    <ol class="muted small-print cloud-steps">
      <li><a class="cloud-link" href="https://github.com/settings/tokens/new?scopes=gist&description=Discipline%20backup" target="_blank" rel="noopener">Open GitHub</a> and create a token (only "gist" is ticked, keep it).</li>
      <li>Copy the token and paste it below.</li>
    </ol>
    <input class="cloud-input" id="cloud-token" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Paste token here">
    <button class="btn btn-block" data-cloud-connect>Turn on cloud backup</button>`;
  }
  const status = cfg.error
    ? `<span class="row-value small-value is-low">${escapeHtml(cfg.error)}</span>`
    : cfg.at ? `<span class="row-value small-value">Synced ${ago(cfg.at)}</span>`
      : '<span class="row-value small-value muted">Waiting for first sync</span>';
  return `
    <h2 class="section-title">Cloud backup</h2>
    <ul class="list"><li><div class="row row-static"><span class="row-text">
      <span class="row-title">GitHub (automatic)</span>
      <span class="row-sub wrap">Every change is saved within seconds.</span></span>${status}</div></li></ul>
    <button class="btn btn-quiet btn-block" data-cloud-sync>Sync now</button>
    <button class="link-btn centered" data-cloud-restore>Restore from cloud</button>
    <button class="link-btn centered" data-cloud-off>Turn off</button>`;
}

// ===================== Οθόνη =====================

function render(el) {
  const last = store.get('lastExport', null);
  const current = summarize(exportAll());
  const safety = getSafetyCopy();
  const snapshots = getSnapshots();

  el.innerHTML = `
    <p class="muted intro first-intro">Your data lives only on this phone. Save a copy to Files or iCloud Drive.</p>

    <ul class="list backup-summary">
      <li><div class="row row-static"><span class="row-text">
        <span class="row-title">Your data</span>
        <span class="row-sub wrap">${escapeHtml(summaryText(current))}</span></span>
        <span class="row-value small-value ${last ? '' : 'is-low'}">${last ? `Saved ${ago(last)}` : 'Not saved'}</span></div></li>
    </ul>

    <button class="btn btn-block" data-export>Save backup</button>
    <button class="link-btn centered" data-download>Download the file instead</button>

    <h2 class="section-title">Restore</h2>
    <label class="btn btn-quiet btn-block file-btn">
      Choose backup file
      <input type="file" id="backup-file" accept="application/json,.json" hidden>
    </label>
    ${safety ? `<button class="link-btn centered" data-undo>Undo the last restore (${ago(safety.at)})</button>` : ''}

    ${cloudSection()}

    <h2 class="section-title">Daily copies</h2>
    ${!getSetting('autoBackup')
      ? '<p class="muted small-print">Daily copies are off. Turn them on in Settings.</p>'
      : snapshots.length ? `
        <ul class="list">${snapshots.map((s) => `
          <li><button class="row" data-snapshot="${s.date}">
            <span class="row-text">
              <span class="row-title">${new Date(s.at).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })}</span>
              <span class="row-sub">${escapeHtml(summaryText(summarize(s.data)))}</span>
            </span>
            <span class="row-value small-value muted">Restore</span>
          </button></li>`).join('')}
        </ul>
        <p class="muted small-print">The app keeps a copy every day, for the last 7 days. These live inside the app, so also save a backup to Files now and then.</p>`
      : '<p class="muted small-print">The first daily copy is made once you have some data.</p>'}`;

  el.querySelector('#backup-file').addEventListener('change', (ev) => {
    const file = ev.target.files && ev.target.files[0];
    ev.target.value = ''; // για να μπορείς να διαλέξεις ξανά το ίδιο αρχείο
    if (file) importBackup(file);
  });

  el.onclick = async (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    if ('cloudConnect' in b.dataset) {
      const token = el.querySelector('#cloud-token').value.trim();
      if (!token) { toast('Paste the token first'); return; }
      b.disabled = true;
      await connectCloud(token, el);
      b.disabled = false;
      return;
    }
    if ('cloudSync' in b.dataset) {
      await cloudSync({ force: true });
      toast(getCloud().error || 'Cloud copy is up to date');
      render(el);
      return;
    }
    if ('cloudRestore' in b.dataset) { restoreFromCloud(); return; }
    if ('cloudOff' in b.dataset) {
      const yes = await ask({ title: 'Turn off cloud backup?', text: 'Your data stays on this phone. The copy already in GitHub is kept.', confirmLabel: 'Turn off' });
      if (yes) { setCloud(null); render(el); }
      return;
    }
    if ('export' in b.dataset || 'download' in b.dataset) {
      const ok = await exportBackup({ forceDownload: 'download' in b.dataset });
      if (ok) { toast('Backup saved'); render(el); }
    } else if ('undo' in b.dataset) {
      undoImport();
    } else if (b.dataset.snapshot) {
      restoreSnapshot(b.dataset.snapshot);
    }
  };
}

// ===================== Καταχώρηση =====================

register({
  id: 'backup',
  title: 'Backup',
  icon: '<path d="M12 3.5v11M7.5 10l4.5 4.5 4.5-4.5M4.5 15.5v3a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3"/>',
  order: 70,
  settings: true, // μπαίνει στις Ρυθμίσεις, όχι στη λίστα της Αρχικής
  settingsGroup: 'Data',

  homeCard() {
    const cloud = getCloud();
    if (cloud && cloud.at && !cloud.error) return { value: '', label: `Cloud synced ${ago(cloud.at)}` };
    const last = store.get('lastExport', null);
    return { value: '', label: last ? `Last backup ${ago(last)}` : 'Never backed up' };
  },

  // Υπενθύμιση στην Αρχική: έχεις δεδομένα αλλά όχι πρόσφατο backup
  homeBanner() {
    const cloud = getCloud();
    if (cloud && cloud.at && !cloud.error) return null; // το cloud backup δουλεύει
    const last = store.get('lastExport', null);
    if (last && Date.now() - last < REMIND_AFTER_DAYS * DAY) return null;
    if (!hasData(summarize(exportAll()))) return null;
    return {
      title: last ? `Last backup was ${ago(last)}` : 'Back up your data',
      text: 'Your data lives only on this phone.',
      action: { go: 'backup', label: 'Back up' },
    };
  },

  render,
});
