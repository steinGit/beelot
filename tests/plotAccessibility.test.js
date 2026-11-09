import { readFileSync } from "node:fs";

jest.mock("../assets/js/plotUpdater.js", () => ({
  PlotUpdater: jest.fn().mockImplementation(() => ({
    invalidatePendingDisplay: jest.fn(),
    run: jest.fn().mockResolvedValue(undefined),
    setLocationId: jest.fn()
  }))
}));

const PLOTS = [
  ["toggle-gts-plot", "gts-plot-container", "gtsPlotVisible"],
  ["toggle-temp-plot", "temp-plot-container", "tempPlotVisible"]
];

function seedLocations(gtsPlotVisible, tempPlotVisible, count = 1) {
  const ids = Array.from({ length: count }, (_, index) => `loc-${index + 1}`);
  localStorage.setItem("beelotLocations", JSON.stringify({
    version: 1,
    nextId: count + 1,
    order: ids,
    activeId: ids[0],
    locations: Object.fromEntries(ids.map(id => [id, {
      id,
      name: id,
      ui: { gtsPlotVisible, tempPlotVisible }
    }]))
  }));
}

async function loadMain() {
  await import("../assets/js/main.js");
  document.dispatchEvent(new Event("DOMContentLoaded"));
}

beforeEach(() => {
  localStorage.clear();
  jest.resetModules();
  const page = new DOMParser().parseFromString(readFileSync("index.html", "utf8"), "text/html");
  document.body.innerHTML = page.body.innerHTML;
  global.Chart = { getChart: jest.fn() };
});

test.each([
  [false, false], [true, false], [false, true], [true, true]
])("restores accessible plot states for GTS=%s and temperature=%s", async (gts, temperature) => {
  seedLocations(gts, temperature);
  await loadMain();

  PLOTS.forEach(([buttonId, panelId], index) => {
    const expanded = [gts, temperature][index];
    const button = document.getElementById(buttonId);
    expect(button.getAttribute("aria-controls")).toBe(panelId);
    expect(button.getAttribute("aria-expanded")).toBe(String(expanded));
    expect(document.getElementById(panelId).classList.contains("visible")).toBe(expanded);
  });
});

test.each(PLOTS)("%s reports opening and closing without recalculating data", async (buttonId, panelId, setting) => {
  seedLocations(false, false);
  await loadMain();
  const { PlotUpdater } = await import("../assets/js/plotUpdater.js");
  const updater = PlotUpdater.mock.results.at(-1).value;
  const initialRuns = updater.run.mock.calls.length;
  const button = document.getElementById(buttonId);

  for (const expanded of [true, false]) {
    button.click();
    expect(button.getAttribute("aria-expanded")).toBe(String(expanded));
    expect(document.getElementById(panelId).classList.contains("visible")).toBe(expanded);
    const state = JSON.parse(localStorage.getItem("beelotLocations"));
    expect(state.locations[state.activeId].ui[setting]).toBe(expanded);
    expect(document.activeElement).not.toBe(document.getElementById(panelId));
  }
  expect(updater.run).toHaveBeenCalledTimes(initialRuns);
});

test("keeps disclosure states accurate when entering and leaving comparison mode", async () => {
  seedLocations(false, true, 2);
  await loadMain();
  document.querySelector(".location-tab-compare").click();

  expect(document.getElementById("toggle-gts-plot").getAttribute("aria-expanded")).toBe("true");
  expect(document.getElementById("toggle-temp-plot").getAttribute("aria-expanded")).toBe("false");

  document.getElementById("location-tab-loc-1").click();
  for (const [buttonId, panelId] of PLOTS) {
    const panel = document.getElementById(panelId);
    expect(document.getElementById(buttonId).getAttribute("aria-expanded"))
      .toBe(String(panel.classList.contains("visible") && panel.style.display !== "none"));
  }
});
