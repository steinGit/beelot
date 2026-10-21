import { updateHinweisSection } from '../assets/js/information';
import { defaultTrachtData } from '../assets/js/tracht_data';

describe('updateHinweisSection', () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = `<section class="hinweis-section"></section>`;
  });

  test('uses the shared forecast and renders three columns without uncertainty', async () => {
    localStorage.setItem('trachtData', JSON.stringify([
      { active: true, TS_start: 6, TS_end: 6, plant: 'Past' },
      { active: true, TS_start: 35, TS_end: 35, plant: 'Future' },
      { active: true, TS_start: 34, TS_end: 34, plant: 'Custom' }
    ]));
    const points = Array.from({ length: 14 }, (_, index) => ({ date: `2026-01-${String(8 + index).padStart(2, '0')}`, gts: 7 + (index + 1) * 2 }));
    await updateHinweisSection([
      { date: '2026-01-01', gts: 1 },
      { date: '2026-01-06', gts: 6 },
      { date: '2026-01-07', gts: 7 }
    ], new Date(2026, 0, 7), { prediction: { points }, settings: { historyYears: 10, horizonDays: 14 } });
    const rows = Array.from(document.querySelectorAll('.imker-info-table tr'));
    const future = rows.find(row => row.textContent.includes('Future'));
    expect(future.textContent).toContain('21.1.');
    expect(future.children).toHaveLength(3);
    expect(document.querySelectorAll('.imker-col-uncertainty')).toHaveLength(0);
    expect(document.querySelector('#prediction-horizon').value).toBe('14');
    expect(document.querySelector('.uncertainty-explanation')).toBeNull();
  });

  test('escapes forecast errors and does not retain the linear fallback', async () => {
    await updateHinweisSection([
      { date: '2026-01-01', gts: 0 }, { date: '2026-01-07', gts: 100 }
    ], new Date(2026, 0, 7), { prediction: { error: '<img src=x onerror=alert(1)>' }, settings: { horizonDays: 28 } });
    const section = document.querySelector('.hinweis-section');
    expect(section.querySelector('img')).toBeNull();
    expect(section.textContent).toContain('Prädiktion nicht verfügbar');
    expect(section.textContent).toContain('Keine Information zu den nächsten 28 Tagen');
    expect(section.textContent).not.toMatch(/In \d+ Tagen/);
  });

  test('preserves keyboard focus when rebuilding the preview selector', async () => {
    const observed = [{ date: '2026-01-07', gts: 7 }];
    await updateHinweisSection(observed, new Date(2026, 0, 7));
    document.getElementById('prediction-horizon').focus();
    await updateHinweisSection(observed, new Date(2026, 0, 7), { settings: { horizonDays: 21 } });
    expect(document.activeElement).toBe(document.getElementById('prediction-horizon'));
    expect(document.activeElement.value).toBe('21');
  });

  test('can predict a threshold from the first day of the year', async () => {
    localStorage.setItem('trachtData', JSON.stringify([{ active: true, TS_start: 35, TS_end: 35, plant: 'Early flower' }]));
    const points = Array.from({ length: 14 }, (_, index) => ({ date: `2026-01-${String(index + 2).padStart(2, '0')}`, gts: 35 + index }));
    await updateHinweisSection([{ date: '2026-01-01', gts: 0 }], new Date(2026, 0, 1), { prediction: { points } });
    expect(document.querySelector('.imker-info-table').textContent).toContain('Morgen am 2.1.');
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
