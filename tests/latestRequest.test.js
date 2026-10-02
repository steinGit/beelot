import { createLatestRequestGuard } from "../assets/js/latestRequest";

describe("createLatestRequestGuard", () => {
  test("only permits the newest overlapping request to update shared output", () => {
    const guard = createLatestRequestGuard();
    const olderRequest = guard.start();
    const newerRequest = guard.start();

    expect(guard.isCurrent(newerRequest)).toBe(true);
    expect(guard.isCurrent(olderRequest)).toBe(false);
  });
});
