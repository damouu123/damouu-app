// XP πανεπιστημίου — προς το παρόν μόνο καταχώρηση στο registry.
import { register } from '../core/registry.js';
import { placeholder } from '../core/router.js';

register({
  id: 'xp',
  title: 'XP',
  icon: '⭐',
  order: 20,
  homeCard: () => ({ value: '—', label: 'Level & streak' }),
  render: (el) => placeholder(el, 'Πόντοι παρουσίας, levels και streak.'),
});
