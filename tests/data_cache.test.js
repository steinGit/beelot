/**
 * @module data_cache.test
 * Test suite for the DataCache class.
 */

import { DataCache } from '../assets/js/data_cache.js';

describe('DataCache', () => {
  // A simple mock for localStorage if needed
  if (typeof localStorage === 'undefined') {
    global.localStorage = {
      store: {},
      getItem(key) {
        return this.store[key] || null;
      },
      setItem(key, value) {
        this.store[key] = value;
      },
      removeItem(key) {
        delete this.store[key];
      },
      clear() {
        this.store = {};
      },
    };
  }

  // Clear localStorage before each test
  beforeEach(() => {
    localStorage.clear();
  });

  test('set/get data works as expected', () => {
    const cache = new DataCache();
    const testKey = 'test_key';
    const testData = { foo: 'bar' };

    cache.set(testKey, testData);
    const retrievedData = cache.get(testKey);

    expect(retrievedData).toEqual(testData);
  });

  test('get returns null for non-existing key', () => {
    const cache = new DataCache();
    const missingData = cache.get('non_existing_key');

    expect(missingData).toBeNull();
  });

  test('computeKey returns the correct format', () => {
    const cache = new DataCache();
    const computedKey = cache.computeKey('historical', 48.7758, 9.1829, 'someRange');
    const expectedKey = 'historical_48.78_9.18_someRange';

    expect(computedKey).toBe(expectedKey);
  });
});
