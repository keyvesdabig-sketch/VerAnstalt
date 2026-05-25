/**
 * Unit-Tests für public/lib/event-dedup.js.
 * Ausführung: `npm test` (oder `node --test test/event-dedup.test.js`).
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeTitle,
  extractTown,
  sameTown,
  dateDiffDays,
  diceCoefficient,
  titleSimilarity,
  findPotentialDuplicates,
} = require('../public/lib/event-dedup.js');

// ---------- normalizeTitle ----------

test('normalizeTitle: leere/non-string Eingaben', () => {
  assert.equal(normalizeTitle(''), '');
  assert.equal(normalizeTitle(null), '');
  assert.equal(normalizeTitle(undefined), '');
  assert.equal(normalizeTitle(42), '');
});

test('normalizeTitle: Umlaute + Punktuation + Lower', () => {
  assert.equal(normalizeTitle('Wein-Wanderung im Bündnerland!'), 'wein wanderung buendnerland');
  assert.equal(normalizeTitle('Jazz & Brunch'), 'jazz brunch');
  assert.equal(normalizeTitle('Müllers Söhne'), 'muellers soehne');
});

test('normalizeTitle: Füllwörter raus', () => {
  assert.equal(normalizeTitle('Konzert in der Werkstatt'), 'konzert werkstatt');
  assert.equal(normalizeTitle('Live in der Werkstatt'), 'live werkstatt');
});

// ---------- extractTown / sameTown ----------

test('extractTown: PLZ + Komma-Heuristik', () => {
  assert.equal(extractTown('Postplatz, 7000 Chur'), 'chur');
  assert.equal(extractTown('Bahnhofstrasse 5, Chur'), 'chur');
  assert.equal(extractTown('Maienfeld'), 'maienfeld');
  assert.equal(extractTown('7250 Klosters Dorf'), 'klosters dorf');
  assert.equal(extractTown(''), '');
  assert.equal(extractTown(null), '');
});

test('sameTown: gleiche Gemeinde aus verschiedenen Schreibweisen', () => {
  assert.equal(sameTown('Postplatz, Chur', 'Bahnhofstrasse 5, 7000 Chur'), true);
  assert.equal(sameTown('Maienfeld', 'Klosters'), false);
  assert.equal(sameTown('', 'Chur'), false);
});

// ---------- dateDiffDays ----------

test('dateDiffDays: gleicher Tag = 0, ein Tag = 1, invalid = Infinity', () => {
  assert.equal(dateDiffDays('2026-06-15', '2026-06-15'), 0);
  assert.equal(dateDiffDays('2026-06-15', '2026-06-16'), 1);
  assert.equal(dateDiffDays('2026-06-15', '2026-06-20'), 5);
  assert.equal(dateDiffDays('not-a-date', '2026-06-15'), Infinity);
});

// ---------- diceCoefficient ----------

test('diceCoefficient: identisch = 1, völlig verschieden ~ 0', () => {
  assert.equal(diceCoefficient('abc', 'abc'), 1);
  assert.equal(diceCoefficient('', 'abc'), 0);
  assert.equal(diceCoefficient(null, 'abc'), 0);
  assert.ok(diceCoefficient('aaa', 'bbb') < 0.1);
});

test('diceCoefficient: ähnliche Strings hohen Score', () => {
  // "konzert" vs "konzerte" — fast identisch
  assert.ok(diceCoefficient('konzert', 'konzerte') > 0.8);
});

// ---------- titleSimilarity ----------

test('titleSimilarity: Variationen desselben Events finden hohen Score', () => {
  const a = 'Live in der Werkstatt';
  const b = 'Live-Konzert in der Werkstatt';
  assert.ok(titleSimilarity(a, b) > 0.7);
});

test('titleSimilarity: unterschiedliche Events finden niedrigen Score', () => {
  const a = 'Churer Wochenmarkt';
  const b = 'Mountainbike für Kids';
  assert.ok(titleSimilarity(a, b) < 0.3);
});

// ---------- findPotentialDuplicates ----------

test('findPotentialDuplicates: leerer Pool = leeres Ergebnis', () => {
  const cand = { title: 'Jazz', date: '2026-06-15', locationName: 'Chur' };
  assert.deepEqual(findPotentialDuplicates(cand, []), []);
});

test('findPotentialDuplicates: exakter Match', () => {
  const cand = { title: 'Churer Wochenmarkt', date: '2026-06-15', locationName: 'Postplatz, Chur' };
  const pool = [
    { id: 1, title: 'Churer Wochenmarkt', date: '2026-06-15', locationName: 'Postplatz, 7000 Chur' },
    { id: 2, title: 'Jazz Brunch', date: '2026-06-15', locationName: 'Chur' },
  ];
  const matches = findPotentialDuplicates(cand, pool);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].event.id, 1);
  assert.equal(matches[0].score, 1);
});

test('findPotentialDuplicates: Fuzzy-Match — Schreibvariation des Titels', () => {
  const cand = { title: 'Live in der Werkstatt', date: '2026-06-15', locationName: 'Chur' };
  const pool = [
    { id: 1, title: 'Live-Konzert in der Werkstatt', date: '2026-06-15', locationName: 'Chur' },
  ];
  const matches = findPotentialDuplicates(cand, pool);
  assert.equal(matches.length, 1);
  assert.ok(matches[0].score > 0.7);
});

test('findPotentialDuplicates: Datum zu weit weg → kein Match', () => {
  const cand = { title: 'Churer Wochenmarkt', date: '2026-06-15', locationName: 'Chur' };
  const pool = [
    { id: 1, title: 'Churer Wochenmarkt', date: '2026-06-25', locationName: 'Chur' },
  ];
  assert.deepEqual(findPotentialDuplicates(cand, pool), []);
});

test('findPotentialDuplicates: unterschiedliche Gemeinde → kein Match (default)', () => {
  const cand = { title: 'Sommerfest', date: '2026-06-15', locationName: 'Chur' };
  const pool = [
    { id: 1, title: 'Sommerfest', date: '2026-06-15', locationName: 'Maienfeld' },
  ];
  assert.deepEqual(findPotentialDuplicates(cand, pool), []);
});

test('findPotentialDuplicates: Gemeinde-Check abschaltbar', () => {
  const cand = { title: 'Sommerfest', date: '2026-06-15', locationName: 'Chur' };
  const pool = [
    { id: 1, title: 'Sommerfest', date: '2026-06-15', locationName: 'Maienfeld' },
  ];
  const matches = findPotentialDuplicates(cand, pool, { requireSameTown: false });
  assert.equal(matches.length, 1);
});

test('findPotentialDuplicates: sortiert nach Score absteigend', () => {
  const cand = { title: 'Konzert', date: '2026-06-15', locationName: 'Chur' };
  const pool = [
    { id: 1, title: 'Konzert im Park', date: '2026-06-15', locationName: 'Chur' },
    { id: 2, title: 'Konzert', date: '2026-06-15', locationName: 'Chur' },
  ];
  const matches = findPotentialDuplicates(cand, pool);
  assert.equal(matches[0].event.id, 2); // exakter Match zuerst
  assert.equal(matches[1].event.id, 1);
});

test('findPotentialDuplicates: ignoriert candidate selbst', () => {
  const ev = { id: 1, title: 'Konzert', date: '2026-06-15', locationName: 'Chur' };
  const matches = findPotentialDuplicates(ev, [ev]);
  assert.equal(matches.length, 0);
});
