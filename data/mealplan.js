// Το εβδομαδιαίο πρόγραμμα φαγητού και τα υλικά του (από το "Meal Plan.txt").
//
// ITEMS: τα ψώνια, ανά μαγαζί. unit: 'g' (γραμμάρια) ή 'pcs' (τεμάχια).
//   pack: πόσα παίρνεις κάθε φορά που ψωνίζεις (και η τιμή, όπου την ξέρουμε).
//   Λαϊκή: per = [ένα, πολλά] ("1 πατάτα", "7 πατάτες"), gEach = μέσο βάρος ενός σε g,
//   ώστε να γράφεις και κιλά (1 kg πατάτες ≈ 6 πατάτες).
// PLAN: για κάθε μέρα (0 = Δευτέρα) τα 4 γεύματα. uses = [υλικό, ποσότητα ανά μερίδα].
//   Όπου το πρόγραμμα λέει "ή", υπάρχουν επιλογές (options).
//   Οι ποσότητες που δεν έγραφε το πρόγραμμα (γραμμάρια κοτόπουλου, ρυζιού...) είναι
//   προεπιλογές: αλλάζουν από το app (Track → πάτημα σε γεύμα).

export const STORES = [
  { id: 'super', name: 'Υπεραγορά', emoji: '🛒' },
  { id: 'laiki', name: 'Λαϊκή', emoji: '🧺' },
  { id: 'klouvatos', name: 'Κλουβάτος', emoji: '🍗' },
];

export const ITEMS = [
  // Υπεραγορά
  { id: 'kritsinia', name: 'Κριτσίνια', store: 'super', unit: 'pcs', pack: { size: 20, label: '1 πακέτο' } },
  { id: 'crackers', name: 'Crackers', store: 'super', unit: 'pcs', pack: { size: 30, label: '1 πακέτο' } },
  { id: 'philadelphia', name: 'Philadelphia', store: 'super', unit: 'g', pack: { size: 200, label: '1 κουτί 200 g' } },
  { id: 'spanaki', name: 'Σπανάκι', store: 'super', unit: 'g', pack: { size: 500, label: '1 σακούλα 500 g' } },
  { id: 'kritharaki', name: 'Κριθαράκι', store: 'super', unit: 'g', pack: { size: 500, label: '1 πακέτο 500 g' } },
  { id: 'rizi', name: 'Ρύζι', store: 'super', unit: 'g', pack: { size: 500, label: '1 πακέτο 500 g' } },
  { id: 'saltsa', name: 'Σάλτσα ντομάτας', store: 'super', unit: 'pcs', pack: { size: 1, label: '1 τεμάχιο' } },
  { id: 'pennes', name: 'Μακαρόνια πέννες', store: 'super', unit: 'g', pack: { size: 500, label: '1 πακέτο 500 g' } },
  { id: 'tyri', name: 'Τυρί τριμμένο', store: 'super', unit: 'g', pack: { size: 200, label: '1 σακουλάκι 200 g' } },
  // Λαϊκή
  { id: 'avga', name: 'Αυγά', store: 'laiki', unit: 'pcs', per: ['αυγό', 'αυγά'], pack: { size: 30, label: '1 θήκη 30' } },
  { id: 'bananes', name: 'Μπανάνες', store: 'laiki', unit: 'pcs', per: ['μπανάνα', 'μπανάνες'], gEach: 120, pack: { size: 8, label: '1 κιλό (~8)' } },
  { id: 'ntomates', name: 'Ντομάτες', store: 'laiki', unit: 'pcs', per: ['ντομάτα', 'ντομάτες'], gEach: 150, pack: { size: 7, label: '1 κιλό (~7)' } },
  { id: 'avokanto', name: 'Αβοκάντο', store: 'laiki', unit: 'pcs', per: ['αβοκάντο', 'αβοκάντο'], gEach: 200, pack: { size: 2, label: '2 αβοκάντο' }, optional: true },
  { id: 'patates', name: 'Πατάτες', store: 'laiki', unit: 'pcs', per: ['πατάτα', 'πατάτες'], gEach: 170, pack: { size: 12, label: '2 κιλά (~12)' } },
  // Κλουβάτος
  { id: 'stithos', name: 'Στήθος κοτόπουλο', store: 'klouvatos', unit: 'g', pack: { size: 1000, label: '1 kg', price: 4.95, count: 2 } },
  { id: 'kotompoukies', name: 'Κοτομπουκιές με πανάρισμα μοτσαρέλας', store: 'klouvatos', unit: 'g', pack: { size: 500, label: '500 g', price: 7.2 } },
  { id: 'kimas', name: 'Κιμάς κοτόπουλο', store: 'klouvatos', unit: 'g', pack: { size: 1000, label: '1 kg', price: 7.99 } },
  { id: 'kalamaki', name: 'Καλαμάκι κοτόπουλο', store: 'klouvatos', unit: 'g', pack: { size: 500, label: '500 g', price: 4.34 } },
];

// Προεπιλεγμένες ποσότητες ανά μερίδα (όπου το πρόγραμμα δεν έλεγε)
const CHICKEN = 200;  // g στήθος
const RICE = 100;     // g ρύζι (ωμό)
const ORZO = 100;     // g κριθαράκι (ωμό)
const PASTA = 100;    // g πέννες (ωμές)
const POTATO = 2;     // πατάτες (τεμάχια, μέτριες)
const NUGGETS = 250;  // g κοτομπουκιές

export const MEALS = [
  { id: 'breakfast', title: 'Πρωινό', emoji: '🍳' },
  { id: 'lunch', title: 'Μεσημεριανό', emoji: '🍗' },
  { id: 'dinner', title: 'Βραδινό', emoji: '🍽️' },
  { id: 'snack', title: 'Snack', emoji: '🍌' },
];

export const DAYS = ['Δευτέρα', 'Τρίτη', 'Τετάρτη', 'Πέμπτη', 'Παρασκευή', 'Σάββατο', 'Κυριακή'];

const breakfastEggsKritsinia = { text: '3 αυγά, 3 κριτσίνια και crackers με φυστικοβούτυρο και μέλι', uses: [['avga', 3], ['kritsinia', 3], ['crackers', 2]] };
const chickenRice = { text: 'Κοτόπουλο με ρύζι', uses: [['stithos', CHICKEN], ['rizi', RICE]] };
const chickenOrzo = { text: 'Κοτόπουλο με κριθαράκι', uses: [['stithos', CHICKEN], ['kritharaki', ORZO]] };
const nuggets = { text: 'Κοτομπουκιές με πατάτες', uses: [['kotompoukies', NUGGETS], ['patates', POTATO]] };

export const PLAN = [
  { // Δευτέρα
    breakfast: { text: 'Τίποτα', uses: [] },
    lunch: chickenOrzo,
    dinner: { text: 'Κοτόπουλο με πουρέ πατάτας', uses: [['stithos', CHICKEN], ['patates', POTATO]] },
    snack: { text: '3 κριτσίνια, μπανάνα και 2 crackers με φυστικοβούτυρο', uses: [['kritsinia', 3], ['bananes', 1], ['crackers', 2]] },
  },
  { // Τρίτη
    breakfast: breakfastEggsKritsinia,
    lunch: chickenRice,
    dinner: nuggets,
    snack: { text: 'Μπανάνα και 2 κριτσίνια με μέλι', uses: [['bananes', 1], ['kritsinia', 2]] },
  },
  { // Τετάρτη
    breakfast: breakfastEggsKritsinia,
    lunch: chickenRice,
    dinner: chickenOrzo,
    snack: { text: 'Μπανάνα και 2 crackers με φυστικοβούτυρο και μέλι', uses: [['bananes', 1], ['crackers', 2]] },
  },
  { // Πέμπτη
    breakfast: { text: '4 αυγά', uses: [['avga', 4]] },
    lunch: { text: '—', uses: [] },
    dinner: { text: 'Κοτόπουλο με μακαρόνια, σάλτσα ντομάτας και 2 αυγά', uses: [['stithos', CHICKEN], ['pennes', PASTA], ['saltsa', 0.5], ['avga', 2]] },
    snack: { text: '3 κριτσίνια, 2 crackers με φυστικοβούτυρο και μέλι και μπανάνα', uses: [['kritsinia', 3], ['crackers', 2], ['bananes', 1]] },
  },
  { // Παρασκευή
    breakfast: breakfastEggsKritsinia,
    lunch: { text: 'Κοτόπουλο με ρύζι και 2 αυγά', uses: [['stithos', CHICKEN], ['rizi', RICE], ['avga', 2]] },
    dinner: chickenOrzo,
    snack: { text: '3-4 crackers με φυστικοβούτυρο και μέλι και μπανάνα', uses: [['crackers', 4], ['bananes', 1]] },
  },
  { // Σάββατο
    breakfast: { text: '4 αυγά και 2 κριτσίνια', uses: [['avga', 4], ['kritsinia', 2]] },
    lunch: { text: 'Γεμιστό κοτόπουλο με πουρέ', uses: [['stithos', CHICKEN], ['philadelphia', 50], ['spanaki', 50], ['patates', POTATO]] },
    dinner: {
      text: 'Κοτομπουκιές με πατάτες ή παραγγελία',
      options: [nuggets, { text: 'Παραγγελία', uses: [] }],
    },
    snack: {
      text: 'Μπανάνα ή γλυκό',
      options: [{ text: 'Μπανάνα', uses: [['bananes', 1]] }, { text: 'Γλυκό', uses: [] }],
    },
  },
  { // Κυριακή
    breakfast: { text: '4 αυγά', uses: [['avga', 4]] },
    lunch: { text: 'Μακαρόνια με κοτόπουλο και τυρί', uses: [['pennes', PASTA], ['stithos', CHICKEN], ['tyri', 30]] },
    dinner: chickenRice,
    snack: { text: '4 crackers με φυστικοβούτυρο και μέλι', uses: [['crackers', 4]] },
  },
];
