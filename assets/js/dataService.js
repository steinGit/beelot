/**
 * @module dataService
 * Laden von Daten (historisch/aktuell) und Caching in localStorage
 */

export function getCachedData(key) {
    const cached = localStorage.getItem(key);
    if (cached) {
        return JSON.parse(cached);
    }
    return null;
}

export function setCachedData(key, data) {
    localStorage.setItem(key, JSON.stringify(data));
}

export async function fetchHistoricalData(lat, lon, start, end) {
    // If 'end' is in the future, clamp it to 'today'.
    const now = new Date();
    if (end > now) {
        console.log("[DEBUG dataService.js] fetchHistoricalData => 'end' is in the future => clamping to now.");
        end = new Date(now); // or local noon if you want
    }

    const cacheKey = `historical_${lat}_${lon}_${start.toISOString()}_${end.toISOString()}`;
    const cachedData = getCachedData(cacheKey);
    if (cachedData) {
        console.log('[DEBUG dataService.js] Historische Daten aus localStorage geladen (cacheKey=' + cacheKey + ').');
        return cachedData;
    }

    const startStr = start.toISOString().split('T')[0];
    const endStr   = end.toISOString().split('T')[0];
    console.log("[DEBUG dataService.js] => archive-api request from", startStr, "to", endStr);

    const url = `https://archive-api.open-meteo.com/v1/era5?latitude=${lat}&longitude=${lon}&start_date=${startStr}&end_date=${endStr}&daily=temperature_2m_mean&timezone=Europe%2FBerlin`;
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error("Fehler bei historischen Daten, " + response.status + " " + response.statusText);
    }

    const data = await response.json();
    setCachedData(cacheKey, data);
    return data;
}

export async function fetchRecentData(lat, lon, start, end) {
    // If 'end' is in the future, we can keep it or clamp it if you like.
    // The open-meteo forecast API usually handles future dates, so not as big an issue.
    const cacheKey = `recent_${lat}_${lon}_${start.toISOString()}_${end.toISOString()}`;
    const cachedData = getCachedData(cacheKey);
    if (cachedData) {
        console.log('[DEBUG dataService.js] Aktuelle Daten aus localStorage geladen (cacheKey=' + cacheKey + ').');
        return cachedData;
    }

    const startStr = start.toISOString().split('T')[0];
    const endStr   = end.toISOString().split('T')[0];
    console.log("[DEBUG dataService.js] => forecast request from", startStr, "to", endStr);

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&start_date=${startStr}&end_date=${endStr}&daily=temperature_2m_mean&timezone=Europe%2FBerlin`;
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error("Fehler bei aktuellen Daten, " + response.status + " " + response.statusText);
    }

    const data = await response.json();
    setCachedData(cacheKey, data);
    return data;
}
