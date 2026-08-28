import {
  canonicalJsonStringify,
  createProjectSnapshot,
  sha256Hex,
  type DwiClaim,
  type DwiCoverage,
  type DwiEvidence,
  type DwiJsonValue,
  type DwiProjectSnapshot,
  type DwiProposal,
  type DwiProjectWorkflow,
} from "@platform/dwi-core";
import type {
  ProjectDetectedFact,
  ProjectIntelligenceSnapshot,
} from "@platform/domain-workspace";
import type { DwiProjectDeclaration } from "./project-declaration.js";
import type { ProjectStandardsImport } from "./project-importers.js";

export interface ProjectSnapshotAdapterInput {
  intelligence: ProjectIntelligenceSnapshot;
  generatedAt?: string;
  repository?: string;
  sourceRoot?: string;
  remoteIdentityHash?: string;
  evidenceContent?: Readonly<Record<string, string>>;
  /** Raw-byte digests captured before UTF-8 decoding, keyed by relative path. */
  evidenceSha256?: Readonly<Record<string, string>>;
  declaration?: {
    value: DwiProjectDeclaration;
    content: string;
    sha256?: string;
    relativePath?: string;
  };
  standards?: ProjectStandardsImport;
  omissions?: {
    truncated: boolean;
    skipped: readonly { path: string; reason: string }[];
  };
}

const lockfileNames = new Set([
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lockb",
  "poetry.lock",
  "uv.lock",
  "go.sum",
  "Cargo.lock",
  "composer.lock",
  ".terraform.lock.hcl",
]);

const documentationName = /^(?:README(?:\.[^/]*)?|CODEOWNERS)$/i;
const compareCodeUnits = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0;

function asJson(value: unknown): DwiJsonValue {
  return JSON.parse(JSON.stringify(value)) as DwiJsonValue;
}

function evidenceRefs(facts: readonly ProjectDetectedFact[]): string[] {
  return [...new Set(facts.flatMap((fact) => fact.evidenceRefs))].sort();
}

function confidence(facts: readonly ProjectDetectedFact[]): DwiClaim["confidence"] {
  return facts.some((fact) => fact.confidence === "medium") ? "medium" : "high";
}

function claim(
  id: string,
  path: string,
  value: unknown,
  facts: readonly ProjectDetectedFact[],
  observedAt: string,
): DwiClaim | undefined {
  const refs = evidenceRefs(facts);
  if (refs.length === 0) return undefined;
  return {
    id,
    path,
    value: asJson(value),
    state: "accepted",
    confidence: confidence(facts),
    authority: "deterministic",
    evidenceRefs: refs,
    extractor: "dwi-first-party-packs@1.0.0",
    observedAt,
  };
}

function packageManagerForRoot(
  ecosystemId: string,
  root: string,
  toolchains: readonly ProjectDetectedFact[],
): string | undefined {
  const candidates: Record<string, readonly string[]> = {
    node: ["pnpm", "npm", "yarn", "bun"],
    python: ["uv", "poetry", "pip", "setuptools"],
    go: ["go"],
    cargo: ["cargo"],
    maven: ["maven"],
    gradle: ["gradle"],
    dotnet: ["dotnet"],
    composer: ["composer"],
    cmake: ["cmake", "meson", "make"],
    terraform: ["terraform"],
  };
  const highConfidence = toolchains.filter(
    (toolchain) =>
      (candidates[ecosystemId] ?? []).includes(toolchain.id) &&
      toolchain.rootBindings.some(
        (binding) => binding.root === root && binding.confidence === "high",
      ),
  );
  const ids = [...new Set(highConfidence.map(({ id }) => id))].sort(compareCodeUnits);
  return ids.length === 1 ? ids[0] : undefined;
}

function ecosystemObservations(
  ecosystems: readonly ProjectDetectedFact[],
  toolchains: readonly ProjectDetectedFact[],
): Array<{
  id: string;
  name: string;
  roots: string[];
  packageManager?: string;
  packageManagers?: Array<{ id: string; roots: string[] }>;
}> {
  return ecosystems.map((ecosystem) => {
    const grouped = new Map<string, string[]>();
    for (const binding of ecosystem.rootBindings) {
      const manager = packageManagerForRoot(ecosystem.id, binding.root, toolchains);
      if (manager) grouped.set(manager, [...(grouped.get(manager) ?? []), binding.root]);
    }
    const packageManagers = [...grouped.entries()]
      .sort(([left], [right]) => compareCodeUnits(left, right))
      .map(([id, roots]) => ({ id, roots: roots.sort(compareCodeUnits) }));
    const roots = [...ecosystem.roots].sort(compareCodeUnits);
    const oneManagerCoversAllRoots =
      packageManagers.length === 1 &&
      packageManagers[0]!.roots.length === roots.length &&
      packageManagers[0]!.roots.every((root, index) => root === roots[index]);
    return {
      id: ecosystem.id,
      name: ecosystem.name,
      roots,
      ...(oneManagerCoversAllRoots
        ? { packageManager: packageManagers[0]!.id }
        : packageManagers.length
          ? { packageManagers }
          : {}),
    };
  });
}

function standardValue(standards: ProjectStandardsImport | undefined, path: string): DwiJsonValue | undefined {
  return standards?.claims.find((item) => item.path === path)?.value;
}

function hasText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function hasItems(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

function effectiveWorkflowKinds(declaration: DwiProjectDeclaration | undefined, standards: ProjectStandardsImport | undefined): Set<string> {
  const imported = standardValue(standards, "/spec/workflows");
  const workflows = [
    ...(declaration?.spec?.workflows ?? []),
    ...(Array.isArray(imported) ? imported : []),
  ];
  return new Set(workflows.flatMap((workflow) => {
    if (!workflow || typeof workflow !== "object" || Array.isArray(workflow)) return [];
    const kind = (workflow as Record<string, unknown>).kind;
    return typeof kind === "string" ? [kind] : [];
  }));
}

function coverage(
  input: ProjectIntelligenceSnapshot,
  declaration?: DwiProjectDeclaration,
  standards?: ProjectStandardsImport,
  incompleteInspection = false,
): Partial<DwiCoverage> {
  const level = (value: "complete" | "partial" | "unknown") =>
    value === "complete" ? "complete" : value === "partial" ? "partial" : "incomplete";
  const identity = declaration?.spec?.identity;
  const workflowKinds = effectiveWorkflowKinds(declaration, standards);
  for (const command of input.commands.filter(({ origin }) => origin === "declared")) workflowKinds.add(workflowKind(command.kind));
  const declaredBoundaries = declaration?.spec?.boundaries;
  const hasArchitecture = Boolean(
    declaredBoundaries && Object.values(declaredBoundaries).some(hasItems),
  ) || ["providesApis", "consumesApis", "dependsOn"].some((key) => hasItems(standardValue(standards, `/spec/boundaries/${key}`)));
  const result: Partial<DwiCoverage> = {
    identity: hasText(identity?.componentType ?? standardValue(standards, "/spec/identity/componentType"))
      && hasItems(identity?.owners ?? standardValue(standards, "/spec/identity/owners"))
      && hasText(identity?.lifecycle ?? standardValue(standards, "/spec/identity/lifecycle"))
      ? "complete"
      : "partial",
    toolchain: level(input.coverage.dimensions.toolchain),
    verification: workflowKinds.has("test") && workflowKinds.has("build")
      ? "complete"
      : input.commands.length
        ? "partial"
        : "incomplete",
    architecture: hasArchitecture ? "complete" : level(input.coverage.dimensions.architecture),
    documentation: hasText(identity?.description ?? standardValue(standards, "/spec/identity/description")) ? "complete" : "incomplete",
  };
  if (incompleteInspection) {
    for (const key of ["toolchain", "verification", "architecture", "documentation"] as const) {
      if (result[key] === "complete") result[key] = "partial";
    }
  }
  return result;
}

function workflowKind(kind: ProjectIntelligenceSnapshot["commands"][number]["kind"]): DwiProjectWorkflow["kind"] {
  return kind === "validate" ? "custom" : kind;
}

/**
 * Converts pack-owned detector output into the stable DWI project contract.
 * The adapter never invents ownership, lifecycle, or architecture relations.
 */
export function projectIntelligenceToSnapshot(
  input: ProjectSnapshotAdapterInput,
): DwiProjectSnapshot {
  const { intelligence } = input;
  const generatedAt = input.generatedAt ?? new Date().toISOString();
  const contents = input.evidenceContent ?? {};
  const contentDigests = input.evidenceSha256 ?? {};
  const declaration = input.declaration?.value;
  const languages = intelligence.languages.map(({ id, name, roots }) => ({ id, name, roots }));
  const ecosystems = ecosystemObservations(
    intelligence.ecosystems,
    intelligence.toolchains,
  );
  const frameworks = [...intelligence.frameworks, ...intelligence.testFrameworks].map(
    ({ id, name, roots }) => ({ id, name, roots }),
  );
  const toolchains = intelligence.toolchains.map(({ id, name, roots }) => ({ id, name, roots }));
  const components = [
    ...intelligence.components.map(({ id, name, root }) => ({ id, name, root })),
    ...(input.standards?.components?.map(({ value }) => value) ?? []),
  ].filter((component, index, all) => all.findIndex(({ root, name }) => root === component.root && name === component.name) === index);
  const workflows: DwiProjectWorkflow[] = intelligence.commands.filter(({ origin }) => origin === "declared").map((command) => ({
    id: command.id,
    kind: workflowKind(command.kind),
    argv: [...command.argv],
    cwd: command.cwd,
    description: `${command.origin === "declared" ? "Declared" : "Pack-inferred"} from ${command.sourcePath}`,
  }));
  const proposals: DwiProposal[] = intelligence.commands.filter(({ origin }) => origin === "inferred").map((command) => ({
    id: `inferred-workflow-${command.id}`,
    path: "/spec/workflows",
    value: asJson({
      id: command.id,
      kind: workflowKind(command.kind),
      argv: [...command.argv],
      cwd: command.cwd,
      description: `Pack-inferred convention from ${command.sourcePath}; review before adoption.`,
    }),
    producer: "importer",
    state: "pending",
    risk: "high",
    evidenceRefs: [...command.evidenceRefs],
    createdAt: generatedAt,
  }));

  const evidence: DwiEvidence[] = intelligence.evidence.map((item) => ({
    id: item.id,
    kind: item.kind === "lockfile" ? "lockfile" : item.kind === "source" ? "source" : "manifest",
    relativePath: item.path,
    selector: item.selector,
    ...(item.contentSha256 ? { sha256: item.contentSha256 } : {}),
    parser: item.parser,
    collectedAt: generatedAt,
    redactions: [],
  }));
  const existingPaths = new Set(evidence.map(({ relativePath }) => relativePath));
  for (const path of Object.keys(contents).sort()) {
    const name = path.split("/").at(-1) ?? path;
    if (existingPaths.has(path) || !documentationName.test(name)) continue;
    evidence.push({
      id: `documentation-${sha256Hex(path).slice(0, 16)}`,
      kind: "documentation",
      relativePath: path,
      selector: "file",
      sha256: contentDigests[path] ?? sha256Hex(contents[path]!),
      parser: "dwi-bounded-documentation@1.0.0",
      collectedAt: generatedAt,
      redactions: [],
    });
  }
  const declarationEvidenceId = "declaration-project-yaml";
  if (input.declaration) {
    const relativePath = input.declaration.relativePath ?? ".dwi/project.yaml";
    evidence.push({
      id: declarationEvidenceId,
      kind: "declaration",
      relativePath,
      selector: "document",
      sha256: input.declaration.sha256 ?? sha256Hex(input.declaration.content),
      parser: "dwi-project-declaration@1.0.0",
      collectedAt: generatedAt,
      redactions: [],
    });
  }
  for (const imported of input.standards?.evidence ?? []) {
    evidence.push({
      id: imported.id,
      kind: imported.kind,
      relativePath: imported.relativePath,
      selector: "document",
      sha256: contentDigests[imported.relativePath] ?? sha256Hex(imported.content),
      parser: imported.parser,
      collectedAt: generatedAt,
      redactions: [],
    });
  }
  evidence.sort((left, right) => compareCodeUnits(left.id, right.id));
  const evidenceDigest = projectEvidenceDigest(evidence);

  const claims: DwiClaim[] = [
    claim("detected-languages", "/observed/languages", languages, intelligence.languages, generatedAt),
    claim("detected-ecosystems", "/observed/ecosystems", ecosystems, intelligence.ecosystems, generatedAt),
    claim("detected-frameworks", "/observed/frameworks", frameworks, [...intelligence.frameworks, ...intelligence.testFrameworks], generatedAt),
    claim("detected-toolchains", "/observed/toolchains", toolchains, intelligence.toolchains, generatedAt),
    claim(
      "detected-components",
      "/observed/components",
      components,
      [...intelligence.languages, ...intelligence.ecosystems],
      generatedAt,
    ),
  ].filter((item): item is DwiClaim => Boolean(item));
  if (declaration?.spec) {
    const declared = (
      path: string,
      value: unknown,
    ) => {
      if (value === undefined) return;
      claims.push({
        id: `declared-${path.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase()}`,
        path,
        value: asJson(value),
        state: "accepted",
        confidence: "high",
        authority: "declaration",
        evidenceRefs: [declarationEvidenceId],
        extractor: "dwi-project-declaration@1.0.0",
        observedAt: generatedAt,
      });
    };
    for (const [key, value] of Object.entries(declaration.spec.identity ?? {})) declared(`/spec/identity/${key}`, value);
    for (const [key, value] of Object.entries(declaration.spec.boundaries ?? {})) declared(`/spec/boundaries/${key}`, value);
    if (declaration.spec.workflows) declared("/spec/workflows", declaration.spec.workflows);
    for (const [key, value] of Object.entries(declaration.spec.constraints ?? {})) declared(`/spec/constraints/${key}`, value);
  }
  for (const imported of input.standards?.claims ?? []) {
    claims.push({
      id: imported.id,
      path: imported.path,
      value: imported.value,
      state: "accepted",
      confidence: "high",
      authority: imported.authority,
      evidenceRefs: [imported.evidenceId],
      extractor: "dwi-open-standard-importers@1.0.0",
      observedAt: generatedAt,
    });
  }
  if (input.standards?.components?.length) {
    claims.push({
      id: "catalog-component-inventory",
      path: "/observed/components",
      value: asJson(components),
      state: "accepted",
      confidence: "high",
      authority: "catalog",
      evidenceRefs: [...new Set(input.standards.components.map(({ evidenceId }) => evidenceId))].sort(compareCodeUnits),
      extractor: "dwi-open-standard-importers@1.0.0",
      observedAt: generatedAt,
    });
  }

  const hasDeclaredArchitecture = Boolean(declaration?.spec?.boundaries && Object.values(declaration.spec.boundaries).some(hasItems));
  const hasImportedArchitecture = ["providesApis", "consumesApis", "dependsOn"].some((key) => hasItems(standardValue(input.standards, `/spec/boundaries/${key}`)));
  const workflowKinds = effectiveWorkflowKinds(declaration, input.standards);
  for (const command of intelligence.commands.filter(({ origin }) => origin === "declared")) workflowKinds.add(workflowKind(command.kind));
  const hasOwners = hasItems(declaration?.spec?.identity?.owners ?? standardValue(input.standards, "/spec/identity/owners"));
  const hasLifecycle = hasText(declaration?.spec?.identity?.lifecycle ?? standardValue(input.standards, "/spec/identity/lifecycle"));
  const unresolvedCollectorUnknowns = intelligence.coverage.unknowns.filter((unknown) => {
    if (unknown === "ownership" && hasOwners) return false;
    if (unknown === "lifecycle" && hasLifecycle) return false;
    if (unknown === "architecture-relationships" && (hasDeclaredArchitecture || hasImportedArchitecture)) return false;
    if (unknown === "verification" && workflowKinds.has("test") && workflowKinds.has("build")) return false;
    return true;
  });
  const verificationDiagnostics = intelligence.diagnostics.filter(({ requiresVerification }) => requiresVerification);
  const nonPrivateOmissions = input.omissions?.skipped.filter(({ reason }) => reason !== "private") ?? [];
  const hasEvidenceOmissions = Boolean(input.omissions?.truncated || nonPrivateOmissions.length);
  const incompleteInspection = hasEvidenceOmissions || verificationDiagnostics.length > 0;
  const unknowns = [...unresolvedCollectorUnknowns.map((unknown) => ({
    path: unknown === "ownership"
      ? "/spec/identity/owners"
      : unknown === "lifecycle"
        ? "/spec/identity/lifecycle"
        : unknown === "architecture-relationships"
          ? "/spec/boundaries"
          : unknown === "verification"
            ? "/spec/workflows"
            : `/observed/${unknown}`,
    reason: `${unknown.replaceAll("-", " ")} is not established by current evidence.`,
    required: true,
  })), ...verificationDiagnostics.map((diagnostic) => {
    const linkedEvidence = diagnostic.path ? intelligence.evidence.find(({ path }) => path === diagnostic.path) : undefined;
    return {
      path: "/observed/diagnostics",
      reason: `[diagnostic-v${diagnostic.schemaVersion}:${diagnostic.code}] ${diagnostic.message}`,
      required: true,
      ...(linkedEvidence ? { evidenceRefs: [linkedEvidence.id] } : {}),
    };
  }), ...(input.standards?.unknowns ?? [])];
  if (hasEvidenceOmissions) {
    const reasons = [...new Set(nonPrivateOmissions.map(({ reason }) => reason))].sort(compareCodeUnits);
    const lowerBound = input.omissions?.truncated || nonPrivateOmissions.some(({ reason }) => reason === "file-limit");
    unknowns.push({
      path: "/observed/evidenceOmissions",
      reason: `Bounded inspection omitted ${lowerBound ? "at least " : ""}${nonPrivateOmissions.length} candidate${nonPrivateOmissions.length === 1 ? "" : "s"}${reasons.length ? ` (${reasons.join(", ")})` : ""}; refresh with narrower roots or explicit declarations.`,
      required: true,
    });
  }
  if (!(workflowKinds.has("test") && workflowKinds.has("build")) && !unknowns.some(({ path }) => path === "/spec/workflows")) {
    unknowns.push({
      path: "/spec/workflows",
      reason: intelligence.commands.some(({ origin }) => origin === "inferred")
        ? "Build and test commands are pack-inferred conventions pending explicit declaration or review."
        : "Build and test workflows are not established by current evidence.",
      required: true,
    });
  }
  const documentation = evidence
    .filter((item) => item.kind === "documentation" && item.relativePath)
    .map((item) => ({ id: item.id, path: item.relativePath! }));
  const dependencyArtifacts = intelligence.evidence
    .filter((item) => item.kind === "lockfile" || lockfileNames.has(item.path.split("/").at(-1) ?? ""))
    .map((item) => ({
      id: `dependency-${item.id}`,
      path: item.path,
      format: item.path.split("/").at(-1) ?? "lockfile",
      ...(item.contentSha256 ? { sha256: item.contentSha256 } : {}),
    }));
  for (const item of input.standards?.evidence ?? []) {
    if (!item.parser.startsWith("cyclonedx")) continue;
    dependencyArtifacts.push({
      id: `dependency-${item.id}`,
      path: item.relativePath,
      format: "CycloneDX",
      sha256: sha256Hex(item.content),
    });
  }

  return createProjectSnapshot(
    {
      metadata: {
        id: intelligence.workspaceId,
        name: declaration?.metadata?.name ?? intelligence.projectName,
        ...(declaration?.metadata?.namespace ? { namespace: declaration.metadata.namespace } : {}),
        source: {
          root: input.sourceRoot ?? ".",
          ...(input.repository ? { repository: input.repository } : {}),
          ...(input.remoteIdentityHash ? { remoteIdentityHash: input.remoteIdentityHash } : {}),
        },
        revision: {
          generatedAt,
          ...(intelligence.revision.commit ? { commit: intelligence.revision.commit } : {}),
          ...(intelligence.revision.branch ? { branch: intelligence.revision.branch } : {}),
          ...(intelligence.revision.dirty !== null ? { dirty: intelligence.revision.dirty } : {}),
          evidenceDigest,
        },
      },
      spec: {
        identity: {
          owners: [],
          tags: [...new Set([...languages.map(({ id }) => id), ...ecosystems.map(({ id }) => id)])].sort(),
        },
        boundaries: {
          providesApis: [],
          consumesApis: [],
          dependsOn: [],
          componentRoots: intelligence.components.map(({ root }) => root).sort(),
          generatedRoots: intelligence.rootEntries.filter((name) => /^(?:dist|build|coverage|generated|\.next|\.turbo)$/i.test(name)),
          excludedRoots: [],
        },
        workflows,
      },
      observed: {
        languages,
        ecosystems,
        frameworks,
        toolchains,
        components,
        documentation,
        dependencyArtifacts,
      },
      evidence,
      claims,
      proposals,
      unknowns,
      coverage: {
        ...coverage(intelligence, declaration, input.standards, incompleteInspection),
        ...(documentation.length && !hasText(declaration?.spec?.identity?.description ?? standardValue(input.standards, "/spec/identity/description")) ? { documentation: "partial" as const } : {}),
      },
    },
    { generatedAt },
  );
}

export function projectEvidenceDigest(evidence: readonly DwiEvidence[]): string {
  const records = evidence.map((item) => ({
    id: item.id,
    kind: item.kind,
    relativePath: item.relativePath ?? "",
    selector: item.selector ?? "",
    sha256: item.sha256 ?? "",
    parser: item.parser ?? "",
    redactions: [...(item.redactions ?? [])].sort(compareCodeUnits),
  })).sort((left, right) => compareCodeUnits(left.id, right.id));
  return sha256Hex(canonicalJsonStringify(records));
}
