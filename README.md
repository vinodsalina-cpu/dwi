# Prompt Optimizer

Prompt Optimizer is a VS Code extension that creates a consent-based Project Meta Context from bounded workspace evidence and uses the reviewed brief to produce project-aware prompts. Initialization and deterministic previews stay local. Provider configuration is optional and is used only when the developer explicitly chooses **Rewrite with LLM**.

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

This downloads the pinned verification build of VS Code, installs the generated VSIX into an isolated extensions directory, launches the installed extension, verifies activation, exercises its single Prompt Optimizer native view plus internal initialization journey, and exits non-zero if the smoke test fails.

## Install in VS Code

In VS Code, open **Extensions**, open the `...` menu, choose **Install from VSIX...**, select `apps/dwi-host/developer-work-intelligence-0.1.0.vsix`, and reload if prompted.

If the `code` command is available on your PATH, the verified CLI form is:

```sh
code --install-extension apps/dwi-host/developer-work-intelligence-0.1.0.vsix --force
```

## Start Prompt Optimizer

Open a project in VS Code. Select the sole **Prompt Optimizer** entry in the Activity Bar, or run **DWI: Open Prompt Optimizer** / **Open Prompt Optimizer** from the Command Palette. Home and Project Meta Context remain available inside that one view; they are not separate native Activity Bar products.

## What to expect

DWI has three distinct primary destinations. Home selects the next useful action from workspace and initialization state. Project Initializer owns bounded consent, collection, review, and persistence of the project knowledge layer. Prompt Optimizer consumes that approved layer, the selected template, and the user's task; it exposes a deterministic local preview separately from the explicit **Rewrite with LLM** action.

The webview's Activity item contains recent activity, a bounded diagnostic snapshot, privacy boundaries, and a shortcut to editor-area details. Project evidence and diagnostic dumps do not compete with the primary workflow. Provider settings remain in the separate Settings item, and Prompt Optimizer stays unavailable until both the endpoint check and a model-response check succeed.

The self-contained [interactive UI mock](mockups/dwi-workflow-redesign/index.html) remains a visual reference for density and native-feeling control composition. The living [editor-surface design system](docs/editor-surface-design-system.md) is authoritative for route ownership, state precedence, provider health, responsive behavior, focus, and editor-area handoffs.

The collector has first-party packs for Node/JavaScript/TypeScript, Python, Go, Rust/Cargo, Maven and Gradle JVM projects, .NET, Composer/PHP, CMake/Meson/Make C and C++, Shell, and Terraform/HCL. Detection is deterministic and evidence-backed. DWI does not describe an unsupported project as high-confidence, and it does not execute repository commands while collecting metadata.

For multi-root workspaces, DWI operates against the selected project root. Managed local journey state is kept in VS Code extension global storage, isolated by a local-root fingerprint, and is not written into the repository or shared automatically with another clone. The optional `.dwi/project.yaml` declaration is the only repository-local DWI state: it is designed to be checked in and is preserved across refresh and reset operations. LLM provider configuration is optional for the explicit rewrite action; credentials are handled through VS Code secret/configuration facilities, while initialization, navigation, deterministic compilation, and recovery remain provider-independent.

Use the command palette to export either the canonical JSON snapshot or a Backstage `Component` mapping. Backstage export requires an owner, component type, and lifecycle; DWI reports those missing fields instead of fabricating them.

## Project declaration

Repository and catalog declarations outrank deterministic inference for fields that require organizational knowledge, such as ownership, lifecycle, APIs, and architectural relationships. Create `.dwi/project.yaml` using the bounded schema shown in [the declaration example](docs/project-declaration.example.yaml). Unknown keys, aliases, duplicate keys, unsafe working directories, and files larger than 64 KiB are rejected.

Detector output still supplies toolchain and verification facts. Restricted probes are represented by a first-party, exact-argv allowlist, but the extension does not execute them until a host can enforce the declared read-only filesystem, disabled network, process, timeout, and output limits.

## Optional team catalog

The repository includes a small central catalog service for sharing approved snapshots and their bounded evidence bundle. Snapshots are schema-validated and encrypted at rest with AES-256-GCM; reads, writes, and lists are audited. The default executable listens only on `127.0.0.1`.

```sh
pnpm --filter @platform/dwi-catalog build
export DWI_CATALOG_ENCRYPTION_KEY='replace-with-a-long-random-secret'
export DWI_CATALOG_TOKEN='replace-with-an-access-token'
pnpm --filter @platform/dwi-catalog start
```

Then open `http://127.0.0.1:4731`. See [the architecture and operations notes](docs/architecture.md) before exposing the service beyond a developer machine.

## Repository structure

```text
apps/dwi-host/                     VS Code extension host and VSIX assembly
apps/dwi-webview/                  React/Vite sidebar webview
apps/dwi-catalog/                  Encrypted snapshot API and team portal
packages/dwi-core/                 DWI orchestration/core contracts
packages/domain/prompt-optimizer/  Prompt Optimizer domain and guidance logic
packages/domain/workspace/         Workspace/project intelligence domain
mockups/dwi-workflow-redesign/     Self-contained interactive UI mock and QA report
scripts/verify-installed-extension.mjs
                                   Packaged VSIX install/activation smoke verifier
tests/extension-host/              Installed-extension smoke test entrypoint
.github/workflows/verify.yml        Clean build/package/runtime verification
```

The build and runtime dependency closure is intentionally limited to these DWI components. It must not depend on a sibling repository, an external local workspace package, pre-existing `dist`, or undocumented generated files.

## Troubleshooting

If `pnpm install --frozen-lockfile` reports a runtime or package-manager mismatch, use Node 24.18.0 and pnpm 11.17.0 exactly. If the lockfile is reported as out of date, do not use `--no-frozen-lockfile` as a workaround; determine why `package.json`, workspace configuration, and `pnpm-lock.yaml` differ.

If packaging fails after an interrupted or partial build, remove generated `dist` directories and rerun `pnpm build` followed by `pnpm vsix`. Build output, `.vscode-test`, and generated VSIX files are intentionally ignored and must be regenerated from source.

If VS Code does not show Prompt Optimizer after installation, confirm the VSIX installed successfully, reload VS Code, open a workspace, and run **Open Prompt Optimizer** from the Command Palette. If the webview is blank or a runtime module is missing, run `pnpm vsix` again and then `pnpm verify:extension`; do not copy files manually into the installed extension.

LLM provider settings are required only for **Rewrite with LLM**, not for project initialization or the local deterministic preview. Prompt Optimizer saves provider metadata and credentials only after a connection check and a real text response from the selected model. Authentication, unavailable model, quota/balance, rate limit, timeout, and network/TLS/proxy failures remain distinct recovery states.

## Agent Troubleshooting Context

DWI contains six product workspaces: `apps/dwi-host`, `apps/dwi-webview`, `apps/dwi-catalog`, `packages/dwi-core`, `packages/domain/prompt-optimizer`, and `packages/domain/workspace`. The repository root orchestrates them with pnpm. `dwi-host` is the VS Code extension entrypoint; it assembles the built webview and required local runtime packages into its `dist` tree before `vsce` packages the extension. `dwi-core` owns the canonical snapshot and resolution contract, while `domain/workspace` owns bounded deterministic detection and safe-probe policy.

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
→ dwi.openPromptOptimizer
→ repository independence/public hygiene checks
```

When debugging, preserve the consent boundary and the complete DWI feature set. Build/runtime must never depend on the legacy monorepo, a sibling checkout, absolute machine paths, pre-existing `dist`, or uncommitted generated files. Fix the failing layer rather than deleting functionality or weakening verification.
