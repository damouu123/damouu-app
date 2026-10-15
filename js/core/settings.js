// Ρυθμίσεις του app (ήχοι, δόνηση, αυτόματο backup).
// Τις διαβάζουν πολλά modules, γι' αυτό ζουν στον core και όχι σε ένα module.

import { moduleStore } from './storage.js';
import { emit } from './registry.js';

const store = moduleStore('settings');

// Οι προεπιλογές, αν δεν έχεις αλλάξει κάτι
const DEFAULTS = {
  sound: true,      // ήχοι (τροχός, τέλος συνεδρίας)
  haptics: true,    // δόνηση (όπου την υποστηρίζει το iPhone)
  autoBackup: true, // καθημερινό αντίγραφο μέσα στο app
};

export function getSetting(name) {
  const saved = store.get('values', {});
  return name in saved ? saved[name] : DEFAULTS[name];
}

export function setSetting(name, value) {
  store.update('values', (v) => ({ ...v, [name]: value }), {});
  emit('settings:changed', { name, value });
}
