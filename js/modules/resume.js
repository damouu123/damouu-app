// Εβδομαδιαίο resume: παρουσίες, απουσίες, ποσοστό, XP, streak
// και σύγκριση με την προηγούμενη εβδομάδα.
//
// Δεν αποθηκεύει τίποτα: όλα υπολογίζονται από τις παρουσίες του calendar
// και τα XP του xp module, κάθε φορά που ανοίγεις την οθόνη.

import { register } from '../core/registry.js';
import { navigate, escapeHtml } from '../core/router.js';
import {
  validAttendance, entriesForDate, weekStart, addDays, dateKey, weekHeading,
} from './calendar.js';
import { xpBetween, streakUntil } from './xp.js';

// ===================== Υπολογισμός =====================

// Όλα τα στατιστικά μιας εβδομάδας (ws = η Δευτέρα της)
export function weekStats(ws) {
  const from = dateKey(ws);
  const to = dateKey(addDays(ws, 6));
  const records = validAttendance().filter((r) => r.date >= from && r.date <= to);

  const count = (s) => records.filter((r) => r.status === s).length;
  const attended = count('attended');
  const left = count('left');
  const missed = count('missed');
  const cancelled = count('cancelled');
  const counted = attended + left + missed; // το cancelled δεν μετράει

  // Μαθήματα της εβδομάδας που τελείωσαν αλλά δεν τα σημείωσες
  const now = new Date();
  let unmarked = 0;
  for (let i = 0; i < 7; i++) {
    unmarked += entriesForDate(addDays(ws, i)).filter((e) => !e.status && e.endsAt <= now).length;
  }

  // Ανά μάθημα: σε πόσα από όσα έγιναν εμφανίστηκες
  const courses = new Map();
  for (const r of records) {
    if (r.status === 'cancelled') continue;
    const c = courses.get(r.title) || { title: r.title, shown: 0, total: 0 };
    c.total += 1;
    if (r.status !== 'missed') c.shown += 1;
    courses.set(r.title, c);
  }

  return {
    from,
    to,
    attended,
    left,
    missed,
    cancelled,
    counted,
    // Ποσοστό παρουσίας: Went + Left early (εμφανίστηκες) προς όσα μετράνε
    rate: counted ? (attended + left) / counted : null,
    xp: xpBetween(from, to),
    streak: streakUntil(to),
    unmarked,
    courses: [...courses.values()].sort((a, b) => a.shown / a.total - b.shown / b.total),
  };
}

const pct = (rate) => Math.round(rate * 100);

// ===================== Οθόνη =====================

// Σύγκριση σε μία σύντομη φράση: "+25 vs last week"
function compareText(now, prev) {
  if (now.rate === null || prev.rate === null) return '';
  const diff = pct(now.rate) - pct(prev.rate);
  if (diff === 0) return 'same as last week';
  return `${diff > 0 ? '+' : '−'}${Math.abs(diff)} vs last week`;
}

let ws = null; // η Δευτέρα της εβδομάδας που βλέπουμε

function render(el) {
  if (!ws) ws = weekStart(new Date());
  const isCurrent = dateKey(ws) === dateKey(weekStart(new Date()));
  const s = weekStats(ws);
  const p = weekStats(addDays(ws, -7));
  const { range, rel } = weekHeading([ws, addDays(ws, 4)]);
  const went = s.attended + s.left; // "πήγες" = Went + Left early (εμφανίστηκες)

  const hero = s.rate === null
    ? `<p class="hero-label">Attendance</p>
       <p class="hero-number ink"><strong>–</strong></p>
       <p class="hero-hint">No classes marked yet.</p>`
    : `<p class="hero-label">Attendance</p>
       <p class="hero-number ink"><strong>${pct(s.rate)}</strong><span>%</span></p>
       <p class="hero-hint">${went} of ${s.counted} ${s.counted === 1 ? 'class' : 'classes'}${compareText(s, p) ? `, ${compareText(s, p)}` : ''}</p>`;

  const reminder = s.unmarked
    ? `<div class="banner" role="status">
         <div class="banner-body">
           <p class="banner-title">${s.unmarked} ${s.unmarked === 1 ? 'class' : 'classes'} to mark</p>
           <p class="banner-text">Unmarked classes don't count.</p>
         </div>
         <button class="btn btn-small" data-go="calendar">Mark</button>
       </div>`
    : '';

  const courses = s.courses.length
    ? `<h2 class="section-title">By course</h2>
       <ul class="list">${s.courses.map((c) => `
        <li><div class="row row-static">
          <span class="row-text">
            <span class="row-title">${escapeHtml(c.title)}</span>
            <span class="row-sub">${c.shown} of ${c.total}</span>
          </span>
          <span class="row-value ${c.shown < c.total ? 'is-low' : ''}">${pct(c.shown / c.total)}%</span>
        </div></li>`).join('')}</ul>`
    : '';

  el.innerHTML = `
    <div class="week-nav">
      <button class="icon-btn" data-week="-1" aria-label="Previous week">‹</button>
      <button class="week-label" data-week="0" aria-label="Back to this week">
        <strong>${range}</strong><span>${rel}</span>
      </button>
      <button class="icon-btn" data-week="1" aria-label="Next week" ${isCurrent ? 'disabled' : ''}>›</button>
    </div>

    <section class="hero review-hero">${hero}</section>
    ${reminder}

    <div class="stats">
      <div class="stat"><strong>${went}</strong><span>Went</span></div>
      <div class="stat"><strong class="${s.missed ? 'is-low' : ''}">${s.missed}</strong><span>Missed</span></div>
      <div class="stat"><strong class="xp-plus">+${s.xp}</strong><span>XP</span></div>
      <div class="stat"><strong>${s.streak}</strong><span>Streak</span></div>
    </div>

    ${courses}`;

  el.onclick = (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.dataset.go) { navigate(b.dataset.go); return; }
    if (b.dataset.week) {
      const n = Number(b.dataset.week);
      ws = n === 0 ? weekStart(new Date()) : addDays(ws, 7 * n);
      render(el);
    }
  };
}

// ===================== Καταχώρηση =====================

register({
  id: 'resume',
  title: 'Weekly review',
  icon: '<path d="M5 20v-8M12 20V5M19 20v-5"/>',
  order: 30,
  homeCard() {
    const s = weekStats(weekStart(new Date()));
    if (s.rate === null) return { value: '', label: 'No classes marked this week' };
    return { value: `${pct(s.rate)}%`, label: `Attendance this week, +${s.xp} XP` };
  },
  render,
  // Την επόμενη φορά ξεκινάμε πάλι από την τρέχουσα εβδομάδα
  unmount() {
    ws = null;
  },
});
