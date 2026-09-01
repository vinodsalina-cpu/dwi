export const TOKEN_PROJECTION_COMPONENTS = ["planning", "contextIngestion", "promptInput", "toolProviderCalls", "retries", "finalOutput"] as const;
export type TokenProjectionComponent = (typeof TOKEN_PROJECTION_COMPONENTS)[number];
export type TokenProjectionBreakdownV1 = Readonly<Record<TokenProjectionComponent, number>>;

export interface TokenProjectionContextV1 {
  readonly estimationId: string;
  readonly repositorySize?: string;
  readonly fileCount?: number;
  readonly moduleCount: number;
  readonly languages: readonly string[];
  readonly dependencies: readonly string[];
  readonly dependencyCount?: number;
  readonly taskComplexity: "low" | "medium" | "high";
  readonly expectedIterations: number;
  readonly expectedToolCalls: number;
  readonly expectedRetries: number;
  readonly contextLimitTokens?: number;
  readonly criticality: "low" | "medium" | "high" | "auto";
  readonly requestedProvider: "gemini" | "openai";
  readonly requestedModel: string;
  readonly inputPricePerMillionTokens?: number;
  readonly outputPricePerMillionTokens?: number;
}

export interface EngineeringTokenProjectionV1 {
  readonly estimationId: string;
  readonly estimationStatus: "estimate_only" | "measured" | "reconciled";
  readonly baselineProjection: { readonly totalTokens: number; readonly breakdown: TokenProjectionBreakdownV1 };
  readonly optimizedProjection: { readonly totalTokens: number; readonly breakdown: TokenProjectionBreakdownV1 };
  readonly projectedDelta: { readonly absoluteTokens: number; readonly percentageChange: number };
  readonly cost: { readonly status: "cost_unavailable" } | { readonly status: "estimated"; readonly baseline: number; readonly optimized: number; readonly currency: "USD" };
  readonly assumptions: readonly string[];
  readonly metadataUsed: readonly string[];
  readonly uncertainty: { readonly baselineMin: number; readonly baselineMax: number; readonly optimizedMin: number; readonly optimizedMax: number };
  readonly confidence: "low" | "medium" | "high";
  readonly routing: { readonly requestedProvider: string; readonly requestedModel: string; readonly actualProvider?: string; readonly actualModel?: string; readonly substitutionReason?: string };
  readonly optimizationRationale: string;
  readonly telemetry?: { readonly scope: "optimizer_call" | "task_execution"; readonly inputTokens?: number; readonly outputTokens?: number; readonly totalTokens: number };
}

function record(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function exact(value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): boolean {
  const keys = Object.keys(value); return required.every((key) => keys.includes(key)) && keys.every((key) => required.includes(key) || optional.includes(key));
}
function integer(value: unknown): value is number { return Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= 1_000_000_000; }
const SECRET = /(?:-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret)\s*[:=]\s*[^\s]{8,}|\b(?:sk[-_]|ghp_|github_pat_)[A-Za-z0-9_-]{16,})/iu;
function text(value: unknown, max = 500): value is string { return typeof value === "string" && value.trim().length > 0 && value.length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value) && !SECRET.test(value); }

export function validateTokenProjectionContextV1(value: unknown): TokenProjectionContextV1 {
  const required = ["estimationId", "moduleCount", "languages", "dependencies", "taskComplexity", "expectedIterations", "expectedToolCalls", "expectedRetries", "criticality", "requestedProvider", "requestedModel"] as const;
  const optional = ["repositorySize", "fileCount", "dependencyCount", "contextLimitTokens", "inputPricePerMillionTokens", "outputPricePerMillionTokens"] as const;
  if (!record(value) || !exact(value, required, optional)) throw new Error("Token projection context is invalid.");
  const boundedLabels = (candidate: unknown): candidate is string[] => Array.isArray(candidate) && candidate.length <= 32 && candidate.every((item) => text(item, 80)) && new Set(candidate).size === candidate.length;
  const boundedCount = (candidate: unknown, max: number): candidate is number => integer(candidate) && candidate <= max;
  const validPrice = (candidate: unknown): candidate is number => typeof candidate === "number" && Number.isFinite(candidate) && candidate >= 0 && candidate <= 1_000_000;
  const inputPrice = value.inputPricePerMillionTokens;
  const outputPrice = value.outputPricePerMillionTokens;
  if (
    !text(value.estimationId, 160) ||
    !boundedCount(value.moduleCount, 1_000_000) ||
    !boundedLabels(value.languages) ||
    !boundedLabels(value.dependencies) ||
    !["low", "medium", "high"].includes(value.taskComplexity as string) ||
    !boundedCount(value.expectedIterations, 100) ||
    !boundedCount(value.expectedToolCalls, 10_000) ||
    !boundedCount(value.expectedRetries, 100) ||
    !["low", "medium", "high", "auto"].includes(value.criticality as string) ||
    !["gemini", "openai"].includes(value.requestedProvider as string) ||
    !text(value.requestedModel, 160) ||
    (value.repositorySize !== undefined && !text(value.repositorySize, 80)) ||
    (value.fileCount !== undefined && !boundedCount(value.fileCount, 100_000_000)) ||
    (value.dependencyCount !== undefined && !boundedCount(value.dependencyCount, 10_000_000)) ||
    (value.contextLimitTokens !== undefined && !boundedCount(value.contextLimitTokens, 1_000_000_000)) ||
    ((inputPrice === undefined) !== (outputPrice === undefined)) ||
    (inputPrice !== undefined && !validPrice(inputPrice)) ||
    (outputPrice !== undefined && !validPrice(outputPrice))
  ) throw new Error("Token projection context is invalid or unsafe.");
  return {
    estimationId: value.estimationId,
    ...(value.repositorySize === undefined ? {} : { repositorySize: value.repositorySize }),
    ...(value.fileCount === undefined ? {} : { fileCount: value.fileCount }),
    moduleCount: value.moduleCount,
    languages: [...value.languages],
    dependencies: [...value.dependencies],
    ...(value.dependencyCount === undefined ? {} : { dependencyCount: value.dependencyCount }),
    taskComplexity: value.taskComplexity as TokenProjectionContextV1["taskComplexity"],
    expectedIterations: value.expectedIterations,
    expectedToolCalls: value.expectedToolCalls,
    expectedRetries: value.expectedRetries,
    ...(value.contextLimitTokens === undefined ? {} : { contextLimitTokens: value.contextLimitTokens }),
    criticality: value.criticality as TokenProjectionContextV1["criticality"],
    requestedProvider: value.requestedProvider as TokenProjectionContextV1["requestedProvider"],
    requestedModel: value.requestedModel,
    ...(inputPrice === undefined ? {} : { inputPricePerMillionTokens: inputPrice }),
    ...(outputPrice === undefined ? {} : { outputPricePerMillionTokens: outputPrice }),
  };
}
function parseBreakdown(value: unknown): TokenProjectionBreakdownV1 {
  const wireKeys = ["planning", "context_ingestion", "prompt_input", "tool_provider_calls", "retries", "final_output"] as const;
  if (!record(value) || !exact(value, wireKeys) || wireKeys.some((key) => !integer(value[key]))) throw new Error("Token projection breakdown is invalid.");
  return { planning: value.planning as number, contextIngestion: value.context_ingestion as number, promptInput: value.prompt_input as number, toolProviderCalls: value.tool_provider_calls as number, retries: value.retries as number, finalOutput: value.final_output as number };
}
function parseScenario(value: unknown) {
  if (!record(value) || !exact(value, ["total_tokens", "breakdown"]) || !integer(value.total_tokens)) throw new Error("Token projection scenario is invalid.");
  const breakdown = parseBreakdown(value.breakdown);
  if (TOKEN_PROJECTION_COMPONENTS.reduce((sum, key) => sum + breakdown[key], 0) !== value.total_tokens) throw new Error("Token projection total does not match its breakdown.");
  return { totalTokens: value.total_tokens, breakdown };
}

export function validateEngineeringTokenProjectionV1(value: unknown, context: TokenProjectionContextV1): EngineeringTokenProjectionV1 {
  if (!record(value) || !exact(value, ["estimation_id", "estimation_status", "baseline_projection", "optimized_projection", "projected_delta", "cost", "assumptions", "metadata_used", "uncertainty_range", "confidence", "routing_disclosure", "optimization_rationale"])) throw new Error("Engineering token projection is invalid.");
  if (value.estimation_id !== context.estimationId || value.estimation_status !== "estimate_only") throw new Error("Engineering token projection identity or status is invalid.");
  const baselineProjection = parseScenario(value.baseline_projection);
  const optimizedProjection = parseScenario(value.optimized_projection);
  if (!record(value.projected_delta) || !exact(value.projected_delta, ["absolute_tokens", "percentage_change"]) || !Number.isSafeInteger(value.projected_delta.absolute_tokens) || typeof value.projected_delta.percentage_change !== "number" || !Number.isFinite(value.projected_delta.percentage_change)) throw new Error("Token projection delta is invalid.");
  const absoluteTokens = baselineProjection.totalTokens - optimizedProjection.totalTokens;
  const percentageChange = baselineProjection.totalTokens === 0 ? 0 : Number(((absoluteTokens / baselineProjection.totalTokens) * 100).toFixed(2));
  if (value.projected_delta.absolute_tokens !== absoluteTokens || Math.abs(value.projected_delta.percentage_change - percentageChange) > 0.01) throw new Error("Token projection delta is inconsistent.");
  let cost: EngineeringTokenProjectionV1["cost"];
  if (context.inputPricePerMillionTokens === undefined || context.outputPricePerMillionTokens === undefined) {
    if (!record(value.cost) || !exact(value.cost, ["status"]) || value.cost.status !== "cost_unavailable") throw new Error("Cost must be unavailable when no validated price was supplied.");
    cost = { status: "cost_unavailable" };
  } else {
    if (!record(value.cost) || !exact(value.cost, ["status", "baseline", "optimized", "currency"]) || value.cost.status !== "estimated" || value.cost.currency !== "USD" || typeof value.cost.baseline !== "number" || typeof value.cost.optimized !== "number" || !Number.isFinite(value.cost.baseline) || !Number.isFinite(value.cost.optimized) || value.cost.baseline < 0 || value.cost.optimized < 0) throw new Error("Estimated cost is invalid.");
    const estimateCost = (scenario: typeof baselineProjection) => Number(((((scenario.totalTokens - scenario.breakdown.finalOutput) * context.inputPricePerMillionTokens!) + (scenario.breakdown.finalOutput * context.outputPricePerMillionTokens!)) / 1_000_000).toFixed(6));
    const baseline = estimateCost(baselineProjection);
    const optimized = estimateCost(optimizedProjection);
    if (Math.abs(value.cost.baseline - baseline) > 0.000001 || Math.abs(value.cost.optimized - optimized) > 0.000001) throw new Error("Estimated cost does not match supplied pricing.");
    cost = { status: "estimated", baseline, optimized, currency: "USD" };
  }
  if (!Array.isArray(value.assumptions) || value.assumptions.length > 12 || !value.assumptions.every((item) => text(item, 240)) || !Array.isArray(value.metadata_used) || value.metadata_used.length > 20 || !value.metadata_used.every((item) => text(item, 80))) throw new Error("Projection evidence is invalid.");
  const allowedMetadata = new Set(["originalTask", ...Object.keys(context).filter((key) => !["estimationId", "inputPricePerMillionTokens", "outputPricePerMillionTokens"].includes(key))]);
  if ((value.metadata_used as string[]).some((key) => !allowedMetadata.has(key))) throw new Error("Projection references metadata that was not supplied.");
  if (!record(value.uncertainty_range) || !exact(value.uncertainty_range, ["baseline_min", "baseline_max", "optimized_min", "optimized_max"]) || ![value.uncertainty_range.baseline_min, value.uncertainty_range.baseline_max, value.uncertainty_range.optimized_min, value.uncertainty_range.optimized_max].every(integer) || (value.uncertainty_range.baseline_min as number) > baselineProjection.totalTokens || (value.uncertainty_range.baseline_max as number) < baselineProjection.totalTokens || (value.uncertainty_range.optimized_min as number) > optimizedProjection.totalTokens || (value.uncertainty_range.optimized_max as number) < optimizedProjection.totalTokens) throw new Error("Projection uncertainty is invalid.");
  if (!(["low", "medium", "high"] as unknown[]).includes(value.confidence) || !record(value.routing_disclosure) || !exact(value.routing_disclosure, ["requested_provider", "requested_model"], ["actual_provider", "actual_model", "substitution_reason"]) || value.routing_disclosure.requested_provider !== context.requestedProvider || value.routing_disclosure.requested_model !== context.requestedModel || (value.routing_disclosure.actual_provider !== undefined && !text(value.routing_disclosure.actual_provider, 80)) || (value.routing_disclosure.actual_model !== undefined && !text(value.routing_disclosure.actual_model, 160)) || (value.routing_disclosure.substitution_reason !== undefined && !text(value.routing_disclosure.substitution_reason, 240)) || !text(value.optimization_rationale, 1_000)) throw new Error("Projection confidence, routing, or rationale is invalid.");
  const wireRouting = value.routing_disclosure;
  const suppliedActualProvider = wireRouting.actual_provider as string | undefined;
  const suppliedActualModel = wireRouting.actual_model as string | undefined;
  const suppliedSubstitutionReason = wireRouting.substitution_reason as string | undefined;
  if (
    ((suppliedActualProvider !== undefined && suppliedActualProvider !== context.requestedProvider) ||
      (suppliedActualModel !== undefined && suppliedActualModel !== context.requestedModel)) &&
    suppliedSubstitutionReason === undefined
  ) throw new Error("A routing substitution requires a reason.");
  // Model-authored actual routing is untrusted. The host transport enriches these
  // requested fields only from its observed provider response.
  const routing = { requestedProvider: context.requestedProvider, requestedModel: context.requestedModel };
  const uncertainty = { baselineMin: value.uncertainty_range.baseline_min as number, baselineMax: value.uncertainty_range.baseline_max as number, optimizedMin: value.uncertainty_range.optimized_min as number, optimizedMax: value.uncertainty_range.optimized_max as number };
  return { estimationId: context.estimationId, estimationStatus: "estimate_only", baselineProjection, optimizedProjection, projectedDelta: { absoluteTokens, percentageChange }, cost, assumptions: [...value.assumptions] as string[], metadataUsed: [...value.metadata_used] as string[], uncertainty, confidence: value.confidence as EngineeringTokenProjectionV1["confidence"], routing, optimizationRationale: value.optimization_rationale as string };
}

export function reconcileEngineeringTokenProjectionV1(projection: EngineeringTokenProjectionV1, telemetry: { inputTokens?: number; outputTokens?: number }, scope: "optimizer_call" | "task_execution" = "task_execution"): EngineeringTokenProjectionV1 {
  if (
    (telemetry.inputTokens !== undefined && !integer(telemetry.inputTokens)) ||
    (telemetry.outputTokens !== undefined && !integer(telemetry.outputTokens))
  ) throw new Error("Token telemetry is invalid.");
  const totalTokens = (telemetry.inputTokens ?? 0) + (telemetry.outputTokens ?? 0);
  if (totalTokens === 0) return projection;
  return { ...projection, estimationStatus: scope === "task_execution" ? "reconciled" : projection.estimationStatus, telemetry: { scope, ...telemetry, totalTokens } };
}
