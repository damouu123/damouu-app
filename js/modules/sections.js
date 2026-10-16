// Οι μεγάλες ενότητες του app, στο πλαϊνό μενού (☰): University, Fitness, Style.
// Προς το παρόν είναι άδειες: θα γεμίσουν στη συνέχεια.

import { register } from '../core/registry.js';
import { icon } from '../core/router.js';

const SECTIONS = [
  {
    id: 'university',
    title: 'University',
    icon: '<path d="M2.5 9 12 4.5 21.5 9 12 13.5z"/><path d="M6.5 11v4.5c0 1.5 2.5 3 5.5 3s5.5-1.5 5.5-3V11M21.5 9v5"/>',
  },
  {
    id: 'fitness',
    title: 'Fitness',
    icon: '<path d="M3 9.5v5M6 7v10M18 7v10M21 9.5v5M6 12h12"/>',
  },
  {
    id: 'style',
    title: 'Style',
    icon: '<path d="M12 6.5a2 2 0 1 1 2-2M12 6.5 3 13.5a1.5 1.5 0 0 0 1 2.7h16a1.5 1.5 0 0 0 1-2.7z"/>',
  },
];

SECTIONS.forEach((s, i) => register({
  ...s,
  order: 80 + i,
  home: false,  // όχι στη λίστα της Αρχικής
  sidebar: true, // στο πλαϊνό μενού
  render(el) {
    el.innerHTML = `
      <div class="section-empty">
        <span class="section-empty-icon">${icon(s.icon)}</span>
        <p class="muted">Nothing here yet.</p>
      </div>`;
  },
}));
