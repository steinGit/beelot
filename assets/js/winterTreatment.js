/** Detect a winter-treatment reminder from completed days with frost. */
import { fetchMergedWeatherData } from './weatherData.js';
import { formatDateLocal, isValidDate, parseDateStringLocal } from './utils.js';

export const WINTER_TREATMENT_SETTINGS_KEY = 'beelotWinterTreatment';

export function loadWinterTreatmentEnabled() {
    try {
        const value = JSON.parse(localStorage.getItem(WINTER_TREATMENT_SETTINGS_KEY));
        return typeof value?.enabled === 'boolean' ? value.enabled : true;
    } catch (error) {
        console.warn('[winterTreatment] Could not read settings.', error);
        return true;
    }
}

export function saveWinterTreatmentEnabled(enabled) {
    try {
        localStorage.setItem(WINTER_TREATMENT_SETTINGS_KEY, JSON.stringify({ enabled: enabled === true }));
    } catch (error) {
        console.warn('[winterTreatment] Could not save settings.', error);
    }
}

/** Limit frost detection to November 1–December 15 and completed calendar days. */
function getFrostWindow(endDate, today) {
    if (!isValidDate(endDate) || !isValidDate(today)) {
        throw new TypeError('Valid dates are required for the frost recommendation.');
    }
    const month = endDate.getMonth();
    if (month < 10 && !(month === 0 && endDate.getDate() <= 10)) return null;
    const year = endDate.getFullYear() - (month === 0 ? 1 : 0);
    const start = new Date(year, 10, 1);
    const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
    const end = new Date(Math.min(endDate.getTime(), new Date(year, 11, 15).getTime(), yesterday.getTime()));
    end.setHours(0, 0, 0, 0);
    return end < start ? null : { start, end };
}

/** Find the first three consecutive frost minima, without using future values. */
export function findWinterTreatmentRecommendation(dates, minima, endDate, today = new Date()) {
    const window = getFrostWindow(endDate, today);
    if (!window) return null;
    const temperatures = new Map(dates.map((date, index) => [date, minima[index]]));
    let streak = 0;
    for (const date = new Date(window.start); date <= window.end; date.setDate(date.getDate() + 1)) {
        const temperature = temperatures.get(formatDateLocal(date));
        streak = typeof temperature === 'number' && Number.isFinite(temperature) && temperature < 0
            ? streak + 1 : 0;
        if (streak !== 3) continue;
        const firstFrost = new Date(date);
        firstFrost.setDate(firstFrost.getDate() - 2);
        const dueDate = new Date(firstFrost);
        dueDate.setDate(dueDate.getDate() + 21);
        const calendarDay = value => Date.UTC(value.getFullYear(), value.getMonth(), value.getDate());
        const daysUntil = (calendarDay(dueDate) - calendarDay(endDate)) / 86400000;
        // Show a known frost-derived date immediately, retaining a seven-day rearview.
        if (daysUntil < -7) return null;
        return {
            date: formatDateLocal(dueDate),
            firstFrostDate: formatDateLocal(firstFrost),
            lastFrostDate: formatDateLocal(date),
            daysUntil
        };
    }
    return null;
}

export async function loadWinterTreatmentRecommendation(lat, lon, endDate, cacheStore, today = new Date()) {
    const window = getFrostWindow(endDate, today);
    if (!window) return null;
    const recentStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 10);
    const weather = await fetchMergedWeatherData(
        lat, lon, window.start, window.end,
        new Date(Math.max(window.start.getTime(), recentStart.getTime())),
        cacheStore, today, 'temperature_2m_min'
    );
    return findWinterTreatmentRecommendation(weather.allDates, weather.allTemps, endDate, today);
}

/** Append a compact recommendation to the existing information table. */
export function appendWinterTreatmentInformation(section, recommendation, prefix = 'Empfehlung: ') {
    if (!recommendation) return;
    if (recommendation.error) {
        const status = document.createElement('p');
        status.className = 'winter-treatment-info';
        status.setAttribute('role', 'status');
        status.textContent = `Frostprüfung nicht verfügbar: ${recommendation.error}`;
        section.append(status);
        return;
    }
    const date = parseDateStringLocal(recommendation.date);
    const days = recommendation.daysUntil;
    const tbody = section.querySelector('.imker-info-header')?.parentElement;
    if (!date || !Number.isInteger(days) || !tbody) return;
    const dateText = `${date.getDate()}.${date.getMonth() + 1}.`;
    const relative = days === 0 ? 'Heute' : days === 1 ? 'Morgen' : days === -1 ? 'Gestern'
        : days > 0 ? `In ${days} Tagen` : `Vor ${-days} Tagen`;
    const row = document.createElement('tr');
    row.className = 'winter-treatment-info';
    row.style.fontWeight = 'bold';
    row.style.color = days === 0 ? '#ff8020' : days > 0 ? '#206020' : '#802020';
    const timing = document.createElement('td');
    timing.className = 'imker-col-time';
    const fullTime = document.createElement('span');
    fullTime.className = 'imker-time-full';
    fullTime.textContent = `${relative} am ${dateText}:`;
    const shortTime = document.createElement('span');
    shortTime.className = 'imker-time-short';
    shortTime.textContent = `${dateText}:`;
    timing.append(fullTime, shortTime);
    const content = document.createElement('td');
    content.className = 'imker-col-content';
    const label = document.createElement('span');
    label.className = 'imker-empfehlung-inline';
    const link = document.createElement('a');
    link.href = 'components/faq.html#faq-winter-treatment';
    link.textContent = 'Oxalsäure träufeln (nur brutfrei)';
    label.append(prefix, link);
    content.append(label);
    const gts = document.createElement('td');
    gts.className = 'imker-col-gts';
    gts.textContent = '–';
    gts.title = 'Frostbasierte Empfehlung';
    row.append(timing, content, gts);
    tbody.append(row);
}
