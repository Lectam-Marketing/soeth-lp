/* ==========================================================
   Söth's Biokiste, Landingpage 5+1
   Vanilla JS, läuft auf index.html und danke.html
   ========================================================== */
(function () {
  'use strict';

  /* ---------- Konfiguration ---------- */
  // Preis pro Kiste in Euro (Endpreis inkl. MwSt.).
  // WICHTIG: bei Änderung auch PREIS_PRO_KISTE in netlify/functions/submit.js anpassen.
  var PREIS_PRO_KISTE = 30;
  var BEZAHLTE_KISTEN = 5; // 5 bezahlen, 6. gratis
  var LEAD_WERT = PREIS_PRO_KISTE * BEZAHLTE_KISTEN; // 150

  var META_PIXEL_ID = '1277588763942941';
  var ENDPOINT = '/.netlify/functions/submit';
  var CONSENT_KEY = 'sb_consent_v1';
  var ATTR_KEY = 'sb_attribution';
  var LEAD_KEY = 'sb_lead';

  // Zahlungsarten. Phase 2: { paypal: { felder: [] } } ergänzen + Radio/Panel im HTML.
  var ZAHLUNGSARTEN = {
    sepa: { felder: ['kontoinhaber', 'iban', 'sepa_mandat'] },
    rechnung: { felder: [] }
  };

  /* ---------- Storage-Helfer (können in privaten Modi werfen) ---------- */
  function store(type) {
    return {
      get: function (k) { try { return window[type].getItem(k); } catch (e) { return null; } },
      set: function (k, v) { try { window[type].setItem(k, v); } catch (e) { /* egal */ } },
      remove: function (k) { try { window[type].removeItem(k); } catch (e) { /* egal */ } }
    };
  }
  var local = store('localStorage');
  var session = store('sessionStorage');

  function readJSON(s, k) { try { return JSON.parse(s.get(k) || 'null'); } catch (e) { return null; } }

  function euro(n) { return (Math.round(n * 100) / 100).toLocaleString('de-DE', { minimumFractionDigits: n % 1 ? 2 : 0 }) + ' €'; }

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16);
    });
  }

  function getCookie(name) {
    var m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : '';
  }

  /* ---------- UTM + fbclid merken ---------- */
  var ATTR_FIELDS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'fbclid'];
  (function captureAttribution() {
    var params;
    try { params = new URLSearchParams(location.search); } catch (e) { return; }
    var saved = readJSON(session, ATTR_KEY) || {};
    var found = false;
    ATTR_FIELDS.forEach(function (f) {
      var v = params.get(f);
      if (v) { saved[f] = v.slice(0, 500); found = true; }
    });
    if (found) {
      if (saved.fbclid && !saved.fbclid_ts) saved.fbclid_ts = Date.now();
      session.set(ATTR_KEY, JSON.stringify(saved));
    }
  })();

  /* ---------- Consent + Meta Pixel ---------- */
  var pixelLoaded = false;

  function getConsent() { return local.get(CONSENT_KEY); } // 'granted' | 'denied' | null
  function hasConsent() { return getConsent() === 'granted'; }

  function loadPixel() {
    if (pixelLoaded) return;
    pixelLoaded = true;
    /* eslint-disable */
    !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;
    n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,
    document,'script','https://connect.facebook.net/en_US/fbevents.js');
    /* eslint-enable */
    window.fbq('init', META_PIXEL_ID);
    window.fbq('track', 'PageView');
  }

  function track(event, data, eventId) {
    if (!hasConsent() || !window.fbq) return;
    if (eventId) window.fbq('track', event, data || {}, { eventID: eventId });
    else window.fbq('track', event, data || {});
  }

  var consentEl = document.getElementById('consent');

  function showConsent() {
    if (!consentEl) return;
    consentEl.hidden = false;
    document.body.classList.add('consent-open');
  }
  function hideConsent() {
    if (!consentEl) return;
    consentEl.hidden = true;
    document.body.classList.remove('consent-open');
  }

  function onConsentGranted() {
    loadPixel();
    fireStoredLead(); // nur auf danke.html relevant
  }

  if (consentEl) {
    consentEl.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-consent]');
      if (!btn) return;
      var choice = btn.getAttribute('data-consent');
      var before = getConsent();
      local.set(CONSENT_KEY, choice);
      hideConsent();
      if (choice === 'granted') onConsentGranted();
      else if (before === 'granted') location.reload(); // Widerruf: Pixel sauber entladen
    });
  }
  document.querySelectorAll('[data-consent-open]').forEach(function (b) {
    b.addEventListener('click', showConsent);
  });

  /* ---------- Danke-Seite ---------- */
  function fireStoredLead() {
    var lead = readJSON(session, LEAD_KEY);
    if (!lead || lead.fired || !hasConsent()) return;
    track('Lead', {
      value: LEAD_WERT,
      currency: 'EUR',
      content_name: lead.kiste
    }, lead.event_id);
    lead.fired = true;
    session.set(LEAD_KEY, JSON.stringify(lead));
  }

  if (document.body.classList.contains('page-danke')) {
    var lead = readJSON(session, LEAD_KEY);
    var nrEl = document.getElementById('bestellnummer');
    if (lead && lead.bestellnummer && nrEl) {
      nrEl.querySelector('strong').textContent = lead.bestellnummer;
      nrEl.hidden = false;
    }
  }

  // Start: Banner zeigen oder Pixel laden
  var consentState = getConsent();
  if (consentState === 'granted') onConsentGranted();
  else if (consentState === null) showConsent();

  /* ---------- Ab hier nur index.html ---------- */
  var form = document.getElementById('bestellung');
  if (!form) return;

  // Preise aus der Konstante ins HTML schreiben
  document.querySelectorAll('[data-preis]').forEach(function (el) { el.textContent = euro(PREIS_PRO_KISTE); });

  /* ---------- IBAN ---------- */
  var IBAN_LAENGEN = {
    AD: 24, AT: 20, BE: 16, BG: 22, CH: 21, CY: 28, CZ: 24, DE: 22, DK: 18, EE: 20, ES: 24,
    FI: 18, FR: 27, GB: 22, GR: 27, HR: 21, HU: 28, IE: 22, IS: 26, IT: 27, LI: 21, LT: 20,
    LU: 20, LV: 21, MC: 27, MT: 31, NL: 18, NO: 15, PL: 28, PT: 25, RO: 24, SE: 24, SI: 19,
    SK: 24, SM: 27
  };

  function cleanIban(v) { return (v || '').replace(/[^0-9a-z]/gi, '').toUpperCase(); }

  function ibanGueltig(raw) {
    var iban = cleanIban(raw);
    if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{8,30}$/.test(iban)) return false;
    var len = IBAN_LAENGEN[iban.slice(0, 2)];
    if (!len || iban.length !== len) return false;
    var umgestellt = iban.slice(4) + iban.slice(0, 4);
    var rest = 0;
    for (var i = 0; i < umgestellt.length; i++) {
      var c = umgestellt.charCodeAt(i);
      var ziffern = c >= 65 ? String(c - 55) : umgestellt[i];
      for (var j = 0; j < ziffern.length; j++) rest = (rest * 10 + Number(ziffern[j])) % 97;
    }
    return rest === 1;
  }

  var ibanInput = form.elements.iban;
  ibanInput.addEventListener('input', function () {
    var el = ibanInput;
    var pos = el.selectionStart || 0;
    var zeichenVorCursor = cleanIban(el.value.slice(0, pos)).length;
    var formatiert = cleanIban(el.value).replace(/(.{4})/g, '$1 ').trim();
    el.value = formatiert;
    // Cursor an dieselbe logische Stelle setzen
    var neuPos = zeichenVorCursor + Math.floor(zeichenVorCursor / 4);
    if (zeichenVorCursor > 0 && zeichenVorCursor % 4 === 0) neuPos -= 1;
    if (neuPos > formatiert.length) neuPos = formatiert.length;
    try { el.setSelectionRange(neuPos, neuPos); } catch (e) { /* egal */ }
  });

  /* ---------- PLZ (Phase 2: Liefergebiet prüfen) ---------- */
  function pruefePlz(plz) {
    // Phase 2: hier gegen Liefergebiet prüfen, z. B. LIEFERGEBIET.includes(plz)
    // und bei Bedarf eine Meldung zurückgeben.
    return '';
  }

  /* ---------- Validierung ---------- */
  function wert(name) {
    var el = form.elements[name];
    if (!el) return '';
    if (el.type === 'checkbox') return el.checked ? 'ja' : '';
    return (el.value || '').trim();
  }
  function zahlungsart() { return wert('zahlungsart'); }

  var REGELN = {
    kiste: function (v) { return v ? '' : 'Bitte wähl eine Kiste aus.'; },
    vorname: function (v) { return v ? '' : 'Bitte gib deinen Vornamen ein.'; },
    nachname: function (v) { return v ? '' : 'Bitte gib deinen Nachnamen ein.'; },
    email: function (v) {
      if (!v) return 'Bitte gib deine E-Mail-Adresse ein.';
      return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? '' : 'Diese E-Mail-Adresse sieht nicht richtig aus.';
    },
    telefon: function (v) {
      if (!v) return 'Bitte gib deine Telefonnummer ein.';
      return v.replace(/\D/g, '').length >= 6 ? '' : 'Diese Telefonnummer ist zu kurz.';
    },
    strasse: function (v) {
      if (!v) return 'Bitte gib Straße und Hausnummer ein.';
      return /\d/.test(v) ? '' : 'Bitte ergänze deine Hausnummer.';
    },
    plz: function (v) {
      if (!v) return 'Bitte gib deine PLZ ein.';
      if (!/^\d{5}$/.test(v)) return 'Die PLZ hat 5 Ziffern.';
      return pruefePlz(v);
    },
    ort: function (v) { return v ? '' : 'Bitte gib deinen Ort ein.'; },
    zahlungsart: function (v) { return ZAHLUNGSARTEN[v] ? '' : 'Bitte wähl eine Zahlungsart.'; },
    kontoinhaber: function (v) {
      if (zahlungsart() !== 'sepa') return '';
      return v ? '' : 'Bitte gib den Kontoinhaber ein.';
    },
    iban: function (v) {
      if (zahlungsart() !== 'sepa') return '';
      if (!v) return 'Bitte gib deine IBAN ein.';
      return ibanGueltig(v) ? '' : 'Diese IBAN ist ungültig. Bitte prüf sie noch einmal.';
    },
    sepa_mandat: function (v) {
      if (zahlungsart() !== 'sepa') return '';
      return v ? '' : 'Bitte bestätige das SEPA-Lastschriftmandat.';
    },
    agb: function (v) { return v ? '' : 'Bitte bestätige AGB und Datenschutz.'; }
  };
  var REIHENFOLGE = Object.keys(REGELN);

  function feldElement(name) {
    var el = form.elements[name];
    if (el && el.length && !el.tagName) return el[0]; // RadioNodeList
    return el;
  }

  function zeigeFehler(name, msg) {
    var box = form.querySelector('[data-error-for="' + name + '"]');
    if (box) box.textContent = msg;
    if (name === 'kiste') { form.querySelector('.boxes').classList.toggle('is-invalid', !!msg); return; }
    if (name === 'zahlungsart') { form.querySelector('.payment').classList.toggle('is-invalid', !!msg); return; }
    var el = feldElement(name);
    if (el) {
      if (msg) el.setAttribute('aria-invalid', 'true');
      else el.removeAttribute('aria-invalid');
    }
  }

  function pruefe(name) {
    var msg = REGELN[name](wert(name));
    zeigeFehler(name, msg);
    return msg;
  }

  // Erst nach dem ersten Verlassen eines Feldes live prüfen
  var beruehrt = {};
  form.addEventListener('focusout', function (e) {
    var name = e.target.name;
    if (!REGELN[name] || e.target.type === 'radio') return;
    if (!e.target.value && !beruehrt[name]) return; // leere Felder nicht sofort anmeckern
    beruehrt[name] = true;
    pruefe(name);
  });
  form.addEventListener('input', function (e) {
    var name = e.target.name;
    if (REGELN[name] && beruehrt[name]) pruefe(name);
  });

  /* ---------- Kiste wählen ---------- */
  var gesehen = {};
  var summaryKiste = form.querySelector('[data-summary-kiste]');
  form.addEventListener('change', function (e) {
    var t = e.target;
    if (t.name === 'kiste') {
      zeigeFehler('kiste', '');
      if (summaryKiste) summaryKiste.textContent = t.value;
      if (!gesehen[t.value]) {
        gesehen[t.value] = true;
        track('ViewContent', { content_name: t.value, value: PREIS_PRO_KISTE, currency: 'EUR' });
      }
    }
    if (t.name === 'zahlungsart') {
      zeigeFehler('zahlungsart', '');
      zeigePanel(t.value);
    }
    if (t.type === 'checkbox' && REGELN[t.name]) pruefe(t.name);
  });

  function zeigePanel(art) {
    form.querySelectorAll('[data-payment-panel]').forEach(function (p) {
      var aktiv = p.getAttribute('data-payment-panel') === art;
      p.hidden = !aktiv;
    });
    // Fehler in ausgeblendeten Panels zurücksetzen
    Object.keys(ZAHLUNGSARTEN).forEach(function (k) {
      if (k !== art) ZAHLUNGSARTEN[k].felder.forEach(function (f) { zeigeFehler(f, ''); });
    });
  }
  if (zahlungsart()) zeigePanel(zahlungsart()); // nach Zurück-Navigation

  /* ---------- Sticky-Button ---------- */
  var sticky = document.getElementById('sticky-cta');
  if (sticky && 'IntersectionObserver' in window) {
    var sichtbar = new Set();
    var ziele = [document.querySelector('.hero .btn'), document.getElementById('kiste'), document.getElementById('formular')];
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) sichtbar.add(en.target); else sichtbar.delete(en.target);
      });
      sticky.classList.toggle('is-hidden', sichtbar.size > 0);
    }, { threshold: 0.15 });
    ziele.forEach(function (z) { if (z) io.observe(z); });
    sticky.addEventListener('click', function () {
      sticky.setAttribute('href', wert('kiste') ? '#formular' : '#kiste');
    });
  }

  /* ---------- Absenden ---------- */
  var submitBtn = document.getElementById('submit-btn');
  var formError = document.getElementById('form-error');
  var sendet = false;
  var BTN_TEXT = submitBtn.textContent;

  function zeigeFormFehler(msg) {
    formError.textContent = msg;
    formError.hidden = !msg;
  }

  function freigeben() {
    sendet = false;
    submitBtn.disabled = false;
    submitBtn.textContent = BTN_TEXT;
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (sendet) return;
    zeigeFormFehler('');

    // Honeypot gefüllt: so tun, als wäre alles gut
    if (form.elements.website.value) { location.href = 'danke.html'; return; }

    var ersterFehler = null;
    REIHENFOLGE.forEach(function (name) {
      beruehrt[name] = true;
      if (pruefe(name) && !ersterFehler) ersterFehler = name;
    });
    if (ersterFehler) {
      var el = ersterFehler === 'kiste' ? document.getElementById('kiste') : feldElement(ersterFehler);
      if (ersterFehler === 'kiste') { el.scrollIntoView({ block: 'start' }); feldElement('kiste').focus({ preventScroll: true }); }
      else if (el) { el.focus(); }
      return;
    }

    sendet = true;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Wird gesendet …';

    var eventId = uuid();
    var art = zahlungsart();
    var attr = readJSON(session, ATTR_KEY) || {};
    var daten = {
      kiste: wert('kiste'),
      vorname: wert('vorname'),
      nachname: wert('nachname'),
      email: wert('email'),
      telefon: wert('telefon'),
      strasse: wert('strasse'),
      plz: wert('plz'),
      ort: wert('ort'),
      zahlungsart: art,
      kontoinhaber: art === 'sepa' ? wert('kontoinhaber') : '',
      iban: art === 'sepa' ? cleanIban(wert('iban')) : '',
      sepa_mandat: art === 'sepa' ? wert('sepa_mandat') : '',
      lieferhinweis: wert('lieferhinweis'),
      agb: wert('agb'),
      website: form.elements.website.value,
      utm_source: attr.utm_source || '',
      utm_medium: attr.utm_medium || '',
      utm_campaign: attr.utm_campaign || '',
      utm_content: attr.utm_content || '',
      fbclid: attr.fbclid || '',
      fbclid_ts: attr.fbclid_ts || '',
      // Für Meta CAPI (nur mit Zustimmung genutzt)
      event_id: eventId,
      consent_marketing: hasConsent(),
      fbp: getCookie('_fbp'),
      fbc: getCookie('_fbc'),
      page_url: location.href.split('#')[0]
    };

    var ctrl = 'AbortController' in window ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 20000);

    fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(daten),
      signal: ctrl ? ctrl.signal : undefined
    })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (body) {
          return { ok: res.ok, body: body };
        });
      })
      .then(function (r) {
        clearTimeout(timer);
        if (r.ok && r.body && r.body.ok) {
          session.set(LEAD_KEY, JSON.stringify({
            event_id: eventId,
            kiste: daten.kiste,
            bestellnummer: r.body.bestellnummer || ''
          }));
          location.href = 'danke.html';
          return;
        }
        // Serverseitige Feldfehler anzeigen
        if (r.body && r.body.fehler) {
          var erstes = null;
          Object.keys(r.body.fehler).forEach(function (k) {
            zeigeFehler(k, r.body.fehler[k]);
            if (!erstes) erstes = k;
          });
          var fe = erstes && feldElement(erstes);
          if (fe) fe.focus();
        }
        zeigeFormFehler((r.body && r.body.message) || 'Da ist etwas schiefgelaufen. Bitte versuch es noch einmal oder ruf uns an: 04847 8094700.');
        freigeben();
      })
      .catch(function () {
        clearTimeout(timer);
        zeigeFormFehler('Keine Verbindung. Bitte prüf dein Internet und versuch es noch einmal. Oder ruf uns an: 04847 8094700.');
        freigeben();
      });
  });

  // Nach Zurück aus dem Cache: Button wieder aktiv
  window.addEventListener('pageshow', function (e) { if (e.persisted) freigeben(); });
})();
