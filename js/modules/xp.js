// XP: πόντοι από παρουσίες, focus και ημερήσιο στόχο. Levels και streak.
//
// Τα XP ΔΕΝ αποθηκεύονται: υπολογίζονται κάθε φορά από τις "κινήσεις"
// των άλλων modules (οι αριθμοί είναι στο core/rules.js):
//   διάλεξη      Went +10, Left early +4, Missed 0 (Cancelled δεν μετράει)
//   focus        +1 XP ανά λεπτό ολοκληρωμένης συνεδρίας
//   στόχος μέρας +20 αν πήγες σε όλα τα μαθήματα της μέρας (αν είχε)
//                και έκανες τουλάχιστον 30' focus
// Αν χάσεις διάλεξη ή στόχο, απλώς δεν παίρνεις τίποτα.
// Αποθηκεύουμε μόνο το "τελευταίο σύνολο που είδαμε", για να ξέρουμε
// πότε να δείξουμε "+25 XP" ή "Level 4 reached".

import { register, on } from '../core/registry.js';
import { moduleStore } from '../core/storage.js';
import { navigate, escapeHtml, toast, openSheet } from '../core/router.js';
import { CLASS_POINTS, FOCUS_XP_PER_MIN, GOAL_BONUS, GOAL_FOCUS_MIN, STOP_PENALTY_XP } from '../core/rules.js';
import {
  validAttendance, entriesForDate, STATUSES, parseKey, dateKey, startOfDay, addDays,
} from './calendar.js';
import { getSessions, ACTIVITIES } from './timer.js';

const store = moduleStore('xp');

// Για όσα modules τα χρειάζονται
export { GOAL_BONUS, GOAL_FOCUS_MIN };
export const POINTS = CLASS_POINTS;

export function pointsFor(status) {
  return POINTS[status] ?? 0;
}

// ===================== Levels =====================
// Κάθε level θέλει 50 XP περισσότερα από το προηγούμενο:
// L1: 0, L2: 50, L3: 150, L4: 300, L5: 500, L6: 750 ...
// Τύπος: το level n ξεκινάει στα 25 * n * (n - 1) XP.
export function levelStart(n) {
  return 25 * n * (n - 1);
}

export function levelFor(total) {
  let n = 1;
  while (levelStart(n + 1) <= total) n++;
  return n;
}

// ===================== Υπολογισμός =====================

// "2026-10-14" + "09:00" -> timestamp (για ταξινόμηση)
function timeOf(key, hhmm = '00:00') {
  const d = parseKey(key);
  const [h, m] = hhmm.split(':').map(Number);
  d.setHours(h, m);
  return d.getTime();
}

// Όλες οι παρουσίες που μετράνε (του τωρινού προγράμματος, χωρίς cancelled),
// με χρονολογική σειρά
export function countedRecords() {
  return validAttendance()
    .filter((r) => r.status !== 'cancelled')
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
}

// Λεπτά ολοκληρωμένου focus ανά μέρα: { "2026-10-14": 45, ... }
function focusByDay() {
  const out = {};
  for (const s of getSessions()) {
    if (!s.completed) continue;
    const key = dateKey(new Date(s.endedAt));
    out[key] = (out[key] || 0) + s.minutes;
  }
  return out;
}

// Ο ημερήσιος στόχος για μια μέρα:
//   classes  μαθήματα που έγιναν (όχι ακυρωμένα)
//   done     σε πόσα πήγες ή έφυγες νωρίς
//   focus    λεπτά ολοκληρωμένου focus εκείνη τη μέρα
//   met      όλα τα μαθήματα (αν είχε) + τουλάχιστον 30' focus
export function dailyGoal(date, focusMap = focusByDay()) {
  const key = dateKey(date);
  const live = entriesForDate(date).filter((e) => e.status !== 'cancelled');
  const done = live.filter((e) => e.status === 'attended' || e.status === 'left').length;
  const focus = focusMap[key] || 0;
  return {
    key,
    classes: live.length,
    done,
    focus,
    met: done === live.length && focus >= GOAL_FOCUS_MIN,
  };
}

// Οι μέρες που πέτυχες τον στόχο, από την πρώτη σου δραστηριότητα έως σήμερα
export function goalDays() {
  const dates = [
    ...validAttendance().map((r) => r.date),
    ...getSessions().map((s) => dateKey(new Date(s.endedAt))),
  ];
  if (!dates.length) return [];
  const first = dates.reduce((min, d) => (d < min ? d : min));
  const today = startOfDay(new Date());
  const focus = focusByDay();
  const out = [];
  for (let d = parseKey(first); d <= today; d = addDays(d, 1)) {
    const g = dailyGoal(d, focus);
    if (g.met) out.push(g);
  }
  return out;
}

// Όλες οι κινήσεις XP, παλιότερη πρώτη: [{ at, date, amount, kind, title, sub }]
export function xpEvents() {
  const events = [];
  for (const r of countedRecords()) {
    events.push({
      at: timeOf(r.date, r.start), date: r.date, amount: pointsFor(r.status),
      kind: 'class', title: r.title, sub: STATUSES[r.status].label.toLowerCase(),
    });
  }
  for (const s of getSessions()) {
    if (!s.completed) continue;
    events.push({
      at: s.endedAt, date: dateKey(new Date(s.endedAt)), amount: s.minutes * FOCUS_XP_PER_MIN,
      kind: 'focus', title: ACTIVITIES[s.activity]?.label || 'Focus', sub: `${s.minutes} min focus`,
    });
  }
  // Ποινή: σταμάτησες το focus νωρίς
  for (const s of getSessions()) {
    if (s.reason !== 'stopped' || !s.penalty) continue;
    events.push({
      at: s.endedAt, date: dateKey(new Date(s.endedAt)), amount: -s.penalty,
      kind: 'penalty', title: ACTIVITIES[s.activity]?.label || 'Focus', sub: 'stopped early',
    });
  }
  for (const g of goalDays()) {
    events.push({
      at: timeOf(g.key, '23:59'), date: g.key, amount: GOAL_BONUS,
      kind: 'goal', title: 'Daily goal', sub: 'every class and focus',
    });
  }
  return events.sort((a, b) => a.at - b.at);
}

// XP σε ένα διάστημα ημερομηνιών, π.χ. για το εβδομαδιαίο resume.
// from/to: "2026-10-12" (και τα δύο μέσα στο διάστημα)
export function xpBetween(from, to) {
  return xpEvents()
    .filter((e) => e.date >= from && e.date <= to)
    .reduce((sum, e) => sum + e.amount, 0);
}

// Streak = συνεχόμενα μαθήματα που πήγες (και το "Left early" μετράει,
// γιατί εμφανίστηκες). Ένα "Missed" το μηδενίζει. Τα cancelled αγνοούνται.
function streaks(records) {
  let current = 0;
  let best = 0;
  for (const r of records) {
    current = r.status === 'missed' ? 0 : current + 1;
    best = Math.max(best, current);
  }
  return { current, best };
}

// Το streak όπως ήταν στο τέλος μιας ημέρας (π.χ. Κυριακή μιας παλιάς εβδομάδας)
export function streakUntil(toKey) {
  return streaks(countedRecords().filter((r) => r.date <= toKey)).current;
}

export function getXp() {
  const events = xpEvents();
  // Το σύνολο δεν πέφτει ποτέ κάτω από 0
  const total = Math.max(0, events.reduce((sum, e) => sum + e.amount, 0));
  const level = levelFor(total);
  const { current, best } = streaks(countedRecords());
  return {
    total,
    level,
    from: levelStart(level),
    to: levelStart(level + 1),
    streak: current,
    bestStreak: best,
    events,
  };
}

// ===================== Ανταπόκριση σε αλλαγές =====================

// Κρατάμε σιωπηλά το τωρινό σύνολο όταν ανοίγει το app και όταν αλλάζει
// το πρόγραμμα. Έτσι τα "+25 XP" δείχνουν μόνο ό,τι άλλαξε τώρα.
function syncSilently() {
  const { total, level } = getXp();
  store.set('lastTotal', total);
  store.set('lastLevel', level);
  store.set('goalToday', { key: dateKey(new Date()), met: dailyGoal(new Date()).met });
}
syncSilently();
on('schedule:changed', syncSilently);

// Μετά από παρουσία ή focus: πόσο άλλαξαν τα XP;
function announce() {
  const { total, level } = getXp();
  const prevTotal = store.get('lastTotal', total);
  const prevLevel = store.get('lastLevel', level);
  const diff = total - prevTotal;

  // Πέτυχες (ή έχασες) τον σημερινό στόχο με αυτή την αλλαγή;
  const today = dateKey(new Date());
  const before = store.get('goalToday', null);
  const metNow = dailyGoal(new Date()).met;
  const metBefore = before && before.key === today ? before.met : false;
  const goalNote = metNow && !metBefore ? '. Daily goal reached' : '';

  if (diff > 0) {
    toast(level > prevLevel ? `+${diff} XP. Level ${level} reached` : `+${diff} XP${goalNote}`);
  } else if (diff < 0) {
    toast(level < prevLevel ? `−${-diff} XP. Back to level ${level}` : `−${-diff} XP`);
  }
  store.set('lastTotal', total);
  store.set('lastLevel', level);
  store.set('goalToday', { key: today, met: metNow });
}
on('attendance:changed', announce);
on('focus:finished', announce);

// ===================== Οθόνη =====================

const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');

// Φύλλο με τους κανόνες (ώστε η οθόνη να μένει καθαρή)
function rulesSheet() {
  const rule = (title, value, cls = 'xp-plus') => `
    <li><div class="row row-static"><span class="row-text"><span class="row-title">${title}</span></span>
      <span class="row-value small-value ${cls}">${value}</span></div></li>`;
  openSheet(`
    <h2>How XP works</h2>
    <ul class="list rules-list">
      ${rule('Went to class', `+${POINTS.attended}`)}
      ${rule('Left early', `+${POINTS.left}`)}
      ${rule('Missed', '0', 'muted')}
      ${rule('Focus', `+${FOCUS_XP_PER_MIN} per min`)}
      ${rule('Daily goal', `+${GOAL_BONUS}`)}
      ${rule('Stop focus early', `−${STOP_PENALTY_XP}`, 'is-low')}
    </ul>
    <p class="muted small-print">Daily goal: go to every class that day and focus at least ${GOAL_FOCUS_MIN} min.
      Your streak counts classes in a row without a miss.</p>
    <div class="stack"><button class="btn btn-quiet btn-block" data-close>Done</button></div>`,
  (root, close) => root.querySelector('[data-close]').addEventListener('click', close));
}

function render(el) {
  const xp = getXp();
  const span = xp.to - xp.from;
  const pct = Math.round(((xp.total - xp.from) / span) * 100);
  const recent = xp.events.slice(-6).reverse();

  const history = recent.length
    ? `<h2 class="section-title">Recent</h2>
       <ul class="list">${recent.map((e) => {
      const day = parseKey(e.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
      const cls = e.amount > 0 ? 'xp-plus' : e.amount < 0 ? 'is-low' : 'muted';
      return `
        <li><div class="row row-static">
          <span class="row-text">
            <span class="row-title">${escapeHtml(e.title)}</span>
            <span class="row-sub">${day}, ${escapeHtml(e.sub)}</span>
          </span>
          <span class="row-value ${cls}">${signed(e.amount)}</span>
        </div></li>`;
    }).join('')}</ul>`
    : `<p class="muted empty-day">Go to a class or finish a focus session to earn XP.</p>
       <button class="btn btn-block" data-go="timer">Start focus</button>`;

  el.innerHTML = `
    <section class="level">
      <p class="hero-label">Level</p>
      <p class="level-number" data-count="${xp.level}" data-count-key="level">${xp.level}</p>
      <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}">
        <span style="width:${pct}%"></span>
      </div>
      <p class="level-caption">
        <span><span data-count="${xp.total}" data-count-key="xp-total">${xp.total}</span> XP</span>
        <span class="muted">${xp.to - xp.total} to level ${xp.level + 1}</span>
      </p>
    </section>

    <div class="stats">
      <div class="stat"><strong data-count="${xp.streak}" data-count-key="streak">${xp.streak}</strong><span>Streak</span></div>
      <div class="stat"><strong>${xp.bestStreak}</strong><span>Best streak</span></div>
    </div>

    ${history}
    <button class="link-btn" data-rules>How XP works</button>`;

  el.onclick = (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.dataset.go) navigate(b.dataset.go);
    else if ('rules' in b.dataset) rulesSheet();
  };
}

// ===================== Καταχώρηση =====================

// Η κορυφή της Αρχικής: το level σου, η πρόοδος και τα δύο βασικά κουμπιά
function renderHomeHero(el) {
  const xp = getXp();
  const pct = Math.round(((xp.total - xp.from) / (xp.to - xp.from)) * 100);
  el.innerHTML = `
    <button class="hero-level" data-go="xp" aria-label="Level ${xp.level}, ${xp.total} XP. Open XP">
      <span class="hero-label">Level</span>
      <span class="hero-number xp"><strong data-count="${xp.level}" data-count-key="level">${xp.level}</strong></span>
      <span class="progress"><span style="width:${pct}%"></span></span>
      <span class="level-caption">
        <span><span data-count="${xp.total}" data-count-key="xp-total">${xp.total}</span> XP</span>
        <span class="muted">${xp.to - xp.total} to level ${xp.level + 1}</span>
      </span>
    </button>
    <div class="hero-actions">
      <button class="btn" data-go="timer">Start focus</button>
      <button class="btn btn-quiet" data-go="notifications">Reminders</button>
    </div>`;
}

register({
  id: 'xp',
  title: 'XP',
  icon: '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
  order: 20,
  renderHomeHero, // η κορυφή της Αρχικής
  homeCard() {
    const xp = getXp();
    return {
      value: `Lv ${xp.level}`,
      label: `${xp.total} XP, streak ${xp.streak}`,
    };
  },
  render,
});
