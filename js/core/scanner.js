// Σάρωση barcode με την κάμερα (όπως στο YAZIO) και αναζήτηση του προϊόντος.
//
// ΚΑΜΕΡΑ: το Safari του iPhone δεν έχει δικό του αναγνώστη barcode, οπότε
// χρησιμοποιούμε τη βιβλιοθήκη ZXing (vendor/zxing.min.js, Apache-2.0).
// Φορτώνεται μόνο την πρώτη φορά που πατάς "Scan" (είναι μεγάλη).
// Δύο τρόποι:
//   1) Ζωντανά: κάθε 150 ms παίρνουμε τη μέση της εικόνας (εκεί που είναι το πλαίσιο)
//      και ψάχνουμε barcode. Με υψηλή ανάλυση, γιατί οι γραμμές είναι λεπτές.
//   2) "Take a photo": ανοίγει η κάμερα του iPhone (με καλή εστίαση) και
//      διαβάζουμε το barcode από τη φωτογραφία. Βοηθάει όταν το 1 δεν τα καταφέρνει.
//
// ΠΡΟΪΟΝ: από τον κωδικό βρίσκουμε όνομα, μάρκα, συσκευασία και φωτογραφία
// στο Open Food Facts (ανοιχτή, δωρεάν βάση προϊόντων). Θέλει internet.
// Πολλά ελληνικά προϊόντα δεν υπάρχουν εκεί: τότε γράφεις εσύ το όνομα.
//
// scanBarcode() -> Promise<"5201234567890" | null>   (null = ακύρωσες)
// lookupProduct(code) -> Promise<{ code, name, brand, quantity, image } | null>
//   null = δεν υπάρχει στη βάση. Σφάλμα (throw) = δεν υπάρχει σύνδεση.

import { haptic } from './feedback.js';

let libPromise = null;
function loadZxing() {
  if (window.ZXing) return Promise.resolve(window.ZXing);
  libPromise ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = './vendor/zxing.min.js';
    s.onload = () => resolve(window.ZXing);
    s.onerror = () => { libPromise = null; reject(new Error('Could not load the scanner')); };
    document.head.appendChild(s);
  });
  return libPromise;
}

// Ένας αναγνώστης για barcodes προϊόντων (EAN κ.λπ.), που "προσπαθεί περισσότερο"
function makeReader(ZXing) {
  const hints = new Map();
  hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [
    ZXing.BarcodeFormat.EAN_13, ZXing.BarcodeFormat.EAN_8, ZXing.BarcodeFormat.UPC_A,
    ZXing.BarcodeFormat.UPC_E, ZXing.BarcodeFormat.CODE_128,
  ]);
  hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
  const reader = new ZXing.MultiFormatReader();
  reader.setHints(hints);
  return reader;
}

// Ψάχνει barcode σε έναν καμβά. Επιστρέφει τον κωδικό ή null.
function decodeCanvas(ZXing, reader, canvas) {
  try {
    const source = new ZXing.HTMLCanvasElementLuminanceSource(canvas);
    const bitmap = new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(source));
    return reader.decodeWithState(bitmap).getText();
  } catch {
    return null; // δεν βρέθηκε σε αυτή την εικόνα
  }
}

// Ζωγραφίζει ένα κομμάτι της εικόνας (sx, sy, sw, sh) σε καμβά πλάτους έως maxW
function drawPart(canvas, src, sx, sy, sw, sh, maxW) {
  const scale = Math.min(1, maxW / sw);
  canvas.width = Math.round(sw * scale);
  canvas.height = Math.round(sh * scale);
  canvas.getContext('2d', { willReadFrequently: true }).drawImage(src, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
}

// Barcode από φωτογραφία: δοκιμάζει όλη την εικόνα και μετά τη μέση της, σε 2 μεγέθη
async function decodePhoto(ZXing, file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise((ok, fail) => { img.onload = ok; img.onerror = fail; img.src = url; });
    const reader = makeReader(ZXing);
    const canvas = document.createElement('canvas');
    const W = img.naturalWidth;
    const H = img.naturalHeight;
    const tries = [
      [0, 0, W, H, 1600],
      [W * 0.1, H * 0.3, W * 0.8, H * 0.4, 1600],
      [0, 0, W, H, 900],
      [W * 0.2, H * 0.35, W * 0.6, H * 0.3, 900],
    ];
    for (const [sx, sy, sw, sh, maxW] of tries) {
      drawPart(canvas, img, sx, sy, sw, sh, maxW);
      const code = decodeCanvas(ZXing, reader, canvas);
      if (code) return code;
    }
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function scanBarcode() {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'scan-screen';
    overlay.innerHTML = `
      <video class="scan-video" playsinline muted autoplay></video>
      <div class="scan-frame" aria-hidden="true"><i></i></div>
      <p class="scan-hint">Point the camera at the barcode</p>
      <div class="scan-actions">
        <label class="btn btn-quiet scan-photo">Take a photo<input type="file" accept="image/*" capture="environment" hidden></label>
        <button class="btn btn-quiet" data-type>Type the code</button>
        <button class="btn" data-cancel>Cancel</button>
      </div>`;
    document.body.appendChild(overlay);
    document.body.classList.add('locked');
    const video = overlay.querySelector('video');
    // Το iPhone παίζει βίντεο μέσα στη σελίδα μόνο αν είναι "muted" και "playsinline"
    video.muted = true;
    video.setAttribute('playsinline', '');
    const hint = overlay.querySelector('.scan-hint');
    let stream = null;
    let timer = null;
    let done = false;

    const stop = () => {
      clearInterval(timer);
      if (stream) stream.getTracks().forEach((t) => t.stop());
      stream = null;
    };
    const finish = (code) => {
      if (done) return;
      done = true;
      stop();
      overlay.classList.add('closing');
      document.body.classList.remove('locked');
      setTimeout(() => overlay.remove(), 250);
      resolve(code);
    };

    overlay.addEventListener('click', (ev) => {
      const b = ev.target.closest('button');
      if (!b) return;
      if ('cancel' in b.dataset) finish(null);
      else if ('type' in b.dataset) {
        const code = (prompt('Barcode number (the digits under the lines):') || '').replace(/\D/g, '');
        if (code.length >= 6) finish(code);
      }
    });

    // Φωτογραφία: η κάμερα του iPhone, και μετά ψάχνουμε το barcode μέσα της
    overlay.querySelector('input[type=file]').addEventListener('change', async (ev) => {
      const file = ev.target.files && ev.target.files[0];
      ev.target.value = '';
      if (!file) return;
      hint.textContent = 'Reading the photo…';
      try {
        const code = await decodePhoto(await loadZxing(), file);
        if (code) { haptic(); finish(code); return; }
        hint.textContent = 'No barcode found in the photo. Get closer, keep it sharp, or type the code.';
      } catch {
        hint.textContent = 'Could not read the photo. Type the code instead.';
      }
    });

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      hint.textContent = 'Live camera is not available here. Take a photo or type the code.';
      overlay.classList.add('no-camera');
      return;
    }

    Promise.all([
      loadZxing(),
      navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      }),
    ]).then(async ([ZXing, s]) => {
      if (done) { s.getTracks().forEach((t) => t.stop()); return; }
      stream = s;
      // Συνεχής εστίαση, όπου το επιτρέπει το κινητό
      try { await s.getVideoTracks()[0].applyConstraints({ advanced: [{ focusMode: 'continuous' }] }); } catch { /* τίποτα */ }
      video.srcObject = s;
      await video.play().catch(() => {});
      const reader = makeReader(ZXing);
      const canvas = document.createElement('canvas');
      let busy = false;
      timer = setInterval(() => {
        if (busy || done || !video.videoWidth) return;
        busy = true;
        const W = video.videoWidth;
        const H = video.videoHeight;
        // Η μέση της εικόνας (το πλαίσιο στην οθόνη): 80% πλάτος, 40% ύψος
        drawPart(canvas, video, W * 0.1, H * 0.3, W * 0.8, H * 0.4, 1280);
        const code = decodeCanvas(ZXing, reader, canvas);
        busy = false;
        if (code) { haptic(); finish(code); }
      }, 150);
    }).catch((err) => {
      if (done) return;
      hint.textContent = err && err.name === 'NotAllowedError'
        ? 'Camera access is blocked. Take a photo, type the code, or allow the camera in iPhone Settings.'
        : 'The live camera is not available. Take a photo or type the code.';
      overlay.classList.add('no-camera');
    });
  });
}

// Open Food Facts: η κύρια βάση και, αν δεν το βρει, η αδελφή βάση για μη-τρόφιμα
const SOURCES = [
  'https://world.openfoodfacts.org',
  'https://world.openproductsfacts.org',
];

export async function lookupProduct(code) {
  let reached = false;
  for (const base of SOURCES) {
    let res;
    try {
      res = await fetch(`${base}/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,product_name_el,generic_name,brands,quantity,image_front_small_url`);
    } catch {
      continue; // αυτή η βάση δεν απάντησε
    }
    reached = true;
    // 404 = δεν υπάρχει το προϊόν (δεν είναι πρόβλημα σύνδεσης)
    if (!res.ok) continue;
    const data = await res.json().catch(() => null);
    if (!data || data.status !== 1 || !data.product) continue;
    const p = data.product;
    const name = p.product_name_el || p.product_name || p.generic_name || '';
    const brand = (p.brands || '').split(',')[0].trim();
    if (!name && !brand) continue;
    return { code, name, brand, quantity: p.quantity || '', image: p.image_front_small_url || '' };
  }
  if (!reached) throw new Error('offline');
  return null;
}
