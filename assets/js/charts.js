/**
 * @module charts
 * Funktionen zum Plotten von Daten (GTS- und Temperatur-Plot) 
 * und Farbgebung nach Imker-Farben
 */

export function beekeeperColor(year) {
    const remainder = year % 5;
    const colorMap = {
        0: "blue",
        1: "grey",
        2: "#ddaa00",
        3: "red",
        4: "green"
    };
    return colorMap[remainder];
}

export function plotData(results) {
    const labels = results.map(r => {
        const d = new Date(r.date);
        return `${d.getDate()}.${d.getMonth()+1}`;
    });

    const data = results.map(r => r.gts);

    const endDate = new Date(results[results.length - 1].date);
    const yearColor = beekeeperColor(endDate.getFullYear());

    let bgColor = 'rgba(0,0,255,0.2)';
    if (yearColor === 'grey') bgColor = 'rgba(128,128,128,0.2)';
    else if (yearColor === '#ddaa00') bgColor = 'rgba(221,170,0,0.2)';
    else if (yearColor === 'red') bgColor = 'rgba(255,0,0,0.2)';
    else if (yearColor === 'green') bgColor = 'rgba(0,128,0,0.2)';
    else if (yearColor === 'blue') bgColor = 'rgba(0,0,255,0.2)';

    const ctx = document.getElementById('plot-canvas').getContext('2d');
    const chartGTS = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Grünlandtemperatursumme (GTS)',
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
                    beginAtZero: false
                }
            },
            plugins: {
                tooltip: {
                    enabled: true,
                    mode: 'index',
                    intersect: false
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

export function plotDailyTemps(dates, temps) {
    const labels = dates.map(dStr => {
        const d = new Date(dStr);
        return `${d.getDate()}.${d.getMonth()+1}`;
    });

    const ctx = document.getElementById('temp-plot').getContext('2d');
    const chartTemp = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Tagesmitteltemperatur (°C)',
                data: temps,
                borderColor: 'blue',
                backgroundColor: 'rgba(0, 0, 255, 0.2)',
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
                    beginAtZero: false
                }
            },
            plugins: {
                tooltip: {
                    enabled: true,
                    mode: 'index',
                    intersect: false
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
