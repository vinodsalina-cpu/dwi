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
| R1-TOOLCHAIN | Pinned parent/child toolchain | not run | Pending isolated Node/pnpm provisioning and child-process proof. |
| R1-INSTALL | Frozen clean-clone install | not run | Pending. |
| R1-TESTS | Root suite | not run | Historical baseline is 421; current candidate pending. |
| R1-TYPES | Six package typechecks | not run | Pending. |
| R1-SCHEMA | Schema no-drift | not run | Pending. |
| R1-VSIX | Build/package/archive/hygiene | not run | Pending exact identity, count, bytes, hash, and contents. |
| R1-INSTALLED | Packaged one-process functional lane | not run | Pending; report its extension-development-path and confirmation-seam limitations. |
| R2-JOURNEY | Exact installed user journey | not run | Pending absence/install/open, initialization/review, local flow, save, reset, reinstall, compact/a11y/focus. |
| R2-SEMANTIC | Out-of-process loopback semantic/fallback/copy | not run | Pending; no real endpoint or credential permitted. |
| R3-RESTART | OS-neutral three-process continuity | not run | Pending harness separation and exact-package run. |
| R3-NATIVE | Native macOS consent | blocked | Current worker is Linux; remains a distinct platform-only lane. |
| R3-MIN | VS Code `1.125.0` | not run | Pending separate compatibility run. |
| R5-REVIEW | Independent Sol/max review | not run | Reviewer will receive final diff and raw evidence, not an intended verdict. |
| R5-CI | Exact final-SHA CI | not run | Pending pushed final review SHA. |

## Evidence record fields

Each completed lane must record: command; start/end or duration; exit code; meaningful counts/markers; full source SHA; product-source SHA; clean/dirty state; OS/architecture; Node/pnpm/VS Code versions; VSIX identity/count/bytes/SHA-256 where applicable; provider/egress state; cleanup result; log/workflow reference; and limitations/reviewer disposition.
