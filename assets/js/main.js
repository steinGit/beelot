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
  gtsRangeInputs,
  gtsColorInputs,
  standortSyncToggle,
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
let gtsYearRange = 1;
let gtsRange20Active = false;
let gtsColorScheme = "queen";
let standortSyncEnabled = false;
let lastNarrowLayout = null;
const STANDORT_SYNC_KEY = "beelotStandortSync";
const STANDORT_SYNC_CONTROL_ID = "standort-sync-control";
const REGULAR_GTS_RANGES = new Set([1, 5, 10]);
const GTS_RANGE_20 = 20;

function loadStandortSyncState() {
  const stored = localStorage.getItem(STANDORT_SYNC_KEY);
  if (stored === null) {
    return false;
  }
  return stored === "true";
}

function persistStandortSyncState() {
  localStorage.setItem(STANDORT_SYNC_KEY, String(standortSyncEnabled));
}

function getSyncPayload() {
  return {
    selectedDate: datumInput.value,
    zeitraum: zeitraumSelect.value,
    gtsYearRange: gtsYearRange,
    gtsRange20Active: gtsRange20Active,
    gtsColorScheme: gtsColorScheme,
    gtsPlotVisible: gtsPlotContainer.classList.contains("visible"),
    tempPlotVisible: tempPlotContainer.classList.contains("visible")
  };
}

function applySyncToAllLocations(payload) {
  getLocationsInOrder().forEach((location) => {
    updateLocation(location.id, (current) => {
      current.ui.selectedDate = payload.selectedDate;
      current.ui.zeitraum = payload.zeitraum;
      current.ui.gtsYearRange = payload.gtsYearRange;
      current.ui.gtsRange20Active = payload.gtsRange20Active;
      current.ui.gtsColorScheme = payload.gtsColorScheme;
      current.ui.gtsPlotVisible = payload.gtsPlotVisible;
      current.ui.tempPlotVisible = payload.tempPlotVisible;
    });
  });
}

function normalizeRegularGtsRange(rangeValue) {
  return REGULAR_GTS_RANGES.has(rangeValue) ? rangeValue : 1;
}

function getEffectiveGtsYearRange() {
  if (gtsColorScheme === "temperature" && gtsRange20Active) {
    return GTS_RANGE_20;
  }
  return gtsYearRange;
}

function updateGtsRangeVisibility() {
  const range20Label = document.getElementById("gts-range-20-label");
  if (!range20Label) {
    return;
  }
  range20Label.style.display = gtsColorScheme === "temperature" ? "flex" : "none";
}

function updateGtsRangeSelection() {
  const effectiveRange = getEffectiveGtsYearRange();
  window.gtsYearRange = effectiveRange;
  gtsRangeInputs.forEach((input) => {
    const value = parseInt(input.value, 10);
    if (value === GTS_RANGE_20) {
      input.checked = gtsColorScheme === "temperature" && gtsRange20Active;
      return;
    }
    input.checked = value === gtsYearRange;
  });
}

function updateColorSchemeAvailability(rangeValue, isTwentyActive = false) {
  const lockToQueen = rangeValue === 1 && !isTwentyActive;
  gtsColorInputs.forEach((input) => {
    if (input.value === "queen") {
      input.disabled = false;
      return;
    }
    input.disabled = lockToQueen;
  });
  if (lockToQueen) {
    gtsColorScheme = "queen";
    window.gtsColorScheme = gtsColorScheme;
    gtsColorInputs.forEach((input) => {
      input.checked = input.value === "queen";
    });
    updateActiveLocationUiState({ gtsColorScheme });
  }
}
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

  if (standortSyncEnabled) {
    applySyncToAllLocations(getSyncPayload());
  }
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

  gtsYearRange = normalizeRegularGtsRange(parseInt(location.ui.gtsYearRange, 10));
  gtsRange20Active = Boolean(location.ui.gtsRange20Active);

  gtsColorScheme = location.ui.gtsColorScheme || "queen";
  window.gtsColorScheme = gtsColorScheme;
  if (gtsColorInputs.length > 0) {
    gtsColorInputs.forEach((input) => {
      input.checked = input.value === gtsColorScheme;
    });
  }
  updateGtsRangeVisibility();
  updateGtsRangeSelection();
  updateColorSchemeAvailability(
    getEffectiveGtsYearRange(),
    gtsColorScheme === "temperature" && gtsRange20Active
  );

  setPlotVisibility(location.ui.gtsPlotVisible, location.ui.tempPlotVisible);

  if (locationPanel) {
    locationPanel.setAttribute("aria-labelledby", `location-tab-${location.id}`);
  }

  updateLegendLocationLabel();
  updateMobileLabels();
}

function updateLegendLocationLabel() {
  const legendLabel = document.getElementById("legend-location-label");
  if (!legendLabel) {
    return;
  }
  const locations = getLocationsInOrder();
  if (locations.length <= 1) {
    legendLabel.textContent = "";
    legendLabel.style.display = "none";
    return;
  }
  const activeLocation = getActiveLocation();
  if (activeLocation) {
    legendLabel.textContent = `${activeLocation.name}:`;
  }
  legendLabel.style.display = "block";
  if (typeof window.attachTabTooltips === "function") {
    window.attachTabTooltips();
  }
}

function isNarrowLayout() {
  return typeof window !== "undefined"
    && typeof window.matchMedia === "function"
    && window.matchMedia("(max-width: 480px)").matches;
}

function ensureLabelTextSpan(label) {
  if (!label) {
    return null;
  }
  let span = label.querySelector(".label-text");
  if (!span) {
    const textNodes = Array.from(label.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE);
    const combinedText = textNodes.map((node) => node.textContent).join(" ").trim();
    textNodes.forEach((node) => label.removeChild(node));
    span = document.createElement("span");
    span.className = "label-text";
    if (combinedText) {
      span.dataset.fullText = combinedText;
    }
    label.appendChild(span);
  }
  return span;
}

function updateMobileLabels(force = false) {
  const narrow = isNarrowLayout();
  if (!force && lastNarrowLayout === narrow) {
    return;
  }
  lastNarrowLayout = narrow;

  const rangeLabels = document.querySelectorAll(".gts-range-group label");
  rangeLabels.forEach((label) => {
    const input = label.querySelector("input");
    if (!input) {
      return;
    }
    const span = ensureLabelTextSpan(label);
    if (!span) {
      return;
    }
    const fullText = span.dataset.fullText || span.textContent.trim();
    span.dataset.fullText = fullText;
    if (!narrow) {
      span.textContent = fullText;
      return;
    }
    const shortMap = {
      "1": "1J",
      "5": "5J",
      "10": "10J",
      "20": "20J"
    };
    span.textContent = shortMap[input.value] || fullText;
  });

  const colorLabelMap = {
    "gts-queen-label": "Königin",
    "gts-rainbow-label": "Regenb.",
    "gts-temp-label": "Temp"
  };
  Object.entries(colorLabelMap).forEach(([id, shortText]) => {
    const span = document.getElementById(id);
    if (!span) {
      return;
    }
    const fullText = span.dataset.fullText || span.textContent.trim();
    span.dataset.fullText = fullText;
    span.textContent = narrow ? shortText : fullText;
  });
}

function updateStandortSyncVisibility() {
  const control = document.getElementById(STANDORT_SYNC_CONTROL_ID);
  if (!control) {
    return;
  }
  const locations = getLocationsInOrder();
  control.style.display = locations.length > 1 ? "inline-block" : "none";
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
  addTab.dataset.tooltipText = "Füge ein en weiteren Standort hinzu.";
  addTab.setAttribute("aria-selected", "false");
  addTab.setAttribute("tabindex", "-1");
  addTab.setAttribute("aria-controls", "location-panel");
  addTab.textContent = "+";
  addTab.addEventListener("click", () => {
    createLocationEntry();
    window.location.reload();
  });
  locationTabsContainer.appendChild(addTab);

  if (locations.length > 1) {
    const removeTab = document.createElement("button");
    removeTab.type = "button";
    removeTab.className = "location-tab location-tab-remove";
    removeTab.role = "tab";
    removeTab.id = "location-tab-remove";
    removeTab.dataset.tooltipText = "Entferne den aktuellen Standort.";
    removeTab.setAttribute("aria-selected", "false");
    removeTab.setAttribute("tabindex", "-1");
    removeTab.setAttribute("aria-controls", "location-panel");
    removeTab.textContent = "-";
    removeTab.addEventListener("click", () => {
      const activeId = getActiveLocationId();
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

  const legendLabel = document.getElementById("legend-location-label");
  if (legendLabel) {
    updateLegendLocationLabel();
  }

  updateStandortSyncVisibility();
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
      gtsYearRange: gtsYearRange,
      gtsColorScheme: gtsColorScheme,
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
  updateMobileLabels();
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
    gtsRangeInputs.length === 0 ||
    gtsColorInputs.length === 0 ||
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

  updateStandortSyncVisibility();

  standortSyncEnabled = loadStandortSyncState();
  window.standortSyncEnabled = standortSyncEnabled;
  if (standortSyncToggle) {
    standortSyncToggle.checked = standortSyncEnabled;
  }

  if (standortSyncEnabled) {
    applySyncToAllLocations(getSyncPayload());
  }

  // Now set up event listeners
  setupEventListeners();
  updateMobileLabels(true);
});

/**
 * Attach event listeners (only if DOM elements exist).
 */
function setupEventListeners() {
  let resizeTimer = null;
  window.addEventListener("resize", () => {
    if (resizeTimer) {
      clearTimeout(resizeTimer);
    }
    resizeTimer = window.setTimeout(() => {
      updateMobileLabels();
      const gtsCanvas = document.getElementById("plot-canvas");
      const tempCanvas = document.getElementById("temp-plot");
      const gtsChart = gtsCanvas ? Chart.getChart(gtsCanvas) : null;
      const tempChart = tempCanvas ? Chart.getChart(tempCanvas) : null;
      if (gtsChart) {
        requestAnimationFrame(() => {
          gtsChart.resize();
          gtsChart.update("none");
        });
      }
      if (tempChart) {
        requestAnimationFrame(() => {
          tempChart.resize();
          tempChart.update("none");
        });
      }
    }, 120);
  });

  if (standortSyncToggle) {
    standortSyncToggle.addEventListener("change", () => {
      standortSyncEnabled = standortSyncToggle.checked;
      window.standortSyncEnabled = standortSyncEnabled;
      persistStandortSyncState();
      if (standortSyncEnabled) {
        applySyncToAllLocations(getSyncPayload());
      }
    });
  }

  const tooltipPairs = [
    { labelId: "gts-queen-label", tooltipId: "gts-queen-tooltip" },
    { labelId: "gts-rainbow-label", tooltipId: "gts-rainbow-tooltip" },
    { labelId: "gts-temp-label", tooltipId: "gts-temp-tooltip" },
    { labelId: "standort-sync-label", tooltipId: "standort-sync-tooltip" },
    { labelId: "datum-label", tooltipId: "datum-tooltip" }
  ];

  tooltipPairs.forEach(({ labelId, tooltipId }) => {
    const label = document.getElementById(labelId);
    const tooltip = document.getElementById(tooltipId);
    let tooltipTimer = null;

    const showTooltip = () => {
      if (!label || !tooltip) {
        return;
      }
      const rect = label.getBoundingClientRect();
      tooltip.style.top = `${window.scrollY + rect.top - tooltip.offsetHeight - 8}px`;
      tooltip.style.left = `${window.scrollX + rect.left}px`;
      tooltip.classList.add("is-visible");
      tooltip.setAttribute("aria-hidden", "false");
    };

    const scheduleTooltip = () => {
      if (tooltipTimer) {
        clearTimeout(tooltipTimer);
      }
      tooltipTimer = window.setTimeout(showTooltip, 300);
    };

    const hideTooltip = () => {
      if (tooltipTimer) {
        clearTimeout(tooltipTimer);
        tooltipTimer = null;
      }
      if (!tooltip) {
        return;
      }
      tooltip.classList.remove("is-visible");
      tooltip.setAttribute("aria-hidden", "true");
    };

    if (label && tooltip) {
      label.addEventListener("mouseenter", scheduleTooltip);
      label.addEventListener("mouseleave", hideTooltip);
      label.addEventListener("focus", scheduleTooltip);
      label.addEventListener("blur", hideTooltip);
    }
  });

  const tabTooltipText = "Mit den Pfeiltasten ← und → kannst du zwischen den Standorten wechseln – ideal zum Vergleichen. Per Doppelklick kannst Du den Namen ändern.";
  let tabTooltip = document.getElementById("location-tab-tooltip");
  if (!tabTooltip) {
    tabTooltip = document.createElement("div");
    tabTooltip.id = "location-tab-tooltip";
    tabTooltip.className = "tooltip";
    tabTooltip.setAttribute("role", "tooltip");
    tabTooltip.setAttribute("aria-hidden", "true");
    tabTooltip.textContent = tabTooltipText;
    document.body.appendChild(tabTooltip);
  }
  let tabTooltipTimer = null;

  const showTabTooltip = (target) => {
    if (!target) {
      return;
    }
    const customText = target.dataset.tooltipText;
    tabTooltip.textContent = customText || tabTooltipText;
    const rect = target.getBoundingClientRect();
    tabTooltip.style.top = `${window.scrollY + rect.top - tabTooltip.offsetHeight - 8}px`;
    tabTooltip.style.left = `${window.scrollX + rect.left}px`;
    tabTooltip.classList.add("is-visible");
    tabTooltip.setAttribute("aria-hidden", "false");
  };

  const scheduleTabTooltip = (event) => {
    if (tabTooltipTimer) {
      clearTimeout(tabTooltipTimer);
    }
    const target = event.currentTarget;
    tabTooltipTimer = window.setTimeout(() => showTabTooltip(target), 300);
  };

  const hideTabTooltip = () => {
    if (tabTooltipTimer) {
      clearTimeout(tabTooltipTimer);
      tabTooltipTimer = null;
    }
    tabTooltip.classList.remove("is-visible");
    tabTooltip.setAttribute("aria-hidden", "true");
  };

  const bindTabTooltip = (element) => {
    if (!element) {
      return;
    }
    element.setAttribute("aria-describedby", tabTooltip.id);
    element.addEventListener("mouseenter", scheduleTabTooltip);
    element.addEventListener("mouseleave", hideTabTooltip);
    element.addEventListener("focus", scheduleTabTooltip);
    element.addEventListener("blur", hideTabTooltip);
  };

  const attachTabTooltips = () => {
    const tabElements = document.querySelectorAll(".location-tab");
    tabElements.forEach((tab) => {
      if (tab.dataset.tooltipBound === "true") {
        return;
      }
      tab.dataset.tooltipBound = "true";
      bindTabTooltip(tab);
    });
    const legendLabel = document.getElementById("legend-location-label");
    if (legendLabel && legendLabel.style.display !== "none") {
      if (legendLabel.dataset.tooltipBound !== "true") {
        legendLabel.dataset.tooltipBound = "true";
        bindTabTooltip(legendLabel);
      }
    }
  };

  const tabsRoot = document.getElementById("location-tabs");
  if (tabsRoot) {
    const observer = new MutationObserver(() => {
      attachTabTooltips();
    });
    observer.observe(tabsRoot, { childList: true });
  }
  window.attachTabTooltips = attachTabTooltips;
  attachTabTooltips();

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

  gtsRangeInputs.forEach((input) => {
    input.addEventListener('change', () => {
      if (!input.checked) {
        return;
      }
      const selectedValue = parseInt(input.value, 10);
      if (selectedValue === GTS_RANGE_20) {
        if (gtsColorScheme !== "temperature") {
          gtsRange20Active = false;
          updateGtsRangeSelection();
          return;
        }
        gtsRange20Active = true;
        updateActiveLocationUiState({ gtsRange20Active });
      } else {
        gtsYearRange = normalizeRegularGtsRange(selectedValue);
        gtsRange20Active = false;
        updateActiveLocationUiState({ gtsYearRange, gtsRange20Active });
      }
      updateGtsRangeVisibility();
      updateGtsRangeSelection();
      updateColorSchemeAvailability(
        getEffectiveGtsYearRange(),
        gtsColorScheme === "temperature" && gtsRange20Active
      );
      if (plotUpdater) {
        plotUpdater.run();
      }
    });
  });

  gtsColorInputs.forEach((input) => {
    input.addEventListener('change', () => {
      if (!input.checked) {
        return;
      }
      if (getEffectiveGtsYearRange() === 1) {
        return;
      }
      gtsColorScheme = input.value;
      window.gtsColorScheme = gtsColorScheme;
      updateActiveLocationUiState({ gtsColorScheme });
      updateGtsRangeVisibility();
      updateGtsRangeSelection();
      updateColorSchemeAvailability(
        getEffectiveGtsYearRange(),
        gtsColorScheme === "temperature" && gtsRange20Active
      );
      if (plotUpdater) {
        plotUpdater.run();
      }
    });
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
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      const activeElement = document.activeElement;
      const isEditable = activeElement && (
        (activeElement.tagName === "INPUT" &&
          (activeElement.type === "text" || activeElement.type === "number" || activeElement.type === "date")) ||
        activeElement.tagName === "TEXTAREA" ||
        activeElement.isContentEditable
      );
      if (isEditable) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const locations = getLocationsInOrder();
      if (locations.length <= 1) {
        return;
      }
      const activeId = getActiveLocationId();
      const currentIndex = locations.findIndex((location) => location.id === activeId);
      if (currentIndex === -1) {
        return;
      }
      const offset = event.key === "ArrowLeft" ? -1 : 1;
      const nextIndex = (currentIndex + offset + locations.length) % locations.length;
      switchLocation(locations[nextIndex].id);
      return;
    }
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
