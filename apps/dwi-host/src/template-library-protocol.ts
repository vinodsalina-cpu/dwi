import {
  EMPTY_PROMPT_DRAFT_FIELDS,
  PROMPT_TEXT_LIMIT_CHARS,
  isEntityId,
  parsePromptTemplateInput,
  type PromptTemplate,
  type PromptTemplateInput,
  type PromptType,
} from "@platform/domain-prompt-optimizer";

export const TEMPLATE_CLONE_LIMIT_BYTES = 256 * 1024;
export const TEMPLATE_FEEDBACK_NOTE_LIMIT_CHARS = 1_000;
export const TEMPLATE_CLONE_EXTENSIONS = [".md", ".txt", ".json", ".yaml", ".yml"] as const;

export type TemplateLibraryKind = "managed" | "personal";
export type TemplateLibraryFeedbackRating = "helpful" | "mixed" | "not-helpful";
export type TemplateLibraryFeedbackStars = 1 | 2 | 3 | 4 | 5;
export type TemplateLibraryCloneMode = "file" | "paste";

export interface TemplateLibrarySummary {
  id: string;
  kind: TemplateLibraryKind;
  immutable: boolean;
  name: string;
  description: string;
  promptType: PromptType;
  createdAt?: string;
  updatedAt?: string;
  lastOpenedAt?: string;
  reviewedAt?: string;
}

export interface TemplateLibraryState {
  revision: number;
  managed: TemplateLibrarySummary[];
  personal: TemplateLibrarySummary[];
  recent: TemplateLibrarySummary[];
  personalLimit: number;
  personalRemaining: number;
}

export interface TemplateLibraryDetail {
  revision: number;
  summary: TemplateLibrarySummary;
  template: PromptTemplate;
  versions: TemplateLibraryVersionSummary[];
}

export interface TemplateLibraryVersionSummary {
  revision: number;
  managed: boolean;
  savedAt?: string;
}

export type TemplateLibraryMessage =
  | { type: "dwi.library.open" }
  | { type: "dwi.library.item.get"; templateId: string }
  | {
      type: "dwi.library.template.save";
      operationId: string;
      expectedRevision: number;
      template: PromptTemplateInput;
    }
  | {
      type: "dwi.library.template.delete";
      operationId: string;
      expectedRevision: number;
      templateId: string;
    }
  | {
      type: "dwi.library.feedback.submit";
      operationId: string;
      expectedRevision: number;
      templateId: string;
      rating: TemplateLibraryFeedbackRating;
      stars: TemplateLibraryFeedbackStars;
      note?: string;
    }
  | { type: "dwi.library.clone.file.pick"; operationId: string }
  | { type: "dwi.library.clone.paste.validate"; operationId: string; text: string };

export type TemplateLibraryHostMessage =
  | { type: "dwi.library.state"; state: TemplateLibraryState }
  | { type: "dwi.library.detail"; detail: TemplateLibraryDetail }
  | {
      type: "dwi.library.saved";
      operationId: string;
      detail: TemplateLibraryDetail;
      state: TemplateLibraryState;
      published: boolean;
    }
  | {
      type: "dwi.library.deleted";
      operationId: string;
      templateId: string;
      state: TemplateLibraryState;
      published: boolean;
    }
  | {
      type: "dwi.library.feedback";
      operationId: string;
      templateId: string;
      rating: TemplateLibraryFeedbackRating;
      stars: TemplateLibraryFeedbackStars;
      reviewedAt: string;
      state: TemplateLibraryState;
      published: boolean;
    }
  | {
      type: "dwi.library.clone";
      operationId: string;
      mode: TemplateLibraryCloneMode;
      status: "ready";
      template: PromptTemplateInput;
      sourceLabel?: string;
    }
  | {
      type: "dwi.library.clone";
      operationId: string;
      mode: TemplateLibraryCloneMode;
      status: "invalid" | "cancelled";
      message?: string;
    }
  | {
      type: "dwi.library.error";
      code: "invalid-request" | "conflict" | "not-found" | "immutable" | "limit" | "storage";
      message: string;
      operationId?: string;
      currentRevision?: number;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, required: readonly string[], optional: readonly string[] = []): boolean {
  const keys = Object.keys(value);
  return required.every((key) => keys.includes(key)) &&
    keys.every((key) => required.includes(key) || optional.includes(key));
}

function isRevision(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isFeedbackRating(value: unknown): value is TemplateLibraryFeedbackRating {
  return value === "helpful" || value === "mixed" || value === "not-helpful";
}

export function isTemplateLibraryFeedbackStars(value: unknown): value is TemplateLibraryFeedbackStars {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 5;
}

export function templateLibraryRatingForStars(stars: TemplateLibraryFeedbackStars): TemplateLibraryFeedbackRating {
  return stars <= 2 ? "not-helpful" : stars === 3 ? "mixed" : "helpful";
}

export function containsBinaryLikeText(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if ((codePoint < 32 && character !== "\n" && character !== "\r" && character !== "\t") || codePoint === 127) return true;
  }
  return false;
}

/** Strictly parses the seven Library commands. Unknown and extra fields never
 * cross the webview/extension-host trust boundary. */
export function parseTemplateLibraryMessage(value: unknown): TemplateLibraryMessage | undefined {
  if (!isRecord(value) || typeof value.type !== "string") return undefined;
  if (value.type === "dwi.library.open") {
    return hasExactKeys(value, ["type"]) ? { type: value.type } : undefined;
  }
  if (value.type === "dwi.library.item.get") {
    return hasExactKeys(value, ["type", "templateId"]) && isEntityId(value.templateId)
      ? { type: value.type, templateId: value.templateId }
      : undefined;
  }
  if (value.type === "dwi.library.template.save") {
    if (!hasExactKeys(value, ["type", "operationId", "expectedRevision", "template"]) ||
        !isEntityId(value.operationId) || !isRevision(value.expectedRevision)) return undefined;
    const template = parsePromptTemplateInput(value.template);
    return template ? { type: value.type, operationId: value.operationId, expectedRevision: value.expectedRevision, template } : undefined;
  }
  if (value.type === "dwi.library.template.delete") {
    return hasExactKeys(value, ["type", "operationId", "expectedRevision", "templateId"]) &&
      isEntityId(value.operationId) && isRevision(value.expectedRevision) && isEntityId(value.templateId)
      ? { type: value.type, operationId: value.operationId, expectedRevision: value.expectedRevision, templateId: value.templateId }
      : undefined;
  }
  if (value.type === "dwi.library.feedback.submit") {
    if (!hasExactKeys(value, ["type", "operationId", "expectedRevision", "templateId", "rating", "stars"], ["note"]) ||
        !isEntityId(value.operationId) || !isRevision(value.expectedRevision) || !isEntityId(value.templateId) ||
        !isFeedbackRating(value.rating) || !isTemplateLibraryFeedbackStars(value.stars) ||
        templateLibraryRatingForStars(value.stars) !== value.rating ||
        (value.note !== undefined && (typeof value.note !== "string" || value.note.length > TEMPLATE_FEEDBACK_NOTE_LIMIT_CHARS || containsBinaryLikeText(value.note)))) {
      return undefined;
    }
    return {
      type: value.type,
      operationId: value.operationId,
      expectedRevision: value.expectedRevision,
      templateId: value.templateId,
      rating: value.rating,
      stars: value.stars,
      ...(value.note !== undefined ? { note: value.note } : {}),
    };
  }
  if (value.type === "dwi.library.clone.file.pick") {
    return hasExactKeys(value, ["type", "operationId"]) && isEntityId(value.operationId)
      ? { type: value.type, operationId: value.operationId }
      : undefined;
  }
  if (value.type === "dwi.library.clone.paste.validate") {
    return hasExactKeys(value, ["type", "operationId", "text"]) && isEntityId(value.operationId) &&
      typeof value.text === "string" && value.text.length <= TEMPLATE_CLONE_LIMIT_BYTES
      ? { type: value.type, operationId: value.operationId, text: value.text }
      : undefined;
  }
  return undefined;
}

export type TemplateCloneParseResult =
  | { status: "ready"; template: PromptTemplateInput }
  | { status: "invalid"; message: string };

function cloneTemplateInput(input: PromptTemplateInput): PromptTemplateInput {
  return {
    name: input.name,
    description: input.description,
    promptType: input.promptType,
    prompt: input.prompt,
    fields: { ...input.fields },
    recommendedGuidancePackIds: [...input.recommendedGuidancePackIds],
  };
}

function fencedJson(value: string): string | undefined {
  const match = value.match(/^```json\s*\r?\n([\s\S]*?)\r?\n```$/i);
  return match?.[1]?.trim();
}

function plainTemplateName(value: string): string {
  const heading = value.match(/^\s{0,3}#{1,6}\s+(.+)$/m)?.[1];
  const firstLine = value.split(/\r?\n/).find((line) => line.trim().length)?.trim();
  const candidate = (heading ?? firstLine ?? "Imported prompt")
    .replace(/^[>*_`\-\s]+|[>*_`\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return (candidate || "Imported prompt").slice(0, 200);
}

/** Parses untrusted clone text without interpreting it as instructions. JSON
 * must exactly match PromptTemplateInput; Markdown/plain text is copied into a
 * generic draft with empty structured fields. */
export function parseTemplateCloneText(raw: string): TemplateCloneParseResult {
  // Bound UTF-16 code units before allocating a UTF-8 buffer. UTF-8 can only
  // increase the byte count for non-ASCII input; the exact byte check follows.
  if (raw.length > TEMPLATE_CLONE_LIMIT_BYTES) return { status: "invalid", message: "The template exceeds the 256 KiB import limit." };
  const withoutBom = raw.replace(/^\uFEFF/, "");
  const bytes = new TextEncoder().encode(withoutBom).byteLength;
  if (bytes === 0 || withoutBom.trim().length === 0) return { status: "invalid", message: "Choose or paste a non-empty template." };
  if (bytes > TEMPLATE_CLONE_LIMIT_BYTES) return { status: "invalid", message: "The template exceeds the 256 KiB import limit." };
  if (containsBinaryLikeText(withoutBom)) return { status: "invalid", message: "The template contains binary or unsupported control data." };

  const trimmed = withoutBom.trim();
  const jsonText = fencedJson(trimmed) ?? (trimmed.startsWith("{") ? trimmed : undefined);
  if (jsonText !== undefined) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      return { status: "invalid", message: "The JSON template is not valid JSON." };
    }
    const template = parsePromptTemplateInput(parsed);
    return template
      ? { status: "ready", template: cloneTemplateInput(template) }
      : { status: "invalid", message: "The JSON does not match the PromptTemplateInput contract." };
  }

  if (trimmed.length > PROMPT_TEXT_LIMIT_CHARS) {
    return { status: "invalid", message: "The prompt exceeds the 32,768 character template limit." };
  }
  const template = parsePromptTemplateInput({
    name: plainTemplateName(trimmed),
    description: "Cloned from a local Markdown or plain-text response.",
    promptType: "General",
    prompt: trimmed,
    fields: { ...EMPTY_PROMPT_DRAFT_FIELDS },
    recommendedGuidancePackIds: [],
  });
  return template
    ? { status: "ready", template: cloneTemplateInput(template) }
    : { status: "invalid", message: "The pasted response could not be mapped to a safe template draft." };
}

export function decodeTemplateCloneBytes(bytes: Uint8Array): TemplateCloneParseResult {
  if (bytes.byteLength === 0) return { status: "invalid", message: "The selected file is empty." };
  if (bytes.byteLength > TEMPLATE_CLONE_LIMIT_BYTES) return { status: "invalid", message: "The selected file exceeds the 256 KiB import limit." };
  try {
    return parseTemplateCloneText(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return { status: "invalid", message: "The selected file is not valid UTF-8 text." };
  }
}
