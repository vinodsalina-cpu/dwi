import { describe, expect, it } from "vitest";
import {
  DWI_PROJECT_DECLARATION_FILE,
  DWI_SNAPSHOT_SCHEMA,
  DwiWorkspaceSnapshotStore,
  type DwiWorkspaceSnapshot,
  type SnapshotFs,
} from "./workspace-snapshot.js";
import { workspaceIdentity } from "./workspace-identity.js";

class MemoryFs implements SnapshotFs<string> {
  readonly directories = new Set(["/workspace"]);
  readonly files = new Map<string, Uint8Array>();
  readonly symlinks = new Set<string>();
  failRenameFromPrefix: string | undefined;

  async exists(path: string) { return this.directories.has(path) || this.files.has(path) || this.symlinks.has(path); }
  async stat(path: string) {
    if (this.symlinks.has(path)) return { size: 0, isDirectory: false, isSymbolicLink: true };
    if (this.directories.has(path)) return { size: 0, isDirectory: true, isSymbolicLink: false };
    const file = this.files.get(path);
    if (file) return { size: file.byteLength, isDirectory: false, isSymbolicLink: false };
    throw new Error("missing");
  }
  async readFile(path: string) { const file = this.files.get(path); if (!file) throw new Error("missing"); return file; }
  async writeFile(path: string, content: Uint8Array) { this.files.set(path, content); }
  async readDirectory(path: string) {
    const prefix = `${path}/`;
    return [...new Set([...this.files.keys(), ...this.directories, ...this.symlinks]
      .filter((entry) => entry.startsWith(prefix))
      .map((entry) => entry.slice(prefix.length).split("/")[0]!))];
  }
  async createDirectory(path: string) { this.directories.add(path); }
  async rename(from: string, to: string) {
    if (this.failRenameFromPrefix && from.startsWith(this.failRenameFromPrefix)) {
      this.failRenameFromPrefix = undefined;
      throw new Error("injected rename failure");
    }
    if (this.files.has(from)) {
      const value = this.files.get(from)!;
      this.files.delete(from);
      this.files.set(to, value);
      return;
    }
    if (this.symlinks.has(from)) {
      this.symlinks.delete(from);
      this.symlinks.add(to);
      return;
    }
    this.directories.add(to);
    for (const [path, value] of [...this.files]) {
      if (path.startsWith(`${from}/`)) {
        this.files.delete(path);
        this.files.set(`${to}${path.slice(from.length)}`, value);
      }
    }
    for (const path of [...this.directories]) {
      if (path.startsWith(`${from}/`)) {
        this.directories.delete(path);
        this.directories.add(`${to}${path.slice(from.length)}`);
      }
    }
    this.directories.delete(from);
  }
  async delete(path: string) {
    this.files.delete(path);
    this.symlinks.delete(path);
    for (const key of [...this.files.keys()]) if (key.startsWith(`${path}/`)) this.files.delete(key);
    for (const key of [...this.symlinks]) if (key.startsWith(`${path}/`)) this.symlinks.delete(key);
    for (const key of [...this.directories]) if (key === path || key.startsWith(`${path}/`)) this.directories.delete(key);
  }
}

const paths = { join: (base: string, child: string) => `${base}/${child}` };
const utf8 = new TextEncoder();
const decode = (value: Uint8Array) => new TextDecoder().decode(value);
const identity = workspaceIdentity("file:///workspace", "workspace");
const timestamp = "2026-01-02T03:04:05.000Z";
const makeStore = (fs: MemoryFs, selectedIdentity = identity) =>
  new DwiWorkspaceSnapshotStore("/workspace", selectedIdentity, fs, paths, () => timestamp, () => "nonce");

function completed(partial: DwiWorkspaceSnapshot): DwiWorkspaceSnapshot {
  return {
    ...partial,
    status: "complete",
    stage: "evaluate",
    brief: {
      version: "dwi.brief.v1",
      projectName: "x",
      archetype: "x",
      stack: [],
      packageManager: "x",
      scripts: [],
      modules: [],
      facts: [],
      unknowns: [],
      confirmed: true,
      corrections: "",
    },
    candidate: {
      text: "x",
      selectedModuleIds: [],
      estimate: { baselineTokens: 1, optimizedTokens: 1, estimatedAvoidedDuplication: 0, method: "x" },
    },
    evaluationMarkdown: "# draft",
  };
}

describe("DWI workspace snapshot", () => {
  it("distinguishes absent, partial, complete, invalid schema, and reset", async () => {
    const fs = new MemoryFs();
    const store = makeStore(fs);
    expect((await store.load()).status).toBe("absent");
    const partial = await store.begin();
    expect((await store.load()).status).toBe("partial");
    await store.complete(completed(partial));
    expect((await store.load()).status).toBe("complete");
    await store.reset();
    expect((await store.load()).status).toBe("absent");

    await fs.createDirectory("/workspace/.dwi/.managed");
    await fs.writeFile("/workspace/.dwi/.managed/manifest.json", utf8.encode(JSON.stringify({ schema: "bad" })));
    expect((await store.load()).status).toBe("recovery");
  });

  it("persists validated prompt composition provenance with its candidate", async () => {
    const fs = new MemoryFs();
    const store = makeStore(fs);
    const partial = await store.begin();
    const snapshot = completed({
      ...partial,
      candidateInput: {
        task: "Repair checkout retries.",
        assignmentId: "bug-fix",
        promptType: "Bug fix",
        outputSize: "low",
      },
    });
    await store.complete(snapshot);
    expect(await store.load()).toEqual({
      status: "complete",
      snapshot: expect.objectContaining({ candidateInput: snapshot.candidateInput }),
    });

    const invalidFs = new MemoryFs();
    const invalidStore = makeStore(invalidFs);
    const invalidPartial = await invalidStore.begin();
    await expect(invalidStore.complete({
      ...completed(invalidPartial),
      candidateInput: {
        task: "Repair checkout retries.",
        assignmentId: "../unsafe",
        promptType: "Bug fix",
        outputSize: "low",
      },
    })).rejects.toThrow(/candidate input/i);
  });

  it("persists bounded optimizer drafts and local or provider review metadata", async () => {
    const fs = new MemoryFs();
    const store = makeStore(fs);
    const partial = await store.begin();
    const draft = { task: "Review the retry flow.", assignmentId: "general", promptType: "General" as const, outputSize: "low" as const };
    const snapshot = completed({
      ...partial,
      optimizerDraft: draft,
      optimizerReview: { source: "provider", provider: "openai", model: "gpt-4o-mini", title: "Retry review", summary: "Clarifies failure handling." },
    });
    await store.complete(snapshot);
    expect(await store.load()).toEqual({
      status: "complete",
      snapshot: expect.objectContaining({ optimizerDraft: draft, optimizerReview: snapshot.optimizerReview }),
    });

    const localFs = new MemoryFs();
    const localStore = makeStore(localFs);
    const localPartial = await localStore.begin();
    await expect(localStore.complete(completed({ ...localPartial, optimizerDraft: draft, optimizerReview: { source: "local" } }))).resolves.toBeUndefined();

    const invalidFs = new MemoryFs();
    const invalidStore = makeStore(invalidFs);
    const invalidPartial = await invalidStore.begin();
    await expect(invalidStore.complete(completed({
      ...invalidPartial,
      optimizerDraft: draft,
      optimizerReview: { source: "provider", provider: "openai", model: "" },
    }))).rejects.toThrow(/optimizer review/i);
  });

  it("leaves unrelated .dwi content untouched when starting fresh", async () => {
    const fs = new MemoryFs();
    await fs.createDirectory("/workspace/.dwi");
    await fs.writeFile("/workspace/.dwi/user-note.txt", utf8.encode("keep"));
    const store = makeStore(fs);
    expect((await store.load()).status).toBe("absent");
    await store.begin();
    expect(decode(await fs.readFile("/workspace/.dwi/user-note.txt"))).toBe("keep");
    expect((await store.load()).status).toBe("partial");
  });

  it("keeps the active snapshot when the final atomic rename fails", async () => {
    const fs = new MemoryFs();
    const store = makeStore(fs);
    const original = await store.begin();
    fs.failRenameFromPrefix = "/workspace/.dwi/.managed.staging-";
    await expect(store.updatePartial({ ...original, stage: "brief" })).rejects.toThrow(/rename failure/);
    expect(await store.load()).toEqual({ status: "partial", snapshot: original });
  });

  it("restores a validated backup after process interruption between atomic renames", async () => {
    const fs = new MemoryFs();
    const store = makeStore(fs);
    const original = await store.begin();
    await fs.rename("/workspace/.dwi/.managed", "/workspace/.dwi/.managed.backup-20260102-nonce");
    expect(await store.load()).toEqual({ status: "partial", snapshot: original });
    expect(await fs.exists("/workspace/.dwi/.managed")).toBe(true);
  });

  it("does not resurrect a stale transaction backup after reset", async () => {
    const fs = new MemoryFs();
    const store = makeStore(fs);
    await store.begin();
    await fs.createDirectory("/workspace/.dwi/.managed.backup-20260102-copy");
    for (const name of ["manifest.json", "initialization.json", "initialization.sha256", "PARTIAL"]) {
      await fs.writeFile(`/workspace/.dwi/.managed.backup-20260102-copy/${name}`, await fs.readFile(`/workspace/.dwi/.managed/${name}`));
    }
    await store.reset();
    expect(await store.load()).toEqual({ status: "absent" });
    expect(await fs.exists("/workspace/.dwi/.managed.backup-20260102-copy")).toBe(false);
  });

  it("rejects stale generations instead of overwriting newer workspace state", async () => {
    const fs = new MemoryFs();
    const firstStore = makeStore(fs);
    const secondStore = makeStore(fs);
    const original = await firstStore.begin();
    expect(original.generation).toBe(1);
    await firstStore.updatePartial({ ...original, stage: "brief" });
    await expect(secondStore.updatePartial({ ...original, stage: "compose" })).rejects.toThrow(/state changed/);
    expect(await firstStore.load()).toEqual({
      status: "partial",
      snapshot: expect.objectContaining({ stage: "brief", generation: 2 }),
    });
  });

  it("rejects tampered initialization and copied folder-bound state", async () => {
    const fs = new MemoryFs();
    const store = makeStore(fs);
    await store.begin();
    await fs.writeFile("/workspace/.dwi/.managed/initialization.json", utf8.encode("{}"));
    expect(await store.load()).toEqual({ status: "recovery", reason: "integrity-failed" });

    const cleanFs = new MemoryFs();
    await makeStore(cleanFs).begin();
    const moved = makeStore(cleanFs, workspaceIdentity("file:///moved", "moved"));
    expect(await moved.load()).toEqual({ status: "recovery", reason: "workspace-identity-mismatch" });

    const cloneFs = new MemoryFs();
    const firstClone = workspaceIdentity(
      "file:///first-clone",
      "first",
      "https://github.com/example/project.git",
    );
    const secondClone = workspaceIdentity(
      "file:///second-clone",
      "second",
      "https://github.com/example/project.git",
    );
    expect(firstClone.fingerprint).toBe(secondClone.fingerprint);
    expect(firstClone.localFingerprint).not.toBe(secondClone.localFingerprint);
    await makeStore(cloneFs, firstClone).begin();
    expect(await makeStore(cloneFs, secondClone).load()).toEqual({
      status: "recovery",
      reason: "workspace-identity-mismatch",
    });
  });

  it("preserves the checked-in project declaration across writes and reset", async () => {
    const fs = new MemoryFs();
    await fs.createDirectory("/workspace/.dwi");
    await fs.writeFile(`/workspace/.dwi/${DWI_PROJECT_DECLARATION_FILE}`, utf8.encode("apiVersion: dwi.dev/v1\nkind: Project\n"));
    const store = makeStore(fs);
    expect(await store.load()).toEqual({ status: "absent" });
    await store.begin();
    expect(decode(await fs.readFile(`/workspace/.dwi/${DWI_PROJECT_DECLARATION_FILE}`))).toContain("kind: Project");
    await store.reset();
    expect(await store.load()).toEqual({ status: "absent" });
    expect(decode(await fs.readFile(`/workspace/.dwi/${DWI_PROJECT_DECLARATION_FILE}`))).toContain("dwi.dev/v1");
  });

  it("migrates valid legacy flat state without moving the declaration", async () => {
    const fs = new MemoryFs();
    const store = makeStore(fs);
    const original = await store.begin();
    await fs.writeFile(`/workspace/.dwi/${DWI_PROJECT_DECLARATION_FILE}`, utf8.encode("kind: Project\n"));
    for (const name of ["manifest.json", "initialization.json", "initialization.sha256", "PARTIAL"]) {
      await fs.rename(`/workspace/.dwi/.managed/${name}`, `/workspace/.dwi/${name}`);
    }
    await fs.delete("/workspace/.dwi/.managed");
    expect(await store.load()).toEqual({ status: "partial", snapshot: original });
    expect(await fs.exists("/workspace/.dwi/.managed")).toBe(true);
    expect(decode(await fs.readFile(`/workspace/.dwi/${DWI_PROJECT_DECLARATION_FILE}`))).toBe("kind: Project\n");
  });

  it("rejects symlinked managed directories and files before reading", async () => {
    const outerSymlinkFs = new MemoryFs();
    outerSymlinkFs.symlinks.add("/workspace/.dwi");
    expect(await makeStore(outerSymlinkFs).load()).toEqual({ status: "recovery", reason: "unsafe-managed-path" });
    await expect(makeStore(outerSymlinkFs).begin()).rejects.toThrow(/symlinked/);

    const fileSymlinkFs = new MemoryFs();
    const store = makeStore(fileSymlinkFs);
    await store.begin();
    fileSymlinkFs.files.delete("/workspace/.dwi/.managed/manifest.json");
    fileSymlinkFs.symlinks.add("/workspace/.dwi/.managed/manifest.json");
    expect(await store.load()).toEqual({ status: "recovery", reason: "unsafe-managed-path" });
  });

  it("rejects unknown persisted fields instead of trusting webview-shaped JSON", async () => {
    const fs = new MemoryFs();
    const store = makeStore(fs);
    await store.begin();
    const path = "/workspace/.dwi/.managed/manifest.json";
    const manifest = JSON.parse(decode(await fs.readFile(path))) as Record<string, unknown>;
    manifest.injected = true;
    await fs.writeFile(path, utf8.encode(JSON.stringify(manifest)));
    expect(await store.load()).toEqual({ status: "recovery", reason: "corrupt-or-unsupported" });
    expect(DWI_SNAPSHOT_SCHEMA).toBe("dwi.workspace.snapshot.v1");
  });
});
