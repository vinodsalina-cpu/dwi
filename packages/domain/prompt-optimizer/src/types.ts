export const promptProviders = ["openai", "anthropic", "gemini"] as const;
export type PromptProvider = (typeof promptProviders)[number];

export const promptProviderModelSettingKeys = {
  openai: "openaiModel",
  anthropic: "anthropicModel",
  gemini: "geminiModel",
} as const;

export const promptTypes = [
  "General", "Architecture", "Bug fix", "Refactor", "Reuse check",
  "Test creation", "Documentation", "Security review", "Code explanation", "Migration",
] as const;
export type PromptType = (typeof promptTypes)[number];

export const promptContextSources = ["selection", "picked_file", "pasted"] as const;
export type PromptContextSource = (typeof promptContextSources)[number];

export const promptGuidancePackIds = [
  "outcome", "scope-boundaries", "hard-constraints", "verification",
  "output-shape", "acceptance-criteria", "reuse-first", "security-boundaries",
  "migration-safety",
] as const;
export type PromptGuidancePackId = (typeof promptGuidancePackIds)[number];

export const PROMPT_TEXT_LIMIT_CHARS = 32_768;
export const PROMPT_CONTEXT_MAX_ITEMS = 10;
export const PROMPT_CONTEXT_ITEM_LIMIT_BYTES = 64 * 1024;
export const PROMPT_CONTEXT_TOTAL_LIMIT_BYTES = 128 * 1024;
export const PROMPT_OPTIMIZED_LIMIT_BYTES = 64 * 1024;
export const PROMPT_RECENT_RECORD_LIMIT = 5;
export const PROMPT_FOLLOW_UP_MAX_TURNS = 6;
export const PROMPT_FOLLOW_UP_MESSAGE_LIMIT_CHARS = 8_192;
export const PROMPT_FOLLOW_UP_ASSISTANT_LIMIT_CHARS = 4_096;
export const PROMPT_FOLLOW_UP_EVIDENCE_LIMIT_CHARS = 2_048;

export interface PromptDraftFields {
  title: string;
  desiredOutcome: string;
  inScope: string;
  outOfScope: string;
  verification: string;
  outputFormat: string;
  hardConstraints: string;
  acceptanceCriteria: string;
}

export interface PromptContext {
  id: string;
  source: PromptContextSource;
  label: string;
  content: string;
  languageId?: string;
  relativePath?: string;
}

export interface PromptDraft {
  promptType: PromptType;
  prompt: string;
  fields: PromptDraftFields;
  contexts: PromptContext[];
  guidancePackIds: PromptGuidancePackId[];
  templateId?: string;
}

export type PromptReadinessDimensionId =
  | "outcome" | "scope" | "constraints" | "verification" | "output_shape" | "acceptance_criteria";
export interface PromptReadinessDimension {
  id: PromptReadinessDimensionId;
  ready: boolean;
  message: string;
}
export type PromptReadinessIssueCode =
  | "prompt_required" | "prompt_too_long" | "too_many_contexts"
  | "context_too_large" | "context_total_too_large";
export interface PromptReadinessIssue {
  code: PromptReadinessIssueCode;
  message: string;
  contextId?: string;
}
export interface PromptReadiness {
  ready: boolean;
  issues: PromptReadinessIssue[];
  dimensions: PromptReadinessDimension[];
  promptChars: number;
  contextCount: number;
  contextBytes: number;
}

export interface PromptTemplateInput {
  templateId?: string;
  name: string;
  description: string;
  promptType: PromptType;
  prompt: string;
  fields: PromptDraftFields;
  recommendedGuidancePackIds: PromptGuidancePackId[];
}
export interface PromptTemplate extends Omit<PromptTemplateInput, "templateId"> {
  id: string;
  builtIn: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface PromptProviderRequest {
  provider: PromptProvider;
  model: string;
  compiledPrompt: string;
}
export interface PromptUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}
export interface PromptOptimizeResult {
  optimizedPrompt: string;
  title: string;
  summary: string;
  improvements: string[];
  remainingQuestions: string[];
  warnings: string[];
  provider: PromptProvider;
  model: string;
  finishReason: string;
  latencyMs: number;
  usage?: PromptUsage;
}

export type PromptCandidateChoice = "local" | "optimized";
export interface PromptRecordSaveInput {
  recordId?: string;
  draft: PromptDraft;
  chosenCandidate: PromptCandidateChoice;
  optimizedPrompt?: string;
}
export type PromptRecordExportInput = Omit<PromptRecordSaveInput, "recordId">;

export interface PromptSavedSummary {
  id: string;
  title: string;
  promptType: PromptType;
  createdAt: string;
  updatedAt: string;
  optimized: boolean;
  provider?: PromptProvider;
  model?: string;
}
export interface PromptSavedRecord {
  schemaVersion: "1.2.0";
  summary: PromptSavedSummary;
  draft: PromptDraft;
  chosenCandidate: PromptCandidateChoice;
  optimizedPrompt?: string;
}

export interface PromptRecentDraft {
  promptType: PromptType;
  prompt: string;
  fields: PromptDraftFields;
  guidancePackIds: PromptGuidancePackId[];
  templateId?: string;
}
export interface PromptRecentContextSummary {
  source: PromptContextSource;
  label: string;
  itemCount: number;
  byteCount: number;
}
export type PromptRecentContextState = "none" | "needs_recapture";
export type PromptRecentCandidate = "local" | "optimized";
export interface PromptRecentSummary {
  id: string;
  title: string;
  promptType: PromptType;
  updatedAt: string;
  candidate: PromptRecentCandidate;
  contextState: PromptRecentContextState;
  preview: string;
  savedRecordId?: string;
  provider?: PromptProvider;
  model?: string;
}
export interface PromptRecentRecord {
  schemaVersion: "1.3.0";
  summary: PromptRecentSummary;
  draft: PromptRecentDraft;
  localCandidate: string;
  optimizedCandidate?: string;
  chosenCandidate?: PromptCandidateChoice;
  provider?: PromptProvider;
  model?: string;
  contextSummaries: PromptRecentContextSummary[];
}
export interface PromptRecentUpsertInput {
  recentId?: string;
  draft: PromptDraft;
  localCandidate: string;
  optimizedCandidate?: string;
  chosenCandidate?: PromptCandidateChoice;
  savedRecordId?: string;
  provider?: PromptProvider;
  model?: string;
}
export type PromptRecentRetentionStatus = "pending" | "accepted" | "declined" | "disabled";
export type PromptRecentsAvailability = "hydrating" | "ready" | "unavailable";

export type PromptFollowUpClarityValue = "missing" | "tentative" | "clear";
export interface PromptFollowUpClarity {
  resultOrFeedback: PromptFollowUpClarityValue;
  nextOutcome: PromptFollowUpClarityValue;
  scopeAndBoundaries: PromptFollowUpClarityValue;
  verification: PromptFollowUpClarityValue;
}
export type PromptFollowUpState =
  | "idle" | "collecting_feedback" | "clarifying_one_gap_at_a_time"
  | "proposal_ready" | "awaiting_explicit_approval" | "approved_handoff";
export interface PromptFollowUpResult {
  assistantMessage: string;
  clarity: PromptFollowUpClarity;
  evidence: {
    resultOrFeedback?: string;
    nextOutcome?: string;
    scopeAndBoundaries?: string;
    verification?: string;
  };
  unresolvedQuestion?: string;
  proposedDraft?: PromptDraft;
}
export interface PromptFollowUpSession {
  conversationId: string;
  recentId: string;
  sourceTitle: string;
  generation: number;
  state: PromptFollowUpState;
  turn: number;
  clarity: PromptFollowUpClarity;
  assistantMessage: string;
  latestUserMessage?: string;
  result?: PromptFollowUpResult;
}
export interface PromptFollowUpApproval {
  draft: PromptDraft;
  sourceRecentId: string;
  sourceTitle: string;
}

export type PromptActivityKind =
  | "optimized" | "context_captured" | "context_picked" | "record_saved"
  | "record_loaded" | "record_deleted" | "record_imported" | "record_exported"
  | "template_saved" | "template_deleted" | "followup_started" | "followup_completed";
export interface PromptActivity {
  id: string;
  kind: PromptActivityKind;
  status: "success" | "error" | "cancelled";
  timestamp: string;
  recordId?: string;
  templateId?: string;
  templateKind?: "built_in" | "user";
  provider?: PromptProvider;
  model?: string;
  contextCount?: number;
  contextBytes?: number;
  recentId?: string;
  turnCount?: number;
  followUpOutcome?: "proposal_ready" | "approved" | "cancelled" | "error";
  latencyMs?: number;
}

export interface PromptOptimizerSnapshot {
  provider: {
    id: PromptProvider;
    model: string;
    credentialStatus: "stored" | "missing";
  };
  readiness: PromptReadiness;
  templates: PromptTemplate[];
  savedRecords: PromptSavedSummary[];
  recentRecords: PromptRecentSummary[];
  recentsHydrated: boolean;
  recentsAvailability: PromptRecentsAvailability;
  recentRetention: PromptRecentRetentionStatus;
  activity: PromptActivity[];
  providerDisclosureAcceptedFor?: PromptProvider[];
  followUpDisclosureAcceptedFor?: PromptProvider[];
  providerDisclosureAccepted: boolean;
  followUpDisclosureAccepted: boolean;
  activeRequestId?: string;
}

export type PromptFailureKind =
  | "validation" | "missing_credential" | "authentication" | "rate_limit"
  | "timeout" | "network" | "safety_blocked" | "malformed_response"
  | "provider" | "host" | "cancelled";

export interface PromptSettingsSnapshot {
  values: {
    promptProvider: { effective: PromptProvider };
    openaiModel: { effective: string };
    anthropicModel: { effective: string };
    geminiModel: { effective: string };
  };
  connections: Array<{ provider: PromptProvider }>;
}
