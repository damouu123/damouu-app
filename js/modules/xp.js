// XP: πόντοι από παρουσίες, focus, scroll και ημερήσιο στόχο. Levels και streak.
//
// Τα XP ΔΕΝ αποθηκεύονται: υπολογίζονται κάθε φορά από τις "κινήσεις"
// των άλλων modules, όπως το υπόλοιπο του πορτοφολιού:
//   διάλεξη      Went +10, Left early +4, Missed 0 (Cancelled δεν μετράει)
//   focus        +1 XP ανά λεπτό ολοκληρωμένης συνεδρίας
//   scroll       −1 XP ανά λεπτό που καταγράφεις
//   στόχος μέρας +20 αν σε μια μέρα με μαθήματα πήγες σε όλα (ή έφυγες νωρίς)
//                και έκανες λιγότερο από 30' scroll
// Το σύνολο δεν πέφτει κάτω από 0. Αποθηκεύουμε μόνο το "τελευταίο σύνολο
// που είδαμε", για να ξέρουμε πότε να δείξουμε "+25 XP" ή "−30 XP".

import { register, on } from '../core/registry.js';
import { moduleStore } from '../core/storage.js';
import { navigate, escapeHtml, toast, openSheet } from '../core/router.js';
import {
  validAttendance, entriesForDate, STATUSES, parseKey, dateKey, startOfDay, addDays,
} from './calendar.js';
import { getSessions, ACTIVITIES } from './timer.js';

const store = moduleStore('xp');
// Τα λεπτά scroll τα καταγράφει το wallet. Τα διαβάζουμε από την αποθήκευσή
// του (και όχι κάνοντας import το wallet.js), για να μην "κυνηγάνε" τα δύο
// αρχεία το ένα το άλλο (το wallet ήδη χρησιμοποιεί το xp μέσω του resume).
const walletStore = moduleStore('wallet');

// ===================== Κανόνες =====================

// Πόσους πόντους δίνει κάθε κατάσταση. Το cancelled δεν μετράει καθόλου.
export const POINTS = { attended: 10, left: 4, missed: 0 };
export const FOCUS_XP_PER_MIN = 1;
export const SCROLL_XP_PER_MIN = 1;
export const GOAL_BONUS = 20;
export const GOAL_SCROLL_LIMIT = 30; // ο στόχος θέλει ΛΙΓΟΤΕΡΑ από τόσα λεπτά scroll

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

// Λεπτά scroll ανά μέρα: { "2026-10-14": 35, ... }
function scrollByDay() {
  const out = {};
  for (const s of walletStore.get('spends', [])) {
    const key = dateKey(new Date(s.at));
    out[key] = (out[key] || 0) + s.minutes;
  }
  return out;
}

// Ο ημερήσιος στόχος για μια μέρα:
//   classes  μαθήματα που έγιναν (όχι ακυρωμένα)
//   done     σε πόσα πήγες ή έφυγες νωρίς
//   scroll   λεπτά scroll εκείνη τη μέρα
//   met      πέτυχε ο στόχος; (μόνο σε μέρες με μαθήματα)
export function dailyGoal(date, scrollMap = scrollByDay()) {
  const key = dateKey(date);
  const live = entriesForDate(date).filter((e) => e.status !== 'cancelled');
  const done = live.filter((e) => e.status === 'attended' || e.status === 'left').length;
  const scroll = scrollMap[key] || 0;
  return {
    key,
    classes: live.length,
    done,
    scroll,
    met: live.length > 0 && done === live.length && scroll < GOAL_SCROLL_LIMIT,
  };
}

// Οι μέρες που πέτυχες τον στόχο, από την πρώτη σημειωμένη παρουσία έως σήμερα
function goalDays() {
  const recs = validAttendance();
  if (!recs.length) return [];
  const first = recs.reduce((min, r) => (r.date < min ? r.date : min), recs[0].date);
  const today = startOfDay(new Date());
  const scroll = scrollByDay();
  const out = [];
  for (let d = parseKey(first); d <= today; d = addDays(d, 1)) {
    const g = dailyGoal(d, scroll);
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
  for (const sp of walletStore.get('spends', [])) {
    events.push({
      at: sp.at, date: dateKey(new Date(sp.at)), amount: -sp.minutes * SCROLL_XP_PER_MIN,
      kind: 'scroll', title: sp.where, sub: `${sp.minutes} min scroll`,
    });
  }
  for (const g of goalDays()) {
    events.push({
      at: timeOf(g.key, '23:59'), date: g.key, amount: GOAL_BONUS,
      kind: 'goal', title: 'Daily goal', sub: 'every class, little scroll',
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
// το πρόγραμμα. Έτσι τα "+25 XP" / "−30 XP" δείχνουν μόνο ό,τι άλλαξε τώρα.
function syncSilently() {
  const { total, level } = getXp();
  store.set('lastTotal', total);
  store.set('lastLevel', level);
  store.set('goalToday', { key: dateKey(new Date()), met: dailyGoal(new Date()).met });
}
syncSilently();
on('schedule:changed', syncSilently);

// Μετά από παρουσία, focus ή scroll: πόσο άλλαξαν τα XP;
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
  const goalNote = metNow && !metBefore ? '. Daily goal reached' : !metNow && metBefore ? '. Daily goal lost' : '';

  if (diff > 0) {
    toast(level > prevLevel ? `+${diff} XP. Level ${level} reached` : `+${diff} XP${goalNote}`);
  } else if (diff < 0) {
    toast(level < prevLevel ? `−${-diff} XP. Back to level ${level}` : `−${-diff} XP${goalNote}`);
  }
  store.set('lastTotal', total);
  store.set('lastLevel', level);
  store.set('goalToday', { key: today, met: metNow });
}
on('attendance:changed', announce);
on('focus:finished', announce);
on('wallet:changed', announce);

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
      ${rule('Scroll', `−${SCROLL_XP_PER_MIN} per min`, 'is-low')}
      ${rule('Daily goal', `+${GOAL_BONUS}`)}
    </ul>
    <p class="muted small-print">Daily goal: on a day with classes, go to every one and scroll less than ${GOAL_SCROLL_LIMIT} min.
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
      <p class="level-number">${xp.level}</p>
      <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct}">
        <span style="width:${pct}%"></span>
      </div>
      <p class="level-caption">
        <span>${xp.total} XP</span>
        <span class="muted">${xp.to - xp.total} to level ${xp.level + 1}</span>
      </p>
    </section>

    <div class="stats">
      <div class="stat"><strong>${xp.streak}</strong><span>Streak</span></div>
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
