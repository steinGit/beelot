/**
 * @module information
 * Implementiert die Logik zum Füllen der "Imkerlichen Information" auf Basis
 * des aktuellen Datums, der GTS-Kurve und der Tracht-Daten.
 */

import { defaultTrachtData } from './tracht_data.js';

const DEFAULT_URL_BY_PLANT = new Map(
    defaultTrachtData
        .filter((row) => row && typeof row.plant === "string")
        .map((row) => [row.plant.trim(), row.url])
);

export async function updateHinweisSection(gtsResults, endDate) {
    // STEP 0A) If localStorage has no "trachtData", set it to default.
    ensureTrachtDataInLocalStorage();

    // 0B) Grab the <section> element
    const hinweisSection = document.querySelector(".hinweis-section");
    if (!hinweisSection) {
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
        const dObj = parseLocalDateString(item.date);
        if (!dObj) {
            return;
        }
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
    const rawTrachtData = loadTrachtData("trachtData");
    const merged = mergeMissingUrls(rawTrachtData);
    let trachtData = merged.data;
    trachtData = trachtData.filter(row => row.active);

    const relevant_list = trachtData
        .filter(row => row.TS_start <= TSUM_max)
        .map(row => ({
            TSUM_start: row.TS_start,
            plant: row.plant,
            url: row.url
        }))
        .sort((a, b) => a.TSUM_start - b.TSUM_start);

    // 4) forecast_list => items with TSUM_start > TSUM_current but <= TSUM_max
    let forecast_list = [];
    if (n > 5) {
        forecast_list = relevant_list.filter(
            row => row.TSUM_start > TSUM_current
        );
    } else {
        console.log("[INFO] No forecast generated: within the first 5 days of the year.");
    }

    // 5) rearview_list => items in last R days => TSUM_start > D_E[n-R], TSUM_start <= TSUM_current
    const TSUM_rearviewLimit = (n - R) < 1 ? 0 : (D_E[n - R] || 0);
    const rearview_list = relevant_list.filter(row => {
        return row.TSUM_start > TSUM_rearviewLimit && row.TSUM_start <= TSUM_current;
    });
    computeDatesForList(forecast_list, D_E, n, endDate);
    computeDatesForList(rearview_list, D_E, n, endDate);

    let noPastInfoLine = "";
    let noFutureInfoLine = "";
    const timelineRows = [];
    const danachRows = [];
    const pushRow = (targetRows, timeText, contentHtml, gtsText, rowStyle = "") => {
        targetRows.push(
            `<tr${rowStyle ? ` style="${rowStyle}"` : ""}>
              <td class="imker-col-time">${timeText}</td>
              <td class="imker-col-content">${contentHtml}</td>
              <td class="imker-col-gts">${gtsText}</td>
            </tr>`
        );
    };

    // 6) Build HTML
    let html = "<h2>Imkerliche Information</h2>\n";
    html += `
      <p>
        <span class="small-gray-text">
          <a href="components/einstellungen.html">Die Tracht Einstellungen können ergänzt oder modifiziert werden.</a>
        </span>
      </p>
    `;

    const getRecommendationInfo = (row) => {
        const plantText = typeof row.plant === "string" ? row.plant : "";
        const marker = "Empfehlung:";
        const markerIndex = plantText.indexOf(marker);
        if (markerIndex === -1) {
            return { isRecommendation: false, cleanPlant: plantText };
        }
        const cleanPlant = plantText.slice(markerIndex + marker.length).trim();
        return { isRecommendation: true, cleanPlant: cleanPlant || plantText.trim() };
    };

    const buildPlantLabelForRow = (row) => {
        const info = getRecommendationInfo(row);
        if (!info.isRecommendation) {
            return buildPlantLabel(row);
        }
        const adjusted = { ...row, plant: info.cleanPlant };
        return buildPlantLabel(adjusted);
    };

    const recommendationPrefix = "💡 Empfehlung: ";

    const groupEntries = (list, getRelText) => {
        const groups = new Map();
        list.forEach((row) => {
            const relText = getRelText(row);
            const dateText = row.date || "";
            const gtsValue = row.TSUM_start;
            const recommendationInfo = getRecommendationInfo(row);
            const keySuffix = recommendationInfo.isRecommendation
                ? `rec|${recommendationInfo.cleanPlant}`
                : "normal";
            const key = `${relText}|${dateText}|${gtsValue}|${keySuffix}`;
            if (!groups.has(key)) {
                groups.set(key, {
                    relText,
                    dateText,
                    gtsValue,
                    plants: [],
                    isRecommendation: recommendationInfo.isRecommendation
                });
            }
            groups.get(key).plants.push(buildPlantLabelForRow(row));
        });
        return Array.from(groups.values());
    };

    // 6A) Rearview info
    if (rearview_list.length === 0) {
        noPastInfoLine = `<p style="color: grey;">
          Keine Information zu den letzten ${R} Tagen
        </p>`;
    } else {
        const rearviewGroups = groupEntries(rearview_list, (row) => {
            const absDays = Math.abs(row.days);
            if (absDays === 0) {
                return "Heute";
            }
            return `vor ${absDays} Tagen`;
        });
        rearviewGroups.forEach((group) => {
            const plantList = group.plants.join(", ");
            const prefix = group.isRecommendation ? recommendationPrefix : "";
            const className = group.isRecommendation ? "imker-empfehlung-inline" : "";
            if (group.relText === "Heute") {
                const style = "font-weight: bold; color: #ff8020;";
                pushRow(
                    timelineRows,
                    `${group.relText} am ${group.dateText}:`,
                    `<span class="${className}">${prefix}${plantList}</span>`,
                    `GTS = ${group.gtsValue}`,
                    style
                );
            } else {
                const style = group.isRecommendation
                    ? "font-weight: bold; color: #802020;"
                    : "color: #802020;";
                pushRow(
                    timelineRows,
                    `${group.relText} am ${group.dateText}:`,
                    `<span class="${className}">${prefix}${plantList}</span>`,
                    `GTS = ${group.gtsValue}`,
                    style
                );
            }
        });
    }

    // 6B) Forecast info
    const n_forecasts = forecast_list.length
    if (n_forecasts > 0) {
        // We have some forecast items => do NOT show the “Danach:” part
        const forecastGroups = groupEntries(forecast_list, (row) => `in ${row.days} Tagen`);
        forecastGroups.forEach((group) => {
            const plantList = group.plants.join(", ");
            const prefix = group.isRecommendation ? recommendationPrefix : "";
            const className = group.isRecommendation ? "imker-empfehlung-inline" : "";
            const style = "font-weight: bold; color: #206020;";
            pushRow(
                timelineRows,
                `${group.relText} am ${group.dateText}:`,
                `<span class="${className}">${prefix}${plantList}</span>`,
                `GTS = ${group.gtsValue}`,
                style
            );
        });
    } else {
        noFutureInfoLine = `<p style="color: grey;">
          Keine Information zu den nächsten ${F} Tagen
        </p>`;

    }

    const max_n_upcoming = 3
    const n_upcoming = Math.max(0, max_n_upcoming - n_forecasts)
    if (n_upcoming > 0) {
        const upcomingAll = trachtData
          .filter(row => row.TS_start > TSUM_max)
          .sort((a, b) => {
            if (a.TS_start !== b.TS_start) {
              return a.TS_start - b.TS_start;
            }
            return a.plant.localeCompare(b.plant);
          });
        const upcomingTop = upcomingAll.slice(0, n_upcoming);

        if (upcomingTop.length > 0) {
            const danachGroups = new Map();
            upcomingTop.forEach((item) => {
                const key = item.TS_start;
                if (!danachGroups.has(key)) {
                    danachGroups.set(key, []);
                }
                danachGroups.get(key).push(item);
            });
            Array.from(danachGroups.entries()).forEach(([gtsValue, items]) => {
                const labels = items.map((item) => {
                    const info = getRecommendationInfo(item);
                    const label = buildPlantLabelForRow(item);
                    if (info.isRecommendation) {
                        return `<span class="imker-empfehlung-inline">${recommendationPrefix}${label}</span>`;
                    }
                    return label;
                }).join(", ");
                const hasRecommendation = items.some((item) => getRecommendationInfo(item).isRecommendation);
                const style = hasRecommendation
                    ? "font-weight: bold; color: #608000;"
                    : "color: #608000;";
                pushRow(
                    danachRows,
                    "",
                    `${labels}`,
                    `bei GTS = ${gtsValue}`,
                    style
                );
            });
        }
    }

    if (noPastInfoLine) {
        html += noPastInfoLine;
    }

    if (timelineRows.length > 0) {
        html += `
          <table class="imker-info-table">
            <tbody>
              ${timelineRows.join("\n")}
            </tbody>
          </table>
        `;
    }

    if (noFutureInfoLine) {
        html += noFutureInfoLine;
    }

    if (danachRows.length > 0) {
        html += `<p style="font-style: italic;">Danach:</p>`;
        html += `
          <table class="imker-info-table">
            <tbody>
              ${danachRows.join("\n")}
            </tbody>
          </table>
        `;
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
    return;
  }
  try {
    const parsed = JSON.parse(stored);
    const merged = mergeMissingUrls(parsed);
    if (merged.changed) {
      localStorage.setItem(TRACT_DATA_KEY, JSON.stringify(merged.data));
    }
  } catch (error) {
    console.warn("[information.js] Failed to parse trachtData for URL migration.", error);
  }
}

// ----------------------
// Remaining helper funcs
// ----------------------
function isLeapYear(y) {
    return ((y % 400 === 0) || (y % 4 === 0 && y % 100 !== 0));
}

function dayOfYear(d) {
    const year = d.getFullYear();
    const month = d.getMonth();
    const day = d.getDate();
    const utcStart = Date.UTC(year, 0, 1);
    const utcCurrent = Date.UTC(year, month, day);
    const oneDay = 24 * 60 * 60 * 1000;
    return Math.floor((utcCurrent - utcStart) / oneDay) + 1;
}

function loadTrachtData(key) {
    const stored = localStorage.getItem(key);
    if (!stored) {
        return [];
    }
    return JSON.parse(stored);
}

function mergeMissingUrls(trachtData) {
    if (!Array.isArray(trachtData)) {
        return { data: [], changed: false };
    }
    const normalizePlantName = (name) => (typeof name === "string" ? name.trim() : "");
    const urlByPlant = new Map();
    defaultTrachtData.forEach((row) => {
        if (row && typeof row.plant === "string" && typeof row.url === "string" && row.url.trim()) {
            urlByPlant.set(normalizePlantName(row.plant), row.url);
        }
    });
    let changed = false;
    const data = trachtData.map((row) => {
        if (!row || typeof row !== "object") {
            return row;
        }
        const key = normalizePlantName(row.plant);
        if (row.url == null && urlByPlant.has(key)) {
            changed = true;
            return { ...row, url: urlByPlant.get(key) };
        }
        return row;
    });
    return { data, changed };
}

function buildPlantLabel(row) {
    if (!row) {
        return "";
    }
    const plant = row.plant || "";
    let url = typeof row.url === "string" ? row.url.trim() : "";
    if (!url && row && !Object.prototype.hasOwnProperty.call(row, "url")) {
        const fallback = DEFAULT_URL_BY_PLANT.get(plant.trim());
        if (typeof fallback === "string") {
            url = fallback.trim();
        }
    }
    if (!url) {
        return plant;
    }
    return `<a href="${url}" target="_blank" rel="noopener noreferrer">${plant}</a>`;
}

function computeDatesForList(list, curve, dayNow, referenceDate) {
    if (!(referenceDate instanceof Date)) {
        return;
    }
    const referenceYear = referenceDate.getFullYear();
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
            row.date = transform_to_month_day(foundDayIndex, dayNow, referenceYear);
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

function parseLocalDateString(dateStr) {
    if (typeof dateStr !== "string") {
        return null;
    }
    const parts = dateStr.split("-");
    if (parts.length !== 3) {
        return null;
    }
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
        return null;
    }
    return new Date(year, month, day, 0, 0, 0, 0);
}
