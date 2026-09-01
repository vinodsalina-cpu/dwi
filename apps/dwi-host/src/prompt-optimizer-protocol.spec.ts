import { describe, expect, it } from "vitest";
import { parsePromptOptimizerCommand } from "./prompt-optimizer-protocol.js";

const identity = {
  schemaVersion: "prompt-command.v2",
  requestId: "request-1",
  correlationId: "correlation-1",
  cancellationId: "cancel-1",
  documentId: "current-prompt",
  revision: 1,
  baseHash: "0".repeat(64),
} as const;

describe("prompt optimizer protocol", () => {
  it("accepts strict compile and semantic requests", () => {
    const input = { task: "Improve this task", assignmentId: "general", promptType: "General", outputSize: "low" };
    expect(parsePromptOptimizerCommand({ type: "prompt.v2.compile", ...identity, input })?.type).toBe("prompt.v2.compile");
    expect(parsePromptOptimizerCommand({ type: "prompt.v2.semantic", ...identity, operation: "enhance", input })?.type).toBe("prompt.v2.semantic");
    expect(parsePromptOptimizerCommand({ type: "prompt.v2.draft.save", schemaVersion: "prompt-command.v2", input: { ...input, task: "" } })?.type).toBe("prompt.v2.draft.save");
    expect(parsePromptOptimizerCommand({ type: "prompt.v2.review.open", schemaVersion: "prompt-command.v2" })?.type).toBe("prompt.v2.review.open");
    expect(parsePromptOptimizerCommand({ type: "prompt.v2.view.set", schemaVersion: "prompt-command.v2", view: "review" })?.type).toBe("prompt.v2.view.set");
    expect(parsePromptOptimizerCommand({ type: "prompt.v2.session.reset", schemaVersion: "prompt-command.v2" })?.type).toBe("prompt.v2.session.reset");
    expect(parsePromptOptimizerCommand({ type: "prompt.v2.view.set", schemaVersion: "prompt-command.v2", view: "resolve" })?.type).toBe("prompt.v2.view.set");
  });

  it("rejects extra keys, unsupported operations, and invalid identity", () => {
    const input = { task: "Improve this task", assignmentId: "general", promptType: "General", outputSize: "low" };
    expect(parsePromptOptimizerCommand({ type: "prompt.v2.compile", ...identity, input, key: "secret" })).toBeUndefined();
    expect(parsePromptOptimizerCommand({ type: "prompt.v2.semantic", ...identity, operation: "analyze", input })).toBeUndefined();
    expect(parsePromptOptimizerCommand({ type: "prompt.v2.compile", ...identity, baseHash: "bad", input })).toBeUndefined();
    expect(parsePromptOptimizerCommand({ type: "prompt.v2.view.set", schemaVersion: "prompt-command.v2", view: "output" })).toBeUndefined();
    expect(parsePromptOptimizerCommand({ type: "prompt.v2.draft.save", schemaVersion: "prompt-command.v2", input, extra: true })).toBeUndefined();
    expect(parsePromptOptimizerCommand({ type: "prompt.v2.session.reset", schemaVersion: "prompt-command.v2", extra: true })).toBeUndefined();
    expect(parsePromptOptimizerCommand({ type: "prompt.v2.review.open", schemaVersion: "prompt-command.v2", provider: "openai" })).toBeUndefined();
  });
});
