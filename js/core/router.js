// Router: αποφασίζει ποια οθόνη φαίνεται, με βάση το κομμάτι της
// διεύθυνσης μετά το # (π.χ. index.html#/timer).
// Χρησιμοποιούμε # γιατί δουλεύει στο GitHub Pages χωρίς ρυθμίσεις server
// και δεν ξαναφορτώνει τη σελίδα.

import { allModules, getModule } from './registry.js';

const view = () => document.getElementById('view');
let current = null; // το module που φαίνεται τώρα

const HOME_ICON = '<path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z"/>';

export function navigate(id) {
  location.hash = `#/${id}`;
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
  const id = location.hash.replace(/^#\/?/, '') || 'home';
  const mod = id === 'home' ? null : getModule(id);

  // Αν η διεύθυνση δεν αντιστοιχεί σε module, πάμε στην Αρχική
  if (id !== 'home' && !mod) { navigate('home'); return; }

  // Δίνουμε στο προηγούμενο module την ευκαιρία να καθαρίσει (π.χ. timers)
  if (current && current.unmount) {
    try { current.unmount(); } catch (err) { console.error(err); }
  }
  current = mod;

  const el = view();
  el.innerHTML = '';
  // Στην Αρχική ο τίτλος είναι η μέρα της εβδομάδας
  const heading = mod ? mod.title : new Date().toLocaleDateString('en-GB', { weekday: 'long' });
  document.getElementById('page-title').textContent = heading;
  document.title = mod ? `${mod.title} – Discipline` : 'Discipline';

  if (mod) {
    try { mod.render(el); } catch (err) {
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
