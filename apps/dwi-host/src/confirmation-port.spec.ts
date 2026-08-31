import { describe, expect, it } from "vitest";
import { packagedSmokeConfirmationsEnabled } from "./confirmation-mode.js";

describe("packaged smoke confirmation boundary", () => {
  it("never bypasses confirmation in production", () => {
    expect(packagedSmokeConfirmationsEnabled(1, "1")).toBe(false);
    expect(packagedSmokeConfirmationsEnabled(2, "1")).toBe(true);
    expect(packagedSmokeConfirmationsEnabled(2, undefined)).toBe(false);
  });
});
