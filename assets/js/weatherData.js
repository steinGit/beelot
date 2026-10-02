/**
 * @module weatherData
 * Provides the shared historical and forecast merge path used by all views.
 */

import {
  fetchHistoricalData,
  fetchRecentData,
  findFirstMissingTemperatureDate,
  mergeValidDailyTemperatures,
  OpenMeteoError
} from "./dataService.js";

/**
 * Fetch and merge valid temperatures for a date range.
 * Forecast values fill gaps without replacing valid historical measurements.
 * @param {number} lat - Latitude.
 * @param {number} lon - Longitude.
 * @param {Date} fetchStartDate - First historical date to request.
 * @param {Date} endDate - Last date to request.
 * @param {Date} recentStartDate - First date eligible for forecast repair.
 * @param {Object|null} cacheStore - Optional location-owned cache store.
 * @param {Date} today - Current local date, injectable for deterministic tests.
 * @returns {Promise<{allDates: string[], allTemps: number[]}>} Sorted merged data.
 */
export async function fetchMergedWeatherData(
  lat,
  lon,
  fetchStartDate,
  endDate,
  recentStartDate,
  cacheStore = null,
  today = new Date()
) {
  const dataByDate = {};
  let historicalData;

  try {
    historicalData = await fetchHistoricalData(
      lat,
      lon,
      fetchStartDate,
      endDate,
      cacheStore
    );
  } catch (error) {
    const localToday = new Date(today);
    localToday.setHours(0, 0, 0, 0);
    if (endDate < localToday) {
      throw error;
    }
    historicalData = await fetchRecentData(
      lat,
      lon,
      fetchStartDate,
      endDate,
      cacheStore
    );
  }

  const hasHistoricalTemperatures = historicalData?.daily?.time?.length > 0;
  if (hasHistoricalTemperatures) {
    mergeValidDailyTemperatures(dataByDate, historicalData, true);
  }

  const localToday = new Date(today);
  localToday.setHours(0, 0, 0, 0);
  const recentBoundary = new Date(localToday);
  recentBoundary.setDate(recentBoundary.getDate() - 10);
  const firstMissingDate = hasHistoricalTemperatures || endDate >= recentBoundary
    ? findFirstMissingTemperatureDate(dataByDate, recentStartDate, endDate)
    : null;

  if (firstMissingDate) {
    const recentData = await fetchRecentData(
      lat,
      lon,
      firstMissingDate,
      endDate,
      cacheStore
    );
    if (recentData?.daily) {
      mergeValidDailyTemperatures(dataByDate, recentData, false);
    }
  }

  const unresolvedDate = findFirstMissingTemperatureDate(dataByDate, fetchStartDate, endDate);
  if (unresolvedDate) {
    throw new OpenMeteoError(
      `Open-Meteo returned incomplete weather data from ${unresolvedDate.toISOString().slice(0, 10)}.`
    );
  }

  const allDates = Object.keys(dataByDate).sort((left, right) => left.localeCompare(right));
  return {
    allDates,
    allTemps: allDates.map((date) => dataByDate[date])
  };
}
