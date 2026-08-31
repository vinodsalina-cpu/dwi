# Phase 4 warning record

## P4-W001 — current local runtime re-verification unavailable

- Date: 2026-08-31
- Task: Re-run Phase 4 exact-review-SHA local repository and packaged-extension gates for `ff0bbea30b2e502bc3c5b9287da003994fc13ce0`.
- Status: resolved — fresh current-environment rerun passed.
- Reason: The current sandbox denied the catalog HTTP test server's loopback bind (`listen EPERM 127.0.0.1`). Host/webview tests, package typechecks, schema stability, build, VSIX packaging, archive inspection, and diff checks passed. Two bounded `pnpm verify:extension` attempts installed the VSIX then aborted before DWI activation/open with `SIGABRT` after Electron `task_name_for_pid` / codesign failure; no DWI-specific log was produced.
- Risk: The current environment cannot independently reproduce the root catalog and installed-extension gates for this run. Earlier exact-candidate evidence remains historical evidence only; it must not be silently represented as a fresh rerun.
- Resolution: The fresh root suite passed all 402 tests, including the 16 catalog tests. VS Code 1.134.0 installed smoke passed activation, Home open, distinct Prompt Optimizer open, clean extension-host exit, and the final marker. The fresh absence/install/uninstall/absence/fresh-install sequence passed. Current VSIX SHA-256 is `cee97fcbb7b2292a684c676033d1ec2c5e1532ad5415fdfcb01725ef26965530`.
- Owner signature: Codex local session, 2026-08-31.

## P4-W002 — frozen calibration budget exceeded

- Date: 2026-08-31
- Task: Run the one authorized no-retry calibration, then the frozen ten-case A/B/C comparison only if calibration passes.
- Status: open — mandatory Phase 4 closure blocker.
- Reason: The readiness request returned HTTP 200 in 5,634 ms but reported 14,531 tokens, exceeding the frozen 12,000 per-completion ceiling. The budget rejected the response after recording it. The semantic calibration request and all held-out/fixed-executor requests were not made.
- Risk: Basic endpoint response does not establish production semantic-plus-projection compatibility or semantic quality. Raising the ceiling or retrying after observing the result would violate the frozen contract.
- Required integration: Preserve `/Users/vk/Projects/sub/docs/prompt-optimizer-program/evals/runs/.phase-4-live-attempt.json` and the live evidence directory. Obtain explicit authorization for any superseding no-retry contract and empirically justified ceilings before another provider request.
- Owner signature: Codex local session, 2026-08-31.

## Terminal evidence still required

Production semantic-plus-projection calibration and the held-out fixed-executor quality comparison remain independent Phase 4 closure gates. Their contracts are frozen, but the no-retry calibration stopped at P4-W002 before either could complete.

Phase status: Phase 0 DONE; Phases 1–3 DONE locally; Phase 4 BLOCKED — P4-W002 and terminal semantic evidence remain open; Phases 5–7 not started.
