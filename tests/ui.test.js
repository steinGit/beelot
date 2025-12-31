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
            <button id="toggle-5yr-plot"></button>
            <output id="location-name"></output>
            <div id="location-tabs"></div>
            <div id="location-panel"></div>
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

    test('registers map helper functions on window', async () => {
        await import('../assets/js/ui');
        expect(typeof window.initOrUpdateMap).toBe('function');
        expect(typeof window.saveMapSelection).toBe('function');
    });
});
