import { parseDocument } from "yaml";
import type {
  DwiProjectBoundaries,
  DwiProjectConstraints,
  DwiProjectIdentity,
  DwiProjectWorkflow,
} from "@platform/dwi-core";

export const DWI_PROJECT_DECLARATION_MAX_BYTES = 64 * 1024;

export interface DwiProjectDeclaration {
  apiVersion: "dwi.dev/v1";
  kind: "Project";
  metadata?: {
    name?: string;
    namespace?: string;
  };
  spec?: {
    identity?: Partial<DwiProjectIdentity>;
    boundaries?: Partial<DwiProjectBoundaries>;
    workflows?: DwiProjectWorkflow[];
    constraints?: Partial<DwiProjectConstraints>;
  };
}

export class DwiProjectDeclarationError extends Error {
  constructor(message: string) {
    super(`Invalid .dwi/project.yaml: ${message}`);
    this.name = "DwiProjectDeclarationError";
  }
}

/**
 * Creates a parseable, non-authoritative declaration scaffold. Detector-owned
 * boundaries and workflows stay absent until a user deliberately declares an
 * override for them.
 */
export function projectDeclarationTemplate(projectName: string): string {
  return `# Declare only stable, human-owned project invariants here.
# Detected toolchains, component roots, and workflows remain evidence-derived
# unless their optional sections are explicitly added.
apiVersion: dwi.dev/v1
kind: Project
metadata:
  name: ${JSON.stringify(projectName)}
spec:
  identity: {}
  # Optional identity keys: description, componentType, lifecycle, owners,
  # system, domain, and tags.
  # Optional sections intentionally omitted: boundaries, workflows, constraints.
`;
}

export interface ProjectDeclarationCreateIo<Path> {
  writeFile(path: Path, content: Uint8Array): Promise<void>;
  renameWithoutOverwrite(from: Path, to: Path): Promise<void>;
  delete(path: Path): Promise<void>;
}

function isExistingPathError(error: unknown): boolean {
  const code = error && typeof error === "object" && "code" in error
    ? String((error as { code?: unknown }).code)
    : "";
  return code === "FileExists" || code === "EEXIST";
}

/**
 * Publishes a declaration through an exclusive rename so a concurrent user
 * edit can never be overwritten by the scaffold.
 */
export async function createProjectDeclarationExclusively<Path>(
  io: ProjectDeclarationCreateIo<Path>,
  staging: Path,
  target: Path,
  content: Uint8Array,
  beforeCommit: () => void = () => undefined,
): Promise<"created" | "already-exists"> {
  let stagingExists = false;
  try {
    await io.writeFile(staging, content);
    stagingExists = true;
    beforeCommit();
    await io.renameWithoutOverwrite(staging, target);
    stagingExists = false;
    return "created";
  } catch (error) {
    if (stagingExists) {
      try {
        await io.delete(staging);
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          "Prompt Optimizer could not clean up a staged project declaration.",
        );
      }
    }
    if (isExistingPathError(error)) return "already-exists";
    throw error;
  }
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DwiProjectDeclarationError(`${path} must be a mapping.`);
  }
  return value as Record<string, unknown>;
}

function onlyKeys(value: Record<string, unknown>, allowed: readonly string[], path: string): void {
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unexpected.length) {
    throw new DwiProjectDeclarationError(`${path} contains unsupported fields: ${unexpected.sort().join(", ")}.`);
  }
}

function optionalString(value: unknown, path: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !value.trim()) {
    throw new DwiProjectDeclarationError(`${path} must be a non-empty string.`);
  }
  return value.trim();
}

function stringArray(value: unknown, path: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string" && item.trim())) {
    throw new DwiProjectDeclarationError(`${path} must be an array of non-empty strings.`);
  }
  const normalized = value.map((item) => (item as string).trim());
  if (new Set(normalized).size !== normalized.length) {
    throw new DwiProjectDeclarationError(`${path} must not contain duplicates.`);
  }
  return normalized;
}

function relativeDirectory(value: unknown, path: string, allowProjectRoot = true): string {
  const normalized = optionalString(value, path);
  if (!normalized) throw new DwiProjectDeclarationError(`${path} is required.`);
  if (
    (normalized === "." && !allowProjectRoot) ||
    (normalized !== "." && (normalized.includes("\\") ||
      normalized.startsWith("/") ||
      /^[a-z][a-z0-9+.-]*:/i.test(normalized) ||
      normalized.split("/").some((part) => !part || part === "." || part === "..")))
  ) {
    throw new DwiProjectDeclarationError(`${path} must be a normalized repository-relative directory.`);
  }
  return normalized;
}

function identity(value: unknown): Partial<DwiProjectIdentity> | undefined {
  if (value === undefined) return undefined;
  const input = record(value, "spec.identity");
  onlyKeys(input, ["description", "componentType", "lifecycle", "owners", "system", "domain", "tags"], "spec.identity");
  return {
    ...(optionalString(input.description, "spec.identity.description") ? { description: optionalString(input.description, "spec.identity.description") } : {}),
    ...(optionalString(input.componentType, "spec.identity.componentType") ? { componentType: optionalString(input.componentType, "spec.identity.componentType") } : {}),
    ...(optionalString(input.lifecycle, "spec.identity.lifecycle") ? { lifecycle: optionalString(input.lifecycle, "spec.identity.lifecycle") } : {}),
    ...(stringArray(input.owners, "spec.identity.owners") ? { owners: stringArray(input.owners, "spec.identity.owners") } : {}),
    ...(optionalString(input.system, "spec.identity.system") ? { system: optionalString(input.system, "spec.identity.system") } : {}),
    ...(optionalString(input.domain, "spec.identity.domain") ? { domain: optionalString(input.domain, "spec.identity.domain") } : {}),
    ...(stringArray(input.tags, "spec.identity.tags") ? { tags: stringArray(input.tags, "spec.identity.tags") } : {}),
  };
}

function boundaries(value: unknown): Partial<DwiProjectBoundaries> | undefined {
  if (value === undefined) return undefined;
  const input = record(value, "spec.boundaries");
  const keys = ["providesApis", "consumesApis", "dependsOn", "componentRoots", "generatedRoots", "excludedRoots"] as const;
  onlyKeys(input, keys, "spec.boundaries");
  return Object.fromEntries(
    keys.flatMap((key) => {
      const parsed = stringArray(input[key], `spec.boundaries.${key}`);
      const value = parsed && ["componentRoots", "generatedRoots", "excludedRoots"].includes(key)
        ? parsed.map((item, index) => relativeDirectory(item, `spec.boundaries.${key}[${index}]`, key === "componentRoots"))
        : parsed;
      return value ? [[key, value]] : [];
    }),
  );
}

function workflows(value: unknown): DwiProjectWorkflow[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new DwiProjectDeclarationError("spec.workflows must be an array.");
  const supportedKinds = new Set<DwiProjectWorkflow["kind"]>(["build", "test", "lint", "format", "typecheck", "run", "deploy", "custom"]);
  const result = value.map((item, index): DwiProjectWorkflow => {
    const path = `spec.workflows[${index}]`;
    const input = record(item, path);
    onlyKeys(input, ["id", "kind", "argv", "cwd", "description"], path);
    const id = optionalString(input.id, `${path}.id`);
    const kind = optionalString(input.kind, `${path}.kind`) as DwiProjectWorkflow["kind"] | undefined;
    const argv = stringArray(input.argv, `${path}.argv`);
    if (!id || !kind || !argv?.length) throw new DwiProjectDeclarationError(`${path} requires id, kind, and non-empty argv.`);
    if (!supportedKinds.has(kind)) throw new DwiProjectDeclarationError(`${path}.kind is not supported.`);
    return {
      id,
      kind,
      argv,
      cwd: relativeDirectory(input.cwd, `${path}.cwd`),
      ...(optionalString(input.description, `${path}.description`) ? { description: optionalString(input.description, `${path}.description`) } : {}),
    };
  });
  if (new Set(result.map(({ id }) => id)).size !== result.length) {
    throw new DwiProjectDeclarationError("spec.workflows ids must be unique.");
  }
  return result;
}

function constraints(value: unknown): Partial<DwiProjectConstraints> | undefined {
  if (value === undefined) return undefined;
  const input = record(value, "spec.constraints");
  onlyKeys(input, ["supportedPlatforms", "networkRequiredForBuild", "architectureRules"], "spec.constraints");
  if (input.networkRequiredForBuild !== undefined && typeof input.networkRequiredForBuild !== "boolean") {
    throw new DwiProjectDeclarationError("spec.constraints.networkRequiredForBuild must be boolean.");
  }
  return {
    ...(stringArray(input.supportedPlatforms, "spec.constraints.supportedPlatforms") ? { supportedPlatforms: stringArray(input.supportedPlatforms, "spec.constraints.supportedPlatforms") } : {}),
    ...(typeof input.networkRequiredForBuild === "boolean" ? { networkRequiredForBuild: input.networkRequiredForBuild } : {}),
    ...(stringArray(input.architectureRules, "spec.constraints.architectureRules") ? { architectureRules: stringArray(input.architectureRules, "spec.constraints.architectureRules") } : {}),
  };
}

export function parseProjectDeclaration(text: string): DwiProjectDeclaration {
  if (Buffer.byteLength(text, "utf8") > DWI_PROJECT_DECLARATION_MAX_BYTES) {
    throw new DwiProjectDeclarationError(`file exceeds ${DWI_PROJECT_DECLARATION_MAX_BYTES} bytes.`);
  }
  let parsed: unknown;
  try {
    const document = parseDocument(text, {
      schema: "core",
      strict: true,
      uniqueKeys: true,
    });
    if (document.errors.length) {
      throw new DwiProjectDeclarationError(document.errors.map(({ message }) => message).join("; "));
    }
    parsed = document.toJS({ maxAliasCount: 0 });
  } catch (error) {
    if (error instanceof DwiProjectDeclarationError) throw error;
    throw new DwiProjectDeclarationError(error instanceof Error ? error.message : "YAML could not be parsed.");
  }
  const input = record(parsed, "document");
  onlyKeys(input, ["apiVersion", "kind", "metadata", "spec"], "document");
  if (input.apiVersion !== "dwi.dev/v1") throw new DwiProjectDeclarationError("apiVersion must equal dwi.dev/v1.");
  if (input.kind !== "Project") throw new DwiProjectDeclarationError("kind must equal Project.");

  let parsedMetadata: DwiProjectDeclaration["metadata"];
  if (input.metadata !== undefined) {
    const metadata = record(input.metadata, "metadata");
    onlyKeys(metadata, ["name", "namespace"], "metadata");
    parsedMetadata = {
      ...(optionalString(metadata.name, "metadata.name") ? { name: optionalString(metadata.name, "metadata.name") } : {}),
      ...(optionalString(metadata.namespace, "metadata.namespace") ? { namespace: optionalString(metadata.namespace, "metadata.namespace") } : {}),
    };
  }

  let parsedSpec: DwiProjectDeclaration["spec"];
  if (input.spec !== undefined) {
    const spec = record(input.spec, "spec");
    onlyKeys(spec, ["identity", "boundaries", "workflows", "constraints"], "spec");
    const parsedIdentity = identity(spec.identity);
    const parsedBoundaries = boundaries(spec.boundaries);
    const parsedWorkflows = workflows(spec.workflows);
    const parsedConstraints = constraints(spec.constraints);
    parsedSpec = {
      ...(parsedIdentity ? { identity: parsedIdentity } : {}),
      ...(parsedBoundaries ? { boundaries: parsedBoundaries } : {}),
      ...(parsedWorkflows ? { workflows: parsedWorkflows } : {}),
      ...(parsedConstraints ? { constraints: parsedConstraints } : {}),
    };
  }
  return {
    apiVersion: "dwi.dev/v1",
    kind: "Project",
    ...(parsedMetadata ? { metadata: parsedMetadata } : {}),
    ...(parsedSpec ? { spec: parsedSpec } : {}),
  };
}
