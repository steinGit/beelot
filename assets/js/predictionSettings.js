/** Persist and validate the shared prediction preferences. */
export const PREDICTION_SETTINGS_KEY = 'beelotPredictionSettings';
export const DEFAULT_PREDICTION_SETTINGS = Object.freeze({
    historyYears: 10,
    horizonDays: 14,
    showPrediction: true
});

export function normalizePredictionSettings(value) {
    const years = value?.historyYears;
    return {
        historyYears: Number.isInteger(years) && years >= 3 && years <= 10
            ? years : DEFAULT_PREDICTION_SETTINGS.historyYears,
        horizonDays: [14, 21, 28].includes(value?.horizonDays)
            ? value.horizonDays : DEFAULT_PREDICTION_SETTINGS.horizonDays,
        showPrediction: typeof value?.showPrediction === 'boolean'
            ? value.showPrediction : DEFAULT_PREDICTION_SETTINGS.showPrediction
    };
}

export function loadPredictionSettings() {
    try {
        return normalizePredictionSettings(JSON.parse(localStorage.getItem(PREDICTION_SETTINGS_KEY)));
    } catch (error) {
        console.warn('[prediction] Could not read prediction settings.', error);
        return { ...DEFAULT_PREDICTION_SETTINGS };
    }
}

export function savePredictionSettings(changes) {
    const settings = normalizePredictionSettings({ ...loadPredictionSettings(), ...changes });
    try {
        localStorage.setItem(PREDICTION_SETTINGS_KEY, JSON.stringify(settings));
    } catch (error) {
        console.warn('[prediction] Could not save prediction settings.', error);
    }
    return settings;
}
