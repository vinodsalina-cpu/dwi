# Recovery progress

- Current phase and exact SHA: Phase 0 — baseline freeze; `HEAD=f1c69f8d713a32af0ef011946ec0a3bad28d8120`; intentional recovery-document changes are uncommitted.
- Last completed gate and evidence reference: fetched ref/tag/worktree and document inventory; see `context.md` and `recovery-evidence.md` rows `R0-REFS` through `R0-DOCS`.
- Current failure/blocker: ambient Node `24.19.0` and pnpm `11.19.0` differ from required pins; qualification must front-load isolated Node `24.18.0` and pnpm `11.17.0`. Native macOS consent is unavailable on this Linux worker. Phase 4 remains blocked by the frozen 14,531-token result.
- Next command/action: provision isolated pinned binaries, commit/push the frozen Phase 0 control layer, then execute a disposable exact-SHA clean-clone replay.
- Remaining acceptance items: pinned child-process proof; clean-clone install/tests/typechecks/schema/build/package/archive/hygiene; installed one-process journey; portable three-process persistence; loopback semantic success/failure/copy; `1.125.0` and `1.134.0` rows; independent review; exact-SHA CI; final pushed handoff.
