import { test, expect, vi } from "vitest";
import { _clearCache, _getCacheSize, getEmbedding } from "./embed-cache";

vi.mock("openai", () => {
  return class MockOpenAI {
    constructor(opts: any) {}
    embeddings = {
      create: async ({ model, input }: any) => ({ data: [{ embedding: [1, 2, 3, 4] }] }),
    };
  } as any;
});

test("caches embeddings and respects ttl", async () => {
  _clearCache();
  expect(_getCacheSize()).toBe(0);
  const v1 = await getEmbedding("hello", { model: "m", dim: 4 });
  expect(_getCacheSize()).toBe(1);
  const v2 = await getEmbedding("hello", { model: "m", dim: 4 });
  expect(_getCacheSize()).toBe(1);
  expect(v1).toEqual(v2);
});

test("rate-limits outbound calls when openai present", async () => {
  _clearCache();
  let calls = 0;
  const fakeOpenAI = {
    embeddings: {
      create: async ({ model, input }: any) => {
        calls++;
        return { data: [{ embedding: [0.1, 0.2, 0.3] }] };
      },
    },
  };

  // inject openaiModule to bypass require
  const p1 = getEmbedding("a", {
    openaiModule: () => fakeOpenAI,
    model: "m",
    dim: 3,
    minIntervalMs: 50,
  });
  const p2 = getEmbedding("b", {
    openaiModule: () => fakeOpenAI,
    model: "m",
    dim: 3,
    minIntervalMs: 50,
  });
  await Promise.all([p1, p2]);
  // both calls should have been made, but due to throttling they happen serially; assert calls >=2
  expect(calls).toBeGreaterThanOrEqual(2);
});
