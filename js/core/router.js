// Router: αποφασίζει ποια οθόνη φαίνεται, με βάση το κομμάτι της
// διεύθυνσης μετά το # (π.χ. index.html#/timer).
// Χρησιμοποιούμε # γιατί δουλεύει στο GitHub Pages χωρίς ρυθμίσεις server
// και δεν ξαναφορτώνει τη σελίδα.

import { allModules, getModule } from './registry.js';

const view = () => document.getElementById('view');
let current = null; // το module που φαίνεται τώρα

export function navigate(id) {
  location.hash = `#/${id}`;
}

export function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// Προσωρινή οθόνη για modules που δεν έχουν φτιαχτεί ακόμα
export function placeholder(el, text) {
  el.innerHTML = `
    <div class="card placeholder">
      <p class="muted">${escapeHtml(text)}</p>
      <p class="muted small">Έρχεται σε επόμενο βήμα.</p>
    </div>`;
}

function renderHome(el) {
  const today = new Date().toLocaleDateString('el-GR', {
    weekday: 'long', day: 'numeric', month: 'long',
  });

  const cards = allModules().map((m) => {
    let info = {};
    try { info = m.homeCard ? m.homeCard() || {} : {}; } catch (err) { console.error(m.id, err); }
    return `
      <button class="home-card" data-go="${escapeHtml(m.id)}">
        <span class="home-card-icon">${m.icon}</span>
        <span class="home-card-title">${escapeHtml(m.title)}</span>
        <span class="home-card-value">${escapeHtml(info.value ?? '—')}</span>
        <span class="home-card-label">${escapeHtml(info.label ?? '')}</span>
      </button>`;
  }).join('');

  el.innerHTML = `
    <p class="muted date-line">${escapeHtml(today)}</p>
    <div class="home-grid">${cards}</div>`;

  el.querySelectorAll('[data-go]').forEach((btn) => {
    btn.addEventListener('click', () => navigate(btn.dataset.go));
  });
}

function renderTabbar(activeId) {
  const tabs = [{ id: 'home', title: 'Αρχική', icon: '🏠' }, ...allModules().filter((m) => m.nav)];
  const bar = document.getElementById('tabbar');
  bar.innerHTML = tabs.map((t) => `
    <a href="#/${t.id}" class="tab ${t.id === activeId ? 'active' : ''}">
      <span class="tab-icon">${t.icon}</span>
      <span class="tab-label">${escapeHtml(t.title)}</span>
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
  document.getElementById('page-title').textContent = mod ? mod.title : 'Αρχική';
  document.title = mod ? `${mod.title} · Πειθαρχία` : 'Πειθαρχία';

  if (mod) {
    try { mod.render(el); } catch (err) {
      console.error(err);
      el.innerHTML = '<div class="card"><p>Κάτι πήγε στραβά σε αυτή την οθόνη.</p></div>';
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
