import { readFileSync } from "node:fs";

jest.mock("../assets/js/plotUpdater.js", () => ({
  PlotUpdater: jest.fn().mockImplementation(() => ({
    invalidatePendingDisplay: jest.fn(),
    run: jest.fn().mockResolvedValue(undefined),
    setLocationId: jest.fn()
  }))
}));

describe("permanent location synchronization", () => {
  beforeEach(() => {
    localStorage.clear();
    jest.resetModules();
    const source = readFileSync("index.html", "utf8");
    const parsed = new DOMParser().parseFromString(source, "text/html");
    document.body.innerHTML = parsed.body.innerHTML;
  });

  test("synchronizes date and visualization settings without a toggle", async () => {
    localStorage.setItem("beelotStandortSync", "false");
    const store = await import("../assets/js/locationStore.js");
    await import("../assets/js/main.js");
    document.dispatchEvent(new Event("DOMContentLoaded"));

    store.createLocationEntry();
    const datumInput = document.getElementById("datum");
    datumInput.value = "2026-09-30";
    datumInput.dispatchEvent(new Event("change"));
    document.getElementById("toggle-gts-plot").click();

    const locations = store.getLocationsInOrder();
    expect(locations).toHaveLength(2);
    locations.forEach((location) => {
      expect(location.ui.selectedDate).toBe("2026-09-30");
      expect(location.ui.gtsPlotVisible).toBe(true);
    });
    expect(document.getElementById("standort-sync-toggle")).toBeNull();
  });
});
