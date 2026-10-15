// Ανάδραση: ήχοι και δόνηση, όπως στο iPhone.
//
// ΗΧΟΣ (Web Audio): οι browsers παίζουν ήχο μόνο αφού αγγίξεις τη σελίδα.
// Γι' αυτό "ξεκλειδώνουμε" τον ήχο σε ΚΑΘΕ άγγιγμα, παίζοντας έναν σιωπηλό
// (το iPhone το θέλει μέσα στο ίδιο το άγγιγμα). Στο iPhone δεν ακούγεται
// αν είναι ενεργός ο διακόπτης σίγασης.
//
// ΔΟΝΗΣΗ: το Safari δεν έχει κανονικό τρόπο για δόνηση. Από το iOS 18,
// όταν αλλάζει ένας διακόπτης <input type="checkbox" switch>, το iPhone
// κάνει μια μικρή δόνηση. Χρησιμοποιούμε έναν κρυφό τέτοιο διακόπτη.
// Σε παλιότερα iOS ή σε άλλους browsers απλώς δεν γίνεται τίποτα.

import { getSetting } from './settings.js';

let audio = null;

function unlockAudio() {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state !== 'running') audio.resume();
    const silent = audio.createBufferSource();
    silent.buffer = audio.createBuffer(1, 1, 22050);
    silent.connect(audio.destination);
    silent.start(0);
  } catch { audio = null; }
}
document.addEventListener('pointerdown', unlockAudio, { capture: true });
document.addEventListener('keydown', unlockAudio, { capture: true });

const ready = () => audio && audio.state === 'running' && getSetting('sound');

// "Τικ" σαν του τροχού επιλογής του iPhone: πολύ σύντομος θόρυβος (~10ms)
// φιλτραρισμένος γύρω στα 3.5 kHz, που σβήνει απότομα.
let tickBuffer = null;
let lastTick = 0;
export function tick() {
  const now = performance.now();
  if (now - lastTick < 28) return; // όχι πάνω από ~35 τικ το δευτερόλεπτο
  lastTick = now;
  haptic();
  if (!ready()) return;
  try {
    if (!tickBuffer) {
      const len = Math.floor(audio.sampleRate * 0.012);
      tickBuffer = audio.createBuffer(1, len, audio.sampleRate);
      const data = tickBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 4;
    }
    const src = audio.createBufferSource();
    src.buffer = tickBuffer;
    const filter = audio.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 3500;
    filter.Q.value = 1.2;
    const gain = audio.createGain();
    gain.gain.value = 0.55;
    src.connect(filter).connect(gain).connect(audio.destination);
    src.start();
  } catch { /* χωρίς ήχο */ }
}

// Δύο νότες στο τέλος μιας συνεδρίας
export async function chime() {
  if (!audio || !getSetting('sound')) return;
  try {
    if (audio.state !== 'running') await audio.resume();
    const t = audio.currentTime + 0.05;
    [0, 0.25].forEach((delay, i) => {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.frequency.value = i ? 880 : 660;
      gain.gain.setValueAtTime(0.0001, t + delay);
      gain.gain.exponentialRampToValueAtTime(0.3, t + delay + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + delay + 0.5);
      osc.connect(gain).connect(audio.destination);
      osc.start(t + delay);
      osc.stop(t + delay + 0.55);
    });
  } catch { /* χωρίς ήχο */ }
}

// "Φσσς": θόρυβος που ανεβαίνει (σκίσιμο pack, εμφάνιση walkout)
export function whoosh() {
  haptic();
  if (!ready()) return;
  try {
    const len = Math.floor(audio.sampleRate * 0.5);
    const buf = audio.createBuffer(1, len, audio.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.sin((Math.PI * i) / len);
    const src = audio.createBufferSource();
    src.buffer = buf;
    const filter = audio.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 2;
    filter.frequency.setValueAtTime(400, audio.currentTime);
    filter.frequency.exponentialRampToValueAtTime(4000, audio.currentTime + 0.45);
    const gain = audio.createGain();
    gain.gain.value = 0.35;
    src.connect(filter).connect(gain).connect(audio.destination);
    src.start();
  } catch { /* χωρίς ήχο */ }
}

// Αποκάλυψη κάρτας: συγχορδία, πιο πλούσια όσο πιο σπάνια η κάρτα (level 0-4)
export function reveal(level = 0) {
  haptic();
  if (!ready()) return;
  try {
    const t = audio.currentTime + 0.02;
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5].slice(0, 2 + level); // C E G C E
    notes.forEach((f, i) => {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = level >= 3 ? 'triangle' : 'sine';
      osc.frequency.value = f;
      const start = t + i * 0.06;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.18, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.9 + level * 0.2);
      osc.connect(gain).connect(audio.destination);
      osc.start(start);
      osc.stop(start + 1.2 + level * 0.2);
    });
  } catch { /* χωρίς ήχο */ }
}

// Μικρή δόνηση (iOS 18+ μέσω κρυφού διακόπτη)
let hapticLabel = null;
export function haptic() {
  if (!getSetting('haptics')) return;
  try {
    if (!hapticLabel) {
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.setAttribute('switch', '');
      input.id = 'haptic-switch';
      input.style.display = 'none';
      hapticLabel = document.createElement('label');
      hapticLabel.htmlFor = input.id;
      hapticLabel.style.display = 'none';
      hapticLabel.setAttribute('aria-hidden', 'true');
      document.body.append(input, hapticLabel);
    }
    hapticLabel.click();
  } catch { /* χωρίς δόνηση */ }
}
