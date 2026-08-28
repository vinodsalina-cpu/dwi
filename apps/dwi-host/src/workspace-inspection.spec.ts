import { describe, expect, it } from "vitest";
import {
  assessmentDepth,
  assessmentDepthOverflowGlob,
  assessmentFileNames,
  assessmentGlob,
  assessmentGlobAtDepth,
  assessmentPriority,
  assessmentPriorityGlobAtDepth,
  assessmentPriorityQueries,
  collectWorkspaceInspection,
  isNameOnlyAssessmentPath,
  workspaceInspectionPolicy,
  workspaceInspectionPolicyDigest,
  workspaceInspectionScopeDigest,
  type WorkspaceInspectionIo,
} from "./workspace-inspection.js";
import { WORKSPACE_MAX_DEPTH, WORKSPACE_MAX_FILES } from "@platform/domain-workspace";

function memoryIo(files: Record<string, string>): WorkspaceInspectionIo<string> {
  return {
    findFiles: async () => Object.keys(files),
    relativePath: (path) => path,
    stat: async (path) => ({ size: new TextEncoder().encode(files[path]!).byteLength }),
    readFile: async (path) => new TextEncoder().encode(files[path]!),
    readRootEntries: async () => ["src", "README.md", "go.mod"],
  };
}

function priorityAwareMemoryIo(files: Record<string, string>): WorkspaceInspectionIo<string> {
  const queryByGlob = new Map<string, { priority: ReturnType<typeof assessmentPriority>; depth: number }>();
  for (const { id } of assessmentPriorityQueries()) {
    for (let depth = 0; depth <= WORKSPACE_MAX_DEPTH; depth += 1) {
      queryByGlob.set(assessmentPriorityGlobAtDepth(id, depth), { priority: id, depth });
    }
  }
  return {
    ...memoryIo(files),
    findFiles: async (glob, limit) => {
      if (glob === assessmentDepthOverflowGlob()) {
        return Object.keys(files)
          .filter((path) => assessmentPriority(path) !== undefined && assessmentDepth(path) > WORKSPACE_MAX_DEPTH)
          .sort()
          .slice(0, limit);
      }
      const query = queryByGlob.get(glob);
      if (!query) return [];
      return Object.keys(files)
        .filter((path) => assessmentPriority(path) === query.priority && assessmentDepth(path) === query.depth)
        .sort()
        .slice(0, limit);
    },
  };
}

describe("bounded workspace inspection", () => {
  it("advertises cross-ecosystem and catalog metadata", () => {
    expect(assessmentFileNames()).toEqual(expect.arrayContaining([
      "package.json",
      "pyproject.toml",
      "go.mod",
      "Cargo.toml",
      "pom.xml",
      "composer.json",
      "CMakeLists.txt",
      "pubspec.yaml",
      "catalog-info.yaml",
      "devfile.yaml",
      "catalog-info.yml",
      "*.cdx.json",
      "*.csproj",
      "*.tf",
      "*.sh",
    ]));
    expect(assessmentGlob()).toMatch(/^\*\*\/\{/);
    expect(assessmentGlobAtDepth(0)).toMatch(/^\{/);
    expect(assessmentGlobAtDepth(2)).toMatch(/^\*\/\*\/\{/);
    expect(assessmentDepthOverflowGlob()).toMatch(/^\*\/\*\/\*\/\*\/\*\/\*\*\/\{/);
    expect(assessmentPriorityGlobAtDepth("project-manifest", 0)).toContain("package.json");
    expect(assessmentDepth("apps/api/go.mod")).toBe(2);
    expect(assessmentPriority("package.json")).toBe("project-manifest");
    expect(assessmentPriority("catalog-info.yaml")).toBe("project-manifest");
    expect(assessmentPriority("package-lock.json")).toBe("lockfile");
    expect(assessmentPriority("README.md")).toBe("documentation-script");
    expect(assessmentPriority("infra/.terraform.lock.hcl")).toBe("lockfile");
    expect(assessmentPriority("infra/main.hcl")).toBe("project-manifest");
    expect(isNameOnlyAssessmentPath("scripts/release.sh")).toBe(true);
    expect(isNameOnlyAssessmentPath("infra/main.tf")).toBe(true);
    expect(isNameOnlyAssessmentPath("infra/.terraform.lock.hcl")).toBe(false);
    expect(isNameOnlyAssessmentPath(".shellcheckrc")).toBe(false);
    const policy = workspaceInspectionPolicy();
    expect(policy.pathSafety.rejectSymlinkFilesAndAncestors).toBe(true);
    expect(policy.decoding.text).toBe("utf-8-fatal");
    expect(policy.contentAccess.nameOnly).toEqual(["*.sh", "*.tf", "*.tf.json", "*.hcl"]);
    expect(policy.contentAccess.nameOnlyStatForPathSafety).toBe(true);
    expect(policy.contentAccess.nameOnlyIncludesByteLengthOrHash).toBe(false);
    expect(policy.ordering.strategy).toBe("priority-class-then-shallow-depth-code-unit");
    expect(policy.ordering.priorityQueries.map(({ id }) => id)).toEqual([
      "project-manifest",
      "supporting-metadata",
      "lockfile",
      "documentation-script",
    ]);
    expect(policy.truncation.reporting).toBe("known-file-limit-omissions-lower-bound");
    expect(policy.truncation.depthOverflowSentinel).toMatchObject({
      limit: 1,
      namesOnly: true,
      marksTruncated: true,
      omissionReason: "depth",
    });
    expect(policy.retrieval.retrievalPrivatePattern).toContain("token");
    expect(workspaceInspectionScopeDigest()).toMatch(/^[a-f0-9]{64}$/);
    expect(workspaceInspectionPolicyDigest({ ...policy, purposes: [...policy.purposes, "changed-purpose"] })).not.toBe(workspaceInspectionScopeDigest());
  });

  it("collects deterministic content and records excluded evidence", async () => {
    const huge = "x".repeat(262_145);
    const inspection = await collectWorkspaceInspection(memoryIo({
      "go.mod": "module example.test/api\n\ngo 1.27\n",
      "apps/worker/Cargo.toml": "[package]\nname='worker'\n",
      "one/two/three/four/five/pyproject.toml": "[project]\nname='deep'\n",
      ".env.production": "SECRET=never",
      "README.md": huge,
    }));
    expect(inspection.manifests.map(({ path }) => path)).toEqual([
      "go.mod",
      "apps/worker/Cargo.toml",
    ]);
    expect(inspection.workspaceRoots).toEqual([".", "apps"]);
    expect(inspection.skipped).toEqual(expect.arrayContaining([
      { path: ".env.production", reason: "private" },
      { path: "README.md", reason: "file-size" },
    ]));
    expect(inspection.truncated).toBe(true);
    expect(inspection.fileLimitOmittedLowerBound).toBe(0);
    expect(inspection.skipped).toContainEqual({
      path: "one/two/three/four/five/pyproject.toml",
      reason: "depth",
    });
  });

  it("does not query or read legacy config bodies without an active collector", async () => {
    const files = {
      "package.json": "{}",
      "vite.config.js": "export default { secret: 'never read' }",
      "vite.config.ts": "export default { secret: 'never read' }",
      "webpack.config.js": "module.exports = { secret: 'never read' }",
    };
    const requestedGlobs: string[] = [];
    const stats: string[] = [];
    const reads: string[] = [];
    const base = memoryIo(files);
    const inspection = await collectWorkspaceInspection({
      ...base,
      findFiles: async (glob) => {
        requestedGlobs.push(glob);
        return Object.keys(files);
      },
      stat: async (path) => {
        stats.push(path);
        return base.stat(path);
      },
      readFile: async (path) => {
        reads.push(path);
        return base.readFile(path);
      },
    });

    expect(assessmentFileNames()).not.toEqual(expect.arrayContaining([
      "vite.config.js",
      "vite.config.ts",
      "webpack.config.js",
    ]));
    for (const name of ["vite.config.js", "vite.config.ts", "webpack.config.js"]) {
      expect(requestedGlobs.every((glob) => !glob.includes(name))).toBe(true);
      expect(assessmentPriority(name)).toBeUndefined();
    }
    expect(stats).toEqual(["package.json"]);
    expect(reads).toEqual(["package.json"]);
    expect(inspection.manifests.map(({ path }) => path)).toEqual(["package.json"]);
  });

  it("marks a complete-looking root incomplete when allowlisted evidence exists below depth four", async () => {
    const files = {
      "package.json": "{}",
      "one/two/three/four/five/go.mod": "module example.test/deep",
    };
    const requestedLimits: number[] = [];
    const inspection = await collectWorkspaceInspection({
      ...priorityAwareMemoryIo(files),
      findFiles: async (glob, limit) => {
        requestedLimits.push(limit);
        if (glob === assessmentDepthOverflowGlob()) {
          return ["one/two/three/four/five/go.mod"].slice(0, limit);
        }
        const query = assessmentPriorityQueries()
          .flatMap(({ id }) => Array.from({ length: WORKSPACE_MAX_DEPTH + 1 }, (_, depth) => ({
            glob: assessmentPriorityGlobAtDepth(id, depth),
            id,
            depth,
          })))
          .find((candidate) => candidate.glob === glob);
        if (!query) return [];
        return Object.keys(files)
          .filter((path) => assessmentPriority(path) === query.id && assessmentDepth(path) === query.depth)
          .slice(0, limit);
      },
    });

    expect(requestedLimits.at(-1)).toBe(1);
    expect(inspection.manifests.map(({ path }) => path)).toEqual(["package.json"]);
    expect(inspection.truncated).toBe(true);
    expect(inspection.skipped).toContainEqual({
      path: "one/two/three/four/five/go.mod",
      reason: "depth",
    });
  });

  it("reports candidate truncation instead of presenting a partial inventory as complete", async () => {
    const files = Object.fromEntries(Array.from({ length: WORKSPACE_MAX_FILES + 1 }, (_, index) => [
      `pkg-${String(index).padStart(4, "0")}/package.json`,
      "{}",
    ]));
    const requestedLimits: number[] = [];
    const io = memoryIo(files);
    const inspection = await collectWorkspaceInspection({
      ...io,
      findFiles: async (_glob, limit) => {
        requestedLimits.push(limit);
        return Object.keys(files).slice(0, limit);
      },
    });
    expect(requestedLimits).toContain(WORKSPACE_MAX_FILES + 1);
    expect(inspection.manifests).toHaveLength(WORKSPACE_MAX_FILES);
    expect(inspection.truncated).toBe(true);
    expect(inspection.fileLimitOmittedLowerBound).toBe(1);
    expect(inspection.skipped).toContainEqual({ path: "pkg-1000/package.json", reason: "file-limit" });
  });

  it("reserves the hard cap for manifests before querying lower-value scripts", async () => {
    const files = Object.fromEntries([
      ["package.json", "{}"],
      ["catalog-info.yaml", "kind: Component"],
      ["apps/api/go.mod", "module example.test/api"],
      ...Array.from({ length: WORKSPACE_MAX_FILES + 100 }, (_, index) => [
        `script-${String(index).padStart(4, "0")}.sh`,
        "#!/bin/sh",
      ]),
    ]);

    const inspection = await collectWorkspaceInspection(priorityAwareMemoryIo(files));

    expect(inspection.manifests).toHaveLength(WORKSPACE_MAX_FILES);
    expect(inspection.manifests.slice(0, 3).map(({ path }) => path)).toEqual([
      "catalog-info.yaml",
      "package.json",
      "apps/api/go.mod",
    ]);
    expect(inspection.truncated).toBe(true);
    expect(inspection.fileLimitOmittedLowerBound).toBe(1);
    expect(inspection.skipped.filter(({ reason }) => reason === "file-limit")).toHaveLength(1);
  });

  it("rechecks limits after reading and hashes binary lockfiles without decoding them", async () => {
    const oversized = new Uint8Array(262_145);
    const binary = new Uint8Array([0xff, 0x00, 0x61]);
    const inspection = await collectWorkspaceInspection({
      findFiles: async () => ["bun.lockb", "README.md"],
      relativePath: (path) => path,
      stat: async () => ({ size: 1 }),
      readFile: async (path) => path === "bun.lockb" ? binary : oversized,
      readRootEntries: async () => [],
    });
    expect(inspection.skipped).toContainEqual({ path: "README.md", reason: "file-size" });
    expect(inspection.manifests[0]).toMatchObject({
      path: "bun.lockb",
      contentSha256: "f9789675a25a87605b0d60387568e25cda7b568653ecdc42e9248588dc70acd5",
    });
    expect(inspection.manifests[0]).not.toHaveProperty("content");
  });

  it("collects broad scripts and infrastructure files by name without reading or hashing", async () => {
    const files = {
      "release.sh": "echo private command",
      "main.tf": "resource private_content {}",
      "variables.tf.json": "{\"private\":true}",
      "policy.hcl": "private-policy",
      ".shellcheckrc": "disable=SC1000",
      ".terraform.lock.hcl": "provider-lock-metadata",
    };
    const stats: string[] = [];
    const reads: string[] = [];
    const base = memoryIo(files);
    const inspection = await collectWorkspaceInspection({
      ...base,
      stat: async (path) => {
        stats.push(path);
        return base.stat(path);
      },
      readFile: async (path) => {
        reads.push(path);
        return base.readFile(path);
      },
    });

    for (const path of ["release.sh", "main.tf", "variables.tf.json", "policy.hcl"]) {
      expect(inspection.manifests.find((manifest) => manifest.path === path)).toEqual({
        path,
        name: path,
      });
    }
    expect(stats.sort()).toEqual([
      ".shellcheckrc",
      ".terraform.lock.hcl",
      "main.tf",
      "policy.hcl",
      "release.sh",
      "variables.tf.json",
    ]);
    expect(reads.sort()).toEqual([".shellcheckrc", ".terraform.lock.hcl"]);
    expect(inspection.manifests.find(({ path }) => path === ".shellcheckrc")).toHaveProperty("content");
    expect(inspection.manifests.find(({ path }) => path === ".terraform.lock.hcl"))
      .toHaveProperty("contentSha256");
  });

  it("rejects symlinked evidence before reading it", async () => {
    let read = false;
    const inspection = await collectWorkspaceInspection({
      findFiles: async () => ["package.json", "release.sh"],
      relativePath: (path) => path,
      stat: async () => ({ size: 2, isSymbolicLink: true }),
      readFile: async () => { read = true; return new TextEncoder().encode("{}"); },
      readRootEntries: async () => [],
    });
    expect(read).toBe(false);
    expect(inspection.manifests).toEqual([]);
    expect(inspection.skipped).toContainEqual({ path: "package.json", reason: "symlink" });
    expect(inspection.skipped).toContainEqual({ path: "release.sh", reason: "symlink" });
  });

  it("rejects invalid UTF-8 text instead of hashing lossy replacement text", async () => {
    const invalid = new Uint8Array([0x7b, 0xff, 0x7d]);
    const inspection = await collectWorkspaceInspection({
      findFiles: async () => ["package.json"],
      relativePath: (path) => path,
      stat: async () => ({ size: invalid.byteLength }),
      readFile: async () => invalid,
      readRootEntries: async () => [],
    });
    expect(inspection.manifests).toEqual([]);
    expect(inspection.skipped).toContainEqual({ path: "package.json", reason: "invalid-utf8" });
  });
});
