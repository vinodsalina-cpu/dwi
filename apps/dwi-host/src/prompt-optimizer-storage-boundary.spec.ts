import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Prompt Optimizer storage authority", () => {
  it("keeps recents workspace-scoped after one-time legacy migration", async () => {
    const source = await readFile(new URL("./extension.ts", import.meta.url), "utf8");
    const saveStart = source.indexOf('if (command.type === "prompt.v2.record.save")');
    const saveEnd = source.indexOf("\n    const operation = await this.workspaceOperation();", saveStart + 1);
    const savePath = source.slice(saveStart, saveEnd);

    expect(saveStart).toBeGreaterThan(0);
    expect(saveEnd).toBeGreaterThan(saveStart);
    expect(savePath).toContain("updateOptimizerSession");
    expect(savePath).not.toContain("globalState.update");
    expect(source).toContain('if (migrated.status === "ready") await this.clearLegacyOptimizerState(workspaceFingerprint)');
    expect(source.match(/globalState\.update\(PROMPT_OPTIMIZER_RECENTS_KEY/g)).toHaveLength(1);
  });
});
