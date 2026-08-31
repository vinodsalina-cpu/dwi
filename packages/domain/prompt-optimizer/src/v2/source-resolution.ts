import { PROMPT_CONTEXT_TOTAL_LIMIT_BYTES } from "../types.js";
import { canonicalHash, type CanonicalValue } from "./canonical.js";
import type { PromptSectionId } from "./types.js";

export type PromptSourceKindV2 =
  | "user-task"
  | "template"
  | "local-guidance"
  | "reviewed-project"
  | "editor-selection"
  | "pasted-context"
  | "picked-file";
export type PromptSourceAuthorityV2 = "user" | "reviewed-project" | "managed-local";
export type PromptSourceFreshnessV2 = "current" | "stale" | "not-applicable";
export type PromptSourceRelevanceV2 = "required" | "relevant" | "uncertain" | "irrelevant";
export type PromptSourceDispositionV2 = "include" | "summarize" | "exclude";

export interface PromptSourceDecisionV2 {
  readonly id: string;
  readonly kind: PromptSourceKindV2;
  readonly label: string;
  readonly authority: PromptSourceAuthorityV2;
  readonly freshness: PromptSourceFreshnessV2;
  readonly relevance: PromptSourceRelevanceV2;
  readonly disposition: PromptSourceDispositionV2;
  readonly reason: string;
  readonly provenance: readonly string[];
  readonly byteCount: number;
}

export interface PromptSourceConflictV2 {
  readonly id: string;
  readonly label: string;
  readonly sourceIds: readonly string[];
  readonly reason: string;
}

export interface PromptMaterialQuestionV2 {
  readonly id: string;
  readonly prompt: string;
  readonly targetSectionId: PromptSectionId;
  readonly reason: string;
}

export interface PromptSourceAssumptionV2 {
  readonly id: string;
  readonly text: string;
  readonly sourceId: string;
}

export interface PromptProjectContributionV2 {
  readonly sourceId: string;
  readonly label: string;
  readonly approved: boolean;
  readonly current: boolean;
  readonly provenance: readonly string[];
  readonly facts: readonly { readonly label: string; readonly value: string }[];
  readonly conflicts: readonly PromptSourceConflictV2[];
  readonly questions: readonly PromptMaterialQuestionV2[];
  readonly assumptions: readonly PromptSourceAssumptionV2[];
}

export interface PromptExplicitContextV2 {
  readonly id: string;
  readonly kind: "editor-selection" | "pasted-context" | "picked-file";
  readonly label: string;
  readonly content: string;
  readonly consented: boolean;
  readonly provenance: readonly string[];
  readonly encoding?: "utf-8" | "unknown";
}

export interface PromptSourcePlanV2 {
  readonly schemaVersion: "prompt-source-plan.v2";
  readonly materialHash: string;
  readonly blocked: boolean;
  readonly blockReasons: readonly string[];
  readonly decisions: readonly PromptSourceDecisionV2[];
  readonly conflicts: readonly PromptSourceConflictV2[];
  readonly questions: readonly PromptMaterialQuestionV2[];
  readonly assumptions: readonly PromptSourceAssumptionV2[];
}

export interface ResolvePromptSourcesV2Input {
  readonly task: string;
  readonly template?: { readonly id: string; readonly label: string };
  readonly guidance?: readonly { readonly id: string; readonly label: string; readonly required: boolean }[];
  readonly project?: PromptProjectContributionV2;
  readonly explicitContexts?: readonly PromptExplicitContextV2[];
}

const SECRET = /(?:-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:api[_-]?key|access[_-]?token|refresh[_-]?token|password|secret)\s*[:=]\s*[^\s]{8,}|\b(?:sk|ghp|github_pat)_[A-Za-z0-9_-]{16,})/iu;

function byteCount(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function unsafeText(value: string): boolean {
  if (value.includes("\0") || SECRET.test(value)) return true;
  const controls = [...value].filter((character) => {
    const code = character.codePointAt(0) ?? 0;
    return code < 32 && code !== 9 && code !== 10 && code !== 13;
  });
  return value.length > 0 && controls.length / value.length > 0.02;
}

function explicitDecision(context: PromptExplicitContextV2): PromptSourceDecisionV2 {
  const bytes = byteCount(context.content);
  const invalidEncoding = context.encoding === "unknown";
  const invalid = !context.consented || invalidEncoding || unsafeText(context.content) || bytes === 0;
  return {
    id: context.id,
    kind: context.kind,
    label: context.label,
    authority: "user",
    freshness: "current",
    relevance: invalid ? "uncertain" : "relevant",
    disposition: invalid ? "exclude" : bytes > 16_384 ? "summarize" : "include",
    reason: !context.consented
      ? "Excluded because explicit consent is missing."
      : invalidEncoding
        ? "Excluded because the text encoding is not verified as UTF-8."
        : unsafeText(context.content)
          ? "Excluded because binary controls or secret-like content were detected."
          : bytes === 0
            ? "Excluded because the source is empty."
            : bytes > 16_384
              ? "Summarized locally to keep the bounded context focused."
              : "Included from the explicit user-selected context.",
    provenance: [...context.provenance],
    byteCount: bytes,
  };
}

export function resolvePromptSourcesV2(input: ResolvePromptSourcesV2Input): PromptSourcePlanV2 {
  const decisions: PromptSourceDecisionV2[] = [{
    id: "user-task",
    kind: "user-task",
    label: "Task and explicit fields",
    authority: "user",
    freshness: "current",
    relevance: "required",
    disposition: input.task.trim() ? "include" : "exclude",
    reason: input.task.trim() ? "Included as the developer's current request." : "Excluded because the task is empty.",
    provenance: ["current prompt input"],
    byteCount: byteCount(input.task),
  }];
  if (input.template) decisions.push({
    id: `template:${input.template.id}`,
    kind: "template",
    label: input.template.label,
    authority: "managed-local",
    freshness: "current",
    relevance: "required",
    disposition: "include",
    reason: "Included because this is the selected local template.",
    provenance: [`template:${input.template.id}`],
    byteCount: 0,
  });
  for (const item of input.guidance ?? []) decisions.push({
    id: `guidance:${item.id}`,
    kind: "local-guidance",
    label: item.label,
    authority: "managed-local",
    freshness: "current",
    relevance: item.required ? "required" : "relevant",
    disposition: "include",
    reason: item.required ? "Included as required local guidance." : "Included as selected local guidance.",
    provenance: [`guidance:${item.id}`],
    byteCount: 0,
  });
  const project = input.project;
  if (project) decisions.push({
    id: project.sourceId,
    kind: "reviewed-project",
    label: project.label,
    authority: "reviewed-project",
    freshness: project.current ? "current" : "stale",
    relevance: "required",
    disposition: project.approved && project.current ? "summarize" : "exclude",
    reason: !project.approved
      ? "Excluded because the project snapshot is not bound to an approved review."
      : !project.current
        ? "Excluded because the approved project review is stale."
        : `Summarized locally from ${project.facts.length} approved project fact(s).`,
    provenance: [...project.provenance],
    byteCount: byteCount(project.facts.map(({ label, value }) => `${label}: ${value}`).join("\n")),
  });
  const explicit = (input.explicitContexts ?? []).map(explicitDecision);
  decisions.push(...explicit);
  let used = decisions.filter(({ disposition }) => disposition !== "exclude").reduce((sum, item) => sum + item.byteCount, 0);
  for (let index = decisions.length - 1; index >= 0 && used > PROMPT_CONTEXT_TOTAL_LIMIT_BYTES; index -= 1) {
    const item = decisions[index]!;
    if (item.relevance === "required" || item.disposition === "exclude" || item.byteCount === 0) continue;
    used -= item.byteCount;
    decisions[index] = { ...item, disposition: "exclude", reason: "Excluded because the total bounded context limit was reached." };
  }
  const blockReasons = [
    ...(!input.task.trim() ? ["Enter a task before resolving sources."] : []),
    ...(project && !project.approved ? ["Approve the current project snapshot before using project knowledge."] : []),
    ...(project && !project.current ? ["Refresh and review the project snapshot before continuing."] : []),
  ];
  const questions = [...(project?.questions ?? [])].slice(0, 3);
  const source = {
    schemaVersion: "prompt-source-plan.v2" as const,
    blocked: blockReasons.length > 0,
    blockReasons,
    decisions,
    conflicts: [...(project?.conflicts ?? [])],
    questions,
    assumptions: [...(project?.assumptions ?? [])],
  };
  return { ...source, materialHash: canonicalHash(source as unknown as CanonicalValue) };
}

export function sourcePlanAnswersRemainCurrentV2(
  answerMaterialHash: string,
  plan: Pick<PromptSourcePlanV2, "materialHash">,
): boolean {
  return answerMaterialHash === plan.materialHash;
}
