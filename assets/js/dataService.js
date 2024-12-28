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

/**
 * Computes a cache key based on the provided parameters.
 * @param {string} type - The type of data (e.g., 'historical', 'recent').
 * @param {number} lat - Latitude, rounded to a precision of 0.01.
 * @param {number} lon - Longitude, rounded to a precision of 0.01.
 * @param {Date} start - Start date.
 * @param {Date} end - End date.
 * @returns {string} - The computed cache key.
 */
function compute_cacheKey(type, lat, lon, start, end) {
    const roundedLat = Math.round(lat * 100) / 100;
    const roundedLon = Math.round(lon * 100) / 100;
    return `${type}_${roundedLat}_${roundedLon}_${start.toISOString()}_${end.toISOString()}`;
}

/**
 * Fetches historical data based on latitude, longitude, and date range.
 * @param {number} lat - Latitude.
 * @param {number} lon - Longitude.
 * @param {Date} start - Start date.
 * @param {Date} end - End date.
 * @returns {Promise<Object>} - The fetched historical data.
 */
export async function fetchHistoricalData(lat, lon, start, end) {
    // If 'end' is in the future, clamp it to 'today'.
    const now = new Date();
    if (end > now) {
        console.log("[DEBUG dataService.js] fetchHistoricalData => 'end' is in the future => clamping to now.");
        end = new Date(now); // or local noon if needed
    }

    const cacheKey = compute_cacheKey('historical', lat, lon, start, end);
    const cachedData = getCachedData(cacheKey);
    if (cachedData) {
        console.log(`[DEBUG dataService.js] Historische Daten aus localStorage geladen (cacheKey=${cacheKey}).`);
        return cachedData;
    }

    const startStr = start.toISOString().split('T')[0];
    const endStr = end.toISOString().split('T')[0];
    console.log(`[DEBUG dataService.js] => archive-api request from ${startStr} to ${endStr}`);

    const roundedLat = Math.round(lat * 100) / 100;
    const roundedLon = Math.round(lon * 100) / 100;
    const url = `https://archive-api.open-meteo.com/v1/era5?latitude=${roundedLat}&longitude=${roundedLon}&start_date=${startStr}&end_date=${endStr}&daily=temperature_2m_mean&timezone=Europe%2FBerlin`;
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Fehler bei historischen Daten, ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    setCachedData(cacheKey, data);
    return data;
}

/**
 * Fetches recent data (forecast) based on latitude, longitude, and date range.
 * @param {number} lat - Latitude.
 * @param {number} lon - Longitude.
 * @param {Date} start - Start date.
 * @param {Date} end - End date.
 * @returns {Promise<Object>} - The fetched recent data.
 */
export async function fetchRecentData(lat, lon, start, end) {
    const cacheKey = compute_cacheKey('recent', lat, lon, start, end);
    const cachedData = getCachedData(cacheKey);
    if (cachedData) {
        console.log(`[DEBUG dataService.js] Aktuelle Daten aus localStorage geladen (cacheKey=${cacheKey}).`);
        return cachedData;
    }

    const startStr = start.toISOString().split('T')[0];
    const endStr = end.toISOString().split('T')[0];
    console.log(`[DEBUG dataService.js] => forecast request from ${startStr} to ${endStr}`);

    const roundedLat = Math.round(lat * 100) / 100;
    const roundedLon = Math.round(lon * 100) / 100;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${roundedLat}&longitude=${roundedLon}&start_date=${startStr}&end_date=${endStr}&daily=temperature_2m_mean&timezone=Europe%2FBerlin`;
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Fehler bei aktuellen Daten, ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    setCachedData(cacheKey, data);
    return data;
}
