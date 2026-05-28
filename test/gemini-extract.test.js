/**
 * Unit-Tests für src/lib/gemini-extract.js.
 * Netzwerk-Aufrufe (callGemini, fetchHtml) sind hier NICHT getestet —
 * dafür gibt's Smoke-Tests im scrape-events-Lauf selbst.
 *
 * Ausführung: `npm test`
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  EVENT_SCHEMA,
  DEFAULT_MAX_HTML_CHARS,
  cleanHtmlForExtraction,
  extractEventsFromUrl,
} = require('../src/lib/gemini-extract.js');

// ---------- cleanHtmlForExtraction ----------

test('cleanHtmlForExtraction: non-string → leerer String', () => {
  assert.equal(cleanHtmlForExtraction(null), '');
  assert.equal(cleanHtmlForExtraction(undefined), '');
  assert.equal(cleanHtmlForExtraction(42), '');
});

test('cleanHtmlForExtraction: entfernt <script>', () => {
  const html = '<div>before</div><script>alert("x")</script><div>after</div>';
  const cleaned = cleanHtmlForExtraction(html);
  assert.ok(!cleaned.includes('alert'));
  assert.ok(cleaned.includes('before'));
  assert.ok(cleaned.includes('after'));
});

test('cleanHtmlForExtraction: entfernt <style>, <nav>, <footer>, <header>, <svg>, <noscript>', () => {
  const html = `
    <header>Header text</header>
    <nav>Nav text</nav>
    <style>.x { color: red; }</style>
    <noscript>Noscript text</noscript>
    <svg><path/></svg>
    <main>Main content</main>
    <footer>Footer text</footer>
  `;
  const cleaned = cleanHtmlForExtraction(html);
  for (const noise of ['Header', 'Nav', 'color', 'Noscript', 'path', 'Footer']) {
    assert.ok(!cleaned.includes(noise), `sollte "${noise}" entfernen`);
  }
  assert.ok(cleaned.includes('Main content'));
});

test('cleanHtmlForExtraction: entfernt HTML-Kommentare', () => {
  const html = '<div>visible <!-- secret comment --> still visible</div>';
  const cleaned = cleanHtmlForExtraction(html);
  assert.ok(!cleaned.includes('secret'));
});

test('cleanHtmlForExtraction: kollabiert Whitespace', () => {
  const html = '<p>Hello\n\n\n   World</p>';
  const cleaned = cleanHtmlForExtraction(html);
  assert.equal(cleaned, '<p>Hello World</p>');
});

// ---------- EVENT_SCHEMA Struktur ----------

test('EVENT_SCHEMA: hat die erwartete Form (OBJECT/ARRAY/STRING uppercase)', () => {
  assert.equal(EVENT_SCHEMA.type, 'OBJECT');
  assert.equal(EVENT_SCHEMA.properties.events.type, 'ARRAY');
  assert.equal(EVENT_SCHEMA.properties.events.items.type, 'OBJECT');
  assert.equal(EVENT_SCHEMA.properties.events.items.properties.title.type, 'STRING');
  assert.deepEqual(EVENT_SCHEMA.properties.events.items.required, ['title']);
});

// ---------- maxHtmlChars-Durchreichung ----------

// Stubt global.fetch: 1. Aufruf = fetchHtml (liefert langes HTML),
// 2. Aufruf = callGemini-POST (captured den Prompt, liefert Fake-Events).
function withFetchStub(longHtml, run) {
  const orig = global.fetch;
  let capturedPrompt = null;
  let calls = 0;
  global.fetch = async (url, opts) => {
    calls += 1;
    if (calls === 1) {
      return { ok: true, status: 200, text: async () => longHtml };
    }
    capturedPrompt = JSON.parse(opts.body).contents[0].parts[0].text;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify({ events: [{ title: 'X' }] }) }] } }]
      })
    };
  };
  return Promise.resolve(run(() => capturedPrompt)).finally(() => { global.fetch = orig; });
}

const HTML_MARKER = '--- HTML-AUSZUG DER SEITE ---\n';
function excerptLen(prompt) {
  const i = prompt.indexOf(HTML_MARKER);
  return i === -1 ? -1 : prompt.length - (i + HTML_MARKER.length);
}

test('extractEventsFromUrl: Default-Limit schneidet HTML auf DEFAULT_MAX_HTML_CHARS', async () => {
  const longHtml = 'A'.repeat(DEFAULT_MAX_HTML_CHARS + 50000);
  await withFetchStub(longHtml, async (getPrompt) => {
    await extractEventsFromUrl({ url: 'https://x.test', prompt: 'P' }, { apiKey: 'k' });
    assert.equal(excerptLen(getPrompt()), DEFAULT_MAX_HTML_CHARS);
  });
});

test('extractEventsFromUrl: source.maxHtmlChars überschreibt den Default', async () => {
  const longHtml = 'A'.repeat(200000);
  await withFetchStub(longHtml, async (getPrompt) => {
    await extractEventsFromUrl(
      { url: 'https://x.test', prompt: 'P', maxHtmlChars: 130000 },
      { apiKey: 'k' }
    );
    assert.equal(excerptLen(getPrompt()), 130000);
  });
});
