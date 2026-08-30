import { compilePromptDocumentV2 } from "./compiler.js";
import { canonicalHash, type CanonicalValue } from "./canonical.js";
import {
  finalizePromptDocumentV2,
  promptDocumentFromDraftV1,
  type PromptDocumentMutableSourceV2,
} from "./document.js";
import {
  applyPromptRefinementV2,
  draftPromptRefinementV2,
  refinementInputHash,
} from "./refinements.js";
import type {
  PromptCandidateV2,
  PromptDocumentV2,
  PromptRefinementId,
} from "./types.js";
import { parsePromptDraft } from "../validation.js";
import {
  promptTypes,
  type PromptCandidateChoice,
  type PromptDraft,
  type PromptProvider,
} from "../types.js";

export const PROMPT_SAVED_RECORD_V2_SCHEMA = "prompt-saved-record.v2" as const;
export const PROMPT_RECENT_RECORD_V2_SCHEMA =
  "prompt-recent-record.v2" as const;
export const PROMPT_EXPORT_V2_SCHEMA = "prompt-export.v2" as const;

export interface PromptCandidateProvenanceV2 {
  readonly provider?: PromptProvider;
  readonly model?: string;
  readonly finishReason?: string;
  readonly latencyMs?: number;
}

export interface PromptSavedRecordV2 {
  readonly schemaVersion: typeof PROMPT_SAVED_RECORD_V2_SCHEMA;
  readonly id: string;
  readonly revision: number;
  readonly document: PromptDocumentV2;
  readonly localCandidate: PromptCandidateV2;
  readonly optimizedCandidate?: PromptCandidateV2;
  readonly chosenCandidate: PromptCandidateChoice;
  readonly provenance?: PromptCandidateProvenanceV2;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly migratedFrom?: string;
}

export interface PromptRecentContextSummaryV2 {
  readonly source: string;
  readonly safeLabel: string;
  readonly byteCount: number;
}

export interface PromptRecentRecordV2 {
  readonly schemaVersion: typeof PROMPT_RECENT_RECORD_V2_SCHEMA;
  readonly id: string;
  readonly document: Omit<PromptDocumentV2, "contexts"> & {
    readonly contexts: readonly [];
  };
  readonly contextState: "none" | "needs-recapture";
  readonly contextSummaries: readonly PromptRecentContextSummaryV2[];
  readonly localCandidate: PromptCandidateV2;
  readonly optimizedCandidate?: PromptCandidateV2;
  readonly chosenCandidate?: PromptCandidateChoice;
  readonly updatedAt: string;
}

export interface PromptExportV2 {
  readonly schemaVersion: typeof PROMPT_EXPORT_V2_SCHEMA;
  readonly exportedAt: string;
  readonly record: PromptSavedRecordV2;
}

export interface PromptOptimisticWriteV2 {
  readonly recordId: string;
  readonly expectedRevision: number | "new";
  readonly record: PromptSavedRecordV2;
}

export interface LegacyPromptRecordV1 {
  readonly schemaVersion?: string;
  readonly id?: string;
  readonly draft: unknown;
  readonly finalPrompt?: unknown;
  readonly optimizedPrompt?: unknown;
  readonly chosenCandidate?: unknown;
  readonly provider?: unknown;
  readonly model?: unknown;
  readonly enhancements?: unknown;
  readonly createdAt?: unknown;
  readonly updatedAt?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeTimestamp(value: unknown, fallback: string): string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value))
    ? value
    : fallback;
}

function migrateDraft(value: unknown): {
  readonly draft: PromptDraft;
  readonly originalTypeLabel?: string;
} {
  if (!isRecord(value))
    throw new Error("Legacy prompt draft must be an object.");
  const original = value.promptType;
  const knownType =
    typeof original === "string" &&
    promptTypes.includes(original as (typeof promptTypes)[number]);
  const normalized = knownType ? value : { ...value, promptType: "General" };
  const draft = parsePromptDraft(normalized);
  if (!draft) throw new Error("Legacy prompt draft is invalid.");
  return {
    draft,
    ...(!knownType && typeof original === "string"
      ? { originalTypeLabel: original }
      : {}),
  };
}

function migrateEnhancements(
  document: PromptDocumentV2,
  value: unknown,
): PromptDocumentV2 {
  if (!isRecord(value)) return document;
  const knownIds: readonly PromptRefinementId[] = [
    "questions",
    "context",
    "rules",
    "skills",
    "output",
    "tokens",
    "assertions",
    "hooks",
  ];
  const refinements = { ...document.refinements };
  for (const id of knownIds) {
    if (!(id in value)) continue;
    if (id === "hooks") {
      const legacyMetadata = isRecord(value[id])
        ? Object.fromEntries(
            Object.entries(value[id]).map(([key, item]) => [
              key,
              typeof item === "string" ? item : JSON.stringify(item),
            ]),
          )
        : { value: JSON.stringify(value[id]) };
      const input = {
        legacyMetadata,
        runtimeStatus: "not-implemented" as const,
      };
      refinements.hooks = applyPromptRefinementV2(
        draftPromptRefinementV2(refinements.hooks, input),
        refinementInputHash(input),
      );
      continue;
    }
    const serialized = JSON.stringify(value[id]);
    if (id === "questions") {
      const compatibilityValue = { answerIds: [serialized] };
      refinements.questions = applyPromptRefinementV2(
        draftPromptRefinementV2(refinements.questions, compatibilityValue),
        refinementInputHash(compatibilityValue),
      );
    } else if (id === "context") {
      const compatibilityValue = { includedContextIds: [serialized] };
      refinements.context = applyPromptRefinementV2(
        draftPromptRefinementV2(refinements.context, compatibilityValue),
        refinementInputHash(compatibilityValue),
      );
    } else if (id === "rules" || id === "skills") {
      const compatibilityValue = { guidanceIds: [serialized] };
      refinements[id] = applyPromptRefinementV2(
        draftPromptRefinementV2(refinements[id], compatibilityValue),
        refinementInputHash(compatibilityValue),
      );
    } else if (id === "output") {
      const compatibilityValue = { custom: serialized };
      refinements.output = applyPromptRefinementV2(
        draftPromptRefinementV2(refinements.output, compatibilityValue),
        refinementInputHash(compatibilityValue),
      );
    } else if (id === "tokens") {
      const compatibilityValue = {
        removedContextIds: [] as string[],
        omittedGuidanceIds: [] as string[],
        targetBytes: 0,
      };
      refinements.tokens = applyPromptRefinementV2(
        draftPromptRefinementV2(refinements.tokens, compatibilityValue),
        refinementInputHash(compatibilityValue),
      );
    } else {
      const compatibilityValue = { assertions: [serialized] };
      refinements.assertions = applyPromptRefinementV2(
        draftPromptRefinementV2(refinements.assertions, compatibilityValue),
        refinementInputHash(compatibilityValue),
      );
    }
  }
  const { canonicalHash: _canonicalHash, ...source } = document;
  return finalizePromptDocumentV2({
    ...source,
    refinements,
  } as PromptDocumentMutableSourceV2);
}

function candidate(
  id: string,
  choice: PromptCandidateChoice,
  document: PromptDocumentV2,
  text: string,
  createdAt: string,
  provider?: PromptProvider,
  model?: string,
): PromptCandidateV2 {
  return {
    id,
    choice,
    sourceDocumentHash: document.canonicalHash,
    sourceRevision: document.revision,
    text,
    compiledHash:
      choice === "local"
        ? compilePromptDocumentV2(document).compiledHash
        : canonicalHash({
            sourceDocumentHash: document.canonicalHash,
            sourceRevision: document.revision,
            text,
          } as unknown as CanonicalValue),
    ...(provider ? { provider } : {}),
    ...(model ? { model } : {}),
    createdAt,
    stale: false,
  };
}

export function migrateLegacyPromptRecordV2(
  value: LegacyPromptRecordV1,
  input: {
    readonly id: string;
    readonly now: string;
  },
): PromptSavedRecordV2 {
  const migrated = migrateDraft(value.draft);
  let document = promptDocumentFromDraftV1(migrated.draft, input);
  if (migrated.originalTypeLabel) {
    const { canonicalHash: _canonicalHash, ...source } = document;
    document = finalizePromptDocumentV2({
      ...source,
      originalTypeLabel: migrated.originalTypeLabel,
      requiresTypeReview: true,
    });
  }
  document = migrateEnhancements(document, value.enhancements);
  const compiled = compilePromptDocumentV2(document);
  const exactLegacyFinal =
    typeof value.finalPrompt === "string" ? value.finalPrompt : undefined;
  if (exactLegacyFinal !== undefined && exactLegacyFinal !== compiled.text) {
    const { canonicalHash: _canonicalHash, ...source } = document;
    document = finalizePromptDocumentV2({
      ...source,
      manualOverride: {
        text: exactLegacyFinal,
        baseCompiledHash: compiled.compiledHash,
        status: "retained-stale",
        updatedAt: input.now,
      },
    });
  }
  const localText = exactLegacyFinal ?? compilePromptDocumentV2(document).text;
  const provider =
    typeof value.provider === "string" &&
    ["openai", "anthropic", "gemini"].includes(value.provider)
      ? (value.provider as PromptProvider)
      : undefined;
  const model = typeof value.model === "string" ? value.model : undefined;
  const optimizedText =
    typeof value.optimizedPrompt === "string"
      ? value.optimizedPrompt
      : undefined;
  const localCandidate = candidate(
    `${input.id}:local`,
    "local",
    document,
    localText,
    input.now,
  );
  const optimizedCandidate = optimizedText
    ? candidate(
        `${input.id}:optimized`,
        "optimized",
        document,
        optimizedText,
        input.now,
        provider,
        model,
      )
    : undefined;
  const chosenCandidate =
    value.chosenCandidate === "optimized" && optimizedCandidate
      ? "optimized"
      : "local";
  return {
    schemaVersion: PROMPT_SAVED_RECORD_V2_SCHEMA,
    id: value.id ?? input.id,
    revision: 1,
    document,
    localCandidate,
    ...(optimizedCandidate ? { optimizedCandidate } : {}),
    chosenCandidate,
    ...(provider || model
      ? {
          provenance: {
            ...(provider ? { provider } : {}),
            ...(model ? { model } : {}),
          },
        }
      : {}),
    createdAt: safeTimestamp(value.createdAt, input.now),
    updatedAt: safeTimestamp(value.updatedAt, input.now),
    migratedFrom: value.schemaVersion ?? "legacy-unversioned",
  };
}

export function createPromptRecentRecordV2(
  record: PromptSavedRecordV2,
): PromptRecentRecordV2 {
  const contextSummaries = record.document.contexts.map((context) => ({
    source: context.source,
    safeLabel: context.safeLabel,
    byteCount: context.byteCount,
  }));
  const { canonicalHash: _canonicalHash, ...source } = record.document;
  const document = finalizePromptDocumentV2({
    ...source,
    contexts: [] as const,
  }) as PromptRecentRecordV2["document"];
  const localCompiled = compilePromptDocumentV2(document);
  const localCandidate = candidate(
    record.localCandidate.id,
    "local",
    document,
    localCompiled.text,
    record.localCandidate.createdAt,
  );
  return {
    schemaVersion: PROMPT_RECENT_RECORD_V2_SCHEMA,
    id: record.id,
    document,
    contextState: contextSummaries.length ? "needs-recapture" : "none",
    contextSummaries,
    localCandidate,
    chosenCandidate: "local",
    updatedAt: record.updatedAt,
  };
}
