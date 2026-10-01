import {
    fetchHistoricalData,
    findFirstMissingTemperatureDate,
    getCachedData,
    mergeValidDailyTemperatures,
    setCachedData
} from '../assets/js/dataService';

describe('getCachedData', () => {
    test('returns null if no data is cached', () => {
        localStorage.clear();
        expect(getCachedData('testKey')).toBeNull();
    });

    test('returns parsed data if cached', () => {
        const data = { key: 'value' };
        localStorage.setItem('testKey', JSON.stringify(data));
        expect(getCachedData('testKey')).toEqual(data);
    });

    test('returns null and clears invalid JSON cache entry', () => {
        localStorage.setItem('testKey', '{bad json');
        expect(getCachedData('testKey')).toBeNull();
        expect(localStorage.getItem('testKey')).toBeNull();
    });
});

describe('setCachedData', () => {
    test('saves data to localStorage', () => {
        const data = { key: 'value' };
        setCachedData('testKey', data);
        expect(localStorage.getItem('testKey')).toBe(JSON.stringify(data));
    });
});

describe('historical data boundaries', () => {
    test('rejects years before the archive boundary without a network request', async () => {
        global.fetch = jest.fn();
        const start = new Date(202, 0, 1);
        const end = new Date(202, 9, 1);

        await expect(fetchHistoricalData(48, 9, start, end))
            .rejects.toThrow('Historical weather data is available from 1940.');
        expect(global.fetch).not.toHaveBeenCalled();
    });

    test('rejects a daily response without a matching temperature array', async () => {
        localStorage.clear();
        const currentYear = new Date().getFullYear();
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: jest.fn().mockResolvedValue({
                daily: { time: [`${currentYear}-01-01`] }
            })
        });
        const start = new Date(currentYear, 0, 1);
        const end = new Date(currentYear, 0, 1);

        await expect(fetchHistoricalData(48, 9, start, end, null, false))
            .rejects.toMatchObject({ name: 'OpenMeteoError' });
    });

    test('rejects daily date and temperature arrays with different lengths', async () => {
        localStorage.clear();
        const currentYear = new Date().getFullYear();
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: jest.fn().mockResolvedValue({
                daily: {
                    time: [`${currentYear}-01-01`, `${currentYear}-01-02`],
                    temperature_2m_mean: [5]
                }
            })
        });
        const start = new Date(currentYear, 0, 1);
        const end = new Date(currentYear, 0, 2);

        await expect(fetchHistoricalData(48, 9, start, end, null, false))
            .rejects.toMatchObject({ name: 'OpenMeteoError' });
    });
});

describe('daily temperature merging', () => {
    test('keeps measured zeroes but leaves missing temperatures available for repair', () => {
        const temperaturesByDate = {};
        mergeValidDailyTemperatures(temperaturesByDate, {
            daily: {
                time: ['2026-01-01', '2026-01-02', '2026-01-03'],
                temperature_2m_mean: [0, null, 4]
            }
        });

        expect(temperaturesByDate).toEqual({
            '2026-01-01': 0,
            '2026-01-03': 4
        });
        expect(findFirstMissingTemperatureDate(
            temperaturesByDate,
            new Date(2026, 0, 1),
            new Date(2026, 0, 3)
        )).toEqual(new Date(2026, 0, 2));
    });
});
