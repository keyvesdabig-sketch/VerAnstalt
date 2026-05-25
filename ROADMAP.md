# Roadmap

Feature-Pipeline für CalandaKultur. Polish-Items aus PR-Reviews liegen separat in [TODO.md](TODO.md).

## Now

_(frisch deployed, kein aktives Feature in Arbeit)_

## Next

### 🏗️ Admin-Dashboard + persistente Event-Kuration

Zusammenhängender Block — die einzelnen Schritte bauen aufeinander auf und ergeben isoliert weniger Sinn.

1. **`public/curated-events.json` einführen + Frontend-Merge.**
   Neue Datenquelle parallel zu `scraped-events.json`. Frontend merged beide (plus `customLocal` aus localStorage) beim Render. Verhindert Race Conditions mit dem täglichen Scraper-Commit.

2. **`public/admin.html` als separate Reviewer-only Seite.**
   Eigene Datei, nicht Hash-Route — sauberer, kein Code-Bloat in der Public-App. Hinter Reviewer-Gate (selbes Secret-Pattern wie das Banner).

3. **GitHub Contents API als Commit-Backend.**
   Owner-PAT in localStorage (Settings-Modal), App macht `PUT /repos/.../contents/public/curated-events.json`. Pages re-deployt automatisch via bestehenden `pages.yml`-Workflow. Kein neues Hosting.

4. **Review-Queue ins Dashboard migrieren.**
   Heute Inline-Banner auf der Hauptseite → ins Admin-Dashboard heben mit Bulk-Approve + Edit-vor-Approve (Titel/Datum/Bild fixen, dann erst übernehmen). Approve = Commit nach `curated-events.json`, gleichzeitig in `chur_events_reviewed_social_ids` markieren.

5. **📸 Foto-zu-Event-Wizard.**
   Das Trigger-Feature. `<input type="file" capture="environment">` → Gemini 2.5 Flash Vision mit Structured-Output-Schema (Titel/Datum/Zeit/Ort/Beschreibung/Kategorie/Veranstalter/Ticket-Link) → Wizard-Vorausfüllung → User korrigiert → Commit nach `curated-events.json`. Bild als komprimierte Base64-Data-URL (max 800 px breit) im Event-Objekt.
   - Bring-your-own-key (Gemini-API-Key in Settings), Phase 1.
   - Mehrere Events auf einem Plakat → Schema als Array, User wählt im Wizard.
   - Edge-Cases: Datum ohne Jahr → nächstkommend; leere Felder erlaubt.

6. **Manueller Event-CRUD im Dashboard.**
   Vorhandene Events in `curated-events.json` editieren / löschen — derselbe Commit-Pfad.

7. **Scrape-Log-Viewer.**
   `data/scrape-log.json` im Dashboard rendern: wann lief der letzte Run, wieviele Events, wo gabs Fehler. Read-only, hilft bei „warum tauchen die nicht auf"-Debugging.

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
- **Duplikat-Heuristik** (ähnlicher Titel + selbe Location ± 1 Tag → markiere als „aktualisierte Version" statt als neu).

### Optional / komplex
- **Mehrsprachig DE/EN/IT** — Touristen-Region, aber großer Wartungsaufwand.
- **Mehrere Favoriten-Listen** („Mit Kindern", „Date Night").
- **Newsletter / RSS** — braucht externes System.
- **Push-Notifications** für Favoriten 24 h vorher — PWA-Erweiterung.

## Done

- **GitHub Pages Deployment** via `actions/deploy-pages` (public/ → Auto-Deploy bei jedem Push).
- **Reviewer-Gate**: Review-Banner hinter Obscurity-Secret (`?reviewer=…`).
- **Workflow-Pfade** nach `src/`-Split nachgezogen + `node@22`.
- **Mountain-Kontur** über `mask-image` + `var(--rule)` (Theme-fähig).
- **`onerror`-Fallback** via `JSON.stringify` quote-safe.
- **`cleanup-event-images`** Error-Pfade auf einheitlichen `done()`-Wrapper.
- **`engines.node >=22`** deklariert.
- **`scrape-log.json`** nach `data/` verschoben (vorher fälschlich in `src/`).
