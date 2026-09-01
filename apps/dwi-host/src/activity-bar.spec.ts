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
  it("keeps Home and Prompt Optimizer under one DWI activity-bar icon", async () => {
    const manifest = JSON.parse(
      await readFile(new URL("../package.json", import.meta.url), "utf8"),
    ) as Manifest;
    const containers = manifest.contributes?.viewsContainers?.activitybar ?? [];
    expect(containers).toEqual([{
      id: "dwi-sidebar",
      title: "Developer Workspace Intelligence",
      icon: "media/dwi.svg",
    }]);
    expect(manifest.contributes?.views?.["dwi-sidebar"]).toEqual([
      { type: "webview", id: "dwi-view", name: "Home" },
      { type: "webview", id: "dwi-prompt-optimizer-view", name: "Prompt Optimizer" },
    ]);
    expect(manifest.contributes?.views?.["dwi-prompt-optimizer-sidebar"]).toBeUndefined();
    expect(manifest.activationEvents).toContain("onView:dwi-prompt-optimizer-view");
    expect(manifest.contributes?.commands?.map(({ command }) => command)).toContain("dwi.openPromptOptimizer");
    await expect(readFile(new URL("../media/dwi.svg", import.meta.url), "utf8"))
      .resolves.toContain("currentColor");
  });
});
