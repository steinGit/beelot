/**
 * @module information
 * Implementiert die Logik zum Füllen der "Imkerlichen Information" auf Basis
 * des aktuellen Datums, der GTS-Kurve und der Tracht-Daten.
 */

export async function updateHinweisSection(gtsResults, endDate) {
    /**
     * gtsResults: Array of { date: "YYYY-MM-DD", gts: number } from calculateGTS()
     * endDate:    JavaScript Date object for the selected date (local noon)
     *
     * We will:
     * 1) Convert gtsResults into a day-based curve C(day).
     * 2) Extend it by F=14 days linearly => new curve D(day).
     * 3) Use TSUM_current = D(n), TSUM_max = D(m).
     * 4) Load the Tracht data from localStorage => relevant_list.
     * 5) Build forecast_list & rearview_list => compute approximate dates => fill HTML.
     */

    const R = 7;   // Rearview window
    const F = 14;  // Forecast window

    // 0) Grab the <section> element
    const hinweisSection = document.querySelector(".hinweis-section");
    if (!hinweisSection) {
        console.log("[information.js] .hinweis-section not found in DOM => cannot update.");
        return;
    }

    // 1) Convert gtsResults => C(day)
    //    We interpret "Jan 1" as day=1, "Jan 2" as day=2, etc.
    //    We'll find the difference in days from Jan 1 to each date.
    //    For example:
    //      if endDate is 2024-03-20, that is day=80 (if leap year 2024).
    //    We'll store them in an array D_C such that D_C[day] = GTS value
    //    (some days might be missing if data was incomplete, we do our best).
    const year = endDate.getFullYear();
    const isLeap = isLeapYear(year);
    // dayOfYear for endDate:
    const n = dayOfYear(endDate); // This is the "today index" in the curve

    // Create an array big enough for day=1..n (and maybe a bit more).
    const D_C = []; // D_C[i] = GTS at day i
    for (let i = 0; i <= n; i++) {
        D_C.push(null);
    }

    // Fill D_C from gtsResults:
    //   Each item has date='YYYY-MM-DD', find dayOfYear(date), store gts
    gtsResults.forEach(item => {
        const dObj = new Date(item.date);
        const dIndex = dayOfYear(dObj);
        if (dIndex >= 1 && dIndex < D_C.length) {
            D_C[dIndex] = item.gts;
        }
    });

    // Because of possible daily missing data, fill forward any null spots
    let lastKnown = 0;
    for (let i = 1; i < D_C.length; i++) {
        if (D_C[i] === null) {
            D_C[i] = lastKnown;
        } else {
            lastKnown = D_C[i];
        }
    }

    // Now D_C[1..n] is the GTS curve up to endDate

    // 2) Extend curve D by F=14 days linearly:
    //    We'll call the extended array => D_E. It has length m = n + F or up to 365/366.
    //    We do a simple approach: slope = average slope over the last F days of actual data.
    //    If n < 2 => no slope => remain constant.
    const maxDays = isLeap ? 366 : 365;
    const m = Math.min(n + F, maxDays);

    // We'll find slope from the last F days in D_C. If we have fewer than F days, use what we can
    let slope = 0;
    const windowSize = Math.min(F, n - 1); // we need at least 2 days to find a slope
    if (windowSize > 0) {
        let sum = 0;
        // We'll sum the daily increments from day (n - windowSize) .. (n-1)
        const startSlopeDay = n - windowSize;
        for (let i = startSlopeDay; i < n; i++) {
            if (D_C[i + 1] != null && D_C[i] != null) {
                sum += (D_C[i + 1] - D_C[i]);
            }
        }
        slope = sum / windowSize; // average daily increment
    }

    // Build D_E (size m)
    const D_E = [];
    for (let i = 1; i <= n; i++) {
        D_E[i] = D_C[i];
    }
    for (let i = n + 1; i <= m; i++) {
        D_E[i] = D_E[i - 1] + slope;
    }

    // TSUM_current = D_E[n]
    // TSUM_max = D_E[m]
    const TSUM_current = D_E[n] || 0;
    const TSUM_max = D_E[m] || TSUM_current;

    // 3) Load Tracht data from localStorage => relevant_list
    //    relevant_list => all active rows where TS_start <= TSUM_max
    const TRACT_DATA_KEY = "trachtData";
    let trachtData = loadTrachtData(TRACT_DATA_KEY);
    // Filter only those that are .active == true
    trachtData = trachtData.filter(row => row.active);

    const relevant_list = trachtData
          .filter(row => row.TS_start <= TSUM_max)
          .map(row => {
              return {
                  TSUM_start: row.TS_start,
                  string: row.plant
              };
          })
    // sort by TS_start ascending
          .sort((a, b) => a.TSUM_start - b.TSUM_start);

    // 4) A) forecast_list => TSUM_start > TSUM_current
    const forecast_list = relevant_list.filter(
        row => row.TSUM_start > TSUM_current
    );

    // 4) B) rearview_list => TSUM_start <= TSUM_current
    //        but also TSUM_start >= TSUM_start_rearview_list
    //        TSUM_start_rearview_list = D_E[n-R]
    const TSUM_rearviewLimit = (n - R) < 1 ? 0 : (D_E[n - R] || 0);
    const rearview_list = relevant_list.filter(row => {
        return row.TSUM_start > TSUM_rearviewLimit && row.TSUM_start <= TSUM_current;
    });

    // 5) For each item in forecast_list / rearview_list, find the earliest i in [1..m]
    //    for which D_E[i] > TSUM_start. We'll store => row.date, row.days (i - n)
    //    row['days'] = how many days from n. If negative => in the past.
    computeDatesForList(forecast_list, D_E, n);
    computeDatesForList(rearview_list, D_E, n);

    // 6) Render result lines into the <section class="hinweis-section">
    //    We'll replace the 5 lines with new HTML
    let html = "<h2>Imkerliche Information</h2>\n";

    html += `<p>
          <span class="small-gray-text">
              Die Tracht Einstellungen können <a href="http://127.0.0.1:8000/components/einstellungen.html">hier</a> ergänzt oder modifiziert werden.
          </span>
      </p>`;

    // 6A) Rearview info
    if (rearview_list.length === 0) {
        html += `<p style="color: grey;">
        Keine Information zu den letzten ${R} Tagen
      </p>`;
    } else {
        rearview_list.forEach(row => {

            // row.days is negative or zero if in the past
            const absDays = Math.abs(row.days);
            if (absDays === 0) {
                html += `<p style="font-weight: bold; color: #ff8020;">`   // same day
                html += `Heute am ${row.date}: ${row.string}  (GTS = ${row.TSUM_start})
      </p>`;
            } else {
                html += `<p style="color: #802020;">`   // past
                html += `vor ${absDays} Tagen am ${row.date}: ${row.string}  (GTS = ${row.TSUM_start})
      </p>`;
            }
        });
    }

    // 6B) Forecast info
    if (forecast_list.length === 0) {
        html += `<p style="color: grey;">
        Keine Information zu den nächsten ${F} Tagen
      </p>`;
    } else {
        forecast_list.forEach(row => {
            // row.days is positive
            html += `<p style="font-weight: bold; color: #206020;">
        in ${row.days} Tagen am ${row.date}: ${row.string}   (GTS = ${row.TSUM_start})
      </p>`;
        });
    }

    // Replace the entire hinweisSection content
    hinweisSection.innerHTML = html;

    // Done
}

// ----------------------
// Helper functions
// ----------------------
function isLeapYear(y) {
    if ((y % 400 === 0) || (y % 4 === 0 && y % 100 !== 0)) {
        return true;
    }
    return false;
}

/**
 * Returns the day of year for a date, e.g. Jan 1 => 1, Jan 31 => 31, Feb 1 => 32, ...
 * Accounts for leap years automatically by using the local time in JS.
 */
function dayOfYear(d) {
    // Copy date
    const start = new Date(d.getFullYear(), 0, 1); // Jan 1 local noon
    const diff = d - start; // in ms
    const oneDay = 24 * 60 * 60 * 1000;
    // floor # of days + 1
    return Math.floor(diff / oneDay) + 1;
}

function loadTrachtData(key) {
    const stored = localStorage.getItem(key);
    if (!stored) {
        return [];
    }
    return JSON.parse(stored);
}

function computeDatesForList(list, curve, dayNow) {
    // For each item, we want the earliest i in [1..curve.length-1]
    // such that curve[i] >= row.TSUM_start
    // Then row.date = transform_to_month_day(i),
    // row.days = i - dayNow
    for (const row of list) {
        const needed = row.TSUM_start;
        let foundDayIndex = null;
        for (let i = 1; i < curve.length; i++) {
            if (curve[i] >= needed) {
                foundDayIndex = i;
                break;
            }
        }
        if (foundDayIndex) {
            row.date = transform_to_month_day(foundDayIndex, dayNow, new Date().getFullYear());
            row.days = foundDayIndex - dayNow;
        } else {
            // if never found (?), fallback
            row.date = "??";
            row.days = 999;
        }
    }
}

/**
 * Utility: transform dayIndex => "DD.MM."
 *
 * We do dayIndex in the current year (which might be yearNow).
 * If dayNow is in a different year edge case, you might want a smarter approach.
 */
function transform_to_month_day(dayIndex, dayNow, year) {
    // Build a date => year, january 1 => dayIndex
    const d = new Date(year, 0, 1, 12, 0, 0, 0);
    d.setDate(d.getDate() + (dayIndex - 1)); // dayIndex=1 => same day
    const dd = d.getDate();
    const mm = d.getMonth() + 1;
    return `${dd}.${mm}.`;
}
