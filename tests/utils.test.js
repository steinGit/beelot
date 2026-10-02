import { shiftDateStringByDays } from "../assets/js/utils";

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
