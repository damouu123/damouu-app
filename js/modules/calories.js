// Calories: καταγραφή θερμίδων, μακροθρεπτικών και νερού (ενότητα Calories).
// Διάταξη εμπνευσμένη από το "Nutrition tracking" (Eddie Luong, ILABS):
// εβδομάδα πάνω, κύκλος "KCAL LEFT" με Eaten / Burned, μακρο, λίστα "Daily", κουμπί +.
//
// ΠΗΓΗ ΤΙΜΩΝ: USDA FoodData Central, η πιο έγκυρη δημόσια βάση τροφίμων.
//   data/foods-gr.js  144 συνηθισμένα τρόφιμα και ελληνικά φαγητά, με ελληνικά ονόματα
//   data/foods.js     όλη η βάση (7.391 τρόφιμα, στα αγγλικά), για ό,τι δεν υπάρχει στα ελληνικά
// Όλες οι τιμές είναι ανά 100 g και υπολογίζονται για τα γραμμάρια που τρως
// (π.χ. ωμό κοτόπουλο στήθος 200 g = 2 × 112 kcal = 224 kcal).
//
// BURNED: θερμίδες από τις προπονήσεις του Fitness εκείνη τη μέρα. Εκτίμηση με
// MET 5 (προπόνηση με βάρη): kcal = 5 × 3,5 × κιλά σώματος / 200 ανά λεπτό
// (κιλά από τα Measures του Fitness, αλλιώς 75). Το KCAL LEFT = στόχος − eaten + burned.
//
// Δεδομένα (moduleStore('calories')):
//   days   { "2026-10-19": { water: 500, meals: { breakfast: [entry], lunch, dinner, snacks } } }
//          entry = { id, name, emoji, grams, kcal, p, c, f }  (για ΤΑ ΓΡΑΜΜΑΡΙΑ που έφαγες)
//   goals  { kcal, p, c, f, water }

import { register } from '../core/registry.js';
import { moduleStore } from '../core/storage.js';
import { escapeHtml, icon, toast, openSheet } from '../core/router.js';
import { haptic } from '../core/feedback.js';
import { GREEK_FOODS, GREEK_CATEGORIES } from '../../data/foods-gr.js';

const store = moduleStore('calories');
const workoutStore = moduleStore('workout'); // για τα "Burned" και το βάρος σου

const DEFAULT_GOALS = { kcal: 2000, p: 150, c: 200, f: 65, water: 2000 };
const GLASS_ML = 250;
const MET_WEIGHTS = 5;
const MEALS = [
  { id: 'breakfast', title: 'Breakfast', share: 0.25, emoji: '🍳', color: '#E0882B' },
  { id: 'lunch', title: 'Lunch', share: 0.35, emoji: '🥗', color: '#D9405A' },
  { id: 'dinner', title: 'Dinner', share: 0.3, emoji: '🍲', color: '#1F7FD6' },
  { id: 'snacks', title: 'Snacks', share: 0.1, emoji: '🍎', color: '#17955A' },
];
const MACROS = [
  { id: 'c', label: 'Carb', color: '#17955A' },
  { id: 'p', label: 'Protein', color: '#8B5CF6' },
  { id: 'f', label: 'Fat', color: '#1F7FD6' },
];

const ICONS = {
  flame: '<path d="M12 21c-3.9 0-6.5-2.7-6.5-6.3 0-3.4 2.4-5.4 3.6-8.2.6 1.6 1.4 2.6 2.6 3.3.2-2.6 1.3-5 3-6.8.3 3.2 4.3 5.9 4.3 11 0 4-2.9 7-7 7z"/>',
  bolt: '<path d="M13 2.5 5 13.5h6l-1 8 8-11h-6z"/>',
  fork: '<path d="M7 3v7a2 2 0 0 0 2 2v9M11 3v7a2 2 0 0 1-2 2M9 3v6M17 3c-1.7 1-3 3.2-3 6v4h3v8"/>',
  glass: '<path d="M6 3.5h12l-1.6 16a1.5 1.5 0 0 1-1.5 1.4H9.1a1.5 1.5 0 0 1-1.5-1.4zM6.6 9h10.8"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  chart: '<path d="M4 20V4M4 20h16M7.5 15l4-4.5 3 3L20 8"/>',
  user: '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20c1.2-3.6 4-5.3 7.5-5.3s6.3 1.7 7.5 5.3"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.4-4.4"/>',
};

// ===================== Δεδομένα =====================

const DAY = 86400000;
const dateKey = (d) => new Date(d).toLocaleDateString('sv'); // "2026-10-19"
const atNoon = (key) => new Date(`${key}T12:00:00`); // ασφαλές για αλλαγές ώρας
const getGoals = () => ({ ...DEFAULT_GOALS, ...store.get('goals', {}) });
const r1 = (v) => Math.round(v * 10) / 10;
const uid = () => Math.random().toString(36).slice(2, 10);

function getDay(key) {
  const d = store.get('days', {})[key] || {};
  return { water: d.water || 0, meals: { breakfast: [], lunch: [], dinner: [], snacks: [], ...(d.meals || {}) } };
}
function saveDay(key, day) {
  store.update('days', (all) => ({ ...all, [key]: day }), {});
}
function totals(day) {
  const t = { kcal: 0, p: 0, c: 0, f: 0 };
  for (const list of Object.values(day.meals)) for (const e of list) { t.kcal += e.kcal; t.p += e.p; t.c += e.c; t.f += e.f; }
  return t;
}

// Θερμίδες από τις προπονήσεις μιας μέρας (εκτίμηση, δες πάνω)
function burnedOn(key) {
  const measures = workoutStore.get('measures', []);
  const weight = measures.length ? measures.slice().sort((a, b) => a.date.localeCompare(b.date)).at(-1).weight : 75;
  const minutes = workoutStore.get('history', [])
    .filter((w) => dateKey(w.startedAt) === key)
    .reduce((m, w) => m + (w.endedAt - w.startedAt) / 60000, 0);
  return Math.round(minutes * (MET_WEIGHTS * 3.5 * weight) / 200);
}

// Ένα τρόφιμο, είτε από τον ελληνικό κατάλογο είτε από όλη τη βάση (αγγλικά)
const fromGreek = (r) => ({ name: r[0], kcal: r[1], p: r[2], c: r[3], f: r[4], emoji: r[5], source: r[7], portion: r[8] ? { label: r[8], grams: r[9] } : null });
const fromUsda = (r) => ({ name: r[0], kcal: r[1], p: r[2], c: r[3], f: r[4], emoji: '🍽️', source: r[6] === 'F' ? 'USDA Foundation' : 'USDA SR Legacy', portion: r[7] ? { label: r[7], grams: r[8] } : null });

// Όλη η βάση (μεγάλη): φορτώνεται μόνο αν τη ζητήσεις
let foodsPromise = null;
const loadAllFoods = () => (foodsPromise ||= import('../../data/foods.js'));

// Αναζήτηση χωρίς τόνους: "κοτοπουλο" βρίσκει "Κοτόπουλο"
const plain = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/ς/g, 'σ');

function searchGreek(query, category) {
  const words = plain(query).split(/[\s,]+/).filter(Boolean);
  return GREEK_FOODS
    .filter((r) => (!category || r[6] === category) && words.every((w) => plain(r[0]).includes(w)))
    .sort((a, b) => (words.length ? (plain(a[0]).startsWith(words[0]) ? -1 : 0) - (plain(b[0]).startsWith(words[0]) ? -1 : 0) : 0) || a[0].localeCompare(b[0], 'el'))
    .map(fromGreek);
}

// Στην αγγλική βάση: πρώτα τα απλά, βασικά τρόφιμα, οι μάρκες στο τέλος
function searchUsda(FOODS, query) {
  const words = query.toLowerCase().split(/[\s,]+/).filter(Boolean);
  if (!words.length) return [];
  const hits = [];
  for (const row of FOODS) {
    const name = row[0].toLowerCase();
    if (!words.every((w) => name.includes(w))) continue;
    let score = name.length;
    if (name.startsWith(words[0])) score -= 40;
    if (/\b(raw|fresh)\b/.test(name)) score -= 8;
    if (/meat and skin/.test(name) && !words.includes('skin')) score += 15;
    if (/[A-Z]{3,}/.test(row[0])) score += 60;
    if (row[6] === 'F') score -= 5;
    hits.push([score, row]);
  }
  return hits.sort((a, b) => a[0] - b[0]).slice(0, 40).map((h) => fromUsda(h[1]));
}

const forGrams = (food, grams) => ({
  kcal: Math.round((food.kcal * grams) / 100),
  p: r1((food.p * grams) / 100),
  c: r1((food.c * grams) / 100),
  f: r1((food.f * grams) / 100),
});

// ===================== Αρχική =====================

let viewDay = null; // η μέρα που βλέπεις ("2026-10-19")

const RING_R = 70;
const RING_C = 2 * Math.PI * RING_R;

// Η Δευτέρα της εβδομάδας μιας μέρας ("2026-10-19")
function weekOf(key) {
  const d = atNoon(key);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return dateKey(d);
}

function weekStrip() {
  const monday = atNoon(weekOf(viewDay));
  const today = dateKey(Date.now());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const k = dateKey(d);
    const future = k > today;
    return `
      <button class="cl-wd ${k === viewDay ? 'sel' : ''} ${k === today ? 'today' : ''}" data-pick-day="${k}" ${future ? 'disabled' : ''}
              aria-label="${d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}">
        <span>${d.toLocaleDateString('en-GB', { weekday: 'narrow' })}</span><strong>${d.getDate()}</strong>
      </button>`;
  }).join('');
}

function renderHome(el) {
  if (!viewDay) viewDay = dateKey(Date.now());
  const goals = getGoals();
  const day = getDay(viewDay);
  const t = totals(day);
  const burned = burnedOn(viewDay);
  const left = Math.round(goals.kcal - t.kcal + burned);
  const used = Math.min(1, Math.max(0, t.kcal / (goals.kcal + burned || 1)));
  const waterLeft = Math.max(0, goals.water - day.water);
  const pct = (v, g) => Math.min(100, g ? (v / g) * 100 : 0);

  el.innerHTML = `
    <section class="cl-hero">
      <div class="cl-week">
        <button class="cl-wk-nav" data-week="-1" aria-label="Previous week">‹</button>
        <div class="cl-days">${weekStrip()}</div>
        <button class="cl-wk-nav" data-week="1" aria-label="Next week" ${weekOf(viewDay) === weekOf(dateKey(Date.now())) ? 'disabled' : ''}>›</button>
      </div>

      <div class="cl-ring-row">
        <div class="cl-side"><span class="cl-side-icon">${icon(ICONS.fork)}</span><strong>${Math.round(t.kcal)}</strong><span>Eaten</span></div>
        <div class="cl-ring">
          <svg viewBox="0 0 160 160" aria-hidden="true">
            <circle class="cl-ring-track" cx="80" cy="80" r="${RING_R}"/>
            <circle class="cl-ring-bar ${left < 0 ? 'over' : ''}" cx="80" cy="80" r="${RING_R}"
                    stroke-dasharray="${RING_C}" style="--off:${RING_C * (1 - used)}"/>
          </svg>
          <div class="cl-ring-mid">
            <span class="cl-ring-icon">${icon(ICONS.bolt)}</span>
            <strong>${Math.abs(left)}</strong>
            <span>${left < 0 ? 'KCAL OVER' : 'KCAL LEFT'}</span>
          </div>
        </div>
        <div class="cl-side"><span class="cl-side-icon burn">${icon(ICONS.flame)}</span><strong>${burned}</strong><span>Burned</span></div>
      </div>

      <div class="cl-macros">${MACROS.map((m) => {
        const leftG = Math.round(goals[m.id] - t[m.id]);
        return `
        <div class="cl-macro" style="--mc:${m.color}">
          <span class="cl-macro-bar"><i style="width:${pct(t[m.id], goals[m.id])}%"></i></span>
          <span class="cl-macro-label">${m.label}</span>
          <strong>${leftG >= 0 ? `${leftG}g left` : `${-leftG}g over`}</strong>
        </div>`;
      }).join('')}</div>
      <button class="cl-goals-btn" data-goals>Goals: ${goals.kcal} kcal</button>
    </section>

    <h2 class="section-title">Daily</h2>
    <ul class="cl-daily">${MEALS.map((m) => {
      const list = day.meals[m.id];
      const kcal = Math.round(list.reduce((s, e) => s + e.kcal, 0));
      const target = Math.round((goals.kcal * m.share) / 10) * 10;
      const emoji = list.length ? (list[0].emoji || '🍽️') : m.emoji;
      return `
      <li><button class="cl-meal-card" data-meal="${m.id}" style="--meal:${m.color}">
        <span class="cl-meal-text">
          <span class="cl-meal-name">${m.title}</span>
          <span class="cl-meal-foods muted">${list.length ? escapeHtml(list.map((e) => e.name.split(',')[0]).join(', ')) : 'Tap to add food'}</span>
          <span class="cl-meal-kcal"><strong>${kcal}</strong> / ${target} KCAL</span>
        </span>
        <span class="cl-meal-pic ${list.length ? '' : 'empty'}" aria-hidden="true">${emoji}</span>
      </button></li>`;
    }).join('')}</ul>

    <section class="cl-card cl-water">
      <div class="cl-water-row">
        <span class="cl-glass">${icon(ICONS.glass)}<i style="height:${pct(day.water, goals.water)}%"></i></span>
        <span class="cl-water-text">
          <strong>${day.water}<span>/${goals.water} ml</span></strong>
          <span class="muted">${waterLeft ? `${waterLeft} ml of water left today` : 'Water goal reached. Well done!'}</span>
        </span>
        <span class="cl-stepper">
          <button class="cl-round" data-water="-1" aria-label="Remove a glass" ${day.water ? '' : 'disabled'}>${icon(ICONS.minus)}</button>
          <button class="cl-round filled" data-water="1" aria-label="Add a glass of water">${icon(ICONS.plus)}</button>
        </span>
      </div>
    </section>
    <p class="muted small-print cl-source">Values from USDA FoodData Central, per 100 g.${burned ? ' Burned is an estimate from your workouts.' : ''}</p>

    <button class="cl-fab" data-fab aria-label="Add food">${icon(ICONS.plus)}</button>`;

  el.onclick = (ev) => {
    const b = ev.target.closest('button');
    if (!b || b.disabled) return;
    if (b.dataset.pickDay) { viewDay = b.dataset.pickDay; haptic(); renderHome(el); }
    else if (b.dataset.week) {
      const next = dateKey(atNoon(viewDay).getTime() + Number(b.dataset.week) * 7 * DAY);
      viewDay = next > dateKey(Date.now()) ? dateKey(Date.now()) : next;
      renderHome(el);
    } else if (b.dataset.water) {
      const d = getDay(viewDay);
      d.water = Math.max(0, d.water + Number(b.dataset.water) * GLASS_ML);
      saveDay(viewDay, d);
      haptic();
      if (d.water === getGoals().water && Number(b.dataset.water) > 0) toast('Water goal reached');
      renderHome(el);
    } else if (b.dataset.meal) mealSheet(b.dataset.meal, () => renderHome(el));
    else if ('fab' in b.dataset) chooseMeal(() => renderHome(el));
    else if ('goals' in b.dataset) goalsSheet(() => renderHome(el));
  };
}

// Το "+": σε ποιο γεύμα; (προτείνει αυτό που ταιριάζει στην ώρα)
function chooseMeal(after) {
  const h = new Date().getHours();
  const guess = h < 11 ? 'breakfast' : h < 16 ? 'lunch' : h < 21 ? 'dinner' : 'snacks';
  openSheet(`
    <h2>Add food to</h2>
    <div class="cl-meal-pick">${MEALS.map((m) => `
      <button class="cl-meal-opt ${m.id === guess ? 'sel' : ''}" data-m="${m.id}"><span>${m.emoji}</span>${m.title}</button>`).join('')}
    </div>`,
  (root, close) => root.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-m]');
    if (!b) return;
    close();
    setTimeout(() => addFood(b.dataset.m, after), 250);
  }));
}

// ===================== Προσθήκη φαγητού =====================

function foodRow(f, i) {
  return `
    <li><button class="row cl-result" data-pick="${i}">
      <span class="cl-result-emoji" aria-hidden="true">${f.emoji}</span>
      <span class="row-text"><span class="row-title">${escapeHtml(f.name)}</span>
        <span class="row-sub">${f.kcal} kcal · P ${f.p} · C ${f.c} · F ${f.f} / 100 g</span></span>
    </button></li>`;
}

function addFood(mealId, after) {
  const meal = MEALS.find((m) => m.id === mealId);
  let category = null;
  let english = false; // ψάχνει σε όλη τη βάση (αγγλικά)
  let rows = [];
  openSheet(`
    <h2>Add to ${meal.title}</h2>
    <label class="cl-search">${icon(ICONS.search)}<input type="search" placeholder="Αναζήτηση, π.χ. κοτόπουλο" autocomplete="off" aria-label="Search food"></label>
    <div class="chips cl-cats">
      <button class="chip selected" data-cat="">Όλα</button>
      ${GREEK_CATEGORIES.map((c) => `<button class="chip" data-cat="${escapeHtml(c)}">${escapeHtml(c)}</button>`).join('')}
    </div>
    <ul class="list cl-results"></ul>
    <button class="link-btn centered cl-more" data-english></button>`,
  (root, close) => {
    root.classList.add('cl-sheet');
    const input = root.querySelector('input');
    const results = root.querySelector('.cl-results');
    const more = root.querySelector('[data-english]');
    const paint = async () => {
      const q = input.value.trim();
      if (english) {
        results.innerHTML = '<li class="wk-none muted">Loading all USDA foods…</li>';
        const { FOODS } = await loadAllFoods();
        rows = searchUsda(FOODS, q);
        results.innerHTML = rows.length ? rows.map(foodRow).join('')
          : `<li class="wk-none muted">${q ? 'No foods found. Search in English, e.g. "salmon raw".' : 'Type in English, e.g. "salmon raw".'}</li>`;
        more.textContent = 'Back to the Greek list';
        input.placeholder = 'Search in English, e.g. salmon raw';
        return;
      }
      rows = searchGreek(q, category);
      results.innerHTML = rows.length ? rows.map(foodRow).join('')
        : '<li class="wk-none muted">Δεν βρέθηκε. Δοκίμασε άλλη λέξη ή ψάξε σε όλη τη βάση (αγγλικά).</li>';
      more.textContent = 'Not here? Search all 7,391 USDA foods (English)';
      input.placeholder = 'Αναζήτηση, π.χ. κοτόπουλο';
    };
    paint();
    input.addEventListener('input', paint);
    root.addEventListener('click', (ev) => {
      const b = ev.target.closest('button');
      if (!b) return;
      if (b.dataset.cat !== undefined) {
        category = b.dataset.cat || null;
        root.querySelectorAll('[data-cat]').forEach((c) => c.classList.toggle('selected', c === b));
        paint();
      } else if ('english' in b.dataset) {
        english = !english;
        root.querySelector('.cl-cats').hidden = english;
        input.value = '';
        paint();
        input.focus();
      } else if (b.dataset.pick) {
        const food = rows[Number(b.dataset.pick)];
        close();
        setTimeout(() => gramsSheet(food, meal, after), 250);
      }
    });
  });
}

function gramsSheet(food, meal, after) {
  const start = food.portion ? food.portion.grams : 100;
  openSheet(`
    <div class="cl-food-head"><span class="cl-food-emoji">${food.emoji}</span><h2>${escapeHtml(food.name)}</h2></div>
    <div class="cl-grams">
      <label class="cl-grams-field"><input type="text" inputmode="decimal" value="${start}" aria-label="Grams"><span>g</span></label>
      <div class="chips">
        ${food.portion ? `<button class="chip" data-g="${food.portion.grams}">${escapeHtml(food.portion.label)} (${food.portion.grams} g)</button>` : ''}
        ${[50, 100, 150, 200].map((g) => `<button class="chip" data-g="${g}">${g} g</button>`).join('')}
      </div>
    </div>
    <div class="cl-preview"></div>
    <p class="muted small-print">Source: ${escapeHtml(food.source)} (USDA FoodData Central).</p>
    <div class="stack"><button class="btn btn-block" data-save>Add to ${meal.title}</button></div>`,
  (root, close) => {
    const input = root.querySelector('input');
    const preview = root.querySelector('.cl-preview');
    const grams = () => Math.max(0, parseFloat(String(input.value).replace(',', '.')) || 0);
    const paint = () => {
      const v = forGrams(food, grams());
      preview.innerHTML = `
        <div><strong>${v.kcal}</strong><span>kcal</span></div>
        <div><strong>${v.p}g</strong><span>Protein</span></div>
        <div><strong>${v.c}g</strong><span>Carbs</span></div>
        <div><strong>${v.f}g</strong><span>Fat</span></div>`;
    };
    paint();
    input.addEventListener('input', paint);
    input.addEventListener('focus', () => input.select());
    root.addEventListener('click', (ev) => {
      const b = ev.target.closest('button');
      if (!b) return;
      if (b.dataset.g) { input.value = b.dataset.g; paint(); return; }
      if ('save' in b.dataset) {
        const g = grams();
        if (!g) { toast('Enter the grams'); return; }
        const d = getDay(viewDay);
        const v = forGrams(food, g);
        d.meals[meal.id].push({ id: uid(), name: food.name, emoji: food.emoji, grams: g, ...v });
        saveDay(viewDay, d);
        haptic();
        toast(`+${v.kcal} kcal to ${meal.title}`);
        close();
        after();
      }
    });
  });
}

// Τα φαγητά ενός γεύματος, με διαγραφή
function mealSheet(mealId, after) {
  const meal = MEALS.find((m) => m.id === mealId);
  const list = getDay(viewDay).meals[mealId];
  const t = list.reduce((s, e) => ({ kcal: s.kcal + e.kcal, p: s.p + e.p, c: s.c + e.c, f: s.f + e.f }), { kcal: 0, p: 0, c: 0, f: 0 });
  openSheet(`
    <h2>${meal.emoji} ${meal.title}</h2>
    <p class="muted">${Math.round(t.kcal)} kcal · P ${r1(t.p)}g · C ${r1(t.c)}g · F ${r1(t.f)}g</p>
    <ul class="list rules-list">${list.map((e) => `
      <li><div class="row row-static">
        <span class="cl-result-emoji" aria-hidden="true">${e.emoji || '🍽️'}</span>
        <span class="row-text"><span class="row-title">${escapeHtml(e.name)}</span>
          <span class="row-sub">${e.grams} g · ${e.kcal} kcal · P ${e.p} · C ${e.c} · F ${e.f}</span></span>
        <button class="wk-icon-btn" data-del="${e.id}" aria-label="Remove">×</button>
      </div></li>`).join('') || '<li class="wk-none muted">Nothing logged yet.</li>'}
    </ul>
    <div class="stack"><button class="btn btn-block" data-add>Add food</button></div>`,
  (root, close) => root.addEventListener('click', (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.dataset.del) {
      const d = getDay(viewDay);
      d.meals[mealId] = d.meals[mealId].filter((e) => e.id !== b.dataset.del);
      saveDay(viewDay, d);
      close();
      after();
      setTimeout(() => mealSheet(mealId, after), 250);
    } else if ('add' in b.dataset) {
      close();
      setTimeout(() => addFood(mealId, after), 250);
    }
  }));
}

function goalsSheet(after) {
  const g = getGoals();
  const field = (k, label, unit) => `
    <label class="field"><span>${label} (${unit})</span><input name="${k}" inputmode="numeric" value="${g[k]}"></label>`;
  openSheet(`
    <h2>Daily goals</h2>
    <form class="form cl-goals">
      ${field('kcal', 'Calories', 'kcal')}
      <div class="field-row">${field('p', 'Protein', 'g')}${field('c', 'Carbs', 'g')}</div>
      <div class="field-row">${field('f', 'Fat', 'g')}${field('water', 'Water', 'ml')}</div>
      <p class="muted small-print cl-goal-check"></p>
      <button class="btn btn-block" type="submit">Save goals</button>
    </form>`,
  (root, close) => {
    const form = root.querySelector('form');
    // Έλεγχος: οι θερμίδες των μακρο (4/4/9 kcal ανά g) κοντά στον στόχο;
    const check = () => {
      const v = Object.fromEntries(new FormData(form));
      const fromMacros = Math.round(4 * (+v.p || 0) + 4 * (+v.c || 0) + 9 * (+v.f || 0));
      root.querySelector('.cl-goal-check').textContent = `Your macros add up to ${fromMacros} kcal.`;
    };
    check();
    form.addEventListener('input', check);
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const v = Object.fromEntries(new FormData(form));
      const goals = {};
      for (const k of Object.keys(DEFAULT_GOALS)) {
        const n = Math.round(parseFloat(v[k]));
        if (!(n > 0)) { toast('Fill in every goal'); return; }
        goals[k] = n;
      }
      store.set('goals', goals);
      toast('Goals saved');
      close();
      after();
    });
  });
}

// ===================== Κενές καρτέλες (θα γεμίσουν αργότερα) =====================

const emptyTab = (ic) => (el) => {
  el.innerHTML = `
    <div class="section-empty">
      <span class="section-empty-icon">${icon(ic)}</span>
      <p class="muted">Nothing here yet.</p>
    </div>`;
};

// ===================== Καταχώρηση =====================

register({
  id: 'calories',
  title: 'Calories',
  icon: ICONS.flame,
  order: 90,
  section: 'calories',
  sectionHome: true,
  home: false,
  render: renderHome,
  unmount() { viewDay = null; },
});

register({
  id: 'cal-stats',
  title: 'Statistics',
  icon: ICONS.chart,
  order: 91,
  section: 'calories',
  nav: true,
  home: false,
  render: emptyTab(ICONS.chart),
});

register({
  id: 'cal-profile',
  title: 'Profile',
  icon: ICONS.user,
  order: 92,
  section: 'calories',
  nav: true,
  home: false,
  render: emptyTab(ICONS.user),
});
