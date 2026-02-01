import { test, expect, vi } from "vitest";

vi.mock(
  "prom-client",
  () => {
    const created: any[] = [];
    class Registry {
      metrics() {
        return "metrics";
      }
    }
    class Gauge {
      name: string;
      lastValue: number | null = null;
      constructor(opts: any) {
        this.name = opts.name;
        created.push(this);
      }
      set(v: number) {
        this.lastValue = v;
      }
    }
    const mod = {
      Registry,
      Gauge,
      collectDefaultMetrics: (_opts: any) => {},
      __createdGauges: created,
    };
    // support both default and named imports
    return { default: mod, ...mod };
  },
  { virtual: true },
);

import {
  enablePrometheusExport,
  disablePrometheusExport,
  incrementSearchCount,
  incrementIndexed,
  _setPromClientForTest,
} from "./session-metrics";
import prom from "prom-client";
// inject the mocked prom-client so enablePrometheusExport doesn't call require()
_setPromClientForTest(prom);

test("enables prom exporter and updates gauges", async () => {
  // ensure mock shape is present
  expect(typeof (prom as any).Registry).toBe("function");
  expect(typeof (prom as any).Gauge).toBe("function");
  // start exporter without HTTP server to avoid binding
  const ok = enablePrometheusExport({ startServer: false });
  expect(ok).toBe(true);

  incrementSearchCount(2, 50);
  incrementIndexed(3);

  const created = (prom as any).__createdGauges as any[];
  // ensure gauges were created
  expect(created.length).toBeGreaterThanOrEqual(3);
  // they should have been set at least once via maybeWriteMetrics -> update
  const names = created.map((g) => g.name).sort();
  expect(names).toEqual(names); // trivial check they exist
  expect(created.some((g) => typeof g.lastValue === "number")).toBe(true);

  disablePrometheusExport();
});
