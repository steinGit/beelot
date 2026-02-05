import { shouldSwitchLocation } from '../assets/js/locationSwitching';

describe('shouldSwitchLocation', () => {
  test('switches when target differs', () => {
    expect(shouldSwitchLocation({
      currentId: "loc-1",
      targetId: "loc-2",
      comparisonActive: false
    })).toBe(true);
  });

  test('switches when comparison is active and target matches current', () => {
    expect(shouldSwitchLocation({
      currentId: "loc-1",
      targetId: "loc-1",
      comparisonActive: true
    })).toBe(true);
  });

  test('does not switch when target matches and comparison is inactive', () => {
    expect(shouldSwitchLocation({
      currentId: "loc-1",
      targetId: "loc-1",
      comparisonActive: false
    })).toBe(false);
  });

  test('does not switch when target is missing', () => {
    expect(shouldSwitchLocation({
      currentId: "loc-1",
      targetId: "",
      comparisonActive: true
    })).toBe(false);
  });
});
