/**
 * @module logic
 * Berechnungen und Hilfsfunktionen
 */

import { datumInput, zeitraumSelect } from './ui.js';
import { fetchHistoricalData, fetchRecentData } from './dataService.js';

/**
 * Returns a Date object based on what's currently in #datum
 */
export function getSelectedEndDate() {
    return new Date(datumInput.value);
}

/**
 * Based on the selected #datum and #zeitraum, returns a start Date
 */
export function computeStartDate() {
    const endDate = getSelectedEndDate();
    const selection = zeitraumSelect.value;
    let startDate = new Date(endDate);

    if (selection === "7") {
        startDate.setDate(endDate.getDate() - 7);
    } else if (selection === "14") {
        startDate.setDate(endDate.getDate() - 14);
    } else if (selection === "28") {
        startDate.setDate(endDate.getDate() - 28);
    } else if (selection === "ytd") {
        startDate = new Date(endDate.getFullYear(), 0, 1);
    }

    return startDate;
}

/**
 * Given arrays of [dates] and [temperature values], 
 * compute the "Grünlandtemperatursumme" by month weighting:
 *   - January -> *0.5
 *   - February -> *0.75
 *   - otherwise -> *1.0
 *
 * Returns array of {date, gts} accumulative objects in chronological order.
 */
export function calculateGTS(dates, values) {
    let cumulativeSum = 0;
    const results = [];

    for (let i = 0; i < values.length; i++) {
        // temperatures below 0 => 0
        let val = values[i] < 0 ? 0 : values[i];
        const currentDate = new Date(dates[i]);
        const month = currentDate.getMonth() + 1; 

        let weightedVal = val;
        if (month === 1) {
            weightedVal = val * 0.5;
        } else if (month === 2) {
            weightedVal = val * 0.75;
        }

        cumulativeSum += weightedVal;
        results.push({
            date: dates[i],
            gts: cumulativeSum
        });
    }
    return results;
}

/**
 * Fetch GTS data for a specific year in the same day/month range 
 * as [baseStartDate..baseEndDate]. E.g., if user has "2024-03-01..2024-03-10",
 * then for year=2022 it fetches "2022-03-01..2022-03-10".
 *
 * Returns an object { labels, gtsValues } sorted chronologically 
 * (plus the actual year).
 */
export async function fetchGTSForYear(lat, lon, year, baseStartDate, baseEndDate) {
    // Build date range for that specific year
    // We keep the same month & day as baseStart/baseEnd, but replace the .getFullYear().
    const yearStart = new Date(year, baseStartDate.getMonth(), baseStartDate.getDate());
    const yearEnd = new Date(year, baseEndDate.getMonth(), baseEndDate.getDate());

    // We only fetch from this "yearStart..yearEnd" historically. 
    // If year is the current year, you might want to also combine "recent" data if needed—but let's keep it simple here:
    const histData = await fetchHistoricalData(lat, lon, yearStart, yearEnd);

    const allDates = histData.daily.time;
    const allTemps = histData.daily.temperature_2m_mean;

    // Compute GTS
    const gtsResults = calculateGTS(allDates, allTemps);

    // Convert that into arrays for Chart.js
    const labels = [];
    const gtsValues = [];
    for (let i = 0; i < gtsResults.length; i++) {
        labels.push(gtsResults[i].date);
        gtsValues.push(gtsResults[i].gts);
    }

    return {
        year,
        labels,
        gtsValues
    };
}

/**
 * Build 5-year GTS data sets: 
 *   "currentYear" + the previous 4 years 
 * using the same day/month range as [baseStartDate..baseEndDate].
 *
 * Returns an array of objects:
 * [
 *   { year: 2024, labels: [...], gtsValues: [...] },
 *   { year: 2023, labels: [...], gtsValues: [...] },
 *   ...
 * ]
 */
export async function build5YearData(lat, lon, baseStartDate, baseEndDate) {
    const mainYear = baseEndDate.getFullYear();  // e.g. 2024
    const allResults = [];

    // from mainYear down to mainYear-4
    for (let y = mainYear; y > mainYear - 5; y--) {
        // Because user might go into the future or the year might not have data
        // we'll do a try/catch
        try {
            const yearly = await fetchGTSForYear(lat, lon, y, baseStartDate, baseEndDate);
            allResults.push(yearly);
        } catch (err) {
            console.warn(`[build5YearData] Error fetching data for year=${y}`, err);
        }
    }

    return allResults;
}
