import { compilePromptDocumentV2 } from "../v2/compiler.js";
import { finalizePromptDocumentV2 } from "../v2/document.js";
import {
  createPromptSemanticRequestV2,
  parsePromptSemanticProviderTextV2,
  semanticPatchFromResultV2,
  type PromptSemanticRequestV2,
} from "../v2/semantic.js";
import type { CompiledPromptDocumentV2, PromptDocumentV2 } from "../v2/types.js";
import {
  DWI_OPTIMIZATION_TRACE_SCHEMA_V1,
  OptimizationCallBudgetV1,
  validateOptimizationTraceV1,
  type OptimizationCallRecordV1,
  type OptimizationTraceV1,
} from "./contracts.js";
import { reconcileEngineeringTokenProjectionV1, validateEngineeringTokenProjectionV1, validateTokenProjectionContextV1, type EngineeringTokenProjectionV1, type TokenProjectionContextV1 } from "./token-projection.js";

export type SemanticFailureCodeV2 =
  | "CANCELLED"
  | "TIMEOUT"
  | "TRUNCATED"
  | "AUTHENTICATION"
  | "RATE_LIMITED"
  | "PROVIDER_ERROR"
  | "INVALID_RESPONSE"
  | "STALE_RESULT";

export class SemanticProviderErrorV2 extends Error {
  constructor(readonly code: SemanticFailureCodeV2, message: string) {
    super(message);
    this.name = "SemanticProviderErrorV2";
  }
}

export interface PromptSemanticProviderResponseV2 {
  readonly text: string;
  readonly latencyMs: number;
  readonly finishReason: string;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly truncated?: boolean;
  readonly actualProvider?: string;
  readonly actualModel?: string;
}

/** Host-owned implementations may perform network I/O; domain orchestration cannot. */
export interface PromptSemanticProviderPortV2 {
  execute(
    request: PromptSemanticRequestV2,
    signal?: AbortSignal,
  ): Promise<PromptSemanticProviderResponseV2>;
}

export type BoundedSemanticEnhancementOutcomeV2 =
  | {
      readonly status: "candidate";
      readonly document: PromptDocumentV2;
      readonly compiled: CompiledPromptDocumentV2;
      readonly trace: OptimizationTraceV1;
      readonly finishReason: string;
      readonly projection?: EngineeringTokenProjectionV1;
    }
  | {
      readonly status: "fallback" | "cancelled";
      readonly document: PromptDocumentV2;
      readonly compiled: CompiledPromptDocumentV2;
      readonly trace: OptimizationTraceV1;
      readonly failureCode: SemanticFailureCodeV2;
    };

function trace(
  document: PromptDocumentV2,
  request: PromptSemanticRequestV2,
  call: OptimizationCallRecordV1,
  outcome: OptimizationTraceV1["outcome"],
): OptimizationTraceV1 {
  return validateOptimizationTraceV1({
    schemaVersion: DWI_OPTIMIZATION_TRACE_SCHEMA_V1,
    session: {
      sessionId: request.requestId,
      documentId: document.id,
      revision: document.revision,
      baseHash: request.baseHash,
    },
    calls: [call],
    outcome,
  });
}

function failure(error: unknown): SemanticFailureCodeV2 {
  if (error instanceof SemanticProviderErrorV2) return error.code;
  if (error instanceof Error && /stale|base[\s-]?hash/iu.test(error.message)) return "STALE_RESULT";
  return "INVALID_RESPONSE";
}

export async function executeBoundedSemanticEnhancementV2(input: {
  readonly document: PromptDocumentV2;
  readonly provider: PromptSemanticProviderPortV2;
  readonly providerId: "gemini" | "openai";
  readonly model: string;
  readonly requestId: string;
  readonly cancellationId: string;
  readonly patchId: string;
  readonly now: string;
  readonly signal?: AbortSignal;
  readonly estimationContext?: TokenProjectionContextV1;
}): Promise<BoundedSemanticEnhancementOutcomeV2> {
  const local = compilePromptDocumentV2(input.document);
  const budget = new OptimizationCallBudgetV1();
  const ordinal = budget.reserve("restructure");
  let request = createPromptSemanticRequestV2(input.document, {
    operation: "enhance",
    requestId: input.requestId,
    cancellationId: input.cancellationId,
    provider: input.providerId,
    model: input.model,
    compiledPrompt: local.text,
  });
  try {
    const estimationContext = input.estimationContext
      ? validateTokenProjectionContextV1(input.estimationContext)
      : undefined;
    if (estimationContext) {
      request = createPromptSemanticRequestV2(input.document, {
        operation: "enhance",
        requestId: input.requestId,
        cancellationId: input.cancellationId,
        provider: input.providerId,
        model: input.model,
        compiledPrompt: local.text,
        estimationContext: estimationContext as unknown as Readonly<Record<string, unknown>> & { estimationId: string },
      });
    }
    if (input.signal?.aborted) throw new SemanticProviderErrorV2("CANCELLED", "Semantic enhancement was cancelled.");
    const response = await input.provider.execute(request, input.signal);
    if (input.signal?.aborted) throw new SemanticProviderErrorV2("CANCELLED", "Semantic enhancement was cancelled.");
    if (response.truncated) throw new SemanticProviderErrorV2("TRUNCATED", "Semantic enhancement was truncated.");
    let semanticText = response.text;
    let projection: EngineeringTokenProjectionV1 | undefined;
    if (estimationContext) {
      const trimmed = response.text.trim();
      const json = trimmed.startsWith("```") ? trimmed.replace(/^```(?:json)?\s*/iu, "").replace(/\s*```$/u, "") : trimmed;
      const raw = JSON.parse(json) as Record<string, unknown>;
      const validatedProjection = validateEngineeringTokenProjectionV1(raw.projection, estimationContext);
      const routeChanged =
        (response.actualProvider !== undefined && response.actualProvider !== validatedProjection.routing.requestedProvider) ||
        (response.actualModel !== undefined && response.actualModel !== validatedProjection.routing.requestedModel);
      const routedProjection = response.actualProvider !== undefined || response.actualModel !== undefined
        ? {
            ...validatedProjection,
            routing: {
              ...validatedProjection.routing,
              ...(response.actualProvider === undefined ? {} : { actualProvider: response.actualProvider }),
              ...(response.actualModel === undefined ? {} : { actualModel: response.actualModel }),
              ...(routeChanged ? { substitutionReason: "Host transport reported a different execution route." } : {}),
            },
          }
        : validatedProjection;
      projection = reconcileEngineeringTokenProjectionV1(routedProjection, { inputTokens: response.inputTokens, outputTokens: response.outputTokens }, "optimizer_call");
      const { projection: _projection, ...semantic } = raw;
      semanticText = JSON.stringify(semantic);
    }
    const result = parsePromptSemanticProviderTextV2(semanticText, request);
    if (result.operation !== "enhance") throw new SemanticProviderErrorV2("INVALID_RESPONSE", "Semantic enhancement returned the wrong operation.");
    const candidatePatch = semanticPatchFromResultV2(request, result, {
      patchId: input.patchId,
      createdAt: input.now,
    });
    const patch = { ...candidatePatch, status: "applied" as const };
    const { canonicalHash: _canonicalHash, ...source } = input.document;
    const document = finalizePromptDocumentV2({
      ...source,
      semanticPatches: [...source.semanticPatches, patch],
    });
    const compiled = compilePromptDocumentV2(document);
    const call: OptimizationCallRecordV1 = {
      ordinal,
      purpose: "restructure",
      provider: input.providerId,
      model: input.model,
      baseHash: request.baseHash,
      result: "completed",
      latencyMs: response.latencyMs,
      ...(response.inputTokens === undefined ? {} : { inputTokens: response.inputTokens }),
      ...(response.outputTokens === undefined ? {} : { outputTokens: response.outputTokens }),
    };
    return {
      status: "candidate",
      document,
      compiled,
      trace: trace(input.document, request, call, "candidate"),
      finishReason: response.finishReason,
      ...(projection ? { projection } : {}),
    };
  } catch (error) {
    const failureCode = failure(error);
    const cancelled = failureCode === "CANCELLED";
    const call: OptimizationCallRecordV1 = {
      ordinal,
      purpose: "restructure",
      provider: input.providerId,
      model: input.model,
      baseHash: request.baseHash,
      result: cancelled ? "cancelled" : "rejected",
      failureCode,
    };
    return {
      status: cancelled ? "cancelled" : "fallback",
      document: input.document,
      compiled: local,
      trace: trace(input.document, request, call, cancelled ? "cancelled" : "fallback"),
      failureCode,
    };
  }
}
