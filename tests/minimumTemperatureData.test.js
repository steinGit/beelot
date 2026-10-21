import { fetchHistoricalData, fetchRecentData } from '../assets/js/dataService.js';
import { fetchMergedWeatherData } from '../assets/js/weatherData.js';
import { formatDateLocal } from '../assets/js/utils.js';

function responseFor(url, temperature) {
    const parameters = new URL(url).searchParams;
    const variable = parameters.get('daily');
    const [year, month, day] = parameters.get('start_date').split('-').map(Number);
    const dates = [];
    const date = new Date(year, month - 1, day);
    while (formatDateLocal(date) <= parameters.get('end_date')) {
        dates.push(formatDateLocal(date));
        date.setDate(date.getDate() + 1);
    }
    return {
        ok: true,
        json: async () => ({ daily: {
            time: dates, [variable]: dates.map(value => temperature(value, variable))
        } })
    };
}

beforeEach(() => {
    localStorage.clear();
    jest.useFakeTimers().setSystemTime(new Date(2026, 10, 22, 12));
});
afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
});

test('keeps cached means and minima separate and reuses complete historical minimum years', async () => {
    global.fetch = jest.fn(async url => responseFor(url, (_date, variable) => (
        variable === 'temperature_2m_min' ? -2 : 8
    )));
    const start = new Date(2025, 10, 1), end = new Date(2025, 10, 3);
    const mean = await fetchHistoricalData(48, 9, start, end);
    const minimum = await fetchHistoricalData(48, 9, start, end, null, false, 'temperature_2m_min');
    expect(minimum.daily.temperature_2m_min).toEqual([-2, -2, -2]);
    expect(mean.daily.temperature_2m_mean).toEqual([8, 8, 8]);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    await fetchHistoricalData(48, 9, start, new Date(2025, 10, 4), null, false, 'temperature_2m_min');
    expect(global.fetch).toHaveBeenCalledTimes(2);
    const urls = global.fetch.mock.calls.map(([url]) => new URL(url));
    expect(urls[1].searchParams.get('daily')).toBe('temperature_2m_min');
    expect(urls[1].searchParams.get('start_date')).toBe('2025-01-01');
    expect(urls[1].searchParams.get('end_date')).toBe('2025-12-31');
});

test('repairs recent missing minima, preserves valid zeroes, and reuses the owning location cache', async () => {
    const entries = new Map();
    const cache = { get: key => entries.get(key), set: (key, value) => entries.set(key, value), remove: key => entries.delete(key) };
    global.fetch = jest.fn(async url => responseFor(url, date => {
        if (new URL(url).hostname.startsWith('archive-')) {
            return date >= '2026-11-20' ? null : 0;
        }
        return -2;
    }));
    const args = [48, 9, new Date(2026, 10, 1), new Date(2026, 10, 21),
        new Date(2026, 10, 12), cache, new Date(2026, 10, 22), 'temperature_2m_min'];
    const weather = await fetchMergedWeatherData(...args);
    expect(weather.allTemps).toEqual([...Array(19).fill(0), -2, -2]);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    const recentUrl = new URL(global.fetch.mock.calls[1][0]);
    expect(recentUrl.searchParams.get('daily')).toBe('temperature_2m_min');
    expect(recentUrl.searchParams.get('start_date')).toBe('2026-11-20');
    expect(recentUrl.searchParams.get('end_date')).toBe('2026-11-21');
    expect(await fetchMergedWeatherData(...args)).toEqual(weather);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect([...entries.keys()].every(key => key.includes('_min_'))).toBe(true);
    expect(localStorage.length).toBe(0);
});

test('rejects a mean-only response to a minimum-temperature request', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({
        daily: { time: ['2026-11-01'], temperature_2m_mean: [-5] }
    }) });
    await expect(fetchHistoricalData(48, 9, new Date(2026, 10, 1), new Date(2026, 10, 1), null, false, 'temperature_2m_min'))
        .rejects.toMatchObject({ name: 'OpenMeteoError' });
});

test('rejects unsupported daily variables before requesting data', async () => {
    global.fetch = jest.fn();
    await expect(fetchRecentData(48, 9, new Date(2026, 10, 1), new Date(2026, 10, 1), null, '__proto__'))
        .rejects.toThrow('Unsupported temperature variable');
    expect(global.fetch).not.toHaveBeenCalled();
});
