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

The expected versions are Node `v24.18.0` and pnpm `11.17.0`.

## Install dependencies

```sh
pnpm install --frozen-lockfile
```

## Build DWI

```sh
pnpm build
```

This builds the Prompt Optimizer domain, workspace intelligence domain, DWI core, React/Vite webview and VS Code extension host in dependency order.

## Build the VSIX

```sh
pnpm vsix
```

The installable package is created at:

```text
apps/dwi-host/developer-work-intelligence-0.1.0.vsix
```

## Install in VS Code

In VS Code, open **Extensions**, open the `...` menu, choose **Install from VSIX...**, select `apps/dwi-host/developer-work-intelligence-0.1.0.vsix`, and reload if prompted.

If the `code` command is available on your PATH, the verified CLI form is:

```sh
code --install-extension apps/dwi-host/developer-work-intelligence-0.1.0.vsix --force
```

## Start DWI

Open a project in VS Code. Select **Developer Work Intelligence** in the Activity Bar, or run **DWI: Open Developer Work Intelligence** / **Open Developer Work Intelligence** from the Command Palette.

## What to expect

DWI begins at a project-scoped consent screen. It does not perform its bounded workspace inspection until consent is granted. After approval, DWI derives a local project brief from permitted project evidence. Confirm or correct the brief, select the DWI modules needed for the task, compose project-aware guidance, and review the resulting output. Provider settings are optional and stored through VS Code's secret/configuration facilities where applicable.

## Troubleshooting

If `pnpm install --frozen-lockfile` reports a runtime mismatch, use Node 24.18.0 and pnpm 11.17.0 exactly. If packaging fails after a partial build, remove generated `dist` directories and rerun `pnpm build` followed by `pnpm vsix`. If VS Code does not show DWI after installation, confirm the VSIX installed successfully, reload VS Code, open a workspace, and run the DWI open command from the Command Palette. Build output, `.vscode-test`, and generated VSIX files are intentionally ignored and must be regenerated from source.

## Agent Troubleshooting Context

DWI is a five-workspace pnpm repository: `apps/dwi-host`, `apps/dwi-webview`, `packages/dwi-core`, `packages/domain/prompt-optimizer`, and `packages/domain/workspace`. `dwi-host` is the VS Code extension entrypoint; it assembles the built webview and the three required local runtime packages into its `dist` tree before `vsce` packages the extension. `dwi-core` depends on Prompt Optimizer; the host depends on DWI core and workspace intelligence; the webview depends on DWI core. Build/runtime must never depend on the legacy monorepo, a sibling checkout, pre-existing `dist`, or uncommitted generated files. The canonical verification path is frozen install → tests → build → VSIX → archive inspection → packaged-extension install/activation/open.
