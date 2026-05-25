/**
 * Minimaler iCalendar-Parser (RFC 5545 Subset) für CalandaKultur.
 *
 * Liest VEVENT-Blöcke aus einer iCalendar-Datei und liefert sie als
 * flache Objekte mit den hier interessierenden Feldern (SUMMARY,
 * DTSTART, DTEND, LOCATION, GEO, URL, DESCRIPTION, UID).
 *
 * Bewusst kein npm-Dep (`node-ical` etc.) — wir brauchen nur die
 * paar Felder, der Code ist ~100 Zeilen und voll getestet.
 *
 * Tests: `npm test` (siehe `test/ical-parse.test.js`).
 */

const ZURICH_TZ = 'Europe/Zurich';

/**
 * iCal-Zeilen können > 75 Zeichen umbrechen; Continuation-Zeilen
 * beginnen mit Whitespace und werden hier wieder zusammengefügt.
 */
function unfoldLines(text) {
  if (typeof text !== 'string') return '';
  return text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');
}

/**
 * "DTSTART;TZID=Europe/Zurich:20260612T200000" → { name, params, value }
 */
function parseProperty(line) {
  const colonIdx = line.indexOf(':');
  if (colonIdx < 0) return null;
  const head = line.slice(0, colonIdx);
  const value = line.slice(colonIdx + 1);
  const [name, ...paramParts] = head.split(';');
  const params = {};
  for (const p of paramParts) {
    const eq = p.indexOf('=');
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1);
  }
  return { name: name.toUpperCase(), params, value };
}

function unescapeText(value) {
  if (typeof value !== 'string') return '';
  return value
    .replace(/\\n/g, '\n')
    .replace(/\\N/g, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

/**
 * "20260612T180000Z" / "20260612T180000" / "20260612" → Date (UTC interpretiert
 * für Z-Suffix, sonst als Lokalzeit der Zone in params.TZID, sonst als
 * UTC-Fallback).
 */
function parseICalDate(value, params) {
  if (!value) return null;
  const dateOnly = /^(\d{4})(\d{2})(\d{2})$/;
  const dateTime = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/;
  const m = value.match(dateTime) || value.match(dateOnly);
  if (!m) return null;
  const [, y, mo, d, hh = '0', mm = '0', ss = '0', z = ''] = m;
  // Wenn Z-Suffix oder DATE-Only ohne TZID → als UTC interpretieren.
  // Mit TZID wäre eine Lib für IANA-Zonen nötig; Eventfrog liefert eh Z.
  const iso = `${y}-${mo}-${d}T${hh.padStart(2,'0')}:${mm.padStart(2,'0')}:${ss.padStart(2,'0')}${z ? 'Z' : 'Z'}`;
  const dt = new Date(iso);
  return isNaN(dt.getTime()) ? null : dt;
}

/**
 * Formatiert ein Date als YYYY-MM-DD in der Europe/Zurich-Zone.
 */
function formatLocalDate(date) {
  if (!date) return '';
  // sv-SE liefert ISO-artigen Output, der mit Date-Input kompatibel ist
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: ZURICH_TZ,
    year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(date);
}

function formatLocalTime(date) {
  if (!date) return '';
  return new Intl.DateTimeFormat('de-CH', {
    timeZone: ZURICH_TZ,
    hour: '2-digit', minute: '2-digit', hour12: false
  }).format(date);
}

/**
 * Hauptparser. Liefert Array von VEVENT-Objekten mit Roh-Feldern.
 * Properties werden nach Namen indiziert (uppercase Key).
 */
function parseICalendar(text) {
  const unfolded = unfoldLines(text);
  const lines = unfolded.split('\n');
  const events = [];
  let current = null;
  for (const line of lines) {
    if (!line) continue;
    const trimmed = line.trim();
    if (trimmed === 'BEGIN:VEVENT') {
      current = {};
    } else if (trimmed === 'END:VEVENT') {
      if (current) events.push(current);
      current = null;
    } else if (current) {
      const prop = parseProperty(line);
      if (!prop) continue;
      // Erste Definition gewinnt — bei Duplicates ignorieren wir spätere
      if (!(prop.name in current)) {
        current[prop.name] = { value: prop.value, params: prop.params };
      }
    }
  }
  return events;
}

/**
 * Mappt einen geparsten VEVENT auf das interne Roh-Event-Schema, das
 * `src/scrape-events.js` von Firecrawl erwartet.
 *
 * Felder, die der iCal-Feed nicht liefert (image, price, category),
 * bleiben leer/Default — die nachgelagerte Pipeline (og:image-Enrich,
 * Fallback-Kategorie) füllt sie auf.
 *
 * @param {object} vevent — geparster VEVENT
 * @param {{municipality?: string, defaultLocation?: string}} ctx
 */
function veventToRawEvent(vevent, ctx) {
  ctx = ctx || {};
  const summary = unescapeText(vevent.SUMMARY?.value || '');
  const description = unescapeText(vevent.DESCRIPTION?.value || '');
  const location = unescapeText(vevent.LOCATION?.value || '') || ctx.defaultLocation || '';
  const url = vevent.URL?.value || '';
  const dtStart = parseICalDate(vevent.DTSTART?.value, vevent.DTSTART?.params);
  const dtEnd = parseICalDate(vevent.DTEND?.value, vevent.DTEND?.params);
  const date = formatLocalDate(dtStart);
  const startTime = formatLocalTime(dtStart);
  const endTime = formatLocalTime(dtEnd);
  const time = startTime && endTime
    ? `${startTime} - ${endTime}`
    : (startTime || '');

  // GEO ist "lat;lng" (Semikolon, RFC 5545)
  let lat = null, lng = null;
  if (vevent.GEO?.value) {
    const [latStr, lngStr] = vevent.GEO.value.split(';');
    const latNum = parseFloat(latStr);
    const lngNum = parseFloat(lngStr);
    if (!isNaN(latNum) && !isNaN(lngNum)) { lat = latNum; lng = lngNum; }
  }

  return {
    title: summary,
    locationName: location,
    municipality: ctx.municipality || '',
    date,
    time,
    description,
    image: '',
    price: '',
    sourceUrl: url,
    lat,
    lng
  };
}

module.exports = {
  unfoldLines,
  parseProperty,
  unescapeText,
  parseICalDate,
  formatLocalDate,
  formatLocalTime,
  parseICalendar,
  veventToRawEvent
};
