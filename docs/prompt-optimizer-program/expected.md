# Active phase contract

Status: frozen 2026-08-31 under DWI-PO-0024. Amend only within authorized local scope with a dated reason, consequence, and ledger entry. Provider transmission, cost, credentials, remote action, promotion, or safety/privacy waivers require explicit action-specific authorization.

Amendment 2026-09-01 (DWI-PO-0028): independent review found that optimizer-only reset could promote an unreviewed brief into Compose and that the 256 KiB limit counted JavaScript string code units rather than serialized UTF-8 bytes. The authorized correction narrows enforcement to the existing approved/current/confirmed brief predicate and measures the persisted JSON representation in UTF-8 bytes. Scope and phase gates are unchanged.

Amendment 2026-09-01 (DWI-PO-0029): installed use exposed automatic workspace lifecycle messages that could replace the active Prompt Optimizer surface with Home. The authorized correction keeps explicit user navigation unchanged while making rewrite dispatch/pending and brief/root lifecycle updates preserve an already-active optimizer. Scope, provider budgets, and phase gates are unchanged.

Amendment 2026-09-01 (DWI-PO-0032): the installed runtime restart gate is now exercised by a direct VS Code 1.134.0 process in an isolated portable profile. The verifier drives the production native consent sheets by exact button label, then terminates and relaunches the same installed profile twice to prove session resume, optimizer-only reset, and Project Meta Context preservation. The evidence is local-only; Phase 4 semantic/fixed-executor gates and all remote/provider boundaries are unchanged.

Amendment 2026-09-01 (DWI-PO-0033): the one-icon Activity Bar correction resolves both native views under `dwi-sidebar`. Because both webviews can initialize concurrently, consent capabilities are now one-time and per-webview, and opening a native view rehydrates it from the host-owned workspace state. The restart verifier removes its temporary profile in `finally`, and the corrected VSIX was installed into the authorized main profile without closing VS Code. Scope, provider budgets, and phase gates are unchanged.

Amendment 2026-09-01 (DWI-PO-0034): the final product-identity correction makes Prompt Optimizer the sole contributed Activity Bar container, native view, display name, and visible open command. Home and Project Meta Context remain internal destinations in that webview, and the hidden legacy `dwi.open` command routes to internal Home for compatibility. Step 1 places Assignment/type and Criticality before the prompt editor. Packaging derives its filename from the staged manifest, cleans temporary staging in `finally`, and emits source-commit/hash evidence. Scope, provider budgets, and phase gates are unchanged.

## Identity

- Phase: 5 — product hardening and minimum durable state
- Owner: Codex
- Starting SHA: `ff0bbea30b2e502bc3c5b9287da003994fc13ce0`
- Branch: `feature/po-05-product-hardening`
- Transition: explicitly accepted blocked transition from Phase 4; Phase 4 remains blocked and unqualified
- Delivery mode: local and reversible; no push, pull request, merge, tag, release, external CI, provider/fixed-executor call, or other remote mutation
- Effort: E3 — host/webview persistence, migration, recovery, and installed-runtime behavior

## Objective and observable completion

Finish a recoverable standalone Prompt Optimizer experience while preserving initialization as the consent-based project knowledge prerequisite. Consolidate optimizer-session durability around the revalidated existing workspace fingerprint, expose compact accessible recovery/reset behavior, and prove that restart, corruption, migration, downgrade tolerance, size limits, and workspace isolation cannot destroy initialized project knowledge or the deterministic fallback.

Completion is observable when a packaged extension can initialize/review a project, create a local optimizer session, restart and resume the bounded session, reset optimizer state without deleting initialized project knowledge, reject corrupt/oversized/cross-workspace state safely, and preserve local output through provider failure. Phase 4 semantic qualification remains a separately blocked gate and is not implied.

## In scope

- Revalidate current persistence readers/writers, keys, scopes, limits, and reset paths.
- Consolidate legacy PromptSaved/Recent, V2 persistence, and host workspace snapshot/global recents into one bounded versioned optimizer-session store in extension-managed storage.
- Key project sessions by the revalidated existing workspace fingerprint; keep generic/no-workspace behavior bounded.
- Persist only minimum recovery data and content-free call/evaluation summaries required by current behavior.
- Add additive/tolerant migration and version handling while preserving rollback readers.
- Add restart/resume, optimizer-only reset, corruption, size-limit, partial-write, downgrade-tolerance, and cross-workspace isolation tests.
- Complete compact accessible recovery/provenance controls required by the installed flow.
- Prove navigation remains provider-free and provider failure preserves the deterministic candidate.
- Add phase-specific packaged flow evidence beyond activation-only smoke.

## Non-goals

- No Phase 4 retry, revised evaluation ceiling, semantic qualification, fixed-executor run, or held-out transmission.
- No automatic learning, semantic/final-candidate cache, route cache, cross-session semantic reuse, or generic engine extraction.
- No Platform, gateway, Atlas, PMS, MCP, organization-policy, or sibling-repository dependency.
- No target execution, arbitrary tools, assessment shell/workspace writes, or navigation-triggered egress.
- No push, pull request, merge, tag, release, repository settings, external CI, credential use, or paid/external provider action.
- No deletion or mutation of the Phase 4 lock, evidence, frozen contract, or checkpoint.
- No Phase 6 default switch or promotion work.

## Preserved invariants

- Consent-based initialization, bounded evidence, developer review/correction, and approved project knowledge precede Prompt Optimizer use.
- `.dwi/project.yaml` remains the only checked-in DWI product state; optimizer sessions use extension-managed storage.
- Back, Next, fast-forward, recovery, and reset navigation remain local-only.
- Provider use remains a disclosed explicit action; deterministic compile/recovery do not require provider health.
- The host owns identity, revision, base hash, workspace epoch, networking, and secrets.
- Semantic changes remain validated current hash-bound V2 patches compiled deterministically.
- Optimizer reset cannot delete initialized project knowledge.
- Unknown/corrupt/newer state fails safely without destructive rewrite.

## Subtasks

- [x] Inventory every current persistence seam and reset path.
- [x] Revalidate workspace fingerprint stability and isolation.
- [x] Freeze a versioned session envelope and migration/retention policy with focused tests.
- [x] Implement the bounded extension-managed store and migrations. Existing readers remain as intentional downgrade-compatible mirrors.
- [x] Wire restart/resume and optimizer-only reset through host protocol and webview.
- [x] Complete accessible recovery/provenance controls.
- [x] Prove corruption, limits, partial write, downgrade tolerance, reset preservation, and isolation.
- [x] Prove no recovery/navigation egress and deterministic preservation on provider failure.
- [x] Run focused, repository, typecheck, schema, build, VSIX, archive, and diff gates.
- [x] Run same-process and cross-process installed Phase 5 functional flows plus clean reinstall/activation checks.
- [x] Review the final diff and archive the outcome.
- [x] Create atomic local implementation and evidence commits under the user-authorized local-only delivery mode.

## Acceptance

- [x] One bounded versioned store owns current durable optimizer recovery state; legacy copies remain rollback mirrors rather than read authority.
- [x] Supported older records migrate/read safely; unknown newer/corrupt state is not destructively rewritten.
- [x] Restart restores only the matching workspace and never leaks cross-workspace state.
- [x] Optimizer reset is available only for a current approved project with a confirmed compilable brief, clears optimizer state, and preserves the approved project brief and `.dwi/project.yaml`.
- [x] Enforced count bounds and serialized UTF-8 byte bounds prevent unbounded storage growth.
- [x] Stored call/evaluation summaries are content-free; no credentials or reusable raw project/prompt content enter telemetry/identifiers.
- [x] Local navigation/recovery/reset makes zero provider calls.
- [x] Provider failure preserves and labels the deterministic candidate.
- [x] Recovery/reset controls are keyboard accessible, scoped, and disclose retained state.
- [x] Existing initialization, legacy optimizer, library/template, and deterministic flows remain recoverable.
- [x] Focused and repository-wide verification passes on the final candidate.
- [x] A packaged flow proves initialization/review → local session → restart/resume → reset → initialized-project preservation.
- [x] Final review discrepancies are classified and corrected with regression coverage; independent exact-candidate re-review remains part of the exact-SHA gate.
- [x] Phase 4 remains blocked; Phase 5 is not semantic qualification or promotion readiness.

## Failure behavior

- Missing workspace: use only bounded generic deterministic state; never co-mingle project sessions.
- Fingerprint mismatch: do not hydrate another workspace's session.
- Corrupt/oversized envelope: fail closed, preserve project knowledge and deterministic usability, and avoid destructive overwrite.
- Unknown newer schema: tolerate/ignore safely and leave recoverable data intact.
- Partial write/interrupted migration: recover the last valid bounded record or report recovery unavailable without erasing project state.
- Reset failure: report it and do not claim state was cleared.
- Provider unavailable/stale/cancelled: preserve deterministic candidate and content-free failure summary.
- Stale project review: block semantic progression pending renewed review.

## Verification

- Nearest domain/host/webview tests after each material change.
- Root `pnpm test`; all package typechecks; clean schema export diff.
- `pnpm build`, `pnpm vsix`, archive inspection, and `git diff --check`.
- `pnpm verify:extension` plus a Phase 5-specific isolated installed flow.
- Independent clean absence/install/uninstall/absence/fresh-install.
- Egress assertions use deterministic fakes/simulator only; no real provider or fixed executor.

## Migration and rollback

Migrations are additive and tolerant. Preserve older readers and never rewrite unknown newer or invalid state. Before merge, rollback means abandoning this local branch and restoring `ff0bbea30b2e502bc3c5b9287da003994fc13ce0`; the checkpoint at `docs/prompt-optimizer-program/archives/2026-08-31-phase-4-blocked-transition/` restores Git history and local evidence. After an authorized merge, use a normal revert and rerun storage/recovery qualification; never rewrite shared history.

## Next-phase duty

Phase 6 local POC qualification is complete under the recorded matrix. Phase 5 and Phase 6 cannot waive blocked Phase 4 semantic/fixed-executor gates. Default qualification, merge, and baseline tagging require complete later evidence and explicit authority.

## 2026-09-01 local POC amendment

The user superseded the earlier no-commit/no-Phase-6-local-work limits for this branch by explicitly requiring atomic local commits and a broad local Phase 6 POC matrix. Provider/fixed-executor transmission, credentials, push, merge, tag, release, and promotion remain unauthorized. The packaged functional restart/resume/reset journey and remaining local authority/privacy checks now pass; the recorded Phase 5/6 outcomes are local POC evidence only, not semantic qualification or promotion.
