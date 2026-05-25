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
  if (document.body.dataset.reviewer !== 'true') return;

  const drawer = document.getElementById('admin-drawer');
  const backdrop = document.getElementById('admin-drawer-backdrop');
  const btnOpen = document.getElementById('btn-admin-drawer');
  const btnClose = document.getElementById('btn-admin-drawer-close');
  const btnDatabase = document.getElementById('btn-admin-database');
  const btnReviewOpen = document.getElementById('btn-admin-review-open');
  const btnSettings = document.getElementById('btn-admin-settings');
  const btnLogout = document.getElementById('btn-admin-logout');

  if (!drawer || !btnOpen) return; // Defensive

  function open() {
    refreshStats();
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
