import { describe, expect, it } from "vitest";
import {
  DWI_AI_AUTO_ACCEPT_PATHS,
  DWI_DEFAULT_AUTHORITY_PRECEDENCE,
  DWI_PROJECT_API_VERSION,
  DWI_PROJECT_KIND,
  DWI_PROJECT_SNAPSHOT_JSON_SCHEMA,
  DwiBackstageMappingError,
  DwiProjectSchemaError,
  canonicalJsonStringify,
  claimAuthorityPrecedence,
  createProjectSnapshot,
  projectSnapshotReviewHash,
  projectSnapshotCoveragePercent,
  projectSnapshotToBackstageComponent,
  projectSnapshotToBrief,
  resolveProjectSnapshot,
  sha256Hex,
  toBackstageEntityRef,
  validateProjectSnapshot,
  type DwiClaim,
  type DwiEvidence,
  type DwiProjectSnapshot,
  type DwiProjectSnapshotSource,
  type DwiProjectSnapshotSeed,
} from "./project-snapshot.js";

const NOW = "2026-08-26T12:00:00.000Z";
const SHA = "a".repeat(64);

function fullSeed(): DwiProjectSnapshotSeed {
  return {
    metadata: {
      id: "commerce/payments",
      name: "Payments API",
      namespace: "Commerce",
      source: {
        repository: "https://github.example/commerce/payments",
        root: "services/payments",
        remoteIdentityHash: `sha256:${SHA}`,
      },
      revision: {
        commit: "abc123",
        branch: "main",
        dirty: false,
        evidenceDigest: SHA,
        generatedAt: NOW,
      },
      review: { state: "approved", reviewedAt: NOW, reviewedBy: "group:platform" },
    },
    spec: {
      identity: {
        description: "Processes customer payments.",
        componentType: "service",
        lifecycle: "production",
        owners: ["group:commerce-payments"],
        system: "system:checkout",
        domain: "commerce",
        tags: ["API", "payments"],
      },
      boundaries: {
        providesApis: ["payments-v1"],
        consumesApis: ["api:fraud-v2"],
        dependsOn: ["resource:payments-db"],
        componentRoots: ["src"],
        generatedRoots: ["dist"],
        excludedRoots: ["vendor"],
      },
      workflows: [
        { id: "test", kind: "test", argv: ["go", "test", "./..."], cwd: "." },
        { id: "build", kind: "build", argv: ["go", "build", "./cmd/server"], cwd: "." },
      ],
      constraints: {
        supportedPlatforms: ["linux-amd64"],
        networkRequiredForBuild: false,
        architectureRules: ["domain cannot import transport"],
      },
    },
    observed: {
      languages: [{ id: "go", name: "Go", versionConstraint: ">=1.23", roots: ["."] }],
      ecosystems: [{ id: "go-modules", packageManager: "go", roots: ["."] }],
      frameworks: [{ id: "chi", name: "Chi", version: "5", roots: ["."] }],
      toolchains: [{ id: "go", name: "Go", version: "1.27.0", roots: ["."] }],
      components: [{ id: "payments-api", name: "Payments API", root: ".", type: "service" }],
      entrypoints: [{ id: "server", path: "cmd/server/main.go", kind: "server" }],
      ciSystems: [{ id: "github-actions", roots: [".github/workflows"] }],
      documentation: [{ id: "readme", path: "README.md", title: "Payments" }],
      dependencyArtifacts: [{ id: "sbom", path: "sbom.cdx.json", format: "cyclonedx", sha256: SHA }],
      securitySignals: [{ id: "codeowners", kind: "ownership", path: "CODEOWNERS" }],
    },
    evidence: [
      {
        id: "ev-go-mod",
        kind: "manifest",
        relativePath: "go.mod",
        selector: "module-and-go-directives",
        sha256: SHA,
        content: "module example.test/payments",
        parser: "go-pack@1.0.0",
        collectedAt: NOW,
        redactions: [],
      },
    ],
  };
}

function evidence(id: string, kind: DwiEvidence["kind"] = "manifest"): DwiEvidence {
  return { id, kind, collectedAt: NOW, redactions: [] };
}

function claim(input: Partial<DwiClaim> & Pick<DwiClaim, "id" | "path" | "value">): DwiClaim {
  return {
    state: "accepted",
    confidence: "high",
    authority: "deterministic",
    evidenceRefs: [],
    observedAt: NOW,
    ...input,
  };
}

describe("DWI project snapshot schema", () => {
  it("publishes a Draft 2020-12 persistence contract", () => {
    expect(DWI_PROJECT_SNAPSHOT_JSON_SCHEMA.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(DWI_PROJECT_SNAPSHOT_JSON_SCHEMA.properties.claims.items.$ref).toBe("#/$defs/claim");
    expect(DWI_PROJECT_SNAPSHOT_JSON_SCHEMA.$defs.resolution.required).toContain("effectiveSnapshotHash");
    expect(DWI_PROJECT_SNAPSHOT_JSON_SCHEMA.$defs.observed.properties.languages.items.$ref)
      .toBe("#/$defs/languageObservation");
    expect(DWI_PROJECT_SNAPSHOT_JSON_SCHEMA.$defs.metadata.properties.revision.properties.evidenceDigest)
      .toEqual({ type: "string", pattern: "^[a-f0-9]{64}$" });
    expect(DWI_PROJECT_SNAPSHOT_JSON_SCHEMA.$defs.boundaries.properties.componentRoots.$ref)
      .toBe("#/$defs/projectPathArray");
    expect(DWI_PROJECT_SNAPSHOT_JSON_SCHEMA.$defs.projectPathArray.maxItems).toBe(1_024);
    expect(DWI_PROJECT_SNAPSHOT_JSON_SCHEMA.$defs.relativePathArray.maxItems).toBe(512);
    expect(DWI_PROJECT_SNAPSHOT_JSON_SCHEMA.$defs.evidenceReferenceArray.maxItems).toBe(1_024);
    expect(DWI_PROJECT_SNAPSHOT_JSON_SCHEMA.$defs.boundaries.properties.generatedRoots.$ref)
      .toBe("#/$defs/relativePathArray");
    expect(DWI_PROJECT_SNAPSHOT_JSON_SCHEMA.$defs.metadata.properties.review.allOf[0]!.then.required)
      .toEqual(["reviewedAt", "reviewedBy"]);
    expect(
      DWI_PROJECT_SNAPSHOT_JSON_SCHEMA.allOf[0]!.then.properties.metadata
        .properties.review.required,
    ).toEqual(["reviewedSnapshotHash"]);
    expect(DWI_PROJECT_API_VERSION).toBe("dwi.dev/v1");
    expect(DWI_PROJECT_KIND).toBe("Project");
  });

  it("creates a normalized, resolved, valid snapshot", () => {
    const seed = fullSeed();
    seed.spec!.identity!.tags = ["payments", "API", "payments"];
    const snapshot = createProjectSnapshot(seed);
    expect(snapshot.metadata.namespace).toBe("Commerce");
    expect(snapshot.metadata.revision).toEqual({
      commit: "abc123",
      branch: "main",
      dirty: false,
      evidenceDigest: SHA,
      generatedAt: NOW,
    });
    expect(snapshot.spec.identity.tags).toEqual(["API", "payments"]);
    expect(snapshot.resolution.status).toBe("current");
    expect(snapshot.resolution.coverage).toEqual({
      identity: "complete",
      toolchain: "complete",
      verification: "complete",
      architecture: "complete",
      documentation: "complete",
    });
    expect(snapshot.resolution.unknowns).toEqual([]);
    expect(snapshot.resolution.effectiveSnapshotHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(validateProjectSnapshot(snapshot)).toEqual({ valid: true, issues: [] });
    expect(projectSnapshotCoveragePercent(snapshot)).toBe(100);
  });

  it("applies stable defaults without claiming complete coverage", () => {
    const snapshot = createProjectSnapshot(
      { metadata: { id: "demo", name: " Demo " } },
      { generatedAt: NOW },
    );
    expect(snapshot.metadata).toMatchObject({
      id: "demo",
      name: "Demo",
      namespace: "default",
      source: { root: "." },
      revision: { generatedAt: NOW },
      review: { state: "unreviewed" },
    });
    expect(snapshot.resolution.status).toBe("partial");
    expect(snapshot.resolution.coverage.identity).toBe("incomplete");
    expect(snapshot.resolution.unknowns.map((item) => item.path)).toContain("/observed/languages");
    expect(projectSnapshotCoveragePercent(snapshot)).toBe(0);
  });

  it("keeps current status reserved for snapshots without required unknowns", () => {
    const seed = fullSeed();
    seed.unknowns = [
      {
        path: "/spec/identity/system",
        reason: "The owning system still requires confirmation.",
        required: true,
      },
    ];
    expect(createProjectSnapshot(seed).resolution.status).toBe("partial");

    seed.unknowns[0]!.required = false;
    expect(createProjectSnapshot(seed).resolution.status).toBe("current");
  });

  it.each([
    ["componentRoots", "/absolute"],
    ["componentRoots", "../escape"],
    ["generatedRoots", "."],
    ["generatedRoots", "/absolute"],
    ["excludedRoots", "../escape"],
  ] as const)("rejects unsafe %s entry %s", (key, invalidPath) => {
    const snapshot = createProjectSnapshot(fullSeed());
    const { resolution: _resolution, ...source } = structuredClone(snapshot);
    source.spec.boundaries[key] = [invalidPath];

    try {
      resolveProjectSnapshot(source);
      throw new Error("Expected unsafe boundary path rejection.");
    } catch (error) {
      expect(error).toBeInstanceOf(DwiProjectSchemaError);
      expect((error as DwiProjectSchemaError).issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ path: `/spec/boundaries/${key}/0` }),
        ]),
      );
    }
  });

  it("allows the repository root only as a component boundary", () => {
    const seed = fullSeed();
    seed.spec!.boundaries!.componentRoots = ["."];
    expect(createProjectSnapshot(seed).spec.boundaries.componentRoots).toEqual(["."]);
  });

  it("binds approved review state to project content and provenance", () => {
    const snapshot = createProjectSnapshot(fullSeed());
    expect(snapshot.metadata.review.reviewedSnapshotHash).toBe(
      projectSnapshotReviewHash(snapshot),
    );
    expect(snapshot.metadata.review.reviewedSnapshotHash).toMatch(/^sha256:[a-f0-9]{64}$/);

    const carriedReview = structuredClone(snapshot);
    carriedReview.evidence[0]!.content = "changed after approval";
    expect(validateProjectSnapshot(carriedReview).issues).toContainEqual({
      path: "/metadata/review/reviewedSnapshotHash",
      code: "integrity",
      message: "does not match the reviewed snapshot content and provenance.",
    });

    carriedReview.metadata.review.reviewedSnapshotHash =
      projectSnapshotReviewHash(carriedReview);
    expect(validateProjectSnapshot(carriedReview)).toEqual({ valid: true, issues: [] });

    delete carriedReview.metadata.review.reviewedSnapshotHash;
    expect(validateProjectSnapshot(carriedReview).issues).toContainEqual(
      expect.objectContaining({
        path: "/metadata/review/reviewedSnapshotHash",
        code: "required",
      }),
    );

    carriedReview.metadata.review = {
      state: "unreviewed",
      reviewedSnapshotHash: projectSnapshotReviewHash(carriedReview),
    };
    expect(validateProjectSnapshot(carriedReview).issues).toContainEqual({
      path: "/metadata/review/reviewedSnapshotHash",
      code: "consistency",
      message: "is only valid for an approved review.",
    });
  });

  it("uses canonical JSON and a portable SHA-256 implementation", () => {
    expect(canonicalJsonStringify({ z: 1, a: [true, null, "x"], ignored: undefined })).toBe(
      '{"a":[true,null,"x"],"z":1}',
    );
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(() => canonicalJsonStringify(Number.POSITIVE_INFINITY)).toThrow(/non-finite/);
    expect(() => canonicalJsonStringify(Symbol("invalid"))).toThrow(/symbol/);
  });

  it("orders non-ASCII canonical keys by UTF-16 code unit instead of host locale", () => {
    expect(
      canonicalJsonStringify({
        "😀": 5,
        Ω: 4,
        é: 3,
        "e\u0301": 2,
        Z: 1,
      }),
    ).toBe('{"Z":1,"é":2,"é":3,"Ω":4,"😀":5}');
  });

  it("publishes a strict evidence-relative path grammar while retaining dot as a project root", () => {
    const relativePath = new RegExp(DWI_PROJECT_SNAPSHOT_JSON_SCHEMA.$defs.relativePath.pattern);
    for (const invalid of ["", ".", "..", "a\\b", "a//b", "a/./b", "a/../b", "/a", "C:/a", "a/"]) {
      expect(relativePath.test(invalid), invalid).toBe(false);
    }
    expect(relativePath.test("services/api/project.json")).toBe(true);
    expect(DWI_PROJECT_SNAPSHOT_JSON_SCHEMA.$defs.projectPath.anyOf[0]).toEqual({ const: "." });
  });

  it("produces byte-identical effective hashes for equivalent object key order", () => {
    const first = createProjectSnapshot(fullSeed());
    const reordered = fullSeed();
    reordered.metadata = { ...reordered.metadata, id: reordered.metadata.id, name: reordered.metadata.name };
    const second = createProjectSnapshot(reordered);
    expect(second.resolution.effectiveSnapshotHash).toBe(first.resolution.effectiveSnapshotHash);
  });
});

describe("claim resolution", () => {
  it("uses field-specific authority without treating lower authority as a conflict", () => {
    const seed = fullSeed();
    seed.evidence = [evidence("decl", "declaration"), evidence("catalog", "catalog"), evidence("probe", "probe")];
    seed.claims = [
      claim({ id: "owner-decl", path: "/spec/identity/owners", value: ["group:repo"], authority: "declaration", evidenceRefs: ["decl"] }),
      claim({ id: "owner-catalog", path: "/spec/identity/owners", value: ["group:directory"], authority: "catalog", evidenceRefs: ["catalog"] }),
      claim({ id: "tool-static", path: "/observed/toolchains/0/version", value: "1.26", authority: "deterministic", evidenceRefs: ["decl"] }),
      claim({ id: "tool-probe", path: "/observed/toolchains/0/version", value: "1.27", authority: "restricted-probe", evidenceRefs: ["probe"] }),
    ];
    const snapshot = createProjectSnapshot(seed);
    expect(snapshot.resolution.effectiveSnapshot.spec.identity.owners).toEqual(["group:directory"]);
    expect(snapshot.resolution.effectiveSnapshot.observed.toolchains[0]!.version).toBe("1.27");
    expect(snapshot.resolution.conflicts).toEqual([]);
    expect(claimAuthorityPrecedence("/spec/identity/owners")[1]).toBe("catalog");
    expect(claimAuthorityPrecedence("/observed/toolchains/0/version")[1]).toBe("restricted-probe");
    expect(claimAuthorityPrecedence("/spec/identity/lifecycle")).toBe(DWI_DEFAULT_AUTHORITY_PRECEDENCE);
  });

  it("surfaces same-tier disagreement and selects reproducibly", () => {
    const seed = fullSeed();
    seed.evidence = [evidence("one"), evidence("two")];
    seed.claims = [
      claim({ id: "later-low", path: "/spec/identity/lifecycle", value: "experimental", confidence: "low", evidenceRefs: ["one"] }),
      claim({ id: "earlier-high", path: "/spec/identity/lifecycle", value: "production", confidence: "high", observedAt: "2026-08-25T00:00:00Z", evidenceRefs: ["two"] }),
    ];
    const snapshot = createProjectSnapshot(seed);
    expect(snapshot.resolution.effectiveSnapshot.spec.identity.lifecycle).toBe("production");
    expect(snapshot.resolution.status).toBe("conflict");
    expect(snapshot.resolution.conflicts).toEqual([
      expect.objectContaining({
        path: "/spec/identity/lifecycle",
        claimIds: ["earlier-high", "later-low"],
        selectedClaimId: "earlier-high",
      }),
    ]);
    expect(snapshot.resolution.unknowns).toContainEqual(
      expect.objectContaining({ path: "/spec/identity/lifecycle", required: true }),
    );
  });

  it("uses freshness then id as deterministic same-value tie breakers", () => {
    const seed = fullSeed();
    seed.claims = [
      claim({ id: "z-old", path: "/spec/identity/description", value: "same", observedAt: "2026-01-01T00:00:00Z", authority: "declaration" }),
      claim({ id: "b-new", path: "/spec/identity/description", value: "same", observedAt: NOW, authority: "declaration" }),
      claim({ id: "a-new", path: "/spec/identity/description", value: "same", observedAt: NOW, authority: "declaration" }),
    ];
    const snapshot = createProjectSnapshot(seed);
    expect(snapshot.resolution.effectiveSnapshot.spec.identity.description).toBe("same");
    expect(snapshot.resolution.conflicts).toEqual([]);
  });

  it("uses code-unit ordering for non-ASCII claim-id tie breakers", () => {
    const seed = fullSeed();
    seed.claims = [
      claim({ id: "ä-claim", path: "/spec/identity/lifecycle", value: "experimental" }),
      claim({ id: "z-claim", path: "/spec/identity/lifecycle", value: "production" }),
    ];
    const snapshot = createProjectSnapshot(seed);

    expect(snapshot.resolution.effectiveSnapshot.spec.identity.lifecycle).toBe("production");
    expect(snapshot.resolution.conflicts[0]?.selectedClaimId).toBe("z-claim");
  });

  it("ignores non-accepted and expired claims and never applies proposals directly", () => {
    const seed = fullSeed();
    seed.claims = [
      claim({ id: "pending", path: "/spec/identity/lifecycle", value: "pending-value", state: "pending" }),
      claim({ id: "rejected", path: "/spec/identity/lifecycle", value: "rejected-value", state: "rejected" }),
      claim({ id: "expired", path: "/spec/identity/lifecycle", value: "expired-value", expiresAt: "2026-08-25T00:00:00Z" }),
    ];
    seed.proposals = [
      {
        id: "summary",
        path: "/spec/identity/description",
        value: "AI replacement",
        producer: "ai",
        state: "auto-accepted",
        risk: "low",
        evidenceRefs: [],
        model: "simulated",
        createdAt: NOW,
      },
    ];
    const snapshot = createProjectSnapshot(seed);
    expect(snapshot.resolution.effectiveSnapshot.spec.identity.lifecycle).toBe("production");
    expect(snapshot.resolution.effectiveSnapshot.spec.identity.description).toBe("Processes customer payments.");
    expect(DWI_AI_AUTO_ACCEPT_PATHS).toContain("/spec/identity/description");
  });

  it("supports bounded array JSON pointers and rejects unsafe pointers", () => {
    const seed = fullSeed();
    seed.claims = [claim({ id: "language-version", path: "/observed/languages/0/versionConstraint", value: ">=1.24" })];
    expect(createProjectSnapshot(seed).resolution.effectiveSnapshot.observed.languages[0]!.versionConstraint).toBe(">=1.24");

    seed.claims = [claim({ id: "unsafe", path: "/spec/__proto__/polluted", value: true })];
    expect(() => createProjectSnapshot(seed)).toThrow(DwiProjectSchemaError);
    seed.claims = [claim({ id: "sparse", path: "/observed/languages/9/name", value: "Bad" })];
    expect(createProjectSnapshot(seed).resolution.unknowns).toContainEqual(
      expect.objectContaining({ reason: "Accepted claim targets an invalid effective-snapshot path." }),
    );
  });

  it("creates bounded missing array members and reports invalid array or scalar traversal", () => {
    const seed = fullSeed();
    seed.claims = [claim({ id: "new-framework", path: "/observed/frameworks/1", value: { id: "echo", roots: ["."] } })];
    expect(createProjectSnapshot(seed).resolution.effectiveSnapshot.observed.frameworks[1]).toEqual({ id: "echo", roots: ["."] });

    seed.observed!.frameworks = [];
    seed.claims = [
      claim({ id: "nested-framework-id", path: "/observed/frameworks/0/id", value: "echo" }),
      claim({ id: "nested-framework-root", path: "/observed/frameworks/0/roots/0", value: "." }),
    ];
    expect(createProjectSnapshot(seed).resolution.effectiveSnapshot.observed.frameworks[0]).toEqual({ id: "echo", roots: ["."] });

    for (const path of [
      "/observed/languages/name",
      "/observed/frameworks/2",
      "/spec/identity/description/value",
    ]) {
      seed.claims = [claim({ id: `invalid-${path}`, path, value: "ignored" })];
      expect(createProjectSnapshot(seed).resolution.unknowns).toContainEqual(
        expect.objectContaining({ path, reason: "Accepted claim targets an invalid effective-snapshot path." }),
      );
    }
  });

  it("honors explicit unsupported coverage and deduplicates supplied unknowns", () => {
    const seed = fullSeed();
    seed.coverage = { toolchain: "unsupported" };
    seed.unknowns = [
      { path: "/observed/toolchains", reason: "No pack installed.", required: true },
      { path: "/observed/toolchains", reason: "No pack installed.", required: true },
    ];
    const snapshot = createProjectSnapshot(seed);
    expect(snapshot.resolution.status).toBe("unsupported");
    expect(snapshot.resolution.unknowns.filter((item) => item.reason === "No pack installed.")).toHaveLength(1);
    expect(projectSnapshotCoveragePercent(snapshot)).toBe(80);
  });
});

describe("validation policy", () => {
  it("detects tampering, missing references, unsafe paths, and invalid AI authority", () => {
    const snapshot = createProjectSnapshot(fullSeed());
    const invalid = structuredClone(snapshot) as unknown as DwiProjectSnapshot;
    invalid.apiVersion = "dwi.dev/v0" as typeof DWI_PROJECT_API_VERSION;
    invalid.metadata.source.root = "../private";
    invalid.metadata.review.reviewedAt = "never";
    invalid.spec.workflows[0]!.cwd = "/tmp";
    invalid.spec.workflows[0]!.argv = [];
    invalid.evidence.push({
      id: "bad-evidence",
      kind: "probe",
      relativePath: "C:\\secret",
      sha256: "bad",
      collectedAt: "not-a-date",
      redactions: ["x", "x"],
      probe: { executable: "", argv: [], exitCode: 1.5, durationMs: -1 },
    });
    invalid.claims.push(
      claim({ id: "ai-owner", path: "/spec/identity/owners", value: ["ai"], authority: "ai", evidenceRefs: ["missing"], observedAt: "bad", expiresAt: "bad" }),
    );
    invalid.resolution.effectiveSnapshotHash = `sha256:${"0".repeat(64)}`;
    const result = validateProjectSnapshot(invalid);
    expect(result.valid).toBe(false);
    expect(result.issues.map((item) => item.code)).toEqual(
      expect.arrayContaining(["const", "path", "format", "minItems", "reference", "aiPolicy", "integrity"]),
    );
  });

  it("rejects an externally supplied current resolution with required unknowns", () => {
    const invalid = structuredClone(createProjectSnapshot(fullSeed())) as unknown as DwiProjectSnapshot;
    invalid.resolution.unknowns.push({
      path: "/spec/identity/owners",
      reason: "Owner requires confirmation.",
      required: true,
    });

    expect(validateProjectSnapshot(invalid).issues).toContainEqual({
      path: "/resolution/status",
      code: "consistency",
      message: "cannot be current while required unknowns remain.",
    });
  });

  it("validates optional VCS revision metadata when present", () => {
    const invalid = structuredClone(createProjectSnapshot(fullSeed())) as unknown as DwiProjectSnapshot;
    (invalid.metadata.revision as unknown as Record<string, unknown>).branch = 42;
    (invalid.metadata.revision as unknown as Record<string, unknown>).dirty = "unknown";
    invalid.metadata.revision.evidenceDigest = "A".repeat(64);

    expect(validateProjectSnapshot(invalid).issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "/metadata/revision/branch", code: "type" }),
        expect.objectContaining({ path: "/metadata/revision/dirty", code: "type" }),
        expect.objectContaining({ path: "/metadata/revision/evidenceDigest" }),
      ]),
    );

    const invalidSeed = fullSeed();
    invalidSeed.metadata.revision!.evidenceDigest = "";
    expect(() => createProjectSnapshot(invalidSeed)).toThrow(/evidenceDigest/);
  });

  it.each([
    {
      name: "unknown spec property",
      expectedPath: "/spec/extra",
      mutate(source: DwiProjectSnapshotSource) {
        (source.spec as unknown as Record<string, unknown>).extra = true;
      },
    },
    {
      name: "numeric identity description",
      expectedPath: "/spec/identity/description",
      mutate(source: DwiProjectSnapshotSource) {
        (source.spec.identity as unknown as Record<string, unknown>).description = 42;
      },
    },
    {
      name: "malformed observed language",
      expectedPath: "/observed/languages/0/roots",
      mutate(source: DwiProjectSnapshotSource) {
        (source.observed as unknown as Record<string, unknown>).languages = [
          { id: "js", roots: 42, impossible: true },
        ];
      },
    },
  ])("rejects $name during resolution", ({ mutate, expectedPath }) => {
    const snapshot = createProjectSnapshot(fullSeed());
    const { resolution: _resolution, ...source } = structuredClone(snapshot);
    mutate(source);

    try {
      resolveProjectSnapshot(source);
      throw new Error("Expected resolution to reject the malformed source.");
    } catch (error) {
      expect(error).toBeInstanceOf(DwiProjectSchemaError);
      expect((error as DwiProjectSchemaError).issues).toEqual(
        expect.arrayContaining([expect.objectContaining({ path: expectedPath })]),
      );
    }
  });

  it("enforces nested required, scalar, and additional-property constraints", () => {
    const invalid = structuredClone(createProjectSnapshot(fullSeed())) as unknown as Record<string, unknown>;
    const metadata = invalid.metadata as Record<string, unknown>;
    (metadata.source as Record<string, unknown>).unexpected = true;
    const spec = invalid.spec as Record<string, unknown>;
    (spec.boundaries as Record<string, unknown>).dependsOn = [1];
    ((spec.workflows as unknown[])[0] as Record<string, unknown>).argv = "go test";
    const observed = invalid.observed as Record<string, unknown>;
    observed.components = [{ id: "missing-fields", impossible: true }];
    invalid.claims = [
      {
        id: "claim",
        path: "/spec/identity/description",
        value: "description",
        state: "accepted",
        confidence: "high",
        authority: "deterministic",
        evidenceRefs: [],
        extractor: 42,
        unexpected: true,
      },
    ];
    const evidenceRecords = invalid.evidence as Array<Record<string, unknown>>;
    delete evidenceRecords[0]!.collectedAt;
    evidenceRecords[0]!.probe = {
      executable: 42,
      argv: [],
      exitCode: 0,
      durationMs: 1,
      unexpected: true,
    };
    invalid.proposals = [
      {
        id: "proposal",
        path: "/spec/identity/description",
        value: "description",
        producer: "human",
        state: "pending",
        risk: "low",
        model: 42,
        evidenceRefs: [],
        createdAt: NOW,
        unexpected: true,
      },
    ];

    const issues = validateProjectSnapshot(invalid).issues;
    for (const path of [
      "/metadata/source/unexpected",
      "/spec/boundaries/dependsOn/0",
      "/spec/workflows/0/argv",
      "/observed/components/0/name",
      "/observed/components/0/root",
      "/observed/components/0/impossible",
      "/claims/0/extractor",
      "/claims/0/unexpected",
      "/evidence/0/collectedAt",
      "/evidence/0/probe/executable",
      "/evidence/0/probe/unexpected",
      "/proposals/0/model",
      "/proposals/0/unexpected",
    ]) {
      expect(issues, path).toEqual(
        expect.arrayContaining([expect.objectContaining({ path })]),
      );
    }
  });

  it("rejects unknown keys and invalid proposal/evidence scalar fields", () => {
    const invalid = structuredClone(createProjectSnapshot(fullSeed())) as unknown as Record<string, unknown>;
    invalid.unexpected = true;
    const evidenceRecords = invalid.evidence as Array<Record<string, unknown>>;
    evidenceRecords[0]!.selector = "";
    evidenceRecords[0]!.content = 42;
    evidenceRecords[0]!.parser = false;
    evidenceRecords[0]!.relativePath = ".";
    evidenceRecords[0]!.unexpected = true;
    invalid.proposals = [
      {
        id: "bad-proposal",
        path: "/spec/identity/description",
        value: "x",
        producer: "robot",
        state: "pending",
        risk: "low",
        model: "",
        evidenceRefs: [],
        createdAt: NOW,
        unexpected: true,
      },
    ];

    const issues = validateProjectSnapshot(invalid).issues;
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "/unexpected", code: "additionalProperties" }),
        expect.objectContaining({ path: "/evidence/0/unexpected", code: "additionalProperties" }),
        expect.objectContaining({ path: "/evidence/0/selector", code: "type" }),
        expect.objectContaining({ path: "/evidence/0/content", code: "type" }),
        expect.objectContaining({ path: "/evidence/0/parser", code: "type" }),
        expect.objectContaining({ path: "/evidence/0/relativePath", code: "path" }),
        expect.objectContaining({ path: "/proposals/0/unexpected", code: "additionalProperties" }),
        expect.objectContaining({ path: "/proposals/0/producer", code: "enum" }),
        expect.objectContaining({ path: "/proposals/0/model", code: "type" }),
      ]),
    );
  });

  it("validates conflict and unknown shapes and their references", () => {
    const invalid = structuredClone(createProjectSnapshot(fullSeed())) as unknown as DwiProjectSnapshot;
    invalid.resolution.status = "conflict";
    invalid.resolution.conflicts = [
      {
        path: "unsafe",
        claimIds: ["missing"],
        selectedClaimId: "other",
        reason: "",
        unexpected: true,
      } as unknown as DwiProjectSnapshot["resolution"]["conflicts"][number],
    ];
    invalid.resolution.unknowns = [
      {
        path: "unsafe",
        reason: "",
        required: "yes",
        evidenceRefs: ["missing"],
        unexpected: true,
      } as unknown as DwiProjectSnapshot["resolution"]["unknowns"][number],
    ];

    const issues = validateProjectSnapshot(invalid).issues;
    expect(issues.map(({ code }) => code)).toEqual(
      expect.arrayContaining(["additionalProperties", "pointer", "reference", "required", "type"]),
    );
  });

  it("rejects a self-hashed effective snapshot that was not deterministically resolved", () => {
    const invalid = structuredClone(createProjectSnapshot(fullSeed())) as unknown as DwiProjectSnapshot;
    invalid.resolution.effectiveSnapshot.spec.identity.description = "Forged but self-hashed";
    invalid.resolution.effectiveSnapshotHash = `sha256:${sha256Hex(
      canonicalJsonStringify(invalid.resolution.effectiveSnapshot),
    )}`;

    expect(validateProjectSnapshot(invalid).issues).toContainEqual({
      path: "/resolution",
      code: "integrity",
      message: "does not match deterministic resolution of the supplied source facts and claims.",
    });
  });

  it("rejects unsafe auto-acceptance and malformed proposal values", () => {
    const snapshot = createProjectSnapshot(fullSeed());
    const invalid = structuredClone(snapshot) as unknown as DwiProjectSnapshot;
    invalid.proposals = [
      {
        id: "owner-proposal",
        path: "/spec/identity/owners",
        value: ["group:ai"],
        producer: "ai",
        state: "auto-accepted",
        risk: "high",
        evidenceRefs: ["missing"],
        createdAt: "bad",
      },
    ];
    const result = validateProjectSnapshot(invalid);
    expect(result.valid).toBe(false);
    expect(result.issues.map((item) => item.code)).toEqual(expect.arrayContaining(["aiPolicy", "reference", "format"]));
  });

  it("rejects whitespace-only or control-bearing governance strings at the source boundary", () => {
    const whitespace = fullSeed();
    whitespace.spec!.identity!.componentType = " ";
    whitespace.spec!.identity!.owners = ["\t"];
    expect(() => createProjectSnapshot(whitespace)).toThrow(DwiProjectSchemaError);

    const control = fullSeed();
    control.spec!.workflows![0]!.argv = ["go", "test\u0000"];
    expect(() => createProjectSnapshot(control)).toThrow(DwiProjectSchemaError);

    const emptyNarrative = fullSeed();
    emptyNarrative.spec!.identity!.description = "   ";
    expect(() => createProjectSnapshot(emptyNarrative)).toThrow(DwiProjectSchemaError);

    const multilineNarrative = fullSeed();
    multilineNarrative.spec!.identity!.description = "\nmeaningful";
    expect(createProjectSnapshot(multilineNarrative).spec.identity.description)
      .toBe("\nmeaningful");
  });

  it("returns a direct type issue for non-object input", () => {
    expect(validateProjectSnapshot(null)).toEqual({
      valid: false,
      issues: [{ path: "/", code: "type", message: "must be an object." }],
    });
  });

  it("reports missing top-level structures without throwing", () => {
    const result = validateProjectSnapshot({
      apiVersion: DWI_PROJECT_API_VERSION,
      kind: DWI_PROJECT_KIND,
      metadata: null,
      spec: null,
      observed: null,
      evidence: null,
      claims: null,
      proposals: null,
      resolution: null,
    });
    expect(result.valid).toBe(false);
    expect(result.issues.map((item) => item.path)).toEqual(
      expect.arrayContaining(["/metadata", "/spec", "/observed", "/evidence", "/claims", "/proposals", "/resolution"]),
    );
  });

  it("collects structural issues across nested records", () => {
    const result = validateProjectSnapshot({
      apiVersion: DWI_PROJECT_API_VERSION,
      kind: "Wrong",
      metadata: {
        id: "",
        name: 1,
        namespace: "",
        schemaVersion: "0",
        source: null,
        revision: null,
        review: null,
      },
      spec: {
        identity: null,
        boundaries: null,
        workflows: [null, { id: "dup", kind: "bad", argv: [1], cwd: "bad/../path" }, { id: "dup", kind: "test", argv: ["go"], cwd: "." }],
        constraints: null,
      },
      observed: {
        languages: [null, { id: "" }, { id: "dup" }, { id: "dup" }],
        ecosystems: null,
        frameworks: [],
        toolchains: [],
        components: [],
        entrypoints: [],
        ciSystems: [],
        documentation: [],
        dependencyArtifacts: [],
        securitySignals: [],
      },
      evidence: [{ id: "e", kind: "bad", collectedAt: NOW, redactions: [], probe: "bad" }],
      claims: [{ id: "c", path: "bad", value: 1n, state: "bad", confidence: "bad", authority: "bad", evidenceRefs: null }],
      proposals: [{ id: "p", path: "bad", value: () => true, state: "bad", risk: "bad", evidenceRefs: null, createdAt: NOW }],
      resolution: {
        status: "bad",
        coverage: null,
        conflicts: null,
        unknowns: null,
        effectiveSnapshot: null,
        effectiveSnapshotHash: "bad",
      },
    });
    expect(result.valid).toBe(false);
    expect(result.issues.length).toBeGreaterThan(20);
    expect(result.issues.map((item) => item.code)).toEqual(
      expect.arrayContaining(["type", "required", "enum", "uniqueIds", "json"]),
    );
  });

  it("requires a reviewer identity for approved snapshots", () => {
    const seed = fullSeed();
    seed.metadata.review = { state: "approved", reviewedAt: NOW };
    expect(() => createProjectSnapshot(seed)).toThrow(/reviewedBy/);
  });

  it("requires a valid review timestamp for approved snapshots", () => {
    const missing = fullSeed();
    missing.metadata.review = { state: "approved", reviewedBy: "group:platform" };
    expect(() => createProjectSnapshot(missing)).toThrow(/reviewedAt/);

    const persisted = structuredClone(createProjectSnapshot(fullSeed()));
    delete persisted.metadata.review.reviewedAt;
    expect(validateProjectSnapshot(persisted).issues).toContainEqual(
      expect.objectContaining({ path: "/metadata/review/reviewedAt", code: "required" }),
    );

    const invalid = fullSeed();
    invalid.metadata.review = {
      state: "approved",
      reviewedAt: "not-a-timestamp",
      reviewedBy: "group:platform",
    };
    expect(() => createProjectSnapshot(invalid)).toThrow(/reviewedAt/);

    const nonRfc3339 = fullSeed();
    nonRfc3339.metadata.revision!.generatedAt = "2024";
    expect(() => createProjectSnapshot(nonRfc3339)).toThrow(/generatedAt/);

    const offset = fullSeed();
    offset.metadata.revision!.generatedAt = "2026-08-26T08:00:00-04:00";
    expect(createProjectSnapshot(offset).metadata.revision.generatedAt)
      .toBe("2026-08-26T08:00:00-04:00");
  });
});

describe("downstream projections", () => {
  it("projects only the selected effective accepted claim", () => {
    const seed = fullSeed();
    seed.claims = [
      claim({
        id: "selected-description",
        path: "/spec/identity/description",
        value: "Selected deterministic description",
        authority: "deterministic",
      }),
      claim({
        id: "overridden-description",
        path: "/spec/identity/description",
        value: "Lower-authority alternative",
        authority: "ai",
      }),
    ];

    const brief = projectSnapshotToBrief(createProjectSnapshot(seed));
    expect(brief.facts).toEqual([
      expect.objectContaining({
        id: "selected-description",
        value: "Selected deterministic description",
      }),
    ]);
    expect(JSON.stringify(brief)).not.toContain("Lower-authority alternative");
  });

  it("bounds large brief projections with deterministic count and digest summaries", () => {
    const seed = fullSeed();
    seed.metadata.name = "😀".repeat(200);
    seed.spec!.boundaries!.componentRoots = Array.from(
      { length: 1_000 },
      (_, index) => `component-${String(index).padStart(4, "0")}`,
    );
    seed.spec!.identity!.tags = Array.from(
      { length: 65 },
      (_, index) => `initial-${String(index).padStart(3, "0")}`,
    );
    const evidenceIds = Array.from(
      { length: 1_000 },
      (_, index) => `evidence-${String(index).padStart(4, "0")}`,
    );
    seed.evidence = evidenceIds.map((id) => evidence(id));
    seed.claims = Array.from({ length: 65 }, (_, index) =>
      claim({
        id: `claim-${String(index).padStart(3, "0")}`,
        path: index === 0
          ? "/spec/identity/description"
          : `/spec/identity/tags/${String(index).padStart(3, "0")}`,
        value: index === 0 ? "€".repeat(1_000) : `effective-${String(index).padStart(3, "0")}`,
        evidenceRefs: index === 0 ? evidenceIds : [],
      })
    );

    const snapshot = createProjectSnapshot(seed);
    const brief = projectSnapshotToBrief(snapshot);
    expect(projectSnapshotToBrief(snapshot)).toEqual(brief);
    expect(brief.modules).toHaveLength(128);
    expect(brief.facts).toHaveLength(64);
    expect(brief.facts[0]).toMatchObject({
      id: "claim-000",
      value: expect.stringMatching(/^\[claim value omitted: .*sha256:[a-f0-9]{64}\]$/),
      evidence: expect.stringMatching(/^1000 evidence references omitted; sha256:[a-f0-9]{64}$/),
    });
    expect(brief.unknowns).toEqual(expect.arrayContaining([
      expect.stringMatching(/^\/spec\/boundaries\/componentRoots: 873 list items omitted .*sha256:[a-f0-9]{64}/),
      expect.stringMatching(/^\/claims: 1 effective accepted claims omitted .*sha256:[a-f0-9]{64}/),
    ]));
    expect(new TextEncoder().encode(brief.projectName).byteLength).toBeLessThanOrEqual(512);
    expect(brief.projectName).not.toContain("�");
    for (const value of [...brief.stack, ...brief.scripts, ...brief.modules]) {
      expect(new TextEncoder().encode(value).byteLength).toBeLessThanOrEqual(512);
    }
    for (const fact of brief.facts) {
      expect(new TextEncoder().encode(fact.id).byteLength).toBeLessThanOrEqual(512);
      expect(new TextEncoder().encode(fact.label).byteLength).toBeLessThanOrEqual(512);
      expect(new TextEncoder().encode(fact.value).byteLength).toBeLessThanOrEqual(2_048);
      expect(new TextEncoder().encode(fact.evidence).byteLength).toBeLessThanOrEqual(1_024);
    }
  });

  it("maps an approved complete snapshot to the legacy brief", () => {
    const seed = fullSeed();
    seed.claims = [
      claim({ id: "z-string", path: "/spec/identity/description", value: "A description", authority: "declaration" }),
      claim({ id: "a-object", path: "/observed/securitySignals", value: [{ id: "safe", kind: "policy" }], evidenceRefs: ["ev-go-mod"] }),
    ];
    const brief = projectSnapshotToBrief(createProjectSnapshot(seed));
    expect(brief).toMatchObject({
      projectName: "Payments API",
      archetype: "service",
      stack: ["Chi", "Go"],
      packageManager: "go",
      scripts: ["test", "build"],
      confirmed: true,
      corrections: "none",
    });
    expect(brief.modules).toEqual([".", "src"]);
    expect(brief.facts.map((fact) => fact.value)).toEqual([
      '[{"id":"safe","kind":"policy"}]',
      "A description",
    ]);
  });

  it("makes multiple root-scoped package managers explicit in the brief", () => {
    const seed = fullSeed();
    seed.observed!.ecosystems = [
      {
        id: "node",
        name: "Node.js",
        roots: [".", "apps/web", "packages/ui"],
        packageManagers: [
          { id: "npm", roots: ["."] },
          { id: "pnpm", roots: ["apps/web", "packages/ui"] },
        ],
      },
    ];

    expect(projectSnapshotToBrief(createProjectSnapshot(seed)).packageManager).toBe(
      "npm @ .; pnpm @ apps/web, packages/ui",
    );
  });

  it("does not imply a scoped manager applies to unresolved ecosystem roots", () => {
    const seed = fullSeed();
    seed.observed!.ecosystems = [{
      id: "node",
      name: "Node.js",
      roots: [".", "apps/web"],
      packageManagers: [{ id: "pnpm", roots: ["apps/web"] }],
    }];

    expect(projectSnapshotToBrief(createProjectSnapshot(seed)).packageManager).toBe(
      "pnpm @ apps/web",
    );
  });

  it("keeps incomplete or unreviewed compatibility briefs unconfirmed", () => {
    const snapshot = createProjectSnapshot(
      { metadata: { id: "demo", name: "Demo" } },
      { generatedAt: NOW },
    );
    const brief = projectSnapshotToBrief(snapshot);
    expect(brief.confirmed).toBe(false);
    expect(brief.archetype).toBe("unknown");
    expect(brief.packageManager).toBe("");
    expect(brief.unknowns.length).toBeGreaterThan(0);
  });

  it("requires current resolution and a content-bound review before confirming a brief", () => {
    const seed = fullSeed();
    seed.coverage = {
      identity: "complete",
      toolchain: "complete",
      verification: "complete",
      architecture: "complete",
      documentation: "complete",
    };
    seed.unknowns = [{
      path: "/spec/identity/owners",
      reason: "Ownership still requires review.",
      required: true,
    }];
    const partial = createProjectSnapshot(seed);
    expect(partial.resolution.status).toBe("partial");
    expect(projectSnapshotToBrief(partial).confirmed).toBe(false);

    const unbound = structuredClone(createProjectSnapshot(fullSeed()));
    delete unbound.metadata.review.reviewedSnapshotHash;
    expect(validateProjectSnapshot(unbound).issues).toContainEqual(
      expect.objectContaining({
        path: "/metadata/review/reviewedSnapshotHash",
        code: "required",
      }),
    );
    expect(() => projectSnapshotToBrief(unbound)).toThrow(/reviewedSnapshotHash/);
  });

  it("keeps conflict corrections within the UTF-8 byte boundary", () => {
    const seed = fullSeed();
    seed.spec!.identity!.tags = Array.from(
      { length: 100 },
      (_, index) => `initial-${String(index).padStart(3, "0")}`,
    );
    seed.claims = Array.from({ length: 100 }, (_, index) => {
      const suffix = String(index).padStart(3, "0");
      const path = `/spec/identity/tags/${suffix}`;
      return [
        claim({ id: `a-${suffix}`, path, value: `😀-selected-${suffix}` }),
        claim({ id: `b-${suffix}`, path, value: `😀-alternative-${suffix}` }),
      ];
    }).flat();

    const brief = projectSnapshotToBrief(createProjectSnapshot(seed));
    expect(brief.confirmed).toBe(false);
    expect(brief.corrections).toMatch(/^100 conflict details omitted .*sha256:[a-f0-9]{64}/);
    expect(new TextEncoder().encode(brief.corrections).byteLength).toBeLessThanOrEqual(4_096);
  });

  it("maps effective metadata to a Backstage-compatible Component", () => {
    const component = projectSnapshotToBackstageComponent(createProjectSnapshot(fullSeed()));
    expect(component).toEqual({
      apiVersion: "backstage.io/v1alpha1",
      kind: "Component",
      metadata: {
        name: "payments-api",
        namespace: "commerce",
        description: "Processes customer payments.",
        tags: ["api", "payments"],
        annotations: {
          "dwi.dev/project-id": "commerce/payments",
          "dwi.dev/source-root": "services/payments",
          "dwi.dev/snapshot-hash": expect.stringMatching(/^sha256:/),
          "dwi.dev/domain": "domain:default/commerce",
          "backstage.io/source-location": "url:https://github.example/commerce/payments",
        },
      },
      spec: {
        type: "service",
        lifecycle: "production",
        owner: "group:default/commerce-payments",
        system: "system:default/checkout",
        providesApis: ["api:default/payments-v1"],
        consumesApis: ["api:default/fraud-v2"],
        dependsOn: ["resource:default/payments-db"],
      },
    });
  });

  it("normalizes complete and shorthand Backstage references", () => {
    expect(toBackstageEntityRef("Group:Commerce/payments", "user")).toBe("group:commerce/payments");
    expect(toBackstageEntityRef("team:payments", "group")).toBe("team:default/payments");
    expect(toBackstageEntityRef("commerce/payments", "Group")).toBe("group:commerce/payments");
    expect(toBackstageEntityRef("payments", "Group")).toBe("group:default/payments");
  });

  it("rejects an owner that cannot produce a valid Backstage entity name", () => {
    const seed = fullSeed();
    seed.spec!.identity!.owners = ["***"];
    const snapshot = createProjectSnapshot(seed);

    expect(() => projectSnapshotToBackstageComponent(snapshot)).toThrow(
      DwiBackstageMappingError,
    );
    try {
      projectSnapshotToBackstageComponent(snapshot);
    } catch (error) {
      expect((error as DwiBackstageMappingError).invalidFields).toEqual([
        "spec.identity.owners[0]",
      ]);
    }
    expect(() => toBackstageEntityRef("group:default/---", "group")).toThrow(
      DwiBackstageMappingError,
    );
  });

  it.each([
    "providesApis",
    "consumesApis",
    "dependsOn",
  ] as const)("rejects an unsanitizable %s boundary reference", (key) => {
    const seed = fullSeed();
    seed.spec!.boundaries![key] = ["---"];

    try {
      projectSnapshotToBackstageComponent(createProjectSnapshot(seed));
      throw new Error("Expected invalid Backstage boundary reference rejection.");
    } catch (error) {
      expect(error).toBeInstanceOf(DwiBackstageMappingError);
      expect((error as DwiBackstageMappingError).invalidFields).toEqual([
        `spec.boundaries.${key}[0]`,
      ]);
    }
  });

  it("refuses to manufacture required Backstage governance fields", () => {
    const snapshot = createProjectSnapshot(
      { metadata: { id: "demo", name: "Demo" }, spec: { identity: { owners: [] } } },
      { generatedAt: NOW },
    );
    expect(() => projectSnapshotToBackstageComponent(snapshot)).toThrow(DwiBackstageMappingError);
    try {
      projectSnapshotToBackstageComponent(snapshot);
    } catch (error) {
      expect((error as DwiBackstageMappingError).missingFields).toEqual([
        "spec.identity.componentType",
        "spec.identity.lifecycle",
        "spec.identity.owners[0]",
      ]);
    }
  });

  it("refuses to export a deterministic winner while governance conflicts remain", () => {
    const seed = fullSeed();
    seed.claims = [
      claim({
        id: "owner-a",
        path: "/spec/identity/owners",
        value: ["group:team-a"],
        authority: "declaration",
      }),
      claim({
        id: "owner-b",
        path: "/spec/identity/owners",
        value: ["group:team-b"],
        authority: "declaration",
      }),
    ];
    const snapshot = createProjectSnapshot(seed);

    expect(snapshot.resolution.status).toBe("conflict");
    try {
      projectSnapshotToBackstageComponent(snapshot);
      throw new Error("Expected unresolved Backstage mapping rejection.");
    } catch (error) {
      expect(error).toBeInstanceOf(DwiBackstageMappingError);
      expect((error as DwiBackstageMappingError).unresolvedFields).toEqual(
        expect.arrayContaining(["/spec/identity/owners", "resolution.status"]),
      );
    }
  });

  it("omits absent optional Backstage fields and rejects names that cannot be normalized", () => {
    const seed = fullSeed();
    seed.metadata.source = { root: "." };
    seed.spec!.identity = {
      componentType: "library",
      lifecycle: "experimental",
      owners: ["platform"],
      tags: [],
    };
    seed.spec!.boundaries = {
      providesApis: [],
      consumesApis: [],
      dependsOn: [],
      componentRoots: ["src"],
      generatedRoots: [],
      excludedRoots: [],
    };
    const component = projectSnapshotToBackstageComponent(createProjectSnapshot(seed));
    expect(component.metadata).not.toHaveProperty("description");
    expect(component.metadata).not.toHaveProperty("tags");
    expect(component.metadata.annotations).not.toHaveProperty("backstage.io/source-location");
    expect(component.spec).not.toHaveProperty("system");
    expect(component.spec).not.toHaveProperty("providesApis");

    seed.metadata.name = "---";
    seed.metadata.namespace = "***";
    expect(() => projectSnapshotToBackstageComponent(createProjectSnapshot(seed))).toThrow(/metadata.name/);
  });
});
