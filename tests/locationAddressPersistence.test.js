describe("locationStore address persistence", () => {
  beforeEach(() => {
    localStorage.clear();
    jest.resetModules();
  });

  test("initializes default country for a new location", async () => {
    const { getActiveLocation } = await import("../assets/js/locationStore");
    const location = getActiveLocation();
    expect(location.ui.address).toEqual({
      street: "",
      city: "",
      country: "Deutschland"
    });
  });

  test("migrates legacy stored location state without address", async () => {
    localStorage.setItem(
      "beelotLocations",
      JSON.stringify({
        version: 1,
        nextId: 2,
        order: ["loc-1"],
        activeId: "loc-1",
        locations: {
          "loc-1": {
            id: "loc-1",
            name: "Standort 1",
            coordinates: null,
            cache: { weather: {}, locationName: {} },
            calculations: { gtsResults: null, filteredResults: null, temps: { dates: [], values: [] } },
            ui: {
              selectedDate: "2026-01-14",
              zeitraum: "ytd",
              gtsYearRange: 1,
              gtsRange20Active: false,
              gtsColorScheme: "queen",
              gtsPlotVisible: false,
              tempPlotVisible: false,
              map: { lastPos: null, lastZoom: null }
            }
          }
        }
      })
    );

    const { getActiveLocation } = await import("../assets/js/locationStore");
    const location = getActiveLocation();
    expect(location.ui.address).toEqual({
      street: "",
      city: "",
      country: "Deutschland"
    });
  });
});
