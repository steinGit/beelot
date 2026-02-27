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
import { plotComparisonData } from './charts.js';
import { calculateGTS } from './logic.js';
import { fetchHistoricalData, fetchRecentData, isOpenMeteoError } from './dataService.js';
import { formatDateLocal, formatDayMonth } from './utils.js';
import { getNextTabTarget } from './locationTabNavigation.js';
import { createTooltipGate } from './tooltipFrequency.js';
import { shouldSwitchLocation } from './locationSwitching.js';
import {
  buildAddressQueries,
  buildCanonicalAddressFromResult,
  collectSettlementCandidates,
  getCountryCodeForCountryName,
  normalizeAddressFormData,
  pickBestSearchResult
} from './addressNormalization.js';
import {
  createLocationEntry,
  createWeatherCacheStore,
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
let ergebnisTextEl = null;
// Also track the multi-year toggle
let gtsYearRange = 1;
let gtsRange20Active = false;
let gtsColorScheme = "queen";
let standortSyncEnabled = false;
let lastNarrowLayout = null;
let comparisonActive = false;
let offlineStatusActive = false;
const STANDORT_SYNC_KEY = "beelotStandortSync";
const STANDORT_SYNC_CONTROL_ID = "standort-sync-control";
const REGULAR_GTS_RANGES = new Set([1, 5, 10]);
const GTS_RANGE_20 = 20;
const COMPARISON_COLORS = ["red", "orange", "gold", "green", "cyan", "blue", "magenta"];
const OFFLINE_TEXT = "Offline-Modus: Für diese Funktion ist eine Internetverbindung erforderlich.";
const ADDRESS_SUGGESTION_KEY = "beelotAddressSuggestion";
const DEFAULT_ADDRESS_ZOOM = 12;
const DEFAULT_ADDRESS_VIEWPORT_METERS = 1000;
const ADDRESS_DEBUG_ENABLED = true;

function logAddressDebug(message, payload = null) {
  if (!ADDRESS_DEBUG_ENABLED) {
    return;
  }
  if (!Array.isArray(window.__beelotAddressDebug)) {
    window.__beelotAddressDebug = [];
  }
  const entry = {
    timestamp: new Date().toISOString(),
    message,
    payload
  };
  window.__beelotAddressDebug.push(entry);
  if (window.__beelotAddressDebug.length > 300) {
    window.__beelotAddressDebug.splice(0, window.__beelotAddressDebug.length - 300);
  }
  if (payload === null) {
    console.log(`[DEBUG address] ${message}`);
    return;
  }
  console.log(`[DEBUG address] ${message}`, payload);
}

function loadAddressSuggestion() {
  try {
    const stored = localStorage.getItem(ADDRESS_SUGGESTION_KEY);
    if (!stored) {
      return normalizeAddressFormData();
    }
    return normalizeAddressFormData(JSON.parse(stored));
  } catch (error) {
    return normalizeAddressFormData();
  }
}

function persistAddressSuggestion(addressData) {
  try {
    localStorage.setItem(ADDRESS_SUGGESTION_KEY, JSON.stringify(normalizeAddressFormData(addressData)));
  } catch (error) {
    console.warn("[address] Failed to persist address suggestion.", error);
  }
}

function getSuggestedAddressForActiveLocation() {
  const location = getActiveLocation();
  const fallback = loadAddressSuggestion();
  if (!location || !location.ui || !location.ui.address) {
    return fallback;
  }
  const perLocation = normalizeAddressFormData(location.ui.address);
  const hasLocationAddress = Boolean(perLocation.street || perLocation.city || perLocation.country);
  if (!hasLocationAddress || (perLocation.country === "Deutschland" && !perLocation.street && !perLocation.city)) {
    return fallback;
  }
  return perLocation;
}

async function geocodeAddress({ street, city, country }) {
  const normalized = normalizeAddressFormData({ street, city, country });
  if (!normalized.city) {
    throw new Error("Bitte gib mindestens einen Ort an.");
  }
  logAddressDebug("geocodeAddress start", { normalized });

  const queries = buildAddressQueries(normalized);
  const requireSettlement = !normalized.street;
  const countryCode = getCountryCodeForCountryName(normalized.country);
  logAddressDebug("address queries generated", {
    requireSettlement,
    countryCode,
    queries
  });
  let first = null;
  let ambiguity = null;

  const fetchNominatimForQuery = async (query, cityForStructuredQuery = null) => {
    const params = new URLSearchParams({
      q: query,
      format: "jsonv2",
      limit: requireSettlement ? "8" : "1",
      addressdetails: "1",
      email: "info.beelot@gmail.com"
    });
    if (countryCode) {
      params.set("countrycodes", countryCode);
    }
    if (requireSettlement && cityForStructuredQuery) {
      params.delete("q");
      params.set("city", cityForStructuredQuery);
      params.set("country", normalized.country);
    }

    const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
      headers: {
        "Accept-Language": "de"
      }
    });

    if (!response.ok) {
      throw new Error(`Adresse konnte nicht aufgelöst werden (${response.status}).`);
    }

    const results = await response.json();
    logAddressDebug("nominatim response", {
      query,
      cityForStructuredQuery,
      count: Array.isArray(results) ? results.length : 0,
      sample: Array.isArray(results)
        ? results.slice(0, 5).map((entry) => ({
          name: entry.name,
          display_name: entry.display_name,
          addresstype: entry.addresstype,
          type: entry.type,
          category: entry.category
        }))
        : []
    });
    return Array.isArray(results) ? results : [];
  };

  const levenshteinDistance = (left, right) => {
    const a = left.toLowerCase();
    const b = right.toLowerCase();
    const rows = a.length + 1;
    const cols = b.length + 1;
    const matrix = Array.from({ length: rows }, () => new Array(cols).fill(0));

    for (let i = 0; i < rows; i += 1) {
      matrix[i][0] = i;
    }
    for (let j = 0; j < cols; j += 1) {
      matrix[0][j] = j;
    }

    for (let i = 1; i < rows; i += 1) {
      for (let j = 1; j < cols; j += 1) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + cost
        );
      }
    }

    return matrix[rows - 1][cols - 1];
  };

  const fetchPhotonSettlementFallback = async () => {
    logAddressDebug("photon fallback start", {
      city: normalized.city,
      country: normalized.country,
      countryCode
    });
    const params = new URLSearchParams({
      q: `${normalized.city}, ${normalized.country}`,
      lang: "de",
      limit: "10"
    });
    const response = await fetch(`https://photon.komoot.io/api/?${params.toString()}`);
    if (!response.ok) {
      return null;
    }

    const payload = await response.json();
    const features = Array.isArray(payload?.features) ? payload.features : [];
    logAddressDebug("photon response", {
      featureCount: features.length,
      sample: features.slice(0, 10).map((feature) => ({
        name: feature?.properties?.name,
        type: feature?.properties?.type,
        country: feature?.properties?.country,
        countrycode: feature?.properties?.countrycode
      }))
    });
    if (features.length === 0) {
      return null;
    }

    const settlementTypes = new Set(["city", "town", "village", "municipality", "hamlet"]);
    const countryNeedle = normalized.country.toLowerCase();
    const settlementCandidates = features.filter((feature) => {
      const properties = feature?.properties || {};
      const type = typeof properties.type === "string" ? properties.type.toLowerCase() : "";
      if (!settlementTypes.has(type)) {
        return false;
      }
      const featureCountryCode = typeof properties.countrycode === "string"
        ? properties.countrycode.toLowerCase()
        : "";
      if (countryCode && featureCountryCode) {
        return featureCountryCode === countryCode;
      }
      const candidateCountry = typeof properties.country === "string"
        ? properties.country.toLowerCase()
        : "";
      return !countryNeedle || candidateCountry.includes(countryNeedle);
    });

    const pool = settlementCandidates.length > 0 ? settlementCandidates : features;
    let bestFeature = null;
    let bestScore = Number.POSITIVE_INFINITY;

    pool.forEach((feature) => {
      const name = typeof feature?.properties?.name === "string"
        ? feature.properties.name
        : "";
      if (!name) {
        return;
      }
      const score = levenshteinDistance(normalized.city, name);
      if (score < bestScore) {
        bestScore = score;
        bestFeature = feature;
      }
    });

    if (!bestFeature) {
      return null;
    }
    const coords = bestFeature?.geometry?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) {
      return null;
    }

    const lon = Number(coords[0]);
    const lat = Number(coords[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return null;
    }

    const candidateName = bestFeature?.properties?.name || normalized.city;
    const candidateCountry = bestFeature?.properties?.country || normalized.country;
    logAddressDebug("photon fallback selected", {
      candidateName,
      candidateCountry,
      lat,
      lon
    });
    return {
      lat,
      lon,
      source: "photon-fallback",
      label: candidateName,
      normalized: normalizeAddressFormData({
        street: normalized.street,
        city: candidateName,
        country: candidateCountry
      })
    };
  };

  for (let i = 0; i < queries.length; i += 1) {
    const query = queries[i];
    const queryCity = query.split(",")[0]?.trim() || normalized.city;
    const results = await fetchNominatimForQuery(query, queryCity);

    if (requireSettlement) {
      const settlementCandidates = collectSettlementCandidates(results, {
        ...normalized,
        city: queryCity
      });
      logAddressDebug("settlement candidates after filter", {
        query,
        queryCity,
        count: settlementCandidates.length,
        candidates: settlementCandidates.map((entry) => ({
          label: entry.label,
          city: entry.normalized?.city,
          country: entry.normalized?.country,
          lat: entry.lat,
          lon: entry.lon
        }))
      });
      if (i === 0 && settlementCandidates.length > 1) {
        ambiguity = settlementCandidates;
        logAddressDebug("ambiguous settlement results found", {
          query,
          options: settlementCandidates.map((entry) => entry.label)
        });
        break;
      }
      if (settlementCandidates.length === 1) {
        first = {
          lat: settlementCandidates[0].lat,
          lon: settlementCandidates[0].lon,
          source: "nominatim-settlement",
          label: settlementCandidates[0].label,
          normalized: settlementCandidates[0].normalized
        };
        logAddressDebug("single settlement candidate selected", {
          query,
          selected: settlementCandidates[0].label,
          lat: settlementCandidates[0].lat,
          lon: settlementCandidates[0].lon
        });
        break;
      }
      continue;
    }

    const candidate = pickBestSearchResult(results, false);
    if (candidate) {
      first = candidate;
      logAddressDebug("direct nominatim candidate selected", {
        query,
        candidate: {
          name: candidate.name,
          display_name: candidate.display_name,
          addresstype: candidate.addresstype,
          type: candidate.type,
          category: candidate.category,
          lat: candidate.lat,
          lon: candidate.lon
        }
      });
      break;
    }
  }

  if (ambiguity) {
    logAddressDebug("returning ambiguity to UI", {
      options: ambiguity.map((entry) => entry.label)
    });
    return { ambiguous: ambiguity, normalized };
  }

  if (!first && requireSettlement) {
    const photonFallback = await fetchPhotonSettlementFallback();
    if (photonFallback) {
      return photonFallback;
    }
  }

  if (!first) {
    logAddressDebug("no candidate found after all strategies");
    throw new Error("Keine GPS-Koordinaten für diese Adresse gefunden.");
  }

  if (typeof first.lat === "number" && typeof first.lon === "number" && first.normalized) {
    logAddressDebug("resolved from structured object", {
      source: first.source || "unknown",
      lat: first.lat,
      lon: first.lon,
      normalized: first.normalized
    });
    return first;
  }

  const lat = parseFloat(first.lat);
  const lon = parseFloat(first.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error("Ungültige GPS-Daten von der Geocoding-Quelle.");
  }

  const canonical = buildCanonicalAddressFromResult(first, normalized);
  logAddressDebug("resolved from nominatim raw result", {
    lat,
    lon,
    canonical,
    raw: {
      name: first.name,
      display_name: first.display_name,
      addresstype: first.addresstype,
      type: first.type,
      category: first.category
    }
  });
  return { lat, lon, normalized: canonical };
}

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

function updateAllLocationsUiState(partial) {
  getLocationsInOrder().forEach((location) => {
    updateLocation(location.id, (current) => {
      current.ui = {
        ...current.ui,
        ...partial,
        map: {
          ...current.ui.map,
          ...(partial.map || {})
        }
      };
    });
  });
}

function showOfflineStatusMessage() {
  offlineStatusActive = true;
  const ergebnisTextEl = document.getElementById("ergebnis-text");
  if (ergebnisTextEl) {
    ergebnisTextEl.innerHTML = `<span style="color: #b00000;">${OFFLINE_TEXT}</span>`;
  }
  const ergebnisSection = document.querySelector(".ergebnis-section");
  if (ergebnisSection && comparisonActive) {
    ergebnisSection.style.display = "";
  }
}

function clearOfflineStatusMessage() {
  if (!offlineStatusActive) {
    return;
  }
  offlineStatusActive = false;
  const ergebnisSection = document.querySelector(".ergebnis-section");
  if (ergebnisSection && comparisonActive) {
    ergebnisSection.style.display = "none";
  }
}

function setComparisonMode(enabled) {
  const sections = [
    document.querySelector(".eingabe-section"),
    document.querySelector(".ergebnis-section"),
    document.querySelector(".hinweis-section")
  ];
  sections.forEach((section) => {
    if (!section) {
      return;
    }
    if (section.classList.contains("ergebnis-section")) {
      section.style.display = enabled && !offlineStatusActive ? "none" : "";
      return;
    }
    section.style.display = enabled ? "none" : "";
  });

  const tempToggle = document.getElementById("toggle-temp-plot");
  if (tempToggle) {
    tempToggle.style.display = enabled ? "none" : "";
  }

  if (tempPlotContainer) {
    tempPlotContainer.style.display = enabled ? "none" : "";
    tempPlotContainer.classList.toggle("visible", !enabled && tempPlotContainer.classList.contains("visible"));
  }

  const gtsRangeFieldset = document.querySelector(".gts-range-group");
  if (gtsRangeFieldset) {
    gtsRangeFieldset.style.display = enabled ? "none" : "";
  }

  const gtsColorFieldset = document.querySelector(".gts-color-group");
  if (gtsColorFieldset) {
    gtsColorFieldset.style.display = enabled ? "none" : "";
  }

  const legendLabel = document.getElementById("legend-location-label");
  if (legendLabel) {
    legendLabel.style.display = enabled ? "none" : "";
  }

  if (toggleGtsPlotBtn) {
    toggleGtsPlotBtn.style.display = enabled ? "none" : "";
  }
  if (gtsPlotContainer) {
    gtsPlotContainer.classList.toggle("visible", enabled || gtsPlotContainer.classList.contains("visible"));
  }
}

function parseDateInput(value) {
  if (!value) {
    return null;
  }
  const parts = value.split("-");
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

function computeStartDateFromSelection(endDate, selection) {
  const startDate = new Date(endDate);
  if (selection === "7") {
    startDate.setDate(endDate.getDate() - 7 + 1);
  } else if (selection === "14") {
    startDate.setDate(endDate.getDate() - 14 + 1);
  } else if (selection === "28") {
    startDate.setDate(endDate.getDate() - 28 + 1);
  } else {
    startDate.setMonth(0);
    startDate.setDate(1);
  }
  return startDate;
}

async function fetchAllDataForRange(lat, lon, fetchStartDate, endDate, recentStartDate, cacheStore) {
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
      cacheStore
    );
  } catch (error) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (endDate >= today) {
      histData = await fetchRecentData(
        lat,
        lon,
        fetchStartDate,
        endDate,
        cacheStore
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
        cacheStore
      );
      if (recentData && recentData.daily) {
        addToMap(recentData.daily.time, recentData.daily.temperature_2m_mean, false);
      }
    }
  }

  const allDates = Object.keys(dataByDate);
  const sortedDates = allDates.sort((a, b) => new Date(a) - new Date(b));
  const sortedTemps = sortedDates.map(d => dataByDate[d]);
  return { allDates: sortedDates, allTemps: sortedTemps };
}

async function buildComparisonSeriesForLocation(location, endDate, selection, updateStore = false) {
  if (!location || !location.coordinates) {
    return null;
  }
  const plotStartDate = computeStartDateFromSelection(endDate, selection);
  const fetchStartDate = new Date(endDate.getFullYear(), 0, 1, 0, 0, 0, 0);
  let recentStartDate;
  if (endDate.getTime() - fetchStartDate.getTime() <= 30 * 86400000) {
    recentStartDate = new Date(fetchStartDate);
  } else {
    recentStartDate = new Date(endDate);
    recentStartDate.setDate(recentStartDate.getDate() - 30);
  }

  const cacheStore = createWeatherCacheStore(location.id);
  const { allDates, allTemps } = await fetchAllDataForRange(
    location.coordinates.lat,
    location.coordinates.lon,
    fetchStartDate,
    endDate,
    recentStartDate,
    cacheStore
  );

  if (!allDates.length) {
    return null;
  }

  const gtsResults = calculateGTS(allDates, allTemps);
  const endOfDay = new Date(endDate);
  endOfDay.setHours(23, 59, 59, 999);
  const filteredResults = gtsResults.filter((entry) => {
    const d = new Date(entry.date);
    return d >= plotStartDate && d <= endOfDay;
  });
  if (filteredResults.length === 0) {
    return null;
  }

  if (updateStore) {
    updateLocation(location.id, (current) => {
      current.calculations.gtsResults = gtsResults;
      current.calculations.filteredResults = filteredResults;
      current.calculations.lastGtsKey = `${formatDateLocal(endDate)}|${selection}`;
    });
  }

  return {
    locationId: location.id,
    label: location.name,
    labels: filteredResults.map((entry) => formatDayMonth(entry.date)),
    values: filteredResults.map((entry) => entry.gts)
  };
}

async function renderComparisonPlot() {
  if (!comparisonActive) {
    return;
  }
  try {
    const endDate = parseDateInput(datumInput.value);
    if (!(endDate instanceof Date)) {
      return;
    }
    const selection = zeitraumSelect.value;
    const locations = getLocationsInOrder();
    const seriesResults = await Promise.all(
      locations.map((location) => buildComparisonSeriesForLocation(location, endDate, selection, true))
    );

    const normalized = seriesResults.filter(Boolean);
    if (normalized.length === 0) {
      return;
    }

    const colorByLocation = new Map();
    locations.forEach((location, index) => {
      colorByLocation.set(location.id, COMPARISON_COLORS[index % COMPARISON_COLORS.length]);
    });

    const masterLabels = normalized[0].labels;
    const masterLabelIndex = new Map(masterLabels.map((label, idx) => [label, idx]));
    const series = normalized.map((entry) => {
      const values = new Array(masterLabels.length).fill(null);
      entry.labels.forEach((label, idx) => {
        const masterIndex = masterLabelIndex.get(label);
        if (masterIndex === undefined) {
          return;
        }
        values[masterIndex] = entry.values[idx];
      });
      return {
        label: entry.label,
        values,
        color: colorByLocation.get(entry.locationId) || COMPARISON_COLORS[0]
      };
    });

    plotComparisonData(masterLabels, series, null);
    clearOfflineStatusMessage();
  } catch (error) {
    if (isOpenMeteoError(error)) {
      showOfflineStatusMessage();
      return;
    }
    console.error("[comparison] Failed to build comparison plot.", error);
  }
}

async function refreshAllLocationCalculations() {
  const endDate = parseDateInput(datumInput.value);
  if (!(endDate instanceof Date)) {
    return;
  }
  const selection = zeitraumSelect.value;
  const key = `${formatDateLocal(endDate)}|${selection}`;
  const locations = getLocationsInOrder();
  try {
    await Promise.all(
      locations.map(async (location) => {
        if (!location.coordinates) {
          return;
        }
        if (location.calculations && location.calculations.lastGtsKey === key) {
          return;
        }
        await buildComparisonSeriesForLocation(location, endDate, selection, true);
      })
    );
    clearOfflineStatusMessage();
  } catch (error) {
    if (isOpenMeteoError(error)) {
      showOfflineStatusMessage();
      return;
    }
    console.error("[gts-refresh] Failed to refresh location data.", error);
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
  if (comparisonActive) {
    legendLabel.textContent = "";
    legendLabel.style.display = "none";
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

function activateComparisonTab() {
  if (comparisonActive) {
    return;
  }
  comparisonActive = true;
  const activeLocation = getActiveLocation();
  if (activeLocation) {
    applyLocationState(activeLocation);
  }
  setComparisonMode(true);
  renderLocationTabs();
  if (locationPanel) {
    locationPanel.setAttribute("aria-labelledby", "location-tab-compare");
  }
  renderComparisonPlot();
}

function renderLocationTabs() {
  if (!locationTabsContainer) {
    return;
  }
  locationTabsContainer.innerHTML = "";

  const locations = getLocationsInOrder();
  const activeId = getActiveLocationId();

  if (locations.length < 2 && comparisonActive) {
    comparisonActive = false;
    setComparisonMode(false);
  }

  locations.forEach((location) => {
    const tab = document.createElement("button");
    tab.type = "button";
    const isActiveLocation = !comparisonActive && location.id === activeId;
    tab.className = `location-tab${isActiveLocation ? " active" : ""}`;
    tab.dataset.locationId = location.id;
    tab.role = "tab";
    tab.id = `location-tab-${location.id}`;
    tab.setAttribute("aria-selected", isActiveLocation ? "true" : "false");
    tab.setAttribute("tabindex", isActiveLocation ? "0" : "-1");
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

  if (locations.length >= 2) {
    const compareTab = document.createElement("button");
    compareTab.type = "button";
    compareTab.className = `location-tab location-tab-compare${comparisonActive ? " active" : ""}`;
    compareTab.role = "tab";
    compareTab.id = "location-tab-compare";
    compareTab.setAttribute("aria-selected", comparisonActive ? "true" : "false");
    compareTab.setAttribute("tabindex", comparisonActive ? "0" : "-1");
    compareTab.setAttribute("aria-controls", "location-panel");
    compareTab.dataset.tooltipText = "Vergleichsansicht";

    const compareLabel = document.createElement("span");
    compareLabel.className = "location-name location-name-compare";
    compareLabel.textContent = "Vergleich";
    compareTab.appendChild(compareLabel);
    compareTab.addEventListener("click", () => {
      activateComparisonTab();
    });

    locationTabsContainer.appendChild(compareTab);
  }

  const legendLabel = document.getElementById("legend-location-label");
  if (legendLabel) {
    updateLegendLocationLabel();
  }

  updateStandortSyncVisibility();
}

function switchLocation(locationId) {
  if (!shouldSwitchLocation({
    currentId: getActiveLocationId(),
    targetId: locationId,
    comparisonActive
  })) {
    return;
  }
  if (comparisonActive) {
    comparisonActive = false;
    setComparisonMode(false);
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
  ergebnisTextEl = document.getElementById('ergebnis-text');
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
    !locationPanel ||
    !ergebnisTextEl
  ) {
    return;
  }

  // 1) Build a new PlotUpdater
  const activeLocationId = getActiveLocationId();
  plotUpdater = new PlotUpdater({
    locationId: activeLocationId,
    ortInput,
    datumInput,
    zeitraumSelect,
    ergebnisTextEl,
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
  if (getLocationsInOrder().length > 1) {
    refreshAllLocationCalculations();
  }

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
        if (getLocationsInOrder().length > 1) {
          refreshAllLocationCalculations();
        }
      }
      if (comparisonActive) {
        renderComparisonPlot();
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
  const tabTooltipGate = createTooltipGate({
    key: "beelotTabTooltipCount",
    every: 10,
    storage: window.localStorage
  });
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
    if (!tabTooltipGate.shouldShow()) {
      return;
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
    if (getLocationsInOrder().length > 1) {
      refreshAllLocationCalculations();
    }
  });

  zeitraumSelect.addEventListener('change', () => {
    if (comparisonActive) {
      updateAllLocationsUiState({ zeitraum: zeitraumSelect.value });
      renderComparisonPlot();
      return;
    }
    updateActiveLocationUiState({ zeitraum: zeitraumSelect.value });
    plotUpdater.run();
    if (getLocationsInOrder().length > 1) {
      refreshAllLocationCalculations();
    }
  });

  datumInput.addEventListener('change', () => {
    updateZeitraumSelect();
    if (comparisonActive) {
      updateAllLocationsUiState({
        selectedDate: datumInput.value,
        zeitraum: zeitraumSelect.value
      });
      renderComparisonPlot();
      return;
    }
    updateActiveLocationUiState({
      selectedDate: datumInput.value,
      zeitraum: zeitraumSelect.value
    });
    plotUpdater.run();
    if (getLocationsInOrder().length > 1) {
      refreshAllLocationCalculations();
    }
  });

  berechnenBtn.addEventListener('click', () => {
    plotUpdater.run();
    if (getLocationsInOrder().length > 1) {
      refreshAllLocationCalculations();
    }
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
    if (comparisonActive) {
      updateAllLocationsUiState({
        selectedDate: datumInput.value,
        zeitraum: zeitraumSelect.value
      });
      renderComparisonPlot();
      return;
    }
    updateActiveLocationUiState({
      selectedDate: datumInput.value,
      zeitraum: zeitraumSelect.value
    });
    plotUpdater.run();
    if (getLocationsInOrder().length > 1) {
      refreshAllLocationCalculations();
    }
  });

  datumMinusBtn.addEventListener('click', () => {
    const current = new Date(datumInput.value);
    current.setDate(current.getDate() - 1);
    datumInput.value = current.toISOString().split('T')[0];
    updateZeitraumSelect();
    if (comparisonActive) {
      updateAllLocationsUiState({
        selectedDate: datumInput.value,
        zeitraum: zeitraumSelect.value
      });
      renderComparisonPlot();
      return;
    }
    updateActiveLocationUiState({
      selectedDate: datumInput.value,
      zeitraum: zeitraumSelect.value
    });
    plotUpdater.run();
    if (getLocationsInOrder().length > 1) {
      refreshAllLocationCalculations();
    }
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
      const offset = event.key === "ArrowLeft" ? -1 : 1;
      const target = getNextTabTarget({
        locations,
        activeLocationId: getActiveLocationId(),
        comparisonActive,
        offset
      });
      if (!target) {
        return;
      }
      if (target.type === "compare") {
        activateComparisonTab();
        return;
      }
      switchLocation(target.id);
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
    if (comparisonActive) {
      updateAllLocationsUiState({
        selectedDate: datumInput.value,
        zeitraum: zeitraumSelect.value
      });
      renderComparisonPlot();
      return;
    }
    updateActiveLocationUiState({
      selectedDate: datumInput.value,
      zeitraum: zeitraumSelect.value
    });
    plotUpdater.run();
    if (getLocationsInOrder().length > 1) {
      refreshAllLocationCalculations();
    }
  });

  ergebnisTextEl.addEventListener('click', (event) => {
    const target = event.target;
    if (target && target.id === "ergebnis-heute") {
      datumHeuteBtn.click();
    }
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
    const activeLocation = getActiveLocation();
    logAddressDebug("open map requested", {
      activeLocationId: activeLocation?.id,
      coordinates: activeLocation?.coordinates || null,
      mapState: activeLocation?.ui?.map || null
    });
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

  const addressInputBtn = document.getElementById("adresse-eingeben-btn");
  const addressPopup = document.getElementById("address-popup");
  const addressStreetInput = document.getElementById("address-strasse");
  const addressCityInput = document.getElementById("address-ort");
  const addressCountryInput = document.getElementById("address-land");
  const addressApplyBtn = document.getElementById("address-apply-btn");
  const addressCloseBtn = document.getElementById("address-close-btn");
  const addressStatus = document.getElementById("address-status");
  const addressChoiceBlock = document.getElementById("address-choice-block");
  const addressChoiceSelect = document.getElementById("address-choice-select");
  const addressChoiceApplyBtn = document.getElementById("address-choice-apply-btn");
  let pendingAddressChoices = [];
  let lastAddressPopupFocusTarget = null;

  if (
    addressInputBtn
    && addressPopup
    && addressStreetInput
    && addressCityInput
    && addressCountryInput
    && addressApplyBtn
    && addressCloseBtn
    && addressStatus
    && addressChoiceBlock
    && addressChoiceSelect
    && addressChoiceApplyBtn
  ) {
    addressPopup.setAttribute("inert", "");

    const setAddressStatus = (message, isError = false) => {
      addressStatus.textContent = message;
      addressStatus.style.color = isError ? "#802020" : "#206020";
    };

    const hideChoiceBlock = () => {
      pendingAddressChoices = [];
      addressChoiceSelect.innerHTML = "";
      addressChoiceBlock.style.display = "none";
    };

    const applyResolvedAddress = async (resolved, userInput) => {
      const { lat, lon, normalized } = resolved;
      logAddressDebug("applyResolvedAddress", {
        resolved,
        userInput: normalizeAddressFormData(userInput)
      });
      if (resolved && typeof resolved.label === "string" && resolved.label.trim()) {
        setAddressStatus(`Ausgewählt: ${resolved.label}`);
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      persistAddressSuggestion(normalized);

      const activeId = getActiveLocationId();
      if (activeId) {
        updateLocation(activeId, (location) => {
          location.coordinates = { lat, lon };
          location.ui.address = { ...normalized };
          location.ui.map.lastPos = `${lat},${lon}`;
          location.ui.map.lastZoom = DEFAULT_ADDRESS_ZOOM;
          location.ui.map.addressViewportMeters = DEFAULT_ADDRESS_VIEWPORT_METERS;
        });
      }

      ortInput.value = formatCoordinates(lat, lon);
      toggleCoordinatesLine();

      const typedCity = normalizeAddressFormData(userInput).city.toLowerCase();
      const resolvedCity = (normalized.city || "").toLowerCase();
      if (typedCity && resolvedCity && typedCity !== resolvedCity) {
        setAddressStatus(`Meintest du ${normalized.city}? Übernehme diesen Ort.`);
        await new Promise((resolve) => setTimeout(resolve, 900));
      }

      closeAddressPopup();
      plotUpdater.run();
      if (getLocationsInOrder().length > 1) {
        refreshAllLocationCalculations();
      }
    };

    const showAmbiguityChoices = (choices) => {
      const sortedChoices = [...choices].sort((left, right) =>
        String(left.label || "").localeCompare(String(right.label || ""), "de")
      );
      pendingAddressChoices = sortedChoices;
      logAddressDebug("showAmbiguityChoices", {
        count: sortedChoices.length,
        labels: sortedChoices.map((entry) => entry.label)
      });
      addressChoiceSelect.innerHTML = "";
      sortedChoices.forEach((choice, index) => {
        const option = document.createElement("option");
        option.value = String(index);
        option.textContent = choice.label;
        addressChoiceSelect.appendChild(option);
      });
      addressChoiceSelect.selectedIndex = -1;
      addressChoiceBlock.style.display = "grid";
      setAddressStatus("Mehrere Orte gefunden. Bitte wähle den passenden Ort aus.");
    };

    const fillAddressForm = (addressData) => {
      const normalized = normalizeAddressFormData(addressData);
      addressStreetInput.value = normalized.street;
      addressCityInput.value = normalized.city;
      addressCountryInput.value = normalized.country;
    };

    const openAddressPopup = () => {
      lastAddressPopupFocusTarget = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : addressInputBtn;
      fillAddressForm(getSuggestedAddressForActiveLocation());
      setAddressStatus("");
      hideChoiceBlock();
      addressPopup.removeAttribute("inert");
      addressPopup.classList.add("visible");
      addressPopup.setAttribute("aria-hidden", "false");
      addressCityInput.focus();
    };

    const closeAddressPopup = () => {
      const activeElement = document.activeElement;
      if (activeElement instanceof HTMLElement && addressPopup.contains(activeElement)) {
        const fallbackTarget = lastAddressPopupFocusTarget instanceof HTMLElement
          ? lastAddressPopupFocusTarget
          : addressInputBtn;
        fallbackTarget.focus();
      }
      addressPopup.classList.remove("visible");
      addressPopup.setAttribute("aria-hidden", "true");
      addressPopup.setAttribute("inert", "");
      setAddressStatus("");
      hideChoiceBlock();
      lastAddressPopupFocusTarget = null;
    };

    const applyAddressSelection = async () => {
      const inputData = {
        street: addressStreetInput.value,
        city: addressCityInput.value,
        country: addressCountryInput.value
      };

      const normalized = normalizeAddressFormData(inputData);
      if (!normalized.city) {
        setAddressStatus("Bitte gib mindestens einen Ort an.", true);
        addressCityInput.focus();
        return;
      }

      setAddressStatus("Adresse wird aufgelöst ...");
      addressApplyBtn.disabled = true;
      hideChoiceBlock();

      try {
        const resolved = await geocodeAddress(normalized);
        if (resolved && Array.isArray(resolved.ambiguous) && resolved.ambiguous.length > 1) {
          showAmbiguityChoices(resolved.ambiguous);
          return;
        }
        await applyResolvedAddress(resolved, inputData);
      } catch (error) {
        setAddressStatus(error instanceof Error ? error.message : "Adresse konnte nicht verarbeitet werden.", true);
      } finally {
        addressApplyBtn.disabled = false;
      }
    };

    addressInputBtn.addEventListener("click", openAddressPopup);
    addressCloseBtn.addEventListener("click", closeAddressPopup);
    addressApplyBtn.addEventListener("click", applyAddressSelection);
    addressChoiceApplyBtn.addEventListener("click", async () => {
      const selectedIndex = parseInt(addressChoiceSelect.value, 10);
      if (!Number.isFinite(selectedIndex) || selectedIndex < 0) {
        setAddressStatus("Bitte einen Ort aus der Liste auswählen.", true);
        return;
      }
      const selected = pendingAddressChoices[selectedIndex];
      if (!selected || !Number.isFinite(selected.lat) || !Number.isFinite(selected.lon)) {
        setAddressStatus("Bitte zuerst einen Ort aus der Liste auswählen.", true);
        return;
      }
      logAddressDebug("ambiguity choice selected", {
        selectedIndex,
        selected
      });
      await applyResolvedAddress(selected, {
        street: addressStreetInput.value,
        city: addressCityInput.value,
        country: addressCountryInput.value
      });
    });

    [addressStreetInput, addressCityInput, addressCountryInput].forEach((input) => {
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          applyAddressSelection();
        }
      });
    });

    addressPopup.addEventListener("click", (event) => {
      if (event.target === addressPopup) {
        closeAddressPopup();
      }
    });
  }

}
