let searches = 0;
let searchLatencyMsTotal = 0;
let indexedCount = 0;

export function incrementSearchCount(n = 1, latencyMs = 0) {
  searches += n;
  searchLatencyMsTotal += latencyMs;
}

export function incrementIndexed(n = 1) {
  indexedCount += n;
}

export function getMetrics() {
  return {
    searches,
    avgSearchLatencyMs: searches === 0 ? 0 : searchLatencyMsTotal / searches,
    indexedCount,
  };
}

export function _resetMetrics() {
  searches = 0;
  searchLatencyMsTotal = 0;
  indexedCount = 0;
}
