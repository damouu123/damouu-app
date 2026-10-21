// Σάρωση barcode με την κάμερα (όπως στο YAZIO) και αναζήτηση του προϊόντος.
//
// ΚΑΜΕΡΑ: το Safari του iPhone δεν έχει δικό του αναγνώστη barcode, οπότε
// χρησιμοποιούμε τη βιβλιοθήκη ZXing (vendor/zxing.min.js, Apache-2.0).
// Φορτώνεται μόνο την πρώτη φορά που πατάς "Scan" (είναι μεγάλη).
//
// ΠΡΟΪΟΝ: από τον κωδικό βρίσκουμε όνομα, μάρκα, συσκευασία και φωτογραφία
// στο Open Food Facts (ανοιχτή, δωρεάν βάση προϊόντων). Θέλει internet.
//
// scanBarcode() -> Promise<"5201234567890" | null>   (null = ακύρωσες)
// lookupProduct(code) -> Promise<{ code, name, brand, quantity, image } | null>

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

export function scanBarcode() {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'scan-screen';
    overlay.innerHTML = `
      <video class="scan-video" playsinline muted autoplay></video>
      <div class="scan-frame" aria-hidden="true"><i></i></div>
      <p class="scan-hint">Point the camera at the barcode</p>
      <div class="scan-actions">
        <button class="btn btn-quiet" data-type>Type the code</button>
        <button class="btn" data-cancel>Cancel</button>
      </div>`;
    document.body.appendChild(overlay);
    document.body.classList.add('locked');
    const video = overlay.querySelector('video');
    const hint = overlay.querySelector('.scan-hint');
    let reader = null;
    let done = false;

    const finish = (code) => {
      if (done) return;
      done = true;
      try { if (reader) reader.reset(); } catch { /* τίποτα */ }
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

    loadZxing().then((ZXing) => {
      if (done) return;
      const hints = new Map();
      hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [
        ZXing.BarcodeFormat.EAN_13, ZXing.BarcodeFormat.EAN_8, ZXing.BarcodeFormat.UPC_A,
        ZXing.BarcodeFormat.UPC_E, ZXing.BarcodeFormat.CODE_128,
      ]);
      reader = new ZXing.BrowserMultiFormatReader(hints, 250);
      return reader.decodeFromConstraints({ video: { facingMode: 'environment' } }, video, (result) => {
        if (result && !done) {
          haptic();
          finish(result.getText());
        }
      });
    }).catch((err) => {
      if (done) return;
      hint.textContent = err && err.name === 'NotAllowedError'
        ? 'Camera access is blocked. Allow it in iPhone Settings, or type the code.'
        : 'The camera is not available. Type the code instead.';
      overlay.classList.add('no-camera');
    });
  });
}

export async function lookupProduct(code) {
  const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,product_name_el,brands,quantity,image_front_small_url`);
  if (!res.ok) throw new Error('lookup failed');
  const data = await res.json();
  if (data.status !== 1 || !data.product) return null;
  const p = data.product;
  return {
    code,
    name: p.product_name_el || p.product_name || '',
    brand: (p.brands || '').split(',')[0].trim(),
    quantity: p.quantity || '',
    image: p.image_front_small_url || '',
  };
}
