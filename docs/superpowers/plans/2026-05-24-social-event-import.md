# Social-Event-Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a JSON import feature in the ChurEvents dashboard that ingests events exported from the Google AI Studio scraper app, validates them, lets the user review/edit/skip, geocodes missing coordinates via Nominatim, and persists approved events to localStorage.

**Architecture:** Vanilla JS additions inside the existing `app.js` IIFE (no framework, no build step). New modal in `index.html`, new CSS section in `style.css`. Reuses existing `REGION_CENTERS` for fallback geocoding and existing `chur_events_custom` localStorage key for persistence (same path as the manual Add-Event flow).

**Tech Stack:** HTML5, CSS3 (Grid/Flexbox), Vanilla JS (ES2020+), Leaflet 1.9.4 (already loaded), Lucide icons (already loaded), Nominatim public API (no auth).

**Spec:** `docs/superpowers/specs/2026-05-24-social-event-import-design.md`

**Test data:** `C:\Users\teech\Downloads\chur-events-export-2026-05-24.json` (9 events, all valid schema, content simulated until user sets GEMINI_API_KEY in AI-Studio-App)

---

## File Inventory

| File | Action | Responsibility |
|---|---|---|
| `index.html` | Modify | Add "Events importieren" button to header. Add `<div id="import-modal">` with two-phase markup. |
| `style.css` | Modify | Add `.import-modal-*` styles for two-phase layout, event review cards, badges, edit-mode. |
| `app.js` | Modify | Add new module-section "Import Feature" — DOM refs, parser, validator, geocoder, renderer, commit logic, event wiring. |

No new files. No new npm dependencies.

---

## Task 1: HTML scaffold — Import button + empty modal

**Files:**
- Modify: `index.html` (header section + new modal at end of body)

- [ ] **Step 1: Add "Events importieren" button to header-actions**

Edit `index.html`. Find the `<div class="header-actions">` block (currently contains only `btn-add-event`). Insert a new button BEFORE the existing one:

```html
      <div class="header-actions">
        <button id="btn-import-events" class="btn btn-secondary">
          <i data-lucide="upload"></i>
          <span>Events importieren</span>
        </button>
        <button id="btn-add-event" class="btn btn-primary">
          <i data-lucide="plus-circle"></i>
          <span>Event eintragen</span>
        </button>
      </div>
```

- [ ] **Step 2: Add import-modal markup at end of body**

In `index.html`, after the closing `</div>` of `add-modal` (the existing Add-Event modal) and BEFORE the `<!-- Leaflet Map Script -->` comment, insert:

```html
  <!-- Import Events Modal -->
  <div class="modal-backdrop hidden" id="import-modal">
    <div class="modal-container import-modal-container glass">
      <button class="modal-close" id="import-modal-close">
        <i data-lucide="x"></i>
      </button>
      <div class="modal-header">
        <h2>Events importieren</h2>
        <p>Lade die JSON-Datei aus dem AI-Studio-Scraper hoch oder füge sie ein</p>
      </div>

      <!-- Phase 1: Input -->
      <div id="import-phase-input" class="import-phase">
        <div class="import-input-grid">
          <label class="import-file-drop" for="import-file-input">
            <i data-lucide="upload-cloud"></i>
            <span class="import-file-drop-title">JSON-Datei wählen</span>
            <span class="import-file-drop-hint">oder hierher ziehen</span>
            <input type="file" id="import-file-input" accept="application/json,.json" hidden>
          </label>
          <div class="import-paste-area">
            <label for="import-paste-input">Oder JSON hier einfügen:</label>
            <textarea id="import-paste-input" rows="8" placeholder='[{"title":"...", "date":"2026-06-15", ...}]'></textarea>
          </div>
        </div>
        <div class="import-error hidden" id="import-parse-error"></div>
        <div class="form-actions">
          <button type="button" id="btn-import-cancel-1" class="btn btn-secondary">Abbrechen</button>
          <button type="button" id="btn-import-validate" class="btn btn-primary">Validieren</button>
        </div>
      </div>

      <!-- Phase 2: Review -->
      <div id="import-phase-review" class="import-phase hidden">
        <div class="import-summary" id="import-summary"></div>
        <div class="import-invalid-details hidden" id="import-invalid-details"></div>
        <div class="import-event-list" id="import-event-list"></div>
        <div class="form-actions import-review-footer">
          <span class="import-selection-count" id="import-selection-count">0 von 0 ausgewählt</span>
          <button type="button" id="btn-import-back" class="btn btn-secondary">Zurück</button>
          <button type="button" id="btn-import-cancel-2" class="btn btn-secondary">Abbrechen</button>
          <button type="button" id="btn-import-commit" class="btn btn-primary">Auswahl importieren</button>
        </div>
      </div>
    </div>
  </div>

```

- [ ] **Step 3: Manual verification**

Run: `npm run dev` then open `http://localhost:8080` in browser.

Expected:
- Header now shows two buttons: "Events importieren" (secondary, ghost-ish) and "Event eintragen" (primary, gradient)
- Clicking "Events importieren" does nothing yet (wiring comes in Task 8) — that's expected
- Lucide icons render correctly (upload icon on the new button)
- No console errors

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "feat(import): HTML scaffold for import button and modal"
```

---

## Task 2: CSS for the import modal

**Files:**
- Modify: `style.css` (append a new section at the end)

- [ ] **Step 1: Inspect existing modal patterns**

Read `style.css` and locate the existing rules for `.modal-backdrop`, `.modal-container`, `.modal-header`, `.add-event-container`, `.form-actions`. We will reuse these — the import modal already has matching class names.

- [ ] **Step 2: Append import-specific styles to the end of `style.css`**

```css
/* === Import-Events Modal === */

.import-modal-container {
  max-width: 900px;
  width: 95%;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
}

.import-phase {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.import-phase.hidden {
  display: none;
}

/* --- Phase 1: Input --- */

.import-input-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.5rem;
  padding: 1.5rem 0;
}

@media (max-width: 700px) {
  .import-input-grid {
    grid-template-columns: 1fr;
  }
}

.import-file-drop {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  border: 2px dashed rgba(255, 255, 255, 0.25);
  border-radius: 12px;
  padding: 2rem 1rem;
  cursor: pointer;
  transition: border-color 0.2s, background 0.2s;
}

.import-file-drop:hover,
.import-file-drop.dragover {
  border-color: var(--color-accent, #f97316);
  background: rgba(249, 115, 22, 0.08);
}

.import-file-drop i {
  width: 32px;
  height: 32px;
  color: var(--color-accent, #f97316);
}

.import-file-drop-title {
  font-weight: 600;
  font-size: 1rem;
}

.import-file-drop-hint {
  font-size: 0.85rem;
  opacity: 0.7;
}

.import-paste-area {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.import-paste-area label {
  font-weight: 600;
  font-size: 0.9rem;
}

.import-paste-area textarea {
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 0.8rem;
  resize: vertical;
  min-height: 150px;
}

.import-error {
  background: rgba(239, 68, 68, 0.15);
  color: #fca5a5;
  border-left: 3px solid #ef4444;
  padding: 0.75rem 1rem;
  margin: 0.5rem 0 1rem;
  border-radius: 6px;
  font-size: 0.9rem;
  white-space: pre-wrap;
}

.import-error.hidden {
  display: none;
}

/* --- Phase 2: Review --- */

.import-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  padding: 1rem 0;
}

.import-summary-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem 0.85rem;
  border-radius: 999px;
  font-size: 0.85rem;
  font-weight: 500;
  background: rgba(255, 255, 255, 0.08);
}

.import-summary-pill.ok {
  background: rgba(34, 197, 94, 0.15);
  color: #86efac;
}

.import-summary-pill.warn {
  background: rgba(234, 179, 8, 0.15);
  color: #fde68a;
}

.import-summary-pill.error {
  background: rgba(239, 68, 68, 0.15);
  color: #fca5a5;
}

.import-invalid-details {
  background: rgba(239, 68, 68, 0.08);
  border-left: 3px solid #ef4444;
  padding: 0.75rem 1rem;
  margin-bottom: 1rem;
  border-radius: 6px;
  font-size: 0.85rem;
}

.import-invalid-details.hidden {
  display: none;
}

.import-invalid-details summary {
  cursor: pointer;
  font-weight: 600;
}

.import-invalid-details ul {
  margin: 0.5rem 0 0 1.25rem;
  padding: 0;
}

.import-event-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding-right: 0.5rem;
  margin-bottom: 1rem;
}

.import-event-card {
  display: grid;
  grid-template-columns: auto 80px 1fr auto;
  gap: 0.75rem;
  padding: 0.75rem;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  align-items: start;
}

.import-event-card.skipped {
  opacity: 0.4;
  filter: grayscale(70%);
}

.import-event-card.duplicate {
  border-color: rgba(234, 179, 8, 0.4);
}

.import-event-checkbox {
  width: 20px;
  height: 20px;
  margin-top: 0.25rem;
  cursor: pointer;
}

.import-event-image {
  width: 80px;
  height: 80px;
  object-fit: cover;
  border-radius: 8px;
}

.import-event-body {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
}

.import-event-title {
  font-weight: 600;
  font-size: 0.95rem;
  margin: 0;
}

.import-event-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 0.75rem;
  font-size: 0.8rem;
  opacity: 0.85;
}

.import-event-meta a {
  color: var(--color-accent, #f97316);
  text-decoration: none;
}

.import-event-meta a:hover {
  text-decoration: underline;
}

.import-event-description {
  font-size: 0.85rem;
  opacity: 0.75;
  margin: 0.25rem 0 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.import-event-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.import-event-badge.geo-ok {
  background: rgba(34, 197, 94, 0.2);
  color: #86efac;
}

.import-event-badge.geo-approx {
  background: rgba(234, 179, 8, 0.2);
  color: #fde68a;
}

.import-event-badge.geo-pending {
  background: rgba(59, 130, 246, 0.2);
  color: #93c5fd;
}

.import-event-badge.dupe {
  background: rgba(234, 179, 8, 0.2);
  color: #fde68a;
}

.import-event-actions {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.import-event-actions button {
  font-size: 0.75rem;
  padding: 0.35rem 0.7rem;
}

.import-event-edit-form {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
  padding-top: 0.75rem;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  margin-top: 0.5rem;
}

.import-event-edit-form label {
  display: flex;
  flex-direction: column;
  font-size: 0.75rem;
  gap: 0.2rem;
}

.import-event-edit-form .full {
  grid-column: 1 / -1;
}

.import-event-edit-form input,
.import-event-edit-form select,
.import-event-edit-form textarea {
  font-size: 0.85rem;
  padding: 0.4rem 0.6rem;
}

.import-review-footer {
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  padding-top: 1rem;
  align-items: center;
}

.import-selection-count {
  margin-right: auto;
  font-size: 0.85rem;
  opacity: 0.8;
}

@media (max-width: 600px) {
  .import-event-card {
    grid-template-columns: auto 60px 1fr;
  }

  .import-event-image {
    width: 60px;
    height: 60px;
  }

  .import-event-actions {
    grid-column: 1 / -1;
    flex-direction: row;
    justify-content: flex-end;
  }
}
```

- [ ] **Step 3: Manual verification**

Reload `http://localhost:8080`, open DevTools, manually un-hide the modal:

```javascript
document.getElementById('import-modal').classList.remove('hidden')
```

Expected:
- Modal centered with glass effect
- Two-column input grid on desktop, stacked on mobile (resize browser to verify)
- File-drop zone has dashed border, hover changes color
- Textarea visible with monospace placeholder
- "Validieren" button styled as primary

Then re-hide: `document.getElementById('import-modal').classList.add('hidden')`

- [ ] **Step 4: Commit**

```bash
git add style.css
git commit -m "feat(import): styles for import modal (two-phase layout)"
```

---

## Task 3: JS — Parse and validate JSON input

**Files:**
- Modify: `app.js` (add new section at end of the IIFE, just before the final `});`)

- [ ] **Step 1: Add validation helpers near the top of the IIFE**

In `app.js`, scroll to the end of the const-block (after `REGION_CENTERS`, `CATEGORY_ICONS`, etc., before any function definitions). Add:

```javascript
  // --- Import Feature: Schema constants ---
  const IMPORT_VALID_CATEGORIES = ['music', 'stage', 'markets', 'family', 'sport'];
  const IMPORT_VALID_PLATFORMS = ['Facebook', 'Instagram', 'TikTok', 'Guidle', 'Other'];
  const IMPORT_VALID_MUNICIPALITIES = Object.keys(REGION_CENTERS); // 15 municipalities
  const IMPORT_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const IMPORT_CH_BOUNDS = { latMin: 45.5, latMax: 48.0, lngMin: 5.5, lngMax: 11.0 };
```

- [ ] **Step 2: Add the parse-and-validate functions at the end of the IIFE (before the closing `});`)**

```javascript
  // ============================================================
  // === Import Feature: Parser & Validator                   ===
  // ============================================================

  /**
   * Parse raw JSON text into an array. Throws Error with a readable message on failure.
   */
  function parseImportJson(text) {
    const trimmed = (text || '').trim();
    if (!trimmed) {
      throw new Error('Kein Inhalt — bitte JSON einfügen oder Datei wählen.');
    }
    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch (err) {
      throw new Error('Ungültiges JSON: ' + err.message);
    }
    if (!Array.isArray(parsed)) {
      throw new Error('JSON muss ein Array sein (kein Wrapper-Objekt erlaubt).');
    }
    if (parsed.length === 0) {
      throw new Error('Array ist leer — keine Events zum Importieren.');
    }
    return parsed;
  }

  /**
   * Validate a single event object against the import schema.
   * Returns { ok: true, event } or { ok: false, reasons: [...] }.
   */
  function validateImportedEvent(raw, index) {
    const reasons = [];
    if (!raw || typeof raw !== 'object') {
      return { ok: false, reasons: ['Eintrag ist kein Objekt'] };
    }

    const required = ['title', 'date', 'municipality', 'locationName', 'category', 'description', 'sourceUrl', 'sourcePlatform'];
    for (const field of required) {
      if (!raw[field] || (typeof raw[field] === 'string' && !raw[field].trim())) {
        reasons.push(`Pflichtfeld '${field}' fehlt oder leer`);
      }
    }

    if (raw.date && !IMPORT_DATE_RE.test(raw.date)) {
      reasons.push(`'date' muss YYYY-MM-DD sein (war: '${raw.date}')`);
    } else if (raw.date) {
      const eventDate = new Date(raw.date + 'T00:00:00');
      if (isNaN(eventDate.getTime())) {
        reasons.push(`'date' ist kein gültiges Datum: '${raw.date}'`);
      } else {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (eventDate < today) {
          reasons.push(`Datum liegt in der Vergangenheit: ${raw.date}`);
        }
      }
    }

    if (raw.category && !IMPORT_VALID_CATEGORIES.includes(raw.category)) {
      reasons.push(`'category' muss einer von ${IMPORT_VALID_CATEGORIES.join(', ')} sein (war: '${raw.category}')`);
    }

    if (raw.municipality && !IMPORT_VALID_MUNICIPALITIES.includes(raw.municipality)) {
      reasons.push(`'municipality' nicht in erlaubter Liste (war: '${raw.municipality}')`);
    }

    if (raw.sourcePlatform && !IMPORT_VALID_PLATFORMS.includes(raw.sourcePlatform)) {
      reasons.push(`'sourcePlatform' muss einer von ${IMPORT_VALID_PLATFORMS.join(', ')} sein (war: '${raw.sourcePlatform}')`);
    }

    if (raw.sourceUrl) {
      try {
        new URL(raw.sourceUrl);
      } catch {
        reasons.push(`'sourceUrl' ist keine gültige URL: '${raw.sourceUrl}'`);
      }
    }

    if (raw.lat !== undefined || raw.lng !== undefined) {
      const lat = Number(raw.lat);
      const lng = Number(raw.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        reasons.push(`'lat'/'lng' müssen Zahlen sein`);
      } else if (
        lat < IMPORT_CH_BOUNDS.latMin || lat > IMPORT_CH_BOUNDS.latMax ||
        lng < IMPORT_CH_BOUNDS.lngMin || lng > IMPORT_CH_BOUNDS.lngMax
      ) {
        reasons.push(`Koordinaten ausserhalb Schweiz: ${lat},${lng}`);
      }
    }

    if (reasons.length > 0) {
      return { ok: false, reasons, raw, index };
    }
    return { ok: true, event: raw, index };
  }

  /**
   * Detect duplicates against current events list and localStorage.
   * Mutates valid[] entries by adding .isDuplicate flag.
   */
  function detectImportDuplicates(validResults) {
    const dupeKey = (e) => `${(e.title || '').toLowerCase().trim()}|${e.date}|${e.municipality}`;
    const existingKeys = new Set(events.map(dupeKey));
    for (const result of validResults) {
      result.isDuplicate = existingKeys.has(dupeKey(result.event));
    }
  }
```

- [ ] **Step 3: Console smoke-test the parser**

Reload page in browser. In DevTools console:

```javascript
// Should throw "Array ist leer"
try { parseImportJson('[]'); } catch(e) { console.log('OK1:', e.message); }

// Should throw "Ungültiges JSON"
try { parseImportJson('not json'); } catch(e) { console.log('OK2:', e.message); }

// Should throw "muss ein Array sein"
try { parseImportJson('{"foo":1}'); } catch(e) { console.log('OK3:', e.message); }

// Should succeed
console.log('OK4:', parseImportJson('[{"a":1}]'));
```

Expected: four `OK1`..`OK4` log lines, no uncaught exceptions.

**Note:** These helpers are inside the IIFE and not exposed to `window`. To smoke-test, temporarily add `window.__parseImportJson = parseImportJson;` etc. at the end of the IIFE, then remove after test. Or — easier — skip the console check and verify via the full import flow in Task 8.

- [ ] **Step 4: Commit**

```bash
git add app.js
git commit -m "feat(import): JSON parser, schema validator, duplicate detector"
```

---

## Task 4: JS — Nominatim geocoder with rate-limiting

**Files:**
- Modify: `app.js` (add functions after the parser block from Task 3)

- [ ] **Step 1: Add geocoder functions to `app.js`**

Append AFTER the `detectImportDuplicates` function from Task 3:

```javascript
  // --- Import Feature: Geocoder (Nominatim) ---

  // Nominatim asks for identification via email query param when User-Agent can't be set (browser).
  // Replace with a real contact if you want Nominatim to reach you on issues.
  const NOMINATIM_EMAIL = 'chureventsdashboard@example.invalid';
  const NOMINATIM_DELAY_MS = 1100; // Nominatim policy: max 1 req/sec

  /**
   * Sleep helper used to throttle Nominatim calls.
   */
  function importSleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Try to geocode locationName + municipality via Nominatim.
   * Returns { lat, lng, approximated: false } on hit, or null on miss/error.
   */
  async function geocodeViaNominatim(locationName, municipality) {
    const query = `${locationName}, ${municipality}, Switzerland`;
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&email=${encodeURIComponent(NOMINATIM_EMAIL)}`;
    try {
      const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
      if (!res.ok) return null;
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) return null;
      const lat = parseFloat(data[0].lat);
      const lng = parseFloat(data[0].lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      if (lat < IMPORT_CH_BOUNDS.latMin || lat > IMPORT_CH_BOUNDS.latMax ||
          lng < IMPORT_CH_BOUNDS.lngMin || lng > IMPORT_CH_BOUNDS.lngMax) {
        return null;
      }
      return { lat, lng, approximated: false };
    } catch (err) {
      console.warn('[import] Nominatim error for', query, err);
      return null;
    }
  }

  /**
   * Fallback: use the pre-defined municipality center from REGION_CENTERS.
   * Always returns a coordinate (approximated: true).
   */
  function fallbackMunicipalityCenter(municipality) {
    const center = REGION_CENTERS[municipality];
    if (!center) return null;
    return { lat: center.lat, lng: center.lng, approximated: true };
  }

  /**
   * Resolve coordinates for a validated event.
   * If lat/lng already present and valid -> keep them, approximated=false.
   * Else -> Nominatim, else fallback to municipality center.
   * Sets event.lat, event.lng, event.locationApproximated.
   */
  async function resolveEventCoordinates(event) {
    if (Number.isFinite(Number(event.lat)) && Number.isFinite(Number(event.lng))) {
      event.lat = Number(event.lat);
      event.lng = Number(event.lng);
      event.locationApproximated = false;
      return;
    }
    const geo = await geocodeViaNominatim(event.locationName, event.municipality);
    if (geo) {
      event.lat = geo.lat;
      event.lng = geo.lng;
      event.locationApproximated = false;
      return;
    }
    const fb = fallbackMunicipalityCenter(event.municipality);
    if (fb) {
      event.lat = fb.lat;
      event.lng = fb.lng;
      event.locationApproximated = true;
      return;
    }
    // Last-resort: Chur center
    event.lat = REGION_CENTERS['Chur'].lat;
    event.lng = REGION_CENTERS['Chur'].lng;
    event.locationApproximated = true;
  }

  /**
   * Resolve coordinates for all events that need it.
   * Honors Nominatim rate-limit (1 req/sec) by sequencing only the API-calling ones.
   * Calls onProgress(eventIndex, status) for UI updates.
   */
  async function resolveAllCoordinates(events, onProgress) {
    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      const needsApi = !(Number.isFinite(Number(ev.lat)) && Number.isFinite(Number(ev.lng)));
      if (needsApi) {
        if (onProgress) onProgress(i, 'pending');
      }
      await resolveEventCoordinates(ev);
      if (onProgress) onProgress(i, ev.locationApproximated ? 'approx' : 'ok');
      if (needsApi && i < events.length - 1) {
        await importSleep(NOMINATIM_DELAY_MS);
      }
    }
  }
```

- [ ] **Step 2: Smoke-test the geocoder**

Same as Task 3 — easier to verify in the full flow (Task 8). Skip console test.

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "feat(import): Nominatim geocoder with rate-limit and municipality-center fallback"
```

---

## Task 5: JS — Render review list with toggles

**Files:**
- Modify: `app.js`

- [ ] **Step 1: Add DOM references at the top of the IIFE (in the existing DOM-refs block, around line 60)**

Find the existing `const btnAddEvent = ...` line and after the add-modal refs, insert:

```javascript
  // Import Modal Refs
  const importModal = document.getElementById('import-modal');
  const importModalClose = document.getElementById('import-modal-close');
  const btnImportEvents = document.getElementById('btn-import-events');
  const btnImportCancel1 = document.getElementById('btn-import-cancel-1');
  const btnImportCancel2 = document.getElementById('btn-import-cancel-2');
  const btnImportValidate = document.getElementById('btn-import-validate');
  const btnImportBack = document.getElementById('btn-import-back');
  const btnImportCommit = document.getElementById('btn-import-commit');
  const importPhaseInput = document.getElementById('import-phase-input');
  const importPhaseReview = document.getElementById('import-phase-review');
  const importFileInput = document.getElementById('import-file-input');
  const importPasteInput = document.getElementById('import-paste-input');
  const importParseError = document.getElementById('import-parse-error');
  const importSummary = document.getElementById('import-summary');
  const importInvalidDetails = document.getElementById('import-invalid-details');
  const importEventList = document.getElementById('import-event-list');
  const importSelectionCount = document.getElementById('import-selection-count');

  // Import State
  let importValidResults = []; // [{ event, index, isDuplicate, isSelected, isEditing }]
```

- [ ] **Step 2: Add render functions after the geocoder block**

```javascript
  // --- Import Feature: Render Review List ---

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function formatImportDate(iso) {
    const d = new Date(iso + 'T00:00:00');
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function renderImportSummary(validResults, invalidResults) {
    const dupes = validResults.filter(r => r.isDuplicate).length;
    const pills = [];
    pills.push(`<span class="import-summary-pill ok">✓ ${validResults.length} Events gültig</span>`);
    if (invalidResults.length > 0) {
      pills.push(`<span class="import-summary-pill error">✗ ${invalidResults.length} ungültig</span>`);
    }
    if (dupes > 0) {
      pills.push(`<span class="import-summary-pill warn">⚠ ${dupes} Dubletten</span>`);
    }
    importSummary.innerHTML = pills.join('');
  }

  function renderImportInvalidDetails(invalidResults) {
    if (invalidResults.length === 0) {
      importInvalidDetails.classList.add('hidden');
      importInvalidDetails.innerHTML = '';
      return;
    }
    const items = invalidResults.map(r =>
      `<li><strong>Event ${r.index + 1}:</strong> ${r.reasons.map(escapeHtml).join('; ')}</li>`
    ).join('');
    importInvalidDetails.innerHTML = `
      <details>
        <summary>${invalidResults.length} Events übersprungen — Details anzeigen</summary>
        <ul>${items}</ul>
      </details>
    `;
    importInvalidDetails.classList.remove('hidden');
  }

  function renderImportEventCard(result, listIndex) {
    const ev = result.event;
    const img = ev.imageUrl || FALLBACK_IMAGES[ev.category] || FALLBACK_IMAGES.default || '';
    let geoBadge = '';
    if (result.geoStatus === 'pending') {
      geoBadge = '<span class="import-event-badge geo-pending">⏳ Geocoding läuft</span>';
    } else if (result.geoStatus === 'approx' || ev.locationApproximated) {
      geoBadge = '<span class="import-event-badge geo-approx">📍 Approx. Gemeinde-Zentrum</span>';
    } else if (result.geoStatus === 'ok') {
      geoBadge = '<span class="import-event-badge geo-ok">📍 Standort gefunden</span>';
    }
    const dupeBadge = result.isDuplicate
      ? '<span class="import-event-badge dupe">⚠ Bereits vorhanden</span>'
      : '';
    const skippedClass = result.isSelected === false ? ' skipped' : '';
    const dupeClass = result.isDuplicate ? ' duplicate' : '';

    return `
      <div class="import-event-card${skippedClass}${dupeClass}" data-list-index="${listIndex}">
        <input type="checkbox" class="import-event-checkbox" ${result.isSelected !== false ? 'checked' : ''}
               data-action="toggle" />
        <img class="import-event-image" src="${escapeHtml(img)}" alt="${escapeHtml(ev.title)}"
             onerror="this.src='${escapeHtml(FALLBACK_IMAGES[ev.category] || FALLBACK_IMAGES.default || '')}'" />
        <div class="import-event-body">
          <p class="import-event-title">${escapeHtml(ev.title)}</p>
          <div class="import-event-meta">
            <span>📅 ${formatImportDate(ev.date)}${ev.time ? ' · ' + escapeHtml(ev.time) : ''}</span>
            <span>📍 ${escapeHtml(ev.locationName)} (${escapeHtml(ev.municipality)})</span>
            <span>🏷 ${escapeHtml(getCategoryLabel(ev.category) || ev.category)}</span>
            <span>📷 ${escapeHtml(ev.sourcePlatform)}</span>
            <a href="${escapeHtml(ev.sourceUrl)}" target="_blank" rel="noopener noreferrer">Quelle ansehen ↗</a>
            ${geoBadge}
            ${dupeBadge}
          </div>
          <p class="import-event-description">${escapeHtml(ev.description)}</p>
        </div>
        <div class="import-event-actions">
          <button type="button" class="btn btn-secondary" data-action="edit">Bearbeiten</button>
          <button type="button" class="btn btn-secondary" data-action="skip">Skip</button>
        </div>
      </div>
    `;
  }

  function renderImportEventList() {
    importEventList.innerHTML = importValidResults
      .map((r, i) => renderImportEventCard(r, i))
      .join('');
    if (window.lucide) window.lucide.createIcons();
    updateImportSelectionCount();
  }

  function updateImportSelectionCount() {
    const total = importValidResults.length;
    const selected = importValidResults.filter(r => r.isSelected !== false).length;
    importSelectionCount.textContent = `${selected} von ${total} ausgewählt`;
    btnImportCommit.disabled = selected === 0;
  }
```

- [ ] **Step 2b: Add event delegation handler for the review list (also inside IIFE)**

Append this AFTER the render functions:

```javascript
  // Event delegation on the import event list (checkboxes + action buttons)
  importEventList.addEventListener('click', (e) => {
    const card = e.target.closest('.import-event-card');
    if (!card) return;
    const listIndex = parseInt(card.dataset.listIndex, 10);
    const result = importValidResults[listIndex];
    if (!result) return;

    const action = e.target.dataset.action || e.target.closest('[data-action]')?.dataset.action;

    if (action === 'toggle') {
      result.isSelected = e.target.checked;
      card.classList.toggle('skipped', !result.isSelected);
      updateImportSelectionCount();
    } else if (action === 'skip') {
      result.isSelected = false;
      renderImportEventList();
    } else if (action === 'edit') {
      // Inline edit comes in Task 6 — for now log
      console.log('[import] edit clicked for', listIndex, '— wired in Task 6');
    }
  });
```

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "feat(import): render review list with checkboxes, badges, skip action"
```

---

## Task 6: JS — Inline edit for imported events

**Files:**
- Modify: `app.js`

- [ ] **Step 1: Add the inline-edit form renderer after `renderImportEventCard`**

Insert this function BEFORE `renderImportEventList`:

```javascript
  function renderImportEventEditForm(result, listIndex) {
    const ev = result.event;
    const catOptions = IMPORT_VALID_CATEGORIES
      .map(c => `<option value="${c}" ${c === ev.category ? 'selected' : ''}>${escapeHtml(getCategoryLabel(c) || c)}</option>`)
      .join('');
    const muniOptions = IMPORT_VALID_MUNICIPALITIES
      .map(m => `<option value="${escapeHtml(m)}" ${m === ev.municipality ? 'selected' : ''}>${escapeHtml(m)}</option>`)
      .join('');
    return `
      <div class="import-event-edit-form" data-edit-index="${listIndex}">
        <label class="full">Titel
          <input type="text" data-field="title" value="${escapeHtml(ev.title)}" />
        </label>
        <label>Datum
          <input type="date" data-field="date" value="${escapeHtml(ev.date)}" />
        </label>
        <label>Uhrzeit
          <input type="text" data-field="time" value="${escapeHtml(ev.time || '')}" />
        </label>
        <label>Kategorie
          <select data-field="category">${catOptions}</select>
        </label>
        <label>Gemeinde
          <select data-field="municipality">${muniOptions}</select>
        </label>
        <label class="full">Ort
          <input type="text" data-field="locationName" value="${escapeHtml(ev.locationName)}" />
        </label>
        <label>Lat
          <input type="number" step="any" data-field="lat" value="${ev.lat ?? ''}" />
        </label>
        <label>Lng
          <input type="number" step="any" data-field="lng" value="${ev.lng ?? ''}" />
        </label>
        <label class="full">Beschreibung
          <textarea data-field="description" rows="3">${escapeHtml(ev.description)}</textarea>
        </label>
        <div class="full" style="display:flex;gap:0.5rem;justify-content:flex-end;">
          <button type="button" class="btn btn-secondary" data-action="edit-cancel">Abbrechen</button>
          <button type="button" class="btn btn-primary" data-action="edit-save">Übernehmen</button>
        </div>
      </div>
    `;
  }
```

- [ ] **Step 2: Update `renderImportEventCard` to append edit form when editing**

Replace the final `return` of `renderImportEventCard` with:

```javascript
    const editForm = result.isEditing ? renderImportEventEditForm(result, listIndex) : '';

    return `
      <div class="import-event-card${skippedClass}${dupeClass}" data-list-index="${listIndex}">
        <input type="checkbox" class="import-event-checkbox" ${result.isSelected !== false ? 'checked' : ''}
               data-action="toggle" />
        <img class="import-event-image" src="${escapeHtml(img)}" alt="${escapeHtml(ev.title)}"
             onerror="this.src='${escapeHtml(FALLBACK_IMAGES[ev.category] || FALLBACK_IMAGES.default || '')}'" />
        <div class="import-event-body">
          <p class="import-event-title">${escapeHtml(ev.title)}</p>
          <div class="import-event-meta">
            <span>📅 ${formatImportDate(ev.date)}${ev.time ? ' · ' + escapeHtml(ev.time) : ''}</span>
            <span>📍 ${escapeHtml(ev.locationName)} (${escapeHtml(ev.municipality)})</span>
            <span>🏷 ${escapeHtml(getCategoryLabel(ev.category) || ev.category)}</span>
            <span>📷 ${escapeHtml(ev.sourcePlatform)}</span>
            <a href="${escapeHtml(ev.sourceUrl)}" target="_blank" rel="noopener noreferrer">Quelle ansehen ↗</a>
            ${geoBadge}
            ${dupeBadge}
          </div>
          <p class="import-event-description">${escapeHtml(ev.description)}</p>
        </div>
        <div class="import-event-actions">
          <button type="button" class="btn btn-secondary" data-action="edit">${result.isEditing ? 'Schliessen' : 'Bearbeiten'}</button>
          <button type="button" class="btn btn-secondary" data-action="skip">Skip</button>
        </div>
        ${editForm}
      </div>
    `;
```

- [ ] **Step 3: Extend the click delegation handler with edit-save/cancel**

In the existing `importEventList.addEventListener('click', ...)` handler (added in Task 5), replace the `action === 'edit'` branch and add new branches:

```javascript
    if (action === 'toggle') {
      result.isSelected = e.target.checked;
      card.classList.toggle('skipped', !result.isSelected);
      updateImportSelectionCount();
    } else if (action === 'skip') {
      result.isSelected = false;
      result.isEditing = false;
      renderImportEventList();
    } else if (action === 'edit') {
      result.isEditing = !result.isEditing;
      renderImportEventList();
    } else if (action === 'edit-cancel') {
      result.isEditing = false;
      renderImportEventList();
    } else if (action === 'edit-save') {
      const form = card.querySelector('.import-event-edit-form');
      if (form) {
        form.querySelectorAll('[data-field]').forEach(input => {
          const field = input.dataset.field;
          let value = input.value;
          if (field === 'lat' || field === 'lng') {
            value = value === '' ? undefined : Number(value);
          }
          result.event[field] = value;
        });
        result.isEditing = false;
        // Re-detect duplicate status (title/date/municipality may have changed)
        detectImportDuplicates([result]);
        renderImportEventList();
      }
    }
```

- [ ] **Step 4: Manual verification (do this in full Task 8 flow). Skip standalone test.**

- [ ] **Step 5: Commit**

```bash
git add app.js
git commit -m "feat(import): inline edit form for review items"
```

---

## Task 7: JS — Commit imported events to localStorage

**Files:**
- Modify: `app.js`

- [ ] **Step 1: Add `commitImport` function**

Append AFTER the click delegation handler:

```javascript
  // --- Import Feature: Commit selected events ---

  function buildEventFromImport(raw) {
    return {
      id: Date.now() + Math.floor(Math.random() * 10000),
      title: raw.title,
      category: raw.category,
      categoryLabel: getCategoryLabel(raw.category),
      municipality: raw.municipality,
      description: raw.description,
      date: raw.date,
      time: raw.time || '',
      locationName: raw.locationName,
      lat: raw.lat,
      lng: raw.lng,
      price: 'Eintritt frei', // not in import schema; default
      image: raw.imageUrl || FALLBACK_IMAGES[raw.category],
      organizerUrl: raw.organizerUrl || null,
      ticketUrl: raw.ticketUrl || null,
      source: 'import',
      sources: [{ name: raw.sourcePlatform, url: raw.sourceUrl }],
      locationApproximated: !!raw.locationApproximated
    };
  }

  function commitImport() {
    const toImport = importValidResults
      .filter(r => r.isSelected !== false)
      .map(r => buildEventFromImport(r.event));

    if (toImport.length === 0) {
      alert('Keine Events ausgewählt.');
      return;
    }

    // Persist to localStorage (same key as manual Add-Event flow)
    const saved = localStorage.getItem('chur_events_custom');
    let customEvents = [];
    if (saved) {
      try { customEvents = JSON.parse(saved); } catch { customEvents = []; }
    }
    customEvents.push(...toImport);
    try {
      localStorage.setItem('chur_events_custom', JSON.stringify(customEvents));
    } catch (err) {
      alert('Speicher voll — bitte alte Events löschen und erneut versuchen.\n\n' + err.message);
      return;
    }

    // Add to in-memory state
    events.unshift(...toImport);

    // Refresh UI
    filterEvents();

    // Close modal, reset state
    importModal.classList.add('hidden');
    importValidResults = [];

    alert(`${toImport.length} Events importiert.`);
  }
```

- [ ] **Step 2: Commit**

```bash
git add app.js
git commit -m "feat(import): commit selected events to localStorage and refresh UI"
```

---

## Task 8: JS — Wire up event handlers, full flow

**Files:**
- Modify: `app.js`

- [ ] **Step 1: Add the full wiring at the very end of the IIFE, before `});`**

```javascript
  // --- Import Feature: Wiring ---

  function openImportModal() {
    // Reset state
    importValidResults = [];
    importPasteInput.value = '';
    importFileInput.value = '';
    importParseError.classList.add('hidden');
    importParseError.textContent = '';
    importSummary.innerHTML = '';
    importInvalidDetails.classList.add('hidden');
    importInvalidDetails.innerHTML = '';
    importEventList.innerHTML = '';
    importPhaseInput.classList.remove('hidden');
    importPhaseReview.classList.add('hidden');
    importModal.classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
  }

  function closeImportModal() {
    importModal.classList.add('hidden');
  }

  async function handleImportValidate() {
    importParseError.classList.add('hidden');
    importParseError.textContent = '';

    // Get text: file takes precedence over textarea
    let text = '';
    const file = importFileInput.files[0];
    if (file) {
      try {
        text = await file.text();
      } catch (err) {
        importParseError.textContent = 'Datei konnte nicht gelesen werden: ' + err.message;
        importParseError.classList.remove('hidden');
        return;
      }
    } else {
      text = importPasteInput.value;
    }

    // Parse
    let parsed;
    try {
      parsed = parseImportJson(text);
    } catch (err) {
      importParseError.textContent = err.message;
      importParseError.classList.remove('hidden');
      return;
    }

    // Validate each
    const validResults = [];
    const invalidResults = [];
    parsed.forEach((raw, i) => {
      const result = validateImportedEvent(raw, i);
      if (result.ok) {
        validResults.push({
          event: { ...result.event },
          index: i,
          isDuplicate: false,
          isSelected: true,
          isEditing: false,
          geoStatus: null
        });
      } else {
        invalidResults.push(result);
      }
    });

    if (validResults.length === 0) {
      importParseError.textContent = `Keine gültigen Events gefunden (${invalidResults.length} Fehler).\n\n` +
        invalidResults.map(r => `Event ${r.index + 1}: ${r.reasons.join('; ')}`).join('\n');
      importParseError.classList.remove('hidden');
      return;
    }

    // Dupe detection
    detectImportDuplicates(validResults);

    // Switch to Phase 2
    importValidResults = validResults;
    importPhaseInput.classList.add('hidden');
    importPhaseReview.classList.remove('hidden');

    renderImportSummary(validResults, invalidResults);
    renderImportInvalidDetails(invalidResults);
    renderImportEventList();

    // Kick off async geocoding (non-blocking)
    resolveAllCoordinates(
      validResults.map(r => r.event),
      (i, status) => {
        validResults[i].geoStatus = status;
        renderImportEventList();
      }
    ).catch(err => console.warn('[import] geocoding error:', err));
  }

  // File drag-and-drop
  const dropZone = document.querySelector('.import-file-drop');
  if (dropZone) {
    ['dragenter', 'dragover'].forEach(evt => {
      dropZone.addEventListener(evt, (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
      });
    });
    ['dragleave', 'drop'].forEach(evt => {
      dropZone.addEventListener(evt, (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
      });
    });
    dropZone.addEventListener('drop', (e) => {
      const file = e.dataTransfer?.files?.[0];
      if (file && file.name.endsWith('.json')) {
        const dt = new DataTransfer();
        dt.items.add(file);
        importFileInput.files = dt.files;
      }
    });
  }

  // Button wiring
  btnImportEvents.addEventListener('click', openImportModal);
  importModalClose.addEventListener('click', closeImportModal);
  btnImportCancel1.addEventListener('click', closeImportModal);
  btnImportCancel2.addEventListener('click', closeImportModal);
  btnImportValidate.addEventListener('click', handleImportValidate);
  btnImportBack.addEventListener('click', () => {
    importPhaseReview.classList.add('hidden');
    importPhaseInput.classList.remove('hidden');
  });
  btnImportCommit.addEventListener('click', commitImport);

  // Click-outside-modal to close
  importModal.addEventListener('click', (e) => {
    if (e.target === importModal) closeImportModal();
  });
```

- [ ] **Step 2: End-to-end manual test with the sample JSON**

Test data: `C:\Users\teech\Downloads\chur-events-export-2026-05-24.json`

1. `npm run dev` and open `http://localhost:8080`
2. Click **"Events importieren"** → modal opens, Phase 1 visible
3. Click the file-drop zone, select the test JSON file
4. Click **"Validieren"** → Phase 2 shows:
   - Summary pill: "✓ 9 Events gültig" (or less if any are duplicates with current DB)
   - 9 event cards in the list
   - All checkboxes checked
   - All show "📍 Standort gefunden" badge (because the test JSON has lat/lng already → no Nominatim needed → instant resolution)
5. Verify each card shows: image, title, date, location, category icon, platform, "Quelle ansehen" link, description
6. Click **"Skip"** on event #3 (Kinder-Kreativnachmittag) → card greys out, count drops to "8 von 9 ausgewählt"
7. Click **"Bearbeiten"** on event #1 (Chur OpenAir) → inline form appears
   - Change title to "Chur OpenAir-Konzert am See (2026)"
   - Change time to "18:00 - 23:00"
   - Click **"Übernehmen"** → form closes, card shows new title
8. Click checkbox on event #5 to uncheck → counter updates
9. Click **"Auswahl importieren"** → alert "X Events importiert", modal closes
10. Verify on dashboard:
    - Imported events appear in the events grid (sorted with newest first since `unshift`)
    - Markers appear on the map at correct coordinates
    - Click an imported event → detail modal shows description, "Zur offiziellen Website" missing (no organizerUrl in test data), date is correctly formatted
11. Reload the page → imported events still there (persisted in localStorage)
12. DevTools → Application → Local Storage → `chur_events_custom` should contain the imported events with `source: 'import'` and `sources: [{name: 'Facebook', url: '...'}]`

**If a step fails:** check console errors, then re-verify the relevant Task's code.

- [ ] **Step 3: Cleanup test data from localStorage (optional)**

DevTools console:
```javascript
localStorage.removeItem('chur_events_custom'); location.reload();
```

- [ ] **Step 4: Commit**

```bash
git add app.js
git commit -m "feat(import): wire up import flow end-to-end with file drop and review"
```

---

## Task 9: Negative-path manual tests

These are short verifications — no code changes. They confirm error handling works as designed.

- [ ] **Test 9.1: Invalid JSON**

1. Open import modal
2. Paste: `not json at all`
3. Click "Validieren"
4. Expected: red error box: "Ungültiges JSON: ..."

- [ ] **Test 9.2: Wrapper object instead of array**

1. Paste: `{"events": [{"title":"x"}]}`
2. Click "Validieren"
3. Expected: red error: "JSON muss ein Array sein (kein Wrapper-Objekt erlaubt)."

- [ ] **Test 9.3: Empty array**

1. Paste: `[]`
2. Click "Validieren"
3. Expected: red error: "Array ist leer — keine Events zum Importieren."

- [ ] **Test 9.4: Missing required fields**

1. Paste:
```json
[{"title":"Test","date":"2026-07-01"}]
```
2. Click "Validieren"
3. Expected: red error block listing missing fields (`municipality`, `locationName`, `category`, `description`, `sourceUrl`, `sourcePlatform`)

- [ ] **Test 9.5: Past date**

1. Paste:
```json
[{"title":"Old","date":"2024-01-01","municipality":"Chur","locationName":"x","category":"music","description":"x","sourceUrl":"https://example.com","sourcePlatform":"Facebook"}]
```
2. Expected: error mentioning "Datum liegt in der Vergangenheit"

- [ ] **Test 9.6: Geocoding fallback (no lat/lng + unfindable location)**

1. Paste:
```json
[{"title":"Mystery Event","date":"2026-08-15","municipality":"Chur","locationName":"XXYYZZ Nonexistent Place","category":"stage","description":"test","sourceUrl":"https://example.com","sourcePlatform":"Other"}]
```
2. Click "Validieren"
3. Phase 2: card shows "⏳ Geocoding läuft" briefly, then "📍 Approx. Gemeinde-Zentrum" (after ~1s Nominatim wait)
4. Click "Auswahl importieren" — event lands on Chur center coordinates

- [ ] **Test 9.7: Duplicate detection**

1. First import some events normally
2. Open import modal again, paste the SAME JSON
3. Expected: events show "⚠ Bereits vorhanden" badge, but are still selectable

- [ ] **Test 9.8: File upload + paste precedence**

1. Select a file via the drop zone
2. ALSO type something in the textarea
3. Click "Validieren"
4. Expected: the FILE content is used (textarea is ignored), per handler logic

- [ ] **Step 9.9: Commit only if any UI text fixes are needed; otherwise skip**

If you found typos or unclear messages during 9.1–9.8 and fixed them inline:
```bash
git add app.js style.css
git commit -m "fix(import): refine error messages from QA pass"
```

---

## Task 10: Documentation update

**Files:**
- Modify: `README.md` if it exists, OR create a brief note

- [ ] **Step 1: Check for README**

```bash
ls README.md
```

- [ ] **Step 2: If README exists, append a section; if not, skip**

If README.md exists, add this section near the end:

```markdown
## Social-Event-Import

Events aus dem AI-Studio-Scraper können via JSON-Import in die App geladen werden:

1. JSON aus der AI-Studio-App exportieren (Format: siehe `docs/superpowers/specs/2026-05-24-social-event-import-design.md`)
2. In ChurEvents auf **"Events importieren"** klicken
3. Datei wählen oder JSON einfügen, **Validieren** klicken
4. Events einzeln prüfen, bearbeiten, skippen, dann **Auswahl importieren**

Importierte Events landen in `localStorage` (`chur_events_custom`) — nur im eigenen Browser sichtbar. Für öffentliche Sichtbarkeit ist ein separater Mechanismus geplant (siehe Spec, "Out of Scope").
```

- [ ] **Step 3: Commit if changed**

```bash
git add README.md
git commit -m "docs: README section for Social-Event-Import workflow"
```

---

## Done

After Task 10, the feature is complete:
- Import button visible in header
- JSON file upload OR paste both work
- Validation surfaces parsing and schema errors clearly
- Review list with toggles, edit, skip works
- Geocoding via Nominatim with municipality-center fallback
- Persistence in `localStorage` survives page reload
- Imported events appear in event list AND on the map
- All negative paths produce graceful error messages

**Total commits:** 8 (one per task that ships code; Task 9 typically no commit; Task 10 may or may not).
