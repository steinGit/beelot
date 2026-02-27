/**
 * @module addressNormalization
 * Helpers for normalizing user-entered address data and extracting canonical
 * values from Nominatim responses.
 */

export const DEFAULT_ADDRESS_COUNTRY = "Deutschland";

function normalizeAddressField(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function normalizeCountryToken(value) {
  return normalizeAddressField(value)
    .toLowerCase()
    .replace(/\./g, "");
}

export function normalizeCountryName(value) {
  const token = normalizeCountryToken(value);
  if (!token) {
    return DEFAULT_ADDRESS_COUNTRY;
  }

  if (
    token === "d"
    || token === "de"
    || token === "deutschland"
    || token === "germany"
    || token === "deu"
  ) {
    return "Deutschland";
  }
  if (
    token === "ch"
    || token === "sch"
    || token === "schweiz"
    || token === "switzerland"
    || token === "che"
  ) {
    return "Schweiz";
  }
  if (
    token === "ö"
    || token === "o"
    || token === "au"
    || token === "at"
    || token === "österreich"
    || token === "osterreich"
    || token === "austria"
    || token === "aut"
  ) {
    return "Österreich";
  }

  return normalizeAddressField(value);
}

export function getCountryCodeForCountryName(value) {
  const normalized = normalizeCountryName(value);
  if (normalized === "Deutschland") {
    return "de";
  }
  if (normalized === "Schweiz") {
    return "ch";
  }
  if (normalized === "Österreich") {
    return "at";
  }
  return "";
}

export function normalizeAddressFormData(rawData = {}) {
  return {
    street: normalizeAddressField(rawData.street),
    city: normalizeAddressField(rawData.city),
    country: normalizeCountryName(rawData.country)
  };
}

function isLetterChar(char) {
  return typeof char === "string" && /^[A-Za-zÄÖÜäöüß]$/.test(char);
}

export function buildCityTypoCandidates(city, maxCandidates = 12) {
  const baseCity = normalizeAddressField(city);
  if (!baseCity || baseCity.length < 3) {
    return [];
  }

  const candidates = [];
  const seen = new Set([baseCity.toLowerCase()]);
  const pushCandidate = (value) => {
    const normalized = normalizeAddressField(value);
    if (!normalized) {
      return;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    candidates.push(normalized);
  };

  const substitutionMap = {
    a: ["ä"],
    ä: ["a"],
    o: ["ö"],
    ö: ["o"],
    u: ["ü"],
    ü: ["u"],
    n: ["m"],
    m: ["n"],
    b: ["p"],
    p: ["b"],
    d: ["t"],
    t: ["d"],
    g: ["k"],
    k: ["g"],
    f: ["v", "w"],
    v: ["f", "w"],
    w: ["v"]
  };

  const applyCase = (originalChar, replacementChar) => {
    if (originalChar === originalChar.toUpperCase()) {
      return replacementChar.toUpperCase();
    }
    return replacementChar;
  };

  for (let i = 0; i < baseCity.length; i += 1) {
    const current = baseCity[i];
    const replacements = substitutionMap[current.toLowerCase()] || [];
    for (const replacement of replacements) {
      const replaced = `${baseCity.slice(0, i)}${applyCase(current, replacement)}${baseCity.slice(i + 1)}`;
      pushCandidate(replaced);
      if (candidates.length >= maxCandidates) {
        return candidates;
      }
    }
  }

  for (let i = 0; i < baseCity.length; i += 1) {
    const current = baseCity[i];
    if (!isLetterChar(current)) {
      continue;
    }
    if (baseCity[i + 1] === current) {
      continue;
    }
    const doubled = `${baseCity.slice(0, i + 1)}${current}${baseCity.slice(i + 1)}`;
    pushCandidate(doubled);
    if (candidates.length >= maxCandidates) {
      return candidates;
    }
  }

  for (let i = 0; i < baseCity.length - 1; i += 1) {
    const left = baseCity[i];
    const right = baseCity[i + 1];
    if (!isLetterChar(left) || !isLetterChar(right) || left === right) {
      continue;
    }
    const swapped = `${baseCity.slice(0, i)}${right}${left}${baseCity.slice(i + 2)}`;
    pushCandidate(swapped);
    if (candidates.length >= maxCandidates) {
      return candidates;
    }
  }

  return candidates;
}

function buildAddressQueryFromParts(street, city, country) {
  if (street) {
    return `${street}, ${city}, ${country}`;
  }
  return `${city}, ${country}`;
}

export function buildAddressQueries(rawData, maxTypoCandidates = 12) {
  const normalized = normalizeAddressFormData(rawData);
  const queries = [
    buildAddressQueryFromParts(normalized.street, normalized.city, normalized.country)
  ];

  const cityCandidates = buildCityTypoCandidates(normalized.city, maxTypoCandidates);
  cityCandidates.forEach((candidateCity) => {
    queries.push(
      buildAddressQueryFromParts(normalized.street, candidateCity, normalized.country)
    );
  });

  return queries;
}

const SETTLEMENT_ADDRESS_TYPES = new Set([
  "city",
  "town",
  "village",
  "municipality",
  "hamlet"
]);

const SETTLEMENT_PLACE_TYPES = new Set([
  "city",
  "town",
  "village",
  "municipality",
  "hamlet"
]);

const SETTLEMENT_PHOTON_TYPES = new Set([
  "city",
  "town",
  "village",
  "municipality",
  "hamlet"
]);

export function isSettlementSearchResult(result) {
  if (!result || typeof result !== "object") {
    return false;
  }

  const addresstype = typeof result.addresstype === "string"
    ? result.addresstype.toLowerCase()
    : "";
  const type = typeof result.type === "string" ? result.type.toLowerCase() : "";
  const category = typeof result.category === "string" ? result.category.toLowerCase() : "";

  if (SETTLEMENT_ADDRESS_TYPES.has(addresstype)) {
    return true;
  }
  if (category === "place" && SETTLEMENT_PLACE_TYPES.has(type)) {
    return true;
  }
  return false;
}

export function pickBestSearchResult(results, requireSettlement = false) {
  if (!Array.isArray(results) || results.length === 0) {
    return null;
  }
  if (!requireSettlement) {
    return results[0];
  }
  const settlementResult = results.find((entry) => isSettlementSearchResult(entry));
  return settlementResult || null;
}

function buildCandidateLabel(result, canonical) {
  if (result && typeof result.display_name === "string" && result.display_name.trim()) {
    return result.display_name.trim();
  }
  return `${canonical.city}, ${canonical.country}`;
}

export function collectSettlementCandidates(results, fallback) {
  if (!Array.isArray(results) || results.length === 0) {
    return [];
  }

  const unique = new Map();
  results.forEach((entry) => {
    if (!isSettlementSearchResult(entry)) {
      return;
    }

    const lat = parseFloat(entry.lat);
    const lon = parseFloat(entry.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return;
    }

    const normalized = buildCanonicalAddressFromResult(entry, fallback);
    const key = `${lat.toFixed(6)}|${lon.toFixed(6)}|${normalized.city.toLowerCase()}`;
    if (unique.has(key)) {
      return;
    }

    unique.set(key, {
      lat,
      lon,
      normalized,
      label: buildCandidateLabel(entry, normalized)
    });
  });

  return Array.from(unique.values());
}

function buildPhotonCandidateLabel(properties, normalizedCity, normalizedCountry) {
  const parts = [
    normalizedCity,
    typeof properties.county === "string" ? properties.county.trim() : "",
    typeof properties.state === "string" ? properties.state.trim() : "",
    normalizedCountry
  ].filter(Boolean);
  return parts.join(", ");
}

export function collectPhotonSettlementCandidates(features, fallback, countryCode = "") {
  if (!Array.isArray(features) || features.length === 0) {
    return [];
  }

  const normalizedFallback = normalizeAddressFormData(fallback);
  const unique = new Map();

  features.forEach((feature) => {
    const properties = feature && typeof feature === "object" && feature.properties
      ? feature.properties
      : null;
    if (!properties || typeof properties !== "object") {
      return;
    }

    const type = typeof properties.type === "string" ? properties.type.toLowerCase() : "";
    if (!SETTLEMENT_PHOTON_TYPES.has(type)) {
      return;
    }

    const featureCountryCode = typeof properties.countrycode === "string"
      ? properties.countrycode.toLowerCase()
      : "";
    if (countryCode && featureCountryCode && featureCountryCode !== countryCode.toLowerCase()) {
      return;
    }

    const coords = Array.isArray(feature.geometry?.coordinates)
      ? feature.geometry.coordinates
      : [];
    if (coords.length < 2) {
      return;
    }
    const lon = Number(coords[0]);
    const lat = Number(coords[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      return;
    }

    const cityCandidate = typeof properties.name === "string" && properties.name.trim()
      ? properties.name.trim()
      : (typeof properties.city === "string" && properties.city.trim()
        ? properties.city.trim()
        : normalizedFallback.city);

    if (!cityCandidate) {
      return;
    }

    const normalizedCountry = normalizeCountryName(
      typeof properties.country === "string" && properties.country.trim()
        ? properties.country
        : normalizedFallback.country
    );

    const normalized = normalizeAddressFormData({
      street: normalizedFallback.street,
      city: cityCandidate,
      country: normalizedCountry
    });
    const key = `${lat.toFixed(6)}|${lon.toFixed(6)}|${normalized.city.toLowerCase()}`;
    if (unique.has(key)) {
      return;
    }

    unique.set(key, {
      lat,
      lon,
      normalized,
      label: buildPhotonCandidateLabel(properties, normalized.city, normalized.country)
    });
  });

  return Array.from(unique.values());
}

function extractCityFromAddressObject(address) {
  if (!address || typeof address !== "object") {
    return "";
  }

  const candidates = [
    address.city,
    address.town,
    address.municipality,
    address.village,
    address.city_district,
    address.borough,
    address.suburb,
    address.hamlet,
    address.county
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return "";
}

function extractCityFromDisplayName(displayName, fallbackStreet) {
  if (typeof displayName !== "string") {
    return "";
  }

  const parts = displayName
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) {
    return "";
  }

  if (!fallbackStreet) {
    return parts[0];
  }

  const first = parts[0];
  const firstLower = first.toLowerCase();
  const streetHead = fallbackStreet.toLowerCase().split(/\s+/)[0] || "";
  const looksLikeStreet = /\d/.test(firstLower) || (streetHead && firstLower.includes(streetHead));

  if (looksLikeStreet && parts.length > 1) {
    return parts[1];
  }
  return parts[0];
}

export function buildCanonicalAddressFromResult(result, fallback) {
  const normalizedFallback = normalizeAddressFormData(fallback);
  const address = result && typeof result === "object" ? result.address : null;

  const cityFromAddress = extractCityFromAddressObject(address);
  const cityFromName = result && typeof result.name === "string" ? result.name.trim() : "";
  const cityFromDisplayName = extractCityFromDisplayName(
    result && typeof result.display_name === "string" ? result.display_name : "",
    normalizedFallback.street
  );
  const cityFromResult = cityFromAddress || cityFromDisplayName || cityFromName;
  const countryFromResult = address && typeof address.country === "string"
    ? address.country
    : normalizedFallback.country;

  return {
    street: normalizedFallback.street,
    city: cityFromResult || normalizedFallback.city,
    country: normalizeCountryName(countryFromResult)
  };
}
