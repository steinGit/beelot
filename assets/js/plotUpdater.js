/**
 * @module plotUpdater
 * Responsible for orchestrating the steps to fetch, compute, and plot the data
 */

import { fetchHistoricalData, fetchRecentData } from './dataService.js';
import {
  calculateGTS,
  computeStartDate,
  getSelectedEndDate,
  build5YearData
} from './logic.js';
import {
  plotData,
  plotDailyTemps,
  plotMultipleYearData
} from './charts.js';
import { updateHinweisSection } from './information.js';

/**
 * Helper to forcibly destroy any leftover chart using a given canvas ID.
 * If no chart is associated, it just does nothing.
 */
function destroyIfCanvasInUse(canvasId) {
  const existingChart = Chart.getChart(canvasId);
  if (existingChart) {
    existingChart.destroy();
  }
}

export class PlotUpdater {
  constructor({
    ortInput,
    datumInput,
    zeitraumSelect,
    ergebnisTextEl,
    hinweisSection,
    gtsPlotContainer,
    tempPlotContainer,
    chartRefs = {}
  }) {
    this.ortInput = ortInput;
    this.datumInput = datumInput;
    this.zeitraumSelect = zeitraumSelect;
    this.ergebnisTextEl = ergebnisTextEl;
    this.hinweisSection = hinweisSection;
    this.gtsPlotContainer = gtsPlotContainer;
    this.tempPlotContainer = tempPlotContainer;

    // Chart.js object references
    this.chartGTS = chartRefs.chartGTS || null;
    this.chartTemp = chartRefs.chartTemp || null;

    // Arrays used to store daily temps in the [plotStart..endDate] window
    this.filteredTempsDates = [];
    this.filteredTempsData = [];
  }

  /**
   * Main entry point: orchestrates the entire plotting process.
   */
  async run() {
    try {
      // Step 1) Validate lat/lon input
      if (!this.step1CheckLatLon()) return;

      // Step 2) Create local "today noon"
      const localTodayNoon = this.step2CreateLocalTodayNoon();

      // Step 3) Get end date & ensure it's not in the future
      const endDate = this.step3GetEndDate(localTodayNoon);
      if (!endDate) return;

      // Step 4) Parse lat/lon
      const { lat, lon } = this.step4ParseLatLon();

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

    } catch (err) {
      console.log("[PlotUpdater] => Caught error:", err);
    }
  }

  // === Steps 1..16 below ===

  step1CheckLatLon() {
    const ortVal = this.ortInput.value || "";
    if (!ortVal.includes("Lat") || !ortVal.includes("Lon")) {
      this.ergebnisTextEl.textContent =
        "Die Grünland-Temperatur-Summe wird berechnet wenn ein Ort ausgewählt ist.";

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

  step2CreateLocalTodayNoon() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  }

  step3GetEndDate(localTodayNoon) {
    const endDate = getSelectedEndDate();
    if (endDate.getTime() > localTodayNoon.getTime()) {
      alert("Das Datum darf nicht in der Zukunft liegen.");
      const iso = localTodayNoon.toISOString().split("T")[0];
      this.datumInput.value = iso;
      this.datumInput.max = iso;
      return null;
    }
    return endDate;
  }

  step4ParseLatLon() {
    const ortVal = this.ortInput.value.trim();
    const parts = ortVal.split(",");
    const latPart = parts[0].split(":")[1];
    const lonPart = parts[1].split(":")[1];
    const lat = parseFloat(latPart.trim());
    const lon = parseFloat(lonPart.trim());
    return { lat, lon };
  }

  step5ComputeDateRange(endDate) {
    const today = new Date();
    const differenceInDays = Math.floor((today - endDate) / (1000 * 3600 * 24));
    const plotStartDate = computeStartDate();
    return { differenceInDays, plotStartDate };
  }

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

  async step7FetchAllData(lat, lon, fetchStartDate, endDate, recentStartDate, differenceInDays) {
    console.log("[PlotUpdater] step7FetchAllData() =>", fetchStartDate, "->", endDate);
    const histData = await fetchHistoricalData(lat, lon, fetchStartDate, endDate);

    const histDates = histData.daily.time;
    const histTemps = histData.daily.temperature_2m_mean;

    const dataByDate = {};
    if (differenceInDays > 10) {
      // Only historical
      for (let i = 0; i < histDates.length; i++) {
        dataByDate[histDates[i]] = histTemps[i];
      }
    } else {
      // Combine historical + recent
      const recentData = await fetchRecentData(lat, lon, recentStartDate, endDate);
      const recentDates = recentData.daily.time;
      const recentTemps = recentData.daily.temperature_2m_mean;

      for (let i = 0; i < histDates.length; i++) {
        dataByDate[histDates[i]] = histTemps[i];
      }
      for (let i = 0; i < recentDates.length; i++) {
        dataByDate[recentDates[i]] = recentTemps[i];
      }
    }

    const allDates = Object.keys(dataByDate).sort((a, b) => new Date(a) - new Date(b));
    const allTemps = allDates.map(d => dataByDate[d]);

    if (allTemps.length === 0) {
      alert("Keine Daten gefunden. Anderen Ort oder anderes Datum wählen.");
    }

    return { allDates, allTemps };
  }

  step8CalculateGTS(allDates, allTemps) {
    return calculateGTS(allDates, allTemps);
  }

  step9FilterGTS(gtsResults, plotStartDate, endDate) {
    return gtsResults.filter(r => {
      const d = new Date(r.date);
      return d >= plotStartDate && d <= endDate;
    });
  }

  step10CheckIfEmpty(filteredResults, endDate) {
    if (filteredResults.length === 0) {
      const formattedDate = endDate.toLocaleDateString("de-DE");
      this.ergebnisTextEl.innerHTML = `
        <span style="color: #700000;">
          Die Grünland-Temperatur-Summe konnte am ${formattedDate} nicht berechnet werden,
          da für eine "Summe" noch keine Daten zur Verfügung stehen 😉.
        </span>
      `;
      console.log("[PlotUpdater] => No data to sum. Returning early.");

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

  step11FilterDailyTemps(allDates, allTemps, plotStartDate, endDate) {
    this.filteredTempsDates = [];
    this.filteredTempsData = [];
    for (let i = 0; i < allDates.length; i++) {
      const d = new Date(allDates[i]);
      if (d >= plotStartDate && d <= endDate) {
        this.filteredTempsDates.push(allDates[i]);
        this.filteredTempsData.push(allTemps[i]);
      }
    }
  }

  step12UpdateErgebnisText(gtsResults, endDate) {
    const formattedDate = endDate.toLocaleDateString("de-DE");
    const localTodayStr = new Date().toLocaleDateString("de-DE");
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
      <span style="font-weight: normal; color: #202020;">Die Grünland-Temperatur-Summe am </span>
      <span style="font-weight: ${dateWeight}; color: ${dateColor};">${formattedDate}</span>
      <span style="font-weight: normal; color: #202020;"> ${betragenStr} </span>
      <span style="font-weight: bold; color: darkgreen;">${lastGTS.toFixed(1)}</span>°
    `;
  }

  step13DestroyOldCharts() {
    // forcibly destroy leftover charts
    destroyIfCanvasInUse("plot-canvas");
    destroyIfCanvasInUse("temp-plot");

    if (this.chartGTS) {
      this.chartGTS = null;
    }
    if (this.chartTemp) {
      this.chartTemp = null;
    }
  }

  async step14CreateGTSChart(lat, lon, plotStartDate, endDate, filteredResults) {
    if (this.gtsPlotContainer.style.display === "none") {
      console.log("[PlotUpdater] => GTS container hidden => skipping chart creation.");
      return;
    }

    if (window.showFiveYear) {
      console.log("[PlotUpdater] => multi-year overlay chart...");
      const multiYearData = await build5YearData(lat, lon, plotStartDate, endDate, filteredResults);
      this.chartGTS = plotMultipleYearData(multiYearData);
    } else {
      console.log("[PlotUpdater] => single-year chart...");
      this.chartGTS = plotData(filteredResults);
    }
  }

  step15CreateTemperatureChart() {
    if (this.tempPlotContainer.style.display === "none") {
      console.log("[PlotUpdater] => tempPlotContainer hidden => skipping temp chart.");
      return;
    }
    this.chartTemp = plotDailyTemps(this.filteredTempsDates, this.filteredTempsData, false);
  }

  async step16UpdateHinweisSection(gtsResults, endDate) {
    await updateHinweisSection(gtsResults, endDate);
  }
}
