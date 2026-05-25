/**
 * GitHub Contents API Helper für CalandaKultur-Admin.
 *
 * Schreibt JSON-Dateien direkt aus dem Browser ins Repo via fine-grained PAT
 * (in localStorage.chur_events_github_pat). Verwendet sha-basiertes
 * Optimistic-Lock. Bei 409 (Konflikt) wird einmal automatisch refreshed
 * und neu probiert.
 *
 * Tests: test/admin-commit.test.js (Unit-Tests für die reinen Helper-Funktionen;
 * Network-Pfad wird per Smoke-Test im Browser geprüft).
 *
 * Reviewer-only — wird per <script defer> nur in der index.html geladen.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.AdminCommit = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {

  const REPO = 'keyvesdabig-sketch/VerAnstalt';
  const PAT_KEY = 'chur_events_github_pat';
  const API_BASE = 'https://api.github.com';

  function getPat() {
    try { return localStorage.getItem(PAT_KEY) || null; }
    catch (_) { return null; }
  }

  /**
   * UTF-8-safe Base64-Kodierung (Standard btoa wirft auf non-ASCII).
   */
  function encodeBase64Utf8(str) {
    if (typeof str !== 'string') return '';
    if (!str) return '';
    // Node hat keinen btoa, Browser-Polyfill fallback
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(str, 'utf8').toString('base64');
    }
    return btoa(unescape(encodeURIComponent(str)));
  }

  function buildCommitPayload({ content, message, sha }) {
    const payload = {
      message,
      content: encodeBase64Utf8(JSON.stringify(content, null, 2)),
    };
    if (sha) payload.sha = sha;
    return payload;
  }

  async function ghFetch(pathOrUrl, opts = {}) {
    const pat = opts.pat || getPat();
    if (!pat) throw new Error('Kein GitHub-PAT — bitte in Einstellungen eintragen.');
    const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${API_BASE}${pathOrUrl}`;
    const res = await fetch(url, {
      method: opts.method || 'GET',
      headers: {
        'Accept': 'application/vnd.github+json',
        'Authorization': `Bearer ${pat}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    if (!res.ok) {
      const errText = await res.text();
      const err = new Error(`GitHub ${res.status}: ${errText.slice(0, 300)}`);
      err.status = res.status;
      throw err;
    }
    return res.json();
  }

  /**
   * Validiert einen PAT mit einem leichtgewichtigen API-Call.
   * Liefert { ok: true, login } oder { ok: false, error }.
   */
  async function verifyPat(pat) {
    try {
      const user = await ghFetch('/user', { pat });
      return { ok: true, login: user.login };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  /**
   * Committed `content` (ein Objekt) als JSON ins Repo. Macht GET für sha,
   * PUT mit neuem Inhalt. Bei 409 Konflikt: 1× Auto-Retry mit frischem sha.
   */
  async function commitJsonFile(path, content, message) {
    let sha = null;
    try {
      const cur = await ghFetch(`/repos/${REPO}/contents/${path}`);
      sha = cur.sha;
    } catch (err) {
      if (err.status !== 404) throw err;
    }
    try {
      return await ghFetch(`/repos/${REPO}/contents/${path}`, {
        method: 'PUT',
        body: buildCommitPayload({ content, message, sha }),
      });
    } catch (err) {
      if (err.status === 409 && sha) {
        const cur = await ghFetch(`/repos/${REPO}/contents/${path}`);
        return ghFetch(`/repos/${REPO}/contents/${path}`, {
          method: 'PUT',
          body: buildCommitPayload({ content, message, sha: cur.sha }),
        });
      }
      throw err;
    }
  }

  return {
    PAT_KEY,
    getPat,
    encodeBase64Utf8,
    buildCommitPayload,
    verifyPat,
    commitJsonFile,
  };
});
