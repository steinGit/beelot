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
});
