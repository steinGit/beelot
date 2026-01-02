/**
 * @module settings
 * Funktionen für Settings
 */


// Funktion zum Ein-/Ausklappen der Abschnitte
document.querySelectorAll('.settings-heading').forEach((heading) => {
  heading.addEventListener('click', () => {
    const targetId = heading.dataset.target;
    const content = document.getElementById(targetId);
    const arrow = heading.querySelector('.arrow');

    if (content.style.display === 'none') {
      content.style.display = 'block';
      arrow.textContent = '▼';
    } else {
      content.style.display = 'none';
      arrow.textContent = '▶';
    }
  });
});

const TRACT_DATA_KEY = 'trachtData';

document.addEventListener("DOMContentLoaded", () => {
  loadTrachtData();
});

async function loadTrachtData() {
  // Check localStorage for existing data
  const stored = localStorage.getItem(TRACT_DATA_KEY);
  if (stored) {
    const data = JSON.parse(stored);
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
function populateTrachtTable(data) {
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
    checkbox.onclick = () => toggleActive(idx);
    tdCheck.appendChild(checkbox);
    tr.appendChild(tdCheck);

    // TS_start
    const tdStart = document.createElement("td");
    tdStart.className = "numeric-cell";
    const startInput = document.createElement("input");
    startInput.type = "text";
    startInput.value = row.TS_start;
    startInput.maxLength = 4;
    startInput.style.textAlign = "right";
    startInput.style.border = "none";
    startInput.style.backgroundColor = row.active ? "#ffffc0" : "#C0C0C0";
    startInput.onchange = () => updateStart(idx, startInput.value);
    tdStart.appendChild(startInput);
    tr.appendChild(tdStart);

    // TS_end
    const tdEnd = document.createElement("td");
    tdEnd.className = "numeric-cell";
    const endInput = document.createElement("input");
    endInput.type = "text";
    endInput.value = row.TS_end;
    endInput.maxLength = 4;
    endInput.style.textAlign = "right";
    endInput.style.border = "none";
    endInput.style.backgroundColor = row.active ? "#ffffc0" : "#C0C0C0";
    endInput.onchange = () => updateEnd(idx, endInput.value);
    tdEnd.appendChild(endInput);
    tr.appendChild(tdEnd);

    // plant string
    const tdPlant = document.createElement("td");
    tdPlant.className = "plant-cell";
    const plantInput = document.createElement("input");
    plantInput.type = "text";
    plantInput.value = row.plant;
    plantInput.style.width = "100%";
    plantInput.style.border = "none";
    plantInput.style.backgroundColor = "transparent";
    plantInput.onchange = () => updatePlant(idx, plantInput.value);
    tdPlant.appendChild(plantInput);
    tr.appendChild(tdPlant);

    // Trash icon
    const tdTrash = document.createElement("td");
    tdTrash.className = "trash-cell";
    const trashIcon = document.createElement("span");
    trashIcon.innerHTML = "🗑️";
    trashIcon.style.cursor = "pointer";
    trashIcon.onclick = () => deleteRow(idx);
    tdTrash.appendChild(trashIcon);
    tr.appendChild(tdTrash);

    // URL
    const tdUrl = document.createElement("td");
    const urlInput = document.createElement("input");
    urlInput.type = "text";
    urlInput.value = row.url || "";
    urlInput.style.width = "100%";
    urlInput.style.border = "none";
    urlInput.style.backgroundColor = "transparent";
    urlInput.onchange = () => updateUrl(idx, urlInput.value);
    tdUrl.appendChild(urlInput);
    tr.appendChild(tdUrl);

    tbody.appendChild(tr);
  });
}

function getTrachtData() {
  return JSON.parse(localStorage.getItem(TRACT_DATA_KEY));
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
    console.error("[settings.js] resetTrachtData failed:", error);
  }
}

/**
 * If you’re using <button onclick="addTrachtRow()"> in einstellungen.html,
 * we must expose them globally:
 */
window.addTrachtRow = addTrachtRow;
window.resetTrachtData = resetTrachtData;
