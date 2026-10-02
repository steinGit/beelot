/**
 * @module locationStore
 * Manages persistent, per-location state and caches.
 */

const STORAGE_KEY = "beelotLocations";
const DEFAULT_NAME_PREFIX = "Standort";
const DEFAULT_MAX_NAME_LENGTH = 32; // TODO: Make configurable if needed.

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
    hinweisHtml: "",
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
  return { lat, lon };
}

function ensureLocationShape(location) {
  const normalized = location || {};
  normalized.coordinates = normalized.coordinates || null;
  normalized.cache = normalized.cache || buildDefaultCache();
  normalized.cache.weather = normalized.cache.weather || {};
  normalized.cache.locationName = normalized.cache.locationName || {};
  normalized.calculations = normalized.calculations || buildDefaultCalculations();
  normalized.calculations.temps = normalized.calculations.temps || { dates: [], values: [] };
  normalized.calculations.gtsYearCurves = normalized.calculations.gtsYearCurves || {};
  normalized.ui = normalized.ui || buildDefaultUiState();
  if (typeof normalized.ui.gtsRange20Active !== "boolean") {
    normalized.ui.gtsRange20Active = false;
  }
  normalized.ui.address = normalized.ui.address || {
    street: "",
    city: "",
    country: "Deutschland"
  };
  if (typeof normalized.ui.address.street !== "string") {
    normalized.ui.address.street = "";
  }
  if (typeof normalized.ui.address.city !== "string") {
    normalized.ui.address.city = "";
  }
  if (typeof normalized.ui.address.country !== "string" || !normalized.ui.address.country.trim()) {
    normalized.ui.address.country = "Deutschland";
  }
  normalized.ui.map = normalized.ui.map || { lastPos: null, lastZoom: null, addressViewportMeters: null };
  if (!Number.isFinite(normalized.ui.map.addressViewportMeters)) {
    normalized.ui.map.addressViewportMeters = null;
  }
  return normalized;
}

function normalizeState(state) {
  const normalized = state || buildDefaultState();
  normalized.version = normalized.version || 1;
  normalized.nextId = normalized.nextId || 2;
  normalized.order = Array.isArray(normalized.order) ? normalized.order : [];
  normalized.locations = normalized.locations || {};
  normalized.activeId = normalized.activeId || normalized.order[0];

  if (normalized.order.length === 0) {
    const fallback = buildDefaultState();
    return fallback;
  }

  normalized.order.forEach((id) => {
    if (!normalized.locations[id]) {
      normalized.locations[id] = createLocation(id, `${DEFAULT_NAME_PREFIX} ${normalized.order.indexOf(id) + 1}`);
    }
    normalized.locations[id] = ensureLocationShape(normalized.locations[id]);
  });

  if (!normalized.locations[normalized.activeId]) {
    normalized.activeId = normalized.order[0];
  }

  return normalized;
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

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn("[locationStore] Failed to persist state.", error);
  }
}

function sanitizeName(name, fallback) {
  const trimmed = (name || "").trim();
  if (!trimmed) {
    return fallback;
  }
  return trimmed.slice(0, DEFAULT_MAX_NAME_LENGTH);
}

export function formatCoordinates(lat, lon) {
  return `Lat: ${lat.toFixed(5)}°, Lon: ${lon.toFixed(5)}°`;
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
  updater(location);
  state.locations[id] = ensureLocationShape(location);
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
