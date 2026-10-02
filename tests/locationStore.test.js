describe('locationStore', () => {
    beforeEach(() => {
        localStorage.clear();
        jest.resetModules();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('initializes with a default location', async () => {
        const {
            getActiveLocation,
            getLocationsInOrder
        } = await import('../assets/js/locationStore');

        const locations = getLocationsInOrder();
        expect(locations).toHaveLength(1);
        expect(locations[0].name).toBe('Standort 1');
        expect(getActiveLocation().id).toBe(locations[0].id);
    });

    test('creates and deletes locations without affecting the first entry', async () => {
        const {
            createLocationEntry,
            deleteLocationEntry,
            getActiveLocation,
            getLocationsInOrder,
            renameLocation
        } = await import('../assets/js/locationStore');

        const first = getActiveLocation();
        const second = createLocationEntry();
        expect(getLocationsInOrder()).toHaveLength(2);
        renameLocation(second.id, 'Garten');
        expect(getLocationsInOrder()[1].name).toBe('Garten');
        const deleted = deleteLocationEntry(second.id);
        expect(deleted).toBe(true);
        expect(getLocationsInOrder()).toHaveLength(1);
        expect(getActiveLocation().id).toBe(first.id);
    });

    test('normalizes a wrapped western longitude from stored location data', async () => {
        localStorage.setItem('beelotLocations', JSON.stringify({
            version: 1,
            nextId: 2,
            order: ['loc-1'],
            activeId: 'loc-1',
            locations: {
                'loc-1': {
                    id: 'loc-1',
                    name: 'Minneapolis',
                    coordinates: { lat: 44.87535, lon: 266.54348 }
                }
            }
        }));

        const { formatCoordinates, getActiveLocation } = await import('../assets/js/locationStore');
        const coordinates = getActiveLocation().coordinates;

        expect(coordinates.lat).toBe(44.87535);
        expect(coordinates.lon).toBeCloseTo(-93.45652, 5);
        expect(formatCoordinates(44.87535, 266.54348))
            .toBe('Lat: 44.87535°, Lon: -93.45652°');
    });

    test('invalidates derived calculations when coordinates change', async () => {
        const { getActiveLocation, updateLocation } = await import('../assets/js/locationStore');
        const locationId = getActiveLocation().id;
        updateLocation(locationId, (location) => {
            location.coordinates = { lat: 48, lon: 9 };
        });
        updateLocation(locationId, (location) => {
            location.cache.weather.keep = { daily: true };
            location.cache.locationName.keep = 'Old place';
            location.calculations = {
                gtsResults: [{ date: '2026-01-01', gts: 5 }],
                filteredResults: [{ date: '2026-01-01', gts: 5 }],
                temps: { dates: ['2026-01-01'], values: [10] },
                locationLabel: 'Old place',
                lastGtsKey: '2026-01-01|ytd',
                gtsYearCurves: { '2026-01-01|ytd|1': [{ year: 2026 }] },
                axisStats: { gts: { key: 'old', min: 0, max: 5, count: 1 } }
            };
        });

        updateLocation(locationId, (location) => {
            location.coordinates = { lat: 52, lon: 13 };
        });

        const updated = getActiveLocation();
        expect(updated.calculations).toEqual({
            gtsResults: null,
            filteredResults: null,
            temps: { dates: [], values: [] },
            locationLabel: '',
            lastGtsKey: '',
            gtsYearCurves: {}
        });
        expect(updated.cache.weather.keep).toEqual({ daily: true });
        expect(updated.cache.locationName.keep).toBe('Old place');
    });

    test('retains calculations when an update keeps equivalent coordinates', async () => {
        const { getActiveLocation, updateLocation } = await import('../assets/js/locationStore');
        const locationId = getActiveLocation().id;
        updateLocation(locationId, (location) => {
            location.coordinates = { lat: 44.87535, lon: -93.45652 };
        });
        updateLocation(locationId, (location) => {
            location.calculations.gtsResults = [{ date: '2026-01-01', gts: 5 }];
        });

        updateLocation(locationId, (location) => {
            location.coordinates = { lat: 44.87535, lon: 266.54348 };
        });

        expect(getActiveLocation().calculations.gtsResults)
            .toEqual([{ date: '2026-01-01', gts: 5 }]);
    });

    test('keeps derived calculations in memory instead of persistent storage', async () => {
        const { getActiveLocation, updateLocation } = await import('../assets/js/locationStore');
        const locationId = getActiveLocation().id;

        updateLocation(locationId, (location) => {
            location.calculations.gtsResults = [{ date: '2026-01-01', gts: 5 }];
        });

        expect(getActiveLocation().calculations.gtsResults)
            .toEqual([{ date: '2026-01-01', gts: 5 }]);
        const persisted = JSON.parse(localStorage.getItem('beelotLocations'));
        expect(persisted.locations[locationId].calculations.gtsResults).toBeNull();
        expect(persisted.locations[locationId].calculations).not.toHaveProperty('hinweisHtml');
    });

    test('evicts the oldest weather cache entry and retries after quota failure', async () => {
        const store = await import('../assets/js/locationStore');
        const locationId = store.getActiveLocation().id;
        const weatherCache = store.createWeatherCacheStore(locationId);
        weatherCache.set('older', { cachedAt: 1, data: { value: 'old' } });
        weatherCache.set('newer', { cachedAt: 2, data: { value: 'new' } });

        const originalSetItem = Storage.prototype.setItem;
        let quotaRaised = false;
        jest.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
            if (key === 'beelotLocations' && !quotaRaised) {
                quotaRaised = true;
                throw new DOMException('Storage full', 'QuotaExceededError');
            }
            return originalSetItem.call(this, key, value);
        });
        jest.spyOn(console, 'warn').mockImplementation(() => {});

        store.renameLocation(locationId, 'After quota retry');

        expect(store.getActiveLocation().name).toBe('After quota retry');
        expect(weatherCache.get('older')).toBeNull();
        expect(weatherCache.get('newer')).toEqual({
            cachedAt: 2,
            data: { value: 'new' }
        });
        expect(localStorage.getItem('beelotLocations')).not.toBeNull();
    });

    test('applies location changes received from another browser tab', async () => {
        const store = await import('../assets/js/locationStore');
        const first = store.getActiveLocation();
        store.updateLocation(first.id, (location) => {
            location.calculations.gtsResults = [{ date: '2026-01-01', gts: 5 }];
        });
        const external = JSON.parse(localStorage.getItem('beelotLocations'));
        external.nextId = 3;
        external.order.push('loc-2');
        external.locations['loc-2'] = {
            id: 'loc-2',
            name: 'Other tab',
            coordinates: null,
            cache: { weather: {}, locationName: {} },
            calculations: null,
            ui: null
        };

        window.dispatchEvent(new StorageEvent('storage', {
            key: 'beelotLocations',
            newValue: JSON.stringify(external)
        }));

        expect(store.getLocationsInOrder().map((location) => location.name))
            .toEqual(['Standort 1', 'Other tab']);
        expect(store.getLocationById(first.id).calculations.gtsResults)
            .toEqual([{ date: '2026-01-01', gts: 5 }]);
    });

    test('discards local calculations when another tab changes the coordinates', async () => {
        const store = await import('../assets/js/locationStore');
        const first = store.getActiveLocation();
        store.updateLocation(first.id, (location) => {
            location.coordinates = { lat: 48, lon: 9 };
        });
        store.updateLocation(first.id, (location) => {
            location.calculations.gtsResults = [{ date: '2026-01-01', gts: 5 }];
        });
        const external = JSON.parse(localStorage.getItem('beelotLocations'));
        external.locations[first.id].coordinates = { lat: 49, lon: 10 };

        window.dispatchEvent(new StorageEvent('storage', {
            key: 'beelotLocations',
            newValue: JSON.stringify(external)
        }));

        expect(store.getLocationById(first.id).coordinates).toEqual({ lat: 49, lon: 10 });
        expect(store.getLocationById(first.id).calculations.gtsResults).toBeNull();
    });
});
