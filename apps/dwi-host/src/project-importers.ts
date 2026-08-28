import { parseDocument } from "yaml";
import { sha256Hex, type DwiClaimAuthority, type DwiComponentObservation, type DwiEvidenceKind, type DwiJsonValue, type DwiProjectWorkflow } from "@platform/dwi-core";

export interface ImportedProjectClaim {
  id: string;
  path: string;
  value: DwiJsonValue;
  authority: DwiClaimAuthority;
  evidenceId: string;
}

export interface ImportedProjectEvidence {
  id: string;
  kind: DwiEvidenceKind;
  relativePath: string;
  content: string;
  parser: string;
}

export interface ProjectStandardsImport {
  claims: ImportedProjectClaim[];
  evidence: ImportedProjectEvidence[];
  components?: Array<{ value: DwiComponentObservation; evidenceId: string }>;
  unknowns: Array<{ path: string; reason: string; required: boolean; evidenceRefs?: string[] }>;
}

const asJson = (value: unknown): DwiJsonValue => JSON.parse(JSON.stringify(value)) as DwiJsonValue;
const asRecord = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const asString = (value: unknown): string | undefined => typeof value === "string" && value.trim() ? value.trim() : undefined;
const asStrings = (value: unknown): string[] => Array.isArray(value) ? value.flatMap((item) => asString(item) ? [asString(item)!] : []) : [];
const evidenceIdFor = (kind: string, path: string): string => `${kind}-${sha256Hex(path).slice(0, 16)}`;

function yamlRecord(content: string): Record<string, unknown> | undefined {
  try {
    const document = parseDocument(content, { schema: "core", strict: true, uniqueKeys: true });
    if (document.errors.length) return undefined;
    return asRecord(document.toJS({ maxAliasCount: 0 }));
  } catch {
    return undefined;
  }
}

function simpleArgv(command: string): string[] | undefined {
  const trimmed = command.trim();
  if (!trimmed || /[;&|`$<>\\'"\n\r]/.test(trimmed)) return undefined;
  const argv = trimmed.split(/\s+/);
  return argv.every((token) => /^[a-z0-9_@%+=:,./-]+$/i.test(token)) ? argv : undefined;
}

function safeWorkingDirectory(value: unknown): string | undefined {
  const directory = asString(value) ?? ".";
  if (directory === ".") return directory;
  if (directory.includes("\\") || directory.startsWith("/") || /^[a-z][a-z0-9+.-]*:/i.test(directory)) return undefined;
  return directory.split("/").every((part) => part && part !== "." && part !== "..") ? directory : undefined;
}

function directoryOf(path: string): string {
  const separator = path.lastIndexOf("/");
  return separator < 0 ? "." : path.slice(0, separator);
}

function rebaseWorkingDirectory(sourcePath: string, workingDirectory: string): string | undefined {
  const sourceDirectory = directoryOf(sourcePath);
  const rebased = workingDirectory === "."
    ? sourceDirectory
    : sourceDirectory === "."
      ? workingDirectory
      : `${sourceDirectory}/${workingDirectory}`;
  return safeWorkingDirectory(rebased);
}

export function importProjectStandards(contents: Readonly<Record<string, string>>): ProjectStandardsImport {
  const result: ProjectStandardsImport = { claims: [], evidence: [], components: [], unknowns: [] };
  const addEvidence = (id: string, kind: DwiEvidenceKind, relativePath: string, content: string, parser: string) => {
    result.evidence.push({ id, kind, relativePath, content, parser });
  };
  const addClaim = (id: string, path: string, value: unknown, authority: DwiClaimAuthority, evidenceId: string) => {
    if (value === undefined || (Array.isArray(value) && value.length === 0)) return;
    result.claims.push({ id, path, value: asJson(value), authority, evidenceId });
  };

  for (const path of Object.keys(contents).sort()) {
    const name = path.split("/").at(-1)?.toLowerCase() ?? "";
    const content = contents[path]!;
    if (name === "catalog-info.yaml" || name === "catalog-info.yml") {
      const source = yamlRecord(content);
      if (!source || source.apiVersion !== "backstage.io/v1alpha1" || source.kind !== "Component") continue;
      const evidenceId = evidenceIdFor("catalog", path);
      addEvidence(evidenceId, "catalog", path, content, "backstage-component@v1alpha1");
      const metadata = asRecord(source.metadata);
      const spec = asRecord(source.spec);
      if (directoryOf(path) !== ".") {
        const name = asString(metadata.name);
        if (!name) {
          result.unknowns.push({ path: "/observed/components", reason: `Nested Backstage Component at '${path}' has no metadata.name.`, required: false, evidenceRefs: [evidenceId] });
          continue;
        }
        result.components!.push({
          value: {
            id: `backstage-${sha256Hex(path).slice(0, 16)}`,
            name,
            root: directoryOf(path),
            ...(asString(spec.type) ? { type: asString(spec.type) } : {}),
          },
          evidenceId,
        });
        if (asString(spec.owner) || asString(spec.lifecycle) || asStrings(spec.providesApis).length || asStrings(spec.consumesApis).length || asStrings(spec.dependsOn).length) {
          result.unknowns.push({ path: "/observed/components", reason: `Organization and API fields from nested Backstage Component '${name}' remain component-scoped and are not promoted to project identity.`, required: false, evidenceRefs: [evidenceId] });
        }
        continue;
      }
      addClaim(`${evidenceId}-description`, "/spec/identity/description", asString(metadata.description), "catalog", evidenceId);
      addClaim(`${evidenceId}-tags`, "/spec/identity/tags", asStrings(metadata.tags), "catalog", evidenceId);
      addClaim(`${evidenceId}-type`, "/spec/identity/componentType", asString(spec.type), "catalog", evidenceId);
      addClaim(`${evidenceId}-lifecycle`, "/spec/identity/lifecycle", asString(spec.lifecycle), "catalog", evidenceId);
      addClaim(`${evidenceId}-owner`, "/spec/identity/owners", asString(spec.owner) ? [asString(spec.owner)!] : [], "catalog", evidenceId);
      addClaim(`${evidenceId}-system`, "/spec/identity/system", asString(spec.system), "catalog", evidenceId);
      for (const [field, sourceField] of [
        ["providesApis", "providesApis"],
        ["consumesApis", "consumesApis"],
        ["dependsOn", "dependsOn"],
      ] as const) addClaim(`${evidenceId}-${field}`, `/spec/boundaries/${field}`, asStrings(spec[sourceField]), "catalog", evidenceId);
      continue;
    }

    if (name === "devfile.yaml" || name === "devfile.yml") {
      const source = yamlRecord(content);
      if (!source || !asString(source.schemaVersion)) continue;
      const evidenceId = evidenceIdFor("devfile", path);
      addEvidence(evidenceId, "declaration", path, content, "devfile@v2");
      const workflows: DwiProjectWorkflow[] = [];
      for (const rawCommand of Array.isArray(source.commands) ? source.commands : []) {
        const command = asRecord(rawCommand);
        const id = asString(command.id);
        const exec = asRecord(command.exec);
        const raw = asString(exec.command);
        const argv = raw ? simpleArgv(raw) : undefined;
        const declaredCwd = safeWorkingDirectory(exec.workingDir);
        const cwd = declaredCwd ? rebaseWorkingDirectory(path, declaredCwd) : undefined;
        if (!id || !raw || !argv || !cwd) {
          result.unknowns.push({ path: "/spec/workflows", reason: `Devfile command '${id ?? "unnamed"}' uses syntax outside the safe direct-argv import subset.`, required: false, evidenceRefs: [evidenceId] });
          continue;
        }
        workflows.push({ id: `devfile-${id}`, kind: "custom", argv, cwd, description: "Imported from Devfile; review before execution." });
      }
      addClaim(`${evidenceId}-workflows`, "/spec/workflows", workflows, "catalog", evidenceId);
      continue;
    }

    if (name === "bom.json" || name === "bom.xml" || /\.cdx\.(?:json|xml)$/i.test(name)) {
      addEvidence(evidenceIdFor("cyclonedx", path), "manifest", path, content, "cyclonedx-reference@1");
    }
  }
  return result;
}
