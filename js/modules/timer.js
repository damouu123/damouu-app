// Timer εστίασης — προς το παρόν μόνο καταχώρηση στο registry.
import { register } from '../core/registry.js';
import { placeholder } from '../core/router.js';

register({
  id: 'timer',
  title: 'Εστίαση',
  icon: '⏱️',
  order: 40,
  nav: true,
  homeCard: () => ({ value: '—', label: 'Ξεκίνα συνεδρία' }),
  render: (el) => placeholder(el, 'Timer για διάβασμα, βιβλίο ή άσκηση.'),
});
