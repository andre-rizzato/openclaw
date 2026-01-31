#!/usr/bin/env node
import path from "node:path";
import os from "node:os";
import { searchSessions } from "../../src/agents/session-search";
import { getMetrics } from "../../src/agents/session-metrics";

async function main() {
  const argv = process.argv.slice(2);
  const q = argv[0] ?? "";
  const k = Number(argv[1] ?? 5);
  const db = argv[2] ?? path.join(os.tmpdir(), "lancedb-test");

  if (!q) {
    console.error("Usage: search-sessions <query> [k] [dbPath]");
    process.exit(2);
  }

  const hits = await searchSessions({ query: q, k, dbPath: db });
  console.log(`Top ${hits.length} results:`);
  for (const h of hits) {
    console.log(`${h.id} (score=${h.score.toFixed(4)}): ${h.text.slice(0, 200)}`);
  }

  console.log("metrics:", getMetrics());
}

if (require.main === module) {
  main().catch((err) => {
    console.error("search failed:", err);
    process.exit(1);
  });
}
