# Exact-tree recovery evidence

Evidence records are content-free and bind only to the named source SHA and artifact hash. Historical results do not qualify a new candidate.

## Candidate

| Field | Value |
|---|---|
| Repository | `vinodsalina-cpu/dwi` |
| Branch | `recovery/exact-tree-requalification-2026-09-03` |
| Base source SHA | `f1c69f8d713a32af0ef011946ec0a3bad28d8120` |
| Product source SHA | `5088dbf6e5fdeea2415b991c429de8e5229d7a7b` |
| Platform | Ubuntu 24.04.3, Linux x86_64 |
| Required toolchain | Node `24.18.0`; pnpm `11.17.0` |
| Ambient toolchain at Phase 0 | Node `24.19.0`; pnpm `11.19.0` — not accepted for qualification |
| Current recovery SHA | `18837b3d623d50f3f23720d7341bb942e7c96367` before this evidence update; final evidence commit pending |

## Matrix

| ID | Lane | Status | Exact evidence or boundary |
|---|---|---|---|
| R0-REFS | Remote/ref/tag/divergence | passed | 2026-09-03 fetch: `HEAD`, `origin/main`, and `origin/feature/po-05-product-hardening` = `f1c69f8d713a32af0ef011946ec0a3bad28d8120`; `HEAD...origin/main` = `0 0`; final baseline tag absent. |
| R0-TREE | Initial worktree | passed | Clean `main` before branch creation; recovery branch created from exact `origin/main`. |
| R0-ARCHIVE | Temporary walkthrough ref | passed | `origin/main-temporary-demo-archive@bb2ea52935465ec73859fb7a47af936af442d263` remains present; deletion is out of scope. |
| R0-DOCS | Program-document inventory | passed | Old context/progress/expected were contradictory historical records. They are preserved under `phases/`; the living layer is re-established without altering phase outcomes or the Phase 4 warning. |
| R0-HISTORY | Lost five-hour Sol/max run | blocked | No raw log, exact prompt, SHA, package, or verdict in Git, attachment, or retrieved DWI history. User testimony retained only as historical. |
| R0-PHASE4 | Real-provider/fixed-executor quality | blocked | Frozen historical result: 14,531 tokens > 12,000; calibration 0/1; optimizer 0/8; fixed executor 0/30; no retry. Outside recovery authorization. |
| R0-CI | Historical exact-base CI | historical | Recovery pack records GitHub Actions run `33576506566`, attempt 3, on `f1c69f8`; new branch exact-SHA CI is pending. |
| R1-TOOLCHAIN | Pinned parent/child toolchain | passed | Disposable no-output clone at `0947d4ede41b8fc0dd548b4e2a0800b650b120f0`: Node `24.18.0` and pnpm `11.17.0` resolved from the isolated toolchain for root and all six workspace children. |
| R1-INSTALL | Frozen clean-clone install | passed | `pnpm install --frozen-lockfile`, exit 0, 426 packages. Optional `keytar@7.9.0` native fallback could not extract Node headers because this filesystem rejects `fchown`; pnpm correctly treated the optional dependency as unavailable. |
| R1-TESTS | Root suite | passed | `pnpm test`, exit 0 on `0947d4e`: 48 files and 421 tests (104 prompt domain, 31 workspace domain, 66 core, 16 catalog, 172 host, 32 webview). |
| R1-TYPES | Six package typechecks | passed | Six serial package typechecks, exit 0 on `0947d4e`. |
| R1-FIXTURES | Repository-owned language fixtures | passed | First replay exposed that missing host build could yield `adapter=unavailable`; correction `18837b3` now builds and requires the adapter. Affected rerun: Go/Python/Rust, 3 fixtures, 53 checks, zero failures, three valid canonical snapshots. |
| R1-SCHEMA | Schema no-drift | passed | Export plus `git diff --exit-code -- docs/project-snapshot.schema.json`, exit 0 on `0947d4e`. |
| R1-VSIX | Build/package/archive/hygiene | passed | Intermediate exact package on clean `0947d4e`: `dwi-poc.developer-work-intelligence@0.1.0`, 387 files, 684,130 bytes, SHA-256 `0530d3e9de00b3973edb7c9483c932e9c36418a87011335d2c6428913676914c`; required files present, forbidden entries absent, tracked source clean. Final-SHA package identity is pending. |
| R1-INSTALLED | Packaged one-process functional lane | blocked | Local attempt could not enter product assertions: `xvfb-run` is absent; direct `@vscode/test-electron` resolution timed out after 15 seconds. Disposable sandbox cleanup marker passed. Exact branch CI pending. |
| R2-JOURNEY | Exact installed user journey | not run | Pending absence/install/open, initialization/review, local flow, save, reset, reinstall, compact/a11y/focus. |
| R2-SEMANTIC | Out-of-process loopback semantic/fallback/copy | not run | Pending; no real endpoint or credential permitted. |
| R3-RESTART | OS-neutral three-process continuity | not run | Harness now installs once, launches exact installed code three times with the explicit non-production confirmation adapter, requires SIGTERM exit without SIGKILL, and retains project knowledge after optimizer reset. Exact branch CI pending. |
| R3-NATIVE | Native macOS consent | blocked | Current worker is Linux; remains a distinct platform-only lane. |
| R3-MIN | VS Code `1.125.0` | not run | Separate CI row added; pending exact branch run. |
| R5-REVIEW | Independent Sol/max review | not run | Reviewer will receive final diff and raw evidence, not an intended verdict. |
| R5-CI | Exact final-SHA CI | not run | Pending pushed final review SHA. |

## Evidence record fields

Each completed lane must record: command; start/end or duration; exit code; meaningful counts/markers; full source SHA; product-source SHA; clean/dirty state; OS/architecture; Node/pnpm/VS Code versions; VSIX identity/count/bytes/SHA-256 where applicable; provider/egress state; cleanup result; log/workflow reference; and limitations/reviewer disposition.
