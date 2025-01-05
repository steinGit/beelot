import { initializeUI, updatePlots } from '../assets/js/ui';

describe('updatePlots', () => {
    beforeEach(() => {
        // Mock DOM elements
        document.body.innerHTML = `
            <input id="datum" value="2025-01-01" />
            <input id="ort" value="Lat: 51.1657, Lon: 10.4515" />
            <div id="ergebnis-text"></div>
        `;

        // Initialize the UI module with mocked DOM
        initializeUI();
    });

    test('clears results if no location is provided', async () => {
        const ortInput = document.getElementById('ort');
        ortInput.value = ''; // Clear the input value
        await updatePlots();
        const resultText = document.getElementById('ergebnis-text').textContent;
        expect(resultText).toContain('Die Grünland-Temperatur-Summe wird berechnet');
    });

    test('does not clear results if location is provided', async () => {
        const ortInput = document.getElementById('ort');
        ortInput.value = 'Lat: 51.1657, Lon: 10.4515'; // Set valid location
        await updatePlots();
        const resultText = document.getElementById('ergebnis-text').textContent;
        expect(resultText).not.toContain('Die Grünland-Temperatur-Summe wird berechnet');
    });

    test('throws error if initializeUI is not called', async () => {
        // Reset the module to simulate uninitialized UI
        jest.resetModules();
        const { updatePlots } = await import('../assets/js/ui');
        await expect(updatePlots()).rejects.toThrow('UI elements not initialized. Call initializeUI() first.');
    });
});
