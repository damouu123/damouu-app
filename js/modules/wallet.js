// Πορτοφόλι χρόνου — προς το παρόν μόνο καταχώρηση στο registry.
import { register } from '../core/registry.js';
import { placeholder } from '../core/router.js';

register({
  id: 'wallet',
  title: 'Πορτοφόλι',
  icon: '⏳',
  order: 50,
  nav: true,
  homeCard: () => ({ value: '0′', label: 'Λεπτά scroll' }),
  render: (el) => placeholder(el, 'Λεπτά scroll που κέρδισες και πού τα ξόδεψες.'),
});
