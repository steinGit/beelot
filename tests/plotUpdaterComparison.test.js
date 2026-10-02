import { execFileSync } from "node:child_process";
import process from "node:process";
import { PlotUpdater } from "../assets/js/plotUpdater.js";
import { getLocationsInOrder } from "../assets/js/locationStore.js";

function createUpdater() {
  document.body.innerHTML = `
    <p id="result"><span id="gts-year-comparison"></span></p>
    <select id="zeitraum"><option value="28">28 days</option></select>
    <input id="datum" value="2026-03-30">
    <section class="hinweis-section"></section>
    <div id="gts"></div><div id="temp"></div>`;
  const updater = new PlotUpdater({
    locationId: getLocationsInOrder()[0].id,
    datumInput: document.querySelector("#datum"),
    zeitraumSelect: document.querySelector("#zeitraum"),
    ergebnisTextEl: document.querySelector("#result"),
    hinweisSection: document.querySelector(".hinweis-section"),
    gtsPlotContainer: document.querySelector("#gts"),
    tempPlotContainer: document.querySelector("#temp")
  });
  updater.request = Object.freeze({
    timeframe: "28",
    yearRange: 1,
    canDisplay: () => true,
    canStore: () => true
  });
  updater.currentGtsValue = 100;
  updater.currentEndDate = new Date(2026, 2, 30);
  updater.currentPlotStartDate = new Date(2026, 2, 15);
  updater.latestFilteredResults = [{ date: "2026-03-30", gts: 100 }];
  updater.currentLat = 48;
  updater.currentLon = 9;
  return updater;
}

describe("GTS year comparison", () => {
  test("uses full-year data when the threshold was already reached before the display window", async () => {
    const updater = createUpdater();
    jest.spyOn(updater, "getCachedMultiYearData").mockReturnValue([
      { year: 2025, labels: ["15.3"], gtsValues: [150] }
    ]);
    const fullYear = jest.spyOn(updater, "getFullYearEntry").mockResolvedValue({
      year: 2025,
      labels: ["20.2", "21.2"],
      gtsValues: [100, 105]
    });

    await updater.step14bUpdateGtsComparison();

    expect(fullYear).toHaveBeenCalledWith(2025);
    expect(document.querySelector("#gts-year-comparison").textContent)
      .toContain("Gegenüber 2025 um 38 Tage langsamer");
  });

  test("keeps a crossing found inside the displayed window", async () => {
    const updater = createUpdater();
    jest.spyOn(updater, "getCachedMultiYearData").mockReturnValue([
      { year: 2025, labels: ["15.3", "16.3"], gtsValues: [90, 100] }
    ]);
    const fullYear = jest.spyOn(updater, "getFullYearEntry");

    await updater.step14bUpdateGtsComparison();

    expect(fullYear).not.toHaveBeenCalled();
    expect(document.querySelector("#gts-year-comparison").textContent)
      .toContain("Gegenüber 2025 um 14 Tage langsamer");
  });

  test("counts calendar days independently of daylight-saving changes", () => {
    const script = `
      globalThis.localStorage = {
        getItem: () => null,
        setItem: () => {},
        removeItem: () => {}
      };
      const { PlotUpdater } = await import('./assets/js/plotUpdater.js');
      console.log(PlotUpdater.prototype.getDayOfYear(new Date(2026, 2, 30)));
    `;
    const output = execFileSync(process.execPath, ["--input-type=module", "--eval", script], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, TZ: "America/Los_Angeles" }
    });

    expect(Number(output.trim())).toBe(89);
  });

  test("retains the additional leap-year day in day indices", () => {
    const updater = createUpdater();

    expect(updater.getDayOfYear(new Date(2024, 1, 29))).toBe(60);
    expect(updater.getDayOfYear(new Date(2024, 2, 1))).toBe(61);
    expect(updater.getDayOfYear(new Date(2025, 2, 1))).toBe(60);
  });
});
