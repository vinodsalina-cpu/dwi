# Phase 5 outcome

State: POC complete locally at review SHA `afbd113`; provider and promotion authority remain closed

## Actual result

The candidate adds one bounded versioned optimizer-session authority in VS Code extension-managed workspace storage. Sessions use the existing checkout-local fingerprint and contain validated draft, candidate, review, view, and recent metadata. The envelope enforces exact keys, optimistic revisions, 50 sessions, 256 KiB of serialized UTF-8 JSON per session, five recents per session, unique workspace keys, and safe corrupt/newer-version refusal.

Existing snapshot/view/recent readers remain as rollback-compatible mirrors. One-time migration imports valid legacy state only when the new store is absent and never overwrites corrupt, newer, or already-edited state. Session hydration restores only the matching checkout. Project refresh, review approval, and brief confirmation invalidate stale optimizer recovery without clearing saved recents; full workflow reset clears the matching optimizer state.

Settings exposes a separately confirmed Prompt Optimizer reset only when the webview observes a current/partial reviewed project and confirmed brief. Host reset validation independently requires the exact approved/current project review and compilable confirmed brief, and the snapshot helper rejects ineligible state rather than promoting it into Compose. Its disclosure names the cleared draft, candidates, recents, and view and the retained approved project brief, `.dwi/project.yaml`, consent, and provider settings.

## Evidence

- 416 repository tests: 104 prompt optimizer, 31 workspace, 66 core, 16 catalog, 168 host, and 31 webview.
- All six package typechecks passed.
- Schema export remained unchanged.
- Build and VSIX packaging passed; archive includes `prompt-optimizer-session-store.js`.
- Corrected VSIX before standard-install verification: 387 files, 683,017 bytes, SHA-256 `7f9acd71af8b21fb2644a1b1382d9d0e6aa794aa9ce30e0c131367b84538349b`.
- Installed VS Code 1.134.0 smoke passed install, activation, Home open, Prompt Optimizer open, clean extension-host exit, and final marker.
- Standard VS Code 1.135.0 successfully uninstalled only `dwi-poc.developer-work-intelligence`, installed the corrected VSIX, reported identity `dwi-poc.developer-work-intelligence@0.1.0`, matched the built hashes for `extension.js`, `prompt-optimizer-session-store.js`, and `workflow-state.js`, and passed activation, Home open, and Prompt Optimizer open smoke from the installed extension path.
- Clean absence/install/uninstall/absence/reinstall passed.
- `git diff --check` passed.
- No provider, fixed-executor, credential, external CI, push, merge, tag, release, or remote action occurred.

## Final review

Review found one material dependency-invalidation defect: project refresh/re-review could leave a newly authoritative optimizer recovery record stale. The candidate now invalidates draft/candidate/review recovery on project refresh, project approval, and brief confirmation, and full workflow reset clears the matching store rather than recreating an Input view over stale content.

A later independent exact-candidate review found two additional material discrepancies. Optimizer-only reset accepted a project and brief without proving the review was current and confirmed, and the 256 KiB limit measured UTF-16 code units rather than persisted UTF-8 bytes. DWI-PO-0028 records the authorized correction: one shared host predicate now requires the exact approved project review and confirmed compilable brief, the reset helper rejects ineligible snapshots, the webview hides reset outside the corresponding ready state, and storage validation safely measures serialized UTF-8 bytes. Regression tests cover unreviewed/changed/approved reset states, exact and over-boundary ASCII, multibyte Unicode, and serialization failure.

Installed use then exposed a route-loss defect in the shared two-webview lifecycle: automatic brief-confirmed and workspace-root messages could replace an active Prompt Optimizer surface with Home. DWI-PO-0029 preserves the active optimizer for those automatic updates and explicitly selects it at rewrite dispatch and pending. The focused regression covers dispatch, both lifecycle interleavings, pending, actionable error, fallback, and result while retaining the task draft. The final 416-test suite and package gates pass; the final VSIX is 387 files / 683,053 bytes / SHA-256 `a2d93c51e30ca42666f5cf3374a69a7f1a51218b21bb0c02ea9f6f868b7dea0e`.

No known unclassified material discrepancy remains in the locally executable scope. The final candidate is split across six atomic local commits through `afbd113`.

## Closure evidence

- The final repository suite passes 419 tests: 104 prompt optimizer, 31 workspace, 66 core, 16 catalog, 171 host, and 31 webview. All six package typechecks pass.
- The installed VS Code 1.134.0 harness drives consent, bounded scan, project review, brief confirmation, provider-free deterministic Resolve, Review, save-to-recents, and optimizer-only reset while retaining Project Meta Context.
- Direct versioned-store and host/webview lifecycle suites prove restart/resume, migration, corruption, byte limits, downgrade refusal, stale revisions, exact step recovery, and cross-workspace isolation. The Electron runner cannot survive an intentional window reload, so cross-process installed automation is not claimed separately.
- Responsive browser checks pass at 320x640, 640x360, and 160x320 without horizontal overflow or console errors. Keyboard/focus reset behavior is covered directly.
- Final VSIX: 388 files, SHA-256 `cf6b400512e113d945512abce8acc93e3c93227b1eb9379cce7e5d6bf6f4adf6`; archive inspection contains the host, webview, session store, and production-fail-closed smoke confirmation gate.

Phase 4 remains blocked and semantically unqualified. Phase 5 completion does not waive that gap or authorize provider work.

## Rollback

Abandon the local Phase 5 branch to return to exact Phase 4 SHA `ff0bbea30b2e502bc3c5b9287da003994fc13ce0`. The new storage key is additive; older code ignores it and continues reading the preserved compatibility state. Unknown/newer session envelopes are never rewritten automatically.
