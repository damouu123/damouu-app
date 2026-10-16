// Πλαϊνό μενού (☰): ανοίγει από αριστερά με τις ενότητες του app
// (University, Fitness, Style: js/core/sections.js). Η καθεμία έχει δική της κάτω μπάρα.
//
// Κλείνει με: πάτημα έξω από το μενού, σύρσιμο προς τα αριστερά, Escape,
// ή επιλογή ενότητας.

import { icon, escapeHtml, getSection } from './router.js';
import { SECTIONS } from './sections.js';
import { haptic } from './feedback.js';

let backdrop = null;
let drawer = null;

function build() {
  backdrop = document.createElement('div');
  backdrop.className = 'drawer-backdrop';
  backdrop.hidden = true;
  backdrop.innerHTML = `
    <nav class="drawer" aria-label="Sections">
      <p class="drawer-title">Discipline</p>
      <div class="drawer-items">${SECTIONS.map((s, i) => `
        <a class="drawer-item" href="#/${s.home}" data-section="${s.id}" style="--i:${i}">
          <span class="drawer-icon">${icon(s.icon)}</span>
          <span class="drawer-label">${escapeHtml(s.title)}</span>
          <span class="drawer-chevron" aria-hidden="true">›</span>
        </a>`).join('')}
      </div>
    </nav>`;
  document.body.appendChild(backdrop);
  drawer = backdrop.querySelector('.drawer');

  // Πάτημα έξω από το μενού ή σε ενότητα: κλείνει
  backdrop.addEventListener('click', (ev) => {
    if (ev.target === backdrop || ev.target.closest('.drawer-item')) closeSidebar();
  });
  addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && isOpen()) closeSidebar(); });

  // Σύρσιμο προς τα αριστερά: το μενού ακολουθεί το δάχτυλο και κλείνει
  let startX = null;
  let dx = 0;
  drawer.addEventListener('pointerdown', (ev) => { startX = ev.clientX; dx = 0; });
  drawer.addEventListener('pointermove', (ev) => {
    if (startX === null) return;
    dx = Math.min(0, ev.clientX - startX);
    if (dx < -6) {
      drawer.style.transition = 'none';
      drawer.style.transform = `translateX(${dx}px)`;
    }
  });
  const release = () => {
    if (startX === null) return;
    startX = null;
    drawer.style.transition = '';
    drawer.style.transform = '';
    if (dx < -70) closeSidebar();
  };
  drawer.addEventListener('pointerup', release);
  drawer.addEventListener('pointercancel', release);
}

const isOpen = () => backdrop && backdrop.classList.contains('open');

export function openSidebar() {
  if (!backdrop) build();
  // Η τωρινή ενότητα φαίνεται επιλεγμένη
  const current = getSection();
  backdrop.querySelectorAll('.drawer-item').forEach((a) => a.classList.toggle('active', a.dataset.section === current));
  backdrop.hidden = false;
  document.body.classList.add('drawer-locked');
  void backdrop.offsetWidth; // ώστε να παίξει η κίνηση εισόδου
  backdrop.classList.add('open');
  haptic();
  backdrop.querySelector('.drawer-item')?.focus({ preventScroll: true });
}

export function closeSidebar() {
  if (!isOpen()) return;
  backdrop.classList.remove('open');
  document.body.classList.remove('drawer-locked');
  // Κρύβουμε το backdrop μόλις τελειώσει η κίνηση εξόδου
  setTimeout(() => { if (!isOpen()) backdrop.hidden = true; }, 380);
  document.getElementById('menu-btn')?.focus({ preventScroll: true });
}

export function initSidebar() {
  document.getElementById('menu-btn').addEventListener('click', openSidebar);
}
