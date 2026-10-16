// Discipline push server (Cloudflare Worker).
//
// ΤΙ ΚΑΝΕΙ: κάθε λεπτό κοιτάει τα μαθήματα που του έστειλε το app και στέλνει
// ειδοποίηση στο iPhone:
//   - 10/20/40/60' πριν από κάθε μάθημα (lead, το διαλέγεις στο app και πατάς Save)
//   Χωρίς αποθηκευμένο lead (π.χ. μόλις άνοιξες τις ειδοποιήσεις) δεν στέλνουμε ΤΙΠΟΤΑ.
//   - από την ΩΡΑ ΕΝΑΡΞΗΣ, κάθε 10', μόνο αν δεν το έχεις δηλώσει (Went / Missed / Cancelled)
//     (όχι 23:00-08:00, και όχι για μαθήματα παλιότερα από 2 μέρες)
//
// ΠΩΣ ΜΙΛΑΕΙ ΜΕ ΤΟ APP
//   GET  /vapid  -> { publicKey }   το δημόσιο κλειδί για την εγγραφή στις ειδοποιήσεις
//   POST /sync   { key, subscription?, classes, lead, tzOffset } -> { ok, subscribed, lead }
//                lead: 10/20/40/60, ή null = καμία ειδοποίηση μέχρι να πατήσεις Save
//                key: μυστικό που φτιάχνει το app. Η ΠΡΩΤΗ εγγραφή το "κλειδώνει":
//                από εκεί και πέρα δεχόμαστε μόνο το ίδιο key.
//                classes: [{ key, title, room, startsAt, endsAt, status }] (ms)
//
// ΑΠΟΘΗΚΕΥΣΗ (KV, binding "DB"):
//   vapid  { publicKey, privateJwk }  φτιάχνεται μόνο του την πρώτη φορά
//   state  { appKey, sub, classes, lead, tzOffset, sent: { [classKey]: true }, lastNag }
//
// ΚΡΥΠΤΟΓΡΑΦΗΣΗ: οι push ειδοποιήσεις πρέπει να είναι κρυπτογραφημένες
// (RFC 8291, aes128gcm) και υπογεγραμμένες (VAPID, RFC 8292). Όλα με WebCrypto.

const LEADS = [10, 20, 40, 60];
const NAG_EVERY_MIN = 10;
const NAG_WINDOW_H = 48;
const QUIET_FROM = 23; // ώρα (τοπική)
const QUIET_TO = 8;
const APP_URL = 'https://damouu123.github.io/damouu-app/';

// ===================== HTTP =====================

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json', ...CORS },
});

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const { pathname } = new URL(request.url);
    try {
      if (request.method === 'GET' && pathname === '/vapid') {
        return json({ publicKey: (await getVapid(env)).publicKey });
      }
      if (request.method === 'POST' && pathname === '/sync') {
        const body = await request.json();
        const state = await getState(env);
        if (typeof body.key !== 'string' || body.key.length < 20) return json({ error: 'bad key' }, 400);
        if (state.appKey && state.appKey !== body.key) return json({ error: 'wrong key' }, 403);
        state.appKey = body.key;

        if (body.subscription && body.subscription.endpoint) state.sub = body.subscription;
        if (Array.isArray(body.classes)) state.classes = body.classes.slice(0, 200).map(cleanClass);
        if (Number.isFinite(body.tzOffset)) state.tzOffset = body.tzOffset;
        if (body.lead === null) state.lead = null;
        else if (LEADS.includes(body.lead)) state.lead = body.lead;
        await env.DB.put('state', JSON.stringify(state));
        // Ο χρόνος που ΑΠΟΘΗΚΕΥΣΕ ο server: το app τον συγκρίνει με αυτόν που διάλεξες
        return json({ ok: true, subscribed: !!state.sub, lead: state.lead || null });
      }
      return json({ error: 'not found' }, 404);
    } catch (err) {
      return json({ error: String(err && err.message || err) }, 500);
    }
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(tick(env));
  },
};

const cleanClass = (c) => ({
  key: String(c.key).slice(0, 80),
  title: String(c.title || '').slice(0, 120),
  room: String(c.room || '').slice(0, 60),
  startsAt: Number(c.startsAt),
  endsAt: Number(c.endsAt),
  status: c.status ? String(c.status) : null,
});

async function getState(env) {
  return (await env.DB.get('state', 'json')) || { sent: {}, classes: [] };
}

// ===================== Κάθε λεπτό =====================

async function tick(env) {
  const state = await getState(env);
  if (!state.sub || !state.classes || !state.lead) return; // δεν έχεις πατήσει Save
  const now = Date.now();
  const hm = (ts) => new Date(ts - (state.tzOffset || 0) * 60000).toISOString().slice(11, 16); // "15:00" τοπική
  const localHour = Number(hm(now).slice(0, 2));
  const quiet = localHour >= QUIET_FROM || localHour < QUIET_TO;
  let changed = false;
  state.sent = state.sent || {};

  const send = async (payload) => {
    const status = await sendPush(env, state.sub, payload);
    if (status === 404 || status === 410) { state.sub = null; changed = true; } // η εγγραφή έληξε
    return status;
  };

  // 1) lead' πριν από το μάθημα
  const { lead } = state;
  for (const c of state.classes) {
    if (c.status || state.sent[c.key]) continue;
    if (now >= c.startsAt - lead * 60000 && now < c.endsAt) {
      state.sent[c.key] = true;
      changed = true;
      const mins = Math.max(1, Math.round((c.startsAt - now) / 60000));
      await send({
        title: c.title,
        body: `${c.startsAt > now ? `Starts in ${mins} min at ${hm(c.startsAt)}` : `Started at ${hm(c.startsAt)}`}${c.room ? ` in ${c.room}` : ''}. Tap to mark it.`,
        tag: c.key,
        url: `${APP_URL}#/calendar/class/${encodeURIComponent(c.key)}`,
        badge: unmarked(state.classes, now).length || 1,
      });
      if (!state.sub) break;
    }
  }

  // 2) Από την ώρα έναρξης: υπενθύμιση κάθε 10' μέχρι να δηλώσεις
  const due = unmarked(state.classes, now);
  if (state.sub && due.length && !quiet && now - (state.lastNag || 0) >= NAG_EVERY_MIN * 60000) {
    state.lastNag = now;
    changed = true;
    const first = due[0];
    await send({
      title: due.length === 1
        ? (now < first.endsAt ? `Are you at ${first.title}?` : `Did you go to ${first.title}?`)
        : `${due.length} classes to mark`,
      body: due.length === 1
        ? `${now < first.endsAt ? 'It started' : 'It ended'} at ${hm(now < first.endsAt ? first.startsAt : first.endsAt)}. Tap to mark Went, Missed or Cancelled.`
        : `${due.map((c) => c.title).join(', ')}. Tap to mark them.`,
      tag: 'unmarked',
      url: `${APP_URL}#/calendar/class/${encodeURIComponent(first.key)}`,
      badge: due.length,
    });
  }

  // Καθάρισμα: ξεχνάμε ό,τι δεν υπάρχει πια στη λίστα
  const keys = new Set(state.classes.map((c) => c.key));
  for (const k of Object.keys(state.sent)) if (!keys.has(k)) { delete state.sent[k]; changed = true; }

  if (changed) await env.DB.put('state', JSON.stringify(state));
}

// Μαθήματα που ΞΕΚΙΝΗΣΑΝ (έως 48 ώρες μετά το τέλος τους) και δεν έχεις δηλώσει
function unmarked(classes, now) {
  return classes
    .filter((c) => !c.status && c.startsAt <= now && now - c.endsAt < NAG_WINDOW_H * 3600000)
    .sort((a, b) => a.startsAt - b.startsAt);
}

// ===================== Web Push =====================

const enc = (s) => new TextEncoder().encode(s);

function concat(...parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of parts) { out.set(p, i); i += p.length; }
  return out;
}

function b64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function unb64url(str) {
  const s = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

async function getVapid(env) {
  let vapid = await env.DB.get('vapid', 'json');
  if (vapid) return vapid;
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  vapid = {
    publicKey: b64url(new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))),
    privateJwk: await crypto.subtle.exportKey('jwk', pair.privateKey),
  };
  await env.DB.put('vapid', JSON.stringify(vapid));
  return vapid;
}

// Υπογραφή VAPID: ένα JWT (ES256) για τον server των ειδοποιήσεων (Apple/Google)
export async function vapidJwt(vapid, audience, now = Date.now()) {
  const header = b64url(enc(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64url(enc(JSON.stringify({ aud: audience, exp: Math.floor(now / 1000) + 12 * 3600, sub: APP_URL })));
  const key = await crypto.subtle.importKey('jwk', vapid.privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc(`${header}.${claims}`)));
  return `${header}.${claims}.${b64url(sig)}`;
}

async function hkdf(salt, ikm, info, length) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, length * 8));
}

// Κρυπτογράφηση του μηνύματος για τη συγκεκριμένη συσκευή (RFC 8291, aes128gcm)
export async function encryptPayload(keys, plaintext) {
  const uaPublic = unb64url(keys.p256dh);
  const authSecret = unb64url(keys.auth);
  const local = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, local.privateKey, 256));

  const ikm = await hkdf(authSecret, shared, concat(enc('WebPush: info\0'), uaPublic, asPublic), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, enc('Content-Encoding: nonce\0'), 12);
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, concat(plaintext, new Uint8Array([2]))));

  const header = new Uint8Array(21 + asPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  header.set(asPublic, 21);
  return concat(header, cipher);
}

async function sendPush(env, sub, payload) {
  const vapid = await getVapid(env);
  const { protocol, host } = new URL(sub.endpoint);
  const jwt = await vapidJwt(vapid, `${protocol}//${host}`);
  const body = await encryptPayload(sub.keys, enc(JSON.stringify(payload)));
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: '3600',
      Urgency: 'high',
      Authorization: `vapid t=${jwt}, k=${vapid.publicKey}`,
    },
    body,
  });
  return res.status;
}
