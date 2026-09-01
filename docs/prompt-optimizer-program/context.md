# Current context

## Repository state

- Repository: `vinodsalina-cpu/dwi`
- Active branch: `feature/po-05-product-hardening`
- Phase 3 predecessor: `2e24151fff2a6b8836e79a96dc83205aa6870809`
- Phase 4 exact local review SHA: `ff0bbea30b2e502bc3c5b9287da003994fc13ce0`
- Independent Phase 6 review baseline: `c8d1723` (`Record local Phase 6 qualification`); later local commits contain evidence corrections and the final one-icon/runtime hardening.
- Current pushed functional checkpoint: `2bafbb649a4ecec6b82e56b0fc1339f194d43a03` on `origin/feature/po-05-product-hardening`; the preserved Phase 4 review SHA remains the rollback boundary.
- Active phase: Phase 5 — POC complete; Phase 6 local POC qualification complete
- Working mode: reversible from exact Phase 4 SHA `ff0bbea30b2e502bc3c5b9287da003994fc13ce0`. Phase 4 remains blocked and unqualified. A clean Step 3 correction may be committed and pushed only to the existing functional-branch upstream. No provider/fixed-executor retry, credential use, other remote mutation, merge, tag, or promotion is authorized.

## Current product path

The initialized and reviewed project brief remains prerequisite to Prompt Optimizer. Input → Resolve → Review keeps navigation provider-free. The explicit LLM action now routes through a host-owned semantic provider port, strict V2 response validation, a current hash-bound bounded patch, and deterministic compilation. Every semantic failure preserves and labels the local candidate.

The current route toward the standalone baseline and the existing targeted Phase 7 uses the most reliable deterministic mechanism. Deterministic attention/context allocation and authority ordering remain the product authority. Learned models, tiny local models, Cactus/Needle-style components, Karpathy-style autoresearch, adaptive self-training, and similar learned mechanisms are postponed—not rejected—and may be reconsidered only as isolated Phase 7 experiments after the baseline tag and all earlier gates genuinely close.

The same explicit call also requires a strict snake_case engineering token-cost projection. DWI normalizes validated projection data for Review, labels it as an estimate rather than billing, itemizes end-to-end planning/context/input/tool/retry/output tokens, exposes uncertainty and routing, reports cost only when validated pricing is supplied, and keeps optimizer-call telemetry distinct from later task-execution reconciliation under the same estimation ID.

Prompt Optimizer is the sole visible product identity, Activity Bar container, native webview, and contributed open command. Home and Project Meta Context remain internal rail destinations in that one webview; the hidden legacy `dwi.open` registration preserves compatibility by selecting internal Home. The sole native open path rehydrates the host-owned session and then selects the requested internal destination.

## Current local evidence

- Focused evidence: 69 domain semantic/projection tests, 24 host transport/activity tests, and 6 webview UI tests passed.
- Fresh full repository suite: 421 passed (104 prompt optimizer + 31 workspace + 66 core + 16 catalog + 172 host + 32 webview); the prior loopback environment failure is resolved.
- Step 3 correction evidence: all six typechecks, unchanged schema, build/VSIX packaging, same-process installed functional flow, and a 360×640 rendered review with no horizontal overflow. The review card uses the surface scroller, the generated prompt remains a bounded inner scroller, required status/actions precede optional details, and rejected semantic evidence opens with its stable failure code.
- The cross-process restart verifier is currently blocked before product-flow assertions because macOS System Events exposes no windows or sheets for the disposable VS Code process, so it cannot click the native `Allow bounded check` confirmation. Three attempts exited the extension host cleanly and removed their temporary profiles. This is a harness/accessibility limitation, not a Step 3 failure; the previously qualified restart/resume/reset evidence remains unchanged.
- All six package typechecks: passed.
- Schema export: unchanged.
- Build, VSIX package, and `git diff --check`: passed.
- Phase 4 exact review SHA: `ff0bbea30b2e502bc3c5b9287da003994fc13ce0`; all tracked Phase 4 changes are frozen there and program records remain untracked.
- The prior 684,331-byte VSIX is superseded. The final canonical artifact remains `/Users/vk/Projects/sub/apps/dwi-host/developer-work-intelligence-0.1.0.vsix`; its generated source/hash record is under `/Users/vk/Projects/sub/artifacts/vsix/` and exact values are reported in the final handoff.
- Fresh installed smoke is rerun against the sole Prompt Optimizer native view; hidden `dwi.open` compatibility continues to exercise internal Home without contributing a second visible command or view.
- Fresh clean absence → install → uninstall → absence → fresh install: `DWI_CLEAN_REINSTALL_OK`.
- Fresh `pnpm verify:extension:restart` passed against the current VSIX in an ephemeral disposable portable profile: native production consent sheets, initialization/review, deterministic Resolve/Review/save, graceful process restart, context/session restoration, optimizer-only reset, and reset persistence all passed. The verifier removes the temporary profile in `finally` (unless an explicit debug keep flag is supplied).
- The authorized main-profile target remains `/Users/vk/.vscode/extensions/dwi-poc.developer-work-intelligence-0.1.0`. Final installation verification requires that it is the single DWI package and contributes one Prompt Optimizer container with one Prompt Optimizer native view; the running VS Code window must remain open.
- Model-host verification under Node 24.18.0: 16 syntax checks, 20 active tests, and recovered simulator checks passed.
- Frozen evaluation contract SHA-256: `c8dbded44e96933bf28c92d534831136445e5b0814ded115fcb8dcff27a8272b`; corpus SHA-256: `ca88bfbad8b018e6898024df61ca3b0d221c55b8094722fb6597094763df4aa7`.
- Evaluator qualification: six focused harness tests and zero-network dry run passed; ten A/B identities, eight fake semantic paths, two no-egress fallbacks, and 30 strict request constructions were verified.
- The single live readiness request returned HTTP 200 in 5,634 ms with reported usage 14,526 input + 5 output = 14,531 tokens. It exceeded the frozen 12,000 per-call ceiling and failed closed before semantic calibration. The live lock and evidence are under `/Users/vk/Projects/sub/docs/prompt-optimizer-program/evals/runs/`.
- Semantic calibration calls: 0 of 1 after readiness. Held-out optimizer calls: 0 of 8. Fixed-executor runs: 0 of 30. No retry was performed. Actual monetary cost remains `cost_unavailable`.
- Canonical HTML: unchanged. `progress.html` remains the local design/progress artifact.
- `progress.html` passes seven local-target checks, inline JavaScript syntax, and Firefox 154.0.1 renders at 1440×1000, 1440×1800, and 1440×3600; SHA-256 `ac8f2bb9e224af64d1f009c3f5985391ed1360483330fdceec3816c07b0020f0`.
- Lint was not executable because the repository does not install `eslint`; no lint-pass claim is made.
- `pnpm verify:fixtures` was not executable because `/Users/vk/Projects/dwi-language-fixtures` is absent; no fixture-pass claim is made, and this external fixture checkout is not a Phase 4 semantic-closure substitute.

## Remaining gates

- Production semantic-plus-projection calibration remains unqualified because the readiness call exhausted the frozen per-call budget before the semantic request.
- Held-out/fixed-executor quality remains unqualified because the no-retry contract correctly prevented that lane from starting after calibration failed.
- A further live attempt requires explicit authorization to supersede the frozen no-retry contract and live lock with revised ceilings. Existing evidence must remain immutable.
- Phase 5 implementation passes 419 tests with versioned recovery, migration/downgrade coverage, dependency invalidation, optimizer-only reset gated on an exact approved/current/confirmed brief, and a serialized UTF-8 256 KiB session cap. The installed harness now passes both same-process and cross-process packaged restart/resume/reset against the same isolated profile.
- DWI-PO-0030 adds the visible Project Meta Context module, exact stale-context return, authority/reset repairs, and reset focus recovery. Commit `529516e` adds the direct installed restart verifier; `aa2a1ba` records the superseded one-container/two-view checkpoint. The later sole-view Prompt Optimizer candidate and its generated source/hash record supersede that package; exact final identifiers are reported in the handoff.
- The broad local Phase 6 matrix and packaged restart gate pass locally. Phase 6 POC qualification is complete; it does not waive Phase 4 or authorize promotion.
- The verified blocked-transition checkpoint is under `/Users/vk/Projects/sub/docs/prompt-optimizer-program/archives/2026-08-31-phase-4-blocked-transition/`.
