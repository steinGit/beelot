import { getNextTabTarget } from '../assets/js/locationTabNavigation';

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
