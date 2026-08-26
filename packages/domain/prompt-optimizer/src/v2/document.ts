import {
  EMPTY_PROMPT_DRAFT_FIELDS,
  PROMPT_GUIDANCE_PACKS,
} from "../catalog.js";
import type {
  PromptDraft,
  PromptGuidancePackId,
  PromptType,
} from "../types.js";
import { canonicalHash, type CanonicalValue } from "./canonical.js";
import { createPromptRefinementV2 } from "./refinements.js";
import {
  PROMPT_DEFINITION_SNAPSHOT_V2_SCHEMA,
  PROMPT_DOCUMENT_V2_SCHEMA,
  type PromptDefinitionReferenceV2,
  type PromptDefinitionSnapshotV2,
  type PromptDocumentV2,
  type PromptGuidanceItemV2,
  type PromptGuidanceResolutionV2,
  type PromptRefinementsV2,
} from "./types.js";

function definitionReference(
  id: string,
  version: string,
): PromptDefinitionReferenceV2 {
  return {
    id,
    version,
    canonicalHash: canonicalHash({ id, version }),
  };
}

export function createPromptDefinitionSnapshotV2(
  promptType: PromptType,
  templateId: string | undefined,
  capturedAt: string,
): PromptDefinitionSnapshotV2 {
  return {
    schemaVersion: PROMPT_DEFINITION_SNAPSHOT_V2_SCHEMA,
    promptType: definitionReference(
      `platform.prompt-type.${promptType.toLowerCase().replaceAll(" ", "-")}`,
      "2.0.0",
    ),
    ...(templateId
      ? {
          template: definitionReference(
            `platform.template.${templateId}`,
            "2.0.0",
          ),
        }
      : {}),
    compilerRecipe: definitionReference(
      "platform.compiler.default-nine-section",
      "2.0.0",
    ),
    questionBank: definitionReference("platform.questions.local-six", "2.0.0"),
    guidancePolicy: definitionReference(
      "platform.guidance.fixed-precedence",
      "2.0.0",
    ),
    capturedAt,
  };
}

function guidanceItem(id: PromptGuidancePackId): PromptGuidanceItemV2 {
  const pack = PROMPT_GUIDANCE_PACKS.find((candidate) => candidate.id === id);
  const text = pack?.instruction ?? pack?.description ?? id;
  return {
    id,
    tier: "optional",
    text,
    source: "task",
    provenance: "Selected by the developer",
    byteCount: new TextEncoder().encode(text).byteLength,
    locked: false,
  };
}

export function createPromptGuidanceResolutionV2(
  guidancePackIds: readonly PromptGuidancePackId[],
  byteBudget = 32 * 1024,
): PromptGuidanceResolutionV2 {
  const optional = guidancePackIds.map(guidanceItem);
  const usedBytes = optional.reduce((total, item) => total + item.byteCount, 0);
  const value = {
    required: [],
    recommended: [],
    optional,
    excluded: [],
    conflicts: [],
    byteBudget,
    usedBytes,
    trace: optional.map((item) => ({
      guidanceId: item.id,
      decision: "included" as const,
      reason: "Developer selected this deterministic guidance pack.",
    })),
  };
  return {
    ...value,
    canonicalHash: canonicalHash(value as unknown as CanonicalValue),
  };
}

export function createEmptyPromptRefinementsV2(): PromptRefinementsV2 {
  return {
    questions: createPromptRefinementV2("questions"),
    context: createPromptRefinementV2("context"),
    rules: createPromptRefinementV2("rules"),
    skills: createPromptRefinementV2("skills"),
    output: createPromptRefinementV2("output"),
    tokens: createPromptRefinementV2("tokens"),
    assertions: createPromptRefinementV2("assertions"),
    hooks: createPromptRefinementV2("hooks"),
  };
}

export type PromptDocumentMutableSourceV2 = Omit<
  PromptDocumentV2,
  "canonicalHash"
>;

export function hashPromptDocumentV2(
  document: PromptDocumentMutableSourceV2,
): string {
  return canonicalHash(document as unknown as CanonicalValue);
}

export function hashPromptSemanticBaseV2(
  document: PromptDocumentV2 | PromptDocumentMutableSourceV2,
): string {
  const source =
    "canonicalHash" in document
      ? (({ canonicalHash: _canonicalHash, ...rest }) => rest)(document)
      : document;
  const { manualOverride: _manualOverride, ...semanticSource } = source;
  return canonicalHash({
    ...semanticSource,
    semanticPatches: [],
  } as unknown as CanonicalValue);
}

export function finalizePromptDocumentV2(
  document: PromptDocumentMutableSourceV2,
): PromptDocumentV2 {
  return {
    ...document,
    canonicalHash: hashPromptDocumentV2(document),
  };
}

export interface CreatePromptDocumentV2Input {
  readonly id: string;
  readonly now: string;
  readonly promptType?: PromptType;
  readonly templateId?: string;
}

export function createPromptDocumentV2(
  input: CreatePromptDocumentV2Input,
): PromptDocumentV2 {
  const promptType = input.promptType ?? "General";
  return finalizePromptDocumentV2({
    schemaVersion: PROMPT_DOCUMENT_V2_SCHEMA,
    id: input.id,
    revision: 0,
    createdAt: input.now,
    updatedAt: input.now,
    promptType,
    requiresTypeReview: false,
    ...(input.templateId ? { templateId: input.templateId } : {}),
    baseline: "",
    fields: { ...EMPTY_PROMPT_DRAFT_FIELDS },
    contexts: [],
    guidancePackIds: [],
    guidance: createPromptGuidanceResolutionV2([]),
    answers: [],
    refinements: createEmptyPromptRefinementsV2(),
    semanticPatches: [],
    assumptions: [],
    definitionSnapshot: createPromptDefinitionSnapshotV2(
      promptType,
      input.templateId,
      input.now,
    ),
    lockedSections: [],
  });
}

export function promptDocumentFromDraftV1(
  draft: PromptDraft,
  input: Pick<CreatePromptDocumentV2Input, "id" | "now">,
): PromptDocumentV2 {
  const contexts = draft.contexts.map((context) => ({
    id: context.id,
    source: context.source,
    safeLabel: context.label,
    classification: context.languageId ? ("code" as const) : ("text" as const),
    byteCount: new TextEncoder().encode(context.content).byteLength,
    included: true,
    outbound: true,
    content: context.content,
    ...(context.languageId ? { languageId: context.languageId } : {}),
    ...(context.relativePath ? { relativePath: context.relativePath } : {}),
    capturedRevision: 0,
  }));
  return finalizePromptDocumentV2({
    schemaVersion: PROMPT_DOCUMENT_V2_SCHEMA,
    id: input.id,
    revision: 0,
    createdAt: input.now,
    updatedAt: input.now,
    promptType: draft.promptType,
    requiresTypeReview: false,
    ...(draft.templateId ? { templateId: draft.templateId } : {}),
    baseline: draft.prompt,
    fields: { ...draft.fields },
    contexts,
    guidancePackIds: [...draft.guidancePackIds],
    guidance: createPromptGuidanceResolutionV2(draft.guidancePackIds),
    answers: [],
    refinements: createEmptyPromptRefinementsV2(),
    semanticPatches: [],
    assumptions: [],
    definitionSnapshot: createPromptDefinitionSnapshotV2(
      draft.promptType,
      draft.templateId,
      input.now,
    ),
    lockedSections: [],
  });
}

export function mutatePromptDocumentV2(
  document: PromptDocumentV2,
  updatedAt: string,
  mutate: (
    current: PromptDocumentMutableSourceV2,
  ) => PromptDocumentMutableSourceV2,
): PromptDocumentV2 {
  const { canonicalHash: _canonicalHash, ...current } = document;
  const next = mutate({
    ...current,
    revision: document.revision + 1,
    updatedAt,
  });
  if (next.id !== document.id || next.createdAt !== document.createdAt) {
    throw new Error(
      "Prompt document identity and creation time are immutable.",
    );
  }
  if (next.revision !== document.revision + 1) {
    throw new Error(
      "A prompt document mutation must increment revision exactly once.",
    );
  }
  return finalizePromptDocumentV2(next);
}
