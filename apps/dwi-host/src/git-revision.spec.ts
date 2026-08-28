import { describe, expect, it } from "vitest";
import { gitRevisionChanges, parseGitRevision, parseSafeGitHeadReference } from "./git-revision.js";

describe("git revision parsing", () => {
  it("supports detached, loose, and packed refs without executing Git", () => {
    const commit = "A".repeat(40);
    expect(parseGitRevision(commit)).toEqual({ branch: null, commit: commit.toLowerCase(), dirty: null });
    expect(parseGitRevision("ref: refs/heads/main\n", commit)).toEqual({ branch: "main", commit: commit.toLowerCase(), dirty: null });
    expect(parseGitRevision("ref: refs/heads/release/v1", undefined, `${commit} refs/heads/release/v1\n`)).toEqual({ branch: "release/v1", commit: commit.toLowerCase(), dirty: null });
  });
  it("fails closed for malformed repository metadata", () => {
    expect(parseGitRevision("ref: ../outside", "malformed")).toEqual({ branch: null, commit: null, dirty: null });
    expect(parseSafeGitHeadReference("ref: refs/heads/../../../../outside")).toBeUndefined();
    expect(parseSafeGitHeadReference("ref: refs/heads/feature/valid")).toEqual({ fullReference: "refs/heads/feature/valid", branch: "feature/valid" });
  });
  it("reports commit, branch, dirty, and unverifiable freshness changes", () => {
    expect(gitRevisionChanges(
      { commit: "a".repeat(40), branch: "main", dirty: false },
      { commit: "b".repeat(40), branch: "feature", dirty: true },
    )).toEqual([
      "commit aaaaaaaa → bbbbbbbb",
      "branch main → feature",
      "working tree clean → dirty",
    ]);
    expect(gitRevisionChanges(
      { commit: "a".repeat(40), branch: "main", dirty: false },
      { commit: null, branch: null, dirty: null },
    )).toEqual([
      "current commit could not be verified",
      "current branch could not be verified",
      "working-tree state could not be verified",
    ]);
  });
});
