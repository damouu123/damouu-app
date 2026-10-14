// Timer εστίασης: διάβασμα εξετάσεων, βιβλίο, άσκηση.
//
// ΠΩΣ ΜΕΤΡΑΜΕ ΤΟΝ ΧΡΟΝΟ
// Το iOS "παγώνει" το app όταν δεν το βλέπεις, άρα ένας μετρητής που
// χτυπάει κάθε δευτερόλεπτο θα σταματούσε. Γι' αυτό στην αρχή γράφουμε
// ΠΟΤΕ τελειώνει η συνεδρία (endsAt, timestamp σε ms) και κάθε φορά
// υπολογίζουμε: υπόλοιπο = endsAt - τώρα. Αν το app ξανανοίξει μετά το
// endsAt, η συνεδρία ολοκληρώνεται εκείνη τη στιγμή.
//
// ΚΑΝΟΝΕΣ
// - Ολοκληρώνεις: κερδίζεις λεπτά scroll.
// - Σταματάς νωρίς (παρατεταμένο πάτημα 10" + επιβεβαίωση): χάνεις τη
//   συνεδρία ΚΑΙ 5 λεπτά από το πορτοφόλι.
// - Emergency (2 την ημέρα): σταματάς χωρίς την ποινή των 5 λεπτών.
//   Το app δεν μπορεί να ελέγξει αν ήταν όντως επείγον: είναι στον λόγο σου.
// - Κλείδωμα κινητού / έξοδος από το app: επιτρέπεται, ο χρόνος συνεχίζει.
//   (Το iOS δεν λέει στο app αν κλείδωσες ή άνοιξες άλλη εφαρμογή, οπότε
//   τις άλλες εφαρμογές τις μπλοκάρει το Focus/Screen Time του iPhone.)
//
// Δεδομένα (moduleStore('timer')):
//   active    η συνεδρία που τρέχει τώρα (ή null)
//   sessions  ιστορικό: [{ id, activity, minutes, startedAt, endedAt, awayMs,
//                          completed, earned, penalty, reason }]
//             reason: null (ολοκληρώθηκε) | 'stopped' | 'emergency'
//   passes    { date: "2026-10-13", used: 1 } emergency passes της ημέρας
//   last      τελευταία επιλογή δραστηριότητας/διάρκειας

import { register, emit } from '../core/registry.js';
import { moduleStore } from '../core/storage.js';
import { escapeHtml, icon, navigate, toast, refresh } from '../core/router.js';

const store = moduleStore('timer');

export const ACTIVITIES = {
  study: { label: 'Exam study', icon: '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v15H5.5A1.5 1.5 0 0 1 4 17.5zM20 5.5A1.5 1.5 0 0 0 18.5 4H13v15h5.5a1.5 1.5 0 0 0 1.5-1.5z"/>' },
  read: { label: 'Reading', icon: '<path d="M6 3.5h10.5A1.5 1.5 0 0 1 18 5v15.5H7.5A1.5 1.5 0 0 1 6 19zM6 17.5h12"/>' },
  workout: { label: 'Workout', icon: '<path d="M3 9.5v5M6 7v10M18 7v10M21 9.5v5M6 12h12"/>' },
};

// Κάθε 2 λεπτά εστίασης = 1 λεπτό scroll, στρογγυλοποίηση ΠΡΟΣ ΤΑ ΚΑΤΩ
// (25 -> 12, 1 -> 0). Αν στρογγυλοποιούσαμε προς τα πάνω, πολλές συνεδρίες
// του 1 λεπτού θα έδιναν διπλάσια λεπτά από όσα πρέπει.
export const EARN_RATE = 0.5;
export const earnedFor = (minutes) => Math.floor(minutes * EARN_RATE);

export const PENALTY_MIN = 5; // λεπτά που χάνεις από το πορτοφόλι αν σταματήσεις νωρίς
const PASSES_PER_DAY = 2;
const HOLD_MS = 10000; // πόση ώρα κρατάς πατημένο για να σταματήσεις
const MIN_MIN = 1;     // από 1 λεπτό...
const MAX_MIN = 300;   // ...έως 5 ώρες
const PRESETS = [15, 30, 45, 60];
const ITEM_H = 52;     // ύψος μιας γραμμής του τροχού (px), πρέπει να ταιριάζει με το CSS
const HOLD_LABEL = 'Hold to stop';
const RING_R = 108;                  // ακτίνα του δακτυλίου στο SVG
const RING_C = 2 * Math.PI * RING_R; // περιφέρεια: το "μήκος" του δακτυλίου

export function getSessions() {
  return store.get('sessions', []);
}

const getActive = () => store.get('active', null);
const saveActive = (a) => store.set('active', a);

const todayKey = () => new Date().toLocaleDateString('sv'); // "2026-10-13"

function passesLeft() {
  const p = store.get('passes', null);
  return PASSES_PER_DAY - (p && p.date === todayKey() ? p.used : 0);
}

function usePass() {
  store.set('passes', { date: todayKey(), used: PASSES_PER_DAY - passesLeft() + 1 });
}

// ===================== Κύκλος ζωής συνεδρίας =====================

function start(activity, minutes) {
  const now = Date.now();
  saveActive({
    id: `s${now.toString(36)}`,
    activity,
    minutes,
    startedAt: now,
    endsAt: now + minutes * 60000,
    awayMs: 0,      // πόση ώρα ήσουν εκτός app ή με κλειδωμένο κινητό (μόνο για στατιστικά)
    hiddenAt: null, // πότε βγήκες (αν είσαι έξω τώρα)
  });
  store.set('last', { activity, minutes });
  showOverlay();
}

// Προσθέτει στο awayMs τον χρόνο από τότε που βγήκες (έως το τέλος της συνεδρίας)
function closeAway(a) {
  if (a.hiddenAt) {
    a.awayMs += Math.max(0, Math.min(Date.now(), a.endsAt) - a.hiddenAt);
    a.hiddenAt = null;
  }
}

// reason: null = τελείωσε ο χρόνος, 'stopped' = σταμάτησες (ποινή),
//         'emergency' = σταμάτησες με emergency pass (χωρίς ποινή)
function finish(reason) {
  const a = getActive();
  if (!a) return null;
  closeAway(a);
  const completed = reason === null;
  const session = {
    id: a.id,
    activity: a.activity,
    minutes: a.minutes,
    startedAt: a.startedAt,
    endedAt: completed ? a.endsAt : Date.now(),
    awayMs: Math.round(a.awayMs),
    completed,
    earned: completed ? earnedFor(a.minutes) : 0,
    penalty: reason === 'stopped' ? PENALTY_MIN : 0,
    reason,
  };
  store.update('sessions', (list) => [...list, session], []);
  store.remove('active');
  emit('focus:finished', session);
  return session;
}

// ===================== Ήχος στο τέλος =====================
// Οι browsers παίζουν ήχο μόνο αφού αγγίξεις τη σελίδα. Γι' αυτό
// "ξεκλειδώνουμε" τον ήχο σε ΚΑΘΕ άγγιγμα (όχι μόνο στο Start), ώστε
// να δουλεύει και μετά από ανανέωση της σελίδας. Το iPhone θέλει επιπλέον
// να παίξει πραγματικά ένας ήχος μέσα στο άγγιγμα: παίζουμε έναν σιωπηλό.
//
// Αν ο χρόνος τελειώσει ενώ δεν βλέπεις το app, ο browser δεν αφήνει
// ήχο εκείνη τη στιγμή. Τότε τον κρατάμε "σε αναμονή" (pendingChime)
// και τον παίζουμε μόλις γυρίσεις.
// Στο iPhone δεν ακούγεται αν είναι ενεργός ο διακόπτης σίγασης.
let audio = null;
let pendingChime = false;
function unlockAudio() {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state !== 'running') audio.resume();
    const silent = audio.createBufferSource();
    silent.buffer = audio.createBuffer(1, 1, 22050);
    silent.connect(audio.destination);
    silent.start(0);
  } catch { audio = null; }
}
document.addEventListener('pointerdown', unlockAudio, { capture: true });
document.addEventListener('keydown', unlockAudio, { capture: true });

async function chime() {
  if (!audio) return;
  try {
    if (audio.state !== 'running') await audio.resume();
    const t = audio.currentTime + 0.05;
    [0, 0.25].forEach((delay, i) => {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.frequency.value = i ? 880 : 660;
      gain.gain.setValueAtTime(0.0001, t + delay);
      gain.gain.exponentialRampToValueAtTime(0.3, t + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + delay + 0.5);
      osc.connect(gain).connect(audio.destination);
      osc.start(t + delay);
      osc.stop(t + delay + 0.55);
    });
  } catch { /* χωρίς ήχο */ }
}

// ===================== Κλειδωμένη οθόνη (overlay) =====================
// Ένα στοιχείο που καλύπτει ΟΛΟ το app, μαζί και την κάτω μπάρα.
// Δεν ανήκει σε καμία οθόνη του router, άρα μένει ό,τι κι αν γίνει.
// overlay.dataset.view: 'running' | 'confirm' | 'result'

let overlay = null;
let ticker = null;

const fmt = (ms) => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mmss = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return h ? `${h}:${mmss}` : mmss;
};

const clock = (ts) => new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

function ensureOverlay() {
  if (overlay) return;
  overlay = document.createElement('div');
  overlay.className = 'focus-screen';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Focus session');
  document.body.appendChild(overlay);
  document.body.classList.add('locked');
}

function showOverlay() {
  ensureOverlay();
  renderRunning();
  clearInterval(ticker);
  ticker = setInterval(tick, 250);
  tick();
}

function hideOverlay() {
  clearInterval(ticker);
  ticker = null;
  if (overlay) overlay.remove();
  overlay = null;
  document.body.classList.remove('locked');
}

function renderRunning() {
  const a = getActive();
  if (!a || !overlay) return;
  overlay.dataset.view = 'running';
  overlay.innerHTML = `
    <div class="focus-inner running">
      <p class="focus-activity">${icon(ACTIVITIES[a.activity].icon)} ${ACTIVITIES[a.activity].label}</p>
      <div class="ring">
        <svg viewBox="0 0 240 240" aria-hidden="true">
          <circle class="ring-track" cx="120" cy="120" r="${RING_R}"/>
          <circle class="ring-bar" cx="120" cy="120" r="${RING_R}"
                  stroke-dasharray="${RING_C}" stroke-dashoffset="0"/>
        </svg>
        <p class="focus-time" aria-live="off">${fmt(a.endsAt - Date.now())}</p>
      </div>
      <p class="muted focus-ends">Ends at ${clock(a.endsAt)}</p>
    </div>
    <button class="hold-btn" type="button">
      <span class="hold-fill" aria-hidden="true"></span>
      <span class="hold-label">${HOLD_LABEL}</span>
    </button>`;
  bindHold(overlay.querySelector('.hold-btn'), renderConfirm);
}

// Ενημερώνει την ώρα· αν τελείωσε ο χρόνος, ολοκληρώνει τη συνεδρία
function tick() {
  const a = getActive();
  if (!a || !overlay) return;
  const now = Date.now();
  if (now >= a.endsAt) {
    const session = finish(null);
    if (document.hidden) pendingChime = true; else chime();
    renderResult(session);
    return;
  }
  if (overlay.dataset.view !== 'running') return;
  overlay.querySelector('.focus-time').textContent = fmt(a.endsAt - now);
  // Ο δακτύλιος αδειάζει όσο περνάει ο χρόνος
  const elapsed = Math.min(1, (now - a.startedAt) / (a.minutes * 60000));
  overlay.querySelector('.ring-bar').style.strokeDashoffset = RING_C * elapsed;
}

// Παρατεταμένο πάτημα: η μπάρα γεμίζει (εικόνα) και ένα setTimeout
// αποφασίζει το τέλος. Αν αφήσεις νωρίτερα, μηδενίζει.
function bindHold(btn, onDone) {
  const fill = btn.querySelector('.hold-fill');
  const label = btn.querySelector('.hold-label');
  let startT = null;
  let raf = null;   // κινούμενη μπάρα (μόνο για την εικόνα)
  let timer = null; // το πραγματικό "τέλος" μετά από HOLD_MS

  const reset = () => {
    startT = null;
    cancelAnimationFrame(raf);
    clearTimeout(timer);
    fill.style.transform = 'scaleX(0)';
    label.textContent = HOLD_LABEL;
  };
  const frame = () => {
    if (startT === null) return;
    const p = Math.min(1, (performance.now() - startT) / HOLD_MS);
    fill.style.transform = `scaleX(${p})`;
    label.textContent = `Keep holding… ${Math.max(1, Math.ceil((HOLD_MS * (1 - p)) / 1000))}`;
    if (p < 1) raf = requestAnimationFrame(frame);
  };
  const begin = (e) => {
    e.preventDefault();
    if (startT !== null) return;
    startT = performance.now();
    raf = requestAnimationFrame(frame);
    timer = setTimeout(() => { reset(); onDone(); }, HOLD_MS);
  };

  btn.addEventListener('pointerdown', begin);
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => btn.addEventListener(t, reset));
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
  // Και από πληκτρολόγιο: κράτα πατημένο Space ή Enter
  btn.addEventListener('keydown', (e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) begin(e); });
  btn.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') reset(); });
}

function renderConfirm() {
  const a = getActive();
  if (!a || !overlay) return;
  overlay.dataset.view = 'confirm';
  const left = Math.ceil((a.endsAt - Date.now()) / 60000);
  const passes = passesLeft();
  overlay.innerHTML = `
    <div class="focus-inner confirm">
      <h2>Do you really want to stop?</h2>
      <p class="muted">You have ${left} ${left === 1 ? 'minute' : 'minutes'} left.
        If you stop now, you lose this session and ${PENALTY_MIN} min from your wallet.</p>
      <div class="stack">
        <button class="btn btn-block" data-keep>Keep focusing</button>
        ${passes > 0 ? `
          <button class="btn btn-quiet btn-block" data-emergency>It's an emergency</button>
          <p class="muted small-print">Stops without the ${PENALTY_MIN} min penalty.
            ${passes === 1 ? 'This is your last emergency pass today.' : `You have ${passes} emergency passes left today.`}</p>` : `
          <p class="muted small-print">You've used both emergency passes today.</p>`}
        <button class="btn btn-danger btn-block" data-quit>Stop and lose ${PENALTY_MIN} min</button>
      </div>
    </div>`;

  // Μετά από διακοπή: κλείνουμε την οθόνη και ξαναζωγραφίζουμε ό,τι είναι
  // από κάτω (π.χ. τη λίστα "Today" και το υπόλοιπο στην Αρχική)
  const stop = (reason, message) => {
    finish(reason);
    hideOverlay();
    toast(message);
    refresh();
  };
  overlay.querySelector('[data-keep]').addEventListener('click', renderRunning);
  overlay.querySelector('[data-emergency]')?.addEventListener('click', () => {
    usePass();
    stop('emergency', 'Emergency stop. No penalty');
  });
  overlay.querySelector('[data-quit]').addEventListener('click', () => {
    stop('stopped', `Session stopped. ${PENALTY_MIN} min taken from your wallet`);
  });
}

function renderResult(session) {
  clearInterval(ticker);
  ticker = null;
  ensureOverlay();
  overlay.dataset.view = 'result';
  overlay.innerHTML = `
    <div class="focus-inner">
      <p class="hero-label">Session complete</p>
      <p class="hero-number"><strong>+${session.earned}</strong><span>min</span></p>
      <p>${session.minutes} minutes of ${ACTIVITIES[session.activity].label.toLowerCase()}.
        Scroll time earned.</p>
      <div class="stack"><button class="btn btn-block" data-done>Done</button></div>
    </div>`;
  overlay.querySelector('[data-done]').addEventListener('click', () => {
    hideOverlay();
    // Στην Αρχική, για να δεις το νέο υπόλοιπο λεπτών
    if (['', 'home'].includes(location.hash.replace(/^#\/?/, ''))) refresh();
    else navigate('home');
  });
}

// ===================== Όταν βγαίνεις/μπαίνεις στο app =====================
// Καταγράφουμε μόνο πόση ώρα έλειπες (χωρίς τιμωρία) και, όταν γυρίσεις,
// ελέγχουμε αμέσως αν τελείωσε ο χρόνος.

document.addEventListener('visibilitychange', () => {
  // Ο ήχος που "περίμενε" επειδή ο χρόνος τελείωσε ενώ έλειπες
  if (!document.hidden && pendingChime) {
    pendingChime = false;
    chime();
  }
  const a = getActive();
  if (!a) return;
  if (document.hidden) {
    a.hiddenAt = Date.now();
  } else {
    closeAway(a);
  }
  saveActive(a);
  if (!document.hidden) tick();
});

// ===================== Οθόνη επιλογής =====================

let choice = null; // { activity, minutes }

function todaySessions() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return getSessions().filter((s) => s.startedAt >= start.getTime());
}

// Τι δείχνουμε δεξιά σε κάθε συνεδρία της λίστας "Today"
function sessionValue(s) {
  if (s.completed) return { text: `+${s.earned}`, cls: 'earned', sub: '' };
  if (s.reason === 'emergency') return { text: '0', cls: 'muted', sub: ', emergency stop' };
  // Παλιές συνεδρίες (πριν την ποινή) δεν έχουν penalty
  return s.penalty
    ? { text: `−${s.penalty}`, cls: 'is-low', sub: ', stopped early' }
    : { text: 'Stopped', cls: 'muted', sub: '' };
}

// 90 -> "1 h 30 min", 120 -> "2 h"
const hoursText = (m) => (m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} h`);

const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

function render(el) {
  const saved = store.get('last', null);
  if (!choice) {
    choice = {
      activity: saved && ACTIVITIES[saved.activity] ? saved.activity : 'study',
      minutes: Math.min(MAX_MIN, Math.max(MIN_MIN, Number(saved && saved.minutes) || 30)),
    };
  }
  const today = todaySessions().slice().reverse();

  el.innerHTML = `
    <div class="segmented" role="radiogroup" aria-label="Activity">
      ${Object.entries(ACTIVITIES).map(([id, a]) => `
        <label><input type="radio" name="activity" value="${id}" ${choice.activity === id ? 'checked' : ''}>
          <span>${a.label}</span></label>`).join('')}
    </div>

    <div class="wheel" tabindex="0" role="slider" aria-label="Minutes"
         aria-valuemin="${MIN_MIN}" aria-valuemax="${MAX_MIN}">
      <div class="wheel-lens" aria-hidden="true"></div>
      <div class="wheel-scroll">
        <div class="wheel-pad"></div>
        ${Array.from({ length: MAX_MIN }, (_, i) => `<div class="wheel-item">${i + 1}</div>`).join('')}
        <div class="wheel-pad"></div>
      </div>
      <span class="wheel-unit" aria-hidden="true">min</span>
    </div>
    <p class="wheel-caption" aria-live="polite"></p>

    <div class="presets">
      ${PRESETS.map((m) => `<button class="chip" data-minutes="${m}">${m}</button>`).join('')}
    </div>

    <button class="btn btn-block start-btn" data-start>Start</button>
    <p class="muted start-note"></p>

    ${today.length ? `
      <h2 class="section-title">Today</h2>
      <ul class="list">${today.map((s) => {
        const v = sessionValue(s);
        return `
        <li><div class="row row-static">
          <span class="row-text">
            <span class="row-title">${escapeHtml(ACTIVITIES[s.activity].label)}</span>
            <span class="row-sub">${clock(s.startedAt)}, ${s.minutes} min${v.sub}</span>
          </span>
          <span class="row-value ${v.cls}">${v.text}</span>
        </div></li>`;
      }).join('')}
      </ul>` : ''}`;

  // ---------- Ο τροχός ----------
  // Κάθε λεπτό είναι μια γραμμή ύψους ITEM_H. Με scroll-snap ο browser
  // "κουμπώνει" τη γραμμή στο κέντρο, και το scrollTop μας λέει ποια είναι:
  // λεπτά = scrollTop / ITEM_H + 1. Το κύλισμα με την αδράνεια (momentum) το
  // κάνει το ίδιο το iPhone, γι' αυτό νιώθει σαν τα ρολόγια του.
  const wheel = el.querySelector('.wheel');
  const scroller = el.querySelector('.wheel-scroll');
  const items = [...scroller.querySelectorAll('.wheel-item')];
  const presets = [...el.querySelectorAll('.presets .chip')];
  const note = el.querySelector('.start-note');
  const caption = el.querySelector('.wheel-caption');

  const clamp = (m) => Math.min(MAX_MIN, Math.max(MIN_MIN, Math.round(m)));
  const offsetFor = (m) => (m - 1) * ITEM_H;
  let animating = false; // τρέχει δική μας κίνηση προς κάποια τιμή
  let animId = null;
  let frame = null;
  let painted = [0, -1]; // ποιες γραμμές έχουν "στυλ απόστασης" αυτή τη στιγμή

  // Οι γραμμές κοντά στο κέντρο είναι μεγαλύτερες και πιο έντονες
  function paintWheel() {
    const pos = scroller.scrollTop / ITEM_H;
    const lo = Math.max(0, Math.floor(pos) - 3);
    const hi = Math.min(items.length - 1, Math.ceil(pos) + 3);
    for (let i = painted[0]; i <= painted[1]; i++) {
      if ((i < lo || i > hi) && items[i]) items[i].style.cssText = '';
    }
    for (let i = lo; i <= hi; i++) {
      const d = Math.abs(i - pos);
      items[i].style.opacity = String(Math.max(0.18, 1 - d * 0.4));
      items[i].style.transform = `scale(${1 - Math.min(d, 2.5) * 0.09})`;
    }
    painted = [lo, hi];
  }

  // Ό,τι εξαρτάται από τα λεπτά: προεπιλογές, υπότιτλος, σημείωση, προσβασιμότητα
  function paintValue() {
    const m = choice.minutes;
    wheel.setAttribute('aria-valuenow', m);
    wheel.setAttribute('aria-valuetext', `${m} minutes`);
    presets.forEach((b) => b.classList.toggle('selected', Number(b.dataset.minutes) === m));
    caption.textContent = m >= 60 ? hoursText(m) : '';
    const earn = earnedFor(m);
    note.textContent = earn
      ? `Finish to earn ${earn} min. Stopping early costs ${PENALTY_MIN}.`
      : 'Under 2 minutes earns nothing.';
  }

  function cancelAnim() {
    cancelAnimationFrame(animId);
    animating = false;
    scroller.style.scrollSnapType = '';
  }

  // Φέρνει τον τροχό στα m λεπτά. Η κίνηση είναι "ease-out" (ξεκινάει γρήγορα,
  // επιβραδύνει στο τέλος), όπως οι κινήσεις της Apple.
  function goTo(m, animate = true) {
    cancelAnim();
    choice.minutes = clamp(m);
    paintValue();
    const target = offsetFor(choice.minutes);
    const from = scroller.scrollTop;
    const dist = target - from;
    if (!animate || reduceMotion() || Math.abs(dist) < 1) {
      scroller.scrollTop = target;
      return;
    }
    animating = true;
    scroller.style.scrollSnapType = 'none'; // αλλιώς το snap "τραβάει" την κίνηση
    const t0 = performance.now();
    const dur = Math.min(650, 300 + Math.abs(dist) * 0.1);
    const step = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      scroller.scrollTop = from + dist * (1 - (1 - p) ** 4);
      if (p < 1) animId = requestAnimationFrame(step);
      else cancelAnim();
    };
    animId = requestAnimationFrame(step);
  }

  scroller.addEventListener('scroll', () => {
    // Η τιμή ενημερώνεται αμέσως (είναι φτηνή)...
    if (!animating) { // όσο κινείται μόνος του, την τιμή την έχει ήδη ορίσει το goTo
      const m = clamp(scroller.scrollTop / ITEM_H + 1);
      if (m !== choice.minutes) { choice.minutes = m; paintValue(); }
    }
    // ...ενώ το μέγεθος/διαφάνεια των γραμμών ζωγραφίζεται το πολύ μία φορά ανά frame
    if (frame) return;
    frame = requestAnimationFrame(() => { frame = null; paintWheel(); });
  }, { passive: true });

  // Αν αγγίξεις τον τροχό όσο κινείται μόνος του, τον παίρνεις εσύ
  ['pointerdown', 'wheel', 'touchstart'].forEach((t) => scroller.addEventListener(t, cancelAnim, { passive: true }));

  // Πληκτρολόγιο: ↑/↓ ένα λεπτό, PageUp/PageDown δέκα
  wheel.addEventListener('keydown', (e) => {
    const move = { ArrowUp: -1, ArrowDown: 1, PageUp: -10, PageDown: 10, Home: -MAX_MIN, End: MAX_MIN }[e.key];
    if (!move) return;
    e.preventDefault();
    goTo(choice.minutes + move, !e.repeat);
  });

  // Αρχική θέση, χωρίς κίνηση
  paintValue();
  scroller.scrollTop = offsetFor(choice.minutes);
  paintWheel();

  el.onchange = (ev) => {
    if (ev.target.name === 'activity') choice.activity = ev.target.value;
  };
  el.onclick = (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.dataset.minutes) goTo(Number(b.dataset.minutes));
    else if ('start' in b.dataset) start(choice.activity, choice.minutes);
  };
}

// ===================== Καταχώρηση =====================

register({
  id: 'timer',
  title: 'Focus',
  icon: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 9.5v4l2.5 2M9.5 2.5h5"/>',
  order: 40,
  nav: true,
  homeCard() {
    const minutes = todaySessions().filter((s) => s.completed).reduce((sum, s) => sum + s.minutes, 0);
    return minutes
      ? { value: `${minutes} min`, label: 'Focused today' }
      : { value: '', label: 'Study, read or work out' };
  },
  render,
});

// Αν το app άνοιξε ενώ υπήρχε συνεδρία σε εξέλιξη: ξανακλειδώνουμε
// (ή, αν ο χρόνος τελείωσε όσο ήταν κλειστό, δείχνουμε το αποτέλεσμα).
if (getActive()) {
  const a = getActive();
  closeAway(a);
  saveActive(a);
  showOverlay();
}
