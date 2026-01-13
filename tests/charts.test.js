import { beekeeperColor, plotData, plotMultipleYearData } from '../assets/js/charts';

let lastChartConfig = null;

beforeAll(() => {
    HTMLCanvasElement.prototype.getContext = jest.fn(() => ({}));
    global.Chart = class {
        constructor(ctx, config) {
            this.destroy = jest.fn();
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
        expect(beekeeperColor(2026)).toBe('rgb(180, 180, 180)');
        expect(beekeeperColor(2027)).toBe('red');
        expect(beekeeperColor(2028)).toBe('green');
        expect(beekeeperColor(2029)).toBe('#ddaa00');
        expect(beekeeperColor(2030)).toBe('blue');
    });
});

describe('plotMultipleYearData', () => {
    test('uses lighter queen colors for older years in the same cycle', () => {
        document.body.innerHTML = '<canvas id="plot-canvas"></canvas>';
        window.gtsColorScheme = 'queen';
        const years = [2026, 2025, 2024, 2023, 2022, 2021];
        const multiYearData = years.map((year) => ({
            year,
            labels: ['01.01', '02.01'],
            gtsValues: [1, 2]
        }));

        const chart = plotMultipleYearData(multiYearData);
        expect(chart).not.toBeNull();
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
        window.gtsColorScheme = 'queen';
        const results = [
            { date: '2025-01-01', gts: 15 },
            { date: '2025-01-02', gts: 20 },
        ];
        const chart = plotData(results);
        expect(chart).not.toBeNull();
        expect(chart.destroy).toBeDefined(); // Ensures mock is working
    });
});
