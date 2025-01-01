/**
 * @module ui
 * Funktionen für UI-Interaktionen, DOM-Referenzen, Anzeigen/Verstecken von Elementen
 */

import { fetchHistoricalData, fetchRecentData } from './dataService.js';
import {
    calculateGTS,
    computeStartDate,
    getSelectedEndDate,
    build5YearData     // <-- multi-year GTS from logic.js
} from './logic.js';
import {
    plotData,
    plotDailyTemps,
    plotMultipleYearData  // <-- multi-year plotting
} from './charts.js';

// NEW: import our information module
import { updateHinweisSection } from './information.js';

export const ortInput = document.getElementById('ort');
export const datumInput = document.getElementById('datum');
export const zeitraumSelect = document.getElementById('zeitraum');
export const berechnenBtn = document.getElementById('berechnen-btn');

export const ortKarteBtn = document.getElementById('ort-karte-btn');
export const mapCloseBtn = document.getElementById('map-close-btn');
export const mapSaveBtn = document.getElementById('map-save-btn');

export const datumPlusBtn = document.getElementById('datum-plus');
export const datumMinusBtn = document.getElementById('datum-minus');
export const datumHeuteBtn = document.getElementById('datum-heute');

export const toggleGtsPlotBtn = document.getElementById('toggle-gts-plot');
export const gtsPlotContainer = document.getElementById('gts-plot-container');

export const toggle5yrPlotBtn = document.getElementById('toggle-5yr-plot');

export const toggleTempPlotBtn = document.getElementById('toggle-temp-plot');
export const tempPlotContainer = document.getElementById('temp-plot-container');

// The main "Ergebnis" paragraph
const ergebnisTextEl = document.getElementById('ergebnis-text');

// Keep references to Chart.js objects
let chartGTS = null;
let chartTemp = null;

// Arrays for daily temps in the current [plotStart..endDate] window
let filteredTempsDates = [];
let filteredTempsData = [];

// Leaflet map references
let map = null;
let marker = null;
let selectedLatLng = null;

/**
 * Initializes or updates the Leaflet map overlay.
 */
window.initOrUpdateMap = () => {
    console.log("[DEBUG] initOrUpdateMap() called.");
    if (!map) {
        console.log("[DEBUG] Creating a new Leaflet map instance...");
        map = L.map('map').setView([51.1657, 10.4515], 6);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap-Mitwirkende'
        }).addTo(map);

        map.on('click', (e) => {
            console.log("[DEBUG] Map clicked at:", e.latlng);
            if (marker) {
                map.removeLayer(marker);
            }
            marker = L.marker(e.latlng).addTo(map);
            selectedLatLng = e.latlng;
            console.log("[DEBUG] Marker set at:", selectedLatLng, "=> updatePlots()");
            updatePlots();
        });

        // Restore last map position/zoom
        const lastPos = localStorage.getItem("lastPos");
        const lastZoom = localStorage.getItem("lastZoom");
        if (lastPos && lastZoom) {
            const coords = lastPos.split(',');
            const lat = parseFloat(coords[0]);
            const lon = parseFloat(coords[1]);
            console.log("[DEBUG] Setting map to lastPos=", lat, lon, "zoom=", lastZoom);
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
                console.log("[DEBUG] Marker re-added at lastLoc:", selectedLatLng);
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
                map.setView([latSaved, lonSaved], parseInt(localStorage.getItem("lastZoom")) || map.getZoom());
                if (marker) {
                    map.removeLayer(marker);
                }
                marker = L.marker([latSaved, lonSaved]).addTo(map);
                selectedLatLng = {lat: latSaved, lng: lonSaved};
                console.log("[DEBUG] initOrUpdateMap() => re-positioned marker + map to last known location.");
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
        console.log("[DEBUG] Saved lastLocation=", locString, "=> updatePlots()");
        updatePlots();
    }
    const mapPopup = document.getElementById('map-popup');
    mapPopup.style.display = 'none';
};

/**
 * Core function to fetch data, build GTS/Temp plots, and update #ergebnis-text
 * Checks if user selected "past 5 years" in main.js (window.showFiveYear).
 */
export async function updatePlots() {
    console.log("[DEBUG ui.js] updatePlots() => Start. #datum=", datumInput.value);

    const ortVal = ortInput.value;
    console.log("[DEBUG ui.js] ortVal=", ortVal);

    // 1) Wenn keine lat/lon => Ergebnisse löschen
    if (!ortVal.includes("Lat") || !ortVal.includes("Lon")) {
        console.log("[DEBUG ui.js] No lat/lon => clearing text + destroying charts.");
        ergebnisTextEl.textContent = "Die Grünland-Temperatur-Summe wird berechnet wenn ein Ort ausgewählt ist.";
        if (chartGTS) {
            chartGTS.destroy();
            chartGTS = null;
        }
        if (chartTemp) {
            chartTemp.destroy();
            chartTemp = null;
        }
        // Auch den hinweis-section leeren
        const hinweisSection = document.querySelector(".hinweis-section");
        if (hinweisSection) {
          hinweisSection.innerHTML = `<h2>Imkerliche Information</h2>
            <p style="color: grey;">Kein Standort definiert.</p>`;
        }
        return;
    }

    // 2) Lokales "Heute" um 12:00 Uhr erstellen
    const now = new Date();
    const localTodayNoon = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      12, 0, 0, 0
    );
    console.log("[DEBUG ui.js] localTodayNoon =>", localTodayNoon.toISOString());

    // 3) Enddatum auf Basis der Benutzerauswahl holen
    const endDate = getSelectedEndDate();
    console.log("[DEBUG ui.js] endDate =>", endDate.toISOString());

    // Wenn das gewählte Datum in der Zukunft liegt, korrigiere es
    if (endDate.getTime() > localTodayNoon.getTime()) {
        console.log("[DEBUG ui.js] endDate ist nach localTodayNoon => Benutzer hat ein zukünftiges Datum gewählt => Alert + Korrektur");
        alert("Das Datum darf nicht in der Zukunft liegen.");
        // Korrigiere #datum auf localTodayNoon
        datumInput.value = localTodayNoon.toISOString().split('T')[0];
        datumInput.max   = localTodayNoon.toISOString().split('T')[0];
        return;
    }

    // 4) Latitude und Longitude parsen
    const parts = ortVal.split(',');
    const latPart = parts[0].split(':')[1];
    const lonPart = parts[1].split(':')[1];
    const lat = parseFloat(latPart.trim());
    const lon = parseFloat(lonPart.trim());
    console.log("[DEBUG ui.js] parse lat=", lat, "lon=", lon);

    // 5) Datumsbereich für die Benutzerauswahl bestimmen
    const today = new Date();
    const differenceInDays = Math.floor((today - endDate) / (1000 * 3600 * 24));
    const plotStartDate = computeStartDate();
    console.log("[DEBUG ui.js] differenceInDays=", differenceInDays,
                "plotStartDate=", plotStartDate.toISOString().split('T')[0]);

    // Historische Daten ab dem 1. Januar des Jahres des Enddatums
    const fetchStartDate = new Date(endDate.getFullYear(), 0, 1, 12, 0, 0, 0);
    const recentStartDate = new Date(endDate);
    recentStartDate.setDate(recentStartDate.getDate() - 30);

    console.log("[DEBUG ui.js] fetchStartDate=", fetchStartDate.toISOString().split('T')[0],
        "recentStartDate=", recentStartDate.toISOString().split('T')[0]);

    try {
        // 6) Historische Daten abrufen
        console.log("[DEBUG ui.js] fetchHistoricalData(",
            fetchStartDate.toISOString().split('T')[0], "->", endDate.toISOString().split('T')[0], ")");
        const histData = await fetchHistoricalData(lat, lon, fetchStartDate, endDate);

        const histDates = histData.daily.time;
        const histTemps = histData.daily.temperature_2m_mean;

        // Kombinieren mit aktuellen Daten, wenn differenceInDays <= 10
        let dataByDate = {};
        if (differenceInDays > 10) {
            console.log("[DEBUG ui.js] differenceInDays>10 => nur historische Daten verwenden");
            for (let i = 0; i < histDates.length; i++) {
                dataByDate[histDates[i]] = histTemps[i];
            }
        } else {
            console.log("[DEBUG ui.js] differenceInDays<=10 => auch aktuelle Daten abrufen");
            const recentData = await fetchRecentData(lat, lon, recentStartDate, endDate);
            const recentDates = recentData.daily.time;
            const recentTemps = recentData.daily.temperature_2m_mean;
            for (let i = 0; i < histDates.length; i++) {
                dataByDate[histDates[i]] = histTemps[i];
            }
            for (let i = 0; i < recentDates.length; i++) {
                dataByDate[recentDates[i]] = recentTemps[i];
            }
        }

        // 7) Daten sortieren und mappen
        const allDates = Object.keys(dataByDate).sort((a,b) => new Date(a) - new Date(b));
        const allTemps = allDates.map(d => dataByDate[d]);
        console.log("[DEBUG ui.js] kombiniertes allDates.length=", allDates.length);

        if (allTemps.length === 0) {
            console.log("[DEBUG ui.js] Keine Temperaturdaten gefunden => Alert + Rückkehr");
            alert("Keine Daten gefunden. Anderen Ort oder anderes Datum wählen.");
            return;
        }

        // 8) GTS-Ergebnisse für den gesamten Bereich berechnen
        const gtsResults = calculateGTS(allDates, allTemps);
        console.log("[DEBUG ui.js] gtsResults.length=", gtsResults.length);

        // 9) GTS filtern für das Anzeige-Fenster [plotStartDate..endDate]
        const filteredResults = gtsResults.filter(r => {
            const d = new Date(r.date);
            return (d >= plotStartDate && d <= endDate);
        });
        console.log("[DEBUG ui.js] filteredResults.length=", filteredResults.length);

        // 10) Überprüfung, ob filteredResults leer ist
        const formattedDate = endDate.toLocaleDateString('de-DE'); // Verschiebe die Deklaration hierhin
        if (filteredResults.length === 0) {
            ergebnisTextEl.innerHTML = `
                <span style="color: #700000;">
                Die Grünland-Temperatur-Summe konnte am ${formattedDate} nicht berechnet werden, da für eine "Summe" noch keine Daten zur Verfügung stehen 😉.
                </span>
            `;
            console.log("[DEBUG ui.js] Keine Daten zum Aufsummieren vorhanden. Ergebnistext aktualisiert.");

            // Option: Alte Diagramme zerstören, falls vorhanden
            if (chartGTS) {
                console.log("[DEBUG ui.js] Zerstöre altes chartGTS...");
                chartGTS.destroy();
                chartGTS = null;
            }
            if (chartTemp) {
                console.log("[DEBUG ui.js] Zerstöre altes chartTemp...");
                chartTemp.destroy();
                chartTemp = null;
            }

            // Option: Andere relevante Abschnitte aktualisieren oder leeren
            const hinweisSection = document.querySelector(".hinweis-section");
            if (hinweisSection) {
                hinweisSection.innerHTML = `<h2>Imkerliche Information</h2>
                    <p style="color: grey;">Keine ausreichenden Daten zur Berechnung vorhanden.</p>`;
            }

            return; // Beende die Funktion frühzeitig
        }

        // 11) Gefilterte GTS-Ergebnisse fortsetzen
        // Filter tägliche Temperaturen für die Anzeige
        filteredTempsDates = [];
        filteredTempsData = [];
        for (let i = 0; i < allDates.length; i++) {
            const d = new Date(allDates[i]);
            if (d >= plotStartDate && d <= endDate) {
                filteredTempsDates.push(allDates[i]);
                filteredTempsData.push(allTemps[i]);
            }
        }
        console.log("[DEBUG ui.js] filteredTempsDates.length=", filteredTempsDates.length);

        // 12) Ergebnistext aktualisieren
        const lastGTS = (gtsResults.length > 0) ? gtsResults[gtsResults.length - 1].gts : 0;
        const localTodayStr = new Date().toLocaleDateString('de-DE');

        let dateColor = "#802020";
        let dateWeight = "bold";
        let betragen_str = "beträgt"; // Korrigierter Standardwert

        if (formattedDate === localTodayStr) {
            // Wenn das gewählte Datum genau "heute" ist => Präsens
            dateColor = "#206020";
            betragen_str = "beträgt";
        } else {
            betragen_str = "betrug"; // Vergangenheitsform für frühere Daten
        }

        ergebnisTextEl.innerHTML = `
            <span style="font-weight: normal; color: #202020;">Die Grünland-Temperatur-Summe am </span>
            <span style="font-weight: ${dateWeight}; color: ${dateColor};">${formattedDate}</span>
            <span style="font-weight: normal; color: #202020;"> ${betragen_str} </span>
            <span style="font-weight: bold; color: darkgreen;">${lastGTS.toFixed(1)}</span>°
        `;
        console.log("[DEBUG ui.js] ergebnisTextEl =>", ergebnisTextEl.innerText);

        // 13) Alte Diagramme zerstören, falls vorhanden
        if (chartGTS) {
            console.log("[DEBUG ui.js] Zerstöre altes chartGTS...");
            chartGTS.destroy();
            chartGTS = null;
        }
        if (chartTemp) {
            console.log("[DEBUG ui.js] Zerstöre altes chartTemp...");
            chartTemp.destroy();
            chartTemp = null;
        }

        // 14) GTS Diagramm erstellen => Single-Year oder Multi-Year
        if (gtsPlotContainer.style.display !== 'none') {
            if (window.showFiveYear) {
                console.log("[DEBUG ui.js] showFiveYear => multi-year overlay chart erstellen...");
                const multiYearData = await build5YearData(lat, lon, plotStartDate, endDate);
                chartGTS = plotMultipleYearData(multiYearData);
            } else {
                console.log("[DEBUG ui.js] single-year => plotData(filteredResults)");
                chartGTS = plotData(filteredResults);
            }
        } else {
            console.log("[DEBUG ui.js] gtsPlotContainer ist verborgen => überspringe Erstellung des GTS-Diagramms.");
        }

        // 15) Temperaturdiagramm erstellen, falls benötigt
        if (tempPlotContainer.style.display !== 'none') {
            console.log("[DEBUG ui.js] Temperaturdiagramm wird erstellt => plotDailyTemps()");
            chartTemp = plotDailyTemps(filteredTempsDates, filteredTempsData);
        } else {
            console.log("[DEBUG ui.js] tempPlotContainer ist verborgen => überspringe Erstellung des Temperaturdiagramms.");
        }

        // 16) Aktualisiere den Hinweis-Abschnitt mit der Vorhersagelogik
        await updateHinweisSection(gtsResults, endDate);

        console.log("[DEBUG ui.js] updatePlots() => Fertig.");
    }
    catch (err) {
        console.log("[DEBUG ui.js] => Caught error:", err);
    }
}
