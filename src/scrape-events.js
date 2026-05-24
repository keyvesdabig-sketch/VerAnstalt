/**
 * Scraper und Datenintegrator für ChurEvents
 * 
 * Dieses Skript führt die Firecrawl CLI aus, um aktuelle Events von chur-kultur.ch zu holen,
 * kategorisiert sie, ermittelt die Geokoordinaten (via Wörterbuch oder OpenStreetMap API)
 * und de-dupliziert sie mithilfe einer lokalen JSON-Datenbank.
 * 
 * Ausführung: node scrape-events.js
 */

const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// --- Konfiguration ---
const DB_FILE = path.join(__dirname, '../data/events-database.json').replace(/\\/g, '/');
const FRONTEND_FILE = path.join(__dirname, '../public/scraped-events.json').replace(/\\/g, '/');
const SCHEMA_FILE = path.join(__dirname, 'event-schema.json').replace(/\\/g, '/');

// Gemeinden im Umkreis von ca. 12 km um Chur
const MUNICIPALITIES = [
  { name: 'Chur', slug: 'chur', id: '4865', lat: 46.8508, lng: 9.5320 },
  { name: 'Domat/Ems', slug: 'domatems', id: '4883', lat: 46.8354, lng: 9.4476 },
  { name: 'Felsberg', slug: 'felsberg', id: '4885', lat: 46.8436, lng: 9.4772 },
  { name: 'Haldenstein', slug: 'haldenstein', id: '4895', lat: 46.8778, lng: 9.5303 },
  { name: 'Trimmis', slug: 'trimmis', id: '4940', lat: 46.8973, lng: 9.5636 },
  { name: 'Untervaz', slug: 'untervaz', id: '4941', lat: 46.9287, lng: 9.5369 },
  { name: 'Zizers', slug: 'zizers', id: '4943', lat: 46.9348, lng: 9.5667 },
  { name: 'Tamins', slug: 'tamins', id: '4938', lat: 46.8285, lng: 9.4069 },
  { name: 'Churwalden', slug: 'churwalden', id: '4880', lat: 46.7797, lng: 9.5348 },
  { name: 'Tschiertschen-Praden', slug: 'tschiertschenpraden', id: '4934', lat: 46.8188, lng: 9.6053 },
  { name: 'Bonaduz', slug: 'bonaduz', id: '4871', lat: 46.8124, lng: 9.3986 },
  { name: 'Rhäzüns', slug: 'rhaezuens', id: '4927', lat: 46.7978, lng: 9.4014 },
  { name: 'Malans', slug: 'malans', id: '4909', lat: 46.9803, lng: 9.5658 },
  { name: 'Landquart', slug: 'landquart', id: '4906', lat: 46.9691, lng: 9.5550 },
  { name: 'Thusis', slug: 'thusis', id: '4932', lat: 46.6972, lng: 9.4402 }
];

// Konfiguration der verschiedenen Scraping-Quellen
const SOURCES = [
  {
    name: 'Chur-Kultur',
    url: 'https://www.chur-kultur.ch/de/suche',
    municipality: 'Chur',
    prompt: "Extrahiere alle echten Veranstaltungen von der Seite. Stelle sicher, dass der Titel ('title') der tatsächliche Name des Events ist (wie 'Passenger', 'In the Grey' oder 'Frühlingsfest Chur') und NICHT das Datum wie '23' oder '24'. Der Ort ('locationName') ist der Veranstaltungsort (z.B. 'blue Cinema' oder 'Theaterplatz') und darf nicht nur ein Punkt '.' sein."
  },
  ...MUNICIPALITIES.map(m => ({
    name: `LocalCities-${m.name}`,
    url: `https://www.localcities.ch/de/veranstaltungen/${m.slug}/${m.id}`,
    municipality: m.name,
    prompt: `Extrahiere alle echten Veranstaltungen von der Seite. Stelle sicher, dass der Titel ('title') der tatsächliche Name des Events ist und NICHT das Datum oder Wochentag. Der Ort ('locationName') ist der Veranstaltungsort (z.B. 'Gemeindehaus', 'Sportplatz' oder ein anderer lokaler Ort in ${m.name}) und darf nicht leer oder ein Punkt sein.`
  }))
];

// Bekannte Veranstaltungsorte in Chur mit festen Koordinaten (schont die Nominatim API)
const VENUE_COORDINATES = {
  "theater chur": { lat: 46.8512, lng: 9.5323 },
  "theaterplatz": { lat: 46.8510, lng: 9.5323 },
  "werkstatt chur": { lat: 46.8488, lng: 9.5302 },
  "werkstatt": { lat: 46.8488, lng: 9.5302 },
  "naturmuseum graubünden": { lat: 46.8535, lng: 9.5332 },
  "naturmuseum": { lat: 46.8535, lng: 9.5332 },
  "arcasplatz": { lat: 46.8481, lng: 9.5318 },
  "arcas": { lat: 46.8481, lng: 9.5318 },
  "quaderwiese": { lat: 46.8524, lng: 9.5350 },
  "quaderwiese chur": { lat: 46.8524, lng: 9.5350 },
  "sportanlagen obere au": { lat: 46.8475, lng: 9.5085 },
  "sport- und eventanlagen chur": { lat: 46.8475, lng: 9.5085 },
  "sport- und eventanlagen": { lat: 46.8475, lng: 9.5085 },
  "obere au": { lat: 46.8475, lng: 9.5085 },
  "hallenbad": { lat: 46.8475, lng: 9.5085 },
  "postplatz": { lat: 46.8504, lng: 9.5307 },
  "martinskirche": { lat: 46.8485, lng: 9.5318 },
  "kirche masans": { lat: 46.8647, lng: 9.5448 },
  "kantonsspital graubünden": { lat: 46.8615, lng: 9.5412 },
  "kantonsspital graubünden, kreuzspital": { lat: 46.8578, lng: 9.5375 },
  "kreuzspital": { lat: 46.8578, lng: 9.5375 },
  "stadtgalerie": { lat: 46.8510, lng: 9.5320 },
  "bündner kunstmuseum": { lat: 46.8506, lng: 9.5323 },
  "rätisches museum": { lat: 46.8486, lng: 9.5328 },
  "toms beer box": { lat: 46.8492, lng: 9.5300 },
  "cuadro22": { lat: 46.8490, lng: 9.5285 },
  "polenta7000": { lat: 46.8465, lng: 9.5075 }
};

// --- Hilfsfunktionen ---

// --- Image cleanup helpers ---
// Patterns that match decorative page chrome, placeholders, tracking pixels,
// social-network share icons — anything that is clearly NOT an event photo.
const IMAGE_BLOCKLIST_PATTERNS = [
  /localcities\.ch\/build\/images\//i,           // mask-top, rough-border, etc.
  /\/build\/images\/(mask|rough-border|placeholder|skeleton|logo|icon)\b/i,
  /chur-kultur\.ch\/.*?(logo|placeholder|sprite|icon)/i,
  /\bdata:image\/svg/i,                          // inline SVG placeholders
  /\.(svg)(\?|$)/i,                              // SVG = almost certainly chrome
  /\/(favicon|apple-touch-icon|sprite|logo|placeholder)\b/i,
  /\b1x1\b|pixel\.gif/i,                         // tracking pixels
];

function isValidEventImage(url) {
  if (!url || typeof url !== 'string') return false;
  if (!/^https?:\/\//i.test(url)) return false;
  if (url.length < 20 || url.length > 1024) return false;
  return !IMAGE_BLOCKLIST_PATTERNS.some(re => re.test(url));
}

// Upgrade Guidle ImageKit thumbnails (tr:n-small ≈ 80px, tr:n-medium ≈ 400px)
// to a usable size by rewriting the tr:n-{size} segment.
function upgradeImageUrl(url) {
  if (!url || typeof url !== 'string') return url;
  // imagekit.io/guidle/tr:n-{small|medium|large|...}/...  → ../tr:w-1200,h-800,dpr-1/...
  return url.replace(
    /(imagekit\.io\/guidle\/)tr:n-(?:small|medium|large|tiny|thumb)\//i,
    '$1tr:w-1200,h-800,dpr-1/'
  );
}

// Single entry point — sanitize an image URL coming from the scraper.
// Returns a cleaned URL or '' if the input is unusable.
function sanitizeImage(url) {
  if (!isValidEventImage(url)) return '';
  return upgradeImageUrl(url);
}

// Text normalisieren für Keys
function normalizeText(text) {
  if (!text) return '';
  return text.toLowerCase()
    .replace(/[ää]/g, 'ae')
    .replace(/[öö]/g, 'oe')
    .replace(/[üü]/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]/g, '');
}

// Datum validieren und formatieren
function cleanDate(dateStr) {
  if (!dateStr) return new Date().toISOString().split('T')[0];
  // Falls das Datum bereits YYYY-MM-DD ist
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  
  try {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      return d.toISOString().split('T')[0];
    }
  } catch (e) {}
  
  return new Date().toISOString().split('T')[0];
}

// Kategorien mappen
function mapCategory(title, description, locationName) {
  const t = (title + ' ' + (description || '') + ' ' + locationName).toLowerCase();
  
  if (t.includes('markt') || t.includes('flohmarkt') || t.includes('bazar') || t.includes('messe') || t.includes('wochenmarkt')) {
    return 'markets';
  }
  if (t.includes('familie') || t.includes('kinder') || t.includes('spiel') || t.includes('kids') || t.includes('muttertag') || t.includes('conni') || t.includes('mario')) {
    return 'family';
  }
  if (t.includes('sport') || t.includes('lauf') || t.includes('rennen') || t.includes('yoga') || t.includes('fussball') || t.includes('golf') || t.includes('freibad') || t.includes('hallenbad') || t.includes('eisbahn') || t.includes('bike') || t.includes('wandern')) {
    return 'sport';
  }
  
  // Unterteilung von Musik & Party vs. Bühne & Kunst
  if (t.includes('konzert') || t.includes('musik') || t.includes('dj') || t.includes('party') || t.includes('band') || t.includes('live') || t.includes('club') || t.includes('night') || t.includes('schlager') || t.includes('sound') || t.includes('song') || t.includes('festival') || t.includes('show') || t.includes('konzerte') || t.includes('gigs')) {
    return 'music';
  }
  
  // Standard-Fallback für Kulturveranstaltungen wie Theater, Kunst, Lesungen, Ausstellungen etc.
  return 'stage';
}

// Nominatim Geocoder (OpenStreetMap) mit Promise & User-Agent
function geocodeVenue(venueName, municipalityName) {
  return new Promise((resolve) => {
    // Fallback-Koordinaten für die spezifische Gemeinde holen
    const fallbackMuni = MUNICIPALITIES.find(m => m.name === municipalityName);
    const fallbackCoords = fallbackMuni ? { lat: fallbackMuni.lat, lng: fallbackMuni.lng } : { lat: 46.8508, lng: 9.5320 };

    // 1. Im lokalen Verzeichnis nachschauen
    const venueLower = venueName.toLowerCase().trim();
    for (const key of Object.keys(VENUE_COORDINATES)) {
      if (venueLower.includes(key) || key.includes(venueLower)) {
        console.log(`📍 Geocoding (Wörterbuch): "${venueName}" -> ${VENUE_COORDINATES[key].lat}, ${VENUE_COORDINATES[key].lng}`);
        return resolve(VENUE_COORDINATES[key]);
      }
    }

    // Für Kinos der Kette blue Cinema in Chur
    if (venueLower.includes('blue cinema')) {
      console.log(`📍 Geocoding (Wörterbuch): "${venueName}" -> 46.8436, 9.5226 (blue Cinema Chur)`);
      return resolve({ lat: 46.8436, lng: 9.5226 });
    }

    // 2. Nominatim API anfragen
    const query = encodeURIComponent(`${venueName}, ${municipalityName}, Schweiz`);
    const url = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`;
    
    const options = {
      headers: {
        'User-Agent': 'ChurEventsDashboardScraper/1.0 (teech.antigravity)'
      }
    };

    https.get(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json && json.length > 0) {
            const lat = parseFloat(json[0].lat);
            const lng = parseFloat(json[0].lon);
            console.log(`🌐 Geocoding (API): "${venueName}" in "${municipalityName}" -> ${lat}, ${lng}`);
            resolve({ lat, lng });
          } else {
            console.log(`⚠️ Geocoding fehlgeschlagen (Kein Ergebnis): "${venueName}" in "${municipalityName}". Nutze Dorfzentrum.`);
            resolve(fallbackCoords); // Dorfzentrum Fallback
          }
        } catch (e) {
          console.log(`⚠️ Geocoding-Fehler beim Parsen für: "${venueName}" in "${municipalityName}". Nutze Dorfzentrum.`);
          resolve(fallbackCoords);
        }
      });
    }).on('error', (err) => {
      console.log(`⚠️ Geocoding-Netzwerkfehler für "${venueName}" in "${municipalityName}":`, err.message);
      resolve(fallbackCoords);
    });
  });
}

// Hilfsfunktion zur Erkennung der Gemeinde aus dem Event-Text (falls z.B. von Chur-Kultur)
function detectMunicipality(rawEvent, defaultMunicipality) {
  const text = `${rawEvent.locationName} ${rawEvent.title} ${rawEvent.description || ''}`.toLowerCase();
  
  for (const m of MUNICIPALITIES) {
    if (m.name === 'Chur') continue; // Finde erst die spezifischeren Orte
    
    const mNameLower = m.name.toLowerCase();
    const searchTerms = [mNameLower];
    if (m.name === 'Domat/Ems') {
      searchTerms.push('domat ems', 'ems');
    } else if (m.name === 'Churwalden') {
      searchTerms.push('malix', 'praden');
    } else if (m.name === 'Tschiertschen-Praden') {
      searchTerms.push('tschiertschen', 'praden');
    } else if (m.name === 'Bonaduz') {
      searchTerms.push('bonaduz');
    } else if (m.name === 'Rhäzüns') {
      searchTerms.push('rhäzüns', 'rhaezuens');
    } else if (m.name === 'Landquart') {
      searchTerms.push('landquart', 'igis', 'mastrils');
    }
    
    for (const term of searchTerms) {
      const regex = new RegExp(`\\b${term}\\b`, 'i');
      if (regex.test(text)) {
        return m.name;
      }
    }
  }
  return defaultMunicipality;
}

// Timeout Helper für Rate-Limiting
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Helper-Funktion zum Holen von Detailinformationen (Original-Website, Ticket-Link, vollständige Beschreibung)
async function fetchEventDetails(sourceUrl) {
  return new Promise((resolve) => {
    const lib = sourceUrl.startsWith('https') ? https : http;
    lib.get(sourceUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      // Follow redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let loc = res.headers.location;
        if (loc.startsWith('/')) loc = new URL(sourceUrl).origin + loc;
        return fetchEventDetails(loc).then(resolve);
      }
      
      if (res.statusCode !== 200) {
        return resolve(null);
      }

      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        let organizerUrl = null;
        let ticketUrl = null;
        let description = null;
        let ogImage = null;
        const html = body;

        // Hilfsfunktion zum Dekodieren von HTML Entities
        const decodeHtml = (html) => {
          return html.replace(/&uuml;/g, 'ü').replace(/&Uuml;/g, 'Ü')
                     .replace(/&auml;/g, 'ä').replace(/&Auml;/g, 'Ä')
                     .replace(/&ouml;/g, 'ö').replace(/&Ouml;/g, 'Ö')
                     .replace(/&quot;/g, '"').replace(/&#039;/g, "'")
                     .replace(/&amp;/g, '&').replace(/&szlig;/g, 'ß')
                     .replace(/<[^>]+>/g, '') // strip HTML tags
                     .trim();
        };

        // URL-Variante: dekodiert &amp;/&#x...; ohne HTML-Tags zu strippen.
        const decodeHtmlUrl = (s) => s
          .replace(/&amp;/g, '&')
          .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
          .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)));

        // og:image / twitter:image — content="..." can be on either side of the property attribute
        const ogImgMatch =
          html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
          html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i) ||
          html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i) ||
          html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i);
        if (ogImgMatch) ogImage = sanitizeImage(decodeHtmlUrl(ogImgMatch[1]));

        if (sourceUrl.includes('localcities.ch')) {
          // LocalCities Patterns
          const wsMatch = html.match(/href="([^"]+)"[^>]*data-trackid="event\.detail\.website"/i) || 
                          html.match(/data-trackid="event\.detail\.website"[^>]*href="([^"]+)"/i);
          if (wsMatch) organizerUrl = wsMatch[1];

          const tkMatch = html.match(/href="([^"]+)"[^>]*data-testid="event-ticket-buy"/i) || 
                          html.match(/data-testid="event-ticket-buy"[^>]*href="([^"]+)"/i);
          if (tkMatch) ticketUrl = tkMatch[1];

          const descMatch = html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]+)"/i) ||
                            html.match(/<meta[^>]*content="([^"]+)"[^>]*property="og:description"/i);
          if (descMatch) description = decodeHtml(descMatch[1]);
        } else {
          // Chur-Kultur (oder Fallback) Patterns
          const descMatch = html.match(/itemprop="description"[^>]*>([\s\S]*?)(?=<\/div>|<\/p>|<\/span>)/i);
          if (descMatch) {
            description = decodeHtml(descMatch[1]);
          } else {
            const ogDescMatch = html.match(/<meta[^>]*property="og:description"[^>]*content="([^"]+)"/i) ||
                                html.match(/<meta[^>]*content="([^"]+)"[^>]*property="og:description"/i);
            if (ogDescMatch) description = decodeHtml(ogDescMatch[1]);
          }

          const hrefRegex = /<a\s+[^>]*href="(https?:\/\/[^"]+)"[^>]*>/gi;
          let m;
          while ((m = hrefRegex.exec(html)) !== null) {
            const link = m[1];
            if (!link.includes('chur-kultur.ch') && !link.includes('guidle.com') && 
                !link.includes('facebook.com') && !link.includes('twitter.com') &&
                !link.includes('instagram.com') && !link.includes('google.com') &&
                !link.includes('youtube.com') && !link.includes('linkedin.com') &&
                !link.includes('localsearch.ch') && !link.includes('search.ch') &&
                !link.includes('apple.com') && !link.includes('mozilla.org') &&
                !link.includes('opera.com') && !link.includes('microsoft.com') &&
                !link.includes('unpkg.com') && !link.includes('cdnjs.') &&
                !link.includes('fonts.googleapis') && !link.includes('cookiebot') &&
                !link.includes('cloudflare') && !link.includes('jsdelivr') &&
                !link.includes('openstreetmap') && !link.includes('carto.com')) {
              
              if (link.toLowerCase().includes('ticket') || link.includes('shop.')) {
                if (!ticketUrl) ticketUrl = link;
              } else {
                if (!organizerUrl) organizerUrl = link;
              }
            }
          }
        }
        
        resolve({ organizerUrl, ticketUrl, description, ogImage });
      });
    }).on('error', err => resolve(null));
  });
}

// Helper-Funktion zum Ausführen des Scrapers für eine Quelle
function runScraperForSource(source) {
  return new Promise((resolve) => {
    console.log(`📡 Starte Firecrawl Agenten für "${source.name}"...`);
    const cmd = `firecrawl agent "${source.prompt}" --urls "${source.url}" --schema-file "${SCHEMA_FILE}" --model spark-1-pro --json --pretty --wait`;
    
    exec(cmd, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
      if (error) {
        console.error(`❌ Fehler beim Scrapen von "${source.name}": ${error.message}`);
        return resolve([]); // Fehlertoleranz: leere Liste zurückgeben
      }

      console.log(`✅ Firecrawl-Extraktion für "${source.name}" abgeschlossen. Verarbeite Daten...`);
      
      // JSON aus der Ausgabe extrahieren (falls andere Logmeldungen enthalten sind)
      const jsonStartIndex = stdout.indexOf('{');
      const jsonEndIndex = stdout.lastIndexOf('}');
      
      if (jsonStartIndex === -1 || jsonEndIndex === -1) {
        console.error(`❌ Keine valide JSON-Ausgabe im CLI-Output für "${source.name}" gefunden.`);
        return resolve([]);
      }

      try {
        const cleanJsonStr = stdout.substring(jsonStartIndex, jsonEndIndex + 1);
        const parsedResult = JSON.parse(cleanJsonStr);
        const scrapedEvents = parsedResult.events || (parsedResult.data && parsedResult.data.events);
        
        if (!scrapedEvents || !Array.isArray(scrapedEvents)) {
          console.error(`❌ Keine Events im JSON-Ergebnis für "${source.name}" gefunden.`);
          return resolve([]);
        }
        
        console.log(`🔍 ${scrapedEvents.length} Events aus "${source.name}" extrahiert.`);
        resolve(scrapedEvents);
      } catch (e) {
        console.error(`❌ Fehler beim Parsen der JSON-Ausgabe für "${source.name}":`, e.message);
        resolve([]);
      }
    });
  });
}

// --- Hauptfunktion ---
async function main() {
  console.log('🚀 Starte ChurEvents Scraper...');
  
  // 1. Bestehende Datenbank laden
  let database = {};
  if (fs.existsSync(DB_FILE)) {
    try {
      database = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      console.log(`💾 Bestehende Datenbank geladen (${Object.keys(database).length} Events).`);
    } catch (e) {
      console.error('❌ Fehler beim Lesen der events-database.json. Erstelle neue Datenbank.');
    }
  }

  const todayStr = new Date().toISOString().split('T')[0];
  let newEventsAdded = 0;
  let eventsUpdated = 0;

  // 2. Sequentielles Scraping aller Quellen
  for (const source of SOURCES) {
    const scrapedEvents = await runScraperForSource(source);
    
    // 3. De-Duplizierung & Geocoding pro Quelle
    for (const rawEvent of scrapedEvents) {
      if (!rawEvent.title || !rawEvent.locationName) continue;

      // Kinofilme komplett herausfiltern (z.B. Vorstellungen in Kinos wie blue Cinema)
      const locationLower = rawEvent.locationName.toLowerCase();
      const titleLower = rawEvent.title.toLowerCase();
      if (locationLower.includes('blue cinema') || locationLower.includes('kino') || titleLower.includes('cinema') || titleLower.includes('imax')) {
        console.log(`🎬 [${source.name}] Überspringe Kinofilm-Vorstellung: "${rawEvent.title}" an Ort "${rawEvent.locationName}"`);
        continue;
      }

      // Gottesdienste komplett herausfiltern
      if (titleLower.includes('gottesdienst') || titleLower.includes('andacht') || titleLower.includes('liturgie') || titleLower.includes('eucharistie')) {
        console.log(`⛪ [${source.name}] Überspringe Gottesdienst/Andacht: "${rawEvent.title}"`);
        continue;
      }

      // Validierung: Überspringe ungültige Daten (z.B. einstellige Zahlen als Titel oder Punkte als Ort)
      const titleClean = rawEvent.title.trim();
      const locationClean = rawEvent.locationName.trim();
      if (/^\d+$/.test(titleClean)) {
        console.log(`⚠️ [${source.name}] Überspringe Event mit ungültigem Zahlentitel: "${titleClean}"`);
        continue;
      }
      if (locationClean === '.' || locationClean === '') {
        console.log(`⚠️ [${source.name}] Überspringe Event mit ungültigem Ort: "${titleClean}"`);
        continue;
      }

      const date = cleanDate(rawEvent.date);
      const titleKey = normalizeText(rawEvent.title);
      const compositeKey = `${titleKey}_${date}`;

      // Prüfen, ob das Event bereits in der Datenbank ist
      let existingEvent = database[compositeKey];
      
      // Gemeinde erkennen
      const municipality = detectMunicipality(rawEvent, source.municipality);

      if (existingEvent) {
        // Zusammenführen / Aktualisieren
        existingEvent.description = (rawEvent.description && rawEvent.description.length > (existingEvent.description || '').length) 
          ? rawEvent.description 
          : (existingEvent.description || '');
        
        // Re-sanitize existing image (old DB rows may still hold polluted URLs).
        const cleanedExistingImage = sanitizeImage(existingEvent.image);
        if (cleanedExistingImage !== (existingEvent.image || '')) {
          existingEvent.image = cleanedExistingImage;
        }
        const cleanedRawImage = sanitizeImage(rawEvent.image);
        if (cleanedRawImage && !existingEvent.image) {
          existingEvent.image = cleanedRawImage;
        }
        if (rawEvent.price && existingEvent.price === 'Eintritt frei') {
          existingEvent.price = rawEvent.price;
        }
        existingEvent.time = rawEvent.time || existingEvent.time;
        existingEvent.municipality = existingEvent.municipality || municipality;
        
        // Quellen-Array verwalten
        if (!existingEvent.sources) {
          existingEvent.sources = [];
          if (existingEvent.sourceUrl) {
            // Versuche den Namen aus der URL abzuschätzen oder nutze "Chur-Kultur" als Fallback
            const guessedName = existingEvent.sourceUrl.includes('localcities.ch') ? 'LocalCities' : 'Chur-Kultur';
            existingEvent.sources.push({ name: guessedName, url: existingEvent.sourceUrl });
          }
        }
        
        const hasSource = existingEvent.sources.some(s => s.name === source.name);
        if (!hasSource && rawEvent.sourceUrl) {
          existingEvent.sources.push({ name: source.name, url: rawEvent.sourceUrl });
        }
        
        // Falls wir eine bessere sourceUrl erhalten
        if (!existingEvent.sourceUrl && rawEvent.sourceUrl) {
          existingEvent.sourceUrl = rawEvent.sourceUrl;
        }
        
        // Falls die Kategorie aktualisiert werden muss
        const newCategory = mapCategory(rawEvent.title, rawEvent.description, rawEvent.locationName);
        existingEvent.category = newCategory;
        existingEvent.categoryLabel = newCategory === 'music' ? 'Musik & Party' : (newCategory === 'stage' ? 'Bühne & Kunst' : (newCategory === 'markets' ? 'Märkte' : (newCategory === 'family' ? 'Familie' : 'Sport')));

        eventsUpdated++;
      } else {
        // Neues Event anlegen
        const category = mapCategory(rawEvent.title, rawEvent.description, rawEvent.locationName);
        
        // Geokoordinaten abfragen (mit Rate Limit Schutz bei API-Anfragen)
        const coords = await geocodeVenue(rawEvent.locationName, municipality);
        // Falls Nominatim angefragt wurde, warten wir 1 Sekunde zur Einhaltung der Nutzungsbedingungen
        const isFromApi = !Object.keys(VENUE_COORDINATES).some(key => rawEvent.locationName.toLowerCase().includes(key));
        if (isFromApi) {
          await sleep(1000);
        }

        database[compositeKey] = {
          id: Date.now() + Math.floor(Math.random() * 1000) + newEventsAdded, // Eindeutige ID
          title: rawEvent.title,
          category: category,
          categoryLabel: category === 'music' ? 'Musik & Party' : (category === 'stage' ? 'Bühne & Kunst' : (category === 'markets' ? 'Märkte' : (category === 'family' ? 'Familie' : 'Sport'))),
          description: rawEvent.description || 'Keine Beschreibung verfügbar.',
          date: date,
          time: rawEvent.time || 'Siehe Beschreibung',
          locationName: rawEvent.locationName,
          municipality: municipality,
          lat: coords.lat,
          lng: coords.lng,
          price: rawEvent.price || 'Eintritt frei',
          image: sanitizeImage(rawEvent.image),
          sourceUrl: rawEvent.sourceUrl || '',
          sources: rawEvent.sourceUrl ? [{ name: source.name, url: rawEvent.sourceUrl }] : []
        };

        newEventsAdded++;
      }
    }
  }

  // 4. Garbage Collection: Bereinigen abgelaufener Events
  let cleanedCount = 0;
  const finalDatabase = {};

  Object.keys(database).forEach(key => {
    const event = database[key];
    const titleLower = (event.title || '').toLowerCase();
    const isWorship = titleLower.includes('gottesdienst') || titleLower.includes('andacht') || titleLower.includes('liturgie') || titleLower.includes('eucharistie');
    
    // Wenn das Event-Datum HEUTE oder in der ZUKUNFT liegt und es kein Gottesdienst ist, behalten wir es
    if (event.date >= todayStr && !isWorship) {
      // Sicherstellen, dass das sources-Feld und municipality-Feld initialisiert sind
      if (!event.sources) {
        event.sources = [];
        if (event.sourceUrl) {
          const guessedName = event.sourceUrl.includes('localcities.ch') ? 'LocalCities' : 'Chur-Kultur';
          event.sources.push({ name: guessedName, url: event.sourceUrl });
        }
      }
      event.municipality = event.municipality || 'Chur';
      finalDatabase[key] = event;
    } else {
      cleanedCount++;
    }
  });

  console.log(`🧹 Bereinigung: ${cleanedCount} abgelaufene Events entfernt.`);
  console.log(`📈 Gesamtstatistik dieses Laufs: ${newEventsAdded} neue Events hinzugefügt, ${eventsUpdated} aktualisiert.`);
  
  // 4.5. Enrichment: Fehlende Detailinformationen nachladen
  let eventsEnriched = 0;
  let enrichmentErrors = 0;
  const finalEventKeys = Object.keys(finalDatabase);
  console.log(`🔍 Starte Detail-Enrichment (Rate-Limit 500ms)...`);
  for (const key of finalEventKeys) {
    const event = finalDatabase[key];
    const missingImage = !event.image;
    const missingMeta = !event.organizerUrl && (!event.description || event.description === 'Keine Beschreibung verfügbar.');
    const needsEnrichment = missingMeta || missingImage;
    
    if (needsEnrichment && event.sources && event.sources.length > 0) {
      // Bevorzuge LocalCities, wenn vorhanden
      let bestUrl = event.sources.find(s => s.name.startsWith('LocalCities'))?.url;
      if (!bestUrl) bestUrl = event.sources[0]?.url;
      
      if (bestUrl) {
        console.log(`  Lade Details für: "${event.title.substring(0,40)}..."`);
        const details = await fetchEventDetails(bestUrl);
        if (details) {
          if (details.organizerUrl) event.organizerUrl = details.organizerUrl;
          if (details.ticketUrl) event.ticketUrl = details.ticketUrl;
          if (details.description && details.description.length > 20) {
            event.description = details.description;
          }
          // Image fallback: if we don't have a valid event image yet, use og:image
          if (!event.image && details.ogImage) {
            event.image = details.ogImage;
          }
          eventsEnriched++;
        } else {
          enrichmentErrors++;
        }
        await sleep(500); // Rate-Limiting
      }
    }
  }
  
  // 5. Speicher Datenbank & Frontend-JSON
  const eventList = Object.values(finalDatabase);
  
  // Datenbank speichern
  fs.writeFileSync(DB_FILE, JSON.stringify(finalDatabase, null, 2), 'utf8');
  console.log(`💾 events-database.json gespeichert (${eventList.length} Events insgesamt).`);

  // Frontend-JSON speichern (sortiert nach Datum aufsteigend)
  eventList.sort((a, b) => new Date(a.date) - new Date(b.date));
  fs.writeFileSync(FRONTEND_FILE, JSON.stringify(eventList, null, 2), 'utf8');
  console.log(`🌐 scraped-events.json für das Frontend gespeichert.`);
  
  const logData = {
    timestamp: new Date().toISOString(),
    eventsTotal: eventList.length,
    eventsNew: newEventsAdded,
    eventsUpdated: eventsUpdated,
    eventsEnriched: eventsEnriched,
    enrichmentErrors: enrichmentErrors,
    eventsCleaned: cleanedCount
  };
  fs.writeFileSync(path.join(__dirname, 'scrape-log.json'), JSON.stringify(logData, null, 2), 'utf8');
  console.log(`📝 Log gespeichert: ${eventsEnriched} Events angereichert.`);

  console.log('🎉 Scraping- und Integrationsprozess erfolgreich abgeschlossen!');
}

main();
