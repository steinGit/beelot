// dialogFocus.js

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])'
].join(",");

function isHiddenWithinDialog(element, dialog) {
  let current = element;
  while (current && current !== dialog) {
    if (
      current.hidden
      || current.getAttribute("aria-hidden") === "true"
      || current.style?.display === "none"
      || current.style?.visibility === "hidden"
    ) {
      return true;
    }
    current = current.parentElement;
  }
  return false;
}

function getFocusableElements(dialog) {
  return Array.from(dialog.querySelectorAll(FOCUSABLE_SELECTOR))
    .filter((element) => !isHiddenWithinDialog(element, dialog));
}

/**
 * Keeps keyboard focus inside an open dialog and restores it when closed.
 * @param {HTMLElement} dialog - Open dialog element.
 * @param {Object} options - Focus behavior.
 * @param {HTMLElement|null} options.initialFocus - Preferred initial focus.
 * @param {HTMLElement|null} options.returnFocus - Element to restore on close.
 * @param {Function|null} options.onEscape - Callback for the Escape key.
 * @returns {Function} Cleanup function accepting an optional restoreFocus flag.
 */
export function containDialogFocus(
  dialog,
  {
    initialFocus = null,
    returnFocus = document.activeElement,
    onEscape = null
  } = {}
) {
  if (!(dialog instanceof HTMLElement)) {
    return () => {};
  }

  const handleKeydown = (event) => {
    if (event.key === "Escape" && typeof onEscape === "function") {
      event.preventDefault();
      event.stopPropagation();
      onEscape();
      return;
    }
    if (event.key !== "Tab") {
      return;
    }

    const focusable = getFocusableElements(dialog);
    if (focusable.length === 0) {
      event.preventDefault();
      dialog.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  dialog.addEventListener("keydown", handleKeydown);
  const focusable = getFocusableElements(dialog);
  const focusTarget = initialFocus instanceof HTMLElement && !initialFocus.disabled
    ? initialFocus
    : focusable[0];
  if (focusTarget) {
    focusTarget.focus();
  } else {
    dialog.setAttribute("tabindex", "-1");
    dialog.focus();
  }

  let active = true;
  return ({ restoreFocus = true } = {}) => {
    if (!active) {
      return;
    }
    active = false;
    dialog.removeEventListener("keydown", handleKeydown);
    if (restoreFocus && returnFocus instanceof HTMLElement && returnFocus.isConnected) {
      returnFocus.focus();
    }
  };
}
