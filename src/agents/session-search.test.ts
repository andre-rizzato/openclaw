import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { test, expect, vi } from "vitest";

const tmp = path.join(os.tmpdir(), "session-search-test");
try {
  fs.rmSync(tmp, { recursive: true, force: true });
} catch (e) {}
fs.mkdirSync(tmp, { recursive: true });

// Test 1: LanceDB available -> use table.search
const mockSearchHits = [
  { id: "session1-0", text: "I like cats", score: 0.95 },
  { id: "session2-0", text: "I like pizza", score: 0.5 },
];

vi.mock("@lancedb/lancedb", () => ({
  connect: async (dbPath: string) => ({
    openTable: async (name: string) => ({
      search: async ({ vector, k }: any) => mockSearchHits.slice(0, k),
    }),
  }),
}));

vi.mock("openai", () => {
  return class MockOpenAI {
    constructor(opts: any) {}
    embeddings = {
      create: async ({ model, input }: any) => ({ data: [{ embedding: [0.1, 0.2, 0.3, 0.4] }] }),
    };
  } as any;
});

import { searchSessions } from "./session-search";

test("uses LanceDB search when available", async () => {
  const res = await searchSessions({
    query: "cats",
    k: 2,
    dbPath: tmp,
    tableName: "session_index",
    embeddingDim: 4,
  });
  expect(res.length).toBeGreaterThanOrEqual(1);
  expect(res[0].id).toBe("session1-0");
  expect(res[0].score).toBeCloseTo(0.95);
});

// Test 2: fallback to JSONL when LanceDB not available
vi.unmock("@lancedb/lancedb");

test("falls back to JSONL linear search", async () => {
  const outFile = path.join(tmp, "session_index.jsonl");
  const e1 = { id: "s1-0", text: "cats are great", vector: [0.1, 0.2, 0.3, 0.4] };
  const e2 = { id: "s2-0", text: "pizza is good", vector: [1, 0, 0, 0] };
  fs.writeFileSync(outFile, JSON.stringify(e1) + "\n" + JSON.stringify(e2) + "\n");

  const res = await searchSessions({
    query: "cats",
    k: 2,
    dbPath: tmp,
    tableName: "session_index",
    embeddingDim: 4,
  });
  expect(res.length).toBeGreaterThanOrEqual(1);
  expect(res[0].id).toBe("s1-0");
  expect(res[0].score).toBeGreaterThan(0);

  // cleanup
  try {
    fs.rmSync(tmp, { recursive: true, force: true });
  } catch (e) {}
});
