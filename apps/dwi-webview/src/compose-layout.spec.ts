import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

describe("Compose compact layout", () => {
  it("uses a one-column narrow module frame and a compact two-column normal frame", async () => {
    const css = await readFile("src/redesign.css", "utf8");

    expect(css).toMatch(/\.module-grid\s*\{[^}]*grid-template-columns: 1fr/);
    expect(css).toMatch(/@media \(min-width: 500px\)[\s\S]*\.module-grid\s*\{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
    expect(css).toMatch(/\.module-row\s*\{[^}]*min-height: 35px/);
  });

  it("defines theme-aware activity, popover, and narrow frames", async () => {
    const css = await readFile("src/redesign.css", "utf8");

    expect(css).toContain(':root[data-theme="light"]');
    expect(css).toContain("var(--vscode-sideBar-background");
    expect(css).toMatch(/\.activity-rail\s*\{[^}]*flex-direction: column/);
    expect(css).toMatch(/\.floating-panel\s*\{[^}]*position: absolute[^}]*width: min\(355px, calc\(100% - 55px\)\)/);
    expect(css).toMatch(/\.facts\s*\{[^}]*grid-template-columns: repeat\(auto-fit, minmax\(125px, 1fr\)\)/);
    expect(css).toContain("@media (max-width: 420px)");
    expect(css).not.toContain("@media (max-width: 349px)");
    expect(css).toMatch(/\.webview-surface\s*\{[^}]*overflow-x: auto[^}]*overflow-y: hidden/);
    expect(css).toMatch(/\.shell\s*\{[^}]*min-width: 350px/);
    expect(css).not.toContain("minimum-width-fallback");
    expect(css).toMatch(/\.utility-surface\s*\{[^}]*grid-row: 1 \/ -1/);
    expect(css).toMatch(/\.provider-warning-trigger\s*\{[^}]*white-space: nowrap/);
    expect(css).toContain("@media (max-height: 540px)");
    expect(css).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
    expect(css).toMatch(/\.feedback-trigger\s*\{[^}]*min-height: 32px/);
    expect(css).toMatch(/\.activity-editor-actions\s*\{[^}]*display: grid/);
    expect(css).not.toMatch(/(?:font-size|font):\s*[89]px\b/);
    expect(css).not.toContain("color-scheme:dark");
  });

  it("keeps Step 3 compact without a nested card scroller or clipped context", async () => {
    const css = await readFile("src/redesign.css", "utf8");

    expect(css).toMatch(/\.review-card\s*\{[^}]*max-height: none[^}]*overflow: visible/);
    expect(css).toMatch(/\.review-card \.prompt-output pre\s*\{[^}]*max-height: clamp\(180px, 42vh, 360px\)[^}]*overflow: auto/);
    expect(css).toMatch(/\.review-heading-copy h1, \.review-heading-copy p\s*\{[^}]*white-space: normal/);
    expect(css).toMatch(/\.review-source\s*\{[^}]*overflow-wrap: anywhere/);
    expect(css).toMatch(/@media \(max-height: 540px\)[\s\S]*\.review-card \.prompt-output pre\s*\{[^}]*max-height: 180px/);
  });
});
