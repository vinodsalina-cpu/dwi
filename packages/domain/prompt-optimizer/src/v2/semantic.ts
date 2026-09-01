import {
  PROMPT_OPTIMIZED_LIMIT_BYTES,
  type PromptProvider,
} from "../types.js";
import type {
  PromptDocumentV2,
  PromptPatchOperationV2,
  PromptSectionId,
  PromptSemanticPatchV2,
} from "./types.js";
import { promptSectionIds } from "./types.js";
import { hashPromptSemanticBaseV2 } from "./document.js";
import { PROMPT_QUESTION_POLICY_V2 } from "./question-policy.js";

export type PromptSemanticOperation = "analyze" | "enhance" | "validate";

export const promptGeneratedQuestionTargetsV2 = Object.freeze([
  "desired-outcome",
  "scope",
  "constraints",
  "acceptance-criteria",
  "output-contract",
  "verification",
] as const satisfies readonly PromptSectionId[]);

export type PromptGeneratedQuestionTargetV2 =
  (typeof promptGeneratedQuestionTargetsV2)[number];

export const PROMPT_GENERATED_QUESTION_LIMITS_V2 = Object.freeze({
  maxQuestions: PROMPT_QUESTION_POLICY_V2.maxQuestions,
  minOptions: 2,
  maxOptions: 4,
  id: Object.freeze({ maxChars: 64, maxBytes: 64 }),
  question: Object.freeze({ maxChars: 160, maxBytes: 384 }),
  gap: Object.freeze({ maxChars: 220, maxBytes: 512 }),
  optionLabel: Object.freeze({ maxChars: 72, maxBytes: 160 }),
  optionValue: Object.freeze({ maxChars: 240, maxBytes: 512 }),
} as const);

export const PROMPT_SEMANTIC_PROVIDER_RESPONSE_LIMIT_BYTES = 64 * 1024;

export interface PromptGeneratedQuestionOptionV2 {
  readonly id: string;
  readonly label: string;
  readonly value: string;
}

export interface PromptGeneratedQuestionV2 {
  readonly id: string;
  readonly target: PromptGeneratedQuestionTargetV2;
  readonly question: string;
  readonly gap: string;
  readonly options: readonly PromptGeneratedQuestionOptionV2[];
}

export interface PromptGeneratedQuestionProvenanceV2 {
  readonly source: "semantic-provider";
  readonly provider: PromptProvider;
  readonly model: string;
  readonly requestId: string;
}

export interface PromptSemanticRequestV2 {
  readonly schemaVersion: "prompt-semantic-request.v2";
  readonly operation: PromptSemanticOperation;
  readonly requestId: string;
  readonly cancellationId: string;
  readonly documentId: string;
  readonly revision: number;
  readonly baseHash: string;
  readonly provider: PromptProvider;
  readonly model: string;
  readonly outboundCategories: readonly (
    | "prompt"
    | "structured-fields"
    | "explicit-context"
    | "guidance"
    | "governed-metadata"
  )[];
  readonly compiledPrompt: string;
  readonly allowlistedQuestionIds: readonly string[];
  readonly allowlistedQuestionTargets: readonly PromptGeneratedQuestionTargetV2[];
  readonly allowlistedSectionIds: readonly PromptSectionId[];
  readonly lockedSectionIds: readonly PromptSectionId[];
  readonly estimationContext?: Readonly<Record<string, unknown>> & { readonly estimationId: string };
}

export interface PromptAllowlistedAnalyzeResultV2 {
  readonly schemaVersion: "prompt-analyze-result.v2";
  readonly operation: "analyze";
  readonly baseHash: string;
  readonly questionIds: readonly string[];
}

export interface PromptGeneratedAnalyzeResultV3 {
  readonly schemaVersion: "prompt-analyze-result.v3";
  readonly operation: "analyze";
  readonly baseHash: string;
  readonly questions: readonly PromptGeneratedQuestionV2[];
  readonly provenance: PromptGeneratedQuestionProvenanceV2;
}

export type PromptAnalyzeResultV2 =
  PromptGeneratedAnalyzeResultV3 | PromptAllowlistedAnalyzeResultV2;

export interface PromptEnhanceResultV2 {
  readonly schemaVersion: "prompt-enhance-result.v2";
  readonly operation: "enhance";
  readonly baseHash: string;
  readonly operations: readonly PromptPatchOperationV2[];
}

export interface PromptValidationViolationV2 {
  readonly id: string;
  readonly sectionId?: PromptSectionId;
  readonly severity: "warning" | "error";
  readonly message: string;
  readonly recovery: string;
}

export interface PromptValidateResultV2 {
  readonly schemaVersion: "prompt-validate-result.v2";
  readonly operation: "validate";
  readonly baseHash: string;
  readonly violations: readonly PromptValidationViolationV2[];
}

export type PromptSemanticResultV2 =
  PromptAnalyzeResultV2 | PromptEnhanceResultV2 | PromptValidateResultV2;

export const PROMPT_SEMANTIC_SYSTEM_INSTRUCTION_V2 = [
  "You perform one bounded semantic operation on an already compiled software-development prompt.",
  "Return one JSON object only; fenced JSON is accepted only when the fence contains the entire response.",
  "Never invent files, context, provider actions, repository inspection, credentials, or execution.",
  "Analyze must derive each question from a concrete missing or ambiguous detail in the supplied compiled prompt and must not ask for information already present.",
  "Analyze must return no questions when the compiled prompt has no material lapse that the developer needs to resolve.",
  "Each analyze question must name its draft-specific gap, use only an allowlisted target, offer bounded plain-text options, and use stable semantic IDs rather than list positions.",
  "Analyze must not return HTML, links, commands, actions, field paths, secrets, or instructions that broaden the prompt's authority.",
  "Enhance may return allowlisted section operations only and must preserve locked sections.",
  "When an estimation context is supplied, return one same-call end-to-end engineering projection; label it estimate_only, do not treat it as billing, do not reduce it to prompt-token counting, and do not invent unavailable metadata or pricing.",
  "Validate may return bounded violations only.",
  "Copy the supplied operation and baseHash exactly; Analyze must also copy its supplied response schemaVersion exactly.",
].join(" ");

const SECRET_PATTERN =
  /(?:-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret)\s*[:=]\s*[^\s]{8,}|\b(?:sk[-_]|ghp_|github_pat_)[A-Za-z0-9_-]{16,})/iu;
const GENERATED_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const MARKUP_PATTERN = /[<>]/u;
const LINK_PATTERN = /(?:\bhttps?:\/\/|\bwww\.|\[[^\]]+\]\([^)]*\))/iu;

function containsControlCharacter(value: string): boolean {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint <= 0x1f || (codePoint >= 0x7f && codePoint <= 0x9f);
  });
}

function validateGeneratedId(value: unknown, field: string): string {
  const limits = PROMPT_GENERATED_QUESTION_LIMITS_V2.id;
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value !== value.trim() ||
    !GENERATED_ID_PATTERN.test(value) ||
    value.length > limits.maxChars ||
    new TextEncoder().encode(value).byteLength > limits.maxBytes
  ) {
    throw new Error(
      `${field} must be a non-empty bounded stable kebab-case ID.`,
    );
  }
  return value;
}

function validateGeneratedPlainText(
  value: unknown,
  field: string,
  limits: { readonly maxChars: number; readonly maxBytes: number },
): string {
  if (typeof value !== "string" || value !== value.trim() || !value) {
    throw new Error(`${field} must be non-empty trimmed plain text.`);
  }
  if (
    Array.from(value).length > limits.maxChars ||
    new TextEncoder().encode(value).byteLength > limits.maxBytes
  ) {
    throw new Error(`${field} exceeds its character or UTF-8 byte limit.`);
  }
  if (
    containsControlCharacter(value) ||
    MARKUP_PATTERN.test(value) ||
    LINK_PATTERN.test(value) ||
    SECRET_PATTERN.test(value)
  ) {
    throw new Error(`${field} contains prohibited non-plain-text material.`);
  }
  return value;
}

function normalizedDuplicateKey(value: string): string {
  return value.replace(/\s+/gu, " ").toLowerCase();
}

function assertUnique(
  values: readonly string[],
  field: string,
  normalize = false,
): void {
  const keys = normalize ? values.map(normalizedDuplicateKey) : values;
  if (new Set(keys).size !== keys.length) {
    throw new Error(`${field} must not contain duplicates.`);
  }
}

export function parsePromptGeneratedQuestionV2(
  value: unknown,
): PromptGeneratedQuestionV2 {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["id", "target", "question", "gap", "options"])
  ) {
    throw new Error("Generated question must use the exact bounded schema.");
  }
  const id = validateGeneratedId(value.id, "Generated question ID");
  if (
    typeof value.target !== "string" ||
    !promptGeneratedQuestionTargetsV2.includes(
      value.target as PromptGeneratedQuestionTargetV2,
    )
  ) {
    throw new Error("Generated question targets an unknown draft field.");
  }
  const question = validateGeneratedPlainText(
    value.question,
    "Generated question text",
    PROMPT_GENERATED_QUESTION_LIMITS_V2.question,
  );
  const gap = validateGeneratedPlainText(
    value.gap,
    "Generated question gap",
    PROMPT_GENERATED_QUESTION_LIMITS_V2.gap,
  );
  if (
    !Array.isArray(value.options) ||
    value.options.length < PROMPT_GENERATED_QUESTION_LIMITS_V2.minOptions ||
    value.options.length > PROMPT_GENERATED_QUESTION_LIMITS_V2.maxOptions
  ) {
    throw new Error("Generated question must contain two to four options.");
  }
  const options = value.options.map((candidate) => {
    if (
      !isRecord(candidate) ||
      !hasExactKeys(candidate, ["id", "label", "value"])
    ) {
      throw new Error("Generated question option must use the exact schema.");
    }
    return {
      id: validateGeneratedId(candidate.id, "Generated option ID"),
      label: validateGeneratedPlainText(
        candidate.label,
        "Generated option label",
        PROMPT_GENERATED_QUESTION_LIMITS_V2.optionLabel,
      ),
      value: validateGeneratedPlainText(
        candidate.value,
        "Generated option value",
        PROMPT_GENERATED_QUESTION_LIMITS_V2.optionValue,
      ),
    };
  });
  assertUnique(
    options.map(({ id: optionId }) => optionId),
    "Generated option IDs",
  );
  assertUnique(
    options.map(({ label }) => label),
    "Generated option labels",
    true,
  );
  assertUnique(
    options.map(({ value: optionValue }) => optionValue),
    "Generated option values",
    true,
  );
  return {
    id,
    target: value.target as PromptGeneratedQuestionTargetV2,
    question,
    gap,
    options,
  };
}

function parsePromptGeneratedQuestionsV2(
  value: unknown,
): readonly PromptGeneratedQuestionV2[] {
  if (
    !Array.isArray(value) ||
    value.length > PROMPT_GENERATED_QUESTION_LIMITS_V2.maxQuestions
  ) {
    throw new Error("Analyze returned too many generated questions.");
  }
  const questions = value.map(parsePromptGeneratedQuestionV2);
  assertUnique(
    questions.map(({ id }) => id),
    "Generated question IDs",
  );
  assertUnique(
    questions.map(({ question }) => question),
    "Generated question text",
    true,
  );
  assertUnique(
    questions.map(({ target }) => target),
    "Generated question targets",
  );
  return questions;
}

function validatePatchText(text: string): void {
  if (!text.trim()) throw new Error("Semantic patch text must not be empty.");
  if (
    new TextEncoder().encode(text).byteLength > PROMPT_OPTIMIZED_LIMIT_BYTES
  ) {
    throw new Error("Semantic patch text exceeds the output byte limit.");
  }
  if (SECRET_PATTERN.test(text) || text.includes("\0")) {
    throw new Error(
      "Semantic patch text contains prohibited secret or binary material.",
    );
  }
}

export function validatePromptSemanticResultV2(
  request: PromptSemanticRequestV2,
  result: unknown,
): PromptSemanticResultV2 {
  if (!isRecord(result)) {
    throw new Error("Semantic result must be an object.");
  }
  if (result.operation !== request.operation) {
    throw new Error("Semantic result operation does not match the request.");
  }
  if (result.baseHash !== request.baseHash) {
    throw new Error("Semantic result is stale.");
  }
  if (result.operation === "analyze") {
    if (result.schemaVersion === "prompt-analyze-result.v3") {
      if (
        !hasExactKeys(result, [
          "schemaVersion",
          "operation",
          "baseHash",
          "questions",
          "provenance",
        ]) ||
        !isRecord(result.provenance) ||
        !hasExactKeys(result.provenance, [
          "source",
          "provider",
          "model",
          "requestId",
        ]) ||
        result.provenance.source !== "semantic-provider" ||
        result.provenance.provider !== request.provider ||
        result.provenance.model !== request.model ||
        result.provenance.requestId !== request.requestId
      ) {
        throw new Error("Generated question provenance is invalid or spoofed.");
      }
      const questions = parsePromptGeneratedQuestionsV2(result.questions);
      if (
        questions.some(
          ({ target }) => !request.allowlistedQuestionTargets.includes(target),
        )
      ) {
        throw new Error("Generated question target was not allowlisted.");
      }
      return {
        schemaVersion: "prompt-analyze-result.v3",
        operation: "analyze",
        baseHash: request.baseHash,
        questions,
        provenance: {
          source: "semantic-provider",
          provider: request.provider,
          model: request.model,
          requestId: request.requestId,
        },
      };
    }
    if (
      result.schemaVersion !== "prompt-analyze-result.v2" ||
      !hasExactKeys(result, [
        "schemaVersion",
        "operation",
        "baseHash",
        "questionIds",
      ]) ||
      !Array.isArray(result.questionIds) ||
      result.questionIds.length >
        PROMPT_GENERATED_QUESTION_LIMITS_V2.maxQuestions ||
      !result.questionIds.every((id) => typeof id === "string") ||
      new Set(result.questionIds).size !== result.questionIds.length ||
      result.questionIds.some(
        (id) => !request.allowlistedQuestionIds.includes(id as string),
      )
    ) {
      throw new Error("Analyze returned an unknown or duplicate question ID.");
    }
    return {
      schemaVersion: "prompt-analyze-result.v2",
      operation: "analyze",
      baseHash: request.baseHash,
      questionIds: [...result.questionIds] as string[],
    };
  }
  if (result.operation === "enhance") {
    if (
      result.schemaVersion !== "prompt-enhance-result.v2" ||
      !hasExactKeys(result, [
        "schemaVersion",
        "operation",
        "baseHash",
        "operations",
      ]) ||
      !Array.isArray(result.operations) ||
      result.operations.length > 25
    ) {
      throw new Error("Semantic enhancement result is invalid.");
    }
    const operations = result.operations.map(parsePatchOperation);
    if (operations.some((operation) => operation === undefined)) {
      throw new Error("Semantic enhancement result is invalid.");
    }
    for (const operation of operations as PromptPatchOperationV2[]) {
      if (!request.allowlistedSectionIds.includes(operation.sectionId)) {
        throw new Error(
          `Semantic operation targets unknown section ${operation.sectionId}.`,
        );
      }
      if (request.lockedSectionIds.includes(operation.sectionId)) {
        throw new Error(
          `Semantic operation cannot target locked section ${operation.sectionId}.`,
        );
      }
      if (operation.operation !== "remove-section")
        validatePatchText(operation.text);
    }
    return {
      schemaVersion: "prompt-enhance-result.v2",
      operation: "enhance",
      baseHash: request.baseHash,
      operations: operations as PromptPatchOperationV2[],
    };
  }
  if (
    result.schemaVersion !== "prompt-validate-result.v2" ||
    !hasExactKeys(result, [
      "schemaVersion",
      "operation",
      "baseHash",
      "violations",
    ]) ||
    !Array.isArray(result.violations) ||
    result.violations.length > 25
  ) {
    throw new Error("Semantic validation returned too many violations.");
  }
  const violations: PromptValidationViolationV2[] = [];
  for (const violation of result.violations) {
    if (
      !isRecord(violation) ||
      !hasExactKeys(
        violation,
        ["id", "severity", "message", "recovery"],
        ["sectionId"],
      ) ||
      typeof violation.id !== "string" ||
      (violation.severity !== "warning" && violation.severity !== "error") ||
      typeof violation.message !== "string" ||
      typeof violation.recovery !== "string" ||
      violation.message.length > 500 ||
      violation.recovery.length > 500
    ) {
      throw new Error("Semantic validation violation is oversized.");
    }
    if (
      violation.sectionId &&
      !promptSectionIds.includes(violation.sectionId as PromptSectionId)
    ) {
      throw new Error(
        "Semantic validation violation targets an unknown section.",
      );
    }
    violations.push({
      id: violation.id,
      severity: violation.severity,
      message: violation.message,
      recovery: violation.recovery,
      ...(violation.sectionId
        ? { sectionId: violation.sectionId as PromptSectionId }
        : {}),
    });
  }
  return {
    schemaVersion: "prompt-validate-result.v2",
    operation: "validate",
    baseHash: request.baseHash,
    violations,
  };
}

export function semanticPatchFromResultV2(
  request: PromptSemanticRequestV2,
  result: PromptEnhanceResultV2,
  input: {
    readonly patchId: string;
    readonly createdAt: string;
  },
): PromptSemanticPatchV2 {
  const validated = validatePromptSemanticResultV2(request, result);
  if (validated.operation !== "enhance") {
    throw new Error("Semantic patch requires an enhancement result.");
  }
  return {
    id: input.patchId,
    operationId: request.requestId,
    provider: request.provider,
    model: request.model,
    baseHash: request.baseHash,
    createdAt: input.createdAt,
    operations: validated.operations,
    status: "candidate",
  };
}

export function createPromptSemanticRequestV2(
  document: PromptDocumentV2,
  input: {
    readonly operation: PromptSemanticOperation;
    readonly requestId: string;
    readonly cancellationId: string;
    readonly provider: PromptProvider;
    readonly model: string;
    readonly compiledPrompt: string;
    readonly allowlistedQuestionIds?: readonly string[];
    readonly estimationContext?: Readonly<Record<string, unknown>> & { readonly estimationId: string };
  },
): PromptSemanticRequestV2 {
  return {
    schemaVersion: "prompt-semantic-request.v2",
    operation: input.operation,
    requestId: input.requestId,
    cancellationId: input.cancellationId,
    documentId: document.id,
    revision: document.revision,
    baseHash: hashPromptSemanticBaseV2(document),
    provider: input.provider,
    model: input.model,
    outboundCategories: [
      "prompt",
      "structured-fields",
      ...(document.contexts.some((context) => context.included)
        ? ["explicit-context" as const]
        : []),
      ...(document.guidance.usedBytes > 0 ? ["guidance" as const] : []),
      ...(document.repositoryContext ? ["governed-metadata" as const] : []),
    ],
    compiledPrompt: input.compiledPrompt,
    allowlistedQuestionIds: input.allowlistedQuestionIds ?? [],
    allowlistedQuestionTargets: promptGeneratedQuestionTargetsV2,
    allowlistedSectionIds: promptSectionIds,
    lockedSectionIds: document.lockedSections,
    ...(input.estimationContext ? { estimationContext: input.estimationContext } : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const keys = Object.keys(value);
  return (
    required.every((key) => keys.includes(key)) &&
    keys.every((key) => required.includes(key) || optional.includes(key))
  );
}

function parseSingleJsonObject(text: string): unknown {
  if (
    new TextEncoder().encode(text).byteLength >
    PROMPT_SEMANTIC_PROVIDER_RESPONSE_LIMIT_BYTES
  ) {
    throw new Error("Semantic provider response exceeds the wire byte limit.");
  }
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/iu.exec(trimmed);
  const body = fenced?.[1] ?? trimmed;
  if (!body.startsWith("{") || !body.endsWith("}")) {
    throw new Error("Semantic provider response is not one JSON object.");
  }
  try {
    return JSON.parse(body);
  } catch {
    throw new Error("Semantic provider response contains malformed JSON.");
  }
}

function parsePatchOperation(
  value: unknown,
): PromptPatchOperationV2 | undefined {
  if (!isRecord(value)) return undefined;
  if (
    value.operation === "remove-section" &&
    hasExactKeys(value, ["operation", "sectionId"]) &&
    promptSectionIds.includes(value.sectionId as PromptSectionId)
  ) {
    return {
      operation: "remove-section",
      sectionId: value.sectionId as PromptSectionId,
    };
  }
  if (
    (value.operation === "replace-section" ||
      value.operation === "append-section") &&
    hasExactKeys(value, ["operation", "sectionId", "text"]) &&
    promptSectionIds.includes(value.sectionId as PromptSectionId) &&
    typeof value.text === "string"
  ) {
    return {
      operation: value.operation,
      sectionId: value.sectionId as PromptSectionId,
      text: value.text,
    };
  }
  return undefined;
}

export function parsePromptSemanticProviderTextV2(
  text: string,
  request: PromptSemanticRequestV2,
): PromptSemanticResultV2 {
  const value = parseSingleJsonObject(text);
  if (!isRecord(value))
    throw new Error("Semantic provider result must be an object.");
  if (value.operation !== request.operation)
    throw new Error("Semantic result operation does not match the request.");
  if (typeof value.baseHash === "string" && value.baseHash !== request.baseHash)
    throw new Error("Semantic result is stale.");
  if (
    value.operation === "analyze" &&
    value.schemaVersion === "prompt-analyze-result.v3" &&
    hasExactKeys(value, [
      "schemaVersion",
      "operation",
      "baseHash",
      "questions",
    ]) &&
    value.baseHash === request.baseHash
  ) {
    const questions = parsePromptGeneratedQuestionsV2(value.questions);
    return validatePromptSemanticResultV2(request, {
      schemaVersion: "prompt-analyze-result.v3",
      operation: "analyze",
      baseHash: value.baseHash,
      questions,
      provenance: {
        source: "semantic-provider",
        provider: request.provider,
        model: request.model,
        requestId: request.requestId,
      },
    });
  }
  if (
    value.operation === "analyze" &&
    hasExactKeys(value, ["operation", "baseHash", "questionIds"]) &&
    value.baseHash === request.baseHash &&
    Array.isArray(value.questionIds) &&
    value.questionIds.every((id) => typeof id === "string")
  ) {
    return validatePromptSemanticResultV2(request, {
      schemaVersion: "prompt-analyze-result.v2",
      operation: "analyze",
      baseHash: value.baseHash,
      questionIds: value.questionIds,
    });
  }
  if (
    value.operation === "enhance" &&
    hasExactKeys(value, ["operation", "baseHash", "operations"]) &&
    value.baseHash === request.baseHash &&
    Array.isArray(value.operations) &&
    value.operations.length <= 25
  ) {
    const operations = value.operations.map(parsePatchOperation);
    if (operations.some((operation) => operation === undefined)) {
      throw new Error(
        "Semantic provider returned an invalid section operation.",
      );
    }
    return validatePromptSemanticResultV2(request, {
      schemaVersion: "prompt-enhance-result.v2",
      operation: "enhance",
      baseHash: value.baseHash,
      operations: operations as PromptPatchOperationV2[],
    });
  }
  if (
    value.operation === "validate" &&
    hasExactKeys(value, ["operation", "baseHash", "violations"]) &&
    value.baseHash === request.baseHash &&
    Array.isArray(value.violations) &&
    value.violations.length <= 25
  ) {
    const violations: PromptValidationViolationV2[] = [];
    for (const candidate of value.violations) {
      if (
        !isRecord(candidate) ||
        !hasExactKeys(
          candidate,
          ["id", "severity", "message", "recovery"],
          ["sectionId"],
        ) ||
        typeof candidate.id !== "string" ||
        (candidate.severity !== "warning" && candidate.severity !== "error") ||
        typeof candidate.message !== "string" ||
        typeof candidate.recovery !== "string" ||
        (candidate.sectionId !== undefined &&
          !promptSectionIds.includes(candidate.sectionId as PromptSectionId))
      ) {
        throw new Error("Semantic provider returned an invalid violation.");
      }
      violations.push({
        id: candidate.id,
        severity: candidate.severity,
        message: candidate.message,
        recovery: candidate.recovery,
        ...(candidate.sectionId
          ? { sectionId: candidate.sectionId as PromptSectionId }
          : {}),
      });
    }
    return validatePromptSemanticResultV2(request, {
      schemaVersion: "prompt-validate-result.v2",
      operation: "validate",
      baseHash: value.baseHash,
      violations,
    });
  }
  throw new Error(
    "Semantic provider result does not match the requested operation.",
  );
}

export function buildPromptSemanticProviderInputV2(
  request: PromptSemanticRequestV2,
): {
  readonly system: string;
  readonly prompt: string;
  readonly maxOutputTokens: number;
  readonly temperature: number;
} {
  const responseContract =
    request.operation === "analyze"
      ? {
          schemaVersion: "prompt-analyze-result.v3",
          operation: "analyze",
          baseHash: request.baseHash,
          questions: [
            {
              id: "stable-semantic-gap-id",
              target: request.allowlistedQuestionTargets,
              question: "one draft-specific clarification question",
              gap: "the concrete missing or ambiguous detail found in the compiled prompt",
              options: [
                {
                  id: "stable-first-option-id",
                  label: "short plain-text choice",
                  value: "bounded value to apply to the target draft field",
                },
                {
                  id: "stable-second-option-id",
                  label: "another short plain-text choice",
                  value:
                    "another bounded value for the same target draft field",
                },
              ],
            },
          ],
        }
      : request.operation === "enhance"
        ? {
            operation: "enhance",
            baseHash: request.baseHash,
            operations: [
              {
                operation: "replace-section | append-section | remove-section",
                sectionId: request.allowlistedSectionIds,
                text: "required except for remove-section",
              },
            ],
            ...(request.estimationContext ? {
              projection: {
                estimation_id: request.estimationContext.estimationId,
                estimation_status: "estimate_only",
                baseline_projection: { total_tokens: "integer sum of breakdown", breakdown: { planning: "integer", context_ingestion: "integer", prompt_input: "integer", tool_provider_calls: "integer", retries: "integer", final_output: "integer" } },
                optimized_projection: { total_tokens: "integer sum of breakdown", breakdown: { planning: "integer", context_ingestion: "integer", prompt_input: "integer", tool_provider_calls: "integer", retries: "integer", final_output: "integer" } },
                projected_delta: { absolute_tokens: "baseline minus optimized", percentage_change: "percentage saved; negative when added" },
                cost: request.estimationContext.inputPricePerMillionTokens === undefined || request.estimationContext.outputPricePerMillionTokens === undefined
                  ? { status: "cost_unavailable" }
                  : { status: "estimated", baseline: "USD number computed from supplied prices", optimized: "USD number computed from supplied prices", currency: "USD" },
                assumptions: ["bounded assumption"], metadata_used: ["metadata field name from estimationContext or originalTask"],
                uncertainty_range: { baseline_min: "integer", baseline_max: "integer", optimized_min: "integer", optimized_max: "integer" },
                confidence: "low | medium | high",
                routing_disclosure: { requested_provider: request.provider, requested_model: request.model, actual_provider: "omit when unknown", actual_model: "omit when unknown", substitution_reason: "required when actual differs" },
                optimization_rationale: "bounded rationale",
              },
            } : {}),
          }
        : {
            operation: "validate",
            baseHash: request.baseHash,
            violations: [
              {
                id: "stable-id",
                sectionId: request.allowlistedSectionIds,
                severity: "warning | error",
                message: "bounded cause",
                recovery: "bounded recovery",
              },
            ],
          };
  return {
    system: PROMPT_SEMANTIC_SYSTEM_INSTRUCTION_V2,
    prompt: JSON.stringify({
      operation: request.operation,
      baseHash: request.baseHash,
      ...(request.operation === "analyze"
        ? {
            analyzeRequirements: {
              deriveFrom: "compiledPrompt",
              askOnlyForActualMissingOrAmbiguousDetails: true,
              doNotAskForAlreadySuppliedInformation: true,
              gapMustDescribeDraftSpecificEvidence: true,
              stableIdsMustDescribeSemanticGap: true,
              allowlistedQuestionTargets: request.allowlistedQuestionTargets,
              limits: PROMPT_GENERATED_QUESTION_LIMITS_V2,
              plainTextOnly: true,
              prohibited: [
                "html",
                "links",
                "commands",
                "actions",
                "field-paths",
                "secrets",
              ],
            },
          }
        : {}),
      allowlistedSectionIds: request.allowlistedSectionIds,
      lockedSectionIds: request.lockedSectionIds,
      outboundCategories: request.outboundCategories,
      compiledPrompt: request.compiledPrompt,
      ...(request.estimationContext ? { estimationContext: request.estimationContext, projectionRequirements: { endToEndEngineeringEstimate: true, notBillingRecord: true, notPromptTokenCountOnly: true, noIndependentTransmission: true } } : {}),
      responseContract,
    }),
    maxOutputTokens:
      request.operation === "analyze"
        ? 4_096
        : request.operation === "validate"
          ? 2_048
          : 8_192,
    temperature: 0.2,
  };
}
