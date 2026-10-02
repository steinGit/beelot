import { normalizeTrachtData } from "../assets/js/trachtDataValidation";

describe("normalizeTrachtData", () => {
  test("normalizes compatible rows and rejects malformed rows", () => {
    expect(normalizeTrachtData([
      {
        active: true,
        TS_start: "120",
        TS_end: 100,
        plant: "Hasel",
        url: "https://example.com"
      },
      {
        active: true,
        TS_start: "not-a-number",
        TS_end: 200,
        plant: "Invalid",
        url: ""
      },
      null
    ])).toEqual([{
      active: true,
      TS_start: 120,
      TS_end: 120,
      plant: "Hasel",
      url: "https://example.com"
    }]);
  });

  test("returns an empty list for a non-array root value", () => {
    expect(normalizeTrachtData({ TS_start: 100 })).toEqual([]);
  });
});
