/**
 * Admin-Drawer-UI für CalandaKultur.
 *
 * Hub für Stats + Werkzeuge + Konfiguration. Initialisiert sich nur,
 * wenn body[data-reviewer="true"].
 *
 * Liest Live-Stats aus window.appState bei jedem Drawer-Open (kein
 * Live-Update nötig).
 */
(function () {
  if (typeof window === 'undefined') return;
  // Reviewer-Check direkt aus localStorage — body[data-reviewer] wird
  // erst in app.js' DOMContentLoaded-Handler gesetzt, der nach den
  // defer-Scripts läuft (Timing-Race sonst).
  let isReviewer = false;
  try { isReviewer = localStorage.getItem('chur_events_reviewer') === '1'; } catch (_) {}
  if (!isReviewer) return;

  const drawer = document.getElementById('admin-drawer');
  const backdrop = document.getElementById('admin-drawer-backdrop');
  const btnOpen = document.getElementById('btn-admin-drawer');
  const btnClose = document.getElementById('btn-admin-drawer-close');
  const btnDatabase = document.getElementById('btn-admin-database');
  const btnReviewOpen = document.getElementById('btn-admin-review-open');
  const btnAddEvent = document.getElementById('btn-admin-add-event');
  const btnImportEvents = document.getElementById('btn-admin-import-events');
  const btnSettings = document.getElementById('btn-admin-settings');
  const btnLogout = document.getElementById('btn-admin-logout');

  if (!drawer || !btnOpen) return; // Defensive

  function open() {
    refreshStats();
    loadScrapeLog();
    drawer.classList.remove('hidden');
    backdrop.classList.remove('hidden');
    requestAnimationFrame(() => {
      drawer.classList.add('open');
      backdrop.classList.add('visible');
    });
    drawer.setAttribute('aria-hidden', 'false');
  }
  function close() {
    drawer.classList.remove('open');
    backdrop.classList.remove('visible');
    setTimeout(() => {
      drawer.classList.add('hidden');
      backdrop.classList.add('hidden');
    }, 240);
    drawer.setAttribute('aria-hidden', 'true');
  }

  function refreshStats() {
    const s = window.appState || {};
    const eventsCount = Array.isArray(s.events) ? s.events.length : 0;
    const curatedCount = (s.curatedState && s.curatedState.events) ? s.curatedState.events.length : 0;
    const suppressedCount = s.suppressedIdSet ? s.suppressedIdSet.size : 0;
    const pendingCount = (Array.isArray(s.pendingSocialEvents) && s.reviewedIds)
      ? s.pendingSocialEvents.filter(e => !s.reviewedIds.has(e.id)).length
      : 0;
    document.getElementById('admin-stat-events').textContent = `${eventsCount} Events angezeigt`;
    document.getElementById('admin-stat-curated').textContent = `${curatedCount} Curated`;
    document.getElementById('admin-stat-suppressed').textContent = `${suppressedCount} Suppressed`;
    document.getElementById('admin-stat-pending').textContent = `${pendingCount} Review-Queue ungelesen`;
  }

  // --- Scrape-Status (read-only) ---------------------------------------
  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderScrapeLog(log) {
    const host = document.getElementById('admin-scrape-log');
    if (!host) return;
    const fmt = window.ScrapeLogFormat;
    if (!fmt) { host.innerHTML = '<p class="admin-scrape-log-error">Formatter nicht geladen.</p>'; return; }

    const s = fmt.summarizeLog(log);
    const rel = fmt.formatRelativeTime(s.timestamp);
    const abs = s.timestamp ? new Date(s.timestamp).toLocaleString('de-CH') : '–';
    const t = s.totals;

    let html = '';
    html += `<div class="admin-scrape-log-run" title="${esc(abs)}">`
      + `<strong>Letzter Run:</strong> ${esc(rel)}</div>`;
    html += `<div class="admin-scrape-log-totals">`
      + `${t.total} gesamt · ${t.added} neu · ${t.updated} aktualisiert`
      + ` · ${t.enriched} angereichert · ${t.cleaned} bereinigt</div>`;

    if (s.hasSources) {
      html += '<ul class="admin-scrape-log-sources">';
      for (const src of s.sources) {
        const cls = src.error ? 'admin-scrape-log-src has-error' : 'admin-scrape-log-src';
        const right = src.error
          ? `<span class="admin-scrape-log-err" title="${esc(src.error)}">🔴 ${esc(src.error)}</span>`
          : `<span class="admin-scrape-log-num">${src.events}</span>`;
        html += `<li class="${cls}"><span class="admin-scrape-log-name">${esc(src.name)}</span>${right}</li>`;
      }
      html += '</ul>';
      if (s.sourceErrorCount > 0) {
        html += `<div class="admin-scrape-log-error">${s.sourceErrorCount} Quelle(n) mit Fehler</div>`;
      }
    } else {
      html += '<p class="admin-scrape-log-hint">Quellen-Aufschlüsselung erscheint nach dem nächsten Scrape-Lauf.</p>';
    }
    host.innerHTML = html;
  }

  function loadScrapeLog() {
    const host = document.getElementById('admin-scrape-log');
    if (!host) return;
    host.innerHTML = '<p class="admin-scrape-log-loading">Lade Scrape-Log …</p>';
    fetch('scrape-log.json?t=' + Date.now())
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(renderScrapeLog)
      .catch(function (err) {
        host.innerHTML = '<p class="admin-scrape-log-error">Scrape-Log nicht ladbar: '
          + esc(err.message) + '</p>';
      });
  }

  btnOpen.addEventListener('click', open);
  btnClose.addEventListener('click', close);
  backdrop.addEventListener('click', close);

  btnDatabase.addEventListener('click', () => {
    close();
    if (window.AdminDatabase && typeof window.AdminDatabase.open === 'function') {
      window.AdminDatabase.open();
    } else {
      alert('Datenbank-Dashboard kommt im nächsten Schritt (Task 5).');
    }
  });
  btnReviewOpen.addEventListener('click', () => {
    close();
    const btn = document.getElementById('btn-review-open');
    if (btn) btn.click();
  });
  btnAddEvent.addEventListener('click', () => {
    close();
    document.getElementById('btn-add-event').click();
  });
  btnImportEvents.addEventListener('click', () => {
    close();
    document.getElementById('btn-import-events').click();
  });
  btnSettings.addEventListener('click', () => {
    close();
    document.getElementById('btn-settings').click();
  });
  btnLogout.addEventListener('click', () => {
    window.location.href = '?reviewer=logout';
  });

  // Lucide-Icons neu rendern (für das shield-Icon im Sidebar-Button)
  if (window.lucide && typeof window.lucide.createIcons === 'function') {
    window.lucide.createIcons();
  }
})();
