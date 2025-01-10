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
  toggle5yrPlotBtn
} from './ui.js';

import { PlotUpdater } from './plotUpdater.js';
import { VERSION } from './version.js';

/**
 * Helper: get local "today" in YYYY-MM-DD format
 */
function getLocalTodayString() {
  const now = new Date();
  // Use local offset to ensure correct date even if user is in e.g. UTC+something
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  const dateStr = local.toISOString().split('T')[0];
  // console.log("[DEBUG main.js] getLocalTodayString() =>", dateStr);
  return dateStr;
}

/**
 * NEW FUNCTION:
 * Dynamically updates the #zeitraum select options so that we never select beyond the year change.
 * If the selected date is within the first n days of January, restrict the available options.
 */
function updateZeitraumSelect() {
  const datumVal = datumInput.value;
  if (!datumVal) return; // if there's no date yet, do nothing

  // Parse date from input
  const [yyyy, mm, dd] = datumVal.split('-').map(x => parseInt(x, 10));
  const selectedDate = new Date(yyyy, mm - 1, dd, 0, 0, 0, 0);

  // We only do logic for the same year, if user picks e.g. next year, adjust as you like.
  // For now, let's assume user only picks a date in the current year.
  const startOfYear = new Date(yyyy, 0, 1); // January 1st of that year
  // How many days have passed since Jan 1
  const diffMs = selectedDate.getTime() - startOfYear.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 3600 * 24));

  // Clear out existing options
  while (zeitraumSelect.firstChild) {
    zeitraumSelect.removeChild(zeitraumSelect.firstChild);
  }

  // We'll always allow "seit Jahresanfang"
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

  // For simplicity, default to "seit Jahresanfang"
  zeitraumSelect.value = "ytd";
}

// We'll hold a reference to our PlotUpdater instance here
let plotUpdater = null;
// Also track the multi-year toggle
let showFiveYear = false;

document.addEventListener('DOMContentLoaded', () => {
  // console.log("[DEBUG main.js] DOMContentLoaded triggered.");

  // 1) Build a new PlotUpdater with the elements we need
  plotUpdater = new PlotUpdater({
    ortInput,
    datumInput,
    zeitraumSelect,
    ergebnisTextEl: document.getElementById('ergebnis-text'),
    hinweisSection: document.querySelector('.hinweis-section'),
    gtsPlotContainer,
    tempPlotContainer,
    // chartRefs can remain empty initially
    chartRefs: { chartGTS: null, chartTemp: null }
  });

  // 2) Set date to local "today" & load last known location
  const todayStr = getLocalTodayString();
  // console.log("[DEBUG main.js] Setting #datum input to:", todayStr);

  datumInput.value = todayStr;
  datumInput.max   = todayStr;

  // Make sure to update #zeitraum select options the first time
  updateZeitraumSelect();

  const lastLoc = localStorage.getItem("lastLocation");
  if (lastLoc) {
    // console.log("[DEBUG main.js] Found lastLocation in localStorage:", lastLoc);
    ortInput.value = lastLoc;
    // Kick off first plotting
    // console.log("[DEBUG main.js] Calling plotUpdater.run() after setting lastLoc...");
    plotUpdater.run();
  } else {
    // console.log("[DEBUG main.js] No lastLocation found in localStorage.");
  }

  // 3) Initialize version text if it exists
  const versionElement = document.getElementById("version-placeholder");
  if (versionElement) {
    versionElement.textContent = `Version ${VERSION}`;
  } else {
    console.warn("No element with ID 'version-placeholder' found in DOM.");
  }
});

/**
 * Multi-year toggle logic
 */
toggle5yrPlotBtn.addEventListener('click', () => {
  // console.log("[DEBUG main.js] toggle5yrPlotBtn clicked. Current showFiveYear=", showFiveYear);
  // Flip the boolean
  showFiveYear = !showFiveYear;
  window.showFiveYear = showFiveYear;
  // console.log("[DEBUG main.js] showFiveYear set to:", showFiveYear);

  if (showFiveYear) {
    // user just turned it on -> show “only selected year”
    toggle5yrPlotBtn.textContent = 'das ausgewählte Jahr';
  } else {
    // user turned it off -> show “past 5 years”
    toggle5yrPlotBtn.textContent = 'die letzten 5 Jahre';
  }

  // Rerun plotting
  if (plotUpdater) {
    plotUpdater.run();
  }
});

/**
 * Register the various event listeners
 * -> All were previously calling updatePlots(), now call plotUpdater.run()
 * -> We now also call updateZeitraumSelect() when date changes to restrict the user selection
 */
ortInput.addEventListener('change', () => {
  // console.log("[DEBUG main.js] ortInput changed => plotUpdater.run()");
  plotUpdater.run();
});

zeitraumSelect.addEventListener('change', () => {
  // console.log("[DEBUG main.js] zeitraumSelect changed => plotUpdater.run()");
  plotUpdater.run();
});

datumInput.addEventListener('change', () => {
  // console.log("[DEBUG main.js] datumInput changed => re-check #zeitraum, then plotUpdater.run()");
  updateZeitraumSelect();
  plotUpdater.run();
});

berechnenBtn.addEventListener('click', () => {
  // console.log("[DEBUG main.js] berechnenBtn clicked => plotUpdater.run()");
  plotUpdater.run();
});

// Datum +1
datumPlusBtn.addEventListener('click', () => {
  // console.log("[DEBUG main.js] datumPlusBtn clicked => +1 day");
  const current = new Date(datumInput.value);
  // console.log("[DEBUG main.js] Current date is:", datumInput.value);

  current.setDate(current.getDate() + 1);

  const now = new Date();
  if (current > now) {
    // console.log("[DEBUG main.js] Tried to set future date. Resetting to today.");
    current.setDate(now.getDate());
  }

  datumInput.value = current.toISOString().split('T')[0];
  // console.log("[DEBUG main.js] New date is:", datumInput.value);
  // Re-check #zeitraum and run
  updateZeitraumSelect();
  plotUpdater.run();
});

// Datum -1
datumMinusBtn.addEventListener('click', () => {
  // console.log("[DEBUG main.js] datumMinusBtn clicked => -1 day");
  const current = new Date(datumInput.value);
  // console.log("[DEBUG main.js] Current date is:", datumInput.value);

  current.setDate(current.getDate() - 1);

  datumInput.value = current.toISOString().split('T')[0];
  // console.log("[DEBUG main.js] New date is:", datumInput.value);
  // Re-check #zeitraum and run
  updateZeitraumSelect();
  plotUpdater.run();
});

// Keypress Functionality for "+" and "-"
document.addEventListener('keydown', (event) => {
  if (event.key === "+" || event.code === "NumpadAdd") {
    // console.log("[DEBUG main.js] '+' key pressed => triggering datumPlusBtn functionality");
    datumPlusBtn.click(); // Trigger the button click programmatically
  } else if (event.key === "-" || event.code === "NumpadSubtract") {
    // console.log("[DEBUG main.js] '-' key pressed => triggering datumMinusBtn functionality");
    datumMinusBtn.click(); // Trigger the button click programmatically
  }
});

// Heute button: sets the date to local "today" & updates
datumHeuteBtn.addEventListener('click', () => {
  // console.log("[DEBUG main.js] datumHeuteBtn clicked! Setting date to local 'today'.");
  const newToday = getLocalTodayString();
  datumInput.value = newToday;
  // console.log("[DEBUG main.js] #datum is now:", newToday);
  updateZeitraumSelect();
  plotUpdater.run();
});

// GTS plot toggle: make sure the container is hidden on page load (no 'visible' class)
gtsPlotContainer.classList.remove("visible");
toggleGtsPlotBtn.addEventListener("click", () => {
  gtsPlotContainer.classList.toggle("visible");
  toggleGtsPlotBtn.textContent = gtsPlotContainer.classList.contains("visible")
    ? "ausblenden"
    : "anzeigen";
});

// Temperature plot toggle
toggleTempPlotBtn.addEventListener("click", () => {
  tempPlotContainer.classList.toggle("visible");
  toggleTempPlotBtn.textContent = tempPlotContainer.classList.contains("visible")
    ? "ausblenden"
    : "anzeigen";
});

// Map logic
ortKarteBtn.addEventListener('click', () => {
  // console.log("[DEBUG main.js] ortKarteBtn clicked => showing map popup, initOrUpdateMap()");
  const mapPopup = document.getElementById('map-popup');
  mapPopup.style.display = 'block';
  window.initOrUpdateMap();
});

mapCloseBtn.addEventListener('click', () => {
  // console.log("[DEBUG main.js] mapCloseBtn clicked => hiding map popup");
  const mapPopup = document.getElementById('map-popup');
  mapPopup.style.display = 'none';
});

mapSaveBtn.addEventListener('click', () => {
  // console.log("[DEBUG main.js] mapSaveBtn clicked => saveMapSelection()");
  window.saveMapSelection();

  // Programmatically click the hidden "berechnenBtn"
  // so it triggers its existing event listener => calls plotUpdater.run()
  berechnenBtn.click();
});
