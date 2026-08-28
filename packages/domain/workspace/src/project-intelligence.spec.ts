import { describe, expect, it } from "vitest";

import {
  collectProjectIntelligence,
  isKnownUnsupportedProjectEvidencePath,
  isSupportedProjectEvidencePath,
  PROJECT_INTELLIGENCE_MAX_FILE_BYTES,
  PROJECT_INTELLIGENCE_MAX_FILES,
  PROJECT_INTELLIGENCE_MAX_TOTAL_BYTES,
  ProjectIntelligenceInputError,
  SUPPORTED_PROJECT_FILE_GLOBS,
  type ProjectEvidenceInput,
} from "./project-intelligence.js";
import { validateSafeProbeDescriptor } from "./safe-probes.js";

const collect = (manifests: readonly ProjectEvidenceInput[]) =>
  collectProjectIntelligence({
    workspaceId: "org/repository",
    projectName: "Fixture",
    revision: { commit: "abc123", branch: "main", dirty: false },
    rootEntries: ["src", "README.md"],
    workspaceRoots: ["."],
    manifests,
  });

const ids = (facts: readonly { id: string }[]) => facts.map(({ id }) => id);

describe("project intelligence collector", () => {
  it("collects a Go fixture with evidence-backed commands and a valid probe", () => {
    const snapshot = collect([
      {
        path: "go.mod",
        name: "go.mod",
        content: [
          "module example.com/service",
          "go 1.23",
          "require github.com/gin-gonic/gin v1.10.0",
        ].join("\n"),
      },
      { path: "go.sum", name: "go.sum", content: "checksum" },
    ]);

    expect(ids(snapshot.languages)).toEqual(["go"]);
    expect(ids(snapshot.ecosystems)).toEqual(["go"]);
    expect(ids(snapshot.frameworks)).toEqual(["gin"]);
    expect(ids(snapshot.toolchains)).toEqual(["go"]);
    expect(snapshot.commands.map(({ kind, argv }) => [kind, argv])).toEqual([
      ["build", ["go", "build", "./..."]],
      ["lint", ["go", "vet", "./..."]],
      ["test", ["go", "test", "./..."]],
    ]);
    expect(snapshot.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "manifest",
          path: "go.mod",
          contentSha256: expect.stringMatching(/^[a-f0-9]{64}$/),
          observedFacts: expect.arrayContaining(["language:go", "command:test"]),
        }),
        expect.objectContaining({ kind: "lockfile", path: "go.sum" }),
      ]),
    );
    expect(snapshot.safeProbes).toEqual([
      expect.objectContaining({
        id: "go.environment",
        executable: "go",
        argv: ["env", "GOMOD", "GOVERSION"],
        cwd: ".",
      }),
    ]);
    expect(validateSafeProbeDescriptor(snapshot.safeProbes[0]!).valid).toBe(true);
    expect(snapshot.coverage).toMatchObject({
      overall: "complete",
      dimensions: { ecosystem: "complete", verification: "complete" },
    });
  });

  it("collects Python configuration without executing project code", () => {
    const snapshot = collect([
      {
        path: "services/api/pyproject.toml",
        content: [
          "[project]",
          'dependencies = ["fastapi", "pytest", "ruff", "mypy", "black"]',
          "[tool.uv]",
          "[tool.pytest.ini_options]",
          "[tool.ruff]",
          "[tool.mypy]",
          "[tool.black]",
        ].join("\n"),
      },
      {
        path: "services/worker/requirements.txt",
        content: "Flask==3.1\npytest>=8\n# comment",
      },
      { path: "legacy/setup.py", content: "from setuptools import setup" },
      { path: "poetry/poetry.lock", content: "" },
    ]);

    expect(ids(snapshot.languages)).toEqual(["python"]);
    expect(ids(snapshot.frameworks)).toEqual(["fastapi", "flask"]);
    expect(ids(snapshot.testFrameworks)).toEqual(["pytest"]);
    expect(ids(snapshot.toolchains)).toEqual(["pip", "poetry", "setuptools", "uv"]);
    expect(snapshot.commands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "test",
          argv: ["python", "-m", "pytest"],
          cwd: "services/api",
        }),
        expect.objectContaining({
          kind: "lint",
          argv: ["python", "-m", "ruff", "check", "."],
        }),
        expect.objectContaining({
          kind: "typecheck",
          argv: ["python", "-m", "mypy", "."],
        }),
        expect.objectContaining({
          kind: "format",
          argv: ["python", "-m", "black", "--check", "."],
        }),
      ]),
    );
    expect(snapshot.commands.every(({ argv }) => argv[0] !== "sh")).toBe(true);
    expect(snapshot.components.map(({ root }) => root)).toEqual([
      "legacy",
      "poetry",
      "services/api",
      "services/worker",
    ]);
  });

  it("collects a Rust workspace deterministically", () => {
    const manifests = [
      {
        path: "Cargo.toml",
        name: "ignored-mismatched-name",
        content: [
          "[workspace]",
          'members = ["crates/api"]',
          "[dependencies]",
          'axum = "0.8"',
          'actix-web = "4"',
          'rocket = "0.5"',
        ].join("\n"),
      },
      { path: "Cargo.lock", content: "version = 4" },
    ] satisfies ProjectEvidenceInput[];
    const first = collect(manifests);
    const second = collect([...manifests].reverse());

    expect(first).toEqual(second);
    expect(ids(first.languages)).toEqual(["rust"]);
    expect(ids(first.frameworks)).toEqual(["actix-web", "axum", "rocket"]);
    expect(first.commands.map(({ argv }) => argv)).toEqual([
      ["cargo", "build", "--workspace"],
      ["cargo", "fmt", "--all", "--", "--check"],
      [
        "cargo",
        "clippy",
        "--workspace",
        "--all-targets",
        "--",
        "-D",
        "warnings",
      ],
      ["cargo", "test", "--workspace"],
    ]);
    expect(first.safeProbes[0]).toMatchObject({
      id: "cargo.metadata",
      argv: ["metadata", "--frozen", "--no-deps", "--format-version", "1"],
    });
  });

  it("orders non-ASCII evidence paths by code unit independent of host locale", () => {
    const manifests = [
      { path: "ä-service/go.mod", content: "module example.test/a" },
      { path: "z-service/go.mod", content: "module example.test/z" },
    ];
    const first = collect(manifests);
    const second = collect([...manifests].reverse());

    expect(first).toEqual(second);
    expect(first.evidence.map(({ path }) => path)).toEqual([
      "z-service/go.mod",
      "ä-service/go.mod",
    ]);
  });

  it("collects Node declarations, scripts, frameworks, and malformed input safely", () => {
    const snapshot = collect([
      {
        path: "frontend/package.json",
        content: JSON.stringify({
          packageManager: "pnpm@11",
          scripts: {
            build: "next build",
            "test:unit": "vitest",
            lint: "eslint .",
            typecheck: "tsc --noEmit",
            format: "prettier --check .",
            ignored: "echo ignored",
            empty: "",
          },
          dependencies: {
            react: "1",
            next: "1",
            vue: "1",
            svelte: "1",
            express: "1",
            "@nestjs/core": "1",
          },
          devDependencies: {
            typescript: "1",
            vitest: "1",
            jest: "1",
            mocha: "1",
            "@playwright/test": "1",
          },
        }),
      },
      { path: "frontend/tsconfig.json", content: "{}" },
      { path: "frontend/pnpm-lock.yaml" },
      { path: "broken/package.json", content: "[]" },
      { path: "yarn/yarn.lock" },
      { path: "bun/bun.lockb" },
      { path: "npm/package-lock.json" },
    ]);

    expect(ids(snapshot.languages)).toEqual(["javascript", "typescript"]);
    expect(ids(snapshot.frameworks)).toEqual([
      "express",
      "nestjs",
      "nextjs",
      "react",
      "svelte",
      "vue",
    ]);
    expect(ids(snapshot.testFrameworks)).toEqual([
      "jest",
      "mocha",
      "playwright",
      "vitest",
    ]);
    expect(ids(snapshot.toolchains)).toEqual([
      "bun",
      "npm",
      "pnpm",
      "typescript",
      "yarn",
    ]);
    expect(snapshot.commands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ argv: ["pnpm", "run", "build"], origin: "declared" }),
        expect.objectContaining({
          argv: ["tsc", "--noEmit", "-p", "tsconfig.json"],
          cwd: "frontend",
        }),
      ]),
    );
    expect(snapshot.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          schemaVersion: 1,
          code: "MALFORMED_MANIFEST",
          requiresVerification: true,
          path: "broken/package.json",
        }),
        expect.objectContaining({
          schemaVersion: 1,
          code: "FILENAME_ONLY_EVIDENCE",
          path: "frontend/pnpm-lock.yaml",
        }),
      ]),
    );
  });

  it("keeps an explicit Node package manager authoritative across conflicting locks", () => {
    const snapshot = collect([
      {
        path: "app/package.json",
        content: JSON.stringify({
          packageManager: "pnpm@11.0.0",
          scripts: { test: "vitest" },
        }),
      },
      { path: "app/package-lock.json", content: "{}" },
      { path: "app/yarn.lock", content: "lock" },
    ]);

    expect(snapshot.commands).toEqual([
      expect.objectContaining({
        argv: ["pnpm", "run", "test"],
        origin: "declared",
      }),
    ]);
    expect(snapshot.diagnostics.some(({ code }) => code === "AMBIGUOUS_PACKAGE_MANAGER")).toBe(
      false,
    );
    expect(snapshot.toolchains).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "pnpm", confidence: "high" }),
        expect.objectContaining({ id: "npm", confidence: "medium" }),
        expect.objectContaining({ id: "yarn", confidence: "medium" }),
      ]),
    );
  });

  it("keeps Node package-manager authority bound to each monorepo root", () => {
    const snapshot = collect([
      {
        path: "package.json",
        content: JSON.stringify({ scripts: { test: "node --test" } }),
      },
      { path: "package-lock.json", content: "{}" },
      {
        path: "apps/web/package.json",
        content: JSON.stringify({
          packageManager: "pnpm@11.0.0",
          scripts: { build: "vite build" },
        }),
      },
      { path: "apps/web/pnpm-lock.yaml", content: "lockfileVersion: '9.0'" },
    ]);

    expect(snapshot.commands).toEqual([
      expect.objectContaining({
        argv: ["npm", "run", "test"],
        cwd: ".",
        origin: "declared",
      }),
      expect.objectContaining({
        argv: ["pnpm", "run", "build"],
        cwd: "apps/web",
        origin: "declared",
      }),
    ]);
    expect(snapshot.ecosystems).toEqual([
      expect.objectContaining({
        id: "node",
        roots: [".", "apps/web"],
        rootBindings: [
          expect.objectContaining({ root: ".", confidence: "high" }),
          expect.objectContaining({ root: "apps/web", confidence: "high" }),
        ],
      }),
    ]);
    expect(snapshot.toolchains).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "npm",
          roots: ["."],
          rootBindings: [expect.objectContaining({ root: ".", confidence: "high" })],
        }),
        expect.objectContaining({
          id: "pnpm",
          roots: ["apps/web"],
          rootBindings: [
            expect.objectContaining({ root: "apps/web", confidence: "high" }),
          ],
        }),
      ]),
    );
  });

  it("keeps npm fallback scripts as inferred proposals without manager evidence", () => {
    const snapshot = collect([
      {
        path: "app/package.json",
        content: JSON.stringify({ scripts: { build: "vite build", test: "vitest" } }),
      },
    ]);

    expect(snapshot.commands).toEqual([
      expect.objectContaining({
        argv: ["npm", "run", "build"],
        origin: "inferred",
      }),
      expect.objectContaining({
        argv: ["npm", "run", "test"],
        origin: "inferred",
      }),
    ]);
    expect(snapshot.toolchains).toEqual([
      expect.objectContaining({
        id: "npm",
        confidence: "medium",
        rootBindings: [
          expect.objectContaining({ root: "app", confidence: "medium" }),
        ],
      }),
    ]);
    expect(snapshot.diagnostics).toEqual([
      expect.objectContaining({
        schemaVersion: 1,
        code: "UNDECLARED_PACKAGE_MANAGER",
        requiresVerification: true,
        path: "app/package.json",
        candidates: ["npm"],
      }),
    ]);
    expect(snapshot.coverage).toMatchObject({
      overall: "partial",
      dimensions: { toolchain: "partial" },
      unknowns: expect.arrayContaining([
        "manifest-verification",
        "package-manager-authority",
      ]),
    });
  });

  it("requires verification instead of selecting among multiple undeclared Node managers", () => {
    const snapshot = collect([
      {
        path: "app/package.json",
        content: JSON.stringify({ scripts: { test: "vitest" } }),
      },
      { path: "app/package-lock.json", content: "{}" },
      { path: "app/pnpm-lock.yaml", content: "lock" },
    ]);

    expect(snapshot.commands).toEqual([]);
    expect(snapshot.toolchains).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "npm",
          confidence: "medium",
          rootBindings: [expect.objectContaining({ root: "app", confidence: "medium" })],
        }),
        expect.objectContaining({
          id: "pnpm",
          confidence: "medium",
          rootBindings: [expect.objectContaining({ root: "app", confidence: "medium" })],
        }),
      ]),
    );
    expect(snapshot.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          schemaVersion: 1,
          code: "AMBIGUOUS_PACKAGE_MANAGER",
          requiresVerification: true,
          path: "app/package.json",
          candidates: ["npm", "pnpm"],
        }),
      ]),
    );
    expect(snapshot.coverage).toMatchObject({
      overall: "partial",
      dimensions: { toolchain: "partial", verification: "unknown" },
      unknowns: expect.arrayContaining([
        "manifest-verification",
        "package-manager-authority",
      ]),
    });
  });

  it("flags conflicting lockfiles even while package.json is absent during migration", () => {
    const snapshot = collect([
      { path: "transition/package-lock.json", content: "{}" },
      { path: "transition/yarn.lock", content: "lock" },
    ]);

    expect(snapshot.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          schemaVersion: 1,
          code: "AMBIGUOUS_PACKAGE_MANAGER",
          requiresVerification: true,
          candidates: ["npm", "yarn"],
        }),
      ]),
    );
    expect(snapshot.toolchains.every(({ confidence }) => confidence === "medium")).toBe(
      true,
    );
    expect(snapshot.coverage.unknowns).toContain("package-manager-authority");
  });

  it("transitions filename-only and malformed primary manifests to parsed facts", () => {
    const unverified = collect([
      { path: "go/go.mod", content: "" },
      { path: "rust/Cargo.toml", content: "not toml project metadata" },
      { path: "java/pom.xml", content: "<dependencies/>" },
    ]);

    expect(unverified.languages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "go", confidence: "medium" }),
        expect.objectContaining({ id: "rust", confidence: "medium" }),
        expect.objectContaining({ id: "java", confidence: "medium" }),
      ]),
    );
    expect(unverified.commands).toEqual([]);
    expect(unverified.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          schemaVersion: 1,
          code: "FILENAME_ONLY_EVIDENCE",
          path: "go/go.mod",
        }),
        expect.objectContaining({
          schemaVersion: 1,
          code: "MALFORMED_MANIFEST",
          path: "rust/Cargo.toml",
        }),
        expect.objectContaining({
          schemaVersion: 1,
          code: "MALFORMED_MANIFEST",
          path: "java/pom.xml",
        }),
      ]),
    );
    expect(unverified.coverage.overall).toBe("partial");

    const verified = collect([
      { path: "go/go.mod", content: "module example.test/go\ngo 1.23" },
      { path: "rust/Cargo.toml", content: "[package]\nname = \"rust\"" },
      { path: "java/pom.xml", content: "<project></project>" },
    ]);
    expect(verified.languages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "go", confidence: "high" }),
        expect.objectContaining({ id: "rust", confidence: "high" }),
        expect.objectContaining({ id: "java", confidence: "high" }),
      ]),
    );
    expect(verified.commands).not.toHaveLength(0);
    expect(verified.commands.every(({ origin }) => origin === "inferred")).toBe(true);
    expect(verified.diagnostics).toEqual([]);
  });

  it("keeps aggregate confidence conservative across strong and weak roots", () => {
    const snapshot = collect([
      { path: "go.mod", content: "module example.test/root\ngo 1.23" },
      { path: "legacy/go.mod", content: "" },
    ]);

    for (const fact of [
      snapshot.languages.find(({ id }) => id === "go"),
      snapshot.ecosystems.find(({ id }) => id === "go"),
      snapshot.toolchains.find(({ id }) => id === "go"),
    ]) {
      expect(fact).toEqual(
        expect.objectContaining({
          confidence: "medium",
          roots: [".", "legacy"],
          rootBindings: [
            expect.objectContaining({ root: ".", confidence: "high" }),
            expect.objectContaining({ root: "legacy", confidence: "medium" }),
          ],
        }),
      );
    }
    expect(snapshot.commands.every(({ cwd }) => cwd === ".")).toBe(true);
    expect(snapshot.coverage).toMatchObject({
      overall: "partial",
      unknowns: expect.arrayContaining(["manifest-verification"]),
    });
  });

  it("preserves a digest of original binary manifest bytes", () => {
    const rawDigest = "b".repeat(64);
    const snapshot = collect([
      {
        path: "frontend/bun.lockb",
        contentSha256: rawDigest,
      },
      {
        path: "frontend/package.json",
        content: "{}",
        contentSha256: "c".repeat(64),
      },
    ]);

    expect(snapshot.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "frontend/bun.lockb",
          contentSha256: rawDigest,
          byteLength: 0,
        }),
        expect.objectContaining({
          path: "frontend/package.json",
          contentSha256: "c".repeat(64),
        }),
      ]),
    );
    expect(() => collect([{ path: "bun.lockb", contentSha256: "not-a-digest" }])).toThrow(
      /Invalid contentSha256/,
    );
  });

  it("covers JVM, .NET, PHP, C/C++, Shell, and Terraform packs", () => {
    const snapshot = collect([
      {
        path: "java/pom.xml",
        content:
          "<project><spring-boot/><quarkus/><micronaut/><junit/><testng/></project>",
      },
      {
        path: "kotlin/build.gradle.kts",
        content: 'plugins { kotlin("jvm"); id("org.springframework.boot") } // junit',
      },
      {
        path: "kotlin/gradle/wrapper/gradle-wrapper.properties",
        content: "distributionUrl=x",
      },
      {
        path: "dotnet/App.csproj",
        content:
          '<Project Sdk="Microsoft.NET.Sdk.Web"><PackageReference Include="Microsoft.NET.Test.Sdk"/><PackageReference Include="xunit"/><PackageReference Include="NUnit"/></Project>',
      },
      { path: "dotnet/App.sln", content: "solution" },
      { path: "dotnet/global.json", content: "{}" },
      {
        path: "php/composer.json",
        content: JSON.stringify({
          require: {
            "laravel/framework": "1",
            "symfony/framework-bundle": "1",
          },
          "require-dev": { "phpunit/phpunit": "1" },
          scripts: { test: ["phpunit"], lint: "phpcs", ignored: 4 },
        }),
      },
      { path: "php/composer.lock", content: "{}" },
      {
        path: "native/CMakeLists.txt",
        content: "project(native LANGUAGES C CXX)\ninclude(CTest)\nadd_test(NAME unit COMMAND unit)",
      },
      {
        path: "meson/meson.build",
        content: "project('native', 'c', 'cpp')\ntest('unit', executable('unit', 'unit.cpp'))",
      },
      { path: "make/Makefile", content: "all:\n\tcc main.c\ntest:\n\t./test" },
      { path: "scripts/check.sh", content: "#!/bin/sh\nexit 0" },
      { path: "scripts/.shellcheckrc", content: "shell=sh" },
      { path: "infra/main.tf", content: 'terraform { required_version = ">= 1.8" }' },
      { path: "infra/.terraform.lock.hcl", content: "provider hashicorp/aws {}" },
      { path: "packer/template.hcl", content: "source {}" },
    ]);

    expect(ids(snapshot.languages)).toEqual([
      "c",
      "cpp",
      "csharp",
      "hcl",
      "java",
      "kotlin",
      "php",
      "shell",
    ]);
    expect(ids(snapshot.ecosystems)).toEqual([
      "cmake",
      "composer",
      "dotnet",
      "gradle",
      "maven",
      "meson",
      "shell",
      "terraform",
    ]);
    expect(ids(snapshot.frameworks)).toEqual([
      "aspnet-core",
      "laravel",
      "micronaut",
      "quarkus",
      "spring-boot",
      "symfony",
    ]);
    expect(ids(snapshot.testFrameworks)).toEqual([
      "dotnet-test-sdk",
      "junit",
      "nunit",
      "phpunit",
      "testng",
      "xunit",
    ]);
    expect(snapshot.commands).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ argv: ["mvn", "-B", "test"] }),
        expect.objectContaining({ argv: ["./gradlew", "test"] }),
        expect.objectContaining({
          argv: ["dotnet", "test", "App.csproj", "--no-restore"],
          cwd: "dotnet",
        }),
        expect.objectContaining({ argv: ["composer", "run-script", "test"] }),
        expect.objectContaining({ argv: ["ctest", "--test-dir", "build"] }),
        expect.objectContaining({ argv: ["shellcheck", "check.sh"], cwd: "scripts" }),
        expect.objectContaining({ argv: ["terraform", "validate"] }),
      ]),
    );
    expect(snapshot.evidence.find(({ path }) => path === "scripts/check.sh")?.kind).toBe(
      "source",
    );
    expect(snapshot.evidence.find(({ path }) => path === "infra/main.tf")?.kind).toBe(
      "configuration",
    );
  });

  it("reports unsupported evidence and exposes coverage instead of confidence theater", () => {
    const snapshot = collect([{ path: "README.md", content: "# project" }]);
    expect(snapshot.languages).toEqual([]);
    expect(snapshot.evidence).toEqual([]);
    expect(snapshot.coverage).toEqual({
      overall: "unsupported",
      dimensions: {
        identity: "complete",
        ecosystem: "unknown",
        toolchain: "unknown",
        verification: "unknown",
        architecture: "unknown",
      },
      unknowns: [
        "architecture-relationships",
        "ecosystem",
        "lifecycle",
        "ownership",
        "toolchain",
        "verification",
      ],
    });
    expect(snapshot.diagnostics[0]?.code).toBe("UNSUPPORTED_PROJECT");
  });

  it("makes known unsupported manifests explicit and prevents complete mixed-repo coverage", () => {
    const snapshot = collect([
      { path: "services/api/go.mod", content: "module example.test/api\ngo 1.23" },
      { path: "legacy/Gemfile", content: 'source "https://rubygems.org"' },
      { path: "legacy/Gemfile.lock", content: "GEM" },
      { path: "mobile/pubspec.yaml", content: "name: mobile" },
    ]);

    expect(snapshot.languages.map(({ id }) => id)).toEqual(["go"]);
    expect(snapshot.coverage).toMatchObject({
      overall: "partial",
      dimensions: {
        ecosystem: "partial",
        toolchain: "partial",
        verification: "partial",
      },
      unknowns: expect.arrayContaining(["unsupported-project-manifests"]),
    });
    expect(snapshot.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "UNSUPPORTED_MANIFEST", path: "legacy/Gemfile" }),
        expect.objectContaining({ code: "UNSUPPORTED_MANIFEST", path: "legacy/Gemfile.lock" }),
        expect.objectContaining({ code: "UNSUPPORTED_MANIFEST", path: "mobile/pubspec.yaml" }),
      ]),
    );
    expect(snapshot.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "legacy/Gemfile",
          observedFacts: ["unsupported-ecosystem:ruby"],
        }),
        expect.objectContaining({
          path: "mobile/pubspec.yaml",
          observedFacts: ["unsupported-ecosystem:dart"],
        }),
      ]),
    );
  });

  it("represents unobserved repository dirtiness as unknown", () => {
    const unknown = collectProjectIntelligence({
      workspaceId: "org/repository",
      projectName: "Fixture",
      manifests: [{ path: "go.mod" }],
    });
    const observed = collectProjectIntelligence({
      workspaceId: "org/repository",
      projectName: "Fixture",
      revision: { dirty: false },
      manifests: [{ path: "go.mod" }],
    });

    expect(unknown.revision).toEqual({ commit: null, branch: null, dirty: null });
    expect(observed.revision.dirty).toBe(false);
  });

  it("publishes bounded supported patterns and rejects unsafe or ambiguous input", () => {
    expect(SUPPORTED_PROJECT_FILE_GLOBS.length).toBeGreaterThan(10);
    for (const supported of [
      "package.json",
      "api/App.csproj",
      "solution.slnx",
      "scripts/test.sh",
      "infra/main.tf.json",
      "config/nomad.hcl",
    ]) {
      expect(isSupportedProjectEvidencePath(supported)).toBe(true);
    }
    expect(isSupportedProjectEvidencePath("README.md")).toBe(false);
    for (const unsupported of ["Gemfile", "legacy/Gemfile.lock", "mobile/pubspec.yaml"]) {
      expect(isKnownUnsupportedProjectEvidencePath(unsupported)).toBe(true);
      expect(isSupportedProjectEvidencePath(unsupported)).toBe(false);
    }

    for (const path of ["../go.mod", "/tmp/go.mod", "C:/repo/go.mod", "a\\go.mod", "a//go.mod", "a/./go.mod", "bad\u0000/go.mod"]) {
      expect(() => collect([{ path }])).toThrow(ProjectIntelligenceInputError);
    }
    expect(() => collect([{ path: "go.mod" }, { path: "go.mod" }])).toThrow(
      /Duplicate evidence path/,
    );
    expect(() => collect([{ path: "go.mod", content: "x".repeat(PROJECT_INTELLIGENCE_MAX_FILE_BYTES + 1) }])).toThrow(
      /byte limit/,
    );
    expect(() =>
      collect(
        Array.from({ length: PROJECT_INTELLIGENCE_MAX_FILES + 1 }, (_, index) => ({
          path: `service-${index}/go.mod`,
        })),
      ),
    ).toThrow(/file limit/);
    expect(() =>
      collect(
        Array.from({ length: 5 }, (_, index) => ({
          path: `service-${index}/go.mod`,
          content: "x".repeat(Math.floor(PROJECT_INTELLIGENCE_MAX_TOTAL_BYTES / 5) + 1),
        })),
      ),
    ).toThrow(/byte total limit/);
    expect(() =>
      collectProjectIntelligence({ workspaceId: " ", projectName: "x", manifests: [] }),
    ).toThrow(/workspaceId is required/);
    expect(() =>
      collectProjectIntelligence({ workspaceId: "x", projectName: "bad\u0001", manifests: [] }),
    ).toThrow(/control characters/);
    expect(() =>
      collectProjectIntelligence({
        workspaceId: "x",
        projectName: "x",
        workspaceRoots: ["../outside"],
        manifests: [],
      }),
    ).toThrow(/Invalid evidence path/);
  });
});
