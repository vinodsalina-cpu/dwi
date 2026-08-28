import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    conditions: ["platform"],
    alias: [
      {
        find: /^@platform\/domain-prompt-optimizer\/runtime$/,
        replacement: new URL(
          "../domain/prompt-optimizer/src/runtime.ts",
          import.meta.url,
        ).pathname,
      },
      {
        find: /^@platform\/domain-prompt-optimizer\/types$/,
        replacement: new URL(
          "../domain/prompt-optimizer/src/types.ts",
          import.meta.url,
        ).pathname,
      },
      {
        find: /^@platform\/domain-prompt-optimizer$/,
        replacement: new URL(
          "../domain/prompt-optimizer/src/index.ts",
          import.meta.url,
        ).pathname,
      },
    ],
  },
});
