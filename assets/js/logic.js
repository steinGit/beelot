/**
 * @module logic
 * Berechnungen und Hilfsfunktionen
 */

import { datumInput, zeitraumSelect } from './ui.js';

export function getSelectedEndDate() {
    return new Date(datumInput.value);
}

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

export function calculateGTS(dates, values) {
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
    return results;
}
