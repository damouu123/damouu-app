// Το μυαλό σου: μεγαλώνει με τις διαλέξεις που πας.
//
// ΚΑΝΟΝΕΣ
//   Went         κάθε 5 μαθήματα που πήγες, μεγαλώνει ένα "stage"
//   Left early   κουράζεται
//   Missed       αρχίζει να σκουριάζει
//   Όλα κρίνονται από ΟΛΑ τα μαθήματα που έχεις δηλώσει (όχι από τη μέρα ή
//   τα πρόσφατα): η σκουριά από το ποσοστό των Missed, η κούραση από το
//   ποσοστό των Left early. Όσο πηγαίνεις, τα ποσοστά πέφτουν και ξεθωριάζουν.
//   Αν σχεδόν όλα είναι Went, είναι χαρούμενο.
//   Τα cancelled δεν μετράνε.
//
// Δεν αποθηκεύει τίποτα για το μυαλό: όλα υπολογίζονται από τις παρουσίες.
// Κρατάμε μόνο το τελευταίο stage που είδαμε, για να δείξουμε "Your brain grew".
//
// Εδώ ζει και το streak (μαθήματα στη σειρά χωρίς απουσία) για το Weekly review.
//
// Δεδομένα (moduleStore('brain')):
//   lastStage  το stage την τελευταία φορά που το δείξαμε

import { register, on } from '../core/registry.js';
import { moduleStore } from '../core/storage.js';
import { navigate, toast, openSheet } from '../core/router.js';
import { validAttendance } from './calendar.js';

const store = moduleStore('brain');

const GROW_EVERY = 5;   // μαθήματα (Went) για κάθε μεγάλωμα
// Από ποιο ποσοστό (στο σύνολο των μαθημάτων) ξεκινά κάθε επίπεδο
const RUST_AT = [0.05, 0.15, 0.3];  // Missed: σκουριά 1, 2, 3
const TIRED_AT = [0.1, 0.25];       // Left early: κούραση 1, 2
const levelOf = (rate, steps) => steps.filter((s) => rate >= s).length;
const MAX_STAGE_SIZE = 10; // μετά από αυτό το stage δεν μεγαλώνει άλλο στην οθόνη

// ===================== Υπολογισμός =====================

// Όλες οι παρουσίες που μετράνε (του τωρινού προγράμματος, χωρίς cancelled),
// με χρονολογική σειρά
export function countedRecords() {
  return validAttendance()
    .filter((r) => r.status !== 'cancelled')
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
}

// Streak = συνεχόμενα μαθήματα που πήγες (και το "Left early" μετράει,
// γιατί εμφανίστηκες). Ένα "Missed" το μηδενίζει.
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

export function brainState(records = countedRecords()) {
  const total = records.length;
  const count = (s) => records.filter((r) => r.status === s).length;
  const went = count('attended');
  const missRate = total ? count('missed') / total : 0;
  const leftRate = total ? count('left') / total : 0;
  const rust = levelOf(missRate, RUST_AT);
  const tired = levelOf(leftRate, TIRED_AT);
  const mood = rust >= 2 ? 'rusty'
    : tired ? 'tired'
      : rust ? 'worried'
        : went ? 'happy' : 'calm';
  const { current, best } = streaks(records);
  return {
    went,
    stage: Math.floor(went / GROW_EVERY),
    into: went % GROW_EVERY, // πόσα μαθήματα μέσα στο τωρινό stage
    total,
    missRate,
    leftRate,
    rust,
    tired,
    mood,
    streak: current,
    bestStreak: best,
  };
}

const MOOD_TEXT = {
  happy: 'Happy and growing',
  calm: 'Doing fine',
  worried: 'A little rusty',
  rusty: 'Getting rusty. Go to your next class',
  tired: 'Tired from leaving early',
};

// ===================== Η εικόνα (SVG) =====================

// Οι "λοβοί": κύκλοι ίδιου χρώματος που μαζί κάνουν το σχήμα του μυαλού
const LOBES = [[62, 62, 34], [100, 46, 36], [138, 62, 34], [46, 98, 31], [154, 98, 31], [78, 112, 35], [122, 112, 35], [100, 84, 42]];
// Οι κουκκίδες σκουριάς, όσο περισσότερες απουσίες τόσο περισσότερες
const RUST_SPOTS = [[58, 58, 9], [146, 70, 8], [126, 122, 10], [44, 102, 7], [96, 40, 7], [80, 120, 6]];

function faceSvg(mood) {
  const eyes = {
    happy: '<path d="M78 92q7-9 14 0M108 92q7-9 14 0"/>',
    calm: '<circle cx="85" cy="92" r="4.5" class="ink-fill"/><circle cx="115" cy="92" r="4.5" class="ink-fill"/>',
    worried: '<circle cx="85" cy="94" r="4.5" class="ink-fill"/><circle cx="115" cy="94" r="4.5" class="ink-fill"/><path d="M77 83l14 4M123 83l-14 4"/>',
    rusty: '<circle cx="85" cy="95" r="4" class="ink-fill"/><circle cx="115" cy="95" r="4" class="ink-fill"/><path d="M76 86l15-3M124 86l-15-3"/>',
    tired: '<path d="M78 94h14M108 94h14"/><path d="M78 90q7 3 14 0M108 90q7 3 14 0" class="lid"/>',
  }[mood];
  const mouth = {
    happy: '<path d="M88 106q12 13 24 0" />',
    calm: '<path d="M92 108q8 6 16 0"/>',
    worried: '<path d="M93 111q7-4 14 0"/>',
    rusty: '<path d="M90 113q10-8 20 0"/>',
    tired: '<path d="M91 110q4-3 9 0t9 0"/>',
  }[mood];
  const extras = {
    happy: '<circle cx="72" cy="104" r="6" class="blush"/><circle cx="128" cy="104" r="6" class="blush"/>',
    tired: '<text x="150" y="40" class="zz">z</text><text x="162" y="26" class="zz small">z</text>',
    rusty: '<path d="M148 92q4 8 0 12q-4-4 0-12z" class="drop"/>',
  }[mood] || '';
  return `<g class="face">${eyes}${mouth}</g>${extras}`;
}

export function brainSvg(s) {
  const scale = 0.62 + Math.min(s.stage, MAX_STAGE_SIZE) * 0.038;
  const spots = RUST_SPOTS.slice(0, [0, 2, 4, 6][s.rust]);
  return `
    <svg class="brain mood-${s.mood} rust-${s.rust}" viewBox="0 0 200 170" role="img"
         aria-label="Your brain, stage ${s.stage}, ${MOOD_TEXT[s.mood].toLowerCase()}">
      ${s.mood === 'happy' ? '<g class="sparkles"><path d="M26 34l3 7 7 3-7 3-3 7-3-7-7-3 7-3z"/><path d="M172 120l2 5 5 2-5 2-2 5-2-5-5-2 5-2z"/></g>' : ''}
      <g class="brain-float"><g class="brain-body" style="transform: scale(${scale.toFixed(3)})">
        <g class="lobes-edge">${LOBES.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r + 4}"/>`).join('')}</g>
        <g class="lobes">${LOBES.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join('')}</g>
        <g class="folds">
          <path d="M100 18v22M100 128v14"/>
          <path d="M52 48q12 6 8 18M140 46q-10 8-6 20M36 92q12-2 16 8M164 92q-12-2-16 8"/>
          <path d="M66 128q6-10 18-8M134 128q-6-10-18-8M118 30q8 4 6 14M82 30q-8 4-6 14"/>
        </g>
        <g class="rust">${spots.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join('')}</g>
        ${faceSvg(s.mood)}
      </g></g>
    </svg>`;
}

// ===================== Αρχική και οθόνη =====================

function cardHtml(s, tag = 'button') {
  return `
    <${tag} class="hero-level brain-card" ${tag === 'button' ? 'data-go="brain" aria-label="Your brain. Open details"' : ''}>
      <span class="brain-top">
        <span class="hero-label">Your brain</span>
        <span class="brain-stage">Stage ${s.stage}</span>
      </span>
      <span class="brain-figure">${brainSvg(s)}</span>
      <span class="brain-mood">${MOOD_TEXT[s.mood]}</span>
      <span class="progress"><span style="width:${(s.into / GROW_EVERY) * 100}%"></span></span>
      <span class="level-caption">
        <span>${s.into}/${GROW_EVERY} classes</span>
        <span class="muted">${GROW_EVERY - s.into} more to grow</span>
      </span>
    </${tag}>`;
}

function renderHomeHero(el) {
  el.innerHTML = `
    ${cardHtml(brainState())}
    <div class="hero-actions">
      <button class="btn" data-go="timer">Start focus</button>
      <button class="btn btn-quiet" data-go="notifications">Reminders</button>
    </div>`;
}

function render(el) {
  const s = brainState();
  const rule = (title, sub) => `
    <li><div class="row row-static"><span class="row-text">
      <span class="row-title">${title}</span><span class="row-sub wrap">${sub}</span></span></div></li>`;
  el.innerHTML = `
    ${cardHtml(s, 'section')}
    <div class="stats">
      <div class="stat"><strong>${s.went}</strong><span>Classes went</span></div>
      <div class="stat"><strong>${s.streak}</strong><span>Streak (best ${s.bestStreak})</span></div>
    </div>
    <h2 class="section-title">How it works</h2>
    <ul class="list">
      ${rule('Went', `Every ${GROW_EVERY} classes your brain grows.`)}
      ${rule('Left early', 'Your brain gets tired.')}
      ${rule('Missed', 'Your brain starts to rust.')}
      ${rule('Overall', 'It looks at all your classes together, not just today. The more you go, the more rust and tiredness fade.')}
    </ul>`;
}

// ===================== Μηνύματα όταν δηλώνεις παρουσία =====================

store.set('lastStage', store.get('lastStage', brainState().stage));
on('schedule:changed', () => store.set('lastStage', brainState().stage));
on('attendance:changed', ({ status }) => {
  const s = brainState();
  const before = store.get('lastStage', s.stage);
  store.set('lastStage', s.stage);
  if (s.stage > before) toast(`Your brain grew! Stage ${s.stage}`);
  else if (status === 'attended') toast(`${GROW_EVERY - s.into} more ${GROW_EVERY - s.into === 1 ? 'class' : 'classes'} to grow`);
  else if (status === 'missed') toast('Your brain is getting rusty');
  else if (status === 'left') toast('Your brain is getting tired');
});

register({
  id: 'brain',
  title: 'Your brain',
  icon: '<path d="M9 4.5a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 1V5.5a2 2 0 0 0-3-1zM15 4.5a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 1"/>',
  order: 20,
  home: false, // φαίνεται ήδη ως κάρτα στην κορυφή της Αρχικής
  renderHomeHero,
  render,
});
