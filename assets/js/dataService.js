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
    setCachedData(cacheKey, data);
    return data;
}

export async function fetchRecentData(lat, lon, start, end) {
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
    setCachedData(cacheKey, data);
    return data;
}
