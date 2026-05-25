/**
 * CalandaKultur - Application Logic
 */

document.addEventListener('DOMContentLoaded', () => {
  // --- State Variables ---
  let events = [];
  let favorites = new Set();
  let currentCategory = 'all';
  let currentRegion = 'all';
  let currentWhen = 'all';
  let searchQuery = '';
  let activeCardId = null;
  let isPickingLocation = false;

  const REGION_CENTERS = {
    "Chur": { lat: 46.8508, lng: 9.5320, zoom: 14 },
    "Domat/Ems": { lat: 46.8354, lng: 9.4476, zoom: 14 },
    "Felsberg": { lat: 46.8436, lng: 9.4772, zoom: 14 },
    "Haldenstein": { lat: 46.8778, lng: 9.5303, zoom: 14 },
    "Trimmis": { lat: 46.8973, lng: 9.5636, zoom: 14 },
    "Untervaz": { lat: 46.9287, lng: 9.5369, zoom: 14 },
    "Zizers": { lat: 46.9348, lng: 9.5667, zoom: 14 },
    "Tamins": { lat: 46.8285, lng: 9.4069, zoom: 14 },
    "Churwalden": { lat: 46.7797, lng: 9.5348, zoom: 13 },
    "Tschiertschen-Praden": { lat: 46.8188, lng: 9.6053, zoom: 13 },
    "Bonaduz": { lat: 46.8124, lng: 9.3986, zoom: 14 },
    "Rhäzüns": { lat: 46.7978, lng: 9.4014, zoom: 14 },
    "Malans": { lat: 46.9803, lng: 9.5658, zoom: 14 },
    "Landquart": { lat: 46.9691, lng: 9.5550, zoom: 14 },
    "Thusis": { lat: 46.6972, lng: 9.4402, zoom: 13 }
  };
  
  // Leaflet Map instance & Marker Group
  let map = null;
  let markerGroup = null;
  const markers = {}; // Dictionary of marker instances keyed by event ID

  // DOM Elements
  const eventsGrid = document.getElementById('events-grid');
  const resultsCount = document.getElementById('results-count');
  const emptyState = document.getElementById('empty-state');
  const searchInput = document.getElementById('search-input');
  const searchClearBtn = document.getElementById('search-clear-btn');
  const btnResetFilters = document.getElementById('btn-reset-filters');
  const categoryPills = document.querySelectorAll('.category-pills .pill');
  const regionSelect = document.getElementById('region-select');
  const favCountBadge = document.getElementById('fav-count');
  const eventCountMobile = document.getElementById('event-count-mobile');
  
  // Modals
  const detailModal = document.getElementById('detail-modal');
  const detailModalBody = document.getElementById('detail-modal-body');
  const detailModalClose = document.getElementById('detail-modal-close');
  
  const addModal = document.getElementById('add-modal');
  const addModalClose = document.getElementById('add-modal-close');
  const btnAddEvent = document.getElementById('btn-add-event');
  const btnAddCancel = document.getElementById('btn-add-cancel');
  const addEventForm = document.getElementById('add-event-form');
  const btnPickLocation = document.getElementById('btn-pick-location');
  const mapHelperBadge = document.getElementById('map-helper-badge');

  // Import Modal Refs
  const importModal = document.getElementById('import-modal');
  const importModalClose = document.getElementById('import-modal-close');
  const btnImportEvents = document.getElementById('btn-import-events');
  const btnImportCancel1 = document.getElementById('btn-import-cancel-1');
  const btnImportCancel2 = document.getElementById('btn-import-cancel-2');
  const btnImportValidate = document.getElementById('btn-import-validate');
  const btnImportBack = document.getElementById('btn-import-back');
  const btnImportCommit = document.getElementById('btn-import-commit');
  const importPhaseInput = document.getElementById('import-phase-input');
  const importPhaseReview = document.getElementById('import-phase-review');
  const importFileInput = document.getElementById('import-file-input');
  const importPasteInput = document.getElementById('import-paste-input');
  const importParseError = document.getElementById('import-parse-error');
  const importSummary = document.getElementById('import-summary');
  const importInvalidDetails = document.getElementById('import-invalid-details');
  const importEventList = document.getElementById('import-event-list');
  const importSelectionCount = document.getElementById('import-selection-count');

  // Import State
  let importValidResults = []; // [{ event, index, isDuplicate, isSelected, isEditing }]

  // Review-Queue Refs
  const reviewBanner = document.getElementById('review-banner');
  const reviewBannerCount = document.getElementById('review-banner-count');
  const btnReviewOpen = document.getElementById('btn-review-open');
  const reviewModal = document.getElementById('review-modal');
  const reviewModalClose = document.getElementById('review-modal-close');
  const btnReviewCloseModal = document.getElementById('btn-review-close-modal');
  const reviewSummary = document.getElementById('review-summary');
  const reviewEventList = document.getElementById('review-event-list');
  const reviewRemainingCount = document.getElementById('review-remaining-count');

  // Review state
  let pendingSocialEvents = [];
  let reviewedIds = new Set();
  const REVIEWED_IDS_KEY = 'chur_events_reviewed_social_ids';

  // Mobile Tabs
  const tabList = document.getElementById('tab-list');
  const tabMap = document.getElementById('tab-map');
  const appContainer = document.querySelector('.app-container');

  // --- Category Icons Mapping ---
  const CATEGORY_ICONS = {
    music: 'music',
    stage: 'ticket',
    markets: 'shopping-bag',
    family: 'smile',
    sport: 'trophy',
    default: 'calendar'
  };

  const CATEGORY_LABELS = {
    music: 'Musik & Party',
    stage: 'Bühne & Kunst',
    markets: 'Märkte',
    family: 'Familie',
    sport: 'Sport'
  };

  // Mehrere Fallback-Bilder pro Kategorie (lokale event-images/ + Unsplash).
  // Auswahl deterministisch via pickFallback(category, key).
  const FALLBACK_IMAGES_BY_CATEGORY = {
    music: [
      'event-images/02-live-in-der-werkstatt.jpg',
      'event-images/09-jazz-brunch-im-marsol.jpg',
      'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&q=80&w=800'
    ],
    stage: [
      'event-images/05-open-air-kino-quaderwiese.jpg',
      'event-images/07-romeo-julia.jpg',
      'https://images.unsplash.com/photo-1460661419201-fd4cecdf8a8b?auto=format&fit=crop&q=80&w=800'
    ],
    markets: [
      'event-images/01-churer-wochenmarkt.jpg',
      'event-images/04-churer-flohmarkt.jpg',
      // Anderes Unsplash-Motiv (Bauernmarkt-Stand) — Foto-ID darf nicht mit 04 kollidieren.
      'https://images.unsplash.com/photo-1488459716781-31db52582fe9?auto=format&fit=crop&q=80&w=800'
    ],
    family: [
      'event-images/03-familiennachmittag-im-naturmuseum.jpg',
      'event-images/10-maienfelder-weinwanderung.jpg',
      'https://images.unsplash.com/photo-1471286174890-9c112ffca5b4?auto=format&fit=crop&q=80&w=800'
    ],
    sport: [
      'event-images/06-bundner-fruhlingslauf.jpg',
      'event-images/08-mountainbike-fur-kids.jpg',
      'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?auto=format&fit=crop&q=80&w=800'
    ]
  };

  function pickFallback(category, key) {
    const pool = FALLBACK_IMAGES_BY_CATEGORY[category]
      || FALLBACK_IMAGES_BY_CATEGORY.family;
    if (!pool || pool.length === 0) return '';
    // FNV-1a-Hash → stabile, gleichmässig verteilte Auswahl pro Event-ID/Key
    const s = String(key ?? '');
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return pool[(h >>> 0) % pool.length];
  }

  // Proxy beibehalten — Legacy-Code referenziert FALLBACK_IMAGES[cat]
  // (z.B. Detail-Modal-onerror, AddEvent-Form). Liefert das erste Bild pro
  // Kategorie als statisches Fallback.
  const FALLBACK_IMAGES = new Proxy({}, {
    get(_t, prop) {
      if (prop === 'default') return FALLBACK_IMAGES_BY_CATEGORY.family[0];
      const arr = FALLBACK_IMAGES_BY_CATEGORY[prop];
      return arr ? arr[0] : FALLBACK_IMAGES_BY_CATEGORY.family[0];
    }
  });

  // --- Import Feature: Schema constants ---
  const IMPORT_VALID_CATEGORIES = ['music', 'stage', 'markets', 'family', 'sport'];
  const IMPORT_VALID_PLATFORMS = ['Facebook', 'Instagram', 'TikTok', 'Guidle', 'Other'];
  const IMPORT_VALID_MUNICIPALITIES = Object.keys(REGION_CENTERS); // 15 municipalities
  const IMPORT_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  const IMPORT_CH_BOUNDS = { latMin: 45.5, latMax: 48.0, lngMin: 5.5, lngMax: 11.0 };

  // --- Helper Functions ---
  function getCategoryIcon(category) {
    return CATEGORY_ICONS[category] || CATEGORY_ICONS.default;
  }

  function getCategoryLabel(category) {
    return CATEGORY_LABELS[category] || category;
  }

  function formatDateString(dateStr) {
    const options = { weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit' };
    const date = new Date(dateStr);
    return date.toLocaleDateString('de-CH', options);
  }

  // Initialize Data (Asynchron)
  async function loadEventsData() {
    // Load favorites
    const savedFavorites = localStorage.getItem('chur_events_favorites');
    if (savedFavorites) {
      favorites = new Set(JSON.parse(savedFavorites));
    }
    updateFavoritesBadge();

    // Load custom events from localStorage
    const savedEvents = localStorage.getItem('chur_events_custom');
    let customEvents = [];
    if (savedEvents) {
      customEvents = JSON.parse(savedEvents);
    }

    // Versuche live gescrapte Events zu laden
    try {
      const response = await fetch('scraped-events.json');
      if (!response.ok) {
        throw new Error('Fehler beim Laden der Datei');
      }
      const scrapedEvents = await response.json();
      console.log(`📡 Echte Event-Daten geladen (${scrapedEvents.length} Events aus scraped-events.json).`);
      events = [...customEvents, ...scrapedEvents];
    } catch (e) {
      console.warn('⚠️ scraped-events.json nicht gefunden oder blockiert. Verwende statische Fallback-Daten.', e.message);
      // Fallback auf statische Initial-Events aus events-data.js
      events = [...customEvents, ...INITIAL_EVENTS];
    }
  }

  // --- Leaflet Map Setup ---
  function initMap() {
    // Chur Center coordinates
    const churCenter = [46.8508, 9.5320];
    
    map = L.map('map', {
      zoomControl: true,
      scrollWheelZoom: true
    }).setView(churCenter, 14);

    // CartoDB Positron tiles (light, fits the Alpin Premium cream palette)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 20
    }).addTo(map);

    markerGroup = L.layerGroup().addTo(map);

    // Map Click Listener (for picking event coordinates)
    map.on('click', (e) => {
      if (!isPickingLocation) return;

      const { lat, lng } = e.latlng;
      document.getElementById('event-lat').value = lat.toFixed(6);
      document.getElementById('event-lng').value = lng.toFixed(6);
      
      // End location picking
      isPickingLocation = false;
      mapHelperBadge.classList.add('hidden');
      document.getElementById('map').style.cursor = '';
      
      // Re-open/restore Modal
      addModal.classList.remove('hidden');
      
      // Visual feedback on coordinates
      const pickBtn = document.getElementById('btn-pick-location');
      pickBtn.classList.remove('btn-secondary');
      pickBtn.classList.add('btn-primary');
      pickBtn.innerHTML = '<i data-lucide="check"></i> <span>Standort gewählt</span>';
      lucide.createIcons();
    });
  }

  // Create customized marker HTML
  function createCustomMarkerIcon(category, isNew = false) {
    const iconName = getCategoryIcon(category);
    const pulseClass = isNew ? 'new-marker' : '';
    
    // Rotating standard marker pin style in CSS
    const iconHtml = `<div class="custom-marker ${category} ${pulseClass}"><i data-lucide="${iconName}"></i></div>`;
    
    return L.divIcon({
      html: iconHtml,
      className: 'custom-marker-container',
      iconSize: [32, 32],
      iconAnchor: [16, 32],
      popupAnchor: [0, -32]
    });
  }

  // Update Markers based on filtered events
  function updateMapMarkers(filteredEvents) {
    if (!markerGroup) return;
    
    // Clear existing markers
    markerGroup.clearLayers();
    Object.keys(markers).forEach(key => delete markers[key]);

    filteredEvents.forEach(event => {
      const markerIcon = createCustomMarkerIcon(event.category);
      
      const marker = L.marker([event.lat, event.lng], { icon: markerIcon });
      
      // Popup HTML content
      const popupContent = `
        <div class="popup-container">
          <h4>${event.title}</h4>
          <p><i data-lucide="map-pin" style="width:12px;height:12px;vertical-align:middle;margin-right:4px;"></i>${event.locationName}</p>
          <p><i data-lucide="calendar" style="width:12px;height:12px;vertical-align:middle;margin-right:4px;"></i>${formatDateString(event.date)}</p>
          <a class="popup-details-btn" data-id="${event.id}">Details ansehen &rarr;</a>
        </div>
      `;
      
      marker.bindPopup(popupContent);
      
      // On popup open, we trigger Lucide to render icons and bind the details link
      marker.on('popupopen', (e) => {
        lucide.createIcons();
        const popupRoot = e.popup.getElement();
        const detailsBtn = popupRoot && popupRoot.querySelector('.popup-details-btn');
        if (detailsBtn && !detailsBtn.dataset.bound) {
          detailsBtn.dataset.bound = '1';
          detailsBtn.addEventListener('click', (ev2) => {
            const raw = ev2.currentTarget.getAttribute('data-id');
            const parsed = Number(raw);
            const id = Number.isFinite(parsed) ? parsed : raw;
            openEventDetails(id);
          });
        }
        highlightEventCard(event.id);
      });

      marker.on('popupclose', () => {
        removeEventCardHighlight();
      });

      marker.addTo(markerGroup);
      markers[event.id] = marker;
    });

    // Auto-fit or Center map dynamically based on active filter
    if (filteredEvents.length > 0) {
      if (currentRegion === 'all') {
        const latlngs = filteredEvents.map(e => [e.lat, e.lng]);
        const bounds = L.latLngBounds(latlngs);
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
      } else {
        const center = REGION_CENTERS[currentRegion];
        if (center) {
          map.setView([center.lat, center.lng], center.zoom);
        }
      }
    } else if (currentRegion !== 'all') {
      const center = REGION_CENTERS[currentRegion];
      if (center) {
        map.setView([center.lat, center.lng], center.zoom);
      }
    }
  }

  // Highlight active event card in grid and scroll into view if needed
  function highlightEventCard(id) {
    // Remove previous highlights
    removeEventCardHighlight();
    
    activeCardId = id;
    const activeCard = document.querySelector(`.event-b[data-id="${id}"]`);
    if (activeCard) {
      activeCard.classList.add('active-card');
      activeCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function removeEventCardHighlight() {
    if (activeCardId !== null) {
      const activeCard = document.querySelector(`.event-b[data-id="${activeCardId}"]`);
      if (activeCard) {
        activeCard.classList.remove('active-card');
      }
      activeCardId = null;
    }
  }

  // --- Date Bucket Helpers ---
  const MONTHS_SHORT = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez'];
  function startOfDay(d) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
  function dayDiff(a, b) { return Math.round((startOfDay(a) - startOfDay(b)) / 86400000); }
  function bucketKey(dateStr) {
    const now = new Date();
    const ev = new Date(dateStr);
    const diff = dayDiff(ev, now);
    if (diff < 0) return 'past';
    if (diff === 0) return 'today';
    if (diff === 1) return 'tomorrow';
    if (diff <= 7) return 'thisweek';
    return 'later';
  }
  const BUCKET_META = {
    today:    { title: 'Heute',         label: 'Jetzt' },
    tomorrow: { title: 'Morgen',        label: 'Bald' },
    thisweek: { title: 'Diese Woche',   label: 'Kommend' },
    later:    { title: 'Später',        label: 'Im Kalender' },
    past:     { title: 'Vergangen',     label: 'Archiv' }
  };
  const BUCKET_ORDER = ['today','tomorrow','thisweek','later','past'];

  function parseStartTime(timeStr) {
    if (!timeStr) return '';
    const m = String(timeStr).match(/\b(\d{1,2}[:.]\d{2})\b/);
    return m ? m[1].replace('.', ':') : '';
  }
  function isFreePrice(p) {
    if (!p) return false;
    if (/\b(frei|gratis|kostenlos|free)\b/i.test(p)) return true;
    // Strip currency labels (CHF, Fr., Fr, €, $) and whitespace, then match 0 / 0.- / 0.00
    const cleaned = String(p).replace(/(?:chf|fr\.?|eur|€|\$|\s)/gi, '');
    return /^0(?:[.,](?:-|0{1,2}))?$/.test(cleaned);
  }

  // --- Rendering UI ---
  function renderEventCards(filteredEvents) {
    eventsGrid.innerHTML = '';

    if (filteredEvents.length === 0) {
      emptyState.classList.remove('hidden');
      if (resultsCount) resultsCount.textContent = '0 Anlässe';
      if (eventCountMobile) eventCountMobile.textContent = '0';
      return;
    }

    emptyState.classList.add('hidden');
    if (resultsCount) resultsCount.textContent = `${filteredEvents.length} ${filteredEvents.length === 1 ? 'Anlass' : 'Anlässe'}`;
    if (eventCountMobile) eventCountMobile.textContent = filteredEvents.length;

    // Bucket events
    const buckets = {};
    filteredEvents.forEach(ev => {
      const k = bucketKey(ev.date);
      (buckets[k] = buckets[k] || []).push(ev);
    });

    BUCKET_ORDER.forEach(key => {
      const list = buckets[key];
      if (!list || !list.length) return;
      const meta = BUCKET_META[key];

      const group = document.createElement('div');
      group.className = 'date-group';
      const isToday = key === 'today';
      group.innerHTML = `
        <div class="date-group-head">
          <div class="left">
            <h4>${meta.title}</h4>
            <span class="when-label ${isToday ? 'today' : ''}">${meta.label}</span>
          </div>
          <span class="gcount">${list.length} ${list.length === 1 ? 'Anlass' : 'Anlässe'}</span>
        </div>
        <div class="grid"></div>
      `;
      const grid = group.querySelector('.grid');

      list.forEach(event => {
        const isFav = favorites.has(event.id);
        const categoryLabel = getCategoryLabel(event.category);
        const d = new Date(event.date);
        const dayNum = d.getDate();
        const monthLabel = MONTHS_SHORT[d.getMonth()];
        const isTodayEvent = key === 'today';
        const startTime = parseStartTime(event.time);
        const free = isFreePrice(event.price);

        const card = document.createElement('div');
        card.className = `event-b ${activeCardId === event.id ? 'active-card' : ''}`;
        card.setAttribute('data-id', event.id);

        const dateBadge = isTodayEvent
          ? `<div class="event-b-today"><span class="label">Heute</span><span class="time">${escapeHtml(startTime || event.time || '—')}</span></div>`
          : `<div class="event-b-date"><span class="num">${dayNum}</span><span class="month">${monthLabel}</span></div>`;

        card.innerHTML = `
          <div class="event-b-media">
            <img src="${escapeHtml(event.image || pickFallback(event.category, event.id))}" alt="${escapeHtml(event.title)}" loading="lazy">
            ${dateBadge}
            <button class="event-b-fav ${isFav ? 'favorited' : ''}" title="Als Favorit speichern" data-id="${event.id}" aria-label="Favorisieren">
              <i data-lucide="heart"></i>
            </button>
          </div>
          <div class="event-b-body">
            <div class="event-b-cat">${escapeHtml(categoryLabel)}</div>
            <h3 class="event-b-title">${escapeHtml(event.title)}</h3>
            <div class="event-b-meta">
              <div class="row"><i data-lucide="map-pin"></i><span>${escapeHtml(event.locationName || '')}${event.municipality && event.municipality !== 'Chur' ? ' · ' + escapeHtml(event.municipality) : ''}</span></div>
              <div class="row"><i data-lucide="clock"></i><span>${escapeHtml(event.time || '')}</span></div>
            </div>
            <div class="event-b-foot">
              ${free
                ? `<span class="event-b-price free">Gratis</span>`
                : `<span class="event-b-price">${escapeHtml(event.price || '')}</span>`}
              <span class="event-b-cta">Details <i data-lucide="arrow-right"></i></span>
            </div>
          </div>
        `;

        card.addEventListener('click', (e) => {
          if (e.target.closest('.event-b-fav')) return;
          openEventDetails(event.id);
          const marker = markers[event.id];
          if (marker) {
            map.setView([event.lat, event.lng], 15);
            marker.openPopup();
          }
        });

        const favBtn = card.querySelector('.event-b-fav');
        favBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          toggleFavorite(event.id);
        });

        grid.appendChild(card);
      });

      eventsGrid.appendChild(group);
    });

    lucide.createIcons();
  }

  // --- Aggregate UI: sidebar badges, when-chip counts, hero stats ---
  function updateAggregates() {
    const baseList = events.filter(ev => currentRegion === 'all' || (ev.municipality || 'Chur') === currentRegion);

    // Sidebar category badges (within current region scope)
    const catCounts = { all: baseList.length, music: 0, stage: 0, markets: 0, family: 0, sport: 0 };
    baseList.forEach(ev => { if (catCounts[ev.category] !== undefined) catCounts[ev.category]++; });
    Object.keys(catCounts).forEach(cat => {
      const el = document.getElementById('badge-' + cat);
      if (el) el.textContent = catCounts[cat];
    });

    // When-chip counts (region scoped)
    let todayN = 0, weekendN = 0, weekN = 0;
    const today = startOfDay(new Date());
    baseList.forEach(ev => {
      const d = startOfDay(ev.date);
      const diff = dayDiff(d, today);
      if (diff < 0) return;
      if (diff === 0) todayN++;
      if (diff >= 0 && diff <= 7) weekN++;
      const dow = d.getDay(); // 0=Sun..6=Sat
      if (diff >= 0 && diff <= 7 && (dow === 0 || dow === 5 || dow === 6)) weekendN++;
    });
    const setNum = (id, n) => { const el = document.getElementById(id); if (el) el.textContent = n; };
    setNum('when-today-num', todayN);
    setNum('when-weekend-num', weekendN);
    setNum('when-week-num', weekN);

    // Hero stats
    const top = baseList
      .filter(ev => bucketKey(ev.date) === 'today')
      .sort((a, b) => (parseStartTime(a.time) || '').localeCompare(parseStartTime(b.time) || ''))[0];
    const set = (id, t) => { const el = document.getElementById(id); if (el) el.textContent = t; };
    set('stat-week-value', weekN);
    set('stat-week-sub', weekN === 1 ? 'Anlass geplant' : 'Anlässe geplant');
    set('stat-today-value', todayN);
    set('stat-today-sub', todayN === 1 ? 'Anlass heute' : 'Anlässe heute');
    if (top) {
      set('stat-top-value', top.title);
      set('stat-top-sub', `${parseStartTime(top.time) || top.time || ''} · ${top.locationName || ''}`);
    } else {
      set('stat-top-value', '—');
      set('stat-top-sub', 'Heute keine Anlässe');
    }

    // Hero eyebrow date
    const now = new Date();
    const eyebrow = now.toLocaleDateString('de-CH', { weekday: 'long', day: 'numeric', month: 'long' });
    const el = document.getElementById('hero-eyebrow-date');
    if (el) el.textContent = eyebrow + ' · Alpenrhein';
    const upd = document.getElementById('side-updated');
    if (upd) upd.textContent = 'Aktualisiert ' + now.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
  }

  // --- Filtering Logic ---
  function filterEvents() {
    let filtered = events;

    // 1. Category filter
    if (currentCategory === 'favorites') {
      filtered = filtered.filter(event => favorites.has(event.id));
    } else if (currentCategory !== 'all') {
      filtered = filtered.filter(event => event.category === currentCategory);
    }

    // 1.5 Region filter
    if (currentRegion !== 'all') {
      filtered = filtered.filter(event => (event.municipality || 'Chur') === currentRegion);
    }

    // 2. Search query filter
    if (searchQuery.trim() !== '') {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(event =>
        event.title.toLowerCase().includes(query) ||
        (event.description || '').toLowerCase().includes(query) ||
        (event.locationName || '').toLowerCase().includes(query)
      );
    }

    // 3. When filter
    if (currentWhen !== 'all') {
      const today = startOfDay(new Date());
      filtered = filtered.filter(event => {
        const d = startOfDay(event.date);
        const diff = dayDiff(d, today);
        if (diff < 0) return false;
        if (currentWhen === 'today') return diff === 0;
        if (currentWhen === 'week') return diff <= 7;
        if (currentWhen === 'weekend') {
          const dow = d.getDay();
          return diff <= 7 && (dow === 0 || dow === 5 || dow === 6);
        }
        return true;
      });
    }

    // Sort by date (ascending)
    filtered.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Render components
    renderEventCards(filtered);
    updateMapMarkers(filtered);
    updateAggregates();
  }

  // Toggle Favorite
  function toggleFavorite(id) {
    if (favorites.has(id)) {
      favorites.delete(id);
    } else {
      favorites.add(id);
    }
    
    // Save to localStorage
    localStorage.setItem('chur_events_favorites', JSON.stringify(Array.from(favorites)));
    
    // Update badge and redraw UI
    updateFavoritesBadge();
    filterEvents();
  }

  function updateFavoritesBadge() {
    favCountBadge.textContent = favorites.size;
    if (favorites.size > 0) {
      favCountBadge.style.display = 'inline-block';
    } else {
      favCountBadge.style.display = 'none';
    }
  }

  // --- Modal Logic ---
  
  // Event Details Modal
  function openEventDetails(id) {
    const event = events.find(e => e.id === id);
    if (!event) return;

    const isFav = favorites.has(event.id);
    const categoryLabel = getCategoryLabel(event.category);

    detailModalBody.innerHTML = `
      <div class="modal-event-header">
        <img src="${event.image || pickFallback(event.category, event.id)}" alt="${event.title}">
        <div class="modal-event-header-overlay">
          <span class="category-badge ${event.category}">${categoryLabel}</span>
          <h2 class="modal-event-title">${event.title}</h2>
          <div class="modal-event-meta-row">
            <span><i data-lucide="calendar" style="width:14px;height:14px;vertical-align:middle;margin-right:4px;"></i>${formatDateString(event.date)}</span>
            <span>&bull;</span>
            <span><i data-lucide="clock" style="width:14px;height:14px;vertical-align:middle;margin-right:4px;"></i>${event.time}</span>
          </div>
        </div>
      </div>
      <div class="modal-event-body">
        ${(event.organizerUrl || event.ticketUrl) ? `
        <div class="modal-action-links">
          ${event.organizerUrl ? `<a href="${event.organizerUrl}" target="_blank" rel="noopener noreferrer" class="action-link-btn primary"><i data-lucide="globe"></i><span>Zur offiziellen Website</span></a>` : ''}
          ${event.ticketUrl ? `<a href="${event.ticketUrl}" target="_blank" rel="noopener noreferrer" class="action-link-btn ticket"><i data-lucide="ticket"></i><span>Tickets kaufen</span></a>` : ''}
        </div>
        ` : ''}
        <p class="modal-event-description ${(!event.description || event.description === 'Keine Beschreibung verfügbar.') ? 'empty' : ''}">${event.description || 'Keine Beschreibung verfügbar.'}</p>
        
        <div class="modal-details-grid">
          <div class="modal-detail-item">
            <i data-lucide="map-pin"></i>
            <div class="modal-detail-text">
              <h5>Veranstaltungsort</h5>
              <p>${event.locationName}${event.municipality ? `, ${event.municipality}` : ''}</p>
            </div>
          </div>
          <div class="modal-detail-item">
            <i data-lucide="tag"></i>
            <div class="modal-detail-text">
              <h5>Eintrittspreis</h5>
              <p>${event.price}</p>
            </div>
          </div>
        </div>

        ${event.sources && event.sources.length > 0 ? `
        <div class="modal-sources-section">
          <h5 class="sources-title">Datenquelle${event.sources.length === 1 ? '' : 'n'}</h5>
          <div class="sources-links">
            ${event.sources.map(src => `
              <a href="${src.url}" target="_blank" rel="noopener noreferrer" class="source-link-btn">
                <i data-lucide="external-link"></i>
                <span>Auf ${src.name} ansehen</span>
              </a>
            `).join('')}
          </div>
        </div>
        ` : (event.sourceUrl ? `
        <div class="modal-sources-section">
          <h5 class="sources-title">Datenquelle</h5>
          <div class="sources-links">
            <a href="${event.sourceUrl}" target="_blank" rel="noopener noreferrer" class="source-link-btn">
              <i data-lucide="external-link"></i>
              <span>Auf ${event.sourceUrl.includes('localcities.ch') ? 'LocalCities' : 'Chur-Kultur'} ansehen</span>
            </a>
          </div>
        </div>
        ` : '')}

        <div class="modal-detail-actions">
          <button id="modal-btn-map" class="btn btn-secondary flex-1">
            <i data-lucide="map"></i>
            <span>Auf Karte zeigen</span>
          </button>
          <button id="modal-btn-fav" class="btn ${isFav ? 'btn-primary' : 'btn-secondary'} flex-shrink-0" style="${isFav ? 'background:var(--accent-pink);box-shadow:none;border:1px solid var(--accent-pink);color:#fff;' : ''}">
            <i data-lucide="heart" ${isFav ? 'style="fill:currentColor;"' : ''}></i>
            <span>${isFav ? 'Favorisiert' : 'Favorisieren'}</span>
          </button>
        </div>
      </div>
    `;

    detailModal.classList.remove('hidden');
    lucide.createIcons();

    // Map Action Button
    document.getElementById('modal-btn-map').addEventListener('click', () => {
      detailModal.classList.add('hidden');
      
      // Focus map on coordinates
      map.setView([event.lat, event.lng], 16);
      
      const marker = markers[event.id];
      if (marker) {
        marker.openPopup();
      }

      // If mobile view, switch active tab to map
      if (window.innerWidth <= 1024) {
        tabMap.click();
      }
    });

    // Favorite Action Button
    document.getElementById('modal-btn-fav').addEventListener('click', () => {
      toggleFavorite(event.id);
      
      // Refresh modal button state
      const isStillFav = favorites.has(event.id);
      const favBtn = document.getElementById('modal-btn-fav');
      if (isStillFav) {
        favBtn.className = 'btn btn-primary flex-shrink-0';
        favBtn.style = 'background:var(--accent-pink);box-shadow:none;border:1px solid var(--accent-pink);color:#fff;';
        favBtn.innerHTML = '<i data-lucide="heart" style="fill:currentColor;"></i> <span>Favorisiert</span>';
      } else {
        favBtn.className = 'btn btn-secondary flex-shrink-0';
        favBtn.style = '';
        favBtn.innerHTML = '<i data-lucide="heart"></i> <span>Favorisieren</span>';
      }
      lucide.createIcons();
    });
  }

  // --- Add Event Form Logic ---
  
  // Custom Location Pick trigger
  btnPickLocation.addEventListener('click', () => {
    isPickingLocation = true;
    addModal.classList.add('hidden'); // Minimize/hide modal temporarily
    mapHelperBadge.classList.remove('hidden');
    document.getElementById('map').style.cursor = 'crosshair';
    
    // Switch to map view tab if on mobile to allow picking
    if (window.innerWidth <= 1024) {
      tabMap.click();
    }
  });

  // Handle Form Submission
  addEventForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const title = document.getElementById('event-title').value;
    const category = document.getElementById('event-category').value;
    const price = document.getElementById('event-price').value || 'Eintritt frei';
    const municipality = document.getElementById('event-municipality').value;
    const date = document.getElementById('event-date').value;
    const time = document.getElementById('event-time').value;
    const locationName = document.getElementById('event-location-name').value;
    const lat = parseFloat(document.getElementById('event-lat').value);
    const lng = parseFloat(document.getElementById('event-lng').value);
    const imageInput = document.getElementById('event-image').value;
    const organizerUrl = document.getElementById('event-website').value;
    const ticketUrl = document.getElementById('event-ticket-url').value;

    if (!lat || !lng) {
      alert('Bitte wähle zuerst einen geografischen Standort auf der Karte aus.');
      return;
    }

    // Dedup-Check gegen den aktuell gemergten Event-Pool. Sanftes Confirm —
    // User kann immer "trotzdem speichern", die Lib reject nie hart.
    if (!confirmIfDuplicate({ title, date, locationName }, events)) {
      return;
    }

    // Foto-Base64 hat Vorrang vor URL-Feld (falls beides gesetzt)
    const finalImage = lastPhotoBase64 || imageInput;

    // New event object — id wird zuerst belegt, damit pickFallback denselben
    // Schlüssel wie der Render-Pfad sieht und das Bild stabil bleibt.
    const eventId = Date.now();
    const newEvent = {
      id: eventId,
      title,
      category,
      categoryLabel: getCategoryLabel(category),
      municipality,
      description: document.getElementById('event-description').value,
      date,
      time,
      locationName,
      lat,
      lng,
      price,
      image: finalImage || pickFallback(category, eventId),
      organizerUrl: organizerUrl || null,
      ticketUrl: ticketUrl || null
    };

    // Save custom events to localStorage
    const savedEvents = localStorage.getItem('chur_events_custom');
    let customEvents = [];
    if (savedEvents) {
      customEvents = JSON.parse(savedEvents);
    }
    customEvents.push(newEvent);
    localStorage.setItem('chur_events_custom', JSON.stringify(customEvents));

    // Add to global state list
    events.unshift(newEvent); // Add to the front of the list

    // Reset Form
    addEventForm.reset();
    resetLocationSelectionButton();
    resetPhotoScan();

    // Close Modal
    addModal.classList.add('hidden');

    // Trigger update
    filterEvents();

    // Visual feedback: Focus map on newly created event
    map.setView([newEvent.lat, newEvent.lng], 15);
    setTimeout(() => {
      const marker = markers[newEvent.id];
      if (marker) {
        marker.openPopup();
      }
    }, 450);
  });

  function resetLocationSelectionButton() {
    const pickBtn = document.getElementById('btn-pick-location');
    pickBtn.className = 'btn btn-secondary btn-sm';
    pickBtn.innerHTML = '<i data-lucide="map-pin"></i> <span>Auf Karte wählen</span>';
    document.getElementById('event-lat').value = '';
    document.getElementById('event-lng').value = '';
    lucide.createIcons();
  }

  // Close modals clicking backdrop
  window.addEventListener('click', (e) => {
    if (e.target === detailModal) {
      detailModal.classList.add('hidden');
    }
    if (e.target === addModal) {
      // If we are actively picking location, don't close, it's hidden
      if (!isPickingLocation) {
        addModal.classList.add('hidden');
        resetLocationSelectionButton();
        addEventForm.reset();
      }
    }
  });

  detailModalClose.addEventListener('click', () => detailModal.classList.add('hidden'));
  
  addModalClose.addEventListener('click', () => {
    addModal.classList.add('hidden');
    resetLocationSelectionButton();
    addEventForm.reset();
  });
  
  btnAddCancel.addEventListener('click', () => {
    addModal.classList.add('hidden');
    resetLocationSelectionButton();
    addEventForm.reset();
  });

  btnAddEvent.addEventListener('click', () => {
    addModal.classList.remove('hidden');
    // Pre-fill date to today for convenience
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('event-date').value = today;
  });

  // --- Search and Filtering Event Listeners ---
  
  // Real-time search with clear button
  const searchBox = searchInput.closest('.search-b');
  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    if (searchQuery.length > 0) {
      searchClearBtn.classList.remove('hidden');
      if (searchBox) searchBox.classList.add('has-value');
    } else {
      searchClearBtn.classList.add('hidden');
      if (searchBox) searchBox.classList.remove('has-value');
    }
    filterEvents();
  });

  // Click on collapsed icon-search expands and focuses input
  if (searchBox) {
    searchBox.addEventListener('click', (e) => {
      if (e.target === searchInput || e.target.closest('button')) return;
      searchInput.focus();
    });
  }

  searchClearBtn.addEventListener('click', () => {
    searchInput.value = '';
    searchQuery = '';
    searchClearBtn.classList.add('hidden');
    if (searchBox) searchBox.classList.remove('has-value');
    filterEvents();
  });

  // Category Pills
  categoryPills.forEach(pill => {
    pill.addEventListener('click', (e) => {
      const targetPill = e.target.closest('.pill');
      if (!targetPill) return;

      categoryPills.forEach(p => p.classList.remove('active'));
      targetPill.classList.add('active');

      currentCategory = targetPill.getAttribute('data-category');
      filterEvents();
      
      // If mobile view, switch to list tab automatically to show filtered items
      if (window.innerWidth <= 1024 && currentCategory !== 'favorites') {
        tabList.click();
      }
    });
  });

  // Empty state reset button
  btnResetFilters.addEventListener('click', () => {
    searchInput.value = '';
    searchQuery = '';
    searchClearBtn.classList.add('hidden');
    
    // Set to 'all' category
    categoryPills.forEach(p => p.classList.remove('active'));
    document.querySelector('.pill[data-category="all"]').classList.add('active');
    currentCategory = 'all';

    // Reset region
    regionSelect.value = 'all';
    currentRegion = 'all';

    filterEvents();
  });

  // Region dropdown change listener
  regionSelect.addEventListener('change', (e) => {
    currentRegion = e.target.value;
    filterEvents();
  });

  // When-Chips
  document.querySelectorAll('.when-chip-b').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('.when-chip-b').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      currentWhen = chip.getAttribute('data-when') || 'all';
      filterEvents();
    });
  });

  // Modal municipality selection centers the map
  document.getElementById('event-municipality').addEventListener('change', (e) => {
    const muni = e.target.value;
    const center = REGION_CENTERS[muni];
    if (center && map) {
      map.setView([center.lat, center.lng], center.zoom);
    }
  });

  // --- Mobile Tab Navigation ---
  tabList.addEventListener('click', () => {
    tabList.classList.add('active');
    tabMap.classList.remove('active');
    appContainer.classList.remove('view-active-map');
  });

  tabMap.addEventListener('click', () => {
    tabMap.classList.add('active');
    tabList.classList.remove('active');
    appContainer.classList.add('view-active-map');
    
    // Invalidate map size to make sure Leaflet redraws correctly inside dynamic flexbox/tabs
    if (map) {
      setTimeout(() => {
        map.invalidateSize();
      }, 100);
    }
  });

  // --- Initial Execution ---
  initMap();
  
  // Lade Daten asynchron und render das Interface
  loadEventsData().then(() => {
    filterEvents();
    lucide.createIcons();
  });

  // ============================================================
  // === Import Feature: Parser & Validator                   ===
  // ============================================================

  /**
   * Parse raw JSON text into an array. Throws Error with a readable message on failure.
   */
  function parseImportJson(text) {
    const trimmed = (text || '').trim();
    if (!trimmed) {
      throw new Error('Kein Inhalt — bitte JSON einfügen oder Datei wählen.');
    }
    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch (err) {
      throw new Error('Ungültiges JSON: ' + err.message);
    }
    if (!Array.isArray(parsed)) {
      throw new Error('JSON muss ein Array sein (kein Wrapper-Objekt erlaubt).');
    }
    if (parsed.length === 0) {
      throw new Error('Array ist leer — keine Events zum Importieren.');
    }
    return parsed;
  }

  /**
   * Validate a single event object against the import schema.
   * Returns { ok: true, event } or { ok: false, reasons: [...] }.
   */
  function validateImportedEvent(raw, index) {
    const reasons = [];
    if (!raw || typeof raw !== 'object') {
      return { ok: false, reasons: ['Eintrag ist kein Objekt'] };
    }

    const required = ['title', 'date', 'municipality', 'locationName', 'category', 'description', 'sourceUrl', 'sourcePlatform'];
    for (const field of required) {
      if (!raw[field] || (typeof raw[field] === 'string' && !raw[field].trim())) {
        reasons.push(`Pflichtfeld '${field}' fehlt oder leer`);
      }
    }

    if (raw.date && !IMPORT_DATE_RE.test(raw.date)) {
      reasons.push(`'date' muss YYYY-MM-DD sein (war: '${raw.date}')`);
    } else if (raw.date) {
      const eventDate = new Date(raw.date + 'T00:00:00');
      if (isNaN(eventDate.getTime())) {
        reasons.push(`'date' ist kein gültiges Datum: '${raw.date}'`);
      } else {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        if (eventDate < today) {
          reasons.push(`Datum liegt in der Vergangenheit: ${raw.date}`);
        }
      }
    }

    if (raw.category && !IMPORT_VALID_CATEGORIES.includes(raw.category)) {
      reasons.push(`'category' muss einer von ${IMPORT_VALID_CATEGORIES.join(', ')} sein (war: '${raw.category}')`);
    }

    if (raw.municipality && !IMPORT_VALID_MUNICIPALITIES.includes(raw.municipality)) {
      reasons.push(`'municipality' nicht in erlaubter Liste (war: '${raw.municipality}')`);
    }

    if (raw.sourcePlatform && !IMPORT_VALID_PLATFORMS.includes(raw.sourcePlatform)) {
      reasons.push(`'sourcePlatform' muss einer von ${IMPORT_VALID_PLATFORMS.join(', ')} sein (war: '${raw.sourcePlatform}')`);
    }

    if (raw.sourceUrl) {
      try {
        new URL(raw.sourceUrl);
      } catch {
        reasons.push(`'sourceUrl' ist keine gültige URL: '${raw.sourceUrl}'`);
      }
    }

    if (raw.lat !== undefined || raw.lng !== undefined) {
      const lat = Number(raw.lat);
      const lng = Number(raw.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        reasons.push(`'lat'/'lng' müssen Zahlen sein`);
      } else if (
        lat < IMPORT_CH_BOUNDS.latMin || lat > IMPORT_CH_BOUNDS.latMax ||
        lng < IMPORT_CH_BOUNDS.lngMin || lng > IMPORT_CH_BOUNDS.lngMax
      ) {
        reasons.push(`Koordinaten ausserhalb Schweiz: ${lat},${lng}`);
      }
    }

    if (reasons.length > 0) {
      return { ok: false, reasons, raw, index };
    }
    return { ok: true, event: raw, index };
  }

  /**
   * Detect duplicates against current events list and localStorage.
   * Mutates valid[] entries by adding .isDuplicate flag.
   */
  function detectImportDuplicates(validResults) {
    const dupeKey = (e) => `${(e.title || '').toLowerCase().trim()}|${e.date}|${e.municipality}`;
    const existingKeys = new Set(events.map(dupeKey));
    for (const result of validResults) {
      result.isDuplicate = existingKeys.has(dupeKey(result.event));
    }
  }

  // --- Import Feature: Geocoder (Nominatim) ---

  // Nominatim asks for identification via email query param when User-Agent can't be set (browser).
  // Replace with a real contact if you want Nominatim to reach you on issues.
  const NOMINATIM_EMAIL = 'chureventsdashboard@example.invalid';
  const NOMINATIM_DELAY_MS = 1100; // Nominatim policy: max 1 req/sec

  /**
   * Sleep helper used to throttle Nominatim calls.
   */
  function importSleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Try to geocode locationName + municipality via Nominatim.
   * Returns { lat, lng, approximated: false } on hit, or null on miss/error.
   */
  async function geocodeViaNominatim(locationName, municipality) {
    const query = `${locationName}, ${municipality}, Switzerland`;
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&email=${encodeURIComponent(NOMINATIM_EMAIL)}`;
    try {
      const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
      if (!res.ok) return null;
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) return null;
      const lat = parseFloat(data[0].lat);
      const lng = parseFloat(data[0].lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      if (lat < IMPORT_CH_BOUNDS.latMin || lat > IMPORT_CH_BOUNDS.latMax ||
          lng < IMPORT_CH_BOUNDS.lngMin || lng > IMPORT_CH_BOUNDS.lngMax) {
        return null;
      }
      return { lat, lng, approximated: false };
    } catch (err) {
      console.warn('[import] Nominatim error for', query, err);
      return null;
    }
  }

  /**
   * Fallback: use the pre-defined municipality center from REGION_CENTERS.
   * Always returns a coordinate (approximated: true).
   */
  function fallbackMunicipalityCenter(municipality) {
    const center = REGION_CENTERS[municipality];
    if (!center) return null;
    return { lat: center.lat, lng: center.lng, approximated: true };
  }

  /**
   * Resolve coordinates for a validated event.
   * If lat/lng already present and valid -> keep them, approximated=false.
   * Else -> Nominatim, else fallback to municipality center.
   * Sets event.lat, event.lng, event.locationApproximated.
   */
  async function resolveEventCoordinates(event) {
    if (Number.isFinite(Number(event.lat)) && Number.isFinite(Number(event.lng))) {
      event.lat = Number(event.lat);
      event.lng = Number(event.lng);
      event.locationApproximated = false;
      return;
    }
    const geo = await geocodeViaNominatim(event.locationName, event.municipality);
    if (geo) {
      event.lat = geo.lat;
      event.lng = geo.lng;
      event.locationApproximated = false;
      return;
    }
    const fb = fallbackMunicipalityCenter(event.municipality);
    if (fb) {
      event.lat = fb.lat;
      event.lng = fb.lng;
      event.locationApproximated = true;
      return;
    }
    // Last-resort: Chur center
    event.lat = REGION_CENTERS['Chur'].lat;
    event.lng = REGION_CENTERS['Chur'].lng;
    event.locationApproximated = true;
  }

  /**
   * Resolve coordinates for all events that need it.
   * Honors Nominatim rate-limit (1 req/sec) by sequencing only the API-calling ones.
   * Calls onProgress(eventIndex, status) for UI updates.
   */
  async function resolveAllCoordinates(events, onProgress) {
    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      const needsApi = !(Number.isFinite(Number(ev.lat)) && Number.isFinite(Number(ev.lng)));
      if (needsApi) {
        if (onProgress) onProgress(i, 'pending');
      }
      await resolveEventCoordinates(ev);
      if (onProgress) onProgress(i, ev.locationApproximated ? 'approx' : 'ok');
      if (needsApi && i < events.length - 1) {
        await importSleep(NOMINATIM_DELAY_MS);
      }
    }
  }

  // --- Import Feature: Render Review List ---

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function formatImportDate(iso) {
    const d = new Date(iso + 'T00:00:00');
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function renderImportSummary(validResults, invalidResults) {
    const dupes = validResults.filter(r => r.isDuplicate).length;
    const pills = [];
    pills.push(`<span class="import-summary-pill ok">✓ ${validResults.length} Events gültig</span>`);
    if (invalidResults.length > 0) {
      pills.push(`<span class="import-summary-pill error">✗ ${invalidResults.length} ungültig</span>`);
    }
    if (dupes > 0) {
      pills.push(`<span class="import-summary-pill warn">⚠ ${dupes} Dubletten</span>`);
    }
    importSummary.innerHTML = pills.join('');
  }

  function renderImportInvalidDetails(invalidResults) {
    if (invalidResults.length === 0) {
      importInvalidDetails.classList.add('hidden');
      importInvalidDetails.innerHTML = '';
      return;
    }
    const items = invalidResults.map(r =>
      `<li><strong>Event ${r.index + 1}:</strong> ${r.reasons.map(escapeHtml).join('; ')}</li>`
    ).join('');
    importInvalidDetails.innerHTML = `
      <details>
        <summary>${invalidResults.length} Events übersprungen — Details anzeigen</summary>
        <ul>${items}</ul>
      </details>
    `;
    importInvalidDetails.classList.remove('hidden');
  }

  function renderImportEventCard(result, listIndex) {
    const ev = result.event;
    const fallback = pickFallback(ev.category, ev.title || listIndex);
    const img = ev.imageUrl || fallback;
    let geoBadge = '';
    if (result.geoStatus === 'pending') {
      geoBadge = '<span class="import-event-badge geo-pending">⏳ Geocoding läuft</span>';
    } else if (result.geoStatus === 'approx' || ev.locationApproximated) {
      geoBadge = '<span class="import-event-badge geo-approx">📍 Approx. Gemeinde-Zentrum</span>';
    } else if (result.geoStatus === 'ok') {
      geoBadge = '<span class="import-event-badge geo-ok">📍 Standort gefunden</span>';
    }
    const dupeBadge = result.isDuplicate
      ? '<span class="import-event-badge dupe">⚠ Bereits vorhanden</span>'
      : '';
    const skippedClass = result.isSelected === false ? ' skipped' : '';
    const dupeClass = result.isDuplicate ? ' duplicate' : '';

    const editForm = result.isEditing ? renderImportEventEditForm(result, listIndex) : '';

    return `
      <div class="import-event-card${skippedClass}${dupeClass}" data-list-index="${listIndex}">
        <input type="checkbox" class="import-event-checkbox" ${result.isSelected !== false ? 'checked' : ''}
               data-action="toggle" />
        <img class="import-event-image" src="${escapeHtml(img)}" alt="${escapeHtml(ev.title)}"
             onerror="this.onerror=null;this.src=${escapeHtml(JSON.stringify(fallback))}" />
        <div class="import-event-body">
          <p class="import-event-title">${escapeHtml(ev.title)}</p>
          <div class="import-event-meta">
            <span>📅 ${formatImportDate(ev.date)}${ev.time ? ' · ' + escapeHtml(ev.time) : ''}</span>
            <span>📍 ${escapeHtml(ev.locationName)} (${escapeHtml(ev.municipality)})</span>
            <span>🏷 ${escapeHtml(getCategoryLabel(ev.category) || ev.category)}</span>
            <span>📷 ${escapeHtml(ev.sourcePlatform)}</span>
            <a href="${escapeHtml(ev.sourceUrl)}" target="_blank" rel="noopener noreferrer">Quelle ansehen ↗</a>
            ${geoBadge}
            ${dupeBadge}
          </div>
          <p class="import-event-description">${escapeHtml(ev.description)}</p>
        </div>
        <div class="import-event-actions">
          <button type="button" class="btn btn-secondary" data-action="edit">${result.isEditing ? 'Schliessen' : 'Bearbeiten'}</button>
          <button type="button" class="btn btn-secondary" data-action="skip">Skip</button>
        </div>
        ${editForm}
      </div>
    `;
  }

  function renderImportEventEditForm(result, listIndex) {
    const ev = result.event;
    const catOptions = IMPORT_VALID_CATEGORIES
      .map(c => `<option value="${c}" ${c === ev.category ? 'selected' : ''}>${escapeHtml(getCategoryLabel(c) || c)}</option>`)
      .join('');
    const muniOptions = IMPORT_VALID_MUNICIPALITIES
      .map(m => `<option value="${escapeHtml(m)}" ${m === ev.municipality ? 'selected' : ''}>${escapeHtml(m)}</option>`)
      .join('');
    return `
      <div class="import-event-edit-form" data-edit-index="${listIndex}">
        <label class="full">Titel
          <input type="text" data-field="title" value="${escapeHtml(ev.title)}" />
        </label>
        <label>Datum
          <input type="date" data-field="date" value="${escapeHtml(ev.date)}" />
        </label>
        <label>Uhrzeit
          <input type="text" data-field="time" value="${escapeHtml(ev.time || '')}" />
        </label>
        <label>Kategorie
          <select data-field="category">${catOptions}</select>
        </label>
        <label>Gemeinde
          <select data-field="municipality">${muniOptions}</select>
        </label>
        <label class="full">Ort
          <input type="text" data-field="locationName" value="${escapeHtml(ev.locationName)}" />
        </label>
        <label>Lat
          <input type="number" step="any" data-field="lat" value="${ev.lat ?? ''}" />
        </label>
        <label>Lng
          <input type="number" step="any" data-field="lng" value="${ev.lng ?? ''}" />
        </label>
        <label class="full">Beschreibung
          <textarea data-field="description" rows="3">${escapeHtml(ev.description)}</textarea>
        </label>
        <div class="full" style="display:flex;gap:0.5rem;justify-content:flex-end;">
          <button type="button" class="btn btn-secondary" data-action="edit-cancel">Abbrechen</button>
          <button type="button" class="btn btn-primary" data-action="edit-save">Übernehmen</button>
        </div>
      </div>
    `;
  }

  function renderImportEventList() {
    importEventList.innerHTML = importValidResults
      .map((r, i) => renderImportEventCard(r, i))
      .join('');
    if (window.lucide) window.lucide.createIcons();
    updateImportSelectionCount();
  }

  function updateImportSelectionCount() {
    const total = importValidResults.length;
    const selected = importValidResults.filter(r => r.isSelected !== false).length;
    importSelectionCount.textContent = `${selected} von ${total} ausgewählt`;
    btnImportCommit.disabled = selected === 0;
  }

  // Event delegation on the import event list (checkboxes + action buttons)
  importEventList.addEventListener('click', (e) => {
    const card = e.target.closest('.import-event-card');
    if (!card) return;
    const listIndex = parseInt(card.dataset.listIndex, 10);
    const result = importValidResults[listIndex];
    if (!result) return;

    const action = e.target.dataset.action || e.target.closest('[data-action]')?.dataset.action;

    if (action === 'toggle') {
      result.isSelected = e.target.checked;
      card.classList.toggle('skipped', !result.isSelected);
      updateImportSelectionCount();
    } else if (action === 'skip') {
      result.isSelected = false;
      result.isEditing = false;
      renderImportEventList();
    } else if (action === 'edit') {
      result.isEditing = !result.isEditing;
      renderImportEventList();
    } else if (action === 'edit-cancel') {
      result.isEditing = false;
      renderImportEventList();
    } else if (action === 'edit-save') {
      const form = card.querySelector('.import-event-edit-form');
      if (form) {
        form.querySelectorAll('[data-field]').forEach(input => {
          const field = input.dataset.field;
          let value = input.value;
          if (field === 'lat' || field === 'lng') {
            value = value === '' ? undefined : Number(value);
          }
          result.event[field] = value;
        });
        result.isEditing = false;
        // Re-detect duplicate status (title/date/municipality may have changed)
        detectImportDuplicates([result]);
        renderImportEventList();
      }
    }
  });

  // --- Import Feature: Commit selected events ---

  function buildEventFromImport(raw) {
    return {
      id: Date.now() + Math.floor(Math.random() * 10000),
      title: raw.title,
      category: raw.category,
      categoryLabel: getCategoryLabel(raw.category),
      municipality: raw.municipality,
      description: raw.description,
      date: raw.date,
      time: raw.time || '',
      locationName: raw.locationName,
      lat: raw.lat,
      lng: raw.lng,
      price: 'Eintritt frei', // not in import schema; default
      image: raw.imageUrl || pickFallback(raw.category, raw.title || raw.sourceUrl),
      organizerUrl: raw.organizerUrl || null,
      ticketUrl: raw.ticketUrl || null,
      source: 'import',
      sources: [{ name: raw.sourcePlatform, url: raw.sourceUrl }],
      locationApproximated: !!raw.locationApproximated
    };
  }

  function commitImport() {
    const toImport = importValidResults
      .filter(r => r.isSelected !== false)
      .map(r => buildEventFromImport(r.event));

    if (toImport.length === 0) {
      alert('Keine Events ausgewählt.');
      return;
    }

    // Persist to localStorage (same key as manual Add-Event flow)
    const saved = localStorage.getItem('chur_events_custom');
    let customEvents = [];
    if (saved) {
      try { customEvents = JSON.parse(saved); } catch { customEvents = []; }
    }
    customEvents.push(...toImport);
    try {
      localStorage.setItem('chur_events_custom', JSON.stringify(customEvents));
    } catch (err) {
      alert('Speicher voll — bitte alte Events löschen und erneut versuchen.\n\n' + err.message);
      return;
    }

    // Add to in-memory state
    events.unshift(...toImport);

    // Refresh UI
    filterEvents();

    // Close modal, reset state
    importModal.classList.add('hidden');
    importValidResults = [];

    alert(`${toImport.length} Events importiert.`);
  }

  // --- Import Feature: Wiring ---

  function openImportModal() {
    // Reset state
    importValidResults = [];
    importPasteInput.value = '';
    importFileInput.value = '';
    importParseError.classList.add('hidden');
    importParseError.textContent = '';
    importSummary.innerHTML = '';
    importInvalidDetails.classList.add('hidden');
    importInvalidDetails.innerHTML = '';
    importEventList.innerHTML = '';
    importPhaseInput.classList.remove('hidden');
    importPhaseReview.classList.add('hidden');
    importModal.classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
  }

  function closeImportModal() {
    importModal.classList.add('hidden');
  }

  async function handleImportValidate() {
    importParseError.classList.add('hidden');
    importParseError.textContent = '';

    // Get text: file takes precedence over textarea
    let text = '';
    const file = importFileInput.files[0];
    if (file) {
      try {
        text = await file.text();
      } catch (err) {
        importParseError.textContent = 'Datei konnte nicht gelesen werden: ' + err.message;
        importParseError.classList.remove('hidden');
        return;
      }
    } else {
      text = importPasteInput.value;
    }

    // Parse
    let parsed;
    try {
      parsed = parseImportJson(text);
    } catch (err) {
      importParseError.textContent = err.message;
      importParseError.classList.remove('hidden');
      return;
    }

    // Validate each
    const validResults = [];
    const invalidResults = [];
    parsed.forEach((raw, i) => {
      const result = validateImportedEvent(raw, i);
      if (result.ok) {
        validResults.push({
          event: { ...result.event },
          index: i,
          isDuplicate: false,
          isSelected: true,
          isEditing: false,
          geoStatus: null
        });
      } else {
        invalidResults.push(result);
      }
    });

    if (validResults.length === 0) {
      importParseError.textContent = `Keine gültigen Events gefunden (${invalidResults.length} Fehler).\n\n` +
        invalidResults.map(r => `Event ${r.index + 1}: ${r.reasons.join('; ')}`).join('\n');
      importParseError.classList.remove('hidden');
      return;
    }

    // Dupe detection
    detectImportDuplicates(validResults);

    // Switch to Phase 2
    importValidResults = validResults;
    importPhaseInput.classList.add('hidden');
    importPhaseReview.classList.remove('hidden');

    renderImportSummary(validResults, invalidResults);
    renderImportInvalidDetails(invalidResults);
    renderImportEventList();

    // Kick off async geocoding (non-blocking)
    resolveAllCoordinates(
      validResults.map(r => r.event),
      (i, status) => {
        validResults[i].geoStatus = status;
        renderImportEventList();
      }
    ).catch(err => console.warn('[import] geocoding error:', err));
  }

  // File drag-and-drop
  const dropZone = document.querySelector('.import-file-drop');
  if (dropZone) {
    ['dragenter', 'dragover'].forEach(evt => {
      dropZone.addEventListener(evt, (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
      });
    });
    ['dragleave', 'drop'].forEach(evt => {
      dropZone.addEventListener(evt, (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
      });
    });
    dropZone.addEventListener('drop', (e) => {
      const file = e.dataTransfer?.files?.[0];
      if (file && file.name.endsWith('.json')) {
        const dt = new DataTransfer();
        dt.items.add(file);
        importFileInput.files = dt.files;
      }
    });
  }

  // Button wiring
  btnImportEvents.addEventListener('click', openImportModal);
  importModalClose.addEventListener('click', closeImportModal);
  btnImportCancel1.addEventListener('click', closeImportModal);
  btnImportCancel2.addEventListener('click', closeImportModal);
  btnImportValidate.addEventListener('click', handleImportValidate);
  btnImportBack.addEventListener('click', () => {
    importPhaseReview.classList.add('hidden');
    importPhaseInput.classList.remove('hidden');
  });
  btnImportCommit.addEventListener('click', commitImport);

  // Click-outside-modal to close
  importModal.addEventListener('click', (e) => {
    if (e.target === importModal) closeImportModal();
  });

  // ============================================================
  // === Review Queue: Fetch & Banner                          ===
  // ============================================================

  function loadReviewedIds() {
    try {
      const stored = JSON.parse(localStorage.getItem(REVIEWED_IDS_KEY) || '[]');
      reviewedIds = new Set(Array.isArray(stored) ? stored : []);
    } catch {
      reviewedIds = new Set();
    }
  }

  function persistReviewedIds() {
    try {
      localStorage.setItem(REVIEWED_IDS_KEY, JSON.stringify(Array.from(reviewedIds)));
    } catch (err) {
      console.warn('[review] persist failed:', err.message);
    }
  }

  function getUnreviewedEvents() {
    return pendingSocialEvents.filter(ev => !reviewedIds.has(ev.id));
  }

  // Holds the lastUpdated timestamp from pending-social-events.json, or 'error' if fetch failed
  let pendingFetchStatus = null;

  function formatAgo(iso) {
    if (!iso) return 'nie';
    const ms = Date.now() - new Date(iso).getTime();
    if (isNaN(ms)) return 'unbekannt';
    const h = Math.floor(ms / 3600000);
    if (h < 1) return 'vor < 1 h';
    if (h < 24) return `vor ${h} h`;
    return `vor ${Math.floor(h / 24)} Tagen`;
  }

  function updateBanner() {
    const count = getUnreviewedEvents().length;
    if (pendingFetchStatus === 'error') {
      // Surface scraper-data failure to the operator
      reviewBannerCount.textContent = '!';
      reviewBanner.classList.add('error-state');
      reviewBanner.classList.remove('hidden');
      const textEl = reviewBanner.querySelector('.review-banner-text');
      if (textEl) textEl.innerHTML = '<strong>Scrape-Daten unerreichbar</strong> — siehe Konsole';
      const btn = reviewBanner.querySelector('#btn-review-open');
      if (btn) btn.style.display = 'none';
      return;
    }
    reviewBanner.classList.remove('error-state');
    const btn = reviewBanner.querySelector('#btn-review-open');
    if (btn) btn.style.display = '';
    if (count > 0) {
      reviewBannerCount.textContent = count;
      const textEl = reviewBanner.querySelector('.review-banner-text');
      if (textEl) {
        textEl.innerHTML = `<strong id="review-banner-count">${count}</strong> neue Events zur Prüfung <small style="opacity:0.6">(Scrape ${formatAgo(pendingFetchStatus)})</small>`;
      }
      reviewBanner.classList.remove('hidden');
    } else {
      reviewBanner.classList.add('hidden');
    }
  }

  async function fetchPendingSocialEvents() {
    try {
      const res = await fetch('pending-social-events.json', { cache: 'no-store' });
      if (!res.ok) {
        console.warn('[review] pending-social-events.json fetch failed:', res.status);
        pendingFetchStatus = 'error';
        updateBanner();
        return;
      }
      const data = await res.json();
      pendingSocialEvents = Array.isArray(data.events) ? data.events : [];
      pendingFetchStatus = data.lastUpdated || null;
      loadReviewedIds();
      migrateLegacyReviewedIds();
      pruneReviewedIds();
      updateBanner();
    } catch (err) {
      console.warn('[review] fetch error:', err.message);
      pendingFetchStatus = 'error';
      updateBanner();
    }
  }

  // One-time migration: when event IDs switched from timestamp-based to hash-based,
  // map old IDs in reviewedIds → new IDs using the legacyId field embedded in pending events.
  // Safe to call on every load: idempotent and cheap once migration has run.
  function migrateLegacyReviewedIds() {
    let migrated = 0;
    for (const ev of pendingSocialEvents) {
      if (ev.legacyId && reviewedIds.has(ev.legacyId) && !reviewedIds.has(ev.id)) {
        reviewedIds.add(ev.id);
        migrated++;
      }
    }
    if (migrated > 0) {
      persistReviewedIds();
      console.log(`[review] migrated ${migrated} legacy reviewed IDs to hash format`);
    }
  }

  // Prune reviewedIds whose events are no longer in the pending file.
  // Approved events already live in chur_events_custom; their reviewed marker is no longer needed
  // once they've fallen out of the daily Gemini scrape (event date passed, or scraper no longer
  // surfaces them). Prevents the Set from growing unboundedly over years of daily runs.
  function pruneReviewedIds() {
    if (pendingSocialEvents.length === 0) return; // safety: never prune on a failed fetch
    const validIds = new Set();
    for (const ev of pendingSocialEvents) {
      validIds.add(ev.id);
      if (ev.legacyId) validIds.add(ev.legacyId);
    }
    const before = reviewedIds.size;
    reviewedIds = new Set([...reviewedIds].filter(id => validIds.has(id)));
    const pruned = before - reviewedIds.size;
    if (pruned > 0) {
      persistReviewedIds();
      console.log(`[review] pruned ${pruned} stale reviewed IDs`);
    }
  }

  // --- Dedup-Helper ---
  // Sanftes Confirm bei wahrscheinlichen Duplikaten. Liefert true wenn
  // Speichern fortgesetzt werden darf (kein Match ODER User bestätigt
  // "trotzdem speichern"), false bei Abbruch.
  function confirmIfDuplicate(candidate, pool) {
    if (!window.EventDedup) return true; // Lib nicht geladen → kein Block
    const matches = window.EventDedup.findPotentialDuplicates(candidate, pool);
    if (matches.length === 0) return true;
    const lines = matches.slice(0, 3).map(m => {
      const ev = m.event;
      const when = ev.date ? new Date(ev.date).toLocaleDateString('de-CH') : '?';
      return `• "${ev.title}" am ${when} (${Math.round(m.score * 100)}% ähnlich)`;
    });
    const more = matches.length > 3 ? `\n… und ${matches.length - 3} weitere` : '';
    const msg = `Ähnliche Events existieren bereits:\n\n${lines.join('\n')}${more}\n\nTrotzdem speichern?`;
    return confirm(msg);
  }

  // --- Reviewer-Gate ---
  // Review-Banner ist nicht öffentlich. Freischaltung einmalig via
  // ?reviewer=<secret>, danach gemerkt in localStorage. Kein echter Auth —
  // der Code ist öffentlich. Schutz vor zufälligen Besuchern, nicht vor
  // motivierten Snoopern. Bei Bedarf Secret hier rotieren.
  const REVIEWER_SECRET = 'caland-2026-x9k2';
  const REVIEWER_KEY = 'chur_events_reviewer';
  (function initReviewerFlag() {
    let url;
    try { url = new URL(window.location.href); }
    catch (_) { return; }
    const param = url.searchParams.get('reviewer');
    if (!param) return;

    if (param === REVIEWER_SECRET) {
      let writeOk = false;
      try {
        localStorage.setItem(REVIEWER_KEY, '1');
        writeOk = localStorage.getItem(REVIEWER_KEY) === '1';
      } catch (err) {
        console.error('[reviewer] localStorage.setItem failed:', err);
      }
      if (writeOk) {
        console.log('[reviewer] Freigeschaltet — Flag in localStorage gesetzt.');
        url.searchParams.delete('reviewer');
        history.replaceState(null, '', url.toString());
      } else {
        // URL NICHT säubern — User sieht, dass Param noch da ist, und weiss
        // dass etwas schiefging. Plus sichtbare Meldung.
        alert(
          'Reviewer-Flag konnte nicht gespeichert werden. ' +
          'Wahrscheinlich Tracking-Prevention oder Privater Modus. ' +
          'Tipp: In Edge unter Einstellungen → Datenschutz → Tracking-Prevention auf „Ausgewogen" stellen, ' +
          'oder einen anderen Browser nutzen.'
        );
      }
    } else if (param === 'logout') {
      try { localStorage.removeItem(REVIEWER_KEY); } catch (_) {}
      url.searchParams.delete('reviewer');
      history.replaceState(null, '', url.toString());
    }
  })();
  function isReviewer() {
    try { return localStorage.getItem(REVIEWER_KEY) === '1'; }
    catch (_) { return false; }
  }

  // Trigger on init — nur für Reviewer; sonst Banner bleibt versteckt
  if (isReviewer()) {
    fetchPendingSocialEvents();
  } else {
    reviewBanner.classList.add('hidden');
  }

  // --- Settings (Reviewer-only) ---
  const GEMINI_KEY_STORAGE = 'chur_events_gemini_key';
  const btnSettings = document.getElementById('btn-settings');
  const settingsModal = document.getElementById('settings-modal');
  const settingsModalClose = document.getElementById('settings-modal-close');
  const settingsForm = document.getElementById('settings-form');
  const settingsGeminiKey = document.getElementById('settings-gemini-key');
  const settingsStatus = document.getElementById('settings-status');
  const btnSettingsTest = document.getElementById('btn-settings-test');
  const btnSettingsClear = document.getElementById('btn-settings-clear');

  if (isReviewer()) {
    btnSettings.classList.remove('hidden');
  }

  function setSettingsStatus(text, kind) {
    settingsStatus.textContent = text || '';
    settingsStatus.classList.remove('ok', 'error');
    if (kind) settingsStatus.classList.add(kind);
  }

  function openSettingsModal() {
    try { settingsGeminiKey.value = localStorage.getItem(GEMINI_KEY_STORAGE) || ''; }
    catch (_) { settingsGeminiKey.value = ''; }
    setSettingsStatus('');
    settingsModal.classList.remove('hidden');
  }
  function closeSettingsModal() {
    settingsModal.classList.add('hidden');
  }

  btnSettings.addEventListener('click', openSettingsModal);
  settingsModalClose.addEventListener('click', closeSettingsModal);
  settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) closeSettingsModal();
  });

  settingsForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const key = settingsGeminiKey.value.trim();
    try {
      if (key) localStorage.setItem(GEMINI_KEY_STORAGE, key);
      else localStorage.removeItem(GEMINI_KEY_STORAGE);
      setSettingsStatus('Gespeichert.', 'ok');
    } catch (err) {
      setSettingsStatus('Speichern fehlgeschlagen: ' + err.message, 'error');
    }
  });

  btnSettingsClear.addEventListener('click', () => {
    settingsGeminiKey.value = '';
    try { localStorage.removeItem(GEMINI_KEY_STORAGE); } catch (_) {}
    setSettingsStatus('Gelöscht.', 'ok');
  });

  btnSettingsTest.addEventListener('click', async () => {
    const key = settingsGeminiKey.value.trim();
    if (!key) {
      setSettingsStatus('Bitte zuerst einen Key eintragen.', 'error');
      return;
    }
    setSettingsStatus('Prüfe …');
    btnSettingsTest.disabled = true;
    try {
      // Models-Endpoint ist quota-frei und reicht, um den Key zu validieren.
      const res = await fetch(
        'https://generativelanguage.googleapis.com/v1beta/models?key=' + encodeURIComponent(key)
      );
      if (res.ok) {
        const data = await res.json();
        const count = Array.isArray(data.models) ? data.models.length : 0;
        setSettingsStatus(`✓ Verbindung OK — ${count} Modelle verfügbar.`, 'ok');
      } else {
        const body = await res.text();
        setSettingsStatus(`✗ Fehler ${res.status}: ${body.slice(0, 200)}`, 'error');
      }
    } catch (err) {
      setSettingsStatus('✗ Netzwerk-Fehler: ' + err.message, 'error');
    } finally {
      btnSettingsTest.disabled = false;
    }
  });

  // --- Foto-Scanner: Upload + Compression (Reviewer-only) ---
  // Schritt 1 von Foto-zu-Event: Datei wählen, auf max 800px Breite
  // verkleinern, als JPEG-Base64 cachen. Der eigentliche Gemini-Call
  // kommt in Schritt 6/7.
  const btnPhotoScan = document.getElementById('btn-photo-scan');
  const photoScanInput = document.getElementById('photo-scan-input');
  const photoScanPreview = document.getElementById('photo-scan-preview');
  const photoScanStatus = document.getElementById('photo-scan-status');
  const btnPhotoExtract = document.getElementById('btn-photo-extract');
  let lastPhotoBase64 = null;
  let lastExtractedEvents = null;

  const MUNICIPALITIES = [
    'Chur','Domat/Ems','Felsberg','Haldenstein','Trimmis','Untervaz','Zizers',
    'Tamins','Churwalden','Tschiertschen-Praden','Bonaduz','Rhäzüns',
    'Malans','Landquart','Thusis'
  ];
  const CATEGORY_IDS = ['music','stage','markets','family','sport'];

  // Schema gemäss Gemini REST: type-Strings in UPPERCASE, enum auf STRING-Feldern.
  const EVENT_EXTRACT_SCHEMA = {
    type: 'OBJECT',
    properties: {
      events: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: {
            title: { type: 'STRING', description: 'Veranstaltungstitel' },
            date: { type: 'STRING', description: 'ISO-Datum YYYY-MM-DD. Wenn nur Tag+Monat angegeben, nimm das nächste Vorkommen ab heute.' },
            time: { type: 'STRING', description: 'Format HH:MM oder HH:MM - HH:MM. Leer wenn unbekannt.' },
            locationName: { type: 'STRING', description: 'Veranstaltungsort mit Adresse falls vorhanden' },
            municipality: { type: 'STRING', enum: MUNICIPALITIES, description: 'Gemeinde aus der Liste. Leer wenn nicht erkennbar.' },
            category: { type: 'STRING', enum: CATEGORY_IDS, description: 'Beste Kategorie aus der Liste' },
            description: { type: 'STRING' },
            price: { type: 'STRING', description: 'z.B. "CHF 20" oder "Eintritt frei"' },
            organizerUrl: { type: 'STRING' },
            ticketUrl: { type: 'STRING' }
          },
          required: ['title']
        }
      }
    },
    required: ['events']
  };

  function buildExtractPrompt() {
    const todayIso = new Date().toISOString().slice(0, 10);
    return [
      'Du bist ein Assistent, der Eventdaten aus Plakat- oder Flyer-Fotos extrahiert.',
      `Heutiges Datum: ${todayIso}. Region: Alpenrhein/Bündner Rheintal.`,
      'Aufgabe: Lies das Bild und extrahiere alle erkennbaren Veranstaltungen.',
      'Wenn das Plakat mehrere Events listet (Konzertreihe, Festivalprogramm), liefere alle als separate Einträge.',
      'Felder, die du nicht klar erkennen kannst, lasse LEER — NIEMALS raten oder erfinden.',
      'Datum ohne Jahresangabe → nimm das nächstkommende Vorkommen ab heute.',
      'Antworte ausschliesslich mit dem JSON-Objekt gemäss Schema.'
    ].join(' ');
  }

  async function extractEventDataFromImage(base64DataUrl) {
    const key = (() => {
      try { return localStorage.getItem(GEMINI_KEY_STORAGE) || ''; }
      catch (_) { return ''; }
    })();
    if (!key) {
      throw new Error('Kein Gemini-API-Key hinterlegt. Bitte in Einstellungen eintragen.');
    }
    // base64DataUrl ist "data:image/jpeg;base64,/9j/..." — wir brauchen nur den Teil nach dem Komma.
    const [meta, base64] = base64DataUrl.split(',');
    const mimeMatch = meta && meta.match(/data:([^;]+);base64/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';

    const payload = {
      contents: [{
        parts: [
          { inline_data: { mime_type: mimeType, data: base64 } },
          { text: buildExtractPrompt() }
        ]
      }],
      generationConfig: {
        response_mime_type: 'application/json',
        response_schema: EVENT_EXTRACT_SCHEMA
      }
    };

    const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + encodeURIComponent(key);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Gemini-Fehler ${res.status}: ${body.slice(0, 300)}`);
    }
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Leere Antwort von Gemini');
    let parsed;
    try { parsed = JSON.parse(text); }
    catch (err) { throw new Error('Konnte JSON-Antwort nicht parsen: ' + err.message); }
    return Array.isArray(parsed.events) ? parsed.events : [];
  }

  if (isReviewer()) {
    btnPhotoScan.classList.remove('hidden');
  }

  function resetPhotoScan() {
    lastPhotoBase64 = null;
    lastExtractedEvents = null;
    if (photoScanInput) photoScanInput.value = '';
    if (photoScanPreview) {
      photoScanPreview.src = '';
      photoScanPreview.classList.add('hidden');
    }
    if (photoScanStatus) {
      photoScanStatus.textContent = '';
      photoScanStatus.classList.remove('error');
    }
    if (btnPhotoExtract) btnPhotoExtract.classList.add('hidden');
  }

  function compressImageToBase64(file, opts) {
    const maxWidth = (opts && opts.maxWidth) || 800;
    const quality = (opts && opts.quality) || 0.8;
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Datei konnte nicht gelesen werden'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('Bild konnte nicht dekodiert werden'));
        img.onload = () => {
          const scale = Math.min(1, maxWidth / img.width);
          const w = Math.round(img.width * scale);
          const h = Math.round(img.height * scale);
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);
          resolve({
            dataUrl: canvas.toDataURL('image/jpeg', quality),
            width: w,
            height: h,
          });
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  btnPhotoScan.addEventListener('click', () => photoScanInput.click());

  photoScanInput.addEventListener('change', async () => {
    const file = photoScanInput.files && photoScanInput.files[0];
    if (!file) return;
    photoScanStatus.classList.remove('error');
    photoScanStatus.textContent = 'Komprimiere …';
    try {
      const { dataUrl, width, height } = await compressImageToBase64(file);
      lastPhotoBase64 = dataUrl;
      const sizeKb = Math.round((dataUrl.length * 0.75) / 1024);
      photoScanPreview.src = dataUrl;
      photoScanPreview.classList.remove('hidden');
      photoScanStatus.textContent = `✓ ${width}×${height} px · ${sizeKb} KB`;
      btnPhotoExtract.classList.remove('hidden');
    } catch (err) {
      lastPhotoBase64 = null;
      photoScanStatus.classList.add('error');
      photoScanStatus.textContent = '✗ ' + err.message;
    }
  });

  btnPhotoExtract.addEventListener('click', async () => {
    if (!lastPhotoBase64) return;
    photoScanStatus.classList.remove('error');
    photoScanStatus.textContent = 'Analysiere Bild mit Gemini …';
    btnPhotoExtract.disabled = true;
    try {
      const eventsExtracted = await extractEventDataFromImage(lastPhotoBase64);
      lastExtractedEvents = eventsExtracted;
      console.log('[photo-extract] Gefundene Events:', eventsExtracted);
      if (eventsExtracted.length === 0) {
        photoScanStatus.textContent = '⚠ Kein Event erkannt — Felder bitte manuell ausfüllen.';
      } else if (eventsExtracted.length === 1) {
        photoScanStatus.textContent = `✓ 1 Event erkannt. (Formular-Befüllung folgt im nächsten Schritt.)`;
      } else {
        photoScanStatus.textContent = `✓ ${eventsExtracted.length} Events erkannt. (Auswahl folgt im nächsten Schritt.)`;
      }
    } catch (err) {
      lastExtractedEvents = null;
      photoScanStatus.classList.add('error');
      photoScanStatus.textContent = '✗ ' + err.message;
      console.error('[photo-extract]', err);
    } finally {
      btnPhotoExtract.disabled = false;
    }
  });

  // --- Review Modal ---

  function renderReviewSummary() {
    const remaining = getUnreviewedEvents().length;
    const total = pendingSocialEvents.length;
    reviewSummary.innerHTML =
      `<span class="import-summary-pill ok">${remaining} ungeprüft</span>` +
      `<span class="import-summary-pill">${total - remaining} bereits bearbeitet</span>`;
    reviewRemainingCount.textContent = `${remaining} verbleibend`;
  }

  function renderReviewEventCard(ev) {
    const fallback = pickFallback(ev.category, ev.id || ev.title);
    const img = ev.image || fallback;
    // Dedup-Hinweis gegen den aktuell gerenderten Event-Pool. Best Match zuerst.
    const dupes = window.EventDedup
      ? window.EventDedup.findPotentialDuplicates(
          { title: ev.title, date: ev.date, locationName: ev.locationName },
          events
        )
      : [];
    const dupeBadge = dupes.length > 0
      ? `<span class="import-summary-pill warn" title="${escapeHtml(dupes[0].reason)}">🔁 Möglicher Duplikat: „${escapeHtml(dupes[0].event.title)}"</span>`
      : '';
    return `
      <div class="import-event-card" data-event-id="${escapeHtml(ev.id)}">
        <span></span>
        <img class="import-event-image" src="${escapeHtml(img)}" alt="${escapeHtml(ev.title)}"
             onerror="this.onerror=null;this.src=${escapeHtml(JSON.stringify(fallback))}" />
        <div class="import-event-body">
          <p class="import-event-title">${escapeHtml(ev.title)}</p>
          ${dupeBadge}
          <div class="import-event-meta">
            <span>📅 ${escapeHtml(ev.date)}${ev.time ? ' · ' + escapeHtml(ev.time) : ''}</span>
            <span>📍 ${escapeHtml(ev.locationName)} (${escapeHtml(ev.municipality)})</span>
            <span>🏷 ${escapeHtml(getCategoryLabel(ev.category) || ev.category)}</span>
            <span>📷 ${escapeHtml(ev.sourcePlatform || 'Other')}</span>
            ${ev.sourceUrl ? `<a href="${escapeHtml(ev.sourceUrl)}" target="_blank" rel="noopener noreferrer">Quelle ansehen ↗</a>` : ''}
          </div>
          <p class="import-event-description">${escapeHtml(ev.description)}</p>
          <div class="review-event-action-row">
            <button type="button" class="btn btn-secondary btn-approve" data-action="approve">✓ Übernehmen</button>
            <button type="button" class="btn btn-secondary btn-skip" data-action="skip">✗ Ablehnen</button>
          </div>
        </div>
        <span></span>
      </div>
    `;
  }

  function renderReviewList() {
    const items = getUnreviewedEvents();
    if (items.length === 0) {
      reviewEventList.innerHTML = '<p style="text-align:center;opacity:0.7;padding:2rem;">Alle Events geprüft. 🎉</p>';
    } else {
      reviewEventList.innerHTML = items.map(renderReviewEventCard).join('');
    }
    if (window.lucide) window.lucide.createIcons();
    renderReviewSummary();
  }

  function openReviewModal() {
    renderReviewList();
    reviewModal.classList.remove('hidden');
  }

  function closeReviewModal() {
    reviewModal.classList.add('hidden');
  }

  function approveReviewEvent(eventId) {
    const ev = pendingSocialEvents.find(e => e.id === eventId);
    if (!ev) return;

    // Dedup-Check vor dem Übernehmen — sanftes Confirm, User kann durchwinken
    if (!confirmIfDuplicate({ title: ev.title, date: ev.date, locationName: ev.locationName }, events)) {
      return;
    }

    // Build internal event format (matches buildEventFromImport from import-feature)
    const importLike = {
      title: ev.title,
      date: ev.date,
      time: ev.time,
      municipality: ev.municipality,
      locationName: ev.locationName,
      category: ev.category,
      description: ev.description,
      sourceUrl: ev.sourceUrl || '',
      sourcePlatform: ev.sourcePlatform || 'Other',
      imageUrl: ev.image,
      lat: ev.lat,
      lng: ev.lng,
      ticketUrl: ev.ticketUrl,
      organizerUrl: ev.organizerUrl,
      locationApproximated: ev.lat == null || ev.lng == null
    };
    // If lat/lng missing, fall back to municipality center
    if (importLike.lat == null || importLike.lng == null) {
      const center = REGION_CENTERS[ev.municipality];
      if (center) {
        importLike.lat = center.lat;
        importLike.lng = center.lng;
      }
    }

    const newEvent = buildEventFromImport(importLike);

    // Persist to chur_events_custom
    const saved = localStorage.getItem('chur_events_custom');
    let customEvents = [];
    if (saved) {
      try { customEvents = JSON.parse(saved); } catch { customEvents = []; }
    }
    customEvents.push(newEvent);
    try {
      localStorage.setItem('chur_events_custom', JSON.stringify(customEvents));
    } catch (err) {
      alert('Speicher voll: ' + err.message);
      return;
    }

    events.unshift(newEvent);
    reviewedIds.add(eventId);
    persistReviewedIds();
    filterEvents();
    renderReviewList();
    updateBanner();
  }

  function skipReviewEvent(eventId) {
    reviewedIds.add(eventId);
    persistReviewedIds();
    renderReviewList();
    updateBanner();
  }

  // Click delegation
  reviewEventList.addEventListener('click', (e) => {
    const card = e.target.closest('.import-event-card');
    if (!card) return;
    const eventId = card.dataset.eventId;
    const action = e.target.dataset.action || e.target.closest('[data-action]')?.dataset.action;
    if (action === 'approve') approveReviewEvent(eventId);
    else if (action === 'skip') skipReviewEvent(eventId);
  });

  // Wiring
  btnReviewOpen.addEventListener('click', openReviewModal);
  reviewModalClose.addEventListener('click', closeReviewModal);
  btnReviewCloseModal.addEventListener('click', closeReviewModal);
  reviewModal.addEventListener('click', (e) => {
    if (e.target === reviewModal) closeReviewModal();
  });
});
