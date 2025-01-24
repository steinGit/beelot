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
  locationNameOutput
} from './ui.js';

import { PlotUpdater } from './plotUpdater.js';

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

/**
 * Show/hide the "Koordinaten:" line if a location is (not) chosen.
 */
function toggleCoordinatesLine() {
  const coordinatesLineEl = document.getElementById("coordinates-line");
  if (!coordinatesLineEl) return; // If index.html wasn't updated, just skip

  const val = ortInput.value || "";
  // Hide if there's no valid lat/lon
  if (!val.includes("Lat") || !val.includes("Lon")) {
    coordinatesLineEl.style.display = "none";
  } else {
    coordinatesLineEl.style.display = "block";
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
    !locationNameOutput
  ) {
    console.log("[main.js] Not all index elements exist => skipping main logic on this page.");
    return;
  }

  // 1) Build a new PlotUpdater
  plotUpdater = new PlotUpdater({
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

  // 2) Set date to local "today" & load last known location
  const todayStr = getLocalTodayString();
  datumInput.value = todayStr;
  datumInput.max   = todayStr;

  // Make sure to update #zeitraum select options the first time
  updateZeitraumSelect();

  const lastLoc = localStorage.getItem("lastLocation");
  if (lastLoc) {
    ortInput.value = lastLoc;
  }

  // Show/hide the coordinates line based on the existing location
  toggleCoordinatesLine();

  // IMPORTANT: Regardless of whether we have a last location or not, run the logic once
  // so that the Imkerliche Information is immediately computed.
  plotUpdater.run();

  // 3) The version placeholder logic is done in index.html now.

  // Now set up event listeners
  setupEventListeners();
});

/**
 * Attach event listeners (only if DOM elements exist).
 */
function setupEventListeners() {
  toggle5yrPlotBtn.addEventListener('click', () => {
    showFiveYear = !showFiveYear;
    // Expose the variable for other modules if needed
    window.showFiveYear = showFiveYear;

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
    plotUpdater.run();
  });

  zeitraumSelect.addEventListener('change', () => {
    plotUpdater.run();
  });

  datumInput.addEventListener('change', () => {
    updateZeitraumSelect();
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
    plotUpdater.run();
  });

  datumMinusBtn.addEventListener('click', () => {
    const current = new Date(datumInput.value);
    current.setDate(current.getDate() - 1);
    datumInput.value = current.toISOString().split('T')[0];
    updateZeitraumSelect();
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
    plotUpdater.run();
  });

  // Hide GTS plot container on page load
  gtsPlotContainer.classList.remove("visible");
  toggleGtsPlotBtn.addEventListener("click", () => {
    gtsPlotContainer.classList.toggle("visible");
    toggleGtsPlotBtn.textContent = gtsPlotContainer.classList.contains("visible")
      ? "Diagramm (GTS) ausblenden"
      : "Diagramm (GTS) anzeigen";
  });

  // Hide temp plot container on page load
  toggleTempPlotBtn.addEventListener("click", () => {
    tempPlotContainer.classList.toggle("visible");
    toggleTempPlotBtn.textContent = tempPlotContainer.classList.contains("visible")
      ? "Diagramm (Tagesmitteltemperaturen) ausblenden"
      : "Diagramm (Tagesmitteltemperaturen) anzeigen";
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
