describe("chartManager", () => {
  let animationFrames;
  let chartInstances;

  beforeEach(() => {
    jest.resetModules();
    document.body.innerHTML = '<canvas id="plot-canvas"></canvas><canvas id="temp-plot"></canvas>';
    animationFrames = [];
    chartInstances = [];
    global.requestAnimationFrame = jest.fn((callback) => {
      animationFrames.push(callback);
      return animationFrames.length;
    });
    HTMLCanvasElement.prototype.getContext = jest.fn(function () {
      return { canvas: this };
    });
    global.Chart = class {
      static getChart = jest.fn(() => null);

      constructor(context, config) {
        this.canvas = context.canvas;
        this.config = config;
        this.destroy = jest.fn();
        this.resize = jest.fn();
        this.update = jest.fn();
        chartInstances.push(this);
      }
    };
  });

  afterEach(() => {
    delete global.requestAnimationFrame;
    delete global.Chart;
  });

  test("destroys the previous chart and resizes only the current chart", async () => {
    const { createChart } = await import("../assets/js/chartManager");
    const canvas = document.getElementById("plot-canvas");

    const first = createChart(canvas, { type: "line" });
    const second = createChart(canvas, { type: "bar" });

    expect(first.destroy).toHaveBeenCalledTimes(1);
    expect(second.config).toEqual({ type: "bar" });
    animationFrames[0]();
    expect(first.resize).not.toHaveBeenCalled();
    animationFrames[1]();
    expect(second.resize).toHaveBeenCalledTimes(1);
    expect(second.update).toHaveBeenCalledWith("none");
  });

  test("destroys tracked and Chart.js-discovered instances", async () => {
    const { createChart, destroyAllCharts } = await import("../assets/js/chartManager");
    const canvas = document.getElementById("plot-canvas");
    const tracked = createChart(canvas, { type: "line" });
    const discovered = { destroy: jest.fn() };
    global.Chart.getChart.mockImplementation((candidate) => (
      candidate.id === "temp-plot" ? discovered : null
    ));

    destroyAllCharts();

    expect(tracked.destroy).toHaveBeenCalledTimes(1);
    expect(discovered.destroy).toHaveBeenCalledTimes(1);
  });

  test("returns null when no renderable canvas context exists", async () => {
    const { createChart } = await import("../assets/js/chartManager");
    const canvas = document.getElementById("plot-canvas");
    canvas.getContext.mockReturnValueOnce(null);

    expect(createChart(null, {})).toBeNull();
    expect(createChart(canvas, {})).toBeNull();
    expect(chartInstances).toHaveLength(0);
  });
});
