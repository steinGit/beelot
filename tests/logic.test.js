import { calculateGTS } from '../assets/js/logic';

describe('calculateGTS', () => {
    test('calculates cumulative GTS values correctly', () => {
        const dates = ['2025-01-01', '2025-01-02', '2025-01-03'];
        const values = [10, 15, 20];
        const result = calculateGTS(dates, values);
        expect(result).toEqual([
            { date: '2025-01-01', gts: 0 }, // First day has no cumulative GTS
            { date: '2025-01-02', gts: 7.5 }, // 15 * 0.5 = 7.5
            { date: '2025-01-03', gts: 17.5 }, // 7.5 + (20 * 0.5)
        ]);
    });
});
