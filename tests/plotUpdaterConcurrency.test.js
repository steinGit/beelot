import { PlotUpdater } from '../assets/js/plotUpdater.js';
import * as store from '../assets/js/locationStore.js';
import { fetchHistoricalData, fetchRecentData } from '../assets/js/dataService.js';
import { plotData, plotDailyTemps, plotMultipleYearData } from '../assets/js/charts.js';
import { buildYearData } from '../assets/js/logic.js';
import { LocationNameFromGPS } from '../assets/js/location_name_from_gps.js';
import { formatDateLocal } from '../assets/js/utils.js';

jest.mock('../assets/js/charts.js', () => ({
  plotData: jest.fn(), plotDailyTemps: jest.fn(), plotMultipleYearData: jest.fn()
}));
jest.mock('../assets/js/chartManager.js', () => ({ destroyAllCharts: jest.fn() }));
jest.mock('../assets/js/dataService.js', () => ({
  ...jest.requireActual('../assets/js/dataService.js'),
  fetchHistoricalData: jest.fn(), fetchRecentData: jest.fn()
}));
jest.mock('../assets/js/logic.js', () => ({
  ...jest.requireActual('../assets/js/logic.js'),
  buildYearData: jest.fn(), buildFullYearData: jest.fn()
}));
jest.mock('../assets/js/information.js', () => ({
  updateHinweisSection: jest.fn(async (results) => {
    global.document.querySelector('.hinweis-section').textContent = String(results.at(-1).gts);
  })
}));

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const weather = (temp) => ({ daily: {
  time: ['2025-01-01', '2025-01-02'], temperature_2m_mean: [temp, temp]
} });

let updater, a, b;
const location = (id) => store.getLocationById(id);
const switchTo = (id) => { store.setActiveLocation(id); updater.setLocationId(id); };

beforeEach(() => {
  jest.clearAllMocks();
  document.body.innerHTML = `
    <input id="datum" value="2025-01-02">
    <select id="zeitraum"><option value="ytd">Year</option><option value="7">Week</option></select>
    <p id="result"></p><p id="name"></p><section class="hinweis-section"></section>
    <div id="gts"><canvas id="gtsChart"></canvas></div>
    <div id="temp"><canvas id="tempChart"></canvas></div>`;
  window.gtsYearRange = 1;
  window.gtsColorScheme = 'year';
  global.Chart = { getChart: jest.fn() };
  buildYearData.mockResolvedValue([]);
  fetchHistoricalData.mockReset();
  fetchRecentData.mockReset();
  jest.spyOn(LocationNameFromGPS.prototype, 'getLocationName').mockResolvedValue('Test location');
  a = store.createLocationEntry().id;
  b = store.createLocationEntry().id;
  store.updateLocation(a, (entry) => { entry.coordinates = { lat: 48, lon: 9 }; });
  store.updateLocation(b, (entry) => { entry.coordinates = { lat: 52, lon: 13 }; });
  store.setActiveLocation(a);
  updater = new PlotUpdater({
    locationId: a,
    datumInput: document.querySelector('#datum'),
    zeitraumSelect: document.querySelector('#zeitraum'),
    ergebnisTextEl: document.querySelector('#result'),
    hinweisSection: document.querySelector('.hinweis-section'),
    gtsPlotContainer: document.querySelector('#gts'),
    tempPlotContainer: document.querySelector('#temp'),
    locationNameOutput: document.querySelector('#name')
  });
});
afterEach(() => {
  jest.restoreAllMocks();
  store.deleteLocationEntry(a);
  store.deleteLocationEntry(b);
});

test('location ownership survives the weather await and an inactive result is retained', async () => {
  const pending = deferred();
  fetchHistoricalData.mockReturnValueOnce(pending.promise);
  const run = updater.run();
  expect(fetchHistoricalData).toHaveBeenCalledTimes(1);
  switchTo(b);
  const beforeB = JSON.stringify(location(b).calculations);
  pending.resolve(weather(10));
  await run;
  expect(location(a).calculations.temps.values).toEqual([10, 10]);
  expect(JSON.stringify(location(b).calculations)).toBe(beforeB);
  expect(plotData).not.toHaveBeenCalled();
});

test('out-of-order locations store both results but only display the newer request', async () => {
  const first = deferred(), second = deferred();
  fetchHistoricalData.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  const oldRun = updater.run();
  switchTo(b);
  const newRun = updater.run();
  second.resolve(weather(20));
  await newRun;
  const displayed = document.body.innerHTML;
  first.resolve(weather(10));
  await oldRun;
  expect(location(a).calculations.temps.values).toEqual([10, 10]);
  expect(location(b).calculations.temps.values).toEqual([20, 20]);
  expect(plotData).toHaveBeenCalledTimes(1);
  expect(plotDailyTemps).toHaveBeenCalledTimes(1);
  expect(document.body.innerHTML).toBe(displayed);
});

test('a normal run stores calculations and displays both charts and hints', async () => {
  fetchHistoricalData.mockResolvedValueOnce(weather(10));
  await updater.run();
  const result = location(a).calculations;
  expect(result.temps.values).toEqual([10, 10]);
  expect(result.gtsResults.at(-1).gts).toBe(10);
  expect(result.lastGtsKey).toBe('2025-01-02|ytd');
  expect(result.hinweisHtml).toBe('10');
  expect(plotData).toHaveBeenCalledWith(result.filteredResults, { min: 0, max: 10 });
  expect(plotDailyTemps).toHaveBeenCalledWith(result.temps.dates, [10, 10], { min: 10, max: 10 });
  expect(document.querySelector('#result').textContent).toContain('10.0');
});

test('a trailing missing historical temperature is repaired with recent data', async () => {
  const endDate = new Date();
  endDate.setHours(0, 0, 0, 0);
  const recentStartDate = new Date(endDate);
  recentStartDate.setDate(recentStartDate.getDate() - 2);
  const middleDate = new Date(recentStartDate);
  middleDate.setDate(middleDate.getDate() + 1);
  const historicalDates = [recentStartDate, middleDate, endDate].map(formatDateLocal);
  fetchHistoricalData.mockResolvedValueOnce({
    daily: {
      time: historicalDates,
      temperature_2m_mean: [8, 10, null]
    }
  });
  fetchRecentData.mockResolvedValueOnce({
    daily: {
      time: [formatDateLocal(endDate)],
      temperature_2m_mean: [12]
    }
  });

  const result = await updater.step7FetchAllData(
    48,
    9,
    new Date(endDate.getFullYear(), 0, 1),
    endDate,
    recentStartDate,
    0
  );

  expect(fetchRecentData).toHaveBeenCalledWith(
    48,
    9,
    endDate,
    endDate,
    expect.any(Object)
  );
  expect(result).toEqual({
    allDates: historicalDates,
    allTemps: [8, 10, 12]
  });
});

test('an impossible calendar date does not start a weather request', async () => {
  document.querySelector('#datum').value = '1962-02-30';

  await updater.run();

  expect(fetchHistoricalData).not.toHaveBeenCalled();
  expect(fetchRecentData).not.toHaveBeenCalled();
});

test('an older request for the same location cannot replace newer calculations', async () => {
  const first = deferred();
  fetchHistoricalData.mockReturnValueOnce(first.promise).mockResolvedValueOnce(weather(20));
  const oldRun = updater.run();
  await updater.run();
  first.resolve(weather(10));
  await oldRun;
  expect(location(a).calculations.temps.values).toEqual([20, 20]);
  expect(plotData).toHaveBeenCalledTimes(1);
});

test('a late multi-year response caches for its owner without replacing the newer chart', async () => {
  const pending = deferred(), entered = deferred();
  window.gtsYearRange = 3;
  fetchHistoricalData.mockResolvedValue(weather(10));
  buildYearData.mockImplementationOnce(() => { entered.resolve(); return pending.promise; });
  const oldRun = updater.run();
  await entered.promise;
  switchTo(b);
  window.gtsYearRange = 1;
  document.querySelector('#zeitraum').value = '7';
  await updater.run();
  const displayed = document.body.innerHTML;
  pending.resolve([{ year: 2025, labels: ['01-01'], gtsValues: [5] }]);
  await oldRun;
  expect(location(a).calculations.gtsYearCurves['2025-01-02|ytd|3']).toHaveLength(1);
  expect(location(b).calculations.gtsYearCurves['2025-01-02|ytd|3']).toBeUndefined();
  expect(plotMultipleYearData).not.toHaveBeenCalled();
  expect(document.body.innerHTML).toBe(displayed);
});

test('a stale weather failure does not replace a newer successful display', async () => {
  const pending = deferred();
  fetchHistoricalData.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(weather(20));
  const oldRun = updater.run();
  switchTo(b);
  await updater.run();
  const displayed = document.body.innerHTML;
  pending.reject(new Error('Old request failed'));
  await oldRun;
  expect(document.body.innerHTML).toBe(displayed);
});

test('weather fallback after switching keeps the original cache owner', async () => {
  const pending = deferred();
  fetchHistoricalData.mockReturnValueOnce(pending.promise);
  fetchRecentData.mockImplementationOnce(async (lat, lon, start, end, cache) => {
    const response = weather(10);
    cache.set('fallback', response);
    return response;
  });
  const run = updater.run();
  switchTo(b);
  pending.resolve({ daily: { time: ['2025-01-01'], temperature_2m_mean: [10] } });
  await run;
  expect(location(a).cache.weather.fallback).toEqual(weather(10));
  expect(location(b).cache.weather.fallback).toBeUndefined();
  expect(location(a).calculations.temps.values).toEqual([10, 10]);
});

test('a late location name is stored for its owner without changing the newer label', async () => {
  const pending = deferred();
  LocationNameFromGPS.prototype.getLocationName
    .mockReturnValueOnce(pending.promise).mockResolvedValueOnce('Location B');
  fetchHistoricalData.mockResolvedValue(weather(10));
  await updater.run();
  switchTo(b);
  await updater.run();
  pending.resolve('Location A');
  await pending.promise;
  expect(location(a).calculations.locationLabel).toBe('Location A');
  expect(location(b).calculations.locationLabel).toBe('Location B');
  expect(document.querySelector('#name').textContent).toBe('In der Nähe von: Location B');
});

test('switching to a non-location view invalidates display but preserves pending data', async () => {
  const pending = deferred();
  fetchHistoricalData.mockReturnValueOnce(pending.promise);
  const run = updater.run();
  updater.invalidatePendingDisplay();
  document.querySelector('#result').textContent = 'Comparison view';
  pending.resolve(weather(10));
  await run;
  expect(location(a).calculations.temps.values).toEqual([10, 10]);
  expect(document.querySelector('#result').textContent).toBe('Comparison view');
  expect(plotData).not.toHaveBeenCalled();
});
