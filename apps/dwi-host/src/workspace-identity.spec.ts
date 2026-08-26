import { describe, expect, it } from "vitest";
import { selectWorkspaceRoot, workspaceIdentity } from "./workspace-identity.js";

describe("DWI workspace identity", () => {
  it("creates stable distinct scoped fingerprints without cross-workspace reuse", () => {
    expect(workspaceIdentity("file:///a/project/", "A").fingerprint).toBe(workspaceIdentity("file:///a/project", "A").fingerprint);
    expect(workspaceIdentity("file:///a/project", "A").fingerprint).not.toBe(workspaceIdentity("file:///b/project", "B").fingerprint);
  });
  it("requires an explicit multi-root selection", () => {
    expect(selectWorkspaceRoot([{ uri: "file:///one" }, { uri: "file:///two" }], "file:///two")?.uri).toBe("file:///two");
    expect(selectWorkspaceRoot([{ uri: "file:///one" }], "file:///missing")).toBeUndefined();
  });
});
