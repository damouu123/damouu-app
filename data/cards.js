// Οι κάρτες της συλλογής. Σετ 1: "Θρύλοι της Αρχαιότητας".
//
// Κάθε κάρτα: id (δεν αλλάζει ποτέ: σε αυτό "δένεται" η συλλογή σου),
// name, title (προσωνύμιο), role, origin (καταγωγή), rating.
// Η σπανιότητα βγαίνει από το rating και τα 6 stats από rating + ρόλο.
//
// Για νέο σετ (π.χ. δικό σου), πρόσθεσε κάρτες με νέα id στο CARDS.

export const SET_NAME = 'Legends of Antiquity';

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

// Ρόλοι (σαν τις θέσεις στο FIFA) και πώς επηρεάζουν τα stats
export const ROLES = {
  WAR: { name: 'Warrior', stats: { ATK: 6, DEF: 2, STR: 5, INT: -8, LEA: -2, SPD: 3 } },
  HER: { name: 'Hero', stats: { ATK: 7, DEF: 1, STR: 8, INT: -3, LEA: -1, SPD: 6 } },
  KNG: { name: 'King', stats: { ATK: -2, DEF: 1, STR: -1, INT: 3, LEA: 8, SPD: -4 } },
  GEN: { name: 'General', stats: { ATK: -1, DEF: 3, STR: -3, INT: 7, LEA: 6, SPD: -2 } },
  SAG: { name: 'Sage', stats: { ATK: -22, DEF: -15, STR: -18, INT: 9, LEA: 1, SPD: -10 } },
  SOL: { name: 'Soldier', stats: { ATK: 2, DEF: 5, STR: 3, INT: -10, LEA: -6, SPD: 1 } },
};
export const STAT_NAMES = ['ATK', 'DEF', 'STR', 'INT', 'LEA', 'SPD'];

export const CARDS = [
  // ----- Icons (90+) -----
  { id: 'heracles', name: 'Heracles', title: 'The Twelve Labours', role: 'HER', origin: 'Thebes', rating: 96 },
  { id: 'alexander', name: 'Alexander', title: 'The Undefeated', role: 'GEN', origin: 'Macedon', rating: 97 },
  { id: 'achilles', name: 'Achilles', title: 'Son of Thetis', role: 'WAR', origin: 'Phthia', rating: 95 },
  { id: 'leonidas', name: 'Leonidas', title: 'King of Sparta', role: 'KNG', origin: 'Sparta', rating: 93 },
  // ----- Hero (85-89) -----
  { id: 'hector', name: 'Hector', title: 'Breaker of Horses', role: 'WAR', origin: 'Troy', rating: 89 },
  { id: 'odysseus', name: 'Odysseus', title: 'The Cunning', role: 'GEN', origin: 'Ithaca', rating: 88 },
  { id: 'aristotle', name: 'Aristotle', title: 'The Philosopher', role: 'SAG', origin: 'Stagira', rating: 88 },
  { id: 'archimedes', name: 'Archimedes', title: 'Eureka', role: 'SAG', origin: 'Syracuse', rating: 87 },
  { id: 'theseus', name: 'Theseus', title: 'Slayer of the Minotaur', role: 'HER', origin: 'Athens', rating: 87 },
  { id: 'socrates', name: 'Socrates', title: 'Know Thyself', role: 'SAG', origin: 'Athens', rating: 86 },
  { id: 'themistocles', name: 'Themistocles', title: 'Victor of Salamis', role: 'GEN', origin: 'Athens', rating: 86 },
  { id: 'perseus', name: 'Perseus', title: 'Slayer of Medusa', role: 'HER', origin: 'Argos', rating: 85 },
  // ----- Gold (75-84) -----
  { id: 'ajax', name: 'Ajax', title: 'The Great', role: 'WAR', origin: 'Salamis', rating: 84 },
  { id: 'plato', name: 'Plato', title: 'The Academy', role: 'SAG', origin: 'Athens', rating: 84 },
  { id: 'diomedes', name: 'Diomedes', title: 'Wounder of Gods', role: 'WAR', origin: 'Argos', rating: 83 },
  { id: 'epaminondas', name: 'Epaminondas', title: 'Victor of Leuctra', role: 'GEN', origin: 'Thebes', rating: 83 },
  { id: 'pythagoras', name: 'Pythagoras', title: 'All Is Number', role: 'SAG', origin: 'Samos', rating: 82 },
  { id: 'pericles', name: 'Pericles', title: 'First Citizen', role: 'KNG', origin: 'Athens', rating: 81 },
  { id: 'hypatia', name: 'Hypatia', title: 'The Astronomer', role: 'SAG', origin: 'Alexandria', rating: 81 },
  { id: 'atalanta', name: 'Atalanta', title: 'The Huntress', role: 'HER', origin: 'Arcadia', rating: 80 },
  { id: 'agamemnon', name: 'Agamemnon', title: 'Lord of Men', role: 'KNG', origin: 'Mycenae', rating: 80 },
  { id: 'jason', name: 'Jason', title: 'The Argonaut', role: 'HER', origin: 'Iolcus', rating: 79 },
  { id: 'euclid', name: 'Euclid', title: 'The Elements', role: 'SAG', origin: 'Alexandria', rating: 79 },
  { id: 'miltiades', name: 'Miltiades', title: 'Victor of Marathon', role: 'GEN', origin: 'Athens', rating: 78 },
  { id: 'pyrrhus', name: 'Pyrrhus', title: 'Costly Victory', role: 'GEN', origin: 'Epirus', rating: 77 },
  { id: 'hippocrates', name: 'Hippocrates', title: 'The Physician', role: 'SAG', origin: 'Kos', rating: 76 },
  // ----- Silver (65-74) -----
  { id: 'patroclus', name: 'Patroclus', title: 'Friend of Achilles', role: 'WAR', origin: 'Phthia', rating: 74 },
  { id: 'aeneas', name: 'Aeneas', title: 'The Survivor', role: 'WAR', origin: 'Troy', rating: 73 },
  { id: 'menelaus', name: 'Menelaus', title: 'Husband of Helen', role: 'KNG', origin: 'Sparta', rating: 72 },
  { id: 'thucydides', name: 'Thucydides', title: 'The Historian', role: 'SAG', origin: 'Athens', rating: 72 },
  { id: 'herodotus', name: 'Herodotus', title: 'Father of History', role: 'SAG', origin: 'Halicarnassus', rating: 71 },
  { id: 'nestor', name: 'Nestor', title: 'The Wise Elder', role: 'KNG', origin: 'Pylos', rating: 70 },
  { id: 'sappho', name: 'Sappho', title: 'The Tenth Muse', role: 'SAG', origin: 'Lesbos', rating: 69 },
  { id: 'paris', name: 'Paris', title: 'The Archer Prince', role: 'WAR', origin: 'Troy', rating: 68 },
  { id: 'priam', name: 'Priam', title: 'King of Troy', role: 'KNG', origin: 'Troy', rating: 67 },
  { id: 'aesop', name: 'Aesop', title: 'The Storyteller', role: 'SAG', origin: 'Phrygia', rating: 66 },
  // ----- Bronze (55-64): μονάδες στρατού -----
  { id: 'sacred-band', name: 'Sacred Band', title: 'Elite of Thebes', role: 'SOL', origin: 'Thebes', rating: 64 },
  { id: 'spartan-hoplite', name: 'Spartan Hoplite', title: 'With It or On It', role: 'SOL', origin: 'Sparta', rating: 63 },
  { id: 'phalangite', name: 'Phalangite', title: 'The Sarissa Wall', role: 'SOL', origin: 'Macedon', rating: 62 },
  { id: 'immortal', name: 'Immortal', title: 'Guard of the King', role: 'SOL', origin: 'Persia', rating: 61 },
  { id: 'myrmidon', name: 'Myrmidon', title: 'Ant Warrior', role: 'SOL', origin: 'Phthia', rating: 60 },
  { id: 'trojan-guard', name: 'Trojan Guard', title: 'Keeper of the Gates', role: 'SOL', origin: 'Troy', rating: 58 },
  { id: 'athenian-archer', name: 'Athenian Archer', title: 'Bow of the Polis', role: 'SOL', origin: 'Athens', rating: 57 },
  { id: 'cretan-slinger', name: 'Cretan Slinger', title: 'Stone and Sling', role: 'SOL', origin: 'Crete', rating: 56 },
  { id: 'argive-spearman', name: 'Argive Spearman', title: 'Spear of Argos', role: 'SOL', origin: 'Argos', rating: 55 },
];

// "Τυχαίο" αλλά σταθερό νούμερο από -3 έως +3 για κάθε κάρτα και stat,
// ώστε δύο κάρτες με ίδιο rating και ρόλο να μην έχουν ίδια stats.
function jitter(id, i) {
  let h = 2166136261;
  for (const ch of `${id}:${i}`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return ((h >>> 0) % 7) - 3;
}

// Τα 6 stats μιας κάρτας: { ATK: 91, DEF: 80, ... }
export function statsOf(card) {
  const role = ROLES[card.role];
  return Object.fromEntries(STAT_NAMES.map((s, i) => [
    s, Math.max(20, Math.min(99, card.rating + role.stats[s] + jitter(card.id, i))),
  ]));
}

export const cardById = (id) => CARDS.find((c) => c.id === id);
