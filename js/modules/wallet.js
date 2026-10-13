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
    // Προσωρινά: ό,τι κέρδισες από timers μείον τις ποινές. Στο βήμα του
    // πορτοφολιού θα αφαιρούνται και τα λεπτά που ξόδεψες.
    // Μπορεί να βγει αρνητικό: χρωστάς λεπτά.
    const balance = getSessions().reduce((sum, s) => sum + s.earned - (s.penalty || 0), 0);
    el.innerHTML = `
      <p class="hero-label">Scroll time</p>
      <p class="hero-number ${balance < 0 ? 'is-negative' : ''}">
        <strong>${balance < 0 ? `−${-balance}` : balance}</strong><span>min</span></p>
      <p class="hero-hint">${balance < 0
        ? `You owe ${-balance} min. Finish a focus session to win them back.`
        : 'Finish a focus session to earn minutes.'}</p>
      <button class="btn btn-block" id="hero-start">Start a focus session</button>`;
    el.querySelector('#hero-start').addEventListener('click', () => navigate('timer'));
  },
  render: (el) => placeholder(el, 'Minutes you earned, and where you spent them.'),
});
