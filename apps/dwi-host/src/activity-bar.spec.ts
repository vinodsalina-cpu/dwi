import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

type Manifest = {
  activationEvents?: string[];
  contributes?: {
    commands?: Array<{ command?: string }>;
    viewsContainers?: { activitybar?: Array<{ id?: string; title?: string; icon?: string }> };
    views?: Record<string, Array<{ type?: string; id?: string; name?: string }>>;
  };
};

describe("Prompt Optimizer activity-bar contribution", () => {
  it("contributes a distinct view that activates and opens directly", async () => {
    const manifest = JSON.parse(
      await readFile(new URL("../package.json", import.meta.url), "utf8"),
    ) as Manifest;
    const containers = manifest.contributes?.viewsContainers?.activitybar ?? [];
    const optimizerContainer = containers.find(({ id }) => id === "dwi-prompt-optimizer-sidebar");

    expect(optimizerContainer).toEqual({
      id: "dwi-prompt-optimizer-sidebar",
      title: "Prompt Optimizer",
      icon: "media/prompt-optimizer.svg",
    });
    expect(containers.find(({ id }) => id === "dwi-sidebar")).toBeTruthy();
    expect(manifest.contributes?.views?.["dwi-prompt-optimizer-sidebar"]).toEqual([{
      type: "webview",
      id: "dwi-prompt-optimizer-view",
      name: "Prompt Optimizer",
    }]);
    expect(manifest.activationEvents).toContain("onView:dwi-prompt-optimizer-view");
    expect(manifest.contributes?.commands?.map(({ command }) => command)).toContain("dwi.openPromptOptimizer");
    await expect(readFile(new URL("../media/prompt-optimizer.svg", import.meta.url), "utf8"))
      .resolves.toContain("currentColor");
  });
});
