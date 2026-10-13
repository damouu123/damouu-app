// Εβδομαδιαίο resume — προς το παρόν μόνο καταχώρηση στο registry.
import { register } from '../core/registry.js';
import { placeholder } from '../core/router.js';

register({
  id: 'resume',
  title: 'Weekly review',
  icon: '<path d="M5 20v-8M12 20V5M19 20v-5"/>',
  order: 30,
  homeCard: () => ({ value: '', label: 'Attendance this week' }),
  render: (el) => placeholder(el, 'How this week went, compared with last week.'),
});
