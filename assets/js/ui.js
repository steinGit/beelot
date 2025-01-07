/**
 * @module ui
 * UI-Interaktionen, DOM-Referenzen, Anzeigen/Verstecken von Elementen
 */

import { PlotUpdater } from './plotUpdater.js'; // <-- new import

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

// The main "Ergebnis" paragraph
const ergebnisTextEl = document.getElementById('ergebnis-text');

// Leaflet map references
let map = null;
let marker = null;
let selectedLatLng = null;

// We'll create our PlotUpdater instance later
let plotUpdater = null;

/**
 * Initializes or updates the Leaflet map overlay.
 */
window.initOrUpdateMap = () => {
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

    // Restore last map position/zoom
    const lastPos = localStorage.getItem("lastPos");
    const lastZoom = localStorage.getItem("lastZoom");
    if (lastPos && lastZoom) {
      const coords = lastPos.split(',');
      const lat = parseFloat(coords[0]);
      const lon = parseFloat(coords[1]);
      map.setView([lat, lon], parseInt(lastZoom));
      const lastLoc = localStorage.getItem("lastLocation");
      if (lastLoc && lastLoc.includes("Lat") && lastLoc.includes("Lon")) {
        const parts = lastLoc.split(',');
        const latPart = parts[0].split(':')[1];
        const lonPart = parts[1].split(':')[1];
        const latSaved = parseFloat(latPart.trim());
        const lonSaved = parseFloat(lonPart.trim());
        selectedLatLng = {lat: latSaved, lng: lonSaved};
        if (marker) {
          map.removeLayer(marker);
        }
        marker = L.marker([latSaved, lonSaved]).addTo(map);
      }
    }
  } else {
    // If map already exists, just refresh sizing
    setTimeout(() => {
      map.invalidateSize();
      const lastLoc = localStorage.getItem("lastLocation");
      if (lastLoc) {
        const parts = lastLoc.split(',');
        const latPart = parts[0].split(':')[1];
        const lonPart = parts[1].split(':')[1];
        const latSaved = parseFloat(latPart.trim());
        const lonSaved = parseFloat(lonPart.trim());
        map.setView(
          [latSaved, lonSaved],
          parseInt(localStorage.getItem("lastZoom")) || map.getZoom()
        );
        if (marker) {
          map.removeLayer(marker);
        }
        marker = L.marker([latSaved, lonSaved]).addTo(map);
        selectedLatLng = { lat: latSaved, lng: lonSaved };
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
    const locString = `Lat: ${selectedLatLng.lat.toFixed(5)}°, Lon: ${selectedLatLng.lng.toFixed(5)}°`;
    ortInput.value = locString;
    localStorage.setItem("lastLocation", locString);
    localStorage.setItem("lastPos", `${map.getCenter().lat},${map.getCenter().lng}`);
    localStorage.setItem("lastZoom", map.getZoom());
    if (plotUpdater) {
      plotUpdater.run();
    }
  }
  const mapPopup = document.getElementById('map-popup');
  mapPopup.style.display = 'none';
};


