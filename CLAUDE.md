# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm test              # node --test, läuft test/**/*.test.js (braucht Node >=22 für Glob-Expansion). Aktuell 75 Tests.
npm run dev           # http-server auf public/ Port 8080 — Frontend lokal anschauen
npm run scrape        # Multi-Source Event-Scrape (siehe SOURCES in src/scrape-events.js): LocalCities (16 Gemeinden) + Konsum-Cazis + Chur-Kultur via Gemini, Streaminghall via iCal
npm run scrape:social # Gemini-basierter Daily-Scrape → public/pending-social-events.json (Review-Queue)
node scripts/cleanup-event-images.js [--no-fetch]   # Backfill für public/scraped-events.json (idempotent)
```

`npm run scrape` braucht `GEMINI_API_KEY` (für alle Gemini-Quellen inkl. Chur-Kultur). `FIRECRAWL_API_KEY` ist nur noch für etwaige `kind: 'firecrawl'`-Quellen relevant — aktuell nutzt keine Live-Source mehr Firecrawl.
`npm run scrape:social` braucht `GEMINI_API_KEY`. Refused-to-write-mock-data: läuft ohne echten Key gar nicht erst los.

## Architecture

**Reines Vanilla-Frontend + Node-Scripts, kein Build-Step.**

```
src/                 Backend-Scripts (Node)
  scrape-events.js   Multi-Source-Dispatcher: kind: 'firecrawl' | 'gemini' | 'ical'. Liest suppressed-event-ids.json und überspringt gelöschte. Enrichment-Pass holt og:image via fetchEventDetails.
  scrape-social.js   Gemini 2.5 Flash mit Google-Search-Grounding, eine Anfrage pro Gemeinde → public/pending-social-events.json (Review-Queue, nicht direkt live).
  event-schema.json  JSON-Schema für die Firecrawl-Extraktion (Gemini-Pfad nutzt eigenes UPPERCASE-Schema inline).
  lib/image-clean.js   IMAGE_BLOCKLIST_PATTERNS, sanitizeImage, upgradeImageUrl etc. Geteilt mit Backfill-Script.
  lib/ical-parse.js    RFC-5545-Subset Parser für iCal-Feeds (Streaminghall). UMD, eigene Tests.
  lib/gemini-extract.js Firecrawl-Ersatz: fetch HTML → cleanHtmlForExtraction → Gemini Flash mit response_schema. Reine Helper sind testbar.

public/              Statisches Frontend (served von http-server)
  index.html         App-Shell (Sidebar/Hero/Filter/Liste/Karte). Hero-Variante via body[data-hero="highlight"].
  app.js             Ganze Frontend-Logik in einer IIFE inside DOMContentLoaded. Render-Pipeline → renderEventCards → Datums-Buckets. Exponiert window.appState (getter/setter) für admin/*-Module.
  style.css          Design-System (Alpenrhein Premium, Crème + Bündner-Rot, Fraunces/Inter). .admin-only-Visibility-Regel via body[data-reviewer="true"].
  events-data.js     Statische Initial-Events als Fallback, falls scraped-events.json nicht erreichbar.
  scraped-events.json          Daily-Scraper-Output. Frontend-Datenquelle.
  curated-events.json          Vom Admin manuell kuratierte Events (Foto-Imports, Edits, Review-Approves). Committed via GitHub-API aus dem Browser.
  suppressed-event-ids.json    Liste gelöschter Event-IDs. Scraper überspringt sie beim Einlesen, Frontend filtert sie raus.
  pending-social-events.json   Review-Queue vom Social-Scraper.
  lib/event-dedup.js           UMD, Fuzzy-Dedup (Dice-Koeffizient) für Manual-Add + Review.
  lib/event-state.js           UMD, mergeEventSources(scraped, curated, suppressedSet) → finale Liste.
  admin/                       Reviewer-only Module, alle als <script defer>. Checken localStorage.chur_events_reviewer direkt, nicht body[data-reviewer] (Timing).
    admin-commit.js            UMD, GitHub Contents API mit sha-Optimistic-Lock + 1× Retry. verifyPat-Helper für Settings.
    admin-shared.js            UMD, High-Level: appendToCurated, upsertCurated, removeFromCurated, addSuppressed, removeFromSuppressed.
    admin-drawer.js            Rechter Slide-In-Drawer mit Live-Stats + Werkzeug-Buttons.
    admin-database.js          Full-Screen-DB-Modal mit Tabelle, Filter, Sortierung, Bulk-Delete, Suppressed-Undo.

data/                Server-seitig, nicht ausgeliefert
  events-database.json   Source-of-truth-DB des Scrapers, zur Dedup über Läufe hinweg.
  scrape-log.json        Lauf-Statistiken.

scripts/             Einmalige/manuelle Maintenance-Tools
  cleanup-event-images.js   Re-Cleanup-Pass; Logik identisch zum Live-Scraper, nützlich nach Anpassung der Blocklist.

docs/superpowers/    Implementation-Plans + Design-Specs aus der superpowers-Skill (historischer
                     „warum ist das so gebaut"-Kontext, v.a. Social-Scrape + Admin-System). Nicht code-relevant.

test/                node --test Unit-Suite (~75 Tests): image-clean, event-dedup, event-state, ical-parse,
                     gemini-extract, admin-commit, admin-shared. UI-Module (drawer, database) sind nicht unit-getestet.
.github/workflows/   scrape.yml (06:00 UTC) + scrape-social.yml (07:00 UTC) Cron-Jobs;
                     pages.yml deployt public/ nach GitHub Pages bei jedem Push UND nach erfolgreichem Scrape (workflow_run-Trigger).
```

### Datenfluss — Drei-Schichten-Datenmodell

```
Daily-Scraper (Bot)  →  public/scraped-events.json      (täglich überschrieben)
                     →  public/pending-social-events.json (Review-Queue)
                     →  data/events-database.json + data/scrape-log.json (server-side)

Admin-Browser (PAT)  →  public/curated-events.json      (Foto-Imports, Edits, Approves)
                     →  public/suppressed-event-ids.json (gelöschte IDs)
```

1. **Daily**: GitHub-Actions-Cron startet `scrape-events.js` und `scrape-social.js`. Beide Jobs committen ihre Outputs zurück nach `main`. Scraper überspringt `suppressed-event-ids.json` beim Einlesen.
2. **Browser** (`app.js`): lädt alle drei Schichten parallel via `Promise.all`, merged via `EventState.mergeEventSources(scraped, curated, suppressedSet)` — suppressed raus, curated überschreibt scraped bei gleicher ID, pure curated-Events angehängt.
3. **Admin-Aktionen** (Reviewer-only, hinter Obscurity-Gate): inline-Delete/Edit auf Karten, Foto-Import-Wizard, Review-Approve → alle gehen durch `admin-shared.js` → `admin-commit.js` → `PUT /repos/.../contents/{path}` mit Fine-grained PAT. Optimistic-UI mit Toast, Pages re-deployt via `workflow_run`-Trigger ~30 s später.
4. **User-Aktionen** (Public): Favoriten in `localStorage`. Custom-Events sind seit dem Admin-System nur noch ein Legacy-Pfad — neue Events landen via Admin-Pipeline direkt in `curated-events.json`.
5. **Backfill**: `scripts/cleanup-event-images.js` kann jederzeit über `scraped-events.json` + `events-database.json` laufen — idempotent.

### Image-Pipeline

- Live-Scraper und Backfill nutzen denselben `sanitizeImage` aus `src/lib/image-clean.js` — Blocklist (UI-Chrome, Sprites, SVG) + Guidle-Thumbnail-Upgrade (`tr:n-{size}` → `tr:w-1200,h-800,dpr-1`).
- Wenn nach Sanitization noch immer kein Bild da ist, holt `fetchEventDetails` aus `scrape-events.js` als Fallback `og:image` / `twitter:image` von der Detail-Seite.
- Frontend: `FALLBACK_IMAGES_BY_CATEGORY` ist ein 3er-Pool pro Kategorie (2 lokale `public/event-images/` + 1 Unsplash); `pickFallback(category, eventId)` wählt deterministisch via FNV-1a-Hash — gleiches Event behält sein Bild, verschiedene Events derselben Kategorie sehen unterschiedlich aus.

### Brand & localStorage

UI-strings sind auf **CalandaKultur** rebranded. **localStorage-Keys bleiben bewusst `chur_events_*`** — Umbenennen ohne Migrations-Pass würde Bestandsdaten zerstören.

| Key | Zweck |
|-----|-------|
| `chur_events_favorites` | Favoriten (Set von Event-IDs, JSON-serialisiert) |
| `chur_events_custom` | Legacy: vom User manuell hinzugefügte Events. Seit Admin-System nur noch Bestandsdaten + Migrations-Quelle. |
| `chur_events_reviewed_social_ids` | Bereits abgehakte Social-Review-Events |
| `chur_events_reviewer` | `'1'` wenn Reviewer-freigeschaltet (via `?reviewer=<secret>`) |
| `chur_events_gemini_key` | Gemini-API-Key für Foto-Wizard (BYOK, Reviewer-only) |
| `chur_events_github_pat` | Fine-grained GitHub-PAT für Admin-Commits (Reviewer-only) |
| `chur_events_migration_v1` | Marker: einmaliger Legacy-Migrations-Prompt schon gezeigt/erledigt |

### Deployment

Live auf **GitHub Pages**: https://keyvesdabig-sketch.github.io/VerAnstalt/

- Pages-Source ist „Build via Workflow" (nicht Branch-Deploy — Branch-Mode lässt nur `/` oder `/docs` zu, wir brauchen `public/`).
- `.github/workflows/pages.yml` läuft auf jedem Push nach `main`, der `public/**` ändert (inkl. der täglichen Scraper-Commits) → Auto-Deploy.
- Daten-JSONs (`scraped-events.json`, `pending-social-events.json`) liegen unter `public/` und werden mit deployed.

### Reviewer-Gate + Admin-System

**Freischaltung:** Browser muss einmal `?reviewer=<secret>` aufrufen → `localStorage.chur_events_reviewer = '1'`. Secret liegt in `public/app.js` als `REVIEWER_SECRET` (rotierbar). Logout via `?reviewer=logout`. **Kein echter Auth — Code ist öffentlich**; reicht nur gegen zufällige Besucher.

**Sichtbarkeitsmodell:** Reviewer-Flag setzt `body[data-reviewer="true"]` → CSS-Regel `.admin-only` wird sichtbar (Drawer-Button in Sidebar, Karten-Footer mit ✏/🗑). Public-Besucher sehen die App pixel-identisch zur Vor-Admin-Version.

**Admin-Module** in `public/admin/` checken `localStorage.chur_events_reviewer` direkt (nicht das body-Attribut — defer-Scripts laufen vor app.js' DOMContentLoaded-Handler, sonst Timing-Race).

**Commit-Pfad:** Jede Admin-Aktion (Inline-Delete, Edit, Foto-Save, Review-Approve, Migration) ruft `AdminShared.*` → `AdminCommit.commitJsonFile` → GitHub Contents API mit PAT aus `localStorage.chur_events_github_pat`. sha-Optimistic-Lock + 1× Auto-Retry bei 409. Für Loops (Migration) wird gebatcht in EINEN Commit, weil GitHub-CDN-Latenz sequenzielle GET-PUT-Ketten mit Stale-sha-409 sprengt.

## Conventions

- Antworten auf Deutsch (Hochdeutsch). Technische Identifier/Pfade auf Englisch.
- Vor grösseren Änderungen Plan als Bullet-Liste posten und auf OK warten.
- `ROADMAP.md` + `TODO.md` zu Session-Beginn lesen. Roadmap = Features (Now/Next/Later/Done), TODO = Polish-Items aus PR-Reviews.
- Commit-Format: `feat(scope):` / `fix(scope):` / `chore(scope):` / `refactor(scope):` / `docs:`, Body auf Deutsch.
- Keine `node_modules`, `.env`, `raw-agent-output.json` committen (siehe `.gitignore`). `event-images/` IST committet.

## Things that look weird but are intentional

- `FALLBACK_IMAGES` in `public/app.js` ist ein **Proxy** über `FALLBACK_IMAGES_BY_CATEGORY[0]` — Legacy-Brücke für zwei inline-`onerror`-Handler, die keinen `pickFallback`-Aufruf einbetten können.
- Hero-Layout ist über `body[data-hero="highlight"]` festverdrahtet; weitere Varianten (`editorial`, `zeile`, `kompakt`, `magazin`) wurden im Design-Handoff entworfen, aber nicht eingebaut.
- `escapeHtml` ist in `app.js` zweimal definiert (Render-Pfad + Import-Wizard). Die zweite Definition gewinnt (Hoisting), beide sind funktionsgleich. `admin-database.js` hat seine eigene lokale Kopie (IIFE-Scope).
- `npm test` braucht Node ≥ 22 — Glob-Expansion macht Node selbst (`--test`), nicht die Shell.
- `admin/*.js` lesen Reviewer-Flag aus localStorage statt aus `body[data-reviewer]`, obwohl letzteres existiert — defer-Scripts laufen *vor* app.js' DOMContentLoaded-Handler, der das Attribut setzt. localStorage ist synchron verfügbar.
- `window.appState` exponiert IIFE-interne Vars via Getter/Setter (nicht Snapshots), damit admin/* Module immer aktuelle Werte sehen und durch Reassignment die outer-scope-Variablen updaten.
- Migration committet alle legacy-Events in EINEN GitHub-Commit — sequenzielle commits triggern Stale-sha-409 durch GitHub-CDN-Latenz (~1 s read-after-write).
