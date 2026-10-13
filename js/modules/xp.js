// XP πανεπιστημίου: πόντοι από παρουσίες, levels και streak.
//
// Τα XP ΔΕΝ αποθηκεύονται: υπολογίζονται κάθε φορά από τις παρουσίες
// του calendar. Έτσι, αν αλλάξεις μια παρουσία, τα XP διορθώνονται μόνα τους.
// Αποθηκεύουμε μόνο το "τελευταίο σύνολο που είδαμε", για να ξέρουμε
// πότε να δείξουμε "+10 XP" ή "Level 4 reached".

import { register, on } from '../core/registry.js';
import { moduleStore } from '../core/storage.js';
import { navigate, escapeHtml, toast } from '../core/router.js';
import { validAttendance, STATUSES, parseKey } from './calendar.js';

const store = moduleStore('xp');

// Πόσους πόντους δίνει κάθε κατάσταση. Το cancelled δεν μετράει καθόλου.
export const POINTS = { attended: 10, left: 4, missed: 0 };

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

// Όλες οι παρουσίες που μετράνε (του τωρινού προγράμματος, χωρίς cancelled),
// με χρονολογική σειρά
export function countedRecords() {
  return validAttendance()
    .filter((r) => r.status !== 'cancelled')
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
}

// XP σε ένα διάστημα ημερομηνιών, π.χ. για το εβδομαδιαίο resume.
// from/to: "2026-10-12" (και τα δύο μέσα στο διάστημα)
export function xpBetween(from, to) {
  return countedRecords()
    .filter((r) => r.date >= from && r.date <= to)
    .reduce((sum, r) => sum + pointsFor(r.status), 0);
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
  const records = countedRecords();
  const total = records.reduce((sum, r) => sum + pointsFor(r.status), 0);
  const level = levelFor(total);
  const { current, best } = streaks(records);
  return {
    total,
    level,
    from: levelStart(level),
    to: levelStart(level + 1),
    streak: current,
    bestStreak: best,
    records,
  };
}

// ===================== Ανταπόκριση σε αλλαγές παρουσίας =====================

// Κρατάμε σιωπηλά το τωρινό σύνολο όταν ανοίγει το app και όταν αλλάζει
// το πρόγραμμα. Έτσι το "+10 XP" δείχνει μόνο ό,τι κέρδισες μόλις τώρα.
function syncSilently() {
  const { total, level } = getXp();
  store.set('lastTotal', total);
  store.set('lastLevel', level);
}
syncSilently();
on('schedule:changed', syncSilently);

// Κάθε φορά που σημειώνεις παρουσία, συγκρίνουμε με το προηγούμενο σύνολο
on('attendance:changed', () => {
  const { total, level } = getXp();
  const prevTotal = store.get('lastTotal', 0);
  const prevLevel = store.get('lastLevel', 1);
  if (total > prevTotal) {
    toast(level > prevLevel ? `+${total - prevTotal} XP. Level ${level} reached` : `+${total - prevTotal} XP`);
  }
  store.set('lastTotal', total);
  store.set('lastLevel', level);
});

// ===================== Οθόνη =====================

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 'es'}`;

function render(el) {
  const xp = getXp();
  const span = xp.to - xp.from;
  const pct = Math.round(((xp.total - xp.from) / span) * 100);
  const recent = xp.records.slice(-10).reverse();

  const history = recent.length
    ? `<ul class="list">${recent.map((r) => {
      const day = parseKey(r.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
      const pts = pointsFor(r.status);
      return `
        <li><div class="row row-static">
          <span class="row-text">
            <span class="row-title">${escapeHtml(r.title)}</span>
            <span class="row-sub">${day}, ${STATUSES[r.status].label.toLowerCase()}</span>
          </span>
          <span class="row-value ${pts ? 'xp-plus' : 'muted'}">${pts ? `+${pts}` : '0'}</span>
        </div></li>`;
    }).join('')}</ul>`
    : `<div class="placeholder">
        <p>Mark your first class to start earning XP.</p>
        <button class="btn btn-block" data-go="calendar" style="margin-top:14px">Open schedule</button>
      </div>`;

  el.innerHTML = `
    <section class="level">
      <p class="hero-label">Level</p>
      <p class="level-number">${xp.level}</p>
      <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}">
        <span style="width:${pct}%"></span>
      </div>
      <p class="level-caption">
        <span>${xp.total} XP</span>
        <span class="muted">${xp.to - xp.total} XP to level ${xp.level + 1}</span>
      </p>
    </section>

    <h2 class="section-title">Streak</h2>
    <ul class="list">
      <li><div class="row row-static">
        <span class="row-text"><span class="row-title">Current</span>
          <span class="row-sub">Classes in a row without missing one</span></span>
        <span class="row-value">${xp.streak}</span>
      </div></li>
      <li><div class="row row-static">
        <span class="row-text"><span class="row-title">Best</span>
          <span class="row-sub">${plural(xp.bestStreak, 'class')}</span></span>
        <span class="row-value">${xp.bestStreak}</span>
      </div></li>
    </ul>

    <h2 class="section-title">How you earn XP</h2>
    <ul class="list">
      <li><div class="row row-static"><span class="row-text"><span class="row-title">Went</span></span>
        <span class="row-value xp-plus">+${POINTS.attended}</span></div></li>
      <li><div class="row row-static"><span class="row-text"><span class="row-title">Left early</span>
        <span class="row-sub">Still keeps your streak</span></span>
        <span class="row-value xp-plus">+${POINTS.left}</span></div></li>
      <li><div class="row row-static"><span class="row-text"><span class="row-title">Missed</span>
        <span class="row-sub">Resets your streak</span></span>
        <span class="row-value muted">0</span></div></li>
      <li><div class="row row-static"><span class="row-text"><span class="row-title">Cancelled</span>
        <span class="row-sub">Doesn't count either way</span></span>
        <span class="row-value muted">–</span></div></li>
    </ul>

    <h2 class="section-title">Recent</h2>
    ${history}`;

  el.onclick = (ev) => {
    const b = ev.target.closest('[data-go]');
    if (b) navigate(b.dataset.go);
  };
}

// ===================== Καταχώρηση =====================

register({
  id: 'xp',
  title: 'XP',
  icon: '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
  order: 20,
  homeCard() {
    const xp = getXp();
    return {
      value: `Lv ${xp.level}`,
      label: `${xp.total} XP, streak ${xp.streak}`,
    };
  },
  render,
});
