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
const crypto = require('crypto');
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

// Gemini does NOT allow combining googleSearch grounding with responseSchema/responseMimeType.
// We request JSON in the prompt itself and parse the response text (stripping markdown fences if present).
function extractJsonBlock(text) {
  if (!text) return null;
  // Strip markdown ```json ... ``` fences if present
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenceMatch ? fenceMatch[1] : text;
  // Find the first { ... } or [ ... ] block
  const firstBrace = candidate.search(/[{\[]/);
  if (firstBrace === -1) return null;
  // Take from first brace to last matching brace (greedy)
  const trimmed = candidate.slice(firstBrace).trim();
  // Try to find balanced JSON by trimming progressively from the end
  for (let end = trimmed.length; end > 0; end--) {
    try {
      return JSON.parse(trimmed.slice(0, end));
    } catch {}
  }
  return null;
}

async function scrapeMunicipality(ai, municipality) {
  const prompt = buildPrompt(municipality) + `\n\nAntworte ausschliesslich mit einem JSON-Objekt in dieser Struktur (KEIN Markdown, KEIN Kommentar, KEIN Text drum herum):\n{"events": [{"title": "...", "category": "music|stage|markets|family|sport", "description": "...", "date": "YYYY-MM-DD", "time": "HH:MM - HH:MM", "price": "...", "municipality": "${municipality}", "locationName": "...", "lat": 46.x, "lng": 9.x, "image": "", "website": "", "ticketUrl": "", "source": "Facebook|Instagram|Guidle|Other", "originalSocialLink": "https://..."}]}\n\nWenn keine echten Events gefunden: {"events": []}`;
  try {
    const response = await ai.models.generateContent({
      model: MODEL,
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }]
      }
    });
    const text = response.text;
    const parsed = extractJsonBlock(text);
    if (!parsed) {
      console.warn(`[${municipality}] Could not extract JSON from response. First 200 chars:`, (text || '').substring(0, 200));
      return [];
    }
    const rawEvents = parsed.events || [];

    // Extract citation URIs from grounding metadata — keep top 5 to limit JSON bloat
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const citations = groundingChunks
      .map(c => ({ title: c?.web?.title || c?.web?.uri, uri: c?.web?.uri }))
      .filter(c => c.uri)
      .slice(0, 5);

    return rawEvents.map((ev, i) => normalizeEvent(ev, municipality, citations, i));
  } catch (err) {
    console.error(`[${municipality}] Gemini call failed:`, err.message);
    return [];
  }
}

// Stable content-derived ID: same event across re-scrapes gets the same ID.
// Avoids the curator having to re-review unchanged events when Gemini finds them again.
function makeStableId(title, date, municipality) {
  const hash = crypto.createHash('sha256')
    .update(`${(title || '').toLowerCase().trim()}|${date}|${municipality}`)
    .digest('hex')
    .slice(0, 12);
  return `social-${hash}`;
}

function normalizeEvent(raw, defaultMunicipality, citations, idx) {
  const category = VALID_CATEGORIES.includes(raw.category) ? raw.category : 'stage';
  const municipality = raw.municipality || defaultMunicipality;
  return {
    id: makeStableId(raw.title, raw.date, municipality),
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
    // Use only the actual social/event link. Citations URIs are Vertex AI redirects that
    // expire after days/weeks — they would cause link rot in approved events.
    sourceUrl: raw.originalSocialLink || '',
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
