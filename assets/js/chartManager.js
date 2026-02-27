/**
 * @module chartManager
 * Centralized Chart.js lifecycle management.
 */

const chartMap = new Map();
const DEBUG_UI = false;

export function destroyChart(canvas) {
  if (!canvas) {
    return;
  }
  const existing = chartMap.get(canvas.id);
  if (existing) {
    existing.destroy();
    chartMap.set(canvas.id, null);
  }
  const chartOnCanvas = Chart.getChart(canvas);
  if (chartOnCanvas) {
    chartOnCanvas.destroy();
  }
}

export function createChart(canvas, config) {
  if (!canvas) {
    return null;
  }
  destroyChart(canvas);
  if (DEBUG_UI) {
    const container = canvas.parentElement;
    console.debug("[ui] chart container size", {
      canvasId: canvas.id,
      containerWidth: container ? container.clientWidth : null,
      containerHeight: container ? container.clientHeight : null
    });
  }
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return null;
  }
  const chart = new Chart(ctx, config);
  chartMap.set(canvas.id, chart);
  requestAnimationFrame(() => {
    if (chartMap.get(canvas.id) !== chart) {
      return;
    }
    if (!chart.canvas || !chart.canvas.isConnected) {
      return;
    }
    chart.resize();
    chart.update("none");
    if (DEBUG_UI) {
      console.debug("[ui] chart canvas size", {
        canvasId: canvas.id,
        canvasWidth: canvas.clientWidth,
        canvasHeight: canvas.clientHeight
      });
    }
  });
  return chart;
}

export function destroyAllCharts() {
  chartMap.forEach((chart) => {
    if (chart) {
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
      existing.destroy();
    }
  });
}
