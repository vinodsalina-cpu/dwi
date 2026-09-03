# Exact-tree recovery runbook

Run from a disposable clone of `vinodsalina-cpu/dwi`. Replace `<candidate-sha>` with the full intended commit; never attribute a clone of moving `main` to an earlier SHA.

## Pinned toolchain and clean clone

Place isolated Node `24.18.0` and pnpm `11.17.0` binaries first on `PATH`, then prove parent and package-child resolution:

```sh
git clone https://github.com/vinodsalina-cpu/dwi.git dwi-recovery-replay
cd dwi-recovery-replay
git checkout --detach <candidate-sha>
test "$(git rev-parse HEAD)" = "<candidate-sha>"
test "$(node --version)" = "v24.18.0"
test "$(pnpm --version)" = "11.17.0"
test "$(pnpm exec node --version)" = "v24.18.0"
test "$(pnpm --filter @platform/dwi-host exec node --version)" = "v24.18.0"
pnpm install --frozen-lockfile
```

Record the resolved executable paths with `command -v node` and `command -v pnpm`. Do not use ambient wrappers merely because their major version matches.

## Deterministic and package gates

```sh
pnpm -r --if-present typecheck
pnpm test
pnpm verify:fixtures
pnpm schema:export
git diff --exit-code -- docs/project-snapshot.schema.json
pnpm vsix
git diff --check
```

Independently inspect `apps/dwi-host/developer-work-intelligence-0.1.0.vsix`: extension identity; file count; exact bytes; SHA-256; required host/webview/workspace/core/prompt-domain runtime files; and absence of source trees, specs, coverage, caches, `.env`, declarations, or TypeScript build info. Record source cleanliness before and after generated ignored output.

## Installed lanes

On Linux with a supported display:

```sh
DWI_VSCODE_VERSION=1.134.0 CI=true timeout --signal=KILL 360s xvfb-run -a pnpm verify:extension
DWI_VSCODE_VERSION=1.134.0 CI=true timeout --signal=KILL 360s xvfb-run -a pnpm verify:extension:restart
DWI_VSCODE_VERSION=1.125.0 CI=true timeout --signal=KILL 360s xvfb-run -a pnpm verify:extension
```

The first command proves absence, install, uninstall, absence, reinstall, and the full packaged-functional journey. It then uses the exact installed directory as the extension-development path plus a test-only confirmation boundary. The restart command uses the same explicit non-production boundary across three ordinary processes and fails if graceful SIGTERM needs a SIGKILL fallback. Report neither as native production-consent evidence. On macOS, run `pnpm verify:extension:native-consent` separately; it clears the adapter and does not pass an extension-development path.

Run VS Code `1.134.0` and `1.125.0` as separate rows. Use disposable user-data, extensions, workspace, and clipboard state. Validate exact cleanup paths before recursive removal and clean them in `finally`.

## Semantic loopback boundary

Start an out-of-process loopback OpenAI-compatible server selected only through ordinary base URL/model/provider settings. Drive the explicit `Rewrite with LLM` action through production `/chat/completions` transport. The server scenario is selected by harness startup, never by simulator-only product fields or headers.

Required scenarios are valid bounded current hash-bound patch/projection acceptance, malformed response, provider/transport failure, visibly labeled deterministic fallback, exact Copy prompt clipboard output, and zero external egress. This lane cannot qualify real-provider compatibility, retention, semantic usefulness, or Phase 4.

## Finalization

After corrections: rerun affected focused tests, the full clean-clone/package matrix, exact installed lanes, and independent review. Commit tracked records before exact-SHA CI. Do not mutate tracked files after the verified review SHA; put dynamic workflow links in the handoff or review system.
