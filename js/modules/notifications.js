// Ειδοποιήσεις — προς το παρόν μόνο καταχώρηση στο registry.
import { register } from '../core/registry.js';
import { placeholder } from '../core/router.js';

register({
  id: 'notifications',
  title: 'Reminders',
  icon: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0"/>',
  order: 60,
  homeCard: () => ({ value: '', label: 'Before lectures and on breaks' }),
  render: (el) => placeholder(el, 'Reminders before lectures and on free gaps.'),
});
