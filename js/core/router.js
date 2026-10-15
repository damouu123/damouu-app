// Router: αποφασίζει ποια οθόνη φαίνεται, με βάση το κομμάτι της
// διεύθυνσης μετά το # (π.χ. index.html#/timer).
// Χρησιμοποιούμε # γιατί δουλεύει στο GitHub Pages χωρίς ρυθμίσεις server
// και δεν ξαναφορτώνει τη σελίδα.

import { allModules, getModule } from './registry.js';
import { getSetting, setSetting } from './settings.js';
import { haptic } from './feedback.js';

const view = () => document.getElementById('view');
let current = null; // το module που φαίνεται τώρα

const HOME_ICON = '<path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z"/>';

// path: 'timer' ή με υπο-διεύθυνση, π.χ. 'calendar/edit'
export function navigate(path) {
  location.hash = `#/${path}`;
}

// Ένα module αλλάζει τον τίτλο της οθόνης του (π.χ. "Edit schedule")
export function setTitle(text) {
  document.getElementById('page-title').textContent = text;
  document.title = `${text} – Discipline`;
}

export function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// Τυλίγει τις γραμμές ενός εικονιδίου (το "icon" κάθε module) σε <svg>
export function icon(paths) {
  return `<svg class="icon" viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;
}

// Σύντομο μήνυμα κάτω από την οθόνη που σβήνει μόνο του (π.χ. "+10 XP").
// Αν έρθουν πολλά μαζί, μπαίνουν σε ουρά και εμφανίζονται ένα-ένα.
const toastQueue = [];
let toastBusy = false;

export function toast(text) {
  toastQueue.push(text);
  if (toastQueue.length > 3) toastQueue.shift(); // όχι ατελείωτη ουρά
  if (!toastBusy) nextToast();
}

function nextToast() {
  const text = toastQueue.shift();
  if (text === undefined) { toastBusy = false; return; }
  toastBusy = true;
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.classList.add('show');
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(nextToast, 300); // λίγο κενό ανάμεσα σε δύο μηνύματα
  }, 2200);
}

// Φύλλο που ανεβαίνει από κάτω (σαν των εφαρμογών της Apple).
//   html     το περιεχόμενο μέσα στο φύλλο
//   setup    (root, close) => ... προσθέτεις κουμπιά/handlers· το close() το κλείνει
//   onClose  καλείται όταν κλείσει με οποιονδήποτε τρόπο (κουμπί, έξω, Escape)
// Το κλείσιμο έχει κίνηση: πρώτα η κλάση "closing", μετά αφαιρείται το στοιχείο.
export function openSheet(html, setup, onClose) {
  const backdrop = document.createElement('div');
  backdrop.className = 'sheet-backdrop';
  backdrop.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">${html}</div>`;

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    backdrop.classList.add('closing');
    setTimeout(() => backdrop.remove(), 240);
    if (onClose) onClose();
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };

  // Πάτημα έξω από το φύλλο το κλείνει
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(backdrop);
  if (setup) setup(backdrop.querySelector('.sheet'), close);
  return close;
}

// Ερώτηση επιβεβαίωσης μέσα στο app (αντί για το confirm() του browser,
// που κάποιοι browsers μπλοκάρουν σιωπηλά). Επιστρέφει Promise<true|false>.
// Χρήση:  if (await ask({ title: 'Delete?', confirmLabel: 'Delete' })) { ... }
export function ask({ title, text = '', confirmLabel = 'OK', cancelLabel = 'Cancel', danger = true }) {
  return new Promise((resolve) => {
    let answer = false;
    openSheet(`
      <h2>${escapeHtml(title)}</h2>
      ${text ? `<p class="muted">${escapeHtml(text)}</p>` : ''}
      <div class="stack">
        <button class="btn ${danger ? 'btn-danger' : ''} btn-block" data-answer="yes">${escapeHtml(confirmLabel)}</button>
        <button class="btn btn-quiet btn-block" data-answer="no">${escapeHtml(cancelLabel)}</button>
      </div>`,
    (root, close) => {
      root.addEventListener('click', (e) => {
        const b = e.target.closest('[data-answer]');
        if (!b) return;
        answer = b.dataset.answer === 'yes';
        close();
      });
      root.querySelector('[data-answer="no"]').focus(); // η ασφαλής επιλογή έχει το focus
    },
    () => resolve(answer));
  });
}

// Προσωρινή οθόνη για modules που δεν έχουν φτιαχτεί ακόμα
export function placeholder(el, text) {
  el.innerHTML = `
    <div class="placeholder">
      <p>${escapeHtml(text)}</p>
      <p class="muted">Coming in a later step.</p>
    </div>`;
}

// Αριθμός εβδομάδας κατά ISO (Δευτέρα = αρχή εβδομάδας)
function isoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

// Μία γραμμή λίστας για ένα module (εικονίδιο, τίτλος, υπότιτλος, τιμή)
function moduleRow(m) {
  let info = {};
  try { info = m.homeCard ? m.homeCard() || {} : {}; } catch (err) { console.error(m.id, err); }
  return `
    <li>
      <button class="row" data-go="${escapeHtml(m.id)}">
        ${icon(m.icon)}
        <span class="row-text">
          <span class="row-title">${escapeHtml(m.title)}</span>
          <span class="row-sub">${escapeHtml(info.label ?? '')}</span>
        </span>
        <span class="row-value">${escapeHtml(info.value ?? '')}</span>
        <span class="row-chevron" aria-hidden="true">›</span>
      </button>
    </li>`;
}

function renderHome(el) {
  const now = new Date();
  const date = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
  const mods = allModules();

  // Ένα module μπορεί να "πάρει" την κορυφή της Αρχικής (το πορτοφόλι)
  const heroMod = mods.find((m) => m.renderHomeHero);
  // Στη λίστα μπαίνουν όσα κοιτάς καθημερινά. Τα σπάνια (settings: true) πάνε στις
  // Ρυθμίσεις, και όσα έχουν home: false έχουν ήδη δικό τους κουμπί/καρτέλα.
  const listMods = mods.filter((m) => m !== heroMod && !m.settings && m.home !== false);

  // Μήνυμα της στιγμής από module (π.χ. "Your class was cancelled").
  // Δείχνουμε ΜΟΝΟ το πρώτο, για να μη γεμίζει η κορυφή.
  let banner = null;
  for (const m of mods) {
    try { banner = m.homeBanner ? m.homeBanner() : null; } catch (err) { console.error(m.id, err); }
    if (banner) break;
  }

  el.innerHTML = `
    <p class="subhead">${escapeHtml(date)}</p>
    ${banner ? `
      <div class="banner" role="status">
        <div class="banner-body">
          <p class="banner-title">${escapeHtml(banner.title)}</p>
          <p class="banner-text">${escapeHtml(banner.text)}</p>
        </div>
        ${banner.action ? `<button class="btn btn-small" data-go="${escapeHtml(banner.action.go)}">${escapeHtml(banner.action.label)}</button>` : ''}
      </div>` : ''}
    <section class="hero" id="home-hero"></section>
    <ul class="list home-list">${listMods.map(moduleRow).join('')}</ul>`;

  if (heroMod) {
    try { heroMod.renderHomeHero(el.querySelector('#home-hero')); } catch (err) { console.error(err); }
  }

  el.querySelectorAll('[data-go]').forEach((btn) => {
    btn.addEventListener('click', () => navigate(btn.dataset.go));
  });
}

// ===================== Ρυθμίσεις =====================

// Ένας διακόπτης (σαν των Ρυθμίσεων του iPhone) που αλλάζει μια ρύθμιση
function toggleRow(name, title, sub) {
  return `
    <li><label class="row toggle-row">
      <span class="row-text"><span class="row-title">${title}</span><span class="row-sub">${sub}</span></span>
      <input type="checkbox" class="switch" role="switch" data-setting="${name}" ${getSetting(name) ? 'checked' : ''}>
    </label></li>`;
}

// Οθόνη Ρυθμίσεων: διακόπτες + τα modules που χρησιμοποιείς σπάνια, σε ομάδες
function renderSettings(el) {
  const mods = allModules().filter((m) => m.settings);
  const group = (name) => mods.filter((m) => (m.settingsGroup || 'Features') === name).map(moduleRow).join('');

  el.innerHTML = `
    <h2 class="section-title first">General</h2>
    <ul class="list">
      ${toggleRow('sound', 'Sound effects', 'Wheel ticks and the end-of-session chime')}
      ${toggleRow('haptics', 'Haptics', 'Small vibrations, on iPhone with iOS 18 or later')}
    </ul>

    <h2 class="section-title">Features</h2>
    <ul class="list">${group('Features')}</ul>

    <h2 class="section-title">Data</h2>
    <ul class="list">
      ${toggleRow('autoBackup', 'Daily copies', 'Keep a copy of your data inside the app every day')}
      ${group('Data')}
    </ul>
    <p class="muted small-print centered" id="app-version"></p>`;

  el.onchange = (ev) => {
    const name = ev.target.dataset.setting;
    if (!name) return;
    setSetting(name, ev.target.checked);
    if (name === 'haptics' && ev.target.checked) haptic();
  };
  el.querySelectorAll('[data-go]').forEach((btn) => {
    btn.addEventListener('click', () => navigate(btn.dataset.go));
  });

  // Η έκδοση γράφεται μόνο στο sw.js: τη διαβάζουμε από εκεί (δουλεύει και offline)
  fetch('sw.js').then((r) => r.text()).then((src) => {
    const v = src.match(/VERSION = '([^']+)'/);
    const out = el.querySelector('#app-version');
    if (v && out) out.textContent = `Discipline ${v[1]}`;
  }).catch(() => {});
}

function renderTabbar(activeId) {
  const tabs = [{ id: 'home', title: 'Today', icon: HOME_ICON }, ...allModules().filter((m) => m.nav)];
  const bar = document.getElementById('tabbar');
  bar.innerHTML = tabs.map((t) => `
    <a href="#/${t.id}" class="tab ${t.id === activeId ? 'active' : ''}"
       ${t.id === activeId ? 'aria-current="page"' : ''}>
      ${icon(t.icon)}
      <span>${escapeHtml(t.title)}</span>
    </a>`).join('');
}

// ===================== Κινήσεις αλλαγής οθόνης =====================
// Σε ποια κατεύθυνση "γλιστράει" η νέα οθόνη:
//   ανάμεσα σε καρτέλες της κάτω μπάρας: δεξιά/αριστερά ανάλογα με τη θέση τους
//   πιο "βαθιά" (π.χ. Today -> XP, Settings -> Backup): έρχεται από δεξιά
//   πίσω (π.χ. Backup -> Settings): έρχεται από αριστερά

let previous = null; // { key, depth, tab }

function placeOf(id, mod, params) {
  const tabs = ['home', ...allModules().filter((m) => m.nav).map((m) => m.id)];
  const tab = tabs.indexOf(id);
  let depth;
  if (tab >= 0) depth = params.length; // καρτέλα (+ υπο-οθόνες της, π.χ. calendar/edit)
  else if (id === 'settings') depth = 1;
  else if (mod && mod.settings) depth = 2 + params.length;
  else depth = 1 + params.length;      // π.χ. XP, Weekly review από την Αρχική
  return { tab, depth };
}

function directionTo(next) {
  if (!previous) return 'none';
  if (previous.key === next.key) return 'none'; // απλή ανανέωση της ίδιας οθόνης
  if (next.depth > previous.depth) return 'forward';
  if (next.depth < previous.depth) return 'back';
  if (next.tab >= 0 && previous.tab >= 0) return next.tab > previous.tab ? 'right' : 'left';
  return 'fade';
}

const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// ===================== Αριθμοί που "μετράνε" =====================
// Κάθε στοιχείο με data-count="123" μετράει από την προηγούμενη τιμή που
// είδες (ή από 0 την πρώτη φορά) μέχρι τη νέα. data-count-key: ποιος αριθμός
// είναι (ώστε να θυμόμαστε την προηγούμενη τιμή του).
const lastCounts = new Map();

function animateCounts(root) {
  root.querySelectorAll('[data-count]').forEach((node) => {
    const to = Number(node.dataset.count);
    const key = node.dataset.countKey || node.textContent;
    const from = lastCounts.has(key) ? lastCounts.get(key) : 0;
    lastCounts.set(key, to);
    const show = (v) => { node.textContent = v < 0 ? `−${Math.abs(v)}` : String(v); };
    if (from === to || reduceMotion()) { show(to); return; }
    const t0 = performance.now();
    const dur = Math.min(900, 400 + Math.abs(to - from) * 4);
    const step = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      show(Math.round(from + (to - from) * (1 - (1 - p) ** 3)));
      if (p < 1) requestAnimationFrame(step);
    };
    show(from);
    requestAnimationFrame(step);
  });
}

// ===================== Η αλλαγή οθόνης =====================

function route() {
  // "#/calendar/edit/abc" -> id "calendar", params ["edit", "abc"]
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const id = parts[0] || 'home';
  const params = parts.slice(1);
  const builtin = id === 'home' || id === 'settings'; // οθόνες του ίδιου του router
  const mod = builtin ? null : getModule(id);

  // Αν η διεύθυνση δεν αντιστοιχεί σε οθόνη, πάμε στην Αρχική
  if (!builtin && !mod) { navigate('home'); return; }

  const place = { key: parts.join('/') || 'home', ...placeOf(id, mod, params) };
  const direction = directionTo(place);
  previous = place;

  // Όλη η "ζωγραφική" της νέας οθόνης
  const paint = () => {
    // Όταν φεύγουμε από ένα module (όχι απλώς αλλάζουμε υπο-οθόνη του),
    // του δίνουμε την ευκαιρία να καθαρίσει (π.χ. timers)
    if (current && current !== mod && current.unmount) {
      try { current.unmount(); } catch (err) { console.error(err); }
    }
    current = mod;

    const el = view();
    el.innerHTML = '';
    el.onclick = null; // καθαρίζουμε handlers της προηγούμενης οθόνης
    el.onchange = null;
    // Στην Αρχική ο τίτλος είναι η μέρα της εβδομάδας
    if (mod) {
      setTitle(mod.title);
    } else if (id === 'settings') {
      setTitle('Settings');
    } else {
      document.getElementById('page-title').textContent = new Date().toLocaleDateString('en-GB', { weekday: 'long' });
      document.title = 'Discipline';
    }

    // Γρανάζι ρυθμίσεων μόνο στην Αρχική, "‹ Settings" μόνο σε οθόνες των Ρυθμίσεων
    document.getElementById('settings-link').hidden = id !== 'home';
    document.getElementById('back-link').hidden = !(mod && mod.settings && !params.length);

    if (mod) {
      try { mod.render(el, params); } catch (err) {
        console.error(err);
        el.innerHTML = '<div class="placeholder"><p>This screen failed to load. Go back to Today and try again.</p></div>';
      }
    } else if (id === 'settings') {
      renderSettings(el);
    } else {
      renderHome(el);
    }

    renderTabbar(id);
    window.scrollTo(0, 0);

    // Οι γραμμές των λιστών μπαίνουν η μία μετά την άλλη (30ms διαφορά)
    el.querySelectorAll('.list > li').forEach((li, i) => li.style.setProperty('--i', Math.min(i, 10)));
    el.classList.toggle('stagger', direction !== 'none');
    animateCounts(el);
  };

  // Η κίνηση: με το View Transitions API (Safari 18+, Chrome) η παλιά και η νέα
  // οθόνη κινούνται μαζί. Σε παλιότερους browsers, μόνο η νέα μπαίνει με κίνηση.
  document.documentElement.dataset.nav = direction;
  if (direction !== 'none' && !reduceMotion() && document.startViewTransition) {
    document.startViewTransition(paint);
  } else {
    paint();
    if (direction !== 'none') {
      const el = view();
      el.classList.remove('enter');
      void el.offsetWidth; // "ανανέωση" διάταξης για να ξαναπαίξει η κίνηση
      el.classList.add('enter');
    }
  }
}

export function startRouter() {
  addEventListener('hashchange', route);
  route();
}

// Ξαναζωγραφίζει την τρέχουσα οθόνη (π.χ. όταν αλλάξουν δεδομένα)
export function refresh() {
  route();
}
