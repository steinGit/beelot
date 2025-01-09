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
