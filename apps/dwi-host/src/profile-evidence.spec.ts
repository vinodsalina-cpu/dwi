import { describe, expect, it } from "vitest";
import { isPrimaryPythonManifest, stackEvidenceLabel } from "./profile-evidence.js";

describe("DWI stack evidence", () => {
  it("does not classify incidental script, documentation, or CI tooling as Python runtime evidence", () => {
    expect(isPrimaryPythonManifest("scripts/requirements.txt")).toBe(false);
    expect(isPrimaryPythonManifest("docs/requirements.txt")).toBe(false);
    expect(isPrimaryPythonManifest(".github/requirements.txt")).toBe(false);
  });
  it("keeps root and deployable-component Python manifests as primary evidence", () => {
    expect(isPrimaryPythonManifest("pyproject.toml")).toBe(true);
    expect(isPrimaryPythonManifest("backend/requirements.txt")).toBe(true);
  });
  it("renders compact traceability", () => {
    expect(stackEvidenceLabel([{ stack: "React", relativePath: "package.json", reason: "dependency" }])).toContain("React: package.json");
  });
});
