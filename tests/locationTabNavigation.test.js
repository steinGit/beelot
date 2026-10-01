import {
  createLocationActionButton,
  getNextTabTarget
} from '../assets/js/locationTabNavigation';

describe('getNextTabTarget', () => {
  test('cycles through locations and compare tab', () => {
    const locations = [
      { id: "loc-1" },
      { id: "loc-2" }
    ];

    let target = getNextTabTarget({
      locations,
      activeLocationId: "loc-1",
      comparisonActive: false,
      offset: 1
    });
    expect(target).toEqual({ type: "location", id: "loc-2" });

    target = getNextTabTarget({
      locations,
      activeLocationId: "loc-2",
      comparisonActive: false,
      offset: 1
    });
    expect(target).toEqual({ type: "compare" });

    target = getNextTabTarget({
      locations,
      activeLocationId: "loc-1",
      comparisonActive: true,
      offset: 1
    });
    expect(target).toEqual({ type: "location", id: "loc-1" });

    target = getNextTabTarget({
      locations,
      activeLocationId: "loc-1",
      comparisonActive: true,
      offset: -1
    });
    expect(target).toEqual({ type: "location", id: "loc-2" });
  });
});

describe('createLocationActionButton', () => {
  test('creates a normally focusable action without tab semantics', () => {
    const button = createLocationActionButton({
      id: 'location-tab-add',
      className: 'location-tab location-tab-add',
      label: 'Standort hinzufügen',
      tooltipText: 'Standort hinzufügen',
      text: '+'
    });

    expect(button.tabIndex).toBe(0);
    expect(button.getAttribute('role')).toBeNull();
    expect(button.getAttribute('aria-selected')).toBeNull();
    expect(button.getAttribute('aria-label')).toBe('Standort hinzufügen');
  });
});
