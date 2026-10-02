// latestRequest.js

/**
 * Tracks which invocation is currently allowed to update shared UI state.
 * @returns {{start: function(): number, isCurrent: function(number): boolean}}
 */
export function createLatestRequestGuard() {
  let generation = 0;
  return {
    start() {
      generation += 1;
      return generation;
    },
    isCurrent(requestGeneration) {
      return requestGeneration === generation;
    }
  };
}
