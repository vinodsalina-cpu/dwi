import { defineConfig } from "vitest/config";

export default defineConfig({
  root: "../../..",
  resolve: {
    alias: {
      "@platform/domain-prompt-optimizer": new URL("./src/index.ts", import.meta.url).pathname,
    },
  },
  test: {
    include: [
      "packages/domain/prompt-optimizer/src/**/*.spec.ts",
      "packages/vscode/core/src/index.spec.ts",
      "apps/ide-host/tests/prompt-optimizer-services.spec.ts",
    ],
    coverage: {
      provider: "v8",
      include: ["packages/domain/prompt-optimizer/src/**/*.ts"],
      exclude: ["**/*.spec.ts"],
      thresholds: {
        lines: 90,
        branches: 90,
      },
    },
  },
});
