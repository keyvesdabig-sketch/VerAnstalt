/**
 * Datenbank-Dashboard für Admin-CRUD.
 *
 * Liest events/curatedState/suppressedState via window.appState, rendert
 * sie als Tabelle mit Filter/Sort/Bulk-Operations. Jede Aktion ruft
 * admin-shared.js → admin-commit.js. Initialisiert sich nur bei
 * body[data-reviewer="true"].
 */
(function () {
  if (typeof window === 'undefined') return;
  // Reviewer-Check direkt aus localStorage (siehe admin-drawer.js für Begründung)
  let isReviewer = false;
  try { isReviewer = localStorage.getItem('chur_events_reviewer') === '1'; } catch (_) {}
  if (!isReviewer) return;

  const modal = document.getElementById('admin-db-modal');
  const closeBtn = document.getElementById('admin-db-modal-close');
  const filterSource = document.getElementById('admin-db-filter-source');
  const filterMuni = document.getElementById('admin-db-filter-municipality');
  const filterSearch = document.getElementById('admin-db-filter-search');
  const sortSel = document.getElementById('admin-db-sort');
  const countLabel = document.getElementById('admin-db-count');
  const tbody = document.getElementById('admin-db-tbody');
  const checkAll = document.getElementById('admin-db-check-all');
  const bulkbar = document.getElementById('admin-db-bulkbar');
  const bulkCount = document.getElementById('admin-db-selected-count');
  const btnBulkDelete = document.getElementById('admin-db-bulk-delete');
  const btnBulkClear = document.getElementById('admin-db-bulk-clear');

  if (!modal) return; // Defensive

  let selectedIds = new Set();

  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;' }[c]));
  }

  function open() {
    populateMunicipalityFilter();
    selectedIds.clear();
    if (checkAll) checkAll.checked = false;
    render();
    modal.classList.remove('hidden');
  }
  function close() { modal.classList.add('hidden'); }

  function populateMunicipalityFilter() {
    const events = (window.appState && window.appState.events) || [];
    const munis = new Set();
    events.forEach(e => { if (e && e.municipality) munis.add(e.municipality); });
    filterMuni.innerHTML = '<option value="all">Alle</option>'
      + Array.from(munis).sort().map(m => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join('');
  }

  function getSourceLabel(ev) {
    if (ev.sources && ev.sources.length) return ev.sources[0].name || 'Unbekannt';
    if (ev.sourcePlatform) return ev.sourcePlatform;
    return 'Unbekannt';
  }

  function getStatus(ev) {
    const curatedEvents = (window.appState.curatedState && window.appState.curatedState.events) || [];
    const inCurated = curatedEvents.some(c => c.id === ev.id);
    if (inCurated && !window.appState.suppressedIdSet.has(ev.id)) {
      const isEditOverride = ev.sources && ev.sources.length;
      return isEditOverride ? { label: '✏ ediert', cls: 'edited' } : { label: '🆕 curated', cls: 'curated' };
    }
    return { label: '', cls: '' };
  }

  function getFilteredRows() {
    const s = window.appState || {};
    const events = s.events || [];
    const curatedEvents = (s.curatedState && s.curatedState.events) || [];
    const source = filterSource.value;
    const muni = filterMuni.value;
    const q = filterSearch.value.trim().toLowerCase();
    const sort = sortSel.value;

    let rows;
    if (source === 'suppressed') {
      rows = Array.from(s.suppressedIdSet || []).map(id => {
        const all = (window.AdminDatabase.rawScraped || []).concat(curatedEvents);
        const ev = all.find(e => e && e.id === id) || { id, title: `(ID ${id})`, date: '', locationName: '', municipality: '' };
        return ev;
      });
    } else if (source === 'curated') {
      rows = curatedEvents.slice();
    } else if (source === 'scraped') {
      const curatedIds = new Set(curatedEvents.map(e => e.id));
      rows = (window.AdminDatabase.rawScraped || []).filter(e => !curatedIds.has(e.id));
    } else {
      rows = events.slice();
    }

    if (muni !== 'all') rows = rows.filter(e => e.municipality === muni);
    if (q) rows = rows.filter(e =>
      (e.title || '').toLowerCase().includes(q) ||
      (e.locationName || '').toLowerCase().includes(q) ||
      (e.description || '').toLowerCase().includes(q)
    );

    if (sort === 'date-asc') rows.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    else if (sort === 'date-desc') rows.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    else if (sort === 'title') rows.sort((a, b) => (a.title || '').localeCompare(b.title || ''));

    return rows;
  }

  function render() {
    const rows = getFilteredRows();
    countLabel.textContent = `${rows.length} Treffer`;
    const isSuppressedView = filterSource.value === 'suppressed';
    tbody.innerHTML = rows.map(ev => {
      const st = getStatus(ev);
      const stPill = isSuppressedView
        ? '<span class="status-pill suppressed">🚫 suppressed</span>'
        : (st.label ? `<span class="status-pill ${st.cls}">${st.label}</span>` : '');
      const actionsHtml = isSuppressedView
        ? `<button type="button" data-action="restore" data-id="${escapeHtml(String(ev.id))}">⟲ Wiederherstellen</button>`
        : `<button type="button" data-action="edit" data-id="${escapeHtml(String(ev.id))}">✏</button>` +
          `<button type="button" data-action="delete" data-id="${escapeHtml(String(ev.id))}">🗑</button>`;
      return `
        <tr data-id="${escapeHtml(String(ev.id))}">
          <td><input type="checkbox" class="admin-db-row-check" data-id="${escapeHtml(String(ev.id))}" ${selectedIds.has(String(ev.id)) ? 'checked' : ''} /></td>
          <td class="title">${escapeHtml(ev.title || '(ohne Titel)')}</td>
          <td>${escapeHtml(ev.date || '')}${ev.time ? ' ' + escapeHtml(ev.time) : ''}</td>
          <td>${escapeHtml(ev.locationName || '')}</td>
          <td>${escapeHtml(getSourceLabel(ev))}</td>
          <td>${stPill}</td>
          <td class="actions">${actionsHtml}</td>
        </tr>
      `;
    }).join('') || '<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--ink-soft);">Keine Treffer.</td></tr>';
    updateBulkBar();
  }

  function updateBulkBar() {
    const n = selectedIds.size;
    bulkCount.textContent = `${n} ausgewählt`;
    bulkbar.classList.toggle('hidden', n === 0);
  }

  // Wiring
  closeBtn.addEventListener('click', close);
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  filterSource.addEventListener('change', render);
  filterMuni.addEventListener('change', render);
  sortSel.addEventListener('change', render);
  let searchTimer = null;
  filterSearch.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(render, 200);
  });

  checkAll.addEventListener('change', () => {
    if (checkAll.checked) {
      tbody.querySelectorAll('.admin-db-row-check').forEach(cb => {
        selectedIds.add(cb.dataset.id);
        cb.checked = true;
      });
    } else {
      selectedIds.clear();
      tbody.querySelectorAll('.admin-db-row-check').forEach(cb => { cb.checked = false; });
    }
    updateBulkBar();
  });

  tbody.addEventListener('change', (e) => {
    if (!e.target.classList.contains('admin-db-row-check')) return;
    const id = e.target.dataset.id;
    if (e.target.checked) selectedIds.add(id);
    else selectedIds.delete(id);
    updateBulkBar();
  });

  tbody.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const id = btn.dataset.id;
    const idNum = Number(id);
    const eventId = !Number.isNaN(idNum) && String(idNum) === id ? idNum : id;
    const action = btn.dataset.action;
    const s = window.appState;
    const events = s.events;

    if (action === 'edit') {
      const ev = events.find(e => String(e.id) === String(eventId));
      if (ev) {
        close();
        s.openAddModal('edit', ev);
      }
    } else if (action === 'delete') {
      const ev = events.find(e => String(e.id) === String(eventId));
      if (!ev) return;
      if (!confirm(`Event "${ev.title}" löschen? Für alle Besucher.`)) return;
      try {
        const isCurated = s.curatedState.events.some(c => c.id === ev.id);
        if (isCurated) {
          s.curatedState = await window.AdminShared.removeFromCurated(s.curatedState, ev.id);
        }
        if (!s.suppressedIdSet.has(ev.id)) {
          s.suppressedState = await window.AdminShared.addSuppressed(s.suppressedState, ev.id, { title: ev.title });
          s.suppressedIdSet.add(ev.id);
        }
        s.events = events.filter(x => x.id !== ev.id);
        s.filterEvents();
        render();
      } catch (err) {
        alert('Fehler: ' + err.message);
      }
    } else if (action === 'restore') {
      try {
        s.suppressedState = await window.AdminShared.removeFromSuppressed(s.suppressedState, eventId, { title: String(eventId) });
        s.suppressedIdSet.delete(eventId);
        alert('Wiederhergestellt — Seite wird neu geladen.');
        window.location.reload();
      } catch (err) {
        alert('Fehler: ' + err.message);
      }
    }
  });

  btnBulkDelete.addEventListener('click', async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`${selectedIds.size} Events löschen?`)) return;
    const s = window.appState;
    for (const idStr of Array.from(selectedIds)) {
      const idNum = Number(idStr);
      const id = !Number.isNaN(idNum) && String(idNum) === idStr ? idNum : idStr;
      const ev = s.events.find(e => String(e.id) === idStr);
      try {
        if (ev && s.curatedState.events.some(c => c.id === id)) {
          s.curatedState = await window.AdminShared.removeFromCurated(s.curatedState, id);
        }
        if (!s.suppressedIdSet.has(id)) {
          s.suppressedState = await window.AdminShared.addSuppressed(s.suppressedState, id, { title: ev ? ev.title : String(id) });
          s.suppressedIdSet.add(id);
        }
        s.events = s.events.filter(x => x.id !== id);
      } catch (err) {
        alert(`Fehler bei "${ev ? ev.title : id}": ${err.message}`);
        break;
      }
    }
    selectedIds.clear();
    s.filterEvents();
    render();
  });

  btnBulkClear.addEventListener('click', () => {
    selectedIds.clear();
    tbody.querySelectorAll('.admin-db-row-check').forEach(cb => { cb.checked = false; });
    checkAll.checked = false;
    updateBulkBar();
  });

  // Public API für admin-drawer.js
  window.AdminDatabase = {
    open,
    close,
    rawScraped: [],
  };
})();
