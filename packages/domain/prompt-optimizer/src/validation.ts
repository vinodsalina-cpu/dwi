import {
  PROMPT_CONTEXT_ITEM_LIMIT_BYTES,
  PROMPT_CONTEXT_MAX_ITEMS,
  PROMPT_CONTEXT_TOTAL_LIMIT_BYTES,
  PROMPT_OPTIMIZED_LIMIT_BYTES,
  PROMPT_TEXT_LIMIT_CHARS,
  promptContextSources,
  promptGuidancePackIds,
  promptProviders,
  promptTypes,
  type PromptContext,
  type PromptDraft,
  type PromptDraftFields,
  type PromptGuidancePackId,
  type PromptRecentUpsertInput,
  type PromptRecordSaveInput,
  type PromptTemplate,
  type PromptTemplateInput,
} from "./types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): boolean {
  const keys = Object.keys(value);
  return required.every((key) => keys.includes(key)) &&
    keys.every((key) => required.includes(key) || optional.includes(key));
}

export function isEntityId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 200 && /^[A-Za-z0-9._:-]+$/.test(value);
}

export function isSafePromptModelId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 128 &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value);
}

export function isSafeGeminiModelId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 128 &&
    /^[a-z0-9][a-z0-9._-]*$/.test(value);
}

export function isSafePromptRelativePath(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 2_048 || value.includes("\\")) return false;
  if (value.startsWith("/") || /^[A-Za-z]:\//.test(value)) return false;
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint < 32 || codePoint === 127) return false;
  }
  return value.split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" && value.length <= 100 &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) &&
    Number.isFinite(Date.parse(value));
}

function parseDraftFields(value: unknown): PromptDraftFields | undefined {
  if (!isRecord(value) || !hasExactKeys(value, [
    "title", "desiredOutcome", "inScope", "outOfScope", "verification",
    "outputFormat", "hardConstraints", "acceptanceCriteria",
  ])) return undefined;
  if (Object.values(value).some((item) => typeof item !== "string" || item.length > PROMPT_TEXT_LIMIT_CHARS)) return undefined;
  return value as unknown as PromptDraftFields;
}

function parseGuidancePackIds(value: unknown): PromptGuidancePackId[] | undefined {
  if (!Array.isArray(value) || value.length > promptGuidancePackIds.length ||
      value.some((item) => typeof item !== "string" || !(promptGuidancePackIds as readonly string[]).includes(item))) {
    return undefined;
  }
  const ids = value as PromptGuidancePackId[];
  return new Set(ids).size === ids.length ? [...ids] : undefined;
}

function parseContext(value: unknown): PromptContext | undefined {
  if (!isRecord(value) || !hasExactKeys(value, ["id", "source", "label", "content"], ["languageId", "relativePath"])) return undefined;
  if (!isEntityId(value.id) || !(promptContextSources as readonly unknown[]).includes(value.source)) return undefined;
  if (typeof value.label !== "string" || value.label.length === 0 || value.label.length > 500 || typeof value.content !== "string") return undefined;
  if (utf8Bytes(value.content) > PROMPT_CONTEXT_ITEM_LIMIT_BYTES) return undefined;
  if (value.languageId !== undefined && (typeof value.languageId !== "string" || value.languageId.length > 100)) return undefined;
  if (value.relativePath !== undefined && !isSafePromptRelativePath(value.relativePath)) return undefined;
  return value as unknown as PromptContext;
}

export function parsePromptDraft(value: unknown): PromptDraft | undefined {
  if (!isRecord(value) || !hasExactKeys(value, ["promptType", "prompt", "fields", "contexts", "guidancePackIds"], ["templateId"])) return undefined;
  if (!(promptTypes as readonly unknown[]).includes(value.promptType) ||
      typeof value.prompt !== "string" || value.prompt.length > PROMPT_TEXT_LIMIT_CHARS) return undefined;
  const fields = parseDraftFields(value.fields);
  if (!fields || !Array.isArray(value.contexts) || value.contexts.length > PROMPT_CONTEXT_MAX_ITEMS) return undefined;
  if (value.prompt.length + Object.values(fields).reduce((total, field) => total + field.length, 0) > PROMPT_TEXT_LIMIT_CHARS) return undefined;
  const contexts = value.contexts.map(parseContext);
  if (contexts.some((context) => context === undefined)) return undefined;
  const normalizedContexts = contexts as PromptContext[];
  if (new Set(normalizedContexts.map(({ id }) => id)).size !== normalizedContexts.length) return undefined;
  if (normalizedContexts.reduce((total, context) => total + utf8Bytes(context.content), 0) > PROMPT_CONTEXT_TOTAL_LIMIT_BYTES) return undefined;
  const guidancePackIds = parseGuidancePackIds(value.guidancePackIds);
  if (!guidancePackIds || (value.templateId !== undefined && !isEntityId(value.templateId))) return undefined;
  return {
    promptType: value.promptType as PromptDraft["promptType"],
    prompt: value.prompt,
    fields,
    contexts: normalizedContexts,
    guidancePackIds,
    ...(value.templateId !== undefined ? { templateId: value.templateId } : {}),
  };
}

export function parsePromptTemplateInput(value: unknown): PromptTemplateInput | undefined {
  if (!isRecord(value) || !hasExactKeys(value,
    ["name", "description", "promptType", "prompt", "fields", "recommendedGuidancePackIds"],
    ["templateId"])) return undefined;
  if (value.templateId !== undefined && !isEntityId(value.templateId)) return undefined;
  if (typeof value.name !== "string" || value.name.trim().length === 0 || value.name.length > 200 ||
      typeof value.description !== "string" || value.description.length > 2_000 ||
      !(promptTypes as readonly unknown[]).includes(value.promptType) ||
      typeof value.prompt !== "string" || value.prompt.length > PROMPT_TEXT_LIMIT_CHARS) return undefined;
  const fields = parseDraftFields(value.fields);
  if (fields && value.prompt.length + Object.values(fields).reduce((total, field) => total + field.length, 0) > PROMPT_TEXT_LIMIT_CHARS) return undefined;
  const recommendedGuidancePackIds = parseGuidancePackIds(value.recommendedGuidancePackIds);
  return fields && recommendedGuidancePackIds ? {
    ...(value.templateId !== undefined ? { templateId: value.templateId } : {}),
    name: value.name,
    description: value.description,
    promptType: value.promptType as PromptTemplateInput["promptType"],
    prompt: value.prompt,
    fields,
    recommendedGuidancePackIds,
  } : undefined;
}

export function parsePromptTemplate(value: unknown): PromptTemplate | undefined {
  if (!isRecord(value) || !hasExactKeys(value, [
    "id", "builtIn", "name", "description", "promptType", "prompt", "fields",
    "recommendedGuidancePackIds",
  ], ["createdAt", "updatedAt"])) return undefined;
  if (!isEntityId(value.id) || typeof value.builtIn !== "boolean" ||
      (value.createdAt !== undefined && !isIsoTimestamp(value.createdAt)) ||
      (value.updatedAt !== undefined && !isIsoTimestamp(value.updatedAt))) return undefined;
  const input = parsePromptTemplateInput({
    name: value.name,
    description: value.description,
    promptType: value.promptType,
    prompt: value.prompt,
    fields: value.fields,
    recommendedGuidancePackIds: value.recommendedGuidancePackIds,
  });
  return input ? {
    id: value.id,
    builtIn: value.builtIn,
    ...input,
    ...(value.createdAt !== undefined ? { createdAt: value.createdAt } : {}),
    ...(value.updatedAt !== undefined ? { updatedAt: value.updatedAt } : {}),
  } : undefined;
}

export function parsePromptRecordSaveInput(value: unknown): PromptRecordSaveInput | undefined {
  if (!isRecord(value) || !hasExactKeys(value, ["draft", "chosenCandidate"], ["recordId", "optimizedPrompt"])) return undefined;
  if (value.recordId !== undefined && !isEntityId(value.recordId)) return undefined;
  if (value.chosenCandidate !== "local" && value.chosenCandidate !== "optimized") return undefined;
  const draft = parsePromptDraft(value.draft);
  if (!draft) return undefined;
  if (value.optimizedPrompt !== undefined &&
      (typeof value.optimizedPrompt !== "string" || value.optimizedPrompt.trim().length === 0 ||
       utf8Bytes(value.optimizedPrompt) > PROMPT_OPTIMIZED_LIMIT_BYTES)) return undefined;
  if ((value.chosenCandidate === "optimized") !== (value.optimizedPrompt !== undefined)) return undefined;
  return {
    ...(value.recordId !== undefined ? { recordId: value.recordId } : {}),
    draft,
    chosenCandidate: value.chosenCandidate,
    ...(value.optimizedPrompt !== undefined ? { optimizedPrompt: value.optimizedPrompt } : {}),
  };
}

export function parsePromptRecentUpsertInput(value: unknown): PromptRecentUpsertInput | undefined {
  if (!isRecord(value) || !hasExactKeys(value, ["draft", "localCandidate"],
    ["recentId", "optimizedCandidate", "chosenCandidate", "savedRecordId", "provider", "model"])) return undefined;
  const draft = parsePromptDraft(value.draft);
  if (!draft || typeof value.localCandidate !== "string" || value.localCandidate.trim().length === 0 ||
      utf8Bytes(value.localCandidate) > PROMPT_OPTIMIZED_LIMIT_BYTES) return undefined;
  if (value.optimizedCandidate !== undefined &&
      (typeof value.optimizedCandidate !== "string" || value.optimizedCandidate.trim().length === 0 ||
       utf8Bytes(value.optimizedCandidate) > PROMPT_OPTIMIZED_LIMIT_BYTES)) return undefined;
  if (value.chosenCandidate !== undefined && value.chosenCandidate !== "local" && value.chosenCandidate !== "optimized") return undefined;
  if (value.chosenCandidate === "optimized" && value.optimizedCandidate === undefined) return undefined;
  if (value.savedRecordId !== undefined && !isEntityId(value.savedRecordId)) return undefined;
  if (value.recentId !== undefined && !isEntityId(value.recentId)) return undefined;
  if ((value.provider === undefined) !== (value.model === undefined) ||
      (value.provider !== undefined && !(promptProviders as readonly unknown[]).includes(value.provider)) ||
      (value.model !== undefined && !isSafePromptModelId(value.model))) return undefined;
  return {
    ...(value.recentId !== undefined ? { recentId: value.recentId } : {}),
    draft,
    localCandidate: value.localCandidate,
    ...(value.optimizedCandidate !== undefined ? { optimizedCandidate: value.optimizedCandidate } : {}),
    ...(value.chosenCandidate !== undefined ? { chosenCandidate: value.chosenCandidate } : {}),
    ...(value.savedRecordId !== undefined ? { savedRecordId: value.savedRecordId } : {}),
    ...(value.provider !== undefined
      ? { provider: value.provider as PromptRecentUpsertInput["provider"], model: value.model as string }
      : {}),
  };
}
