// Όλοι οι αριθμοί του "παιχνιδιού" σε ένα σημείο: XP, coins, τιμές packs.
// Τους χρησιμοποιούν πολλά modules (xp, goal, timer, packs). Αν θες να
// αλλάξεις κάποιον κανόνα, τον αλλάζεις μόνο εδώ.

// ----- XP (κάθε XP δίνει και 1 coin) -----
export const CLASS_POINTS = { attended: 10, left: 4, missed: 0 }; // Cancelled: δεν μετράει
export const FOCUS_XP_PER_MIN = 1;   // ολοκληρωμένο focus
export const GOAL_BONUS = 20;        // ημερήσιος στόχος
export const GOAL_FOCUS_MIN = 30;    // ο στόχος θέλει τόσα λεπτά focus τη μέρα
export const COINS_PER_XP = 1;

// ----- Ποινή -----
export const STOP_PENALTY_COINS = 25; // σταμάτημα focus νωρίς (χωρίς emergency pass)

// ----- ΠΡΟΣΩΡΙΝΟ: coins για δοκιμές -----
// Προστίθενται στα coins σου ώστε να ανοίξεις πολλά packs και να τα δοκιμάσεις.
// Για κανονική λειτουργία (coins μόνο από την απόδοσή σου), βάλε 0.
export const TEST_BONUS_COINS = 5000;

// ----- Packs -----
// odds: πιθανότητα για κάθε σπανιότητα ανά κάρτα (άθροισμα 1)
// guarantee: τουλάχιστον μία κάρτα από αυτή τη σπανιότητα ή καλύτερη
export const PACKS = {
  bronze: { name: 'Bronze Pack', price: 100, cards: 3, odds: { bronze: 0.72, silver: 0.24, gold: 0.04 } },
  silver: { name: 'Silver Pack', price: 300, cards: 4, odds: { bronze: 0.3, silver: 0.52, gold: 0.16, hero: 0.02 } },
  gold: { name: 'Gold Pack', price: 750, cards: 5, guarantee: 'gold', odds: { silver: 0.3, gold: 0.53, hero: 0.13, icon: 0.04 } },
  legend: { name: 'Legend Pack', price: null, cards: 3, guarantee: 'hero', odds: { gold: 0.55, hero: 0.33, icon: 0.12 } },
};

// Pack ενός συγκεκριμένου σετ (π.χ. μόνο Barcelona 2015): όλες οι κάρτες του
// είναι από το ίδιο θέμα. Η τιμή είναι ίδια για κάθε σετ.
export const SET_PACK = { price: 250, cards: 4, odds: { bronze: 0.25, silver: 0.45, gold: 0.24, hero: 0.05, icon: 0.01 } };

// Πόσα coins δίνει μια διπλή κάρτα (μετατρέπεται αυτόματα)
export const DUPLICATE_COINS = { bronze: 5, silver: 15, gold: 40, hero: 100, icon: 250 };

// Δωρεάν packs από επιτεύγματα
export const FREE_PACKS = {
  welcome: 'gold',          // μία φορά, στην αρχή
  goalDay: 'bronze',        // κάθε μέρα με πετυχημένο στόχο
  level: 'silver',          // κάθε νέο level...
  level5: 'gold',           // ...και κάθε 5ο level Gold
  streakEvery: 10,          // κάθε 10 μαθήματα streak...
  streak: 'gold',           // ...ένα Gold
  weekAttendance: 0.9,      // εβδομάδα με τόση παρουσία...
  weekFocusDays: 5,         // ...ή focus τόσες μέρες
  week: 'silver',           // ...ένα Silver
  setComplete: 'legend',    // ολοκλήρωση ενός σετ (σε κάθε σετ ξεχωριστά)
};
