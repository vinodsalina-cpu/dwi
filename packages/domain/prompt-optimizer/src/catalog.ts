import type { PromptDraftFields, PromptGuidancePackId } from "./types.js";

export const EMPTY_PROMPT_DRAFT_FIELDS: Readonly<PromptDraftFields> =
  Object.freeze({
    title: "",
    desiredOutcome: "",
    inScope: "",
    outOfScope: "",
    verification: "",
    outputFormat: "",
    hardConstraints: "",
    acceptanceCriteria: "",
  });

export interface PromptGuidancePack {
  id: PromptGuidancePackId;
  label: string;
  description: string;
  instruction: string;
}

export const PROMPT_GUIDANCE_PACKS: readonly PromptGuidancePack[] =
  Object.freeze([
    {
      id: "outcome",
      label: "Outcome",
      description: "Keep the result observable and testable.",
      instruction:
        "State the observable outcome before implementation details.",
    },
    {
      id: "scope-boundaries",
      label: "Scope boundaries",
      description: "Make inclusions and exclusions explicit.",
      instruction:
        "Preserve explicit in-scope and out-of-scope boundaries; ask rather than widening scope.",
    },
    {
      id: "hard-constraints",
      label: "Hard constraints",
      description: "Protect non-negotiable limits.",
      instruction:
        "Promote every hard constraint to an unambiguous non-negotiable requirement.",
    },
    {
      id: "verification",
      label: "Verification",
      description: "Name checks and skipped checks.",
      instruction:
        "Require concrete verification and a report of any check that was not run.",
    },
    {
      id: "output-shape",
      label: "Output shape",
      description: "Define a predictable response format.",
      instruction:
        "Return the requested output structure without redundant restatement.",
    },
    {
      id: "acceptance-criteria",
      label: "Acceptance criteria",
      description: "Turn completion into a checklist.",
      instruction: "Express completion as observable acceptance criteria.",
    },
    {
      id: "reuse-first",
      label: "Reuse first",
      description: "Inspect supplied context for existing solutions.",
      instruction:
        "Prefer a suitable existing abstraction in supplied context before proposing new code.",
    },
    {
      id: "security-boundaries",
      label: "Security boundaries",
      description: "Make trust and secret boundaries explicit.",
      instruction:
        "Identify relevant trust boundaries and prohibit exposing credentials or sensitive data.",
    },
    {
      id: "migration-safety",
      label: "Migration safety",
      description: "Keep migrations staged and reversible.",
      instruction:
        "Require compatibility, staged rollout, rollback, and migration verification.",
    },
  ]);
