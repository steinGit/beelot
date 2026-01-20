// FILE: /home/fridtjofstein/privat/beelot/assets/js/plotUpdater.js

/**
 * @module plotUpdater
 * Responsible for orchestrating the steps to fetch, compute, and plot the data
 */

import { plotData, plotDailyTemps, plotMultipleYearData } from './charts.js';
import { fetchHistoricalData, fetchRecentData, isOpenMeteoError } from './dataService.js';
import {
  calculateGTS,
  computeStartDate,
  getSelectedEndDate,
  build5YearData,
  buildYearData,
  buildFullYearData,
  computeDateRange
} from './logic.js';
import { updateHinweisSection } from './information.js';
import { formatDateLocal, isValidDate } from './utils.js';
import { LocationNameFromGPS } from './location_name_from_gps.js'; // Import the new class
import { destroyAllCharts } from './chartManager.js';
import {
  createLocationNameCacheStore,
  createWeatherCacheStore,
  getLocationById,
  getLocationsInOrder,
  updateLocation
} from './locationStore.js';

const OFFLINE_TEXT = "Offline-Modus: Für diese Funktion ist eine Internetverbindung erforderlich.";

/**
 * Helper to forcibly destroy any leftover chart using a given canvas ID.
 * If no chart is associated, it just does nothing.
 * @param {string} canvasId - The ID of the canvas element.
 */
function destroyIfCanvasInUse(canvasId) {
  const existingChart = Chart.getChart(canvasId);
  if (existingChart) {
    existingChart.destroy();
  }
}

export class PlotUpdater {
  constructor({
    locationId,
    ortInput,
    datumInput,
    zeitraumSelect,
    ergebnisTextEl,
    hinweisSection,
    gtsPlotContainer,
    tempPlotContainer,
    chartRefs = {},
    locationNameOutput // Add locationNameOutput to constructor
  }) {
    this.verbose = false;
    this.debugGts = false; // set to true for temporary debugging only.
    this.locationId = locationId;
    this.ortInput = ortInput;
    this.datumInput = datumInput;
    this.zeitraumSelect = zeitraumSelect;
    this.ergebnisTextEl = ergebnisTextEl;
    this.hinweisSection = hinweisSection;
    this.gtsPlotContainer = gtsPlotContainer;
    this.tempPlotContainer = tempPlotContainer;
    this.locationNameOutput = locationNameOutput; // Assign the new output element

    // Chart.js object references
    this.chartGTS = chartRefs.chartGTS || null;
    this.chartTemp = chartRefs.chartTemp || null;

    // Arrays used to store daily temps in the [plotStart..endDate] window
    this.filteredTempsDates = [];
    this.filteredTempsData = [];

    this.weatherCacheStore = createWeatherCacheStore(this.locationId);
    this.locationNameCacheStore = createLocationNameCacheStore(this.locationId);
    this.locationFetcher = new LocationNameFromGPS({
      email: 'info.beelot@gmail.com',
      cacheStore: this.locationNameCacheStore
    });
  }

  setLocationId(locationId) {
    this.locationId = locationId;
    this.weatherCacheStore = createWeatherCacheStore(this.locationId);
    this.locationNameCacheStore = createLocationNameCacheStore(this.locationId);
    this.locationFetcher = new LocationNameFromGPS({
      email: 'info.beelot@gmail.com',
      cacheStore: this.locationNameCacheStore
    });
  }

  getLocation() {
    return getLocationById(this.locationId);
  }

  /**
   * Main entry point: orchestrates the entire plotting process.
   */
  async run() {
    try {
      destroyAllCharts();
      const location = this.getLocation();
      if (!location) {
        console.warn("[PlotUpdater] => Missing active location.");
        return;
      }
      // Step 1) Validate lat/lon input
      if (!this.step1CheckLatLon(location)) return;

      // Step 2) Create local "today midnight"
      const localTodayMidnight = this.step2CreateLocalTodayMidnight();

      // Step 3) Get end date & ensure it's not in the future
      const endDate = this.step3GetEndDate(localTodayMidnight);
      if (!endDate) return;

      // Step 4) Parse lat/lon
      const { lat, lon } = this.step4ParseLatLon(location);
      this.currentLat = lat;
      this.currentLon = lon;

      // Fetch and display location name
      this.step4aFetchAndDisplayLocationName(lat, lon);

      // Step 5) Date range logic
      const { differenceInDays, plotStartDate } = this.step5ComputeDateRange(endDate);
      this.currentPlotStartDate = plotStartDate;

      // Step 6) fetchStartDate & recentStartDate
      const { fetchStartDate, recentStartDate } = this.step6ComputeFetchDates(endDate);

      // Step 7) fetch data
      const { allDates, allTemps } = await this.step7FetchAllData(
        lat, lon, fetchStartDate, endDate, recentStartDate, differenceInDays
      );
      if (allDates.length === 0) return;
      if (this.debugGts) {
        console.log("[GTS DEBUG] endDate", formatDateLocal(endDate));
        console.log("[GTS DEBUG] allDates tail", allDates.slice(-7));
        console.log("[GTS DEBUG] allTemps tail", allTemps.slice(-7));
      }

      // Step 8) GTS calculations
      const gtsResults = this.step8CalculateGTS(allDates, allTemps);
      if (this.debugGts) {
        console.log("[GTS DEBUG] gtsResults tail", gtsResults.slice(-7));
      }
      // Step 9) Filter GTS to [plotStartDate..endDate]
      const filteredResults = this.step9FilterGTS(gtsResults, plotStartDate, endDate);
      this.latestFilteredResults = filteredResults;
      if (this.debugGts) {
        console.log("[GTS DEBUG] filteredResults tail", filteredResults.slice(-7));
      }

      if (this.verbose)
      {
        console.log(">> plotUpdater: GTS Results", gtsResults);
        console.log(">> plotUpdater: plotStartDate=", plotStartDate);
        console.log(">> plotUpdater: endDate      =", endDate);
        console.log(">> plotUpdater: Filtered GTS Results:", filteredResults);
      }

      // Step 10) If empty, bail
      if (!this.step10CheckIfEmpty(filteredResults, endDate)) return;

      // Step 11) Filter daily temps
      this.step11FilterDailyTemps(allDates, allTemps, plotStartDate, endDate);

      // Step 12) Update text
      this.step12UpdateErgebnisText(gtsResults, endDate);

      // Step 13) Destroy old charts
      this.step13DestroyOldCharts();

      // Step 14) GTS chart creation
      await this.step14CreateGTSChart(lat, lon, plotStartDate, endDate, filteredResults);
      await this.step14bUpdateGtsComparison();

      // Step 15) Temp chart creation
      this.step15CreateTemperatureChart(endDate);

      // Step 16) Update hints
      await this.step16UpdateHinweisSection(gtsResults, endDate);

      updateLocation(this.locationId, (current) => {
        current.calculations.gtsResults = gtsResults;
        current.calculations.filteredResults = filteredResults;
        current.calculations.temps = {
          dates: [...this.filteredTempsDates],
          values: [...this.filteredTempsData]
        };
        current.calculations.lastGtsKey = `${formatDateLocal(endDate)}|${this.zeitraumSelect.value}`;
        if (this.hinweisSection) {
          current.calculations.hinweisHtml = this.hinweisSection.innerHTML;
        }
      });

    } catch (err) {
      if (err && typeof err.message === "string" && err.message.includes("Canvas is already in use")) {
        console.warn("[PlotUpdater] Chart reuse warning:", err.message);
        return;
      }
      if (isOpenMeteoError(err)) {
        this.showOfflineMessage();
        return;
      }
      console.log("[PlotUpdater] => Caught error:", err);
      this.ergebnisTextEl.textContent = "Ein Fehler ist aufgetreten. Bitte versuche es später erneut.";
      if (this.hinweisSection) {
        this.hinweisSection.innerHTML = `<h2>Imkerliche Information</h2>
          <p style="color: red;">Es ist ein Fehler aufgetreten: ${err.message}</p>`;
      }
    }
  }

  showOfflineMessage() {
    if (this.ergebnisTextEl) {
      this.ergebnisTextEl.innerHTML = `<span style="color: #b00000;">${OFFLINE_TEXT}</span>`;
    }
  }

  // === Steps 1..16 below ===

  /**
   * Step 1: Validate latitude and longitude input.
   * @returns {boolean} - True if valid, false otherwise.
   */
  // plotUpdater.js, inside step1CheckLatLon():
  step1CheckLatLon(location) {
    if (!location.coordinates) {
      // Replace textContent => innerHTML:
    this.ergebnisTextEl.innerHTML = `
      <span style="font-weight: normal; color: #202020;">Die <a href="components/faq.html" class="unstyled-link">Grünland-Temperatur-Summe</a> wird berechnet wenn ein Ort ausgewählt ist.</span>`;

      if (this.chartGTS) {
        this.chartGTS.destroy();
        this.chartGTS = null;
      }
      if (this.chartTemp) {
        this.chartTemp.destroy();
        this.chartTemp = null;
      }

      if (this.hinweisSection) {
        this.hinweisSection.innerHTML = `<h2>Imkerliche Information</h2>
          <p style="color: grey;">Kein Standort definiert.</p>`;
      }
      return false;
    }
    return true;
  }

  /**
   * Step 2: Create a Date object representing today's date at local midnight.
   * @returns {Date} - The Date object.
   */
  step2CreateLocalTodayMidnight() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  }

  /**
   * Step 3: Get the selected end date and ensure it's not in the future.
   * @param {Date} localTodayMidnight - Today's date at local midnight.
   * @returns {Date|null} - The validated end date or null if invalid.
   */
  step3GetEndDate(localTodayMidnight) {
    const endDate = getSelectedEndDate();
    if (!isValidDate(endDate)) {
      console.error("[PlotUpdater] => Invalid endDate:", endDate);
      return null;
    }
    if (endDate.getTime() > localTodayMidnight.getTime()) {
      alert("Das Datum darf nicht in der Zukunft liegen.");
      const formattedDate = formatDateLocal(localTodayMidnight);
      this.datumInput.value = formattedDate;
      this.datumInput.max = formattedDate;
      return null;
    }
    return endDate;
  }

  /**
   * Step 4: Parse latitude and longitude from the input field.
   * @returns {Object} - An object containing latitude and longitude.
   */
  step4ParseLatLon(location) {
    return {
      lat: location.coordinates.lat,
      lon: location.coordinates.lon
    };
  }

  /**
   * Step 4a: Fetch and display the location name based on latitude and longitude.
   * @param {number} lat - Latitude.
   * @param {number} lon - Longitude.
   */
  async step4aFetchAndDisplayLocationName(lat, lon) {
    if (this.locationNameOutput) {
      this.locationNameOutput.textContent = "Standortname wird ermittelt...";
      const locationName = await this.locationFetcher.getLocationName(lat, lon);
      this.locationNameOutput.textContent = "In der Nähe von: " + locationName;
      updateLocation(this.locationId, (current) => {
        current.calculations.locationLabel = locationName;
      });
    }
  }

  /**
   * Step 5: Compute the date range based on the selected end date.
   * @param {Date} endDate - The selected end date.
   * @returns {Object} - An object containing differenceInDays and plotStartDate.
   */
  step5ComputeDateRange(endDate) {
    return computeDateRange(endDate);
  }

  /**
   * Step 6: Compute fetch start date and recent start date based on the end date.
   * @param {Date} endDate - The selected end date.
   * @returns {Object} - An object containing fetchStartDate and recentStartDate.
   */
  step6ComputeFetchDates(endDate) {
    const fetchStartDate = new Date(endDate.getFullYear(), 0, 1, 0, 0, 0, 0);
    let recentStartDate;
    if (endDate.getTime() - fetchStartDate.getTime() <= 30 * 86400000) {
      recentStartDate = new Date(fetchStartDate);
    } else {
      recentStartDate = new Date(endDate);
      recentStartDate.setDate(recentStartDate.getDate() - 30);
    }
    return { fetchStartDate, recentStartDate };
  }

  /**
   * Step 7: Fetch all necessary data (historical and recent).
   * @param {number} lat - Latitude.
   * @param {number} lon - Longitude.
   * @param {Date} fetchStartDate - Start date for fetching data.
   * @param {Date} endDate - End date for fetching data.
   * @param {Date} recentStartDate - Start date for recent data.
   * @param {number} differenceInDays - Difference in days between today and end date.
   * @returns {Promise<Object>} - An object containing allDates and allTemps arrays.
   */
  async step7FetchAllData(lat, lon, fetchStartDate, endDate, recentStartDate, differenceInDays) {
    if (this.verbose)
    {
        console.log("[PlotUpdater] step7FetchAllData() =>", formatDateLocal(fetchStartDate), "->", formatDateLocal(endDate));
    }
    const dataByDate = {};
    const addToMap = (dates, temps, overwrite) => {
      if (!dates || !temps) {
        return;
      }
      for (let i = 0; i < dates.length; i++) {
        const dateKey = dates[i];
        if (!overwrite && Object.prototype.hasOwnProperty.call(dataByDate, dateKey)) {
          continue;
        }
        dataByDate[dateKey] = temps[i];
      }
    };

    let histData = null;
    try {
      histData = await fetchHistoricalData(
        lat,
        lon,
        fetchStartDate,
        endDate,
        this.weatherCacheStore
      );
    } catch (error) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (endDate >= today) {
        console.warn("[PlotUpdater] Falling back to forecast data for recent dates.");
        histData = await fetchRecentData(
          lat,
          lon,
          fetchStartDate,
          endDate,
          this.weatherCacheStore
        );
      } else {
        throw error;
      }
    }

    if (histData && histData.daily && histData.daily.time.length > 0) {
      addToMap(histData.daily.time, histData.daily.temperature_2m_mean, true);

      const lastHistDateStr = histData.daily.time[histData.daily.time.length - 1];
      const endDateStr = formatDateLocal(endDate);
      if (lastHistDateStr < endDateStr) {
        const lastHistDate = new Date(lastHistDateStr);
        const recentStart = new Date(lastHistDate);
        recentStart.setDate(recentStart.getDate() + 1);
        const recentData = await fetchRecentData(
          lat,
          lon,
          recentStart,
          endDate,
          this.weatherCacheStore
        );
        if (recentData && recentData.daily) {
          addToMap(recentData.daily.time, recentData.daily.temperature_2m_mean, false);
        }
      }
    } else if (differenceInDays <= 10) {
      const recentData = await fetchRecentData(
        lat,
        lon,
        recentStartDate,
        endDate,
        this.weatherCacheStore
      );
      if (recentData && recentData.daily) {
        addToMap(recentData.daily.time, recentData.daily.temperature_2m_mean, true);
      }
    }

    // Sort by date
    const allDates = Object.keys(dataByDate);

    const sortedDates = allDates.sort((a, b) => new Date(a) - new Date(b));
    const sortedTemps = sortedDates.map(d => dataByDate[d]);

    if (sortedTemps.length === 0) {
      alert("Keine Daten gefunden. Anderen Ort oder anderes Datum wählen.");
    }

    return { allDates: sortedDates, allTemps: sortedTemps };
  }

  /**
   * Step 8: Calculate GTS based on all dates and temperatures.
   * @param {Array<string>} allDates - Array of date strings.
   * @param {Array<number>} allTemps - Array of temperature values.
   * @returns {Array<Object>} - Array of GTS results.
   */
  step8CalculateGTS(allDates, allTemps) {
    return calculateGTS(allDates, allTemps);
  }

  /**
   * Step 9: Filter GTS results to the desired date range.
   * @param {Array<Object>} gtsResults - Array of GTS results.
   * @param {Date} plotStartDate - Start date for plotting.
   * @param {Date} endDate - End date for plotting.
   * @returns {Array<Object>} - Filtered GTS results.
   */
  step9FilterGTS(gtsResults, plotStartDate, endDate) {
    // Create a new Date object set to the end of the endDate day
    const endOfDay = new Date(endDate);
    endOfDay.setHours(23, 59, 59, 999); // Set to 23:59:59.999

    return gtsResults.filter(r => {
      const d = new Date(r.date);
      return d >= plotStartDate && d <= endOfDay;
    });
  }

  /**
   * Step 10: Check if filtered results are empty and handle accordingly.
   * @param {Array<Object>} filteredResults - Filtered GTS results.
   * @param {Date} endDate - End date for reference in messages.
   * @returns {boolean} - True if results are not empty, false otherwise.
   */
  step10CheckIfEmpty(filteredResults, endDate) {
    if (filteredResults.length === 0) {
      const formattedDate = formatDateLocal(endDate);
      this.ergebnisTextEl.innerHTML = `
        <span style="color: #700000;">
          Die Grünland-Temperatur-Summe konnte am ${formattedDate} nicht berechnet werden,
          da für eine "Summe" noch keine Daten zur Verfügung stehen 😉.
        </span>
      `;

      if (this.verbose)
      {
        console.log("[PlotUpdater] => No data to sum. Returning early.");
      }

      if (this.chartGTS) {
        this.chartGTS.destroy();
        this.chartGTS = null;
      }
      if (this.chartTemp) {
        this.chartTemp.destroy();
        this.chartTemp = null;
      }
      if (this.hinweisSection) {
        this.hinweisSection.innerHTML = `<h2>Imkerliche Information</h2>
          <p style="color: grey;">Keine ausreichenden Daten zur Berechnung vorhanden.</p>`;
      }
      return false;
    }
    return true;
  }

  /**
   * Step 11: Filter daily temperatures based on the plot date range.
   * @param {Array<string>} allDates - Array of all date strings.
   * @param {Array<number>} allTemps - Array of all temperature values.
   * @param {Date} plotStartDate - Start date for plotting.
   * @param {Date} endDate - End date for plotting.
   */
  step11FilterDailyTemps(allDates, allTemps, plotStartDate, endDate) {
    // 1) Define an endOfDay that matches your GTS logic
    const endOfDay = new Date(endDate);
    endOfDay.setHours(23, 59, 59, 999);

    // 2) Filter using endOfDay
    this.filteredTempsDates = [];
    this.filteredTempsData = [];
    for (let i = 0; i < allDates.length; i++) {
      const d = new Date(allDates[i]);
      if (d >= plotStartDate && d <= endOfDay) {
        this.filteredTempsDates.push(allDates[i]);
        this.filteredTempsData.push(allTemps[i]);
      }
     }
  }

  /**
   * Step 12: Update the result text based on GTS results.
   * @param {Array<Object>} gtsResults - Array of GTS results.
   * @param {Date} endDate - End date for reference in messages.
   */
  step12UpdateErgebnisText(gtsResults, endDate) {
    // Use Intl.DateTimeFormat for stable German long date output across browsers.
    const formattedDate = new Intl.DateTimeFormat("de-DE", {
      day: "2-digit",
      month: "long",
      year: "numeric"
    }).format(endDate);
    const localTodayStr = formatDateLocal(new Date());
    const lastGTS = gtsResults.length
      ? gtsResults[gtsResults.length - 1].gts
      : 0;
    this.currentGtsValue = lastGTS;
    this.currentEndDate = endDate;

    let dateColor = "#802020";
    let dateWeight = "bold";
    let betragenStr = "beträgt";

    if (formatDateLocal(endDate) === localTodayStr) {
      dateColor = "#206020";
      betragenStr = "beträgt";
    } else {
      betragenStr = "betrug";
    }

    this.ergebnisTextEl.innerHTML = `
      <span style="font-weight: normal; color: #202020;">Die <a href="components/faq.html" class="unstyled-link">Grünland-Temperatur-Summe</a> am </span>
      <span style="font-weight: ${dateWeight}; color: ${dateColor};">${formattedDate}</span>
      <span style="font-weight: normal; color: #202020;"> ${betragenStr} </span>
      <span style="font-weight: bold; color: darkgreen;">${lastGTS.toFixed(1)}</span>
      <span class="gts-unit-tooltip" title="Einheit der Grünland-Temperatur-Summe: Grad-Tage (°C·d)">°Cd</span>
      <span id="gts-year-comparison"></span>
    `;
  }

  /**
   * Step 13: Destroy old charts to prevent Canvas reuse issues.
   */
  step13DestroyOldCharts() {
    // Forcibly destroy leftover charts
    destroyIfCanvasInUse("plot-canvas");
    destroyIfCanvasInUse("temp-plot");

    if (this.chartGTS) {
      this.chartGTS = null;
    }
    if (this.chartTemp) {
      this.chartTemp = null;
    }
  }

  /**
   * Step 14: Create the GTS chart based on user preferences.
   * @param {number} lat - Latitude.
   * @param {number} lon - Longitude.
   * @param {Date} plotStartDate - Start date for plotting.
   * @param {Date} endDate - End date for plotting.
   * @param {Array<Object>} filteredResults - Filtered GTS results.
   */
  async step14CreateGTSChart(lat, lon, plotStartDate, endDate, filteredResults) {
    const viewKey = this.buildGtsViewKey(endDate);
    if (this.gtsPlotContainer.style.display === "none") {
      console.log("[PlotUpdater] => GTS container hidden => skipping chart creation.");
      this.lastMultiYearData = this.getCachedMultiYearData(viewKey);
      return;
    }

    const yearRange = window.gtsYearRange || 1;
    if (yearRange > 1) {
      let multiYearData;
      const selectedYear = endDate.getFullYear();
      if (yearRange === 20 && window.gtsColorScheme === "temperature") {
        // Use the selected year as anchor for the full-year range.
        multiYearData = await buildFullYearData(
          lat,
          lon,
          selectedYear,
          yearRange,
          plotStartDate,
          endDate,
          this.weatherCacheStore
        );
      } else {
        multiYearData = await buildYearData(
          lat,
          lon,
          plotStartDate,
          endDate,
          filteredResults,
          yearRange,
          this.weatherCacheStore
        );
      }
      this.lastMultiYearData = multiYearData;
      this.storeMultiYearData(viewKey, multiYearData);
      const gtsStats = this.computeStatsFromMultiYear(multiYearData);
      this.storeAxisStats("gts", endDate, gtsStats);
      const yRange = window.standortSyncEnabled
        ? this.computeGlobalYRange("gts", this.buildGtsViewKey(endDate))
        : null;
      this.chartGTS = plotMultipleYearData(multiYearData, yRange);
    } else {
      this.lastMultiYearData = this.getCachedMultiYearData(viewKey);
      const gtsStats = this.computeStatsFromValues(filteredResults.map((item) => item.gts));
      this.storeAxisStats("gts", endDate, gtsStats);
      const yRange = window.standortSyncEnabled
        ? this.computeGlobalYRange("gts", this.buildGtsViewKey(endDate))
        : null;
      this.chartGTS = plotData(filteredResults, false, yRange);
    }
  }

  async step14bUpdateGtsComparison() {
    if (!this.ergebnisTextEl) {
      return;
    }
    const comparisonEl = this.ergebnisTextEl.querySelector("#gts-year-comparison");
    if (comparisonEl) {
      comparisonEl.innerHTML = "";
    }
    if (!Number.isFinite(this.currentGtsValue) || !(this.currentEndDate instanceof Date)) {
      return;
    }
    if (!comparisonEl) {
      return;
    }
    const viewKey = this.buildGtsViewKey(this.currentEndDate);
    let resolvedData = this.getCachedMultiYearData(viewKey);
    if (!Array.isArray(resolvedData)) {
      if (this.currentPlotStartDate instanceof Date && Array.isArray(this.latestFilteredResults)) {
        resolvedData = await buildYearData(
          this.currentLat,
          this.currentLon,
          this.currentPlotStartDate,
          this.currentEndDate,
          this.latestFilteredResults,
          3,
          this.weatherCacheStore
        );
        this.storeMultiYearData(viewKey, resolvedData);
      } else {
        return;
      }
    }
    const currentYear = this.currentEndDate.getFullYear();
    const comparisonYears = [currentYear - 1, currentYear - 2];
    const currentDayIndex = this.getDayOfYear(this.currentEndDate);
    const comparisons = [];

    const findMatchIndex = (entry) => {
      if (!entry || !Array.isArray(entry.gtsValues)) {
        return -1;
      }
      for (let i = 0; i < entry.gtsValues.length; i++) {
        if (Number(entry.gtsValues[i]) >= this.currentGtsValue) {
          return i;
        }
      }
      return -1;
    };

    for (const year of comparisonYears) {
      const entry = resolvedData.find((item) => item.year === year);
      if (!entry || !Array.isArray(entry.gtsValues) || !Array.isArray(entry.labels)) {
        continue;
      }
      let matchIndex = findMatchIndex(entry);
      let labelSource = entry;
      if (matchIndex === -1) {
        const fullEntry = await this.getFullYearEntry(year);
        if (fullEntry) {
          matchIndex = findMatchIndex(fullEntry);
          if (matchIndex !== -1) {
            labelSource = fullEntry;
          }
        }
      }
      if (matchIndex === -1) {
        continue;
      }
      const label = labelSource.labels[matchIndex];
      const dateForYear = this.parseLabelDate(label, year);
      if (!dateForYear) {
        continue;
      }
      const dayIndex = this.getDayOfYear(dateForYear);
      const deltaDays = currentDayIndex - dayIndex;
      const referenceYear = year;
      if (Math.abs(deltaDays) < 2) {
        comparisons.push({ year: referenceYear, relation: "equal" });
      } else if (deltaDays < 0) {
        comparisons.push({ year: referenceYear, relation: "faster", delta: Math.abs(deltaDays) });
      } else {
        comparisons.push({ year: referenceYear, relation: "slower", delta: deltaDays });
      }
    }

    let comparisonHtml = "";
    if (comparisons.length > 0) {
      const orderedComparisons = comparisons.slice().sort((a, b) => a.year - b.year);
      const parts = orderedComparisons.map((item, index) => {
        const prefix = index === 0 ? "Gegenüber" : "gegenüber";
        if (item.relation === "equal") {
          return `${prefix} ${item.year} etwa gleich`;
        }
        const speedWord = item.relation === "faster" ? "schneller" : "langsamer";
        return `${prefix} ${item.year} um ${item.delta} Tage ${speedWord}`;
      });
      const sentence = `Vegetationsentwicklung ${currentYear}:<br>${parts.join(",<br>")}.`;
      comparisonHtml = `<span class="gts-comparison-spacer"></span><span class="gts-comparison">${sentence}</span>`;
    }

    const locations = getLocationsInOrder();
    if (locations.length > 1) {
      const currentLocation = getLocationById(this.locationId);
      const candidates = locations.map((location) => {
        const selectedDateStr = location.ui?.selectedDate;
        const selectedDate = selectedDateStr
          ? this.parseDateStringLocal(selectedDateStr)
          : null;
        const currentGts = this.findGtsValueForDate(location.calculations?.gtsResults, selectedDate);
        return {
          location,
          selectedDate,
          currentGts
        };
      }).filter((entry) => entry.selectedDate && Number.isFinite(entry.currentGts));

      if (candidates.length > 1) {
        const reference = candidates.reduce((best, entry) => {
          if (!best || entry.currentGts > best.currentGts) {
            return entry;
          }
          return best;
        }, null);

        if (reference && reference.location?.calculations?.gtsResults) {
          const referenceName = reference.location.name || "Standort";
          const referenceDate = reference.selectedDate;
          const referenceCurve = reference.location.calculations.gtsResults;
          const referenceStamp = this.getUtcDayStamp(referenceDate);

          const deltaById = new Map();
          candidates.forEach((entry) => {
            const targetGts = entry.currentGts;
            let matchDate = null;
            for (const item of referenceCurve) {
              if (!Number.isFinite(item.gts)) {
                continue;
              }
              if (Number(item.gts) >= targetGts) {
                matchDate = this.parseDateStringLocal(item.date);
                break;
              }
            }
            if (!matchDate) {
              matchDate = referenceDate;
            }
            const deltaDays = Math.max(
              0,
              Math.round((referenceStamp - this.getUtcDayStamp(matchDate)) / 86400000)
            );
            deltaById.set(entry.location.id, deltaDays);
          });

          const comparisonsByKey = new Map();
          const MIN_COMPARE_GTS = 10;
          const GTS_EQUAL_EPSILON = 1.0;

          const comparisonMap = new Map();
          candidates.forEach((entry) => {
            comparisonMap.set(entry.location.id, new Map());
          });

          for (let i = 0; i < candidates.length; i++) {
            const left = candidates[i];
            for (let j = i + 1; j < candidates.length; j++) {
              const right = candidates[j];
              if (!(left.currentGts > MIN_COMPARE_GTS && right.currentGts > MIN_COMPARE_GTS)) {
                continue;
              }
              if (Math.abs(left.currentGts - right.currentGts) < GTS_EQUAL_EPSILON) {
                comparisonMap.get(left.location.id).set(right.location.id, { relation: "gleich", days: 0 });
                comparisonMap.get(right.location.id).set(left.location.id, { relation: "gleich", days: 0 });
                continue;
              }
              const deltaLeft = deltaById.get(left.location.id);
              const deltaRight = deltaById.get(right.location.id);
              if (!Number.isFinite(deltaLeft) || !Number.isFinite(deltaRight)) {
                continue;
              }
              const diff = Math.abs(deltaLeft - deltaRight);
              if (deltaLeft < deltaRight) {
                comparisonMap.get(left.location.id).set(right.location.id, { relation: "schneller", days: diff });
                comparisonMap.get(right.location.id).set(left.location.id, { relation: "langsamer", days: diff });
              } else {
                comparisonMap.get(left.location.id).set(right.location.id, { relation: "langsamer", days: diff });
                comparisonMap.get(right.location.id).set(left.location.id, { relation: "schneller", days: diff });
              }
            }
          }

          const gtsById = new Map(candidates.map((entry) => [entry.location.id, entry.currentGts]));
          const groupedComparisons = [];

          const appendToGroup = (relation, days, targetName, targetGts) => {
            if (relation === "gleich") {
              for (const group of groupedComparisons) {
                if (group.relation !== "gleich" || group.days !== 0) {
                  continue;
                }
                const isCompatible = group.targets.every((existing) =>
                  Math.abs(existing.gts - targetGts) < GTS_EQUAL_EPSILON
                );
                if (isCompatible) {
                  group.targets.push({ name: targetName, gts: targetGts });
                  return;
                }
              }
              groupedComparisons.push({
                relation: "gleich",
                days: 0,
                targets: [{ name: targetName, gts: targetGts }]
              });
              return;
            }
            const key = `${relation}|${days}`;
            if (!comparisonsByKey.has(key)) {
              comparisonsByKey.set(key, {
                relation,
                days,
                targets: []
              });
              groupedComparisons.push(comparisonsByKey.get(key));
            }
            comparisonsByKey.get(key).targets.push({ name: targetName, gts: targetGts });
          };

          locations.forEach((target) => {
            if (!currentLocation || target.id === currentLocation.id) {
              return;
            }
            const targetName = target.name || "Standort";
            const currentComparisons = currentLocation
              ? comparisonMap.get(currentLocation.id)
              : null;
            const comparison = currentComparisons ? currentComparisons.get(target.id) : null;
            if (!comparison) {
              return;
            }
            const targetGts = gtsById.get(target.id);
            if (!Number.isFinite(targetGts)) {
              return;
            }
            appendToGroup(comparison.relation, comparison.days, targetName, targetGts);
          });

          const lines = [];
          const currentName = currentLocation ? currentLocation.name : "Standort";
          groupedComparisons.forEach((group) => {
            if (group.targets.length === 0) {
              return;
            }
            if (group.relation === "gleich") {
              const targets = group.targets.map((item) => item.name).join(" und ");
              lines.push(`${currentName} ist gleichauf mit ${targets}.`);
              return;
            }
            if (group.days === 0) {
              const targets = group.targets.map((item) => item.name).join(" und ");
              lines.push(`${currentName} ist mit ${targets} gleichauf.`);
              return;
            }
            const targets = group.targets.map((item) => item.name).join(" und ");
            lines.push(`${currentName} ist um ${group.days} Tage ${group.relation} als ${targets}.`);
          });

          if (lines.length > 0) {
            if (!comparisonHtml) {
              comparisonHtml = `<span class="gts-comparison-spacer"></span>`;
            } else {
              comparisonHtml += `<span class="gts-comparison-spacer"></span>`;
            }
            comparisonHtml += `<span class="gts-comparison">Vegetationsentwicklung der Standorte:<br>${lines.join("<br>")}</span>`;
          }
        }
      }
    }

    if (!comparisonHtml) {
      return;
    }
    comparisonEl.innerHTML = `<br>${comparisonHtml}`;
  }

  getCachedMultiYearData(viewKey) {
    const location = this.getLocation();
    if (!location || !location.calculations || !location.calculations.gtsYearCurves) {
      return null;
    }
    if (location.calculations.gtsYearCurves[viewKey]) {
      return location.calculations.gtsYearCurves[viewKey];
    }
    const keyParts = viewKey.split("|");
    if (keyParts.length < 2) {
      return null;
    }
    const baseKey = `${keyParts[0]}|${keyParts[1]}|`;
    const candidates = Object.keys(location.calculations.gtsYearCurves)
      .filter((key) => key.startsWith(baseKey))
      .map((key) => location.calculations.gtsYearCurves[key])
      .filter((entry) => Array.isArray(entry));
    return candidates.length > 0 ? candidates[0] : null;
  }

  getCachedMultiYearKeys() {
    const location = this.getLocation();
    if (!location || !location.calculations || !location.calculations.gtsYearCurves) {
      return [];
    }
    return Object.keys(location.calculations.gtsYearCurves);
  }

  async getFullYearEntry(year) {
    const fullKey = `full-${year}`;
    const cached = this.getCachedMultiYearData(fullKey);
    if (Array.isArray(cached) && cached.length > 0) {
      return cached[0];
    }
    const baseStartDate = new Date(year, 0, 1);
    const baseEndDate = new Date(year, 11, 31);
    const data = await buildFullYearData(
      this.currentLat,
      this.currentLon,
      year,
      1,
      baseStartDate,
      baseEndDate,
      this.weatherCacheStore
    );
    if (Array.isArray(data) && data.length > 0) {
      this.storeMultiYearData(fullKey, data);
      return data[0];
    }
    return null;
  }

  storeMultiYearData(viewKey, multiYearData) {
    if (!Array.isArray(multiYearData)) {
      return;
    }
    updateLocation(this.locationId, (current) => {
      if (!current.calculations.gtsYearCurves) {
        current.calculations.gtsYearCurves = {};
      }
      current.calculations.gtsYearCurves[viewKey] = multiYearData;
    });
  }

  getDayOfYear(dateObj) {
    const start = new Date(dateObj.getFullYear(), 0, 1);
    const diff = dateObj - start;
    return Math.floor(diff / 86400000) + 1;
  }

  parseLabelDate(label, year) {
    if (typeof label !== "string") {
      return null;
    }
    const parts = label.split(".");
    if (parts.length < 2) {
      return null;
    }
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    if (!Number.isFinite(day) || !Number.isFinite(month)) {
      return null;
    }
    return new Date(year, month - 1, day);
  }

  parseDateStringLocal(dateStr) {
    if (typeof dateStr !== "string") {
      return null;
    }
    const parts = dateStr.split("-");
    if (parts.length !== 3) {
      return null;
    }
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
      return null;
    }
    return new Date(year, month, day, 0, 0, 0, 0);
  }

  getUtcDayStamp(dateObj) {
    return Date.UTC(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate());
  }

  findGtsValueForDate(gtsResults, selectedDate) {
    if (!Array.isArray(gtsResults) || !(selectedDate instanceof Date)) {
      return null;
    }
    const targetStamp = this.getUtcDayStamp(selectedDate);
    let latestValue = null;
    let latestStamp = null;
    for (const item of gtsResults) {
      const parsed = this.parseDateStringLocal(item.date);
      if (!parsed) {
        continue;
      }
      const stamp = this.getUtcDayStamp(parsed);
      if (stamp === targetStamp) {
        return Number(item.gts);
      }
      if (stamp <= targetStamp && (latestStamp === null || stamp > latestStamp)) {
        latestStamp = stamp;
        latestValue = Number(item.gts);
      }
    }
    return Number.isFinite(latestValue) ? latestValue : null;
  }

  /**
   * Step 15: Create the Temperature chart.
   */
  step15CreateTemperatureChart(endDate) {
    if (this.tempPlotContainer.style.display === "none") {
      console.log("[PlotUpdater] => tempPlotContainer hidden => skipping temp chart.");
      return;
    }
    const tempStats = this.computeStatsFromValues(this.filteredTempsData);
    this.storeAxisStats("temp", endDate, tempStats);
    const yRange = window.standortSyncEnabled
      ? this.computeGlobalYRange("temp", this.buildTempViewKey(endDate))
      : null;
    this.chartTemp = plotDailyTemps(this.filteredTempsDates, this.filteredTempsData, false, yRange);
  }

  /**
   * Step 16: Update the hints section with relevant information.
   * @param {Array<Object>} gtsResults - Array of GTS results.
   * @param {Date} endDate - End date for reference in messages.
   */
  async step16UpdateHinweisSection(gtsResults, endDate) {
    await updateHinweisSection(gtsResults, endDate);
  }

  buildGtsViewKey(endDate) {
    const dateKey = formatDateLocal(endDate);
    return `${dateKey}|${this.zeitraumSelect.value}|${window.gtsYearRange || 1}`;
  }

  buildTempViewKey(endDate) {
    const dateKey = endDate ? formatDateLocal(endDate) : (this.datumInput.value || "");
    return `${dateKey}|${this.zeitraumSelect.value}`;
  }

  computeStatsFromValues(values) {
    let min = Infinity;
    let max = -Infinity;
    let count = 0;
    values.forEach((value) => {
      if (!Number.isFinite(value)) {
        return;
      }
      min = Math.min(min, value);
      max = Math.max(max, value);
      count += 1;
    });
    if (count === 0) {
      return null;
    }
    return { min, max, count };
  }

  computeStatsFromMultiYear(multiYearData) {
    const allValues = [];
    multiYearData.forEach((entry) => {
      if (Array.isArray(entry.gtsValues)) {
        allValues.push(...entry.gtsValues);
      }
    });
    return this.computeStatsFromValues(allValues);
  }

  storeAxisStats(chartType, endDate, stats) {
    if (!stats) {
      return;
    }
    const key = chartType === "gts" ? this.buildGtsViewKey(endDate) : this.buildTempViewKey();
    updateLocation(this.locationId, (current) => {
      if (!current.calculations.axisStats) {
        current.calculations.axisStats = {};
      }
      current.calculations.axisStats[chartType] = {
        key,
        min: stats.min,
        max: stats.max,
        count: stats.count
      };
    });
  }

  computeGlobalYRange(chartType, viewKey) {
    const locations = getLocationsInOrder();
    let min = Infinity;
    let max = -Infinity;
    let totalCount = 0;

    locations.forEach((location) => {
      const stats = location.calculations.axisStats && location.calculations.axisStats[chartType];
      if (!stats || stats.key !== viewKey) {
        return;
      }
      if (!Number.isFinite(stats.min) || !Number.isFinite(stats.max)) {
        return;
      }
      min = Math.min(min, stats.min);
      max = Math.max(max, stats.max);
      totalCount += stats.count || 0;
    });

    if (!Number.isFinite(min) || !Number.isFinite(max) || totalCount === 0) {
      return null;
    }
    const numericMin = Number(min);
    const numericMax = Number(max);
    const roundedMin = Math.floor(numericMin / 10) * 10;
    const roundedMax = Math.ceil(numericMax / 10) * 10;
    console.log("[axis-sync]", chartType, "globalMin", roundedMin, "globalMax", roundedMax, "nValues", totalCount);
    return { min: roundedMin, max: roundedMax };
  }
}
