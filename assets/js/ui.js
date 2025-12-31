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

export const toggle5yrPlotBtn  = document.getElementById('toggle-5yr-plot');

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

// We'll create our PlotUpdater instance later
let plotUpdater = null;

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

    if (activeLocation && activeLocation.ui.map.lastPos && activeLocation.ui.map.lastZoom) {
      const coords = activeLocation.ui.map.lastPos.split(',');
      const lat = parseFloat(coords[0]);
      const lon = parseFloat(coords[1]);
      map.setView([lat, lon], parseInt(activeLocation.ui.map.lastZoom));
      if (activeLocation.coordinates) {
        selectedLatLng = { lat: activeLocation.coordinates.lat, lng: activeLocation.coordinates.lon };
        if (marker) {
          map.removeLayer(marker);
        }
        marker = L.marker([selectedLatLng.lat, selectedLatLng.lng]).addTo(map);
      }
    } else if (activeLocation && activeLocation.coordinates) {
      map.setView([activeLocation.coordinates.lat, activeLocation.coordinates.lon], 12);
      selectedLatLng = { lat: activeLocation.coordinates.lat, lng: activeLocation.coordinates.lon };
      marker = L.marker([selectedLatLng.lat, selectedLatLng.lng]).addTo(map);
    }
  } else {
    // If map already exists, just refresh sizing
    setTimeout(() => {
      map.invalidateSize();
      if (activeLocation && activeLocation.coordinates) {
        map.setView(
          [activeLocation.coordinates.lat, activeLocation.coordinates.lon],
          parseInt(activeLocation.ui.map.lastZoom) || map.getZoom()
        );
        if (marker) {
          map.removeLayer(marker);
        }
        marker = L.marker([activeLocation.coordinates.lat, activeLocation.coordinates.lon]).addTo(map);
        selectedLatLng = { lat: activeLocation.coordinates.lat, lng: activeLocation.coordinates.lon };
      } else {
        if (marker) {
          map.removeLayer(marker);
          marker = null;
        }
        selectedLatLng = null;
      }
    }, 100);
  }
};

/**
 * Saves the currently selected map location back to #ort + localStorage
 */
window.saveMapSelection = () => {
  console.log("[DEBUG] saveMapSelection() => if user selectedLatLng=", selectedLatLng);
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
      });
    }
    if (plotUpdater) {
      plotUpdater.run();
    }
  }
  const mapPopup = document.getElementById('map-popup');
  mapPopup.style.display = 'none';
};
