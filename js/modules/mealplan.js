// Calories: το εβδομαδιαίο πρόγραμμα φαγητού, τα ψώνια και η καταγραφή.
//
// ΚΑΡΤΕΛΕΣ
//   Meal plan   ΜΟΝΟ το πρόγραμμα της εβδομάδας (data/mealplan.js), Δευτέρα πρώτη, η σημερινή μπλε
//   Groceries   τι έχεις στο σπίτι, ανά μαγαζί (Υπεραγορά / Λαϊκή / Κλουβάτος)
//   Track       "Το έφαγα" σε κάθε γεύμα της μέρας: τα υλικά του αφαιρούνται από τα Groceries
//
// ΠΟΤΕ ΛΕΙΠΕΙ ΚΑΤΙ: από το πρόγραμμα ξέρουμε πόσο χρησιμοποιείς κάθε υλικό την
// εβδομάδα. Αν αυτό που έχεις φτάνει για λιγότερες από 3 μέρες (ή τελείωσε), το
// υλικό μπαίνει στη λίστα για ψώνια και σε ειδοποιούμε σε ποιο μαγαζί να πας.
// Υλικά που δεν είναι στο πρόγραμμα (π.χ. κιμάς) "λείπουν" μόνο όταν τελειώσουν.
//
// Το YAZIO δεν έχει δημόσιο API, οπότε η καταγραφή γίνεται εδώ (ένα πάτημα ανά γεύμα).
//
// Δεδομένα (moduleStore('mealplan')):
//   stock    { itemId: ποσότητα }  (g ή τεμάχια). Χωρίς τιμή = δεν το έχεις ορίσει ακόμα
//   alerted  { itemId: true }      για ποια έχουμε ήδη ειδοποιήσει (μέχρι να τα ξαναγοράσεις)
//   track    { "2026-10-21": { breakfast: { choice, used: { itemId: qty } } | { skipped: true } } }
//   products { itemId: { code, name, brand, quantity, image } }  το συγκεκριμένο προϊόν που αγοράζεις
//            (από scan του barcode, με στοιχεία από το Open Food Facts)

import { register } from '../core/registry.js';
import { moduleStore } from '../core/storage.js';
import { escapeHtml, icon, toast, openSheet, navigate } from '../core/router.js';
import { haptic } from '../core/feedback.js';
import { scanBarcode, lookupProduct } from '../core/scanner.js';
import { STORES, ITEMS, MEALS, DAYS, PLAN } from '../../data/mealplan.js';

const store = moduleStore('mealplan');

const LOW_DAYS = 3; // λιγότερο από τόσες μέρες = ώρα για ψώνια
const DAY = 86400000;

const ICONS = {
  plan: '<rect x="4" y="3.5" width="16" height="17" rx="2.5"/><path d="M8 8h8M8 12h8M8 16h5"/>',
  cart: '<path d="M3 4h2.5l2.2 10.5h10.6L20.5 7H6.4"/><circle cx="9.5" cy="19" r="1.4"/><circle cx="17" cy="19" r="1.4"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  flame: '<path d="M12 21c-3.9 0-6.5-2.7-6.5-6.3 0-3.4 2.4-5.4 3.6-8.2.6 1.6 1.4 2.6 2.6 3.3.2-2.6 1.3-5 3-6.8.3 3.2 4.3 5.9 4.3 11 0 4-2.9 7-7 7z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  barcode: '<path d="M4 5v14M7 5v14M10.5 5v14M13 5v14M16.5 5v14M20 5v14"/>',
};

// ===================== Βοηθητικά =====================

const dateKey = (d) => new Date(d).toLocaleDateString('sv'); // "2026-10-21"
const atNoon = (key) => new Date(`${key}T12:00:00`);
const weekday = (key) => (atNoon(key).getDay() + 6) % 7; // 0 = Δευτέρα
const itemById = (id) => ITEMS.find((i) => i.id === id);
const storeById = (id) => STORES.find((s) => s.id === id);

const getStock = () => store.get('stock', {});
const getTrack = () => store.get('track', {});
const getProducts = () => store.get('products', {});

// "Barilla Penne Rigate Nº73 · 500 g"
const productText = (p) => [p.brand, p.name].filter(Boolean).join(' ') + (p.quantity ? ` · ${p.quantity}` : '');

// "250 g", "1,2 kg", "12 τεμ."
function qtyText(item, q) {
  if (q === undefined || q === null) return '—';
  const v = Math.max(0, q);
  if (item.unit === 'g') return v >= 1000 ? `${String(Math.round(v / 100) / 10).replace('.', ',')} kg` : `${Math.round(v)} g`;
  return `${String(Math.round(v * 10) / 10).replace('.', ',')} τεμ.`;
}
const amountText = (item, q) => (item.unit === 'g' ? `${q} g` : `×${String(q).replace('.', ',')}`);

// Πόσο χρησιμοποιεί το πρόγραμμα από κάθε υλικό την εβδομάδα (με την πρώτη επιλογή όπου έχει "ή")
const WEEKLY = (() => {
  const w = {};
  for (const day of PLAN) for (const m of MEALS) {
    const meal = day[m.id];
    const uses = meal.options ? meal.options[0].uses : meal.uses;
    for (const [id, q] of uses) w[id] = (w[id] || 0) + q;
  }
  return w;
})();

// Για πόσες μέρες φτάνει (null = δεν χρησιμοποιείται στο πρόγραμμα)
function daysLeft(id, qty) {
  const perDay = (WEEKLY[id] || 0) / 7;
  return perDay ? qty / perDay : null;
}

// Λείπει ή λείπει σύντομα; (μόνο αν έχεις ορίσει πόσο έχεις)
function isLow(item, stock = getStock()) {
  const q = stock[item.id];
  if (q === undefined) return false;
  if (q <= 0) return true;
  const d = daysLeft(item.id, q);
  return d !== null && d < LOW_DAYS;
}
const lowItems = (stock = getStock()) => ITEMS.filter((i) => !i.optional && isLow(i, stock));

// ===================== Ειδοποίηση "πήγαινε για ψώνια" =====================

async function notifyLow() {
  const stock = getStock();
  const alerted = store.get('alerted', {});
  const fresh = lowItems(stock).filter((i) => !alerted[i.id]);
  // Ό,τι ξαναγόρασες, ξαναμπαίνει για μελλοντική ειδοποίηση
  for (const id of Object.keys(alerted)) if (!isLow(itemById(id), stock)) delete alerted[id];
  if (!fresh.length) { store.set('alerted', alerted); return; }
  fresh.forEach((i) => { alerted[i.id] = true; });
  store.set('alerted', alerted);

  const byStore = STORES.map((s) => ({ s, items: fresh.filter((i) => i.store === s.id) })).filter((x) => x.items.length);
  const title = `Time to go to ${byStore.map((x) => x.s.name).join(' & ')}`;
  const body = byStore.map((x) => `${x.s.emoji} ${x.items.map((i) => i.name).join(', ')}`).join('\n');
  toast(`${title}: ${fresh.map((i) => i.name).join(', ')}`);
  // Ειδοποίηση του iPhone (αν έχεις δώσει άδεια για ειδοποιήσεις στα Reminders)
  try {
    if ('Notification' in window && Notification.permission === 'granted' && navigator.serviceWorker) {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification(title, { body, tag: 'groceries', data: { url: './#/groceries' } });
    }
  } catch { /* χωρίς ειδοποίηση: μένει το μήνυμα μέσα στο app */ }
}

// Αλλάζει ποσότητες: deltas = { itemId: +/-ποσότητα }
function applyStock(deltas) {
  const stock = getStock();
  for (const [id, d] of Object.entries(deltas)) {
    if (stock[id] === undefined && d < 0) continue; // δεν το παρακολουθείς ακόμα
    stock[id] = Math.max(0, Math.round(((stock[id] || 0) + d) * 100) / 100);
  }
  store.set('stock', stock);
  notifyLow();
}

// ===================== Meal plan (αρχική) =====================

function mealOfDay(dayIdx, mealId) {
  return PLAN[dayIdx][mealId];
}

function renderPlan(el) {
  const today = weekday(dateKey(Date.now()));
  el.innerHTML = `
    <div class="mp-days">${DAYS.map((_, d) => `
      <section class="mp-day ${d === today ? 'today' : ''}" style="--i:${d}" ${d === today ? 'id="mp-today"' : ''}>
        <header class="mp-day-head">
          <h2>${DAYS[d]}</h2>
          ${d === today ? '<span class="mp-today">Σήμερα</span>' : d === (today + 1) % 7 ? '<span class="mp-tomorrow">Αύριο</span>' : ''}
        </header>
        <ul class="mp-meals">${MEALS.map((m) => `
          <li><span class="mp-emoji" aria-hidden="true">${m.emoji}</span>
            <span class="mp-meal-text"><span class="mp-meal-title">${m.title}</span>
            <span>${escapeHtml(mealOfDay(d, m.id).text)}</span></span></li>`).join('')}
        </ul>
      </section>`).join('')}
    </div>`;
}

// ===================== Groceries =====================

function stockSheet(item, after) {
  const stock = getStock();
  const cur = stock[item.id];
  const step = item.unit === 'g' ? (item.pack.size >= 1000 ? 100 : 50) : 1;
  openSheet(`
    <h2>${escapeHtml(item.name)}</h2>
    <p class="muted">${storeById(item.store).emoji} ${storeById(item.store).name}${WEEKLY[item.id] ? ` · the plan uses ${qtyText(item, WEEKLY[item.id])} a week` : ''}</p>
    <div class="mp-product"></div>
    <p class="field-label">You have now (${item.unit === 'g' ? 'grams' : 'pieces'})</p>
    <div class="mp-qty">
      <button class="mp-round" data-step="-1" aria-label="Less">−</button>
      <input class="mp-qty-input" inputmode="decimal" value="${cur ?? 0}" aria-label="Quantity">
      <button class="mp-round" data-step="1" aria-label="More">+</button>
    </div>
    <div class="chips">
      <button class="chip" data-pack="1">+ ${escapeHtml(item.pack.label)}${item.pack.price ? ` (${item.pack.price.toFixed(2).replace('.', ',')} €)` : ''}</button>
      <button class="chip" data-zero>Ran out (0)</button>
    </div>
    <div class="stack"><button class="btn btn-block" data-save>Save</button></div>`,
  (root, close) => {
    const input = root.querySelector('.mp-qty-input');
    const val = () => Math.max(0, parseFloat(String(input.value).replace(',', '.')) || 0);
    input.addEventListener('focus', () => input.select());
    const box = root.querySelector('.mp-product');
    // Το προϊόν που αγοράζεις: φωτογραφία, μάρκα, όνομα, συσκευασία, barcode
    const paintProduct = (busy = '') => {
      const p = getProducts()[item.id];
      // Σύρσιμο του "χαπιού" αριστερά ή δεξιά: από κάτω εμφανίζεται το κόκκινο Delete
      box.innerHTML = busy ? `<p class="muted mp-product-busy">${busy}</p>` : p ? `
        <div class="mp-swipe">
          <button class="mp-swipe-del left" data-forget tabindex="-1">Delete</button>
          <button class="mp-swipe-del right" data-forget>Delete</button>
          <div class="mp-product-card" aria-label="${escapeHtml(productText(p))}. Swipe to delete">
            ${p.image ? `<img src="${escapeHtml(p.image)}" alt="" loading="lazy" draggable="false">` : `<span class="mp-product-noimg">${icon(ICONS.cart)}</span>`}
            <span class="mp-product-text"><span class="mp-product-label muted">Buy this</span>
              <strong>${escapeHtml(productText(p))}</strong>
              <span class="muted mp-code">${escapeHtml(p.code)}</span></span>
          </div>
        </div>
        <div class="mp-product-actions">
          <button class="link-btn" data-scan>Scan another</button>
          <span class="muted small-print mp-swipe-hint">Swipe it to delete</span>
        </div>` : `
        <button class="btn btn-quiet btn-block mp-scan-btn" data-scan>${icon(ICONS.barcode)} Scan barcode</button>
        <p class="muted small-print">Scan the product you buy, so you know exactly what to get.</p>`;
    };
    paintProduct();

    // Σύρσιμο του προϊόντος (όπως στα μηνύματα του iPhone)
    const OPEN = 96; // πόσο μένει ανοιχτό, για να φαίνεται το Delete
    let drag = null; // { x0, dx, base }
    const card = () => box.querySelector('.mp-product-card');
    const setX = (x, animate) => {
      const c = card();
      if (!c) return;
      c.style.transition = animate ? 'transform 0.45s var(--spring)' : 'none';
      c.style.transform = `translateX(${x}px)`;
      box.querySelector('.mp-swipe').dataset.side = x > 0 ? 'left' : x < 0 ? 'right' : '';
    };
    box.addEventListener('pointerdown', (ev) => {
      const c = ev.target.closest('.mp-product-card');
      if (!c) return;
      const m = /translateX\((-?[\d.]+)px\)/.exec(c.style.transform || '');
      drag = { x0: ev.clientX, dx: 0, base: m ? Number(m[1]) : 0, moved: false };
      try { c.setPointerCapture(ev.pointerId); } catch { /* συνεχίζουμε και χωρίς */ }
    });
    box.addEventListener('pointermove', (ev) => {
      if (!drag) return;
      drag.dx = ev.clientX - drag.x0;
      if (Math.abs(drag.dx) > 6) drag.moved = true;
      if (drag.moved) setX(Math.max(-140, Math.min(140, drag.base + drag.dx)), false);
    });
    const release = () => {
      if (!drag) return;
      const x = drag.base + drag.dx;
      const wasTap = !drag.moved;
      drag = null;
      // Μικρό σύρσιμο ή πάτημα όταν είναι ανοιχτό: κλείνει. Αλλιώς μένει ανοιχτό.
      if (wasTap || Math.abs(x) < 48) setX(0, true);
      else { setX(x > 0 ? OPEN : -OPEN, true); haptic(); }
    };
    box.addEventListener('pointerup', release);
    box.addEventListener('pointercancel', release);

    const scan = async () => {
      const code = await scanBarcode();
      if (!code) return;
      paintProduct('Looking up the product…');
      let p = null;
      try {
        p = await lookupProduct(code);
      } catch {
        toast('No connection. Saved the barcode only');
      }
      if (!p) {
        const name = (prompt('Product not found in Open Food Facts. What is it? (e.g. Barilla penne 500 g)') || '').trim();
        p = { code, name: name || `Barcode ${code}`, brand: '', quantity: '', image: '' };
      }
      store.update('products', (all) => ({ ...all, [item.id]: p }), {});
      haptic();
      paintProduct();
      after();
    };
    root.addEventListener('click', (ev) => {
      const b = ev.target.closest('button');
      if (!b) return;
      if ('scan' in b.dataset) { scan(); return; }
      if ('forget' in b.dataset) {
        // Το "χάπι" φεύγει από την οθόνη και μετά σβήνεται
        const c = card();
        if (c) { c.style.transition = 'transform 0.3s ease-in, opacity 0.3s'; c.style.transform = `translateX(${b.classList.contains('left') ? 120 : -120}%)`; c.style.opacity = '0'; }
        haptic();
        setTimeout(() => {
          store.update('products', (all) => { const x = { ...all }; delete x[item.id]; return x; }, {});
          paintProduct();
          after();
          toast('Product removed');
        }, 280);
        return;
      }
      if (b.dataset.step) input.value = Math.max(0, val() + Number(b.dataset.step) * step);
      else if (b.dataset.pack) input.value = val() + item.pack.size;
      else if ('zero' in b.dataset) input.value = 0;
      else if ('save' in b.dataset) {
        const s = getStock();
        s[item.id] = val();
        store.set('stock', s);
        notifyLow();
        haptic();
        close();
        after();
      }
    });
  });
}

// "Τα πήρα": προσθέτει ένα πακέτο (ή όσα λέει το πρόγραμμα, π.χ. στήθος ×2) σε όσα λείπουν από ένα μαγαζί
function boughtSheet(storeId, after) {
  const s = storeById(storeId);
  const items = lowItems().filter((i) => i.store === storeId);
  openSheet(`
    <h2>${s.emoji} Bought at ${s.name}</h2>
    <p class="muted">Adds what you usually buy to your stock.</p>
    <ul class="list rules-list">${items.map((i) => `
      <li><label class="row toggle-row">
        <span class="row-text"><span class="row-title">${escapeHtml(i.name)}</span>
          <span class="row-sub">+ ${i.pack.count ? `${i.pack.count} × ` : ''}${escapeHtml(i.pack.label)}</span></span>
        <input type="checkbox" class="switch" data-item="${i.id}" checked>
      </label></li>`).join('')}
    </ul>
    <div class="stack"><button class="btn btn-block" data-save>Add to stock</button></div>`,
  (root, close) => root.querySelector('[data-save]').addEventListener('click', () => {
    const deltas = {};
    root.querySelectorAll('[data-item]:checked').forEach((c) => {
      const i = itemById(c.dataset.item);
      deltas[i.id] = i.pack.size * (i.pack.count || 1);
    });
    applyStock(deltas);
    toast('Stock updated');
    close();
    after();
  }));
}

function renderGroceries(el) {
  const stock = getStock();
  const low = lowItems(stock);
  const unset = ITEMS.filter((i) => !i.optional && stock[i.id] === undefined).length;
  const lowCost = low.filter((i) => i.pack.price).reduce((sum, i) => sum + i.pack.price * (i.pack.count || 1), 0);

  el.innerHTML = `
    ${low.length ? `
      <section class="mp-alert">
        <p class="mp-alert-title">${icon(ICONS.cart)} Time to go shopping</p>
        ${STORES.map((s) => {
          const items = low.filter((i) => i.store === s.id);
          if (!items.length) return '';
          return `
          <div class="mp-alert-store">
            <span><strong>${s.emoji} ${s.name}:</strong> ${items.map((i) => escapeHtml(getProducts()[i.id] ? productText(getProducts()[i.id]) : i.name)).join(', ')}</span>
            <button class="btn btn-small" data-bought="${s.id}">Bought</button>
          </div>`;
        }).join('')}
        ${lowCost ? `<p class="mp-alert-cost">Κλουβάτος about ${lowCost.toFixed(2).replace('.', ',')} €</p>` : ''}
      </section>` : ''}
    ${unset ? `<p class="muted small-print mp-hint">Tap each item to set how much you have now. Then Track keeps it up to date.</p>` : ''}

    ${STORES.map((s) => `
      <h2 class="section-title">${s.emoji} ${s.name}</h2>
      <ul class="list">${ITEMS.filter((i) => i.store === s.id).map((i) => {
        const q = stock[i.id];
        const d = q === undefined ? null : daysLeft(i.id, q);
        const lowNow = isLow(i, stock);
        const prod = getProducts()[i.id];
        const sub = q === undefined ? 'Tap to set what you have'
          : d === null ? (i.optional ? 'Optional' : 'Not in the plan')
            : d < 1 ? 'Runs out today' : `Enough for ~${Math.floor(d)} ${Math.floor(d) === 1 ? 'day' : 'days'}`;
        return `
        <li><button class="row" data-item="${i.id}">
          ${prod && prod.image ? `<img class="mp-thumb" src="${escapeHtml(prod.image)}" alt="" loading="lazy">` : ''}
          <span class="row-text"><span class="row-title">${escapeHtml(i.name)}${i.optional ? ' <span class="muted">(προαιρετικό)</span>' : ''}</span>
            ${prod ? `<span class="row-sub mp-prod-line">${escapeHtml(productText(prod))}</span>` : ''}
            <span class="row-sub ${lowNow ? 'is-low' : ''}">${sub}</span></span>
          <span class="row-value small-value ${lowNow ? 'is-low' : ''}">${qtyText(i, q)}</span>
        </button></li>`;
      }).join('')}</ul>`).join('')}`;

  el.onclick = (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.dataset.item) stockSheet(itemById(b.dataset.item), () => renderGroceries(el));
    else if (b.dataset.bought) boughtSheet(b.dataset.bought, () => renderGroceries(el));
  };
}

// ===================== Track =====================

let trackDay = null;

const usesText = (uses) => uses.map(([id, q]) => `${itemById(id).name} ${amountText(itemById(id), q)}`).join(', ');

function setTrack(key, mealId, value) {
  const all = getTrack();
  const day = { ...(all[key] || {}) };
  if (value === null) delete day[mealId]; else day[mealId] = value;
  all[key] = day;
  // Κρατάμε μόνο τις τελευταίες 60 μέρες
  const keep = Object.keys(all).sort().slice(-60);
  store.set('track', Object.fromEntries(keep.map((k) => [k, all[k]])));
}

// "Το έφαγα": αφαιρεί τα υλικά. Με επιλογές (π.χ. "Κοτομπουκιές ή παραγγελία") ρωτάει ποιο.
function eat(mealId, choiceIdx, uses, after) {
  const used = Object.fromEntries(uses);
  applyStock(Object.fromEntries(uses.map(([id, q]) => [id, -q])));
  setTrack(trackDay, mealId, { choice: choiceIdx, used });
  haptic();
  after();
}

function undo(mealId, after) {
  const t = (getTrack()[trackDay] || {})[mealId];
  if (t && t.used) applyStock(Object.fromEntries(Object.entries(t.used).map(([id, q]) => [id, q])));
  setTrack(trackDay, mealId, null);
  after();
}

// Αλλαγή ποσοτήτων πριν το "Το έφαγα" (π.χ. έφαγες 250 g κοτόπουλο αντί για 200)
function adjustSheet(mealId, choiceIdx, uses, after) {
  openSheet(`
    <h2>How much did you eat?</h2>
    <ul class="list rules-list">${uses.map(([id, q]) => {
      const it = itemById(id);
      return `
      <li><div class="row row-static">
        <span class="row-text"><span class="row-title">${escapeHtml(it.name)}</span><span class="row-sub">${it.unit === 'g' ? 'grams' : 'pieces'}</span></span>
        <input class="mp-small-input" data-id="${id}" inputmode="decimal" value="${q}">
      </div></li>`;
    }).join('')}</ul>
    <div class="stack"><button class="btn btn-block" data-save>Ate it</button></div>`,
  (root, close) => root.querySelector('[data-save]').addEventListener('click', () => {
    const newUses = [...root.querySelectorAll('[data-id]')].map((i) => [i.dataset.id, Math.max(0, parseFloat(String(i.value).replace(',', '.')) || 0)]);
    close();
    eat(mealId, choiceIdx, newUses, after);
  }));
}

// Κάτι εκτός προγράμματος (π.χ. 2 αυγά παραπάνω)
function extraSheet(after) {
  openSheet(`
    <h2>Used something else</h2>
    <p class="muted">It is taken off your stock.</p>
    <label class="field"><span>Item</span>
      <select class="mp-select">${ITEMS.map((i) => `<option value="${i.id}">${escapeHtml(i.name)}</option>`).join('')}</select></label>
    <label class="field"><span>Quantity (grams or pieces)</span><input class="mp-extra-qty" inputmode="decimal" value="1"></label>
    <div class="stack"><button class="btn btn-block" data-save>Take off stock</button></div>`,
  (root, close) => root.querySelector('[data-save]').addEventListener('click', () => {
    const id = root.querySelector('select').value;
    const q = Math.max(0, parseFloat(String(root.querySelector('.mp-extra-qty').value).replace(',', '.')) || 0);
    if (!q) { toast('Enter a quantity'); return; }
    applyStock({ [id]: -q });
    const all = getTrack();
    const day = { ...(all[trackDay] || {}) };
    day.extra = [...(day.extra || []), { id, q }];
    all[trackDay] = day;
    store.set('track', all);
    toast(`${itemById(id).name}: −${amountText(itemById(id), q)}`);
    close();
    after();
  }));
}

function renderTrack(el) {
  if (!trackDay) trackDay = dateKey(Date.now());
  const d = weekday(trackDay);
  const tracked = getTrack()[trackDay] || {};
  const isToday = trackDay === dateKey(Date.now());
  const low = lowItems();

  el.innerHTML = `
    <div class="mp-track-day">
      <button class="icon-btn" data-day="-1" aria-label="Previous day">‹</button>
      <span class="mp-track-title"><strong>${isToday ? 'Today' : DAYS[d]}</strong>
        <span class="muted">${atNoon(trackDay).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}${isToday ? `, ${DAYS[d]}` : ''}</span></span>
      <button class="icon-btn" data-day="1" aria-label="Next day" ${isToday ? 'disabled' : ''}>›</button>
    </div>

    ${low.length ? `
      <button class="mp-low-banner" data-go-groceries>
        ${icon(ICONS.cart)}<span><strong>Running low:</strong> ${low.map((i) => escapeHtml(i.name)).join(', ')}</span><span class="row-chevron">›</span>
      </button>` : ''}

    <ul class="mp-track">${MEALS.map((m) => {
      const meal = mealOfDay(d, m.id);
      const t = tracked[m.id];
      const opts = meal.options || [meal];
      if (!meal.options && !meal.uses.length) { // π.χ. "Τίποτα" ή χωρίς γεύμα
        return `<li class="mp-track-meal off"><span class="mp-emoji">${m.emoji}</span><span class="mp-meal-text"><span class="mp-meal-title">${m.title}</span><span class="muted">${escapeHtml(meal.text === '—' ? 'Nothing planned' : meal.text)}</span></span></li>`;
      }
      return `
      <li class="mp-track-meal ${t ? (t.skipped ? 'skipped' : 'done') : ''}">
        <span class="mp-emoji">${m.emoji}</span>
        <span class="mp-meal-text">
          <span class="mp-meal-title">${m.title}</span>
          <span>${escapeHtml(t && !t.skipped && meal.options ? meal.options[t.choice].text : meal.text)}</span>
          ${t && t.used && Object.keys(t.used).length ? `<span class="mp-used muted">−${usesText(Object.entries(t.used))}</span>`
            : !t && opts.length === 1 && opts[0].uses.length ? `<span class="mp-used muted">${usesText(opts[0].uses)}</span>` : ''}
          <span class="mp-actions">${t
            ? `<span class="mp-state">${t.skipped ? 'Skipped' : `${icon(ICONS.check)} Eaten`}</span><button class="link-btn" data-undo="${m.id}">Undo</button>`
            : `${opts.map((o, i) => `<button class="btn btn-small mp-eat" data-eat="${m.id}" data-choice="${i}">${opts.length > 1 ? escapeHtml(o.text) : 'Ate it'}</button>`).join('')}
               ${opts.length === 1 && opts[0].uses.length ? `<button class="link-btn" data-adjust="${m.id}">Change amounts</button>` : ''}
               <button class="link-btn" data-skip="${m.id}">Skipped</button>`}
          </span>
        </span>
      </li>`;
    }).join('')}</ul>

    ${tracked.extra && tracked.extra.length ? `<p class="muted small-print">Also used: ${tracked.extra.map((x) => `${escapeHtml(itemById(x.id).name)} ${amountText(itemById(x.id), x.q)}`).join(', ')}</p>` : ''}
    <button class="btn btn-quiet btn-block mp-extra" data-extra>${icon(ICONS.plus)} Used something else</button>`;

  const again = () => renderTrack(el);
  el.onclick = (ev) => {
    const b = ev.target.closest('button');
    if (!b || b.disabled) return;
    if (b.dataset.day) {
      trackDay = dateKey(atNoon(trackDay).getTime() + Number(b.dataset.day) * DAY);
      again();
    } else if ('goGroceries' in b.dataset) navigate('groceries');
    else if (b.dataset.eat) {
      const meal = mealOfDay(d, b.dataset.eat);
      const i = Number(b.dataset.choice);
      eat(b.dataset.eat, i, (meal.options || [meal])[i].uses, again);
    } else if (b.dataset.adjust) {
      const meal = mealOfDay(d, b.dataset.adjust);
      adjustSheet(b.dataset.adjust, 0, meal.uses, again);
    } else if (b.dataset.skip) {
      setTrack(trackDay, b.dataset.skip, { skipped: true });
      again();
    } else if (b.dataset.undo) undo(b.dataset.undo, again);
    else if ('extra' in b.dataset) extraSheet(again);
  };
}

// ===================== Καταχώρηση =====================

register({
  id: 'calories',
  title: 'Meal plan',
  icon: ICONS.plan,
  order: 90,
  section: 'calories',
  sectionHome: true,
  home: false,
  render: renderPlan,
});

register({
  id: 'groceries',
  title: 'Groceries',
  icon: ICONS.cart,
  order: 91,
  section: 'calories',
  nav: true,
  home: false,
  badge: () => lowItems().length, // κόκκινος αριθμός στην καρτέλα: όσα λείπουν
  render: renderGroceries,
});

register({
  id: 'track',
  title: 'Track',
  icon: ICONS.check,
  order: 92,
  section: 'calories',
  nav: true,
  home: false,
  render: renderTrack,
  unmount() { trackDay = null; },
});
