// Fitness: οι σελίδες της ενότητας, με τη δομή του Hevy (η καταγραφή είναι στο workout.js).
//
// ΚΑΡΤΕΛΕΣ
//   Home     οι προπονήσεις σου, η πιο πρόσφατη πρώτη (#/fitness, #/fitness/w/<id>)
//   Workout  Start Empty Workout και τα routines σου (#/workout, #/workout/routine/<id|new>)
//   Profile  σύνολα, γράφημα (7 μέρες / μήνας / 3 μήνες) και Dashboard: Statistics, Exercises,
//            Measures, Calendar (#/profile, #/profile/<σελίδα>), και από κάτω αναλυτικό
//            ιστορικό: κάθε προπόνηση με όλα τα σετ (κιλά × επαναλήψεις)
//
// Δεδομένα: όσα του workout.js (moduleStore('workout')) και
//   measures  [{ date: "2026-10-16", weight: 78.5 }]  το βάρος σου

import { register } from '../core/registry.js';
import { moduleStore } from '../core/storage.js';
import { escapeHtml, icon, navigate, toast, openSheet, ask, setTitle } from '../core/router.js';
import { MUSCLES } from '../../data/exercises.js';
import {
  ICONS, SET_TYPES, DEFAULT_REST, DEFAULT_SETS,
  uid, allExercises, exById, exTitle, fmtKg, fmtVolume, durationText, volumeOf, setsCount,
  bestSet, setText, getHistory, getRoutines, getActive, startWorkout, openLog, pickExercises,
  restSheet, restText,
} from './workout.js';

const store = moduleStore('workout');

const MORE_ICONS = {
  home: '<path d="M4 11.5 12 5l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-3.5v-5.5h-6v5.5H5.5A1.5 1.5 0 0 1 4 19z"/>',
  user: '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20c1.2-3.6 4-5.3 7.5-5.3s6.3 1.7 7.5 5.3"/>',
  chart: '<path d="M4 20V4M4 20h16M7.5 15l4-4.5 3 3L20 8"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  measure: '<circle cx="12" cy="5" r="2"/><path d="M7 9.5h10M12 9.5v5.5M9.5 21l2.5-6 2.5 6"/>',
  routine: '<rect x="5" y="4" width="14" height="17" rx="2.5"/><path d="M9 4.5V3h6v1.5M8.5 10h7M8.5 14h7"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.4-4.4"/>',
  medal: '<circle cx="12" cy="14.5" r="5"/><path d="m9 9.8-3-6.3h4l2 4M15 9.8l3-6.3h-4l-2 4"/>',
  caret: '<path d="m7 9.5 5 5 5-5"/>',
};

// Έτοιμα routines για το "Explore" (μπαίνουν στα δικά σου με ένα πάτημα)
const TEMPLATES = [
  { name: 'Push', exercises: ['bench-bb', 'shoulder-press-db', 'incline-bench-db', 'lateral-raise-db', 'pushdown'] },
  { name: 'Pull', exercises: ['deadlift-bb', 'lat-pulldown', 'row-bb', 'face-pull', 'curl-db'] },
  { name: 'Legs', exercises: ['squat-bb', 'rdl-bb', 'leg-press', 'leg-curl-seated', 'calf-raise'] },
  { name: 'Upper', exercises: ['bench-bb', 'row-bb', 'shoulder-press-db', 'lat-pulldown', 'curl-db', 'pushdown'] },
  { name: 'Lower', exercises: ['squat-bb', 'rdl-bb', 'leg-extension', 'leg-curl-lying', 'calf-raise'] },
  { name: 'Full Body', exercises: ['squat-bb', 'bench-bb', 'row-bb', 'shoulder-press-db', 'leg-curl-seated', 'crunch'] },
];

const DAY = 86400000;
const dateKey = (d) => new Date(d).toLocaleDateString('sv'); // "2026-10-16"

// "15 hours ago", "Yesterday", "3 days ago", μετά ημερομηνία
function agoText(ts) {
  const ms = Date.now() - ts;
  const min = Math.round(ms / 60000);
  if (min < 1) return 'Just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} ${h === 1 ? 'hour' : 'hours'} ago`;
  const d = Math.round(h / 24);
  if (d === 1) return 'Yesterday';
  if (d < 7) return `${d} days ago`;
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
}

// Ρεκόρ μιας προπόνησης: ασκήσεις όπου σήκωσες περισσότερα κιλά από κάθε προηγούμενη φορά
function recordsOf(w) {
  if (typeof w.records === 'number') return w.records;
  const before = getHistory().filter((x) => x.startedAt < w.startedAt);
  return w.exercises.filter((ex) => {
    const prev = before.flatMap((x) => x.exercises.filter((e) => e.exerciseId === ex.exerciseId).flatMap((e) => e.sets));
    return prev.length && Math.max(...ex.sets.map((s) => s.kg || 0)) > Math.max(...prev.map((s) => s.kg || 0));
  }).length;
}

// Στρογγυλό εικονίδιο άσκησης: το αρχικό της μυϊκής ομάδας σε χρωματιστό κύκλο
const MUSCLE_HUE = { Chest: '#1F7FD6', Back: '#7C5CE0', Shoulders: '#0FA3B1', Biceps: '#E8566C', Triceps: '#E0882B', Legs: '#17955A', Glutes: '#C2449A', Core: '#5B6A8F' };
const exAvatar = (e) => `<span class="ft-avatar" style="--hue:${MUSCLE_HUE[e.muscle] || '#5B6A8F'}" aria-hidden="true">${escapeHtml((e.muscle || e.name || '?')[0])}</span>`;

// ===================== Home: οι προπονήσεις σου =====================

const SHOWN_EXERCISES = 3;

function workoutCard(w) {
  const shown = w.exercises.slice(0, SHOWN_EXERCISES);
  const more = w.exercises.length - shown.length;
  const records = recordsOf(w);
  return `
    <li><button class="ft-card" data-open="${w.id}">
      <span class="ft-card-title">${escapeHtml(w.name)}</span>
      <span class="ft-card-ago muted">${agoText(w.endedAt)}</span>
      <span class="ft-card-stats">
        <span><small>Time</small>${durationText(w.endedAt - w.startedAt)}</span>
        <span><small>Volume</small>${fmtVolume(volumeOf(w.exercises))}</span>
        <span><small>Records</small><b>${records ? `<span class="ft-medal">${icon(MORE_ICONS.medal)}</span>${records}` : '0'}</b></span>
      </span>
      <span class="ft-card-ex">${shown.map((e) => {
        const ex = exById(e.exerciseId);
        return `<span>${exAvatar(ex)}<span>${e.sets.length} ${e.sets.length === 1 ? 'set' : 'sets'} ${escapeHtml(exTitle(ex))}</span></span>`;
      }).join('')}</span>
      ${more > 0 ? `<span class="ft-card-more muted">See ${more} more ${more === 1 ? 'exercise' : 'exercises'}</span>` : ''}
    </button></li>`;
}

function renderFeed(el, params) {
  if (params[0] === 'w' && params[1]) { renderWorkoutDetail(el, params[1]); return; }
  const hist = getHistory().slice().reverse();
  el.innerHTML = hist.length
    ? `<ul class="ft-feed">${hist.map(workoutCard).join('')}</ul>`
    : `<div class="section-empty"><span class="section-empty-icon">${icon(ICONS.dumbbell)}</span>
        <p><strong>No workouts yet</strong></p>
        <p class="muted">Your workouts will show up here.</p>
        <button class="btn" data-go-workout>Start a workout</button></div>`;
  el.onclick = (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.dataset.open) navigate(`fitness/w/${b.dataset.open}`);
    else if ('goWorkout' in b.dataset) navigate('workout');
  };
}

function renderWorkoutDetail(el, id) {
  setTitle('Workout');
  const w = getHistory().find((x) => x.id === id);
  if (!w) { el.innerHTML = '<p class="muted">This workout no longer exists.</p>'; return; }
  el.innerHTML = `
    <p class="subhead">${new Date(w.startedAt).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}, ${agoText(w.endedAt).toLowerCase()}</p>
    <div class="ft-card ft-card-static">
      <span class="ft-card-title">${escapeHtml(w.name)}</span>
      <span class="ft-card-stats">
        <span><small>Time</small>${durationText(w.endedAt - w.startedAt)}</span>
        <span><small>Volume</small>${fmtVolume(volumeOf(w.exercises))}</span>
        <span><small>Sets</small>${setsCount(w.exercises)}</span>
      </span>
    </div>
    ${w.exercises.map((e) => {
      const ex = exById(e.exerciseId);
      let n = 0;
      return `
      <section class="ft-ex-block">
        <h3>${exAvatar(ex)}${escapeHtml(exTitle(ex))}</h3>
        <ul class="ft-sets">${e.sets.map((s) => {
          const label = SET_TYPES[s.type]?.short || String(++n);
          return `<li><span class="wk-type t-${s.type}">${label}</span><span>${setText(s)}</span></li>`;
        }).join('')}</ul>
      </section>`;
    }).join('')}
    <div class="stack">
      <button class="btn btn-quiet btn-block" data-routine>Save as routine</button>
      <button class="btn btn-danger btn-block" data-delete>Delete workout</button>
    </div>`;
  el.onclick = async (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    if ('routine' in b.dataset) {
      addRoutine(w.name, w.exercises.map((e) => ({ exerciseId: e.exerciseId, sets: e.sets.length })));
      toast('Saved to My Routines');
    } else if ('delete' in b.dataset) {
      const yes = await ask({ title: 'Delete workout?', text: 'It will be removed from your workouts.', confirmLabel: 'Delete' });
      if (!yes) return;
      store.update('history', (list) => list.filter((x) => x.id !== w.id), []);
      toast('Workout deleted');
      navigate('fitness');
    }
  };
}

// ===================== Workout: άδεια προπόνηση και routines =====================

let routinesOpen = true; // "My Routines" ανοιχτό/κλειστό

function addRoutine(name, exercises) {
  const r = { id: uid(), name, exercises: exercises.map((e) => ({ exerciseId: e.exerciseId, sets: e.sets || DEFAULT_SETS, rest: e.rest ?? DEFAULT_REST })) };
  store.update('routines', (list) => [...list, r], []);
  return r;
}

const routineCard = (r) => `
  <li class="ft-routine">
    <div class="ft-routine-head">
      <button class="ft-routine-name" data-edit="${r.id}">${escapeHtml(r.name)}</button>
      <button class="wk-icon-btn" data-menu="${r.id}" aria-label="Routine options">${icon(ICONS.dots)}</button>
    </div>
    <p class="ft-routine-ex muted">${escapeHtml(r.exercises.map((e) => exTitle(exById(e.exerciseId))).join(', ') || 'No exercises')}</p>
    <button class="btn btn-block ft-start" data-start="${r.id}" ${r.exercises.length ? '' : 'disabled'}>Start Routine</button>
  </li>`;

function renderWorkoutTab(el, params) {
  if (params[0] === 'routine' && params[1]) { renderRoutine(el, params[1]); return; }
  const a = getActive();
  const routines = getRoutines();
  el.innerHTML = `
    ${a ? `
      <div class="banner banner-flow" role="status">
        <div class="banner-body"><p class="banner-title">Workout in progress</p><p class="banner-text">${escapeHtml(a.name)}</p></div>
        <button class="btn btn-small" data-resume>Resume</button>
      </div>` : ''}
    <button class="ft-tile ft-wide" data-empty>${icon(ICONS.plus)} Start Empty Workout</button>

    <h2 class="section-title">Routines</h2>
    <div class="ft-tiles">
      <button class="ft-tile" data-new>${icon(MORE_ICONS.routine)} New Routine</button>
      <button class="ft-tile" data-explore>${icon(MORE_ICONS.search)} Explore</button>
    </div>

    <button class="ft-collapse ${routinesOpen ? 'open' : ''}" data-toggle aria-expanded="${routinesOpen}">
      ${icon(MORE_ICONS.caret)} My Routines (${routines.length})
    </button>
    ${routinesOpen ? (routines.length
      ? `<ul class="ft-routines">${routines.map(routineCard).join('')}</ul>`
      : '<p class="muted small-print">Create a routine, or pick one from Explore.</p>') : ''}`;

  el.onclick = (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    if ('resume' in b.dataset) openLog();
    else if ('empty' in b.dataset) startWorkout();
    else if ('new' in b.dataset) navigate('workout/routine/new');
    else if ('explore' in b.dataset) exploreSheet(() => renderWorkoutTab(el, []));
    else if ('toggle' in b.dataset) { routinesOpen = !routinesOpen; renderWorkoutTab(el, []); }
    else if (b.dataset.edit) navigate(`workout/routine/${b.dataset.edit}`);
    else if (b.dataset.menu) routineMenu(b.dataset.menu, () => renderWorkoutTab(el, []));
    else if (b.dataset.start) {
      const r = getRoutines().find((x) => x.id === b.dataset.start);
      if (r) startWorkout(r);
    }
  };
}

function routineMenu(id, after) {
  const r = getRoutines().find((x) => x.id === id);
  if (!r) return;
  openSheet(`
    <h2>${escapeHtml(r.name)}</h2>
    <div class="stack wk-menu">
      <button class="btn btn-quiet btn-block" data-edit>Edit routine</button>
      <button class="btn btn-quiet btn-block" data-copy>Duplicate routine</button>
      <button class="btn btn-danger btn-block" data-delete>Delete routine</button>
    </div>`,
  (root, close) => root.addEventListener('click', async (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    close();
    if ('edit' in b.dataset) navigate(`workout/routine/${id}`);
    else if ('copy' in b.dataset) { addRoutine(`${r.name} (copy)`, r.exercises); toast('Routine duplicated'); after(); }
    else if ('delete' in b.dataset) {
      const yes = await ask({ title: 'Delete routine?', text: `"${r.name}" will be deleted. Your past workouts stay.`, confirmLabel: 'Delete' });
      if (!yes) return;
      store.update('routines', (list) => list.filter((x) => x.id !== id), []);
      toast('Routine deleted');
      after();
    }
  }));
}

function exploreSheet(after) {
  openSheet(`
    <h2>Explore</h2>
    <p class="muted">Ready-made routines. Add one to My Routines and change it as you like.</p>
    <ul class="list rules-list">${TEMPLATES.map((t, i) => `
      <li><div class="row row-static">
        <span class="row-text"><span class="row-title">${escapeHtml(t.name)}</span>
          <span class="row-sub">${escapeHtml(t.exercises.map((id) => exById(id).name).join(', '))}</span></span>
        <button class="btn btn-small" data-add="${i}">Add</button>
      </div></li>`).join('')}
    </ul>`,
  (root, close) => root.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-add]');
    if (!b) return;
    const t = TEMPLATES[Number(b.dataset.add)];
    addRoutine(t.name, t.exercises.map((exerciseId) => ({ exerciseId })));
    toast(`${t.name} added to My Routines`);
    close();
    after();
  }));
}

// ----- Routine: δημιουργία / αλλαγή -----

let draft = null; // { key, isNew, id, name, exercises }

function renderRoutine(el, id) {
  setTitle(id === 'new' ? 'New Routine' : 'Edit Routine');
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
          ${exAvatar(exById(e.exerciseId))}
          <span class="row-text"><span class="row-title">${escapeHtml(exTitle(exById(e.exerciseId)))}</span>
            <span class="row-sub">${e.sets} ${e.sets === 1 ? 'set' : 'sets'}</span>
            <button class="wk-rest-chip" data-rest="${i}">${icon(ICONS.timer)} Rest: ${restText(e.rest ?? DEFAULT_REST)}</button></span>
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
    } else if (b.dataset.rest) {
      const e = draft.exercises[Number(b.dataset.rest)];
      restSheet(e.rest ?? DEFAULT_REST, exTitle(exById(e.exerciseId)), (seconds) => { e.rest = seconds; renderRoutine(el, id); });
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
      navigate('workout');
    } else if ('delete' in b.dataset) {
      const yes = await ask({ title: 'Delete routine?', text: `"${draft.name}" will be deleted. Your past workouts stay.`, confirmLabel: 'Delete' });
      if (!yes) return;
      store.update('routines', (list) => list.filter((r) => r.id !== draft.id), []);
      draft = null;
      toast('Routine deleted');
      navigate('workout');
    }
  };
}

// ===================== Profile =====================

// Το γράφημα: τι δείχνει (metric) και για πόσο διάστημα (range)
let metric = 'duration';
let range = 'quarter';
// 7 days και a month: μία στήλη ανά μέρα. 3 months: μία στήλη ανά εβδομάδα.
const RANGES = {
  week: { label: 'Last 7 days', bars: 7, step: 'day', ticks: [0, 3, 6] },
  month: { label: 'Last month', bars: 30, step: 'day', ticks: [0, 10, 20, 29] },
  quarter: { label: 'Last 3 months', bars: 13, step: 'week', ticks: [0, 4, 8, 12] },
};

// Σύνολα ανά στήλη: διάρκεια (h), όγκος (kg), reps
function chartTotals() {
  const r = RANGES[range];
  const startOf = (ts) => {
    const d = new Date(ts);
    d.setHours(0, 0, 0, 0);
    if (r.step === 'week') d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Δευτέρα
    return d.getTime();
  };
  const stepMs = (r.step === 'week' ? 7 : 1) * DAY;
  const last = startOf(Date.now());
  const bars = Array.from({ length: r.bars }, (_, i) => ({ start: last - (r.bars - 1 - i) * stepMs, duration: 0, volume: 0, reps: 0 }));
  for (const w of getHistory()) {
    const s = startOf(w.startedAt);
    // Με αλλαγή ώρας μια "μέρα" μπορεί να μην είναι ακριβώς 24 ώρες: ψάχνουμε την πιο κοντινή στήλη
    const k = bars.findIndex((x) => Math.abs(x.start - s) < stepMs / 2);
    if (k < 0) continue;
    bars[k].duration += (w.endedAt - w.startedAt) / 3600000;
    bars[k].volume += volumeOf(w.exercises);
    bars[k].reps += w.exercises.reduce((n, e) => n + e.sets.reduce((m, x) => m + (x.reps || 0), 0), 0);
  }
  return bars;
}

// Η τιμή μιας στήλης με ακρίβεια: "2h 18m", "6,017 kg", "124 reps"
function exactValue(v) {
  if (metric === 'duration') return v ? durationText(v * 3600000) : '0 min';
  if (metric === 'volume') return fmtVolume(v);
  return `${Math.round(v)} reps`;
}

// Πότε ήταν μια στήλη: "21–27 Sept, 3 weeks ago" ή "Wed 14 Oct, 2 days ago"
function whenText(start) {
  const r = RANGES[range];
  const fmt = (ts, o) => new Date(ts).toLocaleDateString('en-GB', o);
  if (r.step === 'week') {
    const end = start + 6 * DAY;
    const ago = Math.round((chartTotals().at(-1).start - start) / (7 * DAY));
    const rel = ago === 0 ? 'this week' : ago === 1 ? 'last week' : `${ago} weeks ago`;
    return `${fmt(start, { day: 'numeric' })}–${fmt(end, { day: 'numeric', month: 'short' })}, ${rel}`;
  }
  const ago = Math.round((chartTotals().at(-1).start - start) / DAY);
  const rel = ago === 0 ? 'today' : ago === 1 ? 'yesterday' : ago >= 7 ? `${Math.floor(ago / 7)} ${Math.floor(ago / 7) === 1 ? 'week' : 'weeks'} ago` : `${ago} days ago`;
  return `${fmt(start, { weekday: 'short', day: 'numeric', month: 'short' })}, ${rel}`;
}

let picked = null; // η στήλη που πάτησες (θέση)

function chartHtml() {
  const r = RANGES[range];
  const bars = chartTotals();
  const values = bars.map((b) => b[metric]);
  const max = Math.max(...values, 1);
  const label = (ts) => new Date(ts).toLocaleDateString('en-GB', r.bars === 7 ? { weekday: 'short' } : { day: 'numeric', month: 'short' });
  const sel = picked !== null && picked < bars.length ? picked : null;
  return `
    <div class="ft-chart ${sel !== null ? 'has-pick' : ''}">
      <p class="ft-chart-info" aria-live="polite">${sel !== null
        ? `<strong>${exactValue(values[sel])}</strong><span class="muted">${whenText(bars[sel].start)}</span>`
        : `<span class="muted">Tap a bar to see the details</span>`}</p>
      <div class="ft-bars ${r.bars > 20 ? 'thin' : ''}">${values.map((v, i) => `
        <button class="ft-bar ${sel === i ? 'picked' : ''}" data-bar="${i}" style="--h:${max ? (v / max) * 100 : 0}%; --i:${i}"
                aria-label="${label(bars[i].start)}: ${exactValue(v)}"></button>`).join('')}
      </div>
      <div class="ft-chart-x muted">${r.ticks.map((i) => `<span>${label(bars[i].start)}</span>`).join('')}</div>
    </div>`;
}

// Επιλογή διαστήματος (σαν το "Last 3 months ⌄" του Hevy)
function rangeSheet(after) {
  openSheet(`
    <h2>Show</h2>
    <div class="stack wk-menu">${Object.entries(RANGES).map(([id, r]) => `
      <button class="btn btn-quiet btn-block ${range === id ? 'selected' : ''}" data-range="${id}">${r.label}</button>`).join('')}
    </div>`,
  (root, close) => root.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-range]');
    if (!b) return;
    range = b.dataset.range;
    close();
    after();
  }));
}

function renderProfile(el, params) {
  const page = params[0];
  if (page === 'exercises') { renderExercises(el, params[1]); return; }
  if (page === 'calendar') { renderCalendar(el); return; }
  if (page === 'measures') { renderMeasures(el); return; }
  if (page === 'statistics') { renderStatistics(el); return; }

  const hist = getHistory();
  const weekStart = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.getTime(); })();
  const thisWeekMin = Math.round(hist.filter((w) => w.startedAt >= weekStart).reduce((t, w) => t + (w.endedAt - w.startedAt), 0) / 60000);
  const totalRecords = hist.reduce((n, w) => n + recordsOf(w), 0);
  const tile = (go, ic, label) => `<button class="ft-tile" data-go="${go}">${icon(ic)} ${label}</button>`;

  el.innerHTML = `
    <div class="ft-profile">
      <span class="ft-profile-avatar">${icon(ICONS.dumbbell)}</span>
      <div class="ft-profile-stats">
        <span><small>Workouts</small>${hist.length}</span>
        <span><small>Time</small>${hist.length ? durationText(hist.reduce((t, w) => t + (w.endedAt - w.startedAt), 0)) : '0 min'}</span>
        <span><small>Records</small>${totalRecords}</span>
      </div>
    </div>

    <div class="ft-week">
      <p><strong>${thisWeekMin < 60 ? `${thisWeekMin} mins` : durationText(thisWeekMin * 60000)}</strong> <span class="muted">this week</span></p>
      <button class="ft-range" data-range-open>${RANGES[range].label} ${icon(MORE_ICONS.caret)}</button>
    </div>
    <div id="ft-chart">${chartHtml()}</div>
    <div class="ft-metrics" role="radiogroup" aria-label="Chart">
      ${['duration', 'volume', 'reps'].map((m) => `<button class="chip ${metric === m ? 'selected' : ''}" data-metric="${m}" role="radio" aria-checked="${metric === m}">${m[0].toUpperCase() + m.slice(1)}</button>`).join('')}
    </div>

    <h2 class="section-title">Dashboard</h2>
    <div class="ft-tiles">
      ${tile('profile/statistics', MORE_ICONS.chart, 'Statistics')}
      ${tile('profile/exercises', ICONS.dumbbell, 'Exercises')}
      ${tile('profile/measures', MORE_ICONS.measure, 'Measures')}
      ${tile('profile/calendar', MORE_ICONS.calendar, 'Calendar')}
    </div>

    <h2 class="section-title">History</h2>
    <div id="ft-history">${historyHtml()}</div>`;

  el.onclick = (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    if ('more' in b.dataset) {
      historyShown += HISTORY_PAGE;
      el.querySelector('#ft-history').innerHTML = historyHtml();
    } else if (b.dataset.open) {
      navigate(`fitness/w/${b.dataset.open}`);
    } else if ('rangeOpen' in b.dataset) {
      rangeSheet(() => {
        picked = null;
        el.querySelector('#ft-chart').innerHTML = chartHtml();
        b.innerHTML = `${RANGES[range].label} ${icon(MORE_ICONS.caret)}`;
      });
    } else if (b.dataset.bar) {
      const i = Number(b.dataset.bar);
      picked = picked === i ? null : i; // πάτημα ξανά στην ίδια στήλη: κλείνει
      el.querySelector('#ft-chart').innerHTML = chartHtml();
      el.querySelectorAll('.ft-bar').forEach((x) => { x.style.animation = 'none'; }); // χωρίς ξαναφούσκωμα
    } else if (b.dataset.metric) {
      metric = b.dataset.metric;
      el.querySelector('#ft-chart').innerHTML = chartHtml();
      el.querySelectorAll('[data-metric]').forEach((c) => { c.classList.toggle('selected', c === b); c.setAttribute('aria-checked', c === b); });
    } else if (b.dataset.go) navigate(b.dataset.go);
  };
}

// ----- Αναλυτικό ιστορικό: κάθε προπόνηση με όλα τα σετ -----
const HISTORY_PAGE = 10; // πόσες προπονήσεις φαίνονται, και πόσες ακόμα με "Show more"
let historyShown = HISTORY_PAGE;

function historyHtml() {
  const hist = getHistory().slice().reverse();
  if (!hist.length) return '<p class="muted small-print">Your finished workouts will show up here with every set.</p>';
  return `
    <ul class="ft-history">${hist.slice(0, historyShown).map((w) => `
      <li class="ft-hist">
        <button class="ft-hist-head" data-open="${w.id}">
          <span class="ft-hist-title"><strong>${escapeHtml(w.name)}</strong>
            <span class="muted">${new Date(w.startedAt).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })},
              ${new Date(w.startedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span></span>
          <span class="ft-hist-sum">${durationText(w.endedAt - w.startedAt)} · ${fmtVolume(volumeOf(w.exercises))} · ${setsCount(w.exercises)} sets</span>
        </button>
        ${w.exercises.map((e) => {
          let n = 0;
          const reps = e.sets.reduce((m, s) => m + (s.reps || 0), 0);
          return `
          <div class="ft-hist-ex">
            <p class="ft-hist-ex-name">${escapeHtml(exTitle(exById(e.exerciseId)))}
              <span class="muted">${e.sets.length} ${e.sets.length === 1 ? 'set' : 'sets'}, ${reps} reps, ${fmtVolume(volumeOf([e]))}</span></p>
            <table class="ft-hist-sets">
              <thead><tr><th>Set</th><th>kg</th><th>Reps</th><th>Volume</th></tr></thead>
              <tbody>${e.sets.map((s) => `
                <tr><td><span class="wk-type t-${s.type}">${SET_TYPES[s.type]?.short || String(++n)}</span></td>
                  <td>${s.kg ? fmtKg(s.kg) : '–'}</td><td>${s.reps}</td><td>${s.kg ? fmtKg(s.kg * s.reps) : '–'}</td></tr>`).join('')}
              </tbody>
            </table>
          </div>`;
        }).join('')}
      </li>`).join('')}
    </ul>
    ${hist.length > historyShown ? `<button class="btn btn-quiet btn-block" data-more>Show more (${hist.length - historyShown})</button>` : ''}`;
}

// ----- Statistics: σετ ανά μυϊκή ομάδα (30 μέρες) -----
function renderStatistics(el) {
  setTitle('Statistics');
  const since = Date.now() - 30 * DAY;
  const counts = Object.fromEntries(MUSCLES.map((m) => [m, 0]));
  for (const w of getHistory().filter((x) => x.startedAt >= since)) {
    for (const e of w.exercises) {
      const m = exById(e.exerciseId).muscle;
      if (m in counts) counts[m] += e.sets.length;
    }
  }
  const max = Math.max(1, ...Object.values(counts));
  el.innerHTML = `
    <p class="muted intro first-intro">Sets per muscle group, last 30 days.</p>
    <ul class="course-list ft-muscles">${MUSCLES.map((m) => `
      <li><span class="course-name">${m}</span><span class="course-count">${counts[m]} sets</span>
        <span class="course-bar" aria-hidden="true"><i style="width:${(counts[m] / max) * 100}%; background:${MUSCLE_HUE[m]}"></i></span></li>`).join('')}
    </ul>`;
}

// ----- Exercises: όσες έχεις κάνει, και η πρόοδος σε καθεμία -----
function renderExercises(el, id) {
  setTitle(id ? 'Exercise' : 'Exercises');
  const hist = getHistory();
  const done = new Map(); // exerciseId -> [{ ts, sets }]
  for (const w of hist) for (const e of w.exercises) {
    if (!done.has(e.exerciseId)) done.set(e.exerciseId, []);
    done.get(e.exerciseId).push({ ts: w.startedAt, sets: e.sets });
  }

  if (id) {
    const ex = exById(id);
    const sessions = (done.get(id) || []).slice().reverse();
    const allSets = sessions.flatMap((s) => s.sets);
    const heaviest = allSets.length ? Math.max(...allSets.map((s) => s.kg || 0)) : 0;
    const bestVol = allSets.length ? Math.max(...allSets.map((s) => (s.kg || 0) * (s.reps || 0))) : 0;
    el.innerHTML = `
      <h2 class="section-title first ft-ex-title">${exAvatar(ex)}${escapeHtml(exTitle(ex))}</h2>
      <div class="stats stats-3">
        <div class="stat"><strong>${fmtKg(heaviest)}</strong><span>Heaviest (kg)</span></div>
        <div class="stat"><strong>${fmtKg(bestVol)}</strong><span>Best set volume (kg)</span></div>
        <div class="stat"><strong>${sessions.length}</strong><span>Times</span></div>
      </div>
      <h2 class="section-title">History</h2>
      <ul class="list compact-list">${sessions.map((s) => `
        <li><div class="row row-compact row-static">
          <span class="row-title">${new Date(s.ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
          <span class="row-meta">${s.sets.map((x) => setText(x)).join(', ')}</span>
        </div></li>`).join('') || '<li class="wk-none muted">Not done yet.</li>'}
      </ul>`;
    return;
  }

  const list = allExercises()
    .filter((e) => done.has(e.id))
    .sort((a, b) => done.get(b.id).at(-1).ts - done.get(a.id).at(-1).ts);
  el.innerHTML = list.length
    ? `<ul class="list">${list.map((e) => {
        const best = bestSet(done.get(e.id).flatMap((s) => s.sets));
        return `
        <li><button class="row" data-ex="${e.id}">
          ${exAvatar(e)}
          <span class="row-text"><span class="row-title">${escapeHtml(exTitle(e))}</span>
            <span class="row-sub">${done.get(e.id).length} ${done.get(e.id).length === 1 ? 'time' : 'times'}, best ${setText(best)}</span></span>
          <span class="row-chevron" aria-hidden="true">›</span>
        </button></li>`;
      }).join('')}</ul>`
    : '<p class="muted">Exercises you do will show up here, with your best sets.</p>';
  el.onclick = (ev) => {
    const b = ev.target.closest('[data-ex]');
    if (b) navigate(`profile/exercises/${b.dataset.ex}`);
  };
}

// ----- Calendar: ποιες μέρες προπονήθηκες -----
let calMonth = null;
function renderCalendar(el) {
  setTitle('Calendar');
  const now = new Date();
  if (!calMonth) calMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const byDay = new Map();
  for (const w of getHistory()) {
    const k = dateKey(w.startedAt);
    if (!byDay.has(k)) byDay.set(k, []);
    byDay.get(k).push(w);
  }
  const first = new Date(calMonth);
  const start = new Date(first);
  start.setDate(1 - ((first.getDay() + 6) % 7));
  const cells = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; })
    .filter((d, i) => i < 35 || d.getMonth() === first.getMonth());
  const inMonth = [...byDay.keys()].filter((k) => k.startsWith(dateKey(first).slice(0, 7))).length;
  el.innerHTML = `
    <div class="month-head">
      <span class="month-title">${first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</span>
      <div class="month-nav">
        <button class="icon-btn" data-month="-1" aria-label="Previous month">‹</button>
        <button class="icon-btn" data-month="1" aria-label="Next month">›</button>
      </div>
    </div>
    <div class="mweek" aria-hidden="true">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((w) => `<span>${w}</span>`).join('')}</div>
    <div class="mgrid">${cells.map((d) => {
      const k = dateKey(d);
      const ws = byDay.get(k);
      return `<button class="mcell ${d.getMonth() !== first.getMonth() ? 'dim' : ''} ${k === dateKey(now) ? 'today' : ''} ${ws ? 'ft-trained' : ''}" ${ws ? `data-day="${k}"` : 'disabled'}>
        <span class="mnum">${d.getDate()}</span></button>`;
    }).join('')}</div>
    <p class="muted small-print">${inMonth} ${inMonth === 1 ? 'day' : 'days'} trained this month.</p>`;
  el.onclick = (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.dataset.month) { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + Number(b.dataset.month), 1); renderCalendar(el); }
    else if (b.dataset.day) {
      const ws = byDay.get(b.dataset.day);
      if (ws.length === 1) navigate(`fitness/w/${ws[0].id}`);
      else openSheet(`<h2>${new Date(ws[0].startedAt).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</h2>
        <ul class="list rules-list">${ws.map((w) => `<li><button class="row" data-w="${w.id}"><span class="row-text"><span class="row-title">${escapeHtml(w.name)}</span></span><span class="row-chevron">›</span></button></li>`).join('')}</ul>`,
      (root, close) => root.addEventListener('click', (e2) => { const r = e2.target.closest('[data-w]'); if (r) { close(); navigate(`fitness/w/${r.dataset.w}`); } }));
    }
  };
}

// ----- Measures: το βάρος σου -----
function renderMeasures(el) {
  setTitle('Measures');
  const list = store.get('measures', []).slice().sort((a, b) => a.date.localeCompare(b.date));
  const latest = list.at(-1);
  const pts = list.slice(-12);
  const min = Math.min(...pts.map((p) => p.weight));
  const max = Math.max(...pts.map((p) => p.weight));
  const line = pts.length > 1 ? pts.map((p, i) => `${(i / (pts.length - 1)) * 100},${max === min ? 50 : 90 - ((p.weight - min) / (max - min)) * 80}`).join(' ') : '';
  el.innerHTML = `
    <div class="ft-card ft-card-static ft-measure">
      <span class="muted">Body weight</span>
      <span class="ft-measure-value">${latest ? `${fmtKg(latest.weight)} kg` : '–'}</span>
      ${line ? `<svg class="ft-spark" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><polyline points="${line}"/></svg>` : ''}
    </div>
    <form class="ft-measure-form">
      <label class="field"><span>Weight today (kg)</span><input name="w" inputmode="decimal" placeholder="${latest ? fmtKg(latest.weight) : '75'}" autocomplete="off"></label>
      <button class="btn" type="submit">Save</button>
    </form>
    ${list.length ? `<h2 class="section-title">Entries</h2>
      <ul class="list compact-list">${list.slice().reverse().map((m) => `
        <li><div class="row row-compact row-static"><span class="row-title">${new Date(m.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
          <span class="row-value small-value">${fmtKg(m.weight)} kg</span>
          <button class="wk-icon-btn" data-del="${m.date}" aria-label="Delete entry">×</button></div></li>`).join('')}</ul>` : ''}`;
  el.querySelector('form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const w = parseFloat(String(new FormData(ev.target).get('w')).replace(',', '.'));
    if (!(w > 20 && w < 400)) { toast('Enter your weight in kg'); return; }
    const today = dateKey(Date.now());
    store.update('measures', (l) => [...l.filter((m) => m.date !== today), { date: today, weight: Math.round(w * 10) / 10 }], []);
    toast('Weight saved');
    renderMeasures(el);
  });
  el.onclick = (ev) => {
    const b = ev.target.closest('[data-del]');
    if (!b) return;
    store.update('measures', (l) => l.filter((m) => m.date !== b.dataset.del), []);
    renderMeasures(el);
  };
}

// ===================== Καταχώρηση: οι 3 καρτέλες του Fitness =====================

register({
  id: 'fitness',
  title: 'Home',
  icon: MORE_ICONS.home,
  order: 80,
  section: 'fitness',
  sectionHome: true,
  home: false,
  render: renderFeed,
});

register({
  id: 'workout',
  title: 'Workout',
  icon: ICONS.dumbbell,
  order: 81,
  section: 'fitness',
  nav: true,
  home: false,
  render: renderWorkoutTab,
  unmount() { draft = null; },
});

register({
  id: 'profile',
  title: 'Profile',
  icon: MORE_ICONS.user,
  order: 82,
  section: 'fitness',
  nav: true,
  home: false,
  render: renderProfile,
  unmount() { calMonth = null; historyShown = HISTORY_PAGE; picked = null; },
});
