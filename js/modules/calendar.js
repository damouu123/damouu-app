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
import { navigate, escapeHtml, setTitle, ask, toast, openSheet } from '../core/router.js';
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

// 90 -> "1 h 30 min"
export function duration(min) {
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

export function metaLine(e) {
  const type = e.type === 'tutorial' ? `Tutorial${e.group ? ` (${e.group})` : ''}` : 'Lecture';
  return [type, e.room, e.teacher].filter(Boolean).join(', ');
}

// ===================== Οθόνη: μηνιαίο ημερολόγιο =====================
// Πάνω ο μήνας (σαν το Calendar της Apple), με κουκκίδες ανά μάθημα.
// Κάτω τα μαθήματα της μέρας που διάλεξες. Πάτημα σε μάθημα ανοίγει ένα
// φύλλο με τις ενέργειες. Τα ΑΚΥΡΩΜΕΝΑ φεύγουν από το ημερολόγιο: δεν έχουν
// κουκκίδα και δεν φαίνονται στη λίστα (μένει μόνο ένα "Cancelled (1)"
// για να τα επαναφέρεις).

let selected = null;       // η μέρα που βλέπουμε
let shownMonth = null;     // η 1η του μήνα που δείχνει το ημερολόγιο
let swap = false;          // να παίξει η κίνηση αλλαγής μήνα στην επόμενη ζωγραφική

const WEEK_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
// Χρώμα κουκκίδας ανά κατάσταση
const DOT = { attended: 'went', left: 'left', missed: 'missed' };

// Τίτλος εβδομάδας: { range: "12–16 October", rel: "This week" }
// days: οι μέρες που δείχνουμε (αρκεί η πρώτη και η τελευταία). Το χρησιμοποιεί το Weekly review.
export function weekHeading(days) {
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

// Όλες οι μέρες που φαίνονται στο πλέγμα: από τη Δευτέρα της εβδομάδας
// της 1ης του μήνα έως την Κυριακή της εβδομάδας της τελευταίας μέρας.
function monthDays(first) {
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
  const days = [];
  for (let d = weekStart(first); d <= addDays(weekStart(last), 6); d = addDays(d, 1)) days.push(d);
  return days;
}

function cellHtml(d, now) {
  const live = entriesForDate(d).filter((e) => e.status !== 'cancelled');
  const cls = [
    d.getMonth() !== shownMonth.getMonth() && 'dim',
    sameDay(d, now) && 'today',
    sameDay(d, selected) && 'selected',
  ].filter(Boolean).join(' ');
  // Μία κουκκίδα ανά μάθημα: γεμάτη αν το σημείωσες, κόκκινος κύκλος αν έχει
  // τελειώσει και δεν το σημείωσες, αχνή αν δεν έχει γίνει ακόμα
  const dots = live.map((e) => `<i class="d ${DOT[e.status] || (e.endsAt <= now ? 'todo' : '')}"></i>`).join('');
  const label = `${d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}, `
    + `${live.length} ${live.length === 1 ? 'class' : 'classes'}`;
  return `
    <button class="mcell ${cls}" data-day="${dateKey(d)}" aria-label="${label}"
            ${sameDay(d, selected) ? 'aria-current="date"' : ''}>
      <span class="mnum">${d.getDate()}</span>
      <span class="mdots">${dots}</span>
    </button>`;
}

// "Lecture, Δ23"  /  "Tutorial (Μ-Ω), ΗΥ3"
function shortMeta(e) {
  const type = e.type === 'tutorial' ? `Tutorial${e.group ? ` (${e.group})` : ''}` : 'Lecture';
  return [type, e.room].filter(Boolean).join(', ');
}

function rowHtml(e, now) {
  let state = '';
  if (e.status) state = `<span class="state is-${e.status}">${STATUSES[e.status].label}</span>`;
  else if (e.endsAt <= now) state = '<span class="state is-todo">Mark</span>'; // τελείωσε, δεν το σημείωσες
  return `
    <li><button class="row" data-class="${e.key}">
      <span class="row-time">${e.start}<br>${e.end}</span>
      <span class="row-text">
        <span class="row-title">${escapeHtml(e.title)}</span>
        <span class="row-sub">${escapeHtml(shortMeta(e))}</span>
      </span>
      ${state}<span class="row-chevron" aria-hidden="true">›</span>
    </button></li>`;
}

function gapRow(g) {
  return `
    <li class="gap-row ${g.unexpected ? 'is-unexpected' : ''}">
      <span>Free</span>
      <span>${fromMin(g.start)}–${fromMin(g.end)}, ${duration(g.end - g.start)}</span>
    </li>`;
}

function renderMonth(el) {
  const now = new Date();
  if (!shownMonth) {
    selected = startOfDay(now);
    shownMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  }

  const entries = entriesForDate(selected);
  const live = entries.filter((e) => e.status !== 'cancelled');
  const cancelled = entries.filter((e) => e.status === 'cancelled');
  // Μαθήματα και κενά μαζί, με σειρά ώρας
  const items = [
    ...live.map((e) => ({ at: toMin(e.start), html: rowHtml(e, now) })),
    // Τα κενά που προέκυψαν από ακύρωση δεν τα δείχνουμε (unexpected)
    ...gapsForDate(selected).filter((g) => !g.unexpected).map((g) => ({ at: g.start, html: gapRow(g) })),
  ].sort((a, b) => a.at - b.at);

  const title = shownMonth.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const heading = selected.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  el.innerHTML = `
    <div class="month-head">
      <button class="month-title" data-month="0" aria-label="Go to today">${title}</button>
      <div class="month-nav">
        <button class="icon-btn" data-month="-1" aria-label="Previous month">‹</button>
        <button class="icon-btn" data-month="1" aria-label="Next month">›</button>
      </div>
    </div>
    <div class="mweek" aria-hidden="true">${WEEK_LABELS.map((w) => `<span>${w}</span>`).join('')}</div>
    <div class="mgrid ${swap ? 'swap' : ''}">${monthDays(shownMonth).map((d) => cellHtml(d, now)).join('')}</div>

    <h2 class="section-title">${heading}</h2>
    ${items.length
      ? `<ul class="list">${items.map((i) => i.html).join('')}</ul>`
      : '<p class="muted empty-day">No classes.</p>'}
    ${cancelled.length ? `<button class="link-btn centered" data-undo-cancel>Undo cancelled (${cancelled.length})</button>` : ''}

    <button class="btn btn-quiet btn-block edit-btn" data-edit>Edit schedule</button>`;
  swap = false;

  const findEntry = (key) => entriesForDate(parseKey(key.split('|')[0])).find((x) => x.key === key);

  // Ένας click handler για όλη την οθόνη ("event delegation")
  el.onclick = (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    const d = b.dataset;
    let openDayAfter = false;
    if (d.month !== undefined) {
      const delta = Number(d.month);
      const today = startOfDay(new Date());
      shownMonth = delta === 0
        ? new Date(today.getFullYear(), today.getMonth(), 1)
        : new Date(shownMonth.getFullYear(), shownMonth.getMonth() + delta, 1);
      // Στον τρέχοντα μήνα επιλέγουμε σήμερα, αλλιώς την 1η
      selected = shownMonth.getMonth() === today.getMonth() && shownMonth.getFullYear() === today.getFullYear()
        ? today : shownMonth;
      swap = true;
    } else if (d.day) {
      openDayAfter = true;
      selected = parseKey(d.day);
      if (selected.getMonth() !== shownMonth.getMonth()) { // μέρα γειτονικού μήνα: πάμε εκεί
        shownMonth = new Date(selected.getFullYear(), selected.getMonth(), 1);
        swap = true;
      }
    } else if (d.class) {
      const entry = findEntry(d.class);
      if (entry) openClassSheet(entry, () => renderMonth(el));
      return;
    } else if ('undoCancel' in d) {
      openCancelledSheet(selected, () => renderMonth(el));
      return;
    } else if ('edit' in d) {
      navigate('calendar/edit');
      return;
    } else {
      return;
    }
    renderMonth(el);
    // Η προβολή ημέρας ανοίγει με animation πάνω από το ημερολόγιο
    if (openDayAfter && dayViewOpener) dayViewOpener(selected, () => renderMonth(el));
  };
}

// Η προβολή ημέρας (dayview.js) δηλώνει εδώ τον εαυτό της όταν φορτωθεί.
// Έτσι το calendar.js δεν χρειάζεται να την κάνει import (αποφεύγουμε κύκλο).
let dayViewOpener = null;
export function onOpenDay(fn) {
  dayViewOpener = fn;
}

// Φύλλο με τα ακυρωμένα μαθήματα της μέρας, για επαναφορά (μόνο τίτλοι)
function openCancelledSheet(date, after) {
  const list = entriesForDate(date).filter((e) => e.status === 'cancelled');
  if (!list.length) return;
  openSheet(`
    <h2>Cancelled classes</h2>
    <ul class="list rules-list">${list.map((e) => `
      <li><div class="row row-static">
        <span class="row-text"><span class="row-title">${escapeHtml(e.title)}</span></span>
        <button class="btn btn-small" data-restore="${e.key}">Restore</button>
      </div></li>`).join('')}
    </ul>
    <div class="stack"><button class="btn btn-quiet btn-block" data-close>Done</button></div>`,
  (root, close) => {
    root.addEventListener('click', (ev) => {
      const b = ev.target.closest('button');
      if (!b) return;
      if ('close' in b.dataset) { close(); return; }
      if (b.dataset.restore) {
        const entry = list.find((x) => x.key === b.dataset.restore);
        if (!entry) return;
        setStatus(entry, null);
        toast(`${entry.title} is back in your calendar`);
        close();
        if (after) after();
      }
    });
  });
}

// Φύλλο ενεργειών ενός μαθήματος. after: τι να γίνει όταν αλλάξει κάτι
export function openClassSheet(entry, after) {
  const started = entry.startsAt <= new Date();
  const day = parseKey(entry.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const actions = entry.status === 'cancelled'
    // Ακυρωμένο: μόνο επαναφορά
    ? `<p class="muted small-print">This class is cancelled.</p>
      <div class="stack"><button class="btn btn-block" data-set="cancelled">Restore class</button></div>`
    : started
    // Ξεκίνησε: όλες οι επιλογές (πάτημα στην ήδη επιλεγμένη = σβήσιμο)
    ? `<div class="choices">${Object.entries(STATUSES).map(([s, { label }]) => `
        <button class="choice is-${s} ${entry.status === s ? 'selected' : ''}" data-set="${s}">${label}</button>`).join('')}
      </div>`
    // Δεν ξεκίνησε: μόνο ακύρωση (π.χ. το ανακοίνωσε ο καθηγητής)
    : `<div class="stack">
        <button class="btn btn-danger btn-block" data-set="cancelled">Cancel this class</button>
      </div>
      <p class="muted small-print">You can mark attendance once the class starts.</p>`;

  openSheet(`
    <h2>${escapeHtml(entry.title)}</h2>
    <p class="muted">${day}, ${entry.start}–${entry.end}</p>
    <p class="muted">${escapeHtml(metaLine(entry))}</p>
    ${actions}`,
  (root, close) => {
    root.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-set]');
      if (!b) return;
      const status = entry.status === b.dataset.set ? null : b.dataset.set;
      close();
      setStatus(entry, status); // στέλνει "attendance:changed": εκεί γίνεται και η ειδοποίηση
      if (entry.status === 'cancelled' && !status) toast(`${entry.title} is back in your calendar`);
      if (after) after();
    });
  });
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
    if ('reset' in b.dataset) {
      ask({
        title: 'Restore the original schedule?',
        text: 'Your changes to the schedule are replaced. Attendance for classes that are not in the original stops counting.',
        confirmLabel: 'Restore',
      }).then((yes) => {
        if (!yes) return;
        store.remove('schedule');
        emit('schedule:changed');
        toast('Original schedule restored');
        renderEditList(el);
      });
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
    if ('delete' in b.dataset) {
      ask({
        title: `Delete ${e.title}?`,
        text: 'Its past attendance will stop counting toward XP.',
        confirmLabel: 'Delete',
      }).then((yes) => {
        if (!yes) return;
        saveSchedule(getSchedule().filter((x) => x.id !== id));
        toast('Class deleted');
        navigate('calendar/edit');
      });
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

  // #/calendar -> μήνας, #/calendar/edit -> λίστα, #/calendar/edit/<id> -> φόρμα
  render(el, params = []) {
    if (params[0] === 'edit' && params[1]) renderForm(el, params[1]);
    else if (params[0] === 'edit') renderEditList(el);
    else renderMonth(el);
  },

  // Όταν φεύγουμε από το Schedule, την επόμενη φορά ξεκινάμε από σήμερα
  unmount() {
    selected = null;
    shownMonth = null;
  },
});
