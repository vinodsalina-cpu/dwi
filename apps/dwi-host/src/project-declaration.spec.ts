import { describe, expect, it } from "vitest";
import {
  DwiProjectDeclarationError,
  createProjectDeclarationExclusively,
  parseProjectDeclaration,
  projectDeclarationTemplate,
} from "./project-declaration.js";

describe("project declaration", () => {
  it("creates a parseable identity-only scaffold without detector-owned overrides", () => {
    const template = projectDeclarationTemplate("Payments: Core #1");
    const declaration = parseProjectDeclaration(template);

    expect(declaration.metadata).toEqual({ name: "Payments: Core #1" });
    expect(declaration.spec).toEqual({ identity: {} });
    expect(declaration.spec?.boundaries).toBeUndefined();
    expect(declaration.spec?.workflows).toBeUndefined();
    expect(template).not.toMatch(/^\s+boundaries:/m);
    expect(template).not.toMatch(/^\s+workflows:/m);
  });

  it("keeps detector-owned sections absent when a user fills only identity", () => {
    const edited = projectDeclarationTemplate("Payments API").replace(
      "  identity: {}",
      "  identity:\n    componentType: service\n    owners: [group:payments]",
    );
    const declaration = parseProjectDeclaration(edited);

    expect(declaration.spec).toEqual({ identity: { componentType: "service", owners: ["group:payments"] } });
    expect(declaration.spec?.boundaries).toBeUndefined();
    expect(declaration.spec?.workflows).toBeUndefined();
  });

  it("never overwrites a declaration created during scaffold publication", async () => {
    const files = new Map<string, Uint8Array>();
    const userDeclaration = new TextEncoder().encode("user-owned");
    const result = await createProjectDeclarationExclusively(
      {
        writeFile: async (path, content) => { files.set(path, content); },
        renameWithoutOverwrite: async (from, to) => {
          files.set(to, userDeclaration);
          throw Object.assign(new Error("exists"), { code: "FileExists" });
        },
        delete: async (path) => { files.delete(path); },
      },
      ".dwi/.project.yaml.staging-test",
      ".dwi/project.yaml",
      new TextEncoder().encode(projectDeclarationTemplate("Generated")),
    );

    expect(result).toBe("already-exists");
    expect(files.get(".dwi/project.yaml")).toBe(userDeclaration);
    expect(files.has(".dwi/.project.yaml.staging-test")).toBe(false);
  });

  it("parses the bounded authoritative schema", () => {
    const declaration = parseProjectDeclaration(`
apiVersion: dwi.dev/v1
kind: Project
metadata:
  name: Payments API
  namespace: commerce
spec:
  identity:
    componentType: service
    lifecycle: production
    owners: [payments]
    tags: [go, api]
  boundaries:
    providesApis: [payments]
    dependsOn: [postgres]
  workflows:
    - id: test
      kind: test
      argv: [go, test, ./...]
      cwd: .
  constraints:
    supportedPlatforms: [linux]
    networkRequiredForBuild: false
`);
    expect(declaration.metadata).toEqual({ name: "Payments API", namespace: "commerce" });
    expect(declaration.spec?.identity?.owners).toEqual(["payments"]);
    expect(declaration.spec?.workflows?.[0]).toEqual({ id: "test", kind: "test", argv: ["go", "test", "./..."], cwd: "." });
  });

  it("rejects aliases, unknown fields, duplicate keys, and unsafe working directories", () => {
    expect(() => parseProjectDeclaration("apiVersion: dwi.dev/v1\nkind: Project\nspec: &spec {}\ncopy: *spec\n")).toThrow(DwiProjectDeclarationError);
    expect(() => parseProjectDeclaration("apiVersion: dwi.dev/v1\napiVersion: dwi.dev/v1\nkind: Project\n")).toThrow(DwiProjectDeclarationError);
    expect(() => parseProjectDeclaration("apiVersion: dwi.dev/v1\nkind: Project\nspec:\n  workflows:\n    - id: bad\n      kind: test\n      argv: [npm, test]\n      cwd: ../outside\n")).toThrow(/repository-relative/);
    expect(() => parseProjectDeclaration("apiVersion: dwi.dev/v1\nkind: Project\nspec:\n  boundaries:\n    componentRoots: [../outside]\n")).toThrow(/repository-relative/);
    expect(() => parseProjectDeclaration("apiVersion: dwi.dev/v1\nkind: Project\nspec:\n  boundaries:\n    generatedRoots: [/absolute]\n")).toThrow(/repository-relative/);
    expect(() => parseProjectDeclaration("apiVersion: dwi.dev/v1\nkind: Project\nspec:\n  boundaries:\n    generatedRoots: [. ]\n")).toThrow(/repository-relative/);
  });
});
