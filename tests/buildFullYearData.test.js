import { buildFullYearData } from "../assets/js/logic";

describe("buildFullYearData", () => {
  test("reuses provided current-year data without fetching", async () => {
    global.fetch = jest.fn(() => {
      throw new Error("fetch should not be called");
    });

    const currentYearData = [
      { date: "2026-01-01", gts: 1.1 },
      { date: "2026-01-02", gts: 2.2 },
      { date: "2026-01-03", gts: 3.3 }
    ];

    const result = await buildFullYearData(
      48.0,
      9.0,
      2026,
      1,
      new Date(2026, 0, 1),
      new Date(2026, 0, 3),
      null,
      currentYearData
    );

    expect(global.fetch).not.toHaveBeenCalled();
    expect(result).toEqual([
      {
        year: 2026,
        labels: ["1.1", "2.1", "3.1"],
        gtsValues: [1.1, 2.2, 3.3]
      }
    ]);
  });
});
