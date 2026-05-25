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
