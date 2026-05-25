const { test } = require('node:test');
const assert = require('node:assert/strict');
const { encodeBase64Utf8, buildCommitPayload } = require('../public/admin/admin-commit.js');

test('encodeBase64Utf8: ASCII + Umlaute roundtrip-safe', () => {
  const input = 'Hello — Grüße aus Chur!';
  const encoded = encodeBase64Utf8(input);
  const decoded = Buffer.from(encoded, 'base64').toString('utf8');
  assert.equal(decoded, input);
});

test('encodeBase64Utf8: leerer String', () => {
  assert.equal(encodeBase64Utf8(''), '');
});

test('buildCommitPayload: erzeugt korrekte Struktur mit sha', () => {
  const payload = buildCommitPayload({
    content: { foo: 'bar' },
    message: 'test: dummy',
    sha: 'abc123'
  });
  assert.equal(payload.message, 'test: dummy');
  assert.equal(payload.sha, 'abc123');
  const decoded = Buffer.from(payload.content, 'base64').toString('utf8');
  assert.deepEqual(JSON.parse(decoded), { foo: 'bar' });
});

test('buildCommitPayload: ohne sha (neue Datei) — sha fehlt im Output', () => {
  const payload = buildCommitPayload({
    content: { foo: 'bar' },
    message: 'init'
  });
  assert.equal('sha' in payload, false);
});

test('buildCommitPayload: pretty-printed JSON (2-space indent)', () => {
  const payload = buildCommitPayload({
    content: { a: 1, b: 2 },
    message: 'test'
  });
  const decoded = Buffer.from(payload.content, 'base64').toString('utf8');
  assert.ok(decoded.includes('\n  "a"'), 'sollte mit 2-space indent gepretty-printed sein');
});
