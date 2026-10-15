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
    id: 'antiquity',
    name: 'Legends of Antiquity',
    short: 'Antiquity',
    icon: 'helmet',
    colors: ['#E9C46A', '#8A5A0B'],
    statNames: ['ATK', 'DEF', 'STR', 'INT', 'LEA', 'SPD'],
    roles: {
      WAR: { name: 'Warrior', icon: 'sword', mods: [6, 2, 5, -8, -2, 3] },
      HER: { name: 'Hero', icon: 'star', mods: [7, 1, 8, -3, -1, 6] },
      KNG: { name: 'King', icon: 'crown', mods: [-2, 1, -1, 3, 8, -4] },
      GEN: { name: 'General', icon: 'helmet', mods: [-1, 3, -3, 7, 6, -2] },
      SAG: { name: 'Sage', icon: 'scroll', mods: [-22, -15, -18, 9, 1, -10] },
      SOL: { name: 'Soldier', icon: 'shield', mods: [2, 5, 3, -10, -6, 1] },
    },
    cards: [
      // ----- Icons (90+) -----
      { id: 'heracles', name: 'Heracles', title: 'The Twelve Labours', role: 'HER', origin: 'Thebes', rating: 96, icon: 'lightning' },
      { id: 'alexander', name: 'Alexander', title: 'The Undefeated', role: 'GEN', origin: 'Macedon', rating: 97, icon: 'horse' },
      { id: 'achilles', name: 'Achilles', title: 'Son of Thetis', role: 'WAR', origin: 'Phthia', rating: 95, icon: 'spear' },
      { id: 'leonidas', name: 'Leonidas', title: 'King of Sparta', role: 'KNG', origin: 'Sparta', rating: 93, icon: 'helmet' },
      // ----- Hero (85-89) -----
      { id: 'hector', name: 'Hector', title: 'Breaker of Horses', role: 'WAR', origin: 'Troy', rating: 89, icon: 'shield' },
      { id: 'odysseus', name: 'Odysseus', title: 'The Cunning', role: 'GEN', origin: 'Ithaca', rating: 88, icon: 'ship' },
      { id: 'aristotle', name: 'Aristotle', title: 'The Philosopher', role: 'SAG', origin: 'Stagira', rating: 88, icon: 'scroll' },
      { id: 'archimedes', name: 'Archimedes', title: 'Eureka', role: 'SAG', origin: 'Syracuse', rating: 87, icon: 'lightning' },
      { id: 'theseus', name: 'Theseus', title: 'Slayer of the Minotaur', role: 'HER', origin: 'Athens', rating: 87, icon: 'sword' },
      { id: 'socrates', name: 'Socrates', title: 'Know Thyself', role: 'SAG', origin: 'Athens', rating: 86, icon: 'owl' },
      { id: 'themistocles', name: 'Themistocles', title: 'Victor of Salamis', role: 'GEN', origin: 'Athens', rating: 86, icon: 'ship' },
      { id: 'perseus', name: 'Perseus', title: 'Slayer of Medusa', role: 'HER', origin: 'Argos', rating: 85, icon: 'shield' },
      // ----- Gold (75-84) -----
      { id: 'ajax', name: 'Ajax', title: 'The Great', role: 'WAR', origin: 'Salamis', rating: 84 },
      { id: 'plato', name: 'Plato', title: 'The Academy', role: 'SAG', origin: 'Athens', rating: 84, icon: 'owl' },
      { id: 'diomedes', name: 'Diomedes', title: 'Wounder of Gods', role: 'WAR', origin: 'Argos', rating: 83 },
      { id: 'epaminondas', name: 'Epaminondas', title: 'Victor of Leuctra', role: 'GEN', origin: 'Thebes', rating: 83 },
      { id: 'pythagoras', name: 'Pythagoras', title: 'All Is Number', role: 'SAG', origin: 'Samos', rating: 82, icon: 'lyre' },
      { id: 'pericles', name: 'Pericles', title: 'First Citizen', role: 'KNG', origin: 'Athens', rating: 81, icon: 'wreath' },
      { id: 'hypatia', name: 'Hypatia', title: 'The Astronomer', role: 'SAG', origin: 'Alexandria', rating: 81, icon: 'star' },
      { id: 'atalanta', name: 'Atalanta', title: 'The Huntress', role: 'HER', origin: 'Arcadia', rating: 80, icon: 'bow' },
      { id: 'agamemnon', name: 'Agamemnon', title: 'Lord of Men', role: 'KNG', origin: 'Mycenae', rating: 80 },
      { id: 'jason', name: 'Jason', title: 'The Argonaut', role: 'HER', origin: 'Iolcus', rating: 79, icon: 'ship' },
      { id: 'euclid', name: 'Euclid', title: 'The Elements', role: 'SAG', origin: 'Alexandria', rating: 79 },
      { id: 'miltiades', name: 'Miltiades', title: 'Victor of Marathon', role: 'GEN', origin: 'Athens', rating: 78 },
      { id: 'pyrrhus', name: 'Pyrrhus', title: 'Costly Victory', role: 'GEN', origin: 'Epirus', rating: 77 },
      { id: 'hippocrates', name: 'Hippocrates', title: 'The Physician', role: 'SAG', origin: 'Kos', rating: 76, icon: 'flask' },
      // ----- Silver (65-74) -----
      { id: 'patroclus', name: 'Patroclus', title: 'Friend of Achilles', role: 'WAR', origin: 'Phthia', rating: 74 },
      { id: 'aeneas', name: 'Aeneas', title: 'The Survivor', role: 'WAR', origin: 'Troy', rating: 73 },
      { id: 'menelaus', name: 'Menelaus', title: 'Husband of Helen', role: 'KNG', origin: 'Sparta', rating: 72 },
      { id: 'thucydides', name: 'Thucydides', title: 'The Historian', role: 'SAG', origin: 'Athens', rating: 72 },
      { id: 'herodotus', name: 'Herodotus', title: 'Father of History', role: 'SAG', origin: 'Halicarnassus', rating: 71 },
      { id: 'nestor', name: 'Nestor', title: 'The Wise Elder', role: 'KNG', origin: 'Pylos', rating: 70 },
      { id: 'sappho', name: 'Sappho', title: 'The Tenth Muse', role: 'SAG', origin: 'Lesbos', rating: 69, icon: 'lyre' },
      { id: 'paris', name: 'Paris', title: 'The Archer Prince', role: 'WAR', origin: 'Troy', rating: 68, icon: 'bow' },
      { id: 'priam', name: 'Priam', title: 'King of Troy', role: 'KNG', origin: 'Troy', rating: 67 },
      { id: 'aesop', name: 'Aesop', title: 'The Storyteller', role: 'SAG', origin: 'Phrygia', rating: 66 },
      // ----- Bronze (55-64): μονάδες στρατού -----
      { id: 'sacred-band', name: 'Sacred Band', title: 'Elite of Thebes', role: 'SOL', origin: 'Thebes', rating: 64 },
      { id: 'spartan-hoplite', name: 'Spartan Hoplite', title: 'With It or On It', role: 'SOL', origin: 'Sparta', rating: 63, icon: 'helmet' },
      { id: 'phalangite', name: 'Phalangite', title: 'The Sarissa Wall', role: 'SOL', origin: 'Macedon', rating: 62, icon: 'spear' },
      { id: 'immortal', name: 'Immortal', title: 'Guard of the King', role: 'SOL', origin: 'Persia', rating: 61 },
      { id: 'myrmidon', name: 'Myrmidon', title: 'Ant Warrior', role: 'SOL', origin: 'Phthia', rating: 60, icon: 'spear' },
      { id: 'trojan-guard', name: 'Trojan Guard', title: 'Keeper of the Gates', role: 'SOL', origin: 'Troy', rating: 58, icon: 'horse' },
      { id: 'athenian-archer', name: 'Athenian Archer', title: 'Bow of the Polis', role: 'SOL', origin: 'Athens', rating: 57, icon: 'bow' },
      { id: 'cretan-slinger', name: 'Cretan Slinger', title: 'Stone and Sling', role: 'SOL', origin: 'Crete', rating: 56 },
      { id: 'argive-spearman', name: 'Argive Spearman', title: 'Spear of Argos', role: 'SOL', origin: 'Argos', rating: 55, icon: 'spear' },
    ],
  },

  // ====================================================================
  {
    id: 'barca15',
    name: 'Barcelona 2015',
    short: 'Barcelona',
    icon: 'football',
    colors: ['#1E5BB8', '#A50044'],
    statNames: ['PAC', 'SHO', 'PAS', 'DRI', 'DEF', 'PHY'],
    roles: {
      GK: { name: 'Goalkeeper', icon: 'glove', mods: [-25, -55, -20, -30, 0, -8] },
      CB: { name: 'Centre-back', icon: 'shield', mods: [-12, -35, -18, -22, 6, 8] },
      FB: { name: 'Full-back', icon: 'boot', mods: [6, -18, -4, -6, -2, -8] },
      DM: { name: 'Holding midfielder', icon: 'shield', mods: [-10, -14, 2, -8, 4, 6] },
      CM: { name: 'Midfielder', icon: 'football', mods: [-5, -4, 6, 3, -12, -3] },
      WG: { name: 'Winger', icon: 'boot', mods: [8, 2, 0, 8, -30, -12] },
      ST: { name: 'Striker', icon: 'football', mods: [4, 8, -8, 2, -35, 2] },
      MGR: { name: 'Manager', icon: 'whistle', mods: [-22, -18, 2, -20, 0, -10] },
    },
    cards: [
      { id: 'b15-messi', name: 'Messi', title: 'La Pulga', role: 'WG', origin: 'Argentina', rating: 97, num: 10 },
      { id: 'b15-iniesta', name: 'Iniesta', title: 'The Illusionist', role: 'CM', origin: 'Spain', rating: 91, num: 8 },
      { id: 'b15-neymar', name: 'Neymar', title: 'Ney', role: 'WG', origin: 'Brazil', rating: 89, num: 11 },
      { id: 'b15-suarez', name: 'Suárez', title: 'El Pistolero', role: 'ST', origin: 'Uruguay', rating: 89, num: 9 },
      { id: 'b15-busquets', name: 'Busquets', title: 'The Anchor', role: 'DM', origin: 'Spain', rating: 88, num: 5 },
      { id: 'b15-xavi', name: 'Xavi', title: 'The Metronome', role: 'CM', origin: 'Spain', rating: 87, num: 6 },
      { id: 'b15-terstegen', name: 'Ter Stegen', title: 'The Sweeper-Keeper', role: 'GK', origin: 'Germany', rating: 87, num: 1 },
      { id: 'b15-pique', name: 'Piqué', title: 'The Ball-Playing Defender', role: 'CB', origin: 'Spain', rating: 86, num: 3 },
      { id: 'b15-enrique', name: 'Luis Enrique', title: 'The Coach', role: 'MGR', origin: 'Spain', rating: 85, icon: 'whistle' },
      { id: 'b15-rakitic', name: 'Rakitić', title: 'The Engine', role: 'CM', origin: 'Croatia', rating: 84, num: 4 },
      { id: 'b15-mascherano', name: 'Mascherano', title: 'Jefecito', role: 'CB', origin: 'Argentina', rating: 83, num: 14 },
      { id: 'b15-alves', name: 'Alves', title: 'The Wing-Back', role: 'FB', origin: 'Brazil', rating: 82, num: 22 },
      { id: 'b15-alba', name: 'Alba', title: 'The Overlapper', role: 'FB', origin: 'Spain', rating: 81, num: 18 },
      { id: 'b15-pedro', name: 'Pedro', title: 'The Super-Sub', role: 'WG', origin: 'Spain', rating: 79, num: 17 },
      { id: 'b15-rafinha', name: 'Rafinha', title: 'The Utility Man', role: 'CM', origin: 'Brazil', rating: 71, num: 12 },
      { id: 'b15-bartra', name: 'Bartra', title: 'The Academy Product', role: 'CB', origin: 'Spain', rating: 68, num: 15 },
    ],
  },

  // ====================================================================
  {
    id: 'middleearth',
    name: 'Middle-earth',
    short: 'Middle-earth',
    icon: 'ring',
    colors: ['#3F8F5B', '#B8860B'],
    statNames: ['MGT', 'WIS', 'AGI', 'WIL', 'CUN', 'HRT'],
    roles: {
      WIZ: { name: 'Wizard', icon: 'wizardhat', mods: [-12, 10, -14, 8, 6, 4] },
      RNG: { name: 'Ranger', icon: 'sword', mods: [6, 2, 8, 6, 4, 2] },
      ELF: { name: 'Elf', icon: 'leaf', mods: [-4, 6, 10, 4, 2, 0] },
      DWF: { name: 'Dwarf', icon: 'axe', mods: [8, -4, -8, 6, -2, 4] },
      HOB: { name: 'Hobbit', icon: 'tree', mods: [-30, -6, 2, 10, 6, 14] },
      MAN: { name: 'Man', icon: 'shield', mods: [4, -2, 2, 4, -2, 4] },
      DRK: { name: 'Dark Power', icon: 'eye', mods: [8, 6, -4, 10, 10, -24] },
      BST: { name: 'Beast', icon: 'flame', mods: [10, -14, 4, 2, 4, -24] },
      ORC: { name: 'Orc', icon: 'spear', mods: [6, -26, 0, -6, -6, -16] },
    },
    cards: [
      { id: 'me-gandalf', name: 'Gandalf', title: 'The White Rider', role: 'WIZ', origin: 'Valinor', rating: 96, icon: 'wizardhat' },
      { id: 'me-aragorn', name: 'Aragorn', title: 'Heir of Isildur', role: 'RNG', origin: 'Gondor', rating: 93, icon: 'crown' },
      { id: 'me-sauron', name: 'Sauron', title: 'The Dark Lord', role: 'DRK', origin: 'Mordor', rating: 92, icon: 'eye' },
      { id: 'me-galadriel', name: 'Galadriel', title: 'Lady of Light', role: 'ELF', origin: 'Lothlórien', rating: 90, icon: 'star' },
      { id: 'me-legolas', name: 'Legolas', title: 'Prince of Mirkwood', role: 'ELF', origin: 'Mirkwood', rating: 88, icon: 'bow' },
      { id: 'me-elrond', name: 'Elrond', title: 'Lord of Rivendell', role: 'ELF', origin: 'Rivendell', rating: 87, icon: 'leaf' },
      { id: 'me-saruman', name: 'Saruman', title: 'Of Many Colours', role: 'WIZ', origin: 'Isengard', rating: 87, icon: 'tower' },
      { id: 'me-frodo', name: 'Frodo', title: 'The Ring-bearer', role: 'HOB', origin: 'The Shire', rating: 86, icon: 'ring' },
      { id: 'me-smaug', name: 'Smaug', title: 'The Golden', role: 'BST', origin: 'Lonely Mountain', rating: 85, icon: 'flame' },
      { id: 'me-witchking', name: 'Witch-king', title: 'Lord of the Nazgûl', role: 'DRK', origin: 'Angmar', rating: 84, icon: 'crown' },
      { id: 'me-gimli', name: 'Gimli', title: 'Son of Glóin', role: 'DWF', origin: 'Erebor', rating: 83, icon: 'axe' },
      { id: 'me-eowyn', name: 'Éowyn', title: 'Shieldmaiden of Rohan', role: 'MAN', origin: 'Rohan', rating: 82, icon: 'sword' },
      { id: 'me-boromir', name: 'Boromir', title: 'Of Gondor', role: 'MAN', origin: 'Gondor', rating: 80, icon: 'shield' },
      { id: 'me-theoden', name: 'Théoden', title: 'King of Rohan', role: 'MAN', origin: 'Rohan', rating: 79, icon: 'horse' },
      { id: 'me-faramir', name: 'Faramir', title: 'Captain of Ithilien', role: 'MAN', origin: 'Gondor', rating: 77, icon: 'bow' },
      { id: 'me-samwise', name: 'Samwise', title: 'The Gardener', role: 'HOB', origin: 'The Shire', rating: 76, icon: 'leaf' },
      { id: 'me-gollum', name: 'Gollum', title: 'Sméagol', role: 'BST', origin: 'Misty Mountains', rating: 72, icon: 'ring' },
      { id: 'me-bilbo', name: 'Bilbo', title: 'The Burglar', role: 'HOB', origin: 'The Shire', rating: 70, icon: 'ring' },
      { id: 'me-merry', name: 'Merry', title: 'Of Buckland', role: 'HOB', origin: 'The Shire', rating: 66 },
      { id: 'me-pippin', name: 'Pippin', title: 'Of the Tooks', role: 'HOB', origin: 'The Shire', rating: 65 },
      { id: 'me-rohirrim', name: 'Rohirrim Rider', title: 'Horse-lord', role: 'MAN', origin: 'Rohan', rating: 62, icon: 'horse' },
      { id: 'me-urukhai', name: 'Uruk-hai', title: 'Of Isengard', role: 'ORC', origin: 'Isengard', rating: 61 },
      { id: 'me-gondorguard', name: 'Gondor Guard', title: 'Tower Guard', role: 'MAN', origin: 'Gondor', rating: 59, icon: 'tower' },
      { id: 'me-orc', name: 'Orc Soldier', title: 'Of Mordor', role: 'ORC', origin: 'Mordor', rating: 57 },
    ],
  },

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
