import type { ProjectClaimView, ProjectSectionId, ProjectSectionView, ProjectSnapshotStatus, ProjectSnapshotViewModel } from "./project-intelligence.js";

function claim(id: string, label: string, value: string, source = "package.json", confidence: ProjectClaimView["confidence"] = "high"): ProjectClaimView {
  return {
    id,
    label,
    value,
    confidence,
    authority: "deterministic",
    state: "accepted",
    evidence: [{ id: `ev-${id}`, kind: "manifest", source, detail: `${label}: ${value}`, parser: "fixture-pack@1.0.0", collectedAt: "2026-08-26T12:00:00Z" }],
  };
}

const copy: Record<ProjectSectionId, [string, string]> = {
  identity: ["Identity", "Purpose, ownership, and lifecycle"],
  toolchain: ["Toolchain", "Languages, ecosystems, and runtimes"],
  commands: ["Commands", "Declared build and verification workflows"],
  components: ["Components", "Modules, services, and entrypoints"],
  boundaries: ["Boundaries", "APIs, dependencies, and repository roots"],
  documentation: ["Documentation", "Trusted project guidance"],
  gaps: ["Gaps", "Unknown, unsupported, or conflicting facts"],
};

function section(id: ProjectSectionId, claims: ProjectClaimView[]): ProjectSectionView {
  return { id, title: copy[id][0], description: copy[id][1], claims };
}

const currentSections: ProjectSectionView[] = [
  section("identity", [
    claim("owner", "Owner", "group:commerce-payments", ".dwi/project.yaml"),
    claim("type", "Component type", "service", ".dwi/project.yaml"),
    claim("lifecycle", "Lifecycle", "production", ".dwi/project.yaml"),
  ]),
  section("toolchain", [
    claim("language", "Language", "TypeScript 5.9", "tsconfig.json"),
    claim("runtime", "Runtime", "Node.js >=24.18", "package.json"),
    claim("manager", "Package manager", "pnpm 10", "package.json"),
  ]),
  section("commands", [
    claim("test", "Test", "pnpm test", "package.json"),
    claim("build", "Build", "pnpm build", "package.json"),
  ]),
  section("components", [claim("workspace", "Workspace", "apps/dwi-host, apps/dwi-webview, packages/dwi-core", "pnpm-workspace.yaml")]),
  section("boundaries", [claim("api", "Provides API", "api:project-intelligence-v1", ".dwi/project.yaml")]),
  section("documentation", [claim("readme", "Project guide", "README.md", "README.md", "medium")]),
  section("gaps", [claim("deployment", "Unknown", "Deployment target", "resolution", "low")]),
];

function fixture(status: ProjectSnapshotStatus, overrides: Partial<ProjectSnapshotViewModel> = {}): ProjectSnapshotViewModel {
  return {
    status,
    projectName: "Developer Work Intelligence",
    description: "Evidence-backed project context for development workflows.",
    owner: "group:developer-experience",
    componentType: "tool",
    lifecycle: "experimental",
    generatedAt: "2026-08-26T12:00:00Z",
    revision: "a18e4a5d72e2f31976c0ca27ae699c5f3f6b1320",
    coverage: { percent: 80, complete: 4, total: 5, label: "4 of 5 dimensions complete" },
    conflictCount: 0,
    pendingChanges: 0,
    reviewed: true,
    sections: currentSections,
    ...overrides,
  };
}

export const PROJECT_UI_FIXTURES: Record<ProjectSnapshotStatus | "long-content", ProjectSnapshotViewModel> = {
  scanning: fixture("scanning", { coverage: { percent: 0, complete: 0, total: 5, label: "Discovering project dimensions" }, sections: currentSections.map((item) => ({ ...item, claims: [] })) }),
  current: fixture("current"),
  stale: fixture("stale", { pendingChanges: 3, message: "The current revision differs from the approved snapshot." }),
  partial: fixture("partial", { coverage: { percent: 50, complete: 2, total: 5, label: "2 of 5 dimensions complete" } }),
  conflict: fixture("conflict", { conflictCount: 2, pendingChanges: 2 }),
  unsupported: fixture("unsupported", { projectName: "Unknown workspace", coverage: { percent: 0, complete: 0, total: 5, label: "No supported dimensions" }, sections: currentSections.map((item) => ({ ...item, claims: [] })) }),
  error: fixture("error", { message: "Cargo metadata timed out after 5 seconds. No project files were changed.", coverage: { percent: 0, complete: 0, total: 5, label: "Scan did not complete" }, sections: currentSections.map((item) => ({ ...item, claims: [] })) }),
  "long-content": fixture("partial", {
    projectName: "Global Commerce Transaction Reconciliation and Settlement Orchestration Platform",
    description: "Coordinates asynchronous payment settlement, reconciliation, dispute ingestion, and audited reporting across a deliberately long set of regional systems.",
    owner: "group:global-commerce-payments-reliability-and-regulatory-engineering",
    pendingChanges: 14,
    sections: currentSections.map((item) => item.id === "components" ? section("components", [claim("long-component", "Workspace", "services/transaction-reconciliation-orchestrator, packages/regulatory-reporting-contracts, applications/merchant-dispute-management-console", "pnpm-workspace.yaml")]) : item),
  }),
};

export function projectFixtureFromLocation(): ProjectSnapshotViewModel {
  const fixtureName = new URLSearchParams(window.location.search).get("fixture") ?? "current";
  return PROJECT_UI_FIXTURES[fixtureName as keyof typeof PROJECT_UI_FIXTURES] ?? PROJECT_UI_FIXTURES.current;
}
