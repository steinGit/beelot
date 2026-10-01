// pageFragments.js

import { fetchWithTimeout } from "./utils.js";

async function loadFragment(url, targetId, failureText) {
  const target = document.getElementById(targetId);
  if (!target) {
    console.error(`[pageFragments] Missing fragment target #${targetId}.`);
    return false;
  }

  try {
    const response = await fetchWithTimeout(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
    }
    target.innerHTML = await response.text();
    return true;
  } catch (error) {
    console.error(`[pageFragments] Failed to load ${url}.`, error);
    target.textContent = failureText;
    return false;
  }
}

export async function loadPageHeader(version = null) {
  const loaded = await loadFragment(
    "components/header.html",
    "header-placeholder",
    "Der Kopfbereich konnte nicht geladen werden."
  );
  if (!loaded || version === null) {
    return loaded;
  }
  const versionElement = document.getElementById("version-placeholder");
  if (versionElement) {
    versionElement.textContent = `Version ${version}`;
  }
  return true;
}

export function loadPageFooter() {
  return loadFragment(
    "components/footer.html",
    "footer-placeholder",
    "Der Fußbereich konnte nicht geladen werden."
  );
}
