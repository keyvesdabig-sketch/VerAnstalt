/**
 * Scrape-Log-Formatter für CalandaKultur.
 *
 * Reine Helfer für den Scrape-Status-Viewer im Admin-Drawer. Keine
 * DOM-Abhängigkeit → unit-testbar.
 *
 * - formatRelativeTime(iso, now): menschenlesbare Relativzeit ("vor 2 h").
 * - summarizeLog(log): normalisiert data/scrape-log.json (robust gegen
 *   Altbestand ohne `sources`-Feld) in eine stabile View-Struktur.
 *
 * UMD-Pattern: läuft im Browser per <script> + in Node-Tests per require.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ScrapeLogFormat = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {

  function toMillis(value) {
    if (value == null) return NaN;
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'number') return value;
    return new Date(value).getTime();
  }

  function formatRelativeTime(iso, now) {
    const then = toMillis(iso);
    if (!Number.isFinite(then)) return '–';
    const ref = Number.isFinite(toMillis(now)) ? toMillis(now) : Date.now();
    const diffSec = Math.floor((ref - then) / 1000);
    if (diffSec < 0) return 'in der Zukunft';
    if (diffSec < 45) return 'gerade eben';

    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `vor ${diffMin} min`;

    const diffH = Math.floor(diffSec / 3600);
    if (diffH < 24) return `vor ${diffH} h`;

    const diffD = Math.floor(diffSec / 86400);
    return `vor ${diffD} ${diffD === 1 ? 'Tag' : 'Tagen'}`;
  }

  function num(value) {
    return Number.isFinite(value) ? value : 0;
  }

  function summarizeLog(log) {
    const l = (log && typeof log === 'object') ? log : {};
    const rawSources = Array.isArray(l.sources) ? l.sources : [];
    const sources = rawSources.map(function (s) {
      const src = (s && typeof s === 'object') ? s : {};
      return {
        name: src.name || 'Unbekannt',
        kind: src.kind || '',
        events: num(src.events),
        error: src.error ? String(src.error) : null
      };
    });

    return {
      timestamp: l.timestamp || null,
      totals: {
        total: num(l.eventsTotal),
        added: num(l.eventsNew),
        updated: num(l.eventsUpdated),
        enriched: num(l.eventsEnriched),
        enrichmentErrors: num(l.enrichmentErrors),
        cleaned: num(l.eventsCleaned)
      },
      sources: sources,
      hasSources: sources.length > 0,
      sourceErrorCount: sources.filter(function (s) { return s.error; }).length
    };
  }

  return { formatRelativeTime, summarizeLog };
});
