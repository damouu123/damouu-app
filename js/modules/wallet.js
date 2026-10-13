// Πορτοφόλι χρόνου — προς το παρόν καταχώρηση στο registry
// και η κορυφή της Αρχικής (υπόλοιπο λεπτών).
import { register } from '../core/registry.js';
import { placeholder, navigate } from '../core/router.js';
import { getSessions } from './timer.js';

register({
  id: 'wallet',
  title: 'Wallet',
  icon: '<path d="M7 3h10M7 21h10M8 3c0 4 4 5.5 4 9s-4 5-4 9M16 3c0 4-4 5.5-4 9s4 5 4 9"/>',
  order: 50,
  nav: true,
  // Η κορυφή της Αρχικής: πόσα λεπτά scroll έχεις κερδίσει
  renderHomeHero(el) {
    // Προσωρινά: ό,τι κέρδισες από timers. Στο βήμα του πορτοφολιού
    // θα αφαιρούνται και τα λεπτά που ξόδεψες.
    const balance = getSessions().reduce((sum, s) => sum + s.earned, 0);
    el.innerHTML = `
      <p class="hero-label">Scroll time earned</p>
      <p class="hero-number"><strong>${balance}</strong><span>min</span></p>
      <p class="hero-hint">Finish a focus session to earn minutes.</p>
      <button class="btn btn-block" id="hero-start">Start a focus session</button>`;
    el.querySelector('#hero-start').addEventListener('click', () => navigate('timer'));
  },
  render: (el) => placeholder(el, 'Minutes you earned, and where you spent them.'),
});
