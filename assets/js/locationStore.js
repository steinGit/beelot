/**
 * @module locationStore
 * Manages persistent, per-location state and caches.
 */

const STORAGE_KEY = "beelotLocations";
const DEFAULT_NAME_PREFIX = "Standort";
const DEFAULT_MAX_NAME_LENGTH = 32; // TODO: Make configurable if needed.
const LOCATION_ID_PATTERN = /^loc-([1-9]\d*)$/;
const SAFE_RECORD_KEY_PATTERN = /^[A-Za-z0-9_.:|,+-]{1,256}$/;
const SUPPORTED_TIMEFRAMES = new Set(["ytd", "7", "14", "28"]);
const SUPPORTED_GTS_RANGES = new Set([1, 5, 10]);
const SUPPORTED_COLOR_SCHEMES = new Set(["queen", "turbo", "temperature"]);

function buildDefaultUiState() {
  return {
    selectedDate: "",
    zeitraum: "ytd",
    gtsYearRange: 1,
    gtsRange20Active: false,
    gtsColorScheme: "queen",
    gtsPlotVisible: false,
    tempPlotVisible: false,
    address: {
      street: "",
      city: "",
      country: "Deutschland"
    },
    map: {
      lastPos: null,
      lastZoom: null,
      addressViewportMeters: null
    }
  };
}

function buildDefaultCalculations() {
  return {
    gtsResults: null,
    filteredResults: null,
    temps: {
      dates: [],
      values: []
    },
    locationLabel: "",
    lastGtsKey: ""
  };
}

function buildDefaultCache() {
  return {
    weather: {},
    locationName: {}
  };
}

function createLocation(id, name) {
  return {
    id,
    name,
    coordinates: null,
    cache: buildDefaultCache(),
    calculations: buildDefaultCalculations(),
    ui: buildDefaultUiState()
  };
}

function buildDefaultState() {
  const id = "loc-1";
  return {
    version: 1,
    nextId: 2,
    order: [id],
    activeId: id,
    locations: {
      [id]: createLocation(id, `${DEFAULT_NAME_PREFIX} 1`)
    }
  };
}

export function normalizeCoordinates(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90) {
    return null;
  }
  let normalizedLon = lon;
  if (lon < -180 || lon > 180) {
    normalizedLon = ((lon + 180) % 360 + 360) % 360 - 180;
  }
  return { lat, lon: normalizedLon };
}

function coordinatesEqual(left, right) {
  if (!left || !right) {
    return left === right;
  }
  const epsilon = 1e-10;
  return Math.abs(left.lat - right.lat) < epsilon
    && Math.abs(left.lon - right.lon) < epsilon;
}

function parseLegacyCoordinates(coordString) {
  if (!coordString || typeof coordString !== "string") {
    return null;
  }
  if (!coordString.includes("Lat") || !coordString.includes("Lon")) {
    return null;
  }
  const parts = coordString.split(",");
  if (parts.length < 2) {
    return null;
  }
  const latPart = parts[0].split(":")[1];
  const lonPart = parts[1].split(":")[1];
  const lat = parseFloat((latPart || "").trim());
  const lon = parseFloat((lonPart || "").trim());
  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    return null;
  }
  return normalizeCoordinates(lat, lon);
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function sanitizeText(value, fallback = "", maxLength = 200) {
  return typeof value === "string" ? value.slice(0, maxLength) : fallback;
}

function isSafeRecordKey(key) {
  return SAFE_RECORD_KEY_PATTERN.test(key)
    && key !== "__proto__"
    && key !== "prototype"
    && key !== "constructor";
}

function copySafeRecord(value, valueIsValid = () => true) {
  if (!isRecord(value)) {
    return {};
  }
  return Object.fromEntries(Object.entries(value).filter(([key, entry]) => (
    isSafeRecordKey(key) && valueIsValid(entry)
  )));
}

function normalizeSelectedDate(value) {
  if (value === "") {
    return "";
  }
  if (typeof value !== "string") {
    return "";
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) {
    return "";
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
    ? value
    : "";
}

function normalizeMapState(value) {
  const map = isRecord(value) ? value : {};
  const positionParts = typeof map.lastPos === "string" ? map.lastPos.split(",") : [];
  const parsedPosition = positionParts.length === 2
    ? normalizeCoordinates(Number(positionParts[0]), Number(positionParts[1]))
    : null;
  const zoom = typeof map.lastZoom === "number"
    || (typeof map.lastZoom === "string" && map.lastZoom.trim())
    ? Number(map.lastZoom)
    : null;
  const viewport = typeof map.addressViewportMeters === "number"
    || (typeof map.addressViewportMeters === "string" && map.addressViewportMeters.trim())
    ? Number(map.addressViewportMeters)
    : null;
  return {
    lastPos: parsedPosition ? `${parsedPosition.lat},${parsedPosition.lon}` : null,
    lastZoom: Number.isFinite(zoom) && zoom >= 0 && zoom <= 24 ? zoom : null,
    addressViewportMeters: Number.isFinite(viewport) && viewport > 0 && viewport <= 10000000
      ? viewport
      : null
  };
}

function normalizeUiState(value) {
  const ui = isRecord(value) ? value : {};
  const defaults = buildDefaultUiState();
  const address = isRecord(ui.address) ? ui.address : {};
  const range = Number(ui.gtsYearRange);
  return {
    selectedDate: normalizeSelectedDate(ui.selectedDate),
    zeitraum: SUPPORTED_TIMEFRAMES.has(ui.zeitraum) ? ui.zeitraum : defaults.zeitraum,
    gtsYearRange: SUPPORTED_GTS_RANGES.has(range) ? range : defaults.gtsYearRange,
    gtsRange20Active: ui.gtsRange20Active === true,
    gtsColorScheme: SUPPORTED_COLOR_SCHEMES.has(ui.gtsColorScheme)
      ? ui.gtsColorScheme
      : defaults.gtsColorScheme,
    gtsPlotVisible: ui.gtsPlotVisible === true,
    tempPlotVisible: ui.tempPlotVisible === true,
    address: {
      street: sanitizeText(address.street),
      city: sanitizeText(address.city),
      country: sanitizeText(address.country, defaults.address.country).trim()
        || defaults.address.country
    },
    map: normalizeMapState(ui.map)
  };
}

function ensureLocationShape(location, id, fallbackName, retainCalculations = false) {
  const source = isRecord(location) ? location : {};
  const coordinates = isRecord(source.coordinates)
    ? normalizeCoordinates(source.coordinates.lat, source.coordinates.lon)
    : null;
  const cache = isRecord(source.cache) ? source.cache : {};
  let calculations = buildDefaultCalculations();
  if (retainCalculations && isRecord(source.calculations)) {
    calculations = source.calculations;
    delete calculations.hinweisHtml;
    calculations.temps = isRecord(calculations.temps)
      ? calculations.temps
      : { dates: [], values: [] };
    calculations.gtsYearCurves = isRecord(calculations.gtsYearCurves)
      ? calculations.gtsYearCurves
      : {};
  }
  return {
    id,
    name: sanitizeName(source.name, fallbackName),
    coordinates,
    cache: {
      weather: copySafeRecord(cache.weather, isRecord),
      locationName: copySafeRecord(cache.locationName, (entry) => typeof entry === "string")
    },
    calculations,
    ui: normalizeUiState(source.ui)
  };
}

function normalizeState(value) {
  if (!isRecord(value) || !Array.isArray(value.order) || !isRecord(value.locations)) {
    return buildDefaultState();
  }
  const order = [...new Set(value.order.filter((id) => (
    typeof id === "string" && LOCATION_ID_PATTERN.test(id)
  )))];
  if (order.length === 0) {
    return buildDefaultState();
  }
  const locations = {};
  order.forEach((id, index) => {
    locations[id] = ensureLocationShape(
      value.locations[id],
      id,
      `${DEFAULT_NAME_PREFIX} ${index + 1}`
    );
  });
  const highestId = Math.max(...order.map((id) => Number(LOCATION_ID_PATTERN.exec(id)[1])));
  const requestedNextId = Number(value.nextId);
  return {
    version: Number.isSafeInteger(value.version) && value.version > 0 ? value.version : 1,
    nextId: Number.isSafeInteger(requestedNextId) && requestedNextId > highestId
      ? requestedNextId
      : highestId + 1,
    order,
    activeId: Object.prototype.hasOwnProperty.call(locations, value.activeId)
      ? value.activeId
      : order[0],
    locations
  };
}

function loadState() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) {
    const state = buildDefaultState();
    const legacyCoords = parseLegacyCoordinates(localStorage.getItem("lastLocation"));
    if (legacyCoords) {
      state.locations[state.activeId].coordinates = legacyCoords;
    }
    const legacyPos = localStorage.getItem("lastPos");
    const legacyZoom = localStorage.getItem("lastZoom");
    if (legacyPos && legacyZoom) {
      state.locations[state.activeId].ui.map.lastPos = legacyPos;
      state.locations[state.activeId].ui.map.lastZoom = legacyZoom;
    }
    return state;
  }
  try {
    const parsed = JSON.parse(stored);
    return normalizeState(parsed);
  } catch (error) {
    console.warn("[locationStore] Failed to parse stored state. Resetting.", error);
    return buildDefaultState();
  }
}

let state = loadState();

function buildPersistableState() {
  const locations = {};
  state.order.forEach((id) => {
    const location = state.locations[id];
    if (location) {
      locations[id] = {
        ...location,
        calculations: buildDefaultCalculations()
      };
    }
  });
  return {
    ...state,
    locations
  };
}

function isQuotaExceededError(error) {
  return Boolean(error && (
    error.name === "QuotaExceededError"
    || error.code === 22
    || error.code === 1014
  ));
}

function evictOldestWeatherCacheEntry() {
  let oldest = null;
  state.order.forEach((id) => {
    const weather = state.locations[id]?.cache?.weather || {};
    Object.entries(weather).forEach(([key, value]) => {
      const cachedAt = Number.isFinite(value?.cachedAt) ? value.cachedAt : 0;
      if (!oldest || cachedAt < oldest.cachedAt) {
        oldest = { id, key, cachedAt };
      }
    });
  });
  if (!oldest) {
    return false;
  }
  delete state.locations[oldest.id].cache.weather[oldest.key];
  return true;
}

function persist() {
  let evictedEntries = 0;
  let attemptsRemaining = state.order.reduce((count, id) => (
    count + Object.keys(state.locations[id]?.cache?.weather || {}).length
  ), 1);
  while (attemptsRemaining > 0) {
    attemptsRemaining -= 1;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(buildPersistableState()));
      if (evictedEntries > 0) {
        console.warn(
          `[locationStore] Storage quota reached; evicted ${evictedEntries} weather cache entr${evictedEntries === 1 ? "y" : "ies"}.`
        );
      }
      return true;
    } catch (error) {
      if (isQuotaExceededError(error) && evictOldestWeatherCacheEntry()) {
        evictedEntries += 1;
        continue;
      }
      console.warn("[locationStore] Failed to persist state.", error);
      return false;
    }
  }
  return false;
}

function applyExternalState(serializedState) {
  if (serializedState === null) {
    state = buildDefaultState();
    return;
  }
  try {
    const incoming = normalizeState(JSON.parse(serializedState));
    incoming.order.forEach((id) => {
      const localLocation = state.locations[id];
      const incomingLocation = incoming.locations[id];
      if (
        localLocation?.calculations
        && coordinatesEqual(localLocation.coordinates, incomingLocation.coordinates)
      ) {
        incomingLocation.calculations = localLocation.calculations;
      }
    });
    state = incoming;
  } catch (error) {
    console.warn("[locationStore] Ignoring invalid state from another tab.", error);
  }
}

if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) {
      applyExternalState(event.newValue);
    }
  });
}

function sanitizeName(name, fallback) {
  const trimmed = typeof name === "string" ? name.trim() : "";
  if (!trimmed) {
    return fallback;
  }
  return trimmed.slice(0, DEFAULT_MAX_NAME_LENGTH);
}

export function formatCoordinates(lat, lon) {
  const coordinates = normalizeCoordinates(lat, lon);
  if (!coordinates) {
    return "";
  }
  return `Lat: ${coordinates.lat.toFixed(5)}°, Lon: ${coordinates.lon.toFixed(5)}°`;
}

export function getActiveLocationId() {
  return state.activeId;
}

export function getActiveLocation() {
  return state.locations[state.activeId];
}

export function getLocationsInOrder() {
  return state.order.map((id) => state.locations[id]).filter(Boolean);
}

export function getLocationById(id) {
  return state.locations[id] || null;
}

export function setActiveLocation(id) {
  if (!state.locations[id]) {
    return;
  }
  state.activeId = id;
  persist();
}

export function updateLocation(id, updater) {
  const location = state.locations[id];
  if (!location) {
    return;
  }
  const previousCoordinates = location.coordinates
    ? normalizeCoordinates(location.coordinates.lat, location.coordinates.lon)
    : null;
  updater(location);
  const nextCoordinates = location.coordinates
    ? normalizeCoordinates(location.coordinates.lat, location.coordinates.lon)
    : null;
  location.coordinates = nextCoordinates;
  if (!coordinatesEqual(previousCoordinates, nextCoordinates)) {
    location.calculations = buildDefaultCalculations();
  }
  state.locations[id] = ensureLocationShape(location, id, location.name, true);
  persist();
}

export function renameLocation(id, newName) {
  const location = state.locations[id];
  if (!location) {
    return;
  }
  const fallback = location.name || `${DEFAULT_NAME_PREFIX}`;
  location.name = sanitizeName(newName, fallback);
  persist();
}

export function createLocationEntry() {
  const highestIndex = state.order.reduce((maxIndex, entryId) => {
    const location = state.locations[entryId];
    if (!location) {
      return maxIndex;
    }
    const match = location.name.match(/^Standort\s+(\d+)$/);
    if (!match) {
      return maxIndex;
    }
    const index = parseInt(match[1], 10);
    if (Number.isNaN(index)) {
      return maxIndex;
    }
    return Math.max(maxIndex, index);
  }, 0);
  const id = `loc-${state.nextId}`;
  state.nextId += 1;
  const name = `${DEFAULT_NAME_PREFIX} ${highestIndex + 1}`;
  state.locations[id] = createLocation(id, name);
  state.order.push(id);
  state.activeId = id;
  persist();
  return state.locations[id];
}

export function deleteLocationEntry(id) {
  if (state.order.length <= 1) {
    return false;
  }
  if (!state.locations[id]) {
    return false;
  }
  const currentIndex = state.order.indexOf(id);
  delete state.locations[id];
  state.order = state.order.filter((entryId) => entryId !== id);
  if (!state.locations[state.activeId]) {
    const nextIndex = Math.min(currentIndex, state.order.length - 1);
    state.activeId = state.order[nextIndex];
  }
  persist();
  return true;
}

export function clearAllLocationCaches() {
  const hasStoredLocations = localStorage.getItem(STORAGE_KEY) !== null;
  state.order.forEach((id) => {
    const location = state.locations[id];
    if (location) {
      location.cache = buildDefaultCache();
    }
  });
  if (hasStoredLocations) {
    persist();
  }
}

export function createWeatherCacheStore(locationId) {
  return {
    get(key) {
      const location = state.locations[locationId];
      if (!location) {
        return null;
      }
      return location.cache.weather[key] || null;
    },
    set(key, value) {
      updateLocation(locationId, (location) => {
        location.cache.weather[key] = value;
      });
    },
    remove(key) {
      updateLocation(locationId, (location) => {
        delete location.cache.weather[key];
      });
    },
    clear() {
      updateLocation(locationId, (location) => {
        location.cache.weather = {};
      });
    }
  };
}

export function createLocationNameCacheStore(locationId) {
  return {
    get(key) {
      const location = state.locations[locationId];
      if (!location) {
        return null;
      }
      return location.cache.locationName[key] || null;
    },
    set(key, value) {
      updateLocation(locationId, (location) => {
        location.cache.locationName[key] = value;
      });
    },
    remove(key) {
      updateLocation(locationId, (location) => {
        delete location.cache.locationName[key];
      });
    },
    clear() {
      updateLocation(locationId, (location) => {
        location.cache.locationName = {};
      });
    }
  };
}
