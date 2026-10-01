// keyboardShortcuts.js

/**
 * Reports whether a global shortcut should leave the focused control alone.
 * @param {EventTarget|null} target - Event target or active element.
 * @returns {boolean} - True for editable and native form controls.
 */
export function blocksGlobalShortcut(target) {
  if (!(target instanceof Element)) {
    return false;
  }
  return Boolean(
    target.matches("input, textarea, select")
    || target.isContentEditable
    || target.closest('[contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]')
  );
}
