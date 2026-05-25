/**
 * Event-State-Helpers für CalandaKultur.
 *
 * mergeEventSources kombiniert die drei Datenquellen (scraped, curated,
 * suppressed) zu der finalen Event-Liste, die das Frontend rendert.
 *
 * Regeln:
 * 1. Suppressed-IDs werden überall raus gefiltert (auch in curated, für
 *    Undo-nach-Edit-Szenarien).
 * 2. Wenn curated und scraped dieselbe ID haben, gewinnt curated
 *    (= Edit-Override).
 * 3. Pure curated-Events (eigene IDs) werden zusätzlich angehängt.
 *
 * UMD-Pattern: läuft im Browser per <script> + in Node-Tests per require.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.EventState = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {

  function mergeEventSources(scraped, curated, suppressedSet) {
    const out = [];
    const supp = suppressedSet instanceof Set ? suppressedSet : new Set();
    const scrapedArr = Array.isArray(scraped) ? scraped : [];
    const curatedArr = Array.isArray(curated) ? curated : [];
    const curatedIds = new Set(curatedArr.map(e => e && e.id).filter(id => id != null));

    for (const ev of scrapedArr) {
      if (!ev || ev.id == null) continue;
      if (supp.has(ev.id)) continue;
      if (curatedIds.has(ev.id)) continue; // wird unten als curated-Version eingefügt
      out.push(ev);
    }
    for (const ev of curatedArr) {
      if (!ev || ev.id == null) continue;
      if (supp.has(ev.id)) continue;
      out.push(ev);
    }
    return out;
  }

  return { mergeEventSources };
});
