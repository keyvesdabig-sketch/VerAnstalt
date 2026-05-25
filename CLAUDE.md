# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm test              # node --test, läuft test/**/*.test.js (braucht Node >=22 für Glob-Expansion)
npm run dev           # http-server auf public/ Port 8080 — Frontend lokal anschauen
npm run scrape        # Firecrawl-basierter Event-Scrape (chur-kultur.ch + LocalCities, 15 Gemeinden)
npm run scrape:social # Gemini-basierter Daily-Scrape → public/pending-social-events.json (Review-Queue)
node scripts/cleanup-event-images.js [--no-fetch]   # Backfill für public/scraped-events.json (idempotent)
```

`npm run scrape:social` braucht `GEMINI_API_KEY` (lokal aus `.env`, in CI aus Repo-Secret). Refused-to-write-mock-data: läuft ohne echten Key gar nicht erst los.

## Architecture

**Reines Vanilla-Frontend + Node-Scripts, kein Build-Step.**

```
src/                 Backend-Scripts (Node)
  scrape-events.js   Firecrawl-Agent über LocalCities/chur-kultur.ch → events-database.json + public/scraped-events.json. Enrichment-Pass holt og:image via fetchEventDetails.
  scrape-social.js   Gemini 2.5 Flash mit Google-Search-Grounding, eine Anfrage pro Gemeinde → public/pending-social-events.json (Review-Queue, nicht direkt live).
  event-schema.json  JSON-Schema für die Firecrawl-Extraktion.
  lib/image-clean.js Einzige Quelle für IMAGE_BLOCKLIST_PATTERNS, sanitizeImage, upgradeImageUrl, decodeHtmlUrl, matchOgImage. Wird von Scraper + Backfill-Script geteilt — bitte nicht duplizieren.

public/              Statisches Frontend (served von http-server)
  index.html         App-Shell (Sidebar/Hero/Filter/Liste/Karte). Hero-Variante via body[data-hero="highlight"].
  app.js             Ganze Frontend-Logik in einem IIFE. Render-Pipeline → renderEventCards → Datums-Buckets (Heute/Morgen/Diese Woche/Später/Vergangen).
  style.css          Design-System (Alpenrhein Premium, Crème + Bündner-Rot, Fraunces/Inter).
  events-data.js     Statische Initial-Events als Fallback, falls scraped-events.json nicht erreichbar.
  scraped-events.json          Frontend-Datenquelle. Wird von scrape-events.js committet.
  pending-social-events.json   Review-Queue, wird im Banner gezeigt; Approve schreibt nach localStorage.

data/                Server-seitig, nicht ausgeliefert
  events-database.json   Source-of-truth-DB des Scrapers, zur Dedup über Läufe hinweg.
  scrape-log.json        Lauf-Statistiken.

scripts/             Einmalige/manuelle Maintenance-Tools
  cleanup-event-images.js   Re-Cleanup-Pass; Logik identisch zum Live-Scraper, nützlich nach Anpassung der Blocklist.

test/                node --test Unit-Suite (aktuell nur src/lib/image-clean.js)
.github/workflows/   scrape.yml (06:00 UTC) + scrape-social.yml (07:00 UTC) Cron-Jobs;
                     pages.yml deployt public/ nach GitHub Pages bei jedem Push
```

### Datenfluss

1. **Daily**: GitHub-Actions-Cron startet `scrape-events.js` (`data/events-database.json` + `public/scraped-events.json`) und `scrape-social.js` (`public/pending-social-events.json`). Beide Jobs committen ihre Outputs zurück nach `main`.
2. **Browser**: `public/app.js` fetcht `scraped-events.json` (mit Fallback auf `events-data.js`), rendert Datums-Buckets + Karte. Parallel pollt es `pending-social-events.json` für das Review-Banner.
3. **User-Aktionen**: Favoriten, custom-Events, abgehakte Review-Events leben in `localStorage` (Keys siehe unten).
4. **Backfill**: `scripts/cleanup-event-images.js` kann jederzeit über `scraped-events.json` + `events-database.json` laufen — idempotent.

### Image-Pipeline

- Live-Scraper und Backfill nutzen denselben `sanitizeImage` aus `src/lib/image-clean.js` — Blocklist (UI-Chrome, Sprites, SVG) + Guidle-Thumbnail-Upgrade (`tr:n-{size}` → `tr:w-1200,h-800,dpr-1`).
- Wenn nach Sanitization noch immer kein Bild da ist, holt `fetchEventDetails` aus `scrape-events.js` als Fallback `og:image` / `twitter:image` von der Detail-Seite.
- Frontend: `FALLBACK_IMAGES_BY_CATEGORY` ist ein 3er-Pool pro Kategorie (2 lokale `public/event-images/` + 1 Unsplash); `pickFallback(category, eventId)` wählt deterministisch via FNV-1a-Hash — gleiches Event behält sein Bild, verschiedene Events derselben Kategorie sehen unterschiedlich aus.

### Brand & localStorage

UI-strings sind auf **CalandaKultur** rebranded. **localStorage-Keys bleiben bewusst `chur_events_*`** (`chur_events_favorites`, `chur_events_custom`, `chur_events_reviewed_social_ids`, `chur_events_reviewer`) — Umbenennen ohne Migrations-Pass würde Bestandsdaten zerstören.

### Deployment

Live auf **GitHub Pages**: https://keyvesdabig-sketch.github.io/VerAnstalt/

- Pages-Source ist „Build via Workflow" (nicht Branch-Deploy — Branch-Mode lässt nur `/` oder `/docs` zu, wir brauchen `public/`).
- `.github/workflows/pages.yml` läuft auf jedem Push nach `main`, der `public/**` ändert (inkl. der täglichen Scraper-Commits) → Auto-Deploy.
- Daten-JSONs (`scraped-events.json`, `pending-social-events.json`) liegen unter `public/` und werden mit deployed.

### Reviewer-Gate

Review-Banner für `pending-social-events.json` ist hinter einem Obscurity-Secret versteckt — nur Browser, die einmal `?reviewer=<secret>` aufgerufen haben, sehen das Banner und fetchen die JSON. Secret liegt in `public/app.js` als `REVIEWER_SECRET` (rotierbar). Flag in `localStorage.chur_events_reviewer`, Logout via `?reviewer=logout`. Kein echter Auth — der Code ist öffentlich; reicht nur gegen zufällige Besucher.

## Conventions

- Antworten auf Deutsch (Hochdeutsch). Technische Identifier/Pfade auf Englisch.
- Vor grösseren Änderungen Plan als Bullet-Liste posten und auf OK warten.
- `ROADMAP.md` + `TODO.md` zu Session-Beginn lesen. Roadmap = Features (Now/Next/Later/Done), TODO = Polish-Items aus PR-Reviews.
- Commit-Format: `feat(scope):` / `fix(scope):` / `chore(scope):` / `refactor(scope):` / `docs:`, Body auf Deutsch.
- Keine `node_modules`, `.env`, `raw-agent-output.json` committen (siehe `.gitignore`). `event-images/` IST committet.

## Things that look weird but are intentional

- `FALLBACK_IMAGES` in `public/app.js` ist ein **Proxy** über `FALLBACK_IMAGES_BY_CATEGORY[0]` — Legacy-Brücke für zwei inline-`onerror`-Handler, die keinen `pickFallback`-Aufruf einbetten können.
- Hero-Layout ist über `body[data-hero="highlight"]` festverdrahtet; weitere Varianten (`editorial`, `zeile`, `kompakt`, `magazin`) wurden im Design-Handoff entworfen, aber nicht eingebaut.
- `escapeHtml` ist in `app.js` zweimal definiert (Render-Pfad + Import-Wizard). Die zweite Definition gewinnt (Hoisting), beide sind funktionsgleich.
- Die zwei `npm test`-Tests müssen aus dem `test/`-Verzeichnis kommen — Glob-Expansion macht Node selbst (`--test` ab v22), nicht die Shell.
