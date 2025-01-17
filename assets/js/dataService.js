/**
 * @module dataService
 * Handles fetching and caching of historical and recent weather data.
 */

import { formatDateLocal, isValidDate } from './utils.js';
import { DataCache } from './data_cache.js';

// Create a single DataCache instance
const dataCache = new DataCache();

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
export async function fetchHistoricalData(lat, lon, start, end) {
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

        // Compute cache key for the entire year
        const yearKey = dataCache.computeKey('historical', lat, lon, startYear);
        const cachedYearData = dataCache.get(yearKey);
        if (cachedYearData) {
            console.log(`[DEBUG dataService.js] Cached full-year data found for ${yearKey}.`);
            return extractDateRangeFromYearData(cachedYearData, start, end);
        }

        // Fetch the full year if not cached
        const fullYearStart = new Date(startYear, 0, 1);
        const fullYearEnd = new Date(startYear, 11, 31);

        console.log(`[DEBUG dataService.js] Fetching full-year data for ${startYear}.`);
        const data = await fetchHistoricalYear(lat, lon, fullYearStart, fullYearEnd);

        dataCache.set(yearKey, data);
        return extractDateRangeFromYearData(data, start, end);
    }

    // Handle current year as usual (date range caching)
    const cacheKey = dataCache.computeKey(
        'historical',
        lat,
        lon,
        `${formatDateLocal(start)}_${formatDateLocal(end)}`
    );
    const cachedData = dataCache.get(cacheKey);
    if (cachedData) {
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
            throw new Error(`Error fetching historical data: ${response.status} ${response.statusText}`);
        }
        const data = await response.json();
        dataCache.set(cacheKey, data);
        return data;
    } catch (error) {
        console.error(`[DEBUG dataService.js] Error fetching historical data: ${error.message}`);
        throw error;
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
export async function fetchHistoricalYear(lat, lon, start, end) {
    const roundedLat = Math.round(lat * 100) / 100;
    const roundedLon = Math.round(lon * 100) / 100;
    const url = `https://archive-api.open-meteo.com/v1/era5?latitude=${roundedLat}&longitude=${roundedLon}&start_date=${formatDateLocal(
        start
    )}&end_date=${formatDateLocal(end)}&daily=temperature_2m_mean&timezone=Europe%2FBerlin`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Error fetching full-year data: ${response.status} ${response.statusText}`);
        }
        return await response.json();
    } catch (error) {
        console.error(`[DEBUG dataService.js] Error fetching full-year data: ${error.message}`);
        throw error;
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
    const indices = yearData.daily.time
        .map((date, idx) => (date >= startStr && date <= endStr ? idx : null))
        .filter(idx => idx !== null);

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
export async function fetchRecentData(lat, lon, start, end) {
    if (!isValidDate(start) || !isValidDate(end)) {
        throw new Error("Invalid start or end date provided.");
    }

    const cacheKey = dataCache.computeKey(
        'recent',
        lat,
        lon,
        `${formatDateLocal(start)}_${formatDateLocal(end)}`
    );
    const cachedData = dataCache.get(cacheKey);
    if (cachedData) {
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
            throw new Error(`Error fetching recent data: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        dataCache.set(cacheKey, data);
        return data;
    } catch (error) {
        console.error(`[DEBUG dataService.js] Error fetching recent data: ${error.message}`);
        throw error;
    }
}
