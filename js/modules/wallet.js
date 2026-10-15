// Πορτοφόλι χρόνου: λεπτά scroll που κέρδισες, ξόδεψες και πήρες ως reward.
//
// Το υπόλοιπο ΔΕΝ αποθηκεύεται ως ένας αριθμός. Υπολογίζεται κάθε φορά
// από όλες τις "κινήσεις", όπως ένα τραπεζικό αντίγραφο:
//   + λεπτά από ολοκληρωμένα timers   (από το timer module)
//   − ποινές από νωρίς σταματημένα    (από το timer module)
//   + weekly rewards που διεκδίκησες  (εδώ)
//   − λεπτά scroll που κατέγραψες     (εδώ)
// Μπορεί να βγει αρνητικό: σημαίνει ότι "χρωστάς" λεπτά.
//
// Δεδομένα (moduleStore('wallet')):
//   spends  [{ id, minutes, where, at }]   πού ξόδεψες λεπτά
//   claims  { "2026-10-05": { minutes, at } }  rewards ανά εβδομάδα (κλειδί = Δευτέρα)
//   places  ["Reddit", ...]  δικά σου "πού" (εκτός από τα έτοιμα)

import { register, emit } from '../core/registry.js';
import { moduleStore } from '../core/storage.js';
import { escapeHtml, toast, ask, openSheet, refresh } from '../core/router.js';
import { getSessions, ACTIVITIES } from './timer.js';
import { weekStats } from './resume.js';
import { SCROLL_XP_PER_MIN } from './xp.js';
import { weekStart, addDays, dateKey, parseKey, startOfDay } from './calendar.js';

const store = moduleStore('wallet');

const DEFAULT_PLACES = ['Instagram', 'TikTok', 'YouTube'];
const AMOUNTS = [5, 10, 15, 30, 60];
const MAX_REWARD_WEEKS = 4; // πόσες παλιές εβδομάδες μπορείς ακόμα να διεκδικήσεις
const HISTORY_SIZE = 10;

const getSpends = () => store.get('spends', []);
const getClaims = () => store.get('claims', {});

// "−5" με κανονικό σύμβολο μείον αντί για παύλα
const signed = (n) => (n < 0 ? `−${-n}` : n > 0 ? `+${n}` : '0');

// ===================== Weekly rewards =====================
// Δύο κριτήρια συνέπειας ανά εβδομάδα:
//   Παρουσία στις διαλέξεις:  >= 90% -> +15,  >= 75% -> +5
//   Μέρες με ολοκληρωμένο focus: >= 5 -> +15,  >= 3 -> +5

export const REWARD_RULES = {
  attendance: [{ min: 0.9, minutes: 15 }, { min: 0.75, minutes: 5 }],
  focusDays: [{ min: 5, minutes: 15 }, { min: 3, minutes: 5 }],
};

const tierFor = (tiers, value) => tiers.find((t) => value >= t.min)?.minutes || 0;

export function weekReward(ws) {
  const from = dateKey(ws);
  const to = dateKey(addDays(ws, 6));
  const rate = weekStats(ws).rate; // null αν δεν σημείωσες κανένα μάθημα
  const focusDays = new Set(
    getSessions()
      .filter((s) => s.completed)
      .map((s) => dateKey(new Date(s.endedAt)))
      .filter((d) => d >= from && d <= to),
  ).size;
  const attendance = rate === null ? 0 : tierFor(REWARD_RULES.attendance, rate);
  const focus = tierFor(REWARD_RULES.focusDays, focusDays);
  return { rate, focusDays, attendance, focus, total: attendance + focus };
}

// Εβδομάδες που τελείωσαν, έχουν reward και δεν το έχεις πάρει ακόμα
function claimableWeeks() {
  const claims = getClaims();
  const thisWeek = weekStart(new Date());
  const out = [];
  for (let i = 1; i <= MAX_REWARD_WEEKS; i++) {
    const ws = addDays(thisWeek, -7 * i);
    if (claims[dateKey(ws)]) continue;
    const r = weekReward(ws);
    if (r.total > 0) out.push({ ws, ...r });
  }
  return out;
}

function claim(ws, minutes) {
  store.update('claims', (c) => ({ ...c, [dateKey(ws)]: { minutes, at: Date.now() } }), {});
}

// ===================== Κινήσεις και υπόλοιπο =====================

// Όλες οι κινήσεις, νεότερη πρώτη: [{ at, amount, title, sub, kind, id? }]
export function getLedger() {
  const items = [];
  for (const s of getSessions()) {
    const label = ACTIVITIES[s.activity]?.label || 'Focus';
    if (s.completed && s.earned) {
      items.push({ at: s.endedAt, amount: s.earned, title: label, sub: `${s.minutes} min focus`, kind: 'focus' });
    }
    if (s.penalty) {
      items.push({ at: s.endedAt, amount: -s.penalty, title: label, sub: 'Stopped early', kind: 'penalty' });
    }
  }
  for (const [week, c] of Object.entries(getClaims())) {
    const day = parseKey(week).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
    items.push({ at: c.at, amount: c.minutes, title: 'Weekly reward', sub: `Week of ${day}`, kind: 'reward' });
  }
  for (const sp of getSpends()) {
    items.push({ at: sp.at, amount: -sp.minutes, title: sp.where, sub: 'Scroll time', kind: 'spend', id: sp.id });
  }
  return items.sort((a, b) => b.at - a.at);
}

export function getBalance() {
  return getLedger().reduce((sum, i) => sum + i.amount, 0);
}

// Πόσα λεπτά εστίασης ολοκλήρωσες σήμερα
function focusedToday() {
  const from = startOfDay(new Date()).getTime();
  return getSessions().filter((s) => s.completed && s.endedAt >= from).reduce((sum, s) => sum + s.minutes, 0);
}

// ===================== Φύλλο: καταγραφή scroll =====================

// Τι έχεις επιλέξει στη φόρμα (μένει όσο είναι ανοιχτό το app)
const form = { minutes: 15, where: 'Instagram', other: false, otherText: '' };

function places() {
  return [...DEFAULT_PLACES, ...store.get('places', [])];
}

// onDone: τι να ξαναζωγραφιστεί όταν καταγραφεί (η σελίδα που το άνοιξε)
export function openLogSheet(onDone) {
  openSheet('', (root, close) => {
    const paint = () => {
      const balance = getBalance();
      root.innerHTML = `
        <h2>Log scroll time</h2>
        <div class="duration">
          <button class="icon-btn" data-step="-5" aria-label="5 minutes less">−</button>
          <p><strong>${form.minutes}</strong><span>min</span></p>
          <button class="icon-btn" data-step="5" aria-label="5 minutes more">+</button>
        </div>
        <div class="chips">
          ${AMOUNTS.map((m) => `<button class="chip ${form.minutes === m ? 'selected' : ''}" data-amount="${m}">${m}</button>`).join('')}
        </div>
        <div class="chips">
          ${places().map((p) => `<button class="chip ${!form.other && form.where === p ? 'selected' : ''}" data-place="${escapeHtml(p)}">${escapeHtml(p)}</button>`).join('')}
          <button class="chip ${form.other ? 'selected' : ''}" data-other>Other</button>
        </div>
        ${form.other ? `
          <label class="field other-field"><span>Where?</span>
            <input id="other-place" maxlength="30" autocomplete="off" placeholder="For example Reddit"
                   value="${escapeHtml(form.otherText)}"></label>` : ''}
        <p class="form-error" role="alert" hidden></p>
        <p class="muted small-print">Costs ${form.minutes * SCROLL_XP_PER_MIN} XP.${balance - form.minutes < 0
          ? ` This puts you at ${signed(balance - form.minutes)} min.` : ''}</p>
        <button class="btn btn-block spend-btn" data-log>Log ${form.minutes} min</button>`;
    };
    paint();

    root.addEventListener('input', (ev) => {
      if (ev.target.id === 'other-place') form.otherText = ev.target.value;
    });
    root.addEventListener('click', (ev) => {
      const b = ev.target.closest('button');
      if (!b) return;
      const d = b.dataset;
      if (d.step) form.minutes = Math.min(600, Math.max(5, form.minutes + Number(d.step)));
      else if (d.amount) form.minutes = Number(d.amount);
      else if (d.place) { form.where = d.place; form.other = false; }
      else if ('other' in d) { form.other = true; paint(); root.querySelector('#other-place').focus(); return; }
      else if ('log' in d) {
        let where = form.where;
        if (form.other) {
          where = form.otherText.trim();
          if (!where) {
            const error = root.querySelector('.form-error');
            error.textContent = 'Write where you spent the time.';
            error.hidden = false;
            return;
          }
          // Θυμόμαστε το νέο "πού" για την επόμενη φορά
          if (!places().includes(where)) store.update('places', (p) => [...p, where].slice(-4), []);
          form.where = where;
          form.other = false;
          form.otherText = '';
        }
        store.update('spends', (list) => [...list, {
          id: `p${Date.now().toString(36)}`, minutes: form.minutes, where, at: Date.now(),
        }], []);
        toast(`Logged ${form.minutes} min on ${where}`);
        emit('wallet:changed'); // το XP δείχνει "−N XP"
        close();
        if (onDone) onDone();
        return;
      } else {
        return;
      }
      paint();
    });
  });
}

// Φύλλο: πώς δουλεύουν τα rewards
function rulesSheet() {
  const pct = (r) => Math.round(r.min * 100);
  const [a1, a2] = REWARD_RULES.attendance;
  const [f1, f2] = REWARD_RULES.focusDays;
  openSheet(`
    <h2>Weekly rewards</h2>
    <p class="muted">Each week you can earn minutes for being consistent. Claim them after the week ends.</p>
    <ul class="list rules-list">
      <li><div class="row row-static"><span class="row-text"><span class="row-title">Attendance ${pct(a2)}%</span></span><span class="row-value earned">+${a2.minutes}</span></div></li>
      <li><div class="row row-static"><span class="row-text"><span class="row-title">Attendance ${pct(a1)}%</span></span><span class="row-value earned">+${a1.minutes}</span></div></li>
      <li><div class="row row-static"><span class="row-text"><span class="row-title">Focus on ${f2.min} days</span></span><span class="row-value earned">+${f2.minutes}</span></div></li>
      <li><div class="row row-static"><span class="row-text"><span class="row-title">Focus on ${f1.min} days</span></span><span class="row-value earned">+${f1.minutes}</span></div></li>
    </ul>
    <div class="stack"><button class="btn btn-quiet btn-block" data-close>Done</button></div>`,
  (root, close) => root.querySelector('[data-close]').addEventListener('click', close));
}

// ===================== Οθόνη =====================

function balanceHero(balance, hint = '', hintClass = '') {
  return `
    <p class="hero-label">Scroll time</p>
    <p class="hero-number ${balance < 0 ? 'is-negative' : ''}">
      <strong data-count="${balance}" data-count-key="balance">${balance < 0 ? `−${-balance}` : balance}</strong><span>min</span></p>
    ${hint ? `<p class="hero-hint ${hintClass}">${hint}</p>` : ''}`;
}

const oweHint = (balance) => `You owe ${-balance} min. Focus to win them back.`;

function row(title, sub, value, valueClass = '') {
  return `
    <li><div class="row row-static">
      <span class="row-text"><span class="row-title">${title}</span>${sub ? `<span class="row-sub">${sub}</span>` : ''}</span>
      <span class="row-value ${valueClass}">${value}</span>
    </div></li>`;
}

function render(el) {
  const balance = getBalance();
  const ws = weekStart(new Date());
  const now = weekReward(ws);
  const claimable = claimableWeeks();
  const ledger = getLedger();

  // Πού ξόδεψες αυτή την εβδομάδα
  const byPlace = new Map();
  for (const sp of getSpends().filter((s) => s.at >= ws.getTime())) {
    byPlace.set(sp.where, (byPlace.get(sp.where) || 0) + sp.minutes);
  }
  const spent = [...byPlace.values()].reduce((a, b) => a + b, 0);
  const top = [...byPlace.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([p, m]) => `${escapeHtml(p)} ${m}`).join(', ');

  const weekRows = [
    spent ? row('Scrolled', top, `${spent} min`) : '',
    row('Attendance', now.rate === null ? 'No classes marked yet' : `${Math.round(now.rate * 100)}% so far`,
      now.attendance ? `+${now.attendance}` : '0', now.attendance ? 'earned' : 'muted'),
    row('Focus days', `${now.focusDays} ${now.focusDays === 1 ? 'day' : 'days'} so far`,
      now.focus ? `+${now.focus}` : '0', now.focus ? 'earned' : 'muted'),
  ].join('');

  el.innerHTML = `
    <section class="hero">${balanceHero(balance, balance < 0 ? oweHint(balance) : '')}</section>
    <button class="btn btn-block" data-open-log>Log scroll time</button>

    ${claimable.length ? `
      <h2 class="section-title">Ready to claim</h2>
      <ul class="list">${claimable.map((c) => `
        <li><div class="row row-static">
          <span class="row-text"><span class="row-title">Week of ${c.ws.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}</span></span>
          <button class="btn btn-small" data-claim="${dateKey(c.ws)}" data-minutes="${c.total}">Claim +${c.total}</button>
        </div></li>`).join('')}
      </ul>` : ''}

    <h2 class="section-title">This week</h2>
    <ul class="list">${weekRows}</ul>
    <button class="link-btn" data-rules>How rewards work</button>

    <h2 class="section-title">History</h2>
    ${ledger.length ? `
      <ul class="list">${ledger.slice(0, HISTORY_SIZE).map((i) => {
        const when = new Date(i.at).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
        const inner = `
          <span class="row-text">
            <span class="row-title">${escapeHtml(i.title)}</span>
            <span class="row-sub">${escapeHtml(i.sub)}, ${when}</span>
          </span>
          <span class="row-value ${i.amount > 0 ? 'earned' : 'is-low'}">${signed(i.amount)}</span>`;
        // Μόνο οι καταγραφές scroll σβήνονται (για λάθη)
        return i.id
          ? `<li><button class="row" data-delete="${i.id}" aria-label="Delete this entry">${inner}</button></li>`
          : `<li><div class="row row-static">${inner}</div></li>`;
      }).join('')}</ul>
      ${ledger.some((i) => i.id) ? '<p class="muted small-print">Tap a scroll entry to delete it.</p>' : ''}`
    : `<p class="muted empty-day">Finish a focus session to earn your first minutes.</p>`}`;

  el.onclick = (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    const d = b.dataset;
    if ('openLog' in d) {
      openLogSheet(() => render(el));
    } else if ('rules' in d) {
      rulesSheet();
    } else if (d.claim) {
      claim(parseKey(d.claim), Number(d.minutes));
      toast(`+${d.minutes} min weekly reward`);
      render(el);
    } else if (d.delete) {
      const spend = getSpends().find((s) => s.id === d.delete);
      ask({
        title: 'Delete this entry?',
        text: spend ? `${spend.minutes} min on ${spend.where}. The minutes go back to your wallet.` : '',
        confirmLabel: 'Delete',
      }).then((yes) => {
        if (!yes) return;
        store.update('spends', (list) => list.filter((s) => s.id !== d.delete), []);
        toast('Entry deleted');
        emit('wallet:changed');
        render(el);
      });
    }
  };
}

// ===================== Καταχώρηση =====================

register({
  id: 'wallet',
  title: 'Wallet',
  icon: '<path d="M7 3h10M7 21h10M8 3c0 4 4 5.5 4 9s-4 5-4 9M16 3c0 4-4 5.5-4 9s4 5 4 9"/>',
  order: 50,
  nav: true,
  // Η κορυφή της Αρχικής: το υπόλοιπο και τα δύο βασικά κουμπιά
  renderHomeHero(el) {
    const balance = getBalance();
    const today = focusedToday();
    let hint = ''; let hintClass = '';
    if (balance < 0) hint = oweHint(balance);
    else if (claimableWeeks().length) { hint = 'A weekly reward is ready in Wallet.'; hintClass = 'reward-hint'; }
    else if (today) hint = `${today} min focused today`;

    el.innerHTML = `
      ${balanceHero(balance, hint, hintClass)}
      <div class="hero-actions">
        <button class="btn" data-go="timer">Start focus</button>
        <button class="btn btn-quiet" data-log-scroll>Log scroll</button>
      </div>`;
    // Τα κουμπιά data-go τα "πιάνει" η Αρχική (router). Το "Log scroll" ανοίγει το φύλλο εδώ.
    el.querySelector('[data-log-scroll]').addEventListener('click', () => openLogSheet(refresh));
  },
  render,
});
