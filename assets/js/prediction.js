/** Predict future GTS from calendar-aligned increments of previous years. */
import { calculateGTS } from './logic.js';
import {
    fetchHistoricalData,
    HISTORICAL_DATA_START_YEAR,
    findFirstMissingTemperatureDate,
    mergeValidDailyTemperatures
} from './dataService.js';
import { formatDateLocal, parseDateStringLocal } from './utils.js';
import { normalizePredictionSettings } from './predictionSettings.js';

/** Read the same calendar date; interpolate February 29 in a non-leap year. */
function calendarValue(values, year, date) {
    const mapped = new Date(year, date.getMonth(), date.getDate(), 12);
    if (date.getMonth() === 1 && date.getDate() === 29 && mapped.getMonth() !== 1) {
        const before = values.get(`${year}-02-28`);
        const after = values.get(`${year}-03-01`);
        return Number.isFinite(before) && Number.isFinite(after) ? (before + after) / 2 : null;
    }
    return values.get(formatDateLocal(mapped)) ?? null;
}

export function predictGTS(gtsResults, endDate, historicalYears, settings) {
    const { historyYears, horizonDays } = normalizePredictionSettings(settings);
    const originKey = formatDateLocal(endDate);
    const origin = gtsResults.find(entry => entry.date === originKey);
    if (!origin || !Number.isFinite(origin.gts)) {
        throw new Error('Für das Ausgangsdatum fehlt ein gültiger GTS-Wert.');
    }
    const references = [];
    for (let offset = 1; offset <= historyYears; offset += 1) {
        const year = endDate.getFullYear() - offset;
        const curve = historicalYears.find(entry => entry.year === year)?.results;
        if (!Array.isArray(curve)) {
            throw new Error(`Für die Prädiktion fehlen Wetterdaten aus ${year}.`);
        }
        const values = new Map(curve.map(entry => [entry.date, entry.gts]));
        const anchor = calendarValue(values, year, endDate);
        if (!Number.isFinite(anchor)) {
            throw new Error(`Für die Prädiktion fehlt das Ausgangsdatum in ${year}.`);
        }
        references.push({ year, values, anchor });
    }
    const points = [];
    for (let lead = 1; lead <= horizonDays; lead += 1) {
        const date = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate() + lead, 12);
        if (date.getFullYear() !== endDate.getFullYear()) break;
        let increment = 0;
        for (const reference of references) {
            const value = calendarValue(reference.values, reference.year, date);
            if (!Number.isFinite(value)) {
                throw new Error(`Für die Prädiktion fehlen Tageswerte aus ${reference.year}.`);
            }
            const delta = value - reference.anchor;
            if (delta < -1e-9) throw new Error('Historische GTS-Werte sind nicht monoton.');
            increment += delta;
        }
        points.push({ date: formatDateLocal(date), gts: Number((origin.gts + increment / historyYears).toFixed(9)), predicted: true });
    }
    return { points, originDate: originKey, historyYears, horizonDays };
}

/** Reuse the location-owned weather cache and the original GTS calculation. */
export async function loadGtsPrediction(lat, lon, gtsResults, endDate, settings, cacheStore = null, canContinue = () => true) {
    const normalized = normalizePredictionSettings(settings);
    if (endDate.getFullYear() - normalized.historyYears < HISTORICAL_DATA_START_YEAR) {
        throw new Error(`Für J = ${normalized.historyYears} werden vollständige Vorjahre ab ${HISTORICAL_DATA_START_YEAR} benötigt.`);
    }
    const historicalYears = [];
    // Sequential requests reuse full-year caches and avoid a burst of API calls.
    for (let offset = 1; offset <= normalized.historyYears; offset += 1) {
        if (!canContinue()) return null;
        const year = endDate.getFullYear() - offset;
        const start = new Date(year, 0, 1);
        const end = new Date(year, 11, 31);
        const weather = await fetchHistoricalData(lat, lon, start, end, cacheStore, false);
        const byDate = {};
        mergeValidDailyTemperatures(byDate, weather);
        const missing = findFirstMissingTemperatureDate(byDate, start, end);
        if (missing) {
            throw new Error(`Für die Prädiktion fehlen Wetterdaten vom ${formatDateLocal(missing)}.`);
        }
        const dates = Object.keys(byDate).sort();
        historicalYears.push({ year, results: calculateGTS(dates, dates.map(date => byDate[date])) });
    }
    return predictGTS(gtsResults, endDate, historicalYears, normalized);
}

/** Append only future points; never mutate measured or cached annual curves. */
export function appendPrediction(results, prediction) {
    if (!prediction?.points?.length) return results;
    const origin = parseDateStringLocal(prediction.originDate);
    return [...results.filter(entry => {
        const date = parseDateStringLocal(entry.date);
        return date && date <= origin;
    }), ...prediction.points];
}
