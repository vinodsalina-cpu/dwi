# Developer Workspace Intelligence (DWI)

Developer Workspace Intelligence is a VS Code extension that creates a local, consent-based project brief from bounded workspace evidence and uses it to provide project-aware prompt and tool guidance. Core DWI operation is local; provider configuration is optional.

## Prerequisites

- Node.js **24.18.0**
- pnpm **11.17.0**
- VS Code **1.125.0 or newer**
- Git

Node is pinned in `.nvmrc` and `.tool-versions`; pnpm is pinned in `package.json`. Select Node 24.18.0 with your normal Node version manager before continuing.

## Clone

```sh
git clone https://github.com/vinodsalina-cpu/dwi.git
cd dwi
```

## Activate the pinned package manager

```sh
corepack enable
corepack prepare pnpm@11.17.0 --activate
node --version
pnpm --version
```

Expected versions:

```text
v24.18.0
11.17.0
```

## Install dependencies

```sh
pnpm install --frozen-lockfile
```

The repository uses a narrow pnpm build-script allowlist for the dependencies that require installation scripts. Do not bypass the frozen lockfile or globally enable dependency build scripts.

## Build DWI

```sh
pnpm build
```

This builds the Prompt Optimizer domain, workspace intelligence domain, DWI core, React/Vite webview, and VS Code extension host in dependency order.

## Run the tests

```sh
pnpm test
```

The current suite covers Prompt Optimizer behavior and boundaries, workspace intelligence, DWI core, extension-host helpers, and the webview.

## Build the VSIX

```sh
pnpm vsix
```

The installable package is created at:

```text
apps/dwi-host/developer-work-intelligence-0.1.0.vsix
```

The package is assembled from compiled runtime files only. Generated source declarations, tests, coverage, caches, `.env` files, and development-only source are excluded from the VSIX.

## Verify the packaged extension

After `pnpm vsix`, run:

```sh
pnpm verify:extension
```

This downloads the pinned verification build of VS Code, installs the generated VSIX into an isolated extensions directory, launches the installed extension, verifies activation, confirms the `dwi.open` command is registered, executes it, and exits non-zero if the smoke test fails.

## Install in VS Code

In VS Code, open **Extensions**, open the `...` menu, choose **Install from VSIX...**, select `apps/dwi-host/developer-work-intelligence-0.1.0.vsix`, and reload if prompted.

If the `code` command is available on your PATH, the verified CLI form is:

```sh
code --install-extension apps/dwi-host/developer-work-intelligence-0.1.0.vsix --force
```

## Start DWI

Open a project in VS Code. Select **Developer Work Intelligence** in the Activity Bar, or run **DWI: Open Developer Work Intelligence** / **Open Developer Work Intelligence** from the Command Palette.

## What to expect

DWI begins at a project-scoped consent screen. It does not perform its bounded workspace inspection until consent is granted. After approval, DWI derives a local project brief from permitted project evidence. Confirm or correct the brief, select the DWI modules needed for the task, compose project-aware guidance, and review the resulting output.

For multi-root workspaces, DWI operates against the selected project root. Local DWI journey state is stored under `.dwi` and is intentionally ignored by Git. Provider configuration is optional; provider credentials are handled through VS Code secret/configuration facilities where applicable and are not required for the local project-intelligence flow.

## Repository structure

```text
apps/dwi-host/                     VS Code extension host and VSIX assembly
apps/dwi-webview/                  React/Vite sidebar webview
packages/dwi-core/                 DWI orchestration/core contracts
packages/domain/prompt-optimizer/  Prompt Optimizer domain and guidance logic
packages/domain/workspace/         Workspace/project intelligence domain
scripts/verify-installed-extension.mjs
                                   Packaged VSIX install/activation smoke verifier
tests/extension-host/              Installed-extension smoke test entrypoint
.github/workflows/verify.yml        Clean build/package/runtime verification
```

The build and runtime dependency closure is intentionally limited to these DWI components. It must not depend on a sibling repository, an external local workspace package, pre-existing `dist`, or undocumented generated files.

## Troubleshooting

If `pnpm install --frozen-lockfile` reports a runtime or package-manager mismatch, use Node 24.18.0 and pnpm 11.17.0 exactly. If the lockfile is reported as out of date, do not use `--no-frozen-lockfile` as a workaround; determine why `package.json`, workspace configuration, and `pnpm-lock.yaml` differ.

If packaging fails after an interrupted or partial build, remove generated `dist` directories and rerun `pnpm build` followed by `pnpm vsix`. Build output, `.vscode-test`, and generated VSIX files are intentionally ignored and must be regenerated from source.

If VS Code does not show DWI after installation, confirm the VSIX installed successfully, reload VS Code, open a workspace, and run the DWI open command from the Command Palette. If the webview is blank or a runtime module is missing, run `pnpm vsix` again and then `pnpm verify:extension`; do not copy files manually into the installed extension.

Provider settings are optional. Saving or validating local configuration must not be treated as proof that a remote provider is reachable; provider-network behavior should be diagnosed separately from the local DWI project-intelligence path.

## Agent Troubleshooting Context

DWI contains five DWI workspaces: `apps/dwi-host`, `apps/dwi-webview`, `packages/dwi-core`, `packages/domain/prompt-optimizer`, and `packages/domain/workspace`. The repository root orchestrates them with pnpm. `dwi-host` is the VS Code extension entrypoint; it assembles the built webview and the three required local runtime packages into its `dist` tree before `vsce` packages the extension. `dwi-core` depends on Prompt Optimizer; the host depends on DWI core and workspace intelligence; the webview depends on DWI core.

The canonical verification path is:

```text
fresh clone
→ Node 24.18.0 / pnpm 11.17.0
→ frozen install
→ build
→ tests
→ VSIX package
→ archive inspection
→ packaged-extension install
→ activation
→ dwi.open
→ repository independence/public hygiene checks
```

When debugging, preserve the consent boundary and the complete DWI feature set. Build/runtime must never depend on the legacy monorepo, a sibling checkout, absolute machine paths, pre-existing `dist`, or uncommitted generated files. Fix the failing layer rather than deleting functionality or weakening verification.
