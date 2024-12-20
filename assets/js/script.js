let selectedLatLng = null;
let marker = null;
let map = null;
let chartGTS = null;
let chartTemp = null;

// In-Memory Cache
const dataCache = {};

// Referenzen
const ortInput = document.getElementById('ort');
const mapPopup = document.getElementById('map-popup');
const mapCloseBtn = document.getElementById('map-close-btn');
const mapSaveBtn = document.getElementById('map-save-btn');
const ortKarteBtn = document.getElementById('ort-karte-btn');

const datumInput = document.getElementById('datum');
const datumPlusBtn = document.getElementById('datum-plus');
const datumMinusBtn = document.getElementById('datum-minus');
const zeitraumSelect = document.getElementById('zeitraum');
const berechnenBtn = document.getElementById('berechnen-btn');
const ergebnisTextEl = document.getElementById('ergebnis-text');

const tempPlotContainer = document.getElementById('temp-plot-container');
const toggleTempPlotBtn = document.getElementById('toggle-temp-plot');

// Persistenz: letzten Ort + Karteinstellungen laden
document.addEventListener("DOMContentLoaded", () => {
    // Set default date = heute
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const todayStr = `${yyyy}-${mm}-${dd}`;
    datumInput.value = todayStr;
    datumInput.max = todayStr; // Set max attribute to today

    const lastLoc = localStorage.getItem("lastLocation");
    if (lastLoc) {
        ortInput.value = lastLoc;
    }

    // Initial plots if last location is set
    if (lastLoc) {
        updatePlots();
    }
});

// Funktionen zum Caching in localStorage
function getCachedData(key) {
    const cached = localStorage.getItem(key);
    if (cached) {
        return JSON.parse(cached);
    }
    return null;
}

function setCachedData(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
}

// Karte initialisieren erst bei Bedarf
ortKarteBtn.addEventListener('click', () => {
    mapPopup.style.display = 'block';
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
            updatePlots(); // Automatisch die Plots aktualisieren, wenn der Ort geändert wird
        });

        // Prüfe, ob letztes Lat/Lon + Zoom gespeichert sind
        const lastPos = localStorage.getItem("lastPos");
        const lastZoom = localStorage.getItem("lastZoom");
        if (lastPos && lastZoom) {
            const coords = lastPos.split(',');
            const lat = parseFloat(coords[0]);
            const lon = parseFloat(coords[1]);
            map.setView([lat, lon], parseInt(lastZoom));
            // Marker setzen, falls Lat/Lon bekannt
            if (ortInput.value.includes("Lat") && ortInput.value.includes("Lon")) {
                const parts = ortInput.value.split(',');
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
        // Falls Karte schon da ist, direkt invalidateSize und ggf. Position setzen
        setTimeout(() => {
            map.invalidateSize();
            // Zentrieren auf gespeicherten Ort
            const lastLoc = localStorage.getItem("lastLocation");
            if (lastLoc) {
                const parts = lastLoc.split(',');
                const latPart = parts[0].split(':')[1];
                const lonPart = parts[1].split(':')[1];
                const latSaved = parseFloat(latPart.trim());
                const lonSaved = parseFloat(lonPart.trim());
                map.setView([latSaved, lonSaved], parseInt(localStorage.getItem("lastZoom")) || map.getZoom());

                // Marker setzen
                selectedLatLng = {lat: latSaved, lng: lonSaved};
                if (marker) {
                    map.removeLayer(marker);
                }
                marker = L.marker([latSaved, lonSaved]).addTo(map);
            }
        }, 100);
    }
});

mapCloseBtn.addEventListener('click', () => {
    mapPopup.style.display = 'none';
});

mapSaveBtn.addEventListener('click', () => {
    if (selectedLatLng) {
        const locString = `Lat:${selectedLatLng.lat.toFixed(5)},Lon:${selectedLatLng.lng.toFixed(5)}`;
        ortInput.value = locString;
        // In localStorage speichern
        localStorage.setItem("lastLocation", locString);
        // Aktuelle Kartenposition und Zoom speichern
        localStorage.setItem("lastPos", `${map.getCenter().lat},${map.getCenter().lng}`);
        localStorage.setItem("lastZoom", map.getZoom());
        updatePlots(); // Automatisch die Plots aktualisieren, wenn der Ort gespeichert wird
    }
    mapPopup.style.display = 'none';
});

// Datum Plus/Minus
datumPlusBtn.addEventListener('click', () => {
    const current = new Date(datumInput.value);
    current.setDate(current.getDate() + 1);
    const now = new Date();
    if (current > now) {
        // Falls in Zukunft, zurücksetzen
        current.setDate(current.getDate() - 1);
    }
    datumInput.value = current.toISOString().split('T')[0];
    updatePlots(); // Triggern der Aktualisierung
});

datumMinusBtn.addEventListener('click', () => {
    const current = new Date(datumInput.value);
    current.setDate(current.getDate() - 1);
    datumInput.value = current.toISOString().split('T')[0];
    updatePlots(); // Triggern der Aktualisierung
});

function getSelectedEndDate() {
    return new Date(datumInput.value);
}

function computeStartDate() {
    const endDate = getSelectedEndDate();
    const selection = zeitraumSelect.value;

    let startDate = new Date(endDate);

    if (selection === "7") {
        startDate.setDate(endDate.getDate() - 7);
    } else if (selection === "14") {
        startDate.setDate(endDate.getDate() - 14);
    } else if (selection === "28") {
        startDate.setDate(endDate.getDate() - 28);
    } else if (selection === "ytd") {
        startDate = new Date(endDate.getFullYear(), 0, 1);
    }

    return startDate;
}

// Funktionen zum Caching in localStorage
function getCachedData(key) {
    const cached = localStorage.getItem(key);
    if (cached) {
        return JSON.parse(cached);
    }
    return null;
}

function setCachedData(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
}

// Daten laden (Historisch & Aktuell)

async function fetchHistoricalData(lat, lon, start, end) {
    const cacheKey = `historical_${lat}_${lon}_${start.toISOString()}_${end.toISOString()}`;
    const cachedData = getCachedData(cacheKey);
    if (cachedData) {
        console.log('Historische Daten aus localStorage geladen.');
        return cachedData;
    }

    const startStr = start.toISOString().split('T')[0];
    const endStr = end.toISOString().split('T')[0];
    const url = `https://archive-api.open-meteo.com/v1/era5?latitude=${lat}&longitude=${lon}&start_date=${startStr}&end_date=${endStr}&daily=temperature_2m_mean&timezone=Europe%2FBerlin`;
    const response = await fetch(url);
    if (!response.ok) throw new Error("Fehler bei historischen Daten");
    const data = await response.json();
    setCachedData(cacheKey, data); // Daten in localStorage speichern
    return data;
}

async function fetchRecentData(lat, lon, start, end) {
    const cacheKey = `recent_${lat}_${lon}_${start.toISOString()}_${end.toISOString()}`;
    const cachedData = getCachedData(cacheKey);
    if (cachedData) {
        console.log('Aktuelle Daten aus localStorage geladen.');
        return cachedData;
    }

    const startStr = start.toISOString().split('T')[0];
    const endStr = end.toISOString().split('T')[0];
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&start_date=${startStr}&end_date=${endStr}&daily=temperature_2m_mean&timezone=Europe%2FBerlin`;
    const response = await fetch(url);
    if (!response.ok) throw new Error("Fehler bei aktuellen Daten");
    const data = await response.json();
    setCachedData(cacheKey, data); // Daten in localStorage speichern
    return data;
}

function calculateGTS(dates, values) {
    let cumulativeSum = 0;
    const results = [];

    for (let i = 0; i < values.length; i++) {
        let val = values[i] < 0 ? 0 : values[i];
        const currentDate = new Date(dates[i]);
        const month = currentDate.getMonth() + 1; 

        let weightedVal = val;
        if (month === 1) {
            weightedVal = val * 0.5;
        } else if (month === 2) {
            weightedVal = val * 0.75;
        }
        cumulativeSum += weightedVal;
        results.push({
            date: dates[i],
            gts: cumulativeSum
        });
    }
    return results;
}

function plotData(results) {
    const labels = results.map(r => {
        const d = new Date(r.date);
        return `${d.getDate()}.${d.getMonth()+1}`;
    });

    const data = results.map(r => r.gts);

    if (chartGTS) {
        chartGTS.destroy();
    }

    const ctx = document.getElementById('plot-canvas').getContext('2d');
    chartGTS = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Grünlandtemperatursumme (GTS)',
                data: data,
                borderColor: 'orange',
                backgroundColor: 'rgba(255, 165, 0, 0.2)',
                fill: true,
                tension: 0.1,
                pointRadius: 5,           // Größere Punkte für bessere Hover-Erkennung
                pointHoverRadius: 7
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: false
                }
            },
            plugins: {
                tooltip: {
                    enabled: true,
                    mode: 'index',
                    intersect: false
                }
            },
            interaction: {
                mode: 'nearest',
                intersect: false
            }
            // Tooltips werden automatisch angezeigt
        }
    });
}

function plotDailyTemps(dates, temps) {
    const labels = dates.map(dStr => {
        const d = new Date(dStr);
        return `${d.getDate()}.${d.getMonth()+1}`;
    });

    if (chartTemp) {
        chartTemp.destroy();
    }

    const ctx = document.getElementById('temp-plot').getContext('2d');
    chartTemp = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Tagesmitteltemperatur (°C)',
                data: temps,
                borderColor: 'blue',
                backgroundColor: 'rgba(0, 0, 255, 0.2)',
                fill: true,
                tension: 0.1,
                pointRadius: 5,           // Größere Punkte für bessere Hover-Erkennung
                pointHoverRadius: 7
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: false
                }
            },
            plugins: {
                tooltip: {
                    enabled: true,
                    mode: 'index',
                    intersect: false
                }
            },
            interaction: {
                mode: 'nearest',
                intersect: false
            }
            // Tooltips werden automatisch angezeigt
        }
    });
}

// Toggle Temperaturplot
toggleTempPlotBtn.addEventListener('click', () => {
    if (tempPlotContainer.style.display === 'none') {
        tempPlotContainer.style.display = 'block';
        toggleTempPlotBtn.textContent = 'Temperaturen ausblenden';
        // Zeichne den Temperaturplot, falls Daten vorhanden sind
        if (filteredTempsDates.length > 0 && filteredTempsData.length > 0) {
            plotDailyTemps(filteredTempsDates, filteredTempsData);
        }
    } else {
        tempPlotContainer.style.display = 'none';
        toggleTempPlotBtn.textContent = 'Temperaturen anzeigen';
    }
});

// Berechnen-Button Logik
berechnenBtn.addEventListener('click', updatePlots);

// Event-Listener für automatische Aktualisierung
ortInput.addEventListener('change', updatePlots);
zeitraumSelect.addEventListener('change', updatePlots);
datumInput.addEventListener('change', updatePlots);

// Funktion zur Aktualisierung der Plots
async function updatePlots() {
    const ortVal = ortInput.value;
    // Prüfe ob Ort gewählt wurde
    if (!ortVal.includes("Lat") || !ortVal.includes("Lon")) {
        // Ergebnis zurücksetzen
        ergebnisTextEl.textContent = "Grünlandtemperatursumme am [Datum] beträgt [GTS Ergebnis]";
        // Plots zerstören, falls vorhanden
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

    const parts = ortVal.split(',');
    const latPart = parts[0].split(':')[1];
    const lonPart = parts[1].split(':')[1];
    const lat = parseFloat(latPart.trim());
    const lon = parseFloat(lonPart.trim());

    const endDate = getSelectedEndDate();
    const today = new Date();
    if (endDate > today) {
        alert("Das Datum darf nicht in der Zukunft liegen.");
        datumInput.value = today.toISOString().split('T')[0];
        datumInput.max = today.toISOString().split('T')[0];
        return;
    }

    // NEU: Berechnung der Anzahl Tage Differenz von heute
    const differenceInDays = Math.floor((today - endDate) / (1000 * 3600 * 24));

    const plotStartDate = computeStartDate();
    const fetchStartDate = new Date(endDate.getFullYear(), 0, 1); // Immer vom 1.1. dieses Jahres
    const recentStartDate = new Date(endDate);
    recentStartDate.setDate(recentStartDate.getDate() - 30);

    try {
        // Historische Daten laden
        const histData = await fetchHistoricalData(lat, lon, fetchStartDate, endDate);
        const histDates = histData.daily.time;
        const histTemps = histData.daily.temperature_2m_mean;

        // NEU: Wenn mehr als 10 Tage in der Vergangenheit, nur historische Daten
        let dataByDate = {};
        if (differenceInDays > 10) {
            // Nur historische Daten verwenden
            for (let i = 0; i < histDates.length; i++) {
                dataByDate[histDates[i]] = histTemps[i];
            }
        } else {
            // Weniger oder gleich 10 Tage -> historische + aktuelle Daten kombinieren
            const recentData = await fetchRecentData(lat, lon, recentStartDate, endDate);
            const recentDates = recentData.daily.time;
            const recentTemps = recentData.daily.temperature_2m_mean;

            // Historische Daten eintragen
            for (let i = 0; i < histDates.length; i++) {
                dataByDate[histDates[i]] = histTemps[i];
            }

            // Aktuelle Daten überschreiben bzw. ergänzen
            for (let i = 0; i < recentDates.length; i++) {
                dataByDate[recentDates[i]] = recentTemps[i];
            }
        }

        // Sortieren nach Datum
        const allDates = Object.keys(dataByDate).sort((a,b) => new Date(a) - new Date(b));
        const allTemps = allDates.map(d => dataByDate[d]);

        if (allTemps.length === 0) {
            alert("Keine Daten gefunden. Anderen Ort oder anderes Datum wählen.");
            return;
        }

        const gtsResults = calculateGTS(allDates, allTemps);

        // Filtern für Plot
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

        // Letzter GTS Wert
        const lastGTS = gtsResults.length > 0 ? gtsResults[gtsResults.length - 1].gts : 0;
        const formattedDate = endDate.toLocaleDateString('de-DE');
        ergebnisTextEl.textContent = `Grünlandtemperatursumme am ${formattedDate} beträgt ${lastGTS.toFixed(2)}`;

        // Plotten
        plotData(filteredResults);
        // Temperaturplot wird nur gezeichnet, wenn sichtbar
        if (tempPlotContainer.style.display !== 'none') {
            plotDailyTemps(filteredTempsDates, filteredTempsData);
        }

    } catch (err) {
        console.error(err);
        alert("Fehler beim Laden der Daten: " + err.message);
    }
}

