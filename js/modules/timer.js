// Timer εστίασης — προς το παρόν μόνο καταχώρηση στο registry.
import { register } from '../core/registry.js';
import { placeholder } from '../core/router.js';

register({
  id: 'timer',
  title: 'Focus',
  icon: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 9.5v4l2.5 2M9.5 2.5h5"/>',
  order: 40,
  nav: true,
  homeCard: () => ({ value: '', label: 'Study, read or work out' }),
  render: (el) => placeholder(el, 'A locked timer for studying, reading or working out.'),
});
