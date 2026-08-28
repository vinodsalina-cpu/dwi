import { describe, expect, it } from "vitest";
import { collectProjectIntelligence } from "@platform/domain-workspace";
import { compileDwiCandidate, projectSnapshotToBrief, resolveProjectSnapshot } from "@platform/dwi-core";
import { projectIntelligenceToSnapshot } from "./project-snapshot-adapter.js";
import { DWI_SNAPSHOT_SCHEMA, type DwiWorkspaceSnapshot } from "./workspace-snapshot.js";
import { bindBriefForProject, canCompileProjectBrief, confirmWorkspaceBrief, hasApprovedProjectReview } from "./workflow-state.js";

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
