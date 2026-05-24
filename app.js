/**
 * ChurEvents - Application Logic
 */

document.addEventListener('DOMContentLoaded', () => {
  // --- State Variables ---
  let events = [];
  let favorites = new Set();
  let currentCategory = 'all';
  let currentRegion = 'all';
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

  const FALLBACK_IMAGES = {
    music: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&q=80&w=800',
    stage: 'https://images.unsplash.com/photo-1460661419201-fd4cecdf8a8b?auto=format&fit=crop&q=80&w=800',
    markets: 'https://images.unsplash.com/photo-1533900298318-6b8da08a523e?auto=format&fit=crop&q=80&w=800',
    family: 'https://images.unsplash.com/photo-1471286174890-9c112ffca5b4?auto=format&fit=crop&q=80&w=800',
    sport: 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?auto=format&fit=crop&q=80&w=800'
  };

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

    // CartoDB Dark Matter tiles (perfectly fits our dark design)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
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
      marker.on('popupopen', () => {
        lucide.createIcons();
        const detailsBtn = document.querySelector('.popup-details-btn');
        if (detailsBtn) {
          detailsBtn.addEventListener('click', (e) => {
            const id = parseInt(e.target.getAttribute('data-id'));
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
    const activeCard = document.querySelector(`.event-card[data-id="${id}"]`);
    if (activeCard) {
      activeCard.classList.add('active-card');
      activeCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function removeEventCardHighlight() {
    if (activeCardId !== null) {
      const activeCard = document.querySelector(`.event-card[data-id="${activeCardId}"]`);
      if (activeCard) {
        activeCard.classList.remove('active-card');
      }
      activeCardId = null;
    }
  }

  // --- Rendering UI ---
  function renderEventCards(filteredEvents) {
    eventsGrid.innerHTML = '';
    
    if (filteredEvents.length === 0) {
      emptyState.classList.remove('hidden');
      resultsCount.textContent = '0 Events gefunden';
      eventCountMobile.textContent = '0';
      return;
    }

    emptyState.classList.add('hidden');
    resultsCount.textContent = `${filteredEvents.length} Event${filteredEvents.length === 1 ? '' : 's'} gefunden`;
    eventCountMobile.textContent = filteredEvents.length;

    filteredEvents.forEach(event => {
      const isFav = favorites.has(event.id);
      const categoryLabel = getCategoryLabel(event.category);
      const iconName = getCategoryIcon(event.category);

      const card = document.createElement('div');
      card.className = `event-card ${activeCardId === event.id ? 'active-card' : ''}`;
      card.setAttribute('data-id', event.id);

      card.innerHTML = `
        <div class="card-image-wrapper">
          <img src="${event.image || FALLBACK_IMAGES[event.category]}" alt="${event.title}">
          <span class="category-badge ${event.category}">${categoryLabel}</span>
          <button class="btn-fav ${isFav ? 'favorited' : ''}" title="Als Favorit speichern" data-id="${event.id}">
            <i data-lucide="heart"></i>
          </button>
        </div>
        <div class="card-content">
          <div class="card-date-row">
            <i data-lucide="calendar" style="width:14px;height:14px;"></i>
            <span>${formatDateString(event.date)}</span>
          </div>
          <h3 class="card-title">${event.title}</h3>
          <p class="card-description">${event.description}</p>
          <div class="card-footer">
            <div class="card-footer-item">
              <i data-lucide="map-pin"></i>
              <span>${event.locationName}${event.municipality && event.municipality !== 'Chur' ? ` (${event.municipality})` : ''}</span>
            </div>
            <div class="card-footer-item">
              <i data-lucide="tag"></i>
              <span>${event.price}</span>
            </div>
          </div>
        </div>
      `;

      // Event Card Clicks
      card.addEventListener('click', (e) => {
        // Prevent trigger if clicking favorite button
        if (e.target.closest('.btn-fav')) return;
        
        // Open details modal
        openEventDetails(event.id);
        
        // Focus marker on map
        const marker = markers[event.id];
        if (marker) {
          map.setView([event.lat, event.lng], 15);
          marker.openPopup();
        }
      });

      // Favorite button listener
      const favBtn = card.querySelector('.btn-fav');
      favBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFavorite(event.id);
      });

      eventsGrid.appendChild(card);
    });

    // Re-initialize Lucide Icons for dynamic content
    lucide.createIcons();
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
        event.description.toLowerCase().includes(query) ||
        event.locationName.toLowerCase().includes(query)
      );
    }

    // Sort by date (ascending)
    filtered.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Render components
    renderEventCards(filtered);
    updateMapMarkers(filtered);
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
        <img src="${event.image || FALLBACK_IMAGES[event.category]}" alt="${event.title}">
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

    // New event object
    const newEvent = {
      id: Date.now(), // Generate simple unique ID
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
      image: imageInput || FALLBACK_IMAGES[category],
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
  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    if (searchQuery.length > 0) {
      searchClearBtn.classList.remove('hidden');
    } else {
      searchClearBtn.classList.add('hidden');
    }
    filterEvents();
  });

  searchClearBtn.addEventListener('click', () => {
    searchInput.value = '';
    searchQuery = '';
    searchClearBtn.classList.add('hidden');
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
});
