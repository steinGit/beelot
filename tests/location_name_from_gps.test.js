// FILE: /home/fridtjofstein/privat/beelot/tests/location_name_from_gps.test.js

import { LocationNameFromGPS } from '../assets/js/location_name_from_gps.js';

// Mock fetch globally
global.fetch = jest.fn();

// Mock console.error to suppress error logs during tests
beforeAll(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterAll(() => {
  console.error.mockRestore();
});

describe('LocationNameFromGPS', () => {
  const validResponse = {
    address: {
      city: "Ostfildern",
      road: "Helene-Lange-Straße",
      house_number: "52",
      state: "Baden-Württemberg",
      country: "Deutschland"
    },
    display_name: "Helene-Lange-Straße 52, Ostfildern, Baden-Württemberg, Deutschland"
  };

  const nearResponse = {
    address: {
      suburb: "Ostfildern",
      city: "Ostfildern",
      state: "Baden-Württemberg",
      country: "Deutschland"
    },
    display_name: "Ostfildern, Baden-Württemberg, Deutschland"
  };

  const noAddressResponse = {
    error: "Unable to geocode"
  };

  beforeEach(() => {
    fetch.mockClear();
  });

  test('should return full address when available', async () => {
    const cacheStore = new Map();
    const instance = new LocationNameFromGPS({
      email: 'test@example.com',
      cacheStore: {
        get: (key) => cacheStore.get(key),
        set: (key, value) => cacheStore.set(key, value),
        remove: (key) => cacheStore.delete(key),
        clear: () => cacheStore.clear()
      }
    });
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => validResponse
    });

    const locationName = await instance.getLocationName(48.72, 9.28);
    expect(locationName).toBe("Helene-Lange-Straße 52, Ostfildern, Deutschland");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test('should return suburb and city when house_number is missing', async () => {
    const cacheStore = new Map();
    const instance = new LocationNameFromGPS({
      email: 'test@example.com',
      cacheStore: {
        get: (key) => cacheStore.get(key),
        set: (key, value) => cacheStore.set(key, value),
        remove: (key) => cacheStore.delete(key),
        clear: () => cacheStore.clear()
      }
    });
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => nearResponse
    });

    const locationName = await instance.getLocationName(48.72, 9.28);
    expect(locationName).toBe("Ostfildern, Deutschland");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test('should handle no address found gracefully', async () => {
    const cacheStore = new Map();
    const instance = new LocationNameFromGPS({
      email: 'test@example.com',
      cacheStore: {
        get: (key) => cacheStore.get(key),
        set: (key, value) => cacheStore.set(key, value),
        remove: (key) => cacheStore.delete(key),
        clear: () => cacheStore.clear()
      }
    });
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => noAddressResponse
    });

    const locationName = await instance.getLocationName(0, 0);
    expect(locationName).toBe("Standort konnte nicht ermittelt werden.");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test('should handle fetch errors gracefully', async () => {
    const cacheStore = new Map();
    const instance = new LocationNameFromGPS({
      email: 'test@example.com',
      cacheStore: {
        get: (key) => cacheStore.get(key),
        set: (key, value) => cacheStore.set(key, value),
        remove: (key) => cacheStore.delete(key),
        clear: () => cacheStore.clear()
      }
    });
    fetch.mockRejectedValueOnce(new Error('Network error'));

    const locationName = await instance.getLocationName(48.72, 9.28);
    expect(locationName).toBe("Standort konnte nicht ermittelt werden.");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test('should throw error for invalid coordinates', async () => {
    const cacheStore = new Map();
    const instance = new LocationNameFromGPS({
      email: 'test@example.com',
      cacheStore: {
        get: (key) => cacheStore.get(key),
        set: (key, value) => cacheStore.set(key, value),
        remove: (key) => cacheStore.delete(key),
        clear: () => cacheStore.clear()
      }
    });
    await expect(instance.getLocationName('invalid', 9.28)).rejects.toThrow('Latitude and Longitude must be numbers.');
    await expect(instance.getLocationName(48.72, 'invalid')).rejects.toThrow('Latitude and Longitude must be numbers.');
    expect(fetch).toHaveBeenCalledTimes(0);
  });

  test('should handle non-OK responses gracefully', async () => {
    const cacheStore = new Map();
    const instance = new LocationNameFromGPS({
      email: 'test@example.com',
      cacheStore: {
        get: (key) => cacheStore.get(key),
        set: (key, value) => cacheStore.set(key, value),
        remove: (key) => cacheStore.delete(key),
        clear: () => cacheStore.clear()
      }
    });
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      json: async () => ({})
    });

    const locationName = await instance.getLocationName(48.72, 9.28);
    expect(locationName).toBe("Standort konnte nicht ermittelt werden.");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
