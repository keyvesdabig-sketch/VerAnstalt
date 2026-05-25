/**
 * High-Level-Admin-Operationen: nimmt aktuellen JSON-State eines Files,
 * wendet die gewünschte Mutation an, ruft commit-Helper, gibt neuen State
 * zurück. Reviewer-only — die Callers (admin-database.js, app.js Inline-
 * Aktionen) sind eh nur in Admin-Pfaden aktiv.
 *
 * Tests: test/admin-shared.test.js
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.AdminShared = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {

  const CURATED_PATH = 'public/curated-events.json';
  const SUPPRESSED_PATH = 'public/suppressed-event-ids.json';

  function nowIso() { return new Date().toISOString(); }

  function getAdminCommit() {
    const cm = (typeof window !== 'undefined' && window.AdminCommit)
      || (typeof globalThis !== 'undefined' && globalThis.window && globalThis.window.AdminCommit);
    if (!cm) throw new Error('AdminCommit nicht geladen — admin-commit.js fehlt?');
    return cm;
  }

  function shortTitle(ev) {
    return (ev && ev.title) ? String(ev.title).slice(0, 60) : '(ohne Titel)';
  }

  async function appendToCurated(state, event, opts = {}) {
    const events = Array.isArray(state.events) ? state.events.slice() : [];
    events.push(event);
    const newState = { events, lastUpdated: nowIso() };
    if (!opts.dryRun) {
      await getAdminCommit().commitJsonFile(
        CURATED_PATH, newState,
        `curate: add "${shortTitle(event)}" (${opts.origin || 'manual'})`
      );
    }
    return newState;
  }

  async function upsertCurated(state, event, opts = {}) {
    const events = Array.isArray(state.events) ? state.events.slice() : [];
    const idx = events.findIndex(e => e && e.id === event.id);
    if (idx >= 0) events[idx] = event;
    else events.push(event);
    const newState = { events, lastUpdated: nowIso() };
    if (!opts.dryRun) {
      await getAdminCommit().commitJsonFile(
        CURATED_PATH, newState,
        `curate: edit "${shortTitle(event)}"`
      );
    }
    return newState;
  }

  async function removeFromCurated(state, id, opts = {}) {
    const events = (Array.isArray(state.events) ? state.events : []).filter(e => e && e.id !== id);
    const newState = { events, lastUpdated: nowIso() };
    if (!opts.dryRun) {
      await getAdminCommit().commitJsonFile(
        CURATED_PATH, newState,
        `curate: delete (id ${id})`
      );
    }
    return newState;
  }

  async function addSuppressed(state, id, opts = {}) {
    const ids = Array.isArray(state.ids) ? state.ids.slice() : [];
    if (!ids.includes(id)) ids.push(id);
    const newState = { ids, lastUpdated: nowIso() };
    if (!opts.dryRun) {
      await getAdminCommit().commitJsonFile(
        SUPPRESSED_PATH, newState,
        `curate: hide "${opts.title || id}"`
      );
    }
    return newState;
  }

  async function removeFromSuppressed(state, id, opts = {}) {
    const ids = (Array.isArray(state.ids) ? state.ids : []).filter(x => x !== id);
    const newState = { ids, lastUpdated: nowIso() };
    if (!opts.dryRun) {
      await getAdminCommit().commitJsonFile(
        SUPPRESSED_PATH, newState,
        `curate: restore "${opts.title || id}"`
      );
    }
    return newState;
  }

  return {
    CURATED_PATH,
    SUPPRESSED_PATH,
    appendToCurated,
    upsertCurated,
    removeFromCurated,
    addSuppressed,
    removeFromSuppressed,
  };
});
