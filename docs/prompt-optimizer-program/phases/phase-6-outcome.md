# Phase 6 local POC qualification outcome

State: broad local qualification complete; real-provider, held-out semantics, promotion, merge, and tag remain pending separate authority

## Qualified matrix

- Fresh build, schema export, six typechecks, 419 repository tests, VSIX package/inspection, install, activation, `dwi.open`, and Prompt Optimizer open pass.
- The installed package completes initialization and consent, Project Meta Context review/approval, local deterministic Resolve and Review, save-to-recents, and scoped optimizer reset without a configured provider.
- Persistence tests cover restart/resume units, exact Input/Resolve/Review recovery, stale result rejection, optimistic revision conflict, corruption, serialized UTF-8 limits, one-time migration, unknown-version downgrade refusal, workspace isolation, and reset preservation.
- Semantic/failure tests cover malformed JSON/schema, timeout, cancellation, delayed/stale completion, wrong hash, locked section, secret-like patch, authentication, rate limit, truncation, invalid telemetry, refusal/safety boundaries, quota/model/transport/connectivity mappings, and the three-call ceiling with no fourth reservation.
- Source and privacy tests cover consent, stale reviewed knowledge, conflicts/contradictions, provenance, secret/absolute-path rejection, invalid encoding, bounded inspection, provider credential isolation, redirect refusal, and provider-unavailable deterministic fallback. Navigation and deterministic compilation do not invoke the provider port.
- Atomic snapshot tests cover interrupted rename recovery, failed final rename rollback, stale-backup suppression after reset, copied/tampered state rejection, symlink rejection, and declaration preservation.
- External deterministic model-host qualification passes 16 syntax checks, 20 tests, and recovered success/auth/rate-limit simulator scenarios. No real-provider or fixed-executor call occurred.
- Independent adversarial review findings were repaired: stale-context route loss, competing recovery authority, reset ordering/remigration, reset keyboard recovery, and global recents duplication. A final exact-tree review is required before any later promotion decision.

## Evidence boundary

The installed harness proves the full functional flow in one VS Code process. Restart/resume is proved by direct storage and lifecycle integration suites because `@vscode/test-electron` exits with failure when the test intentionally reloads its window; no separate cross-process installed-runtime claim is made. Reinstall activation is qualified, but reinstall-with-session-retention is not claimed.

The Phase 4 readiness response remains preserved at 14,531 tokens against the immutable 12,000 ceiling. This phase neither retries nor alters that evidence. Real-provider compatibility, held-out semantic evaluation, fixed-executor comparison, merge, baseline promotion, and tagging remain later authority decisions.

## Rollback

Rollback remains the exact Phase 4 safety checkpoint `ff0bbea30b2e502bc3c5b9287da003994fc13ce0`. The optimizer-session key is additive; older code ignores it, unknown/newer envelopes fail closed, and project declarations survive optimizer reset.
