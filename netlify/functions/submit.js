/**
 * Netlify Function: Bestellung annehmen und an Make weiterleiten.
 * Aufruf: POST /.netlify/functions/submit  (JSON)
 *
 * Umgebungsvariablen (Netlify-Dashboard):
 *   MAKE_WEBHOOK_URL  Pflicht
 *   META_PIXEL_ID     optional (Fallback unten)
 *   META_CAPI_TOKEN   optional, wenn leer wird CAPI übersprungen
 */
const crypto = require('crypto');

// Preis pro Kiste in Euro. WICHTIG: bei Änderung auch in main.js anpassen.
const PREIS_PRO_KISTE = 30;
const BEZAHLTE_KISTEN = 5;
const ANGEBOT = '5+1';
const KISTEN = ['Regionalkiste', 'Mixkiste'];
// Phase 2: paypal ergänzen
const ZAHLUNGSARTEN = ['sepa', 'rechnung'];

const META_API_VERSION = 'v23.0'; // TODO: gelegentlich auf aktuelle Graph-API-Version prüfen
const PIXEL_ID_FALLBACK = '1277588763942941';

const IBAN_LAENGEN = {
  AD: 24, AT: 20, BE: 16, BG: 22, CH: 21, CY: 28, CZ: 24, DE: 22, DK: 18, EE: 20, ES: 24,
  FI: 18, FR: 27, GB: 22, GR: 27, HR: 21, HU: 28, IE: 22, IS: 26, IT: 27, LI: 21, LT: 20,
  LU: 20, LV: 21, MC: 27, MT: 31, NL: 18, NO: 15, PL: 28, PT: 25, RO: 24, SE: 24, SI: 19,
  SK: 24, SM: 27
};

/* ---------- Helfer ---------- */
const json = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  body: JSON.stringify(body)
});

const str = (v, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function cleanIban(v) { return String(v || '').replace(/[^0-9a-z]/gi, '').toUpperCase(); }

function ibanGueltig(raw) {
  const iban = cleanIban(raw);
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{8,30}$/.test(iban)) return false;
  const len = IBAN_LAENGEN[iban.slice(0, 2)];
  if (!len || iban.length !== len) return false;
  const umgestellt = iban.slice(4) + iban.slice(0, 4);
  let rest = 0;
  for (const ch of umgestellt) {
    const ziffern = /[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch;
    for (const z of ziffern) rest = (rest * 10 + Number(z)) % 97;
  }
  return rest === 1;
}

function berlinTeile(date) {
  const parts = new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).formatToParts(date);
  const p = {};
  parts.forEach(({ type, value }) => { p[type] = value; });
  return p;
}

function bestellnummer(date) {
  const p = berlinTeile(date);
  const zeichen = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // ohne verwechselbare Zeichen
  let suffix = '';
  const bytes = crypto.randomBytes(4);
  for (let i = 0; i < 4; i++) suffix += zeichen[bytes[i] % zeichen.length];
  return `SB-${p.year}${p.month}${p.day}-${suffix}`;
}

function zeitstempel(date) {
  const p = berlinTeile(date);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');

function normTelefon(t) {
  let d = String(t || '').replace(/[^\d+]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  else if (d.startsWith('00')) d = d.slice(2);
  else if (d.startsWith('0')) d = '49' + d.slice(1);
  return d.replace(/\D/g, '');
}

function normText(t) {
  return String(t || '').toLowerCase().trim()
    .replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss')
    .replace(/[^a-z]/g, '');
}

/* ---------- Validierung ---------- */
function validiere(d) {
  const f = {};
  if (!KISTEN.includes(d.kiste)) f.kiste = 'Bitte wähl eine Kiste aus.';
  if (!d.vorname) f.vorname = 'Bitte gib deinen Vornamen ein.';
  if (!d.nachname) f.nachname = 'Bitte gib deinen Nachnamen ein.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email)) f.email = 'Bitte gib eine gültige E-Mail-Adresse ein.';
  if (d.telefon.replace(/\D/g, '').length < 6) f.telefon = 'Bitte gib eine gültige Telefonnummer ein.';
  if (!d.strasse) f.strasse = 'Bitte gib Straße und Hausnummer ein.';
  if (!/^\d{5}$/.test(d.plz)) f.plz = 'Die PLZ hat 5 Ziffern.';
  // Phase 2: PLZ gegen Liefergebiet prüfen
  if (!d.ort) f.ort = 'Bitte gib deinen Ort ein.';
  if (!ZAHLUNGSARTEN.includes(d.zahlungsart)) f.zahlungsart = 'Bitte wähl eine Zahlungsart.';
  if (d.zahlungsart === 'sepa') {
    if (!d.kontoinhaber) f.kontoinhaber = 'Bitte gib den Kontoinhaber ein.';
    if (!ibanGueltig(d.iban)) f.iban = 'Diese IBAN ist ungültig. Bitte prüf sie noch einmal.';
    if (d.sepa_mandat !== 'ja') f.sepa_mandat = 'Bitte bestätige das SEPA-Lastschriftmandat.';
  }
  if (d.agb !== 'ja') f.agb = 'Bitte bestätige AGB und Datenschutz.';
  return f;
}

/* ---------- Meta Conversions API ---------- */
async function sendeCapi({ token, pixelId, d, eventId, eventTime, ip, ua }) {
  let fbc = d.fbc;
  if (!fbc && d.fbclid) fbc = `fb.1.${Number(d.fbclid_ts) || eventTime * 1000}.${d.fbclid}`;

  const userData = {
    em: [sha256(d.email.toLowerCase())],
    ph: [sha256(normTelefon(d.telefon))],
    fn: [sha256(normText(d.vorname))],
    ln: [sha256(normText(d.nachname))],
    ct: [sha256(normText(d.ort))],
    zp: [sha256(d.plz)],
    country: [sha256('de')],
    client_user_agent: ua || undefined,
    client_ip_address: ip || undefined,
    fbc: fbc || undefined,
    fbp: d.fbp || undefined
  };

  const payload = {
    data: [{
      event_name: 'Lead',
      event_time: eventTime,
      event_id: eventId,
      action_source: 'website',
      event_source_url: d.page_url || undefined,
      user_data: userData,
      custom_data: {
        value: PREIS_PRO_KISTE * BEZAHLTE_KISTEN,
        currency: 'EUR',
        content_name: d.kiste
      }
    }]
  };

  const url = `https://graph.facebook.com/${META_API_VERSION}/${pixelId}/events?access_token=${encodeURIComponent(token)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(5000)
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`CAPI ${res.status}: ${text.slice(0, 300)}`);
  }
}

/* ---------- Handler ---------- */
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return json(405, { ok: false, message: 'Methode nicht erlaubt.' });

  let body;
  try {
    body = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body || '', 'base64').toString('utf8') : (event.body || '{}'));
  } catch (e) {
    return json(400, { ok: false, message: 'Ungültige Anfrage.' });
  }

  // Honeypot: Bots bekommen ein "ok", es wird aber nichts weitergeleitet
  if (str(body.website)) return json(200, { ok: true, bestellnummer: '' });

  const d = {
    kiste: str(body.kiste, 40),
    vorname: str(body.vorname, 80),
    nachname: str(body.nachname, 80),
    email: str(body.email, 200).toLowerCase(),
    telefon: str(body.telefon, 40),
    strasse: str(body.strasse, 150),
    plz: str(body.plz, 10),
    ort: str(body.ort, 100),
    zahlungsart: str(body.zahlungsart, 20),
    kontoinhaber: str(body.kontoinhaber, 120),
    iban: cleanIban(body.iban).slice(0, 34),
    sepa_mandat: str(body.sepa_mandat, 5),
    lieferhinweis: str(body.lieferhinweis, 500),
    agb: str(body.agb, 5),
    utm_source: str(body.utm_source),
    utm_medium: str(body.utm_medium),
    utm_campaign: str(body.utm_campaign),
    utm_content: str(body.utm_content),
    fbclid: str(body.fbclid, 500),
    fbclid_ts: str(String(body.fbclid_ts || ''), 20),
    event_id: str(body.event_id, 64),
    consent_marketing: body.consent_marketing === true,
    fbp: str(body.fbp, 200),
    fbc: str(body.fbc, 600),
    page_url: str(body.page_url, 1000)
  };

  const fehler = validiere(d);
  if (Object.keys(fehler).length) {
    return json(422, { ok: false, message: 'Bitte prüf die markierten Felder.', fehler });
  }

  const webhook = process.env.MAKE_WEBHOOK_URL;
  if (!webhook) {
    console.error('MAKE_WEBHOOK_URL fehlt');
    return json(500, { ok: false, message: 'Die Bestellung konnte gerade nicht gespeichert werden. Bitte ruf uns an: 04847 8094700.' });
  }

  const jetzt = new Date();
  const nr = bestellnummer(jetzt);
  const sepa = d.zahlungsart === 'sepa';

  // Flache Feldnamen für Make → Google Sheets
  const bestellung = {
    bestellnummer: nr,
    zeitstempel: zeitstempel(jetzt),
    kiste: d.kiste,
    vorname: d.vorname,
    nachname: d.nachname,
    email: d.email,
    telefon: d.telefon,
    strasse: d.strasse,
    plz: d.plz,
    ort: d.ort,
    zahlungsart: sepa ? 'SEPA-Lastschrift' : 'Rechnung',
    kontoinhaber: sepa ? d.kontoinhaber : '',
    iban: sepa ? d.iban : '',
    sepa_mandat: sepa ? 'ja' : '',
    lieferhinweis: d.lieferhinweis,
    preis_pro_kiste: PREIS_PRO_KISTE,
    angebot: ANGEBOT,
    utm_source: d.utm_source,
    utm_medium: d.utm_medium,
    utm_campaign: d.utm_campaign,
    utm_content: d.utm_content,
    fbclid: d.fbclid
  };

  try {
    const res = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bestellung),
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) throw new Error(`Make antwortet mit ${res.status}`);
  } catch (err) {
    // Keine Kundendaten ins Log schreiben
    console.error('Webhook fehlgeschlagen:', nr, err.message);
    return json(502, { ok: false, message: 'Die Bestellung konnte gerade nicht gespeichert werden. Bitte versuch es gleich noch einmal oder ruf uns an: 04847 8094700.' });
  }

  // Meta CAPI: nur mit Token und nur, wenn der Kunde dem Tracking zugestimmt hat
  const token = process.env.META_CAPI_TOKEN;
  if (token && d.consent_marketing && d.event_id) {
    const headers = event.headers || {};
    const ip = headers['x-nf-client-connection-ip'] || (headers['x-forwarded-for'] || '').split(',')[0].trim();
    try {
      await sendeCapi({
        token,
        pixelId: process.env.META_PIXEL_ID || PIXEL_ID_FALLBACK,
        d,
        eventId: d.event_id,
        eventTime: Math.floor(jetzt.getTime() / 1000),
        ip,
        ua: headers['user-agent']
      });
    } catch (err) {
      // Bestellung ist trotzdem durch, CAPI-Fehler nur loggen
      console.error('CAPI fehlgeschlagen:', nr, err.message);
    }
  }

  return json(200, { ok: true, bestellnummer: nr });
};

// Für lokale Tests
exports._intern = { ibanGueltig, bestellnummer, zeitstempel, normTelefon, validiere };
