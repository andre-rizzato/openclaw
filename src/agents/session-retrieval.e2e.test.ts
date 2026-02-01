import { test, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { _resetMetrics, getMetrics } from "./session-metrics";
import { fetchSessionContext } from "./tools/session-retrieval";

function makeDeterministicVector(text: string, dim = 1536) {
  const v = new Array(dim).fill(0);
  for (let i = 0; i < text.length && i < dim; i++) v[i] = (text.charCodeAt(i) % 256) / 255;
  return v;
}

test("searchSessions JSONL fallback finds indexed doc (e2e)", async () => {
  _resetMetrics();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "oc-test-"));
  const tableName = "session_index";
  const outFile = path.join(tmp, `${tableName}.jsonl`);

  const text1 = "the quick brown fox";
  const entry1 = { id: "s-e2e-1", text: text1, vector: makeDeterministicVector(text1) };
  const text2 = "unrelated content";
  const entry2 = { id: "s-e2e-2", text: text2, vector: makeDeterministicVector(text2) };

  fs.writeFileSync(outFile, JSON.stringify(entry1) + "\n" + JSON.stringify(entry2) + "\n", "utf8");

  const hits = await fetchSessionContext({ query: text1, k: 1, dbPath: tmp, tableName });
  expect(hits.length).toBe(1);
  expect(hits[0].id).toBe("s-e2e-1");

  const m = getMetrics();
  expect(m.searches).toBeGreaterThanOrEqual(1);
});
