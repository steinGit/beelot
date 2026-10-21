import {
    appendWinterTreatmentInformation,
    findWinterTreatmentRecommendation,
    loadWinterTreatmentEnabled,
    loadWinterTreatmentRecommendation,
    saveWinterTreatmentEnabled,
    WINTER_TREATMENT_SETTINGS_KEY
} from '../assets/js/winterTreatment.js';
import { fetchMergedWeatherData } from '../assets/js/weatherData.js';

jest.mock('../assets/js/weatherData.js', () => ({ fetchMergedWeatherData: jest.fn() }));

const today = new Date(2027, 1, 1);
const dates = ['2026-11-01', '2026-11-02', '2026-11-03'];
const predict = (days, minima, origin = new Date(2026, 10, 22), now = today) => (
    findWinterTreatmentRecommendation(days, minima, origin, now)
);

beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
});

test('uses the first day of three consecutive frost minima and adds 21 calendar days', () => {
    expect(predict(dates, [-1, -0.1, -3])).toEqual({
        date: '2026-11-22', firstFrostDate: '2026-11-01',
        lastFrostDate: '2026-11-03', daysUntil: 0
    });
});

test.each([
    [1, 2, 3], [-1, 0, -2], [-1, null, -2], [-1, NaN, -2], [-1, '-1', -2]
])('requires three finite minima strictly below zero: %j', (...minima) => {
    expect(predict(dates, minima)).toBeNull();
});

test('missing calendar days break the frost sequence', () => {
    expect(predict(['2026-11-01', '2026-11-03', '2026-11-04'], [-1, -2, -3])).toBeNull();
});

test('a warm day resets the sequence and a later run can qualify', () => {
    expect(predict([
        ...dates, '2026-11-04', '2026-11-05', '2026-11-06'
    ], [-1, -1, 3, -1, -1, -1])).toMatchObject({
        firstFrostDate: '2026-11-04', date: '2026-11-25'
    });
});

test('frost before November 1 or after December 15 does not count', () => {
    expect(predict(['2026-10-30', '2026-10-31', '2026-11-01'], [-1, -2, -3])).toBeNull();
    expect(predict(['2026-12-14', '2026-12-15', '2026-12-16'], [-1, -2, -3], new Date(2026, 11, 20))).toBeNull();
});

test('December 15 can complete a sequence whose reminder falls in January', () => {
    expect(predict(['2026-12-13', '2026-12-14', '2026-12-15'], [-1, -2, -3], new Date(2027, 0, 3))).toMatchObject({
        date: '2027-01-03', daysUntil: 0
    });
});

test('does not use later days when inspecting a historical origin', () => {
    expect(predict(dates, [-1, -2, -3], new Date(2026, 10, 2))).toBeNull();
});

test('does not count the unfinished current day or future days', () => {
    expect(predict(dates, [-1, -2, -3], new Date(2026, 10, 3), new Date(2026, 10, 3, 12))).toBeNull();
    expect(predict(dates, [-1, -2, -3], new Date(2026, 10, 3), new Date(2026, 10, 4))).not.toBeNull();
});

test('shows the date as soon as a frost sequence is known, even beyond the two-week GTS preview', () => {
    expect(predict(dates, [-1, -1, -1], new Date(2026, 10, 3))).toMatchObject({
        date: '2026-11-22', daysUntil: 19
    });
});

test('keeps the seven-day rearview and does not repeat the reminder for later frost sequences', () => {
    expect(predict(dates, [-1, -1, -1], new Date(2026, 10, 29))).not.toBeNull();
    expect(predict([...dates, '2026-11-09', '2026-11-10', '2026-11-11'], [-1, -1, -1, -1, -1, -1], new Date(2026, 10, 30))).toBeNull();
});

test('loads minima with the location-owned cache and without a future range', async () => {
    const cache = { get: jest.fn(), set: jest.fn() };
    fetchMergedWeatherData.mockResolvedValue({ allDates: dates, allTemps: [-1, -1, -1] });
    await expect(loadWinterTreatmentRecommendation(48, 9, new Date(2026, 10, 22), cache, new Date(2026, 10, 22)))
        .resolves.toMatchObject({ date: '2026-11-22' });
    expect(fetchMergedWeatherData).toHaveBeenCalledWith(
        48, 9, new Date(2026, 10, 1), new Date(2026, 10, 21),
        new Date(2026, 10, 12), cache, new Date(2026, 10, 22), 'temperature_2m_min'
    );
});

test('does not request weather outside the winter season', async () => {
    await expect(loadWinterTreatmentRecommendation(48, 9, new Date(2026, 9, 21), null, today)).resolves.toBeNull();
    expect(fetchMergedWeatherData).not.toHaveBeenCalled();
});

test('propagates incomplete-weather failures rather than producing a reminder', async () => {
    fetchMergedWeatherData.mockRejectedValue(new Error('Incomplete frost data'));
    await expect(loadWinterTreatmentRecommendation(48, 9, new Date(2026, 10, 22), null, today))
        .rejects.toThrow('Incomplete frost data');
});

test('defaults to enabled and persists disabling independently of plant settings', () => {
    expect(loadWinterTreatmentEnabled()).toBe(true);
    localStorage.setItem('trachtData', '[{"plant":"Custom"}]');
    saveWinterTreatmentEnabled(false);
    expect(loadWinterTreatmentEnabled()).toBe(false);
    expect(localStorage.getItem('trachtData')).toBe('[{"plant":"Custom"}]');
    localStorage.setItem(WINTER_TREATMENT_SETTINGS_KEY, '{"enabled":"false"}');
    expect(loadWinterTreatmentEnabled()).toBe(true);
});

test('renders a compact table recommendation with the brood-free condition and an FAQ link', () => {
    const section = document.createElement('section');
    section.innerHTML = '<table class="imker-info-table"><tbody><tr class="imker-info-header"></tr></tbody></table>';
    appendWinterTreatmentInformation(section, predict(dates, [-1, -2, -3]));
    const row = section.querySelector('.winter-treatment-info');
    expect(row.tagName).toBe('TR');
    expect(row.children).toHaveLength(3);
    expect(row.querySelector('.imker-col-time').textContent).toContain('Heute am 22.11.');
    expect(row.querySelector('.imker-empfehlung-inline').textContent)
        .toBe('Empfehlung: Oxalsäure träufeln (nur brutfrei)');
    expect(row.querySelector('.imker-col-gts').textContent).toBe('–');
    expect(row.querySelector('a').getAttribute('href')).toBe('components/faq.html#faq-winter-treatment');
    expect(section.querySelector('h3, p')).toBeNull();
});

test.each([
    [1, 'Morgen'], [12, 'In 12 Tagen'], [-1, 'Gestern'], [-4, 'Vor 4 Tagen']
])('formats the relative date for a reminder %i days away', (daysUntil, relative) => {
    const section = document.createElement('section');
    section.innerHTML = '<table><tbody><tr class="imker-info-header"></tr></tbody></table>';
    appendWinterTreatmentInformation(section, { ...predict(dates, [-1, -2, -3]), daysUntil });
    expect(section.querySelector('.imker-time-full').textContent).toBe(`${relative} am 22.11.:`);
    expect(section.querySelector('.imker-time-short').textContent).toBe('22.11.:');
});

test('renders nothing when no frost sequence qualified and escapes failure messages', () => {
    const section = document.createElement('section');
    appendWinterTreatmentInformation(section, null);
    expect(section.children).toHaveLength(0);
    appendWinterTreatmentInformation(section, { error: '<img src=x onerror=alert(1)>' });
    expect(section.querySelector('img')).toBeNull();
    expect(section.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(section.textContent).not.toContain('Oxalsäure träufeln');
});
