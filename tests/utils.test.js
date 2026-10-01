import { fetchWithTimeout, shiftDateStringByDays } from "../assets/js/utils";

describe("shiftDateStringByDays", () => {
    test("increments by one day", () => {
        expect(shiftDateStringByDays("2026-03-01", 1)).toBe("2026-03-02");
    });

    test("decrements by one day across month boundary", () => {
        expect(shiftDateStringByDays("2026-03-01", -1)).toBe("2026-02-28");
    });

    test("clamps to max date when increment exceeds today", () => {
        expect(shiftDateStringByDays("2026-03-02", 1, "2026-03-02")).toBe("2026-03-02");
    });

    test("returns null for invalid input date", () => {
        expect(shiftDateStringByDays("2026-02-31", 1)).toBeNull();
    });
});

describe("fetchWithTimeout", () => {
    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    test("returns a response completed before the timeout", async () => {
        const response = { ok: true };
        global.fetch = jest.fn().mockResolvedValue(response);

        await expect(fetchWithTimeout("/data", {}, 50)).resolves.toBe(response);
        expect(global.fetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    });

    test("aborts and reports a request that exceeds the timeout", async () => {
        jest.useFakeTimers();
        global.fetch = jest.fn((resource, options) => new Promise((resolve, reject) => {
            options.signal.addEventListener("abort", () => {
                const error = new Error("Aborted");
                error.name = "AbortError";
                reject(error);
            });
        }));

        const request = fetchWithTimeout("/slow-data", {}, 50);
        const rejection = expect(request).rejects.toMatchObject({
            name: "TimeoutError",
            message: "Request timed out after 50 ms."
        });
        await jest.advanceTimersByTimeAsync(50);

        await rejection;
        expect(global.fetch.mock.calls[0][1].signal.aborted).toBe(true);
    });
});
