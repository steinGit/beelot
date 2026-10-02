import { PlotUpdater } from '../assets/js/plotUpdater';
import { resetServiceFailures } from '../assets/js/externalServiceStatus';

describe('PlotUpdater Ergebnis heute button', () => {
  const buildContext = () => ({
    ergebnisTextEl: document.createElement('p')
  });

  beforeEach(() => {
    document.body.innerHTML = '<div id="service-status" hidden></div>';
    resetServiceFailures();
  });

  test('shows heute button when endDate is not today', () => {
    const ctx = buildContext();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    PlotUpdater.prototype.step12UpdateErgebnisText.call(ctx, [{ gts: 12.3 }], yesterday);

    expect(ctx.ergebnisTextEl.querySelector('#ergebnis-heute')).not.toBeNull();
  });

  test('hides heute button when endDate is today', () => {
    const ctx = buildContext();
    const today = new Date();

    PlotUpdater.prototype.step12UpdateErgebnisText.call(ctx, [{ gts: 12.3 }], today);

    expect(ctx.ergebnisTextEl.querySelector('#ergebnis-heute')).toBeNull();
  });

  test('identifies Open-Meteo failures in red instead of claiming generic offline mode', () => {
    const ctx = buildContext();

    PlotUpdater.prototype.showWeatherServiceMessage.call(ctx);

    expect(ctx.ergebnisTextEl.textContent).toContain('Open-Meteo');
    expect(ctx.ergebnisTextEl.classList.contains('service-error-text')).toBe(true);
    expect(document.getElementById('service-status').textContent).toContain('Open-Meteo');
  });
});
