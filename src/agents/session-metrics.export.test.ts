import { test, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  _resetMetrics,
  enableFileMetricsExport,
  disableMetricsExport,
  incrementSearchCount,
} from "./session-metrics";

test("file metrics export writes snapshots", async () => {
  _resetMetrics();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "oc-metrics-"));
  const outFile = path.join(tmp, `metrics.ndjson`);
  try {
    enableFileMetricsExport(outFile);
    incrementSearchCount(1, 123);
    // allow small IO moment
    await new Promise((r) => setTimeout(r, 20));
    const contents = fs.readFileSync(outFile, "utf8").trim();
    expect(contents.length).toBeGreaterThan(0);
    const line = contents.split(/\r?\n/)[0];
    const obj = JSON.parse(line);
    expect(obj.metrics).toBeDefined();
    expect(typeof obj.metrics.searches).toBe("number");
  } finally {
    disableMetricsExport();
  }
});
