import { describe, expect, it } from "vitest";
import { BUILT_IN_PROMPT_TEMPLATES } from "@platform/domain-prompt-optimizer";
import { DWI_MODULES, briefDigest, compileDwiCandidate, createFeedback, evaluationMarkdown, type DwiBrief } from "./index.js";
const brief: DwiBrief = { version: "dwi.brief.v1", projectName: "Demo", archetype: "web application", stack: ["TypeScript", "React"], packageManager: "pnpm", scripts: ["test", "build"], modules: ["apps/web"], facts: [], unknowns: ["deployment target"], confirmed: true, corrections: "none" };
describe("DWI core", () => {
  it("renders a stable bounded digest", () => expect(briefDigest(brief)).toContain("Package manager: pnpm"));
  it("compiles through the Prompt Optimizer with explicit modules and estimate", () => { const result = compileDwiCandidate(brief, DWI_MODULES.filter((m) => m.defaultSelected).map((m) => m.id)); expect(result.text).toContain("## Relevant context"); expect(result.text).toContain("Confirmed DWI project brief"); expect(result.estimate.method).toContain("not provider billing"); });
  it("applies a selected template and distinct output-size guidance", () => {
    const template = BUILT_IN_PROMPT_TEMPLATES.find(({ id }) => id === "bug-fix")!;
    const low = compileDwiCandidate(brief, ["orientation"], { task: "Repair checkout retries.", template, outputSize: "low" });
    const high = compileDwiCandidate(brief, ["orientation"], { task: "Repair checkout retries.", template, outputSize: "high" });
    expect(low.text).toContain("Repair checkout retries.");
    expect(low.text).toContain("Keep supporting prose compact.");
    expect(high.text).toContain("detailed implementation report");
    expect(high.text).not.toEqual(low.text);
    expect(compileDwiCandidate(brief, ["orientation"], { task: "Repair checkout retries.", template, outputSize: "auto" }).text).toContain("Adapt response detail to task criticality");
  });
  it("requires confirmation and selection", () => { expect(() => compileDwiCandidate({ ...brief, confirmed: false }, ["orientation"])).toThrow(/Confirm/); expect(() => compileDwiCandidate(brief, [])).toThrow(/Select/); });
  it("bounds feedback and filters unknown modules", () => { const event = createFeedback({ rating: "helpful", tags: Array(12).fill("tag"), selectedModuleIds: ["orientation", "bad"], estimate: { baselineTokens: 10, optimizedTokens: 5, estimatedAvoidedDuplication: 5, method: "test" }, elapsedMs: 10 }, "2026-01-01T00:00:00.000Z"); expect(event.tags).toHaveLength(8); expect(event.selectedModuleIds).toEqual(["orientation"]); expect(() => createFeedback({ ...event, note: "x".repeat(501) })).toThrow(/500/); });
  it("keeps evaluation human gated", () => { const event = createFeedback({ rating: "mixed", tags: [], selectedModuleIds: ["orientation"], estimate: { baselineTokens: 10, optimizedTokens: 5, estimatedAvoidedDuplication: 5, method: "test" }, elapsedMs: 20 }); expect(evaluationMarkdown(event, brief)).toContain("Decision: [select]"); });
});
