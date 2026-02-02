import { describe, it, expect } from "vitest";
import { handlePairAgentMessage } from "./pair-programmer/index";

describe("pair-programmer skill (PoC)", () => {
  it("responds to problem detection", async () => {
    const r = await handlePairAgentMessage("Problema detectado: TEST PROBLEM");
    expect(r.status).toBe("notified");
  });

  it("handles takeover", async () => {
    const r = await handlePairAgentMessage("pega o controle");
    expect(["took-control", "noop"]).toContain(r.status);
  });
});
