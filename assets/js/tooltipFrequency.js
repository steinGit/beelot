/**
 * @module tooltipFrequency
 * Creates a gate that allows showing a tooltip only every Nth time.
 */

/**
 * Creates a tooltip gate that shows every Nth attempt.
 * @param {Object} params - Gate configuration.
 * @param {string} params.key - Storage key for the counter.
 * @param {number} params.every - Show on every Nth attempt.
 * @param {Storage|null} [params.storage] - Storage implementation (localStorage).
 * @returns {{shouldShow: () => boolean}} - Gate helper.
 */
export function createTooltipGate({ key, every, storage }) {
  const threshold = Number.isFinite(every) && every > 0 ? Math.floor(every) : 10;
  let count = 0;

  if (storage && typeof storage.getItem === "function") {
    try {
      const stored = Number.parseInt(storage.getItem(key), 10);
      if (Number.isFinite(stored) && stored >= 0) {
        count = stored;
      }
    } catch (error) {
      // Ignore storage access issues; fallback to memory counter.
    }
  }

  const persist = () => {
    if (!storage || typeof storage.setItem !== "function") {
      return;
    }
    try {
      storage.setItem(key, String(count));
    } catch (error) {
      // Ignore storage access issues; fallback to memory counter.
    }
  };

  return {
    shouldShow() {
      count += 1;
      persist();
      return count % threshold === 0;
    }
  };
}
