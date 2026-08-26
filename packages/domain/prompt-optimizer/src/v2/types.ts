import type {
  PromptCandidateChoice,
  PromptContextSource,
  PromptDraftFields,
  PromptGuidancePackId,
  PromptProvider,
  PromptType,
} from "../types.js";

export const PROMPT_DOCUMENT_V2_SCHEMA = "prompt-document.v2" as const;
export const PROMPT_DEFINITION_SNAPSHOT_V2_SCHEMA =
  "prompt-definition-snapshot.v2" as const;

export const promptSectionIds = [
  "task",
  "desired-outcome",
  "scope",
  "relevant-context",
  "constraints",
  "rules-and-skills",
  "acceptance-criteria",
  "output-contract",
  "verification",
] as const;

export type PromptSectionId = (typeof promptSectionIds)[number];

export const promptRefinementIds = [
  "questions",
  "context",
  "rules",
  "skills",
  "output",
  "tokens",
  "assertions",
  "hooks",
] as const;

export type PromptRefinementId = (typeof promptRefinementIds)[number];
export type PromptRefinementState =
  "not-used" | "draft" | "applied" | "needs-review";

export type PromptOriginKind =
  | "user-baseline"
  | "structured-user-field"
  | "question-answer"
  | "managed-template"
  | "required-guidance"
  | "user-selected-guidance"
  | "governed-repository-context"
  | "local-default"
  | "semantic-patch"
  | "manual-override";

export interface PromptOriginV2 {
  readonly id: string;
  readonly kind: PromptOriginKind;
  readonly label: string;
  readonly sourceId?: string;
  readonly definitionVersion?: string;
}

export interface PromptDefinitionReferenceV2 {
  readonly id: string;
  readonly version: string;
  readonly canonicalHash: string;
}

export interface PromptDefinitionSnapshotV2 {
  readonly schemaVersion: typeof PROMPT_DEFINITION_SNAPSHOT_V2_SCHEMA;
  readonly promptType: PromptDefinitionReferenceV2;
  readonly template?: PromptDefinitionReferenceV2;
  readonly compilerRecipe: PromptDefinitionReferenceV2;
  readonly questionBank: PromptDefinitionReferenceV2;
  readonly guidancePolicy: PromptDefinitionReferenceV2;
  readonly capturedAt: string;
}

export type PromptContextClassification =
  "text" | "code" | "configuration" | "governed-metadata";

export interface PromptContextReferenceV2 {
  readonly id: string;
  readonly source: PromptContextSource | "governed_project_metadata";
  readonly safeLabel: string;
  readonly classification: PromptContextClassification;
  readonly byteCount: number;
  readonly included: boolean;
  readonly outbound: boolean;
  readonly content: string;
  readonly languageId?: string;
  readonly relativePath?: string;
  readonly capturedRevision: number;
}

export interface PromptAnswerV2 {
  readonly questionId: string;
  readonly target: string;
  readonly state: "unanswered" | "answered" | "ignored" | "inactive";
  readonly optionId?: string;
  readonly detail?: string;
  readonly originId?: string;
}

export type PromptGuidanceTier =
  "required" | "recommended" | "optional" | "excluded";

export interface PromptGuidanceItemV2 {
  readonly id: string;
  readonly tier: PromptGuidanceTier;
  readonly text: string;
  readonly source:
    | "platform"
    | "organization"
    | "project"
    | "repository"
    | "developer"
    | "task";
  readonly provenance: string;
  readonly byteCount: number;
  readonly locked: boolean;
}

export interface PromptGuidanceConflictV2 {
  readonly higherId: string;
  readonly lowerId: string;
  readonly resolution: "higher-restriction-wins" | "lower-item-excluded";
  readonly message: string;
}

export interface PromptGuidanceTraceEntryV2 {
  readonly guidanceId: string;
  readonly decision: "included" | "excluded" | "omitted-budget";
  readonly reason: string;
}

export interface PromptGuidanceResolutionV2 {
  readonly required: readonly PromptGuidanceItemV2[];
  readonly recommended: readonly PromptGuidanceItemV2[];
  readonly optional: readonly PromptGuidanceItemV2[];
  readonly excluded: readonly PromptGuidanceItemV2[];
  readonly conflicts: readonly PromptGuidanceConflictV2[];
  readonly byteBudget: number;
  readonly usedBytes: number;
  readonly trace: readonly PromptGuidanceTraceEntryV2[];
  readonly canonicalHash: string;
}

export type PromptPatchOperationV2 =
  | {
      readonly operation: "replace-section";
      readonly sectionId: PromptSectionId;
      readonly text: string;
    }
  | {
      readonly operation: "append-section";
      readonly sectionId: PromptSectionId;
      readonly text: string;
    }
  | {
      readonly operation: "remove-section";
      readonly sectionId: PromptSectionId;
    };

export interface PromptSemanticPatchV2 {
  readonly id: string;
  readonly operationId: string;
  readonly provider: PromptProvider;
  readonly model: string;
  readonly baseHash: string;
  readonly createdAt: string;
  readonly operations: readonly PromptPatchOperationV2[];
  readonly status: "candidate" | "applied" | "rejected" | "stale";
}

export interface PromptAssumptionV2 {
  readonly id: string;
  readonly text: string;
  readonly status: "unresolved" | "accepted" | "rejected";
  readonly originId: string;
}

export interface PromptManualOverrideV2 {
  readonly text: string;
  readonly baseCompiledHash: string;
  readonly status: "edited-after-compile" | "retained-stale";
  readonly updatedAt: string;
}

export interface PromptRefinementV2<T> {
  readonly id: PromptRefinementId;
  readonly state: PromptRefinementState;
  readonly draft?: T;
  readonly applied?: T;
  readonly appliedInputHash?: string;
  readonly revision: number;
  readonly history: readonly T[];
  readonly future: readonly T[];
}

export interface PromptQuestionRefinementV2 {
  readonly answerIds: readonly string[];
}

export interface PromptContextRefinementV2 {
  readonly includedContextIds: readonly string[];
}

export interface PromptGuidanceRefinementV2 {
  readonly guidanceIds: readonly string[];
}

export interface PromptOutputRefinementV2 {
  readonly presetId?: "patch-report" | "concise-answer" | "json-shape";
  readonly custom: string;
}

export interface PromptTokenRefinementV2 {
  readonly removedContextIds: readonly string[];
  readonly omittedGuidanceIds: readonly string[];
  readonly targetBytes: number;
}

export interface PromptAssertionRefinementV2 {
  readonly assertions: readonly string[];
}

export interface PromptHookCompatibilityV2 {
  readonly legacyMetadata: Readonly<Record<string, string>>;
  readonly runtimeStatus: "not-implemented";
}

export interface PromptRefinementsV2 {
  readonly questions: PromptRefinementV2<PromptQuestionRefinementV2>;
  readonly context: PromptRefinementV2<PromptContextRefinementV2>;
  readonly rules: PromptRefinementV2<PromptGuidanceRefinementV2>;
  readonly skills: PromptRefinementV2<PromptGuidanceRefinementV2>;
  readonly output: PromptRefinementV2<PromptOutputRefinementV2>;
  readonly tokens: PromptRefinementV2<PromptTokenRefinementV2>;
  readonly assertions: PromptRefinementV2<PromptAssertionRefinementV2>;
  readonly hooks: PromptRefinementV2<PromptHookCompatibilityV2>;
}

export interface PromptRepositoryContextV2 {
  readonly workspaceId: string;
  readonly repositoryRevision: string;
  readonly assessmentVersion: number;
  readonly policyVersion: number;
  readonly policyExpiresAt: string;
  readonly policyKeyId: string;
  readonly syncState: "verified" | "stale" | "offline-verified";
  readonly purpose?: string;
  readonly technologies: readonly string[];
  readonly boundaries: readonly string[];
  readonly commands: readonly string[];
  readonly protectedPaths: readonly string[];
  readonly generatedPaths: readonly string[];
  readonly requiredChecks: readonly string[];
  readonly restrictions: readonly string[];
  readonly provenance: readonly string[];
}

export interface PromptDocumentV2 {
  readonly schemaVersion: typeof PROMPT_DOCUMENT_V2_SCHEMA;
  readonly id: string;
  readonly revision: number;
  readonly canonicalHash: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly promptType: PromptType;
  readonly originalTypeLabel?: string;
  readonly requiresTypeReview: boolean;
  readonly templateId?: string;
  readonly baseline: string;
  readonly fields: PromptDraftFields;
  readonly contexts: readonly PromptContextReferenceV2[];
  readonly guidancePackIds: readonly PromptGuidancePackId[];
  readonly guidance: PromptGuidanceResolutionV2;
  readonly answers: readonly PromptAnswerV2[];
  readonly refinements: PromptRefinementsV2;
  readonly semanticPatches: readonly PromptSemanticPatchV2[];
  readonly assumptions: readonly PromptAssumptionV2[];
  readonly definitionSnapshot: PromptDefinitionSnapshotV2;
  readonly repositoryContext?: PromptRepositoryContextV2;
  readonly lockedSections: readonly PromptSectionId[];
  readonly manualOverride?: PromptManualOverrideV2;
}

export interface PromptOriginSpanV2 {
  readonly lineStart: number;
  readonly lineEnd: number;
  readonly sectionId: PromptSectionId;
  readonly origin: PromptOriginV2;
}

export interface CompiledPromptSectionV2 {
  readonly id: PromptSectionId;
  readonly title: string;
  readonly text: string;
  readonly origins: readonly PromptOriginV2[];
  readonly omitted: boolean;
}

export interface CompiledPromptDocumentV2 {
  readonly schemaVersion: "compiled-prompt.v2";
  readonly documentId: string;
  readonly documentRevision: number;
  readonly documentHash: string;
  readonly compiledHash: string;
  readonly text: string;
  readonly sections: readonly CompiledPromptSectionV2[];
  readonly originMap: readonly PromptOriginSpanV2[];
  readonly omittedSectionIds: readonly PromptSectionId[];
  readonly byteCount: number;
  readonly warnings: readonly string[];
  readonly manualOverrideStatus?: PromptManualOverrideV2["status"];
}

export interface PromptCandidateV2 {
  readonly id: string;
  readonly choice: PromptCandidateChoice;
  readonly sourceDocumentHash: string;
  readonly sourceRevision: number;
  readonly text: string;
  readonly compiledHash: string;
  readonly provider?: PromptProvider;
  readonly model?: string;
  readonly createdAt: string;
  readonly stale: boolean;
}
