import { beekeeperColor, plotData } from '../assets/js/charts';

beforeAll(() => {
    HTMLCanvasElement.prototype.getContext = jest.fn(() => ({}));
});

describe('beekeeperColor', () => {
    test('returns correct color for given years', () => {
        expect(beekeeperColor(2025)).toBe('blue');
        expect(beekeeperColor(2026)).toBe('grey');
        expect(beekeeperColor(2027)).toBe('#ddaa00');
        expect(beekeeperColor(2028)).toBe('red');
        expect(beekeeperColor(2029)).toBe('green');
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
        const chart = plotData(results);
        expect(chart).not.toBeNull();
        expect(chart.destroy).toBeDefined(); // Ensures mock is working
    });
});
