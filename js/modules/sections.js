// Οι αρχικές σελίδες των ενοτήτων Fitness και Style (js/core/sections.js).
// Προς το παρόν είναι άδειες: θα γεμίσουν, και θα αποκτήσουν δικές τους
// καρτέλες, στη συνέχεια. (Το University είναι όλο το υπόλοιπο app.)

import { register } from '../core/registry.js';
import { icon } from '../core/router.js';
import { SECTIONS } from '../core/sections.js';

SECTIONS.filter((s) => s.id !== 'university').forEach((s, i) => register({
  id: s.home,
  title: s.title,
  icon: s.icon,
  order: 80 + i,
  section: s.id,
  sectionHome: true, // η πρώτη καρτέλα της ενότητας
  home: false,       // όχι στη λίστα της Αρχικής του University
  render(el) {
    el.innerHTML = `
      <div class="section-empty">
        <span class="section-empty-icon">${icon(s.icon)}</span>
        <p class="muted">Nothing here yet.</p>
      </div>`;
  },
}));
