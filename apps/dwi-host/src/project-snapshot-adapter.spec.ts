import { describe, expect, it } from "vitest";
import { collectProjectIntelligence } from "@platform/domain-workspace";
import { projectSnapshotToBrief, validateProjectSnapshot } from "@platform/dwi-core";
import { projectIntelligenceToSnapshot } from "./project-snapshot-adapter.js";
import { parseProjectDeclaration } from "./project-declaration.js";
import { importProjectStandards } from "./project-importers.js";

describe("project intelligence snapshot adapter", () => {
  it("preserves deterministic evidence across Node, Python, Go, and Rust", () => {
    const manifests = [
      { path: "package.json", content: JSON.stringify({ packageManager: "pnpm@11", scripts: { test: "vitest run" }, devDependencies: { typescript: "5", vitest: "4" } }) },
      { path: "services/api/pyproject.toml", content: "[project]\ndependencies=['fastapi','pytest']\n" },
      { path: "services/go/go.mod", content: "module example.test/go\n\ngo 1.27\n" },
      { path: "services/rust/Cargo.toml", content: "[package]\nname='worker'\n[dependencies]\naxum='0.8'\n" },
    ];
    const intelligence = collectProjectIntelligence({
      workspaceId: "project-123",
      projectName: "Polyglot",
      manifests,
      rootEntries: ["package.json", "services"],
      workspaceRoots: [".", "services/api", "services/go", "services/rust"],
      revision: { commit: "a".repeat(40), branch: "main", dirty: true },
    });
    const snapshot = projectIntelligenceToSnapshot({
      intelligence,
      generatedAt: "2026-08-26T12:00:00.000Z",
      repository: "https://example.test/acme/polyglot",
      evidenceContent: Object.fromEntries(manifests.map(({ path, content }) => [path, content])),
    });

    expect(validateProjectSnapshot(snapshot)).toEqual({ valid: true, issues: [] });
    expect(snapshot.observed.languages.map(({ id }) => id)).toEqual(["go", "javascript", "python", "rust", "typescript"]);
    expect(snapshot.metadata.revision).toMatchObject({ commit: "a".repeat(40), branch: "main", dirty: true });
    expect(snapshot.observed.ecosystems.find(({ id }) => id === "node")?.packageManager).toBe("pnpm");
    expect(snapshot.spec.workflows.map(({ kind }) => kind)).toEqual(["test"]);
    expect(snapshot.proposals.some(({ state, risk, value }) => state === "pending" && risk === "high" && JSON.stringify(value).includes('"go","build"'))).toBe(true);
    expect(snapshot.evidence).toHaveLength(4);
    expect(JSON.stringify(snapshot)).not.toContain("module example.test/go");
    expect(snapshot.evidence.every(({ content }) => content === undefined)).toBe(true);
    expect(snapshot.resolution.status).toBe("partial");
    expect(projectSnapshotToBrief(snapshot).stack).toEqual(expect.arrayContaining(["Go", "Python", "Rust", "TypeScript"]));
  });

  it("adds bounded documentation without treating it as deterministic source code", () => {
    const intelligence = collectProjectIntelligence({
      workspaceId: "project-docs",
      projectName: "Docs",
      manifests: [{ path: "go.mod", content: "module example.test/docs\n\ngo 1.27\n" }],
    });
    const snapshot = projectIntelligenceToSnapshot({
      intelligence,
      generatedAt: "2026-08-26T12:00:00.000Z",
      evidenceContent: { "go.mod": "module example.test/docs\n\ngo 1.27\n", "README.md": "# Docs" },
    });
    expect(snapshot.observed.documentation).toEqual([
      { id: expect.stringMatching(/^documentation-[a-f0-9]{16}$/), path: "README.md" },
    ]);
    expect(snapshot.evidence.find(({ relativePath }) => relativePath === "README.md")?.kind).toBe("documentation");
    expect(snapshot.evidence.find(({ relativePath }) => relativePath === "README.md")?.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(snapshot.resolution.coverage.documentation).toBe("partial");
  });

  it("lets a checked-in declaration override detector fields with explicit provenance", () => {
    const intelligence = collectProjectIntelligence({
      workspaceId: "project-declared",
      projectName: "Folder name",
      manifests: [{ path: "go.mod", content: "module example.test/payments\n\ngo 1.27\n" }],
    });
    const content = `
apiVersion: dwi.dev/v1
kind: Project
metadata: { name: Payments, namespace: commerce }
spec:
  identity:
    description: Processes payments.
    componentType: service
    lifecycle: production
    owners: [payments]
  boundaries:
    providesApis: [payments]
  workflows:
    - { id: build, kind: build, argv: [go, build, ./...], cwd: . }
    - { id: test, kind: test, argv: [go, test, ./...], cwd: . }
`;
    const snapshot = projectIntelligenceToSnapshot({
      intelligence,
      generatedAt: "2026-08-26T12:00:00.000Z",
      declaration: { value: parseProjectDeclaration(content), content },
    });
    expect(snapshot.metadata).toMatchObject({ name: "Payments", namespace: "commerce" });
    expect(snapshot.resolution.effectiveSnapshot.spec.identity).toMatchObject({ componentType: "service", lifecycle: "production", owners: ["payments"] });
    expect(snapshot.claims.find(({ path }) => path === "/spec/identity/owners")).toMatchObject({ authority: "declaration", evidenceRefs: ["declaration-project-yaml"] });
    expect(snapshot.evidence.find(({ id }) => id === "declaration-project-yaml")?.kind).toBe("declaration");
    expect(validateProjectSnapshot(snapshot).valid).toBe(true);
  });

  it("links Backstage and CycloneDX standard evidence into the canonical snapshot", () => {
    const intelligence = collectProjectIntelligence({ workspaceId: "standards", projectName: "standards", manifests: [{ path: "go.mod", content: "module example.test/standards\n" }] });
    const standardContent = {
      "catalog-info.yaml": "apiVersion: backstage.io/v1alpha1\nkind: Component\nmetadata: { name: standards, description: Standards service }\nspec: { type: service, lifecycle: production, owner: platform, providesApis: [standards-v1] }\n",
      "bom.cdx.json": "{\"bomFormat\":\"CycloneDX\"}",
    };
    const snapshot = projectIntelligenceToSnapshot({
      intelligence,
      generatedAt: "2026-08-26T12:00:00.000Z",
      standards: importProjectStandards(standardContent),
    });
    expect(snapshot.resolution.effectiveSnapshot.spec.identity).toMatchObject({ componentType: "service", lifecycle: "production", owners: ["platform"] });
    expect(snapshot.observed.dependencyArtifacts[0]).toMatchObject({ format: "CycloneDX", path: "bom.cdx.json" });
    expect(snapshot.evidence.map(({ kind }) => kind)).toEqual(expect.arrayContaining(["catalog", "manifest"]));
    expect(snapshot.resolution.unknowns.map(({ path }) => path)).not.toEqual(expect.arrayContaining(["/spec/identity/owners", "/spec/identity/lifecycle", "/spec/boundaries"]));
    expect(snapshot.resolution.coverage).toMatchObject({ identity: "complete", architecture: "complete", documentation: "complete" });
    expect(snapshot.resolution.status).toBe("partial");
    expect(validateProjectSnapshot(snapshot).valid).toBe(true);
  });

  it("keeps bounded-inspection omissions explicit and prevents complete coverage", () => {
    const intelligence = collectProjectIntelligence({
      workspaceId: "bounded",
      projectName: "bounded",
      manifests: [{ path: "go.mod", content: "module example.test/bounded\n\ngo 1.27\n" }],
    });
    const snapshot = projectIntelligenceToSnapshot({
      intelligence,
      generatedAt: "2026-08-26T12:00:00.000Z",
      omissions: {
        truncated: true,
        skipped: [{ path: "services/overflow/go.mod", reason: "file-limit" }],
      },
    });
    expect(snapshot.resolution.unknowns).toContainEqual(expect.objectContaining({ path: "/observed/evidenceOmissions", required: true }));
    expect(snapshot.resolution.coverage.toolchain).toBe("partial");
    expect(snapshot.resolution.status).toBe("partial");
  });

  it("reports malformed evidence as a diagnostic without inventing an omission count", () => {
    const intelligence = collectProjectIntelligence({
      workspaceId: "malformed",
      projectName: "malformed",
      manifests: [{ path: "go.mod", content: "not a go module" }],
    });
    const snapshot = projectIntelligenceToSnapshot({
      intelligence,
      generatedAt: "2026-08-26T12:00:00.000Z",
    });

    expect(snapshot.resolution.unknowns).toContainEqual(expect.objectContaining({
      path: "/observed/diagnostics",
      reason: expect.stringContaining("MALFORMED_MANIFEST"),
      required: true,
    }));
    expect(snapshot.resolution.unknowns.map(({ path }) => path)).not.toContain(
      "/observed/evidenceOmissions",
    );
    expect(snapshot.resolution.coverage.toolchain).not.toBe("complete");
  });

  it("keeps package managers root-scoped in mixed-manager monorepos", () => {
    const intelligence = collectProjectIntelligence({
      workspaceId: "mixed-node",
      projectName: "mixed-node",
      manifests: [
        { path: "package.json", content: JSON.stringify({ scripts: { build: "tsc" } }) },
        { path: "package-lock.json", content: "{}" },
        { path: "apps/web/package.json", content: JSON.stringify({ packageManager: "pnpm@11", scripts: { test: "vitest" } }) },
      ],
    });
    const snapshot = projectIntelligenceToSnapshot({
      intelligence,
      generatedAt: "2026-08-26T12:00:00.000Z",
    });

    expect(snapshot.observed.ecosystems).toContainEqual(expect.objectContaining({
      id: "node",
      roots: [".", "apps/web"],
      packageManagers: [
        { id: "npm", roots: ["."] },
        { id: "pnpm", roots: ["apps/web"] },
      ],
    }));
    expect(snapshot.spec.workflows).toEqual(expect.arrayContaining([
      expect.objectContaining({ argv: ["npm", "run", "build"], cwd: "." }),
      expect.objectContaining({ argv: ["pnpm", "run", "test"], cwd: "apps/web" }),
    ]));
  });

  it("keeps lockless package scripts pending and leaves the manager unresolved", () => {
    const intelligence = collectProjectIntelligence({
      workspaceId: "lockless-node",
      projectName: "lockless-node",
      manifests: [
        { path: "package.json", content: JSON.stringify({ scripts: { build: "tsc", test: "vitest" } }) },
      ],
    });
    const snapshot = projectIntelligenceToSnapshot({
      intelligence,
      generatedAt: "2026-08-26T12:00:00.000Z",
    });

    expect(snapshot.observed.ecosystems).toEqual([
      expect.objectContaining({ id: "node", roots: ["."] }),
    ]);
    expect(snapshot.observed.ecosystems[0]).not.toHaveProperty("packageManager");
    expect(snapshot.spec.workflows).toEqual([]);
    expect(snapshot.proposals).toEqual(expect.arrayContaining([
      expect.objectContaining({ state: "pending", risk: "high", path: "/spec/workflows" }),
    ]));
    expect(snapshot.resolution.unknowns).toContainEqual(expect.objectContaining({
      path: "/observed/package-manager-authority",
      required: true,
    }));
  });

  it("preserves provenance for a maximum-size supported manifest scan", () => {
    const manifests = Array.from({ length: 1_000 }, (_, index) => ({
      path: `services/service-${String(index).padStart(4, "0")}/go.mod`,
      content: `module example.test/service-${index}\n\ngo 1.27\n`,
    }));
    const intelligence = collectProjectIntelligence({
      workspaceId: "maximum-scan",
      projectName: "maximum-scan",
      manifests,
    });
    const snapshot = projectIntelligenceToSnapshot({
      intelligence,
      generatedAt: "2026-08-26T12:00:00.000Z",
    });

    expect(snapshot.evidence).toHaveLength(1_000);
    expect(snapshot.observed.languages.find(({ id }) => id === "go")?.roots)
      .toHaveLength(1_000);
    expect(Math.max(...snapshot.claims.map(({ evidenceRefs }) => evidenceRefs.length)))
      .toBe(1_000);
    expect(validateProjectSnapshot(snapshot)).toEqual({ valid: true, issues: [] });
  });
});
