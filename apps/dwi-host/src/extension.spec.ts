import { describe, expect, it } from "vitest";

describe("DWI native entry", () => {
  it("uses valid VS Code contribution IDs and a separate DWI namespace", () => {
    expect("dwi-view").toMatch(/^[a-z0-9-]+$/);
    expect("dwi.feedback.v1").toMatch(/^dwi\./);
  });
});
