/**
 * @module main
 * Handles event listeners and initial setup
 */

import {
  ortInput,
  datumInput,
  zeitraumSelect,
  berechnenBtn,
  ortKarteBtn,
  mapCloseBtn,
  mapSaveBtn,
  datumPlusBtn,
  datumMinusBtn,
  datumHeuteBtn,
  toggleGtsPlotBtn,
  gtsPlotContainer,
  toggleTempPlotBtn,
  tempPlotContainer,
  toggle5yrPlotBtn,
  locationNameOutput,
  locationTabsContainer,
  locationPanel
} from './ui.js';

import { PlotUpdater } from './plotUpdater.js';
import {
  createLocationEntry,
  deleteLocationEntry,
  formatCoordinates,
  getActiveLocation,
  getActiveLocationId,
  getLocationById,
  getLocationsInOrder,
  renameLocation,
  setActiveLocation,
  updateLocation
} from './locationStore.js';

/**
 * Helper: get local "today" in YYYY-MM-DD format
 */
function getLocalTodayString() {
  const now = new Date();
  // Use local offset to ensure correct date even if user is in e.g. UTC+something
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().split('T')[0];
}

/**
 * Dynamically updates the #zeitraum select options so that we never select
 * beyond the year change. Preserves the user's previous selection if it's still available.
 */
function updateZeitraumSelect() {
  if (!datumInput) return; // if there's no date input, skip

  const datumVal = datumInput.value;
  if (!datumVal) return; // if there's no date yet, do nothing

  const [yyyy, mm, dd] = datumVal.split('-').map(x => parseInt(x, 10));
  const selectedDate = new Date(yyyy, mm - 1, dd, 0, 0, 0, 0);
  const startOfYear = new Date(yyyy, 0, 1);
  const diffMs = selectedDate.getTime() - startOfYear.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 3600 * 24));

  // Store current selection before clearing
  const previousSelection = zeitraumSelect.value;

  // Clear out existing options
  while (zeitraumSelect.firstChild) {
    zeitraumSelect.removeChild(zeitraumSelect.firstChild);
  }

  // We'll always allow "Seit Jahresanfang"
  const optYTD = new Option("Seit Jahresanfang", "ytd", false, false);
  zeitraumSelect.add(optYTD);

  // If we are >= 7 days into the year
  if (diffDays >= 7) {
    const opt7 = new Option("1 Woche", "7", false, false);
    zeitraumSelect.add(opt7);
  }
  // If we are >= 14 days into the year
  if (diffDays >= 14) {
    const opt14 = new Option("2 Wochen", "14", false, false);
    zeitraumSelect.add(opt14);
  }
  // If we are >= 28 days into the year
  if (diffDays >= 28) {
    const opt28 = new Option("4 Wochen", "28", false, false);
    zeitraumSelect.add(opt28);
  }

  // Determine if previous selection is still available
  const optionsValues = Array.from(zeitraumSelect.options).map(opt => opt.value);
  if (optionsValues.includes(previousSelection)) {
    zeitraumSelect.value = previousSelection;
  } else {
    zeitraumSelect.value = "ytd";
  }
}

// We'll hold a reference to our PlotUpdater instance here
let plotUpdater = null;
// Also track the multi-year toggle
let showFiveYear = false;
let confirmModalResolver = null;

function confirmModal({ title, message, confirmText = "Löschen", cancelText = "Abbrechen" }) {
  const modal = document.getElementById("confirm-modal");
  const titleEl = document.getElementById("confirm-modal-title");
  const messageEl = document.getElementById("confirm-modal-message");
  const acceptBtn = document.getElementById("confirm-modal-accept");
  const cancelBtn = document.getElementById("confirm-modal-cancel");

  if (!modal || !titleEl || !messageEl || !acceptBtn || !cancelBtn) {
    return Promise.resolve(false);
  }

  titleEl.textContent = title;
  messageEl.textContent = message;
  acceptBtn.textContent = confirmText;
  cancelBtn.textContent = cancelText;

  modal.classList.add("is-visible");
  modal.setAttribute("aria-hidden", "false");

  return new Promise((resolve) => {
    confirmModalResolver = resolve;
    acceptBtn.focus();
  });
}

function closeConfirmModal(result) {
  const modal = document.getElementById("confirm-modal");
  if (!modal) {
    return;
  }
  modal.classList.remove("is-visible");
  modal.setAttribute("aria-hidden", "true");
  if (confirmModalResolver) {
    confirmModalResolver(result);
    confirmModalResolver = null;
  }
}

/**
 * Show/hide the "Koordinaten:" line if a location is (not) chosen.
 */
function toggleCoordinatesLine() {
  const coordinatesLineEl = document.getElementById("coordinates-line");
  if (!coordinatesLineEl) return; // If index.html wasn't updated, just skip

  const activeLocation = getActiveLocation();
  if (!activeLocation || !activeLocation.coordinates) {
    coordinatesLineEl.style.display = "none";
  } else {
    coordinatesLineEl.style.display = "block";
  }
}

function updateActiveLocationUiState(partial) {
  const activeId = getActiveLocationId();
  if (!activeId) {
    return;
  }
  updateLocation(activeId, (location) => {
    location.ui = {
      ...location.ui,
      ...partial,
      map: {
        ...location.ui.map,
        ...(partial.map || {})
      }
    };
  });
}

function setPlotVisibility(showGts, showTemp) {
  gtsPlotContainer.classList.toggle("visible", showGts);
  toggleGtsPlotBtn.textContent = showGts
    ? "Diagramm (GTS) ausblenden"
    : "Diagramm (GTS) anzeigen";

  tempPlotContainer.classList.toggle("visible", showTemp);
  toggleTempPlotBtn.textContent = showTemp
    ? "Diagramm (Tagesmitteltemperaturen) ausblenden"
    : "Diagramm (Tagesmitteltemperaturen) anzeigen";
}

function applyLocationState(location) {
  const todayStr = getLocalTodayString();
  const selectedDate = location.ui.selectedDate || todayStr;
  datumInput.value = selectedDate;
  datumInput.max = todayStr;
  if (location.ui.zeitraum) {
    zeitraumSelect.value = location.ui.zeitraum;
  }
  updateZeitraumSelect();
  if (location.ui.zeitraum) {
    zeitraumSelect.value = location.ui.zeitraum;
  }

  if (!location.ui.selectedDate) {
    updateActiveLocationUiState({
      selectedDate: datumInput.value,
      zeitraum: zeitraumSelect.value
    });
  }

  if (location.coordinates) {
    ortInput.value = formatCoordinates(location.coordinates.lat, location.coordinates.lon);
  } else {
    ortInput.value = "";
  }

  toggleCoordinatesLine();

  if (location.calculations.locationLabel) {
    locationNameOutput.textContent = `In der Nähe von: ${location.calculations.locationLabel}`;
  } else {
    locationNameOutput.textContent = "Standortname wird angezeigt...";
  }

  showFiveYear = Boolean(location.ui.showFiveYear);
  window.showFiveYear = showFiveYear;
  toggle5yrPlotBtn.textContent = showFiveYear ? "das ausgewählte Jahr" : "die letzten 5 Jahre";

  setPlotVisibility(location.ui.gtsPlotVisible, location.ui.tempPlotVisible);

  if (locationPanel) {
    locationPanel.setAttribute("aria-labelledby", `location-tab-${location.id}`);
  }
}

function startEditingLocationName(locationId, nameElement) {
  const location = getLocationById(locationId);
  if (!location || !nameElement) {
    return;
  }

  const input = document.createElement("input");
  input.type = "text";
  input.className = "location-name-input";
  input.value = location.name;
  nameElement.replaceWith(input);
  input.focus();
  input.select();

  const commit = () => {
    renameLocation(locationId, input.value);
    renderLocationTabs();
  };

  input.addEventListener("blur", commit);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      commit();
    }
    if (event.key === "Escape") {
      renderLocationTabs();
    }
  });
}

function renderLocationTabs() {
  if (!locationTabsContainer) {
    return;
  }
  locationTabsContainer.innerHTML = "";

  const locations = getLocationsInOrder();
  const activeId = getActiveLocationId();

  locations.forEach((location) => {
    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = `location-tab${location.id === activeId ? " active" : ""}`;
    tab.dataset.locationId = location.id;
    tab.role = "tab";
    tab.id = `location-tab-${location.id}`;
    tab.setAttribute("aria-selected", location.id === activeId ? "true" : "false");
    tab.setAttribute("tabindex", location.id === activeId ? "0" : "-1");
    tab.setAttribute("aria-controls", "location-panel");

    const nameSpan = document.createElement("span");
    nameSpan.className = "location-name";
    nameSpan.textContent = location.name;
    nameSpan.addEventListener("dblclick", (event) => {
      event.preventDefault();
      event.stopPropagation();
      startEditingLocationName(location.id, nameSpan);
    });

    tab.appendChild(nameSpan);
    tab.addEventListener("click", () => {
      switchLocation(location.id);
    });

    locationTabsContainer.appendChild(tab);
  });

  const addTab = document.createElement("button");
  addTab.type = "button";
  addTab.className = "location-tab location-tab-add";
  addTab.role = "tab";
  addTab.id = "location-tab-add";
  addTab.setAttribute("aria-selected", "false");
  addTab.setAttribute("tabindex", "-1");
  addTab.setAttribute("aria-controls", "location-panel");
  addTab.textContent = "+";
  addTab.addEventListener("click", () => {
    createLocationEntry();
    window.location.reload();
  });
  locationTabsContainer.appendChild(addTab);

  const removeTab = document.createElement("button");
  removeTab.type = "button";
  removeTab.className = "location-tab location-tab-remove";
  removeTab.role = "tab";
  removeTab.id = "location-tab-remove";
  removeTab.setAttribute("aria-selected", "false");
  removeTab.setAttribute("tabindex", "-1");
  removeTab.setAttribute("aria-controls", "location-panel");
  removeTab.textContent = "-";
  removeTab.addEventListener("click", () => {
    const activeId = getActiveLocationId();
    const locationsList = getLocationsInOrder();
    if (locationsList.length <= 1) {
      return;
    }
    if (locationsList[0].id === activeId) {
      return;
    }
    confirmModal({
      title: "Eintrag wirklich löschen?",
      message: "Dies entfernt den Eintrag und alle zugehörigen Daten.",
      confirmText: "Löschen",
      cancelText: "Abbrechen"
    }).then((confirmed) => {
      if (!confirmed) {
        return;
      }
      const deleted = deleteLocationEntry(activeId);
      if (deleted) {
        window.location.reload();
      }
    });
  });
  locationTabsContainer.appendChild(removeTab);
}

function switchLocation(locationId) {
  if (locationId === getActiveLocationId()) {
    return;
  }
  const currentLocation = getActiveLocation();
  if (currentLocation) {
    updateActiveLocationUiState({
      selectedDate: datumInput.value,
      zeitraum: zeitraumSelect.value,
      showFiveYear: showFiveYear,
      gtsPlotVisible: gtsPlotContainer.classList.contains("visible"),
      tempPlotVisible: tempPlotContainer.classList.contains("visible")
    });
  }

  setActiveLocation(locationId);
  const nextLocation = getActiveLocation();
  if (!nextLocation) {
    return;
  }

  applyLocationState(nextLocation);
  renderLocationTabs();

  if (locationPanel) {
    locationPanel.setAttribute("aria-labelledby", `location-tab-${locationId}`);
  }

  if (plotUpdater) {
    plotUpdater.setLocationId(locationId);
    plotUpdater.run();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // First, check if we're on a page that actually has these elements
  // (i.e. the index/home page). If not, skip the rest to avoid errors.
  if (
    !datumInput ||
    !ortInput ||
    !zeitraumSelect ||
    !berechnenBtn ||
    !ortKarteBtn ||
    !mapCloseBtn ||
    !mapSaveBtn ||
    !datumPlusBtn ||
    !datumMinusBtn ||
    !datumHeuteBtn ||
    !toggleGtsPlotBtn ||
    !gtsPlotContainer ||
    !toggleTempPlotBtn ||
    !tempPlotContainer ||
    !toggle5yrPlotBtn ||
    !locationNameOutput ||
    !locationTabsContainer ||
    !locationPanel
  ) {
    console.log("[main.js] Not all index elements exist => skipping main logic on this page.");
    return;
  }

  // 1) Build a new PlotUpdater
  const activeLocationId = getActiveLocationId();
  plotUpdater = new PlotUpdater({
    locationId: activeLocationId,
    ortInput,
    datumInput,
    zeitraumSelect,
    ergebnisTextEl: document.getElementById('ergebnis-text'),
    hinweisSection: document.querySelector('.hinweis-section'),
    gtsPlotContainer,
    tempPlotContainer,
    chartRefs: { chartGTS: null, chartTemp: null },
    locationNameOutput
  });

  const activeLocation = getActiveLocation();
  if (activeLocation) {
    applyLocationState(activeLocation);
  }

  // IMPORTANT: Regardless of whether we have a last location or not, run the logic once
  // so that the Imkerliche Information is immediately computed.
  plotUpdater.run();

  // 3) The version placeholder logic is done in index.html now.

  renderLocationTabs();

  // Now set up event listeners
  setupEventListeners();
});

/**
 * Attach event listeners (only if DOM elements exist).
 */
function setupEventListeners() {
  const modalAccept = document.getElementById("confirm-modal-accept");
  const modalCancel = document.getElementById("confirm-modal-cancel");
  const modalOverlay = document.getElementById("confirm-modal");
  if (modalAccept && modalCancel && modalOverlay) {
    modalAccept.addEventListener("click", () => closeConfirmModal(true));
    modalCancel.addEventListener("click", () => closeConfirmModal(false));
    modalOverlay.addEventListener("click", (event) => {
      if (event.target === modalOverlay) {
        closeConfirmModal(false);
      }
    });
  }

  toggle5yrPlotBtn.addEventListener('click', () => {
    showFiveYear = !showFiveYear;
    // Expose the variable for other modules if needed
    window.showFiveYear = showFiveYear;

    updateActiveLocationUiState({ showFiveYear });

    if (showFiveYear) {
      toggle5yrPlotBtn.textContent = 'das ausgewählte Jahr';
    } else {
      toggle5yrPlotBtn.textContent = 'die letzten 5 Jahre';
    }

    if (plotUpdater) {
      plotUpdater.run();
    }
  });

  // Whenever the user manually changes the ortInput, show/hide coords line & re-run
  ortInput.addEventListener('change', () => {
    toggleCoordinatesLine();
    updateActiveLocationUiState({
      selectedDate: datumInput.value,
      zeitraum: zeitraumSelect.value
    });
    plotUpdater.run();
  });

  zeitraumSelect.addEventListener('change', () => {
    updateActiveLocationUiState({ zeitraum: zeitraumSelect.value });
    plotUpdater.run();
  });

  datumInput.addEventListener('change', () => {
    updateZeitraumSelect();
    updateActiveLocationUiState({
      selectedDate: datumInput.value,
      zeitraum: zeitraumSelect.value
    });
    plotUpdater.run();
  });

  berechnenBtn.addEventListener('click', () => {
    plotUpdater.run();
  });

  datumPlusBtn.addEventListener('click', () => {
    const current = new Date(datumInput.value);
    const now = new Date();
    current.setDate(current.getDate() + 1);
    if (current > now) {
      current.setDate(now.getDate());
    }
    datumInput.value = current.toISOString().split('T')[0];
    updateZeitraumSelect();
    updateActiveLocationUiState({
      selectedDate: datumInput.value,
      zeitraum: zeitraumSelect.value
    });
    plotUpdater.run();
  });

  datumMinusBtn.addEventListener('click', () => {
    const current = new Date(datumInput.value);
    current.setDate(current.getDate() - 1);
    datumInput.value = current.toISOString().split('T')[0];
    updateZeitraumSelect();
    updateActiveLocationUiState({
      selectedDate: datumInput.value,
      zeitraum: zeitraumSelect.value
    });
    plotUpdater.run();
  });

  // Allow + and - keys for date increment/decrement
  document.addEventListener('keydown', (event) => {
    if (event.key === "+" || event.code === "NumpadAdd") {
      datumPlusBtn.click();
    } else if (event.key === "-" || event.code === "NumpadSubtract") {
      datumMinusBtn.click();
    }
  });

  datumHeuteBtn.addEventListener('click', () => {
    const newToday = getLocalTodayString();
    datumInput.value = newToday;
    updateZeitraumSelect();
    updateActiveLocationUiState({
      selectedDate: datumInput.value,
      zeitraum: zeitraumSelect.value
    });
    plotUpdater.run();
  });

  toggleGtsPlotBtn.addEventListener("click", () => {
    gtsPlotContainer.classList.toggle("visible");
    toggleGtsPlotBtn.textContent = gtsPlotContainer.classList.contains("visible")
      ? "Diagramm (GTS) ausblenden"
      : "Diagramm (GTS) anzeigen";
    updateActiveLocationUiState({
      gtsPlotVisible: gtsPlotContainer.classList.contains("visible")
    });
  });

  toggleTempPlotBtn.addEventListener("click", () => {
    tempPlotContainer.classList.toggle("visible");
    toggleTempPlotBtn.textContent = tempPlotContainer.classList.contains("visible")
      ? "Diagramm (Tagesmitteltemperaturen) ausblenden"
      : "Diagramm (Tagesmitteltemperaturen) anzeigen";
    updateActiveLocationUiState({
      tempPlotVisible: tempPlotContainer.classList.contains("visible")
    });
  });

  ortKarteBtn.addEventListener('click', () => {
    const mapPopup = document.getElementById('map-popup');
    mapPopup.style.display = 'block';
    window.initOrUpdateMap();
  });

  mapCloseBtn.addEventListener('click', () => {
    const mapPopup = document.getElementById('map-popup');
    mapPopup.style.display = 'none';
  });

  mapSaveBtn.addEventListener('click', () => {
    // Saves lat/lon to ortInput
    window.saveMapSelection();

    // Force the same logic as if the user had typed in ortInput
    ortInput.dispatchEvent(new Event("change"));

    // Programmatically click the hidden "berechnenBtn"
    berechnenBtn.click();
  });

}
