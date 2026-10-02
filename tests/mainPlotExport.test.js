import { readFileSync } from "node:fs";

jest.mock("../assets/js/plotUpdater.js", () => ({
  PlotUpdater: jest.fn().mockImplementation(() => ({
    invalidatePendingDisplay: jest.fn(),
    run: jest.fn().mockResolvedValue(undefined),
    setLocationId: jest.fn()
  }))
}));

jest.mock("../assets/js/plotExport.js", () => ({
  downloadPlotData: jest.fn()
}));

describe("plot export controls", () => {
  beforeEach(() => {
    localStorage.clear();
    jest.resetModules();
    const source = readFileSync("index.html", "utf8");
    const page = new DOMParser().parseFromString(source, "text/html");
    document.body.innerHTML = page.body.innerHTML;
    global.Chart = { getChart: jest.fn() };
    window.alert = jest.fn();
  });

  test.each([
    ["export-gts-plot", "plot-canvas", "GTS", "gts-export-format", "csv"],
    ["export-temperature-plot", "temp-plot", "temperature", "temperature-export-format", "xlsx"],
    ["export-comparison-plot", "plot-canvas", "comparison", "gts-export-format", "xls"]
  ])("exports the live chart for %s", async (
    buttonId,
    canvasId,
    plotType,
    formatSelectId,
    exportFormat
  ) => {
    const { downloadPlotData } = await import("../assets/js/plotExport.js");
    await import("../assets/js/main.js");
    document.dispatchEvent(new Event("DOMContentLoaded"));
    const chart = { beelotPlotType: plotType };
    Chart.getChart.mockImplementation((canvas) => (
      canvas.id === canvasId ? chart : null
    ));
    document.getElementById(formatSelectId).value = exportFormat;

    document.getElementById(buttonId).click();

    expect(downloadPlotData).toHaveBeenCalledWith(chart, plotType, exportFormat);
    expect(window.alert).not.toHaveBeenCalled();
  });

  test("does not export a stale chart of another type", async () => {
    const { downloadPlotData } = await import("../assets/js/plotExport.js");
    await import("../assets/js/main.js");
    document.dispatchEvent(new Event("DOMContentLoaded"));
    Chart.getChart.mockReturnValue({ beelotPlotType: "GTS" });

    document.getElementById("export-comparison-plot").click();

    expect(downloadPlotData).not.toHaveBeenCalled();
    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining("noch nicht verfügbar"));
  });
});
