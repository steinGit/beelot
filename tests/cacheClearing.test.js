describe("settings cache clearing", () => {
  beforeEach(() => {
    localStorage.clear();
    jest.resetModules();
    document.body.innerHTML = '<button id="clear-cache-button">Clear Cache</button>';
    jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("clears current and legacy caches without deleting location data or settings", async () => {
    const store = await import("../assets/js/locationStore.js");
    const first = store.getActiveLocation();
    const second = store.createLocationEntry();

    store.updateLocation(first.id, (location) => {
      location.coordinates = { lat: 48, lon: 9 };
    });
    store.updateLocation(first.id, (location) => {
      location.calculations.gtsResults = [{ date: "2026-01-01", gts: 5 }];
      location.ui.selectedDate = "2026-09-30";
    });
    store.createWeatherCacheStore(first.id).set("historical_first", { daily: true });
    store.createLocationNameCacheStore(first.id).set("48,9", "First location");
    store.createWeatherCacheStore(second.id).set("recent_second", { daily: true });
    store.createLocationNameCacheStore(second.id).set("52,13", "Second location");

    localStorage.setItem("historical_legacy", JSON.stringify({ daily: true }));
    localStorage.setItem("recent_legacy", JSON.stringify({ daily: true }));
    localStorage.setItem("trachtData", JSON.stringify([{ plant: "Custom" }]));
    localStorage.setItem("unrelated", "keep");

    await import("../assets/js/settings.js");
    document.getElementById("clear-cache-button").click();

    const locations = store.getLocationsInOrder();
    locations.forEach((location) => {
      expect(location.cache).toEqual({ weather: {}, locationName: {} });
    });
    expect(store.getLocationById(first.id).coordinates).toEqual({ lat: 48, lon: 9 });
    expect(store.getLocationById(first.id).calculations.gtsResults)
      .toEqual([{ date: "2026-01-01", gts: 5 }]);
    expect(store.getLocationById(first.id).ui.selectedDate).toBe("2026-09-30");

    const persisted = JSON.parse(localStorage.getItem("beelotLocations"));
    expect(persisted.locations[first.id].cache).toEqual({ weather: {}, locationName: {} });
    expect(persisted.locations[second.id].cache).toEqual({ weather: {}, locationName: {} });
    expect(localStorage.getItem("historical_legacy")).toBeNull();
    expect(localStorage.getItem("recent_legacy")).toBeNull();
    expect(localStorage.getItem("trachtData")).toBe(JSON.stringify([{ plant: "Custom" }]));
    expect(localStorage.getItem("unrelated")).toBe("keep");

    localStorage.clear();
    document.getElementById("clear-cache-button").click();
    expect(localStorage.getItem("beelotLocations")).toBeNull();
  });
});
