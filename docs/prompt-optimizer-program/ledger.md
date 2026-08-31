# Decision and evidence ledger

Append consequential decisions and evidence. Supersede entries explicitly; do not rewrite history or record routine activity.

### DWI-PO-0001 — Phase 2 contract frozen

- Date: 2026-08-31
- Type: decision
- Status: accepted
- Context: Phase 1 is user-verified complete on `701ae90f4bdd014086c6cdefcb08ed171abcf8c9`; the exact Verify DWI run is successful.
- Decision or finding: Freeze Phase 2 scope to the deterministic Input → Resolve → Review vertical slice on the existing isolated branch. User-visible work and canonical HTML changes require explicit manual approval.
- Consequence: Non-UI state/protocol/host work may proceed; no webview or HTML implementation may begin before the manual gate.
- Evidence: Clean branch `feature/po-01-phase2-isolated`; Verify DWI run `33343310712`, success, exact SHA `701ae90f4bdd014086c6cdefcb08ed171abcf8c9`.
- Supersedes: None.
- Owner: Codex

### DWI-PO-0002 — Correct UI gate ordering

- Date: 2026-08-31
- Type: decision
- Status: accepted
- Context: The first Phase 2 handoff requested approval from the unchanged canonical mock while the proposed UI review artifact was not linked from `progress.html`.
- Decision or finding: The required order is proposed UI staged and linked in local `progress.html`, local verification, presentation to the user, explicit user approval, then corresponding product-webview implementation.
- Consequence: `progress.html` becomes the Phase 2 manual-review entry point. The canonical HTML and product webview remain unchanged until approval.
- Evidence: User correction on 2026-08-31 and local `phase-2-ui-review.html`.
- Supersedes: DWI-PO-0001 only where its wording implied approval before creating the local UI review artifact.
- Owner: Codex

### DWI-PO-0003 — Phase 2 UI review artifact verified

- Date: 2026-08-31
- Type: evidence
- Status: accepted
- Context: The corrected UI gate requires the proposed direction to be linked from `progress.html` and verified before approval.
- Decision or finding: `progress.html` links and renders the unchanged canonical workflow beside `phase-2-ui-review.html`; the visible sequence now awaits user approval before product-webview implementation.
- Consequence: The manual gate may be presented. Product UI remains unchanged and unauthorized until explicit approval.
- Evidence: Required-link assertions passed, both target files exist, Quick Look rendered the combined comparison, and `git diff --check` passed.
- Supersedes: None.
- Owner: Codex

### DWI-PO-0004 — Design-ahead HTML and deferred approval

- Date: 2026-08-31
- Type: decision
- Status: accepted
- Context: The user authorized Phase 2 implementation, deferred the visual approval verdict until after Phase 3, and clarified that Prompt Optimizer is a separate activity-bar item.
- Decision or finding: `progress.html` is the visible design-ahead artifact. Approved elements flow from it into the plugin; unapproved future changes remain HTML-only. Phase 2 implements the separate Prompt Optimizer activity-bar item and deterministic Input → Resolve → Review direction without starting Phase 3.
- Consequence: Deferred visual approval does not block Phase 2 engineering verification, but no additional HTML-only direction may silently enter the plugin.
- Evidence: User instruction on 2026-08-31.
- Supersedes: DWI-PO-0002 and DWI-PO-0003 only where they treated immediate visual approval as a Phase 2 implementation prerequisite.
- Owner: Codex

### DWI-PO-0005 — Phase 2 local qualification evidence

- Date: 2026-08-31
- Type: evidence
- Status: accepted
- Context: Phase 2 implementation and local verification completed on the isolated branch worktree.
- Decision or finding: The deterministic three-step slice, legacy-state translation, host-owned identity, provider queue separation, stale commit rejection, and distinct Prompt Optimizer activity-bar navigation satisfy the locally executable Phase 2 contract.
- Consequence: Phase 2 is locally qualified. Closure remains pending exact-review-SHA CI, which requires explicit authority to commit and publish the candidate.
- Evidence: 371 repository tests passed; explicit host/webview typechecks passed; schema unchanged; build and VSIX passed; installed smoke passed; clean absence/uninstall/fresh-install passed; VSIX SHA-256 `901479ddb6e36e66f7ea01b0a42c434964c00afa03c642e27662412ec4fbb937`.
- Supersedes: None.
- Owner: Codex

### DWI-PO-0006 — Lift Phase 2 UI manual gate

- Date: 2026-08-31
- Type: decision
- Status: accepted
- Context: The user replaced the prior Phase 2 UI approval requirement with a code/objective-first completion instruction.
- Decision or finding: The UI-based manual gate is lifted for Phase 2. Preserve the canonical HTML/progress artifact and local records, continue only on the existing isolated branch, and complete the code with practical quality, safety, correctness, and coverage.
- Consequence: No UI approval item blocks Phase 2. Exact-SHA CI still requires separate authority to publish the review branch.
- Evidence: User instruction on 2026-08-31.
- Supersedes: DWI-PO-0002, DWI-PO-0003, and DWI-PO-0004 only where they impose or defer a Phase 2 manual approval gate.
- Owner: Codex

### DWI-PO-0007 — Lift UI manual gates through Phase 7

- Date: 2026-08-31
- Type: decision
- Status: accepted
- Context: The user extended the UI-gate instruction beyond Phase 2.
- Decision or finding: UI-based manual gates are lifted for all remaining work through Phase 7. Canonical HTML/progress artifacts and local program records remain preserved; quality, correctness, safety, test, provider, exact-SHA, phase-scope, and promotion controls remain binding.
- Consequence: UI approval does not block later work, but it does not authorize provider transmission, branch publication, merge, tag, release, Phase 3 activation, or other external actions by itself.
- Evidence: User instruction on 2026-08-31.
- Supersedes: All prior ledger requirements for a UI-based manual approval gate through Phase 7.
- Owner: Codex

### DWI-PO-0008 — Phase 2 review commit frozen locally

- Date: 2026-08-31
- Type: evidence
- Status: accepted
- Context: The Phase 2 code candidate was committed while all program records remained local-only.
- Decision or finding: Review SHA `9b2f8fe2d2e15c0b87d81eb72fb2f99c802cb91c` contains only the eight Phase 2 code/test files. The exact commit passed the full 371-test repository suite. No Verify DWI run exists because the branch has not been published.
- Consequence: Local qualification is complete; exact-SHA CI remains the sole Phase 2 closure gate.
- Evidence: Local commit, clean tracked worktree, untracked `docs/prompt-optimizer-program/`, successful `pnpm test`, and empty GitHub run query for the exact SHA.
- Supersedes: None.
- Owner: Codex

### DWI-PO-0009 — Phase 2 local closure with external CI excluded

- Date: 2026-08-31
- Type: decision
- Status: accepted
- Context: The user authorized Phase 3 but prohibited push, publish, remote mutation, and external CI.
- Decision or finding: Close Phase 2 as complete locally on exact review SHA `9b2f8fe2d2e15c0b87d81eb72fb2f99c802cb91c`. External Verify DWI CI is intentionally excluded from this local-only closure; no external verification claim is made.
- Consequence: The locally executable Phase 2 gates permit the authorized Phase 3 transition. Remote verification remains neither run nor implied.
- Evidence: Exact local commit; 371 tests; typechecks; unchanged schema; build and VSIX; packaged activation; clean uninstall/absence/fresh-install evidence.
- Supersedes: DWI-PO-0008 only where it treated external CI as a mandatory blocker despite the later explicit local-only instruction.
- Owner: Codex

### DWI-PO-0010 — Phase 3 contract frozen on existing branch

- Date: 2026-08-31
- Type: decision
- Status: accepted
- Context: The user explicitly authorized Phase 3 locally and required reuse of the existing isolated branch without creating another branch.
- Decision or finding: Activate the frozen Phase 3 source-planning contract on `feature/po-01-phase2-isolated`, starting at `9b2f8fe2d2e15c0b87d81eb72fb2f99c802cb91c`. The same-branch requirement is an explicit override of the program's default one-branch-per-phase topology.
- Consequence: Phase 3 implementation may proceed locally. Phase 4, provider transmission, branch publication, and all remote actions remain closed.
- Evidence: User instruction and verified clean tracked state with only preserved local program records untracked.
- Supersedes: Prior records stating Phase 3 was unauthorized; execution-contract branch topology only for this explicitly directed transition.
- Owner: Codex

### DWI-PO-0011 — Phase 3 local candidate blocked on installed activation smoke

- Date: 2026-08-31
- Type: evidence
- Status: blocked
- Context: Phase 3 code, tests, build, package, and independent reinstall checks completed locally.
- Decision or finding: Exact local candidate `2e24151fff2a6b8836e79a96dc83205aa6870809` is not Phase 3 complete because `pnpm verify:extension` did not reach its activation/open assertions in three isolated VS Code 1.134 attempts. Installation succeeded, DWI activation began, then the extension host terminated and the VS Code process hung. No DWI exception was logged.
- Consequence: Freeze the local candidate and evidence, keep Phase 4 closed, and do not claim the installed functional gate passed.
- Evidence: 376 repository tests; typechecks; unchanged schema; build; VSIX SHA-256 `d3b4a72546211a3d426377a0b302ebc11663a305687681ff8f10c69090ceebed`; clean reinstall pass; three failed activation-smoke attempts and local VS Code logs.
- Supersedes: None.
- Owner: Codex

### DWI-PO-0012 — Phase 3 local completion

- Date: 2026-08-31
- Type: evidence
- Status: accepted
- Context: The user corrected the local VS Code configuration and requested the blocked installed-extension gate be checked again.
- Decision or finding: `pnpm verify:extension` passed on exact local candidate `2e24151fff2a6b8836e79a96dc83205aa6870809`. VSIX install, DWI activation, `dwi.open`, clean extension-host exit, and the final smoke marker all succeeded.
- Consequence: The sole Phase 3 blocker is cleared and Phase 3 is complete locally. Phase 4 remains closed pending separate authorization.
- Evidence: `DWI_SMOKE_INSTALL_OK`, `DWI_SMOKE_ACTIVATED`, `DWI_SMOKE_OPEN_OK`, exit code 0, and `DWI_SMOKE_EXTENSION_HOST_OK`; prior 376-test exact-commit suite and package evidence remain current.
- Supersedes: DWI-PO-0011 as the current phase state; its failed-attempt evidence remains historical.
- Owner: Codex

### DWI-PO-0013 — Phase 4 contract frozen locally

- Date: 2026-08-31
- Type: decision
- Status: accepted
- Context: The user authorized continuation into Phase 4 after exact-candidate Phase 3 local completion.
- Decision or finding: Activate the bounded structured semantic-execution contract on the existing branch at `2e24151fff2a6b8836e79a96dc83205aa6870809`. Proceed locally with one-call V2 patch validation, deterministic compilation, fallback evidence, and simulator qualification.
- Consequence: Local implementation and verification may proceed. Real-provider transmission remains closed until endpoint/model, input classes, retention exposure, maximum calls, and cost cap are explicitly approved. Phase 5 remains closed.
- Evidence: User instruction and verified branch/working-tree state with only preserved local records untracked.
- Supersedes: Prior records stating Phase 4 was unauthorized; existing-branch reuse remains the explicit topology override.
- Owner: Codex

### DWI-PO-0014 — Same-call engineering token-cost projection

- Date: 2026-08-31
- Type: decision
- Status: accepted
- Context: The user resolved the Phase 4 call-policy ambiguity and supplied the required projection contract.
- Decision or finding: Extend the existing one explicit semantic enhancement call so its validated response contains both the bounded semantic patch and an end-to-end engineering token-cost projection. Projection computation may use only consented metadata already supplied for the explicit enhancement action and must not create an estimate-only transmission or second call. Available runtime call telemetry reconciles the same estimation ID.
- Consequence: Add strict domain validation, host/webview transport, estimate labeling, component totals, optional supplied-price cost, assumptions, metadata-used labels, uncertainty/confidence, routing disclosure, rationale, and reconciliation tests. Real-provider calibration remains separately gated.
- Evidence: User specification on 2026-08-31.
- Supersedes: DWI-PO-0013 only where its response contract contained a semantic patch without a projection.
- Owner: Codex

### DWI-PO-0015 — Phase 4 local implementation and package qualification

- Date: 2026-08-31
- Type: evidence
- Status: blocked
- Context: The one-call semantic path, engineering projection amendment, UI corrections, and local package gates completed without provider transmission or a review commit.
- Decision or finding: Local deterministic, simulator, protocol, host, webview, build, VSIX, activation/open, and clean reinstall evidence passes. Phase 4 cannot close because real-provider compatibility and held-out fixed-executor quality are absent, and the no-commit instruction prevents an exact review SHA.
- Consequence: Preserve the uncommitted candidate and local records, keep Phase 5 closed, and request only the missing provider disclosure and commit authority if the user wants Phase 4 closure.
- Evidence: 396 tests; explicit typechecks; unchanged schema; final VSIX 676,707 bytes with SHA-256 `7d8fddc52acc65fe2fc8c4a7548c3e0dc0ce09c0e1ad84fb149c126ef728d8f0`; installed smoke and clean reinstall markers passed; no external action occurred.
- Supersedes: None.
- Owner: Codex

### DWI-PO-0016 — Native activity-item correction and final local requalification

- Date: 2026-08-31
- Type: correction and evidence
- Status: accepted
- Context: Final scope review proved that prior Phase 2 wording had conflated Prompt Optimizer's internal webview rail with a separate native VS Code activity-bar contribution.
- Decision or finding: Preserve the historical Phase 2 decision but correct its implementation claim. The current Phase 4 candidate contributes `dwi-prompt-optimizer-sidebar`, `dwi-prompt-optimizer-view`, `dwi.openPromptOptimizer`, and a dedicated icon; the view bootstraps directly into Prompt Optimizer while the DWI item continues to open Home.
- Consequence: Current product and progress evidence now satisfy the explicit native activity-item requirement. Phase 4 remains blocked only on held-out fixed-executor evidence, explicitly approved real-provider calibration, and an exact review commit/SHA.
- Evidence: Material correction message `from_dwi_to_program_record_20260831T041222Z`; 66 focused domain tests, 24 focused host tests, 6 focused webview tests, 399 full-suite tests, all typechecks, unchanged schema, build/package, installed Home and Prompt Optimizer open markers, clean reinstall, and final VSIX 677,541 bytes with SHA-256 `462eff0a5cef21daf7014c099ea77ea70f1b7ab03b484ef7d7469e769b82c0ca`.
- Supersedes: DWI-PO-0005 only where it claimed the Phase 2 candidate already contained a native distinct activity-bar item; DWI-PO-0015 only as the current package/test/hash evidence.
- Owner: Codex

### DWI-PO-0017 — Projection provenance hardening and final local candidate

- Date: 2026-08-31
- Type: evidence
- Status: accepted
- Context: Final code review found that provider-authored actual-route fields could survive when transport observations were incomplete, aggregate estimation context lacked a runtime serialization boundary, and negative deltas could be mislabeled as savings.
- Decision or finding: Actual routing now comes only from host-observed transport metadata; aggregate estimation context is exact-key, bounded, duplicate-free, and secret-rejecting before any provider call; invalid token telemetry fails closed; Review labels savings, additions, and zero change correctly and handles partial actual routes without displaying undefined values.
- Consequence: DWI's final uncommitted Phase 4 candidate preserves routing provenance and metadata minimization while retaining deterministic fallback. The three terminal blockers remain unchanged.
- Evidence: 69 focused domain tests, 24 focused host tests, 6 focused webview tests, 402 full-suite tests, all six package typechecks, unchanged schema/canonical HTML, build/package, exact installed Home and Prompt Optimizer smoke, clean reinstall, and final VSIX 678,514 bytes with SHA-256 `88e6a4ee662d65dfecab6fc5d52ce9c517e17d2e9a072e74f872e7aa112e28de`.
- Supersedes: DWI-PO-0016 only as the current package/test/hash evidence.
- Owner: Codex

### DWI-PO-0018 — Phase 4 exact local review SHA qualified

- Date: 2026-08-31
- Type: authorization and evidence
- Status: accepted
- Context: The user explicitly authorized one local functional Phase 4 commit while excluding every program record.
- Decision or finding: Commit `ff0bbea30b2e502bc3c5b9287da003994fc13ce0` freezes only 27 functional source, test, manifest, and icon paths. `docs/prompt-optimizer-program/**` remains untracked and outside the commit. The exact SHA passed the full local repository, typecheck, schema, build/package, installed-smoke, and independent clean-reinstall gates.
- Consequence: The exact-review-SHA acceptance item is complete. Phase 4 now has 14 of 18 checklist rows checked and remains blocked only by the duplicated fixed-executor and real-provider rows.
- Evidence: 402 tests; six package typechecks; unchanged schema; clean tracked tree; VSIX 678,514 bytes with SHA-256 `3f02d15972a2feae339365bb8ccc415b89ace941e03b19c6173c227a722ad6f3`; `DWI_SMOKE_OPEN_OK`; `DWI_SMOKE_PROMPT_OPTIMIZER_OPEN_OK`; `DWI_SMOKE_EXTENSION_HOST_OK`; `DWI_CLEAN_REINSTALL_OK`.
- Supersedes: DWI-PO-0017 only as the current exact-candidate package/test/hash evidence and DWI-PO-0015 where commit authority was a blocker.
- Owner: Codex

### DWI-PO-0019 — Evaluation and calibration authorization remains unbound

- Date: 2026-08-31
- Type: authorization boundary
- Status: blocked
- Context: The user tentatively approved provision or approval of the held-out evaluation contract and granted approval in principle for a real-provider calibration disclosure.
- Decision or finding: No local artifact or message binds a held-out corpus version, fixed-executor configuration, scoring metrics and thresholds, run ceiling, cost ceiling, or the complete calibration values for endpoint/model, permitted synthetic input classes, retention/exposure, maximum calls, and cost cap.
- Consequence: Record the authorization intent but do not invent evaluation thresholds, transmit synthetic inputs, or incur provider cost. The fixed-executor and real-provider gates remain pending until concrete bounded values are frozen.
- Evidence: Repository/program-record search after exact-SHA qualification; model-host communication supplies only a proposed loopback endpoint/model/reasoning lane and explicitly leaves synthetic input, retention, calls, and cost to DWI.
- Supersedes: Prior wording that described approval itself as wholly absent; execution remains blocked because the disclosure is incomplete.
- Owner: Codex

### DWI-PO-0020 — Phase 4 current runtime re-verification blocked by environment

- Date: 2026-08-31
- Type: verification finding
- Status: blocked
- Context: The Phase 4 review SHA was already frozen. The stop-condition review required a fresh local verification pass without provider, remote, or Phase 5 work.
- Decision or finding: Host/webview tests, all package typechecks, schema stability, build, VSIX packaging, archive inspection, and diff checks passed. The root suite's unrelated catalog HTTP tests failed because this sandbox denied `127.0.0.1` bind (`listen EPERM`). Two bounded packaged-smoke attempts installed the VSIX but aborted before activation/open with `SIGABRT` after Electron `task_name_for_pid` / codesign failure; no DWI-specific exception was observed.
- Consequence: Phase 4 remains blocked. Do not characterize historical exact-candidate runtime evidence as a fresh pass, do not alter product code to work around the environment, and do not begin Phase 5. `P4-W001` contains the required owner-signed recovery path.
- Evidence: current `pnpm test` partial pass (domain/workspace/core) and catalog bind failure; host 154 and webview 31 tests passed; six typechecks, schema, build, VSIX, and `git diff --check` passed; two `pnpm verify:extension` failures. Current VSIX SHA-256 `236697515eed0b8f0a4249468b6a67c95a069f04db84573fb2fa0293640a9063`.
- Supersedes: None. It supplements, rather than erases, the historical exact-candidate evidence in DWI-PO-0018.
- Owner: Codex local session

### DWI-PO-0021 — Phase 4 evaluation and calibration contract frozen

- Date: 2026-08-31
- Type: authorization and decision
- Status: accepted
- Context: The user replaced the previously unbound approval with concrete calibration and fixed-evaluation bounds, asked the agent to choose what objectively enhances the product, and explicitly rejected speed as the deciding criterion.
- Decision or finding: Freeze contract `dwi-po-phase4-evaluation-2026-08-31-v1` (SHA-256 `c8dbded44e96933bf28c92d534831136445e5b0814ded115fcb8dcff27a8272b`) and corpus `dwi-po-phase4-heldout-2026-08-31-v1` (SHA-256 `ca88bfbad8b018e6898024df61ca3b0d221c55b8094722fb6597094763df4aa7`). Calibration permits only one wholly synthetic task and aggregate synthetic metadata through one readiness plus one production semantic request, with no retries, 20,000 reported tokens, and a $0.50 ceiling. Fixed evaluation uses ten synthetic A/B/C cases, 30 fixed-executor runs, at most eight product semantic calls, no retries, 120,000 reported tokens, and a $10 ceiling. The model-host route is pinned by commit, dirty-state digest, and executable file hashes. Actual monetary cost remains unavailable without validated pricing or billing telemetry.
- Consequence: DWI may now construct and dry-validate the local-only harness and then make exactly one bounded calibration/evaluation attempt. Thresholds are immutable after the first live request. Passing requires strict production response validation, zero safety/privacy regressions, C non-inferiority, and an objective quality or efficiency gain; Phase 5 remains closed regardless.
- Evidence: User instruction; `/Users/vk/Projects/sub/docs/prompt-optimizer-program/evals/phase-4-evaluation-contract.json`; corpus validation of 10 unique cases, 8 semantic cases, 2 local-fallback cases, and all regular expressions.
- Supersedes: DWI-PO-0019 as the current authorization boundary; DWI-PO-0020 remains valid for its separate environment findings.
- Owner: Codex local session

### DWI-PO-0022 — Phase 4 evaluation harness dry qualification

- Date: 2026-08-31
- Type: verification evidence
- Status: accepted
- Context: The live evidence contract was frozen, but the no-retry policy required proof that the local harness could exercise production contracts without accidentally making a provider request.
- Decision or finding: The local harness and six focused evaluator tests pass. Its zero-network dry run imports the exact built Phase 4 production modules, validates all model-host pins, proves A/B byte identity for all ten low/medium/high cases, exercises eight production orchestration calls through a deterministic fake provider, preserves two no-egress fallback cases, constructs 30 strict downstream requests, and makes zero live requests.
- Consequence: The single authorized live attempt may begin only after the exact contract hash, current branch/SHA, tracked cleanliness, model-host verification, and local product checks remain valid. The live lock prevents an accidental second attempt.
- Evidence: `/Users/vk/Projects/sub/docs/prompt-optimizer-program/evals/runs/dry-run-2026-08-31T05-19-14-629Z/summary.json` SHA-256 `8217237ad339ac6c8eaebc5f691deb5c56d4023caf19a477efedddd5c084cd15`; `DWI_PHASE4_DRY_RUN_OK`; six of six evaluator tests.
- Supersedes: None.
- Owner: Codex local session

### DWI-PO-0023 — Phase 4 no-retry calibration failed closed on token ceiling

- Date: 2026-08-31
- Type: verification finding
- Status: blocked
- Context: All exact-candidate product gates, model-host tests, evaluator tests, and zero-network dry checks passed, so the single authorized live attempt began under immutable DWI-PO-0021 thresholds.
- Decision or finding: The readiness request reached the configured endpoint and returned HTTP 200 in 5,634 ms, but reported 14,526 input and 5 output tokens. The 14,531 total exceeded the frozen 12,000 per-completion ceiling. The budget rejected the response, the production helper surfaced its generic connectivity fallback, and the harness stopped before the semantic calibration request. No held-out corpus input was transmitted; optimizer calls were 0 of 8 and fixed-executor runs were 0 of 30. No retry occurred, and actual monetary cost is unavailable.
- Consequence: Basic endpoint response is observed, but production semantic-plus-projection compatibility and held-out quality remain unqualified. Phase 4 is blocked. Preserve the failed live lock and evidence; do not retry or change thresholds without explicit authorization for a superseding contract. Phase 5 remains closed.
- Evidence: `/Users/vk/Projects/sub/docs/prompt-optimizer-program/evals/runs/live-2026-08-31T05-20-02-991Z/summary.json` SHA-256 `45e992b535a54ac407de2767ee31f0b19142b54a50aaa33ab76a8e2de6639d34`; raw synthetic evidence SHA-256 `bfbdf60d3619a40fc4b65469887706b8e3b95bdb82235a79c54c8ba137c42cca`; independent review SHA-256 `1412683286e7c55c024075cd0280f83207bb672f452e264ec957cd72aea9ef17`; content-free proxy observation; stopped loopback listener.
- Supersedes: DWI-PO-0021 only as the current execution state; its frozen contract and no-retry boundary remain controlling evidence.
- Owner: Codex local session

### DWI-PO-0024 — Archived blocked transition into local Phase 5

- Date: 2026-08-31
- Type: authorization boundary and decision
- Status: accepted
- Context: Phase 4 remained blocked after its immutable no-retry readiness response exceeded the frozen per-completion token ceiling. The user directed the program to preserve a compact repository checkpoint, document what approval would otherwise have been missing, and carry work forward to the next pending item when approval is not received.
- Decision or finding: Preserve Phase 4 as blocked and unqualified, archive exact functional SHA `ff0bbea30b2e502bc3c5b9287da003994fc13ce0` plus local program/evaluation records, and treat the instruction as explicit acceptance of a local reversible blocked transition into Phase 5. Create `feature/po-05-product-hardening` at that SHA and freeze the Phase 5 contract.
- Consequence: Local Phase 5 work may proceed. Silence is not authorization for provider/fixed-executor transmission, spending, credentials, remote mutation, Phase 4 retry/threshold changes, evidence deletion, safety/privacy waiver, promotion, merge, or tag. At a hard boundary, leave that item pending and continue only with an independent local/reversible item.
- Evidence: `docs/prompt-optimizer-program/archives/2026-08-31-phase-4-blocked-transition/checkpoint.md`; verified bundle and program-record archive; `SHA256SUMS`; user instruction on 2026-08-31.
- Supersedes: Prior records only where they stated Phase 5 lacked transition authorization. It does not supersede DWI-PO-0023 or Phase 4 failure evidence.
- Owner: Codex local session

### DWI-PO-0025 — Versioned optimizer-session store first slice

- Date: 2026-09-01
- Type: implementation evidence
- Status: accepted
- Context: Phase 5 required a bounded extension-managed optimizer-session authority without risking initialized project knowledge or silently promoting dormant V2 persistence types into claimed live behavior.
- Decision or finding: Add `dwi.promptOptimizer.sessions.v1`, keyed by the existing 24-hex `localFingerprint`, with an exact versioned envelope, maximum 50 sessions, maximum 256 KiB per session, maximum five recents, optimistic revisions, safe unknown/corrupt outcomes, and workspace-scoped reset. Prefer the new store for view/recents reads and mirror current writes into it, while retaining existing workspace snapshot, view, and recents storage as downgrade-compatible fallback.
- Consequence: Phase 5 has a tested durable-session foundation, but consolidation is not complete until legacy migration, downgrade, corruption, and optimizer-only UI reset flows are proven. No existing reader or initialization state was deleted. No provider, fixed-executor, credential, remote, or promotion action occurred.
- Evidence: 160 host tests including six new store cases; 408 repository tests total; all six package typechecks; `git diff --check`.
- Supersedes: None.
- Owner: Codex local session

### DWI-PO-0026 — Phase 5 local candidate blocked on installed functional flow

- Date: 2026-09-01
- Type: implementation and verification evidence
- Status: blocked
- Context: The versioned optimizer-session foundation was extended through migration, full recovery hydration, project-dependency invalidation, and an explicit optimizer-only reset that retains initialized project knowledge.
- Decision or finding: The locally executable candidate satisfies the Phase 5 storage, migration, isolation, corruption, size, reset, accessibility, no-egress, deterministic-fallback, repository, build, package, activation/open, and clean-reinstall gates. Final review corrected stale recovery after project refresh/review/brief changes. Phase 5 does not close because the installed harness cannot drive the required packaged restart/resume/reset journey and no exact local review commit is authorized.
- Consequence: Freeze the uncommitted candidate and evidence. Do not substitute unit/webview tests for the packaged functional journey, do not commit without separate authority, and do not enter Phase 6. Phase 4 remains blocked and unchanged.
- Evidence: 412 tests; six typechecks; unchanged schema; build; VSIX 387 files / 682,600 bytes / SHA-256 `ccbd1966e0ce109b6431cc66c44fbb1dfb394f268facfcfb3e79a5f865904ac9`; installed activation/open smoke; clean reinstall; `git diff --check`; `phases/phase-5-outcome.md`.
- Supersedes: DWI-PO-0025 only as the current Phase 5 implementation/verification state.
- Owner: Codex local session

### DWI-PO-0027 — Deterministic authority; learned mechanisms deferred

- Date: 2026-09-01
- Type: product-direction decision and deferred experiment record
- Status: accepted
- Context: The user selected the most reliable deterministic mechanism for the current production path and asked that possible learned approaches remain visible for later reconsideration without complicating or destabilizing the present program.
- Decision or finding: Deterministic source attention, bounded context allocation, authority ordering, compilation, validation, and phase enforcement remain authoritative on the route to the standalone baseline and the existing targeted Phase 7. Do not introduce learned models, tiny local models, Cactus/Needle-style components, Karpathy-style autoresearch, adaptive self-training, or comparable learned control into the current product path. These approaches are postponed, not rejected.
- Rationale: Current deterministic behavior is inspectable, reproducible, consent-bound, recoverable, and compatible with immutable safety and phase evidence. A learned control path would add training data, drift, reproducibility, privacy, resource, rollback, and evaluation burdens before the standalone baseline is qualified.
- Deferred alternatives: learned source ranking or attention; tiny on-device/local advisory models; Cactus/Needle-style memory or retrieval; autoresearch loops; adaptive self-training; cross-session semantic learning; learned routing, caches, or adjudication. Naming an alternative here does not approve implementation or data collection.
- Revisit triggers: the exact `dwi-standalone-optimizer-v1-baseline` tag exists; a stable deterministic corpus exposes a measured, decision-relevant limitation that deterministic refinement cannot economically solve; privacy/resource constraints and rollback are known; and the user separately authorizes one bounded experiment.
- Required evidence before reconsideration: preregistered hypothesis and advisory-only scope; exact baseline tag/SHA; versioned tuning and held-out corpora; deterministic A/B comparator; primary metric and meaningful-effect threshold; maximum token/cost/latency/resource regression; training/input provenance and retention disclosure; privacy and no-egress proof; drift/reproducibility tests; failure and rollback behavior; and zero authority over immutable approvals, spending, safety, consent, or phase gates.
- Consequence: Keep deterministic attention/context allocation as the sole current authority. A future learned component may propose bounded advisory signals only through an explicit seam whose output is validated, explainable, ignorable, and reversible under deterministic policy. Phase 4 and Phase 5 remain blocked as recorded; Phase 6 and Phase 7 remain closed. This decision neither waives gates nor starts an experiment.
- DxDX reconciliation: No `DxDX` folder/project or unmistakable Developer Experience meta-layer location exists in the current DWI checkout, so no secondary note was invented. Reconcile this decision with such a project only if a real location and its convention later exist.
- Evidence: User direction on 2026-09-01; current `operation-policy.md`; current Phase 4/5 blockers; Phase 7 entry criteria in the optimizer execution gates.
- Supersedes: None.
- Owner: Codex local session

### DWI-PO-0028 — Independent Phase 5 reset and byte-bound findings corrected

- Date: 2026-09-01
- Type: independent-review correction and verification evidence
- Status: accepted correction; phase remains blocked
- Context: Independent review of the uncommitted Phase 5 candidate found that optimizer-only reset could accept an unreviewed or changed project brief and promote it into Compose, and that the documented 256 KiB session cap counted JavaScript string code units rather than serialized UTF-8 bytes.
- Decision or finding: Reuse the existing exact approved-review and confirmed-compilable-brief predicate as host authority, make snapshot reset reject ineligible state, expose the webview control only for the corresponding ready state, and measure session/envelope JSON through safe UTF-8 serialization. Preserve corrupt/newer refusal and all existing project knowledge.
- Consequence: The two prior overclaims are corrected rather than erased. Regression coverage now includes unreviewed, changed-after-review, unconfirmed, and approved reset states plus exact/over ASCII byte boundaries, multibyte Unicode, and serialization failure. Phase 5 remains blocked on the user-only installed functional journey and exact review SHA; Phase 4 remains blocked and Phase 6/7 remain closed.
- Evidence: 416 repository tests; all six package typechecks; unchanged schema; build and VSIX packaging; archive integrity/content inspection; isolated VS Code 1.134.0 activation/Home/Prompt Optimizer smoke; standard VS Code 1.135.0 uninstall/install, exact installed runtime-file hashes, activation, Home open, and Prompt Optimizer open; corrected VSIX 387 files / 683,017 bytes / SHA-256 `7f9acd71af8b21fb2644a1b1382d9d0e6aa794aa9ce30e0c131367b84538349b`.
- Supersedes: DWI-PO-0026 only where it claimed the reset and size-bound discrepancies were already fully satisfied; its phase blockers and other evidence remain current.
- Owner: Codex local session

### DWI-PO-0029 — Prompt Optimizer route retained across workspace lifecycle

- Date: 2026-09-01
- Type: installed-defect correction and verification evidence
- Status: accepted correction; phase remains blocked
- Context: The Home and Prompt Optimizer native views share one webview application. Installed use showed that automatic brief-confirmed and workspace-root lifecycle messages could route an already-active Prompt Optimizer surface to Home during or around a rewrite.
- Decision or finding: Preserve an already-active optimizer for those automatic lifecycle messages, and explicitly select the optimizer at rewrite dispatch and pending. Explicit user Home navigation and initialization gates remain unchanged. The task draft remains intact; authoritative project changes may still invalidate derived candidate/review state.
- Consequence: Prompt Optimizer now remains active through dispatch, pending, success, fallback, and actionable error outcomes even when workspace lifecycle messages interleave. This does not authorize a provider retry, waive project review, or satisfy the packaged restart/resume/reset journey.
- Evidence: Focused 31-test webview suite and full 416-test repository suite; six typechecks; unchanged schema; `git diff --check`; 387-file VSIX, 683,053 bytes, SHA-256 `a2d93c51e30ca42666f5cf3374a69a7f1a51218b21bb0c02ea9f6f868b7dea0e`; isolated VS Code install/activation/Home/Prompt Optimizer/clean-exit smoke; standard install identity `dwi-poc.developer-work-intelligence@0.1.0` with byte-identical webview bundle. One authorized desktop Rewrite click was stopped by the current-project review gate before provider dispatch and was not retried. Final nested-webview activation through macOS accessibility failed with `elementHasNoFrame`, so no standard-window functional-flow pass is claimed.
- Supersedes: DWI-PO-0028 only as the current Phase 5 local candidate evidence; its reset/byte-bound findings and all phase blockers remain valid.
- Owner: Codex local session

### DWI-PO-0030 — Project Meta Context convergence and adversarial authority repairs

- Date: 2026-09-01
- Type: implementation, qualification, and independent-review correction
- Status: accepted local correction; Phase 5 remains incomplete
- Context: The user authorized a coherent local POC, atomic local commits, and broad local Phase 6 evidence while preserving provider, remote, merge, tag, and promotion boundaries.
- Decision or finding: Rename the visible module to Project Meta Context; preserve the optimizer draft and exact Input/Resolve/Review return target through the real `brief.ready` stale-context sequence; invalidate context-bound output only; ignore mismatched session/snapshot recovery; remove stale session authority after failed writes where safe; clear the workspace snapshot before compatibility stores during reset; and add reset focus entry, Escape, and focus restoration.
- Independent review: Six findings were reported. The stale-context sequence, competing stale authority, reset remigration order, and reset keyboard recovery were corrected with regression coverage. Global recents duplication and the packaged functional restart/resume/reset journey remain open and prevent Phase 5 completion. Stale evidence claims were corrected here rather than erased.
- Evidence: commits `25d11b3`, `79a0510`, `c2c3a7b`; 417 repository tests; six package typechecks; unchanged schema; responsive browser checks at 320x640, 640x360, and 160x320 with no horizontal overflow or console errors; 16 proxy syntax checks and 20 deterministic model-host tests plus recovered simulator scenarios; VSIX 387 files / 683,661 bytes / SHA-256 `020e69d12a0ede9782b09809ae200bfac0985848140579538f843a557b98bc7a`; VS Code 1.134.0 install/activation/Home/Prompt Optimizer/clean-exit smoke.
- Consequence: Phase 5 is not complete and Phase 6 qualification is not complete. No provider/fixed-executor call, credential use, push, merge, tag, release, or promotion occurred.
- Owner: Codex local session
