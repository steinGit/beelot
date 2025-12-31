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
});
