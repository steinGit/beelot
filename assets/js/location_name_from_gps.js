// FILE: /home/fridtjofstein/privat/beelot/assets/js/location_name_from_gps.js

/**
 * @module LocationNameFromGPS
 * Handles reverse geocoding to convert GPS coordinates into human-readable location names.
 */

export class LocationNameFromGPS {
  /**
   * Constructs a new LocationNameFromGPS instance.
   * @param {Object} options - Configuration options.
   * @param {string} [options.apiUrl] - The reverse geocoding API URL.
   */
  constructor(options = {}) {
    this.apiUrl = options.apiUrl || 'https://nominatim.openstreetmap.org/reverse';
    this.email = options.email || 'info.beelot@gmail.com'; // Nominatim requires a valid email for identification
  }

  /**
   * Fetches the location name based on latitude and longitude.
   * @param {number} lat - Latitude.
   * @param {number} lon - Longitude.
   * @returns {Promise<string>} - The human-readable location name.
   */
  async getLocationName(lat, lon) {
    if (typeof lat !== 'number' || typeof lon !== 'number') {
      throw new Error('Latitude and Longitude must be numbers.');
    }

    const params = new URLSearchParams({
      format: 'jsonv2',
      lat: lat.toString(),
      lon: lon.toString(),
      addressdetails: '1',
      zoom: '10', // Adjust zoom level as needed
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

      // Construct a readable location name
      const { city, town, village, road, house_number, state, country } = data.address;
      let locationName = '';

      if (house_number && road) {
        locationName = `${road} ${house_number}, `;
      }

      if (city || town || village) {
        locationName += `${city || town || village}, `;
      }

      if (state) {
        locationName += `${state}, `;
      }

      if (country) {
        locationName += `${country}`;
      }

      // Trim any trailing commas and spaces
      locationName = locationName.replace(/,\s*$/, '');

      // Fallback if constructed name is empty
      if (!locationName) {
        locationName = data.display_name || 'Unbekannter Standort';
      }

      return locationName;
    } catch (error) {
      console.error(`[LocationNameFromGPS] Error: ${error.message}`);
      return 'Standort konnte nicht ermittelt werden.';
    }
  }
}
