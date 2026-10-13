// Ειδοποιήσεις — προς το παρόν μόνο καταχώρηση στο registry.
import { register } from '../core/registry.js';
import { placeholder } from '../core/router.js';

register({
  id: 'notifications',
  title: 'Ειδοποιήσεις',
  icon: '🔔',
  order: 60,
  homeCard: () => ({ value: '—', label: 'Υπενθυμίσεις' }),
  render: (el) => placeholder(el, 'Υπενθυμίσεις πριν από διαλέξεις και για κενά.'),
});
