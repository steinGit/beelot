/**
 * @module externalServiceStatus
 * Displays user-facing availability information for external runtime services.
 */

export const SERVICE_IDS = Object.freeze({
  OPEN_METEO: "open-meteo",
  NOMINATIM: "nominatim",
  PHOTON: "photon",
  OPEN_STREET_MAP: "openstreetmap"
});

export const SERVICE_MESSAGES = Object.freeze({
  [SERVICE_IDS.OPEN_METEO]: "Wetterdaten über Open-Meteo sind derzeit nicht verfügbar.",
  [SERVICE_IDS.NOMINATIM]: "Adressdienst Nominatim ist derzeit nicht verfügbar.",
  [SERVICE_IDS.PHOTON]: "Zusätzlicher Adressdienst Photon ist derzeit nicht verfügbar.",
  [SERVICE_IDS.OPEN_STREET_MAP]: "Kartenmaterial von OpenStreetMap ist derzeit nicht verfügbar."
});

const activeFailures = new Map();

function renderServiceFailures() {
  const container = document.getElementById("service-status");
  if (!container) {
    return;
  }

  const services = [...new Set(activeFailures.values())];
  container.replaceChildren();
  container.hidden = services.length === 0;
  if (services.length === 0) {
    return;
  }

  const list = document.createElement("ul");
  services.forEach((service) => {
    const item = document.createElement("li");
    item.textContent = SERVICE_MESSAGES[service];
    list.appendChild(item);
  });
  container.appendChild(list);
}

export function getServiceMessage(service) {
  return SERVICE_MESSAGES[service] || "Ein externer Dienst ist derzeit nicht verfügbar.";
}

export function reportServiceFailure(service, source = service) {
  if (!SERVICE_MESSAGES[service]) {
    console.error(`[externalServiceStatus] Unknown service: ${service}`);
    return;
  }
  activeFailures.set(source, service);
  renderServiceFailures();
}

export function clearServiceFailure(source) {
  activeFailures.delete(source);
  renderServiceFailures();
}

export function hasServiceFailure(source) {
  return activeFailures.has(source);
}

export function resetServiceFailures() {
  activeFailures.clear();
  renderServiceFailures();
}

export class ServiceUnavailableError extends Error {
  constructor(service, cause = null) {
    super(getServiceMessage(service));
    this.name = "ServiceUnavailableError";
    this.service = service;
    this.isServiceUnavailableError = true;
    if (cause) {
      this.cause = cause;
    }
  }
}

export function isServiceUnavailableError(error) {
  return Boolean(error && error.isServiceUnavailableError);
}
