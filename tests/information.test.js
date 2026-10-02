import { updateHinweisSection } from '../assets/js/information';
import { defaultTrachtData } from '../assets/js/tracht_data';

describe('updateHinweisSection', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = `<section class="hinweis-section"></section>`;
  });

  test('uses "Gestern" when a forecast item is one day in the past', async () => {
    const endDate = new Date(2026, 0, 7);
    const gtsResults = [
      { date: "2026-01-01", gts: 1 },
      { date: "2026-01-02", gts: 2 },
      { date: "2026-01-03", gts: 3 },
      { date: "2026-01-04", gts: 4 },
      { date: "2026-01-05", gts: 5 },
      { date: "2026-01-06", gts: 6 },
      { date: "2026-01-07", gts: 7 }
    ];

    const trachtData = [
      { TS_start: 6, plant: "Testpflanze", url: "https://example.com", active: true }
    ];
    localStorage.setItem("trachtData", JSON.stringify(trachtData));

    await updateHinweisSection(gtsResults, endDate);

    const section = document.querySelector(".hinweis-section");
    expect(section).not.toBeNull();
    expect(section.innerHTML).toContain("Gestern am");
  });

  test("escapes plant labels and rejects non-http URLs", async () => {
    const endDate = new Date(2026, 0, 7);
    const gtsResults = [
      { date: "2026-01-01", gts: 1 },
      { date: "2026-01-02", gts: 2 },
      { date: "2026-01-03", gts: 3 },
      { date: "2026-01-04", gts: 4 },
      { date: "2026-01-05", gts: 5 },
      { date: "2026-01-06", gts: 6 },
      { date: "2026-01-07", gts: 7 }
    ];

    const trachtData = [
      {
        TS_start: 6,
        plant: '<img src=x onerror=alert("xss")>',
        url: "javascript:alert('xss')",
        active: true
      }
    ];
    localStorage.setItem("trachtData", JSON.stringify(trachtData));

    await updateHinweisSection(gtsResults, endDate);

    const section = document.querySelector(".hinweis-section");
    expect(section).not.toBeNull();
    expect(section.innerHTML).toContain("&lt;img src=x onerror=alert(\"xss\")&gt;");
    expect(section.innerHTML).not.toContain("javascript:alert");
    expect(section.querySelector("a[href^='javascript:']")).toBeNull();
  });

  test("rejects non-numeric thresholds before building template HTML", async () => {
    localStorage.setItem("trachtData", JSON.stringify([{
      TS_start: '"><img src=x onerror=alert("threshold")>',
      TS_end: 10,
      plant: "Injected threshold",
      url: "https://example.com",
      active: true
    }]));

    await updateHinweisSection([
      { date: "2026-01-01", gts: 1 },
      { date: "2026-01-07", gts: 7 }
    ], new Date(2026, 0, 7));

    const section = document.querySelector(".hinweis-section");
    expect(section.innerHTML).not.toContain("onerror");
    expect(section.textContent).not.toContain("Injected threshold");
    expect(JSON.parse(localStorage.getItem("trachtData"))).toEqual([]);
  });

  test("preserves a custom entry without a URL", async () => {
    const customData = [{
      TS_start: 6,
      TS_end: 6,
      plant: "Eigene Trachtpflanze",
      url: "",
      active: true
    }];
    localStorage.setItem("trachtData", JSON.stringify(customData));

    await updateHinweisSection([
      { date: "2026-01-01", gts: 1 },
      { date: "2026-01-07", gts: 7 }
    ], new Date(2026, 0, 7));

    expect(JSON.parse(localStorage.getItem("trachtData"))).toEqual(customData);
    expect(document.querySelector(".hinweis-section").textContent)
      .toContain("Eigene Trachtpflanze");
  });

  test("preserves an intentionally empty custom list", async () => {
    localStorage.setItem("trachtData", "[]");

    await updateHinweisSection([
      { date: "2026-01-07", gts: 7 }
    ], new Date(2026, 0, 7));

    expect(localStorage.getItem("trachtData")).toBe("[]");
    expect(document.querySelector(".hinweis-section").textContent)
      .not.toContain(defaultTrachtData[0].plant);
  });

  test("renders safely without overwriting malformed stored data", async () => {
    const warning = jest.spyOn(console, "warn").mockImplementation(() => {});
    localStorage.setItem("trachtData", "{broken json");

    await expect(updateHinweisSection([
      { date: "2026-01-07", gts: 7 }
    ], new Date(2026, 0, 7))).resolves.toBeUndefined();

    expect(localStorage.getItem("trachtData")).toBe("{broken json");
    expect(document.querySelector(".hinweis-section").textContent)
      .toContain("Imkerliche Information");
    expect(warning).toHaveBeenCalled();
    warning.mockRestore();
  });

  test("adds a missing URL to a known default plant without replacing the list", async () => {
    const defaultRow = defaultTrachtData.find((row) => row.url);
    const storedRow = {
      active: defaultRow.active,
      TS_start: defaultRow.TS_start,
      TS_end: defaultRow.TS_end,
      plant: defaultRow.plant
    };
    localStorage.setItem("trachtData", JSON.stringify([storedRow]));

    await updateHinweisSection([
      { date: "2026-01-07", gts: 7 }
    ], new Date(2026, 0, 7));

    expect(JSON.parse(localStorage.getItem("trachtData"))).toEqual([
      { ...storedRow, url: defaultRow.url }
    ]);
  });
});
