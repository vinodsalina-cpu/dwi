# Active exact-tree recovery contract

Status: frozen 2026-09-03 under DWI-PO-0036. Do not silently change acceptance after corrective development begins. Within existing authority, any necessary amendment must be dated and ledgered; provider transmission, credentials, cost, safety/privacy changes, merge, tag, release, or administration still require separate approval.

## Identity

- Program: DWI / Prompt Optimizer exact-tree recovery and requalification
- Branch: `recovery/exact-tree-requalification-2026-09-03`
- Base: `origin/main@f1c69f8d713a32af0ef011946ec0a3bad28d8120`
- Product source: `5088dbf6e5fdeea2415b991c429de8e5229d7a7b`
- Effort: E4 — package, installed runtime, persistence, portability, evidence, and CI interact
- Owner: Recovery Lead; one writer for active records and integrated changes

## Objective

Replace inaccessible machine-local qualification evidence with a reproducible exact-tree and exact-package result, fix only observed product or harness defects, and leave one portable entry point that another agent can execute from a fresh clone without chat history or machine-local paths.

## In scope

- Exact ref, tag, worktree, CI, document, package, state-store, fixture, and evidence inventory.
- Pinned Node `24.18.0` and pnpm `11.17.0`, including proof that package-script child processes resolve those binaries.
- Disposable exact-SHA fresh clone; frozen install; six package typechecks; 421-test baseline or explained new count; schema no-drift; build; VSIX; archive; public hygiene; `git diff --check`.
- CI correction so fresh-clone replay checks out the triggering SHA rather than moving `main`.
- Exact installed VSIX absence/install/discovery/activation/open, uninitialized and initialized flows, deterministic Input → Resolve → Review, save, reset, uninstall/reinstall, accessibility, focus, and clipboard checks.
- Explicit installed semantic success and failure through an out-of-process loopback OpenAI-compatible server using the production transport contract and no real credential.
- OS-neutral three-process same-profile restoration/reset proof, separately reported from production-native consent UI.
- VS Code `1.134.0` verification and separate `1.125.0` minimum-compatibility row.
- Smallest evidence-driven product/test-harness corrections, followed by affected and full clean-candidate reruns.
- Independent GPT-5.6 Sol/max adversarial review, exact-SHA CI, atomic commits, and normal push of this dedicated branch.

## Non-goals

- No real optimizer provider, fixed executor, credentials, prompt/project transmission, spend, Phase 4 retry, or change to its frozen evidence.
- No default-branch mutation, merge, tag, release, deployment, marketplace publication, repository administration, branch deletion, or history rewrite.
- No Platform, PMS, gateway, Atlas, MCP, management analytics, self-training, persistent semantic memory, generic engine extraction, or Goal Optimizer work.
- No broad refactor, dependency upgrade, feature removal, assertion weakening, consent bypass, or relabeling of failed/blocked evidence.
- No deletion of historical documents, old branches, the temporary walkthrough ref, or user data.

## Acceptance

1. Exact source and product SHAs, branch base, refs, tag state, tree state, inherited-claim classifications, toolchain, OS, CI, and missing-evidence boundary are recorded.
2. Active docs are repository-relative and limited to one index, context, contract, progress record, evidence matrix, runbook, and append-only ledger.
3. A true disposable clone at the intended exact SHA proves frozen install and child-process toolchain resolution.
4. Root tests, six package typechecks, schema no-drift, build, VSIX, archive, hygiene, and diff checks pass on the final candidate.
5. VSIX evidence includes identity, exact source SHA, product-source SHA, clean/dirty state, file count, bytes, SHA-256, required/forbidden entries, OS, and VS Code version where used.
6. Installed one-process evidence is labeled accurately: packaged functional execution through the installed directory as extension-development path with the production-fail-closed test confirmation seam; it is not native-consent or cross-process proof.
7. A three-process installed lane proves project/optimizer restoration, optimizer-only reset, second-restart reset persistence, and retained approved project knowledge in one isolated profile.
8. Portable continuity and native macOS consent are separate rows. A non-production confirmation adapter must be explicit, fail closed outside test boundaries, and cannot count as native production consent.
9. Explicit semantic success accepts a valid current bounded hash-bound V2 patch/projection through an out-of-process loopback transport. Malformed/provider/transport failure retains a visibly labeled deterministic fallback without navigation egress. Copy produces exact clipboard output.
10. Absence/install/reinstall, no-workspace/uninitialized behavior, compact layout, keyboard/focus, accessible names, save, reset, and zero-navigation-egress are exercised or individually classified.
11. VS Code `1.125.0` and `1.134.0` are independent compatibility rows; failures are diagnosed before changing the advertised minimum.
12. The CI fresh-clone lane checks out `${GITHUB_SHA}` or an equivalent immutable triggering commit before attribution.
13. The missing DWI-PO-0033, current main/feature reconciliation, storage-location correction, lost-run boundary, and Phase 4 tombstone are durably recorded without rewriting older entries.
14. An independent reviewer who did not author changes checks source, tests, package/SHA binding, consent/privacy, persistence, portability, docs, and false-positive pass risk; actionable findings are fixed and affected gates rerun.
15. The final reviewed commit is pushed on the dedicated branch, exact-SHA CI passes, and `main` remains unchanged.

## Failure behavior

- Preserve first-failure evidence before repair.
- Stop a lane on an invariant breach; never delete behavior, weaken assertions, bypass production consent, raise a frozen threshold, or transfer a pass between SHAs/artifacts.
- Use only `passed`, `failed`, `blocked`, or `not run`; historical evidence remains labeled historical.
- Keep raw prompt/project content, credentials, secrets, and reversible sensitive hashes out of committed evidence.
- A loopback simulator proves only contract/transport/failure behavior. Real-provider and semantic-quality lanes remain blocked.

## Rollback and next duty

Before merge, rollback is abandoning this recovery branch. After any separately authorized merge, use a normal revert and rerun the same package and recovery matrix. Preserve `main`, the pre-vNext tag, `ff0bbea30b2e502bc3c5b9287da003994fc13ce0`, the temporary walkthrough branch, and the Phase 4 tombstone.

After this contract genuinely closes, start a new contract for one material clarification question at a time with answer/skip, document/revision/base-hash binding, deterministic section application, stale-answer invalidation, return position, accessibility, recovery, and no provider egress.
