import { describe, expect, it } from "vitest";
import { resolvePromptSourcesV2, sourcePlanAnswersRemainCurrentV2 } from "./source-resolution.js";

describe("Phase 3 source resolution", () => {
  it("fails closed for stale reviewed project knowledge and preserves conflicts", () => {
    const plan = resolvePromptSourcesV2({
      task: "Add retry tests.",
      project: {
        sourceId: "project:one",
        label: "Reviewed project snapshot",
        approved: true,
        current: false,
        provenance: ["snapshot:sha256:abc"],
        facts: [{ label: "Toolchain", value: "TypeScript" }],
        conflicts: [{ id: "conflict:runtime", label: "Runtime", sourceIds: ["a", "b"], reason: "Accepted claims disagree." }],
        questions: [],
        assumptions: [],
      },
    });
    expect(plan.blocked).toBe(true);
    expect(plan.decisions.find(({ kind }) => kind === "reviewed-project")).toMatchObject({ freshness: "stale", disposition: "exclude" });
    expect(plan.conflicts).toHaveLength(1);
  });

  it("rejects unconsented, secret-like, and unknown-encoding context", () => {
    const plan = resolvePromptSourcesV2({
      task: "Review the configuration.",
      explicitContexts: [
        { id: "paste", kind: "pasted-context", label: "Paste", content: "safe text", consented: false, provenance: ["user paste"] },
        { id: "selection", kind: "editor-selection", label: "Selection", content: "api_key=secret-value-123", consented: true, provenance: ["editor selection"] },
        { id: "file", kind: "picked-file", label: "File", content: "hello", consented: true, encoding: "unknown", provenance: ["picked file:config.dat"] },
      ],
    });
    expect(plan.decisions.filter(({ disposition }) => disposition === "exclude")).toHaveLength(3);
    expect(plan.decisions.map(({ reason }) => reason).join(" ")).not.toContain("secret-value-123");
  });

  it("caps material questions and invalidates answers when sources change", () => {
    const project = {
      sourceId: "project:one", label: "Project", approved: true, current: true,
      provenance: ["snapshot:sha256:abc"], facts: [], conflicts: [], assumptions: [],
      questions: Array.from({ length: 5 }, (_, index) => ({ id: `q${index}`, prompt: `Question ${index}?`, targetSectionId: "relevant-context" as const, reason: "Material project gap." })),
    };
    const first = resolvePromptSourcesV2({ task: "Build it.", project });
    const second = resolvePromptSourcesV2({ task: "Build it safely.", project });
    expect(first.questions).toHaveLength(3);
    expect(sourcePlanAnswersRemainCurrentV2(first.materialHash, first)).toBe(true);
    expect(sourcePlanAnswersRemainCurrentV2(first.materialHash, second)).toBe(false);
  });
});
