import { describe, expect, it } from "vitest";
import { createPromptDocumentV2, finalizePromptDocumentV2 } from "../v2/document.js";
import type { PromptSemanticRequestV2 } from "../v2/semantic.js";
import { assertNonContentEvidenceV1, OptimizationCallBudgetV1 } from "./contracts.js";
import {
  executeBoundedSemanticEnhancementV2,
  SemanticProviderErrorV2,
  type PromptSemanticProviderPortV2,
} from "./execute.js";

function document() {
  const empty = createPromptDocumentV2({ id: "phase-4", now: "2026-08-31T00:00:00.000Z" });
  const { canonicalHash: _canonicalHash, ...source } = empty;
  return finalizePromptDocumentV2({ ...source, baseline: "Implement bounded retries.", lockedSections: ["constraints"] });
}

function provider(run: (request: PromptSemanticRequestV2) => unknown, route: { actualProvider?: string; actualModel?: string } = {}): PromptSemanticProviderPortV2 {
  return { execute: async (request) => ({ text: JSON.stringify(run(request)), latencyMs: 12, finishReason: "stop", inputTokens: 20, outputTokens: 10, ...route }) };
}

const execute = (port: PromptSemanticProviderPortV2, signal?: AbortSignal) => executeBoundedSemanticEnhancementV2({
  document: document(), provider: port, providerId: "openai", model: "fixed-executor", requestId: "phase-4-request", cancellationId: "phase-4-cancel", patchId: "phase-4-patch", now: "2026-08-31T00:01:00.000Z", signal,
});

describe("bounded semantic enhancement", () => {
  it("returns and telemetry-reconciles a strict same-call engineering projection", async () => {
    const estimationContext = { estimationId: "estimate-1", moduleCount: 3, languages: ["TypeScript"], dependencies: ["React"], taskComplexity: "medium" as const, expectedIterations: 3, expectedToolCalls: 5, expectedRetries: 1, contextLimitTokens: 32_768, criticality: "medium" as const, requestedProvider: "openai" as const, requestedModel: "fixed-executor" };
    const base = { planning: 100, context_ingestion: 200, prompt_input: 100, tool_provider_calls: 300, retries: 100, final_output: 200 };
    const outcome = await executeBoundedSemanticEnhancementV2({ document: document(), provider: provider((request) => ({ operation: "enhance", baseHash: request.baseHash, operations: [], projection: { estimation_id: "estimate-1", estimation_status: "estimate_only", baseline_projection: { total_tokens: 1_000, breakdown: base }, optimized_projection: { total_tokens: 800, breakdown: { ...base, context_ingestion: 100, retries: 50, final_output: 150 } }, projected_delta: { absolute_tokens: 200, percentage_change: 20 }, cost: { status: "cost_unavailable" }, assumptions: ["One retry is expected."], metadata_used: ["moduleCount", "criticality"], uncertainty_range: { baseline_min: 800, baseline_max: 1_200, optimized_min: 650, optimized_max: 1_000 }, confidence: "medium", routing_disclosure: { requested_provider: "openai", requested_model: "fixed-executor", actual_provider: "spoofed-provider", actual_model: "spoofed-model", substitution_reason: "Provider-side claim" }, optimization_rationale: "Less repeated context." } }), { actualProvider: "openai", actualModel: "routed-model" }), providerId: "openai", model: "fixed-executor", requestId: "phase-4-request", cancellationId: "phase-4-cancel", patchId: "phase-4-patch", now: "2026-08-31T00:01:00.000Z", estimationContext });
    expect(outcome.status).toBe("candidate");
    if (outcome.status === "candidate") expect(outcome.projection).toMatchObject({ estimationId: "estimate-1", estimationStatus: "estimate_only", routing: { actualProvider: "openai", actualModel: "routed-model", substitutionReason: expect.stringContaining("different") }, telemetry: { scope: "optimizer_call", inputTokens: 20, outputTokens: 10, totalTokens: 30 } });
  });

  it("accepts one hash-bound patch and recompiles deterministically", async () => {
    let calls = 0;
    const outcome = await execute(provider((request) => {
      calls += 1;
      return { operation: "enhance", baseHash: request.baseHash, operations: [{ operation: "replace-section", sectionId: "task", text: "Implement bounded retries with deterministic backoff." }] };
    }));
    expect(outcome.status).toBe("candidate");
    expect(outcome.compiled.text).toContain("deterministic backoff");
    expect(outcome.trace.calls).toHaveLength(1);
    expect(calls).toBe(1);
    assertNonContentEvidenceV1(outcome.trace);
  });

  it.each([
    ["malformed JSON", { execute: async () => ({ text: "not json", latencyMs: 1, finishReason: "stop" }) }],
    ["wrong hash", provider(() => ({ operation: "enhance", baseHash: "0".repeat(64), operations: [] }))],
    ["locked section", provider((request) => ({ operation: "enhance", baseHash: request.baseHash, operations: [{ operation: "replace-section", sectionId: "constraints", text: "Weaken it." }] }))],
    ["wrong schema", provider((request) => ({ schemaVersion: "prompt-enhance-result.v1", operation: "enhance", baseHash: request.baseHash, operations: [] }))],
    ["secret-like patch", provider((request) => ({ operation: "enhance", baseHash: request.baseHash, operations: [{ operation: "replace-section", sectionId: "task", text: "api_key=secret-value-123456" }] }))],
    ["timeout", { execute: async () => { throw new SemanticProviderErrorV2("TIMEOUT", "timeout"); } }],
    ["authentication", { execute: async () => { throw new SemanticProviderErrorV2("AUTHENTICATION", "authentication"); } }],
    ["rate limit", { execute: async () => { throw new SemanticProviderErrorV2("RATE_LIMITED", "rate limit"); } }],
    ["truncation", { execute: async () => ({ text: "{}", latencyMs: 1, finishReason: "length", truncated: true }) }],
    ["invalid token telemetry", { execute: async (request: PromptSemanticRequestV2) => ({ text: JSON.stringify({ operation: "enhance", baseHash: request.baseHash, operations: [] }), latencyMs: 1, finishReason: "stop", inputTokens: -1 }) }],
  ])("preserves the unchanged fallback for %s", async (_name, port) => {
    const original = document();
    const outcome = await execute(port as PromptSemanticProviderPortV2);
    expect(outcome.status).toBe("fallback");
    expect(outcome.document).toEqual(original);
    expect(outcome.compiled.text).toContain("Implement bounded retries.");
    expect(outcome.trace.calls).toHaveLength(1);
    assertNonContentEvidenceV1(outcome.trace);
  });

  it("fails closed when cancelled before provider execution", async () => {
    const controller = new AbortController();
    controller.abort();
    let called = false;
    const outcome = await execute({ execute: async () => { called = true; throw new Error("unexpected"); } }, controller.signal);
    expect(outcome.status).toBe("cancelled");
    expect(called).toBe(false);
  });

  it("rejects unsafe aggregate estimation context before provider execution", async () => {
    let called = false;
    const outcome = await executeBoundedSemanticEnhancementV2({
      document: document(),
      provider: { execute: async () => { called = true; throw new Error("unexpected"); } },
      providerId: "openai",
      model: "fixed-executor",
      requestId: "phase-4-request",
      cancellationId: "phase-4-cancel",
      patchId: "phase-4-patch",
      now: "2026-08-31T00:01:00.000Z",
      estimationContext: { estimationId: "estimate-unsafe", moduleCount: 1, languages: ["TypeScript"], dependencies: ["api_key=secret-value-123456"], taskComplexity: "medium", expectedIterations: 2, expectedToolCalls: 2, expectedRetries: 1, criticality: "medium", requestedProvider: "openai", requestedModel: "fixed-executor" },
    });
    expect(called).toBe(false);
    expect(outcome).toMatchObject({ status: "fallback", failureCode: "INVALID_RESPONSE" });
  });

  it("rejects delayed completion after cancellation and classifies wrong-hash completion as stale", async () => {
    const controller = new AbortController();
    const delayed = provider((request) => {
      controller.abort();
      return { operation: "enhance", baseHash: request.baseHash, operations: [] };
    });
    await expect(execute(delayed, controller.signal)).resolves.toMatchObject({ status: "cancelled", failureCode: "CANCELLED" });
    await expect(execute(provider(() => ({ operation: "enhance", baseHash: "0".repeat(64), operations: [] })))).resolves.toMatchObject({ status: "fallback", failureCode: "STALE_RESULT" });
  });

  it("makes a fourth reservation impossible", () => {
    const budget = new OptimizationCallBudgetV1();
    budget.reserve("restructure");
    budget.reserve("assessment");
    budget.reserve("repair");
    expect(() => budget.reserve("repair")).toThrow(/exhausted/iu);
  });
});
