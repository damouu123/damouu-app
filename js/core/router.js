// Router: αποφασίζει ποια οθόνη φαίνεται, με βάση το κομμάτι της
// διεύθυνσης μετά το # (π.χ. index.html#/timer).
// Χρησιμοποιούμε # γιατί δουλεύει στο GitHub Pages χωρίς ρυθμίσεις server
// και δεν ξαναφορτώνει τη σελίδα.

import { allModules, getModule } from './registry.js';

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

// Σύντομο μήνυμα κάτω από την οθόνη που σβήνει μόνο του (π.χ. "+10 XP")
let toastTimer = null;
export function toast(text) {
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
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
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

function renderHome(el) {
  const now = new Date();
  const date = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
  const mods = allModules();

  // Ένα module μπορεί να "πάρει" την κορυφή της Αρχικής (το πορτοφόλι)
  const heroMod = mods.find((m) => m.renderHomeHero);
  const listMods = mods.filter((m) => m !== heroMod);

  const rows = listMods.map((m) => {
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
  }).join('');

  el.innerHTML = `
    <p class="subhead">${escapeHtml(date)}, week ${isoWeek(now)}</p>
    <section class="hero" id="home-hero"></section>
    <h2 class="section-title">Overview</h2>
    <ul class="list">${rows}</ul>`;

  if (heroMod) {
    try { heroMod.renderHomeHero(el.querySelector('#home-hero')); } catch (err) { console.error(err); }
  }

  el.querySelectorAll('[data-go]').forEach((btn) => {
    btn.addEventListener('click', () => navigate(btn.dataset.go));
  });
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

function route() {
  // "#/calendar/edit/abc" -> id "calendar", params ["edit", "abc"]
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);
  const id = parts[0] || 'home';
  const params = parts.slice(1);
  const mod = id === 'home' ? null : getModule(id);

  // Αν η διεύθυνση δεν αντιστοιχεί σε module, πάμε στην Αρχική
  if (id !== 'home' && !mod) { navigate('home'); return; }

  // Όταν φεύγουμε από ένα module (όχι απλώς αλλάζουμε υπο-οθόνη του),
  // του δίνουμε την ευκαιρία να καθαρίσει (π.χ. timers)
  if (current && current !== mod && current.unmount) {
    try { current.unmount(); } catch (err) { console.error(err); }
  }
  current = mod;

  const el = view();
  el.innerHTML = '';
  el.onclick = null; // καθαρίζουμε click handlers της προηγούμενης οθόνης
  // Στην Αρχική ο τίτλος είναι η μέρα της εβδομάδας
  if (mod) {
    setTitle(mod.title);
  } else {
    document.getElementById('page-title').textContent = new Date().toLocaleDateString('en-GB', { weekday: 'long' });
    document.title = 'Discipline';
  }

  if (mod) {
    try { mod.render(el, params); } catch (err) {
      console.error(err);
      el.innerHTML = '<div class="placeholder"><p>This screen failed to load. Go back to Today and try again.</p></div>';
    }
  } else {
    renderHome(el);
  }

  renderTabbar(id);
  window.scrollTo(0, 0);
}

export function startRouter() {
  addEventListener('hashchange', route);
  route();
}

// Ξαναζωγραφίζει την τρέχουσα οθόνη (π.χ. όταν αλλάξουν δεδομένα)
export function refresh() {
  route();
}
