import {
  compileStandalonePromptDraft,
  createStandaloneEmptyPromptDraft,
  createStandalonePromptDraftFromTemplate,
} from "@platform/domain-prompt-optimizer/runtime";
import type {
  PromptTemplate,
  PromptType,
} from "@platform/domain-prompt-optimizer/types";

export * from "./project-snapshot.js";

export const DWI_PROTOCOL_VERSION = "dwi.v1" as const;

export type Confidence = "high" | "medium" | "low";
export interface DwiFact { id: string; label: string; value: string; confidence: Confidence; evidence: string }
export interface DwiBrief {
  version: "dwi.brief.v1"; projectName: string; archetype: string; stack: string[];
  packageManager: string; scripts: string[]; modules: string[]; facts: DwiFact[]; unknowns: string[];
  confirmed: boolean; corrections: string;
}
export interface DwiModule { id: string; title: string; description: string; why: string; estimatedTokens: number; defaultSelected: boolean }
export interface DwiEstimate { baselineTokens: number; optimizedTokens: number; estimatedAvoidedDuplication: number; method: string }
export interface DwiCandidate { text: string; estimate: DwiEstimate; selectedModuleIds: string[] }
export type DwiOutputSize = "low" | "medium" | "high";
export interface DwiCandidateOptions {
  task?: string;
  promptType?: PromptType;
  template?: PromptTemplate;
  outputSize?: DwiOutputSize;
}

export const DWI_MODULES: readonly DwiModule[] = [
  { id: "orientation", title: "Project orientation", description: "Ground the task in confirmed stack, scripts, and boundaries.", why: "Reduces repeated project briefing and false assumptions.", estimatedTokens: 170, defaultSelected: true },
  { id: "feature-delivery", title: "Feature delivery", description: "Define outcome, scope, acceptance criteria, and reviewable output.", why: "Matches the default feature intent.", estimatedTokens: 220, defaultSelected: true },
  { id: "reuse-first", title: "Reuse before create", description: "Inspect existing patterns and dependencies before introducing new code.", why: "Keeps the change native to this repository.", estimatedTokens: 115, defaultSelected: true },
  { id: "architecture-boundaries", title: "Architecture boundaries", description: "Preserve dependency direction and privileged-runtime boundaries.", why: "Protects the project structure shown by local evidence.", estimatedTokens: 135, defaultSelected: true },
  { id: "verification", title: "Verification plan", description: "Run focused tests first, then affected checks and report residual risk.", why: "Makes completion evidence explicit.", estimatedTokens: 145, defaultSelected: true },
  { id: "rollout", title: "Migration & rollout", description: "Plan compatibility, rollout, and rollback when behavior changes.", why: "Useful for externally visible or stateful changes.", estimatedTokens: 120, defaultSelected: false },
];

function tokens(text: string): number { return Math.ceil(new TextEncoder().encode(text).byteLength / 4); }
function outputFormatFor(size: DwiOutputSize): string {
  if (size === "medium") return "Return a structured implementation summary, key decisions, changed files, verification results, remaining risks, and concise follow-ups.";
  if (size === "high") return "Return a detailed implementation report with decisions and tradeoffs, changed files and rationale, verification evidence, remaining risks, and actionable follow-ups.";
  return "Return only a concise outcome, changed files, verification, and remaining risks. Keep supporting prose compact.";
}
export function briefDigest(brief: DwiBrief): string {
  return [`Project: ${brief.projectName}`, `Archetype: ${brief.archetype}`, `Stack: ${brief.stack.join(", ") || "unknown"}`, `Package manager: ${brief.packageManager || "unknown"}`, `Scripts: ${brief.scripts.join(", ") || "unknown"}`, `Modules: ${brief.modules.join(", ") || "unknown"}`, `Corrections: ${brief.corrections || "none"}`, `Unknowns: ${brief.unknowns.join("; ") || "none"}`].join("\n");
}

export function compileDwiCandidate(
  brief: DwiBrief,
  selectedIds: readonly string[],
  input: string | DwiCandidateOptions = {},
): DwiCandidate {
  const selected = DWI_MODULES.filter((item) => selectedIds.includes(item.id));
  if (!brief.confirmed) throw new Error("Confirm the project brief before compiling.");
  if (selected.length === 0) throw new Error("Select at least one module.");
  const options: DwiCandidateOptions = typeof input === "string" ? { task: input } : input;
  const task = options.task?.trim() || "Implement the requested feature in this project.";
  const outputSize = options.outputSize ?? "low";
  const draft = options.template
    ? createStandalonePromptDraftFromTemplate(options.template)
    : createStandaloneEmptyPromptDraft(options.promptType ?? "General");
  const templateInstruction = options.template?.prompt.trim();
  draft.prompt = templateInstruction && templateInstruction !== task
    ? `${templateInstruction}\n\nUser request:\n${task}`
    : task;
  draft.fields = options.template ? {
    ...draft.fields,
    inScope: [draft.fields.inScope, `Use these selected work modules: ${selected.map((item) => item.title).join(", ")}.`].filter(Boolean).join("\n"),
    outOfScope: [draft.fields.outOfScope, "Autonomous execution, hidden scanning, provider calls, and unrelated refactors."].filter(Boolean).join("\n"),
    hardConstraints: [draft.fields.hardConstraints, "Inspect before changing code. Preserve existing behavior and security boundaries. Do not expose secrets or private paths."].filter(Boolean).join("\n"),
    outputFormat: [draft.fields.outputFormat, outputFormatFor(outputSize)].filter(Boolean).join("\n"),
    verification: [draft.fields.verification, "Run the narrow owning tests first, then typecheck/lint and the affected dependency graph."].filter(Boolean).join("\n"),
  } : {
    title: "Evidence-backed feature delivery",
    desiredOutcome: "Deliver a reviewable feature that fits the confirmed project profile.",
    inScope: `Use these selected work modules: ${selected.map((item) => item.title).join(", ")}.`,
    outOfScope: "Autonomous execution, hidden scanning, provider calls, and unrelated refactors.",
    hardConstraints: "Inspect before changing code. Preserve existing behavior and security boundaries. Do not expose secrets or private paths.",
    acceptanceCriteria: "The requested behavior is implemented, focused tests pass, affected checks are reported, and remaining risks are explicit.",
    outputFormat: outputFormatFor(outputSize),
    verification: "Run the narrow owning tests first, then typecheck/lint and the affected dependency graph.",
  };
  draft.contexts = [{ id: "dwi-project-brief", source: "selection", label: "Confirmed DWI project brief", content: briefDigest(brief) }];
  const text = compileStandalonePromptDraft(draft).compiledPrompt;
  const baselineTokens = tokens(`${briefDigest(brief)}\n${task}`) * 3 + selected.reduce((sum, item) => sum + item.estimatedTokens, 0);
  const optimizedTokens = tokens(text);
  return { text, selectedModuleIds: selected.map(({ id }) => id), estimate: { baselineTokens, optimizedTokens, estimatedAvoidedDuplication: Math.max(0, baselineTokens - optimizedTokens), method: "Deterministic UTF-8 bytes ÷ 4 estimate; not provider billing." } };
}

export interface DwiFeedback { id: string; createdAt: string; rating: "helpful" | "mixed" | "not-helpful"; tags: string[]; note?: string; selectedModuleIds: string[]; estimate: DwiEstimate; elapsedMs: number }
export function createFeedback(input: Omit<DwiFeedback, "id" | "createdAt">, now = new Date().toISOString()): DwiFeedback {
  if (input.note && input.note.length > 500) throw new Error("Feedback note is limited to 500 characters.");
  return { ...input, tags: input.tags.slice(0, 8), selectedModuleIds: input.selectedModuleIds.filter((id) => DWI_MODULES.some((module) => module.id === id)), id: `feedback-${now}`, createdAt: now };
}
export function evaluationMarkdown(feedback: DwiFeedback, brief: DwiBrief): string {
  return `# Developer Work Intelligence evaluation draft\n\n> Human review required. Token figures are deterministic planning estimates, not provider billing.\n\n## Project profile\n\n- Archetype: ${brief.archetype}\n- Stack: ${brief.stack.join(", ") || "Unknown"}\n- Brief confirmed: ${brief.confirmed ? "Yes" : "No"}\n\n## Observed session\n\n- Rating: ${feedback.rating}\n- Modules: ${feedback.selectedModuleIds.join(", ")}\n- Estimated avoided duplication: ${feedback.estimate.estimatedAvoidedDuplication} tokens\n- Elapsed time: ${feedback.elapsedMs} ms\n\n## Human decision\n\n- Decision: [select]\n- Status: [select]\n- Evidence: [add reviewed evidence]\n\n## Notes\n\n${feedback.note || "No note supplied."}\n`;
}

export interface DwiPlaybook { version: "dwi.playbook.v1"; name: string; moduleIds: string[]; tags: string[]; requires: { stackAnyOf: string[] } }
export interface DwiFutureIntegration { status: "disabled"; owner: "gateway" | "pms"; explanation: string }
export const DWI_FUTURE_INTEGRATIONS: readonly DwiFutureIntegration[] = [
  { status: "disabled", owner: "gateway", explanation: "Future provider traffic routes only through the governed Gateway." },
  { status: "disabled", owner: "pms", explanation: "Future work and governance changes remain owned by PMS and require a human decision." },
];
