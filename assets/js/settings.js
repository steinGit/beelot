/**
 * @module settings
 * Funktionen für Settings
 */

import { clearAllLocationCaches } from "./locationStore.js";

// Funktion zum Ein-/Ausklappen der Abschnitte
document.querySelectorAll('.settings-heading').forEach((heading) => {
  heading.addEventListener('click', () => {
    const targetId = heading.dataset.target;
    const content = document.getElementById(targetId);
    const arrow = heading.querySelector('.arrow');
    const expanded = heading.getAttribute("aria-expanded") === "true";
    heading.setAttribute("aria-expanded", String(!expanded));
    content.hidden = expanded;
    arrow.textContent = expanded ? '▶' : '▼';
  });
});

const TRACT_DATA_KEY = 'trachtData';
const clearCacheButton = document.getElementById("clear-cache-button");
const clearLocalStorageButton = document.getElementById("clear-local-storage-button");
const addTrachtRowButton = document.getElementById("add-tracht-row-button");
const resetTrachtDataButton = document.getElementById("reset-tracht-data-button");

function clearCache() {
  console.log("[Clear Cache] Clearing cache...");
  clearAllLocationCaches();

  const legacyCacheKeys = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (key && (key.startsWith("historical_") || key.startsWith("recent_"))) {
      legacyCacheKeys.push(key);
    }
  }
  legacyCacheKeys.forEach((key) => {
    localStorage.removeItem(key);
    console.log(`[Clear Cache] Cleared legacy cache for key: ${key}`);
  });
  console.log("[Clear Cache] Cache clearing complete.");
}

if (clearCacheButton) {
  clearCacheButton.addEventListener("click", clearCache);
}

if (clearLocalStorageButton) {
  clearLocalStorageButton.addEventListener("click", () => {
    console.log("[Clear Local Storage] Clearing all local storage...");
    localStorage.clear();
    console.log("[Clear Local Storage] Local storage cleared.");
  });
}

document.addEventListener("DOMContentLoaded", () => {
  loadTrachtData();
});

async function loadTrachtData() {
  // Check localStorage for existing data
  const stored = localStorage.getItem(TRACT_DATA_KEY);
  if (stored) {
    let data = null;
    try {
      const parsed = JSON.parse(stored);
      data = Array.isArray(parsed) ? parsed : null;
    } catch (error) {
      console.warn("[settings.js] Invalid trachtData in localStorage. Resetting to defaults.", error);
      localStorage.removeItem(TRACT_DATA_KEY);
    }
    if (data === null) {
      try {
        const module = await import(`./tracht_data.js?ts=${Date.now()}`);
        data = module.defaultTrachtData;
      } catch (error) {
        console.error("[settings.js] loadTrachtData failed:", error);
      }
    }
    populateTrachtTable(data);
    saveTrachtData(data);
    return;
  }
  try {
    const module = await import(`./tracht_data.js?ts=${Date.now()}`);
    populateTrachtTable(module.defaultTrachtData);
    saveTrachtData(module.defaultTrachtData);
  } catch (error) {
    console.error("[settings.js] loadTrachtData failed:", error);
  }
}

/**
 * Build the entire table from data (the user can see & edit).
 */
export function populateTrachtTable(data) {
  const tbody = document.querySelector("#tracht-table tbody");
  tbody.innerHTML = "";

  data.forEach((row, idx) => {
    const tr = document.createElement("tr");
    tr.className = row.active ? "row-active" : "row-inactive";

    // Checkbox
    const tdCheck = document.createElement("td");
    tdCheck.className = "checkbox-cell";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = row.active;
    checkbox.setAttribute("aria-label", `Aktiv, Zeile ${idx + 1}: ${row.plant}`);
    checkbox.addEventListener("click", () => toggleActive(idx));
    tdCheck.appendChild(checkbox);
    tr.appendChild(tdCheck);

    // TS_start
    const tdStart = document.createElement("td");
    tdStart.className = "numeric-cell";
    const startInput = document.createElement("input");
    startInput.type = "text";
    startInput.value = row.TS_start;
    startInput.maxLength = 4;
    startInput.setAttribute("aria-label", `Temperatursumme Start, Zeile ${idx + 1}: ${row.plant}`);
    startInput.style.textAlign = "right";
    startInput.style.border = "none";
    startInput.style.backgroundColor = row.active ? "#ffffc0" : "#C0C0C0";
    startInput.addEventListener("change", () => updateStart(idx, startInput.value));
    tdStart.appendChild(startInput);
    tr.appendChild(tdStart);

    // TS_end
    const tdEnd = document.createElement("td");
    tdEnd.className = "numeric-cell";
    const endInput = document.createElement("input");
    endInput.type = "text";
    endInput.value = row.TS_end;
    endInput.maxLength = 4;
    endInput.setAttribute("aria-label", `Temperatursumme Ende, Zeile ${idx + 1}: ${row.plant}`);
    endInput.style.textAlign = "right";
    endInput.style.border = "none";
    endInput.style.backgroundColor = row.active ? "#ffffc0" : "#C0C0C0";
    endInput.addEventListener("change", () => updateEnd(idx, endInput.value));
    tdEnd.appendChild(endInput);
    tr.appendChild(tdEnd);

    // plant string
    const tdPlant = document.createElement("td");
    tdPlant.className = "plant-cell";
    const plantInput = document.createElement("input");
    plantInput.type = "text";
    plantInput.value = row.plant;
    plantInput.setAttribute("aria-label", `Pflanze, Zeile ${idx + 1}`);
    plantInput.style.width = "100%";
    plantInput.style.border = "none";
    plantInput.style.backgroundColor = "transparent";
    plantInput.addEventListener("change", () => updatePlant(idx, plantInput.value));
    tdPlant.appendChild(plantInput);
    tr.appendChild(tdPlant);

    // Delete action
    const tdTrash = document.createElement("td");
    tdTrash.className = "trash-cell";
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "delete-row-button";
    deleteButton.textContent = "Löschen";
    deleteButton.setAttribute("aria-label", `${row.plant} löschen, Zeile ${idx + 1}`);
    deleteButton.addEventListener("click", () => deleteRow(idx));
    tdTrash.appendChild(deleteButton);
    tr.appendChild(tdTrash);

    // URL
    const tdUrl = document.createElement("td");
    const urlInput = document.createElement("input");
    urlInput.type = "text";
    urlInput.value = row.url || "";
    urlInput.setAttribute("aria-label", `URL, Zeile ${idx + 1}: ${row.plant}`);
    urlInput.style.width = "100%";
    urlInput.style.border = "none";
    urlInput.style.backgroundColor = "transparent";
    urlInput.addEventListener("change", () => updateUrl(idx, urlInput.value));
    tdUrl.appendChild(urlInput);
    tr.appendChild(tdUrl);

    tbody.appendChild(tr);
  });
}

function getTrachtData() {
  const stored = localStorage.getItem(TRACT_DATA_KEY);
  if (!stored) {
    return [];
  }
  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn("[settings.js] Invalid trachtData in localStorage. Resetting.", error);
    localStorage.removeItem(TRACT_DATA_KEY);
    return [];
  }
}

function saveTrachtData(data) {
  localStorage.setItem(TRACT_DATA_KEY, JSON.stringify(data));
}

/**
 * Toggle row's active status
 */
function toggleActive(idx) {
  const data = getTrachtData();
  data[idx].active = !data[idx].active;
  saveTrachtData(data);
  populateTrachtTable(data);
}

/**
 * Update TS_start
 */
function updateStart(idx, value) {
  const data = getTrachtData();
  const newValue = Math.max(1, parseInt(value, 10) || 1);
  data[idx].TS_start = newValue;
  // If TS_end < newValue => force TS_end = newValue
  if (data[idx].TS_end < newValue) {
    data[idx].TS_end = newValue;
  }
  saveTrachtData(data);
  populateTrachtTable(data);
}

/**
 * Update TS_end
 */
function updateEnd(idx, value) {
  const data = getTrachtData();
  const newValue = Math.max(1, parseInt(value, 10) || 1);
  // If newValue < TS_start => force newValue = TS_start
  data[idx].TS_end = Math.max(newValue, data[idx].TS_start);
  saveTrachtData(data);
  populateTrachtTable(data);
}

/**
 * Update plant name
 */
function updatePlant(idx, value) {
  const data = getTrachtData();
  data[idx].plant = value;
  saveTrachtData(data);
}

/**
 * Update URL
 */
function updateUrl(idx, value) {
  const data = getTrachtData();
  data[idx].url = value;
  saveTrachtData(data);
}

/**
 * Delete row
 */
function deleteRow(idx) {
  const data = getTrachtData();
  data.splice(idx, 1);
  saveTrachtData(data);
  populateTrachtTable(data);
}

/**
 * Adds a new row with dummy values
 */
function addTrachtRow() {
  const data = getTrachtData();
  data.push({
    active: true,
    TS_start: 9000,
    TS_end: 9000,
    plant: "Neue Pflanze",
    url: ""
  });
  saveTrachtData(data);
  populateTrachtTable(data);
}

/**
 * Resets to defaultTrachtData
 */
async function resetTrachtData() {
  if (!confirm("Willst du wirklich alles zurücksetzen?")) return;
  try {
    // Reload defaults to avoid stale module cache after edits.
    const module = await import(`./tracht_data.js?ts=${Date.now()}`);
    saveTrachtData(module.defaultTrachtData);
    populateTrachtTable(module.defaultTrachtData);
  } catch (error) {
    console.error("[settings.js] resetTrachtData failed:", error);
  }
}

if (addTrachtRowButton) {
  addTrachtRowButton.addEventListener("click", addTrachtRow);
}

if (resetTrachtDataButton) {
  resetTrachtDataButton.addEventListener("click", () => {
    resetTrachtData();
  });
}
