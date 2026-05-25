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
