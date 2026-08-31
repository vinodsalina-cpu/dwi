# Phase 4 outcome

State: blocked after the single authorized no-retry calibration exceeded its frozen token ceiling

## Actual result

The local worktree implements one explicit semantic call through the host-owned provider adapter, strict V2 patch validation, deterministic compile, content-free traces, and fail-closed local fallback. The same call now requires a strict snake_case engineering token-cost projection with internally reconciled totals/deltas, supplied-metadata allowlisting, optional validated pricing, assumptions, uncertainty/confidence, routing disclosure, deterministic refined prompt, and same-ID telemetry reconciliation. Optimizer-call telemetry remains explicitly distinct from downstream task-execution telemetry.

Aggregate projection context is exact-key, bounded, and secret-rejecting before serialization. Invalid context cannot invoke the provider; model-authored actual-route claims are not trusted; host-observed routing is authoritative; invalid usage telemetry fails closed. Review correctly labels positive savings, negative additions, and zero change.

The Input UI has heading-only accessible context help, a taller editor, controls outside the editor, Criticality Low/Medium/High, and reserved `auto` support. Review is height-bounded, scrollable, truncates title/subtext accessibly, preserves prompt content, and displays projection evidence.

The package now contributes Prompt Optimizer as its own native VS Code activity-bar container/view/icon/command and opens that view directly on the optimizer surface. The original DWI activity item remains separate. This corrects an earlier record that had conflated the internal webview rail with a native activity-bar item.

## Local evidence

- Focused tests: domain semantic/projection 69; host transport/activity 24; webview UI 6.
- Full repository suite: 402 passed (prompt optimizer 104, workspace 31, core 66, catalog 16, host 154, webview 31).
- All package typechecks, unchanged schema export, build, and `git diff --check`: passed.
- Exact local review SHA: `ff0bbea30b2e502bc3c5b9287da003994fc13ce0`; the 27 committed paths contain no program records and the tracked tree remained clean after qualification.
- Current VSIX: `/Users/vk/Projects/sub/apps/dwi-host/developer-work-intelligence-0.1.0.vsix`; 678,514 bytes; SHA-256 `cee97fcbb7b2292a684c676033d1ec2c5e1532ad5415fdfcb01725ef26965530`.
- Installed smoke: `DWI_SMOKE_INSTALL_OK`, `DWI_SMOKE_ACTIVATED`, `DWI_SMOKE_OPEN_OK`, `DWI_SMOKE_PROMPT_OPTIMIZER_OPEN_OK`, extension-host exit 0, `DWI_SMOKE_EXTENSION_HOST_OK`.
- Clean absence/install/uninstall/absence/fresh-install: `DWI_CLEAN_REINSTALL_OK`.
- Model-host verification under Node 24.18.0 passed 16 syntax checks, 20 active tests, and recovered simulator checks.
- Evaluation harness: six tests and the final zero-network dry run passed. Contract SHA-256 `c8dbded44e96933bf28c92d534831136445e5b0814ded115fcb8dcff27a8272b`; corpus SHA-256 `ca88bfbad8b018e6898024df61ca3b0d221c55b8094722fb6597094763df4aa7`.
- Authorized live attempt: the one readiness request returned HTTP 200 in 5,634 ms with reported usage 14,526 input + 5 output = 14,531 tokens. This exceeded the frozen 12,000 per-call ceiling and failed closed. The semantic calibration request, eight held-out optimizer calls, and 30 fixed-executor runs were not made. No retry occurred; actual monetary cost remains `cost_unavailable`.
- Updated `progress.html` passes seven local-target checks, inline JavaScript syntax, and Firefox 154.0.1 renders at 1440×1000, 1440×1800, and 1440×3600; SHA-256 `ac8f2bb9e224af64d1f009c3f5985391ed1360483330fdceec3816c07b0020f0`.
- Lint was unavailable because `eslint` is not installed; no lint-pass claim is made.
- `pnpm verify:fixtures` could not run because `/Users/vk/Projects/dwi-language-fixtures` is absent; no fixture-pass claim is made.
- Fresh current re-verification passed all 402 tests, all six typechecks, unchanged schema, build/VSIX, installed Home and Prompt Optimizer smoke, and the full clean-reinstall sequence. P4-W001 is resolved.

## Discrepancies and remaining gates

- Fixed-executor held-out semantic-quality evidence is not available because the frozen calibration stop condition fired before the comparison.
- Real semantic-plus-projection compatibility is not demonstrated. The readiness endpoint responded, but no production semantic request was permitted after the budget violation.
- The failed live lock and evidence are immutable. A second attempt requires explicit authorization for a superseding no-retry contract with revised ceilings; thresholds may not be silently changed.
- No interactive click-through browser session was available; Firefox rendering, static link/script checks, and packaged webview interaction tests passed.

These are mandatory Phase 4 closure items, so Phase 4 is not complete. Phase 5 remains closed.

Phase status: Phase 0 DONE; Phases 1–3 DONE locally; Phase 4 BLOCKED — no-retry calibration budget exceeded and fixed evaluation not started; Phases 5–7 not started.

## Rollback

Before merge, abandon the isolated branch or create a normal revert of `ff0bbea30b2e502bc3c5b9287da003994fc13ce0`; do not rewrite shared history. The Phase 3 commit `2e24151fff2a6b8836e79a96dc83205aa6870809` remains the recoverable predecessor. Local program records are preserved separately.
