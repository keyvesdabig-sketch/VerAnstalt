# Admin-Funktionen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vereinheitlichtes Admin-System für CalandaKultur — Inline-Delete/Edit auf Karten, Admin-Drawer als Hub, Datenbank-Dashboard mit CRUD, und persistente Foto-Imports + Review-Approves via GitHub Contents API. Alle Admin-Aktionen committen in 2 neue Repo-Dateien (`curated-events.json`, `suppressed-event-ids.json`); kein Backend.

**Architecture:** Drei-Schichten-Datenmodell (scraped + curated + suppressed); Frontend-Merge in `public/lib/event-state.js`; Admin-Module in `public/admin/`; bestehende Add-Event-Modal-Logik recycled für Edit; Owner-PAT in localStorage; Optimistic UI mit Rollback bei Fehler. Spec: [`docs/superpowers/specs/2026-05-25-admin-functions-design.md`](../specs/2026-05-25-admin-functions-design.md).

**Tech Stack:** Vanilla JS (ES2020+, kein Build), Node 22 (`node:test`), GitHub REST API v3 (Contents-Endpoint), Leaflet (bestehend), GitHub Pages (`workflow_run`-Trigger schon konfiguriert).

---

## File Structure

### Neu

| Pfad | Verantwortung |
|------|---------------|
| `public/curated-events.json` | Persistente Kuration: Foto-Imports, Edits, Approves. Form: `{ events: [...] }` |
| `public/suppressed-event-ids.json` | Liste gelöschter Event-IDs. Form: `{ ids: [...] }` |
| `public/lib/event-state.js` | UMD: `mergeEventSources(scraped, curated, suppressedSet) → array`. Pure-Funktion, browser + node-test. |
| `public/admin/admin-commit.js` | GitHub Contents API Helper: `commitJsonFile(path, content, message)`, `verifyPat(pat)`. Reviewer-only, defer. |
| `public/admin/admin-shared.js` | High-Level-Operationen: `appendToCurated`, `upsertCurated`, `removeFromCurated`, `addSuppressed`, `removeFromSuppressed`. Nutzt admin-commit + lokales State-Update. |
| `public/admin/admin-drawer.js` | Drawer-UI: Open/Close, Stats-Rendering, Buttons. |
| `public/admin/admin-database.js` | Full-Screen-DB-Modal: Tabelle, Filter, Sort, Bulk. |
| `test/event-state.test.js` | Unit-Tests für merge-Funktion. |
| `test/admin-commit.test.js` | Unit-Tests mit gemocktem `fetch`. |
| `test/admin-shared.test.js` | Unit-Tests mit gemocktem commit-Helper. |

### Geändert

| Pfad | Änderung |
|------|----------|
| `public/index.html` | + Admin-Drawer-Container + DB-Modal-Container + Sidebar-Button „🛠 Admin" + GitHub-PAT-Feld im Settings-Modal + 5 `<script defer>`-Tags |
| `public/style.css` | + `.admin-only` Visibility-Regel + Drawer-Styles + DB-Modal-Styles + Karten-Footer-Styles |
| `public/app.js` | + `body[data-reviewer]`-Setter + Daten-Fetch-Erweiterung (curated + suppressed) + Merge-Pipeline + Karten-Footer-Render + Add-Event-Modal `mode`-Parameter + Settings-Modal-PAT-Wiring + Migration-Prompt + Approve-Pfad nach curated |
| `src/scrape-events.js` | + Read `public/suppressed-event-ids.json` + Filter beim Einlesen jeder Source |

---

## Task 1: Datenmodell + Frontend-Merge + Scraper-Suppression

**Files:**
- Create: `public/curated-events.json`
- Create: `public/suppressed-event-ids.json`
- Create: `public/lib/event-state.js`
- Create: `test/event-state.test.js`
- Modify: `public/app.js` (Daten-Fetch + Merge bei Init)
- Modify: `public/index.html` (Script-Tag für event-state.js)
- Modify: `src/scrape-events.js` (Suppression-Filter)

- [ ] **Step 1.1: Leere JSON-Dateien anlegen**

`public/curated-events.json`:
```json
{
  "events": [],
  "lastUpdated": "2026-05-25T00:00:00Z"
}
```

`public/suppressed-event-ids.json`:
```json
{
  "ids": [],
  "lastUpdated": "2026-05-25T00:00:00Z"
}
```

- [ ] **Step 1.2: Tests für mergeEventSources schreiben (failing)**

`test/event-state.test.js`:
```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mergeEventSources } = require('../public/lib/event-state.js');

test('mergeEventSources: leere Inputs → leerer Output', () => {
  assert.deepEqual(mergeEventSources([], [], new Set()), []);
});

test('mergeEventSources: pures Scraped wird durchgereicht', () => {
  const scraped = [{ id: 1, title: 'A' }, { id: 2, title: 'B' }];
  const out = mergeEventSources(scraped, [], new Set());
  assert.equal(out.length, 2);
});

test('mergeEventSources: suppressed-IDs werden raus gefiltert', () => {
  const scraped = [{ id: 1, title: 'A' }, { id: 2, title: 'B' }];
  const out = mergeEventSources(scraped, [], new Set([1]));
  assert.equal(out.length, 1);
  assert.equal(out[0].id, 2);
});

test('mergeEventSources: curated-Version überschreibt Scraped bei gleicher ID', () => {
  const scraped = [{ id: 1, title: 'Original' }];
  const curated = [{ id: 1, title: 'Edited' }];
  const out = mergeEventSources(scraped, curated, new Set());
  assert.equal(out.length, 1);
  assert.equal(out[0].title, 'Edited');
});

test('mergeEventSources: pure Curated-Events (neue IDs) werden angehängt', () => {
  const scraped = [{ id: 1, title: 'Scraped' }];
  const curated = [{ id: 99, title: 'NewFromPhoto' }];
  const out = mergeEventSources(scraped, curated, new Set());
  assert.equal(out.length, 2);
  assert.ok(out.find(e => e.id === 99));
  assert.ok(out.find(e => e.id === 1));
});

test('mergeEventSources: suppression matcht curated auch (für Undo-Edit)', () => {
  const scraped = [];
  const curated = [{ id: 5, title: 'X' }];
  const out = mergeEventSources(scraped, curated, new Set([5]));
  assert.equal(out.length, 0);
});

test('mergeEventSources: defensiv gegen non-array Eingaben', () => {
  assert.deepEqual(mergeEventSources(null, null, null), []);
  assert.deepEqual(mergeEventSources(undefined, undefined, undefined), []);
});
```

- [ ] **Step 1.3: Test laufen lassen — muss fehlschlagen**

Run: `npm test -- test/event-state.test.js` (oder einfach `npm test`)
Expected: FAIL mit `Cannot find module '../public/lib/event-state.js'`

- [ ] **Step 1.4: event-state.js implementieren**

`public/lib/event-state.js`:
```js
/**
 * Event-State-Helpers für CalandaKultur.
 *
 * mergeEventSources kombiniert die drei Datenquellen (scraped, curated,
 * suppressed) zu der finalen Event-Liste, die das Frontend rendert.
 *
 * Regeln:
 * 1. Suppressed-IDs werden überall raus gefiltert (auch in curated, für
 *    Undo-nach-Edit-Szenarien).
 * 2. Wenn curated und scraped dieselbe ID haben, gewinnt curated
 *    (= Edit-Override).
 * 3. Pure curated-Events (eigene IDs) werden zusätzlich angehängt.
 *
 * UMD-Pattern: läuft im Browser per <script> + in Node-Tests per require.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.EventState = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {

  function mergeEventSources(scraped, curated, suppressedSet) {
    const out = [];
    const supp = suppressedSet instanceof Set ? suppressedSet : new Set();
    const scrapedArr = Array.isArray(scraped) ? scraped : [];
    const curatedArr = Array.isArray(curated) ? curated : [];
    const curatedIds = new Set(curatedArr.map(e => e && e.id).filter(id => id != null));

    for (const ev of scrapedArr) {
      if (!ev || ev.id == null) continue;
      if (supp.has(ev.id)) continue;
      if (curatedIds.has(ev.id)) continue; // wird unten als curated-Version eingefügt
      out.push(ev);
    }
    for (const ev of curatedArr) {
      if (!ev || ev.id == null) continue;
      if (supp.has(ev.id)) continue;
      out.push(ev);
    }
    return out;
  }

  return { mergeEventSources };
});
```

- [ ] **Step 1.5: Test laufen lassen — muss bestehen**

Run: `npm test`
Expected: alle Tests grün, inkl. der 7 neuen.

- [ ] **Step 1.6: Script-Tag in index.html ergänzen**

In `public/index.html`, suche die existierende Sequenz (am Body-Ende):
```html
<script src="events-data.js"></script>
<script src="lib/event-dedup.js"></script>
<script src="app.js"></script>
```

Ersetzen durch:
```html
<script src="events-data.js"></script>
<script src="lib/event-dedup.js"></script>
<script src="lib/event-state.js"></script>
<script src="app.js"></script>
```

- [ ] **Step 1.7: app.js — Daten-Fetch + Merge erweitern**

Finde den Init-Block in `public/app.js`, der `scraped-events.json` lädt (ca. Zeile 220–240, suche nach `📡 Echte Event-Daten geladen`). Aktuell ist es ungefähr:

```js
fetch('scraped-events.json')
  .then(res => res.ok ? res.json() : Promise.reject(res.status))
  .then(scrapedEvents => {
    events = [...customEvents, ...scrapedEvents];
    console.log(`📡 Echte Event-Daten geladen (${scrapedEvents.length} Events aus scraped-events.json).`);
    ...
  });
```

Ersetzen durch:

```js
Promise.all([
  fetch('scraped-events.json').then(r => r.ok ? r.json() : []).catch(() => []),
  fetch('curated-events.json').then(r => r.ok ? r.json() : { events: [] }).catch(() => ({ events: [] })),
  fetch('suppressed-event-ids.json').then(r => r.ok ? r.json() : { ids: [] }).catch(() => ({ ids: [] })),
]).then(([scrapedRaw, curatedJson, suppressedJson]) => {
  const scrapedEvents = Array.isArray(scrapedRaw) ? scrapedRaw : (scrapedRaw.events || []);
  const curated = Array.isArray(curatedJson.events) ? curatedJson.events : [];
  const suppressedSet = new Set(Array.isArray(suppressedJson.ids) ? suppressedJson.ids : []);
  const merged = window.EventState.mergeEventSources(scrapedEvents, curated, suppressedSet);
  events = [...customEvents, ...merged];
  console.log(`📡 Event-Daten geladen: ${scrapedEvents.length} scraped + ${curated.length} curated, ${suppressedSet.size} suppressed.`);
  // ... Rest des bestehenden then-Blocks
});
```

Halte den bestehenden `then`-Body danach (Karten-Render, Filter etc.) bei.

- [ ] **Step 1.8: Scraper-Filter in src/scrape-events.js**

Finde die `main()`-Funktion in `src/scrape-events.js`, ca. ab Zeile 395 wo `for (const source of SOURCES)` läuft. Direkt davor (nach dem Database-Load) suppressed-IDs lesen:

```js
// Suppressed-IDs lesen (Events, die der Admin gelöscht hat — nicht
// re-importieren). Liegt unter public/, damit auch das Frontend drauf zugreift.
let suppressedIds = new Set();
const SUPPRESSED_FILE = path.join(__dirname, '../public/suppressed-event-ids.json').replace(/\\/g, '/');
if (fs.existsSync(SUPPRESSED_FILE)) {
  try {
    const parsed = JSON.parse(fs.readFileSync(SUPPRESSED_FILE, 'utf8'));
    if (Array.isArray(parsed.ids)) suppressedIds = new Set(parsed.ids);
    console.log(`🚫 ${suppressedIds.size} suppressed-IDs geladen.`);
  } catch (e) {
    console.warn('⚠️ suppressed-event-ids.json nicht lesbar, ignoriere:', e.message);
  }
}
```

Dann im Loop `for (const rawEvent of scrapedEvents)` (ca. Zeile 420), gleich nach den existierenden Skip-Checks (Kinofilme, Gottesdienste, ungültige Titel), einen weiteren Skip einbauen:

```js
// Compute-Key wie unten — schon hier prüfen, ob suppressed
const _date = cleanDate(rawEvent.date);
const _titleKey = normalizeText(rawEvent.title);
const _candidateId = `${_titleKey}_${_date}`;
if (suppressedIds.has(_candidateId)) {
  console.log(`🚫 [${source.name}] Überspringe suppressed: "${rawEvent.title}" (${_candidateId})`);
  continue;
}
```

Achte darauf, dass die `compositeKey`-Berechnung weiter unten denselben Algorithmus nutzt (`${titleKey}_${date}`) — wir müssen den gleichen Schlüssel verwenden. Falls die spätere Berechnung sich unterscheidet, ist das ein Bug, den dieser Task aufdeckt.

- [ ] **Step 1.9: Test laufen + Commit**

Run: `npm test`
Expected: alle Tests grün.

Commit:
```bash
git add public/curated-events.json public/suppressed-event-ids.json public/lib/event-state.js test/event-state.test.js public/index.html public/app.js src/scrape-events.js
git commit -m "feat(admin): Datenmodell — curated + suppressed JSON + Merge-Lib

Drei-Schichten-Datenmodell vorbereitet (scraped + curated + suppressed).
- public/curated-events.json + public/suppressed-event-ids.json (leer)
- public/lib/event-state.js mit mergeEventSources (UMD, 7 Tests)
- Frontend lädt jetzt alle drei Dateien parallel und merged
- Scraper überspringt suppressed-IDs beim Einlesen

Vorbereitet für Schritt 2 (Commit-Helper für GitHub Contents API).
Spec: docs/superpowers/specs/2026-05-25-admin-functions-design.md"
```

---

## Task 2: GitHub-Commit-Helper + Settings-PAT

**Files:**
- Create: `public/admin/admin-commit.js`
- Create: `test/admin-commit.test.js`
- Modify: `public/index.html` (PAT-Feld im Settings-Modal + 1 Script-Tag)
- Modify: `public/app.js` (Settings-Modal-Wiring für PAT + Test-Button)
- Modify: `public/style.css` (kleine Zeilen für PAT-Hinweis-Text)

- [ ] **Step 2.1: Tests für admin-commit.js schreiben**

`test/admin-commit.test.js`:
```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { encodeBase64Utf8, buildCommitPayload } = require('../public/admin/admin-commit.js');

test('encodeBase64Utf8: ASCII + Umlaute roundtrip-safe', () => {
  const input = 'Hello — Grüße aus Chur!';
  const encoded = encodeBase64Utf8(input);
  // base64-decode in node:
  const decoded = Buffer.from(encoded, 'base64').toString('utf8');
  assert.equal(decoded, input);
});

test('encodeBase64Utf8: leerer String', () => {
  assert.equal(encodeBase64Utf8(''), '');
});

test('buildCommitPayload: erzeugt korrekte Struktur mit sha', () => {
  const payload = buildCommitPayload({
    content: { foo: 'bar' },
    message: 'test: dummy',
    sha: 'abc123'
  });
  assert.equal(payload.message, 'test: dummy');
  assert.equal(payload.sha, 'abc123');
  const decoded = Buffer.from(payload.content, 'base64').toString('utf8');
  assert.deepEqual(JSON.parse(decoded), { foo: 'bar' });
});

test('buildCommitPayload: ohne sha (neue Datei) — sha fehlt im Output', () => {
  const payload = buildCommitPayload({
    content: { foo: 'bar' },
    message: 'init'
  });
  assert.equal('sha' in payload, false);
});

test('buildCommitPayload: pretty-printed JSON (2-space indent)', () => {
  const payload = buildCommitPayload({
    content: { a: 1, b: 2 },
    message: 'test'
  });
  const decoded = Buffer.from(payload.content, 'base64').toString('utf8');
  assert.ok(decoded.includes('\n  "a"'), 'sollte mit 2-space indent gepretty-printed sein');
});
```

- [ ] **Step 2.2: Test laufen — muss fehlschlagen**

Run: `npm test -- test/admin-commit.test.js`
Expected: FAIL (`Cannot find module`).

- [ ] **Step 2.3: admin-commit.js implementieren**

`public/admin/admin-commit.js`:
```js
/**
 * GitHub Contents API Helper für CalandaKultur-Admin.
 *
 * Schreibt JSON-Dateien direkt aus dem Browser ins Repo via fine-grained PAT
 * (in localStorage.chur_events_github_pat). Verwendet sha-basiertes
 * Optimistic-Lock. Bei 409 (Konflikt) wird einmal automatisch refreshed
 * und neu probiert.
 *
 * Tests: test/admin-commit.test.js (Unit-Tests für die reinen Helper-Funktionen;
 * Network-Pfad wird per Smoke-Test im Browser geprüft).
 *
 * Reviewer-only — wird per <script defer> nur in der index.html geladen.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.AdminCommit = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {

  const REPO = 'keyvesdabig-sketch/VerAnstalt';
  const PAT_KEY = 'chur_events_github_pat';
  const API_BASE = 'https://api.github.com';

  function getPat() {
    try { return localStorage.getItem(PAT_KEY) || null; }
    catch (_) { return null; }
  }

  /**
   * UTF-8-safe Base64-Kodierung (Standard btoa wirft auf non-ASCII).
   */
  function encodeBase64Utf8(str) {
    if (typeof str !== 'string') return '';
    if (!str) return '';
    // Node hat keinen btoa, Browser-Polyfill fallback
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(str, 'utf8').toString('base64');
    }
    return btoa(unescape(encodeURIComponent(str)));
  }

  function buildCommitPayload({ content, message, sha }) {
    const payload = {
      message,
      content: encodeBase64Utf8(JSON.stringify(content, null, 2)),
    };
    if (sha) payload.sha = sha;
    return payload;
  }

  async function ghFetch(pathOrUrl, opts = {}) {
    const pat = opts.pat || getPat();
    if (!pat) throw new Error('Kein GitHub-PAT — bitte in Einstellungen eintragen.');
    const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${API_BASE}${pathOrUrl}`;
    const res = await fetch(url, {
      method: opts.method || 'GET',
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${pat}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    if (!res.ok) {
      const errText = await res.text();
      const err = new Error(`GitHub ${res.status}: ${errText.slice(0, 300)}`);
      err.status = res.status;
      throw err;
    }
    return res.json();
  }

  /**
   * Validiert einen PAT mit einem leichtgewichtigen API-Call.
   * Liefert { ok: true, user } oder { ok: false, error }.
   */
  async function verifyPat(pat) {
    try {
      const user = await ghFetch('/user', { pat });
      return { ok: true, login: user.login };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  /**
   * Committed `content` (ein Objekt) als JSON ins Repo. Macht GET für sha,
   * PUT mit neuem Inhalt. Bei 409 Konflikt: 1× Auto-Retry mit frischem sha.
   */
  async function commitJsonFile(path, content, message) {
    let sha = null;
    try {
      const cur = await ghFetch(`/repos/${REPO}/contents/${path}`);
      sha = cur.sha;
    } catch (err) {
      // 404 = Datei existiert noch nicht — sha bleibt null, PUT erzeugt sie
      if (err.status !== 404) throw err;
    }
    try {
      return await ghFetch(`/repos/${REPO}/contents/${path}`, {
        method: 'PUT',
        body: buildCommitPayload({ content, message, sha }),
      });
    } catch (err) {
      if (err.status === 409 && sha) {
        // Retry mit frischem sha
        const cur = await ghFetch(`/repos/${REPO}/contents/${path}`);
        return ghFetch(`/repos/${REPO}/contents/${path}`, {
          method: 'PUT',
          body: buildCommitPayload({ content, message, sha: cur.sha }),
        });
      }
      throw err;
    }
  }

  return {
    PAT_KEY,
    getPat,
    encodeBase64Utf8,
    buildCommitPayload,
    verifyPat,
    commitJsonFile,
  };
});
```

- [ ] **Step 2.4: Test laufen — muss bestehen**

Run: `npm test`
Expected: alle Tests grün (5 neue dabei).

- [ ] **Step 2.5: PAT-Feld im Settings-Modal hinzufügen**

In `public/index.html`, suche nach `<form id="settings-form"` und finde das bestehende `gemini-key`-Field. Nach diesem Field, vor `<div id="settings-status">`, das hier einfügen:

```html
<label class="form-field">
  <span>GitHub Personal Access Token</span>
  <input type="password" id="settings-github-pat" autocomplete="off"
         placeholder="github_pat_…" spellcheck="false" />
  <small>Fine-grained Token auf <code>keyvesdabig-sketch/VerAnstalt</code> mit
    Permission <code>Contents: Read and write</code>. Bezugsquelle:
    <a href="https://github.com/settings/personal-access-tokens" target="_blank" rel="noopener noreferrer">github.com/settings/personal-access-tokens</a>.
    Wird für Admin-Operationen (Löschen, Edit, Foto-Import publish) gebraucht.
  </small>
</label>
```

Im selben Modal, im `form-actions`-Block, suche `<button type="button" id="btn-settings-test"`. Davor einen zweiten Test-Button einfügen:

```html
<button type="button" id="btn-settings-test-pat" class="btn btn-secondary">PAT prüfen</button>
```

- [ ] **Step 2.6: Script-Tag für admin-commit.js**

In `public/index.html`, nach `<script src="lib/event-state.js"></script>` und vor `<script src="app.js"></script>`:

```html
<script src="admin/admin-commit.js" defer></script>
```

- [ ] **Step 2.7: app.js — Settings-Modal-Wiring erweitern**

In `public/app.js` finde die Stelle nach `btnSettingsTest.addEventListener` (im Settings-Modal-Block, ca. Zeile 1900–1940). Direkt nach diesem Event-Listener, dieselbe Logik für PAT:

```js
// PAT-Verwaltung (zusätzlich zu Gemini-Key)
const settingsGithubPat = document.getElementById('settings-github-pat');
const btnSettingsTestPat = document.getElementById('btn-settings-test-pat');

btnSettingsTestPat.addEventListener('click', async () => {
  const pat = settingsGithubPat.value.trim();
  if (!pat) {
    setSettingsStatus('Bitte zuerst einen PAT eintragen.', 'error');
    return;
  }
  setSettingsStatus('Prüfe PAT …');
  btnSettingsTestPat.disabled = true;
  try {
    const result = await window.AdminCommit.verifyPat(pat);
    if (result.ok) {
      setSettingsStatus(`✓ PAT gültig — angemeldet als ${result.login}.`, 'ok');
    } else {
      setSettingsStatus(`✗ PAT-Fehler: ${result.error}`, 'error');
    }
  } finally {
    btnSettingsTestPat.disabled = false;
  }
});
```

Außerdem im `openSettingsModal()` den PAT laden:
```js
try { settingsGithubPat.value = localStorage.getItem(window.AdminCommit.PAT_KEY) || ''; }
catch (_) { settingsGithubPat.value = ''; }
```
(direkt nach der bestehenden Gemini-Key-Lade-Zeile)

Im `settingsForm` Submit-Handler (`localStorage.setItem(GEMINI_KEY_STORAGE, ...)` etc.), parallel auch:
```js
const pat = settingsGithubPat.value.trim();
if (pat) localStorage.setItem(window.AdminCommit.PAT_KEY, pat);
else localStorage.removeItem(window.AdminCommit.PAT_KEY);
```

Im `btnSettingsClear`-Handler ergänzen:
```js
settingsGithubPat.value = '';
try { localStorage.removeItem(window.AdminCommit.PAT_KEY); } catch (_) {}
```

- [ ] **Step 2.8: Smoke-Test im Browser**

Run lokal: `npm run dev`
Im Browser: `http://localhost:8080/?reviewer=caland-2026-x9k2`
- Settings öffnen → PAT-Feld sichtbar
- Test-PAT eingeben → „PAT prüfen" klicken
- Bei gültigem PAT: „✓ PAT gültig — angemeldet als <user>"
- Bei ungültigem: „✗ PAT-Fehler: …"

- [ ] **Step 2.9: Commit**

```bash
git add public/admin/admin-commit.js test/admin-commit.test.js public/index.html public/app.js
git commit -m "feat(admin): GitHub-Commit-Helper + PAT-Verwaltung in Settings

- public/admin/admin-commit.js (UMD): commitJsonFile mit sha-basiertem
  Optimistic-Lock und 1×-Auto-Retry bei 409 Konflikt; verifyPat-Check
- 5 Unit-Tests für die reinen Helper (Base64-UTF8, Payload-Build)
- Settings-Modal erweitert: PAT-Input + 'PAT prüfen'-Button
- localStorage.chur_events_github_pat

Bereitet Schritt 3 vor (Inline-Aktionen rufen jetzt diese Helper)."
```

---

## Task 3: admin-shared.js + Inline-Karten-Aktionen + Edit-Modus

**Files:**
- Create: `public/admin/admin-shared.js`
- Create: `test/admin-shared.test.js`
- Modify: `public/index.html` (Script-Tag)
- Modify: `public/app.js` (body[data-reviewer]-Setter, Karten-Footer-Render, Add-Modal-mode, Delete/Edit-Handler)
- Modify: `public/style.css` (Karten-Footer-Styles, body[data-reviewer]-Visibility)

- [ ] **Step 3.1: Tests für admin-shared.js (failing)**

`test/admin-shared.test.js`:
```js
const { test } = require('node:test');
const assert = require('node:assert/strict');

// Wir mocken AdminCommit, indem wir es vor dem require auf globalThis injizieren.
globalThis.window = globalThis.window || {};
let mockCalls = [];
globalThis.window.AdminCommit = {
  commitJsonFile: async (path, content, message) => {
    mockCalls.push({ path, content, message });
    return { commit: { sha: 'mock-sha' } };
  },
};

const { appendToCurated, removeFromCurated, addSuppressed, removeFromSuppressed }
  = require('../public/admin/admin-shared.js');

test('appendToCurated: neues Event wird hinten angehängt', async () => {
  mockCalls = [];
  const state = { events: [{ id: 1, title: 'A' }] };
  const out = await appendToCurated(state, { id: 2, title: 'B' });
  assert.equal(out.events.length, 2);
  assert.equal(out.events[1].id, 2);
  assert.equal(mockCalls.length, 1);
  assert.equal(mockCalls[0].path, 'public/curated-events.json');
});

test('appendToCurated: lastUpdated wird gesetzt', async () => {
  mockCalls = [];
  const state = { events: [] };
  const out = await appendToCurated(state, { id: 1, title: 'X' });
  assert.ok(out.lastUpdated, 'lastUpdated sollte gesetzt sein');
  assert.ok(/^\d{4}-\d{2}-\d{2}T/.test(out.lastUpdated), 'sollte ISO-Datum sein');
});

test('removeFromCurated: ID weg, Rest bleibt', async () => {
  mockCalls = [];
  const state = { events: [{ id: 1 }, { id: 2 }, { id: 3 }] };
  const out = await removeFromCurated(state, 2);
  assert.equal(out.events.length, 2);
  assert.ok(!out.events.find(e => e.id === 2));
});

test('addSuppressed: neue ID dazu, doppelte werden ignoriert', async () => {
  mockCalls = [];
  const state = { ids: ['a', 'b'] };
  const out1 = await addSuppressed(state, 'c');
  assert.deepEqual(out1.ids.sort(), ['a', 'b', 'c']);
  const out2 = await addSuppressed(out1, 'a');
  assert.equal(out2.ids.length, 3, 'doppelte ID sollte nicht erneut hinzukommen');
});

test('removeFromSuppressed: ID wird entfernt', async () => {
  mockCalls = [];
  const state = { ids: ['a', 'b', 'c'] };
  const out = await removeFromSuppressed(state, 'b');
  assert.deepEqual(out.ids.sort(), ['a', 'c']);
});
```

- [ ] **Step 3.2: Test laufen — muss fehlschlagen**

Run: `npm test -- test/admin-shared.test.js`
Expected: FAIL (`Cannot find module`).

- [ ] **Step 3.3: admin-shared.js implementieren**

`public/admin/admin-shared.js`:
```js
/**
 * High-Level-Admin-Operationen: nimmt aktuellen JSON-State eines Files,
 * wendet die gewünschte Mutation an, ruft commit-Helper, gibt neuen State
 * zurück. Reviewer-only — die Callers (admin-database.js, app.js Inline-
 * Aktionen) sind eh nur in Admin-Pfaden aktiv.
 *
 * Tests: test/admin-shared.test.js
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.AdminShared = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {

  const CURATED_PATH = 'public/curated-events.json';
  const SUPPRESSED_PATH = 'public/suppressed-event-ids.json';

  function nowIso() { return new Date().toISOString(); }

  function getAdminCommit() {
    const cm = (typeof window !== 'undefined' && window.AdminCommit)
      || (typeof globalThis !== 'undefined' && globalThis.window && globalThis.window.AdminCommit);
    if (!cm) throw new Error('AdminCommit nicht geladen — admin-commit.js fehlt?');
    return cm;
  }

  function shortTitle(ev) {
    return (ev && ev.title) ? String(ev.title).slice(0, 60) : '(ohne Titel)';
  }

  async function appendToCurated(state, event, opts = {}) {
    const events = Array.isArray(state.events) ? state.events.slice() : [];
    events.push(event);
    const newState = { events, lastUpdated: nowIso() };
    if (!opts.dryRun) {
      await getAdminCommit().commitJsonFile(
        CURATED_PATH, newState,
        `curate: add "${shortTitle(event)}" (${opts.origin || 'manual'})`
      );
    }
    return newState;
  }

  async function upsertCurated(state, event, opts = {}) {
    const events = Array.isArray(state.events) ? state.events.slice() : [];
    const idx = events.findIndex(e => e && e.id === event.id);
    if (idx >= 0) events[idx] = event;
    else events.push(event);
    const newState = { events, lastUpdated: nowIso() };
    if (!opts.dryRun) {
      await getAdminCommit().commitJsonFile(
        CURATED_PATH, newState,
        `curate: edit "${shortTitle(event)}"`
      );
    }
    return newState;
  }

  async function removeFromCurated(state, id, opts = {}) {
    const events = (Array.isArray(state.events) ? state.events : []).filter(e => e && e.id !== id);
    const newState = { events, lastUpdated: nowIso() };
    if (!opts.dryRun) {
      await getAdminCommit().commitJsonFile(
        CURATED_PATH, newState,
        `curate: delete (id ${id})`
      );
    }
    return newState;
  }

  async function addSuppressed(state, id, opts = {}) {
    const ids = Array.isArray(state.ids) ? state.ids.slice() : [];
    if (!ids.includes(id)) ids.push(id);
    const newState = { ids, lastUpdated: nowIso() };
    if (!opts.dryRun) {
      await getAdminCommit().commitJsonFile(
        SUPPRESSED_PATH, newState,
        `curate: hide "${opts.title || id}"`
      );
    }
    return newState;
  }

  async function removeFromSuppressed(state, id, opts = {}) {
    const ids = (Array.isArray(state.ids) ? state.ids : []).filter(x => x !== id);
    const newState = { ids, lastUpdated: nowIso() };
    if (!opts.dryRun) {
      await getAdminCommit().commitJsonFile(
        SUPPRESSED_PATH, newState,
        `curate: restore "${opts.title || id}"`
      );
    }
    return newState;
  }

  return {
    CURATED_PATH,
    SUPPRESSED_PATH,
    appendToCurated,
    upsertCurated,
    removeFromCurated,
    addSuppressed,
    removeFromSuppressed,
  };
});
```

- [ ] **Step 3.4: Test laufen — muss bestehen**

Run: `npm test`
Expected: alle Tests grün.

- [ ] **Step 3.5: Script-Tag in index.html**

In `public/index.html`, nach `<script src="admin/admin-commit.js" defer></script>`:
```html
<script src="admin/admin-shared.js" defer></script>
```

- [ ] **Step 3.6: CSS für Reviewer-Visibility + Karten-Footer**

In `public/style.css` am Ende anhängen:
```css
/* === Admin (Reviewer-only) === */
.admin-only { display: none; }
body[data-reviewer="true"] .admin-only { display: initial; }
body[data-reviewer="true"] .admin-only.admin-only-flex { display: flex; }
body[data-reviewer="true"] .admin-only.admin-only-grid { display: grid; }

.event-card-admin-footer {
  display: flex;
  gap: 8px;
  padding: 6px 12px 10px;
  border-top: 1px dashed var(--rule);
  margin-top: 8px;
  font-size: 12px;
}
.event-card-admin-footer button {
  background: transparent;
  border: 1px solid var(--rule);
  border-radius: 4px;
  padding: 3px 8px;
  cursor: pointer;
  color: var(--ink-soft);
}
.event-card-admin-footer button:hover { background: var(--bg-soft, #f6f1e6); color: var(--ink); }
.event-card-admin-footer button.danger:hover { background: var(--accent-tint); color: var(--accent-deep); }

.admin-commit-toast {
  position: fixed;
  bottom: 20px;
  right: 20px;
  background: var(--ink);
  color: #fff;
  padding: 10px 16px;
  border-radius: 8px;
  font-size: 13px;
  z-index: 9999;
  opacity: 0;
  transform: translateY(8px);
  transition: opacity 200ms, transform 200ms;
}
.admin-commit-toast.visible { opacity: 1; transform: translateY(0); }
.admin-commit-toast.ok { background: var(--ok, #2c6849); }
.admin-commit-toast.error { background: var(--accent-deep); }
```

- [ ] **Step 3.7: app.js — body[data-reviewer]-Setter + globaler State**

In `public/app.js`, im Reviewer-Init-Block (suche nach `function isReviewer`), gleich darunter:

```js
// CSS-Hook: schaltet alle .admin-only-Elemente sichtbar
if (isReviewer()) {
  document.body.dataset.reviewer = 'true';
}

// Globaler State für admin-Aktionen (curated + suppressed)
let curatedState = { events: [], lastUpdated: '' };
let suppressedState = { ids: [], lastUpdated: '' };
let suppressedIdSet = new Set();
```

Erweitere die `Promise.all`-Pipeline aus Task 1 so, dass sie auch `curatedState` und `suppressedState` befüllt:

```js
.then(([scrapedRaw, curatedJson, suppressedJson]) => {
  curatedState = (curatedJson && Array.isArray(curatedJson.events)) ? curatedJson : { events: [], lastUpdated: '' };
  suppressedState = (suppressedJson && Array.isArray(suppressedJson.ids)) ? suppressedJson : { ids: [], lastUpdated: '' };
  suppressedIdSet = new Set(suppressedState.ids);
  // ... bestehender Code
});
```

- [ ] **Step 3.8: Karten-Footer-Render (Reviewer-only)**

In `public/app.js`, finde die Karten-Render-Funktion (`renderEventCards` / `renderEventCard`, suche nach `.event-card`). Im HTML-Template der Karte, kurz vor dem schließenden Card-Div, einfügen:

```js
<div class="event-card-admin-footer admin-only admin-only-flex">
  <button type="button" data-action="admin-edit" data-id="${escapeHtml(event.id)}">✏ Bearbeiten</button>
  <button type="button" class="danger" data-action="admin-delete" data-id="${escapeHtml(event.id)}">🗑 Löschen</button>
</div>
```

(Falls die Render-Funktion DOM-API statt String-Template nutzt, äquivalente Elemente erzeugen.)

- [ ] **Step 3.9: Edit-Modal-Modus + Delete-Flow**

In `public/app.js`, finde den Block, der `addModal.classList.remove('hidden')` enthält (Open-Modal-Logik). Refactor zu einer `openAddModal(mode, eventToEdit)`:

```js
let currentEditEventId = null;
function openAddModal(mode, eventToEdit) {
  currentEditEventId = (mode === 'edit' && eventToEdit) ? eventToEdit.id : null;
  // Header anpassen
  const header = addModal.querySelector('.modal-header h2');
  if (header) header.textContent = (mode === 'edit') ? 'Event bearbeiten' : 'Neues Event eintragen';
  const submitBtn = addEventForm.querySelector('button[type="submit"]');
  if (submitBtn) submitBtn.textContent = (mode === 'edit') ? 'Änderungen speichern' : 'Event speichern';

  if (mode === 'edit' && eventToEdit) {
    document.getElementById('event-title').value = eventToEdit.title || '';
    document.getElementById('event-category').value = eventToEdit.category || '';
    document.getElementById('event-price').value = eventToEdit.price || '';
    document.getElementById('event-municipality').value = eventToEdit.municipality || '';
    document.getElementById('event-date').value = eventToEdit.date || '';
    document.getElementById('event-time').value = eventToEdit.time || '';
    document.getElementById('event-location-name').value = eventToEdit.locationName || '';
    document.getElementById('event-lat').value = eventToEdit.lat || '';
    document.getElementById('event-lng').value = eventToEdit.lng || '';
    document.getElementById('event-image').value = eventToEdit.image && !eventToEdit.image.startsWith('data:') ? eventToEdit.image : '';
    document.getElementById('event-website').value = eventToEdit.organizerUrl || '';
    document.getElementById('event-ticket-url').value = eventToEdit.ticketUrl || '';
    const descEl = document.getElementById('event-description');
    if (descEl) descEl.value = eventToEdit.description || '';
  } else {
    addEventForm.reset();
    resetLocationSelectionButton();
    resetPhotoScan();
  }
  addModal.classList.remove('hidden');
}

// Bestehender btnAddEvent.click-Handler ruft jetzt openAddModal('create')
```

Im Submit-Handler des `addEventForm` muss die Save-Logik je nach `currentEditEventId` verzweigen:

```js
addEventForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  // ... bestehende Feld-Sammlung + Dedup-Confirm ...

  const finalImage = lastPhotoBase64 || imageInput;
  const eventId = currentEditEventId != null ? currentEditEventId : Date.now();
  const newEvent = { id: eventId, title, category, /* ... wie heute ... */, image: finalImage || pickFallback(category, eventId) };

  showCommitToast('Committe …');
  try {
    if (currentEditEventId != null) {
      // EDIT: upsert in curated + suppression der Original-ID falls scraped
      curatedState = await window.AdminShared.upsertCurated(curatedState, newEvent);
      // Wenn die ID auch in scraped existiert, suppressen (damit curated gewinnt — schon durch merge,
      // aber suppression hält den Scraper künftig zurück)
      if (!suppressedIdSet.has(eventId)) {
        suppressedState = await window.AdminShared.addSuppressed(suppressedState, eventId, { title: newEvent.title });
        suppressedIdSet.add(eventId);
      }
      // Lokal: ersetze im events-Array
      const idx = events.findIndex(e => e.id === eventId);
      if (idx >= 0) events[idx] = newEvent;
    } else {
      // CREATE
      curatedState = await window.AdminShared.appendToCurated(curatedState, newEvent, { origin: lastPhotoBase64 ? 'foto-import' : 'manual' });
      events.unshift(newEvent);
    }
    showCommitToast('✓ Live in ~30 s', 'ok');
  } catch (err) {
    showCommitToast(`✗ Commit fehlgeschlagen: ${err.message}`, 'error');
    return;
  }

  // Bestehender Modal-close + filter + Marker-Logik
  addEventForm.reset();
  resetLocationSelectionButton();
  resetPhotoScan();
  currentEditEventId = null;
  addModal.classList.add('hidden');
  filterEvents();
});
```

Toast-Helper:
```js
function showCommitToast(text, kind) {
  let el = document.querySelector('.admin-commit-toast');
  if (!el) {
    el = document.createElement('div');
    el.className = 'admin-commit-toast';
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.classList.remove('ok', 'error');
  if (kind) el.classList.add(kind);
  el.classList.add('visible');
  if (kind === 'ok' || kind === 'error') {
    setTimeout(() => el.classList.remove('visible'), 3000);
  }
}
```

- [ ] **Step 3.10: Inline-Delete-Handler**

Event-Delegation auf dem Container, der die Karten enthält (suche nach `eventsGrid.addEventListener` oder ähnlich; falls keine Event-Delegation existiert, am `document` aufhängen):

```js
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-action="admin-delete"], [data-action="admin-edit"]');
  if (!btn) return;
  const id = btn.dataset.id;
  // Normalisiere ID: war es eine number? customs hatten Date.now() als id
  const idNum = Number(id);
  const eventId = !Number.isNaN(idNum) && String(idNum) === id ? idNum : id;
  const ev = events.find(x => x.id === eventId || String(x.id) === String(eventId));
  if (!ev) return;

  if (btn.dataset.action === 'admin-edit') {
    openAddModal('edit', ev);
    return;
  }

  // Delete
  const isCurated = curatedState.events.some(c => c.id === ev.id);
  const isCustomLocal = customEvents.some(c => c.id === ev.id);
  const needsConfirm = !isCustomLocal; // custom-local löschen ohne Bestätigung; alles andere mit
  if (needsConfirm && !confirm(`Event "${ev.title}" wirklich löschen? Für alle Besucher sichtbar.`)) {
    return;
  }

  showCommitToast('Lösche …');
  try {
    if (isCurated) {
      curatedState = await window.AdminShared.removeFromCurated(curatedState, ev.id);
    }
    // Suppress (greift für scraped/iCal + ehemalige curated; idempotent)
    if (!suppressedIdSet.has(ev.id)) {
      suppressedState = await window.AdminShared.addSuppressed(suppressedState, ev.id, { title: ev.title });
      suppressedIdSet.add(ev.id);
    }
    // Local cleanup
    if (isCustomLocal) {
      customEvents = customEvents.filter(c => c.id !== ev.id);
      localStorage.setItem('chur_events_custom', JSON.stringify(customEvents));
    }
    events = events.filter(x => x.id !== ev.id);
    filterEvents();
    showCommitToast('✓ Gelöscht — live in ~30 s', 'ok');
  } catch (err) {
    showCommitToast(`✗ Lösch-Fehler: ${err.message}`, 'error');
  }
});
```

- [ ] **Step 3.11: App-State auf window exponieren** (für admin-drawer.js + admin-database.js in Tasks 4/5)

`public/app.js` ist eine IIFE — externe Module sehen die internen Vars nicht. Am Ende des `Promise.all().then(...)`-Init-Blocks (nachdem `events`, `curatedState`, `suppressedState` befüllt sind), eine kontrollierte Schnittstelle exponieren:

```js
// Schnittstelle für public/admin/*.js (Reviewer-only Module).
// Bewusst minimal: lesen + ein paar Funktionen, kein Free-for-all.
window.appState = {
  get events() { return events; },
  set events(v) { events = v; },
  get customEvents() { return customEvents; },
  set customEvents(v) { customEvents = v; },
  get curatedState() { return curatedState; },
  set curatedState(v) { curatedState = v; },
  get suppressedState() { return suppressedState; },
  set suppressedState(v) { suppressedState = v; },
  get suppressedIdSet() { return suppressedIdSet; },
  get pendingSocialEvents() { return typeof pendingSocialEvents !== 'undefined' ? pendingSocialEvents : []; },
  get reviewedIds() { return typeof reviewedIds !== 'undefined' ? reviewedIds : new Set(); },
  openAddModal,
  filterEvents,
  showCommitToast,
  pickFallback,
  REGION_CENTERS,
};
```

(Anmerkung: Getter/Setter, damit das Objekt nicht beim Init-Zeitpunkt eingefrorene Werte sieht — die globalen Vars wachsen weiter.)

- [ ] **Step 3.12: Smoke-Test im Browser**

Run: `npm run dev`, Browser auf `localhost:8080/?reviewer=caland-2026-x9k2`:
- Karte sollte Admin-Footer mit ✏/🗑 anzeigen (nur wenn `body[data-reviewer="true"]`)
- ✏ klicken → Add-Modal öffnet sich mit „Event bearbeiten"-Header + vorausgefüllt
- 🗑 klicken → confirm-Dialog → Toast „Lösche …" → wenn PAT in Settings + Internet: ok-Toast, Event verschwindet
- Inkognito-Tab ohne Reviewer-Param: kein Footer sichtbar

- [ ] **Step 3.13: Commit**

```bash
git add public/admin/admin-shared.js test/admin-shared.test.js public/index.html public/app.js public/style.css
git commit -m "feat(admin): Inline-Delete/Edit auf Event-Karten + admin-shared

- public/admin/admin-shared.js (UMD): appendToCurated, upsertCurated,
  removeFromCurated, addSuppressed, removeFromSuppressed (5 Tests, mit Mock)
- body[data-reviewer]-CSS-Hook für .admin-only-Sichtbarkeit
- Karten-Footer mit ✏ + 🗑 (Reviewer-only)
- Add-Event-Modal recycled als Edit-Modal via mode-Parameter
- Optimistic-UI mit admin-commit-toast (Committe… / ✓ / ✗)
- Inline-Delete: confirm bei global-deletes, leise bei custom-local"
```

---

## Task 4: Admin-Drawer + Sidebar-Button

**Files:**
- Create: `public/admin/admin-drawer.js`
- Modify: `public/index.html` (Drawer-Container + Sidebar-Button + Script-Tag)
- Modify: `public/style.css` (Drawer-Styles)
- Modify: `public/app.js` (Drawer-Init-Aufruf wenn reviewer)

- [ ] **Step 4.1: HTML — Sidebar-Button**

In `public/index.html`, im `side-footer`-Block, nach dem `btn-settings`-Button:
```html
<button id="btn-admin-drawer" class="ghost-btn admin-only admin-only-flex">
  <i data-lucide="shield"></i>
  Admin
</button>
```

- [ ] **Step 4.2: HTML — Drawer-Container am Body-Ende**

In `public/index.html`, gleicher Bereich wie das Settings-Modal, neu anlegen:

```html
<!-- Admin-Drawer (Reviewer-only) -->
<aside id="admin-drawer" class="admin-drawer hidden" aria-hidden="true">
  <header class="admin-drawer-header">
    <h2>Admin</h2>
    <button type="button" id="btn-admin-drawer-close" class="modal-close">
      <i data-lucide="x"></i>
    </button>
  </header>
  <section class="admin-drawer-section">
    <h3>Übersicht</h3>
    <div class="admin-stat-row"><span id="admin-stat-events">– Events</span></div>
    <div class="admin-stat-row"><span id="admin-stat-curated">– Curated</span></div>
    <div class="admin-stat-row"><span id="admin-stat-suppressed">– Suppressed</span></div>
    <div class="admin-stat-row"><span id="admin-stat-pending">– Review-Queue</span></div>
  </section>
  <section class="admin-drawer-section">
    <h3>Werkzeuge</h3>
    <button type="button" id="btn-admin-database" class="btn btn-primary admin-drawer-action">🗂 Datenbank verwalten</button>
    <button type="button" id="btn-admin-review-open" class="btn btn-secondary admin-drawer-action">📋 Review-Queue</button>
  </section>
  <section class="admin-drawer-section">
    <h3>Konfiguration</h3>
    <button type="button" id="btn-admin-settings" class="btn btn-secondary admin-drawer-action">⚙ Einstellungen</button>
    <button type="button" id="btn-admin-logout" class="btn btn-secondary admin-drawer-action">⎋ Reviewer-Logout</button>
  </section>
</aside>
<div id="admin-drawer-backdrop" class="admin-drawer-backdrop hidden"></div>
```

- [ ] **Step 4.3: Script-Tag in index.html**

Nach `admin-shared.js`:
```html
<script src="admin/admin-drawer.js" defer></script>
```

- [ ] **Step 4.4: CSS — Drawer-Styles**

In `public/style.css` ans Ende:

```css
/* === Admin-Drawer === */
.admin-drawer {
  position: fixed;
  top: 0;
  right: 0;
  height: 100vh;
  width: 400px;
  max-width: 90vw;
  background: var(--bg);
  border-left: 1px solid var(--rule);
  box-shadow: -8px 0 32px rgba(0,0,0,0.12);
  z-index: 1500;
  transform: translateX(100%);
  transition: transform 240ms cubic-bezier(0.4, 0, 0.2, 1);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}
.admin-drawer.open { transform: translateX(0); }
.admin-drawer.hidden { pointer-events: none; }
.admin-drawer-backdrop {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.3);
  z-index: 1400;
  opacity: 0; pointer-events: none;
  transition: opacity 240ms;
}
.admin-drawer-backdrop.visible { opacity: 1; pointer-events: auto; }
.admin-drawer-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 20px 24px; border-bottom: 1px solid var(--rule);
}
.admin-drawer-header h2 { margin: 0; font-size: 20px; }
.admin-drawer-section { padding: 16px 24px; border-bottom: 1px solid var(--rule); }
.admin-drawer-section:last-child { border-bottom: none; }
.admin-drawer-section h3 {
  margin: 0 0 12px; font-size: 11px; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.08em; color: var(--ink-soft);
}
.admin-stat-row { padding: 6px 0; font-size: 14px; color: var(--ink); }
.admin-drawer-action { display: block; width: 100%; margin-bottom: 8px; text-align: left; }
.admin-drawer-action:last-child { margin-bottom: 0; }
```

- [ ] **Step 4.5: admin-drawer.js implementieren**

`public/admin/admin-drawer.js`:
```js
/**
 * Admin-Drawer-UI für CalandaKultur.
 *
 * Hub für Stats + Werkzeuge + Konfiguration. Wird nur initialisiert, wenn
 * der User Reviewer ist (body[data-reviewer="true"]).
 *
 * Erwartet, dass app.js bereits gerendert hat — die Stats werden bei jedem
 * Drawer-Open frisch berechnet (kein Live-Update nötig).
 */
(function () {
  if (typeof window === 'undefined') return;
  if (document.body.dataset.reviewer !== 'true') return;

  const drawer = document.getElementById('admin-drawer');
  const backdrop = document.getElementById('admin-drawer-backdrop');
  const btnOpen = document.getElementById('btn-admin-drawer');
  const btnClose = document.getElementById('btn-admin-drawer-close');
  const btnDatabase = document.getElementById('btn-admin-database');
  const btnReviewOpen = document.getElementById('btn-admin-review-open');
  const btnSettings = document.getElementById('btn-admin-settings');
  const btnLogout = document.getElementById('btn-admin-logout');

  function open() {
    refreshStats();
    drawer.classList.remove('hidden');
    backdrop.classList.remove('hidden');
    requestAnimationFrame(() => {
      drawer.classList.add('open');
      backdrop.classList.add('visible');
    });
    drawer.setAttribute('aria-hidden', 'false');
  }
  function close() {
    drawer.classList.remove('open');
    backdrop.classList.remove('visible');
    setTimeout(() => {
      drawer.classList.add('hidden');
      backdrop.classList.add('hidden');
    }, 240);
    drawer.setAttribute('aria-hidden', 'true');
  }

  function refreshStats() {
    const s = window.appState || {};
    const eventsCount = Array.isArray(s.events) ? s.events.length : 0;
    const curatedCount = (s.curatedState && s.curatedState.events) ? s.curatedState.events.length : 0;
    const suppressedCount = s.suppressedIdSet ? s.suppressedIdSet.size : 0;
    const pendingCount = (Array.isArray(s.pendingSocialEvents) && s.reviewedIds)
      ? s.pendingSocialEvents.filter(e => !s.reviewedIds.has(e.id)).length
      : 0;
    document.getElementById('admin-stat-events').textContent = `${eventsCount} Events angezeigt`;
    document.getElementById('admin-stat-curated').textContent = `${curatedCount} Curated`;
    document.getElementById('admin-stat-suppressed').textContent = `${suppressedCount} Suppressed`;
    document.getElementById('admin-stat-pending').textContent = `${pendingCount} Review-Queue ungelesen`;
  }

  btnOpen.addEventListener('click', open);
  btnClose.addEventListener('click', close);
  backdrop.addEventListener('click', close);

  btnDatabase.addEventListener('click', () => {
    close();
    // Wird in Task 5 implementiert; vorher ein nettes „Coming Soon"
    if (window.AdminDatabase && typeof window.AdminDatabase.open === 'function') {
      window.AdminDatabase.open();
    } else {
      alert('Datenbank-Dashboard kommt im nächsten Schritt (Task 5).');
    }
  });
  btnReviewOpen.addEventListener('click', () => {
    close();
    const btn = document.getElementById('btn-review-open');
    if (btn) btn.click();
  });
  btnSettings.addEventListener('click', () => {
    close();
    document.getElementById('btn-settings').click();
  });
  btnLogout.addEventListener('click', () => {
    window.location.href = '?reviewer=logout';
  });

  // Lucide-Icons neu rendern (für das shield-Icon im Sidebar-Button)
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
})();
```

- [ ] **Step 4.6: Smoke-Test im Browser**

Run: `npm run dev`, Browser auf `localhost:8080/?reviewer=caland-2026-x9k2`:
- „Admin"-Button in Sidebar sichtbar (mit Shield-Icon)
- Klick → Drawer slidet von rechts rein
- Stats werden angezeigt
- Klick auf Backdrop → schließt
- „Einstellungen"-Button im Drawer → öffnet Settings-Modal
- „Review-Queue"-Button → öffnet Review-Modal (wenn pending vorhanden)

- [ ] **Step 4.7: Commit**

```bash
git add public/admin/admin-drawer.js public/index.html public/style.css public/app.js
git commit -m "feat(admin): Admin-Drawer als Hub für Stats + Werkzeuge

- Rechts slidender Drawer (400 px, max 90vw)
- Live-Stats: Events angezeigt, Curated, Suppressed, Review-Queue
- Werkzeug-Buttons: Datenbank (Stub), Review-Queue, Settings, Logout
- Sidebar-Button '🛠 Admin' (Reviewer-only)
- admin-drawer.js initialisiert sich nur bei body[data-reviewer=true]"
```

---

## Task 5: Datenbank-Dashboard (Full-Screen-Modal)

**Files:**
- Create: `public/admin/admin-database.js`
- Modify: `public/index.html` (DB-Modal-Container + Script-Tag)
- Modify: `public/style.css` (DB-Modal-Styles)

- [ ] **Step 5.1: HTML — DB-Modal-Container**

In `public/index.html`, neben den anderen Modals:

```html
<!-- Datenbank-Dashboard (Reviewer-only) -->
<div class="modal-backdrop hidden" id="admin-db-modal">
  <div class="modal-container admin-db-container">
    <button class="modal-close" id="admin-db-modal-close">
      <i data-lucide="x"></i>
    </button>
    <div class="modal-header">
      <h2>Datenbank verwalten</h2>
      <p>Alle Events einer Quelle anzeigen, filtern, editieren oder löschen.</p>
    </div>
    <div class="admin-db-toolbar">
      <label>Quelle:
        <select id="admin-db-filter-source">
          <option value="all">Alle</option>
          <option value="scraped">Scraped</option>
          <option value="curated">Curated</option>
          <option value="suppressed">Gelöscht (Suppressed)</option>
        </select>
      </label>
      <label>Gemeinde:
        <select id="admin-db-filter-municipality"><option value="all">Alle</option></select>
      </label>
      <input type="search" id="admin-db-filter-search" placeholder="Suche Titel / Ort …" />
      <label>Sortieren:
        <select id="admin-db-sort">
          <option value="date-asc">Datum ↑</option>
          <option value="date-desc">Datum ↓</option>
          <option value="title">Titel</option>
        </select>
      </label>
      <span class="admin-db-count" id="admin-db-count">– Treffer</span>
    </div>
    <div class="admin-db-table-wrap">
      <table class="admin-db-table">
        <thead>
          <tr>
            <th><input type="checkbox" id="admin-db-check-all"></th>
            <th>Titel</th>
            <th>Datum</th>
            <th>Ort</th>
            <th>Quelle</th>
            <th>Status</th>
            <th>Aktionen</th>
          </tr>
        </thead>
        <tbody id="admin-db-tbody"></tbody>
      </table>
    </div>
    <div class="admin-db-bulkbar hidden" id="admin-db-bulkbar">
      <span id="admin-db-selected-count">0 ausgewählt</span>
      <button type="button" id="admin-db-bulk-delete" class="btn btn-secondary">🗑 Alle löschen</button>
      <button type="button" id="admin-db-bulk-clear" class="btn btn-secondary">✗ Auswahl aufheben</button>
    </div>
  </div>
</div>
```

- [ ] **Step 5.2: Script-Tag**

Nach `admin-drawer.js`:
```html
<script src="admin/admin-database.js" defer></script>
```

- [ ] **Step 5.3: CSS für DB-Modal**

In `public/style.css` ans Ende:

```css
/* === Admin-Datenbank-Modal === */
.admin-db-container { max-width: 1100px; width: 95vw; max-height: 90vh; display: flex; flex-direction: column; }
.admin-db-toolbar {
  display: flex; gap: 16px; align-items: center; flex-wrap: wrap;
  padding: 16px 28px; border-bottom: 1px solid var(--rule);
  font-size: 13px;
}
.admin-db-toolbar label { display: flex; align-items: center; gap: 6px; }
.admin-db-toolbar select, .admin-db-toolbar input {
  padding: 6px 10px; border: 1px solid var(--rule); border-radius: 4px; background: #fff;
}
.admin-db-toolbar input[type="search"] { min-width: 220px; }
.admin-db-count { margin-left: auto; color: var(--ink-soft); }

.admin-db-table-wrap { flex: 1; overflow: auto; padding: 0 28px 16px; }
.admin-db-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.admin-db-table thead { position: sticky; top: 0; background: var(--bg); z-index: 1; }
.admin-db-table th, .admin-db-table td {
  padding: 8px 10px; text-align: left; border-bottom: 1px solid var(--rule);
  vertical-align: top;
}
.admin-db-table th { font-weight: 600; color: var(--ink-soft); font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; }
.admin-db-table td.title { font-weight: 500; max-width: 280px; overflow: hidden; text-overflow: ellipsis; }
.admin-db-table td.actions { white-space: nowrap; }
.admin-db-table td.actions button { background: transparent; border: 1px solid var(--rule); border-radius: 3px; padding: 2px 6px; cursor: pointer; margin-right: 2px; }
.admin-db-table td.actions button:hover { background: var(--bg-soft, #f6f1e6); }
.admin-db-table .status-pill {
  display: inline-block; padding: 2px 6px; border-radius: 3px; font-size: 11px;
}
.admin-db-table .status-pill.curated { background: rgba(44,104,73,0.14); color: var(--ok, #2c6849); }
.admin-db-table .status-pill.edited { background: rgba(160,102,40,0.14); color: var(--warn); }
.admin-db-table .status-pill.suppressed { background: var(--accent-tint); color: var(--accent-deep); }

.admin-db-bulkbar {
  display: flex; gap: 12px; align-items: center;
  padding: 12px 28px; border-top: 1px solid var(--rule); background: var(--bg-soft, #f6f1e6);
}
.admin-db-bulkbar.hidden { display: none; }
```

- [ ] **Step 5.4: admin-database.js implementieren**

`public/admin/admin-database.js`:
```js
/**
 * Datenbank-Dashboard für Admin-CRUD.
 *
 * Liest den gemergten events-Array aus app.js + curatedState + suppressedState
 * direkt (gewollte Kopplung), rendert sie als Tabelle mit Filter/Sort/Bulk-
 * Operations. Jede Aktion ruft admin-shared.js → admin-commit.js.
 */
(function () {
  if (typeof window === 'undefined') return;
  if (document.body.dataset.reviewer !== 'true') return;

  const modal = document.getElementById('admin-db-modal');
  const closeBtn = document.getElementById('admin-db-modal-close');
  const filterSource = document.getElementById('admin-db-filter-source');
  const filterMuni = document.getElementById('admin-db-filter-municipality');
  const filterSearch = document.getElementById('admin-db-filter-search');
  const sortSel = document.getElementById('admin-db-sort');
  const countLabel = document.getElementById('admin-db-count');
  const tbody = document.getElementById('admin-db-tbody');
  const checkAll = document.getElementById('admin-db-check-all');
  const bulkbar = document.getElementById('admin-db-bulkbar');
  const bulkCount = document.getElementById('admin-db-selected-count');
  const btnBulkDelete = document.getElementById('admin-db-bulk-delete');
  const btnBulkClear = document.getElementById('admin-db-bulk-clear');

  let selectedIds = new Set();

  function open() {
    populateMunicipalityFilter();
    selectedIds.clear();
    render();
    modal.classList.remove('hidden');
  }
  function close() { modal.classList.add('hidden'); }

  function populateMunicipalityFilter() {
    const events = (window.appState && window.appState.events) || [];
    const munis = new Set();
    events.forEach(e => { if (e && e.municipality) munis.add(e.municipality); });
    filterMuni.innerHTML = '<option value="all">Alle</option>'
      + Array.from(munis).sort().map(m => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join('');
  }

  function getSourceLabel(ev) {
    if (ev.sources && ev.sources.length) return ev.sources[0].name || 'Unbekannt';
    if (ev.sourcePlatform) return ev.sourcePlatform;
    return 'Unbekannt';
  }

  function getStatus(ev) {
    const curatedEvents = (window.appState.curatedState && window.appState.curatedState.events) || [];
    const inCurated = curatedEvents.some(c => c.id === ev.id);
    if (inCurated && !window.appState.suppressedIdSet.has(ev.id)) {
      const isEditOverride = ev.sources && ev.sources.length;
      return isEditOverride ? { label: '✏ ediert', cls: 'edited' } : { label: '🆕 curated', cls: 'curated' };
    }
    return { label: '', cls: '' };
  }

  function getFilteredRows() {
    const s = window.appState || {};
    const events = s.events || [];
    const curatedEvents = (s.curatedState && s.curatedState.events) || [];
    const source = filterSource.value;
    const muni = filterMuni.value;
    const q = filterSearch.value.trim().toLowerCase();
    const sort = sortSel.value;

    let rows;
    if (source === 'suppressed') {
      rows = Array.from(s.suppressedIdSet || []).map(id => {
        const all = (window.AdminDatabase.rawScraped || []).concat(curatedEvents);
        const ev = all.find(e => e && e.id === id) || { id, title: `(ID ${id})`, date: '', locationName: '', municipality: '' };
        return ev;
      });
    } else if (source === 'curated') {
      rows = curatedEvents.slice();
    } else if (source === 'scraped') {
      const curatedIds = new Set(curatedEvents.map(e => e.id));
      rows = (window.AdminDatabase.rawScraped || []).filter(e => !curatedIds.has(e.id));
    } else {
      rows = events.slice();
    }

    if (muni !== 'all') rows = rows.filter(e => e.municipality === muni);
    if (q) rows = rows.filter(e =>
      (e.title || '').toLowerCase().includes(q) ||
      (e.locationName || '').toLowerCase().includes(q) ||
      (e.description || '').toLowerCase().includes(q)
    );

    if (sort === 'date-asc') rows.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    else if (sort === 'date-desc') rows.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    else if (sort === 'title') rows.sort((a, b) => (a.title || '').localeCompare(b.title || ''));

    return rows;
  }

  function render() {
    const rows = getFilteredRows();
    countLabel.textContent = `${rows.length} Treffer`;
    const isSuppressedView = filterSource.value === 'suppressed';
    tbody.innerHTML = rows.map(ev => {
      const st = getStatus(ev);
      const stPill = isSuppressedView
        ? '<span class="status-pill suppressed">🚫 suppressed</span>'
        : (st.label ? `<span class="status-pill ${st.cls}">${st.label}</span>` : '');
      const actionsHtml = isSuppressedView
        ? `<button type="button" data-action="restore" data-id="${escapeHtml(ev.id)}">⟲ Wiederherstellen</button>`
        : `<button type="button" data-action="edit" data-id="${escapeHtml(ev.id)}">✏</button>` +
          `<button type="button" data-action="delete" data-id="${escapeHtml(ev.id)}">🗑</button>`;
      return `
        <tr data-id="${escapeHtml(ev.id)}">
          <td><input type="checkbox" class="admin-db-row-check" data-id="${escapeHtml(ev.id)}" ${selectedIds.has(String(ev.id)) ? 'checked' : ''} /></td>
          <td class="title">${escapeHtml(ev.title || '(ohne Titel)')}</td>
          <td>${escapeHtml(ev.date || '')}${ev.time ? ' ' + escapeHtml(ev.time) : ''}</td>
          <td>${escapeHtml(ev.locationName || '')}</td>
          <td>${escapeHtml(getSourceLabel(ev))}</td>
          <td>${stPill}</td>
          <td class="actions">${actionsHtml}</td>
        </tr>
      `;
    }).join('') || '<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--ink-soft);">Keine Treffer.</td></tr>';
    updateBulkBar();
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' }[c]));
  }

  function updateBulkBar() {
    const n = selectedIds.size;
    bulkCount.textContent = `${n} ausgewählt`;
    bulkbar.classList.toggle('hidden', n === 0);
  }

  // Wiring
  closeBtn.addEventListener('click', close);
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  filterSource.addEventListener('change', render);
  filterMuni.addEventListener('change', render);
  sortSel.addEventListener('change', render);
  let searchTimer = null;
  filterSearch.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(render, 200);
  });

  checkAll.addEventListener('change', () => {
    if (checkAll.checked) {
      tbody.querySelectorAll('.admin-db-row-check').forEach(cb => {
        selectedIds.add(cb.dataset.id);
        cb.checked = true;
      });
    } else {
      selectedIds.clear();
      tbody.querySelectorAll('.admin-db-row-check').forEach(cb => { cb.checked = false; });
    }
    updateBulkBar();
  });

  tbody.addEventListener('change', (e) => {
    if (!e.target.classList.contains('admin-db-row-check')) return;
    const id = e.target.dataset.id;
    if (e.target.checked) selectedIds.add(id);
    else selectedIds.delete(id);
    updateBulkBar();
  });

  tbody.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const id = btn.dataset.id;
    const idNum = Number(id);
    const eventId = !Number.isNaN(idNum) && String(idNum) === id ? idNum : id;
    const action = btn.dataset.action;

    const s = window.appState;
    const events = s.events;

    if (action === 'edit') {
      const ev = events.find(e => String(e.id) === String(eventId));
      if (ev) {
        close();
        s.openAddModal('edit', ev);
      }
    } else if (action === 'delete') {
      const ev = events.find(e => String(e.id) === String(eventId));
      if (!ev) return;
      if (!confirm(`Event "${ev.title}" löschen? Für alle Besucher.`)) return;
      try {
        const isCurated = s.curatedState.events.some(c => c.id === ev.id);
        if (isCurated) {
          s.curatedState = await window.AdminShared.removeFromCurated(s.curatedState, ev.id);
        }
        if (!s.suppressedIdSet.has(ev.id)) {
          s.suppressedState = await window.AdminShared.addSuppressed(s.suppressedState, ev.id, { title: ev.title });
          s.suppressedIdSet.add(ev.id);
        }
        s.events = events.filter(x => x.id !== ev.id);
        s.filterEvents();
        render();
      } catch (err) {
        alert('Fehler: ' + err.message);
      }
    } else if (action === 'restore') {
      try {
        s.suppressedState = await window.AdminShared.removeFromSuppressed(s.suppressedState, eventId, { title: String(eventId) });
        s.suppressedIdSet.delete(eventId);
        alert('Wiederhergestellt — Seite wird neu geladen.');
        window.location.reload();
      } catch (err) {
        alert('Fehler: ' + err.message);
      }
    }
  });

  btnBulkDelete.addEventListener('click', async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`${selectedIds.size} Events löschen?`)) return;
    const s = window.appState;
    for (const idStr of Array.from(selectedIds)) {
      const idNum = Number(idStr);
      const id = !Number.isNaN(idNum) && String(idNum) === idStr ? idNum : idStr;
      const ev = s.events.find(e => String(e.id) === idStr);
      try {
        if (ev && s.curatedState.events.some(c => c.id === id)) {
          s.curatedState = await window.AdminShared.removeFromCurated(s.curatedState, id);
        }
        if (!s.suppressedIdSet.has(id)) {
          s.suppressedState = await window.AdminShared.addSuppressed(s.suppressedState, id, { title: ev ? ev.title : String(id) });
          s.suppressedIdSet.add(id);
        }
        s.events = s.events.filter(x => x.id !== id);
      } catch (err) {
        alert(`Fehler bei "${ev ? ev.title : id}": ${err.message}`);
        break;
      }
    }
    selectedIds.clear();
    s.filterEvents();
    render();
  });

  btnBulkClear.addEventListener('click', () => {
    selectedIds.clear();
    tbody.querySelectorAll('.admin-db-row-check').forEach(cb => { cb.checked = false; });
    checkAll.checked = false;
    updateBulkBar();
  });

  // Public API für admin-drawer.js
  window.AdminDatabase = {
    open,
    close,
    // rawScraped wird von app.js gesetzt nach dem Fetch (siehe Task 5.5)
    rawScraped: [],
  };
})();
```

- [ ] **Step 5.5: app.js — rawScraped exponieren**

In `public/app.js`, im `Promise.all`-then aus Task 1, am Ende des then-Blocks:

```js
// Für Admin-Dashboard: roh-scraped-Liste (vor Merge) zwischen-speichern
if (window.AdminDatabase) {
  window.AdminDatabase.rawScraped = scrapedEvents.slice();
}
```

- [ ] **Step 5.6: Smoke-Test im Browser**

Run: `npm run dev`, Browser auf `localhost:8080/?reviewer=caland-2026-x9k2`:
- Admin-Drawer öffnen → „🗂 Datenbank verwalten" klicken
- DB-Modal öffnet sich mit Tabelle aller Events
- Filter „Quelle" wechseln → Anzeige aktualisiert sich
- Suche im Suchfeld → Tabelle filtert mit 200ms Debounce
- Sortierung umschalten
- ✏ klicken → Add-Modal öffnet in Edit-Mode
- 🗑 klicken → confirm → Commit-Flow
- Mehrere Checkboxen → Bulk-Bar erscheint → „Alle löschen" funktioniert
- Quelle = „Suppressed" → zeigt gelöschte mit ⟲ Wiederherstellen

- [ ] **Step 5.7: Commit**

```bash
git add public/admin/admin-database.js public/index.html public/style.css public/app.js
git commit -m "feat(admin): Datenbank-Dashboard (Full-Screen-Modal mit CRUD)

- Tabelle aller Events mit Quelle/Status-Spalten
- Filter: Quelle (alle/scraped/curated/suppressed), Gemeinde, Volltext-Suche
- Sortierung nach Datum/Titel
- Inline-Aktionen ✏ (öffnet Edit-Modal) und 🗑 (Delete-Commit-Flow)
- Suppressed-View mit ⟲ Wiederherstellen
- Bulk-Selection + Bulk-Delete
- Public-API window.AdminDatabase.open() vom Drawer aus aufrufbar"
```

---

## Task 6: Migration bestehender lokaler Custom-Events

**Files:**
- Modify: `public/app.js` (Migration-Prompt + Bulk-Push)

- [ ] **Step 6.1: Migration-Prompt-Logik**

In `public/app.js`, nach dem Reviewer-Init und nach der `Promise.all`-Datenfetch-Pipeline, eine einmalige Migration. Marker in localStorage, damit es nur 1× passiert:

```js
const MIGRATION_KEY = 'chur_events_migration_v1';

async function maybeMigrateLocalCustoms() {
  if (!isReviewer()) return;
  try {
    if (localStorage.getItem(MIGRATION_KEY)) return; // schon erledigt
  } catch (_) { return; }

  const local = (() => {
    try { return JSON.parse(localStorage.getItem('chur_events_custom') || '[]'); }
    catch (_) { return []; }
  })();
  if (!Array.isArray(local) || local.length === 0) {
    try { localStorage.setItem(MIGRATION_KEY, new Date().toISOString()); } catch (_) {}
    return;
  }

  // Filter: nur Events, die NICHT schon in curated sind (id-Match)
  const curatedIds = new Set(curatedState.events.map(e => e.id));
  const toMigrate = local.filter(e => e && !curatedIds.has(e.id));
  if (toMigrate.length === 0) {
    try { localStorage.setItem(MIGRATION_KEY, new Date().toISOString()); } catch (_) {}
    return;
  }

  const ok = confirm(
    `Du hast ${toMigrate.length} lokale Custom-Events in diesem Browser, ` +
    `die noch nicht im Repo liegen. Jetzt auf den Server pushen, damit alle ` +
    `Besucher sie sehen? (Braucht einen gültigen GitHub-PAT in Settings.)`
  );
  if (!ok) {
    // User entscheidet sich dagegen — nicht erneut fragen
    try { localStorage.setItem(MIGRATION_KEY, 'declined-' + new Date().toISOString()); } catch (_) {}
    return;
  }

  let migrated = 0;
  let failed = 0;
  for (const ev of toMigrate) {
    try {
      curatedState = await window.AdminShared.appendToCurated(curatedState, ev, { origin: 'migration' });
      migrated++;
    } catch (err) {
      console.error('[migration] fehlgeschlagen für', ev.title, err);
      failed++;
      if (failed >= 3) {
        alert(`Migration abgebrochen nach 3 Fehlern. Bisher ${migrated} migriert.`);
        return;
      }
    }
  }

  // Lokale Liste leeren (commit war erfolgreich für die, die gemacht wurden)
  try {
    const remaining = local.filter(e => !toMigrate.slice(0, migrated).some(m => m.id === e.id));
    localStorage.setItem('chur_events_custom', JSON.stringify(remaining));
    localStorage.setItem(MIGRATION_KEY, new Date().toISOString());
  } catch (_) {}

  alert(`✓ ${migrated} Events nach curated-events.json migriert${failed ? ' (' + failed + ' fehlgeschlagen)' : ''}. ` +
        `Live in ~30 s sichtbar.`);
}

// Aufruf am Ende der Init-Pipeline (im Promise.all().then())
maybeMigrateLocalCustoms();
```

- [ ] **Step 6.2: Smoke-Test**

Run: `npm run dev`. Im Browser:
- Vorbedingung: Reviewer aktiv, mind. 1 Custom-Event in localStorage, gültiger PAT in Settings
- Seite neu laden → Prompt erscheint
- „OK" → Toast „Migration läuft…"? (kommt aus den einzelnen commit-Toasts) → Erfolgs-Alert
- Erneuter Reload → KEIN erneuter Prompt (MIGRATION_KEY ist gesetzt)
- Ablehnen-Test: localStorage `MIGRATION_KEY` löschen, Custom-Event re-erzeugen, „Abbrechen" klicken → Prompt erscheint nicht mehr (declined-Marker)

- [ ] **Step 6.3: Commit**

```bash
git add public/app.js
git commit -m "feat(admin): Migration lokaler Custom-Events nach curated-events

Einmaliger Prompt beim ersten Reviewer-Visit nach dem Update.
Push aller lokalen chur_events_custom-Einträge ins Repo (mit
commit-message 'curate: add ... (migration)').

Marker chur_events_migration_v1 verhindert wiederholtes Fragen,
sowohl bei Erfolg als auch bei Ablehnung (declined-Variante).
Lokale Liste wird nach Erfolg geleert."
```

---

## Task 7: Review-Approve-Pfad nach curated-events.json

**Files:**
- Modify: `public/app.js` (approveReviewEvent → committen statt localStorage)

- [ ] **Step 7.1: Approve-Handler umbauen**

Finde in `public/app.js` die Funktion `approveReviewEvent(eventId)` (aus Task „Social-Review"). Aktuell schreibt sie nach `chur_events_custom`. Umbauen auf curated-Commit:

```js
async function approveReviewEvent(eventId) {
  const ev = pendingSocialEvents.find(e => e.id === eventId);
  if (!ev) return;

  // Dedup-Check (wie heute)
  if (!confirmIfDuplicate({ title: ev.title, date: ev.date, locationName: ev.locationName }, events)) {
    return;
  }

  // Build internal event format (identisch zu vorher)
  const importLike = {
    title: ev.title,
    date: ev.date,
    time: ev.time,
    municipality: ev.municipality,
    locationName: ev.locationName,
    category: ev.category,
    description: ev.description,
    sourceUrl: ev.sourceUrl || '',
    sourcePlatform: ev.sourcePlatform || 'Other',
    imageUrl: ev.image,
    lat: ev.lat,
    lng: ev.lng,
    ticketUrl: ev.ticketUrl,
    organizerUrl: ev.organizerUrl,
    locationApproximated: ev.lat == null || ev.lng == null
  };
  if (importLike.lat == null || importLike.lng == null) {
    const center = REGION_CENTERS[ev.municipality];
    if (center) { importLike.lat = center.lat; importLike.lng = center.lng; }
  }
  const newEvent = buildEventFromImport(importLike);

  showCommitToast('Committe Approve …');
  try {
    curatedState = await window.AdminShared.appendToCurated(curatedState, newEvent, { origin: 'social-approve' });
    events.unshift(newEvent);
    reviewedIds.add(eventId);
    persistReviewedIds();
    filterEvents();
    renderReviewList();
    updateBanner();
    showCommitToast('✓ Approved — live in ~30 s', 'ok');
  } catch (err) {
    showCommitToast(`✗ Approve fehlgeschlagen: ${err.message}`, 'error');
  }
}
```

Hinweis: `buildEventFromImport` ist die bestehende Funktion aus dem Import-Wizard — unverändert.

- [ ] **Step 7.2: Smoke-Test**

Vorbedingung: `pending-social-events.json` enthält Einträge, Reviewer aktiv, PAT gesetzt.
- Review-Modal öffnen
- Approve auf einem Event → Toast „Committe Approve …" → ok-Toast → Event verschwindet aus Queue, taucht in Hauptliste auf
- Im DB-Dashboard: Filter „curated" → das Event ist da

- [ ] **Step 7.3: Commit**

```bash
git add public/app.js
git commit -m "feat(admin): Review-Approve schreibt nach curated-events.json

Bisher landete ein approved-Event nur in localStorage.chur_events_custom
— für niemanden außer dem Reviewer sichtbar. Jetzt: Commit nach
curated-events.json via AdminShared.appendToCurated, mit
origin='social-approve' in der commit-message. Damit ist der
Review-Workflow end-to-end persistent."
```

---

## Self-Review-Checkliste

Nach Abschluss aller 7 Tasks der Implementierende sollte:

1. **Live-Smoke-Test** auf https://keyvesdabig-sketch.github.io/VerAnstalt/?reviewer=caland-2026-x9k2
   - Inkognito ohne Param → keine Admin-Elemente sichtbar
   - Mit Param + PAT → Karten zeigen Footer, Drawer öffnet, DB-Dashboard zeigt Tabelle, Delete committet
2. **Inkognito-Test ohne Reviewer-Flag** — sicherstellen, dass Public-Besucher die App pixel-identisch zu vor der Änderung sehen
3. **ROADMAP.md updaten**: Admin-Funktionen-Block aus „Next" nach „Done", Foto-Scanner-Eintrag „Live-Publishing" als erledigt markieren
4. **TODO.md** prüfen — keine neuen Polish-Items vergessen
5. **CLAUDE.md**: Neue Files-Sektion (public/admin/, public/lib/event-state.js) ergänzen, Datenfluss-Diagramm aktualisieren

---

## Execution Handoff

Plan vollständig und committet zu `docs/superpowers/plans/2026-05-25-admin-functions.md`.

Zwei Ausführungs-Optionen:

**1. Subagent-Driven (empfohlen)** — Ich dispatche pro Task einen frischen Subagent, du reviewst zwischen den Tasks, schnellere Iteration.

**2. Inline Execution** — Ich exekutiere die Tasks in dieser Session (mit Checkpoints).

Welche?
