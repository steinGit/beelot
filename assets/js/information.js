/**
 * @module information
 * Implementiert die Logik zum Füllen der "Imkerlichen Information" auf Basis
 * des aktuellen Datums, der GTS-Kurve und der Tracht-Daten.
 */

import { defaultTrachtData } from './tracht_data.js';

export async function updateHinweisSection(gtsResults, endDate) {
    // STEP 0A) If localStorage has no "trachtData", set it to default.
    ensureTrachtDataInLocalStorage();

    // 0B) Grab the <section> element
    const hinweisSection = document.querySelector(".hinweis-section");
    if (!hinweisSection) {
        console.log("[information.js] .hinweis-section not found in DOM => cannot update.");
        return;
    }

    // 1) Convert gtsResults => C(day)
    const year = endDate.getFullYear();
    const isLeap = isLeapYear(year);
    const n = dayOfYear(endDate); // The “today index” in the curve

    // Build array D_C for days [1..n]
    const D_C = [];
    for (let i = 0; i <= n; i++) {
        D_C.push(null);
    }

    gtsResults.forEach(item => {
        const dObj = new Date(item.date);
        const dIndex = dayOfYear(dObj);
        if (dIndex >= 1 && dIndex < D_C.length) {
            D_C[dIndex] = item.gts;
        }
    });

    // Fill forward any null spots
    let lastKnown = 0;
    for (let i = 1; i < D_C.length; i++) {
        if (D_C[i] === null) {
            D_C[i] = lastKnown;
        } else {
            lastKnown = D_C[i];
        }
    }

    // 2) Extend curve by F=14 days linearly => D_E
    const R = 7;   // Rearview window
    const F = 14;  // Forecast window
    const maxDays = isLeap ? 366 : 365;
    const m = Math.min(n + F, maxDays);

    // Slope from last F days in D_C
    let slope = 0;
    const windowSize = Math.min(F, n - 1);
    if (windowSize > 0) {
        let sum = 0;
        const startSlopeDay = n - windowSize;
        for (let i = startSlopeDay; i < n; i++) {
            if (D_C[i + 1] != null && D_C[i] != null) {
                sum += (D_C[i + 1] - D_C[i]);
            }
        }
        slope = sum / windowSize;
    }

    const D_E = [];
    for (let i = 1; i <= n; i++) {
        D_E[i] = D_C[i];
    }
    for (let i = n + 1; i <= m; i++) {
        D_E[i] = D_E[i - 1] + slope;
    }

    const TSUM_current = D_E[n] || 0;
    const TSUM_max = D_E[m] || TSUM_current;

    // 3) Load Tracht data => relevant_list
    let trachtData = loadTrachtData("trachtData");
    trachtData = trachtData.filter(row => row.active);

    const relevant_list = trachtData
        .filter(row => row.TS_start <= TSUM_max)
        .map(row => ({
            TSUM_start: row.TS_start,
            string: row.plant
        }))
        .sort((a, b) => a.TSUM_start - b.TSUM_start);

    // 4) forecast_list => items with TSUM_start > TSUM_current but <= TSUM_max
    let forecast_list = [];
    if (n > 5) {
        forecast_list = relevant_list.filter(
            row => row.TSUM_start > TSUM_current
        );
        computeDatesForList(forecast_list, D_E, n);
    } else {
        console.log("[INFO] No forecast generated: within the first 5 days of the year.");
    }

    // 5) rearview_list => items in last R days => TSUM_start > D_E[n-R], TSUM_start <= TSUM_current
    const TSUM_rearviewLimit = (n - R) < 1 ? 0 : (D_E[n - R] || 0);
    const rearview_list = relevant_list.filter(row => {
        return row.TSUM_start > TSUM_rearviewLimit && row.TSUM_start <= TSUM_current;
    });
    computeDatesForList(forecast_list, D_E, n);
    computeDatesForList(rearview_list, D_E, n);

    // 6) Build HTML
    let html = "<h2>Imkerliche Information</h2>\n";
    html += `
      <p>
        <span class="small-gray-text">
          <a href="components/einstellungen.html">Die Tracht Einstellungen können ergänzt oder modifiziert werden.</a>
        </span>
      </p>
    `;

    // 6A) Rearview info
    if (rearview_list.length === 0) {
        html += `<p style="color: grey;">
          Keine Information zu den letzten ${R} Tagen
        </p>`;
    } else {
        rearview_list.forEach(row => {
            const absDays = Math.abs(row.days);
            if (absDays === 0) {
                html += `<p style="font-weight: bold; color: #ff8020;">
                  Heute am ${row.date}: ${row.string}  (GTS = ${row.TSUM_start})
                </p>`;
            } else {
                html += `<p style="color: #802020;">
                  vor ${absDays} Tagen am ${row.date}: ${row.string}  (GTS = ${row.TSUM_start})
                </p>`;
            }
        });
    }

    // 6B) Forecast info

    const n_forecasts = forecast_list.length
    if (n_forecasts > 0) {
        // We have some forecast items => do NOT show the “Danach:” part
        forecast_list.forEach(row => {
            html += `<p style="font-weight: bold; color: #206020;">
              in ${row.days} Tagen am ${row.date}: ${row.string} (GTS = ${row.TSUM_start})
            </p>`;
        });

    }

    const max_n_upcoming = 3
    const n_upcoming = Math.max(0, max_n_upcoming - n_forecasts)
    if (n_upcoming > 0) {
        if (n_forecasts === 0) {
            html += `<p style="color: grey;">
          Keine Information zu den nächsten ${F} Tagen
        </p>`;
        }
        const upcomingAll = trachtData
          .filter(row => row.TS_start > TSUM_current)
          .sort((a, b) => {
            if (a.TS_start !== b.TS_start) {
              return a.TS_start - b.TS_start;
            }
            return a.plant.localeCompare(b.plant);
          });
        const upcomingTop = upcomingAll.slice(0, n_upcoming);

        if (upcomingTop.length > 0) {
            html += `<p style="font-style: italic;">Danach:</p>`;
            upcomingTop.forEach(item => {
                html += `<p style="color: #608000;">
                  bei GTS=${item.TS_start} ${item.plant}
                </p>`;
            });
        }
    }

    hinweisSection.innerHTML = html;
}

// ------------------------------------------------
// Helper: ensure localStorage has defaultTrachtData
// ------------------------------------------------
function ensureTrachtDataInLocalStorage() {
  const TRACT_DATA_KEY = "trachtData";
  const stored = localStorage.getItem(TRACT_DATA_KEY);
  if (!stored) {
    console.log("[information.js] No trachtData in localStorage => using defaults.");
    localStorage.setItem(TRACT_DATA_KEY, JSON.stringify(defaultTrachtData));
  }
}

// ----------------------
// Remaining helper funcs
// ----------------------
function isLeapYear(y) {
    return ((y % 400 === 0) || (y % 4 === 0 && y % 100 !== 0));
}

function dayOfYear(d) {
    const start = new Date(d.getFullYear(), 0, 1);
    const diff = d - start;
    const oneDay = 24 * 60 * 60 * 1000;
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
            row.date = "??";
            row.days = 999;
        }
    }
}

function transform_to_month_day(dayIndex, dayNow, year) {
    const d = new Date(year, 0, 1, 12, 0, 0, 0);
    d.setDate(d.getDate() + (dayIndex - 1));
    const dd = d.getDate();
    const mm = d.getMonth() + 1;
    return `${dd}.${mm}.`;
}
