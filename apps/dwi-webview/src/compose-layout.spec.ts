import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

describe("Compose compact layout", () => {
  it("uses a two-column normal frame and a one-column narrow fallback", async () => {
    const css = await readFile("src/compose.css", "utf8");

    expect(css).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
    expect(css).toMatch(/@media \(max-width: 560px\)[\s\S]*grid-template-columns: 1fr/);
    expect(css).not.toContain("overflow: auto");
  });
});
