/**
 * @module LocationNameFromGPS
 * Handles reverse geocoding to convert GPS coordinates into human-readable location names with caching and verbose logging.
 */

export class LocationNameFromGPS {
  /**
   * Constructs a new LocationNameFromGPS instance.
   * @param {Object} options - Configuration options.
   * @param {string} [options.apiUrl] - The reverse geocoding API URL.
   * @param {string} [options.email] - Contact email as required by Nominatim.
   * @param {number} [options.cachePrecision] - Number of decimal places for lat/lon in cache keys.
   * @param {boolean} [options.verbose] - Enables verbose logging if true.
   * @param {Object} [options.cacheStore] - Optional cache store with get/set methods.
   */
  constructor(options = {}) {
    this.apiUrl = options.apiUrl || 'https://nominatim.openstreetmap.org/reverse';
    this.email = options.email || 'your-email@example.com'; // Replace with your actual email
    this.cachePrecision = options.cachePrecision || 4; // Default precision
    this.verbose = true; // Hardwired to true as per request
    this.cacheStore = options.cacheStore || null;
  }

  /**
   * Generates a cache key based on latitude and longitude with specified precision.
   * @param {number} lat - Latitude.
   * @param {number} lon - Longitude.
   * @returns {string} - The generated cache key.
   */
  _generateCacheKey(lat, lon) {
    const roundedLat = lat.toFixed(this.cachePrecision);
    const roundedLon = lon.toFixed(this.cachePrecision);
    return `location_${roundedLat}_${roundedLon}`;
  }

  /**
   * Fetches the location name based on latitude and longitude.
   * Utilizes localStorage to cache results and minimize API calls.
   * @param {number} lat - Latitude.
   * @param {number} lon - Longitude.
   * @returns {Promise<string>} - The human-readable location name.
   */
  async getLocationName(lat, lon) {
    if (typeof lat !== 'number' || typeof lon !== 'number') {
      throw new Error('Latitude and Longitude must be numbers.');
    }

    const cacheKey = this._generateCacheKey(lat, lon);
    const cachedName = this.cacheStore ? this.cacheStore.get(cacheKey) : localStorage.getItem(cacheKey);

    if (cachedName) {
      if (this.verbose) {
        console.log(`[LocationNameFromGPS] Retrieved from cache (${cacheKey}): ${cachedName}`);
      }
      return cachedName;
    }

    if (this.verbose) {
      console.log(`[LocationNameFromGPS] Cache miss for (${lat.toFixed(this.cachePrecision)}, ${lon.toFixed(this.cachePrecision)}). Fetching from API...`);
    }

    const params = new URLSearchParams({
      format: 'jsonv2',
      lat: lat.toString(),
      lon: lon.toString(),
      addressdetails: '1',
      zoom: '18', // Adjust zoom level as needed for precision
      email: this.email
    });

    const url = `${this.apiUrl}?${params.toString()}`;

    try {
      const response = await fetch(url, {
        headers: {
          'Accept-Language': 'de' // Set response language to German
        }
      });

      if (!response.ok) {
        throw new Error(`Reverse geocoding failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      if (data.error || !data.address) {
        throw new Error('No address found for the given coordinates.');
      }

      // Extract address components
      const { city, town, village, road, house_number, state, country } = data.address;

      // Determine the nearest city or town
      const nearestPlace = city || town || village;

      // Construct a readable location name
      const parts = [];
      if (house_number && road) {
        parts.push(`${road} ${house_number}`);
      }
      if (nearestPlace) {
        parts.push(nearestPlace);
      } else if (!house_number && !road && state) {
        parts.push(state);
      }
      if (country) {
        parts.push(country);
      }

      let locationName = parts.join(', ');

      // Fallback if constructed name is empty
      if (!locationName) {
        locationName = data.display_name || 'Unbekannter Standort';
      }

      // Cache the result
      if (this.cacheStore) {
        this.cacheStore.set(cacheKey, locationName);
      } else {
        localStorage.setItem(cacheKey, locationName);
      }
      if (this.verbose) {
        console.log(`[LocationNameFromGPS] Fetched from API and cached (${cacheKey}): ${locationName}`);
      }

      return locationName;
    } catch (error) {
      console.error(`[LocationNameFromGPS] Error: ${error.message}`);
      return 'Standort konnte nicht ermittelt werden.';
    }
  }

  /**
   * Clears the cache for a specific location.
   * @param {number} lat - Latitude.
   * @param {number} lon - Longitude.
   */
  clearCache(lat, lon) {
    const cacheKey = this._generateCacheKey(lat, lon);
    if (this.cacheStore) {
      this.cacheStore.remove(cacheKey);
      return;
    }
    localStorage.removeItem(cacheKey);
    if (this.verbose) {
      console.log(`[LocationNameFromGPS] Cache cleared for key: ${cacheKey}`);
    }
  }

  /**
   * Clears the entire location cache.
   */
  clearAllCache() {
    if (this.cacheStore) {
      this.cacheStore.clear();
      if (this.verbose) {
        console.log("[LocationNameFromGPS] Cache cleared for active location.");
      }
      return;
    }

    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('location_')) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => {
      localStorage.removeItem(key);
      if (this.verbose) {
        console.log(`[LocationNameFromGPS] Cache cleared for key: ${key}`);
      }
    });
  }
}
