// Registry: ο "κατάλογος" με όλα τα modules του app.
//
// Κάθε module καλεί register({...}) με τα στοιχεία του:
//   id        μοναδικό όνομα, γίνεται και η διεύθυνση (#/calendar)
//   title     τίτλος οθόνης
//   icon      οι γραμμές ενός SVG εικονιδίου 24x24 (π.χ. '<path d="..."/>')
//   order     σειρά εμφάνισης (μικρότερο = πρώτο)
//   nav       true: εμφανίζεται στην κάτω μπάρα
//   render(el)   ζωγραφίζει την οθόνη του μέσα στο στοιχείο el
//   unmount()    (προαιρετικό) καθαρισμός όταν φεύγουμε από την οθόνη
//   homeCard()   (προαιρετικό) γραμμή στη λίστα της Αρχικής: { value, label }
//   renderHomeHero(el) (προαιρετικό) πιάνει την κορυφή της Αρχικής αντί για γραμμή
//
// Έτσι η Αρχική και η μπάρα δεν ξέρουν τίποτα για τα modules από πριν.
// Για νέο module φτιάχνεις ένα αρχείο και το κάνεις import, τίποτα άλλο.

const modules = new Map();

export function register(mod) {
  if (!mod.id || typeof mod.render !== 'function') {
    throw new Error('Το module χρειάζεται id και render()');
  }
  if (modules.has(mod.id)) throw new Error(`Διπλό module: ${mod.id}`);
  modules.set(mod.id, { order: 100, nav: false, icon: '<circle cx="12" cy="12" r="3"/>', ...mod });
}

export function getModule(id) {
  return modules.get(id);
}

export function allModules() {
  return [...modules.values()].sort((a, b) => a.order - b.order);
}

// --- Μικρό σύστημα γεγονότων ---
// Επιτρέπει σε ένα module να ειδοποιεί τα άλλα χωρίς να τα γνωρίζει.
// Π.χ. αργότερα: το calendar κάνει emit('attendance:changed')
// και το xp ακούει με on('attendance:changed', ...).
const listeners = new Map();

export function on(event, fn) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event).add(fn);
  return () => listeners.get(event).delete(fn); // για ακύρωση
}

export function emit(event, data) {
  (listeners.get(event) || []).forEach((fn) => {
    try { fn(data); } catch (err) { console.error(event, err); }
  });
}
