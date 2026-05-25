# CalandaKultur

Event-Dashboard für die Alpenrhein-Region — Landquart bis Thusis, rund um Chur und den Calanda.

**Live:** https://keyvesdabig-sketch.github.io/VerAnstalt/

## Was ist das?

Eine kuratierte Übersicht über Veranstaltungen aus 15 Bündner Gemeinden, automatisch täglich aktualisiert. Ein Browser, eine Karte, Datums-Buckets (Heute · Morgen · Diese Woche · Später · Vergangen), Filter nach Kategorie/Ort. Favoriten und eigene Events leben im Browser (`localStorage`), keine Anmeldung.

Technisch ist das Frontend ein **reines Vanilla-JS-Single-Page-App** ohne Build-Step. Daten werden serverseitig (GitHub Actions) gescraped, als JSON-Dateien zurück ins Repo committet und über GitHub Pages ausgeliefert. Keine eigene Datenbank, kein Backend.

## Features

- 📅 Events aus chur-kultur.ch und LocalCities (15 Gemeinden), täglich neu
- 🤖 Zusätzlicher KI-Scrape (Gemini 2.5 Flash mit Google-Search) für Social-Media-Events → Review-Queue
- 🗺️ Interaktive Karte (Leaflet) mit Filter nach Kategorie und Datum
- ⭐ Favoriten + eigene Events (im Browser, kein Account)
- 🖼️ Automatische Bildaufbereitung mit Blocklist + Fallback-Pool pro Kategorie
- 📲 Responsive, keine Anmeldung, keine Cookies, keine Tracker

## Wie laufen die Scrapings?

Zwei Cron-Jobs in GitHub Actions, einer pro Datenquelle. Beide committen ihre Outputs zurück nach `main`, das wiederum den Pages-Deploy auslöst.

### 1. Firecrawl-Scrape (`scrape.yml`, täglich 06:00 UTC / 08:00 CH)

```
LocalCities / chur-kultur.ch
        │
        ▼  Firecrawl CLI mit event-schema.json
        │
   ┌────┴─────┐
   │ Scraper  │  src/scrape-events.js
   │ - dedup gegen data/events-database.json
   │ - geocode via OpenStreetMap (Nominatim)
   │ - sanitize images (Blocklist + Thumbnail-Upgrade)
   │ - og:image-Enrichment für fehlende Bilder
   └────┬─────┘
        │
        ▼
   public/scraped-events.json   ← Frontend-Datenquelle
   data/events-database.json    ← Dedup-Truth (server-side)
   data/scrape-log.json         ← Lauf-Statistik
```

Voraussetzung: `FIRECRAWL_API_KEY` als Repo-Secret.

### 2. Social-Scrape (`scrape-social.yml`, täglich 07:00 UTC / 09:00 CH)

```
Gemini 2.5 Flash + Google-Search-Grounding
        │
        ▼  eine Anfrage pro Gemeinde
        │
   ┌────┴─────┐
   │ Scraper  │  src/scrape-social.js
   │ - extrahiert JSON aus Prompt-Antwort
   │ - stabile Hash-IDs für Dedup
   │ - Citations auf Top 5 limitiert
   └────┬─────┘
        │
        ▼
   public/pending-social-events.json   ← Review-Queue
```

Voraussetzung: `GEMINI_API_KEY` als Repo-Secret. Ohne echten Key bricht das Skript ab (no-mock-data-policy).

### 3. Pages-Deploy (`pages.yml`, automatisch bei Push)

Wird bei jedem Push nach `main` ausgelöst, der `public/**` ändert — also auch nach den täglichen Scraper-Commits. Verwendet `actions/upload-pages-artifact` (Branch-Deploy ginge nur für `/` oder `/docs`, wir brauchen `public/`).

### Manuell ausführen

Beide Workflows haben `workflow_dispatch` — du kannst sie jederzeit per UI (Actions-Tab → Workflow → „Run workflow") oder per CLI starten:

```bash
gh workflow run scrape.yml
gh workflow run scrape-social.yml
```

## Social-Media-Vorschläge prüfen (Review-Workflow)

Der Social-Scraper liefert keine direkt veröffentlichten Events — er füllt eine **Review-Queue**, die nur der Owner sieht.

### Einmalig freischalten

```
https://keyvesdabig-sketch.github.io/VerAnstalt/?reviewer=<SECRET>
```

Das Secret liegt als `REVIEWER_SECRET` in [`public/app.js`](public/app.js). Beim ersten Aufruf mit korrektem Parameter:

1. Flag wird in `localStorage.chur_events_reviewer` gesetzt.
2. Der `?reviewer=…`-Parameter wird sofort aus der URL entfernt (damit der Link nicht versehentlich geteilt wird).
3. Das Review-Banner erscheint, sobald `pending-social-events.json` ungeprüfte Events enthält.

**Logout:** `?reviewer=logout` löscht das Flag wieder.

### Reviewen

Ist das Banner sichtbar (X neue Events zur Prüfung), klick drauf — ein Modal listet die Vorschläge. Für jeden Eintrag:

- **Übernehmen** → Event wird als Custom-Event in deinem Browser gespeichert (heute), in Zukunft direkt in eine geteilte `curated-events.json` committet (siehe [ROADMAP.md](ROADMAP.md)).
- **Verwerfen** → ID landet in `chur_events_reviewed_social_ids` und taucht im Banner nicht wieder auf.

Geprüfte IDs werden gegen die aktuelle Queue ge-pruned, damit nicht ewig Karteileichen wachsen.

> ⚠️ Der Schutz ist **Obscurity, kein echter Auth**. Der Code ist öffentlich, das Secret findbar. Es reicht, um zufällige Besucher vom Review-UI fernzuhalten — nicht gegen motivierte Snooper. Custom Domain + echter Auth ist später denkbar; für jetzt akzeptabel.

## Lokale Entwicklung

Voraussetzung: **Node ≥ 22** (für native `--test` Glob-Expansion).

```bash
npm install
npm run dev           # http-server auf Port 8080 — public/ lokal anschauen
npm test              # node --test, Unit-Suite für src/lib/image-clean.js
npm run scrape        # Firecrawl-Scrape (braucht FIRECRAWL_API_KEY in .env)
npm run scrape:social # Social-Scrape (braucht GEMINI_API_KEY in .env)
node scripts/cleanup-event-images.js [--no-fetch]  # Re-Cleanup-Pass über scraped-events.json
```

`.env` im Repo-Root anlegen mit den Keys (ist in `.gitignore`).

## Verzeichnis-Übersicht

```
src/        Backend-Scripts (Scraper, geteilte image-clean-Lib)
public/     Statisches Frontend, das nach Pages deployt wird
data/       Server-seitige State-Dateien (Dedup-DB, Scrape-Log) — nicht ausgeliefert
scripts/    Manuelle Maintenance-Tools (Image-Backfill)
test/       node --test Unit-Suite
docs/       Implementation-Plans + Design-Specs (historischer Kontext)
.github/    Cron-Workflows + Pages-Deploy-Workflow
```

Detail-Architektur und Datenfluss: siehe [CLAUDE.md](CLAUDE.md).

## Roadmap & offene Polish-Items

- **Features in Planung:** [ROADMAP.md](ROADMAP.md) — Admin-Dashboard, Foto-zu-Event-Wizard, persistente Event-Kuration, Suche, PWA, Dark Mode, …
- **Polish aus Code-Reviews:** [TODO.md](TODO.md)

## Lizenz & Quellen

- Code: privat, kein Open-Source-Release vorgesehen.
- Event-Daten: gescraped von öffentlichen Quellen (chur-kultur.ch, LocalCities), Verlinkung zur Originalseite bleibt erhalten.
- Fallback-Bilder: [Unsplash](https://unsplash.com/license), Details und Bild-IDs in [`public/event-images/README.md`](public/event-images/README.md).
- Karte: [OpenStreetMap](https://openstreetmap.org) via Leaflet.
