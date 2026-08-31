import { describe, expect, it } from "vitest";
import { reconcileEngineeringTokenProjectionV1, validateEngineeringTokenProjectionV1, validateTokenProjectionContextV1, type TokenProjectionContextV1 } from "./token-projection.js";

const context: TokenProjectionContextV1 = { estimationId: "estimate-1", moduleCount: 4, languages: ["TypeScript"], dependencies: ["React"], taskComplexity: "high", expectedIterations: 4, expectedToolCalls: 8, expectedRetries: 2, contextLimitTokens: 32_768, criticality: "high", requestedProvider: "openai", requestedModel: "test-model" };
const breakdown = { planning: 100, context_ingestion: 200, prompt_input: 100, tool_provider_calls: 300, retries: 100, final_output: 200 };
const value = {
  estimation_id: "estimate-1", estimation_status: "estimate_only", baseline_projection: { total_tokens: 1_000, breakdown }, optimized_projection: { total_tokens: 800, breakdown: { ...breakdown, context_ingestion: 100, retries: 50, final_output: 150 } }, projected_delta: { absolute_tokens: 200, percentage_change: 20 }, cost: { status: "cost_unavailable" }, assumptions: ["Two retries are expected."], metadata_used: ["moduleCount", "criticality"], uncertainty_range: { baseline_min: 800, baseline_max: 1_300, optimized_min: 650, optimized_max: 1_050 }, confidence: "medium", routing_disclosure: { requested_provider: "openai", requested_model: "test-model" }, optimization_rationale: "The refined prompt reduces repeated context and retry work.",
};

describe("engineering token-cost projection", () => {
  it("accepts only exact bounded aggregate estimation context", () => {
    expect(validateTokenProjectionContextV1(context)).toEqual(context);
    for (const invalid of [
      { ...context, dependencies: ["api_key=secret-value-123456"] },
      { ...context, languages: Array.from({ length: 33 }, (_, index) => `Language-${index}`) },
      { ...context, inputPricePerMillionTokens: 2 },
      { ...context, rawProjectText: "private repository content" },
    ]) expect(() => validateTokenProjectionContextV1(invalid)).toThrow(/context/iu);
  });

  it("validates component totals and reconciles actual optimizer-call telemetry under the same ID", () => {
    const projection = validateEngineeringTokenProjectionV1({ ...value, routing_disclosure: { ...value.routing_disclosure, actual_provider: "different-provider", actual_model: "different-model", substitution_reason: "Provider-side claim" } }, context);
    expect(projection.routing).toEqual({ requestedProvider: "openai", requestedModel: "test-model" });
    const reconciled = reconcileEngineeringTokenProjectionV1(projection, { inputTokens: 120, outputTokens: 80 });
    expect(reconciled).toMatchObject({ estimationId: "estimate-1", estimationStatus: "reconciled", telemetry: { scope: "task_execution", totalTokens: 200 } });
    expect(() => reconcileEngineeringTokenProjectionV1(projection, { inputTokens: -1 })).toThrow(/telemetry/iu);
  });

  it("rejects inconsistent totals, deltas, identity, pricing claims, and routing", () => {
    for (const invalid of [
      { ...value, estimation_id: "wrong" },
      { ...value, baseline_projection: { ...value.baseline_projection, total_tokens: 999 } },
      { ...value, projected_delta: { absolute_tokens: 1, percentage_change: 20 } },
      { ...value, cost: { status: "estimated", baseline: 1, optimized: 1, currency: "USD" } },
      { ...value, routing_disclosure: { requested_provider: "gemini", requested_model: "test-model" } },
      { ...value, routing_disclosure: { requested_provider: "openai", requested_model: "test-model", actual_model: "different-model" } },
    ]) expect(() => validateEngineeringTokenProjectionV1(invalid, context)).toThrow();
  });

  it("accepts only a deterministic cost derived from supplied input/output prices", () => {
    const pricedContext = { ...context, inputPricePerMillionTokens: 2, outputPricePerMillionTokens: 8 };
    const priced = { ...value, cost: { status: "estimated", baseline: 0.0032, optimized: 0.0025, currency: "USD" } };
    expect(validateEngineeringTokenProjectionV1(priced, pricedContext).cost).toEqual(priced.cost);
    expect(() => validateEngineeringTokenProjectionV1({ ...priced, cost: { ...priced.cost, optimized: 1 } }, pricedContext)).toThrow(/pricing/iu);
  });
});
