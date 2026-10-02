import { fetchHistoricalData, fetchRecentData } from "../assets/js/dataService.js";
import { fetchMergedWeatherData } from "../assets/js/weatherData.js";

jest.mock("../assets/js/dataService.js", () => ({
  ...jest.requireActual("../assets/js/dataService.js"),
  fetchHistoricalData: jest.fn(),
  fetchRecentData: jest.fn()
}));

describe("fetchMergedWeatherData", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("fills missing historical temperatures without replacing measured values", async () => {
    fetchHistoricalData.mockResolvedValue({
      daily: {
        time: ["2026-03-28", "2026-03-29", "2026-03-30"],
        temperature_2m_mean: [8, null, 10]
      }
    });
    fetchRecentData.mockResolvedValue({
      daily: {
        time: ["2026-03-29", "2026-03-30"],
        temperature_2m_mean: [9, 99]
      }
    });

    const result = await fetchMergedWeatherData(
      48,
      9,
      new Date(2026, 2, 28),
      new Date(2026, 2, 30),
      new Date(2026, 2, 28),
      null,
      new Date(2026, 2, 30)
    );

    expect(result).toEqual({
      allDates: ["2026-03-28", "2026-03-29", "2026-03-30"],
      allTemps: [8, 9, 10]
    });
  });

  test("uses recent data when a current historical request fails", async () => {
    fetchHistoricalData.mockRejectedValue(new Error("archive unavailable"));
    fetchRecentData.mockResolvedValue({
      daily: {
        time: ["2026-03-30"],
        temperature_2m_mean: [12]
      }
    });

    const result = await fetchMergedWeatherData(
      48,
      9,
      new Date(2026, 2, 30),
      new Date(2026, 2, 30),
      new Date(2026, 2, 30),
      null,
      new Date(2026, 2, 30)
    );

    expect(result).toEqual({ allDates: ["2026-03-30"], allTemps: [12] });
    expect(fetchRecentData).toHaveBeenCalledTimes(1);
  });
});
