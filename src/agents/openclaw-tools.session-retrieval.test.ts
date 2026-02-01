import { describe, expect, it, vi } from "vitest";

vi.mock("./tools/session-retrieval", async () => {
  return {
    fetchSessionContext: async () => [{ id: "s1-0", text: "dogs rule", score: 0.8 }],
  };
});

import { createOpenClawTools } from "./openclaw-tools.js";

describe("session retrieval tool", () => {
  it("is disabled by default", () => {
    const tools = createOpenClawTools({ agentSessionKey: "main" });
    const t = tools.find((c) => c.name === "sessions_search");
    expect(t).toBeUndefined();
  });

  it("is enabled when configured", async () => {
    const tools = createOpenClawTools({
      agentSessionKey: "main",
      config: { tools: { sessions: { retrieval: { enabled: true } } } } as any,
    });
    const t = tools.find((c) => c.name === "sessions_search");
    expect(t).toBeDefined();
    if (!t) throw new Error("missing sessions_search tool");
    const res = await t.execute("call1", { query: "dogs" });
    expect(res.details).toBeDefined();
    expect(res.details?.results?.length).toBe(1);
  });
});
