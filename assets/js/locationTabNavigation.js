/**
 * @module locationTabNavigation
 * Determines which tab to activate when navigating with arrow keys.
 */

/**
 * Computes the next tab target for keyboard navigation.
 * @param {Object} params - Navigation parameters.
 * @param {Array<Object>} params.locations - Ordered locations with ids.
 * @param {string|null} params.activeLocationId - Current active location id.
 * @param {boolean} params.comparisonActive - Whether compare tab is active.
 * @param {number} params.offset - +1 for next, -1 for previous.
 * @returns {{type: 'location'|'compare', id?: string}|null} - Next target or null.
 */
export function getNextTabTarget({
  locations,
  activeLocationId,
  comparisonActive,
  offset
}) {
  if (!Array.isArray(locations) || locations.length === 0) {
    return null;
  }

  const tabOrder = locations.map((location) => ({
    type: "location",
    id: location.id
  }));

  if (locations.length > 1) {
    tabOrder.push({ type: "compare" });
  }

  let currentIndex = -1;
  if (comparisonActive && locations.length > 1) {
    currentIndex = tabOrder.length - 1;
  } else if (activeLocationId) {
    currentIndex = tabOrder.findIndex(
      (entry) => entry.type === "location" && entry.id === activeLocationId
    );
  }

  if (currentIndex === -1) {
    return null;
  }

  const nextIndex = (currentIndex + offset + tabOrder.length) % tabOrder.length;
  return tabOrder[nextIndex];
}

/**
 * Creates a location action that remains reachable through normal Tab navigation.
 * @param {Object} options - Button attributes.
 * @param {string} options.id - Element id.
 * @param {string} options.className - CSS classes.
 * @param {string} options.label - Accessible name.
 * @param {string} options.tooltipText - Tooltip text.
 * @param {string} options.text - Visible button text.
 * @returns {HTMLButtonElement} - Configured action button.
 */
export function createLocationActionButton({
  id,
  className,
  label,
  tooltipText,
  text
}) {
  const button = document.createElement("button");
  button.type = "button";
  button.id = id;
  button.className = className;
  button.dataset.tooltipText = tooltipText;
  button.setAttribute("aria-label", label);
  button.textContent = text;
  return button;
}
