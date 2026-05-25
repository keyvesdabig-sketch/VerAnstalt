/**
 * Unit-Tests für src/lib/ical-parse.js.
 * Ausführung: `npm test` (oder `node --test test/ical-parse.test.js`).
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  unfoldLines,
  parseProperty,
  unescapeText,
  parseICalDate,
  formatLocalDate,
  formatLocalTime,
  parseICalendar,
  veventToRawEvent,
} = require('../src/lib/ical-parse.js');

// ---------- unfoldLines ----------

test('unfoldLines: continuation lines werden gemerged (Whitespace fällt weg, RFC 5545)', () => {
  const input = 'DESCRIPTION:Lorem ipsum\r\n  dolor';
  assert.equal(unfoldLines(input), 'DESCRIPTION:Lorem ipsum dolor');
});

test('unfoldLines: CRLF wird zu LF normalisiert', () => {
  assert.equal(unfoldLines('a\r\nb'), 'a\nb');
});

// ---------- parseProperty ----------

test('parseProperty: einfache Property', () => {
  const p = parseProperty('SUMMARY:Hello World');
  assert.equal(p.name, 'SUMMARY');
  assert.equal(p.value, 'Hello World');
  assert.deepEqual(p.params, {});
});

test('parseProperty: mit Parametern (TZID etc.)', () => {
  const p = parseProperty('DTSTART;TZID=Europe/Zurich;VALUE=DATE-TIME:20260612T200000');
  assert.equal(p.name, 'DTSTART');
  assert.equal(p.value, '20260612T200000');
  assert.equal(p.params.TZID, 'Europe/Zurich');
  assert.equal(p.params.VALUE, 'DATE-TIME');
});

test('parseProperty: liefert null bei fehlendem Doppelpunkt', () => {
  assert.equal(parseProperty('GARBAGE'), null);
});

// ---------- unescapeText ----------

test('unescapeText: iCal-Escapes auflösen', () => {
  assert.equal(unescapeText('Zeile 1\\nZeile 2'), 'Zeile 1\nZeile 2');
  assert.equal(unescapeText('Adresse 1\\, Chur'), 'Adresse 1, Chur');
  assert.equal(unescapeText('A\\;B'), 'A;B');
  assert.equal(unescapeText('Pfad\\\\Datei'), 'Pfad\\Datei');
});

// ---------- parseICalDate ----------

test('parseICalDate: UTC-Suffix', () => {
  const d = parseICalDate('20260612T180000Z', {});
  assert.equal(d.toISOString(), '2026-06-12T18:00:00.000Z');
});

test('parseICalDate: DATE-Only', () => {
  const d = parseICalDate('20260612', {});
  assert.ok(d instanceof Date);
});

test('parseICalDate: Garbage → null', () => {
  assert.equal(parseICalDate('xyz', {}), null);
  assert.equal(parseICalDate('', {}), null);
});

// ---------- formatLocalDate/Time ----------

test('formatLocalDate: ISO YYYY-MM-DD in Europe/Zurich', () => {
  // 22:00 UTC am 12.6. = 00:00 Local am 13.6. (CEST)
  const d = new Date('2026-06-12T22:00:00Z');
  assert.equal(formatLocalDate(d), '2026-06-13');
});

test('formatLocalTime: HH:MM in Europe/Zurich', () => {
  // 18:00 UTC im Sommer = 20:00 CEST
  const d = new Date('2026-06-12T18:00:00Z');
  assert.equal(formatLocalTime(d), '20:00');
});

// ---------- parseICalendar (End-to-End mit Fixture) ----------

const FIXTURE = `BEGIN:VCALENDAR\r
VERSION:2.0\r
PRODID:TESTFIXTURE\r
BEGIN:VEVENT\r
UID:abc@example.com\r
DTSTART:20260612T180000Z\r
DTEND:20260612T200000Z\r
SUMMARY:Tipitina (GER)\r
DESCRIPTION:Das Trio TIPITINA spielt Blues\\, Boogie Woogie\\, Ragtime\\nund Rock n Roll.\r
LOCATION:Streaminghall.ch\r
GEO:46.857110;9.507778\r
URL:https://eventfrog.ch/de/p/tipitina.html\r
END:VEVENT\r
BEGIN:VEVENT\r
UID:def@example.com\r
DTSTART:20260620T180000Z\r
SUMMARY:Nur Start, kein Ende\r
LOCATION:Streaminghall.ch\r
END:VEVENT\r
END:VCALENDAR\r
`;

test('parseICalendar: extrahiert beide VEVENTs aus Fixture', () => {
  const events = parseICalendar(FIXTURE);
  assert.equal(events.length, 2);
  assert.equal(events[0].SUMMARY.value, 'Tipitina (GER)');
  assert.equal(events[1].SUMMARY.value, 'Nur Start, kein Ende');
});

test('veventToRawEvent: kompletter VEVENT wird normalisiert', () => {
  const events = parseICalendar(FIXTURE);
  const raw = veventToRawEvent(events[0], { municipality: 'Chur' });
  assert.equal(raw.title, 'Tipitina (GER)');
  assert.equal(raw.locationName, 'Streaminghall.ch');
  assert.equal(raw.municipality, 'Chur');
  assert.equal(raw.date, '2026-06-12');
  assert.equal(raw.time, '20:00 - 22:00'); // CEST
  assert.equal(raw.description, 'Das Trio TIPITINA spielt Blues, Boogie Woogie, Ragtime\nund Rock n Roll.');
  assert.equal(raw.sourceUrl, 'https://eventfrog.ch/de/p/tipitina.html');
  assert.equal(raw.lat, 46.857110);
  assert.equal(raw.lng, 9.507778);
});

test('veventToRawEvent: VEVENT ohne DTEND → nur Startzeit', () => {
  const events = parseICalendar(FIXTURE);
  const raw = veventToRawEvent(events[1], { municipality: 'Chur' });
  assert.equal(raw.time, '20:00'); // kein " - "
});

test('veventToRawEvent: defaultLocation greift bei leerem LOCATION', () => {
  const fixtureNoLocation = `BEGIN:VCALENDAR\nBEGIN:VEVENT\nSUMMARY:X\nDTSTART:20260612T180000Z\nEND:VEVENT\nEND:VCALENDAR`;
  const events = parseICalendar(fixtureNoLocation);
  const raw = veventToRawEvent(events[0], { defaultLocation: 'Streaminghall, Chur' });
  assert.equal(raw.locationName, 'Streaminghall, Chur');
});
