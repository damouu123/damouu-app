// Οι μεγάλες ενότητες του app (πλαϊνό μενού ☰): University, Fitness, Calories, Style. Η καθεμία έχει τη δική της
// αρχική σελίδα και τη δική της κάτω μπάρα με καρτέλες.
//
// Ένα module ανήκει σε ενότητα με το πεδίο section (π.χ. section: 'fitness').
// Χωρίς section ανήκει στο University (όλα όσα υπήρχαν μέχρι τώρα).
// home: η σελίδα που ανοίγει όταν διαλέγεις την ενότητα από το μενού.

export const SECTIONS = [
  {
    id: 'university',
    title: 'University',
    home: 'home',
    icon: '<path d="M2.5 9 12 4.5 21.5 9 12 13.5z"/><path d="M6.5 11v4.5c0 1.5 2.5 3 5.5 3s5.5-1.5 5.5-3V11M21.5 9v5"/>',
  },
  {
    id: 'fitness',
    title: 'Fitness',
    home: 'fitness',
    icon: '<path d="M3 9.5v5M6 7v10M18 7v10M21 9.5v5M6 12h12"/>',
  },
  {
    id: 'calories',
    title: 'Calories',
    home: 'calories',
    icon: '<path d="M12 21c-3.9 0-6.5-2.7-6.5-6.3 0-3.4 2.4-5.4 3.6-8.2.6 1.6 1.4 2.6 2.6 3.3.2-2.6 1.3-5 3-6.8.3 3.2 4.3 5.9 4.3 11 0 4-2.9 7-7 7z"/>',
  },
  {
    id: 'style',
    title: 'Style',
    home: 'style',
    icon: '<path d="M12 6.5a2 2 0 1 1 2-2M12 6.5 3 13.5a1.5 1.5 0 0 0 1 2.7h16a1.5 1.5 0 0 0 1-2.7z"/>',
  },
];

export const DEFAULT_SECTION = 'university';

// Σε ποια ενότητα ανήκει ένα module
export const sectionOf = (mod) => (mod && mod.section) || DEFAULT_SECTION;
