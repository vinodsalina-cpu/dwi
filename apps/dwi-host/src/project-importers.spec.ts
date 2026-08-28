import { describe, expect, it } from "vitest";
import { importProjectStandards } from "./project-importers.js";

describe("open project-standard importers", () => {
  it("imports Backstage organizational metadata with catalog authority", () => {
    const imported = importProjectStandards({
      "catalog-info.yaml": `apiVersion: backstage.io/v1alpha1\nkind: Component\nmetadata:\n  name: payments\n  description: Processes payments\n  tags: [go, payments]\nspec:\n  type: service\n  lifecycle: production\n  owner: commerce-payments\n  providesApis: [payments-v1]\n`,
    });
    expect(imported.evidence[0]).toMatchObject({ kind: "catalog", parser: "backstage-component@v1alpha1" });
    expect(imported.claims.find(({ path }) => path === "/spec/identity/owners")).toMatchObject({ authority: "catalog", value: ["commerce-payments"] });
    expect(imported.claims.find(({ path }) => path === "/spec/boundaries/providesApis")?.value).toEqual(["payments-v1"]);
  });

  it("imports only shell-free Devfile commands and records unsupported syntax", () => {
    const imported = importProjectStandards({
      "devfile.yaml": `schemaVersion: 2.3.0\ncommands:\n  - id: test\n    exec: { command: "go test ./...", workingDir: . }\n  - id: unsafe\n    exec: { command: "npm test && curl example.test", workingDir: . }\n`,
    });
    expect(imported.claims[0]?.value).toEqual([{ id: "devfile-test", kind: "custom", argv: ["go", "test", "./..."], cwd: ".", description: "Imported from Devfile; review before execution." }]);
    expect(imported.unknowns[0]?.reason).toMatch(/safe direct-argv/);
  });

  it("records CycloneDX documents as bounded references", () => {
    expect(importProjectStandards({ "bom.cdx.json": "{}" }).evidence[0]).toMatchObject({ kind: "manifest", parser: "cyclonedx-reference@1" });
  });

  it("uses collision-resistant evidence ids for paths with the same slug", () => {
    const component = "apiVersion: backstage.io/v1alpha1\nkind: Component\nmetadata: { name: example }\nspec: { type: service, lifecycle: production, owner: platform }\n";
    const imported = importProjectStandards({
      "a-b/catalog-info.yaml": component,
      "a/b/catalog-info.yaml": component,
    });
    expect(new Set(imported.evidence.map(({ id }) => id)).size).toBe(2);
    expect(imported.claims.every(({ evidenceId }) => imported.evidence.some(({ id }) => id === evidenceId))).toBe(true);
  });

  it("keeps nested Backstage entities component-scoped", () => {
    const imported = importProjectStandards({
      "services/api/catalog-info.yaml": "apiVersion: backstage.io/v1alpha1\nkind: Component\nmetadata: { name: api }\nspec: { type: service, lifecycle: production, owner: team-api, providesApis: [api-v1] }\n",
      "services/worker/catalog-info.yaml": "apiVersion: backstage.io/v1alpha1\nkind: Component\nmetadata: { name: worker }\nspec: { type: service, lifecycle: experimental, owner: team-worker }\n",
    });
    expect(imported.claims.filter(({ path }) => path.startsWith("/spec/identity"))).toEqual([]);
    expect(imported.components.map(({ value }) => value)).toEqual([
      expect.objectContaining({ name: "api", root: "services/api", type: "service" }),
      expect.objectContaining({ name: "worker", root: "services/worker", type: "service" }),
    ]);
    expect(imported.unknowns).toHaveLength(2);
  });

  it("rebases nested Devfile working directories to repository-relative paths", () => {
    const imported = importProjectStandards({
      "services/api/devfile.yaml": "schemaVersion: 2.3.0\ncommands:\n  - id: root-test\n    exec: { command: 'go test ./...', workingDir: . }\n  - id: src-test\n    exec: { command: 'go test ./...', workingDir: src }\n",
    });
    expect(imported.claims[0]?.value).toEqual([
      expect.objectContaining({ id: "devfile-root-test", cwd: "services/api" }),
      expect.objectContaining({ id: "devfile-src-test", cwd: "services/api/src" }),
    ]);
  });
});
