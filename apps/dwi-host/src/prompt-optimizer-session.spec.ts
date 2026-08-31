import { describe, expect, it } from "vitest";
import { PromptOptimizerRequestBoundary, persistedPromptOptimizerView, restorePromptOptimizerView } from "./prompt-optimizer-session.js";

describe("prompt optimizer three-step session boundary", () => {
  it("keeps every workflow checkpoint recoverable across context review", () => {
    expect(restorePromptOptimizerView("input", false)).toBe("input");
    expect(restorePromptOptimizerView("review", true)).toBe("review");
    expect(restorePromptOptimizerView("review", false)).toBe("review");
    expect(restorePromptOptimizerView("resolve", false)).toBe("resolve");
  });

  it("persists the exact current step independently of candidate validity", () => {
    expect(persistedPromptOptimizerView("resolve", false)).toBe("resolve");
    expect(persistedPromptOptimizerView("resolve", true)).toBe("resolve");
    expect(persistedPromptOptimizerView("review", true)).toBe("review");
    expect(persistedPromptOptimizerView("review", false)).toBe("review");
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
