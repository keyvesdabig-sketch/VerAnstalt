# Roadmap

Feature-Pipeline für CalandaKultur. Polish-Items aus PR-Reviews liegen separat in [TODO.md](TODO.md).

## Now

_(zwischen Iterationen — kein aktives Feature in Arbeit)_

## Next

_(Admin-Block ist live — Hauptpipeline durch. Was hier landet, sind kleinere
Anschluss-Features, sortiert nach erwartetem Nutzen.)_

### 🎟️ Multi-Event-Auswahl im Foto-Wizard
Wenn das Plakat eine Konzert-/Festivalreihe zeigt → Liste aller erkannten Events mit Checkboxen, einzeln oder als Bulk übernehmen. Heute wird nur das erste extrahierte Event vorausgefüllt.

### 🪄 Bulk-Edit im DB-Dashboard
Heute gibt's Bulk-Delete. Bulk-Edit (z.B. Kategorie einer Auswahl gleichzeitig ändern) wurde im Spec bewusst gestrichen — falls Bedarf entsteht, nachziehen.

### 🔁 Chur-Kultur wieder onboarden
JS-rendered SPA mit Guidle-Backend (siehe [TODO.md](TODO.md)). Optionen: Guidle-API direkt sniffen, Puppeteer ins Scrape-Workflow, oder die Source rauswerfen falls LocalCities-Chur reicht.

## Later

Sortiert nach erwartetem Impact, nicht nach Aufwand.

### Discovery & Browsing
- **Volltext-Suche** über Titel/Ort/Beschreibung — Reflex-Feature, fehlt komplett.
- **Quick-Filter „Dieses Wochenende"** neben den Datums-Buckets.
- **„In meiner Nähe"** (Geolocation, sortiert Events nach Distanz; Karte ist eh schon da).
- **Kategorien stummschalten** („zeig mir nie wieder Sport") — flag in localStorage.

### Engagement / Sharing
- **.ics-Export** für Favoriten + Einzel-Events — Standard-Feature, das man von Event-Seiten erwartet.
- **Deep-Links + Web-Share-API** (URL-Hash `#event=<id>` → Detail-Modal direkt offen).
- **Open-Graph-Tags pro Event** → WhatsApp/Telegram-Preview mit richtigem Bild.
- **iCal-Feed-URL zum Abonnieren** (statisches `.ics` im Pages-Deploy).

### App-Gefühl
- **PWA** (Manifest + Service Worker) — installierbar auf Handy, letzte Daten offline.
- **Dark Mode** — CSS-Var-System ist bereits sauber, Toggle in Sidebar + `[data-theme="dark"]` Override.
- **„Letzte Aktualisierung: vor 2 h"** sichtbar im Footer (Timestamp ist schon im JSON).

### Content-Qualität
- **Event-Status-Detection** (Ausverkauft/Abgesagt aus Detail-Seite, mit Badge im UI).
- **Backend-Dedup**: Fuzzy-Pass im täglichen Scraper über die `event-dedup`-Lib (heute nur exakte ID-Dedup im Server).

### Optional / komplex
- **Mehrsprachig DE/EN/IT** — Touristen-Region, aber großer Wartungsaufwand.
- **Mehrere Favoriten-Listen** („Mit Kindern", „Date Night").
- **Newsletter / RSS** — braucht externes System.
- **Push-Notifications** für Favoriten 24 h vorher — PWA-Erweiterung.

## Done

### 🪟 Scrape-Log-Viewer im Drawer
Read-only „Scrape-Status"-Sektion im Admin-Drawer: letzter Run (Relativzeit), Totale + Aufschlüsselung pro Quelle inkl. 🔴-Fehler-Markierung. Scraper trackt pro Quelle `{name, kind, events, error}` (Runner geben jetzt `{events, error}` statt nackter Arrays zurück), Log wird zusätzlich nach `public/scrape-log.json` geschrieben (deploybar). Neue UMD-Lib `scrape-log-format.js` (`formatRelativeTime`, `summarizeLog`, 11 Tests), graceful gegen Altbestand ohne `sources`-Feld.

### 🏗️ Admin-System (vollständig — 7 Tasks)
Inline-CRUD, Drawer-Hub, DB-Dashboard, GitHub-Commit-Pipeline. Foto-Imports, Manual-Adds und Review-Approves landen jetzt alle in `curated-events.json` und sind für alle Besucher sichtbar nach ~30 s.

- **Drei-Schichten-Datenmodell**: `scraped-events.json` (Daily-Scraper) + `curated-events.json` (eigene Kuration) + `suppressed-event-ids.json` (gelöschte IDs). Frontend merged alle drei beim Render via `public/lib/event-state.js` (UMD, 7 Tests). Scraper überspringt suppressed-IDs.
- **GitHub-Commit-Helper** (`public/admin/admin-commit.js`, UMD): `commitJsonFile` mit sha-Optimistic-Lock + 1× Auto-Retry bei 409. `verifyPat` für Settings-Modal-Validierung. Fine-grained PAT in `localStorage.chur_events_github_pat`.
- **Admin-Shared** (`public/admin/admin-shared.js`, UMD): high-level Mutationen (`appendToCurated`, `upsertCurated`, `removeFromCurated`, `addSuppressed`, `removeFromSuppressed`) mit 5 Tests (Mock-Commit).
- **Inline-Aktionen auf jeder Event-Karte** (Reviewer-only Footer): ✏ Bearbeiten + 🗑 Löschen. Edit recycelt das Add-Event-Modal via `mode: 'edit'`. Optimistic UI mit Toast-Feedback (Committe / ✓ / ✗).
- **Admin-Drawer rechts** (`public/admin/admin-drawer.js`): Live-Stats (Events / Curated / Suppressed / Review-Queue), Werkzeug-Buttons (DB-Dashboard, Review-Queue, Settings, Logout).
- **Datenbank-Dashboard** (`public/admin/admin-database.js`): Full-Screen-Modal mit Tabelle, Filter (Quelle/Gemeinde/Volltext), Sortierung, Bulk-Delete, Suppressed-View mit ⟲ Wiederherstellen, Inline-Edit-Aufruf.
- **Settings-Modal erweitert** um GitHub-PAT-Feld + „PAT prüfen"-Test-Button.
- **Migration**: einmaliger Prompt für legacy `chur_events_custom` aus localStorage → bulk-commit nach curated.
- **Review-Approve** schreibt nach curated statt nur localStorage — der ganze Social-Review-Pfad ist jetzt end-to-end persistent.
- **Dedup-Self-Match-Fix**: Edit ignoriert das Event-being-edited beim Dedup-Check.

### Neue Event-Quellen + Firecrawl-Ersatz
- **iCal-Parser** (`src/lib/ical-parse.js`, RFC 5545 Subset, 15 Tests) — Streaminghall/Handmade-Music-Serie als erste iCal-Quelle live (7 Konzerte).
- **Gemini-Scraper** (`src/lib/gemini-extract.js`) als Firecrawl-Ersatz für SSR-Seiten — Credits-frei, ~4 Rp/Tag Tokenkosten. 13 von 15 LocalCities-Gemeinden liefern Events, Konsum-Cazis live.
- **LocalCities-IDs aktualisiert** — LocalCities hatte die internen Gemeinde-IDs neu vergeben, alte URLs grossteils 404.
- **Cazis als 16. Gemeinde** + Konsum-Cazis als Konzertquelle.
- **Pages-Auto-Deploy nach Scrape**: `workflow_run`-Trigger umgeht die `GITHUB_TOKEN`-Push-Limitation, so dass der tägliche Scraper-Commit Pages wieder selbsttätig deployt.

### Foto-zu-Event-Wizard (MVP)
Plakat fotografieren → Gemini 2.5 Flash Vision extrahiert Felder → Wizard vorausgefüllt → speichern.

- 📸 Upload + Canvas-Compression (max 800 px, JPEG q=0.8)
- ✨ Gemini-Call mit `response_schema` (typed enums für Kategorie/Gemeinde)
- Vorausfüllung aller Form-Felder + Karte zoomt auf Gemeindezentrum
- Reviewer-only Settings-Modal für Gemini-API-Key mit „Verbindung prüfen"
- Speichert seit Admin-System (siehe oben) direkt nach `curated-events.json` → live für alle Besucher.

### Dedup-Schicht
Gemeinsame Lib `public/lib/event-dedup.js` (UMD, mit Unit-Tests).

- Pre-Filter (Datum ≤ 1 Tag, gleiche Gemeinde) + Fuzzy-Titel (Dice-Koeffizient auf normalisierten Bigrammen)
- Sanftes Confirm-Prompt im Manual-Add-Wizard und beim Social-Review-Approve
- Duplikat-Badge pro Karte im Social-Review-Modal

### Infrastruktur
- **GitHub Pages Deployment** via `actions/deploy-pages` (public/ → Auto-Deploy bei jedem Push).
- **Reviewer-Gate** mit verifiziertem localStorage-Write (Tracking-Prevention-fähig).
- **Workflow-Pfade** nach `src/`-Split nachgezogen + `node@22`.

### Polish
- **Mountain-Kontur** über `mask-image` + `var(--rule)` (Theme-fähig).
- **`onerror`-Fallback** via `JSON.stringify` quote-safe.
- **`cleanup-event-images`** Error-Pfade auf einheitlichen `done()`-Wrapper.
- **`engines.node >=22`** deklariert.
- **`scrape-log.json`** nach `data/` verschoben (vorher fälschlich in `src/`).
- **Projektstruktur** aufgeräumt: `churevents-scraper/` + Top-Level `event-images/` weg, `events-data.js` Bild-URLs gefixt.
- **README.md** mit App-Übersicht, Scraping-Flow und Review-Workflow.
