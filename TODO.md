# Backlog

Offene Polish-Items aus Code-Reviews. Reihenfolge ~ Priorität.

## Quellen-Backlog

### 🟡 Chur-Kultur via JS-rendered SPA wieder zum Laufen bringen
`src/scrape-events.js` hat noch die SOURCES-Entry für `chur-kultur.ch/de/suche` mit `kind: undefined` → läuft via Firecrawl → fällt seit Credit-Aufbrauch leise um. LocalCities-Chur deckt einen Teil ab, aber chur-kultur ist die kuratierte Hauptquelle.

**Befund:** Seite rendert JS-only (Backend = Guidle), `fetch` liefert leeres Markup → unser `kind: 'gemini'`-Pfad würde auch nichts finden.

**Optionen:**
- **Guidle-API direkt:** DevTools auf chur-kultur.ch → XHR-Tab → schauen, welche `api.guidle.com`-Endpoints aufgerufen werden. Mit der Org-/Channel-ID kommt man oft an einen öffentlichen JSON/iCal-Feed.
- **Puppeteer / Playwright:** ~150 MB Browser im CI, läuft aber zuverlässig. Headless-Render → HTML an unseren `kind: 'gemini'`-Extractor weitergeben.
- **Source rausnehmen:** falls die Mühe zu gross — LocalCities-Chur als Fallback akzeptieren.



### 🟢 Keine Migrations-Notiz für localStorage-Keys
Die Keys `chur_events_favorites`, `chur_events_custom`, `chur_events_reviewed_social_ids` bleiben bewusst auf altem Namen (Bestandsdaten würden sonst verloren gehen). Falls je eine Umbenennung gewünscht: einmaligen Migrations-Pass beim App-Start einbauen (`getItem(alt) → setItem(neu) → removeItem(alt)`).
