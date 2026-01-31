import { test, expect, vi } from "vitest";
import { _resetMetrics, getMetrics } from "../session-metrics";

vi.mock("../session-search", async () => {
  return {
    searchSessions: async () => [{ id: "s1-0", text: "cats are great", score: 0.9 }],
  };
});

import { fetchSessionContext } from "./session-retrieval";

test("fetchSessionContext returns hits and updates metrics", async () => {
  _resetMetrics();
  const res = await fetchSessionContext({ query: "cats", k: 1 });
  expect(res.length).toBe(1);
  const m = getMetrics();
  expect(m.searches).toBeGreaterThanOrEqual(1);
  expect(m.avgSearchLatencyMs).toBeGreaterThanOrEqual(0);
});
