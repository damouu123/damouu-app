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

// "12 points more than last week" κ.λπ.
function compareRate(now, prev) {
  if (now.rate === null) return '';
  if (prev.rate === null) return 'No marked classes last week to compare with.';
  const diff = pct(now.rate) - pct(prev.rate);
  if (diff === 0) return 'Same as last week.';
  const pts = Math.abs(diff) === 1 ? 'point' : 'points';
  return diff > 0
    ? `${diff} ${pts} more than last week.`
    : `${-diff} ${pts} less than last week.`;
}

// ===================== Οθόνη =====================

let ws = null; // η Δευτέρα της εβδομάδας που βλέπουμε

function row(title, sub, value, valueClass = '') {
  return `
    <li><div class="row row-static">
      <span class="row-text">
        <span class="row-title">${title}</span>
        ${sub ? `<span class="row-sub">${sub}</span>` : ''}
      </span>
      <span class="row-value ${valueClass}">${value}</span>
    </div></li>`;
}

function render(el) {
  if (!ws) ws = weekStart(new Date());
  const isCurrent = dateKey(ws) === dateKey(weekStart(new Date()));
  const s = weekStats(ws);
  const p = weekStats(addDays(ws, -7));
  const { range, rel } = weekHeading([ws, addDays(ws, 4)]);

  const xpDiff = s.xp - p.xp;
  const xpSub = p.counted ? `Last week: ${p.xp} XP` : '';
  const missedSub = p.counted ? `Last week: ${p.missed}` : '';

  const hero = s.rate === null
    ? `<p class="hero-label">Attendance</p>
       <p class="hero-number ink"><strong>–</strong></p>
       <p class="hero-hint">No classes marked this week yet.</p>`
    : `<p class="hero-label">Attendance</p>
       <p class="hero-number ink"><strong>${pct(s.rate)}</strong><span>%</span></p>
       <p class="hero-hint">
         You showed up to ${s.attended + s.left} of ${s.counted} ${s.counted === 1 ? 'class' : 'classes'}.
         ${compareRate(s, p)}
       </p>`;

  const reminder = s.unmarked
    ? `<div class="notice">
         <p>${s.unmarked} ${s.unmarked === 1 ? 'class this week isn\'t' : 'classes this week aren\'t'} marked yet, so ${s.unmarked === 1 ? 'it doesn\'t' : 'they don\'t'} count.</p>
         <button class="btn btn-quiet btn-block" data-go="calendar">Mark them in Schedule</button>
       </div>`
    : '';

  const courses = s.courses.length
    ? `<h2 class="section-title">By course</h2>
       <ul class="list">${s.courses.map((c) => row(
        escapeHtml(c.title),
        `${c.shown} of ${c.total}`,
        `${pct(c.shown / c.total)}%`,
        c.shown < c.total ? 'is-low' : '',
      )).join('')}</ul>`
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

    <h2 class="section-title">This week in numbers</h2>
    <ul class="list">
      ${row('Went', '', s.attended)}
      ${row('Left early', '', s.left)}
      ${row('Missed', missedSub, s.missed, s.missed ? 'is-low' : '')}
      ${row('Cancelled', 'Not counted', s.cancelled, 'muted')}
      ${row('XP earned', xpSub, `+${s.xp}`, 'xp-plus')}
      ${p.counted && xpDiff !== 0
        ? row(
          'Compared with last week',
          isCurrent ? 'This week isn\'t over yet' : '',
          `${xpDiff > 0 ? '+' : ''}${xpDiff} XP`,
          xpDiff < 0 ? 'is-low' : 'xp-plus',
        )
        : ''}
      ${row('Streak', isCurrent ? 'Classes in a row right now' : 'At the end of this week', s.streak)}
    </ul>

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
