# Social-Scrape & Review-Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Automated daily Gemini-based scraping of social-media events, results published to a `pending-social-events.json` file in the repo. ChurEvents dashboard shows a banner with pending count, review modal lets the kurator approve/skip/edit each event. Approved events land in the same `chur_events_custom` localStorage as the existing import feature.

**Architecture:**
- **Scraper CLI (`scrape-social.js`)**: Node script extracted from `churevents-scraper/server.ts`. One Gemini call per municipality (15 total), Google Search grounding, deduplicates against existing data, writes `pending-social-events.json`.
- **GitHub Actions Workflow**: Cron daily, runs scraper with `GEMINI_API_KEY` secret, auto-commits the JSON.
- **Frontend (Banner + Review Modal in `app.js`)**: On load, fetch the JSON, compare to localStorage-tracked "reviewed IDs", show banner if any unseen, open review modal on click.

**Tech Stack:** Node 20, `@google/genai` (already in `churevents-scraper/package.json`), vanilla JS/CSS/HTML in main app.

**Reuses from import-feature** (commits `237a86c..7c8e578`): `IMPORT_VALID_*` constants, `escapeHtml`, `buildEventFromImport`, CSS `.import-event-card` family, `chur_events_custom` localStorage key.

---

## File Inventory

| File | Action | Responsibility |
|---|---|---|
| `scrape-social.js` | Create | Node CLI: per-municipality Gemini call, dedup, write `pending-social-events.json`. |
| `package.json` | Modify | Add `npm run scrape:social`, add `@google/genai` and `dotenv` deps. |
| `.github/workflows/scrape-social.yml` | Create | Cron daily, runs `npm run scrape:social`, commits result. |
| `pending-social-events.json` | Create (placeholder) | Initial empty file so the frontend fetch doesn't 404. |
| `.gitignore` | Modify | Make sure scraper artifacts and `.env` are excluded. |
| `index.html` | Modify | Add `<div id="review-banner">` between header and filter-panel. |
| `style.css` | Modify | Banner + reuse `.import-event-card` classes. |
| `app.js` | Modify | Fetch pending, banner logic, review modal (recycles import flow). |

---

## Task 1: Scraper CLI — extract from server.ts

**Files:**
- Create: `scrape-social.js` (repo root)
- Modify: `package.json` (add deps + script)

- [ ] **Step 1: Add dependencies to root `package.json`**

Read current `package.json`. Currently:
```json
{
  "name": "veranstalt",
  "version": "1.0.0",
  "description": "Event-Dashboard für die Region Chur",
  "scripts": {
    "scrape": "node scrape-events.js",
    "dev": "npx -y http-server -p 8080"
  },
  "private": true
}
```

Replace with:
```json
{
  "name": "veranstalt",
  "version": "1.0.0",
  "description": "Event-Dashboard für die Region Chur",
  "scripts": {
    "scrape": "node scrape-events.js",
    "scrape:social": "node scrape-social.js",
    "dev": "npx -y http-server -p 8080"
  },
  "dependencies": {
    "@google/genai": "^2.4.0",
    "dotenv": "^17.2.3"
  },
  "private": true
}
```

Then run:
```bash
npm install
```

Expected: `node_modules/` is created (or extended), no errors.

- [ ] **Step 2: Create `scrape-social.js`**

Create file `C:\Users\teech\Antigravity\Veranstalt\scrape-social.js` with this exact content:

```javascript
/**
 * scrape-social.js — Daily Gemini-based social-event scraper.
 *
 * Reads GEMINI_API_KEY from env (.env or process env).
 * Iterates over all 15 municipalities, one Gemini call each with Google Search grounding.
 * Dedupes against events-database.json + previous pending-social-events.json.
 * Writes pending-social-events.json with all candidate events.
 *
 * Aborts if no real API key is set (refuses to write simulated mock data).
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config();

const { GoogleGenAI, Type } = require('@google/genai');

const MUNICIPALITIES = [
  'Chur', 'Domat/Ems', 'Felsberg', 'Haldenstein', 'Trimmis', 'Untervaz',
  'Zizers', 'Tamins', 'Churwalden', 'Tschiertschen-Praden', 'Bonaduz',
  'Rhäzüns', 'Malans', 'Landquart', 'Thusis'
];

const VALID_CATEGORIES = ['music', 'stage', 'markets', 'family', 'sport'];

const DB_FILE = path.join(__dirname, 'events-database.json');
const PENDING_FILE = path.join(__dirname, 'pending-social-events.json');
const SEARCH_KEYWORDS = 'Veranstaltungen, Konzerte, Märkte, Sport, Familie, Bühne, Festivals';

// Model name — adjust if the API rejects it
const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

const sleep = ms => new Promise(r => setTimeout(r, ms));

function loadJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    console.error(`[scrape-social] Failed to parse ${file}:`, err.message);
    return fallback;
  }
}

function dupeKey(ev) {
  return `${(ev.title || '').toLowerCase().trim()}|${ev.date}|${ev.municipality}`;
}

function buildPrompt(municipality) {
  return `
Du bist ein Experte im Extrahieren von regionalen Eventdaten aus Live-Websuchen und Social Media.
Führe eine Suche durch und extrahiere echte, bevorstehende Veranstaltungen (Konzerte, Märkte, Ausstellungen, Sportevents, Feste) in der Schweizer Gemeinde "${municipality}" (Kanton Graubünden).
Keywords: ${SEARCH_KEYWORDS}.
Aktuelles Jahr: 2026. Liefere nur Events ab heute.

Suche bevorzugt auf:
- Facebook public events
- Instagram public posts
- Lokale Veranstaltungskalender (guidle.com, ${municipality}.ch)
- Tourismus-Websites

Stelle sicher, dass:
- Titel der echte Event-Name ist (nicht das Datum oder Wochentag)
- Datum im Format YYYY-MM-DD
- Koordinaten (lat/lng) in oder ganz nahe bei "${municipality}" liegen (CH-Bereich: 46-48°N, 8-10°E)
- Kategorie EXAKT eines von: ${VALID_CATEGORIES.join(', ')}

Wenn keine plausiblen echten Events gefunden werden, gib ein leeres events-Array zurück. Halluziniere NIEMALS Events.
`.trim();
}

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    events: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          category: { type: Type.STRING },
          description: { type: Type.STRING },
          date: { type: Type.STRING },
          time: { type: Type.STRING },
          price: { type: Type.STRING },
          municipality: { type: Type.STRING },
          locationName: { type: Type.STRING },
          lat: { type: Type.NUMBER },
          lng: { type: Type.NUMBER },
          image: { type: Type.STRING },
          website: { type: Type.STRING },
          ticketUrl: { type: Type.STRING },
          source: { type: Type.STRING },
          originalSocialLink: { type: Type.STRING }
        },
        required: ['title', 'category', 'description', 'date', 'locationName', 'source']
      }
    }
  },
  required: ['events']
};

async function scrapeMunicipality(ai, municipality) {
  const prompt = buildPrompt(municipality);
  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA
      }
    });
    const text = response.text;
    let parsed;
    try {
      parsed = JSON.parse(text.trim());
    } catch (e) {
      console.warn(`[${municipality}] Invalid JSON from Gemini, skipping.`);
      return [];
    }
    const rawEvents = parsed.events || [];

    // Extract citation URIs from grounding metadata
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const citations = groundingChunks
      .map(c => ({ title: c?.web?.title || c?.web?.uri, uri: c?.web?.uri }))
      .filter(c => c.uri);

    return rawEvents.map((ev, i) => normalizeEvent(ev, municipality, citations, i));
  } catch (err) {
    console.error(`[${municipality}] Gemini call failed:`, err.message);
    return [];
  }
}

function normalizeEvent(raw, defaultMunicipality, citations, idx) {
  const category = VALID_CATEGORIES.includes(raw.category) ? raw.category : 'stage';
  return {
    id: `social-${Date.now()}-${defaultMunicipality.replace(/[^a-z]/gi, '')}-${idx}`,
    title: raw.title,
    category,
    description: raw.description || '',
    date: raw.date,
    time: raw.time || '',
    price: raw.price || 'Keine Angabe',
    municipality: raw.municipality || defaultMunicipality,
    locationName: raw.locationName,
    lat: typeof raw.lat === 'number' ? raw.lat : null,
    lng: typeof raw.lng === 'number' ? raw.lng : null,
    image: raw.image || '',
    organizerUrl: raw.website || null,
    ticketUrl: raw.ticketUrl || null,
    sourceUrl: raw.originalSocialLink || (citations[0]?.uri ?? ''),
    sourcePlatform: detectPlatform(raw.source, raw.originalSocialLink),
    citations,
    scrapedAt: new Date().toISOString()
  };
}

function detectPlatform(sourceName, link) {
  const haystack = `${sourceName || ''} ${link || ''}`.toLowerCase();
  if (haystack.includes('facebook')) return 'Facebook';
  if (haystack.includes('instagram')) return 'Instagram';
  if (haystack.includes('tiktok')) return 'TikTok';
  if (haystack.includes('guidle')) return 'Guidle';
  return 'Other';
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || apiKey.trim() === '') {
    console.error('❌ GEMINI_API_KEY not set. Refusing to write simulated data. Aborting.');
    process.exit(1);
  }

  console.log('🚀 Starting Gemini-based social-event scrape across', MUNICIPALITIES.length, 'municipalities');

  const ai = new GoogleGenAI({ apiKey });

  // Load existing data for dedup
  const dbData = loadJson(DB_FILE, {});
  const existingKeys = new Set(Object.values(dbData).map(dupeKey));

  const prevPending = loadJson(PENDING_FILE, { events: [] });
  const prevPendingKeys = new Set((prevPending.events || []).map(dupeKey));

  // Bucket existing pending events that are still in future — keep them
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const carryOver = (prevPending.events || []).filter(ev => {
    const d = new Date(ev.date + 'T00:00:00');
    return !isNaN(d) && d >= today;
  });

  const carryOverKeys = new Set(carryOver.map(dupeKey));
  const allNew = [];

  for (const municipality of MUNICIPALITIES) {
    console.log(`📡 Scraping "${municipality}"...`);
    const scraped = await scrapeMunicipality(ai, municipality);
    let added = 0;
    for (const ev of scraped) {
      const key = dupeKey(ev);
      // Skip if already in main DB, prev pending, or just added this run
      if (existingKeys.has(key) || carryOverKeys.has(key)) continue;
      // Skip past events
      const d = new Date((ev.date || '') + 'T00:00:00');
      if (isNaN(d) || d < today) continue;
      carryOverKeys.add(key);
      allNew.push(ev);
      added++;
    }
    console.log(`  → ${scraped.length} from Gemini, ${added} new after dedup`);
    // Rate-limit: 4s between calls (15 calls @ 4s = 60s total minimum, stays under 15 RPM)
    await sleep(4000);
  }

  const output = {
    lastUpdated: new Date().toISOString(),
    events: [...carryOver, ...allNew]
  };

  fs.writeFileSync(PENDING_FILE, JSON.stringify(output, null, 2), 'utf8');
  console.log(`✅ Wrote ${output.events.length} pending events (${carryOver.length} carried over, ${allNew.length} new)`);
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
```

- [ ] **Step 3: Verify syntax**

```bash
node --check scrape-social.js
```

Expected: no output (success).

- [ ] **Step 4: Commit (do NOT run the scraper yet — credentials & rate limits)**

```bash
git add package.json package-lock.json scrape-social.js
git commit -m "feat(social): scraper CLI extracted from AI-Studio app"
```

---

## Task 2: GitHub Actions Workflow

**Files:**
- Create: `.github/workflows/scrape-social.yml`

- [ ] **Step 1: Create workflow file**

Create `C:\Users\teech\Antigravity\Veranstalt\.github\workflows\scrape-social.yml`:

```yaml
name: Daily Social Event Scrape
on:
  schedule:
    - cron: '0 7 * * *'  # 07:00 UTC = 09:00 CH (1h after the Firecrawl scrape)
  workflow_dispatch: {}

permissions:
  contents: write

jobs:
  scrape:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Install dependencies
        run: npm install
      - name: Run social scraper
        run: node scrape-social.js
        env:
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
      - name: Commit pending events
        run: |
          git config user.name "GitHub Actions Bot"
          git config user.email "actions@github.com"
          git add pending-social-events.json
          git diff --staged --quiet || git commit -m "chore: daily social scrape $(date -u +%Y-%m-%d)"
          git push
```

- [ ] **Step 2: Create initial empty pending file**

Create `C:\Users\teech\Antigravity\Veranstalt\pending-social-events.json`:

```json
{
  "lastUpdated": null,
  "events": []
}
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/scrape-social.yml pending-social-events.json
git commit -m "feat(social): GitHub Actions workflow + initial pending file"
```

---

## Task 3: Frontend — Banner HTML + CSS

**Files:**
- Modify: `index.html`
- Modify: `style.css`

- [ ] **Step 1: Add banner markup**

In `index.html`, find the `<header class="app-header">` block. AFTER its closing `</header>` and BEFORE `<section class="filter-panel glass">`, insert:

```html
    <!-- Review Queue Banner -->
    <div class="review-banner hidden" id="review-banner">
      <div class="review-banner-content">
        <i data-lucide="bell" class="review-banner-icon"></i>
        <span class="review-banner-text">
          <strong id="review-banner-count">0</strong> neue Events zur Prüfung
        </span>
      </div>
      <button id="btn-review-open" class="btn btn-primary">Anzeigen</button>
    </div>
```

- [ ] **Step 2: Add the review modal markup**

In `index.html`, AFTER the closing `</div>` of `import-modal` and BEFORE `<!-- Leaflet Map Script -->`, insert:

```html
  <!-- Review Queue Modal -->
  <div class="modal-backdrop hidden" id="review-modal">
    <div class="modal-container import-modal-container glass">
      <button class="modal-close" id="review-modal-close">
        <i data-lucide="x"></i>
      </button>
      <div class="modal-header">
        <h2>Events zur Prüfung</h2>
        <p>Vom Social-Scraper gefundene Events — bitte einzeln freigeben oder ablehnen</p>
      </div>

      <div class="import-phase">
        <div class="import-summary" id="review-summary"></div>
        <div class="import-event-list" id="review-event-list"></div>
        <div class="form-actions import-review-footer">
          <span class="import-selection-count" id="review-remaining-count">0 verbleibend</span>
          <button type="button" id="btn-review-close-modal" class="btn btn-secondary">Schliessen</button>
        </div>
      </div>
    </div>
  </div>

```

- [ ] **Step 3: Append banner CSS to `style.css`**

```css
/* === Review Queue Banner === */

.review-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.75rem 1.25rem;
  margin: 0 0 1rem;
  background: linear-gradient(135deg, rgba(234, 179, 8, 0.18), rgba(249, 115, 22, 0.18));
  border: 1px solid rgba(234, 179, 8, 0.3);
  border-radius: 12px;
}

.review-banner.hidden {
  display: none;
}

.review-banner-content {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex: 1;
  min-width: 0;
}

.review-banner-icon {
  width: 20px;
  height: 20px;
  color: #fde68a;
  flex-shrink: 0;
}

.review-banner-text {
  font-size: 0.95rem;
}

.review-banner-text strong {
  color: #fde68a;
  font-size: 1.1rem;
  margin-right: 0.25rem;
}

.review-banner button {
  flex-shrink: 0;
}

@media (max-width: 600px) {
  .review-banner {
    flex-direction: column;
    align-items: stretch;
  }
  .review-banner button {
    width: 100%;
  }
}

/* Review modal reuses .import-event-card styles. Per-card action overrides: */
.review-event-action-row {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.review-event-action-row .btn-approve {
  background: rgba(34, 197, 94, 0.2);
  color: #86efac;
  border-color: rgba(34, 197, 94, 0.4);
}

.review-event-action-row .btn-skip {
  background: rgba(239, 68, 68, 0.15);
  color: #fca5a5;
  border-color: rgba(239, 68, 68, 0.3);
}
```

- [ ] **Step 4: Commit**

```bash
git add index.html style.css
git commit -m "feat(social): review banner + modal markup and styles"
```

---

## Task 4: Frontend — Fetch pending + banner logic

**Files:**
- Modify: `app.js`

- [ ] **Step 1: Add DOM refs near the existing import-modal-refs block**

Find the `const importModal = ...` block (added in earlier feature). After it, add:

```javascript
  // Review-Queue Refs
  const reviewBanner = document.getElementById('review-banner');
  const reviewBannerCount = document.getElementById('review-banner-count');
  const btnReviewOpen = document.getElementById('btn-review-open');
  const reviewModal = document.getElementById('review-modal');
  const reviewModalClose = document.getElementById('review-modal-close');
  const btnReviewCloseModal = document.getElementById('btn-review-close-modal');
  const reviewSummary = document.getElementById('review-summary');
  const reviewEventList = document.getElementById('review-event-list');
  const reviewRemainingCount = document.getElementById('review-remaining-count');

  // Review state
  let pendingSocialEvents = [];
  let reviewedIds = new Set();
  const REVIEWED_IDS_KEY = 'chur_events_reviewed_social_ids';
```

- [ ] **Step 2: Add fetch + filter helpers at the end of the IIFE**

Append AFTER all existing import-feature code:

```javascript
  // ============================================================
  // === Review Queue: Fetch & Banner                          ===
  // ============================================================

  function loadReviewedIds() {
    try {
      const stored = JSON.parse(localStorage.getItem(REVIEWED_IDS_KEY) || '[]');
      reviewedIds = new Set(Array.isArray(stored) ? stored : []);
    } catch {
      reviewedIds = new Set();
    }
  }

  function persistReviewedIds() {
    try {
      localStorage.setItem(REVIEWED_IDS_KEY, JSON.stringify(Array.from(reviewedIds)));
    } catch (err) {
      console.warn('[review] persist failed:', err.message);
    }
  }

  function getUnreviewedEvents() {
    return pendingSocialEvents.filter(ev => !reviewedIds.has(ev.id));
  }

  function updateBanner() {
    const count = getUnreviewedEvents().length;
    if (count > 0) {
      reviewBannerCount.textContent = count;
      reviewBanner.classList.remove('hidden');
    } else {
      reviewBanner.classList.add('hidden');
    }
  }

  async function fetchPendingSocialEvents() {
    try {
      const res = await fetch('pending-social-events.json', { cache: 'no-store' });
      if (!res.ok) {
        console.warn('[review] pending-social-events.json fetch failed:', res.status);
        return;
      }
      const data = await res.json();
      pendingSocialEvents = Array.isArray(data.events) ? data.events : [];
      loadReviewedIds();
      updateBanner();
    } catch (err) {
      console.warn('[review] fetch error:', err.message);
    }
  }

  // Trigger on init
  fetchPendingSocialEvents();
```

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "feat(social): fetch pending events and show review banner"
```

---

## Task 5: Frontend — Review modal logic

**Files:**
- Modify: `app.js`

- [ ] **Step 1: Add modal-render functions**

Append after the fetch helpers:

```javascript
  // --- Review Modal ---

  function renderReviewSummary() {
    const remaining = getUnreviewedEvents().length;
    const total = pendingSocialEvents.length;
    reviewSummary.innerHTML =
      `<span class="import-summary-pill ok">${remaining} ungeprüft</span>` +
      `<span class="import-summary-pill">${total - remaining} bereits bearbeitet</span>`;
    reviewRemainingCount.textContent = `${remaining} verbleibend`;
  }

  function renderReviewEventCard(ev) {
    const img = ev.image || (typeof FALLBACK_IMAGES === 'object' ? FALLBACK_IMAGES[ev.category] : '') || '';
    return `
      <div class="import-event-card" data-event-id="${escapeHtml(ev.id)}">
        <span></span>
        <img class="import-event-image" src="${escapeHtml(img)}" alt="${escapeHtml(ev.title)}"
             onerror="this.src='${escapeHtml(FALLBACK_IMAGES[ev.category] || '')}'" />
        <div class="import-event-body">
          <p class="import-event-title">${escapeHtml(ev.title)}</p>
          <div class="import-event-meta">
            <span>📅 ${escapeHtml(ev.date)}${ev.time ? ' · ' + escapeHtml(ev.time) : ''}</span>
            <span>📍 ${escapeHtml(ev.locationName)} (${escapeHtml(ev.municipality)})</span>
            <span>🏷 ${escapeHtml(getCategoryLabel(ev.category) || ev.category)}</span>
            <span>📷 ${escapeHtml(ev.sourcePlatform || 'Other')}</span>
            ${ev.sourceUrl ? `<a href="${escapeHtml(ev.sourceUrl)}" target="_blank" rel="noopener noreferrer">Quelle ansehen ↗</a>` : ''}
          </div>
          <p class="import-event-description">${escapeHtml(ev.description)}</p>
          <div class="review-event-action-row">
            <button type="button" class="btn btn-secondary btn-approve" data-action="approve">✓ Übernehmen</button>
            <button type="button" class="btn btn-secondary btn-skip" data-action="skip">✗ Ablehnen</button>
          </div>
        </div>
        <span></span>
      </div>
    `;
  }

  function renderReviewList() {
    const items = getUnreviewedEvents();
    if (items.length === 0) {
      reviewEventList.innerHTML = '<p style="text-align:center;opacity:0.7;padding:2rem;">Alle Events geprüft. 🎉</p>';
    } else {
      reviewEventList.innerHTML = items.map(renderReviewEventCard).join('');
    }
    if (window.lucide) window.lucide.createIcons();
    renderReviewSummary();
  }

  function openReviewModal() {
    renderReviewList();
    reviewModal.classList.remove('hidden');
  }

  function closeReviewModal() {
    reviewModal.classList.add('hidden');
  }

  function approveReviewEvent(eventId) {
    const ev = pendingSocialEvents.find(e => e.id === eventId);
    if (!ev) return;

    // Build internal event format (matches buildEventFromImport from import-feature)
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
    // If lat/lng missing, fall back to municipality center
    if (importLike.lat == null || importLike.lng == null) {
      const center = REGION_CENTERS[ev.municipality];
      if (center) {
        importLike.lat = center.lat;
        importLike.lng = center.lng;
      }
    }

    const newEvent = buildEventFromImport(importLike);

    // Persist to chur_events_custom
    const saved = localStorage.getItem('chur_events_custom');
    let customEvents = [];
    if (saved) {
      try { customEvents = JSON.parse(saved); } catch { customEvents = []; }
    }
    customEvents.push(newEvent);
    try {
      localStorage.setItem('chur_events_custom', JSON.stringify(customEvents));
    } catch (err) {
      alert('Speicher voll: ' + err.message);
      return;
    }

    events.unshift(newEvent);
    reviewedIds.add(eventId);
    persistReviewedIds();
    filterEvents();
    renderReviewList();
    updateBanner();
  }

  function skipReviewEvent(eventId) {
    reviewedIds.add(eventId);
    persistReviewedIds();
    renderReviewList();
    updateBanner();
  }

  // Click delegation
  reviewEventList.addEventListener('click', (e) => {
    const card = e.target.closest('.import-event-card');
    if (!card) return;
    const eventId = card.dataset.eventId;
    const action = e.target.dataset.action || e.target.closest('[data-action]')?.dataset.action;
    if (action === 'approve') approveReviewEvent(eventId);
    else if (action === 'skip') skipReviewEvent(eventId);
  });

  // Wiring
  btnReviewOpen.addEventListener('click', openReviewModal);
  reviewModalClose.addEventListener('click', closeReviewModal);
  btnReviewCloseModal.addEventListener('click', closeReviewModal);
  reviewModal.addEventListener('click', (e) => {
    if (e.target === reviewModal) closeReviewModal();
  });
```

- [ ] **Step 2: Verify**

```bash
node --check app.js
```

Expected: no output (success).

- [ ] **Step 3: Commit**

```bash
git add app.js
git commit -m "feat(social): review modal with approve/skip per event"
```

---

## Task 6: End-to-end smoke test with synthetic data

**Files:**
- Modify (temporarily): `pending-social-events.json`

- [ ] **Step 1: Inject test data into the pending file**

Overwrite `pending-social-events.json` with:

```json
{
  "lastUpdated": "2026-05-24T07:00:00Z",
  "events": [
    {
      "id": "social-test-1",
      "title": "Test-Konzert in der Werkstatt",
      "category": "music",
      "description": "Synthetisches Test-Event zum Verifizieren des Review-Flows.",
      "date": "2026-07-22",
      "time": "20:00 - 23:00",
      "price": "CHF 20.-",
      "municipality": "Chur",
      "locationName": "Werkstatt Chur",
      "lat": 46.8512,
      "lng": 9.5305,
      "image": "",
      "organizerUrl": null,
      "ticketUrl": null,
      "sourceUrl": "https://www.facebook.com/events/test",
      "sourcePlatform": "Facebook",
      "scrapedAt": "2026-05-24T07:00:00Z"
    },
    {
      "id": "social-test-2",
      "title": "Test-Markt am Samstag",
      "category": "markets",
      "description": "Zweites Test-Event für den Skip-Flow.",
      "date": "2026-07-15",
      "time": "08:00 - 13:00",
      "price": "Eintritt frei",
      "municipality": "Landquart",
      "locationName": "Bahnhofplatz Landquart",
      "lat": 46.9698,
      "lng": 9.5762,
      "image": "",
      "sourceUrl": "https://www.instagram.com/p/test",
      "sourcePlatform": "Instagram",
      "scrapedAt": "2026-05-24T07:00:00Z"
    }
  ]
}
```

- [ ] **Step 2: Manual browser test**

1. Start `npm run dev`, open `http://localhost:8080`
2. Verify banner appears: "🔔 2 neue Events zur Prüfung [Anzeigen]"
3. Click "Anzeigen" → modal opens with 2 cards
4. Click "✓ Übernehmen" on event 1 → card disappears, banner counts down to 1, event 1 appears in main grid and on map
5. Click "✗ Ablehnen" on event 2 → card disappears, banner hidden, modal shows "Alle Events geprüft. 🎉"
6. Reload page → banner stays hidden (state persisted in localStorage `chur_events_reviewed_social_ids`)
7. DevTools → Application → Local Storage: confirm both `chur_events_custom` (1 event) and `chur_events_reviewed_social_ids` (2 IDs)

If all 7 pass: proceed. If not: report issue, fix.

- [ ] **Step 3: Clean up test data + reviewed IDs**

In browser console:
```javascript
localStorage.removeItem('chur_events_custom');
localStorage.removeItem('chur_events_reviewed_social_ids');
```

Then reset `pending-social-events.json` back to empty:
```json
{
  "lastUpdated": null,
  "events": []
}
```

- [ ] **Step 4: Commit reset**

```bash
git add pending-social-events.json
git commit -m "chore: reset pending file after smoke test"
```

---

## Task 7: Set up GitHub Secret + first live run

**Files:** (none — repo config)

- [ ] **Step 1: Verify `GEMINI_API_KEY` secret exists**

```bash
gh secret list --repo keyvesdabig-sketch/VerAnstalt
```

If `GEMINI_API_KEY` is NOT in the list, user must set it:
```bash
gh secret set GEMINI_API_KEY --repo keyvesdabig-sketch/VerAnstalt --body "<key>"
```

- [ ] **Step 2: Push branch + trigger workflow manually**

```bash
git push
gh workflow run "Daily Social Event Scrape" --repo keyvesdabig-sketch/VerAnstalt
```

- [ ] **Step 3: Watch and report**

```bash
sleep 5
gh run list --repo keyvesdabig-sketch/VerAnstalt --workflow "Daily Social Event Scrape" --limit 1
```

Get the run ID, then:
```bash
gh run watch <RUN_ID> --repo keyvesdabig-sketch/VerAnstalt --exit-status
```

After completion:
- If success: `git pull` and check `pending-social-events.json` for real events
- If failure: inspect `gh run view <RUN_ID> --log-failed` and decide fix

**Common failure modes to anticipate:**
- Model name `gemini-2.5-flash` rejected → switch to a valid model via `GEMINI_MODEL` env var
- Search grounding not enabled on the API key → enable in Google AI Studio settings
- Quota exhausted → wait or upgrade tier

---

## Task 8: Manual verification + documentation

- [ ] **Step 1: Open dashboard with real pending data**

1. `git pull` to get the auto-committed `pending-social-events.json`
2. `npm run dev`, open browser
3. Banner should show actual real-scraped count
4. Open review modal, inspect events: are titles meaningful? Dates correct? Source URLs real (not search-result URLs)?

- [ ] **Step 2: If real-data quality is poor**

If sources are still hallucinated/generic (like the AI-Studio simulation), the prompt needs refinement. Document the issue in a new GitHub issue with example bad events; do NOT fix here — it's out of scope for this plan.

- [ ] **Step 3: No code commit needed unless prompt-tuning was done.**

---

## Done

After Task 8:
- ✅ Daily CI scrape runs autonomously
- ✅ Results published to repo as `pending-social-events.json`
- ✅ Dashboard banner shows pending count
- ✅ Approve/skip per event from review modal
- ✅ Approved events live in `chur_events_custom` (browser-local, kurator's device)
- ✅ Skipped events are remembered (no re-prompting)

**Out of scope (separate ticket if/when needed):**
- Publishing approved events to a public file (so all visitors see them)
- Admin auth (currently anyone with the URL can approve/skip)
- Cleanup of old `reviewed_ids` (would grow unbounded over months)
