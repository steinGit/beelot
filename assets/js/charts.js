// --- FILE: /home/fridtjofstein/privat/beelot/assets/js/charts.js ---

import { formatDayMonth } from './utils.js';
import { createChart } from './chartManager.js';

/**
 * @module charts
 * Funktionen zum Plotten von Daten (GTS- und Temperatur-Plot)
 * und Farbgebung nach Imker-Farben
 */

// Existing function to pick color for a given year
export function beekeeperColor(year) {
    const remainder = ((year % 5) + 5) % 5;
    const colorMap = {
        0: "blue",              // YYYY % 5 == 0 -> BLUE
        1: "rgb(180, 180, 180)", // YYYY % 5 == 1 -> WHITE (light gray)
        2: "red",               // YYYY % 5 == 2 -> RED
        3: "green",             // YYYY % 5 == 3 -> GREEN
        4: "#ddaa00"            // YYYY % 5 == 4 -> YELLOW
    };
    return colorMap[remainder];
}

const isMobileLayout = () => (
    typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(max-width: 480px)").matches
);

const isSmallMobileLayout = () => (
    typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(max-width: 360px)").matches
);

const COLOR_MAP = {
    blue: [0, 0, 255],
    red: [255, 0, 0],
    green: [0, 128, 0],
    grey: [128, 128, 128],
    "#ddaa00": [221, 170, 0]
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const TURBO_MIN = 0.05;
const TURBO_MAX = 0.95;

const turboColor = (t) => {
    const tt = clamp(t, TURBO_MIN, TURBO_MAX);
    const r = 34.61 + tt * (1172.33 + tt * (-10793.56 + tt * (33300.12 + tt * (-38394.49 + tt * 14825.05))));
    const g = 23.31 + tt * (557.33 + tt * (1225.33 + tt * (-3574.96 + tt * (1073.77 + tt * 707.56))));
    const b = 27.2 + tt * (3211.1 + tt * (-15327.97 + tt * (27814.0 + tt * (-22569.18 + tt * 6838.66))));
    return `rgb(${clamp(Math.round(r), 0, 255)}, ${clamp(Math.round(g), 0, 255)}, ${clamp(Math.round(b), 0, 255)})`;
};

const LIGHTEN_FACTOR = 0.65;

const parseColorToRgb = (color) => {
    if (color.startsWith("rgb(")) {
        const match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (!match) {
            return null;
        }
        return [Number(match[1]), Number(match[2]), Number(match[3])];
    }
    if (color.startsWith("#") && color.length === 7) {
        return [
            parseInt(color.slice(1, 3), 16),
            parseInt(color.slice(3, 5), 16),
            parseInt(color.slice(5, 7), 16)
        ];
    }
    return COLOR_MAP[color] ?? null;
};

const lightenColor = (color, factor) => {
    const rgb = parseColorToRgb(color);
    if (!rgb) {
        return color;
    }
    const [r, g, b] = rgb;
    const lighten = (value) => Math.round(value + (255 - value) * factor);
    return `rgb(${lighten(r)}, ${lighten(g)}, ${lighten(b)})`;
};

const colorToRgba = (color, alpha) => {
    if (color.startsWith("rgb(")) {
        return color.replace("rgb(", "rgba(").replace(")", `, ${alpha})`);
    }
    if (color.startsWith("#") && color.length === 7) {
        const r = parseInt(color.slice(1, 3), 16);
        const g = parseInt(color.slice(3, 5), 16);
        const b = parseInt(color.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    const rgb = COLOR_MAP[color];
    if (!rgb) {
        return color;
    }
    return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
};

const getTurboForIndex = (yearIndex, totalYears) => {
    const t = totalYears <= 1 ? TURBO_MIN : yearIndex / (totalYears - 1);
    return turboColor(t);
};

const getQueenForIndex = (yearIndex, year) => {
    const baseColor = beekeeperColor(year);
    if (yearIndex >= 5) {
        return lightenColor(baseColor, LIGHTEN_FACTOR);
    }
    return baseColor;
};

const getColorForIndex = (yearIndex, totalYears, year, scheme) => {
    if (scheme === "turbo") {
        return getTurboForIndex(yearIndex, totalYears);
    }
    return getQueenForIndex(yearIndex, year);
};

/**
 * Plot a single GTS dataset (the existing approach).
 * E.g. filteredResults => array of { date, gts }.
 */
export function plotData(results, verbose = false, yRange = null) {
    if (verbose) {
        console.log("[charts.js] plotData() called with results:", results);
    }

    if (!results || results.length === 0) {
        console.warn("[charts.js] plotData() aufgerufen mit leeren Ergebnissen.");
        return null;
    }

    const POINTS_THRESHOLD = 100;
    const pointRadius = results.length > POINTS_THRESHOLD ? 0 : 5;
    const pointHoverRadius = results.length > POINTS_THRESHOLD ? 0 : 7;

    const labels = results.map(r => formatDayMonth(r.date));

    const data = results.map(r => r.gts);

    // Use the last date's year for color
    const endDate = new Date(results[results.length - 1].date);
    const yearColor = getColorForIndex(0, 1, endDate.getFullYear(), window.gtsColorScheme || "queen");
    const isMobile = isMobileLayout();
    const isSmallMobile = isSmallMobileLayout();
    const axisFontSize = isSmallMobile ? 9 : (isMobile ? 10 : 12);
    const legendFontSize = isSmallMobile ? 9 : (isMobile ? 10 : 12);
    const maxTicks = isSmallMobile ? 4 : (isMobile ? 6 : undefined);

    // Determine background color based on the year color
    const bgColor = colorToRgba(yearColor, 0.2);

    const canvas = document.getElementById('plot-canvas');
    const chartGTS = createChart(canvas, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: String(endDate.getFullYear()),
                data: data,
                borderColor: yearColor,
                backgroundColor: bgColor,
                fill: true,
                tension: 0.1,
                pointRadius: pointRadius,
                pointHoverRadius: pointHoverRadius
            }]
        },
        options: {
            animation: false,
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: false,
                    min: yRange ? yRange.min : undefined,
                    max: yRange ? yRange.max : undefined,
                    title: {
                        display: true,
                        text: 'Grünland-Temperatur-Summe (°Cd)'
                    },
                    ticks: {
                        font: {
                            size: axisFontSize
                        }
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Datum (Tag.Monat)'
                    },
                    ticks: {
                        maxRotation: 0,
                        minRotation: 0,
                        autoSkip: isMobile,
                        maxTicksLimit: maxTicks,
                        font: {
                            size: axisFontSize
                        }
                    }
                }
            },
            plugins: {
                tooltip: {
                    enabled: true,
                    mode: 'index',
                    intersect: false
                },
                legend: {
                    display: true,
                    position: isMobile ? 'bottom' : 'top',
                    labels: {
                        font: {
                            size: legendFontSize
                        }
                    }
                }
            },
            interaction: {
                mode: 'nearest',
                intersect: false
            }
        }
    });

    return chartGTS;
}

/**
 * Plot daily temps.
 */
export function plotDailyTemps(dates, temps, verbose = false, yRange = null) {
    if (verbose) {
        console.log("[charts.js] plotDailyTemps() called with dates:", dates);
        console.log("[charts.js] plotDailyTemps() called with temps:", temps);
    }

    const labels = dates.map(dStr => formatDayMonth(dStr));

    let yearLabel = '';
    if (dates.length > 0) {
        const lastDate = new Date(dates[dates.length - 1]);
        yearLabel = String(lastDate.getFullYear());
    }
    const isMobile = isMobileLayout();
    const isSmallMobile = isSmallMobileLayout();
    const axisFontSize = isSmallMobile ? 9 : (isMobile ? 10 : 12);
    const legendFontSize = isSmallMobile ? 9 : (isMobile ? 10 : 12);
    const maxTicks = isSmallMobile ? 4 : (isMobile ? 6 : undefined);

    const canvas = document.getElementById('temp-plot');
    const chartTemp = createChart(canvas, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: `Tagesmitteltemperatur ${yearLabel}`,
                data: temps,
                borderColor: 'rgba(20, 60, 60)',
                backgroundColor: 'rgba(20, 60, 60, 0.2)',
                fill: true,
                tension: 0.1,
                pointRadius: 5,
                pointHoverRadius: 7
            }]
        },
        options: {
            animation: false,
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: false,
                    min: yRange ? yRange.min : undefined,
                    max: yRange ? yRange.max : undefined,
                    title: {
                        display: true,
                        text: 'Tagesmitteltemperatur (°C)'
                    },
                    ticks: {
                        font: {
                            size: axisFontSize
                        }
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Datum (Tag.Monat)'
                    },
                    ticks: {
                        maxRotation: 0,
                        minRotation: 0,
                        autoSkip: isMobile,
                        maxTicksLimit: maxTicks,
                        font: {
                            size: axisFontSize
                        }
                    }
                }
            },
            plugins: {
                tooltip: {
                    enabled: true,
                    mode: 'index',
                    intersect: false
                },
                legend: {
                    display: true,
                    position: isMobile ? 'bottom' : 'top',
                    labels: {
                        font: {
                            size: legendFontSize
                        }
                    }
                }
            },
            interaction: {
                mode: 'nearest',
                intersect: false
            }
        }
    });

    return chartTemp;
}

/**
 * Plot multiple lines (one per year) in a single GTS chart
 * e.g. multiYearData => [
 *    { year: 2024, labels: [...], gtsValues: [...] },
 *    { year: 2023, labels: [...], gtsValues: [...] },
 *    ...
 * ]
 */
export function plotMultipleYearData(multiYearData, yRange = null) {
    const canvas = document.getElementById('plot-canvas');

    const years = multiYearData.map(item => item.year);
    const newestYear = Math.max(...years);
    const isMobile = isMobileLayout();
    const isSmallMobile = isSmallMobileLayout();
    const axisFontSize = isSmallMobile ? 9 : (isMobile ? 10 : 12);
    const legendFontSize = isSmallMobile ? 9 : (isMobile ? 10 : 12);
    const maxTicks = isSmallMobile ? 4 : (isMobile ? 6 : undefined);
    const POINTS_THRESHOLD = 100;
    const scheme = window.gtsColorScheme || "queen";
    const getLastFiniteValue = (values) => {
        for (let i = values.length - 1; i >= 0; i--) {
            const value = Number(values[i]);
            if (Number.isFinite(value)) {
                return value;
            }
        }
        return null;
    };

    const getPointRadius = (length) => (length > POINTS_THRESHOLD ? 0 : 4);
    const getPointHoverRadius = (length) => (length > POINTS_THRESHOLD ? 0 : 6);

    // Build multiple Chart.js datasets
    let temperatureColors = null;
    let temperatureValues = null;
    if (scheme === "temperature") {
        temperatureValues = new Map();
        multiYearData.forEach((item) => {
            const lastValue = getLastFiniteValue(item.gtsValues);
            if (lastValue !== null) {
                temperatureValues.set(item.year, lastValue);
            }
        });
        const sortedByGts = [...multiYearData].sort((a, b) => {
            const aLast = temperatureValues.get(a.year) ?? 0;
            const bLast = temperatureValues.get(b.year) ?? 0;
            return aLast - bLast;
        });
        temperatureColors = new Map();
        const total = sortedByGts.length;
        sortedByGts.forEach((item, index) => {
            temperatureColors.set(item.year, getTurboForIndex(index, total));
        });
    }

    const datasets = multiYearData.map(item => {
        const yearIndex = newestYear - item.year;
        const borderColor = scheme === "temperature"
            ? temperatureColors.get(item.year)
            : getColorForIndex(yearIndex, multiYearData.length, item.year, scheme);
        const isOlder = yearIndex >= 5;
        const pointRadius = getPointRadius(item.gtsValues.length);
        const pointHoverRadius = getPointHoverRadius(item.gtsValues.length);
        const bgColor = colorToRgba(borderColor, 0.0);

        return {
            label: `${item.year}`,
            data: item.gtsValues,
            borderColor: borderColor,
            backgroundColor: bgColor,
            fill: true,
            tension: 0.1,
            pointRadius: pointRadius,
            pointHoverRadius: pointHoverRadius,
            pointStyle: isOlder ? 'triangle' : 'circle'
        };
    });

    // Use a unified set of labels for the x-axis
    // Assuming all years have the same number of days and labels
    const masterLabels = multiYearData[0].labels;

    // console.log("[charts.js] plotMultipleYearData() masterLabels = ", masterLabels);

    const chartGTS = createChart(canvas, {
        type: 'line',
        data: {
            labels: masterLabels,
            datasets: datasets
        },
        options: {
            animation: false,
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    title: {
                        display: true,
                        text: 'Datum (Tag.Monat)'
                    },
                    ticks: {
                        maxRotation: 0,
                        minRotation: 0,
                        autoSkip: isMobile,
                        maxTicksLimit: maxTicks,
                        font: {
                            size: axisFontSize
                        }
                    }
                },
                y: {
                    beginAtZero: false,
                    min: yRange ? yRange.min : undefined,
                    max: yRange ? yRange.max : undefined,
                    title: {
                        display: true,
                        text: 'Grünland-Temperatur-Summe (°Cd)'
                    },
                    ticks: {
                        font: {
                            size: axisFontSize
                        }
                    }
                }
            },
            plugins: {
                tooltip: {
                    enabled: true,
                    mode: 'index',
                    intersect: false
                },
                legend: {
                    display: true,
                    position: isMobile ? 'bottom' : 'top',
                    labels: scheme === "temperature"
                        ? {
                            generateLabels: (chart) => {
                                const defaultGenerator = Chart?.defaults?.plugins?.legend?.labels?.generateLabels;
                                const labels = typeof defaultGenerator === "function"
                                    ? defaultGenerator(chart)
                                    : chart.data.datasets.map((dataset, datasetIndex) => ({
                                        text: dataset.label,
                                        fillStyle: dataset.borderColor,
                                        strokeStyle: dataset.borderColor,
                                        hidden: !chart.isDatasetVisible(datasetIndex),
                                        datasetIndex
                                    }));

                                return labels.sort((a, b) => {
                                    const aYear = Number(chart.data.datasets[a.datasetIndex].label);
                                    const bYear = Number(chart.data.datasets[b.datasetIndex].label);
                                    const aValue = temperatureValues?.get(aYear);
                                    const bValue = temperatureValues?.get(bYear);
                                    if (!Number.isFinite(aValue) || !Number.isFinite(bValue)) {
                                        return 0;
                                    }
                                    return bValue - aValue;
                                });
                            },
                            font: {
                                size: legendFontSize
                            }
                        }
                        : {
                            font: {
                                size: legendFontSize
                            }
                        }
                }
            },
            interaction: {
                mode: 'nearest',
                intersect: false
            }
        }
    });

    return chartGTS;
}
