import { readFileSync } from 'node:fs';

jest.mock('../assets/js/plotUpdater.js', () => ({
    PlotUpdater: jest.fn().mockImplementation(() => ({
        invalidatePendingDisplay: jest.fn(),
        run: jest.fn().mockResolvedValue(undefined),
        setLocationId: jest.fn()
    }))
}));

beforeEach(() => {
    localStorage.clear();
    jest.resetModules();
    const page = new DOMParser().parseFromString(readFileSync('index.html', 'utf8'), 'text/html');
    document.body.innerHTML = page.body.innerHTML;
    global.Chart = { getChart: jest.fn() };
});

test('persists horizon and plot choices and handles regenerated forecast controls', async () => {
    const { PlotUpdater } = await import('../assets/js/plotUpdater.js');
    await import('../assets/js/main.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    const updater = PlotUpdater.mock.results.at(-1).value;
    const initialRuns = updater.run.mock.calls.length;
    const horizon = document.getElementById('prediction-horizon');
    horizon.value = '21';
    horizon.dispatchEvent(new Event('change', { bubbles: true }));
    const checkbox = document.getElementById('show-gts-prediction');
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    expect(JSON.parse(localStorage.getItem('beelotPredictionSettings'))).toEqual({
        historyYears: 10, horizonDays: 21, showPrediction: false
    });
    horizon.outerHTML = '<select id="prediction-horizon"><option value="28">4 Wochen</option></select>';
    document.getElementById('prediction-horizon').dispatchEvent(new Event('change', { bubbles: true }));
    expect(JSON.parse(localStorage.getItem('beelotPredictionSettings')).horizonDays).toBe(28);
    expect(updater.run).toHaveBeenCalledTimes(initialRuns + 3);
});

test('refreshes controls when prediction preferences change in another page', async () => {
    localStorage.setItem('beelotPredictionSettings', JSON.stringify({ historyYears: 3, horizonDays: 28, showPrediction: false }));
    const { PlotUpdater } = await import('../assets/js/plotUpdater.js');
    await import('../assets/js/main.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    const updater = PlotUpdater.mock.results.at(-1).value;
    expect(document.getElementById('prediction-horizon').value).toBe('28');
    expect(document.getElementById('show-gts-prediction').checked).toBe(false);
    localStorage.setItem('beelotPredictionSettings', JSON.stringify({ historyYears: 5, horizonDays: 14, showPrediction: true }));
    const initialRuns = updater.run.mock.calls.length;
    window.dispatchEvent(new StorageEvent('storage', { key: 'beelotPredictionSettings' }));
    expect(document.getElementById('prediction-horizon').value).toBe('14');
    expect(document.getElementById('show-gts-prediction').checked).toBe(true);
    expect(updater.run).toHaveBeenCalledTimes(initialRuns + 1);
});

test('a fresh visit starts at today instead of the previous visit date', async () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 9, 20, 12));
    try {
        localStorage.setItem('beelotLocations', JSON.stringify({
            version: 1, nextId: 2, order: ['loc-1'], activeId: 'loc-1',
            locations: { 'loc-1': { id: 'loc-1', name: 'Test location', ui: {
                selectedDate: '2026-10-06', zeitraum: 'ytd', gtsYearRange: 5
            } } }
        }));
        const { PlotUpdater } = await import('../assets/js/plotUpdater.js');
        await import('../assets/js/main.js');
        document.dispatchEvent(new Event('DOMContentLoaded'));
        expect(document.getElementById('datum').value).toBe('2026-10-20');
        expect(PlotUpdater.mock.results.at(-1).value.run).toHaveBeenCalled();
        const store = JSON.parse(localStorage.getItem('beelotLocations'));
        expect(store.locations['loc-1'].ui.selectedDate).toBe('2026-10-20');
    } finally {
        jest.useRealTimers();
    }
});

test('refreshes information after frost settings change in another page', async () => {
    const { PlotUpdater } = await import('../assets/js/plotUpdater.js');
    await import('../assets/js/main.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    const updater = PlotUpdater.mock.results.at(-1).value;
    const initialRuns = updater.run.mock.calls.length;
    localStorage.setItem('beelotWinterTreatment', JSON.stringify({ enabled: false }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'beelotWinterTreatment' }));
    expect(updater.run).toHaveBeenCalledTimes(initialRuns + 1);
});

test.each([
    ['Nächster Tag', '2024-02-28', '2024-02-29'],
    ['Nächster Tag', '2024-02-29', '2024-03-01'],
    ['Vorheriger Tag', '2024-03-01', '2024-02-29'],
    ['Nächster Tag', '2024-12-31', '2025-01-01'],
    ['Vorheriger Tag', '2025-01-01', '2024-12-31']
])('the named date action %s changes %s to %s once', async (name, start, expected) => {
    const { PlotUpdater } = await import('../assets/js/plotUpdater.js');
    await import('../assets/js/main.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    const updater = PlotUpdater.mock.results.at(-1).value;
    const initialRuns = updater.run.mock.calls.length;
    const date = document.getElementById('datum');
    date.value = start;

    document.querySelector(`button[aria-label="${name}"]`).click();

    expect(date.value).toBe(expected);
    expect(updater.run).toHaveBeenCalledTimes(initialRuns + 1);
    const store = JSON.parse(localStorage.getItem('beelotLocations'));
    expect(store.locations[store.activeId].ui.selectedDate).toBe(expected);
});

test('the named today action restores the local date and retains the date label', async () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 10, 3, 12));
    try {
        await import('../assets/js/main.js');
        document.dispatchEvent(new Event('DOMContentLoaded'));
        const date = document.getElementById('datum');
        date.value = '2024-02-29';

        document.querySelector('button[aria-label="Heute anzeigen"]').click();

        expect(date.value).toBe('2026-11-03');
        expect(date.labels[0].textContent.trim()).toBe('Datum:');
        expect(date.type).toBe('date');
    } finally {
        jest.useRealTimers();
    }
});

test('date shortcuts still work when a date button has keyboard focus', async () => {
    await import('../assets/js/main.js');
    document.dispatchEvent(new Event('DOMContentLoaded'));
    const date = document.getElementById('datum');
    date.value = '2024-02-28';
    document.querySelector('button[aria-label="Nächster Tag"]').focus();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: '+', bubbles: true }));
    expect(date.value).toBe('2024-02-29');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '-', bubbles: true }));
    expect(date.value).toBe('2024-02-28');
});
