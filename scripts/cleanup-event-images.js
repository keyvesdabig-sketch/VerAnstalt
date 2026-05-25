/**
 * Backfill: bereinigt das image-Feld in scraped-events.json (+ events-database.json).
 *
 * Idempotent — kann jederzeit erneut ausgeführt werden. Der Live-Scraper
 * (src/scrape-events.js) nutzt dieselben Helpers aus src/lib/image-clean.js,
 * dieses Script ist also primär für manuelle Re-Cleanups (z.B. nach Anpassung
 * der Blocklist oder zum Backfill alter DB-Rows ohne Re-Scrape).
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
const {
  isValidEventImage,
  upgradeImageUrl,
  sanitizeImage,
  decodeHtmlUrl,
  matchOgImage,
} = require('../src/lib/image-clean');

const FRONTEND_FILE = path.join(__dirname, '..', 'public', 'scraped-events.json');
const DB_FILE = path.join(__dirname, '..', 'data', 'events-database.json');
const FETCH_OG_IMAGE = !process.argv.includes('--no-fetch');
const REQUEST_DELAY_MS = 400;
const MAX_REDIRECTS = 4;

const sleep = ms => new Promise(r => setTimeout(r, ms));

function fetchOgImage(targetUrl, redirectsLeft = MAX_REDIRECTS) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v) => { if (!settled) { settled = true; resolve(v); } };
    const lib = targetUrl.startsWith('https') ? https : http;
    const req = lib.get(targetUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirectsLeft > 0) {
        let loc = res.headers.location;
        if (loc.startsWith('/')) loc = new URL(targetUrl).origin + loc;
        return fetchOgImage(loc, redirectsLeft - 1).then(done);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return done(null);
      }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', c => {
        body += c;
        if (body.length > 500_000) {
          // Body zu gross — abbrechen, mit bisherigem Buffer parsen.
          res.destroy();
          const m = matchOgImage(body);
          done(m ? decodeHtmlUrl(m) : null);
        }
      });
      res.on('end', () => {
        const m = matchOgImage(body);
        done(m ? decodeHtmlUrl(m) : null);
      });
      res.on('error', () => done(null));
      res.on('close', () => done(null));
    });
    req.on('error', () => done(null));
    req.setTimeout(15000, () => { req.destroy(); done(null); });
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

  // 3) Speichern — Frontend-JSON …
  fs.writeFileSync(FRONTEND_FILE, JSON.stringify(events, null, 2) + '\n', 'utf8');
  console.log('💾 Geschrieben:', FRONTEND_FILE);

  // … und Datenbank synchron updaten, sonst überschreibt der nächste Scrape den Fix.
  if (fs.existsSync(DB_FILE)) {
    const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    let dbUpdated = 0;
    const byTitleDate = new Map(
      events.map(ev => [`${(ev.title || '').toLowerCase().trim()}_${ev.date}`, ev.image || ''])
    );
    for (const [key, entry] of Object.entries(db)) {
      const lookupKey = `${(entry.title || '').toLowerCase().trim()}_${entry.date}`;
      if (byTitleDate.has(lookupKey)) {
        const newImage = byTitleDate.get(lookupKey);
        if ((entry.image || '') !== newImage) {
          entry.image = newImage;
          dbUpdated++;
        }
      }
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
    console.log(`💾 Geschrieben: ${DB_FILE} (${dbUpdated} Einträge aktualisiert)`);
  } else {
    console.log('ℹ️  events-database.json nicht gefunden — Frontend-only Update.');
  }

  console.log('📊 Stats:', JSON.stringify(stats, null, 2));
})();
