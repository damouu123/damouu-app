// Ειδοποιήσεις: υπενθύμιση πριν από διάλεξη και "έχεις διάλειμμα;"
//
// ΤΙ ΜΠΟΡΕΙ ΚΑΙ ΤΙ ΔΕΝ ΜΠΟΡΕΙ ΝΑ ΚΑΝΕΙ ΤΟ APP ΣΤΟ iPHONE
// - Δεν μπορεί να "προγραμματίσει" ειδοποίηση για αργότερα. Οι πραγματικές
//   push ειδοποιήσεις χρειάζονται server που να τις στέλνει (δεν έχουμε).
// - Γι' αυτό οι υπενθυμίσεις διαλέξεων γίνονται μέσω του Calendar του iPhone:
//   φτιάχνουμε ένα αρχείο .ics (κοινή μορφή ημερολογίου) με κάθε μάθημα να
//   επαναλαμβάνεται κάθε εβδομάδα και με ειδοποίηση πριν ξεκινήσει. Μόλις το
//   προσθέσεις, το ΙΔΙΟ το iPhone σε ειδοποιεί, ακόμα κι αν το app είναι κλειστό.
// - Τα "έχεις διάλειμμα;" εμφανίζονται μέσα στο app: όταν το ανοίγεις σε κενό
//   ή όταν σημειώνεις ένα μάθημα ως ακυρωμένο.
//
// Δεδομένα (moduleStore('notifications')):
//   settings  { lead: 15, until: "2027-01-22" }
//   exported  { at, lead, until }  πότε έφτιαξες τελευταία φορά το αρχείο

import { register, on } from '../core/registry.js';
import { moduleStore } from '../core/storage.js';
import { navigate, toast, ask } from '../core/router.js';
import {
  getSchedule, entriesForDate, gapsForDate, startOfDay, addDays, weekday, dateKey, parseKey,
  toMin, fromMin, duration,
} from './calendar.js';

const store = moduleStore('notifications');

const LEADS = [10, 15, 30, 60];          // λεπτά πριν από το μάθημα
const DEFAULT_UNTIL = '2027-01-22';      // περίπου το τέλος του χειμερινού εξαμήνου
const SOON_MIN = 60;                     // banner "ξεκινάει σε λίγο" μέσα στην επόμενη ώρα
const MIN_BREAK_LEFT = 20;               // δεν προτείνουμε focus αν μένουν λιγότερα λεπτά

const getSettings = () => ({ lead: 15, until: DEFAULT_UNTIL, ...store.get('settings', {}) });

// ===================== Αρχείο ημερολογίου (.ics) =====================

// Ειδικοί χαρακτήρες στο .ics: \  ,  ;  και αλλαγή γραμμής
const icsText = (s) => String(s || '')
  .replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n');

// Το .ics θέλει γραμμές έως 75 bytes. Τα ελληνικά πιάνουν 2 bytes ανά γράμμα,
// οπότε "διπλώνουμε" τις μεγάλες γραμμές: συνέχεια σε νέα γραμμή με κενό μπροστά.
function fold(line) {
  const enc = new TextEncoder();
  const parts = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (bytes + b > 73) { parts.push(cur); cur = ' '; bytes = 1; }
    cur += ch;
    bytes += b;
  }
  parts.push(cur);
  return parts.join('\r\n');
}

const icsDate = (d) => dateKey(d).replace(/-/g, '');            // 20261019
const icsTime = (t) => `${t.replace(':', '')}00`;               // 090000

export function buildIcs({ lead, until }) {
  const today = startOfDay(new Date());
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, ''); // 20261014T101500Z
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Discipline//Lectures//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Lectures',
  ];

  for (const e of getSchedule()) {
    // Η πρώτη φορά που γίνεται το μάθημα από σήμερα και μετά
    const first = addDays(today, (e.day - weekday(today) + 7) % 7);
    const type = e.type === 'tutorial' ? `Tutorial${e.group ? ` (${e.group})` : ''}` : 'Lecture';
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.id}@discipline-app`,
      `DTSTAMP:${stamp}`,
      // Χωρίς ζώνη ώρας ("floating"): το iPhone τις διαβάζει ως τοπική ώρα
      `DTSTART:${icsDate(first)}T${icsTime(e.start)}`,
      `DTEND:${icsDate(first)}T${icsTime(e.end)}`,
      `RRULE:FREQ=WEEKLY;UNTIL=${until.replace(/-/g, '')}T235959`,
      `SUMMARY:${icsText(e.title)}`,
      `LOCATION:${icsText(e.room)}`,
      `DESCRIPTION:${icsText([type, e.teacher].filter(Boolean).join(', '))}`,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${icsText(`${e.title} in ${e.room}`)}`,
      `TRIGGER:-PT${lead}M`,
      'END:VALARM',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(fold).join('\r\n')}\r\n`;
}

function icsFile(settings) {
  return new File([buildIcs(settings)], 'lectures.ics', { type: 'text/calendar' });
}

// Κατέβασμα του αρχείου (στον υπολογιστή, ή στο iPhone ανοίγει "Add to Calendar")
function download(settings) {
  const url = URL.createObjectURL(icsFile(settings));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'lectures.ics';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// Κοινοποίηση (share sheet του iPhone): εναλλακτικός δρόμος αν το κατέβασμα δεν ανοίξει το Calendar
async function share(settings) {
  const file = icsFile(settings);
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Lectures' }); return true; } catch { return false; }
  }
  return false;
}

// ===================== "Έχεις διάλειμμα;" =====================

// Τι συμβαίνει τώρα: κενό ή μάθημα που ξεκινάει σύντομα
function rightNow() {
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const entries = entriesForDate(now);
  const next = entries.find((e) => e.status !== 'cancelled' && e.startsAt > now);
  const gap = gapsForDate(now).find((g) => g.start <= nowMin && g.end > nowMin);
  return { now, nowMin, next, gap };
}

// Όταν σημειώνεις ακύρωση για σήμερα, σε ενημερώνουμε για το κενό που προκύπτει
on('attendance:changed', ({ date, id, status }) => {
  if (status !== 'cancelled' || date !== dateKey(new Date())) return;
  const entry = entriesForDate(parseKey(date)).find((e) => e.id === id);
  if (!entry) return;
  const { nowMin } = rightNow();
  const gap = gapsForDate(parseKey(date)).find((g) => g.start <= toMin(entry.start) && g.end >= toMin(entry.end));
  if (!gap || gap.end <= nowMin) return;

  if (gap.start <= nowMin && gap.end - nowMin >= MIN_BREAK_LEFT) {
    // Το κενό είναι ΤΩΡΑ: πρόταση για focus
    ask({
      title: 'You have a break',
      text: `You're free until ${fromMin(gap.end)} (${duration(gap.end - nowMin)}). Use it for a focus session?`,
      confirmLabel: 'Start focusing',
      cancelLabel: 'Not now',
      danger: false,
    }).then((yes) => { if (yes) navigate('timer'); });
  } else if (gap.start > nowMin) {
    toast(`Free ${fromMin(gap.start)}–${fromMin(gap.end)} today`);
  }
});

// ===================== Οθόνη =====================

function render(el) {
  const s = getSettings();
  const exported = store.get('exported', null);
  const classes = getSchedule().length;
  const untilLabel = parseKey(s.until).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  el.innerHTML = `
    <h2 class="section-title first">Lecture reminders</h2>
    <p class="muted intro">Add your ${classes} weekly classes to the iPhone Calendar with an alert before each one.
      The alerts come from the Calendar app, so they work even when this app is closed.</p>

    <p class="field-label">Alert me</p>
    <div class="chips">
      ${LEADS.map((m) => `<button class="chip ${s.lead === m ? 'selected' : ''}" data-lead="${m}">${m} min before</button>`).join('')}
    </div>

    <label class="field until-field"><span>Repeat every week until</span>
      <input type="date" id="until" value="${s.until}" min="${dateKey(new Date())}"></label>

    <div class="stack">
      <button class="btn btn-block" data-download>Add to Calendar</button>
      <button class="btn btn-quiet btn-block" data-share>Share the file instead</button>
    </div>
    ${exported ? `<p class="muted small-print">Last created ${new Date(exported.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })},
      ${exported.lead} min before, until ${parseKey(exported.until).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}.</p>` : ''}

    <h2 class="section-title">How to add it on iPhone</h2>
    <ol class="steps">
      <li>Tap <strong>Add to Calendar</strong>. If iPhone asks, choose to open or add the events.</li>
      <li>Pick a calendar for them. A new one called "Lectures" makes it easy to remove them later.</li>
      <li>If nothing opens, tap <strong>Share the file instead</strong>, save it to Files, then open it from Files.</li>
    </ol>
    <p class="muted small-print">Changed your schedule? Delete the old events (or the whole "Lectures" calendar) and add the file again, so you don't get double alerts. Classes repeat until ${untilLabel}.</p>

    <h2 class="section-title">Breaks</h2>
    <p class="muted intro">When you open the app during a free gap between classes, Today shows how long your break is
      and offers a focus session. When you mark a class as cancelled, the app tells you about the free time it creates.</p>

    <h2 class="section-title">What works on iPhone</h2>
    <ul class="list">
      <li><div class="row row-static"><span class="row-text">
        <span class="row-title">Calendar alerts</span>
        <span class="row-sub">Arrive even when the app is closed</span></span>
        <span class="row-value earned">Reliable</span></div></li>
      <li><div class="row row-static"><span class="row-text">
        <span class="row-title">Break messages</span>
        <span class="row-sub">Only when you open the app</span></span>
        <span class="row-value">In app</span></div></li>
      <li><div class="row row-static"><span class="row-text">
        <span class="row-title">Push notifications</span>
        <span class="row-sub">Need a server, which this app doesn't have</span></span>
        <span class="row-value muted">Not used</span></div></li>
    </ul>`;

  const saveSettings = (patch) => store.set('settings', { ...getSettings(), ...patch });

  el.querySelector('#until').addEventListener('change', (ev) => {
    if (ev.target.value) saveSettings({ until: ev.target.value });
  });

  el.onclick = async (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.dataset.lead) {
      saveSettings({ lead: Number(b.dataset.lead) });
      render(el);
      return;
    }
    if ('download' in b.dataset || 'share' in b.dataset) {
      const settings = getSettings();
      if ('share' in b.dataset) {
        const ok = await share(settings);
        if (!ok) { download(settings); }
      } else {
        download(settings);
      }
      store.set('exported', { at: Date.now(), lead: settings.lead, until: settings.until });
      toast('Calendar file created');
      render(el);
    }
  };
}

// ===================== Καταχώρηση =====================

register({
  id: 'notifications',
  title: 'Reminders',
  icon: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0"/>',
  order: 60,

  homeCard() {
    const exported = store.get('exported', null);
    return exported
      ? { value: '', label: `Calendar alerts ${exported.lead} min before class` }
      : { value: '', label: 'Set up lecture alerts' };
  },

  // Μήνυμα στην κορυφή της Αρχικής: διάλειμμα τώρα ή μάθημα σε λίγο
  homeBanner() {
    const { now, nowMin, next, gap } = rightNow();
    const breakLeft = gap ? gap.end - nowMin : 0;

    if (gap && breakLeft >= MIN_BREAK_LEFT) {
      return {
        title: gap.unexpected ? 'Your class was cancelled' : 'You have a break',
        text: `You're free until ${fromMin(gap.end)} (${duration(breakLeft)}). Use it for a focus session?`,
        action: { go: 'timer', label: 'Start focusing' },
      };
    }
    if (next && next.startsAt - now <= SOON_MIN * 60000) {
      const mins = Math.max(1, Math.round((next.startsAt - now) / 60000));
      return {
        title: `${next.title} at ${next.start}`,
        text: `${next.room ? `${next.room}, ` : ''}starts in ${duration(mins)}.`,
      };
    }
    return null;
  },

  render,
});
