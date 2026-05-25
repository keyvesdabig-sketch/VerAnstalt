/**
 * Event-Dedup-Helpers für CalandaKultur.
 *
 * Identifiziert wahrscheinliche Duplikate über Pre-Filter (Datum, Gemeinde) und
 * Fuzzy-Match auf normalisiertem Titel (Dice-Koeffizient auf Bigrammen).
 *
 * Wird sowohl vom Browser (Foto-Wizard, Manual-Add, Social-Review) als auch
 * von Node-Tests verwendet. UMD-Pattern: kein Build-Step.
 *
 * Tests: `npm test` (siehe `test/event-dedup.test.js`).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.EventDedup = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  // Deutsche Füllwörter raus — verhindert false positives auf "der/die/das".
  const NOISE_WORDS = new Set([
    'der', 'die', 'das', 'den', 'dem', 'des',
    'ein', 'eine', 'einer', 'einen', 'einem',
    'und', 'oder', 'aber',
    'im', 'am', 'in', 'an', 'auf', 'bei', 'mit', 'von', 'vom', 'zu', 'zum', 'zur', 'für',
  ]);

  function normalizeTitle(s) {
    if (typeof s !== 'string') return '';
    return s
      .toLowerCase()
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .filter(w => w && !NOISE_WORDS.has(w))
      .join(' ');
  }

  /**
   * Extrahiert den Gemeindenamen aus einem Location-String.
   * Heuristik: letzter Comma-Teil, PLZ raus, lowercase.
   * Beispiele:
   *   "Postplatz, 7000 Chur"     → "chur"
   *   "Bahnhofstrasse 5, Chur"   → "chur"
   *   "Maienfeld"                → "maienfeld"
   */
  function extractTown(locationName) {
    if (typeof locationName !== 'string') return '';
    const parts = locationName.split(',').map(s => s.trim()).filter(Boolean);
    const last = parts[parts.length - 1] || locationName;
    return last
      .toLowerCase()
      .replace(/\b\d{4,5}\b/g, '') // PLZ raus
      .replace(/[^\p{L}\s]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function sameTown(a, b) {
    const ta = extractTown(a);
    const tb = extractTown(b);
    if (!ta || !tb) return false;
    return ta === tb || ta.includes(tb) || tb.includes(ta);
  }

  function dateDiffDays(a, b) {
    const da = new Date(a);
    const db = new Date(b);
    if (isNaN(da.getTime()) || isNaN(db.getTime())) return Infinity;
    return Math.abs((da.getTime() - db.getTime()) / 86400000);
  }

  /**
   * Dice-Koeffizient auf Zeichen-Bigrammen. 0..1.
   * Robust für kurze deutsche Titel, schnell zu berechnen.
   */
  function diceCoefficient(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return 0;
    if (!a || !b) return 0;
    if (a === b) return 1;
    if (a.length < 2 || b.length < 2) return 0;
    const bigramSet = (s) => {
      const set = new Set();
      for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
      return set;
    };
    const ba = bigramSet(a);
    const bb = bigramSet(b);
    let inter = 0;
    for (const g of ba) if (bb.has(g)) inter++;
    return (2 * inter) / (ba.size + bb.size);
  }

  function titleSimilarity(a, b) {
    return diceCoefficient(normalizeTitle(a), normalizeTitle(b));
  }

  /**
   * Findet potenzielle Duplikate von `candidate` im `pool`.
   *
   * @param {{title: string, date: string, locationName?: string}} candidate
   * @param {Array<object>} pool — bekannte Events
   * @param {object} [opts]
   * @param {number} [opts.threshold=0.7]         Mindest-Titel-Ähnlichkeit (Dice 0..1)
   * @param {number} [opts.dateWindowDays=1]      Maximale Tages-Differenz für Match
   * @param {boolean} [opts.requireSameTown=true] Beide Events müssen in derselben Gemeinde sein
   * @returns {Array<{event: object, score: number, reason: string}>}
   *          Sortiert nach Score absteigend.
   */
  function findPotentialDuplicates(candidate, pool, opts) {
    const threshold = opts && typeof opts.threshold === 'number' ? opts.threshold : 0.7;
    const dateWindowDays = opts && typeof opts.dateWindowDays === 'number' ? opts.dateWindowDays : 1;
    const requireSameTown = opts && typeof opts.requireSameTown === 'boolean' ? opts.requireSameTown : true;

    if (!candidate || !Array.isArray(pool)) return [];
    const matches = [];

    for (const ev of pool) {
      if (!ev || ev === candidate) continue;
      // Pre-Filter 1: Datum im Fenster
      const dDiff = dateDiffDays(candidate.date, ev.date);
      if (dDiff > dateWindowDays) continue;
      // Pre-Filter 2: gleiche Gemeinde (optional)
      if (requireSameTown && !sameTown(candidate.locationName, ev.locationName)) continue;
      // Hauptcheck: Titel-Ähnlichkeit
      const score = titleSimilarity(candidate.title, ev.title);
      if (score >= threshold) {
        const dayLabel = dDiff < 0.5 ? 'gleiches Datum' : `${Math.round(dDiff)} Tag(e) Abstand`;
        matches.push({
          event: ev,
          score: Math.round(score * 100) / 100,
          reason: `Titel ${Math.round(score * 100)}% ähnlich, ${dayLabel}, gleicher Ort`,
        });
      }
    }

    matches.sort((a, b) => b.score - a.score);
    return matches;
  }

  return {
    normalizeTitle,
    extractTown,
    sameTown,
    dateDiffDays,
    diceCoefficient,
    titleSimilarity,
    findPotentialDuplicates,
  };
});
