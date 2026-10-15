// Προβολή ημέρας, σαν του Google Calendar: ώρες αριστερά, και πάνω τους ό,τι
// έκανες ή έχεις να κάνεις εκείνη τη μέρα, στις πραγματικές του ώρες:
//   - μαθήματα (με χρώμα ανάλογα με το αν πήγες)
//   - συνεδρίες Focus (Exam study / Reading / Workout), συγχρονισμένες με το Focus:
//     κάθε συνεδρία δείχνει από πότε έως πότε έγινε, π.χ. Workout 07:00–08:00
//   - συνεδρία που τρέχει τώρα ("In progress")
// Ανοίγει με animation όταν πατάς μια μέρα στο Schedule.
//
// Δεν αποθηκεύει τίποτα: διαβάζει από το calendar.js και το timer.js.

import { openSheet, escapeHtml } from '../core/router.js';
import {
  entriesForDate, onOpenDay, openClassSheet,
  toMin, fromMin, dateKey, startOfDay, addDays, duration,
} from './calendar.js';
import { getSessions, getActiveSession, ACTIVITIES } from './timer.js';

const HOUR_PX = 56;                  // ύψος μιας ώρας στο χρονοδιάγραμμα
const MIN_VISUAL_MIN = 24;           // πολύ μικρά γεγονότα σχεδιάζονται τουλάχιστον τόσο ψηλά
const px = (minutes) => (minutes * HOUR_PX) / 60;

// ===================== Τα γεγονότα μιας μέρας =====================

// Λίστα: { kind: 'class'|'focus', start, end (λεπτά από τα μεσάνυχτα), title, ... }
function eventsFor(date) {
  const dayStart = date.getTime();
  const dayEnd = dayStart + 86400000;
  const events = [];

  for (const entry of entriesForDate(date)) {
    if (entry.status === 'cancelled') continue; // τα ακυρωμένα δεν φαίνονται
    events.push({
      kind: 'class', entry, title: entry.title, status: entry.status || 'todo',
      start: toMin(entry.start), end: toMin(entry.end),
    });
  }

  // Συνεδρίες focus που τελείωσαν (και όσες σταμάτησες νωρίς, με διακεκομμένο περίγραμμα)
  for (const s of getSessions()) {
    if (s.endedAt <= dayStart || s.startedAt >= dayEnd) continue;
    events.push({
      kind: 'focus', session: s, activity: s.activity, stopped: !s.completed,
      title: ACTIVITIES[s.activity]?.label || 'Focus',
      start: Math.round((Math.max(s.startedAt, dayStart) - dayStart) / 60000),
      end: Math.round((Math.min(s.endedAt, dayEnd) - dayStart) / 60000),
    });
  }

  // Συνεδρία που τρέχει αυτή τη στιγμή: από την αρχή της έως τώρα
  const live = getActiveSession();
  if (live && live.startedAt < dayEnd && Date.now() > dayStart) {
    events.push({
      kind: 'focus', live: true, activity: live.activity,
      title: ACTIVITIES[live.activity]?.label || 'Focus',
      start: Math.round((Math.max(live.startedAt, dayStart) - dayStart) / 60000),
      end: Math.round((Math.min(Date.now(), dayEnd) - dayStart) / 60000),
    });
  }
  return events.sort((a, b) => a.start - b.start || b.end - a.end);
}

// Γεγονότα που επικαλύπτονται μπαίνουν σε στήλες δίπλα-δίπλα (όπως στο Google Calendar)
function layout(events) {
  const out = [];
  let cluster = [];
  let clusterEnd = -1;
  const flush = () => {
    const cols = Math.max(...cluster.map((c) => c.col)) + 1;
    cluster.forEach((c) => out.push({ ...c, cols }));
    cluster = [];
  };
  for (const e of events) {
    const vEnd = Math.max(e.end, e.start + MIN_VISUAL_MIN);
    if (cluster.length && e.start >= clusterEnd) { flush(); clusterEnd = -1; }
    const used = cluster.filter((c) => c.vEnd > e.start).map((c) => c.col);
    let col = 0;
    while (used.includes(col)) col++;
    cluster.push({ ...e, vEnd, col });
    clusterEnd = Math.max(clusterEnd, vEnd);
  }
  if (cluster.length) flush();
  return out;
}

// ===================== Σχεδίαση =====================

const dayTitle = (d) => d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

function summary(events) {
  const classes = events.filter((e) => e.kind === 'class').length;
  const focus = events.filter((e) => e.kind === 'focus' && !e.stopped).reduce((sum, e) => sum + (e.end - e.start), 0);
  const parts = [];
  if (classes) parts.push(`${classes} ${classes === 1 ? 'class' : 'classes'}`);
  if (focus) parts.push(`${duration(focus)} focus`);
  return parts.length ? parts.join(', ') : 'Nothing logged';
}

function eventHtml(e, i) {
  const top = px(e.start);
  const height = Math.max(px(e.end - e.start), px(MIN_VISUAL_MIN) - 2);
  const left = (e.col / e.cols) * 100;
  const width = 100 / e.cols;
  const cls = e.kind === 'class' ? `kind-class status-${e.status}` : `kind-${e.activity} ${e.stopped ? 'stopped' : ''} ${e.live ? 'live' : ''}`;
  const time = e.live ? `${fromMin(e.start)}, in progress` : `${fromMin(e.start)}–${fromMin(e.end % 1440 === 0 && e.end > 0 ? 1439 : e.end)}`;
  const sub = e.kind === 'class'
    ? (e.entry.room || '')
    : e.stopped ? 'stopped early' : '';
  return `
    <button class="dv-event ${cls}" data-ev="${i}"
            style="top:${top}px;height:${height}px;left:calc(${left}% + 1px);width:calc(${width}% - 3px)"
            aria-label="${escapeHtml(e.title)}, ${time}">
      <strong>${escapeHtml(e.title)}</strong>
      ${height >= 38 ? `<span>${time}${sub ? `, ${escapeHtml(sub)}` : ''}</span>` : ''}
    </button>`;
}

// Η ώρα που πρέπει να φαίνεται όταν ανοίγει (ώστε να μη ψάχνεις στις 3 τα ξημερώματα)
function startHour(date, events) {
  const now = new Date();
  if (dateKey(date) === dateKey(now)) return Math.max(0, now.getHours() - 2);
  if (events.length) return Math.max(0, Math.floor(events[0].start / 60) - 1);
  return 7;
}

function legend() {
  return `
    <div class="dv-legend" aria-hidden="true">
      <span><i class="lg kind-class"></i>Class</span>
      <span><i class="lg kind-study"></i>Study</span>
      <span><i class="lg kind-read"></i>Reading</span>
      <span><i class="lg kind-workout"></i>Workout</span>
    </div>`;
}

// ===================== Το φύλλο =====================

export function openDayView(startDate, afterClose) {
  let day = startOfDay(startDate);

  openSheet('', (root, close) => {
    root.classList.add('day-sheet');
    let events = [];

    const paint = (slide = '') => {
      events = layout(eventsFor(day));
      const isToday = dateKey(day) === dateKey(new Date());
      const now = new Date();
      const nowMin = now.getHours() * 60 + now.getMinutes();

      root.innerHTML = `
        <div class="dv-head">
          <button class="icon-btn" data-step="-1" aria-label="Previous day">‹</button>
          <div class="dv-title"><strong>${dayTitle(day)}</strong><span>${summary(events)}</span></div>
          <button class="icon-btn" data-step="1" aria-label="Next day">›</button>
          <button class="icon-btn dv-close" data-close aria-label="Close">×</button>
        </div>
        ${legend()}
        <div class="dv-body ${slide}">
          <div class="dv-grid" style="height:${24 * HOUR_PX}px">
            ${Array.from({ length: 24 }, (_, h) => `
              <div class="dv-hour" style="top:${h * HOUR_PX}px"><span>${h === 0 ? '' : `${String(h).padStart(2, '0')}:00`}</span></div>`).join('')}
            <div class="dv-events">${events.map(eventHtml).join('')}</div>
            ${isToday ? `<div class="dv-now" style="top:${px(nowMin)}px"><i></i></div>` : ''}
          </div>
        </div>`;

      const body = root.querySelector('.dv-body');
      body.scrollTop = startHour(day, events) * HOUR_PX;
    };
    paint();

    root.addEventListener('click', (ev) => {
      const b = ev.target.closest('button');
      if (!b) return;
      const d = b.dataset;
      if ('close' in d) { close(); return; }
      if (d.step) {
        const step = Number(d.step);
        day = addDays(day, step);
        paint(step > 0 ? 'slide-next' : 'slide-prev');
        return;
      }
      if (d.ev !== undefined) {
        const e = events[Number(d.ev)];
        if (!e) return;
        if (e.kind === 'class') openClassSheet(e.entry, () => paint());
        else focusDetails(e);
      }
    });
  }, () => { if (afterClose) afterClose(); });
}

// Λεπτομέρειες μιας συνεδρίας focus
function focusDetails(e) {
  const s = e.session;
  const when = e.live ? `${fromMin(e.start)}, still running` : `${fromMin(e.start)}–${fromMin(e.end)}`;
  let result = 'In progress';
  if (!e.live) {
    if (s.completed) result = `Completed, +${s.earned} XP`;
    else if (s.reason === 'emergency') result = 'Stopped early, emergency pass';
    else result = `Stopped early${s.penalty ? `, −${s.penalty} XP` : ''}`;
  }
  openSheet(`
    <h2>${escapeHtml(e.title)}</h2>
    <p class="muted">${when}${e.live ? '' : `, ${duration(e.end - e.start)}`}</p>
    <p>${result}</p>
    <div class="stack"><button class="btn btn-quiet btn-block" data-close>Done</button></div>`,
  (root, close) => root.querySelector('[data-close]').addEventListener('click', close));
}

// Δηλώνουμε στο Schedule πώς να ανοίγει την προβολή ημέρας
onOpenDay(openDayView);
