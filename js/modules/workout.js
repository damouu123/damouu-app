// Workout (ενότητα Fitness): καταγραφή προπόνησης με λογική παρόμοια με του Hevy.
//
// ΡΟΗ
//   Workout (καρτέλα)   ξεκινάς άδεια προπόνηση ή ένα routine σου
//   Καταγραφή           οθόνη που καλύπτει το app: ασκήσεις, σετ (kg × reps, ✓),
//                       διάρκεια, όγκος, χρονόμετρο ξεκούρασης. Με ⌄ την "κατεβάζεις"
//                       και μένει ένα κουμπί "Workout 12:34" για να γυρίσεις.
//   History (καρτέλα)   οι προπονήσεις που ολοκλήρωσες
//
// Η "Previous" στήλη δείχνει τι έκανες στο ίδιο σετ την τελευταία φορά.
// Πατώντας την, συμπληρώνονται kg και reps.
//
// ΧΡΟΝΟΣ: όπως στο Focus, κρατάμε timestamps (πότε ξεκίνησε, πότε τελειώνει η
// ξεκούραση), ώστε να μη χάνεται τίποτα αν κλείσεις το app ή κλειδώσεις το κινητό.
//
// Δεδομένα (moduleStore('workout')):
//   active    { id, name, startedAt, rest: { endsAt, total } | null,
//               exercises: [{ uid, exerciseId, rest, sets: [{ uid, type, kg, reps, done }] }] }
//   history   [{ id, name, startedAt, endedAt, exercises: [{ exerciseId, sets: [{ type, kg, reps }] }] }]
//   routines  [{ id, name, exercises: [{ exerciseId, sets, rest }] }]
//   custom    δικές σου ασκήσεις [{ id, name, equipment, muscle }]
//   type: 'normal' | 'warmup' | 'drop' | 'failure'

import { register } from '../core/registry.js';
import { moduleStore } from '../core/storage.js';
import { escapeHtml, icon, navigate, toast, openSheet, ask, refresh } from '../core/router.js';
import { chime, haptic } from '../core/feedback.js';
import { EXERCISES, MUSCLES } from '../../data/exercises.js';

const store = moduleStore('workout');

const REST_OPTIONS = [0, 30, 60, 90, 120, 180, 240];
const DEFAULT_REST = 90; // δευτερόλεπτα
const DEFAULT_SETS = 3;
const SET_TYPES = {
  normal: { label: 'Normal set', short: '' },
  warmup: { label: 'Warm-up set', short: 'W' },
  drop: { label: 'Drop set', short: 'D' },
  failure: { label: 'Failure set', short: 'F' },
};

const ICONS = {
  dumbbell: '<path d="M3 9.5v5M6 7v10M18 7v10M21 9.5v5M6 12h12"/>',
  history: '<path d="M3.5 12a8.5 8.5 0 1 0 2.5-6M3.5 4v4h4M12 7.5V12l3 2"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  dots: '<circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  timer: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 9.5v4l2.5 2M9.5 2.5h5"/>',
};

// ===================== Βοηθητικά =====================

const uid = () => Math.random().toString(36).slice(2, 10);
const allExercises = () => [...EXERCISES, ...store.get('custom', [])];
const exById = (id) => allExercises().find((e) => e.id === id) || { id, name: 'Unknown exercise', equipment: '', muscle: '' };
const exTitle = (e) => (e.equipment && e.equipment !== 'Bodyweight' ? `${e.name} (${e.equipment})` : e.name);

const num = (v) => {
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
const fmtKg = (n) => (n === null || n === undefined ? '' : String(Math.round(n * 100) / 100));
const fmtVolume = (kg) => `${Math.round(kg).toLocaleString('en-GB')} kg`;
// Σύντομα, για μικρά κουτάκια: "960 kg", "12.4 t"
const shortVolume = (kg) => (kg < 1000 ? `${Math.round(kg)} kg` : `${Math.round(kg / 100) / 10} t`);

// Διάρκεια: "12:34" ή "1:02:34" (ζωντανά), "1h 2m" (σύνοψη)
function clockText(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
function durationText(ms) {
  const min = Math.max(1, Math.round(ms / 60000));
  return min >= 60 ? `${Math.floor(min / 60)}h ${min % 60}m` : `${min} min`;
}

// Όγκος: kg × reps των σετ (μόνο των ολοκληρωμένων, αν onlyDone)
function volumeOf(exercises, onlyDone = false) {
  let v = 0;
  for (const ex of exercises) for (const s of ex.sets) if (!onlyDone || s.done) v += (num(s.kg) || 0) * (num(s.reps) || 0);
  return v;
}
const setsCount = (exercises, onlyDone = false) => exercises.reduce((n, ex) => n + ex.sets.filter((s) => !onlyDone || s.done).length, 0);

function defaultName(ts = Date.now()) {
  const h = new Date(ts).getHours();
  return h < 12 ? 'Morning Workout' : h < 17 ? 'Afternoon Workout' : 'Evening Workout';
}

const getHistory = () => store.get('history', []);
const getRoutines = () => store.get('routines', []);
const getActive = () => store.get('active', null);
const saveActive = (a) => store.set('active', a);

// Τα σετ της τελευταίας φοράς που έκανες αυτή την άσκηση
function previousSets(exerciseId) {
  const hist = getHistory();
  for (let i = hist.length - 1; i >= 0; i--) {
    const ex = hist[i].exercises.find((e) => e.exerciseId === exerciseId);
    if (ex) return ex.sets;
  }
  return [];
}

// Καλύτερο σετ (μεγαλύτερο βάρος, μετά περισσότερα reps)
function bestSet(sets) {
  return sets.reduce((best, s) => {
    const kg = num(s.kg) || 0;
    const reps = num(s.reps) || 0;
    if (!best || kg > best.kg || (kg === best.kg && reps > best.reps)) return { kg, reps };
    return best;
  }, null);
}
const setText = (s) => (s ? (s.kg ? `${fmtKg(s.kg)} kg × ${s.reps}` : `${s.reps} reps`) : '');

// ===================== Ξεκίνημα / τέλος προπόνησης =====================

const newSet = (type = 'normal') => ({ uid: uid(), type, kg: '', reps: '', done: false });
const newExercise = (exerciseId, sets = 1, rest = DEFAULT_REST) => ({
  uid: uid(), exerciseId, rest, sets: Array.from({ length: Math.max(1, sets) }, () => newSet()),
});

async function startWorkout(routine = null) {
  if (getActive()) {
    const yes = await ask({
      title: 'You have a workout in progress',
      text: 'Discard it and start a new one?',
      confirmLabel: 'Discard and start',
      cancelLabel: 'Keep it',
    });
    if (!yes) { openLog(); return; }
  }
  const now = Date.now();
  saveActive({
    id: uid(),
    name: routine ? routine.name : defaultName(now),
    startedAt: now,
    rest: null,
    exercises: routine ? routine.exercises.map((e) => newExercise(e.exerciseId, e.sets, e.rest ?? DEFAULT_REST)) : [],
  });
  haptic();
  openLog();
}

async function finishWorkout() {
  const a = getActive();
  if (!a) return;
  const done = setsCount(a.exercises, true);
  if (!done) {
    toast('Complete at least one set first');
    return;
  }
  const unfinished = setsCount(a.exercises) - done;
  const yes = await ask({
    title: 'Finish workout?',
    text: unfinished ? `${unfinished} unfinished ${unfinished === 1 ? 'set' : 'sets'} will be removed.` : 'Your workout will be saved to History.',
    confirmLabel: 'Finish',
    danger: false,
  });
  if (!yes) return;

  // Ρεκόρ: σετ με βάρος μεγαλύτερο από κάθε προηγούμενη φορά της ίδιας άσκησης
  const records = [];
  const saved = {
    id: a.id,
    name: a.name.trim() || defaultName(a.startedAt),
    startedAt: a.startedAt,
    endedAt: Date.now(),
    exercises: a.exercises
      .map((ex) => ({
        exerciseId: ex.exerciseId,
        sets: ex.sets.filter((s) => s.done).map((s) => ({ type: s.type, kg: num(s.kg) || 0, reps: num(s.reps) || 0 })),
      }))
      .filter((ex) => ex.sets.length),
  };
  for (const ex of saved.exercises) {
    const before = getHistory().flatMap((w) => w.exercises.filter((e) => e.exerciseId === ex.exerciseId).flatMap((e) => e.sets));
    const prevBest = before.length ? Math.max(...before.map((s) => s.kg || 0)) : null;
    const now = Math.max(...ex.sets.map((s) => s.kg || 0));
    if (prevBest !== null && now > prevBest) records.push(exTitle(exById(ex.exerciseId)));
  }

  store.update('history', (list) => [...list, saved], []);
  store.remove('active');
  closeLog();
  chime();
  showSummary(saved, records);
  refresh();
}

async function discardWorkout() {
  const yes = await ask({ title: 'Discard workout?', text: 'Everything you logged in this workout will be lost.', confirmLabel: 'Discard' });
  if (!yes) return;
  store.remove('active');
  closeLog();
  toast('Workout discarded');
  refresh();
}

function showSummary(w, records) {
  openSheet(`
    <div class="wk-summary">
      <span class="wk-summary-badge">${icon(ICONS.check)}</span>
      <h2>Workout complete</h2>
      <p class="muted">${escapeHtml(w.name)}</p>
      <div class="wk-stats">
        <div><strong>${durationText(w.endedAt - w.startedAt)}</strong><span>Duration</span></div>
        <div><strong>${fmtVolume(volumeOf(w.exercises))}</strong><span>Volume</span></div>
        <div><strong>${setsCount(w.exercises)}</strong><span>Sets</span></div>
      </div>
      ${records.length ? `<p class="wk-records">New best: ${records.map(escapeHtml).join(', ')}</p>` : ''}
    </div>
    <div class="stack"><button class="btn btn-block" data-close>Done</button></div>`,
  (root, close) => root.querySelector('[data-close]').addEventListener('click', close));
}

// ===================== Οθόνη καταγραφής (καλύπτει το app) =====================

let log = null;     // το στοιχείο της οθόνης
let pill = null;    // το κουμπί "Workout 12:34" όταν είναι κατεβασμένη
let ticker = null;

function ensureTicker() {
  clearInterval(ticker);
  ticker = getActive() ? setInterval(tick, 500) : null;
}

function openLog() {
  if (!log) {
    log = document.createElement('div');
    log.className = 'wk-log';
    log.setAttribute('role', 'dialog');
    log.setAttribute('aria-modal', 'true');
    log.setAttribute('aria-label', 'Log workout');
    document.body.appendChild(log);
    bindLog();
  }
  renderLog();
  log.hidden = false;
  void log.offsetWidth;
  log.classList.add('open');
  document.body.classList.add('wk-locked');
  updatePill();
  ensureTicker();
}

function closeLog() {
  if (!log) { updatePill(); return; }
  log.classList.remove('open');
  document.body.classList.remove('wk-locked');
  setTimeout(() => { if (log && !log.classList.contains('open')) log.hidden = true; }, 420);
  updatePill();
  ensureTicker();
}

const logOpen = () => !!(log && log.classList.contains('open'));

function setRowHtml(ex, set, si, prev) {
  const p = prev[si];
  // Αρίθμηση: μόνο τα κανονικά/failure σετ παίρνουν αριθμό
  const n = ex.sets.slice(0, si + 1).filter((s) => s.type === 'normal' || s.type === 'failure').length;
  const label = SET_TYPES[set.type].short || String(n);
  return `
    <div class="wk-set ${set.done ? 'done' : ''}" data-set="${set.uid}">
      <button class="wk-type t-${set.type}" data-act="type" aria-label="Set ${label}, ${SET_TYPES[set.type].label}. Change type">${label}</button>
      <button class="wk-prev" data-act="prev" ${p ? '' : 'disabled'} aria-label="${p ? `Previous: ${setText(p)}. Use it` : 'No previous'}">${p ? setText(p) : '—'}</button>
      <input class="wk-in" data-field="kg" inputmode="decimal" enterkeyhint="next" aria-label="kg" value="${escapeHtml(fmtKg(num(set.kg)))}" placeholder="${p ? fmtKg(p.kg) : ''}">
      <input class="wk-in" data-field="reps" inputmode="numeric" enterkeyhint="done" aria-label="reps" value="${escapeHtml(fmtKg(num(set.reps)))}" placeholder="${p ? p.reps : ''}">
      <button class="wk-check" data-act="done" aria-pressed="${set.done}" aria-label="${set.done ? 'Set done. Undo' : 'Mark set done'}">${icon(ICONS.check)}</button>
    </div>`;
}

function exerciseHtml(ex) {
  const e = exById(ex.exerciseId);
  const prev = previousSets(ex.exerciseId);
  return `
    <section class="wk-ex" data-ex="${ex.uid}">
      <header class="wk-ex-head">
        <div>
          <h3>${escapeHtml(exTitle(e))}</h3>
          <button class="wk-rest-chip" data-act="rest">${icon(ICONS.timer)} Rest: ${ex.rest ? `${Math.floor(ex.rest / 60)}:${String(ex.rest % 60).padStart(2, '0')}` : 'Off'}</button>
        </div>
        <button class="wk-icon-btn" data-act="ex-menu" aria-label="Exercise options">${icon(ICONS.dots)}</button>
      </header>
      <div class="wk-sets">
        <div class="wk-set wk-set-head" aria-hidden="true"><span>Set</span><span>Previous</span><span>kg</span><span>Reps</span><span>${icon(ICONS.check)}</span></div>
        ${ex.sets.map((s, i) => setRowHtml(ex, s, i, prev)).join('')}
      </div>
      <button class="wk-add-set" data-act="add-set">${icon(ICONS.plus)} Add Set</button>
    </section>`;
}

function renderLog() {
  const a = getActive();
  if (!a || !log) return;
  log.innerHTML = `
    <header class="wk-log-head">
      <button class="wk-icon-btn" data-act="minimize" aria-label="Minimize workout">${icon(ICONS.down)}</button>
      <span class="wk-log-title">Log Workout</span>
      <button class="btn btn-small wk-finish" data-act="finish">Finish</button>
    </header>
    <div class="wk-log-body">
      <input class="wk-name" data-act="name" value="${escapeHtml(a.name)}" aria-label="Workout name">
      <div class="wk-live">
        <div><span>Duration</span><strong data-live="duration">${clockText(Date.now() - a.startedAt)}</strong></div>
        <div><span>Volume</span><strong data-live="volume">${fmtVolume(volumeOf(a.exercises, true))}</strong></div>
        <div><span>Sets</span><strong data-live="sets">${setsCount(a.exercises, true)}</strong></div>
      </div>
      ${a.exercises.length ? a.exercises.map(exerciseHtml).join('') : `
        <div class="wk-empty">
          <span class="section-empty-icon">${icon(ICONS.dumbbell)}</span>
          <p><strong>Get started</strong></p>
          <p class="muted">Add an exercise to start your workout.</p>
        </div>`}
      <button class="btn btn-block" data-act="add-exercise">${icon(ICONS.plus)} Add Exercise</button>
      <button class="btn btn-quiet btn-block wk-discard" data-act="discard">Discard Workout</button>
    </div>
    <div class="wk-rest" data-live="rest" hidden>
      <button class="wk-rest-btn" data-act="rest-minus">−15</button>
      <div class="wk-rest-mid"><strong data-live="rest-time">0:00</strong><span class="wk-rest-bar"><i data-live="rest-bar"></i></span></div>
      <button class="wk-rest-btn" data-act="rest-plus">+15</button>
      <button class="wk-rest-btn wk-rest-skip" data-act="rest-skip">Skip</button>
    </div>`;
  tick();
}

// Ενημέρωση των "ζωντανών" αριθμών χωρίς να ξαναφτιαχτεί η οθόνη
function updateLive() {
  const a = getActive();
  if (!a || !log) return;
  const set = (k, v) => { const el = log.querySelector(`[data-live="${k}"]`); if (el) el.textContent = v; };
  set('volume', fmtVolume(volumeOf(a.exercises, true)));
  set('sets', String(setsCount(a.exercises, true)));
}

function tick() {
  const a = getActive();
  if (!a) { ensureTicker(); return; }
  const now = Date.now();
  if (pill && !pill.hidden) pill.querySelector('[data-live="pill-time"]').textContent = clockText(now - a.startedAt);
  // Η ξεκούραση τελείωσε (ακόμα κι αν η οθόνη είναι κατεβασμένη)
  if (a.rest && now >= a.rest.endsAt) {
    a.rest = null;
    saveActive(a);
    if (!document.hidden) { chime(); haptic(); toast('Rest is over'); }
  }
  if (!log || !logOpen()) return;
  const d = log.querySelector('[data-live="duration"]');
  if (d) d.textContent = clockText(now - a.startedAt);
  const bar = log.querySelector('[data-live="rest"]');
  if (!bar) return;
  bar.hidden = !a.rest;
  if (a.rest) {
    const left = a.rest.endsAt - now;
    bar.querySelector('[data-live="rest-time"]').textContent = clockText(left + 999);
    bar.querySelector('[data-live="rest-bar"]').style.width = `${Math.max(0, Math.min(100, (left / (a.rest.total * 1000)) * 100))}%`;
  }
}

// Βρίσκει άσκηση/σετ από ένα στοιχείο της οθόνης
function locate(a, el) {
  const exEl = el.closest('[data-ex]');
  const ex = exEl ? a.exercises.find((x) => x.uid === exEl.dataset.ex) : null;
  const setEl = el.closest('[data-set]');
  const set = ex && setEl ? ex.sets.find((s) => s.uid === setEl.dataset.set) : null;
  return { ex, set, setEl };
}

function bindLog() {
  // Πληκτρολόγηση kg/reps: αποθήκευση χωρίς να ξαναφτιαχτεί η οθόνη (ώστε να μη φεύγει το πληκτρολόγιο)
  log.addEventListener('input', (ev) => {
    const a = getActive();
    if (!a) return;
    if (ev.target.dataset.act === 'name') { a.name = ev.target.value; saveActive(a); return; }
    const field = ev.target.dataset.field;
    if (!field) return;
    const { set } = locate(a, ev.target);
    if (!set) return;
    set[field] = ev.target.value;
    saveActive(a);
    updateLive();
  });
  log.addEventListener('focusin', (ev) => { if (ev.target.classList.contains('wk-in')) ev.target.select(); });

  log.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-act]');
    if (!b || b.dataset.act === 'name') return;
    const a = getActive();
    if (!a) return;
    const { ex, set, setEl } = locate(a, b);
    const act = b.dataset.act;

    if (act === 'minimize') { closeLog(); return; }
    if (act === 'finish') { finishWorkout(); return; }
    if (act === 'discard') { discardWorkout(); return; }
    if (act === 'add-exercise') { pickExercises((ids) => { const cur = getActive(); ids.forEach((id) => cur.exercises.push(newExercise(id, 1))); saveActive(cur); renderLog(); }); return; }

    if (act === 'rest-skip' || act === 'rest-minus' || act === 'rest-plus') {
      if (!a.rest) return;
      if (act === 'rest-skip') a.rest = null;
      else {
        const delta = act === 'rest-plus' ? 15000 : -15000;
        a.rest.endsAt += delta;
        a.rest.total = Math.max(1, a.rest.total + delta / 1000);
        if (a.rest.endsAt <= Date.now()) a.rest = null;
      }
      saveActive(a);
      tick();
      return;
    }

    if (!ex) return;
    if (act === 'add-set') {
      const last = ex.sets[ex.sets.length - 1];
      // Το νέο σετ ξεκινά με τα kg/reps του προηγούμενου (όπως στο Hevy)
      ex.sets.push({ ...newSet(), kg: last ? last.kg : '', reps: last ? last.reps : '' });
      saveActive(a);
      renderLog();
      return;
    }
    if (act === 'rest') { chooseRest(ex); return; }
    if (act === 'ex-menu') { exerciseMenu(ex); return; }

    if (!set) return;
    if (act === 'prev') {
      const p = previousSets(ex.exerciseId)[ex.sets.indexOf(set)];
      if (!p) return;
      set.kg = String(p.kg || '');
      set.reps = String(p.reps || '');
      saveActive(a);
      setEl.querySelector('[data-field="kg"]').value = fmtKg(p.kg);
      setEl.querySelector('[data-field="reps"]').value = p.reps;
      updateLive();
      return;
    }
    if (act === 'type') { setTypeMenu(ex, set); return; }
    if (act === 'done') {
      if (!set.done) {
        // Κενά πεδία: παίρνουν την τιμή της προηγούμενης φοράς (το "γκρι" νούμερο)
        const p = previousSets(ex.exerciseId)[ex.sets.indexOf(set)];
        if (set.kg === '' && p) set.kg = String(p.kg || '');
        if (set.reps === '' && p) set.reps = String(p.reps || '');
        if (!num(set.reps)) { toast('Enter the reps first'); return; }
        set.done = true;
        haptic();
        if (ex.rest) a.rest = { endsAt: Date.now() + ex.rest * 1000, total: ex.rest };
      } else {
        set.done = false;
      }
      saveActive(a);
      // Μόνο αυτή η γραμμή αλλάζει (με κίνηση), όχι όλη η οθόνη
      const prev = previousSets(ex.exerciseId);
      setEl.outerHTML = setRowHtml(ex, set, ex.sets.indexOf(set), prev);
      const row = log.querySelector(`[data-set="${set.uid}"]`);
      if (set.done && row) row.classList.add('pop');
      updateLive();
      tick();
    }
  });
}

function chooseRest(ex) {
  openSheet(`
    <h2>Rest timer</h2>
    <p class="muted">${escapeHtml(exTitle(exById(ex.exerciseId)))}. Starts when you complete a set.</p>
    <div class="chips wk-rest-options">${REST_OPTIONS.map((s) => `
      <button class="chip ${ex.rest === s ? 'selected' : ''}" data-rest="${s}">${s ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : 'Off'}</button>`).join('')}
    </div>`,
  (root, close) => root.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-rest]');
    if (!b) return;
    const a = getActive();
    const cur = a && a.exercises.find((x) => x.uid === ex.uid);
    if (cur) { cur.rest = Number(b.dataset.rest); saveActive(a); renderLog(); }
    close();
  }));
}

function setTypeMenu(ex, set) {
  openSheet(`
    <h2>Set type</h2>
    <div class="stack wk-menu">
      ${Object.entries(SET_TYPES).map(([id, t]) => `
        <button class="btn btn-quiet btn-block ${set.type === id ? 'selected' : ''}" data-type="${id}">
          <span class="wk-type t-${id}">${t.short || '1'}</span> ${t.label}</button>`).join('')}
      <button class="btn btn-danger btn-block" data-remove>Remove set</button>
    </div>`,
  (root, close) => root.addEventListener('click', (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    const a = getActive();
    const cur = a && a.exercises.find((x) => x.uid === ex.uid);
    const s = cur && cur.sets.find((x) => x.uid === set.uid);
    if (!s) { close(); return; }
    if ('remove' in b.dataset) cur.sets = cur.sets.filter((x) => x.uid !== set.uid);
    else if (b.dataset.type) s.type = b.dataset.type;
    if (!cur.sets.length) a.exercises = a.exercises.filter((x) => x.uid !== cur.uid);
    saveActive(a);
    renderLog();
    close();
  }));
}

function exerciseMenu(ex) {
  const a = getActive();
  const i = a.exercises.findIndex((x) => x.uid === ex.uid);
  openSheet(`
    <h2>${escapeHtml(exTitle(exById(ex.exerciseId)))}</h2>
    <div class="stack wk-menu">
      <button class="btn btn-quiet btn-block" data-move="-1" ${i === 0 ? 'disabled' : ''}>Move up</button>
      <button class="btn btn-quiet btn-block" data-move="1" ${i === a.exercises.length - 1 ? 'disabled' : ''}>Move down</button>
      <button class="btn btn-quiet btn-block" data-replace>Replace exercise</button>
      <button class="btn btn-danger btn-block" data-remove>Remove exercise</button>
    </div>`,
  (root, close) => root.addEventListener('click', (ev) => {
    const b = ev.target.closest('button');
    if (!b || b.disabled) return;
    const cur = getActive();
    const idx = cur.exercises.findIndex((x) => x.uid === ex.uid);
    if (idx < 0) { close(); return; }
    if (b.dataset.move) {
      const j = idx + Number(b.dataset.move);
      [cur.exercises[idx], cur.exercises[j]] = [cur.exercises[j], cur.exercises[idx]];
    } else if ('remove' in b.dataset) {
      cur.exercises.splice(idx, 1);
    } else if ('replace' in b.dataset) {
      close();
      pickExercises((ids) => {
        const c = getActive();
        const k = c.exercises.findIndex((x) => x.uid === ex.uid);
        if (k >= 0 && ids[0]) { c.exercises[k].exerciseId = ids[0]; saveActive(c); renderLog(); }
      }, { single: true });
      return;
    }
    saveActive(cur);
    renderLog();
    close();
  }));
}

// ===================== Επιλογή ασκήσεων =====================

// done(ids): οι ασκήσεις που διάλεξες. single: μόνο μία (π.χ. αντικατάσταση)
function pickExercises(done, { single = false } = {}) {
  const chosen = [];
  let muscle = 'All';
  let query = '';
  openSheet(`
    <h2>${single ? 'Replace exercise' : 'Add exercises'}</h2>
    <input class="wk-search" type="search" placeholder="Search exercise" aria-label="Search exercise" autocomplete="off">
    <div class="chips wk-muscles">${['All', ...MUSCLES].map((m) => `<button class="chip ${m === 'All' ? 'selected' : ''}" data-muscle="${m}">${m}</button>`).join('')}</div>
    <ul class="list wk-ex-list"></ul>
    <button class="link-btn centered" data-custom>Create custom exercise</button>
    <div class="stack"><button class="btn btn-block" data-add disabled>${single ? 'Choose an exercise' : 'Add exercises'}</button></div>`,
  (root, close) => {
    root.classList.add('wk-picker');
    const list = root.querySelector('.wk-ex-list');
    const addBtn = root.querySelector('[data-add]');
    const paint = () => {
      const q = query.trim().toLowerCase();
      const items = allExercises()
        .filter((e) => muscle === 'All' || e.muscle === muscle)
        .filter((e) => !q || exTitle(e).toLowerCase().includes(q))
        .sort((x, y) => exTitle(x).localeCompare(exTitle(y)));
      list.innerHTML = items.length ? items.map((e) => `
        <li><button class="row wk-pick ${chosen.includes(e.id) ? 'chosen' : ''}" data-pick="${e.id}">
          <span class="row-text"><span class="row-title">${escapeHtml(exTitle(e))}</span><span class="row-sub">${escapeHtml(e.muscle)}</span></span>
          <span class="wk-pick-mark">${chosen.includes(e.id) ? chosen.indexOf(e.id) + 1 : ''}</span>
        </button></li>`).join('') : '<li class="wk-none muted">No exercises found.</li>';
      if (!single) {
        addBtn.disabled = !chosen.length;
        addBtn.textContent = chosen.length ? `Add ${chosen.length} ${chosen.length === 1 ? 'exercise' : 'exercises'}` : 'Add exercises';
      }
    };
    paint();
    root.querySelector('.wk-search').addEventListener('input', (ev) => { query = ev.target.value; paint(); });
    root.addEventListener('click', (ev) => {
      const b = ev.target.closest('button');
      if (!b) return;
      if (b.dataset.muscle) {
        muscle = b.dataset.muscle;
        root.querySelectorAll('[data-muscle]').forEach((c) => c.classList.toggle('selected', c === b));
        paint();
      } else if (b.dataset.pick) {
        if (single) { close(); done([b.dataset.pick]); return; }
        const k = chosen.indexOf(b.dataset.pick);
        if (k >= 0) chosen.splice(k, 1); else chosen.push(b.dataset.pick);
        haptic();
        paint();
      } else if ('add' in b.dataset && chosen.length) {
        close();
        done(chosen.slice());
      } else if ('custom' in b.dataset) {
        close();
        createCustomExercise((id) => done([id]));
      }
    });
  });
}

function createCustomExercise(done) {
  openSheet(`
    <h2>Custom exercise</h2>
    <form class="form wk-custom">
      <label class="field"><span>Name</span><input name="name" required maxlength="60" autocomplete="off"></label>
      <label class="field"><span>Equipment</span>
        <select name="equipment">${['Barbell', 'Dumbbell', 'Machine', 'Cable', 'Bodyweight', 'Other'].map((e) => `<option>${e}</option>`).join('')}</select></label>
      <label class="field"><span>Muscle</span>
        <select name="muscle">${MUSCLES.map((m) => `<option>${m}</option>`).join('')}</select></label>
      <button class="btn btn-block" type="submit">Save</button>
    </form>`,
  (root, close) => root.querySelector('form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const f = new FormData(ev.target);
    const name = String(f.get('name')).trim();
    if (!name) return;
    const ex = { id: `custom-${uid()}`, name, equipment: String(f.get('equipment')), muscle: String(f.get('muscle')) };
    store.update('custom', (list) => [...list, ex], []);
    close();
    done(ex.id);
  }));
}

// ===================== Κουμπί "Workout 12:34" (όταν η καταγραφή είναι κατεβασμένη) =====================

function updatePill() {
  const a = getActive();
  const show = !!a && !logOpen();
  if (!pill && show) {
    pill = document.createElement('button');
    pill.className = 'wk-pill';
    pill.innerHTML = `${icon(ICONS.dumbbell)}<span><strong>Workout</strong> <span data-live="pill-time"></span></span><span class="wk-pill-go">Resume</span>`;
    pill.addEventListener('click', openLog);
    document.body.appendChild(pill);
  }
  if (pill) {
    pill.hidden = !show;
    if (show) pill.querySelector('[data-live="pill-time"]').textContent = clockText(Date.now() - a.startedAt);
  }
}

// ===================== Καρτέλα Workout =====================

const routineCard = (r) => `
  <li class="wk-routine">
    <button class="wk-routine-main" data-edit="${r.id}">
      <strong>${escapeHtml(r.name)}</strong>
      <span class="muted">${escapeHtml(r.exercises.map((e) => exById(e.exerciseId).name).join(', ') || 'No exercises')}</span>
    </button>
    <button class="btn btn-small wk-start-routine" data-start="${r.id}" ${r.exercises.length ? '' : 'disabled'}>Start Routine</button>
  </li>`;

function renderHome(el) {
  const a = getActive();
  const weekAgo = Date.now() - 7 * 86400000;
  const week = getHistory().filter((w) => w.startedAt >= weekAgo);
  const weekTime = week.reduce((t, w) => t + (w.endedAt - w.startedAt), 0);
  const routines = getRoutines();
  el.innerHTML = `
    ${a ? `
      <div class="banner banner-flow wk-progress" role="status">
        <div class="banner-body">
          <p class="banner-title">Workout in progress</p>
          <p class="banner-text">${escapeHtml(a.name)}</p>
        </div>
        <button class="btn btn-small" data-resume>Resume</button>
      </div>` : ''}

    <h2 class="section-title first">Quick start</h2>
    <button class="btn btn-block wk-start" data-empty>${icon(ICONS.plus)} Start Empty Workout</button>

    <div class="wk-section-head">
      <h2 class="section-title">Routines</h2>
      <button class="btn btn-small btn-quiet" data-new-routine>${icon(ICONS.plus)} New</button>
    </div>
    ${routines.length
      ? `<ul class="wk-routines">${routines.map(routineCard).join('')}</ul>`
      : '<p class="muted small-print">Save the workouts you repeat (e.g. Push, Pull, Legs) and start them in one tap.</p>'}

    <h2 class="section-title">Last 7 days</h2>
    <div class="stats stats-3">
      <div class="stat"><strong>${week.length}</strong><span>Workouts</span></div>
      <div class="stat"><strong>${weekTime ? durationText(weekTime) : '0 min'}</strong><span>Time</span></div>
      <div class="stat"><strong>${shortVolume(week.reduce((v, w) => v + volumeOf(w.exercises), 0))}</strong><span>Volume</span></div>
    </div>`;

  el.onclick = (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    if ('resume' in b.dataset) openLog();
    else if ('empty' in b.dataset) startWorkout();
    else if ('newRoutine' in b.dataset) navigate('fitness/routine/new');
    else if (b.dataset.edit) navigate(`fitness/routine/${b.dataset.edit}`);
    else if (b.dataset.start) {
      const r = getRoutines().find((x) => x.id === b.dataset.start);
      if (r) startWorkout(r);
    }
  };
}

// ===================== Routine: δημιουργία / αλλαγή =====================

let draft = null; // το routine που επεξεργάζεσαι: { key, isNew, id, name, exercises }

function renderRoutine(el, id) {
  // Νέο πρόχειρο μόνο όταν ανοίγεις άλλο routine (όχι σε κάθε ξαναζωγράφισμα)
  if (!draft || draft.key !== id) {
    const found = getRoutines().find((r) => r.id === id);
    draft = found
      ? { ...JSON.parse(JSON.stringify(found)), key: id, isNew: false }
      : { key: id, isNew: true, id: uid(), name: '', exercises: [] };
  }
  el.innerHTML = `
    <label class="field"><span>Routine name</span>
      <input class="wk-routine-name" value="${escapeHtml(draft.name)}" placeholder="e.g. Push day" maxlength="40"></label>
    <ul class="list wk-routine-list">
      ${draft.exercises.map((e, i) => `
        <li><div class="row row-static">
          <span class="row-text"><span class="row-title">${escapeHtml(exTitle(exById(e.exerciseId)))}</span>
            <span class="row-sub">${e.sets} ${e.sets === 1 ? 'set' : 'sets'}</span></span>
          <span class="wk-stepper">
            <button class="icon-btn" data-sets="${i}:-1" aria-label="Fewer sets">−</button>
            <button class="icon-btn" data-sets="${i}:1" aria-label="More sets">+</button>
          </span>
          <button class="wk-icon-btn" data-remove="${i}" aria-label="Remove exercise">×</button>
        </div></li>`).join('') || '<li class="wk-none muted">No exercises yet.</li>'}
    </ul>
    <button class="btn btn-quiet btn-block" data-add>${icon(ICONS.plus)} Add exercises</button>
    <div class="stack">
      <button class="btn btn-block" data-save>Save routine</button>
      ${draft.isNew ? '' : '<button class="btn btn-danger btn-block" data-delete>Delete routine</button>'}
    </div>`;

  el.querySelector('.wk-routine-name').addEventListener('input', (ev) => { draft.name = ev.target.value; });
  el.onclick = async (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.dataset.sets) {
      const [i, d] = b.dataset.sets.split(':').map(Number);
      draft.exercises[i].sets = Math.min(10, Math.max(1, draft.exercises[i].sets + d));
      renderRoutine(el, id);
    } else if (b.dataset.remove) {
      draft.exercises.splice(Number(b.dataset.remove), 1);
      renderRoutine(el, id);
    } else if ('add' in b.dataset) {
      pickExercises((ids) => {
        ids.forEach((exerciseId) => draft.exercises.push({ exerciseId, sets: DEFAULT_SETS, rest: DEFAULT_REST }));
        renderRoutine(el, id);
      });
    } else if ('save' in b.dataset) {
      if (!draft.name.trim()) { toast('Give the routine a name'); return; }
      if (!draft.exercises.length) { toast('Add at least one exercise'); return; }
      const { isNew, key, ...clean } = draft;
      clean.name = clean.name.trim();
      store.update('routines', (list) => (isNew ? [...list, clean] : list.map((r) => (r.id === clean.id ? clean : r))), []);
      draft = null;
      toast('Routine saved');
      navigate('fitness');
    } else if ('delete' in b.dataset) {
      const yes = await ask({ title: 'Delete routine?', text: `"${draft.name}" will be deleted. Your past workouts stay in History.`, confirmLabel: 'Delete' });
      if (!yes) return;
      store.update('routines', (list) => list.filter((r) => r.id !== draft.id), []);
      draft = null;
      toast('Routine deleted');
      navigate('fitness');
    }
  };
}

// ===================== Καρτέλα History =====================

const dayText = (ts) => new Date(ts).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

function workoutCard(w) {
  return `
    <li><button class="wk-hist" data-open="${w.id}">
      <span class="wk-hist-top"><strong>${escapeHtml(w.name)}</strong><span class="muted">${dayText(w.startedAt)}</span></span>
      <span class="wk-hist-stats">
        <span>${icon(ICONS.timer)} ${durationText(w.endedAt - w.startedAt)}</span>
        <span>${fmtVolume(volumeOf(w.exercises))}</span>
        <span>${setsCount(w.exercises)} sets</span>
      </span>
      <span class="wk-hist-ex">${w.exercises.map((e) => `
        <span><span class="muted">${e.sets.length} ×</span> ${escapeHtml(exTitle(exById(e.exerciseId)))}<span class="muted wk-best">${setText(bestSet(e.sets))}</span></span>`).join('')}
      </span>
    </button></li>`;
}

function renderHistory(el, params) {
  if (params[0]) { renderWorkout(el, params[0]); return; }
  const hist = getHistory().slice().reverse();
  el.innerHTML = hist.length
    ? `<ul class="wk-hist-list">${hist.map(workoutCard).join('')}</ul>`
    : `<div class="section-empty"><span class="section-empty-icon">${icon(ICONS.history)}</span>
        <p class="muted">Your finished workouts will show up here.</p></div>`;
  el.onclick = (ev) => {
    const b = ev.target.closest('[data-open]');
    if (b) navigate(`workouts/${b.dataset.open}`);
  };
}

function renderWorkout(el, id) {
  const w = getHistory().find((x) => x.id === id);
  if (!w) { el.innerHTML = '<p class="muted">This workout no longer exists.</p>'; return; }
  el.innerHTML = `
    <p class="subhead">${dayText(w.startedAt)}</p>
    <h2 class="section-title first">${escapeHtml(w.name)}</h2>
    <div class="stats stats-3">
      <div class="stat"><strong>${durationText(w.endedAt - w.startedAt)}</strong><span>Duration</span></div>
      <div class="stat"><strong>${fmtVolume(volumeOf(w.exercises)).replace(' kg', '')}</strong><span>Volume (kg)</span></div>
      <div class="stat"><strong>${setsCount(w.exercises)}</strong><span>Sets</span></div>
    </div>
    ${w.exercises.map((e) => {
      let n = 0;
      return `
      <h2 class="section-title">${escapeHtml(exTitle(exById(e.exerciseId)))}</h2>
      <ul class="list compact-list">${e.sets.map((s) => {
        const label = SET_TYPES[s.type]?.short || String(++n);
        return `<li><div class="row row-compact row-static">
          <span class="wk-type t-${s.type}">${label}</span>
          <span class="row-title">${setText(s)}</span>
        </div></li>`;
      }).join('')}</ul>`;
    }).join('')}
    <div class="stack">
      <button class="btn btn-quiet btn-block" data-routine>Save as routine</button>
      <button class="btn btn-danger btn-block" data-delete>Delete workout</button>
    </div>`;
  el.onclick = async (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    if ('routine' in b.dataset) {
      const r = { id: uid(), name: w.name, exercises: w.exercises.map((e) => ({ exerciseId: e.exerciseId, sets: e.sets.length, rest: DEFAULT_REST })) };
      store.update('routines', (list) => [...list, r], []);
      toast('Saved as routine');
    } else if ('delete' in b.dataset) {
      const yes = await ask({ title: 'Delete workout?', text: 'It will be removed from your history.', confirmLabel: 'Delete' });
      if (!yes) return;
      store.update('history', (list) => list.filter((x) => x.id !== w.id), []);
      toast('Workout deleted');
      navigate('workouts');
    }
  };
}

// ===================== Καταχώρηση =====================

register({
  id: 'fitness',
  title: 'Workout',
  icon: ICONS.dumbbell,
  order: 80,
  section: 'fitness',
  sectionHome: true, // η πρώτη καρτέλα του Fitness
  home: false,
  render(el, params = []) {
    if (params[0] === 'routine' && params[1]) renderRoutine(el, params[1]);
    else renderHome(el);
  },
  unmount() { draft = null; },
});

register({
  id: 'workouts',
  title: 'History',
  icon: ICONS.history,
  order: 81,
  section: 'fitness',
  nav: true, // καρτέλα στην κάτω μπάρα του Fitness
  home: false,
  render: renderHistory,
});

// Αν το app άνοιξε με προπόνηση σε εξέλιξη: το κουμπί "Workout 12:34" για να γυρίσεις
updatePill();
ensureTicker();
document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
