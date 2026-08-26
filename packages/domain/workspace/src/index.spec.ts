import { describe, expect, it } from "vitest";
import {
  WORKSPACE_MAX_DEPTH,
  WORKSPACE_MAX_FILE_BYTES,
  WORKSPACE_MAX_FILES,
  normalizeWorkspaceAssessmentPolicy,
  workspaceAssessmentClarifications,
  assessmentAnswersComplete,
  WORKSPACE_MAX_METADATA_BYTES,
  buildRepositoryAssessment,
  canonicalTextHash,
  computeWorkspaceFingerprint,
  hashWorkspacePath,
  inventoryIgnoreList,
  isAllowedAssessmentManifest,
  isGeneratedRootEntry,
  isManifestName,
  manifestFileNames,
  normalizeGitRemote,
  parseGitRemoteOutput,
  shouldIgnoreAssessmentEntry,
  shouldIgnoreRetrievalPath,
  shouldIgnoreRootEntry,
} from "./index.js";

describe("workspace assessment policy", () => {
  it("normalizes deterministic metadata and asks only required clarifications", () => {
    const input = {
      packageManagers: ["pnpm", " npm ", "pnpm"],
      frameworks: ["React", "React"],
      testFrameworks: ["Vitest"],
      declaredBuild: ["pnpm build"],
      declaredTest: [],
      declaredLint: ["pnpm lint"],
      declaredTypecheck: ["pnpm typecheck"],
    };
    expect(normalizeWorkspaceAssessmentPolicy(input)).toEqual({
      packageManagers: ["npm", "pnpm"],
      frameworks: ["React"],
      testFrameworks: ["Vitest"],
      declaredBuild: ["pnpm build"],
      declaredTest: [],
      declaredLint: ["pnpm lint"],
      declaredTypecheck: ["pnpm typecheck"],
    });
    const questions = workspaceAssessmentClarifications(input);
    expect(questions.map(({ id }) => id)).toEqual([
      "authoritative-package",
      "primary-test-command",
    ]);
    expect(
      assessmentAnswersComplete(questions, {
        "authoritative-package": "pnpm",
        "primary-test-command": "pnpm test",
      }),
    ).toBe(true);
    expect(
      assessmentAnswersComplete(questions, {
        "authoritative-package": "pnpm",
      }),
    ).toBe(false);
  });

  it("does not ask questions when authority and tests are unambiguous", () => {
    const questions = workspaceAssessmentClarifications({
      packageManagers: ["pnpm"],
      frameworks: [],
      testFrameworks: [],
      declaredBuild: [],
      declaredTest: ["pnpm test"],
      declaredLint: [],
      declaredTypecheck: [],
    });
    expect(questions).toEqual([]);
    expect(assessmentAnswersComplete(questions, {})).toBe(true);
  });
});

const hash = (value: string) => `hash:${value}`;

describe("workspace identity rules", () => {
  it("normalizes remote identities and remote output", () => {
    expect(normalizeGitRemote("git@GitHub.com:Org/Repo.git")).toBe(
      "github.com/org/repo",
    );
    expect(normalizeGitRemote("https://github.com/Org/Repo.git")).toBe(
      "github.com/org/repo",
    );
    expect(normalizeGitRemote(" local/repo.git ")).toBe("local/repo");
    expect(normalizeGitRemote("https://example.com/repo.git")).toBe(
      "example.com/repo",
    );
    expect(normalizeGitRemote(" ")).toBe("");
    expect(
      parseGitRemoteOutput(
        [
          "origin git@github.com:Org/Repo.git (fetch)",
          "origin https://github.com/org/repo.git (push)",
          "invalid",
        ].join("\n"),
      ),
    ).toEqual(["github.com/org/repo"]);
  });

  it("uses remote, git, and local fingerprint precedence", () => {
    const base = {
      selectedRootDirectory: " C:\\Repo ",
      hasGit: true,
      repositoryTopLevelPath: "/repo",
      currentBranchName: "main",
      headCommit: "abc",
      normalizedRemoteIdentities: ["github.com/org/repo"],
      workspaceFolderCount: 1,
    };
    expect(computeWorkspaceFingerprint(base, hash)).toEqual({
      canonicalIdentityType: "GIT_REMOTE",
      canonicalIdentityHash: "hash:github.com/org/repo",
      localRootUriHash: "hash:c:/repo",
    });
    expect(
      computeWorkspaceFingerprint(
        {
          ...base,
          normalizedRemoteIdentities: [],
        },
        hash,
      ),
    ).toMatchObject({
      canonicalIdentityType: "GIT_FINGERPRINT",
      canonicalIdentityHash: "hash:/repo|main|abc|1|git-fingerprint",
    });
    expect(
      computeWorkspaceFingerprint(
        {
          ...base,
          repositoryTopLevelPath: null,
          currentBranchName: null,
          headCommit: null,
          normalizedRemoteIdentities: [],
        },
        hash,
      ).canonicalIdentityHash,
    ).toBe("hash:|||1|git-fingerprint");
    expect(
      computeWorkspaceFingerprint(
        {
          ...base,
          hasGit: false,
          normalizedRemoteIdentities: [],
        },
        hash,
      ),
    ).toMatchObject({
      canonicalIdentityType: "LOCAL_WORKSPACE",
      canonicalIdentityHash: "hash: C:\\Repo ",
    });
    expect(canonicalTextHash(" ABC ", hash)).toBe("hash:abc");
    expect(hashWorkspacePath(" C:\\Repo ", hash)).toBe("hash:c:/repo");
  });
});

describe("workspace assessment policy", () => {
  it("exposes fixed ignore, manifest, traversal, and budget rules", () => {
    expect(shouldIgnoreRootEntry(".git")).toBe(true);
    expect(shouldIgnoreRootEntry("README.md")).toBe(false);
    expect(isManifestName("package.json")).toBe(true);
    expect(isManifestName("README.md")).toBe(false);
    expect(isAllowedAssessmentManifest("Cargo.toml")).toBe(true);
    expect(shouldIgnoreAssessmentEntry(".env", ".env")).toBe(true);
    expect(shouldIgnoreAssessmentEntry("src/index.ts", "index.ts")).toBe(false);
    expect(shouldIgnoreRetrievalPath("src/index.ts")).toBe(false);
    for (const privatePath of [
      ".env.local",
      "packages/app/node_modules/library/index.js",
      "nested/dist/bundle.js",
      ".ssh/id_ed25519",
      ".aws/credentials",
      ".npmrc",
      "certificates/client.pem",
      "config/auth-token.json",
      "../outside.ts",
      "/Users/alice/private.ts",
      "C:/Users/alice/private.ts",
      "file:///workspace/source.ts",
      "src/./source.ts",
      "src//source.ts",
      "src\\source.ts",
      "src/source\u0000.ts",
    ]) {
      expect(shouldIgnoreRetrievalPath(privatePath)).toBe(true);
    }
    expect(isGeneratedRootEntry("dist")).toBe(true);
    expect(isGeneratedRootEntry("src")).toBe(false);
    expect(inventoryIgnoreList.has("node_modules")).toBe(true);
    expect(manifestFileNames.has("go.mod")).toBe(true);
    expect([
      WORKSPACE_MAX_FILES,
      WORKSPACE_MAX_DEPTH,
      WORKSPACE_MAX_FILE_BYTES,
      WORKSPACE_MAX_METADATA_BYTES,
    ]).toEqual([1_000, 4, 262_144, 1_048_576]);
  });

  it("builds deterministic technology, command, security, and evidence facts", () => {
    const manifest = buildRepositoryAssessment({
      workspaceId: "ws-1",
      repositoryRevision: { headCommit: "abc", branch: "main", dirty: false },
      inspection: {
        rootEntries: ["packages", "apps"],
        workspaceRoots: ["packages", "apps"],
        manifests: [
          {
            path: "package.json",
            name: "package.json",
            content: JSON.stringify({
              packageManager: "pnpm@11",
              scripts: {
                build: "tsc",
                "test:unit": "vitest",
                lint: "eslint",
                typecheck: "tsc",
              },
              dependencies: { react: "1", next: "1", prisma: "1" },
              devDependencies: {
                vitest: "1",
                eslint: "1",
                prettier: "1",
                typescript: "1",
              },
            }),
          },
          { path: "pnpm-lock.yaml", name: "pnpm-lock.yaml" },
        ],
      },
    });
    expect(manifest.detected).toMatchObject({
      packageManagers: ["pnpm"],
      frameworks: ["next", "react"],
      testFrameworks: ["vitest"],
      buildTools: ["typescript"],
      linters: ["eslint"],
      formatters: ["prettier"],
      databaseTechnologies: ["prisma"],
    });
    expect(manifest.commands).toEqual({
      declaredBuild: ["package.json:build"],
      declaredTest: ["package.json:test:unit"],
      declaredLint: ["package.json:lint"],
      declaredTypecheck: ["package.json:typecheck"],
    });
    expect(manifest.securitySignals.dependencyLockfiles).toEqual([]);
    expect(manifest.evidence).toHaveLength(2);
    expect(
      manifest.evidence.every(({ sourceType }) => sourceType === "FILE_NAME"),
    ).toBe(true);
  });

  it("defaults package JSON projects to npm and ignores non-string scripts", () => {
    const manifest = buildRepositoryAssessment({
      workspaceId: "ws",
      repositoryRevision: { headCommit: null, branch: null, dirty: true },
      inspection: {
        rootEntries: [],
        workspaceRoots: [],
        manifests: [
          {
            path: "package.json",
            name: "package.json",
            content: JSON.stringify({ scripts: { build: "", test: 1 } }),
          },
        ],
      },
    });
    expect(manifest.detected.packageManagers).toEqual(["npm"]);
    expect(manifest.commands.declaredBuild).toEqual([]);
  });

  it("recognizes the remaining managers and empty-language branch", () => {
    const manifest = buildRepositoryAssessment({
      workspaceId: "polyglot",
      repositoryRevision: { headCommit: null, branch: null, dirty: false },
      inspection: {
        rootEntries: ["dist"],
        workspaceRoots: [],
        manifests: [
          { path: "package-lock.json", name: "package-lock.json" },
          { path: "yarn.lock", name: "yarn.lock" },
          { path: "bun.lockb", name: "bun.lockb" },
          { path: "Cargo.toml", name: "Cargo.toml" },
          { path: "go.mod", name: "go.mod" },
          { path: "nested/file.lock", name: "file.lock" },
        ],
      },
    });
    expect(manifest.detected.packageManagers).toEqual([
      "bun",
      "cargo",
      "go",
      "npm",
      "yarn",
    ]);
    expect(manifest.detected.languages).toEqual([]);
    expect(manifest.architectureSignals.generatedCodePaths).toEqual(["dist"]);
    expect(manifest.securitySignals.dependencyLockfiles).toEqual([
      "nested/file.lock",
      "yarn.lock",
    ]);
  });

  it("recognizes all supported package technology signals", () => {
    const dependencies = Object.fromEntries(
      ["vue", "svelte", "express", "nestjs", "jest", "sequelize"].map(
        (name) => [name, "1"],
      ),
    );
    const manifest = buildRepositoryAssessment({
      workspaceId: "signals",
      repositoryRevision: { headCommit: null, branch: null, dirty: false },
      inspection: {
        rootEntries: [],
        workspaceRoots: [],
        manifests: [
          {
            path: "package.json",
            name: "package.json",
            content: JSON.stringify({
              packageManager: "invalid@1",
              dependencies,
              scripts: {
                "build:app": "x",
                "lint:app": "x",
                "typecheck:app": "x",
                "test:app": "x",
              },
            }),
          },
        ],
      },
    });
    expect(manifest.detected.frameworks).toEqual([
      "express",
      "nestjs",
      "svelte",
      "vue",
    ]);
    expect(manifest.detected.testFrameworks).toEqual(["jest"]);
    expect(manifest.detected.databaseTechnologies).toEqual(["sequelize"]);
  });
});
