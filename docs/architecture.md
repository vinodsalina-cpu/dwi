# DWI production architecture

DWI separates facts, decisions, and suggestions. A filename or parser result is an observation; it becomes useful only with its evidence and coverage. Ownership and lifecycle are organizational decisions and are never guessed from source layout.

## Data flow

```text
explicit consent
  → bounded workspace inspection
  → deterministic ecosystem packs
  → canonical claims + evidence
  → declaration/catalog precedence
  → conflict and coverage resolution
  → reviewed project snapshot
  ├─ IDE project-intelligence view
  ├─ local AI-context digest
  ├─ Backstage Component export
  └─ encrypted team catalog
```

Restricted probes are a separate optional input. Packs own the exact executable and argument vectors. A descriptor is valid only when it retains direct spawning, a normalized repository-relative working directory, disabled networking, a read-only filesystem, one process, a five-second timeout, and a 64 KiB output ceiling. The current VS Code host deliberately does not execute probes because it cannot enforce every sandbox property portably.

## Canonical snapshot

`@platform/dwi-core` exports the `dwi.dev/v1` `Project` contract and a JSON Schema 2020-12 representation. The snapshot contains:

- metadata: stable workspace identity, namespace, source, revision, freshness, and review state;
- spec: declared identity, boundaries, workflows, and constraints;
- observed: languages, ecosystems, frameworks, toolchains, components, entrypoints, documentation, dependency artifacts, and security signals;
- claims: field path, value, authority, state, confidence, extractor, and evidence references;
- evidence: bounded source records, hashes, parser identifiers, timestamps, and redactions;
- proposals: separately reviewable AI, human, or importer suggestions;
- resolution: effective values, deterministic hash, conflicts, unknowns, status, and dimensional coverage.

Resolution precedence is field-aware. Human decisions are strongest. Checked-in declarations normally outrank the central catalog and deterministic packs; catalog ownership is preferred over a repository guess; restricted toolchain probes outrank manifest inference for exact runtime versions. AI is limited to low-risk narrative fields such as description and tags and cannot auto-accept ownership, commands, architecture, security, or lifecycle.

## Runtime boundaries

The extension host reads only an approved file allowlist, with limits of 1,000 files, depth four, 256 KiB per file, and 1 MiB total metadata. Private paths, environment files, credentials, generated output, dependencies, caches, and traversal are rejected. Collection does not invoke a shell or project command.

`.dwi/project.yaml` is a checked-in authoritative declaration and the only DWI state stored in the repository. Managed journey state and inspection consent live in VS Code extension global storage under a local-root fingerprint, so clones of the same remote do not inherit one another's consent. Snapshot writes there use a verified staging directory, and corrupt or legacy managed state is moved to a recoverable sibling instead of overwritten. Refresh and reset operations leave the checked-in declaration and unrelated workspace `.dwi` content untouched.

The optional catalog validates snapshots at every trust boundary and encrypts the complete bounded bundle at rest. Its default bearer-token authenticator and loopback listener are suitable for local evaluation. A company deployment should place it behind the organization’s OIDC/mTLS gateway, map identity-provider groups to reader/writer/admin roles, move encryption keys into KMS, ship audit events to the SIEM, and use a transactional object store or database.

## Enterprise rollout

1. Pilot deterministic packs and coverage reporting without central upload.
2. Check in declarations for tier-one repositories and map existing Backstage entities.
3. Add catalog read-through and governed full-bundle synchronization through the company gateway.
4. Enable restricted probes only in an isolated worker with OS-level network and filesystem enforcement.
5. Add AI enrichment for context summaries and onboarding, evaluated against a golden repository corpus; keep high-risk fields human-gated.
6. Measure stale-snapshot rate, unresolved required fields, detector precision/recall, review latency, and downstream correction rate by ecosystem.

## Remaining production integrations

The codebase now provides the local vertical slice and catalog reference service. Before an organization-wide rollout, implement company SSO, catalog reconciliation/webhooks, KMS-backed envelope keys, retention policy, tenant isolation, deployment manifests, observability, and golden-corpus evaluations. These are integration and operations projects; they should not be hidden inside language packs or delegated to unconstrained model inference.
