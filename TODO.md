# Backlog

Offene Polish-Items aus Code-Reviews. Reihenfolge ~ Priorität.

## Aus PR #8 Review (24.05.2026)

### 🟢 `onerror`-Attribut: HTML-Escape im JS-String-Kontext
`public/app.js` Z. 1334 + 1811:
```html
onerror="this.onerror=null;this.src='${escapeHtml(fallback)}'"
```
Aktuelle Fallback-URLs (`event-images/*.jpg`, Unsplash) enthalten keine Apostrophe → funktioniert. Wäre eine Fallback-URL je quote-haltig, würde HTML-decoding den Wert zurück zu `'` machen und das JS bricht. Kein XSS (Werte stammen aus Code, nicht User-Input), aber fragil.
**Fix:** `JSON.stringify(fallback)` statt manuellem `'…'` (deckt Quote-Escaping korrekt ab).

### 🟢 `scripts/cleanup-event-images.js`: Error-Pfade inkonsistent
Z. 89: `req.on('error', () => resolve(null))` umgeht den `done()`-Wrapper mit `settled`-Flag, während `res.on('error')` ihn benutzt. Praktisch egal (Promise.resolve idempotent), aber wer das Pattern liest, fragt sich „warum der Wrapper im einen Fall, nicht im anderen?".
**Fix:** `req.on('error', () => done(null))` für Konsistenz.

### 🟢 Test-Glob ist Node-Version-abhängig
`package.json` `"test": "node --test \"test/**/*.test.js\""` — Node selbst expandiert das Glob seit v22. Auf älteren Nodes ist es ein No-Match.
**Fix:** `"engines": { "node": ">=22" }` in `package.json` ergänzen, sonst Stolperfalle für neue Mitwirkende.

## Aus PR #7 Review (24.05.2026)

### 🟢 Keine Migrations-Notiz für localStorage-Keys
Die Keys `chur_events_favorites`, `chur_events_custom`, `chur_events_reviewed_social_ids` bleiben bewusst auf altem Namen (Bestandsdaten würden sonst verloren gehen). Falls je eine Umbenennung gewünscht: einmaligen Migrations-Pass beim App-Start einbauen (`getItem(alt) → setItem(neu) → removeItem(alt)`).
