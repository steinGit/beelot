import { readFileSync } from "node:fs";
import {
  buildPlotCsv,
  buildPlotFilename,
  downloadPlotData
} from "../assets/js/plotExport.js";

function createChart() {
  return {
    data: {
      labels: ["01.01", "02.01"],
      datasets: [
        {
          label: "Standort A",
          data: [10.5, 12],
          borderColor: "red",
          backgroundColor: "rgba(255, 0, 0, 0.2)"
        },
        {
          label: "Standort B",
          data: [9, 11],
          borderColor: "green",
          backgroundColor: "transparent"
        },
        {
          label: "Ausgeblendet",
          data: [100, 200],
          borderColor: "blue",
          backgroundColor: "transparent"
        }
      ]
    },
    options: {
      scales: {
        x: { title: { text: "Datum (Tag.Monat)" } },
        y: { title: { text: "Grünland-Temperatur-Summe (°Cd)" } }
      }
    },
    isDatasetVisible: jest.fn((index) => index !== 2)
  };
}

describe("plot CSV export", () => {
  test("exports only visible series and preserves their colors as metadata", () => {
    expect(buildPlotCsv(createChart())).toBe(
      "\uFEFFDatum (Tag.Monat),Standort A,Standort B\r\n"
      + "01.01,10.5,9\r\n"
      + "02.01,12,11\r\n"
      + ",,\r\n"
      + "Y axis,Grünland-Temperatur-Summe (°Cd),\r\n"
      + "Colors,Standort A,Standort B\r\n"
      + "Line color,red,green\r\n"
      + "Fill color,\"rgba(255, 0, 0, 0.2)\",transparent\r\n"
    );
  });

  test("neutralizes spreadsheet formulas without changing numeric values", () => {
    const chart = createChart();
    chart.data.labels = ["=1+1"];
    chart.data.datasets = [{
      label: "@SUM(A1:A2)",
      data: [-2.5],
      borderColor: "red",
      backgroundColor: "transparent"
    }];
    chart.isDatasetVisible = () => true;

    const csv = buildPlotCsv(chart);
    expect(csv).toContain("Datum (Tag.Monat),'@SUM(A1:A2)\r\n");
    expect(csv).toContain("'=1+1,-2.5\r\n");
  });

  test("rejects charts without visible data", () => {
    const chart = createChart();
    chart.isDatasetVisible = () => false;
    expect(() => buildPlotCsv(chart)).toThrow("no visible data");
  });

  test("builds the required local timestamp filename", () => {
    const timestamp = new Date(2026, 9, 2, 7, 8, 9);
    expect(buildPlotFilename("GTS", "csv", timestamp))
      .toBe("20261002_070809__beelot_plot_GTS.csv");
    expect(buildPlotFilename("temperature", "csv", timestamp))
      .toBe("20261002_070809__beelot_plot_temperature.csv");
    expect(buildPlotFilename("comparison", "csv", timestamp))
      .toBe("20261002_070809__beelot_plot_comparison.csv");
    expect(buildPlotFilename("GTS", "xlsx", timestamp))
      .toBe("20261002_070809__beelot_plot_GTS.xlsx");
    expect(buildPlotFilename("GTS", "xls", timestamp))
      .toBe("20261002_070809__beelot_plot_GTS.xls");
  });

  test("downloads through the browser and releases the object URL", () => {
    jest.useFakeTimers();
    const click = jest.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const urlApi = {
      createObjectURL: jest.fn(() => "blob:plot-export"),
      revokeObjectURL: jest.fn()
    };

    const filename = downloadPlotData(createChart(), "GTS", "csv", {
      urlApi,
      now: new Date(2026, 9, 2, 7, 8, 9)
    });

    expect(filename).toBe("20261002_070809__beelot_plot_GTS.csv");
    expect(urlApi.createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalledTimes(1);
    expect(document.querySelector("a[download]")).toBeNull();
    jest.runOnlyPendingTimers();
    expect(urlApi.revokeObjectURL).toHaveBeenCalledWith("blob:plot-export");

    click.mockRestore();
    jest.useRealTimers();
  });

  test.each([
    ["xlsx", "xlsx", true],
    ["xls", "biff8", false]
  ])("writes an Excel workbook for %s", (exportFormat, bookType, compression) => {
    const worksheet = {};
    const workbook = {};
    const xlsxApi = {
      utils: {
        aoa_to_sheet: jest.fn(() => worksheet),
        book_new: jest.fn(() => workbook),
        book_append_sheet: jest.fn()
      },
      writeFile: jest.fn()
    };

    const filename = downloadPlotData(createChart(), "comparison", exportFormat, {
      xlsxApi,
      now: new Date(2026, 9, 2, 7, 8, 9)
    });

    expect(filename).toBe(`20261002_070809__beelot_plot_comparison.${exportFormat}`);
    expect(xlsxApi.utils.aoa_to_sheet).toHaveBeenCalledWith(expect.arrayContaining([
      ["Datum (Tag.Monat)", "Standort A", "Standort B"],
      ["Line color", "red", "green"]
    ]));
    expect(worksheet["!cols"]).toHaveLength(3);
    expect(xlsxApi.utils.book_append_sheet)
      .toHaveBeenCalledWith(workbook, worksheet, "Plot data");
    expect(xlsxApi.writeFile).toHaveBeenCalledWith(workbook, filename, {
      bookType,
      compression,
      cellStyles: true
    });
  });

  test("keeps export controls outside responsive chart containers", () => {
    const source = readFileSync("index.html", "utf8");
    const page = new DOMParser().parseFromString(source, "text/html");
    const gtsContainer = page.querySelector("#gts-plot-container");
    const temperatureContainer = page.querySelector("#temp-plot-container");

    expect(gtsContainer.contains(page.querySelector("#export-gts-plot"))).toBe(false);
    expect(gtsContainer.contains(page.querySelector("#export-comparison-plot"))).toBe(false);
    expect(temperatureContainer.contains(page.querySelector("#export-temperature-plot"))).toBe(false);
    expect([...page.querySelectorAll("#gts-export-format option")].map((option) => option.value))
      .toEqual(["csv", "xlsx", "xls"]);
    expect([...page.querySelectorAll("#temperature-export-format option")].map((option) => option.value))
      .toEqual(["csv", "xlsx", "xls"]);
  });

  test("documents the plot export formats and limitations in the FAQ", () => {
    const faq = readFileSync("components/faq.html", "utf8");
    const page = new DOMParser().parseFromString(faq, "text/html");
    const exportEntry = [...page.querySelectorAll("details")].find((entry) => (
      entry.querySelector(":scope > summary")?.textContent.includes("Diagrammdaten exportieren")
    ));

    expect(exportEntry).toBeDefined();
    const text = exportEntry.textContent.replace(/\s+/g, " ");
    expect(text).toContain("CSV (.csv)");
    expect(text).toContain("Excel-Arbeitsmappe (.xlsx)");
    expect(text).toContain("Excel 97–2004 (.xls)");
    expect(text).toContain("kein automatisch erzeugtes Excel-Diagramm");
    expect(text).toContain("Standard-Downloadordner");
  });
});
