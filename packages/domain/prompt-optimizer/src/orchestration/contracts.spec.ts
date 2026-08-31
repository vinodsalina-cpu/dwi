import { describe, expect, it } from "vitest";

import { createPromptDocumentV2 } from "../v2/document.js";
import { createPromptSemanticRequestV2 } from "../v2/semantic.js";
import {
  DWI_EVALUATION_CORPUS_SCHEMA_V1,
  DWI_PROVIDER_WIRE_SCENARIO_SCHEMA_V1,
  OptimizationCallBudgetV1,
  assertNonContentEvidenceV1,
  invalidatedOptimizationArtifactsV1,
  validateEvaluationCorpusV1,
  validateOptimizationSessionIdentityV1,
  validateOptimizationTraceV1,
  validateProviderWireScenarioV1,
} from "./contracts.js";
import {
  createOpenAiCompatibleSemanticWireRequestV1,
  simulateOpenAiCompatibleSemanticV1,
} from "./simulator.js";

describe("Phase 1 orchestration contracts", () => {
  it("structurally rejects a fourth call reservation", () => {
    const budget = new OptimizationCallBudgetV1();
    expect(budget.reserve("assessment")).toBe(1);
    expect(budget.reserve("restructure")).toBe(2);
    expect(budget.reserve("repair")).toBe(3);
    expect(() => budget.reserve("repair")).toThrow(/exhausted/iu);
  });

  it("invalidates only the declared dependent artifacts", () => {
    expect(invalidatedOptimizationArtifactsV1("provider-preference")).toEqual([
      "route-decision",
      "candidate",
    ]);
    expect(invalidatedOptimizationArtifactsV1("output-size")).toEqual([
      "candidate",
    ]);
  });

  it("validates host-owned identity and non-content trace records", () => {
    const session = validateOptimizationSessionIdentityV1({
      schemaVersion: "dwi.optimization-session.v1",
      sessionId: "session-1",
      documentId: "document-1",
      revision: 2,
      baseHash: "b".repeat(64),
    });
    expect(() =>
      validateOptimizationSessionIdentityV1({ ...session, revision: -1 }),
    ).toThrow(/identity/iu);
    expect(
      validateOptimizationTraceV1({
        schemaVersion: "dwi.optimization-trace.v1",
        session: {
          sessionId: session.sessionId,
          documentId: session.documentId,
          revision: session.revision,
          baseHash: session.baseHash,
        },
        calls: [
          {
            ordinal: 1,
            purpose: "assessment",
            provider: "openai",
            model: "gpt-5-6-terra",
            baseHash: session.baseHash,
            result: "completed",
            latencyMs: 12,
          },
        ],
        outcome: "candidate",
      }),
    ).toMatchObject({ outcome: "candidate" });
    expect(() =>
      validateOptimizationTraceV1({
        schemaVersion: "dwi.optimization-trace.v1",
        session: {
          sessionId: session.sessionId,
          documentId: session.documentId,
          revision: session.revision,
          baseHash: session.baseHash,
          prompt: "raw private task",
        },
        calls: [],
        outcome: "candidate",
      } as never),
    ).toThrow(/content-bearing/iu);
  });

  it("rejects content-bearing reusable evidence and validates digest-only corpus cases", () => {
    expect(() => assertNonContentEvidenceV1({ rawPrompt: "do not persist" })).toThrow(
      /rawPrompt/iu,
    );
    expect(
      validateEvaluationCorpusV1({
        schemaVersion: DWI_EVALUATION_CORPUS_SCHEMA_V1,
        corpusId: "phase-1",
        cases: [
          {
            id: "simple",
            caseType: "deterministic",
            inputDigest: "a".repeat(64),
            expectedInvariantIds: ["call-budget"],
          },
        ],
      }),
    ).toMatchObject({ corpusId: "phase-1" });
    expect(() =>
      validateEvaluationCorpusV1({
        schemaVersion: DWI_EVALUATION_CORPUS_SCHEMA_V1,
        corpusId: "phase-1",
        cases: [
          {
            id: "simple",
            caseType: "deterministic",
            inputDigest: "a".repeat(64),
            expectedInvariantIds: ["call-budget"],
          },
        ],
        note: "raw private task",
      } as never),
    ).toThrow(/schema/iu);
  });

  it("uses the V2 parser path for deterministic OpenAI-compatible success", () => {
    const document = createPromptDocumentV2({
      id: "simulated-prompt",
      now: "2026-08-30T00:00:00.000Z",
    });
    const request = createPromptSemanticRequestV2(document, {
      operation: "analyze",
      requestId: "request",
      cancellationId: "cancel",
      provider: "openai",
      model: "simulated-model",
      compiledPrompt: "A private prompt passed only in memory.",
    });

    expect(createOpenAiCompatibleSemanticWireRequestV1(request)).toMatchObject({
      method: "POST",
      path: "/v1/chat/completions",
      body: { model: "simulated-model", response_format: { type: "json_object" } },
    });
    expect(
      validateProviderWireScenarioV1({
        schemaVersion: DWI_PROVIDER_WIRE_SCENARIO_SCHEMA_V1,
        id: "success",
        kind: "success",
      }),
    ).toMatchObject({ id: "success" });
    expect(() =>
      validateProviderWireScenarioV1({
        schemaVersion: DWI_PROVIDER_WIRE_SCENARIO_SCHEMA_V1,
        id: "success",
        kind: "success",
        content: "raw private task",
      } as never),
    ).toThrow(/content-bearing/iu);

    expect(
      simulateOpenAiCompatibleSemanticV1(request, {
        schemaVersion: DWI_PROVIDER_WIRE_SCENARIO_SCHEMA_V1,
        id: "success",
        kind: "success",
      }),
    ).toMatchObject({ operation: "analyze", questions: [] });
    expect(() =>
      simulateOpenAiCompatibleSemanticV1(request, {
        schemaVersion: DWI_PROVIDER_WIRE_SCENARIO_SCHEMA_V1,
        id: "rate-limited",
        kind: "rate-limited",
        expectedFailureCode: "RATE_LIMITED",
      }),
    ).toThrow("RATE_LIMITED");

    const failures = [
      ["delay", "TIMEOUT"], ["malformed-json", "INVALID_RESPONSE"], ["invalid-patch", "INVALID_RESPONSE"],
      ["timeout", "TIMEOUT"], ["cancelled", "CANCELLED"], ["stale-completion", "STALE_RESULT"],
      ["truncated", "TRUNCATED"], ["refused", "INVALID_RESPONSE"], ["unauthorized", "AUTHENTICATION"],
      ["forbidden", "AUTHENTICATION"], ["quota", "RATE_LIMITED"], ["server-error", "PROVIDER_ERROR"],
      ["disconnect", "PROVIDER_ERROR"], ["connection-failure", "PROVIDER_ERROR"],
    ] as const;
    for (const [kind, expectedFailureCode] of failures) {
      const scenario = validateProviderWireScenarioV1({ schemaVersion: DWI_PROVIDER_WIRE_SCENARIO_SCHEMA_V1, id: `matrix:${kind}`, kind, expectedFailureCode });
      expect(() => simulateOpenAiCompatibleSemanticV1(request, scenario)).toThrow(expectedFailureCode);
    }
  });
});
