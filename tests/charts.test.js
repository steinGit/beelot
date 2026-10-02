import {
    beekeeperColor,
    plotComparisonData,
    plotDailyTemps,
    plotData,
    plotMultipleYearData
} from '../assets/js/charts';

let lastChartConfig = null;

beforeAll(() => {
    HTMLCanvasElement.prototype.getContext = jest.fn(() => ({}));
    global.Chart = class {
        constructor(ctx, config) {
            this.destroy = jest.fn();
            this.resize = jest.fn();
            this.update = jest.fn();
            this.canvas = document.querySelector('canvas');
            lastChartConfig = config;
        }
    };
    global.Chart.getChart = jest.fn(() => null);
});

beforeEach(() => {
    lastChartConfig = null;
});

describe('beekeeperColor', () => {
    test('returns correct color for given years', () => {
        expect(beekeeperColor(2025)).toBe('blue');
        expect(beekeeperColor(2026)).toBe('rgb(150, 150, 150)');
        expect(beekeeperColor(2027)).toBe('#ddaa00');
        expect(beekeeperColor(2028)).toBe('red');
        expect(beekeeperColor(2029)).toBe('green');
        expect(beekeeperColor(2030)).toBe('blue');
    });
});

describe('plotMultipleYearData', () => {
    test('uses labels from the newest year when leap-year curve lengths differ', () => {
        document.body.innerHTML = '<canvas id="plot-canvas"></canvas>';
        const leapYearLabels = Array.from({ length: 366 }, (_, index) => `leap-${index + 1}`);
        const newestYearLabels = Array.from({ length: 120 }, (_, index) => `current-${index + 1}`);

        plotMultipleYearData([
            { year: 2024, labels: leapYearLabels, gtsValues: leapYearLabels.map(() => 1) },
            { year: 2025, labels: newestYearLabels, gtsValues: newestYearLabels.map(() => 2) }
        ]);

        expect(lastChartConfig.data.labels).toEqual(newestYearLabels);
        expect(lastChartConfig.data.datasets[0].data).toHaveLength(366);
        expect(lastChartConfig.data.datasets[1].data).toHaveLength(120);
    });

    test('uses lighter queen colors for older years in the same cycle', () => {
        document.body.innerHTML = '<canvas id="plot-canvas"></canvas>';
        const years = [2026, 2025, 2024, 2023, 2022, 2021];
        const multiYearData = years.map((year) => ({
            year,
            labels: ['01.01', '02.01'],
            gtsValues: [1, 2]
        }));

        const chart = plotMultipleYearData(multiYearData, null, 'queen');
        expect(chart).not.toBeNull();
        expect(chart.beelotPlotType).toBe('GTS');
        expect(lastChartConfig).not.toBeNull();
        const datasets = lastChartConfig.data.datasets;

        const baseColors = years.map((year) => beekeeperColor(year));
        const lighten = (color) => {
            const map = {
                blue: [0, 0, 255],
                red: [255, 0, 0],
                green: [0, 128, 0],
                '#ddaa00': [221, 170, 0]
            };
            if (color === 'rgb(150, 150, 150)') {
                return 'rgb(190, 190, 190)';
            }
            if (color.startsWith('rgb(')) {
                const match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
                if (!match) {
                    return color;
                }
                return `rgb(${Math.round(Number(match[1]) + (255 - Number(match[1])) * 0.65)}, ${Math.round(Number(match[2]) + (255 - Number(match[2])) * 0.65)}, ${Math.round(Number(match[3]) + (255 - Number(match[3])) * 0.65)})`;
            }
            const rgb = map[color];
            if (!rgb) {
                return color;
            }
            const [r, g, b] = rgb;
            return `rgb(${Math.round(r + (255 - r) * 0.65)}, ${Math.round(g + (255 - g) * 0.65)}, ${Math.round(b + (255 - b) * 0.65)})`;
        };

        baseColors.slice(0, 5).forEach((color, index) => {
            expect(datasets[index].borderColor).toBe(color);
        });
        expect(datasets[5].borderColor).toBe(lighten(baseColors[5]));
    });
});

describe('plotData', () => {
    test('returns null for empty input', () => {
        expect(plotData([])).toBeNull();
    });

    test('plots data when input is valid', () => {
        document.body.innerHTML = '<canvas id="plot-canvas"></canvas>';
        const results = [
            { date: '2025-01-01', gts: 15 },
            { date: '2025-01-02', gts: 20 },
        ];
        const chart = plotData(results, null, 'queen');
        expect(chart).not.toBeNull();
        expect(chart.beelotPlotType).toBe('GTS');
        expect(chart.destroy).toBeDefined(); // Ensures mock is working
    });
});

describe('plotDailyTemps', () => {
    test('marks the chart as a temperature plot', () => {
        document.body.innerHTML = '<canvas id="temp-plot"></canvas>';
        const chart = plotDailyTemps(['2025-01-01'], [4]);
        expect(chart.beelotPlotType).toBe('temperature');
    });
});

describe('plotComparisonData', () => {
    test('uses provided labels and colors', () => {
        document.body.innerHTML = '<canvas id="plot-canvas"></canvas>';
        const labels = ['01.01', '02.01'];
        const series = [
            { label: 'Standort A', values: [1, 2], color: 'red' },
            { label: 'Standort B', values: [2, 3], color: 'green' }
        ];
        const chart = plotComparisonData(labels, series);
        expect(chart).not.toBeNull();
        expect(chart.beelotPlotType).toBe('comparison');
        expect(lastChartConfig.data.labels).toEqual(labels);
        expect(lastChartConfig.data.datasets[0].borderColor).toBe('red');
        expect(lastChartConfig.data.datasets[1].borderColor).toBe('green');
    });

    test('recomputes x-axis label spacing after an initially hidden canvas becomes visible', () => {
        document.body.innerHTML = '<canvas id="plot-canvas" width="0"></canvas>';
        const canvas = document.querySelector('#plot-canvas');
        Object.defineProperty(canvas, 'clientWidth', { configurable: true, value: 0 });
        const labels = Array.from({ length: 365 }, (_, index) => `${index + 1}.1`);
        const series = [{ label: 'Standort A', values: labels.map((_, index) => index), color: 'red' }];

        plotComparisonData(labels, series);
        Object.defineProperty(canvas, 'clientWidth', { configurable: true, value: 800 });

        const callback = lastChartConfig.options.scales.x.ticks.callback;
        const visibleLabels = labels.filter((_, index) => (
            callback.call({ chart: { canvas } }, index, index, []) !== ''
        ));
        expect(visibleLabels.length).toBeGreaterThan(2);
        expect(visibleLabels.length).toBeLessThanOrEqual(30);
        expect(visibleLabels[0]).toBe(labels[0]);
        expect(visibleLabels.at(-1)).toBe(labels.at(-1));
    });

    test('leaves enough space before the final x-axis label', () => {
        document.body.innerHTML = '<canvas id="plot-canvas"></canvas>';
        const canvas = document.querySelector('#plot-canvas');
        Object.defineProperty(canvas, 'clientWidth', { configurable: true, value: 800 });
        const labels = Array.from({ length: 275 }, (_, index) => `day-${index + 1}`);
        const series = [{ label: 'Standort A', values: labels.map((_, index) => index), color: 'red' }];

        plotComparisonData(labels, series);

        const callback = lastChartConfig.options.scales.x.ticks.callback;
        const visibleIndices = labels
            .map((_, index) => index)
            .filter((index) => callback.call({ chart: { canvas } }, index, index, []) !== '');
        const regularGap = visibleIndices[1] - visibleIndices[0];
        const finalGap = visibleIndices.at(-1) - visibleIndices.at(-2);
        expect(finalGap).toBeGreaterThanOrEqual(regularGap);
        expect(visibleIndices.at(-1)).toBe(labels.length - 1);
    });
});
