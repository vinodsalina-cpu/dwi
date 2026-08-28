import { createHash } from "node:crypto";
import {
  WORKSPACE_MAX_DEPTH,
  WORKSPACE_MAX_FILES,
  WORKSPACE_MAX_FILE_BYTES,
  WORKSPACE_MAX_METADATA_BYTES,
  shouldIgnoreRetrievalPath,
  workspaceRetrievalPolicyDescriptor,
  type RepositoryInspection,
} from "@platform/domain-workspace";

// Keep this list aligned with the active first-party project-intelligence
// collector. Do not broaden retrieval with the legacy manifest-name registry:
// names that no active collector or importer consumes must never have their
// bodies read merely because they were historically recognized.
const activeCollectorMetadataNames = [
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lockb",
  "tsconfig.json",
  "pyproject.toml",
  "requirements.txt",
  "setup.py",
  "poetry.lock",
  "uv.lock",
  "go.mod",
  "go.sum",
  "go.work",
  "Cargo.toml",
  "Cargo.lock",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "gradle.properties",
  "gradle-wrapper.properties",
  "global.json",
  "Directory.Build.props",
  "Directory.Packages.props",
  "composer.json",
  "composer.lock",
  "CMakeLists.txt",
  "Makefile",
  "meson.build",
  ".shellcheckrc",
  ".terraform.lock.hcl",
  // Explicit unsupported-manifest reporting still consumes these names.
  "Gemfile",
  "Gemfile.lock",
  "pubspec.yaml",
] as const;

const supplementalMetadataNames = [
  "README",
  "README.md",
  "CODEOWNERS",
  "catalog-info.yaml",
  "catalog-info.yml",
  "devfile.yaml",
  "devfile.yml",
  "bom.json",
  "bom.xml",
  "*.cdx.json",
  "*.cdx.xml",
  "*.sln",
  "*.slnx",
  "*.csproj",
  "*.sh",
  "*.tf",
  "*.tf.json",
  "*.hcl",
] as const;

const lockfileMetadataNames = new Set([
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lockb",
  "Cargo.lock",
  "go.sum",
  "poetry.lock",
  "uv.lock",
  "Gemfile.lock",
  "composer.lock",
  ".terraform.lock.hcl",
]);

const supportingMetadataNames = new Set([
  "tsconfig.json",
  "gradle.properties",
  "gradle-wrapper.properties",
  "global.json",
  "Directory.Build.props",
  "Directory.Packages.props",
  ".shellcheckrc",
  "bom.json",
  "bom.xml",
  "*.cdx.json",
  "*.cdx.xml",
]);

const supplementalOnlyNames = new Set([
  "README",
  "README.md",
  "CODEOWNERS",
  "*.sh",
]);

export const WORKSPACE_INSPECTION_NAME_ONLY_PATTERNS = [
  "*.sh",
  "*.tf",
  "*.tf.json",
  "*.hcl",
] as const;

export const WORKSPACE_INSPECTION_CONTENT_EXCEPTIONS = [
  ".shellcheckrc",
  ".terraform.lock.hcl",
] as const;

export type WorkspaceInspectionPriority =
  | "project-manifest"
  | "supporting-metadata"
  | "lockfile"
  | "documentation-script";

export interface WorkspaceInspectionPriorityQuery {
  id: WorkspaceInspectionPriority;
  files: string[];
}

export const WORKSPACE_INSPECTION_POLICY_VERSION = "dwi.workspace-inspection.v3" as const;
export const WORKSPACE_INSPECTION_EXCLUDE_GLOB = "**/{node_modules,.git,.dwi,.dwi.*,.vscode-test,artifacts,.env*,dist,build,out,coverage,.next,.turbo,.cache,__pycache__,.venv,venv}/**";

export function workspaceInspectionPolicy() {
  return {
    version: WORKSPACE_INSPECTION_POLICY_VERSION,
    purposes: ["project-identity", "toolchain", "declared-workflows", "components", "documentation", "open-standards"],
    files: assessmentFileNames(),
    rootEntries: { namesOnly: true, content: false },
    excludeGlob: WORKSPACE_INSPECTION_EXCLUDE_GLOB,
    retrieval: workspaceRetrievalPolicyDescriptor,
    pathSafety: { rejectSymlinkFilesAndAncestors: true, selectedRootContainment: true },
    decoding: { text: "utf-8-fatal", binaryHashOnly: ["bun.lockb"] },
    contentAccess: {
      nameOnly: WORKSPACE_INSPECTION_NAME_ONLY_PATTERNS,
      boundedContentExceptions: WORKSPACE_INSPECTION_CONTENT_EXCEPTIONS,
      nameOnlyStatForPathSafety: true,
      nameOnlyIncludesByteLengthOrHash: false,
    },
    ordering: {
      strategy: "priority-class-then-shallow-depth-code-unit",
      priorityQueries: assessmentPriorityQueries(),
      deterministicWithinReturnedTier: true,
    },
    truncation: {
      reporting: "known-file-limit-omissions-lower-bound",
      lowerBoundField: "fileLimitOmittedLowerBound",
      overflowProbePerQuery: 1,
      depthOverflowSentinel: {
        glob: assessmentDepthOverflowGlob(),
        limit: 1,
        namesOnly: true,
        marksTruncated: true,
        omissionReason: "depth",
      },
    },
    execution: { projectCommands: false, probes: false, network: false },
    limits: {
      files: WORKSPACE_MAX_FILES,
      depth: WORKSPACE_MAX_DEPTH,
      fileBytes: WORKSPACE_MAX_FILE_BYTES,
      totalBytes: WORKSPACE_MAX_METADATA_BYTES,
    },
  } as const;
}

export function workspaceInspectionPolicyDigest(policy: unknown): string {
  return createHash("sha256").update(JSON.stringify(policy)).digest("hex");
}

export function workspaceInspectionScopeDigest(): string {
  return workspaceInspectionPolicyDigest(workspaceInspectionPolicy());
}

export interface WorkspaceInspectionIo<Path> {
  findFiles(glob: string, limit: number): Promise<readonly Path[]>;
  relativePath(path: Path): string;
  stat(path: Path): Promise<{ size: number; isSymbolicLink?: boolean }>;
  readFile(path: Path): Promise<Uint8Array>;
  readRootEntries(): Promise<readonly string[]>;
}

export interface CollectedWorkspaceInspection extends RepositoryInspection {
  skipped: Array<{
    path: string;
    reason: "depth" | "private" | "file-size" | "metadata-budget" | "file-limit" | "symlink" | "invalid-utf8";
  }>;
  metadataBytes: number;
  truncated: boolean;
  /** Known file-limit omissions; more candidates may exist behind provider limits. */
  fileLimitOmittedLowerBound: number;
}

const compareCodeUnits = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0;
const isBinaryManifest = (path: string): boolean => path.split("/").at(-1)?.toLowerCase() === "bun.lockb";
const wildcardNameMatches = (name: string, pattern: string): boolean => {
  const star = pattern.indexOf("*");
  return star >= 0 && name.startsWith(pattern.slice(0, star)) && name.endsWith(pattern.slice(star + 1));
};

export function assessmentFileNames(): string[] {
  return [...new Set([...activeCollectorMetadataNames, ...supplementalMetadataNames])].sort();
}

export function assessmentPriorityQueries(): WorkspaceInspectionPriorityQuery[] {
  const groups: Record<WorkspaceInspectionPriority, string[]> = {
    "project-manifest": [],
    "supporting-metadata": [],
    lockfile: [],
    "documentation-script": [],
  };
  for (const name of assessmentFileNames()) {
    if (lockfileMetadataNames.has(name)) groups.lockfile.push(name);
    else if (supportingMetadataNames.has(name)) groups["supporting-metadata"].push(name);
    else if (supplementalOnlyNames.has(name)) groups["documentation-script"].push(name);
    else groups["project-manifest"].push(name);
  }
  return [
    { id: "project-manifest", files: groups["project-manifest"] },
    { id: "supporting-metadata", files: groups["supporting-metadata"] },
    { id: "lockfile", files: groups.lockfile },
    { id: "documentation-script", files: groups["documentation-script"] },
  ];
}

export function assessmentGlob(): string {
  return `**/{${assessmentFileNames().join(",")}}`;
}

export function assessmentGlobAtDepth(depth: number): string {
  if (!Number.isInteger(depth) || depth < 0 || depth > WORKSPACE_MAX_DEPTH) throw new Error("Assessment depth is outside the bounded policy.");
  return `${"*/".repeat(depth)}{${assessmentFileNames().join(",")}}`;
}

/** A one-result sentinel for allowlisted evidence below the supported depth. */
export function assessmentDepthOverflowGlob(): string {
  return `${"*/".repeat(WORKSPACE_MAX_DEPTH + 1)}**/{${assessmentFileNames().join(",")}}`;
}

export function assessmentPriorityGlobAtDepth(
  priority: WorkspaceInspectionPriority,
  depth: number,
): string {
  if (!Number.isInteger(depth) || depth < 0 || depth > WORKSPACE_MAX_DEPTH) {
    throw new Error("Assessment depth is outside the bounded policy.");
  }
  const query = assessmentPriorityQueries().find(({ id }) => id === priority);
  if (!query) throw new Error("Assessment priority is outside the bounded policy.");
  return `${"*/".repeat(depth)}{${query.files.join(",")}}`;
}

export function assessmentDepth(relativePath: string): number {
  return relativePath.split("/").filter(Boolean).length - 1;
}

export function assessmentPriority(relativePath: string): WorkspaceInspectionPriority | undefined {
  const name = relativePath.replaceAll("\\", "/").split("/").at(-1);
  if (!name) return undefined;
  const queries = assessmentPriorityQueries();
  for (const query of queries) {
    if (query.files.some((pattern) => !pattern.includes("*") && pattern === name)) {
      return query.id;
    }
  }
  for (const query of queries) {
    if (query.files.some((pattern) => pattern.includes("*") && wildcardNameMatches(name, pattern))) {
      return query.id;
    }
  }
  return undefined;
}

export function isNameOnlyAssessmentPath(relativePath: string): boolean {
  const name = relativePath.replaceAll("\\", "/").split("/").at(-1);
  if (!name || WORKSPACE_INSPECTION_CONTENT_EXCEPTIONS.includes(
    name as typeof WORKSPACE_INSPECTION_CONTENT_EXCEPTIONS[number],
  )) {
    return false;
  }
  return WORKSPACE_INSPECTION_NAME_ONLY_PATTERNS.some((pattern) =>
    wildcardNameMatches(name, pattern));
}

export async function collectWorkspaceInspection<Path>(
  io: WorkspaceInspectionIo<Path>,
): Promise<CollectedWorkspaceInspection> {
  const manifests: RepositoryInspection["manifests"] = [];
  const skipped: CollectedWorkspaceInspection["skipped"] = [];
  let metadataBytes = 0;
  const selectedCandidates: Path[] = [];
  const seen = new Set<string>();
  const rejectedProviderPaths = new Set<string>();
  let truncated = false;
  let fileLimitOmittedLowerBound = 0;
  for (const query of assessmentPriorityQueries()) {
    for (let depth = 0; depth <= WORKSPACE_MAX_DEPTH; depth += 1) {
      const remaining = Math.max(0, WORKSPACE_MAX_FILES - selectedCandidates.length);
      const tier = [...await io.findFiles(
        assessmentPriorityGlobAtDepth(query.id, depth),
        remaining + 1,
      )]
        .filter((path) => {
          const relativePath = io.relativePath(path).replaceAll("\\", "/");
          if (assessmentDepth(relativePath) !== depth) return false;
          const priority = assessmentPriority(relativePath);
          if (
            priority === undefined &&
            shouldIgnoreRetrievalPath(relativePath) &&
            !rejectedProviderPaths.has(relativePath)
          ) {
            rejectedProviderPaths.add(relativePath);
            skipped.push({ path: relativePath, reason: "private" });
          }
          return priority === query.id;
        })
        .sort((left, right) => compareCodeUnits(io.relativePath(left), io.relativePath(right)));
      for (const path of tier) {
        const relativePath = io.relativePath(path).replaceAll("\\", "/");
        if (seen.has(relativePath)) continue;
        seen.add(relativePath);
        if (selectedCandidates.length < WORKSPACE_MAX_FILES) selectedCandidates.push(path);
        else {
          truncated = true;
          fileLimitOmittedLowerBound += 1;
          skipped.push({ path: relativePath, reason: "file-limit" });
        }
      }
    }
  }

  const depthOverflow = [...await io.findFiles(assessmentDepthOverflowGlob(), 1)]
    .filter((path) => {
      const relativePath = io.relativePath(path).replaceAll("\\", "/");
      return assessmentDepth(relativePath) > WORKSPACE_MAX_DEPTH &&
        assessmentPriority(relativePath) !== undefined &&
        !shouldIgnoreRetrievalPath(relativePath);
    })
    .sort((left, right) => compareCodeUnits(io.relativePath(left), io.relativePath(right)))
    .slice(0, 1);
  const omittedByDepth = depthOverflow[0];
  if (omittedByDepth !== undefined) {
    const relativePath = io.relativePath(omittedByDepth).replaceAll("\\", "/");
    truncated = true;
    skipped.push({ path: relativePath, reason: "depth" });
  }

  for (const path of selectedCandidates) {
    const relativePath = io.relativePath(path).replaceAll("\\", "/");
    if (assessmentDepth(relativePath) > WORKSPACE_MAX_DEPTH) {
      skipped.push({ path: relativePath, reason: "depth" });
      continue;
    }
    if (shouldIgnoreRetrievalPath(relativePath)) {
      skipped.push({ path: relativePath, reason: "private" });
      continue;
    }
    if (isNameOnlyAssessmentPath(relativePath)) {
      const { isSymbolicLink } = await io.stat(path);
      if (isSymbolicLink) {
        skipped.push({ path: relativePath, reason: "symlink" });
        continue;
      }
      manifests.push({
        path: relativePath,
        name: relativePath.split("/").at(-1) ?? relativePath,
      });
      continue;
    }
    const { size, isSymbolicLink } = await io.stat(path);
    if (isSymbolicLink) {
      skipped.push({ path: relativePath, reason: "symlink" });
      continue;
    }
    if (size > WORKSPACE_MAX_FILE_BYTES) {
      skipped.push({ path: relativePath, reason: "file-size" });
      continue;
    }
    if (metadataBytes + size > WORKSPACE_MAX_METADATA_BYTES) {
      skipped.push({ path: relativePath, reason: "metadata-budget" });
      continue;
    }
    const bytes = await io.readFile(path);
    if (bytes.byteLength > WORKSPACE_MAX_FILE_BYTES) {
      skipped.push({ path: relativePath, reason: "file-size" });
      continue;
    }
    if (metadataBytes + bytes.byteLength > WORKSPACE_MAX_METADATA_BYTES) {
      skipped.push({ path: relativePath, reason: "metadata-budget" });
      continue;
    }
    metadataBytes += bytes.byteLength;
    const contentSha256 = createHash("sha256").update(bytes).digest("hex");
    if (isBinaryManifest(relativePath)) {
      manifests.push({
        path: relativePath,
        name: relativePath.split("/").at(-1) ?? relativePath,
        contentSha256,
      });
      continue;
    }
    let content: string;
    try {
      content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      skipped.push({ path: relativePath, reason: "invalid-utf8" });
      continue;
    }
    manifests.push({
      path: relativePath,
      name: relativePath.split("/").at(-1) ?? relativePath,
      content,
      contentSha256,
    });
  }

  const workspaceRoots = [...new Set(manifests
    .map(({ path }) => path.includes("/") ? path.split("/")[0]! : "."))]
    .sort();
  return {
    rootEntries: [...await io.readRootEntries()].sort(),
    workspaceRoots,
    manifests,
    skipped,
    metadataBytes,
    truncated,
    fileLimitOmittedLowerBound,
  };
}
