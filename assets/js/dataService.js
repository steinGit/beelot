// dataService.js

/**
 * @module dataService
 * Handles fetching and caching of historical and recent weather data.
 */

import { formatDateLocal, isValidDate } from './utils.js';

/**
 * Retrieves cached data from localStorage based on the provided key.
 * @param {string} key - The key to retrieve from localStorage.
 * @returns {Object|null} - The parsed data if present, otherwise null.
 */
export function getCachedData(key) {
    const cached = localStorage.getItem(key);
    if (cached) {
        return JSON.parse(cached);
    }
    return null;
}

/**
 * Stores data in localStorage under the provided key.
 * @param {string} key - The key under which to store the data.
 * @param {Object} data - The data to store.
 */
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
    const startStr = formatDateLocal(start);
    const endStr = formatDateLocal(end);
    return `${type}_${roundedLat}_${roundedLon}_${startStr}_${endStr}`;
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
    // Validate Date objects
    if (!isValidDate(start) || !isValidDate(end)) {
        throw new Error("Invalid start or end date provided.");
    }

    // If 'end' is in the future, clamp it to 'today'.
    const now = new Date();
    if (end > now) {
        console.log("[DEBUG dataService.js] fetchHistoricalData => 'end' is in the future => clamping to now.");
        end = new Date(now); // Clamping to current date and time
    }

    const cacheKey = compute_cacheKey('historical', lat, lon, start, end);
    const cachedData = getCachedData(cacheKey);
    if (cachedData) {
        console.log(`[DEBUG dataService.js] Historische Daten aus localStorage geladen (cacheKey=${cacheKey}).`);
        return cachedData;
    }

    const startStr = formatDateLocal(start);
    const endStr = formatDateLocal(end);

    console.log("[DEBUG dataService.js] fetchHistoricalData start=", start, " end=", end);
    console.log("[DEBUG dataService.js] fetchHistoricalData startStr=", startStr, " endStr=", endStr);

    console.log(`[DEBUG dataService.js] => archive-api request from ${startStr} to ${endStr}`);

    const roundedLat = Math.round(lat * 100) / 100;
    const roundedLon = Math.round(lon * 100) / 100;
    const url = `https://archive-api.open-meteo.com/v1/era5?latitude=${roundedLat}&longitude=${roundedLon}&start_date=${startStr}&end_date=${endStr}&daily=temperature_2m_mean&timezone=Europe%2FBerlin`;
    
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Fehler bei historischen Daten, ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        setCachedData(cacheKey, data);
        return data;
    } catch (error) {
        console.error(`[DEBUG dataService.js] Error fetching historical data: ${error.message}`);
        throw error;
    }
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
    // Validate Date objects
    if (!isValidDate(start) || !isValidDate(end)) {
        throw new Error("Invalid start or end date provided.");
    }

    const cacheKey = compute_cacheKey('recent', lat, lon, start, end);
    const cachedData = getCachedData(cacheKey);
    if (cachedData) {
        console.log(`[DEBUG dataService.js] Aktuelle Daten aus localStorage geladen (cacheKey=${cacheKey}).`);
        return cachedData;
    }

    const startStr = formatDateLocal(start);
    const endStr = formatDateLocal(end);

    console.log("[DEBUG dataService.js] fetchRecentData start=", start, " end=", end);
    console.log("[DEBUG dataService.js] fetchRecentData startStr=", startStr, " endStr=", endStr);

    console.log(`[DEBUG dataService.js] => forecast request from ${startStr} to ${endStr}`);

    const roundedLat = Math.round(lat * 100) / 100;
    const roundedLon = Math.round(lon * 100) / 100;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${roundedLat}&longitude=${roundedLon}&start_date=${startStr}&end_date=${endStr}&daily=temperature_2m_mean&timezone=Europe%2FBerlin`;
    
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Fehler bei aktuellen Daten, ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        setCachedData(cacheKey, data);
        return data;
    } catch (error) {
        console.error(`[DEBUG dataService.js] Error fetching recent data: ${error.message}`);
        throw error;
    }
}
