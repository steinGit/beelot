import { getCachedData, setCachedData } from '../assets/js/dataService';

describe('getCachedData', () => {
    test('returns null if no data is cached', () => {
        localStorage.clear();
        expect(getCachedData('testKey')).toBeNull();
    });

    test('returns parsed data if cached', () => {
        const data = { key: 'value' };
        localStorage.setItem('testKey', JSON.stringify(data));
        expect(getCachedData('testKey')).toEqual(data);
    });

    test('returns null and clears invalid JSON cache entry', () => {
        localStorage.setItem('testKey', '{bad json');
        expect(getCachedData('testKey')).toBeNull();
        expect(localStorage.getItem('testKey')).toBeNull();
    });
});

describe('setCachedData', () => {
    test('saves data to localStorage', () => {
        const data = { key: 'value' };
        setCachedData('testKey', data);
        expect(localStorage.getItem('testKey')).toBe(JSON.stringify(data));
    });
});
