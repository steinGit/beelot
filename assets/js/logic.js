// logic.js

/**
 * @module logic
 * Handles calculations and helper functions related to data processing.
 */

import { formatDateLocal, isValidDate, extendToEndOfDay, calculateStartDate } from './utils.js';
import { fetchHistoricalData } from './dataService.js';

/**
 * Creates a Date object set to local midnight to avoid time zone issues.
 * @param {number} year - The year.
 * @param {number} month - The month (0-based).
 * @param {number} day - The day.
 * @returns {Date} - The created Date object.
 */
function createLocalStartOfDay(year, month, day) {
  // e.g., createLocalStartOfDay(2024, 0, 1) => 2024-01-01T00:00 in local time
  return new Date(year, month, day, 0, 0, 0, 0);
}

/**
 * Retrieves the selected end date from the #datum input.
 * Ensures the date is set to local midnight.
 * @returns {Date} - The selected end date.
 */
export function getSelectedEndDate() {
    const datumInput = document.getElementById('datum');
    const ortVal = document.getElementById('ort').value || "";

    const parts = datumInput.value.split('-');
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1; // zero-based
    const d = parseInt(parts[2], 10);
    const localStartOfDay = createLocalStartOfDay(y, m, d);
    // console.log("[DEBUG logic.js] getSelectedEndDate() =>", localStartOfDay.toString());
    return localStartOfDay;
}

/**
 * Computes the date range based on the selected end date.
 * @param {Date} endDate - The selected end date.
 * @returns {Object} - An object containing differenceInDays and plotStartDate.
 */
export function computeDateRange(endDate) {
    const today = new Date();
    const differenceInTime = today.getTime() - endDate.getTime();
    const differenceInDays = Math.floor(differenceInTime / (1000 * 3600 * 24));
    const plotStartDate = computeStartDate(endDate);
    return { differenceInDays, plotStartDate };
}

/**
 * Computes the start date based on the selected timeframe.
 * @param {Date} endDate - The selected end date.
 * @returns {Date} - The computed start date.
 */
export function computeStartDate(endDate) {
    const zeitraumSelect = document.getElementById('zeitraum');
    const selection = zeitraumSelect.value;
    const startDate = new Date(endDate); // Clone the endDate

    // console.log("[DEBUG logic.js] computeStartDate() => selection=", selection,
    // "endDate=", formatDateLocal(endDate));

    if (selection === "7") {
        startDate.setDate(endDate.getDate() - 7 + 1);
    } else if (selection === "14") {
        startDate.setDate(endDate.getDate() - 14 + 1);
    } else if (selection === "28") {
        startDate.setDate(endDate.getDate() - 28 + 1);
    } else if (selection === "ytd") {
        // Go to January 1st of the endDate's year
        startDate.setMonth(0); // January
        startDate.setDate(1);
    }

    // console.log("[DEBUG logic.js] computeStartDate() => startDate=",
    // formatDateLocal(startDate));
    return startDate;
}

/**
 * Calculates the Grünland-Temperatur-Summe (GTS) with month-based weighting.
 * Replaces toISOString().split('T')[0] with formatDateLocal for consistency.
 * @param {Array<string>} dates - Array of date strings in 'YYYY-MM-DD' format.
 * @param {Array<number>} values - Array of temperature values.
 * @param {boolean} verbose - If true, logs additional debug information.
 * @returns {Array<Object>} - Array of objects with 'date' and 'gts' properties.
 */
export function calculateGTS(dates, values, verbose = false) {
    let cumulativeSum = 0;
    const results = [];

    for (let i = 0; i < values.length; i++) {
        let val = Math.max(0, values[i]); // Replace negative values with 0.0
        const currentDate = new Date(dates[i]);
        const month = currentDate.getMonth() + 1;

        // Apply weights based on the month
        if (month === 1) {
            val *= 0.5;
        } else if (month === 2) {
            val *= 0.75;
        }

        cumulativeSum += val;

        // Append the cumulative sum for the current date
        results.push({
            date: formatDateLocal(currentDate),
            gts: parseFloat(cumulativeSum.toFixed(2)), // Round to 2 decimal places
        });
    }

    return results;
}

/**
 * Fetches GTS data for a specific year.
 * @param {number} lat - Latitude.
 * @param {number} lon - Longitude.
 * @param {number} year - The year to fetch data for.
 * @param {Date} baseStartDate - The user's chosen start date.
 * @param {Date} baseEndDate - The user's chosen end date.
 * @param {boolean} verbose - If true, logs additional debug information.
 * @returns {Promise<Object>} - An object containing 'year', 'labels', and 'gtsValues'.
 */
export async function fetchGTSForYear(
    lat,
    lon,
    year,
    baseStartDate,
    baseEndDate,
    verbose = false,
    cacheStore = null
) {
    // A) Define the fetch range: January 1st to the same month/day as baseEndDate + 1 day
    const yearStart = createLocalStartOfDay(year, 0, 1);
    const yearEnd = new Date(year, baseEndDate.getMonth(), baseEndDate.getDate(), 0, 0, 0, 0);
    yearEnd.setDate(yearEnd.getDate() + 1);
    if (yearEnd.getFullYear() !== year) {
        yearEnd.setFullYear(year);
        yearEnd.setMonth(11);
        yearEnd.setDate(31);
    }

    // console.log("[DEBUG logic.js] => yearStart=", formatDateLocal(yearStart),
    // " yearEnd=", formatDateLocal(yearEnd));

    // B) Fetch historical data from yearStart to yearEnd
    const histData = await fetchHistoricalData(lat, lon, yearStart, yearEnd, cacheStore);
    if (!histData || !histData.daily) {
        return { year, labels: [], gtsValues: [] };
    }
    const allDates = histData.daily.time;
    const allTemps = histData.daily.temperature_2m_mean;

    // C) Compute GTS from January 1st
    const gtsResults = calculateGTS(allDates, allTemps);

    // D) Determine the display window for the plot based on baseStartDate and baseEndDate
    const yearPlotStart = createLocalStartOfDay(
        year,
        baseStartDate.getMonth(),
        baseStartDate.getDate()
    );
    const yearPlotEnd = createLocalStartOfDay(
        year,
        baseEndDate.getMonth(),
        baseEndDate.getDate()
    );

    // console.log("[DEBUG logic.js] => yearPlotStart=", formatDateLocal(yearPlotStart),
    // " yearPlotEnd=", formatDateLocal(yearPlotEnd));

    // E) Filter GTS results to the display window
    const endOfDay = new Date(yearPlotEnd);
    endOfDay.setHours(23, 59, 59, 999); // Set to end of the day
    const displayedResults = gtsResults.filter(r => {
        const d = new Date(r.date);
        return (d >= yearPlotStart && d <= endOfDay);
    });
    // console.log("[DEBUG logic.js] => final displayed results for year=", year,
    // " =>", displayedResults.length, " points");

    // F) Convert to Chart.js-compatible arrays
    const labels = displayedResults.map(item => {
        const d = new Date(item.date);
        return `${d.getDate()}.${d.getMonth() + 1}`;
    });
    const gtsValues = displayedResults.map(item => item.gts);

    return {
        year,
        labels,
        gtsValues
    };
}

/**
 * Builds 5-year data for plotting. For the current year, it uses existing data; for past years, it fetches new data.
 * @param {number} lat - Latitude.
 * @param {number} lon - Longitude.
 * @param {Date} baseStartDate - The user's chosen start date.
 * @param {Date} baseEndDate - The user's chosen end date.
 * @param {Array<Object>} data_current_year - Array of objects like [{date, gts}, ...] for the current year.
 * @returns {Promise<Array<Object>>} - Array of yearly data objects.
 */
export async function buildYearData(
    lat,
    lon,
    baseStartDate,
    baseEndDate,
    data_current_year,
    yearsCount,
    cacheStore = null
) {
    // TODO: Define a maximum supported year range if needed.
    const mainYear = baseEndDate.getFullYear();
    const allResults = [];

    // console.log("[DEBUG logic.js] build5YearData() => mainYear=", mainYear);

    for (let y = mainYear; y > mainYear - yearsCount; y--) {
        const yearPlotStart = createLocalStartOfDay(
            y,
            baseStartDate.getMonth(),
            baseStartDate.getDate()
        );
        const yearPlotEnd = createLocalStartOfDay(
            y,
            baseEndDate.getMonth(),
            baseEndDate.getDate()
        );

        if (y === mainYear) {
            //
            // 1) Use data_current_year (already has { date, gts })
            // 2) Filter for the chosen time window
            //

            const endOfDay = new Date(yearPlotEnd);
            endOfDay.setHours(23, 59, 59, 999); // Set to end of the day

            const displayedResults = data_current_year.filter(item => {
                const d = new Date(item.date);
                return (d >= yearPlotStart && d <= endOfDay);
            });

            // console.log(`[DEBUG build5YearData] Year ${y} - plotStartDate: ${yearPlotStart}, endOfDay: ${endOfDay}`);
            // console.log(`[DEBUG build5YearData] Year ${y} - Displayed Results:`, displayedResults);

            // Convert to Chart.js data format
            const labels = displayedResults.map(item => {
                const d = new Date(item.date);
                return `${d.getDate()}.${d.getMonth() + 1}`;
            });
            const gtsValues = displayedResults.map(item => item.gts);

            allResults.push({
                year: y,
                labels,
                gtsValues
            });
        } else {
            //
            // For past years, fetch from the server
            //
            try {
                // console.log("[DEBUG logic.js] build5YearData() y=", y, " yearPlotStart= ", formatDateLocal(yearPlotStart), " yearPlotEnd= ", formatDateLocal(yearPlotEnd));
                const yearly = await fetchGTSForYear(
                    lat,
                    lon,
                    y,
                    yearPlotStart,
                    yearPlotEnd,
                    false,
                    cacheStore
                );
                // console.log("[DEBUG logic.js] build5YearData() => year=", y,
                //    " => #points=", yearly.gtsValues.length);
                allResults.push(yearly);
            } catch (err) {
                console.warn(`[build5YearData] Error year=${y}`, err);
            }
        }
    }

    // console.log("[DEBUG logic.js] build5YearData() => total sets=", allResults.length);
    return allResults;
}

export async function build5YearData(
    lat,
    lon,
    baseStartDate,
    baseEndDate,
    data_current_year,
    cacheStore = null
) {
    return buildYearData(
        lat,
        lon,
        baseStartDate,
        baseEndDate,
        data_current_year,
        5,
        cacheStore
    );
}

/**
 * Builds data for full calendar years.
 * @param {number} lat - Latitude.
 * @param {number} lon - Longitude.
 * @param {number} endYear - The last full year to include.
 * @param {number} yearsCount - Number of years to include.
 * @param {Object|null} cacheStore - Optional cache store.
 * @param {Array<Object>|null} data_current_year - Optional precomputed GTS for endYear.
 * @returns {Promise<Array<Object>>} - Array of yearly data objects.
 */
export async function buildFullYearData(
    lat,
    lon,
    endYear,
    yearsCount,
    baseStartDate,
    baseEndDate,
    cacheStore = null,
    data_current_year = null
) {
    const allResults = [];

    for (let y = endYear; y > endYear - yearsCount; y--) {
        try {
            const yearPlotStart = createLocalStartOfDay(
                y,
                baseStartDate.getMonth(),
                baseStartDate.getDate()
            );
            const yearPlotEnd = createLocalStartOfDay(
                y,
                baseEndDate.getMonth(),
                baseEndDate.getDate()
            );
            if (y === endYear && Array.isArray(data_current_year)) {
                const endOfDay = new Date(yearPlotEnd);
                endOfDay.setHours(23, 59, 59, 999);
                const displayedResults = data_current_year.filter((item) => {
                    const d = new Date(item.date);
                    return d >= yearPlotStart && d <= endOfDay;
                });
                const labels = displayedResults.map((item) => {
                    const d = new Date(item.date);
                    return `${d.getDate()}.${d.getMonth() + 1}`;
                });
                const gtsValues = displayedResults.map((item) => item.gts);
                allResults.push({
                    year: y,
                    labels,
                    gtsValues
                });
                continue;
            }
            const yearly = await fetchGTSForYear(
                lat,
                lon,
                y,
                yearPlotStart,
                yearPlotEnd,
                false,
                cacheStore
            );
            allResults.push(yearly);
        } catch (err) {
            console.warn(`[buildFullYearData] Error year=${y}`, err);
        }
    }

    return allResults;
}
