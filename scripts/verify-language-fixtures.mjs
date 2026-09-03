#!/usr/bin/env node

import { createHash } from "node:crypto";
import { access, readdir, readFile, stat } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const IGNORED_DIRECTORIES = new Set([
  ".dwi",
  ".git",
  ".venv",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "target",
]);
const MAX_DEPTH = 4;
const compareCodeUnits = (left, right) => left < right ? -1 : left > right ? 1 : 0;

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
const DEFAULT_FIXTURES_ROOT = resolve(repositoryRoot, "tests", "fixtures", "languages");
const collectorModulePath = join(
  repositoryRoot,
  "packages/domain/workspace/dist/index.js",
);
const adapterModulePath = join(
  repositoryRoot,
  "apps/dwi-host/dist/project-snapshot-adapter.js",
);
const coreModulePath = join(repositoryRoot, "packages/dwi-core/dist/index.js");

const expectations = {
  go: {
    marker: "go.mod",
    language: "go",
    ecosystem: "go",
    toolchain: "go",
    probe: "go.environment",
    commands: [
      ["build", "go build ./..."],
      ["lint", "go vet ./..."],
      ["test", "go test ./..."],
    ],
  },
  python: {
    marker: "pyproject.toml",
    language: "python",
    ecosystem: "python",
    toolchain: "pip",
    probe: "python.version",
    commands: [["test", "python -m pytest"]],
    testFramework: "pytest",
  },
  rust: {
    marker: "Cargo.toml",
    language: "rust",
    ecosystem: "cargo",
    toolchain: "cargo",
    probe: "cargo.metadata",
    commands: [
      ["build", "cargo build --workspace"],
      ["format", "cargo fmt --all -- --check"],
      ["lint", "cargo clippy --workspace --all-targets -- -D warnings"],
      ["test", "cargo test --workspace"],
    ],
  },
};

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function directoryEntries(path) {
  return (await readdir(path, { withFileTypes: true })).sort((left, right) =>
    compareCodeUnits(left.name, right.name),
  );
}

async function assertDirectory(path) {
  const value = await stat(path);
  if (!value.isDirectory()) throw new Error(`Fixture root is not a directory: ${path}`);
}

async function hasDirectLanguageMarker(path) {
  const matches = await Promise.all(
    Object.values(expectations).map(({ marker }) => exists(join(path, marker))),
  );
  return matches.some(Boolean);
}

async function resolveFixtureRoots(arguments_) {
  const requested = arguments_.length
    ? arguments_.map((value) => resolve(value))
    : [DEFAULT_FIXTURES_ROOT];
  const roots = [];

  for (const requestedRoot of requested) {
    await assertDirectory(requestedRoot);
    if (await hasDirectLanguageMarker(requestedRoot)) {
      roots.push(requestedRoot);
      continue;
    }

    const childRoots = [];
    for (const entry of await directoryEntries(requestedRoot)) {
      if (!entry.isDirectory() || IGNORED_DIRECTORIES.has(entry.name)) continue;
      const candidate = join(requestedRoot, entry.name);
      if (await hasDirectLanguageMarker(candidate)) childRoots.push(candidate);
    }
    if (childRoots.length) roots.push(...childRoots);
    else roots.push(requestedRoot);
  }

  return [...new Set(roots)].sort();
}

function portableRelative(root, path) {
  return relative(root, path).split(sep).join("/");
}

async function collectFixtureFiles(root, isSupportedProjectEvidencePath) {
  const manifests = [];
  const evidenceContent = {};
  const evidenceSha256 = {};

  async function visit(directory, depth) {
    for (const entry of await directoryEntries(directory)) {
      const absolutePath = join(directory, entry.name);
      const path = portableRelative(root, absolutePath);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (depth < MAX_DEPTH && !IGNORED_DIRECTORIES.has(entry.name)) {
          await visit(absolutePath, depth + 1);
        }
        continue;
      }
      if (!entry.isFile()) continue;
      if (isSupportedProjectEvidencePath(path)) {
        const bytes = await readFile(absolutePath);
        const contentSha256 = createHash("sha256").update(bytes).digest("hex");
        evidenceSha256[path] = contentSha256;
        if (entry.name.toLowerCase() === "bun.lockb") manifests.push({ path, contentSha256 });
        else {
          const content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
          manifests.push({ path, content, contentSha256 });
          evidenceContent[path] = content;
        }
      } else if (/^(?:README(?:\.[^/]*)?|CODEOWNERS)$/i.test(entry.name)) {
        const bytes = await readFile(absolutePath);
        evidenceContent[path] = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        evidenceSha256[path] = createHash("sha256").update(bytes).digest("hex");
      }
    }
  }

  await visit(root, 0);
  manifests.sort((left, right) => compareCodeUnits(left.path, right.path));
  const rootEntries = (await directoryEntries(root))
    .filter((entry) => !IGNORED_DIRECTORIES.has(entry.name))
    .map(({ name }) => name);
  return { manifests, evidenceContent, evidenceSha256, rootEntries };
}

function commandKey(command) {
  return `${command.kind}\u0000${command.argv.join(" ")}`;
}

function supportedKinds(manifests) {
  const paths = new Set(manifests.map(({ path }) => path));
  return Object.entries(expectations)
    .filter(([, expectation]) => paths.has(expectation.marker))
    .map(([kind]) => kind);
}

function runChecks({ kind, expectation, intelligence, canonical }) {
  const failures = [];
  let checks = 0;
  const check = (condition, message) => {
    checks += 1;
    if (!condition) failures.push(message);
  };
  const ids = (items) => items.map(({ id }) => id);

  check(ids(intelligence.languages).includes(expectation.language), `missing language '${expectation.language}'`);
  check(ids(intelligence.ecosystems).includes(expectation.ecosystem), `missing ecosystem '${expectation.ecosystem}'`);
  check(ids(intelligence.toolchains).includes(expectation.toolchain), `missing toolchain '${expectation.toolchain}'`);
  if (expectation.testFramework) {
    check(
      ids(intelligence.testFrameworks).includes(expectation.testFramework),
      `missing test framework '${expectation.testFramework}'`,
    );
  }

  const commands = new Set(intelligence.commands.map(commandKey));
  for (const [commandKind, argv] of expectation.commands) {
    check(
      commands.has(`${commandKind}\u0000${argv}`),
      `missing ${commandKind} command '${argv}'`,
    );
  }

  const markerEvidence = intelligence.evidence.find(
    ({ path }) => path === expectation.marker,
  );
  check(Boolean(markerEvidence), `missing evidence for '${expectation.marker}'`);
  check(
    /^[a-f0-9]{64}$/.test(markerEvidence?.contentSha256 ?? ""),
    `evidence for '${expectation.marker}' has no SHA-256 digest`,
  );
  check(
    markerEvidence?.observedFacts.includes(`language:${expectation.language}`) ?? false,
    `evidence for '${expectation.marker}' is not linked to its language fact`,
  );
  check(
    intelligence.commands
      .filter(({ sourcePath }) => sourcePath === expectation.marker)
      .every(({ evidenceRefs }) => evidenceRefs.includes(markerEvidence?.id ?? "")),
    `commands from '${expectation.marker}' are not evidence-linked`,
  );
  check(
    intelligence.safeProbes.some(({ id }) => id === expectation.probe),
    `missing allowlisted probe '${expectation.probe}'`,
  );

  if (canonical) {
    check(canonical.validation.valid, `canonical snapshot is invalid: ${canonical.validation.issues.map(({ path, message }) => `${path} ${message}`).join("; ")}`);
    check(
      ids(canonical.snapshot.observed.languages).includes(expectation.language),
      `canonical snapshot lost language '${expectation.language}'`,
    );
    for (const [expectedKind, expectedArgv] of expectation.commands) {
      const sourceCommand = intelligence.commands.find(
        ({ kind: commandKind, argv }) => commandKind === expectedKind && argv.join(" ") === expectedArgv,
      );
      const declared = sourceCommand?.origin === "declared";
      check(
        declared
          ? canonical.snapshot.spec.workflows.some(
            ({ kind: workflowKind, argv }) => workflowKind === expectedKind && argv.join(" ") === expectedArgv,
          )
          : canonical.snapshot.proposals.some(
            ({ producer, state, risk, value }) => producer === "importer" && state === "pending" && risk === "high"
              && value?.kind === expectedKind && value?.argv?.join?.(" ") === expectedArgv,
          ),
        declared
          ? `canonical snapshot lost declared ${kind} ${expectedKind} workflow '${expectedArgv}'`
          : `canonical snapshot did not quarantine inferred ${kind} ${expectedKind} workflow '${expectedArgv}' as a pending high-risk proposal`,
      );
    }
    check(
      canonical.snapshot.claims.some(
        ({ authority, evidenceRefs }) =>
          authority === "deterministic" && evidenceRefs.length > 0,
      ),
      "canonical snapshot has no evidence-backed deterministic claim",
    );
  }

  return { checks, failures };
}

async function main() {
  if (!(await exists(collectorModulePath))) {
    throw new Error(`Built collector is missing: ${collectorModulePath}`);
  }
  const {
    collectProjectIntelligence,
    isSupportedProjectEvidencePath,
  } = await import(pathToFileURL(collectorModulePath));

  let adapter;
  let validateProjectSnapshot;
  if (await exists(adapterModulePath)) {
    ({ projectIntelligenceToSnapshot: adapter } = await import(
      pathToFileURL(adapterModulePath)
    ));
    ({ validateProjectSnapshot } = await import(pathToFileURL(coreModulePath)));
  }

  const roots = await resolveFixtureRoots(process.argv.slice(2));
  const results = [];
  let totalChecks = 0;

  for (const root of roots) {
    const collected = await collectFixtureFiles(root, isSupportedProjectEvidencePath);
    const kinds = supportedKinds(collected.manifests);
    if (!kinds.length) {
      results.push({
        fixture: basename(root),
        kinds: [],
        checks: 1,
        failures: ["no Go, Python, or Rust root manifest found"],
      });
      totalChecks += 1;
      continue;
    }

    const input = {
      workspaceId: `fixture/${basename(root)}`,
      projectName: basename(root),
      manifests: collected.manifests,
      rootEntries: collected.rootEntries,
      workspaceRoots: ["."],
      revision: { commit: null, branch: null },
    };
    const intelligence = collectProjectIntelligence(input);
    const repeated = collectProjectIntelligence({
      ...input,
      manifests: [...input.manifests].reverse(),
      rootEntries: [...input.rootEntries].reverse(),
    });
    const fixtureFailures = [];
    let fixtureChecks = 1;
    if (JSON.stringify(intelligence) !== JSON.stringify(repeated)) {
      fixtureFailures.push("collector output changes when evidence input order changes");
    }

    let canonical;
    if (adapter) {
      const snapshot = adapter({
        intelligence,
        generatedAt: "2000-01-01T00:00:00.000Z",
        evidenceContent: collected.evidenceContent,
        evidenceSha256: collected.evidenceSha256,
      });
      canonical = { snapshot, validation: validateProjectSnapshot(snapshot) };
    }

    for (const kind of kinds) {
      const checked = runChecks({
        kind,
        expectation: expectations[kind],
        intelligence,
        canonical,
      });
      fixtureChecks += checked.checks;
      fixtureFailures.push(...checked.failures);
    }
    totalChecks += fixtureChecks;
    results.push({
      fixture: basename(root),
      kinds,
      checks: fixtureChecks,
      failures: fixtureFailures,
      languages: intelligence.languages.map(({ id }) => id),
      ecosystems: intelligence.ecosystems.map(({ id }) => id),
      commands: intelligence.commands.map(({ kind, argv }) => `${kind}: ${argv.join(" ")}`),
      evidence: intelligence.evidence.map(({ path }) => path),
      canonicalSnapshot: adapter
        ? canonical.validation.valid
          ? "valid"
          : "invalid"
        : "adapter-unavailable",
    });
  }

  const failures = results.reduce(
    (count, result) => count + result.failures.length,
    0,
  );
  const report = {
    ok: failures === 0,
    adapter: adapter ? "verified" : "unavailable",
    summary: { fixtures: results.length, checks: totalChecks, failures },
    projects: results,
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (failures) process.exitCode = 1;
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stdout.write(
    `${JSON.stringify({ ok: false, error: message }, null, 2)}\n`,
  );
  process.exitCode = 1;
});
