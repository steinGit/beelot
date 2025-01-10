// --- FILE: /home/fridtjofstein/privat/beelot/assets/js/charts.js ---

import { formatDayMonth } from './utils.js';

/**
 * @module charts
 * Funktionen zum Plotten von Daten (GTS- und Temperatur-Plot)
 * und Farbgebung nach Imker-Farben
 */

// Existing function to pick color for a given year
export function beekeeperColor(year) {
    const remainder = year % 5;
    const colorMap = {
        0: "blue",    // e.g. 2025 -> remainder=0 -> blue
        1: "grey",    // e.g. 2026 -> remainder=1 -> grey
        2: "#ddaa00", // e.g. 2027 -> remainder=2
        3: "red",     // e.g. 2028 -> remainder=3
        4: "green"    // e.g. 2029 -> remainder=4
    };
    return colorMap[remainder];
}

/**
 * Plot a single GTS dataset (the existing approach).
 * E.g. filteredResults => array of { date, gts }.
 */
export function plotData(results, verbose = false) {
    if (verbose) {
        console.log("[charts.js] plotData() called with results:", results);
    }

    if (!results || results.length === 0) {
        console.warn("[charts.js] plotData() aufgerufen mit leeren Ergebnissen.");
        return null;
    }

    const labels = results.map(r => formatDayMonth(r.date));

    const data = results.map(r => r.gts);

    // Use the last date's year for color
    const endDate = new Date(results[results.length - 1].date);
    const yearColor = beekeeperColor(endDate.getFullYear());

    // Determine background color based on the year color
    let bgColor = 'rgba(0,0,255,0.2)';
    if (yearColor === 'grey') {
        bgColor = 'rgba(128,128,128,0.2)';
    } else if (yearColor === '#ddaa00') {
        bgColor = 'rgba(221,170,0,0.2)';
    } else if (yearColor === 'red') {
        bgColor = 'rgba(255,0,0,0.2)';
    } else if (yearColor === 'green') {
        bgColor = 'rgba(0,128,0,0.2)';
    } else if (yearColor === 'blue') {
        bgColor = 'rgba(0,0,255,0.2)';
    }

    const ctx = document.getElementById('plot-canvas').getContext('2d');
    const chartGTS = new Chart(ctx, {
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
                pointRadius: 5,
                pointHoverRadius: 7
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: false,
                    title: {
                        display: true,
                        text: 'Grünland-Temperatur-Summe (°C)'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Datum (Tag.Monat)'
                    },
                    ticks: {
                        maxRotation: 0,
                        minRotation: 0
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
                    position: 'top'
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
export function plotDailyTemps(dates, temps, verbose = false) {
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

    const ctx = document.getElementById('temp-plot').getContext('2d');
    const chartTemp = new Chart(ctx, {
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
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: false,
                    title: {
                        display: true,
                        text: 'Tagesmitteltemperatur (°C)'
                    }
                },
                x: {
                    title: {
                        display: true,
                        text: 'Datum (Tag.Monat)'
                    },
                    ticks: {
                        maxRotation: 0,
                        minRotation: 0
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
                    position: 'top'
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
export function plotMultipleYearData(multiYearData) {
    const ctx = document.getElementById('plot-canvas').getContext('2d');

    // Build multiple Chart.js datasets
    const datasets = multiYearData.map(item => {
        const yearColor = beekeeperColor(item.year);
        let bgColor = 'rgba(0,0,255,0.0)';
        if (yearColor === 'grey') {
            bgColor = 'rgba(128,128,128,0.0)';
        } else if (yearColor === '#ddaa00') {
            bgColor = 'rgba(221,170,0,0.0)';
        } else if (yearColor === 'red') {
            bgColor = 'rgba(255,0,0,0.0)';
        } else if (yearColor === 'green') {
            bgColor = 'rgba(0,128,0,0.0)';
        } else if (yearColor === 'blue') {
            bgColor = 'rgba(0,0,255,0.0)';
        }

        // Ensure labels are formatted as "day.month" without leading zeros
        const formattedLabels = item.labels.map(dStr => formatDayMonth(dStr));

        return {
            label: `${item.year}`,
            data: item.gtsValues,
            borderColor: yearColor,
            backgroundColor: bgColor,
            fill: true,
            tension: 0.1,
            pointRadius: 4,
            pointHoverRadius: 6
        };
    });

    // Use a unified set of labels for the x-axis
    // Assuming all years have the same number of days and labels
    const masterLabels = multiYearData[0].labels;

    console.log("[charts.js] plotMultipleYearData() masterLabels = ", masterLabels);

    const chartGTS = new Chart(ctx, {
        type: 'line',
        data: {
            labels: masterLabels,
            datasets: datasets
        },
        options: {
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
                        minRotation: 0
                    }
                },
                y: {
                    beginAtZero: false,
                    title: {
                        display: true,
                        text: 'Grünland-Temperatur-Summe (°C)'
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
                    position: 'top'
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
