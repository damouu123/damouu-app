// Packs: coins, δωρεάν packs, κατάστημα, άνοιγμα σαν του FIFA και συλλογή καρτών.
// (Το αρχείο λέγεται ακόμα wallet.js και το id 'wallet', ώστε να μη χαλάσουν
// οι διευθύνσεις· η οθόνη όμως είναι πλέον "Packs".)
//
// COINS: δεν αποθηκεύονται ως ένας αριθμός. Υπολογίζονται κάθε φορά:
//   + κάθε XP δίνει 1 coin           (διαλέξεις, focus, στόχοι: xp.js)
//   + coins από διπλές κάρτες        (αποθηκεύονται όταν ανοίγεις pack)
//   − ό,τι πλήρωσες για packs        (αποθηκεύεται)
//   − ποινές από νωρίς σταμάτημα     (timer.js)
//
// ΔΩΡΕΑΝ PACKS: δεν αποθηκεύονται κι αυτά. Βγαίνουν από τα επιτεύγματά σου
// (level, στόχοι, streak, εβδομάδες), το καθένα με σταθερό id (π.χ. "level-3").
// Αποθηκεύουμε μόνο ποια έχεις ανοίξει, ώστε να μην ανοίγει δύο φορές.
//
// Δεδομένα (moduleStore('packs')):
//   purchases   [{ id, type, price, at }]
//   opened      { "<packId>": { type, at, cards: [cardId], newIds: [cardId], dupCoins } }
//   collection  { "<cardId>": πόσες φορές την έχεις }
//   seenFree    πόσα δωρεάν packs είχες την τελευταία φορά (για το "New pack!")

import { register, on } from '../core/registry.js';
import { moduleStore } from '../core/storage.js';
import { navigate, escapeHtml, toast, openSheet, refresh, icon } from '../core/router.js';
import { whoosh, reveal } from '../core/feedback.js';
import {
  PACKS, DUPLICATE_COINS, FREE_PACKS, COINS_PER_XP, GOAL_BONUS, GOAL_FOCUS_MIN, FOCUS_XP_PER_MIN, CLASS_POINTS,
} from '../core/rules.js';
import {
  CARDS, RARITIES, RARITY_NAMES, ROLES, STAT_NAMES, SET_NAME, rarityOf, statsOf, cardById,
} from '../../data/cards.js';
import { getXp, goalDays } from './xp.js';
import { getSessions } from './timer.js';
import { weekStats } from './resume.js';
import { weekStart, addDays, dateKey, parseKey } from './calendar.js';

const store = moduleStore('packs');
const rank = (rarity) => RARITIES.indexOf(rarity);
const fmt = (n) => (n < 0 ? `−${Math.abs(n).toLocaleString('en-GB')}` : n.toLocaleString('en-GB'));

// ===================== Coins =====================

const getOpened = () => store.get('opened', {});
const getCollection = () => store.get('collection', {});

export function getCoins() {
  const earned = getXp().total * COINS_PER_XP;
  const dup = Object.values(getOpened()).reduce((sum, o) => sum + (o.dupCoins || 0), 0);
  const spent = store.get('purchases', []).reduce((sum, p) => sum + p.price, 0);
  const penalties = getSessions().reduce((sum, s) => sum + (s.reason === 'stopped' ? s.penalty || 0 : 0), 0);
  return earned + dup - spent - penalties;
}

// ===================== Δωρεάν packs =====================

function focusDaysIn(ws) {
  const from = dateKey(ws);
  const to = dateKey(addDays(ws, 6));
  return new Set(getSessions().filter((s) => s.completed).map((s) => dateKey(new Date(s.endedAt)))
    .filter((d) => d >= from && d <= to)).size;
}

const short = (key) => parseKey(key).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

// Όλα τα δωρεάν packs που έχεις κερδίσει (ανοιγμένα και μη)
function earnedFree() {
  const out = [{ id: 'welcome', type: FREE_PACKS.welcome, why: 'Welcome gift' }];
  const xp = getXp();
  for (let n = 2; n <= xp.level; n++) {
    out.push({ id: `level-${n}`, type: n % 5 === 0 ? FREE_PACKS.level5 : FREE_PACKS.level, why: `Reached level ${n}` });
  }
  for (const g of goalDays()) out.push({ id: `goal-${g.key}`, type: FREE_PACKS.goalDay, why: `Daily goal, ${short(g.key)}` });
  for (let k = FREE_PACKS.streakEvery; k <= xp.bestStreak; k += FREE_PACKS.streakEvery) {
    out.push({ id: `streak-${k}`, type: FREE_PACKS.streak, why: `${k} classes in a row` });
  }
  const thisWeek = weekStart(new Date());
  for (let i = 1; i <= 8; i++) { // οι τελευταίες 8 εβδομάδες που τελείωσαν
    const ws = addDays(thisWeek, -7 * i);
    const key = dateKey(ws);
    const rate = weekStats(ws).rate;
    if (rate !== null && rate >= FREE_PACKS.weekAttendance) out.push({ id: `week-att-${key}`, type: FREE_PACKS.week, why: `Attendance, week of ${short(key)}` });
    if (focusDaysIn(ws) >= FREE_PACKS.weekFocusDays) out.push({ id: `week-focus-${key}`, type: FREE_PACKS.week, why: `Focus 5 days, week of ${short(key)}` });
  }
  if (collectionProgress().owned === CARDS.length) out.push({ id: 'set-complete', type: FREE_PACKS.setComplete, why: 'Completed the collection' });
  return out;
}

// Τα δωρεάν packs που δεν έχεις ανοίξει ακόμα (τα πιο καλά πρώτα)
export function freePacks() {
  const opened = getOpened();
  const order = ['legend', 'gold', 'silver', 'bronze'];
  return earnedFree().filter((p) => !opened[p.id]).sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));
}

function collectionProgress() {
  const col = getCollection();
  return { owned: CARDS.filter((c) => col[c.id]).length, total: CARDS.length };
}

// Όταν κερδίζεις νέο δωρεάν pack (π.χ. πέτυχες τον στόχο), ένα μήνυμα
function checkNewFree() {
  const count = freePacks().length;
  const before = store.get('seenFree', 0);
  if (count > before) toast(count - before === 1 ? 'New free pack unlocked' : `${count - before} new free packs unlocked`);
  store.set('seenFree', count);
}
// Την πρώτη φορά κρατάμε σιωπηλά πόσα υπάρχουν ήδη (χωρίς μήνυμα)
if (store.get('seenFree', null) === null) store.set('seenFree', freePacks().length);
on('attendance:changed', () => setTimeout(checkNewFree, 50));
on('focus:finished', () => setTimeout(checkNewFree, 50));

// ===================== Άνοιγμα pack =====================

function rollRarity(odds) {
  let r = Math.random();
  const entries = Object.entries(odds);
  for (const [rarity, p] of entries) { r -= p; if (r < 0) return rarity; }
  return entries[entries.length - 1][0];
}

function randomCard(rarity) {
  const pool = CARDS.filter((c) => rarityOf(c.rating) === rarity);
  return pool[Math.floor(Math.random() * pool.length)];
}

// Ανοίγει ένα pack: διαλέγει κάρτες, ενημερώνει τη συλλογή, μετατρέπει τις διπλές σε coins
function openPack(packId, type) {
  const def = PACKS[type];
  const rarities = Array.from({ length: def.cards }, () => rollRarity(def.odds));
  if (def.guarantee && !rarities.some((r) => rank(r) >= rank(def.guarantee))) rarities[0] = def.guarantee;

  const col = getCollection();
  let dupCoins = 0;
  const cards = rarities.map(randomCard).map((card) => {
    const rarity = rarityOf(card.rating);
    const isNew = !col[card.id];
    col[card.id] = (col[card.id] || 0) + 1;
    const coins = isNew ? 0 : DUPLICATE_COINS[rarity];
    dupCoins += coins;
    return { card, rarity, isNew, coins };
  }).sort((a, b) => a.card.rating - b.card.rating); // η καλύτερη αποκαλύπτεται τελευταία

  store.set('collection', col);
  store.update('opened', (o) => ({
    ...o,
    [packId]: { type, at: Date.now(), cards: cards.map((c) => c.card.id), newIds: cards.filter((c) => c.isNew).map((c) => c.card.id), dupCoins },
  }), {});
  store.set('seenFree', freePacks().length);
  return { cards, dupCoins, best: cards[cards.length - 1] };
}

function buyPack(type) {
  const def = PACKS[type];
  if (getCoins() < def.price) return null;
  const id = `buy-${Date.now().toString(36)}`;
  store.update('purchases', (list) => [...list, { id, type, price: def.price, at: Date.now() }], []);
  return id;
}

// ===================== Εμφάνιση καρτών και packs =====================

// Ένα σύμβολο ανά ρόλο (στη θέση της φωτογραφίας του παίκτη)
const ROLE_EMBLEMS = {
  WAR: '<path d="M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6z"/><path d="M12 7v10M9 10h6"/>',
  HER: '<path d="m12 2 2.4 6.6L21 9l-5 4.6L17.5 21 12 17.3 6.5 21 8 13.6 3 9l6.6-.4z"/>',
  KNG: '<path d="M3 8l4 4 5-7 5 7 4-4-2 11H5z"/>',
  GEN: '<path d="M5 16a7 7 0 0 1 14 0v4H5zM12 9V3M9 3h6M8 16h8"/>',
  SAG: '<circle cx="8.5" cy="12" r="3.5"/><circle cx="15.5" cy="12" r="3.5"/><path d="M5 5l3.5 3.5M19 5l-3.5 3.5M12 17v3"/>',
  SOL: '<path d="M12 2l3 5h-2v15h-2V7H9z"/>',
};

// Η κάρτα σαν του FIFA. size: 'big' (αποκάλυψη) ή 'small' (συλλογή)
function cardHtml(card, { size = 'small', isNew = false, count = 0, locked = false } = {}) {
  const rarity = rarityOf(card.rating);
  if (locked) {
    return `
      <div class="fcard ${size} r-${rarity} locked" aria-label="${RARITY_NAMES[rarity]} card, not collected yet">
        <div class="fc-emblem">${icon(ROLE_EMBLEMS[card.role])}</div>
        <div class="fc-name">?</div>
      </div>`;
  }
  const stats = statsOf(card);
  return `
    <div class="fcard ${size} r-${rarity}" aria-label="${escapeHtml(card.name)}, ${RARITY_NAMES[rarity]} ${card.rating}">
      <div class="fc-top"><span class="fc-rating">${card.rating}</span><span class="fc-role">${card.role}</span></div>
      <div class="fc-emblem">${icon(ROLE_EMBLEMS[card.role])}</div>
      <div class="fc-name">${escapeHtml(card.name)}</div>
      ${size === 'big' ? `<div class="fc-title">${escapeHtml(card.title)}</div>
      <div class="fc-stats">${STAT_NAMES.map((s) => `<span><b>${stats[s]}</b> ${s}</span>`).join('')}</div>` : ''}
      <div class="fc-origin">${escapeHtml(card.origin)}</div>
      ${isNew ? '<span class="fc-badge">NEW</span>' : ''}
      ${count > 1 ? `<span class="fc-count">×${count}</span>` : ''}
    </div>`;
}

function packHtml(type, size = '') {
  const def = PACKS[type];
  return `
    <div class="pack pack-${type} ${size}" aria-hidden="true">
      <span class="pack-shine"></span>
      <span class="pack-name">${def.name.replace(' Pack', '')}</span>
      <span class="pack-sub">${def.cards} cards</span>
    </div>`;
}

// ===================== Η σκηνή ανοίγματος (σαν του FIFA) =====================
// 1) Το pack τρέμει και λάμπει στο χρώμα της καλύτερης κάρτας μέσα του.
// 2) Πάτημα: για Gold και πάνω "walkout" (καταγωγή -> ρόλος -> rating -> κάρτα),
//    αλλιώς κατευθείαν η καλύτερη κάρτα.
// 3) Όλες οι κάρτες του pack, με "NEW" και coins από τις διπλές.
// Πάτημα οπουδήποτε προχωράει πιο γρήγορα στο επόμενο βήμα.

let stage = null;

function openScene(packId, type, onClose) {
  const result = openPack(packId, type);
  const bestRarity = result.best.rarity;
  const level = rank(bestRarity);

  stage = document.createElement('div');
  stage.className = `pack-scene glow-${bestRarity}`;
  stage.setAttribute('role', 'dialog');
  stage.setAttribute('aria-modal', 'true');
  stage.setAttribute('aria-label', `Opening ${PACKS[type].name}`);
  document.body.appendChild(stage);
  document.body.classList.add('locked');

  let step = 0;
  let timer = null;
  const steps = [];
  const next = () => { clearTimeout(timer); const fn = steps[step++]; if (fn) fn(); };
  const after = (ms) => { timer = setTimeout(next, ms); };

  // 1) Το pack
  steps.push(() => {
    stage.innerHTML = `
      <div class="scene-rays"></div>
      <div class="scene-center">${packHtml(type, 'big shaking')}</div>
      <p class="scene-hint">Tap to open</p>`;
  });

  // 2) Walkout για Gold+ (καταγωγή, ρόλος, rating), αλλιώς λάμψη
  const best = result.best.card;
  if (level >= rank('gold')) {
    const beats = [best.origin.toUpperCase(), ROLES[best.role].name.toUpperCase(), String(best.rating)];
    beats.forEach((text, i) => {
      steps.push(() => {
        if (i === 0) whoosh();
        stage.innerHTML = `
          <div class="scene-rays on"></div>
          <div class="scene-center"><p class="walkout-text ${i === 2 ? 'rating' : ''}">${escapeHtml(text)}</p></div>`;
        after(level >= rank('hero') ? 1300 : 1000);
      });
    });
  } else {
    steps.push(() => {
      whoosh();
      stage.innerHTML = '<div class="scene-rays on"></div><div class="scene-center"><div class="scene-flash"></div></div>';
      after(450);
    });
  }

  // 3) Η καλύτερη κάρτα, μεγάλη
  steps.push(() => {
    reveal(level);
    stage.innerHTML = `
      <div class="scene-rays on"></div>
      <div class="scene-center"><div class="card-reveal">${cardHtml(best, { size: 'big', isNew: result.best.isNew })}</div></div>
      <p class="scene-hint">${result.best.isNew ? 'New card!' : `Duplicate: +${result.best.coins} coins`} Tap to see all</p>`;
  });

  // 4) Όλες οι κάρτες + επόμενα βήματα
  steps.push(() => {
    const another = nextPackOption(type);
    stage.innerHTML = `
      <div class="scene-summary">
        <h2>${escapeHtml(PACKS[type].name)}</h2>
        <div class="summary-cards">${result.cards.map((c, i) => `
          <div class="summary-card" style="--i:${i}">
            ${cardHtml(c.card, { size: 'small', isNew: c.isNew })}
            ${c.coins ? `<span class="dup-coins">+${c.coins}</span>` : ''}
          </div>`).join('')}
        </div>
        ${result.dupCoins ? `<p class="muted centered">Duplicates turned into <b class="coin-text">+${result.dupCoins} coins</b></p>` : ''}
        <div class="stack">
          ${another ? `<button class="btn btn-block" data-another>${another.label}</button>` : ''}
          <button class="btn btn-quiet btn-block" data-done>Done</button>
        </div>
      </div>`;
    stage.querySelector('[data-done]').addEventListener('click', (e) => { e.stopPropagation(); closeScene(onClose); });
    stage.querySelector('[data-another]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      closeScene(() => { another.run(); });
    });
  });

  // Πάτημα στη σκηνή = επόμενο βήμα (εκτός από το τελευταίο, που έχει κουμπιά)
  stage.addEventListener('click', () => { if (step < steps.length) next(); });
  next();
}

function closeScene(then) {
  if (!stage) return;
  stage.classList.add('closing');
  const s = stage;
  stage = null;
  setTimeout(() => { s.remove(); document.body.classList.remove('locked'); if (then) then(); }, 250);
}

// "Open another": πρώτα δωρεάν packs, αλλιώς αγορά ίδιου τύπου αν φτάνουν τα coins
function nextPackOption(type) {
  const free = freePacks();
  if (free.length) {
    return { label: `Open next free pack (${free.length} left)`, run: () => openScene(free[0].id, free[0].type, refresh) };
  }
  const def = PACKS[type];
  if (def.price && getCoins() >= def.price) {
    return {
      label: `Buy another for ${fmt(def.price)}`,
      run: () => { const id = buyPack(type); if (id) openScene(id, type, refresh); },
    };
  }
  return null;
}

// ===================== Σελίδες =====================

function rulesSheet() {
  openSheet(`
    <h2>How packs work</h2>
    <ul class="list rules-list">
      <li><div class="row row-static"><span class="row-text"><span class="row-title">Went to class</span></span><span class="row-value small-value coin-text">+${CLASS_POINTS.attended}</span></div></li>
      <li><div class="row row-static"><span class="row-text"><span class="row-title">Focus</span></span><span class="row-value small-value coin-text">+${FOCUS_XP_PER_MIN} per min</span></div></li>
      <li><div class="row row-static"><span class="row-text"><span class="row-title">Daily goal</span></span><span class="row-value small-value coin-text">+${GOAL_BONUS}</span></div></li>
    </ul>
    <p class="muted small-print">Every XP is also a coin. Spend coins in the store. Free packs: a Bronze for every daily goal
      (all classes and ${GOAL_FOCUS_MIN} min focus), a Silver for every level (Gold every 5th), a Gold for every
      ${FREE_PACKS.streakEvery} classes in a row, and a Silver for a week with 90% attendance or 5 days of focus.
      Duplicates turn into coins automatically.</p>
    <div class="stack"><button class="btn btn-quiet btn-block" data-close>Done</button></div>`,
  (root, close) => root.querySelector('[data-close]').addEventListener('click', close));
}

function renderStore(el) {
  const coins = getCoins();
  const free = freePacks();
  const prog = collectionProgress();

  el.innerHTML = `
    <section class="hero coins-hero">
      <p class="hero-label">Coins</p>
      <p class="hero-number coins ${coins < 0 ? 'is-negative' : ''}">
        <span class="coin" aria-hidden="true"></span><strong data-count="${coins}" data-count-key="coins">${fmt(coins)}</strong></p>
    </section>

    ${free.length ? `
      <h2 class="section-title">Your free packs</h2>
      <div class="pack-row">${free.map((p) => `
        <button class="pack-tile" data-free="${p.id}" data-type="${p.type}" aria-label="Open ${PACKS[p.type].name}: ${escapeHtml(p.why)}">
          ${packHtml(p.type)}
          <span class="pack-why">${escapeHtml(p.why)}</span>
        </button>`).join('')}
      </div>` : ''}

    <h2 class="section-title">Store</h2>
    <div class="store">${['bronze', 'silver', 'gold'].map((type) => {
      const def = PACKS[type];
      const can = coins >= def.price;
      return `
        <button class="store-item" data-buy="${type}" ${can ? '' : 'aria-disabled="true"'}>
          ${packHtml(type)}
          <span class="price"><span class="coin small" aria-hidden="true"></span>${fmt(def.price)}</span>
          <span class="need">${can ? `${def.cards} cards` : `${fmt(def.price - coins)} more`}</span>
        </button>`;
    }).join('')}
    </div>

    <h2 class="section-title">Collection</h2>
    <ul class="list">
      <li><button class="row" data-club>
        <span class="row-text">
          <span class="row-title">${SET_NAME}</span>
          <span class="row-sub">${prog.owned} of ${prog.total} cards</span>
        </span>
        <span class="mini-progress"><span style="width:${Math.round((prog.owned / prog.total) * 100)}%"></span></span>
        <span class="row-chevron" aria-hidden="true">›</span>
      </button></li>
    </ul>
    <button class="link-btn" data-rules>How packs work</button>`;

  el.onclick = (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    const d = b.dataset;
    if (d.free) openScene(d.free, d.type, refresh);
    else if (d.buy) {
      const def = PACKS[d.buy];
      if (getCoins() < def.price) { toast(`You need ${fmt(def.price - getCoins())} more coins`); return; }
      const id = buyPack(d.buy);
      if (id) openScene(id, d.buy, refresh);
    } else if ('club' in d) navigate('wallet/club');
    else if ('rules' in d) rulesSheet();
  };
}

let clubFilter = 'all';

function renderClub(el) {
  const col = getCollection();
  const prog = collectionProgress();
  const shown = CARDS
    .filter((c) => clubFilter === 'all' || rarityOf(c.rating) === clubFilter)
    .sort((a, b) => b.rating - a.rating);

  el.innerHTML = `
    <a class="back-link" href="#/wallet">‹ Packs</a>
    <p class="muted intro first-intro">${prog.owned} of ${prog.total} cards collected. Complete the set for a Legend pack.</p>
    <div class="progress club-progress"><span style="width:${Math.round((prog.owned / prog.total) * 100)}%"></span></div>
    <div class="chips club-filter">
      ${['all', ...RARITIES.slice().reverse()].map((r) => `
        <button class="chip ${clubFilter === r ? 'selected' : ''}" data-filter="${r}">${r === 'all' ? 'All' : RARITY_NAMES[r]}</button>`).join('')}
    </div>
    <div class="club-grid">${shown.map((c) => `
      <button class="club-card" data-card="${c.id}" ${col[c.id] ? '' : 'disabled'}>
        ${cardHtml(c, { size: 'small', count: col[c.id] || 0, locked: !col[c.id] })}
      </button>`).join('')}
    </div>`;

  el.onclick = (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.dataset.filter) { clubFilter = b.dataset.filter; renderClub(el); return; }
    if (b.dataset.card) {
      const card = cardById(b.dataset.card);
      openSheet(`
        <div class="sheet-card">${cardHtml(card, { size: 'big', count: col[card.id] })}</div>
        <p class="muted centered">${RARITY_NAMES[rarityOf(card.rating)]}, ${ROLES[card.role].name}. You have ${col[card.id]}.</p>
        <div class="stack"><button class="btn btn-quiet btn-block" data-close>Done</button></div>`,
      (root, close) => root.querySelector('[data-close]').addEventListener('click', close));
    }
  };
}

// ===================== Καταχώρηση =====================

register({
  id: 'wallet',
  title: 'Packs',
  // Στοίβα καρτών
  icon: '<rect x="4" y="6.5" width="11" height="14.5" rx="1.8"/><path d="M8 6.5V5a1.8 1.8 0 0 1 1.8-1.8h7.4A1.8 1.8 0 0 1 19 5v11.2a1.8 1.8 0 0 1-1.8 1.8H15"/>',
  order: 50,
  nav: true,
  // Μικρός αριθμός πάνω στην καρτέλα: πόσα δωρεάν packs περιμένουν
  badge: () => freePacks().length,

  // Η κορυφή της Αρχικής: coins και τα packs που περιμένουν
  renderHomeHero(el) {
    const coins = getCoins();
    const free = freePacks().length;
    el.innerHTML = `
      <p class="hero-label">Coins</p>
      <p class="hero-number coins ${coins < 0 ? 'is-negative' : ''}">
        <span class="coin" aria-hidden="true"></span><strong data-count="${coins}" data-count-key="coins">${fmt(coins)}</strong></p>
      <p class="hero-hint ${free ? 'reward-hint' : ''}">${free
        ? `${free} free ${free === 1 ? 'pack is' : 'packs are'} waiting for you`
        : 'Classes, focus and daily goals earn coins.'}</p>
      <div class="hero-actions">
        <button class="btn" data-go="timer">Start focus</button>
        <button class="btn ${free ? 'btn-glow' : 'btn-quiet'}" data-go="wallet">${free ? `Open packs (${free})` : 'Store'}</button>
      </div>`;
  },

  // #/wallet -> κατάστημα, #/wallet/club -> συλλογή
  render(el, params = []) {
    if (params[0] === 'club') renderClub(el);
    else renderStore(el);
  },
});
