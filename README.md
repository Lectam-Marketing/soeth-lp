# Söth's Biokiste: Landingpage 5+1

Schlanke Bestellseite für das Neukunden-Angebot (5 Kisten bezahlen, 6. gratis). Reines HTML/CSS/JS, kein Build.

## Dateien
| Datei | Zweck |
|---|---|
| `index.html` | Landingpage mit Formular |
| `danke.html` | Bestätigung nach dem Absenden (feuert das `Lead`-Event) |
| `styles.css` | Styles, Branding als CSS-Variablen in `:root` |
| `main.js` | Formular, IBAN-Prüfung, Sticky-Button, Consent, Meta Pixel, UTM |
| `netlify/functions/submit.js` | Validierung, Bestellnummer, Make-Webhook, Meta CAPI |
| `scripts/bilder-holen.sh` | Holt vorläufige Fotos von der Website als WebP |

## Preis ändern
Zwei Stellen, beide heißen `PREIS_PRO_KISTE`: oben in `main.js` (Anzeige, Pixel-Wert) und oben in `netlify/functions/submit.js` (das, was an Make geht).

## Netlify einrichten
1. Repo in Netlify verbinden. Build Command leer, Publish Directory `.` (steht schon in `netlify.toml`).
2. Unter *Site configuration > Environment variables* setzen: `MAKE_WEBHOOK_URL`, `META_PIXEL_ID`, optional `META_CAPI_TOKEN`.
3. Deploy. Jeder Push auf `main` geht live.

## Lokal testen
```bash
npm i -g netlify-cli
cp .env.example .env        # Werte eintragen (Test-Webhook nehmen!)
netlify dev                 # http://localhost:8888
```
Test-IBAN (gültige Prüfziffer): `DE89 3704 0044 0532 0130 00`.
Vor jedem Push: Formular lokal absenden, Ansicht auf 375 px prüfen.

## Tracking
- Banner mit Akzeptieren/Ablehnen, Entscheidung in `localStorage` (`sb_consent_v1`). Widerruf über „Cookie-Einstellungen“ im Footer.
- Pixel lädt erst nach Zustimmung. `PageView` beim Laden, `ViewContent` bei Kistenwahl, `Lead` auf `danke.html` (value 150 EUR, gleiche `event_id` wie CAPI).
- CAPI wird nur gesendet, wenn `META_CAPI_TOKEN` gesetzt ist **und** der Kunde dem Tracking zugestimmt hat.

## Erweiterungen (Phase 2)
- **PayPal-Abo:** Radio + Panel `data-payment-panel="paypal"` in `index.html`, Eintrag in `ZAHLUNGSARTEN` in `main.js` und `submit.js`.
- **PLZ-Prüfung:** `pruefePlz()` in `main.js` und die markierte Stelle in `validiere()` in `submit.js`.

## Offene TODOs
`grep -rn "TODO" --include=*.html --include=*.js --include=*.sh .` zeigt alles, was der Kunde noch bestätigen muss.

## Arbeitsweise
Vor jeder Session `git pull`. Kleine Commits auf Deutsch, nach jedem Schritt pushen.

> Hinweis Datenschutz: Das Google Sheet in Make enthält IBANs. Zugriff auf das Nötigste beschränken.
