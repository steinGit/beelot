// FILE: /home/fridtjofstein/privat/beelot/assets/js/main.js

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
  locationNameOutput // Import the new exported element
} from './ui.js';

import { PlotUpdater } from './plotUpdater.js';
// import { VERSION } from './version.js';  // <-- No longer needed

/**
 * Helper: get local "today" in YYYY-MM-DD format
 */
function getLocalTodayString() {
  const now = new Date();
  // Use local offset to ensure correct date even if user is in e.g. UTC+something
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  const dateStr = local.toISOString().split('T')[0];
  return dateStr;
}

/**
 * Dynamically updates the #zeitraum select options so that we never select beyond the year change.
 * Preserves the user's previous selection if it's still available.
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

  // If we are >= 7 days into January
  if (diffDays >= 7) {
    const opt7 = new Option("1 Woche", "7", false, false);
    zeitraumSelect.add(opt7);
  }
  // If we are >= 14 days into January
  if (diffDays >= 14) {
    const opt14 = new Option("2 Wochen", "14", false, false);
    zeitraumSelect.add(opt14);
  }
  // If we are >= 28 days into January
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
    !locationNameOutput // Ensure the new element exists
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
    locationNameOutput // Pass the new output element
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
    plotUpdater.run();
  }
  
  // 3) We remove the version placeholder logic,
  //    because each page sets it after injecting header.html.
  //    No more "No element found" warning in main.js.

  // Now set up event listeners
  setupEventListeners();
});

/**
 * Attach event listeners (only if DOM elements exist).
 */
function setupEventListeners() {
  
  toggle5yrPlotBtn.addEventListener('click', () => {
    showFiveYear = !showFiveYear;
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

  ortInput.addEventListener('change', () => {
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
      ? "ausblenden"
      : "anzeigen";
  });

  // Hide temp plot container on page load
  toggleTempPlotBtn.addEventListener("click", () => {
    tempPlotContainer.classList.toggle("visible");
    toggleTempPlotBtn.textContent = tempPlotContainer.classList.contains("visible")
      ? "ausblenden"
      : "anzeigen";
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
    window.saveMapSelection();
    // Programmatically click the hidden "berechnenBtn"
    berechnenBtn.click();
  });
}
