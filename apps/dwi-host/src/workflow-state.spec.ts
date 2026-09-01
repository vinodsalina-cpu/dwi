import { describe, expect, it } from "vitest";
import { collectProjectIntelligence } from "@platform/domain-workspace";
import { compileDwiCandidate, projectSnapshotToBrief, resolveProjectSnapshot } from "@platform/dwi-core";
import { projectIntelligenceToSnapshot } from "./project-snapshot-adapter.js";
import { DWI_SNAPSHOT_SCHEMA, clearPromptOptimizerState, type DwiWorkspaceSnapshot } from "./workspace-snapshot.js";
import { bindBriefForProject, canCompileProjectBrief, canResetPromptOptimizerState, confirmWorkspaceBrief, hasApprovedProjectReview } from "./workflow-state.js";

function approvedPartialProject() {
  const intelligence = collectProjectIntelligence({
    workspaceId: "workflow-project",
    projectName: "Workflow project",
    manifests: [{ path: "go.mod", content: "module example.test/workflow\n\ngo 1.27\n" }],
  });
  const detected = projectIntelligenceToSnapshot({
    intelligence,
    generatedAt: "2026-08-27T12:00:00.000Z",
  });
  const { resolution, ...source } = detected;
  return resolveProjectSnapshot({
    ...source,
    metadata: {
      ...source.metadata,
      review: {
        state: "approved",
        reviewedAt: "2026-08-27T12:01:00.000Z",
        reviewedBy: "local-vscode-user",
      },
    },
  }, { unknowns: resolution.unknowns, coverageOverrides: resolution.coverage });
}

describe("prompt workflow state", () => {
  it("keeps explicit brief confirmation for an exact reviewed project with open questions", () => {
    const project = approvedPartialProject();
    const canonical = projectSnapshotToBrief(project);

    expect(project.resolution.status).toBe("partial");
    expect(canonical.confirmed).toBe(false);
    expect(hasApprovedProjectReview(project)).toBe(true);

    const confirmed = bindBriefForProject(project, {
      ...canonical,
      confirmed: true,
      corrections: "The API is the primary delivery surface.",
    });
    expect(confirmed.confirmed).toBe(true);
    expect(confirmed.corrections).toBe("The API is the primary delivery surface.");
    expect(canCompileProjectBrief(project, confirmed)).toBe(true);
  });

  it("never accepts confirmation without a review bound to the same project", () => {
    const reviewed = approvedPartialProject();
    const unreviewed = {
      ...reviewed,
      metadata: {
        ...reviewed.metadata,
        review: { state: "unreviewed" as const },
      },
    };
    const attempted = bindBriefForProject(unreviewed, {
      ...projectSnapshotToBrief(unreviewed),
      confirmed: true,
      corrections: "keep this note",
    });

    expect(hasApprovedProjectReview(unreviewed)).toBe(false);
    expect(attempted.confirmed).toBe(false);
    expect(canCompileProjectBrief(unreviewed, attempted)).toBe(false);
  });

  it("allows optimizer reset only for the exact approved project and confirmed brief", () => {
    const project = approvedPartialProject();
    const brief = bindBriefForProject(project, { ...projectSnapshotToBrief(project), confirmed: true });
    const snapshot: DwiWorkspaceSnapshot = {
      schema: DWI_SNAPSHOT_SCHEMA,
      status: "complete",
      stage: "evaluate",
      updatedAt: "2026-08-27T12:02:00.000Z",
      project,
      brief,
      optimizerDraft: { task: "Keep the approved knowledge.", assignmentId: "general", promptType: "General", outputSize: "low" },
      candidate: { text: "Candidate", selectedModuleIds: [], estimate: { baselineTokens: 2, optimizedTokens: 1, estimatedAvoidedDuplication: 1, method: "bounded" } },
      optimizerReview: { source: "local" },
    };
    expect(canResetPromptOptimizerState(snapshot)).toBe(true);
    const cleared = clearPromptOptimizerState(snapshot, "2026-08-27T12:03:00.000Z");
    expect(cleared).toMatchObject({ stage: "compose", project, brief, status: "partial" });
    expect(cleared).not.toHaveProperty("optimizerDraft");
    expect(cleared).not.toHaveProperty("candidate");

    const unreviewed = { ...project, metadata: { ...project.metadata, review: { state: "unreviewed" as const } } };
    const changed = { ...project, metadata: { ...project.metadata, name: "Changed after review" } };
    for (const ineligible of [
      { ...snapshot, project: unreviewed },
      { ...snapshot, project: changed },
      { ...snapshot, brief: { ...brief, confirmed: false } },
    ]) {
      expect(canResetPromptOptimizerState(ineligible)).toBe(false);
      expect(() => clearPromptOptimizerState(ineligible, "2026-08-27T12:03:00.000Z")).toThrow(/current approved project/i);
    }
  });

  it("produces the persisted compose state before an immediate compile", () => {
    const project = approvedPartialProject();
    const snapshot: DwiWorkspaceSnapshot = {
      schema: DWI_SNAPSHOT_SCHEMA,
      status: "partial",
      stage: "brief",
      updatedAt: "2026-08-27T12:02:00.000Z",
      project,
      brief: projectSnapshotToBrief(project),
      selectedModuleIds: ["orientation"],
    };

    const confirmed = confirmWorkspaceBrief(snapshot, { confirmed: true, corrections: "Keep open questions explicit." });
    expect(confirmed).toMatchObject({ stage: "compose", brief: { confirmed: true, corrections: "Keep open questions explicit." } });
    expect(confirmed.candidate).toBeUndefined();
    expect(canCompileProjectBrief(project, confirmed.brief!)).toBe(true);
    expect(() => compileDwiCandidate(confirmed.brief!, confirmed.selectedModuleIds ?? [])).not.toThrow();
  });
});
