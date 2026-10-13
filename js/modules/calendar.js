// Calendar διαλέξεων — προς το παρόν μόνο καταχώρηση στο registry.
import { register } from '../core/registry.js';
import { placeholder } from '../core/router.js';

register({
  id: 'calendar',
  title: 'Πρόγραμμα',
  icon: '📅',
  order: 10,
  nav: true,
  homeCard: () => ({ value: '—', label: 'Επόμενη διάλεξη' }),
  render: (el) => placeholder(el, 'Εβδομαδιαίο πρόγραμμα διαλέξεων και παρουσίες.'),
});
