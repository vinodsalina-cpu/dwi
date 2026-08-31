import { describe, expect, it } from "vitest";
import { PromptOptimizerRequestBoundary, persistedPromptOptimizerView, restorePromptOptimizerView } from "./prompt-optimizer-session.js";

describe("prompt optimizer three-step session boundary", () => {
  it("keeps legacy input and review checkpoints recoverable", () => {
    expect(restorePromptOptimizerView("input", false)).toBe("input");
    expect(restorePromptOptimizerView("review", true)).toBe("review");
    expect(restorePromptOptimizerView("review", false)).toBe("input");
  });

  it("does not persist the ephemeral resolve transition", () => {
    expect(persistedPromptOptimizerView("resolve", false)).toBe("input");
    expect(persistedPromptOptimizerView("resolve", true)).toBe("input");
    expect(persistedPromptOptimizerView("review", true)).toBe("review");
  });

  it("rejects delayed results after newer input or explicit invalidation", () => {
    const boundary = new PromptOptimizerRequestBoundary();
    const first = boundary.start({ documentId: "prompt", requestId: "first", baseHash: "a".repeat(64) });
    expect(boundary.isCurrent(first)).toBe(true);
    const second = boundary.start({ documentId: "prompt", requestId: "second", baseHash: "b".repeat(64) });
    expect(boundary.isCurrent(first)).toBe(false);
    expect(boundary.isCurrent(second)).toBe(true);
    expect(second.revision).toBe(2);
    expect(boundary.currentFor(second)).toEqual(second);
    boundary.invalidate();
    expect(boundary.isCurrent(second)).toBe(false);
  });
});
