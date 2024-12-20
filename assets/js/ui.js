/**
 * @module ui
 * Funktionen für UI-Interaktionen, DOM-Referenzen, Anzeigen/Verstecken von Elementen
 */

import { fetchHistoricalData, fetchRecentData } from './dataService.js';
import { calculateGTS, computeStartDate, getSelectedEndDate } from './logic.js';
import { plotData, plotDailyTemps } from './charts.js';

export const ortInput = document.getElementById('ort');
export const datumInput = document.getElementById('datum');
export const zeitraumSelect = document.getElementById('zeitraum');
export const berechnenBtn = document.getElementById('berechnen-btn');
export const ortKarteBtn = document.getElementById('ort-karte-btn');
export const mapCloseBtn = document.getElementById('map-close-btn');
export const mapSaveBtn = document.getElementById('map-save-btn');
export const datumPlusBtn = document.getElementById('datum-plus');
export const datumMinusBtn = document.getElementById('datum-minus');
export const toggleTempPlotBtn = document.getElementById('toggle-temp-plot');
const ergebnisTextEl = document.getElementById('ergebnis-text');

let chartGTS = null;
let chartTemp = null;
let filteredTempsDates = [];
let filteredTempsData = [];
let map = null;
let marker = null;
let selectedLatLng = null;

window.initOrUpdateMap = () => {
    const mapPopup = document.getElementById('map-popup');
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
            updatePlots();
        });

        // Letzte Position laden
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
            }
        }, 100);
    }
};

window.saveMapSelection = () => {
    const mapPopup = document.getElementById('map-popup');
    if (selectedLatLng) {
        const locString = `Lat:${selectedLatLng.lat.toFixed(5)},Lon:${selectedLatLng.lng.toFixed(5)}`;
        ortInput.value = locString;
        localStorage.setItem("lastLocation", locString);
        localStorage.setItem("lastPos", `${map.getCenter().lat},${map.getCenter().lng}`);
        localStorage.setItem("lastZoom", map.getZoom());
        updatePlots();
    }
    mapPopup.style.display = 'none';
};

export async function updatePlots() {
    const ortVal = ortInput.value;
    const today = new Date();
    const endDate = getSelectedEndDate();
    
    if (!ortVal.includes("Lat") || !ortVal.includes("Lon")) {
        // Ergebnis zurücksetzen
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

    if (endDate > today) {
        alert("Das Datum darf nicht in der Zukunft liegen.");
        datumInput.value = today.toISOString().split('T')[0];
        datumInput.max = today.toISOString().split('T')[0];
        return;
    }

    const parts = ortVal.split(',');
    const latPart = parts[0].split(':')[1];
    const lonPart = parts[1].split(':')[1];
    const lat = parseFloat(latPart.trim());
    const lon = parseFloat(lonPart.trim());

    const differenceInDays = Math.floor((today - endDate) / (1000 * 3600 * 24));
    const plotStartDate = computeStartDate();
    const fetchStartDate = new Date(endDate.getFullYear(), 0, 1);
    const recentStartDate = new Date(endDate);
    recentStartDate.setDate(recentStartDate.getDate() - 30);

    try {
        const histData = await fetchHistoricalData(lat, lon, fetchStartDate, endDate);
        const histDates = histData.daily.time;
        const histTemps = histData.daily.temperature_2m_mean;

        let dataByDate = {};

        if (differenceInDays > 10) {
            // Nur historische Daten
            for (let i = 0; i < histDates.length; i++) {
                dataByDate[histDates[i]] = histTemps[i];
            }
        } else {
            // Historische + Aktuelle kombinieren
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

        const allDates = Object.keys(dataByDate).sort((a,b) => new Date(a) - new Date(b));
        const allTemps = allDates.map(d => dataByDate[d]);

        if (allTemps.length === 0) {
            alert("Keine Daten gefunden. Anderen Ort oder anderes Datum wählen.");
            return;
        }

        const gtsResults = calculateGTS(allDates, allTemps);
        const filteredResults = gtsResults.filter(r => {
            const d = new Date(r.date);
            return d >= plotStartDate && d <= endDate;
        });

        filteredTempsDates = [];
        filteredTempsData = [];
        for (let i = 0; i < allDates.length; i++) {
            const d = new Date(allDates[i]);
            if (d >= plotStartDate && d <= endDate) {
                filteredTempsDates.push(allDates[i]);
                filteredTempsData.push(allTemps[i]);
            }
        }

        const lastGTS = gtsResults.length > 0 ? gtsResults[gtsResults.length - 1].gts : 0;
        const formattedDate = endDate.toLocaleDateString('de-DE');
        const todayStr = today.toLocaleDateString('de-DE');

        // Formatierung für Ergebnistext
        let dateColor = "#202020";
        let dateWeight = "normal";
        if (formattedDate === todayStr) {
            dateColor = "#206020";
            dateWeight = "bold";
        }

        ergebnisTextEl.innerHTML = `
            <span style="font-weight: normal; color: #202020;">Grünlandtemperatursumme am </span>
            <span style="font-weight: ${dateWeight}; color: ${dateColor};">${formattedDate}</span>
            <span style="font-weight: normal; color: #202020;"> beträgt </span>
            <span style="font-weight: bold; color: darkgreen;">${lastGTS.toFixed(2)}</span>
        `;

        // Plots
        if (chartGTS) {
            chartGTS.destroy();
            chartGTS = null;
        }
        if (chartTemp) {
            chartTemp.destroy();
            chartTemp = null;
        }
        chartGTS = plotData(filteredResults);  
        
        const tempPlotContainer = document.getElementById('temp-plot-container');
        if (tempPlotContainer.style.display !== 'none') {
            chartTemp = plotDailyTemps(filteredTempsDates, filteredTempsData);
        }

    } catch (err) {
        console.error(err);
        alert("Fehler beim Laden der Daten: " + err.message);
    }
}
