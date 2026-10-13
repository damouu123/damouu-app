// Timer εστίασης: διάβασμα εξετάσεων, βιβλίο, άσκηση.
//
// ΠΩΣ ΜΕΤΡΑΜΕ ΤΟΝ ΧΡΟΝΟ
// Το iOS "παγώνει" το app όταν δεν το βλέπεις, άρα ένας μετρητής που
// χτυπάει κάθε δευτερόλεπτο θα σταματούσε. Γι' αυτό στην αρχή γράφουμε
// ΠΟΤΕ τελειώνει η συνεδρία (endsAt, timestamp σε ms) και κάθε φορά
// υπολογίζουμε: υπόλοιπο = endsAt - τώρα. Αν το app ξανανοίξει μετά το
// endsAt, η συνεδρία ολοκληρώνεται εκείνη τη στιγμή.
//
// Δεδομένα (moduleStore('timer')):
//   active    η συνεδρία που τρέχει τώρα (ή null)
//   sessions  ιστορικό: [{ id, activity, minutes, startedAt, endedAt, awayMs, completed, earned }]
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

// Κάθε 2 λεπτά εστίασης = 1 λεπτό scroll (κανονική στρογγυλοποίηση: 25 -> 13)
export const EARN_RATE = 0.5;
export const earnedFor = (minutes) => Math.round(minutes * EARN_RATE);

const HOLD_MS = 10000;          // πόση ώρα κρατάς πατημένο για να σταματήσεις
const MIN_MIN = 5;
const MAX_MIN = 180;
// Στον υπολογιστή (localhost) δείχνουμε και επιλογή 1 λεπτού για δοκιμές
const IS_DEV = ['localhost', '127.0.0.1'].includes(location.hostname);

export function getSessions() {
  return store.get('sessions', []);
}

const getActive = () => store.get('active', null);
const saveActive = (a) => store.set('active', a);

// ===================== Κύκλος ζωής συνεδρίας =====================

function start(activity, minutes) {
  const now = Date.now();
  saveActive({
    id: `s${now.toString(36)}`,
    activity,
    minutes,
    startedAt: now,
    endsAt: now + minutes * 60000,
    awayMs: 0,      // πόση ώρα ήσουν εκτός app
    hiddenAt: null, // πότε βγήκες από το app (αν είσαι έξω τώρα)
  });
  store.set('last', { activity, minutes });
  unlockAudio();
  showOverlay();
}

// Προσθέτει στο awayMs τον χρόνο από τότε που βγήκες από το app
function closeAway(a) {
  if (a.hiddenAt) {
    a.awayMs += Math.max(0, Math.min(Date.now(), a.endsAt) - a.hiddenAt);
    a.hiddenAt = null;
  }
}

// completed: true = τελείωσε ο χρόνος, false = το σταμάτησες
function finish(completed) {
  const a = getActive();
  if (!a) return null;
  closeAway(a);
  const session = {
    id: a.id,
    activity: a.activity,
    minutes: a.minutes,
    startedAt: a.startedAt,
    endedAt: completed ? a.endsAt : Date.now(),
    awayMs: Math.round(a.awayMs),
    completed,
    earned: completed ? earnedFor(a.minutes) : 0,
  };
  store.update('sessions', (list) => [...list, session], []);
  store.remove('active');
  emit('focus:finished', session);
  return session;
}

// ===================== Ήχος στο τέλος =====================
// Το iOS επιτρέπει ήχο μόνο αν "ξεκλειδωθεί" από πάτημα, γι' αυτό
// φτιάχνουμε το AudioContext όταν πατάς Start.
let audio = null;
function unlockAudio() {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    audio.resume();
  } catch { audio = null; }
}
function chime() {
  if (!audio) return;
  try {
    [0, 0.25].forEach((delay, i) => {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.frequency.value = i ? 880 : 660;
      gain.gain.setValueAtTime(0.0001, audio.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.3, audio.currentTime + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + delay + 0.5);
      osc.connect(gain).connect(audio.destination);
      osc.start(audio.currentTime + delay);
      osc.stop(audio.currentTime + delay + 0.55);
    });
  } catch { /* χωρίς ήχο */ }
}

// ===================== Οθόνη να μένει αναμμένη =====================
// Wake Lock: όσο τρέχει το timer, η οθόνη δεν σβήνει μόνη της
// (όπου υποστηρίζεται· αλλιώς απλώς αγνοείται).
let wakeLock = null;
async function keepScreenOn() {
  try {
    if ('wakeLock' in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    }
  } catch { wakeLock = null; }
}
function letScreenSleep() {
  try { if (wakeLock) wakeLock.release(); } catch { /* τίποτα */ }
  wakeLock = null;
}

// ===================== Κλειδωμένη οθόνη (overlay) =====================
// Ένα στοιχείο που καλύπτει ΟΛΟ το app, μαζί και την κάτω μπάρα.
// Δεν ανήκει σε καμία οθόνη του router, άρα μένει ό,τι κι αν γίνει.

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

function showOverlay() {
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'focus-screen';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Focus session');
    document.body.appendChild(overlay);
    document.body.classList.add('locked');
  }
  renderRunning();
  keepScreenOn();
  clearInterval(ticker);
  ticker = setInterval(tick, 250);
  tick();
}

function hideOverlay() {
  clearInterval(ticker);
  ticker = null;
  letScreenSleep();
  if (overlay) overlay.remove();
  overlay = null;
  document.body.classList.remove('locked');
}

function renderRunning() {
  const a = getActive();
  if (!a || !overlay) return;
  overlay.innerHTML = `
    <div class="focus-inner">
      <p class="focus-activity">${icon(ACTIVITIES[a.activity].icon)} ${ACTIVITIES[a.activity].label}</p>
      <p class="focus-time" aria-live="off">${fmt(a.endsAt - Date.now())}</p>
      <div class="progress focus-progress"><span></span></div>
      <p class="muted">Ends at ${clock(a.endsAt)}. You'll earn ${earnedFor(a.minutes)} min of scroll time.</p>
      <p class="focus-away muted" hidden></p>
    </div>
    <button class="hold-btn" type="button">
      <span class="hold-fill" aria-hidden="true"></span>
      <span class="hold-label">Hold for 10 seconds to stop</span>
    </button>`;
  bindHold(overlay.querySelector('.hold-btn'), renderConfirm);
}

// Ενημερώνει την ώρα· αν τελείωσε ο χρόνος, ολοκληρώνει τη συνεδρία
function tick() {
  const a = getActive();
  if (!a) return;
  const now = Date.now();
  if (now >= a.endsAt) {
    const session = finish(true);
    if (!document.hidden) chime();
    renderResult(session);
    return;
  }
  if (!overlay) return;
  const time = overlay.querySelector('.focus-time');
  if (time) time.textContent = fmt(a.endsAt - now);
  const bar = overlay.querySelector('.focus-progress span');
  if (bar) bar.style.width = `${((now - a.startedAt) / (a.endsAt - a.startedAt)) * 100}%`;
  const away = overlay.querySelector('.focus-away');
  if (away && a.awayMs >= 60000) {
    away.hidden = false;
    away.textContent = `Time outside the app so far: ${Math.round(a.awayMs / 60000)} min`;
  }
}

// Παρατεταμένο πάτημα: γεμίζει μια μπάρα για HOLD_MS. Αν αφήσεις νωρίτερα, μηδενίζει.
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
    label.textContent = 'Hold for 10 seconds to stop';
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
  const left = Math.ceil((a.endsAt - Date.now()) / 60000);
  overlay.innerHTML = `
    <div class="focus-inner confirm">
      <h2>Do you really want to stop?</h2>
      <p class="muted">You have ${left} ${left === 1 ? 'minute' : 'minutes'} left.
        If you stop now, you lose this session and earn no scroll time.</p>
      <div class="stack">
        <button class="btn btn-block" data-keep>Keep focusing</button>
        <button class="btn btn-danger btn-block" data-quit>Stop and earn nothing</button>
      </div>
    </div>`;
  overlay.querySelector('[data-keep]').addEventListener('click', renderRunning);
  overlay.querySelector('[data-quit]').addEventListener('click', () => {
    finish(false);
    hideOverlay();
    toast('Session stopped. No time earned');
    refresh(); // ξαναζωγραφίζει την οθόνη από κάτω (π.χ. τη λίστα "Today")
  });
}

function renderResult(session) {
  clearInterval(ticker);
  ticker = null;
  letScreenSleep();
  if (!overlay) showOverlayShell();
  const away = Math.round(session.awayMs / 60000);
  overlay.innerHTML = `
    <div class="focus-inner">
      <p class="hero-label">Session complete</p>
      <p class="hero-number"><strong>+${session.earned}</strong><span>min</span></p>
      <p>${session.minutes} minutes of ${ACTIVITIES[session.activity].label.toLowerCase()}.
        Scroll time earned.</p>
      ${away ? `<p class="muted">You spent ${away} min of it outside the app.</p>` : ''}
      <div class="stack"><button class="btn btn-block" data-done>Done</button></div>
    </div>`;
  overlay.querySelector('[data-done]').addEventListener('click', () => {
    hideOverlay();
    // Στην Αρχική, για να δεις το νέο υπόλοιπο λεπτών
    if (['', 'home'].includes(location.hash.replace(/^#\/?/, ''))) refresh();
    else navigate('home');
  });
}

// Overlay χωρίς ticker (για αποτέλεσμα που βρέθηκε μόλις άνοιξε το app)
function showOverlayShell() {
  overlay = document.createElement('div');
  overlay.className = 'focus-screen';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  document.body.appendChild(overlay);
  document.body.classList.add('locked');
}

// ===================== Όταν βγαίνεις/μπαίνεις στο app =====================

document.addEventListener('visibilitychange', () => {
  const a = getActive();
  if (!a) return;
  if (document.hidden) {
    a.hiddenAt = Date.now();
    saveActive(a);
    letScreenSleep();
  } else {
    closeAway(a);
    saveActive(a);
    keepScreenOn();
    tick();
  }
});

// ===================== Οθόνη επιλογής =====================

let choice = null; // { activity, minutes }

function todaySessions() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return getSessions().filter((s) => s.startedAt >= start.getTime());
}

function render(el) {
  if (!choice) choice = store.get('last', null) || { activity: 'study', minutes: 25 };
  const chips = [...(IS_DEV ? [1] : []), 25, 45, 60, 90];
  const today = todaySessions().slice().reverse();

  el.innerHTML = `
    <h2 class="section-title first">What are you focusing on?</h2>
    <div class="activity-picker">
      ${Object.entries(ACTIVITIES).map(([id, a]) => `
        <button class="activity ${choice.activity === id ? 'selected' : ''}" data-activity="${id}"
                aria-pressed="${choice.activity === id}">
          ${icon(a.icon)}<span>${a.label}</span>
        </button>`).join('')}
    </div>

    <h2 class="section-title">For how long?</h2>
    <div class="duration">
      <button class="icon-btn" data-step="-5" aria-label="5 minutes less">−</button>
      <p><strong>${choice.minutes}</strong><span>min</span></p>
      <button class="icon-btn" data-step="5" aria-label="5 minutes more">+</button>
    </div>
    <div class="chips">
      ${chips.map((m) => `
        <button class="chip ${choice.minutes === m ? 'selected' : ''}" data-minutes="${m}">${m} min</button>`).join('')}
    </div>
    <p class="earn-line">You'll earn ${earnedFor(choice.minutes)} min of scroll time.</p>

    <button class="btn btn-block" data-start>Start focusing</button>
    <p class="muted small-print">
      The screen locks until the time is up. To stop early, hold the stop button for 10 seconds.
      Locking your phone is fine: the timer keeps going.
    </p>

    ${today.length ? `
      <h2 class="section-title">Today</h2>
      <ul class="list">${today.map((s) => `
        <li><div class="row row-static">
          <span class="row-text">
            <span class="row-title">${escapeHtml(ACTIVITIES[s.activity].label)}</span>
            <span class="row-sub">${clock(s.startedAt)}, ${s.minutes} min</span>
          </span>
          <span class="row-value ${s.completed ? 'earned' : 'muted'}">${s.completed ? `+${s.earned}` : 'Stopped'}</span>
        </div></li>`).join('')}
      </ul>` : ''}`;

  el.onclick = (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    const d = b.dataset;
    if (d.activity) choice.activity = d.activity;
    else if (d.step) choice.minutes = Math.min(MAX_MIN, Math.max(MIN_MIN, choice.minutes + Number(d.step)));
    else if (d.minutes) choice.minutes = Number(d.minutes);
    else if ('start' in d) { start(choice.activity, choice.minutes); return; }
    else return;
    render(el);
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
