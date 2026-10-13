// XP πανεπιστημίου — προς το παρόν μόνο καταχώρηση στο registry.
import { register } from '../core/registry.js';
import { placeholder } from '../core/router.js';

register({
  id: 'xp',
  title: 'XP',
  icon: '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>',
  order: 20,
  homeCard: () => ({ value: '', label: 'Level and streak' }),
  render: (el) => placeholder(el, 'Points for attending lectures, levels and your streak.'),
});
