describe('fetchGTSForYear end-of-year behavior', () => {
    test('clamps end date within the target year when baseEndDate is Dec 31', async () => {
        jest.resetModules();
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({
                daily: {
                    time: ['2025-12-31'],
                    temperature_2m_mean: [10]
                }
            })
        });

        const { fetchGTSForYear } = await import('../assets/js/logic.js');
        const baseStartDate = new Date(2025, 11, 1);
        const baseEndDate = new Date(2025, 11, 31);

        await fetchGTSForYear(48.0, 9.0, 2025, baseStartDate, baseEndDate, false, null);

        expect(global.fetch).toHaveBeenCalledTimes(1);
        const requestUrl = global.fetch.mock.calls[0][0];
        const parsed = new URL(requestUrl);
        expect(parsed.searchParams.get('start_date')).toBe('2025-01-01');
        expect(parsed.searchParams.get('end_date')).toBe('2025-12-31');
    });

    test('does not request comparison years before the archive boundary', async () => {
        jest.resetModules();
        localStorage.clear();
        global.fetch = jest.fn().mockImplementation((requestUrl) => {
            const startDate = new URL(requestUrl).searchParams.get('start_date');
            return Promise.resolve({
                ok: true,
                json: async () => ({
                    daily: {
                        time: [startDate],
                        temperature_2m_mean: [10]
                    }
                })
            });
        });
        const { buildYearData } = await import('../assets/js/logic.js');

        const result = await buildYearData(
            48,
            9,
            new Date(1942, 0, 1),
            new Date(1942, 9, 1),
            [{ date: '1942-01-01', gts: 5 }],
            10
        );

        expect(result.map((entry) => entry.year)).toEqual([1942, 1941, 1940]);
        expect(global.fetch).toHaveBeenCalledTimes(2);
        global.fetch.mock.calls.forEach(([requestUrl]) => {
            const requestedYear = Number(new URL(requestUrl).searchParams.get('start_date').slice(0, 4));
            expect(requestedYear).toBeGreaterThanOrEqual(1940);
        });
    });

    test('rejects the whole comparison when a historical year cannot be loaded', async () => {
        jest.resetModules();
        localStorage.clear();
        global.fetch = jest.fn().mockRejectedValue(new Error('Network unavailable'));
        const { buildYearData } = await import('../assets/js/logic.js');

        await expect(buildYearData(
            48,
            9,
            new Date(2026, 0, 1),
            new Date(2026, 9, 1),
            [{ date: '2026-01-01', gts: 5 }],
            2
        )).rejects.toMatchObject({
            name: 'OpenMeteoError',
            message: 'Weather data unavailable for year 2025.'
        });
    });
});
