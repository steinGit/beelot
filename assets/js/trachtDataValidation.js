/**
 * @module trachtDataValidation
 * Validates plant data loaded from browser storage.
 */

const MAX_TEMPERATURE_SUM = 9999;
const MAX_PLANT_NAME_LENGTH = 200;
const MAX_URL_LENGTH = 2048;

function normalizeTemperatureSum(value) {
  if (typeof value === "string" && value.trim() === "") {
    return null;
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > MAX_TEMPERATURE_SUM) {
    return null;
  }
  return number;
}

export function normalizeTrachtData(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      return [];
    }
    const start = normalizeTemperatureSum(row.TS_start);
    const end = normalizeTemperatureSum(row.TS_end ?? row.TS_start);
    if (start === null || end === null || typeof row.plant !== "string") {
      return [];
    }
    return [{
      active: row.active === true,
      TS_start: start,
      TS_end: Math.max(start, end),
      plant: row.plant.slice(0, MAX_PLANT_NAME_LENGTH),
      url: typeof row.url === "string" ? row.url.slice(0, MAX_URL_LENGTH) : ""
    }];
  });
}
