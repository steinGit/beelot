/**
 * @module main
 * Handles event listeners and initial setup
 */

import {
  updatePlots,
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


/**
 * Helper: get local "today" in YYYY-MM-DD format
 */
function getLocalTodayString() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  const dateStr = local.toISOString().split('T')[0];
  console.log("[DEBUG] getLocalTodayString() =>", dateStr);
  return dateStr;
}

// On load, set date to local today & load last known location
document.addEventListener('DOMContentLoaded', () => {
  console.log("[DEBUG] DOMContentLoaded triggered.");

  const todayStr = getLocalTodayString();
  console.log("[DEBUG] Setting #datum input to:", todayStr);

  datumInput.value = todayStr;
  datumInput.max = todayStr;

  const lastLoc = localStorage.getItem("lastLocation");
  if (lastLoc) {
    console.log("[DEBUG] Found lastLocation in localStorage:", lastLoc);
    ortInput.value = lastLoc;
    console.log("[DEBUG] Calling updatePlots() after setting lastLoc...");
    updatePlots();
  } else {
    console.log("[DEBUG] No lastLocation found in localStorage.");
  }
});

let showFiveYear = false; // starts off

toggle5yrPlotBtn.addEventListener('click', () => {
  console.log("[DEBUG] toggle5yrPlotBtn clicked. Current showFiveYear=", showFiveYear);
  // Flip the boolean
  showFiveYear = !showFiveYear;
  window.showFiveYear = showFiveYear;
  console.log("[DEBUG] showFiveYear set to:", showFiveYear);

  if (showFiveYear) {
    // user just turned it on -> show “only selected year”
    toggle5yrPlotBtn.textContent = 'only selected year';
  } else {
    // user turned it off -> show “past 5 years”
    toggle5yrPlotBtn.textContent = 'past 5 years';
  }

  updatePlots();
});


// Register listeners
ortInput.addEventListener('change', () => {
  console.log("[DEBUG] ortInput changed => updatePlots()");
  updatePlots();
});

zeitraumSelect.addEventListener('change', () => {
  console.log("[DEBUG] zeitraumSelect changed => updatePlots()");
  updatePlots();
});

datumInput.addEventListener('change', () => {
  console.log("[DEBUG] datumInput changed => updatePlots()");
  updatePlots();
});

berechnenBtn.addEventListener('click', () => {
  console.log("[DEBUG] berechnenBtn clicked => updatePlots()");
  updatePlots();
});

// Datum +1
datumPlusBtn.addEventListener('click', () => {
  console.log("[DEBUG] datumPlusBtn clicked => +1 day");
  const current = new Date(datumInput.value);
  console.log("[DEBUG] Current date is:", datumInput.value);

  current.setDate(current.getDate() + 1);

  const now = new Date();
  if (current > now) {
    console.log("[DEBUG] Tried to set future date. Resetting to today.");
    current.setDate(current.getDate() - 1);
  }

  datumInput.value = current.toISOString().split('T')[0];
  console.log("[DEBUG] New date is:", datumInput.value, "=> updatePlots()");
  updatePlots();
});

// Datum -1
datumMinusBtn.addEventListener('click', () => {
  console.log("[DEBUG] datumMinusBtn clicked => -1 day");
  const current = new Date(datumInput.value);
  console.log("[DEBUG] Current date is:", datumInput.value);

  current.setDate(current.getDate() - 1);

  datumInput.value = current.toISOString().split('T')[0];
  console.log("[DEBUG] New date is:", datumInput.value, "=> updatePlots()");
  updatePlots();
});

// Heute button: sets the date to local "today" & updates
datumHeuteBtn.addEventListener('click', () => {
  console.log("[DEBUG] datumHeuteBtn clicked! Setting date to local 'today'.");
  const newToday = getLocalTodayString();
  datumInput.value = newToday;
  console.log("[DEBUG] #datum is now:", newToday, "=> updatePlots()");
  updatePlots();
});

// GTS plot toggle
// Make sure the container is hidden on page load (no 'visible' class)
gtsPlotContainer.classList.remove("visible");

// Then toggle by class
toggleGtsPlotBtn.addEventListener("click", () => {
  // Toggle the class
  gtsPlotContainer.classList.toggle("visible");

  // Update the button text
  if (gtsPlotContainer.classList.contains("visible")) {
    toggleGtsPlotBtn.textContent = "ausblenden";
  } else {
    toggleGtsPlotBtn.textContent = "anzeigen";
  }
});


// Temperature plot toggle
toggleTempPlotBtn.addEventListener("click", () => {
  tempPlotContainer.classList.toggle("visible");
  if (tempPlotContainer.classList.contains("visible")) {
    toggleTempPlotBtn.textContent = "ausblenden";
  } else {
    toggleTempPlotBtn.textContent = "anzeigen";
  }
});


// Map logic
ortKarteBtn.addEventListener('click', () => {
  console.log("[DEBUG] ortKarteBtn clicked => showing map popup, initOrUpdateMap()");
  const mapPopup = document.getElementById('map-popup');
  mapPopup.style.display = 'block';
  window.initOrUpdateMap();
});

mapCloseBtn.addEventListener('click', () => {
  console.log("[DEBUG] mapCloseBtn clicked => hiding map popup");
  const mapPopup = document.getElementById('map-popup');
  mapPopup.style.display = 'none';
});

mapSaveBtn.addEventListener('click', () => {
  console.log("[DEBUG] mapSaveBtn clicked => saveMapSelection()");
  window.saveMapSelection();
});
