# Developer Work Intelligence (DWI)

Clean public source snapshot focused on building the DWI VS Code extension.

This repository intentionally excludes unrelated Platform applications, development fixtures, evidence tooling, generated outputs, `node_modules`, and other material not required for the DWI VSIX build.

## Build

Requires Node.js 22.16.0 and pnpm 11.17.0.

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm dwi:vsix
```

The VSIX packaging entry point is `@platform/dwi-host`.
