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
    test('aligns historical calendar dates to the selected year across leap days', () => {
        document.body.innerHTML = '<canvas id="plot-canvas"></canvas>';
        const leapYearLabels = ['28.2', '29.2', '1.3', '2.3'];
        const newestYearLabels = ['28.2', '1.3', '2.3'];

        plotMultipleYearData([
            { year: 2024, labels: leapYearLabels, gtsValues: [10, 20, 30, 40] },
            { year: 2025, labels: newestYearLabels, gtsValues: newestYearLabels.map(() => 2) }
        ]);

        expect(lastChartConfig.data.labels).toEqual(newestYearLabels);
        expect(lastChartConfig.data.datasets[0].data).toEqual([10, 30, 40]);
        expect(lastChartConfig.data.datasets[1].data).toHaveLength(3);
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
        expect(chart.beelotExportDates).toEqual(['2026-01-01', '2026-01-02']);
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
    test('dashes only forecast segments and forces today onto the colored date axis', () => {
        jest.useFakeTimers().setSystemTime(new Date(2026, 3, 12, 12));
        try {
            document.body.innerHTML = '<canvas id="plot-canvas"></canvas>';
            const results = Array.from({ length: 28 }, (_, index) => ({
                date: `2026-04-${String(index + 1).padStart(2, '0')}`,
                gts: index,
                predicted: index >= 12
            }));
            plotData(results, null, 'queen', true);
            const segment = lastChartConfig.data.datasets[0].segment;
            expect(segment.borderDash({ p1DataIndex: 11 })).toBeUndefined();
            expect(segment.borderDash({ p1DataIndex: 12 })).toEqual([6, 4]);
            const x = lastChartConfig.options.scales.x;
            expect(x.ticks.callback(11, 11)).toBe('12.4');
            expect(x.ticks.color({ index: 11 })).toBe('#ff5555');
            expect(x.ticks.color({ index: 12 })).toBe('#ffffff');
            expect(x.ticks.callback(11, 1)).toBe('12.4');
            expect(x.ticks.color({ index: 1, tick: { value: 11 } })).toBe('#ff5555');
            expect(x.backgroundColor).toBe('#303030');
            expect(x.grid.color({ tick: { value: 11, label: '12.4' } })).toBe('#ff0000');
            expect(x.grid.lineWidth({ tick: { value: 11 } })).toBe(1.5);
            expect(x.grid.color({ tick: { value: 12, label: '13.4' } })).toBe('rgba(0, 0, 0, 0.1)');
            plotData(results.filter(point => !point.predicted), null, 'queen', false);
            expect(lastChartConfig.options.scales.x.ticks.color).toBeUndefined();
            expect(lastChartConfig.options.scales.x.grid.color({ tick: { value: 11, label: '12.4' } })).not.toBe('#ff0000');
            expect(lastChartConfig.data.datasets[0].segment.borderDash({ p1DataIndex: 11 })).toBeUndefined();
        } finally {
            jest.useRealTimers();
        }
    });
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
        expect(chart.beelotExportDates).toEqual(['2025-01-01', '2025-01-02']);
        expect(chart.destroy).toBeDefined(); // Ensures mock is working
    });
});

test('marks only the selected year as predicted in multi-year plots', () => {
    document.body.innerHTML = '<canvas id="plot-canvas"></canvas>';
    plotMultipleYearData([
        { year: 2026, labels: ['1.4', '2.4', '3.4'], gtsValues: [10, 20, 30], predictionStartIndex: 2 },
        { year: 2025, labels: ['1.4', '2.4'], gtsValues: [15, 25] }
    ], null, 'queen', true);
    expect(lastChartConfig.data.datasets[0].segment.borderDash({ p1DataIndex: 1 })).toBeUndefined();
    expect(lastChartConfig.data.datasets[0].segment.borderDash({ p1DataIndex: 2 })).toEqual([6, 4]);
    expect(lastChartConfig.data.datasets[1].segment.borderDash({ p1DataIndex: 2 })).toBeUndefined();
});

test('draws the today line in multi-year plots only when the actual date is visible', () => {
    jest.useFakeTimers().setSystemTime(new Date(2026, 9, 20, 12));
    try {
        document.body.innerHTML = '<canvas id="plot-canvas"></canvas>';
        const series = year => [
            { year, labels: ['19.10', '20.10', '21.10'], gtsValues: [10, 20, 30] },
            { year: year - 1, labels: ['19.10', '20.10', '21.10'], gtsValues: [9, 19, 29] }
        ];
        const tick = { tick: { value: 1, label: '20.10' } };
        plotMultipleYearData(series(2026), null, 'queen', true);
        expect(lastChartConfig.options.scales.x.grid.color(tick)).toBe('#ff0000');
        plotMultipleYearData(series(2026), null, 'queen', false);
        expect(lastChartConfig.options.scales.x.grid.color(tick)).not.toBe('#ff0000');
        plotMultipleYearData(series(2025), null, 'queen', true);
        expect(lastChartConfig.options.scales.x.grid.color(tick)).not.toBe('#ff0000');
        plotMultipleYearData([{ year: 2026, labels: ['1.4', '2.4'], gtsValues: [1, 2] }], null, 'queen', true);
        expect(lastChartConfig.options.scales.x.grid.color({ tick: { value: 1, label: '2.4' } })).not.toBe('#ff0000');
    } finally {
        jest.useRealTimers();
    }
});

test('keeps measured point markers when the forecast pushes the curve past 100 days', () => {
    document.body.innerHTML = '<canvas id="plot-canvas"></canvas>';
    const labels = Array.from({ length: 110 }, (_, index) => `day-${index}`);
    plotMultipleYearData([
        { year: 2026, labels, gtsValues: labels.map((_, i) => i), predictionStartIndex: 96 },
        { year: 2025, labels, gtsValues: labels.map((_, i) => i + 1) }
    ], null, 'queen', true);
    const datasets = lastChartConfig.data.datasets;
    expect(datasets[0].pointRadius({ dataIndex: 95 })).toBe(4);
    expect(datasets[0].pointRadius({ dataIndex: 96 })).toBe(0);
    expect(datasets[1].pointRadius({ dataIndex: 96 })).toBe(4);
});

test('formats actual and predicted GTS tooltip values to the same two decimals', () => {
    document.body.innerHTML = '<canvas id="plot-canvas"></canvas>';
    plotMultipleYearData([
        { year: 2026, labels: ['20.10', '21.10'], gtsValues: [3200, 3267.283], predictionStartIndex: 1 },
        { year: 2025, labels: ['20.10', '21.10'], gtsValues: [3100, 3201.5] }
    ], null, 'queen', true);
    const label = lastChartConfig.options.plugins.tooltip.callbacks.label;
    expect(label({ dataset: { label: '2026' }, datasetIndex: 0, dataIndex: 1, parsed: { y: 3267.283 } }))
        .toBe('2026 (Prädiktion): 3,267.28 °Cd');
    expect(label({ dataset: { label: '2025' }, datasetIndex: 1, dataIndex: 1, parsed: { y: 3201.5 } }))
        .toBe('2025: 3,201.50 °Cd');
});

test('uses the tick value after a sampled or rebuilt date axis and keeps its final date', () => {
    document.body.innerHTML = '<canvas id="plot-canvas"></canvas>';
    const results = Array.from({ length: 293 }, (_, index) => {
        const date = new Date(Date.UTC(2026, 0, index + 1));
        return { date: date.toISOString().slice(0, 10), gts: index };
    });
    plotData(results);
    const x = lastChartConfig.options.scales.x;
    expect(x.max).toBe(292);
    expect(x.ticks.callback(292, 2)).toBe('20.10');
    expect(x.ticks.align).toBe('inner');
    expect(x.ticks.maxTicksLimit).toBeUndefined();
});

describe('plotDailyTemps', () => {
    test('marks the chart as a temperature plot', () => {
        document.body.innerHTML = '<canvas id="temp-plot"></canvas>';
        const chart = plotDailyTemps(['2025-01-01'], [4]);
        expect(chart.beelotPlotType).toBe('temperature');
        expect(chart.beelotExportDates).toEqual(['2025-01-01']);
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
        const chart = plotComparisonData(labels, series, null, ['2025-01-01', '2025-01-02']);
        expect(chart).not.toBeNull();
        expect(chart.beelotPlotType).toBe('comparison');
        expect(chart.beelotExportDates).toEqual(['2025-01-01', '2025-01-02']);
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
