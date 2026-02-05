import { PlotUpdater } from '../assets/js/plotUpdater';

describe('PlotUpdater Ergebnis heute button', () => {
  const buildContext = () => ({
    ergebnisTextEl: document.createElement('p')
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
});
