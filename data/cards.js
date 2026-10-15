// Οι κάρτες της συλλογής, σε "σετ" (θέματα).
//
// Κάθε σετ: id, name, short, icon, colors (για το pack του), statNames (τα 6 stats
// της κάρτας), roles και cards.
// Κάθε κάρτα: id (δεν αλλάζει ποτέ: σε αυτό "δένεται" η συλλογή σου), name, title
// (προσωνύμιο), role, origin, rating, και προαιρετικά:
//   icon  ένα όνομα από το data/icons.js (αλλιώς το προεπιλεγμένο του ρόλου)
//   num   αριθμός φανέλας (στις ποδοσφαιρικές κάρτες φαίνεται αντί για εικονίδιο)
//
// ΣΗΜΕΙΩΣΗ: οι χαρακτήρες και τα πρόσωπα εδώ είναι μόνο ονόματα. Τα ratings και τα
// stats είναι δικά μας ("fan ratings"), όχι επίσημα. Δεν χρησιμοποιούνται
// φωτογραφίες, λογότυπα ή καρέ από ταινίες.
//
// Για νέο σετ: πρόσθεσε ένα αντικείμενο στο SETS με νέα id.

import { iconPaths } from './icons.js';

// Σπανιότητες, από τη χαμηλότερη στην υψηλότερη
export const RARITIES = ['bronze', 'silver', 'gold', 'hero', 'icon'];
export const RARITY_NAMES = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold', hero: 'Hero', icon: 'Icon' };

export function rarityOf(rating) {
  if (rating >= 90) return 'icon';
  if (rating >= 85) return 'hero';
  if (rating >= 75) return 'gold';
  if (rating >= 65) return 'silver';
  return 'bronze';
}

// Ρόλος: { name, icon, mods } όπου mods = πόσο αλλάζει κάθε stat σε σχέση με το rating
// (με τη σειρά των statNames του σετ)

export const SETS = [
  // ====================================================================
  {
    id: 'dexter',
    name: 'Dexter',
    short: 'Dexter',
    icon: 'drop',
    colors: ['#E11D48', '#3B0A18'],
    statNames: ['CUN', 'FOR', 'COM', 'NRV', 'CHM', 'RUT'],
    roles: {
      KIL: { name: 'The Dark Passenger', icon: 'knife', mods: [8, 4, 4, 8, 2, 10] },
      DET: { name: 'Detective', icon: 'badge', mods: [4, -2, 2, 6, 0, 0] },
      FOR: { name: 'Forensics', icon: 'flask', mods: [-2, 10, -2, -2, -4, -8] },
      FAM: { name: 'Family', icon: 'heart', mods: [-14, -20, -4, -10, 10, -20] },
      STF: { name: 'Miami Metro', icon: 'magnifier', mods: [-4, 2, -4, -8, -6, -12] },
    },
    cards: [
      { id: 'dx-dexter', name: 'Dexter Morgan', title: 'Blood Spatter Analyst', role: 'KIL', origin: 'Miami', rating: 94, icon: 'drop' },
      { id: 'dx-trinity', name: 'Arthur Mitchell', title: 'The Trinity Killer', role: 'KIL', origin: 'Florida', rating: 90, icon: 'knife' },
      { id: 'dx-debra', name: 'Debra Morgan', title: 'Sergeant', role: 'DET', origin: 'Miami', rating: 88, icon: 'badge' },
      { id: 'dx-brian', name: 'Brian Moser', title: 'The Ice Truck Killer', role: 'KIL', origin: 'Miami', rating: 86, icon: 'knife' },
      { id: 'dx-harry', name: 'Harry Morgan', title: 'The Code', role: 'DET', origin: 'Miami', rating: 85, icon: 'scroll' },
      { id: 'dx-doakes', name: 'James Doakes', title: 'Sergeant', role: 'DET', origin: 'Miami', rating: 82, icon: 'badge' },
      { id: 'dx-prado', name: 'Miguel Prado', title: 'Assistant DA', role: 'KIL', origin: 'Miami', rating: 78, icon: 'scroll' },
      { id: 'dx-batista', name: 'Angel Batista', title: 'Detective', role: 'DET', origin: 'Miami', rating: 77, icon: 'badge' },
      { id: 'dx-laguerta', name: 'Maria LaGuerta', title: 'Lieutenant', role: 'DET', origin: 'Miami', rating: 76, icon: 'badge' },
      { id: 'dx-hannah', name: 'Hannah McKay', title: 'The Botanist', role: 'KIL', origin: 'Florida', rating: 75, icon: 'leaf' },
      { id: 'dx-masuka', name: 'Vince Masuka', title: 'Forensic Tech', role: 'FOR', origin: 'Miami', rating: 74, icon: 'flask' },
      { id: 'dx-lumen', name: 'Lumen Pierce', title: 'Survivor', role: 'FAM', origin: 'Florida', rating: 73, icon: 'heart' },
      { id: 'dx-quinn', name: 'Joey Quinn', title: 'Detective', role: 'DET', origin: 'Miami', rating: 71, icon: 'magnifier' },
      { id: 'dx-rita', name: 'Rita Bennett', title: 'Wife and Mother', role: 'FAM', origin: 'Miami', rating: 69, icon: 'heart' },
      { id: 'dx-patrol', name: 'Patrol Officer', title: 'Miami Metro', role: 'STF', origin: 'Miami', rating: 58 },
      { id: 'dx-tech', name: 'Crime Scene Tech', title: 'Miami Metro', role: 'STF', origin: 'Miami', rating: 56, icon: 'flask' },
      { id: 'dx-intern', name: 'Lab Intern', title: 'Miami Metro', role: 'STF', origin: 'Miami', rating: 55, icon: 'flask' },
    ],
  },
];

// Όλες οι κάρτες μαζί, με το id του σετ τους
export const CARDS = SETS.flatMap((s) => s.cards.map((c) => ({ ...c, set: s.id })));

export const setById = (id) => SETS.find((s) => s.id === id);
export const setOf = (card) => setById(card.set);
export const cardById = (id) => CARDS.find((c) => c.id === id);
export const roleOf = (card) => setOf(card).roles[card.role];
export const statNamesOf = (card) => setOf(card).statNames;

// Τι δείχνουμε στην κάρτα στη θέση της φωτογραφίας:
// αριθμός φανέλας αν υπάρχει, αλλιώς το εικονίδιο του χαρακτήρα ή του ρόλου
export function emblemOf(card) {
  if (card.num) return { num: card.num };
  return { paths: iconPaths(card.icon || roleOf(card).icon) };
}

// "Τυχαίο" αλλά σταθερό νούμερο από -3 έως +3 για κάθε κάρτα και stat,
// ώστε δύο κάρτες με ίδιο rating και ρόλο να μην έχουν ίδια stats.
function jitter(id, i) {
  let h = 2166136261;
  for (const ch of `${id}:${i}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return ((h >>> 0) % 7) - 3;
}

// Τα 6 stats μιας κάρτας: { ATK: 91, DEF: 80, ... } (όνομα στατ ανάλογα με το σετ)
export function statsOf(card) {
  const role = roleOf(card);
  return Object.fromEntries(statNamesOf(card).map((s, i) => [
    s, Math.max(20, Math.min(99, card.rating + role.mods[i] + jitter(card.id, i))),
  ]));
}
