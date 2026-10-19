// Calories: καταγραφή θερμίδων, μακροθρεπτικών και νερού (ενότητα Calories).
//
// ΠΗΓΗ ΤΙΜΩΝ: USDA FoodData Central (data/foods.js), η πιο έγκυρη δημόσια βάση
// τροφίμων. Όλες οι τιμές είναι ανά 100 g και υπολογίζονται για τα γραμμάρια
// που τρως (π.χ. ωμό κοτόπουλο στήθος 200 g = 2 × 120 kcal = 240 kcal).
// Η βάση φορτώνεται μόνο όταν ανοίξεις την αναζήτηση (είναι μεγάλη).
//
// ΣΕΛΙΔΕΣ
//   Calories (αρχική)  πρόοδος της μέρας, νερό, γεύματα (#/calories)
//   Statistics, Profile  άδειες προς το παρόν
//
// Δεδομένα (moduleStore('calories')):
//   days   { "2026-10-19": { water: 500, meals: { breakfast: [entry], lunch, dinner, snacks } } }
//          entry = { id, name, grams, kcal, p, c, f }  (οι τιμές για ΤΑ ΓΡΑΜΜΑΡΙΑ που έφαγες)
//   goals  { kcal, p, c, f, water }

import { register } from '../core/registry.js';
import { moduleStore } from '../core/storage.js';
import { escapeHtml, icon, toast, openSheet } from '../core/router.js';
import { haptic } from '../core/feedback.js';

const store = moduleStore('calories');

const DEFAULT_GOALS = { kcal: 2000, p: 150, c: 200, f: 65, water: 2000 };
const GLASS_ML = 250;
const MEALS = [
  { id: 'breakfast', title: 'Breakfast', share: 0.25 },
  { id: 'lunch', title: 'Lunch', share: 0.35 },
  { id: 'dinner', title: 'Dinner', share: 0.3 },
  { id: 'snacks', title: 'Snacks', share: 0.1 },
];
const MACROS = [
  { id: 'c', label: 'Carbs', color: '#17955A' },
  { id: 'p', label: 'Proteins', color: '#E0882B' },
  { id: 'f', label: 'Fats', color: '#D9405A' },
];

const ICONS = {
  flame: '<path d="M12 21c-3.9 0-6.5-2.7-6.5-6.3 0-3.4 2.4-5.4 3.6-8.2.6 1.6 1.4 2.6 2.6 3.3.2-2.6 1.3-5 3-6.8.3 3.2 4.3 5.9 4.3 11 0 4-2.9 7-7 7z"/>',
  glass: '<path d="M6 3.5h12l-1.6 16a1.5 1.5 0 0 1-1.5 1.4H9.1a1.5 1.5 0 0 1-1.5-1.4zM6.6 9h10.8"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  chart: '<path d="M4 20V4M4 20h16M7.5 15l4-4.5 3 3L20 8"/>',
  user: '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20c1.2-3.6 4-5.3 7.5-5.3s6.3 1.7 7.5 5.3"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.4-4.4"/>',
  pie: '<path d="M12 3.5v8.5h8.5A8.5 8.5 0 1 1 12 3.5z"/><path d="M15 3.8a8.5 8.5 0 0 1 5.2 5.2H15z"/>',
};

// ===================== Δεδομένα =====================

const DAY = 86400000;
const dateKey = (d) => new Date(d).toLocaleDateString('sv'); // "2026-10-19"
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

// Η βάση τροφίμων (φορτώνεται την πρώτη φορά που τη χρειαστείς)
let foodsPromise = null;
const loadFoods = () => (foodsPromise ||= import('../../data/foods.js'));

// Αναζήτηση: όλες οι λέξεις πρέπει να υπάρχουν. Πρώτα τα απλά, βασικά τρόφιμα
// (σύντομο όνομα, χωρίς μάρκα), μετά τα υπόλοιπα.
function searchFoods(FOODS, query) {
  const words = query.toLowerCase().split(/[\s,]+/).filter(Boolean);
  if (!words.length) return [];
  const hits = [];
  for (const row of FOODS) {
    const name = row[0].toLowerCase();
    if (!words.every((w) => name.includes(w))) continue;
    let score = name.length;
    if (name.startsWith(words[0])) score -= 40;
    if (/\b(raw|fresh)\b/.test(name)) score -= 8;
    if (/meat and skin/.test(name) && !words.includes('skin')) score += 15; // πρώτα χωρίς πέτσα
    if (/[A-Z]{3,}/.test(row[0])) score += 60; // μάρκες (CHOBANI, KRAFT...) στο τέλος
    if (row[6] === 'F') score -= 5;           // Foundation: πιο πρόσφατες μετρήσεις
    hits.push([score, row]);
  }
  return hits.sort((a, b) => a[0] - b[0]).slice(0, 40).map((h) => h[1]);
}

// Τιμές για συγκεκριμένα γραμμάρια
const forGrams = (row, grams) => ({
  kcal: Math.round((row[1] * grams) / 100),
  p: r1((row[2] * grams) / 100),
  c: r1((row[3] * grams) / 100),
  f: r1((row[4] * grams) / 100),
});

// Πιο ευανάγνωστο όνομα: "Chicken, broiler..., breast, ..., raw" -> το πρώτο κομμάτι με έντονα
function foodName(name) {
  const [head, ...rest] = name.split(', ');
  return `<strong>${escapeHtml(head)}</strong>${rest.length ? `<span class="muted">, ${escapeHtml(rest.join(', '))}</span>` : ''}`;
}

// ===================== Αρχική =====================

let viewDay = null; // η μέρα που βλέπεις

function dayTitle(key) {
  const today = dateKey(Date.now());
  if (key === today) return 'Today';
  if (key === dateKey(Date.now() - DAY)) return 'Yesterday';
  return new Date(key).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

const avatar = (name) => `<span class="cl-food-dot">${escapeHtml(name.replace(/[^A-Za-z]/g, '')[0] || '?')}</span>`;

function renderHome(el) {
  if (!viewDay) viewDay = dateKey(Date.now());
  const goals = getGoals();
  const day = getDay(viewDay);
  const t = totals(day);
  const pct = (v, g) => Math.min(100, g ? (v / g) * 100 : 0);
  const over = t.kcal > goals.kcal;
  const waterLeft = Math.max(0, goals.water - day.water);

  el.innerHTML = `
    <section class="cl-progress">
      <div class="cl-progress-head">
        <span class="cl-progress-title"><span class="cl-badge">${icon(ICONS.pie)}</span> Your Progress</span>
        <span class="cl-day">
          <button class="cl-day-btn" data-day="-1" aria-label="Previous day">‹</button>
          <button class="cl-day-label" data-day="0">${icon(ICONS.calendar)} ${dayTitle(viewDay)}</button>
          <button class="cl-day-btn" data-day="1" aria-label="Next day" ${viewDay === dateKey(Date.now()) ? 'disabled' : ''}>›</button>
        </span>
      </div>
      <p class="cl-kcal"><strong>${Math.round(t.kcal)}</strong><span>/${goals.kcal} Kcal</span></p>
      <span class="cl-bar ${over ? 'over' : ''}"><i style="width:${pct(t.kcal, goals.kcal)}%"></i></span>
      <p class="cl-left">${over ? `${Math.round(t.kcal - goals.kcal)} kcal over your goal` : `${Math.round(goals.kcal - t.kcal)} kcal left`}</p>
      <div class="cl-macros">${MACROS.map((m) => `
        <div class="cl-macro" style="--mc:${m.color}">
          <span class="cl-macro-label">${m.label}</span>
          <span class="cl-bar small"><i style="width:${pct(t[m.id], goals[m.id])}%"></i></span>
          <span class="cl-macro-val">${Math.round(t[m.id])}/${goals[m.id]}g</span>
        </div>`).join('')}
      </div>
      <button class="cl-goals-btn" data-goals>Edit goals</button>
    </section>

    <section class="cl-card cl-water">
      <h2 class="cl-card-title">Log Water Intake</h2>
      <div class="cl-water-row">
        <span class="cl-glass">${icon(ICONS.glass)}<i style="height:${pct(day.water, goals.water)}%"></i></span>
        <span class="cl-water-text">
          <strong>${day.water}<span>/${goals.water}ml</span></strong>
          <span class="muted">${waterLeft ? `You still need ${waterLeft} ml today` : 'Goal reached. Well done!'}</span>
        </span>
        <span class="cl-stepper">
          <button class="cl-round" data-water="-1" aria-label="Remove a glass" ${day.water ? '' : 'disabled'}>${icon(ICONS.minus)}</button>
          <span class="cl-glasses" aria-label="${day.water / GLASS_ML} glasses">${String(Math.round(day.water / GLASS_ML)).padStart(2, '0')}</span>
          <button class="cl-round filled" data-water="1" aria-label="Add a glass">${icon(ICONS.plus)}</button>
        </span>
      </div>
    </section>

    <h2 class="section-title">Meals</h2>
    <div class="cl-meals">${MEALS.map((m) => {
      const list = day.meals[m.id];
      const kcal = Math.round(list.reduce((s, e) => s + e.kcal, 0));
      const lo = Math.round((goals.kcal * m.share * 0.9) / 10) * 10;
      const hi = Math.round((goals.kcal * m.share * 1.1) / 10) * 10;
      return `
      <div class="cl-meal">
        <button class="cl-meal-main" data-meal="${m.id}">
          <strong>${m.title}</strong>
          <span class="cl-meal-rec">${icon(ICONS.flame)} ${kcal ? `${kcal} kcal` : `Recommended ${lo} - ${hi} kcal`}</span>
        </button>
        <div class="cl-meal-foot">
          <span class="cl-meal-foods">${list.slice(0, 3).map((e) => avatar(e.name)).join('')}${list.length > 3 ? `<span class="cl-food-dot more">+${list.length - 3}</span>` : ''}</span>
          <button class="cl-round" data-add="${m.id}" aria-label="Add food to ${m.title}">${icon(ICONS.plus)}</button>
        </div>
      </div>`;
    }).join('')}</div>
    <p class="muted small-print cl-source">Nutrition values: USDA FoodData Central, per 100 g.</p>`;

  el.onclick = (ev) => {
    const b = ev.target.closest('button');
    if (!b || b.disabled) return;
    if (b.dataset.day !== undefined) {
      const n = Number(b.dataset.day);
      viewDay = n === 0 ? dateKey(Date.now()) : dateKey(new Date(viewDay).getTime() + n * DAY + DAY / 2);
      renderHome(el);
    } else if (b.dataset.water) {
      const d = getDay(viewDay);
      d.water = Math.max(0, d.water + Number(b.dataset.water) * GLASS_ML);
      saveDay(viewDay, d);
      haptic();
      if (d.water === getGoals().water && Number(b.dataset.water) > 0) toast('Water goal reached');
      renderHome(el);
    } else if (b.dataset.add) {
      addFood(b.dataset.add, () => renderHome(el));
    } else if (b.dataset.meal) {
      mealSheet(b.dataset.meal, () => renderHome(el));
    } else if ('goals' in b.dataset) {
      goalsSheet(() => renderHome(el));
    }
  };
}

// ===================== Προσθήκη φαγητού =====================

function addFood(mealId, after) {
  const meal = MEALS.find((m) => m.id === mealId);
  openSheet(`
    <h2>Add to ${meal.title}</h2>
    <label class="cl-search">${icon(ICONS.search)}<input type="search" placeholder="Search food, e.g. chicken breast raw" autocomplete="off" aria-label="Search food"></label>
    <ul class="list cl-results"><li class="wk-none muted">Loading foods…</li></ul>`,
  async (root, close) => {
    root.classList.add('cl-sheet');
    const input = root.querySelector('input');
    const results = root.querySelector('.cl-results');
    const { FOODS } = await loadFoods();
    const recent = () => {
      // Ό,τι έφαγες πρόσφατα (από τις τελευταίες 14 μέρες), για γρήγορη επιλογή
      const days = store.get('days', {});
      const names = [];
      Object.keys(days).sort().reverse().slice(0, 14).forEach((k) => Object.values(days[k].meals || {}).flat().forEach((e) => {
        if (!names.includes(e.name)) names.push(e.name);
      }));
      return names.slice(0, 12).map((n) => FOODS.find((r) => r[0] === n)).filter(Boolean);
    };
    let rows = [];
    const paint = () => {
      const q = input.value.trim();
      rows = q ? searchFoods(FOODS, q) : recent();
      results.innerHTML = rows.length
        ? `${q ? '' : '<li class="cl-results-head muted">Recent</li>'}${rows.map((r, i) => `
          <li><button class="row cl-result" data-pick="${i}">
            <span class="row-text"><span class="cl-result-name">${foodName(r[0])}</span>
              <span class="row-sub">${r[1]} kcal · P ${r[2]} · C ${r[3]} · F ${r[4]} per 100 g</span></span>
          </button></li>`).join('')}`
        : `<li class="wk-none muted">${q ? 'No foods found. Try fewer or simpler words (e.g. "rice cooked").' : 'Search for a food to add it.'}</li>`;
    };
    paint();
    input.addEventListener('input', paint);
    input.focus();
    results.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-pick]');
      if (!b) return;
      close();
      setTimeout(() => gramsSheet(rows[Number(b.dataset.pick)], meal, after), 250);
    });
  });
}

function gramsSheet(row, meal, after) {
  const portion = row[7] ? { label: row[7], grams: row[8] } : null;
  openSheet(`
    <h2 class="cl-food-title">${foodName(row[0])}</h2>
    <div class="cl-grams">
      <label class="cl-grams-field"><input type="text" inputmode="decimal" value="100" aria-label="Grams"><span>g</span></label>
      <div class="chips">
        ${[50, 100, 150, 200].map((g) => `<button class="chip" data-g="${g}">${g} g</button>`).join('')}
        ${portion ? `<button class="chip" data-g="${portion.grams}">${escapeHtml(portion.label)} (${portion.grams} g)</button>` : ''}
      </div>
    </div>
    <div class="cl-preview"></div>
    <p class="muted small-print">Source: USDA FoodData Central (${row[6] === 'F' ? 'Foundation Foods' : 'SR Legacy'}).</p>
    <div class="stack"><button class="btn btn-block" data-save>Add to ${meal.title}</button></div>`,
  (root, close) => {
    const input = root.querySelector('input');
    const preview = root.querySelector('.cl-preview');
    const grams = () => Math.max(0, parseFloat(String(input.value).replace(',', '.')) || 0);
    const paint = () => {
      const v = forGrams(row, grams());
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
        d.meals[meal.id].push({ id: uid(), name: row[0], grams: g, ...forGrams(row, g) });
        saveDay(viewDay, d);
        haptic();
        toast(`Added ${forGrams(row, g).kcal} kcal to ${meal.title}`);
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
    <h2>${meal.title}</h2>
    <p class="muted">${Math.round(t.kcal)} kcal · P ${r1(t.p)}g · C ${r1(t.c)}g · F ${r1(t.f)}g</p>
    <ul class="list rules-list">${list.map((e) => `
      <li><div class="row row-static">
        <span class="row-text"><span class="cl-result-name">${foodName(e.name)}</span>
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
      <div class="field-row">${field('f', 'Fats', 'g')}${field('water', 'Water', 'ml')}</div>
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
