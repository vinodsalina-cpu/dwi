import {
  Ajv2020,
  type ErrorObject,
  type ValidateFunction,
} from "ajv/dist/2020.js";

export const DWI_PROJECT_API_VERSION = "dwi.dev/v1" as const;
export const DWI_PROJECT_KIND = "Project" as const;
export const DWI_PROJECT_SCHEMA_VERSION = "1.0" as const;
const DWI_MAX_STRING_ARRAY_ITEMS = 512;
const DWI_MAX_PROJECT_PATH_ITEMS = 1_024;
const DWI_MAX_EVIDENCE_REFERENCE_ITEMS = 1_024;

export type DwiJsonPrimitive = string | number | boolean | null;
export type DwiJsonValue =
  | DwiJsonPrimitive
  | DwiJsonValue[]
  | { [key: string]: DwiJsonValue };

export type DwiClaimConfidence = "high" | "medium" | "low";
export type DwiClaimState = "accepted" | "pending" | "rejected" | "superseded";
export type DwiClaimAuthority =
  | "human"
  | "catalog"
  | "declaration"
  | "deterministic"
  | "restricted-probe"
  | "ai";
export type DwiProposalState = "pending" | "accepted" | "rejected" | "auto-accepted";
export type DwiProposalRisk = "low" | "medium" | "high";
export type DwiCoverageDimension =
  | "identity"
  | "toolchain"
  | "verification"
  | "architecture"
  | "documentation";
export type DwiCoverageLevel = "complete" | "partial" | "incomplete" | "unsupported";
export type DwiResolutionStatus = "current" | "partial" | "conflict" | "unsupported";

export interface DwiProjectSource {
  repository?: string;
  root: string;
  remoteIdentityHash?: string;
}

export interface DwiProjectRevision {
  commit?: string;
  branch?: string;
  dirty?: boolean;
  evidenceDigest?: string;
  generatedAt: string;
}

export interface DwiSnapshotReview {
  state: "unreviewed" | "approved" | "changes-requested";
  reviewedAt?: string;
  reviewedBy?: string;
  reviewedSnapshotHash?: string;
}

export interface DwiProjectMetadata {
  id: string;
  name: string;
  namespace: string;
  schemaVersion: string;
  source: DwiProjectSource;
  revision: DwiProjectRevision;
  review: DwiSnapshotReview;
}

export interface DwiProjectIdentity {
  description?: string;
  componentType?: string;
  lifecycle?: string;
  owners: string[];
  system?: string;
  domain?: string;
  tags: string[];
}

export interface DwiProjectBoundaries {
  providesApis: string[];
  consumesApis: string[];
  dependsOn: string[];
  componentRoots: string[];
  generatedRoots: string[];
  excludedRoots: string[];
}

export type DwiWorkflowKind =
  | "build"
  | "test"
  | "lint"
  | "format"
  | "typecheck"
  | "run"
  | "deploy"
  | "custom";

export interface DwiProjectWorkflow {
  id: string;
  kind: DwiWorkflowKind;
  argv: string[];
  cwd: string;
  description?: string;
}

export interface DwiProjectConstraints {
  supportedPlatforms: string[];
  networkRequiredForBuild?: boolean;
  architectureRules: string[];
}

export interface DwiProjectSpec {
  identity: DwiProjectIdentity;
  boundaries: DwiProjectBoundaries;
  workflows: DwiProjectWorkflow[];
  constraints: DwiProjectConstraints;
}

export interface DwiLanguageObservation {
  id: string;
  name?: string;
  versionConstraint?: string;
  roots: string[];
}

export interface DwiEcosystemObservation {
  id: string;
  name?: string;
  /** A single manager known to apply to every listed ecosystem root. */
  packageManager?: string;
  /** Root-scoped bindings for mixed-manager or partially resolved workspaces. */
  packageManagers?: Array<{
    id: string;
    roots: string[];
    version?: string;
  }>;
  version?: string;
  roots: string[];
}

export interface DwiNamedObservation {
  id: string;
  name?: string;
  version?: string;
  roots: string[];
}

export interface DwiComponentObservation {
  id: string;
  name: string;
  root: string;
  type?: string;
}

export interface DwiEntrypointObservation {
  id: string;
  path: string;
  kind?: string;
}

export interface DwiDocumentObservation {
  id: string;
  path: string;
  title?: string;
}

export interface DwiDependencyArtifactObservation {
  id: string;
  path: string;
  format: string;
  sha256?: string;
}

export interface DwiSecuritySignalObservation {
  id: string;
  kind: string;
  path?: string;
  value?: string;
}

export interface DwiObservedFacts {
  languages: DwiLanguageObservation[];
  ecosystems: DwiEcosystemObservation[];
  frameworks: DwiNamedObservation[];
  toolchains: DwiNamedObservation[];
  components: DwiComponentObservation[];
  entrypoints: DwiEntrypointObservation[];
  ciSystems: DwiNamedObservation[];
  documentation: DwiDocumentObservation[];
  dependencyArtifacts: DwiDependencyArtifactObservation[];
  securitySignals: DwiSecuritySignalObservation[];
}

export type DwiEvidenceKind =
  | "declaration"
  | "manifest"
  | "lockfile"
  | "source"
  | "documentation"
  | "catalog"
  | "probe"
  | "human";

export interface DwiProbeRecord {
  executable: string;
  argv: string[];
  exitCode: number;
  durationMs: number;
}

export interface DwiEvidence {
  id: string;
  kind: DwiEvidenceKind;
  relativePath?: string;
  selector?: string;
  sha256?: string;
  content?: string;
  parser?: string;
  probe?: DwiProbeRecord;
  collectedAt: string;
  redactions: string[];
}

export interface DwiClaim {
  id: string;
  path: string;
  value: DwiJsonValue;
  state: DwiClaimState;
  confidence: DwiClaimConfidence;
  authority: DwiClaimAuthority;
  evidenceRefs: string[];
  extractor?: string;
  observedAt?: string;
  expiresAt?: string;
}

export interface DwiProposal {
  id: string;
  path: string;
  value: DwiJsonValue;
  producer: "ai" | "human" | "importer";
  state: DwiProposalState;
  risk: DwiProposalRisk;
  model?: string;
  evidenceRefs: string[];
  createdAt: string;
}

export interface DwiConflict {
  path: string;
  claimIds: string[];
  selectedClaimId: string;
  reason: string;
}

export interface DwiUnknown {
  path: string;
  reason: string;
  required: boolean;
  evidenceRefs?: string[];
}

export type DwiCoverage = Record<DwiCoverageDimension, DwiCoverageLevel>;

export interface DwiEffectiveSnapshot {
  spec: DwiProjectSpec;
  observed: DwiObservedFacts;
}

export interface DwiProjectResolution {
  status: DwiResolutionStatus;
  coverage: DwiCoverage;
  conflicts: DwiConflict[];
  unknowns: DwiUnknown[];
  effectiveSnapshot: DwiEffectiveSnapshot;
  effectiveSnapshotHash: string;
}

export interface DwiProjectSnapshot {
  apiVersion: typeof DWI_PROJECT_API_VERSION;
  kind: typeof DWI_PROJECT_KIND;
  metadata: DwiProjectMetadata;
  spec: DwiProjectSpec;
  observed: DwiObservedFacts;
  claims: DwiClaim[];
  evidence: DwiEvidence[];
  proposals: DwiProposal[];
  resolution: DwiProjectResolution;
}

export interface DwiProjectMetadataSeed {
  id: string;
  name: string;
  namespace?: string;
  schemaVersion?: string;
  source?: Partial<DwiProjectSource>;
  revision?: Partial<DwiProjectRevision>;
  review?: Partial<DwiSnapshotReview>;
}

export interface DwiProjectSnapshotSeed {
  metadata: DwiProjectMetadataSeed;
  spec?: Partial<DwiProjectSpec> & {
    identity?: Partial<DwiProjectIdentity>;
    boundaries?: Partial<DwiProjectBoundaries>;
    constraints?: Partial<DwiProjectConstraints>;
  };
  observed?: Partial<DwiObservedFacts>;
  claims?: DwiClaim[];
  evidence?: DwiEvidence[];
  proposals?: DwiProposal[];
  unknowns?: DwiUnknown[];
  coverage?: Partial<DwiCoverage>;
}

export type DwiProjectSnapshotSource = Omit<DwiProjectSnapshot, "resolution">;

export interface DwiResolutionOptions {
  unknowns?: readonly DwiUnknown[];
  coverageOverrides?: Partial<DwiCoverage>;
}

export interface DwiSchemaIssue {
  path: string;
  code: string;
  message: string;
}

export interface DwiSchemaValidationResult {
  valid: boolean;
  issues: DwiSchemaIssue[];
}

export class DwiProjectSchemaError extends Error {
  readonly issues: DwiSchemaIssue[];

  constructor(issues: readonly DwiSchemaIssue[]) {
    super(`Invalid DWI project snapshot: ${issues.map((issue) => `${issue.path} ${issue.message}`).join("; ")}`);
    this.name = "DwiProjectSchemaError";
    this.issues = [...issues];
  }
}

export class DwiBackstageMappingError extends Error {
  readonly missingFields: string[];
  readonly invalidFields: string[];
  readonly unresolvedFields: string[];

  constructor(
    missingFields: readonly string[] = [],
    invalidFields: readonly string[] = [],
    unresolvedFields: readonly string[] = [],
  ) {
    const problems = [
      ...(missingFields.length ? [`missing ${missingFields.join(", ")}`] : []),
      ...(invalidFields.length ? [`invalid ${invalidFields.join(", ")}`] : []),
      ...(unresolvedFields.length ? [`unresolved ${unresolvedFields.join(", ")}`] : []),
    ];
    super(`Cannot map project to a Backstage Component; ${problems.join("; ")}.`);
    this.name = "DwiBackstageMappingError";
    this.missingFields = [...missingFields];
    this.invalidFields = [...invalidFields];
    this.unresolvedFields = [...unresolvedFields];
  }
}

export interface BackstageComponentEntity {
  apiVersion: "backstage.io/v1alpha1";
  kind: "Component";
  metadata: {
    name: string;
    namespace: string;
    description?: string;
    tags?: string[];
    annotations: Record<string, string>;
  };
  spec: {
    type: string;
    lifecycle: string;
    owner: string;
    system?: string;
    subcomponentOf?: string;
    providesApis?: string[];
    consumesApis?: string[];
    dependsOn?: string[];
  };
}

/**
 * Portable contract for persisted snapshots. Runtime validation below adds
 * referential-integrity and policy checks that JSON Schema cannot express.
 */
export const DWI_PROJECT_SNAPSHOT_JSON_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://dwi.dev/schema/project-snapshot-v1.json",
  title: "DWI Project Snapshot",
  type: "object",
  additionalProperties: false,
  required: [
    "apiVersion",
    "kind",
    "metadata",
    "spec",
    "observed",
    "claims",
    "evidence",
    "proposals",
    "resolution",
  ],
  allOf: [
    {
      if: {
        properties: {
          metadata: {
            type: "object",
            properties: {
              review: {
                type: "object",
                properties: { state: { const: "approved" } },
                required: ["state"],
              },
            },
            required: ["review"],
          },
        },
        required: ["metadata"],
      },
      then: {
        properties: {
          metadata: {
            type: "object",
            properties: {
              review: {
                type: "object",
                properties: {
                  reviewedSnapshotHash: {
                    type: "string",
                    pattern: "^sha256:[a-f0-9]{64}$",
                  },
                },
                required: ["reviewedSnapshotHash"],
              },
            },
            required: ["review"],
          },
        },
        required: ["metadata"],
      },
    },
  ],
  properties: {
    apiVersion: { const: DWI_PROJECT_API_VERSION },
    kind: { const: DWI_PROJECT_KIND },
    metadata: { $ref: "#/$defs/metadata" },
    spec: { $ref: "#/$defs/spec" },
    observed: { $ref: "#/$defs/observed" },
    claims: { type: "array", items: { $ref: "#/$defs/claim" } },
    evidence: { type: "array", items: { $ref: "#/$defs/evidence" } },
    proposals: { type: "array", items: { $ref: "#/$defs/proposal" } },
    resolution: { $ref: "#/$defs/resolution" },
  },
  $defs: {
    nonEmptyString: {
      type: "string",
      minLength: 1,
      maxLength: 1024,
      pattern: "^(?!\\s)(?!.*\\s$)[^\\u0000-\\u001f\\u007f]+$",
    },
    boundedText: {
      type: "string",
      maxLength: 8192,
      pattern: "^(?=[\\s\\S]*\\S)[^\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f\\u007f]*$",
    },
    boundedEvidenceText: {
      type: "string",
      maxLength: 262144,
      pattern: "^[^\\u0000-\\u0008\\u000b\\u000c\\u000e-\\u001f\\u007f]*$",
    },
    stringArray: {
      type: "array",
      maxItems: DWI_MAX_STRING_ARRAY_ITEMS,
      items: { $ref: "#/$defs/nonEmptyString" },
      uniqueItems: true,
    },
    nonEmptyStringArray: {
      type: "array",
      minItems: 1,
      maxItems: DWI_MAX_STRING_ARRAY_ITEMS,
      items: { $ref: "#/$defs/nonEmptyString" },
      uniqueItems: true,
    },
    evidenceReferenceArray: {
      type: "array",
      maxItems: DWI_MAX_EVIDENCE_REFERENCE_ITEMS,
      items: { $ref: "#/$defs/nonEmptyString" },
      uniqueItems: true,
    },
    timestamp: { type: "string", format: "date-time" },
    relativePath: {
      type: "string",
      minLength: 1,
      maxLength: 4096,
      pattern:
        "^(?!\\s)(?!.*\\s$)(?!.*[\\u0000-\\u001f\\u007f])(?!\\.\\.?$)(?!/)(?!.*\\\\)(?!.*//)(?!.*\\/$)(?![A-Za-z][A-Za-z0-9+.-]*:)(?!.*(?:^|/)\\.\\.?(?:/|$)).+$",
    },
    projectPath: {
      anyOf: [{ const: "." }, { $ref: "#/$defs/relativePath" }],
    },
    metadata: {
      type: "object",
      additionalProperties: false,
      required: ["id", "name", "namespace", "schemaVersion", "source", "revision", "review"],
      properties: {
        id: { $ref: "#/$defs/nonEmptyString" },
        name: { $ref: "#/$defs/nonEmptyString" },
        namespace: { $ref: "#/$defs/nonEmptyString" },
        schemaVersion: { const: DWI_PROJECT_SCHEMA_VERSION },
        source: {
          type: "object",
          additionalProperties: false,
          required: ["root"],
          properties: {
            repository: { $ref: "#/$defs/nonEmptyString" },
            root: { $ref: "#/$defs/projectPath" },
            remoteIdentityHash: { $ref: "#/$defs/nonEmptyString" },
          },
        },
        revision: {
          type: "object",
          additionalProperties: false,
          required: ["generatedAt"],
          properties: {
            commit: { $ref: "#/$defs/nonEmptyString" },
            branch: { $ref: "#/$defs/nonEmptyString" },
            dirty: { type: "boolean" },
            evidenceDigest: { type: "string", pattern: "^[a-f0-9]{64}$" },
            generatedAt: { $ref: "#/$defs/timestamp" },
          },
        },
        review: {
          type: "object",
          additionalProperties: false,
          required: ["state"],
          allOf: [
            {
              if: {
                properties: { state: { const: "approved" } },
                required: ["state"],
              },
              then: {
                properties: {
                  reviewedAt: { $ref: "#/$defs/timestamp" },
                  reviewedBy: { $ref: "#/$defs/nonEmptyString" },
                },
                required: ["reviewedAt", "reviewedBy"],
              },
            },
          ],
          properties: {
            state: { enum: ["unreviewed", "approved", "changes-requested"] },
            reviewedAt: { $ref: "#/$defs/timestamp" },
            reviewedBy: { $ref: "#/$defs/nonEmptyString" },
            reviewedSnapshotHash: {
              type: "string",
              pattern: "^sha256:[a-f0-9]{64}$",
            },
          },
        },
      },
    },
    identity: {
      type: "object",
      additionalProperties: false,
      required: ["owners", "tags"],
      properties: {
        description: { $ref: "#/$defs/boundedText" },
        componentType: { $ref: "#/$defs/nonEmptyString" },
        lifecycle: { $ref: "#/$defs/nonEmptyString" },
        owners: { $ref: "#/$defs/stringArray" },
        system: { $ref: "#/$defs/nonEmptyString" },
        domain: { $ref: "#/$defs/nonEmptyString" },
        tags: { $ref: "#/$defs/stringArray" },
      },
    },
    boundaries: {
      type: "object",
      additionalProperties: false,
      required: [
        "providesApis",
        "consumesApis",
        "dependsOn",
        "componentRoots",
        "generatedRoots",
        "excludedRoots",
      ],
      properties: {
        providesApis: { $ref: "#/$defs/stringArray" },
        consumesApis: { $ref: "#/$defs/stringArray" },
        dependsOn: { $ref: "#/$defs/stringArray" },
        componentRoots: { $ref: "#/$defs/projectPathArray" },
        generatedRoots: { $ref: "#/$defs/relativePathArray" },
        excludedRoots: { $ref: "#/$defs/relativePathArray" },
      },
    },
    workflow: {
      type: "object",
      additionalProperties: false,
      required: ["id", "kind", "argv", "cwd"],
      properties: {
        id: { $ref: "#/$defs/nonEmptyString" },
        kind: { enum: ["build", "test", "lint", "format", "typecheck", "run", "deploy", "custom"] },
        argv: { type: "array", minItems: 1, maxItems: 256, items: { $ref: "#/$defs/nonEmptyString" } },
        cwd: { $ref: "#/$defs/projectPath" },
        description: { $ref: "#/$defs/boundedText" },
      },
    },
    constraints: {
      type: "object",
      additionalProperties: false,
      required: ["supportedPlatforms", "architectureRules"],
      properties: {
        supportedPlatforms: { $ref: "#/$defs/stringArray" },
        networkRequiredForBuild: { type: "boolean" },
        architectureRules: { $ref: "#/$defs/stringArray" },
      },
    },
    spec: {
      type: "object",
      additionalProperties: false,
      required: ["identity", "boundaries", "workflows", "constraints"],
      properties: {
        identity: { $ref: "#/$defs/identity" },
        boundaries: { $ref: "#/$defs/boundaries" },
        workflows: { type: "array", items: { $ref: "#/$defs/workflow" } },
        constraints: { $ref: "#/$defs/constraints" },
      },
    },
    projectPathArray: {
      type: "array",
      maxItems: DWI_MAX_PROJECT_PATH_ITEMS,
      items: { $ref: "#/$defs/projectPath" },
      uniqueItems: true,
    },
    relativePathArray: {
      type: "array",
      maxItems: DWI_MAX_STRING_ARRAY_ITEMS,
      items: { $ref: "#/$defs/relativePath" },
      uniqueItems: true,
    },
    languageObservation: {
      type: "object",
      additionalProperties: false,
      required: ["id", "roots"],
      properties: {
        id: { $ref: "#/$defs/nonEmptyString" },
        name: { $ref: "#/$defs/nonEmptyString" },
        versionConstraint: { $ref: "#/$defs/nonEmptyString" },
        roots: { $ref: "#/$defs/projectPathArray" },
      },
    },
    ecosystemObservation: {
      type: "object",
      additionalProperties: false,
      required: ["id", "roots"],
      properties: {
        id: { $ref: "#/$defs/nonEmptyString" },
        name: { $ref: "#/$defs/nonEmptyString" },
        packageManager: { $ref: "#/$defs/nonEmptyString" },
        packageManagers: {
          type: "array",
          items: { $ref: "#/$defs/packageManagerBinding" },
        },
        version: { $ref: "#/$defs/nonEmptyString" },
        roots: { $ref: "#/$defs/projectPathArray" },
      },
    },
    packageManagerBinding: {
      type: "object",
      additionalProperties: false,
      required: ["id", "roots"],
      properties: {
        id: { $ref: "#/$defs/nonEmptyString" },
        roots: {
          type: "array",
          minItems: 1,
          maxItems: DWI_MAX_PROJECT_PATH_ITEMS,
          items: { $ref: "#/$defs/projectPath" },
          uniqueItems: true,
        },
        version: { $ref: "#/$defs/nonEmptyString" },
      },
    },
    namedObservation: {
      type: "object",
      additionalProperties: false,
      required: ["id", "roots"],
      properties: {
        id: { $ref: "#/$defs/nonEmptyString" },
        name: { $ref: "#/$defs/nonEmptyString" },
        version: { $ref: "#/$defs/nonEmptyString" },
        roots: { $ref: "#/$defs/projectPathArray" },
      },
    },
    componentObservation: {
      type: "object",
      additionalProperties: false,
      required: ["id", "name", "root"],
      properties: {
        id: { $ref: "#/$defs/nonEmptyString" },
        name: { $ref: "#/$defs/nonEmptyString" },
        root: { $ref: "#/$defs/projectPath" },
        type: { $ref: "#/$defs/nonEmptyString" },
      },
    },
    entrypointObservation: {
      type: "object",
      additionalProperties: false,
      required: ["id", "path"],
      properties: {
        id: { $ref: "#/$defs/nonEmptyString" },
        path: { $ref: "#/$defs/relativePath" },
        kind: { $ref: "#/$defs/nonEmptyString" },
      },
    },
    documentObservation: {
      type: "object",
      additionalProperties: false,
      required: ["id", "path"],
      properties: {
        id: { $ref: "#/$defs/nonEmptyString" },
        path: { $ref: "#/$defs/relativePath" },
        title: { $ref: "#/$defs/nonEmptyString" },
      },
    },
    dependencyArtifactObservation: {
      type: "object",
      additionalProperties: false,
      required: ["id", "path", "format"],
      properties: {
        id: { $ref: "#/$defs/nonEmptyString" },
        path: { $ref: "#/$defs/relativePath" },
        format: { $ref: "#/$defs/nonEmptyString" },
        sha256: { type: "string", pattern: "^(?:sha256:)?[a-f0-9]{64}$" },
      },
    },
    securitySignalObservation: {
      type: "object",
      additionalProperties: false,
      required: ["id", "kind"],
      properties: {
        id: { $ref: "#/$defs/nonEmptyString" },
        kind: { $ref: "#/$defs/nonEmptyString" },
        path: { $ref: "#/$defs/relativePath" },
        value: { $ref: "#/$defs/boundedText" },
      },
    },
    observed: {
      type: "object",
      additionalProperties: false,
      required: [
        "languages",
        "ecosystems",
        "frameworks",
        "toolchains",
        "components",
        "entrypoints",
        "ciSystems",
        "documentation",
        "dependencyArtifacts",
        "securitySignals",
      ],
      properties: {
        languages: { type: "array", items: { $ref: "#/$defs/languageObservation" } },
        ecosystems: { type: "array", items: { $ref: "#/$defs/ecosystemObservation" } },
        frameworks: { type: "array", items: { $ref: "#/$defs/namedObservation" } },
        toolchains: { type: "array", items: { $ref: "#/$defs/namedObservation" } },
        components: { type: "array", items: { $ref: "#/$defs/componentObservation" } },
        entrypoints: { type: "array", items: { $ref: "#/$defs/entrypointObservation" } },
        ciSystems: { type: "array", items: { $ref: "#/$defs/namedObservation" } },
        documentation: { type: "array", items: { $ref: "#/$defs/documentObservation" } },
        dependencyArtifacts: {
          type: "array",
          items: { $ref: "#/$defs/dependencyArtifactObservation" },
        },
        securitySignals: {
          type: "array",
          items: { $ref: "#/$defs/securitySignalObservation" },
        },
      },
    },
    claim: {
      type: "object",
      additionalProperties: false,
      required: ["id", "path", "value", "state", "confidence", "authority", "evidenceRefs"],
      properties: {
        id: { $ref: "#/$defs/nonEmptyString" },
        path: { type: "string", pattern: "^/(spec|observed)(/|$)" },
        value: {},
        state: { enum: ["accepted", "pending", "rejected", "superseded"] },
        confidence: { enum: ["high", "medium", "low"] },
        authority: { enum: ["human", "catalog", "declaration", "deterministic", "restricted-probe", "ai"] },
        evidenceRefs: { $ref: "#/$defs/evidenceReferenceArray" },
        extractor: { $ref: "#/$defs/nonEmptyString" },
        observedAt: { $ref: "#/$defs/timestamp" },
        expiresAt: { $ref: "#/$defs/timestamp" },
      },
    },
    evidence: {
      type: "object",
      additionalProperties: false,
      required: ["id", "kind", "collectedAt", "redactions"],
      properties: {
        id: { $ref: "#/$defs/nonEmptyString" },
        kind: { enum: ["declaration", "manifest", "lockfile", "source", "documentation", "catalog", "probe", "human"] },
        relativePath: { $ref: "#/$defs/relativePath" },
        selector: { $ref: "#/$defs/nonEmptyString" },
        sha256: { type: "string", pattern: "^(?:sha256:)?[a-f0-9]{64}$" },
        content: { $ref: "#/$defs/boundedEvidenceText" },
        parser: { $ref: "#/$defs/nonEmptyString" },
        probe: {
          type: "object",
          additionalProperties: false,
          required: ["executable", "argv", "exitCode", "durationMs"],
          properties: {
            executable: { $ref: "#/$defs/nonEmptyString" },
            argv: { type: "array", maxItems: 256, items: { $ref: "#/$defs/nonEmptyString" } },
            exitCode: { type: "integer" },
            durationMs: { type: "number", minimum: 0 },
          },
        },
        collectedAt: { $ref: "#/$defs/timestamp" },
        redactions: { $ref: "#/$defs/stringArray" },
      },
    },
    proposal: {
      type: "object",
      additionalProperties: false,
      required: ["id", "path", "value", "producer", "state", "risk", "evidenceRefs", "createdAt"],
      properties: {
        id: { $ref: "#/$defs/nonEmptyString" },
        path: { type: "string", pattern: "^/(spec|observed)(/|$)" },
        value: {},
        producer: { enum: ["ai", "human", "importer"] },
        state: { enum: ["pending", "accepted", "rejected", "auto-accepted"] },
        risk: { enum: ["low", "medium", "high"] },
        model: { $ref: "#/$defs/nonEmptyString" },
        evidenceRefs: { $ref: "#/$defs/evidenceReferenceArray" },
        createdAt: { $ref: "#/$defs/timestamp" },
      },
    },
    conflict: {
      type: "object",
      additionalProperties: false,
      required: ["path", "claimIds", "selectedClaimId", "reason"],
      properties: {
        path: { type: "string", pattern: "^/(spec|observed)(/|$)" },
        claimIds: { $ref: "#/$defs/nonEmptyStringArray" },
        selectedClaimId: { $ref: "#/$defs/nonEmptyString" },
        reason: { $ref: "#/$defs/nonEmptyString" },
      },
    },
    unknown: {
      type: "object",
      additionalProperties: false,
      required: ["path", "reason", "required"],
      properties: {
        path: { type: "string", pattern: "^/(spec|observed)(/|$)" },
        reason: { $ref: "#/$defs/nonEmptyString" },
        required: { type: "boolean" },
        evidenceRefs: { $ref: "#/$defs/evidenceReferenceArray" },
      },
    },
    resolution: {
      type: "object",
      additionalProperties: false,
      required: ["status", "coverage", "conflicts", "unknowns", "effectiveSnapshot", "effectiveSnapshotHash"],
      allOf: [
        {
          if: {
            type: "object",
            properties: { status: { const: "current" } },
            required: ["status"],
          },
          then: {
            type: "object",
            properties: {
              unknowns: {
                type: "array",
                not: {
                  type: "array",
                  contains: {
                    type: "object",
                    required: ["required"],
                    properties: { required: { const: true } },
                  },
                },
              },
            },
          },
        },
      ],
      properties: {
        status: { enum: ["current", "partial", "conflict", "unsupported"] },
        coverage: {
          type: "object",
          additionalProperties: false,
          required: ["identity", "toolchain", "verification", "architecture", "documentation"],
          properties: Object.fromEntries(
            ["identity", "toolchain", "verification", "architecture", "documentation"].map((key) => [
              key,
              { enum: ["complete", "partial", "incomplete", "unsupported"] },
            ]),
          ),
        },
        conflicts: { type: "array", items: { $ref: "#/$defs/conflict" } },
        unknowns: { type: "array", items: { $ref: "#/$defs/unknown" } },
        effectiveSnapshot: {
          type: "object",
          additionalProperties: false,
          required: ["spec", "observed"],
          properties: { spec: { $ref: "#/$defs/spec" }, observed: { $ref: "#/$defs/observed" } },
        },
        effectiveSnapshotHash: { type: "string", pattern: "^sha256:[a-f0-9]{64}$" },
      },
    },
  },
} as const;

let compiledProjectSnapshotSchema: ValidateFunction<unknown> | undefined;
let compiledProjectSnapshotSourceSchema: ValidateFunction<unknown> | undefined;

const DWI_PROJECT_SNAPSHOT_SOURCE_JSON_SCHEMA = {
  $schema: DWI_PROJECT_SNAPSHOT_JSON_SCHEMA.$schema,
  $id: "https://dwi.dev/schema/project-snapshot-source-v1.json",
  type: "object",
  additionalProperties: false,
  required: [
    "apiVersion",
    "kind",
    "metadata",
    "spec",
    "observed",
    "claims",
    "evidence",
    "proposals",
  ],
  properties: {
    apiVersion: DWI_PROJECT_SNAPSHOT_JSON_SCHEMA.properties.apiVersion,
    kind: DWI_PROJECT_SNAPSHOT_JSON_SCHEMA.properties.kind,
    metadata: DWI_PROJECT_SNAPSHOT_JSON_SCHEMA.properties.metadata,
    spec: DWI_PROJECT_SNAPSHOT_JSON_SCHEMA.properties.spec,
    observed: DWI_PROJECT_SNAPSHOT_JSON_SCHEMA.properties.observed,
    claims: DWI_PROJECT_SNAPSHOT_JSON_SCHEMA.properties.claims,
    evidence: DWI_PROJECT_SNAPSHOT_JSON_SCHEMA.properties.evidence,
    proposals: DWI_PROJECT_SNAPSHOT_JSON_SCHEMA.properties.proposals,
  },
  $defs: DWI_PROJECT_SNAPSHOT_JSON_SCHEMA.$defs,
} as const;

function createProjectSnapshotSchemaValidator(
  schema: object,
): ValidateFunction<unknown> {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    formats: {
      "date-time": {
        type: "string",
        validate: isTimestamp,
      },
    },
  });
  return ajv.compile(schema);
}

function schemaIssuePath(error: ErrorObject): string {
  let path = error.instancePath;
  const property =
    error.keyword === "required"
      ? (error.params as { missingProperty?: string }).missingProperty
      : error.keyword === "additionalProperties"
        ? (error.params as { additionalProperty?: string }).additionalProperty
        : undefined;
  if (property) {
    const escaped = property.replace(/~/g, "~0").replace(/\//g, "~1");
    path = `${path}/${escaped}`;
  }
  return path || "/";
}

function validateAgainstProjectSnapshotSchema(value: unknown): DwiSchemaIssue[] {
  let validator = compiledProjectSnapshotSchema;
  if (!validator) {
    validator = createProjectSnapshotSchemaValidator(
      DWI_PROJECT_SNAPSHOT_JSON_SCHEMA as unknown as object,
    );
    compiledProjectSnapshotSchema = validator;
  }
  if (validator(value)) return [];
  return (validator.errors ?? []).map((error) => ({
    path: schemaIssuePath(error),
    code: error.keyword,
    message: error.message ?? "does not satisfy the project snapshot schema.",
  }));
}

function validateProjectSnapshotSourceSchema(value: unknown): DwiSchemaIssue[] {
  let validator = compiledProjectSnapshotSourceSchema;
  if (!validator) {
    validator = createProjectSnapshotSchemaValidator(
      DWI_PROJECT_SNAPSHOT_SOURCE_JSON_SCHEMA as unknown as object,
    );
    compiledProjectSnapshotSourceSchema = validator;
  }
  if (validator(value)) return [];
  return (validator.errors ?? []).map((error) => ({
    path: schemaIssuePath(error),
    code: error.keyword,
    message: error.message ?? "does not satisfy the project snapshot source schema.",
  }));
}

export const DWI_DEFAULT_AUTHORITY_PRECEDENCE: readonly DwiClaimAuthority[] = [
  "human",
  "declaration",
  "catalog",
  "deterministic",
  "restricted-probe",
  "ai",
];

const CATALOG_FIRST_PATHS = [
  "/spec/identity/owners",
] as const;

const PROBE_FIRST_PATHS = [
  "/observed/toolchains",
] as const;

export function claimAuthorityPrecedence(path: string): readonly DwiClaimAuthority[] {
  if (CATALOG_FIRST_PATHS.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
    return ["human", "catalog", "declaration", "deterministic", "restricted-probe", "ai"];
  }
  if (PROBE_FIRST_PATHS.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
    return ["human", "restricted-probe", "deterministic", "declaration", "catalog", "ai"];
  }
  return DWI_DEFAULT_AUTHORITY_PRECEDENCE;
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function canonicalJsonStringify(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Canonical JSON does not support non-finite numbers.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJsonStringify(item)).join(",")}]`;
  }
  if (isRecord(value)) {
    const entries = Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => compareCodeUnits(left, right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJsonStringify(item)}`).join(",")}}`;
  }
  throw new TypeError(`Canonical JSON does not support ${typeof value} values.`);
}

const SHA256_CONSTANTS = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4,
  0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe,
  0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f,
  0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
  0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc,
  0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116,
  0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7,
  0xc67178f2,
] as const;

function rotateRight(value: number, distance: number): number {
  return (value >>> distance) | (value << (32 - distance));
}

export function sha256Hex(text: string): string {
  const input = new TextEncoder().encode(text);
  const paddedLength = Math.ceil((input.length + 9) / 64) * 64;
  const bytes = new Uint8Array(paddedLength);
  bytes.set(input);
  bytes[input.length] = 0x80;
  const view = new DataView(bytes.buffer);
  const bitLength = input.length * 8;
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x1_0000_0000), false);
  view.setUint32(paddedLength - 4, bitLength >>> 0, false);

  const state = new Uint32Array([
    0x6a09e667,
    0xbb67ae85,
    0x3c6ef372,
    0xa54ff53a,
    0x510e527f,
    0x9b05688c,
    0x1f83d9ab,
    0x5be0cd19,
  ]);
  const words = new Uint32Array(64);

  for (let offset = 0; offset < bytes.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) words[index] = view.getUint32(offset + index * 4, false);
    for (let index = 16; index < 64; index += 1) {
      const previous15 = words[index - 15]!;
      const previous2 = words[index - 2]!;
      const sigma0 = rotateRight(previous15, 7) ^ rotateRight(previous15, 18) ^ (previous15 >>> 3);
      const sigma1 = rotateRight(previous2, 17) ^ rotateRight(previous2, 19) ^ (previous2 >>> 10);
      words[index] = (words[index - 16]! + sigma0 + words[index - 7]! + sigma1) >>> 0;
    }

    let a = state[0]!;
    let b = state[1]!;
    let c = state[2]!;
    let d = state[3]!;
    let e = state[4]!;
    let f = state[5]!;
    let g = state[6]!;
    let h = state[7]!;
    for (let index = 0; index < 64; index += 1) {
      const sigma1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choose = (e & f) ^ (~e & g);
      const temp1 = (h + sigma1 + choose + SHA256_CONSTANTS[index]! + words[index]!) >>> 0;
      const sigma0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (sigma0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }
    state[0] = (state[0]! + a) >>> 0;
    state[1] = (state[1]! + b) >>> 0;
    state[2] = (state[2]! + c) >>> 0;
    state[3] = (state[3]! + d) >>> 0;
    state[4] = (state[4]! + e) >>> 0;
    state[5] = (state[5]! + f) >>> 0;
    state[6] = (state[6]! + g) >>> 0;
    state[7] = (state[7]! + h) >>> 0;
  }

  return [...state].map((value) => value.toString(16).padStart(8, "0")).join("");
}

/**
 * Binds a human review to all persisted project content and provenance while
 * excluding the hash field itself to avoid a circular digest.
 */
export function projectSnapshotReviewHash(snapshot: DwiProjectSnapshot): string {
  const { reviewedSnapshotHash: _reviewedSnapshotHash, ...review } =
    snapshot.metadata.review;
  const reviewableSnapshot = {
    ...snapshot,
    metadata: {
      ...snapshot.metadata,
      review,
    },
  };
  return `sha256:${sha256Hex(canonicalJsonStringify(reviewableSnapshot))}`;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
}

function isSafeRelativePath(value: string, allowProjectRoot = false): boolean {
  if (value === ".") return allowProjectRoot;
  const normalized = value.replace(/\\/g, "/");
  return (
    normalized === value &&
    !normalized.startsWith("/") &&
    !/^[a-z][a-z0-9+.-]*:/i.test(normalized) &&
    normalized.split("/").every((part) => Boolean(part) && part !== "." && part !== "..")
  );
}

function emptyBoundaries(input?: Partial<DwiProjectBoundaries>): DwiProjectBoundaries {
  return {
    providesApis: uniqueSorted(input?.providesApis ?? []),
    consumesApis: uniqueSorted(input?.consumesApis ?? []),
    dependsOn: uniqueSorted(input?.dependsOn ?? []),
    componentRoots: uniqueSorted(input?.componentRoots ?? []),
    generatedRoots: uniqueSorted(input?.generatedRoots ?? []),
    excludedRoots: uniqueSorted(input?.excludedRoots ?? []),
  };
}

function emptyObserved(input?: Partial<DwiObservedFacts>): DwiObservedFacts {
  return {
    languages: clone(input?.languages ?? []),
    ecosystems: clone(input?.ecosystems ?? []),
    frameworks: clone(input?.frameworks ?? []),
    toolchains: clone(input?.toolchains ?? []),
    components: clone(input?.components ?? []),
    entrypoints: clone(input?.entrypoints ?? []),
    ciSystems: clone(input?.ciSystems ?? []),
    documentation: clone(input?.documentation ?? []),
    dependencyArtifacts: clone(input?.dependencyArtifacts ?? []),
    securitySignals: clone(input?.securitySignals ?? []),
  };
}

export interface DwiCreateSnapshotOptions {
  generatedAt?: string;
}

export function createProjectSnapshot(
  seed: DwiProjectSnapshotSeed,
  options: DwiCreateSnapshotOptions = {},
): DwiProjectSnapshot {
  const generatedAt = seed.metadata.revision?.generatedAt ?? options.generatedAt ?? new Date().toISOString();
  const source: DwiProjectSnapshotSource = {
    apiVersion: DWI_PROJECT_API_VERSION,
    kind: DWI_PROJECT_KIND,
    metadata: {
      id: seed.metadata.id.trim(),
      name: seed.metadata.name.trim(),
      namespace: seed.metadata.namespace?.trim() || "default",
      schemaVersion: seed.metadata.schemaVersion ?? DWI_PROJECT_SCHEMA_VERSION,
      source: {
        ...(seed.metadata.source?.repository ? { repository: seed.metadata.source.repository } : {}),
        root: seed.metadata.source?.root ?? ".",
        ...(seed.metadata.source?.remoteIdentityHash
          ? { remoteIdentityHash: seed.metadata.source.remoteIdentityHash }
          : {}),
      },
      revision: {
        ...(seed.metadata.revision?.commit ? { commit: seed.metadata.revision.commit } : {}),
        ...(seed.metadata.revision?.branch ? { branch: seed.metadata.revision.branch } : {}),
        ...(seed.metadata.revision?.dirty !== undefined
          ? { dirty: seed.metadata.revision.dirty }
          : {}),
        ...(seed.metadata.revision?.evidenceDigest !== undefined
          ? { evidenceDigest: seed.metadata.revision.evidenceDigest }
          : {}),
        generatedAt,
      },
      review: {
        state: seed.metadata.review?.state ?? "unreviewed",
        ...(seed.metadata.review?.reviewedAt ? { reviewedAt: seed.metadata.review.reviewedAt } : {}),
        ...(seed.metadata.review?.reviewedBy ? { reviewedBy: seed.metadata.review.reviewedBy } : {}),
        ...(seed.metadata.review?.reviewedSnapshotHash !== undefined
          ? { reviewedSnapshotHash: seed.metadata.review.reviewedSnapshotHash }
          : {}),
      },
    },
    spec: {
      identity: {
        ...(seed.spec?.identity?.description ? { description: seed.spec.identity.description } : {}),
        ...(seed.spec?.identity?.componentType ? { componentType: seed.spec.identity.componentType } : {}),
        ...(seed.spec?.identity?.lifecycle ? { lifecycle: seed.spec.identity.lifecycle } : {}),
        owners: uniqueSorted(seed.spec?.identity?.owners ?? []),
        ...(seed.spec?.identity?.system ? { system: seed.spec.identity.system } : {}),
        ...(seed.spec?.identity?.domain ? { domain: seed.spec.identity.domain } : {}),
        tags: uniqueSorted(seed.spec?.identity?.tags ?? []),
      },
      boundaries: emptyBoundaries(seed.spec?.boundaries),
      workflows: clone(seed.spec?.workflows ?? []),
      constraints: {
        supportedPlatforms: uniqueSorted(seed.spec?.constraints?.supportedPlatforms ?? []),
        ...(typeof seed.spec?.constraints?.networkRequiredForBuild === "boolean"
          ? { networkRequiredForBuild: seed.spec.constraints.networkRequiredForBuild }
          : {}),
        architectureRules: uniqueSorted(seed.spec?.constraints?.architectureRules ?? []),
      },
    },
    observed: emptyObserved(seed.observed),
    claims: clone(seed.claims ?? []),
    evidence: clone(seed.evidence ?? []),
    proposals: clone(seed.proposals ?? []),
  };
  return resolveProjectSnapshot(source, {
    unknowns: seed.unknowns,
    coverageOverrides: seed.coverage,
  });
}

function decodePointer(path: string): string[] | null {
  if (!path.startsWith("/")) return null;
  const parts = path
    .slice(1)
    .split("/")
    .map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"));
  if (
    parts.length < 2 ||
    (parts[0] !== "spec" && parts[0] !== "observed") ||
    parts.some((part) => !part || part === "__proto__" || part === "prototype" || part === "constructor")
  ) {
    return null;
  }
  return parts;
}

function setPointer(root: DwiEffectiveSnapshot, path: string, value: DwiJsonValue): boolean {
  const parts = decodePointer(path);
  if (!parts) return false;
  let cursor: unknown = root;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index]!;
    const next = parts[index + 1]!;
    if (Array.isArray(cursor)) {
      if (!/^\d+$/.test(part)) return false;
      const arrayIndex = Number(part);
      if (arrayIndex > cursor.length) return false;
      if (cursor[arrayIndex] === undefined) cursor[arrayIndex] = /^\d+$/.test(next) ? [] : {};
      cursor = cursor[arrayIndex];
    } else if (isRecord(cursor)) {
      if (cursor[part] === undefined) cursor[part] = /^\d+$/.test(next) ? [] : {};
      cursor = cursor[part];
    } else {
      return false;
    }
  }
  const last = parts.at(-1)!;
  const cloned = clone(value);
  if (Array.isArray(cursor)) {
    if (!/^\d+$/.test(last)) return false;
    const arrayIndex = Number(last);
    if (arrayIndex > cursor.length) return false;
    cursor[arrayIndex] = cloned;
    return true;
  }
  if (!isRecord(cursor)) return false;
  cursor[last] = cloned;
  return true;
}

function getPointer(root: DwiEffectiveSnapshot, path: string): DwiJsonValue | undefined {
  const parts = decodePointer(path);
  if (!parts) return undefined;
  let cursor: unknown = root;
  for (const part of parts) {
    if (Array.isArray(cursor)) {
      if (!/^\d+$/.test(part)) return undefined;
      const index = Number(part);
      if (index >= cursor.length) return undefined;
      cursor = cursor[index];
      continue;
    }
    if (!isRecord(cursor) || !Object.hasOwn(cursor, part)) return undefined;
    cursor = cursor[part];
  }
  return cursor as DwiJsonValue | undefined;
}

function compareClaims(path: string, left: DwiClaim, right: DwiClaim): number {
  const precedence = claimAuthorityPrecedence(path);
  const authority = precedence.indexOf(left.authority) - precedence.indexOf(right.authority);
  if (authority !== 0) return authority;
  const confidence: Record<DwiClaimConfidence, number> = { high: 0, medium: 1, low: 2 };
  const confidenceResult = confidence[left.confidence] - confidence[right.confidence];
  if (confidenceResult !== 0) return confidenceResult;
  const freshness = compareCodeUnits(right.observedAt ?? "", left.observedAt ?? "");
  return freshness || compareCodeUnits(left.id, right.id);
}

interface DwiClaimSelection {
  path: string;
  candidates: DwiClaim[];
  selected: DwiClaim;
}

function selectedAcceptedClaims(
  source: Pick<DwiProjectSnapshotSource, "metadata" | "claims">,
): DwiClaimSelection[] {
  const acceptedByPath = new Map<string, DwiClaim[]>();
  const referenceTime = Date.parse(source.metadata.revision.generatedAt);
  for (const claim of source.claims) {
    if (claim.state !== "accepted") continue;
    if (claim.expiresAt && Date.parse(claim.expiresAt) <= referenceTime) continue;
    const group = acceptedByPath.get(claim.path) ?? [];
    group.push(claim);
    acceptedByPath.set(claim.path, group);
  }
  return [...acceptedByPath.keys()]
    .sort(compareCodeUnits)
    .map((path) => {
      const candidates = acceptedByPath.get(path)!.sort((left, right) =>
        compareClaims(path, left, right)
      );
      return { path, candidates, selected: candidates[0]! };
    });
}

function dedupeUnknowns(unknowns: readonly DwiUnknown[]): DwiUnknown[] {
  const byKey = new Map<string, DwiUnknown>();
  for (const unknown of unknowns) {
    const key = `${unknown.path}\0${unknown.reason}`;
    if (!byKey.has(key)) byKey.set(key, clone(unknown));
  }
  return [...byKey.values()].sort((left, right) =>
    compareCodeUnits(left.path, right.path) || compareCodeUnits(left.reason, right.reason),
  );
}

function coverageAndUnknowns(effective: DwiEffectiveSnapshot): {
  coverage: DwiCoverage;
  unknowns: DwiUnknown[];
} {
  const { spec, observed } = effective;
  const identitySignals = [
    isNonEmptyString(spec.identity.componentType),
    spec.identity.owners.some(isNonEmptyString),
  ];
  const toolchainSignals = [observed.languages.length > 0, observed.toolchains.length + observed.ecosystems.length > 0];
  const workflowKinds = new Set(spec.workflows.map((workflow) => workflow.kind));
  const verificationSignals = [workflowKinds.has("test"), workflowKinds.has("build")];
  const boundaryCount =
    spec.boundaries.providesApis.length +
    spec.boundaries.consumesApis.length +
    spec.boundaries.dependsOn.length +
    spec.boundaries.componentRoots.length;
  const architectureSignals = [
    isNonEmptyString(spec.identity.componentType),
    observed.components.length + boundaryCount > 0,
  ];
  const documentationSignals = [
    isMeaningfulText(spec.identity.description),
    observed.documentation.length > 0,
  ];
  const level = (signals: readonly boolean[]): DwiCoverageLevel =>
    signals.every(Boolean) ? "complete" : signals.some(Boolean) ? "partial" : "incomplete";
  const coverage: DwiCoverage = {
    identity: level(identitySignals),
    toolchain: level(toolchainSignals),
    verification: level(verificationSignals),
    architecture: level(architectureSignals),
    documentation: level(documentationSignals),
  };
  const unknowns: DwiUnknown[] = [];
  const require = (present: boolean, path: string, reason: string) => {
    if (!present) unknowns.push({ path, reason, required: true });
  };
  require(identitySignals[0]!, "/spec/identity/componentType", "Component type is not declared or established.");
  require(identitySignals[1]!, "/spec/identity/owners", "No accountable owner is established.");
  require(toolchainSignals[0]!, "/observed/languages", "No supported language was observed.");
  require(toolchainSignals[1]!, "/observed/toolchains", "No ecosystem or toolchain was observed.");
  require(verificationSignals[0]!, "/spec/workflows", "No test workflow is established.");
  require(verificationSignals[1]!, "/spec/workflows", "No build workflow is established.");
  require(architectureSignals[1]!, "/spec/boundaries", "No component boundary or relationship is established.");
  require(documentationSignals[0] || documentationSignals[1]!, "/observed/documentation", "No project documentation is established.");
  return { coverage, unknowns };
}

function resolveProjectSnapshotUnchecked(
  source: DwiProjectSnapshotSource,
  options: DwiResolutionOptions = {},
): DwiProjectSnapshot {
  const effective: DwiEffectiveSnapshot = {
    spec: clone(source.spec),
    observed: clone(source.observed),
  };
  const conflicts: DwiConflict[] = [];
  const resolverUnknowns: DwiUnknown[] = [];
  for (const { path, candidates, selected } of selectedAcceptedClaims(source)) {
    if (!setPointer(effective, path, selected.value)) {
      resolverUnknowns.push({ path, reason: "Accepted claim targets an invalid effective-snapshot path.", required: true });
      continue;
    }
    const precedence = claimAuthorityPrecedence(path);
    const selectedRank = precedence.indexOf(selected.authority);
    const peers = candidates.filter((claim) => precedence.indexOf(claim.authority) === selectedRank);
    if (new Set(peers.map((claim) => canonicalJsonStringify(claim.value))).size > 1) {
      conflicts.push({
        path,
        claimIds: peers.map((claim) => claim.id).sort(compareCodeUnits),
        selectedClaimId: selected.id,
        reason: "Equally authoritative accepted claims disagree; deterministic selection requires review.",
      });
      resolverUnknowns.push({ path, reason: "Conflicting accepted claims require review.", required: true });
    }
  }

  const inferred = coverageAndUnknowns(effective);
  const coverage: DwiCoverage = { ...inferred.coverage, ...options.coverageOverrides };
  const unknowns = dedupeUnknowns([...inferred.unknowns, ...resolverUnknowns, ...(options.unknowns ?? [])]);
  const levels = Object.values(coverage);
  const hasRequiredUnknowns = unknowns.some((unknown) => unknown.required);
  const status: DwiResolutionStatus = conflicts.length
    ? "conflict"
    : levels.includes("unsupported")
      ? "unsupported"
      : levels.every((value) => value === "complete") && !hasRequiredUnknowns
        ? "current"
        : "partial";
  const result: DwiProjectSnapshot = {
    ...clone(source),
    resolution: {
      status,
      coverage,
      conflicts,
      unknowns,
      effectiveSnapshot: effective,
      effectiveSnapshotHash: `sha256:${sha256Hex(canonicalJsonStringify(effective))}`,
    },
  };
  return result;
}

export function resolveProjectSnapshot(
  source: DwiProjectSnapshotSource,
  options: DwiResolutionOptions = {},
): DwiProjectSnapshot {
  const sourceValidation = validateProjectSnapshotSourceSchema(source);
  if (sourceValidation.length > 0) throw new DwiProjectSchemaError(sourceValidation);
  const result = resolveProjectSnapshotUnchecked(source, options);
  if (
    result.metadata.review.state === "approved" &&
    result.metadata.review.reviewedSnapshotHash === undefined
  ) {
    result.metadata.review.reviewedSnapshotHash = projectSnapshotReviewHash(result);
  }
  const validation = validateProjectSnapshot(result);
  if (!validation.valid) throw new DwiProjectSchemaError(validation.issues);
  return result;
}

export const DWI_AI_AUTO_ACCEPT_PATHS = [
  "/spec/identity/description",
  "/spec/identity/tags",
] as const;

const CLAIM_STATES = new Set<DwiClaimState>(["accepted", "pending", "rejected", "superseded"]);
const CLAIM_CONFIDENCES = new Set<DwiClaimConfidence>(["high", "medium", "low"]);
const CLAIM_AUTHORITIES = new Set<DwiClaimAuthority>([
  "human",
  "catalog",
  "declaration",
  "deterministic",
  "restricted-probe",
  "ai",
]);
const PROPOSAL_STATES = new Set<DwiProposalState>(["pending", "accepted", "rejected", "auto-accepted"]);
const PROPOSAL_RISKS = new Set<DwiProposalRisk>(["low", "medium", "high"]);
const PROPOSAL_PRODUCERS = new Set<DwiProposal["producer"]>(["ai", "human", "importer"]);
const WORKFLOW_KINDS = new Set<DwiWorkflowKind>([
  "build",
  "test",
  "lint",
  "format",
  "typecheck",
  "run",
  "deploy",
  "custom",
]);
const EVIDENCE_KINDS = new Set<DwiEvidenceKind>([
  "declaration",
  "manifest",
  "lockfile",
  "source",
  "documentation",
  "catalog",
  "probe",
  "human",
]);
const COVERAGE_LEVELS = new Set<DwiCoverageLevel>(["complete", "partial", "incomplete", "unsupported"]);
const COVERAGE_DIMENSIONS: readonly DwiCoverageDimension[] = [
  "identity",
  "toolchain",
  "verification",
  "architecture",
  "documentation",
];

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" &&
    value.length <= 1024 &&
    value === value.trim() &&
    value.length > 0 &&
    !/[\u0000-\u001f\u007f]/.test(value);
}

function isMeaningfulText(value: unknown): value is string {
  return typeof value === "string" &&
    value.length <= 8192 &&
    value.trim().length > 0 &&
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value);
}

function isTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = /^(\d{4})-(\d{2})-(\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:[Zz]|[+-](\d{2}):(\d{2}))$/.exec(value);
  if (!match) return false;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, offsetHourText, offsetMinuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const offsetHour = offsetHourText === undefined ? 0 : Number(offsetHourText);
  const offsetMinute = offsetMinuteText === undefined ? 0 : Number(offsetMinuteText);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 0;
  return month >= 1 && month <= 12 &&
    day >= 1 && day <= daysInMonth &&
    hour <= 23 && minute <= 59 && second <= 60 &&
    offsetHour <= 23 && offsetMinute <= 59;
}

function validateKnownKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
  issue: (path: string, code: string, message: string) => void,
): void {
  const allowedKeys = new Set(allowed);
  for (const key of Object.keys(value)) {
    if (allowedKeys.has(key)) continue;
    const escaped = key.replace(/~/g, "~0").replace(/\//g, "~1");
    issue(`${path}/${escaped}`, "additionalProperties", "is not an allowed property.");
  }
}

function validateStringArray(
  value: unknown,
  path: string,
  issue: (path: string, code: string, message: string) => void,
  allowEmpty = true,
  maximumItems = DWI_MAX_STRING_ARRAY_ITEMS,
): value is string[] {
  if (!Array.isArray(value)) {
    issue(path, "type", "must be an array of strings.");
    return false;
  }
  if (!allowEmpty && value.length === 0) issue(path, "minItems", "must not be empty.");
  if (value.length > maximumItems) {
    issue(path, "maxItems", `must contain at most ${maximumItems} items.`);
  }
  if (!value.every(isNonEmptyString)) {
    issue(path, "type", "must contain only trimmed, non-empty, bounded strings without control characters.");
  }
  if (new Set(value).size !== value.length) issue(path, "uniqueItems", "must not contain duplicates.");
  return value.every(isNonEmptyString);
}

function validateIdObjects(
  value: unknown,
  path: string,
  issue: (path: string, code: string, message: string) => void,
): value is Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    issue(path, "type", "must be an array.");
    return false;
  }
  const identifiers: string[] = [];
  value.forEach((item, index) => {
    if (!isRecord(item)) {
      issue(`${path}/${index}`, "type", "must be an object.");
    } else if (!isNonEmptyString(item.id)) {
      issue(`${path}/${index}/id`, "required", "must be a non-empty identifier.");
    } else {
      identifiers.push(item.id);
    }
  });
  if (new Set(identifiers).size !== identifiers.length) issue(path, "uniqueIds", "must contain unique ids.");
  return value.every(isRecord);
}

function validateSpec(
  value: unknown,
  path: string,
  issue: (path: string, code: string, message: string) => void,
): value is DwiProjectSpec {
  if (!isRecord(value)) {
    issue(path, "type", "must be an object.");
    return false;
  }
  if (!isRecord(value.identity)) {
    issue(`${path}/identity`, "required", "must be an object.");
  } else {
    for (const key of ["componentType", "lifecycle", "system", "domain"] as const) {
      if (value.identity[key] !== undefined && !isNonEmptyString(value.identity[key])) {
        issue(`${path}/identity/${key}`, "type", "must be a trimmed, non-empty, bounded string without control characters.");
      }
    }
    if (value.identity.description !== undefined && !isMeaningfulText(value.identity.description)) {
      issue(`${path}/identity/description`, "type", "must be bounded meaningful text without disallowed control characters.");
    }
    validateStringArray(value.identity.owners, `${path}/identity/owners`, issue);
    validateStringArray(value.identity.tags, `${path}/identity/tags`, issue);
  }
  if (!isRecord(value.boundaries)) {
    issue(`${path}/boundaries`, "required", "must be an object.");
  } else {
    for (const key of [
      "providesApis",
      "consumesApis",
      "dependsOn",
      "generatedRoots",
      "excludedRoots",
    ]) {
      validateStringArray(value.boundaries[key], `${path}/boundaries/${key}`, issue);
    }
    validateStringArray(
      value.boundaries.componentRoots,
      `${path}/boundaries/componentRoots`,
      issue,
      true,
      DWI_MAX_PROJECT_PATH_ITEMS,
    );
  }
  if (!Array.isArray(value.workflows)) {
    issue(`${path}/workflows`, "type", "must be an array.");
  } else {
    const ids: string[] = [];
    value.workflows.forEach((workflow, index) => {
      const workflowPath = `${path}/workflows/${index}`;
      if (!isRecord(workflow)) {
        issue(workflowPath, "type", "must be an object.");
        return;
      }
      if (!isNonEmptyString(workflow.id)) issue(`${workflowPath}/id`, "required", "must be a non-empty identifier.");
      else ids.push(workflow.id);
      if (!WORKFLOW_KINDS.has(workflow.kind as DwiWorkflowKind)) issue(`${workflowPath}/kind`, "enum", "is not a supported workflow kind.");
      validateStringArray(workflow.argv, `${workflowPath}/argv`, issue, false);
      if (!isNonEmptyString(workflow.cwd) || !isSafeRelativePath(workflow.cwd, true)) issue(`${workflowPath}/cwd`, "path", "must be a safe relative path.");
    });
    if (new Set(ids).size !== ids.length) issue(`${path}/workflows`, "uniqueIds", "must contain unique ids.");
  }
  if (!isRecord(value.constraints)) {
    issue(`${path}/constraints`, "required", "must be an object.");
  } else {
    validateStringArray(value.constraints.supportedPlatforms, `${path}/constraints/supportedPlatforms`, issue);
    validateStringArray(value.constraints.architectureRules, `${path}/constraints/architectureRules`, issue);
  }
  return true;
}

function validateObserved(
  value: unknown,
  path: string,
  issue: (path: string, code: string, message: string) => void,
): value is DwiObservedFacts {
  if (!isRecord(value)) {
    issue(path, "type", "must be an object.");
    return false;
  }
  const keys: readonly (keyof DwiObservedFacts)[] = [
    "languages",
    "ecosystems",
    "frameworks",
    "toolchains",
    "components",
    "entrypoints",
    "ciSystems",
    "documentation",
    "dependencyArtifacts",
    "securitySignals",
  ];
  for (const key of keys) validateIdObjects(value[key], `${path}/${key}`, issue);
  if (Array.isArray(value.ecosystems)) {
    value.ecosystems.forEach((item, ecosystemIndex) => {
      if (!isRecord(item)) return;
      const ecosystemPath = `${path}/ecosystems/${ecosystemIndex}`;
      if (item.packageManager !== undefined && item.packageManagers !== undefined) {
        issue(
          `${ecosystemPath}/packageManagers`,
          "consistency",
          "cannot be combined with the ecosystem-wide packageManager field.",
        );
      }
      if (item.packageManagers === undefined) return;
      if (!Array.isArray(item.packageManagers)) return;
      const ecosystemRoots = new Set(
        Array.isArray(item.roots)
          ? item.roots.filter((root): root is string => typeof root === "string")
          : [],
      );
      const managerIds: string[] = [];
      const boundRoots = new Set<string>();
      item.packageManagers.forEach((binding, bindingIndex) => {
        if (!isRecord(binding)) return;
        const bindingPath = `${ecosystemPath}/packageManagers/${bindingIndex}`;
        if (isNonEmptyString(binding.id)) managerIds.push(binding.id);
        if (!Array.isArray(binding.roots)) return;
        for (const root of binding.roots) {
          if (typeof root !== "string") continue;
          if (!ecosystemRoots.has(root)) {
            issue(`${bindingPath}/roots`, "reference", "must reference roots listed by the ecosystem.");
          }
          if (boundRoots.has(root)) {
            issue(`${bindingPath}/roots`, "conflict", "must not bind one root to multiple package managers.");
          }
          boundRoots.add(root);
        }
      });
      if (new Set(managerIds).size !== managerIds.length) {
        issue(`${ecosystemPath}/packageManagers`, "uniqueIds", "must contain unique manager ids.");
      }
    });
  }
  return true;
}

function validateReferenceArray(
  value: unknown,
  path: string,
  evidenceIds: ReadonlySet<string>,
  issue: (path: string, code: string, message: string) => void,
): void {
  if (!validateStringArray(
    value,
    path,
    issue,
    true,
    DWI_MAX_EVIDENCE_REFERENCE_ITEMS,
  )) return;
  for (const reference of value) {
    if (!evidenceIds.has(reference)) issue(path, "reference", `references missing evidence '${reference}'.`);
  }
}

function isAllowedAiPath(path: string): boolean {
  return DWI_AI_AUTO_ACCEPT_PATHS.some((allowed) => path === allowed || path.startsWith(`${allowed}/`));
}

export function validateProjectSnapshot(value: unknown): DwiSchemaValidationResult {
  const issues: DwiSchemaIssue[] = [];
  const issue = (path: string, code: string, message: string) => issues.push({ path, code, message });
  if (!isRecord(value)) return { valid: false, issues: [{ path: "/", code: "type", message: "must be an object." }] };
  issues.push(...validateAgainstProjectSnapshotSchema(value));
  validateKnownKeys(
    value,
    ["apiVersion", "kind", "metadata", "spec", "observed", "claims", "evidence", "proposals", "resolution"],
    "",
    issue,
  );
  if (value.apiVersion !== DWI_PROJECT_API_VERSION) issue("/apiVersion", "const", `must equal '${DWI_PROJECT_API_VERSION}'.`);
  if (value.kind !== DWI_PROJECT_KIND) issue("/kind", "const", `must equal '${DWI_PROJECT_KIND}'.`);

  if (!isRecord(value.metadata)) {
    issue("/metadata", "required", "must be an object.");
  } else {
    if (!isNonEmptyString(value.metadata.id)) issue("/metadata/id", "required", "must be non-empty.");
    if (!isNonEmptyString(value.metadata.name)) issue("/metadata/name", "required", "must be non-empty.");
    if (!isNonEmptyString(value.metadata.namespace)) issue("/metadata/namespace", "required", "must be non-empty.");
    if (value.metadata.schemaVersion !== DWI_PROJECT_SCHEMA_VERSION) issue("/metadata/schemaVersion", "const", `must equal '${DWI_PROJECT_SCHEMA_VERSION}'.`);
    if (!isRecord(value.metadata.source)) {
      issue("/metadata/source", "required", "must be an object.");
    } else if (!isNonEmptyString(value.metadata.source.root) || !isSafeRelativePath(value.metadata.source.root, true)) {
      issue("/metadata/source/root", "path", "must be a safe relative path.");
    }
    if (!isRecord(value.metadata.revision) || !isTimestamp(value.metadata.revision.generatedAt)) {
      issue("/metadata/revision/generatedAt", "format", "must be an ISO timestamp.");
    } else {
      if (value.metadata.revision.commit !== undefined && typeof value.metadata.revision.commit !== "string") {
        issue("/metadata/revision/commit", "type", "must be a string.");
      }
      if (value.metadata.revision.branch !== undefined && typeof value.metadata.revision.branch !== "string") {
        issue("/metadata/revision/branch", "type", "must be a string.");
      }
      if (value.metadata.revision.dirty !== undefined && typeof value.metadata.revision.dirty !== "boolean") {
        issue("/metadata/revision/dirty", "type", "must be a boolean.");
      }
      if (
        value.metadata.revision.evidenceDigest !== undefined &&
        (typeof value.metadata.revision.evidenceDigest !== "string" ||
          !/^[a-f0-9]{64}$/.test(value.metadata.revision.evidenceDigest))
      ) {
        issue(
          "/metadata/revision/evidenceDigest",
          "format",
          "must be a raw lowercase SHA-256 digest.",
        );
      }
    }
    if (!isRecord(value.metadata.review)) {
      issue("/metadata/review", "required", "must be an object.");
    } else {
      if (![
        "unreviewed",
        "approved",
        "changes-requested",
      ].includes(String(value.metadata.review.state))) {
        issue("/metadata/review/state", "enum", "is not supported.");
      }
      if (
        value.metadata.review.reviewedAt !== undefined &&
        !isTimestamp(value.metadata.review.reviewedAt)
      ) {
        issue(
          "/metadata/review/reviewedAt",
          "format",
          "must be an ISO timestamp.",
        );
      }
      if (
        value.metadata.review.state === "approved" &&
        value.metadata.review.reviewedAt === undefined
      ) {
        issue(
          "/metadata/review/reviewedAt",
          "required",
          "is required for approved snapshots.",
        );
      }
      if (
        value.metadata.review.state === "approved" &&
        !isNonEmptyString(value.metadata.review.reviewedBy)
      ) {
        issue(
          "/metadata/review/reviewedBy",
          "required",
          "is required for approved snapshots.",
        );
      }
      if (
        value.metadata.review.state === "approved" &&
        value.metadata.review.reviewedSnapshotHash === undefined
      ) {
        issue(
          "/metadata/review/reviewedSnapshotHash",
          "required",
          "is required for approved snapshots.",
        );
      }
      if (
        value.metadata.review.reviewedSnapshotHash !== undefined &&
        (typeof value.metadata.review.reviewedSnapshotHash !== "string" ||
          !/^sha256:[a-f0-9]{64}$/.test(value.metadata.review.reviewedSnapshotHash))
      ) {
        issue(
          "/metadata/review/reviewedSnapshotHash",
          "format",
          "must be a prefixed lowercase SHA-256 digest.",
        );
      }
      if (
        value.metadata.review.reviewedSnapshotHash !== undefined &&
        value.metadata.review.state !== "approved"
      ) {
        issue(
          "/metadata/review/reviewedSnapshotHash",
          "consistency",
          "is only valid for an approved review.",
        );
      }
    }
  }

  validateSpec(value.spec, "/spec", issue);
  validateObserved(value.observed, "/observed", issue);

  const evidenceRecords = validateIdObjects(value.evidence, "/evidence", issue) ? value.evidence : [];
  const evidenceIds = new Set(
    evidenceRecords.flatMap((item) => (isNonEmptyString(item.id) ? [item.id] : [])),
  );
  evidenceRecords.forEach((evidence, index) => {
    const path = `/evidence/${index}`;
    validateKnownKeys(
      evidence,
      ["id", "kind", "relativePath", "selector", "sha256", "content", "parser", "probe", "collectedAt", "redactions"],
      path,
      issue,
    );
    if (!EVIDENCE_KINDS.has(evidence.kind as DwiEvidenceKind)) issue(`${path}/kind`, "enum", "is not a supported evidence kind.");
    if (!isTimestamp(evidence.collectedAt)) issue(`${path}/collectedAt`, "format", "must be an ISO timestamp.");
    if (evidence.relativePath !== undefined && (typeof evidence.relativePath !== "string" || !isSafeRelativePath(evidence.relativePath))) issue(`${path}/relativePath`, "path", "must be a safe relative path.");
    if (evidence.sha256 !== undefined && (typeof evidence.sha256 !== "string" || !/^(?:sha256:)?[a-f0-9]{64}$/.test(evidence.sha256))) issue(`${path}/sha256`, "format", "must be a SHA-256 digest.");
    if (evidence.selector !== undefined && !isNonEmptyString(evidence.selector)) issue(`${path}/selector`, "type", "must be a non-empty string.");
    if (evidence.content !== undefined && typeof evidence.content !== "string") issue(`${path}/content`, "type", "must be a string.");
    if (evidence.parser !== undefined && !isNonEmptyString(evidence.parser)) issue(`${path}/parser`, "type", "must be a non-empty string.");
    validateStringArray(evidence.redactions, `${path}/redactions`, issue);
    if (evidence.probe !== undefined) {
      if (!isRecord(evidence.probe)) {
        issue(`${path}/probe`, "type", "must be an object.");
      } else {
        validateKnownKeys(
          evidence.probe,
          ["executable", "argv", "exitCode", "durationMs"],
          `${path}/probe`,
          issue,
        );
        if (!isNonEmptyString(evidence.probe.executable)) issue(`${path}/probe/executable`, "required", "must be non-empty.");
        validateStringArray(evidence.probe.argv, `${path}/probe/argv`, issue);
        if (!Number.isInteger(evidence.probe.exitCode)) issue(`${path}/probe/exitCode`, "type", "must be an integer.");
        if (typeof evidence.probe.durationMs !== "number" || evidence.probe.durationMs < 0) issue(`${path}/probe/durationMs`, "minimum", "must be a non-negative number.");
      }
    }
  });

  const claimRecords = validateIdObjects(value.claims, "/claims", issue) ? value.claims : [];
  const claimIds = new Set(
    claimRecords.flatMap((item) => (isNonEmptyString(item.id) ? [item.id] : [])),
  );
  claimRecords.forEach((claim, index) => {
    const path = `/claims/${index}`;
    if (typeof claim.path !== "string" || !decodePointer(claim.path)) issue(`${path}/path`, "pointer", "must target /spec or /observed using a safe JSON pointer.");
    try {
      canonicalJsonStringify(claim.value);
    } catch {
      issue(`${path}/value`, "json", "must be a JSON value.");
    }
    if (!CLAIM_STATES.has(claim.state as DwiClaimState)) issue(`${path}/state`, "enum", "is not supported.");
    if (!CLAIM_CONFIDENCES.has(claim.confidence as DwiClaimConfidence)) issue(`${path}/confidence`, "enum", "is not supported.");
    if (!CLAIM_AUTHORITIES.has(claim.authority as DwiClaimAuthority)) issue(`${path}/authority`, "enum", "is not supported.");
    validateReferenceArray(claim.evidenceRefs, `${path}/evidenceRefs`, evidenceIds, issue);
    if (claim.observedAt !== undefined && !isTimestamp(claim.observedAt)) issue(`${path}/observedAt`, "format", "must be an ISO timestamp.");
    if (claim.expiresAt !== undefined && !isTimestamp(claim.expiresAt)) issue(`${path}/expiresAt`, "format", "must be an ISO timestamp.");
    if (claim.authority === "ai" && typeof claim.path === "string" && !isAllowedAiPath(claim.path)) issue(`${path}/path`, "aiPolicy", "AI claims are limited to low-risk narrative fields.");
  });

  const proposalRecords = validateIdObjects(value.proposals, "/proposals", issue) ? value.proposals : [];
  proposalRecords.forEach((proposal, index) => {
    const path = `/proposals/${index}`;
    validateKnownKeys(
      proposal,
      ["id", "path", "value", "producer", "state", "risk", "model", "evidenceRefs", "createdAt"],
      path,
      issue,
    );
    if (typeof proposal.path !== "string" || !decodePointer(proposal.path)) issue(`${path}/path`, "pointer", "must target /spec or /observed using a safe JSON pointer.");
    try {
      canonicalJsonStringify(proposal.value);
    } catch {
      issue(`${path}/value`, "json", "must be a JSON value.");
    }
    if (!PROPOSAL_STATES.has(proposal.state as DwiProposalState)) issue(`${path}/state`, "enum", "is not supported.");
    if (!PROPOSAL_RISKS.has(proposal.risk as DwiProposalRisk)) issue(`${path}/risk`, "enum", "is not supported.");
    if (!PROPOSAL_PRODUCERS.has(proposal.producer as DwiProposal["producer"])) issue(`${path}/producer`, "enum", "is not supported.");
    if (proposal.model !== undefined && !isNonEmptyString(proposal.model)) issue(`${path}/model`, "type", "must be a non-empty string.");
    validateReferenceArray(proposal.evidenceRefs, `${path}/evidenceRefs`, evidenceIds, issue);
    if (!isTimestamp(proposal.createdAt)) issue(`${path}/createdAt`, "format", "must be an ISO timestamp.");
    if (proposal.state === "auto-accepted" && (proposal.producer !== "ai" || proposal.risk !== "low" || typeof proposal.path !== "string" || !isAllowedAiPath(proposal.path))) issue(`${path}/state`, "aiPolicy", "auto-acceptance is limited to low-risk AI narrative proposals.");
  });

  if (!isRecord(value.resolution)) {
    issue("/resolution", "required", "must be an object.");
  } else {
    validateKnownKeys(
      value.resolution,
      ["status", "coverage", "conflicts", "unknowns", "effectiveSnapshot", "effectiveSnapshotHash"],
      "/resolution",
      issue,
    );
    if (!["current", "partial", "conflict", "unsupported"].includes(String(value.resolution.status))) issue("/resolution/status", "enum", "is not supported.");
    if (!isRecord(value.resolution.coverage)) {
      issue("/resolution/coverage", "required", "must be an object.");
    } else {
      for (const dimension of COVERAGE_DIMENSIONS) {
        if (!COVERAGE_LEVELS.has(value.resolution.coverage[dimension] as DwiCoverageLevel)) issue(`/resolution/coverage/${dimension}`, "enum", "is not a supported coverage level.");
      }
    }
    if (!Array.isArray(value.resolution.conflicts)) {
      issue("/resolution/conflicts", "type", "must be an array.");
    } else {
      value.resolution.conflicts.forEach((conflict, index) => {
        const path = `/resolution/conflicts/${index}`;
        if (!isRecord(conflict)) {
          issue(path, "type", "must be an object.");
          return;
        }
        validateKnownKeys(conflict, ["path", "claimIds", "selectedClaimId", "reason"], path, issue);
        if (typeof conflict.path !== "string" || !decodePointer(conflict.path)) {
          issue(`${path}/path`, "pointer", "must target /spec or /observed using a safe JSON pointer.");
        }
        const validClaimIds = validateStringArray(conflict.claimIds, `${path}/claimIds`, issue, false)
          ? (conflict.claimIds as string[])
          : undefined;
        if (validClaimIds) {
          for (const claimId of validClaimIds) {
            if (!claimIds.has(claimId)) issue(`${path}/claimIds`, "reference", `references missing claim '${claimId}'.`);
          }
        }
        if (!isNonEmptyString(conflict.selectedClaimId)) {
          issue(`${path}/selectedClaimId`, "required", "must be non-empty.");
        } else if (validClaimIds && !validClaimIds.includes(conflict.selectedClaimId)) {
          issue(`${path}/selectedClaimId`, "reference", "must identify one of the conflicting claims.");
        }
        if (!isNonEmptyString(conflict.reason)) issue(`${path}/reason`, "required", "must be non-empty.");
      });
    }
    if (!Array.isArray(value.resolution.unknowns)) {
      issue("/resolution/unknowns", "type", "must be an array.");
    } else {
      value.resolution.unknowns.forEach((unknown, index) => {
        const path = `/resolution/unknowns/${index}`;
        if (!isRecord(unknown)) {
          issue(path, "type", "must be an object.");
          return;
        }
        validateKnownKeys(unknown, ["path", "reason", "required", "evidenceRefs"], path, issue);
        if (typeof unknown.path !== "string" || !decodePointer(unknown.path)) {
          issue(`${path}/path`, "pointer", "must target /spec or /observed using a safe JSON pointer.");
        }
        if (!isNonEmptyString(unknown.reason)) issue(`${path}/reason`, "required", "must be non-empty.");
        if (typeof unknown.required !== "boolean") issue(`${path}/required`, "type", "must be a boolean.");
        if (unknown.evidenceRefs !== undefined) {
          validateReferenceArray(unknown.evidenceRefs, `${path}/evidenceRefs`, evidenceIds, issue);
        }
      });
      if (
        value.resolution.status === "current" &&
        value.resolution.unknowns.some((unknown) => isRecord(unknown) && unknown.required === true)
      ) {
        issue(
          "/resolution/status",
          "consistency",
          "cannot be current while required unknowns remain.",
        );
      }
    }
    if (!isRecord(value.resolution.effectiveSnapshot)) {
      issue("/resolution/effectiveSnapshot", "required", "must be an object.");
    } else {
      validateSpec(value.resolution.effectiveSnapshot.spec, "/resolution/effectiveSnapshot/spec", issue);
      validateObserved(value.resolution.effectiveSnapshot.observed, "/resolution/effectiveSnapshot/observed", issue);
      try {
        const expectedHash = `sha256:${sha256Hex(canonicalJsonStringify(value.resolution.effectiveSnapshot))}`;
        if (value.resolution.effectiveSnapshotHash !== expectedHash) issue("/resolution/effectiveSnapshotHash", "integrity", "does not match the effective snapshot.");
      } catch {
        issue("/resolution/effectiveSnapshot", "json", "must contain only canonical JSON values.");
      }
    }
  }
  if (issues.length === 0) {
    try {
      const snapshot = value as unknown as DwiProjectSnapshot;
      const reviewedSnapshotHash = snapshot.metadata.review.reviewedSnapshotHash;
      if (
        reviewedSnapshotHash !== undefined &&
        reviewedSnapshotHash !== projectSnapshotReviewHash(snapshot)
      ) {
        issue(
          "/metadata/review/reviewedSnapshotHash",
          "integrity",
          "does not match the reviewed snapshot content and provenance.",
        );
      }
      const { resolution: suppliedResolution, ...source } = snapshot;
      const recomputed = resolveProjectSnapshotUnchecked(source, {
        coverageOverrides: suppliedResolution.coverage,
        unknowns: suppliedResolution.unknowns,
      });
      if (
        canonicalJsonStringify(recomputed.resolution) !==
        canonicalJsonStringify(suppliedResolution)
      ) {
        issue(
          "/resolution",
          "integrity",
          "does not match deterministic resolution of the supplied source facts and claims.",
        );
      }
    } catch {
      issue("/resolution", "integrity", "could not be deterministically recomputed.");
    }
  }
  return { valid: issues.length === 0, issues };
}

function assertValidSnapshot(snapshot: DwiProjectSnapshot): void {
  const validation = validateProjectSnapshot(snapshot);
  if (!validation.valid) throw new DwiProjectSchemaError(validation.issues);
}

function observedName(item: { id: string; name?: string }): string {
  return item.name?.trim() || item.id;
}

const DWI_BRIEF_MAX_LIST_ITEMS = 128;
const DWI_BRIEF_MAX_FACTS = 64;
const DWI_BRIEF_MAX_SHORT_TEXT_BYTES = 512;
const DWI_BRIEF_MAX_FACT_VALUE_BYTES = 2_048;
const DWI_BRIEF_MAX_FACT_EVIDENCE_BYTES = 1_024;
const DWI_BRIEF_MAX_INLINE_EVIDENCE_REFS = 32;
const DWI_BRIEF_MAX_UNKNOWN_BYTES = 1_024;
const DWI_BRIEF_MAX_CORRECTIONS_BYTES = 4_096;
const UTF8_ENCODER = new TextEncoder();

function utf8ByteLength(value: string): number {
  return UTF8_ENCODER.encode(value).byteLength;
}

function utf8Prefix(value: string, maximumBytes: number): string {
  let result = "";
  let bytes = 0;
  for (const character of value) {
    const characterBytes = utf8ByteLength(character);
    if (bytes + characterBytes > maximumBytes) break;
    result += character;
    bytes += characterBytes;
  }
  return result;
}

function boundedBriefText(value: string, maximumBytes: number): string {
  if (utf8ByteLength(value) <= maximumBytes) return value;
  const suffix = `… [truncated; sha256:${sha256Hex(value)}]`;
  return `${utf8Prefix(value, maximumBytes - utf8ByteLength(suffix))}${suffix}`;
}

function stringListDigest(values: readonly string[]): string {
  return sha256Hex(canonicalJsonStringify(values));
}

function boundedBriefList(
  values: readonly string[],
  path: string,
  projectionUnknowns: string[],
  sort = true,
): string[] {
  const normalized = sort
    ? uniqueSorted(values)
    : [...new Set(values.map((value) => value.trim()).filter(Boolean))];
  if (normalized.length > DWI_BRIEF_MAX_LIST_ITEMS) {
    const omitted = normalized.slice(DWI_BRIEF_MAX_LIST_ITEMS);
    projectionUnknowns.push(
      `${path}: ${omitted.length} list items omitted from the bounded brief ` +
      `(sha256:${stringListDigest(omitted)}).`,
    );
  }
  return normalized
    .slice(0, DWI_BRIEF_MAX_LIST_ITEMS)
    .map((value) => boundedBriefText(value, DWI_BRIEF_MAX_SHORT_TEXT_BYTES));
}

function readableClaimValue(value: DwiJsonValue): string {
  const canonical = canonicalJsonStringify(value);
  const readable = typeof value === "string" ? value : canonical;
  if (utf8ByteLength(readable) <= DWI_BRIEF_MAX_FACT_VALUE_BYTES) return readable;
  return `[claim value omitted: ${utf8ByteLength(readable)} UTF-8 bytes; ` +
    `sha256:${sha256Hex(canonical)}]`;
}

function readableClaimEvidence(claim: DwiClaim): string {
  const references = [...new Set(claim.evidenceRefs)].sort(compareCodeUnits);
  if (references.length === 0) return claim.authority;
  const readable = references.join(", ");
  if (
    references.length <= DWI_BRIEF_MAX_INLINE_EVIDENCE_REFS &&
    utf8ByteLength(readable) <= DWI_BRIEF_MAX_FACT_EVIDENCE_BYTES
  ) {
    return readable;
  }
  return `${references.length} evidence references omitted; ` +
    `sha256:${sha256Hex(canonicalJsonStringify(references))}`;
}

function boundedBriefUnknowns(values: readonly string[]): string[] {
  const bounded = [...new Set(values.map((value) =>
    boundedBriefText(value, DWI_BRIEF_MAX_UNKNOWN_BYTES)
  ))];
  if (bounded.length <= DWI_BRIEF_MAX_LIST_ITEMS) return bounded;
  const visibleCount = DWI_BRIEF_MAX_LIST_ITEMS - 1;
  const omitted = bounded.slice(visibleCount);
  return [
    ...bounded.slice(0, visibleCount),
    `/resolution/unknowns: ${omitted.length} additional unknowns omitted from the bounded brief ` +
      `(sha256:${stringListDigest(omitted)}).`,
  ];
}

function boundedConflictSummary(conflicts: readonly DwiConflict[]): string {
  if (conflicts.length === 0) return "none";
  const rendered = conflicts.map((conflict) => `${conflict.path}: ${conflict.reason}`);
  const joined = rendered.join("; ");
  if (utf8ByteLength(joined) <= DWI_BRIEF_MAX_CORRECTIONS_BYTES) return joined;
  return `${conflicts.length} conflict details omitted from the bounded brief ` +
    `(sha256:${stringListDigest(rendered)}).`;
}

export function projectSnapshotCoveragePercent(snapshot: DwiProjectSnapshot): number {
  const weights: Record<DwiCoverageLevel, number> = {
    complete: 1,
    partial: 0.5,
    incomplete: 0,
    unsupported: 0,
  };
  const values = COVERAGE_DIMENSIONS.map((dimension) => weights[snapshot.resolution.coverage[dimension]]);
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 100);
}

export function projectSnapshotToBrief(
  snapshot: DwiProjectSnapshot,
): import("./index.js").DwiBrief {
  assertValidSnapshot(snapshot);
  const { spec, observed } = snapshot.resolution.effectiveSnapshot;
  const projectionUnknowns: string[] = [];
  const stack = boundedBriefList([
    ...observed.languages.map(observedName),
    ...observed.frameworks.map(observedName),
  ], "/observed/stack", projectionUnknowns);
  const managerRoots = new Map<string, Set<string>>();
  let hasRootScopedManagers = false;
  for (const ecosystem of observed.ecosystems) {
    if (ecosystem.packageManager) {
      const roots = managerRoots.get(ecosystem.packageManager) ?? new Set<string>();
      for (const root of ecosystem.roots) roots.add(root);
      managerRoots.set(ecosystem.packageManager, roots);
    }
    for (const binding of ecosystem.packageManagers ?? []) {
      hasRootScopedManagers = true;
      const roots = managerRoots.get(binding.id) ?? new Set<string>();
      for (const root of binding.roots) roots.add(root);
      managerRoots.set(binding.id, roots);
    }
  }
  const managerEntries = [...managerRoots.entries()].sort(([left], [right]) =>
    compareCodeUnits(left, right),
  );
  const packageManagerValue = managerEntries.length > 1 || hasRootScopedManagers
    ? managerEntries
      .map(([manager, roots]) => `${manager} @ ${[...roots].sort(compareCodeUnits).join(", ")}`)
      .join("; ")
    : managerEntries[0]?.[0] ??
      observed.ecosystems[0]?.name ??
      observed.ecosystems[0]?.id ??
      "";
  const packageManager = boundedBriefText(
    packageManagerValue,
    DWI_BRIEF_MAX_SHORT_TEXT_BYTES,
  );
  const scripts = boundedBriefList(
    spec.workflows.map((workflow) => workflow.id),
    "/spec/workflows",
    projectionUnknowns,
    false,
  );
  const modules = boundedBriefList([
    ...spec.boundaries.componentRoots,
    ...observed.components.map((component) => component.root),
  ], "/spec/boundaries/componentRoots", projectionUnknowns);
  const selectedClaims = selectedAcceptedClaims(snapshot)
    .filter(({ path, selected }) => {
      const effectiveValue = getPointer(snapshot.resolution.effectiveSnapshot, path);
      return effectiveValue !== undefined &&
        canonicalJsonStringify(effectiveValue) === canonicalJsonStringify(selected.value);
    })
    .map(({ selected }) => selected);
  if (selectedClaims.length > DWI_BRIEF_MAX_FACTS) {
    const omitted = selectedClaims.slice(DWI_BRIEF_MAX_FACTS);
    const omittedDescriptors = omitted.map((claim) => `${claim.path}\0${claim.id}`);
    projectionUnknowns.push(
      `/claims: ${omitted.length} effective accepted claims omitted from the bounded brief ` +
      `(sha256:${stringListDigest(omittedDescriptors)}).`,
    );
  }
  const facts = selectedClaims
    .slice(0, DWI_BRIEF_MAX_FACTS)
    .map((claim) => ({
      id: claim.id,
      label: boundedBriefText(
        claim.path.split("/").at(-1) ?? claim.path,
        DWI_BRIEF_MAX_SHORT_TEXT_BYTES,
      ),
      value: readableClaimValue(claim.value),
      confidence: claim.confidence,
      evidence: readableClaimEvidence(claim),
    }))
    .map((fact) => ({
      ...fact,
      id: boundedBriefText(fact.id, DWI_BRIEF_MAX_SHORT_TEXT_BYTES),
    }));
  const unknowns = boundedBriefUnknowns([
    ...projectionUnknowns,
    ...snapshot.resolution.unknowns.map((unknown) => `${unknown.path}: ${unknown.reason}`),
  ]);
  return {
    version: "dwi.brief.v1",
    projectName: boundedBriefText(snapshot.metadata.name, DWI_BRIEF_MAX_SHORT_TEXT_BYTES),
    archetype: boundedBriefText(
      spec.identity.componentType ?? "unknown",
      DWI_BRIEF_MAX_SHORT_TEXT_BYTES,
    ),
    stack,
    packageManager,
    scripts,
    modules,
    facts,
    unknowns,
    confirmed:
      snapshot.metadata.review.state === "approved" &&
      snapshot.metadata.review.reviewedSnapshotHash !== undefined &&
      snapshot.metadata.review.reviewedSnapshotHash === projectSnapshotReviewHash(snapshot) &&
      snapshot.resolution.status === "current" &&
      !snapshot.resolution.unknowns.some((unknown) => unknown.required),
    corrections: boundedConflictSummary(snapshot.resolution.conflicts),
  };
}

function backstageName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "")
    .slice(0, 63);
}

function mapBackstageEntityRef(
  value: string,
  defaultKind: string,
  field: string,
): string {
  const normalized = value.trim().toLowerCase();
  let rawKind = defaultKind;
  let rawNamespace = "default";
  let rawName = normalized;
  const fullyQualified = /^([^:]+):([^/]+)\/([^/]+)$/.exec(normalized);
  const kindShorthand = /^([^:/]+):([^:/]+)$/.exec(normalized);
  const namespaceShorthand = /^([^:/]+)\/([^:/]+)$/.exec(normalized);
  if (fullyQualified) {
    [, rawKind, rawNamespace, rawName] = fullyQualified;
  } else if (kindShorthand) {
    [, rawKind, rawName] = kindShorthand;
  } else if (namespaceShorthand) {
    [, rawNamespace, rawName] = namespaceShorthand;
  } else if (normalized.includes(":") || normalized.includes("/")) {
    throw new DwiBackstageMappingError([], [field]);
  }
  const kind = backstageName(rawKind);
  const namespace = backstageName(rawNamespace);
  const name = backstageName(rawName);
  if (!kind || !namespace || !name) {
    throw new DwiBackstageMappingError([], [field]);
  }
  return `${kind}:${namespace}/${name}`;
}

export function toBackstageEntityRef(value: string, defaultKind: string): string {
  return mapBackstageEntityRef(value, defaultKind, "reference");
}

function optionalReferences(
  values: readonly string[],
  defaultKind: string,
  field: string,
): string[] | undefined {
  return values.length
    ? values
      .map((value, index) => mapBackstageEntityRef(value, defaultKind, `${field}[${index}]`))
      .sort(compareCodeUnits)
    : undefined;
}

export function projectSnapshotToBackstageComponent(
  snapshot: DwiProjectSnapshot,
): BackstageComponentEntity {
  assertValidSnapshot(snapshot);
  const unresolvedFields = uniqueSorted([
    ...snapshot.resolution.conflicts.map(({ path }) => path),
    ...snapshot.resolution.unknowns
      .filter(({ required }) => required)
      .map(({ path }) => path),
    ...(snapshot.resolution.status === "conflict" || snapshot.resolution.status === "unsupported"
      ? ["resolution.status"]
      : []),
  ]);
  const effective = snapshot.resolution.effectiveSnapshot;
  const identity = effective.spec.identity;
  const missingFields: string[] = [];
  const invalidFields: string[] = [];
  if (!identity.componentType) missingFields.push("spec.identity.componentType");
  if (!identity.lifecycle) missingFields.push("spec.identity.lifecycle");
  if (!identity.owners[0]) missingFields.push("spec.identity.owners[0]");
  const name = backstageName(snapshot.metadata.name);
  const namespace = backstageName(snapshot.metadata.namespace);
  if (!name) invalidFields.push("metadata.name");
  if (!namespace) invalidFields.push("metadata.namespace");
  if (missingFields.length || invalidFields.length || unresolvedFields.length) {
    throw new DwiBackstageMappingError(missingFields, invalidFields, unresolvedFields);
  }

  const annotations: Record<string, string> = {
    "dwi.dev/project-id": snapshot.metadata.id,
    "dwi.dev/source-root": snapshot.metadata.source.root,
    "dwi.dev/snapshot-hash": snapshot.resolution.effectiveSnapshotHash,
  };
  if (snapshot.metadata.source.repository) {
    annotations["backstage.io/source-location"] = `url:${snapshot.metadata.source.repository}`;
  }
  if (identity.domain) {
    annotations["dwi.dev/domain"] = mapBackstageEntityRef(
      identity.domain,
      "domain",
      "spec.identity.domain",
    );
  }

  const tags = uniqueSorted(identity.tags.map(backstageName)).filter(Boolean);
  const owner = mapBackstageEntityRef(
    identity.owners[0]!,
    "group",
    "spec.identity.owners[0]",
  );
  const system = identity.system
    ? mapBackstageEntityRef(identity.system, "system", "spec.identity.system")
    : undefined;
  const providesApis = optionalReferences(
    effective.spec.boundaries.providesApis,
    "api",
    "spec.boundaries.providesApis",
  );
  const consumesApis = optionalReferences(
    effective.spec.boundaries.consumesApis,
    "api",
    "spec.boundaries.consumesApis",
  );
  const dependsOn = optionalReferences(
    effective.spec.boundaries.dependsOn,
    "resource",
    "spec.boundaries.dependsOn",
  );
  return {
    apiVersion: "backstage.io/v1alpha1",
    kind: "Component",
    metadata: {
      name,
      namespace,
      ...(identity.description ? { description: identity.description } : {}),
      ...(tags.length ? { tags } : {}),
      annotations,
    },
    spec: {
      type: identity.componentType!,
      lifecycle: identity.lifecycle!,
      owner,
      ...(system ? { system } : {}),
      ...(providesApis ? { providesApis } : {}),
      ...(consumesApis ? { consumesApis } : {}),
      ...(dependsOn ? { dependsOn } : {}),
    },
  };
}
