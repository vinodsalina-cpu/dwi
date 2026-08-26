import {
  PROMPT_CONTEXT_TOTAL_LIMIT_BYTES,
  PROMPT_OPTIMIZED_LIMIT_BYTES,
  type PromptDraftFields,
  type PromptType,
} from "../types.js";
import { canonicalHash, type CanonicalValue } from "./canonical.js";
import type {
  PromptContextReferenceV2,
  PromptDocumentV2,
  PromptGuidanceConflictV2,
  PromptGuidanceItemV2,
  PromptGuidanceResolutionV2,
  PromptGuidanceTier,
  PromptGuidanceTraceEntryV2,
} from "./types.js";

export type PromptIntegrityState =
  "empty" | "unusable" | "ambiguous" | "usable";
export type PromptIntegrityReasonCode =
  | "NO_ACTIONABLE_INTENT"
  | "REPETITIVE_NOISE"
  | "PLACEHOLDER_ONLY"
  | "CONTEXT_REQUIRED"
  | "UNSUPPORTED_BINARY_OR_SECRET"
  | "LANGUAGE_UNCERTAIN";

export interface PromptIntegrityResult {
  readonly state: PromptIntegrityState;
  readonly reasonCodes: readonly PromptIntegrityReasonCode[];
  readonly meaningfulTokens: number;
  readonly languageConfidence: "known" | "uncertain";
  readonly hasActionSignal: boolean;
  readonly hasArtifactSignal: boolean;
  readonly recoverable: boolean;
}

const PLACEHOLDER_PATTERN =
  /^(?:todo|tbd|placeholder|lorem ipsum|fix this|do it|help|test|n\/a|\?+)$/iu;
const ACTION_PATTERN =
  /\b(?:add|build|change|create|debug|design|document|explain|fix|implement|investigate|migrate|optimize|refactor|remove|review|secure|test|update|verify|write)\b/iu;
const ARTIFACT_PATTERN =
  /(?:[\w.-]+\/[\w./-]+|\b(?:api|app|class|component|config|database|endpoint|file|function|method|module|package|repository|schema|service|test)\b)/iu;
const SECRET_PATTERN =
  /(?:-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret)\s*[:=]\s*[^\s]{8,}|\b(?:sk|ghp|github_pat)_[A-Za-z0-9_-]{16,})/iu;

function tokens(text: string): string[] {
  return text
    .normalize("NFKC")
    .trim()
    .split(/\s+/u)
    .map((token) => token.replace(/[^\p{L}\p{N}_-]/gu, ""))
    .filter((token) => token.length > 1);
}

function isRepetitiveNoise(
  text: string,
  meaningful: readonly string[],
): boolean {
  if (!text.trim()) return false;
  const normalized = text.replace(/\s+/gu, "").toLowerCase();
  const unique = new Set(meaningful.map((token) => token.toLowerCase()));
  const punctuation = [...normalized].filter((character) =>
    /[^\p{L}\p{N}]/u.test(character),
  ).length;
  const mostFrequent = meaningful.reduce((highest, token) => {
    const count = meaningful.filter(
      (candidate) => candidate.toLowerCase() === token.toLowerCase(),
    ).length;
    return Math.max(highest, count);
  }, 0);
  return (
    /^(.)\1{5,}$/u.test(normalized) ||
    (normalized.length >= 8 && punctuation / normalized.length > 0.7) ||
    (meaningful.length >= 4 && unique.size <= 1) ||
    (meaningful.length >= 6 && mostFrequent / meaningful.length >= 0.75)
  );
}

function containsUnsupportedBinary(text: string): boolean {
  if (text.includes("\0")) return true;
  const controls = [...text].filter((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code < 32 && code !== 9 && code !== 10 && code !== 13;
  });
  return text.length > 0 && controls.length / text.length > 0.02;
}

export function evaluatePromptIntegrityV2(
  baseline: string,
  contexts: readonly Pick<
    PromptContextReferenceV2,
    "included" | "content"
  >[] = [],
): PromptIntegrityResult {
  const trimmed = baseline.trim();
  if (!trimmed) {
    return {
      state: "empty",
      reasonCodes: [],
      meaningfulTokens: 0,
      languageConfidence: "known",
      hasActionSignal: false,
      hasArtifactSignal: false,
      recoverable: true,
    };
  }

  const meaningful = tokens(trimmed);
  const hasActionSignal = ACTION_PATTERN.test(trimmed);
  const hasArtifactSignal = ARTIFACT_PATTERN.test(trimmed);
  const hasExplicitContext = contexts.some(
    (context) => context.included && context.content.trim().length > 0,
  );
  const reasonCodes: PromptIntegrityReasonCode[] = [];

  if (containsUnsupportedBinary(trimmed) || SECRET_PATTERN.test(trimmed)) {
    reasonCodes.push("UNSUPPORTED_BINARY_OR_SECRET");
  }
  if (PLACEHOLDER_PATTERN.test(trimmed)) reasonCodes.push("PLACEHOLDER_ONLY");
  if (isRepetitiveNoise(trimmed, meaningful))
    reasonCodes.push("REPETITIVE_NOISE");
  if (
    meaningful.length < 2 &&
    !hasActionSignal &&
    !hasArtifactSignal &&
    !hasExplicitContext
  ) {
    reasonCodes.push("NO_ACTIONABLE_INTENT");
  }
  if (
    meaningful.length <= 3 &&
    !hasArtifactSignal &&
    !hasExplicitContext &&
    hasActionSignal
  ) {
    reasonCodes.push("CONTEXT_REQUIRED");
  }

  const letterCount = [...trimmed].filter((value) =>
    /\p{L}/u.test(value),
  ).length;
  const languageConfidence =
    letterCount === 0 ||
    (trimmed.length >= 12 && letterCount / trimmed.length < 0.2)
      ? "uncertain"
      : "known";
  if (languageConfidence === "uncertain")
    reasonCodes.push("LANGUAGE_UNCERTAIN");

  const hardUnusable = reasonCodes.some((code) =>
    [
      "UNSUPPORTED_BINARY_OR_SECRET",
      "PLACEHOLDER_ONLY",
      "REPETITIVE_NOISE",
      "NO_ACTIONABLE_INTENT",
    ].includes(code),
  );
  const ambiguous =
    !hardUnusable &&
    (reasonCodes.includes("CONTEXT_REQUIRED") ||
      meaningful.length < 5 ||
      (!hasActionSignal && !hasArtifactSignal));
  return {
    state: hardUnusable ? "unusable" : ambiguous ? "ambiguous" : "usable",
    reasonCodes,
    meaningfulTokens: meaningful.length,
    languageConfidence,
    hasActionSignal,
    hasArtifactSignal,
    recoverable: !reasonCodes.includes("UNSUPPORTED_BINARY_OR_SECRET"),
  };
}

export type PromptTypeFitStatus = "match" | "possible-mismatch" | "mismatch";

export interface PromptTypeFitResult {
  readonly selectedType: PromptType;
  readonly detectedType?: PromptType;
  readonly confidence: number;
  readonly evidence: readonly string[];
  readonly status: PromptTypeFitStatus;
  readonly requiresExplicitDecision: boolean;
}

const TYPE_SIGNALS: Readonly<Record<PromptType, readonly RegExp[]>> = {
  General: [],
  Architecture: [/\b(?:architecture|adr|boundary|trade-?off|design)\b/iu],
  "Bug fix": [/\b(?:bug|broken|crash|failure|regression|reproduce|fix)\b/iu],
  Refactor: [/\b(?:refactor|restructure|cleanup|behavior-preserving)\b/iu],
  "Reuse check": [
    /\b(?:reuse|existing abstraction|duplicate|before create)\b/iu,
  ],
  "Test creation": [
    /\b(?:add tests?|test coverage|vitest|playwright|regression test)\b/iu,
  ],
  Documentation: [/\b(?:docs?|documentation|readme|guide)\b/iu],
  "Security review": [
    /\b(?:security|vulnerability|threat|secret|authorization|injection)\b/iu,
  ],
  "Code explanation": [/\b(?:explain|how does|walk through|understand)\b/iu],
  Migration: [
    /\b(?:migrate|migration|compatibility|rollback|schema change)\b/iu,
  ],
};

export function evaluatePromptTypeFitV2(
  selectedType: PromptType,
  baseline: string,
  fields?: Partial<PromptDraftFields>,
): PromptTypeFitResult {
  const body = `${baseline}\n${Object.values(fields ?? {}).join("\n")}`;
  const scored = Object.entries(TYPE_SIGNALS)
    .map(([type, patterns]) => ({
      type: type as PromptType,
      score: patterns.reduce(
        (total, pattern) => total + (pattern.test(body) ? 1 : 0),
        0,
      ),
    }))
    .filter(({ score }) => score > 0)
    .sort(
      (left, right) =>
        right.score - left.score || left.type.localeCompare(right.type),
    );
  const best = scored[0];
  if (!best || best.type === selectedType) {
    return {
      selectedType,
      ...(best ? { detectedType: best.type } : {}),
      confidence: best ? Math.min(0.98, 0.65 + best.score * 0.1) : 0,
      evidence: best
        ? [`Matched ${best.score} local ${best.type} signal(s).`]
        : [],
      status: "match",
      requiresExplicitDecision: false,
    };
  }
  const confidence = Math.min(0.98, 0.55 + best.score * 0.15);
  return {
    selectedType,
    detectedType: best.type,
    confidence,
    evidence: [`Matched ${best.score} local ${best.type} signal(s).`],
    status:
      confidence >= 0.85
        ? "mismatch"
        : confidence >= 0.65
          ? "possible-mismatch"
          : "match",
    requiresExplicitDecision: confidence >= 0.85,
  };
}

const GUIDANCE_SOURCE_ORDER = [
  "platform",
  "organization",
  "project",
  "repository",
  "developer",
  "task",
] as const;
const GUIDANCE_TIER_ORDER: Readonly<Record<PromptGuidanceTier, number>> = {
  required: 0,
  recommended: 1,
  optional: 2,
  excluded: 3,
};

export interface ResolvePromptGuidanceV2Input {
  readonly items: readonly PromptGuidanceItemV2[];
  readonly byteBudget: number;
}

export function resolvePromptGuidanceV2(
  input: ResolvePromptGuidanceV2Input,
): PromptGuidanceResolutionV2 {
  const conflicts: PromptGuidanceConflictV2[] = [];
  const trace: PromptGuidanceTraceEntryV2[] = [];
  const selected = new Map<string, PromptGuidanceItemV2>();
  const ordered = [...input.items].sort((left, right) => {
    const source =
      GUIDANCE_SOURCE_ORDER.indexOf(left.source) -
      GUIDANCE_SOURCE_ORDER.indexOf(right.source);
    return source || left.id.localeCompare(right.id);
  });
  for (const item of ordered) {
    const existing = selected.get(item.id);
    if (!existing) {
      selected.set(item.id, item);
      continue;
    }
    conflicts.push({
      higherId: existing.id,
      lowerId: item.id,
      resolution:
        existing.tier === "excluded"
          ? "lower-item-excluded"
          : "higher-restriction-wins",
      message: `${existing.source} guidance takes precedence over ${item.source} guidance for ${item.id}.`,
    });
  }

  let usedBytes = 0;
  const included: PromptGuidanceItemV2[] = [];
  const excluded: PromptGuidanceItemV2[] = [];
  for (const item of [...selected.values()].sort((left, right) => {
    return (
      GUIDANCE_TIER_ORDER[left.tier] - GUIDANCE_TIER_ORDER[right.tier] ||
      left.id.localeCompare(right.id)
    );
  })) {
    if (item.tier === "excluded") {
      excluded.push(item);
      trace.push({
        guidanceId: item.id,
        decision: "excluded",
        reason: "The resolved policy excludes this guidance item.",
      });
      continue;
    }
    if (usedBytes + item.byteCount > input.byteBudget) {
      if (item.tier === "required") {
        throw new Error(
          `Required guidance ${item.id} exceeds the byte budget.`,
        );
      }
      excluded.push(item);
      trace.push({
        guidanceId: item.id,
        decision: "omitted-budget",
        reason: "The item did not fit after higher-priority guidance.",
      });
      continue;
    }
    included.push(item);
    usedBytes += item.byteCount;
    trace.push({
      guidanceId: item.id,
      decision: "included",
      reason: `${item.tier} guidance fit the deterministic byte budget.`,
    });
  }

  const result = {
    required: included.filter((item) => item.tier === "required"),
    recommended: included.filter((item) => item.tier === "recommended"),
    optional: included.filter((item) => item.tier === "optional"),
    excluded,
    conflicts,
    byteBudget: input.byteBudget,
    usedBytes,
    trace,
  };
  return {
    ...result,
    canonicalHash: canonicalHash(result as unknown as CanonicalValue),
  };
}

export interface PromptRequestSizeEstimateV2 {
  readonly baselineBytes: number;
  readonly structuredFieldsBytes: number;
  readonly contextBytes: number;
  readonly guidanceBytes: number;
  readonly unresolvedGapBytes: number;
  readonly compatibilityMetadataBytes: number;
  readonly totalBytes: number;
  readonly outputLimitBytes: number;
  readonly contextLimitBytes: number;
  readonly overBudget: boolean;
  readonly remediation: readonly {
    category:
      "context" | "guidance" | "unresolved-gaps" | "compatibility-metadata";
    recoverableBytes: number;
    action: string;
  }[];
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

export function estimatePromptRequestSizeV2(
  document: PromptDocumentV2,
): PromptRequestSizeEstimateV2 {
  const baselineBytes = byteLength(document.baseline);
  const structuredFieldsBytes = Object.values(document.fields).reduce(
    (total, field) => total + byteLength(field),
    0,
  );
  const contextBytes = document.contexts
    .filter((context) => context.included)
    .reduce((total, context) => total + context.byteCount, 0);
  const guidanceBytes = document.guidance.usedBytes;
  const unresolvedGapBytes = document.answers
    .filter((answer) => answer.state === "unanswered")
    .reduce((total, answer) => total + byteLength(answer.target), 0);
  const hooks = document.refinements.hooks.applied;
  const compatibilityMetadataBytes = hooks
    ? byteLength(JSON.stringify(hooks.legacyMetadata))
    : 0;
  const totalBytes =
    baselineBytes +
    structuredFieldsBytes +
    contextBytes +
    guidanceBytes +
    unresolvedGapBytes +
    compatibilityMetadataBytes;
  const remediation = [
    {
      category: "context" as const,
      recoverableBytes: contextBytes,
      action: "Remove explicit context items that are not required.",
    },
    {
      category: "guidance" as const,
      recoverableBytes: document.guidance.optional.reduce(
        (total, item) => total + item.byteCount,
        0,
      ),
      action: "Omit optional guidance after required and recommended rules.",
    },
    {
      category: "unresolved-gaps" as const,
      recoverableBytes: unresolvedGapBytes,
      action: "Answer or explicitly skip unresolved clarification gaps.",
    },
    {
      category: "compatibility-metadata" as const,
      recoverableBytes: compatibilityMetadataBytes,
      action: "Remove inert legacy hook metadata from this copy.",
    },
  ].filter((item) => item.recoverableBytes > 0);
  return {
    baselineBytes,
    structuredFieldsBytes,
    contextBytes,
    guidanceBytes,
    unresolvedGapBytes,
    compatibilityMetadataBytes,
    totalBytes,
    outputLimitBytes: PROMPT_OPTIMIZED_LIMIT_BYTES,
    contextLimitBytes: PROMPT_CONTEXT_TOTAL_LIMIT_BYTES,
    overBudget:
      totalBytes > PROMPT_OPTIMIZED_LIMIT_BYTES ||
      contextBytes > PROMPT_CONTEXT_TOTAL_LIMIT_BYTES,
    remediation,
  };
}
