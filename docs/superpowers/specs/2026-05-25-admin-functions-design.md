# Admin-Funktionen für CalandaKultur — Design

**Datum:** 2026-05-25
**Status:** Approved (brainstorming)
**Verantwortung:** CalandaKultur-Dashboard

## Kontext

Die Plattform hostet auf GitHub Pages (statisch, kein Backend). Drei Admin-Aufgaben fallen heute oder bald an:

1. **Foto-zu-Event-Import** (bereits gebaut, schreibt aktuell nur in lokales `chur_events_custom` — nicht für andere Besucher sichtbar)
2. **Review-Queue** für vom Gemini-Social-Scrape vorgeschlagene Events (bereits gebaut als Inline-Banner + Modal)
3. **Events löschen + editieren** (komplett neu)

Aktuelle Lücken:
- Kein Lösch-Mechanismus
- Foto-Importe + approve-te Social-Events landen nur in `localStorage` → für andere Besucher unsichtbar
- Keine Übersichts-Ansicht über alle Events (Datenbank-Sicht)
- Daily-Scrape kann gelöschte Events wieder re-importieren

Ziel: ein **einheitliches Admin-System**, das diese drei Aufgaben elegant bündelt, ohne separate Admin-Seite und ohne neues Hosting.

## Architektur-Prinzipien

- **Keine separate /admin-Seite** — Admin-Aktionen sind kontextuell auf der Public-View verteilt + ein zentraler Drawer als Hub
- **Ein Sichtbarkeits-Flag** (`localStorage.chur_events_reviewer`) schaltet alle Admin-UI gleichzeitig frei
- **Drei-Schichten-Datenmodell** trennt Scraper-Output von menschlichen Edits — keine Race Conditions
- **Optimistic UI mit Git-Commits im Hintergrund** — UX fühlt sich instant an, Persistenz nach ~30 s live
- **Code-Trennung**: `public/admin/` mit eigenen Modulen, public `app.js` bleibt schlank

## Datenmodell

### Drei JSON-Dateien als Layered Source

```
public/scraped-events.json        Roh-Feed vom Daily-Scraper. Wird täglich überschrieben.
public/curated-events.json        Kuratierte Events: Foto-Importe, Edits von Scraped, approve-te Socials.
public/suppressed-event-ids.json  IDs gelöschter Events. JSON-Array von Strings.
public/pending-social-events.json (unverändert — Review-Queue, vom Daily-Social-Scraper)
```

### Frontend Render-Merge

```javascript
let final = [];
for (const ev of scrapedEvents) {
  if (suppressedIds.has(ev.id)) continue;
  if (curatedIdsSet.has(ev.id)) continue;  // curated Version gewinnt, kommt unten dran
  final.push(ev);
}
for (const ev of curatedEvents) final.push(ev);
// → dedupliziert + sortiert wie heute
```

### Wirkung pro Aktion

| Aktion | Schreibt | Sichtbarkeit |
|--------|----------|--------------|
| Foto-Import speichern | `curated-events.json` (neuer Eintrag) | Live nach Pages-Deploy (~30 s) |
| Scraped Event editieren | `curated-events.json` (Eintrag mit Original-ID) + `suppressed-event-ids.json` (Original-ID) | Curated-Version überschreibt sichtbar |
| Scraped Event löschen | `suppressed-event-ids.json` (ID anhängen) | Sofort weg + Daily-Scraper überspringt es künftig |
| Custom Event löschen | `curated-events.json` (Eintrag raus) | Sofort weg |
| Review-Event approven | `curated-events.json` (neu) + lokale `reviewedIds` | Live nach ~30 s |
| Review-Event verwerfen | nur lokale `reviewedIds` | Banner-Zähler verringert sich |

### Scraper-Anpassung

`src/scrape-events.js` liest `public/suppressed-event-ids.json` und überspringt diese IDs *beim Einlesen*. Das verhindert Re-Import gelöschter Events. Curated/Reviewed sind dem Scraper egal — er schreibt nur in `scraped-events.json`.

## UI-Architektur

### Sichtbarkeits-Schicht

Ein CSS-Hook `body[data-reviewer="true"]` wird beim Init gesetzt, wenn `isReviewer()` true ist. Alle Admin-Elemente haben Default-Style `display: none`, mit Regel `body[data-reviewer="true"] .admin-only { display: ...; }`. Public-Besucher sehen die App pixel-identisch zu heute.

### Verortung pro Funktion

| Funktion | Wo | Bestehend? |
|----------|-----|------------|
| Foto-Import | Add-Event-Modal (Sidebar-Button „Event eintragen") | ✅ |
| Review-Queue | Banner im Hero-Bereich → Review-Modal | ✅ |
| Settings (Gemini, jetzt auch GitHub-PAT) | Sidebar-Button „⚙ Einstellungen" → Settings-Modal | ✅ (erweitert) |
| Inline-Löschen | Reviewer-only Footer auf jeder Event-Karte: `✏ 🗑` | 🆕 |
| Inline-Edit | Recyceltes Add-Event-Modal in `mode: 'edit'` | 🆕 |
| Admin-Drawer | Sidebar-Button „🛠 Admin" → slidet Drawer rechts rein | 🆕 |
| Datenbank-Dashboard | Drawer-Eintrag „Datenbank verwalten" → Full-Screen-Modal mit Tabelle | 🆕 |

### Sidebar-Erweiterung

```
─────── side-footer ──────
[+ Event eintragen]            (bestehend)
[📥 Events importieren]        (bestehend)
[⚙ Einstellungen]              (bestehend, Reviewer-only)
[🛠 Admin]                     (NEU, Reviewer-only)
─────────────────────────
```

### Admin-Drawer (rechts, ~400 px breit, Slide-Animation)

```
ÜBERSICHT
  153 Events  ·  letzter Scrape 08:01 ✓
  Suppressed: 12 IDs  ·  Curated: 7 Events

WERKZEUGE
  [🗂 Datenbank verwalten →]   öffnet DB-Modal
  [📋 Review-Queue (3) →]      öffnet Review-Modal (existiert)

KONFIGURATION
  [⚙ Settings öffnen]
  [⎋ Logout (?reviewer=logout)]
  PAT läuft ab in 287 Tagen
```

### Datenbank-Dashboard (Full-Screen-Modal)

**Toolbar:** Filter (Quelle ▾ / Gemeinde ▾ / Volltext-Suche debounced) · Sortierung (Datum / Titel / Quelle / Erstellt)

**Quelle-Filter-Werte:** `alle | scraped | curated | social-pending | suppressed`. Bei `suppressed` zeigt die Liste gelöschte Events mit einem extra „⟲ Wiederherstellen"-Button.

**Tabelle:** `☑ | Titel | Datum | Ort | Quelle | Status | Aktionen`

Status-Werte:
- *(leer)* = pures Scraped/iCal
- `🆕 curated` = von dir manuell oder via Foto-Import erstellt
- `✏ ediert` = Scraped-Original, du hast eine Curated-Version → die wird gerendert
- `🚫 suppressed` (nur im suppressed-Filter sichtbar)

**Aktionen pro Zeile:**
- `✏` öffnet das Add-Event-Modal in `mode: 'edit'`, alle Felder vorausgefüllt
- `🗑` löscht (mit confirm-Dialog für scraped/iCal, ohne confirm für custom/curated)

**Bulk-Bar** (slidet hoch, sobald ≥1 Checkbox aktiv): `N ausgewählt  [🗑 Alle löschen]  [✗ Auswahl aufheben]`

Bulk-Edit ist NICHT enthalten (Scope-Schnitt).

### Edit-Modal-Recycling

Das bestehende Add-Event-Modal bekommt einen `mode`-Parameter. Bei `mode: 'edit'`:
- Titel der Modal-Header: „Event bearbeiten"
- Alle Felder vorausgefüllt aus dem Event-Objekt
- Submit-Button: „Änderungen speichern"
- Submit-Handler: ruft `upsertCurated(event)` + bei Scraped-Original `addSuppressed(originalId)`

Kein neuer Code für Validierung, Foto-Upload-Wizard, Dedup-Confirm oder Karten-Standort — alles wiederverwendet.

## GitHub-Commit-Pipeline

### Authentifizierung

**Fine-grained Personal Access Token** auf nur dem einen Repo, Permission `Contents: Read and write`. Eingegeben im erweiterten Settings-Modal:

```
Settings
├── Gemini API-Key        [Verbindung prüfen]
└── GitHub Personal Token [Verbindung prüfen]
    Repo-Scope: keyvesdabig-sketch/VerAnstalt
    Ablaufdatum 1 Jahr empfohlen
```

Storage: `localStorage.chur_events_github_pat`.

**Test-Button:** `GET /repos/{owner}/{repo}/contents/public/curated-events.json` mit dem Token. 200 = Lesezugriff ok. Für Schreibzugriff: `GET /user` → wenn 200, ist der Token grundsätzlich gültig (Scope wird beim ersten PUT validiert).

**Token-Lebensdauer-Reminder:** Drawer zeigt „PAT läuft ab in X Tagen". Bei < 30 Tagen: gelbe Warnung. Berechnet via `GET /user` Header `github-authentication-token-expiration` (falls verfügbar) oder via Token-Metadaten-Endpoint.

### Commit-Helper

```javascript
// admin-commit.js
async function commitJsonFile(path, newContent, commitMessage) {
  const pat = localStorage.getItem(GITHUB_PAT_KEY);
  if (!pat) throw new Error('Kein GitHub-PAT in Settings hinterlegt');

  // Aktueller sha (optimistic lock)
  const cur = await api(`GET /repos/${REPO}/contents/${path}`, { pat });
  const sha = cur.sha;

  // PUT
  await api(`PUT /repos/${REPO}/contents/${path}`, {
    pat,
    body: {
      message: commitMessage,
      content: encodeBase64Utf8(JSON.stringify(newContent, null, 2)),
      sha,
    },
  });
}
```

### Eintrittspunkte

| Aktion | Funktion | Commit-Message |
|--------|----------|----------------|
| Foto-Import speichern | `appendToCurated(event)` | `curate: add "{Titel}" (foto-import)` |
| Inline-Edit speichern | `upsertCurated(event) + addSuppressed(originalId)` | `curate: edit "{Titel}"` |
| Scraped Event löschen | `addSuppressed(id, title)` | `curate: hide "{Titel}"` |
| Curated Event löschen | `removeFromCurated(id)` | `curate: delete "{Titel}"` |
| Suppressed wiederherstellen | `removeFromSuppressed(id)` | `curate: restore "{Titel}"` |
| Review-Approve | `appendToCurated(event)` | `curate: approve "{Titel}" (from social-queue)` |

Jede Funktion: lokales `events`-Update → optimistic render → `commitJsonFile()` → bei Erfolg fertig, bei Fehler rollback + Toast.

### UX-Verhalten

**Optimistic UI mit Status-Badge:**
1. User klickt Aktion → Frontend-State updated, Render sofort
2. Status-Badge unten rechts: „Committe …"
3. Bei Erfolg: „✓ Live in ~30 s" (3 s sichtbar, dann fadet)
4. Bei Fehler: Rollback + roter Toast mit Fehlertext

### Race Conditions

| Szenario | Verhalten |
|----------|-----------|
| Zwei Admin-Tabs editieren | GitHub 409 → 1× Auto-Retry mit frischem sha → bei erneutem Konflikt Alert |
| Daily-Scrape pusht gleichzeitig | Kein Konflikt (verschiedene Dateien) |
| Pages-Deploy schon aktiv | `pages.yml` hat `concurrency: pages, cancel-in-progress: false` — neuer Run wartet |

### Sicherheitsgrenzen — bewusste Akzeptanz

- PAT liegt im Browser-localStorage. XSS auf der Public-Page = Token-Diebstahl. Mitigation: fine-grained Scope (nur dieses Repo) + Git-History als Disaster-Recovery.
- Reviewer-Gate ist Obscurity, kein Schutz. Code ist öffentlich.
- Worst-Case bei Token-Verlust: jemand zerstört `curated-events.json`/`suppressed-event-ids.json`. Rollback via Git in 1 Commit.

## Edge-Cases

| # | Problem | Strategie |
|---|---------|-----------|
| 1 | Daily-Scrape findet gelöschtes Event mit derselben ID | Scraper liest suppressed-IDs und überspringt — gar nicht erst in scraped-events.json |
| 2 | Scraper generiert für „dasselbe" Event neue ID (Titel-Tippfehler-Korrektur) | Akzeptiert: User löscht erneut. Spätere Erweiterung: Fuzzy-Suppression über `event-dedup`-Lib |
| 3 | PAT abgelaufen | Commit-Helper fängt 401 → Toast + öffnet Settings-Modal → Rollback |
| 4 | GitHub-Rate-Limit (5000/h authenticated) | Praktisch unerreichbar bei manuellem Use |
| 5 | `curated-events.json` zu gross | Bei 1000+ Events ~200 KB JSON, GitHub-Contents-API-Limit 1 MB. Bei Bedarf: nach Jahr aufteilen |
| 6 | Edit-Konflikt zwischen Tabs | sha-Lock + 1× Auto-Retry |
| 7 | Versehentliches Löschen | confirm-Dialog für globals + Suppressed-Filter mit Undo + Git-History |
| 8 | Frontend rendert vor dem Suppressed-Fetch | `Promise.all` über alle 3 Daten-Files vor erstem Render |
| 9 | Scraper-Bot pusht zwischen GET-sha und PUT | Verschiedene Dateien, kein Konflikt möglich |
| 10 | Suppressed-Liste wächst ewig | Bei Bedarf: GC-Script, das IDs entfernt, die in keinem Scrape mehr auftauchen |
| 11 | Migration bestehender lokaler `chur_events_custom` | Bei erstem Drawer-Open: Prompt „N lokale Events auf Server pushen?" → ja: bulk-commit → localStorage clear |
| 12 | Edit eines iCal-Events: original wird beim nächsten Lauf re-importiert | iCal-Source-Events haben stabile UIDs → Suppression + Curated funktioniert wie bei Scraped |

## Datei-/Code-Struktur

### Neue Dateien

```
public/admin/                      Reviewer-only Module (alle <script defer>)
  admin-drawer.js                  Drawer-UI + Stats-Rendering
  admin-database.js                Full-Screen-DB-Modal + Tabelle + Filter
  admin-commit.js                  GitHub Contents API Helper
  admin-shared.js                  Datenmodell-Helper (mergeCurated, addSuppressed, ...)
public/curated-events.json         { events: [] }
public/suppressed-event-ids.json   { ids: [] }
docs/superpowers/specs/2026-05-25-admin-functions-design.md   (diese Spec)
```

### Geänderte Dateien

```
public/index.html       + Admin-Drawer-Container + DB-Modal-Container + Sidebar-Button + 4 <script>-Tags
public/style.css        + .admin-only Visibility-Regel + Drawer-Styles + DB-Modal-Styles + Inline-Card-Footer-Styles
public/app.js           + Merge-Logik für scraped+curated+suppressed im Init + body[data-reviewer]-Setter
                        + Inline-Card-Footer-Render (Reviewer-only)
                        + Edit-Modal-Mode (mode: 'create' | 'edit')
                        + Settings-Modal: GitHub-PAT-Feld
                        + Migration-Prompt für legacy chur_events_custom
src/scrape-events.js    + Read suppressed-event-ids.json + Filter beim Einlesen
src/scrape-social.js    (unverändert — Review-Queue läuft wie heute, nur Approve schreibt jetzt commit)
```

## Implementierungs-Reihenfolge (für die Plans-Phase)

1. **Datenmodell**: `curated-events.json` + `suppressed-event-ids.json` leer anlegen, Frontend-Merge in `app.js`, Scraper-Filter in `scrape-events.js`
2. **Commit-Helper** (`admin-commit.js`) + Settings-Modal-Erweiterung um GitHub-PAT + Test-Button
3. **Inline-Aktionen**: Reviewer-only Footer auf Karten mit `✏ 🗑`, Edit-Modal-Mode in `app.js`, Delete-Flow
4. **Admin-Drawer**: HTML-Container, Open/Close, Stats-Rendering, Logout-Button
5. **DB-Dashboard**: Full-Screen-Modal, Tabelle, Filter, Bulk-Bar, Status-Spalte
6. **Migration**: Prompt für legacy `chur_events_custom` → bulk-commit
7. **Review-Approve-Migration**: bestehender Approve-Pfad schreibt jetzt via `appendToCurated` statt nur localStorage

Jeder Schritt einzeln committet + testbar.

## Out-of-Scope (bewusste Schnitte)

- **Bulk-Edit** im DB-Dashboard — Aufwand-Nutzen schlecht
- **GitHub-App** statt PAT — Overkill für Single-User-Setup
- **Multi-User-Admin** — heute 1 Reviewer, kein Bedarf
- **Versionierung im UI** — Git ist die Versionierung, Drawer könnte später einen „Letzte Commits"-Link auf GitHub haben
- **Backend** — bleibt statisch-only
- **Edit-Konfliktauflösung mit Diff-UI** — Auto-Retry + Alert reicht
