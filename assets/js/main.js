/**
 * @module main
 * Führt alle Teilmodule zusammen, setzt Event-Listener,
 * triggert initiale Datenabfragen und Initialisierungen.
 */

import { updatePlots, ortInput, datumInput, zeitraumSelect, berechnenBtn, ortKarteBtn, mapCloseBtn, mapSaveBtn, datumPlusBtn, datumMinusBtn, toggleTempPlotBtn } from './ui.js';
import { getSelectedEndDate } from './logic.js';

document.addEventListener("DOMContentLoaded", () => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const todayStr = `${yyyy}-${mm}-${dd}`;
    datumInput.value = todayStr;
    datumInput.max = todayStr;

    const lastLoc = localStorage.getItem("lastLocation");
    if (lastLoc) {
        ortInput.value = lastLoc;
        // Erste Plots, wenn letzter Ort bekannt
        updatePlots();
    }
});

// Event-Listener registrieren
ortInput.addEventListener('change', updatePlots);
zeitraumSelect.addEventListener('change', updatePlots);
datumInput.addEventListener('change', updatePlots);
berechnenBtn.addEventListener('click', updatePlots);
datumPlusBtn.addEventListener('click', () => {
    const current = new Date(datumInput.value);
    current.setDate(current.getDate() + 1);
    const now = new Date();
    if (current > now) {
        // Falls in Zukunft, zurücksetzen
        current.setDate(current.getDate() - 1);
    }
    datumInput.value = current.toISOString().split('T')[0];
    updatePlots();
});
datumMinusBtn.addEventListener('click', () => {
    const current = new Date(datumInput.value);
    current.setDate(current.getDate() - 1);
    datumInput.value = current.toISOString().split('T')[0];
    updatePlots();
});

toggleTempPlotBtn.addEventListener('click', () => {
    // Temperaturplot an/aus toggeln
    const tempPlotContainer = document.getElementById('temp-plot-container');
    if (tempPlotContainer.style.display === 'none') {
        tempPlotContainer.style.display = 'block';
        toggleTempPlotBtn.textContent = 'Temperaturen ausblenden';
        // updatePlots wird aufgerufen um sicherzustellen,
        // dass der Temperaturplot angezeigt wird (sofern Daten vorhanden sind)
        updatePlots();
    } else {
        tempPlotContainer.style.display = 'none';
        toggleTempPlotBtn.textContent = 'Temperaturen anzeigen';
    }
});

// Karten-Logik z. B. in ui.js implementiert, hier nur Button-Events
ortKarteBtn.addEventListener('click', () => {
    // Karte anzeigen
    const mapPopup = document.getElementById('map-popup');
    mapPopup.style.display = 'block';
    // Init oder Update Karte
    window.initOrUpdateMap();
});

mapCloseBtn.addEventListener('click', () => {
    const mapPopup = document.getElementById('map-popup');
    mapPopup.style.display = 'none';
});

mapSaveBtn.addEventListener('click', () => {
    window.saveMapSelection();
});
