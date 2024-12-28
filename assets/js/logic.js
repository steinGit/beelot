/**
 * @module logic
 * Berechnungen und Hilfsfunktionen
 */

import { datumInput, zeitraumSelect } from './ui.js';
import { fetchHistoricalData } from './dataService.js';

/**
 * Creates a Date at local "noon" to avoid dropping into the previous day in UTC.
 */
function createLocalNoon(year, month, day) {
  // e.g. createLocalNoon(2024, 0, 1) => 2024-01-01T12:00 in local time
  return new Date(year, month, day, 12, 0, 0, 0);
}

/**
 * Returns a Date object based on what's currently in #datum
 * but also forced to local noon, so logs won't show the day before in UTC.
 */
export function getSelectedEndDate() {
    const parts = datumInput.value.split('-');
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1; // zero-based
    const d = parseInt(parts[2], 10);
    const localNoon = createLocalNoon(y, m, d);
    console.log("[DEBUG logic.js] getSelectedEndDate() =>", localNoon.toISOString());
    return localNoon;
}

/**
 * Based on the selected #datum and #zeitraum, returns a start Date
 * at local noon as well, to avoid confusion in logs.
 */
export function computeStartDate() {
    const endDate = getSelectedEndDate();
    const selection = zeitraumSelect.value;
    let startDate = new Date(endDate); // copy

    console.log("[DEBUG logic.js] computeStartDate() => selection=", selection,
        "endDate=", endDate.toISOString().split('T')[0]);

    if (selection === "7") {
        startDate.setDate(endDate.getDate() - 7);
    } else if (selection === "14") {
        startDate.setDate(endDate.getDate() - 14);
    } else if (selection === "28") {
        startDate.setDate(endDate.getDate() - 28);
    } else if (selection === "ytd") {
        // go to Jan 1 of endDate's year, but stay at local noon
        startDate = createLocalNoon(endDate.getFullYear(), 0, 1);
    }

    console.log("[DEBUG logic.js] computeStartDate() => startDate=",
        startDate.toISOString().split('T')[0]);
    return startDate;
}

/**
 * GTS calculation with month weighting.
 */
export function calculateGTS(dates, values) {
    console.log("[DEBUG logic.js] calculateGTS() => input length=", dates.length);
    let cumulativeSum = 0;
    const results = [];

    for (let i = 0; i < values.length; i++) {
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
    console.log("[DEBUG logic.js] calculateGTS() => output length=", results.length);
    return results;
}



/**
 * @module logic
 * @function fetchGTSForYear
 *
 * 1) For each year: fetch from Jan1..(that year’s [month/day] of baseEndDate) + 1 day.
 * 2) Compute GTS from Jan1 (so the sum is large).
 * 3) Then "display" only from that year’s [month/day] of baseStartDate..baseEndDate.
 *    (E.g. 12/14..12/27, if the user picked 2 weeks.)
 *
 * So older years show the last 2 weeks of December,
 * but the GTS lines are big because they've accrued from Jan 1.
 */
export async function fetchGTSForYear(lat, lon, year, baseStartDate, baseEndDate) {
  console.log("[DEBUG logic.js] fetchGTSForYear() => year=", year,
      " baseEndDate=", baseEndDate.toISOString().split('T')[0]);

  // A) Build fetch range (for older or current year):
  //    - Start always Jan 1 of that year (noon).
  //    - End is "that year’s same day/month as user’s baseEndDate" (noon) + 1 day
  const yearStart = new Date(year, 0, 1, 12, 0, 0, 0); 
  const yearEnd   = new Date(year, baseEndDate.getMonth(), baseEndDate.getDate(), 12, 0, 0, 0);
  yearEnd.setDate(yearEnd.getDate() + 1);

  console.log("[DEBUG logic.js] => yearStart=", yearStart.toISOString().split('T')[0],
              " yearEnd=", yearEnd.toISOString().split('T')[0]);

  // B) Fetch historical data from Jan1..(that day/month)
  const histData = await fetchHistoricalData(lat, lon, yearStart, yearEnd);
  if (!histData || !histData.daily) {
      console.warn("[DEBUG logic.js] no daily data found for year=", year);
      return { year, labels: [], gtsValues: [] };
  }
  const allDates = histData.daily.time;
  const allTemps = histData.daily.temperature_2m_mean;

  // C) Compute GTS from Jan1 => big sum
  const gtsResults = calculateGTS(allDates, allTemps);

  // D) Now figure out the "display" window for that year:
  //    If user picks e.g. 2 weeks (2024-12-14..2024-12-28),
  //    then for year=2023 we want 2023-12-14..2023-12-28, etc.
  //    => So we shift baseStartDate/baseEndDate to that year:
  const yearPlotStart = new Date(
    year,
    baseStartDate.getMonth(),
    baseStartDate.getDate(),
    12, 0, 0, 0
  );
  const yearPlotEnd = new Date(
    year,
    baseEndDate.getMonth(),
    baseEndDate.getDate(),
    12, 0, 0, 0
  );

  console.log("[DEBUG logic.js] => yearPlotStart=", yearPlotStart.toISOString().split('T')[0],
              " yearPlotEnd=", yearPlotEnd.toISOString().split('T')[0]);

  const yearPlotStartStr = yearPlotStart.toISOString().split('T')[0];
  const yearPlotEndStr   = yearPlotEnd.toISOString().split('T')[0];

  // E) Filter GTS to that final partial window (2 weeks) for each older year,
  //    so only the last portion (e.g. 12/14..12/27) is "displayed."
  const displayedResults = [];
  for (const g of gtsResults) {
    if (g.date >= yearPlotStartStr && g.date <= yearPlotEndStr) {
      displayedResults.push(g);
    }
  }
  console.log("[DEBUG logic.js] => final displayed results for year=", year,
      " =>", displayedResults.length, " points");

  // F) Convert to Chart.js arrays
  const labels = [];
  const gtsValues = [];
  for (const item of displayedResults) {
    labels.push(item.date);
    gtsValues.push(item.gts);
  }

  return {
    year,
    labels,
    gtsValues
  };
}


/**
 * Build 5-year data. The older years get full lines,
 * the current year is partial up to baseEndDate.
 */
export async function build5YearData(lat, lon, baseStartDate, baseEndDate) {
    const mainYear = baseEndDate.getFullYear();
    const allResults = [];

    console.log("[DEBUG logic.js] build5YearData() => mainYear=", mainYear);

    for (let y = mainYear; y > mainYear - 5; y--) {
        try {
            const yearly = await fetchGTSForYear(lat, lon, y, baseStartDate, baseEndDate);
            console.log("[DEBUG logic.js] build5YearData() => year=", y,
                " => #points=", yearly.gtsValues.length);
            allResults.push(yearly);
        } catch (err) {
            console.warn(`[build5YearData] Error year=${y}`, err);
        }
    }
    console.log("[DEBUG logic.js] build5YearData() => total sets=", allResults.length);
    return allResults;
}
