# Phase 5 persistence and workspace-identity inventory

Status: frozen discovery baseline on 2026-08-31 before Phase 5 product edits

## Workspace identity

`apps/dwi-host/src/workspace-identity.ts` exposes two intentionally different 24-hex SHA-256-derived identities:

- `fingerprint` uses normalized repository remote plus source root when a valid remote exists, falling back to canonical folder identity. It can remain stable across clone moves.
- `localFingerprint` always uses canonical local URI plus source root. It isolates local checkouts and is already the key used by optimizer recents, optimizer view state, consent receipts, and persisted initialization identity checks.

Phase 5 will retain `localFingerprint` as the optimizer-session key because the current persistence and consent boundaries are local-workspace scoped. A repository-stable `fingerprint` must not silently cause optimizer content to follow a project into another clone.

## Current durable seams

| Seam | Location/scope | Current payload | Bound/recovery | Phase 5 disposition |
|---|---|---|---|---|
| Workspace initialization snapshot | `.dwi/.managed/` in project | consent, project snapshot, approved brief, draft/candidate/review/evaluation/feedback | 4 MiB managed-file read cap; staged atomic swap, integrity file, generation conflict, backup recovery, corruption quarantine | Keep as initialized-project authority; remove optimizer-session payload only through additive compatibility, never by destructive migration |
| Optimizer recents | `globalState`, `dwi.promptOptimizer.recents.v1` | local fingerprint, title, prompt preview, type, source/provider/model, timestamp | 5 per workspace and 50 total; structural filtering only | Migrate metadata into bounded versioned session storage; do not broaden cross-workspace/global content exposure |
| Optimizer view | `workspaceState`, `dwi.promptOptimizer.views.v1` | `input`/`resolve`/`review` view by local fingerprint | 50 entries; invalid values restore safely | Fold into the versioned session envelope; preserve safe fallback to Input |
| Legacy prompt saved/recent records | domain V1 contracts | full draft, candidates, summaries/context metadata | strong validators and text-safety checks; no single host store currently owns them | Treat as migration inputs only where an actual host key/reader is found; do not invent persistence from dormant types |
| V2 saved/recent records | domain V2 contracts | canonical document and candidates; recent strips contexts and rekeys identity | migration helper and canonical validation exist; no live host reader/writer found | Reuse validation/migration mechanisms inside the new store rather than claiming these types are already persisted |
| Consent receipts | `globalState`, `dwi.workspaceInspectionConsent.v1` | bounded receipt by local fingerprint | current policy/scope/fingerprint checks; bounded map | Keep separate from optimizer reset; optimizer reset must never clear consent or project brief |
| Provider settings | `globalState` | endpoint/provider/model configuration; credentials handled separately | existing validation/secret ownership | Out of optimizer-session store and out of reset scope |

## Reset boundaries

`DwiWorkspaceSnapshotStore.reset()` deletes only DWI-managed initialization state and deliberately preserves `.dwi/project.yaml`, but it is a whole initialization reset and is therefore not an acceptable Phase 5 optimizer-only reset. The new reset path must clear only the matching optimizer-session envelope and derived optimizer recents/view state. It must not invoke workspace snapshot reset, clear consent receipts, provider settings, the approved project brief, or unrelated template/library state.

## Risks that require tests before implementation

- Current optimizer recents persist prompt preview text in global state. Consolidation must prevent cross-workspace reads and enforce byte limits, while retaining only content necessary for the disclosed local recovery UI.
- V2 persistence types are partly dormant. Schema presence is not evidence of a live migration source.
- `.dwi/.managed/manifest.json` currently mixes initialization and optimizer fields. An additive migration must preserve older readers and avoid erasing unknown/newer state.
- `localFingerprint` changes when a checkout moves. This is safe isolation but requires an explicit unavailable-session outcome rather than accidental repository-stable hydration.
- Corrupt global/workspace extension state must not trigger writes that overwrite the only recoverable copy.
- Generic/no-workspace sessions need a distinct bounded namespace or must remain ephemeral; they cannot share a project fingerprint.

## First implementation slice

Define and test a host-owned `dwi.promptOptimizer.sessions.v1` envelope in extension-managed storage with explicit schema, maximum entry count, per-session byte cap, exact-key validation, `localFingerprint` keying, safe unknown-version behavior, and an optimizer-only delete operation. Keep existing readers as fallback until migration and downgrade tests pass.
