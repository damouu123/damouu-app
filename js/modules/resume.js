// Εβδομαδιαίο resume — προς το παρόν μόνο καταχώρηση στο registry.
import { register } from '../core/registry.js';
import { placeholder } from '../core/router.js';

register({
  id: 'resume',
  title: 'Εβδομάδα',
  icon: '📊',
  order: 30,
  homeCard: () => ({ value: '—', label: 'Ποσοστό παρουσίας' }),
  render: (el) => placeholder(el, 'Σύνοψη εβδομάδας και σύγκριση με την προηγούμενη.'),
});
