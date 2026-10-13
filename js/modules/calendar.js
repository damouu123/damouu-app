// Calendar διαλέξεων: εβδομαδιαίο πρόγραμμα, παρουσίες και αυτόματα κενά.
//
// Δεδομένα (στο localStorage, μέσω moduleStore('calendar')):
//   schedule    η λίστα μαθημάτων (αν λείπει, παίρνουμε το seed από data/schedule.js)
//   attendance  { "2026-10-13|db-tut-tue": { status, title, type, date, start, at } }
//               ένα κλειδί ανά μάθημα ανά ημερομηνία. Μετράνε μόνο όσα
//               ταιριάζουν με το τωρινό πρόγραμμα (δες validAttendance).
//
// Τα export functions παρακάτω τα χρησιμοποιούν και άλλα modules (XP, εβδομάδα,
// ειδοποιήσεις), ώστε να μη χρειάζεται να ξέρουν πώς αποθηκεύονται τα δεδομένα.

import { register, emit } from '../core/registry.js';
import { moduleStore } from '../core/storage.js';
import { navigate, escapeHtml, setTitle } from '../core/router.js';
import { SEED_SCHEDULE } from '../../data/schedule.js';

const store = moduleStore('calendar');
const MIN_GAP = 30; // λεπτά: μικρότερα κενά δεν τα δείχνουμε

// Οι 4 καταστάσεις. Το "cancelled" δεν μετράει ούτε σε XP ούτε σε στατιστικά.
export const STATUSES = {
  attended: { label: 'Went' },
  left: { label: 'Left early' },
  missed: { label: 'Missed' },
  cancelled: { label: 'Cancelled' },
};

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// ===================== Βοηθητικά για ημερομηνίες =====================

const pad = (n) => String(n).padStart(2, '0');

// Date -> "2026-10-13" (τοπική ώρα, όχι UTC)
export function dateKey(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// "2026-10-13" -> Date (μεσάνυχτα)
export function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

// 1 = Δευτέρα ... 7 = Κυριακή (το JavaScript ξεκινάει από Κυριακή = 0)
export function weekday(d) {
  return ((d.getDay() + 6) % 7) + 1;
}

// Η Δευτέρα της εβδομάδας της d
export function weekStart(d) {
  return addDays(startOfDay(d), -(weekday(d) - 1));
}

// "09:30" -> 570 λεπτά από τα μεσάνυχτα
export function toMin(time) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function fromMin(min) {
  return `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
}

function atTime(date, time) {
  const d = startOfDay(date);
  d.setMinutes(toMin(time));
  return d;
}

const sameDay = (a, b) => dateKey(a) === dateKey(b);

function duration(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

// ===================== Δεδομένα =====================

export function getSchedule() {
  return store.get('schedule', null) || SEED_SCHEDULE.map((e) => ({ ...e }));
}

function saveSchedule(list) {
  store.set('schedule', list);
  emit('schedule:changed');
}

export function getAttendance() {
  return store.get('attendance', {});
}

// Μόνο οι παρουσίες που ταιριάζουν με το ΤΩΡΙΝΟ πρόγραμμα: το μάθημα
// υπάρχει ακόμα και γίνεται εκείνη τη μέρα της εβδομάδας. Αυτές μετράνε
// σε XP και στατιστικά. Οι υπόλοιπες (π.χ. από μάθημα που σβήστηκε ή
// μπήκε λάθος μέρα) δεν σβήνονται, απλώς αγνοούνται. Αν το μάθημα
// ξαναμπεί στο πρόγραμμα, ξαναμετράνε.
// Επιστρέφει λίστα: [{ key, id, status, title, type, date, start }]
export function validAttendance() {
  const byId = new Map(getSchedule().map((e) => [e.id, e]));
  return Object.entries(getAttendance())
    .map(([key, r]) => ({ key, id: key.split('|')[1], ...r }))
    .filter((r) => {
      const e = byId.get(r.id);
      return e && e.day === weekday(parseKey(r.date));
    })
    .map((r) => {
      const e = byId.get(r.id);
      return { ...r, title: e.title, type: e.type, start: e.start };
    });
}

// Τα μαθήματα μιας ημέρας, ταξινομημένα, μαζί με την κατάστασή τους
export function entriesForDate(date) {
  const key = dateKey(date);
  const att = getAttendance();
  const wd = weekday(date);
  return getSchedule()
    .filter((e) => e.day === wd)
    .sort((a, b) => toMin(a.start) - toMin(b.start))
    .map((e) => ({
      ...e,
      date: key,
      key: `${key}|${e.id}`,
      status: att[`${key}|${e.id}`]?.status || null,
      startsAt: atTime(date, e.start),
      endsAt: atTime(date, e.end),
    }));
}

// status: 'attended' | 'left' | 'missed' | 'cancelled' | null (= σβήσιμο)
export function setStatus(entry, status) {
  store.update('attendance', (att) => {
    if (status) {
      att[entry.key] = {
        status, title: entry.title, type: entry.type, date: entry.date, start: entry.start, at: Date.now(),
      };
    } else {
      delete att[entry.key];
    }
    return att;
  }, {});
  emit('attendance:changed', { date: entry.date, id: entry.id, status });
}

// Κενά μέσα στη μέρα: από την αρχή του πρώτου μαθήματος ως το τέλος
// του τελευταίου, ό,τι δεν καλύπτεται από μάθημα που γίνεται κανονικά.
// "unexpected" = κενό που δημιουργήθηκε επειδή ακυρώθηκε μάθημα.
export function gapsForDate(date) {
  const all = entriesForDate(date);
  if (!all.length) return [];
  const dayStart = Math.min(...all.map((e) => toMin(e.start)));
  const dayEnd = Math.max(...all.map((e) => toMin(e.end)));
  const active = all.filter((e) => e.status !== 'cancelled');
  const cancelled = all.filter((e) => e.status === 'cancelled');

  const gaps = [];
  const add = (start, end) => {
    if (end - start < MIN_GAP) return;
    const unexpected = cancelled.some((c) => toMin(c.start) < end && toMin(c.end) > start);
    gaps.push({ start, end, unexpected });
  };

  let cursor = dayStart;
  for (const e of active) {
    add(cursor, toMin(e.start));
    cursor = Math.max(cursor, toMin(e.end));
  }
  add(cursor, dayEnd);
  return gaps;
}

// Το επόμενο μάθημα που δεν έχει ακυρωθεί (ψάχνει έως 7 μέρες μπροστά)
export function nextClass(now = new Date()) {
  for (let i = 0; i < 8; i++) {
    const found = entriesForDate(addDays(startOfDay(now), i))
      .find((e) => e.status !== 'cancelled' && e.startsAt > now);
    if (found) return found;
  }
  return null;
}

// Μαθήματα που τελείωσαν και δεν τα έχεις σημειώσει
function unmarked(date, now) {
  return entriesForDate(date).filter((e) => !e.status && e.endsAt <= now);
}

function metaLine(e) {
  const type = e.type === 'tutorial' ? `Tutorial${e.group ? ` (${e.group})` : ''}` : 'Lecture';
  return [type, e.room, e.teacher].filter(Boolean).join(', ');
}

// ===================== Οθόνη: εβδομάδα =====================

let selected = null; // η μέρα που βλέπουμε
let changing = null; // το key του μαθήματος που αλλάζουμε κατάσταση

// Ποιες μέρες δείχνουμε: Δευτέρα–Παρασκευή, και Σαβ/Κυρ μόνο αν έχουν μάθημα
function visibleDays(ws) {
  const sched = getSchedule();
  const weekend = [6, 7].filter((d) => sched.some((e) => e.day === d));
  return [1, 2, 3, 4, 5, ...weekend].map((d) => addDays(ws, d - 1));
}

// Σήμερα, εκτός αν είναι Σαββατοκύριακο χωρίς μαθήματα: τότε η επόμενη Δευτέρα
function defaultDay() {
  const today = startOfDay(new Date());
  const wd = weekday(today);
  if (wd >= 6 && !getSchedule().some((e) => e.day === wd)) return addDays(weekStart(today), 7);
  return today;
}

function weekHeading(days) {
  const month = (d) => d.toLocaleDateString('en-GB', { month: 'long' });
  const a = days[0];
  const b = days[days.length - 1];
  const range = a.getMonth() === b.getMonth()
    ? `${a.getDate()}–${b.getDate()} ${month(b)}`
    : `${a.getDate()} ${month(a)} – ${b.getDate()} ${month(b)}`;
  const diff = Math.round((weekStart(a) - weekStart(new Date())) / (7 * 86400000));
  const rel = diff === 0 ? 'This week'
    : diff === -1 ? 'Last week'
    : diff === 1 ? 'Next week'
    : diff < 0 ? `${-diff} weeks ago` : `In ${diff} weeks`;
  return { range, rel };
}

function classHtml(e, now) {
  const started = e.startsAt <= now;
  let actions;

  if (e.status && changing !== e.key) {
    // Έχει σημειωθεί: δείχνουμε την κατάσταση, πάτημα = αλλαγή
    actions = `
      <button class="status-pill is-${e.status}" data-change="${e.key}">
        ${STATUSES[e.status].label}<span>Change</span>
      </button>`;
  } else if (started) {
    // Ξεκίνησε: όλες οι επιλογές (πάτημα στην ήδη επιλεγμένη = σβήσιμο)
    actions = `<div class="choices">${Object.entries(STATUSES).map(([s, { label }]) => `
      <button class="choice is-${s} ${e.status === s ? 'selected' : ''}" data-set="${s}" data-key="${e.key}">${label}</button>`).join('')}
    </div>`;
  } else {
    // Δεν ξεκίνησε: μόνο ακύρωση (π.χ. το ανακοίνωσε ο καθηγητής)
    const isCancelled = e.status === 'cancelled';
    actions = `
      <div class="upcoming">
        <span class="muted">Starts at ${e.start}</span>
        <button class="link-btn" data-set="${isCancelled ? 'none' : 'cancelled'}" data-key="${e.key}">
          ${isCancelled ? 'Not cancelled after all' : 'Mark as cancelled'}
        </button>
      </div>`;
  }

  return `
    <article class="class ${e.status ? `is-${e.status}` : ''}">
      <div class="class-time"><span>${e.start}</span><span>${e.end}</span></div>
      <div class="class-body">
        <h3>${escapeHtml(e.title)}</h3>
        <p class="class-meta">${escapeHtml(metaLine(e))}</p>
        ${actions}
      </div>
    </article>`;
}

function gapHtml(g) {
  return `
    <div class="gap ${g.unexpected ? 'is-unexpected' : ''}">
      <span>${g.unexpected ? 'Free, class cancelled' : 'Free'} ${fromMin(g.start)}–${fromMin(g.end)}</span>
      <span>${duration(g.end - g.start)}</span>
    </div>`;
}

function renderWeek(el) {
  const now = new Date();
  if (!selected) selected = defaultDay();
  const days = visibleDays(weekStart(selected));
  if (!days.some((d) => sameDay(d, selected))) selected = days[0];

  const { range, rel } = weekHeading(days);
  const entries = entriesForDate(selected);

  // Μαθήματα και κενά σε μία λίστα, με σειρά ώρας
  const items = [
    ...entries.map((e) => ({ at: toMin(e.start), html: classHtml(e, now) })),
    ...gapsForDate(selected).map((g) => ({ at: g.start, html: gapHtml(g) })),
  ].sort((a, b) => a.at - b.at);

  const strip = days.map((d) => {
    const cls = [sameDay(d, selected) && 'selected', sameDay(d, now) && 'today'].filter(Boolean).join(' ');
    const dot = unmarked(d, now).length ? '<i class="dot" aria-label="Classes to mark"></i>' : '';
    return `
      <button class="day ${cls}" data-day="${dateKey(d)}">
        <span>${d.toLocaleDateString('en-GB', { weekday: 'short' })}</span>
        <strong>${d.getDate()}</strong>${dot}
      </button>`;
  }).join('');

  el.innerHTML = `
    <div class="week-nav">
      <button class="icon-btn" data-week="-1" aria-label="Previous week">‹</button>
      <button class="week-label" data-week="0" aria-label="Back to today">
        <strong>${range}</strong><span>${rel}</span>
      </button>
      <button class="icon-btn" data-week="1" aria-label="Next week">›</button>
    </div>
    <div class="day-strip">${strip}</div>
    <h2 class="section-title">${DAY_NAMES[weekday(selected) - 1]}</h2>
    <div class="day-list">
      ${items.length ? items.map((i) => i.html).join('') : `
        <div class="placeholder"><p>No classes on this day.</p>
        <p class="muted">Use Edit schedule to add one.</p></div>`}
    </div>
    <button class="btn btn-quiet btn-block" data-edit>Edit schedule</button>`;

  // Ένας click handler για όλη την οθόνη ("event delegation")
  el.onclick = (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    const d = b.dataset;
    if (d.week) {
      selected = d.week === '0' ? defaultDay() : addDays(selected, 7 * Number(d.week));
      changing = null;
    } else if (d.day) {
      selected = parseKey(d.day);
      changing = null;
    } else if (d.change) {
      changing = d.change;
    } else if (d.set) {
      const entry = entriesForDate(parseKey(d.key.split('|')[0])).find((x) => x.key === d.key);
      if (!entry) return;
      const status = d.set === 'none' || entry.status === d.set ? null : d.set;
      setStatus(entry, status);
      changing = null;
    } else if ('edit' in d) {
      navigate('calendar/edit');
      return;
    } else {
      return;
    }
    renderWeek(el);
  };
}

// ===================== Οθόνη: επεξεργασία προγράμματος =====================

function renderEditList(el) {
  setTitle('Edit schedule');
  const sched = getSchedule();
  const groups = DAY_NAMES
    .map((name, i) => ({
      name,
      items: sched.filter((e) => e.day === i + 1).sort((a, b) => toMin(a.start) - toMin(b.start)),
    }))
    .filter((g) => g.items.length);

  el.innerHTML = `
    <button class="back-link" data-go="calendar">‹ Schedule</button>
    ${groups.map((g) => `
      <h2 class="section-title">${g.name}</h2>
      <ul class="list">${g.items.map((e) => `
        <li><button class="row" data-go="calendar/edit/${encodeURIComponent(e.id)}">
          <span class="row-time">${e.start}<br>${e.end}</span>
          <span class="row-text">
            <span class="row-title">${escapeHtml(e.title)}</span>
            <span class="row-sub">${escapeHtml(metaLine(e))}</span>
          </span>
          <span class="row-chevron" aria-hidden="true">›</span>
        </button></li>`).join('')}
      </ul>`).join('')}
    <div class="stack">
      <button class="btn btn-block" data-go="calendar/edit/new">Add a class</button>
      <button class="btn btn-quiet btn-block" data-reset>Restore the original schedule</button>
    </div>`;

  el.onclick = (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.dataset.go) navigate(b.dataset.go);
    if ('reset' in b.dataset && confirm('Replace your schedule with the original one? Attendance for classes that are not in it will stop counting.')) {
      store.remove('schedule');
      emit('schedule:changed');
      renderEditList(el);
    }
  };
}

function renderForm(el, id) {
  const isNew = id === 'new';
  const e = isNew
    ? { title: '', type: 'lecture', group: '', day: weekday(selected || new Date()), start: '09:00', end: '11:00', room: '', teacher: '' }
    : getSchedule().find((x) => x.id === id);
  if (!e) { navigate('calendar/edit'); return; }

  setTitle(isNew ? 'Add a class' : 'Edit class');
  const v = (s) => escapeHtml(s ?? '');

  el.innerHTML = `
    <button class="back-link" data-go="calendar/edit">‹ Edit schedule</button>
    <form class="form" novalidate>
      <label class="field"><span>Course</span>
        <input name="title" value="${v(e.title)}" autocomplete="off" required></label>

      <fieldset class="field"><legend>Type</legend>
        <div class="segmented">
          <label><input type="radio" name="type" value="lecture" ${e.type !== 'tutorial' ? 'checked' : ''}><span>Lecture</span></label>
          <label><input type="radio" name="type" value="tutorial" ${e.type === 'tutorial' ? 'checked' : ''}><span>Tutorial</span></label>
        </div>
      </fieldset>

      <label class="field"><span>Day</span>
        <select name="day">${DAY_NAMES.map((n, i) => `
          <option value="${i + 1}" ${e.day === i + 1 ? 'selected' : ''}>${n}</option>`).join('')}
        </select></label>

      <div class="field-row">
        <label class="field"><span>Starts</span><input type="time" name="start" value="${v(e.start)}" required></label>
        <label class="field"><span>Ends</span><input type="time" name="end" value="${v(e.end)}" required></label>
      </div>

      <label class="field"><span>Room</span><input name="room" value="${v(e.room)}" autocomplete="off"></label>
      <label class="field"><span>Teacher</span><input name="teacher" value="${v(e.teacher)}" autocomplete="off"></label>
      <label class="field"><span>Group (optional)</span>
        <input name="group" value="${v(e.group)}" placeholder="For example Μ-Ω or All" autocomplete="off"></label>

      <p class="form-error" role="alert" hidden></p>
      <button class="btn btn-block" type="submit">Save</button>
      ${isNew ? '' : '<button class="btn btn-danger btn-block" type="button" data-delete>Delete this class</button>'}
    </form>`;

  const form = el.querySelector('form');
  const error = el.querySelector('.form-error');

  form.addEventListener('submit', (ev) => {
    ev.preventDefault(); // να μη "στείλει" τη φόρμα και ξαναφορτώσει η σελίδα
    const f = new FormData(form);
    const data = {
      title: f.get('title').trim(),
      type: f.get('type'),
      group: f.get('group').trim(),
      day: Number(f.get('day')),
      start: f.get('start'),
      end: f.get('end'),
      room: f.get('room').trim(),
      teacher: f.get('teacher').trim(),
    };
    const problem = !data.title ? 'Add the course name.'
      : !data.start || !data.end ? 'Add a start and end time.'
      : toMin(data.end) <= toMin(data.start) ? 'The class has to end after it starts.'
      : null;
    if (problem) {
      error.textContent = problem;
      error.hidden = false;
      return;
    }

    const list = getSchedule();
    if (isNew) {
      list.push({ id: `c${Date.now().toString(36)}`, ...data });
    } else {
      Object.assign(list.find((x) => x.id === id), data);
    }
    saveSchedule(list);
    navigate('calendar/edit');
  });

  el.onclick = (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.dataset.go) navigate(b.dataset.go);
    if ('delete' in b.dataset && confirm(`Delete ${e.title}? Its past attendance will stop counting toward XP.`)) {
      saveSchedule(getSchedule().filter((x) => x.id !== id));
      navigate('calendar/edit');
    }
  };
}

// ===================== Καταχώρηση =====================

register({
  id: 'calendar',
  title: 'Schedule',
  icon: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  order: 10,
  nav: true,

  homeCard() {
    const now = new Date();
    const ws = weekStart(now);
    let toMark = 0;
    for (let d = ws; d <= now; d = addDays(d, 1)) toMark += unmarked(d, now).length;
    if (toMark) {
      return { value: String(toMark), label: toMark === 1 ? 'Class to mark this week' : 'Classes to mark this week' };
    }
    const next = nextClass(now);
    if (!next) return { value: '', label: 'No classes coming up' };
    const when = sameDay(next.startsAt, now)
      ? next.start
      : `${next.startsAt.toLocaleDateString('en-GB', { weekday: 'short' })} ${next.start}`;
    return { value: when, label: next.title };
  },

  // #/calendar -> εβδομάδα, #/calendar/edit -> λίστα, #/calendar/edit/<id> -> φόρμα
  render(el, params = []) {
    if (params[0] === 'edit' && params[1]) renderForm(el, params[1]);
    else if (params[0] === 'edit') renderEditList(el);
    else renderWeek(el);
  },

  // Όταν φεύγουμε από το Schedule, την επόμενη φορά ξεκινάμε από σήμερα
  unmount() {
    selected = null;
    changing = null;
  },
});
