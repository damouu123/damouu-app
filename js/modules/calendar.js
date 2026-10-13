// Calendar διαλέξεων — προς το παρόν μόνο καταχώρηση στο registry.
import { register } from '../core/registry.js';
import { placeholder } from '../core/router.js';

register({
  id: 'calendar',
  title: 'Schedule',
  icon: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  order: 10,
  nav: true,
  homeCard: () => ({ value: '', label: 'Next lecture' }),
  render: (el) => placeholder(el, 'Your weekly lectures and attendance.'),
});
