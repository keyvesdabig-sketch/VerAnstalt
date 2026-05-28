/**
 * Gemini-basierte Event-Extraktion aus HTML.
 *
 * Drop-in Ersatz für Firecrawl bei SSR-Seiten: holt das HTML via fetch,
 * säubert es (Script/Style/Nav/Footer raus), und schickt es an
 * Gemini 2.5 Flash mit response_schema für typisierte Event-Listen.
 *
 * Bewusst kein externer Headless-Browser (Puppeteer) — funktioniert
 * nur für Pages, die ihr Markup serverseitig rendern. Für JS-only
 * Seiten ist ein anderer Pfad nötig.
 *
 * Wird vom Dispatcher in src/scrape-events.js für SOURCES mit
 * kind: 'gemini' aufgerufen.
 *
 * Tests: `npm test` (siehe `test/gemini-extract.test.js`).
 */

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

/**
 * Gemini-Schema im REST-Format (UPPERCASE types). Spiegelt
 * src/event-schema.json (das im Firecrawl-Pfad genutzt wird).
 */
const EVENT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    events: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          title: { type: 'STRING', description: 'Name/Titel der Veranstaltung' },
          description: { type: 'STRING', description: 'Kurze Beschreibung oder Zusammenfassung' },
          locationName: { type: 'STRING', description: 'Name des Veranstaltungsorts (z.B. "Theater Chur", "Gemeindehaus")' },
          date: { type: 'STRING', description: 'YYYY-MM-DD' },
          time: { type: 'STRING', description: 'HH:MM oder HH:MM - HH:MM' },
          price: { type: 'STRING', description: 'z.B. "CHF 15.-" oder "Eintritt frei"' },
          image: { type: 'STRING', description: 'URL eines echten Event-Fotos. KEINE Platzhalter, Sprites oder Logos. Bei Unsicherheit leer lassen.' },
          sourceUrl: { type: 'STRING', description: 'URL zur Event-Detailseite, falls vorhanden' }
        },
        required: ['title']
      }
    }
  },
  required: ['events']
};

/**
 * Strippt alles raus, was für die Event-Extraktion irrelevant ist:
 * <script>, <style>, <noscript>, <svg>, Navigationen, Footer, Header,
 * Kommentare, exzessiver Whitespace. Reduziert das HTML auf etwa 10-20%.
 */
function cleanHtmlForExtraction(html) {
  if (typeof html !== 'string') return '';
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, '')
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, '')
    .replace(/<header\b[\s\S]*?<\/header>/gi, '')
    .replace(/<footer\b[\s\S]*?<\/footer>/gi, '')
    .replace(/<nav\b[\s\S]*?<\/nav>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 CalandaKultur-Scraper' }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} beim Fetch von ${url}`);
  return res.text();
}

const DEFAULT_MAX_HTML_CHARS = 80000;

async function callGemini({ prompt, html, apiKey, maxHtmlChars }) {
  const excerpt = (html || '').slice(0, maxHtmlChars || DEFAULT_MAX_HTML_CHARS);
  const fullPrompt =
    `${prompt}\n\n` +
    `Wenn keine echten Events erkennbar sind, gib "events": [] zurück. ` +
    `Antworte ausschliesslich mit dem JSON-Objekt gemäss Schema.\n\n` +
    `--- HTML-AUSZUG DER SEITE ---\n${excerpt}`;
  const body = {
    contents: [{ parts: [{ text: fullPrompt }] }],
    generationConfig: {
      response_mime_type: 'application/json',
      response_schema: EVENT_SCHEMA,
      // Lange Listings (Chur-Kultur ~50 Events) sprengen sonst das Default-
      // Output-Budget → abgeschnittenes JSON. Thinking aus: für strukturierte
      // Extraktion unnötig und frisst sonst aus demselben Token-Budget.
      maxOutputTokens: 65536,
      thinkingConfig: { thinkingBudget: 0 }
    }
  };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Gemini ${res.status}: ${errBody.slice(0, 400)}`);
  }
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Leere Antwort von Gemini (kein content.parts[0].text)');
  let parsed;
  try { parsed = JSON.parse(text); }
  catch (err) { throw new Error('JSON-Parse-Fehler: ' + err.message + ' — Roh: ' + text.slice(0, 200)); }
  return parsed;
}

/**
 * Hauptfunktion: extrahiert Events aus einer Source-URL via Gemini.
 *
 * @param {{name: string, url: string, prompt: string, municipality?: string}} source
 * @param {{apiKey?: string}} [opts]
 * @returns {Promise<Array<object>>} Raw-Event-Liste im gleichen Schema wie der Firecrawl-Pfad
 */
async function extractEventsFromUrl(source, opts) {
  const apiKey = (opts && opts.apiKey) || process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY fehlt — kann Gemini-Scraper nicht aufrufen.');
  const html = await fetchHtml(source.url);
  const cleaned = cleanHtmlForExtraction(html);
  const parsed = await callGemini({
    prompt: source.prompt,
    html: cleaned,
    apiKey,
    // Quellen mit langem Listing (z.B. Chur-Kultur, ~113k gereinigt) dürfen
    // den Default überschreiben, damit nicht die halbe Liste abgeschnitten wird.
    maxHtmlChars: source.maxHtmlChars
  });
  const events = Array.isArray(parsed.events) ? parsed.events : [];
  // Gemini liefert URLs gerne relativ ("/de/.../123") — gegen die Source-URL absolutisieren,
  // damit der nachgelagerte Detail-Enrich-Pfad nicht crasht.
  return events.map(ev => absolutizeUrls(ev, source.url));
}

function absolutizeUrls(ev, baseUrl) {
  const out = { ...ev };
  for (const field of ['sourceUrl', 'image', 'ticketUrl', 'organizerUrl']) {
    out[field] = absolutize(out[field], baseUrl);
  }
  return out;
}

function absolutize(url, baseUrl) {
  if (typeof url !== 'string' || !url) return url || '';
  if (/^https?:\/\//i.test(url)) return url;
  try { return new URL(url, baseUrl).toString(); }
  catch (_) { return ''; }
}

module.exports = {
  EVENT_SCHEMA,
  MODEL,
  DEFAULT_MAX_HTML_CHARS,
  cleanHtmlForExtraction,
  fetchHtml,
  callGemini,
  extractEventsFromUrl
};
