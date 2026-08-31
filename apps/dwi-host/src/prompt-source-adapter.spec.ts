import { describe, expect, it } from "vitest";
import { resolveProjectSnapshot } from "@platform/dwi-core";
import { collectProjectIntelligence } from "@platform/domain-workspace";
import { projectIntelligenceToSnapshot } from "./project-snapshot-adapter.js";
import { reviewedProjectSourceContribution } from "./prompt-source-adapter.js";

function approvedProject() {
  const detected = projectIntelligenceToSnapshot({
    intelligence: collectProjectIntelligence({
      workspaceId: "source-adapter",
      projectName: "Source adapter",
      manifests: [{ path: "package.json", content: JSON.stringify({ packageManager: "pnpm@11", scripts: { test: "vitest run" } }) }],
    }),
    generatedAt: "2026-08-31T00:00:00.000Z",
  });
  const { resolution, ...source } = detected;
  return resolveProjectSnapshot({
    ...source,
    metadata: { ...source.metadata, review: { state: "approved", reviewedAt: "2026-08-31T00:01:00.000Z", reviewedBy: "local-vscode-user" } },
  }, { unknowns: resolution.unknowns, coverageOverrides: resolution.coverage });
}

describe("reviewed project Prompt Optimizer contribution", () => {
  it("maps only present reviewed facts with review-bound provenance", () => {
    const contribution = reviewedProjectSourceContribution(approvedProject(), true);
    expect(contribution).toMatchObject({ approved: true, current: true });
    expect(contribution.facts).toEqual(expect.arrayContaining([
      { label: "Project", value: "Source adapter" },
      { label: "Ecosystems", value: "Node.js" },
    ]));
    expect(contribution.provenance).toEqual(expect.arrayContaining([expect.stringMatching(/^review:sha256:/)]));
    expect(JSON.stringify(contribution)).not.toMatch(/policyVersion|policyExpiresAt|gateway|organization|protectedPaths/);
  });

  it("fails approval when reviewed content is changed after review", () => {
    const project = approvedProject();
    const changed = { ...project, metadata: { ...project.metadata, name: "Changed after review" } };
    expect(reviewedProjectSourceContribution(changed, true).approved).toBe(false);
  });
});
