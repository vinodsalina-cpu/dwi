import { createHash } from "node:crypto";
import { posix } from "node:path";

import {
  safeProbesForEcosystems,
  type SafeProbeDescriptor,
  type SafeProbeEcosystem,
} from "./safe-probes.js";

export const PROJECT_INTELLIGENCE_SCHEMA_VERSION = 1 as const;
export const PROJECT_INTELLIGENCE_COLLECTOR = "dwi-first-party-packs@1.0.0";
export const PROJECT_INTELLIGENCE_MAX_FILES = 1_000;
export const PROJECT_INTELLIGENCE_MAX_FILE_BYTES = 256 * 1024;
export const PROJECT_INTELLIGENCE_MAX_TOTAL_BYTES = 1024 * 1024;

export const SUPPORTED_PROJECT_FILE_GLOBS = [
  "**/package.json",
  "**/{package-lock.json,pnpm-lock.yaml,yarn.lock,bun.lockb,tsconfig.json}",
  "**/{pyproject.toml,requirements.txt,setup.py,poetry.lock,uv.lock}",
  "**/{go.mod,go.sum,go.work}",
  "**/{Cargo.toml,Cargo.lock}",
  "**/{pom.xml,build.gradle,build.gradle.kts,gradle.properties,gradle-wrapper.properties}",
  "**/*.{sln,slnx,csproj}",
  "**/{global.json,Directory.Build.props,Directory.Packages.props}",
  "**/{composer.json,composer.lock}",
  "**/{CMakeLists.txt,Makefile,meson.build}",
  "**/{.shellcheckrc,*.sh}",
  "**/{*.tf,*.tf.json,*.hcl,.terraform.lock.hcl}",
] as const;

const supportedExactNames = new Set([
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
]);

export const KNOWN_UNSUPPORTED_PROJECT_MANIFESTS = {
  Gemfile: { ecosystem: "ruby", displayName: "Ruby/Bundler" },
  "Gemfile.lock": { ecosystem: "ruby", displayName: "Ruby/Bundler" },
  "pubspec.yaml": { ecosystem: "dart", displayName: "Dart/Flutter pub" },
} as const;

export function isKnownUnsupportedProjectEvidencePath(path: string): boolean {
  const normalized = path.replace(/\\/g, "/");
  const name = normalized.split("/").at(-1) ?? "";
  return Object.hasOwn(KNOWN_UNSUPPORTED_PROJECT_MANIFESTS, name);
}

export function isSupportedProjectEvidencePath(path: string): boolean {
  const normalized = path.replace(/\\/g, "/");
  const name = normalized.split("/").at(-1) ?? "";
  return (
    supportedExactNames.has(name) ||
    /\.(?:sln|slnx|csproj|sh|tf|hcl)$/i.test(name) ||
    /\.tf\.json$/i.test(name)
  );
}

export interface ProjectEvidenceInput {
  path: string;
  name?: string;
  content?: string;
  /** SHA-256 of the original bytes. Prefer this for binary or lossy-decoded files. */
  contentSha256?: string;
}

export interface ProjectIntelligenceInput {
  workspaceId: string;
  projectName: string;
  manifests: readonly ProjectEvidenceInput[];
  rootEntries?: readonly string[];
  workspaceRoots?: readonly string[];
  revision?: {
    commit?: string | null;
    branch?: string | null;
    dirty?: boolean;
  };
}

export type ProjectFactConfidence = "high" | "medium";

export interface ProjectFactRootBinding {
  root: string;
  confidence: ProjectFactConfidence;
  evidenceRefs: string[];
}

export interface ProjectDetectedFact {
  id: string;
  name: string;
  confidence: ProjectFactConfidence;
  roots: string[];
  evidenceRefs: string[];
  /** Root-scoped provenance retained alongside the aggregate compatibility fields. */
  rootBindings: ProjectFactRootBinding[];
}

export interface ProjectCommand {
  id: string;
  kind: "build" | "test" | "lint" | "typecheck" | "format" | "validate";
  argv: string[];
  cwd: string;
  origin: "declared" | "inferred";
  sourcePath: string;
  evidenceRefs: string[];
}

export interface ProjectComponent {
  id: string;
  name: string;
  root: string;
  languages: string[];
  ecosystems: string[];
  evidenceRefs: string[];
}

export interface ProjectEvidence {
  id: string;
  kind: "manifest" | "lockfile" | "configuration" | "source";
  path: string;
  selector: "file";
  byteLength: number;
  contentSha256: string | null;
  parser: string;
  observedFacts: string[];
}

export interface ProjectDiagnostic {
  schemaVersion: 1;
  code:
    | "MALFORMED_MANIFEST"
    | "FILENAME_ONLY_EVIDENCE"
    | "AMBIGUOUS_PACKAGE_MANAGER"
    | "UNDECLARED_PACKAGE_MANAGER"
    | "UNSUPPORTED_MANIFEST"
    | "UNSUPPORTED_PROJECT";
  severity: "warning";
  requiresVerification: boolean;
  path?: string;
  candidates?: string[];
  message: string;
}

export type ProjectCoverageState = "complete" | "partial" | "unknown";

export interface ProjectCoverage {
  overall: "complete" | "partial" | "unsupported";
  dimensions: {
    identity: ProjectCoverageState;
    ecosystem: ProjectCoverageState;
    toolchain: ProjectCoverageState;
    verification: ProjectCoverageState;
    architecture: ProjectCoverageState;
  };
  unknowns: string[];
}

export interface ProjectIntelligenceSnapshot {
  schemaVersion: typeof PROJECT_INTELLIGENCE_SCHEMA_VERSION;
  collector: typeof PROJECT_INTELLIGENCE_COLLECTOR;
  workspaceId: string;
  projectName: string;
  revision: {
    commit: string | null;
    branch: string | null;
    dirty: boolean | null;
  };
  rootEntries: string[];
  workspaceRoots: string[];
  languages: ProjectDetectedFact[];
  ecosystems: ProjectDetectedFact[];
  frameworks: ProjectDetectedFact[];
  testFrameworks: ProjectDetectedFact[];
  toolchains: ProjectDetectedFact[];
  commands: ProjectCommand[];
  components: ProjectComponent[];
  evidence: ProjectEvidence[];
  safeProbes: SafeProbeDescriptor[];
  diagnostics: ProjectDiagnostic[];
  coverage: ProjectCoverage;
}

export class ProjectIntelligenceInputError extends Error {}

interface NormalizedFile {
  path: string;
  name: string;
  root: string;
  content?: string;
  contentSha256?: string;
  evidenceId: string;
}

interface MutableFact {
  id: string;
  name: string;
  confidence: ProjectFactConfidence;
  roots: Set<string>;
  evidenceRefs: Set<string>;
  rootBindings: Map<
    string,
    { confidence: ProjectFactConfidence; evidenceRefs: Set<string> }
  >;
}

type FactCategory =
  | "language"
  | "ecosystem"
  | "framework"
  | "test-framework"
  | "toolchain";

const sha256 = (value: string) =>
  createHash("sha256").update(value, "utf8").digest("hex");

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizedContentSha256(value: string | undefined, path: string): string | undefined {
  if (value === undefined) return undefined;
  const normalized = value.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    throw new ProjectIntelligenceInputError(
      `Invalid contentSha256 for ${path}; expected a raw 64-character SHA-256 digest.`,
    );
  }
  return normalized;
}

function normalizedIdentity(value: string, field: string): string {
  const result = value.trim();
  if (!result) throw new ProjectIntelligenceInputError(`${field} is required.`);
  if ([...result].some((character) => character.charCodeAt(0) < 32)) {
    throw new ProjectIntelligenceInputError(`${field} contains control characters.`);
  }
  return result;
}

function normalizedPath(value: string): string {
  if (!value || value.includes("\\") || value.startsWith("/")) {
    throw new ProjectIntelligenceInputError(`Invalid evidence path: ${value}`);
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) {
    throw new ProjectIntelligenceInputError(`Invalid evidence path: ${value}`);
  }
  const segments = value.split("/");
  if (
    segments.some(
      (segment) =>
        !segment ||
        segment === "." ||
        segment === ".." ||
        [...segment].some((character) => character.charCodeAt(0) < 32),
    )
  ) {
    throw new ProjectIntelligenceInputError(`Invalid evidence path: ${value}`);
  }
  return segments.join("/");
}

function normalizeDirectory(value: string): string {
  if (value === ".") return value;
  return normalizedPath(value).replace(/\/$/, "");
}

function fileRoot(path: string): string {
  if (path.endsWith("/gradle/wrapper/gradle-wrapper.properties")) {
    const projectRoot = path.slice(
      0,
      -"/gradle/wrapper/gradle-wrapper.properties".length,
    );
    return projectRoot || ".";
  }
  const directory = posix.dirname(path);
  return directory === "." ? "." : directory;
}

function rootRelativeFilePath(file: Pick<NormalizedFile, "path" | "root" | "name">): string {
  const relative = posix.relative(file.root, file.path);
  return relative || file.name;
}

function evidenceKind(path: string): ProjectEvidence["kind"] {
  const name = posix.basename(path);
  if (/\.(?:sh)$/i.test(name)) return "source";
  if (
    /(?:^|[-.])lock(?:\.|$)/i.test(name) ||
    name === "go.sum" ||
    name === "Cargo.lock"
  )
    return "lockfile";
  if (
    name === "tsconfig.json" ||
    name === ".shellcheckrc" ||
    /\.(?:tf|hcl)$/i.test(name) ||
    name === "gradle.properties" ||
    name === "gradle-wrapper.properties"
  )
    return "configuration";
  return "manifest";
}

type EvidenceParseState = "valid" | "filename-only" | "malformed";

const filenameOnlyFactNames = new Set([
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lockb",
  "poetry.lock",
  "uv.lock",
  "go.sum",
  "go.work",
  "Cargo.lock",
  "gradle.properties",
  "gradle-wrapper.properties",
  "global.json",
  "Directory.Build.props",
  "Directory.Packages.props",
  "composer.lock",
  ".shellcheckrc",
  ".terraform.lock.hcl",
]);

function nonJsonEvidenceParseState(file: NormalizedFile): EvidenceParseState {
  const content = file.content?.trim();
  if (!content) return "filename-only";
  if (file.name === "go.mod")
    return /^module\s+\S+/m.test(content) ? "valid" : "malformed";
  if (file.name === "Cargo.toml")
    return /^\s*\[(?:package|workspace)\]\s*$/m.test(content)
      ? "valid"
      : "malformed";
  if (file.name === "pom.xml")
    return /<project(?:\s|>)/i.test(content) && /<\/project\s*>/i.test(content)
      ? "valid"
      : "malformed";
  if (file.name === "pyproject.toml")
    return /^\s*\[(?:project|build-system|tool\.[^\]]+)\]\s*$/m.test(content)
      ? "valid"
      : "malformed";
  if (file.name === "setup.py")
    return /\bsetup\s*\(/.test(content) ? "valid" : "malformed";
  if (file.name === "build.gradle" || file.name === "build.gradle.kts")
    return /\b(?:plugins|dependencies|apply\s+plugin|group|version)\b/.test(content)
      ? "valid"
      : "malformed";
  if (/\.csproj$/i.test(file.name))
    return /<Project(?:\s|>)/i.test(content) ? "valid" : "malformed";
  if (/\.sln$/i.test(file.name))
    return /Microsoft Visual Studio Solution File/i.test(content)
      ? "valid"
      : "malformed";
  if (/\.slnx$/i.test(file.name))
    return /<Solution(?:\s|>)/i.test(content) ? "valid" : "malformed";
  if (file.name === "CMakeLists.txt")
    return /\b(?:cmake_minimum_required|project)\s*\(/i.test(content)
      ? "valid"
      : "malformed";
  if (file.name === "meson.build")
    return /\bproject\s*\(/i.test(content) ? "valid" : "malformed";
  if (file.name === "Makefile")
    return /^[A-Za-z0-9_.%/-]+\s*:/m.test(content) ? "valid" : "malformed";
  return "valid";
}

function factValues(map: Map<string, MutableFact>): ProjectDetectedFact[] {
  return [...map.values()]
    .map((fact) => {
      const rootBindings = [...fact.rootBindings.entries()]
        .map(([root, binding]) => ({
          root,
          confidence: binding.confidence,
          evidenceRefs: [...binding.evidenceRefs].sort(),
        }))
        .sort((left, right) => compareCodeUnits(left.root, right.root));
      const confidence: ProjectFactConfidence = rootBindings.some(
        (binding) => binding.confidence === "medium",
      )
        ? "medium"
        : "high";
      return {
        id: fact.id,
        name: fact.name,
        // Aggregate confidence is intentionally conservative. Consumers that can
        // reason per root should use rootBindings instead.
        confidence,
        roots: [...fact.roots].sort(),
        evidenceRefs: [...fact.evidenceRefs].sort(),
        rootBindings,
      };
    })
    .sort((left, right) => compareCodeUnits(left.id, right.id));
}

function commandId(kind: ProjectCommand["kind"], cwd: string, argv: string[]) {
  return `cmd-${sha256([kind, cwd, ...argv].join("\u0000")).slice(0, 16)}`;
}

function evidenceId(path: string) {
  return `ev-${sha256(path).slice(0, 16)}`;
}

function dependencyNames(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.keys(value as Record<string, unknown>).map((name) =>
    name.toLowerCase(),
  );
}

function parseJson(
  file: NormalizedFile,
  diagnostics: ProjectDiagnostic[],
): Record<string, unknown> | undefined {
  if (file.content === undefined || !file.content.trim()) {
    diagnostics.push({
      schemaVersion: 1,
      code: "FILENAME_ONLY_EVIDENCE",
      severity: "warning",
      requiresVerification: true,
      path: file.path,
      message: `${file.name} has no parseable content; only filename-level facts were retained.`,
    });
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(file.content);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Manifest root must be an object.");
    }
    return parsed as Record<string, unknown>;
  } catch {
    diagnostics.push({
      schemaVersion: 1,
      code: "MALFORMED_MANIFEST",
      severity: "warning",
      requiresVerification: true,
      path: file.path,
      message: `Could not parse ${file.name}; filename-only facts were retained.`,
    });
    return undefined;
  }
}

function containsDependency(dependencies: readonly string[], name: string) {
  return dependencies.includes(name.toLowerCase());
}

function dependencyTokens(content: string): string[] {
  return [...content.matchAll(/^[\t ]*["']?([@a-z0-9_.\/-]+)["']?[\t ]*(?:=|:|[<>=~!])/gim)]
    .map((match) => (match[1] ?? "").toLowerCase())
    .filter(Boolean);
}

function rootHasPath(files: readonly NormalizedFile[], root: string, name: string) {
  return files.some((file) => file.root === root && file.name === name);
}

function nodeManager(
  file: NormalizedFile,
  parsed: Record<string, unknown> | undefined,
  files: readonly NormalizedFile[],
  diagnostics: ProjectDiagnostic[],
): { id: string; confidence: ProjectFactConfidence } | undefined {
  const declaration =
    typeof parsed?.packageManager === "string"
      ? parsed.packageManager.split("@")[0]?.toLowerCase()
      : undefined;
  if (declaration && ["npm", "pnpm", "yarn", "bun"].includes(declaration)) {
    return { id: declaration, confidence: "high" };
  }
  const locks = ([
    ["pnpm-lock.yaml", "pnpm"],
    ["yarn.lock", "yarn"],
    ["bun.lockb", "bun"],
    ["package-lock.json", "npm"],
  ] as const).filter(([lockfile]) => rootHasPath(files, file.root, lockfile));
  if (locks.length > 1) {
    const candidates = locks.map(([, manager]) => manager).sort(compareCodeUnits);
    diagnostics.push({
      schemaVersion: 1,
      code: "AMBIGUOUS_PACKAGE_MANAGER",
      severity: "warning",
      requiresVerification: true,
      path: file.path,
      candidates,
      message: `Multiple package managers are represented (${candidates.join(
        ", ",
      )}); declare packageManager to select one.`,
    });
    return undefined;
  }
  const lockManager = locks[0]?.[1];
  if (lockManager) return { id: lockManager, confidence: "high" };
  if (parsed) {
    diagnostics.push({
      schemaVersion: 1,
      code: "UNDECLARED_PACKAGE_MANAGER",
      severity: "warning",
      requiresVerification: true,
      path: file.path,
      candidates: ["npm"],
      message:
        "No supported packageManager declaration or lockfile was found; npm is retained only as a convention-based proposal.",
    });
  }
  return { id: "npm", confidence: "medium" };
}

function pythonDependencies(file: NormalizedFile): string[] {
  if (file.content === undefined) return [];
  if (file.name === "requirements.txt") {
    return file.content
      .split(/\r?\n/)
      .map((line) => line.trim().match(/^([a-z0-9_.-]+)/i)?.[1]?.toLowerCase())
      .filter((name): name is string => Boolean(name));
  }
  return dependencyTokens(file.content);
}

function commandKind(name: string): ProjectCommand["kind"] | undefined {
  const normalized = name.toLowerCase();
  if (normalized === "build" || normalized.startsWith("build:")) return "build";
  if (normalized === "test" || normalized.startsWith("test:")) return "test";
  if (normalized === "lint" || normalized.startsWith("lint:")) return "lint";
  if (normalized === "typecheck" || normalized.startsWith("typecheck:"))
    return "typecheck";
  if (normalized === "format" || normalized.startsWith("format:")) return "format";
  return undefined;
}

export function collectProjectIntelligence(
  input: ProjectIntelligenceInput,
): ProjectIntelligenceSnapshot {
  const workspaceId = normalizedIdentity(input.workspaceId, "workspaceId");
  const projectName = normalizedIdentity(input.projectName, "projectName");
  if (input.manifests.length > PROJECT_INTELLIGENCE_MAX_FILES) {
    throw new ProjectIntelligenceInputError(
      `Evidence exceeds the ${PROJECT_INTELLIGENCE_MAX_FILES} file limit.`,
    );
  }

  let totalBytes = 0;
  const seenPaths = new Set<string>();
  const normalizedFiles = input.manifests
    .map((manifest): NormalizedFile => {
      const path = normalizedPath(manifest.path);
      if (seenPaths.has(path)) {
        throw new ProjectIntelligenceInputError(`Duplicate evidence path: ${path}`);
      }
      seenPaths.add(path);
      const bytes = Buffer.byteLength(manifest.content ?? "", "utf8");
      if (bytes > PROJECT_INTELLIGENCE_MAX_FILE_BYTES) {
        throw new ProjectIntelligenceInputError(
          `${path} exceeds the ${PROJECT_INTELLIGENCE_MAX_FILE_BYTES} byte limit.`,
        );
      }
      totalBytes += bytes;
      return {
        path,
        name: posix.basename(path),
        root: fileRoot(path),
        ...(manifest.content === undefined ? {} : { content: manifest.content }),
        ...(manifest.contentSha256 === undefined
          ? {}
          : { contentSha256: normalizedContentSha256(manifest.contentSha256, path) }),
        evidenceId: evidenceId(path),
      };
    });
  if (totalBytes > PROJECT_INTELLIGENCE_MAX_TOTAL_BYTES) {
    throw new ProjectIntelligenceInputError(
      `Evidence exceeds the ${PROJECT_INTELLIGENCE_MAX_TOTAL_BYTES} byte total limit.`,
    );
  }

  const files = normalizedFiles
    .filter((file) => isSupportedProjectEvidencePath(file.path))
    .sort((left, right) => compareCodeUnits(left.path, right.path));
  const unsupportedFiles = normalizedFiles
    .filter((file) => isKnownUnsupportedProjectEvidencePath(file.path))
    .sort((left, right) => compareCodeUnits(left.path, right.path));
  const evidenceFiles = [...files, ...unsupportedFiles].sort((left, right) =>
    compareCodeUnits(left.path, right.path),
  );
  const diagnostics: ProjectDiagnostic[] = unsupportedFiles.map((file) => {
    const manifest = KNOWN_UNSUPPORTED_PROJECT_MANIFESTS[
      file.name as keyof typeof KNOWN_UNSUPPORTED_PROJECT_MANIFESTS
    ];
    return {
      schemaVersion: 1,
      code: "UNSUPPORTED_MANIFEST",
      severity: "warning",
      requiresVerification: true,
      path: file.path,
      message: `${manifest.displayName} evidence was found, but no first-party ${manifest.ecosystem} ecosystem pack is installed.`,
    };
  });
  const evidenceParseStates = new Map<string, EvidenceParseState>();
  for (const file of files) {
    if (file.name === "package.json" || file.name === "composer.json") continue;
    const state = nonJsonEvidenceParseState(file);
    evidenceParseStates.set(file.evidenceId, state);
    if (state === "valid") continue;
    diagnostics.push({
      schemaVersion: 1,
      code:
        state === "filename-only"
          ? "FILENAME_ONLY_EVIDENCE"
          : "MALFORMED_MANIFEST",
      severity: "warning",
      requiresVerification: true,
      path: file.path,
      message:
        state === "filename-only"
          ? `${file.name} has no parseable content; only filename-level facts were retained.`
          : `${file.name} did not match the supported manifest structure; only filename-level facts were retained.`,
    });
  }
  const lockOnlyNodeRoots = new Map<string, Map<string, string>>();
  for (const file of files) {
    const manager =
      file.name === "pnpm-lock.yaml"
        ? "pnpm"
        : file.name === "yarn.lock"
          ? "yarn"
          : file.name === "bun.lockb"
            ? "bun"
            : file.name === "package-lock.json"
              ? "npm"
              : undefined;
    if (!manager) continue;
    const managers = lockOnlyNodeRoots.get(file.root) ?? new Map<string, string>();
    managers.set(manager, file.path);
    lockOnlyNodeRoots.set(file.root, managers);
  }
  for (const [root, managers] of lockOnlyNodeRoots) {
    if (managers.size < 2 || rootHasPath(files, root, "package.json")) continue;
    const candidates = [...managers.keys()].sort(compareCodeUnits);
    diagnostics.push({
      schemaVersion: 1,
      code: "AMBIGUOUS_PACKAGE_MANAGER",
      severity: "warning",
      requiresVerification: true,
      path: managers.get(candidates[0]!)!,
      candidates,
      message: `Multiple package managers are represented (${candidates.join(
        ", ",
      )}); add a package.json packageManager declaration to select one.`,
    });
  }
  const languages = new Map<string, MutableFact>();
  const ecosystems = new Map<string, MutableFact>();
  const frameworks = new Map<string, MutableFact>();
  const testFrameworks = new Map<string, MutableFact>();
  const toolchains = new Map<string, MutableFact>();
  const commands = new Map<string, ProjectCommand>();
  const evidenceFacts = new Map<string, Set<string>>(
    evidenceFiles.map((file) => [file.evidenceId, new Set<string>()]),
  );
  const confidenceForFile = (file: NormalizedFile): ProjectFactConfidence =>
    evidenceParseStates.get(file.evidenceId) === "valid" &&
    !filenameOnlyFactNames.has(file.name)
      ? "high"
      : "medium";
  const isParsedFile = (file: NormalizedFile) =>
    evidenceParseStates.get(file.evidenceId) === "valid";
  for (const file of unsupportedFiles) {
    const manifest = KNOWN_UNSUPPORTED_PROJECT_MANIFESTS[
      file.name as keyof typeof KNOWN_UNSUPPORTED_PROJECT_MANIFESTS
    ];
    evidenceFacts.get(file.evidenceId)?.add(`unsupported-ecosystem:${manifest.ecosystem}`);
  }

  const mapFor = (category: FactCategory) => {
    switch (category) {
      case "language":
        return languages;
      case "ecosystem":
        return ecosystems;
      case "framework":
        return frameworks;
      case "test-framework":
        return testFrameworks;
      case "toolchain":
        return toolchains;
    }
  };
  const addFact = (
    category: FactCategory,
    id: string,
    name: string,
    file: NormalizedFile,
    confidence: ProjectFactConfidence = confidenceForFile(file),
  ) => {
    const effectiveConfidence =
      evidenceParseStates.has(file.evidenceId) && !isParsedFile(file)
        ? "medium"
        : confidence;
    const map = mapFor(category);
    const existing = map.get(id);
    if (existing) {
      existing.roots.add(file.root);
      existing.evidenceRefs.add(file.evidenceId);
      if (effectiveConfidence === "high") existing.confidence = "high";
      const rootBinding = existing.rootBindings.get(file.root);
      if (rootBinding) {
        rootBinding.evidenceRefs.add(file.evidenceId);
        if (effectiveConfidence === "high") rootBinding.confidence = "high";
      } else {
        existing.rootBindings.set(file.root, {
          confidence: effectiveConfidence,
          evidenceRefs: new Set([file.evidenceId]),
        });
      }
    } else {
      map.set(id, {
        id,
        name,
        confidence: effectiveConfidence,
        roots: new Set([file.root]),
        evidenceRefs: new Set([file.evidenceId]),
        rootBindings: new Map([
          [
            file.root,
            {
              confidence: effectiveConfidence,
              evidenceRefs: new Set([file.evidenceId]),
            },
          ],
        ]),
      });
    }
    evidenceFacts.get(file.evidenceId)?.add(`${category}:${id}`);
  };
  const addCommand = (
    kind: ProjectCommand["kind"],
    argv: string[],
    file: NormalizedFile,
    origin: ProjectCommand["origin"],
  ) => {
    if (evidenceParseStates.has(file.evidenceId) && !isParsedFile(file)) return;
    const id = commandId(kind, file.root, argv);
    const existing = commands.get(id);
    if (existing) {
      existing.evidenceRefs = [...new Set([...existing.evidenceRefs, file.evidenceId])].sort();
      evidenceFacts.get(file.evidenceId)?.add(`command:${kind}`);
      return;
    }
    commands.set(id, {
      id,
      kind,
      argv,
      cwd: file.root,
      origin,
      sourcePath: file.path,
      evidenceRefs: [file.evidenceId],
    });
    evidenceFacts.get(file.evidenceId)?.add(`command:${kind}`);
  };

  for (const file of files) {
    const content = file.content ?? "";

    if (file.name === "package.json") {
      const parsed = parseJson(file, diagnostics);
      const manager = nodeManager(file, parsed, files, diagnostics);
      addFact("ecosystem", "node", "Node.js", file, parsed ? "high" : "medium");
      addFact("language", "javascript", "JavaScript", file, "medium");
      if (manager)
        addFact("toolchain", manager.id, manager.id, file, manager.confidence);
      const dependencies = [
        ...dependencyNames(parsed?.dependencies),
        ...dependencyNames(parsed?.devDependencies),
        ...dependencyNames(parsed?.peerDependencies),
      ];
      if (containsDependency(dependencies, "typescript"))
        addFact("language", "typescript", "TypeScript", file, "high");
      for (const [dependency, id, name] of [
        ["react", "react", "React"],
        ["next", "nextjs", "Next.js"],
        ["vue", "vue", "Vue"],
        ["svelte", "svelte", "Svelte"],
        ["express", "express", "Express"],
        ["@nestjs/core", "nestjs", "NestJS"],
      ] as const) {
        if (containsDependency(dependencies, dependency))
          addFact("framework", id, name, file, "high");
      }
      for (const [dependency, id, name] of [
        ["vitest", "vitest", "Vitest"],
        ["jest", "jest", "Jest"],
        ["mocha", "mocha", "Mocha"],
        ["@playwright/test", "playwright", "Playwright"],
      ] as const) {
        if (containsDependency(dependencies, dependency))
          addFact("test-framework", id, name, file, "high");
      }
      if (manager && parsed?.scripts && typeof parsed.scripts === "object") {
        for (const [name, value] of Object.entries(parsed.scripts)) {
          const kind = commandKind(name);
          if (!kind || typeof value !== "string" || !value.trim()) continue;
          addCommand(
            kind,
            [manager.id, "run", name],
            file,
            manager.confidence === "high" ? "declared" : "inferred",
          );
        }
      }
      continue;
    }

    if (file.name === "tsconfig.json") {
      addFact("language", "typescript", "TypeScript", file);
      addFact("toolchain", "typescript", "TypeScript compiler", file);
      addCommand(
        "typecheck",
        ["tsc", "--noEmit", "-p", rootRelativeFilePath(file)],
        file,
        "inferred",
      );
      continue;
    }

    if (
      ["package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lockb"].includes(
        file.name,
      )
    ) {
      const manager =
        file.name === "pnpm-lock.yaml"
          ? "pnpm"
          : file.name === "yarn.lock"
            ? "yarn"
            : file.name === "bun.lockb"
              ? "bun"
              : "npm";
      addFact("ecosystem", "node", "Node.js", file);
      addFact("toolchain", manager, manager, file);
      continue;
    }

    if (
      ["pyproject.toml", "requirements.txt", "setup.py", "poetry.lock", "uv.lock"].includes(
        file.name,
      )
    ) {
      addFact("language", "python", "Python", file);
      addFact("ecosystem", "python", "Python", file);
      const dependencies = pythonDependencies(file);
      let manager = "pip";
      if (file.name === "poetry.lock" || /\[tool\.poetry(?:\]|\.)/i.test(content))
        manager = "poetry";
      else if (file.name === "uv.lock" || /\[tool\.uv(?:\]|\.)/i.test(content))
        manager = "uv";
      else if (file.name === "setup.py") manager = "setuptools";
      addFact("toolchain", manager, manager, file);
      for (const [dependency, id, name] of [
        ["django", "django", "Django"],
        ["flask", "flask", "Flask"],
        ["fastapi", "fastapi", "FastAPI"],
      ] as const) {
        if (containsDependency(dependencies, dependency) || content.toLowerCase().includes(dependency))
          addFact("framework", id, name, file);
      }
      for (const [dependency, id, name] of [
        ["pytest", "pytest", "pytest"],
        ["unittest", "unittest", "unittest"],
      ] as const) {
        if (containsDependency(dependencies, dependency) || content.toLowerCase().includes(dependency)) {
          addFact("test-framework", id, name, file);
          addCommand("test", ["python", "-m", dependency], file, "inferred");
        }
      }
      if (containsDependency(dependencies, "ruff") || /\[tool\.ruff(?:\]|\.)/i.test(content))
        addCommand("lint", ["python", "-m", "ruff", "check", "."], file, "inferred");
      if (containsDependency(dependencies, "mypy") || /\[tool\.mypy(?:\]|\.)/i.test(content))
        addCommand("typecheck", ["python", "-m", "mypy", "."], file, "inferred");
      if (containsDependency(dependencies, "black") || /\[tool\.black(?:\]|\.)/i.test(content))
        addCommand("format", ["python", "-m", "black", "--check", "."], file, "inferred");
      continue;
    }

    if (["go.mod", "go.sum", "go.work"].includes(file.name)) {
      addFact("language", "go", "Go", file);
      addFact("ecosystem", "go", "Go modules", file);
      addFact("toolchain", "go", "Go toolchain", file);
      if (file.name === "go.mod") {
        addCommand("test", ["go", "test", "./..."], file, "inferred");
        addCommand("build", ["go", "build", "./..."], file, "inferred");
        addCommand("lint", ["go", "vet", "./..."], file, "inferred");
        for (const [module, id, name] of [
          ["github.com/gin-gonic/gin", "gin", "Gin"],
          ["github.com/labstack/echo", "echo", "Echo"],
          ["github.com/go-chi/chi", "chi", "Chi"],
          ["github.com/gofiber/fiber", "fiber", "Fiber"],
        ] as const) {
          if (content.includes(module)) addFact("framework", id, name, file);
        }
      }
      continue;
    }

    if (["Cargo.toml", "Cargo.lock"].includes(file.name)) {
      addFact("language", "rust", "Rust", file);
      addFact("ecosystem", "cargo", "Cargo", file);
      addFact("toolchain", "cargo", "Cargo", file);
      if (file.name === "Cargo.toml") {
        addCommand("test", ["cargo", "test", "--workspace"], file, "inferred");
        addCommand("build", ["cargo", "build", "--workspace"], file, "inferred");
        addCommand("format", ["cargo", "fmt", "--all", "--", "--check"], file, "inferred");
        addCommand(
          "lint",
          ["cargo", "clippy", "--workspace", "--all-targets", "--", "-D", "warnings"],
          file,
          "inferred",
        );
        const dependencies = dependencyTokens(content);
        for (const [dependency, id, name] of [
          ["axum", "axum", "Axum"],
          ["actix-web", "actix-web", "Actix Web"],
          ["rocket", "rocket", "Rocket"],
        ] as const) {
          if (containsDependency(dependencies, dependency))
            addFact("framework", id, name, file);
        }
      }
      continue;
    }

    if (file.name === "pom.xml") {
      addFact("language", "java", "Java", file);
      addFact("ecosystem", "maven", "Maven", file);
      addFact("toolchain", "maven", "Maven", file);
      addCommand("test", ["mvn", "-B", "test"], file, "inferred");
      addCommand("build", ["mvn", "-B", "package", "-DskipTests"], file, "inferred");
      if (/spring-boot/i.test(content)) addFact("framework", "spring-boot", "Spring Boot", file);
      if (/quarkus/i.test(content)) addFact("framework", "quarkus", "Quarkus", file);
      if (/micronaut/i.test(content)) addFact("framework", "micronaut", "Micronaut", file);
      if (/junit/i.test(content)) addFact("test-framework", "junit", "JUnit", file);
      if (/testng/i.test(content)) addFact("test-framework", "testng", "TestNG", file);
      continue;
    }

    if (["build.gradle", "build.gradle.kts", "gradle.properties", "gradle-wrapper.properties"].includes(file.name)) {
      addFact("language", "java", "Java", file, "medium");
      addFact("ecosystem", "gradle", "Gradle", file);
      addFact("toolchain", "gradle", "Gradle", file);
      if (/kotlin|org\.jetbrains\.kotlin/i.test(content))
        addFact("language", "kotlin", "Kotlin", file);
      if (file.name === "build.gradle" || file.name === "build.gradle.kts") {
        const executable = rootHasPath(files, file.root, "gradle-wrapper.properties")
          ? "./gradlew"
          : "gradle";
        addCommand("test", [executable, "test"], file, "inferred");
        addCommand("build", [executable, "build", "-x", "test"], file, "inferred");
        if (/springframework|spring-boot/i.test(content))
          addFact("framework", "spring-boot", "Spring Boot", file);
        if (/junit/i.test(content)) addFact("test-framework", "junit", "JUnit", file);
      }
      continue;
    }

    if (
      /\.(?:sln|slnx|csproj)$/i.test(file.name) ||
      ["global.json", "Directory.Build.props", "Directory.Packages.props"].includes(file.name)
    ) {
      addFact("language", "csharp", "C#", file);
      addFact("ecosystem", "dotnet", ".NET", file);
      addFact("toolchain", "dotnet", ".NET SDK", file);
      if (/\.(?:sln|slnx|csproj)$/i.test(file.name)) {
        const projectPath = rootRelativeFilePath(file);
        addCommand("test", ["dotnet", "test", projectPath, "--no-restore"], file, "inferred");
        addCommand("build", ["dotnet", "build", projectPath, "--no-restore"], file, "inferred");
      }
      if (/Microsoft\.NET\.Test\.Sdk/i.test(content))
        addFact("test-framework", "dotnet-test-sdk", ".NET Test SDK", file);
      if (/xunit/i.test(content)) addFact("test-framework", "xunit", "xUnit", file);
      if (/nunit/i.test(content)) addFact("test-framework", "nunit", "NUnit", file);
      if (/Microsoft\.NET\.Sdk\.Web/i.test(content))
        addFact("framework", "aspnet-core", "ASP.NET Core", file);
      continue;
    }

    if (["composer.json", "composer.lock"].includes(file.name)) {
      const parsed = file.name === "composer.json" ? parseJson(file, diagnostics) : undefined;
      const confidence: ProjectFactConfidence = parsed ? "high" : "medium";
      addFact("language", "php", "PHP", file, confidence);
      addFact("ecosystem", "composer", "Composer", file, confidence);
      addFact("toolchain", "composer", "Composer", file, confidence);
      if (file.name === "composer.json") {
        const dependencies = [
          ...dependencyNames(parsed?.require),
          ...dependencyNames(parsed?.["require-dev"]),
        ];
        if (containsDependency(dependencies, "laravel/framework"))
          addFact("framework", "laravel", "Laravel", file);
        if (containsDependency(dependencies, "symfony/framework-bundle"))
          addFact("framework", "symfony", "Symfony", file);
        if (containsDependency(dependencies, "phpunit/phpunit"))
          addFact("test-framework", "phpunit", "PHPUnit", file);
        if (parsed?.scripts && typeof parsed.scripts === "object") {
          for (const [name, value] of Object.entries(parsed.scripts)) {
            const kind = commandKind(name);
            if (!kind || (typeof value !== "string" && !Array.isArray(value))) continue;
            addCommand(kind, ["composer", "run-script", name], file, "declared");
          }
        }
      }
      continue;
    }

    if (["CMakeLists.txt", "Makefile", "meson.build"].includes(file.name)) {
      if (file.name === "CMakeLists.txt") {
        addFact("ecosystem", "cmake", "CMake", file);
        addFact("toolchain", "cmake", "CMake", file);
        const languageDeclaration = content.match(/project\s*\([^)]*\bLANGUAGES\s+([^)]*)\)/i)?.[1] ?? "";
        const explicitlyCxx = /\bCXX\b/i.test(languageDeclaration);
        const explicitlyC = /(?:^|\s)C(?:\s|$)/i.test(languageDeclaration);
        if (!languageDeclaration || explicitlyC) addFact("language", "c", "C", file, languageDeclaration ? "high" : "medium");
        if (!languageDeclaration || explicitlyCxx) addFact("language", "cpp", "C++", file, languageDeclaration ? "high" : "medium");
        addCommand("build", ["cmake", "-S", ".", "-B", "build"], file, "inferred");
        addCommand("build", ["cmake", "--build", "build"], file, "inferred");
        if (/enable_testing\s*\(|include\s*\(\s*CTest\s*\)|add_test\s*\(/i.test(content))
          addCommand("test", ["ctest", "--test-dir", "build"], file, "inferred");
      } else if (file.name === "meson.build") {
        addFact("ecosystem", "meson", "Meson", file);
        addFact("toolchain", "meson", "Meson", file);
        if (/project\s*\([^)]*['\"]c['\"]/i.test(content))
          addFact("language", "c", "C", file);
        if (/project\s*\([^)]*['\"]cpp['\"]/i.test(content))
          addFact("language", "cpp", "C++", file);
        addCommand("build", ["meson", "compile", "-C", "build"], file, "inferred");
        if (/\btest\s*\(/i.test(content))
          addCommand("test", ["meson", "test", "-C", "build"], file, "inferred");
      } else {
        addFact("toolchain", "make", "Make", file);
        addCommand("build", ["make"], file, "inferred");
        if (/^test\s*:/m.test(content)) addCommand("test", ["make", "test"], file, "inferred");
      }
      continue;
    }

    if (file.name === ".shellcheckrc" || /\.sh$/i.test(file.name)) {
      addFact("language", "shell", "Shell", file);
      addFact("ecosystem", "shell", "Shell tooling", file);
      addFact("toolchain", "shellcheck", "ShellCheck", file, "medium");
      if (/\.sh$/i.test(file.name))
        addCommand("lint", ["shellcheck", rootRelativeFilePath(file)], file, "inferred");
      continue;
    }

    if (/\.(?:tf|tf\.json)$/i.test(file.name) || file.name === ".terraform.lock.hcl") {
      addFact("language", "hcl", "HCL", file);
      addFact("ecosystem", "terraform", "Terraform", file);
      addFact("toolchain", "terraform", "Terraform", file);
      if (file.name !== ".terraform.lock.hcl") {
        addCommand(
          "format",
          ["terraform", "fmt", "-check", "-recursive"],
          file,
          "inferred",
        );
        addCommand("validate", ["terraform", "validate"], file, "inferred");
      }
      continue;
    }

    if (/\.hcl$/i.test(file.name)) {
      addFact("language", "hcl", "HCL", file);
    }
  }

  if (languages.size === 0 && ecosystems.size === 0) {
    diagnostics.push({
      schemaVersion: 1,
      code: "UNSUPPORTED_PROJECT",
      severity: "warning",
      requiresVerification: true,
      message: "No supported language or ecosystem evidence was found.",
    });
  }

  const languageFacts = factValues(languages);
  const ecosystemFacts = factValues(ecosystems);
  const frameworkFacts = factValues(frameworks);
  const testFrameworkFacts = factValues(testFrameworks);
  const toolchainFacts = factValues(toolchains);
  const commandValues = [...commands.values()].sort((left, right) =>
    compareCodeUnits(
      `${left.cwd}:${left.kind}:${left.id}`,
      `${right.cwd}:${right.kind}:${right.id}`,
    ),
  );
  const componentRoots = new Set([
    ...languageFacts.flatMap(({ roots }) => roots),
    ...ecosystemFacts.flatMap(({ roots }) => roots),
  ]);
  const components = [...componentRoots]
    .sort()
    .map((root): ProjectComponent => {
      const relevantLanguages = languageFacts.filter(({ roots }) => roots.includes(root));
      const relevantEcosystems = ecosystemFacts.filter(({ roots }) => roots.includes(root));
      return {
        id: `component-${sha256(`${workspaceId}\u0000${root}`).slice(0, 16)}`,
        name: root === "." ? projectName : posix.basename(root),
        root,
        languages: relevantLanguages.map(({ id }) => id).sort(),
        ecosystems: relevantEcosystems.map(({ id }) => id).sort(),
        evidenceRefs: [
          ...new Set(
            [...relevantLanguages, ...relevantEcosystems].flatMap(
              ({ evidenceRefs }) => evidenceRefs,
            ),
          ),
        ].sort(),
      };
    });
  const evidence = evidenceFiles.map((file): ProjectEvidence => ({
    id: file.evidenceId,
    kind: evidenceKind(file.path),
    path: file.path,
    selector: "file",
    byteLength: Buffer.byteLength(file.content ?? "", "utf8"),
    contentSha256:
      file.contentSha256 ?? (file.content === undefined ? null : sha256(file.content)),
    parser: PROJECT_INTELLIGENCE_COLLECTOR,
    observedFacts: [...(evidenceFacts.get(file.evidenceId) ?? [])].sort(),
  }));

  const probeRoots: Array<{ ecosystem: SafeProbeEcosystem; cwd: string }> = [];
  for (const fact of ecosystemFacts) {
    if (
      [
        "node",
        "python",
        "go",
        "cargo",
        "maven",
        "gradle",
        "dotnet",
        "composer",
        "cmake",
        "shell",
        "terraform",
      ].includes(fact.id)
    ) {
      for (const cwd of fact.roots) {
        probeRoots.push({ ecosystem: fact.id as SafeProbeEcosystem, cwd });
      }
    }
  }

  const ecosystemRoots = new Set(
    ecosystemFacts.flatMap((fact) => fact.roots.map((root) => `${fact.id}:${root}`)),
  );
  const toolchainRoots = new Set(toolchainFacts.flatMap(({ roots }) => roots));
  const verificationRoots = new Set(
    commandValues
      .filter(({ kind }) => kind === "test" || kind === "validate")
      .map(({ cwd }) => cwd),
  );
  const allEcosystemRoots = new Set(ecosystemFacts.flatMap(({ roots }) => roots));
  const supportedToolchainCoverage: ProjectCoverageState =
    allEcosystemRoots.size === 0
      ? "unknown"
      : [...allEcosystemRoots].every((root) => toolchainRoots.has(root))
        ? "complete"
        : "partial";
  const supportedVerificationCoverage: ProjectCoverageState =
    allEcosystemRoots.size === 0
      ? "unknown"
      : verificationRoots.size === 0
        ? "unknown"
        : [...allEcosystemRoots].every((root) => verificationRoots.has(root))
          ? "complete"
          : "partial";
  const hasUnsupportedManifests = unsupportedFiles.length > 0;
  const hasUnverifiedManifest = diagnostics.some(
    ({ code }) =>
      code === "MALFORMED_MANIFEST" ||
      code === "FILENAME_ONLY_EVIDENCE" ||
      code === "AMBIGUOUS_PACKAGE_MANAGER" ||
      code === "UNDECLARED_PACKAGE_MANAGER",
  );
  const toolchainCoverage: ProjectCoverageState =
    (hasUnsupportedManifests || hasUnverifiedManifest) &&
    supportedToolchainCoverage === "complete"
      ? "partial"
      : supportedToolchainCoverage;
  const verificationCoverage: ProjectCoverageState =
    hasUnsupportedManifests && supportedVerificationCoverage === "complete"
      ? "partial"
      : supportedVerificationCoverage;
  const unknowns: string[] = [];
  if (ecosystemRoots.size === 0) unknowns.push("ecosystem");
  if (hasUnsupportedManifests) unknowns.push("unsupported-project-manifests");
  if (hasUnverifiedManifest) unknowns.push("manifest-verification");
  if (
    diagnostics.some(
      ({ code }) =>
        code === "AMBIGUOUS_PACKAGE_MANAGER" ||
        code === "UNDECLARED_PACKAGE_MANAGER",
    )
  )
    unknowns.push("package-manager-authority");
  if (toolchainCoverage !== "complete") unknowns.push("toolchain");
  if (verificationCoverage !== "complete") unknowns.push("verification");
  unknowns.push("architecture-relationships", "ownership", "lifecycle");
  const coverage: ProjectCoverage = {
    overall:
      ecosystems.size === 0
        ? "unsupported"
        : !hasUnsupportedManifests &&
            !hasUnverifiedManifest &&
            toolchainCoverage === "complete" &&
            verificationCoverage === "complete"
          ? "complete"
          : "partial",
    dimensions: {
      identity: "complete",
      ecosystem:
        ecosystems.size === 0 ? "unknown" : hasUnsupportedManifests ? "partial" : "complete",
      toolchain: toolchainCoverage,
      verification: verificationCoverage,
      architecture: components.length > 0 ? "partial" : "unknown",
    },
    unknowns: [...new Set(unknowns)].sort(),
  };

  return {
    schemaVersion: PROJECT_INTELLIGENCE_SCHEMA_VERSION,
    collector: PROJECT_INTELLIGENCE_COLLECTOR,
    workspaceId,
    projectName,
    revision: {
      commit: input.revision?.commit?.trim() || null,
      branch: input.revision?.branch?.trim() || null,
      dirty: input.revision?.dirty ?? null,
    },
    rootEntries: [...new Set(input.rootEntries ?? [])].sort(),
    workspaceRoots: [...new Set((input.workspaceRoots ?? []).map(normalizeDirectory))].sort(),
    languages: languageFacts,
    ecosystems: ecosystemFacts,
    frameworks: frameworkFacts,
    testFrameworks: testFrameworkFacts,
    toolchains: toolchainFacts,
    commands: commandValues,
    components,
    evidence,
    safeProbes: safeProbesForEcosystems(probeRoots),
    diagnostics: diagnostics.sort((left, right) =>
      compareCodeUnits(`${left.path ?? ""}:${left.code}`, `${right.path ?? ""}:${right.code}`),
    ),
    coverage,
  };
}
