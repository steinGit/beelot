describe('ui module exports', () => {
    beforeEach(() => {
        localStorage.clear();
        jest.resetModules();
        document.body.innerHTML = `
            <input id="datum" value="2025-01-01" />
            <input id="ort" value="Lat: 51.1657, Lon: 10.4515" />
            <select id="zeitraum"></select>
            <button id="berechnen-btn"></button>
            <button id="ort-karte-btn"></button>
            <button id="map-close-btn"></button>
            <button id="map-save-btn"></button>
            <button id="datum-plus"></button>
            <button id="datum-minus"></button>
            <button id="datum-heute"></button>
            <button id="toggle-gts-plot"></button>
            <div id="gts-plot-container"></div>
            <button id="toggle-temp-plot"></button>
            <div id="temp-plot-container"></div>
            <output id="location-name"></output>
            <div id="location-tabs"></div>
            <div id="location-panel"></div>
            <div id="map"></div>
            <div id="map-popup"></div>
            <label><input type="radio" name="gts-range" value="1" checked /></label>
            <label><input type="radio" name="gts-range" value="5" /></label>
            <label><input type="radio" name="gts-range" value="10" /></label>
            <label><input type="radio" name="gts-color-scheme" value="queen" checked /></label>
            <label><input type="radio" name="gts-color-scheme" value="turbo" /></label>
            <label><input type="radio" name="gts-color-scheme" value="temperature" /></label>
        `;
    });

    test('exports DOM references when elements exist', async () => {
        const ui = await import('../assets/js/ui');
        expect(ui.ortInput).toBeInstanceOf(HTMLElement);
        expect(ui.datumInput).toBeInstanceOf(HTMLElement);
        expect(ui.locationNameOutput).toBeInstanceOf(HTMLElement);
        expect(ui.locationTabsContainer).toBeInstanceOf(HTMLElement);
        expect(ui.locationPanel).toBeInstanceOf(HTMLElement);
    });

    test('exports map helper functions without browser globals', async () => {
        const ui = await import('../assets/js/ui');
        expect(typeof ui.initOrUpdateMap).toBe('function');
        expect(typeof ui.saveMapSelection).toBe('function');
        expect(window.initOrUpdateMap).toBeUndefined();
        expect(window.saveMapSelection).toBeUndefined();
    });

    test('normalizes a longitude from a repeated map world before saving', async () => {
        const handlers = {};
        const map = {
            setView: jest.fn().mockReturnThis(),
            on: jest.fn((eventName, handler) => { handlers[eventName] = handler; }),
            getCenter: jest.fn(() => ({ lat: 44.87535, lng: 266.54348 })),
            getZoom: jest.fn(() => 12),
            removeLayer: jest.fn()
        };
        const marker = { addTo: jest.fn().mockReturnThis() };
        global.L = {
            map: jest.fn(() => map),
            tileLayer: jest.fn(() => ({ addTo: jest.fn() })),
            marker: jest.fn(() => marker)
        };

        const { initOrUpdateMap, saveMapSelection } = await import('../assets/js/ui');
        const { getActiveLocation } = await import('../assets/js/locationStore');
        initOrUpdateMap();
        handlers.click({ latlng: { lat: 44.87535, lng: 266.54348 } });
        saveMapSelection();

        expect(getActiveLocation().coordinates.lon).toBeCloseTo(-93.45652, 5);
        expect(document.querySelector('#ort').value)
            .toBe('Lat: 44.87535°, Lon: -93.45652°');
    });

    test('stores map movement and refreshes map sizing when reopened', async () => {
        jest.useFakeTimers();
        const handlers = {};
        const map = {
            setView: jest.fn().mockReturnThis(),
            on: jest.fn((eventName, handler) => { handlers[eventName] = handler; }),
            getCenter: jest.fn(() => ({ lat: 48.1, lng: 9.2 })),
            getZoom: jest.fn(() => 11),
            removeLayer: jest.fn(),
            invalidateSize: jest.fn()
        };
        global.L = {
            map: jest.fn(() => map),
            tileLayer: jest.fn(() => ({ addTo: jest.fn() })),
            marker: jest.fn(() => ({ addTo: jest.fn().mockReturnThis() }))
        };
        const { initOrUpdateMap } = await import('../assets/js/ui');

        initOrUpdateMap();
        handlers.moveend();
        expect(JSON.parse(localStorage.getItem('beelotLastMapView'))).toEqual({
            lat: 48.1,
            lon: 9.2,
            zoom: 11
        });

        initOrUpdateMap();
        jest.advanceTimersByTime(100);
        expect(map.invalidateSize).toHaveBeenCalledTimes(1);
        jest.useRealTimers();
    });
});
