import {
  clearServiceFailure,
  getServiceMessage,
  hasServiceFailure,
  reportServiceFailure,
  resetServiceFailures,
  SERVICE_IDS,
  ServiceUnavailableError
} from "../assets/js/externalServiceStatus.js";

describe("external service status", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="service-status" hidden></div>';
    resetServiceFailures();
  });

  test("shows and clears a service-specific message", () => {
    reportServiceFailure(SERVICE_IDS.OPEN_METEO, "weather-request");

    const status = document.getElementById("service-status");
    expect(status.hidden).toBe(false);
    expect(status.textContent).toContain("Open-Meteo");
    expect(hasServiceFailure("weather-request")).toBe(true);

    clearServiceFailure("weather-request");

    expect(status.hidden).toBe(true);
    expect(status.textContent).toBe("");
    expect(hasServiceFailure("weather-request")).toBe(false);
  });

  test("deduplicates a service while independent failure sources remain active", () => {
    reportServiceFailure(SERVICE_IDS.NOMINATIM, "forward");
    reportServiceFailure(SERVICE_IDS.NOMINATIM, "reverse");

    expect(document.querySelectorAll("#service-status li")).toHaveLength(1);

    clearServiceFailure("forward");
    expect(document.getElementById("service-status").hidden).toBe(false);

    clearServiceFailure("reverse");
    expect(document.getElementById("service-status").hidden).toBe(true);
  });

  test("creates errors with the public service message and original cause", () => {
    const cause = new Error("HTTP 503");
    const error = new ServiceUnavailableError(SERVICE_IDS.PHOTON, cause);

    expect(error.message).toBe(getServiceMessage(SERVICE_IDS.PHOTON));
    expect(error.service).toBe(SERVICE_IDS.PHOTON);
    expect(error.cause).toBe(cause);
  });
});
