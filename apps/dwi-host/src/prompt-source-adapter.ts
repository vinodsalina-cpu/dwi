import {
  projectSnapshotReviewHash,
  type DwiProjectSnapshot,
} from "@platform/dwi-core";
import type {
  PromptProjectContributionV2,
  PromptSourceAssumptionV2,
  PromptSourceConflictV2,
  PromptMaterialQuestionV2,
} from "@platform/domain-prompt-optimizer";

function bounded(values: readonly string[], limit = 24): string {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
    .slice(0, limit)
    .join(", ");
}

function approved(project: DwiProjectSnapshot): boolean {
  try {
    return project.metadata.review.state === "approved"
      && Boolean(project.metadata.review.reviewedSnapshotHash)
      && project.metadata.review.reviewedSnapshotHash === projectSnapshotReviewHash(project);
  } catch {
    return false;
  }
}

/**
 * Converts only facts already present in the locally reviewed project snapshot.
 * It deliberately does not populate remote policy, organization, expiry, sync,
 * gateway, or protected-path fields.
 */
export function reviewedProjectSourceContribution(
  project: DwiProjectSnapshot,
  current: boolean,
): PromptProjectContributionV2 {
  const effective = project.resolution.effectiveSnapshot;
  const facts: Array<{ label: string; value: string }> = [];
  const add = (label: string, value: string | undefined) => {
    if (value?.trim()) facts.push({ label, value: value.trim() });
  };
  add("Project", project.metadata.name);
  add("Description", effective.spec.identity.description);
  add("Component type", effective.spec.identity.componentType);
  add("Owners", bounded(effective.spec.identity.owners));
  add("Languages", bounded(effective.observed.languages.map(({ name, id }) => name ?? id)));
  add("Ecosystems", bounded(effective.observed.ecosystems.map(({ name, id }) => name ?? id)));
  add("Frameworks", bounded(effective.observed.frameworks.map(({ name, id }) => name ?? id)));
  add("Toolchains", bounded(effective.observed.toolchains.map(({ name, id }) => name ?? id)));
  add("Component roots", bounded(effective.spec.boundaries.componentRoots));
  add("Generated roots", bounded(effective.spec.boundaries.generatedRoots));
  add("Excluded roots", bounded(effective.spec.boundaries.excludedRoots));
  add("Architecture rules", bounded(effective.spec.constraints.architectureRules));
  add("Supported platforms", bounded(effective.spec.constraints.supportedPlatforms));
  add("Workflows", bounded(effective.spec.workflows.map(({ kind, argv, cwd }) => `${kind}: ${argv.join(" ")} (${cwd})`)));

  const conflicts: PromptSourceConflictV2[] = project.resolution.conflicts.map((conflict, index) => ({
    id: `project-conflict:${index + 1}`,
    label: conflict.path,
    sourceIds: [...conflict.claimIds],
    reason: conflict.reason,
  }));
  const questions: PromptMaterialQuestionV2[] = project.resolution.unknowns
    .filter(({ required }) => required)
    .map((unknown, index) => ({
      id: `project-question:${index + 1}`,
      prompt: `What should Prompt Optimizer use for ${unknown.path}?`,
      targetSectionId: "relevant-context",
      reason: unknown.reason,
    }));
  const assumptions: PromptSourceAssumptionV2[] = project.resolution.unknowns
    .filter(({ required }) => !required)
    .map((unknown, index) => ({
      id: `project-assumption:${index + 1}`,
      text: unknown.reason,
      sourceId: `project:${project.metadata.id}`,
    }));
  const reviewHash = project.metadata.review.reviewedSnapshotHash;
  return {
    sourceId: `project:${project.metadata.id}`,
    label: `Reviewed project: ${project.metadata.name}`,
    approved: approved(project),
    current,
    provenance: [
      `project:${project.metadata.id}`,
      `effective:${project.resolution.effectiveSnapshotHash}`,
      ...(reviewHash ? [`review:${reviewHash}`] : []),
    ],
    facts,
    conflicts,
    questions,
    assumptions,
  };
}
