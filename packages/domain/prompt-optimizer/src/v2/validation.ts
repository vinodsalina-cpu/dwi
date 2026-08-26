import {
  PROMPT_CONTEXT_ITEM_LIMIT_BYTES,
  PROMPT_CONTEXT_MAX_ITEMS,
  PROMPT_CONTEXT_TOTAL_LIMIT_BYTES,
  PROMPT_TEXT_LIMIT_CHARS,
  promptGuidancePackIds,
  promptTypes,
} from "../types.js";
import {
  hashPromptDocumentV2,
  type PromptDocumentMutableSourceV2,
} from "./document.js";
import {
  PROMPT_DOCUMENT_V2_SCHEMA,
  promptRefinementIds,
  promptSectionIds,
  type PromptDocumentV2,
} from "./types.js";
import { canonicalHash, type CanonicalValue } from "./canonical.js";

const PROMPT_DOCUMENT_V2_MAX_WIRE_BYTES = 512 * 1024;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u;

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

function isId(value: unknown): value is string {
  return typeof value === "string" && ID_PATTERN.test(value);
}

function isHash(value: unknown): value is string {
  return typeof value === "string" && HASH_PATTERN.test(value);
}

function isTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 64 &&
    !Number.isNaN(Date.parse(value))
  );
}

function isSafeText(value: unknown, limit: number): value is string {
  return (
    typeof value === "string" && value.length <= limit && !value.includes("\0")
  );
}

function isStringArray(
  value: unknown,
  maxItems: number,
  maxLength = 500,
): value is string[] {
  return (
    Array.isArray(value) &&
    value.length <= maxItems &&
    value.every((item) => isSafeText(item, maxLength))
  );
}

function isDefinitionReference(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["id", "version", "canonicalHash"]) &&
    isId(value.id) &&
    isSafeText(value.version, 50) &&
    isHash(value.canonicalHash)
  );
}

function isDefinitionSnapshot(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasExactKeys(
      value,
      [
        "schemaVersion",
        "promptType",
        "compilerRecipe",
        "questionBank",
        "guidancePolicy",
        "capturedAt",
      ],
      ["template"],
    ) &&
    value.schemaVersion === "prompt-definition-snapshot.v2" &&
    isDefinitionReference(value.promptType) &&
    (value.template === undefined || isDefinitionReference(value.template)) &&
    isDefinitionReference(value.compilerRecipe) &&
    isDefinitionReference(value.questionBank) &&
    isDefinitionReference(value.guidancePolicy) &&
    isTimestamp(value.capturedAt)
  );
}

function isDraftFields(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "title",
      "desiredOutcome",
      "inScope",
      "outOfScope",
      "verification",
      "outputFormat",
      "hardConstraints",
      "acceptanceCriteria",
    ])
  ) {
    return false;
  }
  return Object.values(value).every((item) =>
    isSafeText(item, PROMPT_TEXT_LIMIT_CHARS),
  );
}

function isContext(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !hasExactKeys(
      value,
      [
        "id",
        "source",
        "safeLabel",
        "classification",
        "byteCount",
        "included",
        "outbound",
        "content",
        "capturedRevision",
      ],
      ["languageId", "relativePath"],
    ) ||
    !isId(value.id) ||
    ![
      "selection",
      "picked_file",
      "pasted",
      "governed_project_metadata",
    ].includes(String(value.source)) ||
    !["text", "code", "configuration", "governed-metadata"].includes(
      String(value.classification),
    ) ||
    !isSafeText(value.safeLabel, 500) ||
    typeof value.included !== "boolean" ||
    typeof value.outbound !== "boolean" ||
    !isSafeText(value.content, PROMPT_TEXT_LIMIT_CHARS * 4) ||
    !Number.isSafeInteger(value.byteCount) ||
    Number(value.byteCount) < 0 ||
    Number(value.byteCount) > PROMPT_CONTEXT_ITEM_LIMIT_BYTES ||
    new TextEncoder().encode(value.content as string).byteLength !==
      value.byteCount ||
    !Number.isSafeInteger(value.capturedRevision) ||
    Number(value.capturedRevision) < 0
  ) {
    return false;
  }
  return (
    (value.languageId === undefined || isSafeText(value.languageId, 100)) &&
    (value.relativePath === undefined ||
      (isSafeText(value.relativePath, 500) &&
        !value.relativePath.startsWith("/") &&
        !value.relativePath.split(/[\\/]/u).includes("..")))
  );
}

function isGuidanceItem(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasExactKeys(value, [
      "id",
      "tier",
      "text",
      "source",
      "provenance",
      "byteCount",
      "locked",
    ]) &&
    isId(value.id) &&
    ["required", "recommended", "optional", "excluded"].includes(
      String(value.tier),
    ) &&
    [
      "platform",
      "organization",
      "project",
      "repository",
      "developer",
      "task",
    ].includes(String(value.source)) &&
    isSafeText(value.text, PROMPT_TEXT_LIMIT_CHARS) &&
    isSafeText(value.provenance, 500) &&
    Number.isSafeInteger(value.byteCount) &&
    Number(value.byteCount) ===
      new TextEncoder().encode(value.text as string).byteLength &&
    typeof value.locked === "boolean"
  );
}

function isGuidance(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "required",
      "recommended",
      "optional",
      "excluded",
      "conflicts",
      "byteBudget",
      "usedBytes",
      "trace",
      "canonicalHash",
    ]) ||
    !isHash(value.canonicalHash) ||
    !Number.isSafeInteger(value.byteBudget) ||
    !Number.isSafeInteger(value.usedBytes)
  ) {
    return false;
  }
  const groups = [
    value.required,
    value.recommended,
    value.optional,
    value.excluded,
  ];
  const structurallyValid =
    groups.every(
      (group) =>
        Array.isArray(group) &&
        group.length <= 100 &&
        group.every(isGuidanceItem),
    ) &&
    Array.isArray(value.conflicts) &&
    value.conflicts.length <= 100 &&
    Array.isArray(value.trace) &&
    value.trace.length <= 200;
  if (!structurallyValid) return false;
  const { canonicalHash: _canonicalHash, ...source } = value;
  return (
    canonicalHash(source as unknown as CanonicalValue) === value.canonicalHash
  );
}

function isAssumption(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["id", "text", "status", "originId"]) &&
    isId(value.id) &&
    isSafeText(value.text, 2_048) &&
    ["unresolved", "accepted", "rejected"].includes(String(value.status)) &&
    isId(value.originId)
  );
}

function isManualOverride(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasExactKeys(value, ["text", "baseCompiledHash", "status", "updatedAt"]) &&
    isSafeText(value.text, PROMPT_TEXT_LIMIT_CHARS * 2) &&
    new TextEncoder().encode(value.text as string).byteLength <= 64 * 1024 &&
    isHash(value.baseCompiledHash) &&
    ["edited-after-compile", "retained-stale"].includes(String(value.status)) &&
    isTimestamp(value.updatedAt)
  );
}

function isAnswer(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasExactKeys(
      value,
      ["questionId", "target", "state"],
      ["optionId", "detail", "originId"],
    ) &&
    isId(value.questionId) &&
    isSafeText(value.target, 100) &&
    ["unanswered", "answered", "ignored", "inactive"].includes(
      String(value.state),
    ) &&
    (value.optionId === undefined || isId(value.optionId)) &&
    (value.detail === undefined || isSafeText(value.detail, 8_192)) &&
    (value.originId === undefined || isId(value.originId))
  );
}

function isRefinement(value: unknown, id: string): boolean {
  return (
    isRecord(value) &&
    hasExactKeys(
      value,
      ["id", "state", "revision", "history", "future"],
      ["draft", "applied", "appliedInputHash"],
    ) &&
    value.id === id &&
    ["not-used", "draft", "applied", "needs-review"].includes(
      String(value.state),
    ) &&
    Number.isSafeInteger(value.revision) &&
    Number(value.revision) >= 0 &&
    Array.isArray(value.history) &&
    value.history.length <= 50 &&
    Array.isArray(value.future) &&
    value.future.length <= 50 &&
    (value.appliedInputHash === undefined || isHash(value.appliedInputHash))
  );
}

function isRefinements(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasExactKeys(value, promptRefinementIds) &&
    promptRefinementIds.every((id) => isRefinement(value[id], id))
  );
}

function isSemanticPatch(value: unknown): boolean {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      "id",
      "operationId",
      "provider",
      "model",
      "baseHash",
      "createdAt",
      "operations",
      "status",
    ]) ||
    !isId(value.id) ||
    !isId(value.operationId) ||
    !["openai", "anthropic", "gemini"].includes(String(value.provider)) ||
    !isSafeText(value.model, 128) ||
    !isHash(value.baseHash) ||
    !isTimestamp(value.createdAt) ||
    !["candidate", "applied", "rejected", "stale"].includes(
      String(value.status),
    ) ||
    !Array.isArray(value.operations) ||
    value.operations.length > 25
  ) {
    return false;
  }
  return value.operations.every(
    (operation) =>
      isRecord(operation) &&
      (operation.operation === "remove-section"
        ? hasExactKeys(operation, ["operation", "sectionId"])
        : hasExactKeys(operation, ["operation", "sectionId", "text"])) &&
      ["replace-section", "append-section", "remove-section"].includes(
        String(operation.operation),
      ) &&
      promptSectionIds.includes(operation.sectionId as never) &&
      (operation.operation === "remove-section" ||
        isSafeText(operation.text, PROMPT_TEXT_LIMIT_CHARS * 2)),
  );
}

function isRepositoryContext(value: unknown): boolean {
  return (
    isRecord(value) &&
    hasExactKeys(
      value,
      [
        "workspaceId",
        "repositoryRevision",
        "assessmentVersion",
        "policyVersion",
        "policyExpiresAt",
        "policyKeyId",
        "syncState",
        "technologies",
        "boundaries",
        "commands",
        "protectedPaths",
        "generatedPaths",
        "requiredChecks",
        "restrictions",
        "provenance",
      ],
      ["purpose"],
    ) &&
    isId(value.workspaceId) &&
    isSafeText(value.repositoryRevision, 200) &&
    Number.isSafeInteger(value.assessmentVersion) &&
    Number(value.assessmentVersion) > 0 &&
    Number.isSafeInteger(value.policyVersion) &&
    Number(value.policyVersion) > 0 &&
    isTimestamp(value.policyExpiresAt) &&
    isSafeText(value.policyKeyId, 200) &&
    ["verified", "stale", "offline-verified"].includes(
      String(value.syncState),
    ) &&
    (value.purpose === undefined || isSafeText(value.purpose, 500)) &&
    [
      "technologies",
      "boundaries",
      "commands",
      "protectedPaths",
      "generatedPaths",
      "requiredChecks",
      "restrictions",
      "provenance",
    ].every((key) => isStringArray(value[key], 100))
  );
}

export function parsePromptDocumentV2(
  value: unknown,
): PromptDocumentV2 | undefined {
  let serialized: string;
  try {
    serialized = JSON.stringify(value);
  } catch {
    return undefined;
  }
  if (
    new TextEncoder().encode(serialized).byteLength >
      PROMPT_DOCUMENT_V2_MAX_WIRE_BYTES ||
    !isRecord(value) ||
    !hasExactKeys(
      value,
      [
        "schemaVersion",
        "id",
        "revision",
        "canonicalHash",
        "createdAt",
        "updatedAt",
        "promptType",
        "requiresTypeReview",
        "baseline",
        "fields",
        "contexts",
        "guidancePackIds",
        "guidance",
        "answers",
        "refinements",
        "semanticPatches",
        "assumptions",
        "definitionSnapshot",
        "lockedSections",
      ],
      [
        "originalTypeLabel",
        "templateId",
        "repositoryContext",
        "manualOverride",
      ],
    ) ||
    value.schemaVersion !== PROMPT_DOCUMENT_V2_SCHEMA ||
    !isId(value.id) ||
    !Number.isSafeInteger(value.revision) ||
    Number(value.revision) < 0 ||
    !isHash(value.canonicalHash) ||
    !isTimestamp(value.createdAt) ||
    !isTimestamp(value.updatedAt) ||
    !promptTypes.includes(value.promptType as never) ||
    typeof value.requiresTypeReview !== "boolean" ||
    !isSafeText(value.baseline, PROMPT_TEXT_LIMIT_CHARS) ||
    !isDraftFields(value.fields) ||
    !Array.isArray(value.contexts) ||
    value.contexts.length > PROMPT_CONTEXT_MAX_ITEMS ||
    !value.contexts.every(isContext) ||
    new Set(
      value.contexts.map((context) =>
        isRecord(context) ? String(context.id) : "",
      ),
    ).size !== value.contexts.length ||
    value.contexts.reduce(
      (total, context) =>
        total + (isRecord(context) ? Number(context.byteCount) : 0),
      0,
    ) > PROMPT_CONTEXT_TOTAL_LIMIT_BYTES ||
    !isStringArray(value.guidancePackIds, promptGuidancePackIds.length, 50) ||
    value.guidancePackIds.some(
      (id) => !promptGuidancePackIds.includes(id as never),
    ) ||
    !isGuidance(value.guidance) ||
    !Array.isArray(value.answers) ||
    value.answers.length > 25 ||
    !value.answers.every(isAnswer) ||
    new Set(
      value.answers.map((answer) =>
        isRecord(answer) ? String(answer.questionId) : "",
      ),
    ).size !== value.answers.length ||
    !isRefinements(value.refinements) ||
    !Array.isArray(value.semanticPatches) ||
    value.semanticPatches.length > 25 ||
    !value.semanticPatches.every(isSemanticPatch) ||
    !Array.isArray(value.assumptions) ||
    value.assumptions.length > 25 ||
    !value.assumptions.every(isAssumption) ||
    !isDefinitionSnapshot(value.definitionSnapshot) ||
    !isStringArray(value.lockedSections, promptSectionIds.length, 50) ||
    value.lockedSections.some(
      (id) => !promptSectionIds.includes(id as never),
    ) ||
    new Set(value.lockedSections).size !== value.lockedSections.length ||
    (value.originalTypeLabel !== undefined &&
      !isSafeText(value.originalTypeLabel, 200)) ||
    (value.templateId !== undefined && !isId(value.templateId)) ||
    (value.repositoryContext !== undefined &&
      !isRepositoryContext(value.repositoryContext)) ||
    (value.manualOverride !== undefined &&
      !isManualOverride(value.manualOverride))
  ) {
    return undefined;
  }
  const document = value as unknown as PromptDocumentV2;
  const { canonicalHash: _canonicalHash, ...source } = document;
  return hashPromptDocumentV2(source as PromptDocumentMutableSourceV2) ===
    document.canonicalHash
    ? document
    : undefined;
}
