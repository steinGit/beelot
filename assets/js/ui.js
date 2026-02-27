/**
 * @module ui
 * UI-Interaktionen, DOM-Referenzen, Anzeigen/Verstecken von Elementen
 */

import { formatCoordinates, getActiveLocation, updateLocation } from './locationStore.js';

// DOM references
export const ortInput          = document.getElementById('ort');
export const datumInput        = document.getElementById('datum');
export const zeitraumSelect    = document.getElementById('zeitraum');
export const berechnenBtn      = document.getElementById('berechnen-btn');

export const ortKarteBtn       = document.getElementById('ort-karte-btn');
export const mapCloseBtn       = document.getElementById('map-close-btn');
export const mapSaveBtn        = document.getElementById('map-save-btn');

export const datumPlusBtn      = document.getElementById('datum-plus');
export const datumMinusBtn     = document.getElementById('datum-minus');
export const datumHeuteBtn     = document.getElementById('datum-heute');

export const toggleGtsPlotBtn  = document.getElementById('toggle-gts-plot');
export const gtsPlotContainer  = document.getElementById('gts-plot-container');

export const gtsRangeInputs = Array.from(document.querySelectorAll('input[name="gts-range"]'));
export const gtsColorInputs = Array.from(document.querySelectorAll('input[name="gts-color-scheme"]'));
export const standortSyncToggle = document.getElementById('standort-sync-toggle');

export const toggleTempPlotBtn = document.getElementById('toggle-temp-plot');
export const tempPlotContainer = document.getElementById('temp-plot-container');

export const locationNameOutput = document.getElementById('location-name');
export const locationTabsContainer = document.getElementById('location-tabs');
export const locationPanel = document.getElementById('location-panel');

// The main "Ergebnis" paragraph
const ergebnisTextEl = document.getElementById('ergebnis-text');

// Leaflet map references
let map = null;
let marker = null;
let selectedLatLng = null;
const GLOBAL_MAP_VIEW_KEY = "beelotLastMapView";
const DEFAULT_ADDRESS_VIEWPORT_METERS = 1000;
const METERS_PER_DEGREE_LAT = 111320;

// We'll create our PlotUpdater instance later
let plotUpdater = null;

function parseStoredPosition(lastPos) {
  if (typeof lastPos !== "string" || !lastPos.includes(",")) {
    return null;
  }
  const coords = lastPos.split(",");
  const lat = parseFloat(coords[0]);
  const lon = parseFloat(coords[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }
  return { lat, lon };
}

function setMarkerForLocation(lat, lon) {
  if (!map) {
    return;
  }
  selectedLatLng = { lat, lng: lon };
  if (marker) {
    map.removeLayer(marker);
  }
  marker = L.marker([lat, lon]).addTo(map);
}

function clearMarkerSelection() {
  selectedLatLng = null;
  if (map && marker) {
    map.removeLayer(marker);
    marker = null;
  }
}

function applyAddressViewport(lat, lon, viewportMeters) {
  if (!map) {
    return;
  }
  const meters = Number.isFinite(viewportMeters) && viewportMeters > 0
    ? viewportMeters
    : DEFAULT_ADDRESS_VIEWPORT_METERS;
  const halfMeters = meters / 2;
  const latHalfDelta = halfMeters / METERS_PER_DEGREE_LAT;
  const cosLat = Math.cos((lat * Math.PI) / 180);
  const lonHalfDelta = Math.abs(cosLat) < 1e-6
    ? latHalfDelta
    : halfMeters / (METERS_PER_DEGREE_LAT * cosLat);
  const southWest = [lat - latHalfDelta, lon - lonHalfDelta];
  const northEast = [lat + latHalfDelta, lon + lonHalfDelta];
  map.fitBounds([southWest, northEast], {
    animate: false,
    padding: [0, 0]
  });
  map.panTo([lat, lon], { animate: false });
}

function applyActiveLocationMapView(activeLocation) {
  if (!map) {
    return;
  }
  if (!activeLocation || !activeLocation.coordinates) {
    clearMarkerSelection();
    return;
  }

  const lat = activeLocation.coordinates.lat;
  const lon = activeLocation.coordinates.lon;
  const mapState = activeLocation.ui?.map || {};
  const viewportMeters = Number(mapState.addressViewportMeters);

  if (Number.isFinite(viewportMeters) && viewportMeters > 0) {
    applyAddressViewport(lat, lon, viewportMeters);
    setMarkerForLocation(lat, lon);
    updateLocation(activeLocation.id, (location) => {
      location.ui.map.lastPos = `${lat},${lon}`;
      location.ui.map.lastZoom = map.getZoom();
      location.ui.map.addressViewportMeters = null;
    });
    return;
  }

  const storedPos = parseStoredPosition(mapState.lastPos);
  const storedZoom = parseInt(mapState.lastZoom, 10);
  if (storedPos && Number.isFinite(storedZoom)) {
    map.setView([storedPos.lat, storedPos.lon], storedZoom);
  } else {
    map.setView([lat, lon], 12);
  }
  setMarkerForLocation(lat, lon);
}

/**
 * Initializes or updates the Leaflet map overlay.
 */
window.initOrUpdateMap = () => {
  const activeLocation = getActiveLocation();
  if (!map) {
    map = L.map('map').setView([51.1657, 10.4515], 6);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap-Mitwirkende'
    }).addTo(map);

    map.on('click', (e) => {
      if (marker) {
        map.removeLayer(marker);
      }
      marker = L.marker(e.latlng).addTo(map);
      selectedLatLng = e.latlng;
      // After choosing a location => re-run the plot logic
      if (plotUpdater) {
        plotUpdater.run();
      }
    });

    map.on('moveend', () => {
      const center = map.getCenter();
      localStorage.setItem(
        GLOBAL_MAP_VIEW_KEY,
        JSON.stringify({ lat: center.lat, lon: center.lng, zoom: map.getZoom() })
      );
    });

    // Restore last map position/zoom for active location
    const globalMapView = localStorage.getItem(GLOBAL_MAP_VIEW_KEY);
    if (globalMapView) {
      try {
        const parsed = JSON.parse(globalMapView);
        if (parsed && typeof parsed.lat === "number" && typeof parsed.lon === "number") {
          map.setView([parsed.lat, parsed.lon], parseInt(parsed.zoom, 10) || map.getZoom());
        }
      } catch (error) {
        console.warn("[ui.js] Failed to parse stored map view.", error);
      }
    }

    applyActiveLocationMapView(activeLocation);
  } else {
    // If map already exists, just refresh sizing
    setTimeout(() => {
      map.invalidateSize();
      applyActiveLocationMapView(activeLocation);
    }, 100);
  }
};

/**
 * Saves the currently selected map location back to #ort + localStorage
 */
window.saveMapSelection = () => {
  if (selectedLatLng) {
    const locString = formatCoordinates(selectedLatLng.lat, selectedLatLng.lng);
    ortInput.value = locString;
    const activeLocation = getActiveLocation();
    if (activeLocation) {
      updateLocation(activeLocation.id, (location) => {
        location.coordinates = {
          lat: selectedLatLng.lat,
          lon: selectedLatLng.lng
        };
        location.ui.map.lastPos = `${map.getCenter().lat},${map.getCenter().lng}`;
        location.ui.map.lastZoom = map.getZoom();
        location.ui.map.addressViewportMeters = null;
      });
    }
    if (plotUpdater) {
      plotUpdater.run();
    }
  }
  const mapPopup = document.getElementById('map-popup');
  mapPopup.style.display = 'none';
};
