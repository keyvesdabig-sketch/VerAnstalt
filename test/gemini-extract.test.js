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
  cleanHtmlForExtraction,
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
