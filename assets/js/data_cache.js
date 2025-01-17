/**
 * @module data_cache
 * Provides a DataCache class for getting/setting cached data and computing cache keys.
 */

export class DataCache {
    /**
     * Returns parsed data from localStorage if it exists.
     * @param {string} key - The key to retrieve from localStorage.
     * @returns {Object|null} - Parsed data or null if not found.
     */
    get(key) {
        const cached = localStorage.getItem(key);
        if (cached) {
            return JSON.parse(cached);
        }
        return null;
    }

    /**
     * Stringifies and stores data in localStorage under the given key.
     * @param {string} key - The storage key.
     * @param {Object} data - The data to store.
     */
    set(key, data) {
        localStorage.setItem(key, JSON.stringify(data));
    }

    /**
     * Computes a localStorage cache key based on the given parameters.
     * @param {string} type - The type of data (e.g., 'historical', 'recent').
     * @param {number} lat - Latitude, rounded to two decimal places.
     * @param {number} lon - Longitude, rounded to two decimal places.
     * @param {number|string} yearOrRange - The year or date range string.
     * @returns {string} - The computed cache key.
     */
    computeKey(type, lat, lon, yearOrRange) {
        const roundedLat = Math.round(lat * 100) / 100;
        const roundedLon = Math.round(lon * 100) / 100;
        return `${type}_${roundedLat}_${roundedLon}_${yearOrRange}`;
    }
}
