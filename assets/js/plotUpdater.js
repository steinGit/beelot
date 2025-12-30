// FILE: /home/fridtjofstein/privat/beelot/assets/js/plotUpdater.js

/**
 * @module plotUpdater
 * Responsible for orchestrating the steps to fetch, compute, and plot the data
 */

import { plotData, plotDailyTemps, plotMultipleYearData } from './charts.js';
import { fetchHistoricalData, fetchRecentData } from './dataService.js';
import {
  calculateGTS,
  computeStartDate,
  getSelectedEndDate,
  build5YearData,
  computeDateRange
} from './logic.js';
import { updateHinweisSection } from './information.js';
import { formatDateLocal, isValidDate } from './utils.js';
import { LocationNameFromGPS } from './location_name_from_gps.js'; // Import the new class
import {
  createLocationNameCacheStore,
  createWeatherCacheStore,
  getLocationById,
  updateLocation
} from './locationStore.js';

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

      // Fetch and display location name
      this.step4aFetchAndDisplayLocationName(lat, lon);

      // Step 5) Date range logic
      const { differenceInDays, plotStartDate } = this.step5ComputeDateRange(endDate);

      // Step 6) fetchStartDate & recentStartDate
      const { fetchStartDate, recentStartDate } = this.step6ComputeFetchDates(endDate);

      // Step 7) fetch data
      const { allDates, allTemps } = await this.step7FetchAllData(
        lat, lon, fetchStartDate, endDate, recentStartDate, differenceInDays
      );
      if (allDates.length === 0) return;

      // Step 8) GTS calculations
      const gtsResults = this.step8CalculateGTS(allDates, allTemps);
      // Step 9) Filter GTS to [plotStartDate..endDate]
      const filteredResults = this.step9FilterGTS(gtsResults, plotStartDate, endDate);

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

      // Step 15) Temp chart creation
      this.step15CreateTemperatureChart();

      // Step 16) Update hints
      await this.step16UpdateHinweisSection(gtsResults, endDate);

      updateLocation(this.locationId, (current) => {
        current.calculations.gtsResults = gtsResults;
        current.calculations.filteredResults = filteredResults;
        current.calculations.temps = {
          dates: [...this.filteredTempsDates],
          values: [...this.filteredTempsData]
        };
        if (this.hinweisSection) {
          current.calculations.hinweisHtml = this.hinweisSection.innerHTML;
        }
      });

    } catch (err) {
      console.log("[PlotUpdater] => Caught error:", err);
      this.ergebnisTextEl.textContent = "Ein Fehler ist aufgetreten. Bitte versuche es später erneut.";
      if (this.hinweisSection) {
        this.hinweisSection.innerHTML = `<h2>Imkerliche Information</h2>
          <p style="color: red;">Es ist ein Fehler aufgetreten: ${err.message}</p>`;
      }
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
    let allDates = [];
    let allTemps = [];

    if (differenceInDays > 10) {
      // Only historical
      const histData = await fetchHistoricalData(
        lat,
        lon,
        fetchStartDate,
        endDate,
        this.weatherCacheStore
      );
      if (histData && histData.daily) {
        allDates = histData.daily.time;
        allTemps = histData.daily.temperature_2m_mean;
      }
    } else {
      // Combine historical + recent
      const histEndDate = new Date(recentStartDate);
      histEndDate.setDate(histEndDate.getDate() - 1);
      let histData = null;
      if (histEndDate >= fetchStartDate) {
        histData = await fetchHistoricalData(
          lat,
          lon,
          fetchStartDate,
          histEndDate,
          this.weatherCacheStore
        );
      }
      const recentData = await fetchRecentData(
        lat,
        lon,
        recentStartDate,
        endDate,
        this.weatherCacheStore
      );

      if (histData && histData.daily) {
        allDates = allDates.concat(histData.daily.time);
        allTemps = allTemps.concat(histData.daily.temperature_2m_mean);
      }
      if (recentData && recentData.daily) {
        allDates = allDates.concat(recentData.daily.time);
        allTemps = allTemps.concat(recentData.daily.temperature_2m_mean);
      }
    }

    // Remove duplicates and sort
    const dataByDate = {};
    for (let i = 0; i < allDates.length; i++) {
      dataByDate[allDates[i]] = allTemps[i];
    }

    const sortedDates = Object.keys(dataByDate).sort((a, b) => new Date(a) - new Date(b));
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
    const formattedDate = formatDateLocal(endDate);
    const localTodayStr = formatDateLocal(new Date());
    const lastGTS = gtsResults.length
      ? gtsResults[gtsResults.length - 1].gts
      : 0;

    let dateColor = "#802020";
    let dateWeight = "bold";
    let betragenStr = "beträgt";

    if (formattedDate === localTodayStr) {
      dateColor = "#206020";
      betragenStr = "beträgt";
    } else {
      betragenStr = "betrug";
    }

    this.ergebnisTextEl.innerHTML = `
      <span style="font-weight: normal; color: #202020;">Die <a href="components/faq.html" class="unstyled-link">Grünland-Temperatur-Summe</a> am </span>
      <span style="font-weight: ${dateWeight}; color: ${dateColor};">${formattedDate}</span>
      <span style="font-weight: normal; color: #202020;"> ${betragenStr} </span>
      <span style="font-weight: bold; color: darkgreen;">${lastGTS.toFixed(1)}</span> °C
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
    if (this.gtsPlotContainer.style.display === "none") {
      console.log("[PlotUpdater] => GTS container hidden => skipping chart creation.");
      return;
    }

    if (window.showFiveYear) {
      const multiYearData = await build5YearData(
        lat,
        lon,
        plotStartDate,
        endDate,
        filteredResults,
        this.weatherCacheStore
      );
      this.chartGTS = plotMultipleYearData(multiYearData);
    } else {
      this.chartGTS = plotData(filteredResults);
    }
  }

  /**
   * Step 15: Create the Temperature chart.
   */
  step15CreateTemperatureChart() {
    if (this.tempPlotContainer.style.display === "none") {
      console.log("[PlotUpdater] => tempPlotContainer hidden => skipping temp chart.");
      return;
    }
    this.chartTemp = plotDailyTemps(this.filteredTempsDates, this.filteredTempsData, false);
  }

  /**
   * Step 16: Update the hints section with relevant information.
   * @param {Array<Object>} gtsResults - Array of GTS results.
   * @param {Date} endDate - End date for reference in messages.
   */
  async step16UpdateHinweisSection(gtsResults, endDate) {
    await updateHinweisSection(gtsResults, endDate);
  }
}
