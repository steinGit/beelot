/**
 * @module locationSwitching
 * Helpers for deciding whether a tab switch should occur.
 */

/**
 * Determines if a switch should occur.
 * @param {Object} params - Parameters.
 * @param {string|null} params.currentId - Current location id.
 * @param {string|null} params.targetId - Target location id.
 * @param {boolean} params.comparisonActive - Whether comparison tab is active.
 * @returns {boolean} - True if switching should proceed.
 */
export function shouldSwitchLocation({ currentId, targetId, comparisonActive }) {
  if (!targetId) {
    return false;
  }
  if (currentId !== targetId) {
    return true;
  }
  return comparisonActive;
}
