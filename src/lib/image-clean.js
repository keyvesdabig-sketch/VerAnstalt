/**
 * Image-Sanitization-Helpers für den Event-Scraper.
 *
 * Einzige Quelle der Wahrheit für die Blocklist + den Guidle-Thumbnail-Upgrade.
 * Wird sowohl vom Live-Scraper (`src/scrape-events.js`) als auch vom Backfill-
 * Script (`scripts/cleanup-event-images.js`) verwendet — die hier definierten
 * Patterns und Funktionen dürfen nicht dupliziert werden.
 *
 * Tests: `npm test` (siehe `test/image-clean.test.js`).
 */

// Patterns, die UI-Chrome, Platzhalter, Tracking-Pixel oder Sprites matchen —
// alles, was offensichtlich kein echtes Event-Foto ist.
const IMAGE_BLOCKLIST_PATTERNS = [
  /localcities\.ch\/build\/images\//i,           // mask-top, rough-border, etc.
  /\/build\/images\/(mask|rough-border|placeholder|skeleton|logo|icon)\b/i,
  /chur-kultur\.ch\/.*?(logo|placeholder|sprite|icon)/i,
  /\bdata:image\/svg/i,                          // inline SVG placeholders
  /\.svg(\?|#|$)/i,                              // .svg, .svg?…, .svg#…
  /\/(favicon|apple-touch-icon|sprite|logo|placeholder)\b/i,
  /\b1x1\b|pixel\.gif/i,                         // tracking pixels
];

function isValidEventImage(url) {
  if (!url || typeof url !== 'string') return false;
  if (!/^https?:\/\//i.test(url)) return false;
  if (url.length < 20 || url.length > 1024) return false;
  return !IMAGE_BLOCKLIST_PATTERNS.some(re => re.test(url));
}

// Upgrade Guidle-ImageKit-Thumbnails (tr:n-small ≈ 80 px, tr:n-medium ≈ 400 px)
// auf eine brauchbare Grösse, indem der tr:n-{size}-Segment ersetzt wird.
function upgradeImageUrl(url) {
  if (!url || typeof url !== 'string') return url;
  return url.replace(
    /(imagekit\.io\/guidle\/)tr:n-(?:small|medium|large|tiny|thumb)\//i,
    '$1tr:w-1200,h-800,dpr-1/'
  );
}

// Einzelner Entry-Point: liefert eine gereinigte URL oder '' wenn unbrauchbar.
function sanitizeImage(url) {
  if (!isValidEventImage(url)) return '';
  return upgradeImageUrl(url);
}

// Dekodiert HTML-Entities in URLs (`&amp;`, numeric refs) — OHNE Tags zu strippen.
function decodeHtmlUrl(s) {
  if (typeof s !== 'string') return s;
  return s
    .replace(/&amp;/g, '&')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)));
}

// Extrahiert og:image / twitter:image aus HTML-Body. Liefert die rohe URL oder null.
function matchOgImage(body) {
  if (typeof body !== 'string') return null;
  const m =
    body.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
    body.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i) ||
    body.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i) ||
    body.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i);
  return m ? m[1] : null;
}

module.exports = {
  IMAGE_BLOCKLIST_PATTERNS,
  isValidEventImage,
  upgradeImageUrl,
  sanitizeImage,
  decodeHtmlUrl,
  matchOgImage,
};
