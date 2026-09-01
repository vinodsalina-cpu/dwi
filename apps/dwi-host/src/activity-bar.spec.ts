import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

type Manifest = {
  displayName?: string;
  description?: string;
  activationEvents?: string[];
  contributes?: {
    commands?: Array<{ command?: string; title?: string; category?: string }>;
    viewsContainers?: { activitybar?: Array<{ id?: string; title?: string; icon?: string }> };
    views?: Record<string, Array<{ type?: string; id?: string; name?: string }>>;
  };
};

describe("Prompt Optimizer activity-bar contribution", () => {
  it("exposes Prompt Optimizer as the sole native product surface", async () => {
    const manifest = JSON.parse(
      await readFile(new URL("../package.json", import.meta.url), "utf8"),
    ) as Manifest;
    const containers = manifest.contributes?.viewsContainers?.activitybar ?? [];
    expect(manifest.displayName).toBe("Prompt Optimizer");
    expect(manifest.description).not.toMatch(/\bLocal\b/);
    expect(containers).toEqual([{
      id: "dwi-sidebar",
      title: "Prompt Optimizer",
      icon: "media/prompt-optimizer.svg",
    }]);
    expect(manifest.contributes?.views?.["dwi-sidebar"]).toEqual([
      { type: "webview", id: "dwi-prompt-optimizer-view", name: "Prompt Optimizer" },
    ]);
    expect(manifest.contributes?.views?.["dwi-prompt-optimizer-sidebar"]).toBeUndefined();
    expect(manifest.activationEvents).not.toContain("onView:dwi-view");
    expect(manifest.activationEvents).toContain("onView:dwi-prompt-optimizer-view");
    const commands = manifest.contributes?.commands?.map(({ command }) => command) ?? [];
    expect(commands).toContain("dwi.openPromptOptimizer");
    expect(commands).not.toContain("dwi.open");
    const visibleBranding = JSON.stringify({
      displayName: manifest.displayName,
      description: manifest.description,
      commands: manifest.contributes?.commands,
      containers,
      views: manifest.contributes?.views,
    });
    expect(visibleBranding).not.toMatch(/Developer Workspace Intelligence|"category":"DWI"|"name":"Home"|media\/dwi\.svg/);
    await expect(readFile(new URL("../media/prompt-optimizer.svg", import.meta.url), "utf8"))
      .resolves.toContain("currentColor");
  });
});
