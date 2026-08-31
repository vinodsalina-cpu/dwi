import {
  projectSnapshotReviewHash,
  projectSnapshotToBrief,
  type DwiBrief,
  type DwiProjectSnapshot,
} from "@platform/dwi-core";
import type { DwiWorkspaceSnapshot } from "./workspace-snapshot.js";

/**
 * A project review is a human decision bound to the exact resolved project
 * state. Completeness is deliberately separate: open questions can remain
 * visible in a prompt after the user has reviewed them.
 */
export function hasApprovedProjectReview(project: DwiProjectSnapshot): boolean {
  try {
    return project.metadata.review.state === "approved"
      && Boolean(project.metadata.review.reviewedSnapshotHash)
      && project.metadata.review.reviewedSnapshotHash === projectSnapshotReviewHash(project);
  } catch {
    return false;
  }
}

export function canConfirmProjectBrief(project: DwiProjectSnapshot): boolean {
  return hasApprovedProjectReview(project)
    && (project.resolution.status === "current" || project.resolution.status === "partial")
    && project.resolution.conflicts.length === 0;
}

/** Rebuilds all inferred fields from the trusted project and accepts only the
 * two user-controlled brief fields from persisted/webview state. */
export function bindBriefForProject(project: DwiProjectSnapshot, saved?: DwiBrief): DwiBrief {
  const canonical = projectSnapshotToBrief(project);
  return {
    ...canonical,
    confirmed: saved?.confirmed === true && canConfirmProjectBrief(project),
    corrections: typeof saved?.corrections === "string"
      ? saved.corrections.slice(0, 500)
      : canonical.corrections,
  };
}

export function canCompileProjectBrief(project: DwiProjectSnapshot, brief: DwiBrief): boolean {
  return canConfirmProjectBrief(project) && brief.confirmed;
}

export function canResetPromptOptimizerState(snapshot: DwiWorkspaceSnapshot): boolean {
  return Boolean(snapshot.project && snapshot.brief && canCompileProjectBrief(snapshot.project, snapshot.brief));
}

export function confirmWorkspaceBrief(
  snapshot: DwiWorkspaceSnapshot,
  requested: Pick<DwiBrief, "confirmed" | "corrections">,
): DwiWorkspaceSnapshot {
  if (!snapshot.project || !snapshot.brief) throw new Error("Project details and a brief are required before confirmation.");
  const brief = bindBriefForProject(snapshot.project, {
    ...snapshot.brief,
    confirmed: requested.confirmed,
    corrections: requested.corrections,
  });
  if (!brief.confirmed) throw new Error("Review the current project details before confirming this brief.");
  return {
    ...snapshot,
    stage: "compose",
    brief,
    candidate: undefined,
    evaluationMarkdown: undefined,
    feedback: undefined,
  };
}
