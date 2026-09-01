/** Provisional DWI-specific contracts. They do not perform provider I/O. */

export const DWI_OPTIMIZATION_SESSION_SCHEMA_V1 =
  "dwi.optimization-session.v1" as const;
export const DWI_OPTIMIZATION_TRACE_SCHEMA_V1 =
  "dwi.optimization-trace.v1" as const;
export const DWI_PROVIDER_WIRE_SCENARIO_SCHEMA_V1 =
  "dwi.provider-wire-scenario.v1" as const;
export const DWI_EVALUATION_CORPUS_SCHEMA_V1 =
  "dwi.evaluation-corpus.v1" as const;

export type OptimizationCallPurposeV1 =
  | "assessment"
  | "restructure"
  | "repair";
export type OptimizationDependencyV1 =
  | "task"
  | "prompt-type"
  | "provider-preference"
  | "output-size"
  | "project-context";
export type OptimizationArtifactV1 =
  | "assessment"
  | "question-plan"
  | "guidance-resolution"
  | "route-decision"
  | "candidate";

export interface OptimizationSessionIdentityV1 {
  readonly schemaVersion: typeof DWI_OPTIMIZATION_SESSION_SCHEMA_V1;
  readonly sessionId: string;
  readonly documentId: string;
  readonly revision: number;
  readonly baseHash: string;
}

const SAFE_ID = /^[a-z0-9][a-z0-9._:-]{0,127}$/iu;
const HASH = /^[a-f0-9]{64}$/iu;

function hasExactKeys(
  value: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const keys = Object.keys(value);
  return (
    required.every((key) => keys.includes(key)) &&
    keys.every((key) => required.includes(key) || optional.includes(key))
  );
}

export function validateOptimizationSessionIdentityV1(
  value: OptimizationSessionIdentityV1,
): OptimizationSessionIdentityV1 {
  if (
    !hasExactKeys(value, [
      "schemaVersion",
      "sessionId",
      "documentId",
      "revision",
      "baseHash",
    ]) ||
    value.schemaVersion !== DWI_OPTIMIZATION_SESSION_SCHEMA_V1 ||
    !SAFE_ID.test(value.sessionId) ||
    !SAFE_ID.test(value.documentId) ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 0 ||
    !HASH.test(value.baseHash)
  ) {
    throw new Error("Optimization session identity is invalid.");
  }
  return {
    schemaVersion: DWI_OPTIMIZATION_SESSION_SCHEMA_V1,
    sessionId: value.sessionId,
    documentId: value.documentId,
    revision: value.revision,
    baseHash: value.baseHash,
  };
}

export interface OptimizationCallRecordV1 {
  readonly ordinal: 1 | 2 | 3;
  readonly purpose: OptimizationCallPurposeV1;
  readonly provider: string;
  readonly model: string;
  readonly baseHash: string;
  readonly result: "completed" | "failed" | "cancelled" | "rejected";
  readonly latencyMs?: number;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly failureCode?: string;
}

export function validateOptimizationCallRecordV1(
  value: OptimizationCallRecordV1,
): OptimizationCallRecordV1 {
  if (
    !hasExactKeys(
      value,
      ["ordinal", "purpose", "provider", "model", "baseHash", "result"],
      ["latencyMs", "inputTokens", "outputTokens", "failureCode"],
    ) ||
    ![1, 2, 3].includes(value.ordinal) ||
    !["assessment", "restructure", "repair"].includes(value.purpose) ||
    !SAFE_ID.test(value.provider) ||
    !SAFE_ID.test(value.model) ||
    !HASH.test(value.baseHash) ||
    !["completed", "failed", "cancelled", "rejected"].includes(value.result) ||
    (value.latencyMs !== undefined &&
      (!Number.isFinite(value.latencyMs) || value.latencyMs < 0)) ||
    (value.inputTokens !== undefined &&
      (!Number.isSafeInteger(value.inputTokens) || value.inputTokens < 0)) ||
    (value.outputTokens !== undefined &&
      (!Number.isSafeInteger(value.outputTokens) || value.outputTokens < 0)) ||
    (value.failureCode !== undefined && !/^[A-Z][A-Z0-9_]{0,63}$/.test(value.failureCode))
  ) {
    throw new Error("Optimization call record is invalid or content-bearing.");
  }
  return {
    ordinal: value.ordinal,
    purpose: value.purpose,
    provider: value.provider,
    model: value.model,
    baseHash: value.baseHash,
    result: value.result,
    ...(value.latencyMs === undefined ? {} : { latencyMs: value.latencyMs }),
    ...(value.inputTokens === undefined ? {} : { inputTokens: value.inputTokens }),
    ...(value.outputTokens === undefined
      ? {}
      : { outputTokens: value.outputTokens }),
    ...(value.failureCode === undefined ? {} : { failureCode: value.failureCode }),
  };
}

/** Structural budget: a fourth reservation cannot be represented. */
export class OptimizationCallBudgetV1 {
  readonly maxCalls = 3 as const;
  private reserved: OptimizationCallPurposeV1[] = [];

  reserve(purpose: OptimizationCallPurposeV1): 1 | 2 | 3 {
    if (this.reserved.length >= this.maxCalls) {
      throw new Error("Optimizer call budget is exhausted.");
    }
    this.reserved.push(purpose);
    return this.reserved.length as 1 | 2 | 3;
  }

  get reservedPurposes(): readonly OptimizationCallPurposeV1[] {
    return [...this.reserved];
  }
}

const INVALIDATION: Readonly<
  Record<OptimizationDependencyV1, readonly OptimizationArtifactV1[]>
> = {
  task: [
    "assessment",
    "question-plan",
    "guidance-resolution",
    "route-decision",
    "candidate",
  ],
  "prompt-type": [
    "assessment",
    "question-plan",
    "guidance-resolution",
    "route-decision",
    "candidate",
  ],
  "provider-preference": ["route-decision", "candidate"],
  "output-size": ["candidate"],
  "project-context": ["assessment", "question-plan", "guidance-resolution", "candidate"],
};

export function invalidatedOptimizationArtifactsV1(
  dependency: OptimizationDependencyV1,
): readonly OptimizationArtifactV1[] {
  return [...INVALIDATION[dependency]];
}

export interface OptimizationTraceV1 {
  readonly schemaVersion: typeof DWI_OPTIMIZATION_TRACE_SCHEMA_V1;
  readonly session: Pick<
    OptimizationSessionIdentityV1,
    "sessionId" | "documentId" | "revision" | "baseHash"
  >;
  readonly calls: readonly OptimizationCallRecordV1[];
  readonly outcome: "candidate" | "fallback" | "cancelled" | "rejected";
}

export function validateOptimizationTraceV1(value: OptimizationTraceV1): OptimizationTraceV1 {
  if (
    !hasExactKeys(value, ["schemaVersion", "session", "calls", "outcome"]) ||
    !hasExactKeys(value.session, ["sessionId", "documentId", "revision", "baseHash"]) ||
    !Array.isArray(value.calls)
  ) {
    throw new Error("Optimization trace is invalid or content-bearing.");
  }
  validateOptimizationSessionIdentityV1({
    schemaVersion: DWI_OPTIMIZATION_SESSION_SCHEMA_V1,
    ...value.session,
  });
  if (
    value.schemaVersion !== DWI_OPTIMIZATION_TRACE_SCHEMA_V1 ||
    !["candidate", "fallback", "cancelled", "rejected"].includes(value.outcome) ||
    value.calls.length > 3
  ) {
    throw new Error("Optimization trace is invalid.");
  }
  const calls = value.calls.map(validateOptimizationCallRecordV1);
  return {
    schemaVersion: DWI_OPTIMIZATION_TRACE_SCHEMA_V1,
    session: { ...value.session },
    calls,
    outcome: value.outcome,
  };
}

export interface EvaluationCorpusCaseV1 {
  readonly id: string;
  readonly caseType: string;
  readonly inputDigest: string;
  readonly expectedInvariantIds: readonly string[];
}

export interface EvaluationCorpusV1 {
  readonly schemaVersion: typeof DWI_EVALUATION_CORPUS_SCHEMA_V1;
  readonly corpusId: string;
  readonly cases: readonly EvaluationCorpusCaseV1[];
}

export type ProviderWireScenarioKindV1 =
  | "success"
  | "delay"
  | "malformed-json"
  | "invalid-patch"
  | "timeout"
  | "cancelled"
  | "stale-completion"
  | "truncated"
  | "refused"
  | "unauthorized"
  | "forbidden"
  | "rate-limited"
  | "quota"
  | "server-error"
  | "disconnect"
  | "connection-failure";

export interface ProviderWireScenarioV1 {
  readonly schemaVersion: typeof DWI_PROVIDER_WIRE_SCENARIO_SCHEMA_V1;
  readonly id: string;
  readonly kind: ProviderWireScenarioKindV1;
  readonly expectedFailureCode?: string;
}

export function validateProviderWireScenarioV1(
  scenario: ProviderWireScenarioV1,
): ProviderWireScenarioV1 {
  if (
    !hasExactKeys(scenario, ["schemaVersion", "id", "kind"], ["expectedFailureCode"]) ||
    scenario.schemaVersion !== DWI_PROVIDER_WIRE_SCENARIO_SCHEMA_V1 ||
    !SAFE_ID.test(scenario.id) ||
    ![
      "success",
      "delay",
      "malformed-json",
      "invalid-patch",
      "timeout",
      "cancelled",
      "stale-completion",
      "truncated",
      "refused",
      "unauthorized",
      "forbidden",
      "rate-limited",
      "quota",
      "server-error",
      "disconnect",
      "connection-failure",
    ].includes(scenario.kind) ||
    (scenario.expectedFailureCode !== undefined &&
      !/^[A-Z][A-Z0-9_]{0,63}$/.test(scenario.expectedFailureCode))
  ) {
    throw new Error("Provider-wire scenario is invalid or content-bearing.");
  }
  return {
    schemaVersion: DWI_PROVIDER_WIRE_SCENARIO_SCHEMA_V1,
    id: scenario.id,
    kind: scenario.kind,
    ...(scenario.expectedFailureCode === undefined
      ? {}
      : { expectedFailureCode: scenario.expectedFailureCode }),
  };
}

const CONTENT_KEYS = /(?:prompt|content|context|credential|secret|body|text)/iu;

/** Rejects accidental raw-content fields from reusable evidence structures. */
export function assertNonContentEvidenceV1(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(assertNonContentEvidenceV1);
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    if (CONTENT_KEYS.test(key)) {
      throw new Error(`Reusable evidence cannot contain ${key}.`);
    }
    assertNonContentEvidenceV1(nested);
  }
}

export function validateEvaluationCorpusV1(
  corpus: EvaluationCorpusV1,
): EvaluationCorpusV1 {
  if (
    !hasExactKeys(corpus, ["schemaVersion", "corpusId", "cases"]) ||
    corpus.schemaVersion !== DWI_EVALUATION_CORPUS_SCHEMA_V1 ||
    !corpus.corpusId ||
    corpus.cases.length === 0 ||
    corpus.cases.some(
      (entry) =>
        !hasExactKeys(entry, ["id", "caseType", "inputDigest", "expectedInvariantIds"]) ||
        !Array.isArray(entry.expectedInvariantIds) ||
        !SAFE_ID.test(entry.id) ||
        !SAFE_ID.test(entry.caseType) ||
        !HASH.test(entry.inputDigest) ||
        entry.expectedInvariantIds.some((id) => !SAFE_ID.test(id)),
    )
  ) {
    throw new Error("Evaluation corpus does not satisfy the v1 schema.");
  }
  assertNonContentEvidenceV1(corpus);
  return {
    schemaVersion: DWI_EVALUATION_CORPUS_SCHEMA_V1,
    corpusId: corpus.corpusId,
    cases: corpus.cases.map((entry) => ({
      id: entry.id,
      caseType: entry.caseType,
      inputDigest: entry.inputDigest,
      expectedInvariantIds: [...entry.expectedInvariantIds],
    })),
  };
}
