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
