/**
 * @module chartManager
 * Centralized Chart.js lifecycle management.
 */

const chartMap = new Map();

export function destroyChart(canvas) {
  if (!canvas) {
    return;
  }
  const existing = chartMap.get(canvas.id);
  if (existing) {
    console.log("[chart] destroying", existing?.id);
    existing.destroy();
    chartMap.set(canvas.id, null);
  }
  const chartOnCanvas = Chart.getChart(canvas);
  if (chartOnCanvas) {
    console.log("[chart] destroying", chartOnCanvas?.id);
    chartOnCanvas.destroy();
  }
}

export function createChart(canvas, config) {
  if (!canvas) {
    return null;
  }
  destroyChart(canvas);
  console.log("[chart] creating", canvas.id);
  const ctx = canvas.getContext("2d");
  const chart = new Chart(ctx, config);
  chartMap.set(canvas.id, chart);
  return chart;
}

export function destroyAllCharts() {
  chartMap.forEach((chart) => {
    if (chart) {
      console.log("[chart] destroying", chart?.id);
      chart.destroy();
    }
  });
  chartMap.clear();
  ["plot-canvas", "temp-plot"].forEach((id) => {
    const canvas = document.getElementById(id);
    if (!canvas) {
      return;
    }
    const existing = Chart.getChart(canvas);
    if (existing) {
      console.log("[chart] destroying", existing?.id);
      existing.destroy();
    }
  });
}
