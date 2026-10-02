/**
 * @module plotExport
 * Exports the currently visible Chart.js data as spreadsheet-compatible CSV.
 */

const UTF8_BOM = "\uFEFF";
const VALID_PLOT_TYPES = new Set(["GTS", "temperature", "comparison"]);
const VALID_EXPORT_FORMATS = new Set(["csv", "xls", "xlsx"]);

function protectSpreadsheetCell(value) {
  if (typeof value !== "string") {
    return value;
  }
  return /^\s*[=+\-@]/.test(value) ? `'${value}` : value;
}

function encodeCsvCell(value) {
  if (value === null || value === undefined) {
    return "";
  }
  const protectedValue = protectSpreadsheetCell(value);
  const text = String(protectedValue);
  return /[",\r\n]/.test(text)
    ? `"${text.replace(/"/g, '""')}"`
    : text;
}

function buildCsv(rows) {
  return `${UTF8_BOM}${rows
    .map((row) => row.map(encodeCsvCell).join(","))
    .join("\r\n")}\r\n`;
}

function getVisibleDatasets(chart) {
  const datasets = Array.isArray(chart?.data?.datasets) ? chart.data.datasets : [];
  return datasets.filter((dataset, index) => {
    if (typeof chart.isDatasetVisible === "function") {
      return chart.isDatasetVisible(index);
    }
    return dataset.hidden !== true;
  });
}

function getAxisTitle(chart, axis, fallback) {
  const title = chart?.options?.scales?.[axis]?.title?.text;
  if (Array.isArray(title)) {
    return title.join(" ");
  }
  return typeof title === "string" && title.trim() ? title : fallback;
}

function getDataValue(dataset, index) {
  const value = Array.isArray(dataset.data) ? dataset.data[index] : null;
  if (value && typeof value === "object" && "y" in value) {
    return getFiniteValue(value.y);
  }
  return getFiniteValue(value);
}

function getFiniteValue(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : "";
  }
  return typeof value === "string" ? value : "";
}

function serializeColor(color) {
  if (typeof color === "string") {
    return color;
  }
  if (Array.isArray(color)) {
    return color.filter((entry) => typeof entry === "string").join(" | ");
  }
  return "";
}

/**
 * Builds a wide CSV table from the labels and visible datasets of a chart.
 * Series colors are appended as metadata because CSV cannot encode cell styles.
 */
function buildPlotRows(chart) {
  const labels = Array.isArray(chart?.data?.labels) ? chart.data.labels : [];
  const datasets = getVisibleDatasets(chart);
  if (labels.length === 0 || datasets.length === 0) {
    throw new Error("The chart has no visible data to export.");
  }

  const seriesLabels = datasets.map((dataset, index) => (
    typeof dataset.label === "string" && dataset.label.trim()
      ? dataset.label
      : `Series ${index + 1}`
  ));
  const columnCount = datasets.length + 1;
  return [
    [getAxisTitle(chart, "x", "X"), ...seriesLabels],
    ...labels.map((label, index) => [
      label,
      ...datasets.map((dataset) => getDataValue(dataset, index))
    ]),
    new Array(columnCount).fill(""),
    [
      "Y axis",
      getAxisTitle(chart, "y", "Y"),
      ...new Array(Math.max(0, datasets.length - 1)).fill("")
    ],
    ["Colors", ...seriesLabels],
    ["Line color", ...datasets.map((dataset) => serializeColor(dataset.borderColor))],
    ["Fill color", ...datasets.map((dataset) => serializeColor(dataset.backgroundColor))]
  ];
}

export function buildPlotCsv(chart) {
  return buildCsv(buildPlotRows(chart));
}

export function buildPlotFilename(plotType, exportFormat = "csv", now = new Date()) {
  if (!VALID_PLOT_TYPES.has(plotType)) {
    throw new TypeError(`Unsupported plot type: ${plotType}`);
  }
  if (!VALID_EXPORT_FORMATS.has(exportFormat)) {
    throw new TypeError(`Unsupported export format: ${exportFormat}`);
  }
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new TypeError("A valid download timestamp is required.");
  }
  const pad = (value) => String(value).padStart(2, "0");
  const timestamp = [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    "_",
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds())
  ].join("");
  return `${timestamp}__beelot_plot_${plotType}.${exportFormat}`;
}

function downloadBlob(blob, filename, documentRef, urlApi) {
  const url = urlApi.createObjectURL(blob);
  const link = documentRef.createElement("a");
  link.href = url;
  link.download = filename;
  link.hidden = true;
  documentRef.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => urlApi.revokeObjectURL(url), 0);
}

function buildWorkbook(chart, xlsxApi) {
  if (
    !xlsxApi?.utils
    || typeof xlsxApi.utils.aoa_to_sheet !== "function"
    || typeof xlsxApi.utils.book_new !== "function"
    || typeof xlsxApi.utils.book_append_sheet !== "function"
    || typeof xlsxApi.writeFile !== "function"
  ) {
    throw new Error("The Excel export library is unavailable.");
  }
  const rows = buildPlotRows(chart).map((row) => row.map(protectSpreadsheetCell));
  const worksheet = xlsxApi.utils.aoa_to_sheet(rows);
  const columnCount = Math.max(...rows.map((row) => row.length));
  worksheet["!cols"] = Array.from({ length: columnCount }, (_, columnIndex) => {
    const width = rows.reduce((maximum, row) => {
      const value = row[columnIndex];
      return Math.max(maximum, value === null || value === undefined ? 0 : String(value).length);
    }, 0);
    return { wch: Math.min(60, Math.max(10, width + 2)) };
  });
  const workbook = xlsxApi.utils.book_new();
  xlsxApi.utils.book_append_sheet(workbook, worksheet, "Plot data");
  return workbook;
}

export function downloadPlotData(chart, plotType, exportFormat, {
  documentRef = document,
  urlApi = URL,
  now = new Date(),
  xlsxApi = globalThis.XLSX
} = {}) {
  const filename = buildPlotFilename(plotType, exportFormat, now);
  if (exportFormat === "csv") {
    const blob = new Blob([buildPlotCsv(chart)], { type: "text/csv;charset=utf-8" });
    downloadBlob(blob, filename, documentRef, urlApi);
    return filename;
  }

  const workbook = buildWorkbook(chart, xlsxApi);
  xlsxApi.writeFile(workbook, filename, {
    bookType: exportFormat === "xls" ? "biff8" : "xlsx",
    compression: exportFormat === "xlsx",
    cellStyles: true
  });
  return filename;
}
