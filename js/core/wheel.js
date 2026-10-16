// Τροχός επιλογής σαν των ρολογιών του iPhone (ίδιος με του Focus).
//
// Κάθε τιμή είναι μια γραμμή ύψους ITEM_H. Με scroll-snap ο browser "κουμπώνει"
// τη γραμμή στο κέντρο, και το scrollTop μας λέει ποια είναι. Το κύλισμα με
// αδράνεια το κάνει το ίδιο το iPhone. Σε κάθε αλλαγή: "τικ" και μικρή δόνηση.
// Χρησιμοποιεί τις κλάσεις .wheel του css/style.css.
//
// mountWheel(root, { values, value, format, label, onChange }) -> { get() }

import { tick as wheelTick } from './feedback.js';
import { escapeHtml } from './router.js';

const ITEM_H = 52; // ίδιο με το --item στο CSS

export function mountWheel(root, { values, value, format = String, label = 'Value', onChange = () => {} }) {
  let index = Math.max(0, values.indexOf(value));
  root.innerHTML = `
    <div class="wheel" tabindex="0" role="slider" aria-label="${escapeHtml(label)}"
         aria-valuemin="0" aria-valuemax="${values.length - 1}">
      <div class="wheel-lens" aria-hidden="true"></div>
      <div class="wheel-scroll">
        <div class="wheel-pad"></div>
        ${values.map((v) => `<div class="wheel-item">${escapeHtml(format(v))}</div>`).join('')}
        <div class="wheel-pad"></div>
      </div>
    </div>`;
  const wheel = root.querySelector('.wheel');
  const scroller = root.querySelector('.wheel-scroll');
  const items = [...scroller.querySelectorAll('.wheel-item')];
  let frame = null;
  let centered = null;

  // Οι γραμμές κοντά στο κέντρο είναι μεγαλύτερες και πιο έντονες
  function paint() {
    const pos = scroller.scrollTop / ITEM_H;
    items.forEach((it, i) => {
      const d = Math.abs(i - pos);
      if (d > 4) { it.style.cssText = ''; return; }
      it.style.opacity = String(Math.max(0.18, 1 - d * 0.4));
      it.style.transform = `scale(${1 - Math.min(d, 2.5) * 0.09})`;
    });
    const now = Math.round(pos);
    if (centered !== null && now !== centered) wheelTick();
    centered = now;
  }

  function announce() {
    wheel.setAttribute('aria-valuenow', index);
    wheel.setAttribute('aria-valuetext', format(values[index]));
    onChange(values[index]);
  }

  scroller.addEventListener('scroll', () => {
    const i = Math.min(values.length - 1, Math.max(0, Math.round(scroller.scrollTop / ITEM_H)));
    if (i !== index) { index = i; announce(); }
    if (frame) return;
    frame = requestAnimationFrame(() => { frame = null; paint(); });
  }, { passive: true });

  // Πληκτρολόγιο: ↑/↓ μία θέση
  wheel.addEventListener('keydown', (e) => {
    const move = { ArrowUp: -1, ArrowDown: 1, PageUp: -6, PageDown: 6 }[e.key];
    if (!move) return;
    e.preventDefault();
    index = Math.min(values.length - 1, Math.max(0, index + move));
    scroller.scrollTo({ top: index * ITEM_H, behavior: 'smooth' });
    announce();
  });

  // Αρχική θέση (μόλις το στοιχείο έχει μέγεθος στην οθόνη)
  const place = () => { scroller.scrollTop = index * ITEM_H; paint(); };
  place();
  requestAnimationFrame(place);
  announce();

  return { get: () => values[index] };
}
