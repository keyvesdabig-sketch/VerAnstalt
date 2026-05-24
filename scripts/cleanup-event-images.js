/**
 * One-shot Backfill: bereinigt das image-Feld in scraped-events.json
 *
 * - Wirft UI-Chrome-/Platzhalter-Bilder raus (Blocklist)
 * - Upgradet Guidle-ImageKit-Thumbnails auf eine brauchbare Grösse
 * - Holt og:image von der Detail-Seite, falls noch kein gültiges Bild da ist
 *
 * Ausführung: node scripts/cleanup-event-images.js [--no-fetch]
 *
 * --no-fetch: überspringt den HTTP-Fallback (nur Blocklist + Upgrade).
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const FRONTEND_FILE = path.join(__dirname, '..', 'scraped-events.json');
const FETCH_OG_IMAGE = !process.argv.includes('--no-fetch');
const REQUEST_DELAY_MS = 400;
const MAX_REDIRECTS = 4;

const IMAGE_BLOCKLIST_PATTERNS = [
  /localcities\.ch\/build\/images\//i,
  /\/build\/images\/(mask|rough-border|placeholder|skeleton|logo|icon)\b/i,
  /chur-kultur\.ch\/.*?(logo|placeholder|sprite|icon)/i,
  /\bdata:image\/svg/i,
  /\.(svg)(\?|$)/i,
  /\/(favicon|apple-touch-icon|sprite|logo|placeholder)\b/i,
  /\b1x1\b|pixel\.gif/i,
];

function isValidEventImage(url) {
  if (!url || typeof url !== 'string') return false;
  if (!/^https?:\/\//i.test(url)) return false;
  if (url.length < 20 || url.length > 1024) return false;
  return !IMAGE_BLOCKLIST_PATTERNS.some(re => re.test(url));
}

function upgradeImageUrl(url) {
  if (!url || typeof url !== 'string') return url;
  return url.replace(
    /(imagekit\.io\/guidle\/)tr:n-(?:small|medium|large|tiny|thumb)\//i,
    '$1tr:w-1200,h-800,dpr-1/'
  );
}

function sanitizeImage(url) {
  if (!isValidEventImage(url)) return '';
  return upgradeImageUrl(url);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

function fetchOgImage(targetUrl, redirectsLeft = MAX_REDIRECTS) {
  return new Promise((resolve) => {
    const lib = targetUrl.startsWith('https') ? https : http;
    const req = lib.get(targetUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirectsLeft > 0) {
        let loc = res.headers.location;
        if (loc.startsWith('/')) loc = new URL(targetUrl).origin + loc;
        return fetchOgImage(loc, redirectsLeft - 1).then(resolve);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return resolve(null);
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', c => { body += c; if (body.length > 500_000) { res.destroy(); } });
      res.on('end', () => {
        const m =
          body.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
          body.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i) ||
          body.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i) ||
          body.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i);
        resolve(m ? m[1] : null);
      });
      res.on('error', () => resolve(null));
    });
    req.on('error', () => resolve(null));
    req.setTimeout(15000, () => { req.destroy(); resolve(null); });
  });
}

(async () => {
  const events = JSON.parse(fs.readFileSync(FRONTEND_FILE, 'utf8'));
  console.log(`📥 ${events.length} Events geladen aus ${FRONTEND_FILE}`);

  const stats = {
    total: events.length,
    blocked: 0,
    upgraded: 0,
    alreadyOk: 0,
    emptyAfterClean: 0,
    fetched: 0,
    fetchedNoOg: 0,
    fetchedBlocked: 0,
  };

  // 1) Blocklist + Upgrade in einem Pass
  for (const ev of events) {
    const before = ev.image || '';
    if (!before) continue;
    if (!isValidEventImage(before)) {
      ev.image = '';
      stats.blocked++;
      continue;
    }
    const upgraded = upgradeImageUrl(before);
    if (upgraded !== before) {
      ev.image = upgraded;
      stats.upgraded++;
    } else {
      stats.alreadyOk++;
    }
  }
  stats.emptyAfterClean = events.filter(ev => !ev.image).length;
  console.log(`🧹 Blocklist: ${stats.blocked}, Guidle-Upgrade: ${stats.upgraded}, unverändert: ${stats.alreadyOk}`);
  console.log(`📉 Events ohne Bild nach Cleanup: ${stats.emptyAfterClean}`);

  // 2) og:image-Fallback für leere Events
  if (FETCH_OG_IMAGE) {
    const needsFetch = events.filter(ev => !ev.image && (ev.sourceUrl || (ev.sources && ev.sources[0]?.url)));
    console.log(`🌐 Versuche og:image für ${needsFetch.length} Events …`);
    let i = 0;
    for (const ev of needsFetch) {
      i++;
      const url = ev.sourceUrl || ev.sources?.[0]?.url;
      process.stdout.write(`  [${i}/${needsFetch.length}] ${ev.title?.slice(0, 50) ?? ''} … `);
      const og = await fetchOgImage(url);
      if (!og) {
        console.log('— keine og:image');
        stats.fetchedNoOg++;
      } else {
        const cleaned = sanitizeImage(og);
        if (!cleaned) {
          console.log('blocked');
          stats.fetchedBlocked++;
        } else {
          ev.image = cleaned;
          console.log('✓');
          stats.fetched++;
        }
      }
      await sleep(REQUEST_DELAY_MS);
    }
  } else {
    console.log('⏭  og:image-Fallback übersprungen (--no-fetch)');
  }

  // 3) Speichern
  fs.writeFileSync(FRONTEND_FILE, JSON.stringify(events, null, 2) + '\n', 'utf8');
  console.log('💾 Geschrieben:', FRONTEND_FILE);
  console.log('📊 Stats:', JSON.stringify(stats, null, 2));
})();
