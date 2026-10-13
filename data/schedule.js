// Το αρχικό πρόγραμμα (ομάδα Μ-Ω). Χρησιμοποιείται μόνο αν δεν έχεις
// αλλάξει ακόμα το πρόγραμμα μέσα στο app. Μετά την πρώτη αλλαγή,
// το πρόγραμμα ζει στο localStorage και αυτό το αρχείο αγνοείται
// (μέχρι να πατήσεις "Restore the original schedule").
//
// day: 1 = Δευτέρα ... 5 = Παρασκευή (6, 7 = Σάββατο, Κυριακή)
// type: 'lecture' (διάλεξη) ή 'tutorial' (φροντιστήριο)
// Τα id δεν πρέπει να αλλάζουν: σε αυτά "δένονται" οι παρουσίες σου.

export const SEED_SCHEDULE = [
  // --- Διαλέξεις ---
  { id: 'lea-lec-mon', title: 'Λήψη Επιχειρηματικών Αποφάσεων', type: 'lecture', group: '', day: 1, start: '09:00', end: '13:00', room: 'Δ23', teacher: 'Ε. Κρητικός' },
  { id: 'pm2-lec-mon', title: 'Ποσοτικές Μέθοδοι ΙΙ', type: 'lecture', group: '', day: 1, start: '13:00', end: '15:00', room: 'Δ23', teacher: 'Ε. Ζαχαριάδης' },
  { id: 'prog2-lec-mon', title: 'Προγραμματισμός ΙΙ', type: 'lecture', group: '', day: 1, start: '15:00', end: '17:00', room: 'Δ23', teacher: 'Δ. Σπινέλλης' },
  { id: 'db-lec-wed', title: 'Βάσεις Δεδομένων', type: 'lecture', group: '', day: 3, start: '09:00', end: '13:00', room: 'Δ23', teacher: 'Δ. Χατζηαντωνίου' },
  { id: 'prog2-lec-wed', title: 'Προγραμματισμός ΙΙ', type: 'lecture', group: '', day: 3, start: '15:00', end: '17:00', room: 'Δ23', teacher: 'Δ. Σπινέλλης' },
  { id: 'osh-lec-thu', title: 'Οργανωσιακή Συμπεριφορά και Ηγεσία', type: 'lecture', group: '', day: 4, start: '11:00', end: '15:00', room: 'Α31', teacher: 'Φ. Κραβαρίτη' },
  { id: 'pm2-lec-thu', title: 'Ποσοτικές Μέθοδοι ΙΙ', type: 'lecture', group: '', day: 4, start: '15:00', end: '17:00', room: 'Α31', teacher: 'Ε. Ζαχαριάδης' },

  // --- Φροντιστήρια ---
  { id: 'db-tut-tue', title: 'Βάσεις Δεδομένων', type: 'tutorial', group: 'All', day: 2, start: '13:00', end: '15:00', room: 'Δ24', teacher: 'Δ. Χατζηαντωνίου, Σ. Γρηγοράκης' },
  { id: 'lea-tut-thu', title: 'Λήψη Επιχειρηματικών Αποφάσεων', type: 'tutorial', group: 'Μ-Ω', day: 4, start: '09:00', end: '11:00', room: 'ΗΥ3', teacher: 'Ε. Κρητικός' },
  { id: 'pm2-tut-thu', title: 'Ποσοτικές Μέθοδοι ΙΙ', type: 'tutorial', group: 'All', day: 4, start: '17:00', end: '19:00', room: 'Α31', teacher: 'Ε. Ζαχαριάδης' },
  { id: 'pm2-tut-fri', title: 'Ποσοτικές Μέθοδοι ΙΙ', type: 'tutorial', group: 'Μ-Ω', day: 5, start: '13:00', end: '15:00', room: 'ΗΥ3', teacher: 'Η. Μπαλαφούτης' },
  { id: 'prog2-tut-fri', title: 'Προγραμματισμός ΙΙ', type: 'tutorial', group: 'All', day: 5, start: '17:00', end: '19:00', room: 'Δ24', teacher: 'Η. Μπαλαμπάνης, Η. Μπουρδάκος κ.ά.' },
];
