import { describe, expect, it } from "vitest";
import { requireWorkspaceFolder } from "./workspace-state.js";

describe("DWI workspace state", () => {
  it("makes no-workspace consent failures explicit", () => {
    expect(() => requireWorkspaceFolder(undefined)).toThrow("Open a workspace before");
  });
  it("preserves an opened workspace path", () => {
    expect(requireWorkspaceFolder({ name: "bonafide-bakes" }).name).toBe("bonafide-bakes");
  });
});
