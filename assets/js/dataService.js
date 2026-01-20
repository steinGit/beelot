// dataService.js

/**
 * @module dataService
 * Handles fetching and caching of historical and recent weather data.
 */

import { formatDateLocal, isValidDate } from './utils.js';

export class OpenMeteoError extends Error {
    constructor(message, cause = null) {
        super(message);
        this.name = "OpenMeteoError";
        this.isOpenMeteoError = true;
        if (cause) {
            this.cause = cause;
        }
    }
}

export function isOpenMeteoError(error) {
    return Boolean(error && error.isOpenMeteoError);
}

function ensureDailyData(data, context) {
    if (!data || !data.daily || !Array.isArray(data.daily.time)) {
        throw new OpenMeteoError(`Invalid Open-Meteo response${context ? ` (${context})` : ""}.`);
    }
}

/**
 * Retrieves cached data from a cache store or localStorage based on the provided key.
 * @param {string} key - The key to retrieve.
 * @param {Object|null} cacheStore - Optional cache store with get/set methods.
 * @returns {Object|null} - The parsed data if present, otherwise null.
 */
export function getCachedData(key, cacheStore = null) {
    if (cacheStore) {
        return cacheStore.get(key);
    }
    const cached = localStorage.getItem(key);
    if (cached) {
        return JSON.parse(cached);
    }
    return null;
}

/**
 * Stores data in a cache store or localStorage under the provided key.
 * @param {string} key - The key under which to store the data.
 * @param {Object} data - The data to store.
 * @param {Object|null} cacheStore - Optional cache store with get/set methods.
 */
export function setCachedData(key, data, cacheStore = null) {
    if (cacheStore) {
        cacheStore.set(key, data);
        return;
    }
    localStorage.setItem(key, JSON.stringify(data));
}

/**
 * Computes a cache key based on the provided parameters.
 * @param {string} type - The type of data (e.g., 'historical', 'recent').
 * @param {number} lat - Latitude, rounded to a precision of 0.01.
 * @param {number} lon - Longitude, rounded to a precision of 0.01.
 * @param {number|string} yearOrRange - The year (for static historical data) or a date range.
 * @returns {string} - The computed cache key.
 */
function computeCacheKey(type, lat, lon, yearOrRange) {
    const roundedLat = Math.round(lat * 100) / 100;
    const roundedLon = Math.round(lon * 100) / 100;
    return `${type}_${roundedLat}_${roundedLon}_${yearOrRange}`;
}

/**
 * Fetches historical data based on latitude, longitude, and date range.
 * Handles full-year caching for past years.
 *
 * @param {number} lat - Latitude.
 * @param {number} lon - Longitude.
 * @param {Date} start - Start date.
 * @param {Date} end - End date.
 * @returns {Promise<Object>} - The fetched historical data.
 */
export async function fetchHistoricalData(lat, lon, start, end, cacheStore = null, allowForecastFallback = true) {
    // Validate Date objects
    if (!isValidDate(start) || !isValidDate(end)) {
        throw new Error("Invalid start or end date provided.");
    }

    const now = new Date();
    const currentYear = now.getFullYear();
    const startYear = start.getFullYear();
    const endYear = end.getFullYear();

    // Handle full-year caching for past years
    if (startYear < currentYear) {
        if (startYear !== endYear) {
            throw new Error(
                "Cross-year historical requests are not supported. Use one year at a time."
            );
        }

        // Cache key for the entire year
        const yearKey = computeCacheKey('historical', lat, lon, startYear);
        const cachedYearData = getCachedData(yearKey, cacheStore);
        if (cachedYearData) {
            ensureDailyData(cachedYearData, "historical-cache");
            console.log(`[DEBUG dataService.js] Cached full-year data found for ${yearKey}.`);
            return extractDateRangeFromYearData(cachedYearData, start, end);
        }

        // Fetch the full year if not cached
        const fullYearStart = new Date(startYear, 0, 1);
        const fullYearEnd = new Date(startYear, 11, 31);

        console.log(`[DEBUG dataService.js] Fetching full-year data for ${startYear}.`);

        const data = await fetchHistoricalYear(lat, lon, fullYearStart, fullYearEnd, cacheStore);
        setCachedData(yearKey, data, cacheStore);

        return extractDateRangeFromYearData(data, start, end);
    }

    // Handle current year as usual (date range caching)
    const cacheKey = computeCacheKey(
        'historical',
        lat,
        lon,
        `${formatDateLocal(start)}_${formatDateLocal(end)}`
    );
    const cachedData = getCachedData(cacheKey, cacheStore);
    if (cachedData) {
        ensureDailyData(cachedData, "historical-cache");
        console.log(`[DEBUG dataService.js] Historical data loaded from cache (key=${cacheKey}).`);
        return cachedData;
    }

    console.log(`[DEBUG dataService.js] Fetching historical data from ${start} to ${end}.`);

    const roundedLat = Math.round(lat * 100) / 100;
    const roundedLon = Math.round(lon * 100) / 100;
    const url = `https://archive-api.open-meteo.com/v1/era5?latitude=${roundedLat}&longitude=${roundedLon}&start_date=${formatDateLocal(
        start
    )}&end_date=${formatDateLocal(end)}&daily=temperature_2m_mean&timezone=Europe%2FBerlin`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new OpenMeteoError(`Open-Meteo error: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        ensureDailyData(data, "historical");
        setCachedData(cacheKey, data, cacheStore);
        return data;
    } catch (error) {
        console.error(`[DEBUG dataService.js] Error fetching historical data: ${error.message}`);
        if (allowForecastFallback) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            if (end >= today) {
                console.warn("[DEBUG dataService.js] Falling back to forecast data for recent dates.");
                return fetchRecentData(lat, lon, start, end, cacheStore);
            }
        }
        if (isOpenMeteoError(error)) {
            throw error;
        }
        throw new OpenMeteoError("Open-Meteo request failed.", error);
    }
}

/**
 * Fetches full-year historical data for a specific latitude, longitude, and year.
 * @param {number} lat - Latitude.
 * @param {number} lon - Longitude.
 * @param {Date} start - Start date (beginning of the year).
 * @param {Date} end - End date (end of the year).
 * @returns {Promise<Object>} - The full-year historical data.
 */
async function fetchHistoricalYear(lat, lon, start, end, cacheStore) {
    const roundedLat = Math.round(lat * 100) / 100;
    const roundedLon = Math.round(lon * 100) / 100;
    const url = `https://archive-api.open-meteo.com/v1/era5?latitude=${roundedLat}&longitude=${roundedLon}&start_date=${formatDateLocal(
        start
    )}&end_date=${formatDateLocal(end)}&daily=temperature_2m_mean&timezone=Europe%2FBerlin`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new OpenMeteoError(`Open-Meteo error: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        ensureDailyData(data, "historical-year");
        return data;
    } catch (error) {
        console.error(`[DEBUG dataService.js] Error fetching full-year data: ${error.message}`);
        if (isOpenMeteoError(error)) {
            throw error;
        }
        throw new OpenMeteoError("Open-Meteo request failed.", error);
    }
}

/**
 * Extracts a specific date range from a full-year dataset.
 * @param {Object} yearData - The cached full-year data.
 * @param {Date} start - Start date for extraction.
 * @param {Date} end - End date for extraction.
 * @returns {Object} - The extracted data within the specified date range.
 */
function extractDateRangeFromYearData(yearData, start, end) {
    const startStr = formatDateLocal(start);
    const endStr = formatDateLocal(end);
    const indices = yearData.daily.time.map((date, idx) =>
        date >= startStr && date <= endStr ? idx : null
    ).filter(idx => idx !== null);

    return {
        daily: {
            time: indices.map(idx => yearData.daily.time[idx]),
            temperature_2m_mean: indices.map(idx => yearData.daily.temperature_2m_mean[idx]),
        },
    };
}

/**
 * Fetches recent data (forecast) based on latitude, longitude, and date range.
 * @param {number} lat - Latitude.
 * @param {number} lon - Longitude.
 * @param {Date} start - Start date.
 * @param {Date} end - End date.
 * @returns {Promise<Object>} - The fetched recent data.
 */
export async function fetchRecentData(lat, lon, start, end, cacheStore = null) {
    // Validate Date objects
    if (!isValidDate(start) || !isValidDate(end)) {
        throw new Error("Invalid start or end date provided.");
    }

    const cacheKey = computeCacheKey('recent', lat, lon, `${formatDateLocal(start)}_${formatDateLocal(end)}`);
    const cachedData = getCachedData(cacheKey, cacheStore);
    if (cachedData) {
        ensureDailyData(cachedData, "recent-cache");
        console.log(`[DEBUG dataService.js] Recent data loaded from cache (key=${cacheKey}).`);
        return cachedData;
    }

    const roundedLat = Math.round(lat * 100) / 100;
    const roundedLon = Math.round(lon * 100) / 100;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${roundedLat}&longitude=${roundedLon}&start_date=${formatDateLocal(
        start
    )}&end_date=${formatDateLocal(end)}&daily=temperature_2m_mean&timezone=Europe%2FBerlin`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new OpenMeteoError(`Open-Meteo error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        ensureDailyData(data, "recent");
        setCachedData(cacheKey, data, cacheStore);
        return data;
    } catch (error) {
        console.error(`[DEBUG dataService.js] Error fetching recent data: ${error.message}`);
        if (isOpenMeteoError(error)) {
            throw error;
        }
        throw new OpenMeteoError("Open-Meteo request failed.", error);
    }
}
