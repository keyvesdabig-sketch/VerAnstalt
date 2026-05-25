# Roadmap

Feature-Pipeline für CalandaKultur. Polish-Items aus PR-Reviews liegen separat in [TODO.md](TODO.md).

## Now

_(zwischen Iterationen — kein aktives Feature in Arbeit)_

## Next

### 🏗️ Admin-Dashboard + persistente Event-Kuration

Zusammenhängender Block. Foto-Scanner ist als MVP fertig (siehe Done), schreibt
aber heute nur in lokales `chur_events_custom`. Damit gescannte/genehmigte
Events live auf der Page landen, braucht's diesen Block.

1. **`public/curated-events.json` einführen + Frontend-Merge.**
   Neue Datenquelle parallel zu `scraped-events.json`. Frontend merged beide (plus `customLocal` aus localStorage) beim Render. Verhindert Race Conditions mit dem täglichen Scraper-Commit.

2. **`public/admin.html` als separate Reviewer-only Seite.**
   Eigene Datei, nicht Hash-Route — sauberer, kein Code-Bloat in der Public-App. Hinter Reviewer-Gate (selbes Secret-Pattern wie das Banner).

3. **GitHub Contents API als Commit-Backend.**
   Owner-PAT im Settings-Modal (neben dem Gemini-Key), App macht `PUT /repos/.../contents/public/curated-events.json`. Pages re-deployt automatisch via bestehenden `pages.yml`-Workflow. Kein neues Hosting.

4. **Review-Queue + Foto-Scanner ins Dashboard migrieren.**
   Heute Inline-Banner / Inline-Wizard auf der Hauptseite → beide ins Admin-Dashboard heben. Approve = Commit nach `curated-events.json`. Bulk-Approve + Edit-vor-Approve für die Social-Queue.

5. **Manueller Event-CRUD im Dashboard.**
   Vorhandene Events in `curated-events.json` editieren / löschen — derselbe Commit-Pfad.

6. **Scrape-Log-Viewer.**
   `data/scrape-log.json` im Dashboard rendern: wann lief der letzte Run, wieviele Events, wo gabs Fehler. Read-only, hilft bei „warum tauchen die nicht auf"-Debugging.

7. **Multi-Event-Auswahl im Foto-Wizard.**
   Wenn das Plakat eine Konzert-/Festivalreihe zeigt → Liste aller erkannten Events mit Checkboxen, einzeln oder als Bulk übernehmen. Heute wird nur das erste extrahierte Event vorausgefüllt.

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
- Speichert in lokales `chur_events_custom` (Live-Publishing kommt mit dem Admin-Dashboard, siehe Next)

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
