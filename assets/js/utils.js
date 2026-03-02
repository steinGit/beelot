// utils.js

/**
 * @module utils
 * Provides utility functions for date formatting and validation.
 */

/**
 * Formats a Date object into 'YYYY-MM-DD' based on local time.
 * @param {Date} date - The Date object to format.
 * @returns {string} - The formatted date string.
 */
export function formatDateLocal(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0'); // Months are zero-based
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Formats a date string to "day.month" without leading zeros.
 * @param {string} dateStr - Date string in "YYYY-MM-DD" format.
 * @returns {string} - Formatted date as "day.month"
 */
export function formatDayMonth(dateStr) {
    const d = new Date(dateStr);
    const day = d.getDate();
    const month = d.getMonth() + 1;
    return `${day}.${month}`;
}

/**
 * Validates if a Date object is valid.
 * @param {Date} d - The Date object to validate.
 * @returns {boolean} - True if valid, false otherwise.
 */
export function isValidDate(d) {
  return d instanceof Date && !isNaN(d);
}

/**
 * Extends a given Date object to the end of the day (23:59:59.999).
 * @param {Date} date - The Date object to extend.
 * @returns {Date} - The extended Date object.
 */
export function extendToEndOfDay(date) {
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    return endOfDay;
}

/**
 * Calculates the start date for a given timeframe.
 * @param {Date} endDate - The end date.
 * @param {number} days - Number of days for the timeframe.
 * @returns {Date} - The calculated start date.
 */
export function calculateStartDate(endDate, days) {
    const startDate = new Date(endDate);
    startDate.setDate(endDate.getDate() - (days - 1));
    return startDate;
}

function parseDateStringLocal(value) {
    if (typeof value !== "string") {
        return null;
    }
    const parts = value.split("-");
    if (parts.length !== 3) {
        return null;
    }
    const year = Number.parseInt(parts[0], 10);
    const month = Number.parseInt(parts[1], 10);
    const day = Number.parseInt(parts[2], 10);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
        return null;
    }
    const date = new Date(year, month - 1, day, 0, 0, 0, 0);
    if (!isValidDate(date)) {
        return null;
    }
    if (
        date.getFullYear() !== year
        || date.getMonth() !== month - 1
        || date.getDate() !== day
    ) {
        return null;
    }
    return date;
}

/**
 * Shifts a YYYY-MM-DD date string by a number of days in local time.
 * Optionally clamps the result to a maximum date.
 * @param {string} value - Base date in YYYY-MM-DD.
 * @param {number} deltaDays - Number of days to shift (positive or negative).
 * @param {string|null} maxDateValue - Optional max date in YYYY-MM-DD.
 * @returns {string|null} - Shifted date string or null for invalid input.
 */
export function shiftDateStringByDays(value, deltaDays, maxDateValue = null) {
    const baseDate = parseDateStringLocal(value);
    if (!baseDate || !Number.isFinite(deltaDays)) {
        return null;
    }
    const shifted = new Date(baseDate);
    shifted.setDate(shifted.getDate() + Number(deltaDays));

    if (maxDateValue) {
        const maxDate = parseDateStringLocal(maxDateValue);
        if (!maxDate) {
            return null;
        }
        if (shifted.getTime() > maxDate.getTime()) {
            return formatDateLocal(maxDate);
        }
    }
    return formatDateLocal(shifted);
}
