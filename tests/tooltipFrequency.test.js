import { createTooltipGate } from '../assets/js/tooltipFrequency';

describe('createTooltipGate', () => {
  test('shows only every Nth time', () => {
    const storage = {
      getItem: jest.fn(() => null),
      setItem: jest.fn()
    };
    const gate = createTooltipGate({ key: "k", every: 10, storage });

    for (let i = 1; i <= 9; i += 1) {
      expect(gate.shouldShow()).toBe(false);
    }
    expect(gate.shouldShow()).toBe(true);

    for (let i = 1; i <= 9; i += 1) {
      expect(gate.shouldShow()).toBe(false);
    }
    expect(gate.shouldShow()).toBe(true);
  });

  test('uses stored counter as starting point', () => {
    const storage = {
      getItem: jest.fn(() => "9"),
      setItem: jest.fn()
    };
    const gate = createTooltipGate({ key: "k", every: 10, storage });

    expect(gate.shouldShow()).toBe(true);
  });
});
