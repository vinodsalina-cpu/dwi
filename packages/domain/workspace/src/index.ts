export const inventoryIgnoreList = new Set([
  ".git",
  ".gitmodules",
  ".gitignore",
  ".github",
  ".idea",
  ".vscode",
  ".cache",
  ".parcel-cache",
  ".next",
  ".nuxt",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".nyc_output",
  ".turbo",
  "tmp",
  "temp",
]);

export const manifestFileNames = new Set([
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lockb",
  "tsconfig.json",
  "vite.config.js",
  "vite.config.ts",
  "webpack.config.js",
  "pyproject.toml",
  "requirements.txt",
  "setup.py",
  "Cargo.toml",
  "go.mod",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "gradle.properties",
  "composer.json",
  "Gemfile",
  "Makefile",
  "CMakeLists.txt",
  "composer.lock",
  "go.sum",
  "poetry.lock",
  "Gemfile.lock",
  "pubspec.yaml",
]);

export const WORKSPACE_MAX_FILES = 1_000;
export const WORKSPACE_MAX_DEPTH = 4;
export const WORKSPACE_MAX_FILE_BYTES = 256 * 1024;
export const WORKSPACE_MAX_METADATA_BYTES = 1024 * 1024;

export interface WorkspaceAssessmentPolicyInput {
  packageManagers: string[];
  frameworks: string[];
  testFrameworks: string[];
  declaredBuild: string[];
  declaredTest: string[];
  declaredLint: string[];
  declaredTypecheck: string[];
}

export interface WorkspaceClarification {
  id: string;
  category: "AUTHORITATIVE_PACKAGE" | "PRIMARY_TEST_COMMAND";
  prompt: string;
  reason: string;
  affectedPolicyRule: string;
  required: true;
  choices?: string[];
  allowShortAnswer?: true;
}

export function normalizeWorkspaceAssessmentPolicy(
  input: WorkspaceAssessmentPolicyInput,
): WorkspaceAssessmentPolicyInput {
  const normalized = (values: readonly string[]) =>
    [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
  return {
    packageManagers: normalized(input.packageManagers),
    frameworks: normalized(input.frameworks),
    testFrameworks: normalized(input.testFrameworks),
    declaredBuild: normalized(input.declaredBuild),
    declaredTest: normalized(input.declaredTest),
    declaredLint: normalized(input.declaredLint),
    declaredTypecheck: normalized(input.declaredTypecheck),
  };
}

export function workspaceAssessmentClarifications(
  input: WorkspaceAssessmentPolicyInput,
): WorkspaceClarification[] {
  const normalized = normalizeWorkspaceAssessmentPolicy(input);
  const questions: WorkspaceClarification[] = [];
  if (normalized.packageManagers.length > 1) {
    questions.push({
      id: "authoritative-package",
      category: "AUTHORITATIVE_PACKAGE",
      prompt: "Which package manager is authoritative?",
      reason: "Multiple package managers were detected.",
      affectedPolicyRule: "validation-commands",
      required: true,
      choices: normalized.packageManagers,
    });
  }
  if (normalized.declaredTest.length === 0) {
    questions.push({
      id: "primary-test-command",
      category: "PRIMARY_TEST_COMMAND",
      prompt: "What is the primary test command?",
      reason: "No declared test command was detected.",
      affectedPolicyRule: "required-tests",
      required: true,
      allowShortAnswer: true,
    });
  }
  return questions;
}

export function assessmentAnswersComplete(
  questions: readonly { id: string; required: boolean }[],
  answers: Readonly<Record<string, string>>,
): boolean {
  return questions
    .filter((question) => question.required)
    .every(
      (question) =>
        typeof answers[question.id] === "string" &&
        answers[question.id]!.trim().length > 0,
    );
}

export class RepositoryAssessmentError extends Error {}

const privateName =
  /(^|\/)(\.env(?:\..*)?|.*(?:secret|credential|private.?key|id_rsa).*)$/i;
const generatedName = /^(dist|build|coverage|generated|\.next|\.turbo)$/i;
const lockfileName = /\.(?:lock|\.sum)$/i;
const cacheDirectoryName = /(^|\/)(\.cache|\.tmp|tmp|temp)(\/|$)/i;
const hasControlCharacter = (value: string) =>
  [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
const retrievalPrivateName =
  /(^|\/)(?:\.npmrc|\.pypirc|\.netrc|\.git-credentials|\.aws(?:\/|$)|\.ssh(?:\/|$)|[^/]*(?:token|auth|secret|credential|private.?key)[^/]*|[^/]+\.(?:pem|key|p12|pfx|jks|keystore))$/i;

export function shouldIgnoreRootEntry(name: string): boolean {
  return inventoryIgnoreList.has(name);
}

export function isManifestName(name: string): boolean {
  return manifestFileNames.has(name);
}

export function shouldIgnoreAssessmentEntry(
  relativePath: string,
  name: string,
): boolean {
  return (
    !relativePath ||
    relativePath.startsWith("..") ||
    shouldIgnoreRootEntry(name) ||
    privateName.test(relativePath) ||
    generatedName.test(name) ||
    cacheDirectoryName.test(relativePath)
  );
}

export function shouldIgnoreRetrievalPath(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/g, "/");
  const segments = normalized.split("/");
  return (
    !normalized ||
    normalized !== relativePath ||
    normalized.startsWith("/") ||
    /^[a-z][a-z0-9+.-]*:/i.test(normalized) ||
    hasControlCharacter(normalized) ||
    segments.some(
      (segment) => !segment || segment === "." || segment === "..",
    ) ||
    segments.some((segment) => inventoryIgnoreList.has(segment)) ||
    segments.some((segment) => segment === ".ssh" || segment === ".aws") ||
    shouldIgnoreAssessmentEntry(normalized, segments.at(-1) ?? "") ||
    retrievalPrivateName.test(normalized)
  );
}

export function isAllowedAssessmentManifest(name: string): boolean {
  return isManifestName(name);
}

export function isGeneratedRootEntry(name: string): boolean {
  return generatedName.test(name);
}

export type CanonicalIdentityType =
  "GIT_REMOTE" | "GIT_FINGERPRINT" | "LOCAL_WORKSPACE";
export interface WorkspaceFingerprintInput {
  selectedRootDirectory: string;
  hasGit: boolean;
  repositoryTopLevelPath: string | null;
  currentBranchName: string | null;
  headCommit: string | null;
  normalizedRemoteIdentities: string[];
  workspaceFolderCount: number;
}
export interface WorkspaceFingerprint {
  canonicalIdentityType: CanonicalIdentityType;
  canonicalIdentityHash: string;
  localRootUriHash: string;
}
export type WorkspaceTextHasher = (value: string) => string;

export function canonicalTextHash(
  text: string,
  hash: WorkspaceTextHasher,
): string {
  return hash(text.trim().toLowerCase());
}

export function hashWorkspacePath(
  uri: string,
  hash: WorkspaceTextHasher,
): string {
  return hash(uri.trim().replace(/\\/g, "/").toLowerCase());
}

export function computeWorkspaceFingerprint(
  input: WorkspaceFingerprintInput,
  hash: WorkspaceTextHasher,
): WorkspaceFingerprint {
  const localRootUriHash = hashWorkspacePath(input.selectedRootDirectory, hash);
  if (input.normalizedRemoteIdentities.length > 0) {
    return {
      canonicalIdentityType: "GIT_REMOTE",
      canonicalIdentityHash: canonicalTextHash(
        input.normalizedRemoteIdentities.join("\n"),
        hash,
      ),
      localRootUriHash,
    };
  }
  if (input.hasGit) {
    return {
      canonicalIdentityType: "GIT_FINGERPRINT",
      canonicalIdentityHash: hash(
        [
          input.repositoryTopLevelPath ?? "",
          input.currentBranchName ?? "",
          input.headCommit ?? "",
          input.workspaceFolderCount.toString(),
          "git-fingerprint",
        ].join("|"),
      ),
      localRootUriHash,
    };
  }
  return {
    canonicalIdentityType: "LOCAL_WORKSPACE",
    canonicalIdentityHash: hash(input.selectedRootDirectory),
    localRootUriHash,
  };
}

function normalizeBare(value: string): string {
  return value
    .replace(/^[^/]*@([^:/]+):?/, "")
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")
    .replace(/\.git$/i, "")
    .toLowerCase();
}

function asNormalizedRemote(hostPart: string, pathPart: string): string {
  const normalizedPath = normalizeBare(pathPart).replace(/^\/+/, "");
  const [hostPrefix, ...pathSegments] = normalizedPath.split("/");
  if (!hostPrefix) return "";
  const finalPath = (
    pathSegments.length === 0
      ? hostPrefix
      : `${hostPrefix}/${pathSegments.join("/")}`
  )
    .replace(/\.git$/i, "")
    .replace(/\/+$/, "");
  return `${hostPart.toLowerCase()}/${finalPath}`.toLowerCase();
}

export function normalizeGitRemote(remote: string): string {
  const trimmed = remote.trim();
  if (!trimmed) return "";
  if (/^[^:@\s]+@[^:]+:/.test(trimmed) && !trimmed.includes("://")) {
    const match = trimmed.match(/^[^@:\s]+@([^:]+):(.+)$/);
    return match?.[1] && match[2] ? asNormalizedRemote(match[1], match[2]) : "";
  }
  try {
    const parsed = new URL(trimmed);
    return asNormalizedRemote(parsed.host, parsed.pathname);
  } catch {
    return normalizeBare(trimmed);
  }
}

export function parseGitRemoteOutput(output: string): string[] {
  const line = /^(.+?)\s+(.+?)\s+\((fetch|push)\)$/;
  return output
    .trim()
    .split("\n")
    .map((value) => line.exec(value))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => normalizeGitRemote(match[2] ?? ""))
    .filter(Boolean)
    .filter((value, index, all) => all.indexOf(value) === index)
    .sort();
}

export interface RepositoryAssessmentManifest {
  schemaVersion: 1;
  workspaceId: string;
  repositoryRevision: {
    headCommit: string | null;
    branch: string | null;
    dirty: boolean;
  };
  topology: {
    rootEntries: string[];
    workspaceRoots: string[];
    manifestFiles: string[];
  };
  detected: {
    languages: Array<{ name: string; fileCount: number }>;
    packageManagers: string[];
    frameworks: string[];
    testFrameworks: string[];
    buildTools: string[];
    linters: string[];
    formatters: string[];
    databaseTechnologies: string[];
  };
  commands: {
    declaredBuild: string[];
    declaredTest: string[];
    declaredLint: string[];
    declaredTypecheck: string[];
  };
  architectureSignals: {
    applicationTypes: string[];
    serviceBoundaries: string[];
    generatedCodePaths: string[];
  };
  securitySignals: {
    secretFileNamesFound: string[];
    dependencyLockfiles: string[];
  };
  evidence: Array<{
    fact: string;
    sourcePath: string;
    sourceType: "FILE_NAME";
    confidence: number;
  }>;
}

export interface RepositoryInspection {
  rootEntries: string[];
  workspaceRoots: string[];
  manifests: Array<{ path: string; name: string; content?: string }>;
}

function parseScripts(scripts: Record<string, unknown>) {
  const result = {
    build: [] as string[],
    test: [] as string[],
    lint: [] as string[],
    typecheck: [] as string[],
  };
  for (const [name, script] of Object.entries(scripts)) {
    if (typeof script !== "string" || !script.trim()) continue;
    if (/^build/i.test(name) || /(^|:)build([A-Z]|$)/.test(name))
      result.build.push(name);
    else if (/^typecheck/i.test(name) || /(^|:)typecheck([A-Z]|$)/.test(name))
      result.typecheck.push(name);
    else if (/^lint/i.test(name) || /(^|:)lint([A-Z]|$)/.test(name))
      result.lint.push(name);
    else if (/^test/i.test(name) || /(^|:)test([A-Z]|$)/.test(name))
      result.test.push(name);
  }
  return result;
}

export function buildRepositoryAssessment(input: {
  workspaceId: string;
  repositoryRevision: RepositoryAssessmentManifest["repositoryRevision"];
  inspection: RepositoryInspection;
}): RepositoryAssessmentManifest {
  const packageManagers = new Set<string>();
  const frameworks = new Set<string>();
  const testFrameworks = new Set<string>();
  const buildTools = new Set<string>();
  const linters = new Set<string>();
  const formatters = new Set<string>();
  const databaseTechnologies = new Set<string>();
  const commands = {
    build: [] as string[],
    test: [] as string[],
    lint: [] as string[],
    typecheck: [] as string[],
  };
  let sawPackageJson = false;
  for (const manifest of input.inspection.manifests) {
    if (manifest.name === "pnpm-lock.yaml") packageManagers.add("pnpm");
    if (manifest.name === "package-lock.json") packageManagers.add("npm");
    if (manifest.name === "yarn.lock") packageManagers.add("yarn");
    if (manifest.name === "bun.lockb") packageManagers.add("bun");
    if (manifest.name === "Cargo.toml") packageManagers.add("cargo");
    if (manifest.name === "go.mod") packageManagers.add("go");
    if (manifest.name !== "package.json") continue;
    sawPackageJson = true;
    const parsed = JSON.parse(manifest.content ?? "") as Record<
      string,
      unknown
    >;
    const scripts =
      typeof parsed.scripts === "object" && parsed.scripts
        ? (parsed.scripts as Record<string, unknown>)
        : {};
    const dependencies = {
      ...(typeof parsed.dependencies === "object" && parsed.dependencies
        ? parsed.dependencies
        : {}),
      ...(typeof parsed.devDependencies === "object" && parsed.devDependencies
        ? parsed.devDependencies
        : {}),
    };
    const declaredManager =
      typeof parsed.packageManager === "string"
        ? parsed.packageManager.split("@", 1)[0]?.toLowerCase()
        : undefined;
    if (
      declaredManager &&
      ["pnpm", "npm", "yarn", "bun"].includes(declaredManager)
    )
      packageManagers.add(declaredManager);
    for (const [name, target] of [
      ["react", frameworks],
      ["next", frameworks],
      ["vue", frameworks],
      ["svelte", frameworks],
      ["express", frameworks],
      ["nestjs", frameworks],
      ["vitest", testFrameworks],
      ["jest", testFrameworks],
      ["eslint", linters],
      ["prettier", formatters],
      ["typescript", buildTools],
      ["prisma", databaseTechnologies],
      ["sequelize", databaseTechnologies],
    ] as const)
      if (name in dependencies) target.add(name);
    const found = parseScripts(scripts);
    for (const kind of ["build", "test", "lint", "typecheck"] as const) {
      commands[kind].push(
        ...found[kind].map((name) => `${manifest.path}:${name}`),
      );
    }
  }
  if (sawPackageJson && packageManagers.size === 0) packageManagers.add("npm");
  const paths = input.inspection.manifests.map(({ path }) => path).sort();
  const roots = [...input.inspection.workspaceRoots].sort();
  const unique = (values: string[]) => [...new Set(values)].sort();
  return {
    schemaVersion: 1,
    workspaceId: input.workspaceId,
    repositoryRevision: input.repositoryRevision,
    topology: {
      rootEntries: [...input.inspection.rootEntries].sort(),
      workspaceRoots: roots,
      manifestFiles: paths,
    },
    detected: {
      languages: paths.includes("package.json")
        ? [{ name: "TypeScript/JavaScript", fileCount: 1 }]
        : [],
      packageManagers: [...packageManagers].sort(),
      frameworks: [...frameworks].sort(),
      testFrameworks: [...testFrameworks].sort(),
      buildTools: [...buildTools].sort(),
      linters: [...linters].sort(),
      formatters: [...formatters].sort(),
      databaseTechnologies: [...databaseTechnologies].sort(),
    },
    commands: {
      declaredBuild: unique(commands.build),
      declaredTest: unique(commands.test),
      declaredLint: unique(commands.lint),
      declaredTypecheck: unique(commands.typecheck),
    },
    architectureSignals: {
      applicationTypes: [...frameworks],
      serviceBoundaries: roots,
      generatedCodePaths:
        input.inspection.rootEntries.filter(isGeneratedRootEntry),
    },
    securitySignals: {
      secretFileNamesFound: [],
      dependencyLockfiles: paths.filter((value) => lockfileName.test(value)),
    },
    evidence: paths.map((path) => ({
      fact: `manifest:${path.split("/").at(-1) ?? path}`,
      sourcePath: path,
      sourceType: "FILE_NAME",
      confidence: 1,
    })),
  };
}
