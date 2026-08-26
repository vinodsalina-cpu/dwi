import { describe, expect, it } from "vitest";
import { DWI_SNAPSHOT_SCHEMA, DwiWorkspaceSnapshotStore, type SnapshotFs } from "./workspace-snapshot.js";

class MemoryFs implements SnapshotFs<string> {
  readonly directories = new Set(["/workspace"]); readonly files = new Map<string, Uint8Array>();
  async exists(path: string) { return this.directories.has(path) || this.files.has(path); }
  async readFile(path: string) { const file = this.files.get(path); if (!file) throw new Error("missing"); return file; }
  async writeFile(path: string, content: Uint8Array) { this.files.set(path, content); }
  async readDirectory(path: string) { const prefix = `${path}/`; return [...new Set([...this.files.keys(), ...this.directories].filter((entry) => entry.startsWith(prefix)).map((entry) => entry.slice(prefix.length).split("/")[0]!))]; }
  async createDirectory(path: string) { this.directories.add(path); }
  async rename(from: string, to: string) { this.directories.add(to); for (const [path, value] of [...this.files]) if (path.startsWith(`${from}/`)) { this.files.delete(path); this.files.set(`${to}${path.slice(from.length)}`, value); } this.directories.delete(from); }
  async delete(path: string) { for (const key of [...this.files.keys()]) if (key.startsWith(`${path}/`)) this.files.delete(key); for (const key of [...this.directories]) if (key.startsWith(path)) this.directories.delete(key); }
}

const paths = { join: (base: string, child: string) => `${base}/${child}` };
const utf8 = new TextEncoder();

describe("DWI workspace snapshot", () => {
  it("distinguishes absent, partial, complete, invalid schema, and reset", async () => {
    const fs = new MemoryFs(); const store = new DwiWorkspaceSnapshotStore("/workspace", fs, paths, () => "1");
    expect((await store.load()).status).toBe("absent");
    const partial = await store.begin(); expect((await store.load()).status).toBe("partial");
    await store.complete({ ...partial, status: "complete", stage: "evaluate", brief: { version: "dwi.brief.v1", projectName: "x", archetype: "x", stack: [], packageManager: "x", scripts: [], modules: [], facts: [], unknowns: [], confirmed: true, corrections: "" }, candidate: { text: "x", selectedModuleIds: [], estimate: { baselineTokens: 1, optimizedTokens: 1, estimatedAvoidedDuplication: 0, method: "x" } }, evaluationMarkdown: "# draft" }); expect((await store.load()).status).toBe("complete");
    await store.reset(); expect((await store.load()).status).toBe("absent");
    await fs.createDirectory("/workspace/.dwi"); await fs.writeFile("/workspace/.dwi/manifest.json", utf8.encode(JSON.stringify({ schema: "bad" }))); expect((await store.load()).status).toBe("recovery");
  });
  it("recovers unrecognized DWI contents when starting fresh", async () => {
    const fs = new MemoryFs(); await fs.createDirectory("/workspace/.dwi"); await fs.writeFile("/workspace/.dwi/user-note.txt", utf8.encode("keep")); const store = new DwiWorkspaceSnapshotStore("/workspace", fs, paths, () => "2");
    expect((await store.load()).status).toBe("recovery"); await store.begin(); expect(await fs.exists("/workspace/.dwi.recovered-2/user-note.txt")).toBe(true); expect((await store.load()).status).toBe("partial"); expect(DWI_SNAPSHOT_SCHEMA).toBe("dwi.workspace.snapshot.v1");
  });
});
