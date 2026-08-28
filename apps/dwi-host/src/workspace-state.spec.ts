import { describe, expect, it } from "vitest";
import { requireWorkspaceFolder, runWhileWorkspaceCurrent } from "./workspace-state.js";

describe("DWI workspace state", () => {
  it("makes no-workspace consent failures explicit", () => {
    expect(() => requireWorkspaceFolder(undefined)).toThrow("Open a workspace before");
  });
  it("preserves an opened workspace path", () => {
    expect(requireWorkspaceFolder({ name: "bonafide-bakes" }).name).toBe("bonafide-bakes");
  });
  it("fences asynchronous workspace actions before and after delivery", async () => {
    let current = false;
    let calls = 0;
    await expect(runWhileWorkspaceCurrent(
      () => { if (!current) throw new Error("workspace changed"); },
      async () => { calls += 1; },
    )).rejects.toThrow("workspace changed");
    expect(calls).toBe(0);

    current = true;
    let finish: (() => void) | undefined;
    const pending = runWhileWorkspaceCurrent(
      () => { if (!current) throw new Error("workspace changed"); },
      () => {
        calls += 1;
        return new Promise<void>((resolve) => { finish = resolve; });
      },
    );
    await Promise.resolve();
    expect(calls).toBe(1);
    let chainedCalls = 0;
    const sequence = pending.then(() => runWhileWorkspaceCurrent(
      () => { if (!current) throw new Error("workspace changed"); },
      async () => { chainedCalls += 1; },
    ));
    current = false;
    finish?.();
    await expect(sequence).rejects.toThrow("workspace changed");
    expect(chainedCalls).toBe(0);
  });
});
