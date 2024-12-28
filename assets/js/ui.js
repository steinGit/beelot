/**
 * @module ui
 * Funktionen für UI-Interaktionen, DOM-Referenzen, Anzeigen/Verstecken von Elementen
 */

import { fetchHistoricalData, fetchRecentData } from './dataService.js';
import {
    calculateGTS,
    computeStartDate,
    getSelectedEndDate,
    build5YearData     // <-- Import the multi-year builder
} from './logic.js';
import {
    plotData,
    plotDailyTemps,
    plotMultipleYearData  // <-- Import the multi-year plotting
} from './charts.js';

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
 * Uses local noon for date checks, ensuring "Datum darf nicht in der Zukunft liegen" 
 * only triggers if the chosen date is truly beyond today's local noon.
 */
export async function updatePlots() {
    console.log("[DEBUG ui.js] updatePlots() => Start. #datum=", datumInput.value);

    const ortVal = ortInput.value;
    console.log("[DEBUG ui.js] ortVal=", ortVal);

    // 1) If no lat/lon => clear results
    if (!ortVal.includes("Lat") || !ortVal.includes("Lon")) {
        console.log("[DEBUG ui.js] No lat/lon => clearing text + destroying charts.");
        ergebnisTextEl.textContent = "Grünlandtemperatursumme am [Datum] beträgt [GTS Ergebnis]";
        if (chartGTS) {
            chartGTS.destroy();
            chartGTS = null;
        }
        if (chartTemp) {
            chartTemp.destroy();
            chartTemp = null;
        }
        return;
    }

    // 2) Build a local noon version of "today" to avoid time-zone mismatch
    const now = new Date();
    const localTodayNoon = new Date(
      now.getFullYear(), 
      now.getMonth(), 
      now.getDate(), 
      12, 0, 0, 0
    );
    console.log("[DEBUG ui.js] localTodayNoon =>", localTodayNoon.toISOString());

    // 3) Get endDate in local noon
    const endDate = getSelectedEndDate(); 
    console.log("[DEBUG ui.js] endDate =>", endDate.toISOString());

    // If the user picks a date strictly beyond today's local noon => not allowed
    if (endDate.getTime() > localTodayNoon.getTime()) {
        console.log("[DEBUG ui.js] endDate is after localTodayNoon => user set future => alert + fix");
        alert("Das Datum darf nicht in der Zukunft liegen.");
        // Fix #datum to localTodayNoon
        datumInput.value = localTodayNoon.toISOString().split('T')[0];
        datumInput.max   = localTodayNoon.toISOString().split('T')[0];
        return;
    }

    // 4) Parse lat/lon
    const parts = ortVal.split(',');
    const latPart = parts[0].split(':')[1];
    const lonPart = parts[1].split(':')[1];
    const lat = parseFloat(latPart.trim());
    const lon = parseFloat(lonPart.trim());
    console.log("[DEBUG ui.js] parse lat=", lat, "lon=", lon);

    // 5) Figure out date range for the user’s selection
    const today = new Date();
    const differenceInDays = Math.floor((today - endDate) / (1000 * 3600 * 24));
    const plotStartDate = computeStartDate();
    console.log("[DEBUG ui.js] differenceInDays=", differenceInDays, 
                "plotStartDate=", plotStartDate.toISOString().split('T')[0]);

    // The historical fetch starts from Jan 1 of the current endDate year
    // The forecast fetch starts 30 days before endDate
    const fetchStartDate = new Date(endDate.getFullYear(), 0, 1, 12, 0, 0, 0);
    const recentStartDate = new Date(endDate);
    recentStartDate.setDate(recentStartDate.getDate() - 30);

    console.log("[DEBUG ui.js] fetchStartDate=", fetchStartDate.toISOString().split('T')[0],
        "recentStartDate=", recentStartDate.toISOString().split('T')[0]);

    try {
        // 6) Fetch historical data
        console.log("[DEBUG ui.js] fetchHistoricalData(",
            fetchStartDate.toISOString().split('T')[0], "->", endDate.toISOString().split('T')[0], ")");
        const histData = await fetchHistoricalData(lat, lon, fetchStartDate, endDate);

        const histDates = histData.daily.time;
        const histTemps = histData.daily.temperature_2m_mean;

        // Combine with recent if differenceInDays <= 10
        let dataByDate = {};
        if (differenceInDays > 10) {
            console.log("[DEBUG ui.js] differenceInDays>10 => only historical");
            for (let i = 0; i < histDates.length; i++) {
                dataByDate[histDates[i]] = histTemps[i];
            }
        } else {
            console.log("[DEBUG ui.js] differenceInDays<=10 => also fetch recent");
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

        // 7) Sort & map
        const allDates = Object.keys(dataByDate).sort((a,b) => new Date(a) - new Date(b));
        const allTemps = allDates.map(d => dataByDate[d]);
        console.log("[DEBUG ui.js] combined allDates.length=", allDates.length);

        if (allTemps.length === 0) {
            console.log("[DEBUG ui.js] No temperature data => alert + return");
            alert("Keine Daten gefunden. Anderen Ort oder anderes Datum wählen.");
            return;
        }

        // 8) GTS results for the entire [fetchStart..endDate], even if partial
        const gtsResults = calculateGTS(allDates, allTemps);
        console.log("[DEBUG ui.js] gtsResults.length=", gtsResults.length);

        // Filter GTS for display window [plotStartDate..endDate]
        const filteredResults = gtsResults.filter(r => {
            const d = new Date(r.date);
            return (d >= plotStartDate && d <= endDate);
        });
        console.log("[DEBUG ui.js] filteredResults.length=", filteredResults.length);

        // Filter daily temps for display
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

        // 9) Update result text in #ergebnisText
        const lastGTS = (gtsResults.length > 0) ? gtsResults[gtsResults.length - 1].gts : 0;
        const formattedDate = endDate.toLocaleDateString('de-DE');
        const localTodayStr = new Date().toLocaleDateString('de-DE');

        let dateColor = "#802020";
        let dateWeight = "bold";
        let betragen_str = "betrug"; // default (past tense)

        if (formattedDate === localTodayStr) {
            // if the chosen date is exactly "today" => present tense
            dateColor = "#206020";
            betragen_str = "beträgt";
        }

        console.log("[DEBUG ui.js] betragen_str =>", betragen_str);

        ergebnisTextEl.innerHTML = `
            <span style="font-weight: normal; color: #202020;">Die Grünlandtemperatursumme am </span>
            <span style="font-weight: ${dateWeight}; color: ${dateColor};">${formattedDate}</span>
            <span style="font-weight: normal; color: #202020;"> ${betragen_str} </span>
            <span style="font-weight: bold; color: darkgreen;">${lastGTS.toFixed(2)}</span>
        `;
        console.log("[DEBUG ui.js] ergebnisTextEl =>", ergebnisTextEl.innerText);

        // 10) Destroy old charts if any
        if (chartGTS) {
            console.log("[DEBUG ui.js] Destroying old chartGTS...");
            chartGTS.destroy();
            chartGTS = null;
        }
        if (chartTemp) {
            console.log("[DEBUG ui.js] Destroying old chartTemp...");
            chartTemp.destroy();
            chartTemp = null;
        }

        // 11) Build GTS chart => single-year or multi-year
        if (gtsPlotContainer.style.display !== 'none') {
            if (window.showFiveYear) {
                console.log("[DEBUG ui.js] showFiveYear => building multi-year overlay chart...");
                // We gather older years from logic.js => build5YearData
                const multiYearData = await build5YearData(lat, lon, plotStartDate, endDate);
                console.log("[DEBUG ui.js] multiYearData.length=", multiYearData.length);
                // Plot them as multiple lines
                chartGTS = plotMultipleYearData(multiYearData);
            } else {
                console.log("[DEBUG ui.js] single-year => plotData(filteredResults)");
                chartGTS = plotData(filteredResults);
            }
        } else {
            console.log("[DEBUG ui.js] gtsPlotContainer is hidden => skipping GTS chart creation.");
        }

        // 12) Build Temperature chart if needed
        if (tempPlotContainer.style.display !== 'none') {
            console.log("[DEBUG ui.js] Building Temperature chart => plotDailyTemps()");
            chartTemp = plotDailyTemps(filteredTempsDates, filteredTempsData);
        } else {
            console.log("[DEBUG ui.js] tempPlotContainer is hidden => skipping temperature chart creation.");
        }

        console.log("[DEBUG ui.js] updatePlots() => Done.");
    } catch (err) {
        console.error("[DEBUG ui.js] => Caught error:", err);
        alert("Fehler beim Laden der Daten: " + err.message);
    }
}
