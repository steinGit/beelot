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
        const locString = `Lat:${selectedLatLng.lat.toFixed(5)},Lon:${selectedLatLng.lng.toFixed(5)}`;
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
 * Checks if user selected "past 5 years" in main.js (window.showFiveYear)
 */
export async function updatePlots() {
    console.log("[DEBUG] updatePlots() => Start. datum=", datumInput.value);

    const ortVal = ortInput.value;
    console.log("[DEBUG] ortVal=", ortVal);

    const today = new Date();
    const endDate = getSelectedEndDate();
    console.log("[DEBUG] getSelectedEndDate() =>", endDate.toISOString().split('T')[0]);

    // 1) If no lat/lon => clear results
    if (!ortVal.includes("Lat") || !ortVal.includes("Lon")) {
        console.log("[DEBUG] No lat/lon in ortVal => clearing results + destroying plots...");
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

    // 2) If user picks a future date => reset to today
    if (endDate > today) {
        console.log("[DEBUG] endDate is in future => alert + set to today.");
        alert("Das Datum darf nicht in der Zukunft liegen.");
        datumInput.value = today.toISOString().split('T')[0];
        datumInput.max = today.toISOString().split('T')[0];
        return;
    }

    // 3) Parse lat/lon from #ort
    const parts = ortVal.split(',');
    const latPart = parts[0].split(':')[1];
    const lonPart = parts[1].split(':')[1];
    const lat = parseFloat(latPart.trim());
    const lon = parseFloat(lonPart.trim());
    console.log("[DEBUG] Parsed lat=", lat, "lon=", lon);

    // 4) Figure out date range for the user’s selection
    const differenceInDays = Math.floor((today - endDate) / (1000 * 3600 * 24));
    const plotStartDate = computeStartDate();
    console.log("[DEBUG] differenceInDays=", differenceInDays, "plotStartDate=", plotStartDate.toISOString().split('T')[0]);

    // used to fetch historical + recent data
    const fetchStartDate = new Date(endDate.getFullYear(), 0, 1);
    const recentStartDate = new Date(endDate);
    recentStartDate.setDate(recentStartDate.getDate() - 30);

    console.log("[DEBUG] fetchStartDate=", fetchStartDate.toISOString().split('T')[0],
                "recentStartDate=", recentStartDate.toISOString().split('T')[0]);

    try {
        // 5) Fetch historical data for the current year range
        console.log("[DEBUG] Fetching historical data from", fetchStartDate.toISOString(), "to", endDate.toISOString());
        const histData = await fetchHistoricalData(lat, lon, fetchStartDate, endDate);
        const histDates = histData.daily.time;
        const histTemps = histData.daily.temperature_2m_mean;

        // Possibly combine with recent data
        let dataByDate = {};
        if (differenceInDays > 10) {
            console.log("[DEBUG] differenceInDays > 10 => use only historical data");
            for (let i = 0; i < histDates.length; i++) {
                dataByDate[histDates[i]] = histTemps[i];
            }
        } else {
            console.log("[DEBUG] differenceInDays <= 10 => fetch recent data too");
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

        // Sort and map
        const allDates = Object.keys(dataByDate).sort((a,b) => new Date(a) - new Date(b));
        const allTemps = allDates.map(d => dataByDate[d]);
        console.log("[DEBUG] combined allDates.length=", allDates.length);

        if (allTemps.length === 0) {
            console.log("[DEBUG] No temperature data => alert + return");
            alert("Keine Daten gefunden. Anderen Ort oder anderes Datum wählen.");
            return;
        }

        // 6) Compute GTS for the "current" year
        const gtsResults = calculateGTS(allDates, allTemps);
        console.log("[DEBUG] gtsResults.length=", gtsResults.length);

        // Filter for [plotStartDate..endDate] window
        const filteredResults = gtsResults.filter(r => {
            const d = new Date(r.date);
            return d >= plotStartDate && d <= endDate;
        });
        console.log("[DEBUG] filteredResults.length=", filteredResults.length);

        // Build arrays for daily temps
        filteredTempsDates = [];
        filteredTempsData = [];
        for (let i = 0; i < allDates.length; i++) {
            const d = new Date(allDates[i]);
            if (d >= plotStartDate && d <= endDate) {
                filteredTempsDates.push(allDates[i]);
                filteredTempsData.push(allTemps[i]);
            }
        }
        console.log("[DEBUG] filteredTempsDates.length=", filteredTempsDates.length);

        // 7) Update #ergebnis-text with final GTS
        const lastGTS = gtsResults.length > 0 ? gtsResults[gtsResults.length - 1].gts : 0;
        const formattedDate = endDate.toLocaleDateString('de-DE');
        const todayStr = today.toLocaleDateString('de-DE');

        let dateColor = "#802020";
        let dateWeight = "bold";
        let betragen_str = "betrug";
        if (formattedDate === todayStr) {
            dateColor = "#206020";
            betragen_str = "beträgt";
        }

        ergebnisTextEl.innerHTML = `
            <span style="font-weight: normal; color: #202020;">Die Grünlandtemperatursumme am </span>
            <span style="font-weight: ${dateWeight}; color: ${dateColor};">${formattedDate}</span>
            <span style="font-weight: normal; color: #202020;"> ${betragen_str} </span>
            <span style="font-weight: bold; color: darkgreen;">${lastGTS.toFixed(2)}</span>
        `;
        console.log("[DEBUG] Updated ergebnisTextEl =>", ergebnisTextEl.innerText);

        // 8) Destroy old charts
        if (chartGTS) {
            console.log("[DEBUG] Destroying old chartGTS...");
            chartGTS.destroy();
            chartGTS = null;
        }
        if (chartTemp) {
            console.log("[DEBUG] Destroying old chartTemp...");
            chartTemp.destroy();
            chartTemp = null;
        }

        // 9) GTS plot: single-year or multi-year?
        if (gtsPlotContainer.style.display !== 'none') {
            // If “past 5 years” toggled (from main.js => window.showFiveYear), do multi-year
            if (window.showFiveYear) {
                console.log("[DEBUG] showFiveYear => building 5-year overlay chart...");
                // Build 5-year data for [plotStartDate..endDate]
                const multiYearData = await build5YearData(lat, lon, plotStartDate, endDate);
                console.log("[DEBUG] multiYearData.length=", multiYearData.length);
                // Plot multiple lines
                chartGTS = plotMultipleYearData(multiYearData);
            } else {
                console.log("[DEBUG] Building single-year GTS => plotData(filteredResults)");
                chartGTS = plotData(filteredResults);
            }
        } else {
            console.log("[DEBUG] gtsPlotContainer is hidden => skipping GTS chart creation.");
        }

        // 10) Temperature plot (unchanged logic)
        if (tempPlotContainer.style.display !== 'none') {
            console.log("[DEBUG] Building Temperature chart => plotDailyTemps()");
            chartTemp = plotDailyTemps(filteredTempsDates, filteredTempsData);
        } else {
            console.log("[DEBUG] tempPlotContainer is hidden => skipping temperature chart creation.");
        }

        console.log("[DEBUG] updatePlots() => Done.");
    } catch (err) {
        console.error("[DEBUG] updatePlots() => Caught error:", err);
        alert("Fehler beim Laden der Daten: " + err.message);
    }
}
