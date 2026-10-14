// Ημερήσιος στόχος: σε μια μέρα με μαθήματα, πήγαινε σε όλα (ή φύγε νωρίς)
// και κάνε λιγότερο από 30' scroll. Δίνει +20 XP, μία φορά τη μέρα.
//
// Δεν αποθηκεύει τίποτα: τον υπολογίζει το xp.js από τις παρουσίες
// και τις καταγραφές scroll. Εδώ μόνο τον δείχνουμε.

import { register } from '../core/registry.js';
import { escapeHtml } from '../core/router.js';
import { dailyGoal, GOAL_BONUS, GOAL_SCROLL_LIMIT } from './xp.js';
import { startOfDay, addDays, weekStart } from './calendar.js';

function row(title, sub, value, cls = '') {
  return `
    <li><div class="row row-static">
      <span class="row-text"><span class="row-title">${title}</span><span class="row-sub">${sub}</span></span>
      <span class="row-value small-value ${cls}">${value}</span>
    </div></li>`;
}

function render(el) {
  const today = startOfDay(new Date());
  const g = dailyGoal(today);

  let status;
  if (!g.classes) status = 'No classes today, so no goal. Enjoy the day.';
  else if (g.met) status = `Goal reached: +${GOAL_BONUS} XP. Stay under ${GOAL_SCROLL_LIMIT} min of scroll to keep it.`;
  else status = `Go to every class and scroll less than ${GOAL_SCROLL_LIMIT} min for +${GOAL_BONUS} XP.`;

  // Η εβδομάδα με μια κουκκίδα ανά μέρα
  const ws = weekStart(today);
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(ws, i);
    const dg = dailyGoal(d);
    const state = !dg.classes ? 'none' : d > today ? 'future' : dg.met ? 'met' : d < today ? 'missed' : 'open';
    const label = d.toLocaleDateString('en-GB', { weekday: 'short' });
    const text = { none: 'no classes', future: 'coming up', met: 'goal reached', missed: 'goal missed', open: 'in progress' }[state];
    return `<div class="gday ${state}" role="img" aria-label="${label}, ${text}"><i></i><span>${label}</span></div>`;
  }).join('');
  const metThisWeek = Array.from({ length: 7 }, (_, i) => addDays(ws, i)).filter((d) => d <= today && dailyGoal(d).met).length;

  el.innerHTML = `
    <p class="muted intro first-intro">${escapeHtml(status)}</p>

    ${g.classes ? `
      <ul class="list goal-list">
        ${row('Classes', 'Went or left early', `${g.done} of ${g.classes}`, g.done === g.classes ? 'good' : '')}
        ${row('Scroll', `Less than ${GOAL_SCROLL_LIMIT} min`, `${g.scroll} min`, g.scroll >= GOAL_SCROLL_LIMIT ? 'is-low' : 'good')}
      </ul>` : ''}

    <h2 class="section-title">This week</h2>
    <div class="goal-week">${week}</div>
    <p class="muted small-print">${metThisWeek} ${metThisWeek === 1 ? 'goal' : 'goals'} reached this week.</p>`;
}

register({
  id: 'goal',
  title: "Today's goal",
  icon: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',
  order: 15, // στην Αρχική, ανάμεσα στο Schedule και στο XP
  homeCard() {
    const g = dailyGoal(new Date());
    if (!g.classes) return { value: '', label: 'No classes today' };
    if (g.met) return { value: `+${GOAL_BONUS}`, label: `Reached. Scroll ${g.scroll} of ${GOAL_SCROLL_LIMIT} min` };
    return { value: `${g.done}/${g.classes}`, label: `Classes. Scroll ${g.scroll} of ${GOAL_SCROLL_LIMIT} min` };
  },
  render,
});
