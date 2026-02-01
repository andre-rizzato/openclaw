import fs from "node:fs";

let searches = 0;
let searchLatencyMsTotal = 0;
let indexedCount = 0;

let fileMetricsPath: string | null = null;

export function enableFileMetricsExport(filePath: string) {
  fileMetricsPath = filePath;
}

export function disableMetricsExport() {
  fileMetricsPath = null;
}

const postWriteHooks: Array<() => void> = [];
function maybeWriteMetrics() {
  if (!fileMetricsPath) return;
  try {
    const payload = JSON.stringify({ ts: Date.now(), metrics: getMetrics() }) + "\n";
    fs.appendFileSync(fileMetricsPath, payload, { encoding: "utf8" });
  } catch (e) {
    // ignore write errors
  }
  for (const h of postWriteHooks) {
    try {
      h();
    } catch (e) {
      /* ignore hook errors */
    }
  }
}

// Prometheus integration (optional, requires `prom-client` package)
let promEnabled = false as boolean;
let promRegistry: any = null;
let promGauges: { searches?: any; avgLatencyMs?: any; indexed?: any } = {};
let promServer: any = null;

// Test helper: allow tests to inject a mocked prom-client to avoid requiring the
// optional package at runtime during unit tests.
let promClientOverride: any = null;
export function _setPromClientForTest(obj: any) {
  promClientOverride = obj;
}

export function enablePrometheusExport(opts?: {
  startServer?: boolean;
  port?: number;
  path?: string;
  intervalMs?: number;
}) {
  if (promEnabled) return true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    // allow tests to inject a mocked prom-client via _setPromClientForTest
    // so we don't require an optional runtime dependency during unit tests
    let promRaw = promClientOverride ?? require("prom-client");
    // handle possible ESM default export wrapping when mocked/imported
    let prom: any = promRaw && promRaw.default ? promRaw.default : promRaw;

    // sanity checks - fail loudly in tests so we can diagnose mocking issues
    if (!prom || typeof prom.Registry !== "function" || typeof prom.Gauge !== "function") {
      // eslint-disable-next-line no-console
      console.error(
        "enablePrometheusExport: prom-client shape check failed",
        Object.keys(prom || {}),
      );
      throw new Error(
        "prom-client does not expose expected Registry/Gauge; ensure your mock provides named exports or a default export with { Registry, Gauge }",
      );
    }
    promRegistry = new prom.Registry();
    prom.collectDefaultMetrics({ register: promRegistry });

    promGauges.searches = new prom.Gauge({
      name: "openclaw_session_searches_total",
      help: "Total number of session searches",
      registers: [promRegistry],
    });
    promGauges.avgLatencyMs = new prom.Gauge({
      name: "openclaw_session_search_avg_latency_ms",
      help: "Average search latency (ms)",
      registers: [promRegistry],
    });
    promGauges.indexed = new prom.Gauge({
      name: "openclaw_session_indexed_count",
      help: "Indexed count",
      registers: [promRegistry],
    });

    function updatePromMetrics() {
      try {
        const m = getMetrics();
        promGauges.searches.set(m.searches);
        promGauges.avgLatencyMs.set(m.avgSearchLatencyMs);
        promGauges.indexed.set(m.indexedCount);
      } catch (e) {
        // ignore
      }
    }

    // Update on every metric change too (use hooks to avoid overwriting function)
    postWriteHooks.push(updatePromMetrics);

    promEnabled = true;

    if (opts?.startServer) {
      const http = require("node:http");
      const port = opts.port ?? 9464;
      const endpoint = opts.path ?? "/metrics";
      promServer = http.createServer(async (req: any, res: any) => {
        if (req.url !== endpoint) {
          res.statusCode = 404;
          return res.end("not found");
        }
        try {
          const body = await promRegistry.metrics();
          res.setHeader("Content-Type", promRegistry.contentType || "text/plain; version=0.0.4");
          res.end(body);
        } catch (e) {
          res.statusCode = 500;
          res.end(String(e));
        }
      });
      promServer.listen(port);
    }

    // initial push
    try {
      updatePromMetrics();
    } catch (e) {
      /* ignore */
    }
    maybeWriteMetrics();
    return true;
  } catch (err) {
    // helpful debugging during tests
    // eslint-disable-next-line no-console
    console.error("enablePrometheusExport error", err);
    if (process.env.NODE_ENV === "test") throw err;
    return false;
  }
}

export function disablePrometheusExport() {
  promEnabled = false;
  promRegistry = null;
  promGauges = {};
  if (promServer && typeof promServer.close === "function") {
    try {
      promServer.close();
    } catch (e) {}
    promServer = null;
  }
}

export function incrementSearchCount(n = 1, latencyMs = 0) {
  searches += n;
  searchLatencyMsTotal += latencyMs;
  maybeWriteMetrics();
}

export function incrementIndexed(n = 1) {
  indexedCount += n;
  maybeWriteMetrics();
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
