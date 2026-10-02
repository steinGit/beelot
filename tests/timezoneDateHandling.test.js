import { execFileSync } from "node:child_process";
import process from "node:process";

describe("date-only handling across time zones", () => {
  test("preserves calendar dates, GTS weights, and full-year boundaries west of UTC", () => {
    const script = `
      import { calculateGTS, buildFullYearData } from './assets/js/logic.js';
      import { formatDayMonth } from './assets/js/utils.js';

      const gts = calculateGTS(
        ['2025-01-01', '2025-02-01', '2025-03-01'],
        [10, 10, 10]
      );
      const fullYear = await buildFullYearData(
        48,
        9,
        2026,
        1,
        new Date(2026, 0, 1),
        new Date(2026, 0, 3),
        null,
        [
          { date: '2026-01-01', gts: 1.1 },
          { date: '2026-01-02', gts: 2.2 },
          { date: '2026-01-03', gts: 3.3 }
        ]
      );
      console.log(JSON.stringify({ gts, label: formatDayMonth('2025-01-01'), fullYear }));
    `;
    const output = execFileSync(process.execPath, ["--input-type=module", "--eval", script], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, TZ: "America/Los_Angeles" }
    });

    expect(JSON.parse(output)).toEqual({
      gts: [
        { date: "2025-01-01", gts: 5 },
        { date: "2025-02-01", gts: 12.5 },
        { date: "2025-03-01", gts: 22.5 }
      ],
      label: "1.1",
      fullYear: [{
        year: 2026,
        labels: ["1.1", "2.1", "3.1"],
        gtsValues: [1.1, 2.2, 3.3]
      }]
    });
  });
});
