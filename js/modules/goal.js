// Ημερήσιος στόχος: πήγαινε σε όλα τα μαθήματα της μέρας (ή φύγε νωρίς)
// και κάνε τουλάχιστον 30' focus. Τις μέρες χωρίς μάθημα αρκεί το focus.
// Δίνει +20 XP και ένα δωρεάν Bronze pack.
//
// Δεν αποθηκεύει τίποτα: τον υπολογίζει το xp.js από τις παρουσίες
// και τις συνεδρίες focus. Εδώ μόνο τον δείχνουμε.

import { register } from '../core/registry.js';
import { escapeHtml } from '../core/router.js';
import { dailyGoal, GOAL_BONUS, GOAL_FOCUS_MIN } from './xp.js';
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

  const status = g.met
    ? `Goal reached: +${GOAL_BONUS} XP and a free Bronze pack.`
    : g.classes
      ? `Go to every class and focus ${GOAL_FOCUS_MIN} min for +${GOAL_BONUS} XP and a free pack.`
      : `No classes today. Focus ${GOAL_FOCUS_MIN} min for +${GOAL_BONUS} XP and a free pack.`;

  // Η εβδομάδα με μια κουκκίδα ανά μέρα
  const ws = weekStart(today);
  const week = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(ws, i);
    const dg = dailyGoal(d);
    const state = d > today ? 'future' : dg.met ? 'met' : d < today ? 'missed' : 'open';
    const label = d.toLocaleDateString('en-GB', { weekday: 'short' });
    const text = { future: 'coming up', met: 'goal reached', missed: 'goal missed', open: 'in progress' }[state];
    return `<div class="gday ${state}" role="img" aria-label="${label}, ${text}"><i></i><span>${label}</span></div>`;
  }).join('');
  const metThisWeek = Array.from({ length: 7 }, (_, i) => addDays(ws, i)).filter((d) => d <= today && dailyGoal(d).met).length;

  el.innerHTML = `
    <p class="muted intro first-intro">${escapeHtml(status)}</p>

    <ul class="list goal-list">
      ${g.classes ? row('Classes', 'Went or left early', `${g.done} of ${g.classes}`, g.done === g.classes ? 'good' : '') : ''}
      ${row('Focus', `At least ${GOAL_FOCUS_MIN} min`, `${g.focus} min`, g.focus >= GOAL_FOCUS_MIN ? 'good' : '')}
    </ul>

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
    if (g.met) return { value: `+${GOAL_BONUS}`, label: 'Reached. Free pack waiting' };
    const parts = [g.classes ? `${g.done}/${g.classes} classes` : null, `${g.focus}/${GOAL_FOCUS_MIN} min focus`].filter(Boolean);
    return { value: '', label: parts.join(', ') };
  },
  render,
});
