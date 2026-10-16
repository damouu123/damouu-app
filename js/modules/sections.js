// "Άδεια" αρχική σελίδα για όποια ενότητα δεν έχει ακόμα δική της (π.χ. Style).
// (Το University είναι όλο το υπόλοιπο app, το Fitness έχει το workout.js.)

import { register, getModule } from '../core/registry.js';
import { icon } from '../core/router.js';
import { SECTIONS } from '../core/sections.js';

// Μόνο για ενότητες που δεν έχουν ακόμα δική τους αρχική σελίδα (το Fitness έχει το Workout)
SECTIONS.filter((s) => s.id !== 'university' && !getModule(s.home)).forEach((s, i) => register({
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
