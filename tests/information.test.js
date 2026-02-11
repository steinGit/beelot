import { updateHinweisSection } from '../assets/js/information';

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
});
