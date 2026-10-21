import { buildYearData, buildFullYearData } from '../assets/js/logic.js';
import { fetchHistoricalData } from '../assets/js/dataService.js';

jest.mock('../assets/js/dataService.js', () => ({
    ...jest.requireActual('../assets/js/dataService.js'),
    fetchHistoricalData: jest.fn()
}));

beforeEach(() => {
    fetchHistoricalData.mockReset();
    fetchHistoricalData.mockImplementation(async (lat, lon, start) => {
        const year = start.getFullYear();
        const time = [];
        for (let index = 0; index < 366; index += 1) {
            const date = new Date(Date.UTC(year, 0, index + 1));
            if (date.getUTCFullYear() !== year) break;
            time.push(date.toISOString().slice(0, 10));
        }
        return { daily: { time, temperature_2m_mean: time.map(() => 10) } };
    });
});

test.each(['regular', 'twenty-year'])('%s plots extend historical observations to the forecast end', async (mode) => {
    const start = new Date(2026, 9, 1);
    const origin = new Date(2026, 9, 20);
    const previewEnd = new Date(2026, 10, 3);
    const observed = Array.from({ length: 20 }, (_, index) => ({ date: `2026-10-${String(index + 1).padStart(2, '0')}`, gts: index }));
    const result = mode === 'regular'
        ? await buildYearData(48, 9, start, origin, observed, 3, null, previewEnd)
        : await buildFullYearData(48, 9, 2026, 3, start, origin, null, observed, previewEnd);
    expect(result[0].labels.at(-1)).toBe('20.10');
    expect(result[0].gtsValues).toHaveLength(20);
    for (const previous of result.slice(1)) {
        expect(previous.labels.at(-1)).toBe('3.11');
        expect(previous.gtsValues).toHaveLength(34);
    }
    expect(fetchHistoricalData).toHaveBeenCalledWith(48, 9, new Date(2025, 0, 1), new Date(2025, 10, 4), null);
});
