/**
 * Unit-Tests für src/lib/image-clean.js.
 * Ausführung: `npm test` (oder `node --test test/image-clean.test.js`).
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  isValidEventImage,
  upgradeImageUrl,
  sanitizeImage,
  decodeHtmlUrl,
  matchOgImage,
} = require('../src/lib/image-clean');

test('isValidEventImage: rejects empty/non-string', () => {
  assert.equal(isValidEventImage(''), false);
  assert.equal(isValidEventImage(null), false);
  assert.equal(isValidEventImage(undefined), false);
  assert.equal(isValidEventImage(42), false);
  assert.equal(isValidEventImage({}), false);
});

test('isValidEventImage: rejects non-http(s)', () => {
  assert.equal(isValidEventImage('//cdn.example.com/foo.jpg'), false);
  assert.equal(isValidEventImage('data:image/png;base64,abc'), false);
  assert.equal(isValidEventImage('javascript:alert(1)'), false);
});

test('isValidEventImage: rejects too-short and too-long URLs', () => {
  assert.equal(isValidEventImage('https://a.b/c.jpg'), false); // < 20
  const long = 'https://example.com/' + 'x'.repeat(1100) + '.jpg';
  assert.equal(isValidEventImage(long), false); // > 1024
});

test('isValidEventImage: blocks LocalCities UI chrome', () => {
  assert.equal(isValidEventImage('https://www.localcities.ch/build/images/mask/item-mask-top.bfd3d32c.png'), false);
  assert.equal(isValidEventImage('https://www.localcities.ch/build/images/rough-border/rough-border-white.94f06061.png'), false);
});

test('isValidEventImage: blocks generic placeholder / sprite / logo / favicon assets', () => {
  // Pattern erfordert /(favicon|apple-touch-icon|sprite|logo|placeholder)\b —
  // also Slash direkt vor dem Keyword + Word-Boundary danach.
  assert.equal(isValidEventImage('https://example.com/assets/favicon.ico'), false);
  assert.equal(isValidEventImage('https://example.com/static/sprite-2.png'), false);
  assert.equal(isValidEventImage('https://example.com/img/logo.png'), false);
  assert.equal(isValidEventImage('https://example.com/img/placeholder-event.jpg'), false);
  assert.equal(isValidEventImage('https://www.example.com/apple-touch-icon.png'), false);
});

test('isValidEventImage: blocks SVG variants (plain, query, fragment)', () => {
  assert.equal(isValidEventImage('https://example.com/path/icon.svg'), false);
  assert.equal(isValidEventImage('https://example.com/path/icon.svg?v=2'), false);
  assert.equal(isValidEventImage('https://example.com/path/icon.svg#frag'), false);
});

test('isValidEventImage: blocks tracking pixels', () => {
  assert.equal(isValidEventImage('https://tracker.example.com/pixel.gif'), false);
  assert.equal(isValidEventImage('https://tracker.example.com/path/1x1/beacon.png'), false);
});

test('isValidEventImage: accepts real Guidle / Unsplash / chur-kultur photo URLs', () => {
  assert.equal(isValidEventImage('https://ik.imagekit.io/guidle/tr:w-1904,h-1670,dpr-1/6/f4/05/abc_904.jpg'), true);
  assert.equal(isValidEventImage('https://ik.imagekit.io/guidle/tr:n-small/6/f4/05/abc_904.jpg'), true);
  assert.equal(isValidEventImage('https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&q=80&w=800'), true);
  assert.equal(isValidEventImage('https://www.chur-kultur.ch/uploads/events/2026/concert-romeo.jpg'), true);
});

test('upgradeImageUrl: rewrites tr:n-{size} → tr:w-1200,h-800,dpr-1', () => {
  const upgraded = upgradeImageUrl('https://ik.imagekit.io/guidle/tr:n-small/6/f4/05/abc_904.jpg');
  assert.equal(upgraded, 'https://ik.imagekit.io/guidle/tr:w-1200,h-800,dpr-1/6/f4/05/abc_904.jpg');
  assert.equal(
    upgradeImageUrl('https://ik.imagekit.io/guidle/tr:n-medium/6/f4/05/abc.jpg'),
    'https://ik.imagekit.io/guidle/tr:w-1200,h-800,dpr-1/6/f4/05/abc.jpg'
  );
  assert.equal(
    upgradeImageUrl('https://ik.imagekit.io/guidle/tr:n-large/6/f4/05/abc.jpg'),
    'https://ik.imagekit.io/guidle/tr:w-1200,h-800,dpr-1/6/f4/05/abc.jpg'
  );
});

test('upgradeImageUrl: leaves already-large Guidle URLs untouched', () => {
  const url = 'https://ik.imagekit.io/guidle/tr:w-1904,h-1670,dpr-1/6/f4/05/abc.jpg';
  assert.equal(upgradeImageUrl(url), url);
});

test('upgradeImageUrl: leaves non-Guidle URLs untouched', () => {
  const url = 'https://images.unsplash.com/photo-123?w=800';
  assert.equal(upgradeImageUrl(url), url);
});

test('upgradeImageUrl: returns input unchanged for empty/non-string', () => {
  assert.equal(upgradeImageUrl(''), '');
  assert.equal(upgradeImageUrl(null), null);
  assert.equal(upgradeImageUrl(undefined), undefined);
});

test('sanitizeImage: combines validation and upgrade in one call', () => {
  // valid + upgrade
  assert.equal(
    sanitizeImage('https://ik.imagekit.io/guidle/tr:n-small/6/f4/05/abc.jpg'),
    'https://ik.imagekit.io/guidle/tr:w-1200,h-800,dpr-1/6/f4/05/abc.jpg'
  );
  // blocked → ''
  assert.equal(sanitizeImage('https://www.localcities.ch/build/images/mask/item-mask-top.png'), '');
  // empty → ''
  assert.equal(sanitizeImage(''), '');
  assert.equal(sanitizeImage(null), '');
});

test('decodeHtmlUrl: decodes named, hex, and decimal HTML entities', () => {
  assert.equal(decodeHtmlUrl('a&amp;b'), 'a&b');
  assert.equal(decodeHtmlUrl('a&#x26;b'), 'a&b');
  assert.equal(decodeHtmlUrl('a&#38;b'), 'a&b');
  assert.equal(
    decodeHtmlUrl('https://example.com/img?a=1&amp;b=2&amp;c=3'),
    'https://example.com/img?a=1&b=2&c=3'
  );
});

test('decodeHtmlUrl: passes through non-strings unchanged', () => {
  assert.equal(decodeHtmlUrl(null), null);
  assert.equal(decodeHtmlUrl(undefined), undefined);
});

test('matchOgImage: extracts og:image (property before content)', () => {
  const html = `<meta property="og:image" content="https://cdn.example.com/photo.jpg">`;
  assert.equal(matchOgImage(html), 'https://cdn.example.com/photo.jpg');
});

test('matchOgImage: extracts og:image (content before property)', () => {
  const html = `<meta content="https://cdn.example.com/photo.jpg" property="og:image">`;
  assert.equal(matchOgImage(html), 'https://cdn.example.com/photo.jpg');
});

test('matchOgImage: falls back to twitter:image', () => {
  const html = `<meta name="twitter:image" content="https://cdn.example.com/twitter.jpg">`;
  assert.equal(matchOgImage(html), 'https://cdn.example.com/twitter.jpg');
});

test('matchOgImage: returns null when neither tag present', () => {
  assert.equal(matchOgImage('<html><body>no meta</body></html>'), null);
  assert.equal(matchOgImage(''), null);
  assert.equal(matchOgImage(null), null);
});
