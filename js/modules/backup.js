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

import { register } from '../core/registry.js';
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
    `${s.scrollEntries} scroll ${s.scrollEntries === 1 ? 'entry' : 'entries'}`,
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

// ===================== Οθόνη =====================

function render(el) {
  const last = store.get('lastExport', null);
  const current = summarize(exportAll());
  const safety = getSafetyCopy();

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
    ${safety ? `<button class="link-btn centered" data-undo>Undo the last restore (${ago(safety.at)})</button>` : ''}`;

  el.querySelector('#backup-file').addEventListener('change', (ev) => {
    const file = ev.target.files && ev.target.files[0];
    ev.target.value = ''; // για να μπορείς να διαλέξεις ξανά το ίδιο αρχείο
    if (file) importBackup(file);
  });

  el.onclick = async (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    if ('export' in b.dataset || 'download' in b.dataset) {
      const ok = await exportBackup({ forceDownload: 'download' in b.dataset });
      if (ok) { toast('Backup saved'); render(el); }
    } else if ('undo' in b.dataset) {
      undoImport();
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

  homeCard() {
    const last = store.get('lastExport', null);
    return { value: '', label: last ? `Last backup ${ago(last)}` : 'Never backed up' };
  },

  // Υπενθύμιση στην Αρχική: έχεις δεδομένα αλλά όχι πρόσφατο backup
  homeBanner() {
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
