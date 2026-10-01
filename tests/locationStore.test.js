describe('locationStore', () => {
    beforeEach(() => {
        localStorage.clear();
        jest.resetModules();
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
                hinweisHtml: '<p>Old location</p>',
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
            hinweisHtml: '',
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
});
