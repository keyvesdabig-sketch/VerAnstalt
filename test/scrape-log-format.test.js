const { test } = require('node:test');
const assert = require('node:assert/strict');
const { formatRelativeTime, summarizeLog } = require('../public/lib/scrape-log-format.js');

const NOW = new Date('2026-05-28T12:00:00.000Z');

test('formatRelativeTime: < 45 s → "gerade eben"', () => {
  assert.equal(formatRelativeTime('2026-05-28T11:59:30.000Z', NOW), 'gerade eben');
});

test('formatRelativeTime: Minuten', () => {
  assert.equal(formatRelativeTime('2026-05-28T11:30:00.000Z', NOW), 'vor 30 min');
});

test('formatRelativeTime: Stunden (floor)', () => {
  // 2 h 30 min → "vor 2 h"
  assert.equal(formatRelativeTime('2026-05-28T09:30:00.000Z', NOW), 'vor 2 h');
});

test('formatRelativeTime: 1 Tag (Singular)', () => {
  assert.equal(formatRelativeTime('2026-05-27T11:00:00.000Z', NOW), 'vor 1 Tag');
});

test('formatRelativeTime: mehrere Tage (Plural)', () => {
  assert.equal(formatRelativeTime('2026-05-25T12:00:00.000Z', NOW), 'vor 3 Tagen');
});

test('formatRelativeTime: ungültiger Input → "–"', () => {
  assert.equal(formatRelativeTime(null, NOW), '–');
  assert.equal(formatRelativeTime('keine-zeit', NOW), '–');
});

test('formatRelativeTime: Zukunft', () => {
  assert.equal(formatRelativeTime('2026-05-28T13:00:00.000Z', NOW), 'in der Zukunft');
});

test('summarizeLog: vollständiges Log mit Quellen', () => {
  const out = summarizeLog({
    timestamp: '2026-05-28T10:03:01.474Z',
    eventsTotal: 271,
    eventsNew: 57,
    eventsUpdated: 141,
    eventsEnriched: 63,
    enrichmentErrors: 0,
    eventsCleaned: 30,
    sources: [
      { name: 'LocalCities-Chur', kind: 'gemini', events: 40, error: null },
      { name: 'Chur-Kultur', kind: 'firecrawl', events: 0, error: 'Credits aufgebraucht' }
    ]
  });
  assert.equal(out.timestamp, '2026-05-28T10:03:01.474Z');
  assert.equal(out.totals.total, 271);
  assert.equal(out.totals.added, 57);
  assert.equal(out.totals.cleaned, 30);
  assert.equal(out.hasSources, true);
  assert.equal(out.sources.length, 2);
  assert.equal(out.sourceErrorCount, 1);
});

test('summarizeLog: Altbestand ohne sources-Feld', () => {
  const out = summarizeLog({
    timestamp: '2026-05-28T10:03:01.474Z',
    eventsTotal: 271,
    eventsNew: 57
  });
  assert.equal(out.hasSources, false);
  assert.deepEqual(out.sources, []);
  assert.equal(out.sourceErrorCount, 0);
  assert.equal(out.totals.total, 271);
  assert.equal(out.totals.updated, 0); // fehlende Felder → 0
});

test('summarizeLog: defensiv gegen null/garbage', () => {
  const out = summarizeLog(null);
  assert.equal(out.timestamp, null);
  assert.equal(out.totals.total, 0);
  assert.deepEqual(out.sources, []);
  assert.equal(out.hasSources, false);
});

test('summarizeLog: Quelle ohne Name/Werte → Defaults', () => {
  const out = summarizeLog({ sources: [{}, { events: 5 }] });
  assert.equal(out.sources[0].name, 'Unbekannt');
  assert.equal(out.sources[0].events, 0);
  assert.equal(out.sources[1].events, 5);
});
