import { appendPrediction, loadGtsPrediction, predictGTS } from '../assets/js/prediction.js';
import { fetchHistoricalData } from '../assets/js/dataService.js';
import { formatDateLocal } from '../assets/js/utils.js';
import { loadPredictionSettings, normalizePredictionSettings, savePredictionSettings } from '../assets/js/predictionSettings.js';

jest.mock('../assets/js/dataService.js', () => ({
    ...jest.requireActual('../assets/js/dataService.js'),
    fetchHistoricalData: jest.fn()
}));

const referenceYears = (year, dates, values) => Array.from({ length: 10 }, (_, index) => ({
    year: year - index - 1,
    results: dates.map((suffix, day) => ({ date: `${year - index - 1}-${suffix}`, gts: values(index + 1, day) }))
}));

beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
});

test.each([3, 4, 5, 6, 7, 8, 9, 10])('anchors the mean of exactly %i previous calendar years', (historyYears) => {
    const dates = ['04-12', ...Array.from({ length: 14 }, (_, day) => `04-${day + 13}`)];
    const years = referenceYears(2026, dates, (offset, day) => 1000 * offset + day * offset);
    const prediction = predictGTS([{ date: '2026-04-12', gts: 100 }], new Date(2026, 3, 12), years, { historyYears });
    expect(prediction.points).toHaveLength(14);
    prediction.points.forEach((point, index) => {
        expect(point.gts).toBe(100 + (index + 1) * (historyYears + 1) / 2);
        expect(point.predicted).toBe(true);
    });
});

test('interpolates February 29 without shifting March in non-leap references', () => {
    const dates = ['02-28', ...Array.from({ length: 15 }, (_, day) => `03-${String(day + 1).padStart(2, '0')}`)];
    const years = referenceYears(2024, dates, (_, day) => day ? 20 + day * 10 : 10);
    years.forEach(entry => {
        if (entry.year % 4 === 0) entry.results.splice(1, 0, { date: `${entry.year}-02-29`, gts: 20 });
    });
    const prediction = predictGTS([{ date: '2024-02-28', gts: 100 }], new Date(2024, 1, 28), years, { historyYears: 3 });
    expect(prediction.points.slice(0, 3).map(point => point.gts)).toEqual([110, 120, 130]);
    expect(prediction.points[0].date).toBe('2024-02-29');
    const onLeapDay = predictGTS([{ date: '2024-02-29', gts: 100 }], new Date(2024, 1, 29), years, { historyYears: 3 });
    expect(onLeapDay.points[0].gts).toBe(110);
});

test('stops at year end and keeps predictions separate from observed data', () => {
    const years = referenceYears(2026, ['12-30', '12-31'], (_, day) => 100 + day * 3);
    const observed = [{ date: '2026-12-30', gts: 50 }];
    const prediction = predictGTS(observed, new Date(2026, 11, 30), years, { historyYears: 3, horizonDays: 28 });
    expect(prediction.points).toEqual([{ date: '2026-12-31', gts: 53, predicted: true }]);
    expect(appendPrediction(observed, prediction)).toHaveLength(2);
    expect(observed).toHaveLength(1);
});

test('fails on missing reference values and unsupported historical years', async () => {
    expect(() => predictGTS([{ date: '2026-01-01', gts: 0 }], new Date(2026, 0, 1), [], { historyYears: 3 }))
        .toThrow('2025');
    await expect(loadGtsPrediction(48, 9, [], new Date(1941, 0, 1), { historyYears: 3 }))
        .rejects.toThrow('1940');
    expect(fetchHistoricalData).not.toHaveBeenCalled();
});

test('loads complete previous years through the original location-owned cache', async () => {
    fetchHistoricalData.mockImplementation(async (lat, lon, start, end) => {
        const time = [];
        for (const day = new Date(start); day <= end; day.setDate(day.getDate() + 1)) time.push(formatDateLocal(day));
        return { daily: { time, temperature_2m_mean: time.map(() => 10) } };
    });
    const cache = { get: jest.fn(), set: jest.fn() };
    const prediction = await loadGtsPrediction(48, 9, [{ date: '2026-01-01', gts: 5 }], new Date(2026, 0, 1), { historyYears: 3 }, cache);
    expect(prediction.points[0].gts).toBe(10);
    expect(prediction.points).toHaveLength(14);
    expect(fetchHistoricalData).toHaveBeenCalledTimes(3);
    expect(fetchHistoricalData).toHaveBeenCalledWith(48, 9, new Date(2025, 0, 1), new Date(2025, 11, 31), cache, false);
});

test('rejects missing temperatures instead of quietly averaging fewer years', async () => {
    fetchHistoricalData.mockResolvedValue({ daily: { time: ['2025-01-01'], temperature_2m_mean: [null] } });
    await expect(loadGtsPrediction(48, 9, [{ date: '2026-01-01', gts: 5 }], new Date(2026, 0, 1), { historyYears: 3 }))
        .rejects.toThrow('2025-01-01');
    expect(fetchHistoricalData).toHaveBeenCalledTimes(1);
});

test('stops requesting reference years when a display request becomes stale', async () => {
    const result = await loadGtsPrediction(48, 9, [], new Date(2026, 0, 1), { historyYears: 3 }, null, () => false);
    expect(result).toBeNull();
    expect(fetchHistoricalData).not.toHaveBeenCalled();
});

test('persists validated settings and preserves unrelated choices', () => {
    expect(loadPredictionSettings()).toEqual({ historyYears: 10, horizonDays: 14, showPrediction: true });
    savePredictionSettings({ horizonDays: 21, showPrediction: false });
    savePredictionSettings({ historyYears: 7 });
    expect(loadPredictionSettings()).toEqual({ historyYears: 7, horizonDays: 21, showPrediction: false });
    expect(normalizePredictionSettings({ historyYears: 11, horizonDays: '28', showPrediction: 'false' }))
        .toEqual({ historyYears: 10, horizonDays: 14, showPrediction: true });
});

test('recovers from malformed stored settings', () => {
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => {});
    localStorage.setItem('beelotPredictionSettings', '{broken');
    expect(loadPredictionSettings().historyYears).toBe(10);
    expect(warning).toHaveBeenCalled();
    warning.mockRestore();
});
