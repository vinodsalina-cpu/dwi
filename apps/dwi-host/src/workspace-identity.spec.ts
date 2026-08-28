import { describe, expect, it } from "vitest";
import { gitOriginFromConfig, selectWorkspaceRoot, workspaceIdentity } from "./workspace-identity.js";

describe("DWI workspace identity", () => {
  it("creates stable distinct scoped fingerprints without cross-workspace reuse", () => {
    expect(workspaceIdentity("file:///a/project/", "A").fingerprint).toBe(workspaceIdentity("file:///a/project", "A").fingerprint);
    expect(workspaceIdentity("file:///a/project/", "A").localFingerprint).toBe(workspaceIdentity("file:///a/project", "A").localFingerprint);
    expect(workspaceIdentity("file:///a/project", "A").fingerprint).not.toBe(workspaceIdentity("file:///b/project", "B").fingerprint);
  });
  it("uses a normalized remote before the canonical folder fallback", () => {
    expect(workspaceIdentity("file:///a", "A", "git@github.com:Owner/Repo.git").fingerprint).toBe(workspaceIdentity("file:///moved", "B", "https://github.com/Owner/Repo").fingerprint);
    expect(workspaceIdentity("file:///a", "A", "git@github.com:Owner/Repo.git").localFingerprint).not.toBe(workspaceIdentity("file:///moved", "B", "https://github.com/Owner/Repo").localFingerprint);
    expect(workspaceIdentity("file:///a", "A").kind).toBe("canonical-folder");
    expect(gitOriginFromConfig('[remote "origin"]\n\turl = https://github.com/owner/repo.git\n')).toBe("https://github.com/owner/repo.git");
  });
  it("scopes two selected roots in the same remote repository independently", () => {
    const api = workspaceIdentity("file:///repo/apps/api", "api", "https://github.com/owner/repo.git", "apps/api");
    const web = workspaceIdentity("file:///repo/apps/web", "web", "https://github.com/owner/repo.git", "apps/web");
    expect(api.repository).toBe("https://github.com/owner/repo");
    expect(api.sourceRoot).toBe("apps/api");
    expect(api.fingerprint).not.toBe(web.fingerprint);
  });
  it("removes embedded remote credentials and rejects non-network remotes", () => {
    const identity = workspaceIdentity("file:///a", "A", "https://token:secret@GitHub.com/Owner/Repo.git?credential=leak");
    expect(identity.kind).toBe("remote");
    expect(identity.value).toBe("https://github.com/Owner/Repo");
    expect(identity.value).not.toMatch(/token|secret|credential/);
    expect(workspaceIdentity("file:///a", "A", "file:///private/repo").kind).toBe("canonical-folder");
    expect(workspaceIdentity("file:///a", "A", "https://git.example.test/Team/Repo").fingerprint).not.toBe(workspaceIdentity("file:///a", "A", "https://git.example.test/team/repo").fingerprint);
  });
  it("requires an explicit multi-root selection", () => {
    expect(selectWorkspaceRoot([{ uri: "file:///one" }, { uri: "file:///two" }], "file:///two")?.uri).toBe("file:///two");
    expect(selectWorkspaceRoot([{ uri: "file:///one" }], "file:///missing")).toBeUndefined();
  });
});
