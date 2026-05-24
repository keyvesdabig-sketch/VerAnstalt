# Social-Event-Import — Design

**Datum:** 2026-05-24
**Status:** Approved (brainstorming)
**Verantwortung:** ChurEvents-Dashboard

## Kontext und Ziel

Das ChurEvents-Dashboard scraped Events aus LocalCities und Chur-Kultur via Firecrawl. Social-Media-Events (Facebook, Instagram, TikTok) fehlen, weil diese Plattformen nicht direkt zugänglich sind.

Eine separate Google-AI-Studio-App nutzt Gemini mit Google-Search-Grounding, um Social-Events zu finden. Diese App bleibt eigenständig und dient als **Admin-Werkzeug zur Kuration**. Sie produziert ein standardisiertes JSON, das von ChurEvents importiert wird.

Zielgruppe ChurEvents: klein-öffentlich, kuratiert. Importierte Events werden geprüft, bevor sie sichtbar werden.

## Scope

**In Scope:**
- JSON-Import-Modal im ChurEvents-Dashboard
- Validierung des Importformats
- Review-UI mit Approve/Skip pro Event und Inline-Edit
- Auto-Geocoding via Nominatim für fehlende Koordinaten
- Persistenz in `localStorage` (gleicher Mechanismus wie bestehende Custom-Events)
- Dubletten-Erkennung gegen bestehende DB und LocalStorage-Events

**Out of Scope (separates Ticket):**
- Öffentliche Sichtbarkeit importierter Events (Schreiben in `events-database.json`)
- Backend, Auth, Multi-User
- Bulk-Edit-Tools
- Undo nach Import (Einzel-Löschung im Detail-Modal genügt — separat zu prüfen ob vorhanden)
- Anpassungen der AI-Studio-App selbst (User-eigene Aufgabe)

## Importformat

JSON-Array, ein Objekt pro Event. Die AI-Studio-App produziert dieses Format.

```json
[
  {
    "title": "Open Air am Obertor",
    "date": "2026-06-15",
    "time": "19:00 - 23:00",
    "municipality": "Chur",
    "locationName": "Obertor, Altstadt Chur",
    "category": "music",
    "description": "Sommerlicher Open-Air-Abend mit lokalen Bands.",
    "sourceUrl": "https://www.instagram.com/p/Czx123abc/",
    "sourcePlatform": "Instagram",
    "imageUrl": "https://...",
    "lat": 46.8510,
    "lng": 9.5325,
    "ticketUrl": "https://...",
    "organizerUrl": "https://..."
  }
]
```

**Pflichtfelder:** `title`, `date` (ISO YYYY-MM-DD), `municipality`, `locationName`, `category`, `description`, `sourceUrl`, `sourcePlatform`.
**Optionalfelder:** `time`, `imageUrl`, `lat`, `lng`, `ticketUrl`, `organizerUrl`.

**Enum-Werte:**
- `category`: `music | stage | markets | family | sport`
- `municipality`: Eine der 15 vordefinierten Gemeinden (siehe `index.html`)
- `sourcePlatform`: `Facebook | Instagram | TikTok | Guidle | Other`

## UI / UX

### Import-Trigger

Neuer Button im Header neben "Event eintragen": **"Events importieren"** mit Upload-Icon (`upload`). Sekundär gestylt (weniger prominent als der Primary-Button).

### Import-Modal — Phase 1: Eingabe

Modal-Header: "Events importieren"

Zwei Eingabeoptionen nebeneinander (oder gestapelt auf Mobile):
- **Datei-Upload-Zone**: Drag-and-drop oder Click-to-select für `.json`-Datei
- **Textarea**: "Oder JSON hier einfügen" — paste-bar, max-height ~200px

Button **"Validieren"** unten. Klick → Phase 2.

### Import-Modal — Phase 2: Validierung & Review

**Validierungs-Summary** oben im Modal:
- ✅ "12 Events erkannt"
- ⚠️ "2 Events übersprungen (Validierungsfehler)" — ausklappbares Detail
- ⚠️ "3 Events sind bereits in der Datenbank" — markiert in der Liste

**Event-Liste** (scrollbar, max-height ~60vh):

Pro Event eine Karte:
```
[☑] [Bild]  "Open Air am Obertor"                    [Bearbeiten] [Skip]
            📅 15.06.2026 · 19:00 - 23:00
            📍 Obertor, Altstadt Chur (Chur)
            🎵 Musik · 📷 Instagram → [Quelle ansehen]
            "Sommerlicher Open-Air-Abend mit lokalen Bands..."
            ⚠️ Standort fehlt — Auto-Geocoding läuft / fehlgeschlagen
```

Elemente:
- **Checkbox**: per default aktiv. Inactive → Event wird nicht importiert.
- **"Bearbeiten"**: öffnet Inline-Edit-Mode (alle Felder editierbar — title, date, time, locationName, category, description, lat, lng)
- **"Skip"**: entfernt Event aus Liste (visuell, nicht aus JSON)
- **"Quelle ansehen"**: öffnet `sourceUrl` in neuem Tab (`target="_blank"`)

**Footer:**
- Links: `[N von M ausgewählt]`
- Rechts: `[Abbrechen]` `[Alle importieren]`

### Nach Import

Modal schließt, Erfolgs-Toast: "X Events importiert". Dashboard lädt neu, neue Events sind in der Liste und auf der Karte.

## Datenfluss und Komponenten

```
AI-Studio-App
    │  JSON-Datei oder Paste
    ▼
Import-Modal (Phase 1: Eingabe)
    │  parseAndValidate()
    ▼
ValidationResult { valid[], invalid[], duplicates[] }
    │  geocodeMissingCoordinates() ← Nominatim API
    ▼
Import-Modal (Phase 2: Review)
    │  User toggles, edits, skips
    │  applyImport()
    ▼
localStorage 'chureventsCustomEvents' ← bestehender Mechanismus
    │
    ▼
renderEvents() + refreshMap()
```

### Funktions-Inventar (neu in `app.js`)

- `openImportModal()` — Modal öffnen, State zurücksetzen
- `parseImportJson(text)` — JSON parsen, Top-Level-Validierung
- `validateImportedEvent(event, existingEvents)` — Pflichtfelder, Enums, Datumsformat, Dubletten-Check
- `geocodeViaNominatim(locationName, municipality)` — Async, Rate-Limited (1.1s zwischen Calls)
- `renderImportReviewList(events)` — Liste aller validen Events mit Toggles
- `editImportedEventInline(eventId)` — Inline-Edit aktivieren
- `commitImport(selectedEvents)` — In localStorage schreiben, Modal schließen, UI refreshen

## Validierungsregeln

Pro Event:
1. Pflichtfelder vorhanden und nicht leer
2. `date` matcht Regex `^\d{4}-\d{2}-\d{2}$` und ist parsbar via `new Date(date)`
3. `date` >= heute (Vergangenheit ignoriert)
4. `category` ist einer der 5 Enum-Werte
5. `municipality` ist eine der 15 erlaubten Gemeinden
6. `sourceUrl` ist eine valide URL (`new URL(sourceUrl)` ohne Throw)
7. `sourcePlatform` ist einer der 5 Enum-Werte
8. Wenn `lat`/`lng` gesetzt: beide vorhanden und numerisch, im plausiblen Schweiz-Bereich (46-48°N, 8-10°E)

Bei Verstoß → Event in `invalid[]` mit Begründung. UI zeigt diese Begründungen ausklappbar.

**Dubletten-Check**: Hash aus `title.toLowerCase().trim() + '|' + date + '|' + municipality`. Match in bestehender DB oder LocalStorage → in `duplicates[]`, in UI markiert aber wählbar (User entscheidet ob trotzdem importieren).

## Geocoding-Strategie

Für jedes Event ohne `lat`/`lng`:

1. Nominatim-Anfrage: `https://nominatim.openstreetmap.org/search?q={encodeURIComponent(locationName + ', ' + municipality + ', Switzerland')}&format=json&limit=1&email=chureventsdashboard@example.invalid`
   - `email`-Query-Parameter ist Nominatims akzeptierter Identifizierungs-Weg für Browser-Clients (User-Agent kann von Browsern nicht überschrieben werden). Realen Kontakt eintragen wenn vorhanden.
2. Rate-Limit: Sequentiell, 1100ms Pause zwischen Calls (Nominatim erlaubt 1 req/s)
3. Wenn Resultat: `lat`/`lng` setzen, Event als "Standort gefunden" markieren
4. Wenn kein Resultat: Fallback auf hardcodierte Gemeinde-Koordinaten (siehe `MUNICIPALITY_CENTERS` in `app.js`, neu zu definieren), Event als "Approximierter Standort" markieren mit gelbem Badge
5. Wenn Nominatim-Request fehlschlägt: Fallback wie oben, Warn-Badge

Während Geocoding läuft: Spinner in der Event-Karte. Geocoding läuft parallel zur Anzeige der Review-Liste (kein Block).

## Persistenz

- Importierte Events werden in `localStorage` unter Key `chureventsCustomEvents` gespeichert — identisches Format und Mechanismus wie der bestehende "Event eintragen"-Flow
- Pro Event wird ein `source: 'import'` Feld gesetzt (zur Abgrenzung von manuell erstellten Events)
- Sichtbarkeit: nur im Browser des importierenden Users. Andere Besucher sehen nichts.

**Bewusste Einschränkung:** Keine Server-Persistenz in dieser Iteration. Public-Sharing kommt in einem späteren Ticket.

## Fehlerbehandlung

| Fehlerfall | Verhalten |
|---|---|
| JSON-Parse-Error | Modal zeigt rote Fehlermeldung mit Zeilennummer wenn möglich |
| Leeres Array | Hinweis "Keine Events im JSON gefunden", Modal bleibt offen |
| Alle Events ungültig | Validierungs-Detail ausgeklappt, kein Import möglich |
| Alle Events Dubletten | Hinweis, User kann trotzdem importieren (überschreibt nicht, dupliziert nicht) |
| Nominatim-Rate-Limit | Sequentielles Throttling verhindert das, sonst Fallback |
| Bild-URL tot | Image-Element fängt `onerror` ab, zeigt Kategorie-Standardbild |
| LocalStorage voll | Fehler-Toast: "Speicher voll — bitte alte Events löschen" |

## Testing

Manuell-test-cases:
1. Valides JSON mit 5 Events → 5 importiert, alle auf Karte
2. JSON mit 1 invaliden Eintrag (fehlt `category`) → 4 importiert, 1 in invalid-Liste
3. JSON mit Dublette zu existierendem Event → markiert, User kann skippen
4. Event ohne `lat`/`lng`, valider `locationName` → Nominatim geocoded korrekt
5. Event ohne `lat`/`lng`, fiktiver `locationName` → Fallback auf Gemeinde-Zentrum
6. Bearbeiten eines Events vor Import → Änderung landet in localStorage
7. Skip aller Events → Modal lässt sich abbrechen ohne Import
8. JSON-Datei-Upload und Paste produzieren identische Ergebnisse

## Abhängigkeiten

- **Nominatim** (OpenStreetMap, gratis, kein API-Key) — für Geocoding
- **AI-Studio-App** liefert das Importformat — vom User parallel anzupassen (separater Prompt liegt vor)

Keine neuen npm-Pakete. Alles via native Browser-APIs.

## Geschätzter Umfang

- ~150 Zeilen JS in `app.js`
- ~80 Zeilen CSS in `style.css`
- ~30 Zeilen HTML in `index.html`
- Eine Implementierungs-Session (~2-3h)

## Offene Punkte (für Implementierungs-Plan)

- Existiert bereits eine Löschen-Funktion für localStorage-Events im Detail-Modal? Falls nicht, ist sie für Undo-Recovery sinnvoll → eigenes kleines Add-on im selben PR.
- `MUNICIPALITY_CENTERS` Koordinaten-Tabelle muss definiert werden (15 Einträge).
