// ΑΠΕΝΕΡΓΟΠΟΙΗΜΕΝΟ: αυτό το module (coins, packs, κάρτες) δεν φορτώνεται από το
// index.html αυτή τη στιγμή. Για να ξαναμπεί: πρόσθεσε το import στο index.html
// και τα αρχεία (wallet.js, data/cards.js, data/icons.js) στο ASSETS του sw.js.
// Θέλει και renderHomeHero πίσω στην Αρχική, αν το θες ως κορυφή της.

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
  PACKS, SET_PACK, TEST_BONUS_COINS, DUPLICATE_COINS, FREE_PACKS, COINS_PER_XP, GOAL_BONUS, GOAL_FOCUS_MIN, FOCUS_XP_PER_MIN, CLASS_POINTS,
} from '../core/rules.js';
import {
  SETS, CARDS, RARITIES, RARITY_NAMES, rarityOf, statsOf, statNamesOf, roleOf, emblemOf, setById, setOf, cardById,
} from '../../data/cards.js';
import { getXp, goalDays } from './xp.js';
import { getSessions } from './timer.js';
import { weekStats } from './resume.js';
import { weekStart, addDays, dateKey, parseKey } from './calendar.js';

const store = moduleStore('packs');
const rank = (rarity) => RARITIES.indexOf(rarity);
const fmt = (n) => (n < 0 ? `−${Math.abs(n).toLocaleString('en-GB')}` : n.toLocaleString('en-GB'));

// Ορισμός ενός pack: στάνταρ ('bronze'...) ή ενός σετ ('set:barca15')
function packDef(type) {
  if (type.startsWith('set:')) {
    const s = setById(type.slice(4));
    return { name: s.name, short: s.short, price: SET_PACK.price, cards: SET_PACK.cards, odds: SET_PACK.odds, set: s.id, setDef: s };
  }
  return { ...PACKS[type], short: PACKS[type].name.replace(' Pack', '') };
}

// ===================== Coins =====================

const getOpened = () => store.get('opened', {});
const getCollection = () => store.get('collection', {});

export function getCoins() {
  const earned = getXp().total * COINS_PER_XP;
  const dup = Object.values(getOpened()).reduce((sum, o) => sum + (o.dupCoins || 0), 0);
  const spent = store.get('purchases', []).reduce((sum, p) => sum + p.price, 0);
  const penalties = getSessions().reduce((sum, s) => sum + (s.reason === 'stopped' ? s.penalty || 0 : 0), 0);
  return earned + dup - spent - penalties + TEST_BONUS_COINS;
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
  for (const s of SETS) {
    const p = collectionProgress(s.id);
    if (p.owned === p.total) out.push({ id: `set-${s.id}`, type: FREE_PACKS.setComplete, why: `Completed ${s.name}` });
  }
  return out;
}

// Τα δωρεάν packs που δεν έχεις ανοίξει ακόμα (τα πιο καλά πρώτα)
export function freePacks() {
  const opened = getOpened();
  const order = ['legend', 'gold', 'silver', 'bronze'];
  return earnedFree().filter((p) => !opened[p.id]).sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));
}

function collectionProgress(setId) {
  const col = getCollection();
  const cards = setId ? CARDS.filter((c) => c.set === setId) : CARDS;
  return { owned: cards.filter((c) => col[c.id]).length, total: cards.length };
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

// Κάρτα της σπανιότητας που ζητήθηκε (και του σετ, αν ορίζεται). Αν δεν υπάρχει
// τέτοια (π.χ. το Barcelona δεν έχει Bronze), παίρνουμε την κοντινότερη.
function randomCard(rarity, setId) {
  const all = setId ? CARDS.filter((c) => c.set === setId) : CARDS;
  for (let d = 0; d < RARITIES.length; d++) {
    for (const r of [RARITIES[rank(rarity) - d], RARITIES[rank(rarity) + d]]) {
      if (!r) continue;
      const pool = all.filter((c) => rarityOf(c.rating) === r);
      if (pool.length) return pool[Math.floor(Math.random() * pool.length)];
    }
  }
  return all[0];
}

// Ανοίγει ένα pack: διαλέγει κάρτες, ενημερώνει τη συλλογή, μετατρέπει τις διπλές σε coins
function openPack(packId, type) {
  const def = packDef(type);
  const rarities = Array.from({ length: def.cards }, () => rollRarity(def.odds));
  if (def.guarantee && !rarities.some((r) => rank(r) >= rank(def.guarantee))) rarities[0] = def.guarantee;

  const col = getCollection();
  let dupCoins = 0;
  const cards = rarities.map((r) => randomCard(r, def.set)).map((card) => {
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
  const def = packDef(type);
  if (getCoins() < def.price) return null;
  const id = `buy-${Date.now().toString(36)}`;
  store.update('purchases', (list) => [...list, { id, type, price: def.price, at: Date.now() }], []);
  return id;
}

// ===================== Εμφάνιση καρτών και packs =====================

// Η κάρτα σαν του FIFA. size: 'big' (αποκάλυψη) ή 'small' (συλλογή)
function cardHtml(card, { size = 'small', isNew = false, count = 0, locked = false } = {}) {
  const rarity = rarityOf(card.rating);
  const emblem = emblemOf(card);
  const emblemHtml = emblem.num !== undefined
    ? `<span class="fc-num">${emblem.num}</span>`
    : icon(emblem.paths);
  if (locked) {
    return `
      <div class="fcard ${size} r-${rarity} locked" aria-label="${RARITY_NAMES[rarity]} card, not collected yet">
        <div class="fc-emblem">${emblemHtml}</div>
        <div class="fc-name">?</div>
      </div>`;
  }
  const stats = statsOf(card);
  const role = roleOf(card);
  return `
    <div class="fcard ${size} r-${rarity}" aria-label="${escapeHtml(card.name)}, ${RARITY_NAMES[rarity]} ${card.rating}">
      <div class="fc-top"><span class="fc-rating">${card.rating}</span><span class="fc-role">${card.role}</span></div>
      <div class="fc-emblem">${emblemHtml}</div>
      <div class="fc-name">${escapeHtml(card.name)}</div>
      ${size === 'big' ? `<div class="fc-title">${escapeHtml(card.title)}</div>
      <div class="fc-stats">${statNamesOf(card).map((s) => `<span><b>${stats[s]}</b> ${s}</span>`).join('')}</div>` : ''}
      <div class="fc-origin">${escapeHtml(card.origin)}</div>
      ${isNew ? '<span class="fc-badge">NEW</span>' : ''}
      ${count > 1 ? `<span class="fc-count">×${count}</span>` : ''}
    </div>`;
}

function packHtml(type, size = '') {
  const def = packDef(type);
  const themed = def.setDef;
  return `
    <div class="pack ${themed ? 'pack-set' : `pack-${type}`} ${size}" aria-hidden="true"
         ${themed ? `style="--pa:${themed.colors[0]};--pb:${themed.colors[1]}"` : ''}>
      <span class="pack-shine"></span>
      ${themed ? `<span class="pack-icon">${icon(themed.icon)}</span>` : ''}
      <span class="pack-name">${escapeHtml(def.short)}</span>
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
  stage.setAttribute('aria-label', `Opening ${packDef(type).name}`);
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
    const beats = [best.origin.toUpperCase(), roleOf(best).name.toUpperCase(), String(best.rating)];
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
        <h2>${escapeHtml(packDef(type).name)}</h2>
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
  const def = packDef(type);
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
    <p class="muted small-print">Every XP is also a coin. Spend coins in the store. Standard packs have cards from every set;
      a themed pack only has cards from its own set. Free packs: a Bronze for every daily goal
      (all classes and ${GOAL_FOCUS_MIN} min focus), a Silver for every level (Gold every 5th), a Gold for every
      ${FREE_PACKS.streakEvery} classes in a row, a Silver for a week with 90% attendance or 5 days of focus,
      and a Legend pack for completing a whole set. Duplicates turn into coins.</p>
    <div class="stack"><button class="btn btn-quiet btn-block" data-close>Done</button></div>`,
  (root, close) => root.querySelector('[data-close]').addEventListener('click', close));
}

function storeItem(type) {
  const def = packDef(type);
  const can = getCoins() >= def.price;
  return `
    <button class="store-item" data-buy="${type}" ${can ? '' : 'aria-disabled="true"'}>
      ${packHtml(type)}
      <span class="price"><span class="coin small" aria-hidden="true"></span>${fmt(def.price)}</span>
      <span class="need">${can ? `${def.cards} cards` : `${fmt(def.price - getCoins())} more`}</span>
    </button>`;
}

function renderStore(el) {
  const coins = getCoins();
  const free = freePacks();

  el.innerHTML = `
    <section class="hero coins-hero">
      <p class="hero-label">Coins</p>
      <p class="hero-number coins ${coins < 0 ? 'is-negative' : ''}">
        <span class="coin" aria-hidden="true"></span><strong data-count="${coins}" data-count-key="coins">${fmt(coins)}</strong></p>
      ${TEST_BONUS_COINS ? `<p class="hero-hint">Test mode: includes ${fmt(TEST_BONUS_COINS)} bonus coins.</p>` : ''}
    </section>

    ${free.length ? `
      <h2 class="section-title">Your free packs</h2>
      <div class="pack-row">${free.map((p) => `
        <button class="pack-tile" data-free="${p.id}" data-type="${p.type}" aria-label="Open ${packDef(p.type).name}: ${escapeHtml(p.why)}">
          ${packHtml(p.type)}
          <span class="pack-why">${escapeHtml(p.why)}</span>
        </button>`).join('')}
      </div>` : ''}

    <h2 class="section-title">Store</h2>
    <div class="store">${['bronze', 'silver', 'gold'].map(storeItem).join('')}</div>

    ${SETS.length > 1 ? `
      <h2 class="section-title">Themed packs</h2>
      <div class="store two">${SETS.map((s) => storeItem(`set:${s.id}`)).join('')}</div>` : ''}

    <h2 class="section-title">Collection</h2>
    <ul class="list">${SETS.map((s) => {
      const p = collectionProgress(s.id);
      return `
      <li><button class="row" data-club="${s.id}">
        <span class="set-dot" style="--pa:${s.colors[0]};--pb:${s.colors[1]}">${icon(s.icon)}</span>
        <span class="row-text">
          <span class="row-title">${escapeHtml(s.name)}</span>
          <span class="row-sub">${p.owned} of ${p.total} cards</span>
        </span>
        <span class="mini-progress"><span style="width:${Math.round((p.owned / p.total) * 100)}%"></span></span>
        <span class="row-chevron" aria-hidden="true">›</span>
      </button></li>`;
    }).join('')}</ul>
    <button class="link-btn" data-rules>How packs work</button>`;

  el.onclick = (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    const d = b.dataset;
    if (d.free) openScene(d.free, d.type, refresh);
    else if (d.buy) {
      const def = packDef(d.buy);
      if (getCoins() < def.price) { toast(`You need ${fmt(def.price - getCoins())} more coins`); return; }
      const id = buyPack(d.buy);
      if (id) openScene(id, d.buy, refresh);
    } else if (d.club) navigate(`wallet/club/${d.club}`);
    else if ('rules' in d) rulesSheet();
  };
}

let clubFilter = 'all';
let clubSet = SETS[0].id;

function renderClub(el, setId) {
  if (setId && setById(setId)) clubSet = setId;
  const set = setById(clubSet);
  const col = getCollection();
  const prog = collectionProgress(set.id);
  const shown = CARDS
    .filter((c) => c.set === set.id && (clubFilter === 'all' || rarityOf(c.rating) === clubFilter))
    .sort((a, b) => b.rating - a.rating);

  el.innerHTML = `
    <a class="back-link" href="#/wallet">‹ Packs</a>
    ${SETS.length > 1 ? `<div class="chips set-chips">
      ${SETS.map((s) => `<button class="chip ${s.id === set.id ? 'selected' : ''}" data-set="${s.id}">${escapeHtml(s.short)}</button>`).join('')}
    </div>` : ''}
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
    </div>
    ${shown.length ? '' : '<p class="muted empty-day">No cards of this rarity in this set.</p>'}`;

  el.onclick = (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.dataset.set) { clubSet = b.dataset.set; renderClub(el); return; }
    if (b.dataset.filter) { clubFilter = b.dataset.filter; renderClub(el); return; }
    if (b.dataset.card) {
      const card = cardById(b.dataset.card);
      openSheet(`
        <div class="sheet-card">${cardHtml(card, { size: 'big', count: col[card.id] })}</div>
        <p class="muted centered">${RARITY_NAMES[rarityOf(card.rating)]}, ${escapeHtml(roleOf(card).name)}. You have ${col[card.id]}.</p>
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

  // #/wallet -> κατάστημα, #/wallet/club/<σετ> -> συλλογή
  render(el, params = []) {
    if (params[0] === 'club') renderClub(el, params[1]);
    else renderStore(el);
  },
});
